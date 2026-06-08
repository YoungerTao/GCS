(function initRtkSetup() {
  const RTK_PANEL = "rtk";
  const GPS_PANEL = "params";

  const state = {
    panelActive: false,
    activeSource: "none",
  };

  function el(id) {
    return document.getElementById(id);
  }

  function fcConnected() {
    return String(window._gcsConnState || "").toLowerCase() === "connected" &&
      typeof window.sendParamSet === "function";
  }

  function getTelemetry() {
    return window.gpsTelemetry || {};
  }

  function openPanel(panel) {
    if (typeof window.gpsSetupOpenPanel === "function") {
      window.gpsSetupOpenPanel(panel);
      return;
    }
    document.querySelectorAll(".ov-panel").forEach((node) => {
      node.classList.toggle("active", node.id === "setup-panel-" + panel);
    });
    window.dispatchEvent(new CustomEvent("gcs:setup-panel-changed", { detail: { panel } }));
  }

  function sourceLabel(source) {
    if (source === "cors") return "CORS";
    if (source === "moving") return "Moving Base";
    return "No RTK";
  }

  function injectLabel(status) {
    if (status === "active") return "Injecting";
    if (status === "standby") return "Standby";
    return "Idle";
  }

  function healthLabel(health) {
    if (health === "good") return "Healthy";
    if (health === "warn") return "Watch";
    return "Offline";
  }

  function healthClass(health) {
    if (health === "good") return "is-good";
    if (health === "warn") return "is-warn";
    return "is-muted";
  }

  function formatLastUpdate(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return "--";
    return new Date(ms).toLocaleTimeString("zh-CN", { hour12: false });
  }

  function inferSummary() {
    const root = getTelemetry();
    const instances = Array.isArray(root.instances) ? root.instances : [];
    const rtk = root.rtk || {};
    const maxFix = Math.max(0, ...instances.map((item) => Number(item.fixType) || 0));
    const primary = Number(window.gpsSetupGetDraftValue?.("GPS_PRIMARY") || 0);

    let source = state.activeSource || String(rtk.source || "none");
    let injectStatus = String(rtk.injectStatus || "idle");
    let health = String(rtk.health || "offline");

    if (maxFix >= 6) {
      if (source === "none") source = "moving";
      injectStatus = "active";
      health = "good";
    } else if (maxFix >= 5) {
      if (source === "none") source = "moving";
      if (injectStatus === "idle") injectStatus = "standby";
      if (health === "offline") health = "warn";
    }

    const lastCorrectionMs = Number(rtk.lastCorrectionMs) || Math.max(0, ...instances.map((item) => Number(item.lastUpdateMs) || 0));

    return {
      source,
      injectStatus,
      health,
      boundInstance: Number.isFinite(primary) ? primary : 0,
      lastCorrectionMs,
      ageSec: Number(rtk.ageSec),
      latencyMs: Number(rtk.latencyMs),
    };
  }

  function syncSourcePanels() {
    document.querySelectorAll(".rtk-source-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.getAttribute("data-rtk-source") === state.activeSource);
    });

    document.querySelectorAll("[data-rtk-source-panel]").forEach((panel) => {
      const show = panel.getAttribute("data-rtk-source-panel") === state.activeSource;
      panel.hidden = !show;
      panel.classList.toggle("active", show);
    });

    const summaryCopy = {
      none: "RTK disabled. GPS receiver setup remains on the main GPS page.",
      cors: "Network corrections are selected. Watch correction age and link latency.",
      moving: "Moving baseline is selected. Watch base/rover binding and receiver health.",
    }[state.activeSource] || "RTK disabled. GPS receiver setup remains on the main GPS page.";

    const summaryNode = el("rtk-source-summary");
    if (summaryNode) summaryNode.textContent = summaryCopy;
  }

  function ensureSelectOptions() {
    const primarySelect = el("rtk-primary-target");
    const injectSelect = el("rtk-inject-target");

    if (primarySelect && primarySelect.dataset.ready !== "1") {
      primarySelect.dataset.ready = "1";
      primarySelect.innerHTML =
        '<option value="0">GPS1</option>' +
        '<option value="1">GPS2</option>';
      primarySelect.addEventListener("change", () => {
        const value = Number(primarySelect.value);
        if (Number.isFinite(value)) {
          window.gpsSetupSetDraftValue?.("GPS_PRIMARY", value);
          syncSummary();
        }
      });
    }

    if (injectSelect && injectSelect.dataset.ready !== "1") {
      injectSelect.dataset.ready = "1";
      injectSelect.innerHTML =
        '<option value="0">Inject to GPS1</option>' +
        '<option value="1">Inject to GPS2</option>' +
        '<option value="127">Inject to all</option>';
      injectSelect.addEventListener("change", () => {
        const value = Number(injectSelect.value);
        if (Number.isFinite(value)) {
          window.gpsSetupSetDraftValue?.("GPS_INJECT_TO", value);
          syncSummary();
        }
      });
    }

    if (primarySelect) {
      const value = Number(window.gpsSetupGetDraftValue?.("GPS_PRIMARY"));
      primarySelect.value = Number.isFinite(value) ? String(value) : "0";
    }

    if (injectSelect) {
      const value = Number(window.gpsSetupGetDraftValue?.("GPS_INJECT_TO"));
      injectSelect.value = Number.isFinite(value) ? String(value) : "127";
    }
  }

  function syncSummary() {
    ensureSelectOptions();
    const summary = inferSummary();
    const telemetry = getTelemetry();
    telemetry.rtk = telemetry.rtk || {};
    telemetry.rtk.source = summary.source;
    telemetry.rtk.boundInstance = summary.boundInstance;

    const ageText = Number.isFinite(summary.ageSec) ? (summary.ageSec + " s") : "--";
    const latencyText = Number.isFinite(summary.latencyMs) ? (summary.latencyMs + " ms") : "--";
    const bindLabel = summary.boundInstance === 1 ? "GPS2" : "GPS1";

    const sourcePill = el("rtk-source-pill");
    if (sourcePill) {
      sourcePill.textContent = sourceLabel(summary.source);
      sourcePill.className = "gps-status-value " + healthClass(summary.health);
    }

    setText("rtk-inject-pill", injectLabel(summary.injectStatus));
    setText("rtk-last-pill", formatLastUpdate(summary.lastCorrectionMs));
    setText("rtk-age-pill", ageText + " / " + latencyText);
    setText("rtk-bind-pill", bindLabel);
    setText("rtk-health-label", healthLabel(summary.health));
    setText("rtk-last-update", formatLastUpdate(summary.lastCorrectionMs));
    setText("rtk-latency", latencyText);
    setText("rtk-bind-side", bindLabel);
  }

  function setText(id, value) {
    const node = el(id);
    if (node) node.textContent = value;
  }

  async function writeRtkCard() {
    const status = el("gps-write-status");
    const keys = ["GPS_INJECT_TO", "GPS_PRIMARY"];

    if (!fcConnected()) {
      if (status) {
        status.textContent = "Flight controller is disconnected. RTK write is blocked.";
        status.className = "muted gps-write-status is-bad";
      }
      return;
    }

    let sent = 0;
    for (const key of keys) {
      const value = window.gpsSetupGetDraftValue?.(key);
      if (!Number.isFinite(Number(value))) continue;
      try {
        const ok = await window.sendParamSet(key, value);
        if (ok) {
          sent += 1;
          if (window.params instanceof Map) {
            window.params.set(key, Number(value));
          }
        }
      } catch (_) {
        // aggregate result only
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }

    window.gpsSetupClearDrafts?.(keys);
    window.gpsSetupRender?.(true);
    syncSummary();

    if (status) {
      status.textContent = "RTK card wrote " + sent + "/" + keys.length + " params.";
      status.className = "muted gps-write-status " + (sent === keys.length ? "is-ok" : "is-warn");
    }
  }

  function bindEvents() {
    el("rtk-back-to-gps")?.addEventListener("click", () => openPanel(GPS_PANEL));
    el("rtk-write-source-btn")?.addEventListener("click", () => {
      writeRtkCard();
    });

    document.querySelectorAll(".rtk-source-tab").forEach((tab) => {
      if (tab.dataset.bound === "1") return;
      tab.dataset.bound = "1";
      tab.addEventListener("click", () => {
        state.activeSource = tab.getAttribute("data-rtk-source") || "none";
        syncSourcePanels();
        syncSummary();
        window.gpsSetupRender?.(true);
      });
    });
  }

  function handlePanelChange(panel) {
    state.panelActive = panel === RTK_PANEL;
    if (state.panelActive) {
      syncSourcePanels();
      syncSummary();
    }
  }

  function mount() {
    if (!el("setup-panel-rtk")) return;

    const initialSource = getTelemetry().rtk?.source;
    state.activeSource = typeof initialSource === "string" ? initialSource : "none";

    bindEvents();
    syncSourcePanels();
    syncSummary();

    window.addEventListener("gcs:setup-panel-changed", (event) => handlePanelChange(event.detail?.panel));
    document.addEventListener("gcs-connection", () => {
      if (state.panelActive) syncSummary();
    });
    setInterval(() => {
      if (state.panelActive) syncSummary();
    }, 1000);
  }

  window.addEventListener("DOMContentLoaded", mount);
})();
