"""Download Esri tiles into the local cache."""
from __future__ import annotations

import time
import urllib.error
import urllib.request
from pathlib import Path

from esri_config import LAYER_URLS
from tile_store import tile_path

_DEFAULT_DELAY_S = 0.05
_USER_AGENT = "GCS-MapTiles/1.0 (+local offline cache)"


def build_tile_url(layer: str, z: int, x: int, y: int) -> str:
    template = LAYER_URLS.get(layer)
    if not template:
        raise ValueError(f"unknown layer: {layer}")
    return template.format(z=z, y=y, x=x)


def fetch_tile(
    layer: str,
    z: int,
    x: int,
    y: int,
    root: Path | str | None = None,
    delay_s: float = _DEFAULT_DELAY_S,
    timeout_s: float = 30.0,
) -> Path:
    dest = tile_path(layer, z, x, y, root)
    if dest.is_file() and dest.stat().st_size > 0:
        return dest

    dest.parent.mkdir(parents=True, exist_ok=True)
    url = build_tile_url(layer, z, x, y)
    req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            data = resp.read()
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"HTTP {exc.code} for {url}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"fetch failed for {url}: {exc}") from exc

    if not data:
        raise RuntimeError(f"empty tile from {url}")

    dest.write_bytes(data)
    if delay_s > 0:
        time.sleep(delay_s)
    return dest


def load_tile_bytes(
    layer: str,
    z: int,
    x: int,
    y: int,
    root: Path | str | None = None,
) -> bytes | None:
    path = tile_path(layer, z, x, y, root)
    if path.is_file() and path.stat().st_size > 0:
        return path.read_bytes()
    return None
