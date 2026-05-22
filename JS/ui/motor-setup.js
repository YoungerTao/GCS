(function initMotorSetup() {
  const svgNs = "http://www.w3.org/2000/svg";
  const R_SINGLE = 28;
  const ARC_SINGLE = R_SINGLE + 6;
  const R_COAX_OUTER = 44;
  const R_COAX_INNER = 28;
  const ARC_COAX_OUTER = R_COAX_OUTER + 6;
  const ARC_COAX_INNER = R_COAX_INNER + 5;
  const VIEW = { w: 560, h: 480, cx: 280, cy: 200 };
  const ARM_LEN = 155;

  const FRAME_TYPE_LABELS = {
    0: "Plus", 1: "X", 2: "V", 3: "H", 4: "V-Tail", 5: "A-Tail", 6: "PlusRev",
    10: "Y6B", 11: "Y6F", 12: "BetaFlightX", 13: "DJIX", 14: "ClockwiseX", 15: "I",
    18: "BetaFlightXReversed", 19: "Y4", 20: "X_COR", 21: "CW_X_COR",
  };

  const STATUSTEXT_CLASS_MAP = {
    UNDEFINED: 0, QUAD: 1, HEXA: 2, OCTA: 3, OCTAQUAD: 4, Y6: 5, HELI: 6, TRI: 7,
    SINGLECOPTER: 8, COAXCOPTER: 9, COAX: 9, BICOPTER: 10, HELI_DUAL: 11, DODECAHEXA: 12,
    HELIQUAD: 13, DECA: 14, SCRIPTING: 15,
  };

  const state = {
    isUnlocked: false,
    throttle: 5,
    duration: 3.0,
    activeMotorTestSeq: null,
    timer: null,
    testAllRunning: false,
    motorMap: null,
    frameClass: null,
    frameType: null,
    layoutSig: null,
    motors: [],
    directionOk: {},
    paramProbeRequested: false,
    lastParamProbeAt: 0,
    frameFromStatustext: null,
    topologyDelegateBound: false,
    tableHoverOutput: null,
    fadeTimer: null,
    didMotorTopoPaint: false,
    unlockVoicePlayed: false,
    unlockDisabledVoicePlayed: false,
  };

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function getSafeThrottle(val) {
    const n = Number(val);
    if (!Number.isFinite(n)) return 5;
    return clamp(n, 0, 15);
  }

  function getSafeDuration(val) {
    const n = Number(val);
    if (!Number.isFinite(n)) return 3;
    return clamp(n, 0.5, 8);
  }

  function isSerialConnected() {
    return !!(window.writer);
  }

  function getActiveFrameParamKeys() {
    const p = window.params;
    if (!p || !(p instanceof Map)) return null;
    if (p.has("FRAME_CLASS") && p.has("FRAME_TYPE")) {
      return { classKey: "FRAME_CLASS", typeKey: "FRAME_TYPE" };
    }
    if (p.has("Q_FRAME_CLASS") && p.has("Q_FRAME_TYPE")) {
      return { classKey: "Q_FRAME_CLASS", typeKey: "Q_FRAME_TYPE" };
    }
    return null;
  }

  function hasBothFrameParams() {
    return getActiveFrameParamKeys() !== null;
  }

  function parseStatustextFrameHint(text) {
    const raw = String(text || "");
    const m = raw.match(/Frame:\s*([A-Za-z0-9_]+)\s*(?:\/\s*([A-Za-z0-9_+]+))?/i);
    if (!m) return null;
    const clsTok = m[1].replace(/-/g, "_").toUpperCase();
    const frameClass = STATUSTEXT_CLASS_MAP[clsTok];
    if (frameClass === undefined) return null;
    const typeTok = (m[2] || "X").replace(/-/g, "_").toUpperCase();
    let frameType = 1;
    const numericType = parseInt(typeTok, 10);
    if (!Number.isNaN(numericType) && String(numericType) === typeTok) {
      frameType = numericType;
    } else if (typeTok === "PLUS" || typeTok === "+") frameType = 0;
    else if (typeTok === "X" || typeTok === "BETAFLIGHTX" || typeTok === "DJIX") frameType = 1;
    else if (typeTok === "V") frameType = 2;
    else if (typeTok === "H") frameType = 3;
    else if (typeTok === "Y6B") frameType = 10;
    else if (typeTok === "Y6F") frameType = 11;
    else if (typeTok === "Y4") frameType = 19;
    return { frameClass, frameType, rawLabel: `${m[1]}/${m[2] || "X"}` };
  }

  function frameTypeLabel(ft) {
    const n = Number(ft);
    if (Object.prototype.hasOwnProperty.call(FRAME_TYPE_LABELS, n)) return FRAME_TYPE_LABELS[n];
    return String(ft);
  }

  function getResolvedMotorMap() {
    if (!isSerialConnected()) return null;
    if (!hasBothFrameParams()) return null;
    const keys = getActiveFrameParamKeys();
    const fc = Math.round(Number(window.params.get(keys.classKey)));
    const ft = Math.round(Number(window.params.get(keys.typeKey)));
    const fn = window.getMotorMapByFrame;
    if (typeof fn !== "function") return null;
    return fn(fc, ft);
  }

  function layoutSignature(map, fc, ft) {
    if (!map) return `none|${fc}|${ft}`;
    return `${map.key}|${map.motors.map((m) => `${m.output}:${m.testSeq}:${m.angleDeg}`).join("|")}`;
  }

  function computeFrameMismatch() {
    // FRAME_CLASS / FRAME_TYPE 为权威；STATUSTEXT「Frame:」启动横幅可能与当前参数不同步
    if (hasBothFrameParams()) return "";
    if (!state.frameFromStatustext || state.frameClass == null) return "";
    const h = state.frameFromStatustext;
    if (h.frameClass !== state.frameClass || h.frameType !== state.frameType) {
      return `STATUSTEXT 机架提示（${h.rawLabel}）与参数表（CLASS=${state.frameClass}, TYPE=${state.frameType}）不一致，请以参数表为准。`;
    }
    return "";
  }

  function updateFrameChrome() {
    const labelEl = document.getElementById("motor-frame-label");
    const warnEl = document.getElementById("motor-frame-warn");
    if (!labelEl) return;

    if (!isSerialConnected()) {
      labelEl.textContent = "等待飞控连接...";
      if (warnEl) { warnEl.textContent = ""; warnEl.classList.add("hidden"); }
      return;
    }

    if (!hasBothFrameParams()) {
      labelEl.textContent = "等待 FRAME_CLASS / FRAME_TYPE 参数...";
      if (warnEl) { warnEl.textContent = ""; warnEl.classList.add("hidden"); }
      return;
    }

    const keys = getActiveFrameParamKeys();
    const fc = Math.round(Number(window.params.get(keys.classKey)));
    const ft = Math.round(Number(window.params.get(keys.typeKey)));
    state.frameClass = fc;
    state.frameType = ft;

    if (!state.motorMap) {
      labelEl.textContent = `未知机型（CLASS=${fc}，TYPE=${ft}）— 无内置电机映射表`;
      if (warnEl) {
        const m = computeFrameMismatch();
        if (m) { warnEl.textContent = m; warnEl.classList.remove("hidden"); }
        else { warnEl.textContent = ""; warnEl.classList.add("hidden"); }
      }
      return;
    }

    const m = state.motorMap;
    const xp = m.xConfig ? "X" : "+";
    labelEl.textContent = `已识别（参数表）：${m.name} / ${xp}（CLASS=${fc}，TYPE=${ft}）`;

    if (warnEl) {
      const w = computeFrameMismatch();
      if (w) {
        warnEl.textContent = w;
        warnEl.classList.remove("hidden");
      } else {
        warnEl.textContent = "";
        warnEl.classList.add("hidden");
      }
    }
  }

  const FRAME_PROBE_KEYS = ["FRAME_CLASS", "FRAME_TYPE", "Q_FRAME_CLASS", "Q_FRAME_TYPE"];

  async function requestAirframeParamsIfNeeded() {
    if (hasBothFrameParams() || state.frameFromStatustext) return;
    if (window._motorFrameProbeExhausted) return;
    if (!isSerialConnected()) return;

    const pmap = window.params;
    const bulkLoaded = pmap instanceof Map && pmap.size > 80;
    if (bulkLoaded) {
      window._motorFrameProbeExhausted = true;
      return;
    }

    const now = Date.now();
    if (state.paramProbeRequested && now - state.lastParamProbeAt < 8000) return;
    state.paramProbeRequested = true;
    state.lastParamProbeAt = now;

    const missing = FRAME_PROBE_KEYS.filter((k) => !pmap.has(k));
    if (!missing.length) return;

    try {
      for (const name of missing) {
        if (typeof window.requestParamByName === "function") {
          await window.requestParamByName(name);
          await new Promise((r) => setTimeout(r, 35));
        }
      }
      log(`📥 电机页已按需请求机型参数：${missing.join(", ")}`, "motor-param-probe");
    } catch (e) {
      log(`⚠️ 读取机型参数失败：${e?.message || e}`, "motor-param-probe");
    }
  }

  function createSvg(tag, attrs) {
    const el = document.createElementNS(svgNs, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null) el.setAttribute(k, String(v));
    });
    return el;
  }

  /** 机头向上、顺时针为正的角度（与 AP MotorDef 角度一致） */
  function layoutPolar(cx, cy, distPx, angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    return {
      x: cx + distPx * Math.sin(rad),
      y: cy - distPx * Math.cos(rad),
    };
  }

  /** 共轴外圈：even-odd 环形填充，避免实心圆盖住相邻臂的内圆描边 */
  function coaxAnnulusPath(cx, cy, rOut, rIn) {
    return [
      `M ${cx} ${cy - rOut}`,
      `A ${rOut} ${rOut} 0 1 1 ${cx} ${cy + rOut}`,
      `A ${rOut} ${rOut} 0 1 1 ${cx} ${cy - rOut}`,
      `M ${cx} ${cy - rIn}`,
      `A ${rIn} ${rIn} 0 1 0 ${cx} ${cy + rIn}`,
      `A ${rIn} ${rIn} 0 1 0 ${cx} ${cy - rIn}`,
      "Z",
    ].join(" ");
  }

  /**
   * 箭头方向规则：
   * polygon points="-6,9 6,9 0,-9" 默认尖端朝上（SVG -Y方向）
   * rotate(0)   = 朝上
   * rotate(90)  = 朝右
   * rotate(180) = 朝下
   * rotate(270) = 朝左
   *
   * 箭头放在臂延伸线与圆周的两个交点上：
   *   外侧交点 = cx + r*ux, cy + r*uy
   *   内侧交点 = cx - r*ux, cy - r*uy
   *   其中 ux=sin(armAngleDeg), uy=-cos(armAngleDeg)
   *
   * 切线方向（箭头朝向旋转方向）：
   *   外侧交点：
   *     CW  → rotate = armAngleDeg + 90
   *     CCW → rotate = armAngleDeg - 90
   *   内侧交点：
   *     CW  → rotate = armAngleDeg + 270
   *     CCW → rotate = armAngleDeg + 90
   *
   * 验证示例（臂B，angleDeg=30°，Motor A CCW）：
   *   外侧交点 rotate = 30 - 90 = -60° → 箭头朝左上 ✓ 逆时针
   *   内侧交点 rotate = 30 + 90 = 120° → 箭头朝右下 ✓ 逆时针
   *
   * 验证示例（臂B，angleDeg=30°，Motor B CW）：
   *   外侧交点 rotate = 30 + 90 = 120° → 箭头朝右下 ✓ 顺时针
   *   内侧交点 rotate = 30 + 270 = 300° → 箭头朝左上 ✓ 顺时针
   */
  function drawCircleArrows(parent, cx, cy, radius, isCw, color, armAngleDeg) {
    const rad = (armAngleDeg * Math.PI) / 180;
    const ux = Math.sin(rad);
    const uy = -Math.cos(rad);
    const points = [
      {
        ax: cx + radius * ux,
        ay: cy + radius * uy,
        tangent: isCw ? armAngleDeg + 90 : armAngleDeg - 90,
      },
      {
        ax: cx - radius * ux,
        ay: cy - radius * uy,
        tangent: isCw ? armAngleDeg + 270 : armAngleDeg + 90,
      },
    ];
    points.forEach(({ ax, ay, tangent }) => {
      parent.appendChild(createSvg("polygon", {
        points: "-6,9 6,9 0,-9",
        fill: color,
        transform: `translate(${ax},${ay}) rotate(${tangent})`,
        "pointer-events": "none",
      }));
    });
  }

  function normAngle(a) {
    let x = Number(a) % 360;
    if (x < 0) x += 360;
    return x;
  }

  function angKey(deg) {
    return Math.round(normAngle(deg));
  }

  function motorsByArmKey(map) {
    const byAng = new Map();
    map.motors.forEach((m) => {
      const k = angKey(m.angleDeg);
      if (!byAng.has(k)) byAng.set(k, []);
      byAng.get(k).push(m);
    });
    return byAng;
  }

  function motorPixelPositions(map) {
    const byAng = motorsByArmKey(map);
    const pos = new Map();
    map.motors.forEach((m) => {
      const k = angKey(m.angleDeg);
      const group = byAng.get(k) || [m];
      const dist = ARM_LEN;
      const p = layoutPolar(VIEW.cx, VIEW.cy, dist, m.angleDeg);
      const isCoaxPair = map.frameKind === "coaxial" && group.length === 2;
      pos.set(m.output, { x: p.x, y: p.y, dist, isCoaxPair });
    });
    return pos;
  }

  function armExtentRadius(map, ang) {
    const byAng = motorsByArmKey(map);
    const group = byAng.get(angKey(ang)) || [];
    const isCoaxPair = map.frameKind === "coaxial" && group.length === 2;
    return isCoaxPair ? R_COAX_OUTER : R_SINGLE;
  }

  function uniqueArmAngles(map) {
    const buck = new Map();
    map.motors.forEach((m) => {
      const k = angKey(m.angleDeg);
      if (!buck.has(k)) buck.set(k, m.angleDeg);
    });
    return [...buck.values()].sort((a, b) => angKey(a) - angKey(b));
  }

  function isEscThermalFault(output) {
    const t = window.escTelemetry && window.escTelemetry[output];
    if (!t || !Number.isFinite(Number(t.temperature))) return false;
    return Number(t.temperature) >= 95;
  }

  function syncMotorTopologyFaultClasses() {
    document.querySelectorAll(".motor-motor-group[data-output]").forEach((el) => {
      const out = Number(el.getAttribute("data-output"));
      const fault = state.directionOk[out] === false || isEscThermalFault(out);
      el.classList.toggle("motor-fault", fault);
    });
  }

  function renderTopology() {
    const svg = document.getElementById("motor-topology-svg");
    if (!svg) return;
    svg.innerHTML = "";
    svg.setAttribute("viewBox", `0 0 ${VIEW.w} ${VIEW.h}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.setAttribute("class", "motor-topology-svg-inner");

    const { cx, cy } = VIEW;

    if (!isSerialConnected()) {
      const t = createSvg("text", { x: cx, y: cy, "text-anchor": "middle", class: "motor-topo-msg" });
      t.textContent = "等待飞控连接...";
      svg.appendChild(t);
      return;
    }

    if (!hasBothFrameParams()) {
      const t = createSvg("text", { x: cx, y: cy, "text-anchor": "middle", class: "motor-topo-msg" });
      t.textContent = "等待 FRAME_CLASS / FRAME_TYPE 参数...";
      svg.appendChild(t);
      return;
    }

    if (!state.motorMap) {
      const t = createSvg("text", { x: cx, y: cy, "text-anchor": "middle", class: "motor-topo-msg" });
      t.textContent = `未知机型（CLASS=${state.frameClass}，TYPE=${state.frameType}）— 无拓扑数据`;
      svg.appendChild(t);
      return;
    }

    const map = state.motorMap;
    const positions = motorPixelPositions(map);
    const armAngles = uniqueArmAngles(map);

    armAngles.forEach((ang) => {
      const ext = armExtentRadius(map, ang);
      const p = layoutPolar(cx, cy, ARM_LEN + ext + 4, ang);
      svg.appendChild(createSvg("line", {
        x1: cx, y1: cy, x2: p.x, y2: p.y,
        stroke: "rgba(74, 96, 128, 0.55)",
        "stroke-width": 1.5,
      }));
    });

    const defs = createSvg("defs", {});
    const glow = createSvg("filter", { id: "motor-node-glow", x: "-40%", y: "-40%", width: "180%", height: "180%" });
    glow.appendChild(createSvg("feGaussianBlur", { in: "SourceGraphic", stdDeviation: "1.2", result: "blur" }));
    const feMerge = createSvg("feMerge", {});
    feMerge.appendChild(createSvg("feMergeNode", { in: "blur" }));
    feMerge.appendChild(createSvg("feMergeNode", { in: "SourceGraphic" }));
    glow.appendChild(feMerge);
    defs.appendChild(glow);

    svg.appendChild(defs);

    const fcW = 56;
    const fcH = 44;
    svg.appendChild(createSvg("rect", {
      x: cx - fcW / 2,
      y: cy - fcH / 2,
      width: fcW,
      height: fcH,
      rx: 10,
      ry: 10,
      class: "motor-topo-fc",
    }));
    const fcText = createSvg("text", {
      x: cx, y: cy + 5, "text-anchor": "middle", fill: "#e2e8f0", "font-size": "13", "font-weight": "600",
    });
    fcText.textContent = "FC";
    svg.appendChild(fcText);

    const posZh = (m) => window.motorMapPositionLabelZh(
      map.armCount, map.xConfig, m.armIndex, map.frameClass, map.frameType,
    );
    const layerZh = (m) => window.motorMapLayerLabelZh(m.layer);

    function appendMotorTitle(g, m) {
      const title = document.createElementNS(svgNs, "title");
      title.textContent = `Output ${m.output} · Motor ${m.label} · ${posZh(m)} · ${m.direction} · ${layerZh(m)}`;
      g.appendChild(title);
    }

    function renderSingleMotor(m, p) {
      const ux = Math.sin((m.angleDeg * Math.PI) / 180);
      const uy = -Math.cos((m.angleDeg * Math.PI) / 180);
      const pxv = -uy;
      const pyv = ux;
      const labelSide = 1;
      const lx = p.x + labelSide * pxv * (R_SINGLE + 18);
      const ly = p.y + labelSide * pyv * (R_SINGLE + 18);

      const isUpper = m.layer === "top";
      const isLower = m.layer === "bottom";
      let stroke = "#4a9eff";
      let fill = "#1e2233";
      if (isLower) {
        stroke = "#2ecc71";
        fill = "#1a2e1a";
      }

      const g = createSvg("g", {
        class: "motor-motor-group",
        "data-output": String(m.output),
        "data-test-seq": String(m.testSeq),
        "data-layer": m.layer || "single",
        role: "button",
        tabindex: "0",
      });

      appendMotorTitle(g, m);

      const circle = createSvg("circle", {
        cx: p.x,
        cy: p.y,
        r: R_SINGLE,
        fill,
        stroke,
        "stroke-width": 2.5,
        filter: "url(#motor-node-glow)",
        class: "motor-disc-node",
      });

      const idText = createSvg("text", {
        x: p.x,
        y: p.y + 5,
        "text-anchor": "middle",
        fill: "#ffffff",
        "font-size": "16",
        "font-weight": "700",
        "pointer-events": "none",
      });
      idText.textContent = String(m.output);

      const letterFill = isLower ? "#2ecc71" : (isUpper ? "#4a9eff" : "#ffffff");
      const letterEl = createSvg("text", {
        x: lx,
        y: ly + 4,
        "text-anchor": "middle",
        fill: letterFill,
        "font-size": "16",
        "font-weight": "700",
        "pointer-events": "none",
      });
      letterEl.textContent = m.label;

      const isCw = m.direction === "CW";
      drawCircleArrows(g, p.x, p.y, R_SINGLE, isCw, isCw ? "#4a9eff" : "#2ecc71", m.angleDeg);

      g.appendChild(circle);
      g.appendChild(idText);
      g.appendChild(letterEl);
      svg.appendChild(g);
    }

    function renderCoaxPair(topM, botM, p) {
      const ux = Math.sin((topM.angleDeg * Math.PI) / 180);
      const uy = -Math.cos((topM.angleDeg * Math.PI) / 180);

      const gBot = createSvg("g", {
        class: "motor-motor-group",
        "data-output": String(botM.output),
        "data-test-seq": String(botM.testSeq),
        "data-layer": "bottom",
        role: "button",
        tabindex: "0",
      });
      appendMotorTitle(gBot, botM);

      const circOutFill = createSvg("path", {
        d: coaxAnnulusPath(p.x, p.y, R_COAX_OUTER, R_COAX_INNER),
        fill: "#1a2e1a",
        "fill-rule": "evenodd",
        stroke: "none",
        filter: "url(#motor-node-glow)",
        class: "motor-disc-node motor-disc-coax-outer",
      });
      const circOutStroke = createSvg("circle", {
        cx: p.x,
        cy: p.y,
        r: R_COAX_OUTER,
        fill: "none",
        stroke: "#2ecc71",
        "stroke-width": 2.5,
        class: "motor-disc-coax-outer-ring",
      });
      gBot.appendChild(circOutFill);
      gBot.appendChild(circOutStroke);
      drawCircleArrows(gBot, p.x, p.y, R_COAX_OUTER, botM.direction === "CW", "#2ecc71", topM.angleDeg);

      const gTop = createSvg("g", {
        class: "motor-motor-group",
        "data-output": String(topM.output),
        "data-test-seq": String(topM.testSeq),
        "data-layer": "top",
        role: "button",
        tabindex: "0",
      });
      appendMotorTitle(gTop, topM);

      const circIn = createSvg("circle", {
        cx: p.x,
        cy: p.y,
        r: R_COAX_INNER,
        fill: "#1e2233",
        stroke: "#4a9eff",
        "stroke-width": 2.5,
        filter: "url(#motor-node-glow)",
        class: "motor-disc-node motor-disc-coax-inner",
      });
      const numIn = createSvg("text", {
        x: p.x,
        y: p.y - 7,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        fill: "#ffffff",
        "font-size": "16",
        "font-weight": "700",
        "pointer-events": "none",
      });
      numIn.textContent = String(topM.output);
      const letterIn = createSvg("text", {
        x: p.x,
        y: p.y + 7,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        fill: "#4a9eff",
        "font-size": "16",
        "font-weight": "700",
        "pointer-events": "none",
      });
      letterIn.textContent = topM.label;
      gTop.appendChild(circIn);
      drawCircleArrows(gTop, p.x, p.y, R_COAX_INNER, topM.direction === "CW", "#4a9eff", topM.angleDeg);
      gTop.appendChild(numIn);
      gTop.appendChild(letterIn);

      const numOut = createSvg("text", {
        x: p.x + ux * (R_COAX_OUTER + 28),
        y: p.y + uy * (R_COAX_OUTER + 28),
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        fill: "#2ecc71",
        "font-size": "16",
        "font-weight": "700",
        "pointer-events": "none",
      });
      numOut.textContent = String(botM.output);

      const letterOut = createSvg("text", {
        x: p.x + ux * (R_COAX_OUTER + 14),
        y: p.y + uy * (R_COAX_OUTER + 14),
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        fill: "#2ecc71",
        "font-size": "16",
        "font-weight": "700",
        "pointer-events": "none",
      });
      letterOut.textContent = botM.label;

      svg.appendChild(gBot);
      svg.appendChild(gTop);
      svg.appendChild(numOut);
      svg.appendChild(letterOut);
    }

    const byArm = motorsByArmKey(map);
    const doneArm = new Set();
    map.motors.forEach((m) => {
      const k = angKey(m.angleDeg);
      if (doneArm.has(k)) return;
      const grp = byArm.get(k) || [];
      const p0 = positions.get(grp[0].output);
      if (!p0) return;
      if (map.frameKind === "coaxial" && grp.length === 2) {
        doneArm.add(k);
        const sorted = grp.slice().sort((a, b) => {
          if (a.layer === "top" && b.layer !== "top") return -1;
          if (a.layer !== "top" && b.layer === "top") return 1;
          return a.output - b.output;
        });
        renderCoaxPair(sorted[0], sorted[1], p0);
      } else {
        doneArm.add(k);
        grp.forEach((mm) => {
          const pp = positions.get(mm.output);
          if (pp) renderSingleMotor(mm, pp);
        });
      }
    });

    const legCx = VIEW.w / 2;
    const legBase = VIEW.h - 10;
    const legLine = 24;
    const legMaxWidth = VIEW.w - 24;
    const leg = createSvg("g", {
      transform: `translate(${legCx}, ${legBase})`,
      "pointer-events": "none",
    });
    const legStyle = {
      x: 0,
      "text-anchor": "middle",
      fill: "#94a3b8",
      "font-size": "17",
      "textLength": String(legMaxWidth),
      "lengthAdjust": "spacingAndGlyphs",
    };
    const t1 = createSvg("text", { ...legStyle, y: -legLine });
    t1.appendChild(createSvg("tspan", { fill: "#4a9eff" }));
    t1.lastChild.textContent = "● 蓝色（内圆）= 上层电机 Top";
    t1.appendChild(createSvg("tspan", { fill: "#94a3b8" }));
    t1.lastChild.textContent = "    ";
    t1.appendChild(createSvg("tspan", { fill: "#2ecc71" }));
    t1.lastChild.textContent = "● 绿色（外圆）= 下层电机 Bottom";
    leg.appendChild(t1);
    const t2 = createSvg("text", { ...legStyle, y: 0 });
    t2.textContent = "蓝色箭头 = 上层旋转方向  绿色箭头 = 下层旋转方向。箭头弧线方向表示 CW（顺时针）或 CCW（逆时针）";
    leg.appendChild(t2);
    svg.appendChild(leg);

    syncMotorTopologyFaultClasses();
    applyHighlightFromTable();
  }

  function applyHighlightFromTable() {
    const o = state.tableHoverOutput;
    document.querySelectorAll(".motor-motor-group[data-output]").forEach((n) => {
      const v = Number(n.getAttribute("data-output"));
      n.classList.toggle("motor-highlight", o !== null && v === o);
    });
    const body = document.getElementById("motor-diagnostics-body");
    if (!body) return;
    body.querySelectorAll("tr[data-output]").forEach((tr) => {
      const v = Number(tr.getAttribute("data-output"));
      tr.classList.toggle("motor-row-highlight", o !== null && v === o);
    });
  }

  function renderMotorButtons() {
    const grid = document.getElementById("motor-btn-grid");
    if (!grid) return;
    grid.innerHTML = "";
    if (!state.motorMap) return;
    const list = state.motorMap.motors.slice().sort((a, b) => a.output - b.output);
    list.forEach((m) => {
      const btn = document.createElement("button");
      btn.className = "motor-test-btn";
      btn.setAttribute("data-test-seq", String(m.testSeq));
      btn.setAttribute("data-output", String(m.output));
      btn.textContent = `测试 Motor ${m.label}`;
      btn.addEventListener("click", () => runSingleMotorTest(m.testSeq));
      grid.appendChild(btn);
    });
  }

  async function sendMotorTest(testSeq, throttlePct, durationSec) {
    if (typeof window.sendCommandLong !== "function" || !window.writer) return false;
    await window.sendCommandLong(209, testSeq, 0, throttlePct, durationSec, 1, 0, 0, 0);
    return true;
  }

  function setButtonsDisabled(disabled) {
    document.querySelectorAll(".motor-test-btn").forEach((b) => { b.disabled = disabled; });
    const allBtn = document.getElementById("motor-test-all-btn");
    const allQuickBtn = document.getElementById("motor-test-all-quick-btn");
    if (allBtn) allBtn.disabled = disabled;
    if (allQuickBtn) allQuickBtn.disabled = disabled;
  }

  function clearActiveMotor() {
    state.activeMotorTestSeq = null;
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    document.querySelectorAll(".motor-motor-group").forEach((n) => n.classList.remove("active"));
  }

  function activateMotorUi(testSeq) {
    clearActiveMotor();
    state.activeMotorTestSeq = testSeq;
    const node = document.querySelector(`.motor-motor-group[data-test-seq="${testSeq}"]`);
    if (node) node.classList.add("active");
    state.timer = setTimeout(() => clearActiveMotor(), state.duration * 1000);
  }

  async function runSingleMotorTest(testSeq) {
    if (!state.isUnlocked) return;
    const motor = state.motorMap?.motors?.find((m) => m.testSeq === testSeq) || null;
    if (motor && motor.label) speakMotorTestLabel(motor.label);
    activateMotorUi(testSeq);
    const ok = await sendMotorTest(testSeq, state.throttle, state.duration);
    if (!ok) {
      log(`⚠️ 未连接飞控：执行本地模拟测试 Motor seq ${testSeq}`, "motor-test");
    } else {
      log(`🧪 电机测试已发送：序号 ${testSeq}, ${state.throttle}%, ${state.duration.toFixed(1)}s`, "motor-test");
    }
  }

  async function runTestAll() {
    if (!state.isUnlocked || state.testAllRunning || !state.motorMap) return;
    speakStartTestAll();
    state.testAllRunning = true;
    setButtonsDisabled(true);
    const seqs = state.motorMap.motors.slice().sort((a, b) => a.testSeq - b.testSeq);
    const allBtn = document.getElementById("motor-test-all-btn");
    const allQuickBtn = document.getElementById("motor-test-all-quick-btn");
    if (allBtn) allBtn.textContent = "顺次测试中...";
    if (allQuickBtn) allQuickBtn.textContent = "测试中...";

    for (const m of seqs) {
      /* eslint-disable no-await-in-loop */
      await runSingleMotorTest(m.testSeq);
      await new Promise((r) => setTimeout(r, state.duration * 1000 + 260));
      /* eslint-enable no-await-in-loop */
    }

    state.testAllRunning = false;
    if (allBtn) allBtn.textContent = "顺次测试所有电机";
    if (allQuickBtn) allQuickBtn.textContent = "测试所有电机";
    setButtonsDisabled(!state.isUnlocked);
  }

  function positionCell(m) {
    const map = state.motorMap;
    return window.motorMapPositionLabelZh(map.armCount, map.xConfig, m.armIndex, map.frameClass, map.frameType);
  }

  function layerCellHtml(m) {
    const zh = window.motorMapLayerLabelZh(m.layer);
    if (m.layer === "top") return `<span class="motor-layer-top">${zh}</span>`;
    if (m.layer === "bottom") return `<span class="motor-layer-bottom">${zh}</span>`;
    return `<span class="motor-layer-none">${zh}</span>`;
  }

  function renderDiagnosticsTable() {
    const body = document.getElementById("motor-diagnostics-body");
    if (!body) return;
    body.innerHTML = "";
    if (!state.motorMap) return;
    const list = state.motorMap.motors.slice().sort((a, b) => a.output - b.output);
    list.forEach((m) => {
      const tr = document.createElement("tr");
      tr.setAttribute("data-output", String(m.output));
      const t = window.escTelemetry && window.escTelemetry[m.output] ? window.escTelemetry[m.output] : null;
      const rpm = t && Number.isFinite(Number(t.rpm)) ? Math.round(Number(t.rpm)) : "--";
      const current = t && Number.isFinite(Number(t.current)) ? Number(t.current).toFixed(2) : "--";
      const temp = t && Number.isFinite(Number(t.temperature)) ? Number(t.temperature).toFixed(0) : "--";
      tr.innerHTML = `
        <td>Output ${m.output}</td>
        <td>Motor ${m.label}</td>
        <td>${positionCell(m)}</td>
        <td>${layerCellHtml(m)}</td>
        <td>
          <label class="motor-dir-toggle">
            <input type="checkbox" data-dir-ok="${m.output}" ${state.directionOk[m.output] ? "checked" : ""}>
            <span>${state.directionOk[m.output] ? "转向正确 ✓" : "需反向 ⇄"}</span>
          </label>
        </td>
        <td>${rpm}</td>
        <td>${current}</td>
        <td>${temp}</td>
      `;
      tr.addEventListener("mouseenter", () => {
        state.tableHoverOutput = m.output;
        applyHighlightFromTable();
      });
      tr.addEventListener("mouseleave", () => {
        state.tableHoverOutput = null;
        applyHighlightFromTable();
      });
      body.appendChild(tr);
    });

    body.querySelectorAll("input[data-dir-ok]").forEach((input) => {
      input.addEventListener("change", () => {
        const id = Number(input.getAttribute("data-dir-ok"));
        state.directionOk[id] = input.checked;
        renderDiagnosticsTable();
        syncMotorTopologyFaultClasses();
      });
    });
  }

  function updateUnlockUi() {
    const lockBadge = document.getElementById("motor-lock-badge");
    const workspace = document.getElementById("motor-workspace");
    const slider = document.getElementById("motor-unlock-range");
    if (!lockBadge || !workspace || !slider) return;
    const v = Number(slider.value);
    const max = Number(slider.max || 100);
    const min = Number(slider.min || 0);
    const atRight = v >= max;
    const atLeft = v <= min;
    if (atRight) slider.style.accentColor = "#2ecc71";
    else if (atLeft) slider.style.accentColor = "#e74c3c";
    else slider.style.accentColor = "#facc15";

    if (state.isUnlocked) {
      lockBadge.textContent = "已解锁";
      lockBadge.classList.add("unlocked");
      workspace.classList.add("danger-on");
      setButtonsDisabled(false);
      return;
    }

    lockBadge.textContent = "已锁定";
    lockBadge.classList.remove("unlocked");
    workspace.classList.remove("danger-on");
    setButtonsDisabled(true);
    clearActiveMotor();
  }

  function speakUnlockEnabledOnce() {
    if (state.unlockVoicePlayed) return;
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance !== "function") return;
    const u = new SpeechSynthesisUtterance("电机测试安全开关开启");
    u.lang = "zh-CN";
    synth.cancel();
    synth.speak(u);
    state.unlockVoicePlayed = true;
  }

  function speakUnlockDisabledOnce() {
    if (state.unlockDisabledVoicePlayed) return;
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance !== "function") return;
    const u = new SpeechSynthesisUtterance("电机测试开关已关闭");
    u.lang = "zh-CN";
    synth.cancel();
    synth.speak(u);
    state.unlockDisabledVoicePlayed = true;
  }

  function speakMotorTestLabel(label) {
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance !== "function") return;
    const u = new SpeechSynthesisUtterance(`测试电机${label}`);
    u.lang = "zh-CN";
    synth.cancel();
    synth.speak(u);
  }

  function speakStartTestAll() {
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance !== "function") return;
    const u = new SpeechSynthesisUtterance("开始顺序测试电机");
    u.lang = "zh-CN";
    synth.cancel();
    synth.speak(u);
  }

  function bindTopologyDelegate() {
    if (state.topologyDelegateBound) return;
    const wrap = document.querySelector(".motor-topology-wrap");
    if (!wrap) return;
    state.topologyDelegateBound = true;
    wrap.addEventListener("click", (ev) => {
      const g = ev.target.closest(".motor-motor-group[data-test-seq]");
      if (!g) return;
      const seq = Number(g.getAttribute("data-test-seq"));
      if (Number.isFinite(seq)) runSingleMotorTest(seq);
    });
    wrap.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const g = ev.target.closest(".motor-motor-group[data-test-seq]");
      if (!g) return;
      ev.preventDefault();
      const seq = Number(g.getAttribute("data-test-seq"));
      if (Number.isFinite(seq)) runSingleMotorTest(seq);
    });
  }

  function runTopologyFadeAndRender() {
    const inner = document.querySelector(".motor-topology-fade-inner");
    if (!inner || !state.didMotorTopoPaint) {
      renderTopology();
      renderMotorButtons();
      renderDiagnosticsTable();
      state.didMotorTopoPaint = true;
      return;
    }
    inner.classList.add("motor-topo-fade-out");
    if (state.fadeTimer) clearTimeout(state.fadeTimer);
    state.fadeTimer = setTimeout(() => {
      renderTopology();
      renderMotorButtons();
      renderDiagnosticsTable();
      inner.classList.remove("motor-topo-fade-out");
      inner.classList.add("motor-topo-fade-in");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          inner.classList.remove("motor-topo-fade-in");
        });
      });
    }, 200);
  }

  function updateMotorTelemetryCells() {
    const body = document.getElementById("motor-diagnostics-body");
    if (!body || !state.motorMap) return;
    body.querySelectorAll("tr[data-output]").forEach((tr) => {
      const out = Number(tr.getAttribute("data-output"));
      const t = window.escTelemetry && window.escTelemetry[out] ? window.escTelemetry[out] : null;
      const rpm = t && Number.isFinite(Number(t.rpm)) ? String(Math.round(Number(t.rpm))) : "--";
      const current = t && Number.isFinite(Number(t.current)) ? Number(t.current).toFixed(2) : "--";
      const temp = t && Number.isFinite(Number(t.temperature)) ? Number(t.temperature).toFixed(0) : "--";
      const cells = tr.querySelectorAll("td");
      if (cells.length >= 8) {
        cells[5].textContent = rpm;
        cells[6].textContent = current;
        cells[7].textContent = temp;
      }
    });
  }

  function refreshLayoutIfChanged() {
    if (!isSerialConnected()) {
      state.didMotorTopoPaint = false;
      state.frameFromStatustext = null;
    } else if (hasBothFrameParams()) {
      state.frameFromStatustext = null;
    }

    requestAirframeParamsIfNeeded();

    const map = getResolvedMotorMap();
    const keys = getActiveFrameParamKeys();
    const fc = keys ? Math.round(Number(window.params.get(keys.classKey))) : null;
    const ft = keys ? Math.round(Number(window.params.get(keys.typeKey))) : null;
    const sig = layoutSignature(map, fc, ft);

    if (state.layoutSig !== null && sig === state.layoutSig) {
      updateFrameChrome();
      renderDiagnosticsTable();
      syncMotorTopologyFaultClasses();
      return;
    }

    state.layoutSig = sig;
    state.motorMap = map;
    const prevOk = state.directionOk;
    state.directionOk = {};
    if (map) {
      map.motors.forEach((m) => {
        state.directionOk[m.output] = prevOk[m.output] ?? true;
      });
    }

    updateFrameChrome();
    runTopologyFadeAndRender();
    setButtonsDisabled(!state.isUnlocked);
  }

  function bindEvents() {
    bindTopologyDelegate();
    const slider = document.getElementById("motor-unlock-range");
    const throttleInput = document.getElementById("motor-throttle-input");
    const durationInput = document.getElementById("motor-duration-input");
    const allBtn = document.getElementById("motor-test-all-btn");
    const allQuickBtn = document.getElementById("motor-test-all-quick-btn");

    if (slider) {
      slider.addEventListener("input", () => {
        const wasUnlocked = state.isUnlocked;
        const min = Number(slider.min || 0);
        state.isUnlocked = Number(slider.value) >= 96;
        const atLeft = Number(slider.value) <= min;
        if (!wasUnlocked && state.isUnlocked) speakUnlockEnabledOnce();
        if (atLeft) speakUnlockDisabledOnce();
        else state.unlockDisabledVoicePlayed = false;
        if (!state.isUnlocked) state.unlockVoicePlayed = false;
        updateUnlockUi();
      });
      slider.addEventListener("change", () => {
        if (!state.isUnlocked) {
          slider.value = "0";
          updateUnlockUi();
        }
      });
    }

    if (throttleInput) {
      throttleInput.addEventListener("input", () => {
        state.throttle = getSafeThrottle(throttleInput.value);
        throttleInput.value = String(state.throttle);
      });
    }

    if (durationInput) {
      durationInput.addEventListener("input", () => {
        state.duration = getSafeDuration(durationInput.value);
        durationInput.value = String(state.duration.toFixed(1));
      });
    }

    allBtn?.addEventListener("click", () => { runTestAll(); });
    allQuickBtn?.addEventListener("click", () => { runTestAll(); });

    document.querySelectorAll(".ov-nav-item[data-setup-panel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.getAttribute("data-setup-panel") === "motor") {
          requestAirframeParamsIfNeeded();
          refreshLayoutIfChanged();
        }
      });
    });

    document.addEventListener("gcs-airframe-params-changed", () => refreshLayoutIfChanged());
    document.addEventListener("gcs-frame-statustext", onFrameStatustext);
    document.addEventListener("gcs-connection", (ev) => {
      if (ev.detail && ev.detail.state === "disconnected") {
        state.paramProbeRequested = false;
        state.lastParamProbeAt = 0;
        window._motorFrameProbeExhausted = false;
      }
      refreshLayoutIfChanged();
    });
  }

  function onFrameStatustext(ev) {
    if (hasBothFrameParams()) return;
    const text = ev && ev.detail ? ev.detail.text : "";
    const hint = parseStatustextFrameHint(text);
    if (hint) state.frameFromStatustext = hint;
    refreshLayoutIfChanged();
  }

  function mount() {
    if (!document.getElementById("setup-panel-motor")) return;
    bindEvents();
    refreshLayoutIfChanged();
    updateUnlockUi();
    setInterval(() => {
      if (!state.motorMap) return;
      updateMotorTelemetryCells();
      syncMotorTopologyFaultClasses();
    }, 380);
  }

  window.addEventListener("DOMContentLoaded", mount);
}());
