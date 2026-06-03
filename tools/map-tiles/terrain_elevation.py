"""SRTM elevation cache + MAVLink terrain grid helpers for GCS tile server."""
from __future__ import annotations

import array
import math
import os
import threading
import urllib.error
import urllib.request
import zipfile
from pathlib import Path
from typing import Any

SRTM_SERVER = "terrain.ardupilot.org"
SRTM_DIR = "SRTM1"
TERRAIN_GRID_BITS = 56


def terrain_root() -> Path:
    env = os.environ.get("GCS_TERRAIN_ROOT")
    if env:
        return Path(env).expanduser()
    return Path.home() / ".gcs" / "terrain" / SRTM_DIR


def _continent_for_lat(lat_floor: int) -> str:
    lat = lat_floor
    if lat >= 60:
        return "Arctic"
    if lat < -60:
        return "Antarctic"
    if lat < 0:
        if lat >= -50:
            return "Australia"
        return "South_America"
    if lat < 38:
        return "Africa"
    return "Eurasia"


def _tile_urls(lat_floor: int, lon_floor: int) -> list[str]:
    filename = _tile_filename(lat_floor, lon_floor)
    urls = [f"https://{SRTM_SERVER}/{SRTM_DIR}/{filename}"]
    if SRTM_DIR == "SRTM3":
        urls.append(f"https://{SRTM_SERVER}/SRTM3/{_continent_for_lat(lat_floor)}/{filename}")
    return urls


def _tile_filename(lat_floor: int, lon_floor: int) -> str:
    ns = "N" if lat_floor >= 0 else "S"
    ew = "E" if lon_floor >= 0 else "W"
    return f"{ns}{abs(lat_floor):02d}{ew}{abs(lon_floor):03d}.hgt.zip"


def gps_offset(lat: float, lon: float, east: float, north: float) -> tuple[float, float]:
    radius = 6378100.0
    lat1 = max(min(math.radians(lat), math.pi / 2 - 1e-15), -math.pi / 2 + 1e-15)
    lon1 = math.radians(lon)
    bearing = math.degrees(math.atan2(east, north))
    distance = math.hypot(east, north)
    tc = math.radians(-bearing)
    d = distance / radius
    lat2 = lat1 + d * math.cos(tc)
    lat2 = max(min(lat2, math.pi / 2 - 1e-15), -math.pi / 2 + 1e-15)
    if abs(lat2 - lat1) < 1e-15:
        q = math.cos(lat1)
    else:
        q = (lat2 - lat1) / math.log(math.tan(lat2 / 2 + math.pi / 4) / math.tan(lat1 / 2 + math.pi / 4))
    dlon = -d * math.sin(tc) / q
    lon2 = math.degrees((lon1 + dlon + math.pi) % (2 * math.pi) - math.pi)
    return math.degrees(lat2), lon2


class SRTMTile:
    def __init__(self, path: Path, lat_floor: int, lon_floor: int) -> None:
        with zipfile.ZipFile(path, "r") as zf:
            names = zf.namelist()
            if len(names) != 1:
                raise ValueError("invalid SRTM zip")
            data = zf.read(names[0])
        self.size = int(math.sqrt(len(data) / 2))
        if self.size not in (1201, 3601):
            raise ValueError("unsupported SRTM tile size")
        self.data = array.array("h")
        self.data.frombytes(data)
        if len(self.data) != self.size * self.size:
            raise ValueError("unexpected sample count")
        self.data.byteswap()
        self.lat_floor = lat_floor
        self.lon_floor = lon_floor

    def _pixel(self, x: int, y: int) -> int | None:
        offset = x + self.size * (self.size - y - 1)
        value = int(self.data[offset])
        if value == -32768:
            return None
        return value

    def elevation_at(self, lat: float, lon: float) -> float | None:
        lat_off = lat - self.lat_floor
        lon_off = lon - self.lon_floor
        if lat_off < 0.0 or lat_off >= 1.0 or lon_off < 0.0 or lon_off >= 1.0:
            return None
        x = lon_off * (self.size - 1)
        y = lat_off * (self.size - 1)
        x_int = int(x)
        y_int = int(y)
        x_frac = x - x_int
        y_frac = y - y_int
        v00 = self._pixel(x_int, y_int)
        v10 = self._pixel(x_int + 1, y_int)
        v01 = self._pixel(x_int, y_int + 1)
        v11 = self._pixel(x_int + 1, y_int + 1)
        if v00 is None and v10 is None and v01 is None and v11 is None:
            return None

        def avg(a: float | None, b: float | None, weight: float) -> float | None:
            if a is None:
                return b
            if b is None:
                return a
            return b * weight + a * (1.0 - weight)

        v1 = avg(v00, v10, x_frac)
        v2 = avg(v01, v11, x_frac)
        value = avg(v1, v2, y_frac)
        return float(value) if value is not None else None


class TerrainModel:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._tiles: dict[tuple[int, int], SRTMTile] = {}
        terrain_root().mkdir(parents=True, exist_ok=True)

    def cached_tile_count(self) -> int:
        root = terrain_root()
        if not root.is_dir():
            return 0
        return sum(1 for p in root.iterdir() if p.is_file() and p.suffix == ".zip")

    def _download_tile(self, lat_floor: int, lon_floor: int) -> bool:
        filename = _tile_filename(lat_floor, lon_floor)
        dest = terrain_root() / filename
        if dest.is_file():
            return True
        for url in _tile_urls(lat_floor, lon_floor):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "GCS-terrain/1.0"})
                with urllib.request.urlopen(req, timeout=45) as resp:
                    data = resp.read()
                if not data:
                    continue
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(data)
                return True
            except urllib.error.HTTPError:
                continue
            except Exception:
                continue
        return False

    def _load_tile(self, lat_floor: int, lon_floor: int, cache_only: bool = False) -> SRTMTile | None:
        key = (lat_floor, lon_floor)
        with self._lock:
            cached = self._tiles.get(key)
            if cached is not None:
                return cached
        filename = _tile_filename(lat_floor, lon_floor)
        path = terrain_root() / filename
        if not path.is_file():
            if cache_only:
                return None
            if not self._download_tile(lat_floor, lon_floor):
                return None
        try:
            tile = SRTMTile(path, lat_floor, lon_floor)
        except Exception:
            return None
        with self._lock:
            self._tiles[key] = tile
        return tile

    def elevation(self, lat: float, lon: float, cache_only: bool = False) -> float | None:
        if not math.isfinite(lat) or not math.isfinite(lon):
            return None
        if abs(lat) > 84.0:
            return 0.0
        lat_floor = int(math.floor(lat))
        lon_floor = int(math.floor(lon))
        tile = self._load_tile(lat_floor, lon_floor, cache_only=cache_only)
        if tile is None:
            if abs(lat) < 60 and cache_only:
                return None
            return 0.0
        value = tile.elevation_at(lat, lon)
        if value is None:
            return 0.0
        return value

    def sample_batch(self, points: list[dict[str, Any]], cache_only: bool = False) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for point in points or []:
            lat = float(point.get("lat"))
            lng = float(point.get("lng", point.get("lon")))
            elev = self.elevation(lat, lng, cache_only=cache_only)
            row = {"lat": lat, "lng": lng, "elevation": elev, "available": elev is not None}
            out.append(row)
        return out

    def sample_profile(self, points: list[dict[str, Any]], step_m: float, cache_only: bool = False) -> list[dict[str, Any]]:
        if not points or len(points) < 2:
            return []
        step = max(5.0, float(step_m or 50.0))
        profile: list[dict[str, Any]] = []
        total_m = 0.0
        first_lat = float(points[0]["lat"])
        first_lng = float(points[0].get("lng", points[0].get("lon")))
        first_elev = self.elevation(first_lat, first_lng, cache_only)
        profile.append(
            {
                "lat": first_lat,
                "lng": first_lng,
                "distanceM": 0.0,
                "elevation": first_elev,
                "available": first_elev is not None,
            }
        )
        for idx in range(len(points) - 1):
            lat1 = float(points[idx]["lat"])
            lng1 = float(points[idx].get("lng", points[idx].get("lon")))
            lat2 = float(points[idx + 1]["lat"])
            lng2 = float(points[idx + 1].get("lng", points[idx + 1].get("lon")))
            seg_m = haversine_m(lat1, lng1, lat2, lng2)
            steps = max(1, int(math.ceil(seg_m / step)))
            for step_idx in range(1, steps + 1):
                frac = step_idx / steps
                lat = lat1 + (lat2 - lat1) * frac
                lng = lng1 + (lng2 - lng1) * frac
                total_m += seg_m / steps
                elev = self.elevation(lat, lng, cache_only)
                profile.append(
                    {
                        "lat": lat,
                        "lng": lng,
                        "distanceM": total_m,
                        "elevation": elev,
                        "available": elev is not None,
                    }
                )
        return profile

    def terrain_stats(self, polygon: list[dict[str, Any]], cache_only: bool = False) -> dict[str, Any]:
        bbox = polygon_bbox(polygon)
        if not bbox:
            return {}
        south, west, north, east = bbox
        samples: list[float] = []
        lat = south
        while lat <= north + 1e-9:
            lng = west
            while lng <= east + 1e-9:
                elev = self.elevation(lat, lng, cache_only=cache_only)
                if elev is not None:
                    samples.append(elev)
                lng += 0.01
            lat += 0.01
        if not samples:
            return {"minM": None, "maxM": None, "reliefM": None, "samples": 0}
        min_m = min(samples)
        max_m = max(samples)
        return {"minM": min_m, "maxM": max_m, "reliefM": max_m - min_m, "samples": len(samples)}

    def terrain_grid_rows(self, lat_e7: int, lon_e7: int, grid_spacing: int, mask: int) -> list[dict[str, Any]]:
        lat = lat_e7 * 1.0e-7
        lon = lon_e7 * 1.0e-7
        spacing = int(grid_spacing)
        if spacing <= 0:
            return []
        rows: list[dict[str, Any]] = []
        for bit in range(TERRAIN_GRID_BITS):
            if not (mask & (1 << bit)):
                continue
            bit_spacing = spacing * 4
            tile_lat, tile_lon = gps_offset(lat, lon, east=bit_spacing * (bit % 8), north=bit_spacing * (bit // 8))
            data: list[int] = []
            complete = True
            for i in range(16):
                y = i % 4
                x = i // 4
                lat2, lon2 = gps_offset(tile_lat, tile_lon, east=spacing * y, north=spacing * x)
                alt = self.elevation(lat2, lon2, cache_only=False)
                if alt is None:
                    complete = False
                    break
                data.append(int(round(alt)))
            if complete and len(data) == 16:
                rows.append(
                    {
                        "lat": lat_e7,
                        "lon": lon_e7,
                        "grid_spacing": spacing,
                        "gridbit": bit,
                        "data": data,
                    }
                )
        return rows


class TerrainPrefetchState:
    def __init__(self, model: TerrainModel) -> None:
        self._model = model
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

    def cancel(self) -> None:
        with self._lock:
            self._cancel = True
            self.message = "取消中…"

    def estimate(self, spec: dict[str, Any]) -> dict[str, Any]:
        tiles = list(iter_degree_tiles(spec))
        cached = count_cached_degree_tiles(tiles)
        missing = max(0, len(tiles) - cached)
        return {
            "ok": True,
            "total": len(tiles),
            "cached": cached,
            "missing": missing,
            "estimateBytes": len(tiles) * 900_000,
            "downloadBytes": missing * 900_000,
        }

    def start(self, spec: dict[str, Any]) -> tuple[bool, str]:
        tiles = list(iter_degree_tiles(spec))
        with self._lock:
            if self.running:
                return False, "地形预取任务已在运行"
            if not tiles:
                return False, "选区无效"
            self._cancel = False
            self.running = True
            self.done = 0
            self.skipped = 0
            self.errors = 0
            self.total = len(tiles)
            self.message = "准备中…"
            self._thread = threading.Thread(target=self._run, args=(tiles,), daemon=True)
            self._thread.start()
            return True, ""

    def _run(self, tiles: list[tuple[int, int]]) -> None:
        try:
            for lat_floor, lon_floor in tiles:
                with self._lock:
                    if self._cancel:
                        self.message = "已取消"
                        break
                filename = _tile_filename(lat_floor, lon_floor)
                path = terrain_root() / filename
                if path.is_file():
                    with self._lock:
                        self.skipped += 1
                        self.done += 1
                    continue
                ok = self._model._download_tile(lat_floor, lon_floor)
                with self._lock:
                    self.done += 1
                    if not ok:
                        self.errors += 1
                    if self.done % 5 == 0 or self.done == self.total:
                        self.message = f"已处理 {self.done}/{self.total}"
            with self._lock:
                if not self._cancel:
                    self.message = "完成"
        finally:
            with self._lock:
                self.running = False


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6378100.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def polygon_bbox(polygon: list[dict[str, Any]]) -> tuple[float, float, float, float] | None:
    south = math.inf
    north = -math.inf
    west = math.inf
    east = -math.inf
    for point in polygon or []:
        lat = float(point.get("lat"))
        lng = float(point.get("lng", point.get("lon")))
        if not math.isfinite(lat) or not math.isfinite(lng):
            continue
        south = min(south, lat)
        north = max(north, lat)
        west = min(west, lng)
        east = max(east, lng)
    if not math.isfinite(south):
        return None
    return south, west, north, east


def iter_degree_tiles(spec: dict[str, Any]) -> list[tuple[int, int]]:
    south = float(spec["south"])
    west = float(spec["west"])
    north = float(spec["north"])
    east = float(spec["east"])
    south, north = min(south, north), max(south, north)
    west, east = min(west, east), max(west, east)
    tiles: list[tuple[int, int]] = []
    lat = int(math.floor(south))
    while lat <= int(math.floor(north)):
        lon = int(math.floor(west))
        while lon <= int(math.floor(east)):
            if abs(lat) <= 84:
                tiles.append((lat, lon))
            lon += 1
        lat += 1
    return tiles


def count_cached_degree_tiles(tiles: list[tuple[int, int]]) -> int:
    cached = 0
    for lat_floor, lon_floor in tiles:
        if (terrain_root() / _tile_filename(lat_floor, lon_floor)).is_file():
            cached += 1
    return cached


MODEL = TerrainModel()
PREFETCH = TerrainPrefetchState(MODEL)
