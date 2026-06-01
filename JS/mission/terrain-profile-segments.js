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

  function pointHasTerrain(point) {
    if (!point) {
      return false;
    }
    if (point.available === false) {
      return false;
    }
    return point.elevation != null;
  }

  function effectiveAgl(point, baseAgl) {
    const override = point && Number(point.aglOverride);
    return Number.isFinite(override) ? override : baseAgl;
  }

  function findProfileProblemSegments(profile, settings, platform) {
    const issues = [];
    const agl = Number(settings && settings.surveyAltitude) || 300;
    const maxClimb = Number(settings && settings.terrainMaxClimbRateMps) || 4;
    const maxDescent =
      Number(settings && settings.terrainMaxDescentRateMps) ||
      Number(settings && settings.terrainMaxClimbRateMps) ||
      4;
    const speed = Number(settings && settings.terrainCruiseSpeedMps || (settings && settings.speed)) || 20;
    const isFw = platform === "plane" || platform === "vtol";
    const pts = profile || [];

    let missing = 0;
    pts.forEach(function (p) {
      if (!pointHasTerrain(p)) {
        missing += 1;
      }
    });
    if (missing > pts.length * 0.2) {
      return issues;
    }

    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1];
      const b = pts[i];
      if (!pointHasTerrain(a) || !pointHasTerrain(b)) {
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
      const targetA = a.elevation + effectiveAgl(a, agl);
      const targetB = b.elevation + effectiveAgl(b, agl);
      const dist = haversineM(a, b);
      if (dist < 1) {
        continue;
      }
      const dt = dist / Math.max(1, speed);
      const delta = targetB - targetA;
      const climbRate = Math.abs(delta) / dt;
      const limit = delta >= 0 ? maxClimb : maxDescent;
      if (climbRate > limit) {
        issues.push({
          fromIndex: i - 1,
          toIndex: i,
          level: isFw ? "error" : "warning",
          code: "terrain_climb_rate",
          climbRate: climbRate,
          tone: climbRate > 6 ? "danger" : "warn",
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
