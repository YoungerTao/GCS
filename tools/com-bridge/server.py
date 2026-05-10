import json
import re
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer


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
        # 按 COM 数字排序：COM1, COM2, ... COM26
        def com_key(item):
            m = re.match(r"COM(\d+)", str(item.get("deviceId", "")).upper())
            return int(m.group(1)) if m else 10**9
        data.sort(key=com_key)
        return data
    except Exception:
        return []


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/com-ports":
            self.send_response(404)
            self.end_headers()
            return
        ports = read_ports()
        body = json.dumps({"ports": ports}, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        return


if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", 8765), Handler)
    print("COM bridge running at http://127.0.0.1:8765/com-ports")
    server.serve_forever()
