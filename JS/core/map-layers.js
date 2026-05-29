/**
 * GCS 地图底图：卫星 + 道路 + 地名（WGS84）。
 * 优先本地瓦片服务 (127.0.0.1:8768)，不可用时回退 Esri 直连。
 */
(function () {
  const TILE_SERVER = "http://127.0.0.1:8768";
  const CACHE_ONLY_KEY = "gcs.mapCacheOnly";

  const ESRI_URLS = {
    imagery:
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    roads:
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
    places:
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
  };

  const LAYER_OPTS = {
    imagery: { maxZoom: 19, attribution: "Imagery © Esri" },
    roads: { maxZoom: 19, opacity: 0.85, attribution: "Roads © Esri" },
    places: { maxZoom: 19, opacity: 0.9, attribution: "Labels © Esri" }
  };

  let tileServerProbe = null;
  let tileServerOk = null;

  function getGcsMapCacheOnly() {
    try {
      return localStorage.getItem(CACHE_ONLY_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function setGcsMapCacheOnly(enabled) {
    try {
      localStorage.setItem(CACHE_ONLY_KEY, enabled ? "1" : "0");
    } catch (_) {
      /* ignore */
    }
  }

  function probeTileServer(timeoutMs) {
    const ms = typeof timeoutMs === "number" ? timeoutMs : 1500;
    if (tileServerOk === true) {
      return Promise.resolve(true);
    }
    if (tileServerProbe) {
      return tileServerProbe;
    }
    tileServerProbe = new Promise(function (resolve) {
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = setTimeout(function () {
        if (ctrl) {
          try {
            ctrl.abort();
          } catch (_) {
            /* ignore */
          }
        }
        resolve(false);
      }, ms);
      fetch(TILE_SERVER + "/health", {
        method: "GET",
        mode: "cors",
        cache: "no-store",
        signal: ctrl ? ctrl.signal : undefined
      })
        .then(function (r) {
          return r.ok ? r.json() : null;
        })
        .then(function (data) {
          clearTimeout(timer);
          const ok = !!(data && data.ok);
          tileServerOk = ok;
          resolve(ok);
        })
        .catch(function () {
          clearTimeout(timer);
          tileServerOk = false;
          resolve(false);
        })
        .finally(function () {
          tileServerProbe = null;
        });
    });
    return tileServerProbe;
  }

  function tileUrlTemplate(layer, useServer) {
    if (!useServer) {
      return ESRI_URLS[layer];
    }
    let url = TILE_SERVER + "/tiles/" + layer + "/{z}/{x}/{y}.png";
    if (getGcsMapCacheOnly()) {
      url += "?cacheOnly=1";
    }
    return url;
  }

  function createBaseLayer(layer, useServer) {
    if (!window.L) {
      return null;
    }
    const opts = Object.assign({}, LAYER_OPTS[layer] || { maxZoom: 19 });
    return window.L.tileLayer(tileUrlTemplate(layer, useServer), opts);
  }

  function addGcsMapBaseLayers(map) {
    if (!map || typeof window.L === "undefined") {
      return null;
    }

    function mount(useServer) {
      if (!useServer) {
        console.warn(
          "[GCS map] 本地瓦片服务不可用，使用 Esri 直连。请运行 tools/map-tiles/tile_server.py 或通过 GCS 启动器。"
        );
      }
      const imagery = createBaseLayer("imagery", useServer);
      const roads = createBaseLayer("roads", useServer);
      const places = createBaseLayer("places", useServer);
      if (imagery) {
        imagery.addTo(map);
      }
      if (roads) {
        roads.addTo(map);
      }
      if (places) {
        places.addTo(map);
      }
      return { imagery, roads, places, useServer };
    }

    if (tileServerOk === true) {
      return mount(true);
    }
    if (tileServerOk === false) {
      return mount(false);
    }

    const pending = mount(true);
    probeTileServer().then(function (ok) {
      if (!ok && pending && pending.useServer !== false) {
        console.warn("[GCS map] 探测瓦片服务失败，后续浏览可能无图；可刷新或启动 tile_server。");
      }
    });
    return pending;
  }

  window.TILE_SERVER = TILE_SERVER;
  window.getGcsMapCacheOnly = getGcsMapCacheOnly;
  window.setGcsMapCacheOnly = setGcsMapCacheOnly;
  window.probeTileServer = probeTileServer;
  window.addGcsMapBaseLayers = addGcsMapBaseLayers;
})();
