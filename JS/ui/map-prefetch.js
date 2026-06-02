/**
 * Shift+拖拽选区 → 预取离线地图瓦片（本地 tile server）。
 */
(function () {
  const TILE_API = typeof window.TILE_SERVER === "string" ? window.TILE_SERVER : "http://127.0.0.1:8768";
  const DEFAULT_ZOOM_MIN = 14;
  const DEFAULT_ZOOM_MAX = 17;
  const POLL_MS = 800;

  const setupMaps = new WeakSet();
  let pollTimer = null;
  let currentBounds = null;
  let estimateSeq = 0;
  let latestEstimate = null;

  function $(id) {
    return document.getElementById(id);
  }

  function formatBytes(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) {
      return "0 B";
    }
    if (v < 1024) {
      return v + " B";
    }
    if (v < 1024 * 1024) {
      return (v / 1024).toFixed(1) + " KiB";
    }
    if (v < 1024 * 1024 * 1024) {
      return (v / (1024 * 1024)).toFixed(1) + " MiB";
    }
    return (v / (1024 * 1024 * 1024)).toFixed(2) + " GiB";
  }

  function showModal(show) {
    const modal = $("gcsPrefetchModal");
    if (!modal) {
      return;
    }
    if (!show) {
      const active = document.activeElement;
      if (active && modal.contains(active)) {
        active.blur();
      }
    }
    modal.classList.toggle("hidden", !show);
    modal.setAttribute("aria-hidden", show ? "false" : "true");
  }

  function setProgress(text) {
    const el = $("gcsPrefetchProgress");
    if (el) {
      el.textContent = text || "";
    }
  }

  function fetchJson(url, options) {
    return fetch(url, options).then(function (r) {
      return r.json().then(function (body) {
        return { ok: r.ok, status: r.status, body: body };
      });
    });
  }

  function estimatePrefetch(body) {
    return fetchJson(TILE_API + "/prefetch?dryRun=1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  function startPrefetch(body) {
    return fetchJson(TILE_API + "/prefetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  function pollPrefetchStatus() {
    return fetchJson(TILE_API + "/prefetch/status", { method: "GET", cache: "no-store" });
  }

  function cancelPrefetch() {
    return fetchJson(TILE_API + "/prefetch/cancel", { method: "POST" });
  }

  function readZoomFields() {
    const zMin = Number($("gcsPrefetchZoomMin") && $("gcsPrefetchZoomMin").value);
    const zMax = Number($("gcsPrefetchZoomMax") && $("gcsPrefetchZoomMax").value);
    return {
      zoomMin: Number.isFinite(zMin) ? zMin : DEFAULT_ZOOM_MIN,
      zoomMax: Number.isFinite(zMax) ? zMax : DEFAULT_ZOOM_MAX
    };
  }

  function terrainBboxPayload(bounds) {
    return {
      south: bounds.getSouth(),
      west: bounds.getWest(),
      north: bounds.getNorth(),
      east: bounds.getEast()
    };
  }

  function startTerrainPrefetch(bounds) {
    const body = terrainBboxPayload(bounds);
    return fetchJson(TILE_API + "/terrain/prefetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  function estimateTerrainPrefetch(bounds) {
    const body = terrainBboxPayload(bounds);
    return fetchJson(TILE_API + "/terrain/prefetch?dryRun=1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  function pollTerrainPrefetchStatus() {
    return fetchJson(TILE_API + "/terrain/prefetch/status", { method: "GET", cache: "no-store" });
  }

  function prefetchTerrainForBounds(bounds) {
    return startTerrainPrefetch(bounds);
  }

  function boundsPayload(bounds) {
    const south = bounds.getSouth();
    const west = bounds.getWest();
    const north = bounds.getNorth();
    const east = bounds.getEast();
    const zooms = readZoomFields();
    return {
      south: south,
      west: west,
      north: north,
      east: east,
      zoomMin: zooms.zoomMin,
      zoomMax: zooms.zoomMax,
      layers: ["imagery", "roads", "places"]
    };
  }

  function updateEstimateUI(bounds) {
    const estEl = $("gcsPrefetchEstimate");
    const startBtn = $("gcsPrefetchStartBtn");
    const terrainCb = $("gcsPrefetchTerrain");
    const wantTerrain = terrainCb ? terrainCb.checked : false;
    if (!bounds) {
      if (estEl) {
        estEl.textContent = "";
      }
      if (startBtn) {
        startBtn.disabled = true;
      }
      latestEstimate = null;
      return;
    }
    const seq = ++estimateSeq;
    if (estEl) {
      estEl.textContent = "估算中…";
    }
    if (startBtn) {
      startBtn.disabled = true;
    }
    Promise.all([
      estimatePrefetch(boundsPayload(bounds)),
      wantTerrain ? estimateTerrainPrefetch(bounds) : Promise.resolve(null)
    ])
      .then(function (results) {
        const res = results[0];
        const terrainRes = results[1];
        if (seq !== estimateSeq || !estEl) {
          return;
        }
        if (!res.ok || !res.body) {
          estEl.textContent = "无法估算（瓦片服务未就绪）";
          latestEstimate = null;
          return;
        }
        const total = res.body.total || 0;
        const cached = Number(res.body.cached || 0);
        const missing = res.body.missing == null ? null : Number(res.body.missing || 0);
        let estimateText = "瓦片 " + total + " 张";
        if (missing != null) {
          estimateText += "，已缓存 " + cached + "，待下载 " + missing;
          estimateText += "，约新增 " + formatBytes(res.body.downloadBytes || 0);
        } else {
          estimateText += "，总量约 " + formatBytes(res.body.estimateBytes || 0);
        }
        let terrainEstimate = null;
        if (terrainRes && terrainRes.ok && terrainRes.body) {
          const terrainTotal = Number(terrainRes.body.total || 0);
          const terrainCached = Number(terrainRes.body.cached || 0);
          const terrainMissing = Number(terrainRes.body.missing || 0);
          estimateText +=
            "；地形 " +
            terrainTotal +
            " 块，已缓存 " +
            terrainCached +
            "，待下载 " +
            terrainMissing +
            "，约新增 " +
            formatBytes(terrainRes.body.downloadBytes || 0);
          terrainEstimate = {
            total: terrainTotal,
            cached: terrainCached,
            missing: terrainMissing,
            downloadBytes: Number(terrainRes.body.downloadBytes || 0)
          };
        }
        latestEstimate = {
          map: {
            total: total,
            cached: cached,
            missing: missing,
            downloadBytes: res.body.downloadBytes == null ? null : Number(res.body.downloadBytes || 0)
          },
          terrain: terrainEstimate
        };
        if (res.body.tooLarge) {
          estEl.textContent = estimateText + "。范围过大，请缩小选区或降低最大级别。";
          return;
        }
        estEl.textContent = estimateText;
        if (startBtn) {
          startBtn.disabled = false;
        }
      })
      .catch(function () {
        if (seq === estimateSeq && estEl) {
          estEl.textContent = "估算失败";
        }
      });
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startPoll() {
    stopPoll();
    pollTimer = setInterval(function () {
      pollPrefetchStatus()
        .then(function (res) {
          if (!res.body) {
            return;
          }
          const st = res.body;
          const done = st.done || 0;
          const total = st.total || 0;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          setProgress(
            (st.running ? "下载中 " : "状态 ") +
              done +
              "/" +
              total +
              " (" +
              pct +
              "%)" +
              (st.skipped ? "，跳过 " + st.skipped : "") +
              (st.errors ? "，错误 " + st.errors : "") +
              (st.message ? " — " + st.message : "")
          );
          if (!st.running) {
            stopPoll();
            const btn = $("gcsPrefetchStartBtn");
            if (btn) {
              btn.disabled = false;
            }
          }
        })
        .catch(function () {
          /* ignore transient */
        });
    }, POLL_MS);
  }

  function openPrefetchDialog(bounds) {
    if (!bounds || typeof bounds.getSouth !== "function") {
      return;
    }
    currentBounds = bounds;
    const southEl = $("gcsPrefetchSouth");
    const westEl = $("gcsPrefetchWest");
    const northEl = $("gcsPrefetchNorth");
    const eastEl = $("gcsPrefetchEast");
    if (southEl) {
      southEl.textContent = bounds.getSouth().toFixed(6);
    }
    if (westEl) {
      westEl.textContent = bounds.getWest().toFixed(6);
    }
    if (northEl) {
      northEl.textContent = bounds.getNorth().toFixed(6);
    }
    if (eastEl) {
      eastEl.textContent = bounds.getEast().toFixed(6);
    }
    const zMinInput = $("gcsPrefetchZoomMin");
    const zMaxInput = $("gcsPrefetchZoomMax");
    if (zMinInput && !zMinInput.value) {
      zMinInput.value = String(DEFAULT_ZOOM_MIN);
    }
    if (zMaxInput && !zMaxInput.value) {
      zMaxInput.value = String(DEFAULT_ZOOM_MAX);
    }
    setProgress("");
    showModal(true);
    updateEstimateUI(bounds);
  }

  function runPrefetch() {
    if (!currentBounds) {
      return;
    }
    const btn = $("gcsPrefetchStartBtn");
    if (btn) {
      btn.disabled = true;
    }
    setProgress("启动预取…");
    if (
      latestEstimate &&
      latestEstimate.map &&
      latestEstimate.map.missing != null &&
      latestEstimate.map.missing <= 0 &&
      (!latestEstimate.terrain || latestEstimate.terrain.missing <= 0)
    ) {
      setProgress("当前选区已全部缓存，无需重复下载");
      if (btn) {
        btn.disabled = false;
      }
      return;
    }
    const terrainCb = $("gcsPrefetchTerrain");
    const wantTerrain = terrainCb ? terrainCb.checked : false;
    if (wantTerrain && (!latestEstimate || !latestEstimate.terrain || latestEstimate.terrain.missing > 0)) {
      startTerrainPrefetch(currentBounds).catch(function () {
        /* terrain optional */
      });
    }
    startPrefetch(boundsPayload(currentBounds))
      .then(function (res) {
        if (!res.ok || !res.body || !res.body.ok) {
          setProgress((res.body && res.body.error) || "启动失败");
          if (btn) {
            btn.disabled = false;
          }
          return;
        }
        startPoll();
      })
      .catch(function () {
        setProgress("请求失败");
        if (btn) {
          btn.disabled = false;
        }
      });
  }

  function enablePrefetchDraw(map, onBounds) {
    if (!map || !window.L || setupMaps.has(map)) {
      return;
    }
    setupMaps.add(map);

    let shiftDown = false;
    let drawing = false;
    let startLatLng = null;
    let rect = null;

    map.getContainer().addEventListener("keydown", function (e) {
      if (e.key === "Shift") {
        shiftDown = true;
      }
    });
    map.getContainer().addEventListener("keyup", function (e) {
      if (e.key === "Shift") {
        shiftDown = false;
      }
    });

    map.on("mousedown", function (e) {
      if (!e.originalEvent || !e.originalEvent.shiftKey) {
        return;
      }
      if (window.L && window.L.DomEvent) {
        window.L.DomEvent.stop(e);
      }
      drawing = true;
      shiftDown = true;
      startLatLng = e.latlng;
      if (rect) {
        map.removeLayer(rect);
        rect = null;
      }
      rect = window.L.rectangle([startLatLng, startLatLng], {
        color: "#00c8ff",
        weight: 2,
        fillOpacity: 0.15,
        dashArray: "6 4"
      }).addTo(map);
    });

    map.on("mousemove", function (e) {
      if (!drawing || !startLatLng || !rect) {
        return;
      }
      rect.setBounds(window.L.latLngBounds(startLatLng, e.latlng));
    });

    function finishDraw(e) {
      if (!drawing || !startLatLng || !rect) {
        return;
      }
      drawing = false;
      if (e && window.L && window.L.DomEvent) {
        window.L.DomEvent.stop(e);
      }
      const bounds = rect.getBounds();
      map.removeLayer(rect);
      rect = null;
      startLatLng = null;
      if (typeof onBounds === "function") {
        onBounds(bounds);
      } else {
        openPrefetchDialog(bounds);
      }
    }

    map.on("mouseup", finishDraw);
    map.on("mouseout", function () {
      if (drawing && !shiftDown) {
        drawing = false;
        if (rect) {
          map.removeLayer(rect);
          rect = null;
        }
        startLatLng = null;
      }
    });
  }

  function setupMap(map) {
    if (!map) {
      return;
    }
    enablePrefetchDraw(map, function (bounds) {
      openPrefetchDialog(bounds);
    });
  }

  function wireModal() {
    const closeBtn = $("gcsPrefetchCloseBtn");
    const cancelBtn = $("gcsPrefetchCancelBtn");
    const startBtn = $("gcsPrefetchStartBtn");
    const stopBtn = $("gcsPrefetchStopBtn");
    const zMin = $("gcsPrefetchZoomMin");
    const zMax = $("gcsPrefetchZoomMax");
    const terrainCb = $("gcsPrefetchTerrain");

    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        showModal(false);
      });
    }
    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        showModal(false);
      });
    }
    if (startBtn) {
      startBtn.addEventListener("click", runPrefetch);
    }
    if (stopBtn) {
      stopBtn.addEventListener("click", function () {
        cancelPrefetch().finally(function () {
          setProgress("已请求取消");
        });
      });
    }
    function refreshEstimate() {
      if (currentBounds) {
        updateEstimateUI(currentBounds);
      }
    }
    if (zMin) {
      zMin.addEventListener("change", refreshEstimate);
    }
    if (zMax) {
      zMax.addEventListener("change", refreshEstimate);
    }
    if (terrainCb) {
      terrainCb.addEventListener("change", refreshEstimate);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireModal);
  } else {
    wireModal();
  }

  window.GcsMapPrefetch = {
    TILE_API: TILE_API,
    enablePrefetchDraw: enablePrefetchDraw,
    openPrefetchDialog: openPrefetchDialog,
    setupMap: setupMap,
    startPrefetch: runPrefetch,
    prefetchTerrainForBounds: prefetchTerrainForBounds,
    estimatePrefetch: estimatePrefetch,
    pollPrefetchStatus: pollPrefetchStatus,
    cancelPrefetch: cancelPrefetch
  };
})();
