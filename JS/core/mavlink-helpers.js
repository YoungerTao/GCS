/**
 * MAVLink 辅助函数 — 从 mavlink.js 拆分
 *  格式/解码/同步函数，不涉及 MAVLink 协议解析
 */

/** MAVLink AUTOPILOT_VERSION.flight_sw_version → semver + release type */
function decodeFlightSwVersion(u32) {
  const major = (u32 >>> 24) & 0xff;
  const minor = (u32 >>> 16) & 0xff;
  const patch = (u32 >>> 8) & 0xff;
  const typ = u32 & 0xff;
  let s = `${major}.${minor}.${patch}`;
  if (typ === 64) s += " (alpha)";
  else if (typ === 128) s += " (beta)";
  else if (typ === 192) s += " (rc)";
  else if (typ !== 255 && typ !== 0) s += ` (type ${typ})`;
  return s;
}
window.decodeFlightSwVersion = decodeFlightSwVersion;

function formatUidWordPair(dv, off) {
  const lo = dv.getUint32(off, true);
  const hi = dv.getUint32(off + 4, true);
  if ((lo | hi) === 0) return "";
  return `${hi.toString(16).padStart(8, "0")}${lo.toString(16).padStart(8, "0")}`;
}

function bytesToHexTrim(u8, start, len) {
  let end = start + len;
  while (end > start && u8[end - 1] === 0) end -= 1;
  if (end <= start) return "";
  let s = "";
  for (let i = start; i < end; i += 1) s += u8[i].toString(16).padStart(2, "0");
  return s;
}

function humanizeBoardIdName(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .replace(/^AP_HW_/i, "")
    .replace(/^TARGET_HW_/i, "")
    .replace(/_/g, " ");
}

function getFlightModeString(custom_mode) {
  const modes = {
    0: "STABILIZE", 1: "ACRO", 2: "ALT_HOLD", 3: "AUTO", 4: "GUIDED",
    5: "LOITER", 6: "RTL", 9: "LAND", 10: "DRIFT", 11: "CIRCLE",
    13: "SPORT", 14: "POSHOLD", 15: "BRAKE", 16: "THROW",
    17: "AVOID_ADSB", 18: "GUIDED_NOGPS", 19: "SMART_RTL",
    20: "FLOWHOLD", 21: "FOLLOW", 22: "ZIGZAG", 23: "SYSTEMID",
    24: "AUTOROTATE", 25: "AUTO_RTL"
  };
  return modes[custom_mode] || `UNKNOWN(${custom_mode})`;
}
window.getFlightModeString = getFlightModeString;

const GPS_FIX_LABELS = {
  0: "无 GPS",
  1: "未定位",
  2: "2D定位",
  3: "3D定位",
  4: "DGPS",
  5: "RTK Float",
  6: "RTK Fixed",
};

function hasFreshGlobalPosition() {
  const lastGpos = Number(window._lastGposMs) || 0;
  if (!lastGpos || Date.now() - lastGpos > 6000) return false;
  const lat = Number(window.lat);
  const lon = Number(window.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (Math.abs(lat) < 1e-5 && Math.abs(lon) < 1e-5) return false;
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

/** 综合 fix_type、卫星数、GPS 消息是否新鲜、GLOBAL_POSITION 兜底 */
function resolveGpsFixDisplay() {
  let fix = Number(window.gps_fix_type);
  if (!Number.isFinite(fix)) fix = 0;

  let sats = Number(window.gps_satellites_visible);
  if (!Number.isFinite(sats)) sats = 0;

  const lastGps = Number(window._lastGpsRawMs) || 0;
  const gpsFresh = lastGps > 0 && Date.now() - lastGps <= 6000;

  // 有卫星但 fix=0：模块在，视为搜星中（非「无 GPS」）
  if (fix === 0 && sats > 0) fix = 1;

  if (!gpsFresh) {
    if (hasFreshGlobalPosition() && fix < 2) {
      return { fix, sats, mode: "inferred" };
    }
    if (lastGps === 0 && fix < 2) {
      return { fix, sats, mode: "waiting" };
    }
    if (fix < 2) {
      return { fix, sats, mode: "stale" };
    }
  }

  return { fix, sats, mode: "live" };
}
window.resolveGpsFixDisplay = resolveGpsFixDisplay;

/** HUD 用 GPS 定位文案（与 Mission Planner 习惯一致） */
function formatGpsFixHudLabel() {
  const { fix, sats, mode } = resolveGpsFixDisplay();

  const satSuffix = sats > 0 ? ` (${sats}星)` : "";

  if (mode === "waiting") return "GPS: 等待数据";
  if (mode === "stale" && fix < 2) return `GPS: 信号中断${satSuffix}`;
  if (mode === "inferred") return "GPS: 融合定位";

  if (fix === 0) return "GPS: 无";
  if (fix === 1) return `GPS: 未定位${satSuffix}`;

  const base = GPS_FIX_LABELS[fix] || `Fix${fix}`;
  return satSuffix ? `GPS: ${base}${satSuffix}` : `GPS: ${base}`;
}
window.formatGpsFixHudLabel = formatGpsFixHudLabel;

/** HUD 右下角紧凑文案（避免 28px 长串中文超出 800px 画布） */
function formatGpsFixHudLabelCompact() {
  const { fix, sats, mode } = resolveGpsFixDisplay();
  const sat = sats > 0 ? `·${sats}` : "";

  if (mode === "waiting") return "GPS 等待";
  if (mode === "stale" && fix < 2) return `GPS 中断${sat}`;
  if (mode === "inferred") return "GPS EKF";

  if (fix === 0) return "GPS 无";
  if (fix === 1) return `GPS 搜星${sat}`;

  const short = { 2: "2D", 3: "3D", 4: "DGPS", 5: "RTK-F", 6: "RTK" };
  const base = short[fix] || `F${fix}`;
  return `GPS ${base}${sat}`;
}
window.formatGpsFixHudLabelCompact = formatGpsFixHudLabelCompact;

/**
 * @returns {'danger'|'warning'|'normal'}
 */
function getGpsFixHudSeverity() {
  const { fix, mode } = resolveGpsFixDisplay();
  if (mode === "waiting" || mode === "stale" || mode === "inferred") return "warning";
  if (fix === 0) return "danger";
  if (fix === 1) return "warning";
  if (fix === 2) return "warning";
  return "normal";
}
window.getGpsFixHudSeverity = getGpsFixHudSeverity;

/** 把常用的已解析变量同步到 window.telemetry */
function syncToTelemetry() {
  try {
    window.telemetry = window.telemetry || {};
    const t = window.telemetry;
    if (typeof window.roll !== 'undefined') t.roll = window.roll;
    if (typeof window.pitch !== 'undefined') t.pitch = window.pitch;
    if (typeof window.yaw !== 'undefined') t.yaw = window.yaw;
    if (typeof window.altitude !== 'undefined') t.alt = window.altitude;
    if (typeof window.airspeed !== 'undefined') t.airspeed = window.airspeed;
    if (typeof window.groundspeed !== 'undefined') t.groundspeed = window.groundspeed;
    if (typeof window.climb_rate !== 'undefined') t.climbrate = window.climb_rate;
    if (typeof window.battery_voltage !== 'undefined') t.battery_voltage = window.battery_voltage;
    if (typeof window.armed !== 'undefined') t.armed = window.armed;
    if (typeof window.flight_mode !== 'undefined') t.flight_mode = window.flight_mode;

    // IMU 加速度：优先高精度 HIGHRES_IMU，否则 SCALED_IMU
    const imuG = (typeof window.highresImuG === 'object' && window.highresImuG && (Date.now() - window.highresImuG.t) < 500)
      ? window.highresImuG
      : (typeof window.scaledImuG === 'object' && window.scaledImuG && (Date.now() - window.scaledImuG.t) < 500)
        ? window.scaledImuG
        : null;
    if (imuG) {
      t.accel_x_g = imuG.x;
      t.accel_y_g = imuG.y;
      t.accel_z_g = imuG.z;
    }

    // 补充参数表中常用值
    const pmap = window.params;
    if (pmap instanceof Map) {
      const supplement = ['esc1_temp', 'battery_remaining', 'battery_usedmah', 'battery_temp',
        'esc1_volt', 'esc1_curr', 'battery_cell1', 'battery_voltage2'];
      for (const k of supplement) {
        if (pmap.has(k) && typeof pmap.get(k) !== 'undefined') t[k] = pmap.get(k);
      }
    }

    // 补充 window 上存在的常见变量
    ['lat', 'lon', 'gps_fix_type', 'gps_satellites_visible', 'wp_current', 'vibe_status', 'ekf_status'].forEach(k => {
      if (typeof window[k] !== 'undefined' && typeof t[k] === 'undefined') t[k] = window[k];
    });
  } catch (e) {
    console.warn('syncToTelemetry failed', e);
  }
}
window.syncToTelemetry = syncToTelemetry;

/** 在 #params div 中渲染排序后的参数列表 */
function renderSortedParams() {
  const el = document.getElementById("params");
  const pmap = window.params;
  if (!el || !(pmap instanceof Map)) return;
  const total = Number.isFinite(window._paramCount) ? window._paramCount : pmap.size;
  const rows = Array.from(pmap.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "en", { sensitivity: "base" }))
    .map(([k, v], i) => `${i + 1}/${total} ${k}=${Number(v).toFixed(4)}`);
  el.innerHTML = rows.join("<br>");
}
window.renderSortedParams = renderSortedParams;

/** 防抖的参数表渲染调度（RAF + 防抖） */
let _paramTableRenderRaf = null;

function scheduleParamTableRender() {
  if (window._paramLoadActive) return;
  if (_paramTableRenderRaf != null) return;
  _paramTableRenderRaf = requestAnimationFrame(() => {
    _paramTableRenderRaf = null;
    renderSortedParams();
    try {
      if (typeof window.refreshAllParamsTable === "function") window.refreshAllParamsTable();
    } catch (_) { /* ignore */ }
  });
}
window.scheduleParamTableRender = scheduleParamTableRender;

console.log("✅ mavlink-helpers.js 已加载");
