# GCS — Web-Based ArduPilot Ground Control Station

一个基于 Web Serial + MAVLink 的浏览器端 ArduPilot 地面站，支持 HUD、地图、参数读写、传感器校准等功能。

## 项目结构

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

**首次在本机（尤其 macOS）开发前执行一次：**

```bash
./tools/setup-python-deps.sh
```

会在项目下创建 `.venv` 并安装 `pyserial`（COM 桥列举 `/dev/cu.*` 必需）。之后 Go Live / 内置浏览器才能在下拉里看到串口。

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

### Windows 一键安装快捷方式

首次给别人使用时，可让对方在项目根目录直接双击：

- `GCS-安装桌面快捷方式.bat`

它会自动调用 `tools/install-gcs-desktop.ps1`，在桌面和开始菜单创建 `GCS` 快捷方式。之后日常只需要双击桌面的 `GCS` 图标即可启动。

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
