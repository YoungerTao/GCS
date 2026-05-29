/**
 * 顶栏：地图预取 / 仅缓存 / 瓦片服务状态。
 */
(function () {
  const TILE_API = typeof window.TILE_SERVER === "string" ? window.TILE_SERVER : "http://127.0.0.1:8768";
  const HEALTH_MS = 10000;

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(text, ok) {
    const el = $("mapTileStatus");
    if (!el) {
      return;
    }
    el.textContent = text || "";
    el.classList.toggle("map-tile-status--ok", !!ok);
    el.classList.toggle("map-tile-status--err", ok === false);
  }

  function pollHealth() {
    fetch(TILE_API + "/health", { method: "GET", mode: "cors", cache: "no-store" })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        if (!data || !data.ok) {
          setStatus("瓦片服务离线", false);
          return;
        }
        const cached = data.cachedTiles != null ? data.cachedTiles : 0;
        const pf = data.prefetch || {};
        let extra = "";
        if (pf.running) {
          extra = " · 预取 " + (pf.done || 0) + "/" + (pf.total || 0);
        }
        setStatus("缓存 " + cached + " 张" + extra, true);
      })
      .catch(function () {
        setStatus("瓦片服务离线", false);
      });
  }

  function wireUi() {
    const cacheOnly = $("mapCacheOnly");
    const prefetchBtn = $("mapPrefetchBtn");

    if (cacheOnly && typeof window.getGcsMapCacheOnly === "function") {
      cacheOnly.checked = window.getGcsMapCacheOnly();
      cacheOnly.addEventListener("change", function () {
        if (typeof window.setGcsMapCacheOnly === "function") {
          window.setGcsMapCacheOnly(!!cacheOnly.checked);
        }
        setStatus("仅缓存已" + (cacheOnly.checked ? "开启" : "关闭") + "，刷新地图生效", true);
      });
    }

    if (prefetchBtn) {
      prefetchBtn.addEventListener("click", function () {
        const map =
          window.mapInstance ||
          window.flightPlanMap ||
          (window.GcsMapPrefetch && window.GcsMapPrefetch._lastMap);
        if (!map) {
          setStatus("请打开含地图的视图", false);
          return;
        }
        const b = map.getBounds();
        if (window.GcsMapPrefetch && typeof window.GcsMapPrefetch.openPrefetchDialog === "function") {
          window.GcsMapPrefetch.openPrefetchDialog(b);
        }
      });
    }

    if (typeof window.probeTileServer === "function") {
      window.probeTileServer().then(function () {
        pollHealth();
      });
    } else {
      pollHealth();
    }
    setInterval(pollHealth, HEALTH_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireUi);
  } else {
    wireUi();
  }
})();
