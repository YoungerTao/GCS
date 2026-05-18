(function initAirframeSetup() {
  const ORIENT_OPTIONS = [
    { value: 0, key: "ROTATION_NONE", rx: 58, ry: 0, rz: 0 },
    { value: 2, key: "ROTATION_YAW_90", rx: 58, ry: 0, rz: 90 },
    { value: 4, key: "ROTATION_YAW_180", rx: 58, ry: 0, rz: 180 },
    { value: 6, key: "ROTATION_YAW_270", rx: 58, ry: 0, rz: 270 },
    { value: 8, key: "ROTATION_ROLL_180", rx: 238, ry: 0, rz: 0 },
  ];

  /** ArduCopter FRAME_CLASS（与飞控参数说明一致） */
  const FRAME_CLASS_OPTIONS = [
    { id: 1, name: "Quad", label: "四旋翼", icon: "4" },
    { id: 2, name: "Hexa", label: "六旋翼", icon: "6" },
    { id: 3, name: "Octa", label: "八旋翼", icon: "8" },
    { id: 4, name: "OctaQuad", label: "共轴八轴", icon: "8×2" },
    { id: 5, name: "Y6", label: "Y6", icon: "Y6" },
    { id: 6, name: "Heli", label: "传统直升机", icon: "H" },
    { id: 7, name: "Tri", label: "三旋翼", icon: "3" },
    { id: 8, name: "SingleCopter", label: "单旋翼", icon: "1" },
    { id: 9, name: "CoaxCopter", label: "共轴双桨", icon: "⊕" },
    { id: 10, name: "BiCopter", label: "双旋翼", icon: "2" },
    { id: 11, name: "Heli_Dual", label: "双旋翼直升机", icon: "H×2" },
    { id: 12, name: "DodecaHexa", label: "十二轴", icon: "12" },
    { id: 13, name: "HeliQuad", label: "直升机四轴", icon: "HQ" },
    { id: 14, name: "Deca", label: "十旋翼", icon: "10" },
    { id: 15, name: "Scripting Matrix", label: "脚本矩阵", icon: "⌗" },
    { id: 16, name: "6DoF Scripting", label: "6DoF 脚本", icon: "6D" },
    { id: 17, name: "Dynamic Scripting", label: "动态脚本矩阵", icon: "∿" },
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

  /** 机架类型卡片示意图（内联 SVG，viewBox 80×56） */
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

  const state = {
    firmware: { kind: "unknown", copterUi: false, title: "等待连接飞控…", hint: "" },
    frameClass: null,
    frameType: null,
    frameMap: null,
    ahrsOrient: 0,
    pitch: 0,
    yaw: 0,
    dirty: false,
  };

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
    const fwText = (document.getElementById("ov-fw-version")?.textContent || "").trim();
    const keys = getFrameParamKeys();
    const hasFrame = keys?.classKey === "FRAME_CLASS";
    const hasQ = keys?.classKey?.startsWith("Q_");

    if (/copter/i.test(fwText) || (hasFrame && !hasQ)) {
      return {
        kind: "copter",
        copterUi: true,
        icon: "🛸",
        title: fwText && !/等待|…/.test(fwText) ? fwText : "ArduCopter · 多旋翼固件",
        hint: "",
      };
    }
    if (/plane|arduplane/i.test(fwText) || hasQ) {
      return {
        kind: hasQ ? "vtol" : "plane",
        copterUi: false,
        icon: hasQ ? "✈️" : "🛩️",
        title: fwText || (hasQ ? "ArduPlane VTOL" : "ArduPlane"),
        hint: "当前固件非 ArduCopter，机架参数请使用 Q_FRAME_* 或在 Mission Planner 中配置",
      };
    }
    if (/rover|boat|sub/i.test(fwText)) {
      return {
        kind: "rover",
        copterUi: false,
        icon: "🚗",
        title: fwText || "ArduRover / 其他",
        hint: "本页机架选型面向 ArduCopter；当前固件不适用 FRAME_CLASS 矩阵机架",
      };
    }
    if (window.fcMavType === 2 && hasFrame) {
      return {
        kind: "copter",
        copterUi: true,
        icon: "🛸",
        title: "ArduCopter（推断）",
        hint: "已检测到 FRAME_CLASS 参数，按多旋翼固件配置机架",
      };
    }
    return {
      kind: "unknown",
      copterUi: false,
      icon: "🔌",
      title: "等待连接飞控…",
      hint: "连接并加载参数后，将自动识别 ArduCopter 等固件类型",
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
    btn.textContent = state.dirty
      ? "有未写入修改，请点击保存并重启飞控"
      : "写入并重启飞控 (Write & Reboot)";
  }

  function orientByValue(v) {
    const n = Math.round(Number(v));
    return ORIENT_OPTIONS.find((o) => o.value === n) || ORIENT_OPTIONS[0];
  }

  function syncFromParams() {
    const keys = getFrameParamKeys();
    if (keys) {
      const fc = getParamNum(keys.classKey);
      const ft = getParamNum(keys.typeKey);
      if (fc != null) state.frameClass = Math.round(fc);
      if (ft != null) state.frameType = Math.round(ft);
    }
    const orient = getParamNum("AHRS_ORIENT");
    if (orient != null) state.ahrsOrient = Math.round(orient);
    state.firmware = detectFirmware();
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

    if (!state.firmware.copterUi) {
      const msg = document.createElement("p");
      msg.className = "af-empty-msg";
      msg.textContent = "连接 ArduCopter 飞控并加载参数后可选择机架类型。";
      root.appendChild(msg);
      return;
    }

    const fcActive = state.frameClass;
    FRAME_CLASS_OPTIONS.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "af-class-card";
      btn.title = item.label;
      if (fcActive === item.id) btn.classList.add("active");
      const nameEn = String(item.name).replace(/\s+/g, " ").toLowerCase();
      btn.innerHTML = `
        <span class="af-class-fig">${buildFrameClassIconSvg(item.id)}</span>
        <span class="af-class-caption">${item.label} ${nameEn}</span>`;
      btn.addEventListener("click", () => selectFrameClass(item.id));
      root.appendChild(btn);
    });
  }

  function renderTypeList() {
    const block = document.getElementById("af-type-block");
    const root = document.getElementById("af-type-list");
    const note = document.getElementById("af-type-note");
    if (!root || !block || !note) return;

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
        "选择 Heli / Heli_Dual 后仅需写入 FRAME_CLASS；旋翼机械与 RSC 参数请在「电机」或全部参数页配置。";
      note.classList.remove("hidden");
      return;
    }

    if (SCRIPTING_CLASSES.has(fc)) {
      root.innerHTML = "";
      note.textContent = "Scripting 机架无需选择 FRAME_TYPE；保存时将只写入 FRAME_CLASS。";
      note.classList.remove("hidden");
      return;
    }

    const opts = getTypeOptionsForClass(fc);
    root.innerHTML = "";
    note.classList.add("hidden");

    if (!opts.length) {
      note.textContent = "暂无可用布局；请确认 FRAME_CLASS 或查阅 ArduPilot 文档。";
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
      frameStateEl.textContent = `CLASS ${fc} · TYPE ${ft}`;
      frameStateEl.className = "af-chip af-chip-ok";
      mixerEl.textContent = "已加载";
    } else if (fc != null) {
      const tl = ft != null && usesFrameType(fc) ? ` · ${typeLabel(ft)}` : "";
      frameEl.textContent = `${classLabel(fc)}${tl}`;
      frameStateEl.textContent = ft != null ? `CLASS ${fc} · TYPE ${ft}` : `CLASS ${fc}`;
      frameStateEl.className = "af-chip af-chip-danger";
      mixerEl.textContent = HELICOPTER_CLASSES.has(fc) ? "直升机（无矩阵混控）" : "无匹配混控图";
    } else {
      frameEl.textContent = "飞控尚未下发机架参数";
      frameStateEl.textContent = "无参数";
      frameStateEl.className = "af-chip af-chip-danger";
      mixerEl.textContent = "未加载";
    }

    orientEl.textContent = orientByValue(state.ahrsOrient).key;

    const ovEl = document.getElementById("ov-airframe-type");
    if (ovEl) {
      if (state.frameMap) {
        ovEl.textContent = `${state.frameMap.name}（飞控）`;
        ovEl.className = "ok";
        ovEl.title = frameKeys
          ? `${frameKeys.classKey}=${fc}, ${frameKeys.typeKey}=${ft}`
          : "";
      } else if (fc != null) {
        const kc = frameKeys?.classKey || "FRAME_CLASS";
        const kt = frameKeys?.typeKey || "FRAME_TYPE";
        ovEl.textContent =
          ft != null ? `${classLabel(fc)} / ${typeLabel(ft)}（CLASS ${fc} TYPE ${ft}）` : `${classLabel(fc)}（CLASS ${fc}）`;
        ovEl.className = "warn";
        ovEl.title = frameKeys ? `${kc}=${fc}, ${kt}=${ft}` : "";
      } else {
        ovEl.textContent = "等待飞控 FRAME_CLASS / FRAME_TYPE";
        ovEl.className = "danger pulse";
        ovEl.title = "连接飞控并加载参数列表";
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

  /** 在电机中心 (0,0) 原地旋转虚线环；避免 CSS transform 导致绕 SVG 原点公转 */
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

  function renderTopology() {
    const svg = document.getElementById("af-topology-svg");
    if (!svg) return;
    svg.innerHTML = "";

    if (!state.frameMap || !Array.isArray(state.frameMap.motors)) {
      const t = svgEl("text", {
        x: 320,
        y: 220,
        "text-anchor": "middle",
        fill: "#93a6d8",
        "font-size": 14,
      });
      if (HELICOPTER_CLASSES.has(state.frameClass)) {
        t.textContent = "传统直升机无矩阵电机拓扑示意，请使用电机测试页";
      } else if (SCRIPTING_CLASSES.has(state.frameClass)) {
        t.textContent = "Scripting 机架混控由脚本定义，无固定拓扑图";
      } else if (state.frameClass != null) {
        t.textContent = "当前 CLASS/TYPE 暂无拓扑图，仍可将参数写入飞控";
      } else {
        t.textContent = "请选择机架类型与混控布局";
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
    fwd.textContent = "机头朝向 (FORWARD)";
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
        title.textContent = `输出引脚 ${m.output} · 电机 ${m.label} · ${dir}（由 FRAME_CLASS/TYPE 混控表决定）`;
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
    renderFirmwareBanner();
    renderClassList();
    renderTypeList();
    renderStatusBar();
    renderOrientationOptions();
    updateBoard3d();
    renderTopology();
  }

  async function writeConfig() {
    if (typeof window.sendParamSet !== "function") {
      log("⚠️ 当前不可写参数：sendParamSet 未就绪", "af-write");
      return;
    }
    const keys = getFrameParamKeys();
    if (!keys) {
      log("⚠️ 未找到 FRAME_CLASS / FRAME_TYPE 参数", "af-write");
      return;
    }
    let sent = 0;
    const fc = state.frameClass;
    const ft = state.frameType;
    if (fc != null) {
      if (await window.sendParamSet(keys.classKey, fc)) sent += 1;
    }
    if (fc != null && usesFrameType(fc) && ft != null) {
      if (await window.sendParamSet(keys.typeKey, ft)) sent += 1;
    }
    if (await window.sendParamSet("AHRS_ORIENT", state.ahrsOrient)) sent += 1;
    if (sent > 0) {
      log(`✅ 机架配置已写入 (${sent} 条参数)`, "af-write");
    } else {
      log("⚠️ 参数写入未成功，请检查连接", "af-write");
      return;
    }
    if (typeof window.sendCommandLong === "function") {
      await window.sendCommandLong(246, 1, 0, 0, 0, 0, 0, 0);
      log("🔁 已发送飞控重启命令", "af-write");
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
