(function () {
  const CONNECTOR_MIN_TURN_DEG = 8;
  const CONNECTOR_MIN_DIST_M = 2;
  const FW_TURN_MIN_DEG = 12;
  const FW_MAX_SEGMENT_M = 400;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function lngLatEquals(a, b, epsilon) {
    return Math.abs(a.lng - b.lng) <= epsilon && Math.abs(a.lat - b.lat) <= epsilon;
  }

  function computeBearingDegrees(from, to) {
    const lat1 = (from.lat * Math.PI) / 180;
    const lat2 = (to.lat * Math.PI) / 180;
    const dLng = ((to.lng - from.lng) * Math.PI) / 180;
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return (Math.atan2(y, x) * 180) / Math.PI;
  }

  function distanceMetersBetween(a, b) {
    const earthRadius = 6371000;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * earthRadius * Math.asin(Math.sqrt(h));
  }

  function offsetLatLngMeters(point, bearingDegrees, forwardMeters, rightMeters) {
    const bearing = (bearingDegrees * Math.PI) / 180;
    const rightBearing = bearing + Math.PI / 2;
    const metersPerLat = 111320;
    const metersPerLng =
      Math.cos((point.lat * Math.PI) / 180) * metersPerLat || 1;
    const dLat =
      (forwardMeters * Math.cos(bearing) + rightMeters * Math.cos(rightBearing)) /
      metersPerLat;
    const dLng =
      (forwardMeters * Math.sin(bearing) + rightMeters * Math.sin(rightBearing)) /
      metersPerLng;
    return { lat: point.lat + dLat, lng: point.lng + dLng };
  }

  function getSurveyOrigin(vertices) {
    const seed = vertices && vertices.length ? vertices[0] : { lng: 0, lat: 0 };
    return { lng: Number(seed.lng) || 0, lat: Number(seed.lat) || 0 };
  }

  function projectLngLatToMeters(point, origin) {
    const metersPerLat = 111320;
    const metersPerLng = Math.cos((origin.lat * Math.PI) / 180) * metersPerLat;
    return {
      x: (point.lng - origin.lng) * metersPerLng,
      y: (point.lat - origin.lat) * metersPerLat
    };
  }

  function projectMetersToLngLat(point, origin) {
    const metersPerLat = 111320;
    const metersPerLng = Math.cos((origin.lat * Math.PI) / 180) * metersPerLat || 1;
    return {
      lng: origin.lng + point.x / metersPerLng,
      lat: origin.lat + point.y / metersPerLat
    };
  }

  function rotatePoint(point, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: point.x * cos - point.y * sin,
      y: point.x * sin + point.y * cos
    };
  }

  function inverseRotatePoint(point, angle) {
    return rotatePoint(point, -angle);
  }

  function getLongestEdgeHeading(points) {
    if (!Array.isArray(points) || points.length < 2) {
      return 0;
    }
    let bestLength = 0;
    let bestHeading = 0;
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      const dx = next.x - current.x;
      const dy = next.y - current.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq > bestLength) {
        bestLength = distanceSq;
        bestHeading = Math.atan2(dx, dy);
      }
    }
    return bestHeading;
  }

  function getHorizontalIntersections(points, y) {
    const intersections = [];
    for (let index = 0; index < points.length; index += 1) {
      const start = points[index];
      const end = points[(index + 1) % points.length];
      const minY = Math.min(start.y, end.y);
      const maxY = Math.max(start.y, end.y);
      if (start.y === end.y) {
        continue;
      }
      if (y < minY || y >= maxY) {
        continue;
      }
      const ratio = (y - start.y) / (end.y - start.y);
      intersections.push(start.x + ratio * (end.x - start.x));
    }
    intersections.sort(function (left, right) {
      return left - right;
    });
    const deduped = [];
    intersections.forEach(function (x) {
      if (!deduped.length || Math.abs(x - deduped[deduped.length - 1]) > 0.05) {
        deduped.push(x);
      }
    });
    return deduped;
  }

  function getRowLegEndpoints(orderedSegments, forward) {
    if (!orderedSegments || !orderedSegments.length) {
      return null;
    }
    const firstSeg = orderedSegments[0];
    const lastSeg = orderedSegments[orderedSegments.length - 1];
    if (forward) {
      return { from: firstSeg[0], to: lastSeg[1] };
    }
    return { from: firstSeg[1], to: lastSeg[0] };
  }

  function buildSurveyRows(rotatedPolygon, rowSpacing) {
    const bounds = rotatedPolygon.reduce(
      function (accumulator, point) {
        accumulator.minY = Math.min(accumulator.minY, point.y);
        accumulator.maxY = Math.max(accumulator.maxY, point.y);
        return accumulator;
      },
      { minY: Infinity, maxY: -Infinity }
    );
    if (!isFinite(bounds.minY) || !isFinite(bounds.maxY)) {
      return [];
    }
    const rows = [];
    const startY = bounds.minY + rowSpacing / 2;
    for (let y = startY; y <= bounds.maxY + 0.0001; y += rowSpacing) {
      const intersections = getHorizontalIntersections(rotatedPolygon, y);
      if (intersections.length < 2) {
        continue;
      }
      const segments = [];
      for (let index = 0; index < intersections.length - 1; index += 2) {
        const startX = intersections[index];
        const endX = intersections[index + 1];
        if (Math.abs(endX - startX) < 0.001) {
          continue;
        }
        segments.push([
          { x: startX, y: y },
          { x: endX, y: y }
        ]);
      }
      if (segments.length) {
        rows.push(segments);
      }
    }
    return rows;
  }

  function resolveSurveyEntryConfig(entryCorner) {
    const corner = entryCorner || "top-left";
    return {
      reverseRows: corner === "top-left" || corner === "top-right",
      firstRowForward: corner === "top-left" || corner === "bottom-left"
    };
  }

  function getSurveyPathPointRole(pointIndex, pointCount) {
    if (pointCount === 4) {
      return ["overshoot-entry", "line-start", "line-end", "overshoot-exit"][pointIndex];
    }
    if (pointCount === 2) {
      return pointIndex === 0 ? "line-start" : "line-end";
    }
    return "connector";
  }

  function estimatePathLengthMeters(path) {
    let total = 0;
    for (let i = 1; i < path.length; i += 1) {
      total += distanceMetersBetween(path[i - 1], path[i]);
    }
    return total;
  }

  /**
   * 粗略估算一个测区的单架次航时（分钟），用于自动切块的航时软约束。
   * 计入三部分：巡测直线、转弯盘旋（固定翼半圈弧长）、地形爬升。
   * 仅服务于切块判断，不写入任务航点。
   * @param {Array<{lng:number,lat:number}>} polygon
   * @param {Object} settings 测绘设置（含 sideOverlap/lineSpacing/速度/爬升率等）
   * @param {string} platform copter|plane|vtol
   * @param {Object} terrainStats { relief } 该子块高差
   * @returns {{minutes:number, seconds:number, lengthM:number, turns:number,
   *            breakdown:{cruise:number, turns:number, climb:number}}}
   */
  function estimateBlockFlightTime(polygon, settings, platform, terrainStats) {
    const cfg = settings || {};
    const cruiseSpeed = Math.max(
      1,
      Number(cfg.terrainCruiseSpeedMps) || Number(cfg.speed) || 20
    );
    const climbRate = Math.max(0.3, Number(cfg.terrainMaxClimbRateMps) || 3);
    const lineSpacing = Math.max(
      4,
      Number(cfg.lineSpacingMeters) ||
        (Number(cfg.footprintWidthMeters) || 60) * (1 - (Number(cfg.sideOverlap) || 0.7))
    );
    const opts = {
      turnAroundMeters: cfg.turnAroundMeters,
      entryCorner: cfg.surveyEntryCorner,
      footprintWidthMeters: cfg.footprintWidthMeters,
      lineSpacingMeters: lineSpacing
    };
    if (Number.isFinite(Number(cfg.surveyHeadingDeg))) {
      opts.headingDegrees = Number(cfg.surveyHeadingDeg);
    }
    const path = generateSurveyPath(polygon, cfg.sideOverlap, opts);
    const lengthM = estimatePathLengthMeters(path);

    let rowCount = 0;
    let lastRow = null;
    path.forEach(function (point) {
      if (point.row !== lastRow) {
        rowCount += 1;
        lastRow = point.row;
      }
    });
    const turns = Math.max(0, rowCount - 1);

    const fw = window.FixedWingParams;
    const isFw =
      fw && typeof fw.isFixedWingPlatform === "function"
        ? fw.isFixedWingPlatform(platform)
        : platform === "plane" || platform === "vtol";
    const turnRadius = (fw && fw.FW_SURVEY_TURN_LOITER_RADIUS_M) || 80;
    // 固定翼每次掉头按半圈盘旋弧长（π·R）计；多旋翼掉头开销忽略。
    const turnLengthM = isFw ? turns * Math.PI * turnRadius : 0;

    const relief = Math.max(0, Number(terrainStats && terrainStats.relief) || 0);
    // 爬升量估算：主爬升一次（爬上整个高程带），叠加每次掉头的起伏附加（按 30% 高差）。
    const undulationFactor = 0.3;
    const totalClimbM = relief * (1 + undulationFactor * turns);

    const cruiseSec = lengthM / cruiseSpeed;
    const turnSec = turnLengthM / cruiseSpeed;
    // 保守处理：爬升时间叠加在巡航时间之上（爬升率受限时的附加耗时）。
    const climbSec = totalClimbM / climbRate;
    const totalSec = cruiseSec + turnSec + climbSec;

    return {
      minutes: totalSec / 60,
      seconds: totalSec,
      lengthM: lengthM,
      turns: turns,
      breakdown: {
        cruise: cruiseSec / 60,
        turns: turnSec / 60,
        climb: climbSec / 60
      }
    };
  }

  function generateSurveyPath(polygonVertices, overlapRate, options) {
    const settings = options || {};
    const vertices = Array.isArray(polygonVertices) ? polygonVertices : [];
    if (vertices.length < 3) {
      return [];
    }

    const origin = getSurveyOrigin(vertices);
    const localPolygon = vertices.map(function (vertex) {
      return projectLngLatToMeters(vertex, origin);
    });

    let rotationRad;
    if (Number.isFinite(settings.headingRadians)) {
      rotationRad = settings.headingRadians;
    } else if (Number.isFinite(settings.headingDegrees)) {
      rotationRad = trueNorthBearingDegToLocalRotationRad(settings.headingDegrees);
    } else {
      rotationRad = trueNorthBearingRadToLocalRotationRad(getLongestEdgeHeading(localPolygon));
    }

    const rotatedPolygon = localPolygon.map(function (point) {
      return rotatePoint(point, -rotationRad);
    });

    const rowSpacing = Math.max(
      4,
      Number(settings.lineSpacingMeters) ||
        Math.max(5, Number(settings.footprintWidthMeters) || 60) *
          (1 - clamp(Number(overlapRate) || 0.7, 0.01, 0.99))
    );
    const turnAroundMeters = Math.max(0, Number(settings.turnAroundMeters) || 0);
    const entryConfig = resolveSurveyEntryConfig(
      settings.entryCorner || settings.surveyEntryCorner
    );
    const rows = buildSurveyRows(rotatedPolygon, rowSpacing);
    const orderedRows = entryConfig.reverseRows ? rows.slice().reverse() : rows;
    const path = [];

    orderedRows.forEach(function (segments, rowIndex) {
      const forward = entryConfig.firstRowForward
        ? rowIndex % 2 === 0
        : rowIndex % 2 !== 0;
      const orderedSegments = forward ? segments.slice() : segments.slice().reverse();
      const leg = getRowLegEndpoints(orderedSegments, forward);
      if (!leg) {
        return;
      }

      const from = leg.from;
      const to = leg.to;
      const legStart =
        turnAroundMeters > 0
          ? { x: from.x - (forward ? turnAroundMeters : -turnAroundMeters), y: from.y }
          : from;
      const legEnd =
        turnAroundMeters > 0
          ? { x: to.x + (forward ? turnAroundMeters : -turnAroundMeters), y: to.y }
          : to;
      const orderedPoints = turnAroundMeters > 0 ? [legStart, from, to, legEnd] : [from, to];

      orderedPoints.forEach(function (point, pointIndex) {
        const rotatedBack = inverseRotatePoint(point, -rotationRad);
        const lngLat = projectMetersToLngLat(rotatedBack, origin);
        const previous = path[path.length - 1];
        const role = getSurveyPathPointRole(pointIndex, orderedPoints.length);
        if (previous && lngLatEquals(previous, lngLat, 1e-9)) {
          return;
        }
        path.push({
          lng: lngLat.lng,
          lat: lngLat.lat,
          row: rowIndex,
          segment: 0,
          role: role
        });
      });
    });

    return path;
  }

  function pickBestSurveyHeadingDegrees(polygonVertices, overlapRate, options) {
    const base = options || {};
    const vertices = Array.isArray(polygonVertices) ? polygonVertices : [];
    if (vertices.length < 3) {
      return null;
    }

    const origin = getSurveyOrigin(vertices);
    const localPolygon = vertices.map(function (vertex) {
      return projectLngLatToMeters(vertex, origin);
    });
    const seedDeg = normalizeSurveyHeadingDegrees(
      (getLongestEdgeHeading(localPolygon) * 180) / Math.PI
    );

    const candidateSet = {};
    candidateSet[seedDeg] = true;
    for (let offset = 15; offset < 90; offset += 15) {
      candidateSet[(seedDeg + offset) % 180] = true;
      candidateSet[(seedDeg - offset + 180) % 180] = true;
    }

    let bestHeadingDeg = seedDeg;
    let bestLength = Infinity;
    Object.keys(candidateSet).forEach(function (key) {
      const deg = Number(key);
      const path = generateSurveyPath(vertices, overlapRate, Object.assign({}, base, {
        headingDegrees: deg
      }));
      const len = estimatePathLengthMeters(path);
      if (len < bestLength) {
        bestLength = len;
        bestHeadingDeg = deg;
      }
    });
    return bestHeadingDeg;
  }

  function terrainVarianceAlongPath(path, elevations) {
    if (!path || path.length < 2 || !elevations || !elevations.length) {
      return 0;
    }
    let sum = 0;
    let count = 0;
    for (let i = 1; i < elevations.length; i += 1) {
      const a = elevations[i - 1];
      const b = elevations[i];
      if (a == null || b == null) {
        continue;
      }
      sum += Math.abs(b - a);
      count += 1;
    }
    return count ? sum / count : 0;
  }

  function maxClimbRateAlongPath(path, elevations, speedMps) {
    const speed = Math.max(1, Number(speedMps) || 20);
    let maxRate = 0;
    for (let i = 1; i < path.length && i < elevations.length; i += 1) {
      const a = elevations[i - 1];
      const b = elevations[i];
      if (a == null || b == null) {
        continue;
      }
      const dist = distanceMetersBetween(path[i - 1], path[i]);
      if (dist < 1) {
        continue;
      }
      maxRate = Math.max(maxRate, Math.abs(b - a) / (dist / speed));
    }
    return maxRate;
  }

  function normalizeSurveyHeadingDegrees(value) {
    const deg = Number(value);
    if (!Number.isFinite(deg)) {
      return null;
    }
    return ((Math.round(deg) % 180) + 180) % 180;
  }

  // 全模块统一：真北为 0°，顺时针，东为 90°（与 projectionAlongBearing / computeBearingDegrees 一致）。
  function trueNorthBearingDegToLocalRotationRad(bearingDeg) {
    const navRad = (Number(bearingDeg) * Math.PI) / 180;
    return Math.PI / 2 - navRad;
  }

  function trueNorthBearingRadToLocalRotationRad(bearingRad) {
    return Math.PI / 2 - Number(bearingRad);
  }

  function angleDistanceDeg(a, b) {
    const left = normalizeSurveyHeadingDegrees(a);
    const right = normalizeSurveyHeadingDegrees(b);
    if (left == null || right == null) {
      return 90;
    }
    let delta = Math.abs(left - right) % 180;
    if (delta > 90) {
      delta = 180 - delta;
    }
    return delta;
  }

  function pointInPolygonMeters(point, polygon) {
    if (!point || !polygon || polygon.length < 3) {
      return false;
    }
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;
      const intersects =
        yi > point.y !== yj > point.y &&
        point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-9) + xi;
      if (intersects) {
        inside = !inside;
      }
    }
    return inside;
  }

  function buildTerrainOrientationGrid(vertices, maxAxisSamples) {
    const origin = getSurveyOrigin(vertices);
    const projected = vertices.map(function (vertex) {
      return projectLngLatToMeters(vertex, origin);
    });
    const bounds = projected.reduce(
      function (acc, point) {
        acc.minX = Math.min(acc.minX, point.x);
        acc.maxX = Math.max(acc.maxX, point.x);
        acc.minY = Math.min(acc.minY, point.y);
        acc.maxY = Math.max(acc.maxY, point.y);
        return acc;
      },
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
    );
    const widthM = Math.max(1, bounds.maxX - bounds.minX);
    const heightM = Math.max(1, bounds.maxY - bounds.minY);
    const axisLimit = Math.max(12, Number(maxAxisSamples) || 28);
    const spacing = Math.max(30, Math.max(widthM, heightM) / Math.max(2, axisLimit - 1));
    const cols = Math.min(axisLimit, Math.max(6, Math.floor(widthM / spacing) + 1));
    const rows = Math.min(axisLimit, Math.max(6, Math.floor(heightM / spacing) + 1));
    const stepX = cols > 1 ? widthM / (cols - 1) : widthM;
    const stepY = rows > 1 ? heightM / (rows - 1) : heightM;
    const samplePoints = [];
    const grid = [];
    let insideCount = 0;

    for (let row = 0; row < rows; row += 1) {
      const y = bounds.minY + stepY * row;
      const gridRow = [];
      for (let col = 0; col < cols; col += 1) {
        const x = bounds.minX + stepX * col;
        const inside = pointInPolygonMeters({ x: x, y: y }, projected);
        const ll = projectMetersToLngLat({ x: x, y: y }, origin);
        const cell = { x: x, y: y, lat: ll.lat, lng: ll.lng, inside: inside, z: null };
        if (inside) {
          insideCount += 1;
          samplePoints.push({ lat: ll.lat, lng: ll.lng });
        }
        gridRow.push(cell);
      }
      grid.push(gridRow);
    }

    return {
      origin: origin,
      projected: projected,
      bounds: bounds,
      rows: rows,
      cols: cols,
      stepX: stepX,
      stepY: stepY,
      grid: grid,
      samplePoints: samplePoints,
      insideCount: insideCount
    };
  }

  function applyTerrainGridSamples(gridState, samples) {
    if (!gridState || !Array.isArray(gridState.grid)) {
      return {
        validCount: 0,
        validRatio: 0,
        minElevation: Infinity,
        maxElevation: -Infinity
      };
    }
    let sampleIndex = 0;
    let validCount = 0;
    let minElevation = Infinity;
    let maxElevation = -Infinity;
    for (let row = 0; row < gridState.rows; row += 1) {
      for (let col = 0; col < gridState.cols; col += 1) {
        const cell = gridState.grid[row][col];
        if (!cell.inside) {
          continue;
        }
        const sample = samples[sampleIndex];
        sampleIndex += 1;
        const elevation =
          sample && sample.elevation != null && Number.isFinite(Number(sample.elevation))
            ? Number(sample.elevation)
            : null;
        cell.z = elevation;
        if (elevation != null) {
          validCount += 1;
          minElevation = Math.min(minElevation, elevation);
          maxElevation = Math.max(maxElevation, elevation);
        }
      }
    }
    return {
      validCount: validCount,
      validRatio: gridState.insideCount ? validCount / gridState.insideCount : 0,
      minElevation: minElevation,
      maxElevation: maxElevation
    };
  }

  function estimateContourAlignedHeadingFromGrid(gridState) {
    if (!gridState || !Array.isArray(gridState.grid) || gridState.rows < 3 || gridState.cols < 3) {
      return null;
    }
    let sumCos2 = 0;
    let sumSin2 = 0;
    let weightTotal = 0;

    for (let row = 1; row < gridState.rows - 1; row += 1) {
      for (let col = 1; col < gridState.cols - 1; col += 1) {
        const center = gridState.grid[row][col];
        const left = gridState.grid[row][col - 1];
        const right = gridState.grid[row][col + 1];
        const up = gridState.grid[row - 1][col];
        const down = gridState.grid[row + 1][col];
        if (
          !center ||
          !center.inside ||
          !left ||
          !right ||
          !up ||
          !down ||
          left.z == null ||
          right.z == null ||
          up.z == null ||
          down.z == null
        ) {
          continue;
        }
        const dzdx = (Number(right.z) - Number(left.z)) / Math.max(1, 2 * gridState.stepX);
        const dzdy = (Number(down.z) - Number(up.z)) / Math.max(1, 2 * gridState.stepY);
        const gradientMag = Math.sqrt(dzdx * dzdx + dzdy * dzdy);
        if (!Number.isFinite(gradientMag) || gradientMag < 0.002) {
          continue;
        }
        // 等高线切线方向（真北 0°，东 90°）：梯度 (dzdx,dzdy) 指向上坡，切线为 (-dzdy,dzdx) 东/北分量。
        const tangentRad = Math.atan2(-dzdy, dzdx);
        const weight = gradientMag * gradientMag;
        sumCos2 += Math.cos(2 * tangentRad) * weight;
        sumSin2 += Math.sin(2 * tangentRad) * weight;
        weightTotal += weight;
      }
    }

    if (weightTotal <= 0) {
      return null;
    }
    const dominantRad = 0.5 * Math.atan2(sumSin2, sumCos2);
    return normalizeSurveyHeadingDegrees((dominantRad * 180) / Math.PI);
  }

  function resolveSurveyHeadingFallback(vertices, overlapRate, base, externalPreferredDeg) {
    if (Number.isFinite(Number(externalPreferredDeg))) {
      return normalizeSurveyHeadingDegrees(Number(externalPreferredDeg));
    }
    return pickBestSurveyHeadingDegrees(vertices, overlapRate, base);
  }

  function pickBestSurveyHeadingWithTerrain(polygonVertices, overlapRate, settings, platform, externalPreferredDeg) {
    const base = {
      turnAroundMeters: settings.turnAroundMeters,
      entryCorner: settings.surveyEntryCorner,
      footprintWidthMeters: settings.footprintWidthMeters,
      lineSpacingMeters: settings.lineSpacingMeters
    };
    const vertices = Array.isArray(polygonVertices) ? polygonVertices : [];
    if (vertices.length < 3) {
      return Promise.resolve(null);
    }
    const origin = getSurveyOrigin(vertices);
    const localPolygon = vertices.map(function (vertex) {
      return projectLngLatToMeters(vertex, origin);
    });
    const seedDeg = normalizeSurveyHeadingDegrees(
      (getLongestEdgeHeading(localPolygon) * 180) / Math.PI
    );
    const isFw = platform === "plane" || platform === "vtol";
    const w1 = 1;
    const w2 = isFw ? 8 : 3;
    const w3 = isFw ? 12 : 4;
    const w4 = isFw ? 18 : 8;
    const speed = Number(settings.terrainCruiseSpeedMps || settings.speed) || 20;
    const TS = window.TerrainService;
    if (!TS || !TS.sampleElevationBatch) {
      return Promise.resolve(
        resolveSurveyHeadingFallback(vertices, overlapRate, base, externalPreferredDeg)
      );
    }

    function buildHeadingCandidates(startDeg, endDeg, stepDeg) {
      const seen = {};
      const list = [];
      for (let deg = startDeg; deg <= endDeg + 0.001; deg += stepDeg) {
        const normalized = normalizeSurveyHeadingDegrees(deg);
        if (normalized == null || seen[normalized]) {
          continue;
        }
        seen[normalized] = true;
        list.push(normalized);
      }
      return list;
    }

    function evaluateHeading(deg, preferredDeg) {
      const path = generateSurveyPath(
        vertices,
        overlapRate,
        Object.assign({}, base, { headingDegrees: deg })
      );
      const pts = path.map(function (p) {
        return { lat: p.lat, lng: p.lng };
      });
      if (pts.length < 2) {
        return Promise.resolve({ deg: deg, score: Infinity });
      }
      return TS.sampleElevationBatch(pts, { timeoutMs: 8000 }).then(function (samples) {
        const elevs = (samples || []).map(function (s) {
          return s && s.elevation != null ? Number(s.elevation) : null;
        });
        const validCount = elevs.reduce(function (count, value) {
          return count + (value == null || !Number.isFinite(value) ? 0 : 1);
        }, 0);
        if (validCount < 2) {
          throw new Error("terrain samples unavailable");
        }
        const len = estimatePathLengthMeters(path);
        const variance = terrainVarianceAlongPath(path, elevs);
        const climb = maxClimbRateAlongPath(path, elevs, speed);
        const directionPenalty =
          preferredDeg == null ? 0 : angleDistanceDeg(deg, preferredDeg) * 25;
        const score = w1 * len + w2 * variance + w3 * climb + w4 * directionPenalty;
        return { deg: deg, score: score };
      });
    }

    function pickBestFromResults(results, fallbackDeg) {
      let bestDeg = fallbackDeg;
      let bestScore = Infinity;
      (results || []).forEach(function (result) {
        if (!result || !Number.isFinite(result.score)) {
          return;
        }
        if (result.score < bestScore) {
          bestScore = result.score;
          bestDeg = result.deg;
        }
      });
      return {
        deg: bestDeg,
        score: bestScore
      };
    }

    function searchBestHeading(preferredHeading) {
      const candidateMap = {};
      buildHeadingCandidates(0, 179, 15).forEach(function (deg) {
        candidateMap[deg] = true;
      });
      if (preferredHeading != null) {
        buildHeadingCandidates(preferredHeading - 18, preferredHeading + 18, 6).forEach(function (deg) {
          candidateMap[deg] = true;
        });
      }
      if (seedDeg != null) {
        buildHeadingCandidates(seedDeg - 18, seedDeg + 18, 6).forEach(function (deg) {
          candidateMap[deg] = true;
        });
      }
      const coarseCandidates = Object.keys(candidateMap).map(function (key) {
        return Number(key);
      });
      return Promise.all(
        coarseCandidates.map(function (deg) {
          return evaluateHeading(deg, preferredHeading);
        })
      ).then(function (coarseResults) {
        const coarseBest = pickBestFromResults(coarseResults, preferredHeading);
        const fineCandidateMap = {};
        buildHeadingCandidates(coarseBest.deg - 12, coarseBest.deg + 12, 3).forEach(function (deg) {
          fineCandidateMap[deg] = true;
        });
        if (preferredHeading != null) {
          buildHeadingCandidates(preferredHeading - 9, preferredHeading + 9, 3).forEach(function (deg) {
            fineCandidateMap[deg] = true;
          });
        }
        const fineCandidates = Object.keys(fineCandidateMap).map(function (key) {
          return Number(key);
        });
        return Promise.all(
          fineCandidates.map(function (deg) {
            return evaluateHeading(deg, preferredHeading);
          })
        ).then(function (fineResults) {
          return pickBestFromResults(fineResults.concat(coarseResults || []), coarseBest.deg).deg;
        });
      });
    }

    const orientationGrid = buildTerrainOrientationGrid(vertices, isFw ? 32 : 28);
    if (!orientationGrid.samplePoints.length) {
      return Promise.resolve(
        resolveSurveyHeadingFallback(vertices, overlapRate, base, externalPreferredDeg)
      );
    }

    const externalPreferred = Number.isFinite(Number(externalPreferredDeg))
      ? Number(externalPreferredDeg)
      : null;
    const minGridValidRatio = externalPreferred != null ? 0.28 : 0.65;

    return TS.sampleElevationBatch(orientationGrid.samplePoints, { timeoutMs: 8000 })
      .then(function (samples) {
        const stats = applyTerrainGridSamples(orientationGrid, samples || []);
        if (
          stats.validRatio < minGridValidRatio ||
          !Number.isFinite(stats.minElevation) ||
          !Number.isFinite(stats.maxElevation)
        ) {
          throw new Error("terrain orientation samples unavailable");
        }
        const contourHeading = estimateContourAlignedHeadingFromGrid(orientationGrid);
        // If a high-quality global contour heading was supplied from the parent large-polygon
        // partition step (the reliable "沿着等高线归划" prior computed on the full DEM grid),
        // use it as the authoritative preferred direction. This guides the full terrain-cost
        // search (variance + climb + direction penalty) on thin elevation-band sub-polygons
        // whose own local grid would otherwise be too noisy or fail the 0.65 validRatio.
        const preferredHeading =
          externalPreferred != null
            ? externalPreferred
            : (contourHeading != null ? contourHeading : seedDeg);
        return searchBestHeading(preferredHeading);
      })
      .catch(function () {
        const fallbackPreferred = externalPreferred != null ? externalPreferred : null;
        if (fallbackPreferred != null) {
          return searchBestHeading(fallbackPreferred).catch(function () {
            return fallbackPreferred;
          });
        }
        return resolveSurveyHeadingFallback(vertices, overlapRate, base, externalPreferredDeg);
      });
  }

  function pushUniqueCorner(corners, point, pathRole) {
    const last = corners[corners.length - 1];
    if (last && distanceMetersBetween(last, point) < CONNECTOR_MIN_DIST_M) {
      if (pathRole && !last.pathRole) {
        last.pathRole = pathRole;
      }
      if (point.row != null && last.row == null) {
        last.row = point.row;
      }
      if (point.segment != null && last.segment == null) {
        last.segment = point.segment;
      }
      if (point.aglOverride != null && last.aglOverride == null) {
        last.aglOverride = point.aglOverride;
      }
      if (point.loiterClimbBefore && !last.loiterClimbBefore) {
        last.loiterClimbBefore = point.loiterClimbBefore;
      }
      return;
    }
    corners.push({
      lng: point.lng,
      lat: point.lat,
      pathRole: pathRole || point.role || "",
      row: point.row,
      segment: point.segment,
      aglOverride: point.aglOverride,
      loiterClimbBefore: point.loiterClimbBefore
    });
  }

  function densifySegment(start, end, maxStepM) {
    const dist = distanceMetersBetween(start, end);
    if (dist <= maxStepM) {
      return [end];
    }
    const steps = Math.ceil(dist / maxStepM);
    const out = [];
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      out.push({
        lng: start.lng + (end.lng - start.lng) * t,
        lat: start.lat + (end.lat - start.lat) * t
      });
    }
    return out;
  }

  function shouldDensifyFwSurveyLeg(from, to) {
    return !(
      from.pathRole === "line-start" &&
      to.pathRole === "line-end"
    );
  }

  function resolveFwSurveySegmentRole(pathRole) {
    if (pathRole === "line-start" || pathRole === "line-end") {
      return "transect";
    }
    if (pathRole === "overshoot-entry" || pathRole === "overshoot-exit") {
      return "connector";
    }
    return "turn";
  }

  function resolveFwDensifySegmentRole(from, to) {
    const fromRole = resolveFwSurveySegmentRole(from.pathRole || "");
    const toRole = resolveFwSurveySegmentRole(to.pathRole || "");
    if (fromRole === "connector" || toRole === "connector") {
      return "connector";
    }
    if (fromRole === "turn" || toRole === "turn") {
      return "turn";
    }
    return "transect";
  }

  function extractSurveyRouteWaypoints(path, platform) {
    if (!Array.isArray(path) || !path.length) {
      return [];
    }
    if (path.length === 1) {
      return [
        {
          lng: path[0].lng,
          lat: path[0].lat,
          pathRole: path[0].role || "",
          segmentRole: "transect",
          row: path[0].row,
          segment: path[0].segment
        }
      ];
    }

    const isFw = platform === "plane" || platform === "vtol";
    const minTurnDegrees = isFw ? FW_TURN_MIN_DEG : CONNECTOR_MIN_TURN_DEG;
    const corners = [];

    pushUniqueCorner(corners, path[0], path[0].role);

    for (let index = 1; index < path.length - 1; index += 1) {
      const previous = path[index - 1];
      const current = path[index];
      const next = path[index + 1];
      const isRoleCorner =
        current.role === "line-start" || current.role === "line-end";
      const bearingIn = computeBearingDegrees(previous, current);
      const bearingOut = computeBearingDegrees(current, next);
      let turnDelta = Math.abs(bearingOut - bearingIn);
      if (turnDelta > 180) {
        turnDelta = 360 - turnDelta;
      }
      if (isRoleCorner || turnDelta >= minTurnDegrees) {
        pushUniqueCorner(corners, current, current.role);
      }
    }

    pushUniqueCorner(corners, path[path.length - 1], path[path.length - 1].role);

    if (!isFw) {
      return corners.map(function (p) {
        return Object.assign({}, p, { segmentRole: "transect" });
      });
    }

    const dense = [];
    for (let i = 0; i < corners.length; i += 1) {
      const pt = corners[i];
      dense.push(Object.assign({}, pt, {
        segmentRole: resolveFwSurveySegmentRole(pt.pathRole || "")
      }));
      if (i < corners.length - 1) {
        const nextCorner = corners[i + 1];
        if (shouldDensifyFwSurveyLeg(pt, nextCorner)) {
          const legRole = resolveFwDensifySegmentRole(pt, nextCorner);
          const midPts = densifySegment(pt, nextCorner, FW_MAX_SEGMENT_M);
          midPts.slice(0, -1).forEach(function (m) {
            dense.push(
              Object.assign({}, m, {
                segmentRole: legRole,
                pathRole: "",
                row: pt.row,
                segment: pt.segment
              })
            );
          });
        }
      }
    }
    return dense;
  }

  function buildSurveyMissionLegsFromPath(path, platform) {
    const isFw = platform === "plane" || platform === "vtol";
    if (isFw) {
      return extractSurveyRouteWaypoints(path, platform);
    }

    if (!Array.isArray(path) || !path.length) {
      return [];
    }

    const keyOrder = [];
    const groups = {};
    path.forEach(function (point) {
      const key = String(point.row != null ? point.row : 0);
      if (!groups[key]) {
        groups[key] = [];
        keyOrder.push(key);
      }
      groups[key].push(point);
    });

    const legs = [];
    keyOrder.forEach(function (key, transectIndex) {
      const points = groups[key];
      const isFirstTransect = transectIndex === 0;
      const isLastTransect = transectIndex === keyOrder.length - 1;

      points.forEach(function (point) {
        const pathRole = point.role || "";
        let label = "";
        let segmentRole = "transect";

        if (pathRole === "overshoot-entry") {
          label = isFirstTransect ? "测区起点" : "转弯";
          segmentRole = "connector";
        } else if (pathRole === "overshoot-exit") {
          label = isLastTransect ? "测区终点" : "转弯";
          segmentRole = "connector";
        } else if (pathRole === "line-start") {
          label = "测线起点";
        } else if (pathRole === "line-end") {
          label = "测线终点";
        } else if (pathRole === "connector") {
          label = "转弯";
          segmentRole = "connector";
        }

        legs.push({
          lng: point.lng,
          lat: point.lat,
          pathRole: pathRole,
          segmentRole: segmentRole,
          row: point.row,
          segment: point.segment,
          label: label,
          transectIndex: transectIndex,
          aglOverride: point.aglOverride,
          loiterClimbBefore: point.loiterClimbBefore
        });
      });
    });

    return legs;
  }

  function computeCameraTriggerDistanceMeters(footprintHeightMeters, forwardOverlap) {
    const height = Math.max(1, Number(footprintHeightMeters) || 1);
    const overlap = Math.min(0.99, Math.max(0.01, Number(forwardOverlap) || 0.7));
    return Math.max(0.5, height * (1 - overlap));
  }

  function buildConnectorPoints(from, to, thresholdM) {
    const dist = distanceMetersBetween(from, to);
    if (dist <= thresholdM) {
      return [];
    }
    const bearing = computeBearingDegrees(from, to);
    const mid = offsetLatLngMeters(from, bearing, dist * 0.5, 0);
    if (dist > thresholdM * 2.5) {
      const q1 = offsetLatLngMeters(from, bearing, dist * 0.33, 0);
      const q2 = offsetLatLngMeters(from, bearing, dist * 0.66, 0);
      return [q1, q2];
    }
    return [mid];
  }

  window.SurveyPlanner = {
    generateSurveyPath: generateSurveyPath,
    pickBestSurveyHeadingDegrees: pickBestSurveyHeadingDegrees,
    pickBestSurveyHeadingWithTerrain: pickBestSurveyHeadingWithTerrain,
    extractSurveyRouteWaypoints: extractSurveyRouteWaypoints,
    buildSurveyMissionLegsFromPath: buildSurveyMissionLegsFromPath,
    buildConnectorPoints: buildConnectorPoints,
    distanceMetersBetween: distanceMetersBetween,
    computeBearingDegrees: computeBearingDegrees,
    estimatePathLengthMeters: estimatePathLengthMeters,
    estimateBlockFlightTime: estimateBlockFlightTime,
    computeCameraTriggerDistanceMeters: computeCameraTriggerDistanceMeters,
    buildTerrainOrientationGrid: buildTerrainOrientationGrid,
    applyTerrainGridSamples: applyTerrainGridSamples,
    estimateContourAlignedHeadingFromGrid: estimateContourAlignedHeadingFromGrid,
    trueNorthBearingDegToLocalRotationRad: trueNorthBearingDegToLocalRotationRad,
    normalizeSurveyHeadingDegrees: normalizeSurveyHeadingDegrees,
    getSurveyOrigin: getSurveyOrigin,
    CONNECTOR_THRESHOLD_M: 80,
    FW_MAX_SEGMENT_M: FW_MAX_SEGMENT_M
  };
})();
