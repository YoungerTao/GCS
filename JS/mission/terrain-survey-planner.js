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

  function waitForTerrainService(timeoutMs) {
    const initial = TS();
    if (initial) {
      return Promise.resolve(initial);
    }
    const timeout = Number(timeoutMs);
    const limit = Number.isFinite(timeout) && timeout > 0 ? timeout : 5000;
    const startedAt = Date.now();
    return new Promise(function (resolve, reject) {
      function poll() {
        const service = TS();
        if (service) {
          resolve(service);
          return;
        }
        if (Date.now() - startedAt >= limit) {
          reject(new Error("TerrainService 未加载"));
          return;
        }
        window.setTimeout(poll, 200);
      }
      poll();
    });
  }

  function pickHeadingWithTerrain(polygon, settings, platform, preferredContourDeg) {
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
      sp.pickBestSurveyHeadingWithTerrain(polygon, settings.sideOverlap, settings, platform, preferredContourDeg)
    ).then(function (r) {
      return r;
    });
  }

  function buildPathForPolygon(polygon, settings, platform, preferredContourHeading) {
    const sp = SP();
    if (!sp) {
      return Promise.resolve({
        path: [],
        headingDegrees: null
      });
    }
    const lineSpacing = Math.max(
      4,
      (settings.footprintWidthMeters || 60) * (1 - (settings.sideOverlap || 0.7))
    );
    // When a good global contour heading is available from the parent large-polygon partition
    // (computed via the reliable DEM grid + terrain-aware logic on the full area), pass it
    // as the primary seed into the full "沿着等高线归划" terrain-cost algorithm
    // (pickBestSurveyHeadingWithTerrain). This runs the real path sampling + variance + climb
    // scoring + heavy direction penalty on the sub-block, but heavily biases the result toward
    // the trustworthy parent contour direction instead of relying on the thin sub-polygon's own
    // (often unreliable) local grid. This is the original "previous scheme" behavior the user
    // expects for stable AGL flight lines inside each elevation band.
    let headingPromise;
    if (settings.surveyHeadingAuto) {
      headingPromise = pickHeadingWithTerrain(polygon, settings, platform, preferredContourHeading);
    } else if (Number.isFinite(Number(preferredContourHeading))) {
      // Explicit non-auto heading on the snapshot takes precedence, but still respect an explicit
      // forced contour from partition if the caller wants it.
      headingPromise = Promise.resolve(Number(preferredContourHeading));
    } else {
      headingPromise = Promise.resolve(settings.surveyHeadingDeg);
    }
    return headingPromise.then(function (heading) {
      const opts = {
        turnAroundMeters: settings.turnAroundMeters,
        entryCorner: settings.surveyEntryCorner,
        footprintWidthMeters: settings.footprintWidthMeters,
        lineSpacingMeters: lineSpacing
      };
      let resolvedHeading = null;
      if (heading != null && Number.isFinite(Number(heading))) {
        resolvedHeading = Number(heading);
        opts.headingDegrees = resolvedHeading;
      }
      const raw = sp.generateSurveyPath(polygon, settings.sideOverlap, opts);
      if (sp.buildSurveyMissionLegsFromPath) {
        return {
          path: sp.buildSurveyMissionLegsFromPath(raw, platform),
          headingDegrees: resolvedHeading
        };
      }
      return {
        path: raw,
        headingDegrees: resolvedHeading
      };
    });
  }

  function profileForPath(path, settings, platform) {
    const ts = TS();
    if (!ts || !path || path.length < 2) {
      return Promise.resolve([]);
    }
    const points = path.map(function (p) {
      return { lat: p.lat, lng: p.lng };
    });
    const isFw = platform === "plane" || platform === "vtol";
    const stepM = isFw ? 30 : 50;
    return ts.sampleProfile(points, stepM);
  }

  function planBlock(polygon, settings, platform, order, preferredContourHeading) {
    const composer = MC();
    const solver = window.TerrainClimbSolver;
    return buildPathForPolygon(polygon, settings, platform, preferredContourHeading).then(function (pathResult) {
      let path = pathResult && Array.isArray(pathResult.path) ? pathResult.path : [];
      const headingDegrees =
        pathResult && Number.isFinite(Number(pathResult.headingDegrees))
          ? Number(pathResult.headingDegrees)
          : null;
      return profileForPath(path, settings, platform).then(function (profile) {
        let validationProfile = profile;
        let aglProfile = null;
        const solverIssues = [];
        if (solver) {
          const solved = solver.solve({
            path: path,
            profile: profile,
            settings: settings,
            platform: platform
          });
          if (solved && solved.applied) {
            path = solved.adjustedPath;
            validationProfile = solved.aglProfile || profile;
            aglProfile = solved.aglProfile || null;
            (solved.issues || []).forEach(function (i) {
              solverIssues.push(i);
            });
          }
        }
        const baseIssues = TPV()
          ? TPV().validateTerrainProfile(validationProfile, settings, platform)
          : [];
        const issues = baseIssues.concat(solverIssues);
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
        block.previewProfile = aglProfile || profile;
        if (aglProfile) {
          block.previewAglProfile = aglProfile;
        }
        block.previewIssues = issues;
        if (composer) {
          block.paramsSnapshot = composer.cloneParamsSnapshot(settings);
        }
        if (!block.paramsSnapshot) {
          block.paramsSnapshot = Object.assign({}, settings || {});
        }
        if (headingDegrees != null) {
          block.paramsSnapshot.surveyHeadingDeg = headingDegrees;
          block.paramsSnapshot.surveyHeadingAuto = false;
        }
        return block;
      });
    });
  }

  function normalizeTerrainStats(stats) {
    const s = stats && typeof stats === "object" ? Object.assign({}, stats) : {};
    const min = Number(s.min);
    const max = Number(s.max);
    let relief = Number(s.relief);
    if (!Number.isFinite(relief) && Number.isFinite(min) && Number.isFinite(max)) {
      relief = max - min;
    }
    if (!Number.isFinite(relief)) {
      relief = 0;
    }
    s.relief = Math.max(0, relief);
    return s;
  }

  function estimateContourHeadingFromGrid(ts, polygon, options) {
    const sp = SP();
    const opts = options || {};
    const minValidRatio = Number(opts.minValidRatio);
    const validThreshold = Number.isFinite(minValidRatio) ? minValidRatio : 0.5;
    const gridSamples = Number(opts.gridSamples) || 28;
    if (!sp || !sp.buildTerrainOrientationGrid || !ts || !ts.sampleElevationBatch) {
      return Promise.resolve(null);
    }
    const grid = sp.buildTerrainOrientationGrid(polygon, gridSamples);
    if (!grid || !Array.isArray(grid.samplePoints) || !grid.samplePoints.length) {
      return Promise.resolve(null);
    }
    return ts
      .sampleElevationBatch(grid.samplePoints, {
        timeoutMs: Number(opts.timeoutMs) || 12000
      })
      .then(function (samples) {
        const applied = sp.applyTerrainGridSamples(grid, samples || []);
        if (!applied || applied.validRatio < validThreshold) {
          return null;
        }
        const heading = sp.estimateContourAlignedHeadingFromGrid(grid);
        if (heading == null || !Number.isFinite(Number(heading))) {
          return null;
        }
        return {
          headingDeg: Number(heading),
          grid: grid,
          applied: applied
        };
      })
      .catch(function () {
        return null;
      });
  }

  function estimateContourHeading(ts, polygon) {
    return estimateContourHeadingFromGrid(ts, polygon, { minValidRatio: 0.5, gridSamples: 36 }).then(
      function (result) {
        return result ? result.headingDeg : null;
      }
    );
  }

  /**
   * 切块用等高线方向（切线平行于等高线）。
   * 返回 bearing 为真北 0°、东 90°，与 generateSurveyPath / cutBearingDeg 相同。
   */
  function resolvePartitionCutBearing(ts, polygon, settings) {
    const sp = SP();
    return estimateContourHeadingFromGrid(ts, polygon, {
      minValidRatio: 0.5,
      gridSamples: 36
    })
      .then(function (result) {
        if (result && Number.isFinite(result.headingDeg)) {
          return { bearing: result.headingDeg, source: "terrain_grid" };
        }
        return estimateContourHeadingFromGrid(ts, polygon, {
          minValidRatio: 0.28,
          gridSamples: 48,
          timeoutMs: 15000
        });
      })
      .then(function (result) {
        if (result && Number.isFinite(result.headingDeg)) {
          return { bearing: result.headingDeg, source: "terrain_grid_relaxed" };
        }
        if (!sp || !sp.pickBestSurveyHeadingDegrees) {
          return { bearing: null, source: "none" };
        }
        // Terrain-aware fallback (no erroneous +90): when terrain following is on, the terrain picker
        // already biases toward contour-aligned headings for stable AGL. Use its result directly.
        if (settings && settings.useTerrainFollowing && typeof sp.pickBestSurveyHeadingWithTerrain === "function") {
          return Promise.resolve(
            sp.pickBestSurveyHeadingWithTerrain(
              polygon,
              (settings && settings.sideOverlap) || 0.7,
              settings || {},
              null // platform not available at this layer; picker treats falsy as non-fixed-wing
            )
          ).then(function (surveyDeg) {
            if (surveyDeg != null && Number.isFinite(Number(surveyDeg))) {
              return { bearing: Number(surveyDeg), source: "terrain_survey_heading_fallback" };
            }
            // fall to basic geometry heading (no +90)
            const basic = sp.pickBestSurveyHeadingDegrees(
              polygon,
              (settings && settings.sideOverlap) || 0.7,
              {
                turnAroundMeters: settings && settings.turnAroundMeters,
                entryCorner: settings && settings.surveyEntryCorner,
                footprintWidthMeters: settings && settings.footprintWidthMeters,
                lineSpacingMeters: settings && settings.lineSpacingMeters
              }
            );
            if (basic == null || !Number.isFinite(Number(basic))) {
              return { bearing: null, source: "none" };
            }
            return { bearing: Number(basic), source: "survey_heading_fallback" };
          });
        }
        // Non-terrain or no terrain picker: use basic geometry heading directly as cut bearing (no +90 assumption)
        const surveyDeg = sp.pickBestSurveyHeadingDegrees(
          polygon,
          (settings && settings.sideOverlap) || 0.7,
          {
            turnAroundMeters: settings && settings.turnAroundMeters,
            entryCorner: settings && settings.surveyEntryCorner,
            footprintWidthMeters: settings && settings.footprintWidthMeters,
            lineSpacingMeters: settings && settings.lineSpacingMeters
          }
        );
        if (surveyDeg == null || !Number.isFinite(Number(surveyDeg))) {
          return { bearing: null, source: "none" };
        }
        return {
          bearing: Number(surveyDeg),
          source: "survey_heading_fallback"
        };
      });
  }

  function statsForPolygonFromGrid(ts, polygon) {
    return estimateContourHeadingFromGrid(ts, polygon, {
      minValidRatio: 0.25,
      gridSamples: 22,
      timeoutMs: 10000
    }).then(function (result) {
      if (!result || !result.applied) {
        return null;
      }
      const applied = result.applied;
      if (!Number.isFinite(applied.maxElevation) || !Number.isFinite(applied.minElevation)) {
        return null;
      }
      return normalizeTerrainStats({
        min: applied.minElevation,
        max: applied.maxElevation,
        relief: applied.maxElevation - applied.minElevation,
        validRatio: applied.validRatio
      });
    });
  }

  function getPartitionStats(ts, subPoly) {
    if (!ts || typeof ts.getTerrainStats !== "function") {
      return statsForPolygonFromGrid(ts, subPoly).then(function (gridStats) {
        return gridStats || { relief: 0 };
      });
    }
    return ts
      .getTerrainStats(subPoly)
      .then(function (stats) {
        const normalized = normalizeTerrainStats(stats);
        if (normalized.relief > 0 || Number(normalized.validRatio) > 0) {
          return normalized;
        }
        return statsForPolygonFromGrid(ts, subPoly).then(function (gridStats) {
          return gridStats || normalized;
        });
      })
      .catch(function () {
        return statsForPolygonFromGrid(ts, subPoly).then(function (gridStats) {
          return gridStats || { relief: 0 };
        });
      });
  }

  function autoPartition(ts, polygon, settings, stats, platform) {
    const tps = TPS();
    const maxRelief = Number(settings.terrainMaxReliefM) || 120;

    function partitionResult(parts, contourHeading, cutBearingSource) {
      return {
        parts: parts && parts.length ? parts : [polygon],
        contourHeading:
          contourHeading != null && Number.isFinite(Number(contourHeading))
            ? Number(contourHeading)
            : null,
        cutBearingSource: cutBearingSource || "none"
      };
    }

    function resolveBearing() {
      if (!ts) {
        return Promise.resolve({ bearing: null, source: "none" });
      }
      return resolvePartitionCutBearing(ts, polygon, settings)
        .then(function (resolved) {
          const bearing =
            resolved && Number.isFinite(Number(resolved.bearing)) ? Number(resolved.bearing) : null;
          return {
            bearing: bearing,
            source:
              (resolved && resolved.source) || (Number.isFinite(bearing) ? "terrain_grid" : "none")
          };
        })
        .catch(function () {
          return { bearing: null, source: "error" };
        });
    }

    const shouldCut =
      settings.terrainAutoPartition && tps && tps.autoPartitionForTerrain && ts;
    const relief = Number(normalizeTerrainStats(stats || {}).relief) || 0;
    const needsSplit = shouldCut && relief > maxRelief;

    if (!needsSplit) {
      return resolveBearing().then(function (resolved) {
        return partitionResult([polygon], resolved.bearing, resolved.source);
      });
    }

    const maxSortie = Number(settings.terrainMaxSortieMin) || 0;
    return resolveBearing().then(function (resolved) {
      const bearing = resolved.bearing;
      const cutBearingSource = resolved.source;
      if (!Number.isFinite(bearing)) {
        return partitionResult([polygon], null, cutBearingSource);
      }
      const getEstimate = function (subPoly) {
        return Promise.resolve(getPartitionStats(ts, subPoly)).then(function (subStats) {
          return estimateBlockTime(subPoly, settings, platform, subStats) || { minutes: 0 };
        });
      };
      return tps
        .autoPartitionForTerrain(polygon, {
          maxReliefM: maxRelief,
          maxSortieMin: maxSortie,
          cutBearingDeg: bearing,
          maxDepth: 4,
          getStats: function (subPoly) {
            return getPartitionStats(ts, subPoly);
          },
          getEstimate: getEstimate
        })
        .then(function (parts) {
          return partitionResult(parts, bearing, cutBearingSource);
        })
        .catch(function () {
          return partitionResult([polygon], bearing, "error");
        });
    });
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
    const cbs = callbacks || {};
    const onProgress =
      typeof cbs.onProgress === "function" ? cbs.onProgress : null;

    function report(phase, detail) {
      if (onProgress) {
        onProgress(Object.assign({ phase: phase }, detail || {}));
      }
    }

    return waitForTerrainService(settings && settings.terrainServiceWaitMs)
      .then(function (ts) {
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
              const message = err && err.message ? err.message : "地形预取未完成";
              report("stats", {
                message: message + "，继续直接采样地形…"
              });
              return {
                cached: false,
                degraded: true,
                warning: message + "，已降级为边采样边规划"
              };
            })
          : Promise.resolve(null);

        return terrainReady.then(function (prefetchResult) {
          report("stats", { message: "读取测区高程…" });
          return ts.getTerrainStats(polygon).then(function (stats) {
            return {
              stats: stats,
              prefetchResult: prefetchResult,
              ts: ts
            };
          });
        });
      })
      .then(function (ctx) {
        const stats = ctx.stats;
        const prefetchResult = ctx.prefetchResult;
        return autoPartition(ctx.ts, polygon, settings, stats, platform).then(function (partitionResult) {
          const parts = (partitionResult && partitionResult.parts) || [polygon];
          const contourHeading = partitionResult && Number.isFinite(Number(partitionResult.contourHeading))
            ? Number(partitionResult.contourHeading)
            : null;
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
              // Pass the top-level DEM-derived contour heading down so each sub-block's
              // survey transects are generated using the same direction (along the elevation band).
              return planBlock(part, settings, platform, index, contourHeading).then(function (block) {
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
      })
      .then(function (result) {
        report("done", { stats: result.stats });
        return result;
      });
  }

  function estimateBlockTime(polygon, settings, platform, stats) {
    const sp = SP();
    if (!sp || typeof sp.estimateBlockFlightTime !== "function") {
      return null;
    }
    try {
      return sp.estimateBlockFlightTime(polygon, settings, platform, stats);
    } catch (err) {
      return null;
    }
  }

  function partitionForTerrain(ts, polygon, settings, platform) {
    const tps = TPS();
    const maxRelief = Number(settings.terrainMaxReliefM) || 120;
    const maxSortie = Number(settings.terrainMaxSortieMin) || 0;
    if (!tps || !tps.autoPartitionForTerrain || !ts) {
      return Promise.resolve({
        parts: [polygon],
        contourHeading: null,
        cutBearingSource: "none"
      });
    }
    const getStats = function (subPoly) {
      return getPartitionStats(ts, subPoly);
    };
    const getEstimate = function (subPoly) {
      return Promise.resolve(getStats(subPoly)).then(function (subStats) {
        return estimateBlockTime(subPoly, settings, platform, subStats) || { minutes: 0 };
      });
    };
    return resolvePartitionCutBearing(ts, polygon, settings).then(function (resolved) {
      const bearing = resolved && Number.isFinite(Number(resolved.bearing)) ? Number(resolved.bearing) : null;
      if (!Number.isFinite(bearing)) {
        return {
          parts: [polygon],
          contourHeading: null,
          cutBearingSource: (resolved && resolved.source) || "none"
        };
      }
      return tps
        .autoPartitionForTerrain(polygon, {
          maxReliefM: maxRelief,
          maxSortieMin: maxSortie,
          cutBearingDeg: bearing,
          maxDepth: 5,
          getStats: getStats,
          getEstimate: getEstimate
        })
        .then(function (parts) {
          return {
            parts: parts && parts.length ? parts : [polygon],
            contourHeading: bearing,
            cutBearingSource: (resolved && resolved.source) || "terrain_grid"
          };
        })
        .catch(function () {
          return {
            parts: [polygon],
            contourHeading: bearing,
            cutBearingSource: "error"
          };
        });
    });
  }

  /**
   * 只切块、不画线：以地形可飞性为主、单架次航时为软约束，沿等高线高程均衡切分。
   * 每块只返回多边形 + 高差 + 预估航时（计入盘旋与爬升）+ 参数快照，
   * 不生成航线/剖面，供半自动预览与确认。
   * @returns Promise<{ blocks, issues, stats, contourHeading }>
   */
  function planPartition(polygon, settings, platform, callbacks) {
    const cbs = callbacks || {};
    const onProgress =
      typeof cbs.onProgress === "function" ? cbs.onProgress : null;

    function report(phase, detail) {
      if (onProgress) {
        onProgress(Object.assign({ phase: phase }, detail || {}));
      }
    }

    return waitForTerrainService(settings && settings.terrainServiceWaitMs)
      .then(function (ts) {
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
              const message = err && err.message ? err.message : "地形预取未完成";
              report("stats", { message: message + "，继续直接采样地形…" });
              return {
                cached: false,
                degraded: true,
                warning: message + "，已降级为边采样边切块"
              };
            })
          : Promise.resolve(null);

        return terrainReady.then(function (prefetchResult) {
          report("stats", { message: "读取测区高程…" });
          return ts.getTerrainStats(polygon).then(function (stats) {
            return { ts: ts, stats: stats, prefetchResult: prefetchResult };
          });
        });
      })
      .then(function (ctx) {
        const ts = ctx.ts;
        const stats = ctx.stats;
        const prefetchResult = ctx.prefetchResult;
        report("planning", { message: "地形切块规划中（等高线方向 + 航时约束）…" });
        return partitionForTerrain(ts, polygon, settings, platform).then(function (partitioned) {
          const parts = (partitioned && partitioned.parts) || [polygon];
          const contourHeading =
            partitioned && partitioned.contourHeading != null
              ? partitioned.contourHeading
              : null;
          const cutBearingSource =
            (partitioned && partitioned.cutBearingSource) || "unknown";
          const issues = [];
          if (prefetchResult && prefetchResult.warning) {
            issues.push({
              level: "warning",
              code: "terrain_prefetch_degraded",
              message: prefetchResult.warning
            });
          }
          const isGoodTerrainSource =
            cutBearingSource === "terrain_grid" ||
            cutBearingSource === "terrain_grid_relaxed" ||
            cutBearingSource === "terrain_survey_heading_fallback";

          const isBadGeometryFallback =
            cutBearingSource === "survey_heading_perpendicular" ||
            cutBearingSource === "survey_heading_fallback" ||
            cutBearingSource === "none" ||
            cutBearingSource === "error" ||
            cutBearingSource === "unknown";

          if (isBadGeometryFallback) {
            issues.push({
              level: "warning",
              code: "partition_bearing_fallback",
              message:
                "未能从 DEM 可靠估计等高线方向，已回退到基于多边形几何的估算方向用于切块（建议先完成地形预取后重试）"
            });
          } else if (cutBearingSource === "terrain_survey_heading_fallback") {
            // Good case: we used the terrain-aware survey heading picker (DEM + terrain cost), which is reliable when direct grid check was marginal.
            issues.push({
              level: "info",
              code: "partition_bearing_terrain_survey_fallback",
              message:
                "切块方向来自 terrain survey heading（DEM 地形代价辅助估算），已用于高程带切分与航线走向"
            });
          }

          if (contourHeading != null && isGoodTerrainSource) {
            issues.push({
              level: "info",
              code: "partition_contour_heading",
              message:
                "切块边界沿等高线方向（约 " +
                Math.round(contourHeading) +
                "°），切线与高程带分界平行"
            });
          } else if (contourHeading != null && cutBearingSource === "terrain_survey_heading_fallback") {
            // Still inform the user the numeric direction that was used (from the good terrain fallback)
            issues.push({
              level: "info",
              code: "partition_contour_heading",
              message:
                "切块边界沿估算等高线走向（约 " +
                Math.round(contourHeading) +
                "°，来源：terrain survey heading），切线与高程带分界平行"
            });
          }
          const maxSortie = Number(settings.terrainMaxSortieMin) || 0;
          let chain = Promise.resolve([]);
          parts.forEach(function (part, index) {
            chain = chain.then(function (acc) {
              report("planning", {
                blockTotal: parts.length,
                blockIndex: index + 1,
                message: "统计块 " + (index + 1) + "/" + parts.length
              });
              return getPartitionStats(ts, part).then(function (subStats) {
                const est =
                  estimateBlockTime(part, settings, platform, subStats) || {
                    minutes: 0,
                    breakdown: {}
                  };
                const relief = Number(subStats && subStats.relief) || 0;
                const minutes = Number(est.minutes) || 0;
                const snapshot = MC()
                  ? MC().cloneParamsSnapshot(settings)
                  : Object.assign({}, settings || {});
                const block = {
                  id: "tp-" + Date.now().toString(36) + "-" + index,
                  order: index,
                  polygon: part,
                  relief: relief,
                  stats: subStats,
                  estMinutes: minutes,
                  estBreakdown: est.breakdown || {},
                  overSortie: maxSortie > 0 && minutes > maxSortie,
                  paramsSnapshot: snapshot,
                  partitionOnly: true,
                  contourHeadingDeg: contourHeading
                };
                if (block.overSortie) {
                  issues.push({
                    level: "warning",
                    code: "block_over_sortie",
                    blockOrder: index + 1,
                    message:
                      "块 " +
                      (index + 1) +
                      " 预估航时 " +
                      minutes.toFixed(0) +
                      "min 超过单架次 " +
                      maxSortie +
                      "min"
                  });
                }
                acc.push(block);
                return acc;
              });
            });
          });
          return chain.then(function (blocks) {
            report("done", { stats: stats });
            return {
              blocks: blocks,
              issues: issues,
              stats: stats,
              contourHeading: contourHeading,
              cutBearingSource: cutBearingSource
            };
          });
        });
      });
  }

  // Backward-compat wrapper: some older call sites may expect autoPartition to resolve to an array of polygons.
  // Internally we now return {parts, contourHeading, ...} so the auto planning path can thread the bearing.
  const autoPartitionPublic = function (ts, polygon, settings, stats, platform) {
    return Promise.resolve(autoPartition(ts, polygon, settings, stats, platform)).then(function (res) {
      if (Array.isArray(res)) return res;
      return (res && res.parts) || [polygon];
    });
  };

  window.TerrainSurveyPlanner = {
    planAuto: planAuto,
    planBlock: planBlock,
    planPartition: planPartition,
    autoPartition: autoPartitionPublic,
    estimateContourHeading: estimateContourHeading,
    resolvePartitionCutBearing: resolvePartitionCutBearing,
    getPartitionStats: getPartitionStats,
    normalizeTerrainStats: normalizeTerrainStats,
    buildPathForPolygon: buildPathForPolygon,
    profileForPath: profileForPath
  };
})();
