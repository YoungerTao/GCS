#!/bin/bash
# ============================================================
# GCS macOS 服务状态检查
# 等价于 Windows 的 tools/check-gcs-stack.ps1
# ============================================================

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/macos/gcs-env.sh"

GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; NC='\033[0m'

echo ""
echo "╔═══════════════════════════════════════╗"
echo "║      GCS 服务状态检查                ║"
echo "╚═══════════════════════════════════════╝"
echo ""

PASS=0
FAIL=0

check() {
  local name="$1" url="$2"
  local resp
  resp=$(curl -sf --max-time 3 "$url" 2>/dev/null)
  if [ $? -eq 0 ] && [ -n "$resp" ]; then
    # 尝试解析 JSON 中的 ok 字段
    local ok
    ok=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ok','false'))" 2>/dev/null)
    if [ "$ok" = "True" ]; then
      echo -e "  ${GREEN}[OK]${NC} $name  $url"
      PASS=$((PASS + 1))
    else
      echo -e "  ${YELLOW}[?]${NC} $name  $url（响应但 status 非 ok）"
      PASS=$((PASS + 1))
    fi
  else
    echo -e "  ${RED}[FAIL]${NC} $name  $url"
    FAIL=$((FAIL + 1))
  fi
}

echo "  ----------------------------------------"
check "UI 运行时" "http://127.0.0.1:8766/__gcs/ping"
check "启动守护" "http://127.0.0.1:8767/ping"
check "地图瓦片" "http://127.0.0.1:8768/health"
check "COM 桥接" "http://127.0.0.1:8765/health"
BRIDGE_API=$(curl -sf --max-time 3 "http://127.0.0.1:8765/health" 2>/dev/null)
if [ -n "$BRIDGE_API" ]; then
  API_VER=$(echo "$BRIDGE_API" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('apiVersion',''))" 2>/dev/null)
  MAV_OK=$(curl -sf --max-time 3 -o /dev/null -w "%{http_code}" "http://127.0.0.1:8765/mavlink-can-nodes?bus=1" 2>/dev/null)
  if [ "$API_VER" != "4" ] || [ "$MAV_OK" != "200" ]; then
    echo -e "  ${YELLOW}[!]${NC} COM 桥接代码过旧（apiVersion=${API_VER:-缺失}），正在自动刷新..."
    if [ -f "$VENV_PY" ]; then
      "$VENV_PY" "$GCS_ROOT/tools/gcs-mac-refresh.py" >/dev/null 2>&1 && \
        echo -e "  ${GREEN}✓${NC} COM 桥接已刷新，请在浏览器重连串口" || \
        echo -e "  ${RED}✗${NC} 自动刷新失败，请双击 macos/start.command"
    fi
  fi
fi
echo "  ----------------------------------------"
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "  ${GREEN}✓ 所有服务运行正常（$PASS/4）${NC}"
elif [ $PASS -gt 0 ] && [ $FAIL -gt 0 ]; then
  echo -e "  ${YELLOW}⚠ 部分服务异常（$PASS 正常 / $FAIL 异常）${NC}"
  echo ""
  echo "  尝试运行 macos/start.command 重启服务"
else
  echo -e "  ${RED}✗ 无服务在运行（0/$PASS）${NC}"
  echo ""
  echo "  请运行 macos/start.command 启动 GCS"
fi

echo ""
# 等待用户查看结果
sleep 2
