#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将 JS/data/apm-param-db.json 中参数显示名 n 与说明 d 译为中文。

- 按「原文去重」翻译，减少请求次数（约 2900 条唯一说明量级）。
- 进度写入 JS/data/apm-param-translate-cache.json，可反复运行续翻。
- 首次运行前若不存在 apm-param-db.en.json，则从当前库复制一份英文备份。

依赖：pip install deep-translator
"""

from __future__ import annotations

import argparse
import json
import shutil
import time
from pathlib import Path
from typing import Any

try:
    from deep_translator import GoogleTranslator, MyMemoryTranslator
except ImportError:
    GoogleTranslator = None  # type: ignore
    MyMemoryTranslator = None  # type: ignore

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "JS" / "data" / "apm-param-db.json"
CACHE_PATH = ROOT / "JS" / "data" / "apm-param-translate-cache.json"
BACKUP_PATH = ROOT / "JS" / "data" / "apm-param-db.en.json"

# 单次请求过长时按块翻译（字符级，保守上限）
CHUNK_CHARS = 4200


def zh_ratio(s: str) -> float:
    if not s:
        return 0.0
    zh = sum(1 for c in s if "\u4e00" <= c <= "\u9fff")
    return zh / len(s)


def needs_translation(s: str, *, for_description: bool) -> bool:
    """说明 d：已有较多中文的条目跳过整段机翻。显示名 n：含明显中文则视为已本地化，避免二次机翻或误键入。"""
    s = (s or "").strip()
    if not s:
        return False
    z = zh_ratio(s)
    if for_description:
        return len(s) > 8 and z < 0.18
    # 显示名极少含汉字；一旦出现（含半机翻串如「ACCEL1 失败」）不再送译
    if z >= 0.08:
        return False
    return True


def _translate_google_chunks(translator: Any, text: str) -> str:
    text = text.strip()
    if not text or zh_ratio(text) >= 0.5:
        return text
    if len(text) <= CHUNK_CHARS:
        return translator.translate(text)
    paras = text.split("\n\n")
    buf: list[str] = []
    cur: list[str] = []
    cur_len = 0
    for p in paras:
        pl = len(p) + (2 if cur else 0)
        if cur and cur_len + pl > CHUNK_CHARS:
            buf.append(translator.translate("\n\n".join(cur)))
            cur = [p]
            cur_len = len(p)
        else:
            cur.append(p)
            cur_len += pl
    if cur:
        buf.append(translator.translate("\n\n".join(cur)))
    return "\n\n".join(buf)


def _translate_mymemory_fallback(text: str) -> str:
    """Google 无结果或限流时的备用（短句效果好；长文按块拼接）。"""
    if MyMemoryTranslator is None:
        return text
    text = text.strip()
    if not text:
        return text
    mm = MyMemoryTranslator(source="english", target="chinese simplified")
    max_seg = 450
    if len(text) <= max_seg:
        return mm.translate(text)
    parts_out: list[str] = []
    for para in text.split("\n\n"):
        if len(para) <= max_seg:
            parts_out.append(mm.translate(para))
            time.sleep(0.35)
            continue
        start = 0
        while start < len(para):
            chunk = para[start : start + max_seg]
            parts_out.append(mm.translate(chunk))
            start += max_seg
            time.sleep(0.35)
    return "\n\n".join(parts_out)


def translate_entry(google: Any, text: str, *, mymemory_only: bool) -> str | None:
    text = text.strip()
    if not text or zh_ratio(text) >= 0.5:
        return text
    if mymemory_only:
        try:
            return _translate_mymemory_fallback(text)
        except Exception:
            return None
    try:
        return _translate_google_chunks(google, text)
    except Exception:
        pass
    try:
        return _translate_mymemory_fallback(text)
    except Exception:
        return None


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, obj: object) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def collect_strings(data: dict) -> tuple[set[str], set[str]]:
    need_n: set[str] = set()
    need_d: set[str] = set()
    for v in data.values():
        if not isinstance(v, dict):
            continue
        n = v.get("n")
        d = v.get("d")
        if isinstance(n, str) and needs_translation(n, for_description=False):
            need_n.add(n.strip())
        if isinstance(d, str) and needs_translation(d, for_description=True):
            need_d.add(d.strip())
    return need_n, need_d


def apply_cache(data: dict, cache: dict[str, str]) -> None:
    for v in data.values():
        if not isinstance(v, dict):
            continue
        n = v.get("n")
        if isinstance(n, str):
            k = n.strip()
            if k in cache:
                v["n"] = cache[k]
        d = v.get("d")
        if isinstance(d, str):
            k = d.strip()
            if k in cache:
                v["d"] = cache[k]


def main() -> None:
    ap = argparse.ArgumentParser(description="Translate apm-param-db.json n/d to zh-CN")
    ap.add_argument("--limit", type=int, default=0, help="最多新翻译多少条唯一原文（0 表示全部）")
    ap.add_argument("--no-backup", action="store_true", help="不创建 apm-param-db.en.json 备份")
    ap.add_argument("--sleep", type=float, default=0.22, help="每条请求后的休眠秒数，降频防限流")
    ap.add_argument(
        "--mymemory-only",
        action="store_true",
        help="仅用 MyMemory（不访问 Google；适合无法直连 Google 的网络环境）",
    )
    args = ap.parse_args()

    if GoogleTranslator is None and not args.mymemory_only:
        raise SystemExit("请先安装: pip install deep-translator")
    if MyMemoryTranslator is None:
        raise SystemExit("deep-translator 不完整，请重新安装: pip install -U deep-translator")

    if not DB_PATH.is_file():
        raise SystemExit(f"找不到参数库: {DB_PATH}")

    data = load_json(DB_PATH)
    if not isinstance(data, dict):
        raise SystemExit("apm-param-db.json 根节点不是对象")

    if not args.no_backup and not BACKUP_PATH.is_file():
        shutil.copy2(DB_PATH, BACKUP_PATH)
        print(f"已备份英文库: {BACKUP_PATH}", flush=True)

    cache: dict[str, str] = {}
    if CACHE_PATH.is_file():
        try:
            raw = load_json(CACHE_PATH)
            if isinstance(raw, dict):
                cache = {str(k): str(v) for k, v in raw.items()}
        except Exception:
            cache = {}

    need_n, need_d = collect_strings(data)
    all_need = sorted(need_n | need_d)
    pending_full = [s for s in all_need if s not in cache]
    pending = pending_full[: args.limit] if (args.limit and args.limit > 0) else pending_full

    print(
        f"参数条目: {len(data)} | 需译唯一 n: {len(need_n)} d: {len(need_d)} | "
        f"缓存条数: {len(cache)} | 未缓存待译: {len(pending_full)}"
        + (f" | 本批条数: {len(pending)}" if (args.limit and args.limit > 0) else ""),
        flush=True,
    )

    translator = GoogleTranslator(source="en", target="zh-CN") if not args.mymemory_only else None
    done = 0
    for i, src in enumerate(pending):
        out = translate_entry(translator, src, mymemory_only=args.mymemory_only)
        if out is None:
            print(
                f"[{i + 1}/{len(pending)}] 翻译跳过（网络失败或无可用引擎）: {src[:72]!r}…",
                flush=True,
            )
            continue
        cache[src] = out
        done += 1

        if done % 25 == 0:
            save_json(CACHE_PATH, cache)
            apply_cache(data, cache)
            save_json(DB_PATH, data)
            print(f"  已写入进度 {done}/{len(pending)} …", flush=True)

        time.sleep(max(0.0, args.sleep))

    save_json(CACHE_PATH, cache)
    apply_cache(data, cache)
    save_json(DB_PATH, data)
    print(f"完成。新译 {done} 条，已更新 {DB_PATH} 与缓存 {CACHE_PATH}", flush=True)


if __name__ == "__main__":
    main()
