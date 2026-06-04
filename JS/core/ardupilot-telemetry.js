/**
 * ArduPilot 遥测流控：按固件版本选择 SR0_*（<4.7）或 MAV1_*（≥4.7）及配套 MAVLink 请求方式。
 *
 * 4.7 变更摘要（ArduPilot PR #29617 / #30094 / #28894）：
 * - 流速率参数由 SRx_* 迁至 MAVx_*（USB/SERIAL0 常为 MAV1_）
 * - SERIALn_OPTIONS 流控相关位迁至 MAVn_OPTIONS
 * - REQUEST_DATA_STREAM 触发的速率不再写入参数（重启后恢复）；PARAM_SET 与 SET_MESSAGE_INTERVAL 仍有效
 */
(function () {
  const MAV_CMD_SET_MESSAGE_INTERVAL = 511;

  const DEFAULT_STREAM_HZ = {
    EXTRA1: 4,
    EXTRA2: 4,
    EXTRA3: 2,
    EXT_STAT: 2,
    POSITION: 2,
    RC_CHAN: 2,
  };

  /** 4.0+ 用 SET_MESSAGE_INTERVAL 精控的关键消息（interval 单位 µs） */
  const MESSAGE_INTERVALS_AP4 = [
    { id: 30, hz: 10, name: "ATTITUDE" },
    { id: 33, hz: 5, name: "GLOBAL_POSITION_INT" },
    { id: 24, hz: 2, name: "GPS_RAW_INT" },
    { id: 74, hz: 4, name: "VFR_HUD" },
    { id: 49, hz: 1, name: "GPS_GLOBAL_ORIGIN" },
    { id: 242, hz: 1, name: "HOME_POSITION" },
    { id: 62, hz: 4, name: "NAV_CONTROLLER_OUTPUT" },
    { id: 1, hz: 2, name: "SYS_STATUS" },
    { id: 65, hz: 2, name: "RC_CHANNELS" },
    { id: 193, hz: 1, name: "EKF_STATUS_REPORT" },
  ];

  const REQUEST_DATA_STREAMS = [
    { sid: 10, hz: 4 },
    { sid: 11, hz: 4 },
    { sid: 6, hz: 2 },
    { sid: 2, hz: 2 },
    { sid: 3, hz: 2 },
    { sid: 12, hz: 2 },
  ];

  function parseFirmwareVersion(flightSwU32) {
    if (typeof flightSwU32 !== "number" || !Number.isFinite(flightSwU32)) return null;
    const major = (flightSwU32 >>> 24) & 0xff;
    const minor = (flightSwU32 >>> 16) & 0xff;
    const patch = (flightSwU32 >>> 8) & 0xff;
    if (major === 0 && minor === 0 && patch === 0) return null;
    return { major, minor, patch, u32: flightSwU32 };
  }

  function versionAtLeast47(v) {
    if (!v) return false;
    if (v.major > 4) return true;
    if (v.major === 4 && v.minor >= 7) return true;
    return false;
  }

  function versionAtLeast40(v) {
    if (!v) return false;
    return v.major > 4 || (v.major === 4 && v.minor >= 0);
  }

  /**
   * @returns {'mav1'|'sr0'|'legacy'|'unknown'}
   */
  function detectTelemetryProfile(version) {
    const forced = typeof localStorage !== "undefined" ? localStorage.getItem("gcs.telemetryProfile") : null;
    if (forced === "mav1" || forced === "sr0" || forced === "legacy") return forced;
    if (!version) return "unknown";
    if (versionAtLeast47(version)) return "mav1";
    if (versionAtLeast40(version)) return "sr0";
    return "legacy";
  }

  function getMavlinkChannelIndex() {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem("gcs.mavlinkChannel") : null;
    const n = raw != null ? parseInt(String(raw), 10) : 0;
    return Number.isFinite(n) && n >= 0 && n <= 7 ? n : 0;
  }

  /** @returns {Record<string, number>} */
  function buildStreamRateParams(profile, channelIndex) {
    const ch = profile === "mav1" ? channelIndex + 1 : channelIndex;
    const prefix = profile === "mav1" ? `MAV${ch}_` : `SR${ch}_`;
    return {
      [`${prefix}EXTRA1`]: DEFAULT_STREAM_HZ.EXTRA1,
      [`${prefix}EXTRA2`]: DEFAULT_STREAM_HZ.EXTRA2,
      [`${prefix}EXTRA3`]: DEFAULT_STREAM_HZ.EXTRA3,
      [`${prefix}EXT_STAT`]: DEFAULT_STREAM_HZ.EXT_STAT,
      [`${prefix}POSITION`]: DEFAULT_STREAM_HZ.POSITION,
      [`${prefix}RC_CHAN`]: DEFAULT_STREAM_HZ.RC_CHAN,
    };
  }

  function profileLabel(profile) {
    if (profile === "mav1") return "ArduPilot ≥4.7（MAVx_ 参数 + SET_MESSAGE_INTERVAL）";
    if (profile === "sr0") return "ArduPilot 4.0–4.6（SRx_ + REQUEST_DATA_STREAM + SET_MESSAGE_INTERVAL）";
    if (profile === "legacy") return "ArduPilot <4.0（SRx_ + REQUEST_DATA_STREAM）";
    return "未知固件（尝试 SRx_ 与 REQUEST_DATA_STREAM）";
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function waitForFirmwareVersion(timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 4500);
    return new Promise((resolve) => {
      function check() {
        const info = window.autopilotVersionInfo;
        const v = info && parseFirmwareVersion(info.flight_sw_version);
        if (v) {
          resolve(v);
          return;
        }
        if (Date.now() >= deadline) {
          resolve(null);
          return;
        }
        setTimeout(check, 200);
      }
      check();
    });
  }

  function resolveProfileFromParams() {
    const pmap = window.params;
    if (!(pmap instanceof Map)) return null;
    const ch = getMavlinkChannelIndex();
    if (pmap.has(`MAV${ch + 1}_EXTRA1`) || pmap.has(`MAV${ch + 1}_EXTRA1`.toUpperCase())) return "mav1";
    if (pmap.has(`SR${ch}_EXTRA1`) || pmap.has(`SR${ch}_EXTRA1`.toUpperCase())) return "sr0";
    return null;
  }

  async function applyStreamRateParams(profile, channelIndex) {
    if (typeof window.sendParamSet !== "function") return false;
    const rates = buildStreamRateParams(profile, channelIndex);
    let ok = 0;
    for (const [name, value] of Object.entries(rates)) {
      try {
        await window.sendParamSet(name, value);
        ok += 1;
        await sleep(80);
      } catch (_) { /* ignore single param failure */ }
    }
    return ok > 0;
  }

  async function requestDataStreamsOnce() {
    if (typeof window.send_v2 !== "function") return;
    const ts = window.sysid || 1;
    const tc = window.compid || 1;
    for (const { sid, hz } of REQUEST_DATA_STREAMS) {
      await window.send_v2(66, [ts, tc, sid & 0xff, hz & 0xff, (hz >> 8) & 0xff, 1], 21);
      await sleep(50);
    }
  }

  async function applyMessageIntervals() {
    if (typeof window.sendCommandLong !== "function") return;
    for (const { id, hz } of MESSAGE_INTERVALS_AP4) {
      const intervalUs = Math.round(1e6 / hz);
      try {
        await window.sendCommandLong(MAV_CMD_SET_MESSAGE_INTERVAL, id, intervalUs, 0, 0, 0, 0, 0, 0);
      } catch (_) { /* ignore */ }
      await sleep(40);
    }
  }

  async function applyConnectionTelemetrySetup() {
    if (window._gcsConnState !== "connected") return;

    let version = await waitForFirmwareVersion(4500);
    let profile = detectTelemetryProfile(version);

    if (profile === "unknown") {
      const fromParams = resolveProfileFromParams();
      profile = fromParams || "sr0";
    }

    const channelIndex = getMavlinkChannelIndex();
    window._telemetryProfile = profile;
    window._telemetryFirmwareVersion = version;

    const verStr = version
      ? `${version.major}.${version.minor}.${version.patch}`
      : "未知";
    const paramKind = profile === "mav1" ? `MAV${channelIndex + 1}_*` : `SR${channelIndex}_*`;

    if (typeof log === "function") {
      log(`📡 遥测流控：固件 ${verStr} · ${profileLabel(profile)} · 写入 ${paramKind}`);
    }

    await sleep(800);
    const paramsOk = await applyStreamRateParams(profile, channelIndex);
    if (paramsOk && typeof log === "function") {
      log(`✅ 已写入流速率参数（${paramKind}）`);
    }

    if (profile === "mav1" || (version && versionAtLeast40(version))) {
      await sleep(300);
      await applyMessageIntervals();
      if (typeof log === "function") log("✅ 已发送 SET_MESSAGE_INTERVAL（单消息流控）");
    }

    if (profile !== "mav1") {
      await sleep(300);
      await requestDataStreamsOnce();
      if (typeof log === "function") log("✅ 已发送 REQUEST_DATA_STREAM（分组流控）");
    } else {
      await requestDataStreamsOnce();
      if (typeof log === "function") {
        log("ℹ️ 4.7+ 已用 MAVx_ 与 SET_MESSAGE_INTERVAL；REQUEST_DATA_STREAM 仅作兼容触发", "debug");
      }
    }
  }

  function startTelemetryMaintenance(profile) {
    if (window._telemetryReqTimer) clearInterval(window._telemetryReqTimer);
    const intervalMs = profile === "mav1" ? 45000 : 30000;
    window._telemetryReqTimer = setInterval(async () => {
      if (window._gcsConnState !== "connected") return;
      try {
        if (profile === "mav1" || (window._telemetryProfile === "mav1")) {
          await applyMessageIntervals();
        } else {
          await requestDataStreamsOnce();
        }
      } catch (e) {
        if (typeof log === "function") log(`⚠️ 周期遥测维护失败: ${e?.message || e}`);
      }
    }, intervalMs);
  }

  window.parseArdupilotFirmwareVersion = parseFirmwareVersion;
  window.detectArdupilotTelemetryProfile = detectTelemetryProfile;
  window.applyConnectionTelemetrySetup = applyConnectionTelemetrySetup;
  window.startTelemetryMaintenance = startTelemetryMaintenance;
  window.buildArdupilotStreamRateParams = buildStreamRateParams;
})();
