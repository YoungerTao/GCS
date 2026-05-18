(function initPowerSetup() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function getParamNum(name) {
    if (!window.params || !(window.params instanceof Map)) return null;
    if (!window.params.has(name)) return null;
    const v = Number(window.params.get(name));
    return Number.isFinite(v) ? v : null;
  }

  function fsSuffix(slotIndex) {
    if (typeof window.battFailsafeControlSuffix === "function") {
      return window.battFailsafeControlSuffix(slotIndex);
    }
    return slotIndex === 0 ? "" : `-${slotIndex + 1}`;
  }

  function fsIds(slotIndex) {
    const s = fsSuffix(slotIndex);
    return {
      cells: `power-cells-input${s}`,
      warn: `power-warn-slider${s}`,
      crit: `power-crit-slider${s}`,
      warnText: `power-warn-text${s}`,
      critText: `power-crit-text${s}`,
      fs: `power-fs-low-act${s}`,
    };
  }

  function getInstances() {
    if (typeof window.buildBatteryMonitorView === "function") {
      return window.buildBatteryMonitorView(window.params);
    }
    const map = window.powerInstances instanceof Map ? window.powerInstances : new Map();
    return Array.from(map.values()).sort((a, b) => a.id - b.id);
  }

  function syncSlidersFromParamsOnce() {
    if (window._powerParamsHydrated) return;
    const params = window.params;
    if (!(params instanceof Map)) return;

    const slots = typeof window.listEnabledBatterySlots === "function"
      ? window.listEnabledBatterySlots(params)
      : [{ slotIndex: 0, prefix: "BATT" }];

    let any = false;
    slots.forEach((slot) => {
      const ids = fsIds(slot.slotIndex);
      const low = getParamNum(`${slot.prefix}_LOW_VOLT`);
      const crt = getParamNum(`${slot.prefix}_CRT_VOLT`);
      const fs = getParamNum(`${slot.prefix}_FS_LOW_ACT`);
      if (low != null) {
        const w = document.getElementById(ids.warn);
        if (w) w.value = String(low);
        any = true;
      }
      if (crt != null) {
        const c = document.getElementById(ids.crit);
        if (c) c.value = String(crt);
        any = true;
      }
      if (fs != null) {
        const sel = document.getElementById(ids.fs);
        if (sel) sel.value = String(Math.round(fs));
        any = true;
      }
    });

    if (any) {
      window._powerParamsHydrated = true;
      slots.forEach((slot) => {
        document.getElementById(fsIds(slot.slotIndex).cells)?.dispatchEvent(new Event("input"));
      });
    }
  }

  function statusOf(inst) {
    if (inst.connected === false) return { label: "未连接", cls: "muted" };
    if (inst.voltage <= 0.1) return { label: "掉电", cls: "danger" };
    const perCell = inst.cells > 0 ? inst.voltage / inst.cells : 0;
    if (perCell > 0 && perCell < 3.45) return { label: "低压", cls: "warn" };
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

    const online = instances.filter((i) => i.connected);
    const isSingleRisk = online.length === 1 && instances.length > 1;
    risk.classList.toggle("hidden", !isSingleRisk);
    if (!risk.classList.contains("hidden")) {
      risk.textContent = `单路供电风险 ⚠️（${instances.length - online.length} 路已配置但未检测到 BMS）`;
    }

    const rowH = Math.min(36, Math.max(24, 120 / Math.max(instances.length, 1)));
    const startY = pdbY - ((instances.length - 1) * rowH) / 2;

    instances.forEach((inst, idx) => {
      const y = instances.length === 1 ? pdbY : startY + idx * rowH;
      const bx = 70;
      const fill = inst.connected ? "#1b243c" : "#151a28";
      const stroke = inst.connected ? "#4e6199" : "#3a4158";
      const b = mk("rect", { x: bx, y: y - 16, width: 140, height: 32, rx: 8, fill, stroke });
      const t = mk("text", { x: bx + 70, y: y + 4, "text-anchor": "middle", fill: inst.connected ? "#ecf1ff" : "#8b95b0", "font-size": 12 });
      t.textContent = inst.name;
      const alive = inst.connected && inst.voltage > 1;
      const line = mk("line", {
        x1: bx + 140, y1: y, x2: pdbX, y2: pdbY,
        stroke: alive ? "#4ade80" : "#64748b",
        "stroke-width": alive ? 4 : 2,
        "stroke-dasharray": inst.connected ? "" : "6 4",
      });
      svg.appendChild(b);
      svg.appendChild(t);
      svg.appendChild(line);
    });
  }

  function renderCards(instances) {
    const root = document.getElementById("power-cards");
    const countEl = document.getElementById("power-instance-count");
    if (!root || !countEl) return;

    const online = instances.filter((i) => i.connected).length;
    countEl.textContent = online < instances.length
      ? `${online} 路在线 / ${instances.length} 路已启用`
      : `${instances.length} 路电源`;

    root.classList.toggle("two-cols", instances.length > 1);
    root.innerHTML = "";

    instances.forEach((inst) => {
      const st = statusOf(inst);
      const card = document.createElement("article");
      card.className = `power-card ${inst.connected ? "" : "power-card-offline"} ${inst.type === "tethered" ? "tethered" : ""}`;
      const prefix = inst.prefix || (inst.id === 0 ? "BATT" : `BATT${inst.id + 1}`);
      const typeLabel = inst.typeShort || inst.type;
      const voltStr = inst.connected ? `${inst.voltage.toFixed(2)}V` : "—";
      const currStr = inst.connected ? `${inst.current.toFixed(2)}A` : "—";
      const cellsStr = inst.connected && inst.cells > 0 ? `${inst.cells}S` : "—";

      let cellBars = "";
      if (inst.connected && inst.cellVoltages && inst.cellVoltages.length) {
        cellBars = `<div class="power-cell-grid">${inst.cellVoltages.map((v, i, arr) => {
          const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
          const bad = Math.abs(v - avg) > 0.1;
          return `<div class="power-cell-bar ${bad ? "bad" : ""}" title="Cell${i + 1}: ${v.toFixed(3)}V"></div>`;
        }).join("")}</div>`;
      } else if (!inst.connected) {
        const sn = inst.serialNum != null ? ` · CAN ID=${inst.serialNum}` : "";
        cellBars = `<div class="muted">等待 BMS 遥测（${prefix}_MONITOR=8${sn}）</div>`;
      } else if (inst.type === "dronecan_bms") {
        cellBars = `<div class="muted">等待 DroneCAN BMS 单体数据…</div>`;
      } else {
        cellBars = `<div class="muted">无单体数据</div>`;
      }

      card.innerHTML = `
        <div class="power-card-head">
          <strong>🔋 ${inst.name}</strong>
          <span class="power-chip ${st.cls}">${st.label}</span>
        </div>
        <div class="power-kv"><span>参数前缀</span><span>${prefix}_*</span></div>
        <div class="power-kv"><span>监测类型</span><span>${typeLabel}</span></div>
        <div class="power-kv"><span>总电压 / 电流</span><span>${voltStr} / ${currStr}</span></div>
        <div class="power-kv"><span>串数</span><span>${cellsStr}</span></div>
        ${inst.connected && inst.remaining != null && inst.remaining >= 0 ? `<div class="power-kv"><span>剩余</span><span>${inst.remaining}%</span></div>` : ""}
        ${inst.connected && inst.temperature !== undefined ? `<div class="power-kv"><span>温度</span><span>${inst.temperature.toFixed(1)}°C</span></div>` : ""}
        ${cellBars}
        <div class="power-kv"><span>Fail-safe</span><span>${prefix}_FS_LOW_ACT</span></div>
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
      warnSlider.min = String(min);
      warnSlider.max = String(max);
      critSlider.min = String(min);
      critSlider.max = String(max);
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

  function ensureDynamicFailsafePanels(slots) {
    const host = document.getElementById("power-failsafe-dynamic")
      || document.querySelector("#setup-panel-power .power-right");
    if (!host) return;

    let dyn = document.getElementById("power-failsafe-dynamic");
    if (!dyn) {
      dyn = document.createElement("div");
      dyn.id = "power-failsafe-dynamic";
      dyn.className = "power-failsafe-dynamic";
      const writeBlock = document.querySelector("#setup-panel-power .power-write-actions");
      if (writeBlock && writeBlock.parentNode) {
        writeBlock.parentNode.insertBefore(dyn, writeBlock);
      } else {
        host.appendChild(dyn);
      }
    }

    const needDynamic = slots.filter((s) => s.slotIndex >= 3);
    const sig = needDynamic.map((s) => s.prefix).join("|");
    if (dyn.dataset.sig === sig) return;
    dyn.dataset.sig = sig;
    dyn.innerHTML = "";

    needDynamic.forEach((slot) => {
      const ids = fsIds(slot.slotIndex);
      const panel = document.createElement("div");
      panel.className = "power-batt2-panel";
      panel.innerHTML = `
        <h4 class="power-subhead">第 ${slot.slotIndex + 1} 路 ${slot.prefix}（${slot.typeShort}）</h4>
        <div class="power-failsafe-block">
          <label for="${ids.cells}">电池串数 (S)</label>
          <input id="${ids.cells}" type="number" value="12" min="3" max="16" step="1">
        </div>
        <div class="power-failsafe-block">
          <label for="${ids.warn}">一级低压阈值 (V)</label>
          <input id="${ids.warn}" type="range" min="30" max="60" value="44.4" step="0.1">
          <div id="${ids.warnText}" class="muted">44.4V</div>
        </div>
        <div class="power-failsafe-block">
          <label for="${ids.crit}">二级低压阈值 (V)</label>
          <input id="${ids.crit}" type="range" min="30" max="60" value="42.0" step="0.1">
          <div id="${ids.critText}" class="muted">42.0V</div>
        </div>
        <div class="power-failsafe-block">
          <label for="${ids.fs}">低压保护 ${slot.prefix}_FS_LOW_ACT</label>
          <select id="${ids.fs}">
            <option value="0">0 — 仅警告</option>
            <option value="1">1 — Land</option>
            <option value="2" selected>2 — RTL</option>
            <option value="3">3 — SmartRTL / RTL</option>
            <option value="4">4 — Terminate</option>
          </select>
        </div>
      `;
      dyn.appendChild(panel);
      bindFailsafeGroup(
        document.getElementById(ids.cells),
        document.getElementById(ids.warn),
        document.getElementById(ids.crit),
        document.getElementById(ids.warnText),
        document.getElementById(ids.critText)
      );
    });
  }

  function updateMultiBatteryPanels(slots) {
    const p2 = document.getElementById("power-batt2-panel");
    const p3 = document.getElementById("power-batt3-panel");
    const has2 = slots.some((s) => s.slotIndex === 1);
    const has3 = slots.some((s) => s.slotIndex === 2);
    if (p2) p2.classList.toggle("hidden", !has2);
    if (p3) p3.classList.toggle("hidden", !has3);
    ensureDynamicFailsafePanels(slots);
  }

  async function writePowerParamsToFc() {
    const statusEl = document.getElementById("power-write-status");
    const logicEl = document.getElementById("power-logic-select");

    if (typeof window.sendParamSet !== "function") {
      if (statusEl) statusEl.textContent = "写入失败：内部未注册 sendParamSet。";
      return;
    }

    const slots = typeof window.listEnabledBatterySlots === "function"
      ? window.listEnabledBatterySlots(window.params)
      : [{ slotIndex: 0, prefix: "BATT" }];

    const chains = slots.map((slot) => {
      const ids = fsIds(slot.slotIndex);
      return {
        prefix: slot.prefix,
        low: Number(document.getElementById(ids.warn)?.value),
        crit: Number(document.getElementById(ids.crit)?.value),
        fs: Number(document.getElementById(ids.fs)?.value),
      };
    });

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
      logicNote = "界面已选「任意一路低压」逻辑；ArduPilot 默认为各路独立 BATTx_FS_*。";
    } else if (logic === "all") {
      logicNote = "界面已选「双路同时低压」逻辑：标准固件无单一参数等价。";
    }

    const msg = `电源参数写入已发送 ${sent} 条（${chains.length} 路监测槽）；${logicNote}`;
    if (typeof log === "function") log(`🔋 ${msg} | ${lines.join(" · ")}`, "power-param-write");
    if (statusEl) {
      statusEl.textContent = `已发送 ${sent} 条（${lines.join("；")}）。`;
    }
  }

  function tick() {
    syncSlidersFromParamsOnce();
    const slots = typeof window.listEnabledBatterySlots === "function"
      ? window.listEnabledBatterySlots(window.params)
      : [];
    const instances = getInstances();
    updateMultiBatteryPanels(slots.length ? slots : [{ slotIndex: 0, prefix: "BATT" }]);
    renderTopology(instances);
    renderCards(instances);
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

    document.addEventListener("gcs-connection", () => {
      if (window._gcsConnState === "connected") {
        window._powerParamsHydrated = false;
      } else if (window.powerInstances instanceof Map) {
        window.powerInstances.clear();
      }
    });

    document.addEventListener("gcs-sensor-overview-changed", () => {
      window._powerParamsHydrated = false;
    });

    tick();
    setInterval(tick, 600);
  }

  window.addEventListener("DOMContentLoaded", mount);
})();
