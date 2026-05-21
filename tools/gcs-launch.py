#!/usr/bin/env python3
"""Hidden GCS desktop launcher (replaces GCS.cmd :run — no console window)."""
from __future__ import annotations

import os
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
WATCHDOG_SCRIPT = REPO_ROOT / "tools" / "gcs_watchdog.py"
RUNTIME_PING = "http://127.0.0.1:8766/__gcs/ping"
LAUNCHER_PING = "http://127.0.0.1:8767/ping"
LAUNCH_URL = "http://127.0.0.1:8767/launch"
UI_URL = "http://127.0.0.1:8766/index.html"


def _no_window_flags() -> int:
    if sys.platform == "win32":
        return getattr(subprocess, "CREATE_NO_WINDOW", 0)
    return 0


def _url_ok(url: str, timeout_s: float = 2.0) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=timeout_s) as resp:
            return resp.status == 200
    except Exception:
        return False


def _spawn_watchdog() -> None:
    if _url_ok(LAUNCHER_PING, 1.0):
        return
    exe = sys.executable
    if sys.platform == "win32" and exe.lower().endswith("python.exe"):
        pyw = Path(exe).with_name("pythonw.exe")
        if pyw.is_file():
            exe = str(pyw)
    subprocess.Popen(
        [exe, str(WATCHDOG_SCRIPT)],
        cwd=str(REPO_ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=_no_window_flags(),
    )
    for _ in range(40):
        if _url_ok(LAUNCHER_PING, 1.0):
            return
        time.sleep(0.15)


def _post_launch(wait_s: float = 45.0) -> bool:
    try:
        req = urllib.request.Request(LAUNCH_URL, method="POST")
        with urllib.request.urlopen(req, timeout=wait_s) as resp:
            return resp.status == 200
    except Exception:
        return False


def _clear_launch_lock() -> None:
    lock = Path(os.environ.get("TEMP", "")) / "gcs-launch.lock"
    try:
        lock.unlink(missing_ok=True)
    except OSError:
        pass


def main() -> int:
    code = 1
    try:
        if _url_ok(RUNTIME_PING, 1.5):
            webbrowser.open(UI_URL)
            return 0

        _spawn_watchdog()
        if not _post_launch():
            return 1

        for _ in range(30):
            if _url_ok(RUNTIME_PING, 1.0):
                webbrowser.open(UI_URL)
                return 0
            time.sleep(0.2)

        webbrowser.open(UI_URL)
        code = 0
        return code
    finally:
        _clear_launch_lock()


if __name__ == "__main__":
    raise SystemExit(main())
