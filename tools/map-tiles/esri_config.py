"""Esri World Services tile URLs (WGS84 / Web Mercator)."""
from __future__ import annotations

LAYER_URLS: dict[str, str] = {
    "imagery": (
        "https://server.arcgisonline.com/ArcGIS/rest/services/"
        "World_Imagery/MapServer/tile/{z}/{y}/{x}"
    ),
    "roads": (
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/"
        "World_Transportation/MapServer/tile/{z}/{y}/{x}"
    ),
    "places": (
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/"
        "World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
    ),
}

DEFAULT_LAYERS: tuple[str, ...] = ("imagery", "roads", "places")
