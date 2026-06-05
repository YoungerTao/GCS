# GCS — Web-Based ArduPilot Ground Control Station

一个基于 Web Serial + MAVLink 的浏览器端 ArduPilot 地面站，支持 HUD、地图、参数读写、传感器校准等功能。

---

## ⚡ 快速开始

👉 **新用户？** 查看 [`INSTALL.md`](INSTALL.md)（3 步启动）  |  [`macOS 指南`](macos/README.md)

---

### 平台入口

| 平台 | 首次安装 | 日常启动 | 关闭服务 |
|------|---------|---------|---------|
| **macOS** | `macos/install.command` | 桌面 `GCS.app`（狗图标） | `macos/stop.command` |
| **Windows** | `GCS-智能安装.bat` | 桌面 `GCS` 图标 | 任务管理器 |

---

## 📋 项目结构

```
gcs-project/
├── index.html                 # 主入口（含完整页面结构）
├── README.md                  # 本文件
├── CSS/
│   ├── base/
│   │   └── layout.css         # 主布局：顶栏、主区域、底栏、概览/设置页
│   └── components/
│       ├── all-params.css     # 全部参数表
│       ├── quick-grid.css     # 快速遥测网格
│       ├── sensor-calibration.css
│       └── status-messages.css
├── JS/
│   ├── core/
│   │   ├── globals.js         # 全局变量、log 函数
│   │   ├── mavlink.js         # MAVLink 解析 (CRC/parse/handle)
│   │   ├── mavlink-helpers.js # 辅助函数 (syncToTelemetry, renderSortedParams 等)
│   │   ├── ardupilot-board-types.js
│   │   └── ardupilot-devid.js
│   ├── services/
│   │   ├── serial.js          # Web Serial 连接/断开/收发
│   │   ├── com-bridge.js      # 端口枚举 + 本地 COM 桥接
│   │   └── param-loader.js    # 参数加载遮罩 UI
│   ├── ui/
│   │   ├── hud-map-tabs.js    # HUD Canvas + Leaflet 地图 + 选项卡
│   │   ├── quick-grid.js      # 快速遥测网格
│   │   ├── status-messages.js # STATUSTEXT 消息面板
│   │   ├── splitter.js        # 可拖拽分割器
│   │   ├── overview-sensors.js
│   │   ├── airframe-setup.js
│   │   ├── rc-setup.js
│   │   ├── motor-setup.js, motor-maps.js
│   │   ├── power-setup.js
│   │   ├── accel-calib-three.js, accel-calibration.js
│   │   ├── compass-calibration.js, sensor-calibration.js
│   │   ├── dronecan-setup.js
│   │   └── all-params.js
│   └── data/                  # 参数数据库、翻译缓存
│       ├── apm-param-db.json
│       ├── apm-param-db.en.json
│       ├── apm-param-translate-cache.json
│       └── param-hints.json
├── assets/icons/              # SVG 图标
├── tools/com-bridge/          # 本地 COM 桥接 Python 服务
├── translate_params.py        # 参数翻译脚本（Google / MyMemory 机翻）
└── translate_params_ai.py     # 参数翻译脚本（OpenAI AI 重译）
```

## 参数说明翻译

默认仓库里的 `translate_params.py` 走的是 Google / MyMemory 机翻，适合快速铺底，但术语质量一般。

如果要重译参数说明，优先使用新的 AI 脚本：

```bash
set OPENAI_API_KEY=你的密钥
python translate_params_ai.py --model gpt-5.4-mini --limit 200
```

说明：

- 读取英文源库：`JS/data/apm-param-db.en.json`
- 输出中文库：`JS/data/apm-param-db.json`
- AI 缓存：`JS/data/apm-param-translate-cache.ai.json`
- 默认会先备份当前输出库到：`JS/data/apm-param-db.pre-ai-backup.json`

## 启动（开发：Windows / macOS 相同）

需要：**VS Code / Cursor + Live Server 扩展 + Python 3 + Chrome**；内置浏览器为可选第二条路线。

**重要：必须使用官方 Python（python.org 下载的 installer），不要用 Microsoft Store / 应用商店版 Python。**
Store 版 Python 路径含 `WindowsApps`，受 Windows 沙箱限制，会导致：
- 无法读取 `JS/data/apm-param-db.json`（UI 显示“未加载 apm-param-db.json”）
- DroneCAN 节点参数 Load/Refresh 失败：`WriteFile failed (PermissionError(13, '设备不识别此命令。'))`
Store 版即使能启动，也无法访问串口和 clone 后的项目目录。

推荐：从 https://www.python.org/downloads/windows/ 下载，安装时勾选 “Add Python to PATH” 和 “py launcher”。

## 首次使用（新用户 / git clone 后 —— 最高优先级推荐流程）

普通用户（非开发者）请严格按以下 4 步操作，即可实现：`git clone → 双击一个 bat → 双击桌面图标` 即可正常使用（包括 DroneCAN Node Tool 读取节点参数）。

1. `git clone <你的仓库地址> GCS`  
   `cd GCS`

2. **双击仓库根目录的 `GCS-安装桌面快捷方式.bat`**  
   - 它会自动完成：检查 Python → 创建 `.venv` 虚拟环境 → `pip install -r requirements.txt`（自动包含 `dronecan`、`pyserial`、`pymavlink` 等核心依赖）→ 创建桌面 + 开始菜单 “GCS” 快捷方式。
   - 全程有清晰的中文进度提示（[1/4]、[2/4]...）和成功/失败反馈。
   - **注意**：脚本会自动拒绝 Microsoft Store 版 Python（会给出详细错误 + python.org 官方安装指引）。

3. 双击桌面生成的 “GCS” 图标（或双击 `GCS.cmd`）启动 GCS。

4. 进入 DroneCAN 设置面板 → 选择对应 SLCAN / CAN 模式 → 打开 “DroneCAN 节点工具” 即可读取 Node 70 等设备的参数列表和详情。

**requirements.txt** 是项目核心 Python 依赖的单一来源（位于仓库根目录）。以后添加新核心依赖只需编辑它，然后让用户重新运行安装 bat 即可。

---

**首次在本机（尤其 macOS）开发前执行一次：**

```bash
./tools/setup-python-deps.sh
```

会在项目下创建 `.venv` 并安装核心依赖（requirements.txt）。之后 Go Live / 内置浏览器才能在下拉里看到串口。

### 方式 A：Live Server → Go Live → Chrome（默认，与原先一致）

1. 在 `index.html` 上点 **Open with Live Server / Go Live**（端口 **5501**）。
2. Live Server **自带**打开 Chrome（不要用 `AdvanceCustomBrowserCmdLine` 写 `python --chrome`，扩展会按 `--` 拆坏命令）。
3. 页面加载后 `gcs-auto-start.js` **自动**后台拉起 watchdog / COM 桥。

终端可手动测：`python3 .vscode/live-server-go.py http://127.0.0.1:5501/index.html`

### 方式 B：Cursor 右键「Open in Browser」（内置页）

**顺序（重要）：**

1. 先 **Open with Live Server** 一次（让 5501 跑起来，可与 Chrome 同时开）  
2. 再 **Open in Browser** → 会从 `file://` 自动跳到 **`http://127.0.0.1:5501/index.html`**，按钮/界面可正常点击  

不要单独用 `file://` 或跳到 8766 开发（曾导致全屏遮罩卡住、按键无反应）。

改代码后在内置页 **手动刷新**；自动刷新仍靠 Live Server。

内置浏览器 **没有** Chrome 那种 Web Serial 弹窗（Cursor 限制）。请用顶部 **串口下拉**（COM 桥枚举，Mac 上为 `/dev/cu.*`）→ **连接串口**。可先选 **↻ 刷新 COM 列表**。外置 Chrome 仍可用弹窗或下拉两种方式。

### 通用说明

- 页面地址保持 `http://127.0.0.1:5501/...`，不跳转、不挡屏；改代码后在内置页或 Chrome 中刷新。
- **不要**再手动运行 `python tools/gcs_watchdog.py`——Go Live / 上述任务会处理。

Web Serial（仅外部 Chrome 等完整 Chromium）需要安全上下文（`localhost` / `127.0.0.1`）。

### 后台服务（由 Go Live 自动拉起，一般无需关心）

```
8767  gcs_watchdog   POST /launch
8766  gcs-runtime    静态资源 + ensure-bridge
8765  com-bridge     Windows COM 枚举 / 串口桥
```

### Windows 一键安装快捷方式（详细说明）

首次给别人使用时，可让对方在项目根目录直接双击：

- `GCS-安装桌面快捷方式.bat`

它会自动完成上面「首次使用」第 2 步的所有工作（创建 .venv + pip install -r requirements.txt（含 dronecan） + 创建桌面/开始菜单快捷方式）。之后日常只需要双击桌面的 `GCS` 图标即可启动。

（setup 脚本已内置 Microsoft Store Python 检测 + 中文错误提示，会在检测到时中止并指导用户安装官方版。）

**常见的一键流程总结**：git clone → 双击 `GCS-安装桌面快捷方式.bat` → 双击桌面 GCS 图标。

## 常见问题排查

### 依赖缺失 / DroneCAN 相关错误
- `ModuleNotFoundError: No module named 'dronecan'`  
  或 DroneCAN Node Tool 里 “Load failed: WriteFile failed (PermissionError(13, '设备不识别此命令。'))” / “Refresh failed”  
  **解决**：双击根目录 `GCS-安装桌面快捷方式.bat` 重新运行一次（会自动补全 requirements.txt 中的 dronecan 等依赖，并确保使用正确的 .venv）。

- “未加载 apm-param-db.json”  
  通常是同一根源（Store Python 或 .venv 未正确安装）。重新运行安装 bat 即可。

### Python 版本问题（最高频）
- 必须使用**官方 python.org 下载的 installer**，**不要用 Microsoft Store / 应用商店版**。
- Store 版路径含 `WindowsApps`，受沙箱限制，无法访问项目目录文件、无法稳定操作串口 COM 设备。
- 安装 bat / GCS.cmd / 启动器都有检测，会在错误时给出明确指引（“请从 https://www.python.org/downloads/ 下载...” + “勾选 Add to PATH”）。
- 建议安装时同时勾选 “py launcher”。

### 路径含中文、空格或其他问题
- 当前启动脚本（GCS-*.cmd、.bat、ps1 中的 %~dp0、Join-Path -LiteralPath、Path.resolve() 等）对中文路径有基本支持。
- 如果仍遇到问题：
  1. 尝试把仓库克隆到纯 ASCII 路径（如 `E:\GCS-test` 或 `D:\GCS`）。
  2. 重新运行安装 bat。
  3. 检查杀毒软件 / Windows Defender 是否拦截了 python.exe 或串口访问。
- 后续版本会继续加强鲁棒性（当前已加入 chcp 65001 等）。

### 安装 bat 运行失败
- 以管理员身份运行试试。
- 确保 PowerShell 可以执行脚本（bat 内部已使用 `-ExecutionPolicy Bypass`）。
- 先手动安装官方 Python + Add to PATH，然后删除 .venv 目录再双击 bat。
- 查看弹出的错误信息（通常会直接告诉你缺什么或 Store 问题）。

### 启动后 DroneCAN 节点工具仍无法使用
- 确认已用安装 bat 成功创建过 .venv 并看到 “核心依赖就绪” 提示。
- 检查 `tools/com-bridge/server.stderr.log`（里面通常有详细 Python 错误）。
- 确认硬件：CAN 线接对、飞控参数已启用 DroneCAN / CAN_D1 等。
- 尝试重启电脑 / 重新拔插 USB-CAN 适配器后再次启动 GCS。
- 仍不行：重新运行安装 bat → 重启 GCS。

其他问题可参考代码中已有的 Store 警告信息（GCS.cmd 弹窗、ps1 抛错、README 本节）。

---

### 以后交付客户时再用（现在可忽略）

| 文件 | 用途 |
|------|------|
| `GCS.cmd` | Windows 桌面快捷方式入口 |
| `Start-GCS.bat` | Windows 调试，同 `GCS.cmd` |
| `assets/gcs-dog.ico` | 桌面「GCS」快捷方式图标（狗） |
| `tools/install-gcs-desktop.ps1` | 安装桌面「GCS」快捷方式（带狗图标） |
| `tools/build-gcs-icon.py` | 从根目录 `dog1.png` 重新生成 `.ico`（去白边/棋盘格） |

日常开发只用 Live Server，上述文件保留在仓库即可，不必运行。

## 技术栈

- **通信**: Web Serial API + MAVLink2 协议
- **HUD**: Canvas 2D
- **地图**: Leaflet.js + ArcGIS 卫星图 + 高德中文标注
- **3D 校准**: Three.js
- **串口桥接**: Python asyncio (tools/com-bridge/)

## License

Internal use.
