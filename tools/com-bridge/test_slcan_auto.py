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


def test_parser_unit() -> None:
    from server import SlcanMavlinkMonitor

    mon = SlcanMavlinkMonitor()
    mon.reset()
    mon.feed(f"{BATTERY_CAN_LINE}\r".encode("ascii"))
    assert 51 in mon.nodes, "node 51 missing after feed"
    node = mon.nodes[51]
    assert node["lastCanId"] == BATTERY_CAN_ID, node["lastCanId"]
    assert node["lastDlc"] == 8, node["lastDlc"]
    assert node["source"] == "SLCAN Direct", node["source"]
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
    fps = int(status.get("framesPerSecond") or 0)
    assert fps >= 1, f"expected framesPerSecond >= 1, got {fps}"
    print("  [ok] /slcan-inject + /slcan-nodes")


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
