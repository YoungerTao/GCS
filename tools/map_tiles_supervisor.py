"""Start and supervise the local map tile server (tools/map-tiles/tile_server.py)."""
from __future__ import annotations

import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SERVER_SCRIPT = REPO_ROOT / "tools" / "map-tiles" / "tile_server.py"
TILE_SERVER_API = "http://127.0.0.1:8768/health"


def gcs_python() -> str:
    from gcs_supervisor import gcs_python as _gcs_python

    return _gcs_python()


_lock = threading.Lock()
_proc: subprocess.Popen | None = None


def _subprocess_flags() -> int:
    if sys.platform == "win32":
        return getattr(subprocess, "CREATE_NO_WINDOW", 0)
    return 0


def tile_server_healthy(timeout_s: float = 1.5) -> bool:
    try:
        with urllib.request.urlopen(TILE_SERVER_API, timeout=timeout_s) as resp:
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


def ensure_tile_server_process(force_restart: bool = False, wait_s: float = 12.0) -> bool:
    global _proc
    with _lock:
        if not force_restart and tile_server_healthy():
            return True
        if force_restart:
            _stop_locked()
        elif _proc is not None and _proc.poll() is None and tile_server_healthy():
            return True
        elif _proc is not None and _proc.poll() is not None:
            _proc = None

        if _proc is None or _proc.poll() is not None:
            _proc = subprocess.Popen(
                [gcs_python(), str(SERVER_SCRIPT)],
                cwd=str(SERVER_SCRIPT.parent),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=_subprocess_flags(),
            )

    deadline = time.time() + wait_s
    while time.time() < deadline:
        if tile_server_healthy():
            return True
        with _lock:
            if _proc is not None and _proc.poll() is not None:
                return False
        time.sleep(0.25)
    return False


def ensure_tile_server(force_restart: bool = False, wait_s: float = 12.0) -> bool:
    """Alias used by gcs_watchdog."""
    return ensure_tile_server_process(force_restart=force_restart, wait_s=wait_s)
