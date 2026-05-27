(function () {
  const WRITE_ORDER = [
    "FENCE_ENABLE",
    "FENCE_TYPE",
    "FENCE_RADIUS",
    "FENCE_ALT_MAX",
    "FENCE_ACTION",
    "RTL_ALT",
    "RTL_CLIMB_MIN",
    "RTL_CONE_SLOPE",
    "RTL_LOIT_TIME",
    "FS_THR_ENABLE",
    "FS_GCS_ENABLE",
    "FS_OPTIONS",
    "ARMING_CHECK",
  ];

  const PRESET_MAP = {
    safe: 0,
    mission: 8,
  };

  const els = {};
  let mounted = false;
  let lastPrearmText = "";
  let lastHydrateAt = 0;
  let prevPrearmHook = null;
  let geofenceVizApi = null;

  function q(id) {
    return document.getElementById(id);
  }

  function getParam(name, fallback = null) {
    if (!(window.params instanceof Map)) return fallback;
    if (!window.params.has(name)) return fallback;
    const n = Number(window.params.get(name));
    return Number.isFinite(n) ? n : fallback;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function canWrite() {
    return typeof window.sendParamSet === "function" && window._gcsConnState === "connected";
  }

  function disableForm(disabled) {
    Object.values(els).forEach((node) => {
      if (!node || typeof node.disabled !== "boolean") return;
      if (node.id === "safety-open-power-btn") return;
      node.disabled = disabled;
    });
  }

  function setStatus(msg, isBad = false) {
    if (!els.writeStatus) return;
    els.writeStatus.textContent = msg || "";
    els.writeStatus.classList.toggle("danger", !!isBad);
    els.writeStatus.classList.toggle("ok", !isBad && !!msg);
  }

  function valueOf(el, fallback = 0) {
    if (!el) return fallback;
    const v = Number(el.value);
    return Number.isFinite(v) ? v : fallback;
  }

  function setValue(id, n) {
    const el = els[id];
    if (!el || !Number.isFinite(n)) return;
    el.value = String(n);
  }

  function applyPresetToFsOptions() {
    const preset = els.fsPreset?.value;
    if (!preset || preset === "manual") return;
    const v = PRESET_MAP[preset];
    if (!Number.isFinite(v) || !els.fsOptions) return;
    els.fsOptions.value = String(v);
  }

  function currentDraft() {
    return {
      FENCE_ENABLE: Math.round(valueOf(els.fenceEnable, 0)),
      FENCE_TYPE: Math.round(valueOf(els.fenceType, 1)),
      FENCE_RADIUS: valueOf(els.fenceRadius, 1000),
      FENCE_ALT_MAX: valueOf(els.fenceAltMax, 120),
      FENCE_ACTION: Math.round(valueOf(els.fenceAction, 1)),
      RTL_ALT: valueOf(els.rtlAlt, 1500),
      RTL_CLIMB_MIN: valueOf(els.rtlClimbMin, 10),
      RTL_CONE_SLOPE: valueOf(els.rtlConeSlope, 3),
      RTL_LOIT_TIME: valueOf(els.rtlLoitTime, 0),
      FS_THR_ENABLE: Math.round(valueOf(els.fsThrEnable, 1)),
      FS_GCS_ENABLE: Math.round(valueOf(els.fsGcsEnable, 1)),
      FS_OPTIONS: Math.round(valueOf(els.fsOptions, 0)),
      ARMING_CHECK: Math.round(valueOf(els.armingCheck, 1)),
    };
  }

  function updatePresetFromFsOptions() {
    const fsOpt = Math.round(valueOf(els.fsOptions, 0));
    if (fsOpt === PRESET_MAP.safe) els.fsPreset.value = "safe";
    else if (fsOpt === PRESET_MAP.mission) els.fsPreset.value = "mission";
    else els.fsPreset.value = "manual";
  }

  function updateTopChips() {
    const fenceEnabled = Math.round(valueOf(els.fenceEnable, 0)) === 1;
    if (els.fenceChip) {
      els.fenceChip.textContent = `Fence: ${fenceEnabled ? "开启" : "关闭"}`;
      els.fenceChip.className = `safety-chip ${fenceEnabled ? "safety-chip-ok" : "safety-chip-warn"}`;
    }

    if (els.prearmChip) {
      const txt = lastPrearmText || "暂无异常";
      const bad = /prearm:|pre-arm|arming denied/i.test(txt);
      els.prearmChip.textContent = `Pre-arm: ${bad ? "异常" : "正常"}`;
      els.prearmChip.className = `safety-chip ${bad ? "safety-chip-warn" : "safety-chip-ok"}`;
    }
  }

  function updateBatterySummary() {
    if (!els.batterySummary) return;
    const slots = typeof window.listEnabledBatterySlots === "function"
      ? window.listEnabledBatterySlots(window.params)
      : [];
    if (!slots.length) {
      const low = getParam("BATT_FS_LOW_ACT", null);
      const crt = getParam("BATT_FS_CRT_ACT", null);
      if (low == null && crt == null) {
        els.batterySummary.textContent = "未检测到电池监测槽，请先在电源页配置 BATT_MONITOR。";
        return;
      }
      els.batterySummary.textContent = `BATT：低电动作=${low ?? "—"}，严重低电动作=${crt ?? "—"}`;
      return;
    }
    const lines = slots.map((slot) => {
      const suffix = slot.slotIndex === 0 ? "" : `${slot.slotIndex + 1}`;
      const pfx = slot.prefix || (slot.slotIndex === 0 ? "BATT" : `BATT${slot.slotIndex + 1}`);
      const low = getParam(`${pfx}_FS_LOW_ACT`, null);
      const crt = getParam(`${pfx}_FS_CRT_ACT`, null);
      return `#${suffix || "1"} ${slot.typeShort || pfx}: LOW=${low ?? "—"} / CRT=${crt ?? "—"}`;
    });
    els.batterySummary.textContent = lines.join("；");
  }

  function updatePrearmSummary() {
    if (!els.prearmSummary) return;
    const txt = lastPrearmText || "尚未收到 Pre-arm 错误消息。";
    els.prearmSummary.textContent = txt;
    updateTopChips();
  }

  function updateEmergencySummary() {
    if (!els.emergencySummary) return;
    const matched = [];
    if (window.params instanceof Map) {
      for (let i = 1; i <= 16; i += 1) {
        const key = `RC${i}_OPTION`;
        const n = getParam(key, null);
        if (n === 31) matched.push(`RC${i}`);
      }
    }
    const spinArm = getParam("MOT_SPIN_ARM", null);
    const spinMin = getParam("MOT_SPIN_MIN", null);
    const emStop = matched.length ? `急停映射: ${matched.join(", ")}` : "急停映射: 未配置 RCx_OPTION=31";
    const motorSafe = ` | MOT_SPIN_ARM=${spinArm ?? "—"}, MOT_SPIN_MIN=${spinMin ?? "—"}`;
    els.emergencySummary.textContent = `${emStop}${motorSafe}`;
  }

  function updateGeofencePreview() {
    const draft = currentDraft();
    const enabled = draft.FENCE_ENABLE === 1;
    const isCircular = draft.FENCE_TYPE === 1 || draft.FENCE_TYPE === 3;

    // 控制 HTML 覆盖层（优先使用，更稳定）
    if (els.geofenceOverlay) {
      if (!enabled || !isCircular) {
        const msg = !enabled
          ? "围栏未启用"
          : "仅圆形围栏支持 3D 预览";
        els.geofenceOverlay.textContent = msg;
        els.geofenceOverlay.classList.add("show");
      } else {
        els.geofenceOverlay.classList.remove("show");
      }
    }

    if (!geofenceVizApi) return;

    geofenceVizApi.update({
      radius: draft.FENCE_RADIUS,
      height: draft.FENCE_ALT_MAX,
      enabled,
      type: draft.FENCE_TYPE,
    });
  }

  function hydrateFromParams(force = false) {
    if (!(window.params instanceof Map) || window.params.size === 0) return;
    if (!force && Date.now() - lastHydrateAt < 200) return;
    setValue("fenceEnable", getParam("FENCE_ENABLE", 0));
    setValue("fenceType", getParam("FENCE_TYPE", 3));
    setValue("fenceRadius", getParam("FENCE_RADIUS", 1000));
    setValue("fenceAltMax", getParam("FENCE_ALT_MAX", 120));
    setValue("fenceAction", getParam("FENCE_ACTION", 1));
    setValue("rtlAlt", getParam("RTL_ALT", 1500));
    setValue("rtlClimbMin", getParam("RTL_CLIMB_MIN", 10));
    setValue("rtlConeSlope", getParam("RTL_CONE_SLOPE", 3));
    setValue("rtlLoitTime", getParam("RTL_LOIT_TIME", 0));
    setValue("fsThrEnable", getParam("FS_THR_ENABLE", 1));
    setValue("fsGcsEnable", getParam("FS_GCS_ENABLE", 1));
    setValue("fsOptions", getParam("FS_OPTIONS", 0));
    setValue("armingCheck", getParam("ARMING_CHECK", 1));
    updatePresetFromFsOptions();
    updateBatterySummary();
    updateEmergencySummary();
    updateTopChips();
    lastHydrateAt = Date.now();
  }

  function guardRiskyChanges(draft) {
    const oldFence = getParam("FENCE_ENABLE", 0);
    const oldThrFs = getParam("FS_THR_ENABLE", 1);
    const risks = [];
    if (oldFence === 1 && draft.FENCE_ENABLE === 0) risks.push("将关闭 Geofence");
    if (oldThrFs !== 0 && draft.FS_THR_ENABLE === 0) risks.push("将关闭遥控失联保护");
    if (draft.ARMING_CHECK === 0) risks.push("将关闭全部解锁检查");
    if (!risks.length) return true;
    return window.confirm(`检测到高风险修改:\n- ${risks.join("\n- ")}\n\n确认继续写入飞控吗？`);
  }

  async function writeSafetyParams() {
    if (!canWrite()) {
      setStatus("写入失败：未连接飞控或 sendParamSet 不可用。", true);
      return;
    }
    applyPresetToFsOptions();
    const draft = currentDraft();
    if (!guardRiskyChanges(draft)) {
      setStatus("已取消写入。");
      return;
    }

    setStatus("正在写入安全参数…");
    let sent = 0;
    const failed = [];
    /* eslint-disable no-await-in-loop */
    for (const key of WRITE_ORDER) {
      if (!Object.prototype.hasOwnProperty.call(draft, key)) continue;
      const ok = await window.sendParamSet(key, draft[key]);
      if (ok) {
        sent += 1;
        if (window.params instanceof Map) window.params.set(key, draft[key]);
      } else {
        failed.push(key);
      }
      await sleep(40);
    }
    /* eslint-enable no-await-in-loop */

    if (sent === 0) {
      setStatus("写入失败：飞控未响应。", true);
      return;
    }
    const msg = failed.length
      ? `已写入 ${sent} 项，失败 ${failed.length} 项（${failed.join(", ")}）`
      : `已写入 ${sent} 项安全参数。`;
    setStatus(msg, failed.length > 0);
    if (typeof window.log === "function") window.log(`🛡️ ${msg}`, "safety-param-write");
    hydrateFromParams(true);
  }

  function bindActions() {
    els.writeBtn?.addEventListener("click", writeSafetyParams);
    els.reloadBtn?.addEventListener("click", () => {
      hydrateFromParams(true);
      setStatus("已从参数表重载。");
    });
    els.fsOptions?.addEventListener("input", updatePresetFromFsOptions);
    els.fsPreset?.addEventListener("change", () => {
      applyPresetToFsOptions();
      updateTopChips();
    });
    els.fenceEnable?.addEventListener("change", updateTopChips);
    els.openPowerBtn?.addEventListener("click", () => {
      const btn = document.querySelector('.ov-nav-item[data-setup-panel="power"]');
      btn?.click();
    });

    // Geofence 3D 圆柱预览实时联动
    const fencePreviewFields = [els.fenceRadius, els.fenceAltMax, els.fenceType, els.fenceEnable];
    fencePreviewFields.forEach((el) => {
      if (!el) return;
      el.addEventListener("input", updateGeofencePreview);
      el.addEventListener("change", updateGeofencePreview);
    });
  }

  function bindPrearmHook() {
    prevPrearmHook = typeof window.gcsOnPrearmStatustext === "function"
      ? window.gcsOnPrearmStatustext
      : null;
    window.gcsOnPrearmStatustext = function onPrearmFromSafety(text) {
      if (prevPrearmHook) {
        try { prevPrearmHook(text); } catch (_) { /* ignore */ }
      }
      const raw = String(text || "");
      if (!raw) return;
      const low = raw.toLowerCase();
      if (!low.includes("prearm:") && !low.includes("pre-arm") && !low.includes("arming denied")) return;
      lastPrearmText = raw;
      updatePrearmSummary();
    };
  }

  function tick() {
    if (!document.getElementById("setup-panel-safety")) return;
    const connected = window._gcsConnState === "connected";
    disableForm(!connected);
    updateBatterySummary();
    updateEmergencySummary();
    updateTopChips();
  }

  function mount() {
    if (mounted) return;
    if (!document.getElementById("setup-panel-safety")) return;

    els.fenceEnable = q("safety-fence-enable");
    els.fenceType = q("safety-fence-type");
    els.fenceRadius = q("safety-fence-radius");
    els.fenceAltMax = q("safety-fence-altmax");
    els.fenceAction = q("safety-fence-action");
    els.rtlAlt = q("safety-rtl-alt");
    els.rtlClimbMin = q("safety-rtl-climb-min");
    els.rtlConeSlope = q("safety-rtl-cone-slope");
    els.rtlLoitTime = q("safety-rtl-loit-time");
    els.fsThrEnable = q("safety-fs-thr-enable");
    els.fsGcsEnable = q("safety-fs-gcs-enable");
    els.fsPreset = q("safety-fs-preset");
    els.fsOptions = q("safety-fs-options");
    els.armingCheck = q("safety-arming-check");
    els.batterySummary = q("safety-battery-summary");
    els.prearmSummary = q("safety-prearm-summary");
    els.emergencySummary = q("safety-emergency-summary");
    els.writeBtn = q("safety-write-params-btn");
    els.reloadBtn = q("safety-reload-btn");
    els.writeStatus = q("safety-write-status");
    els.prearmChip = q("safety-prearm-chip");
    els.fenceChip = q("safety-fence-chip");
    els.openPowerBtn = q("safety-open-power-btn");
    els.geofenceCanvas = q("safety-geofence-viz");
    els.geofenceOverlay = q("safety-geofence-overlay");

    bindActions();
    bindPrearmHook();
    hydrateFromParams(true);
    updatePrearmSummary();
    tick();

    // 初始化 Geofence 3D 预览（必须在 hydrate 之后）
    if (els.geofenceCanvas && window.THREE && window.GeofenceVizThree) {
      geofenceVizApi = window.GeofenceVizThree.create(els.geofenceCanvas);
      if (geofenceVizApi) {
        updateGeofencePreview();
        // 监听容器尺寸变化
        const host = els.geofenceCanvas.parentElement || els.geofenceCanvas;
        if (typeof ResizeObserver !== "undefined") {
          const ro = new ResizeObserver(() => {
            if (geofenceVizApi && typeof geofenceVizApi.resize === "function") {
              geofenceVizApi.resize();
            }
          });
          ro.observe(host);
        }
      }
    }

    document.addEventListener("gcs-connection", () => {
      if (window._gcsConnState === "connected") {
        setStatus("飞控已连接，可编辑安全参数。");
      } else {
        setStatus("飞控未连接，安全页进入只读。", true);
      }
      tick();
    });
    document.addEventListener("gcs-sensor-overview-changed", () => hydrateFromParams(true));
    window.addEventListener("gcs:setup-panel-changed", (ev) => {
      if (ev?.detail?.panel === "safety") {
        hydrateFromParams(true);
        if (geofenceVizApi && typeof geofenceVizApi.resize === "function") {
          // 下一帧确保容器尺寸已稳定
          requestAnimationFrame(() => {
            if (geofenceVizApi) geofenceVizApi.resize();
          });
        }
      }
    });

    setInterval(tick, 1000);
    mounted = true;
  }

  window.addEventListener("DOMContentLoaded", mount);
})();
