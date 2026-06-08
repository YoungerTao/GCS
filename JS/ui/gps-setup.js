(function initGpsSetup() {
  const GPS_PANEL = "params";
  const RTK_PANEL = "rtk";
  const STORAGE_KEY = "gcs-gps-drafts-v1";
  const EPS = 1e-5;
  const TELEMETRY_STALE_MS = 5000;

  const INSTANCE_KEYS = {
    0: [
      "GPS_TYPE",
      "GPS_RATE_MS",
      "GPS_GNSS_MODE",
      "GPS_HDOP_GOOD",
      "GPS_MIN_SATS",
      "GPS_AUTO_CONFIG",
      "GPS_SBAS_MODE",
    ],
    1: [
      "GPS_TYPE2",
      "GPS_RATE_MS2",
      "GPS_GNSS_MODE2",
    ],
  };

  const OFFSET_KEYS = [
    "GPS_POS1_X",
    "GPS_POS1_Y",
    "GPS_POS1_Z",
    "GPS_POS2_X",
    "GPS_POS2_Y",
    "GPS_POS2_Z",
  ];

  const BLEND_KEYS = [
    "GPS_AUTO_SWITCH",
    "GPS_PRIMARY",
    "GPS_INJECT_TO",
    "GPS_BLEND_MASK",
  ];

  const ADVANCED_KEYS = [
    "GPS_NAVFILTER",
    "GPS_SAVE_CFG",
    "GPS_DRV_OPTIONS",
  ];

  const DEFAULTS = {
    GPS_TYPE: 1,
    GPS_TYPE2: 0,
    GPS_RATE_MS: 200,
    GPS_RATE_MS2: 200,
    GPS_GNSS_MODE: 67,
    GPS_GNSS_MODE2: 67,
    GPS_HDOP_GOOD: 140,
    GPS_MIN_SATS: 6,
    GPS_AUTO_CONFIG: 1,
    GPS_SBAS_MODE: 1,
    GPS_AUTO_SWITCH: 1,
    GPS_PRIMARY: 0,
    GPS_INJECT_TO: 127,
    GPS_BLEND_MASK: 7,
    GPS_NAVFILTER: 8,
    GPS_SAVE_CFG: 2,
    GPS_DRV_OPTIONS: 0,
    GPS_POS1_X: 0,
    GPS_POS1_Y: 0,
    GPS_POS1_Z: 0,
    GPS_POS2_X: 0,
    GPS_POS2_Y: 0,
    GPS_POS2_Z: 0,
  };

  const PARAM_ID_MAP = {
    "gps-type-0": "GPS_TYPE",
    "gps-type-1": "GPS_TYPE2",
    "gps-rate-0": "GPS_RATE_MS",
    "gps-rate-1": "GPS_RATE_MS2",
    "gps-hdop-good": "GPS_HDOP_GOOD",
    "gps-min-sats": "GPS_MIN_SATS",
    "gps-auto-config": "GPS_AUTO_CONFIG",
    "gps-sbas-mode": "GPS_SBAS_MODE",
    "gps-pos1-x": "GPS_POS1_X",
    "gps-pos1-y": "GPS_POS1_Y",
    "gps-pos1-z": "GPS_POS1_Z",
    "gps-pos2-x": "GPS_POS2_X",
    "gps-pos2-y": "GPS_POS2_Y",
    "gps-pos2-z": "GPS_POS2_Z",
    "gps-auto-switch": "GPS_AUTO_SWITCH",
    "gps-primary": "GPS_PRIMARY",
    "gps-inject-to": "GPS_INJECT_TO",
    "gps-navfilter": "GPS_NAVFILTER",
    "gps-save-cfg": "GPS_SAVE_CFG",
  };

  const TYPE_OPTIONS = [
    { value: 0, label: "Disabled" },
    { value: 1, label: "Auto" },
    { value: 2, label: "u-blox" },
    { value: 5, label: "NMEA" },
    { value: 9, label: "DroneCAN" },
    { value: 17, label: "uBlox Base" },
    { value: 18, label: "uBlox Rover" },
    { value: 22, label: "DroneCAN Base" },
    { value: 23, label: "DroneCAN Rover" },
    { value: 26, label: "SBF Dual Antenna" },
  ];

  const RATE_OPTIONS = [
    { value: 200, label: "5 Hz (200 ms)" },
    { value: 125, label: "8 Hz (125 ms)" },
    { value: 100, label: "10 Hz (100 ms)" },
    { value: 50, label: "20 Hz (50 ms)" },
  ];

  const AUTO_CONFIG_OPTIONS = [
    { value: 0, label: "Disabled" },
    { value: 1, label: "Enabled" },
    { value: 2, label: "Enable incl CAN" },
    { value: 3, label: "Clear custom cfg" },
  ];

  const SBAS_OPTIONS = [
    { value: 0, label: "Disabled" },
    { value: 1, label: "Enabled" },
    { value: 2, label: "Keep receiver" },
  ];

  const AUTO_SWITCH_OPTIONS = [
    { value: 0, label: "Use primary" },
    { value: 1, label: "Use best" },
    { value: 2, label: "Blend" },
    { value: 4, label: "Prefer primary" },
  ];

  const PRIMARY_OPTIONS = [
    { value: 0, label: "GPS1" },
    { value: 1, label: "GPS2" },
  ];

  const INJECT_OPTIONS = [
    { value: 0, label: "Inject to GPS1" },
    { value: 1, label: "Inject to GPS2" },
    { value: 127, label: "Inject to all" },
  ];

  const SAVE_CFG_OPTIONS = [
    { value: 0, label: "Do not save" },
    { value: 1, label: "Save now" },
    { value: 2, label: "Auto" },
  ];

  const NAVFILTER_OPTIONS = [
    { value: 8, label: "Portable" },
    { value: 4, label: "Stationary" },
    { value: 5, label: "Pedestrian" },
    { value: 6, label: "Automotive" },
    { value: 7, label: "Sea" },
    { value: 9, label: "Airborne 1G" },
    { value: 10, label: "Airborne 2G" },
    { value: 11, label: "Airborne 4G" },
  ];

  const CONSTELLATIONS = [
    { bit: 0, label: "GPS" },
    { bit: 1, label: "SBAS" },
    { bit: 2, label: "Galileo" },
    { bit: 3, label: "BeiDou" },
    { bit: 4, label: "IMES" },
    { bit: 5, label: "QZSS" },
    { bit: 6, label: "GLONASS" },
  ];

  const BLEND_MASK_OPTIONS = [
    { bit: 0, label: "Horizontal" },
    { bit: 1, label: "Vertical" },
    { bit: 2, label: "Velocity" },
  ];

  const DRV_OPTIONS = [
    { bit: 0, label: "UART2 Moving Base" },
    { bit: 1, label: "SBF Base Yaw" },
    { bit: 2, label: "115200 Baud" },
    { bit: 3, label: "Dedicated CAN Baseline" },
    { bit: 4, label: "Ellipsoid Altitude" },
  ];

  const FIX_LABELS = {
    0: "No GPS",
    1: "No Fix",
    2: "2D Fix",
    3: "3D Fix",
    4: "DGPS",
    5: "RTK Float",
    6: "RTK Fixed",
  };

  const state = {
    mounted: false,
    panelActive: false,
    drafts: new Map(),
  };

  function el(id) {
    return document.getElementById(id);
  }

  function getParamsMap() {
    return window.params instanceof Map ? window.params : null;
  }

  function fcConnected() {
    return String(window._gcsConnState || "").toLowerCase() === "connected" &&
      typeof window.sendParamSet === "function";
  }

  function valuesClose(a, b) {
    return Math.abs(Number(a) - Number(b)) < EPS;
  }

  function getParamNum(key) {
    const params = getParamsMap();
    if (!params || !params.has(key)) return null;
    const numeric = Number(params.get(key));
    return Number.isFinite(numeric) ? numeric : null;
  }

  function getDraftValue(key) {
    return state.drafts.has(key) ? state.drafts.get(key) : getParamNum(key);
  }

  function persistDrafts() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(state.drafts.entries())));
    } catch (_) {
      // ignore storage failures
    }
  }

  function loadDrafts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      Object.entries(parsed || {}).forEach(([key, value]) => {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
          state.drafts.set(key, numeric);
        }
      });
    } catch (_) {
      // ignore malformed storage
    }
  }

  function setDraftValue(key, value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    const live = getParamNum(key);
    if (live != null && valuesClose(live, numeric)) {
      state.drafts.delete(key);
    } else {
      state.drafts.set(key, numeric);
    }
    persistDrafts();
  }

  function clearDraftsForKeys(keys) {
    let changed = false;
    keys.forEach((key) => {
      if (state.drafts.delete(key)) changed = true;
    });
    if (changed) persistDrafts();
  }

  function textOr(id, fallback) {
    return String(el(id)?.textContent || fallback || "").trim();
  }

  function fmt(value, digits, suffix) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "--";
    return numeric.toFixed(digits) + (suffix || "");
  }

  function fmtLatLon(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "--";
    return lat.toFixed(6) + ", " + lon.toFixed(6);
  }

  function formatAge(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return "--";
    const ageMs = Math.max(0, Date.now() - ms);
    if (ageMs < 1000) return "live";
    if (ageMs < 60000) return Math.round(ageMs / 1000) + "s ago";
    return Math.round(ageMs / 60000) + "m ago";
  }

  function optionLabel(options, value, fallback) {
    const match = options.find((item) => Number(item.value) === Number(value));
    if (match) return match.label;
    if (fallback) return fallback;
    return String(value);
  }

  function getBitmaskValue(key, options) {
    const raw = Number(getDraftValue(key));
    if (Number.isFinite(raw)) return raw;
    return options.reduce((sum, option) => sum + (1 << option.bit), 0);
  }

  function buildSignalBars(sats) {
    const count = Math.max(0, Math.min(8, Math.round((Number(sats) || 0) / 4)));
    return Array.from({ length: 8 }, (_, index) => {
      const active = index < count ? " is-on" : "";
      return '<span class="gps-signal-bar' + active + '" style="height:' + (8 + index * 3) + 'px"></span>';
    }).join("");
  }

  function buildConstellationChips(mask) {
    return CONSTELLATIONS.map((item) => {
      const active = (Number(mask) & (1 << item.bit)) !== 0 ? " is-active" : "";
      return '<span class="gps-constellation-chip' + active + '">' + item.label + "</span>";
    }).join("");
  }

  function renderSelect(select, options, value) {
    if (!select) return;
    const current = Number(value);
    select.innerHTML = options.map((option) => {
      return '<option value="' + option.value + '">' + option.label + "</option>";
    }).join("");
    if (Number.isFinite(current)) {
      select.value = String(current);
    }
  }

  function renderBitmask(host, key, options, value) {
    if (!host) return;
    host.innerHTML = options.map((option) => {
      const checked = (Number(value) & (1 << option.bit)) !== 0 ? " checked" : "";
      return (
        '<label class="gps-check-chip">' +
          '<input type="checkbox" data-mask-key="' + key + '" data-mask-bit="' + option.bit + '"' + checked + ">" +
          "<span>" + option.label + "</span>" +
        "</label>"
      );
    }).join("");
  }

  function getFixClass(enabled, fresh, fixType) {
    if (!enabled) return "is-muted";
    if (!fresh) return "is-bad";
    if (fixType >= 6) return "is-good";
    if (fixType >= 5) return "is-warn";
    if (fixType >= 3) return "is-warn";
    return "is-bad";
  }

  function getTelemetryRoot() {
    return window.gpsTelemetry || {};
  }

  function getInstances() {
    const telemetry = Array.isArray(getTelemetryRoot().instances)
      ? getTelemetryRoot().instances
      : [{}, {}];

    return [0, 1].map((index) => {
      const item = telemetry[index] || {};
      const typeKey = index === 0 ? "GPS_TYPE" : "GPS_TYPE2";
      const rateKey = index === 0 ? "GPS_RATE_MS" : "GPS_RATE_MS2";
      const gnssKey = index === 0 ? "GPS_GNSS_MODE" : "GPS_GNSS_MODE2";
      const typeValue = Number(getDraftValue(typeKey)) || 0;
      const lastUpdateMs = Number(item.lastUpdateMs) || 0;
      const fresh = lastUpdateMs > 0 && (Date.now() - lastUpdateMs) < TELEMETRY_STALE_MS;
      const enabled = typeValue !== 0;
      const fixType = Number(item.fixType) || 0;
      const gnssMask = getBitmaskValue(gnssKey, CONSTELLATIONS);

      return {
        index,
        enabled,
        typeKey,
        rateKey,
        gnssKey,
        typeValue,
        typeLabel: optionLabel(TYPE_OPTIONS, typeValue, enabled ? "Receiver" : "Disabled"),
        fixType,
        fixLabel: FIX_LABELS[fixType] || ("Fix " + fixType),
        statusClass: getFixClass(enabled, fresh, fixType),
        fresh,
        lastUpdateMs,
        sats: Number(item.satellitesVisible) || 0,
        lat: Number(item.lat),
        lon: Number(item.lon),
        altM: Number(item.altM),
        eph: Number(item.eph),
        epv: Number(item.epv),
        velMps: Number(item.velMps),
        hAccM: Number(item.hAccM),
        vAccM: Number(item.vAccM),
        velAccMps: Number(item.velAccMps),
        yawDeg: Number(item.yawDeg),
        gnssMask,
      };
    });
  }

  function getPrimaryInstance(instances) {
    const primaryIndex = Math.min(1, Math.max(0, Number(getDraftValue("GPS_PRIMARY")) || 0));
    return instances[primaryIndex] || instances[0];
  }

  function getRtkSummary(instances) {
    const telemetry = getTelemetryRoot().rtk || {};
    const bestFix = Math.max.apply(null, instances.map((item) => item.fixType || 0));
    let source = String(telemetry.source || "");
    let label = "No RTK";
    let className = "is-muted";

    if (bestFix >= 6) {
      label = "RTK Fixed";
      className = "is-good";
      if (!source) source = "moving";
    } else if (bestFix >= 5) {
      label = "RTK Float";
      className = "is-warn";
      if (!source) source = "moving";
    } else if (source === "cors") {
      label = "CORS Ready";
      className = "is-warn";
    } else if (source === "moving") {
      label = "Moving Base";
      className = "is-warn";
    }

    return {
      source: source || "none",
      label,
      className,
      injectLabel: optionLabel(INJECT_OPTIONS, getDraftValue("GPS_INJECT_TO"), "Inject"),
      lastCorrectionMs: Number(telemetry.lastCorrectionMs) || 0,
      ageSec: Number(telemetry.ageSec),
      latencyMs: Number(telemetry.latencyMs),
    };
  }

  function setText(id, value) {
    const node = el(id);
    if (node) node.textContent = value;
  }

  function setStatusValue(id, text, className) {
    const node = el(id);
    if (!node) return;
    node.textContent = text;
    node.className = "gps-status-value " + (className || "");
  }

  function renderTop(instances) {
    const gps1 = instances[0];
    const gps2 = instances[1];
    const primary = getPrimaryInstance(instances);
    const rtk = getRtkSummary(instances);
    const connectionChip = el("gps-conn-chip");

    setText("gps-fw-tag", "Firmware: " + textOr("ov-fw-version", "Waiting"));
    setText("gps-board-tag", "Vehicle: " + textOr("ov-board-hardware", "Waiting"));

    if (connectionChip) {
      connectionChip.textContent = fcConnected() ? "Link connected" : "Link disconnected";
      connectionChip.className = "gps-chip " + (fcConnected() ? "gps-chip--ok" : "gps-chip--offline");
    }

    setStatusValue("gps-status-link", fcConnected() ? "Connected" : "Offline", fcConnected() ? "is-good" : "is-offline");
    setStatusValue("gps-status-gps1", gps1.enabled ? gps1.fixLabel : "Disabled", gps1.statusClass);
    setStatusValue("gps-status-gps2", gps2.enabled ? gps2.fixLabel : "Disabled", gps2.statusClass);
    setText("gps-status-sats", String((gps1.sats || 0) + (gps2.sats || 0) || "--"));
    setStatusValue(
      "gps-status-hdop",
      Number.isFinite(primary.eph) ? primary.eph.toFixed(2) : "--",
      Number.isFinite(primary.eph) ? (primary.eph < 2 ? "is-good" : primary.eph < 3 ? "is-warn" : "is-bad") : "is-muted"
    );
    setStatusValue("gps-status-rtk", rtk.label, rtk.className);
  }

  function buildRealtimeRows(instance) {
    return [
      ["Fix", instance.fixLabel],
      ["Lat/Lon", fmtLatLon(instance.lat, instance.lon)],
      ["Altitude", fmt(instance.altM, 2, " m")],
      ["Speed", fmt(instance.velMps, 2, " m/s")],
      ["h_acc", fmt(instance.hAccM, 3, " m")],
      ["v_acc", fmt(instance.vAccM, 3, " m")],
      ["vel_acc", fmt(instance.velAccMps, 3, " m/s")],
      ["HDOP", Number.isFinite(instance.eph) ? instance.eph.toFixed(2) : "--"],
      ["VDOP", Number.isFinite(instance.epv) ? instance.epv.toFixed(2) : "--"],
      ["Yaw", Number.isFinite(instance.yawDeg) && instance.yawDeg > 0 ? instance.yawDeg.toFixed(1) + " deg" : "--"],
    ];
  }

  function buildInstanceCard(instance) {
    const realtimeRows = buildRealtimeRows(instance);
    const metaProtocol = instance.typeValue === 9 || instance.typeValue === 22 || instance.typeValue === 23
      ? "DroneCAN"
      : "Serial";
    const freshnessLabel = instance.fresh ? "Live" : "Stale";
    const cardTone = instance.statusClass === "is-good"
      ? " is-good"
      : instance.statusClass === "is-warn"
        ? " is-warn"
        : instance.statusClass === "is-bad"
          ? " is-bad"
          : "";

    return (
      '<article class="gps-instance-card' + cardTone + '" data-gps-instance="' + instance.index + '">' +
        '<div class="gps-instance-head">' +
          '<div class="gps-instance-title">' +
            '<span class="gps-instance-eyebrow">GPS #' + (instance.index + 1) + "</span>" +
            '<div class="gps-instance-name">' + instance.typeLabel + "</div>" +
            '<div class="gps-instance-meta">' +
              '<span class="gps-inline-tag">' + metaProtocol + "</span>" +
              '<span class="gps-inline-tag">Sats ' + instance.sats + "</span>" +
              '<span class="gps-inline-tag">' + freshnessLabel + "</span>" +
            "</div>" +
          "</div>" +
          '<div class="gps-head-right">' +
            '<span class="gps-fix-badge ' + instance.statusClass + '">' + instance.fixLabel + "</span>" +
            '<div class="gps-signal-block">' + buildSignalBars(instance.sats) + "</div>" +
          "</div>" +
        "</div>" +
        '<div class="gps-instance-body">' +
          '<div class="gps-real-grid">' +
            realtimeRows.map((row) => {
              return '<div class="gps-kv"><span>' + row[0] + "</span><strong>" + row[1] + "</strong></div>";
            }).join("") +
          "</div>" +
          '<div class="gps-fields-grid">' +
            '<label class="gps-field"><span>Receiver Type</span><select id="gps-type-' + instance.index + '"></select></label>' +
            '<label class="gps-field"><span>Update Rate</span><select id="gps-rate-' + instance.index + '"></select></label>' +
            '<label class="gps-field"><span>GNSS Modes</span><div id="gps-gnss-' + instance.index + '" class="gps-check-grid"></div></label>' +
            (instance.index === 0
              ? '<label class="gps-field"><span>HDOP Good</span><input id="gps-hdop-good" type="number" step="1"></label>' +
                '<label class="gps-field"><span>Min Satellites</span><input id="gps-min-sats" type="number" step="1"></label>' +
                '<label class="gps-field"><span>Auto Config</span><select id="gps-auto-config"></select></label>' +
                '<label class="gps-field"><span>SBAS</span><select id="gps-sbas-mode"></select></label>'
              : "") +
          "</div>" +
        "</div>" +
        '<div class="gps-instance-foot">' +
          '<div class="gps-constellation-grid">' + buildConstellationChips(instance.gnssMask) + "</div>" +
          '<div class="gps-card-head">' +
            '<p class="muted">Last telemetry: ' + formatAge(instance.lastUpdateMs) + '. Card write only sends fields owned by this receiver card.</p>' +
            '<button type="button" class="gps-card-action" data-write-instance="' + instance.index + '">Write Card</button>' +
          "</div>" +
        "</div>" +
      "</article>"
    );
  }

  function buildEmptyGps2Card() {
    return (
      '<article class="gps-instance-card" data-gps-instance="1">' +
        '<div class="gps-instance-head">' +
          '<div class="gps-instance-title">' +
            '<span class="gps-instance-eyebrow">GPS #2</span>' +
            '<div class="gps-instance-name">Secondary receiver disabled</div>' +
          "</div>" +
        "</div>" +
        '<div class="gps-instance-empty">' +
          '<div class="gps-empty-title">Enable GPS2</div>' +
          '<div class="gps-empty-copy">GPS_TYPE2 is 0. Enable it to use dual GPS blending, redundancy, or moving-baseline heading.</div>' +
          '<label class="gps-field"><span>Receiver Type</span><select id="gps2-enable-type"></select></label>' +
          '<button type="button" id="gps2-enable-btn" class="gps-enable-btn">Enable GPS2</button>' +
        "</div>" +
      "</article>"
    );
  }

  function renderInstanceControls(instances) {
    instances.forEach((instance) => {
      if (!instance.enabled && instance.index === 1) return;
      renderSelect(el("gps-type-" + instance.index), TYPE_OPTIONS, getDraftValue(instance.typeKey));
      renderSelect(el("gps-rate-" + instance.index), RATE_OPTIONS, getDraftValue(instance.rateKey));
      renderBitmask(el("gps-gnss-" + instance.index), instance.gnssKey, CONSTELLATIONS, instance.gnssMask);
    });

    renderSelect(el("gps-auto-config"), AUTO_CONFIG_OPTIONS, getDraftValue("GPS_AUTO_CONFIG"));
    renderSelect(el("gps-sbas-mode"), SBAS_OPTIONS, getDraftValue("GPS_SBAS_MODE"));

    const hdopInput = el("gps-hdop-good");
    const minSatsInput = el("gps-min-sats");
    if (hdopInput) hdopInput.value = String(Number(getDraftValue("GPS_HDOP_GOOD")) || DEFAULTS.GPS_HDOP_GOOD);
    if (minSatsInput) minSatsInput.value = String(Number(getDraftValue("GPS_MIN_SATS")) || DEFAULTS.GPS_MIN_SATS);

    const gps2Enable = el("gps2-enable-type");
    if (gps2Enable) {
      renderSelect(gps2Enable, TYPE_OPTIONS.filter((item) => item.value !== 0), 9);
    }
  }

  function renderInstances(instances) {
    const host = el("gps-instance-grid");
    if (!host) return;

    const html = instances.map((instance) => {
      if (instance.index === 1 && !instance.enabled) {
        return buildEmptyGps2Card();
      }
      return buildInstanceCard(instance);
    }).join("");

    host.innerHTML = html;
    renderInstanceControls(instances);

    const gps2EnableBtn = el("gps2-enable-btn");
    if (gps2EnableBtn) {
      gps2EnableBtn.addEventListener("click", () => {
        const nextType = Number(el("gps2-enable-type")?.value || 9);
        setDraftValue("GPS_TYPE2", nextType);
        render(true);
      });
    }

    host.querySelectorAll("[data-write-instance]").forEach((button) => {
      button.addEventListener("click", () => {
        const instanceIndex = Number(button.getAttribute("data-write-instance"));
        writeKeys(INSTANCE_KEYS[instanceIndex] || [], instanceIndex === 0 ? "GPS1" : "GPS2");
      });
    });
  }

  function renderLowerCards() {
    OFFSET_KEYS.forEach((key) => {
      const selector = document.querySelector('[data-param-key="' + key + '"]');
      if (selector) {
        selector.value = String(Number(getDraftValue(key)) || 0);
      }
    });

    renderSelect(el("gps-auto-switch"), AUTO_SWITCH_OPTIONS, getDraftValue("GPS_AUTO_SWITCH"));
    renderSelect(el("gps-primary"), PRIMARY_OPTIONS, getDraftValue("GPS_PRIMARY"));
    renderSelect(el("gps-inject-to"), INJECT_OPTIONS, getDraftValue("GPS_INJECT_TO"));
    renderSelect(el("gps-navfilter"), NAVFILTER_OPTIONS, getDraftValue("GPS_NAVFILTER"));
    renderSelect(el("gps-save-cfg"), SAVE_CFG_OPTIONS, getDraftValue("GPS_SAVE_CFG"));
    renderBitmask(el("gps-blend-mask"), "GPS_BLEND_MASK", BLEND_MASK_OPTIONS, getBitmaskValue("GPS_BLEND_MASK", BLEND_MASK_OPTIONS));
    renderBitmask(el("gps-drv-options"), "GPS_DRV_OPTIONS", DRV_OPTIONS, getBitmaskValue("GPS_DRV_OPTIONS", DRV_OPTIONS));
  }

  function renderRail(instances) {
    const primary = getPrimaryInstance(instances);
    const rtk = getRtkSummary(instances);
    const warningText = textOr("ov-global-warning", "");
    const hdopWidth = Number.isFinite(primary.eph) ? Math.max(0, Math.min(100, ((4 - Math.min(primary.eph, 4)) / 4) * 100)) : 0;
    const vdopWidth = Number.isFinite(primary.epv) ? Math.max(0, Math.min(100, ((4 - Math.min(primary.epv, 4)) / 4) * 100)) : 0;
    const lastAge = rtk.ageSec != null && Number.isFinite(rtk.ageSec)
      ? String(rtk.ageSec) + "s"
      : "--";
    const latency = rtk.latencyMs != null && Number.isFinite(rtk.latencyMs)
      ? String(rtk.latencyMs) + " ms"
      : "--";

    setText("gps-rtk-source", rtk.label);
    setText("gps-rtk-inject", rtk.injectLabel);
    setText("gps-rtk-last", rtk.lastCorrectionMs ? formatAge(rtk.lastCorrectionMs) : "--");
    setText("gps-rtk-age", lastAge + " / " + latency);
    setText("gps-hdop-rail", Number.isFinite(primary.eph) ? primary.eph.toFixed(2) : "--");
    setText("gps-vdop-rail", Number.isFinite(primary.epv) ? primary.epv.toFixed(2) : "--");
    setText("gps-hacc-rail", fmt(primary.hAccM, 3, " m"));
    setText("gps-primary-snapshot", Number(getDraftValue("GPS_PRIMARY")) === 1 ? "GPS2" : "GPS1");
    setText("gps-yaw-snapshot", Number.isFinite(primary.yawDeg) && primary.yawDeg > 0 ? primary.yawDeg.toFixed(1) + " deg" : "Unavailable");
    setText("gps-latlon-snapshot", fmtLatLon(primary.lat, primary.lon));
    setText("gps-altvel-snapshot", fmt(primary.altM, 1, " m") + " / " + fmt(primary.velMps, 1, " m/s"));
    setText("gps-prearm-summary", warningText || "No additional prearm warnings.");

    const hdopBar = el("gps-hdop-bar");
    const vdopBar = el("gps-vdop-bar");
    if (hdopBar) hdopBar.style.width = hdopWidth + "%";
    if (vdopBar) vdopBar.style.width = vdopWidth + "%";

    const list = el("gps-prearm-list");
    if (list) {
      list.innerHTML = warningText
        ? '<div class="gps-alert-item is-warn">' + warningText + "</div>"
        : '<div class="gps-alert-item">No pending prearm warnings.</div>';
    }
  }

  function updateFieldDirtyStyles() {
    document.querySelectorAll("#setup-panel-params input, #setup-panel-params select").forEach((node) => {
      const key = node.getAttribute("data-param-key") || PARAM_ID_MAP[node.id];
      if (!key) return;
      node.classList.toggle("gps-field-dirty", state.drafts.has(key));
    });
  }

  function updateDirtyUi() {
    updateFieldDirtyStyles();

    const dirtyCount = state.drafts.size;
    setText("gps-dirty-count", dirtyCount > 0 ? ("Unsaved changes: " + dirtyCount) : "No unsaved changes");
    setText(
      "gps-footer-note",
      dirtyCount > 0
        ? "Card write sends only that card. Global write sends every pending GPS change."
        : "Drafts are clean. Refresh to re-read params or keep editing locally."
    );

    const writeAllBtn = el("gps-write-all-btn");
    if (writeAllBtn) {
      writeAllBtn.disabled = !fcConnected() || dirtyCount === 0;
    }
  }

  function refreshRequestedParams(keys) {
    if (typeof window.requestParamByName !== "function") return Promise.resolve();
    return keys.reduce((promise, key) => {
      return promise.then(() => window.requestParamByName(key).catch(() => {}));
    }, Promise.resolve());
  }

  async function writeKeys(keys, label) {
    const status = el("gps-write-status");
    const pending = keys
      .filter((key) => state.drafts.has(key))
      .map((key) => ({ key, value: state.drafts.get(key) }));

    if (!fcConnected()) {
      if (status) {
        status.textContent = "Flight controller is disconnected. Write is blocked.";
        status.className = "muted gps-write-status is-bad";
      }
      return;
    }

    if (!pending.length) {
      if (status) {
        status.textContent = label + ": no pending changes.";
        status.className = "muted gps-write-status";
      }
      return;
    }

    if (status) {
      status.textContent = label + ": writing " + pending.length + " params...";
      status.className = "muted gps-write-status is-warn";
    }

    let sent = 0;
    for (const item of pending) {
      try {
        const ok = await window.sendParamSet(item.key, item.value);
        if (ok) {
          sent += 1;
          if (window.params instanceof Map) {
            window.params.set(item.key, Number(item.value));
          }
          state.drafts.delete(item.key);
        }
      } catch (_) {
        // keep aggregate status only
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }

    persistDrafts();
    updateDirtyUi();
    await refreshRequestedParams(keys);

    if (status) {
      status.textContent = label + ": wrote " + sent + "/" + pending.length + " params.";
      status.className = "muted gps-write-status " + (sent === pending.length ? "is-ok" : "is-warn");
    }

    render(true);
  }

  async function refreshParams() {
    state.drafts.clear();
    persistDrafts();
    if (typeof window.loadParams === "function") {
      await window.loadParams({ force: true }).catch(() => {});
    }
    render(true);
  }

  function restoreDefaults() {
    Object.entries(DEFAULTS).forEach(([key, value]) => {
      setDraftValue(key, value);
    });
    render(true);
    const status = el("gps-write-status");
    if (status) {
      status.textContent = "Recommended defaults staged locally. Write to FC to apply them.";
      status.className = "muted gps-write-status is-warn";
    }
  }

  function saveLocalOnly() {
    persistDrafts();
    const status = el("gps-write-status");
    if (status) {
      status.textContent = "Drafts saved locally in this browser.";
      status.className = "muted gps-write-status is-ok";
    }
  }

  function toggleSetupPanel(panel) {
    document.querySelectorAll(".ov-panel").forEach((node) => {
      node.classList.toggle("active", node.id === "setup-panel-" + panel);
    });
    window.dispatchEvent(new CustomEvent("gcs:setup-panel-changed", { detail: { panel } }));
  }

  function bindStaticActions() {
    el("gps-open-rtk-inline")?.addEventListener("click", () => toggleSetupPanel(RTK_PANEL));
    el("gps-open-rtk-rail")?.addEventListener("click", () => toggleSetupPanel(RTK_PANEL));
    el("gps-refresh-btn")?.addEventListener("click", () => {
      refreshParams();
    });
    el("gps-save-local-btn")?.addEventListener("click", () => saveLocalOnly());
    el("gps-restore-default-btn")?.addEventListener("click", () => restoreDefaults());
    el("gps-write-all-btn")?.addEventListener("click", () => {
      writeKeys(Array.from(state.drafts.keys()), "Global GPS");
    });
    el("gps-write-offset-btn")?.addEventListener("click", () => writeKeys(OFFSET_KEYS, "Offsets"));
    el("gps-write-blend-btn")?.addEventListener("click", () => writeKeys(BLEND_KEYS, "Dual GPS"));
    el("gps-write-advanced-btn")?.addEventListener("click", () => writeKeys(ADVANCED_KEYS, "Advanced"));
  }

  function collectBitmaskFromGroup(group) {
    return Array.from(group.querySelectorAll("input[data-mask-bit]")).reduce((sum, input) => {
      return sum + (input.checked ? (1 << Number(input.getAttribute("data-mask-bit"))) : 0);
    }, 0);
  }

  function bindDynamicControls() {
    document.querySelectorAll("#setup-panel-params input[type='number']").forEach((input) => {
      if (input.dataset.bound === "1") return;
      input.dataset.bound = "1";
      input.addEventListener("input", () => {
        const key = input.getAttribute("data-param-key") || PARAM_ID_MAP[input.id];
        if (!key) return;
        setDraftValue(key, Number(input.value));
        updateDirtyUi();
      });
    });

    document.querySelectorAll("#setup-panel-params select").forEach((select) => {
      if (select.dataset.bound === "1") return;
      select.dataset.bound = "1";
      select.addEventListener("change", () => {
        const key = select.getAttribute("data-param-key") || PARAM_ID_MAP[select.id];
        if (!key) return;
        setDraftValue(key, Number(select.value));
        updateDirtyUi();
        render(true);
      });
    });

    document.querySelectorAll("#setup-panel-params input[data-mask-bit]").forEach((input) => {
      if (input.dataset.bound === "1") return;
      input.dataset.bound = "1";
      input.addEventListener("change", () => {
        const key = input.getAttribute("data-mask-key");
        const group = input.closest(".gps-check-grid");
        if (!key || !group) return;
        setDraftValue(key, collectBitmaskFromGroup(group));
        updateDirtyUi();
        render(true);
      });
    });
  }

  function render(force) {
    if (!state.mounted) return;
    if (!force && !state.panelActive) return;

    const instances = getInstances();
    renderTop(instances);
    renderInstances(instances);
    renderLowerCards();
    renderRail(instances);
    bindDynamicControls();
    updateDirtyUi();
  }

  function mount() {
    if (!el("setup-panel-params")) return;

    state.mounted = true;
    loadDrafts();
    bindStaticActions();
    state.panelActive = document.querySelector(".ov-nav-item.active[data-setup-panel='params']") != null;

    window.addEventListener("gcs:setup-panel-changed", (event) => {
      state.panelActive = event.detail?.panel === GPS_PANEL;
      if (state.panelActive) render(true);
    });

    document.addEventListener("gcs-connection", () => render(true));
    document.addEventListener("gcs-prearm-hint", () => render(true));
    setInterval(() => render(false), 1000);

    render(true);
  }

  window.gpsSetupOpenPanel = toggleSetupPanel;
  window.gpsSetupRender = render;
  window.gpsSetupGetDraftValue = getDraftValue;
  window.gpsSetupSetDraftValue = function gpsSetupSetDraftValue(key, value) {
    setDraftValue(key, value);
    render(true);
  };
  window.gpsSetupClearDrafts = clearDraftsForKeys;

  window.addEventListener("DOMContentLoaded", mount);
})();
