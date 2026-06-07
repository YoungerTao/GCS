#!/usr/bin/env python3
"""macOS: refresh stale COM bridge after git pull — no reinstall, no user shell commands."""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from gcs_supervisor import (  # noqa: E402
    EXPECTED_BRIDGE_API_VERSION,
    bridge_healthy,
    refresh_bridge_if_stale,
)


def _mavlink_can_api_ok(timeout_s: float = 1.5) -> bool:
    try:
        with urllib.request.urlopen(
            "http://127.0.0.1:8765/mavlink-can-nodes?bus=1",
            timeout=timeout_s,
        ) as resp:
            return resp.status == 200
    except Exception:
        return False


def _bridge_health(timeout_s: float = 1.0) -> dict:
    try:
        with urllib.request.urlopen("http://127.0.0.1:8765/health", timeout=timeout_s) as resp:
            data = json.loads(resp.read().decode("utf-8", "ignore"))
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _needs_refresh() -> bool:
    if not bridge_healthy():
        return True
    if refresh_bridge_if_stale(probe_only=True):
        return True
    return not _mavlink_can_api_ok()


def main() -> int:
    health = _bridge_health()
    api_version = health.get("apiVersion")
    if not _needs_refresh():
        print(json.dumps({
            "ok": True,
            "refreshed": False,
            "apiVersion": api_version,
            "mavlinkCanApi": True,
        }))
        return 0

    ok = refresh_bridge_if_stale(wait_s=15.0)
    health = _bridge_health()
    print(json.dumps({
        "ok": ok and bridge_healthy(),
        "refreshed": True,
        "apiVersion": health.get("apiVersion"),
        "expectedApiVersion": EXPECTED_BRIDGE_API_VERSION,
        "mavlinkCanApi": _mavlink_can_api_ok(),
    }))
    return 0 if ok and bridge_healthy() and _mavlink_can_api_ok() else 1


if __name__ == "__main__":
    raise SystemExit(main())
