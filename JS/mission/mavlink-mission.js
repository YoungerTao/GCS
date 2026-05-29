(function () {
  const MM = window.MissionModel;

  const MAV_MISSION_ACCEPTED = 0;
  const MAV_MISSION_TYPE_MISSION = 0;

  function i32bytes(v) {
    const n = Math.round(Number(v));
    return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
  }

  function u32bytes(v) {
    const n = Number(v) >>> 0;
    return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
  }

  function f32bytes(v) {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, Number(v), true);
    return Array.from(new Uint8Array(buf));
  }

  function u16bytes(v) {
    const n = Number(v) & 0xffff;
    return [n & 0xff, (n >> 8) & 0xff];
  }

  function targetIds() {
    const sys = window.fcSysid || window.sysid || 1;
    let comp = window.fcCompid;
    if (typeof comp !== "number" || comp < 0 || comp > 255) {
      comp = window.compid;
    }
    if (typeof comp !== "number" || comp < 0 || comp > 255) {
      comp = 1;
    }
    return { sys: sys, comp: comp };
  }

  function missionCompCandidates() {
    const base = targetIds();
    const list = [base.comp, 0, 1];
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (out.indexOf(c) === -1) {
        out.push(c);
      }
    }
    return out;
  }

  function missionPack() {
    return window.MavlinkMissionPack;
  }

  async function sendMissionItemForRequest(item, requestMsgId) {
    const MP = missionPack();
    if (!MP) {
      throw new Error("MavlinkMissionPack 未加载");
    }
    if (requestMsgId === 40) {
      await window.sendMavlinkV2(39, MP.packMissionItem(item), 254);
      return;
    }
    await window.sendMavlinkV2(73, MP.packMissionItemInt(item), 38);
  }

  function waypointToMissionItem(wp, seq, tOverride) {
    const t = tOverride || targetIds();
    const lat = Math.round(Number(wp.lat) * 1e7);
    const lng = Math.round(Number(wp.lng) * 1e7);
    const alt = Number(wp.alt) || 0;
  const cmd = Number(wp.command) || MM.MAV_CMD.NAV_WAYPOINT;
    const frame = wp.frame != null ? wp.frame : MM.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT;
    return {
      target_system: t.sys,
      target_component: t.comp,
      seq: seq,
      frame: frame,
      command: cmd,
      current: 0,
      autocontinue: 1,
      param1: Number(wp.param1) || 0,
      param2: Number(wp.param2) || 0,
      param3: Number(wp.param3) || 0,
      param4: Number(wp.param4) || 0,
      x: lat,
      y: lng,
      z: alt,
      mission_type: MAV_MISSION_TYPE_MISSION
    };
  }

  function parseMissionItemInt(payload) {
    const MP = missionPack();
    if (!MP) {
      return null;
    }
    const item = MP.parseMissionItemInt(
      payload instanceof Uint8Array ? payload : new Uint8Array(payload)
    );
    if (!item) {
      return null;
    }
    return {
      seq: item.seq,
      frame: item.frame,
      command: item.command,
      current: item.current,
      autocontinue: item.autocontinue,
      param1: item.param1,
      param2: item.param2,
      param3: item.param3,
      param4: item.param4,
      x: item.x / 1e7,
      y: item.y / 1e7,
      z: item.z,
      mission_type: item.mission_type
    };
  }

  function parseMissionItem(payload) {
    const MP = missionPack();
    if (!MP || typeof MP.parseMissionItem !== "function") {
      return null;
    }
    const item = MP.parseMissionItem(
      payload instanceof Uint8Array ? payload : new Uint8Array(payload)
    );
    if (!item) {
      return null;
    }
    return {
      seq: item.seq,
      frame: item.frame,
      command: item.command,
      current: item.current,
      autocontinue: item.autocontinue,
      param1: item.param1,
      param2: item.param2,
      param3: item.param3,
      param4: item.param4,
      x: item.x / 1e7,
      y: item.y / 1e7,
      z: item.z,
      mission_type: item.mission_type
    };
  }

  function missionItemToWaypoint(item) {
    const cmd = item.command;
    const isCameraCmd =
      cmd === MM.MAV_CMD.DO_SET_CAM_TRIGG_DIST ||
      cmd === MM.MAV_CMD.IMAGE_START_CAPTURE ||
      cmd === MM.MAV_CMD.IMAGE_STOP_CAPTURE;
    return MM.createWaypoint({
      command: cmd,
      frame: item.frame,
      param1: item.param1,
      param2: item.param2,
      param3: item.param3,
      param4: item.param4,
      lat: item.x,
      lng: item.y,
      alt: item.z,
      label: isCameraCmd
        ? Number(item.param1) > 0
          ? "开始拍照"
          : "停止拍照"
        : MM.getCommandLabel(cmd),
      source: isCameraCmd ? "camera" : "fc",
      mapVisible: !isCameraCmd
    });
  }

  function resetMissionSession() {
    window._missionTransfer = null;
  }

  function missionAckMessage(code) {
    const names = {
      1: "不支持的任务协议",
      2: "任务项过多",
      3: "任务被拒绝",
      4: "任务序号超出范围",
      5: "任务参数无效",
      6: "任务未收到请求",
      7: "任务已取消",
      8: "任务操作重复",
      9: "任务操作超时",
      10: "任务操作失败",
      11: "任务操作被取消",
      12: "任务操作不支持",
      13: "任务操作无效",
      14: "任务操作被拒绝",
      15: "任务操作延迟"
    };
    const label = names[code];
    return label ? label + " (type=" + code + ")" : "MISSION_ACK type=" + code;
  }

  function missionIoActive() {
    return (
      window._missionUploadActive === true ||
      (window._missionTransfer &&
        (window._missionTransfer.mode === "upload" || window._missionTransfer.mode === "download"))
    );
  }

  function waitMissionEvent(predicate, timeoutMs, timeoutMessage) {
    const pollMs = missionIoActive() ? 8 : 40;
    return new Promise(function (resolve, reject) {
      const deadline = Date.now() + (timeoutMs || 15000);
      function tick() {
        const s = window._missionTransfer;
        if (s && s.error) {
          reject(new Error(s.error));
          return;
        }
        const lastRx = window._lastMavlinkRxMs;
        if (lastRx && Date.now() - lastRx > 6000) {
          reject(
            new Error(
              "串口超过 6 秒无 MAVLink 数据（读循环可能已中断，请断开重连并检查波特率）"
            )
          );
          return;
        }
        if (s && predicate(s)) {
          resolve(s);
          return;
        }
        if (Date.now() > deadline) {
          reject(new Error(timeoutMessage || "任务传输超时"));
          return;
        }
        setTimeout(tick, pollMs);
      }
      tick();
    });
  }

  function waitMissionRequestSeq(seq, timeoutMs) {
    return waitMissionEvent(
      function (s) {
        return s.requestedSeq === seq;
      },
      timeoutMs,
      "等待飞控请求航点 " +
        seq +
        " 超时（请确认串口已连接、波特率匹配，且控制台无 Break/CRC 刷屏）"
    );
  }

  async function sendMissionCount(count, t) {
    const MP = missionPack();
    if (!MP) {
      throw new Error("MavlinkMissionPack 未加载");
    }
    const payloadCount = MP.packMissionCount(
      t.sys,
      t.comp,
      count,
      MAV_MISSION_TYPE_MISSION
    );
    await window.sendMavlinkV2(44, payloadCount, 221);
  }

  async function sendMissionRequestList(t, includeMissionType) {
    const payload = [t.sys & 0xff, t.comp & 0xff];
    if (includeMissionType) {
      payload.push(MAV_MISSION_TYPE_MISSION & 0xff);
    }
    await window.sendMavlinkV2(43, payload, 132);
  }

  async function sendMissionRequestSeq(seq, t, useInt, includeMissionType) {
    const MP = missionPack();
    if (useInt && MP && typeof MP.packMissionRequestInt === "function") {
      const reqIntPayload = MP.packMissionRequestInt(
        t.sys,
        t.comp,
        seq,
        includeMissionType ? MAV_MISSION_TYPE_MISSION : undefined
      );
      await window.sendMavlinkV2(51, reqIntPayload, 196);
      return;
    }
    const payload = [...u16bytes(seq), t.sys & 0xff, t.comp & 0xff];
    if (includeMissionType) {
      payload.push(MAV_MISSION_TYPE_MISSION & 0xff);
    }
    await window.sendMavlinkV2(40, payload, 230);
  }

  async function clearMissionOnFc(t) {
    if (!t) {
      t = targetIds();
    }
    window._missionTransfer = {
      mode: "upload",
      items: [],
      count: 0,
      expectFinalAck: true,
      ack: false,
      error: null,
      requestedSeq: null,
      requestMsgId: 51
    };
    await sendMissionCount(0, t);
    await waitMissionEvent(
      function (s) {
        return s.ack === true;
      },
      6000,
      "清空飞控任务超时"
    );
    resetMissionSession();
  }

  async function uploadMission(waypoints, onProgress) {
    if (typeof window.sendMavlinkV2 !== "function") {
      throw new Error("MAVLink 发送未就绪");
    }
    if (window._gcsConnState !== "connected") {
      throw new Error("未连接飞控");
    }
    if (!window.fcSysid && !window.sysid) {
      throw new Error("尚未收到飞控心跳，请稍候再写入任务");
    }

    let list = MM.renumberWaypoints(waypoints || []);
    if (window.ArdupilotMissionCompat && window.ArdupilotMissionCompat.expandWithHomeRow) {
      list = window.ArdupilotMissionCompat.expandWithHomeRow(list);
      if (typeof log === "function") {
        log("ℹ️ 已按 ArduPilot/MP 规范在队首插入 Home 航点（共 " + list.length + " 项）");
      }
    }
    const compCandidates = missionCompCandidates();
    const baseT = targetIds();

    window._missionUploadActive = true;
    try {
      if (window._paramLoadActive && typeof window.endParamLoadingUI === "function") {
        window.endParamLoadingUI(false, "mission-upload");
        if (typeof log === "function") {
          log("⏸ 已暂停参数加载，优先上传任务");
        }
      }

      if (window._telemetryReqTimer) {
        clearInterval(window._telemetryReqTimer);
        window._telemetryReqTimer = null;
      }

      if (typeof window.sendHeartbeat === "function") {
        try {
          await window.sendHeartbeat();
        } catch (_) { /* ignore */ }
      }

      let uploadStarted = false;
      let activeT = { sys: baseT.sys, comp: compCandidates[0] };
      let items = [];

      for (let ci = 0; ci < compCandidates.length && !uploadStarted; ci++) {
        activeT = { sys: baseT.sys, comp: compCandidates[ci] };
        items = list.map(function (wp, i) {
          return waypointToMissionItem(wp, i, activeT);
        });

        if (typeof log === "function") {
          log(
            "📤 开始上传任务 " +
              items.length +
              " 项 → 飞控 sys=" +
              activeT.sys +
              " comp=" +
              activeT.comp +
              "（候选 " +
              (ci + 1) +
              "/" +
              compCandidates.length +
              "，心跳 comp=" +
              (typeof window.fcCompid === "number" ? window.fcCompid : "?") +
              "）",
            "mission_upload_start"
          );
        }

        try {
          await clearMissionOnFc(activeT);
        } catch (clearErr) {
          if (typeof log === "function") {
            log("⚠️ 清空旧任务失败，继续上传: " + (clearErr.message || clearErr));
          }
        }

        for (let attempt = 0; attempt < 3 && !uploadStarted; attempt += 1) {
          window._missionTransfer = {
            mode: "upload",
            items: items,
            count: items.length,
            ack: false,
            expectFinalAck: false,
            error: null,
            requestedSeq: null,
            requestMsgId: 51,
            targetComp: activeT.comp
          };

          await sendMissionCount(items.length, activeT);
          await sendMissionCount(items.length, activeT);
          await new Promise(function (r) {
            setTimeout(r, 60);
          });
          if (attempt > 0 && typeof log === "function") {
            log(
              "↻ 重发 MISSION_COUNT comp=" + activeT.comp + "（第 " + (attempt + 1) + " 次）",
              "mission_count_retry"
            );
          }

          if (onProgress) {
            onProgress(0, items.length);
          }

          if (!items.length) {
            window._missionTransfer.expectFinalAck = true;
            await waitMissionEvent(
              function (s) {
                return s.ack === true;
              },
              10000,
              "飞控未确认空任务"
            );
            resetMissionSession();
            return list;
          }

          try {
            await waitMissionRequestSeq(0, attempt === 0 ? 12000 : 8000);
            uploadStarted = true;
          } catch (reqErr) {
            if (attempt >= 2 && ci >= compCandidates.length - 1) {
              throw reqErr;
            }
          }
        }
      }

      if (!uploadStarted) {
        throw new Error(
          "等待飞控请求航点 0 超时（已尝试 comp=" +
            compCandidates.join(",") +
            "；请硬刷新页面后重连，并查看是否有 CRC 错误）"
        );
      }

      for (let seq = 0; seq < items.length; seq++) {
        const transfer = window._missionTransfer;
        if (!transfer || transfer.requestedSeq !== seq) {
          await waitMissionRequestSeq(seq, 20000);
        }
        const item = items[seq];
        const reqId = window._missionTransfer.requestMsgId || 51;
        await sendMissionItemForRequest(item, reqId);
        if (onProgress) {
          onProgress(seq + 1, items.length);
        }
        if (window._missionTransfer && window._missionTransfer.requestedSeq === seq) {
          window._missionTransfer.requestedSeq = null;
        }
      }

      window._missionTransfer.expectFinalAck = true;
      await waitMissionEvent(
        function (s) {
          return s.ack === true;
        },
        25000,
        "飞控未确认任务写入完成"
      );

      if (window._missionTransfer && window._missionTransfer.error) {
        throw new Error(window._missionTransfer.error);
      }
      resetMissionSession();
      return list;
    } finally {
      window._missionUploadActive = false;
      if (window._gcsConnState === "connected" && typeof startTelemetryRequests === "function") {
        startTelemetryRequests();
      }
    }
  }

  async function downloadMission(onProgress) {
    if (typeof window.sendMavlinkV2 !== "function") {
      throw new Error("MAVLink 发送未就绪");
    }
    if (window._gcsConnState !== "connected") {
      throw new Error("未连接飞控");
    }
    const baseT = targetIds();
    const compCandidates = missionCompCandidates();
    const plans = [
      { includeMissionType: false, useInt: true },
      { includeMissionType: true, useInt: true },
      { includeMissionType: false, useInt: false },
      { includeMissionType: true, useInt: false }
    ];
    let lastError = null;

    for (let ci = 0; ci < compCandidates.length; ci++) {
      const t = { sys: baseT.sys, comp: compCandidates[ci] };

      for (let pi = 0; pi < plans.length; pi++) {
        const plan = plans[pi];
        window._missionTransfer = {
          mode: "download",
          items: [],
          count: null,
          ack: false,
          error: null,
          requestedSeq: null,
          targetComp: t.comp,
          requestMsgId: plan.useInt ? 51 : 40
        };

        if (typeof log === "function") {
          log(
            "📥 请求飞控任务列表 sys=" +
              t.sys +
              " comp=" +
              t.comp +
              " (" +
              (plan.useInt ? "REQUEST_INT" : "REQUEST") +
              (plan.includeMissionType ? " + type" : "") +
              ")",
            "mission_download_start"
          );
        }

        try {
          await sendMissionRequestList(t, plan.includeMissionType);

          await waitMissionEvent(function (s) {
            return typeof s.count === "number";
          }, 6000, "获取飞控任务数量超时");

          const count = window._missionTransfer.count;
          if (!count) {
            resetMissionSession();
            return [];
          }

          if (onProgress) {
            onProgress(0, count);
          }

          for (let seq = 0; seq < count; seq++) {
            window._missionTransfer.requestedSeq = seq;
            await sendMissionRequestSeq(seq, t, plan.useInt, plan.includeMissionType);
            await waitMissionEvent(function (s) {
              return s.items && s.items[seq];
            }, 8000, "读取航点 " + seq + " 超时");
            if (onProgress) {
              onProgress(seq + 1, count);
            }
          }

          const result = MM.renumberWaypoints(
            (window._missionTransfer.items || [])
              .filter(Boolean)
              .map(missionItemToWaypoint)
          );
          resetMissionSession();
          return result;
        } catch (err) {
          lastError = err;
          resetMissionSession();
          if (typeof log === "function") {
            log(
              "⚠️ 读取飞控任务重试 comp=" +
                t.comp +
                " / " +
                (plan.useInt ? "REQUEST_INT" : "REQUEST") +
                (plan.includeMissionType ? " + type" : "") +
                " 失败: " +
                (err && err.message ? err.message : err),
              "mission_download_retry"
            );
          }
        }
      }
    }

    throw lastError || new Error("读取飞控任务失败");
  }

  window.MavlinkMission = {
    uploadMission: uploadMission,
    downloadMission: downloadMission,
    parseMissionItemInt: parseMissionItemInt,
    parseMissionItem: parseMissionItem,
    missionItemToWaypoint: missionItemToWaypoint,
    resetMissionSession: resetMissionSession,
    missionAckMessage: missionAckMessage
  };
})();
