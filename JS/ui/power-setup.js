(function initPowerSetup() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function getParamNum(name) {
    if (!window.params || !(window.params instanceof Map)) return null;
    if (!window.params.has(name)) return null;
    const v = Number(window.params.get(name));
    return Number.isFinite(v) ? v : null;
  }

  function syncSlidersFromParamsOnce() {
    if (window._powerParamsHydrated) return;
    const params = window.params;
    if (!(params instanceof Map)) return;

    const v1 = getParamNum("BATT_LOW_VOLT");
    const c1 = getParamNum("BATT_CRT_VOLT");
    const fs1 = getParamNum("BATT_FS_LOW_ACT");
    if (v1 != null) {
      const w = document.getElementById("power-warn-slider");
      if (w) w.value = String(v1);
    }
    if (c1 != null) {
      const c = document.getElementById("power-crit-slider");
      if (c) c.value = String(c1);
    }
    if (fs1 != null) {
      const sel = document.getElementById("power-fs-low-act");
      if (sel) sel.value = String(Math.round(fs1));
    }

    const v2 = getParamNum("BATT2_LOW_VOLT");
    const c2 = getParamNum("BATT2_CRT_VOLT");
    const fs2 = getParamNum("BATT2_FS_LOW_ACT");
    if (v2 != null) {
      const w = document.getElementById("power-warn-slider-2");
      if (w) w.value = String(v2);
    }
    if (c2 != null) {
      const c = document.getElementById("power-crit-slider-2");
      if (c) c.value = String(c2);
    }
    if (fs2 != null) {
      const sel = document.getElementById("power-fs-low-act-2");
      if (sel) sel.value = String(Math.round(fs2));
    }

    const v3 = getParamNum("BATT3_LOW_VOLT");
    const c3 = getParamNum("BATT3_CRT_VOLT");
    const fs3 = getParamNum("BATT3_FS_LOW_ACT");
    if (v3 != null) {
      const w = document.getElementById("power-warn-slider-3");
      if (w) w.value = String(v3);
    }
    if (c3 != null) {
      const c = document.getElementById("power-crit-slider-3");
      if (c) c.value = String(c3);
    }
    if (fs3 != null) {
      const sel = document.getElementById("power-fs-low-act-3");
      if (sel) sel.value = String(Math.round(fs3));
    }

    if (v1 != null || v2 != null || v3 != null) {
      window._powerParamsHydrated = true;
      document.getElementById("power-cells-input")?.dispatchEvent(new Event("input"));
      document.getElementById("power-cells-input-2")?.dispatchEvent(new Event("input"));
      document.getElementById("power-cells-input-3")?.dispatchEvent(new Event("input"));
    }
  }

  function getInstances() {
    const map = window.powerInstances instanceof Map ? window.powerInstances : new Map();
    let list = Array.from(map.values()).sort((a, b) => a.id - b.id);
    if (!list.length && typeof window.battery_voltage === "number" && window.battery_voltage > 0) {
      list = [{
        id: 0,
        name: "Battery 1",
        type: "analog",
        cells: Math.max(1, Math.round(window.battery_voltage / 3.7)),
        voltage: window.battery_voltage,
        current: 0,
        cellVoltages: [],
      }];
    }
    return list;
  }

  function statusOf(inst) {
    if (inst.voltage <= 0.1) return { label: "掉电", cls: "danger" };
    const perCell = inst.cells > 0 ? inst.voltage / inst.cells : 0;
    if (perCell < 3.45) return { label: "低压", cls: "warn" };
    if (inst.current > 120) return { label: "过流", cls: "danger" };
    return { label: "正常", cls: "" };
  }

  function renderTopology(instances) {
    const svg = document.getElementById("power-topology-svg");
    const risk = document.getElementById("power-risk-banner");
    if (!svg || !risk) return;
    svg.innerHTML = "";
    const pdbX = 530;
    const pdbY = 70;
    const mk = (tag, attrs) => {
      const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
      return el;
    };
    const pdb = mk("rect", { x: pdbX, y: pdbY - 24, width: 130, height: 48, rx: 10, fill: "#1f2944", stroke: "#6a7fbe" });
    const pdbText = mk("text", { x: pdbX + 65, y: pdbY + 7, "text-anchor": "middle", fill: "#d8e2ff", "font-size": 16 });
    pdbText.textContent = "分电板 PDB";
    svg.appendChild(pdb);
    svg.appendChild(pdbText);

    const isSingleRisk = instances.length === 2 && instances.some((i) => i.voltage < 1);
    risk.classList.toggle("hidden", !isSingleRisk);

    instances.forEach((inst, idx) => {
      const y = instances.length === 1 ? pdbY : (idx === 0 ? 42 : 98);
      const bx = 70;
      const b = mk("rect", { x: bx, y: y - 20, width: 140, height: 40, rx: 10, fill: "#1b243c", stroke: "#4e6199" });
      const t = mk("text", { x: bx + 70, y: y + 5, "text-anchor": "middle", fill: "#ecf1ff", "font-size": 13 });
      t.textContent = `${inst.name} ${inst.type === "tethered" ? "(系留)" : ""}`;
      const alive = inst.voltage > 1;
      const line = mk("line", { x1: bx + 140, y1: y, x2: pdbX, y2: pdbY, stroke: alive ? "#4ade80" : "#64748b", "stroke-width": 4 });
      svg.appendChild(b); svg.appendChild(t); svg.appendChild(line);
    });
  }

  function renderCards(instances) {
    const root = document.getElementById("power-cards");
    const countEl = document.getElementById("power-instance-count");
    if (!root || !countEl) return;
    countEl.textContent = `${instances.length} 路电源`;
    root.classList.toggle("two-cols", instances.length > 1);
    root.innerHTML = "";

    instances.forEach((inst, idx) => {
      const st = statusOf(inst);
      const card = document.createElement("article");
      card.className = `power-card ${inst.type === "tethered" ? "tethered" : ""}`;
      const cellBars = inst.cellVoltages && inst.cellVoltages.length
        ? `<div class="power-cell-grid">${inst.cellVoltages.map((v, i, arr) => {
            const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
            const bad = Math.abs(v - avg) > 0.1;
            return `<div class="power-cell-bar ${bad ? "bad" : ""}" title="Cell${i + 1}: ${v.toFixed(3)}V"></div>`;
          }).join("")}</div>`
        : `<div class="muted">无单体数据（模拟传感器）</div>`;
      const battKey = idx === 0 ? "BATT" : `BATT${idx + 1}`;
      card.innerHTML = `
        <div class="power-card-head">
          <strong>🔋${idx + 1} ${inst.name}</strong>
          <span class="power-chip ${st.cls}">${st.label}</span>
        </div>
        <div class="power-kv"><span>参数前缀</span><span>${battKey}_*</span></div>
        <div class="power-kv"><span>类型</span><span>${inst.type}</span></div>
        <div class="power-kv"><span>总电压 / 电流</span><span>${inst.voltage.toFixed(2)}V / ${inst.current.toFixed(2)}A</span></div>
        <div class="power-kv"><span>串数</span><span>${inst.cells}S</span></div>
        ${inst.type === "tethered" ? `<div class="power-kv"><span>DCDC效率</span><span>94%</span></div>` : ""}
        ${inst.temperature !== undefined ? `<div class="power-kv"><span>温度</span><span>${inst.temperature.toFixed(1)}°C</span></div>` : ""}
        ${cellBars}
        <div class="power-kv"><span>Fail-safe</span><span>见右侧 ${battKey}_FS_LOW_ACT</span></div>
      `;
      root.appendChild(card);
    });
  }

  function bindFailsafeGroup(cellsInput, warnSlider, critSlider, warnText, critText) {
    if (!cellsInput || !warnSlider || !critSlider || !warnText || !critText) return;

    function recalcRange() {
      const s = Math.max(3, Math.min(16, Number(cellsInput.value) || 12));
      cellsInput.value = String(s);
      const min = +(s * 3.4).toFixed(1);
      const max = +(s * 3.9).toFixed(1);
      warnSlider.min = String(min); warnSlider.max = String(max);
      critSlider.min = String(min); critSlider.max = String(max);
      if (+warnSlider.value < min || +warnSlider.value > max) warnSlider.value = String((s * 3.7).toFixed(1));
      if (+critSlider.value < min || +critSlider.value > max) critSlider.value = String((s * 3.5).toFixed(1));
      if (+critSlider.value > +warnSlider.value) critSlider.value = warnSlider.value;
      warnText.textContent = `${Number(warnSlider.value).toFixed(1)}V`;
      critText.textContent = `${Number(critSlider.value).toFixed(1)}V`;
    }

    cellsInput.addEventListener("input", recalcRange);
    warnSlider.addEventListener("input", () => {
      if (+warnSlider.value < +critSlider.value) warnSlider.value = critSlider.value;
      recalcRange();
    });
    critSlider.addEventListener("input", () => {
      if (+critSlider.value > +warnSlider.value) critSlider.value = warnSlider.value;
      recalcRange();
    });
    recalcRange();
  }

  function updateMultiBatteryPanels() {
    const n = getInstances().length;
    const p2 = document.getElementById("power-batt2-panel");
    const p3 = document.getElementById("power-batt3-panel");
    if (p2) p2.classList.toggle("hidden", n < 2);
    if (p3) p3.classList.toggle("hidden", n < 3);
  }

  function battPrefix(chainIndex) {
    return chainIndex === 0 ? "BATT" : `BATT${chainIndex + 1}`;
  }

  async function writePowerParamsToFc() {
    const statusEl = document.getElementById("power-write-status");
    const logicEl = document.getElementById("power-logic-select");
    const instances = getInstances();
    if (instances.length === 0) {
      if (statusEl) statusEl.textContent = "无电源遥测实例：仍将写入 BATT 主路（请确认已连接并已加载参数）。";
    }

    if (typeof window.sendParamSet !== "function") {
      if (statusEl) statusEl.textContent = "写入失败：内部未注册 sendParamSet。";
      return;
    }

    const chains = [];
    chains.push({
      prefix: battPrefix(0),
      low: Number(document.getElementById("power-warn-slider")?.value),
      crit: Number(document.getElementById("power-crit-slider")?.value),
      fs: Number(document.getElementById("power-fs-low-act")?.value),
    });

    const nRemote = instances.length >= 2 ? instances.length : 1;
    if (nRemote >= 2) {
      chains.push({
        prefix: battPrefix(1),
        low: Number(document.getElementById("power-warn-slider-2")?.value),
        crit: Number(document.getElementById("power-crit-slider-2")?.value),
        fs: Number(document.getElementById("power-fs-low-act-2")?.value),
      });
    }
    if (nRemote >= 3) {
      chains.push({
        prefix: battPrefix(2),
        low: Number(document.getElementById("power-warn-slider-3")?.value),
        crit: Number(document.getElementById("power-crit-slider-3")?.value),
        fs: Number(document.getElementById("power-fs-low-act-3")?.value),
      });
    }

    let sent = 0;
    const lines = [];

    /* eslint-disable no-await-in-loop */
    for (const c of chains) {
      const lowKey = `${c.prefix}_LOW_VOLT`;
      const crtKey = `${c.prefix}_CRT_VOLT`;
      const fsKey = `${c.prefix}_FS_LOW_ACT`;
      if (!Number.isFinite(c.low) || !Number.isFinite(c.crit) || !Number.isFinite(c.fs)) continue;
      if (await window.sendParamSet(lowKey, c.low)) sent += 1;
      await sleep(45);
      if (await window.sendParamSet(crtKey, c.crit)) sent += 1;
      await sleep(45);
      if (await window.sendParamSet(fsKey, c.fs)) sent += 1;
      await sleep(45);
      lines.push(`${c.prefix}: LOW=${c.low}V CRT=${c.crit}V FS=${c.fs}`);
    }
    /* eslint-enable no-await-in-loop */

    if (sent === 0) {
      if (typeof log === "function") {
        log("❌ 电源参数写入失败：请确认串口已连接。", "power-param-write");
      }
      if (statusEl) statusEl.textContent = "写入失败：未连接飞控或发送被拒绝。";
      return;
    }

    const logic = logicEl ? logicEl.value : "";
    let logicNote = "";
    if (logic === "any") {
      logicNote = "界面已选「任意一路低压」逻辑；ArduPilot 默认为各路独立 BATTx_FS_*，并联策略请在飞控脚本/自定义档位中复核。";
    } else if (logic === "all") {
      logicNote = "界面已选「双路同时低压」逻辑：标准固件无单一参数等价，需在任务规划端或 LUA/自定义Failsafe处理。";
    }

    const msg = `电源参数写入已发送 ${sent} 条；${logicNote}`;
    if (typeof log === "function") log(`🔋 ${msg} | ${lines.join(" · ")}`, "power-param-write");
    if (statusEl) {
      statusEl.textContent = `已发送 ${sent} 条（${lines.join("；")}）。请等待 PARAM_VALUE / 地面站 ACK。`;
    }
  }

  function tick() {
    syncSlidersFromParamsOnce();
    const instances = getInstances();
    renderTopology(instances);
    renderCards(instances);
    updateMultiBatteryPanels();
  }

  function mount() {
    if (!document.getElementById("setup-panel-power")) return;

    bindFailsafeGroup(
      document.getElementById("power-cells-input"),
      document.getElementById("power-warn-slider"),
      document.getElementById("power-crit-slider"),
      document.getElementById("power-warn-text"),
      document.getElementById("power-crit-text")
    );
    bindFailsafeGroup(
      document.getElementById("power-cells-input-2"),
      document.getElementById("power-warn-slider-2"),
      document.getElementById("power-crit-slider-2"),
      document.getElementById("power-warn-text-2"),
      document.getElementById("power-crit-text-2")
    );
    bindFailsafeGroup(
      document.getElementById("power-cells-input-3"),
      document.getElementById("power-warn-slider-3"),
      document.getElementById("power-crit-slider-3"),
      document.getElementById("power-warn-text-3"),
      document.getElementById("power-crit-text-3")
    );

    document.getElementById("power-write-params-btn")?.addEventListener("click", () => {
      writePowerParamsToFc();
    });

    tick();
    setInterval(tick, 600);
  }

  window.addEventListener("DOMContentLoaded", mount);
})();
