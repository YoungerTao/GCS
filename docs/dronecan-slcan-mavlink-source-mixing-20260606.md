# DroneCAN SLCAN / MAVLink CAN 来源混用问题记录

日期: 2026-06-06

## 现象

在 `初始设置 -> DroneCAN` 页面选择 `SLCAN 直连` 后，节点列表里仍可能出现并非来自 SLCAN 直连链路的节点。

现场抓到的典型数据:

- `Node 10` 的 `source` 为 `SLCAN Direct`
- `Node 25` 的 `source` 为 `MAVLink CAN2`

这意味着用户虽然停留在 `SLCAN 直连` 页面，但实际上仍可能点到一个来自 `MAVLink CAN2` 的节点。

随后如果在这个页面里对该节点执行 `设置菜单 -> Parameters`，前端会尝试按当前 SLCAN 路径发起 DroneCAN `GetSet`，结果表现为:

- 节点看起来“在线”
- 但参数读取报 `Parameter service response timeout`

## 根因

这次问题的关键不在于 “SLCAN 把 MAVLink CAN2 解析错了”，而在于:

1. 后端 `SLCAN_MONITOR` 同时汇聚了两类来源的数据
   - `SLCAN Direct`
   - `MAVLink CAN_FRAME` / `MAVLink CAN1` / `MAVLink CAN2`

2. 前端 DroneCAN 页面此前又把这些来源混在同一个节点模型里展示

结果就是:

- 页面标题和传输标签写的是 `SLCAN 直连`
- 但节点列表里可能混入 `MAVLink CAN2` 节点
- 用户在错误来源的节点上点击参数读取
- 最终被包装成一次误导性的超时

## 关键证据

另一台 Windows 机器现场返回的 `/slcan-nodes` 数据中:

```json
{
  "nodeId": 25,
  "displayName": "Node 25",
  "status": "online",
  "source": "MAVLink CAN2"
}
```

同一次采样中，真正的 SLCAN 直连节点为:

```json
{
  "nodeId": 10,
  "displayName": "ArduPilot Flight Controller",
  "status": "online",
  "source": "SLCAN Direct"
}
```

所以这不是 “Node 25 一定不支持参数服务”，而是它根本不属于当前 SLCAN 页面应操作的数据来源。

## 影响

如果不把来源分开，会带来几类误导:

1. 用户以为当前页是纯 SLCAN，实际上节点列表混入了 MAVLink CAN 元数据
2. 参数超时会被误判成节点不支持 GetSet，或误判成串口/桥异常
3. 当前页与后续要单独开发的 MAVLink CAN 页面边界不清晰，后续维护风险很高

## 修复方向

本次确认后的目标是:

- 当前 DroneCAN 页面只负责 `SLCAN 直连`
- `MAVLink CAN1 / CAN2` 另开页面实现
- 两者在数据来源、UI 入口、参数操作路径上彻底分离

已开始落地的调整:

1. `/slcan-nodes` 改为仅返回 `source` 以 `SLCAN` 开头的节点
2. SLCAN 页面的节点列表只使用 SLCAN 来源数据
3. 禁止在 SLCAN 页面对 `MAVLink CAN1 / CAN2` 来源节点执行参数操作

## 后续建议

为了彻底避免再次混源，后续还应继续完成:

1. 从当前页面中移除 `MAVLink CAN1 / CAN2` 标签与文案
2. 去掉当前页自动 fallback 到 `ensureMavlinkCanForward()` 的逻辑
3. 单独设计并实现 `MAVLink CAN` 页面，独立承载 CAN1/CAN2 元数据与交互

## 相关文件

- [JS/ui/dronecan-setup.js](G:\soft\GCS\JS\ui\dronecan-setup.js)
- [tools/com-bridge/server.py](G:\soft\GCS\tools\com-bridge\server.py)
- [docs/dronecan-slcan-param-incident-20260606.md](G:\soft\GCS\docs\dronecan-slcan-param-incident-20260606.md)
