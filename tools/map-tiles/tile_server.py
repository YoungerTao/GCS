#!/usr/bin/env python3
"""Local map tile cache + HTTP API for GCS (127.0.0.1:8768)."""
from __future__ import annotations

import json
import math
import os
import re
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs

from terrain_elevation import MODEL as TERRAIN
from terrain_elevation import PREFETCH as TERRAIN_PREFETCH

PORT = 8768
HOST = "127.0.0.1"
TILE_BYTES_ESTIMATE = 18 * 1024
MAX_PREFETCH_TILES = 200_000

LAYER_URLS = {
    "imagery": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    "roads": "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
    "places": "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
}
VALID_LAYERS = frozenset(LAYER_URLS)


def tile_root() -> Path:
    env = os.environ.get("GCS_MAP_TILE_ROOT")
    if env:
        return Path(env).expanduser()
    return Path.home() / ".gcs" / "map-tiles"


def tile_path(layer: str, z: int, x: int, y: int) -> Path:
    return tile_root() / layer / str(z) / str(x) / f"{y}.png"


def count_cached_tiles() -> int:
    root = tile_root()
    if not root.is_dir():
        return 0
    total = 0
    for layer in VALID_LAYERS:
        layer_dir = root / layer
        if not layer_dir.is_dir():
            continue
        for z_dir in layer_dir.iterdir():
            if not z_dir.is_dir():
                continue
            for x_dir in z_dir.iterdir():
                if not x_dir.is_dir():
                    continue
                total += sum(1 for p in x_dir.iterdir() if p.is_file() and p.suffix.lower() == ".png")
    return total


def lat_lon_to_tile_xy(lat: float, lon: float, zoom: int) -> tuple[int, int]:
    lat = max(min(lat, 85.05112878), -85.05112878)
    n = 2**zoom
    x = int((lon + 180.0) / 360.0 * n)
    lat_rad = math.radians(lat)
    y = int((1.0 - math.log(math.tan(lat_rad) + 1.0 / math.cos(lat_rad)) / math.pi) / 2.0 * n)
    x = max(0, min(n - 1, x))
    y = max(0, min(n - 1, y))
    return x, y


def iter_tiles(
    south: float,
    west: float,
    north: float,
    east: float,
    zoom_min: int,
    zoom_max: int,
    layers: list[str],
):
    south, north = min(south, north), max(south, north)
    west, east = min(west, east), max(west, east)
    for z in range(zoom_min, zoom_max + 1):
        x_min, y_max = lat_lon_to_tile_xy(south, west, z)
        x_max, y_min = lat_lon_to_tile_xy(north, east, z)
        for layer in layers:
            if layer not in VALID_LAYERS:
                continue
            for x in range(x_min, x_max + 1):
                for y in range(y_min, y_max + 1):
                    yield layer, z, x, y


def prefetch_spec_tiles(spec: dict[str, Any]):
    return iter_tiles(
        float(spec["south"]),
        float(spec["west"]),
        float(spec["north"]),
        float(spec["east"]),
        int(spec["zoomMin"]),
        int(spec["zoomMax"]),
        list(spec.get("layers") or list(VALID_LAYERS)),
    )


def count_prefetch_tiles(spec: dict[str, Any]) -> int:
    total = 0
    south = float(spec["south"])
    west = float(spec["west"])
    north = float(spec["north"])
    east = float(spec["east"])
    zoom_min = int(spec["zoomMin"])
    zoom_max = int(spec["zoomMax"])
    layers = [layer for layer in list(spec.get("layers") or list(VALID_LAYERS)) if layer in VALID_LAYERS]
    if not layers:
        return 0

    south, north = min(south, north), max(south, north)
    west, east = min(west, east), max(west, east)
    for z in range(zoom_min, zoom_max + 1):
        x_min, y_max = lat_lon_to_tile_xy(south, west, z)
        x_max, y_min = lat_lon_to_tile_xy(north, east, z)
        total += (x_max - x_min + 1) * (y_max - y_min + 1) * len(layers)
    return total


def count_cached_prefetch_tiles(spec: dict[str, Any], total: int | None = None) -> int | None:
    total_tiles = total if total is not None else count_prefetch_tiles(spec)
    if total_tiles <= 0:
        return 0
    if total_tiles > MAX_PREFETCH_TILES:
        return None
    cached = 0
    for layer, z, x, y in prefetch_spec_tiles(spec):
        if tile_path(layer, z, x, y).is_file():
            cached += 1
    return cached


def prefetch_limit_error(total: int) -> str:
    approx_gib = total * TILE_BYTES_ESTIMATE / (1024**3)
    return (
        f"选区过大：约 {total} 张瓦片（~{approx_gib:.1f} GiB），"
        f"超过限制 {MAX_PREFETCH_TILES} 张，请缩小范围或降低缩放级别"
    )


class PrefetchState:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.running = False
        self.done = 0
        self.total = 0
        self.skipped = 0
        self.errors = 0
        self.message = ""
        self._cancel = False
        self._thread: threading.Thread | None = None

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "running": self.running,
                "done": self.done,
                "total": self.total,
                "skipped": self.skipped,
                "errors": self.errors,
                "message": self.message,
            }

    def health_prefetch(self) -> dict[str, Any]:
        return self.snapshot()

    def cancel(self) -> None:
        with self._lock:
            self._cancel = True
            self.message = "取消中…"

    def start(self, spec: dict[str, Any]) -> tuple[bool, str]:
        with self._lock:
            if self.running:
                return False, "预取任务已在运行"
            self._cancel = False
            self.running = True
            self.done = 0
            self.skipped = 0
            self.errors = 0
            self.message = "准备中…"
            self.total = count_prefetch_tiles(spec)
            if self.total <= 0:
                self.running = False
                return False, "选区或缩放级别无效"
            if self.total > MAX_PREFETCH_TILES:
                self.running = False
                self.message = prefetch_limit_error(self.total)
                return False, self.message
            self._thread = threading.Thread(target=self._run, args=(spec,), daemon=True)
            self._thread.start()
            return True, ""

    def _run(self, spec: dict[str, Any]) -> None:
        try:
            for layer, z, x, y in prefetch_spec_tiles(spec):
                with self._lock:
                    if self._cancel:
                        self.message = "已取消"
                        break
                path = tile_path(layer, z, x, y)
                if path.is_file():
                    with self._lock:
                        self.skipped += 1
                        self.done += 1
                    continue
                ok = fetch_and_cache_tile(layer, z, x, y)
                with self._lock:
                    self.done += 1
                    if not ok:
                        self.errors += 1
                    if self.done % 25 == 0 or self.done == self.total:
                        self.message = f"已处理 {self.done}/{self.total}"
            with self._lock:
                if not self._cancel:
                    self.message = "完成"
        finally:
            with self._lock:
                self.running = False


PREFETCH = PrefetchState()


def fetch_and_cache_tile(layer: str, z: int, x: int, y: int, timeout_s: float = 20.0) -> bool:
    if layer not in VALID_LAYERS:
        return False
    path = tile_path(layer, z, x, y)
    if path.is_file():
        return True
    url = LAYER_URLS[layer].format(z=z, x=x, y=y)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "GCS-map-tiles/1.0"})
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            data = resp.read()
        if not data:
            return False
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return True
    except Exception:
        return False


def estimate_prefetch(spec: dict[str, Any]) -> dict[str, Any]:
    total = count_prefetch_tiles(spec)
    too_large = total > MAX_PREFETCH_TILES
    cached = count_cached_prefetch_tiles(spec, total)
    missing = max(0, total - cached) if cached is not None else None
    return {
        "ok": True,
        "total": total,
        "cached": cached,
        "missing": missing,
        "estimateBytes": total * TILE_BYTES_ESTIMATE,
        "downloadBytes": missing * TILE_BYTES_ESTIMATE if missing is not None else None,
        "tooLarge": too_large,
        "maxTiles": MAX_PREFETCH_TILES,
        "message": prefetch_limit_error(total) if too_large else "",
    }


def send_json(handler: BaseHTTPRequestHandler, status: int, payload: dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class TileHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:
        return

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:
        path, _, query = self.path.partition("?")
        if path == "/health":
            cached_terrain = TERRAIN.cached_tile_count()
            send_json(
                self,
                200,
                {
                    "ok": True,
                    "cachedTiles": count_cached_tiles(),
                    "cachedTerrainTiles": cached_terrain,
                    "terrainReady": cached_terrain > 0,
                    "prefetch": PREFETCH.health_prefetch(),
                    "terrainPrefetch": TERRAIN_PREFETCH.snapshot(),
                    "tileRoot": str(tile_root()),
                },
            )
            return
        if path == "/terrain/prefetch/status":
            payload = TERRAIN_PREFETCH.snapshot()
            payload["ok"] = True
            send_json(self, 200, payload)
            return
        if path == "/elevation":
            params = parse_qs(query)
            try:
                lat = float((params.get("lat") or [""])[0])
                lng = float((params.get("lng") or params.get("lon") or [""])[0])
            except ValueError:
                send_json(self, 400, {"ok": False, "error": "lat/lng required"})
                return
            cache_only = "cacheOnly=1" in query or "cacheOnly=true" in query.lower()
            elevation = TERRAIN.elevation(lat, lng, cache_only=cache_only)
            if elevation is None:
                send_json(self, 404, {"ok": False, "error": "elevation unavailable"})
                return
            send_json(self, 200, {"ok": True, "elevation": elevation})
            return
        if path == "/terrain/grid":
            send_json(self, 405, {"ok": False, "error": "use POST"})
            return
        if path == "/prefetch/status":
            payload = PREFETCH.snapshot()
            payload["ok"] = True
            send_json(self, 200, payload)
            return

        m = re.fullmatch(r"/tiles/([a-z]+)/(\d+)/(\d+)/(\d+)\.png", path)
        if m:
            layer, z_s, x_s, y_s = m.groups()
            z, x, y = int(z_s), int(x_s), int(y_s)
            cache_only = "cacheOnly=1" in query or "cacheOnly=true" in query.lower()
            tile_file = tile_path(layer, z, x, y)
            if tile_file.is_file():
                data = tile_file.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Cache-Control", "public, max-age=86400")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            if cache_only:
                self.send_response(404)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                return
            if fetch_and_cache_tile(layer, z, x, y):
                data = tile_file.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            self.send_response(502)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            return

        self.send_response(404)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

    def do_POST(self) -> None:
        path, _, query = self.path.partition("?")
        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            body = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            send_json(self, 400, {"ok": False, "error": "invalid JSON"})
            return

        if path == "/prefetch/cancel":
            PREFETCH.cancel()
            send_json(self, 200, {"ok": True})
            return

        if path == "/prefetch":
            if "dryRun=1" in query or "dryRun=true" in query.lower():
                send_json(self, 200, estimate_prefetch(body))
                return
            ok, err = PREFETCH.start(body)
            if not ok:
                send_json(self, 409, {"ok": False, "error": err})
                return
            send_json(self, 200, {"ok": True})
            return

        if path == "/elevation/batch":
            cache_only = bool(body.get("cacheOnly"))
            points = TERRAIN.sample_batch(list(body.get("points") or []), cache_only=cache_only)
            send_json(self, 200, {"ok": True, "points": points})
            return

        if path == "/elevation/profile":
            cache_only = bool(body.get("cacheOnly"))
            profile = TERRAIN.sample_profile(
                list(body.get("points") or []),
                float(body.get("stepM") or 50),
                cache_only=cache_only,
            )
            send_json(self, 200, {"ok": True, "profile": profile})
            return

        if path == "/terrain/stats":
            cache_only = bool(body.get("cacheOnly"))
            stats = TERRAIN.terrain_stats(list(body.get("polygon") or []), cache_only=cache_only)
            send_json(self, 200, {"ok": True, "stats": stats})
            return

        if path == "/terrain/prefetch/cancel":
            TERRAIN_PREFETCH.cancel()
            send_json(self, 200, {"ok": True})
            return

        if path == "/terrain/prefetch":
            if "dryRun=1" in query or "dryRun=true" in query.lower():
                send_json(self, 200, TERRAIN_PREFETCH.estimate(body))
                return
            ok, err = TERRAIN_PREFETCH.start(body)
            if not ok:
                send_json(self, 409, {"ok": False, "error": err})
                return
            send_json(self, 200, {"ok": True})
            return

        if path == "/terrain/grid":
            try:
                lat = int(body.get("lat"))
                lon = int(body.get("lon"))
                grid_spacing = int(body.get("grid_spacing"))
                mask = int(body.get("mask"))
            except (TypeError, ValueError):
                send_json(self, 400, {"ok": False, "error": "lat/lon/grid_spacing/mask required"})
                return
            rows = TERRAIN.terrain_grid_rows(lat, lon, grid_spacing, mask)
            send_json(self, 200, {"ok": True, "rows": rows})
            return

        self.send_response(404)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()


def main() -> None:
    tile_root().mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer((HOST, PORT), TileHandler)
    print(f"[tile_server] http://{HOST}:{PORT}  cache={tile_root()}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
