(function () {
  const VT = function () {
    return window.VehicleTemplates;
  };
  const TS = function () {
    return window.TerrainService;
  };

  function pointHasTerrain(point) {
    if (!point) {
      return false;
    }
    if (point.available === false) {
      return false;
    }
    return point.elevation != null;
  }

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

  function effectiveAgl(point, baseAgl) {
    const override = point && Number(point.aglOverride);
    return Number.isFinite(override) ? override : baseAgl;
  }

  function validateTerrainProfile(profile, settings, platform) {
    const issues = [];
    const agl = Number(settings.surveyAltitude) || 300;
    const margin = Number(settings.terrainAgMarginM) || 30;
    const maxClimb = Number(settings.terrainMaxClimbRateMps) || 3;
    const maxDescent =
      Number(settings.terrainMaxDescentRateMps) ||
      Number(settings.terrainMaxClimbRateMps) ||
      3;
    const speed = Number(settings.terrainCruiseSpeedMps || settings.speed) || 20;
    const isFw = platform === "plane" || platform === "vtol";
    const pts = profile || [];

    if (!pts.length) {
      pushIssue(issues, "error", "terrain_no_profile", "无地形剖面数据");
      return issues;
    }

    let missing = 0;
    pts.forEach(function (p) {
      if (!pointHasTerrain(p)) {
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
      // 无 DEM 时不做爬升率/坡度校核，避免固定翼误报数百条
      return issues;
    }

    let hMax = -Infinity;
    pts.forEach(function (p) {
      if (p.elevation != null) {
        hMax = Math.max(hMax, p.elevation);
      }
    });

    let clearanceViolation = false;
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1];
      const b = pts[i];
      if (!pointHasTerrain(a) || !pointHasTerrain(b)) {
        continue;
      }
      const aglA = effectiveAgl(a, agl);
      const aglB = effectiveAgl(b, agl);
      const targetA = a.elevation + aglA;
      const targetB = b.elevation + aglB;
      const dist = haversineM(a, b);
      if (dist < 1) {
        continue;
      }
      if (isFw && (aglA < margin || aglB < margin)) {
        clearanceViolation = true;
      }
      const dt = dist / Math.max(1, speed);
      const delta = targetB - targetA;
      const rate = Math.abs(delta) / dt;
      const ascending = delta >= 0;
      const limit = ascending ? maxClimb : maxDescent;
      if (rate > limit) {
        pushIssue(
          issues,
          isFw ? "error" : "warning",
          "terrain_climb_rate",
          "剖面段所需" +
            (ascending ? "爬升率" : "下降率") +
            "约 " +
            rate.toFixed(1) +
            " m/s（超过 " +
            limit +
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

    if (clearanceViolation) {
      pushIssue(
        issues,
        "error",
        "terrain_clearance",
        "修正后仍有航段离地高度低于安全裕度（" + margin + " m），存在触地风险"
      );
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

  /** 合并重复校核项，避免 UI 刷屏（尤其固定翼爬升率逐段报错） */
  function summarizeTerrainIssues(issues) {
    const list = issues || [];
    if (!list.length) {
      return [];
    }
    const out = [];
    const climbSegs = [];
    const gradeSegs = [];
    list.forEach(function (issue) {
      if (!issue) {
        return;
      }
      if (issue.code === "terrain_climb_rate") {
        climbSegs.push(issue);
        return;
      }
      if (issue.code === "terrain_grade") {
        gradeSegs.push(issue);
        return;
      }
      out.push(issue);
    });
    if (climbSegs.length) {
      let maxRate = 0;
      climbSegs.forEach(function (i) {
        const m = String(i.message || "").match(/([\d.]+)\s*m\/s/);
        if (m) {
          maxRate = Math.max(maxRate, Number(m[1]) || 0);
        }
      });
      const thresholdMatch = String(climbSegs[0].message || "").match(/超过\s*([\d.]+)\s*m\/s/);
      const threshold = thresholdMatch ? thresholdMatch[1] : "3";
      out.push({
        level: climbSegs[0].level || "error",
        code: "terrain_climb_rate_summary",
        message:
          climbSegs.length +
          " 个剖面段所需爬升率超过 " +
          threshold +
          " m/s" +
          (maxRate > 0 ? "（最大约 " + maxRate.toFixed(1) + " m/s）" : "") +
          "；固定翼请增大航向优化权重、启用自动切块、降低测区高差或改用更高 AGL"
      });
    }
    if (gradeSegs.length) {
      let maxGrade = 0;
      gradeSegs.forEach(function (i) {
        const m = String(i.message || "").match(/([\d.]+)°/);
        if (m) {
          maxGrade = Math.max(maxGrade, Number(m[1]) || 0);
        }
      });
      out.push({
        level: gradeSegs[0].level || "warning",
        code: "terrain_grade_summary",
        message:
          gradeSegs.length +
          " 个剖面段坡度偏大" +
          (maxGrade > 0 ? "（最大约 " + Math.round(maxGrade) + "°）" : "") +
          "；建议沿等高线方向测线或拆分测区"
      });
    }
    return out;
  }

  function validateMissionTerrain(waypoints, settings, platform) {
    const issues = [];
    if (!settings || !settings.useTerrainFollowing) {
      return Promise.resolve(issues);
    }
    const MM = window.MissionModel;
    if (!MM) {
      return Promise.resolve(issues);
    }
    const list = waypoints || [];
    const survey = list.filter(function (wp) {
      return wp.source === "survey";
    });
    if (!survey.length) {
      return Promise.resolve(issues);
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
    validateMissionTerrain: validateMissionTerrain,
    summarizeTerrainIssues: summarizeTerrainIssues
  };
})();
