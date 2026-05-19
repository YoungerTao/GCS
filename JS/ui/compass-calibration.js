(function initCompassCalibration() {
  const MAV_CMD_DO_START_MAG_CAL = 42424;
  const MAV_CMD_DO_ACCEPT_MAG_CAL = 42425;
  const MAV_CMD_DO_CANCEL_MAG_CAL = 42426;
  const MAG_CAL_SUCCESS = 4;
  const MAG_CAL_FAILED = 5;
  const STUCK_99_WARN_MS = 12000;
  const STUCK_99_ACCEPT_MS = 20000;
  const MAG_CAL_RUNNING_STEP_TWO = 3;

  const MAG_SLOTS = 3;
  const SLOT_PARAM = [
    { idKey: "COMPASS_DEV_ID", useKey: "COMPASS_USE", label: "罗盘 1" },
    { idKey: "COMPASS_DEV_ID2", useKey: "COMPASS_USE2", label: "罗盘 2" },
    { idKey: "COMPASS_DEV_ID3", useKey: "COMPASS_USE3", label: "罗盘 3" }
  ];
  const CANVAS_IDS = ["sc-mag-canvas-1", "sc-mag-canvas-2", "sc-mag-canvas-3"];
  const BAR_IDS = ["sc-mag-p1-bar", "sc-mag-p2-bar", "sc-mag-p3-bar"];
  const LABEL_IDS = ["sc-mag-p1-label", "sc-mag-p2-label", "sc-mag-p3-label"];
  const SAMPLE_IDS = ["sc-mag-samples-1", "sc-mag-samples-2", "sc-mag-samples-3"];
  const FIT_IDS = ["sc-fit-1", "sc-fit-2", "sc-fit-3"];
  const HUE_BASE = [200, 160, 120];
  const USE_CHECK_IDS = ["sc-compass-use1", "sc-compass-use2", "sc-compass-use3"];

  /**
   * 罗盘校准全局状态
   *  - pts[i]         : 第 i 路采样点
   *  - progress       : 飞控返回的完成度 0–100
   *  - calSnapshot    : 本次点击「开始」时，哪些路参与校准（有 DEV 且 USE≠0）
   *  - haveData       : 是否收到过该 compass_id 的 progress
   */
  const compass = {
    running: false,
    raf: 0,
    pts: [[], [], []],
    progress: [0, 0, 0],
    fitness: [99, 99, 99],
    fcMode: false,
    fcSuccess: [false, false, false],
    haveData: [false, false, false],
    calSnapshot: [true, false, false],
    sphereRot: 0,
    /** 已对某路下发过 MAV_CMD_DO_ACCEPT_MAG_CAL，避免 progress+report 双触发重复发送 */
    magAcceptSent: new Set(),
    fcFailed: [false, false, false],
    /** 某路首次到达 99% 且未确认的时间戳（用于超时补发 ACCEPT） */
    stuck99Since: [0, 0, 0],
    stuck99Warned: [false, false, false],
    reached99: [false, false, false],
    lastCalStatus: [0, 0, 0],
    lastProgressMs: [0, 0, 0],
    lastProgressPct: [0, 0, 0],
    coverageBits: [0, 0, 0],
    progressStallWarned: [false, false, false],
    stuckTimer: 0
  };

  const MAG_CAL_PROGRESS_MSG_ID = 191;
  const MAG_CAL_REPORT_MSG_ID = 192;
  const COMPLETION_MASK_BITS = 80;
  const PROGRESS_STALL_MS = 12000;

  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function fcConnected() { return !!window.writer; }

  function slog(msg) {
    if (typeof window.log === "function") window.log(msg);
    else console.log(msg);
  }

  function getp(name) {
    const p = window.params;
    if (!(p instanceof Map) || !p.has(name)) return null;
    const v = Number(p.get(name));
    return Number.isFinite(v) ? v : null;
  }

  /** 飞控参数：第 i 路罗盘是否外置（COMPASS_EXTERNAL / COMPASS_EXTERN2 / COMPASS_EXTERN3） */
  function readCompassPlacementZh(i) {
    const keys = ["COMPASS_EXTERNAL", "COMPASS_EXTERN2", "COMPASS_EXTERN3"];
    const v = getp(keys[i]);
    if (v == null) return null;
    const n = Math.round(v);
    if (n === 0) return "内置";
    if (n === 1) return "外置";
    if (n === 2) return "外置(强制)";
    return `外置(${n})`;
  }

  /** 与概览页一致：有 DEV_ID 且 USE≠0 视为飞控会参与 MAG 校准的一路 */
  function readSlot(i) {
    const { idKey, useKey, label } = SLOT_PARAM[i];
    const rawId = getp(idKey);
    const hasDev = rawId != null && Math.round(rawId) !== 0;
    let use = getp(useKey);
    if (use == null) use = 1;
    const useOn = Math.round(use) !== 0;
    const devId = hasDev ? Math.round(rawId) >>> 0 : 0;
    let model = "—";
    let portZh = "—";
    if (hasDev && typeof window.decodeArduPilotDevId === "function") {
      const d = window.decodeArduPilotDevId("compass", devId);
      model = d && d.model ? String(d.model) : "—";
      portZh = d && d.portZh ? String(d.portZh) : "—";
    }
    const placementZh = readCompassPlacementZh(i);
    return { label, hasDev, useOn, devId, model, portZh, placementZh };
  }

  function updateCompassUseLineSpans() {
    for (let i = 0; i < MAG_SLOTS; i += 1) {
      const span = $(`sc-compass-use-line-${i}`);
      if (!span) continue;
      const { idKey, useKey } = SLOT_PARAM[i];
      if (!fcConnected() || !(window.params instanceof Map) || window.params.size === 0) {
        span.textContent = `${useKey}：（等待飞控参数…）`;
        continue;
      }
      const s = readSlot(i);
      if (!s.hasDev) {
        span.textContent = `${useKey}：未检测到传感器（${idKey}=0）· 未启用`;
      } else {
        const place = s.placementZh != null ? s.placementZh : "内置/外置未标";
        const tail = s.useOn ? "已启用" : "未启用";
        span.textContent = `${useKey}：${s.portZh} · ${s.model} · ${place} · ${tail}`;
      }
    }
  }

  /** 进度条标题、球体标题：简短显示接口 / 型号 / 内外置 */
  function updateMagSlotTitles() {
    for (let i = 0; i < MAG_SLOTS; i += 1) {
      const s = readSlot(i);
      const place = s.placementZh != null ? s.placementZh : "未标内外置";
      const cap = !s.hasDev
        ? `罗盘 ${i + 1}（未挂载）`
        : `罗盘 ${i + 1} · ${s.portZh} · ${s.model} · ${place}`;
      const pt = $(`sc-mag-p-title-${i}`);
      const mc = $(`sc-mag-cap-${i}`);
      if (pt) pt.textContent = cap;
      if (mc) mc.textContent = s.hasDev ? `${cap} · 拟合` : `罗盘 ${i + 1} · 未挂载`;
    }
  }

  function buildCalSnapshot() {
    const snap = [false, false, false];
    for (let i = 0; i < MAG_SLOTS; i += 1) {
      const s = readSlot(i);
      snap[i] = !!(s.hasDev && s.useOn);
    }
    if (!snap.some(Boolean)) snap[0] = true;
    return snap;
  }

  /** 当前参数下「激活」的罗盘路数（用于进度条/球体高亮） */
  function slotActiveMask() {
    if (compass.running) return compass.calSnapshot;
    return buildCalSnapshot();
  }

  function setTitleStyle(el, on) {
    if (!el) return;
    el.classList.toggle("sc-mag-cap--on", !!on);
    el.classList.toggle("sc-mag-cap--off", !on);
  }

  function setProgressTitleStyle(el, on) {
    if (!el) return;
    el.classList.toggle("sc-mag-p-title--on", !!on);
    el.classList.toggle("sc-mag-p-title--off", !on);
  }

  function applySlotVisualMute() {
    const mask = slotActiveMask();
    for (let i = 0; i < MAG_SLOTS; i += 1) {
      const on = !!mask[i];
      const s = readSlot(i);
      const green = !!(s.hasDev && s.useOn);

      const wrap = $(`sc-sphere-wrap-${i}`);
      if (wrap) {
        wrap.classList.toggle("sc-sphere-box--muted", !on);
      }
      const pw = $(`sc-mag-progress-wrap-${i}`);
      if (pw) {
        pw.classList.toggle("sc-progress-wrap--muted", !on);
      }
      setTitleStyle($(`sc-mag-cap-${i}`), green);
      setProgressTitleStyle($(`sc-mag-p-title-${i}`), green);
      setProgressTitleStyle($(`sc-compass-use-line-${i}`), green);
    }
  }

  function refreshCompassUseCheckboxes() {
    for (let i = 0; i < MAG_SLOTS; i += 1) {
      const el = $(USE_CHECK_IDS[i]);
      if (!el) continue;
      const s = readSlot(i);
      el.checked = !!s.useOn;
    }
  }

  function refreshCompassParamUi() {
    refreshCompassUseCheckboxes();
    updateCompassUseLineSpans();
    updateMagSlotTitles();
    applySlotVisualMute();
  }

  /* ==================== 中文 TTS 语音播报 ==================== */
  function speak(text) {
    if (!window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN";
      u.rate = 1.05;
      u.pitch = 1.0;
      u.volume = 1.0;
      window.speechSynthesis.speak(u);
    } catch (e) {
      console.warn("TTS 播报失败:", e);
    }
  }

  /* ==================== 状态文本与进度 DOM 同步 ==================== */
  function updateCompassLiveLabel() {
    const el = $("sc-compass-live");
    if (!el) return;

    if (!fcConnected()) {
      el.textContent = "未连接飞控：请先连接串口后再开始罗盘校准。";
      el.style.color = "#8b95a8";
      return;
    }

    const nActive = buildCalSnapshot().filter(Boolean).length;
    if (!compass.running) {
      el.textContent = `已连接：就绪。当前参数下将有 ${nActive} 路罗盘参与在线校准（见下方 COMPASS_USE* 行）。点击「开始在线校准」下发 MAG_CAL。`;
      el.style.color = "#3b82f6";
      return;
    }

    if (!compass.haveData.some(Boolean)) {
      el.textContent = "等待飞控初始化并返回采样数据...";
      el.style.color = "#f59e0b";
    } else {
      el.textContent = "已连接：正在接收采样。ArduPilot 在拟合完成前最高显示 99%（内置罗盘更慢）；达到 SUCCESS 后为 100%。已启用飞控自动保存；若某路长时间停在 99%，约 20 秒将自动/可手动「接受未确认罗盘」。";
      el.style.color = "#10b981";
    }
  }

  function syncCompassProgressDom() {
    for (let i = 0; i < MAG_SLOTS; i += 1) {
      const bar = $(BAR_IDS[i]);
      const label = $(LABEL_IDS[i]);
      const samples = $(SAMPLE_IDS[i]);
      const pct = compass.fcSuccess[i] ? 100 : compass.progress[i];
      if (bar) bar.style.width = `${pct}%`;

      const active = slotActiveMask()[i];
      let suffix;
      if (!active && !compass.running) suffix = "（本路未参与）";
      else if (!active && compass.running) suffix = "（未参与本次校准）";
      else suffix = "";

      let q;
      const st = compass.lastCalStatus[i];
      if (compass.fcSuccess[i]) q = "已完成";
      else if (pct >= 99 && compass.running && active) {
        q = st === MAG_CAL_RUNNING_STEP_TWO
          ? "飞控拟合中（内置罗盘较慢）…"
          : "等待飞控确认…";
      }       else if (pct >= 90 && st === MAG_CAL_RUNNING_STEP_TWO) q = "二阶段采样/拟合中";
      else if (pct >= 70) q = "数据采集中";
      else if (pct > 0) q = "数据采集中";
      else q = "等待旋转";
      const cov = compass.coverageBits[i];
      const covHint = cov > 0 && compass.running && active && !compass.fcSuccess[i]
        ? ` · 方向覆盖约 ${Math.round((cov / COMPLETION_MASK_BITS) * 100)}%`
        : "";
      if (label) label.textContent = `${Math.round(pct)}% (${q})${covHint}${suffix}`;
      if (samples) samples.textContent = `采样点: ${compass.pts[i].length}`;
    }
  }

  function updateFitnessLabels() {
    for (let idx = 0; idx < MAG_SLOTS; idx += 1) {
      const el = $(FIT_IDS[idx]);
      if (!el) continue;
      const v = compass.fitness[idx];
      if (typeof v === "number" && Number.isFinite(v) && v < 90) {
        el.textContent = v.toFixed(2);
        el.className = v < 1.5 ? "sc-fit-excellent" : v <= 3 ? "sc-fit-good" : "sc-fit-poor";
      } else {
        el.textContent = "—";
        el.className = "sc-fit-poor";
      }
    }
  }

  /* ==================== MAVLink 事件接收（唯一的真实数据源）==================== */

  function syncSamplesToProgress(arr, idx, pct) {
    const target = Math.max(0, Math.min(400, Math.floor(pct * 4)));
    if (arr.length === target) return;

    if (arr.length > target) {
      arr.length = target;
      return;
    }

    const PHI = (1 + Math.sqrt(5)) / 2;
    const baseHue = HUE_BASE[idx % MAG_SLOTS];

    for (let i = arr.length; i < target; i++) {
      const t = (i + 0.5) / 400;
      const y = 1 - 2 * t;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = 2 * Math.PI * (i / PHI);
      arr.push({
        x: r * Math.cos(theta),
        y,
        z: r * Math.sin(theta),
        hue: baseHue + Math.random() * 28,
        isNew: true,
        age: 0
      });
    }
  }

  function countCompletionMaskBits(maskBytes) {
    if (!maskBytes || !maskBytes.length) return 0;
    let n = 0;
    for (let i = 0; i < maskBytes.length; i += 1) {
      let b = maskBytes[i] & 0xff;
      while (b) {
        n += b & 1;
        b >>= 1;
      }
    }
    return n;
  }

  async function requestMagCalStreamRates() {
    if (typeof window.sendCommandLong !== "function") return;
    const pairs = [
      [MAG_CAL_PROGRESS_MSG_ID, 5],
      [MAG_CAL_REPORT_MSG_ID, 2],
    ];
    for (const [msgId, hz] of pairs) {
      try {
        await window.sendCommandLong(511, msgId, Math.round(1e6 / hz), 0, 0, 0, 0, 0, 0);
      } catch (e) { /* ignore */ }
    }
    slog(`[MAG_CAL] 已请求 msg191/192 流率 ${pairs.map((p) => p[1] + "Hz").join(", ")}`);
  }

  function noteProgressStall(idx, pct) {
    if (!compass.running || compass.fcSuccess[idx]) return;
    const active = slotActiveMask()[idx];
    if (!active || pct < 85) return;
    const now = Date.now();
    const prevPct = compass.lastProgressPct[idx];
    const prevMs = compass.lastProgressMs[idx];
    if (pct > prevPct) {
      compass.lastProgressMs[idx] = now;
      compass.lastProgressPct[idx] = pct;
      compass.progressStallWarned[idx] = false;
      return;
    }
    if (!prevMs || now - prevMs < PROGRESS_STALL_MS || compass.progressStallWarned[idx]) return;
    compass.progressStallWarned[idx] = true;
    const covPct = Math.round((compass.coverageBits[idx] / COMPLETION_MASK_BITS) * 100);
    const toast = $("sc-compass-toast");
    if (toast) {
      toast.textContent = `罗盘 ${idx + 1} 进度停在 ${Math.round(pct)}%：飞控仍在等待更多姿态（方向覆盖约 ${covPct}%）。请继续缓慢翻转/绕 8 字，远离金属；内置 RM3100 比外置慢。若长期不动可暂时只校内置罗盘（取消 COMPASS_USE2）。`;
      toast.className = "sc-toast sc-toast--idle";
      toast.style.color = "#f59e0b";
    }
    slog(`[MAG_CAL] 罗盘 ${idx + 1} 进度停滞 ${pct}% ≥${PROGRESS_STALL_MS / 1000}s，coverage≈${covPct}%`);
  }

  function buildActiveMagMask() {
    let mask = 0;
    for (let i = 0; i < MAG_SLOTS; i += 1) {
      if (compass.calSnapshot[i]) mask |= 1 << i;
    }
    return mask || 0;
  }

  function fireAcceptMagCalForCompass(compassIdx, useAllMask) {
    if (!fcConnected() || typeof window.sendCommandLong !== "function") return;
    if (!useAllMask && compass.magAcceptSent.has(compassIdx)) return;
    if (!useAllMask) compass.magAcceptSent.add(compassIdx);
    const mask = useAllMask ? 0 : (1 << compassIdx);
    window.sendCommandLong(MAV_CMD_DO_ACCEPT_MAG_CAL, mask, 0, 0, 0, 0, 0, 0)
      .then(() => slog(`[MAG_CAL] 已下发 MAV_CMD_DO_ACCEPT_MAG_CAL（param1=${useAllMask ? "0(全部)" : `位掩码=${mask}`}）`))
      .catch(e => {
        if (!useAllMask) compass.magAcceptSent.delete(compassIdx);
        slog(`[MAG_CAL] ACCEPT 下发失败: ${e?.message || e}`);
      });
  }

  function acceptStuckCompassesNow(reasonZh) {
    const pending = [];
    for (let i = 0; i < MAG_SLOTS; i += 1) {
      if (!compass.calSnapshot[i] || compass.fcSuccess[i]) continue;
      if (compass.progress[i] >= 99 || compass.reached99[i]) pending.push(i);
    }
    if (!pending.length) return false;
    pending.forEach((i) => {
      if (!compass.magAcceptSent.has(i)) fireAcceptMagCalForCompass(i);
      compass.fcSuccess[i] = true;
      compass.stuck99Since[i] = 0;
      compass.reached99[i] = false;
    });
    const toast = $("sc-compass-toast");
    if (toast) {
      toast.textContent = `${reasonZh}（罗盘 ${pending.map((i) => i + 1).join("、")}）`;
      toast.className = "sc-toast sc-toast--ok";
      toast.style.color = "";
    }
    syncCompassProgressDom();
    updateFitnessLabels();
    return true;
  }

  function checkStuck99Compasses() {
    if (!compass.running) return;
    const targets = [];
    for (let i = 0; i < MAG_SLOTS; i += 1) {
      if (compass.calSnapshot[i]) targets.push(i);
    }
    const now = Date.now();
    const anySuccess = targets.some((i) => compass.fcSuccess[i]);
    for (const i of targets) {
      if (compass.fcSuccess[i]) continue;
      const waiting = compass.reached99[i] || compass.progress[i] >= 99;
      if (!waiting) continue;
      if (!compass.stuck99Since[i]) compass.stuck99Since[i] = now;
      const elapsed = now - compass.stuck99Since[i];
      if (elapsed >= STUCK_99_WARN_MS && !compass.stuck99Warned[i]) {
        compass.stuck99Warned[i] = true;
        const toast = $("sc-compass-toast");
        if (toast) {
          toast.textContent = `罗盘 ${i + 1} 正在最后拟合（ArduPilot 在 SUCCESS 前最高显示 99%）。内置 RM3100 更慢，请继续缓慢旋转；约 ${Math.round(STUCK_99_ACCEPT_MS / 1000)} 秒后将自动尝试接受校准。`;
          toast.className = "sc-toast sc-toast--idle";
          toast.style.color = "#f59e0b";
        }
        slog(`[MAG_CAL] 罗盘 ${i + 1} 停留 99% ${Math.round(elapsed / 1000)}s，cal_status=${compass.lastCalStatus[i]}`);
      }
      const acceptAfter = anySuccess && elapsed >= 8000 ? 8000 : STUCK_99_ACCEPT_MS;
      if (elapsed >= acceptAfter) {
        fireAcceptMagCalForCompass(i);
        compass.fcSuccess[i] = true;
        compass.stuck99Since[i] = 0;
        const toast = $("sc-compass-toast");
        if (toast) {
          toast.textContent = `罗盘 ${i + 1}：已自动发送「接受校准」。请重启飞控并在参数页确认 COMPASS_OFS* 已更新；若无法解锁，请放宽 COMPASS_CAL_FIT 后单独重校内置罗盘。`;
          toast.className = "sc-toast sc-toast--ok";
          toast.style.color = "";
        }
        speak(`罗盘 ${i + 1} 已自动接受校准`);
        syncCompassProgressDom();
        updateFitnessLabels();
      }
    }
    const fcDone = targets.length > 0 && targets.every((i) => compass.fcSuccess[i]);
    if (fcDone && compass.running) {
      compass.running = false;
      cancelAnimationFrame(compass.raf);
      if (compass.stuckTimer) {
        clearInterval(compass.stuckTimer);
        compass.stuckTimer = 0;
      }
      const toast = $("sc-compass-toast");
      if (toast) {
        toast.textContent = "全部参与校准的罗盘已处理完成。请重启飞控使磁力计参数生效。";
        toast.className = "sc-toast sc-toast--ok";
        toast.style.color = "";
      }
      updateCompassLiveLabel();
      applySlotVisualMute();
    }
  }

  /**
   * 处理单路罗盘校准终态（成功 / 失败）。
   * @param {number|undefined} autosaved 仅来自 MAG_CAL_REPORT：1=飞控已写入参数；0=需发 MAV_CMD_DO_ACCEPT_MAG_CAL。
   * @param {boolean} fromReport 为 true 时才根据 autosaved 下发 ACCEPT（避免仅 progress 包误发）。
   */
  function applyMagCalTerminal(idx, status, fit, autosaved, fromReport) {
    if (!compass.running) return;
    const display = idx + 1;
    const toast = $("sc-compass-toast");

    if (Number.isFinite(fit)) compass.fitness[idx] = fit;

    if (status === MAG_CAL_SUCCESS) {
      const firstOk = !compass.fcSuccess[idx];
      compass.fcSuccess[idx] = true;
      let persistZh;
      if (fromReport && Number.isFinite(Number(autosaved))) {
        const a = Number(autosaved);
        if (a === 0) {
          fireAcceptMagCalForCompass(idx);
          persistZh = "已向飞控发送「接受校准」(MAV_CMD_DO_ACCEPT_MAG_CAL)，偏差系数会写入飞控存储；建议随后重启飞控再解锁。";
        } else {
          persistZh = "飞控回报本路已自动保存校准结果（autosaved=1），无需再发接受指令。";
        }
      } else {
        fireAcceptMagCalForCompass(idx);
        persistZh = "飞控回报拟合成功，已发送「接受校准」；若长时间无 MAG_CAL_REPORT，属正常，请稍候或查看飞控文本消息。";
      }
      compass.stuck99Since[idx] = 0;
      compass.stuck99Warned[idx] = false;
      if (toast) {
        toast.textContent = `罗盘 ${display} 校准成功。Fitness: ${Number.isFinite(fit) ? fit.toFixed(2) : "—"}。${persistZh}`;
        toast.className = "sc-toast sc-toast--ok";
        toast.style.color = "";
      }
      if (firstOk) speak(`罗盘 ${display} 校准成功`);
    } else if (status === MAG_CAL_FAILED) {
      compass.fcFailed[idx] = true;
      if (toast) {
        toast.textContent = `罗盘 ${display} 校准失败，请远离磁干扰后重试`;
        toast.className = "sc-toast sc-toast--idle";
        toast.style.color = "#ef4444";
      }
      speak(`罗盘 ${display} 校准失败，请远离磁干扰重试`);
      compass.running = false;
      compass.fcMode = false;
      cancelAnimationFrame(compass.raf);
      updateCompassLiveLabel();
      applySlotVisualMute();
    }

    updateFitnessLabels();
    syncCompassProgressDom();
  }

  function onMagProgress(ev) {
    if (!compass.running) return;

    const d = ev.detail || {};
    const id = Number(d.compass_id);
    const idx = id >= 0 && id < MAG_SLOTS ? id : 0;
    const rawPct = Number(d.completion_pct);
    const pct = clamp(Number.isFinite(rawPct) ? rawPct : 0, 0, 100);
    const calStatus = Number(d.cal_status);

    if (!compass.haveData[idx]) {
      slog(`[MAG_CAL] 首次 progress compass_id=${id} → 面板 ${idx + 1} (pct=${pct}, cal_status=${calStatus})`);
    }
    if (calStatus === MAG_CAL_SUCCESS || calStatus === MAG_CAL_FAILED) {
      slog(`[MAG_CAL] progress 终态 compass_id=${id} status=${calStatus} pct=${pct}`);
    }

    compass.fcMode = true;
    compass.haveData[idx] = true;
    if (pct >= compass.progress[idx]) compass.progress[idx] = pct;
    if (Number.isFinite(calStatus)) compass.lastCalStatus[idx] = calStatus;
    if (Array.isArray(d.completion_mask) && d.completion_mask.length) {
      compass.coverageBits[idx] = countCompletionMaskBits(d.completion_mask);
    }
    if (pct > compass.lastProgressPct[idx]) {
      compass.lastProgressMs[idx] = Date.now();
      compass.lastProgressPct[idx] = pct;
    } else if (!compass.lastProgressMs[idx]) {
      compass.lastProgressMs[idx] = Date.now();
      compass.lastProgressPct[idx] = pct;
    }
    noteProgressStall(idx, pct);

    const active = slotActiveMask()[idx];
    if (pct >= 99 && active && !compass.fcSuccess[idx]) {
      compass.reached99[idx] = true;
      if (!compass.stuck99Since[idx]) compass.stuck99Since[idx] = Date.now();
    } else if (compass.fcSuccess[idx]) {
      compass.stuck99Since[idx] = 0;
      compass.stuck99Warned[idx] = false;
      compass.reached99[idx] = false;
    }

    const arr = compass.pts[idx];
    const dx = Number(d.direction_x);
    const dy = Number(d.direction_y);
    const dz = Number(d.direction_z);
    const mag = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (Number.isFinite(mag) && mag > 0.3 && mag < 3.0) {
      const inv = 1 / mag;
      arr.push({
        x: dx * inv,
        y: dy * inv,
        z: dz * inv,
        hue: HUE_BASE[idx] + Math.random() * 28,
        isNew: true,
        age: 0
      });
      while (arr.length > 600) arr.shift();
    } else {
      syncSamplesToProgress(arr, idx, pct);
    }

    if (calStatus === MAG_CAL_SUCCESS || calStatus === MAG_CAL_FAILED) {
      applyMagCalTerminal(idx, calStatus, Number.NaN, undefined, false);
    }

    syncCompassProgressDom();
    updateCompassLiveLabel();
  }

  function onMagReport(ev) {
    if (!compass.running) return;

    const d = ev.detail || {};
    const id = Number(d.compass_id);
    const idx = id >= 0 && id < MAG_SLOTS ? id : 0;
    const fit = Number(d.fitness);
    const status = Number(d.cal_status);
    const autosaved = d.autosaved;
    slog(`[MAG_CAL] REPORT compass_id=${id} → 面板 ${idx + 1} status=${status} fitness=${fit} autosaved=${autosaved}`);

    applyMagCalTerminal(idx, status, fit, autosaved, true);
  }

  /* ==================== 3D 投影 & 球体渲染 ==================== */
  function project3D(x, y, z, cx, cy, r3d, angle) {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const x1 = x * cosA - z * sinA;
    const y1 = y;
    const z1 = x * sinA + z * cosA;

    const tilt = 0.35;
    const px = x1 * Math.cos(tilt) - z1 * Math.sin(tilt);
    const py = y1;
    const pz = x1 * Math.sin(tilt) + z1 * Math.cos(tilt);

    const scale = (pz + 2.5) / 3.5;
    return { sx: cx + px * r3d * scale, sy: cy - py * r3d * scale, depth: pz };
  }

  function drawMagSphere(canvasId, points, fitness) {
    const canvas = $(canvasId);
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.38;

    ctx.clearRect(0, 0, w, h);

    ctx.lineWidth = 1;

    const latSteps = 6;
    for (let i = 0; i <= latSteps; i++) {
      const lat = Math.PI * (i / latSteps - 0.5);
      const sinLat = Math.sin(lat);
      const cosLat = Math.cos(lat);
      ctx.beginPath();
      ctx.strokeStyle = "rgba(59, 130, 246, 0.18)";
      let first = true;
      for (let theta = 0; theta <= Math.PI * 2 + 0.01; theta += 0.12) {
        const x = cosLat * Math.cos(theta);
        const y = sinLat;
        const z = cosLat * Math.sin(theta);
        const pt = project3D(x, y, z, cx, cy, R, compass.sphereRot);
        if (first) { ctx.moveTo(pt.sx, pt.sy); first = false; }
        else ctx.lineTo(pt.sx, pt.sy);
      }
      ctx.stroke();
    }

    const lonSteps = 8;
    for (let j = 0; j < lonSteps; j++) {
      const lon = (j / lonSteps) * Math.PI * 2;
      ctx.beginPath();
      ctx.strokeStyle = "rgba(59, 130, 246, 0.10)";
      let first = true;
      for (let phi = -Math.PI / 2; phi <= Math.PI / 2 + 0.01; phi += 0.12) {
        const x = Math.cos(phi) * Math.cos(lon);
        const y = Math.sin(phi);
        const z = Math.cos(phi) * Math.sin(lon);
        const pt = project3D(x, y, z, cx, cy, R, compass.sphereRot);
        if (first) { ctx.moveTo(pt.sx, pt.sy); first = false; }
        else ctx.lineTo(pt.sx, pt.sy);
      }
      ctx.stroke();
    }

    const grad = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.06);
    grad.addColorStop(0, "rgba(59, 130, 246, 0.0)");
    grad.addColorStop(0.7, "rgba(59, 130, 246, 0.05)");
    grad.addColorStop(1, "rgba(59, 130, 246, 0.20)");
    ctx.beginPath();
    ctx.fillStyle = grad;
    ctx.arc(cx, cy, R * 1.06, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = "rgba(16, 185, 129, 0.55)";
    ctx.lineWidth = 1.2;
    ctx.shadowColor = "rgba(16, 185, 129, 0.85)";
    ctx.shadowBlur = 6;
    ctx.setLineDash([4, 4]);
    const topPt = project3D(0, 1.2, 0, cx, cy, R, compass.sphereRot);
    const btmPt = project3D(0, -1.2, 0, cx, cy, R, compass.sphereRot);
    ctx.moveTo(topPt.sx, topPt.sy);
    ctx.lineTo(btmPt.sx, btmPt.sy);
    ctx.stroke();
    ctx.restore();

    if (!points.length) {
      ctx.font = "11px JetBrains Mono, monospace";
      ctx.fillStyle = "#64748b";
      ctx.fillText("等待飞控采样数据...", 12, h - 12);
      return;
    }

    const projected = points.map(p => {
      const pr = project3D(p.x, p.y, p.z, cx, cy, R, compass.sphereRot);
      return { p, sx: pr.sx, sy: pr.sy, depth: pr.depth };
    }).sort((a, b) => a.depth - b.depth);

    projected.forEach(({ p, sx, sy, depth }) => {
      const t = (depth + 1.0) / 2.0;
      const alpha = clamp(0.18 + 0.82 * t, 0.15, 1.0);
      const size = 1.6 + 2.8 * t;

      ctx.fillStyle = `hsla(${p.hue}, 90%, 60%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, Math.PI * 2);
      ctx.fill();

      if (p.isNew && p.age < 15) {
        const haloAlpha = (15 - p.age) / 15 * 0.85;
        ctx.strokeStyle = `rgba(255, 255, 255, ${haloAlpha})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(sx, sy, size + p.age * 0.85, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    let fitLabel = "收敛中";
    if (fitness < 1.5) fitLabel = "优质";
    else if (fitness <= 3) fitLabel = "良好";
    else if (fitness < 90) fitLabel = "偏差较大";
    const fitStr = fitness < 90 ? fitness.toFixed(2) : "—";
    ctx.font = "11px JetBrains Mono, monospace";
    ctx.fillStyle = "#8b95a8";
    ctx.fillText(`Fitness: ${fitStr} (${fitLabel})`, 12, h - 12);
  }

  function magTick() {
    if (!compass.running) return;

    compass.sphereRot += 0.0035;

    for (const arr of compass.pts) {
      for (const p of arr) {
        if (p.isNew && p.age < 30) p.age++;
      }
    }

    for (let i = 0; i < MAG_SLOTS; i += 1) {
      drawMagSphere(CANVAS_IDS[i], compass.pts[i], compass.fitness[i]);
    }

    checkStuck99Compasses();
    if (!compass.running) return;

    compass.raf = requestAnimationFrame(magTick);
  }

  function resetCompassState() {
    for (let i = 0; i < MAG_SLOTS; i += 1) {
      compass.pts[i] = [];
      compass.progress[i] = 0;
      compass.fitness[i] = 99;
      compass.fcSuccess[i] = false;
      compass.haveData[i] = false;
      compass.fcFailed[i] = false;
    }
    compass.magAcceptSent.clear();
    compass.stuck99Since = [0, 0, 0];
    compass.stuck99Warned = [false, false, false];
    compass.reached99 = [false, false, false];
    compass.lastCalStatus = [0, 0, 0];
    compass.lastProgressMs = [0, 0, 0];
    compass.lastProgressPct = [0, 0, 0];
    compass.coverageBits = [0, 0, 0];
    compass.progressStallWarned = [false, false, false];
    if (compass.stuckTimer) {
      clearInterval(compass.stuckTimer);
      compass.stuckTimer = 0;
    }
  }

  function bindCompassUseToggles() {
    USE_CHECK_IDS.forEach((cid, slot) => {
      const input = $(cid);
      if (!input) return;
      input.addEventListener("change", async () => {
        const toast = $("sc-compass-toast");
        const key = SLOT_PARAM[slot].useKey;
        const v = input.checked ? 1 : 0;
        if (typeof window.sendParamSet !== "function" || !fcConnected()) {
          if (toast) {
            toast.textContent = "无法写入：未连接或 sendParamSet 不可用";
            toast.style.color = "#ef4444";
          }
          refreshCompassUseCheckboxes();
          return;
        }
        try {
          const ok = await window.sendParamSet(key, v);
          if (!ok) throw new Error("sendParamSet 返回 false");
          if (toast) {
            toast.textContent = `已请求写入 ${key}=${v}，请等待飞控回传参数确认`;
            toast.className = "sc-toast sc-toast--idle";
            toast.style.color = "";
          }
        } catch (e) {
          if (toast) {
            toast.textContent = `写入 ${key} 失败：${e?.message || e}`;
            toast.style.color = "#ef4444";
          }
          refreshCompassUseCheckboxes();
        }
      });
    });
  }

  function bindCompass() {
    $("sc-compass-start")?.addEventListener("click", async () => {
      const toast = $("sc-compass-toast");

      if (!fcConnected()) {
        if (toast) {
          toast.textContent = "未连接飞控，请先连接串口后再开始罗盘校准";
          toast.className = "sc-toast sc-toast--idle";
          toast.style.color = "#ef4444";
        }
        speak("未连接飞控，无法开始罗盘校准");
        updateCompassLiveLabel();
        return;
      }

      resetCompassState();
      compass.calSnapshot = buildCalSnapshot();
      compass.running = true;
      compass.fcMode = true;

      if (toast) {
        toast.textContent = "";
        toast.className = "sc-toast sc-toast--idle";
        toast.style.color = "";
      }

      refreshCompassParamUi();
      updateCompassLiveLabel();
      syncCompassProgressDom();
      updateFitnessLabels();

      for (let i = 0; i < MAG_SLOTS; i += 1) {
        drawMagSphere(CANVAS_IDS[i], [], 99);
      }

      cancelAnimationFrame(compass.raf);
      compass.raf = requestAnimationFrame(magTick);

      if (typeof window.sendCommandLong !== "function") {
        slog("window.sendCommandLong 不可用，无法下发 MAG_CAL 指令");
        if (toast) {
          toast.textContent = "底层 sendCommandLong 接口缺失，无法下发指令";
          toast.style.color = "#ef4444";
        }
        compass.running = false;
        cancelAnimationFrame(compass.raf);
        return;
      }

      try {
        const calMask = buildActiveMagMask();
        await window.sendCommandLong(
          MAV_CMD_DO_START_MAG_CAL,
          calMask,
          1,
          1,
          0,
          0, 0, 0
        );
        slog(`已下发 MAV_CMD_DO_START_MAG_CAL mask=${calMask} autosave=1 retry=1；参与: ${JSON.stringify(compass.calSnapshot)}`);
        await requestMagCalStreamRates();
        if (!compass.stuckTimer) {
          compass.stuckTimer = setInterval(() => checkStuck99Compasses(), 2000);
        }
        speak("罗盘校准启动，请开始无规则旋转飞机");

        setTimeout(() => {
          if (!compass.running) return;
          const missing = [];
          for (let i = 0; i < MAG_SLOTS; i += 1) {
            if (compass.calSnapshot[i] && !compass.haveData[i]) missing.push(i + 1);
          }
          if (missing.length) {
            slog(`[MAG_CAL] 8s 内仍无 progress 的罗盘序号: ${missing.join(",")}（请核对 COMPASS_USE* / DEV_ID*）`);
            const t = $("sc-compass-toast");
            if (t && !t.textContent) {
              t.textContent = `以下罗盘尚未收到采样进度：${missing.join("、")} 号。请确认对应 COMPASS_USE*=1 且 COMPASS_DEV_ID*≠0，必要时重启后再试。`;
              t.className = "sc-toast sc-toast--idle";
              t.style.color = "#f59e0b";
            }
          }
        }, 8000);
      } catch (e) {
        slog(`启动飞控校准失败: ${e?.message || e}`);
        if (toast) {
          toast.textContent = `下发指令失败：${e?.message || e}`;
          toast.className = "sc-toast sc-toast--idle";
          toast.style.color = "#ef4444";
        }
        compass.running = false;
        compass.fcMode = false;
        cancelAnimationFrame(compass.raf);
        updateCompassLiveLabel();
      }
    });

    $("sc-compass-accept-stuck")?.addEventListener("click", () => {
      if (!fcConnected()) {
        const toast = $("sc-compass-toast");
        if (toast) {
          toast.textContent = "未连接飞控，无法发送接受校准";
          toast.style.color = "#ef4444";
        }
        return;
      }
      const ok = acceptStuckCompassesNow("已手动向飞控发送「接受校准」");
      if (!ok) {
        const toast = $("sc-compass-toast");
        if (toast) {
          toast.textContent = "当前没有停在 99% 等待确认的罗盘";
          toast.style.color = "#f59e0b";
        }
      }
    });

    $("sc-compass-reset")?.addEventListener("click", async () => {
      if (compass.running && fcConnected() && typeof window.sendCommandLong === "function") {
        try {
          await window.sendCommandLong(MAV_CMD_DO_CANCEL_MAG_CAL, 0, 0, 0, 0, 0, 0, 0);
          slog("已下发取消罗盘校准命令");
        } catch (e) { /* ignore */ }
      }
      compass.running = false;
      compass.fcMode = false;
      cancelAnimationFrame(compass.raf);
      resetCompassState();

      syncCompassProgressDom();
      updateFitnessLabels();

      for (let i = 0; i < MAG_SLOTS; i += 1) {
        drawMagSphere(CANVAS_IDS[i], [], 99);
      }

      const toast = $("sc-compass-toast");
      if (toast) {
        toast.textContent = "";
        toast.className = "sc-toast sc-toast--idle";
        toast.style.color = "";
      }
      updateCompassLiveLabel();
      refreshCompassParamUi();
    });
  }

  function boot() {
    const events = [
      { name: "gcs-connection", handler: () => { refreshCompassParamUi(); updateCompassLiveLabel(); } },
      { name: "gcs-mag-cal-progress", handler: onMagProgress },
      { name: "gcs-mag-cal-report", handler: onMagReport },
      { name: "gcs-sensor-overview-changed", handler: () => { refreshCompassParamUi(); syncCompassProgressDom(); updateCompassLiveLabel(); } }
    ];
    events.forEach(ev => {
      document.removeEventListener(ev.name, ev.handler);
      window.removeEventListener(ev.name, ev.handler);
      document.addEventListener(ev.name, ev.handler);
      window.addEventListener(ev.name, ev.handler);
    });

    bindCompass();
    bindCompassUseToggles();

    for (let i = 0; i < MAG_SLOTS; i += 1) {
      drawMagSphere(CANVAS_IDS[i], [], 99);
    }
    syncCompassProgressDom();
    updateFitnessLabels();
    refreshCompassParamUi();
    updateCompassLiveLabel();

    window.sensorCalibCompassUpdateLive = () => {
      updateCompassLiveLabel();
      refreshCompassParamUi();
    };
    window.sensorCalibRefreshCompassCanvas = () => {
      requestAnimationFrame(() => {
        for (let i = 0; i < MAG_SLOTS; i += 1) {
          drawMagSphere(CANVAS_IDS[i], compass.pts[i], compass.fitness[i]);
        }
      });
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
