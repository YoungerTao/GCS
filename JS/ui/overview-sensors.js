/**
 * 概览「IMU 与传感器」：按路数列表，型号由 ArduPilot Device ID 解码（ardupilot-devid.js）。
 */
(function initOverviewSensors() {
  const STREAM_MS = 2500;
  const MASK = {
    MAG: 0x04,
    MAG2: 0x80000,
    ACCEL: 0x02,
    ACCEL2: 0x40000,
    BARO: 0x08,
    LASER: 0x100,
  };

  /**
   * ArduPilot RNGFNDx_TYPE → 与 libraries/AP_RangeFinder/AP_RangeFinder.h 中 Type 枚举一致（主分支）。
   * short：简短英文名；zh：TYPE 数字后面展示的中文说明。
   */
  const RNGFND_TYPE_INFO = {
    0: { short: "NONE", zh: "未使用" },
    1: { short: "ANALOG", zh: "模拟电压测距" },
    2: { short: "MBI2C", zh: "Maxbotix I2C" },
    3: { short: "PLI2C", zh: "PulsedLight / LidarLite I2C" },
    5: { short: "PX4_PWM", zh: "PWM 测距接口" },
    6: { short: "BBB_PRU", zh: "BeagleBone PRU" },
    7: { short: "LWI2C", zh: "LightWare I2C" },
    8: { short: "LWSER", zh: "LightWare 串口" },
    9: { short: "BEBOP", zh: "Parrot Bebop 内置" },
    10: { short: "MAVLink", zh: "来自 MAVLink DISTANCE_SENSOR 等" },
    11: { short: "USD1_Serial", zh: "Ainstein USD-D1 串口" },
    12: { short: "LEDDARONE", zh: "LeddarOne" },
    13: { short: "MBSER", zh: "Maxbotix 串口" },
    14: { short: "TRI2C", zh: "TeraRanger I2C" },
    15: { short: "PLI2CV3", zh: "PulsedLight I2C V3" },
    16: { short: "VL53L0X", zh: "ST VL53L0X ToF" },
    17: { short: "NMEA", zh: "NMEA 语句测距" },
    18: { short: "WASP", zh: "WASP 激光测距" },
    19: { short: "BenewakeTF02", zh: "北醒 TF02 串口" },
    20: { short: "BenewakeTFmini", zh: "北醒 TFmini 串口" },
    21: { short: "PLI2CV3HP", zh: "PulsedLight I2C HP" },
    22: { short: "PWM", zh: "PWM" },
    23: { short: "BLPing", zh: "BlueRobotics Ping" },
    24: { short: "UAVCAN", zh: "DroneCAN / UAVCAN 测距" },
    25: { short: "BenewakeTFminiPlus", zh: "北醒 TFmini Plus" },
    26: { short: "Lanbao", zh: "蓝宝/岚博等超声" },
    27: { short: "BenewakeTF03", zh: "北醒 TF03 串口" },
    28: { short: "VL53L1X_Short", zh: "ST VL53L1X 短距" },
    29: { short: "LeddarVu8_Serial", zh: "LeddarVu8 串口" },
    30: { short: "HC_SR04", zh: "HC-SR04 超声" },
    31: { short: "GYUS42v2", zh: "GY-US42 v2" },
    32: { short: "MSP", zh: "MSP 测距" },
    33: { short: "USD1_CAN", zh: "Ainstein USD-D1 CAN" },
    34: { short: "Benewake CAN", zh: "北醒 Benewake CAN 总线测距（如 TF-Luna 等接 CAN 时的类型）" },
    35: { short: "TeraRanger_Serial", zh: "TeraRanger 串口" },
    36: { short: "Lua", zh: "Lua 脚本驱动" },
    37: { short: "NoopLoop_P", zh: "NoopLoop" },
    38: { short: "TOFSenseP_CAN", zh: "TOFSense CAN" },
    39: { short: "NRA24_CAN", zh: "NRA24 CAN" },
    40: { short: "TOFSenseF_I2C", zh: "TOFSense I2C" },
    41: { short: "JRE_Serial", zh: "JRE 串口" },
    42: { short: "Ainstein_LR_D1", zh: "Ainstein LR-D1" },
    43: { short: "RDS02UF", zh: "RDS02UF" },
    44: { short: "HEXSOON_RADAR", zh: "Hexsoon 毫米波雷达" },
    45: { short: "LightWare_GRF", zh: "LightWare GRF" },
    46: { short: "BenewakeTFS20L", zh: "北醒 TFS20L" },
    47: { short: "DTS6012M", zh: "DTS6012M" },
    100: { short: "SIM", zh: "SITL 仿真" },
  };

  function rngfndTypeRow(t) {
    const n = Math.round(Number(t));
    const row = RNGFND_TYPE_INFO[n];
    if (row) return { short: row.short, zh: row.zh };
    return {
      short: `TYPE_${n}`,
      zh: "固件内未收录此编号，请打开飞控源码 AP_RangeFinder.h 对照 RangeFinder::Type",
    };
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escAttr(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function fmtDev(id) {
    const n = Math.round(Number(id)) >>> 0;
    if (!n) return "—";
    return `0x${n.toString(16).toUpperCase().padStart(8, "0")}`;
  }

  function decode(kind, id) {
    if (typeof window.decodeArduPilotDevId === "function") {
      return window.decodeArduPilotDevId(kind, id >>> 0);
    }
    return {
      model: "—",
      busDetail: "",
      hex: fmtDev(id),
      rawName: "",
    };
  }

  function getp(name) {
    const p = window.params;
    if (!(p instanceof Map) || !p.has(name)) return null;
    const v = Number(p.get(name));
    return Number.isFinite(v) ? v : null;
  }

  function imuInstances() {
    const pairs = [
      ["INS_ACC_ID", "INS_USE", "IMU1"],
      ["INS_ACC2_ID", "INS_USE2", "IMU2"],
      ["INS_ACC3_ID", "INS_USE3", "IMU3"],
    ];
    const out = [];
    for (const [idKey, useKey, label] of pairs) {
      const rawId = getp(idKey);
      if (rawId == null || Math.round(rawId) === 0) continue;
      let use = getp(useKey);
      if (use == null) use = 1;
      if (Math.round(use) === 0) continue;
      out.push({ idKey, label, id: Math.round(rawId) >>> 0 });
    }
    return out;
  }

  function compassInstances() {
    const pairs = [
      ["COMPASS_DEV_ID", "COMPASS_USE", "主罗盘"],
      ["COMPASS_DEV_ID2", "COMPASS_USE2", "路 2"],
      ["COMPASS_DEV_ID3", "COMPASS_USE3", "路 3"],
    ];
    const out = [];
    for (const [idKey, useKey, label] of pairs) {
      const rawId = getp(idKey);
      if (rawId == null || Math.round(rawId) === 0) continue;
      let use = getp(useKey);
      if (use == null) use = 1;
      if (Math.round(use) === 0) continue;
      out.push({ idKey, label, id: Math.round(rawId) >>> 0 });
    }
    return out;
  }

  function baroInstances() {
    const out = [];
    for (let i = 1; i <= 3; i += 1) {
      const key = `BARO${i}_DEVID`;
      const v = getp(key);
      if (v != null && Math.round(v) !== 0) out.push({ i, label: `气压 ${i}`, id: Math.round(v) >>> 0 });
    }
    return out;
  }

  function rangefinderSlots() {
    const out = [];
    for (let i = 1; i <= 10; i += 1) {
      const v = getp(`RNGFND${i}_TYPE`);
      if (v != null && Math.round(v) > 0) {
        const t = Math.round(v);
        const row = rngfndTypeRow(t);
        out.push({ slot: i, type: t, short: row.short, zh: row.zh });
      }
    }
    return out;
  }

  function sysFresh() {
    const ss = window._sysStatusSensors;
    return ss && Date.now() - ss.t < 8000;
  }

  function magHealthFromSys(s) {
    if (!s) return { ok: null, anyPresent: false };
    let any = false;
    let allOk = true;
    if (s.present & MASK.MAG) {
      any = true;
      if (!(s.health & MASK.MAG)) allOk = false;
    }
    if (s.present & MASK.MAG2) {
      any = true;
      if (!(s.health & MASK.MAG2)) allOk = false;
    }
    return { ok: any ? allOk : null, anyPresent: any };
  }

  function accelHealthFromSys(s) {
    if (!s) return { ok: null, anyPresent: false };
    let any = false;
    let allOk = true;
    if (s.present & MASK.ACCEL) {
      any = true;
      if (!(s.health & MASK.ACCEL)) allOk = false;
    }
    if (s.present & MASK.ACCEL2) {
      any = true;
      if (!(s.health & MASK.ACCEL2)) allOk = false;
    }
    return { ok: any ? allOk : null, anyPresent: any };
  }

  function baroHealthFromSys(s) {
    if (!s || !(s.present & MASK.BARO)) return { ok: null };
    return { ok: !!(s.health & MASK.BARO) };
  }

  function laserHealthFromSys(s) {
    if (!s || !(s.present & MASK.LASER)) return { ok: null };
    return { ok: !!(s.health & MASK.LASER) };
  }

  function streamHint() {
    const m = window._imuStreamMs || {};
    const now = Date.now();
    const tags = [];
    if (m[110] && now - m[110] < STREAM_MS) tags.push("SCALED_IMU");
    if (m[116] && now - m[116] < STREAM_MS) tags.push("SCALED_IMU2");
    if (m[129] && now - m[129] < STREAM_MS) tags.push("SCALED_IMU3");
    if (m.highres && now - m.highres < STREAM_MS) tags.push("HIGHRES_IMU");
    return tags.length ? `近期遥测：${tags.join("、")}` : "近期无 IMU 加速度外报";
  }

  function headClass(ok, fresh) {
    if (!fresh || ok === null) return "muted";
    return ok ? "ok" : "danger pulse";
  }

  function sensorBlock(title, headNote, cls, listHtml) {
    return `<div class="ov-sensor-block">
      <div class="ov-sensor-head">
        <span class="ov-sensor-title">${esc(title)}</span>
        <span class="${esc(cls)}">${esc(headNote)}</span>
      </div>
      ${listHtml}
    </div>`;
  }

  function emptyBlock(title, body, cls) {
    return sensorBlock(title, "—", cls, `<ul class="ov-sensor-list"><li>${esc(body)}</li></ul>`);
  }

  function render() {
    const root = document.getElementById("ov-sensor-overview-rows");
    if (!root) return;

    const connected = window._gcsConnState === "connected";
    if (!connected) {
      root.innerHTML = emptyBlock("状态", "未连接飞控", "muted");
      return;
    }

    const p = window.params;
    if (!(p instanceof Map) || p.size === 0) {
      root.innerHTML = emptyBlock("传感器", "已连接，等待参数列表…", "warn");
      return;
    }

    const s = window._sysStatusSensors;
    const fresh = sysFresh();
    const imus = imuInstances();
    const comps = compassInstances();
    const baros = baroInstances();
    const rfSlots = rangefinderSlots();

    let html = "";

    /* 指南针 */
    if (comps.length === 0) {
      const mh = fresh && s ? magHealthFromSys(s) : { ok: null, anyPresent: false };
      let body = "0 路启用（COMPASS_DEV_ID* 为 0 或 COMPASS_USE*=0）";
      if (mh.anyPresent) body += " · SYS_STATUS 仍报告磁力计位，可与参数交叉核对";
      html += emptyBlock("指南针", body, "muted");
    } else {
      const mh = fresh && s ? magHealthFromSys(s) : { ok: null };
      let note = `${comps.length} 路`;
      if (fresh && mh.ok === true) note += " · SYS_STATUS 磁力计健康";
      if (fresh && mh.ok === false) note += " · SYS_STATUS 磁力计异常";
      const lis = comps
        .map((c) => {
          const d = decode("compass", c.id);
          const tip = `${d.busDetail} | ${d.rawName || "UNKNOWN"} | ${d.hex}`;
          const short = `${d.hex}`;
          return `<li title="${escAttr(tip)}"><strong>${esc(c.label)}</strong> — <span class="ov-sensor-model">${esc(d.model)}</span> <span class="ov-sensor-meta">${esc(short)}</span></li>`;
        })
        .join("");
      html += sensorBlock("指南针", note, headClass(mh.ok, fresh), `<ul class="ov-sensor-list">${lis}</ul>`);
    }

    /* IMU */
    if (imus.length === 0) {
      html += emptyBlock("加速度计 / IMU", "0 颗启用（INS_ACC*_ID / INS_USE*）", "muted");
    } else {
      const ah = fresh && s ? accelHealthFromSys(s) : { ok: null };
      let note = `${imus.length} 颗 · ${streamHint()}`;
      if (fresh && ah.ok === true) note += " · SYS_STATUS 加速度计健康";
      if (fresh && ah.ok === false) note += " · SYS_STATUS 加速度计异常";
      const lis = imus
        .map((u) => {
          const d = decode("imu", u.id);
          const tip = `${d.busDetail} | ${d.rawName || "UNKNOWN"} | ${d.hex}`;
          const short = `${d.hex}`;
          return `<li title="${escAttr(tip)}"><strong>${esc(u.label)}</strong> — <span class="ov-sensor-model">${esc(d.model)}</span> <span class="ov-sensor-meta">${esc(short)}</span></li>`;
        })
        .join("");
      html += sensorBlock("加速度计 / IMU", note, headClass(ah.ok, fresh), `<ul class="ov-sensor-list">${lis}</ul>`);
    }

    /* 气压计 */
    if (baros.length === 0) {
      html += emptyBlock("气压计", "0 路（BARO1..3_DEVID 均为 0）", "muted");
    } else {
      const bh = fresh && s ? baroHealthFromSys(s) : { ok: null };
      let note = `${baros.length} 路`;
      if (fresh && bh.ok === true) note += " · SYS_STATUS 气压计健康";
      if (fresh && bh.ok === false) note += " · SYS_STATUS 气压计异常";
      const lis = baros
        .map((b) => {
          const d = decode("baro", b.id);
          const tip = `${d.busDetail} | ${d.rawName || "UNKNOWN"} | ${d.hex}`;
          const short = `${d.hex}`;
          return `<li title="${escAttr(tip)}"><strong>${esc(b.label)}</strong> — <span class="ov-sensor-model">${esc(d.model)}</span> <span class="ov-sensor-meta">${esc(short)}</span></li>`;
        })
        .join("");
      html += sensorBlock("气压计", note, headClass(bh.ok, fresh), `<ul class="ov-sensor-list">${lis}</ul>`);
    }

    /* 测距仪 */
    if (rfSlots.length === 0) {
      html += emptyBlock("测距仪", "未配置（RNGFND1..10_TYPE 均为 0）", "muted");
    } else {
      const rt = window._rangefinderTelemetry;
      let dist = "尚无 DISTANCE_SENSOR 遥测";
      if (rt && Date.now() - rt.t < 3000) dist = `当前距离约 ${(rt.currentCm / 100).toFixed(2)} m（最近一帧）`;
      const lh = fresh && s ? laserHealthFromSys(s) : { ok: null };
      let note = `${rfSlots.length} 个槽位已配置 · ${dist}`;
      if (fresh && lh.ok === true) note += " · SYS_STATUS 激光测距健康";
      if (fresh && lh.ok === false) note += " · SYS_STATUS 激光测距异常";
      const lis = rfSlots
        .map((r) => {
          const tip = `RNGFND${r.slot}_TYPE=${r.type} · ${r.short} · ${r.zh}`;
          const meta = `TYPE ${r.type} — ${r.zh}`;
          return `<li title="${escAttr(tip)}"><strong>槽位 ${r.slot}</strong> — <span class="ov-sensor-model">${esc(r.short)}</span> <span class="ov-sensor-meta">${esc(meta)}</span></li>`;
        })
        .join("");
      let cls = headClass(lh.ok, fresh);
      if (cls === "muted" && rfSlots.length) cls = "warn";
      html += sensorBlock("测距仪", note, cls, `<ul class="ov-sensor-list">${lis}</ul>`);
    }

    html += emptyBlock(
      "说明",
      "型号由飞控参数中的 Device ID 按 ArduPilot decode_devid 规则解析；与 Mission Planner 设备列表同源逻辑。",
      "muted"
    );

    root.innerHTML = html;
  }

  function mount() {
    let timer = null;
    document.addEventListener("gcs-connection", render);
    document.addEventListener("gcs-sensor-overview-changed", render);
    function startTimer() {
      if (timer) return;
      timer = setInterval(render, 1500);
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        render();
        startTimer();
      });
    } else {
      render();
      startTimer();
    }
  }

  mount();
}());
