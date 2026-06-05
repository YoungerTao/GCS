#!/bin/bash
# ============================================================
# GCS macOS 服务状态检查
# 等价于 Windows 的 tools/check-gcs-stack.ps1
# ============================================================

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
