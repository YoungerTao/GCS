# DroneCAN SLCAN / MAVLink CAN 传输隔离

日期: 2026-06-06（2026-06-07 完成隔离落地）

## 目标架构

DroneCAN 页面单行工具栏包含三路传输与三个功能页：

| 类型 | 标签 | 协议 |
|------|------|------|
| 传输 | SLCAN 直连 | SLCAN ASCII（USB-CAN / 第二路 Web Serial） |
| 传输 | MAVLink CAN1 | MAVLink `CAN_FORWARD` + `CAN_FRAME`，bus=0 |
| 传输 | MAVLink CAN2 | 同上，bus=1 |
| 功能 | 筛选 / 解析器 / 统计 | 跟随当前传输；解析器自动选源 |

## 隔离规则

1. **SLCAN 标签**：只开 SLCAN 会话；只 poll `/slcan-nodes`；参数读写只走 `/slcan-write` 或 Web Serial。
2. **MAVLink CAN1/2 标签**：只 `CAN_FORWARD`；只 poll `/mavlink-can-nodes?bus=1|2`；读写走 `/mavlink-can-write` 或 `sendMavlinkCanFrame`。
3. **无 SLCAN 硬件**（仅 1 路串口）：隐藏 SLCAN 传输标签，默认 MAVLink CAN1。
4. **解析器**：有 SLCAN 则优先 SLCAN；否则 MAVLink CAN1；单源观测，不 merge。
5. **禁止 fallback**：SLCAN 不可用时不自动切 MAVLink，提示用户换标签。

## 后端 API

- `GET /slcan-nodes` → `source_prefix=SLCAN`
- `GET /mavlink-can-nodes?bus=1|2` → `source_prefix=MAVLink` + bus 过滤
- `POST /mavlink-can-write` → 经 `MAVLINK_HUB` 发 `CAN_FRAME` (#386)

底层 `SLCAN_MONITOR` 仍汇聚两路物理数据，但 API 与前端 runtime 按 `source` 过滤，不再混显。

## 完整规划文档

详见 [dronecan-transport-isolation-plan.md](./dronecan-transport-isolation-plan.md)。

## 相关文件

- [JS/ui/dronecan-setup.js](../JS/ui/dronecan-setup.js)
- [JS/core/mavlink.js](../JS/core/mavlink.js)
- [JS/services/serial.js](../JS/services/serial.js)
- [tools/com-bridge/server.py](../tools/com-bridge/server.py)
- [tools/com-bridge/test_slcan_auto.py](../tools/com-bridge/test_slcan_auto.py)
