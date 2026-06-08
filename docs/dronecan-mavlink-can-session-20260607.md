# DroneCAN MAVLink CAN 会话修复与启动回归记录

日期: 2026-06-07  
状态: **已实施**（待实机长期验证）

---

## 1. 用户报告的问题

| # | 现象 | 控制台 / 提示 |
|---|------|----------------|
| P1 | DroneCAN 页选 **MAVLink CAN1**，在线节点为空，**0 帧/s** | 底部仍可能残留旧节点文案 |
| P2 | `MAVLink CAN 转发失败: /mavlink-can-forward-enable failed (404)` | COM 桥进程为旧代码，无新 API |
| P3 | 同上接口返回 **500**，控制台大量重复 POST | `command_long_encode() missing param7` |
| P4 | 顶部 **COM 口下拉很久才出现** | 长时间停在「选择飞控 USB 串口…」 |
| P5 | **启动自检异常**（8766/8767/8768 timeout） | 但 **MAVLink CAN 已能显示节点** |
| P6 | `power-setup.js: idText is not defined` | 电源拓扑页独立 bug |

---

## 2. 根因分析

### 2.1 DroneCAN / MAVLink CAN 无数据

1. **命令号错误**：前端曾用 `sendCommandLong(183, …)`，ArduPilot / MP 的 `MAV_CMD_CAN_FORWARD` 为 **32000**。
2. **COM 桥 500**：`server.py` 中 `_send_mavlink_command_long()` 调用 pymavlink 时少传 **param7**，转发 API 每次失败。
3. **404**：8765 上跑的 `server.py` 未更新，无 `/mavlink-can-forward-enable`；仅靠磁盘 `scriptMtime` 无法发现「旧进程 + 新文件」。
4. **数据路径**：经 COM 桥时 `feedMavlinkCanFrameIfActive`  intentionally 不写浏览器 runtime，节点来自 `GET /mavlink-can-nodes?bus=1`；转发失败则永远 0 帧。

### 2.2 COM 口列表慢

1. `GET /com-ports?probe=1` 会对每个 USB 口 **打开串口做协议探测**，COM11+COM12 需数秒。
2. 页面 `load` 后才第一次 `refreshPorts`，且曾 **await 完整 bootstrap**（含 8768 瓦片）。
3. **回归（已回滚）**：在 `probeBridgeHealth` / DroneCAN 转发前调用 `ensureComBridgeFresh()`，反复 **force restart** COM 桥，期间 8765 不可用，列表空白。

### 2.3 启动自检误报

- `startup-self-check.js` 只检查 **8766 / 8767 / 8768**，未检查 **8765 COM bridge**。
- **8768 瓦片**为可选服务，失败不应与 DroneCAN 同等报红。
- Live Server / 非 8766 打开时，8766 ping 超时属预期，但与「COM 桥已正常」矛盾。

---

## 3. 已实施修改

### 3.1 DroneCAN 逻辑隔离（`JS/ui/dronecan-setup.js`）

| 项 | 说明 |
|----|------|
| `MAV_CMD_CAN_FORWARD = 32000` | 浏览器直连与桥接统一命令号 |
| `teardownTransportLeaving()` | 切离 CAN 标签：`CAN_FORWARD param1=0` + 停 keepalive；切离 SLCAN：仅停 poll，**不关 COM12** |
| `startCanForwardKeepalive()` | **1s** 重发 `CAN_FORWARD`（对齐 Mission Planner） |
| `applyMavlinkCanFilter()` | 首次启用经桥下发 `CAN_FILTER_MODIFY` 白名单 |
| `getEgressTransport()` / `ensureHealthyTransport()` | GetNodeInfo / GetSet / 服务请求按当前传输出口 |
| `bridgePostWithLegacy()` | 404 时回退 `/slcan-forward-enable`（**不再**在热路径 force restart 桥） |
| 失败退避 | `mavlinkCanSessionRetryAt` / `canForwardFailureUntil` 8s，避免 1s 保活刷 500 |
| `renderBand()` | 节点表空时清空 band 面板 |
| `updateMavlinkCanDiagnostics()` | 结合 `COMMAND_ACK` 与 fps 更新 hint |

### 3.2 COM 桥（`tools/com-bridge/server.py`）

| API | 说明 |
|-----|------|
| `POST /mavlink-can-forward-enable` | `{ bus: 1\|2 }` → `MAV_CMD_CAN_FORWARD` |
| `POST /mavlink-can-forward-disable` | `param1=0` |
| `POST /mavlink-can-filter` | MP 默认 DroneCAN 白名单 |
| `/slcan-forward-enable` | 兼容别名，同 forward-enable |

| 修复 | 说明 |
|------|------|
| `_send_mavlink_command_long` | 补全 **param7**（修复 500） |
| `read_ports_fast()` | `probe=0` 时仅枚举 COM + 名称启发式，**不打开串口** |
| `read_ports_with_roles(..., probe_roles=probe)` | `probe=1` 才做完整协议探测 |
| `BRIDGE_API_VERSION` | `/health` 暴露版本（诊断用；supervisor **不再**仅凭版本强杀进程） |

### 3.3 前端基础设施

| 文件 | 变更 |
|------|------|
| `JS/core/mavlink.js` | 记录 `window._lastCanForwardAck`（cmd=32000） |
| `JS/services/com-bridge.js` | 脚本加载后立即 `refreshPorts`；首次 `probe=0`，2s 后 `probe=1`；`ensureComBridgeRunning` 先 probe 8765 再 bootstrap；**移除** health 检查上的自动 `ensureComBridgeFresh` |
| `JS/core/gcs-auto-start.js` | 8768 瓦片 **后台**启动；bridge 等待 15s→**8s** |
| `JS/core/startup-self-check.js` | **以 8765 为核心**；8768/Launcher 标「可选」；8766 在 native 页 synthetic OK；核心 OK 即显示「核心服务已就绪」 |
| `JS/ui/power-setup.js` | 删除未定义的 `idText` append |
| `tools/gcs_supervisor.py` |  stale 检测恢复为 **disk mtime > live mtime**（去掉 apiVersion 强杀循环） |
| `tools/gcs-runtime.py` | `POST /__gcs/ensure-bridge?force=1` 支持强制重启 |
| `tools/com-bridge/test_slcan_auto.py` | filter 白名单、param7 编码、隔离用例 |
| `index.html` | 更新 `gcs-auto-start` / `startup-self-check` / `com-bridge` 缓存版本号 |

---

## 4. 曾引入的回归（已回滚）

| 改动 | 后果 | 处理 |
|------|------|------|
| `probeBridgeHealth` → `ensureComBridgeFresh()` | COM 桥反复重启，端口列表长时间空白 | **已移除**热路径调用 |
| `sendMavlinkCanForward` 前 `await ensureComBridgeFresh()` | 转发失败 + 控制台刷 500 | **已移除** |
| supervisor / JS 按 `apiVersion` 不匹配强杀 | 与 mtime 检测叠加，重启风暴 | supervisor **仅 mtime**；JS 不再自动 force |
| `bridgePostWithLegacy` 404 后 force restart 再重试 | 延长不可用窗口 | 改为仅 **legacy 路径回退** |

保留：`ensureComBridgeFresh()` 函数本身，供手动/显式重启，不在 health/转发热路径调用。

---

## 5. 验收标准

1. COM11 [MAVLink] 已连接，DroneCAN **MAVLink CAN1**：10s 内 fps>0，节点 `source` 均为 `MAVLink CAN1`；**COM12 SLCAN 可常开**。
2. 切换 SLCAN / MAVLink 标签，列表 `source` 不交叉。
3. 参数：MAVLink → `/mavlink-can-write`；SLCAN → `/slcan-write`。
4. 刷新后 COM 口 **数秒内**出现；8768 可选超时 **不** 阻断 DroneCAN。
5. `/mavlink-can-forward-enable` 返回 200（非 404/500）。

---

## 6. 操作说明

| 场景 | 建议 |
|------|------|
| 404 forward API | 从桌面 **GCS** 图标重开，或 `tools` 下 `ensure_bridge_process(force_restart=True)` |
| 500 param7 | 确保 `server.py` 已含 param7 修复并已重启 8765 |
| 自检仍报 8768 | 可忽略（仅影响离线地图）；在线底图仍可用 |
| 修改 `server.py` 后 | 刷新页面；supervisor 在 mtime 变新时会重启桥 |

---

## 7. 相关文档

- [dronecan-transport-isolation-plan.md](./dronecan-transport-isolation-plan.md) — 传输隔离总方案  
- [dronecan-slcan-mavlink-source-mixing-20260606.md](./dronecan-slcan-mavlink-source-mixing-20260606.md) — 混源问题简版  
- [dronecan-mavlink-can-f4-zero-frames-20260607.md](./dronecan-mavlink-can-f4-zero-frames-20260607.md) — **F4 平台 MAVLink CAN 0 帧结案台账**  
- [FILE-CALL-FLOW.md](./FILE-CALL-FLOW.md) — stale bridge 与 ensure-bridge 流程  

---

## 8. 变更文件清单

```
JS/core/mavlink.js
JS/core/gcs-auto-start.js
JS/core/startup-self-check.js
JS/services/com-bridge.js
JS/ui/dronecan-setup.js
JS/ui/power-setup.js
tools/com-bridge/server.py
tools/com-bridge/test_slcan_auto.py
tools/gcs-runtime.py
tools/gcs_supervisor.py
docs/dronecan-transport-isolation-plan.md
index.html
docs/dronecan-mavlink-can-session-20260607.md  (本文件)
```
