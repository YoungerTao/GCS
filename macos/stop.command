#!/bin/bash
# ============================================================
# GCS macOS 服务关闭工具
# 关闭所有 GCS 后台 Python 服务
# ============================================================

echo ""
echo "╔═══════════════════════════════════════╗"
echo "║      GCS 地面站 — 关闭服务           ║"
echo "╚═══════════════════════════════════════╝"
echo ""

echo "正在关闭 GCS 后台服务..."

# 先通过 Python 脚本尝试优雅关闭
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/macos/gcs-env.sh"
if [ -f "$VENV_PY" ]; then
  "$VENV_PY" "$GCS_ROOT/tools/gcs-stop.py" --force 2>/dev/null || true
fi

# 按端口关闭（从瓦片服务器到核心服务）
PORTS=(8768 8765 8767 8766)
FOUND=0

for port in "${PORTS[@]}"; do
  PIDS=$(lsof -ti ":$port" -sTCP:LISTEN 2>/dev/null)
  if [ -n "$PIDS" ]; then
    echo "$PIDS" | xargs kill -TERM 2>/dev/null || true
    echo "  ✓ 端口 $port 已关闭"
    FOUND=$((FOUND + 1))
  fi
done

# 额外清理：查找所有 GCS 相关的 Python 进程
GCS_PROCS=$(ps aux 2>/dev/null | grep -E "[g]cs_watchdog|[g]cs-runtime|[g]cs_supervisor|[c]om-bridge.*server|[t]ile_server|[g]cs-launch" | awk '{print $2}' 2>/dev/null)
if [ -n "$GCS_PROCS" ]; then
  echo "$GCS_PROCS" | xargs kill -TERM 2>/dev/null || true
  echo "  ✓ 残余进程已清理"
  FOUND=$((FOUND + 1))
fi

if [ $FOUND -eq 0 ]; then
  echo "  ℹ  没有找到运行中的 GCS 服务"
else
  echo ""
  echo "  ✓ 共关闭 $FOUND 个服务"
fi

echo ""
echo "GCS 后台服务已全部关闭。"
echo ""
sleep 1
