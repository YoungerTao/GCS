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
  74:20, 75:152, 76:152, 77:143, 83:53, 105:158, 110:115, 111:34, 163:105, 125:0, 152:0, 62:0,
  42:0, 36:0, 65:118, 27:144, 116:76, 129:46, 29:0, 132:85, 137:0, 147:154, 148:178, 167:106, 191:92, 192:36, 193:71, 253:83
};
const ESC_TELEMETRY_MSG_IDS = new Set([11030, 11031, 11032, 11033]);

/** MAVLink 负载可能是父缓冲区的子视图，必须用 byteOffset，否则 HEARTBEAT 等会读错内存 */
function mavlinkPayloadView(payload) {
  const u8 = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
  return new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
}

/** 单次 parse 最多解多少帧，剩余交给 microtask，避免 PARAM 洪峰等长时间占满主线程 */
const PARSE_MAX_FRAMES_PER_SLICE = 160;
const PARSE_MAX_RESYNC_BYTES = 8192;

function parse(parseDepth) {
  const depth = typeof parseDepth === "number" ? parseDepth : 0;
  if (depth > 24) return;

  let frames = 0;
  let resync = 0;
  while (buf.length > 10 && frames < PARSE_MAX_FRAMES_PER_SLICE) {
    if (buf[0] !== 0xFD) {
      buf.shift();
      if (++resync > PARSE_MAX_RESYNC_BYTES) {
        buf.length = 0;
        return;
      }
      continue;
    }

    const len = buf[1];
    const full = 10 + len + 2;
    if (buf.length < full) return;

    const pkt = buf.slice(0, full);
    buf = buf.slice(full);
    frames++;

    const msgid = pkt[7] | (pkt[8] << 8) | (pkt[9] << 16);

    let crc = crc_calculate(pkt.slice(1, 10 + len));
    crc = crc_accumulate(CRC_EXTRA[msgid] || 0, crc);

    const rx = pkt[10 + len] | (pkt[11 + len] << 8);

    if (crc !== rx) {
      if (!window.crcWarned) {
        console.warn(`CRC 错误 msg=${msgid}，继续解析`);
        window.crcWarned = true;
      }
    }

    try {
      handle(msgid, pkt.slice(10, 10 + len), pkt[5], pkt[6]);
    } catch (e) {
      console.error(`MAVLink handle 异常 msgid=${msgid}`, e);
    }
  }

  if (buf.length > 10) {
    queueMicrotask(() => {
      try {
        parse(depth + 1);
      } catch (e) {
        console.error("parse microtask", e);
      }
    });
  }
}

function handle(id, payload, sys, comp){
  if(sys) window.sysid = sys;
  if(comp) window.compid = comp;

if(id === 0){ // HEARTBEAT — 本项目约定线序（与 MAVLink common.xml 标准字段顺序不同）：0~3 custom_mode LE, 4 type, 5 autopilot, 6 base_mode, 7 system_status, 8 mavlink_version
    if (payload.length < 9) return;
    const dv = mavlinkPayloadView(payload);
    const custom_mode = dv.getUint32(0, true);
    const base_mode = dv.getUint8(6);

    window.flight_mode = getFlightModeString(custom_mode);
    window.armed = (base_mode & 0x80) !== 0;

    const hbSig = `${custom_mode}|${base_mode}|${window.armed ? 1 : 0}`;
    if (window._lastHbUiSig !== hbSig) {
      window._lastHbUiSig = hbSig;
      log(`HEARTBEAT → 模式: ${window.flight_mode} (custom_mode=${custom_mode}) ${window.armed ? '✅ 已解锁' : '🔒 未解锁'}`);
    }
}
  if(id === 1){ // SYS_STATUS
    let dv = mavlinkPayloadView(payload);
    if (payload.length >= 12) {
      window._sysStatusSensors = {
        present: dv.getUint32(0, true),
        enabled: dv.getUint32(4, true),
        health: dv.getUint32(8, true),
        t: Date.now(),
      };
    }
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
    let dv = mavlinkPayloadView(payload);
    window.gps_fix_type = dv.getUint8(4);
  }

  if(id === 30){ // ATTITUDE
    let dv = mavlinkPayloadView(payload);
    window.roll = dv.getFloat32(4,true);
    window.pitch = dv.getFloat32(8,true);
    window.yaw = dv.getFloat32(12,true);
  }

  if(id === 33){ // GLOBAL_POSITION_INT
    let dv = mavlinkPayloadView(payload);
    window.lat = dv.getInt32(4,true)/1e7;
    window.lon = dv.getInt32(8,true)/1e7;
    window.altitude = dv.getInt32(16,true)/1000;   // relative_alt
    if(window.updateMap) window.updateMap(window.lat, window.lon);
  }

  if(id === 74){ // VFR_HUD
    let dv = mavlinkPayloadView(payload);
    window.airspeed = dv.getFloat32(0, true);
    window.groundspeed = dv.getFloat32(4, true);
    window.climb_rate = dv.getFloat32(12, true);
  }

  if(id === 42){ // MISSION_CURRENT
    let dv = mavlinkPayloadView(payload);
    // seq: uint16 at offset 0
    window.wp_current = dv.getUint16(0, true);
  }

  if(id === 65){ // RC_CHANNELS (MAVLink2 wire: time_boot_ms + chan1..18 + chancount + rssi)
    let dv = mavlinkPayloadView(payload);
    window.rcChannels = window.rcChannels || Array.from({ length: 16 }, () => 1500);
    for (let i = 0; i < 16; i++) {
      const offset = 4 + i * 2;
      if (offset + 1 >= payload.length) break;
      const v = dv.getUint16(offset, true);
      if (v > 0 && v < 65535) window.rcChannels[i] = v;
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

  if (id === 148) {
    parseAutopilotVersion(payload);
  }

  if (id === 193) {
    parseEkfStatusReport(payload);
  }

  // DISTANCE_SENSOR：current_distance 在 offset 8（cm），用于概览测距
  if (id === 132 && payload.length >= 12) {
    const dv = mavlinkPayloadView(payload);
    window._rangefinderTelemetry = {
      currentCm: dv.getUint16(8, true),
      sensorId: dv.getUint8(11),
      t: Date.now(),
    };
  }

  // HIGHRES_IMU: time_usec(8) + xacc,yacc,zacc(float) — 加速度 m/s²，换算为 g
  if (id === 105 && payload.length >= 20) {
    const dv = mavlinkPayloadView(payload);
    const gx = dv.getFloat32(8, true) / 9.80665;
    const gy = dv.getFloat32(12, true) / 9.80665;
    const gz = dv.getFloat32(16, true) / 9.80665;
    window.highresImuG = { x: gx, y: gy, z: gz, t: Date.now() };
    window._imuStreamMs = window._imuStreamMs || {};
    window._imuStreamMs.highres = Date.now();
  }

  // SCALED_IMU / SCALED_IMU2 / SCALED_IMU3：布局相同，time_boot_ms(4) + xacc,yacc,zacc int16 mG
  if ((id === 110 || id === 116 || id === 129) && payload.length >= 10) {
    const dv = mavlinkPayloadView(payload);
    const gx = dv.getInt16(4, true) / 1000;
    const gy = dv.getInt16(6, true) / 1000;
    const gz = dv.getInt16(8, true) / 1000;
    window.scaledImuG = { x: gx, y: gy, z: gz, t: Date.now() };
    window._imuStreamMs = window._imuStreamMs || {};
    window._imuStreamMs[id] = Date.now();
  }

  // COMMAND_ACK: command(uint16) + result(uint8) + …
  if (id === 77 && payload.length >= 3) {
    const dv = mavlinkPayloadView(payload);
    const command = dv.getUint16(0, true);
    const result = dv.getUint8(2);
    const MAV_RESULT_NAMES = [
      "ACCEPTED",
      "TEMPORARILY_REJECTED",
      "DENIED",
      "UNSUPPORTED",
      "FAILED",
      "IN_PROGRESS",
      "CANCELLED",
    ];
    const rn = MAV_RESULT_NAMES[result] || `UNKNOWN(${result})`;
    const MAV_CMD_PREFLIGHT_CALIBRATION = 241;
    const MAV_CMD_ACCELCAL_VEHICLE_POS = 42429;

    try {
      if (typeof log === "function") {
        log(`COMMAND_ACK → cmd=${command} result=${result} (${rn})`, `mavlink_ack_${command}_${result}`);
      }
    } catch (e) {
      /* ignore */
    }

    // 校准相关：中文摘要，便于判断飞控是否已确认指令、是否已进入标定流程
    try {
      if (typeof log === "function") {
        if (command === MAV_CMD_PREFLIGHT_CALIBRATION) {
          if (result === 0) {
            log(
              "【校准确认】已收到飞控 COMMAND_ACK：MAV_CMD_PREFLIGHT_CALIBRATION → ACCEPTED。飞控已接受指令，可视为已开始/允许进入预校准（含陀螺仪等前置步骤）。",
              `cal_preflight_ack_ok_${result}`,
            );
          } else if (result === 5) {
            log(
              "【校准确认】已收到飞控 COMMAND_ACK：MAV_CMD_PREFLIGHT_CALIBRATION → IN_PROGRESS。飞控已收妥指令并正在执行标定（例如陀螺仪静止阶段），请保持机体静止并观察板载灯。",
              `cal_preflight_ack_ok_${result}`,
            );
          } else {
            log(
              `【校准确认】已收到飞控 COMMAND_ACK：MAV_CMD_PREFLIGHT_CALIBRATION → ${rn}。飞控未接受该预校准指令，未进入正常标定流程；请检查是否已解锁、是否忙线或固件是否支持。`,
              `cal_preflight_ack_bad_${result}`,
            );
          }
        } else if (command === MAV_CMD_ACCELCAL_VEHICLE_POS) {
          if (result !== 0 && result !== 5) {
            log(
              `【校准确认】已收到飞控 COMMAND_ACK：MAV_CMD_ACCELCAL_VEHICLE_POS → ${rn}。六面位姿步骤未被飞控正常接受。`,
              `cal_accelpos_ack_bad_${result}`,
            );
          }
        }
      }
    } catch (e) {
      /* ignore */
    }

    try {
      // 必须在 window 上派发：CustomEvent 默认不冒泡，document.dispatchEvent 不会触发 window.addEventListener
      window.dispatchEvent(new CustomEvent("gcs-command-ack", { detail: { command, result, resultName: rn } }));
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
    const dv = mavlinkPayloadView(payload);
    const direction_x = dv.getFloat32(0, true);
    const direction_y = dv.getFloat32(4, true);
    const direction_z = dv.getFloat32(8, true);
    const compass_id = dv.getUint8(12);
    const cal_mask = dv.getUint8(13);
    const cal_status = dv.getUint8(14);
    const attempt = dv.getUint8(15);
    const completion_pct = dv.getUint8(16);
    try {
      document.dispatchEvent(
        new CustomEvent("gcs-mag-cal-progress", {
          detail: {
            compass_id,
            cal_mask,
            cal_status,
            attempt,
            completion_pct,
            direction_x,
            direction_y,
            direction_z
          }
        })
      );
    } catch (e) { /* ignore */ }
  }

  // MAG_CAL_REPORT — 与 mavlink_msg_mag_cal_report_pack 一致（c_library_v2 common）：
  //   0..35  fitness + ofs_[xyz] + diag_[xyz] + offdiag_[xyz]（10×float）
  //   40     compass_id
  //   41     cal_mask
  //   42     cal_status
  //   43     autosaved
  //   44..   orientation_confidence(float) 及扩展字段（可截断，MIN_LEN=44）
  if (id === 192 && payload.length >= 44) {
    const dv = mavlinkPayloadView(payload);
    const fitness = dv.getFloat32(0, true);
    const compass_id = dv.getUint8(40);
    const cal_mask = dv.getUint8(41);
    const cal_status = dv.getUint8(42);
    const autosaved = dv.getUint8(43);
    try {
      document.dispatchEvent(
        new CustomEvent("gcs-mag-cal-report", {
          detail: { compass_id, cal_mask, cal_status, autosaved, fitness }
        })
      );
    } catch (e) { /* ignore */ }
  }

  // 每次解析完消息后，同步重要变量到统一的 window.telemetry
  try{ if(typeof window.syncToTelemetry === 'function') window.syncToTelemetry(); }catch(e){console.warn('syncToTelemetry error',e)}
  try { if (typeof window.scheduleUIUpdate === "function") window.scheduleUIUpdate(); } catch (e) { /* ignore */ }
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

// decodeFlightSwVersion / formatUidWordPair / bytesToHexTrim / humanizeBoardIdName
//移至 JS/ui/mavlink-helpers.js

/** MAVLink common AUTOPILOT_VERSION（#148）线序：capabilities(8) + 四段 sw + board + 三组 custom[8] + vendor/product + uid(8) + uid2[18] */
function parseAutopilotVersion(payload) {
  if (!payload || payload.length < 24) {
    if (typeof log === "function") log(`⚠️ #148 载荷过短：${payload?.length ?? 0} byte，放弃解析`, "debug");
    return;
  }
  if (typeof log === "function") log(`📥 #148 AUTOPILOT_VERSION 收到，载荷 ${payload.length} byte`, "debug");
  try {
    const u8 = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
    const dv = mavlinkPayloadView(payload);

    const flight_sw_version = dv.getUint32(8, true);
    const middleware_sw_version = dv.getUint32(12, true);
    const os_sw_version = dv.getUint32(16, true);
    const board_version = dv.getUint32(20, true);

    let vendor_id = 0;
    let product_id = 0;
    if (payload.length >= 52) {
      vendor_id = dv.getUint16(48, true);
      product_id = dv.getUint16(50, true);
    }

    const boardType = (board_version >>> 16) & 0xffff;
    const boardRev = board_version & 0xffff;
    const map = window.ARDUPILOT_BOARD_TYPE_NAMES;
    const rawName = map && typeof map === "object" ? map[String(boardType)] || map[boardType] : null;
    const friendly = humanizeBoardIdName(rawName);
    let hardwareText = friendly || `板型 ID ${boardType}`;
    if (boardRev) hardwareText += ` · rev 0x${boardRev.toString(16)}`;
    if (!friendly && (vendor_id || product_id)) {
      hardwareText += ` · vendor ${vendor_id} / product ${product_id}`;
    }

    const git = u8.length >= 32 ? bytesToHexTrim(u8, 24, 8) : "";
    let firmwareText = decodeFlightSwVersion(flight_sw_version);
    if (git) firmwareText += ` · ${git.slice(0, 12)}${git.length > 12 ? "…" : ""}`;

    if (typeof log === "function") {
      log(`🔍 #148 解析结果：固件=${firmwareText} 硬件=${hardwareText} 板型=${boardType}`, "debug");
    }

    let uidText = "";
    if (u8.length >= 78) {
      uidText = bytesToHexTrim(u8, 60, 18);
    }
    if (!uidText && u8.length >= 60) {
      uidText = formatUidWordPair(dv, 52);
    }
    if (uidText && !uidText.startsWith("0x")) uidText = `0x${uidText}`;

    window.autopilotVersionInfo = {
      flight_sw_version,
      middleware_sw_version,
      os_sw_version,
      board_version,
      boardType,
      boardRev,
      vendor_id,
      product_id,
      uidHex: uidText,
      updatedAt: Date.now(),
    };
    if (typeof window.parseArdupilotFirmwareVersion === "function") {
      window._telemetryFirmwareVersion = window.parseArdupilotFirmwareVersion(flight_sw_version);
      if (typeof window.detectArdupilotTelemetryProfile === "function") {
        window._telemetryProfile = window.detectArdupilotTelemetryProfile(window._telemetryFirmwareVersion);
      }
    }
    try {
      document.dispatchEvent(new CustomEvent("gcs:autopilot-version", {
        detail: window.autopilotVersionInfo,
      }));
    } catch (_) { /* ignore */ }

    const fwEl = document.getElementById("ov-fw-version");
    const hwEl = document.getElementById("ov-board-hardware");
    const idEl = document.getElementById("ov-device-id");
    if (fwEl) {
      fwEl.textContent = firmwareText;
      fwEl.className = "ok";
      fwEl.title = `flight_sw=${flight_sw_version} middleware=${middleware_sw_version} os=${os_sw_version}`;
    }
    if (hwEl) {
      hwEl.textContent = hardwareText;
      hwEl.className = "ok";
      hwEl.title = rawName ? String(rawName) : `board_version=0x${board_version.toString(16)}`;
    }
    if (idEl) {
      idEl.textContent = uidText || "—";
      idEl.className = uidText ? "ok" : "muted";
      idEl.title = uidText ? "uid2 优先，否则 64-bit uid" : "飞控未提供 UID";
    }
    if (typeof log === "function") {
      log(`✅ 概览字段已更新：固件 → ${firmwareText} / 硬件 → ${hardwareText} / UID → ${uidText || "—"}`, "debug");
    }
  } catch (e) {
    console.warn("parseAutopilotVersion", e);
    if (typeof log === "function") {
      log(`⚠️ #148 解析异常：${e?.message || e}`, "debug");
    }
  }
}

/** EKF_STATUS_REPORT：flags + 方差；线序与 ardupilotmega/common 一致（flags 在首 uint16） */
function parseEkfStatusReport(payload) {
  if (!payload || payload.length < 14) return;
  try {
    const dv = mavlinkPayloadView(payload);
    const flags = dv.getUint16(0, true);
    const posHoriz = dv.getFloat32(6, true);
    const posVert = dv.getFloat32(10, true);
    window._ekfStatusReport = { flags, posHoriz, posVert, t: Date.now() };

    const bits = [];
    if (flags & 0x0001) bits.push("姿态");
    if (flags & 0x0002) bits.push("水平速度");
    if (flags & 0x0004) bits.push("垂直速度");
    if (flags & 0x0010) bits.push("水平位置");
    if (flags & 0x0020) bits.push("垂直位置");
    const summary = bits.length ? `${bits.join("·")} 已融合` : `flags=0x${flags.toString(16)}（初始化或未对齐）`;

    const statusEl = document.getElementById("ov-ekf-status");
    if (statusEl) {
      statusEl.textContent = summary;
      statusEl.className = bits.length >= 3 ? "ok" : bits.length ? "warn" : "muted";
    }
    const posEl = document.getElementById("ov-ekf-pos");
    if (posEl && Number.isFinite(posHoriz)) {
      posEl.textContent = posHoriz < 1 ? `水平方差 ${posHoriz.toExponential(2)}（较好）` : `水平方差 ${posHoriz.toExponential(2)} m²`;
      posEl.className = posHoriz < 1 ? "ok" : "warn";
    }
    const velEl = document.getElementById("ov-ekf-vel");
    if (velEl && Number.isFinite(posVert)) {
      velEl.textContent = `垂直方差 ${posVert.toExponential(2)} m²`;
      velEl.className = posVert < 2 ? "ok" : "warn";
    }
  } catch (e) {
    console.warn("parseEkfStatusReport", e);
  }
}

// scheduleParamTableRender 移至 JS/core/mavlink-helpers.js

function parseParam(p){ /* 保持不变 */ 
  let dv = mavlinkPayloadView(p);
  let val = dv.getFloat32(0,true);
  let count = dv.getUint16(4,true);
  let index = dv.getUint16(6,true);
  let name="";
  for(let i=8;i<24;i++){
    if(p[i]===0) break;
    name+=String.fromCharCode(p[i]);
  }
  if(!name) return;
  const pmap = window.params;
  pmap.set(name,val);
  window._paramCount = count;
  window._paramLastIndex = index;

  if (window._paramLoadActive) {
    const totalKnown = Number.isFinite(count) && count > 0 ? count : NaN;
    if (typeof window.updateParamLoadProgress === "function") {
      window.updateParamLoadProgress(pmap.size, totalKnown);
    }
    if (
      !window._paramLoadCancel &&
      Number.isFinite(count) && count > 0 &&
      pmap.size >= count &&
      typeof window.endParamLoadingUI === "function"
    ) {
      window.endParamLoadingUI(true, "complete");
      setTimeout(() => {
        try {
          if (typeof window.requestAutopilotVersionFromVehicle === "function") {
            window.requestAutopilotVersionFromVehicle();
          }
        } catch (_) { /* ignore */ }
      }, 250);
    }
  } else {
    scheduleParamTableRender();
  }

  const u = name.toUpperCase();
  if (u === "FRAME_CLASS" || u === "FRAME_TYPE" || u === "Q_FRAME_CLASS" || u === "Q_FRAME_TYPE") {
    try {
      document.dispatchEvent(new CustomEvent("gcs-airframe-params-changed", { detail: { name: u } }));
    } catch (e) { /* ignore */ }
  }
  if (
    u.startsWith("INS_ACC") || u.startsWith("INS_GYR") || u.startsWith("INS_USE") ||
    u.startsWith("COMPASS_DEV_ID") || u.startsWith("COMPASS_USE") ||
    u === "COMPASS_EXTERNAL" || u === "COMPASS_EXTERN2" || u === "COMPASS_EXTERN3" ||
    /^BARO\d+_DEVID$/.test(u) || /^RNGFND\d+_TYPE$/.test(u) ||
    /^PRX\d+_TYPE$/.test(u) || /^ARSPD\d*_TYPE$/.test(u) || u === "FLOW_TYPE" ||
    /^BATT\d*_MONITOR$/.test(u) || /^GPS\d*_TYPE$/.test(u) || u === "GPS_TYPE" ||
    u === "BCN_TYPE" || /^SERIAL\d+_PROTOCOL$/.test(u)
  ) {
    try {
      document.dispatchEvent(new CustomEvent("gcs-sensor-overview-changed", { detail: { name: u } }));
    } catch (e) { /* ignore */ }
  }
}

// renderSortedParams 移至 JS/core/mavlink-helpers.js

// getFlightModeString 移至 JS/core/mavlink-helpers.js

function parseEscTelemetryGroup(id, payload) {
  const baseMotor = ((id - 11030) * 4) + 1;
  const dv = mavlinkPayloadView(payload);
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
  const dv = mavlinkPayloadView(payload);
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

// syncToTelemetry 与 renderSortedParams 移至 mavlink-helpers.js