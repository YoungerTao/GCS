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
LOG_DIR = REPO_ROOT / "tools" / "logs"
LOG_PATH = LOG_DIR / "tile-server.log"


def gcs_python() -> str:
    from gcs_supervisor import gcs_python as _gcs_python

    return _gcs_python()


_lock = threading.Lock()
_proc: subprocess.Popen | None = None
_log_handle = None


def _tile_server_log_handle():
    global _log_handle
    if _log_handle is None or _log_handle.closed:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        _log_handle = LOG_PATH.open("a", encoding="utf-8")
    return _log_handle


def _log_supervisor_event(message: str) -> None:
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    try:
        handle = _tile_server_log_handle()
        handle.write(f"[{timestamp}] {message}\n")
        handle.flush()
    except Exception:
        pass


def _reap_stale_port_owner() -> None:
    """Clear a stale tile_server.py that still owns :8768 but no longer serves /health."""
    if sys.platform == "win32":
        return
    try:
        out = subprocess.check_output(
            ["lsof", "-nP", "-iTCP:8768", "-sTCP:LISTEN", "-Fpc"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        return

    pid = None
    command = None
    for line in out.splitlines():
        if line.startswith("p"):
            pid = line[1:].strip()
        elif line.startswith("c"):
            command = line[1:].strip()
            if pid and command and "python" in command.lower():
                try:
                    subprocess.run(["kill", "-TERM", pid], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                except Exception:
                    pass
                pid = None
                command = None


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
        _log_supervisor_event("Stopping tile server process")
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

        if not tile_server_healthy(timeout_s=1.0):
            _reap_stale_port_owner()

        if _proc is None or _proc.poll() is not None:
            log_handle = _tile_server_log_handle()
            _log_supervisor_event(f"Starting tile server with {gcs_python()} {SERVER_SCRIPT}")
            _proc = subprocess.Popen(
                [gcs_python(), str(SERVER_SCRIPT)],
                cwd=str(SERVER_SCRIPT.parent),
                stdout=log_handle,
                stderr=log_handle,
                creationflags=_subprocess_flags(),
            )

    deadline = time.time() + wait_s
    while time.time() < deadline:
        if tile_server_healthy():
            _log_supervisor_event("Tile server health check passed")
            return True
        with _lock:
            if _proc is not None and _proc.poll() is not None:
                _log_supervisor_event(
                    f"Tile server exited early with code {_proc.poll()}"
                )
                return False
        time.sleep(0.25)
    _log_supervisor_event(f"Tile server health check timed out after {wait_s:.1f}s")
    return False


def ensure_tile_server(force_restart: bool = False, wait_s: float = 12.0) -> bool:
    """Alias used by gcs_watchdog."""
    return ensure_tile_server_process(force_restart=force_restart, wait_s=wait_s)
