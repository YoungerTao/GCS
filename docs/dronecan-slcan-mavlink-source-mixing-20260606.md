# DroneCAN：SLCAN 与 MAVLink CAN 混源问题记录

日期: 2026-06-06（问题发现） / 2026-06-07（隔离方案落地）

## 问题是什么

在 **初始设置 → DroneCAN** 页面，用户选择 **SLCAN 直连** 后，节点列表、参数读写、解析器观测仍可能混入 **MAVLink CAN1/CAN2** 的数据或走 MAVLink 通道，导致：

- 页面显示「SLCAN 直连」，但列表里出现 `source: MAVLink CAN2` 的节点
- 对错误来源的节点读参数 → `Parameter service response timeout`
- 仅 1 路 USB 串口时，SLCAN 标签仍可见，底层却偷偷 fallback 到 `CAN_FORWARD`
- 解析器与 SLCAN/MAVLink 观测源未区分，单串口时可能空白

这不是「SLCAN 把 MAVLink 解析错了」，而是 **传输协议与 UI 标签未隔离**。

---

## 典型现象

### 1. 节点来源混显

同一次 `/slcan-nodes` 采样中曾出现：

```json
{ "nodeId": 10, "displayName": "ArduPilot Flight Controller", "source": "SLCAN Direct" }
```

```json
{ "nodeId": 25, "displayName": "Node 25", "source": "MAVLink CAN2" }
```

用户停留在 **SLCAN 直连** 页，却能点到 **MAVLink CAN2** 节点。

### 2. 参数超时误导

在 SLCAN 页面对 Node 25 执行 **设置菜单 → Parameters**：

- 节点看起来在线
- 实际按 SLCAN 路径发 GetSet
- 结果：`Parameter service response timeout`

根因：Node 25 不属于当前 SLCAN 链路，而非节点不支持参数服务。

### 3. 单串口仍显示 SLCAN

只有 1 路串口（已被顶部 MAVLink 占用）、未识别到 SLCAN 硬件时：

- SLCAN 标签仍可点
- 代码会 `ensureMavlinkCanForward()` 偷偷顶上
- 用户以为在走 SLCAN，实际走 MAVLink

### 4. 解析器数据源不明确

解析器共用 `slcanRuntime`，无 SLCAN 时 poll 仍只拉 `/slcan-nodes`，列表可能为空；有双路时也未明确「优先 SLCAN，否则 MAVLink CAN」。

---

## 根因分析

| 层级 | 问题 |
|------|------|
| 后端 | `SLCAN_MONITOR` 同时吃 `SLCAN_HUB` + `MAVLINK_HUB`；早期仅 `/slcan-nodes` 做展示过滤 |
| 前端状态 | `currentMode` 混合传输标签与功能页；`slcanBoundPort = "mavlink"` 与 SLCAN 共用 |
| 会话逻辑 | `ensureSlcanDirectSession()` 多处 fallback 到 `ensureMavlinkCanForward()` |
| 轮询 | `pollSlcanTraffic()` 固定 `/slcan-nodes`；CAN1/CAN2 无独立 poll |
| 发送 | MAVLink 模式下参数仍写 `/slcan-write`（只连 `SLCAN_HUB`） |
| MAVLink 注入 | `mavlink.js` 无条件 `feedMavlinkCanFrame`，不检查当前标签 |

相关参数读取故障另见：[dronecan-slcan-param-incident-20260606.md](./dronecan-slcan-param-incident-20260606.md)（COM 桥 zombie、发送路径错位）。

---

## 确认的产品需求

1. **三路传输标签**：SLCAN 直连 | MAVLink CAN1 | MAVLink CAN2 — 协议不混用，读写隔离。
2. **单串口无 SLCAN**：自动隐藏 SLCAN 标签，只保留可用项，默认 MAVLink CAN1。
3. **解析器**：有 SLCAN 优先 SLCAN 观测；否则 MAVLink CAN1；单源、不 merge。
4. **筛选 / 统计**：跟随当前传输标签（解析器用 `inspectorTransport`）。
5. **UI**：单行工具栏混排传输与功能标签，用 `data-dc-transport` / `data-dc-view` 区分。

---

## 解决方案（已实施）

### 架构要点

- 前端：`currentTransport` + `currentView`；`slcanRuntime` / `mavlinkCan1Runtime` / `mavlinkCan2Runtime` 独立存储
- 后端：`GET /slcan-nodes`（仅 SLCAN）、`GET /mavlink-can-nodes?bus=1|2`、`POST /mavlink-can-write`
- 删除 SLCAN → MAVLink 自动 fallback；`syncTransportTabs()` 控制 SLCAN 标签显隐
- `feedMavlinkCanFrameIfActive` / `feedSlcanCanFrame` 门控；`resolveInspectorTransport()` 解析器选源

### 文档与规划

| 文档 | 内容 |
|------|------|
| [github-issues-20260606.md](./github-issues-20260606.md) | **Git 问题台账**（Issue 4，可直接贴 GitHub） |
| [dronecan-transport-isolation-plan.md](./dronecan-transport-isolation-plan.md) | 完整实施规划（含流程图、API、清单） |
| [dronecan-slcan-param-incident-20260606.md](./dronecan-slcan-param-incident-20260606.md) | 参数超时 / COM 桥半死状态 |

### 关键代码

- [JS/ui/dronecan-setup.js](../JS/ui/dronecan-setup.js)
- [JS/core/mavlink.js](../JS/core/mavlink.js)
- [JS/services/serial.js](../JS/services/serial.js)
- [tools/com-bridge/server.py](../tools/com-bridge/server.py)
- [tools/com-bridge/test_slcan_auto.py](../tools/com-bridge/test_slcan_auto.py)

---

## 使用注意

- 重启 **GCS.cmd** 后新 API（`/mavlink-can-nodes` 等）才生效
- 刷新页面加载 `dronecan-setup.js?v=175` 以看到新工具栏
- 参数操作前确认节点 `source` 与当前传输标签一致
