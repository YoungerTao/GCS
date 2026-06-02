"""Helpers for reaping stale Python listeners on local GCS ports (macOS/Linux)."""
from __future__ import annotations

import subprocess
import sys


def reap_stale_python_listener(port: int) -> None:
    """SIGTERM any Python process listening on *port* (best-effort)."""
    if sys.platform == "win32":
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
