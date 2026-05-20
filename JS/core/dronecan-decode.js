(function initDronecanDecode(global) {
  const NODE_HEALTH = ["OK", "WARNING", "ERROR", "CRITICAL"];
  const NODE_MODE = {
    0: "OPERATIONAL",
    1: "INITIALIZATION",
    2: "MAINTENANCE",
    3: "SOFTWARE_UPDATE",
    7: "OFFLINE",
  };

  function parseCanIdValue(canId) {
    const text = String(canId || "").trim();
    const id = Number(text.startsWith("0x") || text.startsWith("0X") ? text : `0x${text}`);
    if (!Number.isFinite(id)) {
      return {
        raw: 0,
        priority: 0,
        dataTypeId: 0,
        isService: false,
        sourceNodeId: 0,
        destinationNodeId: 0,
        isRequest: false,
      };
    }
    const raw = id & 0x1fffffff;
    const sourceNodeId = raw & 0x7f;
    const isService = Boolean((raw >> 7) & 1);
    if (isService) {
      return {
        raw,
        priority: (raw >> 24) & 0x1f,
        dataTypeId: (raw >> 16) & 0xff,
        isService: true,
        sourceNodeId,
        destinationNodeId: (raw >> 8) & 0x7f,
        isRequest: Boolean((raw >> 15) & 1),
      };
    }
    return {
      raw,
      priority: (raw >> 24) & 0x1f,
      dataTypeId: (raw >> 8) & 0xffff,
      isService: false,
      sourceNodeId,
      destinationNodeId: 0,
      isRequest: false,
    };
  }

  function hexToBytes(hex) {
    const clean = String(hex || "").replace(/\s+/g, "");
    if (!clean || clean === "--") return new Uint8Array(0);
    const out = new Uint8Array(Math.floor(clean.length / 2));
    for (let i = 0; i < out.length; i += 1) {
      out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }

  function bytesToHex(bytes) {
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
  }

  function decodeFloat16(bits) {
    const sign = (bits & 0x8000) ? -1 : 1;
    const exp = (bits >> 10) & 0x1f;
    const mant = bits & 0x3ff;
    if (exp === 0) {
      if (!mant) return 0;
      return sign * (mant / 1024) * (2 ** -14);
    }
    if (exp === 31) {
      if (!mant) return sign * Infinity;
      return NaN;
    }
    return sign * (2 ** (exp - 15)) * (1 + mant / 1024);
  }

  function readFloat16(bytes, offset) {
    if (offset + 1 >= bytes.length) return null;
    const bits = bytes[offset] | (bytes[offset + 1] << 8);
    return decodeFloat16(bits);
  }

  function readUint32LE(bytes, offset) {
    if (offset + 3 >= bytes.length) return null;
    return (
      bytes[offset]
      | (bytes[offset + 1] << 8)
      | (bytes[offset + 2] << 16)
      | (bytes[offset + 3] << 24)
    ) >>> 0;
  }

  function readUint16LE(bytes, offset) {
    if (offset + 1 >= bytes.length) return null;
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  function fmtNum(value, digits = 3) {
    if (value == null || Number.isNaN(value)) return "—";
    if (!Number.isFinite(value)) return String(value);
    return Number(value).toFixed(digits).replace(/\.?0+$/, "");
  }

  function field(name, value, unit = "", note = "") {
    return { name, value: unit ? `${value} ${unit}`.trim() : String(value), note };
  }

  function stripTransport(bytes, dlc) {
    const len = Number.isFinite(Number(dlc)) && Number(dlc) > 0
      ? Math.min(bytes.length, Number(dlc))
      : bytes.length;
    if (!len) {
      return { payload: bytes, transport: null };
    }
    const frame = bytes.slice(0, len);
    const tail = frame[frame.length - 1];
    const startOfTransfer = Boolean((tail >> 7) & 1);
    const endOfTransfer = Boolean((tail >> 6) & 1);
    const toggle = Boolean((tail >> 5) & 1);
    const transferId = tail & 0x1f;
    const transport = { startOfTransfer, endOfTransfer, toggle, transferId, tailByte: `0x${tail.toString(16).padStart(2, "0").toUpperCase()}` };
    if (frame.length > 1 && startOfTransfer && endOfTransfer) {
      return { payload: frame.slice(0, -1), transport };
    }
    if (frame.length > 1 && (tail & 0xc0) === 0xc0) {
      return { payload: frame.slice(0, -1), transport: { ...transport, startOfTransfer: true, endOfTransfer: true } };
    }
    return { payload: frame, transport };
  }

  function decodeNodeStatus(payload) {
    if (payload.length < 7) {
      return [field("decode", "payload too short for NodeStatus (need 7 bytes)")];
    }
    const uptime = readUint32LE(payload, 0);
    const packed = payload[4];
    const health = packed & 0x3;
    const mode = (packed >> 2) & 0x7;
    const subMode = (packed >> 5) & 0x7;
    const vendor = readUint16LE(payload, 5);
    return [
      field("uptime_sec", uptime ?? "—", "s"),
      field("health", NODE_HEALTH[health] ?? health, "", `raw=${health}`),
      field("mode", NODE_MODE[mode] ?? `MODE_${mode}`, "", `raw=${mode}`),
      field("sub_mode", subMode),
      field("vendor_specific_status_code", vendor ?? "—", "", "uint16"),
    ];
  }

  function decodeBatteryInfo(payload) {
    const temperature = readFloat16(payload, 0);
    const voltage = readFloat16(payload, 2);
    const current = readFloat16(payload, 4);
    const avgPower = readFloat16(payload, 6);
    const remainingWh = readFloat16(payload, 8);
    const fullChargeWh = readFloat16(payload, 10);
    const hoursToFull = readFloat16(payload, 12);
    const statusFlags = payload.length >= 16 ? readUint16LE(payload, 14) : null;
    const soc = payload.length >= 18 ? payload[17] & 0x7f : null;
    const batteryId = payload.length >= 19 ? payload[18] : null;
    const fields = [
      field("temperature", fmtNum(temperature), "K"),
      field("voltage", fmtNum(voltage), "V"),
      field("current", fmtNum(current), "A"),
      field("average_power_10sec", fmtNum(avgPower), "W"),
      field("remaining_capacity_wh", fmtNum(remainingWh), "Wh"),
      field("full_charge_capacity_wh", fmtNum(fullChargeWh), "Wh"),
      field("hours_to_full_charge", fmtNum(hoursToFull), "h"),
    ];
    if (statusFlags != null) {
      fields.push(field("status_flags", `0x${statusFlags.toString(16).toUpperCase()}`));
    }
    if (soc != null) fields.push(field("state_of_charge_pct", soc, "%"));
    if (batteryId != null) fields.push(field("battery_id", batteryId));
    return fields;
  }

  function decodeBatteryInfoAux(payload) {
    const usec = payload.length >= 7
      ? (
        (BigInt(payload[0])
          | (BigInt(payload[1]) << 8n)
          | (BigInt(payload[2]) << 16n)
          | (BigInt(payload[3]) << 24n)
          | (BigInt(payload[4]) << 32n)
          | (BigInt(payload[5]) << 40n)
          | (BigInt(payload[6]) << 48n))
        & 0xffffffffffffffn
      )
      : null;
    const fields = [];
    if (usec != null) fields.push(field("timestamp.usec", usec.toString(), "us"));
    if (payload.length >= 10) {
      const cell0 = readFloat16(payload, 7);
      const cell1 = readFloat16(payload, 9);
      if (cell0 != null) fields.push(field("voltage_cell[0]", fmtNum(cell0), "V"));
      if (cell1 != null) fields.push(field("voltage_cell[1]", fmtNum(cell1), "V"));
    }
    if (payload.length >= 14) {
      fields.push(field("cycle_count", readUint16LE(payload, 11) ?? "—"));
      fields.push(field("over_discharge_count", readUint16LE(payload, 13) ?? "—"));
    }
    return fields.length ? fields : [field("decode", "partial BatteryInfoAux (see raw)")];
  }

  function decodeAllocation(payload) {
    if (!payload.length) return [field("decode", "empty payload")];
    const nodeId = payload[0] & 0x7f;
    const firstPart = Boolean((payload[0] >> 7) & 1);
    const unique = payload.slice(1);
    return [
      field("node_id", nodeId || "ANY (0)"),
      field("first_part_of_unique_id", firstPart ? "true" : "false"),
      field("unique_id", bytesToHex(unique) || "—", "", "hex"),
    ];
  }

  function decodeRaw(payload) {
    return [
      field("payload_bytes", payload.length),
      field("payload_hex", bytesToHex(payload) || "—"),
    ];
  }

  const decodersByTypeId = {
    1: decodeAllocation,
    341: decodeNodeStatus,
    1092: decodeBatteryInfo,
    20004: decodeBatteryInfoAux,
  };

  const decodersByShortName = {
    NodeStatus: decodeNodeStatus,
    BatteryInfo: decodeBatteryInfo,
    BatteryInfoAux: decodeBatteryInfoAux,
    Allocation: decodeAllocation,
  };

  function decodeTransfer(canId, dataHex, dlc) {
    const id = parseCanIdValue(canId);
    const bytes = hexToBytes(dataHex);
    const { payload, transport } = stripTransport(bytes, dlc);
    const meta = global.DRONECAN_REGISTRY?.describeMessage?.(canId);
    const decodeFn = decodersByTypeId[id.dataTypeId]
      || decodersByShortName[meta?.shortName]
      || decodeRaw;
    const fields = decodeFn(payload);
    return {
      canId: `0x${id.raw.toString(16).toUpperCase()}`,
      ...id,
      dlc: Number(dlc) || bytes.length,
      transport,
      payloadHex: bytesToHex(payload),
      frameHex: bytesToHex(bytes),
      fields,
    };
  }

  global.DRONECAN_DECODE = {
    parseCanIdValue,
    decodeTransfer,
    NODE_HEALTH,
    NODE_MODE,
  };
})(window);
