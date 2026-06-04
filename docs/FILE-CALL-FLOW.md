# GCS Windows 三文件调用说明

## 快速对比

| 文件 | 何时运行 | 功能 | 用户可见 |
|------|---------|------|---------|
| **GCS-智能安装.bat** | 首次安装 | 检查Python → 下载Python → 创建.venv → 安装依赖 → 创建快捷方式 | ✓ 是 |
| **GCS.cmd** | 每次启动 | 检查依赖 → 防止重复 → 启动3个服务 → 打开浏览器 | ✓ 是 |
| **GCS-Prewarm.cmd** | 开机自动 | 启动Watchdog → 预加载Runtime → 后台待命 | ❌ 否 |

---

## 【1】GCS-智能安装.bat（安装入口）

### 目的
一键完成 Windows 环境配置（仅需运行一次）

### 执行流程

```
用户双击 GCS-智能安装.bat
    ↓
[第1步] 检查 Python 环境
    ├─ 查找系统中的 Python
    │  (依次尝试: py launcher → python → python3)
    ├─ 检查版本 ≥ 3.8?
    ├─ 检查是否 Microsoft Store Python?
    └─ 如不满足任何条件 → 自动下载 Python 3.11 并无提示安装
    
    └─ 技术细节：
       cmd: py -c "python --version"
       powershell: [System.Version]$version

[第2步] 调用 PowerShell setup-python-deps.ps1
    ├─ 创建虚拟环境
    │  cmd: python -m venv .venv
    ├─ 升级 pip/setuptools/wheel
    │  cmd: .venv\Scripts\pip install --upgrade pip setuptools wheel
    ├─ 安装依赖
    │  cmd: .venv\Scripts\pip install -r requirements.txt
    │  (安装包: pyserial, pymavlink, dronecan, monotonic)
    └─ 验证
       cmd: .venv\Scripts\python -c "import dronecan, serial, pymavlink"

[第3步] 调用 PowerShell install-gcs-desktop.ps1 -WatchdogStartup
    ├─ 创建桌面快捷方式
    │  GCS.lnk → %REPO_ROOT%\GCS.cmd
    ├─ 创建开始菜单快捷方式
    │  %ProgramFiles%\GCS\GCS.lnk → GCS.cmd
    └─ 创建开机启动快捷方式（-WatchdogStartup 参数）
       %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\
       GCS Watchdog.lnk → %REPO_ROOT%\GCS-Prewarm.cmd

[最终状态]
✓ .venv 虚拟环境已创建
✓ 所有依赖已安装
✓ 桌面快捷方式已创建（可用于启动）
✓ 开机启动快捷方式已创建（可选加速）
```

### 调用关系
```
GCS-智能安装.bat
├─ PowerShell setup-python-deps.ps1
│  ├─ python -m venv .venv
│  ├─ pip install --upgrade pip setuptools wheel
│  ├─ pip install -r requirements.txt
│  └─ python -c "import dronecan, serial, pymavlink"
└─ PowerShell install-gcs-desktop.ps1 -WatchdogStartup
   ├─ 创建 GCS.lnk
   ├─ 创建开始菜单快捷方式
   └─ 创建 GCS Watchdog.lnk（开机启动）
```

### 用户体验
- **执行时间**: 1-3 分钟（首次下载 Python 可能较长）
- **显示内容**: 进度提示、完成提示
- **错误处理**: 清晰的错误信息和下一步建议
- **何时再次运行**: 基本不需要（除非删除了 .venv）

---

## 【2】GCS.cmd（日常启动入口）

### 目的
每次启动应用时运行（用户使用最频繁）

### 执行流程

```
用户双击桌面 GCS 图标 或 GCS.cmd
    ↓
[第1步] 定位 Python
    ├─ 查找顺序：
    │  1. .venv\Scripts\pythonw.exe（优先，无窗口）
    │  2. .venv\Scripts\python.exe
    │  3. 系统 pythonw / python
    │
    └─ 设置变量:
       set "PY=.venv\Scripts\pythonw.exe" (or fallback)

[第2步] 验证依赖完整性
    ├─ 调用 Python 检查：
    │  python -c "import dronecan, serial, pymavlink"
    ├─ 如成功 ✓ → 继续
    └─ 如失败 ✗ → 显示错误，要求重新安装
       "缺少 DroneCAN / 串口桥核心 Python 依赖..."

[第3步] 检查是否已运行（防止重复启动）
    ├─ 检查 8766 端口（Runtime）
    │  curl -s http://127.0.0.1:8766/__gcs/ping
    ├─ 如已运行 → 
    │  ├─ 直接打开浏览器 http://127.0.0.1:8766/index.html
    │  └─ 退出 GCS.cmd
    │
    └─ 如未运行 → 继续启动

[第4步] 显示启动页
    ├─ 打开 http://127.0.0.1:8767/launch（启动引导页）
    └─ 创建锁文件 %TEMP%\gcs-launch.lock（防止重复）

[第5步] 后台启动 Python 服务（无窗口）
    ├─ PowerShell 命令：
    │  powershell -NoProfile -WindowStyle Hidden -Command ^
    │    "Start-Process -FilePath '%PY%' ^
    │     -ArgumentList 'tools\gcs-launch.py','--boot-page' ^
    │     -WorkingDirectory '%CD%' -WindowStyle Hidden"
    │
    └─ 这启动了 gcs-launch.py，其内部会启动：
       ├─ gcs_supervisor.py (端口 8765) - COM 桥接（串口通信）
       ├─ gcs-runtime.py (端口 8766) - 核心运行时
       └─ gcs_watchdog.py (端口 8767) - 启动守护 + watchdog

[第6步] 等待服务就绪
    ├─ gcs-launch.py 内部循环检查：
    │  while !service_ready:
    │    ping http://127.0.0.1:8766/__gcs/ping
    │    sleep(100ms)
    │
    └─ 服务就绪后 → 自动打开浏览器

[最终状态]
✓ 三个 Python 服务运行中（8765, 8766, 8767）
✓ 浏览器显示 http://127.0.0.1:8766/index.html
✓ 用户看到 Web UI，可以开始使用
```

### 调用关系
```
GCS.cmd
├─ [检查] curl http://127.0.0.1:8766/__gcs/ping
├─ [验证] python -c "import dronecan, serial, pymavlink"
└─ [启动] PowerShell Start-Process
   └─ python tools\gcs-launch.py --boot-page
      └─ gcs-launch.py 启动：
         ├─ gcs_supervisor.py (8765)
         │  └─ tools/com-bridge/server.py
         │     └─ 管理 COM 桥接
         ├─ gcs-runtime.py (8766)
         │  └─ 核心运行时
         └─ gcs_watchdog.py (8767)
            └─ 启动守护 + 监听
```

### 用户体验
- **执行时间**: 10-30 秒（加载 Python）
- **显示内容**: 启动页面 → 浏览器
- **错误处理**: 依赖检查失败时清晰提示
- **防护机制**: 自动检测已运行，防止重复启动

---

## 【3】GCS-Prewarm.cmd（开机预热 - 可选）

### 目的
开机时后台预加载 Python 运行时，加快首次启动速度（可选）

### 执行流程

```
Windows 启动时
    ↓
自动运行快捷方式：
  %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\GCS Watchdog.lnk
    ↓
执行 GCS-Prewarm.cmd
    ↓
[第1步] 验证依赖（快速检查）
    ├─ 查找 Python
    │  set "PY=.venv\Scripts\pythonw.exe" (or fallback)
    ├─ 检查 import dronecan, serial, pymavlink
    └─ 如失败 → 显示提示后退出（无影响，不影响开机）

[第2步] 后台启动 Watchdog 服务
    ├─ PowerShell 命令：
    │  powershell -NoProfile -WindowStyle Hidden -Command ^
    │    "Start-Process -FilePath '%PY%' ^
    │     -ArgumentList 'tools\gcs_watchdog.py','--prewarm-runtime' ^
    │     -WorkingDirectory '%CD%' -WindowStyle Hidden"
    │
    └─ 参数 --prewarm-runtime 告诉 watchdog：
       "在后台启动 Runtime，然后等待"

[第3步] gcs_watchdog.py 内部逻辑
    ├─ 检查 Runtime (8766 端口) 是否已运行
    ├─ 如未运行 → 启动 gcs-runtime.py
    │  这会预加载 Python modules 到内存
    ├─ 预加载完成 → 进入等待状态
    │  gcs_watchdog 继续后台运行，随时准备启动其他服务
    │
    └─ 不显示任何界面（无窗口）

[最终状态]
✓ Python Runtime 加载到内存
✓ Watchdog 后台监听（占用最少资源）
✓ 当用户双击启动时，Runtime 已就绪

[时间节省]
没有 Prewarm:
  GCS.cmd → 加载 Python (5-10s) → 加载 Runtime (5-15s) → 用户看到 UI (10-30s 总计)

启用 Prewarm:
  开机时: GCS-Prewarm 预加载 Runtime (无感知，后台)
  GCS.cmd → Runtime 已就绪 (< 2s 总计)

节省时间: 约 80-90%
```

### 调用关系
```
GCS-Prewarm.cmd (开机自动)
├─ [检查] python -c "import dronecan, serial, pymavlink"
└─ [启动] PowerShell Start-Process
   └─ python tools\gcs_watchdog.py --prewarm-runtime
      └─ gcs_watchdog.py 内部：
         ├─ 检查 Runtime (8766) 是否运行
         ├─ 如未运行 → 启动 gcs-runtime.py
         │  └─ tools/gcs-runtime.py (预加载 modules)
         └─ 进入后台监听状态
```

### 用户体验
- **执行时间**: 后台无感知（开机时自动）
- **显示内容**: 无（后台运行）
- **对系统影响**: 最小（仅预加载，占用少量内存）
- **效果**: 后续启动时 < 2 秒（vs 原来的 10-30 秒）

---

## 完整时序图

```
【首次安装】
t=0:     用户双击 GCS-智能安装.bat
t=1:     检查 Python → 下载 Python (if needed)
t=30s:   创建 .venv
t=60s:   pip install -r requirements.txt
t=180s:  创建快捷方式
t=180s:  ✓ 安装完毕！

【首次启动（无 Prewarm）】
t=0:     用户双击桌面 GCS 图标 (调用 GCS.cmd)
t=1:     检查依赖
t=2:     检查是否已运行
t=5:     后台启动 gcs-launch.py
t=8:     加载 Python modules
t=15:    启动 Runtime (8766)
t=20:    启动 Supervisor (8765)
t=25:    启动 Watchdog (8767)
t=28:    浏览器打开
t=30:    用户看到 UI ✓

【首次启动（有 Prewarm）】
开机:    GCS-Prewarm.cmd 后台预加载 Runtime
         (用户无感知)

t=0:     用户双击桌面 GCS 图标 (调用 GCS.cmd)
t=1:     检查依赖
t=2:     检查是否已运行 (找到已运行的 Runtime)
t=3:     浏览器打开
t=5:     用户看到 UI ✓

时间节省: 30s → 5s（快 6 倍！）

【重复启动（无 Prewarm）】
t=0:     用户双击 GCS 图标
t=1:     检查依赖
t=2:     ping 8766 → 成功（已在运行）
t=3:     浏览器打开 (http://127.0.0.1:8766)
t=4:     用户看到 UI ✓

【日常使用】
启动      → 依赖检查 → 防重复 → 浏览器 → Web UI
(< 2s，如启用 Prewarm)
(10-30s，未启用 Prewarm)
```

---

## 总结

| 文件 | 时机 | 作用 | 依赖 |
|------|------|------|------|
| **GCS-智能安装.bat** | 首次使用 | 配置环境、创建快捷方式 | PowerShell、网络 |
| **GCS.cmd** | 每次启动 | 启动应用、打开浏览器 | .venv、Python |
| **GCS-Prewarm.cmd** | 开机（可选） | 预加载运行时、加速启动 | .venv、Python |

### 推荐用法

**方案 A：不启用开机启动（简单）**
```
1. 首次：双击 GCS-智能安装.bat（安装）
2. 日常：双击桌面 GCS 图标（启动）
   初始化时间：10-30 秒
```

**方案 B：启用开机启动（快速）**
```
1. 首次：双击 GCS-智能安装.bat（选择启用开机启动）
2. 日常：双击桌面 GCS 图标（启动）
   初始化时间：< 2 秒（因为开机已预加载）
```

