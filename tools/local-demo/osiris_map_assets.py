"""OSIRIS inspired 2D map assets for the Flareless local release console.

These constants mirror the lightweight fallback map data and palette from
DeerSpotter/osiris-v2 docs/osiris-live-cache.js and map style metadata from
osiris-map-controller.js. The Python console uses the embedded vector fallback
so the first release stays offline friendly and does not require web tiles.
"""

from __future__ import annotations

from typing import Final

OSIRIS_PALETTE: Final[dict[str, str]] = {
    "ocean0": "#3b4d57",
    "ocean1": "#283640",
    "ocean2": "#111923",
    "land": "#05080a",
    "coast": "#607784",
    "country": "#499fdb",
    "state": "#dab837",
    "route": "#1980cd",
    "green": "#00f08a",
    "cyan": "#24dce9",
    "gold": "#d7b739",
    "red": "#dd2731",
    "orange": "#d56a00",
    "magenta": "#e83b7f",
}

OSIRIS_TILE_STYLE_ASSETS: Final[dict[str, str]] = {
    "cartoDarkMatter": "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    "esriWorldImagery": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    "esriBoundaryLabels": "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    "esriRoadLabels": "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
    "openStreetMapFallback": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
}

OSIRIS_WORLD_RINGS: Final[list[list[list[float]]]] = [
    [[[-168, 72], [-135, 61], [-123, 42], [-106, 27], [-86, 24], [-73, 41], [-56, 57], [-94, 70], [-148, 73], [-168, 72]]],
    [[[-81, 12], [-61, 2], [-44, -18], [-55, -43], [-67, -55], [-76, -28], [-81, 12]]],
    [[[-17, 35], [27, 31], [50, 2], [31, -34], [2, -24], [-17, 18], [-17, 35]]],
    [[[-11, 36], [2, 59], [37, 62], [44, 49], [33, 39], [18, 36], [4, 41], [-11, 36]]],
    [[[35, 32], [70, 56], [128, 62], [160, 49], [151, 31], [105, 8], [69, 18], [35, 32]]],
    [[[113, -12], [133, -10], [153, -24], [147, -39], [122, -38], [112, -28], [113, -12]]],
]

ROUTE_NODES: Final[dict[str, dict[str, float | str]]] = {
    "client-us": {"label": "User traffic", "lat": 39.5, "lon": -98.3, "kind": "client"},
    "flareless": {"label": "Flareless", "lat": 32.0, "lon": -35.0, "kind": "director"},
    "cdn-a": {"label": "cdn-a", "lat": 50.1, "lon": -5.1, "kind": "provider"},
    "cdn-b": {"label": "cdn-b", "lat": 1.3, "lon": 103.8, "kind": "provider"},
    "cdn-c": {"label": "cdn-c", "lat": 35.7, "lon": 139.7, "kind": "provider"},
    "peer-assisted-edge": {"label": "Micro CDN", "lat": -23.5, "lon": 133.8, "kind": "peer"},
    "origin": {"label": "Origin", "lat": 52.5, "lon": 13.4, "kind": "origin"},
}
