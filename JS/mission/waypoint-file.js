(function () {
  const MM = window.MissionModel;
  if (!MM) {
    return;
  }

  const WPL_VERSION = "QGC WPL 110";

  function commandToRow(wp, seq) {
    const frame = wp.frame != null ? wp.frame : MM.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT;
    const p1 = Number(wp.param1) || 0;
    const p2 = Number(wp.param2) || 0;
    const p3 = Number(wp.param3) || 0;
    const p4 = Number(wp.param4) || 0;
    const lat = Number(wp.lat) || 0;
    const lng = Number(wp.lng) || 0;
    const alt = Number(wp.alt) != null && Number.isFinite(Number(wp.alt)) ? Number(wp.alt) : 0;
    const cmd = Number(wp.command) || MM.MAV_CMD.NAV_WAYPOINT;
    const AP = window.ArdupilotMissionCompat;
    const isHome = AP && AP.isHomeRow && AP.isHomeRow(wp, seq);
    const current = isHome || seq === 0 ? 1 : 0;
    return [
      seq,
      current,
      frame,
      cmd,
      p1,
      p2,
      p3,
      p4,
      lat,
      lng,
      alt,
      1
    ].join("\t");
  }

  function serializeWaypointFile(waypoints, platform) {
    const lines = [WPL_VERSION];
    let list = waypoints || [];
    const FWP = window.FixedWingParams;
    if (FWP && FWP.normalizeWaypointsForPlatform && platform) {
      list = FWP.normalizeWaypointsForPlatform(list, platform);
    }
    list = MM.renumberWaypoints(list);
    if (window.ArdupilotMissionCompat && window.ArdupilotMissionCompat.expandWithHomeRow) {
      list = window.ArdupilotMissionCompat.expandWithHomeRow(list);
    }
    list.forEach(function (wp, index) {
      lines.push(commandToRow(wp, index));
    });
    return lines.join("\n") + "\n";
  }

  function parseWaypointFile(text) {
    const lines = String(text || "")
      .split(/\r?\n/)
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);
    if (!lines.length) {
      throw new Error("空文件");
    }
    if (!/^QGC\s+WPL\s+\d+/i.test(lines[0])) {
      throw new Error("不是 QGC WPL 航点文件");
    }
    const waypoints = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(/\s+/);
      if (parts.length < 12) {
        continue;
      }
      const cmd = Number(parts[3]);
      const isCameraCmd =
        cmd === MM.MAV_CMD.DO_SET_CAM_TRIGG_DIST ||
        cmd === MM.MAV_CMD.IMAGE_START_CAPTURE ||
        cmd === MM.MAV_CMD.IMAGE_STOP_CAPTURE;
      waypoints.push(
        MM.createWaypoint({
          seq: waypoints.length,
          frame: Number(parts[2]) || MM.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
          command: cmd,
          param1: Number(parts[4]) || 0,
          param2: Number(parts[5]) || 0,
          param3: Number(parts[6]) || 0,
          param4: Number(parts[7]) || 0,
          lat: Number(parts[8]) || 0,
          lng: Number(parts[9]) || 0,
          alt: Number(parts[10]) || 0,
          label: isCameraCmd
            ? Number(parts[4]) > 0
              ? "开始拍照"
              : "停止拍照"
            : MM.getCommandLabel(cmd),
          source: isCameraCmd ? "camera" : "file",
          mapVisible: !isCameraCmd
        })
      );
    }
    if (window.ArdupilotMissionCompat && window.ArdupilotMissionCompat.stripHomeRowForEditor) {
      return window.ArdupilotMissionCompat.stripHomeRowForEditor(waypoints);
    }
    return MM.renumberWaypoints(waypoints);
  }

  function downloadWaypointFile(waypoints, filename, platform) {
    const text = serializeWaypointFile(waypoints, platform);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "mission.waypoints";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  window.WaypointFile = {
    serializeWaypointFile: serializeWaypointFile,
    parseWaypointFile: parseWaypointFile,
    downloadWaypointFile: downloadWaypointFile
  };
})();
