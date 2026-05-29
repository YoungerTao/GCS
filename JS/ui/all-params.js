/**
 * 配置调试 — 全部参数表。
 * 与 window.params 同步，支持刷新、比对文件、写入飞控。
 * 说明列：优先 param-hints.json 中文短注；其余来自 apm-param-db.json（可由项目根目录 `python translate_params.py` 机翻为中文；无法访问 Google 时用 `python translate_params.py --mymemory-only`）。
 */
(function () {
  /** 浮点比较容差，避免 PARAM_VALUE 与界面字符串互转产生伪差异 */
  const EPS = 1e-5;
  /** 本地中文短注：键为大写参数名，值为说明字符串 */
  let paramHints = {};
  /**
   * 官方参数元数据缓存。
   * 键：大写参数名。值：n=显示名，d=说明（可含范围/取值/位定义），u=单位，rb=需重启，src=来源机型。
   */
  let paramDb = {};
  /** paramDb 条目数量，用于状态栏 */
  let paramDbCount = 0;
  /** 比对文件解析结果：大写参数名 → 数值 */
  let compareMap = null;
  /** 用户已改但未写入飞控的草稿：参数名（与 Map 键一致）→ 数值 */
  const drafts = new Map();
  /** 筛选输入防抖定时器 */
  let filterDebounce = null;
  /** 当前展开说明的参数名（一次仅展开一行） */
  let expandedParamKey = null;
  /** 参数树：选中分组 id（__ALL__ = 全部） */
  const TREE_ALL = "__ALL__";
  let selectedGroupId = TREE_ALL;
  /** 上次建树使用的机型源（Copter/Plane），用于 heartbeat 切换 */
  let lastTreeVehicleSrc = "";

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function vehicleSrcForTree() {
    if (typeof window.gcsDetectFirmwareProfile === "function") {
      const kind = window.gcsDetectFirmwareProfile().kind || "unknown";
      if (kind === "plane" || kind === "vtol") return "Plane";
      if (kind === "copter") return "Copter";
    }
    return "Copter";
  }

  function prefixGroup(name) {
    const u = String(name).toUpperCase();
    const m = u.match(/^([A-Z]+)(\d*)/);
    if (!m || !m[1]) return "OTHER";
    return m[1] + (m[2] || "");
  }

  function resolveOfficialGrp(paramName) {
    const u = String(paramName).toUpperCase();
    const e = paramDb[u];
    if (!e) return "";
    const src = vehicleSrcForTree();
    if (e.grpBySrc && typeof e.grpBySrc[src] === "string") return e.grpBySrc[src];
    if (typeof e.grp === "string") return e.grp;
    return "";
  }

  function normalizeGroupId(grp) {
    if (!grp) return "";
    return String(grp).replace(/_+$/, "");
  }

  function effectiveGroupId(paramName) {
    const official = resolveOfficialGrp(paramName);
    if (official) {
      const norm = normalizeGroupId(official);
      return norm || prefixGroup(paramName);
    }
    return prefixGroup(paramName);
  }

  function groupDisplayLabel(groupId) {
    if (groupId === TREE_ALL) return "全部参数";
    if (groupId === "OTHER") return "未分类";
    return groupId;
  }

  function buildParamTree(keys) {
    const counts = new Map();
    for (const k of keys) {
      const gid = effectiveGroupId(k);
      counts.set(gid, (counts.get(gid) || 0) + 1);
    }
    const groups = Array.from(counts.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], "en", { sensitivity: "base" })
    );
    return { total: keys.length, groups };
  }

  function ensureSelectedGroupValid(keys) {
    if (selectedGroupId === TREE_ALL) return;
    const { groups } = buildParamTree(keys);
    if (!groups.some(([g]) => g === selectedGroupId)) selectedGroupId = TREE_ALL;
  }

  function renderParamTree() {
    const root = el("cfg-ap-tree");
    if (!root) return;
    const pmap = window.params;
    if (!(pmap instanceof Map) || pmap.size === 0) {
      root.innerHTML = '<div class="cfg-ap-tree-empty muted">暂无参数</div>';
      return;
    }
    const keys = Array.from(pmap.keys());
    ensureSelectedGroupValid(keys);
    const { total, groups } = buildParamTree(keys);
    const parts = [
      `<button type="button" class="cfg-ap-tree-node${selectedGroupId === TREE_ALL ? " is-active" : ""}" data-grp="${TREE_ALL}">`,
      `<span>${escapeHtml(groupDisplayLabel(TREE_ALL))}</span>`,
      `<span class="cfg-ap-tree-count">${total}</span>`,
      "</button>",
    ];
    for (const [gid, count] of groups) {
      const active = selectedGroupId === gid ? " is-active" : "";
      parts.push(
        `<button type="button" class="cfg-ap-tree-node${active}" data-grp="${escapeHtml(gid)}">`,
        `<span>${escapeHtml(groupDisplayLabel(gid))}</span>`,
        `<span class="cfg-ap-tree-count">${count}</span>`,
        "</button>"
      );
    }
    root.innerHTML = parts.join("");
    root.querySelectorAll(".cfg-ap-tree-node").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedGroupId = btn.dataset.grp || TREE_ALL;
        renderParamTree();
        applyRowFilter();
      });
    });
  }

  function onTreeContextMaybeChanged() {
    const src = vehicleSrcForTree();
    if (src === lastTreeVehicleSrc) return;
    lastTreeVehicleSrc = src;
    renderParamTree();
    applyRowFilter();
  }

  /** 串口已连接且可写 */
  function fcConnected() {
    return window._gcsConnState === "connected" && !!(window.writer || (typeof writer !== "undefined" && writer));
  }

  /** 将飞控浮点格式化为短字符串，便于表格显示与编辑 */
  function formatParamNum(n) {
    if (!Number.isFinite(Number(n))) return String(n);
    const x = Number(n);
    const r = Math.round(x);
    if (Math.abs(x - r) < 1e-9) return String(r);
    let s = x.toFixed(6);
    s = s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
    return s;
  }

  /** 解析用户输入的数值（去首尾空白） */
  function parseNumLoose(s) {
    const t = String(s).trim();
    if (!t.length) return NaN;
    return Number(t);
  }

  /** 两数在 EPS 内视为相等 */
  function valuesClose(a, b) {
    return Math.abs(Number(a) - Number(b)) < EPS;
  }

  /** 组装说明列全文（可含换行），供表格与 data-desc 筛选 */
  function paramDescFor(mapKey) {
    const u = String(mapKey).toUpperCase();
    const hint = paramHints[u] || paramHints[mapKey];
    const e = paramDb[u];
    if (hint) {
      if (e && e.d) return `${hint}\n\n──\n${e.d}`;
      return hint;
    }
    if (!e) return "";
    const lines = [];
    if (e.n && e.n !== u) lines.push(e.n);
    if (e.d) lines.push(e.d);
    if (e.u) lines.push(`单位: ${e.u}`);
    if (e.rb) lines.push("修改后需重启飞控生效。");
    return lines.join("\n\n");
  }

  /** 加载中文短注覆盖表 */
  async function loadHints() {
    try {
      const r = await fetch("JS/data/param-hints.json", { cache: "force-cache" });
      if (r.ok) {
        const j = await r.json();
        if (j && typeof j === "object") {
          paramHints = j;
        }
      }
    } catch (_) {
      /* 离线或 file 协议打开页面时忽略 */
    }
  }

  /** 加载官方合并参数说明库（体积较大，仅请求一次） */
  async function loadParamDb() {
    try {
      const r = await fetch("JS/data/apm-param-db.json", { cache: "force-cache" });
      if (!r.ok) return;
      const j = await r.json();
      if (j && typeof j === "object") {
        paramDb = j;
        paramDbCount = Object.keys(j).length;
      }
    } catch (_) {
      /* 文件缺失、跨域或 file 协议导致 fetch 失败时静默为空库 */
      paramDb = {};
    }
  }

  /** 解析 Mission Planner 风格 .param（逗号或空白分隔） */
  function parseParamFile(text) {
    const m = new Map();
    const lines = String(text).split(/\r?\n/);
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      let name;
      let valStr;
      if (t.includes(",")) {
        const parts = t.split(",");
        name = parts[0].trim();
        valStr = parts.slice(1).join(",").trim();
      } else if (/\s/.test(t)) {
        const sp = t.split(/\s+/);
        name = sp[0].trim();
        valStr = sp.slice(1).join(" ").trim();
      } else continue;
      if (!name) continue;
      const v = parseNumLoose(valStr);
      if (!Number.isFinite(v)) continue;
      m.set(name.toUpperCase(), v);
    }
    return m;
  }

  /** document.getElementById 简写 */
  function el(id) {
    return document.getElementById(id);
  }

  function toggleRowExpanded(mapKey) {
    expandedParamKey = expandedParamKey === mapKey ? null : mapKey;
    applyExpandedState();
  }

  function applyExpandedState() {
    const tbody = el("cfg-ap-tbody");
    if (!tbody) return;
    const rows = tbody.querySelectorAll("tr[data-p]");
    rows.forEach((tr) => {
      const active = !!expandedParamKey && tr.dataset.p === expandedParamKey;
      tr.classList.toggle("cfg-ap-row-expanded", active);
      const desc = tr.querySelector(".cfg-ap-desc-text");
      if (desc && !desc.classList.contains("cfg-ap-desc-empty")) {
        desc.setAttribute("aria-expanded", active ? "true" : "false");
        desc.title = active ? "" : "点击展开说明";
      }
    });
  }

  /** 更新状态栏 HTML 与写入按钮禁用态 */
  function updateStatus() {
    const st = el("cfg-ap-status");
    if (!st) return;
    const pmap = window.params;
    const n = pmap instanceof Map ? pmap.size : 0;
    let dirty = 0;
    if (pmap instanceof Map) {
      for (const [k, fc] of pmap) {
        const d = drafts.has(k) ? drafts.get(k) : fc;
        if (!valuesClose(d, fc)) dirty += 1;
      }
    }
    const cmp = compareMap && compareMap.size > 0;
    let diff = 0;
    if (cmp && pmap instanceof Map) {
      for (const [k, fc] of pmap) {
        const keyU = k.toUpperCase();
        if (!compareMap.has(keyU)) continue;
        if (!valuesClose(compareMap.get(keyU), fc)) diff += 1;
      }
    }
    let html = `共 <strong>${n}</strong> 项`;
    if (dirty) html += ` · <span class="cfg-ap-st-warn">未写入修改 ${dirty} 项</span>`;
    else html += ` · <span class="cfg-ap-st-ok">无未写入修改</span>`;
    if (cmp) {
      html += ` · 已加载比对文件（${compareMap.size} 键）`;
      if (diff) html += ` · <span class="cfg-ap-st-warn">与飞控不同 ${diff} 项</span>`;
    }
    if (!fcConnected()) html += ` · <span class="cfg-ap-st-warn">未连接</span>`;
    if (paramDbCount > 0) {
      html += ` · 说明库 <span class="cfg-ap-st-ok">${paramDbCount}</span> 条（官方元数据）`;
    } else {
      html += ` · <span class="cfg-ap-st-warn">未加载 apm-param-db.json</span>`;
    }
    st.innerHTML = html;
    const wr = el("cfg-ap-write");
    if (wr) wr.disabled = !fcConnected();
  }

  /** 用户正在编辑时推迟的表格重建 */
  let pendingRebuildAfterEdit = false;

  function isParamInputFocused() {
    const ae = document.activeElement;
    return !!(ae && ae.classList && ae.classList.contains("cfg-ap-val-input"));
  }

  /** 重建前把输入框里未提交的数值写入 drafts，避免被刷掉 */
  function captureInputDraftsFromDom() {
    const tbody = el("cfg-ap-tbody");
    if (!tbody) return;
    const pmap = window.params;
    if (!(pmap instanceof Map)) return;
    tbody.querySelectorAll(".cfg-ap-val-input").forEach(function (inp) {
      const k = inp.dataset.param;
      if (!k) return;
      const v = parseNumLoose(inp.value);
      if (!Number.isFinite(v)) return;
      const fc = pmap.get(k);
      if (valuesClose(v, fc)) drafts.delete(k);
      else drafts.set(k, v);
    });
  }

  function flushPendingRebuildIfNeeded() {
    if (!pendingRebuildAfterEdit || isParamInputFocused()) return;
    pendingRebuildAfterEdit = false;
    rebuildTable();
  }

  /** 输入过程中即写入草稿，不必等 change/blur */
  function onInputLive(mapKey, inp) {
    const pmap = window.params;
    if (!(pmap instanceof Map)) return;
    const v = parseNumLoose(inp.value);
    if (!Number.isFinite(v)) return;
    const fc = pmap.get(mapKey);
    if (valuesClose(v, fc)) drafts.delete(mapKey);
    else drafts.set(mapKey, v);
    syncRowClasses(mapKey);
    updateStatus();
  }

  /** 按名称与说明全文筛选表格行 */
  function applyRowFilter() {
    const q = (el("cfg-ap-filter")?.value || "").trim().toLowerCase();
    const tbody = el("cfg-ap-tbody");
    if (!tbody) return;
    const rows = tbody.querySelectorAll("tr[data-p]");
    rows.forEach((tr) => {
      const name = (tr.dataset.p || "").toLowerCase();
      const desc = (tr.dataset.desc || "").toLowerCase();
      const rowGrp = tr.dataset.grp || "";
      const grpHit = selectedGroupId === TREE_ALL || rowGrp === selectedGroupId;
      const textHit = !q || name.includes(q) || desc.includes(q);
      tr.style.display = grpHit && textHit ? "" : "none";
    });
    applyExpandedState();
  }

  /** 根据 window.params 重建表格（取消未决的节流重建） */
  function rebuildTable() {
    clearTimeout(debounceRebuildTimer);
    debounceRebuildTimer = null;
    captureInputDraftsFromDom();
    if (isParamInputFocused()) {
      pendingRebuildAfterEdit = true;
      updateStatus();
      return;
    }
    pendingRebuildAfterEdit = false;
    const scroll = document.querySelector(".cfg-ap-table-scroll");
    const tbody = el("cfg-ap-tbody");
    if (!scroll || !tbody) return;

    const pmap = window.params;
    if (!(pmap instanceof Map) || pmap.size === 0) {
      tbody.innerHTML = "";
      let empty = scroll.querySelector(".cfg-ap-empty");
      if (!empty) {
        empty = document.createElement("div");
        empty.className = "cfg-ap-empty";
        scroll.appendChild(empty);
      }
      empty.textContent = "暂无参数。请连接飞控后等待自动加载，或点击「刷新参数」。";
      const tbl = scroll.querySelector("table.cfg-ap-table");
      if (tbl) tbl.style.display = "none";
      renderParamTree();
      updateStatus();
      return;
    }

    const prevEmpty = scroll.querySelector(".cfg-ap-empty");
    if (prevEmpty) prevEmpty.remove();
    const tbl = scroll.querySelector("table.cfg-ap-table");
    if (tbl) tbl.style.display = "";

    const keys = Array.from(pmap.keys()).sort((a, b) =>
      a.localeCompare(b, "en", { sensitivity: "base" })
    );

    const frag = document.createDocumentFragment();
    for (const k of keys) {
      const keyU = k.toUpperCase();
      const fc = pmap.get(k);
      const draft = drafts.has(k) ? drafts.get(k) : fc;
      const tr = document.createElement("tr");
      tr.dataset.p = k;
      tr.dataset.grp = effectiveGroupId(k);
      const descText = paramDescFor(k);
      tr.dataset.desc = descText;

      const tdName = document.createElement("td");
      tdName.className = "cfg-ap-name";
      tdName.textContent = keyU;

      const tdVal = document.createElement("td");
      const inp = document.createElement("input");
      inp.type = "text";
      inp.className = "cfg-ap-val-input";
      inp.value = formatParamNum(draft);
      inp.autocomplete = "off";
      inp.dataset.param = k;
      inp.addEventListener("input", function () {
        onInputLive(k, inp);
      });
      inp.addEventListener("change", function () {
        onInputCommit(k, inp);
      });
      inp.addEventListener("blur", function () {
        onInputCommit(k, inp);
        flushPendingRebuildIfNeeded();
      });
      inp.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          inp.blur();
        }
      });
      tdVal.appendChild(inp);

      const tdCmp = document.createElement("td");
      tdCmp.className = "cfg-ap-compare";
      if (compareMap && compareMap.has(keyU)) {
        const cv = compareMap.get(keyU);
        tdCmp.textContent = formatParamNum(cv);
        if (!valuesClose(cv, fc)) tdCmp.classList.add("cfg-ap-compare-mismatch");
      } else {
        tdCmp.textContent = "—";
      }

      const tdDesc = document.createElement("td");
      tdDesc.className = "cfg-ap-desc";
      const descBody = document.createElement("div");
      descBody.className = "cfg-ap-desc-text";
      const descPlain = descText.trim();
      descBody.textContent = descPlain || "—";
      if (descPlain) {
        descBody.tabIndex = 0;
        descBody.setAttribute("role", "button");
        descBody.setAttribute("aria-expanded", "false");
        descBody.addEventListener("click", () => toggleRowExpanded(k));
        descBody.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            toggleRowExpanded(k);
          }
        });
      } else {
        descBody.classList.add("cfg-ap-desc-empty");
      }
      tdDesc.appendChild(descBody);

      tr.appendChild(tdName);
      tr.appendChild(tdVal);
      tr.appendChild(tdCmp);
      tr.appendChild(tdDesc);

      const dirty = !valuesClose(draft, fc);
      const cmpDiff = compareMap && compareMap.has(keyU) && !valuesClose(compareMap.get(keyU), fc);
      if (dirty) tr.classList.add("cfg-ap-row-dirty");
      if (cmpDiff) tr.classList.add("cfg-ap-row-diff");
      if (expandedParamKey === k) tr.classList.add("cfg-ap-row-expanded");

      frag.appendChild(tr);
    }

    tbody.innerHTML = "";
    tbody.appendChild(frag);
    lastTreeVehicleSrc = vehicleSrcForTree();
    renderParamTree();
    applyRowFilter();
    applyExpandedState();
    updateStatus();
  }

  /** 用户编辑完成：校验、更新草稿集并刷新行样式 */
  function onInputCommit(mapKey, inp) {
    const pmap = window.params;
    if (!(pmap instanceof Map)) return;
    const fc = pmap.get(mapKey);
    const v = parseNumLoose(inp.value);
    if (!Number.isFinite(v)) {
      if (typeof log === "function") log(`⚠️ 参数 ${mapKey} 数值无效，已恢复飞控值`, "all-params");
      inp.value = formatParamNum(fc);
      drafts.delete(mapKey);
      syncRowClasses(mapKey);
      updateStatus();
      return;
    }
    if (valuesClose(v, fc)) drafts.delete(mapKey);
    else drafts.set(mapKey, v);
    inp.value = formatParamNum(v);
    syncRowClasses(mapKey);
    updateStatus();
  }

  /** 单行：未写入高亮、与比对文件差异高亮 */
  function syncRowClasses(mapKey) {
    const tbody = el("cfg-ap-tbody");
    if (!tbody) return;
    const tr = tbody.querySelector(`tr[data-p="${CSS.escape(mapKey)}"]`);
    if (!tr) return;
    const pmap = window.params;
    const fc = pmap instanceof Map ? pmap.get(mapKey) : NaN;
    const draft = drafts.has(mapKey) ? drafts.get(mapKey) : fc;
    tr.classList.toggle("cfg-ap-row-dirty", !valuesClose(draft, fc));

    const keyU = String(mapKey).toUpperCase();
    const tdCmp = tr.querySelector(".cfg-ap-compare");
    if (tdCmp && compareMap && compareMap.has(keyU)) {
      const cv = compareMap.get(keyU);
      tdCmp.textContent = formatParamNum(cv);
      tdCmp.classList.toggle("cfg-ap-compare-mismatch", !valuesClose(cv, fc));
      tr.classList.toggle("cfg-ap-row-diff", !valuesClose(cv, fc));
    }
  }

  /** 单行同步飞控值（有草稿或正在编辑时跳过） */
  function syncSingleParamRow(mapKey) {
    const tbody = el("cfg-ap-tbody");
    const pmap = window.params;
    if (!tbody || !(pmap instanceof Map) || !pmap.has(mapKey)) return false;
    if (drafts.has(mapKey)) return false;
    const tr = tbody.querySelector(`tr[data-p="${CSS.escape(mapKey)}"]`);
    if (!tr) return false;
    const inp = tr.querySelector(".cfg-ap-val-input");
    if (!inp || inp === document.activeElement) return false;
    const fc = pmap.get(mapKey);
    const shown = parseNumLoose(inp.value);
    if (Number.isFinite(shown) && valuesClose(shown, fc)) return true;
    inp.value = formatParamNum(fc);
    syncRowClasses(mapKey);
    updateStatus();
    return true;
  }

  /** 节流：连续 PARAM_VALUE 时合并为一次重建 */
  let debounceRebuildTimer = null;

  function scheduleDebouncedRebuild() {
    if (isParamInputFocused()) {
      pendingRebuildAfterEdit = true;
      return;
    }
    clearTimeout(debounceRebuildTimer);
    debounceRebuildTimer = setTimeout(() => {
      debounceRebuildTimer = null;
      rebuildTable();
    }, 320);
  }

  /**
   * 供 mavlink 在收到 PARAM_VALUE 后调用：节流整表重建，减轻主线程压力。
   * 在 window 上暴露，供 JS/core/mavlink.js 调度。
   */
  window.refreshAllParamsTable = function refreshAllParamsTable() {
    const tbody = el("cfg-ap-tbody");
    if (!tbody) return;
    if (!tbody.children.length || !(window.params instanceof Map)) {
      rebuildTable();
      return;
    }
    if (isParamInputFocused()) {
      pendingRebuildAfterEdit = true;
      updateStatus();
      return;
    }
    const touch = window._lastParamTableTouch;
    if (touch && syncSingleParamRow(touch)) {
      window._lastParamTableTouch = null;
      return;
    }
    scheduleDebouncedRebuild();
  };

  window.syncAllParamsSingleRow = syncSingleParamRow;

  /** 从飞控重新拉取参数列表（会清空本地草稿） */
  async function onRefresh() {
    drafts.clear();
    if (typeof window.loadParams === "function") {
      await window.loadParams({ force: true });
    } else if (typeof log === "function") {
      log("⚠️ loadParams 不可用", "all-params");
    }
    rebuildTable();
  }

  /** 将草稿中有变化的项逐条 PARAM_SET 下发 */
  async function onWrite() {
    if (!fcConnected()) {
      if (typeof log === "function") log("⚠️ 未连接，无法写入参数", "all-params");
      return;
    }
    const pmap = window.params;
    if (!(pmap instanceof Map) || !pmap.size) return;

    const pending = [];
    for (const [k, fc] of pmap) {
      const d = drafts.has(k) ? drafts.get(k) : fc;
      if (!valuesClose(d, fc)) pending.push({ name: k.toUpperCase(), v: d });
    }
    if (!pending.length) {
      if (typeof log === "function") log("没有需要写入的修改", "all-params");
      return;
    }

    if (typeof window.sendParamSet !== "function") {
      if (typeof log === "function") log("⚠️ sendParamSet 不可用", "all-params");
      return;
    }

    let ok = 0;
    for (const { name, v } of pending) {
      try {
        const sent = await window.sendParamSet(name, v);
        if (sent) ok += 1;
      } catch (e) {
        if (typeof log === "function") log(`❌ 写入 ${name} 失败：${e?.message || e}`, "all-params");
      }
      await new Promise((r) => setTimeout(r, 60));
    }
    drafts.clear();
    if (typeof log === "function") log(`✅ 已发送 ${ok}/${pending.length} 条 PARAM_SET，等待飞控回传确认`, "all-params");
    rebuildTable();
  }

  /** 绑定工具栏、比对文件、筛选与全局事件 */
  function wire() {
    el("cfg-ap-refresh")?.addEventListener("click", () => onRefresh());
    el("cfg-ap-write")?.addEventListener("click", () => onWrite());
    el("cfg-ap-compare-btn")?.addEventListener("click", () => el("cfg-ap-compare-file")?.click());
    el("cfg-ap-compare-clear")?.addEventListener("click", () => {
      compareMap = null;
      el("cfg-ap-compare-file").value = "";
      rebuildTable();
      if (typeof log === "function") log("已清除比对文件", "all-params");
    });

    el("cfg-ap-compare-file")?.addEventListener("change", (ev) => {
      const f = ev.target?.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          compareMap = parseParamFile(String(reader.result || ""));
          if (typeof log === "function") {
            log(`📄 已加载比对参数文件：${compareMap.size} 键`, "all-params");
          }
        } catch (e) {
          compareMap = null;
          if (typeof log === "function") log(`⚠️ 解析比对文件失败：${e?.message || e}`, "all-params");
        }
        rebuildTable();
      };
      reader.readAsText(f, "utf-8");
    });

    el("cfg-ap-filter")?.addEventListener("input", () => {
      clearTimeout(filterDebounce);
      filterDebounce = setTimeout(applyRowFilter, 40);
    });

    document.addEventListener("gcs-connection", () => updateStatus());

    document.addEventListener("gcs-heartbeat", () => onTreeContextMaybeChanged());

    document.addEventListener("gcs-airframe-params-changed", (ev) => {
      if (ev.detail && ev.detail.bulk) rebuildTable();
      else window.refreshAllParamsTable();
    });
  }

  window.addEventListener("DOMContentLoaded", () => {
    Promise.all([loadHints(), loadParamDb()])
      .catch(() => {
        /* 任一路由失败不阻断界面 */
      })
      .finally(() => {
        lastTreeVehicleSrc = vehicleSrcForTree();
        wire();
        rebuildTable();
      });
  });
})();
