(function initAirframeSetup() {
  const ORIENT_OPTIONS = [
    { value: 0, key: "ROTATION_NONE", rx: 58, ry: 0, rz: 0 },
    { value: 2, key: "ROTATION_YAW_90", rx: 58, ry: 0, rz: 90 },
    { value: 4, key: "ROTATION_YAW_180", rx: 58, ry: 0, rz: 180 },
    { value: 6, key: "ROTATION_YAW_270", rx: 58, ry: 0, rz: 270 },
    { value: 8, key: "ROTATION_ROLL_180", rx: 238, ry: 0, rz: 0 },
  ];

  const MAV_TYPE_FIXED_WING = 1;
  const MAV_TYPE_VTOL_TYPES = new Set([19, 20, 21]);
  const MAV_TYPE_COPTER_TYPES = new Set([2, 3, 4, 7, 8, 9, 12, 13, 14, 15, 16, 17]);

  /** ArduCopter FRAME_CLASS锛堜笌椋炴帶鍙傛暟璇存槑涓€鑷达級 */
  const FRAME_CLASS_OPTIONS = [
    { id: 1, name: "Quad", label: "???", icon: "4" },
    { id: 2, name: "Hexa", label: "???", icon: "6" },
    { id: 3, name: "Octa", label: "???", icon: "8" },
    { id: 4, name: "OctaQuad", label: "鍏辫酱鍏酱", icon: "8脳2" },
    { id: 5, name: "Y6", label: "Y6", icon: "Y6" },
    { id: 6, name: "Heli", label: "?????", icon: "H" },
    { id: 7, name: "Tri", label: "???", icon: "3" },
    { id: 8, name: "SingleCopter", label: "???", icon: "1" },
    { id: 9, name: "CoaxCopter", label: "????", icon: "CC" },
    { id: 10, name: "BiCopter", label: "???", icon: "2" },
    { id: 11, name: "Heli_Dual", label: "鍙屾棆缈肩洿鍗囨満", icon: "H脳2" },
    { id: 12, name: "DodecaHexa", label: "????", icon: "12" },
    { id: 13, name: "HeliQuad", label: "??????", icon: "HQ" },
    { id: 14, name: "Deca", label: "???", icon: "10" },
    { id: 15, name: "Scripting Matrix", label: "????", icon: "SM" },
    { id: 16, name: "6DoF Scripting", label: "6DoF 鑴氭湰", icon: "6D" },
    { id: 17, name: "Dynamic Scripting", label: "鍔ㄦ€佽剼鏈煩闃?, icon: "鈭? },
  ];

  const FRAME_TYPE_NAMES = {
    0: "Plus",
    1: "X",
    2: "V",
    3: "H",
    4: "V-Tail",
    5: "A-Tail",
    10: "Y6B",
    11: "Y6F",
    12: "BetaFlightX",
    13: "DJIX",
    14: "ClockwiseX",
    15: "I",
    18: "BetaFlightXReversed",
    19: "Y4",
  };

  /** 鏈烘灦绫诲瀷鍗＄墖绀烘剰鍥撅紙鍐呰仈 SVG锛寁iewBox 80脳56锛?*/
  function buildFrameClassIconSvg(classId) {
    const cx = 40;
    const cy = 30;
    const hub = `<circle cx="${cx}" cy="${cy}" r="3.5" fill="#64748b"/>`;
    const arm = (a1, len, w = 1.2) => {
      const rad = (a1 * Math.PI) / 180;
      const x2 = cx + len * Math.sin(rad);
      const y2 = cy - len * Math.cos(rad);
      return `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="#5b6b8f" stroke-width="${w}"/>`;
    };
    const prop = (a1, len, r = 4.5, fill = "#38bdf8") => {
      const rad = (a1 * Math.PI) / 180;
      const px = cx + len * Math.sin(rad);
      const py = cy - len * Math.cos(rad);
      return `${arm(a1, len)}<circle cx="${px}" cy="${py}" r="${r}" fill="${fill}" fill-opacity="0.35" stroke="${fill}" stroke-width="1.4"/>`;
    };
    const ring = (count, len, offset = 0) => {
      const step = 360 / count;
      let s = "";
      for (let i = 0; i < count; i += 1) s += prop(offset + i * step, len, 4, "#38bdf8");
      return s;
    };
    const coaxProp = (a1, len) => {
      const rad = (a1 * Math.PI) / 180;
      const px = cx + len * Math.sin(rad);
      const py = cy - len * Math.cos(rad);
      return `${arm(a1, len)}<circle cx="${px}" cy="${py - 5}" r="3.8" fill="#38bdf8" fill-opacity="0.25" stroke="#38bdf8" stroke-width="1.2"/><circle cx="${px}" cy="${py + 5}" r="3.8" fill="#34d399" fill-opacity="0.25" stroke="#34d399" stroke-width="1.2"/>`;
    };

    let body = "";
    switch (classId) {
      case 1:
        body = ring(4, 20, 45);
        break;
      case 2:
        body = ring(6, 20);
        break;
      case 3:
        body = ring(8, 20);
        break;
      case 4:
        body = [0, 90, 180, 270].map((a) => coaxProp(a, 20)).join("");
        break;
      case 5:
        body = `${prop(0, 20)}${prop(135, 18)}${prop(225, 18)}${prop(135, 12, 3.2)}${prop(225, 12, 3.2)}${prop(0, 12, 3.2, "#34d399")}`;
        break;
      case 6:
        body = `<rect x="34" y="32" width="12" height="16" rx="2" fill="#475569"/><line x1="40" y1="32" x2="40" y2="14" stroke="#94a3b8" stroke-width="1.2"/><circle cx="40" cy="10" r="8" fill="none" stroke="#38bdf8" stroke-width="1.6"/><line x1="32" y1="10" x2="48" y2="10" stroke="#38bdf8" stroke-width="1.2"/><line x1="40" y1="2" x2="40" y2="18" stroke="#38bdf8" stroke-width="1.2"/>`;
        break;
      case 7:
        body = ring(3, 20, 0);
        break;
      case 8:
        body = `<circle cx="40" cy="18" r="11" fill="none" stroke="#38bdf8" stroke-width="1.6"/><rect x="36" y="28" width="8" height="14" rx="2" fill="#475569"/>`;
        break;
      case 9:
        body = `<circle cx="40" cy="22" r="7" fill="none" stroke="#38bdf8" stroke-width="1.4"/><circle cx="40" cy="34" r="7" fill="none" stroke="#34d399" stroke-width="1.4"/><rect x="37" y="38" width="6" height="10" rx="1" fill="#475569"/>`;
        break;
      case 10:
        body = `<circle cx="26" cy="30" r="9" fill="none" stroke="#38bdf8" stroke-width="1.4"/><circle cx="54" cy="30" r="9" fill="none" stroke="#34d399" stroke-width="1.4"/>`;
        break;
      case 11:
        body = `<g transform="translate(-10,0)">${`<circle cx="28" cy="16" r="6" fill="none" stroke="#38bdf8" stroke-width="1.2"/><rect x="26" y="22" width="4" height="10" fill="#475569"/>`}</g><g transform="translate(10,0)">${`<circle cx="52" cy="16" r="6" fill="none" stroke="#34d399" stroke-width="1.2"/><rect x="50" y="22" width="4" height="10" fill="#475569"/>`}</g>`;
        break;
      case 12:
        body = ring(12, 20);
        break;
      case 13:
        body = `${ring(4, 18, 45)}<circle cx="40" cy="30" r="5" fill="none" stroke="#f59e0b" stroke-width="1.2"/>`;
        break;
      case 14:
        body = ring(10, 20);
        break;
      case 15:
        body = Array.from({ length: 9 }, (_, i) => {
          const col = i % 3;
          const row = Math.floor(i / 3);
          return `<rect x="${24 + col * 12}" y="${14 + row * 10}" width="8" height="6" rx="1" fill="#38bdf8" fill-opacity="0.35" stroke="#38bdf8" stroke-width="0.8"/>`;
        }).join("");
        break;
      case 16:
        body = `<circle cx="40" cy="30" r="10" fill="none" stroke="#a78bfa" stroke-width="1.2"/>${[[1,0],[-1,0],[0,1],[0,-1],[0.7,0.7],[-0.7,0.7]].map(([dx, dy]) => `<line x1="40" y1="30" x2="${40 + dx * 14}" y2="${30 - dy * 14}" stroke="#a78bfa" stroke-width="1"/>`).join("")}`;
        break;
      case 17:
        body = `<path d="M22 38 Q40 18 58 38" fill="none" stroke="#f472b6" stroke-width="1.2"/><path d="M22 22 Q40 42 58 22" fill="none" stroke="#38bdf8" stroke-width="1.2"/>${ring(4, 14, 45)}`;
        break;
      default:
        body = hub;
    }
    if (![6, 8, 9, 10, 11, 15, 16, 17].includes(classId)) {
      body = hub + body;
    }
    return `<svg class="af-class-fig-svg" viewBox="0 0 80 56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
  }

  const HELICOPTER_CLASSES = new Set([6, 11]);
  const SCRIPTING_CLASSES = new Set([15, 16, 17]);
  const DEFAULT_TYPE_BY_CLASS = {
    1: 1,
    2: 1,
    3: 1,
    4: 1,
    5: 10,
    7: 0,
    12: 1,
    13: 1,
    14: 1,
  };

  const FIXED_WING_PRESETS = [
    {
      id: "conventional",
      label: "???",
      shortLabel: "???",
      family: "plane",
      icon: "CT",
      accent: "#60a5fa",
      summary: "????????????????????",
      badges: ["??", "??", "???"],
      details: [
        "???????????????????",
        "????????????????? Servo Function?",
      ],
    },
    {
      id: "elevon",
      label: "椋炵考 / Elevon",
      shortLabel: "椋炵考",
      family: "plane",
      icon: "EV",
      accent: "#22c55e",
      summary: "???? elevon ??????????",
      badges: ["???", "??", "??"],
      details: [
        "????????????????",
        "?????? Elevon Left / Right Servo Function?",
      ],
    },
    {
      id: "vtail",
      label: "V?",
      shortLabel: "V?",
      family: "plane",
      icon: "VT",
      accent: "#f59e0b",
      summary: "??????????????????",
      badges: ["鍑忛樆", "杞婚噺", "娣锋帶"],
      details: [
        "???????????????",
        "?????? V-Tail Left / Right Servo Function?",
      ],
    },
    {
      id: "quadplane",
      label: "QuadPlane",
      shortLabel: "QuadPlane",
      family: "vtol",
      icon: "QP",
      accent: "#a78bfa",
      summary: "?????????????????????",
      badges: ["鍨傝捣", "宸¤埅", "Q_FRAME"],
      details: [
        "?????????????????",
        "?????? Q_FRAME_CLASS / Q_FRAME_TYPE?",
      ],
    },
    {
      id: "tailsitter",
      label: "TailSitter",
      shortLabel: "TailSitter",
      family: "vtol",
      icon: "TS",
      accent: "#f97316",
      summary: "??????????????????",
      badges: ["???", "????", "Q_TAILSIT"],
      details: [
        "????????????? VTOL ???",
        "?????? Q_TAILSIT_ENABLE ????????",
      ],
    },
    {
      id: "tiltrotor",
      label: "TiltRotor",
      shortLabel: "TiltRotor",
      family: "vtol",
      icon: "TR",
      accent: "#ef4444",
      summary: "?????????????????????",
      badges: ["??", "??", "Q_TILT"],
      details: [
        "?????????????? VTOL ???",
        "?????? Q_TILT_ENABLE ????????",
      ],
    },
  ];

  const FIXED_WING_PRESET_MAP = new Map(FIXED_WING_PRESETS.map((preset) => [preset.id, preset]));
  const FIXED_WING_LAYOUT_PRESETS = FIXED_WING_PRESETS.filter((preset) => preset.family === "plane");
  const VTOL_MODE_PRESETS = FIXED_WING_PRESETS.filter((preset) => preset.family === "vtol");

  const state = {
    firmware: { kind: "unknown", copterUi: false, title: "???????", hint: "" },
    frameClass: null,
    frameType: null,
    frameMap: null,
    planePreset: "conventional",
    vtolPreset: "quadplane",
    qEnable: 0,
    ahrsOrient: 0,
    pitch: 0,
    yaw: 0,
    dirty: false,
  };

  function fixedWingPresetById(id) {
    return FIXED_WING_PRESET_MAP.get(id) || FIXED_WING_PRESET_MAP.get("conventional");
  }

  function defaultFixedWingPreset(kind) {
    return kind === "vtol" ? "quadplane" : "conventional";
  }

  function currentFixedWingPreset() {
    return fixedWingPresetById(state.planePreset);
  }

  function currentVtolPreset() {
    return fixedWingPresetById(state.vtolPreset);
  }

  function usesFixedWingPresetUi() {
    return state.firmware.kind === "plane" || state.firmware.kind === "vtol";
  }

  function selectFixedWingPreset(id) {
    state.planePreset = fixedWingPresetById(id).id;
    renderAll();
  }

  function selectVtolPreset(id) {
    state.vtolPreset = fixedWingPresetById(id).id;
    state.qEnable = 1;
    setDirty(true);
    renderAll();
  }

  function selectQEnable(enabled) {
    state.qEnable = enabled ? 1 : 0;
    if (!enabled) state.vtolPreset = "quadplane";
    setDirty(true);
    renderAll();
  }

  function heartbeatFirmwareKind() {
    const t = Math.round(Number(window.fcMavType));
    if (t === MAV_TYPE_FIXED_WING) return "plane";
    if (MAV_TYPE_VTOL_TYPES.has(t)) return "vtol";
    if (MAV_TYPE_COPTER_TYPES.has(t)) return "copter";
    return "";
  }

  function detectFirmwareProfile() {
    const fwText = (document.getElementById("ov-fw-version")?.textContent || "").trim();
    const hbKind = heartbeatFirmwareKind();
    const p = window.params instanceof Map ? window.params : null;
    const hasFrame = !!(p && p.has("FRAME_CLASS") && p.has("FRAME_TYPE"));
    const hasQ = !!(p && p.has("Q_FRAME_CLASS") && p.has("Q_FRAME_TYPE"));
    const fwLow = fwText.toLowerCase();
    const fwPlane = /plane|arduplane/.test(fwLow);
    const fwCopter = /copter|arducopter/.test(fwLow);
    const fwVtol = /vtol|quadplane/.test(fwLow);

    if (hbKind === "vtol" || hasQ || fwVtol) return { kind: "vtol", hasFrame, hasQ, fwText };
    if (hbKind === "plane" || (fwPlane && !fwVtol)) return { kind: "plane", hasFrame, hasQ, fwText };
    if (hbKind === "copter" || fwCopter || (hasFrame && !hasQ)) return { kind: "copter", hasFrame, hasQ, fwText };
    return { kind: "unknown", hasFrame, hasQ, fwText };
  }

  function getFrameParamKeys() {
    const p = window.params;
    if (!(p instanceof Map)) return null;
    if (p.has("FRAME_CLASS") && p.has("FRAME_TYPE")) {
      return { classKey: "FRAME_CLASS", typeKey: "FRAME_TYPE" };
    }
    if (p.has("Q_FRAME_CLASS") && p.has("Q_FRAME_TYPE")) {
      return { classKey: "Q_FRAME_CLASS", typeKey: "Q_FRAME_TYPE" };
    }
    return null;
  }

  function getParamNum(name) {
    const p = window.params;
    if (!(p instanceof Map) || !p.has(name)) return null;
    const v = Number(p.get(name));
    return Number.isFinite(v) ? v : null;
  }

  function classLabel(id) {
    const row = FRAME_CLASS_OPTIONS.find((c) => c.id === id);
    return row ? row.label : `CLASS ${id}`;
  }

  function typeLabel(id) {
    return FRAME_TYPE_NAMES[id] || `TYPE ${id}`;
  }

  function usesFrameType(frameClass) {
    const fc = Math.round(Number(frameClass));
    return !HELICOPTER_CLASSES.has(fc) && !SCRIPTING_CLASSES.has(fc);
  }

  function detectFirmware() {
    const prof = detectFirmwareProfile();
    const fwText = prof.fwText;
    const hasFrame = prof.hasFrame;
    const hasQ = prof.hasQ;
    const kind = prof.kind;

    if (kind === "plane") {
      return {
        kind: "plane",
        copterUi: false,
        icon: "???",
        title: fwText && !/??|??/.test(fwText) ? fwText : "ArduPlane ? ?????",
        hint: "???????????????? IMU ??????????????????????????????",
      };
    }
    if (kind === "vtol") {
      return {
        kind: "vtol",
        copterUi: false,
        icon: "鉁堬笍",
        title: fwText || "ArduPlane VTOL",
        hint: "????????????? Q_FRAME_* ?????????????????",
      };
    }
    if (kind === "copter" || /copter/i.test(fwText) || (hasFrame && !hasQ)) {
      return {
        kind: "copter",
        copterUi: true,
        icon: "馃浉",
        title: fwText && !/??|??/.test(fwText) ? fwText : "ArduCopter ? ?????",
        hint: "",
      };
    }
    if (/rover|boat|sub/i.test(fwText)) {
      return {
        kind: "rover",
        copterUi: false,
        icon: "馃殫",
        title: fwText || "ArduRover / 鍏朵粬",
        hint: "鏈〉鏈烘灦閫夊瀷闈㈠悜 ArduCopter锛涘綋鍓嶅浐浠朵笉閫傜敤 FRAME_CLASS 鐭╅樀鏈烘灦",
      };
    }
    if (window.fcMavType === 2 && hasFrame) {
      return {
        kind: "copter",
        copterUi: true,
        icon: "馃浉",
        title: "ArduCopter锛堟帹鏂級",
        hint: "???? FRAME_CLASS ??????????????",
      };
    }
    return {
      kind: "unknown",
      copterUi: false,
      icon: "馃攲",
      title: "???????",
      hint: "?????????????? ArduCopter?ArduPlane ??????",
    };
  }

  function mapsForClass(frameClass) {
    if (typeof window.getMotorMapsForClass !== "function") return [];
    return window.getMotorMapsForClass(frameClass);
  }

  function getTypeOptionsForClass(frameClass) {
    const maps = mapsForClass(frameClass);
    const byType = new Map();
    maps.forEach((m) => {
      byType.set(m.frameType, {
        frameType: m.frameType,
        label: m.name,
        hasMap: true,
        mapName: m.name,
      });
    });
    if (frameClass === 5) {
      [10, 11].forEach((t) => {
        if (!byType.has(t)) {
          byType.set(t, { frameType: t, label: typeLabel(t), hasMap: false, mapName: null });
        }
      });
    }
    if (byType.size === 0 && usesFrameType(frameClass)) {
      Object.entries(FRAME_TYPE_NAMES).forEach(([k, name]) => {
        const t = Number(k);
        byType.set(t, { frameType: t, label: name, hasMap: false, mapName: null });
      });
    }
    return [...byType.values()].sort((a, b) => a.frameType - b.frameType);
  }

  function refreshFrameMap() {
    const mapGetter = window.getMotorMapByFrame;
    state.frameMap =
      typeof mapGetter === "function" && state.frameClass != null && state.frameType != null
        ? mapGetter(state.frameClass, state.frameType)
        : null;
  }

  function setDirty(v) {
    state.dirty = !!v;
    const btn = document.getElementById("af-write-btn");
    if (!btn) return;
    btn.classList.toggle("pending", state.dirty);
    const planeMode = state.firmware.kind === "plane";
    btn.textContent = state.dirty
      ? planeMode
        ? "?????????????????"
        : "?????????????????"
      : planeMode
        ? "?????????"
        : "鍐欏叆骞堕噸鍚鎺?(Write & Reboot)";
  }

  function orientByValue(v) {
    const n = Math.round(Number(v));
    return ORIENT_OPTIONS.find((o) => o.value === n) || ORIENT_OPTIONS[0];
  }

  function syncFromParams() {
    const keys = getFrameParamKeys();
    state.firmware = detectFirmware();
    if (state.firmware.kind === "plane" || state.firmware.kind === "vtol") {
      const activePreset = fixedWingPresetById(state.planePreset);
      if (activePreset.family !== state.firmware.kind) {
        state.planePreset = defaultFixedWingPreset(state.firmware.kind);
      }
      const activeVtolPreset = fixedWingPresetById(state.vtolPreset);
      if (activeVtolPreset.family !== "vtol") {
        state.vtolPreset = "quadplane";
      }
      state.vtolPreset = inferVtolPresetFromParams();
    }
    const qEnable = getParamNum("Q_ENABLE");
    if (qEnable != null) state.qEnable = qEnable > 0 ? 1 : 0;
    if (state.firmware.kind === "plane") {
      state.frameClass = null;
      state.frameType = null;
    } else if (keys) {
      const fc = getParamNum(keys.classKey);
      const ft = getParamNum(keys.typeKey);
      if (fc != null) state.frameClass = Math.round(fc);
      if (ft != null) state.frameType = Math.round(ft);
    }
    const orient = getParamNum("AHRS_ORIENT");
    if (orient != null) state.ahrsOrient = Math.round(orient);
    refreshFrameMap();
  }

  function selectFrameClass(fc) {
    state.frameClass = fc;
    if (HELICOPTER_CLASSES.has(fc) || SCRIPTING_CLASSES.has(fc)) {
      const keys = getFrameParamKeys();
      const ftKey = keys?.typeKey || "FRAME_TYPE";
      state.frameType = HELICOPTER_CLASSES.has(fc) ? getParamNum(ftKey) ?? 0 : 0;
    } else if (usesFrameType(fc)) {
      const opts = getTypeOptionsForClass(fc);
      const cur = state.frameType;
      const stillValid = opts.some((o) => o.frameType === cur);
      if (!stillValid) {
        const def = DEFAULT_TYPE_BY_CLASS[fc];
        state.frameType = def != null ? def : opts[0]?.frameType ?? 1;
      }
    }
    refreshFrameMap();
    setDirty(true);
    renderAll();
  }

  function selectFrameType(ft) {
    state.frameType = ft;
    refreshFrameMap();
    setDirty(true);
    renderAll();
  }

  function inferVtolPresetFromParams() {
    const tailsit = getParamNum("Q_TAILSIT_ENABLE");
    const tilt = getParamNum("Q_TILT_ENABLE");
    if (tilt != null && tilt > 0) return "tiltrotor";
    if (tailsit != null && tailsit > 0) return "tailsitter";
    return "quadplane";
  }

  function renderFirmwareBanner() {
    const banner = document.getElementById("af-firmware-banner");
    const titleEl = document.getElementById("af-firmware-title");
    const hintEl = document.getElementById("af-firmware-hint");
    const iconEl = banner?.querySelector(".af-firmware-icon");
    if (!banner || !titleEl || !hintEl) return;

    state.firmware = detectFirmware();
    titleEl.textContent = state.firmware.title;
    hintEl.textContent = state.firmware.hint;
    hintEl.classList.toggle("hidden", !state.firmware.hint);
    if (iconEl) iconEl.textContent = state.firmware.icon;
    banner.classList.toggle("af-firmware-copter", state.firmware.copterUi);
    banner.classList.toggle("af-firmware-other", !state.firmware.copterUi && state.firmware.kind !== "unknown");
  }

  function renderClassList() {
    const root = document.getElementById("af-class-list");
    if (!root) return;
    root.innerHTML = "";
    root.classList.remove("af-fixedwing-grid");

    if (state.firmware.kind === "plane" || state.firmware.kind === "vtol") {
      const shell = document.createElement("div");
      shell.className = "af-fixedwing-threecol";

      const makeCard = (preset, active) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "af-fixedwing-option";
        if (active) card.classList.add("active");
        card.style.setProperty("--af-accent", preset.accent);
        card.innerHTML = `
          <span class="af-fixedwing-option-head">
            <span class="af-fixedwing-icon">${preset.icon}</span>
            <span class="af-fixedwing-title-wrap">
              <strong>${preset.label}</strong>
              <span>${preset.summary}</span>
            </span>
          </span>
          <span class="af-fixedwing-badges">${preset.badges.map((badge) => `<span class="af-fixedwing-badge">${badge}</span>`).join("")}</span>`;
        return card;
      };

      const layoutCol = document.createElement("section");
      layoutCol.className = "af-fixedwing-column";
      layoutCol.innerHTML = `
        <div class="af-fixedwing-column-head">
          <h5>固定翼布局</h5>
          <span>常规尾 / 飞翼 / V尾</span>
        </div>
        <div class="af-fixedwing-column-body" id="af-layout-grid"></div>
      `;
      shell.appendChild(layoutCol);
      const layoutGrid = layoutCol.querySelector("#af-layout-grid");
      FIXED_WING_LAYOUT_PRESETS.forEach((preset) => {
        const btn = makeCard(preset, currentFixedWingPreset().id === preset.id);
        btn.addEventListener("click", () => selectFixedWingPreset(preset.id));
        layoutGrid?.appendChild(btn);
      });

      const vtolCol = document.createElement("section");
      vtolCol.className = "af-fixedwing-column";
      vtolCol.innerHTML = `
        <div class="af-fixedwing-column-head">
          <h5>VTOL 类型</h5>
          <span>启用后显示</span>
        </div>
        <div class="af-fixedwing-column-body af-fixedwing-column-stack">
          <section class="af-fixedwing-section">
            <div class="af-fixedwing-section-head">
              <h5>垂起系统 Q_ENABLE</h5>
              <span>启用则显示 VTOL 类型 UI</span>
            </div>
            <div class="af-qenable-switches">
              <button type="button" class="af-qenable-btn ${state.qEnable ? "" : "active"}" data-qenable="0">关闭</button>
              <button type="button" class="af-qenable-btn ${state.qEnable ? "active" : ""}" data-qenable="1">启用</button>
            </div>
          </section>
          <section class="af-fixedwing-section ${state.qEnable ? "" : "hidden"}" id="af-vtol-section">
            <div class="af-fixedwing-section-head">
              <h5>VTOL 类型</h5>
              <span>QuadPlane / TailSitter / TiltRotor</span>
            </div>
            <div class="af-fixedwing-grid af-fixedwing-grid-compact" id="af-vtol-grid"></div>
          </section>
        </div>
      `;
      vtolCol.querySelectorAll("[data-qenable]").forEach((btn) => {
        btn.addEventListener("click", () => selectQEnable(btn.getAttribute("data-qenable") === "1"));
      });
      if (state.qEnable) {
        const vtolGrid = vtolCol.querySelector("#af-vtol-grid");
        VTOL_MODE_PRESETS.forEach((preset) => {
          const btn = makeCard(preset, currentVtolPreset().id === preset.id);
          btn.addEventListener("click", () => selectVtolPreset(preset.id));
          vtolGrid?.appendChild(btn);
        });
      }
      shell.appendChild(vtolCol);

      const frameCol = document.createElement("section");
      frameCol.className = "af-fixedwing-column";
      frameCol.innerHTML = `
        <div class="af-fixedwing-column-head">
          <h5>垂起机架</h5>
          <span>Q_FRAME_CLASS / Q_FRAME_TYPE</span>
        </div>
        <div class="af-fixedwing-column-body">
          <section class="af-fixedwing-section">
            <div class="af-fixedwing-section-head">
              <h5>Q_FRAME</h5>
              <span>垂起机架映射</span>
            </div>
            <div class="af-qframe-inline">
              <label class="af-qframe-field">
                <span>Q_FRAME_CLASS</span>
                <input id="af-qframe-class-input" type="number" step="1" value="${state.frameClass ?? ""}" placeholder="例如 1">
              </label>
              <label class="af-qframe-field">
                <span>Q_FRAME_TYPE</span>
                <input id="af-qframe-type-input" type="number" step="1" value="${state.frameType ?? ""}" placeholder="例如 1">
              </label>
            </div>
            <div class="af-fixedwing-qframe-note">
              <strong>当前参数</strong>
              <p>${state.frameClass != null ? `Q_FRAME_CLASS=${state.frameClass}` : "Q_FRAME_CLASS 未读取"} / ${state.frameType != null ? `Q_FRAME_TYPE=${state.frameType}` : "Q_FRAME_TYPE 未读取"}</p>
              <p>这里只描述垂起机架，不替代固定翼布局本身。</p>
            </div>
          </section>
        </div>
      `;
      frameCol.querySelector("#af-qframe-class-input")?.addEventListener("change", (ev) => {
        const v = Math.round(Number(ev.target.value || 0));
        if (Number.isFinite(v) && v > 0) selectFrameClass(v);
      });
      frameCol.querySelector("#af-qframe-type-input")?.addEventListener("change", (ev) => {
        const v = Math.round(Number(ev.target.value || 0));
        if (Number.isFinite(v) && v >= 0) selectFrameType(v);
      });
      shell.appendChild(frameCol);

      root.appendChild(shell);
      return;
    }

  }
  function renderTypeList() {
    const block = document.getElementById("af-type-block");
    const root = document.getElementById("af-type-list");
    const note = document.getElementById("af-type-note");
    if (!root || !block || !note) return;

    if (state.firmware.kind === "plane" || state.firmware.kind === "vtol") {
      block.classList.add("hidden");
      root.innerHTML = "";
      note.textContent = "";
      note.classList.add("hidden");
      return;
    }

    block.classList.remove("hidden");
    const fc = state.frameClass;
    if (!state.firmware.copterUi || fc == null) {
      block.classList.add("af-disabled");
      root.innerHTML = "";
      note.textContent = "";
      note.classList.add("hidden");
      return;
    }
    block.classList.remove("af-disabled");

    if (HELICOPTER_CLASSES.has(fc)) {
      root.innerHTML = "";
      note.textContent =
        "?? Heli / Heli_Dual ????? FRAME_CLASS??????? RSC ????????????????";
      note.classList.remove("hidden");
      return;
    }

    if (SCRIPTING_CLASSES.has(fc)) {
      root.innerHTML = "";
      note.textContent = "Scripting ?????? FRAME_TYPE???????? FRAME_CLASS?";
      note.classList.remove("hidden");
      return;
    }

    const opts = getTypeOptionsForClass(fc);
    root.innerHTML = "";
    note.classList.add("hidden");

    if (!opts.length) {
      note.textContent = "?????????? FRAME_CLASS ??? ArduPilot ???";
      note.classList.remove("hidden");
      return;
    }

    opts.forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "af-type-chip";
      const active = state.frameType === opt.frameType;
      if (active) btn.classList.add("active");
      btn.innerHTML = `<span class="af-type-main">${typeLabel(opt.frameType)}</span>`;
      btn.addEventListener("click", () => selectFrameType(opt.frameType));
      root.appendChild(btn);
    });
  }

  function renderStatusBar() {
    const frameEl = document.getElementById("af-current-frame");
    const frameStateEl = document.getElementById("af-frame-state");
    const mixerEl = document.getElementById("af-mixer-state");
    const orientEl = document.getElementById("af-orient-state");
    if (!frameEl || !frameStateEl || !mixerEl || !orientEl) return;

    const frameKeys = getFrameParamKeys();
    const fc = state.frameClass;
    const ft = state.frameType;

    if (state.frameMap) {
      frameEl.textContent = `${state.frameMap.name}`;
      frameStateEl.textContent = `CLASS ${fc} 路 TYPE ${ft}`;
      frameStateEl.className = "af-chip af-chip-ok";
      mixerEl.textContent = "???";
    } else if (state.firmware.kind === "vtol") {
      frameEl.textContent = `${currentVtolPreset().shortLabel} / ${currentFixedWingPreset().shortLabel}`;
      frameStateEl.textContent = "VTOL UI";
      frameStateEl.className = "af-chip af-chip-ok";
      mixerEl.textContent = state.qEnable ? "Q_ENABLE / Q_FRAME / VTOL ???" : "Q_ENABLE=0??????";
    } else if (state.firmware.kind === "plane") {
      frameEl.textContent = currentFixedWingPreset().label;
      frameStateEl.textContent = "Plane";
      frameStateEl.className = "af-chip af-chip-ok";
      mixerEl.textContent = state.qEnable ? "???????" : "????";
    } else if (fc != null) {
      const tl = ft != null && usesFrameType(fc) ? ` 路 ${typeLabel(ft)}` : "";
      frameEl.textContent = `${classLabel(fc)}${tl}`;
      frameStateEl.textContent = ft != null ? `CLASS ${fc} 路 TYPE ${ft}` : `CLASS ${fc}`;
      frameStateEl.className = "af-chip af-chip-danger";
      mixerEl.textContent = HELICOPTER_CLASSES.has(fc) ? "鐩村崌鏈猴紙鏃犵煩闃垫贩鎺э級" : "鏃犲尮閰嶆贩鎺у浘";
    } else {
      frameEl.textContent = "椋炴帶灏氭湭涓嬪彂鏈烘灦鍙傛暟";
      frameStateEl.textContent = "???";
      frameStateEl.className = "af-chip af-chip-danger";
      mixerEl.textContent = "???";
    }

    orientEl.textContent = orientByValue(state.ahrsOrient).key;

    const ovEl = document.getElementById("ov-airframe-type");
    if (ovEl) {
      if (state.firmware.kind === "vtol") {
        ovEl.textContent = `VTOL 路 ${currentVtolPreset().shortLabel} 路 ${currentFixedWingPreset().shortLabel}`;
        ovEl.className = "ok";
        ovEl.title = "褰撳墠涓?VTOL 鍥轰欢锛屾満浣撻〉灞曠ず VTOL 鏈烘灦 UI 璁捐";
        return;
      }
      if (state.firmware.kind === "plane") {
        ovEl.textContent = state.qEnable
          ? `鍥哄畾缈?路 ${currentFixedWingPreset().shortLabel} 路 Q_ENABLE=1`
          : `鍥哄畾缈?路 ${currentFixedWingPreset().shortLabel}`;
        ovEl.className = "ok";
        ovEl.title = "褰撳墠涓哄浐瀹氱考鍥轰欢锛屾満浣撻〉浠呬繚鐣?IMU 鏈濆悜";
        return;
      }
      if (state.frameMap) {
        ovEl.textContent = `${state.frameMap.name}锛堥鎺э級`;
        ovEl.className = "ok";
        ovEl.title = frameKeys
          ? `${frameKeys.classKey}=${fc}, ${frameKeys.typeKey}=${ft}`
          : "";
      } else if (fc != null) {
        const kc = frameKeys?.classKey || "FRAME_CLASS";
        const kt = frameKeys?.typeKey || "FRAME_TYPE";
        ovEl.textContent =
          ft != null ? `${classLabel(fc)} / ${typeLabel(ft)}锛圕LASS ${fc} TYPE ${ft}锛塦 : `${classLabel(fc)}锛圕LASS ${fc}锛塦;
        ovEl.className = "warn";
        ovEl.title = frameKeys ? `${kc}=${fc}, ${kt}=${ft}` : "";
      } else {
        ovEl.textContent = "绛夊緟椋炴帶 FRAME_CLASS / FRAME_TYPE";
        ovEl.className = "danger pulse";
        ovEl.title = "???????????";
      }
    }
  }

  function updateBoard3d() {
    const board = document.getElementById("af-board3d");
    if (!board) return;
    const orient = orientByValue(state.ahrsOrient);
    const rz = orient.rz + Number(state.yaw || 0);
    const rx = orient.rx + Number(state.pitch || 0);
    board.style.transform = `rotateX(${rx}deg) rotateY(${orient.ry}deg) rotateZ(${rz}deg)`;
  }

  function svgEl(tag, attrs) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null) el.setAttribute(k, String(v));
    });
    return el;
  }

  /** 鍦ㄧ數鏈轰腑蹇?(0,0) 鍘熷湴鏃嬭浆铏氱嚎鐜紱閬垮厤 CSS transform 瀵艰嚧缁?SVG 鍘熺偣鍏浆 */
  function attachMotorSpinAnim(circle, clockwise) {
    const anim = document.createElementNS("http://www.w3.org/2000/svg", "animateTransform");
    anim.setAttribute("attributeName", "transform");
    anim.setAttribute("type", "rotate");
    anim.setAttribute("dur", "1.2s");
    anim.setAttribute("repeatCount", "indefinite");
    if (clockwise) {
      anim.setAttribute("from", "0 0 0");
      anim.setAttribute("to", "360 0 0");
    } else {
      anim.setAttribute("from", "360 0 0");
      anim.setAttribute("to", "0 0 0");
    }
    circle.appendChild(anim);
  }

  function polar(cx, cy, radius, angleDeg) {
    const r = (angleDeg * Math.PI) / 180;
    return { x: cx + radius * Math.sin(r), y: cy - radius * Math.cos(r) };
  }

  function drawFixedWingLabel(svg, text, x, y, color = "#cbd5e1", size = 12, weight = 600) {
    const node = svgEl("text", {
      x,
      y,
      "text-anchor": "middle",
      fill: color,
      "font-size": size,
      "font-weight": weight,
    });
    node.textContent = text;
    svg.appendChild(node);
  }

  function renderFixedWingTopology(svg, preset) {
    const cx = 320;
    const cy = 210;
    const accent = preset.accent;
    const nose = svgEl("polygon", {
      points: "320,66 336,102 304,102",
      fill: "#f59e0b",
      stroke: "#fde68a",
      "stroke-width": 1.2,
    });
    svg.appendChild(nose);
    svg.appendChild(svgEl("line", { x1: 320, y1: 102, x2: 320, y2: 322, stroke: "#94a3b8", "stroke-width": 2.2 }));

    if (preset.id === "conventional") {
      svg.appendChild(svgEl("line", { x1: 150, y1: 210, x2: 490, y2: 210, stroke: accent, "stroke-width": 8, "stroke-linecap": "round" }));
      svg.appendChild(svgEl("rect", { x: 294, y: 176, width: 52, height: 78, rx: 16, fill: "#203153", stroke: "#6c8fc9", "stroke-width": 1.6 }));
      svg.appendChild(svgEl("line", { x1: 248, y1: 286, x2: 392, y2: 286, stroke: "#34d399", "stroke-width": 6, "stroke-linecap": "round" }));
      svg.appendChild(svgEl("line", { x1: 320, y1: 254, x2: 320, y2: 310, stroke: "#cbd5e1", "stroke-width": 2.4 }));
      svg.appendChild(svgEl("line", { x1: 320, y1: 254, x2: 320, y2: 148, stroke: "#7dd3fc", "stroke-width": 2, "stroke-dasharray": "7 6" }));
      drawFixedWingLabel(svg, "鍓考 / 涓荤考", 320, 188, "#bfdbfe");
      drawFixedWingLabel(svg, "鍗囬檷灏剧考", 320, 304, "#bbf7d0");
    } else if (preset.id === "elevon") {
      svg.appendChild(svgEl("polygon", {
        points: "320,118 150,286 490,286",
        fill: "rgba(34,197,94,0.18)",
        stroke: accent,
        "stroke-width": 3,
        "stroke-linejoin": "round",
      }));
      svg.appendChild(svgEl("line", { x1: 224, y1: 242, x2: 278, y2: 270, stroke: "#86efac", "stroke-width": 6, "stroke-linecap": "round" }));
      svg.appendChild(svgEl("line", { x1: 416, y1: 242, x2: 362, y2: 270, stroke: "#86efac", "stroke-width": 6, "stroke-linecap": "round" }));
      svg.appendChild(svgEl("rect", { x: 300, y: 186, width: 40, height: 64, rx: 14, fill: "#183124", stroke: "#4ade80", "stroke-width": 1.4 }));
      drawFixedWingLabel(svg, "宸?Elevon", 232, 232, "#bbf7d0");
      drawFixedWingLabel(svg, "鍙?Elevon", 408, 232, "#bbf7d0");
    } else if (preset.id === "vtail") {
      svg.appendChild(svgEl("line", { x1: 156, y1: 210, x2: 484, y2: 210, stroke: accent, "stroke-width": 8, "stroke-linecap": "round" }));
      svg.appendChild(svgEl("rect", { x: 296, y: 176, width: 48, height: 74, rx: 16, fill: "#352515", stroke: "#fbbf24", "stroke-width": 1.6 }));
      svg.appendChild(svgEl("line", { x1: 320, y1: 250, x2: 264, y2: 308, stroke: "#fbbf24", "stroke-width": 6, "stroke-linecap": "round" }));
      svg.appendChild(svgEl("line", { x1: 320, y1: 250, x2: 376, y2: 308, stroke: "#fbbf24", "stroke-width": 6, "stroke-linecap": "round" }));
      drawFixedWingLabel(svg, "V????", 266, 320, "#fde68a");
      drawFixedWingLabel(svg, "V????", 374, 320, "#fde68a");
    } else if (preset.id === "quadplane") {
      svg.appendChild(svgEl("line", { x1: 156, y1: 210, x2: 484, y2: 210, stroke: "#93c5fd", "stroke-width": 8, "stroke-linecap": "round" }));
      svg.appendChild(svgEl("rect", { x: 296, y: 176, width: 48, height: 82, rx: 16, fill: "#261f45", stroke: "#a78bfa", "stroke-width": 1.6 }));
      [[210, 164], [430, 164], [210, 256], [430, 256]].forEach(([x, y], idx) => {
        svg.appendChild(svgEl("circle", { cx: x, cy: y, r: 22, fill: "rgba(167,139,250,0.18)", stroke: accent, "stroke-width": 2 }));
        drawFixedWingLabel(svg, `Lift ${idx + 1}`, x, y + 4, "#e9d5ff", 11);
      });
      drawFixedWingLabel(svg, "???? + ?????", 320, 332, "#ddd6fe");
    } else if (preset.id === "tailsitter") {
      svg.appendChild(svgEl("polygon", {
        points: "320,98 232,306 408,306",
        fill: "rgba(249,115,22,0.14)",
        stroke: accent,
        "stroke-width": 3,
        "stroke-linejoin": "round",
      }));
      [[282, 178], [358, 178]].forEach(([x, y], idx) => {
        svg.appendChild(svgEl("circle", { cx: x, cy: y, r: 22, fill: "rgba(249,115,22,0.18)", stroke: accent, "stroke-width": 2 }));
        drawFixedWingLabel(svg, `Motor ${idx + 1}`, x, y + 4, "#fed7aa", 11);
      });
      drawFixedWingLabel(svg, "??????", 320, 332, "#fdba74");
    } else if (preset.id === "tiltrotor") {
      svg.appendChild(svgEl("line", { x1: 156, y1: 210, x2: 484, y2: 210, stroke: "#fca5a5", "stroke-width": 8, "stroke-linecap": "round" }));
      svg.appendChild(svgEl("rect", { x: 296, y: 176, width: 48, height: 82, rx: 16, fill: "#3b1d24", stroke: "#ef4444", "stroke-width": 1.6 }));
      [[208, 210], [432, 210]].forEach(([x, y], idx) => {
        svg.appendChild(svgEl("circle", { cx: x, cy: y, r: 22, fill: "rgba(239,68,68,0.18)", stroke: accent, "stroke-width": 2 }));
        svg.appendChild(svgEl("line", { x1: x, y1: y - 34, x2: x, y2: y + 34, stroke: "#fda4af", "stroke-width": 2, "stroke-dasharray": "6 5" }));
        drawFixedWingLabel(svg, `Tilt ${idx + 1}`, x, y + 4, "#fecdd3", 11);
      });
      drawFixedWingLabel(svg, "??????????????", 320, 332, "#fda4af");
    }

    drawFixedWingLabel(svg, preset.label, 320, 366, "#f8fafc", 16, 700);
    drawFixedWingLabel(svg, "UI ?????", 320, 392, "#94a3b8", 12, 500);
  }

  function renderTopology() {
    const svg = document.getElementById("af-topology-svg");
    if (!svg) return;
    svg.innerHTML = "";

    if (state.firmware.kind === "plane" || state.firmware.kind === "vtol") {
      renderFixedWingTopology(svg, currentFixedWingPreset());
      return;
    }

    if (state.firmware.kind === "plane") {
      const cx = 320;
      const cy = 210;
      svg.appendChild(
        svgEl("rect", {
          x: 252,
          y: 188,
          width: 136,
          height: 44,
          rx: 18,
          fill: "#203153",
          stroke: "#6c8fc9",
          "stroke-width": 1.6,
        })
      );
      svg.appendChild(
        svgEl("polygon", {
          points: "320,78 330,102 310,102",
          fill: "#f59e0b",
          stroke: "#fde68a",
          "stroke-width": 1.2,
        })
      );
      svg.appendChild(svgEl("line", { x1: 320, y1: 102, x2: 320, y2: 322, stroke: "#94a3b8", "stroke-width": 2.2 }));
      svg.appendChild(svgEl("line", { x1: 162, y1: 210, x2: 478, y2: 210, stroke: "#38bdf8", "stroke-width": 3.2 }));
      svg.appendChild(svgEl("line", { x1: 238, y1: 150, x2: 402, y2: 150, stroke: "#60a5fa", "stroke-width": 2.4 }));
      svg.appendChild(svgEl("line", { x1: 238, y1: 270, x2: 402, y2: 270, stroke: "#34d399", "stroke-width": 2.4 }));
      svg.appendChild(
        svgEl("text", {
          x: 320,
          y: 372,
          "text-anchor": "middle",
          fill: "#cbd5e1",
          "font-size": 14,
          "font-weight": 700,
        })
      ).textContent = "鍥哄畾缈兼病鏈夋棆缈兼嫇鎵戝浘";
      svg.appendChild(
        svgEl("text", {
          x: 320,
          y: 396,
          "text-anchor": "middle",
          fill: "#94a3b8",
          "font-size": 12,
        })
      ).textContent = "杩欓噷浠呬繚鐣?IMU 鏈濆悜鏍″噯";
      return;
    }

    if (!state.frameMap || !Array.isArray(state.frameMap.motors)) {
      const t = svgEl("text", {
        x: 320,
        y: 220,
        "text-anchor": "middle",
        fill: "#93a6d8",
        "font-size": 14,
      });
      if (HELICOPTER_CLASSES.has(state.frameClass)) {
        t.textContent = "????????????????????????";
      } else if (SCRIPTING_CLASSES.has(state.frameClass)) {
        t.textContent = "Scripting 鏈烘灦娣锋帶鐢辫剼鏈畾涔夛紝鏃犲浐瀹氭嫇鎵戝浘";
      } else if (state.frameClass != null) {
        t.textContent = "?? CLASS/TYPE ????????????????";
      } else {
        t.textContent = "璇烽€夋嫨鏈烘灦绫诲瀷涓庢贩鎺у竷灞€";
      }
      svg.appendChild(t);
      return;
    }

    const cx = 320;
    const cy = 248;
    const armLen = 132;

    svg.appendChild(
      svgEl("polygon", {
        points: `${cx},22 ${cx - 14},46 ${cx + 14},46`,
        fill: "#f97316",
        stroke: "#fef08a",
        "stroke-width": 1.4,
      })
    );
    const fwd = svgEl("text", { x: cx, y: 62, "text-anchor": "middle", class: "af-forward-label" });
    fwd.textContent = "鏈哄ご鏈濆悜 (FORWARD)";
    svg.appendChild(fwd);

    const imu = svgEl("rect", {
      x: cx - 34,
      y: cy - 20,
      width: 68,
      height: 40,
      rx: 10,
      fill: "#2b3554",
      stroke: "#7c96d8",
      "stroke-width": 1.5,
    });
    const imuText = svgEl("text", {
      x: cx,
      y: cy + 4,
      "text-anchor": "middle",
      fill: "#e2e8f0",
      "font-size": 12,
      "font-weight": 700,
    });
    imuText.textContent = "IMU";
    svg.appendChild(imu);
    svg.appendChild(imuText);

    const byAngle = new Map();
    state.frameMap.motors.forEach((m) => {
      const key = Math.round((((m.angleDeg % 360) + 360) % 360) * 10) / 10;
      if (!byAngle.has(key)) byAngle.set(key, []);
      byAngle.get(key).push(m);
    });

    byAngle.forEach((group, key) => {
      const p = polar(cx, cy, armLen, key);
      svg.appendChild(
        svgEl("line", {
          x1: cx,
          y1: cy,
          x2: p.x,
          y2: p.y,
          stroke: "rgba(130, 152, 206, 0.55)",
          "stroke-width": 1.5,
        })
      );
      group.forEach((m, idx) => {
        const offset = group.length > 1 ? (idx === 0 ? -12 : 12) : 0;
        const node = svgEl("g", {
          class: "af-motor-node",
          transform: `translate(${p.x + offset},${p.y + offset})`,
          "data-output": m.output,
        });
        const dir = m.direction;
        const isCw = dir === "CW";
        node.appendChild(
          svgEl("circle", {
            cx: 0,
            cy: 0,
            r: 24,
            class: isCw ? "af-motor-body-cw" : "af-motor-body-ccw",
          })
        );
        const spinRing = svgEl("circle", {
          cx: 0,
          cy: 0,
          r: 14,
          fill: "none",
          "stroke-width": 2.2,
          class: isCw ? "af-motor-spin-cw" : "af-motor-spin-ccw",
          "stroke-dasharray": "28 10",
        });
        attachMotorSpinAnim(spinRing, isCw);
        node.appendChild(spinRing);
        const label = svgEl("text", {
          x: 0,
          y: 4,
          "text-anchor": "middle",
          fill: "#f8fafc",
          "font-size": 13,
          "font-weight": 700,
        });
        label.textContent = String(m.output);
        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = `杈撳嚭寮曡剼 ${m.output} 路 鐢垫満 ${m.label} 路 ${dir}锛堢敱 FRAME_CLASS/TYPE 娣锋帶琛ㄥ喅瀹氾級`;
        node.appendChild(title);
        node.appendChild(label);
        svg.appendChild(node);
      });
    });
  }

  function renderOrientationOptions() {
    const sel = document.getElementById("af-orient-select");
    if (!sel) return;
    if (!sel.childElementCount) {
      ORIENT_OPTIONS.forEach((o) => {
        const op = document.createElement("option");
        op.value = String(o.value);
        op.textContent = o.key;
        sel.appendChild(op);
      });
    }
    sel.value = String(orientByValue(state.ahrsOrient).value);
  }

  function renderAll() {
    const leftStack = document.querySelector(".af-left-stack");
    if (leftStack) leftStack.classList.toggle("af-left-stack-fixedwing", usesFixedWingPresetUi());
    renderFirmwareBanner();
    renderClassList();
    renderTypeList();
    renderStatusBar();
    renderOrientationOptions();
    updateBoard3d();
    renderTopology();
    setDirty(state.dirty);
  }

  async function writeConfig() {
    if (typeof window.sendParamSet !== "function") {
      log("?? ????????sendParamSet ???", "af-write");
      return;
    }
    const planeMode = state.firmware.kind === "plane";
    const keys = getFrameParamKeys();
    if (!planeMode && !keys) {
      log("鈿狅笍 鏈壘鍒?FRAME_CLASS / FRAME_TYPE 鍙傛暟", "af-write");
      return;
    }
    let sent = 0;
    const fc = state.frameClass;
    const ft = state.frameType;
    if (state.qEnable != null) {
      if (await window.sendParamSet("Q_ENABLE", state.qEnable ? 1 : 0)) sent += 1;
    }
    if (state.qEnable) {
      const tailsitEnabled = state.vtolPreset === "tailsitter" ? 1 : 0;
      const tiltEnabled = state.vtolPreset === "tiltrotor" ? 1 : 0;
      if (await window.sendParamSet("Q_TAILSIT_ENABLE", tailsitEnabled)) sent += 1;
      if (await window.sendParamSet("Q_TILT_ENABLE", tiltEnabled)) sent += 1;
    }
    if (!planeMode) {
      if (fc != null) {
        if (await window.sendParamSet(keys.classKey, fc)) sent += 1;
      }
      if (fc != null && usesFrameType(fc) && ft != null) {
        if (await window.sendParamSet(keys.typeKey, ft)) sent += 1;
      }
    }
    if (await window.sendParamSet("AHRS_ORIENT", state.ahrsOrient)) sent += 1;
    if (sent > 0) {
      log(planeMode ? `鉁?鍥哄畾缈兼湞鍚戝凡鍐欏叆 (${sent} 鏉″弬鏁?` : `鉁?鏈烘灦閰嶇疆宸插啓鍏?(${sent} 鏉″弬鏁?`, "af-write");
    } else {
      log("?? ?????????????", "af-write");
      return;
    }
    if (typeof window.sendCommandLong === "function") {
      await window.sendCommandLong(246, 1, 0, 0, 0, 0, 0, 0);
      log("?? ?????????", "af-write");
    }
    setDirty(false);
  }

  function bindEvents() {
    document.getElementById("af-orient-select")?.addEventListener("change", (ev) => {
      state.ahrsOrient = Math.round(Number(ev.target.value || 0));
      setDirty(true);
      renderAll();
    });
    document.getElementById("af-pitch-input")?.addEventListener("input", (ev) => {
      state.pitch = Number(ev.target.value || 0);
      updateBoard3d();
    });
    document.getElementById("af-yaw-input")?.addEventListener("input", (ev) => {
      state.yaw = Number(ev.target.value || 0);
      updateBoard3d();
    });
    document.getElementById("af-write-btn")?.addEventListener("click", () => {
      writeConfig();
    });

    document.addEventListener("gcs-airframe-params-changed", (ev) => {
      if (state.dirty && !(ev.detail && ev.detail.bulk)) return;
      syncFromParams();
      renderAll();
    });
    document.addEventListener("gcs-heartbeat", () => {
      if (state.dirty) return;
      syncFromParams();
      renderAll();
    });

    const fwEl = document.getElementById("ov-fw-version");
    if (fwEl && typeof MutationObserver !== "undefined") {
      const obs = new MutationObserver(() => {
        state.firmware = detectFirmware();
        renderFirmwareBanner();
        renderClassList();
        renderTypeList();
      });
      obs.observe(fwEl, { childList: true, characterData: true, subtree: true });
    }

    document.querySelectorAll(".ov-nav-item[data-setup-panel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.getAttribute("data-setup-panel") !== "airframe") return;
        syncFromParams();
        renderAll();
      });
    });
  }

  function mount() {
    if (!document.getElementById("setup-panel-airframe")) return;
    syncFromParams();
    bindEvents();
    renderAll();
    setDirty(false);
  }

  window.addEventListener("DOMContentLoaded", mount);
})();


