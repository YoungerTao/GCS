# GCS — macOS 使用指南

本项目基于 **Web Serial + MAVLink** 的浏览器端 ArduPilot 地面站。

**macOS 下的安装、启动与日常使用。**

---

## 快速开始

### 首次安装（仅需一次）

```bash
双击 macos/install.command
```

安装器会自动完成：
- ✅ 检查并安装 Homebrew（如没有）
- ✅ 检查并安装 Python 3（如没有）
- ✅ 检查并安装 Node.js（如没有）
- ✅ 创建 `.venv` 虚拟环境
- ✅ 安装所有 Python 依赖（pyserial、pymavlink、dronecan 等）
- ✅ 生成带狗头的 macOS 图标
- ✅ 在桌面创建 `GCS.app`（带狗图标）
- ✅ 可选：配置开机预热（强烈推荐）

### 日常启动

```bash
双击桌面 GCS.app（狗图标）
```

或：

```bash
双击 macos/start.command
```

### 关闭服务

```bash
双击 macos/stop.command
```

### 检查服务状态

```bash
双击 macos/check-stack.command
```

### 运行 DroneCAN SLCAN 测试

```bash
双击 macos/run-slcan-test.command
```

---

## 开机预热

如安装时启用了开机预热，每次开机后 GCS 服务会在后台预加载：
- 双击 GCS.app → **1-2 秒** → 浏览器打开主界面
- 不占用前台窗口，不影响其他操作

如需关闭预热：

```bash
launchctl unload ~/Library/LaunchAgents/com.gcs.prewarm.plist
```

如需重新启用：

```bash
launchctl load ~/Library/LaunchAgents/com.gcs.prewarm.plist
```

---

## 后台服务架构

```
GCS.app（或 start.command）
  ↓
后台运行三个 Python 服务：

端口 8766  — gcs-runtime.py（Web UI + 静态文件）
端口 8765  — com-bridge/server.py（串口通信桥接）
端口 8767  — gcs_watchdog.py（启动守护 + 健康检查）
端口 8768  — map-tiles/tile_server.py（地图瓦片缓存）
```

---

## 环境要求

安装器会自动安装以下工具：

| 工具 | 用途 | 安装方式 |
|------|------|---------|
| Python 3 (≥3.8) | 运行所有后台服务 | Homebrew |
| Node.js | DroneCAN 类型生成 | Homebrew |
| curl | 服务健康检查 | Homebrew |
| pyserial | 串口通信 | pip |
| pymavlink | MAVLink 协议 | pip |
| dronecan | DroneCAN 协议 | pip |
| Pillow | 图标生成 | pip |

---

## 常见问题

### 安装时 brew 下载慢

```bash
# 使用国内镜像源（以中科大为例）
export HOMEBREW_BREW_GIT_REMOTE="https://mirrors.ustc.edu.cn/brew.git"
export HOMEBREW_CORE_GIT_REMOTE="https://mirrors.ustc.edu.cn/homebrew-core.git"
export HOMEBREW_BOTTLE_DOMAIN="https://mirrors.ustc.edu.cn/homebrew-bottles"
# 然后重新运行 install.command
```

### 串口没有权限

```bash
# 将用户加入 dialout 组（如果串口设备归 dialout 组）
sudo dseditgroup -o edit -a $(whoami) -t user dialout
# 或直接 chmod 临时开放（需确认设备路径）
sudo chmod 666 /dev/cu.usbmodem*
```

### GCS.app 打不开（提示"无法验证开发者"）

```bash
# 在终端允许运行
xattr -d com.apple.quarantine ~/Desktop/GCS.app
```

### 启动后浏览器是空白页

检查后台服务是否正常：

```bash
双击 macos/check-stack.command
```

如服务未启动，查看日志：

```bash
cat tools/logs/gcs-launch.log
cat tools/logs/prewarm.stderr.log
```

### 如何完全卸载

```bash
# 关闭开机预热
launchctl unload ~/Library/LaunchAgents/com.gcs.prewarm.plist 2>/dev/null
rm -f ~/Library/LaunchAgents/com.gcs.prewarm.plist

# 删除桌面启动器
rm -rf ~/Desktop/GCS.app

# 删除虚拟环境（可选）
rm -rf .venv

# 删除日志（可选）
rm -rf tools/logs
```

---

## 文件结构

```
macos/                     ← macOS 专属文件
├── install.command        ← 安装器（首次运行）
├── start.command          ← 启动入口
├── stop.command           ← 关闭服务
├── check-stack.command    ← 检查状态
├── run-slcan-test.command ← DroneCAN 测试
├── build-icon.py          ← 图标生成脚本
├── gcs-dog.icns           ← 狗图标
└── README.md              ← 本文件

所有 Windows 文件（GCS.cmd、*.bat、*.ps1）未做任何修改。
```

---

## License

Internal use.
