(function initDroneCanSetup() {
  const svgNs = "http://www.w3.org/2000/svg";

  /** @type {Array<{nodeId:number,status:string,name:string,hardwareVersion:string,dsdlData:Record<string,string>}>} */
  let canNodes = [
    {
      nodeId: 0,
      status: "online",
      name: "飞控主板",
      hardwareVersion: "CubeOrange+",
      dsdlData: {},
    },
    {
      nodeId: 125,
      status: "online",
      name: "Smart Battery (BMS)",
      hardwareVersion: "ZY-BMS-12S",
      dsdlData: {
        "battery.Voltage": "49.82 V",
        "battery.Current": "12.45 A",
        "battery.Cell_Delta": "12 mV (健康)",
      },
    },
    {
      nodeId: 10,
      status: "online",
      name: "ESC 电调 1",
      hardwareVersion: "Hobbywing CAN",
      dsdlData: { "esc.rpm": "1840", "esc.temp": "42 °C" },
    },
    {
      nodeId: 11,
      status: "online",
      name: "ESC 电调 2",
      hardwareVersion: "Hobbywing CAN",
      dsdlData: { "esc.rpm": "1822", "esc.temp": "41 °C" },
    },
    {
      nodeId: 85,
      status: "online",
      name: "GPS / 外置罗盘",
      hardwareVersion: "Septentrio mosaic",
      dsdlData: { "gps.lat": "31.2304", "gps.lon": "121.4737", "gps.fix": "RTK Fixed" },
    },
  ];

  let selectedCanId = 125;
  let dsdlTimer = 0;
  let dcTelemetryTimer = 0;

  function $(id) {
    return document.getElementById(id);
  }

  /* ---------- DroneCAN ---------- */
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
      const s0 = document.createElementNS(svgNs, "stop");
      s0.setAttribute("offset", "0%");
      s0.setAttribute("stop-color", "#10b981");
      const s1 = document.createElementNS(svgNs, "stop");
      s1.setAttribute("offset", "50%");
      s1.setAttribute("stop-color", "#34d399");
      const s2 = document.createElementNS(svgNs, "stop");
      s2.setAttribute("offset", "100%");
      s2.setAttribute("stop-color", "#065f46");
      g.appendChild(s0);
      g.appendChild(s1);
      g.appendChild(s2);
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
    const children = canNodes.filter((n) => n.nodeId !== 0);
    const n = children.length;
    const span = 340;
    const left = hubX - span / 2;

    const hub = document.createElementNS(svgNs, "g");
    hub.classList.add("sc-dc-node");
    hub.setAttribute("data-node", "0");
    const hubRect = document.createElementNS(svgNs, "rect");
    hubRect.setAttribute("x", hubX - 72);
    hubRect.setAttribute("y", hubY - 22);
    hubRect.setAttribute("width", "144");
    hubRect.setAttribute("height", "44");
    hubRect.setAttribute("rx", "8");
    hubRect.setAttribute("fill", "#1e2235");
    hubRect.setAttribute("stroke", "#10b981");
    hub.appendChild(hubRect);
    const hubT = document.createElementNS(svgNs, "text");
    hubT.setAttribute("x", hubX);
    hubT.setAttribute("y", hubY + 5);
    hubT.setAttribute("text-anchor", "middle");
    hubT.setAttribute("fill", "#e8ecf4");
    hubT.setAttribute("font-size", "12");
    hubT.setAttribute("font-family", "Inter, sans-serif");
    hubT.textContent = "飞控主板 (0)";
    hub.appendChild(hubT);
    svg.appendChild(hub);

    children.forEach((node, i) => {
      const nx = left + (n === 1 ? span / 2 : (i / (n - 1)) * span);
      const ny = 280;
      const link = document.createElementNS(svgNs, "line");
      link.classList.add("sc-dc-link");
      link.setAttribute("x1", hubX);
      link.setAttribute("y1", hubY + 22);
      link.setAttribute("x2", nx);
      link.setAttribute("y2", ny - 28);
      link.setAttribute("stroke", "#3d4f6a");
      link.setAttribute("stroke-width", "2");
      link.setAttribute("stroke-dasharray", "6 4");
      svg.appendChild(link);

      const g = document.createElementNS(svgNs, "g");
      g.classList.add("sc-dc-node");
      if (node.status !== "online") g.classList.add("sc-dc-node--offline");
      g.setAttribute("data-node", String(node.nodeId));

      const rect = document.createElementNS(svgNs, "rect");
      rect.setAttribute("x", nx - 70);
      rect.setAttribute("y", ny - 26);
      rect.setAttribute("width", "140");
      rect.setAttribute("height", "52");
      rect.setAttribute("rx", "8");
      rect.setAttribute("fill", "#1a2033");
      rect.setAttribute("stroke", node.status === "online" ? "#10b981" : "#ef4444");
      rect.setAttribute("stroke-width", "1.5");
      g.appendChild(rect);

      const led = document.createElementNS(svgNs, "circle");
      led.setAttribute("cx", nx - 52);
      led.setAttribute("cy", ny);
      led.setAttribute("r", "5");
      led.setAttribute("fill", node.status === "online" ? "#10b981" : "#ef4444");
      g.appendChild(led);

      const t1 = document.createElementNS(svgNs, "text");
      t1.setAttribute("x", nx - 38);
      t1.setAttribute("y", ny - 4);
      t1.setAttribute("fill", "#cfd4e6");
      t1.setAttribute("font-size", "11");
      t1.setAttribute("font-family", "Inter, sans-serif");
      t1.textContent = node.name.length > 14 ? `${node.name.slice(0, 12)}…` : node.name;
      g.appendChild(t1);

      const t2 = document.createElementNS(svgNs, "text");
      t2.setAttribute("x", nx - 38);
      t2.setAttribute("y", ny + 12);
      t2.setAttribute("fill", "#8b95a8");
      t2.setAttribute("font-size", "10");
      t2.setAttribute("font-family", "JetBrains Mono, monospace");
      t2.textContent = `ID ${node.nodeId}`;
      g.appendChild(t2);

      g.addEventListener("dblclick", () => selectCanNode(node.nodeId));
      svg.appendChild(g);
    });
  }

  function selectCanNode(nodeId) {
    selectedCanId = nodeId;
    const node = canNodes.find((n) => n.nodeId === nodeId);
    const title = $("sc-dc-node-title");
    const meta = $("sc-dc-node-meta");
    if (title) title.textContent = node ? `节点详情: NodeID ${node.nodeId} (${node.name})` : "节点详情: —";
    if (meta) {
      meta.innerHTML = "";
      if (!node) return;
      const rows = [
        ["制造商 ID", "com.zhongyue.power"],
        ["固件 Hash", node.nodeId === 125 ? "a3f89e21…" : "—"],
        ["硬件版本", node.hardwareVersion],
        ["状态", node.status],
      ];
      rows.forEach(([k, v]) => {
        const dt = document.createElement("dt");
        dt.textContent = k;
        const dd = document.createElement("dd");
        dd.textContent = v;
        meta.appendChild(dt);
        meta.appendChild(dd);
      });
    }
    renderDsdlTable(node);
  }

  function renderDsdlTable(node) {
    const tbody = document.querySelector("#sc-dsdl-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!node || !node.dsdlData) return;
    Object.entries(node.dsdlData).forEach(([k, v]) => {
      const tr = document.createElement("tr");
      tr.dataset.field = k;
      const td1 = document.createElement("td");
      td1.textContent = k;
      const td2 = document.createElement("td");
      td2.textContent = String(v);
      tr.appendChild(td1);
      tr.appendChild(td2);
      tbody.appendChild(tr);
    });
  }

  function flashRow(field) {
    const tr = document.querySelector(`#sc-dsdl-table tbody tr[data-field="${field}"]`);
    if (!tr) return;
    tr.classList.remove("sc-row-glow");
    void tr.offsetWidth;
    tr.classList.add("sc-row-glow");
  }

  function tickDsdlLive() {
    const node = canNodes.find((n) => n.nodeId === selectedCanId);
    if (!node || !node.dsdlData) return;
    if (selectedCanId === 125) {
      const v = 49.5 + Math.random() * 0.45;
      const a = 11.8 + Math.random() * 1.2;
      node.dsdlData["battery.Voltage"] = `${v.toFixed(2)} V`;
      node.dsdlData["battery.Current"] = `${a.toFixed(2)} A`;
      flashRow("battery.Voltage");
      flashRow("battery.Current");
    } else if (selectedCanId === 10 || selectedCanId === 11) {
      const rpm = 1750 + Math.round(Math.random() * 120);
      const te = 38 + Math.random() * 6;
      node.dsdlData["esc.rpm"] = String(rpm);
      node.dsdlData["esc.temp"] = `${te.toFixed(1)} °C`;
      flashRow("esc.rpm");
      flashRow("esc.temp");
    } else if (selectedCanId === 85) {
      node.dsdlData["gps.lat"] = (31.2304 + (Math.random() - 0.5) * 0.0002).toFixed(6);
      node.dsdlData["gps.lon"] = (121.4737 + (Math.random() - 0.5) * 0.0002).toFixed(6);
      flashRow("gps.lat");
      flashRow("gps.lon");
    }
    renderDsdlTable(node);
  }

  function startDcTelemetry() {
    stopDcTelemetry();
    dsdlTimer = window.setInterval(tickDsdlLive, 900);
    dcTelemetryTimer = window.setInterval(() => {
      const load = $("sc-dc-load");
      const fps = $("sc-dc-fps");
      if (load) load.textContent = `${20 + Math.round(Math.random() * 12)}%`;
      if (fps) fps.textContent = String(420 + Math.round(Math.random() * 60));
    }, 1400);
  }

  function stopDcTelemetry() {
    clearInterval(dsdlTimer);
    clearInterval(dcTelemetryTimer);
    dsdlTimer = 0;
    dcTelemetryTimer = 0;
  }

  function bindDroneCan() {
    $("sc-dc-scan")?.addEventListener("click", () => {
      const svg = $("sc-dc-svg");
      if (svg) {
        svg.classList.add("sc-dc-scanning");
        window.setTimeout(() => svg.classList.remove("sc-dc-scanning"), 2200);
      }
      canNodes.forEach((n) => {
        if (n.nodeId === 85 && Math.random() > 0.65) n.status = "offline";
        else if (n.nodeId === 85) n.status = "online";
      });
      renderCanTopology();
      selectCanNode(selectedCanId);
    });

    $("sc-dc-write")?.addEventListener("click", async () => {
      const wrap = $("sc-dc-write-progress");
      const bar = $("sc-dc-write-bar");
      const pct = $("sc-dc-write-pct");
      if (wrap) wrap.classList.remove("hidden");
      let p = 0;
      const step = () => {
        p += 6;
        if (bar) bar.style.width = `${Math.min(p, 100)}%`;
        if (pct) pct.textContent = `${Math.min(p, 100)}%`;
        if (p < 100) requestAnimationFrame(() => setTimeout(step, 45));
        else setTimeout(() => wrap?.classList.add("hidden"), 400);
      };
      step();
    });
  }

  let dronecanPanelWasActive = false;

  function syncDronecanPanel() {
    const panel = document.getElementById("setup-panel-dronecan");
    const active = !!(panel && panel.classList.contains("active"));
    if (active && !dronecanPanelWasActive) {
      dronecanPanelWasActive = true;
      renderCanTopology();
      selectCanNode(selectedCanId);
      startDcTelemetry();
    } else if (!active && dronecanPanelWasActive) {
      dronecanPanelWasActive = false;
      stopDcTelemetry();
    }
  }

  function boot() {
    bindDroneCan();
    document.querySelectorAll(".ov-nav-item[data-setup-panel]").forEach((btn) => {
      btn.addEventListener("click", () => window.requestAnimationFrame(syncDronecanPanel));
    });
    window.requestAnimationFrame(syncDronecanPanel);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();