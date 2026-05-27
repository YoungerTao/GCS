#!/usr/bin/env python3
"""Build assets/gcs-dog.ico from dog1.png for Windows shortcuts (true colors, no margins)."""
from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "dog1.png"
OUT = ROOT / "assets" / "gcs-dog.ico"
ICON_BG = (25, 45, 78)
# Single 256px entry only: Windows .lnk IconLocation ",0" uses directory index 0.
# Multi-size ICO puts 16x16 at index 0, which looks tiny and blurry when scaled up.
ICON_SIZE = 256


def _is_export_background(r: int, g: int, b: int) -> bool:
    r, g, b = int(r), int(g), int(b)
    if r > 250 and g > 250 and b > 250:
        return True
    if abs(r - g) <= 3 and abs(g - b) <= 3 and 208 <= r <= 225:
        return True
    return False


def _flood_background_mask(rgb: np.ndarray) -> np.ndarray:
    h, w = rgb.shape[:2]
    bg = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            if _is_export_background(*rgb[y, x]) and not bg[y, x]:
                bg[y, x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if _is_export_background(*rgb[y, x]) and not bg[y, x]:
                bg[y, x] = True
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if (
                0 <= nx < w
                and 0 <= ny < h
                and not bg[ny, nx]
                and _is_export_background(*rgb[ny, nx])
            ):
                bg[ny, nx] = True
                q.append((nx, ny))
    return bg


def load_icon_source(path: Path = SOURCE) -> Image.Image:
    if not path.is_file():
        raise FileNotFoundError(f"Icon source not found: {path}")
    img = Image.open(path).convert("RGBA")
    rgb = np.array(img)[:, :, :3].astype(np.int16)

    light = (rgb[:, :, 0] > 200) & (rgb[:, :, 1] > 200) & (rgb[:, :, 2] > 200)
    if light.any():
        ys, xs = np.where(~light)
        img = img.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))

    data = np.array(img)
    sub_rgb = data[:, :, :3]
    data[_flood_background_mask(sub_rgb)] = (0, 0, 0, 0)
    img = Image.fromarray(data)

    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)

    w, h = img.size
    side = max(w, h)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(img, ((side - w) // 2, (side - h) // 2))
    tight = square.getbbox()
    if tight:
        square = square.crop(tight)
    return square


def flatten_icon(img: Image.Image, bg: tuple[int, int, int] = ICON_BG) -> Image.Image:
    base = Image.new("RGBA", img.size, bg + (255,))
    return Image.alpha_composite(base, img.convert("RGBA"))


def rasterize_icon(source: Image.Image, size: int = ICON_SIZE) -> Image.Image:
    flat = flatten_icon(source)
    return flat.resize((size, size), Image.Resampling.LANCZOS).convert("RGB")


def main() -> None:
    source = load_icon_source()
    icon = rasterize_icon(source, ICON_SIZE)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    icon.save(OUT, format="ICO", sizes=[(ICON_SIZE, ICON_SIZE)])
    kb = OUT.stat().st_size // 1024
    print(f"Wrote {OUT} ({kb} KB, {ICON_SIZE}x{ICON_SIZE} only) from {SOURCE}")


if __name__ == "__main__":
    main()
