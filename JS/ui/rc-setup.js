window.rcChannels = window.rcChannels || Array.from({ length: 16 }, () => 1500);

(function initRcSetup() {
  const CH_COUNT = 14;
  const PWM_MIN = 1000;
  const PWM_MAX = 2000;
  const PWM_TRIM = 1500;
  const RC_STALE_MS = 2000;
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
    highlightPhase: null,
    trimSnapshot: null,
    min: Array.from({ length: CH_COUNT }, () => Number.POSITIVE_INFINITY),
    max: Array.from({ length: CH_COUNT }, () => Number.NEGATIVE_INFINITY),
  };

  const guideSteps = [
    "请将油门（Throttle）推至最上方，然后点击下一步。",
    "请将左摇杆完整画圈，并压到所有边角极限位置。",
    "请将右摇杆完整画圈，并压到所有边角极限位置。",
  ];

  const STATUS_LABELS = {
    idle: "空闲",
    stick_calibrating: "摇杆校准中",
    switch_calibrating: "开关校准中",
    completed: "已完成",
  };

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function fcConnected() {
    return (window._gcsConnState || "").toLowerCase() === "connected";
  }

  function rcLinkActive() {
    if (!fcConnected()) return false;
    const ts = window.rcChannelsUpdatedAt;
    if (!ts || Date.now() - ts > RC_STALE_MS) return false;
    const count = window.rcChannelCount;
    if (typeof count === "number" && count <= 0) return false;
    return true;
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
    if (!rcLinkActive()) return;
    if (state.status !== "stick_calibrating" && state.status !== "switch_calibrating") return;
    for (let i = 0; i < CH_COUNT; i += 1) {
      state.min[i] = Math.min(channels[i], state.min[i]);
      state.max[i] = Math.max(channels[i], state.max[i]);
    }
  }

  function computeCalibValues(i, channels) {
    const minRaw = state.min[i];
    const maxRaw = state.max[i];
    if (!Number.isFinite(minRaw) || !Number.isFinite(maxRaw)) {
      const fallback = Math.round(channels[i]);
      return { min: fallback, trim: fallback, max: fallback };
    }
    const min = Math.round(minRaw);
    const max = Math.round(maxRaw);
    const trim = i < 4
      ? Math.round(state.trimSnapshot?.[i] ?? channels[i])
      : Math.round((minRaw + maxRaw) / 2);
    return { min, trim, max };
  }

  async function sendParamSet(name, value) {
    if (typeof window.sendParamSet === "function") {
      return window.sendParamSet(name, value);
    }
    return false;
  }

  async function writeCalibrationToFc() {
    if (!fcConnected()) return 0;
    const channels = getChannels();
    let sent = 0;
    for (let i = 0; i < CH_COUNT; i += 1) {
      const c = i + 1;
      const { min, trim, max } = computeCalibValues(i, channels);
      const reversed = state.reverse[c] ? 1 : 0;
      /* eslint-disable no-await-in-loop */
      if (await sendParamSet(`RC${c}_MIN`, min)) sent += 1;
      if (await sendParamSet(`RC${c}_MAX`, max)) sent += 1;
      if (await sendParamSet(`RC${c}_TRIM`, trim)) sent += 1;
      if (await sendParamSet(`RC${c}_REVERSED`, reversed)) sent += 1;
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

  function renderChannelRows(channels, live) {
    const root = document.getElementById("rc-channel-list");
    if (!root) return;
    root.innerHTML = "";

    for (let i = 0; i < CH_COUNT; i += 1) {
      const chNum = i + 1;
      const value = live ? channels[i] : null;
      const pct = live ? pwmToPercent(value) : 0;
      const min = live && Number.isFinite(state.min[i]) ? pwmToPercent(state.min[i]) : null;
      const max = live && Number.isFinite(state.max[i]) ? pwmToPercent(state.max[i]) : null;

      const row = document.createElement("div");
      row.className = "rc-row";
      row.innerHTML = `
        <div>CH${chNum} - ${CH_LABELS[i] || "Aux"}</div>
        <div class="rc-track">
          <div class="rc-fill" style="width:${pct}%"></div>
          ${live ? `<div class="rc-midline" style="left:${pwmToPercent(PWM_TRIM)}%"></div>` : ""}
          ${min !== null ? `<div class="rc-minline" style="left:${min}%"></div>` : ""}
          ${max !== null ? `<div class="rc-maxline" style="left:${max}%"></div>` : ""}
        </div>
        <div>${live ? `${Math.round(value)} us` : "—"}</div>
      `;
      root.appendChild(row);
    }
  }

  function updateTxSticks(channels, live) {
    const left = document.getElementById("tx-left-stick");
    const right = document.getElementById("tx-right-stick");
    const arrow = document.getElementById("tx-guide-arrow");
    if (!left || !right || !arrow) return;

    const map = getModeMap();
    const lx = live ? pwmToStick(channels[map.leftX]) : 0;
    const ly = live ? pwmToStick(channels[map.leftY]) : 0;
    const rx = live ? pwmToStick(channels[map.rightX]) : 0;
    const ry = live ? pwmToStick(channels[map.rightY]) : 0;
    const range = 48;

    left.setAttribute("cx", String(190 + lx * range));
    left.setAttribute("cy", String(140 - ly * range));
    right.setAttribute("cx", String(410 + rx * range));
    right.setAttribute("cy", String(140 - ry * range));

    arrow.classList.toggle("hidden", !(state.status === "stick_calibrating" && state.stepIndex === 0));
  }

  function hideCalibrationTable() {
    state.trimSnapshot = null;
    const root = document.getElementById("rc-calib-result");
    const body = document.getElementById("rc-calib-table-body");
    root?.classList.add("hidden");
    if (body) body.innerHTML = "";
  }

  function renderCalibrationTable(channels) {
    const root = document.getElementById("rc-calib-result");
    const body = document.getElementById("rc-calib-table-body");
    if (!root || !body) return;

    if (state.status !== "completed") {
      root.classList.add("hidden");
      body.innerHTML = "";
      return;
    }

    root.classList.remove("hidden");
    body.innerHTML = "";

    for (let i = 0; i < CH_COUNT; i += 1) {
      if (!Number.isFinite(state.min[i]) || !Number.isFinite(state.max[i])) continue;
      const vals = computeCalibValues(i, channels);
      const chNum = i + 1;
      const label = CH_LABELS[i] || "Aux";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>CH${chNum} ${label}</td>
        <td>${vals.min} us</td>
        <td>${vals.trim} us</td>
        <td>${vals.max} us</td>
      `;
      body.appendChild(tr);
    }
  }

  function updateButtonHighlights() {
    const startBtn = document.getElementById("rc-start-btn");
    const finishBtn = document.getElementById("rc-finish-btn");
    const saveBtn = document.getElementById("rc-save-btn");
    startBtn?.classList.toggle("rc-btn-highlight", state.highlightPhase === "start");
    finishBtn?.classList.toggle("rc-btn-highlight", state.highlightPhase === "finish");
    saveBtn?.classList.toggle("rc-btn-highlight", state.highlightPhase === "save");
  }

  function updateStatusUi() {
    const badge = document.getElementById("rc-status-badge");
    const text = document.getElementById("rc-guide-text");
    const nextBtn = document.getElementById("rc-next-btn");
    const finishBtn = document.getElementById("rc-finish-btn");
    const saveBtn = document.getElementById("rc-save-btn");
    if (!badge || !text || !nextBtn || !finishBtn || !saveBtn) return;

    badge.textContent = STATUS_LABELS[state.status] || state.status;
    nextBtn.disabled = !(state.status === "stick_calibrating");
    finishBtn.disabled = !(state.status === "switch_calibrating");
    saveBtn.disabled = !(state.status === "completed");

    if (state.status === "idle") {
      text.textContent = "显示当前各个通道实时数据。点击「开始校准」进入流程。";
    } else if (state.status === "stick_calibrating") {
      text.textContent = guideSteps[state.stepIndex] || guideSteps[guideSteps.length - 1];
    } else if (state.status === "switch_calibrating") {
      text.textContent = "请拨动遥控器上的所有三档开关、拨轮和旋钮至极限位置。";
    } else if (state.status === "completed") {
      text.textContent = "校准完成，请在左侧查看结果并保存。";
    }

    renderCalibrationTable(getChannels());
    updateButtonHighlights();
  }

  function openSetupPanel(panel) {
    const panels = document.querySelectorAll(".ov-panel");
    panels.forEach((p) => p.classList.toggle("active", p.id === `setup-panel-${panel}`));
    try {
      window.dispatchEvent(new CustomEvent("gcs:setup-panel-changed", {
        detail: { panel }
      }));
    } catch (_) { /* ignore */ }
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
      state.highlightPhase = "start";
      state.trimSnapshot = null;
      resetMinMax();
      hideCalibrationTable();
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
      state.highlightPhase = "finish";
      state.trimSnapshot = getChannels().slice(0, 4);
      updateStatusUi();
    });

    saveBtn?.addEventListener("click", async () => {
      state.highlightPhase = "save";
      updateStatusUi();

      const sent = await writeCalibrationToFc();
      if (!sent) {
        log("⚠️ 当前未连接飞控，校准结果仅保留在界面中");
      } else {
        log(`✅ 已发送 ${sent} 条 RC 参数写入指令到飞控`);
      }

      state.highlightPhase = null;
      if (sent > 0) {
        state.status = "idle";
        state.stepIndex = 0;
        resetMinMax();
        hideCalibrationTable();
      }
      updateStatusUi();
    });

    bindBtn?.addEventListener("click", () => {
      const proto = window.prompt("选择 Spektrum 对频协议: DSM2 / DSMX", "DSMX");
      if (!proto) return;
      log(`📶 Spektrum 对频已触发，协议: ${proto.toUpperCase()}`);
    });

    copyTrimBtn?.addEventListener("click", () => {
      if (!rcLinkActive()) {
        log("⚠️ 无 RC 信号，无法复制微调值");
        return;
      }
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
    const live = rcLinkActive();
    const channels = getChannels();
    if (live) updateCapture(channels);
    renderChannelRows(channels, live);
    updateTxSticks(channels, live);
  }

  function mount() {
    bindSetupSidebar();
    bindButtons();
    renderReverseList();
    updateStatusUi();
    document.addEventListener("gcs-connection", () => {
      if (!fcConnected()) tick();
    });
    setInterval(tick, 120);
  }

  window.addEventListener("DOMContentLoaded", mount);
})();
