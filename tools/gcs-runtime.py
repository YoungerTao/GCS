#!/usr/bin/env python3
"""GCS desktop runtime: static UI (8766) + auto-started COM bridge (8765)."""
from __future__ import annotations

import json
import mimetypes
import sys
import threading
import time
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote


def _is_microsoft_store_python(exe: str) -> bool:
    s = (exe or "").lower().replace("\\", "/")
    return "windowsapps" in s or "pythonsoftwarefoundation" in s


if _is_microsoft_store_python(sys.executable):
    raise RuntimeError(
        "GCS runtime 检测到 Microsoft Store 版 Python（受沙箱限制），静态文件（如 JS/data/apm-param-db.json）可能无法服务，"
        "串口桥也会失败。使用官方 python.org Python 重新创建 .venv 后启动。"
    )

TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from gcs_supervisor import bridge_healthy, ensure_bridge_process, watchdog_loop, get_last_bridge_error  # noqa: E402
from map_tiles_supervisor import ensure_tile_server_process, tile_server_healthy  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
UI_PORT = 8766


def bridge_warmup_loop(initial_wait_s: float = 15.0, retry_interval_s: float = 10.0) -> None:
    while True:
        try:
            # ensure_bridge_process now includes mtime-based stale code detection (self-heal after git pull)
            if ensure_bridge_process(wait_s=initial_wait_s):
                return
        except Exception:
            pass
        time.sleep(retry_interval_s)


def tile_server_watchdog_loop(interval_s: float = 10.0) -> None:
    while True:
        try:
            if not tile_server_healthy(timeout_s=1.0):
                ensure_tile_server_process(force_restart=True, wait_s=15.0)
        except Exception:
            pass
        time.sleep(interval_s)


class GcsHttpHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(REPO_ROOT), **kwargs)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-GCS-Tab-Id")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path == "/__gcs/ensure-bridge":
            # calls into supervisor which does apiVersion/mtime check vs disk for bridge; force-restarts if stale
            qs = self.path.split("?", 1)[1] if "?" in self.path else ""
            force = "force=1" in qs or self.headers.get("X-GCS-Force-Bridge-Restart") == "1"
            ok = ensure_bridge_process(wait_s=15.0, force_restart=force)
            body = json.dumps({"ok": ok, "bridgeReady": ok}).encode("utf-8")
            self.send_response(200 if ok else 503)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/__gcs/ensure-tile-server":
            # ensure_tile_server_process now includes mtime-based stale detection for parity
            ok = ensure_tile_server_process(wait_s=15.0)
            body = json.dumps({"ok": ok, "tileServerUp": ok}).encode("utf-8")
            self.send_response(200 if ok else 503)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_error(404)

    def do_GET(self):
        path = unquote(self.path.split("?", 1)[0])
        if path == "/__gcs/ping":
            body = json.dumps({
                "ok": True,
                "service": "gcs-runtime",
                "bridgeUp": bridge_healthy(),
                "tileServerUp": tile_server_healthy(),
                "bridgeError": get_last_bridge_error() or None,
                # scriptMtime for bridge/tile available on their /health (auto self-heal on stale)
            }).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path in ("", "/"):
            self.path = "/index.html"
        return super().do_GET()

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        # Local UI assets should always reflect the current workspace state.
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def guess_type(self, path):
        ctype = mimetypes.guess_type(path)[0]
        return ctype or "application/octet-stream"

    def log_message(self, fmt, *args):
        return


def main() -> int:
    # Serve the UI first so cold-start waits do not block the browser window.
    threading.Thread(target=bridge_warmup_loop, daemon=True).start()
    threading.Thread(
        target=ensure_tile_server_process,
        kwargs={"wait_s": 3.0},
        daemon=True,
    ).start()
    threading.Thread(target=watchdog_loop, daemon=True).start()
    threading.Thread(target=tile_server_watchdog_loop, daemon=True).start()

    ThreadingHTTPServer.allow_reuse_address = True
    httpd = ThreadingHTTPServer(("127.0.0.1", UI_PORT), GcsHttpHandler)
    url = f"http://127.0.0.1:{UI_PORT}/index.html"
    print(f"GCS UI:    {url}")
    print("COM bridge: http://127.0.0.1:8765 (auto-managed)")
    if "--no-browser" not in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
