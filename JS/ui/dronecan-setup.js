(function initDroneCanSetup() {
  const svgNs = "http://www.w3.org/2000/svg";

  let canNodes = [];
  let selectedCanId = 0;
  let dcTimer = 0;
  let dronecanPanelWasActive = false;
  let currentMode = "slcan";
  let uiBound = false;
  let slcanSessionReady = false;
  let slcanBoundPort = "";
  let slcanInitDone = false;
  let slcanPortLostAt = 0;
  let menuNodeId = 0;
  let selectedInspectorMessage = null;
  const inspectorOpenState = {
    nodes: new Set(),
    groups: new Set(),
  };

  const slcanRuntime = {
    framesPerSecond: 0,
    errorFrames: 0,
    nodes: new Map(),
  };
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

  async function bridgeJson(path, body = null) {
    if (typeof window.ensureComBridgeRunning === "function") {
      await window.ensureComBridgeRunning();
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
    const ports = systemComPorts();
    const hit = ports.find((p) => p && (p.isSlcanAdapter || /slcan/i.test(String(p.name || ""))));
    const found = hit?.deviceId || "";
    if (!found && slcanBoundPort) {
      slcanPortLostAt = slcanPortLostAt || Date.now();
      return slcanBoundPort;
    }
    if (found) slcanPortLostAt = 0;
    return found;
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
    return node.softwareVersion || "live";
  }

  function hardwareVersionForNode(node) {
    const registry = dronecanRegistry();
    const matched = registry?.matchDevice?.(node);
    return matched?.hardwareVersion || node.hardwareVersion || "DroneCAN";
  }

  function nodeHealth(node) {
    if (node.status === "online") return "OK";
    if (node.status === "stale" || node.stale) return "STALE";
    return "OFFLINE";
  }

  function nodeMode(node) {
    if (node.status === "online") return "OPERATIONAL";
    if (node.status === "stale" || node.stale) return "HOLD";
    return "IDLE";
  }

  function nodeVendorCode(node) {
    return node.vendorCode || "0";
  }

  function nodeCrc(node) {
    return node.swCrc || "0";
  }

  function nodeUptime(node) {
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
      lastCanId: "--",
      lastDataHex: "--",
      dsdlData: {
        "transport.source": "SLCAN Direct",
        "frame.can_id": "--",
        "frame.dlc": "0",
        "frame.data": "--",
        "frame.count": "0",
        "frame.last_seen_ms": String(Date.now()),
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
    if (diff < 1000) return "<1s ago";
    if (diff < 60000) return `${Math.round(diff / 1000)}s ago`;
    return `${(diff / 60000).toFixed(1)}m ago`;
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

  async function pollSlcanTraffic() {
    if (isInspectorDemoMode()) return;
    if (!slcanSessionReady && !isSlcanAutotestMode()) return;
    const status = await bridgeJson("/slcan-nodes");
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
        name: (
          matched?.displayName
            || (rawNode.deviceHint && rawNode.deviceHint !== "Unknown"
              ? `${rawNode.displayName || rawNode.name || `Node ${rawNode.nodeId}`}`
              : (rawNode.displayName || rawNode.name || `Node ${rawNode.nodeId}`))
        ),
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
          dsdlData: buildNodeDsdlEntries(cachedNode),
        }));
      });
    }
    slcanRuntime.nodes = nextNodes;
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
        <div class="sc-dc-mode-tabs" role="tablist" aria-label="DroneCAN modes">
          <button type="button" class="sc-dc-mode-tab active" data-dc-mode="slcan">SLCAN Direct</button>
          <button type="button" class="sc-dc-mode-tab" data-dc-mode="can1">MAVLink-CAN1</button>
          <button type="button" class="sc-dc-mode-tab" data-dc-mode="can2">MAVLink-CAN2</button>
          <button type="button" class="sc-dc-mode-tab" data-dc-mode="filter">Filter</button>
          <button type="button" class="sc-dc-mode-tab" data-dc-mode="inspector">Inspector</button>
          <button type="button" class="sc-dc-mode-tab" data-dc-mode="stats">Stats</button>
        </div>
        <div class="sc-dc-toolbar-right">
          <label class="sc-dc-check"><input type="checkbox" id="sc-dc-exit-slcan" checked> Exit SLCAN on leave?</label>
          <label class="sc-dc-check"><input type="checkbox" id="sc-dc-log"> Log</label>
        </div>
      </div>
      <div class="sc-dc-hint-row">
        <div id="sc-dc-transport-badge" class="sc-pill sc-pill-ok">SLCAN Direct</div>
        <div id="sc-dc-hint" class="sc-prose sc-prose--sm">Only directly observed SLCAN nodes are shown. Brief polling drops are held shortly and marked STALE.</div>
      </div>
      <div id="sc-dc-menu" class="sc-dc-menu" hidden>
        <button type="button" class="sc-dc-menu-item" data-dc-menu-action="refresh-node">Refresh Node Info</button>
        <button type="button" class="sc-dc-menu-item" data-dc-menu-action="copy-node-id">Copy Node ID</button>
        <button type="button" class="sc-dc-menu-item" data-dc-menu-action="copy-can-id">Copy Last CAN ID</button>
        <button type="button" class="sc-dc-menu-item" data-dc-menu-action="show-raw">Show Raw Frames</button>
        <button type="button" class="sc-dc-menu-item" data-dc-menu-action="focus-inspector">Focus Inspector</button>
      </div>

      <div class="sc-dc-panel active" data-dc-panel="slcan">
        <div class="sc-dc-grid">
          <div class="sc-dc-main">
            <div class="sc-card-head">
              <h3>Online Nodes</h3>
              <div class="sc-btn-row">
                <button type="button" id="sc-dc-scan" class="sc-btn sc-btn-ghost sc-btn-sm">Refresh</button>
              </div>
            </div>
            <div class="sc-table-wrap sc-dc-node-table-wrap">
              <table class="sc-dsdl-table sc-dc-node-table" id="sc-dc-node-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Mode</th>
                    <th>Health</th>
                    <th>Uptime</th>
                    <th>HW Version</th>
                    <th>SW Version</th>
                    <th>SW CRC</th>
                    <th>Menu</th>
                  </tr>
                </thead>
                <tbody id="sc-dc-node-body"></tbody>
              </table>
            </div>
            <div class="sc-dc-node-detail-band">
              <div class="sc-dc-band-grid">
                <div class="sc-dc-band-label">Node ID / Name</div>
                <div id="sc-dc-band-id" class="sc-dc-band-value">-</div>
                <div id="sc-dc-band-name" class="sc-dc-band-value">-</div>
                <div class="sc-dc-band-label">Mode / Health / Uptime</div>
                <div id="sc-dc-band-mode" class="sc-dc-band-value">-</div>
                <div id="sc-dc-band-health" class="sc-dc-band-value">-</div>
                <div id="sc-dc-band-uptime" class="sc-dc-band-value">-</div>
                <div class="sc-dc-band-label">Vendor-specific code</div>
                <div id="sc-dc-band-vendor" class="sc-dc-band-value sc-dc-band-span2">-</div>
                <div class="sc-dc-band-label">Software version / CRC64</div>
                <div id="sc-dc-band-sw" class="sc-dc-band-value">-</div>
                <div id="sc-dc-band-crc" class="sc-dc-band-value">-</div>
                <div class="sc-dc-band-label">Hardware version / UID</div>
                <div id="sc-dc-band-hw" class="sc-dc-band-value">-</div>
                <div id="sc-dc-band-uid" class="sc-dc-band-value">-</div>
              </div>
            </div>
            <div class="sc-table-wrap sc-dc-log-wrap">
              <table class="sc-dsdl-table">
                <thead><tr><th>Node</th><th>Level</th><th>Source</th><th>Text</th></tr></thead>
                <tbody id="sc-dc-log-body"></tbody>
              </table>
            </div>
          </div>

          <aside class="sc-dc-side">
            <div class="sc-subcard">
              <h4 id="sc-dc-node-title">Node Detail: -</h4>
              <dl id="sc-dc-node-meta" class="sc-dl"></dl>
            </div>
            <div class="sc-subcard">
              <h4>Live Fields</h4>
              <div class="sc-table-wrap">
                <table class="sc-dsdl-table" id="sc-dsdl-table">
                  <thead><tr><th>Field</th><th>Value</th></tr></thead>
                  <tbody></tbody>
                </table>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <div class="sc-dc-panel" data-dc-panel="can1"><div class="sc-dc-mini-grid"><div class="sc-subcard"><h4>MAVLink-CAN1</h4><dl id="sc-dc-can1-meta" class="sc-dl"></dl></div><div class="sc-subcard"><h4>Topology</h4><div class="sc-topology-host"><svg id="sc-dc-svg" viewBox="0 0 420 420" class="sc-dc-svg" aria-label="DroneCAN topology"></svg></div></div></div></div>
      <div class="sc-dc-panel" data-dc-panel="can2"><div class="sc-dc-mini-grid"><div class="sc-subcard"><h4>MAVLink-CAN2</h4><dl id="sc-dc-can2-meta" class="sc-dl"></dl></div><div class="sc-subcard"><h4>Status</h4><p class="sc-prose sc-prose--sm" id="sc-dc-can2-note">CAN2 info is still MAVLink-routed metadata only.</p></div></div></div>
      <div class="sc-dc-panel" data-dc-panel="filter"><div class="sc-dc-filter-grid"><div class="sc-subcard"><h4>Filter</h4><label class="sc-field"><span>Filter by name / node ID</span><input id="sc-dc-filter-input" type="search" placeholder="e.g. 10 / ardupilot"></label><label class="sc-field"><span>Health</span><select id="sc-dc-health-filter"><option value="all">All</option><option value="online">Online only</option><option value="offline">Offline only</option></select></label></div><div class="sc-subcard"><h4>Filtered Results</h4><div class="sc-table-wrap sc-dc-node-table-wrap"><table class="sc-dsdl-table sc-dc-node-table"><thead><tr><th>ID</th><th>Name</th><th>Mode</th><th>Health</th><th>Source</th></tr></thead><tbody id="sc-dc-filter-body"></tbody></table></div></div></div></div>
      <div class="sc-dc-panel" data-dc-panel="inspector">
        <div class="sc-dc-inspector-grid">
          <div class="sc-subcard">
            <h4>Node Tree</h4>
            <div id="sc-dc-inspector-summary" class="sc-prose sc-prose--sm"></div>
            <div id="sc-dc-inspector-tree" class="sc-dc-tree"></div>
          </div>
          <div class="sc-subcard">
            <h4>Selected Message</h4>
            <div id="sc-dc-inspector-evidence" class="sc-prose sc-prose--sm"></div>
            <div id="sc-dc-inspector-detail" class="sc-dc-inspector-detail"></div>
          </div>
        </div>
      </div>
      <div class="sc-dc-panel" data-dc-panel="stats"><div class="sc-dc-stats-grid"><div class="sc-subcard"><h4>Online Nodes</h4><div id="sc-dc-stat-nodes" class="sc-dc-stat-value">0</div></div><div class="sc-subcard"><h4>Active Buses</h4><div id="sc-dc-stat-buses" class="sc-dc-stat-value">0</div></div><div class="sc-subcard"><h4>SLCAN Port</h4><div id="sc-dc-stat-slcan" class="sc-dc-stat-value">-</div></div><div class="sc-subcard"><h4>FC Node ID</h4><div id="sc-dc-stat-fcnode" class="sc-dc-stat-value">0</div></div></div></div>
    `;
    page.appendChild(workbench);
  }

  function ensureExtraStyles() {
    if ($("sc-dc-workbench-style")) return;
    const style = document.createElement("style");
    style.id = "sc-dc-workbench-style";
    style.textContent = `
      .sc-dc-workbench { margin-top: 14px; }
      .sc-dc-toolbar, .sc-dc-hint-row { display:flex; gap:12px; align-items:center; justify-content:space-between; flex-wrap:wrap; }
      .sc-dc-toolbar { margin-bottom: 12px; }
      .sc-dc-mode-tabs { display:flex; gap:6px; flex-wrap:wrap; }
      .sc-dc-mode-tab { background:#88ab35; color:#142003; border:1px solid #c8ea73; padding:6px 10px; font-size:12px; cursor:pointer; }
      .sc-dc-mode-tab.active { background:#d7f071; color:#0b1500; }
      .sc-dc-toolbar-right { display:flex; gap:14px; align-items:center; color:#d5dcf0; font-size:12px; }
      .sc-dc-check { display:flex; gap:6px; align-items:center; }
      .sc-dc-hint-row { padding:8px 0 12px; border-bottom:1px solid #2a3148; margin-bottom:12px; }
      .sc-dc-menu { position:fixed; z-index:2200; min-width:190px; background:#121827; border:1px solid #39445f; border-radius:10px; box-shadow:0 18px 42px rgba(0,0,0,0.35); padding:6px; display:grid; gap:4px; }
      .sc-dc-menu[hidden] { display:none; }
      .sc-dc-menu-item { text-align:left; background:#182133; color:#e5ebf6; border:1px solid transparent; border-radius:8px; padding:9px 10px; font-size:12px; cursor:pointer; }
      .sc-dc-menu-item:hover { background:#22314b; border-color:#4a5c7d; }
      .sc-dc-grid { display:grid; grid-template-columns:minmax(0, 1.45fr) minmax(320px, 0.75fr); gap:14px; }
      .sc-dc-mini-grid, .sc-dc-filter-grid, .sc-dc-inspector-grid, .sc-dc-stats-grid { display:grid; gap:14px; }
      .sc-dc-mini-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); }
      .sc-dc-filter-grid { grid-template-columns:minmax(300px, 0.9fr) minmax(0, 1.1fr); }
      .sc-dc-inspector-grid { grid-template-columns:minmax(520px, 1.35fr) minmax(0, 0.9fr); }
      .sc-dc-stats-grid { grid-template-columns:repeat(4, minmax(0, 1fr)); }
      .sc-dc-panel { display:none; }
      .sc-dc-panel.active { display:block; }
      .sc-dc-node-table-wrap { max-height:380px; }
      .sc-dc-row { cursor:pointer; }
      .sc-dc-row.active td { background:rgba(144, 182, 58, 0.18); }
      .sc-dc-node-detail-band { margin-top:12px; border:1px solid var(--sc-border); border-radius:8px; background:#171d2d; padding:10px; }
      .sc-dc-band-grid { display:grid; grid-template-columns:220px 1fr 1fr 1fr; gap:6px; }
      .sc-dc-band-label, .sc-dc-band-value { min-height:24px; display:flex; align-items:center; padding:3px 8px; font-size:12px; }
      .sc-dc-band-label { color:#d9e2f2; }
      .sc-dc-band-value { background:#474747; color:#ffffff; font-family:var(--sc-mono); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .sc-dc-band-span2 { grid-column:span 2; }
      .sc-dc-log-wrap { margin-top:12px; max-height:180px; }
      .sc-dc-tree { max-height:620px; overflow:auto; padding:4px 0; border:1px solid #2c3550; border-radius:12px; background:#101624; }
      .sc-dc-tree-list, .sc-dc-tree-branch { list-style:none; margin:0; padding:0; }
      .sc-dc-tree-row { display:flex; align-items:center; gap:10px; min-height:34px; width:100%; background:transparent; color:#e6ecf6; border:0; border-radius:8px; padding:7px 10px; cursor:pointer; text-align:left; }
      .sc-dc-tree-row:hover { background:#1a2337; }
      .sc-dc-tree-row.active { background:#24314b; box-shadow:inset 0 0 0 1px #4a5d82; }
      .sc-dc-tree-node { padding:2px 8px; }
      .sc-dc-tree-branch { display:none; margin-left:18px; padding-left:10px; border-left:1px solid #2f3b58; }
      .sc-dc-tree-node.open > .sc-dc-tree-branch { display:block; }
      .sc-dc-tree-caret { width:14px; color:#8da0bf; flex:0 0 14px; text-align:center; }
      .sc-dc-tree-caret.blank { visibility:hidden; }
      .sc-dc-tree-title { flex:1 1 auto; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .sc-dc-tree-meta { flex:0 0 auto; color:#8da0bf; font-size:12px; white-space:nowrap; }
      .sc-dc-tree-kind { display:inline-flex; align-items:center; min-width:58px; justify-content:center; padding:2px 7px; border-radius:999px; background:#1c2940; color:#9fc1ff; font-size:11px; }
      .sc-dc-inspector-detail { min-height:420px; border:1px solid #2c3550; border-radius:12px; background:#101624; padding:14px; overflow:auto; }
      .sc-dc-kv { display:grid; grid-template-columns:140px minmax(0, 1fr); gap:6px 10px; font-size:12px; }
      .sc-dc-kv dt { color:#97a6c2; }
      .sc-dc-kv dd { margin:0; color:#eef3fb; font-family:var(--sc-mono); word-break:break-all; }
      .sc-dc-inspector-section { margin-bottom:14px; }
      .sc-dc-type-banner { padding:12px; border:1px solid #3d5278; border-radius:10px; background:#152038; }
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
    if ($("sc-dc-load")) $("sc-dc-load").textContent = `${loadPct}%`;
    if ($("sc-dc-fps")) $("sc-dc-fps").textContent = String(fps);
    if ($("sc-dc-err")) $("sc-dc-err").textContent = String(slcanRuntime.errorFrames);
    if ($("sc-dc-stat-nodes")) $("sc-dc-stat-nodes").textContent = String(canNodes.length);
    if ($("sc-dc-stat-buses")) $("sc-dc-stat-buses").textContent = String(slcanSessionReady ? 1 : 0);
    if ($("sc-dc-stat-slcan")) $("sc-dc-stat-slcan").textContent = detectSlcanAdapterPort() || "-";
    if ($("sc-dc-stat-fcnode")) $("sc-dc-stat-fcnode").textContent = String(fcCan.nodeId);
    if ($("sc-dc-transport-badge")) $("sc-dc-transport-badge").textContent = slcanSessionReady ? `SLCAN ${detectSlcanAdapterPort()}` : "SLCAN Direct";
  }

  function renderNodeTable() {
    const tbody = $("sc-dc-node-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    canNodes.forEach((node) => {
      const tr = document.createElement("tr");
      tr.className = `sc-dc-row${node.nodeId === selectedCanId ? " active" : ""}`;
      tr.innerHTML = `<td>${node.nodeId === selectedCanId ? ">" : "-"}</td><td>${node.nodeId}</td><td>${node.name}</td><td>${nodeMode(node)}</td><td>${nodeHealth(node)}</td><td>${nodeUptime(node)}</td><td>${hardwareVersionForNode(node)}</td><td>${softwareVersionForNode(node)}</td><td>${nodeCrc(node)}</td><td><button type="button" class="sc-btn sc-btn-ghost sc-btn-sm" data-dc-menu-node="${node.nodeId}" onclick="this.dispatchEvent(new CustomEvent('dc-menu-open',{bubbles:true,detail:{nodeId:${node.nodeId}}}))">Menu</button></td>`;
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
      if ($("sc-dc-hint")) $("sc-dc-hint").textContent = `Refreshed live data for node ${node.nodeId}.`;
    }
    if (action === "copy-node-id") {
      const ok = await copyTextValue(node.nodeId);
      if ($("sc-dc-hint")) $("sc-dc-hint").textContent = ok ? `Copied node ID ${node.nodeId}.` : `Node ID: ${node.nodeId}`;
    }
    if (action === "copy-can-id") {
      const canId = node.lastCanId || "--";
      const ok = await copyTextValue(canId);
      if ($("sc-dc-hint")) $("sc-dc-hint").textContent = ok ? `Copied last CAN ID ${canId}.` : `Last CAN ID: ${canId}`;
    }
    if (action === "show-raw") {
      currentMode = "inspector";
      document.querySelectorAll(".sc-dc-mode-tab").forEach((btn) => btn.classList.toggle("active", btn.dataset.dcMode === "inspector"));
      document.querySelectorAll(".sc-dc-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.dcPanel === "inspector"));
      selectCanNode(node.nodeId);
      if ($("sc-dc-hint")) $("sc-dc-hint").textContent = `Showing raw frame fields for node ${node.nodeId}.`;
    }
    if (action === "focus-inspector") {
      setMode("inspector");
      selectCanNode(node.nodeId);
      if ($("sc-dc-hint")) $("sc-dc-hint").textContent = `Inspector focused on node ${node.nodeId}.`;
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
      if (evidence) evidence.textContent = node ? `Node ${node.nodeId} selected. Choose a message in the tree.` : "";
      detail.innerHTML = `<p class="sc-prose sc-prose--sm muted">Select a CAN ID under Message Groups or Recent Frames to decode its payload.</p>`;
      return;
    }

    const frame = findInspectorFrame(node, selection.canId);
    const meta = registry?.describeMessage?.(selection.canId) || {
      shortName: "RawFrame",
      fullName: "raw.can.Frame",
      category: "Raw",
    };
    const decoded = decoder?.decodeTransfer?.(
      selection.canId,
      frame?.dataHex || node.lastDataHex || "",
      frame?.dlc ?? node.lastDlc ?? 0,
    ) || null;
    const idInfo = decoded || decoder?.parseCanIdValue?.(selection.canId) || {};

    const sourceNodeId = idInfo.sourceNodeId ?? meta.sourceNodeId ?? node.nodeId;
    const dataTypeId = idInfo.dataTypeId ?? meta.dataTypeId ?? "—";

    if (evidence) {
      evidence.textContent = `${meta.fullName} (type ${dataTypeId}) · ${selection.canId} · source node ${sourceNodeId}${frame ? ` · ${formatLastSeenAgo(frame.ts)}` : ""}`;
    }

    const transport = decoded?.transport;
    const headerRows = [
      ["Standard type", meta.fullName],
      ["Short name", meta.shortName],
      ["Default data type ID", dataTypeId],
      ["Category", meta.category || "—"],
      ["CAN ID", selection.canId],
      ["Priority", idInfo.priority ?? meta.priority ?? "—"],
      ["Source node", sourceNodeId],
      ["Transfer", idInfo.isService ? (idInfo.isRequest ? "Service request" : "Service response") : "Broadcast message"],
      ["DLC", frame?.dlc ?? decoded?.dlc ?? node.lastDlc ?? "—"],
      ["Frame data", frame?.dataHex || node.lastDataHex || "—"],
    ];
    if (transport) {
      headerRows.push(
        ["Tail byte", transport.tailByte],
        ["Transfer ID", transport.transferId],
        ["SOF / EOF", `${transport.startOfTransfer ? 1 : 0} / ${transport.endOfTransfer ? 1 : 0}`],
      );
    }

    const fieldRows = (decoded?.fields || []).map((item) => [
      item.name,
      item.value,
      item.note || "",
    ]);

    detail.innerHTML = `
      <div class="sc-dc-inspector-section sc-dc-type-banner">
        <h5>Standard data type</h5>
        <p class="sc-dc-type-title">${meta.shortName}</p>
        <p class="sc-dc-type-full">${meta.fullName}</p>
        <p class="sc-dc-type-meta">Default ID ${dataTypeId} · CAN ${selection.canId} · from node ${sourceNodeId}</p>
      </div>
      <div class="sc-dc-inspector-section">
        <h5>Transfer</h5>
        <dl class="sc-dc-kv">${headerRows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
      </div>
      <div class="sc-dc-inspector-section">
        <h5>Decoded fields</h5>
        ${fieldRows.length ? `
          <table class="sc-dc-field-table">
            <thead><tr><th>Field</th><th>Value</th></tr></thead>
            <tbody>${fieldRows.map(([name, value, note]) => `<tr><th>${name}</th><td>${value}${note ? `<span class="sc-dc-field-note">${note}</span>` : ""}</td></tr>`).join("")}</tbody>
          </table>
        ` : `<p class="sc-prose sc-prose--sm muted">No field decoder for data type ${idInfo.dataTypeId ?? "unknown"} yet. See raw payload below.</p>`}
      </div>
      ${decoded?.payloadHex ? `
        <div class="sc-dc-inspector-section">
          <h5>Payload (transport stripped)</h5>
          <dl class="sc-dc-kv"><dt>Hex</dt><dd>${decoded.payloadHex}</dd></dl>
        </div>
      ` : ""}
    `;
  }

  function renderInspector() {
    const node = canNodes.find((n) => n.nodeId === selectedCanId) || canNodes[0] || null;
    const summary = $("sc-dc-inspector-summary");
    const tree = $("sc-dc-inspector-tree");
    if (summary) summary.textContent = node ? `Node ${node.nodeId} / ${node.name} · ${nodeHealth(node)} · ${node.source || "Direct"}` : "No directly observed online nodes";
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
      const recent = (n.recentFrames || []).slice().reverse().slice(0, 10);
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
        const latestFrame = (n.recentFrames || []).slice().reverse().find((frame) => frame.canId === canId) || null;
        const frameText = latestFrame ? `${latestFrame.dataHex || "--"} · ${formatLastSeenAgo(latestFrame.ts)}` : `${count} frames`;
        const active = isSelectedMessage(canId) ? " active-message" : "";
        return `
          <li class="sc-dc-tree-node">
            <button type="button" class="sc-dc-tree-row${active}" data-can-id="${n.nodeId}:${canId}">
              <span class="sc-dc-tree-caret blank">•</span>
              <span class="sc-dc-tree-kind">${meta.category}</span>
              <span class="sc-dc-tree-title">${canId} · ${meta.shortName}</span>
              <span class="sc-dc-tree-meta">${count} frames</span>
            </button>
            <ul class="sc-dc-tree-branch">
              <li>
                <button type="button" class="sc-dc-tree-row${active}" data-can-id="${n.nodeId}:${canId}">
                  <span class="sc-dc-tree-caret blank">•</span>
                  <span class="sc-dc-tree-kind">Last</span>
                  <span class="sc-dc-tree-title">${frameText}</span>
                  <span class="sc-dc-tree-meta">${meta.shortName}</span>
                </button>
              </li>
            </ul>
          </li>
        `;
      }).join("");
      const recentItems = recent.map((frame) => {
        const meta = registry?.describeMessage?.(frame.canId) || { shortName: "RawFrame", fullName: "raw.can.Frame", category: "Raw" };
        const stamp = Number.isFinite(Number(frame.ts)) ? new Date(Number(frame.ts)).toLocaleTimeString() : "--";
        const active = isSelectedMessage(frame.canId) ? " active-message" : "";
        return `
          <li>
            <button type="button" class="sc-dc-tree-row${active}" data-can-id="${n.nodeId}:${frame.canId || ""}">
              <span class="sc-dc-tree-caret blank">•</span>
              <span class="sc-dc-tree-kind">${meta.category}</span>
              <span class="sc-dc-tree-title">${frame.canId || "--"} @ ${stamp} · ${frame.dataHex || "--"}</span>
              <span class="sc-dc-tree-meta">${meta.shortName}</span>
            </button>
          </li>
        `;
      }).join("");
      nodeItem.innerHTML = `
        <button type="button" class="sc-dc-tree-row${n.nodeId === node.nodeId ? " active" : ""}" data-node-head="${n.nodeId}">
          <span class="sc-dc-tree-caret">${nodeOpen ? "▾" : "▸"}</span>
          <span class="sc-dc-tree-title">${n.nodeId} · ${n.name}</span>
          <span class="sc-dc-tree-meta">${nodeHealth(n)} · ${rxCount} frames · ${bps} Bps</span>
        </button>
        <ul class="sc-dc-tree-branch">
          <li class="sc-dc-tree-node${inspectorOpenState.groups.has(`msg:${n.nodeId}`) ? " open" : ""}">
            <button type="button" class="sc-dc-tree-row" data-group-head="msg:${n.nodeId}">
              <span class="sc-dc-tree-caret">${inspectorOpenState.groups.has(`msg:${n.nodeId}`) ? "▾" : "▸"}</span>
              <span class="sc-dc-tree-kind">Type</span>
              <span class="sc-dc-tree-title">Message Groups</span>
              <span class="sc-dc-tree-meta">${frameCounts.length} IDs</span>
            </button>
            <ul class="sc-dc-tree-branch">${messageItems}</ul>
          </li>
          <li class="sc-dc-tree-node${inspectorOpenState.groups.has(`recent:${n.nodeId}`) ? " open" : ""}">
            <button type="button" class="sc-dc-tree-row" data-group-head="recent:${n.nodeId}">
              <span class="sc-dc-tree-caret">${inspectorOpenState.groups.has(`recent:${n.nodeId}`) ? "▾" : "▸"}</span>
              <span class="sc-dc-tree-kind">Log</span>
              <span class="sc-dc-tree-title">Recent Frames</span>
              <span class="sc-dc-tree-meta">${recent.length}</span>
            </button>
            <ul class="sc-dc-tree-branch">${recentItems}</ul>
          </li>
        </ul>
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
      [node.nodeId, "Info", "node.name", node.name],
      [node.nodeId, "Info", "node.mode", nodeMode(node)],
      [node.nodeId, "Info", "node.health", nodeHealth(node)],
      [node.nodeId, "Info", "node.discovery", "Direct / SLCAN observed"],
      [node.nodeId, "Info", "message.type", meta.fullName || "—"],
      [node.nodeId, "Info", "frame.can_id", node.lastCanId || "--"],
      [node.nodeId, "Info", "frame.data", node.lastDataHex || "--"],
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
        <dt>Bus</dt><dd>CAN1</dd>
        <dt>Transport</dt><dd>${slcanSessionReady ? "SLCAN Direct" : "Not ready"}</dd>
        <dt>FC Driver</dt><dd>CAN_D${fcCan.canDrivers[0] || 1}</dd>
        <dt>FC Node ID</dt><dd>${fcCan.nodeId}</dd>
        <dt>Online Nodes</dt><dd>${onlineNodes.length}</dd>
        <dt>Direct Nodes</dt><dd>${directNodes.length}</dd>
        <dt>Frames/s</dt><dd>${slcanRuntime.framesPerSecond}</dd>
        <dt>Errors</dt><dd>${slcanRuntime.errorFrames}</dd>
        <dt>SLCAN Port</dt><dd>${detectSlcanAdapterPort() || "-"}</dd>
      `;
    }
    if ($("sc-dc-can2-meta")) {
      $("sc-dc-can2-meta").innerHTML = `<dt>Bus</dt><dd>CAN2</dd><dt>Driver</dt><dd>${fcCan.canDrivers[1] ? `CAN_D${fcCan.canDrivers[1]}` : "Not enabled"}</dd><dt>Status</dt><dd>${fcCan.canDrivers[1] ? "Configured" : "Unavailable"}</dd><dt>Transport</dt><dd>MAVLink metadata only</dd>`;
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
    if (meta.shortName) entries["message.short"] = meta.shortName;
    if (meta.dataTypeId != null) entries["message.data_type_id"] = meta.dataTypeId;

    const decoded = dronecanDecode()?.decodeTransfer?.(
      canId,
      node.lastDataHex || "",
      node.lastDlc ?? 0,
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
      tr.innerHTML = `<td colspan="2" class="muted">Waiting for CAN frames on node ${node.nodeId}…</td>`;
      tbody.appendChild(tr);
      return;
    }
    rows.forEach(([k, v]) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${k}</td><td>${String(v)}</td>`;
      tbody.appendChild(tr);
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
    if ($("sc-dc-node-title")) $("sc-dc-node-title").textContent = node ? `Node Detail: NodeID ${node.nodeId} (${node.name})` : "Node Detail: -";
    const meta = $("sc-dc-node-meta");
    if (meta) {
      meta.innerHTML = "";
      if (node) {
        [
          ["Node ID", node.nodeId],
          ["Name", node.name],
          ["Mode", nodeMode(node)],
          ["Health", nodeHealth(node)],
          ["Uptime", nodeUptime(node)],
          ["Source", node.source || "DroneCAN"],
          ["Discovery", "Direct / adapter-backed"],
          ["HW Version", hardwareVersionForNode(node)],
          ["SW Version", softwareVersionForNode(node)],
        ].forEach(([k, v]) => {
          const dt = document.createElement("dt");
          const dd = document.createElement("dd");
          dt.textContent = String(k);
          dd.textContent = String(v);
          meta.appendChild(dt);
          meta.appendChild(dd);
        });
      }
    }
    renderBand(node);
    renderDsdlTable(node);
    renderNodeTable();
    renderFilterTable();
    renderInspector();
    renderLogTable();
  }

  async function ensureSlcanDirectSession() {
    if (!isDronecanPanelActive()) return;
    if (isSlcanAutotestMode()) {
      slcanSessionReady = true;
      if ($("sc-dc-transport-badge")) $("sc-dc-transport-badge").textContent = "SLCAN autotest";
      if ($("sc-dc-hint")) $("sc-dc-hint").textContent = "SLCAN autotest: frames from /slcan-inject (no hardware).";
      return;
    }
    const adapterPort = detectSlcanAdapterPort() || slcanBoundPort;
    if (!adapterPort) {
      if (slcanBoundPort && slcanPortLostAt && (Date.now() - slcanPortLostAt) < 30000) {
        return;
      }
      slcanSessionReady = false;
      slcanInitDone = false;
      slcanBoundPort = "";
      slcanRuntime.nodes.clear();
      slcanRuntime.framesPerSecond = 0;
      if ($("sc-dc-hint")) $("sc-dc-hint").textContent = "SLCAN adapter port not found.";
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
      slcanSessionReady = true;
      if ($("sc-dc-transport-badge")) $("sc-dc-transport-badge").textContent = `SLCAN ${adapterPort}`;
      if ($("sc-dc-hint")) $("sc-dc-hint").textContent = `SLCAN Direct is bound to ${adapterPort}. Only directly observed nodes are shown.`;
    } catch (e) {
      slcanSessionReady = false;
      slcanInitDone = false;
      if (!slcanBoundPort) {
        slcanRuntime.nodes.clear();
        slcanRuntime.framesPerSecond = 0;
      }
      if ($("sc-dc-hint")) $("sc-dc-hint").textContent = `SLCAN Direct open failed: ${e?.message || e}`;
    }
  }

  function resetSlcanSessionState() {
    slcanSessionReady = false;
    slcanInitDone = false;
    slcanBoundPort = "";
    slcanPortLostAt = 0;
  }

  function setMode(mode) {
    currentMode = mode;
    document.querySelectorAll(".sc-dc-mode-tab").forEach((btn) => btn.classList.toggle("active", btn.dataset.dcMode === mode));
    document.querySelectorAll(".sc-dc-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.dcPanel === mode));
    if ($("sc-dc-transport-badge")) $("sc-dc-transport-badge").textContent = mode === "slcan" ? "SLCAN Direct" : mode.toUpperCase();
    ensureSlcanDirectSession().then(() => tick()).catch(() => tick());
  }

  async function tick() {
    try {
      await injectSlcanAutotestFrame();
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
    renderDsdlTable(node);
  }

  function startDcTelemetry() {
    stopDcTelemetry();
    ensureSlcanDirectSession().then(async () => {
      await tick();
      dcTimer = window.setInterval(() => {
        ensureSlcanDirectSession().then(() => tick()).catch(() => tick());
      }, 1500);
    }).catch(() => {
      tick();
      dcTimer = window.setInterval(() => {
        tick();
      }, 1500);
    });
  }

  function stopDcTelemetry() {
    clearInterval(dcTimer);
    dcTimer = 0;
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
              ? `Node Detail: NodeID ${selectedNode.nodeId} (${selectedNode.name})`
              : "Node Detail: -";
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
      setMode(currentMode);
      startDcTelemetry();
    } else if (!active && dronecanPanelWasActive) {
      dronecanPanelWasActive = false;
      stopDcTelemetry();
      const exitSlcan = $("sc-dc-exit-slcan");
      if (exitSlcan?.checked) {
        bridgeJson("/slcan-close").catch(() => {});
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
    document.addEventListener("gcs-connection", () => window.requestAnimationFrame(syncDronecanPanel));
    document.addEventListener("gcs-airframe-params-changed", () => window.requestAnimationFrame(syncDronecanPanel));
    window.requestAnimationFrame(syncDronecanPanel);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

