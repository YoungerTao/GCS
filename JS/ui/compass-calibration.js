(function initCompassCalibration() {
  const MAV_CMD_DO_START_MAG_CAL = 42424;
  const MAV_CMD_DO_CANCEL_MAG_CAL = 42426;
  const MAG_CAL_SUCCESS = 4;
  const MAG_CAL_FAILED = 5;

  /**
   * 罗盘校准全局状态
   *  - p1/p2          : 已确认入库的采样点（仅在收到飞控真实 progress 包后追加）
   *  - progress       : 飞控返回的真实完成度（0-100）
   *  - fcMode         : 一旦点击在线校准并检测到飞控连接，强制锁定为 true
   *  - haveData       : 是否已经至少收到过一次 progress 包
   *  - sphereRot      : 3D 球体经纬网格的累计自转角度
   */
  const compass = {
    running: false,
    raf: 0,
    p1: [],
    p2: [],
    progress: [0, 0],
    fitness: [99, 99],
    fcMode: false,
    fcSuccess: [false, false],
    seenSecondMag: false,
    haveData: [false, false],
    sphereRot: 0
  };

  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function fcConnected() { return !!window.writer; }

  function slog(msg) {
    if (typeof window.log === "function") window.log(msg);
    else console.log(msg);
  }

  /* ==================== 中文 TTS 语音播报 ==================== */
  function speak(text) {
    if (!window.speechSynthesis) return;
    try {
      // 强制中断之前的语音队列，避免堆积造成延迟
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

    if (!compass.running) {
      el.textContent = "已连接：就绪。点击「开始在线校准」将向飞控下发 MAG_CAL 指令。";
      el.style.color = "#3b82f6";
      return;
    }

    if (!compass.haveData[0] && !compass.haveData[1]) {
      // 飞控已连接、指令已下发、但还未收到任何 progress 包
      el.textContent = "等待飞控初始化并返回采样数据...";
      el.style.color = "#f59e0b";
    } else {
      el.textContent = "已连接：正在接收真实 MAVLink 采样。请继续无规则旋转飞机各个轴向！";
      el.style.color = "#10b981";
    }
  }

  function syncCompassProgressDom() {
    const el1 = $("sc-mag-p1-bar");
    const el2 = $("sc-mag-p2-bar");
    if (el1) el1.style.width = `${compass.progress[0]}%`;
    if (el2) el2.style.width = `${compass.progress[1]}%`;

    const q1 = compass.progress[0] >= 95 ? "优质" : compass.progress[0] > 0 ? "数据采集中" : "等待旋转";
    const q2 = compass.progress[1] >= 95 ? "优质" : compass.progress[1] > 0 ? "数据采集中" : "等待旋转";

    const l1 = $("sc-mag-p1-label");
    const l2 = $("sc-mag-p2-label");
    if (l1) l1.textContent = `${Math.round(compass.progress[0])}% (${q1})`;
    if (l2) l2.textContent = `${Math.round(compass.progress[1])}% (${q2})`;

    const s1 = $("sc-mag-samples-1");
    const s2 = $("sc-mag-samples-2");
    if (s1) s1.textContent = `采样点: ${compass.p1.length}`;
    if (s2) s2.textContent = `采样点: ${compass.p2.length}`;
  }

  function updateFitnessLabels() {
    const els = [$("sc-fit-1"), $("sc-fit-2")];
    els.forEach((el, idx) => {
      if (!el) return;
      const v = compass.fitness[idx];
      if (typeof v === "number" && Number.isFinite(v) && v < 90) {
        el.textContent = v.toFixed(2);
        el.className = v < 1.5 ? "sc-fit-excellent" : v <= 3 ? "sc-fit-good" : "sc-fit-poor";
      } else {
        el.textContent = "—";
        el.className = "sc-fit-poor";
      }
    });
  }

  /* ==================== MAVLink 事件接收（唯一的真实数据源）==================== */

  /**
   * 把采样点数组同步到由飞控 completion_pct 决定的目标长度。
   *
   * 采用黄金比例 Fibonacci 球面螺旋分布，确保采样点在球面上「均匀填充」、
   * 与飞控的真实 0~100% 完成度严格对应。**不会**在没有 progress 数据时
   * 自行刷点，也不会自行平滑增长。
   */
  function syncSamplesToProgress(arr, idx, pct) {
    const target = Math.max(0, Math.min(400, Math.floor(pct * 4)));
    if (arr.length === target) return;

    if (arr.length > target) {
      arr.length = target; // 极少出现的回退场景（如 reset）
      return;
    }

    const PHI = (1 + Math.sqrt(5)) / 2;
    const baseHue = idx === 0 ? 200 : 160;

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

  function onMagProgress(ev) {
    if (!compass.running) return;

    const d = ev.detail || {};
    const id = Number(d.compass_id);
    const idx = id === 0 ? 0 : 1;
    const rawPct = Number(d.completion_pct);
    const pct = clamp(Number.isFinite(rawPct) ? rawPct : 0, 0, 100);

    // 首次收到某个 compass_id 时输出诊断日志，方便排查"罗盘 2 不动"等问题
    if (!compass.haveData[idx]) {
      slog(`[MAG_CAL] 首次收到 compass_id=${id} 的 progress 包 → 渲染到面板 ${idx + 1} (pct=${pct})`);
    }

    compass.fcMode = true;            // 收到真实数据 → 永远锁定为飞控模式
    compass.haveData[idx] = true;
    if (id !== 0) compass.seenSecondMag = true;

    compass.progress[idx] = pct;

    // 如果飞控提供了真实的本帧采样方向 (direction_x/y/z)，则按真实方向落点；
    // 否则回退到 Fibonacci 球面均匀填充以匹配 completion_pct。
    const arr = idx === 0 ? compass.p1 : compass.p2;
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
        hue: (idx === 0 ? 200 : 160) + Math.random() * 28,
        isNew: true,
        age: 0
      });
      while (arr.length > 600) arr.shift();
    } else {
      syncSamplesToProgress(arr, idx, pct);
    }

    syncCompassProgressDom();
    updateCompassLiveLabel();
  }

  function onMagReport(ev) {
    if (!compass.running) return;

    const d = ev.detail || {};
    const id = Number(d.compass_id);
    const idx = id === 0 ? 0 : 1;
    const fit = Number(d.fitness);
    const status = Number(d.cal_status);

    if (Number.isFinite(fit)) compass.fitness[idx] = fit;

    const toast = $("sc-compass-toast");
    const display = id + 1; // UI 与播报均使用 1-indexed 编号

    if (status === MAG_CAL_SUCCESS) {
      compass.fcSuccess[idx] = true;
      if (toast) {
        toast.textContent = `罗盘 ${display} 校准成功! Fitness: ${Number.isFinite(fit) ? fit.toFixed(2) : "—"}`;
        toast.className = "sc-toast sc-toast--ok";
        toast.style.color = "";
      }
      speak(`罗盘 ${display} 校准成功`);
    } else if (status === MAG_CAL_FAILED) {
      if (toast) {
        toast.textContent = `罗盘 ${display} 校准失败，请远离磁干扰后重试`;
        toast.className = "sc-toast sc-toast--idle";
        toast.style.color = "#ef4444";
      }
      speak(`罗盘 ${display} 校准失败，请远离磁干扰重试`);
    }

    updateFitnessLabels();
  }

  /* ==================== 3D 投影 & 球体渲染 ==================== */

  /** 将单位球面上的 (x,y,z) 投影到 2D 屏幕坐标（含自转 + 俯视倾角 + 透视缩放） */
  function project3D(x, y, z, cx, cy, r3d, angle) {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    // 绕 Y 轴自转
    const x1 = x * cosA - z * sinA;
    const y1 = y;
    const z1 = x * sinA + z * cosA;

    // 视角向下俯视约 20°，提升立体感
    const tilt = 0.35;
    const px = x1 * Math.cos(tilt) - z1 * Math.sin(tilt);
    const py = y1;
    const pz = x1 * Math.sin(tilt) + z1 * Math.cos(tilt);

    // 简易透视：z 越靠近镜头，scale 越大 → 近大远小
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

    // (1) 经纬科技网格（随 sphereRot 自转）
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

    // (2) 球体外缘呼吸光圈
    const grad = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.06);
    grad.addColorStop(0, "rgba(59, 130, 246, 0.0)");
    grad.addColorStop(0.7, "rgba(59, 130, 246, 0.05)");
    grad.addColorStop(1, "rgba(59, 130, 246, 0.20)");
    ctx.beginPath();
    ctx.fillStyle = grad;
    ctx.arc(cx, cy, R * 1.06, 0, Math.PI * 2);
    ctx.fill();

    // (3) 中轴磁极发光虚线
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

    // (4) 采样点投影 + 深度排序（先画远处，后画近处）
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
      const t = (depth + 1.0) / 2.0;            // 0 远 → 1 近
      const alpha = clamp(0.18 + 0.82 * t, 0.15, 1.0);
      const size = 1.6 + 2.8 * t;                // 近大远小

      ctx.fillStyle = `hsla(${p.hue}, 90%, 60%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, Math.PI * 2);
      ctx.fill();

      // 最新粒子的呼吸 halo（age < 15 帧）
      if (p.isNew && p.age < 15) {
        const haloAlpha = (15 - p.age) / 15 * 0.85;
        ctx.strokeStyle = `rgba(255, 255, 255, ${haloAlpha})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(sx, sy, size + p.age * 0.85, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    // (5) Fitness 标注
    let fitLabel = "收敛中";
    if (fitness < 1.5) fitLabel = "优质";
    else if (fitness <= 3) fitLabel = "良好";
    else if (fitness < 90) fitLabel = "偏差较大";
    const fitStr = fitness < 90 ? fitness.toFixed(2) : "—";
    ctx.font = "11px JetBrains Mono, monospace";
    ctx.fillStyle = "#8b95a8";
    ctx.fillText(`Fitness: ${fitStr} (${fitLabel})`, 12, h - 12);
  }

  /* ==================== 渲染时钟（仅做视觉刷新，绝不合成数据）==================== */
  function magTick() {
    if (!compass.running) return;

    // 球体经纬网格自转
    compass.sphereRot += 0.0035;

    // 老化粒子的 halo（不会改变进度，仅用于呼吸动画）
    [compass.p1, compass.p2].forEach(arr => {
      for (const p of arr) {
        if (p.isNew && p.age < 30) p.age++;
      }
    });

    drawMagSphere("sc-mag-canvas-1", compass.p1, compass.fitness[0]);
    drawMagSphere("sc-mag-canvas-2", compass.p2, compass.fitness[1]);

    // 飞控两个罗盘均成功 → 结束
    const fcDone = compass.fcSuccess[0] && (!compass.seenSecondMag || compass.fcSuccess[1]);
    if (fcDone) {
      compass.running = false;
      cancelAnimationFrame(compass.raf);
      const toast = $("sc-compass-toast");
      if (toast) {
        toast.textContent = "罗盘校准顺利完成（飞控返回 SUCCESS，请手动写入参数）";
        toast.className = "sc-toast sc-toast--ok";
        toast.style.color = "";
      }
      updateCompassLiveLabel();
      return;
    }

    compass.raf = requestAnimationFrame(magTick);
  }

  /* ==================== 控件绑定 ==================== */
  function resetCompassState() {
    compass.p1 = [];
    compass.p2 = [];
    compass.progress = [0, 0];
    compass.fitness = [99, 99];
    compass.fcSuccess = [false, false];
    compass.seenSecondMag = false;
    compass.haveData = [false, false];
  }

  function bindCompass() {
    $("sc-compass-start")?.addEventListener("click", async () => {
      const toast = $("sc-compass-toast");

      // 飞控未连接 → 拒绝启动校准（彻底剥离任何本地模拟降级）
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
      compass.running = true;
      compass.fcMode = true; // 已连接 → 强制锁定为飞控模式

      if (toast) {
        toast.textContent = "";
        toast.className = "sc-toast sc-toast--idle";
        toast.style.color = "";
      }

      updateCompassLiveLabel();
      syncCompassProgressDom();
      updateFitnessLabels();

      drawMagSphere("sc-mag-canvas-1", [], 99);
      drawMagSphere("sc-mag-canvas-2", [], 99);

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
        // ArduPilot MAV_CMD_DO_START_MAG_CAL 参数说明：
        //   p1 = compass mask     0  → 自动校准当前已启用的物理罗盘
        //                              （255 会请求 3~8 号物理罗盘，未挂载则报错挂起）
        //   p2 = retry on failure 0  → 完整 3D 拟合（非快速估计）
        //   p3 = autosave/reboot  0  → 校准成功后由前端手动写入，避免飞控
        //                              单方面自动重启造成通信中断
        await window.sendCommandLong(
          MAV_CMD_DO_START_MAG_CAL,
          0, 0, 0,
          0, 0, 0, 0
        );
        slog("已下发 MAV_CMD_DO_START_MAG_CAL (mask=0, fit=full, autosave=0)");
        speak("罗盘校准启动，请开始无规则旋转飞机");

        // 8 秒后若仅检测到一路罗盘进度，提示用户检查飞控参数
        setTimeout(() => {
          if (!compass.running) return;
          if (compass.haveData[0] && !compass.haveData[1]) {
            slog("[MAG_CAL] 8s 内仅收到 compass_id=0 的进度包，罗盘 2 可能未启用 (COMPASS_USE2=0)");
            const t = $("sc-compass-toast");
            if (t && !t.textContent) {
              t.textContent = "仅罗盘 1 在校准。若需校准罗盘 2，请检查 FC 参数 COMPASS_USE2=1 且 COMPASS_DEV_ID2≠0，重启后重试。";
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

      drawMagSphere("sc-mag-canvas-1", [], 99);
      drawMagSphere("sc-mag-canvas-2", [], 99);

      const toast = $("sc-compass-toast");
      if (toast) {
        toast.textContent = "";
        toast.className = "sc-toast sc-toast--idle";
        toast.style.color = "";
      }
      updateCompassLiveLabel();
    });
  }

  /* ==================== 启动 ==================== */
  function boot() {
    const events = [
      { name: "gcs-connection",        handler: updateCompassLiveLabel },
      { name: "gcs-mag-cal-progress",  handler: onMagProgress },
      { name: "gcs-mag-cal-report",    handler: onMagReport }
    ];
    events.forEach(ev => {
      document.removeEventListener(ev.name, ev.handler);
      window.removeEventListener(ev.name, ev.handler);
      document.addEventListener(ev.name, ev.handler);
      window.addEventListener(ev.name, ev.handler);
    });

    bindCompass();

    // 初始空球 + 状态文本
    drawMagSphere("sc-mag-canvas-1", [], 99);
    drawMagSphere("sc-mag-canvas-2", [], 99);
    syncCompassProgressDom();
    updateFitnessLabels();
    updateCompassLiveLabel();

    // 暴露主界面 tab 切换刷新接口（保持与现有架构兼容）
    window.sensorCalibCompassUpdateLive = updateCompassLiveLabel;
    window.sensorCalibRefreshCompassCanvas = () => {
      requestAnimationFrame(() => {
        drawMagSphere("sc-mag-canvas-1", compass.p1, compass.fitness[0]);
        drawMagSphere("sc-mag-canvas-2", compass.p2, compass.fitness[1]);
      });
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
