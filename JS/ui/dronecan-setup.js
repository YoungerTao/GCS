(function initDroneCanSetup() {
  const svgNs = "http://www.w3.org/2000/svg";

  let canNodes = [];
  let selectedCanId = 0;
  let dcTimer = 0;
  let dronecanPanelWasActive = false;
  let currentMode = "slcan";
  let uiBound = false;
  let slcanSessionReady = false;

  const slcanRuntime = {
    framesPerSecond: 0,
    errorFrames: 0,
    nodes: new Map(),
  };

  function $(id) {
    return document.getElementById(id);
  }

  function panelRoot() {
    return $("setup-panel-dronecan");
  }

  function workbenchRoot() {
    return panelRoot()?.querySelector(".sc-dc-workbench") || null;
  }

  function systemComPorts() {
    return Array.isArray(window._systemComPorts) ? window._systemComPorts : [];
  }

  async function bridgeJson(path, body = null) {
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
    return hit?.deviceId || "";
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
    return node.hardwareVersion || "DroneCAN";
  }

  function nodeHealth(node) {
    return node.status === "online" ? "OK" : "OFFLINE";
  }

  function nodeMode(node) {
    return node.status === "online" ? "OPERATIONAL" : "IDLE";
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

  function mkNode(base) {
    return {
      inferred: false,
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
    if (!slcanSessionReady) return;
    const status = await bridgeJson("/slcan-nodes");
    slcanRuntime.framesPerSecond = Number(status?.framesPerSecond || 0);
    slcanRuntime.errorFrames = Number(status?.errorCount || 0);
    slcanRuntime.nodes = new Map();
    for (const rawNode of Array.isArray(status?.nodes) ? status.nodes : []) {
      const node = mkNode({
        ...rawNode,
        status: "online",
        name: (
          rawNode.deviceHint && rawNode.deviceHint !== "Unknown"
            ? `${rawNode.displayName || rawNode.name || `Node ${rawNode.nodeId}`} (${rawNode.deviceHint})`
            : (rawNode.displayName || rawNode.name || `Node ${rawNode.nodeId}`)
        ),
        rawName: rawNode.name || "",
        displayName: rawNode.displayName || rawNode.name || `Node ${rawNode.nodeId}`,
        deviceHint: rawNode.deviceHint || "Unknown",
        asciiHint: rawNode.asciiHint || "",
        source: rawNode.source || "MAVLink CAN_FRAME",
        softwareVersion: rawNode.softwareVersion || "live",
        hardwareVersion: rawNode.hardwareVersion || "DroneCAN",
        dsdlData: {
          "transport.source": rawNode.source || "MAVLink CAN_FRAME",
          "device.hint": rawNode.deviceHint || "Unknown",
          "device.raw_name": rawNode.name || "",
          "device.ascii_hint": rawNode.asciiHint || "",
          "frame.can_id": rawNode.lastCanId || "--",
          "frame.dlc": String(rawNode.lastDlc ?? 0),
          "frame.data": rawNode.lastDataHex || "--",
          "frame.count": String(rawNode.rxCount ?? 0),
          "frame.last_seen_ms": String(rawNode.lastSeenAt ?? 0),
        },
      });
      slcanRuntime.nodes.set(node.nodeId, node);
    }
  }

  function buildLiveNodes() {
    return Array.from(slcanRuntime.nodes.values())
      .filter((node) => node.status === "online")
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
        <div id="sc-dc-hint" class="sc-prose sc-prose--sm">Only directly observed SLCAN nodes are shown.</div>
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
      <div class="sc-dc-panel" data-dc-panel="inspector"><div class="sc-dc-inspector-grid"><div class="sc-subcard"><h4>Inspector</h4><div id="sc-dc-inspector-summary" class="sc-prose sc-prose--sm"></div></div><div class="sc-subcard"><h4>Node Fields / Events</h4><div class="sc-table-wrap sc-dc-inspector-wrap"><table class="sc-dsdl-table"><thead><tr><th>Node</th><th>Level</th><th>Source</th><th>Text</th></tr></thead><tbody id="sc-dc-inspector-body"></tbody></table></div></div></div></div>
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
      .sc-dc-grid { display:grid; grid-template-columns:minmax(0, 1.45fr) minmax(320px, 0.75fr); gap:14px; }
      .sc-dc-mini-grid, .sc-dc-filter-grid, .sc-dc-inspector-grid, .sc-dc-stats-grid { display:grid; gap:14px; }
      .sc-dc-mini-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); }
      .sc-dc-filter-grid, .sc-dc-inspector-grid { grid-template-columns:minmax(280px, 0.9fr) minmax(0, 1.1fr); }
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
      tr.innerHTML = `<td>▸</td><td>${node.nodeId}</td><td>${node.name}</td><td>${nodeMode(node)}</td><td>${nodeHealth(node)}</td><td>${nodeUptime(node)}</td><td>${hardwareVersionForNode(node)}</td><td>${softwareVersionForNode(node)}</td><td>${nodeCrc(node)}</td><td><button type="button" class="sc-btn sc-btn-ghost sc-btn-sm">Menu</button></td>`;
      tr.addEventListener("click", () => selectCanNode(node.nodeId));
      tbody.appendChild(tr);
    });
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

  function renderInspector() {
    const node = canNodes.find((n) => n.nodeId === selectedCanId) || canNodes[0] || null;
    const tbody = $("sc-dc-inspector-body");
    const summary = $("sc-dc-inspector-summary");
    if (summary) summary.textContent = node ? `Node ${node.nodeId} / ${node.name} · ${nodeHealth(node)} · Direct` : "No directly observed online nodes";
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!node) return;
    Object.entries(node.dsdlData || {}).forEach(([k, v]) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${node.nodeId}</td><td>Info</td><td>${k}</td><td>${String(v)}</td>`;
      tbody.appendChild(tr);
    });
  }

  function renderLogTable() {
    const tbody = $("sc-dc-log-body");
    const node = canNodes.find((n) => n.nodeId === selectedCanId) || canNodes[0] || null;
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!node) return;
    [
      [node.nodeId, "Info", "node.name", node.name],
      [node.nodeId, "Info", "node.device_hint", node.deviceHint || "Unknown"],
      [node.nodeId, "Info", "node.mode", nodeMode(node)],
      [node.nodeId, "Info", "node.health", nodeHealth(node)],
      [node.nodeId, "Info", "node.discovery", "Direct / SLCAN observed"],
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
    if ($("sc-dc-can1-meta")) {
      $("sc-dc-can1-meta").innerHTML = `<dt>Bus</dt><dd>CAN1</dd><dt>Driver</dt><dd>CAN_D${fcCan.canDrivers[0] || 1}</dd><dt>Node ID</dt><dd>${fcCan.nodeId}</dd><dt>Transport</dt><dd>${slcanSessionReady ? "SLCAN Direct" : "Not ready"}</dd>`;
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

  function renderDsdlTable(node) {
    const tbody = document.querySelector("#sc-dsdl-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!node || !node.dsdlData) return;
    Object.entries(node.dsdlData).forEach(([k, v]) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${k}</td><td>${String(v)}</td>`;
      tbody.appendChild(tr);
    });
  }

  function selectCanNode(nodeId) {
    selectedCanId = nodeId;
    const node = canNodes.find((n) => n.nodeId === nodeId) || canNodes[0] || null;
    if ($("sc-dc-node-title")) $("sc-dc-node-title").textContent = node ? `Node Detail: NodeID ${node.nodeId} (${node.name})` : "Node Detail: -";
    const meta = $("sc-dc-node-meta");
    if (meta) {
      meta.innerHTML = "";
      if (node) {
        [
          ["Node ID", node.nodeId],
          ["Name", node.name],
          ["Device Hint", node.deviceHint || "Unknown"],
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
    if (currentMode !== "slcan") return;
    const adapterPort = detectSlcanAdapterPort();
    if (!adapterPort) {
      slcanSessionReady = false;
      slcanRuntime.nodes.clear();
      slcanRuntime.framesPerSecond = 0;
      if ($("sc-dc-hint")) $("sc-dc-hint").textContent = "SLCAN adapter port not found.";
      return;
    }
    try {
      const status = await bridgeJson("/slcan-status");
      if (!status.open || status.port !== adapterPort) {
        await bridgeJson("/slcan-open", { port: adapterPort, baudrate: 115200 });
      }
      await bridgeJson("/slcan-forward-enable", { bus: 1 });
      slcanSessionReady = true;
      if ($("sc-dc-transport-badge")) $("sc-dc-transport-badge").textContent = `SLCAN ${adapterPort}`;
      if ($("sc-dc-hint")) $("sc-dc-hint").textContent = `SLCAN Direct is bound to ${adapterPort}. Only directly observed nodes are shown.`;
    } catch (e) {
      slcanSessionReady = false;
      slcanRuntime.nodes.clear();
      slcanRuntime.framesPerSecond = 0;
      if ($("sc-dc-hint")) $("sc-dc-hint").textContent = `SLCAN Direct open failed: ${e?.message || e}`;
    }
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
    document.addEventListener("click", (ev) => {
      const modeBtn = ev.target.closest(".sc-dc-mode-tab");
      if (modeBtn) setMode(modeBtn.dataset.dcMode || "slcan");
      if (ev.target && ev.target.id === "sc-dc-scan") tick();
    });
    document.addEventListener("input", (ev) => {
      if (ev.target && ev.target.id === "sc-dc-filter-input") renderFilterTable();
    });
    document.addEventListener("change", (ev) => {
      if (ev.target && ev.target.id === "sc-dc-health-filter") renderFilterTable();
    });
  }

  function syncDronecanPanel() {
    const panel = panelRoot();
    const modeButton = document.querySelector('.ov-nav-item[data-setup-panel="dronecan"]');
    const activeByPanel = !!(panel && panel.classList.contains("active"));
    const activeByButton = !!(modeButton && modeButton.classList.contains("active"));
    const active = activeByPanel || activeByButton || !!workbenchRoot();

    if (active && !dronecanPanelWasActive) {
      dronecanPanelWasActive = true;
      if (panel && !panel.classList.contains("active")) panel.classList.add("active");
      ensureWorkbenchMarkup();
      ensureExtraStyles();
      bindDroneCan();
      refreshDroneCanModel();
      selectCanNode(selectedCanId || canNodes[0]?.nodeId || 0);
      setMode(currentMode);
      startDcTelemetry();
    } else if (!active && dronecanPanelWasActive) {
      dronecanPanelWasActive = false;
      stopDcTelemetry();
    } else if (active) {
      ensureWorkbenchMarkup();
      ensureExtraStyles();
      tick();
    }
  }

  function boot() {
    ensureWorkbenchMarkup();
    ensureExtraStyles();
    bindDroneCan();
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
