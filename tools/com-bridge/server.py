import base64
import json
import re
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    import serial
except Exception:
    serial = None

try:
    from pymavlink import mavutil
    from pymavlink.dialects.v20 import ardupilotmega as mavlink2
except Exception:
    mavutil = None
    mavlink2 = None


def read_ports():
    ps_script = r"""
$ports = Get-CimInstance Win32_SerialPort | Select-Object DeviceID, Name, PNPDeviceID
$result = @()
foreach ($p in $ports) {
  $vid = $null
  $pid = $null
  if ($p.PNPDeviceID -match 'VID_([0-9A-Fa-f]{4})') { $vid = [Convert]::ToInt32($matches[1],16) }
  if ($p.PNPDeviceID -match 'PID_([0-9A-Fa-f]{4})') { $pid = [Convert]::ToInt32($matches[1],16) }
  $result += [PSCustomObject]@{
    deviceId = $p.DeviceID
    name = $p.Name
    usbVendorId = $vid
    usbProductId = $pid
  }
}
$result | ConvertTo-Json -Depth 3
"""
    proc = subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps_script],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore",
        timeout=6,
    )
    if proc.returncode != 0:
        return []
    out = proc.stdout.strip()
    if not out:
        return []
    try:
        data = json.loads(out)
        if isinstance(data, dict):
            data = [data]
        if not isinstance(data, list):
            return []

        def classify(item):
            name = str(item.get("name", "")).lower()
            if "slcan" in name:
                return "slcan"
            if "mavlink" in name:
                return "mavlink"
            return "serial"

        def com_key(item):
            m = re.match(r"COM(\d+)", str(item.get("deviceId", "")).upper())
            return int(m.group(1)) if m else 10**9

        for item in data:
            item["role"] = classify(item)
            item["isSlcanAdapter"] = item["role"] == "slcan"

        data.sort(key=com_key)
        return data
    except Exception:
        return []


def detect_slcan_port():
    for item in read_ports():
        if item.get("isSlcanAdapter"):
            return item.get("deviceId")
    return None


class SerialHub:
    def __init__(self, label):
        self.label = label
        self.lock = threading.Lock()
        self.serial = None
        self.port = None
        self.baudrate = 115200
        self.rx_buffer = bytearray()
        self.reader_thread = None

    def status(self):
        with self.lock:
            return {
                "label": self.label,
                "open": self.serial is not None and getattr(self.serial, "is_open", False),
                "port": self.port,
                "baudrate": self.baudrate,
            }

    def open(self, port, baudrate):
        if serial is None:
            raise RuntimeError("pyserial is not installed")
        self.close()
        s = serial.Serial(port, baudrate=baudrate, timeout=0.2, write_timeout=0.5)
        with self.lock:
            self.serial = s
            self.port = port
            self.baudrate = baudrate
            self.rx_buffer = bytearray()
        self.reader_thread = threading.Thread(target=self._reader_loop, daemon=True)
        self.reader_thread.start()
        return self.status()

    def close(self):
        with self.lock:
            s = self.serial
            self.serial = None
            self.port = None
            self.rx_buffer = bytearray()
        if s is not None:
            try:
                s.close()
            except Exception:
                pass

    def write(self, data):
        with self.lock:
            s = self.serial
        if s is None or not getattr(s, "is_open", False):
            raise RuntimeError(f"{self.label} is not open")
        s.write(data)
        return len(data)

    def read_buffer(self, max_bytes=65536):
        with self.lock:
            if not self.rx_buffer:
                return b""
            data = bytes(self.rx_buffer[:max_bytes])
            del self.rx_buffer[:max_bytes]
            return data

    def _reader_loop(self):
        while True:
            with self.lock:
                s = self.serial
            if s is None or not getattr(s, "is_open", False):
                return
            try:
                data = s.read(4096)
                if data:
                    with self.lock:
                        self.rx_buffer.extend(data)
                    if self.label == "slcan":
                        SLCAN_MONITOR.feed(data)
            except Exception:
                return


MAVLINK_HUB = SerialHub("bridge")
SLCAN_HUB = SerialHub("slcan")


class SlcanMavlinkMonitor:
    def __init__(self):
        self.lock = threading.Lock()
        self.parser = mavlink2.MAVLink(None) if mavlink2 is not None else None
        self.forward_enabled = False
        self.target_system = 1
        self.target_component = 1
        self.frame_times = []
        self.error_count = 0
        self.nodes = {}
        self.node_ascii = {}

    def reset(self):
        with self.lock:
            self.parser = mavlink2.MAVLink(None) if mavlink2 is not None else None
            self.forward_enabled = False
            self.target_system = 1
            self.target_component = 1
            self.frame_times = []
            self.error_count = 0
            self.nodes = {}
            self.node_ascii = {}

    def _trim_frames(self, now):
        self.frame_times = [t for t in self.frame_times if now - t <= 1.0]

    def _prune_nodes(self, now):
        stale = [node_id for node_id, node in self.nodes.items() if now - node.get("last_seen", 0) > 4.0]
        for node_id in stale:
            self.nodes.pop(node_id, None)

    def feed(self, data):
        if self.parser is None or not data:
            return
        with self.lock:
            for byte in data:
                try:
                    msg = self.parser.parse_char(bytes([byte]))
                except Exception:
                    msg = None
                if msg is None:
                    continue
                self._handle_message(msg)

    def _handle_message(self, msg):
        now = time.time()
        mtype = msg.get_type()
        if mtype == "HEARTBEAT":
            self.target_system = getattr(msg, "_srcSystem", 1) or 1
            self.target_component = getattr(msg, "_srcComponent", 1) or 1
            return
        if mtype == "CAN_FRAME":
            msg_dict = msg.to_dict()
            frame_id = int(msg_dict.get("id", 0))
            node_id = frame_id & 0x7F
            if 0 < node_id <= 127:
                node = self.nodes.get(node_id, {
                    "nodeId": node_id,
                    "name": "org.ardupilot" if node_id == 1 else f"node-{node_id}",
                    "status": "online",
                    "source": "MAVLink CAN_FRAME",
                    "rxCount": 0,
                    "first_seen": now,
                })
                node["status"] = "online"
                node["source"] = f"MAVLink CAN{int(msg_dict.get('bus', 0)) + 1}"
                node["rxCount"] = int(node.get("rxCount", 0)) + 1
                node["last_seen"] = now
                node["lastCanId"] = f"0x{frame_id:X}"
                node["lastDlc"] = int(msg_dict.get("len", 0))
                raw_data = msg_dict.get("data", [])
                if isinstance(raw_data, (bytes, bytearray)):
                    data_bytes = bytes(raw_data)
                else:
                    data_bytes = bytes(int(x) & 0xFF for x in raw_data[: int(msg_dict.get("len", 0))])
                node["lastDataHex"] = data_bytes.hex().upper()
                ascii_chunk = "".join(chr(b) if 32 <= b <= 126 else " " for b in data_bytes)
                previous_ascii = self.node_ascii.get(node_id, "")
                merged_ascii = (previous_ascii + ascii_chunk)[-96:]
                self.node_ascii[node_id] = merged_ascii
                inferred_name = self._infer_node_name(node_id, merged_ascii)
                node["name"] = inferred_name["name"]
                node["displayName"] = inferred_name["displayName"]
                node["deviceHint"] = inferred_name["deviceHint"]
                node["asciiHint"] = merged_ascii.strip()
                self.nodes[node_id] = node
            self.frame_times.append(now)
            self._trim_frames(now)
            self._prune_nodes(now)
            return

    def _infer_node_name(self, node_id, ascii_hint):
        text = ascii_hint.lower()
        compact = re.sub(r"[^a-z0-9_]+", "", text)
        if (
            "pmu_lite" in text
            or "can_pmu_lite" in text
            or "cuav_can_p" in text
            or "can_p mu_lite" in text
            or "cuavcanpmulite" in compact
            or "cuavcanpmu" in compact
            or "canpmulite" in compact
            or re.search(r"cua\d?vcanpmulite", compact)
        ):
            return {
                "name": "org.cuav.can_pmu_lite",
                "displayName": "CUAV CAN PMU Lite",
                "deviceHint": "Power module / BEC",
            }
        if "gps" in text or "gnss" in text:
            return {
                "name": "org.dronecan.gnss",
                "displayName": "DroneCAN GNSS",
                "deviceHint": "GNSS",
            }
        if "bms" in text or "battery" in text:
            return {
                "name": "org.dronecan.bms",
                "displayName": "DroneCAN Battery",
                "deviceHint": "Battery / BMS",
            }
        if "esc" in text:
            return {
                "name": "org.dronecan.esc",
                "displayName": "DroneCAN ESC",
                "deviceHint": "ESC",
            }
        return {
            "name": "org.ardupilot" if node_id == 1 else f"node-{node_id}",
            "displayName": "Flight Controller" if node_id == 1 else f"Node {node_id}",
            "deviceHint": "Unknown",
        }

    def status(self):
        now = time.time()
        with self.lock:
            self._trim_frames(now)
            self._prune_nodes(now)
            return {
                "forwardEnabled": self.forward_enabled,
                "targetSystem": self.target_system,
                "targetComponent": self.target_component,
                "framesPerSecond": len(self.frame_times),
                "errorCount": self.error_count,
                "nodes": sorted(
                    [
                        {
                            "nodeId": node["nodeId"],
                            "name": node.get("name") or f"node-{node['nodeId']}",
                            "displayName": node.get("displayName") or node.get("name") or f"Node {node['nodeId']}",
                            "deviceHint": node.get("deviceHint", "Unknown"),
                            "asciiHint": node.get("asciiHint", ""),
                            "status": "online",
                            "source": node.get("source", "MAVLink CAN_FRAME"),
                            "rxCount": node.get("rxCount", 0),
                            "lastCanId": node.get("lastCanId", ""),
                            "lastDataHex": node.get("lastDataHex", ""),
                            "lastDlc": node.get("lastDlc", 0),
                            "firstSeenAt": int(node.get("first_seen", now) * 1000),
                            "lastSeenAt": int(node.get("last_seen", now) * 1000),
                        }
                        for node in self.nodes.values()
                    ],
                    key=lambda item: item["nodeId"],
                ),
            }

    def enable_forward(self, hub, bus=1):
        if mavlink2 is None:
            raise RuntimeError("pymavlink is not installed")
        with self.lock:
            target_system = self.target_system
            target_component = self.target_component
        writer_buffer = bytearray()

        class Writer:
            def write(self, b):
                writer_buffer.extend(b)
                return len(b)

        mav = mavlink2.MAVLink(Writer(), srcSystem=245, srcComponent=190)
        cmd = mav.command_long_encode(
            target_system,
            target_component,
            mavlink2.MAV_CMD_CAN_FORWARD,
            0,
            float(bus),
            0,
            0,
            0,
            0,
            0,
            0,
        )
        mav.send(cmd)
        hub.write(bytes(writer_buffer))
        with self.lock:
            self.forward_enabled = True
        return {"bus": bus, "targetSystem": target_system, "targetComponent": target_component}


SLCAN_MONITOR = SlcanMavlinkMonitor()


def send_json(handler, status, payload):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    try:
        handler.wfile.write(body)
    except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
        # Browsers may cancel polling requests while navigating or refreshing.
        return


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self):
        if self.path == "/com-ports":
            send_json(self, 200, {"ports": read_ports()})
            return
        if self.path == "/bridge-status":
            send_json(self, 200, MAVLINK_HUB.status())
            return
        if self.path == "/bridge-read":
            data = MAVLINK_HUB.read_buffer()
            send_json(self, 200, {"data": base64.b64encode(data).decode("ascii")})
            return
        if self.path == "/slcan-status":
            port = detect_slcan_port()
            send_json(self, 200, {"adapterPort": port, **SLCAN_HUB.status()})
            return
        if self.path == "/slcan-nodes":
            send_json(self, 200, SLCAN_MONITOR.status())
            return
        if self.path == "/slcan-read":
            data = SLCAN_HUB.read_buffer()
            send_json(self, 200, {"data": base64.b64encode(data).decode("ascii")})
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception:
            send_json(self, 400, {"ok": False, "error": "invalid json"})
            return

        try:
            if self.path == "/bridge-open":
                port = str(payload.get("port") or "").strip()
                baudrate = int(payload.get("baudrate") or 115200)
                if not port:
                    raise RuntimeError("port is required")
                status = MAVLINK_HUB.open(port, baudrate)
                send_json(self, 200, {"ok": True, **status})
                return
            if self.path == "/bridge-close":
                MAVLINK_HUB.close()
                send_json(self, 200, {"ok": True})
                return
            if self.path == "/bridge-write":
                b64 = payload.get("data") or ""
                data = base64.b64decode(b64.encode("ascii"))
                written = MAVLINK_HUB.write(data)
                send_json(self, 200, {"ok": True, "written": written})
                return
            if self.path == "/slcan-open":
                port = str(payload.get("port") or "").strip() or str(detect_slcan_port() or "").strip()
                baudrate = int(payload.get("baudrate") or 115200)
                if not port:
                    raise RuntimeError("slcan adapter port not found")
                SLCAN_MONITOR.reset()
                status = SLCAN_HUB.open(port, baudrate)
                send_json(self, 200, {"ok": True, "adapterPort": port, **status})
                return
            if self.path == "/slcan-close":
                SLCAN_HUB.close()
                SLCAN_MONITOR.reset()
                send_json(self, 200, {"ok": True})
                return
            if self.path == "/slcan-forward-enable":
                bus = int(payload.get("bus") or 1)
                result = SLCAN_MONITOR.enable_forward(SLCAN_HUB, bus=bus)
                send_json(self, 200, {"ok": True, **result})
                return
            if self.path == "/slcan-write":
                b64 = payload.get("data") or ""
                data = base64.b64decode(b64.encode("ascii"))
                written = SLCAN_HUB.write(data)
                send_json(self, 200, {"ok": True, "written": written})
                return
        except Exception as e:
            send_json(self, 500, {"ok": False, "error": str(e)})
            return

        self.send_response(404)
        self.end_headers()

    def log_message(self, fmt, *args):
        return


if __name__ == "__main__":
    ThreadingHTTPServer.allow_reuse_address = True
    server = ThreadingHTTPServer(("127.0.0.1", 8765), Handler)
    print("COM bridge running at http://127.0.0.1:8765")
    server.serve_forever()
