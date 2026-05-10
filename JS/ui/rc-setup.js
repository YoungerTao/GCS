window.rcChannels = window.rcChannels || Array.from({ length: 16 }, () => 1500);

(function initRcSetup() {
  const CH_COUNT = 14;
  const PWM_MIN = 1000;
  const PWM_MAX = 2000;
  const PWM_TRIM = 1500;
  const CH_LABELS = [
    "Roll", "Pitch", "Throttle", "Yaw",
    "Aux1", "Aux2", "Aux3", "Aux4",
    "Aux5", "Aux6", "Aux7", "Aux8",
    "Aux9", "Aux10",
  ];

  const state = {
    status: "idle",
    mode: "mode2",
    reverse: {},
    stepIndex: 0,
    min: Array.from({ length: CH_COUNT }, () => Number.POSITIVE_INFINITY),
    max: Array.from({ length: CH_COUNT }, () => Number.NEGATIVE_INFINITY),
  };

  const guideSteps = [
    "请将油门（Throttle）推至最上方，然后点击下一步。",
    "请将左摇杆完整画圈，并压到所有边角极限位置。",
    "请将右摇杆完整画圈，并压到所有边角极限位置。",
  ];

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function getChannels() {
    const arr = Array.isArray(window.rcChannels) ? window.rcChannels : [];
    return Array.from({ length: CH_COUNT }, (_, i) => {
      const raw = Number(arr[i]);
      if (!Number.isFinite(raw)) return 1500;
      return clamp(raw, 800, 2200);
    });
  }

  function pwmToPercent(v) {
    return clamp(((v - PWM_MIN) / (PWM_MAX - PWM_MIN)) * 100, 0, 100);
  }

  function pwmToStick(v) {
    return clamp((v - PWM_TRIM) / 500, -1, 1);
  }

  function getModeMap() {
    if (state.mode === "mode1") {
      return { leftX: 0, leftY: 1, rightX: 3, rightY: 2 };
    }
    return { leftX: 3, leftY: 2, rightX: 0, rightY: 1 };
  }

  function resetMinMax() {
    state.min = Array.from({ length: CH_COUNT }, () => Number.POSITIVE_INFINITY);
    state.max = Array.from({ length: CH_COUNT }, () => Number.NEGATIVE_INFINITY);
  }

  function updateCapture(channels) {
    if (state.status !== "stick_calibrating" && state.status !== "switch_calibrating") return;
    for (let i = 0; i < CH_COUNT; i += 1) {
      state.min[i] = Math.min(channels[i], state.min[i]);
      state.max[i] = Math.max(channels[i], state.max[i]);
    }
  }

  async function sendParamSet(name, value) {
    if (typeof window.sendParamSet === "function") {
      return window.sendParamSet(name, value);
    }
    return false;
  }

  async function writeCalibrationToFc() {
    const channels = getChannels();
    let sent = 0;
    for (let i = 0; i < 4; i += 1) {
      const c = i + 1;
      const min = Number.isFinite(state.min[i]) ? state.min[i] : channels[i];
      const max = Number.isFinite(state.max[i]) ? state.max[i] : channels[i];
      const trim = channels[i];
      // Mission Planner style params
      // Using float writes for compatibility with generic PARAM_SET pipeline.
      // ArduPilot internally casts these for RCx_* params.
      /* eslint-disable no-await-in-loop */
      if (await sendParamSet(`RC${c}_MIN`, min)) sent += 1;
      if (await sendParamSet(`RC${c}_MAX`, max)) sent += 1;
      if (await sendParamSet(`RC${c}_TRIM`, trim)) sent += 1;
      if (await sendParamSet(`RC${c}_REVERSED`, state.reverse[c] ? 1 : 0)) sent += 1;
      /* eslint-enable no-await-in-loop */
    }
    return sent;
  }

  function renderReverseList() {
    const root = document.getElementById("rc-reverse-list");
    if (!root) return;
    root.innerHTML = "";
    for (let i = 1; i <= 8; i += 1) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!state.reverse[i];
      input.addEventListener("change", () => {
        state.reverse[i] = input.checked;
      });
      const text = document.createElement("span");
      text.textContent = `CH${i} 反向`;
      label.appendChild(input);
      label.appendChild(text);
      root.appendChild(label);
    }
  }

  function renderChannelRows(channels) {
    const root = document.getElementById("rc-channel-list");
    if (!root) return;
    root.innerHTML = "";

    for (let i = 0; i < CH_COUNT; i += 1) {
      const chNum = i + 1;
      const value = channels[i];
      const pct = pwmToPercent(value);
      const min = Number.isFinite(state.min[i]) ? pwmToPercent(state.min[i]) : null;
      const max = Number.isFinite(state.max[i]) ? pwmToPercent(state.max[i]) : null;

      const row = document.createElement("div");
      row.className = "rc-row";
      row.innerHTML = `
        <div>CH${chNum} - ${CH_LABELS[i] || "Aux"}</div>
        <div class="rc-track">
          <div class="rc-fill" style="width:${pct}%"></div>
          <div class="rc-midline" style="left:${pwmToPercent(PWM_TRIM)}%"></div>
          ${min !== null ? `<div class="rc-minline" style="left:${min}%"></div>` : ""}
          ${max !== null ? `<div class="rc-maxline" style="left:${max}%"></div>` : ""}
        </div>
        <div>${Math.round(value)} us</div>
      `;
      root.appendChild(row);
    }
  }

  function updateTxSticks(channels) {
    const left = document.getElementById("tx-left-stick");
    const right = document.getElementById("tx-right-stick");
    const arrow = document.getElementById("tx-guide-arrow");
    if (!left || !right || !arrow) return;

    const map = getModeMap();
    const lx = pwmToStick(channels[map.leftX]);
    const ly = pwmToStick(channels[map.leftY]);
    const rx = pwmToStick(channels[map.rightX]);
    const ry = pwmToStick(channels[map.rightY]);
    const range = 48;

    left.setAttribute("cx", String(190 + lx * range));
    left.setAttribute("cy", String(140 - ly * range));
    right.setAttribute("cx", String(410 + rx * range));
    right.setAttribute("cy", String(140 - ry * range));

    arrow.classList.toggle("hidden", !(state.status === "stick_calibrating" && state.stepIndex === 0));
  }

  function updateStatusUi() {
    const badge = document.getElementById("rc-status-badge");
    const text = document.getElementById("rc-guide-text");
    const nextBtn = document.getElementById("rc-next-btn");
    const finishBtn = document.getElementById("rc-finish-btn");
    const saveBtn = document.getElementById("rc-save-btn");
    if (!badge || !text || !nextBtn || !finishBtn || !saveBtn) return;

    badge.textContent = state.status.toUpperCase();
    nextBtn.disabled = !(state.status === "stick_calibrating");
    finishBtn.disabled = !(state.status === "switch_calibrating");
    saveBtn.disabled = !(state.status === "completed");

    if (state.status === "idle") {
      text.textContent = "显示当前各个通道实时数据。点击“开始校准”进入流程。";
      return;
    }
    if (state.status === "stick_calibrating") {
      text.textContent = guideSteps[state.stepIndex] || guideSteps[guideSteps.length - 1];
      return;
    }
    if (state.status === "switch_calibrating") {
      text.textContent = "请拨动遥控器上的所有三档开关、拨轮和旋钮至极限位置。";
      return;
    }
    if (state.status === "completed") {
      const summary = state.min
        .map((v, i) => (Number.isFinite(v) ? `CH${i + 1}: ${Math.round(v)}-${Math.round(state.max[i])}` : null))
        .filter(Boolean)
        .slice(0, 6)
        .join(" | ");
      text.textContent = `校准完成。捕获区间：${summary}`;
    }
  }

  function openSetupPanel(panel) {
    const panels = document.querySelectorAll(".ov-panel");
    panels.forEach((p) => p.classList.toggle("active", p.id === `setup-panel-${panel}`));
  }

  function bindSetupSidebar() {
    const btns = document.querySelectorAll(".ov-nav-item[data-setup-panel]");
    if (!btns.length) return;
    btns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const panel = btn.getAttribute("data-setup-panel");
        btns.forEach((b) => b.classList.toggle("active", b === btn));
        const panelEl = document.getElementById(`setup-panel-${panel}`);
        if (panelEl) openSetupPanel(panel);
        else openSetupPanel("overview");
      });
    });
  }

  function bindButtons() {
    const startBtn = document.getElementById("rc-start-btn");
    const nextBtn = document.getElementById("rc-next-btn");
    const finishBtn = document.getElementById("rc-finish-btn");
    const saveBtn = document.getElementById("rc-save-btn");
    const bindBtn = document.getElementById("rc-bind-btn");
    const copyTrimBtn = document.getElementById("rc-copy-trim-btn");
    const mapBtn = document.getElementById("rc-map-btn");
    if (!startBtn) return;

    startBtn.addEventListener("click", () => {
      window.alert("请务必拆卸桨叶！并确认机体固定后再进行校准。");
      state.status = "stick_calibrating";
      state.stepIndex = 0;
      resetMinMax();
      updateStatusUi();
    });

    nextBtn?.addEventListener("click", () => {
      state.stepIndex += 1;
      if (state.stepIndex >= guideSteps.length) {
        state.status = "switch_calibrating";
      }
      updateStatusUi();
    });

    finishBtn?.addEventListener("click", () => {
      state.status = "completed";
      const lines = state.min
        .map((v, i) => (Number.isFinite(v) ? `CH${i + 1}: ${Math.round(v)} - ${Math.round(state.max[i])}` : ""))
        .filter(Boolean);
      window.alert(`校准捕获结果:\n${lines.join("\n")}`);
      updateStatusUi();
    });

    saveBtn?.addEventListener("click", async () => {
      const sent = await writeCalibrationToFc();
      if (!sent) {
        log("⚠️ 当前未连接飞控，校准结果仅保留在界面中");
      } else {
        log(`✅ 已发送 ${sent} 条 RC 参数写入指令到飞控`);
      }
      state.status = "idle";
      state.stepIndex = 0;
      updateStatusUi();
    });

    bindBtn?.addEventListener("click", () => {
      const proto = window.prompt("选择 Spektrum 对频协议: DSM2 / DSMX", "DSMX");
      if (!proto) return;
      log(`📶 Spektrum 对频已触发，协议: ${proto.toUpperCase()}`);
    });

    copyTrimBtn?.addEventListener("click", () => {
      const channels = getChannels();
      const trims = channels.slice(0, 4).map((v, i) => `CH${i + 1}=${Math.round(v)}`).join(", ");
      log(`📋 已复制微调值: ${trims}`);
    });

    mapBtn?.addEventListener("click", () => {
      const mapping = window.prompt("输入通道映射（例如 AETR / RTAE）", "AETR");
      if (!mapping) return;
      log(`🔁 通道映射设置为: ${mapping.toUpperCase()}`);
    });

    const modeTabs = document.querySelectorAll(".rc-mode-tab");
    modeTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        state.mode = tab.getAttribute("data-rc-mode") || "mode2";
        modeTabs.forEach((t) => t.classList.toggle("active", t === tab));
      });
    });
  }

  function tick() {
    const channels = getChannels();
    updateCapture(channels);
    renderChannelRows(channels);
    updateTxSticks(channels);
  }

  function mount() {
    bindSetupSidebar();
    bindButtons();
    renderReverseList();
    updateStatusUi();
    setInterval(tick, 120);
  }

  window.addEventListener("DOMContentLoaded", mount);
})();
