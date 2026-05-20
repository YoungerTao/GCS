window._knownPorts = window._knownPorts || [];
window._comOptionMap = window._comOptionMap || new Map();
window._systemComPorts = window._systemComPorts || [];
window._autoConnectAttempts = 0;
const AUTO_CONNECT_MAX_ATTEMPTS = 6;
const BRIDGE_API = "http://127.0.0.1:8765";
let ensureBridgePromise = null;

async function probeBridgeHealth() {
  try {
    const resp = await fetch(`${BRIDGE_API}/health`, { cache: "no-store" });
    return resp.ok;
  } catch (_) {
    return false;
  }
}

async function requestBridgeStartup() {
  const bases = [
    "http://127.0.0.1:8766",
    (typeof location !== "undefined" && String(location.origin || "").startsWith("http"))
      ? location.origin
      : "",
  ].filter(Boolean);
  const seen = new Set();
  for (const base of bases) {
    if (seen.has(base)) continue;
    seen.add(base);
    try {
      const resp = await fetch(`${base}/__gcs/ensure-bridge`, {
        method: "POST",
        cache: "no-store",
      });
      if (resp.ok) return true;
    } catch (_) {
      // Try next runtime origin.
    }
  }
  return false;
}

async function ensureComBridgeRunning() {
  if (typeof window.ensureGcsStackReady === "function") {
    await window.ensureGcsStackReady();
  }
  if (await probeBridgeHealth()) {
    window._comBridgeOnline = true;
    window._comBridgeBackoffUntil = 0;
    return true;
  }
  if (!ensureBridgePromise) {
    ensureBridgePromise = (async () => {
      await requestBridgeStartup();
      for (let i = 0; i < 32; i += 1) {
        if (await probeBridgeHealth()) {
          window._comBridgeOnline = true;
          window._comBridgeBackoffUntil = 0;
          window._comBridgeOfflineHintLogged = false;
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      window._comBridgeOnline = false;
      if (!window._comBridgeOfflineHintLogged) {
        window._comBridgeOfflineHintLogged = true;
        if (typeof window.log === "function") {
          window.log("本地 COM 桥接未就绪。请从桌面「GCS」图标打开。");
        }
      }
      return false;
    })().finally(() => {
      ensureBridgePromise = null;
    });
  }
  return ensureBridgePromise;
}

async function fetchSystemComPortsImpl() {
  const now = Date.now();
  if (typeof window._comBridgeBackoffUntil === "number" && now < window._comBridgeBackoffUntil) {
    return Array.isArray(window._lastFetchedSystemPorts) ? window._lastFetchedSystemPorts : [];
  }
  await ensureComBridgeRunning();
  try {
    const resp = await fetch(`${BRIDGE_API}/com-ports`, { cache: "no-store" });
    if (!resp.ok) throw new Error(`bridge list failed (${resp.status})`);
    const data = await resp.json();
    const ports = Array.isArray(data.ports) ? data.ports : [];
    window._comBridgeOnline = true;
    window._comBridgeBackoffUntil = 0;
    window._lastFetchedSystemPorts = ports;
    window._comBridgeOfflineHintLogged = false;
    return ports;
  } catch (_) {
    window._comBridgeOnline = false;
    window._comBridgeBackoffUntil = Date.now() + 5000;
    window._lastFetchedSystemPorts = window._lastFetchedSystemPorts || [];
    return window._lastFetchedSystemPorts;
  }
}

async function fetchSystemComPorts() {
  fetchSystemComPorts._queue = fetchSystemComPorts._queue || Promise.resolve();
  const run = fetchSystemComPorts._queue.then(() => fetchSystemComPortsImpl());
  fetchSystemComPorts._queue = run.catch(() => {});
  return run;
}

function getRememberedPortKey() {
  try { return localStorage.getItem("gcs.lastPortKey") || ""; } catch (_) { return ""; }
}

function getRememberedPortLabel() {
  try { return localStorage.getItem("gcs.lastPortLabel") || ""; } catch (_) { return ""; }
}

function extractComDeviceId(text) {
  const m = String(text || "").match(/\b(COM\d+)\b/i);
  return m ? m[1].toUpperCase() : "";
}

function isAutoReconnectEnabled() {
  try {
    return localStorage.getItem("gcs.autoReconnect") !== "0";
  } catch (_) {
    return true;
  }
}

function getRememberedDeviceId() {
  try {
    const id = localStorage.getItem("gcs.lastDeviceId") || "";
    if (id) return id.toUpperCase();
    return extractComDeviceId(getRememberedPortLabel());
  } catch (_) {
    return "";
  }
}

function shouldAutoReconnectOnLoad() {
  if (!isAutoReconnectEnabled()) return false;
  try {
    if (localStorage.getItem("gcs.wasConnected") === "0") return false;
  } catch (_) { /* ignore */ }
  return !!(getRememberedPortKey() || getRememberedPortLabel() || getRememberedDeviceId());
}

function restoreRememberedBaud() {
  try {
    const raw = localStorage.getItem("gcs.lastBaud");
    const n = raw != null ? parseInt(String(raw), 10) : NaN;
    if (!Number.isFinite(n) || n <= 0) return;
    const el = document.getElementById("serialBaud");
    if (el) el.value = String(n);
  } catch (_) { /* ignore */ }
}

function resolveRememberedPortValue(comSelect) {
  if (!comSelect) return "";
  const rememberedKey = getRememberedPortKey();
  if (rememberedKey && window._comOptionMap.has(rememberedKey)) {
    return rememberedKey;
  }
  const deviceId = getRememberedDeviceId();
  if (deviceId) {
    for (const [val, meta] of window._comOptionMap.entries()) {
      if (val === "__add__") continue;
      if (meta?.systemPort?.deviceId && String(meta.systemPort.deviceId).toUpperCase() === deviceId) {
        return val;
      }
    }
    const byDev = Array.from(comSelect.options).find(
      (o) => o.value !== "__add__" && String(o.text || "").toUpperCase().includes(deviceId)
    );
    if (byDev) return byDev.value;
  }
  const rememberedLabel = getRememberedPortLabel();
  if (rememberedLabel) {
    const match = Array.from(comSelect.options).find((o) => String(o.text || "") === rememberedLabel);
    if (match && match.value && match.value !== "__add__") return match.value;
  }
  return "";
}

function rememberSelectedPort(value, label) {
  try {
    if (value) localStorage.setItem("gcs.lastPortKey", value);
    if (label) localStorage.setItem("gcs.lastPortLabel", label);
    const meta = window._comOptionMap?.get(value);
    const deviceId = meta?.systemPort?.deviceId || extractComDeviceId(label);
    if (deviceId) localStorage.setItem("gcs.lastDeviceId", String(deviceId).toUpperCase());
    const baudEl = document.getElementById("serialBaud");
    if (baudEl) localStorage.setItem("gcs.lastBaud", String(baudEl.value || "115200"));
  } catch (_) { /* ignore */ }
}

function markGcsSessionConnected() {
  try {
    localStorage.setItem("gcs.wasConnected", "1");
  } catch (_) { /* ignore */ }
}

function markGcsSessionDisconnected() {
  try {
    localStorage.setItem("gcs.wasConnected", "0");
  } catch (_) { /* ignore */ }
}

function setConnectSerialHint(text) {
  const btn = document.getElementById("connectBtn");
  if (btn) btn.title = text || "";
}

async function tryAutoConnect() {
  if (!shouldAutoReconnectOnLoad()) return;
  if (window._gcsConnState === "connected" || window._gcsConnState === "connecting") return;
  if (window._autoConnectAttempts >= AUTO_CONNECT_MAX_ATTEMPTS) return;

  const comSelect = document.getElementById("comPort");
  if (!comSelect || !comSelect.options.length) return;

  const target = resolveRememberedPortValue(comSelect);
  if (!target) return;

  window._autoConnectAttempts += 1;
  comSelect.value = target;
  restoreRememberedBaud();

  try {
    if (localStorage.getItem("gcs.autoLoadParams") !== "0") {
      window._pendingParamRequest = true;
    }
  } catch (_) {
    window._pendingParamRequest = true;
  }

  const hint = getRememberedDeviceId() || comSelect.options[comSelect.selectedIndex]?.text || target;
  setConnectSerialHint(`正在自动重连 ${hint}…`);

  setTimeout(() => {
    if (window._gcsConnState === "connected" || window._gcsConnState === "connecting") return;
    if (typeof window.connect === "function") {
      try { window.connect(); } catch (_) { /* ignore */ }
    }
  }, 220);
}

function scheduleAutoReconnectAfterRefresh() {
  if (!shouldAutoReconnectOnLoad()) return;
  const delays = [0, 600, 1800, 4000];
  delays.forEach((ms) => {
    setTimeout(() => {
      if (window._gcsConnState === "connected" || window._gcsConnState === "connecting") return;
      refreshPorts({ probeBridge: ms > 0 })
        .then(() => tryAutoConnect())
        .catch(() => {});
    }, ms);
  });
}

async function refreshPorts(opts = {}) {
  const probeBridge = opts.probeBridge !== false;
  const comSelect = document.getElementById("comPort");
  if (!comSelect) return;

  let ports = [];
  if ("serial" in navigator && window.isSecureContext) {
    try { ports = await navigator.serial.getPorts(); } catch (_) { ports = []; }
  }
  const systemPorts = probeBridge
    ? await fetchSystemComPorts()
    : (Array.isArray(window._lastFetchedSystemPorts) ? window._lastFetchedSystemPorts : []);

  const currentValue = comSelect.value;
  window._knownPorts = ports;
  window._systemComPorts = systemPorts;
  window._comOptionMap = new Map();
  comSelect.innerHTML = "";

  if (systemPorts.length > 0) {
    const usedAuth = new Set();
    systemPorts.forEach((sp, i) => {
      let authIndex = -1;
      for (let j = 0; j < ports.length; j += 1) {
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
      const option = document.createElement("option");
      option.value = authIndex >= 0 ? `auth:${authIndex}` : `sys:${sp.deviceId || i}`;
      option.text = authIndex >= 0
        ? `${sp.deviceId} (${sp.name || "Unknown"})`
        : `${sp.deviceId} (${sp.name || "Unknown"}) [未授权]`;
      comSelect.appendChild(option);
      window._comOptionMap.set(option.value, { authIndex, systemPort: sp });
    });

    const rememberedKey = getRememberedPortKey();
    const rememberedLabel = getRememberedPortLabel();
    if (rememberedKey && window._comOptionMap.has(rememberedKey)) {
      comSelect.value = rememberedKey;
    } else if (rememberedLabel) {
      const remembered = Array.from(comSelect.options).find((o) => String(o.text || "") === rememberedLabel);
      if (remembered) comSelect.value = remembered.value;
    } else if (currentValue && window._comOptionMap.has(currentValue)) {
      comSelect.value = currentValue;
    } else if (comSelect.options.length) {
      comSelect.value = comSelect.options[0].value;
    }

    const addOpt = document.createElement("option");
    addOpt.value = "__add__";
    addOpt.text = "＋ 添加/重新选择串口设备…";
    comSelect.appendChild(addOpt);
    setConnectSerialHint("");
    tryAutoConnect().catch(() => {});
    return;
  }

  if (ports.length === 0) {
    const addOnly = document.createElement("option");
    addOnly.value = "__add__";
    addOnly.text = "＋ 选择飞控 USB 串口（首次连接）…";
    comSelect.appendChild(addOnly);
    comSelect.value = "__add__";
    setConnectSerialHint("首次连接：点击“连接串口”，在浏览器弹窗中选择飞控 USB 串口");
    return;
  }

  ports.forEach((port, index) => {
    const option = document.createElement("option");
    const info = port.getInfo ? port.getInfo() : {};
    const vid = typeof info.usbVendorId === "number" ? info.usbVendorId.toString(16).toUpperCase().padStart(4, "0") : "----";
    const pid = typeof info.usbProductId === "number" ? info.usbProductId.toString(16).toUpperCase().padStart(4, "0") : "----";
    option.value = `auth:${index}`;
    option.text = `串口${index + 1} (VID_${vid}:PID_${pid})`;
    comSelect.appendChild(option);
    window._comOptionMap.set(option.value, { authIndex: index, systemPort: null });
  });

  const addOpt = document.createElement("option");
  addOpt.value = "__add__";
  addOpt.text = "＋ 添加/重新选择串口设备…";
  comSelect.appendChild(addOpt);

  const rememberedKey = getRememberedPortKey();
  const rememberedLabel = getRememberedPortLabel();
  if (rememberedKey && window._comOptionMap.has(rememberedKey)) {
    comSelect.value = rememberedKey;
  } else if (rememberedLabel) {
    const remembered = Array.from(comSelect.options).find((o) => String(o.text || "") === rememberedLabel);
    if (remembered) comSelect.value = remembered.value;
  } else if (currentValue && window._comOptionMap.has(currentValue)) {
    comSelect.value = currentValue;
  } else {
    comSelect.value = comSelect.options[0]?.value || "__add__";
  }

  setConnectSerialHint("");
  tryAutoConnect().catch(() => {});
}

async function requestAndRefreshPort() {
  try {
    await navigator.serial.requestPort();
    await refreshPorts();
    return true;
  } catch (e) {
    if (e && e.name === "NotFoundError") return false;
    throw e;
  }
}

async function requestAllPortsInteractive() {
  let added = 0;
  while (true) {
    try {
      await navigator.serial.requestPort();
      added += 1;
      await refreshPorts();
      if (!window.confirm("已添加一个串口。是否继续添加下一个串口？")) break;
    } catch (e) {
      if (e && e.name === "NotFoundError") break;
      throw e;
    }
  }
  return added;
}

function initComPortAutoRefresh() {
  window.addEventListener("load", () => {
    refreshPorts({ probeBridge: true })
      .then(() => scheduleAutoReconnectAfterRefresh())
      .catch(() => scheduleAutoReconnectAfterRefresh());
  });

  if (!window._comBridgeFocusHooked) {
    window._comBridgeFocusHooked = true;
    window.addEventListener("focus", () => {
      const now = Date.now();
      if (window._comBridgeLastFocusProbe && now - window._comBridgeLastFocusProbe < 12000) return;
      window._comBridgeLastFocusProbe = now;
      window._comBridgeBackoffUntil = 0;
      refreshPorts({ probeBridge: true }).catch(() => {});
    });
  }

  if (navigator.serial && navigator.serial.addEventListener) {
    navigator.serial.addEventListener("connect", () => refreshPorts({ probeBridge: true }));
    navigator.serial.addEventListener("disconnect", () => refreshPorts({ probeBridge: true }));
  }

  if (window._portAutoRefreshTimer) clearInterval(window._portAutoRefreshTimer);
  window._portAutoRefreshTimer = setInterval(() => refreshPorts({ probeBridge: false }), 3000);

  if (window._comBridgeSlowProbeTimer) clearInterval(window._comBridgeSlowProbeTimer);
  window._comBridgeSlowProbeTimer = setInterval(() => refreshPorts({ probeBridge: true }), 60000);
}

window.ensureComBridgeRunning = ensureComBridgeRunning;
window.fetchSystemComPorts = fetchSystemComPorts;
window.refreshPorts = refreshPorts;
window.requestAndRefreshPort = requestAndRefreshPort;
window.requestAllPortsInteractive = requestAllPortsInteractive;
window.initComPortAutoRefresh = initComPortAutoRefresh;
window.rememberSelectedPort = rememberSelectedPort;
window.markGcsSessionConnected = markGcsSessionConnected;
window.markGcsSessionDisconnected = markGcsSessionDisconnected;
window.tryAutoConnect = tryAutoConnect;

window.initSerialAutoRefresh = initComPortAutoRefresh;
initComPortAutoRefresh();
