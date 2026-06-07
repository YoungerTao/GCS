"""Regression tests for uavcan.protocol.GetNodeInfo.Response decode helpers."""

import re
import unittest


def bits_from_bytes(data: bytes) -> str:
    return "".join(f"{b:08b}" for b in data)


def bytes_from_bits(bits: str) -> bytes:
    stream = bits
    if len(stream) % 8:
        stream += "0" * (8 - len(stream) % 8)
    return bytes(int(stream[i : i + 8], 2) for i in range(0, len(stream), 8))


def le_from_be_bits(bits: str, bitlen: int) -> str:
    stream = bits
    if len(stream) < bitlen:
        raise ValueError("not enough bits")
    if len(stream) > bitlen:
        stream = stream[-bitlen:]
    chunks = [stream[max(0, i - 8) : i] for i in range(len(stream), 0, -8)]
    return "".join(chunks)


def be_from_le_bits(bits: str, bitlen: int) -> str:
    stream = bits[:bitlen]
    chunks = [stream[i : i + 8] for i in range(0, len(stream), 8)]
    return "".join(reversed(chunks))


def unpack_unsigned(stream: str, cursor: int, bitlen: int):
    raw = stream[cursor : cursor + bitlen]
    value = int(f"0b{be_from_le_bits(raw, bitlen)}", 2)
    return value, cursor + bitlen


def unpack_tail_string(stream: str, cursor: int, max_len: int = 80):
    remaining = stream[cursor:]
    byte_len = min(max_len, len(remaining) // 8)
    value = bytes_from_bits(remaining[: byte_len * 8])[:byte_len].decode("ascii", errors="ignore")
    return value, cursor + byte_len * 8


def sanitize_name(text: str) -> str:
    raw = text.replace("\0", "").strip()
    if not raw:
        return ""
    m = re.search(r"org\.[a-z0-9._-]+", raw, re.I)
    if m:
        return m.group(0).lower()
    return raw


def decode_get_node_info_response(data: bytes) -> dict:
    stream = bits_from_bytes(data)
    cursor = 0
    uptime, cursor = unpack_unsigned(stream, cursor, 32)
    cursor += 2 + 3 + 3 + 16

    sw_major, cursor = unpack_unsigned(stream, cursor, 8)
    sw_minor, cursor = unpack_unsigned(stream, cursor, 8)
    opt_flags, cursor = unpack_unsigned(stream, cursor, 8)

    vcs_commit = ""
    if opt_flags & 1:
        vcs_val, cursor = unpack_unsigned(stream, cursor, 32)
        vcs_commit = f"{vcs_val:08X}"

    sw_crc = ""
    if opt_flags & 2:
        image_crc, cursor = unpack_unsigned(stream, cursor, 64)
        sw_crc = f"{image_crc:016X}"

    hw_major, cursor = unpack_unsigned(stream, cursor, 8)
    hw_minor, cursor = unpack_unsigned(stream, cursor, 8)
    cursor += 128
    cert_len, cursor = unpack_unsigned(stream, cursor, 8)
    cursor += cert_len * 8

    raw_name, _ = unpack_tail_string(stream, cursor, 80)
    sw_text = f"{sw_major}.{sw_minor}" if sw_major or sw_minor else "—"
    hw_text = f"{hw_major}.{hw_minor}" if hw_major or hw_minor else "—"
    return {
        "name": sanitize_name(raw_name),
        "rawName": raw_name.strip(),
        "softwareVersion": sw_text,
        "hardwareVersion": hw_text,
        "uptimeSec": uptime,
        "vcsCommit": vcs_commit,
        "swCrc": sw_crc,
    }


def is_node_info_usable(info: dict) -> bool:
    if not info:
        return False
    return bool(
        info.get("name")
        or (info.get("softwareVersion") and info.get("softwareVersion") != "—")
        or (info.get("hardwareVersion") and info.get("hardwareVersion") != "—")
        or info.get("swCrc")
    )


def build_sample_response() -> bytes:
    parts = []
    parts.append(format(1200, "032b"))  # uptime
    parts.append(format(0, "02b"))    # health
    parts.append(format(0, "03b"))    # mode
    parts.append(format(0, "03b"))    # sub_mode
    parts.append(format(0, "016b"))   # vendor
    parts.append(format(4, "08b"))    # sw major
    parts.append(format(5, "08b"))    # sw minor
    parts.append(format(3, "08b"))    # opt flags: vcs + image_crc
    parts.append(format(0xA1B2C3D4, "032b"))
    parts.append(format(0x123456789ABCDEF0, "064b"))
    parts.append(format(1, "08b"))    # hw major
    parts.append(format(0, "08b"))    # hw minor
    parts.append("0" * 128)           # unique_id
    parts.append(format(0, "08b"))    # cert len
    name = b"org.ardupilot"
    parts.append(bits_from_bytes(name))
    return bytes_from_bits("".join(parts))


class GetNodeInfoDecodeTests(unittest.TestCase):
    def test_tao_name_and_versions(self):
        decoded = decode_get_node_info_response(build_sample_response())
        self.assertEqual(decoded["name"], "org.ardupilot")
        self.assertEqual(decoded["softwareVersion"], "4.5")
        self.assertEqual(decoded["hardwareVersion"], "1.0")
        self.assertEqual(decoded["vcsCommit"], "D4C3B2A1")
        self.assertTrue(decoded["swCrc"])
        self.assertEqual(len(decoded["swCrc"]), 16)

    def test_is_usable_without_name_but_with_version(self):
        info = {"name": "", "softwareVersion": "4.5", "hardwareVersion": "—", "swCrc": ""}
        self.assertTrue(is_node_info_usable(info))

    def test_is_not_usable_when_empty(self):
        self.assertFalse(is_node_info_usable({}))


if __name__ == "__main__":
    unittest.main()
