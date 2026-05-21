#!/usr/bin/env python3
"""Rasterize assets/gcs-dog.svg style into assets/gcs-dog.ico for Windows shortcuts."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "gcs-dog.ico"

BG = (25, 56, 74)
FUR = (242, 197, 92)
FUR_DARK = (200, 150, 60)
MUZZLE = (245, 230, 200)
NOSE = (42, 35, 32)
EYE = (26, 32, 40)
COLLAR = (94, 200, 232)


def _sc(v: float, s: float) -> int:
    return int(round(v * s))


def draw_dog(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size / 64.0

    d.rounded_rectangle(
        (_sc(4, s), _sc(4, s), _sc(60, s), _sc(60, s)),
        radius=_sc(14, s),
        fill=BG,
    )
    d.ellipse(
        (_sc(12, s), _sc(7, s), _sc(26, s), _sc(29, s)),
        fill=FUR_DARK,
    )
    d.ellipse(
        (_sc(38, s), _sc(7, s), _sc(52, s), _sc(29, s)),
        fill=FUR_DARK,
    )
    d.ellipse(
        (_sc(15, s), _sc(14, s), _sc(49, s), _sc(46, s)),
        fill=FUR,
    )
    d.ellipse(
        (_sc(23, s), _sc(30, s), _sc(41, s), _sc(44, s)),
        fill=MUZZLE,
    )
    d.ellipse(
        (_sc(28.5, s), _sc(33, s), _sc(35.5, s), _sc(39, s)),
        fill=NOSE,
    )
    d.ellipse(
        (_sc(21.8, s), _sc(23.2, s), _sc(28.2, s), _sc(30.8, s)),
        fill=EYE,
    )
    d.ellipse(
        (_sc(35.8, s), _sc(23.2, s), _sc(42.2, s), _sc(30.8, s)),
        fill=EYE,
    )
    d.ellipse(
        (_sc(24.9, s), _sc(24.9, s), _sc(27.1, s), _sc(27.1, s)),
        fill=(244, 247, 251),
    )
    d.ellipse(
        (_sc(38.9, s), _sc(24.9, s), _sc(41.1, s), _sc(27.1, s)),
        fill=(244, 247, 251),
    )
    d.arc(
        (_sc(20, s), _sc(40, s), _sc(44, s), _sc(50, s)),
        start=200,
        end=340,
        fill=COLLAR,
        width=max(2, _sc(3, s)),
    )
    return img


def main() -> None:
    sizes = [16, 24, 32, 48, 64, 128, 256]
    images = [draw_dog(n) for n in sizes]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    images[0].save(
        OUT,
        format="ICO",
        sizes=[(img.width, img.height) for img in images],
        append_images=images[1:],
    )
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
