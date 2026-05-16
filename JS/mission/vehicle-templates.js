(function () {
  const MM = window.MissionModel;
  if (!MM) {
    return;
  }

  const PLATFORM_OPTIONS = [
    { id: "multirotor", label: "多旋翼" },
    { id: "plane", label: "固定翼" },
    { id: "vtol", label: "垂起降固定翼" }
  ];

  const LOITER_DISTANCE_THRESHOLD_M = 200;
  const GRADE_WARN_DEG = 20;

  function getFrameParamKeys() {
    const p = window.params;
    if (!(p instanceof Map)) {
      return null;
    }
    if (p.has("FRAME_CLASS") && p.has("FRAME_TYPE")) {
      return { classKey: "FRAME_CLASS", typeKey: "FRAME_TYPE" };
    }
    if (p.has("Q_FRAME_CLASS") && p.has("Q_FRAME_TYPE")) {
      return { classKey: "Q_FRAME_CLASS", typeKey: "Q_FRAME_TYPE" };
    }
    return null;
  }

  function getParamNum(name) {
    const p = window.params;
    if (!(p instanceof Map) || !p.has(name)) {
      return null;
    }
    const v = Number(p.get(name));
    return Number.isFinite(v) ? v : null;
  }

  function detectVehiclePlatform() {
    const keys = getFrameParamKeys();
    if (keys && keys.classKey.startsWith("Q_")) {
      return "vtol";
    }
    const fc = keys ? getParamNum(keys.classKey) : null;
    if (fc != null && [1, 2, 3, 4, 5, 7, 12, 13, 14].includes(Math.round(fc))) {
      return "multirotor";
    }
    if (keys && keys.classKey === "FRAME_CLASS") {
      return "plane";
    }
    return "multirotor";
  }

  function offsetLatLngMeters(origin, bearingDeg, distanceM) {
    const R = 6378137;
    const br = (bearingDeg * Math.PI) / 180;
    const lat1 = (origin.lat * Math.PI) / 180;
    const lng1 = (origin.lng * Math.PI) / 180;
    const dr = distanceM / R;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(dr) + Math.cos(lat1) * Math.sin(dr) * Math.cos(br)
    );
    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(br) * Math.sin(dr) * Math.cos(lat1),
        Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2)
      );
    return {
      lat: (lat2 * 180) / Math.PI,
      lng: (lng2 * 180) / Math.PI
    };
  }

  function horizontalDistanceM(a, b) {
    const R = 6378137;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;
    const dLat = lat2 - lat1;
    const dLng = (((b.lng - a.lng) * Math.PI) / 180) * Math.cos((lat1 + lat2) / 2);
    return Math.sqrt(dLat * dLat + dLng * dLng) * R;
  }

  function gradeDegrees(wp1, wp2) {
    const dist = horizontalDistanceM(wp1, wp2);
    if (dist < 0.5) {
      return 0;
    }
    const alt1 = Number(wp1.alt) || 0;
    const alt2 = Number(wp2.alt) || 0;
    return (Math.atan2(Math.abs(alt2 - alt1), dist) * 180) / Math.PI;
  }

  function gradeSegmentColor(wp1, wp2) {
    return gradeDegrees(wp1, wp2) > GRADE_WARN_DEG ? "#f44336" : "#f0c24f";
  }

  function buildBootstrapWaypoints(platform, origin, connected) {
    const takeoff = Object.assign({}, origin);
    const locked = Boolean(connected);
    const list = [];

    if (platform === "multirotor") {
      list.push(
        MM.createWaypoint({
          lng: takeoff.lng,
          lat: takeoff.lat,
          alt: 30,
          command: MM.MAV_CMD.NAV_TAKEOFF,
          param7: 30,
          locked: locked,
          label: "起飞",
          source: "template"
        })
      );
      const g2 = offsetLatLngMeters(takeoff, 0, 100);
      const g3 = offsetLatLngMeters(takeoff, 90, 100);
      list.push(
        MM.createWaypoint({
          lng: g2.lng,
          lat: g2.lat,
          alt: 30,
          label: "引导点2",
          source: "template"
        }),
        MM.createWaypoint({
          lng: g3.lng,
          lat: g3.lat,
          alt: 30,
          label: "引导点3",
          source: "template"
        })
      );
      return MM.renumberWaypoints(list);
    }

    if (platform === "vtol") {
      list.push(
        MM.createWaypoint({
          lng: takeoff.lng,
          lat: takeoff.lat,
          alt: 40,
          command: MM.MAV_CMD.NAV_VTOL_TAKEOFF,
          param7: 40,
          locked: locked,
          label: "垂起起飞",
          source: "template"
        })
      );
    } else {
      list.push(
        MM.createWaypoint({
          lng: takeoff.lng,
          lat: takeoff.lat,
          alt: 0,
          command: MM.MAV_CMD.NAV_TAKEOFF,
          param7: 0,
          locked: locked,
          label: "起飞",
          source: "template"
        })
      );
    }

    const guide = offsetLatLngMeters(takeoff, 0, 150);
    list.push(
      MM.createWaypoint({
        lng: guide.lng,
        lat: guide.lat,
        alt: 50,
        label: "起飞引导",
        source: "template"
      })
    );

    const withLoiter = maybeInsertLoiter(list, platform === "vtol" ? 40 : 0);
    const cruise = offsetLatLngMeters(
      withLoiter[withLoiter.length - 1],
      45,
      120
    );
    withLoiter.push(
      MM.createWaypoint({
        lng: cruise.lng,
        lat: cruise.lat,
        alt: 300,
        label: "巡航航点",
        source: "template"
      })
    );
    return MM.renumberWaypoints(withLoiter);
  }

  function maybeInsertLoiter(waypoints, vtolTakeoffAlt) {
    const list = waypoints.slice();
    if (list.length < 2) {
      return list;
    }
    const wp1 = list[0];
    const wp2 = list[1];
    const dist = horizontalDistanceM(wp1, wp2);
    if (dist <= LOITER_DISTANCE_THRESHOLD_M) {
      return list;
    }
    const loiterPos = Object.assign({}, wp2);
    const gradeBaseAlt =
      wp1.command === MM.MAV_CMD.NAV_VTOL_TAKEOFF
        ? Number(vtolTakeoffAlt) || Number(wp1.alt) || 40
        : Number(wp2.alt) || 50;
    list.splice(
      2,
      0,
      MM.createWaypoint({
        lng: loiterPos.lng,
        lat: loiterPos.lat,
        alt: 300,
        command: MM.MAV_CMD.NAV_LOITER_TO_ALT,
        param1: 0,
        param2: 0,
        param3: -120,
        param4: 0,
        label: "盘旋",
        source: "template"
      })
    );
    if (wp1.command === MM.MAV_CMD.NAV_VTOL_TAKEOFF) {
      list[1] = Object.assign({}, list[1], {
        alt: gradeBaseAlt
      });
    }
    return list;
  }

  function refreshLoiterForMission(waypoints, platform) {
    const base = waypoints.filter(function (wp) {
      return wp.command !== MM.MAV_CMD.NAV_LOITER_TO_ALT || wp.source !== "template";
    });
    if (platform === "multirotor" || base.length < 2) {
      return MM.renumberWaypoints(base);
    }
    const wp1 = base[0];
    const wp2 = base[1];
    const dist = horizontalDistanceM(wp1, wp2);
    if (dist <= LOITER_DISTANCE_THRESHOLD_M) {
      return MM.renumberWaypoints(base);
    }
    const vtolAlt = platform === "vtol" ? Number(wp1.alt) || 40 : 0;
    const rebuilt = base.slice(0, 2);
    rebuilt.push(
      MM.createWaypoint({
        lng: wp2.lng,
        lat: wp2.lat,
        alt: 300,
        command: MM.MAV_CMD.NAV_LOITER_TO_ALT,
        param3: -120,
        label: "盘旋",
        source: "template"
      })
    );
    for (let i = 2; i < base.length; i++) {
      if (base[i].source === "template" && base[i].label === "盘旋") {
        continue;
      }
      rebuilt.push(base[i]);
    }
    return MM.renumberWaypoints(rebuilt);
  }

  function syncTakeoffFromVehicle(waypoints, connected) {
    if (!connected || !waypoints.length) {
      return waypoints;
    }
    const origin = MM.getTakeoffLatLng();
    const next = waypoints.slice();
    const wp0 = Object.assign({}, next[0], {
      lat: origin.lat,
      lng: origin.lng,
      locked: true
    });
    next[0] = wp0;
    return next;
  }

  window.VehicleTemplates = {
    PLATFORM_OPTIONS: PLATFORM_OPTIONS,
    LOITER_DISTANCE_THRESHOLD_M: LOITER_DISTANCE_THRESHOLD_M,
    GRADE_WARN_DEG: GRADE_WARN_DEG,
    detectVehiclePlatform: detectVehiclePlatform,
    buildBootstrapWaypoints: buildBootstrapWaypoints,
    maybeInsertLoiter: maybeInsertLoiter,
    refreshLoiterForMission: refreshLoiterForMission,
    gradeDegrees: gradeDegrees,
    gradeSegmentColor: gradeSegmentColor,
    horizontalDistanceM: horizontalDistanceM,
    offsetLatLngMeters: offsetLatLngMeters,
    syncTakeoffFromVehicle: syncTakeoffFromVehicle
  };
})();
