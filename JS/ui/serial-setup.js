/**
 * 初始设置 — Serial 串口配置（动态端口、汇总、卡片网格、草稿高亮 + 写入飞控）
 */
(function initSerialSetup() {
  const PROBE_DELAY_MS = 35;
  const PARAM_DB_URL = "JS/data/apm-param-db.json";
  const EPS = 1e-5;

  const FALLBACK_BAUD = [
    [9, "9600"],
    [57, "57600"],
    [115, "115200"],
    [230, "230400"],
    [460, "460800"],
    [921, "921600"],
  ];
  const FALLBACK_PROTOCOL = [
    [-1, "无"],
    [1, "MAVLink1"],
    [2, "MAVLink2"],
    [5, "GPS"],
    [22, "SLCAN"],
  ];
  const FALLBACK_OPTIONS = [
    [0, "无"],
    [1, "InvertRX"],
    [2, "InvertTX"],
    [4, "HalfDuplex"],
    [8, "SwapTXRX"],
  ];

  let paramDb = {};
  let paramDbReady = false;
  let probeGeneration = 0;
  let panelActive = false;
  let currentPorts = [];

  function el(id) {
    return document.getElementById(id);
  }

  function fcConnected() {
    return window._gcsConnState === "connected" && !!(window.writer || (typeof writer !== "undefined" && writer));
  }

  function getParamsMap() {
    return window.params instanceof Map ? window.params : null;
  }

  function getParamNum(name) {
    const pmap = getParamsMap();
    if (!pmap || !pmap.has(name)) return null;
    const v = Number(pmap.get(name));
    return Number.isFinite(v) ? v : null;
  }

  function valuesClose(a, b) {
    return Math.abs(Number(a) - Number(b)) < EPS;
  }

  function discoverSerialPorts(pmap) {
    const ports = new Set();
    if (!pmap) return [];
    for (const key of pmap.keys()) {
      const m = /^SERIAL(\d+)_(BAUD|PROTOCOL|OPTIONS)$/i.exec(String(key));
      if (m) ports.add(Number(m[1]));
    }
    return [...ports].sort((a, b) => a - b);
  }

  function paramKeysForPort(n) {
    const keys = [`SERIAL${n}_BAUD`, `SERIAL${n}_PROTOCOL`];
    if (n > 0) keys.push(`SERIAL${n}_OPTIONS`);
    return keys;
  }

  function parseEnumOptions(desc) {
    const text = String(desc || "");
    const idx = text.search(/取值\s*[:：]/);
    if (idx < 0) return [];
    const block = text.slice(idx);
    const out = [];
    const re = /^\s*(-?\d+)\s*[:：]\s*(.+)$/gm;
    let m;
    while ((m = re.exec(block)) !== null) {
      const value = Number(m[1]);
      const label = m[2].split(/\n/)[0].trim();
      if (Number.isFinite(value) && label) out.push({ value, label });
    }
    return out;
  }

  function parseBitOptions(desc) {
    const text = String(desc || "");
    const idx = text.search(/位定义\s*[:：]/);
    if (idx < 0) return [];
    const block = text.slice(idx);
    const out = [];
    const re = /bit\s*(\d+)\s*[:：]\s*([^\n]+)/gi;
    let m;
    while ((m = re.exec(block)) !== null) {
      const bit = Number(m[1]);
      const label = m[2].trim();
      if (!Number.isFinite(bit) || !label) continue;
      out.push({ value: 1 << bit, label });
    }
    return out;
  }

  function metaFor(paramKey, fallbackKey) {
    const u = String(paramKey).toUpperCase();
    const fb = String(fallbackKey || paramKey).toUpperCase();
    return paramDb[u] || paramDb[fb] || null;
  }

  function enumOptionsFor(paramKey, fallbackKey, fallbackList) {
    const meta = metaFor(paramKey, fallbackKey);
    const parsed = meta && meta.d ? parseEnumOptions(meta.d) : [];
    if (parsed.length) return parsed;
    return fallbackList.map(([value, label]) => ({ value, label }));
  }

  function bitOptionsFor(paramKey) {
    const meta = metaFor(paramKey, "SERIAL1_OPTIONS");
    const parsed = meta && meta.d ? parseBitOptions(meta.d) : [];
    const base = [{ value: 0, label: "无 (0)" }];
    const bits = parsed.length
      ? parsed.map((o) => ({ value: o.value, label: o.label }))
      : FALLBACK_OPTIONS.slice(1).map(([value, label]) => ({ value, label }));
    return base.concat(bits);
  }

  function labelForValue(options, value) {
    const v = Number(value);
    const hit = options.find((o) => o.value === v);
    if (hit) return hit.label;
    return String(v);
  }

  function ensureCustomOption(select, value) {
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    const exists = Array.from(select.options).some((o) => Number(o.value) === v);
    if (exists) return;
    const opt = document.createElement("option");
    opt.value = String(v);
    opt.textContent = `当前值 (${v})`;
    select.appendChild(opt);
  }

  function fillSelect(select, options, currentValue) {
    select.innerHTML = "";
    options.forEach((o) => {
      const opt = document.createElement("option");
      opt.value = String(o.value);
      opt.textContent = o.label;
      select.appendChild(opt);
    });
    if (currentValue != null && Number.isFinite(Number(currentValue))) {
      ensureCustomOption(select, currentValue);
      select.value = String(currentValue);
    }
  }

  function selectDraftValue(select) {
    const v = Number(select.value);
    return Number.isFinite(v) ? v : null;
  }

  function isSelectDirty(select) {
    const key = select.dataset.paramKey;
    if (!key) return false;
    const draft = selectDraftValue(select);
    if (draft == null) return false;
    const fc = getParamNum(key);
    if (fc == null) return false;
    return !valuesClose(draft, fc);
  }

  function updateSelectDirtyStyle(select) {
    select.classList.toggle("serial-select-dirty", isSelectDirty(select));
  }

  function allParamSelects() {
    const grid = el("serial-port-grid");
    if (!grid) return [];
    return Array.from(grid.querySelectorAll("select[data-param-key]"));
  }

  function listDirtyWrites() {
    return allParamSelects()
      .filter((s) => isSelectDirty(s))
      .map((s) => ({
        key: s.dataset.paramKey,
        value: selectDraftValue(s),
        select: s,
      }));
  }

  function updateWriteUi() {
    const btn = el("serial-write-params-btn");
    const dirty = listDirtyWrites();
    if (btn) {
      btn.disabled = !fcConnected() || dirty.length === 0;
    }
    const statusEl = el("serial-write-status");
    if (statusEl && dirty.length > 0 && !statusEl.dataset.writing) {
      statusEl.textContent = `有 ${dirty.length} 项未写入，修改后请点击「写入飞控」`;
      statusEl.className = "serial-write-status warn";
    } else if (statusEl && dirty.length === 0 && !statusEl.dataset.writing) {
      statusEl.textContent = "";
      statusEl.className = "muted serial-write-status";
    }
    return dirty.length;
  }

  function updateAllDirtyStyles() {
    allParamSelects().forEach(updateSelectDirtyStyle);
    return updateWriteUi();
  }

  function portSubtitle(n) {
    const meta = metaFor(`SERIAL${n}_PROTOCOL`, n === 0 ? "SERIAL0_PROTOCOL" : "SERIAL1_PROTOCOL");
    if (meta && meta.n) return meta.n;
    if (n === 0) return "USB / 控制台";
    return `UART ${n}`;
  }

  function baudLabel(n, baudVal) {
    const opts = enumOptionsFor(`SERIAL${n}_BAUD`, "SERIAL1_BAUD", FALLBACK_BAUD);
    return labelForValue(opts, baudVal);
  }

  function protocolLabel(n, protoVal) {
    const opts = enumOptionsFor(`SERIAL${n}_PROTOCOL`, "SERIAL1_PROTOCOL", FALLBACK_PROTOCOL);
    return labelForValue(opts, protoVal);
  }

  function chipText(n) {
    const baud = getParamNum(`SERIAL${n}_BAUD`);
    const proto = getParamNum(`SERIAL${n}_PROTOCOL`);
    const baudStr = baud != null ? baudLabel(n, baud) : "—";
    const protoStr = proto != null ? protocolLabel(n, proto) : "—";
    return `S${n} · ${protoStr} · ${baudStr}`;
  }

  function renderSummary(ports) {
    const host = el("serial-summary-content");
    if (!host) return;

    const connected = fcConnected();
    let statusCls = "warn";
    let statusText = "未连接飞控";
    if (connected) {
      statusCls = "ok";
      statusText = "已连接飞控";
    }

    let countText = "未识别串口";
    if (connected && ports.length) {
      countText = `已识别 ${ports.length} 路串口`;
    } else if (connected && !ports.length) {
      countText = "正在同步串口参数…";
    }

    const dirtyCount = allParamSelects().length ? listDirtyWrites().length : 0;
    const dirtyLine = dirtyCount > 0
      ? `<span class="serial-summary-meta warn">未写入 ${dirtyCount} 项</span>`
      : `<span class="serial-summary-meta ok">无未写入修改</span>`;

    const chips = ports.map((n) => {
      const t = chipText(n);
      return `<span class="serial-chip">${escapeHtml(t)}</span>`;
    }).join("");

    host.innerHTML = `
      <div class="serial-summary-head">
        <h3 class="serial-summary-title">串口配置</h3>
        <span class="serial-summary-meta ${statusCls}">${escapeHtml(statusText)}</span>
        <span class="serial-summary-meta">${escapeHtml(countText)}</span>
        ${dirtyLine}
      </div>
      ${chips ? `<div class="serial-summary-chips">${chips}</div>` : ""}
    `;

    updateWriteUi();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function createField(labelText, selectId, disabled) {
    const wrap = document.createElement("div");
    wrap.className = "serial-field";
    const label = document.createElement("label");
    label.textContent = labelText;
    label.setAttribute("for", selectId);
    const select = document.createElement("select");
    select.id = selectId;
    select.disabled = disabled;
    wrap.appendChild(label);
    wrap.appendChild(select);
    return { wrap, select };
  }

  function createMutedField(labelText) {
    const wrap = document.createElement("div");
    wrap.className = "serial-field serial-field--muted";
    const label = document.createElement("label");
    label.textContent = labelText;
    const staticEl = document.createElement("div");
    staticEl.className = "serial-field-static";
    staticEl.textContent = "—";
    wrap.appendChild(label);
    wrap.appendChild(staticEl);
    return wrap;
  }

  function buildPortCard(n) {
    const disabled = !fcConnected();
    const card = document.createElement("article");
    card.className = `serial-port-card card-dark serial-port-card--n${n % 8}`;
    card.dataset.serialPort = String(n);
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-pressed", "false");
    card.setAttribute("aria-label", `Serial ${n}`);

    const head = document.createElement("div");
    head.className = "serial-port-card-head";
    head.innerHTML = `<strong>Serial ${n}</strong><span class="serial-port-card-sub">${escapeHtml(portSubtitle(n))}</span>`;
    card.appendChild(head);

    const baudField = createField("串口波特率", `serial-${n}-baud`, disabled);
    const protoField = createField("串口协议", `serial-${n}-protocol`, disabled);
    let optField = null;

    card.appendChild(baudField.wrap);
    if (n > 0) {
      optField = createField("串口选项", `serial-${n}-options`, disabled);
      card.appendChild(optField.wrap);
      optField.select.dataset.paramKey = `SERIAL${n}_OPTIONS`;
      optField.select.addEventListener("change", onSelectDraft);
    } else {
      card.appendChild(createMutedField("串口选项"));
    }
    card.appendChild(protoField.wrap);

    baudField.select.dataset.paramKey = `SERIAL${n}_BAUD`;
    protoField.select.dataset.paramKey = `SERIAL${n}_PROTOCOL`;
    baudField.select.addEventListener("change", onSelectDraft);
    protoField.select.addEventListener("change", onSelectDraft);

    card._baudSelect = baudField.select;
    card._protoSelect = protoField.select;
    card._optSelect = optField ? optField.select : null;

    card.addEventListener("click", onPortCardActivate);
    card.addEventListener("keydown", onPortCardKeydown);

    return card;
  }

  let selectedSerialPort = null;

  function setSelectedSerialPort(card) {
    const grid = el("serial-port-grid");
    grid?.querySelectorAll(".serial-port-card--selected").forEach((node) => {
      node.classList.remove("serial-port-card--selected");
      node.setAttribute("aria-pressed", "false");
    });
    if (card) {
      card.classList.add("serial-port-card--selected");
      card.setAttribute("aria-pressed", "true");
      selectedSerialPort = Number(card.dataset.serialPort);
    } else {
      selectedSerialPort = null;
    }
  }

  function onPortCardActivate(ev) {
    if (ev.target.closest("select, button, input, label, option")) return;
    const card = ev.currentTarget;
    if (card.classList.contains("serial-port-card--selected")) {
      setSelectedSerialPort(null);
      return;
    }
    setSelectedSerialPort(card);
  }

  function onPortCardKeydown(ev) {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    if (ev.target.closest("select")) return;
    ev.preventDefault();
    onPortCardActivate(ev);
  }

  function hydrateCard(card, n) {
    const baudVal = getParamNum(`SERIAL${n}_BAUD`);
    const protoVal = getParamNum(`SERIAL${n}_PROTOCOL`);
    const optVal = n > 0 ? getParamNum(`SERIAL${n}_OPTIONS`) : null;

    fillSelect(
      card._baudSelect,
      enumOptionsFor(`SERIAL${n}_BAUD`, "SERIAL1_BAUD", FALLBACK_BAUD),
      baudVal
    );
    fillSelect(
      card._protoSelect,
      enumOptionsFor(`SERIAL${n}_PROTOCOL`, "SERIAL1_PROTOCOL", FALLBACK_PROTOCOL),
      protoVal
    );
    if (card._optSelect) {
      fillSelect(card._optSelect, bitOptionsFor(`SERIAL${n}_OPTIONS`), optVal ?? 0);
    }

    updateSelectDirtyStyle(card._baudSelect);
    updateSelectDirtyStyle(card._protoSelect);
    if (card._optSelect) updateSelectDirtyStyle(card._optSelect);
  }

  function onSelectDraft() {
    updateAllDirtyStyles();
    renderSummary(currentPorts);
  }

  async function writeSerialParamsToFc() {
    const statusEl = el("serial-write-status");
    const btn = el("serial-write-params-btn");

    if (!fcConnected()) {
      if (statusEl) statusEl.textContent = "未连接飞控，无法写入。";
      return;
    }
    if (typeof window.sendParamSet !== "function") {
      if (statusEl) statusEl.textContent = "写入失败：sendParamSet 不可用。";
      return;
    }

    const pending = listDirtyWrites();
    if (!pending.length) {
      if (statusEl) statusEl.textContent = "没有需要写入的修改。";
      return;
    }

    if (btn) btn.disabled = true;
    if (statusEl) {
      statusEl.dataset.writing = "1";
      statusEl.textContent = `正在写入 ${pending.length} 项…`;
      statusEl.className = "serial-write-status";
    }

    let ok = 0;
    let fail = 0;
    for (const item of pending) {
      try {
        const sent = await window.sendParamSet(item.key, item.value);
        if (sent) {
          ok += 1;
          const pmap = getParamsMap();
          if (pmap) pmap.set(item.key, item.value);
          updateSelectDirtyStyle(item.select);
        } else {
          fail += 1;
        }
      } catch (_) {
        fail += 1;
      }
    }

    if (statusEl) {
      delete statusEl.dataset.writing;
      if (fail === 0) {
        statusEl.textContent = `已成功写入 ${ok} 项`;
        statusEl.className = "serial-write-status ok";
        if (typeof log === "function") log(`✅ 串口参数已写入 ${ok} 项`, "serial-setup");
      } else {
        statusEl.textContent = `写入完成：成功 ${ok} 项，失败 ${fail} 项`;
        statusEl.className = "serial-write-status danger";
        if (typeof log === "function") log(`⚠️ 串口参数写入：成功 ${ok}，失败 ${fail}`, "serial-setup");
      }
    }

    updateAllDirtyStyles();
    renderSummary(currentPorts);
    if (btn) btn.disabled = listDirtyWrites().length === 0 || !fcConnected();
  }

  function renderGrid(ports) {
    const grid = el("serial-port-grid");
    if (!grid) return;

    grid.innerHTML = "";

    if (!fcConnected()) {
      grid.innerHTML = `
        <div class="serial-grid-empty">
          <p>未连接飞控</p>
          <p class="muted">连接并加载参数后，将显示本飞控实际拥有的串口</p>
        </div>`;
      return;
    }

    if (!ports.length) {
      grid.innerHTML = `
        <div class="serial-grid-empty">
          <p>未发现 SERIAL 串口参数</p>
          <p class="muted">请确认已加载参数表；部分飞控固件可能使用不同参数名</p>
        </div>`;
      return;
    }

    ports.forEach((n) => {
      const card = buildPortCard(n);
      hydrateCard(card, n);
      grid.appendChild(card);
      if (selectedSerialPort === n) setSelectedSerialPort(card);
    });

    updateWriteUi();
  }

  async function probeSerialParams(ports) {
    if (!fcConnected() || !ports.length) return;
    if (typeof window.requestParamByName !== "function") return;

    const gen = ++probeGeneration;
    const keys = [];
    ports.forEach((n) => {
      paramKeysForPort(n).forEach((k) => keys.push(k));
    });

    try {
      for (const name of keys) {
        if (gen !== probeGeneration) return;
        await window.requestParamByName(name);
        await new Promise((r) => setTimeout(r, PROBE_DELAY_MS));
      }
    } catch (_) { /* ignore */ }
  }

  async function refresh() {
    const pmap = getParamsMap();
    let ports = discoverSerialPorts(pmap);

    if (fcConnected() && panelActive) {
      const probePorts = ports.length
        ? ports
        : [0, 1, 2, 3, 4, 5, 6, 7, 8];
      await probeSerialParams(probePorts);
      ports = discoverSerialPorts(getParamsMap());
    }

    currentPorts = ports;
    renderGrid(ports);
    renderSummary(ports);
  }

  async function loadParamDb() {
    if (paramDbReady) return;
    try {
      const r = await fetch(PARAM_DB_URL, { cache: "force-cache" });
      if (r.ok) {
        const j = await r.json();
        if (j && typeof j === "object") paramDb = j;
      }
    } catch (_) { /* offline */ }
    paramDbReady = true;
  }

  function onPanelChanged(ev) {
    const panel = ev.detail && ev.detail.panel;
    panelActive = panel === "serial";
    if (!panelActive) return;
    refresh().catch(() => {});
  }

  function onConnection() {
    if (!panelActive) {
      currentPorts = [];
      renderSummary([]);
      return;
    }
    refresh().catch(() => {});
  }

  function mount() {
    if (!el("setup-panel-serial")) return;

    el("serial-write-params-btn")?.addEventListener("click", () => {
      writeSerialParamsToFc().catch(() => {});
    });

    loadParamDb().then(() => {
      if (panelActive) refresh().catch(() => {});
    });

    window.addEventListener("gcs:setup-panel-changed", onPanelChanged);
    document.addEventListener("gcs-connection", onConnection);
    document.addEventListener("gcs-airframe-params-changed", (ev) => {
      if (!panelActive) return;
      if (ev.detail && ev.detail.bulk) refresh().catch(() => {});
    });

    const activeBtn = document.querySelector('.ov-nav-item.active[data-setup-panel="serial"]');
    const panelEl = el("setup-panel-serial");
    if (activeBtn && panelEl && panelEl.classList.contains("active")) {
      panelActive = true;
      refresh().catch(() => {});
    } else {
      currentPorts = [];
      renderSummary([]);
      renderGrid([]);
    }
  }

  window.addEventListener("DOMContentLoaded", mount);
})();
