# Windows 安装指南

## 快速开始（3 步）

1. **下载官方 Python**
   - 访问 https://www.python.org/downloads/
   - 选择 Windows installer （NOT Microsoft Store）
   - 安装时勾选 ✓ "Add python.exe to PATH" 和 ✓ "py launcher"

2. **运行安装脚本**
   - 双击仓库根目录的 `GCS-安装桌面快捷方式.bat`
   - 等待安装完成（第一次需要 1-3 分钟，取决于网络）

3. **启动 GCS**
   - 双击桌面上的 **GCS** 图标
   - 或双击仓库根目录的 `GCS.cmd`

---

## 前置环境检查（可选但推荐）

如果不确定环境是否满足要求，可以先运行诊断脚本：

```powershell
powershell -ExecutionPolicy Bypass -File tools\check-windows-env.ps1
```

**检查项：**
- ✓ Python 3.8+ 版本
- ✓ 非 Microsoft Store Python
- ✓ venv 模块可用
- ✓ pip 工作正常
- ✓ 磁盘空间充足（≥1 GB）
- ✓ 路径合法性（长度 < 240 字符）
- ✓ Visual C++ Build Tools（可选，用于编译 dronecan）

---

## 系统要求

### 必需
- **操作系统**: Windows 10 / Windows 11
- **Python**: 3.8+ （来自 https://www.python.org/downloads/）
- **磁盘空间**: ≥ 1 GB（用于 .venv 和依赖包）
- **网络**: 用于下载 Python 包

### 推荐
- **Visual C++ Build Tools**: 用于编译某些 Python 扩展包
  - 下载: https://visualstudio.microsoft.com/downloads/
  - 选择: "Desktop development with C++"

### ⚠️ 不支持
- ❌ Microsoft Store Python （沙箱限制，无法访问 COM 端口）
- ❌ Python < 3.8 （不支持部分库）

---

## 安装步骤详解

### 第 1 步：下载并安装 Python

1. 访问 https://www.python.org/downloads/
2. 点击 "Download Python 3.x.x" （最新版本）
3. 运行安装器
4. **重要：** 勾选以下两个选项：
   ```
   ☑ Add Python 3.x to PATH
   ☑ Install py launcher
   ```
5. 点击 "Install Now" 完成安装

**验证安装：** 打开 Command Prompt 运行：
```cmd
python --version
```
应该显示 `Python 3.8.x` 或更新版本。

### 第 2 步：运行 GCS 安装脚本

1. 打开 Windows 资源管理器，导航到 GCS 仓库根目录
2. 双击 **GCS-安装桌面快捷方式.bat**
3. 脚本会自动：
   - 检查 Python 环境
   - 创建虚拟环境 `.venv/`
   - 安装依赖包：pyserial, pymavlink, dronecan
   - 创建桌面快捷方式
   - 创建开始菜单快捷方式

**预期输出：**
```
[1/4] 正在检查 Python 环境并准备 .venv 虚拟环境...
✓ Python 版本: 3.11
✓ venv 模块可用
Creating virtual environment: C:\...\GCS\.venv
✓ Python 版本: 3.11
✓ pip: pip 24.0 from ...

Installing GCS core dependencies...
Successfully installed pyserial pymavlink dronecan monotonic ...
OK: 核心依赖就绪 (pyserial, pymavlink, dronecan)

[2/4] 依赖安装成功...
[3/4] 正在创建桌面快捷方式...
Desktop and Start Menu shortcut created: GCS -> C:\...\GCS.cmd

[4/4] 安装完成！
```

### 第 3 步：启动 GCS

启动方式（任选其一）：

1. **推荐：** 双击桌面上的 **GCS** 图标
2. 或双击仓库根目录的 `GCS.cmd`
3. 或在 Start Menu 搜索 "GCS" 后点击

**首次启动** 会自动：
- 启动 COM Bridge (端口 8765)
- 启动 Runtime (端口 8766)
- 启动 Watchdog (端口 8767)
- 打开浏览器显示 Web UI

---

## 常见问题解决

### ❌ "Python not found"

**原因**: Python 未安装或不在 PATH 中

**解决方案**:
1. 从 https://www.python.org/downloads/ 下载官方 Python installer
2. 重新安装，**必须勾选 "Add python.exe to PATH"**
3. 重启 Command Prompt
4. 验证：`python --version`

### ❌ "Microsoft Store Python detected"

**原因**: 系统优先使用了 Microsoft Store 版本

**解决方案**:
1. 从 https://www.python.org/downloads/ 安装官方 Python
2. 卸载 Microsoft Store Python：设置 → 应用 → 搜索 "Python" → 卸载
3. 删除 GCS 根目录下的 `.venv` 文件夹
4. 重新运行 `GCS-安装桌面快捷方式.bat`

### ❌ "pip install failed" / 编译错误

**原因**: 缺少 Visual C++ Build Tools

**解决方案**:
1. 下载 Visual C++ Build Tools: https://visualstudio.microsoft.com/downloads/
2. 选择 "Desktop development with C++"
3. 安装完成后，删除 `.venv` 文件夹
4. 重新运行 `GCS-安装桌面快捷方式.bat`

### ❌ "slcan is not open"

**原因**: 未连接 CAN 硬件（正常现象）

**解决方案**:
- 如果没有 USB-CAN 适配器，忽略此错误
- 只使用 MAVLink 连接飞控
- 或在 DroneCAN 面板改用 "MAVLink CAN_FORWARD"

### ❌ "WriteFile PermissionError"

**原因**: Microsoft Store Python 无法访问 COM 端口

**解决方案**:
1. 参考上面 "Microsoft Store Python detected" 的解决方案
2. 确保使用官方 Python

---

## 环境清理和卸载

### 临时清理（不删除配置）

```cmd
# 删除虚拟环境和缓存
rmdir /s /q .venv
del /q tools\com-bridge\*.log
```

然后重新运行 `GCS-安装桌面快捷方式.bat` 重新安装

### 完全卸载

```cmd
# 删除虚拟环境
rmdir /s /q .venv

# 删除快捷方式
del "%USERPROFILE%\Desktop\GCS.lnk"
del "%USERPROFILE%\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\GCS\GCS.lnk"

# 删除日志
del /q *.log
del /q tools\com-bridge\*.log
del /q tools\*.log
```

---

## 开发者模式

### 从命令行启动（带错误输出）

```cmd
# 方式 1: 使用 Start-GCS.bat（显示控制台）
Start-GCS.bat

# 方式 2: 直接运行 Python
.venv\Scripts\python.exe tools\gcs-launch.py --boot-page
```

### 手动调试

```cmd
# 启用调试模式
set DEBUG=1
set PYTHONUNBUFFERED=1

# 启动各组件
.venv\Scripts\python.exe tools\gcs_supervisor.py
.venv\Scripts\python.exe tools\gcs-runtime.py
.venv\Scripts\python.exe tools\gcs_watchdog.py
```

### 查看日志

```cmd
# COM Bridge 日志
type tools\com-bridge\server.stderr.log
type tools\com-bridge\server.stdout.log

# Watchdog 日志
type tools\watchdog.stderr.log
```

---

## 更新和卸载 Python 包

### 升级单个包

```cmd
.venv\Scripts\pip install --upgrade pyserial
.venv\Scripts\pip install --upgrade pymavlink
.venv\Scripts\pip install --upgrade dronecan
```

### 查看已安装的包

```cmd
.venv\Scripts\pip list
```

### 重新安装依赖

```cmd
.venv\Scripts\pip install -r requirements.txt
```

---

## 支持和反馈

如遇到问题，请：

1. 运行诊断脚本获取环境信息:
   ```powershell
   powershell -ExecutionPolicy Bypass -File tools\check-windows-env.ps1 > env-report.txt
   ```

2. 检查日志:
   ```cmd
   type tools\com-bridge\server.stderr.log
   type tools\watchdog.stderr.log
   ```

3. 提供以下信息到 Issue:
   - `python --version` 的输出
   - `env-report.txt` 的内容
   - 错误日志内容
   - Windows 版本（Win10/Win11）
