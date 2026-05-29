(function () {
  const SP = function () {
    return window.SurveyPlanner;
  };
  const TS = function () {
    return window.TerrainService;
  };
  const TPS = function () {
    return window.TerrainPolygonSplit;
  };
  const TPV = function () {
    return window.TerrainProfileValidator;
  };
  const MC = function () {
    return window.MissionComposer;
  };

  function pickHeadingWithTerrain(polygon, settings, platform) {
    const sp = SP();
    if (!sp || !sp.pickBestSurveyHeadingDegrees) {
      return Promise.resolve(null);
    }
    if (!settings.useTerrainFollowing || !sp.pickBestSurveyHeadingWithTerrain) {
      return Promise.resolve(
        sp.pickBestSurveyHeadingDegrees(polygon, settings.sideOverlap, {
          turnAroundMeters: settings.turnAroundMeters,
          entryCorner: settings.surveyEntryCorner,
          footprintWidthMeters: settings.footprintWidthMeters,
          lineSpacingMeters: settings.lineSpacingMeters
        })
      );
    }
    return Promise.resolve(
      sp.pickBestSurveyHeadingWithTerrain(polygon, settings.sideOverlap, settings, platform)
    ).then(function (r) {
      return r;
    });
  }

  function buildPathForPolygon(polygon, settings, platform) {
    const sp = SP();
    if (!sp) {
      return Promise.resolve([]);
    }
    const lineSpacing = Math.max(
      4,
      (settings.footprintWidthMeters || 60) * (1 - (settings.sideOverlap || 0.7))
    );
    const headingPromise = settings.surveyHeadingAuto
      ? pickHeadingWithTerrain(polygon, settings, platform)
      : Promise.resolve(settings.surveyHeadingDeg);
    return headingPromise.then(function (heading) {
      const opts = {
        turnAroundMeters: settings.turnAroundMeters,
        entryCorner: settings.surveyEntryCorner,
        footprintWidthMeters: settings.footprintWidthMeters,
        lineSpacingMeters: lineSpacing
      };
      if (heading != null && Number.isFinite(Number(heading))) {
        opts.headingDegrees = Number(heading);
        settings.surveyHeadingDeg = Number(heading);
      }
      const raw = sp.generateSurveyPath(polygon, settings.sideOverlap, opts);
      if (sp.buildSurveyMissionLegsFromPath) {
        return sp.buildSurveyMissionLegsFromPath(raw, platform);
      }
      return raw;
    });
  }

  function profileForPath(path, settings) {
    const ts = TS();
    if (!ts || !path || path.length < 2) {
      return Promise.resolve([]);
    }
    const points = path.map(function (p) {
      return { lat: p.lat, lng: p.lng };
    });
    return ts.sampleProfile(points, 50);
  }

  function planBlock(polygon, settings, platform, order) {
    const composer = MC();
    return buildPathForPolygon(polygon, settings, platform).then(function (path) {
      return profileForPath(path, settings).then(function (profile) {
        const issues = TPV() ? TPV().validateTerrainProfile(profile, settings, platform) : [];
        const block = composer
          ? composer.createSurveyBlock(polygon, settings, order)
          : {
              id: "sb-plan",
              order: order,
              polygon: polygon,
              paramsSnapshot: settings,
              committed: false
            };
        block.previewPath = path;
        block.previewProfile = profile;
        block.previewIssues = issues;
        if (composer) {
          block.paramsSnapshot = composer.cloneParamsSnapshot(settings);
        }
        return block;
      });
    });
  }

  function autoPartition(polygon, settings, stats) {
    const tps = TPS();
    const maxRelief = Number(settings.terrainMaxReliefM) || 120;
    if (!settings.terrainAutoPartition || !tps) {
      return [polygon];
    }
    return tps.autoPartitionByRelief(polygon, stats || {}, maxRelief);
  }

  function planAuto(polygon, settings, platform) {
    const ts = TS();
    if (!ts) {
      return Promise.reject(new Error("TerrainService 未加载"));
    }
    const bbox = ts.polygonBbox(polygon);
    if (!bbox) {
      return Promise.reject(new Error("无效测区多边形"));
    }

    const prefetch =
      settings.useTerrainFollowing && settings.terrainPrefetchOnDraw !== false
        ? ts.prefetchTerrain(bbox).catch(function () {
            return null;
          })
        : Promise.resolve(null);

    return prefetch
      .then(function () {
        return ts.getTerrainStats(polygon);
      })
      .then(function (stats) {
        const parts = autoPartition(polygon, settings, stats);
        let chain = Promise.resolve({ blocks: [], issues: [], stats: stats });
        parts.forEach(function (part, index) {
          chain = chain.then(function (acc) {
            return planBlock(part, settings, platform, index).then(function (block) {
              acc.blocks.push(block);
              (block.previewIssues || []).forEach(function (issue) {
                acc.issues.push(
                  Object.assign({}, issue, {
                    blockOrder: index + 1
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

  window.TerrainSurveyPlanner = {
    planAuto: planAuto,
    planBlock: planBlock,
    autoPartition: autoPartition,
    buildPathForPolygon: buildPathForPolygon,
    profileForPath: profileForPath
  };
})();
