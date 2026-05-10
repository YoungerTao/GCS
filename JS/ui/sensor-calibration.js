/**
 * 传感器页内子导航：加速度计 / 罗盘（DroneCAN 已迁至初始设置侧栏独立面板）。
 * 需在 accel-calibration.js、compass-calibration.js 之后加载，以便挂接 window.sensorCalib* 钩子。
 */
(function initSensorCalibrationShell() {
  const BREADCRUMB = {
    accel: "加速度计校准 (IMU)",
    compass: "罗盘校准 (磁力计)",
  };

  function $(id) {
    return document.getElementById(id);
  }

  function setSensorModule(mod) {
    if (mod !== "accel" && mod !== "compass") return;
    const page = document.querySelector("#setup-panel-sensors .sc-page");
    if (page) page.setAttribute("data-active-module", mod);
    const leaf = $("sc-breadcrumb-leaf");
    if (leaf) leaf.textContent = BREADCRUMB[mod] || "";

    document.querySelectorAll("#setup-panel-sensors .sc-mod-tab").forEach((btn) => {
      const on = btn.getAttribute("data-sc-module") === mod;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });

    document.querySelectorAll("#setup-panel-sensors .sc-module-panel").forEach((panel) => {
      const id = panel.id.replace("sc-module-", "");
      const on = id === mod;
      panel.classList.toggle("active", on);
      if (on) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "");
    });

    if (mod === "compass") window.sensorCalibRefreshCompassCanvas?.();
    if (mod === "accel") window.sensorCalibAccelUpdateLive?.();
    if (mod === "compass") window.sensorCalibCompassUpdateLive?.();
  }

  function bindSensorSubtabs() {
    document.querySelectorAll("#setup-panel-sensors .sc-mod-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const m = btn.getAttribute("data-sc-module");
        if (m) setSensorModule(m);
      });
    });
  }

  function boot() {
    document.addEventListener("gcs-connection", () => {
      window.sensorCalibAccelUpdateLive?.();
      window.sensorCalibCompassUpdateLive?.();
    });
    bindSensorSubtabs();
    setSensorModule("accel");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
