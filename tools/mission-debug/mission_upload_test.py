#!/usr/bin/env python3
"""
MAVLink mission upload smoke test (standalone, mirrors GCS protocol).

Usage:
  ./.venv/bin/python mission_upload_test.py
  ./.venv/bin/python mission_upload_test.py --port /dev/cu.usbmodem1301 --baud 115200
  ./.venv/bin/python mission_upload_test.py --list-ports
"""

from __future__ import annotations

import argparse
import glob
import sys
import time
from typing import List, Optional, Tuple

from pymavlink import mavutil

MAV_FRAME_GLOBAL_RELATIVE_ALT_INT = 6
MAV_CMD_NAV_WAYPOINT = 16
MAV_MISSION_TYPE_MISSION = 0
GCS_SYSID = 255
GCS_COMPID = 190


def find_usb_ports() -> List[str]:
    patterns = [
        "/dev/cu.usbmodem*",
        "/dev/cu.usbserial*",
        "/dev/cu.wchusbserial*",
        "/dev/cu.SLAB_USBtoUART*",
        "/dev/ttyUSB*",
        "/dev/ttyACM*",
    ]
    found: List[str] = []
    for pat in patterns:
        found.extend(glob.glob(pat))
    return sorted(set(found))


def wait_heartbeat(mav, timeout: float) -> Tuple[int, int]:
    print(f"[wait] HEARTBEAT ({timeout:.0f}s)…")
    msg = mav.wait_heartbeat(timeout=timeout)
    if msg is None:
        raise TimeoutError("no HEARTBEAT")
    sysid = mav.target_system
    compid = mav.target_component
    print(
        f"[hb]   sys={sysid} comp={compid} "
        f"type={msg.type} autopilot={msg.autopilot} base_mode=0x{msg.base_mode:02x}"
    )
    return sysid, compid


def drain_mission_msgs(mav, seconds: float) -> None:
    end = time.time() + seconds
    while time.time() < end:
        msg = mav.recv_match(
            type=["MISSION_REQUEST", "MISSION_REQUEST_INT", "MISSION_ACK", "STATUSTEXT"],
            blocking=True,
            timeout=0.2,
        )
        if msg is None:
            continue
        mtype = msg.get_type()
        if mtype == "STATUSTEXT":
            print(f"[rx] STATUSTEXT: {msg.text}")
        elif mtype in ("MISSION_REQUEST", "MISSION_REQUEST_INT"):
            print(
                f"[rx] {mtype} seq={msg.seq} "
                f"target_sys={msg.target_system} target_comp={msg.target_component} "
                f"mission_type={getattr(msg, 'mission_type', 'n/a')}"
            )
        elif mtype == "MISSION_ACK":
            print(f"[rx] MISSION_ACK type={msg.type} mission_type={getattr(msg, 'mission_type', 0)}")


def clear_mission_count_zero(mav, target_sys: int, target_comp: int, timeout: float) -> bool:
    print(f"[tx] MISSION_COUNT count=0 → sys={target_sys} comp={target_comp}")
    mav.mav.mission_count_send(
        target_sys,
        target_comp,
        0,
        mission_type=MAV_MISSION_TYPE_MISSION,
    )
    ack = mav.recv_match(type="MISSION_ACK", blocking=True, timeout=timeout)
    if ack:
        print(f"[rx] MISSION_ACK (clear) type={ack.type}")
        return ack.type == 0
    print("[warn] no MISSION_ACK after clear (count=0)")
    return False


def upload_mission(
    mav,
    target_sys: int,
    target_comp: int,
    waypoints: list,
    timeout_per_item: float,
) -> bool:
    count = len(waypoints)
    print(f"[tx] MISSION_COUNT count={count} → sys={target_sys} comp={target_comp}")

    for pulse in range(3):
        mav.mav.mission_count_send(
            target_sys,
            target_comp,
            count,
            mission_type=MAV_MISSION_TYPE_MISSION,
        )
        time.sleep(0.12)

    sent = 0
    deadline = time.time() + timeout_per_item * max(count, 1) + 15.0

    while sent < count and time.time() < deadline:
        req = mav.recv_match(
            type=["MISSION_REQUEST_INT", "MISSION_REQUEST"],
            blocking=True,
            timeout=2.0,
        )
        if req is None:
            print(f"[wait] no MISSION_REQUEST yet ({sent}/{count} sent)…")
            mav.mav.mission_count_send(
                target_sys,
                target_comp,
                count,
                mission_type=MAV_MISSION_TYPE_MISSION,
            )
            continue

        seq = int(req.seq)
        rtype = req.get_type()
        print(
            f"[rx] {rtype} seq={seq} "
            f"→ target_sys={req.target_system} target_comp={req.target_component}"
        )

        if seq < 0 or seq >= count:
            print(f"[warn] unexpected seq={seq}, skip")
            continue

        wp = waypoints[seq]
        lat, lon, alt = wp

        if rtype == "MISSION_REQUEST_INT":
            mav.mav.mission_item_int_send(
                target_sys,
                target_comp,
                seq,
                MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
                MAV_CMD_NAV_WAYPOINT,
                0,  # current
                1,  # autocontinue
                0,
                0,
                0,
                0,
                int(lat * 1e7),
                int(lon * 1e7),
                float(alt),
                mission_type=MAV_MISSION_TYPE_MISSION,
            )
        else:
            mav.mav.mission_item_send(
                target_sys,
                target_comp,
                seq,
                MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
                MAV_CMD_NAV_WAYPOINT,
                0,
                1,
                0,
                0,
                0,
                0,
                float(lat),
                float(lon),
                float(alt),
                mission_type=MAV_MISSION_TYPE_MISSION,
            )

        sent = max(sent, seq + 1)
        print(f"[tx] MISSION_ITEM{'_INT' if rtype == 'MISSION_REQUEST_INT' else ''} seq={seq}")

    ack = mav.recv_match(type="MISSION_ACK", blocking=True, timeout=10.0)
    if ack is None:
        print("[fail] no final MISSION_ACK")
        return False
    print(f"[rx] MISSION_ACK final type={ack.type}")
    return ack.type == 0


def try_port(port: str, baud: int, args) -> bool:
    print(f"\n{'=' * 60}\n[open] {port} @ {baud}\n{'=' * 60}")
    try:
        mav = mavutil.mavlink_connection(
            port,
            baud=baud,
            source_system=GCS_SYSID,
            source_component=GCS_COMPID,
        )
    except Exception as e:
        print(f"[skip] cannot open: {e}")
        return False

    try:
        target_sys, target_comp = wait_heartbeat(mav, args.hb_timeout)
        drain_mission_msgs(mav, 0.5)

        comps_to_try = []
        for c in (target_comp, 1, 0):
            if c not in comps_to_try:
                comps_to_try.append(c)

        # Sample waypoints near default GCS map center (Bishan, Chongqing area)
        base_lat, base_lon = 29.59256, 106.22742
        waypoints = [
            (base_lat, base_lon, 30.0),
            (base_lat + 0.0003, base_lon + 0.0003, 35.0),
            (base_lat + 0.0006, base_lon, 40.0),
        ]

        for comp in comps_to_try:
            print(f"\n--- try target_comp={comp} (heartbeat had comp={target_comp}) ---")
            clear_mission_count_zero(mav, target_sys, comp, args.clear_timeout)
            time.sleep(0.3)
            ok = upload_mission(
                mav,
                target_sys,
                comp,
                waypoints,
                args.item_timeout,
            )
            if ok:
                print(f"\n[OK] mission upload succeeded on {port} comp={comp}")
                return True
            print(f"[fail] upload failed for comp={comp}")

        return False
    finally:
        try:
            mav.close()
        except Exception:
            pass


def main() -> int:
    parser = argparse.ArgumentParser(description="MAVLink mission upload debug")
    parser.add_argument("--port", help="Serial device path")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--hb-timeout", type=float, default=8.0)
    parser.add_argument("--clear-timeout", type=float, default=6.0)
    parser.add_argument("--item-timeout", type=float, default=12.0)
    parser.add_argument("--list-ports", action="store_true")
    args = parser.parse_args()

    ports = find_usb_ports()
    if args.list_ports:
        print("USB serial ports:")
        for p in ports:
            print(f"  {p}")
        return 0

    if args.port:
        ports = [args.port] + [p for p in ports if p != args.port]

    if not ports:
        print("[error] no USB serial ports found")
        return 1

    print(f"[info] candidate ports: {ports}")
    print(f"[info] GCS sysid={GCS_SYSID} compid={GCS_COMPID} baud={args.baud}")

    for port in ports:
        if try_port(port, args.baud, args):
            return 0

    print("\n[error] mission upload failed on all ports")
    print("Tips: close Mission Planner/QGC and disconnect GCS in browser, then retry.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
