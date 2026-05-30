/**
 * Profile segment analysis for map highlighting and sparkline errors.
 */
(function () {
  const SP = function () {
    return window.SurveyPlanner;
  };

  function haversineM(a, b) {
    const sp = SP();
    if (sp && sp.distanceMetersBetween) {
      return sp.distanceMetersBetween(a, b);
    }
    const R = 6371000;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function findProfileProblemSegments(profile, settings, platform) {
    const issues = [];
    const agl = Number(settings && settings.surveyAltitude) || 300;
    const maxClimb = Number(settings && settings.terrainMaxClimbRateMps) || 3;
    const speed = Number(settings && settings.terrainCruiseSpeedMps || (settings && settings.speed)) || 20;
    const isFw = platform === "plane" || platform === "vtol";
    const pts = profile || [];

    let missing = 0;
    pts.forEach(function (p) {
      if (!p.available || p.elevation == null) {
        missing += 1;
      }
    });
    if (missing > pts.length * 0.2) {
      return issues;
    }

    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1];
      const b = pts[i];
      if (!a.available || !b.available || a.elevation == null || b.elevation == null) {
        issues.push({
          fromIndex: i - 1,
          toIndex: i,
          level: "error",
          code: "terrain_dem_missing",
          latlngs: [
            { lat: a.lat, lng: a.lng },
            { lat: b.lat, lng: b.lng }
          ]
        });
        continue;
      }
      const targetA = a.elevation + agl;
      const targetB = b.elevation + agl;
      const dist = haversineM(a, b);
      if (dist < 1) {
        continue;
      }
      const dt = dist / Math.max(1, speed);
      const climbRate = Math.abs(targetB - targetA) / dt;
      if (climbRate > maxClimb) {
        issues.push({
          fromIndex: i - 1,
          toIndex: i,
          level: isFw ? "error" : "warning",
          code: "terrain_climb_rate",
          climbRate: climbRate,
          latlngs: [
            { lat: a.lat, lng: a.lng },
            { lat: b.lat, lng: b.lng }
          ]
        });
      }
    }
    return issues;
  }

  function profileSegmentErrorSet(profile, settings, platform) {
    const set = {};
    findProfileProblemSegments(profile, settings, platform).forEach(function (seg) {
      if (seg.level === "error") {
        set[seg.fromIndex + "-" + seg.toIndex] = true;
      }
    });
    return set;
  }

  window.TerrainProfileSegments = {
    findProfileProblemSegments: findProfileProblemSegments,
    profileSegmentErrorSet: profileSegmentErrorSet
  };
})();
