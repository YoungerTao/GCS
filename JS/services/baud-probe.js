/**
 * COM 波特率自动探测：连接前扫描多档速率，选用可解析 MAVLink 的最高档。
 */
(function () {
  const BRIDGE_API = "http://127.0.0.1:8765";
  const DEFAULT_CANDIDATES = [921600, 460800, 230400, 115200, 57600];
  const HIGH_EXTRA = [3000000, 2000000, 1500000];

  function getSelectedBaudRate() {
    const el = document.getElementById("serialBaud");
    const n = el ? parseInt(String(el.value).trim(), 10) : 115200;
    return Number.isFinite(n) && n > 0 ? n : 115200;
  }

  function isAutoBaudProbeEnabled() {
    try {
      return localStorage.getItem("gcs.autoBaudProbe") !== "0";
    } catch (_) {
      return true;
    }
  }

  function getBaudProbeCandidates() {
    const selected = getSelectedBaudRate();
    const merged = [...DEFAULT_CANDIDATES];
    if (selected > 921600) merged.unshift(selected);
    for (const b of HIGH_EXTRA) {
      if (b === selected && !merged.includes(b)) merged.unshift(b);
    }
    const seen = new Set();
    const out = [];
    for (const b of merged) {
      const n = Number(b);
      if (!Number.isFinite(n) || n <= 0 || seen.has(n)) continue;
      seen.add(n);
      out.push(n);
    }
    if (!seen.has(selected)) out.push(selected);
    out.sort((a, b) => b - a);
    return out;
  }

  function applyDetectedBaud(baud) {
    const n = Number(baud);
    if (!Number.isFinite(n) || n <= 0) return;
    const el = document.getElementById("serialBaud");
    if (el) {
      const opt = Array.from(el.options).find((o) => String(o.value) === String(n));
      if (opt) {
        el.value = String(n);
      } else {
        const created = document.createElement("option");
        created.value = String(n);
        created.textContent = String(n);
        el.appendChild(created);
        el.value = String(n);
      }
    }
    try {
      localStorage.setItem("gcs.lastBaud", String(n));
    } catch (_) {
      /* ignore */
    }
  }

  async function bridgeFetchProbe(path, body) {
    if (typeof window.ensureComBridgeRunning === "function") {
      const ok = await window.ensureComBridgeRunning();
      if (!ok) throw new Error("com-bridge unavailable");
    }
    const fetchOpts = body
      ? {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(body),
        }
      : { method: "GET" };
    const resp = await fetch(`${BRIDGE_API}${path}`, fetchOpts);
    const text = await resp.text();
    let data = {};
    try {
      data = JSON.parse(text);
    } catch (_) {
      /* ignore */
    }
    if (!resp.ok) {
      throw new Error(data?.error || `bridge ${path} failed (${resp.status})`);
    }
    return data;
  }

  async function probeBaudViaBridge(portName, candidates) {
    const port = String(portName || "").trim();
    if (!port) return null;
    try {
      const data = await bridgeFetchProbe("/bridge-probe-baud", {
        port,
        bauds: candidates || getBaudProbeCandidates(),
      });
      if (data.ok && Number.isFinite(Number(data.baud)) && Number(data.baud) > 0) {
        return Number(data.baud);
      }
      if (data.reason === "slcan") return null;
    } catch (_) {
      /* fall through */
    }
    return null;
  }

  function scoreWebSerialBuffer() {
    if (window._lastMavlinkRxMs) return 1000;
    return 0;
  }

  async function readWebSerialSample(port, timeoutMs) {
    if (!port.readable) return new Uint8Array(0);
    const reader = port.readable.getReader();
    const chunks = [];
    const deadline = Date.now() + (typeof timeoutMs === "number" ? timeoutMs : 500);
    try {
      while (Date.now() < deadline) {
        const remain = Math.max(20, deadline - Date.now());
        const result = await Promise.race([
          reader.read(),
          new Promise((resolve) => setTimeout(() => resolve({ value: null, done: false, timedOut: true }), remain)),
        ]);
        if (result.timedOut) break;
        if (result.done) break;
        if (result.value && result.value.length) chunks.push(result.value);
      }
    } finally {
      try {
        reader.releaseLock();
      } catch (_) {
        /* ignore */
      }
    }
    let total = 0;
    for (const c of chunks) total += c.length;
    if (!total) return new Uint8Array(0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }

  async function probeBaudViaWebSerial(port, candidates) {
    if (!port || typeof port.open !== "function") return null;
    const list = candidates || getBaudProbeCandidates();
    window._mavlinkCrcSuppressProbe = true;
    try {
    for (const baud of list) {
      try {
        try {
          if (port.readable || port.writable) await port.close();
        } catch (_) {
          /* ignore */
        }
        await port.open({
          baudRate: baud,
          dataBits: 8,
          stopBits: 1,
          parity: "none",
          flowControl: "none",
          bufferSize: 8192,
        });
        const rx = window.buf;
        if (rx && rx.length) rx.length = 0;
        window._lastMavlinkRxMs = 0;
        const sample = await readWebSerialSample(port, 520);
        if (sample.length && rx) {
          for (let i = 0; i < sample.length; i++) rx.push(sample[i]);
          if (typeof parse === "function") {
            parse();
            let drain = 0;
            while (rx.length > 0 && drain < 8 && typeof parse === "function") {
              parse();
              drain += 1;
            }
          }
        }
        const score = scoreWebSerialBuffer();
        try {
          await port.close();
          // 关键：probe 循环里每次 close 后给一点喘息时间，避免连续 open/close 把 USB claim 搞得更乱
          await new Promise((r) => setTimeout(r, 70));
        } catch (_) {
          /* ignore */
        }
        if (score > 0) return baud;
      } catch (_) {
        try {
          await port.close();
          await new Promise((r) => setTimeout(r, 70));
        } catch (__) {
          /* ignore */
        }
      }
    }
    return null;
    } finally {
      window._mavlinkCrcSuppressProbe = false;
    }
  }

  async function resolveConnectBaudRate(opts) {
    const options = opts || {};
    if (!isAutoBaudProbeEnabled()) {
      return getSelectedBaudRate();
    }
    if (window._baudProbeInFlight) {
      return getSelectedBaudRate();
    }
    window._baudProbeInFlight = true;
    try {
      const candidates = getBaudProbeCandidates();
      let detected = null;
      if (options.useBridge && options.portName) {
        detected = await probeBaudViaBridge(options.portName, candidates);
      } else if (options.serialPort) {
        detected = await probeBaudViaWebSerial(options.serialPort, candidates);
      }
      if (detected) {
        applyDetectedBaud(detected);
        if (typeof log === "function") {
          log(`已自动匹配波特率 ${detected}`);
        }
        return detected;
      }
      if (options.useBridge && !window._comBridgeOnline && typeof log === "function") {
        log("COM 桥未就绪，使用手动波特率", "info");
      }
      return getSelectedBaudRate();
    } finally {
      window._baudProbeInFlight = false;
    }
  }

  function bindAutoBaudProbeToggle() {
    const cb = document.getElementById("autoBaudProbe");
    if (!cb || cb.dataset.bound === "1") return;
    cb.dataset.bound = "1";
    try {
      cb.checked = localStorage.getItem("gcs.autoBaudProbe") !== "0";
    } catch (_) {
      cb.checked = true;
    }
    cb.addEventListener("change", () => {
      try {
        localStorage.setItem("gcs.autoBaudProbe", cb.checked ? "1" : "0");
      } catch (_) {
        /* ignore */
      }
    });
  }

  window.isAutoBaudProbeEnabled = isAutoBaudProbeEnabled;
  window.getBaudProbeCandidates = getBaudProbeCandidates;
  window.applyDetectedBaud = applyDetectedBaud;
  window.probeBaudViaBridge = probeBaudViaBridge;
  window.probeBaudViaWebSerial = probeBaudViaWebSerial;
  window.resolveConnectBaudRate = resolveConnectBaudRate;
  window.getConnectWatchdogMs = function getConnectWatchdogMs() {
    return isAutoBaudProbeEnabled() ? 40000 : 25000;
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindAutoBaudProbeToggle);
  } else {
    bindAutoBaudProbeToggle();
  }
})();
