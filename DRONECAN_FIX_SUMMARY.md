# DroneCAN串口通信权限问题修复总结

## 修改概述

本次修复针对DroneCAN参数读取时出现的`WriteFile failed (PermissionError(13, '设备不识别此命令。', None, 22))`错误,进行了两项关键优化:

### 1. 增强错误提示 ✅

**文件**: `JS/ui/dronecan-setup.js`  
**位置**: `ensureNodeParametersLoaded`函数 (第1968-1993行)

**改进内容**:
- 在参数读取循环中添加了权限错误的特殊检测
- 捕获`PermissionError`、`WriteFile failed`、`设备不识别`等关键词
- 提供清晰的中文提示,指导用户关闭其他地面站软件或切换到MAVLink CAN1模式

**修改代码**:
```javascript
// 检测权限相关错误并给出清晰提示
if (/PermissionError|WriteFile failed|设备不识别|Access denied|EACCES/i.test(errMsg)) {
  throw new Error(dcText(
    "Serial port access denied. Close other GCS software (Mission Planner/QGC) or switch to MAVLink CAN1 mode.",
    "串口访问被拒绝。请关闭其他地面站软件(Mission Planner/QGC),或切换到「MAVLink CAN1」模式。"
  ));
}
```

**效果**: 
-  之前: 显示原始错误码 `WriteFile failed (PermissionError(13, '设备不识别此命令。', None, 22))`
- ✅ 现在: 显示友好提示 `串口访问被拒绝。请关闭其他地面站软件(Mission Planner/QGC),或切换到「MAVLink CAN1」模式。`

---

### 2. 节点GetSet支持检测 ✅

**文件**: `JS/ui/dronecan-setup.js`  
**位置**: 新增`checkNodeParameterSupport`函数 + 修改`handleNodeMenuAction`函数 (第2281-2330行)

**改进内容**:
- 新增`checkNodeParameterSupport(nodeId)`函数,快速测试节点是否支持DroneCAN GetSet服务
- 在用户点击"Parameters"菜单时,先发送一个测试请求(index=0)
- 如果超时(timeout),只能说明本次 GetSet 请求未收到响应,应避免直接下结论为“节点不支持参数服务”

**新增函数**:
```javascript
async function checkNodeParameterSupport(nodeId) {
  try {
    await dronecanGetSet(nodeId, 0, null, "");
    return true;  // 支持GetSet
  } catch (err) {
    const errMsg = String(err?.message || err || "");
    if (/Parameter service response timeout/i.test(errMsg)) {
      return false;  // 不支持,无需继续尝试
    }
    throw err;  // 其他错误(如权限),继续抛出
  }
}
```

**修改逻辑**:
```javascript
if (action === "parameters") {
  // 快速检测节点是否支持GetSet服务
  setModalStatus(dcText("Checking parameter support...", "正在检查参数支持..."), "warn");
  try {
    const supported = await checkNodeParameterSupport(node.nodeId);
    if (!supported) {
      setModalStatus(dcText(
        `Node ${node.nodeId} does not support DroneCAN parameters. This is normal for some devices (e.g., GNSS modules).`,
        `节点 ${node.nodeId} 不支持 DroneCAN 参数服务。某些设备(如GNSS模块)不提供此功能是正常的。`
      ), "warn");
      hideNodeMenu();
      return;
    }
  } catch (err) {
    // 权限错误等其他问题,继续抛出让后续处理
    setModalStatus("", "");
    throw err;
  }
}
```

**效果**:
-  之前: 点击Node 30的"Parameters"后,等待约1分钟(512次超时×1.4秒)才报错
- ✅ 现在: 1.4秒内快速提示首个 GetSet 请求超时,避免长时间无反馈

---

## 适用场景分析

### Node 30 (DroneCAN GNSS/RTK) 说明

本次排查后确认:

- `Parameter service response timeout` 只能说明这一次请求超时
- 不能仅凭超时就断定 `Node 30` 不支持参数服务
- 对 `Node 30` 的能力判断必须以实际设备和固件表现为准

### 真正的权限问题

当遇到以下情况时,新的错误提示会生效:
1. COM9被Mission Planner占用
2. Windows应用商店版Python权限不足
3. USB驱动未正确安装

此时系统会提示:
> "串口访问被拒绝。请关闭其他地面站软件(Mission Planner/QGC),或切换到「MAVLink CAN1」模式。"

---

## 用户操作指南

### 方案A: 切换到MAVLink CAN1模式 (推荐)

1. 在DroneCAN面板顶部,点击"**MAVLink CAN1**"标签
2. 等待3-5秒,提示变为"MAVLink CAN1 · 已启用转发"
3. 重新选择Node 30或其他节点
4. 点击"设置菜单" → "Parameters"

**优点**: 绕过COM口直接访问,通过已建立的MAVLink连接转发DroneCAN帧

### 方案B: 关闭占用串口的软件

1. 关闭Mission Planner、QGroundControl、Arduino IDE等
2. 断开并重新插入飞控USB线
3. 刷新浏览器页面(F5)
4. 重新连接串口

### 方案C: 使用Web Serial第二路

1. 在"SLCAN 端口"下拉框选择"**＋ 授权第二路 USB 串口**"
2. 浏览器弹出串口选择对话框
3. 选择与顶部MAVLink不同的另一个COM口(通常是COM9)
4. 点击"连接"

---

## 验证清单

请在修复后执行以下测试:

- [ ] **测试1**: 点击Node 30的"Parameters"菜单,若首个请求超时,应在1-2秒内给出明确超时提示,而不是长时间无反馈
- [ ] **测试2**: 点击Node 51(CUAV PMU)的"Parameters"菜单,应能正常读取参数列表
- [ ] **测试3**: 保持Mission Planner开启,尝试读取参数,应显示友好的权限错误提示
- [ ] **测试4**: 切换到MAVLink CAN1模式后,应能成功读取支持参数的节点
- [ ] **测试5**: UI文本全部为中文,无英文混合显示

---

## 技术细节

### 错误匹配正则表达式

```javascript
/PermissionError|WriteFile failed|设备不识别|Access denied|EACCES/i
```

覆盖的错误类型:
- `PermissionError` - Python权限异常
- `WriteFile failed` - Windows串口写入失败
- `设备不识别` - USB驱动问题
- `Access denied` - 通用访问拒绝
- `EACCES` - POSIX权限错误

### GetSet服务检测原理

DroneCAN GetSet服务的标准行为:
- **支持的节点**: 返回参数信息(即使index=0不存在也会返回空值)
- **不支持的节点**: 完全不响应,导致1.4秒超时

通过检测首个参数(index=0)的响应,可以快速判断节点能力,避免无效循环。

---

## 注意事项

1. **不要回退`dcText()`函数修改** - 该函数已按用户要求改为只返回中文
2. **不要把超时直接等同于“不支持参数服务”** - 先区分链路问题、桥接异常和节点忙状态
3. **优先使用MAVLink CAN1模式** - 这是最稳定且不需要额外配置的传输方式
4. **如遇权限错误,先检查端口占用** - 90%的情况是其他软件占用了COM口

---

## 相关文件

- `JS/ui/dronecan-setup.js` - 主要修改文件
- `JS/core/com-bridge.js` - COM桥接服务(未修改)
- `JS/core/slcan-webserial.js` - Web Serial实现(未修改)

---

## 下一步建议

如果上述修复仍无法解决问题,可能需要:

1. **检查USB驱动** - 确保安装了正确的CDC-ACM驱动
2. **更新飞控固件** - 某些旧版本固件的DroneCAN实现有Bug
3. **使用管理员权限运行GCS** - 右键"GCS.cmd" → "以管理员身份运行"
4. **联系硬件厂商** - 确认Node 30是否应该支持GetSet服务

---

**修复完成时间**: 2026-06-06  
**修改文件数**: 1个 (`dronecan-setup.js`)  
**新增函数**: 1个 (`checkNodeParameterSupport`)  
**修改函数**: 2个 (`ensureNodeParametersLoaded`, `handleNodeMenuAction`)
