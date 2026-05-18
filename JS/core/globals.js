// ===== 全局变量全部挂到 window 上，确保所有 JS 文件都能访问 =====
window.port = null;
window.reader = null;
window.writer = null;
window.buf = [];

// 全局 telemetry 容器：确保其他模块可以统一读取
window.telemetry = window.telemetry || {};

// 飞控目标（仅从 HEARTBEAT 更新）；勿用作本地面站发出的 MAVLink 帧头 sysid
window.sysid = 1;
window.compid = 1;
window.fcSysid = 1;
window.fcCompid = 1;
// 与 Mission Planner 一致：地面站自身 MAVLink system id 用 255，避免与飞控(常为1)冲突
window.gcsSysId = 255;

window.params = new Map();

window.roll = 0;
window.pitch = 0;
window.yaw = 0;
// 重庆市璧山区 近似中心（WGS84）；未收到有效 GPS 前地图默认中心与此一致
window.DEFAULT_MAP_LAT = 29.59256;
window.DEFAULT_MAP_LON = 106.22742;

/** 有 GPS 定位（fix≥2）时用飞控经纬度，否则用默认璧山中心 */
window.getMapCenterLatLng = function getMapCenterLatLng() {
  const fix = Number(window.gps_fix_type);
  const lat = window.lat;
  const lon = window.lon;
  if (
    Number.isFinite(fix) &&
    fix >= 2 &&
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  ) {
    return [lat, lon];
  }
  return [window.DEFAULT_MAP_LAT, window.DEFAULT_MAP_LON];
};

window.lat = window.DEFAULT_MAP_LAT;
window.lon = window.DEFAULT_MAP_LON;
window.airspeed = 0;
window.groundspeed = 0;
window.altitude = 0;
window.climb_rate = 0;

window.battery_voltage = 0;
window.gps_fix_type = 0;
window.ekf_status = false;
window.armed = false;
window.flight_mode = "UNKNOWN";
window.dist_to_wp = 0;
window.wp_current = null;
window.vibe_status = 0;
window.escTelemetry = window.escTelemetry || {};
window.powerInstances = window.powerInstances || new Map();

// 用于记录每类消息的最后一条内容，按 key 去重
window._lastLogByKey = {};
// 用于存储上次重要数值（如电池电压）以便阈值判断
window._lastValues = {};
window._logEntryCount = 0;
window._logMaxEntries = 240;

function log(s, key = null) {
  try {
    let el = document.getElementById("log");
    if (!el) return;

    // 推断 key：优先使用传入 key，否则尝试从消息中提取（'→'前面或':'前面）
    let dedupeKey = key;
    if (!dedupeKey) {
      if (typeof s === 'string') {
        const arrowIdx = s.indexOf('→');
        if (arrowIdx !== -1) dedupeKey = s.slice(0, arrowIdx).trim();
        else if (s.indexOf(':') !== -1) dedupeKey = s.split(':')[0].trim();
        else dedupeKey = s.split(' ')[0].trim();
      } else {
        dedupeKey = 'default';
      }
    }

    // 如果与上次完全相同则不重复写入
    if (window._lastLogByKey[dedupeKey] === s) return;
    window._lastLogByKey[dedupeKey] = s;

    const line = document.createElement("div");
    line.className = "gcs-log-line";
    line.textContent = s;
    el.appendChild(line);
    window._logEntryCount += 1;
    const maxEntries =
      Number.isFinite(window._logMaxEntries) && window._logMaxEntries > 20
        ? window._logMaxEntries
        : 240;
    while (window._logEntryCount > maxEntries && el.firstChild) {
      el.removeChild(el.firstChild);
      window._logEntryCount -= 1;
    }
    el.scrollTop = el.scrollHeight;
  } catch (e) {
    console.error('log error', e);
  }
}

// 遥测→界面：mavlink handle 末尾调用 window.scheduleUIUpdate()；hud-map-tabs.js 内 RAF 节流刷新 canvas#hud 与 window.refreshQuickGrid（#quick-grid）

console.log("✅ main.js 全局变量已正确挂载到 window");
