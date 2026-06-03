"""Local tile cache under ~/.gcs/map-tiles."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from esri_config import DEFAULT_LAYERS

_MANIFEST_NAME = "manifest.json"


def default_tile_root() -> Path:
    return Path.home() / ".gcs" / "map-tiles"


def tile_root(root: Path | str | None = None) -> Path:
    if root is None:
        return default_tile_root()
    return Path(root).expanduser().resolve()


def tile_path(
    layer: str,
    z: int,
    x: int,
    y: int,
    root: Path | str | None = None,
) -> Path:
    return tile_root(root) / layer / str(z) / str(x) / f"{y}.png"


def read_manifest(root: Path | str | None = None) -> dict:
    path = tile_root(root) / _MANIFEST_NAME
    if not path.is_file():
        return {}
    try:
        with path.open(encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def write_manifest(root: Path | str | None, payload: dict) -> None:
    base = tile_root(root)
    base.mkdir(parents=True, exist_ok=True)
    path = base / _MANIFEST_NAME
    merged = read_manifest(base)
    merged.update(payload)
    merged["updatedAt"] = datetime.now(timezone.utc).isoformat()
    with path.open("w", encoding="utf-8") as fh:
        json.dump(merged, fh, ensure_ascii=False, indent=2)


def count_cached_tiles(root: Path | str | None = None) -> int:
    base = tile_root(root)
    if not base.is_dir():
        return 0
    total = 0
    for layer_dir in base.iterdir():
        if not layer_dir.is_dir() or layer_dir.name == _MANIFEST_NAME:
            continue
        if layer_dir.name not in DEFAULT_LAYERS and layer_dir.name.startswith("."):
            continue
        for z_dir in layer_dir.iterdir():
            if not z_dir.is_dir():
                continue
            for x_dir in z_dir.iterdir():
                if not x_dir.is_dir():
                    continue
                for tile in x_dir.glob("*.png"):
                    if tile.is_file():
                        total += 1
    return total


def ensure_layer_dirs(layers: tuple[str, ...] | list[str], root: Path | str | None = None) -> None:
    base = tile_root(root)
    for layer in layers:
        (base / layer).mkdir(parents=True, exist_ok=True)


def env_tile_root() -> Path:
    return tile_root(os.environ.get("GCS_MAP_TILE_ROOT"))
