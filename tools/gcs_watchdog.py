#!/usr/bin/env python3
"""Lightweight launcher (127.0.0.1:8767): start GCS runtime + COM bridge on demand."""
from __future__ import annotations

import json
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from gcs_http import local_http_ok  # noqa: E402
from gcs_supervisor import ensure_bridge_process, bridge_healthy, gcs_python  # noqa: E402
from map_tiles_supervisor import ensure_tile_server, tile_server_healthy  # noqa: E402

REPO_ROOT = TOOLS_DIR.parent
RUNTIME_SCRIPT = TOOLS_DIR / "gcs-runtime.py"
LAUNCHER_PORT = 8767
RUNTIME_PING = "http://127.0.0.1:8766/__gcs/ping"

_launch_lock = threading.Lock()
_runtime_proc: subprocess.Popen | None = None


def runtime_healthy(timeout_s: float = 1.2) -> bool:
    return local_http_ok(RUNTIME_PING, timeout_s=timeout_s)


def _spawn_runtime_locked() -> None:
    global _runtime_proc
    if runtime_healthy():
        return
    if _runtime_proc is not None and _runtime_proc.poll() is None:
        return
    flags = 0
    if sys.platform == "win32":
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    _runtime_proc = subprocess.Popen(
        [gcs_python(), str(RUNTIME_SCRIPT), "--no-browser"],
        cwd=str(REPO_ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=flags,
    )


def launch_runtime(wait_s: float = 20.0) -> bool:
    with _launch_lock:
        _spawn_runtime_locked()
    deadline = time.time() + wait_s
    while time.time() < deadline:
        if runtime_healthy():
            ensure_bridge_process(wait_s=10.0, force_restart=not bridge_healthy())
            threading.Thread(
                target=ensure_tile_server,
                kwargs={"wait_s": 15.0, "force_restart": not tile_server_healthy()},
                daemon=True,
            ).start()
            return True
        time.sleep(0.3)
    return runtime_healthy()


def send_json(handler, status: int, payload: dict) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class LauncherHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/ping":
            send_json(self, 200, {
                "ok": True,
                "service": "gcs-watchdog",
                "runtimeUp": runtime_healthy(),
                "bridgeUp": bridge_healthy(),
                "tileServerUp": tile_server_healthy(),
            })
            return
        self.send_response(404)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path == "/launch":
            ok = launch_runtime(wait_s=25.0)
            send_json(self, 200 if ok else 503, {
                "ok": ok,
                "runtimeUp": runtime_healthy(),
                "bridgeUp": bridge_healthy(),
                "tileServerUp": tile_server_healthy(),
            })
            return
        self.send_response(404)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

    def log_message(self, fmt, *args):
        return


def main() -> int:
    ThreadingHTTPServer.allow_reuse_address = True
    httpd = ThreadingHTTPServer(("127.0.0.1", LAUNCHER_PORT), LauncherHandler)
    if sys.stdout is not None and getattr(sys.stdout, "isatty", lambda: False)():
        print(f"GCS launcher watchdog http://127.0.0.1:{LAUNCHER_PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
