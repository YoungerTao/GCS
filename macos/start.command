#!/bin/bash
# ============================================================
# GCS macOS 启动入口 — 双击运行
# 等价于 Windows 的 GCS.cmd
# 不修改任何 Windows 文件
# ============================================================

# 共享 macOS 环境（PATH / TMPDIR / GCS_ROOT）
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/macos/gcs-env.sh"
cd "$GCS_ROOT"
UI_URL="http://127.0.0.1:8766/index.html"
BOOT_PAGE="$ROOT/boot.html"

# 颜色
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'
BLUE='\033[0;34m'; NC='\033[0m'

echo ""
echo "╔═══════════════════════════════════════╗"
echo "║        GCS 地面站 — macOS 启动       ║"
echo "╚═══════════════════════════════════════╝"
echo ""

# ============================================================
# 第 1 步：检查环境
# ============================================================
echo -e "${BLUE}[第 1 步]${NC} 检查环境..."

if [ ! -f "$VENV_PY" ]; then
  echo -e "  ${RED}✗ 未检测到 .venv${NC}"
  echo ""
  echo "  请先双击 macos/install.command（全自动，仅需一次）"
  echo ""
  read -p "  按回车退出..."
  exit 1
fi

if ! "$VENV_PY" -c "import serial, pymavlink, dronecan" 2>/dev/null; then
  echo -e "  ${YELLOW}⚠ 依赖不完整，正在自动修复...${NC}"
  if ! python3 "$GCS_ROOT/tools/gcs-venv-ensure.py"; then
    echo -e "  ${RED}✗ 自动修复失败${NC}"
    echo "  请双击 macos/install.command"
    read -p "  按回车退出..."
    exit 1
  fi
  echo -e "  ${GREEN}✓${NC} 依赖已自动修复"
fi
if ! "$VENV_PY" -m pip --version &>/dev/null; then
  echo -e "  ${YELLOW}⚠ pip 异常，正在自动修复...${NC}"
  python3 "$GCS_ROOT/tools/gcs-venv-ensure.py" || {
    echo -e "  ${RED}✗ pip 修复失败，请双击 macos/install.command${NC}"
    read -p "  按回车退出..."
    exit 1
  }
fi

echo -e "  ${GREEN}✓${NC} 环境就绪"

# ============================================================
# 第 2 步：检查是否已运行（防重复启动）
# ============================================================
echo -e "${BLUE}[第 2 步]${NC} 检查运行状态..."

if curl -sf http://127.0.0.1:8766/__gcs/ping >/dev/null 2>&1; then
  echo -e "  ${GREEN}✓${NC} 服务已在运行（可能来自开机预热）"
  echo -e "  ${BLUE}·${NC} 检查 COM 桥接是否为最新代码（git pull 后自动刷新）..."
  if "$VENV_PY" "$GCS_ROOT/tools/gcs-mac-refresh.py" >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} COM 桥接已就绪"
  else
    echo -e "  ${YELLOW}⚠${NC} COM 桥接正在刷新，请稍候在浏览器中重连串口"
  fi
  open "$UI_URL"
  echo -e "  ${GREEN}✓${NC} 浏览器已打开"
  sleep 1
  exit 0
fi

echo -e "  ${GREEN}✓${NC} 准备启动服务"

# ============================================================
# 第 3 步：打开启动过渡页
# ============================================================
echo -e "${BLUE}[第 3 步]${NC} 打开启动页面..."

if [ -f "$BOOT_PAGE" ]; then
  open "$BOOT_PAGE"
  echo -e "  ${GREEN}✓${NC} 启动页已打开"
else
  echo -e "  ${YELLOW}⚠${NC} 未找到 boot.html"
fi

# ============================================================
# 第 4 步：后台启动 Python 服务
# ============================================================
echo -e "${BLUE}[第 4 步]${NC} 启动后台服务..."

mkdir -p "$GCS_LOG_DIR"

nohup "$VENV_PY" "$GCS_ROOT/tools/gcs-launch.py" \
  > "$GCS_LOG_DIR/gcs-launch.stdout.log" 2>&1 &

LAUNCH_PID=$!
echo -e "  ${GREEN}✓${NC} 服务进程已启动 (PID: $LAUNCH_PID)"

# ============================================================
# 第 5 步：等待服务就绪
# ============================================================
echo -e "${BLUE}[第 5 步]${NC} 等待服务就绪..."
echo "  （首次启动可能需要 10-30 秒）"

for i in $(seq 1 40); do
  if curl -sf http://127.0.0.1:8766/__gcs/ping >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} 服务就绪！"
    open "$UI_URL"
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║        ✓ GCS 启动成功！              ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"
    echo ""
    echo "  服务端口:"
    echo "    • 8766 — Web UI"
    echo "    • 8765 — COM 桥接"
    echo "    • 8767 — 启动守护"
    echo "    • 8768 — 地图瓦片"
    echo ""
    sleep 2
    exit 0
  fi
  sleep 1
done

# 超时后仍尝试打开
echo -e "  ${YELLOW}⚠${NC} 服务启动较慢，尝试打开浏览器..."
open "$UI_URL" 2>/dev/null || true
echo ""
echo "  如果页面未加载，请稍后刷新浏览器"
echo "  查看日志: cat tools/logs/gcs-launch.stdout.log"
echo ""
sleep 3
