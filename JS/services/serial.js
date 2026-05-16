window._knownPorts = window._knownPorts || [];
window._comOptionMap = window._comOptionMap || new Map();
window._systemComPorts = window._systemComPorts || [];
window._pendingParamRequest = false;

/**
 * 释放 Web Serial 读写锁并关闭端口。Windows 上若未关闭就再次 open，会报
 * InvalidStateError / Failed to open serial port（端口仍被占用）。
 */
async function closeSerialResources() {
  if (window._heartbeatInterval) {
    clearInterval(window._heartbeatInterval);
    window._heartbeatInterval = null;
  }
  if (window._telemetryReqTimer) {
    clearInterval(window._telemetryReqTimer);
    window._telemetryReqTimer = null;
  }
  if (window._postConnectInfoTimer) {
    clearTimeout(window._postConnectInfoTimer);
    window._postConnectInfoTimer = null;
  }
  if (window._postConnectInfoRetryTimer) {
    clearTimeout(window._postConnectInfoRetryTimer);
    window._postConnectInfoRetryTimer = null;
  }
  if (typeof window.endParamLoadingUI === "function" && window._paramLoadActive) {
    window.endParamLoadingUI(false, "disconnect");
  }

  const p = window.port;
  const r = typeof reader !== "undefined" ? reader : null;
  const w = typeof writer !== "undefined" ? writer : null;

  try {
    if (r) {
      try {
        await r.cancel();
      } catch (_) { /* ignore */ }
      try {
        r.releaseLock();
      } catch (_) { /* ignore */ }
    } else if (p && p.readable && p.readable.locked) {
      try {
        await p.readable.cancel();
      } catch (_) { /* ignore */ }
    }
  } catch (_) { /* ignore */ }
  reader = null;
  window.reader = null;

  try {
    if (w) {
      try {
        await w.close();
      } catch (_) { /* ignore */ }
      try {
        w.releaseLock();
      } catch (_) { /* ignore */ }
    } else if (p && p.writable && p.writable.locked) {
      try {
        await p.writable.abort();
      } catch (_) { /* ignore */ }
    }
  } catch (_) { /* ignore */ }
  writer = null;
  window.writer = null;

  try {
    if (p && typeof p.close === "function") {
      await p.close();
    }
  } catch (_) { /* ignore */ }
  window.port = null;
}

function setConnectionUI(state) {
  window._gcsConnState = state;
  try {
    document.dispatchEvent(new CustomEvent("gcs-connection", { detail: { state } }));
  } catch (e) { /* ignore */ }
  const comSelect = document.getElementById("comPort");
  const btn = document.getElementById("connectBtn");
  const baudEl = document.getElementById("serialBaud");
  if (!comSelect || !btn) return;

  if (baudEl) {
    baudEl.disabled = state === "connecting" || state === "connected";
  }

  comSelect.classList.remove("com-disconnected", "com-connecting", "com-connected", "com-error");
  btn.classList.remove("connecting", "connected", "error");

  if (state === "connecting") {
    comSelect.classList.add("com-connecting");
    btn.classList.add("connecting");
    btn.disabled = true;
    btn.textContent = "连接中";
  } else if (state === "connected") {
    comSelect.classList.add("com-connected");
    btn.classList.add("connected");
    btn.disabled = false;
    btn.textContent = "取消连接";
  } else if (state === "error") {
    comSelect.classList.add("com-error");
    btn.classList.add("error");
    btn.disabled = false;
    btn.textContent = "连接失败";
  } else {
    comSelect.classList.add("com-disconnected");
    btn.disabled = false;
    btn.textContent = "连接串口";
  }
}

async function fetchSystemComPortsImpl() {
  const now = Date.now();
  if (typeof window._comBridgeBackoffUntil === "number" && now < window._comBridgeBackoffUntil) {
    return Array.isArray(window._lastFetchedSystemPorts) ? window._lastFetchedSystemPorts : [];
  }
  const url = "http://127.0.0.1:8765/com-ports";
  try {
    const resp = await fetch(url, { cache: "no-store" });
    if (resp.ok) {
      const data = await resp.json();
      const ports = Array.isArray(data.ports) ? data.ports : [];
      if (ports.length || data.ports) {
        window._comBridgeOnline = true;
        window._comBridgeBackoffUntil = 0;
        window._lastFetchedSystemPorts = ports;
        window._comBridgeOfflineHintLogged = false;
        return ports;
      }
    }
  } catch (e) {
    // 桥接未运行
  }
  window._comBridgeOnline = false;
  window._comBridgeBackoffUntil = Date.now() + 30000;
  window._lastFetchedSystemPorts = window._lastFetchedSystemPorts || [];
  return window._lastFetchedSystemPorts;
}

/** 串行化桥接请求，避免 load + serial connect 同时触发造成多次 ERR_CONNECTION_REFUSED */
async function fetchSystemComPorts() {
  fetchSystemComPorts._queue = fetchSystemComPorts._queue || Promise.resolve();
  const run = fetchSystemComPorts._queue.then(() => fetchSystemComPortsImpl());
  fetchSystemComPorts._queue = run.catch(() => {});
  return run;
}

function portLabel(p, idx) {
  const info = p.getInfo ? p.getInfo() : {};
  const hasVid = typeof info.usbVendorId === "number";
  const hasPid = typeof info.usbProductId === "number";
  if (hasVid && hasPid) {
    const vid = `VID_${info.usbVendorId.toString(16).toUpperCase().padStart(4, "0")}`;
    const pid = `PID_${info.usbProductId.toString(16).toUpperCase().padStart(4, "0")}`;
    return `串口${idx + 1} (${vid}:${pid})`;
  }
  // Windows 上部分 USB 转串口驱动在授权后仍不向 Chrome 暴露 USB VID/PID，属正常现象
  return `串口${idx + 1}（已授权，无 USB 信息）`;
}

function setComPlaceholder(comSelect, text) {
  const option = document.createElement("option");
  option.value = "";
  option.text = text;
  option.disabled = true;
  option.selected = true;
  comSelect.appendChild(option);
}

// 刷新可用串口列表（基于浏览器已授权端口）
// probeBridge: 是否请求本地 COM 桥接（8765）。定时轮询应传 false，避免与 serial connect 等事件叠加造成并发 fetch、控制台刷屏。
async function refreshPorts(opts = {}) {
  const probeBridge = opts.probeBridge !== false;
  if (!("serial" in navigator)) {
    const comSelect = document.getElementById("comPort");
    comSelect.innerHTML = "";
    setComPlaceholder(comSelect, "-- 当前浏览器不支持串口(Web Serial) --");
    log("❌ 当前浏览器不支持 Web Serial，请使用 Chrome/Edge（桌面版）");
    return;
  }

  if (!window.isSecureContext) {
    const comSelect = document.getElementById("comPort");
    comSelect.innerHTML = "";
    setComPlaceholder(comSelect, "-- 需在 localhost/https 下使用串口 --");
    log("❌ 当前页面不是安全上下文。请通过 http://127.0.0.1:<端口> 或 https 打开页面");
    return;
  }

  const ports = await navigator.serial.getPorts();
  const systemPorts = probeBridge
    ? await fetchSystemComPorts()
    : (Array.isArray(window._lastFetchedSystemPorts) ? window._lastFetchedSystemPorts : []);
  const comSelect = document.getElementById("comPort");
  const currentValue = comSelect.value;
  const desiredSystem = window._desiredSystemCom || null;

  window._knownPorts = ports;
  window._systemComPorts = systemPorts;
  window._comOptionMap = new Map();

  // 清除旧的选项（不保留占位项，避免数量看起来不一致）
  comSelect.innerHTML = "";

  // 优先显示系统真实 COM 名称（需要本地桥接服务）
  if (systemPorts.length > 0) {
    const usedAuth = new Set();
    systemPorts.forEach((sp, i) => {
      const option = document.createElement("option");
      let authIndex = -1;

      for (let j = 0; j < ports.length; j++) {
        if (usedAuth.has(j)) continue;
        const info = ports[j].getInfo ? ports[j].getInfo() : {};
        if (
          typeof sp.usbVendorId === "number" &&
          typeof sp.usbProductId === "number" &&
          info.usbVendorId === sp.usbVendorId &&
          info.usbProductId === sp.usbProductId
        ) {
          authIndex = j;
          usedAuth.add(j);
          break;
        }
      }

      const value = authIndex >= 0 ? `auth:${authIndex}` : `sys:${sp.deviceId || i}`;
      option.value = value;
      option.text = authIndex >= 0
        ? `${sp.deviceId} (${sp.name || "Unknown"})`
        : `${sp.deviceId} (${sp.name || "Unknown"}) [未授权]`;
      comSelect.appendChild(option);
      window._comOptionMap.set(value, { authIndex, systemPort: sp });
    });

    if (desiredSystem) {
      const targetOpt = Array.from(comSelect.options).find(o => o.text && o.text.startsWith(desiredSystem));
      if (targetOpt) comSelect.value = targetOpt.value;
      window._desiredSystemCom = null;
    } else if (currentValue !== "" && window._comOptionMap.has(currentValue)) {
      comSelect.value = currentValue;
    } else if (comSelect.options.length > 0) {
      comSelect.value = comSelect.options[0].value;
    }

    const addOptSys = document.createElement("option");
    addOptSys.value = "__add__";
    addOptSys.text = "＋ 添加/重新选择串口设备…";
    comSelect.appendChild(addOptSys);

    log(`✅ 串口列表已更新：系统 ${systemPorts.length} 个，已授权 ${ports.length} 个`);
    return;
  }

  if (window._comBridgeOnline === false && !window._comBridgeOfflineHintLogged) {
    window._comBridgeOfflineHintLogged = true;
    log("⚠️ COM 桥接未运行（约每 30 秒探测一次）。要显示系统 COM 名请执行: python tools/com-bridge/server.py — 切回此窗口可立即重试");
  }

  if (ports.length === 0) {
    setComPlaceholder(comSelect, "-- 暂无已授权串口 --");
    log("⚠️ 暂无已授权串口，请点击“连接串口”并在弹窗选择设备");
    return;
  }

  // 添加已授权串口（数量与浏览器识别到的授权串口一致）
  ports.forEach((port, index) => {
    const option = document.createElement("option");
    option.value = `auth:${index}`;
    option.text = portLabel(port, index);
    comSelect.appendChild(option);
    window._comOptionMap.set(option.value, { authIndex: index, systemPort: null });
  });

  if (systemPorts.length === 0 && window._comBridgeOnline === false) {
    const hint = document.createElement("option");
    hint.value = "__bridge_hint__";
    hint.disabled = true;
    hint.text = "── 运行桥接可看 COM 名: python tools/com-bridge/server.py ──";
    comSelect.insertBefore(hint, comSelect.firstChild);
  }

  const addOpt = document.createElement("option");
  addOpt.value = "__add__";
  addOpt.text = "＋ 添加/重新选择串口设备…";
  comSelect.appendChild(addOpt);

  const pickFirstPort = () => Array.from(comSelect.options).find(
    (o) => !o.disabled && o.value && (o.value.startsWith("auth:") || o.value.startsWith("sys:")),
  );

  if (currentValue && currentValue !== "__add__" && window._comOptionMap.has(currentValue)) {
    comSelect.value = currentValue;
  } else {
    const pick = pickFirstPort();
    if (pick) comSelect.value = pick.value;
  }

  log(`✅ 串口列表已更新：${ports.length} 个`);
}

async function requestAndRefreshPort() {
  try {
    await navigator.serial.requestPort();
    await refreshPorts();
  } catch (e) {
    if (e && e.name === "NotFoundError") {
      log("⚠️ 未选择串口设备");
      return false;
    }
    throw e;
  }
  return true;
}

async function requestAllPortsInteractive() {
  let added = 0;
  while (true) {
    try {
      await navigator.serial.requestPort();
      added += 1;
      await refreshPorts();
      const keepGoing = window.confirm("已添加一个串口。是否继续添加下一个串口？");
      if (!keepGoing) break;
    } catch (e) {
      // 用户取消选择，结束批量授权
      if (e && e.name === "NotFoundError") break;
      throw e;
    }
  }
  return added;
}

function initSerialAutoRefresh() {
  // 页面加载后先刷新一次
  window.addEventListener("load", () => refreshPorts({ probeBridge: true }));

  // 用户启动桥接后切回浏览器：低频触发一次完整探测（避免 focus 风暴导致连续 ERR_CONNECTION_REFUSED）
  if (!window._comBridgeFocusHooked) {
    window._comBridgeFocusHooked = true;
    window.addEventListener("focus", () => {
      const t = Date.now();
      if (window._comBridgeLastFocusProbe && t - window._comBridgeLastFocusProbe < 12000) return;
      window._comBridgeLastFocusProbe = t;
      window._comBridgeBackoffUntil = 0;
      refreshPorts({ probeBridge: true }).catch(() => {});
    });
  }

  // 插拔串口设备时自动刷新
  if (navigator.serial && navigator.serial.addEventListener) {
    navigator.serial.addEventListener("connect", () => refreshPorts({ probeBridge: true }));
    navigator.serial.addEventListener("disconnect", () => refreshPorts({ probeBridge: true }));
  }

  // 仅同步浏览器已授权串口；COM 桥接由 load / focus / connect 等显式探测
  if (window._portAutoRefreshTimer) clearInterval(window._portAutoRefreshTimer);
  window._portAutoRefreshTimer = setInterval(() => refreshPorts({ probeBridge: false }), 3000);

  // 用户稍后启动 server.py 且未切回窗口时，仍能偶尔刷新系统 COM 列表
  if (window._comBridgeSlowProbeTimer) clearInterval(window._comBridgeSlowProbeTimer);
  window._comBridgeSlowProbeTimer = setInterval(() => refreshPorts({ probeBridge: true }), 60000);
}

initSerialAutoRefresh();

function getSelectedBaudRate() {
  const el = document.getElementById("serialBaud");
  const n = el ? parseInt(String(el.value).trim(), 10) : 115200;
  return Number.isFinite(n) && n > 0 ? n : 115200;
}

async function disconnectSerial() {
  // 仅依据 UI 状态：避免出现「状态仍是已连接但 port 已被读循环清空」时无法复位、按钮卡在「取消连接」
  if (window._gcsConnState !== "connected") return;
  try {
    await closeSerialResources();
  } catch (e) {
    try {
      log(`⚠️ 断开清理异常: ${e?.message || e}`);
    } catch (_) { /* ignore */ }
  } finally {
    setConnectionUI("disconnected");
  }
  log("🔌 已取消连接（串口已释放）");
  try {
    await refreshPorts();
  } catch (_) { /* ignore */ }
}
window.disconnectSerial = disconnectSerial;

async function connect() {
  const comSelect = document.getElementById("comPort");
  let selectedValue = comSelect.value;

  try {
    if (!("serial" in navigator)) {
      log("❌ 当前浏览器不支持 Web Serial，请改用 Chrome/Edge（桌面版）");
      setConnectionUI("error");
      return;
    }
    if (!window.isSecureContext) {
      log("❌ 当前页面不是安全上下文，请通过 localhost 或 https 打开");
      setConnectionUI("error");
      return;
    }

    // 已连接时点击「取消连接」：断开并释放端口（不依赖 window.port，避免与读循环竞态导致无法断开）
    if (window._gcsConnState === "connected") {
      await disconnectSerial();
      return;
    }

    await closeSerialResources();

    if (selectedValue === "__add__") {
      setConnectionUI("connecting");
      const ok = await requestAndRefreshPort();
      setConnectionUI("disconnected");
      if (ok) log("✅ 已添加串口授权，请在下拉框选择对应 COM/设备后再次点击「连接串口」");
      else log("⚠️ 未添加新串口（已取消选择）");
      return;
    }

    // 当页面显示“暂无已授权串口”时，允许直接点击连接触发授权弹窗（macOS 常见首次使用场景）
    if (!selectedValue) {
      const portsNow = await navigator.serial.getPorts();
      if (!portsNow.length) {
        setConnectionUI("connecting");
        const added = await requestAllPortsInteractive();
        if (!added) {
          log("⚠️ 未授权任何串口");
          setConnectionUI("error");
          return;
        }
        await refreshPorts();
        selectedValue = comSelect.value;
      } else {
        await refreshPorts();
        selectedValue = comSelect.value;
      }

      if (!selectedValue) {
        log("❌ 请先在下拉框中选择串口");
        setConnectionUI("error");
        return;
      }
    }

    setConnectionUI("connecting");

    let ports = await navigator.serial.getPorts();
    window._knownPorts = ports;

    // 若当前没有已授权串口，点击连接时进入批量授权流程（可连续添加多个串口）
    if (!ports.length) {
      // 只有当用户选的是 auth:*（已授权列表里的项）时，才做批量授权；
      // 若用户选的是 sys:*，会在后面的 requestPort({filters}) 直接请求对应端口。
      if (selectedValue.startsWith("auth:")) {
        const added = await requestAllPortsInteractive();
        if (!added) {
          log("⚠️ 未授权任何串口");
          setConnectionUI("error");
          return;
        }
        ports = await navigator.serial.getPorts();
        window._knownPorts = ports;
        await refreshPorts();
        selectedValue = comSelect.value;
      }
    }

    let selectedPort = null;
    if (selectedValue.startsWith("auth:")) {
      const idx = Number(selectedValue.slice(5));
      if (Number.isNaN(idx) || idx < 0 || idx >= ports.length) {
        await refreshPorts();
        log("⚠️ 串口列表已变化，请重新选择");
        setConnectionUI("disconnected");
        return;
      }
      selectedPort = ports[idx];
      log(`🔌 使用已授权端口：${comSelect.options[comSelect.selectedIndex]?.text || selectedValue}`);
    } else {
      // 选的是系统口但尚未授权：直接 requestPort 获取端口（用桥接返回的 VID/PID 过滤）
      const optionMeta = window._comOptionMap.get(selectedValue);
      const sysPort = optionMeta ? optionMeta.systemPort : null;

      // 让刷新后仍保持在该系统 COM 项
      if (selectedValue.startsWith("sys:")) {
        window._desiredSystemCom = selectedValue.slice(4);
      }

      if (sysPort && typeof sysPort.usbVendorId === "number" && typeof sysPort.usbProductId === "number") {
        log(`🔐 为 ${sysPort.deviceId} 申请授权（过滤 VID/PID: ${sysPort.usbVendorId}/${sysPort.usbProductId}）...`);
        try {
          selectedPort = await navigator.serial.requestPort({
            filters: [{ usbVendorId: sysPort.usbVendorId, usbProductId: sysPort.usbProductId }]
          });
        } catch (e) {
          log(`⚠️ 过滤授权失败：${e?.name || "Error"} - ${e?.message || e}`);
          log("↩️ 回退到手动选择串口...");
          selectedPort = await navigator.serial.requestPort();
        }
      } else {
        log("🔐 申请授权（未获取到 VID/PID，使用手动选择）...");
        selectedPort = await navigator.serial.requestPort();
      }
    }

    const port = selectedPort;
    if (!port) throw new Error("未获取到串口端口对象（可能已取消权限弹窗）");
    const baudRate = getSelectedBaudRate();
    await port.open({
      baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      flowControl: "none",
      bufferSize: 8192,
    });

    window.port = port;
    reader = port.readable.getReader();
    writer = port.writable.getWriter();
    window.reader = reader;
    window.writer = writer;

    log(`✅ 已连接串口（${baudRate} 8N1）`);

    window._readLoopLostWarned = false;
    if (window._heartbeatInterval) clearInterval(window._heartbeatInterval);
    window._heartbeatInterval = setInterval(sendHeartbeat, 1000);
    // MP 连上即发 HEARTBEAT；我们原先要等 setInterval 首帧最多 1s，部分固件会晚响应
    sendHeartbeat().catch(() => {});
    setTimeout(() => {
      sendHeartbeat().catch(() => {});
    }, 250);
    readLoop();
    startTelemetryRequests();

    // 连接后刷新一次下拉框状态，让 [未授权] 变为已授权（如果 VID/PID 匹配成功）
    try { await refreshPorts(); } catch (e) { /* ignore */ }
    setConnectionUI("connected");
    schedulePostConnectMavlinkInfoRequests();
    setDefaultStreamRates().catch((e) => log(`⚠️ 流速率/遥测初始化失败: ${e?.message || e}`));

    // 如果用户在连接失败时点击过「加载参数」，连接成功后带遮罩补发（与手动加载一致）
    if (window._pendingParamRequest) {
      window._pendingParamRequest = false;
      log("📥 连接成功：开始加载参数表（PARAM_REQUEST_LIST）");
      if (typeof window.beginParamLoadingUI === "function") window.beginParamLoadingUI();
      setTimeout(() => send_v2(21, [sysid || 1, compid || 1], 159), 300);
    }
  } catch (e) {
    const name = e?.name || "Error";
    const msg = e?.message || String(e);
    log(`❌ 连接失败: ${name} - ${msg}`);
    if (/open serial port|InvalidStateError|Access denied|端口|占用|being used|in use/i.test(msg)) {
      log("💡 提示：请关闭 Mission Planner / QGC 等占用同一 COM 口的软件，或先点「已连接」断开后再连。");
    }
    try {
      await closeSerialResources();
    } catch (_) { /* ignore */ }
    setConnectionUI("error");
  }
}

/** 与 Mission Planner `MAVLinkInterface.generatePacket` 一致：帧头 compid 使用地面站组件 ID，勿用 0 */
const MAV_COMP_ID_MISSIONPLANNER = 190;

async function send_v2(msgid, payload, crc_extra) {
  if (typeof window._mavlinkTxSeq !== "number" || window._mavlinkTxSeq < 0 || window._mavlinkTxSeq > 255) {
    window._mavlinkTxSeq = 0;
  }
  window._mavlinkTxSeq = (window._mavlinkTxSeq + 1) & 0xff;

  // 帧头 sysid 必须是「地面站自己」，不能用 window.sysid（那是飞控）；与 MP 一致用 255
  const srcSys =
    typeof window.gcsSysId === "number" && window.gcsSysId >= 0 && window.gcsSysId <= 255
      ? window.gcsSysId
      : 255;

  let pkt = [
    0xFD,
    payload.length,
    0,
    0,
    window._mavlinkTxSeq,
    srcSys,                    // 关键修复：使用实际 sysid
    MAV_COMP_ID_MISSIONPLANNER & 0xff,
    msgid & 0xff,
    (msgid >> 8) & 0xff,
    (msgid >> 16) & 0xff,
    ...payload
  ];

  let crc = crc_calculate(pkt.slice(1));
  crc = crc_accumulate(crc_extra, crc);

  pkt.push(crc & 0xff, crc >> 8);
  await writer.write(new Uint8Array(pkt));

  if (window._MAVLINK_DEBUG_TX) {
    console.log(`[MAVLink TX] msgid=${msgid} srcSys=${srcSys} len=${payload.length}`);
  }
}

async function sendCommandLong(
  command,
  p1 = 0, p2 = 0, p3 = 0, p4 = 0, p5 = 0, p6 = 0, p7 = 0,
  confirmation = 0,
  targetSystem,
  targetComponent,
) {
  if (!(window.writer || (typeof writer !== "undefined" && writer))) {
    throw new Error("未连接串口");
  }

  const ts = targetSystem != null && Number.isFinite(Number(targetSystem)) && Number(targetSystem) > 0
    ? Number(targetSystem) : (window.sysid || 1);
  const tc = targetComponent != null && Number.isFinite(Number(targetComponent))
    ? Number(targetComponent) : (window.compid || 1);

  if (window._MAVLINK_DEBUG_TX) {
    console.log(`[DEBUG sendCommandLong] cmd=${command} (PREFLIGHT_CAL=${command === 241}) p5=${p5} ts=${ts} tc=${tc}`);
  }

  const payload = [
    ts & 0xff,
    tc & 0xff,
    ...u16bytes(command),
    confirmation & 0xff,
    ...f32bytes(p1),
    ...f32bytes(p2),
    ...f32bytes(p3),
    ...f32bytes(p4),
    ...f32bytes(p5),
    ...f32bytes(p6),
    ...f32bytes(p7),
  ];

  await send_v2(76, payload, 152);
  if (window._MAVLINK_DEBUG_TX) {
    console.log(`[DEBUG] ✅ 已成功发送 COMMAND_LONG cmd=${command} (p5=${p5})`);
  }
}

/** MAV_CMD_REQUEST_MESSAGE：点名要一条 MAVLink 消息 */
const MAV_CMD_REQUEST_MESSAGE = 512;
/** ArduPilot 等：应答后发出 AUTOPILOT_VERSION */
const MAV_CMD_REQUEST_AUTOPILOT_CAPABILITIES = 520;

function fwOverviewStillPlaceholder() {
  const ids = ["ov-fw-version", "ov-board-hardware", "ov-device-id"];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (String(el.textContent || "").includes("等待飞控上报")) return true;
  }
  return false;
}

async function requestAutopilotVersionAndEkfOnce() {
  if (window._gcsConnState !== "connected" || !(window.writer || writer)) return;
  try {
    await sendCommandLong(MAV_CMD_REQUEST_AUTOPILOT_CAPABILITIES, 1, 0, 0, 0, 0, 0, 0, 0);
  } catch (e) {
    try {
      log(`⚠️ REQUEST_AUTOPILOT_CAPABILITIES(520): ${e?.message || e}`);
    } catch (_) { /* ignore */ }
  }
  await new Promise((r) => setTimeout(r, 120));
  try {
    await sendCommandLong(MAV_CMD_REQUEST_MESSAGE, 148, 0, 0, 0, 0, 0, 0, 0);
  } catch (e) {
    try {
      log(`⚠️ REQUEST_MESSAGE(148 AUTOPILOT_VERSION): ${e?.message || e}`);
    } catch (_) { /* ignore */ }
  }
  await new Promise((r) => setTimeout(r, 120));
  try {
    await sendCommandLong(MAV_CMD_REQUEST_MESSAGE, 193, 0, 0, 0, 0, 0, 0, 0);
  } catch (e) {
    try {
      log(`⚠️ REQUEST_MESSAGE(193 EKF_STATUS_REPORT): ${e?.message || e}`);
    } catch (_) { /* ignore */ }
  }
}

window.requestAutopilotVersionFromVehicle = requestAutopilotVersionAndEkfOnce;

function schedulePostConnectMavlinkInfoRequests() {
  if (window._postConnectInfoTimer) {
    clearTimeout(window._postConnectInfoTimer);
    window._postConnectInfoTimer = null;
  }
  if (window._postConnectInfoRetryTimer) {
    clearTimeout(window._postConnectInfoRetryTimer);
    window._postConnectInfoRetryTimer = null;
  }
  window._postConnectInfoTimer = setTimeout(() => {
    window._postConnectInfoTimer = null;
    if (window._gcsConnState !== "connected" || !(window.writer || writer)) return;
    (async () => {
      await requestAutopilotVersionAndEkfOnce();
      window._postConnectInfoRetryTimer = setTimeout(async () => {
        window._postConnectInfoRetryTimer = null;
        if (window._gcsConnState !== "connected" || !(window.writer || writer)) return;
        if (fwOverviewStillPlaceholder()) await requestAutopilotVersionAndEkfOnce();
      }, 3200);
    })();
  }, 500);
}

async function sendHeartbeat() {
  let payload = [0, 0, 0, 0, 6, 8, 0, 0, 3];
  await send_v2(0, payload, 50);
}

function f32bytes(v) {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, v, true);
  return Array.from(new Uint8Array(buf));
}

function u16bytes(v) {
  return [v & 0xff, (v >> 8) & 0xff];
}

/**
 * 加速度计六面：向飞控下发当前姿态步骤。
 * 新固件走 MAV_CMD_ACCELCAL_VEHICLE_POS（42429）的 COMMAND_LONG，param1 为枚举值；
 * 旧版单字节消息 id=167 已不再被 ArduPilot 处理，会导致飞控不收位姿、灯态异常。
 * 参见 pymavlink：LEVEL=1…BACK=6，SUCCESS=16777215，FAILED=16777216。
 */
const MAV_CMD_ACCELCAL_VEHICLE_POS = 42429;

async function sendAccelcalVehiclePos(position) {
  if (!(window.writer || (typeof writer !== "undefined" && writer))) return false;
  const p1 = Number(position);
  if (!Number.isFinite(p1)) return false;
  await sendCommandLong(MAV_CMD_ACCELCAL_VEHICLE_POS, p1, 0, 0, 0, 0, 0, 0, 0);
  return true;
}

window.sendMavlinkV2 = send_v2;
window.sendCommandLong = sendCommandLong;
window.sendAccelcalVehiclePos = sendAccelcalVehiclePos;

// PARAM_SET msgid 23 crc_extra 168 — 供校准、电源等模块共用
window.sendParamSet = async function sendParamSet(name, value) {
  if (typeof send_v2 !== "function" || !(window.writer || writer)) return false;
  const encoder = new TextEncoder();
  const bytes = Array.from(encoder.encode(String(name).slice(0, 16)));
  while (bytes.length < 16) bytes.push(0);
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, Number(value), true);
  const payload = [
    ...Array.from(new Uint8Array(buf)),
    sysid || 1,
    compid || 1,
    ...bytes,
    9, // MAV_PARAM_TYPE_REAL32
  ];
  await send_v2(23, payload, 168);
  return true;
};

function _sleepMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 连接成功后：等心跳稳定 → 写 SR0_* → 首次 REQUEST_DATA_STREAM（周期重发见 startTelemetryRequests） */
async function setDefaultStreamRates() {
  await _sleepMs(1500); // 等飞控心跳稳定

  // 先写 SR0 参数
  const rates = {
    SR0_EXTRA1:   4,
    SR0_EXTRA2:   4,
    SR0_EXTRA3:   2,
    SR0_EXT_STAT: 2,
    SR0_POSITION: 2,
    SR0_RC_CHAN:  2,
  };
  for (const [name, value] of Object.entries(rates)) {
    await window.sendParamSet(name, value);
    await _sleepMs(80);
  }
  log("✅ SR0 流速率已写入飞控");

  // SR0写完后再等500ms，再发 REQUEST_DATA_STREAM
  await _sleepMs(500);
  await requestDataStream();
  log("✅ 已请求遥测推送");
}

// REQUEST_DATA_STREAM（msg 66）：Mission Planner 式分项请求各 MAV_DATA_STREAM；每 30s 整批重发（见 startTelemetryRequests）。
async function requestDataStream() {
  const ts = window.sysid || 1;
  const tc = window.compid || 1;

  const streams = [
    { sid: 10, hz: 4 },
    { sid: 11, hz: 4 },
    { sid: 6, hz: 2 },
    { sid: 2, hz: 2 },
    { sid: 3, hz: 2 },
    { sid: 12, hz: 2 },
  ];

  for (const { sid, hz } of streams) {
    const payload = [ts, tc, sid & 0xff, hz & 0xff, (hz >> 8) & 0xff, 1];
    await send_v2(66, payload, 21);
    await _sleepMs(50);
  }
}

function startTelemetryRequests() {
  if (window._telemetryReqTimer) {
    clearInterval(window._telemetryReqTimer);
    window._telemetryReqTimer = null;
  }
  // 周期重发，30秒一次
  window._telemetryReqTimer = setInterval(async () => {
    try {
      await requestDataStream();
    } catch (e) {
      log(`⚠️ 周期遥测请求失败: ${e.message}`);
    }
  }, 30000);
}

const PARAM_LOAD_WATCHDOG_MS = 120000;

window.updateParamLoadProgress = function updateParamLoadProgress(received, total) {
  const prog = document.getElementById("param-load-progress");
  const bar = document.getElementById("param-load-bar");
  if (prog) {
    prog.textContent =
      Number.isFinite(total) && total > 0
        ? `已接收 ${received} / ${total}`
        : `已接收 ${received} 条（等待飞控上报总数…）`;
  }
  if (!bar) return;
  if (Number.isFinite(total) && total > 0) {
    bar.classList.remove("param-load-bar--indeterminate");
    bar.style.left = "0";
    const pct = Math.min(100, Math.round((received / total) * 100));
    bar.style.width = `${pct}%`;
  } else {
    bar.classList.add("param-load-bar--indeterminate");
    bar.style.width = "";
    bar.style.left = "";
  }
};

function wireParamLoadCancelOnce() {
  const btn = document.getElementById("param-load-cancel");
  if (!btn || btn.dataset.wired === "1") return;
  btn.dataset.wired = "1";
  btn.addEventListener("click", () => {
    if (typeof window.cancelParamLoadingUI === "function") window.cancelParamLoadingUI();
  });
}

window.beginParamLoadingUI = function beginParamLoadingUI() {
  if (window._paramLoadActive) return false;
  wireParamLoadCancelOnce();

  window._paramLoadActive = true;
  window._paramLoadCancel = false;
  try {
    window.params.clear();
  } catch (_) { /* ignore */ }
  window._paramCount = undefined;

  const paramsEl = document.getElementById("params");
  if (paramsEl) paramsEl.innerHTML = '<span class="muted">参数表加载中…</span>';

  const ov = document.getElementById("param-load-overlay");
  if (ov) {
    ov.classList.remove("hidden");
    ov.setAttribute("aria-busy", "true");
  }
  const prog = document.getElementById("param-load-progress");
  if (prog) prog.textContent = "正在向飞控请求参数列表…";
  window.updateParamLoadProgress(0, NaN);

  const loadBtn = document.getElementById("loadParamsBtn");
  if (loadBtn) loadBtn.disabled = true;

  document.body.classList.add("param-loading");

  if (window._paramLoadWatchdog) clearTimeout(window._paramLoadWatchdog);
  window._paramLoadWatchdog = setTimeout(() => {
    if (!window._paramLoadActive) return;
    log(`⚠️ 参数加载超过 ${PARAM_LOAD_WATCHDOG_MS / 1000}s 仍未收齐，已结束等待`, "param-load");
    window.endParamLoadingUI(false, "timeout");
  }, PARAM_LOAD_WATCHDOG_MS);

  return true;
};

window.cancelParamLoadingUI = function cancelParamLoadingUI() {
  if (!window._paramLoadActive) return;
  window._paramLoadCancel = true;
  window.endParamLoadingUI(false, "cancel");
};

window.endParamLoadingUI = function endParamLoadingUI(ok, reason) {
  const wasActive = !!window._paramLoadActive;
  window._paramLoadActive = false;
  window._paramLoadCancel = false;

  if (window._paramLoadWatchdog) {
    clearTimeout(window._paramLoadWatchdog);
    window._paramLoadWatchdog = null;
  }

  const ov = document.getElementById("param-load-overlay");
  if (ov) {
    ov.classList.add("hidden");
    ov.setAttribute("aria-busy", "false");
  }
  document.body.classList.remove("param-loading");

  const loadBtn = document.getElementById("loadParamsBtn");
  if (loadBtn) loadBtn.disabled = false;

  const bar = document.getElementById("param-load-bar");
  if (bar) {
    bar.classList.remove("param-load-bar--indeterminate");
    bar.style.left = "0";
    bar.style.width = "0%";
  }

  if (typeof window.renderSortedParams === "function") window.renderSortedParams();

  if (!wasActive) return;

  if (ok && reason === "complete") {
    log(`✅ 参数表加载完成（${window.params.size} 项）`, "param-load");
    try {
      document.dispatchEvent(new CustomEvent("gcs-airframe-params-changed", { detail: { bulk: true } }));
    } catch (_) { /* ignore */ }
    if (typeof fwOverviewStillPlaceholder === "function" && fwOverviewStillPlaceholder()) {
      setTimeout(() => {
        if (window._gcsConnState === "connected" && (window.writer || writer)) {
          requestAutopilotVersionAndEkfOnce().catch(() => {});
        }
      }, 400);
    }
  } else if (reason === "cancel") {
    log(`已取消参数加载（已保留已收到的 ${window.params.size} 项）`, "param-load");
  } else if (reason === "disconnect") {
    log("⚠️ 连接已断开，参数加载中止", "param-load");
  } else if (reason === "send-fail") {
    log("⚠️ 无法发送参数列表请求", "param-load");
  }
};

async function loadParams() {
  if (!(window.writer || writer)) {
    window._pendingParamRequest = true;
    log("⚠️ 当前未连接成功：已缓存参数加载请求（连接成功后自动发送）");
    return;
  }

  if (!window.beginParamLoadingUI()) {
    log("⚠️ 参数表正在加载中，请稍候或点击「取消」结束", "param-load");
    return;
  }

  window._pendingParamRequest = false;
  try {
    log("发送 PARAM_REQUEST_LIST");
    setTimeout(() => send_v2(21, [sysid || 1, compid || 1], 159), 300);
  } catch (e) {
    window.endParamLoadingUI(false, "send-fail");
    window._pendingParamRequest = true;
    log(`⚠️ PARAM_REQUEST_LIST 发送失败：${e?.message || e}（将等待连接成功后自动重发）`);
  }
}

async function readLoop() {
  while (true) {
    try {
      const { value } = await reader.read();
      if (!value) continue;
      // 切勿每字节 parse()：大 chunk 下会 O(n²) 卡死主线程（表现为一点连接就页面无响应）
      for (let i = 0; i < value.length; i++) buf.push(value[i]);
      parse();
    } catch (e) {
      const msg = String(e?.message || e || "");
      if (e?.name === "AbortError") {
        try {
          if (typeof reader !== "undefined" && reader && typeof reader.releaseLock === "function") {
            reader.releaseLock();
          }
        } catch (_) { /* ignore */ }
        reader = null;
        window.reader = null;
        return;
      }
      const lost =
        e?.name === "NetworkError" || /device has been lost|设备丢失/i.test(msg);
      if (lost) {
        if (!window._readLoopLostWarned) {
          window._readLoopLostWarned = true;
          try {
            log("⚠️ 串口读取中断（设备已断开），请重新连接。");
          } catch (_) { /* ignore */ }
        }
        try {
          await closeSerialResources();
        } catch (_) { /* ignore */ }
        try {
          setConnectionUI("error");
        } catch (_) { /* ignore */ }
        return;
      }
      throw e;
    }
  }
}

window.loadParams = loadParams;
window.loadParams = loadParams;