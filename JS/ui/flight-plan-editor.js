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
    surveyEntryCorner: "top-left",
    surveyHeadingDeg: null,
    surveyHeadingAuto: true,
    useTerrainFollowing: false,
    terrainAgMarginM: 30,
    terrainAutoPartition: true,
    terrainMaxReliefM: 120,
    terrainMaxClimbRateMps: 3,
    terrainCruiseSpeedMps: 20,
    terrainPrefetchOnDraw: true
  };

  const TURN_AROUND_DEFAULT_MULTIROTOR_M = 20;
  const TURN_AROUND_DEFAULT_FIXED_WING_M = 100;

  function getDefaultTurnAroundMeters(platform) {
    const FWP = window.FixedWingParams;
    if (FWP && FWP.isFixedWingPlatform(platform)) {
      return TURN_AROUND_DEFAULT_FIXED_WING_M;
    }
    return TURN_AROUND_DEFAULT_MULTIROTOR_M;
  }

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
    const altitude = Number(settings.surveyAltitude) || Number(settings.altitude) || 100;
    const footprint = computeGroundFootprintMeters(camera, focalLengthMm, altitude);

    settings.cameraId = camera.id;
    settings.focalLengthMm = focalLengthMm;
    settings.footprintWidthMeters = round(footprint.widthMeters, 1);
    settings.footprintHeightMeters = round(footprint.heightMeters, 1);
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
    settings.surveyHeadingAuto =
      source.surveyHeadingAuto == null ? true : Boolean(source.surveyHeadingAuto);
    if (source.surveyHeadingDeg == null || source.surveyHeadingDeg === "") {
      settings.surveyHeadingDeg = null;
    } else {
      const hd = Number(source.surveyHeadingDeg);
      settings.surveyHeadingDeg = Number.isFinite(hd) ? Math.round(hd) % 360 : null;
    }

    settings.useTerrainFollowing = Boolean(source.useTerrainFollowing);
    settings.terrainAgMarginM =
      Number(source.terrainAgMarginM) || DEFAULT_MISSION_SETTINGS.terrainAgMarginM;
    settings.terrainAutoPartition =
      source.terrainAutoPartition == null
        ? DEFAULT_MISSION_SETTINGS.terrainAutoPartition
        : Boolean(source.terrainAutoPartition);
    settings.terrainMaxReliefM =
      Number(source.terrainMaxReliefM) || DEFAULT_MISSION_SETTINGS.terrainMaxReliefM;
    settings.terrainMaxClimbRateMps =
      Number(source.terrainMaxClimbRateMps) || DEFAULT_MISSION_SETTINGS.terrainMaxClimbRateMps;
    settings.terrainCruiseSpeedMps =
      Number(source.terrainCruiseSpeedMps || source.speed) ||
      DEFAULT_MISSION_SETTINGS.terrainCruiseSpeedMps;
    settings.terrainPrefetchOnDraw =
      source.terrainPrefetchOnDraw == null
        ? DEFAULT_MISSION_SETTINGS.terrainPrefetchOnDraw
        : Boolean(source.terrainPrefetchOnDraw);

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

  const WAYPOINT_LABEL_QUADRANTS = ["ne", "nw", "se", "sw"];

  function getVehicleHeadingDegrees() {
    const yaw = Number(window.yaw);
    if (!Number.isFinite(yaw)) {
      return 0;
    }
    let deg = (yaw * 180) / Math.PI;
    deg = ((deg % 360) + 360) % 360;
    return deg;
  }

  function normalizeFlightPlanPlatform(platform) {
    const VMI = window.VehicleMarkerIcons;
    if (VMI && typeof VMI.normalizeVehicleMarkerKind === "function") {
      return VMI.normalizeVehicleMarkerKind(platform);
    }
    return "multirotor-x";
  }

  function createHomeMarkerIcon(homeSource) {
    const live = homeSource === "vehicle";
    return window.L.divIcon({
      className: "fp-home-marker" + (live ? " fp-home-marker--live" : ""),
      html:
        '<span class="fp-home-marker-wrap" title="Home">' +
        '<span class="fp-home-marker-badge">H</span>' +
        '<span class="fp-home-marker-label">Home</span>' +
        "</span>",
      iconSize: [56, 28],
      iconAnchor: [14, 14]
    });
  }

  function vehicleMarkerSvg(platform) {
    const kind = normalizeFlightPlanPlatform(platform);
    const VMI = window.VehicleMarkerIcons;
    if (VMI && typeof VMI.vehicleMarkerSvg === "function") {
      return VMI.vehicleMarkerSvg(kind);
    }
    return "";
  }

  function createVehicleMapIcon(platform, headingDeg) {
    const kind = normalizeFlightPlanPlatform(platform);
    const rotation = Number.isFinite(headingDeg) ? headingDeg : 0;
    return window.L.divIcon({
      className: "fp-vehicle-marker fp-vehicle-marker--" + kind,
      html:
        '<span class="fp-vehicle-marker-wrap" title="飞机位置">' +
        '<span class="fp-vehicle-marker-rot" style="transform:rotate(' +
        rotation.toFixed(1) +
        'deg)">' +
        vehicleMarkerSvg(platform) +
        "</span>" +
        "</span>",
      iconSize: [80, 80],
      iconAnchor: [40, 40]
    });
  }

  function syncFlightPlanMapOverlays(layers, platform) {
    if (!layers || !window.L) {
      return;
    }

    const MM = window.MissionModel;
    const homeGroup = layers.homeGroup;
    const vehicleGroup = layers.vehicleGroup;
    if (!homeGroup || !vehicleGroup) {
      return;
    }

    homeGroup.clearLayers();
    vehicleGroup.clearLayers();

    const home =
      MM && MM.getFlightPlanHomeLatLng
        ? MM.getFlightPlanHomeLatLng()
        : {
            lat: window.DEFAULT_MAP_LAT || 29.59256,
            lng: window.DEFAULT_MAP_LON || 106.22742,
            alt: 30,
            source: "default"
          };

    const homeMarker = window.L.marker([home.lat, home.lng], {
      icon: createHomeMarkerIcon(home.source),
      interactive: false,
      zIndexOffset: 600
    });
    homeMarker.bindPopup(
      "<strong>Home</strong><br>" +
        round(home.lng, 6).toFixed(6) +
        ", " +
        round(home.lat, 6).toFixed(6) +
        (home.source === "vehicle" ? "<br>飞控当前位置" : "<br>地图默认中心")
    );
    homeGroup.addLayer(homeMarker);

    const hasVehicle =
      MM && MM.hasFlightPlanVehiclePosition
        ? MM.hasFlightPlanVehiclePosition()
        : false;
    if (hasVehicle) {
      const heading = getVehicleHeadingDegrees();
      const vehicleMarker = window.L.marker([window.lat, window.lon], {
        icon: createVehicleMapIcon(platform, heading),
        interactive: false,
        zIndexOffset: 900
      });
      const altText =
        typeof window.altitude === "number" && isFinite(window.altitude)
          ? window.altitude.toFixed(1) + " m"
          : "--";
      vehicleMarker.bindPopup(
        "<strong>飞机</strong><br>" +
          round(window.lon, 6).toFixed(6) +
          ", " +
          round(window.lat, 6).toFixed(6) +
          "<br>高度 " +
          altText
      );
      vehicleGroup.addLayer(vehicleMarker);
    }
  }

  function buildHomePreviewTableRow() {
    const MM = window.MissionModel;
    const home =
      MM && MM.getFlightPlanHomeLatLng
        ? MM.getFlightPlanHomeLatLng()
        : {
            lat: window.DEFAULT_MAP_LAT || 29.59256,
            lng: window.DEFAULT_MAP_LON || 106.22742,
            alt: 30,
            source: "default"
          };
    return {
      key: "home-0",
      seq: 0,
      label: "Home",
      lng: home.lng,
      lat: home.lat,
      alt: home.alt,
      preview: false,
      isSurvey: false,
      isHome: true,
      missionIndex: -1,
      canDelete: false
    };
  }

  function createWaypointMarkerIcon(waypointIndex, altitude, roleLabel, labelQuadrant) {
    const altText =
      typeof altitude === "number" && isFinite(altitude) ? Math.round(altitude) + " m" : "--";
    const title = roleLabel
      ? roleLabel + " · " + altText
      : "航点 " + waypointIndex + " · " + altText;
    const quad = labelQuadrant || "ne";
    const roleHtml = roleLabel
      ? '<span class="fp-waypoint-marker-role-label fp-waypoint-marker-role-label--' +
        quad +
        '">' +
        roleLabel +
        "</span>"
      : "";
    return window.L.divIcon({
      className: "fp-waypoint-marker",
      html:
        '<span class="fp-waypoint-marker-wrap" title="' +
        title +
        '">' +
        '<span class="fp-waypoint-marker-body">' +
        '<span class="fp-waypoint-marker-dot">' +
        waypointIndex +
        "</span>" +
        roleHtml +
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
    const iconRotation = round(bearingDegrees, 1);
    return window.L.divIcon({
      className: "fp-survey-direction-arrow",
      html:
        '<span class="fp-survey-direction-arrow-glyph" style="transform:rotate(' +
        iconRotation +
        'deg)">' +
        '<svg class="fp-survey-direction-arrow-svg" viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M12 5 L18 17 L12 14 L6 17 Z" />' +
        "</svg></span>",
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
  }

  function createSurveyWaypointMarkerIcon(waypointNumber, altitude) {
    const altText =
      typeof altitude === "number" && isFinite(altitude) ? Math.round(altitude) + " m" : "--";
    return window.L.divIcon({
      className: "fp-survey-waypoint-marker",
      html:
        '<span class="fp-survey-waypoint-marker-wrap" title="航点 ' +
        waypointNumber +
        " · " +
        altText +
        '">' +
        '<span class="fp-survey-waypoint-marker-body">' +
        '<span class="fp-survey-waypoint-marker-dot">' +
        waypointNumber +
        "</span>" +
        "</span>" +
        '<span class="fp-survey-waypoint-marker-alt-tag">' +
        altText +
        "</span>" +
        "</span>",
      iconSize: [72, 28],
      iconAnchor: [14, 14]
    });
  }

  function groupSurveyPathTransects(surveyPath) {
    const groups = {};
    (surveyPath || []).forEach(function (point) {
      const key = point.row != null ? String(point.row) : "0";
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(point);
    });
    return Object.keys(groups).map(function (key) {
      return groups[key];
    });
  }

  function addSurveyHeadingArrow(layerGroup, from, to, options) {
    if (!from || !to || !layerGroup) {
      return;
    }
    const opts = options || {};
    const bearing = computeBearingDegrees(from, to);
    const anchorFrom = opts.anchorFrom || from;
    const anchorTo = opts.anchorTo || to;
    let arrowPosition = pointOnSegment(
      anchorFrom,
      anchorTo,
      opts.alongRatio != null ? opts.alongRatio : 0.5
    );
    const lateral = Number(opts.lateralOffsetMeters) || 0;
    if (lateral) {
      arrowPosition = offsetLatLngMeters(arrowPosition, bearing, 0, lateral);
    }
    window.L.marker([arrowPosition.lat, arrowPosition.lng], {
      icon: createSurveyDirectionArrowIcon(bearing),
      interactive: false,
      zIndexOffset: 600
    }).addTo(layerGroup);
  }

  function isSurveyPhotoLegSegment(a, b) {
    return (
      a.source === "survey" &&
      b.source === "survey" &&
      a.pathRole === "line-start" &&
      b.pathRole === "line-end"
    );
  }

  function isSurveyPhotoLegInteriorWaypoint(wp) {
    return (
      wp.source === "survey" &&
      !wp.pathRole &&
      wp.segmentRole === "transect"
    );
  }

  function shouldSkipSurveyMapSegment(a, b) {
    if (isSurveyPhotoLegSegment(a, b)) {
      return true;
    }
    if (a.pathRole === "line-start" && isSurveyPhotoLegInteriorWaypoint(b)) {
      return true;
    }
    if (isSurveyPhotoLegInteriorWaypoint(a) && b.pathRole === "line-end") {
      return true;
    }
    if (isSurveyPhotoLegInteriorWaypoint(a) && isSurveyPhotoLegInteriorWaypoint(b)) {
      return true;
    }
    return false;
  }

  function isSurveyConnectorSegment(a, b) {
    if (a.source !== "survey" || b.source !== "survey") {
      return false;
    }
    if (shouldSkipSurveyMapSegment(a, b)) {
      return false;
    }
    const overshootRoles = {
      "overshoot-entry": true,
      "overshoot-exit": true
    };
    if (overshootRoles[a.pathRole] || overshootRoles[b.pathRole]) {
      return true;
    }
    if (a.segmentRole === "turn" || b.segmentRole === "turn") {
      return true;
    }
    if (a.segmentRole === "connector" || b.segmentRole === "connector") {
      return true;
    }
    if (a.label === "转弯" || b.label === "转弯") {
      return true;
    }
    return false;
  }

  function forEachSurveyPhotoLegFromMission(waypoints, callback) {
    (waypoints || []).forEach(function (wp, index) {
      if (wp.source !== "survey" || wp.pathRole !== "line-start") {
        return;
      }
      const blockId = wp.blockId || "";
      let entry = null;
      let entryIndex = -1;
      for (let j = index - 1; j >= 0; j -= 1) {
        const prev = waypoints[j];
        if (prev.source === "camera") {
          continue;
        }
        if (prev.source !== "survey" || (prev.blockId || "") !== blockId) {
          break;
        }
        if (prev.pathRole === "overshoot-entry") {
          entry = prev;
          entryIndex = j;
          break;
        }
        if (prev.pathRole === "line-end" || prev.pathRole === "line-start") {
          break;
        }
      }
      let lineEnd = null;
      let lineEndIndex = -1;
      for (let j = index + 1; j < waypoints.length; j += 1) {
        const next = waypoints[j];
        if (next.source === "camera") {
          continue;
        }
        if (next.source !== "survey" || (next.blockId || "") !== blockId) {
          break;
        }
        if (next.pathRole === "line-end") {
          lineEnd = next;
          lineEndIndex = j;
          break;
        }
      }
      if (!lineEnd) {
        return;
      }
      callback({
        lineStart: wp,
        lineStartIndex: index,
        lineEnd: lineEnd,
        lineEndIndex: lineEndIndex,
        entry: entry,
        entryIndex: entryIndex,
        row: wp.row
      });
    });
  }

  function drawSurveyPhotoSegmentsFromMission(layerGroup, waypoints, opts) {
    const photoPathOptions = {
      color: "#3dd68c",
      weight: opts.weight != null ? opts.weight : 4,
      opacity: opts.opacity != null ? opts.opacity : 0.98,
      lineCap: "round",
      lineJoin: "round"
    };

    forEachSurveyPhotoLegFromMission(waypoints, function (leg) {
      const rowIndex = leg.row != null ? leg.row : 0;
      const alongRatio = rowIndex % 2 === 0 ? 0.42 : 0.58;
      const arrowFromIdx = leg.entryIndex >= 0 ? leg.entryIndex : leg.lineStartIndex;
      const arrowToIdx = leg.lineStartIndex + 1;
      const arrowFrom = waypoints[arrowFromIdx];
      const arrowTo = waypoints[arrowToIdx] || leg.lineStart;

      addSurveyHeadingArrow(layerGroup, arrowFrom, arrowTo, {
        alongRatio: alongRatio,
        anchorFrom: leg.lineStart,
        anchorTo: leg.lineEnd
      });

      window.L.polyline(
        [
          [leg.lineStart.lat, leg.lineStart.lng],
          [leg.lineEnd.lat, leg.lineEnd.lng]
        ],
        photoPathOptions
      ).addTo(layerGroup);
    });
  }

  function drawSurveyPhotoSegmentsFromPath(layerGroup, path, opts) {
    const photoPathOptions = {
      color: "#3dd68c",
      weight: opts.weight != null ? opts.weight : 4,
      opacity: opts.opacity != null ? opts.opacity : 0.98,
      lineCap: "round",
      lineJoin: "round"
    };

    groupSurveyPathTransects(path).forEach(function (group) {
      const lineStart = group.find(function (point) {
        return (point.pathRole || point.role) === "line-start";
      });
      const lineEnd = group.find(function (point) {
        return (point.pathRole || point.role) === "line-end";
      });
      const entry = group.find(function (point) {
        return (point.pathRole || point.role) === "overshoot-entry";
      });
      if (!lineStart || !lineEnd) {
        return;
      }

      const rowIndex = lineStart.row != null ? lineStart.row : 0;
      const alongRatio = rowIndex % 2 === 0 ? 0.42 : 0.58;
      const startIdx = group.indexOf(lineStart);
      const arrowFrom = entry || lineStart;
      const arrowTo = group[startIdx + 1] || lineEnd;

      addSurveyHeadingArrow(layerGroup, arrowFrom, arrowTo, {
        alongRatio: alongRatio,
        anchorFrom: lineStart,
        anchorTo: lineEnd
      });

      window.L.polyline(
        [
          [lineStart.lat, lineStart.lng],
          [lineEnd.lat, lineEnd.lng]
        ],
        photoPathOptions
      ).addTo(layerGroup);
    });
  }

  function drawSurveyPhotoSegments(layerGroup, points, options) {
    if (!layerGroup || !window.L || !Array.isArray(points) || !points.length) {
      return;
    }

    const opts = options || {};
    const isMission = points[0].source != null;
    if (isMission) {
      drawSurveyPhotoSegmentsFromMission(layerGroup, points, opts);
    } else {
      drawSurveyPhotoSegmentsFromPath(layerGroup, points, opts);
    }
  }

  function buildSurveyPathOptionsFromSettings(settings) {
    return {
      footprintWidthMeters: settings.footprintWidthMeters,
      turnAroundMeters: settings.turnAroundMeters,
      entryCorner: settings.surveyEntryCorner,
      lineSpacingMeters: computeLineSpacingMeters(
        settings.sideOverlap,
        settings.footprintWidthMeters
      )
    };
  }

  function syncWaypointMissionLayers(layers, waypoints, onWaypointMoved) {
    if (!layers || !window.L) {
      return;
    }

    const VT = window.VehicleTemplates;
    const MM = window.MissionModel;

    layers.waypointGroup.clearLayers();

    const mapWaypoints = [];
    const mapVisibleSet =
      MM && MM.buildSurveyMapVisibilitySet
        ? MM.buildSurveyMapVisibilitySet(waypoints)
        : null;

    waypoints.forEach(function (waypoint, index) {
      if (waypoint.source === "camera") {
        return;
      }
      if (mapVisibleSet && !mapVisibleSet.has(index)) {
        return;
      }
      mapWaypoints.push(waypoint);
      const waypointNumber = index + 1;
      const isSurveyNav = waypoint.source === "survey";
      const roleLabel = MM ? MM.getMapRoleLabel(waypoint) : waypoint.label || "";
      const popupTitle = MM ? MM.getDisplayTitle(waypoint, index) : roleLabel || "航点 " + waypointNumber;
      const labelQuadrant = WAYPOINT_LABEL_QUADRANTS[index % WAYPOINT_LABEL_QUADRANTS.length];
      const canDrag = Boolean(onWaypointMoved) && !waypoint.locked;
      const marker = window.L.marker([waypoint.lat, waypoint.lng], {
        icon: isSurveyNav
          ? createSurveyWaypointMarkerIcon(waypointNumber, waypoint.alt)
          : createWaypointMarkerIcon(waypointNumber, waypoint.alt, roleLabel, labelQuadrant),
        draggable: canDrag
      });

      marker.bindPopup(
        "<strong>" +
          popupTitle +
          "</strong><div style='margin-top:4px;font-size:11px;color:#9fb0c1'>" +
          round(waypoint.lng, 6).toFixed(6) +
          ", " +
          round(waypoint.lat, 6).toFixed(6) +
          (typeof waypoint.alt === "number" ? "<br>高度 " + waypoint.alt + " m" : "") +
          (waypoint.locked ? "<br>已锁定（飞控位置）" : "") +
          "</div>"
      );

      marker.on("click", window.L.DomEvent.stopPropagation);

      if (canDrag) {
        marker.on("dragstart", window.L.DomEvent.stopPropagation);
        marker.on("dragend", function () {
          const latLng = marker.getLatLng();
          onWaypointMoved(index, round(latLng.lng, 6), round(latLng.lat, 6));
        });
      }

      layers.waypointGroup.addLayer(marker);
    });

    if (mapWaypoints.length >= 2) {
      let leadingTemplateChain = true;
      for (let i = 1; i < mapWaypoints.length; i++) {
        const a = mapWaypoints[i - 1];
        const b = mapWaypoints[i];
        if (a.source === "survey" && b.source === "survey" && shouldSkipSurveyMapSegment(a, b)) {
          if (a.source !== "template" || b.source !== "template") {
            leadingTemplateChain = false;
          }
          continue;
        }
        let color = "#4fc3f7";
        let weight = 3;
        if (a.source === "survey" && b.source === "survey") {
          if (isSurveyConnectorSegment(a, b)) {
            color = "#7a8fa3";
            weight = 2;
          }
        } else if (VT && VT.gradeSegmentColor && a.source === "template" && b.source === "template") {
          color = VT.gradeSegmentColor(a, b);
        }
        window.L.polyline(
          [
            [a.lat, a.lng],
            [b.lat, b.lng]
          ],
          { color: color, weight: weight, opacity: 0.9 }
        ).addTo(layers.waypointGroup);

        const isLeadingTemplateLeg =
          leadingTemplateChain && a.source === "template" && b.source === "template";

        if (isLeadingTemplateLeg && VT && VT.horizontalDistanceM) {
          const dist = round(VT.horizontalDistanceM(a, b), 0);
          const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
          const isTakeoffLeg =
            MM &&
            (a.command === MM.MAV_CMD.NAV_TAKEOFF ||
              a.command === MM.MAV_CMD.NAV_VTOL_TAKEOFF);
          let labelText = dist + " m";
          let labelClass = "fp-segment-label-text";
          if (isTakeoffLeg && VT.gradeDegrees) {
            labelText = dist + " m · " + round(VT.gradeDegrees(a, b), 0) + "°";
            labelClass = "fp-segment-label-text fp-segment-label-text--grade";
          }
          window.L.marker([mid.lat, mid.lng], {
            icon: window.L.divIcon({
              className: "fp-segment-label",
              html: '<span class="' + labelClass + '">' + labelText + "</span>",
              iconSize: isTakeoffLeg ? [72, 18] : [52, 16],
              iconAnchor: isTakeoffLeg ? [36, 9] : [26, 8]
            }),
            interactive: false
          }).addTo(layers.waypointGroup);
        }

        if (a.source !== "template" || b.source !== "template") {
          leadingTemplateChain = false;
        }
      }

      drawSurveyPhotoSegments(layers.waypointGroup, waypoints, { weight: 4, opacity: 0.95 });
    }
  }

  function syncSurveyMissionLayers(
    layers,
    surveyArea,
    surveyPath,
    onSurveyVertexMoved,
    layerOptions,
    committedBlocks
  ) {
    if (!layers || !window.L) {
      return;
    }

    const opts = layerOptions || {};
    const surveyPathPreview = Boolean(opts.surveyPathPreview);

    layers.surveyGroup.clearLayers();
    layers.pathGroup.clearLayers();

    (committedBlocks || []).forEach(function (block, blockIndex) {
      if (!block.polygon || block.polygon.length < 3) {
        return;
      }
      window.L.polygon(
        block.polygon.map(function (p) {
          return [p.lat, p.lng];
        }),
        {
          color: "#f0c24f",
          weight: 2.5,
          dashArray: "4 6",
          fillColor: "#f0c24f",
          fillOpacity: 0.18
        }
      ).addTo(layers.surveyGroup);
    });

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
          color: "#6d8299",
          weight: surveyPathPreview ? 1.5 : 2,
          opacity: surveyPathPreview ? 0.45 : 0.55,
          dashArray: "6 8"
        }
      ).addTo(layers.pathGroup);

      drawSurveyPhotoSegments(layers.pathGroup, surveyPath, {
        weight: surveyPathPreview ? 3.5 : 4,
        opacity: surveyPathPreview ? 0.82 : 0.98
      });
    }
  }

  function syncLeafletMissionLayers(
    layers,
    waypoints,
    surveyArea,
    surveyPath,
    onWaypointMoved,
    onSurveyVertexMoved,
    layerOptions,
    committedBlocks,
    syncScope,
    overlayOptions
  ) {
    if (!layers || !window.L) {
      return;
    }

    const scope = syncScope || "all";
    const mapForClose =
      layers.waypointGroup && layers.waypointGroup._map
        ? layers.waypointGroup._map
        : null;
    if (
      scope === "all" &&
      mapForClose &&
      typeof mapForClose.closePopup === "function"
    ) {
      mapForClose.closePopup();
    }

    if (scope === "all" || scope === "waypoints") {
      syncWaypointMissionLayers(layers, waypoints, onWaypointMoved);
    }
    if (scope === "all" || scope === "survey") {
      syncSurveyMissionLayers(
        layers,
        surveyArea,
        surveyPath,
        onSurveyVertexMoved,
        layerOptions,
        committedBlocks
      );
    }

    const platform =
      overlayOptions && overlayOptions.platform
        ? overlayOptions.platform
        : "multirotor";
    syncFlightPlanMapOverlays(layers, platform);
    if (overlayOptions && overlayOptions.settings) {
      syncTerrainIssueLayers(
        layers,
        overlayOptions.terrainProfiles || [],
        overlayOptions.settings,
        platform
      );
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

  function resolveTerrainSurveyPolygon(surveyArea, surveyBlocks) {
    if (surveyArea && surveyArea.length >= 3) {
      return surveyArea;
    }
    const blocks = surveyBlocks || [];
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      const poly = blocks[i] && blocks[i].polygon;
      if (poly && poly.length >= 3) {
        return poly;
      }
    }
    return [];
  }

  function formatTerrainPrefetchStatus(status) {
    if (!status) {
      return { label: "—", tone: "muted" };
    }
    if (status.running) {
      const done = status.done || 0;
      const total = status.total || 0;
      let label = "预取中 " + done + "/" + total;
      if (status.message) {
        label += "（" + status.message + "）";
      }
      return { label: label, tone: "pending" };
    }
    if (status.message === "完成" || (status.total > 0 && status.done >= status.total)) {
      return { label: "完成（" + (status.done || 0) + " 瓦片）", tone: "ok" };
    }
    if (status.message === "已取消") {
      return { label: "已取消", tone: "muted" };
    }
    if ((status.errors || 0) > 0) {
      return {
        label: "部分失败（" + status.errors + " 错误）",
        tone: "warn"
      };
    }
    return { label: "空闲", tone: "muted" };
  }

  function hasTerrainPlanBlockingErrors(issues) {
    return (issues || []).some(function (issue) {
      return issue && issue.level === "error";
    });
  }

  function collectTerrainProfilesForMap(planBlocks, committedBlocks) {
    const out = [];
    (planBlocks || []).forEach(function (block) {
      if (block.previewProfile && block.previewProfile.length >= 2) {
        out.push({ profile: block.previewProfile });
      }
    });
    if (!out.length) {
      (committedBlocks || []).forEach(function (block) {
        if (block.storedProfile && block.storedProfile.length >= 2) {
          out.push({ profile: block.storedProfile });
        }
      });
    }
    return out;
  }

  function drawTerrainIssueSegments(layerGroup, profile, settings, platform) {
    if (!layerGroup || !window.L) {
      return;
    }
    const TPS = window.TerrainProfileSegments;
    if (!TPS || typeof TPS.findProfileProblemSegments !== "function") {
      return;
    }
    TPS.findProfileProblemSegments(profile, settings, platform).forEach(function (seg) {
      window.L.polyline(
        seg.latlngs.map(function (p) {
          return [p.lat, p.lng];
        }),
        {
          color: seg.level === "error" ? "#ff6b6b" : "#ffb020",
          weight: 6,
          opacity: 0.9,
          lineCap: "round",
          lineJoin: "round"
        }
      ).addTo(layerGroup);
    });
  }

  function syncTerrainIssueLayers(layers, profileSources, settings, platform) {
    if (!layers || !layers.terrainIssueGroup) {
      return;
    }
    layers.terrainIssueGroup.clearLayers();
    (profileSources || []).forEach(function (src) {
      if (src && src.profile) {
        drawTerrainIssueSegments(layers.terrainIssueGroup, src.profile, settings, platform);
      }
    });
  }

  function getTerrainGridStatusLabel() {
    const TM = window.TerrainMavlink;
    if (!TM || typeof TM.getTerrainGridStatus !== "function") {
      return { label: "—", tone: "muted" };
    }
    const st = TM.getTerrainGridStatus();
    if (!st.connected) {
      return { label: "未连接", tone: "muted" };
    }
    if (!st.hookInstalled) {
      return { label: "未就绪", tone: "muted" };
    }
    if (st.requestCount > 0) {
      return {
        label: "已响应 " + st.requestCount + " 次 · 发送 " + st.rowsSent + " 行",
        tone: "ok"
      };
    }
    return { label: "等待飞控请求", tone: "pending" };
  }

  function isTerrainValidationIssue(issue) {
    const code = issue && issue.code ? String(issue.code) : "";
    return code.indexOf("terrain") === 0;
  }

  function getTerrainFcEnableStatus(connected) {
    if (!connected) {
      return { label: "未连接", tone: "muted" };
    }
    const TM = window.TerrainMavlink;
    if (!TM || typeof TM.checkTerrainEnableBeforeUpload !== "function") {
      return { label: "未知", tone: "muted" };
    }
    const result = TM.checkTerrainEnableBeforeUpload();
    if (result.ok) {
      return { label: "已启用", tone: "ok" };
    }
    if (window.params instanceof Map && window.params.has("TERRAIN_ENABLE")) {
      return { label: "未启用", tone: "warn" };
    }
    return { label: "参数未就绪", tone: "muted" };
  }

  function createTerrainProfileSparklineElement(e, profile, settings, platform) {
    const pts = (profile || []).filter(function (p) {
      return p.elevation != null && Number.isFinite(p.elevation);
    });
    if (pts.length < 2 || !e) {
      return null;
    }
    const agl = Number(settings && settings.surveyAltitude) || 300;
    const ground = pts.map(function (p) {
      return p.elevation;
    });
    const flight = pts.map(function (p) {
      return p.elevation + agl;
    });
    const minY = Math.min.apply(null, ground);
    const maxY = Math.max.apply(null, flight);
    const range = Math.max(1, maxY - minY);
    const width = 200;
    const height = 48;
    const pad = 2;
    function xAt(index) {
      return pad + (index / (pts.length - 1)) * (width - pad * 2);
    }
    function yAt(value) {
      return pad + (1 - (value - minY) / range) * (height - pad * 2);
    }
    const groundPath = ground
      .map(function (value, index) {
        return (index === 0 ? "M" : "L") + xAt(index).toFixed(1) + " " + yAt(value).toFixed(1);
      })
      .join(" ");
    const TPS = window.TerrainProfileSegments;
    const errorSet =
      TPS && platform && typeof TPS.profileSegmentErrorSet === "function"
        ? TPS.profileSegmentErrorSet(profile, settings, platform)
        : {};
    const flightSegments = [];
    for (let i = 1; i < flight.length; i += 1) {
      const segKey = i - 1 + "-" + i;
      const isError = !!errorSet[segKey];
      flightSegments.push(
        e("path", {
          key: "fl-" + segKey,
          className: isError
            ? "fp-terrain-sparkline-flight fp-terrain-sparkline-flight--error"
            : "fp-terrain-sparkline-flight",
          d:
            "M" +
            xAt(i - 1).toFixed(1) +
            " " +
            yAt(flight[i - 1]).toFixed(1) +
            " L" +
            xAt(i).toFixed(1) +
            " " +
            yAt(flight[i]).toFixed(1)
        })
      );
    }
    return e(
      "svg",
      {
        className: "fp-terrain-sparkline fp-terrain-sparkline--wide",
        viewBox: "0 0 " + width + " " + height,
        width: width,
        height: height,
        role: "img",
        "aria-label": "地形剖面预览"
      },
      e("path", {
        className: "fp-terrain-sparkline-ground",
        d: groundPath + " L" + xAt(pts.length - 1).toFixed(1) + " " + yAt(minY).toFixed(1) + " Z"
      }),
      flightSegments
    );
  }

  function loadInitialFlightPlanDraft() {
    if (!window.FlightPlanDraft || typeof window.FlightPlanDraft.load !== "function") {
      return null;
    }
    const draft = window.FlightPlanDraft.load();
    if (!draft) {
      return null;
    }
    return {
      activeTab: draft.activeTab || "waypoint",
      settings: draft.settings ? normalizeMissionSettings(draft.settings) : null,
      missionWaypoints: Array.isArray(draft.missionWaypoints) ? draft.missionWaypoints : [],
      platformOverride: typeof draft.platformOverride === "string" ? draft.platformOverride : "",
      surveyArea: Array.isArray(draft.surveyArea) ? draft.surveyArea : [],
      surveyCommitted: Boolean(draft.surveyCommitted),
      appendRtl: Boolean(draft.appendRtl),
      surveyAltitudeCustomized: Boolean(draft.surveyAltitudeCustomized),
      turnAroundCustomized: Boolean(draft.turnAroundCustomized),
      surveyBlocks: Array.isArray(draft.surveyBlocks) ? draft.surveyBlocks : []
    };
  }

  function FlightPlanEditor() {
    const ReactApi = window.React;
    const useCallback = ReactApi.useCallback;
    const useEffect = ReactApi.useEffect;
    const useMemo = ReactApi.useMemo;
    const useRef = ReactApi.useRef;
    const useState = ReactApi.useState;

    const initialDraft = useMemo(loadInitialFlightPlanDraft, []);

    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const layersRef = useRef(null);
    const activeTabRef = useRef("waypoint");
    const settingsRef = useRef(normalizeMissionSettings());
    const surveyAltitudeCustomizedRef = useRef(
      initialDraft ? initialDraft.surveyAltitudeCustomized : false
    );
    const turnAroundCustomizedRef = useRef(
      initialDraft ? initialDraft.turnAroundCustomized : false
    );
    const missionBootstrappedRef = useRef(
      Boolean(
        initialDraft &&
          (initialDraft.missionWaypoints.length ||
            initialDraft.surveyArea.length ||
            initialDraft.surveyCommitted)
      )
    );
    const waypointCountRef = useRef(0);
    const surveyAreaCountRef = useRef(0);
    const latestWaypointsRef = useRef([]);
    const latestSurveyAreaRef = useRef([]);
    const latestSurveyPathRef = useRef([]);
    const latestSurveyBlocksRef = useRef(
      initialDraft && initialDraft.surveyBlocks ? initialDraft.surveyBlocks : []
    );
    const surveyCommittedRef = useRef(initialDraft ? initialDraft.surveyCommitted : false);
    const mapSyncRafRef = useRef(0);
    const mapSyncScopeRef = useRef("all");
    const syncTakeoffToVehicleRef = useRef(null);
    const latestPlatformRef = useRef("multirotor");
    const latestSettingsRef = useRef(normalizeMissionSettings());
    const latestTerrainPlanBlocksRef = useRef([]);
    const fileInputRef = useRef(null);
    const [activeTab, setActiveTab] = useState(
      initialDraft && initialDraft.activeTab ? initialDraft.activeTab : "waypoint"
    );
    const [settings, setSettings] = useState(
      initialDraft && initialDraft.settings
        ? initialDraft.settings
        : normalizeMissionSettings()
    );
    const [overlapEditKey, setOverlapEditKey] = useState(null);
    const [overlapEditText, setOverlapEditText] = useState("");
    const [missionWaypoints, setMissionWaypoints] = useState(
      initialDraft ? initialDraft.missionWaypoints : []
    );
    const [platformOverride, setPlatformOverride] = useState(
      initialDraft ? initialDraft.platformOverride : ""
    );
    const [surveyArea, setSurveyArea] = useState(initialDraft ? initialDraft.surveyArea : []);
    const [surveyCommitted, setSurveyCommitted] = useState(
      initialDraft ? initialDraft.surveyCommitted : false
    );
    const [appendRtl, setAppendRtl] = useState(initialDraft ? initialDraft.appendRtl : false);
    const [surveyBlocks, setSurveyBlocks] = useState(
      initialDraft && initialDraft.surveyBlocks ? initialDraft.surveyBlocks : []
    );
    const [validationIssues, setValidationIssues] = useState([]);
    const [surveyToast, setSurveyToast] = useState("");
    const [terrainPlanning, setTerrainPlanning] = useState(false);
    const [terrainPlanBlocks, setTerrainPlanBlocks] = useState([]);
    const [terrainPlanIssues, setTerrainPlanIssues] = useState([]);
    const [terrainPlanStats, setTerrainPlanStats] = useState(null);
    const [terrainAdvisorText, setTerrainAdvisorText] = useState("");
    const [terrainHealth, setTerrainHealth] = useState(null);
    const [terrainHealthLoading, setTerrainHealthLoading] = useState(false);
    const [surveyAreaTerrainStats, setSurveyAreaTerrainStats] = useState(null);
    const [surveyAreaStatsLoading, setSurveyAreaStatsLoading] = useState(false);
    const [terrainPrefetchStatus, setTerrainPrefetchStatus] = useState(null);
    const [terrainPrefetchBusy, setTerrainPrefetchBusy] = useState(false);
    const [terrainPrefetchEstimate, setTerrainPrefetchEstimate] = useState(null);
    const [terrainPlanPhase, setTerrainPlanPhase] = useState("");
    const [terrainPlanProgressMessage, setTerrainPlanProgressMessage] = useState("");
    const [surveyWaypointGroundElev, setSurveyWaypointGroundElev] = useState({});
    const [terrainGridStatusRevision, setTerrainGridStatusRevision] = useState(0);
    const [connected, setConnected] = useState(
      window._gcsConnState === "connected"
    );
    const [missionIoBusy, setMissionIoBusy] = useState(false);
    const [missionIoNote, setMissionIoNote] = useState("");
    const [missionIoProgress, setMissionIoProgress] = useState(null);
    const [fcParamRevision, setFcParamRevision] = useState(0);
    const resolvedSurveyHeadingDeg = useMemo(
      function () {
        if (surveyArea.length < 3) {
          return null;
        }
        if (!settings.surveyHeadingAuto) {
          return settings.surveyHeadingDeg;
        }
        const pathOpts = buildSurveyPathOptionsFromSettings(settings);
        if (window.SurveyPlanner && window.SurveyPlanner.pickBestSurveyHeadingDegrees) {
          return window.SurveyPlanner.pickBestSurveyHeadingDegrees(
            surveyArea,
            settings.sideOverlap,
            pathOpts
          );
        }
        return null;
      },
      [
        surveyArea,
        settings.surveyHeadingAuto,
        settings.surveyHeadingDeg,
        settings.sideOverlap,
        settings.footprintWidthMeters,
        settings.turnAroundMeters,
        settings.surveyEntryCorner
      ]
    );

    const surveyPath = useMemo(function () {
      if (surveyArea.length < 3) {
        return [];
      }

      const pathOpts = buildSurveyPathOptionsFromSettings(settings);
      if (!settings.surveyHeadingAuto && settings.surveyHeadingDeg != null) {
        pathOpts.headingDegrees = settings.surveyHeadingDeg;
      } else if (resolvedSurveyHeadingDeg != null) {
        pathOpts.headingDegrees = resolvedSurveyHeadingDeg;
      }

      const gen =
        window.SurveyPlanner && window.SurveyPlanner.generateSurveyPath
          ? window.SurveyPlanner.generateSurveyPath
          : generateSurveyPath;
      return gen(surveyArea, settings.sideOverlap, pathOpts).map(function (point) {
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
      resolvedSurveyHeadingDeg,
      settings.sideOverlap,
      settings.footprintWidthMeters,
      settings.turnAroundMeters,
      settings.surveyEntryCorner,
      settings.surveyHeadingAuto,
      settings.surveyHeadingDeg
    ]);

    const surveyPreviewPoints = useMemo(
      function () {
        if (surveyCommitted || surveyPath.length < 1) {
          return [];
        }
        return extractSurveyRouteWaypoints(surveyPath).map(function (point, index) {
          return {
            seq: missionWaypoints.length + index + 1,
            lat: point.lat,
            lng: point.lng,
            alt: settings.surveyAltitude
          };
        });
      },
      [surveyPath, settings.surveyAltitude, surveyCommitted, missionWaypoints.length]
    );

    const resolvedPlatform = useMemo(
      function () {
        const VT = window.VehicleTemplates;
        const detect = VT && VT.detectVehiclePlatform ? VT.detectVehiclePlatform() : "multirotor";
        const base = connected ? detect : platformOverride || detect;
        const VMI = window.VehicleMarkerIcons;
        if (connected && VMI && typeof VMI.detectVehicleMarkerKind === "function") {
          return VMI.detectVehicleMarkerKind({ requireConnected: false });
        }
        if (VMI && base === "multirotor" && typeof VMI.detectMultirotorFrameKind === "function") {
          return VMI.detectMultirotorFrameKind();
        }
        return base;
      },
      [platformOverride, connected, fcParamRevision]
    );

    useEffect(function () {
      latestPlatformRef.current = resolvedPlatform;
    }, [resolvedPlatform]);

    useEffect(function () {
      if (turnAroundCustomizedRef.current) {
        return;
      }
      const next = getDefaultTurnAroundMeters(resolvedPlatform);
      setSettings(function (prev) {
        if (prev.turnAroundMeters === next) {
          return prev;
        }
        return Object.assign({}, prev, {
          turnAroundMeters: formatMissionSettingValue("turnAroundMeters", next)
        });
      });
    }, [resolvedPlatform]);

    useEffect(function () {
      if (!layersRef.current) {
        return;
      }
      syncFlightPlanMapOverlays(layersRef.current, resolvedPlatform);
    }, [connected, resolvedPlatform]);

    useEffect(function () {
      function onAirframeParams() {
        if (!connected) {
          return;
        }
        setFcParamRevision(function (n) {
          return n + 1;
        });
      }
      document.addEventListener("gcs-airframe-params-changed", onAirframeParams);
      return function () {
        document.removeEventListener("gcs-airframe-params-changed", onAirframeParams);
      };
    }, [connected]);

    useEffect(
      function () {
        if (!settings.useTerrainFollowing) {
          setTerrainHealth(null);
          setTerrainHealthLoading(false);
          return;
        }
        const TS = window.TerrainService;
        if (!TS || typeof TS.probeHealth !== "function") {
          return;
        }
        let cancelled = false;
        let timer = null;
        function poll(isFirst) {
          if (isFirst) {
            setTerrainHealthLoading(true);
          }
          TS.probeHealth(true)
            .then(function (health) {
              if (!cancelled) {
                setTerrainHealth(health);
                setTerrainHealthLoading(false);
              }
            })
            .catch(function () {
              if (!cancelled) {
                setTerrainHealth({ ok: false });
                setTerrainHealthLoading(false);
              }
            });
        }
        poll(true);
        timer = window.setInterval(function () {
          poll(false);
        }, 8000);
        return function () {
          cancelled = true;
          if (timer) {
            window.clearInterval(timer);
          }
        };
      },
      [settings.useTerrainFollowing]
    );

    const terrainSurveyPolygon = useMemo(
      function () {
        return resolveTerrainSurveyPolygon(surveyArea, surveyBlocks);
      },
      [surveyArea, surveyBlocks]
    );

    const terrainSurveyFromCommitted = useMemo(
      function () {
        return surveyArea.length < 3 && terrainSurveyPolygon.length >= 3;
      },
      [surveyArea.length, terrainSurveyPolygon.length]
    );

    useEffect(
      function () {
        if (!settings.useTerrainFollowing || terrainSurveyPolygon.length < 3) {
          setSurveyAreaTerrainStats(null);
          setSurveyAreaStatsLoading(false);
          return;
        }
        const TS = window.TerrainService;
        if (!TS || typeof TS.getTerrainStats !== "function") {
          return;
        }
        let cancelled = false;
        setSurveyAreaStatsLoading(true);
        TS.getTerrainStats(terrainSurveyPolygon)
          .then(function (stats) {
            if (!cancelled) {
              setSurveyAreaTerrainStats(stats || null);
              setSurveyAreaStatsLoading(false);
            }
          })
          .catch(function () {
            if (!cancelled) {
              setSurveyAreaTerrainStats(null);
              setSurveyAreaStatsLoading(false);
            }
          });
        return function () {
          cancelled = true;
        };
      },
      [settings.useTerrainFollowing, terrainSurveyPolygon]
    );

    useEffect(
      function () {
        if (!settings.useTerrainFollowing) {
          setTerrainPrefetchStatus(null);
          return;
        }
        const TS = window.TerrainService;
        if (!TS || typeof TS.terrainPrefetchStatus !== "function") {
          return;
        }
        let cancelled = false;
        function poll() {
          TS.terrainPrefetchStatus()
            .then(function (status) {
              if (!cancelled) {
                setTerrainPrefetchStatus(status || null);
              }
            })
            .catch(function () {
              if (!cancelled) {
                setTerrainPrefetchStatus(null);
              }
            });
        }
        poll();
        const timer = window.setInterval(poll, 3000);
        return function () {
          cancelled = true;
          window.clearInterval(timer);
        };
      },
      [settings.useTerrainFollowing]
    );

    const terrainValidationIssues = useMemo(
      function () {
        return validationIssues.filter(isTerrainValidationIssue);
      },
      [validationIssues]
    );

    const terrainFcEnableStatus = useMemo(
      function () {
        return getTerrainFcEnableStatus(connected);
      },
      [connected, fcParamRevision]
    );

    const onWaypointMovedRef = useRef(null);
    const onSurveyVertexMovedRef = useRef(null);

    const applyTakeoffVehicleSync = useCallback(function () {
      const VT = window.VehicleTemplates;
      if (!VT || window._gcsConnState !== "connected") {
        return;
      }
      setMissionWaypoints(function (prev) {
        if (!prev.length) {
          return prev;
        }
        return VT.syncTakeoffFromVehicle(prev, true);
      });
    }, []);

    useEffect(function () {
      syncTakeoffToVehicleRef.current = applyTakeoffVehicleSync;
    }, [applyTakeoffVehicleSync]);

    useEffect(function () {
      const timer = window.setInterval(function () {
        if (!isFlightPlanViewActive() || !layersRef.current) {
          return;
        }
        syncFlightPlanMapOverlays(layersRef.current, latestPlatformRef.current);
        if (window._gcsConnState === "connected" && syncTakeoffToVehicleRef.current) {
          syncTakeoffToVehicleRef.current();
        }
      }, 500);
      return function () {
        window.clearInterval(timer);
      };
    }, []);

    const handleWaypointMoved = useCallback(function (index, lng, lat) {
      setMissionWaypoints(function (previous) {
        if (index < 0 || index >= previous.length) {
          return previous;
        }
        const next = previous.slice();
        next[index] = Object.assign({}, next[index], { lng: lng, lat: lat });
        const MM = window.MissionModel;
        return MM ? MM.renumberWaypoints(next) : next;
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
      setSurveyCommitted(false);
    }, []);

    const bootstrapMissionForSurvey = useCallback(function () {
      const MM = window.MissionModel;
      const VT = window.VehicleTemplates;
      if (!MM || !VT) {
        return;
      }
      const origin = MM.getTakeoffLatLng();
      const list = VT.buildBootstrapWaypoints(
        resolvedPlatform,
        origin,
        MM.isVehicleConnected()
      );
      setMissionWaypoints(list);
      missionBootstrappedRef.current = true;
    }, [resolvedPlatform]);

    const handlePlatformChange = useCallback(
      function (val) {
        if (connected) {
          return;
        }
        setPlatformOverride(val);
        const MM = window.MissionModel;
        const VT = window.VehicleTemplates;
        const MC = window.MissionComposer;
        if (MM && VT) {
          const boot = VT.buildBootstrapWaypoints(val, MM.getTakeoffLatLng(), false);
          if (MC && surveyBlocks.length) {
            setMissionWaypoints(
              MC.rebuildMissionFromBlocks(boot, surveyBlocks, val, appendRtl)
            );
          } else {
            setMissionWaypoints(boot);
          }
          missionBootstrappedRef.current = true;
        }
      },
      [connected, surveyBlocks, appendRtl]
    );

    const handleConfirmSurveyGenerate = useCallback(function () {
      const MC = window.MissionComposer;
      if (!MC || surveyArea.length < 3) {
        return;
      }
      if (settings.useTerrainFollowing && !terrainPlanBlocks.length) {
        setSurveyToast("请先点击「自动规划」完成地形预取与剖面校核");
        return;
      }
      if (settings.useTerrainFollowing && hasTerrainPlanBlockingErrors(terrainPlanIssues)) {
        if (
          !window.confirm(
            "存在地形校核错误（如 DEM 缺失或爬升率超限），仍要确认生成？"
          )
        ) {
          return;
        }
      }
      if (terrainPlanBlocks.length && settings.useTerrainFollowing) {
        let waypoints = missionWaypoints;
        let blocks = surveyBlocks.slice();
        let addedTotal = 0;
        terrainPlanBlocks.forEach(function (previewBlock) {
          const block = MC.createSurveyBlock(
            previewBlock.polygon || surveyArea,
            previewBlock.paramsSnapshot || settings,
            blocks.length
          );
          block.storedProfile = previewBlock.previewProfile || null;
          block.storedIssues = previewBlock.previewIssues || [];
          block.terrainPlanned = true;
          const result = MC.appendBlockToMission(waypoints, block, resolvedPlatform, false);
          waypoints = result.waypoints;
          blocks = blocks.concat([result.block]);
          addedTotal += result.addedCount;
        });
        if (appendRtl) {
          const MM = window.MissionModel;
          if (MM && MM.appendRtlWaypoint) {
            waypoints = MM.appendRtlWaypoint(waypoints);
          }
        }
        setMissionWaypoints(waypoints);
        setSurveyBlocks(blocks);
        setSurveyToast(
          "已追加 " + terrainPlanBlocks.length + " 块地形测绘区域，+" + addedTotal + " 个航点"
        );
        setTerrainPlanBlocks([]);
        setTerrainPlanIssues([]);
        setSurveyArea([]);
        setSurveyCommitted(false);
        return;
      }
      if (!surveyPath.length) {
        return;
      }
      const block = MC.createSurveyBlock(surveyArea, settings, surveyBlocks.length);
      const result = MC.appendBlockToMission(
        missionWaypoints,
        block,
        resolvedPlatform,
        appendRtl
      );
      setMissionWaypoints(result.waypoints);
      setSurveyBlocks(function (prev) {
        return prev.concat([result.block]);
      });
      setSurveyToast(
        "已追加区域 " +
          (result.block.order + 1) +
          "：+" +
          result.addedCount +
          " 个测绘航点，共 " +
          result.waypoints.length +
          " 个任务航点"
      );
      setSurveyArea([]);
      setSurveyCommitted(false);
    }, [
      surveyArea,
      surveyPath,
      settings,
      surveyBlocks.length,
      appendRtl,
      resolvedPlatform,
      missionWaypoints,
      terrainPlanBlocks,
      terrainPlanIssues
    ]);

    const handleAutoTerrainPlan = useCallback(function () {
      const TSP = window.TerrainSurveyPlanner;
      if (!TSP || surveyArea.length < 3) {
        return;
      }
      setTerrainPlanning(true);
      setTerrainPlanPhase("prefetch");
      setTerrainPlanProgressMessage("准备地形数据…");
      setTerrainAdvisorText("");
      const planSettings = Object.assign({}, settings, { useTerrainFollowing: true });
      TSP.planAuto(surveyArea, planSettings, resolvedPlatform, {
        onProgress: function (progress) {
          if (!progress) {
            return;
          }
          if (progress.phase === "prefetch") {
            setTerrainPlanPhase("prefetch");
            if (progress.status) {
              setTerrainPrefetchStatus(progress.status);
            }
            setTerrainPlanProgressMessage("下载测区地形…");
          } else if (progress.phase === "stats") {
            setTerrainPlanPhase("stats");
            setTerrainPlanProgressMessage(progress.message || "读取测区高程…");
          } else if (progress.phase === "planning") {
            setTerrainPlanPhase("planning");
            setTerrainPlanProgressMessage(
              progress.message ||
                "规划块 " +
                  (progress.blockIndex || 0) +
                  "/" +
                  (progress.blockTotal || 0)
            );
          } else if (progress.phase === "done") {
            setTerrainPlanPhase("");
            setTerrainPlanProgressMessage("");
          }
        }
      })
        .then(function (result) {
          setTerrainPlanBlocks(result.blocks || []);
          setTerrainPlanIssues(result.issues || []);
          setTerrainPlanStats(result.stats || null);
          const errCount = (result.issues || []).filter(function (i) {
            return i.level === "error";
          }).length;
          setSurveyToast(
            "自动规划完成：" +
              (result.blocks ? result.blocks.length : 0) +
              " 块区域" +
              ((result.issues || []).length
                ? "，" + result.issues.length + " 条校核提示" +
                  (errCount ? "（" + errCount + " 错误）" : "")
                : "")
          );
        })
        .catch(function (err) {
          setSurveyToast(err.message || "地形自动规划失败");
          setTerrainPlanBlocks([]);
          setTerrainPlanIssues([]);
        })
        .finally(function () {
          setTerrainPlanning(false);
          setTerrainPlanPhase("");
          setTerrainPlanProgressMessage("");
        });
    }, [surveyArea, settings, resolvedPlatform]);

    const handleManualTerrainPrefetch = useCallback(
      function () {
        const TS = window.TerrainService;
        if (!TS || terrainSurveyPolygon.length < 3) {
          setSurveyToast("请先绘制或确认测区");
          return;
        }
        setTerrainPrefetchBusy(true);
        setSurveyToast("正在预取测区地形…");
        TS.ensureTerrainForPolygon(terrainSurveyPolygon, {
          force: true,
          onProgress: function (status) {
            setTerrainPrefetchStatus(status || null);
          }
        })
          .then(function () {
            setSurveyToast("测区地形预取完成");
            return TS.probeHealth(true);
          })
          .then(function (health) {
            if (health) {
              setTerrainHealth(health);
            }
          })
          .catch(function (err) {
            setSurveyToast((err && err.message) || "地形预取失败");
          })
          .finally(function () {
            setTerrainPrefetchBusy(false);
          });
      },
      [terrainSurveyPolygon]
    );

    const handleCancelTerrainPrefetch = useCallback(function () {
      const TS = window.TerrainService;
      if (!TS || typeof TS.cancelTerrainPrefetch !== "function") {
        return;
      }
      TS.cancelTerrainPrefetch()
        .then(function () {
          setSurveyToast("已请求取消地形预取");
        })
        .catch(function () {
          setSurveyToast("取消预取失败");
        });
    }, []);

    const handleAnalyzeTerrainPlan = useCallback(function () {
      const TPA = window.TerrainPlanAdvisor;
      if (!TPA) {
        return;
      }
      const summary = {
        platform: resolvedPlatform,
        settings: settings,
        stats: terrainPlanStats,
        blockCount: terrainPlanBlocks.length,
        issues: terrainPlanIssues
      };
      TPA.analyzePlan(summary).then(function (res) {
        setTerrainAdvisorText(res.text || "");
      });
    }, [resolvedPlatform, settings, terrainPlanStats, terrainPlanBlocks, terrainPlanIssues]);

    const handleDeleteLastSurveyBlock = useCallback(function () {
      const MC = window.MissionComposer;
      if (!MC || !surveyBlocks.length) {
        return;
      }
      const result = MC.removeLastBlock(missionWaypoints, surveyBlocks);
      setSurveyBlocks(result.blocks);
      setMissionWaypoints(result.waypoints);
      setSurveyToast("已删除区域 " + (result.removed ? result.removed.order + 1 : ""));
    }, [missionWaypoints, surveyBlocks]);

    const handleRecalcSurveyBlock = useCallback(
      function (blockId) {
        const MC = window.MissionComposer;
        const TSP = window.TerrainSurveyPlanner;
        const TS = window.TerrainService;
        if (!MC) {
          return;
        }
        const block = surveyBlocks.find(function (b) {
          return b.id === blockId;
        });
        if (!block) {
          return;
        }
        const runRecalc = function (profileBlock) {
          let blocksForRecalc = surveyBlocks;
          if (profileBlock) {
            blocksForRecalc = surveyBlocks.map(function (b) {
              if (b.id !== blockId) {
                return b;
              }
              return Object.assign({}, b, {
                storedProfile: profileBlock.previewProfile || b.storedProfile,
                storedIssues: profileBlock.previewIssues || b.storedIssues,
                terrainPlanned: true
              });
            });
            setSurveyBlocks(blocksForRecalc);
          }
          const result = MC.recalcBlock(
            missionWaypoints,
            blocksForRecalc,
            blockId,
            resolvedPlatform,
            appendRtl
          );
          if (!result) {
            return;
          }
          setMissionWaypoints(result.waypoints);
          setSurveyToast("已重算区域 " + (result.block.order + 1));
        };
        if (
          settings.useTerrainFollowing &&
          TSP &&
          TS &&
          block.polygon &&
          block.polygon.length >= 3
        ) {
          setTerrainPlanning(true);
          setTerrainPlanPhase("prefetch");
          setTerrainPlanProgressMessage("重算：预取地形…");
          TS.ensureTerrainForPolygon(block.polygon, {
            force: false,
            onProgress: setTerrainPrefetchStatus
          })
            .then(function () {
              setTerrainPlanPhase("planning");
              setTerrainPlanProgressMessage("重算：剖面校核…");
              return TSP.planBlock(
                block.polygon,
                Object.assign({}, settings, { useTerrainFollowing: true }),
                resolvedPlatform,
                block.order
              );
            })
            .then(function (previewBlock) {
              runRecalc(previewBlock);
            })
            .catch(function (err) {
              setSurveyToast((err && err.message) || "地形重算失败");
              runRecalc(null);
            })
            .finally(function () {
              setTerrainPlanning(false);
              setTerrainPlanPhase("");
              setTerrainPlanProgressMessage("");
            });
          return;
        }
        runRecalc(null);
      },
      [missionWaypoints, surveyBlocks, resolvedPlatform, appendRtl, settings]
    );

    const handleAppendRtlChange = useCallback(function (checked) {
      setAppendRtl(checked);
      const MM = window.MissionModel;
      if (!MM) {
        return;
      }
      setMissionWaypoints(function (previous) {
        if (checked) {
          return MM.appendRtlWaypoint(previous);
        }
        return MM.stripRtlWaypoints(previous);
      });
    }, []);

    useEffect(function () {
      onWaypointMovedRef.current = handleWaypointMoved;
    }, [handleWaypointMoved]);

    useEffect(function () {
      onSurveyVertexMovedRef.current = handleSurveyVertexMoved;
    }, [handleSurveyVertexMoved]);

    const syncMapLayers = useCallback(function (
      nextWaypoints,
      nextSurveyArea,
      nextSurveyPath,
      committed,
      nextBlocks,
      syncScope
    ) {
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
        },
        {
          surveyPathPreview: !committed
        },
        nextBlocks || [],
        syncScope || "all",
        {
          platform: latestPlatformRef.current,
          settings: latestSettingsRef.current,
          terrainProfiles: collectTerrainProfilesForMap(
            latestTerrainPlanBlocksRef.current,
            nextBlocks || []
          )
        }
      );
    }, []);

    const scheduleMapLayerSync = useCallback(
      function (syncScope) {
        if (syncScope === "survey") {
          mapSyncScopeRef.current =
            mapSyncScopeRef.current === "waypoints" ? "all" : "survey";
        } else if (syncScope === "waypoints") {
          mapSyncScopeRef.current =
            mapSyncScopeRef.current === "survey" ? "all" : "waypoints";
        } else {
          mapSyncScopeRef.current = "all";
        }

        if (mapSyncRafRef.current) {
          return;
        }

        mapSyncRafRef.current = window.requestAnimationFrame(function () {
          mapSyncRafRef.current = 0;
          const scope = mapSyncScopeRef.current;
          mapSyncScopeRef.current = "all";
          if (!mapRef.current || !layersRef.current) {
            return;
          }
          syncMapLayers(
            latestWaypointsRef.current,
            latestSurveyAreaRef.current,
            latestSurveyPathRef.current,
            surveyCommittedRef.current,
            latestSurveyBlocksRef.current,
            scope
          );
        });
      },
      [syncMapLayers]
    );

    useEffect(function () {
      activeTabRef.current = activeTab;
      settingsRef.current = settings;
      latestSettingsRef.current = settings;
      waypointCountRef.current = missionWaypoints.length;
      surveyAreaCountRef.current = surveyArea.length;
      surveyCommittedRef.current = surveyCommitted;
    }, [activeTab, settings, missionWaypoints.length, surveyArea.length, surveyCommitted]);

    useEffect(function () {
      latestWaypointsRef.current = missionWaypoints;
      latestSurveyAreaRef.current = surveyArea;
      latestSurveyPathRef.current = surveyPath;
      latestSurveyBlocksRef.current = surveyBlocks;
    }, [missionWaypoints, surveyArea, surveyPath, surveyBlocks]);

    useEffect(function () {
      if (!window.FlightPlanDraft || typeof window.FlightPlanDraft.save !== "function") {
        return;
      }
      window.FlightPlanDraft.save({
        activeTab: activeTab,
        settings: settings,
        missionWaypoints: missionWaypoints,
        platformOverride: platformOverride,
        surveyArea: surveyArea,
        surveyCommitted: surveyCommitted,
        appendRtl: appendRtl,
        surveyAltitudeCustomized: surveyAltitudeCustomizedRef.current,
        turnAroundCustomized: turnAroundCustomizedRef.current,
        surveyBlocks: surveyBlocks
      });
    }, [
      activeTab,
      settings,
      missionWaypoints,
      platformOverride,
      surveyArea,
      surveyCommitted,
      appendRtl,
      surveyBlocks
    ]);

    useEffect(function () {
      const MV = window.MissionValidator;
      if (!MV) {
        return;
      }
      if (MV.validateMissionAsync) {
        MV.validateMissionAsync(missionWaypoints, resolvedPlatform, {
          settings: settings,
          surveyBlocks: surveyBlocks
        }).then(function (issues) {
          setValidationIssues(issues || []);
        });
        return;
      }
      setValidationIssues(MV.validateMission(missionWaypoints, resolvedPlatform, { settings: settings }));
    }, [missionWaypoints, resolvedPlatform, settings, surveyBlocks]);

    useEffect(function () {
      if (activeTab !== "survey") {
        return;
      }
      const VT = window.VehicleTemplates;
      const MM = window.MissionModel;
      if (
        VT &&
        MM &&
        VT.shouldRebuildBootstrapTemplate &&
        VT.shouldRebuildBootstrapTemplate(missionWaypoints, resolvedPlatform)
      ) {
        const boot = VT.buildBootstrapWaypoints(
          resolvedPlatform,
          MM.getTakeoffLatLng(),
          MM.isVehicleConnected()
        );
        const MC = window.MissionComposer;
        if (MC && surveyBlocks.length) {
          setMissionWaypoints(
            MC.rebuildMissionFromBlocks(boot, surveyBlocks, resolvedPlatform, appendRtl)
          );
        } else {
          setMissionWaypoints(boot);
        }
        missionBootstrappedRef.current = true;
        return;
      }
      if (surveyArea.length || surveyCommitted || missionWaypoints.length) {
        missionBootstrappedRef.current = true;
        return;
      }
      if (!missionBootstrappedRef.current) {
        bootstrapMissionForSurvey();
      }
    }, [
      activeTab,
      bootstrapMissionForSurvey,
      missionWaypoints,
      resolvedPlatform,
      surveyArea.length,
      surveyCommitted,
      surveyBlocks,
      appendRtl
    ]);

    useEffect(function () {
      function onConn(event) {
        const next = event && event.detail && event.detail.state === "connected";
        setConnected(next);
        const VT = window.VehicleTemplates;
        if (next) {
          setPlatformOverride("");
          if (VT) {
            setMissionWaypoints(function (prev) {
              if (!prev.length) {
                return prev;
              }
              return VT.syncTakeoffFromVehicle(prev, true);
            });
          }
        } else if (VT) {
          setPlatformOverride(
            VT.detectVehiclePlatform ? VT.detectVehiclePlatform() : "multirotor"
          );
          setMissionWaypoints(function (prev) {
            if (!prev.length) {
              return prev;
            }
            return VT.syncTakeoffFromVehicle(prev, false);
          });
        }
      }
      document.addEventListener("gcs-connection", onConn);
      return function () {
        document.removeEventListener("gcs-connection", onConn);
      };
    }, []);

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
        const map = window.L.map(container, {
          zoomControl: true,
          preferCanvas: true
        }).setView(center, 13);

        addFlightPlanBaseLayers(map);
        if (window.GcsMapPrefetch && typeof window.GcsMapPrefetch.setupMap === "function") {
          window.GcsMapPrefetch.setupMap(map);
        }

        layersRef.current = {
          pathGroup: window.L.layerGroup().addTo(map),
          terrainIssueGroup: window.L.layerGroup().addTo(map),
          surveyGroup: window.L.layerGroup().addTo(map),
          waypointGroup: window.L.layerGroup().addTo(map),
          homeGroup: window.L.layerGroup().addTo(map),
          vehicleGroup: window.L.layerGroup().addTo(map)
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
            setSurveyCommitted(false);
          } else {
            const MM = window.MissionModel;
            setMissionWaypoints(function (previous) {
              const wp = MM
                ? MM.createWaypoint({
                    lng: clicked.lng,
                    lat: clicked.lat,
                    alt: Number(settingsRef.current.altitude),
                    source: "manual"
                  })
                : {
                    lng: clicked.lng,
                    lat: clicked.lat,
                    alt: Number(settingsRef.current.altitude)
                  };
              const next = MM ? MM.renumberWaypoints(previous.concat([wp])) : previous.concat([wp]);
              return next;
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
          },
          { surveyPathPreview: !surveyCommittedRef.current },
          latestSurveyBlocksRef.current,
          "all",
          { platform: latestPlatformRef.current,
            settings: latestSettingsRef.current,
            terrainProfiles: collectTerrainProfilesForMap(
              latestTerrainPlanBlocksRef.current,
              latestSurveyBlocksRef.current
            )
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
          if (layersRef.current) {
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
              },
              { surveyPathPreview: !surveyCommittedRef.current },
              latestSurveyBlocksRef.current,
              "all",
              {
                platform: latestPlatformRef.current,
                settings: latestSettingsRef.current,
                terrainProfiles: collectTerrainProfilesForMap(
                  latestTerrainPlanBlocksRef.current,
                  latestSurveyBlocksRef.current
                )
              }
            );
          }
          fitMissionBounds(
            mapRef.current,
            latestWaypointsRef.current,
            latestSurveyAreaRef.current,
            latestSurveyPathRef.current
          );
          if (syncTakeoffToVehicleRef.current) {
            syncTakeoffToVehicleRef.current();
          }
        });
      }

      window.addEventListener("gcs:main-view-changed", handleViewChanged);
      scheduleMapInit();

      return function () {
        disposed = true;
        if (retryTimer) {
          window.clearTimeout(retryTimer);
        }
        if (mapSyncRafRef.current) {
          window.cancelAnimationFrame(mapSyncRafRef.current);
          mapSyncRafRef.current = 0;
        }
        window.removeEventListener("gcs:main-view-changed", handleViewChanged);
        destroyMap();
      };
    }, []);

    useEffect(function () {
      scheduleMapLayerSync("survey");
    }, [surveyArea, surveyPath, surveyCommitted, surveyBlocks, scheduleMapLayerSync]);

    useEffect(function () {
      scheduleMapLayerSync("waypoints");
    }, [missionWaypoints, scheduleMapLayerSync]);

    useEffect(function () {
      if (!mapRef.current || !layersRef.current) {
        return;
      }
      scheduleMapLayerSync("all");
    }, [activeTab, scheduleMapLayerSync]);

    useEffect(function () {
      const MC = window.MissionComposer;
      if (!MC || surveyBlocks.length) {
        return;
      }
      const migrated = MC.migrateLegacySurveyWaypoints(missionWaypoints, surveyBlocks);
      if (migrated.length) {
        setSurveyBlocks(migrated);
      }
    }, [missionWaypoints, surveyBlocks.length]);

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
        } else if (key === "surveyHeadingAuto") {
          next.surveyHeadingAuto = Boolean(value);
        } else if (key === "surveyHeadingDeg") {
          if (value === "" || value == null) {
            next.surveyHeadingDeg = null;
          } else {
            const parsed = Number(value);
            if (!Number.isFinite(parsed)) {
              return previous;
            }
            next.surveyHeadingDeg = finalize ? Math.round(parsed) % 360 : parsed;
          }
        } else if (
          key === "useTerrainFollowing" ||
          key === "terrainAutoPartition" ||
          key === "terrainPrefetchOnDraw"
        ) {
          next[key] = Boolean(value);
        } else {
          next[key] = Number(value);
          if (finalize) {
            next[key] = formatMissionSettingValue(key, next[key]);
          }
        }

        if (key === "surveyAltitude") {
          surveyAltitudeCustomizedRef.current = true;
        }

        if (key === "turnAroundMeters") {
          turnAroundCustomizedRef.current = true;
        }

        if (key === "altitude" && !surveyAltitudeCustomizedRef.current) {
          next.surveyAltitude = formatMissionSettingValue("surveyAltitude", next.altitude);
        }

        if (key === "speed") {
          next.terrainCruiseSpeedMps = Number(next.speed) || DEFAULT_MISSION_SETTINGS.terrainCruiseSpeedMps;
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

    const handleDeleteWaypoint = useCallback(
      function (index) {
        setMissionWaypoints(function (previous) {
          if (index < 0 || index >= previous.length) {
            return previous;
          }
          const target = previous[index];
          if (target.locked) {
            return previous;
          }
          const next = previous.slice();
          next.splice(index, 1);
          const MM = window.MissionModel;
          return MM ? MM.renumberWaypoints(next) : next;
        });
      },
      []
    );

    const handleDeletePreviewWaypoint = useCallback(
      function (index) {
        setMissionWaypoints(function (previous) {
          if (index < 0 || index >= previous.length) {
            return previous;
          }
          const target = previous[index];
          if (
            target.locked &&
            target.source !== "survey" &&
            target.source !== "camera"
          ) {
            return previous;
          }
          const next = previous.slice();
          next.splice(index, 1);
          const MM = window.MissionModel;
          return MM ? MM.renumberWaypoints(next) : next;
        });
      },
      []
    );

    const handleClearWaypoints = useCallback(function () {
      setMissionWaypoints([]);
      missionBootstrappedRef.current = false;
    }, []);

    const handleClearSurvey = useCallback(function () {
      setSurveyArea([]);
      setSurveyCommitted(false);
      setTerrainPlanBlocks([]);
      setTerrainPlanIssues([]);
      setTerrainPlanStats(null);
      setTerrainAdvisorText("");
      setSurveyAreaTerrainStats(null);
      setSurveyAreaStatsLoading(false);
    }, []);

    useEffect(
      function () {
        if (!settings.useTerrainFollowing || settings.terrainPrefetchOnDraw === false) {
          return;
        }
        if (terrainSurveyPolygon.length < 3) {
          return;
        }
        const TS = window.TerrainService;
        if (!TS || !TS.prefetchTerrain || !TS.polygonBbox) {
          return;
        }
        const bbox = TS.polygonBbox(terrainSurveyPolygon);
        if (!bbox) {
          return;
        }
        TS.prefetchTerrain(bbox).catch(function () {
          /* draw-time prefetch is best-effort */
        });
      },
      [
        terrainSurveyPolygon,
        settings.useTerrainFollowing,
        settings.terrainPrefetchOnDraw
      ]
    );

    useEffect(
      function () {
        if (!settings.useTerrainFollowing || terrainSurveyPolygon.length < 3) {
          setTerrainPrefetchEstimate(null);
          return;
        }
        const TS = window.TerrainService;
        if (!TS || typeof TS.estimateTerrainPrefetch !== "function" || !TS.polygonBbox) {
          return;
        }
        const bbox = TS.polygonBbox(terrainSurveyPolygon);
        if (!bbox) {
          return;
        }
        let cancelled = false;
        TS.estimateTerrainPrefetch(bbox)
          .then(function (data) {
            if (!cancelled) {
              setTerrainPrefetchEstimate(data || null);
            }
          })
          .catch(function () {
            if (!cancelled) {
              setTerrainPrefetchEstimate(null);
            }
          });
        return function () {
          cancelled = true;
        };
      },
      [settings.useTerrainFollowing, terrainSurveyPolygon]
    );

    useEffect(
      function () {
        if (!settings.useTerrainFollowing) {
          setSurveyWaypointGroundElev({});
          return;
        }
        const TS = window.TerrainService;
        if (!TS || typeof TS.sampleElevationBatch !== "function") {
          return;
        }
        const points = [];
        const indexMap = [];
        missionWaypoints.forEach(function (wp, index) {
          if (wp.source === "survey") {
            points.push({ lat: wp.lat, lng: wp.lng });
            indexMap.push(index);
          }
        });
        if (!points.length) {
          setSurveyWaypointGroundElev({});
          return;
        }
        let cancelled = false;
        TS.sampleElevationBatch(points)
          .then(function (sampled) {
            if (cancelled) {
              return;
            }
            const elevMap = {};
            indexMap.forEach(function (missionIndex, i) {
              const pt = sampled[i];
              if (pt && pt.elevation != null && Number.isFinite(pt.elevation)) {
                elevMap[missionIndex] = pt.elevation;
              }
            });
            setSurveyWaypointGroundElev(elevMap);
          })
          .catch(function () {
            if (!cancelled) {
              setSurveyWaypointGroundElev({});
            }
          });
        return function () {
          cancelled = true;
        };
      },
      [missionWaypoints, settings.useTerrainFollowing]
    );

    useEffect(
      function () {
        if (!settings.useTerrainFollowing || !connected) {
          return;
        }
        const timer = window.setInterval(function () {
          setTerrainGridStatusRevision(function (n) {
            return n + 1;
          });
        }, 5000);
        return function () {
          window.clearInterval(timer);
        };
      },
      [settings.useTerrainFollowing, connected]
    );

    const handleFitMission = useCallback(function () {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
        fitMissionBounds(mapRef.current, missionWaypoints, surveyArea, surveyPath);
      }
    }, [missionWaypoints, surveyArea, surveyPath]);

    const handleSaveMissionFile = useCallback(function () {
      if (!window.WaypointFile) {
        return;
      }
      window.WaypointFile.downloadWaypointFile(
        missionWaypoints,
        "mission.waypoints",
        resolvedPlatform
      );
    }, [missionWaypoints, resolvedPlatform]);

    const handleImportMissionFile = useCallback(function (event) {
      const file = event.target.files && event.target.files[0];
      if (!file || !window.WaypointFile) {
        return;
      }
      const reader = new FileReader();
      reader.onload = function () {
        try {
          let list = window.WaypointFile.parseWaypointFile(reader.result);
          const FWP = window.FixedWingParams;
          if (FWP && FWP.normalizeWaypointsForPlatform) {
            list = FWP.normalizeWaypointsForPlatform(list, resolvedPlatform);
          }
          setMissionWaypoints(list);
          missionBootstrappedRef.current = true;
          setMissionIoNote("已导入 " + list.length + " 个航点");
        } catch (err) {
          setMissionIoNote(err.message || "导入失败");
        }
        event.target.value = "";
      };
      reader.readAsText(file, "utf-8");
    }, [resolvedPlatform]);

    const handleUploadMission = useCallback(async function () {
      if (!window.MavlinkMission) {
        return;
      }
      const MV = window.MissionValidator;
      if (MV) {
        const issues = MV.validateMissionAsync
          ? await MV.validateMissionAsync(missionWaypoints, resolvedPlatform, {
              settings: settings,
              surveyBlocks: surveyBlocks
            })
          : MV.validateMission(missionWaypoints, resolvedPlatform, { settings: settings });
        setValidationIssues(issues);
        if (MV.hasBlockingErrors(issues)) {
          setMissionIoNote("任务校验未通过，请修正后再写入飞控");
          if (typeof log === "function") {
            log("❌ 航线校验未通过，已阻止写入飞控");
          }
          return;
        }
        const TM = window.TerrainMavlink;
        if (settings.useTerrainFollowing && TM && TM.checkTerrainEnableBeforeUpload) {
          const te = TM.checkTerrainEnableBeforeUpload();
          if (te.warning && typeof log === "function") {
            log("⚠️ " + te.warning);
          }
        }
      }
      const total = missionWaypoints.length;
      setMissionIoBusy(true);
      setMissionIoProgress({
        mode: "upload",
        current: 0,
        total: total,
        indeterminate: total <= 0,
        label: "正在写入飞控…"
      });
      setMissionIoNote("正在写入飞控…");
      try {
        let uploadList = missionWaypoints;
        const FWP = window.FixedWingParams;
        if (FWP && FWP.normalizeWaypointsForPlatform) {
          uploadList = FWP.normalizeWaypointsForPlatform(uploadList, resolvedPlatform);
        }
        await window.MavlinkMission.uploadMission(uploadList, function (cur, tot) {
          const isLast = cur >= tot;
          if (!isLast && tot > 8 && cur % 3 !== 0) {
            return;
          }
          setMissionIoProgress({
            mode: "upload",
            current: cur,
            total: tot,
            indeterminate: false,
            label: "写入航点 " + cur + " / " + tot
          });
          setMissionIoNote("写入航点 " + cur + " / " + tot);
        });
        setMissionIoNote("任务已写入飞控");
        if (typeof log === "function") {
          log("✅ 航线已写入飞控");
        }
      } catch (err) {
        const msg = err.message || "写入失败";
        setMissionIoNote(msg);
        if (typeof log === "function") {
          log("❌ 写入航线失败: " + msg);
          if (/超时|MISSION_ACK|心跳/.test(msg)) {
            log("💡 请确认：1) 串口已连接且未被 MP/QGC 占用 2) 控制台无大量 CRC 错误 3) 可尝试提高波特率后重连");
          }
        }
      } finally {
        setMissionIoBusy(false);
        setMissionIoProgress(null);
      }
    }, [missionWaypoints, resolvedPlatform, settings, surveyBlocks]);

    const handleDownloadMission = useCallback(async function () {
      if (!window.MavlinkMission) {
        return;
      }
      setMissionIoBusy(true);
      setMissionIoProgress({
        mode: "download",
        current: 0,
        total: 0,
        indeterminate: true,
        label: "正在连接飞控任务…"
      });
      setMissionIoNote("正在读取飞控任务…");
      try {
        const list = await window.MavlinkMission.downloadMission(function (cur, tot) {
          const isLast = cur >= tot;
          if (!isLast && tot > 8 && cur % 3 !== 0) {
            return;
          }
          setMissionIoProgress({
            mode: "download",
            current: cur,
            total: tot,
            indeterminate: false,
            label: "读取航点 " + cur + " / " + tot
          });
          setMissionIoNote("读取航点 " + cur + " / " + tot);
        });
        setMissionWaypoints(list);
        missionBootstrappedRef.current = true;
        setMissionIoNote("已读取 " + list.length + " 个航点");
        if (typeof log === "function") {
          log("✅ 已从飞控读取 " + list.length + " 个航点");
        }
      } catch (err) {
        setMissionIoNote(err.message || "读取失败");
        if (typeof log === "function") {
          log("❌ 读取航线失败: " + (err.message || err));
        }
      } finally {
        setMissionIoBusy(false);
        setMissionIoProgress(null);
      }
    }, []);

    const lineSpacing = round(
      computeLineSpacingMeters(settings.sideOverlap, settings.footprintWidthMeters),
      2
    );
    const gpsFix = Number(window.gps_fix_type) || 0;
    const missionCurrent = Number.isFinite(Number(window.wp_current))
      ? Number(window.wp_current) + 1
      : null;
    const liveAltitude = Number.isFinite(Number(window.altitude))
      ? Math.round(Number(window.altitude))
      : null;
    const liveGroundspeed = Number.isFinite(Number(window.groundspeed))
      ? round(Number(window.groundspeed), 1)
      : null;
    const surveyReady = surveyArea.length >= 3 && surveyPath.length > 0;
    const connectionSummary = connected ? "飞控在线" : "未连接飞控";
    const planningSummary =
      activeTab === "survey"
        ? surveyReady
          ? "区域可生成航测航线"
          : "至少 3 个顶点后可生成航线"
        : missionWaypoints.length
          ? "可直接写入飞控或导出"
          : "点击地图开始添加航点";

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
          missionWaypoints.length
            ? e(
                "div",
                { className: "fp-survey-wp-table-wrap" },
                e(
                  "table",
                  { className: "fp-survey-wp-table fp-waypoint-table" },
                  e(
                    "thead",
                    null,
                    e(
                      "tr",
                      null,
                      e("th", { scope: "col" }, "航点"),
                      e("th", { scope: "col" }, "经度"),
                      e("th", { scope: "col" }, "纬度"),
                      e("th", { scope: "col" }, "高度"),
                      e("th", { scope: "col", className: "fp-wp-col-delete" }, "")
                    )
                  ),
                  e(
                    "tbody",
                    null,
                    missionWaypoints.map(function (waypoint, index) {
                      const isCamera = waypoint.source === "camera";
                      const title =
                        waypoint.label ||
                        (window.MissionModel
                          ? window.MissionModel.getDisplayTitle(waypoint, index)
                          : "WP" + (index + 1));
                      const canDelete = !waypoint.locked && !isCamera;
                      return e(
                        "tr",
                        {
                          key: "wp-" + index,
                          className: isCamera ? "fp-wp-row--camera" : ""
                        },
                        e("th", { scope: "row" }, title),
                        e(
                          "td",
                          { className: "fp-survey-wp-num" },
                          round(waypoint.lng, 6).toFixed(6)
                        ),
                        e(
                          "td",
                          { className: "fp-survey-wp-num" },
                          round(waypoint.lat, 6).toFixed(6)
                        ),
                        e(
                          "td",
                          { className: "fp-survey-wp-num" },
                          String(Math.round(Number(waypoint.alt) || 0))
                        ),
                        e(
                          "td",
                          { className: "fp-wp-col-delete" },
                          canDelete
                            ? e(
                                "button",
                                {
                                  type: "button",
                                  className: "fp-wp-delete-btn",
                                  title: "删除航点 " + (index + 1),
                                  "aria-label": "删除航点 " + (index + 1),
                                  onClick: function () {
                                    handleDeleteWaypoint(index);
                                  }
                                },
                                "×"
                              )
                            : e(
                                "span",
                                { className: "fp-wp-delete-placeholder", "aria-hidden": true },
                                "—"
                              )
                        )
                      );
                    })
                  )
                )
              )
            : e("div", { className: "fp-empty" }, "暂无航点，直接在地图上点击即可开始规划。")
        )
      );
    }

    function renderMissionIoProgressBar() {
      if (!missionIoProgress) {
        return null;
      }
      const current = Number(missionIoProgress.current) || 0;
      const total = Number(missionIoProgress.total) || 0;
      const percent =
        missionIoProgress.indeterminate || total <= 0
          ? 0
          : Math.min(100, Math.round((current / total) * 100));
      const progressText = missionIoProgress.indeterminate
        ? "获取任务数量…"
        : current + " / " + total;

      return e(
        "div",
        {
          className: "fp-mission-io-progress",
          role: "progressbar",
          "aria-valuemin": 0,
          "aria-valuemax": missionIoProgress.indeterminate ? 100 : total,
          "aria-valuenow": missionIoProgress.indeterminate ? undefined : current,
          "aria-label": missionIoProgress.label || "航线传输进度"
        },
        e(
          "div",
          { className: "fp-mission-io-progress-head" },
          e("span", { className: "fp-mission-io-progress-label" }, missionIoProgress.label),
          e("span", { className: "fp-mission-io-progress-text" }, progressText)
        ),
        e(
          "div",
          { className: "fp-mission-io-progress-bar-wrap" },
          e("div", {
            className:
              "fp-mission-io-progress-bar-fill" +
              (missionIoProgress.indeterminate ? " is-indeterminate" : ""),
            style: missionIoProgress.indeterminate ? undefined : { width: percent + "%" }
          })
        )
      );
    }

    function renderMissionIoCard() {
      return e(
        "section",
        { className: "fp-card fp-card-mission-io" },
        e("h3", { className: "fp-card-title" }, "航线文件与飞控"),
        renderMissionIoProgressBar(),
        missionIoNote && !missionIoProgress
          ? e("p", { className: "fp-card-note fp-mission-io-note" }, missionIoNote)
          : null,
        missionIoNote && missionIoProgress
          ? e("p", { className: "fp-card-note fp-mission-io-note fp-mission-io-note--sub" }, missionIoNote)
          : null,
        e("input", {
          ref: fileInputRef,
          type: "file",
          accept: ".waypoints,.txt",
          className: "fp-hidden-file",
          onChange: handleImportMissionFile
        }),
        e(
          "div",
          { className: "fp-button-row fp-button-row-wrap" },
          e(
            "button",
            {
              type: "button",
              className: "fp-btn",
              disabled: !missionWaypoints.length || missionIoBusy,
              onClick: handleSaveMissionFile
            },
            "保存航线"
          ),
          e(
            "button",
            {
              type: "button",
              className: "fp-btn",
              disabled: missionIoBusy,
              onClick: function () {
                if (fileInputRef.current) {
                  fileInputRef.current.click();
                }
              }
            },
            "导入航线"
          ),
          e(
            "button",
            {
              type: "button",
              className: "fp-btn primary",
              disabled: !connected || !missionWaypoints.length || missionIoBusy,
              onClick: handleUploadMission
            },
            "写入飞控"
          ),
          e(
            "button",
            {
              type: "button",
              className: "fp-btn",
              disabled: !connected || missionIoBusy,
              onClick: handleDownloadMission
            },
            "读取飞控"
          )
        ),
        validationIssues.length
          ? e(
              "ul",
              { className: "fp-validation-list", "aria-label": "任务校验" },
              validationIssues.map(function (issue, index) {
                return e(
                  "li",
                  {
                    key: issue.code + "-" + index,
                    className: "fp-validation-item fp-validation-item--" + issue.level
                  },
                  issue.message
                );
              })
            )
          : null
      );
    }

    function renderSurveyTab() {
      const VT = window.VehicleTemplates;
      const platformOptions = VT ? VT.PLATFORM_OPTIONS : [];
      const MM = window.MissionModel;
      const terrainFrame =
        MM && MM.MAV_FRAME_GLOBAL_TERRAIN_ALT != null
          ? MM.MAV_FRAME_GLOBAL_TERRAIN_ALT
          : 10;
      const tableRows = [buildHomePreviewTableRow()].concat(
        missionWaypoints
          .map(function (wp, index) {
            const isSurvey =
              wp.source === "survey" || wp.source === "camera";
            const groundElev = surveyWaypointGroundElev[index];
            const isTerrainFrame = wp.frame === terrainFrame;
            return {
              key: "mwp-" + index,
              seq: index + 1,
              label:
                wp.label ||
                (MM ? MM.getDisplayTitle(wp, index) : "航点 " + (index + 1)),
              lng: wp.lng,
              lat: wp.lat,
              alt: wp.alt,
              frame: wp.frame,
              frameLabel: isTerrainFrame ? "10·AGL" : String(wp.frame != null ? wp.frame : "—"),
              agl: isTerrainFrame
                ? wp.alt
                : groundElev != null
                  ? wp.alt - groundElev
                  : null,
              amsl:
                groundElev != null
                  ? isTerrainFrame
                    ? groundElev + wp.alt
                    : wp.alt
                  : null,
              preview: false,
              isSurvey: isSurvey,
              missionIndex: index,
              canDelete: isSurvey || (!wp.locked && wp.source !== "camera")
            };
          })
          .concat(
            surveyCommitted
              ? []
              : surveyPreviewPoints.map(function (wp, previewIndex) {
                  const baseSeq = missionWaypoints.length + 1;
                  return {
                    key: "prev-" + previewIndex,
                    seq: baseSeq + previewIndex,
                    label: "测绘 " + (previewIndex + 1),
                    lng: wp.lng,
                    lat: wp.lat,
                    alt: wp.alt,
                    preview: true,
                    isSurvey: true
                  };
                })
          )
      );

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
              e("div", { className: "fp-stat-label" }, "任务航点"),
              e("div", { className: "fp-stat-value" }, String(missionWaypoints.length))
            ),
            e(
              "div",
              { className: "fp-stat" },
              e("div", { className: "fp-stat-label" }, "测绘预览"),
              e("div", { className: "fp-stat-value" }, String(surveyPreviewPoints.length))
            ),
            e(
              "div",
              { className: "fp-stat fp-stat--control" },
              e(
                "div",
                { className: "fp-stat-label-wrap" },
                e("label", { className: "fp-stat-label", htmlFor: "fp-platform" }, "机型"),
                connected
                  ? e("span", { className: "fp-stat-hint" }, "已连飞控自动判定")
                  : null
              ),
              e(
                "select",
                {
                  id: "fp-platform",
                  className: "fp-stat-select",
                  value: resolvedPlatform,
                  disabled: connected,
                  title: connected
                    ? "已连接飞控，机型由飞控参数自动判定"
                    : "未连接飞控时可手动选择机型",
                  onChange: function (event) {
                    handlePlatformChange(event.target.value);
                  }
                },
                platformOptions.map(function (opt) {
                  return e("option", { key: opt.id, value: opt.id }, opt.label);
                })
              )
            ),
            e(
              "div",
              { className: "fp-stat fp-stat--control" },
              e(
                "div",
                { className: "fp-stat-label-wrap" },
                e("label", { className: "fp-stat-label", htmlFor: "fp-survey-entry" }, "起始方向")
              ),
              e(
                "select",
                {
                  id: "fp-survey-entry",
                  className: "fp-stat-select",
                  value: settings.surveyEntryCorner,
                  onChange: function (event) {
                    handleSettingChange("surveyEntryCorner", event.target.value, true);
                  }
                },
                SURVEY_ENTRY_CORNER_OPTIONS.map(function (option) {
                  return e("option", { key: option.id, value: option.id }, option.label);
                })
              )
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
                className: "fp-btn primary",
                disabled:
                  surveyArea.length < 3 ||
                  surveyCommitted ||
                  terrainPlanning ||
                  (settings.useTerrainFollowing
                    ? !terrainPlanBlocks.length
                    : !surveyPath.length),
                onClick: handleConfirmSurveyGenerate
              },
              surveyCommitted
                ? "已生成测绘航线"
                : settings.useTerrainFollowing && terrainPlanBlocks.length
                  ? "确认生成（" + terrainPlanBlocks.length + " 块）"
                  : "确认生成测绘航线"
            ),
            settings.useTerrainFollowing
              ? e(
                  "button",
                  {
                    type: "button",
                    className: "fp-btn accent",
                    disabled: surveyArea.length < 3 || terrainPlanning,
                    onClick: handleAutoTerrainPlan
                  },
                  terrainPlanning
                    ? terrainPlanPhase === "prefetch"
                      ? "地形预取…"
                      : terrainPlanPhase === "planning"
                        ? "路径规划…"
                        : "自动规划中…"
                    : "自动规划"
                )
              : null,
            e(
              "button",
              {
                type: "button",
                className: "fp-btn",
                disabled: !surveyArea.length,
                onClick: handleClearSurvey
              },
              "清空区域"
            ),
            e(
              "button",
              {
                type: "button",
                className: "fp-btn",
                disabled: !surveyBlocks.length,
                onClick: handleDeleteLastSurveyBlock
              },
              "删除上一块区域"
            )
          ),
          surveyToast
            ? e("div", { className: "fp-toast", role: "status" }, surveyToast)
            : null,
          e(
            "div",
            { className: "fp-field-grid", style: { marginTop: "10px" } },
            e(
              "label",
              { className: "fp-check-row" },
              e("input", {
                type: "checkbox",
                checked: settings.useTerrainFollowing,
                onChange: function (event) {
                  handleSettingChange("useTerrainFollowing", event.target.checked, true);
                  if (!event.target.checked) {
                    setTerrainPlanBlocks([]);
                    setTerrainPlanIssues([]);
                  }
                }
              }),
              e("span", null, "用地形跟随规划航线（AGL / frame 10）")
            ),
            settings.useTerrainFollowing
              ? e(
                  window.React.Fragment,
                  null,
                  e(
                    "label",
                    { className: "fp-check-row" },
                    e("input", {
                      type: "checkbox",
                      checked: settings.terrainAutoPartition,
                      onChange: function (event) {
                        handleSettingChange("terrainAutoPartition", event.target.checked, true);
                      }
                    }),
                    e("span", null, "自动切块（高差超限）")
                  ),
                  e(
                    "label",
                    { className: "fp-check-row" },
                    e("input", {
                      type: "checkbox",
                      checked: settings.terrainPrefetchOnDraw,
                      onChange: function (event) {
                        handleSettingChange("terrainPrefetchOnDraw", event.target.checked, true);
                      }
                    }),
                    e("span", null, "画完测区自动预取地形")
                  ),
                  e(
                    "label",
                    { htmlFor: "fp-terrain-margin" },
                    "安全离地裕度 (m)"
                  ),
                  e("input", {
                    id: "fp-terrain-margin",
                    type: "number",
                    min: 0,
                    step: 5,
                    value: settings.terrainAgMarginM,
                    onChange: function (event) {
                      handleSettingChange("terrainAgMarginM", event.target.value, true);
                    }
                  }),
                  e(
                    "label",
                    { htmlFor: "fp-terrain-climb" },
                    "最大爬升率 (m/s)"
                  ),
                  e("input", {
                    id: "fp-terrain-climb",
                    type: "number",
                    min: 0.5,
                    step: 0.5,
                    value: settings.terrainMaxClimbRateMps,
                    onChange: function (event) {
                      handleSettingChange("terrainMaxClimbRateMps", event.target.value, true);
                    }
                  }),
                  e(
                    "label",
                    { htmlFor: "fp-terrain-relief" },
                    "切块高差上限 (m)"
                  ),
                  e("input", {
                    id: "fp-terrain-relief",
                    type: "number",
                    min: 20,
                    step: 10,
                    value: settings.terrainMaxReliefM,
                    onChange: function (event) {
                      handleSettingChange("terrainMaxReliefM", event.target.value, true);
                    }
                  })
                )
              : null,
            e(
              "label",
              { className: "fp-check-row" },
              e("input", {
                type: "checkbox",
                checked: settings.surveyHeadingAuto,
                onChange: function (event) {
                  handleSettingChange("surveyHeadingAuto", event.target.checked, true);
                }
              }),
              e(
                "span",
                null,
                settings.useTerrainFollowing
                  ? "自动优选主航向（航程 + 地形起伏）"
                  : "自动优选主航向（最短航程）"
              )
            ),
            e(
              "label",
              { htmlFor: "fp-survey-heading" },
              "主航向 (°)",
              e(
                "span",
                { className: "fp-field-hint" },
                settings.surveyHeadingAuto ? "自动" : "手动"
              )
            ),
            e("input", {
              id: "fp-survey-heading",
              type: "number",
              min: 0,
              max: 359,
              step: 1,
              disabled: settings.surveyHeadingAuto,
              value:
                settings.surveyHeadingDeg == null ? "" : String(settings.surveyHeadingDeg),
              onChange: function (event) {
                handleSettingChange("surveyHeadingDeg", event.target.value, false);
              },
              onBlur: function (event) {
                handleSettingChange("surveyHeadingDeg", event.target.value, true);
              }
            })
          ),
          settings.useTerrainFollowing
            ? (function () {
                const serviceReady =
                  terrainHealth &&
                  terrainHealth.ok &&
                  (terrainHealth.terrainReady || terrainHealth.cachedTerrainTiles > 0);
                const serviceTone = terrainHealthLoading && !terrainHealth
                  ? "pending"
                  : serviceReady
                    ? "ok"
                    : terrainHealth && terrainHealth.ok
                      ? "warn"
                      : "error";
                let serviceLabel = "检测中…";
                if (terrainHealth) {
                  if (serviceReady) {
                    serviceLabel =
                      "在线（缓存 " + (terrainHealth.cachedTerrainTiles || 0) + " 瓦片）";
                  } else if (terrainHealth.ok) {
                    serviceLabel = "在线（无地形缓存，请预取或自动规划）";
                  } else {
                    serviceLabel = "离线（请启动本地瓦片服务 :8768）";
                  }
                }
                const prefetchDisplay = formatTerrainPrefetchStatus(terrainPrefetchStatus);
                const hasTerrainPolygon = terrainSurveyPolygon.length >= 3;
                const prefetchRunning = !!(terrainPrefetchStatus && terrainPrefetchStatus.running);
                const prefetchPct =
                  terrainPrefetchStatus && terrainPrefetchStatus.total > 0
                    ? Math.min(
                        100,
                        Math.round(
                          ((terrainPrefetchStatus.done || 0) /
                            terrainPrefetchStatus.total) *
                            100
                        )
                      )
                    : prefetchRunning
                      ? 5
                      : 0;
                void terrainGridStatusRevision;
                const gridDisplay = getTerrainGridStatusLabel();
                return e(
                  "div",
                  { className: "fp-terrain-panel" },
                  e("div", { className: "fp-terrain-panel-title" }, "地形跟随状态"),
                  terrainPlanProgressMessage || terrainPlanning
                    ? e(
                        "div",
                        { className: "fp-terrain-plan-progress" },
                        terrainPlanProgressMessage || "自动规划进行中…"
                      )
                    : null,
                  e(
                    "div",
                    { className: "fp-terrain-status-row" },
                    e("span", { className: "fp-terrain-status-label" }, "高程服务"),
                    e(
                      "span",
                      {
                        className:
                          "fp-terrain-status-value fp-terrain-status-value--" + serviceTone
                      },
                      serviceLabel
                    )
                  ),
                  e(
                    "div",
                    { className: "fp-terrain-status-row" },
                    e("span", { className: "fp-terrain-status-label" }, "地形预取"),
                    e(
                      "span",
                      {
                        className:
                          "fp-terrain-status-value fp-terrain-status-value--" +
                          prefetchDisplay.tone
                      },
                      prefetchDisplay.label
                    )
                  ),
                  prefetchRunning || terrainPrefetchBusy
                    ? e(
                        "div",
                        { className: "fp-terrain-prefetch-bar-wrap" },
                        e("div", {
                          className: "fp-terrain-prefetch-bar",
                          style: { width: prefetchPct + "%" },
                          role: "progressbar",
                          "aria-valuenow": prefetchPct,
                          "aria-valuemin": 0,
                          "aria-valuemax": 100
                        })
                      )
                    : null,
                  terrainPrefetchEstimate && terrainPrefetchEstimate.total
                    ? e(
                        "div",
                        { className: "fp-terrain-status-row fp-terrain-status-row--note" },
                        "预估约 " + terrainPrefetchEstimate.total + " 个 SRTM 瓦片"
                      )
                    : null,
                  hasTerrainPolygon
                    ? e(
                        "div",
                        { className: "fp-terrain-prefetch-actions" },
                        e(
                          "button",
                          {
                            type: "button",
                            className: "fp-btn fp-btn--tiny",
                            disabled: terrainPrefetchBusy || terrainPlanning,
                            onClick: handleManualTerrainPrefetch
                          },
                          terrainPrefetchBusy ? "预取中…" : "立即预取测区"
                        ),
                        prefetchRunning
                          ? e(
                              "button",
                              {
                                type: "button",
                                className: "fp-btn fp-btn--tiny",
                                onClick: handleCancelTerrainPrefetch
                              },
                              "停止"
                            )
                          : null
                      )
                    : null,
                  e(
                    "div",
                    { className: "fp-terrain-status-row" },
                    e("span", { className: "fp-terrain-status-label" }, "TERRAIN_ENABLE"),
                    e(
                      "span",
                      {
                        className:
                          "fp-terrain-status-value fp-terrain-status-value--" +
                          terrainFcEnableStatus.tone
                      },
                      terrainFcEnableStatus.label
                    )
                  ),
                  e(
                    "div",
                    { className: "fp-terrain-status-row" },
                    e("span", { className: "fp-terrain-status-label" }, "TERRAIN_DATA"),
                    e(
                      "span",
                      {
                        className:
                          "fp-terrain-status-value fp-terrain-status-value--" + gridDisplay.tone
                      },
                      gridDisplay.label
                    )
                  ),
                  hasTerrainPolygon
                    ? surveyAreaStatsLoading
                      ? e(
                          "div",
                          { className: "fp-terrain-status-row fp-terrain-status-row--note" },
                          terrainSurveyFromCommitted
                            ? "已确认测区高程统计计算中…"
                            : "测区高程统计计算中…"
                        )
                      : surveyAreaTerrainStats &&
                          surveyAreaTerrainStats.min != null &&
                          surveyAreaTerrainStats.max != null
                        ? e(
                            "div",
                            { className: "fp-terrain-status-row fp-terrain-status-row--note" },
                            (terrainSurveyFromCommitted ? "已确认测区 " : "测区 ") +
                              "高程 " +
                              Math.round(surveyAreaTerrainStats.min) +
                              "–" +
                              Math.round(surveyAreaTerrainStats.max) +
                              " m，高差约 " +
                              Math.round(surveyAreaTerrainStats.relief || 0) +
                              " m"
                          )
                        : serviceReady
                          ? e(
                              "div",
                              { className: "fp-terrain-status-row fp-terrain-status-row--note" },
                              terrainSurveyFromCommitted
                                ? "已确认测区暂无高程样本（请检查测区范围）。"
                                : "暂无高程样本（请检查测区范围）。"
                            )
                          : null
                    : e(
                        "div",
                        { className: "fp-terrain-hint" },
                        "请先绘制测区多边形（≥3 顶点）。"
                      ),
                  surveyArea.length >= 3 &&
                  !terrainPlanBlocks.length &&
                  !terrainPlanning &&
                  !surveyCommitted
                    ? e(
                        "div",
                        { className: "fp-terrain-hint" },
                        "测区已就绪，请点击「自动规划」预览地形航线与剖面校核。"
                      )
                    : null,
                  terrainSurveyFromCommitted && !terrainPlanBlocks.length && !terrainPlanning
                    ? e(
                        "div",
                        { className: "fp-terrain-hint" },
                        "区域已确认。若高度未按地形调整，请对下方区域点「重算」或重新自动规划。"
                      )
                    : null,
                  terrainValidationIssues.length
                    ? e(
                        "ul",
                        {
                          className: "fp-validation-list fp-terrain-validation-list",
                          "aria-label": "地形校核"
                        },
                        terrainValidationIssues.map(function (issue, index) {
                          return e(
                            "li",
                            {
                              key: issue.code + "-terrain-" + index,
                              className:
                                "fp-validation-item fp-validation-item--" + (issue.level || "warning")
                            },
                            issue.message
                          );
                        })
                      )
                    : null
                );
              })()
            : null,
          terrainPlanIssues.length
            ? e(
                "div",
                { className: "fp-validation-list", style: { marginTop: "8px" } },
                terrainPlanIssues.map(function (issue, idx) {
                  return e(
                    "div",
                    {
                      key: "tpi-" + idx,
                      className:
                        "fp-validation-item fp-validation-item--" + (issue.level || "warning")
                    },
                    issue.message
                  );
                })
              )
            : null,
          terrainPlanBlocks.length
            ? e(
                "div",
                { className: "fp-block-list", style: { marginTop: "8px" } },
                e(
                  "div",
                  { className: "fp-block-list-title" },
                  "自动规划预览 (" + terrainPlanBlocks.length + " 块)"
                ),
                terrainPlanStats
                  ? e(
                      "div",
                      { className: "fp-card-note" },
                      "高程 " +
                        (terrainPlanStats.min != null ? Math.round(terrainPlanStats.min) : "?") +
                        "–" +
                        (terrainPlanStats.max != null ? Math.round(terrainPlanStats.max) : "?") +
                        " m，高差约 " +
                        Math.round(terrainPlanStats.relief || 0) +
                        " m"
                    )
                  : null,
                terrainPlanBlocks.map(function (block, idx) {
                  const prof = block.previewProfile || [];
                  const maxClimb = (block.previewIssues || []).some(function (i) {
                    return i.level === "error";
                  });
                  const sparkline = createTerrainProfileSparklineElement(
                    e,
                    prof,
                    settings,
                    resolvedPlatform
                  );
                  const blockIssues = block.previewIssues || [];
                  return e(
                    "div",
                    { key: "tpb-" + idx, className: "fp-block-item-wrap" },
                    e(
                      "div",
                      { className: "fp-block-item" },
                      e(
                        "span",
                        null,
                        "块 " +
                          (idx + 1) +
                          " · " +
                          (block.previewPath ? block.previewPath.length : 0) +
                          " 路径点" +
                          (maxClimb ? " · 校核未通过" : "")
                      ),
                      prof.length
                        ? e(
                            "span",
                            { className: "fp-field-hint" },
                            "剖面 " + prof.length + " 点 · 红线=问题段"
                          )
                        : null
                    ),
                    sparkline
                      ? e("div", { className: "fp-block-item-sparkline" }, sparkline)
                      : null,
                    blockIssues.length
                      ? e(
                          "ul",
                          { className: "fp-terrain-block-issues" },
                          blockIssues.map(function (issue, issueIdx) {
                            return e(
                              "li",
                              {
                                key: "biss-" + idx + "-" + issueIdx,
                                className:
                                  "fp-validation-item fp-validation-item--" +
                                  (issue.level || "warning")
                              },
                              issue.message
                            );
                          })
                        )
                      : null
                  );
                }),
                e(
                  "button",
                  {
                    type: "button",
                    className: "fp-btn fp-btn--tiny",
                    style: { marginTop: "6px" },
                    onClick: handleAnalyzeTerrainPlan
                  },
                  "分析规划（LLM）"
                ),
                terrainAdvisorText
                  ? e(
                      "div",
                      { className: "fp-card-note", style: { marginTop: "6px", whiteSpace: "pre-wrap" } },
                      terrainAdvisorText
                    )
                  : null
              )
            : null,
          surveyBlocks.length
            ? e(
                "div",
                { className: "fp-block-list", style: { marginTop: "12px" } },
                e("div", { className: "fp-block-list-title" }, "已确认区域 (" + surveyBlocks.length + ")"),
                surveyBlocks.map(function (block) {
                  const prof = block.storedProfile || [];
                  const blockIssues = block.storedIssues || [];
                  const sparkline =
                    prof.length >= 2
                      ? createTerrainProfileSparklineElement(
                          e,
                          prof,
                          block.paramsSnapshot || settings,
                          resolvedPlatform
                        )
                      : null;
                  return e(
                    "div",
                    { key: block.id, className: "fp-block-item-wrap" },
                    e(
                      "div",
                      { className: "fp-block-item" },
                      e(
                        "span",
                        null,
                        "区域 " +
                          (block.order + 1) +
                          " · " +
                          (block.waypointCount || 0) +
                          " 航点" +
                          (block.terrainPlanned ? " · 地形已校核" : "")
                      ),
                      block.legacy
                        ? null
                        : e(
                            "button",
                            {
                              type: "button",
                              className: "fp-btn fp-btn--tiny",
                              disabled: terrainPlanning,
                              onClick: function () {
                                handleRecalcSurveyBlock(block.id);
                              }
                            },
                            "重算"
                          )
                    ),
                    sparkline
                      ? e("div", { className: "fp-block-item-sparkline" }, sparkline)
                      : null,
                    blockIssues.length
                      ? e(
                          "ul",
                          { className: "fp-terrain-block-issues" },
                          blockIssues.map(function (issue, issueIdx) {
                            return e(
                              "li",
                              {
                                key: "cbiss-" + block.id + "-" + issueIdx,
                                className:
                                  "fp-validation-item fp-validation-item--" +
                                  (issue.level || "warning")
                              },
                              issue.message
                            );
                          })
                        )
                      : null
                  );
                })
              )
            : null,
          e(
            "label",
            { className: "fp-check-row", style: { marginTop: "10px" } },
            e("input", {
              type: "checkbox",
              checked: appendRtl,
              onChange: function (event) {
                handleAppendRtlChange(event.target.checked);
              }
            }),
            e("span", null, "规划完成后追加 RTL 返航")
          )
        ),
        e(
          "section",
          { className: "fp-card" },
          e("h3", { className: "fp-card-title" }, "航点预览"),
          tableRows.length
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
                      e("th", { scope: "col", className: "fp-survey-wp-col-seq" }, "序号"),
                      e("th", { scope: "col" }, "航点"),
                      e("th", { scope: "col" }, "经度"),
                      e("th", { scope: "col" }, "纬度"),
                      settings.useTerrainFollowing
                        ? e("th", { scope: "col" }, "帧")
                        : null,
                      e("th", { scope: "col" }, settings.useTerrainFollowing ? "AGL(m)" : "高度"),
                      settings.useTerrainFollowing
                        ? e("th", { scope: "col" }, "AMSL(m)")
                        : null,
                      e("th", { scope: "col", className: "fp-wp-col-delete" }, "")
                    )
                  ),
                  e(
                    "tbody",
                    null,
                    tableRows.map(function (waypoint) {
                      const rowClass = waypoint.isHome
                        ? "fp-survey-wp-row--home"
                        : waypoint.isSurvey
                          ? "fp-survey-wp-row--survey"
                          : waypoint.preview
                            ? "fp-survey-wp-row--preview"
                            : "";
                      const aglDisplay =
                        waypoint.agl != null && Number.isFinite(waypoint.agl)
                          ? String(Math.round(waypoint.agl))
                          : waypoint.isHome || !waypoint.isSurvey
                            ? "—"
                            : String(Math.round(Number(waypoint.alt) || 0));
                      const amslDisplay =
                        waypoint.amsl != null && Number.isFinite(waypoint.amsl)
                          ? String(Math.round(waypoint.amsl))
                          : "—";
                      return e(
                        "tr",
                        {
                          key: waypoint.key,
                          className: rowClass
                        },
                        e(
                          "td",
                          { className: "fp-survey-wp-seq fp-survey-wp-num" },
                          String(waypoint.seq)
                        ),
                        e("th", { scope: "row" }, waypoint.label),
                        e("td", { className: "fp-survey-wp-num" }, round(waypoint.lng, 6).toFixed(6)),
                        e("td", { className: "fp-survey-wp-num" }, round(waypoint.lat, 6).toFixed(6)),
                        settings.useTerrainFollowing
                          ? e(
                              "td",
                              { className: "fp-survey-wp-num" },
                              waypoint.frameLabel || "—"
                            )
                          : null,
                        e(
                          "td",
                          { className: "fp-survey-wp-num" },
                          settings.useTerrainFollowing
                            ? aglDisplay
                            : String(Math.round(Number(waypoint.alt) || 0))
                        ),
                        settings.useTerrainFollowing
                          ? e("td", { className: "fp-survey-wp-num" }, amslDisplay)
                          : null,
                        e(
                          "td",
                          { className: "fp-wp-col-delete" },
                          waypoint.preview
                            ? null
                            : waypoint.canDelete
                              ? e(
                                  "button",
                                  {
                                    type: "button",
                                    className: "fp-wp-delete-btn",
                                    title: "删除航点 " + waypoint.seq,
                                    "aria-label": "删除航点 " + waypoint.seq,
                                    onClick: function () {
                                      handleDeletePreviewWaypoint(waypoint.missionIndex);
                                    }
                                  },
                                  "×"
                                )
                              : e(
                                  "span",
                                  { className: "fp-wp-delete-placeholder", "aria-hidden": true },
                                  "—"
                                )
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
      const cameraTriggerSpacing = round(
        window.SurveyPlanner && window.SurveyPlanner.computeCameraTriggerDistanceMeters
          ? window.SurveyPlanner.computeCameraTriggerDistanceMeters(
              settings.footprintHeightMeters || groundFootprint.heightMeters,
              settings.forwardOverlap
            )
          : groundFootprint.heightMeters * (1 - settings.forwardOverlap),
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
          ),
          e(
            "div",
            { className: "fp-stat" },
            e("div", { className: "fp-stat-label" }, "沿航向拍照间距"),
            e(
              "div",
              { className: "fp-stat-value fp-stat-value-sm" },
              cameraTriggerSpacing + " m"
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
              e("label", { htmlFor: "fp-survey-altitude" }, settings.useTerrainFollowing ? "航测高度 (AGL)" : "航测高度"),
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
              "p",
              { className: "fp-card-note fp-card-note--inline" },
              "确认生成测绘航线后，将在每个测线起点/终点后自动插入 MAVLink 206（DO_SET_CAM_TRIGG_DIST）开始/停止拍照命令；间距由航向重叠率与画幅高度计算，不在地图上显示。"
            ),
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
          e("h2", { className: "fp-sidebar-title" }, "飞行计划编辑器"),
          e("p", { className: "fp-sidebar-subtitle" }, connectionSummary + " · " + planningSummary)
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
              : renderSettingsTab(),
          renderMissionIoCard()
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
              e("strong", null, String(missionWaypoints.length))
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
              : null,
            e(
              "span",
              {
                className:
                  "fp-chip fp-chip-status " +
                  (connected ? "is-online" : "is-offline")
              },
              connected ? "串口在线" : "串口离线"
            )
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
            { className: "fp-live-panel" },
            e("div", { className: "fp-live-panel-title" }, "ArduPilot 实时状态"),
            e(
              "div",
              { className: "fp-live-grid" },
              e(
                "div",
                { className: "fp-live-item" },
                e("span", { className: "fp-live-label" }, "模式"),
                e("strong", { className: "fp-live-value" }, window.flight_mode || "UNKNOWN")
              ),
              e(
                "div",
                { className: "fp-live-item" },
                e("span", { className: "fp-live-label" }, "解锁"),
                e("strong", { className: "fp-live-value" }, window.armed ? "已解锁" : "未解锁")
              ),
              e(
                "div",
                { className: "fp-live-item" },
                e("span", { className: "fp-live-label" }, "GPS"),
                e("strong", { className: "fp-live-value" }, "Fix " + gpsFix)
              ),
              e(
                "div",
                { className: "fp-live-item" },
                e("span", { className: "fp-live-label" }, "当前任务"),
                e("strong", { className: "fp-live-value" }, missionCurrent == null ? "—" : String(missionCurrent))
              ),
              e(
                "div",
                { className: "fp-live-item" },
                e("span", { className: "fp-live-label" }, "高度"),
                e("strong", { className: "fp-live-value" }, liveAltitude == null ? "—" : liveAltitude + " m")
              ),
              e(
                "div",
                { className: "fp-live-item" },
                e("span", { className: "fp-live-label" }, "地速"),
                e("strong", { className: "fp-live-value" }, liveGroundspeed == null ? "—" : liveGroundspeed + " m/s")
              )
            )
          ),
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

    if (window._currentMainView && window._currentMainView !== "flight-plan") {
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

  window.addEventListener("gcs:main-view-changed", function (ev) {
    if (ev && ev.detail && ev.detail.name === "flight-plan") {
      mountFlightPlanEditor();
    }
  });
})();
