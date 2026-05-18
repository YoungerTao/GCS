/**
 * ArduPilot / Mission Planner 任务格式兼容：
 * - 文件第 0 行应为 Home（MAV_CMD_NAV_WAYPOINT, frame=0, current=1）
 * - 起飞等指令从第 1 项起（与 MP「确认起点」后保存的 waypoints3 一致）
 */
(function () {
  const MM = window.MissionModel;
  if (!MM) {
    return;
  }

  const CMD = MM.MAV_CMD;
  /** 与 MP 保存的 home 行一致：MAV_FRAME_GLOBAL */
  const MAV_FRAME_GLOBAL = 0;

  function isHomeRow(wp, index) {
    if (!wp) {
      return false;
    }
    if (wp.source === "home" || wp.label === "Home" || wp.label === "HOME") {
      return true;
    }
    return (
      index === 0 &&
      wp.command === CMD.NAV_WAYPOINT &&
      (wp.frame === MAV_FRAME_GLOBAL || wp.frame === 3)
    );
  }

  function homeFromContext(waypoints) {
    const first = waypoints && waypoints[0];
    let lat;
    let lng;
    let alt = 30;
    if (MM && MM.getFlightPlanHomeLatLng) {
      const h = MM.getFlightPlanHomeLatLng();
      lat = h.lat;
      lng = h.lng;
      alt = Number(h.alt) || alt;
    } else if (first && Number.isFinite(first.lat) && Number.isFinite(first.lng)) {
      lat = first.lat;
      lng = first.lng;
      alt = Number(first.alt) || alt;
    } else {
      lat = window.DEFAULT_MAP_LAT || 29.59256;
      lng = window.DEFAULT_MAP_LON || 106.22742;
    }
    return MM.createWaypoint({
      command: CMD.NAV_WAYPOINT,
      frame: MAV_FRAME_GLOBAL,
      lat: lat,
      lng: lng,
      alt: alt,
      param1: 0,
      param2: 0,
      param3: 0,
      param4: 0,
      label: "Home",
      source: "home",
      mapVisible: false
    });
  }

  /** 上传/导出前：若无 Home 行则在队首插入（原 seq0 起飞等整体后移） */
  function expandWithHomeRow(waypoints) {
    const list = MM.renumberWaypoints(waypoints || []);
    if (!list.length) {
      return list;
    }
    if (isHomeRow(list[0], 0)) {
      return list;
    }
    return MM.renumberWaypoints([homeFromContext(list)].concat(list));
  }

  /** 从 MP 文件读入后：去掉仅用于显示的 Home 行，保留起飞与任务航点 */
  function stripHomeRowForEditor(waypoints) {
    const list = MM.renumberWaypoints(waypoints || []);
    if (!list.length || !isHomeRow(list[0], 0)) {
      return list;
    }
    return MM.renumberWaypoints(list.slice(1));
  }

  window.ArdupilotMissionCompat = {
    MAV_FRAME_GLOBAL: MAV_FRAME_GLOBAL,
    isHomeRow: isHomeRow,
    expandWithHomeRow: expandWithHomeRow,
    stripHomeRowForEditor: stripHomeRowForEditor
  };
})();
