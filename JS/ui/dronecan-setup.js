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
  const inspectorOpenState = {
    nodes: new Set(),
    groups: new Set(),
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

  window.getDroneCanCachedFrames = getCachedFramesForCan;
  const nodeRetentionMs = 20000;
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
    browserCanMonitor.nodeRecentFrames.set(nodeId, recent.slice(-FRAME_RING_PER_NODE));

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

    const counts = browserCanMonitor.nodeFrameCounts.get(nodeId) || {};
    counts[node.lastCanId] = (counts[node.lastCanId] || 0) + 1;
    browserCanMonitor.nodeFrameCounts.set(nodeId, counts);
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
          $("sc-dc-hint").textContent = "仍未检测到第2路。请在弹窗中选另一个 COM，或先用「MAVLink-CAN1」。";
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
    if (node.status === "online") return dcText("OK", "正常");
    if (node.status === "stale" || node.stale) return dcText("STALE", "暂存");
    return dcText("OFFLINE", "离线");
  }

  function nodeMode(node) {
    if (node.status === "online") return dcText("OPERATIONAL", "运行中");
    if (node.status === "stale" || node.stale) return dcText("HOLD", "保持");
    return dcText("IDLE", "空闲");
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
      const decoded = decoder?.decodeTransfer?.(fr?.canId, fr?.dataHex || "", fr?.dlc ?? 0, { recentFrames: [fr], anchorTs: fr?.ts });
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
    if (incomingNodes.length === 0 && slcanRuntime.nodes.size > 0 && (now - lastLiveSnapshotAt) <= nodeRetentionMs) {
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
        <div class="sc-dc-mode-tabs" role="tablist" aria-label="${dcText("DroneCAN modes", "DroneCAN 模式")}">
          <button type="button" class="sc-dc-mode-tab active" data-dc-mode="slcan">${dcText("SLCAN Direct", "SLCAN 直连")}</button>
          <button type="button" class="sc-dc-mode-tab" data-dc-mode="can1">${dcText("MAVLink CAN1", "MAVLink 经 CAN1")}</button>
          <button type="button" class="sc-dc-mode-tab" data-dc-mode="can2">${dcText("MAVLink CAN2", "MAVLink 经 CAN2")}</button>
          <button type="button" class="sc-dc-mode-tab" data-dc-mode="filter">${dcText("Filter", "筛选")}</button>
          <button type="button" class="sc-dc-mode-tab" data-dc-mode="inspector">${dcText("Inspector", "解析器")}</button>
          <button type="button" class="sc-dc-mode-tab" data-dc-mode="stats">${dcText("Stats", "统计")}</button>
        </div>
        <div class="sc-dc-toolbar-right">
          <label class="sc-dc-slcan-port-label">${dcText("SLCAN Port", "SLCAN 端口")}
            <select id="sc-dc-slcan-port" class="sc-dc-slcan-port-select" title="${dcText("CUAV one USB exposes two virtual ports. Pick the non-MAVLink side.", "CUAV 一根 USB 会暴露两个虚拟口，请选非 MAVLink 的那一路")}"></select>
          </label>
          <button type="button" id="sc-dc-auth-slcan2" class="sc-btn sc-btn-ghost sc-btn-sm" title="${dcText("Grant the second Web Serial lane in Chrome.", "在 Chrome 中授权第二路 Web Serial")}">${dcText("＋ Authorize 2nd", "＋ 授权第二路")}</button>
          <label class="sc-dc-check"><input type="checkbox" id="sc-dc-exit-slcan" checked> ${dcText("Exit SLCAN on leave?", "离开时退出 SLCAN？")}</label>
          <label class="sc-dc-check"><input type="checkbox" id="sc-dc-log"> ${dcText("Log", "记录")}</label>
        </div>
      </div>
      <div class="sc-dc-hint-row">
        <div id="sc-dc-transport-badge" class="sc-pill sc-pill-ok">${dcText("SLCAN Direct", "SLCAN 直连")}</div>
        <div id="sc-dc-hint" class="sc-prose sc-prose--sm">${dcText("Only directly observed SLCAN nodes are shown. Brief polling drops are held shortly and marked STALE.", "仅显示直接观测到的 SLCAN 节点，短暂轮询丢包会暂存并标记为 STALE。")}</div>
      </div>
      <div id="sc-dc-menu" class="sc-dc-menu" hidden>
        <button type="button" class="sc-dc-menu-item" data-dc-menu-action="refresh-node">${dcText("Refresh node info", "刷新节点信息")}</button>
        <button type="button" class="sc-dc-menu-item" data-dc-menu-action="copy-node-id">${dcText("Copy Node ID", "复制节点 ID")}</button>
        <button type="button" class="sc-dc-menu-item" data-dc-menu-action="copy-can-id">${dcText("Copy last CAN ID", "复制最近 CAN ID")}</button>
        <button type="button" class="sc-dc-menu-item" data-dc-menu-action="show-raw">${dcText("Show raw frames", "查看原始帧")}</button>
        <button type="button" class="sc-dc-menu-item" data-dc-menu-action="focus-inspector">${dcText("Focus inspector", "聚焦解析器")}</button>
      </div>

      <div class="sc-dc-panel active" data-dc-panel="slcan">
        <div class="sc-dc-grid">
          <div class="sc-dc-main">
            <div class="sc-card-head">
              <h3>${dcText("Online nodes", "在线节点")}</h3>
              <div class="sc-btn-row">
                <button type="button" id="sc-dc-scan" class="sc-btn sc-btn-ghost sc-btn-sm">${dcText("Refresh", "刷新")}</button>
              </div>
            </div>
            <div class="sc-table-wrap sc-dc-node-table-wrap">
              <table class="sc-dsdl-table sc-dc-node-table" id="sc-dc-node-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>${dcText("ID", "编号")}</th>
                    <th>${dcText("Name", "名称")}</th>
                    <th>${dcText("Mode", "模式")}</th>
                    <th>${dcText("Health", "健康")}</th>
                    <th>${dcText("Uptime", "运行时长")}</th>
                    <th>${dcText("HW Version", "硬件版本")}</th>
                    <th>${dcText("SW Version", "软件版本")}</th>
                    <th>${dcText("SW CRC", "软件 CRC")}</th>
                    <th>${dcText("Menu", "菜单")}</th>
                  </tr>
                </thead>
                <tbody id="sc-dc-node-body"></tbody>
              </table>
            </div>
            <div class="sc-dc-node-detail-band">
              <div class="sc-dc-band-grid">
                <div class="sc-dc-band-label">${dcText("Node", "节点")}</div>
                <div id="sc-dc-band-id" class="sc-dc-band-value">-</div>
                <div id="sc-dc-band-name" class="sc-dc-band-value">-</div>
                <div class="sc-dc-band-label">${dcText("State", "状态")}</div>
                <div id="sc-dc-band-mode" class="sc-dc-band-value">-</div>
                <div id="sc-dc-band-health" class="sc-dc-band-value">-</div>
                <div id="sc-dc-band-uptime" class="sc-dc-band-value">-</div>
                <div class="sc-dc-band-label">${dcText("Vendor code", "厂商码")}</div>
                <div id="sc-dc-band-vendor" class="sc-dc-band-value sc-dc-band-span2">-</div>
                <div class="sc-dc-band-label">${dcText("Software", "软件")}</div>
                <div id="sc-dc-band-sw" class="sc-dc-band-value">-</div>
                <div id="sc-dc-band-crc" class="sc-dc-band-value">-</div>
                <div class="sc-dc-band-label">${dcText("Hardware", "硬件")}</div>
                <div id="sc-dc-band-hw" class="sc-dc-band-value">-</div>
                <div id="sc-dc-band-uid" class="sc-dc-band-value">-</div>
              </div>
            </div>
            <div class="sc-table-wrap sc-dc-log-wrap">
              <table class="sc-dsdl-table">
                <thead><tr><th>${dcText("Node", "节点")}</th><th>${dcText("Level", "级别")}</th><th>${dcText("Source", "来源")}</th><th>${dcText("Text", "内容")}</th></tr></thead>
                <tbody id="sc-dc-log-body"></tbody>
              </table>
            </div>
          </div>

          <aside class="sc-dc-side">
            <div class="sc-subcard">
              <h4 id="sc-dc-node-title">${dcText("Node detail", "节点详情")}</h4>
              <dl id="sc-dc-node-meta" class="sc-dl"></dl>
            </div>
            <div class="sc-subcard">
              <h4>${dcText("Live fields", "实时字段")}</h4>
              <div class="sc-table-wrap">
                <table class="sc-dsdl-table" id="sc-dsdl-table">
                  <thead><tr><th>${dcText("Field", "字段")}</th><th>${dcText("Value", "数值")}</th></tr></thead>
                  <tbody></tbody>
                </table>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <div class="sc-dc-panel" data-dc-panel="can1"><div class="sc-dc-mini-grid"><div class="sc-subcard"><h4>${dcText("MAVLink CAN1", "MAVLink 经 CAN1")}</h4><dl id="sc-dc-can1-meta" class="sc-dl"></dl></div><div class="sc-subcard"><h4>${dcText("Topology", "拓扑")}</h4><div class="sc-topology-host"><svg id="sc-dc-svg" viewBox="0 0 420 420" class="sc-dc-svg" aria-label="${dcText("DroneCAN topology", "DroneCAN 拓扑")}"></svg></div></div></div></div>
      <div class="sc-dc-panel" data-dc-panel="can2"><div class="sc-dc-mini-grid"><div class="sc-subcard"><h4>${dcText("MAVLink CAN2", "MAVLink 经 CAN2")}</h4><dl id="sc-dc-can2-meta" class="sc-dl"></dl></div><div class="sc-subcard"><h4>${dcText("Status", "状态")}</h4><p class="sc-prose sc-prose--sm" id="sc-dc-can2-note">${dcText("CAN2 info is still MAVLink-routed metadata only.", "CAN2 仍仅显示 MAVLink 路由的元数据。")}</p></div></div></div>
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
      .sc-dc-workbench { margin-top:14px; position:relative; overflow:hidden; }
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
      .sc-dc-toolbar, .sc-dc-hint-row { display:flex; gap:12px; align-items:center; justify-content:space-between; flex-wrap:wrap; position:relative; z-index:1; }
      .sc-dc-toolbar { margin-bottom:12px; }
      .sc-dc-mode-tabs { display:flex; gap:6px; flex-wrap:wrap; }
      .sc-dc-mode-tab {
        position:relative;
        background:linear-gradient(180deg, #9cc23e, #7f9f29);
        color:#132003;
        border:1px solid #d8f37a;
        border-radius:999px;
        padding:7px 12px;
        font-size:12px;
        cursor:pointer;
        transition:transform .18s ease, box-shadow .18s ease, background .18s ease, color .18s ease, border-color .18s ease;
      }
      .sc-dc-mode-tab:hover { transform:translateY(-1px); box-shadow:0 10px 22px rgba(0,0,0,.18); }
      .sc-dc-mode-tab.active {
        background:linear-gradient(180deg, #ebff9f, #cfe65c);
        color:#081000;
        box-shadow:0 10px 26px rgba(152, 194, 61, 0.28);
      }
      .sc-dc-mode-tab.active::after {
        content:"";
        position:absolute;
        left:14px;
        right:14px;
        bottom:-6px;
        height:2px;
        border-radius:999px;
        background:linear-gradient(90deg, transparent, #dff57d, transparent);
      }
      .sc-dc-toolbar-right { display:flex; gap:14px; align-items:center; color:#d5dcf0; font-size:12px; position:relative; z-index:1; }
      .sc-dc-slcan-port-select { min-width: 180px; max-width: 260px; background:#1a2235; color:#e8edf8; border:1px solid #4a5c7d; border-radius:6px; padding:4px 8px; font-size:12px; }
      .sc-dc-slcan-port-select option { background:#1a2235; color:#e8edf8; }
      .sc-dc-check { display:flex; gap:6px; align-items:center; }
      .sc-dc-hint-row { padding:8px 0 12px; border-bottom:1px solid #2a3148; margin-bottom:12px; }
      #sc-dc-transport-badge { position:relative; overflow:hidden; }
      #sc-dc-transport-badge.sc-dc-live { box-shadow:0 0 0 1px rgba(224, 245, 125, .34), 0 0 24px rgba(224, 245, 125, .12); }
      .sc-dc-menu { position:fixed; z-index:2200; min-width:210px; max-width:min(320px, calc(100vw - 24px)); background:#121827; border:1px solid #39445f; border-radius:10px; box-shadow:0 18px 42px rgba(0,0,0,0.35); padding:6px; display:grid; gap:4px; }
      .sc-dc-menu[hidden] { display:none; }
      .sc-dc-menu-item { text-align:left; background:#182133; color:#e5ebf6; border:1px solid transparent; border-radius:8px; padding:9px 10px; font-size:12px; cursor:pointer; transition:background .16s ease, border-color .16s ease, transform .16s ease; }
      .sc-dc-menu-item:hover { background:#22314b; border-color:#4a5c7d; }
      .sc-dc-menu-item:hover, .sc-dc-row:hover, .sc-dc-tree-row:hover { transform:translateY(-1px); }
      .sc-dc-grid { display:grid; grid-template-columns:minmax(0, 1.45fr) minmax(320px, 0.75fr); gap:14px; }
      .sc-dc-mini-grid, .sc-dc-filter-grid, .sc-dc-inspector-grid, .sc-dc-stats-grid { display:grid; gap:14px; }
      .sc-dc-mini-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); }
      .sc-dc-filter-grid { grid-template-columns:minmax(300px, 0.9fr) minmax(0, 1.1fr); }
      .sc-dc-inspector-grid { grid-template-columns:minmax(520px, 1.35fr) minmax(0, 0.9fr); }
      .sc-dc-stats-grid { grid-template-columns:repeat(4, minmax(0, 1fr)); }
      .sc-dc-panel { display:none; }
      .sc-dc-panel.active { display:block; }
      .sc-dc-node-table-wrap { max-height:380px; }
      .sc-dc-row { cursor:pointer; transition:background .16s ease, transform .16s ease; }
      .sc-dc-row-marker { width:18px; text-align:center; color:#a8bbdf; font-size:12px; }
      .sc-dc-row:hover td { background:rgba(144, 182, 58, 0.1); }
      .sc-dc-row.active td { background:rgba(144, 182, 58, 0.18); }
      .sc-dc-node-detail-band { margin-top:12px; border:1px solid var(--sc-border); border-radius:8px; background:#171d2d; padding:10px; box-shadow:inset 0 0 0 1px rgba(255,255,255,0.02); }
      .sc-dc-band-grid { display:grid; grid-template-columns:220px 1fr 1fr 1fr; gap:6px; }
      .sc-dc-band-label, .sc-dc-band-value { min-height:24px; display:flex; align-items:center; padding:3px 8px; font-size:12px; transition:background-color .18s ease, box-shadow .18s ease, transform .18s ease; }
      .sc-dc-band-label { color:#d9e2f2; }
      .sc-dc-band-value { background:#474747; color:#ffffff; font-family:var(--sc-mono); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .sc-dc-band-span2 { grid-column:span 2; }
      #sc-dc-node-meta {
        display:grid;
        grid-template-columns:minmax(140px, 44%) minmax(0, 1fr);
        gap:6px 12px;
        margin:0;
      }
      #sc-dc-node-meta dt, #sc-dc-node-meta dd { margin:0; min-height:24px; display:flex; align-items:center; }
      #sc-dc-node-meta dt { color:#8ea2c8; white-space:nowrap; }
      #sc-dc-node-meta dd { color:#f2f6ff; font-family:var(--sc-mono); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .sc-dc-log-wrap { margin-top:12px; max-height:180px; }
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
        .sc-dc-band-grid { grid-template-columns:1fr; }
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
    const fps = slcanRuntime.framesPerSecond;
    const loadPct = Math.min(100, Math.round((fps / 1000) * 100));
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
          ? `${dcText("SLCAN Direct", "SLCAN 直连")}${detectSlcanAdapterPort() ? ` · ${detectSlcanAdapterPort()}` : ""}`
          : dcText("SLCAN Direct", "SLCAN 直连"),
      );
    }
  }

  function renderNodeTable() {
    const tbody = $("sc-dc-node-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    canNodes.forEach((node) => {
      const tr = document.createElement("tr");
      tr.className = `sc-dc-row${node.nodeId === selectedCanId ? " active" : ""}`;
      tr.innerHTML = `<td class="sc-dc-row-marker">${node.nodeId === selectedCanId ? "◉" : "○"}</td><td>${node.nodeId}</td><td>${node.name}</td><td>${nodeMode(node)}</td><td>${nodeHealth(node)}</td><td>${nodeUptime(node)}</td><td>${hardwareVersionForNode(node)}</td><td>${softwareVersionForNode(node)}</td><td>${nodeCrc(node)}</td><td><button type="button" class="sc-btn sc-btn-ghost sc-btn-sm" data-dc-menu-node="${node.nodeId}" onclick="this.dispatchEvent(new CustomEvent('dc-menu-open',{bubbles:true,detail:{nodeId:${node.nodeId}}}))">${dcText("Menu", "菜单")}</button></td>`;
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
    const rect = anchorEl.getBoundingClientRect();
    menu.style.left = `${Math.max(12, Math.round(rect.left))}px`;
    menu.style.top = `${Math.round(rect.bottom + 6)}px`;
    menu.hidden = false;
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

  async function handleNodeMenuAction(action) {
    const node = canNodes.find((n) => n.nodeId === menuNodeId) || null;
    if (!node) {
      hideNodeMenu();
      return;
    }
    if (action === "refresh-node") {
      selectCanNode(node.nodeId);
      await tick();
      if ($("sc-dc-hint")) $("sc-dc-hint").textContent = dcText(`Refreshed live data for node ${node.nodeId}.`, `已刷新节点 ${node.nodeId} 的实时数据。`);
    }
    if (action === "copy-node-id") {
      const ok = await copyTextValue(node.nodeId);
      if ($("sc-dc-hint")) $("sc-dc-hint").textContent = ok ? dcText(`Copied node ID ${node.nodeId}.`, `已复制节点 ID ${node.nodeId}。`) : dcText(`Node ID: ${node.nodeId}`, `节点 ID：${node.nodeId}`);
    }
    if (action === "copy-can-id") {
      const canId = node.lastCanId || "--";
      const ok = await copyTextValue(canId);
      if ($("sc-dc-hint")) $("sc-dc-hint").textContent = ok ? dcText(`Copied last CAN ID ${canId}.`, `已复制最近 CAN ID ${canId}。`) : dcText(`Last CAN ID: ${canId}`, `最近 CAN ID：${canId}`);
    }
    if (action === "show-raw") {
      currentMode = "inspector";
      document.querySelectorAll(".sc-dc-mode-tab").forEach((btn) => btn.classList.toggle("active", btn.dataset.dcMode === "inspector"));
      document.querySelectorAll(".sc-dc-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.dcPanel === "inspector"));
      selectCanNode(node.nodeId);
      if ($("sc-dc-hint")) $("sc-dc-hint").textContent = dcText(`Showing raw frame fields for node ${node.nodeId}.`, `正在查看节点 ${node.nodeId} 的原始帧字段。`);
    }
    if (action === "focus-inspector") {
      setMode("inspector");
      selectCanNode(node.nodeId);
      if ($("sc-dc-hint")) $("sc-dc-hint").textContent = dcText(`Inspector focused on node ${node.nodeId}.`, `解析器已聚焦节点 ${node.nodeId}。`);
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
    const cachedForCan = getCachedFramesForCan(node.nodeId, selection.canId);
    const latestCached = cachedForCan.length ? cachedForCan[cachedForCan.length - 1] : null;
    const decoded = decoder?.decodeTransfer?.(
      selection.canId,
      latestCached?.dataHex || frame?.dataHex || node.lastDataHex || "",
      latestCached?.dlc ?? frame?.dlc ?? node.lastDlc ?? 0,
      { recentFrames: cachedForCan, anchorTs: latestCached?.ts ?? frame?.ts }
    ) || null;
    const idInfo = decoded || decoder?.parseCanIdValue?.(selection.canId) || {};

    const sourceNodeId = idInfo.sourceNodeId ?? meta.sourceNodeId ?? node.nodeId;
    const dataTypeId = idInfo.dataTypeId ?? meta.dataTypeId ?? "—";

    const dlc = frame?.dlc ?? decoded?.dlc ?? node.lastDlc ?? "—";
    const frameHex = frame?.dataHex || node.lastDataHex || "";
    const payloadHex = decoded?.payloadHex || "";
    const timeHint = frame ? formatLastSeenAgo(frame.ts) : "";

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

    if (!selectedInspectorMessage || selectedInspectorMessage.nodeId !== node.nodeId) {
      const topCanId = Object.keys(node.frameIdCounts || {}).sort(
        (a, b) => Number(node.frameIdCounts[b]) - Number(node.frameIdCounts[a]),
      )[0] || node.lastCanId || null;
      if (topCanId) selectedInspectorMessage = { nodeId: node.nodeId, canId: topCanId };
    }

    const nodes = canNodes.slice().sort((a, b) => a.nodeId - b.nodeId);
    const registry = dronecanRegistry();
    const root = document.createElement("ul");
    root.className = "sc-dc-tree-list";

    nodes.forEach((n) => {
      const rxCount = num(n.dsdlData?.["frame.count"], 0);
      const spanMs = Math.max(1, num(n.lastSeenAt, Date.now()) - num(n.firstSeenAt, Date.now()));
      const bps = Math.round((rxCount * 1000) / spanMs);
      const frameCounts = Object.entries(n.frameIdCounts || {}).sort((a, b) => Number(b[1]) - Number(a[1]));
      const nodeItem = document.createElement("li");
      const nodeOpen = inspectorOpenState.nodes.has(n.nodeId);
      nodeItem.className = `sc-dc-tree-node${nodeOpen ? " open" : ""}`;
      const isSelectedMessage = (canId) => (
        selectedInspectorMessage
        && selectedInspectorMessage.nodeId === n.nodeId
        && selectedInspectorMessage.canId === canId
      );
      const messageItems = frameCounts.map(([canId, count]) => {
        const meta = registry?.describeMessage?.(canId) || { shortName: "RawFrame", fullName: "raw.can.Frame", category: "Raw" };
        const active = isSelectedMessage(canId) ? " active-message" : "";
        return `
          <li>
            <button type="button" class="sc-dc-tree-row${active}" data-can-id="${n.nodeId}:${canId}">
              <span class="sc-dc-tree-caret blank">•</span>
              <span class="sc-dc-tree-kind">${categoryDisplayLabel(meta.category)}</span>
              <span class="sc-dc-tree-title">${canId} · ${messageDisplayLabel(meta)}</span>
              <span class="sc-dc-tree-meta">${count} ${dcText("frames", "帧")}</span>
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

    const hubRect = document.createElementNS(svgNs, "rect");
    hubRect.setAttribute("x", hubX - 72);
    hubRect.setAttribute("y", hubY - 22);
    hubRect.setAttribute("width", "144");
    hubRect.setAttribute("height", "44");
    hubRect.setAttribute("rx", "8");
    hubRect.setAttribute("fill", "#1e2235");
    hubRect.setAttribute("stroke", hubNode.status === "online" ? "#10b981" : "#ef4444");
    svg.appendChild(hubRect);

    const hubText = document.createElementNS(svgNs, "text");
    hubText.setAttribute("x", hubX);
    hubText.setAttribute("y", hubY + 5);
    hubText.setAttribute("text-anchor", "middle");
    hubText.setAttribute("fill", "#e8ecf4");
    hubText.setAttribute("font-size", "12");
    hubText.textContent = `${hubNode.title || hubNode.name} (${hubNode.nodeId})`;
    svg.appendChild(hubText);

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

    const cachedForCan = getCachedFramesForCan(node.nodeId, canId);
    const lastFr = cachedForCan.length ? cachedForCan[cachedForCan.length - 1] : null;
    const decoded = dronecanDecode()?.decodeTransfer?.(
      canId,
      lastFr?.dataHex || node.lastDataHex || "",
      lastFr?.dlc ?? node.lastDlc ?? 0,
      { recentFrames: cachedForCan, anchorTs: lastFr?.ts }
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
      setLiveText("sc-dc-transport-badge", bus === 2 ? dcText("MAVLink CAN2", "MAVLink 经 CAN2") : dcText("MAVLink CAN1", "MAVLink 经 CAN1"));
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
        setLiveText("sc-dc-transport-badge", dcText("MAVLink (SLCAN hub)", "MAVLink（SLCAN 汇聚）"));
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
      setLiveText("sc-dc-transport-badge", `${dcText("SLCAN Direct", "SLCAN 直连")} · ${adapterPort}`);
      if ($("sc-dc-hint")) {
        $("sc-dc-hint").textContent =
          dcText(`SLCAN Direct via COM bridge (${adapterPort}). MAVLink and DroneCAN should use separate USB lanes, bridged by GCS.cmd on 8765.`, `SLCAN 直连（COM 桥 ${adapterPort}）。顶部 MAVLink 与 DroneCAN 各走一路 USB，由 GCS.cmd 提供 8765 桥接。`);
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
      setLiveText("sc-dc-transport-badge", dcText("SLCAN autotest", "SLCAN 自测"));
      if ($("sc-dc-hint")) $("sc-dc-hint").textContent = dcText("SLCAN autotest: frames from /slcan-inject (no hardware).", "SLCAN 自测：帧来自 /slcan-inject（无需硬件）。");
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
          ? "当前仅授权 1 路串口（已被顶部 MAVLink 占用）。已自动 CAN_FORWARD 经同一 USB 读 DroneCAN；若仍为 0 帧/s：检查 CAN 线/参数，或在下拉「＋ 授权第二路」后重试 SLCAN Direct。"
          : "仅 1 路串口且 CAN_FORWARD 失败。请在下拉点「＋ 授权第二路 USB 串口」，或改点「MAVLink-CAN1」。";
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
          setLiveText("sc-dc-transport-badge", idx >= 0 ? dcText(`SLCAN Web Serial lane ${idx + 1}`, `SLCAN 浏览器·第${idx + 1}路`) : dcText("SLCAN Web Serial", "SLCAN 浏览器串口"));
        }
        if ($("sc-dc-hint")) {
          $("sc-dc-hint").textContent =
            dcText("SLCAN Direct over Chrome second Web Serial lane (no GCS.cmd needed). Keep MAVLink connected at the top; this page shows SLCAN-observed nodes.", "SLCAN 直连（Chrome 第二路 Web Serial，无需 GCS.cmd）。顶部保持 MAVLink 连接；本页显示 SLCAN 监听到的节点。");
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
      setLiveText("sc-dc-transport-badge", `${dcText("SLCAN Direct", "SLCAN 直连")} · ${adapterPort}`);
      if ($("sc-dc-hint")) $("sc-dc-hint").textContent = dcText(`SLCAN Direct is bound to ${adapterPort}. Only directly observed nodes are shown.`, `SLCAN 直连已绑定 ${adapterPort}，仅显示直接观测到的节点。`);
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
          ? " 可改用「MAVLink-CAN1」标签，或运行 GCS.cmd 启用 SLCAN 桥。"
          : "";
        $("sc-dc-hint").textContent = `SLCAN Direct 打开失败: ${e?.message || e}.${liveHint}`;
      }
      if (typeof window.ensureSlcanWebSerial === "function") {
        const webOk = await window.ensureSlcanWebSerial({ baudRate: 115200, bitrateKbps: 1000 });
        if (webOk) {
          slcanSessionReady = true;
          slcanBoundPort = "webserial";
          slcanInitDone = true;
          if ($("sc-dc-hint")) {
            $("sc-dc-hint").textContent = dcText("COM bridge unavailable. Switched to browser Web Serial second SLCAN lane.", "COM 桥不可用，已改用浏览器 Web Serial 第二路 SLCAN。");
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
          ? dcText("SLCAN Direct", "SLCAN 直连")
          : mode === "can1"
            ? dcText("MAVLink CAN1", "MAVLink 经 CAN1")
            : mode === "can2"
              ? dcText("MAVLink CAN2", "MAVLink 经 CAN2")
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
      if (!ev.target.closest("#sc-dc-menu")) hideNodeMenu();
    });
    document.addEventListener("input", (ev) => {
      if (ev.target && ev.target.id === "sc-dc-filter-input") renderFilterTable();
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

