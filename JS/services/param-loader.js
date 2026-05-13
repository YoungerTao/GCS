/**
 * 参数加载 UI — 从 serial.js 拆分
 *  负责：加载遮罩、进度条、取消逻辑
 */

const PARAM_LOAD_WATCHDOG_MS = 120000;

function wireParamLoadCancelOnce() {
  const btn = document.getElementById("param-load-cancel");
  if (!btn || btn.dataset.wired === "1") return;
  btn.dataset.wired = "1";
  btn.addEventListener("click", () => {
    if (typeof window.cancelParamLoadingUI === "function") window.cancelParamLoadingUI();
  });
}

window.updateParamLoadProgress = function updateParamLoadProgress(received, total) {
  const prog = document.getElementById("param-load-progress");
  const bar = document.getElementById("param-load-bar");
  if (prog) {
    prog.textContent =
      Number.isFinite(total) && total > 0
        ? `已接收 ${received} / ${total}`
        : `已接收 ${received} 条（等待飞控上报总数…）`;
  }
  if (!bar) return;
  if (Number.isFinite(total) && total > 0) {
    bar.classList.remove("param-load-bar--indeterminate");
    bar.style.left = "0";
    const pct = Math.min(100, Math.round((received / total) * 100));
    bar.style.width = `${pct}%`;
  } else {
    bar.classList.add("param-load-bar--indeterminate");
    bar.style.width = "";
    bar.style.left = "";
  }
};

window.beginParamLoadingUI = function beginParamLoadingUI() {
  if (window._paramLoadActive) return false;
  wireParamLoadCancelOnce();

  window._paramLoadActive = true;
  window._paramLoadCancel = false;
  try { window.params.clear(); } catch (_) { /* ignore */ }
  window._paramCount = undefined;

  const paramsEl = document.getElementById("params");
  if (paramsEl) paramsEl.innerHTML = '<span class="muted">参数表加载中…</span>';

  const ov = document.getElementById("param-load-overlay");
  if (ov) {
    ov.classList.remove("hidden");
    ov.setAttribute("aria-busy", "true");
  }
  const prog = document.getElementById("param-load-progress");
  if (prog) prog.textContent = "正在向飞控请求参数列表…";
  window.updateParamLoadProgress(0, NaN);

  const loadBtn = document.getElementById("loadParamsBtn");
  if (loadBtn) loadBtn.disabled = true;

  document.body.classList.add("param-loading");

  if (window._paramLoadWatchdog) clearTimeout(window._paramLoadWatchdog);
  window._paramLoadWatchdog = setTimeout(() => {
    if (!window._paramLoadActive) return;
    if (typeof log === "function") log(`⚠️ 参数加载超过 ${PARAM_LOAD_WATCHDOG_MS / 1000}s 仍未收齐，已结束等待`, "param-load");
    window.endParamLoadingUI(false, "timeout");
  }, PARAM_LOAD_WATCHDOG_MS);

  return true;
};

window.cancelParamLoadingUI = function cancelParamLoadingUI() {
  if (!window._paramLoadActive) return;
  window._paramLoadCancel = true;
  window.endParamLoadingUI(false, "cancel");
};

window.endParamLoadingUI = function endParamLoadingUI(ok, reason) {
  const wasActive = !!window._paramLoadActive;
  window._paramLoadActive = false;
  window._paramLoadCancel = false;

  if (window._paramLoadWatchdog) {
    clearTimeout(window._paramLoadWatchdog);
    window._paramLoadWatchdog = null;
  }

  const ov = document.getElementById("param-load-overlay");
  if (ov) {
    ov.classList.add("hidden");
    ov.setAttribute("aria-busy", "false");
  }
  document.body.classList.remove("param-loading");

  const loadBtn = document.getElementById("loadParamsBtn");
  if (loadBtn) loadBtn.disabled = false;

  const bar = document.getElementById("param-load-bar");
  if (bar) {
    bar.classList.remove("param-load-bar--indeterminate");
    bar.style.left = "0";
    bar.style.width = "0%";
  }

  if (typeof window.renderSortedParams === "function") window.renderSortedParams();

  if (!wasActive) return;

  if (ok && reason === "complete") {
    if (typeof log === "function") log(`✅ 参数表加载完成（${window.params.size} 项）`, "param-load");
    try {
      document.dispatchEvent(new CustomEvent("gcs-airframe-params-changed", { detail: { bulk: true } }));
    } catch (_) { /* ignore */ }
    // 参数加载完成后，主动请求 AUTOPILOT_VERSION（#148）— 确认链路通畅后重试
    if (typeof window.requestAutopilotVersionFromVehicle === "function") {
      window.requestAutopilotVersionFromVehicle();
    }
  } else if (reason === "cancel") {
    if (typeof log === "function") log(`已取消参数加载（已保留已收到的 ${window.params.size} 项）`, "param-load");
  } else if (reason === "disconnect") {
    if (typeof log === "function") log("⚠️ 连接已断开，参数加载中止", "param-load");
  } else if (reason === "send-fail") {
    if (typeof log === "function") log("⚠️ 无法发送参数列表请求", "param-load");
  }
};

console.log("✅ param-loader.js 已加载");
