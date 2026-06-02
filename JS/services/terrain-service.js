/**
 * GCS terrain elevation client (local tile server :8768).
 */
(function () {
  const TILE_SERVER = window.TILE_SERVER || "http://127.0.0.1:8768";
  const HEALTH_POLL_MS = 8000;
  const HEALTH_RETRY_MS = 1500;
  const HEALTH_OFFLINE_FAILURES = 3;
  const HEALTH_LAST_OK_GRACE_MS = 30000;

  let healthCache = null;
  let healthAt = 0;
  const HEALTH_TTL_MS = 4000;
  let healthRequest = null;
  let healthPollTimer = 0;
  let healthPollStarted = false;
  const healthListeners = new Set();
  let healthState = {
    health: null,
    status: "idle",
    inFlight: false,
    lastOkAt: 0,
    lastError: "",
    consecutiveFailures: 0
  };

  function cloneHealthState() {
    return {
      health: healthState.health ? Object.assign({}, healthState.health) : null,
      status: healthState.status,
      inFlight: !!healthState.inFlight,
      lastOkAt: Number(healthState.lastOkAt || 0),
      lastError: healthState.lastError || "",
      consecutiveFailures: Number(healthState.consecutiveFailures || 0)
    };
  }

  function emitHealthState() {
    const snapshot = cloneHealthState();
    healthListeners.forEach(function (listener) {
      try {
        listener(snapshot);
      } catch (_) {
        /* ignore listener errors */
      }
    });
  }

  function setHealthState(patch) {
    healthState = Object.assign({}, healthState, patch || {});
    emitHealthState();
  }

  function classifyHealthStatus(health) {
    if (!health || !health.ok) {
      return "offline";
    }
    if (health.terrainReady || Number(health.cachedTerrainTiles || 0) > 0) {
      return "online";
    }
    return "online-empty";
  }

  function getLastKnownHealthyStatus() {
    return classifyHealthStatus(healthState.health);
  }

  function hasRecentHealthyResult(now) {
    return (
      healthState.lastOkAt > 0 &&
      now - Number(healthState.lastOkAt || 0) < HEALTH_LAST_OK_GRACE_MS &&
      getLastKnownHealthyStatus() !== "offline"
    );
  }

  function fetchJson(url, options) {
    const opts = Object.assign({ mode: "cors", cache: "no-store" }, options || {});
    const timeoutMs = Number(opts.timeoutMs);
    delete opts.timeoutMs;
    let controller = null;
    let timer = 0;
    if (Number.isFinite(timeoutMs) && timeoutMs > 0 && typeof AbortController === "function") {
      controller = new AbortController();
      opts.signal = controller.signal;
    }

    const requestPromise = fetch(url, opts).then(
      function (r) {
        if (!r.ok) {
          return r
            .json()
            .catch(function () {
              throw new Error("HTTP " + r.status);
            })
            .then(function (body) {
              throw new Error(body && body.error ? body.error : "HTTP " + r.status);
            });
        }
        return r.json();
      },
      function (err) {
        if (err && err.name === "AbortError") {
          throw new Error("请求超时");
        }
        throw err;
      }
    );

    if (!(Number.isFinite(timeoutMs) && timeoutMs > 0)) {
      return requestPromise;
    }

    const timeoutPromise = new Promise(function (_, reject) {
      timer = window.setTimeout(function () {
        if (controller) {
          try {
            controller.abort();
          } catch (_) {
            /* ignore */
          }
        }
        reject(new Error("请求超时"));
      }, timeoutMs);
    });

    return Promise.race([requestPromise, timeoutPromise]).finally(function () {
      if (timer) {
        window.clearTimeout(timer);
      }
    });
  }

  function applyHealthSuccess(data) {
    const now = Date.now();
    healthCache = data;
    healthAt = now;
    setHealthState({
      health: data,
      status: classifyHealthStatus(data),
      inFlight: false,
      lastOkAt: now,
      lastError: "",
      consecutiveFailures: 0
    });
    return data;
  }

  function applyHealthFailure(err) {
    const now = Date.now();
    const failures = Number(healthState.consecutiveFailures || 0) + 1;
    const keepHealthy =
      hasRecentHealthyResult(now) && failures < HEALTH_OFFLINE_FAILURES;
    setHealthState({
      status: keepHealthy ? getLastKnownHealthyStatus() : "offline",
      inFlight: false,
      lastError: err && err.message ? err.message : String(err || ""),
      consecutiveFailures: failures
    });
    return healthState.health || { ok: false };
  }

  function probeHealth(force) {
    const now = Date.now();
    if (!force && healthCache && now - healthAt < HEALTH_TTL_MS) {
      return Promise.resolve(healthCache);
    }
    if (healthRequest) {
      return healthRequest;
    }
    const keepHealthy = hasRecentHealthyResult(now);
    setHealthState({
      status: keepHealthy ? getLastKnownHealthyStatus() : "checking",
      inFlight: true
    });
    healthRequest = fetchJson(TILE_SERVER + "/health", {
      timeoutMs: 5000
    })
      .then(function (data) {
        return applyHealthSuccess(data);
      })
      .catch(function (err) {
        return applyHealthFailure(err);
      })
      .finally(function () {
        healthRequest = null;
      });
    return healthRequest;
  }

  function getHealthState() {
    return cloneHealthState();
  }

  function subscribeHealth(listener, options) {
    if (typeof listener !== "function") {
      return function () {};
    }
    healthListeners.add(listener);
    if (!options || options.emitInitial !== false) {
      listener(cloneHealthState());
    }
    return function () {
      healthListeners.delete(listener);
    };
  }

  function ensureHealthPolling(options) {
    const opts = options || {};
    const intervalMs = Number(opts.intervalMs) > 0 ? Number(opts.intervalMs) : HEALTH_POLL_MS;
    const retryMs = Number(opts.retryMs) > 0 ? Number(opts.retryMs) : HEALTH_RETRY_MS;

    function scheduleNext(delayMs) {
      if (healthPollTimer) {
        window.clearTimeout(healthPollTimer);
      }
      healthPollTimer = window.setTimeout(function () {
        probeHealth(true).finally(function () {
          const snapshot = getHealthState();
          const nextDelay = snapshot.status === "offline" ? retryMs : intervalMs;
          scheduleNext(nextDelay);
        });
      }, delayMs);
    }

    if (healthPollStarted) {
      return;
    }
    healthPollStarted = true;
    if (healthState.status === "idle") {
      setHealthState({ status: "checking" });
    }
    probeHealth(true).finally(function () {
      const snapshot = getHealthState();
      scheduleNext(snapshot.status === "offline" ? retryMs : intervalMs);
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
      timeoutMs: opts.timeoutMs != null ? opts.timeoutMs : 60000,
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
      timeoutMs: opts.timeoutMs != null ? opts.timeoutMs : 60000,
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
      timeoutMs: opts.timeoutMs != null ? opts.timeoutMs : 60000,
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
        timeoutMs: opts.timeoutMs != null ? opts.timeoutMs : 10000,
        body: JSON.stringify(bbox)
      });
    }
    return fetchJson(TILE_SERVER + "/terrain/prefetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeoutMs: opts.timeoutMs != null ? opts.timeoutMs : 10000,
      body: JSON.stringify(bbox)
    });
  }

  function terrainPrefetchStatus() {
    return fetchJson(TILE_SERVER + "/terrain/prefetch/status", {
      timeoutMs: 5000
    });
  }

  function cancelTerrainPrefetch() {
    return fetchJson(TILE_SERVER + "/terrain/prefetch/cancel", {
      method: "POST",
      timeoutMs: 5000
    });
  }

  function estimateTerrainPrefetch(bbox) {
    return prefetchTerrain(bbox, { dryRun: true });
  }

  function waitForTerrainPrefetch(options) {
    const opts = options || {};
    const timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : 300000;
    const pollMs = opts.pollMs != null ? opts.pollMs : 800;
    const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
    const start = Date.now();

    function poll() {
      return terrainPrefetchStatus()
        .then(function (status) {
          if (onProgress) {
            onProgress(status || null);
          }
          if (!status) {
            if (Date.now() - start > timeoutMs) {
              return { ok: false, error: "预取状态不可用", status: null };
            }
            return new Promise(function (resolve) {
              window.setTimeout(function () {
                resolve(poll());
              }, pollMs);
            });
          }
          if (status.running) {
            if (Date.now() - start > timeoutMs) {
              return { ok: false, error: "地形预取超时", status: status };
            }
            return new Promise(function (resolve) {
              window.setTimeout(function () {
                resolve(poll());
              }, pollMs);
            });
          }
          if (status.message === "已取消") {
            return { ok: false, error: "预取已取消", status: status };
          }
          if (status.error) {
            return { ok: false, error: status.error, status: status };
          }
          if (status.message === "完成" || (status.total > 0 && status.done >= status.total)) {
            return { ok: true, status: status };
          }
          if (!status.total && !status.running) {
            return { ok: true, status: status, skipped: true };
          }
          if ((status.errors || 0) > 0) {
            return { ok: false, error: "预取部分失败（" + status.errors + " 错误）", status: status };
          }
          return { ok: true, status: status };
        })
        .catch(function () {
          if (Date.now() - start > timeoutMs) {
            return { ok: false, error: "预取状态读取失败", status: null };
          }
          return new Promise(function (resolve) {
            window.setTimeout(function () {
              resolve(poll());
            }, pollMs);
          });
        });
    }

    return poll();
  }

  function prefetchTerrainAndWait(bbox, options) {
    const opts = options || {};
    const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
    return prefetchTerrain(bbox, opts)
      .catch(function (err) {
        throw new Error(err && err.message ? err.message : "启动地形预取失败");
      })
      .then(function () {
        return waitForTerrainPrefetch({
          timeoutMs: opts.timeoutMs,
          pollMs: opts.pollMs,
          onProgress: onProgress
        });
      })
      .then(function (result) {
        if (!result.ok) {
          throw new Error(result.error || "地形预取失败");
        }
        healthCache = null;
        return result;
      });
  }

  function ensureTerrainForPolygon(polygon, options) {
    const opts = options || {};
    const bbox = polygonBbox(polygon);
    if (!bbox) {
      return Promise.reject(new Error("无效测区多边形"));
    }
    return estimateTerrainPrefetch(bbox).then(function (estimate) {
      if (estimate && estimate.ok && Number(estimate.missing || 0) <= 0 && !opts.force) {
        if (typeof opts.onProgress === "function") {
          opts.onProgress({ running: false, message: "完成", done: 0, total: 0, cached: true });
        }
        return { cached: true, bbox: bbox };
      }
      return prefetchTerrainAndWait(bbox, opts).then(function (result) {
        return Object.assign({ cached: false, bbox: bbox }, result);
      });
    });
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
    getHealthState: getHealthState,
    subscribeHealth: subscribeHealth,
    ensureHealthPolling: ensureHealthPolling,
    isTerrainAvailable: isTerrainAvailable,
    sampleElevation: sampleElevation,
    sampleElevationBatch: sampleElevationBatch,
    sampleProfile: sampleProfile,
    getTerrainStats: getTerrainStats,
    prefetchTerrain: prefetchTerrain,
    estimateTerrainPrefetch: estimateTerrainPrefetch,
    terrainPrefetchStatus: terrainPrefetchStatus,
    cancelTerrainPrefetch: cancelTerrainPrefetch,
    waitForTerrainPrefetch: waitForTerrainPrefetch,
    prefetchTerrainAndWait: prefetchTerrainAndWait,
    ensureTerrainForPolygon: ensureTerrainForPolygon,
    polygonBbox: polygonBbox
  };
})();
