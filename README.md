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
└── translate_params.py        # 参数翻译脚本
```

## 启动

注意：Web Serial 需要安全上下文 (localhost 或 HTTPS)。

### 客户安装（交付）

在目标电脑上**只需安装一次**：

```powershell
powershell -ExecutionPolicy Bypass -File tools\install-gcs-desktop.ps1
```

会在桌面与开始菜单创建 **「GCS」** 快捷方式。之后日常使用：**双击桌面「GCS」图标**即可（内部调用根目录 `GCS.cmd`，静默拉起 watchdog / 运行时并打开浏览器）。

可选：登录时仅后台启动 watchdog（加快首次打开，不弹浏览器）：

```powershell
powershell -ExecutionPolicy Bypass -File tools\install-gcs-desktop.ps1 -WatchdogStartup
```

### 自动启动架构

```
8767  gcs_watchdog   POST /launch  → 按需拉起运行时
8766  gcs-runtime    静态页面 + POST /__gcs/ensure-bridge
8765  com-bridge     COM 枚举 / SLCAN / MAVLink 串口桥
```

- 页面 **`JS/core/gcs-auto-start.js`** 最先执行：若不在 8766（含错误书签），在 watchdog 在线时会请求 launcher 启动运行时并跳转到 canonical URL。
- **`com-bridge.js`** 通过 `ensureGcsStackReady()` / `ensureComBridgeRunning()` 保证桥接在线。
- 运行时退出后由 **watchdog / supervisor** 在下次 `/launch` 或页面探测时恢复。

### 开发调试

```bat
Start-GCS.bat                   # 与 GCS.cmd 相同流程，可显示错误
python tools/gcs_watchdog.py    # 仅 launcher
python tools/gcs-runtime.py     # UI + 桥接（阻塞前台）
```

## 技术栈

- **通信**: Web Serial API + MAVLink2 协议
- **HUD**: Canvas 2D
- **地图**: Leaflet.js + ArcGIS 卫星图 + 高德中文标注
- **3D 校准**: Three.js
- **串口桥接**: Python asyncio (tools/com-bridge/)

## License

Internal use.
