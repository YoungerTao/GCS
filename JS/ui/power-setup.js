(function initPowerSetup() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function getParamNum(name) {
    if (!window.params || !(window.params instanceof Map)) return null;
    if (!window.params.has(name)) return null;
    const v = Number(window.params.get(name));
    return Number.isFinite(v) ? v : null;
  }

  function getInstances() {
    if (typeof window.buildBatteryMonitorView === "function") {
      const view = window.buildBatteryMonitorView(window.params);
      if (view.length) return view;
    }
    const map = window.powerInstances instanceof Map ? window.powerInstances : new Map();
    const fromTelem = Array.from(map.values()).sort((a, b) => a.id - b.id);
    if (fromTelem.length) return fromTelem;

    const slots = typeof window.listEnabledBatterySlots === "function"
      ? window.listEnabledBatterySlots(window.params)
      : [];
    if (slots.length) {
      return slots.map((slot) => ({
        ...slot,
        id: slot.slotIndex,
        name: `Battery ${slot.slotIndex + 1}`,
        connected: false,
        type: slot.typeUi,
        voltage: 0,
        current: 0,
        cells: 0,
        cellVoltages: [],
      }));
    }

    const mon = getParamNum("BATT_MONITOR");
    if (mon === 0 || mon == null) {
      return [{
        id: 0,
        slotIndex: 0,
        name: "Battery 1",
        prefix: "BATT",
        monitorKey: "BATT_MONITOR",
        monitorType: mon ?? 0,
        typeShort: "Disabled",
        typeUi: "disabled",
        connected: false,
        voltage: 0,
        current: 0,
        cells: 0,
        cellVoltages: [],
      }];
    }
    return [];
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
    const emptyEl = document.getElementById("power-cards-empty");
    if (!root || !countEl) return;

    const online = instances.filter((i) => i.connected).length;
    countEl.textContent = online < instances.length
      ? `${online} 路在线 / ${instances.length} 路已启用`
      : `${instances.length} 路电源`;

    const showEmpty = !instances.length;
    if (emptyEl) emptyEl.classList.toggle("hidden", !showEmpty);
    root.classList.toggle("hidden", showEmpty);
    root.classList.toggle("two-cols", instances.length > 1);
    root.innerHTML = "";
    if (showEmpty) return;

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
        const monHint = inst.monitorType === 0 || inst.monitorType == null
          ? `请设置 ${prefix}_MONITOR 为非 0（如 4=模拟电压电流）`
          : `等待 BMS 遥测（${prefix}_MONITOR=${inst.monitorType}${sn}）`;
        cellBars = `<div class="muted">${monHint}</div>`;
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

  const CELLS_S_MIN = 3;
  const CELLS_S_MAX = 30;

  const CAP_MAH_MIN = 500;
  const CAP_MAH_MAX = 50000;
  const CAP_MAH_STEP = 100;
  const FS_ACT_MAX = 7;
  const FS_ACT_LABELS = [
    "仅警告",
    "Land 降落",
    "RTL 返航",
    "SmartRTL/RTL",
    "SmartRTL/Land",
    "Terminate",
    "Auto 返航",
    "Brake/Land",
  ];

  function battParamKeys(prefix) {
    return {
      lowVolt: `${prefix}_LOW_VOLT`,
      crtVolt: `${prefix}_CRT_VOLT`,
      fsLowAct: `${prefix}_FS_LOW_ACT`,
      fsCrtAct: `${prefix}_FS_CRT_ACT`,
      capacity: `${prefix}_CAPACITY`,
      lowMah: `${prefix}_LOW_MAH`,
      crtMah: `${prefix}_CRT_MAH`,
    };
  }

  function fsActLabel(v) {
    const i = Math.round(Number(v) || 0);
    return `${i} — ${FS_ACT_LABELS[i] || `动作${i}`}`;
  }

  const BATT_CONFIG_COPY_FIELDS = [
    "cells", "lowVolt", "crtVolt", "fsLowAct", "fsCrtAct",
    "capacity", "lowMah", "crtMah",
  ];

  function fieldRow(label, paramHint, field, extraAttrs, valueText) {
    return `
        <div class="power-fs-field" data-field-wrap="${field}">
          <label class="power-fs-label-row">
            <span class="power-fs-label-text">${label}</span>
            <span class="power-fs-value" data-value-for="${field}">${valueText}</span>
            <span class="power-fs-param">${paramHint}</span>
          </label>
          <input type="range" data-field="${field}" ${extraAttrs}>
        </div>`;
  }

  function buildBattConfigCardHtml(slot) {
    const p = slot.prefix;
    const keys = battParamKeys(p);
    return `
    <article class="power-batt-config-card" data-slot-index="${slot.slotIndex}" data-prefix="${p}">
      <header class="power-batt-config-head">
        <h4>第 ${slot.slotIndex + 1} 路 · ${p}</h4>
        <span class="power-batt-config-type muted">${slot.typeShort || "Monitor"}</span>
      </header>
      <div class="power-batt-config-body">
        ${fieldRow("电池串数 (S)", "（电压滑条范围）", "cells", `min="${CELLS_S_MIN}" max="${CELLS_S_MAX}" step="1" value="12"`, "12S")}
        ${fieldRow("一级电压 · 低压警报", keys.lowVolt, "lowVolt", 'min="30" max="60" step="0.1" value="44.4"', "44.4V")}
        ${fieldRow("二级电压 · 紧急电压", keys.crtVolt, "crtVolt", 'min="30" max="60" step="0.1" value="42.0"', "42.0V")}
        ${fieldRow("低压保护动作", keys.fsLowAct, "fsLowAct", `min="0" max="${FS_ACT_MAX}" step="1" value="2"`, "2 — RTL 返航")}
        ${fieldRow("紧急电压动作", keys.fsCrtAct, "fsCrtAct", `min="0" max="${FS_ACT_MAX}" step="1" value="2"`, "2 — RTL 返航")}
        ${fieldRow("满电容量 (mAh)", keys.capacity, "capacity", `min="${CAP_MAH_MIN}" max="${CAP_MAH_MAX}" step="${CAP_MAH_STEP}" value="10000"`, "10000 mAh")}
        ${fieldRow("低容量 (mAh)", keys.lowMah, "lowMah", `min="${CAP_MAH_MIN}" max="${CAP_MAH_MAX}" step="${CAP_MAH_STEP}" value="2000"`, "2000 mAh")}
        ${fieldRow("紧急容量 (mAh)", keys.crtMah, "crtMah", `min="${CAP_MAH_MIN}" max="${CAP_MAH_MAX}" step="${CAP_MAH_STEP}" value="1000"`, "1000 mAh")}
        ${fieldRow("低容量动作", keys.fsLowAct, "fsLowMahAct", `min="0" max="${FS_ACT_MAX}" step="1" value="2"`, "2 — RTL 返航")}
        ${fieldRow("紧急容量动作", keys.fsCrtAct, "fsCrtMahAct", `min="0" max="${FS_ACT_MAX}" step="1" value="2"`, "2 — RTL 返航")}
        <p class="power-fs-note muted">低/紧急容量动作与电压动作共用飞控参数（ArduPilot）。</p>
      </div>
    </article>`;
  }

  function qField(card, field) {
    return card.querySelector(`[data-field="${field}"]`);
  }

  function setFieldValue(card, field, value) {
    const el = qField(card, field);
    if (el) el.value = String(value);
  }

  function setFieldLabel(card, field, text) {
    const el = card.querySelector(`[data-value-for="${field}"]`);
    if (el) el.textContent = text;
  }

  function bindBattConfigCard(card, slot) {
    if (card.dataset.bound === "1") return;
    card.dataset.bound = "1";
    const prefix = slot.prefix;

    const cells = qField(card, "cells");
    const lowVolt = qField(card, "lowVolt");
    const crtVolt = qField(card, "crtVolt");
    const fsLowAct = qField(card, "fsLowAct");
    const fsCrtAct = qField(card, "fsCrtAct");
    const capacity = qField(card, "capacity");
    const lowMah = qField(card, "lowMah");
    const crtMah = qField(card, "crtMah");
    const fsLowMahAct = qField(card, "fsLowMahAct");
    const fsCrtMahAct = qField(card, "fsCrtMahAct");

    function syncFsLow(v) {
      const n = String(Math.round(Number(v) || 0));
      if (fsLowAct) fsLowAct.value = n;
      if (fsLowMahAct) fsLowMahAct.value = n;
      const t = fsActLabel(n);
      setFieldLabel(card, "fsLowAct", t);
      setFieldLabel(card, "fsLowMahAct", t);
    }

    function syncFsCrt(v) {
      const n = String(Math.round(Number(v) || 0));
      if (fsCrtAct) fsCrtAct.value = n;
      if (fsCrtMahAct) fsCrtMahAct.value = n;
      const t = fsActLabel(n);
      setFieldLabel(card, "fsCrtAct", t);
      setFieldLabel(card, "fsCrtMahAct", t);
    }

    function recalcVoltageRange() {
      const s = Math.max(CELLS_S_MIN, Math.min(CELLS_S_MAX, Number(cells?.value) || 12));
      if (cells) cells.value = String(s);
      setFieldLabel(card, "cells", `${s}S`);
      const min = +(s * 3.4).toFixed(1);
      const max = +(s * 3.9).toFixed(1);
      if (lowVolt) {
        lowVolt.min = String(min);
        lowVolt.max = String(max);
        if (+lowVolt.value < min || +lowVolt.value > max) lowVolt.value = String((s * 3.7).toFixed(1));
      }
      if (crtVolt) {
        crtVolt.min = String(min);
        crtVolt.max = String(max);
        if (+crtVolt.value < min || +crtVolt.value > max) crtVolt.value = String((s * 3.5).toFixed(1));
      }
      if (lowVolt && crtVolt && +crtVolt.value > +lowVolt.value) crtVolt.value = lowVolt.value;
      setFieldLabel(card, "lowVolt", `${Number(lowVolt?.value || 0).toFixed(1)}V`);
      setFieldLabel(card, "crtVolt", `${Number(crtVolt?.value || 0).toFixed(1)}V`);
    }

    function recalcCapacityChain() {
      let cap = Math.round(Number(capacity?.value) || CAP_MAH_MIN);
      cap = Math.max(CAP_MAH_MIN, Math.min(CAP_MAH_MAX, cap));
      if (capacity) capacity.value = String(cap);
      setFieldLabel(card, "capacity", `${cap} mAh`);

      let low = Math.round(Number(lowMah?.value) || 0);
      low = Math.max(CAP_MAH_MIN, Math.min(cap, low));
      if (lowMah) {
        lowMah.max = String(cap);
        lowMah.value = String(low);
      }
      setFieldLabel(card, "lowMah", `${low} mAh`);

      let crt = Math.round(Number(crtMah?.value) || 0);
      crt = Math.max(CAP_MAH_MIN, Math.min(low, crt));
      if (crtMah) {
        crtMah.max = String(low);
        crtMah.value = String(crt);
      }
      setFieldLabel(card, "crtMah", `${crt} mAh`);
    }

    cells?.addEventListener("input", recalcVoltageRange);
    lowVolt?.addEventListener("input", () => {
      if (crtVolt && +crtVolt.value > +lowVolt.value) crtVolt.value = lowVolt.value;
      recalcVoltageRange();
    });
    crtVolt?.addEventListener("input", () => {
      if (lowVolt && +crtVolt.value > +lowVolt.value) crtVolt.value = lowVolt.value;
      recalcVoltageRange();
    });

    fsLowAct?.addEventListener("input", () => syncFsLow(fsLowAct.value));
    fsLowMahAct?.addEventListener("input", () => syncFsLow(fsLowMahAct.value));
    fsCrtAct?.addEventListener("input", () => syncFsCrt(fsCrtAct.value));
    fsCrtMahAct?.addEventListener("input", () => syncFsCrt(fsCrtMahAct.value));

    capacity?.addEventListener("input", recalcCapacityChain);
    lowMah?.addEventListener("input", recalcCapacityChain);
    crtMah?.addEventListener("input", recalcCapacityChain);

    recalcVoltageRange();
    recalcCapacityChain();
    syncFsLow(fsLowAct?.value ?? 2);
    syncFsCrt(fsCrtAct?.value ?? 2);
  }

  function hydrateBattConfigCard(card, slot) {
    const keys = battParamKeys(slot.prefix);
    const low = getParamNum(keys.lowVolt);
    const crt = getParamNum(keys.crtVolt);
    const fsL = getParamNum(keys.fsLowAct);
    const fsC = getParamNum(keys.fsCrtAct);
    const cap = getParamNum(keys.capacity);
    const lowM = getParamNum(keys.lowMah);
    const crtM = getParamNum(keys.crtMah);

    if (low != null) setFieldValue(card, "lowVolt", low);
    if (crt != null) setFieldValue(card, "crtVolt", crt);
    if (fsL != null) setFieldValue(card, "fsLowAct", Math.round(fsL));
    if (fsC != null) setFieldValue(card, "fsCrtAct", Math.round(fsC));
    if (cap != null) setFieldValue(card, "capacity", Math.round(cap));
    if (lowM != null) setFieldValue(card, "lowMah", Math.round(lowM));
    if (crtM != null) setFieldValue(card, "crtMah", Math.round(crtM));

    qField(card, "cells")?.dispatchEvent(new Event("input"));
    qField(card, "capacity")?.dispatchEvent(new Event("input"));
    qField(card, "fsLowAct")?.dispatchEvent(new Event("input"));
    qField(card, "fsCrtAct")?.dispatchEvent(new Event("input"));
  }

  function renderFailsafeSlots(slots) {
    const host = document.getElementById("power-failsafe-slots");
    if (!host) return;

    const list = slots.length ? slots : [{ slotIndex: 0, prefix: "BATT", typeShort: "BATT" }];
    const sig = list.map((s) => `${s.slotIndex}:${s.prefix}`).join("|");
    if (host.dataset.sig === sig && host.childElementCount === list.length) return;

    host.dataset.sig = sig;
    host.innerHTML = list.map((s) => buildBattConfigCardHtml(s)).join("");
    host.querySelectorAll(".power-batt-config-card").forEach((card) => {
      const slotIndex = Number(card.dataset.slotIndex);
      const slot = list.find((s) => s.slotIndex === slotIndex) || list[0];
      bindBattConfigCard(card, slot);
      hydrateBattConfigCard(card, slot);
    });
  }

  function syncSlidersFromParamsOnce() {
    if (window._powerParamsHydrated) return;
    const params = window.params;
    if (!(params instanceof Map)) return;

    const slots = typeof window.listEnabledBatterySlots === "function"
      ? window.listEnabledBatterySlots(params)
      : [{ slotIndex: 0, prefix: "BATT" }];

    let any = false;
    const host = document.getElementById("power-failsafe-slots");
    slots.forEach((slot) => {
      const card = host?.querySelector(`[data-slot-index="${slot.slotIndex}"]`);
      if (!card) return;
      const keys = battParamKeys(slot.prefix);
      if (getParamNum(keys.lowVolt) != null
        || getParamNum(keys.capacity) != null
        || getParamNum(keys.fsLowAct) != null) {
        any = true;
      }
      hydrateBattConfigCard(card, slot);
    });

    if (any) window._powerParamsHydrated = true;
  }

  function readBattConfigFromCard(card, prefix) {
    return {
      prefix,
      cells: Number(qField(card, "cells")?.value),
      lowVolt: Number(qField(card, "lowVolt")?.value),
      crtVolt: Number(qField(card, "crtVolt")?.value),
      fsLowAct: Number(qField(card, "fsLowAct")?.value),
      fsCrtAct: Number(qField(card, "fsCrtAct")?.value),
      capacity: Number(qField(card, "capacity")?.value),
      lowMah: Number(qField(card, "lowMah")?.value),
      crtMah: Number(qField(card, "crtMah")?.value),
    };
  }


  function applyBattConfigToCard(card, values) {
    BATT_CONFIG_COPY_FIELDS.forEach((field) => {
      if (values[field] == null) return;
      setFieldValue(card, field, values[field]);
    });
    qField(card, "cells")?.dispatchEvent(new Event("input"));
    qField(card, "capacity")?.dispatchEvent(new Event("input"));
    qField(card, "fsLowAct")?.dispatchEvent(new Event("input"));
    qField(card, "fsCrtAct")?.dispatchEvent(new Event("input"));
  }

  function copyBatt1ConfigToAll() {
    const statusEl = document.getElementById("power-write-status");
    const host = document.getElementById("power-failsafe-slots");
    if (!host) return;

    const cards = Array.from(host.querySelectorAll(".power-batt-config-card"));
    const source = host.querySelector('[data-slot-index="0"]')
      || host.querySelector('[data-prefix="BATT"]')
      || cards[0];

    if (!source) {
      if (statusEl) statusEl.textContent = "未找到电池 1 配置卡片。";
      return;
    }

    const srcValues = readBattConfigFromCard(source, source.dataset.prefix);
    let copied = 0;

    cards.forEach((card) => {
      if (card === source) return;
      applyBattConfigToCard(card, srcValues);
      copied += 1;
    });

    const msg = copied === 0
      ? "仅检测到 1 路电池，无需同步。"
      : `已将电池 1（${source.dataset.prefix}）参数复制到其余 ${copied} 路（未写入飞控，请点「一键写入飞控」）。`;

    if (statusEl) statusEl.textContent = msg;
    if (typeof log === "function") {
      log(copied > 0 ? `📋 ${msg}` : msg, "power-param-write");
    }
  }

  async function writePowerParamsToFc() {
    const statusEl = document.getElementById("power-write-status");

    if (typeof window.sendParamSet !== "function") {
      if (statusEl) statusEl.textContent = "写入失败：内部未注册 sendParamSet。";
      return;
    }

    const host = document.getElementById("power-failsafe-slots");
    const cards = host ? Array.from(host.querySelectorAll(".power-batt-config-card")) : [];
    if (!cards.length) {
      if (statusEl) statusEl.textContent = "无已启用的电池监测槽。";
      return;
    }

    let sent = 0;
    const lines = [];

    /* eslint-disable no-await-in-loop */
    for (const card of cards) {
      const prefix = card.dataset.prefix;
      const c = readBattConfigFromCard(card, prefix);
      const keys = battParamKeys(prefix);
      const pairs = [
        [keys.lowVolt, c.lowVolt],
        [keys.crtVolt, c.crtVolt],
        [keys.fsLowAct, Math.round(c.fsLowAct)],
        [keys.fsCrtAct, Math.round(c.fsCrtAct)],
        [keys.capacity, Math.round(c.capacity)],
        [keys.lowMah, Math.round(c.lowMah)],
        [keys.crtMah, Math.round(c.crtMah)],
      ];
      for (const [key, val] of pairs) {
        if (!Number.isFinite(val)) continue;
        if (await window.sendParamSet(key, val)) sent += 1;
        await sleep(45);
      }
      lines.push(
        `${prefix}: ${c.lowVolt}V/${c.crtVolt}V · ${Math.round(c.capacity)}mAh · FS ${Math.round(c.fsLowAct)}/${Math.round(c.fsCrtAct)}`
      );
    }
    /* eslint-enable no-await-in-loop */

    if (sent === 0) {
      if (typeof log === "function") log("❌ 电源参数写入失败：请确认串口已连接。", "power-param-write");
      if (statusEl) statusEl.textContent = "写入失败：未连接飞控或发送被拒绝。";
      return;
    }

    const msg = `电源参数写入已发送 ${sent} 条（${cards.length} 路）`;
    if (typeof log === "function") log(`🔋 ${msg} | ${lines.join(" · ")}`, "power-param-write");
    if (statusEl) statusEl.textContent = `已发送 ${sent} 条（${lines.join("；")}）。`;
  }

  function tick() {
    const slots = typeof window.listEnabledBatterySlots === "function"
      ? window.listEnabledBatterySlots(window.params)
      : [];
    renderFailsafeSlots(slots.length ? slots : [{ slotIndex: 0, prefix: "BATT", typeShort: "BATT" }]);
    syncSlidersFromParamsOnce();
    const instances = getInstances();
    renderTopology(instances);
    renderCards(instances);
  }

  function mount() {
    if (!document.getElementById("setup-panel-power")) return;

    document.getElementById("power-write-params-btn")?.addEventListener("click", () => {
      writePowerParamsToFc();
    });

    document.getElementById("power-copy-batt1-btn")?.addEventListener("click", () => {
      copyBatt1ConfigToAll();
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
