# DroneCAN 节点名称乱码与显示修复记录

日期: 2026-06-07

## 现象

在 `初始设置 -> DroneCAN -> 在线节点` 中，部分节点 **名称** 列显示异常：

| 节点 ID | 异常显示 | 期望显示 |
|---------|----------|----------|
| 5（飞控） | `7302:47`（乱码）→ 修复后 `76org.ardupilot0` | `ArduPilot Flight Controller` |
| 27（GPS） | 乱码 | `org.ardupilot.f303-gps` 或 `DroneCAN GNSS / RTK` |
| 51（PMU） | `CUAV CAN PMU Lite`（正常） | 不变 |

同时观察到：

- **硬件版本** 列对节点 5 能正确显示 `ArduPilot FC`（设备档案匹配成功）
- **总线** 列单独显示 `CAN1`，样式可接受，无需在名称后追加 `(CAN1)`

## 根因分析

### 1. GetNodeInfo 响应解析错误（主要）

文件: [JS/ui/dronecan-setup.js](../JS/ui/dronecan-setup.js) — `decodeGetNodeInfoResponse()`

`uavcan.protocol.GetNodeInfo.Response` 中 `uint8[<=80] name` 是 **最后一个字段**，按 UAVCAN/DSDL 规范应启用 **TAO（Tail Array Optimization）**：不再读长度前缀，剩余字节即为名称。

原实现误用 `unpackTailStringBits(..., tao=false)`，把证书区或填充区的比特当成 7 位长度前缀，导致：

- 名称完全乱码（如 `7302:47`）
- 或部分正确但带杂质（如 `76org.ardupilot0`）

规范参考: [tools/dronecan-spec-7.txt](../tools/dronecan-spec-7.txt) — `GetNodeInfo.Response` / `HardwareVersion`

### 2. 界面优先展示原始 GetNodeInfo 名

文件: [JS/ui/dronecan-setup.js](../JS/ui/dronecan-setup.js) — `applyNodeSnapshot()` / `applyNodeInfoToRuntime()`

即使设备档案（`dronecan-registry.js`）已匹配到飞控并给出友好名 `ArduPilot Flight Controller`，名称列仍优先使用 `nodeInfo.name`（GetNodeInfo 原始解析结果），因此杂质字符串覆盖了友好显示名。

### 3. 名称清洗保留数字

`sanitizeDronecanNodeName()` 初版允许 `0-9`，解析残留的前缀 `76`、后缀 `0` 被保留，无法还原为 `org.ardupilot`。

### 4. 飞控设备匹配过宽（连带问题）

文件: [JS/core/dronecan-registry.js](../JS/core/dronecan-registry.js) — `ardupilot_fc`

原规则 `name.includes("ardupilot")` 会把 `org.ardupilot.f303-gps` 等外设也识别为飞控，导致 GPS 节点 **硬件版本** 误显示为 `ArduPilot FC`。

## 物理总线判定说明（相关问题）

节点 **总线** 列并非从 DroneCAN 名称推断，而是在 CAN 帧进入 GCS 时写入 `node.bus`：

| 传输方式 | 判定依据 |
|----------|----------|
| MAVLink CAN1/CAN2 | MAVLink `CAN_FRAME` (#386) 的 `bus` 字段：`0`→CAN1，`1`→CAN2 |
| SLCAN 直连 | 飞控参数 `CAN_SLCAN_CPORT`（默认 1），表示 SLCAN 适配器映射到哪路物理 CAN |

实现位置:

- 后端: [tools/com-bridge/server.py](../tools/com-bridge/server.py) — `_handle_can_frame()`
- 前端: [JS/ui/dronecan-setup.js](../JS/ui/dronecan-setup.js) — `nodeBusLabel()` / `getSlcanCport()`

节点在内部以 `(transport, bus, nodeId)` 三元组区分，同一 nodeId 在 CAN1/CAN2 上是不同记录。

## 修改内容

### 1. 修正 GetNodeInfo 名称字段 TAO 解析

```javascript
// 修改前
unpackTailStringBits(stream, cursor, 80, false);

// 修改后
unpackTailStringBits(stream, cursor, 80, true);
```

TAO 分支同时限制最大 80 字节：`Math.min(maxLen, byteLen)`。

### 2. 新增/增强名称处理

| 函数 | 作用 |
|------|------|
| `sanitizeDronecanNodeName()` | 从乱码中提取 `org.[a-z0-9._-]+` 标准 reverse-domain 名 |
| `resolveNodeIdentity()` | 统一 canonical 名、设备匹配、友好显示名 |

### 3. 名称列优先友好显示名

`applyNodeSnapshot()` / `applyNodeInfoToRuntime()` 中：

- `name` / `displayName` → `identity.displayLabel`（如 `ArduPilot Flight Controller`）
- `rawName` → GetNodeInfo 原始字符串（调试用）
- `canonicalName` → 清洗后的 `org.ardupilot` 等

### 4. 收紧飞控设备匹配

```javascript
// ardupilot_fc：仅 canonical === "org.ardupilot" 时匹配
const canonical = (text.match(/org\.[a-z0-9._-]+/) || [""])[0];
return canonical === "org.ardupilot";
```

GPS 外设（`org.ardupilot.f303-gps`）改由 `dronecan_gnss` 等档案匹配。

## 涉及文件

| 文件 | 变更 |
|------|------|
| [JS/ui/dronecan-setup.js](../JS/ui/dronecan-setup.js) | GetNodeInfo 解析、名称清洗、显示逻辑 |
| [JS/core/dronecan-registry.js](../JS/core/dronecan-registry.js) | 飞控匹配规则收紧 |

## 修复后预期

| 节点 | 名称列 | 总线列 | 硬件版本 |
|------|--------|--------|----------|
| 5 | ArduPilot Flight Controller | CAN1 | ArduPilot FC |
| 27 | DroneCAN GNSS / RTK | CAN1 | UAVCAN GNSS |
| 51 | CUAV CAN PMU Lite | CAN1 | CUAV DroneCAN PMU |

## 验证步骤

1. 刷新 GCS 页面，打开 DroneCAN 在线节点
2. 等待 GetNodeInfo 自动查询完成（约数秒）
3. 确认节点 5 名称为 **ArduPilot Flight Controller**，无 `76` 前缀或乱码
4. 确认节点 27 不再被误判为飞控硬件版本
5. 总线列仍独立显示 CAN1/CAN2

## 后续补充（2026-06-07 续）

### GetNodeInfo 传输链隔离

- SLCAN 与 MAVLink CAN1/CAN2 各自独立：`poll*` / `send*ServiceRequest` / `wait*ServiceResponse` / `*GetNodeInfo` / `maybeQuery*`
- 共用纯协议层：[`JS/core/dronecan-get-node-info.js`](../JS/core/dronecan-get-node-info.js)（`decodeGetNodeInfoResponse`、`isNodeInfoUsable`）
- `encodeDronecanServiceFrames()` 负责 CAN ID 与多帧切分，无 IO

### CRC / 版本采纳

- `decodeGetNodeInfoResponse()` 解析 `vcs_commit`（8 位 hex）与 `image_crc` → `swCrc`（16 位 hex）
- `isNodeInfoUsable()`：有名称、版本或 CRC 即写入缓存（不再要求 `name` 非空）
- `applyNodeSnapshot()`：合并 `swCrc`；GetNodeInfo 未到时用 `CAN_D1_UC_NODE` / `CAN_D2_UC_NODE` 参数降级显示飞控

### 回归测试

- [`tools/com-bridge/test_get_node_info_decode.py`](../tools/com-bridge/test_get_node_info_decode.py)

## 未做 / 后续可选

- 未在 canonical 名称后追加 `(CANx)`（用户确认总线单独一列即可）
- 若个别固件 GetNodeInfo 响应结构与标准仍有偏差，可进一步对照原始 payload 十六进制微调位偏移
- `nodeInfoState.cache` 刷新页面后自动清空；若热更新未生效，手动刷新即可

## 关联文档

- [dronecan-slcan-param-incident-20260606.md](./dronecan-slcan-param-incident-20260606.md) — SLCAN 参数读取故障
- [DRONECAN_FIX_SUMMARY.md](../DRONECAN_FIX_SUMMARY.md) — 串口权限与 GetSet 检测优化
