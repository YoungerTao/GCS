#!/bin/bash

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

UI_URL="http://127.0.0.1:8766/index.html"
RUNTIME_PING="http://127.0.0.1:8766/__gcs/ping"
LAUNCHER_PING="http://127.0.0.1:8767/ping"

notify_error() {
  local message="$1"
  osascript -e "display alert \"GCS 启动失败\" message \"$message\" as critical buttons {\"好的\"} default button \"好的\"" >/dev/null 2>&1 || true
}

url_ok() {
  curl -fsS --max-time 2 "$1" >/dev/null 2>&1
}

open_ui() {
  open "$UI_URL" >/dev/null 2>&1 || true
}

find_python() {
  if [ -x "$SCRIPT_DIR/.venv/bin/python" ]; then
    echo "$SCRIPT_DIR/.venv/bin/python"
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    command -v python3
    return 0
  fi
  if command -v python >/dev/null 2>&1; then
    command -v python
    return 0
  fi
  return 1
}

if url_ok "$RUNTIME_PING"; then
  open_ui
  exit 0
fi

PYTHON_BIN="$(find_python)" || {
  notify_error "未检测到 Python 3。请先安装 Python 3，再重新双击 start-gcs.command。"
  exit 1
}

"$PYTHON_BIN" "$SCRIPT_DIR/tools/gcs-stop.py" >/dev/null 2>&1 || true

if ! url_ok "$LAUNCHER_PING"; then
  nohup "$PYTHON_BIN" "$SCRIPT_DIR/tools/gcs_watchdog.py" >/tmp/gcs-watchdog.log 2>&1 &
  for _ in $(seq 1 40); do
    if url_ok "$LAUNCHER_PING"; then
      break
    fi
    sleep 0.15
  done
fi

"$PYTHON_BIN" "$SCRIPT_DIR/tools/gcs-launch.py" >/tmp/gcs-launch.log 2>&1

if url_ok "$RUNTIME_PING"; then
  open_ui
  exit 0
fi

notify_error "本地 GCS runtime / COM bridge 没有成功启动。请检查 /tmp/gcs-watchdog.log 和 /tmp/gcs-launch.log。"
exit 1
