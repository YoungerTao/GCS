#!/usr/bin/env python3
"""Headless UI check: autotest page shows decoded BatteryInfo in Live Fields."""
from __future__ import annotations

import json
import sys
import time
import urllib.request

BRIDGE = "http://127.0.0.1:8765"
UI = "http://127.0.0.1:8766/index.html?dc_autotest=1"
LINE = "T180444338000066412C004000000000C0"
NEEDLE = "uavcan.equipment.power.BatteryInfo"


def post_inject() -> None:
    body = json.dumps({"line": LINE}).encode("utf-8")
    req = urllib.request.Request(
        f"{BRIDGE}/slcan-inject",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        if resp.status != 200:
            raise RuntimeError(f"inject failed: {resp.status}")


def main() -> int:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("SKIP: playwright not installed (pip install playwright && playwright install chromium)")
        return 0

    post_inject()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(UI, wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(4000)
        html = page.content()
        browser.close()

    if NEEDLE not in html and "BatteryInfo" not in html:
        print(f"FAIL: expected decoded type in page ({NEEDLE})", file=sys.stderr)
        return 1
    print("  [ok] UI autotest shows BatteryInfo decode")
    print("PASS: UI SLCAN autotest")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
