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

  function withTimeout(promise, timeoutMs, message) {
    const ms = Number(timeoutMs);
    if (!Number.isFinite(ms) || ms <= 0) {
      return promise;
    }
    return new Promise(function (resolve, reject) {
      const timer = window.setTimeout(function () {
        reject(new Error(message || "请求超时"));
      }, ms);
      Promise.resolve(promise).then(
        function (value) {
          window.clearTimeout(timer);
          resolve(value);
        },
        function (err) {
          window.clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  function planAuto(polygon, settings, platform, callbacks) {
    const ts = TS();
    if (!ts) {
      return Promise.reject(new Error("TerrainService 未加载"));
    }
    const cbs = callbacks || {};
    const onProgress =
      typeof cbs.onProgress === "function" ? cbs.onProgress : null;

    function report(phase, detail) {
      if (onProgress) {
        onProgress(Object.assign({ phase: phase }, detail || {}));
      }
    }

    const shouldPrefetch =
      settings.useTerrainFollowing && settings.terrainPrefetchOnDraw !== false;

    const terrainReady = shouldPrefetch
      ? withTimeout(
          ts.ensureTerrainForPolygon(polygon, {
            timeoutMs: Number(settings.terrainPrefetchTimeoutMs) || 90000,
            pollMs: 800,
            onProgress: function (status) {
              report("prefetch", { status: status });
            }
          }),
          Number(settings.terrainPrefetchStageTimeoutMs) || 70000,
          "地形预取等待超时"
        ).catch(function (err) {
          report("stats", {
            message:
              (err && err.message ? err.message : "地形预取未完成") + "，继续直接采样地形…"
          });
          return {
            cached: false,
            degraded: true,
            warning:
              (err && err.message ? err.message : "地形预取未完成") +
              "，已降级为边采样边规划"
          };
        })
      : Promise.resolve(null);

    return terrainReady
      .then(function (prefetchResult) {
        report("stats", { message: "读取测区高程…" });
        return ts.getTerrainStats(polygon).then(function (stats) {
          return {
            stats: stats,
            prefetchResult: prefetchResult
          };
        });
      })
      .then(function (ctx) {
        const stats = ctx.stats;
        const prefetchResult = ctx.prefetchResult;
        const parts = autoPartition(polygon, settings, stats);
        report("planning", { blockTotal: parts.length, blockIndex: 0 });
        let chain = Promise.resolve({ blocks: [], issues: [], stats: stats });
        if (prefetchResult && prefetchResult.warning) {
          chain = chain.then(function (acc) {
            acc.issues.push({
              level: "warning",
              code: "terrain_prefetch_degraded",
              message: prefetchResult.warning
            });
            return acc;
          });
        }
        parts.forEach(function (part, index) {
          chain = chain.then(function (acc) {
            report("planning", {
              blockTotal: parts.length,
              blockIndex: index + 1,
              message: "规划块 " + (index + 1) + "/" + parts.length
            });
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
      })
      .then(function (result) {
        report("done", { stats: result.stats });
        return result;
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
