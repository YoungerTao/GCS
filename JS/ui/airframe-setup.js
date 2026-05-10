(function initAirframeSetup() {
  const ORIENT_OPTIONS = [
    { value: 0, key: "ROTATION_NONE", rx: 58, ry: 0, rz: 0 },
    { value: 2, key: "ROTATION_YAW_90", rx: 58, ry: 0, rz: 90 },
    { value: 4, key: "ROTATION_YAW_180", rx: 58, ry: 0, rz: 180 },
    { value: 6, key: "ROTATION_YAW_270", rx: 58, ry: 0, rz: 270 },
    { value: 8, key: "ROTATION_ROLL_180", rx: 238, ry: 0, rz: 0 },
  ];

  const PLATFORM_FRAMES = {
    multirotor: [
      { label: "Quad X (常用四轴)", frameClass: 1, frameType: 1 },
      { label: "Hexa X (六轴)", frameClass: 2, frameType: 1 },
      { label: "Octo Quad X (重载八轴)", frameClass: 4, frameType: 1 },
      { label: "Custom Mixer (自定义混控)", frameClass: null, frameType: null },
    ],
    vtol: [
      { label: "VTOL (Q_FRAME_CLASS / Q_FRAME_TYPE)", frameClass: null, frameType: null },
    ],
    plane: [
      { label: "Fixed Wing (非多旋翼机架)", frameClass: null, frameType: null },
    ],
    rover: [
      { label: "Rover / Boat (非多旋翼混控)", frameClass: null, frameType: null },
    ],
  };

  const state = {
    platform: "multirotor",
    frameClass: null,
    frameType: null,
    frameMap: null,
    ahrsOrient: 0,
    pitch: 0,
    yaw: 0,
    directionOverride: {},
    dirty: false,
  };

  function getFrameParamKeys() {
    const p = window.params;
    if (!(p instanceof Map)) return null;
    if (p.has("FRAME_CLASS") && p.has("FRAME_TYPE")) return { classKey: "FRAME_CLASS", typeKey: "FRAME_TYPE" };
    if (p.has("Q_FRAME_CLASS") && p.has("Q_FRAME_TYPE")) return { classKey: "Q_FRAME_CLASS", typeKey: "Q_FRAME_TYPE" };
    return null;
  }

  function getParamNum(name) {
    const p = window.params;
    if (!(p instanceof Map) || !p.has(name)) return null;
    const v = Number(p.get(name));
    return Number.isFinite(v) ? v : null;
  }

  function setDirty(v) {
    state.dirty = !!v;
    const btn = document.getElementById("af-write-btn");
    if (!btn) return;
    btn.classList.toggle("pending", state.dirty);
    if (state.dirty) {
      btn.textContent = "有未写入修改，请点击保存并重启飞控";
    } else {
      btn.textContent = "写入并重启飞控 (Write & Reboot)";
    }
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
    const mapGetter = window.getMotorMapByFrame;
    state.frameMap = typeof mapGetter === "function" && state.frameClass != null && state.frameType != null
      ? mapGetter(state.frameClass, state.frameType)
      : null;
  }

  function updateBoard3d() {
    const board = document.getElementById("af-board3d");
    if (!board) return;
    const orient = orientByValue(state.ahrsOrient);
    const rz = orient.rz + Number(state.yaw || 0);
    const rx = orient.rx + Number(state.pitch || 0);
    board.style.transform = `rotateX(${rx}deg) rotateY(${orient.ry}deg) rotateZ(${rz}deg)`;
  }

  function platformAutoFromFrameClass() {
    if (state.frameClass == null) return;
    if ([1, 2, 3, 4, 5, 7, 12, 13, 14].includes(state.frameClass)) state.platform = "multirotor";
  }

  function renderStatusBar() {
    const frameEl = document.getElementById("af-current-frame");
    const frameStateEl = document.getElementById("af-frame-state");
    const mixerEl = document.getElementById("af-mixer-state");
    const orientEl = document.getElementById("af-orient-state");
    if (!frameEl || !frameStateEl || !mixerEl || !orientEl) return;

    if (state.frameMap) {
      frameEl.textContent = `${state.frameMap.name} (CLASS=${state.frameClass}, TYPE=${state.frameType})`;
      frameStateEl.textContent = "🟢 Active";
      frameStateEl.className = "af-chip af-chip-ok";
      mixerEl.textContent = "已加载";
    } else if (state.frameClass != null && state.frameType != null) {
      frameEl.textContent = `CLASS=${state.frameClass}, TYPE=${state.frameType}`;
      frameStateEl.textContent = "⚠️ Unconfigured";
      frameStateEl.className = "af-chip af-chip-danger";
      mixerEl.textContent = "未加载";
    } else {
      frameEl.textContent = "未指定 (Undefined)";
      frameStateEl.textContent = "⚠️ Unconfigured";
      frameStateEl.className = "af-chip af-chip-danger";
      mixerEl.textContent = "未加载";
    }

    orientEl.textContent = orientByValue(state.ahrsOrient).key;
  }

  function renderFrameList() {
    const root = document.getElementById("af-frame-list");
    if (!root) return;
    const rows = PLATFORM_FRAMES[state.platform] || [];
    root.innerHTML = "";
    rows.forEach((item) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "af-frame-item";
      const active = item.frameClass === state.frameClass && item.frameType === state.frameType;
      if (active) row.classList.add("active");
      const canApply = item.frameClass != null && item.frameType != null;
      const tag = active ? "🟢 Active" : "⚠️ Unconfigured";
      row.innerHTML = `<span>${item.label}</span><span>${tag}</span>`;
      row.addEventListener("click", () => {
        if (!canApply) return;
        state.frameClass = item.frameClass;
        state.frameType = item.frameType;
        const mapGetter = window.getMotorMapByFrame;
        state.frameMap = typeof mapGetter === "function" ? mapGetter(state.frameClass, state.frameType) : null;
        setDirty(true);
        renderAll();
      });
      root.appendChild(row);
    });
  }

  function setHoverHint(text) {
    const el = document.getElementById("af-hover-hint");
    if (!el) return;
    el.textContent = text;
  }

  function motorDirection(m) {
    const ov = state.directionOverride[m.output];
    if (ov === "CW" || ov === "CCW") return ov;
    return m.direction;
  }

  function svgEl(tag, attrs) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null) el.setAttribute(k, String(v));
    });
    return el;
  }

  function polar(cx, cy, radius, angleDeg) {
    const r = (angleDeg * Math.PI) / 180;
    return { x: cx + radius * Math.sin(r), y: cy - radius * Math.cos(r) };
  }

  function renderTopology() {
    const svg = document.getElementById("af-topology-svg");
    if (!svg) return;
    svg.innerHTML = "";
    setHoverHint("悬浮电机节点查看输出引脚");
    if (!state.frameMap || !Array.isArray(state.frameMap.motors)) {
      const t = svgEl("text", { x: 320, y: 200, "text-anchor": "middle", fill: "#93a6d8", "font-size": 14 });
      t.textContent = "当前平台/机架未提供可视化拓扑";
      svg.appendChild(t);
      return;
    }

    const cx = 320;
    const cy = 210;
    const armLen = 130;

    const tri = svgEl("polygon", {
      points: `${cx},28 ${cx - 14},52 ${cx + 14},52`,
      fill: "#f97316",
      stroke: "#fef08a",
      "stroke-width": 1.4,
    });
    svg.appendChild(tri);
    const t = svgEl("text", { x: cx, y: 70, "text-anchor": "middle", class: "af-forward-label" });
    t.textContent = "机头朝向 (FORWARD)";
    svg.appendChild(t);

    const imu = svgEl("rect", {
      x: cx - 34, y: cy - 20, width: 68, height: 40, rx: 10,
      fill: "#2b3554", stroke: "#7c96d8", "stroke-width": 1.5,
    });
    const imuText = svgEl("text", { x: cx, y: cy + 4, "text-anchor": "middle", fill: "#e2e8f0", "font-size": 12, "font-weight": 700 });
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
      const arm = svgEl("line", {
        x1: cx, y1: cy, x2: p.x, y2: p.y,
        stroke: "rgba(130, 152, 206, 0.55)", "stroke-width": 1.5,
      });
      svg.appendChild(arm);
      group.forEach((m, idx) => {
        const offset = group.length > 1 ? (idx === 0 ? -12 : 12) : 0;
        const node = svgEl("g", {
          class: "af-motor-node",
          transform: `translate(${p.x + offset},${p.y + offset})`,
          "data-output": m.output,
        });

        const dir = motorDirection(m);
        const isCw = dir === "CW";
        const body = svgEl("circle", {
          cx: 0,
          cy: 0,
          r: 24,
          class: isCw ? "af-motor-body-cw" : "af-motor-body-ccw",
        });
        const spinRing = svgEl("circle", {
          cx: 0, cy: 0, r: 14, fill: "none", "stroke-width": 2.2,
          class: isCw ? "af-motor-spin-cw" : "af-motor-spin-ccw",
          "stroke-dasharray": "28 10",
        });
        const label = svgEl("text", {
          x: 0, y: 4, "text-anchor": "middle", fill: "#f8fafc", "font-size": 13, "font-weight": 700,
        });
        label.textContent = String(m.output);

        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = `Motor ${m.label} · ${dir} · PWM Out ${m.output}`;
        node.appendChild(title);
        node.appendChild(body);
        node.appendChild(spinRing);
        node.appendChild(label);
        node.addEventListener("mouseenter", () => setHoverHint(`PWM Out ${m.output} · Motor ${m.label} · ${dir}`));
        node.addEventListener("mouseleave", () => setHoverHint("悬浮电机节点查看输出引脚"));
        node.addEventListener("dblclick", () => {
          state.directionOverride[m.output] = dir === "CW" ? "CCW" : "CW";
          setDirty(true);
          renderTopology();
        });
        svg.appendChild(node);
      });
    });
  }

  function renderPlatformCards() {
    document.querySelectorAll(".af-platform-card").forEach((el) => {
      const active = el.getAttribute("data-platform") === state.platform;
      el.classList.toggle("active", active);
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
    renderPlatformCards();
    renderFrameList();
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
    let sent = 0;
    if (state.frameClass != null && state.frameType != null) {
      /* eslint-disable no-await-in-loop */
      if (await window.sendParamSet("FRAME_CLASS", state.frameClass)) sent += 1;
      if (await window.sendParamSet("FRAME_TYPE", state.frameType)) sent += 1;
      /* eslint-enable no-await-in-loop */
    }
    if (await window.sendParamSet("AHRS_ORIENT", state.ahrsOrient)) sent += 1;
    if (sent > 0) {
      log(`✅ Vehicle 配置写入完成 (${sent} 条参数)`, "af-write");
    } else {
      log("⚠️ Vehicle 参数写入未成功，请检查连接状态", "af-write");
      return;
    }
    if (typeof window.sendCommandLong === "function") {
      await window.sendCommandLong(246, 1, 0, 0, 0, 0, 0, 0);
      log("🔁 已发送飞控重启命令", "af-write");
    }
    setDirty(false);
  }

  function bindEvents() {
    document.querySelectorAll(".af-platform-card").forEach((el) => {
      el.addEventListener("click", () => {
        const p = el.getAttribute("data-platform");
        if (!p) return;
        state.platform = p;
        renderAll();
      });
    });
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

    document.addEventListener("gcs-airframe-params-changed", () => {
      if (state.dirty) return;
      syncFromParams();
      platformAutoFromFrameClass();
      renderAll();
    });

    document.querySelectorAll(".ov-nav-item[data-setup-panel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.getAttribute("data-setup-panel") !== "airframe") return;
        syncFromParams();
        platformAutoFromFrameClass();
        renderAll();
      });
    });
  }

  function mount() {
    if (!document.getElementById("setup-panel-airframe")) return;
    syncFromParams();
    platformAutoFromFrameClass();
    bindEvents();
    renderAll();
    setDirty(false);
  }

  window.addEventListener("DOMContentLoaded", mount);
}());
