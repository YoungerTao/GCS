import base64
import json
import re
import subprocess
import sys
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


def _classify_port_item(item):
    name = str(item.get("name", "")).lower()
    dev = str(item.get("deviceId", "")).lower()
    if "slcan" in name or "slcan" in dev:
        return "slcan"
    if "mavlink" in name:
        return "mavlink"
    return "serial"


def _finalize_port_list(data):
    if not isinstance(data, list):
        return []
    for item in data:
        item["role"] = _classify_port_item(item)
        item["isSlcanAdapter"] = item["role"] == "slcan"
    return data


def _subprocess_no_window_kwargs():
    if sys.platform != "win32":
        return {}
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    if not flags:
        return {}
    kwargs = {"creationflags": flags}
    si = getattr(subprocess, "STARTUPINFO", None)
    if si is not None:
      startupinfo = subprocess.STARTUPINFO()
      startupinfo.dwFlags |= getattr(subprocess, "STARTF_USESHOWWINDOW", 0)
      startupinfo.wShowWindow = 0
      kwargs["startupinfo"] = startupinfo
    return kwargs


def _read_ports_windows():
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
        [
            "powershell",
            "-NoLogo",
            "-NonInteractive",
            "-NoProfile",
            "-WindowStyle",
            "Hidden",
            "-Command",
            ps_script,
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore",
        timeout=6,
        **_subprocess_no_window_kwargs(),
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
        data = _finalize_port_list(data)

        def com_key(item):
            m = re.match(r"COM(\d+)", str(item.get("deviceId", "")).upper())
            return int(m.group(1)) if m else 10**9

        data.sort(key=com_key)
        return data
    except Exception:
        return []


def _read_ports_unix():
    if serial is None:
        return []
    data = []
    try:
        from serial.tools import list_ports

        for p in list_ports.comports():
            device = str(p.device or "").strip()
            if not device:
                continue
            vid = p.vid
            pid = p.pid
            desc = (p.description or p.name or device).strip()
            item = {
                "deviceId": device,
                "name": desc,
                "usbVendorId": vid if isinstance(vid, int) else None,
                "usbProductId": pid if isinstance(pid, int) else None,
            }
            data.append(item)
    except Exception:
        return []

    data = _finalize_port_list(data)

    def _port_rank(item):
        dev = str(item.get("deviceId", "")).lower()
        name = str(item.get("name", "")).lower()
        if any(x in dev for x in ("bluetooth", "incoming-port", "debug-console")):
            return (2, dev)
        if any(x in name for x in ("bluetooth", "debug", "incoming")):
            return (2, dev)
        if any(x in dev for x in ("usbmodem", "usbserial", "ttyacm", "cu.usb")):
            return (0, dev)
        return (1, dev)

    data.sort(key=_port_rank)
    return data


def read_ports():
    if sys.platform == "win32":
        if serial is not None:
            try:
                return _read_ports_unix()
            except Exception:
                return []
        return []
    return _read_ports_unix()


_PORT_PROBE_CACHE = {"at": 0.0, "ports": []}
_PORT_PROBE_LOCK = threading.Lock()
_BAUD_PROBE_LOCK = threading.Lock()

DEFAULT_BAUD_PROBE_LIST = (921600, 460800, 230400, 115200, 57600)
_BAUD_PROBE_MAX_ELAPSED_S = 12.0


def _is_port_actively_bridged(dev_id):
    """Return True if this device is currently opened by the main MAVLink or SLCAN hub (avoid double-open during probe)."""
    if not dev_id:
        return False
    d = str(dev_id).strip()
    for hub in (MAVLINK_HUB, SLCAN_HUB):
        try:
            if hub and hub.port and str(hub.port).strip() == d:
                st = hub.status()
                if st.get("open"):
                    return True
        except Exception:
            pass
    return False

def _should_probe_port(item):
    dev = str(item.get("deviceId", "")).lower()
    if any(x in dev for x in ("bluetooth", "incoming-port", "debug-console")):
        return False
    if _is_port_actively_bridged(item.get("deviceId")):
        return False
    return any(x in dev for x in ("usbmodem", "usbserial", "ttyacm", "cu.", "com"))


def _count_mavlink_frames(data, max_frames=32):
    """Mission Planner 思路：用 MAVLink 解析器统计有效帧（优先 HEARTBEAT）。"""
    if not data or mavlink2 is None:
        return 0, False, 0
    parser = mavlink2.MAVLink(None)
    frames = 0
    heartbeat = False
    stx_hits = 0
    for byte in data:
        if byte in (0xFD, 0xFE):
            stx_hits += 1
        try:
            msg = parser.parse_char(bytes([byte]))
        except Exception:
            msg = None
        if msg is None:
            continue
        frames += 1
        try:
            if msg.get_type() == "HEARTBEAT":
                heartbeat = True
        except Exception:
            pass
        if frames >= max_frames:
            break
    return frames, heartbeat, stx_hits


def _count_slcan_lines(data):
    text = data.decode("ascii", errors="ignore")
    lines = 0
    lawicel = False
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        low = line.lower()
        if "lawicel" in low or "slcan" in low:
            lawicel = True
        if line[0] in ("T", "t", "R", "r") and len(line) >= 5:
            tail = line[1:]
            if all(c in "0123456789ABCDEFabcdef" for c in tail[: min(8, len(tail))]):
                lines += 1
    return lines, lawicel


def _printable_ratio(data):
    if not data:
        return 0.0
    printable = sum(1 for b in data if b in (9, 10, 13) or 32 <= b <= 126)
    return printable / max(1, len(data))


def _collect_port_sample(port, baudrate=115200):
    """短暂打开端口采样：先被动听 MAVLink，再发 SLCAN 初始化命令观察响应。"""
    if serial is None or not port:
        return b""
    hub = SerialHub("probe")
    buf = bytearray()
    try:
        hub.open(port, baudrate)
        time.sleep(0.42)
        buf.extend(hub.read_buffer(131072))
        for cmd in (b"C\r", b"S8\r", b"O\r", b"V\r"):
            try:
                hub.write(cmd)
            except Exception:
                pass
            time.sleep(0.05)
        time.sleep(0.22)
        buf.extend(hub.read_buffer(131072))
    except Exception:
        return b""
    finally:
        try:
            hub.close()
        except Exception:
            pass
    return bytes(buf)


def _score_mavlink_sample(data):
    """Return (score, analysis). score 0 = no MAVLink; slcan-only returns 0."""
    if not data:
        return 0, None
    mav_frames, heartbeat, _stx_hits = _count_mavlink_frames(data)
    analysis = _analyze_port_sample(data)
    role = str(analysis.get("probeRole", "unknown"))
    conf = str(analysis.get("probeConfidence", "low"))
    mav_n = int(analysis.get("probeMavlinkFrames") or mav_frames or 0)
    if role == "slcan":
        return 0, analysis
    if heartbeat:
        return 1000, analysis
    if role == "mavlink" and conf == "high" and mav_n >= 4:
        return 500 + min(mav_n, 99), analysis
    if mav_n >= 2:
        return 100 + min(mav_n, 99), analysis
    return 0, analysis


def _collect_port_sample_mavlink_only(port, baudrate=115200):
    """Passive MAVLink listen only (no SLCAN init commands)."""
    if serial is None or not port:
        return b""
    hub = SerialHub("baud-probe")
    buf = bytearray()
    try:
        hub.open(port, baudrate)
        time.sleep(0.45)
        buf.extend(hub.read_buffer(131072))
    except Exception:
        return b""
    finally:
        try:
            hub.close()
        except Exception:
            pass
    return bytes(buf)


def probe_baud_for_port(port, baud_list=None):
    """Try baud rates (high to low); return first with MAVLink score > 0."""
    port = str(port or "").strip()
    if not port:
        return {"ok": False, "error": "port required"}
    if serial is None:
        return {"ok": False, "error": "pyserial unavailable"}
    if _is_port_actively_bridged(port):
        return {"ok": False, "error": "in-use"}

    raw_list = baud_list if baud_list is not None else DEFAULT_BAUD_PROBE_LIST
    bauds = []
    seen = set()
    for b in raw_list:
        try:
            n = int(b)
        except (TypeError, ValueError):
            continue
        if n <= 0 or n in seen:
            continue
        seen.add(n)
        bauds.append(n)
    if not bauds:
        bauds = list(DEFAULT_BAUD_PROBE_LIST)

    t0 = time.time()
    tried = []
    best_slcan_score = 0
    with _BAUD_PROBE_LOCK:
        for baud in bauds:
            if time.time() - t0 > _BAUD_PROBE_MAX_ELAPSED_S:
                break
            score = 0
            analysis = None
            err = None
            try:
                sample = _collect_port_sample_mavlink_only(port, baud)
                score, analysis = _score_mavlink_sample(sample)
            except Exception as exc:
                err = str(exc)
                score = 0
            row = {"baud": baud, "score": score}
            if err:
                row["error"] = err
            if analysis:
                row["probeRole"] = analysis.get("probeRole")
            tried.append(row)
            if score > 0:
                elapsed_ms = int((time.time() - t0) * 1000)
                return {
                    "ok": True,
                    "baud": baud,
                    "score": score,
                    "probeRole": (analysis or {}).get("probeRole", "mavlink"),
                    "tried": tried,
                    "elapsedMs": elapsed_ms,
                }
            slcan_score = 0
            if analysis and str(analysis.get("probeRole")) == "slcan":
                slcan_score = int(analysis.get("probeSlcanLines") or 0) + 50
            best_slcan_score = max(best_slcan_score, slcan_score)

    elapsed_ms = int((time.time() - t0) * 1000)
    if best_slcan_score > 0:
        return {
            "ok": False,
            "reason": "slcan",
            "error": "port looks like SLCAN adapter",
            "tried": tried,
            "elapsedMs": elapsed_ms,
        }
    return {
        "ok": False,
        "error": "no mavlink at tried baud rates",
        "tried": tried,
        "elapsedMs": elapsed_ms,
    }


def _analyze_port_sample(data):
    mav_frames, heartbeat, stx_hits = _count_mavlink_frames(data)
    slcan_lines, lawicel = _count_slcan_lines(data)
    printable = _printable_ratio(data)
    detail_parts = [
        f"mav={mav_frames}",
        f"hb={1 if heartbeat else 0}",
        f"stx={stx_hits}",
        f"slcan={slcan_lines}",
        f"ascii={printable:.2f}",
    ]
    detail = ",".join(detail_parts)

    if heartbeat or mav_frames >= 4:
        return {
            "probeRole": "mavlink",
            "probeConfidence": "high",
            "probeDetail": detail + (",heartbeat" if heartbeat else ""),
            "probeMavlinkFrames": mav_frames,
            "probeSlcanLines": slcan_lines,
        }
    if mav_frames >= 2 and slcan_lines == 0 and stx_hits >= 6:
        return {
            "probeRole": "mavlink",
            "probeConfidence": "high",
            "probeDetail": detail,
            "probeMavlinkFrames": mav_frames,
            "probeSlcanLines": slcan_lines,
        }
    if slcan_lines >= 1 and mav_frames == 0 and stx_hits < 3:
        return {
            "probeRole": "slcan",
            "probeConfidence": "high",
            "probeDetail": detail + ",t-frames",
            "probeMavlinkFrames": mav_frames,
            "probeSlcanLines": slcan_lines,
        }
    if lawicel and mav_frames == 0:
        return {
            "probeRole": "slcan",
            "probeConfidence": "medium",
            "probeDetail": detail + ",lawicel",
            "probeMavlinkFrames": mav_frames,
            "probeSlcanLines": slcan_lines,
        }
    if stx_hits >= 3 and mav_frames >= 1:
        return {
            "probeRole": "mavlink",
            "probeConfidence": "medium",
            "probeDetail": detail,
            "probeMavlinkFrames": mav_frames,
            "probeSlcanLines": slcan_lines,
        }
    return {
        "probeRole": "unknown",
        "probeConfidence": "low",
        "probeDetail": detail,
        "probeMavlinkFrames": mav_frames,
        "probeSlcanLines": slcan_lines,
    }


def _apply_probe_analysis(item, analysis):
    item.update(analysis)
    role = str(analysis.get("probeRole", "unknown"))
    if role in ("mavlink", "slcan"):
        item["role"] = role
        item["isSlcanAdapter"] = role == "slcan"
    else:
        item["role"] = _classify_port_item(item)
        item["isSlcanAdapter"] = item["role"] == "slcan"
    return item


def _resolve_probe_group(group, baudrate=115200):
    """同 VID/PID 双口对比判定（与 MP 里两路分别打开对比一致）。"""
    if not group:
        return group
    candidates = [x for x in group if _should_probe_port(x)]
    if not candidates:
        return group

    scored = []
    for item in candidates:
        sample = _collect_port_sample(item.get("deviceId"), baudrate)
        analysis = _analyze_port_sample(sample)
        _apply_probe_analysis(item, analysis)
        scored.append(
            (
                item,
                int(analysis.get("probeMavlinkFrames") or 0),
                str(analysis.get("probeRole")),
                str(analysis.get("probeConfidence")),
            )
        )

    if len(scored) < 2:
        return group

    scored.sort(key=lambda row: row[1], reverse=True)
    best_mav = scored[0]
    second = scored[1]

    if best_mav[1] >= 2 and second[1] == 0:
        _apply_probe_analysis(
            best_mav[0],
            {
                "probeRole": "mavlink",
                "probeConfidence": "high",
                "probeDetail": f"pair-win,mav={best_mav[1]}",
                "probeMavlinkFrames": best_mav[1],
                "probeSlcanLines": 0,
            },
        )
        _apply_probe_analysis(
            second[0],
            {
                "probeRole": "slcan",
                "probeConfidence": "high" if second[3] in ("medium", "high") else "medium",
                "probeDetail": "pair-other",
                "probeMavlinkFrames": second[1],
                "probeSlcanLines": int(second[0].get("probeSlcanLines") or 0),
            },
        )
        return group

    ordered = sorted(candidates, key=lambda x: str(x.get("deviceId", "")).lower())
    if ordered[0].get("probeRole") == "unknown" and ordered[1].get("probeRole") == "unknown":
        ordered[0]["probeRole"] = "mavlink"
        ordered[0]["probeConfidence"] = "heuristic"
        ordered[0]["probeDetail"] = "order-first"
        ordered[1]["probeRole"] = "slcan"
        ordered[1]["probeConfidence"] = "heuristic"
        ordered[1]["probeDetail"] = "order-second"
        for item in ordered:
            _sync_port_role_fields(item)
    return group


def _sync_port_role_fields(item):
    role = str(item.get("probeRole", "unknown"))
    if role in ("mavlink", "slcan"):
        item["role"] = role
        item["isSlcanAdapter"] = role == "slcan"
    return item


def probe_serial_role(port, baudrate=115200):
    analysis = _analyze_port_sample(_collect_port_sample(port, baudrate))
    return str(analysis.get("probeRole", "unknown"))


def _apply_port_role_probes(ports, baudrate=115200):
    if not ports:
        return []
    out = []
    groups = {}
    for raw in ports:
        item = dict(raw)
        if not _should_probe_port(item):
            item["probeRole"] = _classify_port_item(item)
            item["probeConfidence"] = "n/a"
            item["probeDetail"] = "skip"
            _sync_port_role_fields(item)
            out.append(item)
            continue
        out.append(item)
        vid = item.get("usbVendorId")
        pid = item.get("usbProductId")
        if isinstance(vid, int) and isinstance(pid, int):
            groups.setdefault((vid, pid), []).append(item)

    for group in groups.values():
        if len(group) >= 2 and all(_should_probe_port(x) for x in group):
            _resolve_probe_group(group, baudrate)
            continue
        for item in group:
            if item.get("probeRole") in ("mavlink", "slcan"):
                continue
            if _is_port_actively_bridged(item.get("deviceId")):
                item["probeRole"] = _classify_port_item(item)
                item["probeConfidence"] = "n/a"
                item["probeDetail"] = "in-use-by-bridge"
                _sync_port_role_fields(item)
                continue
            analysis = _analyze_port_sample(_collect_port_sample(item.get("deviceId"), baudrate))
            _apply_probe_analysis(item, analysis)

    for item in out:
        if item.get("probeRole") not in ("mavlink", "slcan"):
            _sync_port_role_fields(item)
    return out


def read_ports_with_roles(force=False, baudrate=115200):
    global _PORT_PROBE_CACHE
    with _PORT_PROBE_LOCK:
        now = time.time()
        if (
            not force
            and _PORT_PROBE_CACHE.get("ports")
            and (now - float(_PORT_PROBE_CACHE.get("at") or 0)) < 12.0
        ):
            return list(_PORT_PROBE_CACHE["ports"])
        base = read_ports()
        probed = _apply_port_role_probes(base, baudrate)
        _PORT_PROBE_CACHE = {"at": now, "ports": probed}
        return probed


_SLCAN_DETECT_CACHE = {"at": 0.0, "port": None}
_SLCAN_DETECT_TTL_S = 30.0


def detect_slcan_port(force=False):
    now = time.time()
    if not force and (now - float(_SLCAN_DETECT_CACHE.get("at") or 0)) < _SLCAN_DETECT_TTL_S:
        return _SLCAN_DETECT_CACHE.get("port")
    port = None
    for item in read_ports_with_roles():
        if item.get("probeRole") == "slcan" or item.get("isSlcanAdapter"):
            port = item.get("deviceId")
            break
    _SLCAN_DETECT_CACHE["at"] = now
    _SLCAN_DETECT_CACHE["port"] = port
    return port


class SerialHub:
    def __init__(self, label):
        self.label = label
        self.lock = threading.Lock()
        self.serial = None
        self.port = None
        self.baudrate = 115200
        self.rx_buffer = bytearray()
        self.reader_thread = None
        self._last_rx_at = 0.0
        self._rx_bytes_total = 0
        self._reader_alive = False
        self._generation = 0
        self._session_seq = 0
        self._session_id = 0
        self._last_error = ""
        self._last_open_port = None
        self._last_open_baud = None

    def status(self):
        with self.lock:
            now = time.time()
            last_rx_age = (now - self._last_rx_at) if getattr(self, "_last_rx_at", 0) else 999
            return {
                "label": self.label,
                "open": self.serial is not None and getattr(self.serial, "is_open", False),
                "port": self.port,
                "baudrate": self.baudrate,
                "sessionId": getattr(self, "_session_id", 0),
                "lastRxAgeSec": round(last_rx_age, 2) if last_rx_age < 999 else None,
                "bytesRx": getattr(self, "_rx_bytes_total", 0),
                "rxBytesTotal": getattr(self, "_rx_bytes_total", 0),
                "readerAlive": getattr(self, "_reader_alive", False),
                "lastOpenPort": getattr(self, "_last_open_port", None),
                "lastOpenBaud": getattr(self, "_last_open_baud", None),
                "error": getattr(self, "_last_error", ""),
            }

    def open(self, port, baudrate):
        if serial is None:
            raise RuntimeError("pyserial is not installed")
        self.close()
        s = serial.Serial(port, baudrate=baudrate, timeout=0.2, write_timeout=3.0)
        # Prevent USB-serial adapters from asserting DTR/RTS which often resets ArduPilot/CUAV/etc flight controllers
        try:
            s.dtr = False
            s.rts = False
        except Exception:
            pass
        with self.lock:
            self._generation += 1
            generation = self._generation
            self._session_seq += 1
            self._session_id = self._session_seq
            self.serial = s
            self.port = port
            self.baudrate = baudrate
            self.rx_buffer = bytearray()
            self._last_rx_at = 0.0
            self._rx_bytes_total = 0
            self._reader_alive = True
            self._last_error = ""
            self._last_open_port = port
            self._last_open_baud = baudrate
        self.reader_thread = threading.Thread(target=self._reader_loop, args=(generation,), daemon=True)
        self.reader_thread.start()
        return self.status()

    def close(self):
        with self.lock:
            s = self.serial
            t = self.reader_thread
            self._generation += 1
            self.serial = None
            self.port = None
            self.rx_buffer = bytearray()
            self._last_rx_at = 0.0
            self._rx_bytes_total = 0
            self._reader_alive = False
            self._session_id = 0
            self._last_error = ""
            self.reader_thread = None
        if s is not None:
            try:
                s.close()
            except Exception:
                pass
        if t is not None and t.is_alive() and t is not threading.current_thread():
            try:
                t.join(timeout=1.0)
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

    def _reader_loop(self, generation):
        while True:
            with self.lock:
                if generation != self._generation:
                    return
                s = self.serial
            if s is None or not getattr(s, "is_open", False):
                with self.lock:
                    if generation == self._generation:
                        self._reader_alive = False
                return
            try:
                data = s.read(4096)
                if data:
                    now = time.time()
                    with self.lock:
                        if generation != self._generation:
                            return
                        self.rx_buffer.extend(data)
                        self._last_rx_at = now
                        self._rx_bytes_total = getattr(self, "_rx_bytes_total", 0) + len(data)
                    if self.label in ("slcan", "bridge"):
                        SLCAN_MONITOR.feed(data)
            except Exception as exc:
                with self.lock:
                    if generation == self._generation:
                        self._reader_alive = False
                        self._last_error = str(exc)
                return


MAVLINK_HUB = SerialHub("bridge")
SLCAN_HUB = SerialHub("slcan")

# Lawicel SLCAN bitrate codes (S0..S8)
SLCAN_BITRATE_CODE = {
    10: "0",
    20: "1",
    50: "2",
    100: "3",
    125: "4",
    250: "5",
    500: "6",
    800: "7",
    1000: "8",
}


def init_slcan_adapter(hub, bitrate_kbps=1000):
    """Bring up a USB-CAN adapter in native SLCAN ASCII mode (not MAVLink CAN_FORWARD)."""
    code = SLCAN_BITRATE_CODE.get(int(bitrate_kbps))
    if not code:
        raise RuntimeError(f"unsupported slcan bitrate {bitrate_kbps}")
    # Reset adapter state: close, set bitrate, open CAN.
    for cmd in (b"C\r", f"S{code}\r".encode("ascii"), b"O\r"):
        hub.write(cmd)
        time.sleep(0.08)


def _parse_can_id(frame_id):
    raw = int(frame_id) & 0x1FFFFFFF
    return {
        "raw": raw,
        "priority": (raw >> 24) & 0x1F,
        "dataTypeId": (raw >> 8) & 0xFFFF,
        "isService": bool((raw >> 7) & 1),
        "sourceNodeId": raw & 0x7F,
    }


def _decode_node_status_uptime(frame_id, data_bytes):
    parsed = _parse_can_id(frame_id)
    if parsed["isService"] or parsed["dataTypeId"] != 341:
        return None
    if len(data_bytes) < 4:
        return None
    return int.from_bytes(data_bytes[:4], "little", signed=False)


class SlcanMavlinkMonitor:
    def __init__(self):
        self.lock = threading.Lock()
        self.parser = mavlink2.MAVLink(None) if mavlink2 is not None else None
        self.slcan_ascii_buffer = bytearray()
        self.forward_enabled = False
        self.target_system = 1
        self.target_component = 1
        self.frame_times = []
        self.error_count = 0
        self.nodes = {}
        self.node_ascii = {}
        self.node_recent_frames = {}
        self.node_frame_counts = {}
        self.last_frame_at = 0.0

    def reset(self):
        with self.lock:
            self.parser = mavlink2.MAVLink(None) if mavlink2 is not None else None
            self.slcan_ascii_buffer = bytearray()
            self.forward_enabled = False
            self.target_system = 1
            self.target_component = 1
            self.frame_times = []
            self.error_count = 0
            self.nodes = {}
            self.node_ascii = {}
            self.node_recent_frames = {}
            self.node_frame_counts = {}
            self.last_frame_at = 0.0

    def _trim_frames(self, now):
        self.frame_times = [t for t in self.frame_times if now - t <= 1.0]

    def _prune_nodes(self, now, max_age_s=15.0):
        stale = [node_id for node_id, node in self.nodes.items() if now - node.get("last_seen", 0) > max_age_s]
        for node_id in stale:
            self.nodes.pop(node_id, None)
            self.node_ascii.pop(node_id, None)
            self.node_recent_frames.pop(node_id, None)
            self.node_frame_counts.pop(node_id, None)

    def feed(self, data):
        if not data:
            return
        with self.lock:
            self._feed_slcan_ascii(data)
            if self.parser is None:
                return
            for byte in data:
                try:
                    msg = self.parser.parse_char(bytes([byte]))
                except Exception:
                    msg = None
                if msg is None:
                    continue
                self._handle_message(msg)

    def _feed_slcan_ascii(self, data):
        self.slcan_ascii_buffer.extend(data)
        while True:
            idx = -1
            for sep in (b"\r", b"\n"):
                pos = self.slcan_ascii_buffer.find(sep)
                if pos != -1 and (idx == -1 or pos < idx):
                    idx = pos
            if idx == -1:
                break
            line = bytes(self.slcan_ascii_buffer[:idx]).strip()
            del self.slcan_ascii_buffer[: idx + 1]
            if not line:
                continue
            try:
                self._handle_slcan_line(line.decode("ascii", errors="ignore"))
            except Exception:
                continue

    def _handle_slcan_line(self, line):
        if not line:
            return
        head = line[0]
        if head not in ("T", "t"):
            # Ignore adapter chatter (version strings, OK/ERROR, etc.)
            return
        extended = head == "T"
        can_id_len = 8 if extended else 3
        min_len = 1 + can_id_len + 1
        if len(line) < min_len:
            return
        can_id = int(line[1:1 + can_id_len], 16)
        dlc = int(line[1 + can_id_len], 16)
        data_hex = line[2 + can_id_len: 2 + can_id_len + dlc * 2]
        if len(data_hex) < dlc * 2:
            return
        data_bytes = bytes.fromhex(data_hex)
        self._handle_can_frame(can_id, dlc, data_bytes, bus=1, source="SLCAN Direct")

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
            raw_data = msg_dict.get("data", [])
            if isinstance(raw_data, (bytes, bytearray)):
                data_bytes = bytes(raw_data)
            else:
                data_bytes = bytes(int(x) & 0xFF for x in raw_data[: int(msg_dict.get("len", 0))])
            self._handle_can_frame(
                frame_id,
                int(msg_dict.get("len", 0)),
                data_bytes,
                bus=int(msg_dict.get("bus", 0)) + 1,
                source=f"MAVLink CAN{int(msg_dict.get('bus', 0)) + 1}",
            )
            return

    def _handle_can_frame(self, frame_id, dlc, data_bytes, bus=1, source="SLCAN Direct"):
        now = time.time()
        self.last_frame_at = now
        node_id = frame_id & 0x7F
        if 0 < node_id <= 127:
            node = self.nodes.get(node_id, {
                "nodeId": node_id,
                "name": "org.ardupilot" if node_id == 1 else f"node-{node_id}",
                "status": "online",
                "source": source,
                "rxCount": 0,
                "first_seen": now,
            })
            node["status"] = "online"
            node["source"] = source
            node["rxCount"] = int(node.get("rxCount", 0)) + 1
            node["last_seen"] = now
            node["lastCanId"] = f"0x{frame_id:X}"
            node["lastDlc"] = int(dlc)
            node["lastDataHex"] = data_bytes.hex().upper()
            uptime_sec = _decode_node_status_uptime(frame_id, data_bytes)
            if uptime_sec is not None:
                node["uptimeSec"] = uptime_sec
            recent = self.node_recent_frames.get(node_id, [])
            recent.append({
                "ts": int(now * 1000),
                "canId": f"0x{frame_id:X}",
                "dlc": int(dlc),
                "dataHex": data_bytes.hex().upper(),
                "bus": int(bus),
            })
            self.node_recent_frames[node_id] = recent[-40:]
            counts = self.node_frame_counts.get(node_id, {})
            can_id_key = f"0x{frame_id:X}"
            counts[can_id_key] = int(counts.get(can_id_key, 0)) + 1
            self.node_frame_counts[node_id] = counts
            inferred_name = self._infer_node_name(node_id, "")
            node["name"] = inferred_name["name"]
            node["displayName"] = inferred_name["displayName"]
            node["deviceHint"] = inferred_name["deviceHint"]
            node["asciiHint"] = ""
            self.nodes[node_id] = node
        self.frame_times.append(now)
        self._trim_frames(now)

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
        if node_id == 10:
            return {
                "name": "org.ardupilot",
                "displayName": "ArduPilot Flight Controller",
                "deviceHint": "Likely flight controller",
            }
        if node_id == 34:
            return {
                "name": "org.cuav.can_pmu_lite",
                "displayName": "CUAV CAN PMU Lite",
                "deviceHint": "Power module / BEC",
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
            # Do not immediately drop nodes on brief parser / polling gaps.
            if now - self.last_frame_at > 15.0:
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
                            "uptimeSec": node.get("uptimeSec"),
                            "lastCanId": node.get("lastCanId", ""),
                            "lastDataHex": node.get("lastDataHex", ""),
                            "lastDlc": node.get("lastDlc", 0),
                            "firstSeenAt": int(node.get("first_seen", now) * 1000),
                            "lastSeenAt": int(node.get("last_seen", now) * 1000),
                            "recentFrames": list(self.node_recent_frames.get(node["nodeId"], []))[-20:],
                            "frameIdCounts": dict(sorted(self.node_frame_counts.get(node["nodeId"], {}).items(), key=lambda kv: kv[1], reverse=True)[:12]),
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
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def end_headers(self):
        headers_buf = getattr(self, "_headers_buffer", [])
        has_cors = any(b"Access-Control-Allow-Origin:" in chunk for chunk in headers_buf)
        if not has_cors:
            self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def do_GET(self):
        if self.path == "/health":
            mav = MAVLINK_HUB.status() if 'MAVLINK_HUB' in globals() else {}
            send_json(self, 200, {
                "ok": True,
                "service": "com-bridge",
                "mavlinkBridge": {
                    "sessionId": mav.get("sessionId"),
                    "open": mav.get("open", False),
                    "port": mav.get("port"),
                    "lastRxAgeSec": mav.get("lastRxAgeSec"),
                    "readerAlive": mav.get("readerAlive"),
                    "bytesRx": mav.get("bytesRx"),
                    "error": mav.get("error"),
                },
            })
            return
        if self.path.startswith("/com-ports"):
            try:
                probe = "probe=1" in self.path or "probe=true" in self.path
                baud = 115200
                if "baud=" in self.path:
                    m = re.search(r"baud=(\d+)", self.path)
                    if m:
                        baud = int(m.group(1))
                ports = read_ports_with_roles(force=probe, baudrate=baud)
                send_json(self, 200, {"ports": ports, "probed": True})
            except Exception as exc:
                send_json(self, 500, {"ports": [], "ok": False, "error": str(exc)})
            return
        if self.path == "/bridge-status":
            send_json(self, 200, MAVLINK_HUB.status())
            return
        if self.path == "/bridge-read":
            data = MAVLINK_HUB.read_buffer()
            send_json(self, 200, {"data": base64.b64encode(data).decode("ascii")})
            return
        if self.path == "/slcan-status":
            st = SLCAN_HUB.status()
            port = st.get("port") if st.get("open") else detect_slcan_port()
            send_json(self, 200, {"adapterPort": port, **st})
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
            if self.path == "/bridge-probe-baud":
                port = str(payload.get("port") or "").strip()
                bauds = payload.get("bauds")
                if bauds is not None and not isinstance(bauds, list):
                    bauds = None
                result = probe_baud_for_port(port, bauds)
                send_json(self, 200, result)
                return
            if self.path == "/bridge-open":
                port = str(payload.get("port") or "").strip()
                baudrate = int(payload.get("baudrate") or 115200)
                if not port:
                    raise RuntimeError("port is required")
                status = MAVLINK_HUB.open(port, baudrate)
                send_json(self, 200, {"ok": True, **status})
                return
            if self.path == "/bridge-close":
                prev = MAVLINK_HUB.status()
                MAVLINK_HUB.close()
                send_json(self, 200, {"ok": True, "sessionClosed": prev.get("sessionId", 0), **MAVLINK_HUB.status()})
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
                bitrate_kbps = int(payload.get("bitrate_kbps") or 1000)
                if not port:
                    raise RuntimeError("slcan adapter port not found")
                try:
                    SLCAN_MONITOR.reset()
                    status = SLCAN_HUB.open(port, baudrate)
                    init_slcan_adapter(SLCAN_HUB, bitrate_kbps=bitrate_kbps)
                    send_json(self, 200, {
                        "ok": True,
                        "adapterPort": port,
                        "bitrateKbps": bitrate_kbps,
                        "slcanInit": True,
                        **status,
                    })
                except Exception as exc:
                    send_json(self, 200, {"ok": False, "error": str(exc), "adapterPort": port})
                return
            if self.path == "/slcan-init":
                bitrate_kbps = int(payload.get("bitrate_kbps") or 1000)
                force = bool(payload.get("force"))
                if not SLCAN_HUB.status().get("open"):
                    raise RuntimeError("slcan port not open")
                now = time.time()
                last_init = getattr(SLCAN_HUB, "_last_slcan_init_at", 0.0)
                if not force and now - last_init < 30.0:
                    send_json(self, 200, {"ok": True, "skipped": True, "bitrateKbps": bitrate_kbps})
                    return
                try:
                    init_slcan_adapter(SLCAN_HUB, bitrate_kbps=bitrate_kbps)
                    SLCAN_HUB._last_slcan_init_at = now
                    send_json(self, 200, {"ok": True, "bitrateKbps": bitrate_kbps, "slcanInit": True})
                except Exception as exc:
                    send_json(self, 200, {"ok": False, "error": str(exc), "bitrateKbps": bitrate_kbps})
                return
            if self.path == "/slcan-close":
                SLCAN_HUB.close()
                SLCAN_MONITOR.reset()
                send_json(self, 200, {"ok": True})
                return
            if self.path == "/slcan-forward-enable":
                bus = int(payload.get("bus") or 1)
                mav_open = MAVLINK_HUB.status().get("open")
                slcan_open = SLCAN_HUB.status().get("open")
                if mav_open:
                    hub = MAVLINK_HUB
                    transport = "mavlink-bridge"
                elif slcan_open:
                    hub = SLCAN_HUB
                    transport = "slcan"
                else:
                    raise RuntimeError(
                        "open GCS serial first (connect flight controller), or plug in a USB-CAN SLCAN adapter"
                    )
                result = SLCAN_MONITOR.enable_forward(hub, bus=bus)
                send_json(self, 200, {"ok": True, "transport": transport, **result})
                return
            if self.path == "/slcan-write":
                b64 = payload.get("data") or ""
                data = base64.b64decode(b64.encode("ascii"))
                written = SLCAN_HUB.write(data)
                send_json(self, 200, {"ok": True, "written": written})
                return
            if self.path == "/slcan-inject":
                line = str(payload.get("line") or "").strip()
                if not line:
                    raise RuntimeError("line is required")
                SLCAN_MONITOR.feed((line + "\r").encode("ascii"))
                status = SLCAN_MONITOR.status()
                send_json(self, 200, {"ok": True, "injected": line, **status})
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
