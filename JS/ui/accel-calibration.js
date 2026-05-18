(function initAccelCalibration() {
  /** @typedef {'idle'|'orienting'|'measuring'|'success'|'failed'} CalibState */
  /** @typedef {'level'|'left'|'right'|'up'|'down'|'back'} AccelAxisKey */

  /**
   * 六面向飞控下发 `MAV_CMD_ACCELCAL_VEHICLE_POS`（COMMAND_LONG，param1 为枚举），与 ArduPilot 一致（参见
   * https://ardupilot.org/copter/docs/common-accelerometer-calibration.html ）
   *
   * 【与 ArduPilot GCS_Common.cpp 对齐的要点】
   * - `MAV_CMD_PREFLIGHT_CALIBRATION`（241）：地面站发 COMMAND_LONG 时 **param5** 经 `convert_COMMAND_LONG_to_COMMAND_INT`
   *   写入 COMMAND_INT 的 **x**，与 `packet.x == PREFLIGHT_CALIBRATION_ACCELEROMETER_FULL`（值为 1）匹配时进入完整加速度六面。
   * - 该分支内 **先同步** `AP::ins().calibrate_gyros()`，再 `acal_init()` + `AP_AccelCal::start()`；`handle_command_long` 在整段处理完后才发 **COMMAND_ACK**。
   *   Mission Planner 对 `PREFLIGHT_CALIBRATION`+param5=1 **不等待 ACK**（`MAVLinkInterface.doCommand` 发送后即 `return true`），避免串口侧阻塞；红蓝灯多出现在陀螺仪阶段。
   * - 后续六面由 `AP_AccelCal::update()` 驱动；地面站用 `MAV_CMD_ACCELCAL_VEHICLE_POS`（42429）param1 回传姿态（非旧 msg 167）。
   *
   * 【动画与 IMU 刻意解耦】画布上 attitudeRoot 的四元数链（accelSimTick）只服务 Three.js
   * 示意：世界系 Y 上、X/Z 在桌面内，再叠模型顶点系与基准旋转；与下面「机体系 FRD」不是同一套轴，
   * 也不要从动画姿态反推 FACES[].target。校验、保存、MAV_CMD_ACCELCAL_VEHICLE_POS 一律只看 IMU 与 target。
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
   * 【侧栏 label】步骤短名。FACES[].euler 多为历史/备用，当前各步 3D 以 accelSimTick 为准。
   */
  /** 与 MAVLink ACCELCAL_VEHICLE_POS 枚举一致（1=LEVEL … 6=BACK），勿用 0..5 旧偏移 */
  const ACCELCAL_POS_LEVEL = 1;
  const ACCELCAL_POS_LEFT = 2;
  const ACCELCAL_POS_RIGHT = 3;
  const ACCELCAL_POS_NOSEDOWN = 4;
  const ACCELCAL_POS_NOSEUP = 5;
  const ACCELCAL_POS_BACK = 6;
  const ACCELCAL_POS_SUCCESS = 16777215;
  const ACCELCAL_POS_FAILED = 16777216;

  const FACES = [
    {
      key: "level",
      label: "水平置放",
      step: "level",
      target: [0, 0, 1],
      mavlinkPos: ACCELCAL_POS_LEVEL,
      speak: "第一步，请将飞机水平静置在桌面",
      euler: [0, 0, 0],
    },
    {
      key: "left",
      label: "向左侧立",
      step: "left",
      target: [0, -1, 0],
      mavlinkPos: ACCELCAL_POS_LEFT,
      speak: "第二步，请将飞机向左侧立九十度",
      euler: [0, -90, 0],
    },
    {
      key: "right",
      label: "向右侧立",
      step: "right",
      target: [0, 1, 0],
      mavlinkPos: ACCELCAL_POS_RIGHT,
      speak: "第三步，请将飞机向右侧立九十度",
      euler: [0, 90, 0],
    },
    {
      key: "up",
      label: "向上放置",
      step: "up",
      target: [-1, 0, 0],
      mavlinkPos: ACCELCAL_POS_NOSEUP,
      speak: "第四步，向上放置，请将机头竖直朝上静置",
      euler: [90, 0, 0],
    },
    {
      key: "down",
      label: "头部朝下",
      step: "down",
      target: [1, 0, 0],
      mavlinkPos: ACCELCAL_POS_NOSEDOWN,
      speak: "第五步，请将飞机机头垂直朝下",
      euler: [-90, 0, 0],
    },
    {
      key: "back",
      label: "背部朝上",
      step: "back",
      target: [0, 0, -1],
      mavlinkPos: ACCELCAL_POS_BACK,
      speak: "第六步，请将飞机翻转一百八十度背部朝上",
      euler: [0, 180, 0],
    },
  ];
  /**
   * 六面校准 3D：仅当 accelSimTick 走 FACES[].euler 回退分支时叠 yaw；与 IMU/FRD 无关。
   */
  const ACCEL_CAL_VIEW_YAW_DEG = 90;

  /**
   * 第四～六步 3D 动画（与 IMU 解耦，见 accelSimTick）：④ 第一步绕世界 Z +90°；⑤ ④ 绕世界 X +180°；⑥ 第一步绕世界 X +180°。
   */

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

  /** 绕机体系 Z 轴的四元数（角度制） */
  function quatFromZDeg(zDeg) {
    const rad = zDeg * D2R;
    const half = rad * 0.5;
    return { w: Math.cos(half), x: 0, y: 0, z: Math.sin(half) };
  }

  /** 绕世界/机体系 Y 轴的四元数（角度制） */
  function quatFromYDeg(yDeg) {
    const rad = yDeg * D2R;
    const half = rad * 0.5;
    return { w: Math.cos(half), x: 0, y: Math.sin(half), z: 0 };
  }

  /** 绕世界/机体系 X 轴的四元数（角度制，右手系） */
  function quatFromXDeg(xDeg) {
    const rad = xDeg * D2R;
    const half = rad * 0.5;
    return { w: Math.cos(half), x: Math.sin(half), y: 0, z: 0 };
  }

  /** Hamilton 积 a*b（与 Three.js 中先施加 b 再施加 a 的 premultiply 链一致：world 旋转 * 当前姿态） */
  function quatMultiply(a, b) {
    return quatNormalize({
      w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
      x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    });
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
   * 赛斯纳 182 风格上单翼：机身多截面环 + 锥形机翼/撑杆/三叶桨/整流罩等，零件细分。
   * 体轴：x 右翼展、y 向机头、z 向上；映射 FRD：(x_frd,y_frd,z_frd)=(y,x,-z)。
   * faces[].m：与 accel-calib-three.js 中 MAT 材质组一致（漆面/机翼/镀铬/…）。
   */
  function buildCessnaCalibrationModel() {
    const SCALE = 0.36;

    const MAT = {
      FUSE: 0,
      WING: 1,
      CHROME: 2,
      RED: 3,
      PROP: 4,
      GLASS: 5,
      RUBBER: 6,
      SPINNER: 7,
      PLASTIC: 8,
      GOLD: 9,
    };

    const raw = [];
    /** @type {Array<{a:number,b:number,c:number,cr:number,cg:number,cb:number,m?:number}>} */
    const faces = [];

    function addV(x, y, z) {
      raw.push({ x, y, z });
      return raw.length - 1;
    }

    function tri(a, b, c, cr, cg, cb, m) {
      faces.push({ a, b, c, cr, cg, cb, m });
    }

    function quad(a, b, c, d, cr, cg, cb, m) {
      tri(a, b, c, cr, cg, cb, m);
      tri(a, c, d, cr, cg, cb, m);
    }

    /** 机身环：y 机头→尾，wTop/wBot 半宽，zTop/zBot 高度 */
    const ringSpec = [
      [140, 0.9, 0.9, 12.0, 9.5],
      [131, 8.0, 7.2, 15.8, 5.8],
      [118, 12.0, 11.0, 19.2, 4.5],
      [102, 13.8, 12.6, 21.5, 5.2],
      [84, 15.2, 14.2, 23.8, 6.5],
      [64, 16.4, 15.4, 25.2, 7.8],
      [44, 17.0, 15.8, 25.6, 8.2],
      [24, 16.4, 15.2, 24.8, 9.0],
      [4, 15.4, 14.2, 23.5, 9.8],
      [-16, 14.2, 12.8, 22.0, 10.0],
      [-38, 12.6, 10.8, 20.0, 9.8],
      [-60, 10.2, 8.4, 17.5, 9.2],
      [-80, 7.8, 6.0, 15.0, 8.5],
      [-96, 5.2, 4.0, 13.0, 8.0],
    ];

    /** @type {number[][]} 每环 [RT, LT, LB, RB] */
    const rings = ringSpec.map(([y, wT, wB, zT, zB]) => [
      addV(wT, y, zT),
      addV(-wT, y, zT),
      addV(-wB, y, zB),
      addV(wB, y, zB),
    ]);

    /** 沿机身纵向线性插值（ringSpec 自机头向机尾 y 递减） */
    function interpRingY(y, col) {
      const rows = ringSpec;
      if (y >= rows[0][0]) return rows[0][col];
      if (y <= rows[rows.length - 1][0]) return rows[rows.length - 1][col];
      for (let i = 0; i < rows.length - 1; i++) {
        const y0 = rows[i][0];
        const y1 = rows[i + 1][0];
        if ((y <= y0 && y >= y1) || (y >= y0 && y <= y1)) {
          const t = (y - y0) / (y1 - y0);
          return rows[i][col] * (1 - t) + rows[i + 1][col] * t;
        }
      }
      return rows[rows.length - 1][col];
    }
    function halfWidthTopAt(y) {
      return interpRingY(y, 1);
    }
    function topZAt(y) {
      return interpRingY(y, 3);
    }

    const noseTip = addV(0, 145, 11.2);
    const R0 = rings[0];
    tri(noseTip, R0[1], R0[0], 218, 52, 58, MAT.RED);
    tri(noseTip, R0[2], R0[1], 205, 48, 54, MAT.RED);
    tri(noseTip, R0[3], R0[2], 228, 62, 66, MAT.RED);
    tri(noseTip, R0[0], R0[3], 212, 55, 60, MAT.RED);

    const cream = [250, 248, 242];
    const belly = [210, 214, 222];
    for (let i = 0; i < rings.length - 1; i++) {
      const A = rings[i];
      const B = rings[i + 1];
      const topRed = i < 2;
      const tc = topRed ? [220, 58, 64] : cream;
      quad(A[1], A[0], B[0], B[1], tc[0], tc[1], tc[2], topRed ? MAT.RED : MAT.FUSE);
      quad(A[2], A[1], B[1], B[2], cream[0], cream[1], cream[2], MAT.FUSE);
      quad(A[3], A[2], B[2], B[3], belly[0], belly[1], belly[2], MAT.FUSE);
      quad(A[0], A[3], B[3], B[0], cream[0], cream[1], cream[2], MAT.FUSE);
    }

    const tailBumper = addV(0, -102, 9.5);

    // —— 风挡与侧窗（玻璃 + 镀铬框）——
    const sh = addV(0, 90, 26.2);
    const sl = addV(-7.5, 86, 25.4);
    const sr = addV(7.5, 86, 25.4);
    const sf = addV(0, 82, 24.0);
    tri(sh, sl, sr, 120, 165, 210, MAT.GLASS);
    tri(sl, sf, sr, 90, 130, 175, MAT.GLASS);
    quad(sh, sr, rings[4][0], rings[4][1], 165, 175, 185, MAT.CHROME);
    quad(sl, sh, rings[4][1], rings[4][2], 165, 175, 185, MAT.CHROME);

    // 侧窗（左右）
    const wl0 = addV(-15.2, 58, 21.5);
    const wl1 = addV(-15.2, 42, 21.2);
    const wl2 = addV(-14.0, 42, 14.5);
    const wl3 = addV(-14.0, 58, 14.8);
    quad(wl0, wl1, wl2, wl3, 55, 85, 130, MAT.GLASS);
    tri(wl0, wl3, rings[6][1], 175, 182, 190, MAT.CHROME);
    const wr0 = addV(15.2, 58, 21.5);
    const wr1 = addV(15.2, 42, 21.2);
    const wr2 = addV(14.0, 42, 14.5);
    const wr3 = addV(14.0, 58, 14.8);
    quad(wr0, wr3, wr2, wr1, 55, 85, 130, MAT.GLASS);
    tri(wr0, rings[6][0], wr3, 175, 182, 190, MAT.CHROME);

    // —— 机翼：182 式高翼 —— 根缘贴合机身上表面半宽，避免翼身分离缝
    const bU = [38, 88, 198];
    const bD = [28, 68, 175];
    const bE = [22, 52, 138];

    function wingHalf(side) {
      const s = side;
      /** 182：全展约 1.25×机身全长；半展与机身长度同量级 */
      const dihedral = 0.086;
      const thick = 9.5; // 增加机翼厚度（原6.85 -> 9.5）
      /** span：自机身侧壁向外的展向增量；翼根 x = 半宽(le/te)×s，与机身相连 */
      const stations = [
        { span: 0, leY: 53.0, teY: 35.0, zBump: 0.92 },
        { span: 55.0, leY: 48.5, teY: 32.4, zBump: 1.04 }, // 增加翼展（原43.5 -> 55.0）
        { span: 110.0, leY: 43.6, teY: 28.6, zBump: 1.18 }, // 增加翼展（原87.5 -> 110.0）
        { span: 165.0, leY: 38.0, teY: 23.8, zBump: 1.34 }, // 增加翼展（原128.0 -> 165.0）
      ];
      const U = [];
      const T = [];
      const L = [];
      const B = [];
      for (const st of stations) {
        const wLe = halfWidthTopAt(st.leY);
        const wTe = halfWidthTopAt(st.teY);
        const wRoot = Math.max(wLe, wTe) * 0.992;
        const xAbs = wRoot + st.span;
        const x = xAbs * s;
        const zBase = topZAt(st.leY) + st.zBump;
        const zUp = zBase + dihedral * Math.abs(xAbs);
        const zLo = zUp - thick;
        U.push(addV(x, st.leY, zUp));
        T.push(addV(x, st.teY, zUp - 0.45));
        L.push(addV(x, st.leY, zLo + 0.15));
        B.push(addV(x, st.teY, zLo + 0.35));
      }
      for (let k = 0; k < 3; k++) {
        quad(U[k], U[k + 1], T[k + 1], T[k], bU[0], bU[1], bU[2], MAT.WING);
        quad(L[k], B[k], B[k + 1], L[k + 1], bD[0], bD[1], bD[2], MAT.WING);
        quad(T[k], T[k + 1], B[k + 1], B[k], bE[0], bE[1], bE[2], MAT.WING);
        quad(U[k], L[k], L[k + 1], U[k + 1], bD[0], bD[1], bD[2], MAT.WING);
      }
      const xTip = (Math.max(halfWidthTopAt(stations[3].leY), halfWidthTopAt(stations[3].teY)) * 0.992 + stations[3].span) * s;
      const tipZU = topZAt(stations[3].leY) + stations[3].zBump + dihedral * Math.abs(xTip / s);
      const capU = addV(xTip + 3.5 * s, 37.5, tipZU + 0.5);
      tri(U[3], T[3], capU, 255, 205, 75, MAT.PLASTIC);
      const capL = addV(xTip + 3.5 * s, 37.5, tipZU - thick + 0.1);
      tri(B[3], L[3], capL, 195, 155, 55, MAT.PLASTIC);
      const midSpan = Math.max(halfWidthTopAt(stations[2].leY), halfWidthTopAt(stations[2].teY)) * 0.992 + stations[2].span;
      const fuelZ = topZAt(stations[2].leY) + stations[2].zBump + dihedral * midSpan + 0.12;
      const fuel = addV(midSpan * s, 42.0, fuelZ);
      const w1 = Math.max(halfWidthTopAt(stations[1].leY), halfWidthTopAt(stations[1].teY)) * 0.992 + stations[1].span;
      const z1 = topZAt(stations[1].leY) + stations[1].zBump + dihedral * w1 + 0.38;
      tri(U[1], addV(w1 * s, 41.0, z1), fuel, 215, 218, 228, MAT.CHROME);
      const zR = topZAt(53) - 0.35;
      return { i0: U[0], i6: U[3], j0: L[0], zR, s };
    }

    const wR = wingHalf(1);
    wingHalf(-1);

    // —— 翼身整流罩（白色小鼓包）——
    const fairF = addV(17, 40, wR.zR + 0.3);
    const fairB = addV(12, 32, wR.zR - 1);
    const fairF2 = addV(-17, 40, wR.zR + 0.3);
    const fairB2 = addV(-12, 32, wR.zR - 1);
    quad(fairF, rings[6][0], rings[6][1], fairF2, cream[0], cream[1], cream[2], MAT.FUSE);
    quad(fairB, fairB2, rings[7][2], rings[7][3], cream[0], cream[1], cream[2], MAT.FUSE);

    // —— 翼撑杆（镀铬）——
    function strut(s) {
      const a0 = addV(13 * s, 26, 11.5);
      const a1 = addV(10 * s, 25, 10.8);
      const b0 = addV(78 * s, 44.5, 27.2);
      const b1 = addV(74 * s, 42.5, 26.9);
      quad(a0, a1, b1, b0, 195, 198, 205, MAT.CHROME);
      // 增加撑杆厚度：从 0.9 增加到 2.2
      const o = 2.2 * s;
      const a0b = addV(13 * s + o, 26, 11.2);
      const a1b = addV(10 * s + o, 25, 10.5);
      const b0b = addV(78 * s + o, 44.5, 26.9);
      const b1b = addV(74 * s + o, 42.5, 26.6);
      quad(a0, b0, b0b, a0b, 185, 188, 195, MAT.CHROME);
      quad(a0, a0b, a1b, a1, 185, 188, 195, MAT.CHROME);
      quad(a1, a1b, b1b, b1, 185, 188, 195, MAT.CHROME);
      quad(b0, b1, b1b, b0b, 185, 188, 195, MAT.CHROME);
    }
    strut(1);
    strut(-1);

    // —— 排气管（机身下）——
    function exhaust(sx) {
      const y0 = 108;
      const z0 = 3.2;
      const p0 = addV(sx + 1.2, y0, z0);
      const p1 = addV(sx - 1.2, y0, z0);
      const p2 = addV(sx - 1.2, y0 + 5, z0);
      const p3 = addV(sx + 1.2, y0 + 5, z0);
      const p4 = addV(sx + 1.0, y0, z0 - 2.2);
      const p5 = addV(sx - 1.0, y0, z0 - 2.2);
      const p6 = addV(sx - 1.0, y0 + 5, z0 - 2.2);
      const p7 = addV(sx + 1.0, y0 + 5, z0 - 2.2);
      quad(p0, p1, p2, p3, 160, 162, 168, MAT.CHROME);
      quad(p4, p7, p6, p5, 150, 152, 158, MAT.CHROME);
      quad(p0, p3, p7, p4, 155, 157, 163, MAT.CHROME);
      quad(p1, p5, p6, p2, 155, 157, 163, MAT.CHROME);
    }
    exhaust(11);
    exhaust(-11);

    // —— 背鳍 + 垂尾 + 方向舵（红/白）——
    // 定义垂尾安装位置，确保嵌入机身背部并与机尾对齐
    const finRootY = -70; // 垂尾根部中心Y坐标（向前移动，确保与机尾协调）
    const finTipY = -96; // 垂尾顶部Y坐标（与机尾末端对齐）
    const finHeight = 48; // 垂尾高度（增加到原来的1.5倍：32 * 1.5 = 48）
    const finThickness = 2.5; // 垂尾厚度
    
    // 获取机身背部在 finRootY 处的高度，用于精确嵌入
    const finBaseZ = topZAt(finRootY); // 机身背部表面Z
    const finTipZ = finBaseZ + finHeight;
    
    // 找到与垂尾位置相近的机身环索引
    // rings[11] y=-60, rings[12] y=-80
    const ringIdxRoot = 11; // 垂尾根部对应的机身环（向前调整）
    const ringIdxTip = 12;  // 垂尾顶部对应的机身环
    
    // 垂尾轮廓点（从侧面看，具有后掠角）
    // 前缘：从根部到顶部向后倾斜
    const finLeadingEdgeRootZ = finBaseZ + 3; // 根部前缘高度
    const finLeadingEdgeTipZ = finTipZ - 12;   // 顶部前缘高度（后掠，按比例增加）
    
    // 后缘：更明显的后掠
    const finTrailingEdgeRootZ = finBaseZ + 22; // 根部后缘高度（按比例增加）
    const finTrailingEdgeTipZ = finTipZ - 38;   // 顶部后缘高度（按比例增加）
    
    // 垂尾左表面顶点 (X = -thickness/2)
    const finLL = addV(-finThickness/2, finRootY, finLeadingEdgeRootZ);  // 左下前
    const finLTL = addV(-finThickness/2, finTipY, finLeadingEdgeTipZ);   // 左上前
    const finLTRL = addV(-finThickness/2, finTipY, finTrailingEdgeTipZ); // 左上后
    const finLRL = addV(-finThickness/2, finRootY, finTrailingEdgeRootZ);// 左下后
    
    // 垂尾右表面顶点 (X = thickness/2)
    const finLR = addV(finThickness/2, finRootY, finLeadingEdgeRootZ);   // 右下前
    const finLTR = addV(finThickness/2, finTipY, finLeadingEdgeTipZ);    // 右上前
    const finLTRR = addV(finThickness/2, finTipY, finTrailingEdgeTipZ);  // 右上后
    const finLRR = addV(finThickness/2, finRootY, finTrailingEdgeRootZ); // 右下后
    
    // 绘制垂尾主体 (白色)
    // 左侧面
    tri(finLL, finLTL, finLRL, 248, 246, 242, MAT.FUSE);
    tri(finLTL, finLTRL, finLRL, 248, 246, 242, MAT.FUSE);
    // 右侧面
    tri(finLR, finLRL, finLTR, 248, 246, 242, MAT.FUSE);
    tri(finLTR, finLRL, finLTRR, 248, 246, 242, MAT.FUSE);
    // 顶面（前缘到后缘）
    quad(finLTL, finLTR, finLTRR, finLTRL, 245, 245, 250, MAT.FUSE);
    // 后缘面
    quad(finLRL, finLTRL, finLTRR, finLRR, 240, 240, 245, MAT.FUSE);
    
    // 连接到机身的过渡面 - 使用机身环的顶点确保无缝连接
    const ringRootLeft = rings[ringIdxRoot][1]; // 根部左侧机身点
    const ringRootRight = rings[ringIdxRoot][0]; // 根部右侧机身点
    
    // 左侧连接面
    tri(ringRootLeft, finLL, finLRL, cream[0], cream[1], cream[2], MAT.FUSE);
    // 右侧连接面
    tri(ringRootRight, finLRR, finLR, cream[0], cream[1], cream[2], MAT.FUSE);
    // 前缘底部连接
    quad(ringRootLeft, ringRootRight, finLR, finLL, cream[0], cream[1], cream[2], MAT.FUSE);
    // 后缘底部连接
    quad(ringRootLeft, finLRL, finLRR, ringRootRight, cream[0], cream[1], cream[2], MAT.FUSE);
    
    // 方向舵 (红色部分，附着在垂尾后缘下半部分)
    const rudderHingeY = finRootY - 5; // 方向舵铰链位置（从垂尾根部向下）
    const rudderHingeZ = finBaseZ + 14; // 铰链高度
    
    // 方向舵顶点 - 覆盖垂尾后缘的下半部分
    const rudTopFront_L = addV(-finThickness/2 - 0.3, rudderHingeY + 3, rudderHingeZ + 2);
    const rudBotFront_L = addV(-finThickness/2 - 0.3, finTipY + 2, finLeadingEdgeTipZ + 2);
    const rudTopBack_L = addV(-finThickness/2 - 0.3, rudderHingeY + 3, rudderHingeZ - 8);
    const rudBotBack_L = addV(-finThickness/2 - 0.3, finTipY + 2, finTrailingEdgeTipZ + 2);
    
    const rudTopFront_R = addV(finThickness/2 + 0.3, rudderHingeY + 3, rudderHingeZ + 2);
    const rudBotFront_R = addV(finThickness/2 + 0.3, finTipY + 2, finLeadingEdgeTipZ + 2);
    const rudTopBack_R = addV(finThickness/2 + 0.3, rudderHingeY + 3, rudderHingeZ - 8);
    const rudBotBack_R = addV(finThickness/2 + 0.3, finTipY + 2, finTrailingEdgeTipZ + 2);

    // 绘制方向舵 (红色) - 左侧面
    quad(rudBotFront_L, rudTopFront_L, rudTopBack_L, rudBotBack_L, 218, 55, 62, MAT.RED);
    // 右侧面
    quad(rudBotFront_R, rudBotBack_R, rudTopBack_R, rudTopFront_R, 218, 55, 62, MAT.RED);
    // 方向舵顶面
    quad(rudTopFront_L, rudTopFront_R, rudTopBack_R, rudTopBack_L, 210, 50, 58, MAT.RED);
    // 方向舵后缘
    quad(rudBotBack_L, rudTopBack_L, rudTopBack_R, rudBotBack_R, 200, 45, 52, MAT.RED);

    // —— 水平尾翼：梯形平面（前边展宽大、后边略窄 + 后掠），与机身无缝连接，与机尾对齐 ——
    const yStLE = -75.0; // 水平尾翼前缘位置（向前移动，与垂尾根部协调）
    const yStTE = -96.0; // 水平尾翼后缘位置（与机尾末端对齐）
    const stabDz = 0.1;
    const stabT = 0.38;
    const stabSpanLE = 42;
    const stabSpanTE = 34;
    
    function stabZTop(y) {
      return topZAt(y) + stabDz;
    }
    
    // 获取机身在水平尾翼安装位置的宽度
    const wLE = halfWidthTopAt(yStLE);
    const wTE = halfWidthTopAt(yStTE);
    
    // 右侧水平尾翼
    const rrLE = addV(wLE, yStLE, stabZTop(yStLE)); // 右根前缘
    const rrTE = addV(wTE, yStTE, stabZTop(yStTE)); // 右尖后缘
    const rtLE = addV(wLE + stabSpanLE, yStLE, stabZTop(yStLE) + 0.04); // 右根后缘
    const rtTE = addV(wTE + stabSpanTE, yStTE, stabZTop(yStTE)); // 右尖后缘
    
    // 左侧水平尾翼
    const lrLE = addV(-wLE, yStLE, stabZTop(yStLE)); // 左根前缘
    const lrTE = addV(-wTE, yStTE, stabZTop(yStTE)); // 左尖后缘
    const ltLE = addV(-(wLE + stabSpanLE), yStLE, stabZTop(yStLE) + 0.04); // 左根后缘
    const ltTE = addV(-(wTE + stabSpanTE), yStTE, stabZTop(yStTE)); // 左尖后缘
    
    // 上表面
    quad(rrLE, rtLE, rtTE, rrTE, 238, 236, 242, MAT.FUSE);
    quad(ltLE, lrLE, lrTE, ltTE, 238, 236, 242, MAT.FUSE);
    
    // 下表面
    const rrLEb = addV(wLE, yStLE, stabZTop(yStLE) - stabT);
    const rrTEb = addV(wTE, yStTE, stabZTop(yStTE) - stabT);
    const rtLEb = addV(wLE + stabSpanLE, yStLE, stabZTop(yStLE) + 0.04 - stabT);
    const rtTEb = addV(wTE + stabSpanTE, yStTE, stabZTop(yStTE) - stabT);
    const lrLEb = addV(-wLE, yStLE, stabZTop(yStLE) - stabT);
    const lrTEb = addV(-wTE, yStTE, stabZTop(yStTE) - stabT);
    const ltLEb = addV(-(wLE + stabSpanLE), yStLE, stabZTop(yStLE) + 0.04 - stabT);
    const ltTEb = addV(-(wTE + stabSpanTE), yStTE, stabZTop(yStTE) - stabT);
    
    quad(rrLEb, rtLEb, rtTEb, rrTEb, 220, 218, 226, MAT.FUSE);
    quad(ltLEb, lrLEb, lrTEb, ltTEb, 220, 218, 226, MAT.FUSE);
    
    // 前缘
    quad(rrLE, rrLEb, rtLEb, rtLE, 228, 226, 234, MAT.FUSE);
    quad(lrLE, lrLEb, ltLEb, ltLE, 228, 226, 234, MAT.FUSE);
    
    // 后缘
    quad(rtTE, rtTEb, rrTEb, rrTE, 228, 226, 234, MAT.FUSE);
    quad(ltTE, ltTEb, lrTEb, lrTE, 228, 226, 234, MAT.FUSE);
    
    // 左右翼尖
    quad(rtLE, rtLEb, rtTEb, rtTE, 228, 226, 234, MAT.FUSE);
    quad(ltLE, ltLEb, ltTEb, ltTE, 228, 226, 234, MAT.FUSE);
    
    // 连接机身的部分
    quad(rrLE, lrLE, lrLEb, rrLEb, 228, 226, 234, MAT.FUSE);
    
    // 水平尾翼翼尖装饰
    const elR = addV(wTE + stabSpanTE * 0.92, yStTE - 0.85, stabZTop(yStTE) - 0.22);
    tri(rtTE, elR, rtTEb, 188, 186, 196, MAT.FUSE);
    const elL = addV(-(wTE + stabSpanTE * 0.92), yStTE - 0.85, stabZTop(yStTE) - 0.22);
    tri(ltTE, ltTEb, elL, 188, 186, 196, MAT.FUSE);

    // —— 整流锥 + 三叶螺旋桨 ——
    const spinTip = addV(0, 148, 11.0);
    const sp0 = addV(2.8, 130, 10.2);
    const sp1 = addV(-1.4, 130, 12.4);
    const sp2 = addV(-1.4, 130, 7.8);
    tri(spinTip, sp0, sp1, 210, 208, 215, MAT.SPINNER);
    tri(spinTip, sp1, sp2, 205, 203, 212, MAT.SPINNER);
    tri(spinTip, sp2, sp0, 208, 206, 218, MAT.SPINNER);
    const hub = addV(0, 128.5, 11.0);
    tri(hub, sp0, sp1, 80, 82, 88, MAT.CHROME);
    tri(hub, sp1, sp2, 80, 82, 88, MAT.CHROME);
    tri(hub, sp2, sp0, 80, 82, 88, MAT.CHROME);

    const bladeLen = 0.62;
    function blade(ya, yb, xa0, za0, xa1, za1) {
      const t0 = addV(xa0 * bladeLen, ya, 11 + za0 * bladeLen);
      const t1 = addV(xa1 * bladeLen, yb, 11 + za1 * bladeLen);
      tri(hub, t0, t1, 48, 50, 56, MAT.PROP);
    }
    blade(138, 118, 4.2, 0.4, 1.0, 0.1);
    blade(138, 118, -2.2, 3.6, -0.6, 2.0);
    blade(138, 118, -2.0, -3.8, -0.4, -2.1);

    // —— 起落架：主起 + 前起 + 轮 ——
    function mainGear(s) {
      const u0 = addV(13 * s, 12, 4.5);
      const u1 = addV(11 * s, 10, 3.8);
      const l0 = addV(13 * s, -2, -5.5);
      const l1 = addV(11 * s, -3, -6.2);
      quad(u0, u1, l1, l0, 175, 178, 185, MAT.CHROME);
      const ox = 2.2 * s;
      const u0p = addV(13 * s + ox, 12, 4.3);
      const u1p = addV(11 * s + ox, 10, 3.6);
      const l0p = addV(13 * s + ox, -2, -5.7);
      const l1p = addV(11 * s + ox, -3, -6.4);
      quad(u0, u0p, u1p, u1, 168, 171, 178, MAT.CHROME);
      quad(u1, u1p, l1p, l1, 168, 171, 178, MAT.CHROME);
      quad(l1, l1p, l0p, l0, 168, 171, 178, MAT.CHROME);
      quad(l0, l0p, u0p, u0, 168, 171, 178, MAT.CHROME);
      const wC = addV(13 * s, -4, -6.8);
      const wA = addV(15.5 * s, -4, -6.8);
      const wB = addV(13 * s, -2, -8.5);
      tri(wC, wA, wB, 28, 28, 32, MAT.RUBBER);
      tri(wC, wB, addV(10.5 * s, -4, -6.8), 28, 28, 32, MAT.RUBBER);
      const fair = addV(12 * s, 6, 2.5);
      tri(u0, fair, rings[8][3], 245, 243, 248, MAT.FUSE);
    }
    mainGear(1);
    mainGear(-1);

    const n0 = addV(0, 62, 2.0);
    const n1 = addV(2.2, 58, 1.2);
    const n2 = addV(-2.2, 58, 1.2);
    const nLow = addV(0, 50, -7.5);
    tri(n0, n1, n2, 175, 178, 185, MAT.CHROME);
    tri(n0, n1, nLow, 175, 178, 185, MAT.CHROME);
    tri(n0, nLow, n2, 175, 178, 185, MAT.CHROME);
    tri(n1, nLow, n2, 175, 178, 185, MAT.CHROME);
    const nw = addV(0, 50, -9.2);
    const nwa = addV(2.4, 50, -9.2);
    const nwb = addV(0, 48, -10.8);
    tri(nw, nwa, nwb, 30, 30, 34, MAT.RUBBER);
    tri(nw, nwb, addV(-2.4, 50, -9.2), 30, 30, 34, MAT.RUBBER);

    // —— 皮托管（左翼前缘）——
    const pitA = addV(-118, 43.8, 34.6);
    const pitB = addV(-132, 45.6, 34.0);
    quad(pitA, pitB, addV(-132, 44.8, 33.4), addV(-118, 43.0, 34.0), 190, 192, 198, MAT.CHROME);

    // —— 天线 ——
    const ant0 = addV(0, -18, 25.5);
    const ant1 = addV(0, -18, 32.0);
    quad(ant0, ant1, addV(0.4, -18, 32), addV(0.4, -18, 25.5), 140, 142, 150, MAT.CHROME);

    // —— 登机踏级 ——
    const st0 = addV(16.5, 38, 9.0);
    const st1 = addV(19.5, 36, 8.5);
    const st2 = addV(19.5, 34, 8.3);
    const st3 = addV(16.5, 36, 8.8);
    quad(st0, st1, st2, st3, 55, 52, 48, MAT.PLASTIC);

    // 机身金色腰线（右下侧一条带）
    for (let i = 4; i <= 7; i++) {
      const A = rings[i];
      const B = rings[i + 1];
      const g = [212, 175, 72];
      const e = 0.02;
      const a0 = addV(raw[A[0]].x - e, raw[A[0]].y, raw[A[0]].z - 0.35);
      const a1 = addV(raw[B[0]].x - e, raw[B[0]].y, raw[B[0]].z - 0.35);
      const b0 = addV(raw[A[3]].x - e, raw[A[3]].y, raw[A[3]].z + 0.35);
      const b1 = addV(raw[B[3]].x - e, raw[B[3]].y, raw[B[3]].z + 0.35);
      quad(a0, a1, b1, b0, g[0], g[1], g[2], MAT.GOLD);
    }

    const verts = [];
    for (const v of raw) {
      verts.push(v.y * SCALE, v.x * SCALE, -v.z * SCALE);
    }

    const noseI = noseTip;
    const tailI = tailBumper;

    return {
      verts: new Float32Array(verts),
      faces,
      noseI,
      tailI,
    };
  }

  const FIXEDWING_MODEL = buildCessnaCalibrationModel();

  /** @type {{ render: function, resize: function, setQuaternion: function, dispose: function } | null} */
  let accelThreeApi = null;
  let accelThreeResizeObs = null;
  let accelThreeMissingWarned = false;
  let accelPanelActive = false;

  function ensureAccelThree() {
    if (!accelPanelActive) return;
    if (accelThreeApi) return;
    if (typeof window.THREE === "undefined" || !window.AccelCalibThree) {
      if (!accelThreeMissingWarned) {
        accelThreeMissingWarned = true;
        console.warn("Three.js 未就绪，加速度计 3D 模型无法显示（请检查 three.min.js 是否加载）");
      }
      return;
    }
    const canvas = $("sc-accel-canvas-3d");
    if (!canvas) return;
    accelThreeApi = window.AccelCalibThree.create(canvas, FIXEDWING_MODEL);
    if (!accelThreeApi) return;
    accelThreeApi.resize();
    const obsHost = canvas.parentElement || canvas;
    if (typeof ResizeObserver !== "undefined") {
      accelThreeResizeObs = new ResizeObserver(() => {
        accelThreeApi.resize();
      });
      accelThreeResizeObs.observe(obsHost);
    }
  }

  function disposeAccelThree() {
    if (accelThreeResizeObs) {
      try {
        accelThreeResizeObs.disconnect();
      } catch (_) { /* ignore */ }
      accelThreeResizeObs = null;
    }
    if (accelThreeApi) {
      try {
        accelThreeApi.dispose();
      } catch (_) { /* ignore */ }
      accelThreeApi = null;
    }
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
    const maxAge = ACCEL_CAL_IMU_MAX_AGE_MS;
    if (hr && typeof hr.x === "number" && typeof hr.t === "number" && now - hr.t < maxAge) {
      return { x: hr.x, y: hr.y, z: hr.z };
    }
    if (sc && typeof sc.x === "number" && typeof sc.t === "number" && now - sc.t < maxAge) {
      return { x: sc.x, y: sc.y, z: sc.z };
    }
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
   * 与画布 Three/模型动画完全解耦，勿用动画姿态推断本函数。
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
      el.textContent = "";
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
    const stage = $("sc-accel-visual-stage");
    if (stage) stage.setAttribute("data-step", stepKey);
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
    if (!accelPanelActive) {
      accel.raf = 0;
      return;
    }
    const now = performance.now();
    const dt = accel.lastSimT ? Math.min(0.05, (now - accel.lastSimT) / 1000) : 1 / 60;
    accel.lastSimT = now;

    const qIdleDemo = quatFromPRY(0, 0, ACCEL_CAL_VIEW_YAW_DEG);
    let qTarget;

    if (accel.calibState === "success") {
      qTarget = quatFromYDeg((now / 38) % 360);
    } else if (accel.calibState === "idle") {
      if (fcConnected()) {
        // 已连接但尚未开始校准：继续旋转演示，保持与未连接一致的动态效果。
        qTarget = quatFromYDeg((now / 38) % 360);
      } else {
        // 未连接：模型保持水平并绕世界 Y 轴匀速自转。
        qTarget = quatFromYDeg((now / 38) % 360);
      }
    } else {
      // 3D 动画链（Three 世界轴 + 模型顶点系；与 FACES[].target / IMU FRD 解耦）。⑥＝① 绕世界 X +180°。
      const qStep1 = quatFromYDeg(0);
      const qStep2 = quatMultiply(quatFromXDeg(-90), qStep1);
      const qStep3 = quatMultiply(quatFromXDeg(180), qStep2);
      const qStep4 = quatMultiply(quatFromZDeg(90), qStep1);
      const qStep5 = quatMultiply(quatFromXDeg(180), qStep4);
      const qStep6 = quatMultiply(quatFromXDeg(180), qStep1);
      if (accel.currentIndex === 0) qTarget = qStep1;
      else if (accel.currentIndex === 1) {
        qTarget = qStep2;
      } else if (accel.currentIndex === 2) {
        qTarget = qStep3;
      } else if (accel.currentIndex === 3) {
        qTarget = qStep4;
      } else if (accel.currentIndex === 4) {
        qTarget = qStep5;
      } else if (accel.currentIndex === 5) {
        qTarget = qStep6;
      } else {
        qTarget = quatFromPRY(0, 0, ACCEL_CAL_VIEW_YAW_DEG);
      }
    }

    const smooth = 1 - Math.exp(-11 * dt);
    accel.currentQ = quatSlerp(accel.currentQ, qTarget, clamp(smooth, 0.035, 1));
    ensureAccelThree();
    if (accelThreeApi) accelThreeApi.render(accel.currentQ);

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
    if (!accelPanelActive) return;
    cancelAnimationFrame(accel.raf);
    accel.raf = requestAnimationFrame(accelSimTick);
  }

  function stopAccelSim() {
    cancelAnimationFrame(accel.raf);
    accel.raf = 0;
    accel.lastSimT = 0;
  }

  function setAccelPanelActive(active) {
    const next = !!active;
    if (accelPanelActive === next) return;
    accelPanelActive = next;
    if (next) {
      ensureAccelThree();
      startAccelSim();
      updateAccelLiveLabel();
      return;
    }
    stopAccelSim();
    disposeAccelThree();
  }

  function resetAccelUi() {
    accel.calibState = "idle";
    accel.currentIndex = 0;
    accel.imuFlipZForFrd = false;
    accel.sim = [0, 0, 0];
    accel.lastSimT = 0;
    accel.currentQ = quatFromPRY(0, 0, ACCEL_CAL_VIEW_YAW_DEG);
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
    const tgtSys =
      typeof window !== "undefined" && Number.isFinite(Number(window.sysid)) && Number(window.sysid) > 0
        ? Number(window.sysid)
        : 1;
    const tgtComp =
      typeof window !== "undefined" && Number.isFinite(Number(window.compid)) && Number(window.compid) >= 0
        ? Number(window.compid)
        : 1;
    /**
     * Mission Planner：`MAVLinkInterface.doCommand` 在 PREFLIGHT_CALIBRATION 且 p5==1 时
     * 发送 COMMAND_LONG 后 **不等待 COMMAND_ACK**（陀螺仪阶段可能数秒且 ACK 在整段处理完后才发）。
     * 这里：先发指令，再在短窗口内只处理「明确拒绝」；超时则继续进入引导（与 MP 一致）。
     */
    const mpStyleWaitMs = 800;
    const outcome = await new Promise((resolve, reject) => {
      let ackTimer = 0;
      let settled = false;
      const cleanup = () => {
        if (ackTimer) window.clearTimeout(ackTimer);
        ackTimer = 0;
        window.removeEventListener("gcs-command-ack", onAck);
      };
      const finish = (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };
      const fail = (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };
      const onAck = (ev) => {
        const d = ev && ev.detail;
        if (!d || d.command !== MAV_CMD_PREFLIGHT_CALIBRATION) return;
        const r = Number(d.result);
        if (r === 0 || r === 5) {
          finish({ kind: "accepted", detail: d });
        } else {
          fail(
            new Error(
              `飞控拒绝启动加速度计校准（COMMAND_ACK result=${r} ${d.resultName || ""}）。常见原因：已解锁请先上锁；飞控忙或已在其它校准中；固件不支持该指令。`,
            ),
          );
        }
      };
      window.addEventListener("gcs-command-ack", onAck);
      (async () => {
        try {
          // 强制刷新最新 sendCommandLong（防止 IIFE 闭包缓存旧函数）
          window.sendCommandLong = window.sendCommandLong || sendCommandLong;
          await window.sendCommandLong(
            MAV_CMD_PREFLIGHT_CALIBRATION,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            tgtSys,
            tgtComp,
          );
          slog(
            `已发送 PREFLIGHT_CALIBRATION：启动加速度计校准 (param5=1, target_system=${tgtSys}, target_component=${tgtComp})`,
          );
          if (settled) return;
          ackTimer = window.setTimeout(() => finish({ kind: "no_ack_yet" }), mpStyleWaitMs);
        } catch (e) {
          fail(e);
        }
      })();
    });
    if (outcome.kind === "accepted") {
      if (outcome.detail && Number(outcome.detail.result) === 5) {
        slog(`飞控 COMMAND_ACK: PREFLIGHT_CALIBRATION → ${outcome.detail.resultName || "IN_PROGRESS"}`);
      } else {
        slog("飞控 COMMAND_ACK: PREFLIGHT_CALIBRATION → ACCEPTED");
      }
    } else {
      slog(
        `与 Mission Planner 一致：${mpStyleWaitMs}ms 内未等到 ACK（飞控常在陀螺仪标定完成后才回复）。已继续进入六面引导；此数秒内请注视板载灯并保持机体静止。`,
      );
    }
    await sleep(80);
  }

  async function sendFcAccelAbort() {
    if (fcConnected() && typeof window.sendAccelcalVehiclePos === "function") {
      await window.sendAccelcalVehiclePos(ACCELCAL_POS_FAILED);
      slog("已发送 MAV_CMD_ACCELCAL_VEHICLE_POS FAILED，中止加速度计校准");
    }
  }

  function bindAccel() {
    renderFaceList();
    resetAccelUi();

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
        accelHint(
          "正在请求飞控启动加速度计校准…与 Mission Planner 相同：发送后数秒内飞控先做陀螺仪标定，此间请保持机体静止、勿碰触；" +
            "板载灯（如 Pixhawk 系）常出现红蓝闪烁；本地面站不长时间阻塞等待 ACK，以便与 MP 行为一致。",
          false,
        );
        slog("加速度计启动：已按 Mission Planner 策略发送 PREFLIGHT_CALIBRATION(param5=1)；短窗内仅处理明确拒绝。");
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
      accelHint(
        `提示：${face.label} — ${face.speak}。每面摆好后点「保存」下发 MAV_CMD_ACCELCAL_VEHICLE_POS。` +
          "若刚才等 ACK 时已看到灯闪，多为陀螺仪阶段（与 MP 一致）。CUAV X7/Nora 板载灯较淡时，请以日志中 “Place vehicle …” 为准。",
        false,
      );
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
            slog(`MAV_CMD_ACCELCAL_VEHICLE_POS 未发送 (${face.label})`);
            window.alert("无法下发当前校准面（串口不可用）。校准已中止。");
            await sendFcAccelAbort();
            resetAccelUi();
            return;
          }
          slog(`MAV_CMD_ACCELCAL_VEHICLE_POS param1=${face.mavlinkPos} (${face.label})`);
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
            successSent = await window.sendAccelcalVehiclePos(ACCELCAL_POS_SUCCESS);
            if (successSent) slog(`MAV_CMD_ACCELCAL_VEHICLE_POS SUCCESS(${ACCELCAL_POS_SUCCESS})`);
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
    window.setAccelCalibrationPanelActive = setAccelPanelActive;
    window.project3DAccel = project3D;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
