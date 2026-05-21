#!/usr/bin/env bash
# Live Server (macOS/Linux): Go Live -> Chrome + GCS stack
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PY=python3
command -v "$PY" >/dev/null 2>&1 || PY=python
exec "$PY" .vscode/live-server-open.py --chrome "$@"
