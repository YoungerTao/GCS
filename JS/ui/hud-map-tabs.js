<!-- JS/ui.js 完整替换内容 -->
const canvas = document.getElementById("hud");
const ctx = canvas.getContext("2d");

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

function toDegrees(rad) {
  return rad * RAD_TO_DEG;
}

function normalizeHeadingDegrees(deg) {
  return ((deg % 360) + 360) % 360;
}

function getSafe(val, def = 0) {
  return (typeof val !== 'undefined' && !isNaN(val)) ? val : def;
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

  ctx.fillStyle = HUD_COLORS.WARNING;
  ctx.font = "bold 34px monospace";
  ctx.textAlign = "right";
  ctx.fillText(speed.toFixed(0), 30, 12);

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
  ctx.translate(740, 400);
  let alt = smoothed_altitude;
  ctx.fillStyle = HUD_COLORS.BACKGROUND;
  ctx.fillRect(0, -250, 70, 500);
  ctx.strokeStyle = "rgba(0, 255, 159, 0.5)";
  ctx.strokeRect(0, -250, 70, 500);
  ctx.textAlign = "left";
  ctx.font = "22px Consolas";
  for (let a = Math.floor(alt / 5) * 5 - 20; a <= Math.floor(alt / 5) * 5 + 20; a += 5) {
    let y = (alt - a) * 20;
    if (y < -240 || y > 240) continue;
    ctx.strokeStyle = HUD_COLORS.NORMAL;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(15, y);
    ctx.stroke();
    if (a % 10 === 0) {
      ctx.fillStyle = HUD_COLORS.NORMAL;
      ctx.fillText(a.toString(), 20, y + 8);
    }
  }
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(75, -25);
  ctx.lineTo(75, 25);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = HUD_COLORS.NORMAL;
  ctx.stroke();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 24px Consolas";
  ctx.textAlign = "center";
  ctx.fillText(alt.toFixed(0), 38, 10);
  ctx.fillStyle = HUD_COLORS.NORMAL;
  ctx.font = "25px Consolas";
  ctx.fillText("m", 35, 275);
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

  let gpsText = gpsType >= 3 ? `GPS: ${gpsType}` : "GPS: 无";
  let gpsColor = gpsType >= 3 ? HUD_COLORS.NORMAL : HUD_COLORS.DANGER;
  glowText(gpsText, itemWidth * 2.8, 0, bottomFont, gpsColor);

  ctx.translate(itemWidth * 2.8, -40);
  const dist = getSafe(window.dist_to_wp, 0);
  const wpNext = (typeof window.wp_current === 'number') ? `WP${window.wp_current + 1}` : 'WP0';
  glowText(`${dist}m > ${wpNext}`, 0, 0, "20px Consolas", HUD_COLORS.NORMAL);
  glowText(mode, 0, -35, "bold 26px Consolas", HUD_COLORS.NORMAL);
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

window.renderHudToCanvas = renderHudToCanvas;
// drawHUD 为调度器与兜底定时器使用的别名（实际绘制函数体为 renderHudToCanvas）
window.drawHUD = renderHudToCanvas;
console.log("✅ HUD 绘制已导出为 window.renderHudToCanvas / window.drawHUD");



// ==================== 地图初始化（新增） ====================
let mapInstance, mapMarker;

function initMap() {
  const mapEl = document.getElementById('map');
  if (typeof L === 'undefined') {
    console.error("❌ Leaflet 未加载");
    mapEl.innerHTML = '<div style="color:#f66;padding:40px;text-align:center;font-size:18px;">地图加载失败<br>请检查网络或关闭代理</div>';
    return;
  }

  const center = typeof window.getMapCenterLatLng === "function" ? window.getMapCenterLatLng() : [29.59256, 106.22742];
  mapInstance = L.map('map', { zoomControl: true }).setView(center, 11);
  // expose for other modules (e.g. splitter resizing)
  window.mapInstance = mapInstance;
  
  // 卫星 + 道路/地名（均为 WGS84，与飞控 GPS 一致）
  if (typeof window.addGcsMapBaseLayers === "function") {
    window.addGcsMapBaseLayers(mapInstance);
  }

  mapMarker = L.marker(center).addTo(mapInstance);

  // 创建一个自定义控件显示经纬度与海拔（左下角）
  let mapInfoDiv = null;
  const MapInfoControl = L.Control.extend({
    onAdd: function(map) {
      mapInfoDiv = L.DomUtil.create('div', 'map-info');
      mapInfoDiv.innerHTML = '';
      L.DomEvent.disableClickPropagation(mapInfoDiv);
      return mapInfoDiv;
    }
  });
  mapInstance.addControl(new MapInfoControl({ position: 'bottomleft' }));

  window.updateMap = function(lat, lon) {
    if (mapMarker) mapMarker.setLatLng([lat, lon]);
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

  console.log("✅ 地图初始化成功");
}

// 启动地图
initMap();

// 页面完全加载后强制刷新地图尺寸
window.addEventListener('load', () => {
  setTimeout(() => {
    if (mapInstance) mapInstance.invalidateSize();
  }, 800);
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
  window.setLogTab = setActive;
}

// DOM 准备好后初始化日志选项卡
window.addEventListener('DOMContentLoaded', () => {
  initMainTabs();
  initLogTabs();
});

// ==================== 主页面选项卡切换 ====================
function initMainTabs() {
  const tabs = document.querySelectorAll('.main-tab');
  const views = document.querySelectorAll('.main-view');
  if (!tabs.length || !views.length) return;

  function setMainView(name) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.view === name));
    views.forEach(v => v.classList.toggle('active', v.id === `view-${name}`));

    window.dispatchEvent(new CustomEvent('gcs:main-view-changed', {
      detail: { name }
    }));

    // 切换回飞行数据页时，刷新地图尺寸避免 Leaflet 拉伸异常
    if (name === 'flight-data' && window.mapInstance) {
      setTimeout(() => window.mapInstance.invalidateSize(), 80);
    }
  }

  tabs.forEach(t => {
    t.addEventListener('click', () => setMainView(t.dataset.view));
  });

  // 默认激活第一个
  setMainView(tabs[0].dataset.view);
  window.setMainView = setMainView;
}

// 一个便捷函数：把消息写到日志（默认写进最后的日志面板中的 #log）
window.appendLog = function(msg) {
  const logEl = document.getElementById('log');
  if (!logEl) return;
  const line = document.createElement('div');
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
};

// ==================== 遥测 → canvas#hud / #quick-grid 调度 ====================
// MAVLink 高频时若每条消息都 RAF 重绘 800×800 HUD，CPU/GPU 会拉满。这里合并 RAF 并限制最高刷新率。
const _UI_MAX_HZ = 20;
const _UI_MIN_INTERVAL_MS = 1000 / _UI_MAX_HZ;
let _uiRaf = null;
let _uiLastDrawMs = 0;

function _runHudAndQuickGrid() {
  if (typeof window.drawHUD === "function") window.drawHUD();
  if (typeof window.refreshQuickGrid === "function") window.refreshQuickGrid();
}

window.scheduleUIUpdate = function () {
  if (document.hidden) return;
  if (_uiRaf != null) return;
  _uiRaf = requestAnimationFrame(function tick(now) {
    if (_uiLastDrawMs > 0 && now - _uiLastDrawMs < _UI_MIN_INTERVAL_MS) {
      _uiRaf = requestAnimationFrame(tick);
      return;
    }
    _uiLastDrawMs = now;
    _uiRaf = null;
    _runHudAndQuickGrid();
  });
};

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
