(function () {
  const VT = function () {
    return window.VehicleTemplates;
  };
  const TS = function () {
    return window.TerrainService;
  };

  function pushIssue(issues, level, code, message) {
    issues.push({ level: level, code: code, message: message });
  }

  function haversineM(a, b) {
    const SP = window.SurveyPlanner;
    if (SP && SP.distanceMetersBetween) {
      return SP.distanceMetersBetween(a, b);
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

  function validateTerrainProfile(profile, settings, platform) {
    const issues = [];
    const agl = Number(settings.surveyAltitude) || 300;
    const margin = Number(settings.terrainAgMarginM) || 30;
    const maxClimb = Number(settings.terrainMaxClimbRateMps) || 3;
    const speed = Number(settings.terrainCruiseSpeedMps || settings.speed) || 20;
    const isFw = platform === "plane" || platform === "vtol";
    const pts = profile || [];

    if (!pts.length) {
      pushIssue(issues, "error", "terrain_no_profile", "无地形剖面数据");
      return issues;
    }

    let missing = 0;
    pts.forEach(function (p) {
      if (!p.available || p.elevation == null) {
        missing += 1;
      }
    });
    if (missing > pts.length * 0.2) {
      pushIssue(
        issues,
        "error",
        "terrain_dem_missing",
        "地形数据缺失（" + missing + "/" + pts.length + " 点无高程），请预取地形"
      );
    }

    let hMax = -Infinity;
    pts.forEach(function (p) {
      if (p.elevation != null) {
        hMax = Math.max(hMax, p.elevation);
      }
    });

    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1];
      const b = pts[i];
      if (a.elevation == null || b.elevation == null) {
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
        pushIssue(
          issues,
          isFw ? "error" : "warning",
          "terrain_climb_rate",
          "剖面段所需爬升率约 " +
            climbRate.toFixed(1) +
            " m/s（超过 " +
            maxClimb +
            " m/s）"
        );
      }
      const templates = VT();
      if (templates && templates.gradeDegrees) {
        const grade = templates.gradeDegrees(
          { lat: a.lat, lng: a.lng, alt: targetA },
          { lat: b.lat, lng: b.lng, alt: targetB }
        );
        if (grade > 20) {
          pushIssue(
            issues,
            "warning",
            "terrain_grade",
            "地形剖面坡度约 " + Math.round(grade) + "°"
          );
        }
      }
    }

    if (Number.isFinite(hMax) && agl < margin) {
      pushIssue(
        issues,
        "warning",
        "terrain_low_agl",
        "航测离地高度较低，建议增加安全裕度"
      );
    }

    return issues;
  }

  function validateMissionTerrain(waypoints, settings, platform) {
    const issues = [];
    if (!settings || !settings.useTerrainFollowing) {
      return issues;
    }
    const MM = window.MissionModel;
    if (!MM) {
      return issues;
    }
    const list = waypoints || [];
    const survey = list.filter(function (wp) {
      return wp.source === "survey";
    });
    if (!survey.length) {
      return issues;
    }

    const wrongFrame = survey.some(function (wp) {
      return wp.frame !== MM.MAV_FRAME_GLOBAL_TERRAIN_ALT;
    });
    if (wrongFrame) {
      pushIssue(
        issues,
        "error",
        "terrain_frame",
        "地形跟随任务应使用地形高度帧（frame 10）"
      );
    }

    if (window.params instanceof Map && window.params.has("TERRAIN_ENABLE")) {
      const te = Number(window.params.get("TERRAIN_ENABLE"));
      if (te !== 1) {
        pushIssue(
          issues,
          "warning",
          "terrain_enable_off",
          "飞控 TERRAIN_ENABLE 未启用，地形跟随可能无效"
        );
      }
    }

    const ts = TS();
    if (ts && typeof ts.isTerrainAvailable === "function") {
      return ts.isTerrainAvailable().then(function (ok) {
        if (!ok) {
          pushIssue(
            issues,
            "error",
            "terrain_service_offline",
            "地形服务不可用，请启动瓦片服务并预取地形"
          );
        }
        return issues;
      });
    }
    return Promise.resolve(issues);
  }

  window.TerrainProfileValidator = {
    validateTerrainProfile: validateTerrainProfile,
    validateMissionTerrain: validateMissionTerrain
  };
})();
