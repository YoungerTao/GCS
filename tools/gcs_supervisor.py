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
BRIDGE_STDOUT_LOG = REPO_ROOT / "tools" / "com-bridge" / "server.stdout.log"
BRIDGE_STDERR_LOG = REPO_ROOT / "tools" / "com-bridge" / "server.stderr.log"


def gcs_python() -> str:
    """Prefer repo .venv (has pyserial) when present; on Windows prefer pythonw (no console)."""
    for rel in (".venv/bin/python", ".venv/Scripts/python.exe"):
        candidate = REPO_ROOT / rel
        if candidate.is_file():
            if sys.platform == "win32":
                pyw = candidate.parent / "pythonw.exe"
                if pyw.is_file():
                    return str(pyw)
            return str(candidate)
    if sys.platform == "win32":
        exe = Path(sys.executable)
        if exe.name.lower() == "python.exe":
            pyw = exe.with_name("pythonw.exe")
            if pyw.is_file():
                return str(pyw)
    return sys.executable

_lock = threading.Lock()
_proc: subprocess.Popen | None = None
_bridge_fail_streak = 0
_stdout_handle = None
_stderr_handle = None


def _subprocess_flags() -> int:
    if sys.platform == "win32":
        return getattr(subprocess, "CREATE_NO_WINDOW", 0)
    return 0


def bridge_healthy(timeout_s: float = 1.5) -> bool:
    try:
        with urllib.request.urlopen(BRIDGE_API, timeout=timeout_s) as resp:
            return resp.status == 200
    except Exception:
        return False


def _stop_locked() -> None:
    global _proc, _stdout_handle, _stderr_handle
    if _proc is None:
        return
    if _proc.poll() is None:
        _proc.terminate()
        try:
            _proc.wait(timeout=3)
        except Exception:
            _proc.kill()
    _proc = None
    for handle_name in ("_stdout_handle", "_stderr_handle"):
        handle = globals().get(handle_name)
        if handle is not None:
            try:
                handle.close()
            except Exception:
                pass
            globals()[handle_name] = None


def _open_bridge_logs():
    BRIDGE_STDOUT_LOG.parent.mkdir(parents=True, exist_ok=True)
    stdout_handle = BRIDGE_STDOUT_LOG.open("ab")
    stderr_handle = BRIDGE_STDERR_LOG.open("ab")
    return stdout_handle, stderr_handle


def ensure_bridge_process(force_restart: bool = False, wait_s: float = 12.0) -> bool:
    global _proc, _stdout_handle, _stderr_handle
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
            _stdout_handle, _stderr_handle = _open_bridge_logs()
            _proc = subprocess.Popen(
                [gcs_python(), str(SERVER_SCRIPT)],
                cwd=str(SERVER_SCRIPT.parent),
                stdout=_stdout_handle,
                stderr=_stderr_handle,
                creationflags=_subprocess_flags(),
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
    global _bridge_fail_streak
    while True:
        try:
            if not bridge_healthy(timeout_s=1.0):
                ok = ensure_bridge_process(force_restart=True, wait_s=15.0)
                if ok:
                    _bridge_fail_streak = 0
                else:
                    _bridge_fail_streak += 1
            else:
                _bridge_fail_streak = 0
        except Exception:
            _bridge_fail_streak += 1
        pause = interval_s
        if _bridge_fail_streak > 2:
            pause = min(60.0, interval_s * _bridge_fail_streak)
        time.sleep(pause)
