"""Start and supervise the local COM bridge (tools/com-bridge/server.py)."""
from __future__ import annotations

import subprocess
import sys
import threading
import time
from pathlib import Path

from gcs_http import local_http_ok
from gcs_ports import reap_stale_python_listener

REPO_ROOT = Path(__file__).resolve().parents[1]


def _is_microsoft_store_python(exe: str | Path) -> bool:
    """Detect sandboxed MS Store Python which cannot access serial ports or arbitrary FS paths."""
    s = str(exe or "").lower().replace("\\", "/")
    return "windowsapps" in s or "pythonsoftwarefoundation" in s
BRIDGE_PORT = 8765
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
                    chosen = str(pyw)
                else:
                    chosen = str(candidate)
            else:
                chosen = str(candidate)
            if _is_microsoft_store_python(chosen):
                raise RuntimeError(
                    f"检测到 Microsoft Store 版 Python（{chosen}），受沙箱限制无法访问串口/项目文件。\n"
                    "请安装官方 Python (python.org)，删除 .venv 后重新运行 setup-python-deps.ps1 或 GCS-安装桌面快捷方式.bat。"
                )
            # Probe what the exe reports as its own executable (catches venvs created from store python)
            try:
                import subprocess
                out = subprocess.check_output([chosen, "-c", "import sys;print(sys.executable)"], timeout=3, text=True, stderr=subprocess.DEVNULL).strip()
                if out and _is_microsoft_store_python(out):
                    raise RuntimeError(
                        f".venv Python 实际指向 Microsoft Store 受限版本（{out}），无法访问串口/文件。\n"
                        "删除 .venv 目录，使用官方 python.org Python 重新运行 setup-python-deps.ps1 。"
                    )
            except Exception:
                pass  # if probe fails, proceed (may still be usable or fail later)
            return chosen
    if sys.platform == "win32":
        exe = Path(sys.executable)
        if exe.name.lower() == "python.exe":
            pyw = exe.with_name("pythonw.exe")
            if pyw.is_file():
                chosen = str(pyw)
                if _is_microsoft_store_python(chosen):
                    raise RuntimeError(
                        f"检测到 Microsoft Store 版 Python（{chosen}），受沙箱限制无法访问串口/项目文件。\n"
                        "请安装官方 Python (python.org) 并确保其在 PATH 靠前位置。"
                    )
                return chosen
    chosen = sys.executable
    if _is_microsoft_store_python(chosen):
        raise RuntimeError(
            f"检测到 Microsoft Store 版 Python（{chosen}），受沙箱限制无法访问串口/项目文件。\n"
            "这会导致 DroneCAN 参数 Load failed: WriteFile PermissionError，以及 apm-param-db.json 未加载。\n"
            "请从 https://www.python.org/downloads/ 安装官方版 Python，勾选 Add to PATH，删除 .venv 后重试。"
        )
    return chosen

_lock = threading.Lock()
_proc: subprocess.Popen | None = None
_bridge_fail_streak = 0
_stdout_handle = None
_stderr_handle = None
_last_bridge_error: str = ""


def _subprocess_flags() -> int:
    if sys.platform == "win32":
        return getattr(subprocess, "CREATE_NO_WINDOW", 0)
    return 0


def bridge_healthy(timeout_s: float = 1.5) -> bool:
    return local_http_ok(BRIDGE_API, timeout_s=timeout_s)


def get_last_bridge_error() -> str:
    global _last_bridge_error
    return _last_bridge_error or ""


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
    global _proc, _stdout_handle, _stderr_handle, _last_bridge_error
    with _lock:
        if not force_restart and bridge_healthy():
            return True
        if force_restart:
            _stop_locked()
        elif _proc is not None and _proc.poll() is None and bridge_healthy():
            return True
        elif _proc is not None and _proc.poll() is not None:
            _proc = None

        if not bridge_healthy(timeout_s=1.0):
            reap_stale_python_listener(BRIDGE_PORT)

        if _proc is None or _proc.poll() is not None:
            _stdout_handle, _stderr_handle = _open_bridge_logs()
            _last_bridge_error = ""
            try:
                py = gcs_python()
            except Exception as e:
                _last_bridge_error = str(e)
                # write to stderr log for visibility
                try:
                    with BRIDGE_STDERR_LOG.open("ab") as f:
                        f.write(f"[gcs_python error] {e}\n".encode("utf-8", "ignore"))
                except Exception:
                    pass
                return False
            _proc = subprocess.Popen(
                [py, str(SERVER_SCRIPT)],
                cwd=str(SERVER_SCRIPT.parent),
                stdout=_stdout_handle,
                stderr=_stderr_handle,
                creationflags=_subprocess_flags(),
            )

    deadline = time.time() + wait_s
    while time.time() < deadline:
        if bridge_healthy():
            _last_bridge_error = ""
            return True
        with _lock:
            if _proc is not None and _proc.poll() is not None:
                if not _last_bridge_error:
                    # try to extract last lines from stderr log
                    try:
                        tail = BRIDGE_STDERR_LOG.read_text(encoding="utf-8", errors="ignore")[-2000:]
                        if "Store" in tail or "WindowsApps" in tail or "Permission" in tail or "WriteFile" in tail:
                            _last_bridge_error = tail.splitlines()[-1] if tail else ""
                    except Exception:
                        pass
                return bridge_healthy()
        time.sleep(0.25)
    return bridge_healthy()


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
