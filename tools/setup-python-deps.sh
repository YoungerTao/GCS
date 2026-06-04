#!/usr/bin/env bash
# One-time: venv + core deps (pyserial + pymavlink + dronecan) for GCS (macOS/Linux dev + parity with Windows bat).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/.venv"
PY="$VENV/bin/python"

# On Windows (if run under MSYS/Git Bash etc), still recommend python.org python (not Store python via 'python' alias).
# After git clone on any platform: prefer double-click GCS-安装桌面快捷方式.bat (Windows) or run this script.

if [ ! -x "$PY" ]; then
  python3 -m venv "$VENV"
fi

"$PY" -m pip install -U pip
"$PY" -m pip install -r "$ROOT/requirements.txt"
echo "OK: $PY (core deps from root requirements.txt)"
"$PY" -c "
import serial
from pymavlink import mavutil
import dronecan
from serial.tools import list_ports
print('ports:', len(list(list_ports.comports())))
print('dronecan OK:', dronecan.__name__)
print('All core deps ready: pyserial, pymavlink, dronecan')
"
