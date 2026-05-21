#!/usr/bin/env python3
"""GCS desktop runtime: static UI (8766) + auto-started COM bridge (8765)."""
from __future__ import annotations

import json
import mimetypes
import sys
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from gcs_supervisor import bridge_healthy, ensure_bridge_process, watchdog_loop  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
UI_PORT = 8766


class GcsHttpHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(REPO_ROOT), **kwargs)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_POST(self):
        if self.path.split("?", 1)[0] == "/__gcs/ensure-bridge":
            ok = ensure_bridge_process(wait_s=15.0)
            body = json.dumps({"ok": ok, "bridgeReady": ok}).encode("utf-8")
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
        super().end_headers()

    def guess_type(self, path):
        ctype = mimetypes.guess_type(path)[0]
        return ctype or "application/octet-stream"

    def log_message(self, fmt, *args):
        return


def main() -> int:
    if not ensure_bridge_process(wait_s=15.0):
        print("Failed to start COM bridge on http://127.0.0.1:8765", file=sys.stderr)
        return 1

    threading.Thread(target=watchdog_loop, daemon=True).start()

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
