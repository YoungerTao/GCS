#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Translate ArduPilot parameter metadata with the OpenAI Responses API.

This script reads English source strings from JS/data/apm-param-db.en.json,
translates them into Simplified Chinese in batches, caches results locally,
and writes the merged output back to JS/data/apm-param-db.json.

Environment:
  OPENAI_API_KEY   Required.

Example:
  python translate_params_ai.py --model gpt-5.4-mini --limit 200
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "JS" / "data" / "apm-param-db.json"
SOURCE_PATH = ROOT / "JS" / "data" / "apm-param-db.en.json"
LEGACY_CACHE_PATH = ROOT / "JS" / "data" / "apm-param-translate-cache.json"
AI_CACHE_PATH = ROOT / "JS" / "data" / "apm-param-translate-cache.ai.json"
BACKUP_OUT_PATH = ROOT / "JS" / "data" / "apm-param-db.pre-ai-backup.json"

DEFAULT_MODEL = "gpt-5.4-mini"
DEFAULT_BATCH_SIZE = 24
API_URL = "https://api.openai.com/v1/responses"


def zh_ratio(text: str) -> float:
    if not text:
        return 0.0
    zh = sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")
    return zh / len(text)


def needs_translation(text: str, *, for_description: bool) -> bool:
    text = (text or "").strip()
    if not text:
        return False
    ratio = zh_ratio(text)
    if for_description:
        return len(text) > 8 and ratio < 0.18
    return ratio < 0.08


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, obj: object) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def collect_strings(data: dict[str, Any], fields: str) -> list[dict[str, str]]:
    collected: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    include_n = fields in {"n", "both"}
    include_d = fields in {"d", "both"}

    for value in data.values():
        if not isinstance(value, dict):
            continue
        if include_n:
            name = value.get("n")
            if isinstance(name, str) and needs_translation(name, for_description=False):
                key = ("n", name.strip())
                if key not in seen:
                    seen.add(key)
                    collected.append({"field": "n", "source": name.strip()})
        if include_d:
            desc = value.get("d")
            if isinstance(desc, str) and needs_translation(desc, for_description=True):
                key = ("d", desc.strip())
                if key not in seen:
                    seen.add(key)
                    collected.append({"field": "d", "source": desc.strip()})
    return collected


def apply_cache(data: dict[str, Any], cache: dict[str, str]) -> None:
    for value in data.values():
        if not isinstance(value, dict):
            continue
        for field in ("n", "d"):
            src = value.get(field)
            if isinstance(src, str):
                key = f"{field}\t{src.strip()}"
                if key in cache:
                    value[field] = cache[key]


def build_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "id": {"type": "string"},
                        "translation": {"type": "string"},
                    },
                    "required": ["id", "translation"],
                },
            }
        },
        "required": ["items"],
    }


def extract_output_text(response_json: dict[str, Any]) -> str:
    output_text = response_json.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text

    output = response_json.get("output")
    if isinstance(output, list):
        chunks: list[str] = []
        for item in output:
            if not isinstance(item, dict):
                continue
            content = item.get("content")
            if not isinstance(content, list):
                continue
            for part in content:
                if not isinstance(part, dict):
                    continue
                text = part.get("text")
                if isinstance(text, str):
                    chunks.append(text)
        if chunks:
            return "\n".join(chunks)
    raise RuntimeError("Responses API returned no readable text output")


def translate_batch(
    *,
    api_key: str,
    model: str,
    batch: list[dict[str, str]],
    timeout_s: float,
) -> dict[str, str]:
    prompt = (
        "You are translating ArduPilot parameter metadata from English into Simplified Chinese "
        "for a flight-control ground station UI.\n"
        "Rules:\n"
        "1. Keep technical tokens unchanged: parameter names like YAW_RATE_ENABLE, MAVLink, GPS, RC, PWM, ACRO.\n"
        "2. Use accurate avionics/flight-control terminology, not word-for-word machine translation.\n"
        "3. Preserve paragraph breaks, list structure, numeric ranges, units, and punctuation intent.\n"
        "4. The 'n' field should be short, natural UI text.\n"
        "5. The 'd' field should be readable Chinese technical prose for pilots/engineers.\n"
        "6. Do not add explanations, notes, or markdown.\n"
        "7. Return one translation per input item.\n"
    )

    input_payload = [
        {
            "id": f"{item['field']}-{idx}",
            "field": item["field"],
            "source": item["source"],
        }
        for idx, item in enumerate(batch, start=1)
    ]

    body = {
        "model": model,
        "input": [
            {
                "role": "system",
                "content": [{"type": "input_text", "text": prompt}],
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": json.dumps({"items": input_payload}, ensure_ascii=False),
                    }
                ],
            },
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "param_translation_batch",
                "schema": build_schema(),
                "strict": True,
            }
        },
    }

    request = urllib.request.Request(
        API_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout_s) as response:
            response_json = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI API HTTP {exc.code}: {details}") from exc

    text = extract_output_text(response_json)
    parsed = json.loads(text)
    items = parsed.get("items")
    if not isinstance(items, list):
        raise RuntimeError("Structured output missing items array")

    translations: dict[str, str] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        item_id = item.get("id")
        translation = item.get("translation")
        if isinstance(item_id, str) and isinstance(translation, str):
            translations[item_id] = translation.strip()
    return translations


def main() -> None:
    parser = argparse.ArgumentParser(description="Translate apm-param-db with the OpenAI Responses API")
    parser.add_argument("--model", default=DEFAULT_MODEL, help=f"Responses API model id (default: {DEFAULT_MODEL})")
    parser.add_argument("--limit", type=int, default=0, help="Maximum number of uncached strings to translate")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE, help="Strings per API call")
    parser.add_argument("--sleep", type=float, default=0.2, help="Sleep between API calls in seconds")
    parser.add_argument("--fields", choices=["n", "d", "both"], default="both", help="Which fields to translate")
    parser.add_argument("--timeout", type=float, default=90.0, help="Per-request timeout in seconds")
    parser.add_argument("--api-key-env", default="OPENAI_API_KEY", help="Environment variable that stores the API key")
    parser.add_argument("--cache-path", default=str(AI_CACHE_PATH), help="Translation cache JSON path")
    parser.add_argument("--source-path", default=str(SOURCE_PATH), help="English source DB path")
    parser.add_argument("--output-path", default=str(DB_PATH), help="Translated output DB path")
    parser.add_argument("--skip-backup", action="store_true", help="Do not write a pre-AI backup of the output file")
    args = parser.parse_args()

    api_key = os.environ.get(args.api_key_env, "").strip()
    if not api_key:
        raise SystemExit(f"Missing API key: set {args.api_key_env}")

    source_path = Path(args.source_path)
    output_path = Path(args.output_path)
    cache_path = Path(args.cache_path)

    if not source_path.is_file():
        if source_path == SOURCE_PATH and DB_PATH.is_file():
            raise SystemExit(
                f"Missing English source DB: {source_path}\n"
                f"Current translated DB exists at {DB_PATH}. Please restore or provide --source-path."
            )
        raise SystemExit(f"Missing source DB: {source_path}")

    source_data = load_json(source_path)
    if not isinstance(source_data, dict):
        raise SystemExit("Source DB root is not an object")

    cache: dict[str, str] = {}
    if cache_path.is_file():
        raw_cache = load_json(cache_path)
        if isinstance(raw_cache, dict):
            cache = {str(k): str(v) for k, v in raw_cache.items()}

    pending_all = []
    for item in collect_strings(source_data, args.fields):
        cache_key = f"{item['field']}\t{item['source']}"
        if cache_key not in cache:
            pending_all.append(item)

    pending = pending_all[: args.limit] if args.limit > 0 else pending_all

    print(
        f"Source entries: {len(source_data)} | uncached pending: {len(pending_all)}"
        + (f" | this run: {len(pending)}" if args.limit > 0 else ""),
        flush=True,
    )

    done = 0
    for start in range(0, len(pending), max(1, args.batch_size)):
        batch = pending[start : start + max(1, args.batch_size)]
        translations = translate_batch(
            api_key=api_key,
            model=args.model,
            batch=batch,
            timeout_s=args.timeout,
        )

        missing: list[str] = []
        for idx, item in enumerate(batch, start=1):
            response_id = f"{item['field']}-{idx}"
            translated = translations.get(response_id, "").strip()
            if not translated:
                missing.append(response_id)
                continue
            cache[f"{item['field']}\t{item['source']}"] = translated
            done += 1

        if missing:
            raise RuntimeError(f"Batch returned incomplete translations: {', '.join(missing)}")

        save_json(cache_path, cache)
        print(f"Translated {done}/{len(pending)}", flush=True)
        time.sleep(max(0.0, args.sleep))

    output_data = load_json(source_path)
    apply_cache(output_data, cache)

    if output_path.is_file() and not args.skip_backup:
        shutil.copy2(output_path, BACKUP_OUT_PATH)

    save_json(output_path, output_data)
    print(f"Done. Updated {output_path} with {done} new AI translations.", flush=True)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
