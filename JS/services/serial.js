window._knownPorts = window._knownPorts || [];
window._comOptionMap = window._comOptionMap || new Map();
window._systemComPorts = window._systemComPorts || [];
window._pendingParamRequest = false;

function setConnectionUI(state) {
  window._gcsConnState = state;
  try {
    document.dispatchEvent(new CustomEvent("gcs-connection", { detail: { state } }));
  } catch (e) { /* ignore */ }
  const comSelect = document.getElementById("comPort");
  const btn = document.getElementById("connectBtn");
  if (!comSelect || !btn) return;

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
    btn.textContent = "已连接";
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

async function fetchSystemComPorts() {
  const urls = [
    "http://127.0.0.1:8765/com-ports",
    "http://localhost:8765/com-ports"
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) continue;
      const data = await resp.json();
      const ports = Array.isArray(data.ports) ? data.ports : [];
      if (ports.length || data.ports) {
        window._comBridgeOnline = true;
        return ports;
      }
    } catch (e) {
      // try next
    }
  }
  window._comBridgeOnline = false;
  return [];
}

function portLabel(p, idx) {
  const info = p.getInfo ? p.getInfo() : {};
  const vid = typeof info.usbVendorId === "number" ? `VID_${info.usbVendorId.toString(16).toUpperCase().padStart(4, "0")}` : "VID_----";
  const pid = typeof info.usbProductId === "number" ? `PID_${info.usbProductId.toString(16).toUpperCase().padStart(4, "0")}` : "PID_----";
  return `串口${idx + 1} (${vid}:${pid})`;
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
async function refreshPorts() {
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
  const systemPorts = await fetchSystemComPorts();
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

    log(`✅ 串口列表已更新：系统 ${systemPorts.length} 个，已授权 ${ports.length} 个`);
    return;
  }

  if (window._comBridgeOnline === false) {
    log("⚠️ 系统COM桥接未连接，当前仅显示浏览器已授权串口");
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

  // 恢复之前的选择，或默认选第一个
  if (currentValue !== "" && Number(currentValue) < ports.length) {
    comSelect.value = currentValue;
  } else {
    comSelect.value = "auth:0";
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
  window.addEventListener("load", refreshPorts);

  // 插拔串口设备时自动刷新
  if (navigator.serial && navigator.serial.addEventListener) {
    navigator.serial.addEventListener("connect", refreshPorts);
    navigator.serial.addEventListener("disconnect", refreshPorts);
  }

  // 保底轮询，防止某些环境没有触发 connect/disconnect 事件
  if (window._portAutoRefreshTimer) clearInterval(window._portAutoRefreshTimer);
  window._portAutoRefreshTimer = setInterval(refreshPorts, 3000);
}

initSerialAutoRefresh();

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
    await port.open({ baudRate: 57600 });

    window.port = port;
    reader = port.readable.getReader();
    writer = port.writable.getWriter();
    window.reader = reader;
    window.writer = writer;

    log("✅ 已连接串口");

    setInterval(sendHeartbeat, 1000);
    readLoop();
    startTelemetryRequests();

    // 连接后刷新一次下拉框状态，让 [未授权] 变为已授权（如果 VID/PID 匹配成功）
    try { await refreshPorts(); } catch (e) { /* ignore */ }
    setConnectionUI("connected");

    // 如果用户在连接失败时点击过“加载参数”，连接成功后补发
    if (window._pendingParamRequest) {
      window._pendingParamRequest = false;
      log("📥 连接成功：补发 PARAM_REQUEST_LIST");
      setTimeout(() => send_v2(21, [sysid || 1, compid || 1], 159), 300);
    }
  } catch (e) {
    const name = e?.name || "Error";
    const msg = e?.message || String(e);
    log(`❌ 连接失败: ${name} - ${msg}`);
    setConnectionUI("error");
  }
}

async function send_v2(msgid, payload, crc_extra) {
  let pkt = [
    0xFD,
    payload.length,
    0, 0, 0,
    255,
    0,
    msgid & 0xff,
    (msgid >> 8) & 0xff,
    (msgid >> 16) & 0xff,
    ...payload
  ];

  let crc = crc_calculate(pkt.slice(1));
  crc = crc_accumulate(crc_extra, crc);

  pkt.push(crc & 0xff, crc >> 8);
  await writer.write(new Uint8Array(pkt));
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

// COMMAND_LONG: msgid=76, crc_extra=152
async function sendCommandLong(command, p1 = 0, p2 = 0, p3 = 0, p4 = 0, p5 = 0, p6 = 0, p7 = 0, confirmation = 0) {
  if (!(window.writer || (typeof writer !== "undefined" && writer))) {
    throw new Error("未连接串口");
  }
  const payload = [
    ...f32bytes(p1),
    ...f32bytes(p2),
    ...f32bytes(p3),
    ...f32bytes(p4),
    ...f32bytes(p5),
    ...f32bytes(p6),
    ...f32bytes(p7),
    ...u16bytes(command),
    sysid || 1,      // target_system
    compid || 1,     // target_component
    confirmation
  ];
  await send_v2(76, payload, 152);
}

/** ArduPilot / MAVLink: ACCELCAL_VEHICLE_POS (id 167), 单字节 position 枚举 */
async function sendAccelcalVehiclePos(positionU8) {
  if (!(window.writer || (typeof writer !== "undefined" && writer))) return false;
  await send_v2(167, [positionU8 & 0xff], 106);
  return true;
}

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

// 兼容老流控（REQUEST_DATA_STREAM）+ 新接口（SET_MESSAGE_INTERVAL）
async function requestDataStream() {
  // 1) 老接口，部分固件仍依赖它
  const streamPayload = [
    sysid || 1,                               // target_system
    compid || 1,                              // target_component
    0,                                        // req_stream_id = ALL
    10 & 0xff, (10 >> 8) & 0xff,              // req_message_rate = 10Hz
    1                                         // start_stop = start
  ];
  await send_v2(66, streamPayload, 21);       // REQUEST_DATA_STREAM

  // 2) ArduPilot 推荐接口：MAV_CMD_SET_MESSAGE_INTERVAL (511)
  // param1: message id, param2: interval_us
  const intervalUs = 100000; // 10Hz
  const msgIds = [
    0, 1, 24, 30, 33, 42, 65, 74, 77, 105, 110, 116, 129, 147, 191, 192, 253,
    // ESC telemetry groups (MAVLink 2 extended IDs)
    11030, 11031, 11032, 11033
  ];
  for (const msgId of msgIds) {
    await sendCommandLong(511, msgId, intervalUs);
  }
}

function startTelemetryRequests() {
  // 先清理旧定时器，避免重复请求
  if (window._telemetryReqTimer) {
    clearInterval(window._telemetryReqTimer);
    window._telemetryReqTimer = null;
  }

  // 初次连接后延迟一点，等拿到首个 HEARTBEAT/sysid 更稳
  setTimeout(async () => {
    try {
      log("📡 正在启动飞控遥测推送...");
      await requestDataStream();
      log("✅ 已发送遥测推送请求");
    } catch (e) {
      log(`⚠️ 初次遥测请求失败: ${e.message}`);
    }
  }, 1200);

  // 周期重发，保证飞控持续主动推送（类似 Mission Planner）
  window._telemetryReqTimer = setInterval(async () => {
    try {
      await requestDataStream();
    } catch (e) {
      log(`⚠️ 周期遥测请求失败: ${e.message}`);
    }
  }, 5000);
}

async function loadParams() {
  window._pendingParamRequest = true;

  // 未建立写入器时：缓存请求，等连接成功后自动补发
  if (!(window.writer || writer)) {
    log("⚠️ 当前未连接成功：已缓存参数加载请求（连接成功后自动发送）");
    return;
  }

  try {
    log("发送 PARAM_REQUEST_LIST");
    window._pendingParamRequest = false;
    setTimeout(() => send_v2(21, [sysid || 1, compid || 1], 159), 500);
  } catch (e) {
    // 发送失败则保持 pending，等下次连接成功自动补发
    window._pendingParamRequest = true;
    log(`⚠️ PARAM_REQUEST_LIST 发送失败：${e?.message || e}（将等待连接成功后自动重发）`);
  }
}

async function readLoop() {
  while (true) {
    const { value } = await reader.read();
    if (!value) continue;
    for (let b of value) {
      buf.push(b);
      parse();
    }
  }
}

window.loadParams = loadParams;