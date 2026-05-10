(function initAccelCalibration() {
  /** @typedef {'idle'|'orienting'|'measuring'|'success'|'failed'} CalibState */
  /** @typedef {'level'|'left'|'right'|'up'|'down'|'back'} AccelAxisKey */

  /**
   * mavlink ACCELCAL_VEHICLE_POS（与 ArduPilot 六面加速度校准一致，参见
   * https://ardupilot.org/copter/docs/common-accelerometer-calibration.html ）
   *
   * 【机体系 — Body FRD，与 MAVLink MAV_FRAME_BODY_FRD 一致】
   * - X 轴（前 / Roll 轴）：沿飞行器正前方，通常与飞控板箭头或主朝向标记一致。
   * - Y 轴（右 / Pitch 轴）：沿飞行器正右方（右翼方向）。
   * - Z 轴（下 / Yaw 轴）：沿飞行器正下方（地心侧）。
   * 【欧拉角符号 — 与常见飞控/航空约定一致】
   * - Roll（绕 X）：向右倾斜（右翼下沉）为正。
   * - Pitch（绕 Y）：机头抬起为正。
   * - Yaw（绕 Z）：从上视之顺时针（机头向右转）为正。
   * 导航里常用的 NED（北–东–地）是当地固定系；机体系随机体转动，二者需用姿态互转，勿混用。
   *
   * 【target】静止时 IMU 加速度（已换算为 g）在机体系中的**归一化方向**，用于地面站与遥测比对；
   * 与六面放置时「重力/比力」主导轴一致。HIGHRES_IMU / SCALED_IMU 在 MAVLink 中一般为机体系；
   * 水平放置时 |Z|≈1g 很常见，但部分板卡/报文约定下 Z 可为 +1g 或 −1g，故用 imuFlipZForFrd + 水平步自动判别。
   *
   * euler: [Pitch, Roll, Yaw] 度，旋转链 R = Rz(yaw)·Ry(pitch)·Rx(roll)，仅用于 3D 画布示意。
   */
  const FACES = [
    {
      key: "level",
      label: "水平置放",
      step: "level",
      target: [0, 0, 1],
      mavlinkPos: 0,
      speak: "第一步，请将飞机水平静置在桌面",
      euler: [0, 0, 0],
    },
    {
      key: "left",
      label: "向左侧立",
      step: "left",
      target: [0, -1, 0],
      mavlinkPos: 1,
      speak: "第二步，请将飞机向左侧立九十度",
      euler: [0, -90, 0],
    },
    {
      key: "right",
      label: "向右侧立",
      step: "right",
      target: [0, 1, 0],
      mavlinkPos: 2,
      speak: "第三步，请将飞机向右侧立九十度",
      euler: [0, 90, 0],
    },
    {
      key: "up",
      label: "头部朝上",
      step: "up",
      target: [-1, 0, 0],
      mavlinkPos: 4,
      speak: "第四步，请将飞机机头垂直朝上",
      euler: [90, 0, 0],
    },
    {
      key: "down",
      label: "头部朝下",
      step: "down",
      target: [1, 0, 0],
      mavlinkPos: 3,
      speak: "第五步，请将飞机机头垂直朝下",
      euler: [-90, 0, 0],
    },
    {
      key: "back",
      label: "背部朝上",
      step: "back",
      target: [0, 0, -1],
      mavlinkPos: 5,
      speak: "第六步，请将飞机翻转一百八十度背部朝上",
      euler: [0, 180, 0],
    },
  ];
  /**
   * 六面校准 3D 画布用的视向补偿（度）：叠在 FACES[].euler 的 yaw 上，不改变 MAVLink 姿态语义。
   * 默认 [0,0,0] 时机头在画面上朝右；+90° 使水平置放时机头朝画布上方，与「机头朝上」步骤的直觉一致。
   */
  const ACCEL_CAL_VIEW_YAW_DEG = 90;

  /** 保存前校验：|G| 应接近 1（静止） */
  const ACCEL_CAL_G_MAG_MIN = 0.82;
  const ACCEL_CAL_G_MAG_MAX = 1.18;
  /** 当前加速度方向与当前面期望重力方向的夹角余弦下限（约 28°） */
  const ACCEL_CAL_ALIGN_DOT_MIN = 0.88;
  /** 仅用带时间戳的 HIGHRES_IMU / SCALED_IMU 做门控，避免用过期遥测误判 */
  const ACCEL_CAL_IMU_MAX_AGE_MS = 500;

  const MAV_CMD_PREFLIGHT_CALIBRATION = 241;

  const AHRS_ORIENT_BY_SELECT = {
    ROTATION_NONE: 0,
    ROTATION_YAW_90: 2,
    ROTATION_YAW_180: 4,
    ROTATION_YAW_270: 6,
  };

  const accel = {
    /** @type {CalibState} */
    calibState: "idle",
    currentIndex: 0,
    raf: 0,
    sim: [0, 0, 0],
    /** @type {number} requestAnimationFrame 时间戳，用于 dt 平滑 */
    lastSimT: 0,
    /** @type {{w:number,x:number,y:number,z:number}} 当前姿态四元数（渲染用） */
    currentQ: { w: 1, x: 0, y: 0, z: 0 },
    /**
     * 部分 IMU 报文在水平时 Z 与 FRD「下为 +Z」相反（约 -1g）。为通过第一步校验仅对读数 Z 取反，不能整向量取反（否则会搞反左右翼）。
     */
    imuFlipZForFrd: false,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function vecLen3(x, y, z) {
    return Math.sqrt(x * x + y * y + z * z);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  const D2R = Math.PI / 180;

  function speak(text) {
    if (!window.speechSynthesis || !text) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN";
      u.rate = 1.0;
      u.pitch = 1.0;
      window.speechSynthesis.speak(u);
    } catch (e) {
      /* ignore */
    }
  }

  function quatNormalize(q) {
    const n = Math.sqrt(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z) || 1;
    return { w: q.w / n, x: q.x / n, y: q.y / n, z: q.z / n };
  }

  /** 行主序 3×3，列向量 v′ = M·v；内在旋转顺序：先 Roll(X)→Pitch(Y)→Yaw(Z)，即 M = Rz·Ry·Rx */
  function matMul3(a, b) {
    const o = new Array(9);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        o[i * 3 + j] =
          a[i * 3 + 0] * b[0 * 3 + j] + a[i * 3 + 1] * b[1 * 3 + j] + a[i * 3 + 2] * b[2 * 3 + j];
      }
    }
    return o;
  }

  function matRx(rad) {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return [1, 0, 0, 0, c, -s, 0, s, c];
  }
  function matRy(rad) {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return [c, 0, s, 0, 1, 0, -s, 0, c];
  }
  function matRz(rad) {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return [c, -s, 0, s, c, 0, 0, 0, 1];
  }

  function matFromEulerPRYdeg(pitchDeg, rollDeg, yawDeg) {
    const p = pitchDeg * D2R;
    const r = rollDeg * D2R;
    const y = yawDeg * D2R;
    return matMul3(matRz(y), matMul3(matRy(p), matRx(r)));
  }

  function matVec3(m, x, y, z) {
    return {
      x: m[0] * x + m[1] * y + m[2] * z,
      y: m[3] * x + m[4] * y + m[5] * z,
      z: m[6] * x + m[7] * y + m[8] * z,
    };
  }

  function quatFromMat3(m) {
    const t = m[0] + m[4] + m[8];
    let w;
    let x;
    let y;
    let z;
    if (t > 0) {
      const S = Math.sqrt(t + 1) * 2;
      w = 0.25 * S;
      x = (m[7] - m[5]) / S;
      y = (m[2] - m[6]) / S;
      z = (m[3] - m[1]) / S;
    } else if (m[0] > m[4] && m[0] > m[8]) {
      const S = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2;
      w = (m[7] - m[5]) / S;
      x = 0.25 * S;
      y = (m[1] + m[3]) / S;
      z = (m[2] + m[6]) / S;
    } else if (m[4] > m[8]) {
      const S = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2;
      w = (m[2] - m[6]) / S;
      x = (m[1] + m[3]) / S;
      y = 0.25 * S;
      z = (m[5] + m[7]) / S;
    } else {
      const S = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
      w = (m[3] - m[1]) / S;
      x = (m[2] + m[6]) / S;
      y = (m[5] + m[7]) / S;
      z = 0.25 * S;
    }
    return quatNormalize({ w, x, y, z });
  }

  /** 与 matFromEulerPRYdeg 一致，供 Slerp 插值 */
  function quatFromPRY(pitchDeg, rollDeg, yawDeg) {
    return quatFromMat3(matFromEulerPRYdeg(pitchDeg, rollDeg, yawDeg));
  }

  /**
   * 标准投影：先将机体 FRD 点经 R(P,R,Y) 变换，再透视到屏幕（与 draw 使用同一旋转定义）
   */
  function project3D(x, y, z, pitchDeg, rollDeg, yawDeg, width, height) {
    const m = matFromEulerPRYdeg(pitchDeg, rollDeg, yawDeg);
    const p = matVec3(m, x, y, z);
    const fov = 340;
    const distance = 295;
    const scale = fov / (distance - p.z);
    return {
      x: width / 2 + p.x * scale,
      y: height / 2 - p.y * scale,
      depth: p.z,
    };
  }

  /**
   * 塞斯纳式上单翼机体：源网格为「翼展 X / 机身 Y 向机头 / Z 向上」，映射到 FRD（前 X / 右 Y / 下 Z）：
   * (x_frd, y_frd, z_frd) = (y_body, x_body, -z_body)，与 FACES.euler 及 IMU 解算一致。
   */
  function buildCessnaCalibrationModel() {
    const SCALE = 0.39;
    const raw = [
      { x: 0, y: 115, z: -2 },
      { x: -10, y: 95, z: 12 },
      { x: 10, y: 95, z: 12 },
      { x: 10, y: 95, z: -10 },
      { x: -10, y: 95, z: -10 },
      { x: -14, y: 55, z: 25 },
      { x: 14, y: 55, z: 25 },
      { x: 14, y: 55, z: -12 },
      { x: -14, y: 55, z: -12 },
      { x: -10, y: -25, z: 18 },
      { x: 10, y: -25, z: 18 },
      { x: 8, y: -30, z: -10 },
      { x: -8, y: -30, z: -10 },
      { x: 0, y: -105, z: 5 },
      { x: -165, y: 40, z: 24 },
      { x: -165, y: 5, z: 24 },
      { x: 165, y: 40, z: 24 },
      { x: 165, y: 5, z: 24 },
      { x: -45, y: -95, z: 5 },
      { x: -45, y: -110, z: 4 },
      { x: 45, y: -95, z: 5 },
      { x: 45, y: -110, z: 4 },
      { x: 0, y: -105, z: 42 },
      { x: -22, y: 15, z: -28 },
      { x: 22, y: 15, z: -28 },
      { x: 0, y: 85, z: -26 },
    ];
    const verts = [];
    for (let i = 0; i < raw.length; i++) {
      const v = raw[i];
      verts.push(v.y * SCALE, v.x * SCALE, -v.z * SCALE);
    }
    const rawFaces = [
      { indices: [0, 1, 2], color: "#ef4444" },
      { indices: [0, 2, 3], color: "#dc2626" },
      { indices: [0, 3, 4], color: "#b91c1c" },
      { indices: [0, 4, 1], color: "#f87171" },
      { indices: [1, 5, 6, 2], color: "#f8fafc" },
      { indices: [2, 6, 7, 3], color: "#e2e8f0" },
      { indices: [3, 7, 8, 4], color: "#cbd5e1" },
      { indices: [4, 8, 5, 1], color: "#e2e8f0" },
      { indices: [5, 9, 10, 6], color: "#1e3a8a" },
      { indices: [6, 10, 11, 7], color: "#2563eb" },
      { indices: [8, 12, 9, 5], color: "#3b82f6" },
      { indices: [7, 11, 12, 8], color: "#94a3b8" },
      { indices: [9, 13, 10], color: "#f1f5f9" },
      { indices: [10, 13, 11], color: "#cbd5e1" },
      { indices: [11, 13, 12], color: "#94a3b8" },
      { indices: [12, 13, 9], color: "#cbd5e1" },
      { indices: [5, 14, 15, 9], color: "#f8fafc" },
      { indices: [6, 16, 17, 10], color: "#f8fafc" },
      { indices: [14, 16, 17, 15], color: "#ef4444" },
      { indices: [9, 18, 19, 13], color: "#f1f5f9" },
      { indices: [10, 20, 21, 13], color: "#f1f5f9" },
      { indices: [9, 22, 13], color: "#ef4444" },
      { indices: [8, 23, 12], color: "#64748b" },
      { indices: [7, 24, 11], color: "#64748b" },
      { indices: [4, 25, 3], color: "#475569" },
    ];
    const faces = [];
    for (let fi = 0; fi < rawFaces.length; fi++) {
      const rf = rawFaces[fi];
      const hx = rf.color;
      const cr = parseInt(hx.slice(1, 3), 16);
      const cg = parseInt(hx.slice(3, 5), 16);
      const cb = parseInt(hx.slice(5, 7), 16);
      const id = rf.indices;
      if (id.length === 3) {
        faces.push({ a: id[0], b: id[1], c: id[2], cr, cg, cb });
      } else {
        faces.push({ a: id[0], b: id[1], c: id[2], cr, cg, cb });
        faces.push({ a: id[0], b: id[2], c: id[3], cr, cg, cb });
      }
    }
    let noseI = 0;
    let tailI = 0;
    let maxX = -1e9;
    let minX = 1e9;
    const nv = verts.length / 3;
    for (let i = 0; i < nv; i++) {
      const x = verts[i * 3];
      if (x > maxX) {
        maxX = x;
        noseI = i;
      }
      if (x < minX) {
        minX = x;
        tailI = i;
      }
    }
    return { verts: new Float32Array(verts), faces, noseI, tailI };
  }

  const FIXEDWING_MODEL = buildCessnaCalibrationModel();

  const LIGHT_DIR = (function () {
    const x = 1;
    const y = 1;
    const z = -1;
    const n = Math.sqrt(x * x + y * y + z * z) || 1;
    return { x: x / n, y: y / n, z: z / n };
  })();

  function quatRotateVec(q, vx, vy, vz) {
    const tx = 2 * (q.y * vz - q.z * vy);
    const ty = 2 * (q.z * vx - q.x * vz);
    const tz = 2 * (q.x * vy - q.y * vx);
    return {
      x: vx + q.w * tx + (q.y * tz - q.z * ty),
      y: vy + q.w * ty + (q.z * tx - q.x * tz),
      z: vz + q.w * tz + (q.x * ty - q.y * tx),
    };
  }

  function quatSlerp(a, b, t) {
    let dot = a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
    let b2 = b;
    if (dot < 0) {
      dot = -dot;
      b2 = { w: -b.w, x: -b.x, y: -b.y, z: -b.z };
    }
    if (dot > 0.9995) {
      return quatNormalize({
        w: lerp(a.w, b2.w, t),
        x: lerp(a.x, b2.x, t),
        y: lerp(a.y, b2.y, t),
        z: lerp(a.z, b2.z, t),
      });
    }
    const th = Math.acos(clamp(dot, -1, 1));
    const st = Math.sin(th);
    const wa = Math.sin((1 - t) * th) / st;
    const wb = Math.sin(t * th) / st;
    return quatNormalize({
      w: wa * a.w + wb * b2.w,
      x: wa * a.x + wb * b2.x,
      y: wa * a.y + wb * b2.y,
      z: wa * a.z + wb * b2.z,
    });
  }

  function projectRotated(x, y, z, q, width, height) {
    const p = quatRotateVec(q, x, y, z);
    const fov = 340;
    const distance = 295;
    const scale = fov / (distance - p.z);
    return { x: width / 2 + p.x * scale, y: height / 2 - p.y * scale, depth: p.z };
  }

  function draw3DAircraft(canvasId, q) {
    const canvas = typeof canvasId === "string" ? $(canvasId) : canvasId;
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const grd = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, Math.max(w, h) * 0.55);
    grd.addColorStop(0, "rgba(30, 41, 59, 0.35)");
    grd.addColorStop(1, "rgba(15, 23, 42, 0.08)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(59, 130, 246, 0.14)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, (Math.min(w, h) / 11) * i + 18, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(w / 2, 24);
    ctx.lineTo(w / 2, h - 24);
    ctx.moveTo(24, h / 2);
    ctx.lineTo(w - 24, h / 2);
    ctx.strokeStyle = "rgba(59, 130, 246, 0.07)";
    ctx.stroke();

    const { verts, faces, noseI, tailI } = FIXEDWING_MODEL;
    const V = (i) => ({ x: verts[i * 3], y: verts[i * 3 + 1], z: verts[i * 3 + 2] });

    const bucket = faces.map((f) => {
      const p0 = V(f.a);
      const p1 = V(f.b);
      const p2 = V(f.c);
      const e1x = p1.x - p0.x;
      const e1y = p1.y - p0.y;
      const e1z = p1.z - p0.z;
      const e2x = p2.x - p0.x;
      const e2y = p2.y - p0.y;
      const e2z = p2.z - p0.z;
      let nx = e1y * e2z - e1z * e2y;
      let ny = e1z * e2x - e1x * e2z;
      let nz = e1x * e2y - e1y * e2x;
      const ln = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= ln;
      ny /= ln;
      nz /= ln;
      const nw = quatRotateVec(q, nx, ny, nz);
      const nd = Math.max(0, nw.x * LIGHT_DIR.x + nw.y * LIGHT_DIR.y + nw.z * LIGHT_DIR.z);
      const amb = 0.28;
      const df = (1 - amb) * nd;
      const rr = clamp((f.cr * (amb + df)) / 255, 0, 1);
      const gg = clamp((f.cg * (amb + df)) / 255, 0, 1);
      const bb = clamp((f.cb * (amb + df)) / 255, 0, 1);

      const pr0 = projectRotated(p0.x, p0.y, p0.z, q, w, h);
      const pr1 = projectRotated(p1.x, p1.y, p1.z, q, w, h);
      const pr2 = projectRotated(p2.x, p2.y, p2.z, q, w, h);
      const pw0 = quatRotateVec(q, p0.x, p0.y, p0.z);
      const pw1 = quatRotateVec(q, p1.x, p1.y, p1.z);
      const pw2 = quatRotateVec(q, p2.x, p2.y, p2.z);
      const zavg = (pw0.z + pw1.z + pw2.z) / 3;
      return { pr0, pr1, pr2, rr, gg, bb, zavg };
    });

    bucket.sort((a, b) => a.zavg - b.zavg);
    bucket.forEach((it) => {
      ctx.beginPath();
      ctx.moveTo(it.pr0.x, it.pr0.y);
      ctx.lineTo(it.pr1.x, it.pr1.y);
      ctx.lineTo(it.pr2.x, it.pr2.y);
      ctx.closePath();
      ctx.fillStyle = `rgb(${Math.round(it.rr * 255)},${Math.round(it.gg * 255)},${Math.round(it.bb * 255)})`;
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
      ctx.lineWidth = 0.85;
      ctx.stroke();
    });

    const pn = V(noseI);
    const pt = V(tailI);
    const nose = projectRotated(pn.x, pn.y, pn.z, q, w, h);
    const tail = projectRotated(pt.x, pt.y, pt.z, q, w, h);
    ctx.beginPath();
    ctx.strokeStyle = "rgba(16, 185, 129, 0.72)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(nose.x, nose.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function fcConnected() {
    return !!(window.writer);
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function slog(msg) {
    if (typeof window.log === "function") window.log(msg);
    else console.log(msg);
  }

  function getLiveImuG() {
    const now = Date.now();
    const hr = window.highresImuG;
    const sc = window.scaledImuG;
    if (hr && typeof hr.x === "number" && now - hr.t < 400) return { x: hr.x, y: hr.y, z: hr.z };
    if (sc && typeof sc.x === "number" && now - sc.t < 400) return { x: sc.x, y: sc.y, z: sc.z };
    const T = window.telemetry;
    if (T && typeof T.accel_x_g === "number" && typeof T.accel_y_g === "number" && typeof T.accel_z_g === "number") {
      return { x: T.accel_x_g, y: T.accel_y_g, z: T.accel_z_g };
    }
    return null;
  }

  /** 六面保存门控：必须近期 IMU 报文（不用无时间戳的 telemetry 缓存） */
  function getFreshImuGForCalibGate() {
    const now = Date.now();
    const hr = window.highresImuG;
    const sc = window.scaledImuG;
    if (hr && typeof hr.x === "number" && typeof hr.t === "number" && now - hr.t < ACCEL_CAL_IMU_MAX_AGE_MS) {
      return { x: hr.x, y: hr.y, z: hr.z };
    }
    if (sc && typeof sc.x === "number" && typeof sc.t === "number" && now - sc.t < ACCEL_CAL_IMU_MAX_AGE_MS) {
      return { x: sc.x, y: sc.y, z: sc.z };
    }
    return null;
  }

  /** 水平静置时：若主要分量在 Z 且为负，则后续比对只对 AccZ 取反（避免整向量取反搞错左右翼） */
  function probeImuFlipZFromLevelSample(live) {
    const gmag = vecLen3(live.x, live.y, live.z);
    if (gmag < ACCEL_CAL_G_MAG_MIN || gmag > ACCEL_CAL_G_MAG_MAX) return false;
    const inv = 1 / gmag;
    const mx = live.x * inv;
    const my = live.y * inv;
    const mz = live.z * inv;
    if (Math.abs(mx) > 0.35 || Math.abs(my) > 0.35) return false;
    if (Math.abs(mz) < 0.85) return false;
    return mz < 0;
  }

  /**
   * 校验加速度计读数是否与当前校准面一致（机体 FRD，与 FACES[].target 一致；可选仅对读数 Z 取反）。
   * @returns {{ ok: true } | { ok: false, message: string, hint?: string }}
   */
  function checkAccelSampleAgainstFace(face, live) {
    const gmag = vecLen3(live.x, live.y, live.z);
    if (gmag < ACCEL_CAL_G_MAG_MIN || gmag > ACCEL_CAL_G_MAG_MAX) {
      return {
        ok: false,
        message: `加速度模长异常（|G|≈${gmag.toFixed(2)}g）。请将飞控静止平放或轻拿轻放后再试。`,
        hint: `请按步骤静止摆放：${face.label}`,
      };
    }
    const inv = 1 / gmag;
    const mx = live.x * inv;
    const my = live.y * inv;
    let mz = live.z * inv;
    const [tx, ty, tz] = face.target;

    // 水平步：开始校准时若尚未收到 IMU，imuFlipZForFrd 可能未置位；此处根据 ±Z 与期望的吻合度自动锁定 Z 取反，避免误报约 180°。
    if (face.key === "level" && tx === 0 && ty === 0 && Math.abs(tz) > 0.5) {
      const dotKeep = mx * tx + my * ty + mz * tz;
      const dotFlipZ = mx * tx + my * ty + (-mz) * tz;
      const flipBetter =
        (dotFlipZ >= ACCEL_CAL_ALIGN_DOT_MIN && dotFlipZ > dotKeep) ||
        (dotKeep < -ACCEL_CAL_ALIGN_DOT_MIN && dotFlipZ > dotKeep);
      if (flipBetter) {
        accel.imuFlipZForFrd = true;
        mz = -mz;
        if (dotKeep < -ACCEL_CAL_ALIGN_DOT_MIN) {
          slog("六面校准：水平步检测到 AccZ 与 +Z 向下约定相反，已自动对 Z 取反（可能与开始时刻无 IMU 有关）。");
        }
      }
    } else if (accel.imuFlipZForFrd) {
      mz = -mz;
    }

    const dot = mx * tx + my * ty + mz * tz;
    if (dot < ACCEL_CAL_ALIGN_DOT_MIN) {
      const ang = (Math.acos(clamp(dot, -1, 1)) * 180) / Math.PI;
      const flipNote = accel.imuFlipZForFrd ? "（比对时已对 AccZ 按机载约定取反）" : "";
      return {
        ok: false,
        message:
          `当前姿态与「${face.label}」不符（与期望方向偏差约 ${ang.toFixed(0)}°）。\n\n飞控仍平放在桌面时无法通过侧立、倒立等步骤。\n请按图示与语音将机体摆到正确朝向后再点「保存」。\n\n期望重力方向（机体系）≈ [${tx}, ${ty}, ${tz}]${flipNote}\n用于比对的归一化加速度 ≈ [${mx.toFixed(2)}, ${my.toFixed(2)}, ${mz.toFixed(2)}]。`,
        hint: `${face.label} — ${face.speak}`,
      };
    }
    return { ok: true };
  }

  /** 由加速度计向量解算俯仰/横滚（g），偏航使用 ATTITUDE.yaw（弧度） */
  function physicalEulerFromImuG() {
    const live = getLiveImuG();
    if (!live) return null;
    const ax = live.x;
    const ay = live.y;
    const az = live.z;
    const roll = Math.atan2(ay, az) * (180 / Math.PI);
    const pitch = Math.atan2(-ax, Math.sqrt(ay * ay + az * az)) * (180 / Math.PI);
    let yaw = 0;
    if (typeof window.yaw === "number" && Number.isFinite(window.yaw)) {
      yaw = window.yaw * (180 / Math.PI);
    }
    return { pitch, roll, yaw };
  }

  /** 空闲或已完成一轮时：仅在有串口时允许再次「开始校准」；进行中由流程控制按钮状态 */
  function syncAccelCalibGate() {
    const start = $("sc-accel-start");
    if (!start) return;
    if (accel.calibState === "orienting" || accel.calibState === "measuring") return;
    start.disabled = !fcConnected();
  }

  function updateAccelLiveLabel() {
    const el = $("sc-accel-live");
    if (!el) return;
    if (!fcConnected()) {
      el.textContent =
        "未连接飞控：无法进行加速度计六面校准。请先连接串口。说明：补偿参数由飞控在收到校准指令后自行计算并写入机载参数，地面站不离线保存加速度矩阵。";
      el.style.color = "#8b95a8";
      syncAccelCalibGate();
      return;
    }
    const live = getLiveImuG();
    if (live) {
      el.textContent =
        "已连接：每步「保存」前会用 IMU 校验姿态是否与当前面一致；通过后再发 ACCELCAL_VEHICLE_POS。需近期 HIGHRES_IMU 或 SCALED_IMU / IMU2 / IMU3 报文。";
      el.style.color = "#10b981";
    } else {
      el.textContent = "已连接：等待 IMU 数据（请确认已请求消息间隔）…";
      el.style.color = "#f59e0b";
    }
    syncAccelCalibGate();
  }

  /* ---------- Accel six-face ---------- */
  function faceEl(face, index) {
    const li = document.createElement("li");
    li.className = "sc-face-item sc-face-pending";
    li.dataset.faceKey = face.key;
    const dot = document.createElement("span");
    dot.className = "sc-dot";
    const span = document.createElement("span");
    span.textContent = face.label;
    li.appendChild(dot);
    li.appendChild(span);
    return li;
  }

  function renderFaceList() {
    const ul = $("sc-six-face-list");
    if (!ul) return;
    ul.innerHTML = "";
    FACES.forEach((f, i) => ul.appendChild(faceEl(f, i)));
  }

  function updateFaceDom() {
    const ul = $("sc-six-face-list");
    if (!ul) return;
    const items = ul.querySelectorAll(".sc-face-item");
    items.forEach((el, i) => {
      el.classList.remove("sc-face-pending", "sc-face-active", "sc-face-done", "sc-face-fail");
      if (accel.calibState === "idle") {
        el.classList.add("sc-face-pending");
        return;
      }
      if (i < accel.currentIndex) el.classList.add("sc-face-done");
      else if (i === accel.currentIndex) {
        if (accel.calibState === "measuring") el.classList.add("sc-face-active");
        else el.classList.add("sc-face-active");
      } else el.classList.add("sc-face-pending");
    });
  }

  function setAccelProgressBar() {
    const bar = $("sc-accel-progress-bar");
    const txt = $("sc-accel-progress-text");
    const idle = accel.calibState === "idle";
    const done = accel.calibState === "success";
    const pct = idle ? 0 : done ? 100 : Math.round((accel.currentIndex / FACES.length) * 100);
    if (bar) bar.style.width = `${pct}%`;
    if (txt) {
      const stepNum = idle ? 0 : done ? FACES.length : Math.min(accel.currentIndex + 1, FACES.length);
      txt.textContent = `${pct}% (步骤 ${stepNum}/${FACES.length})`;
    }
  }

  function accelHint(text, green) {
    const h = $("sc-accel-hint");
    if (!h) return;
    h.textContent = text;
    h.classList.toggle("sc-hint--green", !!green);
    h.classList.toggle("sc-hint--amber", !green);
    h.classList.toggle("sc-breathe-wrap", !green);
  }

  function setDroneStep(stepKey) {
    const scene = $("sc-drone-scene");
    if (scene) scene.setAttribute("data-step", stepKey);
  }

  function burstParticles() {
    const host = $("sc-accel-particles");
    if (!host) return;
    host.hidden = false;
    for (let i = 0; i < 14; i++) {
      const p = document.createElement("span");
      p.className = "sc-particle";
      p.style.left = `${40 + Math.random() * 60}%`;
      p.style.top = `${35 + Math.random() * 40}%`;
      p.style.setProperty("--dx", `${(Math.random() - 0.5) * 80}px`);
      p.style.setProperty("--dy", `${-20 - Math.random() * 60}px`);
      host.appendChild(p);
    }
    setTimeout(() => {
      host.innerHTML = "";
      host.hidden = true;
    }, 800);
  }

  function accelSimTick() {
    const now = performance.now();
    const dt = accel.lastSimT ? Math.min(0.05, (now - accel.lastSimT) / 1000) : 1 / 60;
    accel.lastSimT = now;

    const qIdleDemo = quatFromPRY(18, -12, 38);
    let qTarget;

    if (accel.calibState === "success") {
      qTarget = quatFromPRY(0, 0, (now / 38) % 360);
    } else if (accel.calibState === "idle") {
      if (fcConnected()) {
        const phy = physicalEulerFromImuG();
        qTarget = phy ? quatFromPRY(phy.pitch, phy.roll, phy.yaw) : qIdleDemo;
      } else {
        // 未连接：无 IMU 驱动，但保留演示用慢速旋转（与 success 态同速公式）
        qTarget = quatFromPRY(18, -12, (now / 38) % 360);
      }
    } else {
      const face = FACES[accel.currentIndex];
      if (face) {
        const [fp, fr, fy] = face.euler;
        qTarget = quatFromPRY(fp, fr, fy + ACCEL_CAL_VIEW_YAW_DEG);
      } else {
        qTarget = qIdleDemo;
      }
    }

    const smooth = 1 - Math.exp(-11 * dt);
    accel.currentQ = quatSlerp(accel.currentQ, qTarget, clamp(smooth, 0.035, 1));
    draw3DAircraft("sc-accel-canvas-3d", accel.currentQ);

    const live = fcConnected() ? getLiveImuG() : null;
    if (!fcConnected()) {
      accel.sim[0] = 0;
      accel.sim[1] = 0;
      accel.sim[2] = 0;
    } else if (live) {
      accel.sim[0] = live.x;
      accel.sim[1] = live.y;
      accel.sim[2] = live.z;
    } else if (accel.calibState === "orienting" || accel.calibState === "measuring") {
      const face = FACES[accel.currentIndex];
      const tgt = face ? face.target : [0, 0, 1];
      const noise = accel.calibState === "measuring" ? 0.022 : 0.008;
      const t = accel.calibState === "measuring" ? 0.18 : 0.07;
      for (let i = 0; i < 3; i++) {
        const goal = tgt[i] + (Math.random() - 0.5) * noise;
        accel.sim[i] = lerp(accel.sim[i], goal, t);
      }
    } else {
      accel.sim[0] = 0;
      accel.sim[1] = 0;
      accel.sim[2] = 0;
    }
    const g = vecLen3(accel.sim[0], accel.sim[1], accel.sim[2]);
    const x = $("sc-acc-x");
    const y = $("sc-acc-y");
    const z = $("sc-acc-z");
    const gg = $("sc-acc-g");
    if (x) x.textContent = accel.sim[0].toFixed(2);
    if (y) y.textContent = accel.sim[1].toFixed(2);
    if (z) z.textContent = accel.sim[2].toFixed(2);
    if (gg) gg.textContent = g.toFixed(3);
    accel.raf = requestAnimationFrame(accelSimTick);
  }

  function startAccelSim() {
    cancelAnimationFrame(accel.raf);
    accel.raf = requestAnimationFrame(accelSimTick);
  }

  function resetAccelUi() {
    accel.calibState = "idle";
    accel.currentIndex = 0;
    accel.imuFlipZForFrd = false;
    accel.sim = [0, 0, 0];
    accel.lastSimT = 0;
    accel.currentQ = quatFromPRY(18, -12, 38);
    setDroneStep("level");
    const abort = $("sc-accel-abort");
    const meas = $("sc-accel-measure");
    syncAccelCalibGate();
    if (abort) abort.disabled = true;
    if (meas) meas.disabled = true;
    accelHint("请将飞机水平静置在桌面", false);
    updateFaceDom();
    setAccelProgressBar();
    updateAccelLiveLabel();
  }

  async function sendFcAccelStart() {
    if (!fcConnected()) throw new Error("未连接串口");
    if (typeof window.sendCommandLong !== "function") throw new Error("发送接口不可用");
    await window.sendCommandLong(MAV_CMD_PREFLIGHT_CALIBRATION, 0, 0, 0, 0, 1, 0, 0);
    slog("已发送 PREFLIGHT_CALIBRATION：启动加速度计校准 (param5=1)");
    await sleep(400);
  }

  async function sendFcAccelAbort() {
    if (fcConnected() && typeof window.sendAccelcalVehiclePos === "function") {
      await window.sendAccelcalVehiclePos(7);
      slog("已发送 ACCELCAL_VEHICLE_POS FAILED，中止加速度计校准");
    }
  }

  function bindAccel() {
    renderFaceList();
    resetAccelUi();
    startAccelSim();

    $("sc-ahrs-apply")?.addEventListener("click", async () => {
      const sel = $("sc-orient-select");
      if (!sel || typeof window.sendParamSet !== "function") return;
      if (!fcConnected()) {
        window.alert("请先连接串口与飞控。");
        return;
      }
      const key = sel.value;
      const v = AHRS_ORIENT_BY_SELECT[key];
      if (v === undefined) {
        window.alert("未知朝向键值");
        return;
      }
      const ok = await window.sendParamSet("AHRS_ORIENT", v);
      slog(ok ? `已下发 AHRS_ORIENT=${v} (${key})` : "AHRS_ORIENT 下发失败");
    });

    $("sc-accel-start")?.addEventListener("click", async () => {
      if (!fcConnected()) {
        window.alert(
          "请先连接串口与飞控后再进行加速度计六面校准。\n\n未连接时不会向飞控写入任何校准数据；补偿由飞控固件在校准流程中完成。"
        );
        return;
      }
      try {
        await sendFcAccelStart();
      } catch (e) {
        const reason = e?.message || String(e);
        slog(`加速度计启动命令失败: ${reason}`);
        window.alert(
          `无法启动飞控加速度计校准：${reason}\n\n请检查串口、目标系统是否在线、固件是否支持该指令，然后重试。`
        );
        return;
      }
      accel.imuFlipZForFrd = false;
      let probe = getFreshImuGForCalibGate();
      if (!probe) {
        await sleep(280);
        probe = getFreshImuGForCalibGate();
      }
      if (probe) {
        accel.imuFlipZForFrd = probeImuFlipZFromLevelSample(probe);
        if (accel.imuFlipZForFrd) {
          slog("六面校准：水平时 AccZ 与 FRD +Z 向下约定相反，各步比对仅对加速度 Z 分量取反（左右翼仍按 Y 判断）。");
        }
      }
      accel.calibState = "orienting";
      accel.currentIndex = 0;
      const face = FACES[0];
      setDroneStep(face.step);
      speak(face.speak);
      accelHint(`提示：${face.label} — ${face.speak}`, false);
      $("sc-accel-start").disabled = true;
      $("sc-accel-abort").disabled = false;
      $("sc-accel-measure").disabled = false;
      updateFaceDom();
      setAccelProgressBar();
    });

    $("sc-accel-abort")?.addEventListener("click", async () => {
      await sendFcAccelAbort();
      speak("校准已中止");
      resetAccelUi();
    });

    $("sc-accel-measure")?.addEventListener("click", async () => {
      if (accel.calibState !== "orienting" && accel.calibState !== "measuring") return;
      if (!fcConnected()) {
        window.alert("串口已断开，无法继续向飞控下发校准步骤。校准已中止。");
        speak("校准已中止");
        resetAccelUi();
        return;
      }
      const face = FACES[accel.currentIndex];
      if (!face) return;

      const liveGate = getFreshImuGForCalibGate();
      if (!liveGate) {
        window.alert(
          "未收到近期的 IMU 加速度数据，无法校验姿态。\n\n请确认已连接飞控；地面站会请求 HIGHRES_IMU、SCALED_IMU / IMU2 / IMU3。若仍无数据，请在飞控端提高 IMU 外发速率（如 SR*_IMU）后重连，将飞控静止后再点保存。"
        );
        return;
      }
      const orientCheck = checkAccelSampleAgainstFace(face, liveGate);
      if (!orientCheck.ok) {
        slog(`加速度计姿态校验未通过: ${face.label}`);
        if (orientCheck.hint) accelHint(orientCheck.hint, false);
        window.alert(orientCheck.message);
        return;
      }

      accel.calibState = "measuring";
      updateFaceDom();
      speak("正在保存当前位置，请保持静止");
      if (typeof window.sendAccelcalVehiclePos === "function") {
        try {
          const ok = await window.sendAccelcalVehiclePos(face.mavlinkPos);
          if (!ok) {
            slog(`ACCELCAL_VEHICLE_POS 未发送 (${face.label})`);
            window.alert("无法下发当前校准面（串口不可用）。校准已中止。");
            await sendFcAccelAbort();
            resetAccelUi();
            return;
          }
          slog(`ACCELCAL_VEHICLE_POS position=${face.mavlinkPos} (${face.label})`);
        } catch (e) {
          slog(`发送姿态位置失败: ${e?.message || e}`);
          window.alert(`下发校准姿态失败：${e?.message || e}\n\n校准已中止，请检查连接后重新开始。`);
          await sendFcAccelAbort();
          resetAccelUi();
          return;
        }
        await sleep(1000);
      } else {
        window.alert("当前环境不支持向飞控发送校准指令，无法继续。");
        await sendFcAccelAbort();
        resetAccelUi();
        return;
      }
      accel.calibState = "orienting";
      burstParticles();
      accel.currentIndex += 1;
      if (accel.currentIndex >= FACES.length) {
        let successSent = false;
        if (fcConnected() && typeof window.sendAccelcalVehiclePos === "function") {
          try {
            successSent = await window.sendAccelcalVehiclePos(6);
            if (successSent) slog("ACCELCAL_VEHICLE_POS SUCCESS(6)");
          } catch (e) {
            slog(`发送校准完成指令失败: ${e?.message || e}`);
          }
        }
        accel.calibState = "success";
        speak("加速度计六面校准全部顺利完成");
        if (successSent) {
          accelHint(
            "已向飞控发送六面完成指令。加速度补偿由机载固件计算并写入参数，并非由地面站上传矩阵；请在消息区确认校准成功提示，并按固件要求决定是否重启。",
            true
          );
          slog(
            "六面位置指令已发齐；是否写入成功以飞控 STATUSTEXT / 参数为准，本界面仅负责下发 MAVLink 校准流程指令。"
          );
        } else {
          accelHint("未能确认已向飞控发送完成指令，请检查连接与日志后重试。", false);
        }
        setDroneStep("level");
        $("sc-accel-measure").disabled = true;
        $("sc-accel-abort").disabled = true;
        syncAccelCalibGate();
        updateFaceDom();
        itemsAllDone();
      } else {
        const next = FACES[accel.currentIndex];
        setDroneStep(next.step);
        speak(next.speak);
        accelHint(`提示：${next.label} — ${next.speak}`, false);
        updateFaceDom();
      }
      setAccelProgressBar();
    });
  }

  function itemsAllDone() {
    const ul = $("sc-six-face-list");
    if (!ul) return;
    ul.querySelectorAll(".sc-face-item").forEach((el) => {
      el.classList.remove("sc-face-pending", "sc-face-active");
      el.classList.add("sc-face-done");
    });
  }

  function boot() {
    document.addEventListener("gcs-connection", updateAccelLiveLabel);
    bindAccel();
    updateAccelLiveLabel();
    window.sensorCalibAccelUpdateLive = updateAccelLiveLabel;
    window.project3DAccel = project3D;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();