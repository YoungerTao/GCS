(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function currentBaseLayer() {
    return typeof window.getCurrentMapBaseLayerConfig === "function"
      ? window.getCurrentMapBaseLayerConfig()
      : null;
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

  function renderBaseLayerOptions() {
    const select = $("mapBaseLayerSelect");
    if (!select || typeof window.getAvailableMapBaseLayers !== "function") {
      return;
    }
    const layers = window.getAvailableMapBaseLayers();
    const activeId =
      typeof window.getCurrentMapBaseLayerId === "function"
        ? window.getCurrentMapBaseLayerId()
        : "";
    select.innerHTML = layers
      .map(function (item) {
        const selected = item.id === activeId ? ' selected="selected"' : "";
        return (
          '<option value="' +
          item.id +
          '"' +
          selected +
          ">" +
          item.label +
          "</option>"
        );
      })
      .join("");
  }

  function renderHealth(snapshot) {
    const baseLayer = currentBaseLayer();
    if (!baseLayer) {
      setStatus("底图未就绪", false);
      return;
    }

    if (!baseLayer.supportsLocalTileServer) {
      setStatus(baseLayer.label + " · 在线", true);
      return;
    }

    if (!snapshot) {
      setStatus(baseLayer.label + " · 检测中…", null);
      return;
    }
    if (snapshot.status === "offline") {
      setStatus(baseLayer.label + " · 在线回退", false);
      return;
    }
    const health = snapshot.health;
    if (!health || !health.ok) {
      if (snapshot.status === "checking" || snapshot.status === "idle") {
        setStatus(baseLayer.label + " · 检测中…", null);
        return;
      }
      setStatus(baseLayer.label + " · 在线回退", false);
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
    const terrainNote = health.terrainReady
      ? " · 地形就绪"
      : terrainCached
        ? " · 地形 " + terrainCached
        : "";
    setStatus(baseLayer.label + " · 缓存 " + cached + " 张" + terrainNote + extra, true);
  }

  function wireUi() {
    const cacheOnly = $("mapCacheOnly");
    const prefetchBtn = $("mapPrefetchBtn");
    const baseLayerSelect = $("mapBaseLayerSelect");
    let bindTimer = 0;

    renderBaseLayerOptions();

    if (baseLayerSelect) {
      baseLayerSelect.addEventListener("change", function () {
        if (typeof window.setCurrentMapBaseLayerId === "function") {
          window.setCurrentMapBaseLayerId(baseLayerSelect.value);
        }
      });
    }

    if (cacheOnly && typeof window.getGcsMapCacheOnly === "function") {
      cacheOnly.checked = window.getGcsMapCacheOnly();
      cacheOnly.addEventListener("change", function () {
        if (typeof window.setGcsMapCacheOnly === "function") {
          window.setGcsMapCacheOnly(!!cacheOnly.checked);
        }
        if (typeof window.refreshGcsMapBaseLayers === "function") {
          window.refreshGcsMapBaseLayers();
        }
        const baseLayer = currentBaseLayer();
        setStatus(
          (baseLayer ? baseLayer.label : "底图") +
            " · 仅缓存已" +
            (cacheOnly.checked ? "开启" : "关闭"),
          true
        );
      });
    }

    if (prefetchBtn) {
      prefetchBtn.addEventListener("click", function () {
        const map =
          window.mapInstance ||
          window.flightPlanMap ||
          (window.GcsMapPrefetch && window.GcsMapPrefetch._lastMap);
        if (!map) {
          setStatus("请打开包含地图的页面", false);
          return;
        }
        const b = map.getBounds();
        if (
          window.GcsMapPrefetch &&
          typeof window.GcsMapPrefetch.openPrefetchDialog === "function"
        ) {
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
        const baseLayer = currentBaseLayer();
        if (baseLayer && !baseLayer.supportsLocalTileServer) {
          renderHealth(null);
        } else {
          setStatus((baseLayer ? baseLayer.label : "底图") + " · 检测中…", null);
        }
        bindTimer = window.setTimeout(bindHealth, 1000);
      }
    }

    window.addEventListener("gcs:map-base-layer-changed", function () {
      renderBaseLayerOptions();
      const TS = window.TerrainService;
      if (TS && typeof TS.getHealthState === "function") {
        renderHealth(TS.getHealthState());
      } else {
        renderHealth(null);
      }
    });

    window.addEventListener("gcs:map-base-layer-runtime-changed", function () {
      const TS = window.TerrainService;
      if (TS && typeof TS.getHealthState === "function") {
        renderHealth(TS.getHealthState());
      } else {
        renderHealth(null);
      }
    });

    bindHealth();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireUi);
  } else {
    wireUi();
  }
})();
