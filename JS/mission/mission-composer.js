(function () {
  const MM = window.MissionModel;
  const SP = window.SurveyPlanner;
  const VT = window.VehicleTemplates;
  const FWP = window.FixedWingParams;

  if (!MM) {
    return;
  }

  const CONNECTOR_THRESHOLD_M = SP ? SP.CONNECTOR_THRESHOLD_M : 80;

  function createBlockId() {
    return "sb-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  }

  function cloneParamsSnapshot(settings) {
    const footprintHeightMeters = Number(settings.footprintHeightMeters) || 0;
    const forwardOverlap = Number(settings.forwardOverlap) || 0.7;
    const triggerDistanceMeters =
      SP && SP.computeCameraTriggerDistanceMeters
        ? SP.computeCameraTriggerDistanceMeters(footprintHeightMeters, forwardOverlap)
        : Math.max(0.5, footprintHeightMeters * (1 - forwardOverlap));

    return {
      surveyAltitude: Number(settings.surveyAltitude) || 300,
      sideOverlap: Number(settings.sideOverlap) || 0.7,
      forwardOverlap: forwardOverlap,
      turnAroundMeters: Number(settings.turnAroundMeters) || 0,
      surveyEntryCorner: settings.surveyEntryCorner || "top-left",
      surveyHeadingDeg:
        settings.surveyHeadingDeg == null || settings.surveyHeadingDeg === ""
          ? null
          : Number(settings.surveyHeadingDeg),
      footprintWidthMeters: Number(settings.footprintWidthMeters) || 60,
      footprintHeightMeters: footprintHeightMeters,
      triggerDistanceMeters: triggerDistanceMeters,
      lineSpacingMeters: Number(settings.lineSpacingMeters) || null,
      useTerrainFollowing: Boolean(settings.useTerrainFollowing),
      terrainAgMarginM: Number(settings.terrainAgMarginM) || 30,
      terrainAutoPartition: settings.terrainAutoPartition !== false,
      terrainMaxReliefM: Number(settings.terrainMaxReliefM) || 120,
      terrainMaxClimbRateMps: Number(settings.terrainMaxClimbRateMps) || 3,
      terrainCruiseSpeedMps:
        Number(settings.terrainCruiseSpeedMps || settings.speed) || 20,
      terrainPrefetchOnDraw: settings.terrainPrefetchOnDraw !== false
    };
  }

  function resolveSurveyFrame(snapshot) {
    if (snapshot && snapshot.useTerrainFollowing) {
      return MM.MAV_FRAME_GLOBAL_TERRAIN_ALT;
    }
    return MM.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT;
  }

  function pathOptionsFromSnapshot(snapshot, lineSpacingMeters) {
    const opts = {
      turnAroundMeters: snapshot.turnAroundMeters,
      entryCorner: snapshot.surveyEntryCorner,
      footprintWidthMeters: snapshot.footprintWidthMeters,
      lineSpacingMeters: lineSpacingMeters
    };
    if (snapshot.surveyHeadingDeg != null && Number.isFinite(snapshot.surveyHeadingDeg)) {
      opts.headingDegrees = snapshot.surveyHeadingDeg;
    }
    return opts;
  }

  function lastMissionPoint(waypoints) {
    const list = waypoints || [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const wp = list[i];
      if (wp.command === MM.MAV_CMD.NAV_RETURN_TO_LAUNCH) {
        continue;
      }
      return wp;
    }
    return null;
  }

  function firstSurveyPoint(points) {
    return points && points.length ? points[0] : null;
  }

  function buildConnectorWaypoints(from, to, altitude, platform, blockId, snapshot) {
    if (!from || !to || !SP) {
      return [];
    }
    const frame = resolveSurveyFrame(snapshot);
    const mids = SP.buildConnectorPoints(from, to, CONNECTOR_THRESHOLD_M);
    const list = [];

    mids.forEach(function (p, index) {
      list.push(
        MM.createWaypoint({
          lng: p.lng,
          lat: p.lat,
          alt: altitude,
          frame: frame,
          command: MM.MAV_CMD.NAV_WAYPOINT,
          source: "connector",
          segmentRole: "connector",
          blockId: blockId,
          label: index === 0 ? "过渡" : "",
          locked: false
        })
      );
    });

    return list;
  }

  function surveyPointsToWaypoints(points, altitude, platform, blockId, snapshot) {
    const isFw = platform === "plane" || platform === "vtol";
    const frame = resolveSurveyFrame(snapshot);
    return (points || []).map(function (point, index) {
      const role = point.segmentRole || "transect";
      const pathRole = point.pathRole || "";
      const partial = {
        lng: point.lng,
        lat: point.lat,
        alt: altitude,
        frame: frame,
        source: "survey",
        segmentRole: role,
        pathRole: pathRole,
        blockId: blockId,
        label: "",
        row: point.row,
        segment: point.segment,
        transectIndex: point.transectIndex
      };
      if (isFw && role === "turn") {
        partial.command = MM.MAV_CMD.NAV_LOITER_TO_ALT;
        partial.label = "转弯";
        if (FWP) {
          Object.assign(
            partial,
            FWP.planeLoiterToAltFields(
              FWP.signedLoiterRadiusMeters(FWP.FW_SURVEY_TURN_LOITER_RADIUS_M, true),
              altitude,
              FWP.FW_LOITER_XTRACK_TANGENT
            )
          );
        }
      } else {
        partial.command = MM.MAV_CMD.NAV_WAYPOINT;
      }
      if (point.label) {
        partial.label = point.label;
      } else if (index === 0) {
        partial.label = "测线";
      }
      return MM.createWaypoint(partial);
    });
  }

  function surveyWaypointsWithCameraCommands(surveyWaypoints, snapshot) {
    const triggerDistanceMeters =
      snapshot && Number(snapshot.triggerDistanceMeters) > 0
        ? Number(snapshot.triggerDistanceMeters)
        : SP && snapshot
          ? SP.computeCameraTriggerDistanceMeters(
              snapshot.footprintHeightMeters,
              snapshot.forwardOverlap
            )
          : 10;
    return MM.appendSurveyCameraCommands(surveyWaypoints, triggerDistanceMeters);
  }

  function stripSurveyByBlockId(list, blockId) {
    return (list || []).filter(function (wp) {
      return wp.blockId !== blockId;
    });
  }

  function stripAllSurveyAndConnector(list) {
    return (list || []).filter(function (wp) {
      return (
        wp.source !== "survey" && wp.source !== "connector" && wp.source !== "camera"
      );
    });
  }

  function appendBlockToMission(mission, block, platform, appendRtl) {
    const snapshot = block.paramsSnapshot || {};
    const altitude = snapshot.surveyAltitude;
    const lineSpacing =
      snapshot.lineSpacingMeters ||
      Math.max(4, (snapshot.footprintWidthMeters || 60) * (1 - (snapshot.sideOverlap || 0.7)));

    let pathOpts = pathOptionsFromSnapshot(snapshot, lineSpacing);
    if (snapshot.surveyHeadingDeg == null && SP && SP.pickBestSurveyHeadingDegrees) {
      const autoDeg = SP.pickBestSurveyHeadingDegrees(
        block.polygon,
        snapshot.sideOverlap,
        pathOpts
      );
      if (autoDeg != null) {
        pathOpts.headingDegrees = autoDeg;
        snapshot.surveyHeadingDeg = autoDeg;
      }
    }

    const rawPath = SP
      ? SP.generateSurveyPath(block.polygon, snapshot.sideOverlap, pathOpts)
      : [];
    const routePoints = SP
      ? SP.buildSurveyMissionLegsFromPath
        ? SP.buildSurveyMissionLegsFromPath(rawPath, platform)
        : SP.extractSurveyRouteWaypoints(rawPath, platform)
      : block.polygon;

    let next = MM.stripRtlWaypoints(mission);
    const prev = lastMissionPoint(next);
    const first = firstSurveyPoint(routePoints);

    if (prev && first) {
      next = next.concat(
        buildConnectorWaypoints(prev, first, altitude, platform, block.id, snapshot)
      );
    }

    const surveyNavWaypoints = surveyPointsToWaypoints(
      routePoints,
      altitude,
      platform,
      block.id,
      snapshot
    );
    next = next.concat(
      surveyWaypointsWithCameraCommands(surveyNavWaypoints, snapshot)
    );

    if (appendRtl) {
      next = MM.appendRtlWaypoint(next);
    }

    if (FWP && FWP.normalizeWaypointsForPlatform) {
      next = FWP.normalizeWaypointsForPlatform(next, platform);
    }
    next = MM.renumberWaypoints(next);
    if (MM.applySurveyMapVisibility) {
      MM.applySurveyMapVisibility(next);
    }

    block.waypointCount = routePoints.length;
    block.paramsSnapshot = snapshot;

    return {
      waypoints: next,
      block: block,
      addedCount: routePoints.length
    };
  }

  function rebuildMissionFromBlocks(bootstrapWaypoints, blocks, platform, appendRtl) {
    let mission = stripAllSurveyAndConnector(MM.stripRtlWaypoints(bootstrapWaypoints || []));
    const ordered = (blocks || []).slice().sort(function (a, b) {
      return (a.order || 0) - (b.order || 0);
    });

    ordered.forEach(function (block) {
      const result = appendBlockToMission(mission, block, platform, false);
      mission = result.waypoints;
    });

    if (appendRtl) {
      mission = MM.appendRtlWaypoint(mission);
    }
    if (FWP && FWP.normalizeWaypointsForPlatform) {
      mission = FWP.normalizeWaypointsForPlatform(mission, platform);
    }
    return mission;
  }

  function removeLastBlock(mission, blocks) {
    if (!blocks.length) {
      return { waypoints: mission, blocks: [] };
    }
    const nextBlocks = blocks.slice(0, -1);
    const removed = blocks[blocks.length - 1];
    let next = (mission || []).filter(function (wp) {
      return wp.blockId !== removed.id;
    });
    next = next.filter(function (wp) {
      return !(wp.source === "connector" && wp.blockId === removed.id);
    });
    return { waypoints: MM.renumberWaypoints(next), blocks: nextBlocks, removed: removed };
  }

  function removeBlockById(mission, blocks, blockId) {
    const nextBlocks = (blocks || []).filter(function (b) {
      return b.id !== blockId;
    });
    let next = (mission || []).filter(function (wp) {
      return wp.blockId !== blockId;
    });
    return { waypoints: MM.renumberWaypoints(next), blocks: nextBlocks };
  }

  function recalcBlock(mission, blocks, blockId, platform, appendRtl) {
    const block = (blocks || []).find(function (b) {
      return b.id === blockId;
    });
    if (!block) {
      return null;
    }
    let base = stripSurveyByBlockId(MM.stripRtlWaypoints(mission), blockId);
    base = base.filter(function (wp) {
      return !(wp.source === "connector" && wp.blockId === blockId);
    });
    const others = (blocks || []).filter(function (b) {
      return b.id !== blockId;
    });
    let composed = base;
    const sorted = others.concat([block]).sort(function (a, b) {
      return (a.order || 0) - (b.order || 0);
    });
    sorted.forEach(function (b) {
      const r = appendBlockToMission(composed, b, platform, false);
      composed = r.waypoints;
    });
    if (appendRtl) {
      composed = MM.appendRtlWaypoint(composed);
    }
    if (FWP && FWP.normalizeWaypointsForPlatform) {
      composed = FWP.normalizeWaypointsForPlatform(composed, platform);
    }
    return { waypoints: composed, block: block };
  }

  function createSurveyBlock(polygon, settings, order) {
    return {
      id: createBlockId(),
      order: order,
      polygon: polygon.map(function (p) {
        return { lng: p.lng, lat: p.lat };
      }),
      paramsSnapshot: cloneParamsSnapshot(settings),
      waypointCount: 0,
      committed: true
    };
  }

  function migrateLegacySurveyWaypoints(mission, blocks) {
    if ((blocks && blocks.length) || !mission || !mission.length) {
      return blocks || [];
    }
    const survey = mission.filter(function (wp) {
      return wp.source === "survey";
    });
    if (!survey.length) {
      return [];
    }
    return [
      {
        id: createBlockId(),
        order: 0,
        polygon: [],
        paramsSnapshot: cloneParamsSnapshot({ surveyAltitude: survey[0].alt || 300 }),
        waypointCount: survey.length,
        committed: true,
        legacy: true
      }
    ];
  }

  window.MissionComposer = {
    createSurveyBlock: createSurveyBlock,
    appendBlockToMission: appendBlockToMission,
    rebuildMissionFromBlocks: rebuildMissionFromBlocks,
    removeLastBlock: removeLastBlock,
    removeBlockById: removeBlockById,
    recalcBlock: recalcBlock,
    cloneParamsSnapshot: cloneParamsSnapshot,
    resolveSurveyFrame: resolveSurveyFrame,
    migrateLegacySurveyWaypoints: migrateLegacySurveyWaypoints,
    CONNECTOR_THRESHOLD_M: CONNECTOR_THRESHOLD_M
  };
})();
