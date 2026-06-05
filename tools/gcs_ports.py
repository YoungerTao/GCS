"""Helpers for reaping stale Python listeners on local GCS ports (cross-platform, now includes Windows)."""
from __future__ import annotations

import subprocess
import sys


def _reap_windows(port: int) -> None:
    """Best-effort: kill any python* listener on port (PowerShell preferred + netstat+taskkill fallback)."""
    if sys.platform != "win32":
        return
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    kwargs: dict = {"creationflags": flags} if flags else {}
    si = getattr(subprocess, "STARTUPINFO", None)
    if si is not None:
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= getattr(subprocess, "STARTF_USESHOWWINDOW", 0)
        startupinfo.wShowWindow = 0
        kwargs["startupinfo"] = startupinfo

    # Preferred: modern PowerShell (Win8+/2012+)
    ps_script = f"""
$ErrorActionPreference = 'SilentlyContinue'
$p = {port}
Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object {{
    $proc = Get-Process -Id $_ -ErrorAction SilentlyContinue
    if ($proc -and ($proc.Name -like '*python*')) {{
      Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }}
  }}
"""
    try:
        subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script],
            capture_output=True,
            text=True,
            timeout=5,
            **kwargs,
        )
        return
    except Exception:
        pass

    # Fallback for older Windows: netstat parse + taskkill (only if name contains python)
    try:
        out = subprocess.check_output(
            ["netstat", "-ano"],
            text=True,
            stderr=subprocess.DEVNULL,
            **kwargs,
        )
    except Exception:
        return
    for line in out.splitlines():
        if f":{port}" not in line or "LISTENING" not in line.upper():
            continue
        parts = line.strip().split()
        if len(parts) < 5:
            continue
        pid = parts[-1]
        if not pid.isdigit():
            continue
        try:
            tl = subprocess.check_output(
                ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
                text=True,
                stderr=subprocess.DEVNULL,
                **kwargs,
            )
            if "python" not in tl.lower():
                continue
            subprocess.run(
                ["taskkill", "/PID", pid, "/F"],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                **kwargs,
            )
        except Exception:
            pass


def reap_stale_python_listener(port: int) -> None:
    """SIGTERM any Python process listening on *port* (best-effort)."""
    if sys.platform == "win32":
        try:
            _reap_windows(port)
        except Exception:
            pass
        return
    try:
        out = subprocess.check_output(
            ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-Fpc"],
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
                    subprocess.run(
                        ["kill", "-TERM", pid],
                        check=False,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                    )
                except Exception:
                    pass
                pid = None
                command = None
