/**
 * 浏览器控制台调试：window.gcsMissionDebug(true) 开启，false 关闭
 */
(function () {
  const MISSION_IDS = new Set([40, 51, 47, 44, 43, 73, 39, 38, 45]);

  window.gcsMissionDebug = function gcsMissionDebug(enable) {
    if (!enable) {
      window._gcsMissionDebug = false;
      if (window._gcsMissionDebugTimer) {
        clearInterval(window._gcsMissionDebugTimer);
        window._gcsMissionDebugTimer = null;
      }
      console.log("[gcsMissionDebug] 已关闭");
      return;
    }

    window._gcsMissionDebug = true;
    window._gcsRxStats = { v1: 0, v2: 0, byId: {}, crcFail: 0 };
    window._gcsMissionDebugTimer = setInterval(function () {
      const s = window._gcsRxStats;
      const mission = {};
      MISSION_IDS.forEach(function (id) {
        if (s.byId[id]) {
          mission[id] = s.byId[id];
        }
      });
      console.log("[gcsMissionDebug]", {
        connected: window._gcsConnState,
        fcSysid: window.fcSysid,
        fcCompid: window.fcCompid,
        transfer: window._missionTransfer,
        uploadActive: window._missionUploadActive,
        crcErrors: window._mavlinkCrcErrors,
        rxV1: s.v1,
        rxV2: s.v2,
        missionRx: mission,
        crcFail: s.crcFail
      });
    }, 2000);

    console.log(
      "[gcsMissionDebug] 已开启（每 2s 打印统计）。关闭: gcsMissionDebug(false)\n" +
        "手动探针: gcsMissionProbe(3)"
    );
  };

  async function probeClearMission(sys, comp) {
    const MP = window.MavlinkMissionPack;
    if (!MP) {
      return;
    }
    window._missionTransfer = {
      mode: "upload",
      count: 0,
      items: [],
      ack: false,
      expectFinalAck: true,
      error: null,
      requestedSeq: null,
      requestMsgId: 51
    };
    const clearPayload = MP.packMissionCount(sys, comp, 0, 0);
    for (let k = 0; k < 2; k++) {
      await window.sendMavlinkV2(44, clearPayload, 221);
      await new Promise(function (r) {
        setTimeout(r, 200);
      });
    }
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) {
      if (window._missionTransfer.ack) {
        return true;
      }
      if (window._missionTransfer.error) {
        console.warn("[gcsMissionProbe] clear error", window._missionTransfer.error);
        return false;
      }
      await new Promise(function (r) {
        setTimeout(r, 60);
      });
    }
    console.warn("[gcsMissionProbe] clear timeout (继续尝试上传)");
    return false;
  }

  window.gcsMissionProbe = async function gcsMissionProbe(count) {
    const n = count || 3;
    if (window._gcsConnState !== "connected") {
      console.warn("未连接飞控");
      return "未连接";
    }
    const MP = window.MavlinkMissionPack;
    if (!MP) {
      console.warn("MavlinkMissionPack 未加载，请硬刷新页面");
      return "pack 未加载";
    }
    const sys = window.fcSysid || 1;
    const comps = [];
    [window.fcCompid, 0, 1].forEach(function (c) {
      if (typeof c === "number" && comps.indexOf(c) === -1) {
        comps.push(c);
      }
    });

    if (window._paramLoadActive && typeof window.endParamLoadingUI === "function") {
      window.endParamLoadingUI(false, "mission-probe");
    }
    if (window._telemetryReqTimer) {
      clearInterval(window._telemetryReqTimer);
      window._telemetryReqTimer = null;
    }

    window._missionUploadActive = true;

    if (typeof window.sendHeartbeat === "function") {
      try {
        await window.sendHeartbeat();
      } catch (_) { /* ignore */ }
    }

    for (let i = 0; i < comps.length; i++) {
      const comp = comps[i];
      console.log("[gcsMissionProbe] clear → sys=" + sys + " comp=" + comp);
      await probeClearMission(sys, comp);

      window._missionTransfer = {
        mode: "upload",
        count: n,
        items: [],
        ack: false,
        expectFinalAck: false,
        error: null,
        requestedSeq: null,
        requestMsgId: 51
      };

      const payload = MP.packMissionCount(sys, comp, n, 0);
      console.log("[gcsMissionProbe] COUNT=" + n + " payload=" + payload.map(function (b) {
        return ("0" + b.toString(16)).slice(-2);
      }).join(" "));
      for (let pulse = 0; pulse < 3; pulse++) {
        await window.sendMavlinkV2(44, payload, 221);
        await new Promise(function (r) {
          setTimeout(r, 120);
        });
      }

      const t0 = Date.now();
      while (Date.now() - t0 < 12000) {
        if (window._missionTransfer.requestedSeq === 0) {
          window._missionUploadActive = false;
          if (typeof startTelemetryRequests === "function") {
            startTelemetryRequests();
          }
          console.log("[gcsMissionProbe] OK comp=" + comp, window._missionTransfer);
          return "OK comp=" + comp;
        }
        if (window._missionTransfer.error) {
          console.warn("[gcsMissionProbe] error", window._missionTransfer.error);
          break;
        }
        await new Promise(function (r) {
          setTimeout(r, 80);
        });
      }
      window._missionTransfer.requestedSeq = null;
      window._missionTransfer.error = null;
    }

    window._missionUploadActive = false;
    if (typeof startTelemetryRequests === "function") {
      startTelemetryRequests();
    }
    console.warn("[gcsMissionProbe] 全部超时");
    return "全部超时";
  };

  window.gcsMissionStatus = function gcsMissionStatus() {
    const s = window._gcsRxStats || { byId: {} };
    return {
      connected: window._gcsConnState,
      fcSysid: window.fcSysid,
      fcCompid: window.fcCompid,
      crcErrors: window._mavlinkCrcErrors,
      crcWarned: window._crcWarnedByMsg,
      transfer: window._missionTransfer,
      missionRx: MISSION_IDS
        ? Array.from(MISSION_IDS).map(function (id) {
            return { id: id, count: s.byId[id] || 0 };
          })
        : []
    };
  };
})();
