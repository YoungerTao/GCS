/**
 * page-loader.js — 页面局部加载器
 * 将 index.html 中的大型视图拆分为独立文件，按需注入。
 * 仅在 DOMContentLoaded 后执行一次。
 */

(function () {
  // 页面模板映射：view name → URL
  const VIEW_TEMPLATES = {
    // "flight-plan": "pages/flight-plan.html",
    // 后续可逐步将视图移至独立 HTML 文件
  };

  /** 加载单个 HTML 片段并替换指定容器 */
  async function loadViewHTML(url, containerId) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return false;
      const html = await resp.text();
      const container = document.getElementById(containerId);
      if (container) container.innerHTML = html;
      return true;
    } catch (_) {
      return false;
    }
  }

  /** 加载所有已注册的视图模板 */
  async function loadAllViews() {
    const promises = Object.entries(VIEW_TEMPLATES).map(([name, url]) => {
      const containerId = `view-${name}`;
      return loadViewHTML(url, containerId).catch(() => false);
    });
    await Promise.allSettled(promises);
  }

  // 延迟到 DOM 完全就绪后加载
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => loadAllViews());
  } else {
    loadAllViews();
  }

  // 供外部使用
  window.loadViewHTML = loadViewHTML;
})();
