(function () {
  const MAV_FRAME_GLOBAL_RELATIVE_ALT_INT = 6;

  const MAV_CMD = {
    NAV_WAYPOINT: 16,
    NAV_LOITER_TO_ALT: 31,
    NAV_TAKEOFF: 22,
    NAV_VTOL_TAKEOFF: 84,
    NAV_RETURN_TO_LAUNCH: 20
  };

  const CMD_LABELS = {
    16: "航点",
    31: "盘旋",
    22: "起飞",
    84: "垂起起飞",
    20: "返航"
  };

  const ROLE_MAP_LABELS = {
    22: "起飞",
    84: "垂起起飞",
    31: "盘旋",
    20: "返航"
  };

  function round6(n) {
    return Math.round(Number(n) * 1e6) / 1e6;
  }

  function createWaypoint(partial) {
    const wp = Object.assign(
      {
        lng: 0,
        lat: 0,
        alt: 0,
        command: MAV_CMD.NAV_WAYPOINT,
        frame: MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
        param1: 0,
        param2: 0,
        param3: 0,
        param4: 0,
        locked: false,
        label: "",
        source: "manual"
      },
      partial || {}
    );
    wp.lng = round6(wp.lng);
    wp.lat = round6(wp.lat);
    wp.alt = Number(wp.alt) || 0;
    return wp;
  }

  function getCommandLabel(command) {
    return CMD_LABELS[command] || "航点";
  }

  function getMapRoleLabel(wp) {
    if (wp && wp.label) {
      return wp.label;
    }
    return ROLE_MAP_LABELS[wp.command] || "";
  }

  function getDisplayTitle(wp, index) {
    if (wp.label) {
      return wp.label;
    }
    if (ROLE_MAP_LABELS[wp.command]) {
      return ROLE_MAP_LABELS[wp.command];
    }
    return getCommandLabel(wp.command) + " " + (index + 1);
  }

  function renumberWaypoints(list) {
    return (list || []).map(function (wp, index) {
      return Object.assign({}, wp, { seq: index });
    });
  }

  function stripSurveyWaypoints(list) {
    return (list || []).filter(function (wp) {
      return wp.source !== "survey";
    });
  }

  function stripRtlWaypoints(list) {
    return (list || []).filter(function (wp) {
      return wp.command !== MAV_CMD.NAV_RETURN_TO_LAUNCH;
    });
  }

  function appendRtlWaypoint(list) {
    const base = stripRtlWaypoints(list);
    const last = base[base.length - 1];
    const rtl = createWaypoint({
      lng: last ? last.lng : 0,
      lat: last ? last.lat : 0,
      alt: 0,
      command: MAV_CMD.NAV_RETURN_TO_LAUNCH,
      frame: MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
      label: "返航",
      source: "template"
    });
    return renumberWaypoints(base.concat([rtl]));
  }

  function surveyPointsToWaypoints(points, altitude) {
    return (points || []).map(function (point) {
      return createWaypoint({
        lng: point.lng,
        lat: point.lat,
        alt: altitude,
        command: MAV_CMD.NAV_WAYPOINT,
        source: "survey"
      });
    });
  }

  function mergeSurveyIntoMission(mission, surveyPoints, altitude, appendRtl) {
    let next = stripSurveyWaypoints(stripRtlWaypoints(mission));
    next = next.concat(surveyPointsToWaypoints(surveyPoints, altitude));
    if (appendRtl) {
      next = appendRtlWaypoint(next);
    }
    return renumberWaypoints(next);
  }

  function appendSurveyIntoMission(mission, surveyPoints, altitude, appendRtl) {
    let next = stripRtlWaypoints(mission);
    next = next.concat(surveyPointsToWaypoints(surveyPoints, altitude));
    if (appendRtl) {
      next = appendRtlWaypoint(next);
    }
    return renumberWaypoints(next);
  }

  function isVehicleConnected() {
    return window._gcsConnState === "connected";
  }

  function getTakeoffLatLng() {
    if (isVehicleConnected()) {
      const fix = Number(window.gps_fix_type);
      const lat = window.lat;
      const lon = window.lon;
      if (
        Number.isFinite(fix) &&
        fix >= 2 &&
        Number.isFinite(lat) &&
        Number.isFinite(lon)
      ) {
        return { lat: lat, lng: lon };
      }
    }
    if (typeof window.getMapCenterLatLng === "function") {
      const c = window.getMapCenterLatLng();
      return { lat: c[0], lng: c[1] };
    }
    return {
      lat: window.DEFAULT_MAP_LAT || 29.59256,
      lng: window.DEFAULT_MAP_LON || 106.22742
    };
  }

  window.MissionModel = {
    MAV_CMD: MAV_CMD,
    MAV_FRAME_GLOBAL_RELATIVE_ALT_INT: MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
    createWaypoint: createWaypoint,
    getCommandLabel: getCommandLabel,
    getMapRoleLabel: getMapRoleLabel,
    getDisplayTitle: getDisplayTitle,
    renumberWaypoints: renumberWaypoints,
    stripSurveyWaypoints: stripSurveyWaypoints,
    stripRtlWaypoints: stripRtlWaypoints,
    appendRtlWaypoint: appendRtlWaypoint,
    surveyPointsToWaypoints: surveyPointsToWaypoints,
    mergeSurveyIntoMission: mergeSurveyIntoMission,
    appendSurveyIntoMission: appendSurveyIntoMission,
    isVehicleConnected: isVehicleConnected,
    getTakeoffLatLng: getTakeoffLatLng
  };
})();
