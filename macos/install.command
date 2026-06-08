#!/bin/bash
# ============================================================
# GCS macOS 全自动安装器
# 首次配置，仅需一次。自动安装所有缺失的工具和依赖。
# 不修改任何 Windows 文件。
# ============================================================

# 共享 macOS 环境（PATH / TMPDIR / GCS_ROOT）
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/macos/gcs-env.sh"
cd "$GCS_ROOT"

# 颜色
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║         GCS macOS 安装器（首次配置，仅需一次）         ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ============================================================
# 辅助函数
# ============================================================
step() { echo -e "${BLUE}[$1/$TOTAL]${NC} $2"; }
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }

# ============================================================
# 第 1 步：检查/安装 Homebrew
# ============================================================
TOTAL=7
step 1 "检查系统包管理器 (Homebrew)..."

if command -v brew &>/dev/null; then
  ok "Homebrew 已安装 ($(brew --version 2>&1 | head -1))"
else
  echo "  正在安装 Homebrew（macOS 包管理器）..."
  echo "  这可能需要 2-5 分钟，取决于网络速度"
  echo ""

  # 使用中科大镜像加速（如有需要）
  export HOMEBREW_INSTALL_FROM_API=1
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

  # 配置 brew 路径（Apple Silicon M 芯片）
  if [ -f "/opt/homebrew/bin/brew" ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  fi

  if command -v brew &>/dev/null; then
    ok "Homebrew 安装完成"
  else
    fail "Homebrew 安装失败，请手动安装后重试"
    echo "  手动安装命令:"
    echo "    /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    read -p "  按回车退出..."
    exit 1
  fi
fi

# 确保 brew 在 PATH 中
if [ -f "/opt/homebrew/bin/brew" ] && ! command -v brew &>/dev/null; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

# ============================================================
# 第 2 步：检查/安装 Python 3
# ============================================================
step 2 "检查 Python 3..."

PY=""
for cmd in python3 python; do
  if command -v "$cmd" &>/dev/null; then
    PY="$cmd"
    break
  fi
done

if [ -n "$PY" ]; then
  VER=$("$PY" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null)
  if "$PY" -c "import sys; exit(0 if sys.version_info >= (3,8) else 1)" 2>/dev/null; then
    ok "Python $VER (满足 ≥3.8 要求)"
  else
    warn "Python $VER 版本过低，升级中..."
    brew upgrade python
    PY="python3"
    ok "Python 已升级到 $("$PY" --version 2>&1 | cut -d' ' -f2)"
  fi
else
  echo "  未检测到 Python，正在通过 Homebrew 安装..."
  brew install python
  PY="python3"
  ok "Python 安装完成 ($("$PY" --version 2>&1))"
fi

# ============================================================
# 第 3 步：检查/安装 Node.js
# ============================================================
step 3 "检查 Node.js..."

if command -v node &>/dev/null; then
  ok "Node.js 已安装 ($(node --version 2>&1))"
else
  echo "  未检测到 Node.js，正在通过 Homebrew 安装..."
  brew install node
  if command -v node &>/dev/null; then
    ok "Node.js 安装完成 ($(node --version 2>&1))"
  else
    warn "Node.js 安装失败（不影响核心功能，仅 DroneCAN 类型生成需要）"
  fi
fi

# ============================================================
# 第 4 步：检查/安装 curl
# ============================================================
step 4 "检查 curl..."

if command -v curl &>/dev/null; then
  ok "curl 已安装"
else
  echo "  正在安装 curl..."
  brew install curl
  ok "curl 安装完成"
fi

# ============================================================
# 第 5 步：创建虚拟环境并安装 Python 依赖
# ============================================================
step 5 "创建 Python 虚拟环境并安装依赖..."

if [ -f "$VENV_PY" ]; then
  warn ".venv 已存在"
else
  echo "  正在创建虚拟环境..."
fi

echo -e "${BLUE}  检查 pip 并安装依赖（损坏时自动修复）...${NC}"
if ! "$PY" "$GCS_ROOT/tools/gcs-venv-ensure.py"; then
  fail "虚拟环境配置失败"
  echo "  请检查网络后重新双击 install.command"
  read -p "  按回车退出..."
  exit 1
fi
ok "核心依赖安装完成 (pyserial, pymavlink, dronecan)"

# 可选工具依赖（失败不阻断）
if "$VENV_PY" -m pip show Pillow &>/dev/null; then
  ok "Pillow 已就绪（图标生成）"
else
  warn "Pillow 未安装（图标生成需要，可稍后重跑 install.command）"
fi
if "$VENV_PY" -m pip show playwright &>/dev/null; then
  ok "Playwright 已就绪（截图工具）"
else
  warn "Playwright 未安装（截图工具需要，可稍后重跑 install.command）"
fi

# ============================================================
# 第 6 步：生成图标 + 创建桌面 GCS.app
# ============================================================
step 6 "生成图标并创建桌面启动器..."

# 生成 .icns
ICON="$ROOT/macos/gcs-dog.icns"
if [ ! -f "$ICON" ]; then
  "$VENV_PY" "$ROOT/macos/build-icon.py"
fi

if [ -f "$ICON" ] && [ -s "$ICON" ]; then
  ok "图标已就绪 ($ICON)"
else
  warn "图标生成失败，将使用默认图标"
  ICON=""
fi

# 创建桌面 GCS.app
DESKTOP="$HOME/Desktop"
APP="$DESKTOP/GCS.app"

# 清除旧的
rm -rf "$APP"

mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# Info.plist — 写死项目绝对路径，不依赖环境变量
cat > "$APP/Contents/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>GCS</string>
    <key>CFBundleDisplayName</key>
    <string>GCS 地面站</string>
    <key>CFBundleExecutable</key>
    <string>GCS</string>
    <key>CFBundleIconFile</key>
    <string>gcs-dog</string>
    <key>CFBundleIdentifier</key>
    <string>com.gcs.desktop</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>GCSProjectPath</key>
    <string>$ROOT</string>
</dict>
</plist>
EOF

# 可执行文件
cat > "$APP/Contents/MacOS/GCS" << 'SCRIPT'
#!/bin/bash
# GCS.app 启动器 — 通过 Terminal 执行 start.command（确保终端窗口显示）
APP_PATH="$0"
PLIST="${APP_PATH%/Contents/MacOS/GCS}/Contents/Info.plist"
ROOT=$(/usr/libexec/PlistBuddy -c "Print GCSProjectPath" "$PLIST" 2>/dev/null)
if [ -z "$ROOT" ] || [ ! -f "$ROOT/macos/start.command" ]; then
  ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
fi
open -a Terminal "$ROOT/macos/start.command"
SCRIPT
chmod +x "$APP/Contents/MacOS/GCS"

# 复制图标
if [ -n "$ICON" ] && [ -f "$ICON" ]; then
  cp "$ICON" "$APP/Contents/Resources/"
fi

ok "桌面 GCS.app 已创建"

# ============================================================
# 第 7 步：可选 — 配置 launchd 开机预热
# ============================================================
step 7 "配置开机预热..."

echo ""
echo -e "${YELLOW}  ❓ 是否启用开机预热？（强烈推荐）${NC}"
echo "  启用后每次开机 GCS 会在后台预加载"
echo "  之后双击桌面图标打开仅需 1-2 秒"
echo "  （不启用则需要 10-30 秒）"
echo ""
read -p "  [Y/n]: " ENABLE

if [[ "$ENABLE" != "n" && "$ENABLE" != "N" ]]; then
  LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
  mkdir -p "$LAUNCH_AGENTS"

  PLIST="$LAUNCH_AGENTS/com.gcs.prewarm.plist"

  # launchd 子进程 PATH/TMPDIR 与 gcs-env.sh 保持一致
  BREW_PREFIX=$(brew --prefix 2>/dev/null || echo "/opt/homebrew")
  BREW_BIN="$BREW_PREFIX/bin"
  LAUNCH_PATH="${GCS_ROOT}/.venv/bin:${BREW_BIN}:/usr/local/bin:/usr/bin:/bin"

  cat > "$PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.gcs.prewarm</string>

    <key>ProgramArguments</key>
    <array>
        <string>$GCS_ROOT/.venv/bin/python</string>
        <string>$GCS_ROOT/tools/gcs_watchdog.py</string>
        <string>--prewarm-runtime</string>
        <string>--prewarm-runtime</string>
    </array>

    <key>WorkingDirectory</key>
    <string>$GCS_ROOT</string>

    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>$LAUNCH_PATH</string>
        <key>TMPDIR</key>
        <string>$TMPDIR</string>
        <key>HOME</key>
        <string>$HOME</string>
        <key>GCS_ROOT</key>
        <string>$GCS_ROOT</string>
        <key>GCS_PLATFORM</key>
        <string>macos</string>
    </dict>

    <key>StandardOutPath</key>
    <string>$GCS_LOG_DIR/prewarm.stdout.log</string>
    <key>StandardErrorPath</key>
    <string>$GCS_LOG_DIR/prewarm.stderr.log</string>
</dict>
</plist>
EOF

  # 加载到 launchd
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST" 2>/dev/null || true

  if [ $? -eq 0 ]; then
    ok "开机预热已配置并启动（后台运行中）"
  else
    warn "开机预热配置写入成功但加载失败"
    echo "  可后续手动加载: launchctl load $PLIST"
  fi
else
  ok "跳过开机预热配置"
fi

# 创建日志目录
mkdir -p "$ROOT/tools/logs"

# ============================================================
# 完成
# ============================================================
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo -e "║           ${GREEN}✓ 安装完成！${NC}                             ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "  现在可以："
echo "    1. 双击桌面 GCS.app（狗图标）启动地面站"
echo "    2. 或双击 macos/start.command"
echo ""
echo "  如需关闭服务："
echo "    双击 macos/stop.command"
echo ""
echo "  详细说明见：macos/README.md"
echo ""

# 等待用户确认
read -p "  按回车退出..."
