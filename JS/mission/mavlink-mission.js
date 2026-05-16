(function () {
  const MM = window.MissionModel;

  const MAV_MISSION_ACCEPTED = 0;
  const MAV_MISSION_TYPE_MISSION = 0;

  function i32bytes(v) {
    const n = Math.round(Number(v));
    return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
  }

  function u32bytes(v) {
    const n = Number(v) >>> 0;
    return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
  }

  function f32bytes(v) {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, Number(v), true);
    return Array.from(new Uint8Array(buf));
  }

  function u16bytes(v) {
    const n = Number(v) & 0xffff;
    return [n & 0xff, (n >> 8) & 0xff];
  }

  function targetIds() {
    return {
      sys: window.sysid || 1,
      comp: window.compid || 1
    };
  }

  function waypointToMissionItem(wp, seq) {
    const t = targetIds();
    const lat = Math.round(Number(wp.lat) * 1e7);
    const lng = Math.round(Number(wp.lng) * 1e7);
    const alt = Number(wp.alt) || 0;
  const cmd = Number(wp.command) || MM.MAV_CMD.NAV_WAYPOINT;
    const frame = wp.frame != null ? wp.frame : MM.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT;
    return {
      target_system: t.sys,
      target_component: t.comp,
      seq: seq,
      frame: frame,
      command: cmd,
      current: seq === 0 ? 1 : 0,
      autocontinue: 1,
      param1: Number(wp.param1) || 0,
      param2: Number(wp.param2) || 0,
      param3: Number(wp.param3) || 0,
      param4: Number(wp.param4) || 0,
      x: lat,
      y: lng,
      z: alt,
      mission_type: MAV_MISSION_TYPE_MISSION
    };
  }

  function missionItemPayload(item) {
    return [
      item.target_system & 0xff,
      item.target_component & 0xff,
      ...u16bytes(item.seq),
      item.frame & 0xff,
      ...u16bytes(item.command),
      item.current & 0xff,
      item.autocontinue & 0xff,
      ...f32bytes(item.param1),
      ...f32bytes(item.param2),
      ...f32bytes(item.param3),
      ...f32bytes(item.param4),
      ...i32bytes(item.x),
      ...i32bytes(item.y),
      ...f32bytes(item.z),
      ...u16bytes(item.mission_type)
    ];
  }

  function parseMissionItemInt(payload) {
    const dv = new DataView(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength
    );
    return {
      seq: dv.getUint16(2, true),
      frame: dv.getUint8(4),
      command: dv.getUint16(5, true),
      current: dv.getUint8(7),
      autocontinue: dv.getUint8(8),
      param1: dv.getFloat32(9, true),
      param2: dv.getFloat32(13, true),
      param3: dv.getFloat32(17, true),
      param4: dv.getFloat32(21, true),
      x: dv.getInt32(25, true) / 1e7,
      y: dv.getInt32(29, true) / 1e7,
      z: dv.getFloat32(33, true),
      mission_type: dv.getUint16(37, true)
    };
  }

  function missionItemToWaypoint(item) {
    return MM.createWaypoint({
      command: item.command,
      frame: item.frame,
      param1: item.param1,
      param2: item.param2,
      param3: item.param3,
      param4: item.param4,
      lat: item.x,
      lng: item.y,
      alt: item.z,
      label: MM.getCommandLabel(item.command),
      source: "fc"
    });
  }

  function resetMissionSession() {
    window._missionTransfer = null;
  }

  function waitMissionEvent(predicate, timeoutMs) {
    return new Promise(function (resolve, reject) {
      const deadline = Date.now() + (timeoutMs || 15000);
      function tick() {
        const s = window._missionTransfer;
        if (s && predicate(s)) {
          resolve(s);
          return;
        }
        if (Date.now() > deadline) {
          reject(new Error("任务传输超时"));
          return;
        }
        setTimeout(tick, 40);
      }
      tick();
    });
  }

  async function uploadMission(waypoints, onProgress) {
    if (typeof window.sendMavlinkV2 !== "function") {
      throw new Error("MAVLink 发送未就绪");
    }
    if (window._gcsConnState !== "connected") {
      throw new Error("未连接飞控");
    }
    const list = MM.renumberWaypoints(waypoints || []);
    const items = list.map(function (wp, i) {
      return waypointToMissionItem(wp, i);
    });
    const t = targetIds();

    window._missionTransfer = {
      mode: "upload",
      items: items,
      count: items.length,
      ack: false,
      error: null
    };

    const payloadCount = [
      t.sys & 0xff,
      t.comp & 0xff,
      ...u16bytes(items.length),
      MAV_MISSION_TYPE_MISSION & 0xff,
      0,
      0,
      0
    ];
    await window.sendMavlinkV2(44, payloadCount, 221);

    if (onProgress) {
      onProgress(0, items.length);
    }

    if (!items.length) {
      await waitMissionEvent(function (s) {
        return s.ack === true;
      }, 10000);
      resetMissionSession();
      return list;
    }

    for (let seq = 0; seq < items.length; seq++) {
      await waitMissionEvent(function (s) {
        return s.requestedSeq === seq;
      }, 20000);
      if (onProgress) {
        onProgress(seq + 1, items.length);
      }
      const item = items[seq];
      await window.sendMavlinkV2(73, missionItemPayload(item), 38);
    }

    await waitMissionEvent(function (s) {
      return s.ack === true;
    }, 20000);

    if (window._missionTransfer && window._missionTransfer.error) {
      const err = window._missionTransfer.error;
      resetMissionSession();
      throw new Error(err);
    }
    resetMissionSession();
    return list;
  }

  async function downloadMission(onProgress) {
    if (typeof window.sendMavlinkV2 !== "function") {
      throw new Error("MAVLink 发送未就绪");
    }
    if (window._gcsConnState !== "connected") {
      throw new Error("未连接飞控");
    }
    const t = targetIds();

    window._missionTransfer = {
      mode: "download",
      items: [],
      count: null,
      ack: false,
      error: null
    };

    await window.sendMavlinkV2(43, [t.sys & 0xff, t.comp & 0xff, 0], 132);

    await waitMissionEvent(function (s) {
      return typeof s.count === "number";
    }, 15000);

    const count = window._missionTransfer.count;
    if (!count) {
      resetMissionSession();
      return [];
    }

    if (onProgress) {
      onProgress(0, count);
    }

    for (let seq = 0; seq < count; seq++) {
      window._missionTransfer.requestedSeq = seq;
      const reqPayload = [
        t.sys & 0xff,
        t.comp & 0xff,
        ...u16bytes(seq),
        MAV_MISSION_TYPE_MISSION & 0xff,
        0,
        0,
        0
      ];
      await window.sendMavlinkV2(51, reqPayload, 196);
      await waitMissionEvent(function (s) {
        return s.items && s.items.length > seq;
      }, 15000);
      if (onProgress) {
        onProgress(seq + 1, count);
      }
    }

    const result = MM.renumberWaypoints(
      (window._missionTransfer.items || []).map(missionItemToWaypoint)
    );
    resetMissionSession();
    return result;
  }

  window.MavlinkMission = {
    uploadMission: uploadMission,
    downloadMission: downloadMission,
    parseMissionItemInt: parseMissionItemInt,
    missionItemToWaypoint: missionItemToWaypoint,
    resetMissionSession: resetMissionSession
  };
})();
