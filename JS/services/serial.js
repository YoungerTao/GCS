/**
 * serial.js — Web Serial 连接/断开/读循环 + MAVLink 命令收发
 *
 * 已拆出的模块：
 *   - com-bridge.js: 端口枚举、自动刷新
 *   - param-loader.js: 参数加载遮罩/进度条 UI
 */

window._pendingParamRequest = false;
window._bridgeMode = window._bridgeMode || "auto";
window._bridgeConnActive = window._bridgeConnActive || false;

function shouldAutoLoadParams() {
  try {
    return localStorage.getItem("gcs.autoLoadParams") !== "0";
  } catch (_) {
    return true;
  }
}

async function bridgeFetch(path, body = null, bridgeOpts = {}) {
  if (!bridgeOpts.skipEnsure && typeof window.ensureComBridgeRunning === "function") {
    await window.ensureComBridgeRunning();
  }
  const fetchOpts = body ? {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
  } : { method: "GET" };
  const resp = await fetch(`http://127.0.0.1:8765${path}`, fetchOpts);
  const text = await resp.text();
  let data = {};
  try { data = JSON.parse(text); } catch (_) {}
  if (!resp.ok || data?.ok === false) {
    throw new Error(data?.error || `bridge ${path} failed (${resp.status})`);
  }
  return data;
}

function bridgeBytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function bridgeBase64ToBytes(text) {
  if (!text) return new Uint8Array(0);
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function missionBridgeFastWrite() {
  return (
    window._missionUploadActive === true ||
    (window._missionTransfer &&
      (window._missionTransfer.mode === "upload" || window._missionTransfer.mode === "download"))
  );
}

async function bridgeWriteBytes(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const fast = missionBridgeFastWrite();
  const writePromise = bridgeFetch(
    "/bridge-write",
    { data: bridgeBytesToBase64(arr) },
    { skipEnsure: fast }
  );
  if (fast) {
    writePromise.catch(function (err) {
      const msg = err && err.message ? err.message : String(err);
      if (window._missionTransfer && !window._missionTransfer.error) {
        window._missionTransfer.error = "桥接写入失败: " + msg;
      }
    });
    return;
  }
  await writePromise;
}

function resolveBridgeDeviceId(selectedValue, optionMeta, comSelect) {
  const sp = optionMeta?.systemPort;
  if (sp?.deviceId) return String(sp.deviceId).trim().split(" ")[0];
  if (selectedValue.startsWith("sys:")) {
    return selectedValue.replace(/^sys:/, "").trim().split(" ")[0];
  }
  return "";
}

/** 仅对 COM 桥枚举口（sys: / deviceId）走桥接；auth: 为 Web Serial 授权项 */
function shouldUseBridgeForSelection(selectedValue, optionMeta) {
  if (!selectedValue || selectedValue.startsWith("__")) return false;
  if (selectedValue.startsWith("auth:")) return false;
  if (window._bridgeMode === "bridge") return true;
  if (window._bridgeMode !== "auto") return false;
  const sp = optionMeta?.systemPort;
  if (sp?.deviceId) return true;
  return selectedValue.startsWith("sys:");
}

function getDuplicateVidPidSiblingPorts(deviceId) {
  const ports = Array.isArray(window._systemComPorts) ? window._systemComPorts : [];
  const current = ports.find((p) => p.deviceId === deviceId);
  if (!current || typeof current.usbVendorId !== "number" || typeof current.usbProductId !== "number") {
    return [];
  }
  return ports.filter(
    (p) =>
      p.deviceId &&
      p.deviceId !== deviceId &&
      p.usbVendorId === current.usbVendorId &&
      p.usbProductId === current.usbProductId
  );
}

async function probeBridgePortActivity(port, baudRate, dwellMs = 500) {
  try {
    await bridgeFetch("/bridge-close", {});
  } catch (_) { /* ignore */ }
  await bridgeFetch("/bridge-open", { port, baudrate: baudRate });
  await new Promise((r) => setTimeout(r, dwellMs));
  const resp = await bridgeFetch("/bridge-read");
  const chunk = bridgeBase64ToBytes(resp?.data || "");
  try {
    await bridgeFetch("/bridge-close", {});
  } catch (_) { /* ignore */ }
  return chunk.length;
}

async function pickActiveBridgePort(deviceId, baudRate, opts = {}) {
  const exclude = new Set(
    (opts.excludeDeviceIds || []).filter((id) => typeof id === "string" && id)
  );
  if (typeof window.getSlcanDeviceId === "function") {
    const slcanId = window.getSlcanDeviceId();
    if (slcanId) exclude.add(slcanId);
  }
  const siblings = getDuplicateVidPidSiblingPorts(deviceId).filter((p) => !exclude.has(p.deviceId));
  if (!siblings.length) return deviceId;

  const candidates = [deviceId, ...siblings.map((p) => p.deviceId)].filter((id) => !exclude.has(id));
  if (!candidates.length) return deviceId;
  if (candidates.length === 1) return candidates[0];
  let best = deviceId;
  let bestScore = -1;
  for (const port of candidates) {
    let score = 0;
    try {
      score = await probeBridgePortActivity(port, baudRate);
    } catch (_) { /* ignore */ }
    if (score > bestScore) {
      bestScore = score;
      best = port;
    }
  }
  if (best !== deviceId && bestScore > 0) {
    log(`💡 检测到同 VID/PID 多串口，已自动选用数据更活跃的 ${best}`);
  }
  return best;
}

async function bridgeReadLoop() {
  while (window._bridgeConnActive) {
    try {
      let bursts = 0;
      const maxBursts = window._paramLoadActive ? 64 : missionBridgeFastWrite() ? 48 : 24;
      while (window._bridgeConnActive && bursts < maxBursts) {
        const resp = await bridgeFetch("/bridge-read", null, { skipEnsure: true });
        const chunk = bridgeBase64ToBytes(resp?.data || "");
        if (!chunk.length) break;
        bursts += 1;
        const rx = window.buf;
        for (let i = 0; i < chunk.length; i++) rx.push(chunk[i]);
        if (typeof parse === "function") {
          parse();
          let drain = 0;
          while (rx.length > 2048 && drain < 16 && typeof parse === "function") {
            parse();
            drain += 1;
          }
        }
      }
      const fastMissionIo = missionBridgeFastWrite();
      const waitMs = window._paramLoadActive
        ? bursts
          ? 8
          : 5
        : fastMissionIo
          ? bursts
            ? 4
            : 6
          : bursts
            ? 15
            : 45;
      await new Promise((r) => setTimeout(r, waitMs));
    } catch (e) {
      const msg = e?.message || String(e);
      log(`桥接读失败: ${msg}`);
      window._bridgeConnActive = false;
      setConnectionUI("error");
      return;
    }
  }
}

let _bridgeDataWatchdog = null;
function startBridgeDataWatchdog() {
  if (_bridgeDataWatchdog) clearInterval(_bridgeDataWatchdog);
  _bridgeDataWatchdog = setInterval(async () => {
    if (!window._bridgeConnActive) {
      clearInterval(_bridgeDataWatchdog);
      _bridgeDataWatchdog = null;
      return;
    }
    try {
      const st = await bridgeFetch("/bridge-status", null, { skipEnsure: true });
      const readerDead = st?.readerAlive === false;
      const noRecentSerialRx = typeof st?.lastRxAgeSec === "number" && st.lastRxAgeSec > 12;
      const noMavlink = !window._lastMavlinkRxMs || (Date.now() - window._lastMavlinkRxMs > 8000);
      if ((readerDead || noRecentSerialRx) && noMavlink) {
        log("⚠️ 桥接串口读线程或数据已停止流动（readerAlive/lastRx 异常），链路疑似中断。建议：检查飞控供电与USB线缆、确认波特率正确、或断开后重连 / 重启 GCS 后台。", "bridge");
        // Do not auto force-close here (user may be mid-flight); just surface the diagnostic.
      }
    } catch (_) {
      // ignore transient status poll errors
    }
  }, 7000);
}

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
  if (_bridgeDataWatchdog) {
    clearInterval(_bridgeDataWatchdog);
    _bridgeDataWatchdog = null;
  }
  if (typeof window.endParamLoadingUI === "function" && window._paramLoadActive) {
    window.endParamLoadingUI(false, "disconnect");
  }
  window._gcsParamsLoadedOnce = false;
  window._gcsParamsLoadedSessionId = null;
  window._motorFrameProbeExhausted = false;
  if (window.MavlinkMission && window.MavlinkMission.resetMissionSession) {
    window.MavlinkMission.resetMissionSession();
  }
  window._missionUploadActive = false;
  window._bridgeConnActive = false;

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
  try {
    await bridgeFetch("/bridge-close", {}, { skipEnsure: true });
  } catch (_) { /* ignore */ }
}

function bumpConnectionSession() {
  window._gcsConnSessionId = (window._gcsConnSessionId || 0) + 1;
  window._gcsParamsLoadedSessionId = null;
  window._gcsParamsLoadedOnce = false;
  const rx = window.buf;
  if (rx && rx.length) rx.length = 0;
  window._crcDiag = null;
  window._mavlinkCrcErrors = 0;
  window._lastMavlinkRxMs = 0;
  const now = Date.now();
  const graceMs = window._gcsAutoConnectActive ? 3000 : 2000;
  window._mavlinkCrcSessionStartMs = now;
  window._mavlinkCrcGraceUntil = now + graceMs;
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

function scheduleRefreshPorts(opts = {}) {
  if (typeof window.refreshPorts !== "function") return;
  window.refreshPorts(opts).catch(() => {});
}

async function openSerialPortWithTimeout(port, options, timeoutMs = 15000) {
  let timer = null;
  try {
    await Promise.race([
      port.open(options),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("串口打开超时（15s），请关闭 Mission Planner/QGC 后重试")),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
  if (typeof window.markGcsSessionDisconnected === "function") {
    window.markGcsSessionDisconnected();
  }
  log("🔌 已取消连接（串口已释放）");
  scheduleRefreshPorts({ probeBridge: false });
}
window.disconnectSerial = disconnectSerial;

let _connectInFlight = null;

async function connect() {
  if (_connectInFlight) return _connectInFlight;

  _connectInFlight = connectImpl().finally(() => {
    _connectInFlight = null;
  });
  return _connectInFlight;
}

async function connectImpl() {
  const comSelect = document.getElementById("comPort");
  if (!comSelect) {
    log("❌ 页面未就绪：找不到串口下拉框");
    return;
  }
  let selectedValue = comSelect.value;

  if (window._gcsConnState === "connecting") {
    log("⚠️ 正在连接中，请稍候…");
    return;
  }

  let connectWatchdog = null;
  const armConnectWatchdog = () => {
    if (connectWatchdog) clearTimeout(connectWatchdog);
    connectWatchdog = setTimeout(() => {
      if (window._gcsConnState !== "connecting") return;
      log("❌ 连接超时（25s），已释放串口；请改选带 [MAVLink] 的口或串口1 后重试");
      closeSerialResources()
        .catch(() => {})
        .finally(() => setConnectionUI("error"));
    }, 25000);
  };
  const disarmConnectWatchdog = () => {
    if (connectWatchdog) clearTimeout(connectWatchdog);
    connectWatchdog = null;
  };

  try {
    const canWebSerial = typeof window.hasWebSerialApi === "function"
      ? window.hasWebSerialApi()
      : !!(navigator.serial && window.isSecureContext);

    if (!window.isSecureContext) {
      log("❌ 当前页面不是安全上下文，请通过 localhost 或 https 打开");
      setConnectionUI("error");
      return;
    }

    if (selectedValue === "__refresh_bridge__") {
      setConnectionUI("connecting");
      if (typeof window.refreshPorts === "function") {
        await window.refreshPorts({ probeBridge: true });
      }
      setConnectionUI("disconnected");
      log("↻ 已刷新 COM 列表，请从下拉选择端口后点击「连接串口」");
      return;
    }

    if (!canWebSerial) {
      window._bridgeMode = "bridge";
      if (typeof window.ensureComBridgeRunning === "function") {
        const bridgeOk = await window.ensureComBridgeRunning();
        if (!bridgeOk) {
          log("❌ COM 桥未就绪：请先 Open with Live Server，或确认 Python 服务已启动");
          setConnectionUI("error");
          return;
        }
      }
    } else if (!("serial" in navigator)) {
      log("❌ 当前浏览器不支持 Web Serial，请改用 Chrome/Edge（桌面版）");
      setConnectionUI("error");
      return;
    }

    if (window._gcsConnState === "connected") {
      await disconnectSerial();
      return;
    }

    setConnectionUI("connecting");
    armConnectWatchdog();

    await closeSerialResources();

    const optionMetaEarly = window._comOptionMap?.get(selectedValue);
    const useBridge =
      !canWebSerial
        ? !!selectedValue && !selectedValue.startsWith("__")
        : shouldUseBridgeForSelection(selectedValue, optionMetaEarly);

    if (useBridge && selectedValue) {
      if (typeof window.ensureComBridgeRunning === "function") {
        const bridgeOk = await window.ensureComBridgeRunning();
        if (!bridgeOk) {
          const msg = window._gcsAutoConnectActive
            ? "⏳ 自动连接：COM 桥未就绪，稍后将重试"
            : "❌ COM 桥未就绪：请确认 GCS 后台服务已启动";
          log(msg);
          setConnectionUI("disconnected");
          return;
        }
      }
      try {
        const baudRate = getSelectedBaudRate();
        const optionMeta = optionMetaEarly || window._comOptionMap?.get(selectedValue);
        if (optionMeta?.systemPort && typeof window.isNoiseSerialPort === "function" && window.isNoiseSerialPort(optionMeta.systemPort)) {
          log("❌ 当前选中的是蓝牙/调试口，无法连接飞控。请在下拉中选择 CUAV/Pixhawk 的 usbmodem 口");
          setConnectionUI("error");
          return;
        }
        let portName = resolveBridgeDeviceId(selectedValue, optionMeta, comSelect);
        if (!portName) {
          throw new Error("未识别到 COM 口名称，请在下拉中点击「↻ 刷新 COM 列表」并选择带 [桥接] 的端口");
        }
        const portRole =
          typeof window.getPortProbeRole === "function"
            ? window.getPortProbeRole(optionMeta?.systemPort)
            : "";
        const slcanPort =
          typeof window.getSlcanDeviceId === "function" ? window.getSlcanDeviceId() : "";
        const mavlinkPort =
          typeof window.getMavlinkDeviceId === "function" ? window.getMavlinkDeviceId() : "";
        if (portRole === "slcan" || (slcanPort && portName === slcanPort)) {
          if (mavlinkPort) {
            log(`💡 当前选中 SLCAN 口，已改连 MAVLink 口：${mavlinkPort}`);
            portName = mavlinkPort;
          } else {
            log("❌ 探测为 SLCAN 口，不能用于 MAVLink 连接。请选 [MAVLink] 口");
            setConnectionUI("error");
            return;
          }
        } else if (!portRole && mavlinkPort) {
          portName = mavlinkPort;
        }
        if (!portRole && !mavlinkPort && !window._gcsAutoConnectActive) {
          const siblings = getDuplicateVidPidSiblingPorts(portName);
          if (siblings.length) {
            portName = await pickActiveBridgePort(portName, baudRate, { excludeDeviceIds: [slcanPort] });
          }
        }
        const opened = await bridgeFetch("/bridge-open", { port: portName, baudrate: baudRate });
        window._bridgeConnActive = true;
        window.port = { bridge: true, close: async () => { await bridgeFetch("/bridge-close", {}); } };
        writer = { write: async (bytes) => bridgeWriteBytes(bytes) };
        window.writer = writer;
        reader = { cancel: async () => {}, releaseLock: () => {} };
        window.reader = reader;
        log(`✅ 桥接串口已打开：${opened.port || portName} @ ${opened.baudrate}`);
        window._readLoopLostWarned = false;
        if (window._heartbeatInterval) clearInterval(window._heartbeatInterval);
        window._heartbeatInterval = setInterval(sendHeartbeat, 1000);
        sendHeartbeat().catch(() => {});
        setTimeout(() => sendHeartbeat().catch(() => {}), 250);
        bridgeReadLoop();
        startBridgeDataWatchdog();
        bumpConnectionSession();
        setConnectionUI("connected");
        if (typeof window.rememberSelectedPort === "function") {
          window.rememberSelectedPort(
            selectedValue,
            comSelect.options[comSelect.selectedIndex]?.text || selectedValue
          );
        }
        if (typeof window.markGcsSessionConnected === "function") {
          window.markGcsSessionConnected();
        }
        if (typeof window.resetAutoConnectAttempts === "function") {
          window.resetAutoConnectAttempts();
        }
        schedulePostConnectMavlinkInfoRequests();
        if (typeof window.applyConnectionTelemetrySetup === "function") {
          window.applyConnectionTelemetrySetup()
            .then(() => {
              if (typeof window.startTelemetryMaintenance === "function") {
                window.startTelemetryMaintenance(window._telemetryProfile || "sr0");
              }
            })
            .catch((e) => log(`桥接遥测初始化失败: ${e?.message || e}`));
        }
        if (window._pendingParamRequest || shouldAutoLoadParams()) {
          window._pendingParamRequest = false;
          log("桥接连接成功：开始加载参数表");
          if (typeof window.loadParams === "function") {
            window.loadParams({ force: true }).catch(() => {});
          }
        }
        disarmConnectWatchdog();
        return;
      } catch (bridgeErr) {
        window._bridgeConnActive = false;
        if (window._gcsAutoConnectActive) {
          log(`⏳ 自动连接：桥接打开失败，将重试（${bridgeErr?.message || bridgeErr}）`);
          setConnectionUI("disconnected");
          return;
        }
        if (!canWebSerial) {
          log(`❌ COM 桥连接失败：${bridgeErr?.message || bridgeErr}`);
          setConnectionUI("error");
          return;
        }
        log(`⚠️ 桥接模式失败，回退 Web Serial：${bridgeErr?.message || bridgeErr}`);
      }
    }

    if (!canWebSerial) {
      log("❌ 内置浏览器请从顶部下拉选择 COM 口后连接（无 Web Serial 弹窗）");
      setConnectionUI("error");
      return;
    }

    if (selectedValue === "__add__") {
      if (window._gcsAutoConnectActive) return;
      const ok = await requestAndRefreshPort();
      if (!ok) {
        log(canWebSerial ? "⚠️ 未选择飞控串口（已取消）" : "⚠️ 未发现 COM 口，请确认飞控已插入且 COM 桥已启动");
        setConnectionUI("disconnected");
        return;
      }
      selectedValue = comSelect.value;
      if (!selectedValue || selectedValue === "__add__" || selectedValue.startsWith("__")) {
        const portsNow = await navigator.serial.getPorts();
        if (portsNow.length) selectedValue = "auth:0";
        else {
          log("⚠️ 未找到已授权串口，请重试");
          setConnectionUI("disconnected");
          return;
        }
      }
      log("🔌 已授权串口，正在连接…");
    }

    if (!canWebSerial && (!selectedValue || selectedValue === "__refresh_bridge__")) {
      log("❌ 请先从顶部下拉选择 COM 口（内置浏览器不支持浏览器选串口弹窗）");
      setConnectionUI("error");
      return;
    }

    if (!selectedValue) {
      const portsNow = canWebSerial ? await navigator.serial.getPorts() : [];
      if (!portsNow.length) {
        setConnectionUI("connecting");
        const added = await requestAllPortsInteractive();
        if (!added) { log("⚠️ 未授权任何串口"); setConnectionUI("error"); return; }
        await refreshPorts();
        selectedValue = comSelect.value;
      } else {
        selectedValue = comSelect.value || selectedValue;
      }
      if (!selectedValue) { log("❌ 请先在下拉框中选择串口"); setConnectionUI("error"); return; }
    }

    log("🔌 正在通过 Web Serial 连接…");

    let ports = await navigator.serial.getPorts();
    window._knownPorts = ports;

    if (!ports.length && selectedValue.startsWith("auth:")) {
      log("⚠️ 浏览器未找到已授权串口，请在弹窗中重新选择飞控 USB 口");
      const added = await requestAllPortsInteractive();
      if (!added) { log("⚠️ 未授权任何串口"); setConnectionUI("error"); return; }
      ports = await navigator.serial.getPorts();
      window._knownPorts = ports;
      scheduleRefreshPorts({ probeBridge: true });
      selectedValue = comSelect.value || `auth:0`;
    }

    let selectedPort = null;
    if (selectedValue.startsWith("auth:")) {
      const idx = Number(selectedValue.slice(5));
      if (Number.isNaN(idx) || idx < 0 || idx >= ports.length) {
        scheduleRefreshPorts({ probeBridge: true });
        log("⚠️ 串口列表已变化，请重新选择后连接");
        setConnectionUI("disconnected");
        return;
      }
      selectedPort = ports[idx];
      log(`🔌 使用已授权端口：${comSelect.options[comSelect.selectedIndex]?.text || selectedValue}`);
    } else {
      const optionMeta = window._comOptionMap?.get(selectedValue);
      const sysPort = optionMeta ? optionMeta.systemPort : null;
      if (selectedValue.startsWith("sys:")) window._desiredSystemCom = selectedValue.slice(4);

      if (window._gcsAutoConnectActive) {
        log("⏳ 自动连接需要已授权串口或 COM 桥；请手动点击「连接串口」完成首次授权");
        setConnectionUI("disconnected");
        return;
      }

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
    try {
      await openSerialPortWithTimeout(port, {
        baudRate, dataBits: 8, stopBits: 1, parity: "none",
        flowControl: "none", bufferSize: 8192,
      });
    } catch (openErr) {
      const om = openErr?.message || String(openErr);
      if (/InvalidStateError|already open/i.test(om)) {
        try { await port.close(); } catch (_) { /* ignore */ }
        await openSerialPortWithTimeout(port, {
          baudRate, dataBits: 8, stopBits: 1, parity: "none",
          flowControl: "none", bufferSize: 8192,
        });
      } else {
        throw openErr;
      }
    }

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
    bumpConnectionSession();
    setConnectionUI("connected");
    disarmConnectWatchdog();
    scheduleRefreshPorts({ probeBridge: false });
    if (typeof window.rememberSelectedPort === "function") {
      window.rememberSelectedPort(
        comSelect.value || selectedValue,
        comSelect.options[comSelect.selectedIndex]?.text || selectedValue
      );
    }
    if (typeof window.markGcsSessionConnected === "function") {
      window.markGcsSessionConnected();
    }
    if (typeof window.resetAutoConnectAttempts === "function") {
      window.resetAutoConnectAttempts();
    }
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

    if (window._pendingParamRequest || shouldAutoLoadParams()) {
      window._pendingParamRequest = false;
      log("📥 连接成功：开始加载参数表（PARAM_REQUEST_LIST）");
      if (typeof window.loadParams === "function") {
        window.loadParams({ force: true }).catch(() => {});
      }
    }
  } catch (e) {
    const name = e?.name || "Error";
    const msg = e?.message || String(e);
    log(`❌ 连接失败: ${name} - ${msg}`);
    if (/open serial port|InvalidStateError|Access denied|端口|占用|being used|in use/i.test(msg)) {
      log("💡 提示：请关闭 Mission Planner / QGC 等占用同一 COM 口的软件");
    }
    try { await closeSerialResources(); } catch (_) { /* ignore */ }
    disarmConnectWatchdog();
    setConnectionUI("error");
  } finally {
    if (window._gcsConnState !== "connecting") disarmConnectWatchdog();
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
  const w = window.writer || writer;
  if (!w) throw new Error("未连接串口");
  await w.write(new Uint8Array(pkt));
}

async function sendCommandLong(command, p1, p2, p3, p4, p5, p6, p7, confirmation, targetSystem, targetComponent) {
  if (!(window.writer || writer)) throw new Error("未连接串口");

  const ts = targetSystem != null && Number(targetSystem) > 0 ? Number(targetSystem) : (window.sysid || 1);
  const tc = targetComponent != null ? Number(targetComponent) : (window.compid || 1);

  const payload = [
    ...f32bytes(p1 || 0), ...f32bytes(p2 || 0), ...f32bytes(p3 || 0),
    ...f32bytes(p4 || 0), ...f32bytes(p5 || 0), ...f32bytes(p6 || 0),
    ...f32bytes(p7 || 0),
    ...u16bytes(command), ts & 0xff, tc & 0xff, (confirmation || 0) & 0xff,
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
              if (window._lastAutopilotVersionRejectReason) {
                log(`ℹ️ 最近一次 #148 未用于覆盖概览：${window._lastAutopilotVersionRejectReason}`, "debug");
              }
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

function getParamLoadProfile() {
  const info = window.autopilotVersionInfo || {};
  const boardType = Number(info.boardType);
  const hwText = String(document.getElementById("ov-board-hardware")?.textContent || "").toLowerCase();
  const rawName = String(document.getElementById("ov-board-hardware")?.title || "").toLowerCase();
  const sig = `${hwText} ${rawName}`;
  const isCubeBlack =
    boardType === 9 || boardType === 50 ||
    /cube.?black|pixhawk.?1|fmuv3/.test(sig);

  if (isCubeBlack) {
    return {
      name: "cubeblack-safe",
      batchSize: 36,
      batchDelayMs: 10,
      firstRequestDelayMs: 700,
    };
  }
  return {
    name: "default-fast",
    batchSize: 72,
    batchDelayMs: 3,
    firstRequestDelayMs: 300,
  };
}
window.getParamLoadProfile = getParamLoadProfile;

async function requestParamReadByIndex(index) {
  const idx = Number(index);
  if (!Number.isFinite(idx) || idx < 0 || idx > 65534) return false;
  const payload = [...new Array(16).fill(0), idx & 0xff, (idx >> 8) & 0xff, window.sysid || 1, window.compid || 1];
  await send_v2(20, payload, 214);
  return true;
}

async function requestParamListOnce(reason) {
  if (!(window.writer || writer)) return false;
  await send_v2(21, [window.sysid || 1, window.compid || 1], 159);
  if (typeof log === "function" && reason) {
    log(`↻ 重发 PARAM_REQUEST_LIST（${reason}）`, "param-load");
  }
  return true;
}
window.requestParamListOnce = requestParamListOnce;

async function requestParamByName(name) {
  const id = String(name || "").slice(0, 16);
  if (!id || !(window.writer || writer)) return false;
  const bytes = Array.from(new TextEncoder().encode(id));
  while (bytes.length < 16) bytes.push(0);
  bytes.push(0xff, 0xff, window.sysid || 1, window.compid || 1);
  await send_v2(20, bytes, 214);
  return true;
}
window.requestParamByName = requestParamByName;

async function requestMissingParamBatch() {
  const count = Number(window._paramCount);
  const seen = window._paramRxIndices;
  if (!window._paramLoadActive || !count || !seen || !(window.writer || writer)) return;
  const profile = getParamLoadProfile();
  const missing = [];
  for (let i = 0; i < count && missing.length < profile.batchSize; i += 1) {
    if (!seen.has(i)) missing.push(i);
  }
  if (!missing.length) return;
  if (typeof log === "function") {
    log(`↻ 补拉缺失参数 ${missing.length} 项（已收 ${seen.size}/${count}，策略=${profile.name}）`, "param-load");
  }
  for (const idx of missing) {
    try {
      await requestParamReadByIndex(idx);
    } catch (_) { /* ignore */ }
    await new Promise((r) => setTimeout(r, profile.batchDelayMs));
  }
}
window.requestMissingParamBatch = requestMissingParamBatch;

async function loadParams(opts) {
  const force = !!(opts && opts.force);
  if (!(window.writer || writer)) {
    window._pendingParamRequest = true;
    log("⚠️ 当前未连接成功：已缓存参数加载请求（连接成功后自动发送）");
    return;
  }
  const sessionLoaded =
    window._gcsParamsLoadedSessionId != null &&
    window._gcsParamsLoadedSessionId === window._gcsConnSessionId;
  if (
    !force &&
    sessionLoaded &&
    window.params instanceof Map &&
    window.params.size > 50
  ) {
    if (typeof log === "function") {
      log("ℹ️ 本次连接已加载过参数表，跳过重复拉取（点「加载参数」可强制刷新）", "param-load");
    }
    return;
  }
  if (typeof window.beginParamLoadingUI !== "function" || !window.beginParamLoadingUI()) {
    log("⚠️ 参数表正在加载中，请稍候或点击「取消」结束", "param-load");
    return;
  }
  window._pendingParamRequest = false;
  const profile = getParamLoadProfile();
  const requestParamList = () => {
    requestParamListOnce("load-start").catch((err) => {
      if (typeof window.endParamLoadingUI === "function") window.endParamLoadingUI(false, "send-fail");
      log(`⚠️ PARAM_REQUEST_LIST 发送失败：${err?.message || err}`);
    });
  };
  try {
    log(`发送 PARAM_REQUEST_LIST（策略=${profile.name}）`);
    setTimeout(requestParamList, profile.firstRequestDelayMs);
    if (window._paramListRetryTimer) clearTimeout(window._paramListRetryTimer);
    window._paramListRetryTimer = setTimeout(() => {
      window._paramListRetryTimer = null;
      if (!window._paramLoadActive) return;
      const total = Number(window._paramCount);
      const got = window._paramRxIndices ? window._paramRxIndices.size : (window.params?.size || 0);
      const staleRx = !window._lastMavlinkRxMs || Date.now() - window._lastMavlinkRxMs > 2500;
      if (staleRx && got === 0) {
        log("⚠️ 仍未收到 MAVLink 数据：请确认波特率与飞控一致，或换一个 CUAV 串口后重连", "param-load");
        return;
      }
      if (total > 0 && got > 0 && got < total) {
        if (typeof window.requestMissingParamBatch === "function") {
          window.requestMissingParamBatch();
        }
        return;
      }
      if (got === 0) {
        log("↻ 仍未收到参数，重发 PARAM_REQUEST_LIST", "param-load");
        requestParamList();
      }
    }, 4000);
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
      const rx = window.buf;
      for (let i = 0; i < value.length; i++) rx.push(value[i]);
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
window.sendMavlinkV2 = send_v2;
window.sendCommandLong = sendCommandLong;
window.sendHeartbeat = sendHeartbeat;
window.sendAccelcalVehiclePos = sendAccelcalVehiclePos;

console.log("✅ serial.js 已加载（精简版）");
