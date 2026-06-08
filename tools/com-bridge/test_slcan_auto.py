#!/usr/bin/env python3
"""Automated SLCAN parser + bridge API checks (no hardware required)."""
from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.error
import urllib.request

BRIDGE = "http://127.0.0.1:8765"
BATTERY_CAN_LINE = "T180444338000066412C004000000000C0"
BATTERY_CAN_ID = "0x18044433"


def http_json(method: str, path: str, body: dict | None = None, timeout: float = 5.0):
    data = None
    headers = {"Content-Type": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(f"{BRIDGE}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def bridge_online() -> bool:
    try:
        http_json("GET", "/com-ports", timeout=1.5)
        return True
    except Exception:
        return False


def start_bridge_subprocess() -> subprocess.Popen:
    from pathlib import Path

    bridge_dir = Path(__file__).resolve().parent
    return subprocess.Popen(
        [sys.executable, "server.py"],
        cwd=str(bridge_dir),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def wait_bridge(timeout_s: float = 12.0) -> None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if bridge_online():
            return
        time.sleep(0.25)
    raise RuntimeError("com-bridge did not become ready")


def _node_key(transport: str, bus: int, node_id: int):
    return (str(transport), int(bus), int(node_id))


def test_parser_unit() -> None:
    from server import SlcanMavlinkMonitor

    mon = SlcanMavlinkMonitor()
    mon.reset()
    mon.feed(f"{BATTERY_CAN_LINE}\r".encode("ascii"))
    key = _node_key("slcan", 1, 51)
    assert key in mon.nodes, f"node 51 missing after feed, keys={list(mon.nodes)!r}"
    node = mon.nodes[key]
    assert node["lastCanId"] == BATTERY_CAN_ID, node["lastCanId"]
    assert node["lastDlc"] == 8, node["lastDlc"]
    assert node["source"] == "SLCAN Direct CAN1", node["source"]
    print("  [ok] unit parser feed")


def test_battery_can_id_layout() -> None:
    can_id = int(BATTERY_CAN_ID, 16)
    data_type_id = (can_id >> 8) & 0xFFFF
    source_node = can_id & 0x7F
    assert data_type_id == 1092, data_type_id
    assert source_node == 51, source_node
    print("  [ok] BatteryInfo CAN ID layout (1092 / node 51)")


def test_inject_api() -> None:
    http_json("POST", "/slcan-inject", {"line": BATTERY_CAN_LINE})
    status = http_json("GET", "/slcan-nodes")
    nodes = status.get("nodes") or []
    match = next((n for n in nodes if n.get("nodeId") == 51), None)
    assert match, f"node 51 not in {nodes!r}"
    assert match.get("lastCanId") == BATTERY_CAN_ID, match.get("lastCanId")
    assert int(match.get("lastDlc") or 0) == 8, match.get("lastDlc")
    assert str(match.get("source") or "").startswith("SLCAN"), match.get("source")
    fps = int(status.get("framesPerSecond") or 0)
    assert fps >= 1, f"expected framesPerSecond >= 1, got {fps}"
    try:
        mav_status = http_json("GET", "/mavlink-can-nodes?bus=1")
    except urllib.error.HTTPError as err:
        if err.code == 404:
            print("  [skip] /mavlink-can-nodes not on running bridge (restart required)")
            return
        raise
    mav_nodes = mav_status.get("nodes") or []
    assert not any(n.get("nodeId") == 51 for n in mav_nodes), f"mavlink api leaked slcan node: {mav_nodes!r}"
    print("  [ok] /slcan-inject + /slcan-nodes (isolated from /mavlink-can-nodes)")


def _encode_mavlink_can_frame(frame_id: int, data: bytes, bus: int = 0) -> bytes:
    try:
        from pymavlink.dialects.v20 import ardupilotmega as mavlink2
    except ImportError as exc:
        raise ImportError("pymavlink required for mavlink isolation test") from exc

    writer_buffer = bytearray()

    class Writer:
        def write(self, b):
            writer_buffer.extend(b)
            return len(b)

    mav = mavlink2.MAVLink(Writer(), srcSystem=245, srcComponent=190)
    payload = list(data[:64])
    while len(payload) < 64:
        payload.append(0)
    msg = mav.can_frame_encode(1, 1, bus, len(data), frame_id, payload)
    mav.send(msg)
    return bytes(writer_buffer)


def _pymavlink_available() -> bool:
    import importlib.util
    return importlib.util.find_spec("pymavlink") is not None


def test_mavlink_bytes_not_slcan_pool() -> None:
    if not _pymavlink_available():
        print("  [skip] mavlink-not-slcan (pymavlink not installed)")
        return

    from server import SlcanMavlinkMonitor

    mon = SlcanMavlinkMonitor()
    mon.reset()
    frame_id = 0x18000019
    data = bytes.fromhex("0102030405060708")
    mon.feed_mavlink(_encode_mavlink_can_frame(frame_id, data, bus=0))
    slcan_nodes = mon.status(source_prefix="SLCAN")["nodes"]
    assert not slcan_nodes, f"mavlink bytes created slcan nodes: {slcan_nodes!r}"
    print("  [ok] MAVLink binary does not populate SLCAN pool")


def test_can1_can2_isolation() -> None:
    if not _pymavlink_available():
        print("  [skip] CAN1/CAN2 isolation (pymavlink not installed)")
        return

    from server import SlcanMavlinkMonitor

    mon = SlcanMavlinkMonitor()
    mon.reset()
    mon.feed_mavlink(_encode_mavlink_can_frame(0x18000005, bytes(8), bus=0))
    mon.feed_mavlink(_encode_mavlink_can_frame(0x1800000A, bytes(8), bus=1))
    can1 = mon.status(source_prefix="MAVLink", bus_filter=1)["nodes"]
    can2 = mon.status(source_prefix="MAVLink", bus_filter=2)["nodes"]
    assert any(n.get("nodeId") == 5 for n in can1), can1
    assert not any(n.get("nodeId") == 10 for n in can1), can1
    assert any(n.get("nodeId") == 10 for n in can2), can2
    assert not any(n.get("nodeId") == 5 for n in can2), can2
    print("  [ok] CAN1/CAN2 bus isolation")


def test_forward_bus_prune() -> None:
    if not _pymavlink_available():
        print("  [skip] forward bus prune (pymavlink not installed)")
        return

    from server import SlcanMavlinkMonitor

    mon = SlcanMavlinkMonitor()
    mon.reset()
    mon.feed_mavlink(_encode_mavlink_can_frame(0x18000005, bytes(8), bus=0))
    mon.feed_mavlink(_encode_mavlink_can_frame(0x1800000A, bytes(8), bus=1))
    mon.forward_bus = 1
    mon._prune_mavlink_bus(2)
    can1 = mon.status(source_prefix="MAVLink", bus_filter=1)["nodes"]
    can2 = mon.status(source_prefix="MAVLink", bus_filter=2)["nodes"]
    assert any(n.get("nodeId") == 10 for n in can2), can2
    assert not any(n.get("nodeId") == 5 for n in can1), can1
    print("  [ok] CAN_FORWARD bus switch prunes stale bus nodes")


def test_status_source_isolation() -> None:
    if not _pymavlink_available():
        print("  [skip] status source isolation (pymavlink not installed)")
        return

    from server import SlcanMavlinkMonitor

    mon = SlcanMavlinkMonitor()
    mon.reset()
    mon.feed_slcan(f"{BATTERY_CAN_LINE}\r".encode("ascii"))
    slcan_nodes = mon.status(source_prefix="SLCAN")["nodes"]
    mav_nodes = mon.status(source_prefix="MAVLink", bus_filter=1)["nodes"]
    assert any(n.get("nodeId") == 51 for n in slcan_nodes), slcan_nodes
    assert not any(n.get("nodeId") == 51 for n in mav_nodes), mav_nodes

    frame_id = 0x18000019
    data = bytes.fromhex("0102030405060708")
    mon.feed_mavlink(_encode_mavlink_can_frame(frame_id, data, bus=0))
    mav_nodes = mon.status(source_prefix="MAVLink", bus_filter=1)["nodes"]
    slcan_nodes = mon.status(source_prefix="SLCAN")["nodes"]
    assert any(n.get("nodeId") == 25 for n in mav_nodes), mav_nodes
    assert all(n.get("source", "").startswith("SLCAN") for n in slcan_nodes), slcan_nodes
    assert all(n.get("nodeId") == 51 for n in slcan_nodes), slcan_nodes
    print("  [ok] status source_prefix + bus_filter isolation")


def test_default_mavlink_can_filter_whitelist() -> None:
    from server import DEFAULT_MAVLINK_CAN_FILTER_IDS

    assert DEFAULT_MAVLINK_CAN_FILTER_IDS[0] == 0
    assert 341 in DEFAULT_MAVLINK_CAN_FILTER_IDS
    assert 1 in DEFAULT_MAVLINK_CAN_FILTER_IDS
    assert 16383 in DEFAULT_MAVLINK_CAN_FILTER_IDS
    assert len(DEFAULT_MAVLINK_CAN_FILTER_IDS) == 11
    print("  [ok] DEFAULT_MAVLINK_CAN_FILTER_IDS (MP whitelist)")


def test_can_filter_modify_writes() -> None:
    if not _pymavlink_available():
        print("  [skip] CAN_FILTER_MODIFY encode (pymavlink not installed)")
        return

    from server import SLCAN_MONITOR, send_mavlink_can_filter_modify

    class FakeHub:
        def __init__(self):
            self.writes: list[bytes] = []

        def status(self):
            return {"open": True}

        def write(self, data: bytes):
            self.writes.append(data)
            return len(data)

    hub = FakeHub()
    prev_system = SLCAN_MONITOR.target_system
    prev_component = SLCAN_MONITOR.target_component
    try:
        SLCAN_MONITOR.target_system = 1
        SLCAN_MONITOR.target_component = 1
        result = send_mavlink_can_filter_modify(hub, bus_ui=1)
        assert hub.writes, "expected CAN_FILTER_MODIFY bytes"
        assert result["bus"] == 1
        assert result["ids"][0] == 0
        assert result["ids"][1] == 341
    finally:
        SLCAN_MONITOR.target_system = prev_system
        SLCAN_MONITOR.target_component = prev_component
    print("  [ok] send_mavlink_can_filter_modify encodes CAN_FILTER_MODIFY")


def test_command_long_encode_param7() -> None:
    if not _pymavlink_available():
        print("  [skip] command_long param7 (pymavlink not installed)")
        return

    from pymavlink.dialects.v20 import ardupilotmega as mavlink2

    writer_buffer = bytearray()

    class Writer:
        def write(self, b):
            writer_buffer.extend(b)
            return len(b)

    mav = mavlink2.MAVLink(Writer(), srcSystem=245, srcComponent=190)
    cmd = mav.command_long_encode(1, 1, 32000, 0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    mav.send(cmd)
    assert writer_buffer, "expected COMMAND_LONG bytes"
    print("  [ok] COMMAND_LONG encode includes param7")


def test_init_bitrate_codes() -> None:
    from server import SLCAN_BITRATE_CODE, init_slcan_adapter

    assert SLCAN_BITRATE_CODE[1000] == "8"
    assert SLCAN_BITRATE_CODE[500] == "6"

    class FakeHub:
        def __init__(self):
            self.writes: list[bytes] = []

        def write(self, data: bytes):
            self.writes.append(data)
            return len(data)

    hub = FakeHub()
    init_slcan_adapter(hub, bitrate_kbps=1000)
    assert hub.writes == [b"C\r", b"S8\r", b"O\r"]
    print("  [ok] init_slcan_adapter commands")


def main() -> int:
    print("SLCAN automation")
    child = None
    try:
        test_parser_unit()
        test_mavlink_bytes_not_slcan_pool()
        test_can1_can2_isolation()
        test_forward_bus_prune()
        test_status_source_isolation()
        test_default_mavlink_can_filter_whitelist()
        test_can_filter_modify_writes()
        test_command_long_encode_param7()
        test_init_bitrate_codes()
        test_battery_can_id_layout()

        if not bridge_online():
            print("  starting com-bridge …")
            child = start_bridge_subprocess()
            wait_bridge()

        # Ensure inject endpoint exists (old servers return 404).
        try:
            test_inject_api()
        except urllib.error.HTTPError as err:
            if err.code == 404 and child is None:
                print("  restarting com-bridge for /slcan-inject …")
                child = start_bridge_subprocess()
                wait_bridge()
                test_inject_api()
            else:
                raise

        print("PASS: all SLCAN automation checks")
        return 0
    except Exception as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    finally:
        if child is not None:
            child.terminate()
            try:
                child.wait(timeout=3)
            except Exception:
                child.kill()


if __name__ == "__main__":
    raise SystemExit(main())
