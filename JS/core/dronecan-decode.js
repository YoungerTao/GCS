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

  function concatBytes(chunks) {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    chunks.forEach((chunk) => {
      out.set(chunk, offset);
      offset += chunk.length;
    });
    return out;
  }

  /** UAVCAN v0：每帧最后一字节为 tail（SOT/EOT/toggle/transfer ID） */
  function stripTransport(bytes, dlc) {
    const len = Number.isFinite(Number(dlc)) && Number(dlc) > 0
      ? Math.min(bytes.length, Number(dlc))
      : bytes.length;
    if (!len) {
      return { payload: new Uint8Array(0), transport: null };
    }
    const frame = bytes.slice(0, len);
    if (frame.length < 1) {
      return { payload: frame, transport: null };
    }
    const tail = frame[frame.length - 1];
    const startOfTransfer = Boolean((tail >> 7) & 1);
    const endOfTransfer = Boolean((tail >> 6) & 1);
    const toggle = Boolean((tail >> 5) & 1);
    const transferId = tail & 0x1f;
    const transport = {
      startOfTransfer,
      endOfTransfer,
      toggle,
      transferId,
      tailByte: `0x${tail.toString(16).padStart(2, "0").toUpperCase()}`,
    };
    const payload = frame.length > 1 ? frame.slice(0, -1) : new Uint8Array(0);
    return { payload, transport };
  }

  function frameTransport(fr) {
    if (!fr?.dataHex) return null;
    return stripTransport(hexToBytes(fr.dataHex), fr.dlc).transport;
  }

  /** 在缓存帧里找最近一组 SOT→EOT、且 transfer ID 一致的多帧 */
  function findCompleteTransferWindow(sorted, anchorTs) {
    if (!sorted.length) return null;
    let best = null;
    let bestDist = Infinity;
    for (let end = sorted.length - 1; end >= 0; end -= 1) {
      const tEnd = frameTransport(sorted[end]);
      if (!tEnd?.endOfTransfer) continue;
      const tid = tEnd.transferId;
      for (let start = end; start >= 0; start -= 1) {
        const t = frameTransport(sorted[start]);
        if (t && t.transferId !== tid) break;
        if (t?.startOfTransfer) {
          const win = sorted.slice(start, end + 1);
          const dist = anchorTs != null
            ? Math.min(
                ...win.map((f) => Math.abs(Number(f.ts) - Number(anchorTs)))
              )
            : Number(sorted[end].ts) || 0;
          if (dist < bestDist) {
            bestDist = dist;
            best = win;
          }
          break;
        }
      }
    }
    return best;
  }

  function sliceAroundAnchor(sorted, anchorTs) {
    if (anchorTs == null || sorted.length < 2) return sorted;
    const idx = sorted.findIndex((f) => Number(f.ts) === Number(anchorTs));
    if (idx < 0) return sorted;
    const anchorTid = frameTransport(sorted[idx])?.transferId;
    let start = idx;
    let end = idx;
    for (let i = idx; i >= 0; i -= 1) {
      const t = frameTransport(sorted[i]);
      if (anchorTid != null && t && t.transferId !== anchorTid) break;
      start = i;
      if (t?.startOfTransfer) break;
    }
    for (let i = idx; i < sorted.length; i += 1) {
      const t = frameTransport(sorted[i]);
      if (anchorTid != null && t && t.transferId !== anchorTid) break;
      end = i;
      if (t?.endOfTransfer) break;
    }
    return sorted.slice(start, end + 1);
  }

  /**
   * 从 recentFrames 重组 UAVCAN 传输（单帧直接解码；多帧拼接后去掉 2 字节 transfer CRC）
   */
  function reassembleFromFrames(frames, opts = {}) {
    const allSorted = (Array.isArray(frames) ? frames : [])
      .filter((fr) => fr && fr.dataHex)
      .slice()
      .sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));

    let sorted = sliceAroundAnchor(allSorted, opts.anchorTs);

    if (!sorted.length) {
      return {
        payload: new Uint8Array(0),
        transport: null,
        complete: false,
        multi: false,
        singleFrame: false,
        frameCount: 0,
        sawStart: false,
      };
    }

    const chunks = [];
    let firstTransport = null;
    let lastTransport = null;
    let sawStart = false;

    for (const fr of sorted) {
      const bytes = hexToBytes(fr.dataHex);
      const { payload, transport } = stripTransport(bytes, fr.dlc);
      if (transport) {
        if (!firstTransport) firstTransport = transport;
        lastTransport = transport;
        if (transport.startOfTransfer) {
          chunks.length = 0;
          sawStart = true;
        }
        chunks.push(payload);
        if (transport.endOfTransfer) break;
      } else {
        chunks.push(payload);
      }
    }

    let merged = concatBytes(chunks);
    const singleFrame = !!(
      firstTransport
      && firstTransport.startOfTransfer
      && firstTransport.endOfTransfer
      && sorted.length === 1
    );
    const multi = !singleFrame && sorted.length > 0;
    let complete = !!lastTransport?.endOfTransfer && (singleFrame || (sawStart && chunks.length > 0));
    if (lastTransport?.endOfTransfer && !lastTransport.startOfTransfer && !sawStart) {
      complete = false;
    }

    if (multi && complete && merged.length >= 2) {
      merged = merged.slice(2);
    }

    let result = {
      payload: merged,
      transport: lastTransport || firstTransport,
      complete,
      multi,
      singleFrame,
      frameCount: sorted.length,
      sawStart,
    };

    if (!result.complete && allSorted.length > 1) {
      const win = findCompleteTransferWindow(allSorted, opts.anchorTs);
      if (win && win.length) {
        const retry = reassembleFromFrames(win, {});
        if (retry.complete) return retry;
      }
    }

    return result;
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
    if (payload.length < 7) {
      return [field("decode", "BatteryInfo 需要至少 7 字节（多帧是否已收齐？）")];
    }
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
    const tempC = temperature != null && Number.isFinite(temperature) ? temperature - 273.15 : null;
    const fields = [
      field("temperature", tempC != null ? fmtNum(tempC) : fmtNum(temperature), tempC != null ? "°C" : "K", tempC != null ? `raw ${fmtNum(temperature)} K` : ""),
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

  function readFloat32LE(bytes, offset) {
    if (offset + 3 >= bytes.length) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4);
    return view.getFloat32(0, true);
  }

  class BitReader {
    constructor(bytes) {
      this.bytes = bytes;
      this.pos = 0;
    }

    alignByte() {
      const rem = this.pos % 8;
      if (rem) this.pos += 8 - rem;
    }

    readU(bits) {
      let v = 0n;
      for (let i = 0; i < bits; i += 1) {
        const bi = this.pos + i;
        const byte = this.bytes[bi >> 3] ?? 0;
        const bit = (byte >> (bi & 7)) & 1;
        v |= BigInt(bit) << BigInt(i);
      }
      this.pos += bits;
      return v;
    }

    readI(bits) {
      const v = this.readU(bits);
      const sign = 1n << BigInt(bits - 1);
      if (v >= sign) return Number(v - (1n << BigInt(bits)));
      return Number(v);
    }

    readF32() {
      this.alignByte();
      const off = this.pos >> 3;
      const v = readFloat32LE(this.bytes, off);
      this.pos += 32;
      return v;
    }

    readF16() {
      this.alignByte();
      const off = this.pos >> 3;
      const v = readFloat16(this.bytes, off);
      this.pos += 16;
      return v;
    }
  }

  const GNSS_TIME_STD = ["NONE", "TAI", "UTC", "GPS"];
  const FIX2_STATUS = ["NO_FIX", "TIME_ONLY", "2D_FIX", "3D_FIX"];
  const FIX2_MODE = ["SINGLE", "DGPS", "RTK", "PPP"];

  function decodeFix2(payload) {
    if (payload.length < 28) {
      return [field("decode", `Fix2 需完整多帧载荷（约≥54B），当前 ${payload.length}B`)];
    }
    try {
      const r = new BitReader(payload);
      const tsUsec = r.readU(56);
      r.alignByte();
      const gnssTsUsec = r.readU(56);
      r.alignByte();
      const gnssStd = Number(r.readU(3));
      r.readU(13);
      r.alignByte();
      const leap = r.readU(8);
      r.alignByte();
      const lon1e8 = r.readI(37);
      r.alignByte();
      const lat1e8 = r.readI(37);
      r.alignByte();
      const hEllMm = r.readI(27);
      r.alignByte();
      const hMslMm = r.readI(27);
      r.alignByte();
      const vn = r.readF32();
      const ve = r.readF32();
      const vd = r.readF32();
      r.alignByte();
      const satsUsed = Number(r.readU(6));
      const fixStatus = Number(r.readU(2));
      const mode = Number(r.readU(4));
      const subMode = Number(r.readU(6));
      r.alignByte();
      const pdop = r.readF16();

      const lat = lat1e8 / 1e8;
      const lon = lon1e8 / 1e8;
      const fields = [
        field("timestamp_usec", tsUsec.toString(), "us"),
        field("gnss_timestamp_usec", gnssTsUsec.toString(), "us"),
        field("gnss_time_standard", GNSS_TIME_STD[gnssStd] ?? gnssStd),
        field("num_leap_seconds", leap === 0 ? "unknown" : leap),
        field("latitude", fmtNum(lat, 7), "°"),
        field("longitude", fmtNum(lon, 7), "°"),
        field("height_ellipsoid", fmtNum(hEllMm / 1000, 2), "m"),
        field("height_msl", fmtNum(hMslMm / 1000, 2), "m"),
        field("velocity_north", fmtNum(vn, 2), "m/s"),
        field("velocity_east", fmtNum(ve, 2), "m/s"),
        field("velocity_down", fmtNum(vd, 2), "m/s"),
        field("sats_used", satsUsed),
        field("fix_status", FIX2_STATUS[fixStatus] ?? fixStatus),
        field("mode", FIX2_MODE[mode] ?? mode),
        field("sub_mode", subMode),
        field("pdop", fmtNum(pdop, 2)),
      ];
      return fields;
    } catch (e) {
      return [
        field("decode", `Fix2 位域解析失败: ${e?.message || e}`),
        field("payload_hex", bytesToHex(payload) || "—"),
      ];
    }
  }

  function decodeGnssAuxiliary(payload) {
    if (payload.length < 12) {
      return [field("decode", `Auxiliary 载荷过短 (${payload.length}B)`)];
    }
    try {
      const r = new BitReader(payload);
      const fields = [
        field("gdop", fmtNum(r.readF16(), 2)),
        field("pdop", fmtNum(r.readF16(), 2)),
        field("hdop", fmtNum(r.readF16(), 2)),
        field("vdop", fmtNum(r.readF16(), 2)),
        field("tdop", fmtNum(r.readF16(), 2)),
        field("ndop", fmtNum(r.readF16(), 2)),
        field("edop", fmtNum(r.readF16(), 2)),
      ];
      r.alignByte();
      fields.push(field("sats_visible", Number(r.readU(7))));
      fields.push(field("sats_used", Number(r.readU(6))));
      return fields;
    } catch (e) {
      return [field("decode", `Auxiliary 解析失败: ${e?.message || e}`)];
    }
  }

  function decodeArdupilotGnssStatus(payload) {
    if (payload.length < 4) {
      return [field("decode", `GNSS Status 载荷过短 (${payload.length}B)`)];
    }
    try {
      const r = new BitReader(payload);
      const err = Number(r.readU(32));
      r.alignByte();
      const healthy = Boolean(r.readU(1));
      const status = Number(r.readU(23));
      const flags = [];
      if (status & 1) flags.push("LOGGING");
      if (status & 2) flags.push("ARMABLE");
      return [
        field("error_codes", `0x${err.toString(16).toUpperCase()}`),
        field("healthy", healthy ? "true" : "false"),
        field("status_flags", flags.length ? flags.join(", ") : status),
      ];
    } catch (e) {
      return [field("decode", `GNSS Status 解析失败: ${e?.message || e}`)];
    }
  }

  function decodeRaw(payload) {
    if (payload.length >= 54) {
      return [field("decode", "无专用解码器，以下为原始载荷（可对照 DSDL）"), field("payload_hex", bytesToHex(payload) || "—")];
    }
    return [
      field("payload_bytes", payload.length),
      field("payload_hex", bytesToHex(payload) || "—"),
    ];
  }

  const decodersByTypeId = {
    1: decodeAllocation,
    341: decodeNodeStatus,
    1061: decodeGnssAuxiliary,
    1063: decodeFix2,
    1092: decodeBatteryInfo,
    20003: decodeArdupilotGnssStatus,
    20004: decodeBatteryInfoAux,
  };

  const decodersByShortName = {
    NodeStatus: decodeNodeStatus,
    BatteryInfo: decodeBatteryInfo,
    BatteryInfoAux: decodeBatteryInfoAux,
    Allocation: decodeAllocation,
    Fix2: decodeFix2,
    Auxiliary: decodeGnssAuxiliary,
    Status: decodeArdupilotGnssStatus,
  };

  function transferStatusFields(assembly) {
    const rows = [];
    if (assembly.singleFrame) {
      rows.push(field("transfer_mode", "单帧", "", "single-frame"));
    } else if (assembly.multi) {
      rows.push(
        field(
          "transfer_mode",
          assembly.complete ? "多帧（已重组）" : "多帧（未收齐）",
          "",
          `${assembly.frameCount} frame(s)${assembly.sawStart ? "" : ", 缺首帧"}`
        )
      );
    }
    if (!assembly.complete && assembly.multi) {
      rows.push(field("decode_hint", "请在左侧展开该 CAN ID，等待收齐首帧(SOT=1)到末帧(EOT=1)后再解码", ""));
    }
    return rows;
  }

  function decodeTransfer(canId, dataHex, dlc, opts = {}) {
    const id = parseCanIdValue(canId);
    const bytes = hexToBytes(dataHex);
    const meta = global.DRONECAN_REGISTRY?.describeMessage?.(canId);
    const decodeFn = decodersByTypeId[id.dataTypeId]
      || decodersByShortName[meta?.shortName]
      || decodeRaw;

    let assembly;
    if (opts.recentFrames && opts.recentFrames.length > 0) {
      assembly = reassembleFromFrames(opts.recentFrames, { anchorTs: opts.anchorTs });
    } else {
      const single = stripTransport(bytes, dlc);
      const singleFrame = !!(single.transport?.startOfTransfer && single.transport?.endOfTransfer);
      assembly = {
        payload: single.payload,
        transport: single.transport,
        complete: singleFrame || !single.transport,
        multi: false,
        singleFrame,
        frameCount: 1,
        sawStart: !!single.transport?.startOfTransfer,
      };
    }

    const { payload, transport, complete, multi, singleFrame, frameCount } = assembly;
    let fields = [];

    if (complete && payload.length > 0) {
      fields = transferStatusFields(assembly);
      fields.push(...decodeFn(payload));
    } else if (multi && !complete) {
      fields = transferStatusFields(assembly);
      fields.push(field("partial_payload_hex", bytesToHex(payload) || "—", "", "等待同 transfer ID 的 SOT→EOT 帧"));
    } else if (payload.length > 0) {
      fields = transferStatusFields(assembly);
      fields.push(...decodeFn(payload));
    } else {
      fields = decodeRaw(payload);
    }

    return {
      canId: `0x${id.raw.toString(16).toUpperCase()}`,
      ...id,
      dlc: Number(dlc) || bytes.length,
      transport,
      complete,
      multi,
      singleFrame,
      frameCount,
      payloadHex: bytesToHex(payload),
      frameHex: bytesToHex(bytes),
      fields,
    };
  }

  global.DRONECAN_DECODE = {
    parseCanIdValue,
    stripTransport,
    reassembleFromFrames,
    decodeTransfer,
    NODE_HEALTH,
    NODE_MODE,
  };
})(typeof window !== "undefined" ? window : globalThis);
