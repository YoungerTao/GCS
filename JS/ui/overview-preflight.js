/**
 * 初始设置顶栏：连接状态与预检横幅（机体 / 传感器 / PreArm）
 */
(function initOverviewPreflight() {
  let lastPrearmHint = "";
  let prearmHintAt = 0;

  function getp(key) {
    const p = window.params;
    if (!(p instanceof Map) || !p.has(key)) return null;
    const v = Number(p.get(key));
    return Number.isFinite(v) ? v : null;
  }

  function frameParamKeys() {
    const p = window.params;
    if (!(p instanceof Map)) return null;
    if (p.has("FRAME_CLASS") && p.has("FRAME_TYPE")) {
      return { classKey: "FRAME_CLASS", typeKey: "FRAME_TYPE" };
    }
    if (p.has("Q_FRAME_CLASS") && p.has("Q_FRAME_TYPE")) {
      return { classKey: "Q_FRAME_CLASS", typeKey: "Q_FRAME_TYPE" };
    }
    return null;
  }

  function isAirframeConfigured() {
    const keys = frameParamKeys();
    if (!keys) return false;
    const fc = getp(keys.classKey);
    const ft = getp(keys.typeKey);
    if (fc == null) return false;
    if (typeof window.getMotorMapByFrame === "function") {
      return !!window.getMotorMapByFrame(fc, ft ?? 1);
    }
    return fc > 0;
  }

  function compassNeedsCalibration() {
    const p = window.params;
    if (!(p instanceof Map)) return false;
    const use = getp("COMPASS_USE");
    const devId = getp("COMPASS_DEV_ID");
    if (!use || !devId) return false;
    const ox = getp("COMPASS_OFS_X");
    const oy = getp("COMPASS_OFS_Y");
    const oz = getp("COMPASS_OFS_Z");
    if (ox == null || oy == null || oz == null) return true;
    return ox === 0 && oy === 0 && oz === 0;
  }

  function sensorsNeedCalibration() {
    if (lastPrearmHint && Date.now() - prearmHintAt < 120000) {
      const t = lastPrearmHint.toLowerCase();
      if (
        t.includes("compass") || t.includes("calibrat") || t.includes("accel") ||
        t.includes("gyro") || t.includes("罗盘") || t.includes("校准")
      ) {
        return true;
      }
    }
    return compassNeedsCalibration();
  }

  function updateLinkStatus() {
    const el = document.getElementById("ov-link-status");
    if (!el) return;
    const dot = el.querySelector(".ov-dot");
    const textEl = el.querySelector(".ov-link-text");
    const st = (window._gcsConnState || "disconnected").toLowerCase();
    const baud = document.getElementById("serialBaud")?.value || "115200";
    if (st === "connected") {
      if (dot) dot.className = "ov-dot ok";
      if (textEl) textEl.textContent = `串口已连接 / ${baud} 8N1（USB 常见）`;
      return;
    }
    if (dot) dot.className = st === "connecting" ? "ov-dot warn" : "ov-dot";
    if (textEl) textEl.textContent = st === "connecting" ? "串口连接中…" : "串口未连接";
  }

  function updateGlobalWarning() {
    const warn = document.getElementById("ov-global-warning");
    if (!warn) return;

    const st = (window._gcsConnState || "disconnected").toLowerCase();
    if (st !== "connected") {
      warn.className = "ov-global-warning muted";
      warn.textContent = st === "connecting" ? "正在连接飞控…" : "未连接飞控，无法预检";
      return;
    }

    const p = window.params;
    if (!(p instanceof Map) || p.size === 0) {
      warn.className = "ov-global-warning warn";
      warn.textContent = "已连接，等待参数列表…";
      return;
    }

    const issues = [];
    if (!isAirframeConfigured()) issues.push("机体未定义");
    if (sensorsNeedCalibration()) issues.push("部分传感器未校准");
    if (lastPrearmHint && Date.now() - prearmHintAt < 120000) {
      const short = lastPrearmHint.replace(/^prearm:\s*/i, "").trim();
      if (short && !issues.some((x) => short.includes(x))) {
        issues.push(short.length > 48 ? `${short.slice(0, 48)}…` : short);
      }
    }

    if (!issues.length) {
      warn.className = "ov-global-warning ok";
      warn.textContent = "预检通过，可以解锁起飞";
      return;
    }

    warn.className = "ov-global-warning danger pulse";
    warn.textContent = `${issues.join("，")}，禁止起飞`;
  }

  function refresh() {
    updateLinkStatus();
    updateGlobalWarning();
  }

  function onPrearmStatustext(text) {
    const raw = String(text || "");
    const low = raw.toLowerCase();
    if (!low.includes("prearm:") && !low.includes("pre-arm")) return;
    if (low.includes("checks disabled") || low.includes("check passed")) {
      lastPrearmHint = "";
      prearmHintAt = 0;
      return;
    }
    lastPrearmHint = raw;
    prearmHintAt = Date.now();
  }

  window.gcsOnPrearmStatustext = onPrearmStatustext;

  document.addEventListener("gcs-connection", refresh);
  document.addEventListener("gcs-airframe-params-changed", refresh);
  document.addEventListener("gcs-sensor-overview-changed", refresh);
  document.addEventListener("gcs-prearm-hint", refresh);

  window.addEventListener("DOMContentLoaded", () => {
    refresh();
    setInterval(refresh, 2000);
  });
})();
