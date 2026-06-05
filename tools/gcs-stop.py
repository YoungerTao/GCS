#!/usr/bin/env python3
"""Stop orphaned GCS local services (use --force to always reap even if runtime healthy)."""
from __future__ import annotations

import sys
import time
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from gcs_http import local_http_ok  # noqa: E402
from gcs_ports import reap_stale_python_listener  # noqa: E402

RUNTIME_PING = "http://127.0.0.1:8766/__gcs/ping"
GCS_PORTS = (8768, 8765, 8767, 8766)


def runtime_healthy(timeout_s: float = 1.5) -> bool:
    return local_http_ok(RUNTIME_PING, timeout_s=timeout_s)


def main() -> int:
    if "--force" not in sys.argv and "-f" not in sys.argv and runtime_healthy():
        return 0
    for port in GCS_PORTS:
        reap_stale_python_listener(port)
    time.sleep(0.35)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
