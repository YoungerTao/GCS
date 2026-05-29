#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Translate ArduPilot parameter metadata using OpenAI (Responses API) or xAI (Chat Completions).

This script reads English source strings from JS/data/apm-param-db.en.json,
translates them (primarily the long 'd' description field) into Simplified Chinese
in batches, caches results locally, and writes the merged output back to
JS/data/apm-param-db.json.

Supported providers:
  - OpenAI (default for keys not starting with "xai-")
  - xAI (Grok) — auto-detected when the API key starts with "xai-",
    or explicitly selected with --provider xai. Recommended default: grok-4.3
  - DeepSeek — explicitly selected with --provider deepseek.
    Recommended default: deepseek-v4-flash (user-confirmed working model)

Environment variables (recommended):
  OPENAI_API_KEY    For OpenAI
  XAI_API_KEY       For xAI (Grok)
  DEEPSEEK_API_KEY  For DeepSeek

Example (xAI):
  export XAI_API_KEY="xai-..."
  python translate_params_ai.py --review --limit 300 --api-key-env XAI_API_KEY

Example (DeepSeek):
  export DEEPSEEK_API_KEY="sk-..."
  python translate_params_ai.py --review --limit 300 \
    --api-key-env DEEPSEEK_API_KEY --provider deepseek --model deepseek-v4-flash

Example (OpenAI):
  export OPENAI_API_KEY="sk-..."
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

# Reviewable workflow artifacts (仅 d 字段)
REVIEW_DIR = ROOT / "tools" / "translation-review"
GLOSSARY_PATH = ROOT / "tools" / "glossary-param-translation.json"

# Provider-aware defaults
OPENAI_DEFAULT_MODEL = "gpt-5.4-mini"
OPENAI_API_URL = "https://api.openai.com/v1/responses"

# Current recommended default for xAI (as of late May 2026).
# grok-2 / grok-3 and early grok-4 variants were retired on 2026-05-15.
# grok-4.3 is the current flagship (best quality/speed for technical translation).
# For heavier reasoning on complex descriptions you may override with:
#   --model grok-4.20-0309-reasoning
XAI_DEFAULT_MODEL = "grok-4.3"
XAI_API_URL = "https://api.x.ai/v1/chat/completions"

# DeepSeek (OpenAI-compatible Chat Completions + json_schema support)
# User confirmed "deepseek-v4-flash" works for their use case.
# Standard base for DeepSeek is https://api.deepseek.com
DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-flash"
DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"

# Back-compat module-level defaults (used only if no provider resolution happens)
DEFAULT_MODEL = OPENAI_DEFAULT_MODEL
DEFAULT_BATCH_SIZE = 24
API_URL = OPENAI_API_URL


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


def load_glossary() -> dict[str, Any]:
    if GLOSSARY_PATH.is_file():
        try:
            return json.loads(GLOSSARY_PATH.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def build_strong_d_only_prompt(glossary: dict[str, Any]) -> str:
    """构建仅翻译 d 字段的强 Prompt，注入本 GCS 术语表。"""
    terms = glossary.get("terms", {})
    phrases = glossary.get("phrases", {})
    notes = glossary.get("notes_for_ai", [])

    term_lines = "\n".join(f"- {k} → {v}" for k, v in terms.items())
    phrase_lines = "\n".join(f"- \"{k}\" → \"{v}\"" for k, v in phrases.items())
    note_lines = "\n".join(f"- {n}" for n in notes)

    return (
        "You are a professional technical translator for ArduPilot parameter documentation.\n"
        "You are translating ONLY the long description field ('d') into clear, accurate Simplified Chinese "
        "for a professional Ground Control Station UI used by pilots and engineers.\n\n"
        "MANDATORY TERMINOLOGY (必须严格遵守):\n"
        f"{term_lines}\n\n"
        "PREFERRED PHRASES:\n"
        f"{phrase_lines}\n\n"
        "CRITICAL RULES:\n"
        "- Translate ONLY the 'd' (description) content. Never touch parameter names, mode names (ACRO, FBWA, CIRCLE, RTL, etc.), abbreviations (PID, EKF, INS, GPS, PWM, MAVLink), numbers, units, or ranges.\n"
        "- Preserve all paragraph breaks, list structures, indentation, and formatting intent exactly.\n"
        "- For bitmask definitions, use the exact format: '位0: ...', '位1: ...'\n"
        "- For values lists, keep the original structure and translate labels naturally.\n"
        "- Tone: professional, concise, suitable for experienced pilots and engineers. No added explanations, warnings, or Markdown.\n"
        "- Do not translate the short display name field ('n').\n\n"
        "QUALITY NOTES:\n"
        f"{note_lines}\n"
    )


def write_review_file(review_items: list[dict[str, Any]], review_dir: Path) -> Path:
    """Write a timestamped review JSON for human inspection and editing (仅 d 字段)。"""
    review_dir.mkdir(parents=True, exist_ok=True)
    ts = time.strftime("%Y%m%d-%H%M%S")
    out_path = review_dir / f"translations.review.{ts}.json"
    payload = {
        "_meta": {
            "description": "Reviewable AI translations — 仅 d（说明）字段。编辑 'proposed' 为最终接受的译文，删除不接受的条目。",
            "instructions": "完成后运行 apply-reviewed-translations.py 合并到 cache + db（保留 grp）。",
            "generated_at": ts,
            "count": len(review_items),
        },
        "items": review_items,
    }
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return out_path


# ---------------------------------------------------------------------------
# Provider abstraction (OpenAI Responses vs xAI Chat Completions)
# ---------------------------------------------------------------------------


def resolve_provider(
    *,
    provider_arg: str,
    api_key: str,
) -> tuple[str, str, str]:
    """
    Return (provider, api_url, effective_model_default).

    Rules:
      - If provider_arg is "openai", "xai", or "deepseek", honor it explicitly.
      - If "auto" (default): auto-detect from key prefix ("xai-" → xAI).
        DeepSeek must be selected explicitly via --provider deepseek
        (its keys also start with "sk-", same as OpenAI).
      - Returns the appropriate API URL and the recommended default model
        for that provider (caller still respects explicit --model).
    """
    p = (provider_arg or "auto").lower().strip()
    if p == "openai":
        return "openai", OPENAI_API_URL, OPENAI_DEFAULT_MODEL
    if p == "xai":
        return "xai", XAI_API_URL, XAI_DEFAULT_MODEL
    if p == "deepseek":
        return "deepseek", DEEPSEEK_API_URL, DEEPSEEK_DEFAULT_MODEL
    # auto
    if isinstance(api_key, str) and api_key.strip().lower().startswith("xai-"):
        return "xai", XAI_API_URL, XAI_DEFAULT_MODEL
    return "openai", OPENAI_API_URL, OPENAI_DEFAULT_MODEL


def build_request_body_for_provider(
    provider: str,
    model: str,
    system_prompt: str,
    user_json_str: str,
    schema: dict[str, Any],
) -> dict[str, Any]:
    """
    Build the JSON body for the chosen provider.

    - OpenAI: uses the Responses API.
    - xAI: uses Chat Completions + full json_schema (strict structured outputs).
    - DeepSeek: currently uses Chat Completions + simple "json_object" mode
      because full "json_schema" + "strict" is not yet available on all their
      models/endpoints (including the user's "deepseek-v4-flash").
      We rely on a strong prompt + post-parsing instead of server-side enforcement.
    """
    if provider == "deepseek":
        # DeepSeek: use the widely-supported simple JSON mode.
        # The prompt (especially in --review / d-only mode) already tells the model
        # to return exactly one JSON object with the expected shape.
        return {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_json_str},
            ],
            "response_format": {"type": "json_object"},
        }

    if provider == "xai":
        # xAI supports the full json_schema structured output.
        return {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_json_str},
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "param_translation_batch",
                    "schema": schema,
                    "strict": True,
                },
            },
        }

    # OpenAI Responses API (current implementation)
    return {
        "model": model,
        "input": [
            {
                "role": "system",
                "content": [{"type": "input_text", "text": system_prompt}],
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": user_json_str,
                    }
                ],
            },
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "param_translation_batch",
                "schema": schema,
                "strict": True,
            }
        },
    }


def extract_text_from_provider_response(
    provider: str, response_json: dict[str, Any]
) -> str:
    """
    Extract the model's text output from either provider's response shape.
    For structured outputs the text is a JSON string that the caller will parse.
    """
    if provider in ("xai", "deepseek"):
        # Standard Chat Completions shape (used by both xAI legacy path and DeepSeek)
        choices = response_json.get("choices")
        if isinstance(choices, list) and choices:
            msg = choices[0].get("message") if isinstance(choices[0], dict) else None
            if isinstance(msg, dict):
                content = msg.get("content")
                if isinstance(content, str) and content.strip():
                    return content.strip()
        if "error" in response_json:
            prov = "DeepSeek" if provider == "deepseek" else "xAI"
            raise RuntimeError(f"{prov} API error: {response_json['error']}")
        raise RuntimeError(f"{provider.capitalize()} Chat Completions returned no readable message content")

    # OpenAI Responses (existing logic)
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

    raise RuntimeError("OpenAI Responses API returned no readable text output")


# ---------------------------------------------------------------------------
# Robust JSON extraction helpers (especially important for DeepSeek)
# ---------------------------------------------------------------------------


def _strip_code_fences(text: str) -> str:
    """Remove common ```json ... ``` or ``` ... ``` fences that models often emit anyway."""
    t = text.strip()
    if t.startswith("```"):
        # drop the opening fence line
        lines = t.splitlines()
        if len(lines) > 1:
            t = "\n".join(lines[1:])
        # drop the closing fence if present
        if t.rstrip().endswith("```"):
            t = t.rstrip()[:-3].rstrip()
    return t.strip()


def _extract_outermost_json_object(text: str) -> str | None:
    """
    Very simple but effective heuristic: take the substring from the first '{'
    to the last '}'. This recovers the main JSON object even if the model
    added prefix/suffix text or multiple objects.
    """
    first = text.find("{")
    last = text.rfind("}")
    if first == -1 or last == -1 or last <= first:
        return None
    return text[first : last + 1]


def normalize_translation_json(provider: str, raw_text: str) -> dict[str, Any]:
    """
    Convert whatever the model emitted into a dict that (ideally) has an "items" list
    in the shape we expect: {"items": [{"id": "...", "translation": "..."}, ...]}

    For providers using strict json_schema (currently xAI in our flow) we are strict.
    For DeepSeek (json_object mode) we are very forgiving and try several recovery strategies.
    """
    if provider != "deepseek":
        # Strict path – the schema enforcement should have done its job.
        return json.loads(raw_text)

    # --- DeepSeek loose path ---
    cleaned = _strip_code_fences(raw_text)

    # Try direct parse first
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        # Salvage attempt: grab the biggest {...} block
        candidate = _extract_outermost_json_object(cleaned)
        if candidate:
            data = json.loads(candidate)
        else:
            # Give up – surface the raw text for debugging
            raise ValueError(
                f"DeepSeek did not return valid JSON. Raw model output (first 1200 chars):\n{cleaned[:1200]}"
            )

    # Normalize several shapes that DeepSeek commonly produces
    if isinstance(data, list):
        # Model returned the array directly instead of an object
        data = {"items": data}

    if not isinstance(data, dict):
        data = {}

    if "items" not in data or not isinstance(data.get("items"), list):
        # Try common alternative shapes
        if "translations" in data and isinstance(data["translations"], dict):
            # {"translations": {"d-1": "foo", "d-2": "bar", ...}}
            items = [
                {"id": k, "translation": v}
                for k, v in data["translations"].items()
                if isinstance(k, str) and isinstance(v, str)
            ]
            data = {"items": items}

        elif all(isinstance(k, str) and isinstance(v, str) for k, v in data.items()):
            # Flat dict: {"d-1": "foo", "d-2": "bar"}
            items = [{"id": k, "translation": v} for k, v in data.items()]
            data = {"items": items}

        # If we still don't have a usable "items", keep whatever we have so the
        # caller can produce a good error message that includes the raw output.

    return data


def extract_output_text(response_json: dict[str, Any]) -> str:
    """Legacy wrapper kept for any direct callers; delegates to OpenAI path."""
    return extract_text_from_provider_response("openai", response_json)


def translate_batch(
    *,
    api_key: str,
    model: str,
    batch: list[dict[str, str]],
    timeout_s: float,
    glossary: dict[str, Any] | None = None,
    force_d_only: bool = False,
    provider: str = "openai",
) -> dict[str, str]:
    """
    Call the chosen provider (openai, xai, or deepseek) to translate a batch.

    The provider determines:
      - Which API endpoint and request shape is used (via build_request_body_for_provider)
      - How the response is parsed (via extract_text_from_provider_response)
    """
    glossary = glossary or {}
    if force_d_only or all(item.get("field") == "d" for item in batch):
        prompt = build_strong_d_only_prompt(glossary)
    else:
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

    # When using DeepSeek with the simple "json_object" mode (no strict schema enforcement),
    # we must be extremely explicit. We also give a tiny concrete example of the exact shape.
    if provider == "deepseek":
        extra = (
            "\n\nCRITICAL OUTPUT FORMAT (MANDATORY):\n"
            "Your entire response MUST be exactly one JSON object and NOTHING ELSE.\n"
            "Do not output any text before or after the JSON.\n"
            "Do not use markdown code fences (```json ... ```).\n"
            "The object must have exactly this shape:\n"
            '  {"items": [ {"id": "d-1", "translation": "中文译文..."}, {"id": "d-2", "translation": "..."} ] }\n'
            "Use the exact ids we gave you (d-1, d-2, ...). "
            "Only translate the 'source' text into clear Simplified Chinese. "
            "Output ONLY the raw JSON object described above."
        )
        prompt = prompt + extra

    input_payload = [
        {
            "id": f"{item['field']}-{idx}",
            "field": item["field"],
            "source": item["source"],
        }
        for idx, item in enumerate(batch, start=1)
    ]

    user_json_str = json.dumps({"items": input_payload}, ensure_ascii=False)
    schema = build_schema()

    body = build_request_body_for_provider(
        provider=provider,
        model=model,
        system_prompt=prompt,
        user_json_str=user_json_str,
        schema=schema,
    )

    if provider == "deepseek":
        api_url = DEEPSEEK_API_URL
    elif provider == "xai":
        api_url = XAI_API_URL
    else:
        api_url = OPENAI_API_URL

    request = urllib.request.Request(
        api_url,
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
        if provider == "deepseek":
            prov_name = "DeepSeek"
        elif provider == "xai":
            prov_name = "xAI"
        else:
            prov_name = "OpenAI"
        raise RuntimeError(f"{prov_name} API HTTP {exc.code}: {details}") from exc

    raw_text = extract_text_from_provider_response(provider, response_json)

    try:
        parsed = normalize_translation_json(provider, raw_text)
    except Exception as exc:
        # For DeepSeek we want to show the user exactly what the model emitted
        if provider == "deepseek":
            preview = raw_text[:1500] if raw_text else "(empty)"
            raise RuntimeError(
                f"DeepSeek returned something that could not be parsed as the expected JSON.\n"
                f"Raw model output (first 1500 chars):\n{preview}\n\n"
                f"Original error: {exc}"
            ) from exc
        raise

    items = parsed.get("items")
    if not isinstance(items, list):
        hint = ""
        if provider == "deepseek":
            preview = raw_text[:1200] if raw_text else "(empty)"
            hint = (
                f"\n\nDeepSeek raw output (first 1200 chars) for debugging:\n{preview}\n"
                "The model did not follow the requested JSON shape. "
                "Common causes: it added explanations, used a different key name, "
                "or wrapped the result in extra text despite the prompt."
            )
        elif provider == "xai":
            hint = " (xAI: try a current model such as grok-4.3 or grok-4.20-0309-reasoning that supports structured outputs)"
        raise RuntimeError(f"Structured output missing items array{hint}")

    # Collect translations keyed by the id the model returned, while also
    # preserving order so we can fall back to positional matching when the
    # model echoes the wrong ids (a common DeepSeek json_object quirk).
    translations: dict[str, str] = {}
    ordered_translations: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        item_id = item.get("id")
        translation = item.get("translation")
        if not isinstance(translation, str):
            continue
        translation = translation.strip()
        ordered_translations.append(translation)
        if isinstance(item_id, str):
            translations[item_id] = translation

    # Positional fallback: the caller looks up expected ids "<field>-<idx>"
    # (1-based, matching input_payload). If the model returned the right number
    # of items in order but with mismatched/renamed ids, recover by position.
    expected_ids = [f"{item['field']}-{idx}" for idx, item in enumerate(batch, start=1)]
    for pos, expected_id in enumerate(expected_ids):
        if translations.get(expected_id):
            continue
        if pos < len(ordered_translations) and ordered_translations[pos]:
            translations[expected_id] = ordered_translations[pos]

    return translations


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Translate apm-param-db 'd' (description) field using OpenAI, xAI or DeepSeek. "
                    "Use --review for safe, reviewable workflow (recommended)."
    )
    parser.add_argument(
        "--provider",
        choices=["auto", "openai", "xai", "deepseek"],
        default="auto",
        help="AI provider. 'auto' (default) detects from key prefix (xai- → xAI). "
             "Use 'deepseek' for DeepSeek (requires explicit --provider deepseek; "
             "recommended with --api-key-env DEEPSEEK_API_KEY).",
    )
    parser.add_argument(
        "--model",
        default=None,
        help="Model ID for the chosen provider (default: grok-4.3 for xAI, deepseek-v4-flash for DeepSeek, "
             "gpt-5.4-mini for OpenAI). For DeepSeek pass --provider deepseek and optionally --model.",
    )
    parser.add_argument("--limit", type=int, default=0, help="Maximum number of uncached strings to translate")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE, help="Strings per API call")
    parser.add_argument("--sleep", type=float, default=0.2, help="Sleep between API calls in seconds")
    parser.add_argument(
        "--max-retries",
        type=int,
        default=3,
        help="Attempts per batch before giving up (handles flaky/incomplete API responses). Default: 3",
    )
    parser.add_argument(
        "--skip-failed",
        action="store_true",
        help="Skip a batch that is still incomplete after retries instead of aborting the run "
             "(missing items remain uncached and are retried on the next run).",
    )
    parser.add_argument("--fields", choices=["n", "d", "both"], default="both", help="Which fields to translate")
    parser.add_argument(
        "--review",
        action="store_true",
        help="Reviewable mode: generate editable review JSON files for 'd' only (strongly recommended for quality)",
    )
    parser.add_argument("--review-dir", default=str(REVIEW_DIR), help="Directory for review JSON files")
    parser.add_argument("--timeout", type=float, default=90.0, help="Per-request timeout in seconds")
    parser.add_argument(
        "--api-key-env",
        default="OPENAI_API_KEY",
        help="Environment variable holding the API key. For xAI prefer XAI_API_KEY and --api-key-env XAI_API_KEY",
    )
    parser.add_argument("--cache-path", default=str(AI_CACHE_PATH), help="Translation cache JSON path")
    parser.add_argument("--source-path", default=str(SOURCE_PATH), help="English source DB path")
    parser.add_argument("--output-path", default=str(DB_PATH), help="Translated output DB path")
    parser.add_argument("--skip-backup", action="store_true", help="Do not write a pre-AI backup of the output file")
    args = parser.parse_args()

    api_key = os.environ.get(args.api_key_env, "").strip()
    if not api_key:
        raise SystemExit(
            f"Missing API key: set {args.api_key_env}\n"
            "  For DeepSeek: export DEEPSEEK_API_KEY=...  then use --api-key-env DEEPSEEK_API_KEY --provider deepseek\n"
            "  For xAI:      export XAI_API_KEY=...       then use --api-key-env XAI_API_KEY\n"
            "  For OpenAI:   export OPENAI_API_KEY=..."
        )

    # Hardening against the very common "copy-paste pollution" problem on non-English systems.
    # API keys must be pure ASCII. Non-ASCII in the Authorization header causes the opaque
    # "latin-1 codec can't encode" crash deep inside urllib/http.client.
    if not api_key.isascii():
        # Show a short repr of the offending characters to help the user locate the garbage.
        bad = [(i, c, hex(ord(c))) for i, c in enumerate(api_key) if not c.isascii()]
        preview = api_key[:8] + "..." + api_key[-4:] if len(api_key) > 12 else api_key
        raise SystemExit(
            "API key contains non-ASCII characters (very common after copy-paste from chat/browser).\n"
            f"  Variable : {args.api_key_env}\n"
            f"  Preview  : {preview}\n"
            f"  Bad chars: {bad[:5]}{'...' if len(bad) > 5 else ''}\n\n"
            "Please re-export a clean key:\n"
            f"  export {args.api_key_env}='xai-XXXXXXXXXXXXXXXX...'\n"
            "  (use straight single quotes, paste ONLY the key, no extra characters, no Chinese punctuation)\n"
            "Then re-run the command."
        )

    # Resolve provider (auto-detect from key prefix if --provider=auto)
    provider, _api_url, provider_default_model = resolve_provider(
        provider_arg=getattr(args, "provider", "auto"),
        api_key=api_key,
    )

    # Effective model: explicit --model wins, otherwise the provider's recommended default
    effective_model = args.model or provider_default_model

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

    glossary = load_glossary()

    # In review mode we focus exclusively on 'd' (说明) as per project decision
    effective_fields = "d" if args.review else args.fields

    pending_all = []
    for item in collect_strings(source_data, effective_fields):
        cache_key = f"{item['field']}\t{item['source']}"
        if cache_key not in cache:
            pending_all.append(item)

    pending = pending_all[: args.limit] if args.limit > 0 else pending_all

    print(
        f"Provider: {provider} | model: {effective_model} | "
        f"Source entries: {len(source_data)} | uncached pending: {len(pending_all)}"
        + (f" | this run: {len(pending)}" if args.limit > 0 else "")
        + (f" | REVIEW MODE (d only)" if args.review else ""),
        flush=True,
    )

    if not pending:
        print("Nothing to translate.", flush=True)
        return

    done = 0
    review_items: list[dict[str, Any]] = []

    for start in range(0, len(pending), max(1, args.batch_size)):
        batch = pending[start : start + max(1, args.batch_size)]

        # Retry a flaky batch a few times before giving up. A single bad
        # response (e.g. DeepSeek returning mismatched ids or dropping items)
        # should not abort the whole run and lose hundreds of cached results.
        translations: dict[str, str] = {}
        missing: list[str] = []
        last_error: Exception | None = None
        for attempt in range(1, max(1, args.max_retries) + 1):
            try:
                translations = translate_batch(
                    api_key=api_key,
                    model=effective_model,
                    batch=batch,
                    timeout_s=args.timeout,
                    glossary=glossary,
                    force_d_only=args.review,
                    provider=provider,
                )
            except Exception as exc:  # transient API/parse failures
                last_error = exc
                translations = {}
            else:
                last_error = None

            missing = [
                f"{item['field']}-{idx}"
                for idx, item in enumerate(batch, start=1)
                if not translations.get(f"{item['field']}-{idx}", "").strip()
            ]
            if not missing and last_error is None:
                break

            if attempt < max(1, args.max_retries):
                backoff = args.sleep * (2 ** (attempt - 1)) + 0.5
                reason = (
                    f"error: {last_error}" if last_error is not None
                    else f"incomplete ({len(missing)} missing)"
                )
                print(
                    f"  Batch at {start} {reason}; retry {attempt}/{args.max_retries - 1} "
                    f"in {backoff:.1f}s",
                    flush=True,
                )
                time.sleep(backoff)

        if last_error is not None:
            raise RuntimeError(
                f"Batch at offset {start} failed after {args.max_retries} attempts: {last_error}"
            ) from last_error

        for idx, item in enumerate(batch, start=1):
            response_id = f"{item['field']}-{idx}"
            translated = translations.get(response_id, "").strip()
            if not translated:
                continue

            cache_key = f"{item['field']}\t{item['source']}"
            cache[cache_key] = translated
            done += 1

            if args.review and item["field"] == "d":
                # Try to enrich with param name (source_data keys are the param names)
                param_name = None
                for pname, pval in source_data.items():
                    if isinstance(pval, dict) and pval.get("d") == item["source"]:
                        param_name = pname
                        break
                review_items.append({
                    "id": response_id,
                    "param": param_name or "UNKNOWN",
                    "field": "d",
                    "source": item["source"],
                    "proposed": translated,
                    "status": "pending",   # user should change to "accepted" or delete
                })

        if missing:
            msg = (
                f"Batch at offset {start} still incomplete after {args.max_retries} attempts "
                f"({len(missing)} missing): {', '.join(missing)}"
            )
            if args.skip_failed:
                print(f"  WARNING: {msg} — skipping (will be retried on next run).", flush=True)
            else:
                raise RuntimeError(msg + "\nUse --skip-failed to continue past bad batches.")

        save_json(cache_path, cache)
        print(f"Translated {done}/{len(pending)}", flush=True)
        time.sleep(max(0.0, args.sleep))

    review_dir = Path(args.review_dir)
    if args.review and review_items:
        review_path = write_review_file(review_items, review_dir)
        print(f"\nReview file written: {review_path}", flush=True)
        print("Please review the 'proposed' translations, edit as needed, then run the apply tool.", flush=True)
        print("No changes were written to the final db in review mode.", flush=True)
        return

    # Normal (non-review) path — apply to output
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
