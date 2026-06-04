const canvas = document.getElementById("hud");

function createNoopCanvasContext() {
  const noop = function () {};
  return {
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    fillRect: noop,
    strokeRect: noop,
    clearRect: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    stroke: noop,
    fill: noop,
    closePath: noop,
    arc: noop,
    fillText: noop,
    strokeText: noop,
    measureText: function (text) {
      return { width: String(text || "").length * 10 };
    },
    setLineDash: noop,
    rect: noop,
    clip: noop,
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic"
  };
}

const ctx =
  canvas && typeof canvas.getContext === "function"
    ? canvas.getContext("2d")
    : createNoopCanvasContext();

// State Layer
let smoothed_roll = 0, smoothed_pitch = 0, smoothed_yaw = 0;
let smoothed_airspeed = 0, smoothed_groundspeed = 0, smoothed_altitude = 0, smoothed_climb_rate = 0;

const RAD_TO_DEG = 180 / Math.PI;
const PITCH_SCALE = 7;
const SMOOTHING_ALPHA = 0.28; // 越小越平滑但响应越慢
const PITCH_SMOOTHING_ALPHA = 0.45; // 俯仰单独调节，减少震荡

const HUD_COLORS = {
  NORMAL: "#00FF9F",
  WARNING: "#FFCC00",
  DANGER: "#FF3333",
  BACKGROUND: "rgba(10, 15, 28, 0.7)"
};

const localGuidanceState = {
  yawRad: 0,
  lat: null,
  lon: null,
  altitude: 0,
  gpsFixType: 0,
  lastGposMs: 0,
  lastGpsRawMs: 0,
  navGuidance: {
    headingDeg: null,
    groundTrackDeg: null,
    desiredHeadingDeg: null,
    waypointBearingDeg: null,
    xtrackErrorM: null,
    turnRateDegS: null,
    gpsValid: false
  }
};

function safeSetWindowProp(name, value) {
  try {
    window[name] = value;
    return window[name] === value;
  } catch (_) {
    return false;
  }
}

function safeGetWindowProp(name) {
  try {
    return window[name];
  } catch (_) {
    return undefined;
  }
}

function scheduleFrame(callback) {
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(callback);
  }
  return setTimeout(function () {
    callback(Date.now());
  }, 16);
}

function dispatchCompatEvent(target, name, detail) {
  if (!target || typeof target.dispatchEvent !== "function") return;
  try {
    if (typeof CustomEvent === "function") {
      target.dispatchEvent(new CustomEvent(name, { detail: detail || null }));
      return;
    }
  } catch (_) {
    /* fall through */
  }
  try {
    if (document && typeof document.createEvent === "function") {
      const evt = document.createEvent("Event");
      evt.initEvent(name, false, false);
      evt.detail = detail || null;
      target.dispatchEvent(evt);
    }
  } catch (_) {
    /* ignore */
  }
}

function getGuidanceSnapshot() {
  const nav = safeGetWindowProp("navGuidance");
  return {
    yawRad: typeof window.yaw === "number" ? window.yaw : localGuidanceState.yawRad,
    lat: typeof window.lat === "number" ? window.lat : localGuidanceState.lat,
    lon: typeof window.lon === "number" ? window.lon : localGuidanceState.lon,
    altitude: typeof window.altitude === "number" ? window.altitude : localGuidanceState.altitude,
    gpsFixType: Number.isFinite(Number(window.gps_fix_type))
      ? Number(window.gps_fix_type)
      : localGuidanceState.gpsFixType,
    lastGposMs: Number(window._lastGposMs) || localGuidanceState.lastGposMs,
    lastGpsRawMs: Number(window._lastGpsRawMs) || localGuidanceState.lastGpsRawMs,
    navGuidance: nav && typeof nav === "object" ? nav : localGuidanceState.navGuidance
  };
}

function toDegrees(rad) {
  return rad * RAD_TO_DEG;
}

function normalizeHeadingDegrees(deg) {
  return ((deg % 360) + 360) % 360;
}

function getSafe(val, def = 0) {
  return (typeof val !== 'undefined' && !isNaN(val)) ? val : def;
}

/** 速度/高度条高亮区：数字+单位居中，超出条宽时自动缩小字号 */
function drawTapeValuePair(numStr, unitStr, gap) {
  const maxW = 70;
  let fontSize = 34;
  let numW = 0;
  let unitW = 0;
  let totalW = 0;
  do {
    ctx.font = `bold ${fontSize}px monospace`;
    numW = ctx.measureText(numStr).width;
    unitW = ctx.measureText(unitStr).width;
    totalW = numW + gap + unitW;
    if (totalW <= maxW || fontSize <= 22) break;
    fontSize -= 2;
  } while (true);

  ctx.fillStyle = HUD_COLORS.WARNING;
  let blockLeft = -totalW / 2;
  const edge = 35;
  if (blockLeft < -edge) blockLeft = -edge;
  if (blockLeft + totalW > edge) blockLeft = edge - totalW;

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(numStr, blockLeft, 12);
  ctx.fillText(unitStr, blockLeft + numW + gap, 12);
}

function strokeText(text, x, y, font, color, strokeColor = "#000000", strokeWidth = 2) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

function glowText(text, x, y, font, color, glowColor = color, glowRadius = 3) {
  ctx.font = font;
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = glowColor;
  for (let i = glowRadius; i > 0; i--) {
    ctx.globalAlpha = 0.1;
    ctx.fillText(text, x + i, y);
    ctx.fillText(text, x - i, y);
    ctx.fillText(text, x, y + i);
    ctx.fillText(text, x, y - i);
  }
  ctx.globalAlpha = 1.0;
  strokeText(text, x, y, font, color, "#000000", 2);
}

function updateSmoothedData() {
  const cur_roll  = getSafe(window.roll);
  const cur_pitch = getSafe(window.pitch);
  const cur_yaw   = getSafe(window.yaw);
  const cur_alt   = getSafe(window.altitude);
  const cur_aspd  = getSafe(window.airspeed);
  const cur_climb = getSafe(window.climb_rate);

  // 首次收到有效数据时立即生效（避免初始卡顿）
  if (!smoothed_altitude && cur_alt !== 0) {
    smoothed_altitude = cur_alt;
    smoothed_roll = cur_roll;
    smoothed_pitch = cur_pitch;
    smoothed_yaw = cur_yaw;
  }

  smoothed_roll  = smoothed_roll * (1 - SMOOTHING_ALPHA) + cur_roll * SMOOTHING_ALPHA;
  smoothed_pitch = smoothed_pitch * (1 - PITCH_SMOOTHING_ALPHA) + cur_pitch * PITCH_SMOOTHING_ALPHA;
  smoothed_yaw   = smoothed_yaw * (1 - SMOOTHING_ALPHA) + cur_yaw * SMOOTHING_ALPHA;

  smoothed_airspeed  = smoothed_airspeed * (1 - SMOOTHING_ALPHA) + cur_aspd * SMOOTHING_ALPHA;
  smoothed_altitude  = smoothed_altitude * (1 - SMOOTHING_ALPHA) + cur_alt * SMOOTHING_ALPHA;
  smoothed_climb_rate = smoothed_climb_rate * (1 - SMOOTHING_ALPHA) + cur_climb * SMOOTHING_ALPHA;

  if (isNaN(smoothed_altitude)) smoothed_altitude = 0;
  if (isNaN(smoothed_roll)) smoothed_roll = 0;
  if (isNaN(smoothed_pitch)) smoothed_pitch = 0;
  if (isNaN(smoothed_yaw)) smoothed_yaw = 0;
}

// ==================== 所有绘图函数（你原来的全部代码） ====================
function drawHorizon() {
  ctx.save();
  ctx.translate(400, 400);
  ctx.rotate(-smoothed_roll);
  let pitchDeg = smoothed_pitch * RAD_TO_DEG;
  let offset = pitchDeg * PITCH_SCALE;
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(-800, -800 + offset, 1600, 800);
  ctx.fillStyle = "#2d2d2d";
  ctx.fillRect(-800, offset, 1600, 800);
  ctx.strokeStyle = HUD_COLORS.NORMAL;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-400, offset);
  ctx.lineTo(400, offset);
  ctx.stroke();
  ctx.restore();
}

function drawPitchLadder() {
  ctx.save();
  ctx.translate(400, 400);
  ctx.rotate(-smoothed_roll);
  ctx.strokeStyle = HUD_COLORS.NORMAL;
  ctx.lineWidth = 1;
  ctx.font = "32px monospace";
  ctx.fillStyle = HUD_COLORS.NORMAL;

  // === 关键修改：减少可见范围，只显示约12条刻度线 ===
  const visibleDeg = 30;                    // ← 原来是动态计算≈60°，现在固定±30°
  const pitchDeg = smoothed_pitch * RAD_TO_DEG;
  const startDeg = Math.floor((pitchDeg - visibleDeg) / 5) * 5;
  const endDeg = Math.ceil((pitchDeg + visibleDeg) / 5) * 5;

  for (let deg = startDeg; deg <= endDeg; deg += 5) {
    let y = (deg - pitchDeg) * PITCH_SCALE;
    if (y < -420 || y > 420) continue;     // 安全裁剪

    let isMajor = deg % 10 === 0;
    let length = isMajor ? 133 : 67;

    ctx.beginPath();
    ctx.moveTo(-length / 2, y);
    ctx.lineTo(length / 2, y);
    ctx.stroke();

    if (isMajor && deg !== 0) {
      ctx.fillText(Math.abs(deg).toString(), length / 2 + 13, y + 11);
    }
  }
  ctx.restore();
}

function drawRollScale() {
  ctx.save();
  ctx.translate(400, 400);
  ctx.strokeStyle = HUD_COLORS.NORMAL;
  ctx.lineWidth = 2;
  const radius = 320;
  const centerY = 0;
  ctx.beginPath();
  ctx.arc(0, centerY, radius, Math.PI * 1.2, Math.PI * 1.8, false);
  ctx.stroke();
  for (let deg = -60; deg <= 60; deg += 10) {
    let angle = (deg - 90) * Math.PI / 180;
    let innerRadius = radius - (deg === 0 ? 30 : 15);
    let outerRadius = radius;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * innerRadius, centerY + Math.sin(angle) * innerRadius);
    ctx.lineTo(Math.cos(angle) * outerRadius, centerY + Math.sin(angle) * outerRadius);
    ctx.stroke();
    if (deg % 30 === 0 || deg === 0) {
      let labelRadius = radius - 55;
      let labelX = Math.cos(angle) * labelRadius;
      let labelY = centerY + Math.sin(angle) * labelRadius;
      ctx.fillStyle = HUD_COLORS.NORMAL;
      ctx.font = "24px monospace";
      ctx.textAlign = "center";
      let text = deg === 0 ? "0" : Math.abs(deg).toString();
      ctx.fillText(text, labelX, labelY);
    }
  }
  ctx.rotate(-smoothed_roll);
  ctx.fillStyle = HUD_COLORS.NORMAL;
  ctx.beginPath();
  ctx.moveTo(0, centerY - radius + 5);
  ctx.lineTo(-12, centerY - radius + 25);
  ctx.lineTo(12, centerY - radius + 25);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawHeadingRibbon() {
  ctx.save();
  ctx.translate(400, 400);
  let yawDeg = ((smoothed_yaw * RAD_TO_DEG) % 360 + 360) % 360;
  let startDeg = Math.floor((yawDeg - 60) / 5) * 5;
  let endDeg = Math.ceil((yawDeg + 60) / 5) * 5;
  ctx.strokeStyle = HUD_COLORS.NORMAL;
  ctx.lineWidth = 3;
  ctx.font = "27px monospace";
  ctx.fillStyle = HUD_COLORS.NORMAL;
  for (let deg = startDeg; deg <= endDeg; deg += 5) {
    let x = (deg - yawDeg) * 8;
    let normalized = ((deg % 360) + 360) % 360;
    let isMajor = normalized % 30 === 0;
    let height = isMajor ? 40 : 27;
    ctx.beginPath();
    ctx.moveTo(x, -373);
    ctx.lineTo(x, -373 + height);
    ctx.stroke();
    if (isMajor) {
      let label = "";
      if (normalized === 0) label = "N";
      else if (normalized === 90) label = "E";
      else if (normalized === 180) label = "S";
      else if (normalized === 270) label = "W";
      else label = normalized.toString();
      ctx.fillText(label, x - 13, -400);
    }
  }
  ctx.fillStyle = HUD_COLORS.WARNING;
  ctx.font = "37px monospace";
  ctx.fillText(Math.round(yawDeg).toString().padStart(3, '0'), -40, -325);
  ctx.restore();
}

function drawAirspeedTape() {
  ctx.save();
  // 尽量靠左 + 安全偏移
  ctx.translate(45, 400);

  let speed = Math.max(0, Math.min(300, smoothed_airspeed || 0));

  // 背景框（和右侧高度条宽度一致）
  ctx.fillStyle = HUD_COLORS.BACKGROUND;
  ctx.fillRect(-38, -250, 76, 500);

  ctx.strokeStyle = "rgba(0, 255, 159, 0.4)";
  ctx.lineWidth = 1;
  ctx.strokeRect(-38, -250, 76, 500);

  // 刻度
  ctx.strokeStyle = HUD_COLORS.NORMAL;
  ctx.lineWidth = 2;
  ctx.font = "26px monospace";
  ctx.fillStyle = HUD_COLORS.NORMAL;
  ctx.textAlign = "right";

  for (let s = Math.floor(speed / 10) * 10 - 50; s <= Math.floor(speed / 10) * 10 + 50; s += 10) {
    let y = (s - speed) * 8;
    if (Math.abs(y) > 245) continue;

    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(30, y);
    ctx.stroke();

    ctx.fillText(s.toString(), -6, y + 8);
  }

  // 当前值高亮
  ctx.fillStyle = "rgba(0, 255, 159, 0.3)";
  ctx.fillRect(-38, -14, 76, 28);

  drawTapeValuePair(speed.toFixed(0), "m/s", 8);

  ctx.restore();   // ← 必须有这行！防止污染其他绘制
}

// ==================== 独立模块：空速 + 地速 显示 ====================
function drawAirspeedGroundspeed() {
  ctx.save();
  ctx.translate(20, 680);   // 位置在空速滑条下方，可自行调整

ctx.textAlign = "left";

  // 空速
  ctx.fillStyle = HUD_COLORS.NORMAL;
  ctx.font = "bold 25px Consolas";
  ctx.fillText("空速", 0, 0);

  ctx.fillStyle = HUD_COLORS.WARNING;
  ctx.font = "bold 36px Consolas";
  ctx.fillText(getSafe(smoothed_airspeed).toFixed(0) + " m/s", 70, 2);

  // 地速
  ctx.fillStyle = HUD_COLORS.NORMAL;
  ctx.font = "bold 25px Consolas";
  ctx.fillText("地速", 0, 45);

  ctx.fillStyle = HUD_COLORS.WARNING;
  ctx.font = "bold 36px Consolas";
  ctx.fillText(getSafe(smoothed_groundspeed).toFixed(0) + " m/s", 70, 47);

  ctx.restore();
}

function drawAltitudeTape() {
  ctx.save();
  // 与左侧空速条对称：宽 76、高 500，距画布边缘 45px
  ctx.translate(755, 400);

  const alt = smoothed_altitude;

  ctx.fillStyle = HUD_COLORS.BACKGROUND;
  ctx.fillRect(-38, -250, 76, 500);
  ctx.strokeStyle = "rgba(0, 255, 159, 0.4)";
  ctx.lineWidth = 1;
  ctx.strokeRect(-38, -250, 76, 500);

  ctx.strokeStyle = HUD_COLORS.NORMAL;
  ctx.lineWidth = 2;
  ctx.font = "26px monospace";
  ctx.fillStyle = HUD_COLORS.NORMAL;
  ctx.textAlign = "left";

  for (let a = Math.floor(alt / 10) * 10 - 50; a <= Math.floor(alt / 10) * 10 + 50; a += 10) {
    const y = (alt - a) * 8;
    if (Math.abs(y) > 245) continue;

    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(-30, y);
    ctx.stroke();

    ctx.fillText(a.toString(), 6, y + 8);
  }

  ctx.fillStyle = "rgba(0, 255, 159, 0.3)";
  ctx.fillRect(-38, -14, 76, 28);

  drawTapeValuePair(alt.toFixed(0), "m", 8);

  ctx.restore();
}

function drawVerticalSpeedIndicator() {
  ctx.save();
  ctx.translate(533, 267);
  let vs = smoothed_climb_rate;
  ctx.strokeStyle = HUD_COLORS.NORMAL;
  ctx.lineWidth = 5;
  ctx.font = "32px monospace";
  ctx.fillStyle = HUD_COLORS.NORMAL;
  ctx.beginPath();
  ctx.moveTo(0, -133);
  ctx.lineTo(0, 133);
  ctx.stroke();
  let arrowY = Math.max(-107, Math.min(107, -vs * 27));
  ctx.beginPath();
  ctx.moveTo(-13, arrowY);
  ctx.lineTo(13, arrowY);
  ctx.lineTo(0, arrowY + (vs > 0 ? -27 : 27));
  ctx.closePath();
  ctx.fill();
  ctx.fillText(vs.toFixed(1), -53, 187);
  ctx.restore();
}

function drawCenterAircraftSymbol() {
  ctx.save();
  ctx.translate(400, 400);
  ctx.strokeStyle = HUD_COLORS.NORMAL;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-53, 0); ctx.lineTo(-27, 0);
  ctx.moveTo(27, 0);  ctx.lineTo(53, 0);
  ctx.moveTo(0, -53); ctx.lineTo(0, -27);
  ctx.moveTo(0, 27);  ctx.lineTo(0, 53);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 5.33, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
}

function drawFlightStatusOverlay() {
  ctx.save();
  ctx.translate(30, 770);
  const bottomFont = "bold 28px Consolas";
  const itemWidth = 220;

  const batV = getSafe(window.battery_voltage, 0);
  const gpsType = getSafe(window.gps_fix_type, 0);
  const gpsSats = getSafe(window.gps_satellites_visible, 0);
 const mode = (typeof window.flight_mode === 'string' && window.flight_mode) 
             ? window.flight_mode 
             : "UNKNOWN";
  const isArmed = getSafe(window.armed, false);

  let batColor = batV > 3.7 ? HUD_COLORS.NORMAL : batV > 3.3 ? HUD_COLORS.WARNING : HUD_COLORS.DANGER;
  glowText(`电池:${batV.toFixed(2)}V`, 0, 0, bottomFont, batColor);

  // 解锁状态（HUD 水平居中，EKF 上方）
  const armedText = isArmed ? "✅ 已解锁" : "🔒 未解锁";
  const armedColor = isArmed ? HUD_COLORS.NORMAL : HUD_COLORS.WARNING;
  // 将文本居中显示在画布中央（canvas 宽度 800，当前已 translate(30,770)）
  const prevAlign = ctx.textAlign;
  ctx.textAlign = "center";
  const centerX = 400 - 30; // 相对于当前原点的 x 坐标
  glowText(armedText, centerX, -45, "bold 36px Consolas", armedColor);
  ctx.textAlign = prevAlign;

  glowText(`EKF`, itemWidth * 1.6, 0, bottomFont, HUD_COLORS.NORMAL);
  glowText(`Vibe`, itemWidth * 2.1, 0, bottomFont, HUD_COLORS.NORMAL);

  const hudRightX = 770;
  let gpsText = typeof window.formatGpsFixHudLabel === "function"
    ? window.formatGpsFixHudLabel()
    : (gpsType >= 2 ? `GPS: ${gpsType}` : (gpsType === 1 ? "GPS: 未定位" : "GPS: 无"));
  const gpsSeverity = typeof window.getGpsFixHudSeverity === "function"
    ? window.getGpsFixHudSeverity()
    : (gpsType >= 3 ? "normal" : gpsType >= 1 ? "warning" : "danger");
  let gpsColor = gpsSeverity === "normal" ? HUD_COLORS.NORMAL
    : gpsSeverity === "warning" ? HUD_COLORS.WARNING
    : HUD_COLORS.DANGER;

  const dist = getSafe(window.dist_to_wp, 0);
  const wpNext = (typeof window.wp_current === 'number') ? `WP${window.wp_current + 1}` : 'WP0';
  const alignBeforeGps = ctx.textAlign;
  ctx.textAlign = "right";
  glowText(gpsText, hudRightX, 0, bottomFont, gpsColor);
  glowText(`${dist}m > ${wpNext}`, hudRightX, -40, "20px Consolas", HUD_COLORS.NORMAL);
  glowText(mode, hudRightX, -75, "bold 26px Consolas", HUD_COLORS.NORMAL);
  ctx.textAlign = alignBeforeGps;
  ctx.restore();
}

// ==================== HUD 绘制（由 scheduleUIUpdate / 250ms 兜底 驱动） ====================
function renderHudToCanvas() {
  updateSmoothedData();
  ctx.clearRect(0, 0, 800, 800);

  drawHorizon();
  drawPitchLadder();
  drawRollScale();
  drawHeadingRibbon();
  drawAirspeedTape();
  drawAltitudeTape();
  drawVerticalSpeedIndicator();
  drawCenterAircraftSymbol();
  drawFlightStatusOverlay();
  drawAirspeedGroundspeed();

  const rollDeg = toDegrees(getSafe(window.roll));
  const pitchDeg = toDegrees(getSafe(window.pitch));
  const yawDeg = normalizeHeadingDegrees(toDegrees(getSafe(window.yaw)));
  ctx.fillStyle = "#FF0000";
  ctx.font = "bold 18px Consolas";
  ctx.fillText(`Roll: ${rollDeg.toFixed(1)}°`, 20, 30);
  ctx.fillText(`Pitch:${pitchDeg.toFixed(1)}°`, 20, 55);
  ctx.fillText(`Yaw:  ${yawDeg.toFixed(1)}°`, 20, 80);
  ctx.fillText(`Alt:  ${getSafe(window.altitude).toFixed(1)}m`, 20, 105);
  ctx.fillText(`Speed:${getSafe(window.airspeed).toFixed(1)}`, 20, 130);
}

safeSetWindowProp("renderHudToCanvas", renderHudToCanvas);
// drawHUD 为调度器与兜底定时器使用的别名（实际绘制函数体为 renderHudToCanvas）
safeSetWindowProp("drawHUD", renderHudToCanvas);
console.log("✅ HUD 绘制已导出为 window.renderHudToCanvas / window.drawHUD");



// ==================== 地图初始化（新增） ====================
let mapInstance, mapMarker, mapMissionHomeLayer, mapMissionRouteLayer;
let mapInfoDiv = null;
let mapBootstrapped = false;
let mapInitScheduled = false;
let mapMarkerIconSignature = "";
let latestMissionOverlayPayload = null;
let currentMainView = "flight-data";

const MAIN_MAP_OVERLAY_CENTER = 40;
// 调大长度让指示线从飞机图标中“伸出来”，避免被粗描边机身完全覆盖（尤其是 Plane）。
const MAIN_MAP_LINE_BASE_LENGTH = 110;
const MAIN_MAP_XTRACK_SCALE_M = 2.4;
const MAIN_MAP_XTRACK_MAX_DEG = 35;

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function mapLineEndpoint(lengthPx) {
  return (MAIN_MAP_OVERLAY_CENTER - lengthPx).toFixed(1);
}

function buildGuidanceLineSvg(angleDeg, color, width, lengthPx, innerLengthPx = 0) {
  if (!Number.isFinite(angleDeg)) return "";
  const y2 = mapLineEndpoint(lengthPx);
  // 支持 innerLengthPx：从中心偏移一段距离开始画短线，避免被机身/中心圆完全覆盖
  if (innerLengthPx > 0) {
    const y1 = mapLineEndpoint(innerLengthPx);
    return (
      '<line x1="' + MAIN_MAP_OVERLAY_CENTER + '" y1="' + y1 +
      '" x2="' + MAIN_MAP_OVERLAY_CENTER + '" y2="' + y2 +
      '" stroke="' + color + '" stroke-width="' + width +
      '" stroke-linecap="round" transform="rotate(' + angleDeg.toFixed(1) + " " +
      MAIN_MAP_OVERLAY_CENTER + " " + MAIN_MAP_OVERLAY_CENTER + ')"/>'
    );
  }
  return (
    '<line x1="' + MAIN_MAP_OVERLAY_CENTER + '" y1="' + MAIN_MAP_OVERLAY_CENTER +
    '" x2="' + MAIN_MAP_OVERLAY_CENTER + '" y2="' + y2 +
    '" stroke="' + color + '" stroke-width="' + width +
    '" stroke-linecap="round" transform="rotate(' + angleDeg.toFixed(1) + " " +
    MAIN_MAP_OVERLAY_CENTER + " " + MAIN_MAP_OVERLAY_CENTER + ')"/>'
  );
}

function buildMainMapGuidanceOverlay() {
  const snap = getGuidanceSnapshot();
  const nav = snap.navGuidance || {};
  const gpsValid = nav.gpsValid === true;
  const headingDeg = normalizeHeadingDegrees(toDegrees(getSafe(snap.yawRad)));

  // 只要有最近的位置更新（GPOS 驱动了 updateMap 和 marker 移动），就显示引导指示线。
  // 原来只看 gpsFix>=2（仅来自 GPS_RAW_INT）会导致很多情况下（尤其是只有 GPOS + NAV 时）只剩绿线。
  const hasRecentPosition =
    Number.isFinite(snap.lat) &&
    Number.isFinite(snap.lon) &&
    (Date.now() - Math.max(snap.lastGposMs || 0, snap.lastGpsRawMs || 0) < 5000);

  const showGuidance = gpsValid || hasRecentPosition;

  // 不再绘制绿色的“当前航向”线：飞机图标本身已经通过旋转 + 暖色鼻尖（WARM）清晰表示了 heading。
  // 以前的绿线与机身长轴重合，看起来“在飞机的体内”，用户反馈强烈。
  // 保留红（desired）、黑/灰（groundTrack）、黄（waypoint）、粉（xtrack）作为真正的“指示线”。
  // 使用 inner 让线从中心向外“悬浮”一段距离，避开机身粗描边和中心结构，视觉上更像从飞机伸出的指示线
  const inner = 34;
  const headingInner = 38;
  const green = Number.isFinite(headingDeg)
    ? buildGuidanceLineSvg(headingDeg, "#34d399", 3.2, MAIN_MAP_LINE_BASE_LENGTH + 1, headingInner)
    : "";
  const red = Number.isFinite(nav.desiredHeadingDeg)
    ? buildGuidanceLineSvg(nav.desiredHeadingDeg, "#ff6b3d", 3.2, MAIN_MAP_LINE_BASE_LENGTH, inner)
    : "";
  // 黑色在卫星影像上太暗，改用中灰更醒目
  const black = Number.isFinite(nav.groundTrackDeg)
    ? buildGuidanceLineSvg(nav.groundTrackDeg, "#4b5563", 2.8, MAIN_MAP_LINE_BASE_LENGTH - 1, inner)
    : "";
  const yellow = Number.isFinite(nav.waypointBearingDeg)
    ? buildGuidanceLineSvg(nav.waypointBearingDeg, "#ffd94a", 3.0, MAIN_MAP_LINE_BASE_LENGTH + 2, inner)
    : "";
  let xtrackLine = "";
  if (Number.isFinite(nav.desiredHeadingDeg) && Number.isFinite(nav.xtrackErrorM) && nav.xtrackErrorM !== 0) {
    const offsetDeg =
      clamp(Math.abs(nav.xtrackErrorM) / MAIN_MAP_XTRACK_SCALE_M, 0, MAIN_MAP_XTRACK_MAX_DEG) *
      (nav.xtrackErrorM > 0 ? -1 : 1);
    xtrackLine = buildGuidanceLineSvg(
      nav.desiredHeadingDeg + offsetDeg,
      "#ff5fd2",
      2.2,
      MAIN_MAP_LINE_BASE_LENGTH - 3,
      inner
    );
  }
  return (
    '<span class="fp-vehicle-marker-overlay" aria-hidden="true">' +
    '<svg class="fp-vehicle-marker-guidance" viewBox="0 0 80 80">' +
    green + red + black + yellow + xtrackLine +
    "</svg>" +
    "</span>"
  );
}

function getFlightDataHomeMarkerIcon(homeSource) {
  const live = homeSource === "home_position" || homeSource === "gps_global_origin" || homeSource === "telemetry";
  return L.divIcon({
    className: "fp-home-marker" + (live ? " fp-home-marker--live" : ""),
    html:
      '<span class="fp-home-marker-wrap" title="Home">' +
      '<span class="fp-home-marker-badge">H</span>' +
      '<span class="fp-home-marker-label">Home</span>' +
      "</span>",
    iconSize: [56, 28],
    iconAnchor: [14, 14]
  });
}

function getFlightDataWaypointMarkerIcon(waypointNumber, altitude, roleLabel, labelQuadrant) {
  const altText =
    typeof altitude === "number" && isFinite(altitude) ? Math.round(altitude) + " m" : "--";
  const title = roleLabel
    ? roleLabel + " · " + altText
    : "航点 " + waypointNumber + " · " + altText;
  const quad = labelQuadrant || "ne";
  const roleHtml = roleLabel
    ? '<span class="fp-waypoint-marker-role-label fp-waypoint-marker-role-label--' +
      quad +
      '">' +
      roleLabel +
      "</span>"
    : "";
  return L.divIcon({
    className: "fp-waypoint-marker",
    html:
      '<span class="fp-waypoint-marker-wrap" title="' +
      title +
      '">' +
      '<span class="fp-waypoint-marker-body">' +
      '<span class="fp-waypoint-marker-dot">' +
      waypointNumber +
      "</span>" +
      roleHtml +
      "</span>" +
      '<span class="fp-waypoint-marker-alt-tag">' +
      altText +
      "</span>" +
      "</span>",
    iconSize: [72, 28],
    iconAnchor: [14, 14]
  });
}

function clearFlightDataMissionOverlay() {
  if (mapMissionHomeLayer) {
    mapMissionHomeLayer.clearLayers();
  }
  if (mapMissionRouteLayer) {
    mapMissionRouteLayer.clearLayers();
  }
}

function buildFlightDataMissionRenderablePoints(payload) {
  const detail = payload || {};
  const MM = window.MissionModel;
  const AMP = window.ArdupilotMissionCompat;
  const waypoints = Array.isArray(detail.waypoints) ? detail.waypoints : [];
  const renderable = [];

  for (let i = 0; i < waypoints.length; i += 1) {
    const wp = waypoints[i];
    if (!wp) continue;
    if (AMP && typeof AMP.isHomeRow === "function" && AMP.isHomeRow(wp, i)) {
      continue;
    }
    if (!MM || typeof MM.isRenderableNavCommand !== "function" || !MM.isRenderableNavCommand(wp.command)) {
      continue;
    }
    if (!MM.isValidMissionGeo(wp.lat, wp.lng)) {
      continue;
    }
    renderable.push({
      seq: Number.isFinite(Number(wp.seq)) ? Number(wp.seq) : i + 1,
      lat: Number(wp.lat),
      lng: Number(wp.lng),
      alt: Number(wp.alt) || 0,
      command: wp.command,
      label: typeof MM.getMapRoleLabel === "function" ? MM.getMapRoleLabel(wp) : (wp.label || "")
    });
  }
  return renderable;
}

function renderFlightDataMissionOverlay(payload) {
  latestMissionOverlayPayload = payload || latestMissionOverlayPayload;
  const detail = latestMissionOverlayPayload;
  if (!detail || !detail.home || detail.home.valid !== true) {
    return false;
  }

  const inst = mapInstance || ensureMainMapReady();
  if (!inst || !mapMissionHomeLayer || !mapMissionRouteLayer || typeof L === "undefined") {
    return false;
  }

  clearFlightDataMissionOverlay();

  const home = detail.home;
  const homeMarker = L.marker([home.lat, home.lng], {
    icon: getFlightDataHomeMarkerIcon(home.source),
    interactive: false,
    zIndexOffset: 600
  });
  homeMarker.bindPopup(
    "<strong>Home</strong><br>" +
      Number(home.lng).toFixed(6) +
      ", " +
      Number(home.lat).toFixed(6) +
      "<br>高度 " +
      (Number.isFinite(Number(home.alt)) ? Number(home.alt).toFixed(1) : "0.0") +
      " m"
  );
  mapMissionHomeLayer.addLayer(homeMarker);

  const routePoints = buildFlightDataMissionRenderablePoints(detail);
  const labelQuadrants = ["ne", "nw", "se", "sw"];
  routePoints.forEach(function (point, index) {
    const marker = L.marker([point.lat, point.lng], {
      icon: getFlightDataWaypointMarkerIcon(point.seq, point.alt, point.label, labelQuadrants[index % labelQuadrants.length]),
      interactive: false,
      zIndexOffset: 500
    });
    marker.bindPopup(
      "<strong>" +
        (point.label || ("航点 " + point.seq)) +
        "</strong><br>" +
        Number(point.lng).toFixed(6) +
        ", " +
        Number(point.lat).toFixed(6) +
        "<br>高度 " +
        Number(point.alt).toFixed(1) +
        " m"
    );
    mapMissionRouteLayer.addLayer(marker);
  });

  if (routePoints.length > 0) {
    const polylinePoints = [[home.lat, home.lng]].concat(
      routePoints.map(function (point) {
        return [point.lat, point.lng];
      })
    );
    L.polyline(polylinePoints, {
      color: "#4fc3f7",
      weight: 3,
      opacity: 0.92
    }).addTo(mapMissionRouteLayer);
  }

  return true;
}

function detectMainMapVehicleKind() {
  const VMI = window.VehicleMarkerIcons;
  if (VMI && typeof VMI.detectVehicleMarkerKind === "function") {
    return VMI.detectVehicleMarkerKind({ requireConnected: true });
  }
  return "multirotor-x";
}

function mainMapVehicleMarkerSvg(kind) {
  const VMI = window.VehicleMarkerIcons;
  if (VMI && typeof VMI.vehicleMarkerSvg === "function") {
    return VMI.vehicleMarkerSvg(kind);
  }
  return "";
}

function createMainMapVehicleIcon(kind, headingDeg) {
  const rotation = Number.isFinite(headingDeg) ? headingDeg : 0;
  return L.divIcon({
    className: "fp-vehicle-marker fp-vehicle-marker--" + kind,
    html:
      '<span class="fp-vehicle-marker-wrap" title="飞行器位置">' +
      buildMainMapGuidanceOverlay() +
      '<span class="fp-vehicle-marker-rot" style="transform:rotate(' + rotation.toFixed(1) + 'deg)">' +
      mainMapVehicleMarkerSvg(kind) +
      "</span>" +
      "</span>",
    iconSize: [80, 80],
    iconAnchor: [40, 40]
  });
}

function refreshMainMapMarkerIcon() {
  if (!mapMarker || typeof L === "undefined") return;
  const kind = detectMainMapVehicleKind();
  const snap = getGuidanceSnapshot();
  const nav = snap.navGuidance || {};
  const heading =
    kind === "disconnected"
      ? 0
      : normalizeHeadingDegrees(toDegrees(getSafe(snap.yawRad)));
  const signature = [
    kind,
    heading.toFixed(1),
    Number.isFinite(nav.headingDeg) ? nav.headingDeg.toFixed(1) : "na",
    nav.gpsValid ? 1 : 0,
    Number.isFinite(nav.groundTrackDeg) ? nav.groundTrackDeg.toFixed(1) : "na",
    Number.isFinite(nav.desiredHeadingDeg) ? nav.desiredHeadingDeg.toFixed(1) : "na",
    Number.isFinite(nav.waypointBearingDeg) ? nav.waypointBearingDeg.toFixed(1) : "na",
    Number.isFinite(nav.xtrackErrorM) ? nav.xtrackErrorM.toFixed(2) : "na"
  ].join(":");
  if (signature === mapMarkerIconSignature) return;
  mapMarkerIconSignature = signature;
  mapMarker.setIcon(createMainMapVehicleIcon(kind, heading));
}

function initMap() {
  if (mapBootstrapped && mapInstance) {
    return mapInstance;
  }
  const mapEl = document.getElementById('map');
  if (!mapEl) return null;
  if (typeof L === 'undefined') {
    console.error("❌ Leaflet 未加载");
    mapEl.innerHTML = '<div style="color:#f66;padding:40px;text-align:center;font-size:18px;">地图加载失败<br>请检查网络或关闭代理</div>';
    return null;
  }
  if (mapInstance) {
    return mapInstance;
  }

  const center = typeof window.getMapCenterLatLng === "function" ? window.getMapCenterLatLng() : [29.59256, 106.22742];
  mapInstance = L.map('map', { zoomControl: true }).setView(center, 11);
  mapBootstrapped = true;
  // expose for other modules (e.g. splitter resizing)
  safeSetWindowProp("mapInstance", mapInstance);
  
  // 卫星 + 道路/地名（均为 WGS84，与飞控 GPS 一致）
  if (typeof window.addGcsMapBaseLayers === "function") {
    window.addGcsMapBaseLayers(mapInstance);
  }
  if (window.GcsMapPrefetch && typeof window.GcsMapPrefetch.setupMap === "function") {
    window.GcsMapPrefetch.setupMap(mapInstance);
  }

  mapMissionRouteLayer = L.layerGroup().addTo(mapInstance);
  mapMissionHomeLayer = L.layerGroup().addTo(mapInstance);

  mapMarker = L.marker(center, {
    icon: createMainMapVehicleIcon(
      detectMainMapVehicleKind(),
      normalizeHeadingDegrees(toDegrees(getSafe(window.yaw)))
    )
  }).addTo(mapInstance);
  refreshMainMapMarkerIcon();
  if (latestMissionOverlayPayload) {
    renderFlightDataMissionOverlay(latestMissionOverlayPayload);
  }

  // 创建一个自定义控件显示经纬度与海拔（左下角）
  const MapInfoControl = L.Control.extend({
    onAdd: function(map) {
      mapInfoDiv = L.DomUtil.create('div', 'map-info');
      mapInfoDiv.innerHTML = '';
      L.DomEvent.disableClickPropagation(mapInfoDiv);
      return mapInfoDiv;
    }
  });
  mapInstance.addControl(new MapInfoControl({ position: 'bottomleft' }));

  const updateMap = function(lat, lon) {
    if (mapMarker) mapMarker.setLatLng([lat, lon]);
    refreshMainMapMarkerIcon();
    // 仅平移中心点，保留用户当前缩放级别
    if (mapInstance) mapInstance.panTo([lat, lon], { animate: false });
    if (mapInfoDiv) {
      // 按要求显示：经纬度，海拔高度，黑色字体，大小30（由CSS控制）
      const latStr = (typeof lat === 'number') ? lat.toFixed(6) : (window.lat || 0).toFixed(6);
      const lonStr = (typeof lon === 'number') ? lon.toFixed(6) : (window.lon || 0).toFixed(6);
      const altStr = (typeof window.altitude === 'number') ? window.altitude.toFixed(1) : '0.0';
      mapInfoDiv.innerHTML = `经度: ${lonStr}<br>纬度: ${latStr}<br>海拔: ${altStr} m`;
    }
  };
  safeSetWindowProp("updateMap", updateMap);

  console.log("✅ 地图初始化成功");
  return mapInstance;
}

function ensureMainMapReady() {
  if (mapInstance) {
    return mapInstance;
  }
  if (mapInitScheduled) {
    return null;
  }
  mapInitScheduled = true;
  scheduleFrame(() => {
    mapInitScheduled = false;
    const inst = initMap();
    if (inst) {
      setTimeout(() => {
        try {
          inst.invalidateSize();
          if (typeof window.lat === "number" && typeof window.lon === "number") {
            updateMap(window.lat, window.lon);
          }
        } catch (_) { /* ignore */ }
      }, 80);
    }
  });
  return null;
}

function recoverMainMapIfNeeded() {
  if (currentMainView !== "flight-data") return;
  const mapEl = document.getElementById("map");
  if (!mapEl) return;
  const missingLeaflet = !mapEl.querySelector(".leaflet-pane");
  const missingMarker = !mapEl.querySelector(".fp-vehicle-marker");
  if (!missingLeaflet && !missingMarker) return;
  const inst = ensureMainMapReady();
  const target = inst || mapInstance || safeGetWindowProp("mapInstance");
  if (!target) return;
  setTimeout(() => {
    try {
      target.invalidateSize();
      if (typeof window.lat === "number" && typeof window.lon === "number") {
        const updater = safeGetWindowProp("updateMap");
        if (typeof updater === "function") updater(window.lat, window.lon);
      }
      refreshMainMapMarkerIcon();
    } catch (_) { /* ignore */ }
  }, 80);
}

safeSetWindowProp("ensureMainMapReady", ensureMainMapReady);
safeSetWindowProp("recoverMainMapIfNeeded", recoverMainMapIfNeeded);
safeSetWindowProp("renderFlightDataMissionOverlay", renderFlightDataMissionOverlay);
safeSetWindowProp("clearFlightDataMissionOverlay", clearFlightDataMissionOverlay);

// 页面完全加载后强制刷新地图尺寸
window.addEventListener('load', () => {
  setTimeout(() => {
    if (currentMainView === 'flight-data') {
      const inst = ensureMainMapReady();
      if (inst) inst.invalidateSize();
      recoverMainMapIfNeeded();
    }
  }, 800);
});

window.addEventListener('resize', () => {
  try {
    if (mapInstance?.invalidateSize) mapInstance.invalidateSize();
  } catch (_) { /* ignore */ }
});

// ==================== 日志面板选项卡切换逻辑 ====================
function initLogTabs() {
  const tabs = document.querySelectorAll('.log-tab');
  const panels = document.querySelectorAll('.log-panel');

  function setActive(name) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.panel === name));
    panels.forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
    if (name === 'messages' && typeof window.gcsMarkMessagesRead === 'function') {
      window.gcsMarkMessagesRead();
    }
  }

  tabs.forEach(t => {
    t.addEventListener('click', () => setActive(t.dataset.panel));
  });

  // 默认激活第一个（如果需要可从本地状态恢复）
  if (tabs.length) setActive(tabs[0].dataset.panel);

  // 暴露给全局用于外部切换
  safeSetWindowProp("setLogTab", setActive);
}

// DOM 准备好后初始化日志选项卡
function bootstrapHudMapTabs() {
  initMainTabs();
  initLogTabs();
  document.addEventListener("gcs:telemetry-frame", function (event) {
    const detail = event.detail || {};
    if (Number.isFinite(Number(detail.yawRad))) localGuidanceState.yawRad = Number(detail.yawRad);
    if (Number.isFinite(Number(detail.lat))) localGuidanceState.lat = Number(detail.lat);
    if (Number.isFinite(Number(detail.lon))) localGuidanceState.lon = Number(detail.lon);
    if (Number.isFinite(Number(detail.altitude))) localGuidanceState.altitude = Number(detail.altitude);
    if (Number.isFinite(Number(detail.gpsFixType))) localGuidanceState.gpsFixType = Number(detail.gpsFixType);
    if (Number.isFinite(Number(detail.lastGposMs))) localGuidanceState.lastGposMs = Number(detail.lastGposMs);
    if (Number.isFinite(Number(detail.lastGpsRawMs))) localGuidanceState.lastGpsRawMs = Number(detail.lastGpsRawMs);
    if (detail.navGuidance && typeof detail.navGuidance === "object") {
      Object.assign(localGuidanceState.navGuidance, detail.navGuidance);
    }
    if (mapMarker && Number.isFinite(localGuidanceState.lat) && Number.isFinite(localGuidanceState.lon)) {
      mapMarker.setLatLng([localGuidanceState.lat, localGuidanceState.lon]);
      if (mapInstance) {
        mapInstance.panTo([localGuidanceState.lat, localGuidanceState.lon], { animate: false });
      }
      refreshMainMapMarkerIcon();
    }
  });
  document.addEventListener("gcs-connection", () => {
    mapMarkerIconSignature = "";
    refreshMainMapMarkerIcon();
  });
  document.addEventListener("gcs-airframe-params-changed", () => {
    mapMarkerIconSignature = "";
    refreshMainMapMarkerIcon();
  });
  document.addEventListener("gcs-mission-sync-success", function (event) {
    renderFlightDataMissionOverlay(event.detail || null);
  });
  setTimeout(() => {
    if (document.getElementById("view-flight-data")?.classList.contains("active")) {
      ensureMainMapReady();
      recoverMainMapIfNeeded();
    }
  }, 50);
}

if (document.readyState === "loading") {
  window.addEventListener('DOMContentLoaded', bootstrapHudMapTabs, { once: true });
} else {
  bootstrapHudMapTabs();
}

// ==================== 主页面选项卡切换 ====================
function initMainTabs() {
  const tabs = document.querySelectorAll('.main-tab');
  const views = document.querySelectorAll('.main-view');
  if (!tabs.length || !views.length) return;

  function setMainView(name) {
    currentMainView = name;
    safeSetWindowProp("_currentMainView", name);
    tabs.forEach(t => t.classList.toggle('active', t.dataset.view === name));
    views.forEach(v => v.classList.toggle('active', v.id === `view-${name}`));

    dispatchCompatEvent(window, 'gcs:main-view-changed', { name });

    // 切换回飞行数据页时，刷新地图尺寸避免 Leaflet 拉伸异常
    if (name === 'flight-data') {
      const inst = ensureMainMapReady();
      if (inst) {
        setTimeout(() => {
          inst.invalidateSize();
          recoverMainMapIfNeeded();
        }, 80);
      }
    }
  }

  tabs.forEach(t => {
    t.addEventListener('click', () => setMainView(t.dataset.view));
  });

  // 默认激活第一个
  setMainView(tabs[0].dataset.view);
  safeSetWindowProp("setMainView", setMainView);
}

// 一个便捷函数：把消息写到日志（默认写进最后的日志面板中的 #log）
const appendLog = function(msg) {
  const logEl = document.getElementById('log');
  if (!logEl) return;
  const line = document.createElement('div');
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
};
safeSetWindowProp("appendLog", appendLog);

// ==================== 遥测 → canvas#hud / #quick-grid 调度 ====================
// MAVLink 高频时若每条消息都 RAF 重绘 800×800 HUD，CPU/GPU 会拉满。这里合并 RAF 并限制最高刷新率。
const _UI_MAX_HZ = 20;
const _UI_MIN_INTERVAL_MS = 1000 / _UI_MAX_HZ;
let _uiRaf = null;
let _uiLastDrawMs = 0;

function _runHudAndQuickGrid() {
  renderHudToCanvas();
  if (typeof window.refreshQuickGrid === "function") window.refreshQuickGrid();
  recoverMainMapIfNeeded();
  refreshMainMapMarkerIcon();
}

const scheduleUIUpdate = function () {
  if (document.hidden) return;
  if (_uiRaf != null) return;
  _uiRaf = scheduleFrame(function tick(now) {
    if (_uiLastDrawMs > 0 && now - _uiLastDrawMs < _UI_MIN_INTERVAL_MS) {
      _uiRaf = scheduleFrame(tick);
      return;
    }
    _uiLastDrawMs = now;
    _uiRaf = null;
    _runHudAndQuickGrid();
  });
};
safeSetWindowProp("scheduleUIUpdate", scheduleUIUpdate);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  _uiLastDrawMs = 0;
  _runHudAndQuickGrid();
});

// 未连接或极低流量时仍偶尔刷新（原 250ms 与 schedule 重复且徒增发热）
setInterval(() => {
  if (document.hidden) return;
  _runHudAndQuickGrid();
}, 2000);
