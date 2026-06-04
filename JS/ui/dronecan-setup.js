(function initDroneCanSetup() {
  const svgNs = "http://www.w3.org/2000/svg";

  let canNodes = [];
  let selectedCanId = 0;
  let dcTimer = 0;
  let dcClockTimer = 0;
  let dronecanPanelWasActive = false;
  /** DroneCAN 面板已确认 COM 桥就绪后，轮询不再反复 ensure（避免闪 cmd/PowerShell） */
  let dcBridgeEnsured = false;
  let currentMode = "slcan";
  let uiBound = false;
  let slcanSessionReady = false;
  let slcanBoundPort = "";
  let slcanInitDone = false;
  let slcanInitRetryAt = 0;
  let slcanPortLostAt = 0;
  let menuNodeId = 0;
  let selectedInspectorMessage = null;
  let lastCanForwardAt = 0;
  let reconnectCountdownTimer = 0;
  const inspectorOpenState = {
    nodes: new Set(),
    groups: new Set(),
  };
  const DC_LOCAL_CONFIG_KEY = "gcs.dronecan.menu.config.v2";
  const GCS_NODE_ID = 125;
  const REBOOT_COMMAND = 246;
  const DRONECAN_GETSET_SERVICE_ID = 11;
  const DRONECAN_EXECUTE_OPCODE_SERVICE_ID = 10;
  const DRONECAN_GETSET_SIGNATURE = 0xA7B622F939D1A4D5n;
  const DRONECAN_EXECUTE_OPCODE_SIGNATURE = 0x3B131AC5EB69D2CDn;
  const dcMenuState = {
    activeModal: "",
    updateAbortController: null,
    reconnectTargetSeconds: 0,
    reconnectRemainingSeconds: 0,
    paramCache: new Map(),
    paramDrafts: new Map(),
    paramSelectedIndex: -1,
    paramSearch: "",
    paramLoadedFromLocal: false,
    serviceTransferIds: new Map(),
  };

  const slcanRuntime = {
    framesPerSecond: 0,
    errorFrames: 0,
    nodes: new Map(),
  };
  /** 浏览器 Web Serial 路径下的 CAN 节点表（不依赖 8765 COM 桥） */
  /** 后台帧缓存（Inspector 不展示原始帧列表） */
  const FRAME_RING_PER_NODE = 256;
  const FRAME_RING_PER_CAN_ID = 48;

  const browserCanMonitor = {
    frameTimes: [],
    errorCount: 0,
    nodes: new Map(),
    nodeRecentFrames: new Map(),
    nodeCanIdFrames: new Map(),
    nodeFrameCounts: new Map(),
    lastFrameAt: 0,
  };

  function getCachedFramesForCan(nodeId, canId) {
    const nid = Number(nodeId);
    const cid = String(canId || "");
    if (!Number.isFinite(nid) || !cid) return [];
    const byCan = browserCanMonitor.nodeCanIdFrames.get(nid);
    if (byCan && typeof byCan.get === "function") {
      const ring = byCan.get(cid);
      if (Array.isArray(ring) && ring.length) return ring;
    }
    return (browserCanMonitor.nodeRecentFrames.get(nid) || []).filter((f) => f?.canId === cid);
  }

  function recountNodeFrameCounts(nodeId) {
    const nid = Number(nodeId);
    if (!Number.isFinite(nid) || nid <= 0) return {};
    const recent = browserCanMonitor.nodeRecentFrames.get(nid) || [];
    const counts = {};
    recent.forEach((frame) => {
      if (!frame?.canId) return;
      counts[frame.canId] = (counts[frame.canId] || 0) + 1;
    });
    browserCanMonitor.nodeFrameCounts.set(nid, counts);
    const node = browserCanMonitor.nodes.get(nid);
    if (node) {
      node.rxCount = recent.length;
      browserCanMonitor.nodes.set(nid, node);
    }
    return counts;
  }

  window.getDroneCanCachedFrames = getCachedFramesForCan;
  const nodeRetentionMs = 120000;
  let lastLiveSnapshotAt = 0;
  let groundStationNodeCache = null;

  function $(id) {
    return document.getElementById(id);
  }

  function panelRoot() {
    return $("setup-panel-dronecan");
  }

  function isDronecanPanelActive() {
    const panel = panelRoot();
    const modeButton = document.querySelector('.ov-nav-item[data-setup-panel="dronecan"]');
    const activeByPanel = !!(panel && panel.classList.contains("active"));
    const activeByButton = !!(modeButton && modeButton.classList.contains("active"));
    return activeByPanel || activeByButton;
  }

  function workbenchRoot() {
    return panelRoot()?.querySelector(".sc-dc-workbench") || null;
  }

  function systemComPorts() {
    return Array.isArray(window._systemComPorts) ? window._systemComPorts : [];
  }

  function dronecanRegistry() {
    return window.DRONECAN_REGISTRY || null;
  }

  function dronecanDecode() {
    return window.DRONECAN_DECODE || null;
  }

  function messageDisplayLabel(meta) {
    if (!meta) return "—";
    if (typeof window.DRONECAN_LABELS_ZH?.formatShortName === "function") {
      return window.DRONECAN_LABELS_ZH.formatShortName(meta.shortName, meta.fullName, meta.labelZh);
    }
    const zh = meta.labelZh || "";
    return zh ? `${meta.shortName} · ${zh}` : meta.shortName || "—";
  }

  function categoryDisplayLabel(category) {
    if (!category) return "—";
    if (typeof window.DRONECAN_LABELS_ZH?.formatCategory === "function") {
      return window.DRONECAN_LABELS_ZH.formatCategory(category);
    }
    return category;
  }

  function inspectorUiLabel(key) {
    if (typeof window.DRONECAN_LABELS_ZH?.uiLabel === "function") {
      return window.DRONECAN_LABELS_ZH.uiLabel(key);
    }
    return key;
  }

  function inspectorFieldLabel(name) {
    if (typeof window.DRONECAN_LABELS_ZH?.fieldLabel === "function") {
      return window.DRONECAN_LABELS_ZH.fieldLabel(name);
    }
    return name;
  }

  function dcText(en, zh) {
    const e = String(en ?? "").trim();
    const z = String(zh ?? "").trim();
    if (!e) return z || "—";
    if (!z || z === e) return e;
    if (typeof window.DRONECAN_LABELS_ZH?.bilingual === "function") {
      return window.DRONECAN_LABELS_ZH.bilingual(e, z);
    }
    return `${e} / ${z}`;
  }

  function setLiveText(id, value, className = "sc-dc-live-flash") {
    const el = $(id);
    if (!el) return;
    const next = String(value ?? "—");
    if (el.textContent === next) return;
    el.textContent = next;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
    window.setTimeout(() => el.classList.remove(className), 420);
  }

  function parseInspectorSelection(raw) {
    const text = String(raw || "");
    const sep = text.indexOf(":");
    if (sep < 0) return null;
    const nodeId = Number(text.slice(0, sep));
    const canId = text.slice(sep + 1).trim();
    if (!Number.isFinite(nodeId) || !canId) return null;
    return { nodeId, canId };
  }

  function findInspectorFrame(node, canId) {
    if (!node || !canId) return null;
    const recent = (node.recentFrames || []).slice().reverse();
    return recent.find((frame) => frame.canId === canId) || null;
  }

  function getDecodeFramesForCan(node, canId) {
    const merged = [];
    const seen = new Set();
    const pushFrame = (frame) => {
      if (!frame || frame.canId !== canId || !frame.dataHex) return;
      const key = `${Number(frame.ts) || 0}|${frame.canId}|${frame.dataHex}|${Number(frame.dlc) || 0}`;
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(frame);
    };
    getCachedFramesForCan(node?.nodeId, canId).forEach(pushFrame);
    (Array.isArray(node?.recentFrames) ? node.recentFrames : []).forEach(pushFrame);
    return merged.sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
  }

  function isSerialViaBridge() {
    return !!(window.port && window.port.bridge);
  }

  function shouldPollBrowserCan() {
    if (slcanBoundPort === "webserial" && typeof window.isSlcanWebSerialActive === "function" && window.isSlcanWebSerialActive()) {
      return true;
    }
    return slcanBoundPort === "mavlink" && isGcsSerialConnected() && !isSerialViaBridge();
  }

  function inferBrowserNodeMeta(nodeId) {
    const frameIdCounts = browserCanMonitor.nodeFrameCounts.get(nodeId) || {};
    const stub = { nodeId, frameIdCounts };
    const matched = dronecanRegistry()?.matchDevice?.(stub);
    if (matched) {
      return {
        name: matched.name || `node-${nodeId}`,
        displayName: matched.displayName || `Node ${nodeId}`,
        deviceHint: matched.deviceHint || "DroneCAN",
        hardwareVersion: matched.hardwareVersion,
        profile: matched.profile,
      };
    }
    if (nodeId === 1) {
      return { name: "org.ardupilot", displayName: "Flight Controller", deviceHint: "Autopilot" };
    }
    if (nodeId === 34 || nodeId === 51) {
      return { name: "org.cuav.can_pmu_lite", displayName: "CUAV CAN PMU Lite", deviceHint: "Power module" };
    }
    return { name: `node-${nodeId}`, displayName: `Node ${nodeId}`, deviceHint: "Unknown" };
  }

  function feedBrowserCanFrame(frameId, dlc, dataBytes, bus, source) {
    const now = Date.now() / 1000;
    browserCanMonitor.lastFrameAt = now;
    browserCanMonitor.frameTimes.push(now);
    const cutoff = now - 1.0;
    browserCanMonitor.frameTimes = browserCanMonitor.frameTimes.filter((t) => t >= cutoff);

    const nodeId = frameId & 0x7f;
    if (nodeId <= 0 || nodeId > 127) return;

    const data = dataBytes instanceof Uint8Array ? dataBytes : new Uint8Array(dataBytes || []);
    const hex = Array.from(data).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    const meta = inferBrowserNodeMeta(nodeId);
    const prev = browserCanMonitor.nodes.get(nodeId) || {
      nodeId,
      rxCount: 0,
      first_seen: now,
    };
    const node = {
      ...prev,
      ...meta,
      name: meta.displayName || meta.name,
      status: "online",
      source: source || `MAVLink CAN${(Number(bus) || 0) + 1}`,
      rxCount: Number(prev.rxCount || 0) + 1,
      last_seen: now,
      lastCanId: `0x${(frameId >>> 0).toString(16).toUpperCase()}`,
      lastDlc: Number(dlc) || data.length,
      lastDataHex: hex,
      first_seen: prev.first_seen || now,
    };
    browserCanMonitor.nodes.set(nodeId, node);

    const recent = browserCanMonitor.nodeRecentFrames.get(nodeId) || [];
    recent.push({
      ts: Math.round(now * 1000),
      canId: node.lastCanId,
      dlc: node.lastDlc,
      dataHex: hex,
      bus: Number(bus) || 0,
    });
    const trimmedRecent = recent.slice(-FRAME_RING_PER_NODE);
    browserCanMonitor.nodeRecentFrames.set(nodeId, trimmedRecent);

    let byCan = browserCanMonitor.nodeCanIdFrames.get(nodeId);
    if (!byCan) {
      byCan = new Map();
      browserCanMonitor.nodeCanIdFrames.set(nodeId, byCan);
    }
    const cid = node.lastCanId;
    const perCan = byCan.get(cid) || [];
    perCan.push({
      ts: Math.round(now * 1000),
      canId: cid,
      dlc: node.lastDlc,
      dataHex: hex,
      bus: Number(bus) || 0,
    });
    byCan.set(cid, perCan.slice(-FRAME_RING_PER_CAN_ID));
    recountNodeFrameCounts(nodeId);
  }

  function cacheSnapshotFramesForNode(rawNode) {
    const nodeId = Number(rawNode?.nodeId || 0);
    const frames = Array.isArray(rawNode?.recentFrames) ? rawNode.recentFrames : [];
    if (!Number.isFinite(nodeId) || nodeId <= 0 || !frames.length) return;

    const existingRecent = browserCanMonitor.nodeRecentFrames.get(nodeId) || [];
    const recentSeen = new Set(existingRecent.map((f) => `${Number(f.ts) || 0}|${f.canId}|${f.dataHex}|${Number(f.dlc) || 0}`));
    const mergedRecent = existingRecent.slice();

    let byCan = browserCanMonitor.nodeCanIdFrames.get(nodeId);
    if (!byCan) {
      byCan = new Map();
      browserCanMonitor.nodeCanIdFrames.set(nodeId, byCan);
    }
    frames.forEach((frame) => {
      if (!frame?.canId || !frame?.dataHex) return;
      const ts = Number(frame.ts) || Date.now();
      const dlc = Number(frame.dlc) || 0;
      const key = `${ts}|${frame.canId}|${frame.dataHex}|${dlc}`;
      if (!recentSeen.has(key)) {
        recentSeen.add(key);
        mergedRecent.push({
          ts,
          canId: frame.canId,
          dlc,
          dataHex: frame.dataHex,
          bus: Number(frame.bus) || 0,
        });
      }

      const perCan = byCan.get(frame.canId) || [];
      const perCanSeen = new Set(perCan.map((f) => `${Number(f.ts) || 0}|${f.canId}|${f.dataHex}|${Number(f.dlc) || 0}`));
      if (!perCanSeen.has(key)) {
        perCan.push({
          ts,
          canId: frame.canId,
          dlc,
          dataHex: frame.dataHex,
          bus: Number(frame.bus) || 0,
        });
        byCan.set(frame.canId, perCan.slice(-FRAME_RING_PER_CAN_ID));
      }
    });

    mergedRecent.sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
    browserCanMonitor.nodeRecentFrames.set(nodeId, mergedRecent.slice(-FRAME_RING_PER_NODE));
    recountNodeFrameCounts(nodeId);
  }

  function getBrowserCanStatus() {
    const now = Date.now() / 1000;
    const nodes = [];
    browserCanMonitor.nodes.forEach((node, nodeId) => {
      if (now - (node.last_seen || 0) > 15) return;
      const metaHint = inferBrowserNodeMeta(nodeId);
      nodes.push({
        nodeId,
        name: metaHint.displayName || node.name,
        displayName: metaHint.displayName || node.displayName,
        deviceHint: metaHint.deviceHint || node.deviceHint,
        status: "online",
        source: node.source,
        rxCount: node.rxCount,
        lastCanId: node.lastCanId,
        lastDataHex: node.lastDataHex,
        lastDlc: node.lastDlc,
        firstSeenAt: Math.round((node.first_seen || now) * 1000),
        lastSeenAt: Math.round((node.last_seen || now) * 1000),
        recentFrames: browserCanMonitor.nodeRecentFrames.get(nodeId) || [],
        frameIdCounts: browserCanMonitor.nodeFrameCounts.get(nodeId) || {},
      });
    });
    nodes.sort((a, b) => a.nodeId - b.nodeId);
    return {
      framesPerSecond: browserCanMonitor.frameTimes.length,
      errorCount: browserCanMonitor.errorCount,
      nodes,
    };
  }

  window.feedMavlinkCanFrame = feedBrowserCanFrame;

  async function ensureDcBridgeOnce() {
    if (dcBridgeEnsured) return;
    if (typeof window.isBridgeBackoffActive === "function" && window.isBridgeBackoffActive()) {
      return;
    }
    if (typeof window.ensureComBridgeRunning === "function") {
      await window.ensureComBridgeRunning();
    }
    dcBridgeEnsured = true;
  }

  async function bridgeJson(path, body = null, opts = {}) {
    const skipEnsure =
      opts.skipEnsure === true ||
      (opts.skipEnsure !== false && dronecanPanelWasActive && dcBridgeEnsured);
    if (!skipEnsure && typeof window.ensureComBridgeRunning === "function") {
      const backoff =
        typeof window.isBridgeBackoffActive === "function" && window.isBridgeBackoffActive();
      if (!backoff) await window.ensureComBridgeRunning();
    }
    const resp = await fetch(`http://127.0.0.1:8765${path}`, body ? {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    } : { method: "GET", cache: "no-store" });
    const text = await resp.text();
    let data = {};
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = {};
    }
    if (!resp.ok || data?.ok === false) {
      throw new Error(data?.error || `${path} failed (${resp.status})`);
    }
    return data;
  }

  function detectSlcanAdapterPort() {
    const picker = document.getElementById("sc-dc-slcan-port");
    if (picker?.value?.startsWith("auth:")) return picker.value;
    if (typeof window.getSlcanDeviceId === "function") {
      const saved = window.getSlcanDeviceId();
      if (saved) {
        slcanPortLostAt = 0;
        return saved;
      }
    }
    const ports = systemComPorts();
    const hit = ports.find((p) => p && (p.isSlcanAdapter || /slcan/i.test(String(p.name || ""))));
    const found = hit?.deviceId || "";
    if (!found && slcanBoundPort && slcanBoundPort !== "mavlink") {
      slcanPortLostAt = slcanPortLostAt || Date.now();
      return slcanBoundPort;
    }
    if (found) slcanPortLostAt = 0;
    return found;
  }

  function isGcsSerialConnected() {
    return (window._gcsConnState || "").toLowerCase() === "connected" && !!(window.writer || window.port);
  }

  function preferMavlinkCanTransport() {
    return !detectSlcanAdapterPort() && isGcsSerialConnected();
  }

  function wireSlcanPortPicker() {
    const sel = document.getElementById("sc-dc-slcan-port");
    if (!sel || sel.dataset.wired === "1") return;
    sel.dataset.wired = "1";
    const fill = async () => {
      let webPorts = Array.isArray(window._knownPorts) ? window._knownPorts : [];
      if (typeof window.refreshKnownWebPorts === "function") {
        try { webPorts = await window.refreshKnownWebPorts(); } catch (_) { /* ignore */ }
      } else if (typeof window.hasWebSerialApi === "function" && window.hasWebSerialApi()) {
        try { webPorts = await navigator.serial.getPorts(); window._knownPorts = webPorts; } catch (_) { /* ignore */ }
      }
      const sysPorts = systemComPorts().filter(
        (p) => p?.deviceId && !(typeof window.isNoiseSerialPort === "function" && window.isNoiseSerialPort(p))
      );
      const mavPort = window.port && !window.port.bridge ? window.port : null;
      const mavIdx = mavPort != null ? webPorts.findIndex((p) => p === mavPort) : -1;
      const slcanEligible =
        typeof window.countSlcanEligibleWebPorts === "function"
          ? window.countSlcanEligibleWebPorts()
          : Math.max(0, webPorts.length - (mavIdx >= 0 ? 1 : 0));
      const cur = detectSlcanAdapterPort();
      sel.innerHTML = "";
      const auto = document.createElement("option");
      auto.value = "";
      auto.text = sysPorts.length
        ? "自动（与 MAVLink 配对的另一 USB 口）"
        : "自动（浏览器：非顶部 MAVLink 的那一路）";
      sel.appendChild(auto);
      sysPorts.forEach((p) => {
        const o = document.createElement("option");
        o.value = p.deviceId;
        const role =
          typeof window.getPortProbeRole === "function" ? window.getPortProbeRole(p) : "";
        const roleTag = role === "slcan" ? " [探测:SLCAN]" : role === "mavlink" ? " [探测:MAVLink]" : "";
        o.text = `${p.deviceId} (${p.name || "USB"})${roleTag}`;
        sel.appendChild(o);
      });
      if (!sysPorts.length && typeof window.hasWebSerialApi === "function" && window.hasWebSerialApi()) {
        webPorts.forEach((_, i) => {
          const isMav = i === mavIdx;
          const o = document.createElement("option");
          o.value = `auth:${i}`;
          o.text = isMav
            ? `串口${i + 1}（顶部已占用）`
            : `浏览器串口${i + 1}（同USB第${i + 1}路）`;
          if (isMav) o.disabled = true;
          sel.appendChild(o);
        });
        if (slcanEligible < 1) {
          const add = document.createElement("option");
          add.value = "__add_slcan_port__";
          add.text = "＋ 授权第二路 USB 串口";
          sel.appendChild(add);
        }
      }
      if (cur && Array.from(sel.options).some((o) => o.value === cur && !o.disabled)) {
        sel.value = cur;
      } else if (slcanEligible >= 1) {
        const first = Array.from(sel.options).find((o) => o.value.startsWith("auth:") && !o.disabled);
        if (first) sel.value = first.value;
      } else if (sel.querySelector('option[value="__add_slcan_port__"]')) {
        sel.value = "__add_slcan_port__";
      }
    };
    async function applySecondSlcanPortSelection() {
      await fill();
      const pick = Array.from(sel.options).find((o) => o.value.startsWith("auth:") && !o.disabled);
      if (!pick) {
        if ($("sc-dc-hint")) {
          $("sc-dc-hint").textContent = "仍未检测到第2路。请在弹窗中选另一个 COM，或先用「MAVLink CAN1」。";
        }
        return;
      }
      sel.value = pick.value;
      try {
        localStorage.setItem("gcs.slcanAuthIndex", pick.value.slice(5));
        localStorage.setItem("gcs.slcanDeviceIdManual", "1");
      } catch (_) { /* ignore */ }
      slcanBoundPort = "";
      slcanInitDone = false;
      currentMode = "slcan";
      document.querySelectorAll(".sc-dc-mode-tab").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.dcMode === "slcan");
      });
      document.querySelectorAll(".sc-dc-panel").forEach((panel) => {
        panel.classList.toggle("active", panel.dataset.dcPanel === "slcan");
      });
      await ensureSlcanDirectSession();
      await tick();
    }

    const authBtn = document.getElementById("sc-dc-auth-slcan2");
    if (authBtn && authBtn.dataset.wired !== "1") {
      authBtn.dataset.wired = "1";
      authBtn.addEventListener("click", async () => {
        if (typeof window.requestSecondWebSerialPort === "function") {
          await window.requestSecondWebSerialPort();
        }
        await applySecondSlcanPortSelection();
      });
    }

    sel.addEventListener("change", async () => {
      try {
        if (sel.value === "__add_slcan_port__") {
          if (typeof window.requestSecondWebSerialPort === "function") {
            await window.requestSecondWebSerialPort();
          }
          await applySecondSlcanPortSelection();
          return;
        }
        if (sel.value) {
          if (sel.value.startsWith("auth:")) {
            localStorage.setItem("gcs.slcanAuthIndex", sel.value.slice(5));
          } else {
            localStorage.setItem("gcs.slcanDeviceId", sel.value);
          }
          localStorage.setItem("gcs.slcanDeviceIdManual", "1");
        } else {
          localStorage.removeItem("gcs.slcanDeviceIdManual");
          const mav =
            typeof window.getMavlinkDeviceId === "function" ? window.getMavlinkDeviceId() : "";
          if (mav && typeof window.findCuavSiblingPort === "function") {
            const sib = window.findCuavSiblingPort(mav);
            if (sib) localStorage.setItem("gcs.slcanDeviceId", sib);
          }
        }
        slcanBoundPort = "";
        slcanInitDone = false;
        ensureSlcanDirectSession().then(() => tick()).catch(() => tick());
      } catch (_) { /* ignore */ }
    });
    fill().catch(() => {});
    window._fillSlcanPortPicker = fill;
  }

  async function prepareSlcanPickerForPanel() {
    wireSlcanPortPicker();
    try {
      await ensureDcBridgeOnce();
    } catch (_) { /* ignore */ }
    if (typeof window._fillSlcanPortPicker === "function") {
      await window._fillSlcanPortPicker();
    }
    const eligible =
      typeof window.countSlcanEligibleWebPorts === "function" ? window.countSlcanEligibleWebPorts() : 0;
    if (eligible < 1 && typeof window.requestSecondWebSerialPort === "function" && isGcsSerialConnected()) {
      if ($("sc-dc-hint")) {
        $("sc-dc-hint").textContent =
          "CUAV 一根 USB 两个虚拟口：请在「SLCAN 口」下拉选「＋ 授权第二路」，在弹窗中再选一次飞控 USB（或同一设备第二项）。";
      }
    }
  }

  async function maybeRefreshCanForward(bus = 1) {
    if (!isGcsSerialConnected() || slcanBoundPort !== "mavlink") return;
    const now = Date.now();
    if (now - lastCanForwardAt < 8000) return;
    lastCanForwardAt = now;
    if (typeof window.sendCommandLong === "function") {
      try {
        await window.sendCommandLong(183, bus, 0, 0, 0, 0, 0, 0, 0);
      } catch (_) { /* ignore */ }
    }
  }

  function num(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function getParam(name) {
    const params = window.params;
    if (!(params instanceof Map)) return null;
    if (params.has(name)) {
      const v = Number(params.get(name));
      return Number.isFinite(v) ? v : null;
    }
    const upper = String(name).toUpperCase();
    for (const [k, val] of params) {
      if (String(k).toUpperCase() === upper) {
        const v = Number(val);
        return Number.isFinite(v) ? v : null;
      }
    }
    return null;
  }

  function getFlightControllerCanIdentity() {
    const drivers = [];
    for (let i = 1; i <= 3; i += 1) {
      if (Math.round(num(getParam(`CAN_D${i}_PROTOCOL`), 0)) === 1) drivers.push(i);
    }
    const primaryDriver = drivers.find((i) => getParam(`CAN_D${i}_UC_NODE`) != null) || drivers[0] || 1;
    return {
      canDrivers: drivers,
      primaryDriver,
      nodeId: Math.round(num(getParam(`CAN_D${primaryDriver}_UC_NODE`), 0)),
    };
  }

  function softwareVersionForNode(node) {
    return node.softwareVersion || dcText("live", "实时");
  }

  function hardwareVersionForNode(node) {
    const registry = dronecanRegistry();
    const matched = registry?.matchDevice?.(node);
    return matched?.hardwareVersion || node.hardwareVersion || dcText("DroneCAN", "DroneCAN");
  }

  function nodeHealth(node) {
    if (node.status === "online") return "正常";
    if (node.status === "stale" || node.stale) return "暂存";
    return "离线";
  }

  function nodeMode(node) {
    if (node.status === "online") return "运行中";
    if (node.status === "stale" || node.stale) return "保持";
    return "空闲";
  }

  function nodeVendorCode(node) {
    return node.vendorCode || "0";
  }

  function nodeCrc(node) {
    return node.swCrc || "0";
  }

  function nodeUptime(node) {
    const liveSec = Number(node?.uptimeSec);
    if (Number.isFinite(liveSec) && liveSec >= 0) {
      const now = Date.now();
      const elapsed = Math.max(0, Math.floor((now - num(node?.lastSeenAt, now)) / 1000));
      const total = liveSec + elapsed;
      const hh = String(Math.floor(total / 3600)).padStart(2, "0");
      const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
      const ss = String(total % 60).padStart(2, "0");
      return `${hh}:${mm}:${ss}`;
    }
    const now = Date.now();
    const seconds = Math.max(0, Math.floor((now - num(node.firstSeenAt, now)) / 1000));
    const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
    const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  function nodeHexName(node) {
    const src = String(node.displayName || node.name || "");
    return Array.from(src).map((c) => c.charCodeAt(0).toString(16).padStart(2, "0").toUpperCase()).join(" ");
  }

  function buildGroundStationNode() {
    if (groundStationNodeCache) {
      groundStationNodeCache.lastSeenAt = Date.now();
      groundStationNodeCache.dsdlData = {
        ...(groundStationNodeCache.dsdlData || {}),
        "frame.last_seen_ms": String(Date.now()),
      };
      return groundStationNodeCache;
    }
    groundStationNodeCache = mkNode({
      nodeId: 127,
      name: "GCS / Ground Station",
      displayName: "GCS / Ground Station",
      deviceHint: "Ground station",
      source: "SLCAN Direct",
      status: "online",
      stale: false,
      isLocal: false,
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
      rxCount: 0,
      uptimeSec: 0,
      lastCanId: "--",
      lastDataHex: "--",
      dsdlData: {
        "transport.source": "SLCAN Direct",
        "frame.can_id": "--",
        "frame.dlc": "0",
        "frame.data": "--",
        "frame.count": "0",
        "frame.last_seen_ms": String(Date.now()),
        "uptime_sec": "0",
      },
      recentFrames: [],
      frameIdCounts: {},
    });
    return groundStationNodeCache;
  }

  function formatLastSeenAgo(ts) {
    const value = num(ts, 0);
    if (!value) return "--";
    const diff = Math.max(0, Date.now() - value);
    if (diff < 1000) return dcText("<1s ago", "刚刚");
    if (diff < 60000) return dcText(`${Math.round(diff / 1000)}s ago`, `${Math.round(diff / 1000)} 秒前`);
    return dcText(`${(diff / 60000).toFixed(1)}m ago`, `${(diff / 60000).toFixed(1)} 分钟前`);
  }

  function computeObservedFrameStats(nodes) {
    const list = Array.isArray(nodes) ? nodes : [];
    let totalFrames = 0;
    let firstSeen = Infinity;
    let lastSeen = 0;
    list.forEach((node) => {
      const rx = Number(node?.rxCount || 0);
      const first = num(node?.firstSeenAt ?? node?.first_seen, 0);
      const last = num(node?.lastSeenAt ?? node?.last_seen, 0);
      if (rx > 0) totalFrames += rx;
      if (first > 0) firstSeen = Math.min(firstSeen, first);
      if (last > 0) lastSeen = Math.max(lastSeen, last);
    });
    const spanMs = Number.isFinite(firstSeen) && lastSeen > firstSeen ? (lastSeen - firstSeen) : 0;
    const fps = spanMs > 0 && totalFrames > 0 ? Math.max(1, Math.round((totalFrames * 1000) / spanMs)) : 0;
    return {
      fps,
      loadPct: Math.min(100, Math.round((fps / 1000) * 100)),
    };
  }

  function computeNodeObservedStats(node) {
    const frames = Array.isArray(node?.recentFrames) ? node.recentFrames : [];
    if (!frames.length) {
      return {
        frameCount: num(node?.rxCount, 0),
        bps: 0,
      };
    }
    const frameCount = Math.max(frames.length, num(node?.rxCount, 0));
    const firstTs = num(frames[0]?.ts, 0);
    const lastTs = num(frames[frames.length - 1]?.ts, 0);
    const spanMs = lastTs > firstTs ? (lastTs - firstTs) : 0;
    const bps = spanMs > 0 && frameCount > 0 ? Math.max(1, Math.round((frameCount * 1000) / spanMs)) : 0;
    return { frameCount, bps };
  }

  function mkNode(base) {
    return {
      inferred: false,
      stale: false,
      vendorCode: "0",
      swCrc: "0",
      softwareVersion: "live",
      hardwareVersion: "DroneCAN",
      source: "SLCAN",
      dsdlData: {},
      ...base,
    };
  }

  function parseNumericPrefix(value) {
    const text = String(value ?? "").trim();
    const m = text.match(/^[-+]?\d+(?:\.\d+)?/);
    if (!m) return null;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : null;
  }

  function extractNodeStatusUptime(rawNode) {
    const directCandidates = [
      rawNode?.uptimeSec,
      rawNode?.uptime_sec,
      rawNode?.dsdlData?.uptime_sec,
      rawNode?.dsdlData?.["decode.uptime_sec"],
    ];
    for (const value of directCandidates) {
      const n = parseNumericPrefix(value);
      if (Number.isFinite(n) && n >= 0) return n;
    }

    const registry = dronecanRegistry();
    const decoder = dronecanDecode();
    const frames = Array.isArray(rawNode?.recentFrames) ? rawNode.recentFrames : [];
    for (let i = frames.length - 1; i >= 0; i -= 1) {
      const fr = frames[i];
      const meta = registry?.describeMessage?.(fr?.canId) || {};
      if (meta.shortName !== "NodeStatus" && meta.fullName !== "uavcan.protocol.NodeStatus") continue;
      const perCanFrames = getDecodeFramesForCan(rawNode, fr?.canId);
      const decoded = decoder?.decodeTransfer?.(
        fr?.canId,
        fr?.dataHex || "",
        fr?.dlc ?? 0,
        { recentFrames: perCanFrames.length ? perCanFrames : [fr], anchorTs: fr?.ts }
      );
      const uptimeField = Array.isArray(decoded?.fields)
        ? decoded.fields.find((f) => String(f?.name || "") === "uptime_sec")
        : null;
      const uptime = parseNumericPrefix(uptimeField?.value);
      if (Number.isFinite(uptime) && uptime >= 0) return uptime;
    }
    return null;
  }

  function applySlcanNodeSnapshot(status) {
    slcanRuntime.framesPerSecond = Number(status?.framesPerSecond || 0);
    slcanRuntime.errorFrames = Number(status?.errorCount || 0);
    const now = Date.now();
    const incomingNodes = Array.isArray(status?.nodes) ? status.nodes : [];
    if (incomingNodes.length > 0) {
      lastLiveSnapshotAt = now;
    }
    incomingNodes.forEach((rawNode) => cacheSnapshotFramesForNode(rawNode));
    const nextNodes = new Map();
    for (const rawNode of incomingNodes) {
      const registry = dronecanRegistry();
      const matched = registry?.matchDevice?.(rawNode) || null;
      const node = mkNode({
        ...rawNode,
        status: "online",
        stale: false,
        name: matched?.displayName || rawNode.displayName || rawNode.name || `Node ${rawNode.nodeId}`,
        rawName: rawNode.name || "",
        displayName: matched?.displayName || rawNode.displayName || rawNode.name || `Node ${rawNode.nodeId}`,
        deviceHint: matched?.deviceHint || rawNode.deviceHint || "Unknown",
        asciiHint: rawNode.asciiHint || "",
        recentFrames: Array.isArray(rawNode.recentFrames) ? rawNode.recentFrames : [],
        frameIdCounts: rawNode.frameIdCounts || {},
        source: rawNode.source || "MAVLink CAN_FRAME",
        hardwareVersion: matched?.hardwareVersion || rawNode.hardwareVersion || "DroneCAN",
        canonicalName: matched?.name || rawNode.name || "",
        softwareVersion: rawNode.softwareVersion || "live",
        uptimeSec: extractNodeStatusUptime(rawNode),
        dsdlData: buildNodeDsdlEntries({
          lastCanId: rawNode.lastCanId,
          lastDataHex: rawNode.lastDataHex,
          lastDlc: rawNode.lastDlc,
          dsdlData: {
            "transport.source": rawNode.source || "MAVLink CAN_FRAME",
            "device.raw_name": rawNode.name || "",
            "device.canonical_name": matched?.name || rawNode.name || "",
            "device.profile": matched?.profile || "unknown",
            "device.display_name": matched?.displayName || rawNode.displayName || rawNode.name || `Node ${rawNode.nodeId}`,
            "device.ascii_hint": rawNode.asciiHint || "",
            "frame.can_id": rawNode.lastCanId || "--",
            "frame.dlc": String(rawNode.lastDlc ?? 0),
            "frame.data": rawNode.lastDataHex || "--",
            "frame.count": String(rawNode.rxCount ?? 0),
            "frame.last_seen_ms": String(rawNode.lastSeenAt ?? 0),
          },
        }),
      });
      nextNodes.set(node.nodeId, node);
    }
    const shouldKeepCachedNodes =
      incomingNodes.length === 0
      && slcanRuntime.nodes.size > 0
      && (slcanSessionReady || (now - lastLiveSnapshotAt) <= nodeRetentionMs);
    if (shouldKeepCachedNodes) {
      slcanRuntime.nodes.forEach((cachedNode, nodeId) => {
        nextNodes.set(nodeId, mkNode({
          ...cachedNode,
          stale: true,
          status: "stale",
          uptimeSec: cachedNode.uptimeSec,
          dsdlData: buildNodeDsdlEntries(cachedNode),
        }));
      });
    }
    slcanRuntime.nodes = nextNodes;
  }

  async function pollSlcanTraffic() {
    if (isInspectorDemoMode()) return;
    if (!slcanSessionReady && !isSlcanAutotestMode()) return;
    if (slcanBoundPort === "mavlink" && !isGcsSerialConnected()) {
      slcanSessionReady = false;
      return;
    }
    if (shouldPollBrowserCan()) {
      applySlcanNodeSnapshot(getBrowserCanStatus());
      return;
    }
    try {
      const status = await bridgeJson("/slcan-nodes", null, { skipEnsure: true });
      applySlcanNodeSnapshot(status);
    } catch (e) {
      if (shouldPollBrowserCan() || (slcanBoundPort === "mavlink" && isGcsSerialConnected())) {
        applySlcanNodeSnapshot(getBrowserCanStatus());
        return;
      }
      throw e;
    }
  }

  function isInspectorDemoMode() {
    return /(?:\?|&)dc_demo=1(?:&|$)/.test(location.search);
  }

  function isSlcanAutotestMode() {
    return /(?:\?|&)dc_autotest=1(?:&|$)/.test(location.search);
  }

  const SLCAN_AUTOTEST_LINE = "T180444338000066412C004000000000C0";

  async function injectSlcanAutotestFrame() {
    if (!isSlcanAutotestMode()) return;
    try {
      await bridgeJson("/slcan-inject", { line: SLCAN_AUTOTEST_LINE });
    } catch (_) {
      // Bridge may be offline during local file:// preview.
    }
  }

  function demoInspectorNodes() {
    const now = Date.now();
    const batteryCanId = "0x18044433";
    const batteryPayload = "000066412C004000000000C0";
    return [
      mkNode({
        nodeId: 51,
        name: "DroneCAN Battery",
        displayName: "DroneCAN Battery",
        deviceHint: "Battery / BMS",
        source: "SLCAN Direct (demo)",
        status: "online",
        rxCount: 12,
        lastCanId: batteryCanId,
        lastDataHex: batteryPayload,
        lastDlc: 8,
        firstSeenAt: now - 60000,
        lastSeenAt: now,
        frameIdCounts: { [batteryCanId]: 12, "0x1401550A": 4 },
        recentFrames: [
          { ts: now, canId: batteryCanId, dlc: 8, dataHex: batteryPayload, bus: 1 },
        ],
      }),
    ];
  }

  function buildLiveNodes() {
    if (isInspectorDemoMode()) return demoInspectorNodes();
    return Array.from(slcanRuntime.nodes.values())
      .filter((node) => node.status === "online" || node.status === "stale")
      .sort((a, b) => a.nodeId - b.nodeId);
  }

  function ensureWorkbenchMarkup() {
    const panel = panelRoot();
    if (!panel || panel.querySelector(".sc-dc-workbench")) return;
    const page = panel.querySelector(".sc-page");
    if (!page) return;
    const oldSplit = page.querySelector(".sc-split");
    if (oldSplit) oldSplit.remove();

    const workbench = document.createElement("section");
    workbench.className = "sc-card sc-dc-workbench";
    workbench.innerHTML = `
      <div class="sc-dc-toolbar">
        <div class="sc-dc-toolbar-block">
          <div class="sc-dc-toolbar-eyebrow">${dcText("Transport mode", "传输模式")}</div>
          <div class="sc-dc-mode-tabs" role="tablist" aria-label="${dcText("DroneCAN modes", "DroneCAN 模式")}">
            <button type="button" class="sc-dc-mode-tab active" data-dc-mode="slcan">SLCAN 直连</button>
            <button type="button" class="sc-dc-mode-tab" data-dc-mode="can1">${dcText("MAVLink CAN1", "MAVLink CAN1")}</button>
            <button type="button" class="sc-dc-mode-tab" data-dc-mode="can2">${dcText("MAVLink CAN2", "MAVLink CAN2")}</button>
            <button type="button" class="sc-dc-mode-tab" data-dc-mode="filter">${dcText("Filter", "筛选")}</button>
            <button type="button" class="sc-dc-mode-tab" data-dc-mode="inspector">解析器</button>
            <button type="button" class="sc-dc-mode-tab" data-dc-mode="stats">统计</button>
          </div>
        </div>
        <div class="sc-dc-toolbar-card">
          <div class="sc-dc-toolbar-right">
            <label class="sc-dc-slcan-port-label">${dcText("SLCAN Port", "SLCAN 端口")}
              <div class="sc-dc-slcan-port-controls">
                <select id="sc-dc-slcan-port" class="sc-dc-slcan-port-select" title="${dcText("CUAV one USB exposes two virtual ports. Pick the non-MAVLink side.", "CUAV 一根 USB 会暴露两个虚拟口，请选非 MAVLink 的那一路")}"></select>
                <button type="button" id="sc-dc-auth-slcan2" class="sc-btn sc-btn-ghost sc-btn-sm" title="${dcText("Grant the second Web Serial lane in Chrome.", "在 Chrome 中授权第二路 Web Serial")}">${dcText("＋ Authorize 2nd", " ＋ 授权第二路")}</button>
              </div>
            </label>
            <label class="sc-dc-check sc-dc-check--control-row"><input type="checkbox" id="sc-dc-exit-slcan" checked> 离开时退出SLCAN？</label>
            <label class="sc-dc-check sc-dc-check--control-row"><input type="checkbox" id="sc-dc-log"> 记录log</label>
          </div>
        </div>
      </div>
      <div id="sc-dc-menu" class="sc-dc-menu" hidden>
        <button type="button" class="sc-dc-menu-item" data-dc-menu-action="parameters">Parameters</button>
        <button type="button" class="sc-dc-menu-item" data-dc-menu-action="restart">Restart</button>
        <button type="button" class="sc-dc-menu-item" data-dc-menu-action="update">Update</button>
      </div>
      <div id="sc-dc-modal-backdrop" class="sc-dc-modal-backdrop" hidden>
        <div class="sc-dc-modal" role="dialog" aria-modal="true" aria-labelledby="sc-dc-modal-title">
          <div class="sc-dc-modal-head">
            <div>
              <div id="sc-dc-modal-kicker" class="sc-dc-modal-kicker">${dcText("DroneCAN node tool", "DroneCAN 节点工具")}</div>
              <h3 id="sc-dc-modal-title" class="sc-dc-modal-title">Menu</h3>
            </div>
            <button type="button" id="sc-dc-modal-close" class="sc-btn sc-btn-ghost sc-btn-sm">${dcText("Close", "关闭")}</button>
          </div>
          <div id="sc-dc-modal-body" class="sc-dc-modal-body"></div>
        </div>
      </div>

      <div class="sc-dc-panel active" data-dc-panel="slcan">
        <div class="sc-dc-grid sc-dc-grid--single">
          <div class="sc-dc-main">
            <div class="sc-card-head">
              <h3>在线节点</h3>
              <div class="sc-btn-row">
                <button type="button" id="sc-dc-scan" class="sc-btn sc-btn-ghost sc-btn-sm">刷新</button>
              </div>
            </div>
            <div class="sc-table-wrap sc-dc-node-table-wrap">
              <table class="sc-dsdl-table sc-dc-node-table" id="sc-dc-node-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>编号</th>
                    <th>名称</th>
                    <th>模式</th>
                    <th>健康</th>
                    <th>运行时常</th>
                    <th>${dcText("HW Version", "硬件版本")}</th>
                    <th>软件版本</th>
                    <th>软件CRC</th>
                    <th>菜单</th>
                  </tr>
                </thead>
                <tbody id="sc-dc-node-body"></tbody>
              </table>
            </div>
            <div class="sc-dc-node-detail-band">
              <div class="sc-dc-band-grid">
                <div class="sc-dc-band-row">
                  <div class="sc-dc-band-label">${dcText("Node", "节点")}</div>
                  <div class="sc-dc-band-row-values">
                    <div id="sc-dc-band-id" class="sc-dc-band-value">-</div>
                    <div id="sc-dc-band-name" class="sc-dc-band-value">-</div>
                  </div>
                </div>
                <div class="sc-dc-band-row">
                  <div class="sc-dc-band-label">${dcText("State", "状态")}</div>
                  <div class="sc-dc-band-row-values sc-dc-band-row-values-3">
                    <div id="sc-dc-band-mode" class="sc-dc-band-value">-</div>
                    <div id="sc-dc-band-health" class="sc-dc-band-value">-</div>
                    <div id="sc-dc-band-uptime" class="sc-dc-band-value">-</div>
                  </div>
                </div>
                <div class="sc-dc-band-row">
                  <div class="sc-dc-band-label">${dcText("Vendor code", "厂商码")}</div>
                  <div class="sc-dc-band-row-values">
                    <div id="sc-dc-band-vendor" class="sc-dc-band-value sc-dc-band-value-wide">-</div>
                  </div>
                </div>
                <div class="sc-dc-band-row">
                  <div class="sc-dc-band-label">${dcText("Software", "软件")}</div>
                  <div class="sc-dc-band-row-values">
                    <div id="sc-dc-band-sw" class="sc-dc-band-value">-</div>
                    <div id="sc-dc-band-crc" class="sc-dc-band-value">-</div>
                  </div>
                </div>
                <div class="sc-dc-band-row">
                  <div class="sc-dc-band-label">${dcText("Hardware", "硬件")}</div>
                  <div class="sc-dc-band-row-values">
                    <div id="sc-dc-band-hw" class="sc-dc-band-value">-</div>
                    <div id="sc-dc-band-uid" class="sc-dc-band-value">-</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <div class="sc-dc-panel" data-dc-panel="can1"><div class="sc-dc-mini-grid"><div class="sc-subcard"><h4>${dcText("MAVLink CAN1", "MAVLink CAN1")}</h4><dl id="sc-dc-can1-meta" class="sc-dl"></dl></div><div class="sc-subcard"><h4>${dcText("Topology", "拓扑")}</h4><div class="sc-topology-host"><svg id="sc-dc-svg" viewBox="0 0 420 420" class="sc-dc-svg" aria-label="${dcText("DroneCAN topology", "DroneCAN 拓扑")}"></svg></div></div></div></div>
      <div class="sc-dc-panel" data-dc-panel="can2"><div class="sc-dc-mini-grid"><div class="sc-subcard"><h4>${dcText("MAVLink CAN2", "MAVLink CAN2")}</h4><dl id="sc-dc-can2-meta" class="sc-dl"></dl></div><div class="sc-subcard"><h4>${dcText("Status", "状态")}</h4><p class="sc-prose sc-prose--sm" id="sc-dc-can2-note">${dcText("CAN2 info is still MAVLink-routed metadata only.", "CAN2 仍仅显示 MAVLink 路由的元数据。")}</p></div></div></div>
      <div class="sc-dc-panel" data-dc-panel="filter"><div class="sc-dc-filter-grid"><div class="sc-subcard"><h4>${dcText("Filter", "筛选")}</h4><label class="sc-field"><span>${dcText("Filter by name / node ID", "按名称或节点 ID 筛选")}</span><input id="sc-dc-filter-input" type="search" placeholder="${dcText("e.g. 10 / ardupilot", "例如 10 / ardupilot")}"></label><label class="sc-field"><span>${dcText("Health", "健康")}</span><select id="sc-dc-health-filter"><option value="all">${dcText("All", "全部")}</option><option value="online">${dcText("Online only", "仅在线")}</option><option value="offline">${dcText("Offline only", "仅离线")}</option></select></label></div><div class="sc-subcard"><h4>${dcText("Filtered results", "筛选结果")}</h4><div class="sc-table-wrap sc-dc-node-table-wrap"><table class="sc-dsdl-table sc-dc-node-table"><thead><tr><th>${dcText("ID", "编号")}</th><th>${dcText("Name", "名称")}</th><th>${dcText("Mode", "模式")}</th><th>${dcText("Health", "健康")}</th><th>${dcText("Source", "来源")}</th></tr></thead><tbody id="sc-dc-filter-body"></tbody></table></div></div></div></div>
      <div class="sc-dc-panel" data-dc-panel="inspector">
        <div class="sc-dc-inspector-grid">
          <div class="sc-subcard">
            <h4>${dcText("Node tree", "节点树")}</h4>
            <div id="sc-dc-inspector-summary" class="sc-prose sc-prose--sm"></div>
            <div id="sc-dc-inspector-tree" class="sc-dc-tree"></div>
          </div>
          <div class="sc-subcard">
            <h4>${dcText("Selected message", "已选消息")}</h4>
            <div id="sc-dc-inspector-evidence" class="sc-prose sc-prose--sm"></div>
            <div id="sc-dc-inspector-detail" class="sc-dc-inspector-detail"></div>
          </div>
        </div>
      </div>
      <div class="sc-dc-panel" data-dc-panel="stats"><div class="sc-dc-stats-grid"><div class="sc-subcard"><h4>${dcText("Online nodes", "在线节点")}</h4><div id="sc-dc-stat-nodes" class="sc-dc-stat-value">0</div></div><div class="sc-subcard"><h4>${dcText("Active buses", "活跃总线")}</h4><div id="sc-dc-stat-buses" class="sc-dc-stat-value">0</div></div><div class="sc-subcard"><h4>${dcText("SLCAN Port", "SLCAN 端口")}</h4><div id="sc-dc-stat-slcan" class="sc-dc-stat-value">-</div></div><div class="sc-subcard"><h4>${dcText("FC Node ID", "飞控节点 ID")}</h4><div id="sc-dc-stat-fcnode" class="sc-dc-stat-value">0</div></div></div></div>
    `;
    page.appendChild(workbench);
  }

  function ensureExtraStyles() {
    if ($("sc-dc-workbench-style")) return;
    const style = document.createElement("style");
    style.id = "sc-dc-workbench-style";
    style.textContent = `
      .sc-dc-workbench { margin-top:14px; position:relative; overflow:hidden; padding:18px; border-radius:18px; background:linear-gradient(180deg, rgba(18, 24, 38, 0.96), rgba(14, 19, 31, 0.98)); border:1px solid rgba(84, 99, 130, 0.34); box-shadow:0 22px 50px rgba(0,0,0,0.24); }
      .sc-dc-workbench::before {
        content:"";
        position:absolute;
        inset:-1px;
        pointer-events:none;
        background:
          radial-gradient(1100px 380px at 15% 0%, rgba(161, 200, 67, 0.13), transparent 55%),
          radial-gradient(780px 300px at 86% 0%, rgba(61, 109, 255, 0.08), transparent 60%);
        opacity:0.9;
      }
      .sc-dc-toolbar, .sc-dc-hint-row { display:flex; gap:14px; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; position:relative; z-index:1; }
      .sc-dc-toolbar { margin-bottom:14px; }
      .sc-dc-toolbar-block, .sc-dc-toolbar-card { min-width:min(100%, 320px); display:grid; gap:10px; }
      .sc-dc-toolbar-card { flex:1 1 420px; padding:12px 14px; border-radius:14px; background:rgba(14, 21, 34, 0.78); border:1px solid rgba(71, 87, 115, 0.44); box-shadow:inset 0 1px 0 rgba(255,255,255,0.03); }
      .sc-dc-toolbar-eyebrow { color:#8ea4cb; font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; }
      .sc-dc-mode-tabs { display:flex; gap:8px; flex-wrap:wrap; }
      .sc-dc-mode-tabs .sc-dc-mode-tab {
        position:relative;
        background:linear-gradient(180deg, rgba(42, 52, 73, 0.96), rgba(25, 33, 49, 0.98)) !important;
        color:#d7e4ff !important;
        border:1px solid rgba(90, 111, 148, 0.48) !important;
        border-radius:999px;
        padding:8px 14px;
        font-size:12px;
        font-weight:600;
        cursor:pointer;
        transition:transform .18s ease, box-shadow .18s ease, background .18s ease, color .18s ease, border-color .18s ease;
      }
      .sc-dc-mode-tabs .sc-dc-mode-tab:hover { transform:translateY(-1px); box-shadow:0 10px 22px rgba(0,0,0,.18); border-color:rgba(126, 164, 231, 0.52) !important; }
      .sc-dc-mode-tabs .sc-dc-mode-tab.active {
        background:linear-gradient(180deg, #d8ef88, #b8d856) !important;
        color:#122002 !important;
        border-color:#d9ef8f !important;
        box-shadow:0 12px 28px rgba(142, 180, 56, 0.26);
      }
      .sc-dc-mode-tabs .sc-dc-mode-tab.active::after {
        content:"";
        position:absolute;
        left:14px;
        right:14px;
        bottom:-6px;
        height:2px;
        border-radius:999px;
        background:linear-gradient(90deg, transparent, #dff57d, transparent);
      }
      .sc-dc-toolbar-right { display:flex; gap:12px; align-items:center; color:#d5dcf0; font-size:12px; position:relative; z-index:1; flex-wrap:wrap; min-height:40px; }
      .sc-dc-slcan-port-label { display:grid; gap:6px; align-content:center; color:#b9c7e4; font-weight:600; margin:0; }
      .sc-dc-slcan-port-controls { display:flex; gap:12px; align-items:center; }
      .sc-dc-slcan-port-select { min-width: 220px; max-width: 280px; background:#121a2a; color:#e8edf8; border:1px solid #4a5c7d; border-radius:10px; padding:7px 10px; font-size:12px; }
      .sc-dc-slcan-port-select option { background:#1a2235; color:#e8edf8; }
      .sc-dc-toolbar-right .sc-btn { align-self:center; min-height:36px; display:inline-flex; align-items:center; justify-content:center; }
      #sc-dc-auth-slcan2 { color:#f5eaf5; }
      .sc-dc-check { display:inline-flex; gap:6px; align-items:center; min-height:36px; padding:0 2px; margin:0; line-height:1; }
      .sc-dc-check--control-row { align-self:end; }
      .sc-dc-check input { margin:0; align-self:center; }
      .sc-dc-hint-row { padding:12px 14px 14px; border:1px solid rgba(70, 84, 112, 0.42); border-radius:14px; background:rgba(13, 18, 30, 0.7); margin-bottom:14px; }
      .sc-dc-hint-row--bar { flex:1 1 520px; align-self:stretch; margin-bottom:0; padding:10px 14px; }
      #sc-dc-transport-badge { position:relative; overflow:hidden; }
      #sc-dc-transport-badge.sc-dc-live { box-shadow:0 0 0 1px rgba(224, 245, 125, .34), 0 0 24px rgba(224, 245, 125, .12); }
      .sc-dc-menu { position:fixed; z-index:2200; min-width:210px; max-width:min(320px, calc(100vw - 24px)); background:#121827; border:1px solid #39445f; border-radius:10px; box-shadow:0 18px 42px rgba(0,0,0,0.35); padding:6px; display:grid; gap:4px; }
      .sc-dc-menu[hidden] { display:none; }
      .sc-dc-menu-item { text-align:left; background:#182133; color:#e5ebf6; border:1px solid transparent; border-radius:8px; padding:9px 10px; font-size:12px; cursor:pointer; transition:background .16s ease, border-color .16s ease, transform .16s ease; }
      .sc-dc-menu-item:hover { background:#22314b; border-color:#4a5c7d; }
      .sc-dc-menu-item:hover, .sc-dc-row:hover, .sc-dc-tree-row:hover { transform:translateY(-1px); }
      .sc-dc-menu-item[disabled] { opacity:0.45; cursor:not-allowed; transform:none; }
      .sc-dc-modal-backdrop { position:fixed; inset:0; z-index:2300; display:grid; place-items:center; padding:24px; background:rgba(5, 10, 18, 0.66); backdrop-filter:blur(8px); }
      .sc-dc-modal-backdrop[hidden] { display:none; }
      .sc-dc-modal { width:min(760px, calc(100vw - 28px)); max-height:min(88vh, 900px); overflow:auto; border-radius:18px; border:1px solid rgba(91, 108, 140, 0.46); background:linear-gradient(180deg, rgba(17, 23, 36, 0.99), rgba(11, 16, 27, 0.99)); box-shadow:0 28px 80px rgba(0,0,0,0.46); }
      .sc-dc-modal-head { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; padding:18px 20px 14px; border-bottom:1px solid rgba(60, 75, 103, 0.42); }
      .sc-dc-modal-kicker { color:#90a6cc; font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; margin-bottom:4px; }
      .sc-dc-modal-title { margin:0; font-size:20px; color:#eef4ff; }
      .sc-dc-modal-body { padding:18px 20px 20px; display:grid; gap:16px; color:#dce5f5; }
      .sc-dc-modal-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:14px; }
      .sc-dc-modal-card { border:1px solid rgba(67, 84, 114, 0.4); border-radius:14px; background:rgba(18, 24, 38, 0.8); padding:14px; display:grid; gap:12px; min-width:0; }
      .sc-dc-modal-card h4 { margin:0; color:#eef4ff; font-size:15px; }
      .sc-dc-modal-form { display:grid; gap:12px; }
      .sc-dc-modal-field { display:grid; gap:6px; }
      .sc-dc-modal-field span { color:#94a9ce; font-size:12px; }
      .sc-dc-modal-field input, .sc-dc-modal-field select { width:100%; min-width:0; box-sizing:border-box; background:#0f1625; color:#edf3ff; border:1px solid #44536f; border-radius:10px; padding:9px 10px; font-size:13px; }
      .sc-dc-modal-actions { display:flex; gap:10px; flex-wrap:wrap; }
      .sc-dc-modal-note, .sc-dc-modal-status { margin:0; color:#90a4c9; font-size:12px; line-height:1.6; }
      .sc-dc-modal-status.ok { color:#9fe0a9; }
      .sc-dc-modal-status.warn { color:#f2c879; }
      .sc-dc-modal-status.err { color:#ff9b9b; }
      .sc-dc-inline-kv { display:grid; grid-template-columns:minmax(120px, 160px) minmax(0, 1fr); gap:8px 10px; align-items:start; }
      .sc-dc-inline-kv dt, .sc-dc-inline-kv dd { margin:0; }
      .sc-dc-inline-kv dt { color:#8fa3c8; }
      .sc-dc-inline-kv dd { color:#eef4ff; font-family:var(--sc-mono); word-break:break-word; overflow-wrap:anywhere; }
      .sc-dc-progress-wrap { display:grid; gap:8px; }
      .sc-dc-progress-row { display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:12px; color:#dce6f8; }
      .sc-dc-progress-bar { height:12px; border-radius:999px; overflow:hidden; background:#162032; border:1px solid rgba(73, 92, 122, 0.5); }
      .sc-dc-progress-fill { height:100%; width:0%; background:linear-gradient(90deg, #7fd85c, #d7ef79); transition:width .18s ease; }
      .sc-dc-checkline { display:flex; align-items:center; gap:8px; font-size:13px; color:#dbe5f4; }
      .sc-dc-fileline { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
      .sc-dc-fileline input[type="file"] { max-width:100%; }
      .sc-dc-grid { display:grid; grid-template-columns:minmax(0, 1.58fr) minmax(340px, 0.8fr); gap:16px; align-items:start; }
      .sc-dc-grid--single { grid-template-columns:minmax(0, 1fr); }
      .sc-dc-mini-grid, .sc-dc-filter-grid, .sc-dc-inspector-grid, .sc-dc-stats-grid { display:grid; gap:14px; }
      .sc-dc-mini-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); }
      .sc-dc-filter-grid { grid-template-columns:minmax(300px, 0.9fr) minmax(0, 1.1fr); }
      .sc-dc-inspector-grid { grid-template-columns:minmax(520px, 1.35fr) minmax(0, 0.9fr); }
      .sc-dc-stats-grid { grid-template-columns:repeat(4, minmax(0, 1fr)); }
      .sc-dc-panel { display:none; }
      .sc-dc-panel.active { display:block; }
      .sc-dc-main, .sc-dc-side { min-width:0; }
      .sc-dc-node-table-wrap { max-height:360px; overflow:auto; scrollbar-gutter:stable; border:1px solid rgba(63, 76, 102, 0.48); border-radius:14px; background:rgba(12, 17, 29, 0.72); }
      .sc-dc-node-table thead th { position:sticky; top:0; z-index:1; background:#182033; }
      .sc-dc-row { cursor:pointer; transition:background .16s ease, transform .16s ease; }
      .sc-dc-row-marker { width:18px; text-align:center; color:#a8bbdf; font-size:12px; }
      .sc-dc-row:hover td { background:rgba(144, 182, 58, 0.1); }
      .sc-dc-row.active td { background:rgba(144, 182, 58, 0.18); }
      .sc-dc-node-detail-band { margin-top:14px; border:1px solid rgba(74, 92, 125, 0.42); border-radius:16px; background:linear-gradient(180deg, rgba(20, 28, 43, 0.96), rgba(14, 21, 34, 0.96)); padding:14px; box-shadow:inset 0 1px 0 rgba(255,255,255,0.03); }
      .sc-dc-band-head { display:grid; gap:4px; margin-bottom:12px; }
      .sc-dc-band-head h4 { margin:0; font-size:14px; color:#eef4ff; }
      .sc-dc-band-head p { margin:0; color:#8ea2c8; font-size:12px; }
      .sc-dc-band-grid { display:grid; gap:8px; }
      .sc-dc-band-row { display:grid; grid-template-columns:210px minmax(0, 1fr); gap:10px; align-items:center; }
      .sc-dc-band-row-values { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:10px; min-width:0; }
      .sc-dc-band-row-values-3 { grid-template-columns:repeat(3, minmax(0, 1fr)); }
      .sc-dc-band-label, .sc-dc-band-value { min-height:24px; display:flex; align-items:center; padding:0; font-size:12px; transition:background-color .18s ease, box-shadow .18s ease, transform .18s ease; }
      .sc-dc-band-label { color:#8ea2c8; font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; }
      .sc-dc-band-value { min-height:34px; padding:7px 12px; border-radius:10px; background:rgba(255,255,255,0.04); border:1px solid rgba(77, 93, 121, 0.36); color:#ffffff; font-family:var(--sc-mono); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
      .sc-dc-band-value-wide { grid-column:1 / -1; }
      #sc-dc-node-meta {
        display:grid;
        grid-template-columns:minmax(140px, 44%) minmax(0, 1fr);
        gap:6px 12px;
        margin:0;
      }
      #sc-dc-node-meta dt, #sc-dc-node-meta dd { margin:0; min-height:24px; display:flex; align-items:center; }
      #sc-dc-node-meta dt { color:#8ea2c8; white-space:nowrap; }
      #sc-dc-node-meta dd { color:#f2f6ff; font-family:var(--sc-mono); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .sc-dc-log-wrap { margin-top:14px; max-height:180px; border:1px solid rgba(63, 76, 102, 0.38); border-radius:14px; background:rgba(12, 17, 29, 0.64); }
      .sc-dc-side { position:sticky; top:18px; display:grid; gap:14px; }
      .sc-dc-side .sc-subcard { border-radius:16px; background:linear-gradient(180deg, rgba(18, 25, 40, 0.98), rgba(13, 19, 31, 0.98)); border:1px solid rgba(73, 89, 118, 0.4); box-shadow:0 14px 28px rgba(0,0,0,0.14); }
      .sc-dc-side .sc-subcard h4 { margin-bottom:12px; }
      .sc-dc-tree { max-height:620px; overflow:auto; padding:4px 0; border:1px solid #2c3550; border-radius:12px; background:#101624; scrollbar-gutter:stable; }
      .sc-dc-tree-list, .sc-dc-tree-branch { list-style:none; margin:0; padding:0; }
      .sc-dc-tree-row { display:flex; align-items:center; gap:10px; min-height:34px; width:100%; background:transparent; color:#e6ecf6; border:0; border-radius:8px; padding:7px 10px; cursor:pointer; text-align:left; transition:background .16s ease, box-shadow .16s ease, transform .16s ease; }
      .sc-dc-tree-row:hover { background:#1a2337; }
      .sc-dc-tree-row.active { background:#24314b; box-shadow:inset 0 0 0 1px #4a5d82; }
      .sc-dc-tree-node { padding:2px 8px; }
      .sc-dc-tree-branch { display:none; margin-left:18px; padding-left:10px; border-left:1px solid #2f3b58; }
      .sc-dc-tree-node.open > .sc-dc-tree-branch { display:block; }
      .sc-dc-tree-caret { width:14px; color:#8da0bf; flex:0 0 14px; text-align:center; }
      .sc-dc-tree-caret.blank { visibility:hidden; }
      .sc-dc-tree-title { flex:1 1 auto; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .sc-dc-tree-meta { flex:0 0 auto; color:#8da0bf; font-size:12px; white-space:nowrap; }
      .sc-dc-tree-kind { display:inline-flex; align-items:center; min-width:58px; justify-content:center; padding:2px 7px; border-radius:999px; background:#1c2940; color:#9fc1ff; font-size:11px; transition:background .16s ease, color .16s ease; }
      .sc-dc-tree-empty { padding:6px 12px 6px 28px; color:#8da0bf; font-size:12px; list-style:none; }
      .sc-dc-inspector-detail { min-height:420px; border:1px solid #2c3550; border-radius:12px; background:#101624; padding:14px; overflow:auto; scrollbar-gutter:stable; }
      .sc-dc-kv { display:grid; grid-template-columns:minmax(108px, 34%) 1fr; gap:6px 12px; margin:0; font-size:12px; }
      .sc-dc-kv dt { margin:0; color:#9fb0cf; white-space:nowrap; }
      .sc-dc-kv dd { margin:0; color:#e8edf8; font-family:var(--sc-mono); word-break:break-all; }
      .sc-dc-inspector-section { margin-bottom:14px; }
      .sc-dc-type-banner { padding:12px; border:1px solid #3d5278; border-radius:10px; background:linear-gradient(180deg, #17233d, #10182b); box-shadow:0 10px 28px rgba(0,0,0,0.16); }
      .sc-dc-type-title { margin:0 0 4px; font-size:18px; color:#e8f0ff; font-weight:600; }
      .sc-dc-type-full { margin:0 0 6px; font-family:var(--sc-mono); font-size:12px; color:#9fc1ff; word-break:break-all; }
      .sc-dc-type-meta { margin:0; font-size:12px; color:#8da0bf; }
      .sc-dc-inspector-section h5 { margin:0 0 8px; font-size:12px; color:#9fb0cf; font-weight:600; letter-spacing:0.02em; text-transform:uppercase; }
      .sc-dc-field-table { width:100%; border-collapse:collapse; font-size:12px; }
      .sc-dc-field-table th, .sc-dc-field-table td { border-bottom:1px solid #24304a; padding:6px 8px; text-align:left; vertical-align:top; }
      .sc-dc-field-table th { color:#8da0bf; font-weight:500; width:42%; }
      .sc-dc-field-table td { color:#eef3fb; font-family:var(--sc-mono); word-break:break-word; }
      .sc-dc-field-note { display:block; color:#7f8da8; font-size:11px; margin-top:2px; font-family:var(--sc-sans, inherit); }
      .sc-dc-tree-row.active-message { background:#2a3a58; box-shadow:inset 0 0 0 1px #6f8ec8; }
      .sc-dc-stat-value {
        min-height:40px;
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:24px;
        font-weight:700;
        letter-spacing:0.02em;
        color:#f0f5ff;
        background:linear-gradient(180deg, rgba(25, 35, 54, 0.88), rgba(17, 25, 40, 0.96));
        border-radius:12px;
        box-shadow:inset 0 0 0 1px rgba(255,255,255,0.03);
        transition:transform .18s ease, box-shadow .18s ease, background-color .18s ease;
      }
      .sc-dc-live-flash { animation:sc-dc-flash .42s ease-out; }
      @keyframes sc-dc-flash {
        0% { transform:translateY(0); filter:brightness(1); }
        35% { transform:translateY(-1px); filter:brightness(1.18); }
        100% { transform:translateY(0); filter:brightness(1); }
      }
      @keyframes sc-dc-pulse {
        0%, 100% { box-shadow:0 0 0 0 rgba(224, 245, 125, 0.18); }
        50% { box-shadow:0 0 0 8px rgba(224, 245, 125, 0); }
      }
      #sc-dc-transport-badge.sc-dc-live { animation:sc-dc-pulse 2.8s ease-in-out infinite; }
      @media (max-width: 980px) {
        .sc-dc-grid, .sc-dc-mini-grid, .sc-dc-filter-grid, .sc-dc-inspector-grid, .sc-dc-stats-grid { grid-template-columns:1fr; }
        .sc-dc-modal-grid { grid-template-columns:1fr; }
        .sc-dc-band-row { grid-template-columns:1fr; gap:6px; }
        .sc-dc-band-row-values, .sc-dc-band-row-values-3 { grid-template-columns:1fr; }
        .sc-dc-side { position:static; }
        .sc-dc-toolbar-card, .sc-dc-toolbar-block { min-width:100%; }
      }
    `;
    document.head.appendChild(style);
  }

  function refreshDroneCanModel() {
    canNodes = buildLiveNodes();
    if (!canNodes.some((n) => n.nodeId === selectedCanId)) {
      selectedCanId = canNodes[0]?.nodeId ?? 0;
    }
    const fcCan = getFlightControllerCanIdentity();
    const observedStats = currentMode === "inspector" ? computeObservedFrameStats(canNodes) : null;
    const fps = observedStats ? observedStats.fps : slcanRuntime.framesPerSecond;
    const loadPct = observedStats ? observedStats.loadPct : Math.min(100, Math.round((fps / 1000) * 100));
    setLiveText("sc-dc-load", `${loadPct}%`);
    setLiveText("sc-dc-fps", String(fps));
    setLiveText("sc-dc-err", String(slcanRuntime.errorFrames));
    setLiveText("sc-dc-stat-nodes", String(canNodes.length));
    setLiveText("sc-dc-stat-buses", String(slcanSessionReady ? 1 : 0));
    setLiveText("sc-dc-stat-slcan", detectSlcanAdapterPort() || "-");
    setLiveText("sc-dc-stat-fcnode", String(fcCan.nodeId));
    const transportBadge = $("sc-dc-transport-badge");
    if (transportBadge) {
      transportBadge.classList.toggle("sc-dc-live", !!slcanSessionReady);
      setLiveText(
        "sc-dc-transport-badge",
        slcanSessionReady
          ? `SLCAN 直连${detectSlcanAdapterPort() ? ` · ${detectSlcanAdapterPort()}` : ""}`
          : "SLCAN 直连",
      );
    }
    if (currentMode === "slcan" && slcanSessionReady && $("sc-dc-hint")) {
      const adapterPort = detectSlcanAdapterPort();
      if (slcanBoundPort === "webserial") {
        $("sc-dc-hint").textContent = "SLCAN 直连（Chrome 第二路 Web Serial，无需 GCS.cmd）。顶部保持 MAVLink 连接；本页显示 SLCAN 监听到的节点。";
      } else if (adapterPort) {
        $("sc-dc-hint").textContent = `SLCAN 直连（COM 桥 ${adapterPort}）。顶部 MAVLink 与 DroneCAN 各走一路 USB，由 GCS.cmd 提供 8765 桥接。`;
      }
    }
  }

  function renderNodeTable() {
    const tbody = $("sc-dc-node-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    canNodes.forEach((node) => {
      const tr = document.createElement("tr");
      tr.className = `sc-dc-row${node.nodeId === selectedCanId ? " active" : ""}`;
      tr.innerHTML = `<td class="sc-dc-row-marker">${node.nodeId === selectedCanId ? "◉" : "○"}</td><td>${node.nodeId}</td><td>${node.name}</td><td>${nodeMode(node)}</td><td>${nodeHealth(node)}</td><td>${nodeUptime(node)}</td><td>${hardwareVersionForNode(node)}</td><td>${softwareVersionForNode(node)}</td><td>${nodeCrc(node)}</td><td><button type="button" class="sc-btn sc-btn-ghost sc-btn-sm" data-dc-menu-node="${node.nodeId}" onclick="event.stopPropagation(); window.openDronecanNodeMenu?.(${node.nodeId}, this);">设置菜单</button></td>`;
      tr.addEventListener("click", () => selectCanNode(node.nodeId));
      tbody.appendChild(tr);
    });
  }

  function hideNodeMenu() {
    const menu = $("sc-dc-menu");
    if (menu) menu.hidden = true;
    menuNodeId = 0;
  }

  function showNodeMenu(nodeId, anchorEl) {
    const menu = $("sc-dc-menu");
    if (!menu || !anchorEl) return;
    menuNodeId = nodeId;
    const node = canNodes.find((item) => item.nodeId === nodeId) || null;
    const paramBtn = menu.querySelector('[data-dc-menu-action="parameters"]');
    if (paramBtn) {
      const disableParams = !nodeSupportsDronecanParameters(node);
      paramBtn.disabled = disableParams;
      paramBtn.title = disableParams
        ? dcText("Flight controller and GCS nodes do not expose DroneCAN parameters.", "飞控和 GCS 节点不暴露 DroneCAN 参数。")
        : "";
    }
    const rect = anchorEl.getBoundingClientRect();
    menu.style.left = `${Math.max(12, Math.round(rect.left))}px`;
    menu.style.top = `${Math.round(rect.bottom + 6)}px`;
    menu.hidden = false;
  }

  function toggleNodeMenu(nodeId, anchorEl) {
    const targetId = Number(nodeId || 0);
    if (!targetId || !anchorEl) return;
    if (menuNodeId === targetId && !$("sc-dc-menu")?.hidden) hideNodeMenu();
    else showNodeMenu(targetId, anchorEl);
  }

  async function copyTextValue(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(String(text));
        return true;
      }
    } catch (_) {
      // fall through
    }
    return false;
  }

  function getSelectedNode() {
    return canNodes.find((n) => n.nodeId === menuNodeId || n.nodeId === selectedCanId) || canNodes[0] || null;
  }

  function nodeSupportsDronecanParameters(node) {
    const nodeId = Number(node?.nodeId || 0);
    const name = String(node?.name || "").toLowerCase();
    const title = String(node?.title || "").toLowerCase();
    const hint = String(node?.deviceHint || "").toLowerCase();
    if (nodeId === GCS_NODE_ID || nodeId === 127) return false;
    if (name.includes("ground station") || title.includes("ground station") || hint.includes("ground station")) return false;
    if (name === "org.ardupilot" || name.includes("flight controller") || title.includes("flight controller") || hint.includes("autopilot")) return false;
    return true;
  }

  function escapeHtml(text) {
    return String(text ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function paramStorageKey(nodeId) {
    return `${DC_LOCAL_CONFIG_KEY}.node.${Number(nodeId || 0)}`;
  }

  function paramDraftKey(nodeId, index) {
    return `${Number(nodeId || 0)}:${Number(index || 0)}`;
  }

  function cacheEntryForNode(nodeId) {
    const key = Number(nodeId || 0);
    if (!dcMenuState.paramCache.has(key)) {
      dcMenuState.paramCache.set(key, { params: [], loadedAt: 0, loading: false, error: "" });
    }
    return dcMenuState.paramCache.get(key);
  }

  function getParamDraft(nodeId, index) {
    return dcMenuState.paramDrafts.get(paramDraftKey(nodeId, index));
  }

  function setParamDraft(nodeId, index, value) {
    dcMenuState.paramDrafts.set(paramDraftKey(nodeId, index), value);
  }

  function clearParamDraft(nodeId, index) {
    dcMenuState.paramDrafts.delete(paramDraftKey(nodeId, index));
  }

  function localParamSnapshot(nodeId) {
    const entry = cacheEntryForNode(nodeId);
    return {
      nodeId: Number(nodeId || 0),
      savedAt: Date.now(),
      params: (entry.params || []).map((param) => ({
        index: param.index,
        name: param.name,
        type: param.type,
        value: getParamDraft(nodeId, param.index) !== undefined ? getParamDraft(nodeId, param.index) : param.value,
      })),
    };
  }

  function saveLocalNodeParameters(nodeId) {
    try {
      localStorage.setItem(paramStorageKey(nodeId), JSON.stringify(localParamSnapshot(nodeId)));
      dcMenuState.paramLoadedFromLocal = false;
      return true;
    } catch (_) {
      return false;
    }
  }

  function loadLocalNodeParameters(nodeId) {
    try {
      const raw = localStorage.getItem(paramStorageKey(nodeId));
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      const params = Array.isArray(parsed?.params) ? parsed.params : [];
      Array.from(dcMenuState.paramDrafts.keys()).forEach((key) => {
        if (key.startsWith(`${Number(nodeId || 0)}:`)) dcMenuState.paramDrafts.delete(key);
      });
      params.forEach((param) => {
        if (param && Number.isFinite(Number(param.index))) {
          setParamDraft(nodeId, Number(param.index), param.value);
        }
      });
      dcMenuState.paramLoadedFromLocal = true;
      return params.length > 0;
    } catch (_) {
      return false;
    }
  }

  function closeDcModal() {
    const backdrop = $("sc-dc-modal-backdrop");
    if (backdrop) backdrop.hidden = true;
    dcMenuState.activeModal = "";
  }

  function setModalStatus(text, tone = "") {
    const el = $("sc-dc-modal-status");
    if (!el) return;
    el.className = `sc-dc-modal-status${tone ? ` ${tone}` : ""}`;
    el.textContent = text || "";
  }

  function setUpdateProgress(percent, text) {
    const pct = Math.max(0, Math.min(100, Number(percent) || 0));
    const fill = $("sc-dc-update-fill");
    const label = $("sc-dc-update-pct");
    const step = $("sc-dc-update-step");
    if (fill) fill.style.width = `${pct}%`;
    if (label) label.textContent = `${pct}%`;
    if (step && text != null) step.textContent = String(text);
  }

  function formatParamValue(value, type) {
    if (type === "empty" || value == null) return "—";
    if (type === "boolean") return value ? "true" : "false";
    if (type === "real") return Number.isFinite(Number(value)) ? String(Number(value)) : String(value);
    return String(value);
  }

  function valuesEqual(a, b) {
    if (typeof a === "number" || typeof b === "number") {
      const an = Number(a);
      const bn = Number(b);
      if (Number.isFinite(an) && Number.isFinite(bn)) return Math.abs(an - bn) < 1e-6;
    }
    return String(a) === String(b);
  }

  function paramKindLabel(type) {
    if (type === "integer") return "int64";
    if (type === "real") return "float32";
    if (type === "boolean") return "bool";
    if (type === "string") return "string";
    return "empty";
  }

  function parseDraftByType(type, raw) {
    const text = String(raw ?? "");
    if (type === "boolean") return text === "true" || text === "1";
    if (type === "integer") {
      const n = Number.parseInt(text.trim(), 10);
      if (!Number.isFinite(n)) throw new Error("Invalid integer value");
      return n;
    }
    if (type === "real") {
      const n = Number(text.trim());
      if (!Number.isFinite(n)) throw new Error("Invalid float value");
      return n;
    }
    if (type === "string") return text;
    return null;
  }

  function bitsFromBytes(bytes) {
    return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []))
      .map((b) => b.toString(2).padStart(8, "0"))
      .join("");
  }

  function bytesFromBits(bits) {
    let stream = String(bits || "");
    if (stream.length % 8) stream += "0".repeat(8 - (stream.length % 8));
    const out = new Uint8Array(stream.length / 8);
    for (let i = 0; i < out.length; i += 1) {
      out[i] = Number.parseInt(stream.slice(i * 8, i * 8 + 8), 2);
    }
    return out;
  }

  function leFromBeBits(bits, bitlen) {
    let stream = String(bits || "");
    if (stream.length < bitlen) throw new Error(`Not enough bits: need ${bitlen}, got ${stream.length}`);
    if (stream.length > bitlen) stream = stream.slice(stream.length - bitlen);
    const chunks = [];
    for (let i = stream.length; i > 0; i -= 8) chunks.push(stream.slice(Math.max(0, i - 8), i));
    return chunks.join("");
  }

  function beFromLeBits(bits, bitlen) {
    let stream = String(bits || "");
    if (stream.length < bitlen) throw new Error(`Not enough bits: need ${bitlen}, got ${stream.length}`);
    if (stream.length > bitlen) stream = stream.slice(0, bitlen);
    const chunks = [];
    for (let i = 0; i < stream.length; i += 8) chunks.push(stream.slice(i, i + 8));
    return chunks.reverse().join("");
  }

  function packUnsignedBits(value, bitlen) {
    const v = BigInt(Math.max(0, Number(value ?? 0)));
    return leFromBeBits(v.toString(2).padStart(bitlen, "0"), bitlen);
  }

  function packSignedBits(value, bitlen) {
    const mod = 1n << BigInt(bitlen);
    let v = BigInt(Math.trunc(Number(value) || 0));
    if (v < 0) v = mod + v;
    return leFromBeBits(v.toString(2).padStart(bitlen, "0"), bitlen);
  }

  function packFloat32Bits(value) {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, Number(value) || 0, false);
    return leFromBeBits(bitsFromBytes(new Uint8Array(buf)), 32);
  }

  function unpackUnsignedBits(stream, cursor, bitlen) {
    const raw = String(stream || "").slice(cursor, cursor + bitlen);
    return {
      value: Number(BigInt(`0b${beFromLeBits(raw, bitlen)}`)),
      cursor: cursor + bitlen,
    };
  }

  function unpackSignedBits(stream, cursor, bitlen) {
    const raw = String(stream || "").slice(cursor, cursor + bitlen);
    const beBits = beFromLeBits(raw, bitlen);
    let value = BigInt(`0b${beBits}`);
    const sign = 1n << BigInt(bitlen - 1);
    if (value >= sign) value -= 1n << BigInt(bitlen);
    return {
      value: Number(value),
      cursor: cursor + bitlen,
    };
  }

  function unpackFloat32Bits(stream, cursor) {
    const raw = String(stream || "").slice(cursor, cursor + 32);
    const leBytes = bytesFromBits(raw);
    return {
      value: new DataView(leBytes.buffer, leBytes.byteOffset, 4).getFloat32(0, true),
      cursor: cursor + 32,
    };
  }

  function packTailStringBits(text, maxLen, tao = true) {
    const bytes = new TextEncoder().encode(String(text || "")).slice(0, maxLen);
    const payloadBits = bitsFromBytes(bytes);
    if (tao) return payloadBits;
    return packUnsignedBits(bytes.length, arrayLengthBitWidth(maxLen)) + payloadBits;
  }

  function unpackTailStringBits(stream, cursor, maxLen, tao = true) {
    if (tao) {
      const remainingBits = String(stream || "").slice(cursor);
      const byteLen = Math.floor(remainingBits.length / 8);
      const bytes = bytesFromBits(remainingBits.slice(0, byteLen * 8)).slice(0, byteLen);
      return { value: new TextDecoder().decode(bytes), cursor: cursor + byteLen * 8 };
    }
    const width = arrayLengthBitWidth(maxLen);
    const lenRes = unpackUnsignedBits(stream, cursor, width);
    const byteLen = Math.min(maxLen, lenRes.value);
    const bits = String(stream || "").slice(lenRes.cursor, lenRes.cursor + byteLen * 8);
    const bytes = bytesFromBits(bits).slice(0, byteLen);
    return { value: new TextDecoder().decode(bytes), cursor: lenRes.cursor + byteLen * 8 };
  }

  function arrayLengthBitWidth(maxLen) {
    return Math.ceil(Math.log2(Math.max(1, maxLen + 1)));
  }

  function encodeValueUnionBits(value, tao = false) {
    if (!value || value.type === "empty") return "000";
    if (value.type === "integer") return `001${packSignedBits(value.value, 64)}`;
    if (value.type === "real") return `010${packFloat32Bits(value.value)}`;
    if (value.type === "boolean") return `011${packUnsignedBits(value.value ? 1 : 0, 8)}`;
    return `100${packTailStringBits(value.value, 128, tao)}`;
  }

  function decodeValueUnionBits(stream, cursor, tao = false) {
    const tag = Number.parseInt(String(stream || "").slice(cursor, cursor + 3) || "0", 2);
    cursor += 3;
    if (tag === 0) return { type: "empty", value: null, cursor };
    if (tag === 1) {
      const decoded = unpackSignedBits(stream, cursor, 64);
      return { type: "integer", value: decoded.value, cursor: decoded.cursor };
    }
    if (tag === 2) {
      const decoded = unpackFloat32Bits(stream, cursor);
      return { type: "real", value: decoded.value, cursor: decoded.cursor };
    }
    if (tag === 3) {
      const decoded = unpackUnsignedBits(stream, cursor, 8);
      return { type: "boolean", value: decoded.value > 0, cursor: decoded.cursor };
    }
    const decoded = unpackTailStringBits(stream, cursor, 128, tao);
    return { type: "string", value: decoded.value, cursor: decoded.cursor };
  }

  function decodeNumericValueUnionBits(stream, cursor) {
    const tag = Number.parseInt(String(stream || "").slice(cursor, cursor + 2) || "0", 2);
    cursor += 2;
    if (tag === 0) return { type: "empty", value: null, cursor };
    if (tag === 1) {
      const decoded = unpackSignedBits(stream, cursor, 64);
      return { type: "integer", value: decoded.value, cursor: decoded.cursor };
    }
    const decoded = unpackFloat32Bits(stream, cursor);
    return { type: "real", value: decoded.value, cursor: decoded.cursor };
  }

  function toValueUnion(type, value) {
    return { type: type || "empty", value };
  }

  function buildGetSetRequest(index, valueUnion = null, name = "") {
    const bits = packUnsignedBits(Math.max(0, Number(index || 0)) & 0x1fff, 13)
      + encodeValueUnionBits(valueUnion || { type: "empty", value: null }, false)
      + packTailStringBits(name, 92, true);
    return bytesFromBits(bits);
  }

  function buildExecuteOpcodeRequest(opcode) {
    return bytesFromBits(
      packUnsignedBits(Number(opcode) & 0xff, 8)
      + packSignedBits(0, 48)
    );
  }

  function decodeGetSetResponse(bytes) {
    const stream = bitsFromBytes(bytes);
    let cursor = 5;
    const value = decodeValueUnionBits(stream, cursor, false);
    cursor = value.cursor + 5;
    const defaultValue = decodeValueUnionBits(stream, cursor, false);
    cursor = defaultValue.cursor + 6;
    const maxValue = decodeNumericValueUnionBits(stream, cursor);
    cursor = maxValue.cursor + 6;
    const minValue = decodeNumericValueUnionBits(stream, cursor);
    cursor = minValue.cursor;
    const name = unpackTailStringBits(stream, cursor, 92, true);
    return {
      name: name.value,
      value: { type: value.type, value: value.value },
      defaultValue: { type: defaultValue.type, value: defaultValue.value },
      maxValue: { type: maxValue.type, value: maxValue.value },
      minValue: { type: minValue.type, value: minValue.value },
    };
  }

  function decodeExecuteOpcodeResponse(bytes) {
    const stream = bitsFromBytes(bytes);
    const argument = unpackSignedBits(stream, 0, 48);
    const ok = Number.parseInt(stream.slice(argument.cursor, argument.cursor + 1) || "0", 2) > 0;
    return { ok, argument: argument.value };
  }

  function dronecanBaseCrc(signature) {
    const sig = BigInt(signature);
    let crc = 0xffff;
    for (let i = 0; i < 8; i += 1) {
      crc ^= Number((sig >> BigInt(i * 8)) & 0xffn) << 8;
      for (let j = 0; j < 8; j += 1) {
        crc = (crc & 0x8000) ? (((crc << 1) ^ 0x1021) & 0xffff) : ((crc << 1) & 0xffff);
      }
    }
    return crc & 0xffff;
  }

  function crc16Ccitt(bytes, initial = 0xffff) {
    let crc = initial & 0xffff;
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    arr.forEach((byte) => {
      crc ^= byte << 8;
      for (let i = 0; i < 8; i += 1) {
        crc = (crc & 0x8000) ? (((crc << 1) ^ 0x1021) & 0xffff) : ((crc << 1) & 0xffff);
      }
    });
    return crc & 0xffff;
  }

  function buildDronecanServiceCanId(sourceNodeId, destinationNodeId, serviceId, isRequest = true, priority = 31) {
    return ((Number(priority) & 0x1f) << 24)
      | ((Number(serviceId) & 0xff) << 16)
      | ((isRequest ? 1 : 0) << 15)
      | ((Number(destinationNodeId) & 0x7f) << 8)
      | (1 << 7)
      | (Number(sourceNodeId) & 0x7f);
  }

  function nextServiceTransferId(serviceId, nodeId) {
    const key = `${serviceId}:${nodeId}`;
    const next = dcMenuState.serviceTransferIds.get(key) ?? 0;
    dcMenuState.serviceTransferIds.set(key, (next + 1) & 0x1f);
    return next & 0x1f;
  }

  async function sendSlcanAsciiLine(line) {
    const text = String(line || "");
    if (!text) return false;
    if (slcanBoundPort === "webserial" && typeof window.sendSlcanWebSerialLine === "function") {
      return window.sendSlcanWebSerialLine(text.endsWith("\r") ? text : `${text}\r`);
    }
    const payload = btoa(text.endsWith("\r") ? text : `${text}\r`);
    await bridgeJson("/slcan-write", { data: payload });
    return true;
  }

  async function sendDronecanServiceRequest(nodeId, serviceId, payloadBytes, signature) {
    const requestStartedAt = Date.now();
    const canId = buildDronecanServiceCanId(GCS_NODE_ID, nodeId, serviceId, true);
    const transferId = nextServiceTransferId(serviceId, nodeId);
    let payload = payloadBytes instanceof Uint8Array ? payloadBytes : new Uint8Array(payloadBytes || []);
    const dataPerFrame = 7;
    if (payload.length + 1 > 8) {
      const baseCrc = dronecanBaseCrc(signature);
      const transferCrc = crc16Ccitt(payload, baseCrc);
      const expanded = new Uint8Array(payload.length + 2);
      expanded[0] = transferCrc & 0xff;
      expanded[1] = (transferCrc >> 8) & 0xff;
      expanded.set(payload, 2);
      payload = expanded;
    }
    const frames = [];
    for (let offset = 0; offset < payload.length || (!payload.length && !frames.length); offset += dataPerFrame) {
      const chunk = payload.length ? payload.slice(offset, offset + dataPerFrame) : new Uint8Array(0);
      const isStart = offset === 0;
      const isEnd = offset + dataPerFrame >= payload.length;
      const toggle = Math.floor(offset / dataPerFrame) % 2;
      const tail = ((isStart ? 1 : 0) << 7) | ((isEnd ? 1 : 0) << 6) | ((toggle ? 1 : 0) << 5) | transferId;
      const frame = new Uint8Array(chunk.length + 1);
      frame.set(chunk, 0);
      frame[frame.length - 1] = tail;
      frames.push(frame);
      if (!payload.length) break;
    }
    for (const frame of frames) {
      const dataHex = Array.from(frame).map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");
      const line = `T${canId.toString(16).toUpperCase().padStart(8, "0")}${frame.length.toString(16).toUpperCase()}${dataHex}`;
      await sendSlcanAsciiLine(line);
      await new Promise((r) => setTimeout(r, 14));
    }
    return {
      transferId,
      responderNodeId: Number(nodeId) & 0x7f,
      requestCanId: canId,
      responseCanId: buildDronecanServiceCanId(nodeId, GCS_NODE_ID, serviceId, false),
      requestStartedAt,
    };
  }

  async function refreshServiceResponseCache() {
    if (shouldPollBrowserCan()) {
      applySlcanNodeSnapshot(getBrowserCanStatus());
      return;
    }
    try {
      const status = await bridgeJson("/slcan-nodes", null, { skipEnsure: true });
      applySlcanNodeSnapshot(status);
    } catch (_) {
      // Keep waiting logic resilient if a single cache refresh fails.
    }
  }

  async function waitForServiceResponse(responderNodeId, responseCanId, transferId, requestStartedAt, timeoutMs = 1600) {
    const expected = `0x${Number(responseCanId).toString(16).toUpperCase()}`;
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      await refreshServiceResponseCache();
      const frames = getCachedFramesForCan(responderNodeId, expected)
        .filter((frame) => {
          if (Number(frame?.ts || 0) + 5 < Number(requestStartedAt || 0)) return false;
          const transport = dronecanDecode()?.stripTransport?.(
            Uint8Array.from((frame.dataHex || "").match(/../g) || [], (s) => Number.parseInt(s, 16)),
            frame.dlc
          )?.transport;
          return transport?.transferId === transferId;
        });
      if (frames.length) {
        const assembly = dronecanDecode()?.reassembleFromFrames?.(frames, { anchorTs: frames[frames.length - 1]?.ts });
        if (assembly?.complete) return assembly.payload;
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    throw new Error("Parameter service response timeout");
  }

  async function dronecanGetSet(nodeId, index, valueUnion = null, name = "") {
    const req = buildGetSetRequest(index, valueUnion, name);
    const tx = await sendDronecanServiceRequest(nodeId, DRONECAN_GETSET_SERVICE_ID, req, DRONECAN_GETSET_SIGNATURE);
    const payload = await waitForServiceResponse(tx.responderNodeId, tx.responseCanId, tx.transferId, tx.requestStartedAt, valueUnion ? 2200 : 1400);
    return decodeGetSetResponse(payload);
  }

  async function executeParamOpcode(nodeId, opcode) {
    const req = buildExecuteOpcodeRequest(opcode);
    const tx = await sendDronecanServiceRequest(nodeId, DRONECAN_EXECUTE_OPCODE_SERVICE_ID, req, DRONECAN_EXECUTE_OPCODE_SIGNATURE);
    const payload = await waitForServiceResponse(tx.responderNodeId, tx.responseCanId, tx.transferId, tx.requestStartedAt, 1800);
    return decodeExecuteOpcodeResponse(payload);
  }

  async function ensureNodeParametersLoaded(node, opts = {}) {
    const nodeId = Number(node?.nodeId || 0);
    if (!nodeId) return [];
    const entry = cacheEntryForNode(nodeId);
    if (entry.loading) return entry.params || [];
    if (!opts.force && Array.isArray(entry.params) && entry.params.length) return entry.params;
    entry.loading = true;
    entry.error = "";
    renderParametersModal(node);
    try {
      const params = [];
      for (let index = 0; index < 512; index += 1) {
        let response;
        try {
          response = await dronecanGetSet(nodeId, index, null, "");
        } catch (err) {
          const timedOut = /Parameter service response timeout/i.test(String(err?.message || err || ""));
          if (timedOut && index === 0) {
            throw new Error(dcText(
              "This node did not respond to DroneCAN GetSet. The selected device may not expose parameters over DroneCAN.",
              "该节点未响应 DroneCAN GetSet，当前所选设备可能未通过 DroneCAN 暴露参数服务。"
            ));
          }
          throw err;
        }
        if (!response?.name || response.value?.type === "empty") break;
        params.push({
          index,
          name: response.name,
          type: response.value.type,
          value: response.value.value,
          defaultValue: response.defaultValue?.value,
          defaultType: response.defaultValue?.type || "empty",
          minValue: response.minValue?.value,
          minType: response.minValue?.type || "empty",
          maxValue: response.maxValue?.value,
          maxType: response.maxValue?.type || "empty",
        });
      }
      entry.params = params;
      entry.loadedAt = Date.now();
      if (params.length) {
        dcMenuState.paramSelectedIndex = params[0].index;
      }
      renderParametersModal(node);
      return params;
    } catch (err) {
      entry.error = err?.message || String(err);
      renderParametersModal(node);
      throw err;
    } finally {
      entry.loading = false;
      renderParametersModal(node);
    }
  }

  function filteredNodeParams(nodeId) {
    const entry = cacheEntryForNode(nodeId);
    const q = String(dcMenuState.paramSearch || "").trim().toLowerCase();
    const params = Array.isArray(entry.params) ? entry.params : [];
    if (!q) return params;
    return params.filter((param) => String(param.name || "").toLowerCase().includes(q) || String(param.index).includes(q));
  }

  function selectedNodeParam(nodeId) {
    const entry = cacheEntryForNode(nodeId);
    return (entry.params || []).find((param) => param.index === dcMenuState.paramSelectedIndex) || null;
  }

  function renderParamEditor(node, param) {
    if (!param) {
      return `<p class="sc-dc-modal-note">${dcText("Select a parameter from the list to inspect or edit it.", "请先在左侧列表中选择一个参数后再查看或编辑。")}</p>`;
    }
    const draft = getParamDraft(node.nodeId, param.index);
    const changed = draft !== undefined && !valuesEqual(draft, param.value);
    if (param.type === "boolean") {
      return `
        <label class="sc-dc-modal-field">
          <span>${dcText("Draft value", "草稿值")}</span>
          <select id="sc-dc-param-edit-value">
            <option value="true"${(draft !== undefined ? draft : param.value) ? " selected" : ""}>true</option>
            <option value="false"${!(draft !== undefined ? draft : param.value) ? " selected" : ""}>false</option>
          </select>
        </label>
        <p class="sc-dc-modal-note">${changed ? dcText("Draft differs from current value.", "草稿值与当前设备值不同。") : dcText("Draft matches the current value.", "草稿值与当前设备值一致。")}</p>
      `;
    }
    return `
      <label class="sc-dc-modal-field">
        <span>${dcText("Draft value", "草稿值")}</span>
        <input id="sc-dc-param-edit-value" value="${escapeHtml(draft !== undefined ? draft : formatParamValue(param.value, param.type))}">
      </label>
      <p class="sc-dc-modal-note">${changed ? dcText("Draft differs from current value.", "草稿值与当前设备值不同。") : dcText("Draft matches the current value.", "草稿值与当前设备值一致。")}</p>
    `;
  }

  function renderParametersModal(node) {
    const body = $("sc-dc-modal-body");
    const title = $("sc-dc-modal-title");
    if (!body || !title) return;
    const nodeId = Number(node?.nodeId || 0);
    const entry = cacheEntryForNode(nodeId);
    const rows = filteredNodeParams(nodeId);
    const selected = selectedNodeParam(nodeId) || rows[0] || null;
    if (selected && dcMenuState.paramSelectedIndex < 0) dcMenuState.paramSelectedIndex = selected.index;
    title.textContent = `Parameters · Node ${node?.nodeId ?? "-"}`;
    body.innerHTML = `
      <div class="sc-dc-modal-grid">
        <section class="sc-dc-modal-card">
          <h4>${dcText("Node parameter list", "节点参数列表")}</h4>
          <label class="sc-dc-modal-field"><span>${dcText("Search", "搜索")}</span><input id="sc-dc-param-search" value="${escapeHtml(dcMenuState.paramSearch)}" placeholder="index / name"></label>
          <div class="sc-dc-node-table-wrap" style="max-height:420px;">
            <table class="sc-table sc-dc-node-table">
              <thead><tr><th>#</th><th>${dcText("Name", "名称")}</th><th>${dcText("Current", "当前值")}</th><th>${dcText("Type", "类型")}</th></tr></thead>
              <tbody id="sc-dc-param-list">
                ${entry.loading ? `<tr><td colspan="4" class="muted">${dcText("Loading parameters from node…", "正在从节点读取参数…")}</td></tr>` : ""}
                ${!entry.loading && !rows.length ? `<tr><td colspan="4" class="muted">${escapeHtml(entry.error ? dcText(`Load failed: ${entry.error}`, `读取失败：${entry.error}`) : dcText("No parameters loaded yet.", "尚未读取到参数。"))}</td></tr>` : ""}
                ${rows.map((param) => {
                  const isSelected = selected?.index === param.index;
                  const draft = getParamDraft(nodeId, param.index);
                  const currentLabel = draft !== undefined && !valuesEqual(draft, param.value)
                    ? `${escapeHtml(formatParamValue(param.value, param.type))} -> ${escapeHtml(formatParamValue(draft, param.type))}`
                    : escapeHtml(formatParamValue(param.value, param.type));
                  return `<tr class="sc-dc-row${isSelected ? " active" : ""}" data-dc-param-index="${param.index}"><td>${param.index}</td><td>${escapeHtml(param.name)}</td><td>${currentLabel}</td><td>${paramKindLabel(param.type)}</td></tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>
          <div class="sc-dc-modal-actions">
            <button type="button" id="sc-dc-param-refresh" class="sc-btn sc-btn-primary">${dcText("Refresh from node", "重新读取节点参数")}</button>
            <button type="button" id="sc-dc-param-save" class="sc-btn sc-btn-ghost">${dcText("Save local", "本地保存")}</button>
            <button type="button" id="sc-dc-param-load" class="sc-btn sc-btn-ghost">${dcText("Load local", "本地加载")}</button>
            <button type="button" id="sc-dc-param-persist" class="sc-btn sc-btn-ghost">${dcText("Save to node", "保存到节点")}</button>
          </div>
        </section>
        <section class="sc-dc-modal-card">
          <h4>${dcText("Parameter detail", "参数详情")}</h4>
          <dl class="sc-dc-inline-kv">
            <dt>${dcText("Node", "节点")}</dt><dd>${node?.nodeId ?? "-"}</dd>
            <dt>${dcText("Device", "设备")}</dt><dd>${node?.name || "-"}</dd>
            <dt>${dcText("Selected", "已选参数")}</dt><dd>${selected ? `${selected.index} · ${selected.name}` : "—"}</dd>
            <dt>${dcText("Type", "类型")}</dt><dd>${selected ? paramKindLabel(selected.type) : "—"}</dd>
            <dt>${dcText("Current", "当前值")}</dt><dd>${selected ? escapeHtml(formatParamValue(selected.value, selected.type)) : "—"}</dd>
            <dt>${dcText("Default", "默认值")}</dt><dd>${selected ? escapeHtml(formatParamValue(selected.defaultValue, selected.defaultType)) : "—"}</dd>
            <dt>${dcText("Range", "范围")}</dt><dd>${selected ? `${escapeHtml(formatParamValue(selected.minValue, selected.minType))} ~ ${escapeHtml(formatParamValue(selected.maxValue, selected.maxType))}` : "—"}</dd>
          </dl>
          ${renderParamEditor(node, selected)}
          <div class="sc-dc-modal-actions">
            <button type="button" id="sc-dc-param-write" class="sc-btn sc-btn-primary"${selected ? "" : " disabled"}>${dcText("Write + verify", "写入并回读校验")}</button>
            <button type="button" id="sc-dc-param-reset-draft" class="sc-btn sc-btn-ghost"${selected ? "" : " disabled"}>${dcText("Reset draft", "重置草稿")}</button>
          </div>
          <p class="sc-dc-modal-note">${dcText("Parameters are read through DroneCAN GetSet, then written back to the selected node and verified by response echo.", "参数通过 DroneCAN GetSet 读取，写回时向所选节点下发并通过响应回读校验。")}</p>
          <p id="sc-dc-modal-status" class="sc-dc-modal-status"></p>
        </section>
      </div>
    `;
  }

  function renderRestartModal(node) {
    const body = $("sc-dc-modal-body");
    const title = $("sc-dc-modal-title");
    if (!body || !title) return;
    title.textContent = `Restart · Node ${node?.nodeId ?? "-"}`;
    body.innerHTML = `
      <div class="sc-dc-modal-grid">
        <section class="sc-dc-modal-card">
          <h4>${dcText("Remote restart", "远程重启飞控")}</h4>
          <p class="sc-dc-modal-note">${dcText("Restarting will break the current MAVLink/DroneCAN link. Confirm before sending the reboot command.", "重启会断开当前 MAVLink / DroneCAN 链路，请确认后下发重启指令。")}</p>
          <label class="sc-dc-checkline"><input id="sc-dc-restart-autoreconnect" type="checkbox" checked><span>${dcText("Auto reconnect after countdown", "倒计时后自动重连")}</span></label>
          <label class="sc-dc-modal-field"><span>${dcText("Reconnect delay (s)", "重连延时（秒）")}</span><input id="sc-dc-restart-delay" type="number" min="3" max="60" step="1" value="12"></label>
          <div class="sc-dc-modal-actions"><button type="button" id="sc-dc-restart-confirm" class="sc-btn sc-btn-primary">${dcText("Confirm restart", "确认重启")}</button></div>
        </section>
        <section class="sc-dc-modal-card">
          <h4>${dcText("Link impact", "链路影响")}</h4>
          <dl class="sc-dc-inline-kv">
            <dt>${dcText("Current link", "当前链路")}</dt><dd>${isGcsSerialConnected() ? dcText("Connected", "已连接") : dcText("Disconnected", "未连接")}</dd>
            <dt>${dcText("Reconnect path", "重连路径")}</dt><dd>${detectSlcanAdapterPort() ? dcText("Same serial path", "沿用当前串口路径") : dcText("MAVLink only", "仅 MAVLink 路径")}</dd>
          </dl>
          <p id="sc-dc-modal-status" class="sc-dc-modal-status warn">${dcText("Waiting for confirmation.", "等待确认。")}</p>
        </section>
      </div>
    `;
  }

  function renderUpdateModal(node) {
    const body = $("sc-dc-modal-body");
    const title = $("sc-dc-modal-title");
    if (!body || !title) return;
    title.textContent = `Update · Node ${node?.nodeId ?? "-"}`;
    body.innerHTML = `
      <div class="sc-dc-modal-grid">
        <section class="sc-dc-modal-card">
          <h4>${dcText("Firmware source", "固件来源")}</h4>
          <div class="sc-dc-fileline">
            <input id="sc-dc-update-file" type="file" accept=".apj,.bin,.px4,.uf2,.hex,.fw">
            <button type="button" id="sc-dc-update-online" class="sc-btn sc-btn-ghost">${dcText("Fetch stable firmware", "在线拉取稳定版")}</button>
          </div>
          <label class="sc-dc-modal-field"><span>${dcText("Stable firmware URL", "稳定版固件 URL")}</span><input id="sc-dc-update-url" placeholder="https://.../stable.bin"></label>
          <div class="sc-dc-progress-wrap">
            <div class="sc-dc-progress-row"><span id="sc-dc-update-step">${dcText("Idle", "空闲")}</span><span id="sc-dc-update-pct">0%</span></div>
            <div class="sc-dc-progress-bar"><div id="sc-dc-update-fill" class="sc-dc-progress-fill"></div></div>
          </div>
          <div class="sc-dc-modal-actions">
            <button type="button" id="sc-dc-update-start" class="sc-btn sc-btn-primary">${dcText("Start OTA", "开始 OTA")}</button>
            <button type="button" id="sc-dc-update-cancel" class="sc-btn sc-btn-ghost">${dcText("Abort", "终止升级")}</button>
          </div>
        </section>
        <section class="sc-dc-modal-card">
          <h4>${dcText("Upgrade checks", "升级校验")}</h4>
          <dl class="sc-dc-inline-kv">
            <dt>${dcText("Node", "节点")}</dt><dd>${node?.nodeId ?? "-"}</dd>
            <dt>${dcText("Current CRC", "当前 CRC")}</dt><dd>${nodeCrc(node)}</dd>
            <dt>${dcText("Chunk size", "分包大小")}</dt><dd>240 bytes</dd>
            <dt>${dcText("Failure policy", "失败策略")}</dt><dd>${dcText("Abort on first error", "任一失败立即终止")}</dd>
          </dl>
          <p class="sc-dc-modal-note">${dcText("The GCS computes CRC32 locally, then sends the image to the bridge in fixed chunks. The bridge validates chunk CRC and reports progress back to the UI.", "GCS 先在本地计算 CRC32，再按固定分包送到桥接服务，由桥接服务校验分包 CRC 并把进度回报 UI。")}</p>
          <p id="sc-dc-modal-status" class="sc-dc-modal-status"></p>
        </section>
      </div>
    `;
  }

  function openDcModal(kind, node) {
    const backdrop = $("sc-dc-modal-backdrop");
    if (!backdrop) return;
    if (kind === "parameters" && !nodeSupportsDronecanParameters(node)) return;
    dcMenuState.activeModal = kind;
    backdrop.hidden = false;
    if (kind === "parameters") {
      renderParametersModal(node);
      ensureNodeParametersLoaded(node).catch((err) => {
        setModalStatus(dcText(`Load failed: ${err?.message || err}`, `读取失败：${err?.message || err}`), "err");
      });
    }
    if (kind === "restart") renderRestartModal(node);
    if (kind === "update") renderUpdateModal(node);
  }

  async function triggerAutoReconnect(delaySeconds) {
    clearInterval(reconnectCountdownTimer);
    dcMenuState.reconnectTargetSeconds = delaySeconds;
    dcMenuState.reconnectRemainingSeconds = delaySeconds;
    reconnectCountdownTimer = window.setInterval(async () => {
      dcMenuState.reconnectRemainingSeconds -= 1;
      if (dcMenuState.activeModal === "restart") {
        setModalStatus(dcText(`Reconnect in ${Math.max(0, dcMenuState.reconnectRemainingSeconds)}s…`, `${Math.max(0, dcMenuState.reconnectRemainingSeconds)} 秒后自动重连…`), "warn");
      }
      if (dcMenuState.reconnectRemainingSeconds > 0) return;
      clearInterval(reconnectCountdownTimer);
      reconnectCountdownTimer = 0;
      try {
        if (typeof window.connect === "function") await window.connect();
        if (dcMenuState.activeModal === "restart") setModalStatus(dcText("Reconnect requested.", "已发起自动重连。"), "ok");
      } catch (err) {
        if (dcMenuState.activeModal === "restart") setModalStatus(dcText(`Reconnect failed: ${err?.message || err}`, `自动重连失败：${err?.message || err}`), "err");
      }
    }, 1000);
  }

  async function readFileAsUint8Array(file) {
    const buf = await file.arrayBuffer();
    return new Uint8Array(buf);
  }

  async function crc32Hex(bytes) {
    let c = 0 ^ (-1);
    for (let i = 0; i < bytes.length; i += 1) {
      c ^= bytes[i];
      for (let k = 0; k < 8; k += 1) {
        c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
      }
    }
    const value = (c ^ (-1)) >>> 0;
    return value.toString(16).toUpperCase().padStart(8, "0");
  }

  async function performFirmwareUpload(node, fileName, bytes) {
    const chunkSize = 240;
    const total = bytes.length;
    const imageCrc = await crc32Hex(bytes);
    setUpdateProgress(2, dcText("Computing CRC and opening OTA session…", "正在计算 CRC 并打开 OTA 会话…"));
    await bridgeJson("/dronecan-ota-begin", {
      nodeId: Number(node?.nodeId || 0),
      fileName,
      totalSize: total,
      imageCrc,
      chunkSize,
    });
    let sent = 0;
    for (let offset = 0; offset < total; offset += chunkSize) {
      const chunk = bytes.slice(offset, Math.min(total, offset + chunkSize));
      const chunkCrc = await crc32Hex(chunk);
      await bridgeJson("/dronecan-ota-chunk", {
        nodeId: Number(node?.nodeId || 0),
        offset,
        totalSize: total,
        imageCrc,
        chunkCrc,
        data: btoa(String.fromCharCode(...chunk)),
      });
      sent += chunk.length;
      setUpdateProgress(Math.round((sent / total) * 100), dcText(`Uploading ${sent}/${total} bytes`, `已上传 ${sent}/${total} 字节`));
    }
    await bridgeJson("/dronecan-ota-finish", {
      nodeId: Number(node?.nodeId || 0),
      totalSize: total,
      imageCrc,
    });
    setUpdateProgress(100, dcText("OTA complete", "OTA 完成"));
    setModalStatus(dcText(`Upgrade complete. CRC ${imageCrc}`, `升级完成，CRC ${imageCrc}`), "ok");
  }

  async function handleNodeMenuAction(action) {
    const node = canNodes.find((n) => n.nodeId === menuNodeId) || null;
    if (!node) {
      hideNodeMenu();
      return;
    }
    if (action === "parameters" && !nodeSupportsDronecanParameters(node)) {
      hideNodeMenu();
      return;
    }
    if (action === "parameters" || action === "restart" || action === "update") {
      selectCanNode(node.nodeId);
      openDcModal(action, node);
    }
    hideNodeMenu();
  }

  function renderFilterTable() {
    const tbody = $("sc-dc-filter-body");
    if (!tbody) return;
    const q = String($("sc-dc-filter-input")?.value || "").trim().toLowerCase();
    const health = $("sc-dc-health-filter")?.value || "all";
    const rows = canNodes.filter((node) => {
      if (health === "online" && node.status !== "online") return false;
      if (health === "offline" && node.status !== "offline") return false;
      if (!q) return true;
      return String(node.nodeId).includes(q)
        || String(node.name || "").toLowerCase().includes(q)
        || String(node.title || "").toLowerCase().includes(q);
    });
    tbody.innerHTML = "";
    rows.forEach((node) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${node.nodeId}</td><td>${node.name}</td><td>${nodeMode(node)}</td><td>${nodeHealth(node)}</td><td>${node.source}</td>`;
      tr.addEventListener("click", () => selectCanNode(node.nodeId));
      tbody.appendChild(tr);
    });
  }

  function renderInspectorDetail(node, selection) {
    const evidence = $("sc-dc-inspector-evidence");
    const detail = $("sc-dc-inspector-detail");
    const registry = dronecanRegistry();
    const decoder = dronecanDecode();
    if (!detail) return;

    if (!node || !selection?.canId) {
      if (evidence) {
        evidence.textContent = node
          ? dcText(`Node ${node.nodeId} selected. Pick a message in the tree.`, `节点 ${node.nodeId} 已选，请在左侧树中选择一条消息。`)
          : "";
      }
      detail.innerHTML = `<p class="sc-prose sc-prose--sm muted">${dcText("Expand a node and select a message to decode.", "请展开节点并选择一条消息。")}</p>`;
      return;
    }

    const frame = findInspectorFrame(node, selection.canId);
    const meta = registry?.describeMessage?.(selection.canId) || {
      shortName: "RawFrame",
      fullName: "raw.can.Frame",
      category: "Raw",
    };
    const decodeFrames = getDecodeFramesForCan(node, selection.canId);
    const latestCached = decodeFrames.length ? decodeFrames[decodeFrames.length - 1] : null;
    const activeFrame = latestCached || frame || null;
    const decoded = decoder?.decodeTransfer?.(
      selection.canId,
      activeFrame?.dataHex || node.lastDataHex || "",
      activeFrame?.dlc ?? node.lastDlc ?? 0,
      { recentFrames: decodeFrames, anchorTs: activeFrame?.ts }
    ) || null;
    const idInfo = decoded || decoder?.parseCanIdValue?.(selection.canId) || {};

    const sourceNodeId = idInfo.sourceNodeId ?? meta.sourceNodeId ?? node.nodeId;
    const dataTypeId = idInfo.dataTypeId ?? meta.dataTypeId ?? "—";

    const dlc = activeFrame?.dlc ?? decoded?.dlc ?? node.lastDlc ?? "—";
    const frameHex = activeFrame?.dataHex || node.lastDataHex || "";
    const payloadHex = decoded?.payloadHex || "";
    const timeHint = activeFrame ? formatLastSeenAgo(activeFrame.ts) : "";

    if (evidence) {
      evidence.textContent = timeHint ? dcText(`Updated ${timeHint}`, `更新于 ${timeHint}`) : "";
    }

    const transport = decoded?.transport;
    const transferValue =
      typeof window.DRONECAN_LABELS_ZH?.transferTypeLabel === "function"
        ? window.DRONECAN_LABELS_ZH.transferTypeLabel(idInfo.isService, idInfo.isRequest)
        : idInfo.isService
          ? (idInfo.isRequest ? "Service request" : "Service response")
          : "Broadcast message";

    const headerRows = [
      [dcText("Category", "分类"), categoryDisplayLabel(meta.category) || "—"],
      [dcText("Priority", "优先级"), idInfo.priority ?? meta.priority ?? "—"],
      [dcText("Transfer type", "传输类型"), transferValue],
      [dcText("DLC", "DLC"), dlc],
    ];
    if (transport) {
      headerRows.push(
        [dcText("Tail byte", "尾字节"), transport.tailByte],
        [dcText("Transfer ID", "传输 ID"), transport.transferId],
        [dcText("SOF / EOF", "起始 / 结束"), `${transport.startOfTransfer ? 1 : 0} / ${transport.endOfTransfer ? 1 : 0}`],
      );
    }
    if (frameHex) {
      headerRows.push([dcText("Frame data", "帧数据"), frameHex]);
    }

    const fieldRows = [];
    (decoded?.fields || []).forEach((item) => {
      if (item.name === "payload_hex" || item.name === "partial_payload_hex") return;
      if (item.name === "payload_bytes" && dlc !== "—" && String(item.value) === String(dlc)) return;
      fieldRows.push([inspectorFieldLabel(item.name), item.value, item.note || ""]);
    });
    if (payloadHex) {
      const clean = String(payloadHex).replace(/\s+/g, "");
      const spaced = clean.match(/.{1,2}/g)?.join(" ") || payloadHex;
      fieldRows.push([inspectorFieldLabel("payload_hex"), spaced, ""]);
    }

    const noDecoderZh = dcText("No field decoder for this message yet.", "尚无该消息的字段解码器");

    detail.innerHTML = `
      <div class="sc-dc-inspector-section sc-dc-type-banner">
        <p class="sc-dc-type-title">${messageDisplayLabel(meta)}</p>
        <p class="sc-dc-type-full">${meta.fullName}</p>
        <p class="sc-dc-type-meta">${dcText("Data type", "数据类型")} ${dataTypeId} · ${selection.canId} · ${dcText("Node", "节点")} ${sourceNodeId}${timeHint ? ` · ${timeHint}` : ""}</p>
      </div>
      <div class="sc-dc-inspector-section">
        <h5>${dcText("Transfer layer", "传输层")}</h5>
        <dl class="sc-dc-kv">${headerRows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
      </div>
      <div class="sc-dc-inspector-section">
        <h5>${dcText("Decoded fields", "解码字段")}</h5>
        ${fieldRows.length ? `
          <table class="sc-dc-field-table">
            <thead><tr><th>${dcText("Field", "字段")}</th><th>${dcText("Value", "数值")}</th></tr></thead>
            <tbody>${fieldRows.map(([name, value, note]) => `<tr><th>${name}</th><td>${value}${note ? `<span class="sc-dc-field-note">${note}</span>` : ""}</td></tr>`).join("")}</tbody>
          </table>
        ` : `<p class="sc-prose sc-prose--sm muted">${noDecoderZh}</p>`}
      </div>
    `;
  }

  function buildInspectorMessageGroups(node, registry) {
    const frameCounts = Object.entries(node?.frameIdCounts || {}).sort((a, b) => Number(b[1]) - Number(a[1]));
    const groups = new Map();
    frameCounts.forEach(([canId, count]) => {
      const meta = registry?.describeMessage?.(canId) || { shortName: "RawFrame", fullName: "raw.can.Frame", category: "Raw" };
      const parsed = dronecanDecode()?.parseCanIdValue?.(canId) || {};
      const semanticKey = meta.fullName && meta.fullName !== "raw.can.Frame"
        ? `${meta.fullName}|${meta.dataTypeId ?? parsed.dataTypeId ?? ""}|${parsed.isService ? 1 : 0}|${parsed.isRequest ? 1 : 0}`
        : `raw:${canId}`;
      const existing = groups.get(semanticKey);
      const item = { canId, count: Number(count) || 0, meta, parsed };
      if (!existing) {
        groups.set(semanticKey, {
          key: semanticKey,
          primaryCanId: canId,
          totalCount: item.count,
          meta,
          parsed,
          items: [item],
        });
        return;
      }
      existing.totalCount += item.count;
      existing.items.push(item);
      if (item.count > (existing.items[0]?.count || 0)) {
        existing.primaryCanId = canId;
        existing.meta = meta;
        existing.parsed = parsed;
      }
      existing.items.sort((a, b) => b.count - a.count);
    });
    return Array.from(groups.values()).sort((a, b) => b.totalCount - a.totalCount);
  }

  function renderInspector() {
    const node = canNodes.find((n) => n.nodeId === selectedCanId) || canNodes[0] || null;
    const summary = $("sc-dc-inspector-summary");
    const tree = $("sc-dc-inspector-tree");
    if (summary) {
      summary.textContent = node
        ? `${dcText("Node", "节点")} ${node.nodeId} · ${node.name} · ${nodeHealth(node)} · ${(node.source || dcText("Direct", "直连"))}`
        : dcText("No directly observed online nodes.", "暂无直接观测到的在线节点。");
    }
    if (tree) tree.innerHTML = "";
    if (!node) {
      renderInspectorDetail(null, null);
      return;
    }

    const registry = dronecanRegistry();
    const messageGroups = buildInspectorMessageGroups(node, registry);

    if (!selectedInspectorMessage || selectedInspectorMessage.nodeId !== node.nodeId) {
      const topCanId = messageGroups[0]?.primaryCanId || node.lastCanId || null;
      if (topCanId) selectedInspectorMessage = { nodeId: node.nodeId, canId: topCanId };
    }

    const nodes = canNodes.slice().sort((a, b) => a.nodeId - b.nodeId);
    const root = document.createElement("ul");
    root.className = "sc-dc-tree-list";

    nodes.forEach((n) => {
      const observed = computeNodeObservedStats(n);
      const rxCount = observed.frameCount;
      const bps = observed.bps;
      const groupedMessages = buildInspectorMessageGroups(n, registry);
      const nodeItem = document.createElement("li");
      const nodeOpen = inspectorOpenState.nodes.has(n.nodeId);
      nodeItem.className = `sc-dc-tree-node${nodeOpen ? " open" : ""}`;
      const isSelectedMessage = (group) => (
        selectedInspectorMessage
        && selectedInspectorMessage.nodeId === n.nodeId
        && group.items.some((item) => item.canId === selectedInspectorMessage.canId)
      );
      const messageItems = groupedMessages.map((group) => {
        const meta = group.meta || { shortName: "RawFrame", fullName: "raw.can.Frame", category: "Raw" };
        const active = isSelectedMessage(group) ? " active-message" : "";
        const duplicateNote = group.items.length > 1 ? ` · ${group.items.length} 路` : "";
        return `
          <li>
            <button type="button" class="sc-dc-tree-row${active}" data-can-id="${n.nodeId}:${group.primaryCanId}">
              <span class="sc-dc-tree-caret blank">•</span>
              <span class="sc-dc-tree-kind">${categoryDisplayLabel(meta.category)}</span>
              <span class="sc-dc-tree-title">${group.primaryCanId} · ${messageDisplayLabel(meta)}</span>
              <span class="sc-dc-tree-meta">${group.totalCount} ${dcText("frames", "帧")}${duplicateNote}</span>
            </button>
          </li>
        `;
      }).join("");
      nodeItem.innerHTML = `
        <button type="button" class="sc-dc-tree-row${n.nodeId === node.nodeId ? " active" : ""}" data-node-head="${n.nodeId}">
          <span class="sc-dc-tree-caret">${nodeOpen ? "▾" : "▸"}</span>
          <span class="sc-dc-tree-title">${n.nodeId} · ${n.name}</span>
          <span class="sc-dc-tree-meta">${nodeHealth(n)} · ${rxCount} ${dcText("frames", "帧")} · ${bps} Bps</span>
        </button>
        <ul class="sc-dc-tree-branch">${messageItems || `<li class="sc-dc-tree-empty">${dcText("No message", "无消息")}</li>`}</ul>
      `;
      root.appendChild(nodeItem);
    });
    tree.appendChild(root);
    renderInspectorDetail(node, selectedInspectorMessage);
  }

  function renderLogTable() {
    const tbody = $("sc-dc-log-body");
    const node = canNodes.find((n) => n.nodeId === selectedCanId) || canNodes[0] || null;
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!node) return;
    const meta = dronecanRegistry()?.describeMessage?.(node.lastCanId || "") || {};
    [
      [node.nodeId, dcText("Info", "信息"), "node.name", node.name],
      [node.nodeId, dcText("Info", "信息"), "node.mode", nodeMode(node)],
      [node.nodeId, dcText("Info", "信息"), "node.health", nodeHealth(node)],
      [node.nodeId, dcText("Info", "信息"), "node.discovery", dcText("Direct / SLCAN observed", "直连 / SLCAN 观测")],
      [node.nodeId, dcText("Info", "信息"), "message.type", meta.fullName || "—"],
      [node.nodeId, dcText("Info", "信息"), "frame.can_id", node.lastCanId || "--"],
      [node.nodeId, dcText("Info", "信息"), "frame.data", node.lastDataHex || "--"],
    ].forEach(([a, b, c, d]) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${a}</td><td>${b}</td><td>${c}</td><td>${d}</td>`;
      tbody.appendChild(tr);
    });
  }

  function renderBand(node) {
    if (!node) return;
    if ($("sc-dc-band-id")) $("sc-dc-band-id").textContent = String(node.nodeId);
    if ($("sc-dc-band-name")) $("sc-dc-band-name").textContent = node.name;
    if ($("sc-dc-band-mode")) $("sc-dc-band-mode").textContent = nodeMode(node);
    if ($("sc-dc-band-health")) $("sc-dc-band-health").textContent = nodeHealth(node);
    if ($("sc-dc-band-uptime")) $("sc-dc-band-uptime").textContent = nodeUptime(node);
    if ($("sc-dc-band-vendor")) $("sc-dc-band-vendor").textContent = nodeVendorCode(node);
    if ($("sc-dc-band-sw")) $("sc-dc-band-sw").textContent = softwareVersionForNode(node);
    if ($("sc-dc-band-crc")) $("sc-dc-band-crc").textContent = nodeCrc(node);
    if ($("sc-dc-band-hw")) $("sc-dc-band-hw").textContent = hardwareVersionForNode(node);
    if ($("sc-dc-band-uid")) $("sc-dc-band-uid").textContent = nodeHexName(node);
  }

  function renderCanBusMeta() {
    const fcCan = getFlightControllerCanIdentity();
    const onlineNodes = canNodes.filter((n) => n.status === "online" || n.status === "stale");
    const directNodes = canNodes.filter((n) => n.source === "MAVLink CAN_FRAME" || n.source === "SLCAN Direct");
    if ($("sc-dc-can1-meta")) {
      $("sc-dc-can1-meta").innerHTML = `
        <dt>${dcText("Bus", "总线")}</dt><dd>CAN1</dd>
        <dt>${dcText("Transport", "传输")}</dt><dd>${slcanSessionReady ? dcText("SLCAN Direct", "SLCAN 直连") : dcText("Not ready", "未就绪")}</dd>
        <dt>${dcText("FC Driver", "飞控驱动")}</dt><dd>CAN_D${fcCan.canDrivers[0] || 1}</dd>
        <dt>${dcText("FC Node ID", "飞控节点 ID")}</dt><dd>${fcCan.nodeId}</dd>
        <dt>${dcText("Online nodes", "在线节点")}</dt><dd>${onlineNodes.length}</dd>
        <dt>${dcText("Direct nodes", "直连节点")}</dt><dd>${directNodes.length}</dd>
        <dt>${dcText("Frames/s", "帧率")}</dt><dd>${slcanRuntime.framesPerSecond}</dd>
        <dt>${dcText("Errors", "错误帧")}</dt><dd>${slcanRuntime.errorFrames}</dd>
        <dt>${dcText("SLCAN Port", "SLCAN 端口")}</dt><dd>${detectSlcanAdapterPort() || "-"}</dd>
      `;
    }
    if ($("sc-dc-can2-meta")) {
      $("sc-dc-can2-meta").innerHTML = `<dt>${dcText("Bus", "总线")}</dt><dd>CAN2</dd><dt>${dcText("Driver", "驱动")}</dt><dd>${fcCan.canDrivers[1] ? `CAN_D${fcCan.canDrivers[1]}` : dcText("Not enabled", "未启用")}</dd><dt>${dcText("Status", "状态")}</dt><dd>${fcCan.canDrivers[1] ? dcText("Configured", "已配置") : dcText("Unavailable", "不可用")}</dd><dt>${dcText("Transport", "传输")}</dt><dd>${dcText("MAVLink metadata only", "仅 MAVLink 元数据")}</dd>`;
    }
  }

  function ensureSvgDefs(svg) {
    let defs = svg.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS(svgNs, "defs");
      svg.appendChild(defs);
    }
    if (!svg.querySelector("#sc-dc-scan-grad")) {
      const g = document.createElementNS(svgNs, "linearGradient");
      g.setAttribute("id", "sc-dc-scan-grad");
      g.setAttribute("gradientUnits", "userSpaceOnUse");
      g.setAttribute("x1", "0");
      g.setAttribute("y1", "0");
      g.setAttribute("x2", "24");
      g.setAttribute("y2", "0");
      [["0%", "#10b981"], ["50%", "#34d399"], ["100%", "#065f46"]].forEach(([offset, color]) => {
        const stop = document.createElementNS(svgNs, "stop");
        stop.setAttribute("offset", offset);
        stop.setAttribute("stop-color", color);
        g.appendChild(stop);
      });
      defs.appendChild(g);
    }
  }

  function renderCanTopology() {
    const svg = $("sc-dc-svg");
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    ensureSvgDefs(svg);
    const hubX = 210;
    const hubY = 56;
    const hubNode = canNodes.find((n) => n.name === "org.ardupilot") || canNodes[0] || { nodeId: 0, status: "offline", title: "Flight Controller" };
    const children = canNodes.filter((n) => n !== hubNode && n.nodeId !== hubNode.nodeId);
    const count = children.length;
    const span = 340;
    const left = hubX - span / 2;

    const hubText = document.createElementNS(svgNs, "text");
    hubText.setAttribute("x", hubX);
    hubText.setAttribute("y", hubY + 5);
    hubText.setAttribute("text-anchor", "middle");
    hubText.setAttribute("fill", "#e8ecf4");
    hubText.setAttribute("font-size", "12");
    hubText.textContent = `${hubNode.title || hubNode.name} (${hubNode.nodeId})`;
    svg.appendChild(hubText);

    const hubRect = document.createElementNS(svgNs, "rect");
    const hubTextWidth = typeof hubText.getComputedTextLength === "function" ? hubText.getComputedTextLength() : 0;
    const hubRectWidth = Math.max(144, Math.ceil(hubTextWidth + 28));
    hubRect.setAttribute("x", hubX - hubRectWidth / 2);
    hubRect.setAttribute("y", hubY - 22);
    hubRect.setAttribute("width", String(hubRectWidth));
    hubRect.setAttribute("height", "44");
    hubRect.setAttribute("rx", "8");
    hubRect.setAttribute("fill", "#1e2235");
    hubRect.setAttribute("stroke", hubNode.status === "online" ? "#10b981" : "#ef4444");
    svg.insertBefore(hubRect, hubText);

    children.forEach((node, i) => {
      const nx = left + (count === 1 ? span / 2 : (i / Math.max(1, count - 1)) * span);
      const ny = 280;
      const link = document.createElementNS(svgNs, "line");
      link.setAttribute("x1", hubX);
      link.setAttribute("y1", hubY + 22);
      link.setAttribute("x2", nx);
      link.setAttribute("y2", ny - 28);
      link.setAttribute("stroke", "#3d4f6a");
      link.setAttribute("stroke-width", "2");
      link.setAttribute("stroke-dasharray", "6 4");
      svg.appendChild(link);

      const rect = document.createElementNS(svgNs, "rect");
      rect.setAttribute("x", nx - 70);
      rect.setAttribute("y", ny - 26);
      rect.setAttribute("width", "140");
      rect.setAttribute("height", "52");
      rect.setAttribute("rx", "8");
      rect.setAttribute("fill", "#1a2033");
      rect.setAttribute("stroke", "#10b981");
      rect.setAttribute("stroke-width", "1.5");
      svg.appendChild(rect);

      const text1 = document.createElementNS(svgNs, "text");
      text1.setAttribute("x", nx - 38);
      text1.setAttribute("y", ny - 4);
      text1.setAttribute("fill", "#cfd4e6");
      text1.setAttribute("font-size", "11");
      text1.textContent = (node.title || node.name).slice(0, 12);
      svg.appendChild(text1);

      const text2 = document.createElementNS(svgNs, "text");
      text2.setAttribute("x", nx - 38);
      text2.setAttribute("y", ny + 12);
      text2.setAttribute("fill", "#8b95a8");
      text2.setAttribute("font-size", "10");
      text2.textContent = `ID ${node.nodeId}`;
      svg.appendChild(text2);
    });
  }

  function buildNodeDsdlEntries(node) {
    if (!node) return {};
    const entries = { ...(node.dsdlData || {}) };
    const canId = node.lastCanId;
    if (!canId || canId === "--") return entries;

    const meta = dronecanRegistry()?.describeMessage?.(canId) || {};
    if (meta.fullName) entries["message.type"] = meta.fullName;
    if (meta.shortName) entries["message.short"] = messageDisplayLabel(meta);
    if (meta.labelZh) entries["message.label_zh"] = meta.labelZh;
    if (meta.dataTypeId != null) entries["message.data_type_id"] = meta.dataTypeId;

    const decodeFrames = getDecodeFramesForCan(node, canId);
    const lastFr = decodeFrames.length ? decodeFrames[decodeFrames.length - 1] : null;
    const decoded = dronecanDecode()?.decodeTransfer?.(
      canId,
      lastFr?.dataHex || node.lastDataHex || "",
      lastFr?.dlc ?? node.lastDlc ?? 0,
      { recentFrames: decodeFrames, anchorTs: lastFr?.ts }
    );
    if (decoded?.fields) {
      decoded.fields.forEach((field) => {
        entries[`decode.${field.name}`] = field.value;
      });
    }
    return entries;
  }

  function renderDsdlTable(node) {
    const tbody = document.querySelector("#sc-dsdl-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!node) return;
    const entries = buildNodeDsdlEntries(node);
    const rows = Object.entries(entries);
    if (!rows.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="2" class="muted">${dcText(`Waiting for CAN frames on node ${node.nodeId}…`, `等待节点 ${node.nodeId} 的 CAN 帧…`)}</td>`;
      tbody.appendChild(tr);
      return;
    }
    rows.forEach(([k, v]) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${k}</td><td>${String(v)}</td>`;
      tbody.appendChild(tr);
    });
  }

  function renderNodeDetail(node) {
    if ($("sc-dc-node-title")) {
      $("sc-dc-node-title").textContent = node
        ? `${dcText("Node", "节点")} ${node.nodeId} · ${node.name}`
        : dcText("Node detail", "节点详情");
    }
    const meta = $("sc-dc-node-meta");
    if (!meta) return;
    meta.innerHTML = "";
    if (!node) return;
    [
      [dcText("Node ID", "节点 ID"), node.nodeId],
      [dcText("Name", "名称"), node.name],
      [dcText("Mode", "模式"), nodeMode(node)],
      [dcText("Health", "健康"), nodeHealth(node)],
      [dcText("Uptime", "运行时长"), nodeUptime(node)],
      [dcText("Source", "来源"), node.source || dcText("DroneCAN", "DroneCAN")],
      [dcText("Discovery", "发现方式"), dcText("Direct / adapter-backed", "直连 / 适配器")],
      [dcText("HW Version", "硬件版本"), hardwareVersionForNode(node)],
      [dcText("SW Version", "软件版本"), softwareVersionForNode(node)],
    ].forEach(([k, v]) => {
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = String(k);
      dd.textContent = String(v);
      meta.appendChild(dt);
      meta.appendChild(dd);
    });
  }

  function selectCanNode(nodeId) {
    selectedCanId = nodeId;
    const node = canNodes.find((n) => n.nodeId === nodeId) || canNodes[0] || null;
    const topCanId = node
      ? Object.keys(node.frameIdCounts || {}).sort(
        (a, b) => Number(node.frameIdCounts[b]) - Number(node.frameIdCounts[a]),
      )[0] || node.lastCanId || null
      : null;
    selectedInspectorMessage = topCanId ? { nodeId, canId: topCanId } : null;
    renderNodeDetail(node);
    renderBand(node);
    renderDsdlTable(node);
    renderNodeTable();
    renderFilterTable();
    renderInspector();
    renderLogTable();
  }

  async function ensureMavlinkCanForward(bus = 1) {
    if (!isGcsSerialConnected()) return false;
    const viaBrowser = !isSerialViaBridge();

    const markMavlinkReady = (hint) => {
      slcanSessionReady = true;
      slcanBoundPort = "mavlink";
      slcanInitDone = true;
      slcanPortLostAt = 0;
      setLiveText("sc-dc-transport-badge", bus === 2 ? "MAVLink CAN2" : "MAVLink CAN1");
      if ($("sc-dc-hint") && hint) $("sc-dc-hint").textContent = hint;
    };

    if (viaBrowser && typeof window.sendCommandLong === "function") {
      try {
        await window.sendCommandLong(183, bus, 0, 0, 0, 0, 0, 0, 0);
        markMavlinkReady(
          "已启用 MAVLink CAN 转发（浏览器串口）。若节点仍为 0，请确认飞控 CAN_D1 已接 DroneCAN 设备且参数已启用 DroneCAN。"
        );
        return true;
      } catch (e) {
        if ($("sc-dc-hint")) {
          $("sc-dc-hint").textContent = `CAN_FORWARD 发送失败: ${e?.message || e}`;
        }
      }
    }

    try {
      const resp = await bridgeJson("/slcan-forward-enable", { bus });
      markMavlinkReady(
        "经 COM 桥 MAVLink 转发 DroneCAN。若仍为 0 帧/s，请确认 CAN 接线与 DroneCAN 参数。"
      );
      const transport = resp?.transport || "mavlink";
      if ($("sc-dc-transport-badge") && transport === "slcan") {
        setLiveText("sc-dc-transport-badge", "MAVLink（SLCAN 汇聚）");
      }
      return true;
    } catch (e) {
      slcanSessionReady = false;
      if ($("sc-dc-hint")) {
        $("sc-dc-hint").textContent = `MAVLink CAN 转发失败: ${e?.message || e}。请先在顶部连接 [MAVLink] 串口，或运行 GCS.cmd 启动 COM 桥。`;
      }
      return false;
    }
  }

  async function tryOpenBridgeSlcan(adapterPort) {
    if (!adapterPort || adapterPort.startsWith("auth:")) return false;
    if (!window._comBridgeOnline) return false;
    slcanPortLostAt = 0;
    try {
      const status = await bridgeJson("/slcan-status");
      const portChanged = !status.open || status.port !== adapterPort;
      if (portChanged) {
        await bridgeJson("/slcan-open", { port: adapterPort, baudrate: 115200, bitrate_kbps: 1000 });
        slcanBoundPort = adapterPort;
        slcanInitDone = true;
      } else if (!slcanInitDone) {
        await bridgeJson("/slcan-init", { bitrate_kbps: 1000 });
        slcanInitDone = true;
        slcanBoundPort = adapterPort;
      }
      slcanInitRetryAt = 0;
      slcanSessionReady = true;
      setLiveText("sc-dc-transport-badge", `SLCAN 直连 · ${adapterPort}`);
      if ($("sc-dc-hint")) {
        $("sc-dc-hint").textContent = `SLCAN 直连（COM 桥 ${adapterPort}）。顶部 MAVLink 与 DroneCAN 各走一路 USB，由 GCS.cmd 提供 8765 桥接。`;
      }
      return true;
    } catch (e) {
      slcanInitRetryAt = Date.now() + 30000;
      if ($("sc-dc-hint")) {
        $("sc-dc-hint").textContent = `SLCAN 初始化失败: ${e?.message || e}`;
      }
      return false;
    }
  }

  async function ensureSlcanDirectSession() {
    if (!isDronecanPanelActive()) return;
    if (isSlcanAutotestMode()) {
      slcanSessionReady = true;
      setLiveText("sc-dc-transport-badge", "SLCAN 自测");
      if ($("sc-dc-hint")) $("sc-dc-hint").textContent = "SLCAN 自测：帧来自 /slcan-inject（无需硬件）。";
      return;
    }
    if (slcanInitRetryAt && Date.now() < slcanInitRetryAt) {
      return;
    }
    if (preferMavlinkCanTransport() && currentMode !== "slcan") {
      await ensureMavlinkCanForward(currentMode === "can2" ? 2 : 1);
      return;
    }

    let webPortCount = Array.isArray(window._knownPorts) ? window._knownPorts.length : 0;
    if (typeof window.refreshKnownWebPorts === "function") {
      try {
        webPortCount = (await window.refreshKnownWebPorts()).length;
      } catch (_) { /* ignore */ }
    }
    const slcanEligible =
      typeof window.countSlcanEligibleWebPorts === "function" ? window.countSlcanEligibleWebPorts() : 0;

    if (currentMode === "slcan" && isGcsSerialConnected() && slcanEligible < 1) {
      const ok = await ensureMavlinkCanForward(1);
      if ($("sc-dc-hint")) {
        $("sc-dc-hint").textContent = ok
          ? "当前仅授权 1 路串口（已被顶部 MAVLink 占用）。已自动 CAN_FORWARD 经同一 USB 读 DroneCAN；若仍为 0 帧/s：检查 CAN 线和参数，或在下拉「＋ 授权第二路」后重试 SLCAN 直连。"
          : "仅 1 路串口且 CAN_FORWARD 失败。请在下拉点「＋ 授权第二路 USB 串口」，或改点「MAVLink CAN1」。";
      }
      if (ok) return;
    }

    const pickerVal = document.getElementById("sc-dc-slcan-port")?.value || "";
    let adapterPort = detectSlcanAdapterPort();

    if (
      !window.__gcsLiveServerDev &&
      currentMode === "slcan" &&
      adapterPort &&
      !adapterPort.startsWith("auth:") &&
      !pickerVal.startsWith("auth:")
    ) {
      try {
        await ensureDcBridgeOnce();
      } catch (_) { /* ignore */ }
      if (await tryOpenBridgeSlcan(adapterPort)) return;
    }

    const canWebSlcan =
      typeof window.hasWebSerialApi === "function" &&
      window.hasWebSerialApi() &&
      (pickerVal.startsWith("auth:") || slcanEligible >= 1 || !!window.__gcsLiveServerDev);

    if (canWebSlcan && typeof window.ensureSlcanWebSerial === "function") {
      const ok = await window.ensureSlcanWebSerial({
        pickerValue: pickerVal,
        baudRate: 115200,
        bitrateKbps: 1000,
      });
      if (ok) {
        slcanSessionReady = true;
        slcanBoundPort = "webserial";
        slcanInitDone = true;
        slcanPortLostAt = 0;
        const idx =
          typeof window.resolveSlcanWebSerialAuthIndex === "function"
            ? window.resolveSlcanWebSerialAuthIndex({ pickerValue: pickerVal })
            : -1;
        if ($("sc-dc-transport-badge")) {
          setLiveText("sc-dc-transport-badge", idx >= 0 ? `SLCAN 浏览器·第${idx + 1}路` : "SLCAN 浏览器串口");
        }
        if ($("sc-dc-hint")) {
          $("sc-dc-hint").textContent = "SLCAN 直连（Chrome 第二路 Web Serial，无需 GCS.cmd）。顶部保持 MAVLink 连接；本页显示 SLCAN 监听到的节点。";
        }
        return;
      }
    }

    adapterPort = adapterPort || (slcanBoundPort !== "mavlink" && slcanBoundPort !== "webserial" ? slcanBoundPort : "");
    if (!adapterPort || adapterPort.startsWith("auth:")) {
      if (isGcsSerialConnected()) {
        const ok = await ensureMavlinkCanForward(1);
        if (currentMode === "slcan" && $("sc-dc-hint")) {
          $("sc-dc-hint").textContent = ok
            ? "SLCAN 桥不可用；已用顶部 MAVLink 口 CAN_FORWARD。若仍为 0：确认 CAN_D1 接 DroneCAN 设备。"
            : "SLCAN 未就绪且 CAN_FORWARD 失败。请「＋ 授权第二路」或运行 GCS.cmd。";
        }
        return;
      }
      if (slcanBoundPort && slcanBoundPort !== "mavlink" && slcanPortLostAt && (Date.now() - slcanPortLostAt) < 30000) {
        return;
      }
      slcanSessionReady = false;
      slcanInitDone = false;
      slcanBoundPort = "";
      slcanRuntime.nodes.clear();
      slcanRuntime.framesPerSecond = 0;
      if ($("sc-dc-hint")) {
        $("sc-dc-hint").textContent =
          "未找到 SLCAN 口：请在上方下拉指定 SLCAN 虚拟口，或先在顶部用 [MAVLink] 口连接（会自动配对另一路为 SLCAN）。";
      }
      return;
    }
    slcanPortLostAt = 0;
    try {
      const status = await bridgeJson("/slcan-status");
      const portChanged = !status.open || status.port !== adapterPort;
      if (portChanged) {
        await bridgeJson("/slcan-open", { port: adapterPort, baudrate: 115200, bitrate_kbps: 1000 });
        slcanBoundPort = adapterPort;
        slcanInitDone = true;
      } else if (!slcanInitDone) {
        await bridgeJson("/slcan-init", { bitrate_kbps: 1000 });
        slcanInitDone = true;
        slcanBoundPort = adapterPort;
      }
      slcanInitRetryAt = 0;
      slcanSessionReady = true;
      setLiveText("sc-dc-transport-badge", `SLCAN 直连 · ${adapterPort}`);
      if ($("sc-dc-hint")) $("sc-dc-hint").textContent = `SLCAN 直连已绑定 ${adapterPort}，仅显示直接观测到的节点。`;
    } catch (e) {
      slcanSessionReady = false;
      slcanInitDone = false;
      slcanInitRetryAt = Date.now() + 30000;
      if (!slcanBoundPort) {
        slcanRuntime.nodes.clear();
        slcanRuntime.framesPerSecond = 0;
      }
      if ($("sc-dc-hint")) {
        const liveHint = window.__gcsLiveServerDev && isGcsSerialConnected()
          ? " 可改用「MAVLink CAN1」标签，或运行 GCS.cmd 启用 SLCAN 桥。"
          : "";
        $("sc-dc-hint").textContent = `SLCAN 直连打开失败: ${e?.message || e}.${liveHint}`;
      }
      if (typeof window.ensureSlcanWebSerial === "function") {
        const webOk = await window.ensureSlcanWebSerial({ baudRate: 115200, bitrateKbps: 1000 });
        if (webOk) {
          slcanSessionReady = true;
          slcanBoundPort = "webserial";
          slcanInitDone = true;
          if ($("sc-dc-hint")) {
            $("sc-dc-hint").textContent = "COM 桥不可用，已改用浏览器 Web Serial 第二路 SLCAN。";
          }
          return;
        }
      }
      if (isGcsSerialConnected() && currentMode === "slcan") {
        await ensureMavlinkCanForward(1);
      }
    }
  }

  function resetSlcanSessionState() {
    slcanSessionReady = false;
    slcanInitDone = false;
    slcanInitRetryAt = 0;
    slcanBoundPort = "";
    slcanPortLostAt = 0;
    if (typeof window.closeSlcanWebSerial === "function") {
      window.closeSlcanWebSerial().catch(() => {});
    }
  }

  function setMode(mode) {
    currentMode = mode;
    document.querySelectorAll(".sc-dc-mode-tab").forEach((btn) => btn.classList.toggle("active", btn.dataset.dcMode === mode));
    document.querySelectorAll(".sc-dc-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.dcPanel === mode));
    const transportBadge = $("sc-dc-transport-badge");
    if (transportBadge) {
      const text =
        mode === "slcan"
          ? "SLCAN 直连"
          : mode === "can1"
            ? "MAVLink CAN1"
            : mode === "can2"
              ? "MAVLink CAN2"
              : mode.toUpperCase();
      setLiveText("sc-dc-transport-badge", text);
      transportBadge.classList.toggle("sc-dc-live", mode === "slcan" && slcanSessionReady);
    }
    if (mode === "can1" || mode === "can2") {
      ensureMavlinkCanForward(mode === "can2" ? 2 : 1).then(() => tick()).catch(() => tick());
      return;
    }
    ensureSlcanDirectSession().then(() => tick()).catch(() => tick());
  }

  async function tick() {
    try {
      await injectSlcanAutotestFrame();
      await maybeRefreshCanForward(currentMode === "can2" ? 2 : 1);
      await pollSlcanTraffic();
    } catch (_) {
      // Keep the UI alive even if a single poll fails.
    }
    refreshDroneCanModel();
    renderNodeTable();
    renderFilterTable();
    renderInspector();
    renderLogTable();
    renderCanBusMeta();
    renderCanTopology();
    const node = canNodes.find((n) => n.nodeId === selectedCanId) || canNodes[0] || null;
    renderBand(node);
    renderNodeDetail(node);
    renderDsdlTable(node);
  }

  function refreshDroneCanClock() {
    if (!isDronecanPanelActive()) return;
    const node = canNodes.find((n) => n.nodeId === selectedCanId) || canNodes[0] || null;
    renderNodeDetail(node);
    renderNodeTable();
    renderInspector();
    renderBand(node);
  }

  function startDcTelemetry() {
    stopDcTelemetry();
    ensureSlcanDirectSession().then(async () => {
      await tick();
      dcClockTimer = window.setInterval(() => {
        refreshDroneCanClock();
      }, 1000);
      dcTimer = window.setInterval(() => {
        if (slcanSessionReady || currentMode === "can1" || currentMode === "can2") {
          tick().catch(() => tick());
          return;
        }
        ensureSlcanDirectSession().then(() => tick()).catch(() => tick());
      }, 1500);
    }).catch(() => {
      tick();
      dcClockTimer = window.setInterval(() => {
        refreshDroneCanClock();
      }, 1000);
      dcTimer = window.setInterval(() => {
        if (slcanSessionReady || currentMode === "can1" || currentMode === "can2") {
          tick().catch(() => tick());
          return;
        }
        ensureSlcanDirectSession().then(() => tick()).catch(() => tick());
      }, 1500);
    });
  }

  function stopDcTelemetry() {
    clearInterval(dcTimer);
    dcTimer = 0;
    clearInterval(dcClockTimer);
    dcClockTimer = 0;
  }

  function bindDroneCan() {
    if (uiBound) return;
    uiBound = true;
    document.addEventListener("click", async (ev) => {
      const modeBtn = ev.target.closest(".sc-dc-mode-tab");
      if (modeBtn) setMode(modeBtn.dataset.dcMode || "slcan");
      if (ev.target && ev.target.id === "sc-dc-scan") tick();
      const menuBtn = ev.target.closest("[data-dc-menu-node]");
      if (menuBtn) {
        ev.stopPropagation();
        const nodeId = Number(menuBtn.getAttribute("data-dc-menu-node"));
        if (menuNodeId === nodeId && !$("sc-dc-menu")?.hidden) hideNodeMenu();
        else showNodeMenu(nodeId, menuBtn);
        return;
      }
      const menuAction = ev.target.closest("[data-dc-menu-action]");
      if (menuAction) {
        ev.stopPropagation();
        await handleNodeMenuAction(menuAction.getAttribute("data-dc-menu-action"));
        return;
      }
      if (ev.target && ev.target.id === "sc-dc-modal-close") {
        closeDcModal();
        return;
      }
      const paramRow = ev.target.closest("[data-dc-param-index]");
      if (paramRow) {
        dcMenuState.paramSelectedIndex = Number(paramRow.getAttribute("data-dc-param-index"));
        renderParametersModal(getSelectedNode());
        return;
      }
      if (ev.target && ev.target.id === "sc-dc-param-refresh") {
        const node = getSelectedNode();
        setModalStatus(dcText("Refreshing parameters from node…", "正在重新读取节点参数…"), "warn");
        ensureNodeParametersLoaded(node, { force: true })
          .then(() => setModalStatus(dcText("Node parameters refreshed.", "节点参数已刷新。"), "ok"))
          .catch((err) => setModalStatus(dcText(`Refresh failed: ${err?.message || err}`, `刷新失败：${err?.message || err}`), "err"));
        return;
      }
      if (ev.target && ev.target.id === "sc-dc-param-save") {
        const node = getSelectedNode();
        const saved = saveLocalNodeParameters(node?.nodeId);
        setModalStatus(saved ? dcText("Saved node parameter snapshot locally.", "已将节点参数快照保存到本地。") : dcText("Failed to save local snapshot.", "本地快照保存失败。"), saved ? "ok" : "err");
        return;
      }
      if (ev.target && ev.target.id === "sc-dc-param-load") {
        const node = getSelectedNode();
        const ok = loadLocalNodeParameters(node?.nodeId);
        renderParametersModal(node);
        setModalStatus(ok ? dcText("Loaded local parameter snapshot.", "已加载本地参数快照。") : dcText("No local snapshot found for this node.", "未找到该节点的本地参数快照。"), ok ? "ok" : "warn");
        return;
      }
      if (ev.target && ev.target.id === "sc-dc-param-reset-draft") {
        const node = getSelectedNode();
        const selected = selectedNodeParam(node?.nodeId);
        if (selected) {
          clearParamDraft(node.nodeId, selected.index);
          renderParametersModal(node);
          setModalStatus(dcText("Draft reset to current node value.", "草稿已重置为当前节点值。"), "ok");
        }
        return;
      }
      if (ev.target && ev.target.id === "sc-dc-param-write") {
        const node = getSelectedNode();
        const selected = selectedNodeParam(node?.nodeId);
        if (!selected) return;
        try {
          const rawValue = $("sc-dc-param-edit-value")?.value ?? "";
          const draftValue = parseDraftByType(selected.type, rawValue);
          setParamDraft(node.nodeId, selected.index, draftValue);
          setModalStatus(dcText("Writing parameter to node…", "正在向节点写入参数…"), "warn");
          const response = await dronecanGetSet(node.nodeId, selected.index, toValueUnion(selected.type, draftValue), "");
          if (!response?.name) throw new Error("Parameter write was rejected");
          const entry = cacheEntryForNode(node.nodeId);
          const row = (entry.params || []).find((param) => param.index === selected.index);
          if (row) {
            row.value = response.value.value;
            row.type = response.value.type;
            row.defaultValue = response.defaultValue?.value;
            row.defaultType = response.defaultValue?.type || row.defaultType;
            row.minValue = response.minValue?.value;
            row.minType = response.minValue?.type || row.minType;
            row.maxValue = response.maxValue?.value;
            row.maxType = response.maxValue?.type || row.maxType;
          }
          const ok = valuesEqual(response.value.value, draftValue);
          if (ok) clearParamDraft(node.nodeId, selected.index);
          renderParametersModal(node);
          setModalStatus(ok ? dcText("Parameter written and verified.", "参数写入并回读校验成功。") : dcText(`Verify mismatch: device returned ${formatParamValue(response.value.value, response.value.type)}`, `回读不一致：设备返回 ${formatParamValue(response.value.value, response.value.type)}`), ok ? "ok" : "err");
        } catch (err) {
          setModalStatus(dcText(`Write failed: ${err?.message || err}`, `写入失败：${err?.message || err}`), "err");
        }
        return;
      }
      if (ev.target && ev.target.id === "sc-dc-param-persist") {
        const node = getSelectedNode();
        try {
          setModalStatus(dcText("Saving parameters to node flash…", "正在将参数保存到节点 Flash…"), "warn");
          const result = await executeParamOpcode(node.nodeId, 0);
          if (!result.ok) throw new Error(`opcode rejected (${result.argument})`);
          setModalStatus(dcText("Node acknowledged parameter save.", "节点已确认保存参数。"), "ok");
        } catch (err) {
          setModalStatus(dcText(`Node save failed: ${err?.message || err}`, `节点保存失败：${err?.message || err}`), "err");
        }
        return;
      }
      if (ev.target && ev.target.id === "sc-dc-restart-confirm") {
        try {
          if (typeof window.sendCommandLong !== "function") throw new Error("sendCommandLong unavailable");
          const enableReconnect = !!$("sc-dc-restart-autoreconnect")?.checked;
          const delaySeconds = Math.max(3, Math.min(60, Number($("sc-dc-restart-delay")?.value || 12)));
          setModalStatus(dcText("Sending reboot command…", "正在下发重启指令…"), "warn");
          await window.sendCommandLong(REBOOT_COMMAND, 1, 0, 0, 0, 0, 0, 0, 0);
          if (typeof window.closeSerialResources === "function") {
            await window.closeSerialResources({ fast: true });
          }
          setModalStatus(dcText("Link closed after reboot command.", "重启指令已下发，链路已断开。"), "ok");
          if (enableReconnect) {
            triggerAutoReconnect(delaySeconds);
          }
        } catch (err) {
          setModalStatus(dcText(`Restart failed: ${err?.message || err}`, `重启失败：${err?.message || err}`), "err");
        }
        return;
      }
      if (ev.target && ev.target.id === "sc-dc-update-online") {
        try {
          const url = String($("sc-dc-update-url")?.value || "").trim();
          if (!url) {
            setModalStatus(dcText("Enter the stable firmware URL first.", "请先输入稳定版固件 URL。"), "warn");
            return;
          }
          setModalStatus(dcText("Fetching stable firmware…", "正在拉取稳定版固件…"), "warn");
          const resp = await fetch(url, { cache: "no-store" });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const buf = new Uint8Array(await resp.arrayBuffer());
          window.__dcFetchedFirmware = { name: url.split("/").pop() || "stable.bin", bytes: buf };
          setModalStatus(dcText(`Stable firmware ready: ${window.__dcFetchedFirmware.name}`, `稳定版固件已就绪：${window.__dcFetchedFirmware.name}`), "ok");
        } catch (err) {
          setModalStatus(dcText(`Fetch failed: ${err?.message || err}`, `拉取失败：${err?.message || err}`), "err");
        }
        return;
      }
      if (ev.target && ev.target.id === "sc-dc-update-start") {
        try {
          const node = getSelectedNode();
          const fileInput = $("sc-dc-update-file");
          let payload = window.__dcFetchedFirmware || null;
          if (!payload && fileInput?.files?.[0]) {
            payload = { name: fileInput.files[0].name, bytes: await readFileAsUint8Array(fileInput.files[0]) };
          }
          if (!payload) {
            setModalStatus(dcText("Choose a local firmware or fetch a stable build first.", "请先选择本地固件或在线拉取稳定版。"), "warn");
            return;
          }
          await performFirmwareUpload(node, payload.name, payload.bytes);
        } catch (err) {
          setUpdateProgress(0, dcText("Upgrade aborted", "升级已终止"));
          setModalStatus(dcText(`Upgrade failed: ${err?.message || err}`, `升级失败：${err?.message || err}`), "err");
        }
        return;
      }
      if (ev.target && ev.target.id === "sc-dc-update-cancel") {
        setUpdateProgress(0, dcText("Upgrade aborted", "升级已终止"));
        setModalStatus(dcText("Upgrade aborted by user.", "用户已终止升级。"), "warn");
        return;
      }
      if (ev.target && ev.target.id === "sc-dc-modal-backdrop") {
        closeDcModal();
        return;
      }
      if (!ev.target.closest("#sc-dc-menu")) hideNodeMenu();
    });
    document.addEventListener("input", (ev) => {
      if (ev.target && ev.target.id === "sc-dc-filter-input") renderFilterTable();
      if (ev.target && ev.target.id === "sc-dc-param-search") {
        dcMenuState.paramSearch = String(ev.target.value || "");
        renderParametersModal(getSelectedNode());
      }
    });
    document.addEventListener("change", (ev) => {
      if (ev.target && ev.target.id === "sc-dc-health-filter") renderFilterTable();
    });
    document.addEventListener("dc-menu-open", (ev) => {
      const nodeId = Number(ev?.detail?.nodeId || 0);
      const btn = document.querySelector(`#sc-dc-node-body button[data-dc-menu-node="${nodeId}"]`);
      if (nodeId && btn) showNodeMenu(nodeId, btn);
    });
    document.addEventListener("click", (ev) => {
      const nodeHead = ev.target.closest("[data-node-head]");
      if (nodeHead) {
        const nodeId = Number(nodeHead.getAttribute("data-node-head"));
        if (Number.isFinite(nodeId)) {
          if (inspectorOpenState.nodes.has(nodeId)) inspectorOpenState.nodes.delete(nodeId);
          else inspectorOpenState.nodes.add(nodeId);
          renderInspector();
        }
        return;
      }
      const groupHead = ev.target.closest("[data-group-head]");
      if (groupHead) {
        const key = String(groupHead.getAttribute("data-group-head") || "");
        if (key) {
          if (inspectorOpenState.groups.has(key)) inspectorOpenState.groups.delete(key);
          else inspectorOpenState.groups.add(key);
          renderInspector();
        }
        return;
      }
      const canHead = ev.target.closest("[data-can-id]");
      if (canHead) {
        const selection = parseInspectorSelection(canHead.getAttribute("data-can-id"));
        if (selection) {
          selectedCanId = selection.nodeId;
          selectedInspectorMessage = selection;
          const selectedNode = canNodes.find((n) => n.nodeId === selection.nodeId) || canNodes[0] || null;
          if ($("sc-dc-node-title")) {
            $("sc-dc-node-title").textContent = selectedNode
              ? `${dcText("Node", "节点")} ${selectedNode.nodeId} · ${selectedNode.name}`
              : dcText("Node detail", "节点详情");
          }
          renderBand(selectedNode);
          renderDsdlTable(selectedNode);
          renderLogTable();
          renderInspector();
        }
        return;
      }
    });
  }

  function syncDronecanPanel() {
    const panel = panelRoot();
    const active = isDronecanPanelActive();

    if (active && !dronecanPanelWasActive) {
      dronecanPanelWasActive = true;
      if (panel && !panel.classList.contains("active")) panel.classList.add("active");
      ensureWorkbenchMarkup();
      ensureExtraStyles();
      bindDroneCan();
      if (isInspectorDemoMode()) {
        currentMode = "inspector";
        selectedCanId = 51;
        selectedInspectorMessage = { nodeId: 51, canId: "0x18044433" };
        slcanSessionReady = true;
      }
      if (isSlcanAutotestMode()) {
        slcanSessionReady = true;
      }
      refreshDroneCanModel();
      selectCanNode(selectedCanId || canNodes[0]?.nodeId || 0);
      prepareSlcanPickerForPanel().then(() => {
        const hasWebSlcan2 =
          typeof window.countSlcanEligibleWebPorts === "function" && window.countSlcanEligibleWebPorts() > 0;
        const bridgeSlcan =
          !!window.__gcsRuntimeNative &&
          typeof window.getSlcanDeviceId === "function" &&
          !!window.getSlcanDeviceId();
        const hasSlcan2 = hasWebSlcan2 || bridgeSlcan;
        const initialMode = hasSlcan2 ? "slcan" : preferMavlinkCanTransport() ? "can1" : "slcan";
        setMode(initialMode);
        startDcTelemetry();
      }).catch(() => {
        setMode(preferMavlinkCanTransport() ? "can1" : "slcan");
        startDcTelemetry();
      });
    } else if (!active && dronecanPanelWasActive) {
      dronecanPanelWasActive = false;
      dcBridgeEnsured = false;
      stopDcTelemetry();
      const exitSlcan = $("sc-dc-exit-slcan");
      if (exitSlcan?.checked) {
        bridgeJson("/slcan-close", null, { skipEnsure: true }).catch(() => {});
        resetSlcanSessionState();
      }
    } else if (active) {
      ensureWorkbenchMarkup();
      ensureExtraStyles();
      tick();
    }
  }

  function openDronecanAutotestView() {
    const mainTab = document.querySelector('.main-tab[data-view="initial-setup"]');
    if (mainTab) mainTab.click();
    const dronecanBtn = document.querySelector('.ov-nav-item[data-setup-panel="dronecan"]');
    if (dronecanBtn) dronecanBtn.click();
  }

  function boot() {
    ensureExtraStyles();
    bindDroneCan();
    window.openDronecanNodeMenu = (nodeId, anchorEl) => {
      toggleNodeMenu(nodeId, anchorEl);
    };
    if (isSlcanAutotestMode()) {
      window.requestAnimationFrame(() => {
        openDronecanAutotestView();
        window.requestAnimationFrame(syncDronecanPanel);
      });
    }
    document.querySelectorAll(".ov-nav-item[data-setup-panel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.setupPanel || "";
        document.querySelectorAll(".ov-panel").forEach((panel) => {
          panel.classList.toggle("active", panel.id === `setup-panel-${key}`);
        });
        window.requestAnimationFrame(syncDronecanPanel);
      });
    });
    document.addEventListener("gcs-connection", () => {
      if (typeof window._fillSlcanPortPicker === "function") window._fillSlcanPortPicker();
      if (isDronecanPanelActive()) {
        if (detectSlcanAdapterPort()) {
          ensureSlcanDirectSession().catch(() => {});
        } else if (preferMavlinkCanTransport()) {
          ensureMavlinkCanForward(1).catch(() => {});
        }
      }
      window.requestAnimationFrame(syncDronecanPanel);
    });
    document.addEventListener("gcs-airframe-params-changed", () => window.requestAnimationFrame(syncDronecanPanel));
    window.requestAnimationFrame(syncDronecanPanel);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
