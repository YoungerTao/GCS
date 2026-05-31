(function () {
  function polygonArea(polygon) {
    if (!polygon || polygon.length < 3) {
      return 0;
    }
    let sum = 0;
    for (let i = 0; i < polygon.length; i += 1) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      sum += a.lng * b.lat - b.lng * a.lat;
    }
    return Math.abs(sum) * 0.5;
  }

  function polygonCentroid(polygon) {
    let lat = 0;
    let lng = 0;
    (polygon || []).forEach(function (p) {
      lat += Number(p.lat);
      lng += Number(p.lng);
    });
    const n = polygon.length || 1;
    return { lat: lat / n, lng: lng / n };
  }

  function clipPolygonByLatitude(polygon, splitLat, keepNorth) {
    const out = [];
    for (let i = 0; i < polygon.length; i += 1) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const aIn = keepNorth ? a.lat >= splitLat : a.lat <= splitLat;
      const bIn = keepNorth ? b.lat >= splitLat : b.lat <= splitLat;
      if (aIn) {
        out.push({ lat: a.lat, lng: a.lng });
      }
      if (aIn !== bIn) {
        const t = (splitLat - a.lat) / (b.lat - a.lat || 1e-12);
        out.push({
          lat: splitLat,
          lng: a.lng + (b.lng - a.lng) * t
        });
      }
    }
    return out.length >= 3 ? out : null;
  }

  function autoPartitionByRelief(polygon, stats, maxReliefM) {
    if (!polygon || polygon.length < 3) {
      return [];
    }
    const relief = Number(stats && stats.relief) || 0;
    if (relief <= maxReliefM) {
      return [polygon];
    }
    const lats = polygon.map(function (p) {
      return p.lat;
    });
    const midLat = (Math.min.apply(null, lats) + Math.max.apply(null, lats)) / 2;
    const north = clipPolygonByLatitude(polygon, midLat, true);
    const south = clipPolygonByLatitude(polygon, midLat, false);
    let parts = [];
    if (north) {
      parts.push(north);
    }
    if (south) {
      parts.push(south);
    }
    if (!parts.length) {
      return [polygon];
    }
    if (parts.length === 1) {
      return parts;
    }
    const next = [];
    parts.forEach(function (part) {
      const subStats = Object.assign({}, stats, {
        relief: relief / 2
      });
      if (polygonArea(part) < polygonArea(polygon) * 0.05) {
        return;
      }
      autoPartitionByRelief(part, subStats, maxReliefM).forEach(function (p) {
        next.push(p);
      });
    });
    return next.length ? next : [polygon];
  }

  function projectionAlongBearing(point, origin, bearingDeg) {
    const rad = (bearingDeg * Math.PI) / 180;
    const mPerLat = 111320;
    const mPerLng = Math.cos((origin.lat * Math.PI) / 180) * mPerLat || 1;
    const north = (point.lat - origin.lat) * mPerLat;
    const east = (point.lng - origin.lng) * mPerLng;
    return north * Math.cos(rad) + east * Math.sin(rad);
  }

  function clipPolygonByValue(polygon, valueFn, threshold, keepGreater) {
    const out = [];
    for (let i = 0; i < polygon.length; i += 1) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const va = valueFn(a);
      const vb = valueFn(b);
      const aIn = keepGreater ? va >= threshold : va <= threshold;
      const bIn = keepGreater ? vb >= threshold : vb <= threshold;
      if (aIn) {
        out.push({ lat: a.lat, lng: a.lng });
      }
      if (aIn !== bIn) {
        const t = (threshold - va) / ((vb - va) || 1e-12);
        out.push({
          lat: a.lat + (b.lat - a.lat) * t,
          lng: a.lng + (b.lng - a.lng) * t
        });
      }
    }
    return out.length >= 3 ? out : null;
  }

  /**
   * 沿投影方向递归切块（cutBearingDeg 指定切线平行方向，通常为等高线走向），
   * 使每个子块成为一条高程带；每个子块都用 getStats 重新统计高差。
   * （注意：此函数为早期版本，当前地形切块主路径使用 autoPartitionForTerrain。）
   * @param {Function} getStats (subPolygon) => Promise<{relief}>
   * @returns Promise<Array<polygon>>
   */
  function autoPartitionByGradient(polygon, options) {
    const opts = options || {};
    const maxReliefM = Number(opts.maxReliefM) || 120;
    const cutBearingDeg = Number(opts.cutBearingDeg);
    const getStats = typeof opts.getStats === "function" ? opts.getStats : null;
    const depth = Number(opts.depth) || 0;
    const maxDepth = Number(opts.maxDepth) || 4;
    const baseArea = Number(opts.baseArea) || polygonArea(polygon);

    if (!polygon || polygon.length < 3 || !getStats || !Number.isFinite(cutBearingDeg)) {
      return Promise.resolve([polygon]);
    }

    return Promise.resolve(getStats(polygon)).then(function (stats) {
      const relief = Number(stats && stats.relief) || 0;
      if (relief <= maxReliefM || depth >= maxDepth) {
        return [polygon];
      }
      const origin = polygonCentroid(polygon);
      const valueFn = function (p) {
        return projectionAlongBearing(p, origin, cutBearingDeg + 90);
      };
      const values = polygon.map(valueFn);
      const mid = (Math.min.apply(null, values) + Math.max.apply(null, values)) / 2;
      const partA = clipPolygonByValue(polygon, valueFn, mid, true);
      const partB = clipPolygonByValue(polygon, valueFn, mid, false);
      const parts = [partA, partB].filter(function (p) {
        return p && polygonArea(p) >= baseArea * 0.05;
      });
      if (parts.length < 2) {
        return [polygon];
      }
      return Promise.all(
        parts.map(function (part) {
          return autoPartitionByGradient(part, {
            maxReliefM: maxReliefM,
            cutBearingDeg: cutBearingDeg,
            getStats: getStats,
            depth: depth + 1,
            maxDepth: maxDepth,
            baseArea: baseArea
          });
        })
      ).then(function (nested) {
        const flat = [];
        nested.forEach(function (group) {
          group.forEach(function (p) {
            flat.push(p);
          });
        });
        return flat.length ? flat : [polygon];
      });
    });
  }

  function percentileValue(sortedValues, p) {
    if (!sortedValues.length) {
      return 0;
    }
    const idx = (sortedValues.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) {
      return sortedValues[lo];
    }
    const frac = idx - lo;
    return sortedValues[lo] * (1 - frac) + sortedValues[hi] * frac;
  }

  /**
   * 高程均衡切点：在若干候选阈值（投影值的 40/50/60 百分位）上分别裁出两侧，
   * 用 getStats 统计两侧高差，选 |reliefA-reliefB| 最小的阈值。
   * @returns Promise<{threshold, partA, partB, diff} | null>
   */
  function chooseBalancedThreshold(polygon, valueFn, getStats, baseArea) {
    const area = Number(baseArea) || polygonArea(polygon);
    const values = polygon.map(valueFn);
    const sorted = values.slice().sort(function (a, b) {
      return a - b;
    });
    const candidates = [0.4, 0.5, 0.6].map(function (p) {
      return percentileValue(sorted, p);
    });
    const uniq = [];
    candidates.forEach(function (c) {
      if (
        !uniq.some(function (u) {
          return Math.abs(u - c) < 1e-6;
        })
      ) {
        uniq.push(c);
      }
    });
    return Promise.all(
      uniq.map(function (threshold) {
        const partA = clipPolygonByValue(polygon, valueFn, threshold, true);
        const partB = clipPolygonByValue(polygon, valueFn, threshold, false);
        if (
          !partA ||
          !partB ||
          polygonArea(partA) < area * 0.05 ||
          polygonArea(partB) < area * 0.05
        ) {
          return Promise.resolve(null);
        }
        return Promise.all([
          Promise.resolve(getStats(partA)).catch(function () {
            return { relief: 0 };
          }),
          Promise.resolve(getStats(partB)).catch(function () {
            return { relief: 0 };
          })
        ]).then(function (stats) {
          const ra = Number(stats[0] && stats[0].relief) || 0;
          const rb = Number(stats[1] && stats[1].relief) || 0;
          return {
            threshold: threshold,
            partA: partA,
            partB: partB,
            diff: Math.abs(ra - rb)
          };
        });
      })
    ).then(function (results) {
      let best = null;
      results.forEach(function (r) {
        if (!r) {
          return;
        }
        if (!best || r.diff < best.diff) {
          best = r;
        }
      });
      return best;
    });
  }

  /**
   * 地形可飞性切块：以高差为主、单架次航时为软约束，沿等高线方向递归切分，
   * 切点用高程均衡选择，使每个子块的高差尽量相等。
   * @param {Object} options
   *  - maxReliefM      高差上限（硬触发）
   *  - maxSortieMin    单架次航时软约束（分钟，0=不约束）
   *  - cutBearingDeg   真北 0°、东 90°，切线平行于此方向（与 SurveyPlanner 主航向一致）
   *  - getStats(poly)  => {relief} 或其 Promise
   *  - getEstimate(poly) => {minutes} 或其 Promise（可选）
   *  - forceSplit      顶层至少切一刀（用于手动"再切一刀"）
   * @returns Promise<Array<polygon>>
   */
  function autoPartitionForTerrain(polygon, options) {
    const opts = options || {};
    const maxReliefM = Number(opts.maxReliefM) || 120;
    const maxSortieMin = Number(opts.maxSortieMin) || 0;
    const cutBearingDeg = Number(opts.cutBearingDeg);
    const getStats = typeof opts.getStats === "function" ? opts.getStats : null;
    const getEstimate =
      typeof opts.getEstimate === "function" ? opts.getEstimate : null;
    const depth = Number(opts.depth) || 0;
    const maxDepth = Number(opts.maxDepth) || 4;
    const baseArea = Number(opts.baseArea) || polygonArea(polygon);
    const forceSplit = !!opts.forceSplit;

    if (
      !polygon ||
      polygon.length < 3 ||
      !getStats ||
      !Number.isFinite(cutBearingDeg)
    ) {
      return Promise.resolve([polygon]);
    }

    return Promise.resolve(getStats(polygon))
      .catch(function () {
        return { relief: 0 };
      })
      .then(function (stats) {
        const relief = Number(stats && stats.relief) || 0;
        const estPromise = getEstimate
          ? Promise.resolve(getEstimate(polygon)).catch(function () {
              return null;
            })
          : Promise.resolve(null);
        return estPromise.then(function (est) {
          const minutes =
            est && Number.isFinite(Number(est.minutes)) ? Number(est.minutes) : 0;
          const reliefOk = relief <= maxReliefM;
          const timeOk = !maxSortieMin || minutes <= maxSortieMin;
          const mustSplit = forceSplit && depth === 0;
          if ((reliefOk && timeOk && !mustSplit) || depth >= maxDepth) {
            return [polygon];
          }
          const origin = polygonCentroid(polygon);
          // cutBearingDeg = 等高线切线方向；+90° 为下坡方向，沿此投影切块 → 分界线与等高线平行
          const valueFn = function (p) {
            return projectionAlongBearing(p, origin, cutBearingDeg + 90);
          };
          return chooseBalancedThreshold(
            polygon,
            valueFn,
            getStats,
            baseArea
          ).then(function (best) {
            if (!best) {
              return [polygon];
            }
            return Promise.all(
              [best.partA, best.partB].map(function (part) {
                return autoPartitionForTerrain(part, {
                  maxReliefM: maxReliefM,
                  maxSortieMin: maxSortieMin,
                  cutBearingDeg: cutBearingDeg,
                  getStats: getStats,
                  getEstimate: getEstimate,
                  depth: depth + 1,
                  maxDepth: maxDepth,
                  baseArea: baseArea
                });
              })
            ).then(function (nested) {
              const flat = [];
              nested.forEach(function (group) {
                group.forEach(function (p) {
                  flat.push(p);
                });
              });
              return flat.length ? flat : [polygon];
            });
          });
        });
      });
  }

  window.TerrainPolygonSplit = {
    autoPartitionByRelief: autoPartitionByRelief,
    autoPartitionByGradient: autoPartitionByGradient,
    autoPartitionForTerrain: autoPartitionForTerrain,
    chooseBalancedThreshold: chooseBalancedThreshold,
    clipPolygonByValue: clipPolygonByValue,
    projectionAlongBearing: projectionAlongBearing,
    polygonArea: polygonArea,
    polygonCentroid: polygonCentroid
  };
})();
