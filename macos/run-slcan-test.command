#!/bin/bash
# ============================================================
# GCS macOS SLCAN 自动化测试
# 等价于 Windows 的 tools/run-slcan-automation.ps1
# ============================================================

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV_PY="$ROOT/.venv/bin/python"

echo ""
echo "╔═══════════════════════════════════════╗"
echo "║      DroneCAN SLCAN 自动化测试       ║"
echo "╚═══════════════════════════════════════╝"
echo ""

# 检查 .venv
if [ ! -f "$VENV_PY" ]; then
  echo -e "${RED}✗ 未检测到 .venv${NC}"
  echo "  请先运行 macos/install.command 完成安装"
  exit 1
fi

# 第 1 步：确保 COM bridge 在运行
echo "==> 确保 COM bridge 在运行..."
"$VENV_PY" -c "
from gcs_supervisor import ensure_bridge_process
import sys
ok = ensure_bridge_process(wait_s=15)
sys.exit(0 if ok else 1)
"
if [ $? -ne 0 ]; then
  echo -e "${RED}✗ COM bridge 启动失败${NC}"
  exit 1
fi
echo -e "${GREEN}✓ COM bridge 就绪${NC}"

# 第 2 步：运行 SLCAN 自动化测试
echo ""
echo "==> 运行 SLCAN 测试..."
cd "$ROOT/tools/com-bridge"
"$VENV_PY" test_slcan_auto.py
SLCAN_EXIT=$?
if [ $SLCAN_EXIT -ne 0 ]; then
  echo -e "${RED}✗ SLCAN 测试失败 (exit=$SLCAN_EXIT)${NC}"
  exit $SLCAN_EXIT
fi
echo -e "${GREEN}✓ SLCAN 测试通过${NC}"

# 第 3 步：注入 BatteryInfo 帧
echo ""
echo "==> 注入 BatteryInfo 帧..."
curl -sf -X POST http://127.0.0.1:8765/slcan-inject \
  -H "Content-Type: application/json" \
  -d '{"line":"T180444338000066412C004000000000C0"}' >/dev/null 2>&1
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ BatteryInfo 注入成功${NC}"
else
  echo -e "${YELLOW}⚠ BatteryInfo 注入失败（可能 COM bridge 未就绪）${NC}"
fi

# 第 4 步：运行 UI 测试
echo ""
echo "==> 运行 UI 测试..."
"$VENV_PY" "$ROOT/tools/com-bridge/test_ui_slcan_autotest.py"
UI_EXIT=$?
if [ $UI_EXIT -ne 0 ]; then
  echo -e "${YELLOW}⚠ UI 测试失败 (exit=$UI_EXIT)${NC}"
else
  echo -e "${GREEN}✓ UI 测试通过${NC}"
fi

# 完成
echo ""
echo "================================"
if [ $SLCAN_EXIT -eq 0 ]; then
  echo -e "${GREEN}PASS: SLCAN 自动化测试完成${NC}"
  echo ""
  echo "  UI 测试页面: http://127.0.0.1:8766/index.html?dc_autotest=1"
else
  echo -e "${RED}FAIL: SLCAN 自动化测试失败${NC}"
fi
echo "================================"
echo ""

exit $SLCAN_EXIT
