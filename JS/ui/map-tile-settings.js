(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function currentBaseLayer() {
    return typeof window.getCurrentMapBaseLayerConfig === "function"
      ? window.getCurrentMapBaseLayerConfig()
      : null;
  }

  function shortLayerName(baseLayer) {
    if (!baseLayer) {
      return "底图";
    }
    if (baseLayer.provider) {
      return baseLayer.provider;
    }
    const label = baseLayer.label || "";
    const parts = label.split(/\s+/);
    return parts[0] || label || "底图";
  }

  function setStatus(text, ok) {
    const el = $("mapTileStatus");
    if (!el) {
      return;
    }
    el.textContent = text || "";
    el.title = text || "";
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
    const shortName = shortLayerName(baseLayer);
    const cacheOnly =
      typeof window.getGcsMapCacheOnly === "function" && window.getGcsMapCacheOnly();
    const cacheTag = cacheOnly ? " · 仅缓存" : "";

    if (!baseLayer) {
      setStatus("底图未就绪", false);
      return;
    }

    if (!baseLayer.supportsLocalTileServer) {
      setStatus(shortName + " · 在线" + cacheTag, true);
      return;
    }

    if (!snapshot) {
      setStatus(shortName + " · 检测中…" + cacheTag, null);
      return;
    }

    if (snapshot.status === "offline") {
      setStatus(shortName + " · 离线" + cacheTag, false);
      return;
    }

    const health = snapshot.health;
    if (!health || !health.ok) {
      if (snapshot.status === "checking" || snapshot.status === "idle") {
        setStatus(shortName + " · 检测中…" + cacheTag, null);
        return;
      }
      setStatus(shortName + " · 离线" + cacheTag, false);
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

    setStatus(shortName + " · 缓存 " + cached + terrainNote + extra + cacheTag, true);
  }

  function wireMapTileMenu() {
    const menuBtn = $("mapTileMenuBtn");
    const menuPanel = $("mapTileMenuPanel");
    if (!menuBtn || !menuPanel) {
      return;
    }

    function setMenuOpen(open) {
      menuPanel.classList.toggle("hidden", !open);
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    }

    menuBtn.addEventListener("click", function (event) {
      event.stopPropagation();
      setMenuOpen(menuPanel.classList.contains("hidden"));
    });

    document.addEventListener("click", function (event) {
      if (!menuPanel.contains(event.target) && event.target !== menuBtn) {
        setMenuOpen(false);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    });
  }

  function wireUi() {
    const cacheOnly = $("mapCacheOnly");
    const prefetchBtn = $("mapPrefetchBtn");
    const baseLayerSelect = $("mapBaseLayerSelect");
    let bindTimer = 0;

    wireMapTileMenu();
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
        const terrainService = window.TerrainService;
        if (terrainService && typeof terrainService.getHealthState === "function") {
          renderHealth(terrainService.getHealthState());
        } else {
          renderHealth(null);
        }
      });
    }

    if (prefetchBtn) {
      prefetchBtn.addEventListener("click", function () {
        const map =
          window.mapInstance ||
          window.flightPlanMap ||
          (window.GcsMapPrefetch && window.GcsMapPrefetch._lastMap);
        if (!map) {
          setStatus("请先打开包含地图的页面", false);
          return;
        }
        const bounds = map.getBounds();
        if (
          window.GcsMapPrefetch &&
          typeof window.GcsMapPrefetch.openPrefetchDialog === "function"
        ) {
          window.GcsMapPrefetch.openPrefetchDialog(bounds);
        }
        const menuPanel = $("mapTileMenuPanel");
        const menuBtn = $("mapTileMenuBtn");
        if (menuPanel) {
          menuPanel.classList.add("hidden");
        }
        if (menuBtn) {
          menuBtn.setAttribute("aria-expanded", "false");
        }
      });
    }

    function bindHealth() {
      const terrainService = window.TerrainService;
      if (terrainService && typeof terrainService.subscribeHealth === "function") {
        terrainService.subscribeHealth(renderHealth);
        if (typeof terrainService.ensureHealthPolling === "function") {
          terrainService.ensureHealthPolling();
        } else if (typeof terrainService.probeHealth === "function") {
          terrainService.probeHealth(true).then(function () {
            if (typeof terrainService.getHealthState === "function") {
              renderHealth(terrainService.getHealthState());
            }
          });
        }
      } else {
        const baseLayer = currentBaseLayer();
        if (baseLayer && !baseLayer.supportsLocalTileServer) {
          renderHealth(null);
        } else {
          setStatus((baseLayer ? baseLayer.label : "底图") + " · 检测中...", null);
        }
        bindTimer = window.setTimeout(bindHealth, 1000);
      }
    }

    window.addEventListener("gcs:map-base-layer-changed", function () {
      renderBaseLayerOptions();
      const terrainService = window.TerrainService;
      if (terrainService && typeof terrainService.getHealthState === "function") {
        renderHealth(terrainService.getHealthState());
      } else {
        renderHealth(null);
      }
    });

    window.addEventListener("gcs:map-base-layer-runtime-changed", function () {
      const terrainService = window.TerrainService;
      if (terrainService && typeof terrainService.getHealthState === "function") {
        renderHealth(terrainService.getHealthState());
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
