// ===== 全局变量全部挂到 window 上，确保所有 JS 文件都能访问 =====
window.port = null;
window.reader = null;
window.writer = null;
window.buf = [];

// 全局 telemetry 容器：确保其他模块可以统一读取
window.telemetry = window.telemetry || {};

window.sysid = 1;
window.compid = 1;

window.params = new Map();

window.roll = 0;
window.pitch = 0;
window.yaw = 0;
window.lat = 23.7;
window.lon = 120.9;
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

    el.innerHTML += s + "<br>";
    el.scrollTop = el.scrollHeight;
  } catch (e) {
    console.error('log error', e);
  }
}

console.log("✅ main.js 全局变量已正确挂载到 window");