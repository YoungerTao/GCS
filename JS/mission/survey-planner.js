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
        bestHeading = Math.atan2(dy, dx);
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

    let heading;
    if (Number.isFinite(settings.headingRadians)) {
      heading = settings.headingRadians;
    } else if (Number.isFinite(settings.headingDegrees)) {
      heading = (settings.headingDegrees * Math.PI) / 180;
    } else {
      heading = getLongestEdgeHeading(localPolygon);
    }

    const rotatedPolygon = localPolygon.map(function (point) {
      return rotatePoint(point, -heading);
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
        const rotatedBack = inverseRotatePoint(point, -heading);
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
    const seedDeg =
      Math.round(((getLongestEdgeHeading(localPolygon) * 180) / Math.PI + 360) % 180) % 180;

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

  function pushUniqueCorner(corners, point, pathRole) {
    const last = corners[corners.length - 1];
    if (last && distanceMetersBetween(last, point) < CONNECTOR_MIN_DIST_M) {
      if (pathRole && !last.pathRole) {
        last.pathRole = pathRole;
      }
      return;
    }
    corners.push({
      lng: point.lng,
      lat: point.lat,
      pathRole: pathRole || point.role || ""
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
          segmentRole: "transect"
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
        segmentRole: i === 0 || i === corners.length - 1 ? "transect" : "turn"
      }));
      if (i < corners.length - 1) {
        const midPts = densifySegment(pt, corners[i + 1], FW_MAX_SEGMENT_M);
        midPts.slice(0, -1).forEach(function (m) {
          dense.push(
            Object.assign({}, m, {
              segmentRole: "transect",
              pathRole: ""
            })
          );
        });
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
        } else if (pathRole === "overshoot-exit") {
          label = isLastTransect ? "测区终点" : "转弯";
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
          transectIndex: transectIndex
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
    extractSurveyRouteWaypoints: extractSurveyRouteWaypoints,
    buildSurveyMissionLegsFromPath: buildSurveyMissionLegsFromPath,
    buildConnectorPoints: buildConnectorPoints,
    distanceMetersBetween: distanceMetersBetween,
    computeBearingDegrees: computeBearingDegrees,
    estimatePathLengthMeters: estimatePathLengthMeters,
    computeCameraTriggerDistanceMeters: computeCameraTriggerDistanceMeters,
    CONNECTOR_THRESHOLD_M: 80,
    FW_MAX_SEGMENT_M: FW_MAX_SEGMENT_M
  };
})();
