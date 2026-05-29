/**
 * Map vehicle marker SVGs (line style) and platform / frame detection.
 */
(function () {
  const WARM = "#ffb74d";
  const SVG_CLS = ' class="fp-vehicle-marker-svg"';

  const MAP_MAV_TYPE_FIXED_WING = 1;
  const MAP_MAV_TYPE_VTOL_TYPES = new Set([19, 20, 21]);
  const MAP_MAV_TYPE_COPTER_TYPES = new Set([2, 3, 4, 7, 8, 9, 12, 13, 14, 15, 16, 17]);
  const MAP_MAV_TYPE_ROVER_TYPES = new Set([10, 11]);

  const MULTIROTOR_FRAME_KINDS = new Set([
    "multirotor-plus",
    "multirotor-x",
    "multirotor-v",
    "multirotor-h"
  ]);

  function isFcConnected() {
    return String(window._gcsConnState || "").toLowerCase() === "connected";
  }

  function getFrameTypeParam() {
    const params = window.params instanceof Map ? window.params : null;
    if (!params) return null;
    if (params.has("FRAME_TYPE")) return Math.round(Number(params.get("FRAME_TYPE")));
    if (params.has("Q_FRAME_TYPE")) return Math.round(Number(params.get("Q_FRAME_TYPE")));
    return null;
  }

  function multirotorKindFromFrameType(frameType) {
    const ft = Number.isFinite(frameType) ? Math.round(frameType) : 1;
    if (ft === 0) return "multirotor-plus";
    if (ft === 2) return "multirotor-v";
    if (ft === 3) return "multirotor-h";
    return "multirotor-x";
  }

  function detectMultirotorFrameKind() {
    return multirotorKindFromFrameType(getFrameTypeParam());
  }

  function detectBaseVehicleKind() {
    const mavType = Math.round(Number(window.fcMavType));
    if (mavType === MAP_MAV_TYPE_FIXED_WING) return "plane";
    if (MAP_MAV_TYPE_VTOL_TYPES.has(mavType)) return "vtol";
    if (MAP_MAV_TYPE_ROVER_TYPES.has(mavType)) return "rover";
    if (MAP_MAV_TYPE_COPTER_TYPES.has(mavType)) return "multirotor";

    const params = window.params instanceof Map ? window.params : null;
    const hasQFrame = !!(params && params.has("Q_FRAME_CLASS") && params.has("Q_FRAME_TYPE"));
    const hasFrame = !!(params && params.has("FRAME_CLASS") && params.has("FRAME_TYPE"));
    if (hasQFrame) return "vtol";
    if (hasFrame) return "multirotor";

    const fwText = String(document.getElementById("ov-fw-version")?.textContent || "").toLowerCase();
    if (/vtol|quadplane/.test(fwText)) return "vtol";
    if (/plane|arduplane/.test(fwText)) return "plane";
    if (/rover|ardurover|boat/.test(fwText)) return "rover";
    return "multirotor";
  }

  function detectVehicleMarkerKind(options) {
    const opts = options || {};
    if (opts.requireConnected !== false && !isFcConnected()) {
      return "disconnected";
    }
    const base = detectBaseVehicleKind();
    if (base === "multirotor") {
      return detectMultirotorFrameKind();
    }
    return base;
  }

  function normalizeVehicleMarkerKind(platform) {
    const p = String(platform || "multirotor");
    if (
      p === "plane" ||
      p === "vtol" ||
      p === "rover" ||
      p === "disconnected" ||
      MULTIROTOR_FRAME_KINDS.has(p)
    ) {
      return p;
    }
    if (p === "multirotor") {
      return detectMultirotorFrameKind();
    }
    return "multirotor-x";
  }

  function noseArrow() {
    return '<path d="M16 0.5 L19.5 6 L12.5 6 Z" fill="' + WARM + '"/>';
  }

  function vehicleMarkerSvg(kind) {
    const k = normalizeVehicleMarkerKind(kind);

    if (k === "disconnected") {
      return (
        "<svg" + SVG_CLS + ' viewBox="0 0 32 32" aria-hidden="true">' +
        '<circle cx="16" cy="16" r="6" fill="currentColor" stroke="#0e141b" stroke-width="1.5"/>' +
        "</svg>"
      );
    }

    if (k === "plane") {
      return (
        "<svg" + SVG_CLS + ' viewBox="0 0 800 800" aria-hidden="true">' +
        '<g transform="translate(400,430)">' +
        '<path d="M 0,-280 C 45,-280 75,-160 75,-40 L 310,60 C 325,70 310,110 280,100 L 75,20 L 75,150 L 150,220 C 160,230 145,260 120,250 L 0,190 L -120,250 C -145,260 -160,230 -150,220 L -75,150 L -75,20 L -280,100 C -310,110 -325,70 -310,60 L -75,-40 C -75,-160 -45,-280 0,-280 Z" fill="none" stroke="currentColor" stroke-width="32" stroke-linejoin="round" stroke-linecap="round"/>' +
        '<path d="M 0,-310 L 32,-248 L -32,-248 Z" fill="' + WARM + '"/>' +
        "</g>" +
        "</svg>"
      );
    }

    if (k === "multirotor-plus") {
      return (
        "<svg" + SVG_CLS + ' viewBox="0 0 32 32" aria-hidden="true">' +
        '<g stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
        '<line x1="16" y1="16" x2="16" y2="6"/><line x1="16" y1="16" x2="16" y2="26"/>' +
        '<line x1="16" y1="16" x2="6" y2="16"/><line x1="16" y1="16" x2="26" y2="16"/>' +
        "</g>" +
        '<circle cx="16" cy="26" r="3" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<circle cx="6" cy="16" r="3" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<circle cx="26" cy="16" r="3" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<circle cx="16" cy="6" r="3" fill="' + WARM + '"/>' +
        noseArrow() +
        '<circle cx="16" cy="16" r="2" fill="currentColor"/>' +
        "</svg>"
      );
    }

    if (k === "multirotor-v") {
      return (
        "<svg" + SVG_CLS + ' viewBox="0 0 32 32" aria-hidden="true">' +
        '<g stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
        '<line x1="16" y1="16" x2="6" y2="8"/><line x1="16" y1="16" x2="26" y2="8"/>' +
        '<line x1="16" y1="16" x2="11" y2="25"/><line x1="16" y1="16" x2="21" y2="25"/>' +
        "</g>" +
        '<circle cx="11" cy="25" r="3" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<circle cx="21" cy="25" r="3" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<circle cx="6" cy="8" r="3" fill="' + WARM + '"/>' +
        '<circle cx="26" cy="8" r="3" fill="' + WARM + '"/>' +
        noseArrow() +
        '<circle cx="16" cy="16" r="2" fill="currentColor"/>' +
        "</svg>"
      );
    }

    if (k === "multirotor-h") {
      return (
        "<svg" + SVG_CLS + ' viewBox="0 0 32 32" aria-hidden="true">' +
        '<g stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
        '<line x1="8" y1="7" x2="8" y2="25"/><line x1="24" y1="7" x2="24" y2="25"/>' +
        '<line x1="8" y1="16" x2="24" y2="16"/>' +
        '<line x1="8" y1="7" x2="16" y2="16"/><line x1="24" y1="7" x2="16" y2="16"/>' +
        '<line x1="8" y1="25" x2="16" y2="16"/><line x1="24" y1="25" x2="16" y2="16"/>' +
        "</g>" +
        '<circle cx="8" cy="25" r="3" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<circle cx="24" cy="25" r="3" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<circle cx="8" cy="7" r="3" fill="' + WARM + '"/>' +
        '<circle cx="24" cy="7" r="3" fill="' + WARM + '"/>' +
        noseArrow() +
        '<circle cx="16" cy="16" r="2" fill="currentColor"/>' +
        "</svg>"
      );
    }

    if (k === "multirotor-x" || k === "multirotor") {
      return (
        "<svg" + SVG_CLS + ' viewBox="0 0 32 32" aria-hidden="true">' +
        '<g stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
        '<line x1="16" y1="16" x2="7" y2="7"/><line x1="16" y1="16" x2="25" y2="7"/>' +
        '<line x1="16" y1="16" x2="7" y2="25"/><line x1="16" y1="16" x2="25" y2="25"/>' +
        "</g>" +
        '<circle cx="7" cy="25" r="3" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<circle cx="25" cy="25" r="3" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<circle cx="7" cy="7" r="3" fill="' + WARM + '"/>' +
        '<circle cx="25" cy="7" r="3" fill="' + WARM + '"/>' +
        noseArrow() +
        '<circle cx="16" cy="16" r="2" fill="currentColor"/>' +
        "</svg>"
      );
    }

    if (k === "vtol") {
      return (
        "<svg" + SVG_CLS + ' viewBox="0 0 32 32" aria-hidden="true">' +
        '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" d="M16 4 L18 12 L28 14 L18 16 L17 24 L16 20 L15 24 L14 16 L4 14 L14 12 Z"/>' +
        '<circle cx="6" cy="22" r="2.8" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
        '<circle cx="26" cy="22" r="2.8" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
        '<circle cx="8" cy="10" r="2.5" fill="' + WARM + '"/>' +
        '<circle cx="24" cy="10" r="2.5" fill="' + WARM + '"/>' +
        noseArrow() +
        "</svg>"
      );
    }

    if (k === "rover") {
      return (
        "<svg" + SVG_CLS + ' viewBox="0 0 32 32" aria-hidden="true">' +
        '<rect x="5" y="11" width="22" height="10" rx="3" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<circle cx="10" cy="24" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<circle cx="22" cy="24" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/>' +
        noseArrow() +
        "</svg>"
      );
    }

    return vehicleMarkerSvg("multirotor-x");
  }

  window.VehicleMarkerIcons = {
    isFcConnected: isFcConnected,
    detectVehicleMarkerKind: detectVehicleMarkerKind,
    detectBaseVehicleKind: detectBaseVehicleKind,
    detectMultirotorFrameKind: detectMultirotorFrameKind,
    normalizeVehicleMarkerKind: normalizeVehicleMarkerKind,
    vehicleMarkerSvg: vehicleMarkerSvg,
    WARM_HEADING_COLOR: WARM
  };
})();
