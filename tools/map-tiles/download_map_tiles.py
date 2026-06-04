#!/usr/bin/env python3
"""Download Esri WGS84 map tiles into ~/.gcs/map-tiles/."""
from __future__ import annotations

import argparse
import math
import os
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

TILE_ROOT = Path(os.environ.get("GCS_MAP_TILE_ROOT", Path.home() / ".gcs" / "map-tiles"))

LAYER_URLS = {
    "imagery": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    "roads": "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
    "places": "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
}

_prefetch_lock = threading.Lock()
_prefetch_state = {
    "running": False,
    "done": 0,
    "total": 0,
    "error": None,
    "cancel": False,
}


def lon_lat_to_tile(lon: float, lat: float, zoom: int) -> tuple[int, int]:
    lat_rad = math.radians(lat)
    n = 2.0**zoom
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.log(math.tan(lat_rad) + 1.0 / math.cos(lat_rad)) / math.pi) / 2.0 * n)
    return x, y


def tiles_for_bbox(
    south: float, west: float, north: float, east: float, zoom_min: int, zoom_max: int
) -> list[tuple[str, int, int, int]]:
    out: list[tuple[str, int, int, int]] = []
    for z in range(zoom_min, zoom_max + 1):
        x0, y1 = lon_lat_to_tile(west, south, z)
        x1, y0 = lon_lat_to_tile(east, north, z)
        for x in range(min(x0, x1), max(x0, x1) + 1):
            for y in range(min(y0, y1), max(y0, y1) + 1):
                out.append(("tile", z, x, y))
    return out


def estimate_prefetch(body: dict) -> dict:
    south = float(body["south"])
    west = float(body["west"])
    north = float(body["north"])
    east = float(body["east"])
    zoom_min = int(body.get("zoomMin", 14))
    zoom_max = int(body.get("zoomMax", 17))
    layers = body.get("layers") or list(LAYER_URLS.keys())
    base = tiles_for_bbox(south, west, north, east, zoom_min, zoom_max)
    total = len(base) * len(layers)
    est_bytes = total * 18 * 1024
    return {"total": total, "tiles": len(base), "layers": layers, "estimatedBytes": est_bytes, "estimateBytes": est_bytes}


def tile_path(layer: str, z: int, x: int, y: int) -> Path:
    return TILE_ROOT / layer / str(z) / str(x) / f"{y}.png"


def download_tile(layer: str, z: int, x: int, y: int, timeout_s: float = 20.0) -> bool:
    path = tile_path(layer, z, x, y)
    if path.is_file():
        return True
    url_tmpl = LAYER_URLS.get(layer)
    if not url_tmpl:
        return False
    url = url_tmpl.format(z=z, x=x, y=y)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".part")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "GCS-map-tiles/1.0"})
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            data = resp.read()
        tmp.write_bytes(data)
        tmp.replace(path)
        return True
    except (urllib.error.URLError, OSError):
        if tmp.is_file():
            tmp.unlink(missing_ok=True)
        return False


def cached_tile_count() -> int:
    if not TILE_ROOT.is_dir():
        return 0
    return sum(1 for _ in TILE_ROOT.rglob("*.png"))


def start_prefetch(body: dict) -> dict:
    est = estimate_prefetch(body)
    layers = est["layers"]
    south = float(body["south"])
    west = float(body["west"])
    north = float(body["north"])
    east = float(body["east"])
    zoom_min = int(body.get("zoomMin", 14))
    zoom_max = int(body.get("zoomMax", 17))
    base = tiles_for_bbox(south, west, north, east, zoom_min, zoom_max)
    jobs: list[tuple[str, int, int, int]] = []
    for layer in layers:
        for z, x, y in [(z, x, y) for _, z, x, y in base]:
            jobs.append((layer, z, x, y))

    with _prefetch_lock:
        if _prefetch_state["running"]:
            return {"ok": False, "error": "prefetch already running"}
        _prefetch_state.update(
            {"running": True, "done": 0, "total": len(jobs), "error": None, "cancel": False}
        )

    def worker() -> None:
        try:
            for i, job in enumerate(jobs):
                with _prefetch_lock:
                    if _prefetch_state["cancel"]:
                        break
                download_tile(*job)
                with _prefetch_lock:
                    _prefetch_state["done"] = i + 1
        except Exception as exc:  # noqa: BLE001
            with _prefetch_lock:
                _prefetch_state["error"] = str(exc)
        finally:
            with _prefetch_lock:
                _prefetch_state["running"] = False

    threading.Thread(target=worker, daemon=True).start()
    return {"ok": True, "total": len(jobs)}


def prefetch_status() -> dict:
    with _prefetch_lock:
        return dict(_prefetch_state)


def cancel_prefetch() -> dict:
    with _prefetch_lock:
        _prefetch_state["cancel"] = True
    return {"ok": True}


def main() -> None:
    parser = argparse.ArgumentParser(description="Download offline map tiles")
    parser.add_argument("--south", type=float, required=True)
    parser.add_argument("--west", type=float, required=True)
    parser.add_argument("--north", type=float, required=True)
    parser.add_argument("--east", type=float, required=True)
    parser.add_argument("--zoom-min", type=int, default=14)
    parser.add_argument("--zoom-max", type=int, default=17)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    body = {
        "south": args.south,
        "west": args.west,
        "north": args.north,
        "east": args.east,
        "zoomMin": args.zoom_min,
        "zoomMax": args.zoom_max,
    }
    if args.dry_run:
        print(estimate_prefetch(body))
        return
    result = start_prefetch(body)
    print(result)
    while True:
        st = prefetch_status()
        print(st)
        if not st.get("running"):
            break
        time.sleep(0.5)


if __name__ == "__main__":
    main()
