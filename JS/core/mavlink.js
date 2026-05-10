function crc_accumulate(byte, crc){
  let tmp = byte ^ (crc & 0xff);
  tmp ^= (tmp << 4) & 0xff;
  return (((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xffff);
}

function crc_calculate(buffer){
  let crc = 0xffff;
  for(let b of buffer) crc = crc_accumulate(b, crc);
  return crc;
}

// 完整 ArduPilot 常用 CRC_EXTRA 表（已覆盖你日志中所有消息）
const CRC_EXTRA = {
  0:50, 1:124, 2:151, 4:231, 21:159, 22:220, 24:24, 30:39, 33:104,
  74:20, 75:152, 76:241, 77:143, 83:53, 105:158, 110:115, 163:105, 125:0, 152:0, 62:0,
  42:0, 36:0, 65:0, 27:144, 116:76, 129:46, 29:0, 137:0, 147:154, 167:106, 191:92, 192:36, 253:83
};
const ESC_TELEMETRY_MSG_IDS = new Set([11030, 11031, 11032, 11033]);

function parse(){
  while(buf.length > 10){
    if(buf[0] !== 0xFD){ buf.shift(); continue; }

    let len = buf[1];
    let full = 10 + len + 2;
    if(buf.length < full) return;

    let pkt = buf.slice(0, full);
    buf = buf.slice(full);

    let msgid = pkt[7] | (pkt[8]<<8) | (pkt[9]<<16);

    let crc = crc_calculate(pkt.slice(1, 10+len));
    crc = crc_accumulate(CRC_EXTRA[msgid] || 0, crc);

    let rx = pkt[10+len] | (pkt[11+len]<<8);

    if(crc !== rx){
      // ESC 扩展消息在不同方言下 CRC_EXTRA 可能不一致，允许按消息头/长度继续解析
      if (ESC_TELEMETRY_MSG_IDS.has(msgid)) {
        if (!window._escCrcBypassWarned) {
          console.warn("ESC 遥测 CRC 校验未命中，已启用兼容解析模式");
          window._escCrcBypassWarned = true;
        }
      } else {
      // 只在第一次看到未知消息时警告，减少刷屏
        if(!window.crcWarned) {
          console.warn(`CRC 错误 msg=${msgid} (已忽略，继续解析)`);
          window.crcWarned = true;
        }
        continue;
      }
    }

    console.log(`[MAVLink] ✅ 收到消息 ID=${msgid}`);
    handle(msgid, pkt.slice(10,10+len), pkt[5], pkt[6]);
  }
}

function handle(id, payload, sys, comp){
  if(sys) window.sysid = sys;
  if(comp) window.compid = comp;

if(id === 0){ // HEARTBEAT
    let dv = new DataView(new Uint8Array(payload).buffer);
    let custom_mode = dv.getUint32(0, true);   // ← 关键修改！改成 offset=0
    let base_mode = dv.getUint8(4);            // base_mode 在第4字节
    
    window.flight_mode = getFlightModeString(custom_mode);
    window.armed = (base_mode & 0x80) !== 0;  // bit 7: 0=DISARMED, 1=ARMED
    
    log(`HEARTBEAT → 模式: ${window.flight_mode} (custom_mode=${custom_mode}) ${window.armed ? '✅ 已解锁' : '🔒 未解锁'}`);
    
    // 可选：保留一点调试（以后可以删）
    console.log(`[HEARTBEAT] 正确解析 custom_mode=${custom_mode} → ${window.flight_mode}, armed=${window.armed}`);
}
  if(id === 1){ // SYS_STATUS
    let dv = new DataView(new Uint8Array(payload).buffer);
    const newBat = dv.getUint16(14, true) / 1000;
    // 仅在电压较大变化时记录日志（阈值 0.1V），并且同一类日志至少间隔 5 秒
    const prevBat = (window._lastValues && typeof window._lastValues.battery_voltage === 'number') ? window._lastValues.battery_voltage : null;
    const lastLoggedTs = (window._lastValues && window._lastValues.battery_last_log_ts) ? window._lastValues.battery_last_log_ts : 0;
    const now = Date.now();
    window.battery_voltage = newBat;
    window._lastValues.battery_voltage = newBat;
    const valChanged = (prevBat === null) || (Math.abs(newBat - prevBat) >= 0.1);
    const timePassed = (now - lastLoggedTs) >= 5000;
    if (valChanged || timePassed) {
      log(`电池电压更新: ${newBat.toFixed(2)}V`, 'battery');
      window._lastValues.battery_last_log_ts = now;
    }
  }

  if(id === 22) parseParam(payload);

  if(id === 24){ // GPS_RAW_INT
    let dv = new DataView(new Uint8Array(payload).buffer);
    window.gps_fix_type = dv.getUint8(4);
  }

  if(id === 30){ // ATTITUDE
    let dv = new DataView(new Uint8Array(payload).buffer);
    window.roll = dv.getFloat32(4,true);
    window.pitch = dv.getFloat32(8,true);
    window.yaw = dv.getFloat32(12,true);
    console.log(`ATTITUDE → roll=${window.roll.toFixed(2)} pitch=${window.pitch.toFixed(2)} yaw=${window.yaw.toFixed(2)}`);
  }

  if(id === 33){ // GLOBAL_POSITION_INT
    let dv = new DataView(new Uint8Array(payload).buffer);
    window.lat = dv.getInt32(4,true)/1e7;
    window.lon = dv.getInt32(8,true)/1e7;
    window.altitude = dv.getInt32(16,true)/1000;   // relative_alt
    console.log(`GLOBAL_POSITION_INT → 相对高度=${window.altitude.toFixed(1)}m`);
    if(window.updateMap) window.updateMap(window.lat, window.lon);
  }

  if(id === 74){ // VFR_HUD
    let dv = new DataView(new Uint8Array(payload).buffer);
    window.airspeed = dv.getFloat32(0, true);
    window.groundspeed = dv.getFloat32(4, true);
    window.climb_rate = dv.getFloat32(12, true);
    console.log(`VFR_HUD → 空速=${window.airspeed.toFixed(1)} 爬升=${window.climb_rate.toFixed(1)}`);
  }

  if(id === 42){ // MISSION_CURRENT
    let dv = new DataView(new Uint8Array(payload).buffer);
    // seq: uint16 at offset 0
    window.wp_current = dv.getUint16(0, true);
    console.log(`MISSION_CURRENT → current_seq=${window.wp_current}`);
  }

  if(id === 65){ // RC_CHANNELS
    let dv = new DataView(new Uint8Array(payload).buffer);
    window.rcChannels = window.rcChannels || Array.from({ length: 16 }, () => 1500);
    // RC_CHANNELS: time_boot_ms(4) + chancount(1) + chan1_raw..chan18_raw (uint16)
    for (let i = 0; i < 16; i++) {
      const offset = 5 + i * 2;
      if (offset + 1 >= payload.length) break;
      const v = dv.getUint16(offset, true);
      if (v > 0) window.rcChannels[i] = v;
    }
  }

  if (id === 147) { // BATTERY_STATUS
    parseBatteryStatus(payload);
  }

  if (ESC_TELEMETRY_MSG_IDS.has(id)) {
    parseEscTelemetryGroup(id, payload);
  }

  if (id === 253) {
    parseStatustext(payload, sys, comp);
  }

  // HIGHRES_IMU: time_usec(8) + xacc,yacc,zacc(float) — 加速度 m/s²，换算为 g
  if (id === 105 && payload.length >= 20) {
    const dv = new DataView(new Uint8Array(payload).buffer);
    const gx = dv.getFloat32(8, true) / 9.80665;
    const gy = dv.getFloat32(12, true) / 9.80665;
    const gz = dv.getFloat32(16, true) / 9.80665;
    window.highresImuG = { x: gx, y: gy, z: gz, t: Date.now() };
  }

  // SCALED_IMU / SCALED_IMU2 / SCALED_IMU3：布局相同，time_boot_ms(4) + xacc,yacc,zacc int16 mG
  if ((id === 110 || id === 116 || id === 129) && payload.length >= 10) {
    const dv = new DataView(new Uint8Array(payload).buffer);
    const gx = dv.getInt16(4, true) / 1000;
    const gy = dv.getInt16(6, true) / 1000;
    const gz = dv.getInt16(8, true) / 1000;
    window.scaledImuG = { x: gx, y: gy, z: gz, t: Date.now() };
  }

  // COMMAND_ACK: command(uint16) + result(uint8) + …
  if (id === 77 && payload.length >= 3) {
    const dv = new DataView(new Uint8Array(payload).buffer);
    const command = dv.getUint16(0, true);
    const result = dv.getUint8(2);
    try {
      document.dispatchEvent(new CustomEvent("gcs-command-ack", { detail: { command, result } }));
    } catch (e) { /* ignore */ }
  }

  // MAG_CAL_PROGRESS — MAVLink v2 wire-reorder（largest-first）布局：
  //   0..3   direction_x (float)
  //   4..7   direction_y (float)
  //   8..11  direction_z (float)
  //   12     compass_id (uint8)
  //   13     cal_mask
  //   14     cal_status
  //   15     attempt
  //   16     completion_pct  ← 真实进度字段
  //   17..26 completion_mask[10]
  if (id === 191 && payload.length >= 17) {
    const dv = new DataView(new Uint8Array(payload).buffer);
    const direction_x = dv.getFloat32(0, true);
    const direction_y = dv.getFloat32(4, true);
    const direction_z = dv.getFloat32(8, true);
    const compass_id = dv.getUint8(12);
    const completion_pct = dv.getUint8(16);
    try {
      document.dispatchEvent(
        new CustomEvent("gcs-mag-cal-progress", {
          detail: { compass_id, completion_pct, direction_x, direction_y, direction_z }
        })
      );
    } catch (e) { /* ignore */ }
  }

  // MAG_CAL_REPORT — MAVLink v2 wire-reorder 布局：
  //   0..3   fitness (float)
  //   4..43  ofs_x..orientation_confidence (10 floats)
  //   44     compass_id
  //   45     cal_mask
  //   46     cal_status
  //   47     autosaved
  //   48..   extensions (scale_factor float, old/new orientation uint8)
  if (id === 192 && payload.length >= 47) {
    const dv = new DataView(new Uint8Array(payload).buffer);
    const fitness = dv.getFloat32(0, true);
    const compass_id = dv.getUint8(44);
    const cal_status = dv.getUint8(46);
    try {
      document.dispatchEvent(
        new CustomEvent("gcs-mag-cal-report", { detail: { compass_id, cal_status, fitness } })
      );
    } catch (e) { /* ignore */ }
  }

  // 每次解析完消息后，同步重要变量到统一的 window.telemetry
  try{ if(typeof syncToTelemetry === 'function') syncToTelemetry(); }catch(e){console.warn('syncToTelemetry error',e)}
}

function parseStatustext(payload, sys, comp) {
  if (!payload || payload.length < 2) return;
  const severity = payload[0];
  let text = "";
  for (let i = 1; i < payload.length && i < 1 + 51; i += 1) {
    const c = payload[i];
    if (c === 0) break;
    text += String.fromCharCode(c);
  }
  if (typeof window.ingestStatustext === "function") {
    window.ingestStatustext(severity, text, sys, comp);
  }
}

function parseParam(p){ /* 保持不变 */ 
  let dv = new DataView(new Uint8Array(p).buffer);
  let val = dv.getFloat32(0,true);
  let count = dv.getUint16(4,true);
  let index = dv.getUint16(6,true);
  let name="";
  for(let i=8;i<24;i++){
    if(p[i]===0) break;
    name+=String.fromCharCode(p[i]);
  }
  if(!name) return;
  params.set(name,val);
  window._paramCount = count;
  window._paramLastIndex = index;
  renderSortedParams();
  const u = name.toUpperCase();
  if (u === "FRAME_CLASS" || u === "FRAME_TYPE" || u === "Q_FRAME_CLASS" || u === "Q_FRAME_TYPE") {
    try {
      document.dispatchEvent(new CustomEvent("gcs-airframe-params-changed", { detail: { name: u } }));
    } catch (e) { /* ignore */ }
  }
}

function renderSortedParams() {
  const el = document.getElementById("params");
  if (!el || !(params instanceof Map)) return;
  const total = Number.isFinite(window._paramCount) ? window._paramCount : params.size;
  const rows = Array.from(params.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "en", { sensitivity: "base" }))
    .map(([k, v], i) => `${i + 1}/${total} ${k}=${Number(v).toFixed(4)}`);
  el.innerHTML = rows.join("<br>");
}

function getFlightModeString(custom_mode){
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

function parseEscTelemetryGroup(id, payload) {
  const baseMotor = ((id - 11030) * 4) + 1;
  const dv = new DataView(new Uint8Array(payload).buffer);
  window.escTelemetry = window.escTelemetry || {};
  const now = Date.now();

  // 兼容不同固件字段布局：
  // layout A: temp(4x u8) + volt(4x u16) + curr(4x u16) + totalcurr(4x u16) + rpm(4x u16) + count...
  // layout B: temp(4x u8) + volt(4x u16) + curr(4x u16) + rpm(4x u16) + ...
  const hasExtended = payload.length >= 36;

  for (let i = 0; i < 4; i += 1) {
    const temp = i < payload.length ? dv.getUint8(i) : null;
    const voltOffset = 4 + i * 2;
    const currOffset = 12 + i * 2;
    const rpmOffset = hasExtended ? 28 + i * 2 : 20 + i * 2;
    const voltageRaw = voltOffset + 1 < payload.length ? dv.getUint16(voltOffset, true) : null;
    const currentRaw = currOffset + 1 < payload.length ? dv.getUint16(currOffset, true) : null;
    const rpmRaw = rpmOffset + 1 < payload.length ? dv.getUint16(rpmOffset, true) : null;
    const motorId = baseMotor + i;

    window.escTelemetry[motorId] = {
      rpm: Number.isFinite(rpmRaw) ? rpmRaw : null,
      current: Number.isFinite(currentRaw) ? (currentRaw / 100) : null,
      temperature: Number.isFinite(temp) ? temp : null,
      voltage: Number.isFinite(voltageRaw) ? (voltageRaw / 100) : null,
      updatedAt: now,
    };
  }
}

function parseBatteryStatus(payload) {
  const dv = new DataView(new Uint8Array(payload).buffer);
  window.powerInstances = window.powerInstances || new Map();
  const batteryId = payload.length > 32 ? dv.getUint8(32) : 0;
  const currentRaw = payload.length > 31 ? dv.getInt16(30, true) : -1;
  const remaining = payload.length > 35 ? dv.getInt8(35) : -1;
  const temperature = payload.length > 9 ? dv.getInt16(8, true) / 100 : null;

  const cellVoltages = [];
  for (let i = 0; i < 10; i += 1) {
    const off = 10 + i * 2;
    if (off + 1 >= payload.length) break;
    const mv = dv.getUint16(off, true);
    if (mv > 0 && mv < 65535) cellVoltages.push(mv / 1000);
  }
  for (let i = 0; i < 4; i += 1) {
    const off = 41 + i * 2;
    if (off + 1 >= payload.length) break;
    const mv = dv.getUint16(off, true);
    if (mv > 0 && mv < 65535) cellVoltages.push(mv / 1000);
  }

  const voltage = cellVoltages.length
    ? cellVoltages.reduce((a, b) => a + b, 0)
    : (typeof window.battery_voltage === "number" ? window.battery_voltage : 0);
  const current = currentRaw >= 0 ? currentRaw / 100 : 0;
  const cells = cellVoltages.length || Math.max(1, Math.round(voltage / 3.7));
  const type = voltage > 100 ? "tethered" : (cellVoltages.length ? "dronecan_bms" : "analog");

  window.powerInstances.set(batteryId, {
    id: batteryId,
    name: `Battery ${batteryId + 1}`,
    type,
    cells,
    voltage,
    current,
    cellVoltages,
    temperature: Number.isFinite(temperature) ? temperature : undefined,
    remaining: remaining >= 0 ? remaining : undefined,
    updatedAt: Date.now(),
  });
}

// 把常用的已解析变量同步到 window.telemetry，优先使用 window 上的即时变量，
// 并从 params Map 中读取参数表中的值作为补充。
function syncToTelemetry(){
  try{
    window.telemetry = window.telemetry || {};
    // 基本映射（key 名称与 PARAM_LIST 保持一致）
    window.telemetry.roll = (typeof window.roll !== 'undefined') ? window.roll : window.telemetry.roll;
    window.telemetry.pitch = (typeof window.pitch !== 'undefined') ? window.pitch : window.telemetry.pitch;
    window.telemetry.yaw = (typeof window.yaw !== 'undefined') ? window.yaw : window.telemetry.yaw;
    // 注意：GLOBAL_POSITION_INT 中设置为 window.altitude
    if(typeof window.altitude !== 'undefined') window.telemetry.alt = window.altitude;
    if(typeof window.airspeed !== 'undefined') window.telemetry.airspeed = window.airspeed;
    if(typeof window.groundspeed !== 'undefined') window.telemetry.groundspeed = window.groundspeed;
    if(typeof window.climb_rate !== 'undefined') window.telemetry.climbrate = window.climb_rate;
    if(typeof window.battery_voltage !== 'undefined') window.telemetry.battery_voltage = window.battery_voltage;
    if(typeof window.armed !== 'undefined') window.telemetry.armed = window.armed;
    if(typeof window.flight_mode !== 'undefined') window.telemetry.flight_mode = window.flight_mode;
    const imuG = (typeof window.highresImuG === 'object' && window.highresImuG && (Date.now() - window.highresImuG.t) < 500)
      ? window.highresImuG
      : (typeof window.scaledImuG === 'object' && window.scaledImuG && (Date.now() - window.scaledImuG.t) < 500)
        ? window.scaledImuG
        : null;
    if (imuG) {
      window.telemetry.accel_x_g = imuG.x;
      window.telemetry.accel_y_g = imuG.y;
      window.telemetry.accel_z_g = imuG.z;
    }

    // 额外尝试从参数表 params（Map）读取并写入 telemetry
    if(typeof params !== 'undefined' && params instanceof Map){
      const supplement = ['esc1_temp','battery_remaining','battery_usedmah','battery_temp','esc1_volt','esc1_curr','battery_cell1','battery_voltage2'];
      for(const k of supplement){
        if(params.has(k) && (typeof params.get(k) !== 'undefined')){
          window.telemetry[k] = params.get(k);
        }
      }
      // 也把所有已知 params 列表小范围优先同步（避免覆盖已经存在的 telemetry 值）
      // 但避免把大量无关参数一次性写入，只有上面的 supplement 和已存在于 telemetry 的 key 会被覆盖。
    }

    // 兼容性：将单独存在于 window 上但未写入 telemetry 的常见变量，也写入
    const extraFromWindow = ['lat','lon','gps_fix_type','wp_current','vibe_status','ekf_status'];
    extraFromWindow.forEach(k=>{ if(typeof window[k] !== 'undefined' && typeof window.telemetry[k] === 'undefined') window.telemetry[k] = window[k]; });

  }catch(e){ console.warn('syncToTelemetry failed', e); }
}