"""Synthetic byte tests for MAVLink vs SLCAN port role detection (no hardware)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import server  # noqa: E402


def _pack_heartbeat_burst(count=6):
    if server.mavlink2 is None:
        return b""
    mav = server.mavlink2.MAVLink(None, srcSystem=255, srcComponent=190)
    buf = bytearray()
    for _ in range(count):
        msg = mav.heartbeat_encode(
            type=server.mavlink2.MAV_TYPE_QUADROTOR,
            autopilot=server.mavlink2.MAV_AUTOPILOT_ARDUPILOTMEGA,
            base_mode=0,
            custom_mode=0,
            system_status=server.mavlink2.MAV_STATE_ACTIVE,
        )
        buf.extend(msg.pack(mav))
    return bytes(buf)


class TestProbeAnalysis(unittest.TestCase):
    def test_mavlink_heartbeat_high_confidence(self):
        data = _pack_heartbeat_burst(8)
        self.assertTrue(len(data) > 20)
        analysis = server._analyze_port_sample(data)
        self.assertEqual(analysis["probeRole"], "mavlink")
        self.assertIn(analysis["probeConfidence"], ("high", "medium"))
        self.assertGreaterEqual(analysis["probeMavlinkFrames"], 2)

    def test_slcan_t_frames(self):
        data = b"T12345678\r\nT87654321\r\n"
        analysis = server._analyze_port_sample(data)
        self.assertEqual(analysis["probeRole"], "slcan")
        self.assertGreaterEqual(analysis["probeSlcanLines"], 1)

    def test_idle_ascii_slcan_medium(self):
        data = b"Lawicel CANUSB\r\n\r\n"
        analysis = server._analyze_port_sample(data)
        self.assertEqual(analysis["probeRole"], "slcan")

    def test_unknown_binary_noise(self):
        data = bytes([0, 1, 2, 3, 7, 8, 9, 127, 128, 255] * 12)
        analysis = server._analyze_port_sample(data)
        self.assertEqual(analysis["probeRole"], "unknown")


if __name__ == "__main__":
    unittest.main()
