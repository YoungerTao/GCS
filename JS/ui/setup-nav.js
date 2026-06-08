/**
 * 初始设置侧栏：面板 accent 联动、aria-current、状态徽章
 */
(function initSetupNav() {
  let dronecanHasIssue = false;
  const PANEL_NAV_ALIAS = {
    rtk: "params",
  };

  function resolveNavPanel(panel) {
    const key = String(panel || "overview");
    return PANEL_NAV_ALIAS[key] || key;
  }

  function getAccentForPanel(panel) {
    const navPanel = resolveNavPanel(panel);
    const btn = document.querySelector(`.ov-nav-item[data-setup-panel="${CSS.escape(navPanel)}"]`);
    if (!btn) return null;
    const accent = getComputedStyle(btn).getPropertyValue("--ov-nav-accent").trim();
    return accent || null;
  }

  function syncNavState(panel) {
    const key = panel || "overview";
    const navKey = resolveNavPanel(key);
    document.querySelectorAll(".ov-nav-item[data-setup-panel]").forEach((btn) => {
      const isActive = btn.getAttribute("data-setup-panel") === navKey;
      btn.classList.toggle("active", isActive);
      if (isActive) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });

    const main = document.querySelector(".ov-main");
    if (main) {
      main.dataset.setupPanel = key;
      const accent = getAccentForPanel(key);
      if (accent) main.style.setProperty("--ov-panel-accent", accent);
    }
  }

  function setBadge(panel, show) {
    const btn = document.querySelector(`.ov-nav-item[data-setup-panel="${CSS.escape(panel)}"]`);
    const badge = btn?.querySelector(".ov-nav-badge");
    if (!badge) return;
    badge.hidden = !show;
  }

  function updateBadges() {
    const st = (window._gcsConnState || "disconnected").toLowerCase();
    const warn = document.getElementById("ov-global-warning");
    const connected = st === "connected";
    const warnText = warn?.textContent || "";
    const preflightFailed =
      connected &&
      warn &&
      (warn.classList.contains("danger") ||
        (warn.classList.contains("warn") && !warnText.includes("等待参数")));

    const sensorsNeedAttention =
      connected &&
      (warnText.includes("传感器") ||
        warnText.includes("校准") ||
        warnText.includes("compass") ||
        warnText.includes("罗盘"));

    setBadge("safety", preflightFailed);
    setBadge("sensors", sensorsNeedAttention);
    setBadge("dronecan", connected && dronecanHasIssue);
  }

  window.gcsSyncSetupNav = syncNavState;

  window.gcsSetDronecanNavIssue = function gcsSetDronecanNavIssue(hasIssue) {
    dronecanHasIssue = !!hasIssue;
    updateBadges();
  };

  window.addEventListener("gcs:setup-panel-changed", (ev) => {
    syncNavState(ev.detail?.panel);
  });

  document.addEventListener("gcs-connection", updateBadges);
  document.addEventListener("gcs-prearm-hint", updateBadges);
  document.addEventListener("gcs-sensor-overview-changed", updateBadges);
  document.addEventListener("gcs-airframe-params-changed", updateBadges);

  window.addEventListener("DOMContentLoaded", () => {
    const active = document.querySelector(".ov-nav-item.active[data-setup-panel]");
    syncNavState(active?.getAttribute("data-setup-panel") || "overview");
    updateBadges();
    setInterval(updateBadges, 2000);
  });
})();
