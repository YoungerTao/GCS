window._knownPorts = window._knownPorts || [];
window._comOptionMap = window._comOptionMap || new Map();
window._systemComPorts = window._systemComPorts || [];
window._autoConnectAttempts = 0;

function systemComPorts() {
  return Array.isArray(window._systemComPorts) ? window._systemComPorts : [];
}
const AUTO_CONNECT_MAX_ATTEMPTS = 20;
const AUTO_CONNECT_LATE_RETRY_MS = [8000, 15000, 30000];
const BRIDGE_API = "http://127.0.0.1:8765";
let ensureBridgePromise = null;

function hasWebSerialApi() {
  return !!(typeof navigator !== "undefined" && navigator.serial && window.isSecureContext);
}

window.hasWebSerialApi = hasWebSerialApi;

/** 蓝牙/调试等非飞控口（内置浏览器默认项常误选这些） */
function isNoiseSerialPort(sp) {
  const dev = String(sp?.deviceId || "").toLowerCase();
  const name = String(sp?.name || "").toLowerCase();
  if (!dev && !name) return true;
  if (/bluetooth|incoming-port|debug-console|wlan|iphone|android/i.test(dev)) return true;
  if (/bluetooth|debug console|incoming|phone link/i.test(name)) return true;
  return false;
}

function rankSerialPort(sp) {
  if (!sp || isNoiseSerialPort(sp)) return 1000;
  let score = 400;
  const dev = String(sp.deviceId || "").toLowerCase();
  const name = String(sp.name || "").toLowerCase();
  if (/usbmodem|usbserial|acm\d|cu\.usb|ttyusb|ttyacm/i.test(dev)) score -= 250;
  if (typeof sp.usbVendorId === "number" && typeof sp.usbProductId === "number") score -= 120;
  const vid = sp.usbVendorId;
  if ([0x26ac, 0x1209, 0x2dae, 0x3162, 0x0483].includes(vid)) score -= 100;
  if (/cuav|pixhawk|ardupilot|mavlink|fmuv|cube|holybro|px4/i.test(name)) score -= 80;
  return score;
}

function sortSystemPortsForPicker(ports) {
  return ports.slice().sort((a, b) => {
    const d = rankSerialPort(a) - rankSerialPort(b);
    if (d !== 0) return d;
    return String(a.deviceId || "").localeCompare(String(b.deviceId || ""), "en");
  });
}

function pickPreferredPortValue(comSelect) {
  if (!comSelect) return "";
  for (const opt of comSelect.options) {
    if (!opt.value || opt.value.startsWith("__")) continue;
    const meta = window._comOptionMap?.get(opt.value);
    if (getPortProbeRole(meta?.systemPort) === "mavlink") return opt.value;
  }
  let bestVal = "";
  let bestRank = Infinity;
  for (const opt of comSelect.options) {
    if (!opt.value || opt.value.startsWith("__")) continue;
    const meta = window._comOptionMap?.get(opt.value);
    if (getPortProbeRole(meta?.systemPort) === "slcan") continue;
    const rank = meta?.systemPort ? rankSerialPort(meta.systemPort) : 900;
    if (rank < bestRank) {
      bestRank = rank;
      bestVal = opt.value;
    }
  }
  return bestRank < 900 ? bestVal : "";
}

window.isNoiseSerialPort = isNoiseSerialPort;
window.rankSerialPort = rankSerialPort;

const BRIDGE_OFFLINE_BACKOFF_MS = 45000;
const BRIDGE_HEALTH_PROBE_MS = 15000;

function isBridgeBackoffActive() {
  return typeof window._comBridgeBackoffUntil === "number" && Date.now() < window._comBridgeBackoffUntil;
}
window.systemComPorts = systemComPorts;
async function probeBridgeHealth() {
  if (window.__gcsStackBootstrapping) return false;
  if (typeof window._comBridgeProbeBackoffUntil === "number" && Date.now() < window._comBridgeProbeBackoffUntil) {
    return false;
  }
  try {
    const resp = await fetch(`${BRIDGE_API}/health`, { cache: "no-store" });
    window._comBridgeProbeBackoffUntil = 0;
    if (resp.ok) {
      window._comBridgeOnline = true;
      window._comBridgeBackoffUntil = 0;
      resetAutoConnectAttempts();
    }
    return resp.ok;
  } catch (_) {
    window._comBridgeProbeBackoffUntil = Date.now() + BRIDGE_HEALTH_PROBE_MS;
    return false;
  }
}

async function requestBridgeStartup() {
  const attempts = [
    { url: "http://127.0.0.1:8766/__gcs/ensure-bridge", method: "POST" },
    { url: "http://127.0.0.1:8767/launch", method: "POST" },
  ];
  for (const { url, method } of attempts) {
    try {
      const resp = await fetch(url, { method, cache: "no-store" });
      if (resp.ok) return true;
    } catch (_) {
      // try next launcher/runtime
    }
  }
  return false;
}

function markBridgeOffline(message) {
  window._comBridgeOnline = false;
  window._comBridgeBackoffUntil = Date.now() + BRIDGE_OFFLINE_BACKOFF_MS;
  if (!window._comBridgeOfflineHintLogged) {
    window._comBridgeOfflineHintLogged = true;
    if (typeof window.log === "function" && message) {
      window.log(message);
    }
  }
}

async function ensureComBridgeRunning() {
  const liveDev = !!window.__gcsLiveServerDev;
  if (isBridgeBackoffActive()) {
    if (await probeBridgeHealth()) {
      window._comBridgeOnline = true;
      window._comBridgeBackoffUntil = 0;
      window._autoConnectAttempts = 0;
      return true;
    }
    return !!window._comBridgeOnline;
  }
  if (typeof window.ensureGcsStackReady === "function") {
    if (liveDev) {
      window.ensureGcsStackReady().catch(() => {});
    } else {
      await window.ensureGcsStackReady();
    }
  }
  if (await probeBridgeHealth()) {
    window._comBridgeOnline = true;
    window._comBridgeBackoffUntil = 0;
    return true;
  }
  if (liveDev) {
    // Live Server 场景只做探测，不主动拉起后台桥接进程，避免弹出系统窗口。
    markBridgeOffline(
      hasWebSerialApi()
        ? "COM 桥未运行，已保留浏览器 Web Serial 路径。"
        : "COM 桥未运行，请先用桌面 GCS 启动，或改用 Web Serial。"
    );
    return false;
  }
  if (isBridgeBackoffActive()) return false;
  const waitAttempts = liveDev ? 8 : 20;
  if (!ensureBridgePromise) {
    ensureBridgePromise = (async () => {
      await requestBridgeStartup();
      for (let i = 0; i < waitAttempts; i += 1) {
        if (await probeBridgeHealth()) {
          window._comBridgeOnline = true;
          window._comBridgeBackoffUntil = 0;
          window._comBridgeOfflineHintLogged = false;
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, liveDev ? 400 : 300));
      }
      const hint = liveDev && hasWebSerialApi()
        ? "COM 桥 (8765) 未启动：可直接用 Web Serial 连飞控；DroneCAN/协议探测需运行 GCS.cmd"
        : "本地 COM 桥接未就绪。请从桌面「GCS」图标打开。";
      markBridgeOffline(hint);
      return false;
    })().finally(() => {
      ensureBridgePromise = null;
    });
  }
  return ensureBridgePromise;
}

function getPortProbeRole(sp) {
  if (!sp) return "";
  const role = String(sp.probeRole || sp.role || "").toLowerCase();
  if (role === "mavlink" || role === "slcan") return role;
  return "";
}

function findPortByProbeRole(role) {
  const want = String(role || "").toLowerCase();
  if (!want) return null;
  return systemComPorts().find((p) => getPortProbeRole(p) === want) || null;
}

window.getPortProbeRole = getPortProbeRole;

async function fetchSystemComPortsImpl(opts = {}) {
  const forceProbe = opts.forceProbe === true || opts.forceBridgeProbe === true;
  const cached = Array.isArray(window._lastFetchedSystemPorts) ? window._lastFetchedSystemPorts : [];
  const lastAt = window._lastFetchedSystemPortsAt || 0;
  if (!forceProbe && cached.length && Date.now() - lastAt < 12000) {
    return cached;
  }
  if (!forceProbe && isBridgeBackoffActive()) {
    return cached;
  }
  if (hasWebSerialApi() && isBridgeBackoffActive() && !opts.forceBridge) {
    return cached;
  }
  if (!window.__gcsLiveServerDev) {
    await ensureComBridgeRunning();
  } else {
    await probeBridgeHealth();
  }
  if (isBridgeBackoffActive() && !window._comBridgeOnline) {
    return cached;
  }
  try {
    const baudEl = document.getElementById("serialBaud");
    const baud = baudEl ? parseInt(String(baudEl.value || "115200"), 10) : 115200;
    const baudQ = Number.isFinite(baud) && baud > 0 ? baud : 115200;
    const probeQ = forceProbe ? "1" : "0";
    const resp = await fetch(`${BRIDGE_API}/com-ports?probe=${probeQ}&baud=${baudQ}`, { cache: "no-store" });
    if (!resp.ok) throw new Error(`bridge list failed (${resp.status})`);
    const data = await resp.json();
    const ports = Array.isArray(data.ports) ? data.ports : [];
    window._comBridgeOnline = true;
    window._comBridgeBackoffUntil = 0;
    window._lastFetchedSystemPorts = ports;
    window._lastFetchedSystemPortsAt = Date.now();
    window._comBridgeOfflineHintLogged = false;
    resetAutoConnectAttempts();
    return ports;
  } catch (_) {
    markBridgeOffline(null);
    window._lastFetchedSystemPorts = window._lastFetchedSystemPorts || [];
    return window._lastFetchedSystemPorts;
  }
}

async function fetchSystemComPorts(opts = {}) {
  fetchSystemComPorts._queue = fetchSystemComPorts._queue || Promise.resolve();
  const run = fetchSystemComPorts._queue.then(() => fetchSystemComPortsImpl(opts));
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

  const mavProbed = findPortByProbeRole("mavlink");
  if (mavProbed?.deviceId) {
    for (const [val, meta] of window._comOptionMap.entries()) {
      if (val.startsWith("__")) continue;
      if (meta?.systemPort?.deviceId === mavProbed.deviceId) return val;
    }
  }

  const deviceId = getRememberedDeviceId();
  if (deviceId) {
    for (const [val, meta] of window._comOptionMap.entries()) {
      if (val.startsWith("__")) continue;
      if (meta?.systemPort?.deviceId && String(meta.systemPort.deviceId).toUpperCase() === deviceId) {
        if (!isNoiseSerialPort(meta.systemPort)) return val;
      }
    }
    const byDev = Array.from(comSelect.options).find(
      (o) =>
        !o.value.startsWith("__") &&
        String(o.text || "").toUpperCase().includes(deviceId) &&
        !isNoiseSerialPort(window._comOptionMap?.get(o.value)?.systemPort)
    );
    if (byDev) return byDev.value;
  }

  const rememberedKey = getRememberedPortKey();
  if (rememberedKey && window._comOptionMap.has(rememberedKey)) {
    const meta = window._comOptionMap.get(rememberedKey);
    if (!meta?.systemPort || !isNoiseSerialPort(meta.systemPort)) {
      return rememberedKey;
    }
  }

  const rememberedLabel = getRememberedPortLabel();
  if (rememberedLabel) {
    const match = Array.from(comSelect.options).find((o) => String(o.text || "") === rememberedLabel);
    if (match && match.value && !match.value.startsWith("__")) {
      const meta = window._comOptionMap.get(match.value);
      if (!meta?.systemPort || !isNoiseSerialPort(meta.systemPort)) return match.value;
    }
  }
  return "";
}

function findCuavSiblingPort(mavlinkDeviceId) {
  const ports = systemComPorts();
  const current = ports.find((p) => p?.deviceId === mavlinkDeviceId);
  if (!current || typeof current.usbVendorId !== "number" || typeof current.usbProductId !== "number") {
    return "";
  }
  const siblings = ports.filter(
    (p) =>
      p?.deviceId &&
      p.deviceId !== mavlinkDeviceId &&
      !isNoiseSerialPort(p) &&
      p.usbVendorId === current.usbVendorId &&
      p.usbProductId === current.usbProductId
  );
  if (siblings.length === 1) return siblings[0].deviceId;
  return "";
}

function assignSlcanSiblingFromMavlink(mavlinkDeviceId) {
  if (!mavlinkDeviceId) return;
  try {
    const manual = localStorage.getItem("gcs.slcanDeviceIdManual");
    if (manual === "1") return;
    const sibling = findCuavSiblingPort(mavlinkDeviceId);
    if (sibling) localStorage.setItem("gcs.slcanDeviceId", sibling);
  } catch (_) { /* ignore */ }
}

function getSlcanDeviceId() {
  const probed = findPortByProbeRole("slcan");
  if (probed?.deviceId) return probed.deviceId;
  try {
    const manual = localStorage.getItem("gcs.slcanDeviceIdManual") === "1";
    const saved = localStorage.getItem("gcs.slcanDeviceId") || "";
    if (manual && saved && systemComPorts().some((p) => p?.deviceId === saved)) return saved;
  } catch (_) { /* ignore */ }
  const mavDev = getMavlinkDeviceId();
  if (mavDev) {
    const sibling = findCuavSiblingPort(mavDev);
    if (sibling) return sibling;
  }
  const hit = systemComPorts().find((p) => p && (p.isSlcanAdapter || /slcan/i.test(String(p.name || ""))));
  return hit?.deviceId || "";
}

function getMavlinkDeviceId() {
  const probed = findPortByProbeRole("mavlink");
  if (probed?.deviceId) return probed.deviceId;
  try {
    const id = localStorage.getItem("gcs.mavlinkDeviceId") || getRememberedDeviceId() || "";
    if (id && systemComPorts().some((p) => p?.deviceId && String(p.deviceId).toUpperCase() === id.toUpperCase())) {
      return id;
    }
  } catch (_) { /* ignore */ }
  return getRememberedDeviceId();
}

function portRoleSuffix(sp) {
  const role = getPortProbeRole(sp);
  if (role === "slcan") return " [SLCAN]";
  if (role === "mavlink") return " [MAVLink]";
  if (!sp?.deviceId) return "";
  return "";
}

window.getSlcanDeviceId = getSlcanDeviceId;
window.getMavlinkDeviceId = getMavlinkDeviceId;
window.findCuavSiblingPort = findCuavSiblingPort;

function rememberSelectedPort(value, label) {
  try {
    if (value) localStorage.setItem("gcs.lastPortKey", value);
    if (label) localStorage.setItem("gcs.lastPortLabel", label);
    const meta = window._comOptionMap?.get(value);
    const deviceId = meta?.systemPort?.deviceId || extractComDeviceId(label);
    if (deviceId) {
      const dev = String(deviceId);
      const role = getPortProbeRole(meta?.systemPort);
      if (role === "slcan") {
        localStorage.setItem("gcs.slcanDeviceId", dev);
        localStorage.setItem("gcs.slcanDeviceIdManual", "1");
      } else {
        localStorage.setItem("gcs.lastDeviceId", dev.toUpperCase());
        localStorage.setItem("gcs.mavlinkDeviceId", dev);
        assignSlcanSiblingFromMavlink(dev);
      }
    }
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

/** 自动重连：auth 口或 COM 桥 sys 口（8766 由 connect 内拉起桥，不弹 requestPort） */
function canSilentAutoConnect(target) {
  if (!target || target.startsWith("__")) return false;
  const meta = window._comOptionMap?.get(target);
  if (target.startsWith("auth:")) {
    const idx = Number(meta?.authIndex);
    const ports = window._knownPorts || [];
    return Number.isFinite(idx) && idx >= 0 && idx < ports.length;
  }
  if (meta?.systemPort?.deviceId) {
    if (isNoiseSerialPort(meta.systemPort)) return false;
    if (window._comBridgeOnline) return true;
    if (window.__gcsRuntimeNative) return true;
    return !isBridgeBackoffActive();
  }
  return false;
}

function pickPreferredPortValueForAutoConnect(comSelect) {
  if (!comSelect) return "";
  const candidates = [];
  for (const opt of comSelect.options) {
    if (!opt.value || opt.value.startsWith("__")) continue;
    const meta = window._comOptionMap?.get(opt.value);
    if (meta?.systemPort && isNoiseSerialPort(meta.systemPort)) continue;
    if (!canSilentAutoConnect(opt.value)) continue;
    candidates.push(opt.value);
  }
  for (const val of candidates) {
    const role = getPortProbeRole(window._comOptionMap?.get(val)?.systemPort);
    if (role === "mavlink") return val;
  }
  const auth0 = candidates.find((v) => v === "auth:0");
  if (auth0) return auth0;
  for (const val of candidates) {
    const role = getPortProbeRole(window._comOptionMap?.get(val)?.systemPort);
    if (role !== "slcan") return val;
  }
  return candidates[0] || "";
}

function preferMavlinkConnectTarget(comSelect, target) {
  if (!target || !comSelect) return target;
  const meta = window._comOptionMap?.get(target);
  const role = getPortProbeRole(meta?.systemPort);
  if (role === "mavlink") return target;
  if (target.startsWith("auth:") && !meta?.systemPort) return target;

  const mavProbed = findPortByProbeRole("mavlink");
  if (mavProbed?.deviceId) {
    for (const [val, m] of window._comOptionMap.entries()) {
      if (val.startsWith("__")) continue;
      if (m?.systemPort?.deviceId === mavProbed.deviceId && canSilentAutoConnect(val)) {
        return val;
      }
    }
  }

  const preferred = pickPreferredPortValueForAutoConnect(comSelect);
  if (preferred && getPortProbeRole(window._comOptionMap?.get(preferred)?.systemPort) !== "slcan") {
    return preferred;
  }
  if (role === "slcan" && window._comOptionMap.has("auth:0") && canSilentAutoConnect("auth:0")) {
    return "auth:0";
  }
  return target;
}

function resetAutoConnectAttempts() {
  window._autoConnectAttempts = 0;
}

function noteAutoConnectFailure() {
  window._autoConnectAttempts = (window._autoConnectAttempts || 0) + 1;
}

let _tryAutoConnectInFlight = false;

async function tryAutoConnect() {
  if (!shouldAutoReconnectOnLoad()) return;
  if (window._gcsConnState === "connected" || window._gcsConnState === "connecting") return;
  if (_tryAutoConnectInFlight) return;
  _tryAutoConnectInFlight = true;

  if (window.__gcsRuntimeNative && typeof ensureComBridgeRunning === "function") {
    try {
      await ensureComBridgeRunning();
    } catch (_) { /* ignore */ }
  }

  const comSelect = document.getElementById("comPort");
  if (!comSelect || !comSelect.options.length) return;

  let target = resolveRememberedPortValue(comSelect);
  if (!target || !canSilentAutoConnect(target)) {
    target = pickPreferredPortValueForAutoConnect(comSelect);
  }
  if (!target) target = pickPreferredPortValue(comSelect);
  target = preferMavlinkConnectTarget(comSelect, target);
  if (!target || !canSilentAutoConnect(target)) {
    _tryAutoConnectInFlight = false;
    return;
  }

  const targetMeta = window._comOptionMap.get(target);
  if (targetMeta?.systemPort && isNoiseSerialPort(targetMeta.systemPort)) {
    const alt = pickPreferredPortValueForAutoConnect(comSelect) || pickPreferredPortValue(comSelect);
    if (!alt || !canSilentAutoConnect(alt)) {
      _tryAutoConnectInFlight = false;
      return;
    }
    target = alt;
    if (typeof window.log === "function") {
      window.log("内置浏览器：已跳过蓝牙/调试口，改用飞控 USB 串口", "info");
    }
  }

  const bridgeReady = !!window._comBridgeOnline;
  const attempts = window._autoConnectAttempts || 0;
  if (attempts >= AUTO_CONNECT_MAX_ATTEMPTS && bridgeReady) {
    _tryAutoConnectInFlight = false;
    return;
  }
  if (attempts >= AUTO_CONNECT_MAX_ATTEMPTS + 10) {
    _tryAutoConnectInFlight = false;
    return;
  }

  comSelect.value = target;
  restoreRememberedBaud();

  if (window._paramLoadActive || window._gcsConnState === "connected") return;

  try {
    if (localStorage.getItem("gcs.autoLoadParams") !== "0") {
      window._pendingParamRequest = true;
    }
  } catch (_) {
    window._pendingParamRequest = true;
  }

  const hint = getRememberedDeviceId() || comSelect.options[comSelect.selectedIndex]?.text || target;
  setConnectSerialHint(`正在自动重连 ${hint}…`);

  window._gcsAutoConnectActive = true;
  const runConnect = () => {
    if (window._gcsConnState === "connected" || window._gcsConnState === "connecting") {
      window._gcsAutoConnectActive = false;
      _tryAutoConnectInFlight = false;
      return;
    }
    if (typeof window.connect !== "function") {
      window._gcsAutoConnectActive = false;
      _tryAutoConnectInFlight = false;
      return;
    }
    Promise.resolve()
      .then(() => window.connect())
      .catch(() => {})
      .finally(() => {
        window._gcsAutoConnectActive = false;
        _tryAutoConnectInFlight = false;
        if (window._gcsConnState !== "connected") noteAutoConnectFailure();
      });
  };
  setTimeout(runConnect, window.__gcsRuntimeNative ? 120 : 220);
}

function scheduleAutoReconnectAfterRefresh() {
  if (!shouldAutoReconnectOnLoad()) return;
  const delays = [0, 600, 1800, 4000, ...AUTO_CONNECT_LATE_RETRY_MS];
  delays.forEach((ms) => {
    setTimeout(() => {
      if (window._gcsConnState === "connected" || window._gcsConnState === "connecting") return;
      refreshPorts({ probeBridge: ms > 0, forceBridgeProbe: ms >= 4000 })
        .then(() => tryAutoConnect())
        .catch(() => {});
    }, ms);
  });
}

async function refreshPorts(opts = {}) {
  let probeBridge = opts.probeBridge !== false;
  if (probeBridge && !opts.forceBridgeProbe && isBridgeBackoffActive()) {
    probeBridge = false;
  }
  const comSelect = document.getElementById("comPort");
  if (!comSelect) return;

  const canWebSerial = hasWebSerialApi();
  let ports = [];
  if (canWebSerial) {
    try { ports = await navigator.serial.getPorts(); } catch (_) { ports = []; }
  }
  const systemPorts = probeBridge
    ? await fetchSystemComPorts({
        forceProbe: !!opts.forceBridgeProbe,
        forceBridge: !!opts.forceBridgeProbe,
      })
    : (Array.isArray(window._lastFetchedSystemPorts) ? window._lastFetchedSystemPorts : []);

  const currentValue = comSelect.value;
  window._knownPorts = ports;
  window._systemComPorts = systemPorts;
  window._comOptionMap = new Map();
  comSelect.innerHTML = "";

  if (systemPorts.length > 0) {
    const sortedPorts = sortSystemPortsForPicker(systemPorts);
    const vidPidCounts = new Map();
    sortedPorts.forEach((sp) => {
      if (typeof sp.usbVendorId === "number" && typeof sp.usbProductId === "number") {
        const key = `${sp.usbVendorId}:${sp.usbProductId}`;
        vidPidCounts.set(key, (vidPidCounts.get(key) || 0) + 1);
      }
    });
    const usedAuth = new Set();
    sortedPorts.forEach((sp, i) => {
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
      const label = sp.deviceId || sp.name || "Unknown";
      const dupHint =
        typeof sp.usbVendorId === "number" &&
        typeof sp.usbProductId === "number" &&
        (vidPidCounts.get(`${sp.usbVendorId}:${sp.usbProductId}`) || 0) > 1
          ? " · 多接口"
          : "";
      const noise = isNoiseSerialPort(sp);
      const roleTag = noise ? "" : portRoleSuffix(sp);
      option.text = authIndex >= 0
        ? `${label} (${sp.name || "Unknown"})${dupHint}${roleTag}${noise ? " [非飞控]" : ""}`
        : `${label} (${sp.name || "Unknown"}) [桥接]${dupHint}${roleTag}${noise ? " [非飞控]" : ""}`;
      if (noise) option.disabled = true;
      comSelect.appendChild(option);
      window._comOptionMap.set(option.value, { authIndex, systemPort: sp });
    });

    const resolved = resolveRememberedPortValue(comSelect);
    if (resolved) {
      comSelect.value = resolved;
    } else if (currentValue && window._comOptionMap.has(currentValue)) {
      const curMeta = window._comOptionMap.get(currentValue);
      if (!curMeta?.systemPort || !isNoiseSerialPort(curMeta.systemPort)) {
        comSelect.value = currentValue;
      }
    }
    if (!comSelect.value || comSelect.value.startsWith("__")) {
      const preferred = pickPreferredPortValue(comSelect);
      if (preferred) comSelect.value = preferred;
    }

    appendPortPickerExtras(comSelect, canWebSerial);
    setConnectSerialHint(
      canWebSerial
        ? "已自动探测各口协议；顶部连 [MAVLink]，DroneCAN 用 [SLCAN]"
        : "已自动探测协议；顶部 [MAVLink][桥接] 连飞控，DroneCAN 用 [SLCAN]"
    );
    const probed = window._systemComPorts.filter((p) => getPortProbeRole(p));
    if (probed.length && typeof window.log === "function") {
      const summary = probed
        .map((p) => {
          const short = String(p.deviceId || "").split("/").pop();
          const role = getPortProbeRole(p).toUpperCase();
          const conf = String(p.probeConfidence || "").trim();
          const detail = String(p.probeDetail || "").trim();
          const tag = conf && conf !== "n/a" ? `·${conf}` : "";
          const extra = detail ? ` (${detail})` : "";
          return `${short}→${role}${tag}${extra}`;
        })
        .join("，");
      window.log(`🔍 串口协议探测：${summary}`, "port-probe");
    }
    if (window._gcsConnState !== "connected" && window._gcsConnState !== "connecting") {
      tryAutoConnect().catch(() => {});
    }
    return;
  }

  if (ports.length === 0) {
    if (!canWebSerial) {
      const waitOpt = document.createElement("option");
      waitOpt.value = "";
      waitOpt.text = systemPorts.length ? "请选择 COM 口" : "等待 COM 桥（请先 Open with Live Server）";
      waitOpt.disabled = true;
      comSelect.appendChild(waitOpt);
      appendPortPickerExtras(comSelect, false);
      comSelect.value = "__refresh_bridge__";
      setConnectSerialHint("内置浏览器无 Web Serial 弹窗；先 Open with Live Server，再选 COM 连接");
      return;
    }
    const addOnly = document.createElement("option");
    addOnly.value = "__add__";
    addOnly.text = "＋ 选择飞控 USB 串口（首次连接）…";
    comSelect.appendChild(addOnly);
    comSelect.value = "__add__";
    setConnectSerialHint("首次连接：点击“连接串口”，在浏览器弹窗中选择飞控 USB 串口");
    return;
  }

  const authVidPidCounts = new Map();
  ports.forEach((port) => {
    const info = port.getInfo ? port.getInfo() : {};
    if (typeof info.usbVendorId === "number" && typeof info.usbProductId === "number") {
      const key = `${info.usbVendorId}:${info.usbProductId}`;
      authVidPidCounts.set(key, (authVidPidCounts.get(key) || 0) + 1);
    }
  });

  ports.forEach((port, index) => {
    const option = document.createElement("option");
    const info = port.getInfo ? port.getInfo() : {};
    const vid = typeof info.usbVendorId === "number" ? info.usbVendorId.toString(16).toUpperCase().padStart(4, "0") : "----";
    const pid = typeof info.usbProductId === "number" ? info.usbProductId.toString(16).toUpperCase().padStart(4, "0") : "----";
    const dupKey = typeof info.usbVendorId === "number" && typeof info.usbProductId === "number"
      ? `${info.usbVendorId}:${info.usbProductId}`
      : "";
    const dupHint = (authVidPidCounts.get(dupKey) || 0) > 1 ? ` · 同USB第${index + 1}路` : "";
    option.value = `auth:${index}`;
    option.text = `串口${index + 1} (VID_${vid}:PID_${pid})${dupHint}`;
    comSelect.appendChild(option);
    window._comOptionMap.set(option.value, {
      authIndex: index,
      systemPort: null,
      usbVendorId: info.usbVendorId,
      usbProductId: info.usbProductId,
    });
  });

  appendPortPickerExtras(comSelect, canWebSerial);

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

  const cuavDual = ports.length >= 2 && authVidPidCounts.size === 1 && (authVidPidCounts.values().next().value || 0) >= 2;
  setConnectSerialHint(
    cuavDual
      ? "CUAV 一根USB两路：顶部连一路 MAVLink；DroneCAN→SLCAN 请在下拉选「浏览器串口2」或先「＋添加串口」授权第二路"
      : ""
  );
  tryAutoConnect().catch(() => {});
}

function appendPortPickerExtras(comSelect, canWebSerial) {
  const refreshOpt = document.createElement("option");
  refreshOpt.value = "__refresh_bridge__";
  refreshOpt.text = "↻ 刷新 COM 列表";
  comSelect.appendChild(refreshOpt);
  if (canWebSerial) {
    const addOpt = document.createElement("option");
    addOpt.value = "__add__";
    addOpt.text = "＋ 添加/重新选择串口设备…";
    comSelect.appendChild(addOpt);
  }
}

async function requestAndRefreshPort() {
  if (!hasWebSerialApi()) {
    await refreshPorts({ probeBridge: true, forceBridgeProbe: true });
    return (window._systemComPorts || []).length > 0;
  }
  try {
    await navigator.serial.requestPort();
    await refreshPorts({ probeBridge: false });
    return true;
  } catch (e) {
    if (e && e.name === "NotFoundError") return false;
    throw e;
  }
}

async function requestAllPortsInteractive() {
  if (!hasWebSerialApi()) {
    await refreshPorts({ probeBridge: true });
    return (window._systemComPorts || []).length;
  }
  let added = 0;
  while (true) {
    try {
      await navigator.serial.requestPort();
      added += 1;
      await refreshPorts({ probeBridge: false });
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
    const startRefresh = async () => {
      if (window.__gcsRuntimeNative && typeof ensureComBridgeRunning === "function") {
        try {
          await ensureComBridgeRunning();
        } catch (_) { /* ignore */ }
      }
      try {
        await refreshPorts({ probeBridge: true, forceBridgeProbe: !!window.__gcsRuntimeNative });
      } catch (_) { /* ignore */ }
      scheduleAutoReconnectAfterRefresh();
      try {
        await tryAutoConnect();
      } catch (_) { /* ignore */ }
    };
    if (window.__gcsBootstrapPromise) {
      window.__gcsBootstrapPromise.then(startRefresh).catch(startRefresh);
    } else {
      startRefresh();
    }
    if (window.__gcsRuntimeNative) {
      window._bridgeMode = "auto";
    }
    if (!hasWebSerialApi()) {
      window._bridgeMode = "bridge";
      [800, 2000, 4000].forEach((ms) => {
        setTimeout(() => refreshPorts({ probeBridge: true }).catch(() => {}), ms);
      });
      if (typeof window.log === "function") {
        window.log("内置浏览器：无 Web Serial，已启用 COM 桥接；请选飞控 USB 口（勿选蓝牙）", "info");
      }
    }
  });

  if (!window._comBridgeFocusHooked) {
    window._comBridgeFocusHooked = true;
    window.addEventListener("focus", () => {
      const now = Date.now();
      if (window._comBridgeLastFocusProbe && now - window._comBridgeLastFocusProbe < 12000) return;
      window._comBridgeLastFocusProbe = now;
      if (!isBridgeBackoffActive()) {
        refreshPorts({ probeBridge: true }).catch(() => {});
      }
    });
  }

  if (navigator.serial && navigator.serial.addEventListener) {
    navigator.serial.addEventListener("connect", () => refreshPorts({ probeBridge: true }));
    navigator.serial.addEventListener("disconnect", () => refreshPorts({ probeBridge: true }));
  }

  if (window._portAutoRefreshTimer) clearInterval(window._portAutoRefreshTimer);
  window._portAutoRefreshTimer = setInterval(() => {
    const probe = !window._comBridgeOnline && !isBridgeBackoffActive();
    refreshPorts({ probeBridge: probe }).catch(() => {});
  }, 8000);

  if (window._comBridgeSlowProbeTimer) clearInterval(window._comBridgeSlowProbeTimer);
  window._comBridgeSlowProbeTimer = setInterval(() => {
    if (isBridgeBackoffActive()) return;
    refreshPorts({ probeBridge: true, forceBridgeProbe: true }).catch(() => {});
  }, 90000);
}

window.ensureComBridgeRunning = ensureComBridgeRunning;
window.isBridgeBackoffActive = isBridgeBackoffActive;
window.fetchSystemComPorts = fetchSystemComPorts;
window.refreshPorts = refreshPorts;
window.requestAndRefreshPort = requestAndRefreshPort;
window.requestAllPortsInteractive = requestAllPortsInteractive;
window.initComPortAutoRefresh = initComPortAutoRefresh;
window.rememberSelectedPort = rememberSelectedPort;
window.markGcsSessionConnected = markGcsSessionConnected;
window.markGcsSessionDisconnected = markGcsSessionDisconnected;
window.tryAutoConnect = tryAutoConnect;
window.resetAutoConnectAttempts = resetAutoConnectAttempts;
window.canSilentAutoConnect = canSilentAutoConnect;

window.initSerialAutoRefresh = initComPortAutoRefresh;
initComPortAutoRefresh();
