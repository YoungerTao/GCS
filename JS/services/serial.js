/**
 * serial.js — Web Serial 连接/断开/读循环 + MAVLink 命令收发
 *
 * 已拆出的模块：
 *   - com-bridge.js: 端口枚举、自动刷新
 *   - param-loader.js: 参数加载遮罩/进度条 UI
 */

window._pendingParamRequest = false;

// ========== 串口生命周期管理 ==========

/**
 * 释放 Web Serial 读写锁并关闭端口。
 * Windows 上若未关闭就再次 open，会报 InvalidStateError。
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
      try { await r.cancel(); } catch (_) { /* ignore */ }
      try { r.releaseLock(); } catch (_) { /* ignore */ }
    } else if (p && p.readable && p.readable.locked) {
      try { await p.readable.cancel(); } catch (_) { /* ignore */ }
    }
  } catch (_) { /* ignore */ }
  reader = null;
  window.reader = null;

  try {
    if (w) {
      try { await w.close(); } catch (_) { /* ignore */ }
      try { w.releaseLock(); } catch (_) { /* ignore */ }
    } else if (p && p.writable && p.writable.locked) {
      try { await p.writable.abort(); } catch (_) { /* ignore */ }
    }
  } catch (_) { /* ignore */ }
  writer = null;
  window.writer = null;

  try {
    if (p && typeof p.close === "function") await p.close();
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

  if (baudEl) baudEl.disabled = state === "connecting" || state === "connected";

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

function getSelectedBaudRate() {
  const el = document.getElementById("serialBaud");
  const n = el ? parseInt(String(el.value).trim(), 10) : 115200;
  return Number.isFinite(n) && n > 0 ? n : 115200;
}

async function disconnectSerial() {
  if (window._gcsConnState !== "connected") return;
  try {
    await closeSerialResources();
  } catch (e) {
    try { log(`⚠️ 断开清理异常: ${e?.message || e}`); } catch (_) { /* ignore */ }
  } finally {
    setConnectionUI("disconnected");
  }
  log("🔌 已取消连接（串口已释放）");
  try { await refreshPorts(); } catch (_) { /* ignore */ }
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

    if (!selectedValue) {
      const portsNow = await navigator.serial.getPorts();
      if (!portsNow.length) {
        setConnectionUI("connecting");
        const added = await requestAllPortsInteractive();
        if (!added) { log("⚠️ 未授权任何串口"); setConnectionUI("error"); return; }
        await refreshPorts();
        selectedValue = comSelect.value;
      } else {
        await refreshPorts();
        selectedValue = comSelect.value;
      }
      if (!selectedValue) { log("❌ 请先在下拉框中选择串口"); setConnectionUI("error"); return; }
    }

    setConnectionUI("connecting");

    let ports = await navigator.serial.getPorts();
    window._knownPorts = ports;

    if (!ports.length && selectedValue.startsWith("auth:")) {
      const added = await requestAllPortsInteractive();
      if (!added) { log("⚠️ 未授权任何串口"); setConnectionUI("error"); return; }
      ports = await navigator.serial.getPorts();
      window._knownPorts = ports;
      await refreshPorts();
      selectedValue = comSelect.value;
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
      const optionMeta = window._comOptionMap?.get(selectedValue);
      const sysPort = optionMeta ? optionMeta.systemPort : null;
      if (selectedValue.startsWith("sys:")) window._desiredSystemCom = selectedValue.slice(4);

      if (sysPort && typeof sysPort.usbVendorId === "number" && typeof sysPort.usbProductId === "number") {
        log(`🔐 为 ${sysPort.deviceId} 申请授权...`);
        try {
          selectedPort = await navigator.serial.requestPort({
            filters: [{ usbVendorId: sysPort.usbVendorId, usbProductId: sysPort.usbProductId }]
          });
        } catch (e) {
          log(`⚠️ 过滤授权失败，回退手动选择`);
          selectedPort = await navigator.serial.requestPort();
        }
      } else {
        log("🔐 申请授权（未获取到 VID/PID，使用手动选择）...");
        selectedPort = await navigator.serial.requestPort();
      }
    }

    const port = selectedPort;
    if (!port) throw new Error("未获取到串口端口对象");
    const baudRate = getSelectedBaudRate();
    await port.open({
      baudRate, dataBits: 8, stopBits: 1, parity: "none",
      flowControl: "none", bufferSize: 8192,
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
    sendHeartbeat().catch(() => {});
    setTimeout(() => sendHeartbeat().catch(() => {}), 250);
    readLoop();
    startTelemetryRequests();

    try { await refreshPorts(); } catch (e) { /* ignore */ }
    setConnectionUI("connected");
    schedulePostConnectMavlinkInfoRequests();
    if (typeof window.applyConnectionTelemetrySetup === "function") {
      window.applyConnectionTelemetrySetup()
        .then(() => {
          if (typeof window.startTelemetryMaintenance === "function") {
            window.startTelemetryMaintenance(window._telemetryProfile || "sr0");
          }
        })
        .catch((e) => log(`⚠️ 流速率/遥测初始化失败: ${e?.message || e}`));
    }

    // 概览「刷新固件/硬件信息」按钮
    const refreshBtn = document.getElementById("ov-refresh-version");
    if (refreshBtn && !refreshBtn.dataset.wired) {
      refreshBtn.dataset.wired = "1";
      refreshBtn.addEventListener("click", () => {
        requestAutopilotVersionAndEkfOnce();
        log("🔄 手动请求固件/硬件/设备 ID 信息", "debug");
      });
    }

    if (window._pendingParamRequest) {
      window._pendingParamRequest = false;
      log("📥 连接成功：开始加载参数表（PARAM_REQUEST_LIST）");
      if (typeof window.beginParamLoadingUI === "function") window.beginParamLoadingUI();
      setTimeout(() => send_v2(21, [window.sysid || 1, window.compid || 1], 159), 300);
    }
  } catch (e) {
    const name = e?.name || "Error";
    const msg = e?.message || String(e);
    log(`❌ 连接失败: ${name} - ${msg}`);
    if (/open serial port|InvalidStateError|Access denied|端口|占用|being used|in use/i.test(msg)) {
      log("💡 提示：请关闭 Mission Planner / QGC 等占用同一 COM 口的软件");
    }
    try { await closeSerialResources(); } catch (_) { /* ignore */ }
    setConnectionUI("error");
  }
}
window.connect = connect;

// ========== MAVLink 命令发送 ==========

const MAV_COMP_ID_MISSIONPLANNER = 190;

async function send_v2(msgid, payload, crc_extra) {
  if (typeof window._mavlinkTxSeq !== "number" || window._mavlinkTxSeq < 0 || window._mavlinkTxSeq > 255) {
    window._mavlinkTxSeq = 0;
  }
  window._mavlinkTxSeq = (window._mavlinkTxSeq + 1) & 0xff;

  const srcSys = typeof window.gcsSysId === "number" && window.gcsSysId >= 0 && window.gcsSysId <= 255
    ? window.gcsSysId : 255;

  const pkt = [
    0xFD, payload.length, 0, 0, window._mavlinkTxSeq,
    srcSys, MAV_COMP_ID_MISSIONPLANNER & 0xff,
    msgid & 0xff, (msgid >> 8) & 0xff, (msgid >> 16) & 0xff,
    ...payload
  ];

  let crc = crc_calculate(pkt.slice(1));
  crc = crc_accumulate(crc_extra, crc);
  pkt.push(crc & 0xff, crc >> 8);
  await writer.write(new Uint8Array(pkt));
}

async function sendCommandLong(command, p1, p2, p3, p4, p5, p6, p7, confirmation, targetSystem, targetComponent) {
  if (!(window.writer || writer)) throw new Error("未连接串口");

  const ts = targetSystem != null && Number(targetSystem) > 0 ? Number(targetSystem) : (window.sysid || 1);
  const tc = targetComponent != null ? Number(targetComponent) : (window.compid || 1);

  const payload = [
    ts & 0xff, tc & 0xff,
    ...u16bytes(command), (confirmation || 0) & 0xff,
    ...f32bytes(p1 || 0), ...f32bytes(p2 || 0), ...f32bytes(p3 || 0),
    ...f32bytes(p4 || 0), ...f32bytes(p5 || 0), ...f32bytes(p6 || 0),
    ...f32bytes(p7 || 0),
  ];
  await send_v2(76, payload, 152);
}

const MAV_CMD_REQUEST_MESSAGE = 512;
const MAV_CMD_REQUEST_AUTOPILOT_CAPABILITIES = 520;

async function sendHeartbeat() {
  await send_v2(0, [0, 0, 0, 0, 6, 8, 0, 0, 3], 50);
}

function f32bytes(v) {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, v, true);
  return Array.from(new Uint8Array(buf));
}

function u16bytes(v) { return [v & 0xff, (v >> 8) & 0xff]; }
function _sleepMs(ms) { return new Promise((r) => setTimeout(r, ms)); }

const MAV_CMD_ACCELCAL_VEHICLE_POS = 42429;

async function sendAccelcalVehiclePos(position) {
  if (!(window.writer || writer)) return false;
  const p1 = Number(position);
  if (!Number.isFinite(p1)) return false;
  await sendCommandLong(MAV_CMD_ACCELCAL_VEHICLE_POS, p1);
  return true;
}

window.sendParamSet = async function sendParamSet(name, value) {
  if (typeof send_v2 !== "function" || !(window.writer || writer)) return false;
  const encoder = new TextEncoder();
  const bytes = Array.from(encoder.encode(String(name).slice(0, 16)));
  while (bytes.length < 16) bytes.push(0);
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, Number(value), true);
  const payload = [...Array.from(new Uint8Array(buf)), window.sysid || 1, window.compid || 1, ...bytes, 9];
  await send_v2(23, payload, 168);
  return true;
};

// ========== 连接后操作 ==========

function fwOverviewStillPlaceholder() {
  return ["ov-fw-version", "ov-board-hardware", "ov-device-id"].some(id => {
    const el = document.getElementById(id);
    return el && String(el.textContent || "").includes("等待飞控上报");
  });
}

async function requestAutopilotVersionAndEkfOnce() {
  if (window._gcsConnState !== "connected" || !(window.writer || writer)) return;
  try { await sendCommandLong(MAV_CMD_REQUEST_AUTOPILOT_CAPABILITIES, 1, 0, 0, 0, 0, 0, 0, 0); } catch (_) {}
  await _sleepMs(120);
  try { await sendCommandLong(MAV_CMD_REQUEST_MESSAGE, 148, 0, 0, 0, 0, 0, 0, 0); } catch (_) {}
  await _sleepMs(120);
  try { await sendCommandLong(MAV_CMD_REQUEST_MESSAGE, 193, 0, 0, 0, 0, 0, 0, 0); } catch (_) {}
}
window.requestAutopilotVersionFromVehicle = requestAutopilotVersionAndEkfOnce;

function schedulePostConnectMavlinkInfoRequests() {
  if (window._postConnectInfoTimer) clearTimeout(window._postConnectInfoTimer);
  if (window._postConnectInfoRetryTimer) clearTimeout(window._postConnectInfoRetryTimer);
  if (window._postConnectInfoRetryCount) clearTimeout(window._postConnectInfoRetryCount);
  window._postConnectInfoRetries = 0;
  window._postConnectInfoTimer = setTimeout(() => {
    window._postConnectInfoTimer = null;
    if (window._gcsConnState !== "connected" || !(window.writer || writer)) return;
    (async () => {
      await requestAutopilotVersionAndEkfOnce();
      window._postConnectInfoRetryTimer = setTimeout(async function retryCheck() {
        window._postConnectInfoRetryTimer = null;
        if (window._gcsConnState !== "connected" || !(window.writer || writer)) return;
        if (fwOverviewStillPlaceholder()) {
          window._postConnectInfoRetries++;
          if (window._postConnectInfoRetries <= 5) {
            if (typeof log === "function") {
              log(`🔄 #148 版本信息未收到，第 ${window._postConnectInfoRetries} 次重试…`, "debug");
            }
            await requestAutopilotVersionAndEkfOnce();
            window._postConnectInfoRetryTimer = setTimeout(retryCheck, 3000);
          } else {
            if (typeof log === "function") {
              log("⚠️ 已重试 5 次仍未收到 #148，飞控可能不支持 MAV_CMD_REQUEST_MESSAGE", "debug");
            }
            // 不改动占位文本，让用户手动点"刷新"
          }
        } else {
          if (typeof log === "function") log("✅ #148 版本/硬件信息已收到并更新", "debug");
        }
      }, 3200);
    })();
  }, 500);
}

function startTelemetryRequests() {
  /* 周期遥测维护由 applyConnectionTelemetrySetup → startTelemetryMaintenance 按固件版本启动 */
}

// ========== 参数加载（保留引用 param-loader.js） ==========

async function loadParams() {
  if (!(window.writer || writer)) {
    window._pendingParamRequest = true;
    log("⚠️ 当前未连接成功：已缓存参数加载请求（连接成功后自动发送）");
    return;
  }
  if (typeof window.beginParamLoadingUI !== "function" || !window.beginParamLoadingUI()) {
    log("⚠️ 参数表正在加载中，请稍候或点击「取消」结束", "param-load");
    return;
  }
  window._pendingParamRequest = false;
  try {
    log("发送 PARAM_REQUEST_LIST");
    setTimeout(() => send_v2(21, [window.sysid || 1, window.compid || 1], 159), 300);
  } catch (e) {
    if (typeof window.endParamLoadingUI === "function") window.endParamLoadingUI(false, "send-fail");
    window._pendingParamRequest = true;
    log(`⚠️ PARAM_REQUEST_LIST 发送失败：${e?.message || e}`);
  }
}
window.loadParams = loadParams;

// ========== 读循环 ==========

async function readLoop() {
  while (true) {
    try {
      const { value } = await reader.read();
      if (!value) continue;
      for (let i = 0; i < value.length; i++) buf.push(value[i]);
      parse();
    } catch (e) {
      const msg = String(e?.message || e || "");
      if (e?.name === "AbortError") {
        try { if (reader && typeof reader.releaseLock === "function") reader.releaseLock(); } catch (_) { /* ignore */ }
        reader = null;
        window.reader = null;
        return;
      }
      const lost = e?.name === "NetworkError" || /device has been lost|设备丢失/i.test(msg);
      if (lost) {
        if (!window._readLoopLostWarned) {
          window._readLoopLostWarned = true;
          try { log("⚠️ 串口读取中断（设备已断开），请重新连接。"); } catch (_) { /* ignore */ }
        }
        try { await closeSerialResources(); } catch (_) { /* ignore */ }
        try { setConnectionUI("error"); } catch (_) { /* ignore */ }
        return;
      }
      throw e;
    }
  }
}

// ========== 导出 ==========

window.send_v2 = send_v2;
window.sendCommandLong = sendCommandLong;
window.sendHeartbeat = sendHeartbeat;
window.sendAccelcalVehiclePos = sendAccelcalVehiclePos;

console.log("✅ serial.js 已加载（精简版）");
