/**
 * MAVLink 任务相关消息的线序打包/解包（与 pymavlink / ArduPilot 一致：按字段长度降序排列）。
 */
(function () {
  function u16bytes(v) {
    const n = Number(v) & 0xffff;
    return [n & 0xff, (n >> 8) & 0xff];
  }

  function f32bytes(v) {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, Number(v), true);
    return Array.from(new Uint8Array(buf));
  }

  function i32bytes(v) {
    const n = Math.round(Number(v));
    return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
  }

  /** MISSION_COUNT (44): count u16, target_system, target_component [, mission_type] */
  function packMissionCount(targetSystem, targetComponent, count, missionType) {
    const p = [
      ...u16bytes(count),
      targetSystem & 0xff,
      targetComponent & 0xff
    ];
    const mt = missionType != null ? missionType : 0;
    if (mt !== 0) {
      p.push(mt & 0xff);
    }
    return p;
  }

  /** MISSION_REQUEST / MISSION_REQUEST_INT 响应解析 */
  function parseMissionRequest(payload, isInt) {
    if (!payload || payload.length < 4) {
      return null;
    }
    const dv =
      payload instanceof Uint8Array
        ? new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
        : new DataView(new Uint8Array(payload).buffer);
    const seq = dv.getUint16(0, true);
    const targetSystem = dv.getUint8(2);
    const targetComponent = dv.getUint8(3);
    if (isInt && payload.length >= 5 && dv.getUint8(4) !== 0) {
      return null;
    }
    return { seq: seq, targetSystem: targetSystem, targetComponent: targetComponent };
  }

  /** MISSION_REQUEST_INT (51) 下行请求 */
  function packMissionRequestInt(targetSystem, targetComponent, seq, missionType) {
    const p = [
      ...u16bytes(seq),
      targetSystem & 0xff,
      targetComponent & 0xff
    ];
    const mt = missionType != null ? missionType : 0;
    if (mt !== 0) {
      p.push(mt & 0xff);
    }
    return p;
  }

  /** MISSION_ACK (47) */
  function parseMissionAck(payload) {
    if (!payload || payload.length < 2) {
      return null;
    }
    const dv =
      payload instanceof Uint8Array
        ? new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
        : new DataView(new Uint8Array(payload).buffer);
    const targetSystem = dv.getUint8(0);
    const targetComponent = dv.getUint8(1);
    let type = 0;
    if (payload.length >= 3) {
      type = dv.getUint8(2);
    }
    let missionType = 0;
    if (payload.length >= 4) {
      missionType = dv.getUint8(3);
    }
    return {
      targetSystem: targetSystem,
      targetComponent: targetComponent,
      type: type,
      missionType: missionType
    };
  }

  /** MISSION_ITEM_INT (73) 线序打包 */
  function packMissionItemInt(item) {
    const p = [
      ...f32bytes(item.param1),
      ...f32bytes(item.param2),
      ...f32bytes(item.param3),
      ...f32bytes(item.param4),
      ...i32bytes(item.x),
      ...i32bytes(item.y),
      ...f32bytes(item.z),
      ...u16bytes(item.seq),
      ...u16bytes(item.command),
      item.target_system & 0xff,
      item.target_component & 0xff,
      item.frame & 0xff,
      item.current & 0xff,
      item.autocontinue & 0xff
    ];
    const mt = item.mission_type != null ? item.mission_type : 0;
    if (mt !== 0) {
      p.push(mt & 0xff);
    }
    return p;
  }

  function parseMissionItemInt(payload) {
    if (!payload || payload.length < 37) {
      return null;
    }
    const dv =
      payload instanceof Uint8Array
        ? new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
        : new DataView(new Uint8Array(payload).buffer);
    return {
      param1: dv.getFloat32(0, true),
      param2: dv.getFloat32(4, true),
      param3: dv.getFloat32(8, true),
      param4: dv.getFloat32(12, true),
      x: dv.getInt32(16, true),
      y: dv.getInt32(20, true),
      z: dv.getFloat32(24, true),
      seq: dv.getUint16(28, true),
      command: dv.getUint16(30, true),
      target_system: dv.getUint8(32),
      target_component: dv.getUint8(33),
      frame: dv.getUint8(34),
      current: dv.getUint8(35),
      autocontinue: dv.getUint8(36),
      mission_type: payload.length > 37 ? dv.getUint8(37) : 0
    };
  }

  function parseMissionItem(payload) {
    if (!payload || payload.length < 37) {
      return null;
    }
    const dv =
      payload instanceof Uint8Array
        ? new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
        : new DataView(new Uint8Array(payload).buffer);
    return {
      param1: dv.getFloat32(0, true),
      param2: dv.getFloat32(4, true),
      param3: dv.getFloat32(8, true),
      param4: dv.getFloat32(12, true),
      x: Math.round(dv.getFloat32(16, true) * 1e7),
      y: Math.round(dv.getFloat32(20, true) * 1e7),
      z: dv.getFloat32(24, true),
      seq: dv.getUint16(28, true),
      command: dv.getUint16(30, true),
      target_system: dv.getUint8(32),
      target_component: dv.getUint8(33),
      frame: dv.getUint8(34),
      current: dv.getUint8(35),
      autocontinue: dv.getUint8(36),
      mission_type: payload.length > 37 ? dv.getUint8(37) : 0
    };
  }

  /** MISSION_ITEM (39) v1 浮点经纬度 */
  function packMissionItem(item) {
    const lat = Number(item.x) / 1e7;
    const lng = Number(item.y) / 1e7;
    return [
      ...f32bytes(item.param1),
      ...f32bytes(item.param2),
      ...f32bytes(item.param3),
      ...f32bytes(item.param4),
      ...f32bytes(lat),
      ...f32bytes(lng),
      ...f32bytes(item.z),
      ...u16bytes(item.seq),
      ...u16bytes(item.command),
      item.target_system & 0xff,
      item.target_component & 0xff,
      item.frame & 0xff,
      item.current & 0xff,
      item.autocontinue & 0xff
    ];
  }

  window.MavlinkMissionPack = {
    packMissionCount: packMissionCount,
    parseMissionRequest: parseMissionRequest,
    packMissionRequestInt: packMissionRequestInt,
    parseMissionAck: parseMissionAck,
    packMissionItemInt: packMissionItemInt,
    parseMissionItemInt: parseMissionItemInt,
    parseMissionItem: parseMissionItem,
    packMissionItem: packMissionItem
  };
})();
