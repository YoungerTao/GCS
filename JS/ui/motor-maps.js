/**
 * ArduCopter 电机映射表 — 唯一数据源（拓扑 / 表格 / 测试按钮）
 * 电机顺序、测试序号、转向、几何角均来自 ArduPilot 源码：
 *   libraries/AP_Motors/AP_MotorsMatrix.cpp (setup_quad_matrix … setup_deca_matrix)
 *   libraries/AP_Motors/AP_MotorsTri.cpp (_output_test_seq / 混控几何)
 * 字母标签 A… 与官方测试顺序一致（testing_order → Motor A = 1）
 * 参考：https://ardupilot.org/copter/docs/connect-escs-and-motors.html
 *
 * DodecaHexacopter X（CLASS12_TYPE1）与下列源码逐行对齐（Output=数组下标+1，layer 同注释 top/bottom）：
 *   ArduPilot master: AP_MotorsMatrix.cpp → AP_MotorsMatrix::setup_dodecahexa_matrix()
 *   case MOTOR_FRAME_TYPE_X: MotorDef[]（yaw：AP_MOTORS_MATRIX_YAW_FACTOR_CCW=+1→CCW，CW=-1→CW）
 *   核对日期：2026-05-09，来源：https://raw.githubusercontent.com/ArduPilot/ardupilot/master/libraries/AP_Motors/AP_MotorsMatrix.cpp
 */
(function initMotorMaps() {
  const CW = "CW";
  const CCW = "CCW";

  /** @typedef {{ output: number, testSeq: number, label: string, armIndex: number, layer: 'top'|'bottom'|null, direction: 'CW'|'CCW', angleDeg: number, roll?: number, pitch?: number }} MotorMapEntry */

  function norm360(a) {
    let x = Number(a) % 360;
    if (x < 0) x += 360;
    return x;
  }

  function yawFromApToken(tok) {
    if (typeof tok === "number") {
      if (tok > 0) return CCW;
      if (tok < 0) return CW;
      return CW;
    }
    const t = String(tok).toUpperCase();
    if (t === "CW" || t === "AP_MOTORS_MATRIX_YAW_FACTOR_CW") return CW;
    return CCW;
  }

  /**
   * @param {object} p
   * @param {string} p.name
   * @param {number} p.frameClass
   * @param {number} p.frameType
   * @param {'coaxial'|'normal'} p.frameKind
   * @param {boolean} p.xConfig
   * @param {Array<{ angle?: number, roll?: number, pitch?: number, yaw: string|number, test: number }>} p.rows - 与 AP add_motors 数组顺序一致（servoIndex = 行下标）
   */
  function buildMap(p) {
    const rows = p.rows;
    const motors = [];
    const angleKey = (row) => {
      if (typeof row.angle === "number") return norm360(row.angle);
      const r = row.roll;
      const pitch = row.pitch;
      return norm360((Math.atan2(r, pitch) * 180) / Math.PI);
    };

    const byAngle = new Map();
    rows.forEach((row, servoIndex) => {
      const ang = angleKey(row);
      if (!byAngle.has(ang)) byAngle.set(ang, []);
      byAngle.get(ang).push({ row, servoIndex });
    });

    const uniqueAngles = [...byAngle.keys()].sort((a, b) => a - b);
    const armIndexForAngle = new Map();
    uniqueAngles.forEach((a, i) => armIndexForAngle.set(a, i));

    rows.forEach((row, servoIndex) => {
      const ang = angleKey(row);
      const armIndex = armIndexForAngle.get(ang);
      const pair = (byAngle.get(ang) || []).slice().sort((a, b) => a.servoIndex - b.servoIndex);
      let layer = null;
      if (p.frameKind === "coaxial" && pair.length === 2) {
        const ord = pair.findIndex((x) => x.servoIndex === servoIndex);
        layer = ord === 0 ? "top" : "bottom";
      }
      const testSeq = row.test;
      const label = String.fromCharCode(64 + testSeq);
      motors.push({
        output: servoIndex + 1,
        testSeq,
        label,
        armIndex,
        layer,
        direction: yawFromApToken(row.yaw),
        angleDeg: typeof row.angle === "number" ? row.angle : ang,
        roll: row.roll,
        pitch: row.pitch,
      });
    });

    const armCount = uniqueAngles.length;

    return {
      key: `CLASS${p.frameClass}_TYPE${p.frameType}`,
      name: p.name,
      frameClass: p.frameClass,
      frameType: p.frameType,
      frameKind: p.frameKind,
      xConfig: p.xConfig,
      armCount,
      motors,
    };
  }

  /** @type {Record<string, ReturnType<typeof buildMap>>} */
  const MOTOR_MAPS = {};

  function reg(map) {
    MOTOR_MAPS[map.key] = map;
  }

  // —— Quad (CLASS 1) —— AP_MotorsMatrix::setup_quad_matrix
  reg(buildMap({
    name: "Quadrotor / Plus",
    frameClass: 1, frameType: 0, frameKind: "normal", xConfig: false,
    rows: [
      { angle: 90, yaw: CCW, test: 2 },
      { angle: -90, yaw: CCW, test: 4 },
      { angle: 0, yaw: CW, test: 1 },
      { angle: 180, yaw: CW, test: 3 },
    ],
  }));
  reg(buildMap({
    name: "Quadrotor / X",
    frameClass: 1, frameType: 1, frameKind: "normal", xConfig: true,
    rows: [
      { angle: 45, yaw: CCW, test: 1 },
      { angle: -135, yaw: CCW, test: 3 },
      { angle: -45, yaw: CW, test: 4 },
      { angle: 135, yaw: CW, test: 2 },
    ],
  }));
  reg(buildMap({
    name: "Quadrotor / V",
    frameClass: 1, frameType: 2, frameKind: "normal", xConfig: true,
    rows: [
      { angle: 45, yaw: 0.7981, test: 1 },
      { angle: -135, yaw: 1.0, test: 3 },
      { angle: -45, yaw: -0.7981, test: 4 },
      { angle: 135, yaw: -1.0, test: 2 },
    ],
  }));
  reg(buildMap({
    name: "Quadrotor / H",
    frameClass: 1, frameType: 3, frameKind: "normal", xConfig: true,
    rows: [
      { angle: 45, yaw: CW, test: 1 },
      { angle: -135, yaw: CW, test: 3 },
      { angle: -45, yaw: CCW, test: 4 },
      { angle: 135, yaw: CCW, test: 2 },
    ],
  }));
  reg(buildMap({
    name: "Quadrotor / BetaFlight X",
    frameClass: 1, frameType: 12, frameKind: "normal", xConfig: true,
    rows: [
      { angle: 135, yaw: CW, test: 2 },
      { angle: 45, yaw: CCW, test: 1 },
      { angle: -135, yaw: CCW, test: 3 },
      { angle: -45, yaw: CW, test: 4 },
    ],
  }));
  reg(buildMap({
    name: "Quadrotor / BetaFlight X Reversed",
    frameClass: 1, frameType: 18, frameKind: "normal", xConfig: true,
    rows: [
      { angle: 135, yaw: CCW, test: 2 },
      { angle: 45, yaw: CW, test: 1 },
      { angle: -135, yaw: CW, test: 3 },
      { angle: -45, yaw: CCW, test: 4 },
    ],
  }));
  reg(buildMap({
    name: "Quadrotor / DJI X",
    frameClass: 1, frameType: 13, frameKind: "normal", xConfig: true,
    rows: [
      { angle: 45, yaw: CCW, test: 1 },
      { angle: -45, yaw: CW, test: 4 },
      { angle: -135, yaw: CCW, test: 3 },
      { angle: 135, yaw: CW, test: 2 },
    ],
  }));
  reg(buildMap({
    name: "Quadrotor / Clockwise X",
    frameClass: 1, frameType: 14, frameKind: "normal", xConfig: true,
    rows: [
      { angle: 45, yaw: CCW, test: 1 },
      { angle: 135, yaw: CW, test: 2 },
      { angle: -135, yaw: CCW, test: 3 },
      { angle: -45, yaw: CW, test: 4 },
    ],
  }));
  reg(buildMap({
    name: "Quadrotor / Plus (reversed yaw)",
    frameClass: 1, frameType: 6, frameKind: "normal", xConfig: false,
    rows: [
      { angle: 90, yaw: CW, test: 2 },
      { angle: -90, yaw: CW, test: 4 },
      { angle: 0, yaw: CCW, test: 1 },
      { angle: 180, yaw: CCW, test: 3 },
    ],
  }));
  reg(buildMap({
    name: "Quadrotor / Y4",
    frameClass: 1, frameType: 19, frameKind: "normal", xConfig: true,
    rows: [
      { roll: -1, pitch: 1, yaw: CCW, test: 1 },
      { roll: 0, pitch: -1, yaw: CW, test: 2 },
      { roll: 0, pitch: -1, yaw: CCW, test: 3 },
      { roll: 1, pitch: 1, yaw: CW, test: 4 },
    ],
  }));

  // —— Hexa (CLASS 2) ——
  reg(buildMap({
    name: "Hexacopter / Plus",
    frameClass: 2, frameType: 0, frameKind: "normal", xConfig: false,
    rows: [
      { angle: 0, yaw: CW, test: 1 },
      { angle: 180, yaw: CCW, test: 4 },
      { angle: -120, yaw: CW, test: 5 },
      { angle: 60, yaw: CCW, test: 2 },
      { angle: -60, yaw: CCW, test: 6 },
      { angle: 120, yaw: CW, test: 3 },
    ],
  }));
  reg(buildMap({
    name: "Hexacopter / X",
    frameClass: 2, frameType: 1, frameKind: "normal", xConfig: true,
    rows: [
      { angle: 90, yaw: CW, test: 2 },
      { angle: -90, yaw: CCW, test: 5 },
      { angle: -30, yaw: CW, test: 6 },
      { angle: 150, yaw: CCW, test: 3 },
      { angle: 30, yaw: CCW, test: 1 },
      { angle: -150, yaw: CW, test: 4 },
    ],
  }));
  reg(buildMap({
    name: "Hexacopter / H",
    frameClass: 2, frameType: 3, frameKind: "normal", xConfig: true,
    rows: [
      { roll: -1, pitch: 0, yaw: CW, test: 2 },
      { roll: 1, pitch: 0, yaw: CCW, test: 5 },
      { roll: 1, pitch: 1, yaw: CW, test: 6 },
      { roll: -1, pitch: -1, yaw: CCW, test: 3 },
      { roll: -1, pitch: 1, yaw: CCW, test: 1 },
      { roll: 1, pitch: -1, yaw: CW, test: 4 },
    ],
  }));
  reg(buildMap({
    name: "Hexacopter / DJI X",
    frameClass: 2, frameType: 13, frameKind: "normal", xConfig: true,
    rows: [
      { angle: 30, yaw: CCW, test: 1 },
      { angle: -30, yaw: CW, test: 6 },
      { angle: -90, yaw: CCW, test: 5 },
      { angle: -150, yaw: CW, test: 4 },
      { angle: 150, yaw: CCW, test: 3 },
      { angle: 90, yaw: CW, test: 2 },
    ],
  }));
  reg(buildMap({
    name: "Hexacopter / Clockwise X",
    frameClass: 2, frameType: 14, frameKind: "normal", xConfig: true,
    rows: [
      { angle: 30, yaw: CCW, test: 1 },
      { angle: 90, yaw: CW, test: 2 },
      { angle: 150, yaw: CCW, test: 3 },
      { angle: -150, yaw: CW, test: 4 },
      { angle: -90, yaw: CCW, test: 5 },
      { angle: -30, yaw: CW, test: 6 },
    ],
  }));

  // —— Octa (CLASS 3) ——
  reg(buildMap({
    name: "Octacopter / Plus",
    frameClass: 3, frameType: 0, frameKind: "normal", xConfig: false,
    rows: [
      { angle: 0, yaw: CW, test: 1 },
      { angle: 180, yaw: CW, test: 5 },
      { angle: 45, yaw: CCW, test: 2 },
      { angle: 135, yaw: CCW, test: 4 },
      { angle: -45, yaw: CCW, test: 8 },
      { angle: -135, yaw: CCW, test: 6 },
      { angle: -90, yaw: CW, test: 7 },
      { angle: 90, yaw: CW, test: 3 },
    ],
  }));
  reg(buildMap({
    name: "Octacopter / X",
    frameClass: 3, frameType: 1, frameKind: "normal", xConfig: true,
    rows: [
      { angle: 22.5, yaw: CW, test: 1 },
      { angle: -157.5, yaw: CW, test: 5 },
      { angle: 67.5, yaw: CCW, test: 2 },
      { angle: 157.5, yaw: CCW, test: 4 },
      { angle: -22.5, yaw: CCW, test: 8 },
      { angle: -112.5, yaw: CCW, test: 6 },
      { angle: -67.5, yaw: CW, test: 7 },
      { angle: 112.5, yaw: CW, test: 3 },
    ],
  }));
  reg(buildMap({
    name: "Octacopter / V",
    frameClass: 3, frameType: 2, frameKind: "normal", xConfig: true,
    rows: [
      { roll: 0.83, pitch: 0.34, yaw: CW, test: 7 },
      { roll: -0.67, pitch: -0.32, yaw: CW, test: 3 },
      { roll: 0.67, pitch: -0.32, yaw: CCW, test: 6 },
      { roll: -0.5, pitch: -1, yaw: CCW, test: 4 },
      { roll: 1, pitch: 1, yaw: CCW, test: 8 },
      { roll: -0.83, pitch: 0.34, yaw: CCW, test: 2 },
      { roll: -1, pitch: 1, yaw: CW, test: 1 },
      { roll: 0.5, pitch: -1, yaw: CW, test: 5 },
    ],
  }));
  reg(buildMap({
    name: "Octacopter / H",
    frameClass: 3, frameType: 3, frameKind: "normal", xConfig: true,
    rows: [
      { roll: -1, pitch: 1, yaw: CW, test: 1 },
      { roll: 1, pitch: -1, yaw: CW, test: 5 },
      { roll: -1, pitch: 0.333, yaw: CCW, test: 2 },
      { roll: -1, pitch: -1, yaw: CCW, test: 4 },
      { roll: 1, pitch: 1, yaw: CCW, test: 8 },
      { roll: 1, pitch: -0.333, yaw: CCW, test: 6 },
      { roll: 1, pitch: 0.333, yaw: CW, test: 7 },
      { roll: -1, pitch: -0.333, yaw: CW, test: 3 },
    ],
  }));
  reg(buildMap({
    name: "Octacopter / I",
    frameClass: 3, frameType: 15, frameKind: "normal", xConfig: true,
    rows: [
      { roll: 0.333, pitch: -1, yaw: CW, test: 5 },
      { roll: -0.333, pitch: 1, yaw: CW, test: 1 },
      { roll: 1, pitch: -1, yaw: CCW, test: 6 },
      { roll: 0.333, pitch: 1, yaw: CCW, test: 8 },
      { roll: -0.333, pitch: -1, yaw: CCW, test: 4 },
      { roll: -1, pitch: 1, yaw: CCW, test: 2 },
      { roll: -1, pitch: -1, yaw: CW, test: 3 },
      { roll: 1, pitch: 1, yaw: CW, test: 7 },
    ],
  }));
  reg(buildMap({
    name: "Octacopter / DJI X",
    frameClass: 3, frameType: 13, frameKind: "normal", xConfig: true,
    rows: [
      { angle: 22.5, yaw: CCW, test: 1 },
      { angle: -22.5, yaw: CW, test: 8 },
      { angle: -67.5, yaw: CCW, test: 7 },
      { angle: -112.5, yaw: CW, test: 6 },
      { angle: -157.5, yaw: CCW, test: 5 },
      { angle: 157.5, yaw: CW, test: 4 },
      { angle: 112.5, yaw: CCW, test: 3 },
      { angle: 67.5, yaw: CW, test: 2 },
    ],
  }));
  reg(buildMap({
    name: "Octacopter / Clockwise X",
    frameClass: 3, frameType: 14, frameKind: "normal", xConfig: true,
    rows: [
      { angle: 22.5, yaw: CCW, test: 1 },
      { angle: 67.5, yaw: CW, test: 2 },
      { angle: 112.5, yaw: CCW, test: 3 },
      { angle: 157.5, yaw: CW, test: 4 },
      { angle: -157.5, yaw: CCW, test: 5 },
      { angle: -112.5, yaw: CW, test: 6 },
      { angle: -67.5, yaw: CCW, test: 7 },
      { angle: -22.5, yaw: CW, test: 8 },
    ],
  }));

  // —— OctaQuad X8 (CLASS 4) ——
  reg(buildMap({
    name: "Octa-Quad X8 / Plus",
    frameClass: 4, frameType: 0, frameKind: "coaxial", xConfig: false,
    rows: [
      { angle: 0, yaw: CCW, test: 1 },
      { angle: -90, yaw: CW, test: 7 },
      { angle: 180, yaw: CCW, test: 5 },
      { angle: 90, yaw: CW, test: 3 },
      { angle: -90, yaw: CCW, test: 8 },
      { angle: 0, yaw: CW, test: 2 },
      { angle: 90, yaw: CCW, test: 4 },
      { angle: 180, yaw: CW, test: 6 },
    ],
  }));
  reg(buildMap({
    name: "Octa-Quad X8 / X",
    frameClass: 4, frameType: 1, frameKind: "coaxial", xConfig: true,
    rows: [
      { angle: 45, yaw: CCW, test: 1 },
      { angle: -45, yaw: CW, test: 7 },
      { angle: -135, yaw: CCW, test: 5 },
      { angle: 135, yaw: CW, test: 3 },
      { angle: -45, yaw: CCW, test: 8 },
      { angle: 45, yaw: CW, test: 2 },
      { angle: 135, yaw: CCW, test: 4 },
      { angle: -135, yaw: CW, test: 6 },
    ],
  }));
  reg(buildMap({
    name: "Octa-Quad X8 / V",
    frameClass: 4, frameType: 2, frameKind: "coaxial", xConfig: true,
    rows: [
      { angle: 45, yaw: 0.7981, test: 1 },
      { angle: -45, yaw: -0.7981, test: 7 },
      { angle: -135, yaw: 1.0, test: 5 },
      { angle: 135, yaw: -1.0, test: 3 },
      { angle: -45, yaw: 0.7981, test: 8 },
      { angle: 45, yaw: -0.7981, test: 2 },
      { angle: 135, yaw: 1.0, test: 4 },
      { angle: -135, yaw: -1.0, test: 6 },
    ],
  }));
  reg(buildMap({
    name: "Octa-Quad X8 / H",
    frameClass: 4, frameType: 3, frameKind: "coaxial", xConfig: true,
    rows: [
      { angle: 45, yaw: CW, test: 1 },
      { angle: -45, yaw: CCW, test: 7 },
      { angle: -135, yaw: CW, test: 5 },
      { angle: 135, yaw: CCW, test: 3 },
      { angle: -45, yaw: CW, test: 8 },
      { angle: 45, yaw: CCW, test: 2 },
      { angle: 135, yaw: CW, test: 4 },
      { angle: -135, yaw: CCW, test: 6 },
    ],
  }));
  reg(buildMap({
    name: "Octa-Quad X8 / Clockwise X",
    frameClass: 4, frameType: 7, frameKind: "coaxial", xConfig: true,
    rows: [
      { angle: 45, yaw: CCW, test: 1 },
      { angle: 45, yaw: CW, test: 2 },
      { angle: 135, yaw: CW, test: 3 },
      { angle: 135, yaw: CCW, test: 4 },
      { angle: -135, yaw: CCW, test: 5 },
      { angle: -135, yaw: CW, test: 6 },
      { angle: -45, yaw: CW, test: 7 },
      { angle: -45, yaw: CCW, test: 8 },
    ],
  }));
  reg(buildMap({
    name: "Octa-Quad X8 / BetaFlight X",
    frameClass: 4, frameType: 12, frameKind: "coaxial", xConfig: true,
    rows: [
      { angle: 135, yaw: CW, test: 3 },
      { angle: 45, yaw: CCW, test: 1 },
      { angle: -135, yaw: CCW, test: 5 },
      { angle: -45, yaw: CW, test: 7 },
      { angle: 135, yaw: CCW, test: 4 },
      { angle: 45, yaw: CW, test: 2 },
      { angle: -135, yaw: CW, test: 6 },
      { angle: -45, yaw: CCW, test: 8 },
    ],
  }));
  reg(buildMap({
    name: "Octa-Quad X8 / BetaFlight X Rev",
    frameClass: 4, frameType: 18, frameKind: "coaxial", xConfig: true,
    rows: [
      { angle: 135, yaw: CCW, test: 3 },
      { angle: 45, yaw: CW, test: 1 },
      { angle: -135, yaw: CW, test: 5 },
      { angle: -45, yaw: CCW, test: 7 },
      { angle: 135, yaw: CW, test: 4 },
      { angle: 45, yaw: CCW, test: 2 },
      { angle: -135, yaw: CCW, test: 6 },
      { angle: -45, yaw: CW, test: 8 },
    ],
  }));
  reg(buildMap({
    name: "Octa-Quad X8 / X Co-rotating",
    frameClass: 4, frameType: 20, frameKind: "coaxial", xConfig: true,
    rows: [
      { angle: 45, yaw: CCW, test: 1 },
      { angle: -45, yaw: CW, test: 7 },
      { angle: -135, yaw: CCW, test: 5 },
      { angle: 135, yaw: CW, test: 3 },
      { angle: -45, yaw: CW, test: 8 },
      { angle: 45, yaw: CCW, test: 2 },
      { angle: 135, yaw: CW, test: 4 },
      { angle: -135, yaw: CCW, test: 6 },
    ],
  }));
  reg(buildMap({
    name: "Octa-Quad X8 / CW X Co-rotating",
    frameClass: 4, frameType: 21, frameKind: "coaxial", xConfig: true,
    rows: [
      { angle: 45, yaw: CCW, test: 1 },
      { angle: 45, yaw: CCW, test: 2 },
      { angle: 135, yaw: CW, test: 3 },
      { angle: 135, yaw: CW, test: 4 },
      { angle: -135, yaw: CCW, test: 5 },
      { angle: -135, yaw: CCW, test: 6 },
      { angle: -45, yaw: CW, test: 7 },
      { angle: -45, yaw: CW, test: 8 },
    ],
  }));

  // —— DodecaHexa (CLASS 12) ——
  reg(buildMap({
    name: "DodecaHexacopter / Plus",
    frameClass: 12, frameType: 0, frameKind: "coaxial", xConfig: false,
    rows: [
      { angle: 0, yaw: CCW, test: 1 },
      { angle: 0, yaw: CW, test: 2 },
      { angle: 60, yaw: CW, test: 3 },
      { angle: 60, yaw: CCW, test: 4 },
      { angle: 120, yaw: CCW, test: 5 },
      { angle: 120, yaw: CW, test: 6 },
      { angle: 180, yaw: CW, test: 7 },
      { angle: 180, yaw: CCW, test: 8 },
      { angle: -120, yaw: CCW, test: 9 },
      { angle: -120, yaw: CW, test: 10 },
      { angle: -60, yaw: CW, test: 11 },
      { angle: -60, yaw: CCW, test: 12 },
    ],
  }));
  // CLASS12_TYPE1：AP_MotorsMatrix::setup_dodecahexa_matrix MOTOR_FRAME_TYPE_X（yaw → direction）
  reg(buildMap({
    name: "DodecaHexacopter / X",
    frameClass: 12, frameType: 1, frameKind: "coaxial", xConfig: true,
    rows: [
      { angle: 30, yaw: CCW, test: 1 }, // A  CCW
      { angle: 30, yaw: CW, test: 2 }, // B  CW
      { angle: 90, yaw: CW, test: 3 }, // C  CW
      { angle: 90, yaw: CCW, test: 4 }, // D  CCW
      { angle: 150, yaw: CCW, test: 5 }, // E  CCW
      { angle: 150, yaw: CW, test: 6 }, // F  CW
      { angle: -150, yaw: CW, test: 7 }, // G  CW
      { angle: -150, yaw: CCW, test: 8 }, // H  CCW
      { angle: -90, yaw: CCW, test: 9 }, // I  CCW
      { angle: -90, yaw: CW, test: 10 }, // J  CW
      { angle: -30, yaw: CW, test: 11 }, // K  CW
      { angle: -30, yaw: CCW, test: 12 }, // L  CCW
    ],
  }));

  // —— Y6 (CLASS 5) —— AP_MotorsMatrix::setup_y6_matrix
  reg(buildMap({
    name: "Y6 / Y6B",
    frameClass: 5, frameType: 10, frameKind: "coaxial", xConfig: true,
    rows: [
      { roll: -1, pitch: 0.5, yaw: CW, test: 1 },
      { roll: -1, pitch: 0.5, yaw: CCW, test: 2 },
      { roll: 0, pitch: -1, yaw: CW, test: 3 },
      { roll: 0, pitch: -1, yaw: CCW, test: 4 },
      { roll: 1, pitch: 0.5, yaw: CW, test: 5 },
      { roll: 1, pitch: 0.5, yaw: CCW, test: 6 },
    ],
  }));
  reg(buildMap({
    name: "Y6 / Y6F (FireFlyY6)",
    frameClass: 5, frameType: 11, frameKind: "coaxial", xConfig: true,
    rows: [
      { roll: 0, pitch: -1, yaw: CCW, test: 3 },
      { roll: -1, pitch: 0.5, yaw: CCW, test: 1 },
      { roll: 1, pitch: 0.5, yaw: CCW, test: 5 },
      { roll: 0, pitch: -1, yaw: CW, test: 4 },
      { roll: -1, pitch: 0.5, yaw: CW, test: 2 },
      { roll: 1, pitch: 0.5, yaw: CW, test: 6 },
    ],
  }));
  const y6Default = buildMap({
    name: "Y6 / Default",
    frameClass: 5, frameType: 0, frameKind: "coaxial", xConfig: true,
    rows: [
      { roll: -1, pitch: 0.666, yaw: CCW, test: 2 },
      { roll: 1, pitch: 0.666, yaw: CW, test: 5 },
      { roll: 1, pitch: 0.666, yaw: CCW, test: 6 },
      { roll: 0, pitch: -1.333, yaw: CW, test: 4 },
      { roll: -1, pitch: 0.666, yaw: CW, test: 1 },
      { roll: 0, pitch: -1.333, yaw: CCW, test: 3 },
    ],
  });
  reg(y6Default);

  // —— Deca (CLASS 14) ——
  reg(buildMap({
    name: "Decacopter / Plus",
    frameClass: 14, frameType: 0, frameKind: "normal", xConfig: false,
    rows: [
      { angle: 0, yaw: CCW, test: 1 },
      { angle: 36, yaw: CW, test: 2 },
      { angle: 72, yaw: CCW, test: 3 },
      { angle: 108, yaw: CW, test: 4 },
      { angle: 144, yaw: CCW, test: 5 },
      { angle: 180, yaw: CW, test: 6 },
      { angle: -144, yaw: CCW, test: 7 },
      { angle: -108, yaw: CW, test: 8 },
      { angle: -72, yaw: CCW, test: 9 },
      { angle: -36, yaw: CW, test: 10 },
    ],
  }));
  reg(buildMap({
    name: "Decacopter / X",
    frameClass: 14, frameType: 1, frameKind: "normal", xConfig: true,
    rows: [
      { angle: 18, yaw: CCW, test: 1 },
      { angle: 54, yaw: CW, test: 2 },
      { angle: 90, yaw: CCW, test: 3 },
      { angle: 126, yaw: CW, test: 4 },
      { angle: 162, yaw: CCW, test: 5 },
      { angle: -162, yaw: CW, test: 6 },
      { angle: -126, yaw: CCW, test: 7 },
      { angle: -90, yaw: CW, test: 8 },
      { angle: -54, yaw: CCW, test: 9 },
      { angle: -18, yaw: CW, test: 10 },
    ],
  }));
  reg(buildMap({
    name: "Decacopter / Clockwise X",
    frameClass: 14, frameType: 14, frameKind: "normal", xConfig: true,
    rows: [
      { angle: 18, yaw: CCW, test: 1 },
      { angle: 54, yaw: CW, test: 2 },
      { angle: 90, yaw: CCW, test: 3 },
      { angle: 126, yaw: CW, test: 4 },
      { angle: 162, yaw: CCW, test: 5 },
      { angle: -162, yaw: CW, test: 6 },
      { angle: -126, yaw: CCW, test: 7 },
      { angle: -90, yaw: CW, test: 8 },
      { angle: -54, yaw: CCW, test: 9 },
      { angle: -18, yaw: CW, test: 10 },
    ],
  }));

  // —— Tricopter (CLASS 7) —— 几何由混控推力矢量；测试序见 AP_MotorsTri::_output_test_seq
  function triMap(name, frameType, plusRev) {
    /** 标签 A/B/C 按默认 MAIN 口 1、2、4 与官方接线图一致；testSeq 为 MAV_CMD_DO_MOTOR_TEST 序号 */
    const motors = plusRev
      ? [
          {
            output: 4, testSeq: 1, label: "A", armIndex: 0, layer: null, direction: CW, angleDeg: 0,
          },
          {
            output: 1, testSeq: 3, label: "B", armIndex: 1, layer: null, direction: CCW, angleDeg: 120,
          },
          {
            output: 2, testSeq: 4, label: "C", armIndex: 2, layer: null, direction: CCW, angleDeg: 240,
          },
        ]
      : [
          {
            output: 1, testSeq: 1, label: "A", armIndex: 0, layer: null, direction: CW, angleDeg: 45,
          },
          {
            output: 2, testSeq: 4, label: "B", armIndex: 1, layer: null, direction: CCW, angleDeg: 315,
          },
          {
            output: 4, testSeq: 2, label: "C", armIndex: 2, layer: null, direction: CCW, angleDeg: 180,
          },
        ];
    return {
      key: `CLASS7_TYPE${frameType}`,
      name,
      frameClass: 7,
      frameType,
      frameKind: "normal",
      xConfig: !plusRev,
      armCount: 3,
      motors,
    };
  }
  reg(triMap("Tricopter / Default", 0, false));
  reg(triMap("Tricopter / PlusReversed", 6, true));
  // 常见参数占位：非 AP 枚举的 TYPE 仍映射默认三轴布局（与默认 Y6 策略一致，避免空白页）
  reg(triMap("Tricopter / Default (TYPE=1)", 1, false));

  // HeliQuad (CLASS 13) — 与四轴矩阵相同（AP 文档接线与 Quad 类同）
  reg(buildMap({
    name: "HeliQuad / Plus",
    frameClass: 13, frameType: 0, frameKind: "normal", xConfig: false,
    rows: [
      { angle: 90, yaw: CCW, test: 2 },
      { angle: -90, yaw: CCW, test: 4 },
      { angle: 0, yaw: CW, test: 1 },
      { angle: 180, yaw: CW, test: 3 },
    ],
  }));
  reg(buildMap({
    name: "HeliQuad / X",
    frameClass: 13, frameType: 1, frameKind: "normal", xConfig: true,
    rows: [
      { angle: 45, yaw: CCW, test: 1 },
      { angle: -135, yaw: CCW, test: 3 },
      { angle: -45, yaw: CW, test: 4 },
      { angle: 135, yaw: CW, test: 2 },
    ],
  }));

  /**
   * @param {number} frameClass
   * @param {number} frameType
   * @returns {typeof y6Default | null}
   */
  function getMotorMapByFrame(frameClass, frameType) {
    const fc = Math.round(Number(frameClass));
    const ft = Math.round(Number(frameType));
    const key = `CLASS${fc}_TYPE${ft}`;
    if (MOTOR_MAPS[key]) return MOTOR_MAPS[key];
    if (fc === 5) return MOTOR_MAPS.CLASS5_TYPE0;
    return null;
  }

  /**
   * 方位标签：按臂角升序的第 i 条臂（0 起始）
   * @param {number} armCount
   * @param {boolean} xConfig
   * @param {number} armIndex
   */
  function positionLabelZh(armCount, xConfig, armIndex, frameClass, frameType) {
    const i = Math.max(0, Math.min(armCount - 1, armIndex));
    if (armCount === 3 && frameClass === 7 && frameType === 6) {
      const triRev = ["前", "右后", "左后"];
      return triRev[i] || "—";
    }
    if (armCount === 4) {
      const plus4 = ["前", "右前", "后", "左前"];
      const x4 = ["右前", "左后", "左前", "右后"];
      const t = xConfig ? x4 : plus4;
      return t[i] || "—";
    }
    if (armCount === 6) {
      const plus6 = ["前", "右前", "右后", "后", "左后", "左前"];
      const x6 = ["右前", "右", "右后", "后", "左后", "左前"];
      const t = xConfig ? x6 : plus6;
      return t[i] || "—";
    }
    if (armCount === 8) {
      const plus8 = ["前", "右前", "右", "右后", "后", "左后", "左", "左前"];
      const x8 = ["右前", "右", "右后", "后", "左后", "左", "左前", "前"];
      const t = xConfig ? x8 : plus8;
      return t[i] || "—";
    }
    if (armCount === 10) {
      const x10 = ["右前", "右", "右后", "后下", "左后", "左", "左前", "前上", "前中", "前下"];
      const p10 = ["前", "右前", "右", "右后", "后", "左后", "左", "左前", "前侧", "前中"];
      return (xConfig ? x10 : p10)[i] || "—";
    }
    if (armCount === 3) {
      const tri3 = ["右前", "左前", "后"];
      return tri3[i] || "—";
    }
    return "—";
  }

  function layerLabelZh(layer) {
    if (layer === "top") return "上层";
    if (layer === "bottom") return "下层";
    return "—";
  }

  /**
   * @param {number} frameClass
   * @returns {ReturnType<typeof buildMap>[]}
   */
  function getMotorMapsForClass(frameClass) {
    const fc = Math.round(Number(frameClass));
    return Object.values(MOTOR_MAPS)
      .filter((m) => m.frameClass === fc)
      .sort((a, b) => a.frameType - b.frameType || a.name.localeCompare(b.name));
  }

  window.MOTOR_MAPS = MOTOR_MAPS;
  window.getMotorMapByFrame = getMotorMapByFrame;
  window.getMotorMapsForClass = getMotorMapsForClass;
  window.motorMapPositionLabelZh = positionLabelZh;
  window.motorMapLayerLabelZh = layerLabelZh;
}());
