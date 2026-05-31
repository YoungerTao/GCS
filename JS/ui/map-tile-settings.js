/**
 * 顶栏：地图预取 / 仅缓存 / 瓦片服务状态。
 */
(function () {
  const TILE_API = typeof window.TILE_SERVER === "string" ? window.TILE_SERVER : "http://127.0.0.1:8768";

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

  function renderHealth(snapshot) {
    if (!snapshot) {
      setStatus("检测中…", null);
      return;
    }
    if (snapshot.status === "offline") {
      setStatus("瓦片服务离线", false);
      return;
    }
    const health = snapshot.health;
    if (!health || !health.ok) {
      if (snapshot.status === "checking" || snapshot.status === "idle") {
        setStatus("检测中…", null);
        return;
      }
      setStatus("瓦片服务离线", false);
      return;
    }
    const cached = health.cachedTiles != null ? health.cachedTiles : 0;
    const terrainCached = health.cachedTerrainTiles != null ? health.cachedTerrainTiles : 0;
    const pf = health.prefetch || {};
    const tpf = health.terrainPrefetch || {};
    let extra = "";
    if (pf.running) {
      extra = " · 影像 " + (pf.done || 0) + "/" + (pf.total || 0);
    }
    if (tpf.running) {
      extra += " · 地形 " + (tpf.done || 0) + "/" + (tpf.total || 0);
    }
    if (snapshot.inFlight && snapshot.lastError) {
      extra += " · 重试中";
    }
    const terrainNote = health.terrainReady ? " · 地形就绪" : terrainCached ? " · 地形 " + terrainCached : "";
    setStatus("缓存 " + cached + " 张" + terrainNote + extra, true);
  }

  function wireUi() {
    const cacheOnly = $("mapCacheOnly");
    const prefetchBtn = $("mapPrefetchBtn");
    let bindTimer = 0;

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

    function bindHealth() {
      const TS = window.TerrainService;
      if (TS && typeof TS.subscribeHealth === "function") {
        TS.subscribeHealth(renderHealth);
        if (typeof TS.ensureHealthPolling === "function") {
          TS.ensureHealthPolling();
        } else if (typeof TS.probeHealth === "function") {
          TS.probeHealth(true).then(function () {
            if (typeof TS.getHealthState === "function") {
              renderHealth(TS.getHealthState());
            }
          });
        }
      } else {
        setStatus("检测中…", null);
        bindTimer = window.setTimeout(bindHealth, 1000);
      }
    }
    bindHealth();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireUi);
  } else {
    wireUi();
  }
})();
