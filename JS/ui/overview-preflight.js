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

  const FRAME_CLASS_LABELS = {
    1: "四旋翼", 2: "六旋翼", 3: "八旋翼", 4: "共轴八轴", 5: "Y6",
    6: "传统直升机", 7: "三旋翼", 8: "单旋翼", 9: "共轴双桨", 10: "双旋翼",
    11: "双旋翼直升机", 12: "十二轴", 13: "直升机四轴", 14: "十旋翼",
    15: "脚本矩阵", 16: "6DoF 脚本", 17: "动态脚本矩阵",
  };
  const FRAME_TYPE_LABELS = {
    0: "Plus", 1: "X", 2: "V", 3: "H", 4: "V-Tail", 5: "A-Tail",
    10: "Y6B", 11: "Y6F", 12: "BetaFlightX", 13: "DJIX", 14: "ClockwiseX",
    15: "I", 18: "BetaFlightXReversed", 19: "Y4",
  };

  let frameParamProbeAt = 0;

  function maybeRequestFrameParams() {
    const st = (window._gcsConnState || "").toLowerCase();
    if (st !== "connected" || frameParamKeys()) return;
    const now = Date.now();
    if (now - frameParamProbeAt < 4000) return;
    frameParamProbeAt = now;
    const names = ["FRAME_CLASS", "FRAME_TYPE", "Q_FRAME_CLASS", "Q_FRAME_TYPE"];
    names.forEach((n, i) => {
      setTimeout(() => {
        if (typeof window.requestParamByName === "function") {
          window.requestParamByName(n).catch(() => {});
        }
      }, i * 120);
    });
  }

  function updateOverviewAirframeType() {
    const ovEl = document.getElementById("ov-airframe-type");
    if (!ovEl) return;

    const st = (window._gcsConnState || "disconnected").toLowerCase();
    if (st !== "connected") {
      ovEl.textContent = "未连接或未收到机架参数";
      ovEl.className = "muted";
      ovEl.title = "由飞控通过 MAVLink 参数 FRAME_CLASS / FRAME_TYPE（或 VTOL 的 Q_*）下发";
      return;
    }

    const keys = frameParamKeys();
    if (!keys) {
      const pmap = window.params;
      if (pmap instanceof Map && pmap.size > 0) {
        ovEl.textContent = "已连接，参数表无 FRAME_CLASS（可能未收全或非 Copter）";
        ovEl.className = "warn";
      } else {
        ovEl.textContent = "已连接，等待机架参数…";
        ovEl.className = "warn";
      }
      maybeRequestFrameParams();
      return;
    }

    const fc = getp(keys.classKey);
    const ft = getp(keys.typeKey);
    if (fc == null) {
      ovEl.textContent = "等待飞控 FRAME_CLASS / FRAME_TYPE…";
      ovEl.className = "warn";
      maybeRequestFrameParams();
      return;
    }

    const map =
      typeof window.getMotorMapByFrame === "function"
        ? window.getMotorMapByFrame(fc, ft ?? 1)
        : null;
    if (map && map.name) {
      ovEl.textContent = `${map.name}（飞控）`;
      ovEl.className = "ok";
    } else {
      const cl = FRAME_CLASS_LABELS[fc] || `CLASS ${fc}`;
      const tl =
        ft != null ? ` / ${FRAME_TYPE_LABELS[ft] || `TYPE ${ft}`}` : "";
      ovEl.textContent = `${cl}${tl}`;
      ovEl.className = "ok";
    }
    ovEl.title = `${keys.classKey}=${fc}, ${keys.typeKey}=${ft ?? "—"}`;
  }

  function refresh() {
    updateLinkStatus();
    updateGlobalWarning();
    updateOverviewAirframeType();
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
