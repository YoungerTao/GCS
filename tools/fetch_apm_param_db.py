#!/usr/bin/env python3
"""
从 ArduPilot 官方 autotest 站点下载各机型 apm.pdef.json，合并为地面站可用的参数说明库。

数据源（官方维护，随固件更新）：
  https://autotest.ardupilot.org/Parameters/ArduCopter/apm.pdef.json
  https://autotest.ardupilot.org/Parameters/ArduPlane/apm.pdef.json
  https://autotest.ardupilot.org/Parameters/Rover/apm.pdef.json
  https://autotest.ardupilot.org/Parameters/ArduSub/apm.pdef.json

输出：JS/data/apm-param-db.json
  每条：PARAM_NAME → { "n", "d", "u", "rb", "src", "grp", "grpBySrc" }

合并规则：同名参数保留「说明字段 d 更长」的一条；长度相同时保留显示名 n 更长的一条。
grpBySrc 始终合并各机型命名空间（支持参数树 Scheme C）。

中文高质量翻译流程（仅 d「说明」字段，reviewable）：
  1. python tools/fetch_apm_param_db.py          # 产出英文 + grp
  2. python translate_params_ai.py --review      # 仅 d，生成 review JSON
  3. 人工 review tools/translation-review/*.json
  4. python tools/apply-reviewed-translations.py <review-file>   # 合并到 cache + db

用法（在项目根目录执行）：
  python tools/fetch_apm_param_db.py
  python tools/fetch_apm_param_db.py --offline   # 不联网，仅用 tools/build 下已缓存的 json 再合并
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from pathlib import Path

# (显示用机型名, 官方 JSON 地址)
SOURCES = [
    ("Copter", "https://autotest.ardupilot.org/Parameters/ArduCopter/apm.pdef.json"),
    ("Plane", "https://autotest.ardupilot.org/Parameters/ArduPlane/apm.pdef.json"),
    ("Rover", "https://autotest.ardupilot.org/Parameters/Rover/apm.pdef.json"),
    ("Sub", "https://autotest.ardupilot.org/Parameters/ArduSub/apm.pdef.json"),
]

# 参数名：大写字母开头，后续为大写字母、数字、下划线（与常见 ArduPilot 命名一致）
PARAM_KEY_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")


def is_param_block(obj: object) -> bool:
    return isinstance(obj, dict) and ("Description" in obj or "DisplayName" in obj)


def iter_param_blocks(root: object) -> dict[str, tuple[dict, str]]:
    """遍历 pdef 根对象，收集 (参数块, 官方命名空间 grp)。"""
    out: dict[str, tuple[dict, str]] = {}
    if not isinstance(root, dict):
        return out

    def walk(node: dict, grp: str) -> None:
        for key, val in node.items():
            if not isinstance(val, dict):
                continue
            if is_param_block(val):
                if isinstance(key, str) and PARAM_KEY_RE.match(key):
                    out[key] = (val, grp)
            else:
                child_grp = key if isinstance(key, str) else ""
                walk(val, child_grp)

    walk(root, "")
    return out


def bitmask_lines(block: dict) -> list[str]:
    """将位掩码元数据格式化为多行文本，追加到说明中。"""
    bm = block.get("Bitmask")
    if not isinstance(bm, dict):
        return []
    lines = []
    for bit, label in sorted(bm.items(), key=lambda x: int(x[0]) if str(x[0]).isdigit() else 0):
        lines.append(f"  位{bit}: {label}")
    return lines


def values_lines(block: dict) -> list[str]:
    """将离散取值元数据格式化为多行文本。"""
    vals = block.get("Values")
    if not isinstance(vals, dict):
        return []
    lines = []
    for vk, vv in vals.items():
        lines.append(f"  {vk}: {vv}")
    return lines


def range_line(block: dict) -> str | None:
    """从 Range 字段生成一行中文范围说明。"""
    r = block.get("Range")
    if not isinstance(r, dict):
        return None
    lo, hi = r.get("low"), r.get("high")
    if lo is None and hi is None:
        return None
    return f"范围: {lo} … {hi}"


def enrich_description(block: dict) -> str:
    """拼接 Description 与范围/取值/位定义，作为写入 JSON 的 d 字段。"""
    parts: list[str] = []
    d = block.get("Description")
    if isinstance(d, str) and d.strip():
        parts.append(d.strip())

    extra: list[str] = []
    rl = range_line(block)
    if rl:
        extra.append(rl)
    vl = values_lines(block)
    if vl:
        extra.append("取值:\n" + "\n".join(vl))
    bl = bitmask_lines(block)
    if bl:
        extra.append("位定义:\n" + "\n".join(bl))

    if extra:
        parts.append("\n".join(extra))
    return "\n\n".join(parts) if parts else ""


def slim_entry(name: str, block: dict, src: str, grp: str) -> dict:
    """将官方单条 pdef 压缩为输出 JSON 中的一条记录。"""
    dn = block.get("DisplayName")
    display = dn.strip() if isinstance(dn, str) else ""
    desc = enrich_description(block)
    units = block.get("Units")
    u = units.strip() if isinstance(units, str) and units.strip() else None
    reboot = block.get("RebootRequired")
    rb = None
    if isinstance(reboot, str) and reboot.lower() == "true":
        rb = True
    entry: dict = {
        "n": display or name,
        "d": desc,
        "src": src,
        "grp": grp,
        "grpBySrc": {src: grp},
    }
    if u:
        entry["u"] = u
    if rb:
        entry["rb"] = True
    return entry


def merge_entries(merged: dict[str, dict], name: str, entry: dict) -> None:
    """同名参数合并：优先保留说明更长的条目；grpBySrc 始终合并。"""
    if name not in merged:
        merged[name] = entry
        return
    old = merged[name]
    grp_by = {**(old.get("grpBySrc") or {}), **(entry.get("grpBySrc") or {})}
    ld, nd = len(old.get("d") or ""), len(entry.get("d") or "")
    pick_new = nd > ld or (nd == ld and len(entry.get("n") or "") > len(old.get("n") or ""))
    base = entry if pick_new else old
    merged[name] = {**base, "grpBySrc": grp_by}


def download(url: str, dest: Path, offline: bool) -> dict | None:
    """下载 JSON 到 dest 并解析；offline 模式下仅读取已存在的缓存文件。"""
    if offline:
        if dest.is_file():
            return json.loads(dest.read_text(encoding="utf-8"))
        print(f"[跳过] 离线模式且无缓存文件: {dest}", file=sys.stderr)
        return None
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"请求 {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "GCS-param-db-fetch/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        raw = resp.read()
    dest.write_bytes(raw)
    return json.loads(raw.decode("utf-8"))


def main() -> int:
    ap = argparse.ArgumentParser(description="拉取并合并 ArduPilot 官方参数说明 JSON。")
    ap.add_argument(
        "--offline",
        action="store_true",
        help="不访问网络，只读取 tools/build 目录下已下载的 apm.pdef.*.json 再合并",
    )
    ap.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "JS" / "data" / "apm-param-db.json",
        help="输出文件路径（默认 JS/data/apm-param-db.json）",
    )
    args = ap.parse_args()

    cache_dir = Path(__file__).resolve().parent / "build"
    cache_dir.mkdir(parents=True, exist_ok=True)

    merged: dict[str, dict] = {}
    for label, url in SOURCES:
        cache = cache_dir / f"apm.pdef.{label.lower()}.json"
        try:
            data = download(url, cache, args.offline)
        except Exception as e:
            print(f"[错误] {label}: {e}", file=sys.stderr)
            if cache.is_file():
                print(f"       改用本地缓存: {cache}", file=sys.stderr)
                data = json.loads(cache.read_text(encoding="utf-8"))
            else:
                continue
        if data is None:
            continue
        blocks = iter_param_blocks(data)
        print(f"  {label}: {len(blocks)} 条参数")
        for pname, (block, grp) in blocks.items():
            entry = slim_entry(pname, block, label, grp)
            merge_entries(merged, pname, entry)

    if not merged:
        print("未解析到任何参数元数据。", file=sys.stderr)
        return 1

    args.out.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(merged, ensure_ascii=False, separators=(",", ":"))
    args.out.write_text(text, encoding="utf-8")
    kb = len(text) // 1024
    print(f"已写入 {args.out}（共 {len(merged)} 条，约 {kb} KiB）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
