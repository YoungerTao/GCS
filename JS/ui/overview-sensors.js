/**
 * 概览「IMU 与传感器」：仅显示飞控参数中已挂载/已启用的传感器。
 */
(function initOverviewSensors() {
  const MASK = {
    MAG: 0x04,
    MAG2: 0x80000,
    ACCEL: 0x02,
    ACCEL2: 0x40000,
    BARO: 0x08,
    LASER: 0x100,
  };

  const RNGFND_TYPE_INFO = {
    0: { short: "NONE", zh: "未使用" },
    1: { short: "ANALOG", zh: "模拟电压测距" },
    2: { short: "MBI2C", zh: "Maxbotix I2C" },
    3: { short: "PLI2C", zh: "PulsedLight / LidarLite I2C" },
    7: { short: "LWI2C", zh: "LightWare I2C" },
    8: { short: "LWSER", zh: "LightWare 串口" },
    11: { short: "USD1_Serial", zh: "Ainstein USD-D1 串口" },
    13: { short: "MBSER", zh: "Maxbotix 串口" },
    19: { short: "BenewakeTF02", zh: "北醒 TF02 串口" },
    20: { short: "BenewakeTFmini", zh: "北醒 TFmini 串口" },
    24: { short: "UAVCAN", zh: "DroneCAN / UAVCAN 测距" },
    27: { short: "BenewakeTF03", zh: "北醒 TF03 串口" },
    35: { short: "TeraRanger_Serial", zh: "TeraRanger 串口" },
    39: { short: "NRA24_CAN", zh: "NRA24 CAN 雷达" },
    41: { short: "JRE_Serial", zh: "JRE 串口" },
    43: { short: "RDS02UF", zh: "RDS02UF" },
    44: { short: "HEXSOON_RADAR", zh: "Hexsoon 毫米波雷达" },
    47: { short: "DTS6012M", zh: "DTS6012M 串口" },
  };

  function rngfndTypeRow(t) {
    const n = Math.round(Number(t));
    const row = RNGFND_TYPE_INFO[n];
    if (row) return { short: row.short, zh: row.zh };
    return { short: `TYPE_${n}`, zh: `测距类型 ${n}` };
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

  function decode(kind, id) {
    if (!id || typeof window.decodeArduPilotDevId !== "function") {
      return { model: "—", busDetail: "", hex: "—", rawName: "", portZh: "" };
    }
    return window.decodeArduPilotDevId(kind, id >>> 0);
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

  /** 行末健康状态（不显示 SYS_STATUS 字样） */
  function healthSuffix(ok, fresh) {
    if (!fresh || ok === null) {
      return '<span class="ov-sensor-health muted">待确认</span>';
    }
    if (ok) return '<span class="ov-sensor-health ok">健康状态</span>';
    return '<span class="ov-sensor-health danger">异常状态</span>';
  }

  function countNote(n, unit) {
    return `${n} ${unit}`;
  }

  function battInstanceIndex(key) {
    if (key === "BATT_MONITOR") return 0;
    const m = String(key).match(/^BATT(\d+)_MONITOR$/);
    return m ? parseInt(m[1], 10) - 1 : 0;
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

  function render() {
    const root = document.getElementById("ov-sensor-overview-rows");
    if (!root) return;

    const connected = window._gcsConnState === "connected";
    if (!connected) {
      root.innerHTML = '<div class="ov-sensor-empty muted">未连接飞控</div>';
      return;
    }

    const p = window.params;
    if (!(p instanceof Map) || p.size === 0) {
      root.innerHTML = '<div class="ov-sensor-empty warn">已连接，等待参数列表…</div>';
      return;
    }

    const mounted =
      typeof window.collectArduPilotMountedSensors === "function"
        ? window.collectArduPilotMountedSensors(p)
        : null;
    if (!mounted) {
      root.innerHTML = '<div class="ov-sensor-empty muted">传感器检测模块未加载</div>';
      return;
    }

    const s = window._sysStatusSensors;
    const fresh = sysFresh();
    let html = "";

    if (!window.hasArduPilotMountedSensors(mounted)) {
      root.innerHTML =
        '<div class="ov-sensor-empty muted">未检测到已启用的外设传感器<br><span class="ov-sensor-meta">请确认已加载参数，且 RNGFND/PRX/ARSPD 等 TYPE≠0</span></div>';
      return;
    }

    if (mounted.compasses.length) {
      const mh = fresh && s ? magHealthFromSys(s) : { ok: null };
      const lis = mounted.compasses
        .map((c) => {
          const d = decode("compass", c.id);
          const tip = `${d.busDetail} | ${d.rawName || "UNKNOWN"} | ${d.hex}`;
          const body = `${esc(d.model)} ${esc(d.portZh || d.busLabel)} · ${esc(d.hex)}`;
          return `<li title="${escAttr(tip)}"><strong>${esc(c.label)}</strong> — ${body} ${healthSuffix(mh.ok, fresh)}</li>`;
        })
        .join("");
      html += sensorBlock(
        "指南针",
        countNote(mounted.compasses.length, "路"),
        "muted",
        `<ul class="ov-sensor-list">${lis}</ul>`
      );
    }

    if (mounted.imus.length) {
      const ah = fresh && s ? accelHealthFromSys(s) : { ok: null };
      const note = countNote(mounted.imus.length, "颗");
      const lis = mounted.imus
        .map((u) => {
          const da = u.accId ? decode("imu", u.accId) : null;
          const dg = u.gyrId ? decode("imu", u.gyrId) : null;
          const port = da ? da.portZh || da.busLabel : dg ? dg.portZh || dg.busLabel : "—";
          const model = da ? da.model : dg ? dg.model : "—";
          const hex = da ? da.hex : dg ? dg.hex : "—";
          const gyrNote =
            dg && da && dg.hex !== da.hex ? ` · 陀螺 ${esc(dg.model)}` : "";
          const tip = [da && da.busDetail, dg && dg.busDetail].filter(Boolean).join(" | ");
          const body = `${esc(model)} ${esc(port)} · ${esc(hex)}${gyrNote}`;
          return `<li title="${escAttr(tip)}"><strong>${esc(u.label)}</strong> — ${body} ${healthSuffix(ah.ok, fresh)}</li>`;
        })
        .join("");
      html += sensorBlock("IMU（加速度计 / 陀螺仪）", note, "muted", `<ul class="ov-sensor-list">${lis}</ul>`);
    }

    if (mounted.baros.length) {
      const bh = fresh && s ? baroHealthFromSys(s) : { ok: null };
      const lis = mounted.baros
        .map((b) => {
          const d = decode("baro", b.id);
          const tip = `${d.busDetail} | ${d.rawName || "UNKNOWN"} | ${d.hex}`;
          const body = `${esc(d.model)} ${esc(d.portZh || d.busLabel)} · ${esc(d.hex)}`;
          return `<li title="${escAttr(tip)}"><strong>${esc(b.label)}</strong> — ${body} ${healthSuffix(bh.ok, fresh)}</li>`;
        })
        .join("");
      html += sensorBlock(
        "气压计",
        countNote(mounted.baros.length, "路"),
        "muted",
        `<ul class="ov-sensor-list">${lis}</ul>`
      );
    }

    if (mounted.batteries.length) {
      const battView = typeof window.buildBatteryMonitorView === "function"
        ? window.buildBatteryMonitorView(p)
        : [];
      const lis = mounted.batteries
        .map((b) => {
          const slotIdx = battInstanceIndex(b.key);
          const view = battView.find((v) => v.slotIndex === slotIdx);
          let volt = null;
          let hasTelem = false;
          if (view && view.connected && Number.isFinite(view.voltage) && view.voltage > 0) {
            volt = view.voltage;
            hasTelem = true;
          }
          const proto = esc(b.protocol || b.short || "BATT");
          const bus = b.busHint ? esc(b.busHint) : "";
          const mid = bus ? `${proto} ${bus}` : proto;
          const voltStr = volt != null ? ` · ${volt.toFixed(2)} V` : "";
          const waitStr = !hasTelem && Math.round(b.type) === 8 ? " · 未检测到 BMS" : "";
          const body = `${mid}${voltStr}${waitStr}`;
          const status = healthSuffix(hasTelem ? volt > 0 : null, hasTelem);
          const tip = `${b.key}=${b.type} · ${b.zh || ""}`;
          return `<li title="${escAttr(tip)}"><strong>${esc(b.prefix)}</strong> — ${body} ${status}</li>`;
        })
        .join("");
      html += sensorBlock(
        "电池",
        countNote(mounted.batteries.length, "路"),
        "muted",
        `<ul class="ov-sensor-list">${lis}</ul>`
      );
    }

    if (mounted.gnss.length) {
      const gpsState = typeof window.resolveGpsFixDisplay === "function"
        ? window.resolveGpsFixDisplay()
        : { fix: Number(window.gps_fix_type) || 0, mode: "live" };
      const fix = gpsState.fix;
      const lis = mounted.gnss
        .map((g) => {
          const body = `${esc(g.short)} ${esc(g.bus || "—")} · ${esc(g.zh)}`;
          let status;
          if (gpsState.mode === "waiting") {
            status = '<span class="ov-sensor-health warn">等待 GPS 数据</span>';
          } else if (gpsState.mode === "inferred") {
            status = '<span class="ov-sensor-health warn">融合定位</span>';
          } else if (typeof fix === "number" && fix >= 3) {
            status = '<span class="ov-sensor-health ok">定位正常</span>';
          } else if (typeof fix === "number" && fix >= 2) {
            status = '<span class="ov-sensor-health warn">2D 定位</span>';
          } else if (typeof fix === "number" && fix === 1) {
            status = '<span class="ov-sensor-health warn">未定位 / 搜星</span>';
          } else {
            status = '<span class="ov-sensor-health muted">无 GPS</span>';
          }
          return `<li title="${escAttr(g.key)}"><strong>${esc(g.label)}</strong> — ${body} ${status}</li>`;
        })
        .join("");
      html += sensorBlock(
        "GNSS / GPS",
        countNote(mounted.gnss.length, "路"),
        "muted",
        `<ul class="ov-sensor-list">${lis}</ul>`
      );
    }

    if (mounted.airspeeds.length) {
      const lis = mounted.airspeeds
        .map((a) => {
          const body = `${esc(a.short)} ${esc(a.bus || "—")} · ${esc(a.zh)}`;
          let status = '<span class="ov-sensor-health muted">待确认</span>';
          if (typeof window.airspeed === "number") {
            status =
              window.airspeed >= 0
                ? `<span class="ov-sensor-health ok">${window.airspeed.toFixed(1)} m/s</span>`
                : '<span class="ov-sensor-health muted">无数据</span>';
          }
          return `<li><strong>空速 ${a.slot}</strong> — ${body} ${status}</li>`;
        })
        .join("");
      html += sensorBlock(
        "空速计",
        countNote(mounted.airspeeds.length, "路"),
        "muted",
        `<ul class="ov-sensor-list">${lis}</ul>`
      );
    }

    if (mounted.opticalFlow) {
      const f = mounted.opticalFlow;
      const body = `${esc(f.short)} ${esc(f.bus || "—")} · ${esc(f.zh)}`;
      html += sensorBlock(
        "光流",
        "1 路",
        "muted",
        `<ul class="ov-sensor-list"><li>${body} <span class="ov-sensor-health ok">已配置</span></li></ul>`
      );
    }

    if (mounted.beacon) {
      const b = mounted.beacon;
      const body = `${esc(b.short)} ${esc(b.bus || "—")} · ${esc(b.zh)}`;
      html += sensorBlock(
        "UWB / 信标定位",
        "1 路",
        "muted",
        `<ul class="ov-sensor-list"><li>${body} <span class="ov-sensor-health ok">已配置</span></li></ul>`
      );
    }

    if (mounted.rangefinders.length) {
      const rt = window._rangefinderTelemetry;
      const lh = fresh && s ? laserHealthFromSys(s) : { ok: null };
      const lis = mounted.rangefinders
        .map((r) => {
          const row = rngfndTypeRow(r.type);
          const tip = `RNGFND${r.slot}_TYPE=${r.type} · ${row.short} · ${row.zh}`;
          const body = `${esc(row.short)} ${esc(r.busHint || row.zh)} · TYPE ${r.type}`;
          let status = healthSuffix(lh.ok, fresh);
          if (rt && Date.now() - rt.t < 3000) {
            status += ` <span class="ov-sensor-meta">${(rt.currentCm / 100).toFixed(2)} m</span>`;
          }
          return `<li title="${escAttr(tip)}"><strong>测距 ${r.slot}</strong> — ${body} ${status}</li>`;
        })
        .join("");
      html += sensorBlock(
        "测距仪 / 串口雷达",
        countNote(mounted.rangefinders.length, "路"),
        "muted",
        `<ul class="ov-sensor-list">${lis}</ul>`
      );
    }

    if (mounted.proximity.length) {
      const lis = mounted.proximity
        .map((r) => {
          const body = `${esc(r.short)} ${esc(r.bus || "—")} · ${esc(r.zh)}`;
          return `<li title="${escAttr(`PRX${r.slot}_TYPE=${r.type}`)}"><strong>避障 ${r.slot}</strong> — ${body} <span class="ov-sensor-health ok">已配置</span></li>`;
        })
        .join("");
      html += sensorBlock(
        "避障 / 毫米波雷达",
        countNote(mounted.proximity.length, "路"),
        "muted",
        `<ul class="ov-sensor-list">${lis}</ul>`
      );
    }

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
})();
