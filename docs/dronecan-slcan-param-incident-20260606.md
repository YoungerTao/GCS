# DroneCAN SLCAN 参数读取故障记录

日期: 2026-06-06

## 现象

在 `初始设置 -> DroneCAN -> 设置菜单 -> Parameters` 中读取节点参数时，界面会出现以下两类异常之一：

1. 点击 `Parameters` 看起来没有任何反应。
2. 弹窗提示:

```text
读取失败：串口访问被拒绝。请关闭其他地面站软件(Mission Planner/QGC),或切换到「MAVLink CAN1」模式。
```

但现场确认后，并没有其他地面站软件占用串口。

## 真实根因

这次问题不是“外部软件占用了 COM 口”，而是内部有两个状态问题叠加：

### 1. 前端发送路径状态错位

文件: [JS/ui/dronecan-setup.js](G:\soft\GCS\JS\ui\dronecan-setup.js)

页面已经显示 `SLCAN 直连 · COM9` 时，参数读取请求有时仍会误走 `MAVLink CAN_FORWARD` 分支，而不是当前的 `SLCAN` 通道。

结果就是:

- UI 看起来在走 `SLCAN`
- 实际发包却按 `MAVLink` 状态处理
- 错误提示因此被误导成“请切到 MAVLink CAN1”

### 2. SLCAN COM 桥进入半死状态

文件: [tools/com-bridge/server.py](G:\soft\GCS\tools\com-bridge\server.py)

`COM9` 会出现一种“表面 open，但底层 reader 已死”的状态。排查时 `http://127.0.0.1:8765/slcan-status` 返回过如下特征：

```json
{
  "open": true,
  "port": "COM9",
  "readerAlive": false,
  "error": "ClearCommError failed (PermissionError(13, '设备不识别此命令。', None, 22))"
}
```

这表示：

- 串口对象还挂着，看起来像“已打开”
- 但底层读线程已经退出
- 后续再发 DroneCAN GetSet 时就会失败
- 最终被包装成“串口访问被拒绝”

所以，报错文字虽然像“端口被占用”，但真实情况是:

`SLCAN 桥自身已经坏掉，处于 zombie state。`

## 为什么会出现“点击没反应”

旧逻辑里，`Parameters` 在真正打开弹窗前，会先做一次“参数支持探测”。

如果这个探测请求刚好打到了错误通道，或者撞上已经坏掉的 `COM9` 桥：

- 探测会失败
- 菜单会被直接关闭
- 用户从界面上看到的效果就是“点了没反应”

这不是按钮事件丢了，而是前置探测提前失败后直接返回了。

## 本次修复

### 修复 1: 参数读取按当前 UI 模式选择通道

文件: [JS/ui/dronecan-setup.js](G:\soft\GCS\JS\ui\dronecan-setup.js)

调整 `sendSlcanAsciiLine()`：

- 当当前模式是 `SLCAN 直连` 时，强制优先走 `/slcan-write`
- 不再因为残留的 `slcanBoundPort === "mavlink"` 状态误发到 `MAVLink` 分支

这修复了“界面显示 SLCAN，实际却按 MAVLink 发包”的问题。

### 修复 2: 去掉会造成“无响应错觉”的前置拦截

文件: [JS/ui/dronecan-setup.js](G:\soft\GCS\JS\ui\dronecan-setup.js)

调整 `handleNodeMenuAction()`：

- 点击 `Parameters` 时先打开参数弹窗
- 再在弹窗内部执行加载、超时提示或不支持提示

这样即使后续读取失败，用户也会看到明确反馈，而不是“点了没反应”。

### 修复 3: 前端发起 GetSet 前先检查桥是否已坏

文件: [JS/ui/dronecan-setup.js](G:\soft\GCS\JS\ui\dronecan-setup.js)

新增自愈逻辑：

- 读取参数前先查 `/slcan-status`
- 如果发现 `readerAlive=false` 或 `ClearCommError failed / PermissionError`
- 自动执行一次 `slcan-close -> slcan-open`

### 修复 4: 后端 `/slcan-write` 增加兜底自愈

文件: [tools/com-bridge/server.py](G:\soft\GCS\tools\com-bridge\server.py)

新增 `recover_slcan_hub_if_needed()`：

- 如果 SLCAN 处于 `open=true` 但 `readerAlive=false`
- 或错误中包含 `ClearCommError failed` / `PermissionError`
- 则自动关闭并重开上一次的端口，再重新初始化 SLCAN

这样即使前端没有先恢复，后端在真正写串口前也能把桥拉回可用状态。

## 关于 `Parameter service response timeout`

需要特别注意：

`Parameter service response timeout` 只能说明“这一次 DroneCAN GetSet 请求没有按时收到响应”，不能单独据此下结论说某个节点“不支持参数服务”。

它可能表示：

1. 节点当前忙，暂时没有回应
2. SLCAN 链路状态不稳定
3. 桥接服务刚经历过异常恢复
4. 参数服务确实没有响应

因此后续排查时，应把它当成“超时事实”，而不是“能力结论”。

## 本次验证结果

已通过 in-app browser 实测验证：

路径:

`初始设置 -> DroneCAN -> Node 51 (CUAV CAN PMU Lite) -> 设置菜单 -> Parameters`

结果:

- 参数弹窗正常打开
- 成功读取到参数列表
- 可见参数包括:
  - `PMU_CALIBRATED = true`
  - `CAN_NODE_ID = 51`
  - `CELL_SERIES_NUM = 0`
  - `CELL_FULL_VOLTAGE = 4200`
  - `CELL_EMPTY_VOLTAGE = 3500`
  - `BATTERY_ID = 1`

说明这次修复后，`DroneCAN 通过 SLCAN 无法读取参数` 这条主故障链已经被修复，并已在支持参数读取的节点上完成实测。

## 下次再遇到类似问题时，先看这几个信号

如果再次看到“串口访问被拒绝”，先不要立刻判断是 Mission Planner/QGC 占口，先检查：

1. `http://127.0.0.1:8765/slcan-status`
2. 是否存在以下组合：
   - `open: true`
   - `readerAlive: false`
   - `error` 含 `ClearCommError failed` 或 `PermissionError`
3. 页面当前是否显示 `SLCAN 直连`，但报错内容却在引导用户切到 `MAVLink CAN1`

如果是，那大概率不是外部占口，而是内部 SLCAN 桥坏了。

## 推荐排查顺序

1. 先看 `slcan-status`，确认桥是否是 zombie state。
2. 如果 `readerAlive=false`，优先重开 SLCAN 桥，不要先怀疑外部软件。
3. 再验证当前 UI 模式和真实发包通道是否一致。
4. 最后才去排查外部串口占用。

## 相关文件

- [JS/ui/dronecan-setup.js](G:\soft\GCS\JS\ui\dronecan-setup.js)
- [tools/com-bridge/server.py](G:\soft\GCS\tools\com-bridge\server.py)
- [README.md](G:\soft\GCS\README.md)
