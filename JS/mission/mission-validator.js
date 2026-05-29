(function () {
  const MM = window.MissionModel;
  const VT = window.VehicleTemplates;
  const FWP = window.FixedWingParams;

  if (!MM) {
    return;
  }

  const GRADE_WARN_DEG = VT ? VT.GRADE_WARN_DEG : 20;

  function pushIssue(list, level, code, message) {
    list.push({ level: level, code: code, message: message });
  }

  function hasTakeoff(waypoints) {
    return (waypoints || []).some(function (wp) {
      return (
        wp.command === MM.MAV_CMD.NAV_TAKEOFF ||
        wp.command === MM.MAV_CMD.NAV_VTOL_TAKEOFF
      );
    });
  }

  function countRtl(waypoints) {
    return (waypoints || []).filter(function (wp) {
      return wp.command === MM.MAV_CMD.NAV_RETURN_TO_LAUNCH;
    }).length;
  }

  function validateMission(waypoints, platform, options) {
    const issues = [];
    const list = waypoints || [];
    const pf = platform || "multirotor";
    const opts = options || {};

    if (!list.length) {
      pushIssue(issues, "error", "empty", "任务为空，无法写入飞控");
      return issues;
    }

    if (!hasTakeoff(list)) {
      pushIssue(issues, "error", "no_takeoff", "缺少起飞航点（TAKEOFF / VTOL_TAKEOFF）");
    }

    const rtlCount = countRtl(list);
    if (rtlCount > 1) {
      pushIssue(issues, "error", "rtl_multiple", "存在多个 RTL 返航点，应仅保留任务末尾一个");
    } else if (rtlCount === 1 && list[list.length - 1].command !== MM.MAV_CMD.NAV_RETURN_TO_LAUNCH) {
      pushIssue(issues, "error", "rtl_position", "RTL 返航点必须在任务最后一项");
    }

    list.forEach(function (wp, index) {
      if (!Number.isFinite(wp.lat) || !Number.isFinite(wp.lng)) {
        pushIssue(issues, "error", "coord", "航点 " + (index + 1) + " 坐标无效");
      }
      if (Math.abs(wp.lat) < 0.00001 && Math.abs(wp.lng) < 0.00001) {
        pushIssue(issues, "warning", "zero_coord", "航点 " + (index + 1) + " 接近 0,0 坐标");
      }
    });

    if (pf === "vtol") {
      const hasVtolTakeoff = list.some(function (wp) {
        return wp.command === MM.MAV_CMD.NAV_VTOL_TAKEOFF;
      });
      if (!hasVtolTakeoff) {
        pushIssue(issues, "warning", "vtol_takeoff", "垂起机型建议以 VTOL 起飞航点开始");
      }
      const hasTransitionCmd = list.some(function (wp) {
        return wp.command === MM.MAV_CMD.DO_VTOL_TRANSITION;
      });
      if (hasTransitionCmd) {
        pushIssue(
          issues,
          "warning",
          "vtol_no_transition_cmd",
          "自动模式下无需 DO_VTOL_TRANSITION，请删除模式切换航点"
        );
      }
    }

    if (FWP && FWP.isFixedWingPlatform(pf)) {
      list.forEach(function (wp, index) {
        const seq = index + 1;
        if (wp.command === MM.MAV_CMD.NAV_TAKEOFF && pf === "plane") {
          if (!(Number(wp.param1) > 0)) {
            pushIssue(
              issues,
              "warning",
              "fw_takeoff_pitch",
              "航点 " + seq + " 固定翼起飞缺少俯仰角 param1（建议 " + FWP.FW_TAKEOFF_PITCH_DEG + "°）"
            );
          }
          if (!(Number(wp.alt) > 0 || Number(wp.param7) > 0)) {
            pushIssue(
              issues,
              "warning",
              "fw_takeoff_alt",
              "航点 " + seq + " 固定翼起飞高度为 0，飞控可能不会爬升到指定高度"
            );
          }
        }
        if (wp.command === MM.MAV_CMD.NAV_LOITER_TO_ALT) {
          const p2 = Number(wp.param2) || 0;
          const p3 = Number(wp.param3) || 0;
          if (p2 === 0 && p3 !== 0) {
            pushIssue(
              issues,
              "error",
              "fw_loiter_radius",
              "航点 " +
                seq +
                " LOITER_TO_ALT 半径应写在 param2（Plane），param3=" +
                p3 +
                " 将被飞控忽略"
            );
          } else if (p2 === 0) {
            pushIssue(
              issues,
              "warning",
              "fw_loiter_radius_zero",
              "航点 " + seq + " LOITER_TO_ALT 半径为 0，将使用 WP_LOITER_RAD 默认值"
            );
          }
        }
      });
    }

    if (pf === "plane" || pf === "vtol") {
      for (let i = 1; i < list.length; i += 1) {
        const a = list[i - 1];
        const b = list[i];
        if (
          a.command === MM.MAV_CMD.NAV_RETURN_TO_LAUNCH ||
          b.command === MM.MAV_CMD.NAV_RETURN_TO_LAUNCH
        ) {
          continue;
        }
        if (VT && VT.gradeDegrees) {
          const grade = VT.gradeDegrees(a, b);
          if (grade > GRADE_WARN_DEG) {
            pushIssue(
              issues,
              "warning",
              "grade",
              "航点 " +
                i +
                "→" +
                (i + 1) +
                " 坡度约 " +
                Math.round(grade) +
                "°（超过 " +
                GRADE_WARN_DEG +
                "°）"
            );
          }
        }
      }
    }

    const surveyCount = list.filter(function (wp) {
      return wp.source === "survey";
    }).length;
    if (!surveyCount && pf !== "multirotor") {
      pushIssue(issues, "warning", "no_survey", "任务中尚无测绘航点");
    }

    const usesTerrainFrame = list.some(function (wp) {
      return wp.frame === MM.MAV_FRAME_GLOBAL_TERRAIN_ALT;
    });
    if (usesTerrainFrame) {
      const badSurvey = list.filter(function (wp) {
        return wp.source === "survey" && wp.frame !== MM.MAV_FRAME_GLOBAL_TERRAIN_ALT;
      });
      if (badSurvey.length) {
        pushIssue(
          issues,
          "error",
          "terrain_frame_mixed",
          "地形跟随任务中测绘航点应统一使用 frame 10"
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
    }

    return issues;
  }

  function validateMissionAsync(waypoints, platform, options) {
    const opts = options || {};
    const settings = opts.settings || {};
    const surveyBlocks = opts.surveyBlocks || [];
    const base = validateMission(waypoints, platform, opts);
    const TPV = window.TerrainProfileValidator;
    const TSP = window.TerrainSurveyPlanner;
    if (!TPV) {
      return Promise.resolve(base);
    }

    const usesTerrain =
      settings.useTerrainFollowing ||
      (waypoints || []).some(function (wp) {
        return wp.frame === MM.MAV_FRAME_GLOBAL_TERRAIN_ALT;
      });
    if (!usesTerrain) {
      return Promise.resolve(base);
    }

    return TPV.validateMissionTerrain(waypoints, settings, platform).then(function (terrainIssues) {
      const issues = base.concat(terrainIssues || []);
      if (!TSP || !surveyBlocks.length) {
        return issues;
      }
      let chain = Promise.resolve(issues);
      surveyBlocks.forEach(function (block) {
        const snap = block.paramsSnapshot || settings;
        if (!snap.useTerrainFollowing) {
          return;
        }
        const path = (waypoints || [])
          .filter(function (wp) {
            return wp.blockId === block.id && wp.source === "survey";
          })
          .map(function (wp) {
            return { lat: wp.lat, lng: wp.lng };
          });
        if (path.length < 2) {
          return;
        }
        chain = chain.then(function (acc) {
          return TSP.profileForPath(path, snap).then(function (profile) {
            const profileIssues = TPV.validateTerrainProfile(profile, snap, platform) || [];
            profileIssues.forEach(function (issue) {
              acc.push(
                Object.assign({}, issue, {
                  message: "区域 " + (block.order + 1) + "：" + issue.message
                })
              );
            });
            return acc;
          });
        });
      });
      return chain;
    });
  }

  function hasBlockingErrors(issues) {
    return (issues || []).some(function (item) {
      return item.level === "error";
    });
  }

  window.MissionValidator = {
    validateMission: validateMission,
    validateMissionAsync: validateMissionAsync,
    hasBlockingErrors: hasBlockingErrors
  };
})();
