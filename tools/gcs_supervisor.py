"""Start and supervise the local COM bridge (tools/com-bridge/server.py)."""
from __future__ import annotations

import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SERVER_SCRIPT = REPO_ROOT / "tools" / "com-bridge" / "server.py"
BRIDGE_API = "http://127.0.0.1:8765/health"


def gcs_python() -> str:
    """Prefer repo .venv (has pyserial) when present."""
    for rel in (".venv/bin/python", ".venv/Scripts/python.exe"):
        candidate = REPO_ROOT / rel
        if candidate.is_file():
            return str(candidate)
    return sys.executable

_lock = threading.Lock()
_proc: subprocess.Popen | None = None


def bridge_healthy(timeout_s: float = 1.5) -> bool:
    try:
        with urllib.request.urlopen(BRIDGE_API, timeout=timeout_s) as resp:
            return resp.status == 200
    except Exception:
        return False


def _stop_locked() -> None:
    global _proc
    if _proc is None:
        return
    if _proc.poll() is None:
        _proc.terminate()
        try:
            _proc.wait(timeout=3)
        except Exception:
            _proc.kill()
    _proc = None


def ensure_bridge_process(force_restart: bool = False, wait_s: float = 12.0) -> bool:
    global _proc
    with _lock:
        if not force_restart and bridge_healthy():
            return True
        if force_restart:
            _stop_locked()
        elif _proc is not None and _proc.poll() is None and bridge_healthy():
            return True
        elif _proc is not None and _proc.poll() is not None:
            _proc = None

        if _proc is None or _proc.poll() is not None:
            _proc = subprocess.Popen(
                [gcs_python(), str(SERVER_SCRIPT)],
                cwd=str(SERVER_SCRIPT.parent),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

    deadline = time.time() + wait_s
    while time.time() < deadline:
        if bridge_healthy():
            return True
        with _lock:
            if _proc is not None and _proc.poll() is not None:
                return False
        time.sleep(0.25)
    return False


def watchdog_loop(interval_s: float = 5.0) -> None:
    while True:
        try:
            if not bridge_healthy(timeout_s=1.0):
                ensure_bridge_process(force_restart=True, wait_s=15.0)
        except Exception:
            pass
        time.sleep(interval_s)
