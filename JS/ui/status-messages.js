/**
 * GCS STATUSTEXT 消息栏：中文翻译、文字颜色分级、过滤、Tab 角标
 */
(function () {
  const MAX_ROWS = 500;
  const translateCache = new Map();

  const BUILTIN_EN_ZH = {
    "prearm: check forced": "预解锁：检查已强制",
    "prearm: checks disabled": "预解锁：检查已禁用",
    "arming denied": "不允许解锁",
    "disarmed": "已上锁",
    "armed": "已解锁",
    "flight mode": "飞行模式",
    "ekf variance": "EKF 方差",
    "ekf3 waiting for gps config data": "EKF3 等待 GPS 配置数据",
    "gps glitch cleared": "GPS 故障已清除",
    "gps glitch": "GPS 故障",
    "compass calibrated requires reboot": "罗盘已校准，需要重启",
    "compass needs calibration": "罗盘需要校准",
    "bad compass health": "罗盘健康度异常",
    "bad gyro health": "陀螺仪健康度异常",
    "bad accel health": "加速度计健康度异常",
    "vibration compensation on": "振动补偿开启",
    "crash disarming": "坠机自动上锁",
    "auto disarmed": "自动上锁",
    "land complete": "降落完成",
    "rtl complete": "返航完成",
    "fence requires position": "围栏需要定位",
    "fence cleared": "围栏已清除",
    "fence enabled": "围栏已启用",
    "fence disabled": "围栏已禁用",
    "geofence breach": "地理围栏越界",
    "low battery": "电池电压低",
    "critical battery": "电池严重低压",
    "battery failsafe": "电池失效保护",
    "rc failsafe": "遥控失效",
    "gcs failsafe": "地面站链路失效",
    "throttle failsafe": "油门失效保护",
    "ekf failsafe": "EKF 失效保护",
    "terrain failsafe": "地形失效保护",
    "mission complete": "任务完成",
    "mission loaded": "航线已加载",
    "waypoint reached": "已到达航点",
    "reached command": "已到达指令",
    "home position set": "家点已设置",
    "home position updated": "家点已更新",
    "compass motor interference": "罗盘电机干扰",
    "compass interference": "罗盘干扰",
    "mag field interference": "磁场干扰",
    "compass inconsistent": "罗盘数据不一致",
    "check mag field": "请检查磁场",
    "ahrs: not healthy": "AHRS 不健康",
    "ahrs: healthy": "AHRS 正常",
    "barometer glitch cleared": "气压计故障已清除",
    "barometer noise": "气压计噪声",
    "airspeed not healthy": "空速不健康",
    "airspeed healthy": "空速正常",
    "rangefinder 1: no data": "测距仪 1：无数据",
    "rangefinder 1: detected": "测距仪 1：已检测到",
    "optical flow healthy": "光流正常",
    "optical flow not healthy": "光流异常",
    "avoidance requires position": "避障需要定位",
    "avoidance disabled": "避障已关闭",
    "avoidance enabled": "避障已开启",
    "smart rtl unavailable": "智能返航不可用",
    "smart rtl active": "智能返航激活",
    "mode changed": "模式已切换",
    "set mode": "设置模式",
    "takeoff complete": "起飞完成",
    "motor test": "电机测试",
    "motor interlock enabled": "电机互锁已启用",
    "motor interlock disabled": "电机互锁已禁用",
    "parachute released": "降落伞已释放",
    "parachute disabled": "降落伞已禁用",
    "logging started": "日志记录已开始",
    "logging stopped": "日志记录已停止",
    "dataflash log": "Dataflash 日志",
    "frame": "机架",
    "imu0 calibrated": "IMU0 已校准",
    "imu1 calibrated": "IMU1 已校准",
    "calibration successful": "校准成功",
    "calibration failed": "校准失败",
    "rc not found": "未找到遥控器",
    "rc found": "已找到遥控器",
    "bind failed": "对频失败",
    "bind success": "对频成功",
    "fence breach": "围栏越界",
    "altitude fence breach": "高度围栏越界",
    "circle complete": "盘旋完成",
    "autotune started": "自动调参已开始",
    "autotune stopped": "自动调参已停止",
    "autotune success": "自动调参成功",
    "autotune failed": "自动调参失败",
    "flip complete": "翻转完成",
    "throw detected": "抛飞已检测",
    "throw not level": "抛飞时机身不水平",
    "waiting for throw": "等待抛飞",
    "leak detector": "漏水检测",
    "ice detected": "检测到结冰",
    "wind estimate exceeds limits": "风速估计超限",
    "gps 1: probing for ubx at": "GPS 1：正在探测 UBX",
    "gps 1: detected ubx": "GPS 1：已检测到 UBX",
    "gps 2: probing for ubx at": "GPS 2：正在探测 UBX",
    "rtk fixed": "RTK 固定解",
    "rtk float": "RTK 浮点解",
    "gps lock": "GPS 锁定",
    "no gps": "无 GPS",
    "bad lidar health": "激光雷达健康度异常",
    "lidar health ok": "激光雷达正常",
    "rangefinder healthy": "测距仪正常",
    "terrain data missing": "地形数据缺失",
    "terrain timeout": "地形数据超时",
    "fence requires 3d fix": "围栏需要 3D 定位",
    "need position estimate": "需要位置估计",
    "need gps lock": "需要 GPS 锁定",
    "check fence": "请检查围栏",
    "check geography": "请检查地理设置",
    "check location": "请检查位置",
    "compass not calibrated": "罗盘未校准",
    "accel cal pending": "加速度计校准待处理",
    "gyro cal ok": "陀螺仪校准正常",
    "ins is still settling": "惯导仍在稳定中",
    "waiting for navigation alignment": "等待导航对准",
    "check vehicle attitude": "请检查机体姿态",
    "check mag field and compass": "请检查磁场与罗盘",
    "potential thrust loss": "可能推力损失",
    "thrust loss": "推力损失",
    "motor output mismatch": "电机输出不匹配",
    "esc telemetry": "电调遥测",
    "battery": "电池",
    "rangefinder": "测距仪",
    "sonar": "声呐",
    "lidar": "激光雷达",
    "optical flow": "光流",
    "fence": "围栏",
    "rtl": "返航",
    "land": "降落",
    "loiter": "定点",
    "auto": "自动",
    "guided": "引导",
    "stabilize": "自稳",
    "acro": "特技",
    "alt hold": "定高",
    "poshold": "位置保持",
    "brake": "刹车",
    "smart_rtl": "智能返航",
    "throw": "抛飞",
    "flip": "翻转",
    "turtle": "翻身",
    "systemid": "系统辨识",
    "zigzag": "之字",
    "follow": "跟随",
    "flowhold": "光流定点",
    "drift": "漂移",
    "sport": "运动",
    "circle": "盘旋",
    "avoid_adsb": "ADS-B 规避",
    "guided_nogps": "无 GPS 引导",
    "autorotate": "自转",
    "auto_rtl": "自动返航",
    "unknown": "未知",
    "error": "错误",
    "warning": "警告",
    "ok": "正常",
    "ready": "就绪",
    "failed": "失败",
    "success": "成功",
    "timeout": "超时",
    "enabled": "已启用",
    "disabled": "已禁用",
  };

  let unreadAlertCount = 0;
  const filterOn = { critical: true, warning: true, info: true, debug: true };
  const messages = [];

  function severityBucket(sev) {
    const s = Number(sev);
    if (s <= 2) return "critical";
    if (s <= 4) return "warning";
    if (s <= 6) return "info";
    return "debug";
  }

  function builtinTranslate(en) {
    const raw = (en || "").trim();
    if (!raw) return null;
    const low = raw.toLowerCase();
    if (BUILTIN_EN_ZH[low]) return BUILTIN_EN_ZH[low];
    return null;
  }

  let _translateQueue = [];
  let _translateTimer = null;

  /** 防抖 + 限速翻译：最多每 500ms 翻译一条，避免 MyMemory 拒绝、429 限流或频繁翻译无意义文本 */
  function enqueueTranslation(en, callback) {
    _translateQueue.push({ en, callback });
    if (_translateTimer) return;
    _translateTimer = setInterval(() => {
      if (!_translateQueue.length) {
        clearInterval(_translateTimer);
        _translateTimer = null;
        return;
      }
      const job = _translateQueue.shift();
      translateOne(job.en, job.callback);
    }, 500);
  }

  async function translateOne(en, callback) {
    const result = await doTranslate(en);
    try { if (typeof callback === "function") callback(result); } catch (_) { /* ignore */ }
  }

  async function doTranslate(en) {
    const t = (en || "").trim();
    if (!t) return "";
    const low = t.toLowerCase();
    if (translateCache.has(low)) return translateCache.get(low);
    const built = builtinTranslate(t);
    if (built) {
      translateCache.set(low, built);
      return built;
    }
    try {
      const q = t.slice(0, 450);
      const url = "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(q) + "&langpair=en|zh-CN";
      const r = await fetch(url);
      const j = await r.json();
      let zh = t;
      if (j && j.responseData && j.responseData.translatedText) {
        zh = j.responseData.translatedText;
        if (zh === q || (j.responseData.match && j.responseData.match < 0.55)) zh = t;
      }
      translateCache.set(low, zh);
      return zh;
    } catch (e) {
      translateCache.set(low, t);
      return t;
    }
  }

  function isMessagesTabActive() {
    const p = document.getElementById("panel-messages");
    return p && p.classList.contains("active");
  }

  function updateTabBadge() {
    const el = document.getElementById("log-tab-messages-badge");
    if (!el) return;
    if (unreadAlertCount > 0) {
      el.hidden = false;
      el.textContent = String(unreadAlertCount > 99 ? "99+" : unreadAlertCount);
    } else {
      el.hidden = true;
      el.textContent = "0";
    }
  }

  function updateStatusBar() {
    const connEl = document.getElementById("gcs-msg-conn");
    const unreadEl = document.getElementById("gcs-msg-unread");
    const totalEl = document.getElementById("gcs-msg-total");
    if (unreadEl) unreadEl.textContent = `未读警报 ${unreadAlertCount}`;
    if (totalEl) totalEl.textContent = `总计 ${messages.length}`;
    if (connEl) {
      const st = window._gcsConnState || "disconnected";
      connEl.classList.remove("gcs-msg-conn--ok", "gcs-msg-conn--wait", "gcs-msg-conn--err");
      if (st === "connected") {
        connEl.textContent = "已连接";
        connEl.classList.add("gcs-msg-conn--ok");
      } else if (st === "connecting") {
        connEl.textContent = "连接中…";
        connEl.classList.add("gcs-msg-conn--wait");
      } else if (st === "error") {
        connEl.textContent = "连接异常";
        connEl.classList.add("gcs-msg-conn--err");
      } else {
        connEl.textContent = "未连接";
      }
    }
  }

  function applyRowVisibility(row, bucket) {
    const on = filterOn[bucket];
    row.style.display = on ? "" : "none";
  }

  function appendRow(entry) {
    const list = document.getElementById("gcs-msg-list");
    if (!list) return;

    const bucket = severityBucket(entry.severity);
    const row = document.createElement("div");
    row.className = `gcs-msg-row gcs-msg-row--${bucket}`;
    row.dataset.level = bucket;

    const timeEl = document.createElement("span");
    timeEl.className = "gcs-msg-time";
    const d = entry.t;
    timeEl.textContent =
      String(d.getHours()).padStart(2, "0") +
      ":" +
      String(d.getMinutes()).padStart(2, "0") +
      ":" +
      String(d.getSeconds()).padStart(2, "0");

    const body = document.createElement("span");
    body.className = "gcs-msg-body";
    body.textContent = "翻译中…";

    row.appendChild(timeEl);
    row.appendChild(body);

    list.insertBefore(row, list.firstChild);
    applyRowVisibility(row, bucket);

    while (list.children.length > MAX_ROWS) {
      list.removeChild(list.lastChild);
    }

    enqueueTranslation(entry.textEn, (zh) => {
      const line = zh || entry.textEn;
      if (body.isConnected) body.textContent = line;
    });
  }

  function onNewAlertSeverity(sev) {
    const s = Number(sev);
    if (s > 4) return;
    if (!isMessagesTabActive()) {
      unreadAlertCount += 1;
      updateTabBadge();
    }
    updateStatusBar();
  }

  /**
   * 概览「载机与固件」：部分固件/连接下不会及时发 AUTOPILOT_VERSION，但启动横幅会通过 STATUSTEXT
   * 到达（与消息栏一致）。在此用同一文本回填固件版本 / 板型 / 设备号，避免长期停在「等待飞控上报」。
   * AUTOPILOT_VERSION 到达后仍由 mavlink.js parseAutopilotVersion 覆盖为更精确内容。
   */
  function tryPopulateOverviewFromStatustext(raw) {
    const line = String(raw || "").trim();
    if (!line) return;

    const fwEl = document.getElementById("ov-fw-version");
    const hwEl = document.getElementById("ov-board-hardware");
    const idEl = document.getElementById("ov-device-id");
    if (!fwEl && !hwEl && !idEl) return;

    const stillWaiting = (el) =>
      el && String(el.textContent || "").includes("等待飞控上报");

    const updateOverviewFallback = (patch) => {
      const prev = window._overviewVersionFallback || {};
      window._overviewVersionFallback = {
        firmwareText: typeof prev.firmwareText === "string" ? prev.firmwareText : "",
        hardwareText: typeof prev.hardwareText === "string" ? prev.hardwareText : "",
        deviceId: typeof prev.deviceId === "string" ? prev.deviceId : "",
        source: "statustext",
        updatedAt: Date.now(),
        ...patch,
      };
    };

    // ArduCopter/ArduPlane 版本行；允许前后噪声与括号内 hash
    const fwM = line.match(
      /(Ardu(?:Copter|Plane|Rover|Sub)|AntennaTracker)\s+V[\d.]+(?:\s*\([^)]*\))?/i,
    );
    if (fwM && fwEl) {
      let show = String(fwM[0] || "").trim() || line;
      const ch = window._statustextChibiosHash;
      if (ch && !show.includes(ch)) {
        show = `${show.trim()} · ChibiOS ${ch}`;
      }
      fwEl.textContent = show;
      fwEl.className = "ok";
      fwEl.title = "来自飞控 STATUSTEXT 启动横幅（与消息栏一致）";
      updateOverviewFallback({ firmwareText: show });
      return;
    }

    // ChibiOS : 88b84600 — 合并到固件行（若已有 Ardu 行则追加）
    const chibM = line.match(/ChibiOS\s*:\s*([0-9a-fA-F]+)/i);
    if (chibM && fwEl) {
      window._statustextChibiosHash = chibM[1];
      const tail = `ChibiOS ${chibM[1]}`;
      const cur = String(fwEl.textContent || "");
      if (stillWaiting(fwEl) || cur.includes("等待飞控上报")) {
        fwEl.textContent = tail;
      } else if (/Ardu(?:Copter|Plane|Rover|Sub)|AntennaTracker/i.test(cur)) {
        if (!cur.includes(chibM[1])) {
          fwEl.textContent = `${cur.replace(/\s*·\s*ChibiOS.*$/i, "").trim()} · ${tail}`;
        }
      } else if (!cur.includes(chibM[1])) {
        fwEl.textContent = `${cur.replace(/\s*·\s*ChibiOS.*$/i, "").trim()} · ${tail}`;
      }
      fwEl.className = "ok";
      fwEl.title = (fwEl.title || "") + (fwEl.title ? "；" : "") + "STATUSTEXT OS 信息";
      updateOverviewFallback({ firmwareText: String(fwEl.textContent || "").trim() });
      return;
    }

    // 板型 + 设备号段：如 CUAV-X7 004B002F 3432510F 33303438（常含十六进制字符）
    const brdM = line.match(
      /^([A-Za-z][A-Za-z0-9_+\-/]{1,40})\s+((?:[0-9a-fA-F]{4,}\s*){2,})\s*$/,
    );
    if (
      brdM &&
      hwEl &&
      idEl &&
      !/^Ardu/i.test(brdM[1]) &&
      !/^ChibiOS/i.test(brdM[1]) &&
      !/^frame$/i.test(brdM[1])
    ) {
      hwEl.textContent = brdM[1];
      hwEl.className = "ok";
      hwEl.title = "来自飞控 STATUSTEXT（板载标识）";
      idEl.textContent = brdM[2].trim().replace(/\s+/g, " ");
      idEl.className = "ok";
      idEl.title = "来自飞控 STATUSTEXT（与消息栏设备号段一致）";
      updateOverviewFallback({
        hardwareText: String(hwEl.textContent || "").trim(),
        deviceId: String(idEl.textContent || "").trim(),
      });
    }
  }

  function ingestStatustext(severity, text) {
    const entry = {
      severity: Number(severity),
      textEn: String(text || ""),
      t: new Date(),
    };
    messages.unshift(entry);
    if (messages.length > MAX_ROWS) messages.length = MAX_ROWS;
    appendRow(entry);
    onNewAlertSeverity(entry.severity);
    updateStatusBar();
    try {
      tryPopulateOverviewFromStatustext(entry.textEn);
    } catch (e) { /* ignore */ }
    try {
      if (typeof window.gcsOnPrearmStatustext === "function") {
        window.gcsOnPrearmStatustext(entry.textEn);
      }
      if (/prearm:/i.test(entry.textEn)) {
        document.dispatchEvent(new CustomEvent("gcs-prearm-hint"));
      }
    } catch (e) { /* ignore */ }
    if (/frame:\s*\S/i.test(entry.textEn)) {
      try {
        document.dispatchEvent(new CustomEvent("gcs-frame-statustext", { detail: { text: entry.textEn } }));
      } catch (e) { /* ignore */ }
    }
  }

  function markMessagesRead() {
    unreadAlertCount = 0;
    updateTabBadge();
    updateStatusBar();
  }

  function initToolbar() {
    document.querySelectorAll(".gcs-msg-filter").forEach((btn) => {
      btn.addEventListener("click", () => {
        const lv = btn.dataset.level;
        if (!lv || !(lv in filterOn)) return;
        filterOn[lv] = !filterOn[lv];
        btn.classList.toggle("active", filterOn[lv]);
        document.querySelectorAll(".gcs-msg-row").forEach((row) => {
          applyRowVisibility(row, row.dataset.level);
        });
      });
    });
  }

  function onConnection() {
    updateStatusBar();
    try {
      const st = (window._gcsConnState || "").toLowerCase();
      if (st === "disconnected" || st === "error") window._statustextChibiosHash = "";
    } catch (_) { /* ignore */ }
  }

  window.ingestStatustext = ingestStatustext;
  window.gcsMarkMessagesRead = markMessagesRead;

  window.addEventListener("DOMContentLoaded", () => {
    window._gcsConnState = window._gcsConnState || "disconnected";
    initToolbar();
    updateStatusBar();
    updateTabBadge();
    document.addEventListener("gcs-connection", onConnection);
  });
})();
