(function initDronecanGetNodeInfo(global) {
  function bitsFromBytes(bytes) {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    let out = "";
    for (let i = 0; i < arr.length; i += 1) out += arr[i].toString(2).padStart(8, "0");
    return out;
  }

  function bytesFromBits(bits) {
    let stream = String(bits || "");
    if (stream.length % 8) stream += "0".repeat(8 - (stream.length % 8));
    const out = new Uint8Array(stream.length / 8);
    for (let i = 0; i < out.length; i += 1) {
      out[i] = Number.parseInt(stream.slice(i * 8, i * 8 + 8), 2);
    }
    return out;
  }

  function leFromBeBits(bits, bitlen) {
    let stream = String(bits || "");
    if (stream.length < bitlen) throw new Error(`Not enough bits: need ${bitlen}, got ${stream.length}`);
    if (stream.length > bitlen) stream = stream.slice(stream.length - bitlen);
    const chunks = [];
    for (let i = stream.length; i > 0; i -= 8) chunks.push(stream.slice(Math.max(0, i - 8), i));
    return chunks.join("");
  }

  function beFromLeBits(bits, bitlen) {
    let stream = String(bits || "");
    if (stream.length < bitlen) throw new Error(`Not enough bits: need ${bitlen}, got ${stream.length}`);
    if (stream.length > bitlen) stream = stream.slice(0, bitlen);
    const chunks = [];
    for (let i = 0; i < stream.length; i += 8) chunks.push(stream.slice(i, i + 8));
    return chunks.reverse().join("");
  }

  function unpackUnsignedBits(stream, cursor, bitlen) {
    const raw = String(stream || "").slice(cursor, cursor + bitlen);
    return {
      value: Number(BigInt(`0b${beFromLeBits(raw, bitlen)}`)),
      cursor: cursor + bitlen,
    };
  }

  function arrayLengthBitWidth(maxLen) {
    return Math.ceil(Math.log2(Math.max(1, maxLen + 1)));
  }

  function unpackTailStringBits(stream, cursor, maxLen, tao = true) {
    if (tao) {
      const remainingBits = String(stream || "").slice(cursor);
      const byteLen = Math.min(maxLen, Math.floor(remainingBits.length / 8));
      const bytes = bytesFromBits(remainingBits.slice(0, byteLen * 8)).slice(0, byteLen);
      return { value: new TextDecoder().decode(bytes), cursor: cursor + byteLen * 8 };
    }
    const width = arrayLengthBitWidth(maxLen);
    const lenRes = unpackUnsignedBits(stream, cursor, width);
    const byteLen = Math.min(maxLen, lenRes.value);
    const bits = String(stream || "").slice(lenRes.cursor, lenRes.cursor + byteLen * 8);
    const bytes = bytesFromBits(bits).slice(0, byteLen);
    return { value: new TextDecoder().decode(bytes), cursor: lenRes.cursor + byteLen * 8 };
  }

  function sanitizeDronecanNodeName(text) {
    const raw = String(text || "").replace(/\0/g, "").trim();
    if (!raw) return "";
    const domainMatch = raw.match(/org\.[a-z0-9._-]+/i);
    if (domainMatch) return domainMatch[0].toLowerCase();
    if (/^[a-z0-9._-]+$/.test(raw)) return raw;
    const cleaned = raw.toLowerCase().replace(/[^a-z0-9._-]/g, "");
    const fromCleaned = cleaned.match(/org\.[a-z0-9._-]+/);
    if (fromCleaned) return fromCleaned[0];
    return cleaned.length >= 3 ? cleaned : "";
  }

  function formatUint64Hex(value) {
    const v = BigInt(Math.max(0, Number(value) || 0));
    return v.toString(16).toUpperCase().padStart(16, "0");
  }

  function formatUint32Hex(value) {
    const v = Number(value) >>> 0;
    return v.toString(16).toUpperCase().padStart(8, "0");
  }

  function isNodeInfoUsable(info) {
    if (!info || typeof info !== "object") return false;
    return !!(
      info.name
      || (info.softwareVersion && info.softwareVersion !== "—")
      || (info.hardwareVersion && info.hardwareVersion !== "—")
      || info.swCrc
    );
  }

  function decodeGetNodeInfoResponse(bytes) {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    const stream = bitsFromBytes(arr);
    let cursor = 0;
    const uptime = unpackUnsignedBits(stream, cursor, 32);
    cursor = uptime.cursor;
    cursor = unpackUnsignedBits(stream, cursor, 2).cursor;
    cursor = unpackUnsignedBits(stream, cursor, 3).cursor;
    cursor = unpackUnsignedBits(stream, cursor, 3).cursor;
    cursor = unpackUnsignedBits(stream, cursor, 16).cursor;

    const swMajor = unpackUnsignedBits(stream, cursor, 8);
    cursor = swMajor.cursor;
    const swMinor = unpackUnsignedBits(stream, cursor, 8);
    cursor = swMinor.cursor;
    const optFlags = unpackUnsignedBits(stream, cursor, 8);
    cursor = optFlags.cursor;

    let vcsCommit = "";
    if (optFlags.value & 1) {
      const vcs = unpackUnsignedBits(stream, cursor, 32);
      cursor = vcs.cursor;
      vcsCommit = formatUint32Hex(vcs.value);
    }

    let swCrc = "";
    if (optFlags.value & 2) {
      const imageCrc = unpackUnsignedBits(stream, cursor, 64);
      cursor = imageCrc.cursor;
      swCrc = formatUint64Hex(imageCrc.value);
    }

    const hwMajor = unpackUnsignedBits(stream, cursor, 8);
    cursor = hwMajor.cursor;
    const hwMinor = unpackUnsignedBits(stream, cursor, 8);
    cursor = hwMinor.cursor;
    cursor += 128;
    const certLen = unpackUnsignedBits(stream, cursor, 8);
    cursor = certLen.cursor + certLen.value * 8;

    const nameDecoded = unpackTailStringBits(stream, cursor, 80, true);
    const swText = swMajor.value || swMinor.value ? `${swMajor.value}.${swMinor.value}` : "—";
    const hwText = hwMajor.value || hwMinor.value ? `${hwMajor.value}.${hwMinor.value}` : "—";
    const rawName = String(nameDecoded.value || "").replace(/\0/g, "").trim();
    return {
      name: sanitizeDronecanNodeName(nameDecoded.value),
      rawName,
      softwareVersion: swText,
      hardwareVersion: hwText,
      uptimeSec: uptime.value,
      vcsCommit,
      swCrc,
    };
  }

  global.DRONECAN_GET_NODE_INFO = {
    sanitizeDronecanNodeName,
    decodeGetNodeInfoResponse,
    isNodeInfoUsable,
    bitsFromBytes,
  };
})(typeof window !== "undefined" ? window : globalThis);
