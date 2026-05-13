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

### 方式 1: Python HTTP 服务器
```bash
# 在 gcs-project/ 目录下
python3 -m http.server 8080
# 浏览器打开 http://localhost:8080
```

### 方式 2: 使用 COM 桥接（可选，显示真实 COM 名）
```bash
# 启动桥接服务
python3 tools/com-bridge/server.py
```

## 技术栈

- **通信**: Web Serial API + MAVLink2 协议
- **HUD**: Canvas 2D
- **地图**: Leaflet.js + ArcGIS 卫星图 + 高德中文标注
- **3D 校准**: Three.js
- **串口桥接**: Python asyncio (tools/com-bridge/)

## License

Internal use.
