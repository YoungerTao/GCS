"""Web Mercator tile math for bbox prefetch and CLI estimates."""
from __future__ import annotations

import math
from typing import Iterable

_MAX_LAT = 85.05112878
_AVG_TILE_BYTES = 22_000


def _clamp_lat(lat: float) -> float:
    return max(min(lat, _MAX_LAT), -_MAX_LAT)


def lat_lon_to_tile_xy(lat: float, lon: float, zoom: int) -> tuple[int, int]:
    n = 2**zoom
    x = int((lon + 180.0) / 360.0 * n)
    lat_rad = math.radians(_clamp_lat(lat))
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    x = max(0, min(n - 1, x))
    y = max(0, min(n - 1, y))
    return x, y


def tile_range_for_bbox(
    south: float,
    west: float,
    north: float,
    east: float,
    zoom: int,
) -> tuple[int, int, int, int]:
    """Return inclusive x0, x1, y0, y1 for zoom level."""
    x_w, y_n = lat_lon_to_tile_xy(north, west, zoom)
    x_e, y_s = lat_lon_to_tile_xy(south, east, zoom)
    x0, x1 = min(x_w, x_e), max(x_w, x_e)
    y0, y1 = min(y_n, y_s), max(y_n, y_s)
    return x0, x1, y0, y1


def iter_bbox_tiles(
    south: float,
    west: float,
    north: float,
    east: float,
    zoom_min: int,
    zoom_max: int,
) -> Iterable[tuple[int, int, int]]:
    z_lo = min(zoom_min, zoom_max)
    z_hi = max(zoom_min, zoom_max)
    for z in range(z_lo, z_hi + 1):
        x0, x1, y0, y1 = tile_range_for_bbox(south, west, north, east, z)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                yield z, x, y


def count_bbox_tiles(
    south: float,
    west: float,
    north: float,
    east: float,
    zoom_min: int,
    zoom_max: int,
    layers: int = 1,
) -> int:
    per_layer = sum(
        1
        for _ in iter_bbox_tiles(south, west, north, east, zoom_min, zoom_max)
    )
    return per_layer * max(1, layers)


def estimate_bbox_bytes(
    south: float,
    west: float,
    north: float,
    east: float,
    zoom_min: int,
    zoom_max: int,
    layers: int = 1,
    avg_tile_bytes: int = _AVG_TILE_BYTES,
) -> int:
    return count_bbox_tiles(south, west, north, east, zoom_min, zoom_max, layers) * avg_tile_bytes
