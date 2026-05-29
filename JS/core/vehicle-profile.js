/**
 * Shared vehicle / firmware profile detection (Copter / Plane / VTOL).
 * Used by overview preflight, safety RTL card, and other UI that branches on airframe.
 */
(function initVehicleProfile() {
  const MAV_TYPE_FIXED_WING = 1;
  const MAV_TYPE_VTOL_TYPES = new Set([19, 20, 21]);
  const MAV_TYPE_COPTER_TYPES = new Set([2, 3, 4, 7, 8, 9, 12, 13, 14, 15, 16, 17]);

  function frameParamKeys() {
    const p = window.params;
    if (!(p instanceof Map)) return null;
    if (p.has("FRAME_CLASS") && p.has("FRAME_TYPE")) {
      return { classKey: "FRAME_CLASS", typeKey: "FRAME_TYPE" };
    }
    if (p.has("Q_FRAME_CLASS") && p.has("Q_FRAME_TYPE")) {
      return { classKey: "Q_FRAME_CLASS", typeKey: "Q_FRAME_TYPE" };
    }
    return null;
  }

  function heartbeatFirmwareKind() {
    const t = Math.round(Number(window.fcMavType));
    if (t === MAV_TYPE_FIXED_WING) return "plane";
    if (MAV_TYPE_VTOL_TYPES.has(t)) return "vtol";
    if (MAV_TYPE_COPTER_TYPES.has(t)) return "copter";
    return "";
  }

  /**
   * @returns {{ kind: "copter"|"plane"|"vtol"|"unknown", hasFrame: boolean, hasQ: boolean, fwText: string }}
   */
  function detectFirmwareProfile() {
    const fwText = (document.getElementById("ov-fw-version")?.textContent || "").trim();
    const p = window.params instanceof Map ? window.params : null;
    const hasFrame = !!(p && p.has("FRAME_CLASS") && p.has("FRAME_TYPE"));
    const hasQ = !!(p && p.has("Q_FRAME_CLASS") && p.has("Q_FRAME_TYPE"));
    const fwLow = fwText.toLowerCase();
    const fwPlane = /plane|arduplane/.test(fwLow);
    const fwCopter = /copter|arducopter/.test(fwLow);
    const fwVtol = /vtol|quadplane/.test(fwLow);
    const hbKind = heartbeatFirmwareKind();

    if (hbKind === "vtol" || hasQ || fwVtol) {
      return { kind: "vtol", hasFrame, hasQ, fwText };
    }
    if (hbKind === "plane" || (fwPlane && !fwVtol)) {
      return { kind: "plane", hasFrame, hasQ, fwText };
    }
    if (hbKind === "copter" || fwCopter || (hasFrame && !hasQ)) {
      return { kind: "copter", hasFrame, hasQ, fwText };
    }
    return { kind: "unknown", hasFrame, hasQ, fwText };
  }

  window.gcsDetectFirmwareProfile = detectFirmwareProfile;
  window.gcsHeartbeatFirmwareKind = heartbeatFirmwareKind;
  window.gcsFrameParamKeys = frameParamKeys;
})();
