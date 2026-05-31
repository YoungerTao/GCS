/**
 * 固定翼地形跟随爬升可行性求解器。
 *
 * 给定沿测线采样的地形剖面，构建一条「爬升率/下降率可行」且始终高于安全裕度的
 * AGL 包络（frame 10 / 地形相对高度）：
 *   - 前向(回溯)限爬升率：在陡升脊之前提前抬升 AGL（pre-climb / smooth_profile）。
 *   - 后向限下降率：陡降后按可行斜率缓降（smooth_profile）。
 *   - 整体抬升基准 AGL：包络自然把谷底 AGL 抬高（raise_agl）。
 *   - 超出最大 AGL 上限的过陡脊：标记盘旋爬升点（insert_loiter）。
 *
 * 仅服务固定翼（plane / vtol）。多旋翼不调用本求解器。
 */
(function () {
  const SP = function () {
    return window.SurveyPlanner;
  };

  function distanceM(a, b) {
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

  function pointElevation(point) {
    if (!point || point.available === false) {
      return null;
    }
    const e = Number(point.elevation);
    return Number.isFinite(e) ? e : null;
  }

  function cumulativeDistances(points) {
    const out = [0];
    for (let i = 1; i < points.length; i += 1) {
      out.push(out[i - 1] + distanceM(points[i - 1], points[i]));
    }
    return out;
  }

  /** 用线性插值填补剖面中缺失的高程；首尾缺失则就近钳制。 */
  function fillElevations(points) {
    const elevs = points.map(pointElevation);
    const n = elevs.length;
    let firstKnown = -1;
    for (let i = 0; i < n; i += 1) {
      if (elevs[i] != null) {
        firstKnown = i;
        break;
      }
    }
    if (firstKnown === -1) {
      return null;
    }
    for (let i = 0; i < firstKnown; i += 1) {
      elevs[i] = elevs[firstKnown];
    }
    let lastKnown = firstKnown;
    for (let i = firstKnown + 1; i < n; i += 1) {
      if (elevs[i] != null) {
        if (i - lastKnown > 1) {
          const span = i - lastKnown;
          const startVal = elevs[lastKnown];
          const endVal = elevs[i];
          for (let k = 1; k < span; k += 1) {
            elevs[lastKnown + k] = startVal + ((endVal - startVal) * k) / span;
          }
        }
        lastKnown = i;
      }
    }
    for (let i = lastKnown + 1; i < n; i += 1) {
      elevs[i] = elevs[lastKnown];
    }
    return elevs;
  }

  function resolveOpts(settings) {
    const agl = Math.max(1, Number(settings && settings.surveyAltitude) || 300);
    const margin = Math.max(0, Number(settings && settings.terrainAgMarginM) || 30);
    const climb = Math.max(0.2, Number(settings && settings.terrainMaxClimbRateMps) || 3);
    const descentRaw = Number(settings && settings.terrainMaxDescentRateMps);
    const descent = Math.max(0.2, Number.isFinite(descentRaw) ? descentRaw : climb);
    const speed = Math.max(1, Number(settings && (settings.terrainCruiseSpeedMps || settings.speed)) || 20);
    const maxAgl = Math.max(agl, Number(settings && settings.terrainMaxAglM) || 200);
    return { agl: agl, margin: margin, climb: climb, descent: descent, speed: speed, maxAgl: maxAgl };
  }

  /**
   * 在剖面上构建可行的绝对高度包络。
   * @returns { abs:[], agl:[], elevs:[], dist:[] }
   */
  function buildFeasibleEnvelope(elevs, dist, opts) {
    const n = elevs.length;
    const floor = new Array(n);
    for (let i = 0; i < n; i += 1) {
      floor[i] = elevs[i] + opts.agl;
    }
    const abs = floor.slice();

    for (let i = n - 2; i >= 0; i -= 1) {
      const dt = Math.max(0.001, (dist[i + 1] - dist[i]) / opts.speed);
      const reachable = abs[i + 1] - opts.climb * dt;
      if (abs[i] < reachable) {
        abs[i] = reachable;
      }
    }
    for (let i = 1; i < n; i += 1) {
      const dt = Math.max(0.001, (dist[i] - dist[i - 1]) / opts.speed);
      const sustain = abs[i - 1] - opts.descent * dt;
      if (abs[i] < sustain) {
        abs[i] = sustain;
      }
    }

    const aglArr = new Array(n);
    for (let i = 0; i < n; i += 1) {
      aglArr[i] = abs[i] - elevs[i];
    }
    return { abs: abs, agl: aglArr, elevs: elevs, dist: dist };
  }

  function interpolateAt(targetDist, dist, values) {
    const n = dist.length;
    if (!n) {
      return null;
    }
    if (targetDist <= dist[0]) {
      return values[0];
    }
    if (targetDist >= dist[n - 1]) {
      return values[n - 1];
    }
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (dist[mid] <= targetDist) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    const span = dist[hi] - dist[lo] || 1e-9;
    const t = (targetDist - dist[lo]) / span;
    return values[lo] + (values[hi] - values[lo]) * t;
  }

  /**
   * 主入口。给定路径(测线腿)与沿路径采样的剖面，返回带 aglOverride / 盘旋点的新路径。
   * @returns {{
   *   adjustedPath: Array, aglProfile: Array, loiterInserts: Array,
   *   raisedBaselineAgl: number, issues: Array, applied: boolean
   * }}
   */
  function solve(params) {
    const path = (params && params.path) || [];
    const profile = (params && params.profile) || [];
    const settings = (params && params.settings) || {};
    const platform = params && params.platform;
    const isFw = platform === "plane" || platform === "vtol";
    const issues = [];

    const passthrough = {
      adjustedPath: path,
      aglProfile: profile,
      loiterInserts: [],
      raisedBaselineAgl: Math.max(1, Number(settings.surveyAltitude) || 300),
      issues: issues,
      applied: false
    };

    if (!isFw || settings.terrainClimbSmoothing === false) {
      return passthrough;
    }
    if (!Array.isArray(path) || path.length < 2 || !Array.isArray(profile) || profile.length < 2) {
      return passthrough;
    }

    const missing = profile.reduce(function (acc, p) {
      return acc + (pointElevation(p) == null ? 1 : 0);
    }, 0);
    if (missing > profile.length * 0.2) {
      return passthrough;
    }

    const elevs = fillElevations(profile);
    if (!elevs) {
      return passthrough;
    }
    const opts = resolveOpts(settings);
    const profDist = cumulativeDistances(profile);
    const env = buildFeasibleEnvelope(elevs, profDist, opts);

    const aglProfile = profile.map(function (p, i) {
      return Object.assign({}, p, {
        elevation: elevs[i],
        aglOverride: env.agl[i],
        targetAbsAlt: env.abs[i]
      });
    });

    const pathDist = cumulativeDistances(path);
    const totalPath = pathDist[pathDist.length - 1] || 1;
    const totalProf = profDist[profDist.length - 1] || 1;
    const scale = totalProf / totalPath;

    let raisedBaselineAgl = opts.agl;
    const overCapRegions = [];
    let activeRegion = null;

    const adjustedPath = path.map(function (point, i) {
      const mapped = pathDist[i] * scale;
      let agl = interpolateAt(mapped, profDist, env.agl);
      if (!Number.isFinite(agl)) {
        agl = opts.agl;
      }
      raisedBaselineAgl = Math.max(raisedBaselineAgl, agl);
      const overCap = agl > opts.maxAgl + 0.5;
      if (overCap) {
        if (!activeRegion) {
          activeRegion = { startIndex: i, peakAgl: agl, peakElev: null };
          overCapRegions.push(activeRegion);
        }
        activeRegion.peakAgl = Math.max(activeRegion.peakAgl, agl);
      } else {
        activeRegion = null;
      }
      const clamped = Math.min(agl, opts.maxAgl);
      const copy = Object.assign({}, point, { aglOverride: clamped });
      delete copy.loiterClimbBefore;
      return copy;
    });

    const loiterInserts = [];
    overCapRegions.forEach(function (region) {
      const insertIndex = Math.max(0, region.startIndex);
      const anchor = adjustedPath[insertIndex];
      const targetAgl = Math.min(opts.maxAgl, region.peakAgl);
      const loiter = {
        pathIndex: insertIndex,
        lat: anchor.lat,
        lng: anchor.lng,
        targetAgl: targetAgl
      };
      loiterInserts.push(loiter);
      if (insertIndex < adjustedPath.length) {
        adjustedPath[insertIndex] = Object.assign({}, adjustedPath[insertIndex], {
          loiterClimbBefore: { targetAgl: targetAgl }
        });
      }
    });

    if (loiterInserts.length) {
      issues.push({
        level: "warning",
        code: "terrain_loiter_inserted",
        message:
          "地形过陡：已在 " +
          loiterInserts.length +
          " 处插入盘旋爬升点（AGL 上限 " +
          Math.round(opts.maxAgl) +
          " m）"
      });
    }
    if (raisedBaselineAgl > opts.agl + 1) {
      issues.push({
        level: "info",
        code: "terrain_agl_raised",
        message:
          "为满足爬升率，部分航段离地高度已抬升至最高约 " +
          Math.round(Math.min(raisedBaselineAgl, opts.maxAgl)) +
          " m（基准 " +
          Math.round(opts.agl) +
          " m）"
      });
    }

    return {
      adjustedPath: adjustedPath,
      aglProfile: aglProfile,
      loiterInserts: loiterInserts,
      raisedBaselineAgl: Math.min(raisedBaselineAgl, opts.maxAgl),
      issues: issues,
      applied: true
    };
  }

  window.TerrainClimbSolver = {
    solve: solve,
    buildFeasibleEnvelope: buildFeasibleEnvelope,
    resolveOpts: resolveOpts
  };
})();
