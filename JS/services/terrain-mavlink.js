/**
 * Respond to MAVLink TERRAIN_REQUEST using local elevation grid API.
 */
(function () {
  const TILE_SERVER = window.TILE_SERVER || "http://127.0.0.1:8768";
  const MSG_TERRAIN_REQUEST = 133;
  const MSG_TERRAIN_DATA = 134;
  const CRC_TERRAIN_DATA = 11;

  function payloadView(payload) {
    const u8 = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
    return new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  }

  function parseTerrainRequest(payload) {
    if (!payload || payload.length < 11) {
      return null;
    }
    const dv = payloadView(payload);
    if (payload.length >= 18) {
      const maskLow = dv.getUint32(0, true);
      const maskHigh = dv.getUint32(4, true);
      return {
        mask: maskLow + maskHigh * 4294967296,
        lat: dv.getInt32(8, true),
        lon: dv.getInt32(12, true),
        grid_spacing: dv.getUint16(16, true)
      };
    }
    return {
      lat: dv.getInt32(0, true),
      lon: dv.getInt32(4, true),
      grid_spacing: dv.getUint16(8, true),
      mask: dv.getUint8(10, true)
    };
  }

  function packTerrainData(row) {
    const buf = new ArrayBuffer(43);
    const dv = new DataView(buf);
    dv.setInt32(0, row.lat, true);
    dv.setInt32(4, row.lon, true);
    dv.setUint16(8, row.grid_spacing, true);
    dv.setUint8(10, row.gridbit, true);
    const data = row.data || [];
    for (let i = 0; i < 16; i += 1) {
      dv.setInt16(11 + i * 2, data[i] != null ? data[i] : 0, true);
    }
    return Array.from(new Uint8Array(buf));
  }

  function fetchTerrainRows(req) {
    return fetch(TILE_SERVER + "/terrain/grid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req)
    })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (body) {
        return body && body.rows ? body.rows : [];
      })
      .catch(function () {
        return [];
      });
  }

  function canSendTerrainData() {
    return (
      window._gcsConnState === "connected" &&
      typeof window.sendMavlinkV2 === "function" &&
      !!window.writer
    );
  }

  function sendTerrainDataRows(rows) {
    if (!canSendTerrainData()) {
      return Promise.resolve();
    }
    let chain = Promise.resolve();
    rows.forEach(function (row) {
      chain = chain.then(function () {
        return window.sendMavlinkV2(MSG_TERRAIN_DATA, packTerrainData(row), CRC_TERRAIN_DATA);
      }).catch(function (err) {
        const message = err && err.message ? err.message : String(err || "");
        if (/未连接串口|not connected/i.test(message) || !canSendTerrainData()) {
          return;
        }
        throw err;
      });
    });
    return chain;
  }

  function handleTerrainRequest(payload) {
    const req = parseTerrainRequest(payload);
    if (!req) {
      return Promise.resolve();
    }
    terrainRequestCount += 1;
    terrainLastRequestAt = Date.now();
    return fetchTerrainRows(req).then(function (rows) {
      terrainDataRowCount += rows.length;
      return sendTerrainDataRows(rows);
    }).catch(function (err) {
      const message = err && err.message ? err.message : String(err || "");
      if (/未连接串口|not connected/i.test(message) || !canSendTerrainData()) {
        return;
      }
      throw err;
    });
  }

  function checkTerrainEnableBeforeUpload() {
    if (!(window.params instanceof Map)) {
      return { ok: true, warning: null };
    }
    if (!window.params.has("TERRAIN_ENABLE")) {
      return { ok: true, warning: null };
    }
    const enabled = Number(window.params.get("TERRAIN_ENABLE")) === 1;
    return {
      ok: enabled,
      warning: enabled ? null : "飞控 TERRAIN_ENABLE 未启用，地形跟随可能无效"
    };
  }

  function readParam(name) {
    if (!(window.params instanceof Map) || !window.params.has(name)) {
      return null;
    }
    const value = Number(window.params.get(name));
    return Number.isFinite(value) ? value : null;
  }

  /**
   * 上传前对地形相关飞控参数做综合校核（固定翼额外校核前视/跟随）。
   * @returns {{ ok:boolean, blocking:boolean, ready:boolean, issues:Array }}
   */
  function checkTerrainParamsBeforeUpload(platform) {
    const isFw = platform === "plane" || platform === "vtol";
    const issues = [];
    if (!(window.params instanceof Map) || window.params.size === 0) {
      return { ok: true, blocking: false, ready: false, issues: issues };
    }

    const te = readParam("TERRAIN_ENABLE");
    if (te != null && te !== 1) {
      issues.push({
        level: "error",
        code: "terrain_enable_off",
        message: "飞控 TERRAIN_ENABLE 未启用（应=1），地形跟随不会生效"
      });
    }

    const spacing = readParam("TERRAIN_SPACING");
    if (spacing != null) {
      if (spacing >= 100) {
        issues.push({
          level: "warning",
          code: "terrain_spacing_coarse",
          message:
            "TERRAIN_SPACING=" +
            spacing +
            " m 偏粗，与规划网格(30 m)不匹配，尖峰易被抹平，建议设为 30"
        });
      } else if (spacing > 30) {
        issues.push({
          level: "info",
          code: "terrain_spacing",
          message: "建议 TERRAIN_SPACING 设为 30 m 以匹配规划精度"
        });
      }
    }

    if (isFw) {
      const lookahd = readParam("TERRAIN_LOOKAHD");
      if (lookahd != null && lookahd <= 0) {
        issues.push({
          level: "warning",
          code: "terrain_lookahd_off",
          message: "固定翼 TERRAIN_LOOKAHD=0（无前视），建议设为非零以提前爬升"
        });
      }
      const follow = readParam("TERRAIN_FOLLOW");
      if (follow === 0) {
        issues.push({
          level: "info",
          code: "terrain_follow_off",
          message:
            "TERRAIN_FOLLOW=0：CRUISE/FBWB/RTL 不按地形相对高度（不影响 frame 10 任务航点）"
        });
      }
    }

    const blocking = issues.some(function (i) {
      return i.level === "error";
    });
    return { ok: !blocking, blocking: blocking, ready: true, issues: issues };
  }

  let terrainRequestCount = 0;
  let terrainDataRowCount = 0;
  let terrainLastRequestAt = 0;

  function getTerrainGridStatus() {
    return {
      requestCount: terrainRequestCount,
      rowsSent: terrainDataRowCount,
      lastRequestAt: terrainLastRequestAt,
      hookInstalled: !!window._terrainMavlinkHookInstalled,
      connected: window._gcsConnState === "connected"
    };
  }

  function resetTerrainGridStats() {
    terrainRequestCount = 0;
    terrainDataRowCount = 0;
    terrainLastRequestAt = 0;
  }

  function installMavlinkHook() {
    if (window._terrainMavlinkHookInstalled) {
      return;
    }
    window._terrainMavlinkHookInstalled = true;
    document.addEventListener("gcs-mavlink-message", function (event) {
      const detail = event && event.detail;
      if (!detail || detail.id !== MSG_TERRAIN_REQUEST) {
        return;
      }
      handleTerrainRequest(detail.payload);
    });
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", installMavlinkHook);
    } else {
      installMavlinkHook();
    }
  }

  window.TerrainMavlink = {
    MSG_TERRAIN_REQUEST: MSG_TERRAIN_REQUEST,
    MSG_TERRAIN_DATA: MSG_TERRAIN_DATA,
    parseTerrainRequest: parseTerrainRequest,
    packTerrainData: packTerrainData,
    handleTerrainRequest: handleTerrainRequest,
    checkTerrainEnableBeforeUpload: checkTerrainEnableBeforeUpload,
    checkTerrainParamsBeforeUpload: checkTerrainParamsBeforeUpload,
    getTerrainGridStatus: getTerrainGridStatus,
    resetTerrainGridStats: resetTerrainGridStats
  };
})();
