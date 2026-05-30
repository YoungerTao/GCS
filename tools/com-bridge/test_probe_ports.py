"""Synthetic byte tests for MAVLink vs SLCAN port role detection (no hardware)."""
import os
import sys
import unittest
from unittest.mock import patch

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


class TestScoreMavlinkSample(unittest.TestCase):
    def test_heartbeat_scores_1000(self):
        data = _pack_heartbeat_burst(4)
        if not data:
            self.skipTest("pymavlink not available")
        score, analysis = server._score_mavlink_sample(data)
        self.assertEqual(score, 1000)
        self.assertEqual(analysis["probeRole"], "mavlink")

    def test_slcan_scores_zero(self):
        data = b"T12345678\r\nT87654321\r\n"
        score, analysis = server._score_mavlink_sample(data)
        self.assertEqual(score, 0)
        self.assertEqual(analysis["probeRole"], "slcan")

    def test_empty_scores_zero(self):
        score, analysis = server._score_mavlink_sample(b"")
        self.assertEqual(score, 0)
        self.assertIsNone(analysis)


class TestProbeBaudForPort(unittest.TestCase):
    def test_missing_port(self):
        out = server.probe_baud_for_port("")
        self.assertFalse(out.get("ok"))
        self.assertIn("port", out.get("error", "").lower())

    def test_in_use_port(self):
        with patch.object(server, "_is_port_actively_bridged", return_value=True):
            out = server.probe_baud_for_port("COM99")
        self.assertFalse(out.get("ok"))
        self.assertEqual(out.get("error"), "in-use")

    def test_finds_highest_baud_first(self):
        hb = _pack_heartbeat_burst(6)
        if not hb:
            self.skipTest("pymavlink not available")

        def fake_sample(port, baudrate=115200):
            if baudrate == 921600:
                return hb
            return b""

        with patch.object(server, "_collect_port_sample_mavlink_only", side_effect=fake_sample):
            with patch.object(server, "_is_port_actively_bridged", return_value=False):
                out = server.probe_baud_for_port("COM3", [921600, 115200])
        self.assertTrue(out.get("ok"))
        self.assertEqual(out.get("baud"), 921600)
        self.assertGreaterEqual(out.get("score", 0), 1000)

    def test_all_fail_no_mavlink(self):
        with patch.object(server, "_collect_port_sample_mavlink_only", return_value=b""):
            with patch.object(server, "_is_port_actively_bridged", return_value=False):
                out = server.probe_baud_for_port("COM3", [115200, 57600])
        self.assertFalse(out.get("ok"))
        self.assertIn("mavlink", out.get("error", "").lower())

    def test_slcan_only_reason(self):
        slcan_data = b"T12345678\r\nT87654321\r\n"

        with patch.object(server, "_collect_port_sample_mavlink_only", return_value=slcan_data):
            with patch.object(server, "_is_port_actively_bridged", return_value=False):
                out = server.probe_baud_for_port("COM3", [115200])
        self.assertFalse(out.get("ok"))
        self.assertEqual(out.get("reason"), "slcan")


if __name__ == "__main__":
    unittest.main()
