(function () {
  const SURVEY_CAMERA_PRESETS = [
    {
      id: "sony-ilx-lr1",
      brand: "Sony",
      name: "Sony ILX-LR1",
      sensorWidthMm: 35.7,
      sensorHeightMm: 23.8,
      resolutionW: 9504,
      resolutionH: 6336,
      interchangeableLens: true,
      focalLengthsMm: [14, 20, 24, 35, 50, 55, 85, 135],
      focalLengthMinMm: 8,
      focalLengthMaxMm: 500
    },
    {
      id: "sony-a7r5",
      brand: "Sony",
      name: "Sony α7R V",
      sensorWidthMm: 35.7,
      sensorHeightMm: 23.8,
      resolutionW: 9504,
      resolutionH: 6336,
      interchangeableLens: true,
      focalLengthsMm: [14, 20, 24, 35, 50, 55, 85, 135],
      focalLengthMinMm: 8,
      focalLengthMaxMm: 500
    },
    {
      id: "sony-a7r4",
      brand: "Sony",
      name: "Sony α7R IV",
      sensorWidthMm: 35.7,
      sensorHeightMm: 23.8,
      resolutionW: 9504,
      resolutionH: 6336,
      interchangeableLens: true,
      focalLengthsMm: [14, 20, 24, 35, 50, 55, 85, 135],
      focalLengthMinMm: 8,
      focalLengthMaxMm: 500
    },
    {
      id: "sony-a7iv",
      brand: "Sony",
      name: "Sony α7 IV",
      sensorWidthMm: 35.9,
      sensorHeightMm: 23.9,
      resolutionW: 7008,
      resolutionH: 4672,
      interchangeableLens: true,
      focalLengthsMm: [14, 20, 24, 35, 50, 55, 85, 135],
      focalLengthMinMm: 8,
      focalLengthMaxMm: 500
    },
    {
      id: "sony-a7c2",
      brand: "Sony",
      name: "Sony α7C II",
      sensorWidthMm: 35.9,
      sensorHeightMm: 23.9,
      resolutionW: 7008,
      resolutionH: 4672,
      interchangeableLens: true,
      focalLengthsMm: [20, 24, 35, 40, 50, 55, 85],
      focalLengthMinMm: 8,
      focalLengthMaxMm: 500
    },
    {
      id: "sony-a6400",
      brand: "Sony",
      name: "Sony α6400 (APS-C)",
      sensorWidthMm: 23.5,
      sensorHeightMm: 15.6,
      resolutionW: 6000,
      resolutionH: 4000,
      interchangeableLens: true,
      focalLengthsMm: [10, 16, 18, 20, 24, 35, 50, 55],
      focalLengthMinMm: 8,
      focalLengthMaxMm: 300
    },
    {
      id: "sony-rx1r2",
      brand: "Sony",
      name: "Sony RX1R II",
      sensorWidthMm: 35.9,
      sensorHeightMm: 24.0,
      resolutionW: 7952,
      resolutionH: 5304,
      interchangeableLens: false,
      focalLengthsMm: [35],
      focalLengthMinMm: 35,
      focalLengthMaxMm: 35
    },
    {
      id: "zenmuse-p1",
      brand: "DJI",
      name: "DJI Zenmuse P1",
      sensorWidthMm: 35.9,
      sensorHeightMm: 24.0,
      resolutionW: 8192,
      resolutionH: 5460,
      interchangeableLens: false,
      focalLengthsMm: [24, 35, 50],
      focalLengthMinMm: 24,
      focalLengthMaxMm: 50
    },
    {
      id: "mavic-3e",
      brand: "DJI",
      name: "DJI Mavic 3 Enterprise",
      sensorWidthMm: 17.3,
      sensorHeightMm: 13.0,
      resolutionW: 5280,
      resolutionH: 3956,
      interchangeableLens: false,
      focalLengthsMm: [12.29],
      focalLengthMinMm: 12.29,
      focalLengthMaxMm: 12.29
    },
    {
      id: "phantom-4-rtk",
      brand: "DJI",
      name: "DJI Phantom 4 RTK",
      sensorWidthMm: 13.2,
      sensorHeightMm: 8.8,
      resolutionW: 4864,
      resolutionH: 3648,
      interchangeableLens: false,
      focalLengthsMm: [8.8],
      focalLengthMinMm: 8.8,
      focalLengthMaxMm: 8.8
    },
    {
      id: "share-6100",
      brand: "赛尔",
      name: "赛尔 SHARE 6100",
      sensorWidthMm: 23.5,
      sensorHeightMm: 15.6,
      resolutionW: 6000,
      resolutionH: 4000,
      interchangeableLens: false,
      focalLengthsMm: [25, 35, 50],
      focalLengthMinMm: 25,
      focalLengthMaxMm: 50
    },
    {
      id: "ixm-100",
      brand: "Phase One",
      name: "Phase One iXM-100",
      sensorWidthMm: 44.0,
      sensorHeightMm: 33.0,
      resolutionW: 11664,
      resolutionH: 8750,
      interchangeableLens: false,
      focalLengthsMm: [35, 55, 80],
      focalLengthMinMm: 35,
      focalLengthMaxMm: 80
    }
  ];

  const DEFAULT_MISSION_SETTINGS = {
    altitude: 300,
    speed: 20,
    surveyAltitude: 300,
    forwardOverlap: 0.7,
    sideOverlap: 0.7,
    cameraId: "sony-ilx-lr1",
    focalLengthMm: 35,
    turnAroundMeters: 20,
    surveyEntryCorner: "top-left"
  };

  const SURVEY_ENTRY_CORNER_OPTIONS = [
    { id: "top-left", label: "左上" },
    { id: "top-right", label: "右上" },
    { id: "bottom-left", label: "左下" },
    { id: "bottom-right", label: "右下" }
  ];

  function normalizeSurveyEntryCorner(value) {
    const match = SURVEY_ENTRY_CORNER_OPTIONS.find(function (option) {
      return option.id === value;
    });
    return match ? match.id : DEFAULT_MISSION_SETTINGS.surveyEntryCorner;
  }

  function resolveSurveyEntryConfig(entryCorner) {
    const corner = normalizeSurveyEntryCorner(entryCorner);
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

  function midpointLatLng(a, b) {
    return {
      lat: (a.lat + b.lat) / 2,
      lng: (a.lng + b.lng) / 2
    };
  }

  function pointOnSegment(start, end, ratio) {
    const t = clamp(Number(ratio) || 0, 0, 1);
    return {
      lat: start.lat + (end.lat - start.lat) * t,
      lng: start.lng + (end.lng - start.lng) * t
    };
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

  const SURVEY_ROUTE_WP_LABEL_QUADRANTS = ["ne", "nw", "se", "sw"];

  function extractSurveyRouteWaypoints(path) {
    if (!Array.isArray(path) || !path.length) {
      return [];
    }

    if (path.length === 1) {
      return [{ lng: path[0].lng, lat: path[0].lat }];
    }

    const minTurnDegrees = 8;
    const corners = [];

    function pushUnique(point) {
      const last = corners[corners.length - 1];
      if (last && distanceMetersBetween(last, point) < 2) {
        return;
      }
      corners.push({ lng: point.lng, lat: point.lat });
    }

    pushUnique(path[0]);

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
        pushUnique(current);
      }
    }

    pushUnique(path[path.length - 1]);
    return corners;
  }

  function layoutSurveyRouteWaypoints(waypoints, minSeparationMeters) {
    const items = waypoints.map(function (point, index) {
      return {
        lng: point.lng,
        lat: point.lat,
        seq: index + 1,
        displayLat: point.lat,
        displayLng: point.lng,
        labelQuadrant: SURVEY_ROUTE_WP_LABEL_QUADRANTS[index % 4]
      };
    });

    for (let pass = 0; pass < 10; pass += 1) {
      for (let i = 0; i < items.length; i += 1) {
        for (let j = i + 1; j < items.length; j += 1) {
          const a = { lat: items[i].displayLat, lng: items[i].displayLng };
          const b = { lat: items[j].displayLat, lng: items[j].displayLng };
          const gap = distanceMetersBetween(a, b);
          if (gap >= minSeparationMeters) {
            continue;
          }

          const pushBearing = computeBearingDegrees(a, b);
          const pushDistance = minSeparationMeters - gap + 1.5;
          const moved = offsetLatLngMeters(b, pushBearing, pushDistance, 0);
          items[j].displayLat = moved.lat;
          items[j].displayLng = moved.lng;
          items[j].labelQuadrant =
            SURVEY_ROUTE_WP_LABEL_QUADRANTS[(j + pass + i) % 4];
        }
      }
    }

    return items;
  }

  function getSurveyCamera(cameraId) {
    const match = SURVEY_CAMERA_PRESETS.find(function (camera) {
      return camera.id === cameraId;
    });
    return match || SURVEY_CAMERA_PRESETS[0];
  }

  function cameraHasInterchangeableLens(camera) {
    return Boolean(camera && camera.interchangeableLens);
  }

  function normalizeCameraFocalLength(camera, focalLengthMm) {
    const presets = camera.focalLengthsMm || [];
    let focal = Number(focalLengthMm);

    if (!isFinite(focal) || focal <= 0) {
      focal = presets[0] || 35;
    }

    if (cameraHasInterchangeableLens(camera)) {
      const minFocal = Number(camera.focalLengthMinMm) || 8;
      const maxFocal = Number(camera.focalLengthMaxMm) || 500;
      return round(clamp(focal, minFocal, maxFocal), 2);
    }

    if (presets.indexOf(focal) === -1) {
      return presets[0];
    }

    return focal;
  }

  function getCameraBrandGroups() {
    const groups = [];
    const groupMap = {};

    SURVEY_CAMERA_PRESETS.forEach(function (camera) {
      const brand = camera.brand || "其他";
      if (!groupMap[brand]) {
        groupMap[brand] = [];
        groups.push({ brand: brand, cameras: groupMap[brand] });
      }
      groupMap[brand].push(camera);
    });

    return groups;
  }

  function computeGroundFootprintMeters(camera, focalLengthMm, altitudeMeters) {
    const focal = Math.max(1, Number(focalLengthMm) || 1);
    const altitude = Math.max(1, Number(altitudeMeters) || 1);
    return {
      widthMeters: (Number(camera.sensorWidthMm) / focal) * altitude,
      heightMeters: (Number(camera.sensorHeightMm) / focal) * altitude
    };
  }

  function getCameraSwathWidthMeters(settings) {
    const camera = getSurveyCamera(settings.cameraId);
    const focalLengthMm = normalizeCameraFocalLength(camera, settings.focalLengthMm);
    const altitude = Number(settings.surveyAltitude) || Number(settings.altitude) || 100;
    return computeGroundFootprintMeters(camera, focalLengthMm, altitude).widthMeters;
  }

  function applyAutoFootprintFromCamera(settings) {
    const camera = getSurveyCamera(settings.cameraId);
    const focalLengthMm = normalizeCameraFocalLength(camera, settings.focalLengthMm);

    settings.cameraId = camera.id;
    settings.focalLengthMm = focalLengthMm;
    settings.footprintWidthMeters = round(getCameraSwathWidthMeters(settings), 1);
    return settings;
  }

  const OVERLAP_PERCENT_MIN = 1;
  const OVERLAP_PERCENT_MAX = 99;
  const OVERLAP_FRACTION_MIN = 0.01;
  const OVERLAP_FRACTION_MAX = 0.99;

  function overlapFractionToPercent(fraction) {
    return Math.round(
      clamp(Number(fraction) || 0, OVERLAP_FRACTION_MIN, OVERLAP_FRACTION_MAX) * 100
    );
  }

  function formatOverlapPercentDisplay(fraction) {
    return String(overlapFractionToPercent(fraction));
  }

  function overlapPercentToFraction(percent) {
    const percentInt = Math.round(
      clamp(Number(percent), OVERLAP_PERCENT_MIN, OVERLAP_PERCENT_MAX)
    );
    return percentInt / 100;
  }

  function isValidOverlapPercentDraft(text) {
    if (text === "") {
      return true;
    }
    if (!/^\d{1,2}$/.test(text)) {
      return false;
    }
    return Number(text) <= OVERLAP_PERCENT_MAX;
  }

  function parseOverlapPercentInput(text) {
    const trimmed = String(text).trim();
    if (trimmed === "") {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function normalizeMissionSettings(raw) {
    const source = raw || {};
    const settings = Object.assign({}, DEFAULT_MISSION_SETTINGS, source);

    settings.altitude = formatMissionSettingValue(
      "altitude",
      Number(settings.altitude) || DEFAULT_MISSION_SETTINGS.altitude
    );
    settings.speed = formatMissionSettingValue(
      "speed",
      Number(settings.speed) || DEFAULT_MISSION_SETTINGS.speed
    );
    settings.turnAroundMeters = formatMissionSettingValue(
      "turnAroundMeters",
      Number(settings.turnAroundMeters) || DEFAULT_MISSION_SETTINGS.turnAroundMeters
    );
    settings.forwardOverlap = formatMissionSettingValue(
      "forwardOverlap",
      clamp(
        Number(
          source.forwardOverlap != null
            ? source.forwardOverlap
            : source.overlapRate != null
              ? source.overlapRate
              : settings.forwardOverlap
        ) || DEFAULT_MISSION_SETTINGS.forwardOverlap,
        OVERLAP_FRACTION_MIN,
        OVERLAP_FRACTION_MAX
      )
    );
    settings.sideOverlap = formatMissionSettingValue(
      "sideOverlap",
      clamp(
        Number(
          source.sideOverlap != null
            ? source.sideOverlap
            : source.overlapRate != null
              ? source.overlapRate
              : settings.sideOverlap
        ) || DEFAULT_MISSION_SETTINGS.sideOverlap,
        OVERLAP_FRACTION_MIN,
        OVERLAP_FRACTION_MAX
      )
    );

    if (source.surveyAltitude == null || source.surveyAltitude === "") {
      settings.surveyAltitude = settings.altitude;
    } else {
      settings.surveyAltitude = formatMissionSettingValue(
        "surveyAltitude",
        Number(settings.surveyAltitude) || settings.altitude
      );
    }

    settings.cameraId = getSurveyCamera(source.cameraId || settings.cameraId).id;
    settings.focalLengthMm = Number(settings.focalLengthMm) || DEFAULT_MISSION_SETTINGS.focalLengthMm;
    settings.surveyEntryCorner = normalizeSurveyEntryCorner(
      source.surveyEntryCorner || settings.surveyEntryCorner
    );

    applyAutoFootprintFromCamera(settings);

    return settings;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function formatMissionSettingValue(key, value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return value;
    }

    switch (key) {
      case "altitude":
      case "surveyAltitude":
      case "turnAroundMeters":
        return Math.round(numeric);
      case "speed":
      case "footprintWidthMeters":
        return round(numeric, 1);
      case "forwardOverlap":
      case "sideOverlap":
        return round(numeric, 2);
      default:
        return numeric;
    }
  }

  function createNumericSettingHandlers(handleSettingChange, key, options) {
    const integerOnly = Boolean(options && options.integer);

    return {
      onChange: function (event) {
        handleSettingChange(key, event.target.value, integerOnly);
      },
      onBlur: integerOnly
        ? undefined
        : function (event) {
            handleSettingChange(key, event.target.value, true);
          }
    };
  }

  function lngLatEquals(a, b, epsilon) {
    return Math.abs(a.lng - b.lng) <= epsilon && Math.abs(a.lat - b.lat) <= epsilon;
  }

  function computeLineSpacingMeters(overlapRate, footprintWidthMeters) {
    const safeOverlap = clamp(Number(overlapRate) || 0, OVERLAP_FRACTION_MIN, OVERLAP_FRACTION_MAX);
    const safeFootprint = Math.max(5, Number(footprintWidthMeters) || 60);
    return safeFootprint * (1 - safeOverlap);
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

    return intersections;
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

    const heading = Number.isFinite(settings.headingRadians)
      ? settings.headingRadians
      : getLongestEdgeHeading(localPolygon);
    const rotatedPolygon = localPolygon.map(function (point) {
      return rotatePoint(point, -heading);
    });

    const rowSpacing = Math.max(
      4,
      Number(settings.lineSpacingMeters) ||
        computeLineSpacingMeters(overlapRate, settings.footprintWidthMeters)
    );
    const turnAroundMeters = Math.max(0, Number(settings.turnAroundMeters) || 0);
    const entryConfig = resolveSurveyEntryConfig(settings.entryCorner || settings.surveyEntryCorner);
    const rows = buildSurveyRows(rotatedPolygon, rowSpacing);
    const orderedRows = entryConfig.reverseRows ? rows.slice().reverse() : rows;
    const path = [];

    orderedRows.forEach(function (segments, rowIndex) {
      const forward = entryConfig.firstRowForward
        ? rowIndex % 2 === 0
        : rowIndex % 2 !== 0;
      const orderedSegments = forward ? segments.slice() : segments.slice().reverse();

      orderedSegments.forEach(function (segment, segmentIndex) {
        const from = forward ? segment[0] : segment[1];
        const to = forward ? segment[1] : segment[0];
        const legStart =
          turnAroundMeters > 0
            ? { x: from.x - (forward ? turnAroundMeters : -turnAroundMeters), y: from.y }
            : from;
        const legEnd =
          turnAroundMeters > 0
            ? { x: to.x + (forward ? turnAroundMeters : -turnAroundMeters), y: to.y }
            : to;

        const orderedPoints =
          turnAroundMeters > 0 ? [legStart, from, to, legEnd] : [from, to];

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
            segment: segmentIndex,
            role: role
          });
        });
      });
    });

    return path;
  }

  function createEmptyFeatureCollection() {
    return {
      type: "FeatureCollection",
      features: []
    };
  }

  function createWaypointPointGeoJSON(waypoints) {
    return {
      type: "FeatureCollection",
      features: waypoints.map(function (point, index) {
        return {
          type: "Feature",
          properties: {
            label: "WP" + (index + 1),
            altitude: point.alt
          },
          geometry: {
            type: "Point",
            coordinates: [point.lng, point.lat]
          }
        };
      })
    };
  }

  function createWaypointLineGeoJSON(waypoints) {
    if (waypoints.length < 2) {
      return createEmptyFeatureCollection();
    }

    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: waypoints.map(function (point) {
              return [point.lng, point.lat];
            })
          }
        }
      ]
    };
  }

  function createSurveyPolygonGeoJSON(area) {
    if (area.length < 3) {
      return createEmptyFeatureCollection();
    }

    const ring = area.map(function (point) {
      return [point.lng, point.lat];
    });
    ring.push([area[0].lng, area[0].lat]);

    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [ring]
          }
        }
      ]
    };
  }

  function createSurveyVertexGeoJSON(area) {
    return {
      type: "FeatureCollection",
      features: area.map(function (point, index) {
        return {
          type: "Feature",
          properties: {
            label: "A" + (index + 1)
          },
          geometry: {
            type: "Point",
            coordinates: [point.lng, point.lat]
          }
        };
      })
    };
  }

  function createSurveyPathGeoJSON(path) {
    if (path.length < 2) {
      return createEmptyFeatureCollection();
    }

    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: path.map(function (point) {
              return [point.lng, point.lat];
            })
          }
        }
      ]
    };
  }

  function fitMissionBounds(map, waypoints, surveyArea, surveyPath) {
    if (!map || typeof map.fitBounds !== "function" || !window.L) {
      return;
    }

    const latLngs = []
      .concat(
        waypoints.map(function (point) {
          return [point.lat, point.lng];
        })
      )
      .concat(
        surveyArea.map(function (point) {
          return [point.lat, point.lng];
        })
      )
      .concat(
        surveyPath.map(function (point) {
          return [point.lat, point.lng];
        })
      );

    if (!latLngs.length) {
      return;
    }

    map.fitBounds(window.L.latLngBounds(latLngs), {
      padding: [40, 40],
      animate: false
    });
  }

  function addFlightPlanBaseLayers(map) {
    if (typeof window.addGcsMapBaseLayers === "function") {
      window.addGcsMapBaseLayers(map);
    }
  }

  function createWaypointMarkerIcon(waypointIndex, altitude) {
    const altText =
      typeof altitude === "number" && isFinite(altitude) ? Math.round(altitude) + " m" : "--";
    return window.L.divIcon({
      className: "fp-waypoint-marker",
      html:
        '<span class="fp-waypoint-marker-wrap" title="航点 ' +
        waypointIndex +
        " · " +
        altText +
        '">' +
        '<span class="fp-waypoint-marker-dot">' +
        waypointIndex +
        "</span>" +
        '<span class="fp-waypoint-marker-alt-tag">' +
        altText +
        "</span>" +
        "</span>",
      iconSize: [72, 28],
      iconAnchor: [14, 14]
    });
  }

  function createSurveyVertexMarkerIcon(vertexIndex) {
    return window.L.divIcon({
      className: "fp-survey-vertex-marker",
      html:
        '<span class="fp-survey-vertex-marker-dot" title="区域顶点 ' +
        vertexIndex +
        '">' +
        vertexIndex +
        "</span>",
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
  }

  function createSurveyRouteWaypointIcon(sequence, labelQuadrant) {
    return window.L.divIcon({
      className: "fp-survey-route-wp-marker",
      html:
        '<span class="fp-survey-route-wp">' +
        '<span class="fp-survey-route-wp-dot"></span>' +
        '<span class="fp-survey-route-wp-label fp-survey-route-wp-label--' +
        labelQuadrant +
        '">' +
        sequence +
        "</span>" +
        "</span>",
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
  }

  function createSurveyDirectionArrowIcon(bearingDegrees) {
    const iconRotation = round(bearingDegrees - 90, 1);
    return window.L.divIcon({
      className: "fp-survey-direction-arrow",
      html:
        '<span class="fp-survey-direction-arrow-glyph" style="transform:rotate(' +
        iconRotation +
        'deg)">›</span>',
      iconSize: [10, 10],
      iconAnchor: [5, 5]
    });
  }

  function syncLeafletMissionLayers(
    layers,
    waypoints,
    surveyArea,
    surveyPath,
    onWaypointMoved,
    onSurveyVertexMoved
  ) {
    if (!layers || !window.L) {
      return;
    }

    const mapForClose =
      layers.waypointGroup && layers.waypointGroup._map
        ? layers.waypointGroup._map
        : null;
    if (mapForClose && typeof mapForClose.closePopup === "function") {
      mapForClose.closePopup();
    }

    layers.waypointGroup.clearLayers();
    layers.surveyGroup.clearLayers();
    layers.pathGroup.clearLayers();

    waypoints.forEach(function (waypoint, index) {
      const waypointNumber = index + 1;
      const marker = window.L.marker([waypoint.lat, waypoint.lng], {
        icon: createWaypointMarkerIcon(waypointNumber, waypoint.alt),
        draggable: Boolean(onWaypointMoved)
      });

      marker.bindPopup(
        "<strong>航点 " +
          waypointNumber +
          "</strong><div style='margin-top:4px;font-size:11px;color:#9fb0c1'>" +
          round(waypoint.lng, 6).toFixed(6) +
          ", " +
          round(waypoint.lat, 6).toFixed(6) +
          (typeof waypoint.alt === "number" ? "<br>高度 " + waypoint.alt + " m" : "") +
          "</div>"
      );

      marker.on("click", window.L.DomEvent.stopPropagation);

      if (onWaypointMoved) {
        marker.on("dragstart", window.L.DomEvent.stopPropagation);
        marker.on("dragend", function () {
          const latLng = marker.getLatLng();
          onWaypointMoved(index, round(latLng.lng, 6), round(latLng.lat, 6));
        });
      }

      layers.waypointGroup.addLayer(marker);
    });

    if (waypoints.length >= 2) {
      window.L.polyline(
        waypoints.map(function (point) {
          return [point.lat, point.lng];
        }),
        { color: "#4fc3f7", weight: 3 }
      ).addTo(layers.waypointGroup);
    }

    surveyArea.forEach(function (point, index) {
      const vertexNumber = index + 1;
      const marker = window.L.marker([point.lat, point.lng], {
        icon: createSurveyVertexMarkerIcon(vertexNumber),
        draggable: Boolean(onSurveyVertexMoved)
      });
      marker.bindPopup(
        "<strong>区域顶点 " +
          vertexNumber +
          "</strong><div style='margin-top:4px;font-size:11px;color:#9fb0c1'>" +
          round(point.lng, 6).toFixed(6) +
          ", " +
          round(point.lat, 6).toFixed(6) +
          "</div>"
      );
      marker.on("click", window.L.DomEvent.stopPropagation);

      if (onSurveyVertexMoved) {
        marker.on("dragstart", window.L.DomEvent.stopPropagation);
        marker.on("dragend", function () {
          const latLng = marker.getLatLng();
          onSurveyVertexMoved(index, round(latLng.lng, 6), round(latLng.lat, 6));
        });
      }

      layers.surveyGroup.addLayer(marker);
    });

    if (surveyArea.length >= 2) {
      window.L.polyline(
        surveyArea.map(function (point) {
          return [point.lat, point.lng];
        }),
        { color: "#f0c24f", weight: 2.5 }
      ).addTo(layers.surveyGroup);
    }

    if (surveyArea.length >= 3) {
      window.L.polygon(
        surveyArea.map(function (point) {
          return [point.lat, point.lng];
        }),
        {
          color: "#f0c24f",
          weight: 2.5,
          fillColor: "#f0c24f",
          fillOpacity: 0.18
        }
      ).addTo(layers.surveyGroup);
    }

    if (surveyPath.length >= 2) {
      window.L.polyline(
        surveyPath.map(function (point) {
          return [point.lat, point.lng];
        }),
        {
          color: "#66d7a6",
          weight: 1.5,
          opacity: 0.95
        }
      ).addTo(layers.pathGroup);

      const transectGroups = {};
      surveyPath.forEach(function (point) {
        const key = point.row + ":" + point.segment;
        if (!transectGroups[key]) {
          transectGroups[key] = [];
        }
        transectGroups[key].push(point);
      });

      Object.keys(transectGroups).forEach(function (key) {
        const group = transectGroups[key];
        const lineStart = group.find(function (point) {
          return point.role === "line-start";
        });
        const lineEnd = group.find(function (point) {
          return point.role === "line-end";
        });

        if (!lineStart || !lineEnd) {
          return;
        }

        const bearing = computeBearingDegrees(lineStart, lineEnd);
        const alongSegment = pointOnSegment(lineStart, lineEnd, 0.42);
        const arrowPosition = offsetLatLngMeters(alongSegment, bearing, 0, 18);
        window.L.marker([arrowPosition.lat, arrowPosition.lng], {
          icon: createSurveyDirectionArrowIcon(bearing),
          interactive: false
        }).addTo(layers.pathGroup);
      });

      const routeWaypoints = layoutSurveyRouteWaypoints(
        extractSurveyRouteWaypoints(surveyPath),
        22
      );
      routeWaypoints.forEach(function (waypoint) {
        window.L.marker([waypoint.displayLat, waypoint.displayLng], {
          icon: createSurveyRouteWaypointIcon(waypoint.seq, waypoint.labelQuadrant),
          interactive: false,
          zIndexOffset: 400 + waypoint.seq
        })
          .bindPopup(
            "<strong>航点 " +
              waypoint.seq +
              "</strong><div style='margin-top:4px;font-size:11px;color:#9fb0c1'>" +
              round(waypoint.lng, 6).toFixed(6) +
              ", " +
              round(waypoint.lat, 6).toFixed(6) +
              "</div>"
          )
          .addTo(layers.pathGroup);
      });
    }
  }

  function formatCoordinate(point, altitude) {
    return (
      "Lng " +
      round(point.lng, 6).toFixed(6) +
      " / Lat " +
      round(point.lat, 6).toFixed(6) +
      (typeof altitude === "number" ? " / Alt " + altitude + " m" : "")
    );
  }


  function isFlightPlanViewActive() {
    const view = document.getElementById("view-flight-plan");
    return Boolean(view && view.classList.contains("active"));
  }

  function hasVisibleMapContainer(container) {
    if (!container) {
      return false;
    }
    const rect = container.getBoundingClientRect();
    return rect.width > 8 && rect.height > 8;
  }

  function FlightPlanEditor() {
    const ReactApi = window.React;
    const useCallback = ReactApi.useCallback;
    const useEffect = ReactApi.useEffect;
    const useMemo = ReactApi.useMemo;
    const useRef = ReactApi.useRef;
    const useState = ReactApi.useState;

    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const layersRef = useRef(null);
    const activeTabRef = useRef("waypoint");
    const settingsRef = useRef(normalizeMissionSettings());
    const surveyAltitudeCustomizedRef = useRef(false);
    const waypointCountRef = useRef(0);
    const surveyAreaCountRef = useRef(0);
    const latestWaypointsRef = useRef([]);
    const latestSurveyAreaRef = useRef([]);
    const latestSurveyPathRef = useRef([]);

    const [activeTab, setActiveTab] = useState("waypoint");
    const [settings, setSettings] = useState(normalizeMissionSettings());
    const [overlapEditKey, setOverlapEditKey] = useState(null);
    const [overlapEditText, setOverlapEditText] = useState("");
    const [waypoints, setWaypoints] = useState([]);
    const [surveyArea, setSurveyArea] = useState([]);
    const surveyPath = useMemo(function () {
      if (surveyArea.length < 3) {
        return [];
      }

      return generateSurveyPath(surveyArea, settings.sideOverlap, {
        footprintWidthMeters: settings.footprintWidthMeters,
        turnAroundMeters: settings.turnAroundMeters,
        entryCorner: settings.surveyEntryCorner
      }).map(function (point) {
        return {
          lng: point.lng,
          lat: point.lat,
          row: point.row,
          segment: point.segment,
          role: point.role
        };
      });
    }, [
      surveyArea,
      settings.sideOverlap,
      settings.footprintWidthMeters,
      settings.turnAroundMeters,
      settings.surveyEntryCorner
    ]);

    const surveyRouteWaypoints = useMemo(
      function () {
        return extractSurveyRouteWaypoints(surveyPath).map(function (point, index) {
          return {
            seq: index + 1,
            lat: point.lat,
            lng: point.lng,
            alt: settings.surveyAltitude
          };
        });
      },
      [surveyPath, settings.surveyAltitude]
    );

    const onWaypointMovedRef = useRef(null);
    const onSurveyVertexMovedRef = useRef(null);

    const handleWaypointMoved = useCallback(function (index, lng, lat) {
      setWaypoints(function (previous) {
        if (index < 0 || index >= previous.length) {
          return previous;
        }
        const next = previous.slice();
        next[index] = Object.assign({}, next[index], { lng: lng, lat: lat });
        return next;
      });
    }, []);

    const handleSurveyVertexMoved = useCallback(function (index, lng, lat) {
      setSurveyArea(function (previous) {
        if (index < 0 || index >= previous.length) {
          return previous;
        }
        const next = previous.slice();
        next[index] = { lng: lng, lat: lat };
        return next;
      });
    }, []);

    useEffect(function () {
      onWaypointMovedRef.current = handleWaypointMoved;
    }, [handleWaypointMoved]);

    useEffect(function () {
      onSurveyVertexMovedRef.current = handleSurveyVertexMoved;
    }, [handleSurveyVertexMoved]);

    const syncMapLayers = useCallback(function (nextWaypoints, nextSurveyArea, nextSurveyPath) {
      if (!mapRef.current || !layersRef.current) {
        return;
      }
      syncLeafletMissionLayers(
        layersRef.current,
        nextWaypoints,
        nextSurveyArea,
        nextSurveyPath,
        function (index, lng, lat) {
          if (onWaypointMovedRef.current) {
            onWaypointMovedRef.current(index, lng, lat);
          }
        },
        function (index, lng, lat) {
          if (onSurveyVertexMovedRef.current) {
            onSurveyVertexMovedRef.current(index, lng, lat);
          }
        }
      );
    }, []);

    useEffect(function () {
      activeTabRef.current = activeTab;
      settingsRef.current = settings;
      waypointCountRef.current = waypoints.length;
      surveyAreaCountRef.current = surveyArea.length;
    }, [activeTab, settings, waypoints.length, surveyArea.length]);

    useEffect(function () {
      latestWaypointsRef.current = waypoints;
      latestSurveyAreaRef.current = surveyArea;
      latestSurveyPathRef.current = surveyPath;
    }, [waypoints, surveyArea, surveyPath]);

    useEffect(function () {
      let disposed = false;
      let retryTimer = null;

      function destroyMap() {
        layersRef.current = null;
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
        window.flightPlanMap = null;
      }

      function tryCreateMap() {
        const container = mapContainerRef.current;

        if (disposed || mapRef.current || !window.L || !container) {
          return Boolean(mapRef.current);
        }

        if (!isFlightPlanViewActive() || !hasVisibleMapContainer(container)) {
          return false;
        }

        const center =
          typeof window.getMapCenterLatLng === "function"
            ? window.getMapCenterLatLng()
            : [window.DEFAULT_MAP_LAT || 29.59256, window.DEFAULT_MAP_LON || 106.22742];
        const map = window.L.map(container, { zoomControl: true }).setView(center, 13);

        addFlightPlanBaseLayers(map);

        layersRef.current = {
          pathGroup: window.L.layerGroup().addTo(map),
          surveyGroup: window.L.layerGroup().addTo(map),
          waypointGroup: window.L.layerGroup().addTo(map)
        };

        map.on("click", function (event) {
          const clicked = {
            lng: round(event.latlng.lng, 6),
            lat: round(event.latlng.lat, 6)
          };

          if (activeTabRef.current === "survey") {
            setSurveyArea(function (previous) {
              return previous.concat(clicked);
            });
          } else {
            setWaypoints(function (previous) {
              return previous.concat({
                lng: clicked.lng,
                lat: clicked.lat,
                alt: Number(settingsRef.current.altitude)
              });
            });
          }
        });

        mapRef.current = map;
        window.flightPlanMap = map;

        syncLeafletMissionLayers(
          layersRef.current,
          latestWaypointsRef.current,
          latestSurveyAreaRef.current,
          latestSurveyPathRef.current,
          function (index, lng, lat) {
            if (onWaypointMovedRef.current) {
              onWaypointMovedRef.current(index, lng, lat);
            }
          },
          function (index, lng, lat) {
            if (onSurveyVertexMovedRef.current) {
              onSurveyVertexMovedRef.current(index, lng, lat);
            }
          }
        );

        window.requestAnimationFrame(function () {
          if (!mapRef.current) {
            return;
          }
          mapRef.current.invalidateSize();
          fitMissionBounds(
            mapRef.current,
            latestWaypointsRef.current,
            latestSurveyAreaRef.current,
            latestSurveyPathRef.current
          );
        });

        return true;
      }


      function scheduleMapInit() {
        if (disposed) {
          return;
        }
        if (tryCreateMap()) {
          if (retryTimer) {
            window.clearTimeout(retryTimer);
            retryTimer = null;
          }
          return;
        }
        retryTimer = window.setTimeout(scheduleMapInit, 80);
      }

      function handleViewChanged(event) {
        if (!event || !event.detail || event.detail.name !== "flight-plan") {
          return;
        }

        window.requestAnimationFrame(function () {
          if (disposed) {
            return;
          }
          if (!mapRef.current) {
            scheduleMapInit();
            return;
          }
          mapRef.current.invalidateSize();
          fitMissionBounds(
            mapRef.current,
            latestWaypointsRef.current,
            latestSurveyAreaRef.current,
            latestSurveyPathRef.current
          );
        });
      }

      window.addEventListener("gcs:main-view-changed", handleViewChanged);
      scheduleMapInit();

      return function () {
        disposed = true;
        if (retryTimer) {
          window.clearTimeout(retryTimer);
        }
        window.removeEventListener("gcs:main-view-changed", handleViewChanged);
        destroyMap();
      };
    }, []);

    useEffect(function () {
      syncMapLayers(waypoints, surveyArea, surveyPath);
    }, [surveyArea, surveyPath, syncMapLayers, waypoints]);

    const handleSettingChange = useCallback(function (key, value, finalize, options) {
      options = options || {};

      setSettings(function (previous) {
        const next = Object.assign({}, previous);

        if (
          options.asPercent &&
          (key === "forwardOverlap" || key === "sideOverlap")
        ) {
          const percent = parseOverlapPercentInput(value);
          if (percent === null) {
            return previous;
          }
          if (!Number.isFinite(percent)) {
            return previous;
          }
          value = overlapPercentToFraction(
            clamp(percent, OVERLAP_PERCENT_MIN, OVERLAP_PERCENT_MAX)
          );
        }

        if (key === "forwardOverlap" || key === "sideOverlap") {
          const parsed = Number(value);
          if (finalize) {
            next[key] = formatMissionSettingValue(
              key,
              clamp(
                Number.isFinite(parsed) ? parsed : previous[key],
                OVERLAP_FRACTION_MIN,
                OVERLAP_FRACTION_MAX
              )
            );
          } else if (!Number.isFinite(parsed)) {
            return previous;
          } else {
            next[key] = parsed;
          }
        } else if (key === "surveyEntryCorner") {
          next[key] = normalizeSurveyEntryCorner(value);
        } else {
          next[key] = Number(value);
          if (finalize) {
            next[key] = formatMissionSettingValue(key, next[key]);
          }
        }

        if (key === "surveyAltitude") {
          surveyAltitudeCustomizedRef.current = true;
        }

        if (key === "altitude" && !surveyAltitudeCustomizedRef.current) {
          next.surveyAltitude = formatMissionSettingValue("surveyAltitude", next.altitude);
        }

        if (
          key === "surveyAltitude" ||
          key === "altitude" ||
          key === "sideOverlap"
        ) {
          applyAutoFootprintFromCamera(next);
        }

        return next;
      });
    }, []);

    const handleCameraSelect = useCallback(function (cameraId) {
      setSettings(function (previous) {
        const camera = getSurveyCamera(cameraId);
        const nextFocal = cameraHasInterchangeableLens(camera)
          ? normalizeCameraFocalLength(camera, previous.focalLengthMm)
          : camera.focalLengthsMm[0];
        const next = Object.assign({}, previous, {
          cameraId: camera.id,
          focalLengthMm: nextFocal
        });
        applyAutoFootprintFromCamera(next);
        return next;
      });
    }, []);

    const handleFocalLengthSelect = useCallback(function (focalLengthMm) {
      setSettings(function (previous) {
        const camera = getSurveyCamera(previous.cameraId);
        const next = Object.assign({}, previous, {
          focalLengthMm: normalizeCameraFocalLength(camera, focalLengthMm)
        });
        applyAutoFootprintFromCamera(next);
        return next;
      });
    }, []);

    const handleFocalLengthInput = useCallback(function (focalLengthMm) {
      handleFocalLengthSelect(focalLengthMm);
    }, [handleFocalLengthSelect]);

    const handleClearWaypoints = useCallback(function () {
      setWaypoints([]);
    }, []);

    const handleClearSurvey = useCallback(function () {
      setSurveyArea([]);
    }, []);

    const handleFitMission = useCallback(function () {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
        fitMissionBounds(mapRef.current, waypoints, surveyArea, surveyPath);
      }
    }, [waypoints, surveyArea, surveyPath]);

    const lineSpacing = round(
      computeLineSpacingMeters(settings.sideOverlap, settings.footprintWidthMeters),
      2
    );

    const e = window.React.createElement;

    const adjustOverlapPercent = useCallback(
      function (key, delta) {
        const base =
          overlapEditKey === key && overlapEditText !== ""
            ? Number(overlapEditText)
            : overlapFractionToPercent(settings[key]);
        const nextPercent = clamp(
          Math.round(Number.isFinite(base) ? base : overlapFractionToPercent(settings[key])) +
            delta,
          OVERLAP_PERCENT_MIN,
          OVERLAP_PERCENT_MAX
        );
        handleSettingChange(key, String(nextPercent), true, { asPercent: true });
        setOverlapEditKey(null);
        setOverlapEditText("");
      },
      [handleSettingChange, overlapEditKey, overlapEditText, settings]
    );

    function renderOverlapPercentField(key, id, label) {
      const displayValue =
        overlapEditKey === key ? overlapEditText : formatOverlapPercentDisplay(settings[key]);

      return e(
        "div",
        { className: "fp-field fp-field-overlap-percent" },
        e("label", { htmlFor: id }, label),
        e(
          "div",
          { className: "fp-percent-stepper" },
          e("input", {
            id: id,
            className: "fp-percent-stepper-input",
            type: "text",
            inputMode: "numeric",
            autoComplete: "off",
            value: displayValue,
            onFocus: function () {
              setOverlapEditKey(key);
              setOverlapEditText(formatOverlapPercentDisplay(settings[key]));
            },
            onChange: function (event) {
              const text = event.target.value;
              if (!isValidOverlapPercentDraft(text)) {
                return;
              }
              setOverlapEditKey(key);
              setOverlapEditText(text);
              if (text !== "") {
                const percent = Number(text);
                if (percent >= OVERLAP_PERCENT_MIN && percent <= OVERLAP_PERCENT_MAX) {
                  handleSettingChange(key, text, true, { asPercent: true });
                }
              }
            },
            onBlur: function () {
              if (overlapEditKey !== key) {
                return;
              }
              if (overlapEditText === "") {
                setOverlapEditKey(null);
                setOverlapEditText("");
                return;
              }
              const percent = parseOverlapPercentInput(overlapEditText);
              if (
                !Number.isFinite(percent) ||
                percent < OVERLAP_PERCENT_MIN ||
                percent > OVERLAP_PERCENT_MAX
              ) {
                setOverlapEditKey(null);
                setOverlapEditText("");
                return;
              }
              handleSettingChange(key, String(Math.round(percent)), true, { asPercent: true });
              setOverlapEditKey(null);
              setOverlapEditText("");
            }
          }),
          e(
            "div",
            { className: "fp-percent-stepper-controls" },
            e(
              "button",
              {
                type: "button",
                className: "fp-percent-stepper-btn",
                "aria-label": label + " 增加 1%",
                tabIndex: -1,
                onMouseDown: function (event) {
                  event.preventDefault();
                },
                onClick: function () {
                  adjustOverlapPercent(key, 1);
                }
              },
              "+"
            ),
            e(
              "button",
              {
                type: "button",
                className: "fp-percent-stepper-btn",
                "aria-label": label + " 减少 1%",
                tabIndex: -1,
                onMouseDown: function (event) {
                  event.preventDefault();
                },
                onClick: function () {
                  adjustOverlapPercent(key, -1);
                }
              },
              "−"
            )
          )
        )
      );
    }

    function renderWaypointTab() {
      return e(
        window.React.Fragment,
        null,
        e(
          "section",
          { className: "fp-card" },
          e("h3", { className: "fp-card-title" }, "航点任务"),
          e(
            "p",
            { className: "fp-card-note" },
            "在地图上单击即可追加航点，左侧列表会同步显示坐标。"
          ),
          e(
            "div",
            { className: "fp-button-row" },
            e(
              "button",
              {
                type: "button",
                className: "fp-btn primary",
                onClick: handleFitMission
              },
              "缩放到任务范围"
            ),
            e(
              "button",
              {
                type: "button",
                className: "fp-btn",
                onClick: handleClearWaypoints
              },
              "清空航点"
            )
          )
        ),
        e(
          "section",
          { className: "fp-card" },
          e("h3", { className: "fp-card-title" }, "航点列表"),
          waypoints.length
            ? e(
                "ul",
                { className: "fp-waypoint-list" },
                waypoints.map(function (waypoint, index) {
                  return e(
                    "li",
                    { key: "wp-" + index, className: "fp-waypoint-item" },
                    e("strong", null, "WP" + (index + 1)),
                    e("div", { className: "fp-waypoint-meta" }, formatCoordinate(waypoint, waypoint.alt))
                  );
                })
              )
            : e("div", { className: "fp-empty" }, "暂无航点，直接在地图上点击即可开始规划。")
        )
      );
    }

    function renderSurveyTab() {
      return e(
        window.React.Fragment,
        null,
        e(
          "section",
          { className: "fp-card" },
          e(
            "div",
            { className: "fp-inline-stats" },
            e(
              "div",
              { className: "fp-stat" },
              e("div", { className: "fp-stat-label" }, "区域顶点"),
              e("div", { className: "fp-stat-value" }, String(surveyArea.length))
            ),
            e(
              "div",
              { className: "fp-stat" },
              e("div", { className: "fp-stat-label" }, "测线间距"),
              e("div", { className: "fp-stat-value" }, lineSpacing + "m")
            ),
            e(
              "div",
              { className: "fp-stat" },
              e("div", { className: "fp-stat-label" }, "航点数"),
              e("div", { className: "fp-stat-value" }, String(surveyRouteWaypoints.length))
            )
          ),
          e(
            "div",
            { className: "fp-field", style: { marginTop: "12px" } },
            e("label", { htmlFor: "fp-survey-entry" }, "起始方向"),
            e(
              "select",
              {
                id: "fp-survey-entry",
                value: settings.surveyEntryCorner,
                onChange: function (event) {
                  handleSettingChange("surveyEntryCorner", event.target.value, true);
                }
              },
              SURVEY_ENTRY_CORNER_OPTIONS.map(function (option) {
                return e("option", { key: option.id, value: option.id }, option.label);
              })
            )
          ),
          e(
            "div",
            { className: "fp-button-row", style: { marginTop: "12px" } },
            e(
              "button",
              {
                type: "button",
                className: "fp-btn accent",
                onClick: handleFitMission
              },
              "预览航测区域"
            ),
            e(
              "button",
              {
                type: "button",
                className: "fp-btn",
                disabled: !surveyArea.length,
                onClick: handleClearSurvey
              },
              "清空区域"
            )
          )
        ),
        e(
          "section",
          { className: "fp-card" },
          e("h3", { className: "fp-card-title" }, "航点预览"),
          surveyRouteWaypoints.length
            ? e(
                "div",
                { className: "fp-survey-wp-table-wrap" },
                e(
                  "table",
                  { className: "fp-survey-wp-table" },
                  e(
                    "thead",
                    null,
                    e(
                      "tr",
                      null,
                      e("th", { scope: "col" }, "航点"),
                      e("th", { scope: "col" }, "经度"),
                      e("th", { scope: "col" }, "纬度"),
                      e("th", { scope: "col" }, "高度")
                    )
                  ),
                  e(
                    "tbody",
                    null,
                    surveyRouteWaypoints.map(function (waypoint) {
                      return e(
                        "tr",
                        { key: "srwp-" + waypoint.seq },
                        e("th", { scope: "row" }, "航点 " + waypoint.seq),
                        e("td", { className: "fp-survey-wp-num" }, round(waypoint.lng, 6).toFixed(6)),
                        e("td", { className: "fp-survey-wp-num" }, round(waypoint.lat, 6).toFixed(6)),
                        e(
                          "td",
                          { className: "fp-survey-wp-num" },
                          String(Math.round(Number(waypoint.alt) || 0))
                        )
                      );
                    })
                  )
                )
              )
            : e(
                "div",
                { className: "fp-empty" },
                "至少需要 3 个区域顶点才能生成航点。"
              )
        )
      );
    }

    function renderCameraSettingsCard() {
      const activeCamera = getSurveyCamera(settings.cameraId);
      const interchangeable = cameraHasInterchangeableLens(activeCamera);
      const brandGroups = getCameraBrandGroups();
      const groundFootprint = computeGroundFootprintMeters(
        activeCamera,
        settings.focalLengthMm,
        settings.surveyAltitude
      );
      const cameraSwathWidth = round(getCameraSwathWidthMeters(settings), 1);
      const surveyLineSpacing = round(
        computeLineSpacingMeters(settings.sideOverlap, settings.footprintWidthMeters),
        1
      );

      return e(
        "section",
        { className: "fp-card" },
        e("h3", { className: "fp-card-title" }, "相机设置"),
        e(
          "div",
          { className: "fp-grid-2" },
          e(
            "div",
            { className: "fp-field" },
            e("label", { htmlFor: "fp-camera" }, "相机型号"),
            e(
              "select",
              {
                id: "fp-camera",
                value: settings.cameraId,
                onChange: function (event) {
                  handleCameraSelect(event.target.value);
                }
              },
              brandGroups.map(function (group) {
                return e(
                  "optgroup",
                  { key: group.brand, label: group.brand },
                  group.cameras.map(function (camera) {
                    return e("option", { key: camera.id, value: camera.id }, camera.name);
                  })
                );
              })
            )
          ),
          e(
            "div",
            { className: "fp-field" },
            e("label", { htmlFor: "fp-focal-length" }, "镜头焦距 (mm)"),
            interchangeable
              ? e("input", {
                  id: "fp-focal-length",
                  type: "number",
                  min: String(activeCamera.focalLengthMinMm || 8),
                  max: String(activeCamera.focalLengthMaxMm || 500),
                  step: "0.1",
                  value: settings.focalLengthMm,
                  onChange: function (event) {
                    handleFocalLengthInput(event.target.value);
                  }
                })
              : e("input", {
                  id: "fp-focal-length",
                  type: "number",
                  readOnly: true,
                  value: settings.focalLengthMm
                })
          )
        ),
        e(
          "div",
          { className: "fp-inline-stats fp-camera-specs" },
          e(
            "div",
            { className: "fp-stat" },
            e("div", { className: "fp-stat-label" }, "CMOS 宽 × 高"),
            e(
              "div",
              { className: "fp-stat-value fp-stat-value-sm" },
              activeCamera.sensorWidthMm + " × " + activeCamera.sensorHeightMm + " mm"
            )
          ),
          e(
            "div",
            { className: "fp-stat" },
            e("div", { className: "fp-stat-label" }, "CMOS 分辨率"),
            e(
              "div",
              { className: "fp-stat-value fp-stat-value-sm" },
              activeCamera.resolutionW + " × " + activeCamera.resolutionH
            )
          ),
          e(
            "div",
            { className: "fp-stat" },
            e("div", { className: "fp-stat-label" }, "地面幅宽 × 幅高"),
            e(
              "div",
              { className: "fp-stat-value fp-stat-value-sm" },
              round(groundFootprint.widthMeters, 1) +
                " × " +
                round(groundFootprint.heightMeters, 1) +
                " m"
            )
          ),
          e(
            "div",
            { className: "fp-stat" },
            e("div", { className: "fp-stat-label" }, "理论单航带幅宽"),
            e(
              "div",
              { className: "fp-stat-value fp-stat-value-sm" },
              cameraSwathWidth + " m"
            )
          ),
          e(
            "div",
            { className: "fp-stat" },
            e("div", { className: "fp-stat-label" }, "测线间距"),
            e(
              "div",
              { className: "fp-stat-value fp-stat-value-sm" },
              surveyLineSpacing + " m"
            )
          )
        )
      );
    }

    function renderSettingsTab() {
      return e(
        window.React.Fragment,
        null,
        renderCameraSettingsCard(),
        e(
          "section",
          { className: "fp-card" },
          e("h3", { className: "fp-card-title" }, "航线设置"),
          e(
            "p",
            { className: "fp-card-note" },
            "航测高度默认跟随默认航点高度；单独修改航测高度后不再自动联动。"
          ),
          e(
            "div",
            { className: "fp-grid-3" },
            e(
              "div",
              { className: "fp-field" },
              e("label", { htmlFor: "fp-altitude" }, "默认航点高度"),
              e(
                "input",
                Object.assign(
                  {
                    id: "fp-altitude",
                    type: "number",
                    step: "1",
                    value: settings.altitude
                  },
                  createNumericSettingHandlers(handleSettingChange, "altitude", { integer: true })
                )
              )
            ),
            e(
              "div",
              { className: "fp-field" },
              e("label", { htmlFor: "fp-speed" }, "巡航速度 m/s"),
              e(
                "input",
                Object.assign(
                  {
                    id: "fp-speed",
                    type: "number",
                    step: "0.1",
                    value: settings.speed
                  },
                  createNumericSettingHandlers(handleSettingChange, "speed")
                )
              )
            ),
            e(
              "div",
              { className: "fp-field" },
              e("label", { htmlFor: "fp-survey-altitude" }, "航测高度"),
              e(
                "input",
                Object.assign(
                  {
                    id: "fp-survey-altitude",
                    type: "number",
                    step: "1",
                    value: settings.surveyAltitude
                  },
                  createNumericSettingHandlers(handleSettingChange, "surveyAltitude", {
                    integer: true
                  })
                )
              )
            ),
            renderOverlapPercentField("forwardOverlap", "fp-forward-overlap", "航向重叠率 (%)"),
            renderOverlapPercentField("sideOverlap", "fp-side-overlap", "旁向重叠率 (%)"),
            e(
              "div",
              { className: "fp-field" },
              e("label", { htmlFor: "fp-turn-around" }, "过冲延伸距离"),
              e(
                "input",
                Object.assign(
                  {
                    id: "fp-turn-around",
                    type: "number",
                    min: "0",
                    step: "1",
                    value: settings.turnAroundMeters
                  },
                  createNumericSettingHandlers(handleSettingChange, "turnAroundMeters", {
                    integer: true
                  })
                )
              )
            )
          )
        )
      );
    }

    return e(
      "div",
      { className: "fp-shell" },
      e(
        "aside",
        { className: "fp-sidebar" },
        e(
          "div",
          { className: "fp-sidebar-header" },
          e("h2", { className: "fp-sidebar-title" }, "飞行计划编辑器")
        ),
        e(
          "div",
          { className: "fp-tabbar" },
          e(
            "button",
            {
              type: "button",
              className: "fp-tab" + (activeTab === "waypoint" ? " active" : ""),
              onClick: function () {
                setActiveTab("waypoint");
              }
            },
            "添加航点"
          ),
          e(
            "button",
            {
              type: "button",
              className: "fp-tab" + (activeTab === "survey" ? " active" : ""),
              onClick: function () {
                setActiveTab("survey");
              }
            },
            "添加航测区域"
          ),
          e(
            "button",
            {
              type: "button",
              className: "fp-tab" + (activeTab === "settings" ? " active" : ""),
              onClick: function () {
                setActiveTab("settings");
              }
            },
            "航线设置"
          )
        ),
        e(
          "div",
          { className: "fp-sidebar-scroll" },
          activeTab === "waypoint"
            ? renderWaypointTab()
            : activeTab === "survey"
              ? renderSurveyTab()
              : renderSettingsTab()
        )
      ),
      e(
        "section",
        { className: "fp-map-panel" },
        e(
          "div",
          { className: "fp-map-toolbar" },
          e(
            "div",
            { className: "fp-map-toolbar-left" },
            e(
              "span",
              { className: "fp-chip" },
              e("strong", null, activeTab === "survey" ? "Survey Mode" : "Waypoint Mode")
            ),
            e(
              "span",
              { className: "fp-chip" },
              "航点 ",
              e("strong", null, String(waypoints.length))
            ),
            e(
              "span",
              { className: "fp-chip" },
              "区域顶点 ",
              e("strong", null, String(surveyArea.length))
            ),
            e(
              "span",
              { className: "fp-chip" },
              "测线间距 ",
              e("strong", null, lineSpacing + " m")
            ),
            activeTab === "survey"
              ? e(
                  "span",
                  { className: "fp-chip" },
                  "过冲 ",
                  e("strong", null, String(settings.turnAroundMeters) + " m")
                )
              : null
          ),
          e(
            "div",
            { className: "fp-map-toolbar-right" },
            e(
              "span",
              { className: "fp-chip fp-token-note" },
              window.L
                ? "Leaflet 地图已加载（Esri 卫星 + 高德标注）"
                : "Leaflet 未加载，请检查网络"
            )
          )
        ),
        e(
          "div",
          { className: "fp-map-stage" },
          e("div", { ref: mapContainerRef, className: "fp-map-canvas" }),
          e(
            "div",
            { className: "fp-map-overlay" },
            e("h4", null, "交互提示"),
            e(
              "p",
              null,
              activeTab === "survey"
                ? "继续点击地图添加多边形顶点，达到 3 个点后会自动生成 S 形航测路径。"
                : "点击地图新增航点，左侧航点列表会同步更新。"
            )
          )
        )
      )
    );
  }

  function mountFlightPlanEditor() {
    if (!window.React || !window.ReactDOM || !window.ReactDOM.createRoot) {
      window.setTimeout(mountFlightPlanEditor, 50);
      return;
    }

    const host = document.getElementById("flight-plan-app");
    if (!host || host.dataset.mounted === "true") {
      return;
    }

    host.dataset.mounted = "true";
    const root = window.ReactDOM.createRoot(host);
    root.render(window.React.createElement(FlightPlanEditor));
  }

  window.generateSurveyPath = generateSurveyPath;
  window.computeSurveyLineSpacingMeters = computeLineSpacingMeters;
  window.mountFlightPlanEditor = mountFlightPlanEditor;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountFlightPlanEditor);
  } else {
    mountFlightPlanEditor();
  }
})();
