(function initDronecanRegistry(global) {
  const deviceProfiles = [
    {
      key: "ardupilot_fc",
      match(node) {
        const text = [
          node?.canonicalName,
          node?.name,
          node?.rawName,
          node?.displayName,
        ].join(" ").toLowerCase();
        const canonical = (text.match(/org\.[a-z0-9._-]+/) || [""])[0];
        return canonical === "org.ardupilot";
      },
      info: {
        name: "org.ardupilot",
        displayName: "ArduPilot Flight Controller",
        deviceHint: "Flight controller",
        hardwareVersion: "ArduPilot FC",
      },
    },
    {
      key: "cuav_can_pmu_lite",
      match(node) {
        const text = [
          node?.displayName,
          node?.name,
          node?.rawName,
          node?.lastDataHex,
          ...Object.keys(node?.frameIdCounts || {}),
          ...(node?.recentFrames || []).map((frame) => frame?.dataHex || ""),
        ].join(" ").toLowerCase();
        return text.includes("63756176")
          || text.includes("765f63616e5f70")
          || text.includes("6d755f6c697465")
          || Number(node?.nodeId) === 34;
      },
      info: {
        name: "org.cuav.can_pmu_lite",
        displayName: "CUAV CAN PMU Lite",
        deviceHint: "Power module / BEC",
        hardwareVersion: "CUAV DroneCAN PMU",
      },
    },
    {
      key: "dronecan_gnss",
      match(node) {
        const GNSS_TYPE_IDS = new Set([1060, 1061, 1062, 1063, 20002, 20003, 20005, 20006]);
        const counts = node?.frameIdCounts || {};
        for (const canId of Object.keys(counts)) {
          const id = global.DRONECAN_DECODE?.parseCanIdValue?.(canId);
          if (id && GNSS_TYPE_IDS.has(id.dataTypeId)) return true;
        }
        const text = [node?.displayName, node?.name, node?.rawName].join(" ").toLowerCase();
        return text.includes("gnss") || text.includes("gps") || text.includes("rtk");
      },
      info: {
        name: "org.uavcan.equipment.gnss",
        displayName: "DroneCAN GNSS / RTK",
        deviceHint: "GNSS receiver",
        hardwareVersion: "UAVCAN GNSS",
      },
    },
    {
      key: "dronecan_esc",
      match(node) {
        const text = [node?.displayName, node?.name, node?.rawName].join(" ").toLowerCase();
        return text.includes("esc");
      },
      info: {
        name: "org.dronecan.esc",
        displayName: "DroneCAN ESC",
        deviceHint: "ESC",
        hardwareVersion: "DroneCAN ESC",
      },
    },
    {
      key: "dronecan_bms",
      match(node) {
        const text = [node?.displayName, node?.name, node?.rawName].join(" ").toLowerCase();
        return text.includes("battery") || text.includes("bms");
      },
      info: {
        name: "org.dronecan.bms",
        displayName: "DroneCAN Battery",
        deviceHint: "Battery / BMS",
        hardwareVersion: "DroneCAN BMS",
      },
    },
  ];

  const messageProfiles = [
    { dataTypeId: 341, shortName: "NodeStatus", fullName: "uavcan.protocol.NodeStatus", category: "Status" },
    { dataTypeId: 1, shortName: "Allocation", fullName: "uavcan.protocol.dynamic_node_id.Allocation", category: "Allocation" },
    { dataTypeId: 1092, shortName: "BatteryInfo", fullName: "uavcan.equipment.power.BatteryInfo", category: "Power" },
    { dataTypeId: 20004, shortName: "BatteryInfoAux", fullName: "ardupilot.equipment.power.BatteryInfoAux", category: "Power" },
    { canId: "0x184E270A", dataTypeId: 20007, shortName: "NodeStatus", fullName: "uavcan.protocol.NodeStatus", category: "Status" },
    { canId: "0x1804390A", shortName: "RawFrame", fullName: "raw.can.Frame", category: "Raw" },
    { canId: "0x18044C0A", shortName: "RawFrame", fullName: "raw.can.Frame", category: "Raw" },
    { canId: "0x184E200A", shortName: "RawFrame", fullName: "raw.can.Frame", category: "Raw" },
    { canId: "0x104E2D0A", shortName: "RawFrame", fullName: "raw.can.Frame", category: "Raw" },
    { canId: "0x1F01550A", shortName: "RawFrame", fullName: "raw.can.Frame", category: "Raw" },
    { canId: "0x18044422", dataTypeId: 1092, shortName: "BatteryInfo", fullName: "uavcan.equipment.power.BatteryInfo", category: "Power" },
    { canId: "0x10010AA2", shortName: "GetNodeInfo", fullName: "uavcan.protocol.GetNodeInfo", category: "Service", isService: true },
    { canId: "0x18015522", dataTypeId: 20004, shortName: "BatteryInfoAux", fullName: "ardupilot.equipment.power.BatteryInfoAux", category: "Power" },
    { canId: "0x1001A28A", dataTypeId: 1, shortName: "Allocation", fullName: "uavcan.protocol.dynamic_node_id.Allocation", category: "Allocation" },
  ];

  function normalizeCanId(canId) {
    const text = String(canId || "").trim().toUpperCase();
    return text.startsWith("0X") ? text : `0X${text.replace(/^0X/, "")}`;
  }

  function matchDevice(node) {
    for (const profile of deviceProfiles) {
      if (profile.match(node)) {
        return { profile: profile.key, ...profile.info };
      }
    }
    return {
      profile: "unknown",
      name: node?.name || `node-${node?.nodeId ?? 0}`,
      displayName: node?.displayName || `Node ${node?.nodeId ?? 0}`,
      deviceHint: node?.deviceHint || "Unknown",
      hardwareVersion: node?.hardwareVersion || "DroneCAN",
    };
  }

  function describeMessage(canId) {
    const key = normalizeCanId(canId);
    const parsed = global.DRONECAN_DECODE?.parseCanIdValue?.(key) || {};
    const byCanId = messageProfiles.find((item) => item.canId && normalizeCanId(item.canId) === key);
    const standard = global.DRONECAN_STANDARD_TYPES?.lookup?.(
      parsed.dataTypeId,
      parsed.isService,
    );
    const fallback = {
      shortName: "RawFrame",
      fullName: parsed.isService
        ? `uavcan.service.${parsed.dataTypeId}`
        : `unknown.message.${parsed.dataTypeId ?? "?"}`,
      category: parsed.isService ? "Service" : "Unknown",
      dataTypeId: parsed.dataTypeId ?? null,
    };

    const shortName = standard?.shortName || byCanId?.shortName || fallback.shortName;
    const fullName = standard?.fullName || byCanId?.fullName || fallback.fullName;
    const category = standard?.category || byCanId?.category || fallback.category;
    const labelZh = global.DRONECAN_LABELS_ZH?.lookup?.(shortName, fullName) || "";

    return {
      canId: key,
      shortName,
      fullName,
      category,
      labelZh,
      dataTypeId: parsed.dataTypeId ?? byCanId?.dataTypeId ?? null,
      priority: parsed.priority,
      sourceNodeId: parsed.sourceNodeId,
      destinationNodeId: parsed.destinationNodeId,
      isService: parsed.isService,
      isRequest: parsed.isRequest,
    };
  }

  global.DRONECAN_REGISTRY = {
    deviceProfiles,
    messageProfiles,
    matchDevice,
    describeMessage,
  };
})(window);
