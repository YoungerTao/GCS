#!/bin/bash
# ============================================================
# GCS macOS 启动入口 — 双击运行
# 等价于 Windows 的 GCS.cmd
# 不修改任何 Windows 文件
# ============================================================

# 从脚本位置推导项目根目录（不依赖环境变量）
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VENV_PY="$ROOT/.venv/bin/python"
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
  echo "  请先运行安装器（仅需一次）："
  echo "    双击 macos/install.command"
  echo ""
  read -p "  按回车退出..."
  exit 1
fi

# 快速检查核心依赖
if ! "$VENV_PY" -c "import serial, pymavlink, dronecan" 2>/dev/null; then
  echo -e "  ${YELLOW}⚠ 依赖不完整，正在自动修复...${NC}"
  "$VENV_PY" -m pip install -r "$ROOT/requirements.txt" -q 2>/dev/null
  if ! "$VENV_PY" -c "import serial, pymavlink, dronecan" 2>/dev/null; then
    echo -e "  ${RED}✗ 依赖修复失败${NC}"
    echo "  请重新运行 macos/install.command"
    read -p "  按回车退出..."
    exit 1
  fi
fi

echo -e "  ${GREEN}✓${NC} 环境就绪"

# ============================================================
# 第 2 步：检查是否已运行（防重复启动）
# ============================================================
echo -e "${BLUE}[第 2 步]${NC} 检查运行状态..."

if curl -sf http://127.0.0.1:8766/__gcs/ping >/dev/null 2>&1; then
  echo -e "  ${GREEN}✓${NC} 服务已在运行（可能来自开机预热）"
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

mkdir -p "$ROOT/tools/logs"

# 设置 TMPDIR 并启动 gcs-launch.py
# TMPDIR 替代 Windows 的 TEMP 环境变量，供 gcs-launch.py 的锁文件使用
export TMPDIR="${TMPDIR:-/tmp}"
nohup "$VENV_PY" "$ROOT/tools/gcs-launch.py" \
  > "$ROOT/tools/logs/gcs-launch.stdout.log" 2>&1 &

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
