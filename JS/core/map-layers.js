(function () {
  const TILE_SERVER = "http://127.0.0.1:8768";
  const CACHE_ONLY_KEY = "gcs.mapCacheOnly";
  const BASE_LAYER_KEY = "gcs.mapBaseLayer";
  const DEFAULT_BASE_LAYER_ID = "esri-imagery";

  const BASE_LAYER_DEFS = [
    {
      id: "esri-imagery",
      label: "Esri 影像",
      provider: "Esri",
      type: "imagery",
      supportsLocalTileServer: true,
      layers: [
        {
          kind: "tile",
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          localLayer: "imagery",
          options: {
            maxZoom: 19,
            attribution: "Imagery © Esri"
          }
        },
        {
          kind: "tile",
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
          localLayer: "roads",
          options: {
            maxZoom: 19,
            opacity: 0.85,
            attribution: "Roads © Esri"
          }
        },
        {
          kind: "tile",
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
          localLayer: "places",
          options: {
            maxZoom: 19,
            opacity: 0.9,
            attribution: "Labels © Esri"
          }
        }
      ]
    },
    {
      id: "google-imagery",
      label: "Google 影像",
      provider: "Google",
      type: "imagery",
      supportsLocalTileServer: false,
      layers: [
        {
          kind: "tile",
          url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
          options: {
            maxZoom: 20,
            subdomains: ["0", "1", "2", "3"],
            attribution: "Imagery © Google"
          }
        }
      ]
    },
    {
      id: "google-roadmap",
      label: "Google 路网",
      provider: "Google",
      type: "roadmap",
      supportsLocalTileServer: false,
      layers: [
        {
          kind: "tile",
          url: "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
          options: {
            maxZoom: 20,
            subdomains: ["0", "1", "2", "3"],
            attribution: "Map data © Google"
          }
        }
      ]
    },
    {
      id: "bing-imagery",
      label: "Bing 影像",
      provider: "Bing",
      type: "imagery",
      supportsLocalTileServer: false,
      layers: [
        {
          kind: "bing",
          url: "https://ecn.t3.tiles.virtualearth.net/tiles/a{q}.jpeg?g=1",
          options: {
            maxZoom: 19,
            attribution: "Imagery © Bing"
          }
        }
      ]
    },
    {
      id: "bing-roadmap",
      label: "Bing 路网",
      provider: "Bing",
      type: "roadmap",
      supportsLocalTileServer: false,
      layers: [
        {
          kind: "bing",
          url: "https://ecn.t3.tiles.virtualearth.net/tiles/r{q}.png?g=1&mkt=zh-cn",
          options: {
            maxZoom: 19,
            attribution: "Map data © Bing"
          }
        }
      ]
    },
    {
      id: "gaode-imagery",
      label: "高德影像",
      provider: "高德",
      type: "imagery",
      supportsLocalTileServer: false,
      layers: [
        {
          kind: "tile",
          url: "https://webst{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}",
          options: {
            maxZoom: 18,
            subdomains: ["1", "2", "3", "4"],
            attribution: "Imagery © 高德"
          }
        },
        {
          kind: "tile",
          url: "https://webst{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}",
          options: {
            maxZoom: 18,
            opacity: 0.95,
            subdomains: ["1", "2", "3", "4"],
            attribution: "Labels © 高德"
          }
        }
      ]
    },
    {
      id: "gaode-roadmap",
      label: "高德路网",
      provider: "高德",
      type: "roadmap",
      supportsLocalTileServer: false,
      layers: [
        {
          kind: "tile",
          url: "https://webrd{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
          options: {
            maxZoom: 18,
            subdomains: ["1", "2", "3", "4"],
            attribution: "Map data © 高德"
          }
        }
      ]
    }
  ];

  const BASE_LAYER_BY_ID = BASE_LAYER_DEFS.reduce(function (map, item) {
    map[item.id] = item;
    return map;
  }, {});

  const mapRegistrations = [];
  let tileServerProbe = null;
  let tileServerOk = null;

  function tileToQuadKey(x, y, z) {
    let quad = "";
    for (let i = z; i > 0; i -= 1) {
      let digit = 0;
      const mask = 1 << (i - 1);
      if (x & mask) {
        digit += 1;
      }
      if (y & mask) {
        digit += 2;
      }
      quad += String(digit);
    }
    return quad;
  }

  function createBingTileLayer(def) {
    const options = Object.assign({}, def.options || {});
    const BaseLayer = window.L.TileLayer.extend({
      getTileUrl: function (coords) {
        return def.url
          .replace("{q}", tileToQuadKey(coords.x, coords.y, coords.z))
          .replace("{x}", coords.x)
          .replace("{y}", coords.y)
          .replace("{z}", coords.z);
      }
    });
    return new BaseLayer("", options);
  }

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

  function getCurrentMapBaseLayerId() {
    try {
      const saved = localStorage.getItem(BASE_LAYER_KEY);
      if (saved && BASE_LAYER_BY_ID[saved]) {
        return saved;
      }
    } catch (_) {
      /* ignore */
    }
    return DEFAULT_BASE_LAYER_ID;
  }

  function getCurrentMapBaseLayerConfig() {
    return BASE_LAYER_BY_ID[getCurrentMapBaseLayerId()] || BASE_LAYER_BY_ID[DEFAULT_BASE_LAYER_ID];
  }

  function getAvailableMapBaseLayers() {
    return BASE_LAYER_DEFS.map(function (item) {
      return {
        id: item.id,
        label: item.label,
        provider: item.provider,
        type: item.type,
        supportsLocalTileServer: item.supportsLocalTileServer
      };
    });
  }

  function getCurrentMapBaseLayerLabel() {
    const current = getCurrentMapBaseLayerConfig();
    return current ? current.label : "";
  }

  function findMapRegistration(map) {
    return mapRegistrations.find(function (entry) {
      return entry.map === map;
    }) || null;
  }

  function registerMap(map) {
    const existing = findMapRegistration(map);
    if (existing) {
      return existing;
    }
    const next = {
      map: map,
      bundle: null,
      baseLayerId: null,
      usingLocalTileServer: false
    };
    mapRegistrations.push(next);
    return next;
  }

  function unregisterMap(map) {
    const index = mapRegistrations.findIndex(function (entry) {
      return entry.map === map;
    });
    if (index >= 0) {
      const entry = mapRegistrations[index];
      removeBaseLayers(entry.map, entry.bundle);
      mapRegistrations.splice(index, 1);
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
        .then(function (response) {
          return response.ok ? response.json() : null;
        })
        .then(function (data) {
          clearTimeout(timer);
          tileServerOk = !!(data && data.ok);
          resolve(tileServerOk);
        })
        .catch(function () {
          clearTimeout(timer);
          tileServerOk = false;
          resolve(false);
        })
        .finally(function () {
          tileServerProbe = null;
          window.dispatchEvent(new CustomEvent("gcs:map-base-layer-runtime-changed"));
        });
    });
    return tileServerProbe;
  }

  function tileUrlTemplate(localLayer) {
    let url = TILE_SERVER + "/tiles/" + localLayer + "/{z}/{x}/{y}.png";
    if (getGcsMapCacheOnly()) {
      url += "?cacheOnly=1";
    }
    return url;
  }

  function createLeafletLayer(def, useLocalTileServer) {
    if (!window.L) {
      return null;
    }
    if (def.kind === "bing") {
      return createBingTileLayer(def);
    }
    const options = Object.assign({}, def.options || {});
    const url = useLocalTileServer && def.localLayer ? tileUrlTemplate(def.localLayer) : def.url;
    return window.L.tileLayer(url, options);
  }

  function removeBaseLayers(map, bundle) {
    if (!map || !bundle || !Array.isArray(bundle.layers)) {
      return;
    }
    bundle.layers.forEach(function (layer) {
      try {
        if (layer && map.hasLayer(layer)) {
          map.removeLayer(layer);
        }
      } catch (_) {
        /* ignore */
      }
    });
  }

  function mountBaseLayerBundle(map, config, useLocalTileServer) {
    const layers = [];
    (config.layers || []).forEach(function (def) {
      const layer = createLeafletLayer(def, useLocalTileServer);
      if (layer) {
        layer.addTo(map);
        layers.push(layer);
      }
    });
    return {
      id: config.id,
      label: config.label,
      layers: layers,
      useLocalTileServer: useLocalTileServer
    };
  }

  function shouldUseLocalTileServer(config) {
    return !!(config && config.supportsLocalTileServer && tileServerOk === true);
  }

  function applyBaseLayerToMap(map, forcedId) {
    if (!map || typeof window.L === "undefined") {
      return null;
    }
    const registration = registerMap(map);
    const config = BASE_LAYER_BY_ID[forcedId] || getCurrentMapBaseLayerConfig();
    const useLocalTileServer = shouldUseLocalTileServer(config);

    removeBaseLayers(map, registration.bundle);
    registration.bundle = mountBaseLayerBundle(map, config, useLocalTileServer);
    registration.baseLayerId = config.id;
    registration.usingLocalTileServer = useLocalTileServer;

    if (config.supportsLocalTileServer && tileServerOk == null) {
      probeTileServer().then(function () {
        if (getCurrentMapBaseLayerId() === config.id) {
          refreshGcsMapBaseLayers();
        }
      });
    }

    return registration.bundle;
  }

  function refreshGcsMapBaseLayers() {
    mapRegistrations.slice().forEach(function (entry) {
      applyBaseLayerToMap(entry.map, entry.baseLayerId || getCurrentMapBaseLayerId());
    });
    window.dispatchEvent(new CustomEvent("gcs:map-base-layer-runtime-changed"));
  }

  function addGcsMapBaseLayers(map) {
    return applyBaseLayerToMap(map, getCurrentMapBaseLayerId());
  }

  function setCurrentMapBaseLayerId(id) {
    const nextId = BASE_LAYER_BY_ID[id] ? id : DEFAULT_BASE_LAYER_ID;
    try {
      localStorage.setItem(BASE_LAYER_KEY, nextId);
    } catch (_) {
      /* ignore */
    }
    refreshGcsMapBaseLayers();
    window.dispatchEvent(
      new CustomEvent("gcs:map-base-layer-changed", {
        detail: {
          id: nextId,
          label: getCurrentMapBaseLayerLabel()
        }
      })
    );
    return nextId;
  }

  window.TILE_SERVER = TILE_SERVER;
  window.getGcsMapCacheOnly = getGcsMapCacheOnly;
  window.setGcsMapCacheOnly = setGcsMapCacheOnly;
  window.getCurrentMapBaseLayerId = getCurrentMapBaseLayerId;
  window.getCurrentMapBaseLayerConfig = getCurrentMapBaseLayerConfig;
  window.getCurrentMapBaseLayerLabel = getCurrentMapBaseLayerLabel;
  window.getAvailableMapBaseLayers = getAvailableMapBaseLayers;
  window.setCurrentMapBaseLayerId = setCurrentMapBaseLayerId;
  window.probeTileServer = probeTileServer;
  window.addGcsMapBaseLayers = addGcsMapBaseLayers;
  window.refreshGcsMapBaseLayers = refreshGcsMapBaseLayers;
  window.removeGcsMapBaseLayers = unregisterMap;
})();
