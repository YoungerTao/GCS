/**
 * GCS terrain elevation client (local tile server :8768).
 */
(function () {
  const TILE_SERVER = window.TILE_SERVER || "http://127.0.0.1:8768";

  let healthCache = null;
  let healthAt = 0;
  const HEALTH_TTL_MS = 4000;

  function fetchJson(url, options) {
    return fetch(url, Object.assign({ mode: "cors", cache: "no-store" }, options || {})).then(
      function (r) {
        if (!r.ok) {
          return r.json().catch(function () {
            throw new Error("HTTP " + r.status);
          }).then(function (body) {
            throw new Error(body && body.error ? body.error : "HTTP " + r.status);
          });
        }
        return r.json();
      }
    );
  }

  function probeHealth(force) {
    const now = Date.now();
    if (!force && healthCache && now - healthAt < HEALTH_TTL_MS) {
      return Promise.resolve(healthCache);
    }
    return fetchJson(TILE_SERVER + "/health")
      .then(function (data) {
        healthCache = data;
        healthAt = now;
        return data;
      })
      .catch(function () {
        healthCache = { ok: false };
        healthAt = now;
        return healthCache;
      });
  }

  function isTerrainAvailable() {
    return probeHealth(false).then(function (h) {
      return !!(h && h.ok && (h.terrainReady || h.cachedTerrainTiles > 0));
    });
  }

  function sampleElevation(lat, lng, options) {
    const opts = options || {};
    const q =
      "lat=" +
      encodeURIComponent(lat) +
      "&lng=" +
      encodeURIComponent(lng) +
      (opts.cacheOnly ? "&cacheOnly=1" : "");
    return fetchJson(TILE_SERVER + "/elevation?" + q).then(function (data) {
      return data.elevation;
    });
  }

  function sampleElevationBatch(points, options) {
    const opts = options || {};
    return fetchJson(TILE_SERVER + "/elevation/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        points: points || [],
        cacheOnly: !!opts.cacheOnly
      })
    }).then(function (data) {
      return data.points || [];
    });
  }

  function sampleProfile(points, stepM, options) {
    const opts = options || {};
    return fetchJson(TILE_SERVER + "/elevation/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        points: points || [],
        stepM: stepM || 50,
        cacheOnly: !!opts.cacheOnly
      })
    }).then(function (data) {
      return data.profile || [];
    });
  }

  function getTerrainStats(polygon, options) {
    const opts = options || {};
    return fetchJson(TILE_SERVER + "/terrain/stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        polygon: polygon || [],
        cacheOnly: !!opts.cacheOnly
      })
    }).then(function (data) {
      return data.stats || {};
    });
  }

  function prefetchTerrain(bbox, options) {
    const opts = options || {};
    if (opts.dryRun) {
      return fetchJson(TILE_SERVER + "/terrain/prefetch?dryRun=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bbox)
      });
    }
    return fetchJson(TILE_SERVER + "/terrain/prefetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bbox)
    });
  }

  function terrainPrefetchStatus() {
    return fetchJson(TILE_SERVER + "/terrain/prefetch/status");
  }

  function cancelTerrainPrefetch() {
    return fetchJson(TILE_SERVER + "/terrain/prefetch/cancel", { method: "POST" });
  }

  function polygonBbox(polygon) {
    let south = Infinity;
    let north = -Infinity;
    let west = Infinity;
    let east = -Infinity;
    (polygon || []).forEach(function (p) {
      const lat = Number(p.lat);
      const lng = Number(p.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return;
      }
      south = Math.min(south, lat);
      north = Math.max(north, lat);
      west = Math.min(west, lng);
      east = Math.max(east, lng);
    });
    if (!Number.isFinite(south)) {
      return null;
    }
    const pad = 0.02;
    return {
      south: south - pad,
      north: north + pad,
      west: west - pad,
      east: east + pad
    };
  }

  window.TerrainService = {
    TILE_SERVER: TILE_SERVER,
    probeHealth: probeHealth,
    isTerrainAvailable: isTerrainAvailable,
    sampleElevation: sampleElevation,
    sampleElevationBatch: sampleElevationBatch,
    sampleProfile: sampleProfile,
    getTerrainStats: getTerrainStats,
    prefetchTerrain: prefetchTerrain,
    terrainPrefetchStatus: terrainPrefetchStatus,
    cancelTerrainPrefetch: cancelTerrainPrefetch,
    polygonBbox: polygonBbox
  };
})();
