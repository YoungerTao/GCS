#!/usr/bin/env bash
# One-time: venv + pyserial/pymavlink for COM bridge (macOS/Linux dev).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/.venv"
PY="$VENV/bin/python"

if [ ! -x "$PY" ]; then
  python3 -m venv "$VENV"
fi

"$PY" -m pip install -U pip
"$PY" -m pip install -r "$ROOT/tools/com-bridge/requirements.txt"
echo "OK: $PY"
"$PY" -c "from serial.tools import list_ports; print('ports:', len(list(list_ports.comports())))"
