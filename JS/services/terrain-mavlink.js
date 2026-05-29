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

  function sendTerrainDataRows(rows) {
    if (typeof window.sendMavlinkV2 !== "function") {
      return Promise.resolve();
    }
    let chain = Promise.resolve();
    rows.forEach(function (row) {
      chain = chain.then(function () {
        return window.sendMavlinkV2(MSG_TERRAIN_DATA, packTerrainData(row), CRC_TERRAIN_DATA);
      });
    });
    return chain;
  }

  function handleTerrainRequest(payload) {
    const req = parseTerrainRequest(payload);
    if (!req) {
      return Promise.resolve();
    }
    return fetchTerrainRows(req).then(sendTerrainDataRows);
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
    checkTerrainEnableBeforeUpload: checkTerrainEnableBeforeUpload
  };
})();
