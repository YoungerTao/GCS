#!/usr/bin/env python3
"""Live Server 专用入口：固定 --chrome，兼容 Live Server 传入的 URL 参数。"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LAUNCHER = ROOT / ".vscode" / "live-server-open.py"


def main() -> int:
    uri = next((a for a in sys.argv[1:] if a.startswith("http://") or a.startswith("https://")), None)
    args = [sys.executable, str(LAUNCHER), "chrome"]
    if uri:
        args.append(uri)
    subprocess.Popen(args, cwd=str(ROOT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
