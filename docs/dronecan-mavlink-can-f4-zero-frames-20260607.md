# DroneCAN MAVLink CAN：F4 飞控 0 帧问题台账

日期: 2026-06-07  
状态: **已结案**（平台能力限制，非 GCS 解析器缺陷）

---

## 1. 用户报告的现象

| # | 现象 | 说明 |
|---|------|------|
| P1 | DroneCAN **解析器**节点 5 显示「飞控（参数配置）」**暂存 · 0 帧 · 无消息** | 占位节点来自 `CAN_D1_UC_NODE`，非观测流量 |
| P2 | 数据源 **MAVLink CAN1**（无 SLCAN 自动切换） | 单 USB、无 SLCAN 适配器时的预期路径 |
| P3 | 初期 `window._lastCanForwardAck` 为 **undefined** | 见 §3 GCS 侧已修项；修完后 ACK 正常 |
| P4 | ACK **ACCEPTED** 后仍 **0 帧**，`canFrameRx` 无计数 | 最终归因：**老旧 F4 平台** |

---

## 2. 排查过程摘要

### 2.1 易混淆点：有节点 ≠ 有 CAN 帧

- **节点 5 · 飞控（参数配置）** 由 `appendParamFcPlaceholder()` 根据参数插入，`status=stale`、`paramSeed=true`。
- **节点 127 · GCS** 为本地占位，不参与 CAN 接收。
- 会话 `mavlinkCan1SessionReady=true` 只表示 **CAN_FORWARD 命令已发出**，不表示已有 `CAN_FRAME`。

### 2.2 诊断命令（浏览器控制台）

```javascript
({
  send: window._lastCanForwardSend,
  ack: window._lastCanForwardAck,
  lastCmdAck: window._lastCommandAck,
  fcSysid: window.fcSysid,
  fcCompid: window.fcCompid,
  canFrameRx: window._mavlinkCanFrameRxCount,
})
```

| 字段 | 本案典型值 | 含义 |
|------|------------|------|
| `_lastCanForwardSend.via` | `'writer'` | 经顶部 MAVLink（含 COM 桥 `bridge-write`）发出 |
| `_lastCanForwardAck.result` | `0` (ACCEPTED) | 飞控接受 `MAV_CMD_CAN_FORWARD` (32000) |
| `_mavlinkCanFrameRxCount` | `undefined` / 0 | 未收到 MAVLink `CAN_FRAME` (#386) |

### 2.3 飞控参数（用户截图，配置正确）

| 参数 | 值 | 说明 |
|------|-----|------|
| `CAN_P1_DRIVER` | 1 | CAN1 硬件已启用 |
| `CAN_P1_BITRATE` | 1000000 | 1 Mbps |
| `CAN_D1_PROTOCOL` | 1 | DroneCAN |
| `CAN_D1_UC_NODE` | 5 | 与 GCS 占位节点 ID 一致 |

参数无误仍 0 帧时，需区分 **GCS/转发链路** 与 **平台/总线**。

---

## 3. GCS 侧同期修复（本案排查中完成）

以下修复解决 **ACK 不可见、命令发错目标** 等问题；**不能**让不支持 MAVLink CAN 转发的 F4  magically 出帧。

| 项 | 文件 | 说明 |
|----|------|------|
| COM 桥也走 `sendCommandLong` | `JS/ui/dronecan-setup.js` | 有 `window.writer` 时统一经 MAVLink 发 CAN_FORWARD，不再仅依赖桥 API |
| `compid=0` 误发为 1 | `JS/services/serial.js` | `resolveMavlinkTargetComponent()`，0 为合法组件 ID |
| 桥接解析 COMMAND_ACK | `tools/com-bridge/server.py` | `canForwardAck` 经 `/mavlink-can-nodes` 同步到 `_lastCanForwardAck` |
| 诊断 hint / 计数 | `dronecan-setup.js`, `mavlink.js` | `_lastCanForwardSend`、`_mavlinkCanFrameRxCount`、底部 hint 文案 |

---

## 4. 根因（结案）

**部分型号使用老旧 STM32F4 飞控**，存在平台能力差异：

| 能力 | F4 老型号（常见） | F7 / H7 等新平台 |
|------|-------------------|------------------|
| 物理 CAN + DroneCAN 参数 | 部分板型支持 | 普遍支持 |
| **MAVLink CAN_FORWARD → CAN_FRAME 回传** | 常 **不可用或不完整** | Mission Planner / GCS 默认可用路径 |
| 第二路 **SLCAN USB** | 多数 **无** | Cube、CUAV 等常有双虚拟串口 |

本案最终现象符合该限制：

- `CAN_FORWARD` → **COMMAND_ACK ACCEPTED**（命令层通过）
- 长时间 **0 帧/s**，解析器无真实消息
- 参数 `CAN_P1_*` / `CAN_D1_*` 均已正确配置

**结论**：GCS MAVLink CAN 转发与解析逻辑正常；**不宜在 F4 老平台上依赖 MAVLink CAN1 观测 DroneCAN**。Mission Planner 同路径对比通常也为 0 帧。

---

## 5. 建议操作（用户 / 支持）

| 场景 | 建议 |
|------|------|
| F4 + 单 USB，要 DroneCAN 监视 | **USB-CAN + SLCAN 直连**（若 GCS 识别）；或升级 **F7/H7** 飞控 |
| 已改 CAN 参数 | **写入参数并重启飞控**后再测（界面「未写入修改 N 项」须先写入） |
| 区分 GCS bug vs 平台 | 同线同板用 **Mission Planner → DroneCAN → MAVLink CAN1** 看 fps |
| 仍 0 帧且 MP 也为 0 | 查 **接线、120Ω 终端、外设供电**；确认设备在 CAN1 而非 CAN2 |

---

## 6. 验收标准（F4 平台）

1. 不将「解析器暂存占位 + 0 帧」 alone 判为 GCS 回归。
2. `_lastCanForwardAck.result === 0` 且 fps=0 时，hint 应引导 **平台/硬件/SLCAN**，而非无限重试转发 API。
3. （可选后续）根据 `AUTOPILOT_VERSION` / 板型提示「F4 建议 SLCAN 或升级硬件」。

---

## 7. 相关文档

- [dronecan-mavlink-can-session-20260607.md](./dronecan-mavlink-can-session-20260607.md) — MAVLink CAN 会话与 COM 桥修复  
- [dronecan-transport-isolation-plan.md](./dronecan-transport-isolation-plan.md) — SLCAN / MAVLink CAN1/2 隔离  
- [dronecan-slcan-mavlink-source-mixing-20260606.md](./dronecan-slcan-mavlink-source-mixing-20260606.md) — 混源问题  
- [github-issues-20260606.md](./github-issues-20260606.md) — Issue 台账索引  

---

## 8. 变更文件（GCS 排查期）

```
JS/ui/dronecan-setup.js
JS/services/serial.js
JS/core/mavlink.js
tools/com-bridge/server.py
index.html
docs/dronecan-mavlink-can-f4-zero-frames-20260607.md  (本文件)
```
