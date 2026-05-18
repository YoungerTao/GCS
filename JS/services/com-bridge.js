/**
 * 串口/COM 端口枚举 — 从 serial.js 拆分
 *  负责：navigator.serial.getPorts, local COM bridge 服务, 端口列表 UI
 */

window._knownPorts = window._knownPorts || [];
window._comOptionMap = window._comOptionMap || new Map();
window._systemComPorts = window._systemComPorts || [];

/** 从本地 COM 桥接服务获取系统 COM 列表 */
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
      window._comBridgeOnline = true;
      window._comBridgeBackoffUntil = 0;
      window._lastFetchedSystemPorts = ports;
      window._comBridgeOfflineHintLogged = false;
      return ports;
    }
  } catch (_) { /* 桥接未运行 */ }
  window._comBridgeOnline = false;
  window._comBridgeBackoffUntil = Date.now() + 30000;
  window._lastFetchedSystemPorts = window._lastFetchedSystemPorts || [];
  return window._lastFetchedSystemPorts;
}

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

function isLikelyEmbeddedPreviewBrowser() {
  const ua = String(navigator.userAgent || "");
  return /Cursor/i.test(ua) || /Electron/i.test(ua) || /VSCode/i.test(ua);
}

function setConnectSerialHint(text) {
  const btn = document.getElementById("connectBtn");
  if (btn) btn.title = text || "";
}

/** 刷新可用串口列表 */
async function refreshPorts(opts = {}) {
  const probeBridge = opts.probeBridge !== false;
  if (!("serial" in navigator)) {
    const comSelect = document.getElementById("comPort");
    comSelect.innerHTML = "";
    const embedded = isLikelyEmbeddedPreviewBrowser();
    setComPlaceholder(
      comSelect,
      embedded
        ? "-- 内置预览不支持串口，请用 Chrome/Edge 打开 --"
        : "-- 当前浏览器不支持串口(Web Serial) --"
    );
    setConnectSerialHint(
      embedded
        ? "Cursor 内置浏览器通常无法访问 USB 串口。请在本机 Chrome 或 Edge 中打开 http://127.0.0.1:8080"
        : "请使用 Chrome/Edge 桌面版，并通过 http://localhost 打开页面"
    );
    if (typeof log === "function") {
      log(
        embedded
          ? "❌ 内置预览浏览器不支持 Web Serial。请用 Chrome/Edge 打开本地面站（如 http://127.0.0.1:8080）"
          : "❌ 当前浏览器不支持 Web Serial，请使用 Chrome/Edge（桌面版）"
      );
    }
    return;
  }

  if (!window.isSecureContext) {
    const comSelect = document.getElementById("comPort");
    comSelect.innerHTML = "";
    setComPlaceholder(comSelect, "-- 需在 localhost/https 下使用串口 --");
    if (typeof log === "function") log("❌ 当前页面不是安全上下文。请通过 http://127.0.0.1:<端口> 或 https 打开页面");
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

  comSelect.innerHTML = "";

  if (systemPorts.length > 0) {
    const usedAuth = new Set();
    systemPorts.forEach((sp, i) => {
      const option = document.createElement("option");
      let authIndex = -1;
      for (let j = 0; j < ports.length; j++) {
        if (usedAuth.has(j)) continue;
        const info = ports[j].getInfo ? ports[j].getInfo() : {};
        if (
          typeof sp.usbVendorId === "number" && typeof sp.usbProductId === "number" &&
          info.usbVendorId === sp.usbVendorId && info.usbProductId === sp.usbProductId
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
    return;
  }

  if (window._comBridgeOnline === false && !window._comBridgeOfflineHintLogged) {
    window._comBridgeOfflineHintLogged = true;
    if (typeof log === "function") log("⚠️ COM 桥接未运行（约每 30 秒探测一次）。要显示系统 COM 名请执行: python tools/com-bridge/server.py");
  }

  if (ports.length === 0) {
    comSelect.innerHTML = "";
    const addOptEmpty = document.createElement("option");
    addOptEmpty.value = "__add__";
    addOptEmpty.text = "＋ 选择飞控 USB 串口（首次连接）…";
    comSelect.appendChild(addOptEmpty);
    comSelect.value = "__add__";
    setConnectSerialHint("首次连接：点击「连接串口」，在浏览器弹窗中选择飞控 USB 口");
    if (typeof log === "function") {
      log("ℹ️ 尚未授权串口：直接点右侧「连接串口」，在弹窗中选择飞控 USB 口即可");
    }
    return;
  }

  setConnectSerialHint("");

  ports.forEach((port, index) => {
    const option = document.createElement("option");
    option.value = `auth:${index}`;
    option.text = portLabel(port, index);
    comSelect.appendChild(option);
    window._comOptionMap.set(option.value, { authIndex: index, systemPort: null });
  });

  const addOpt = document.createElement("option");
  addOpt.value = "__add__";
  addOpt.text = "＋ 添加/重新选择串口设备…";
  comSelect.appendChild(addOpt);

  if (currentValue && currentValue !== "__add__" && window._comOptionMap.has(currentValue)) {
    comSelect.value = currentValue;
  } else {
    const first = Array.from(comSelect.options).find(
      o => !o.disabled && o.value && (o.value.startsWith("auth:") || o.value.startsWith("sys:"))
    );
    if (first) comSelect.value = first.value;
  }
}

async function requestAndRefreshPort() {
  try {
    await navigator.serial.requestPort();
    await refreshPorts();
    return true;
  } catch (e) {
    if (e && e.name === "NotFoundError") {
      if (typeof log === "function") log("⚠️ 未选择串口设备");
      return false;
    }
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
  window.addEventListener("load", () => refreshPorts({ probeBridge: true }));

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

  if (navigator.serial && navigator.serial.addEventListener) {
    navigator.serial.addEventListener("connect", () => refreshPorts({ probeBridge: true }));
    navigator.serial.addEventListener("disconnect", () => refreshPorts({ probeBridge: true }));
  }

  if (window._portAutoRefreshTimer) clearInterval(window._portAutoRefreshTimer);
  window._portAutoRefreshTimer = setInterval(() => refreshPorts({ probeBridge: false }), 3000);

  if (window._comBridgeSlowProbeTimer) clearInterval(window._comBridgeSlowProbeTimer);
  window._comBridgeSlowProbeTimer = setInterval(() => refreshPorts({ probeBridge: true }), 60000);
}

window.fetchSystemComPorts = fetchSystemComPorts;
window.refreshPorts = refreshPorts;
window.requestAndRefreshPort = requestAndRefreshPort;
window.requestAllPortsInteractive = requestAllPortsInteractive;
window.initComPortAutoRefresh = initComPortAutoRefresh;

// 兼容旧引用
window.initSerialAutoRefresh = initComPortAutoRefresh;

// 自动初始化
initComPortAutoRefresh();

console.log("✅ com-bridge.js 已加载");
