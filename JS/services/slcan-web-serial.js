/**
 * 浏览器 Web Serial 第二路 SLCAN（Live Server + Chrome，无需 8765 COM 桥）
 * 与顶部 MAVLink 口并行：window.port = MAVLink，window._slcanWebPort = SLCAN
 */
(function initSlcanWebSerial(global) {
  const SLCAN_BITRATE_CODE = {
    10: "0", 20: "1", 50: "2", 100: "3", 125: "4", 250: "5", 500: "6", 800: "7", 1000: "8",
  };

  let asciiBuf = "";
  let reader = null;
  let writer = null;
  let readActive = false;
  let boundAuthIndex = -1;

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function hasWebSerial() {
    return !!(global.navigator?.serial && global.isSecureContext);
  }

  function getMainMavlinkPort() {
    const p = global.port;
    if (!p || p.bridge) return null;
    return p;
  }

  async function getAuthorizedPorts() {
    if (!hasWebSerial()) return [];
    try {
      return await global.navigator.serial.getPorts();
    } catch (_) {
      return [];
    }
  }

  function resolveSlcanAuthIndex(opts = {}) {
    if (typeof opts.authIndex === "number" && opts.authIndex >= 0) {
      return opts.authIndex;
    }
    const picker = global.document?.getElementById("sc-dc-slcan-port");
    const pickVal = String(picker?.value || opts.pickerValue || "");
    if (pickVal.startsWith("auth:")) {
      const n = Number(pickVal.slice(5));
      if (Number.isFinite(n) && n >= 0) return n;
    }
    try {
      const saved = localStorage.getItem("gcs.slcanAuthIndex");
      const n = saved != null ? parseInt(String(saved), 10) : NaN;
      if (Number.isFinite(n) && n >= 0) return n;
    } catch (_) { /* ignore */ }

    const ports = global._knownPorts || [];
    const mav = getMainMavlinkPort();
    const mavIdx = mav != null ? ports.findIndex((p) => p === mav) : -1;
    if (ports.length >= 2) {
      if (mavIdx === 0) return 1;
      if (mavIdx === 1) return 0;
      return mavIdx >= 0 ? (mavIdx === 0 ? 1 : 0) : 1;
    }
    return -1;
  }

  async function refreshKnownWebPorts() {
    const ports = await getAuthorizedPorts();
    global._knownPorts = ports;
    return ports;
  }

  async function requestSecondWebSerialPort() {
    if (!hasWebSerial()) return 0;
    const before = await refreshKnownWebPorts();
    const mav = getMainMavlinkPort();
    const mavIdx = mav != null ? before.findIndex((p) => p === mav) : -1;
    if (typeof global.log === "function") {
      global.log(
        "请在浏览器弹窗里选择「另一个」USB 串行口（勿选顶部 MAVLink 已占用的 COM；CUAV 一根线通常有两个）",
        "info"
      );
    }
    try {
      // 不用 VID 过滤，否则弹窗可能只显示一个接口
      await global.navigator.serial.requestPort();
    } catch (e) {
      if (e?.name === "NotFoundError") return before.length;
      throw e;
    }
    const after = await refreshKnownWebPorts();
    if (typeof global.refreshPorts === "function") {
      try { await global.refreshPorts({ probeBridge: false }); } catch (_) { /* ignore */ }
    }
    if (after.length <= before.length && typeof global.log === "function") {
      global.log("⚠️ 未新增授权串口：请重新点「授权第2路」，在列表里选另一个 COM（不是顶部正在用的那个）", "warn");
    } else if (after.length > before.length && typeof global.log === "function") {
      global.log(`✅ 已授权 ${after.length} 路 Web Serial；SLCAN 将使用第 ${mavIdx === 0 ? 2 : mavIdx + 1 || 2} 路`, "info");
    }
    return after.length;
  }

  function countSlcanEligiblePorts(ports) {
    const mav = getMainMavlinkPort();
    const mavIdx = mav != null ? ports.findIndex((p) => p === mav) : -1;
    return ports.length - (mavIdx >= 0 ? 1 : 0);
  }

  function parseSlcanLine(line) {
    if (!line || (line[0] !== "T" && line[0] !== "t")) return;
    const extended = line[0] === "T";
    const canIdLen = extended ? 8 : 3;
    const minLen = 1 + canIdLen + 1;
    if (line.length < minLen) return;
    try {
      const canId = parseInt(line.slice(1, 1 + canIdLen), 16);
      const dlc = parseInt(line.charAt(1 + canIdLen), 16);
      const dataHex = line.slice(2 + canIdLen, 2 + canIdLen + dlc * 2);
      if (dataHex.length < dlc * 2) return;
      const data = new Uint8Array(dlc);
      for (let i = 0; i < dlc; i += 1) {
        data[i] = parseInt(dataHex.slice(i * 2, i * 2 + 2), 16);
      }
      if (typeof global.feedSlcanCanFrame === "function") {
        global.feedSlcanCanFrame(canId, dlc, data, 0, "SLCAN Direct");
      }
    } catch (_) { /* ignore */ }
  }

  function feedAsciiChunk(chunk) {
    let text = "";
    if (chunk instanceof Uint8Array) {
      text = new TextDecoder().decode(chunk);
    } else if (typeof chunk === "string") {
      text = chunk;
    }
    if (!text) return;
    asciiBuf += text;
    let idx;
    while ((idx = asciiBuf.search(/[\r\n]/)) >= 0) {
      const line = asciiBuf.slice(0, idx).trim();
      asciiBuf = asciiBuf.slice(idx + 1);
      if (line) parseSlcanLine(line);
    }
    if (asciiBuf.length > 8192) asciiBuf = asciiBuf.slice(-4096);
  }

  async function writeCmd(text) {
    if (!writer) return;
    await writer.write(new TextEncoder().encode(text));
    await sleep(80);
  }

  async function sendSlcanLine(line) {
    const text = String(line || "");
    if (!text) return false;
    if (!writer) return false;
    await writeCmd(text.endsWith("\r") ? text : `${text}\r`);
    return true;
  }

  async function initAdapter(bitrateKbps = 1000) {
    const code = SLCAN_BITRATE_CODE[bitrateKbps] || SLCAN_BITRATE_CODE[1000];
    await writeCmd("C\r");
    await writeCmd(`S${code}\r`);
    await writeCmd("O\r");
  }

  async function slcanReadLoop() {
    readActive = true;
    while (readActive && reader) {
      try {
        const { value, done } = await reader.read();
        if (done) break;
        if (value && value.length) feedAsciiChunk(value);
      } catch (e) {
        if (e?.name === "AbortError") break;
        const msg = String(e?.message || e || "");
        if (/device has been lost|NetworkError/i.test(msg)) break;
        await sleep(50);
      }
    }
    readActive = false;
  }

  async function closeSlcanWebSerial() {
    readActive = false;
    try {
      if (reader) {
        try { await reader.cancel(); } catch (_) { /* ignore */ }
        try { reader.releaseLock(); } catch (_) { /* ignore */ }
      }
    } catch (_) { /* ignore */ }
    reader = null;
    try {
      if (writer) {
        try { await writer.close(); } catch (_) { /* ignore */ }
        try { writer.releaseLock(); } catch (_) { /* ignore */ }
      }
    } catch (_) { /* ignore */ }
    writer = null;
    try {
      const p = global._slcanWebPort;
      if (p && typeof p.close === "function") await p.close();
    } catch (_) { /* ignore */ }
    global._slcanWebPort = null;
    global._slcanWebActive = false;
    asciiBuf = "";
    boundAuthIndex = -1;
  }

  async function openSlcanWebSerial(opts = {}) {
    if (!hasWebSerial()) return false;

    const ports = await getAuthorizedPorts();
    if (!ports.length) return false;

    const authIndex = resolveSlcanAuthIndex(opts);
    if (authIndex < 0 || authIndex >= ports.length) return false;

    const mav = getMainMavlinkPort();
    if (mav && ports[authIndex] === mav) {
      if (typeof global.log === "function") {
        global.log("SLCAN 口不能与顶部 MAVLink 为同一 Web Serial 口，请在 DroneCAN 区另选「串口2」", "warn");
      }
      return false;
    }

    const baudRate = Number(opts.baudRate) > 0 ? Number(opts.baudRate) : 115200;
    const bitrateKbps = Number(opts.bitrateKbps) > 0 ? Number(opts.bitrateKbps) : 1000;

    if (global._slcanWebActive && boundAuthIndex === authIndex && global._slcanWebPort) {
      return true;
    }

    await closeSlcanWebSerial();

    const port = ports[authIndex];
    try {
      await Promise.race([
        port.open({
          baudRate,
          dataBits: 8,
          stopBits: 1,
          parity: "none",
          flowControl: "none",
          bufferSize: 8192,
        }),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("SLCAN 口打开超时")), 15000);
        }),
      ]);
    } catch (e) {
      if (typeof global.log === "function") {
        global.log(`SLCAN Web Serial 打开失败: ${e?.message || e}`, "warn");
      }
      return false;
    }

    global._slcanWebPort = port;
    reader = port.readable.getReader();
    writer = port.writable.getWriter();
    global._slcanWebActive = true;
    boundAuthIndex = authIndex;

    try {
      localStorage.setItem("gcs.slcanAuthIndex", String(authIndex));
    } catch (_) { /* ignore */ }

    try {
      await initAdapter(bitrateKbps);
    } catch (e) {
      if (typeof global.log === "function") {
        global.log(`SLCAN 初始化命令失败: ${e?.message || e}`, "warn");
      }
    }

    slcanReadLoop().catch(() => {});
    if (typeof global.log === "function") {
      global.log(`✅ SLCAN Web Serial 已打开：同USB第 ${authIndex + 1} 路 @ ${baudRate}（无需 GCS.cmd）`, "info");
    }
    return true;
  }

  async function ensureSlcanWebSerial(opts = {}) {
    if (!hasWebSerial()) return false;
    const ports = await refreshKnownWebPorts();
    if (ports.length < 1) return false;
    if (countSlcanEligiblePorts(ports) < 1) {
      if (typeof global.log === "function") {
        global.log("SLCAN 需要第二路 USB 串口：顶部已占用第1路，请在下拉点「＋ 授权第二路」", "warn");
      }
      return false;
    }
    return openSlcanWebSerial(opts);
  }

  global.ensureSlcanWebSerial = ensureSlcanWebSerial;
  global.closeSlcanWebSerial = closeSlcanWebSerial;
  global.sendSlcanWebSerialLine = sendSlcanLine;
  global.resolveSlcanWebSerialAuthIndex = resolveSlcanAuthIndex;
  global.isSlcanWebSerialActive = () => !!global._slcanWebActive;
  global.requestSecondWebSerialPort = requestSecondWebSerialPort;
  global.refreshKnownWebPorts = refreshKnownWebPorts;
  global.countSlcanEligibleWebPorts = () => countSlcanEligiblePorts(global._knownPorts || []);
})(typeof window !== "undefined" ? window : globalThis);
