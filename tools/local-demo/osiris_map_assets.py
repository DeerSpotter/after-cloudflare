"""OSIRIS 2D map assets for the Flareless local release console.

The local Tkinter console cannot use MapLibre/WebGL directly, so this module
carries an offline world map geometry layer plus the same dark map palette and
provider node metadata used by the release console.

The geometry is a deliberately simplified Natural Earth style world outline:
it is real geographic coastline geometry expressed as longitude/latitude rings,
not the old six polygon placeholder fallback.
"""

from __future__ import annotations

from typing import Final

OSIRIS_PALETTE: Final[dict[str, str]] = {
    "ocean0": "#3b4d57",
    "ocean1": "#283640",
    "ocean2": "#111923",
    "land": "#101923",
    "land2": "#172430",
    "coast": "#6f8794",
    "country": "#345165",
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

# Each feature is a MultiPolygon style list of rings.
# Ring points are [longitude, latitude].
OSIRIS_WORLD_RINGS: Final[list[list[list[float]]]] = [
    # North America
    [[
        [-168, 72], [-155, 71], [-146, 69], [-138, 70], [-130, 68], [-124, 65], [-122, 58],
        [-132, 55], [-137, 50], [-128, 49], [-124, 47], [-124, 42], [-117, 34], [-111, 31],
        [-106, 31], [-103, 25], [-97, 22], [-89, 21], [-82, 24], [-80, 26], [-82, 30],
        [-81, 32], [-76, 35], [-75, 39], [-70, 43], [-66, 45], [-61, 49], [-56, 52],
        [-54, 58], [-61, 62], [-69, 60], [-74, 66], [-84, 70], [-96, 74], [-112, 75],
        [-125, 72], [-140, 73], [-155, 73], [-168, 72]
    ]],
    # Greenland
    [[
        [-52, 59], [-43, 60], [-34, 65], [-28, 72], [-23, 78], [-33, 82], [-48, 83],
        [-61, 81], [-69, 76], [-73, 69], [-66, 63], [-58, 60], [-52, 59]
    ]],
    # Central America
    [[
        [-93, 18], [-88, 18], [-84, 15], [-82, 10], [-79, 9], [-77, 7], [-81, 7],
        [-84, 9], [-88, 13], [-92, 15], [-93, 18]
    ]],
    # South America
    [[
        [-81, 12], [-75, 10], [-70, 8], [-66, 4], [-60, 5], [-52, 0], [-45, -2],
        [-38, -8], [-35, -15], [-39, -23], [-43, -30], [-48, -38], [-54, -46],
        [-62, -53], [-68, -55], [-72, -50], [-72, -43], [-75, -35], [-73, -27],
        [-78, -18], [-80, -7], [-79, 2], [-81, 12]
    ]],
    # Europe
    [[
        [-10, 36], [-7, 43], [-10, 50], [-5, 56], [2, 59], [8, 58], [13, 55],
        [20, 58], [28, 60], [33, 66], [43, 68], [50, 64], [44, 57], [39, 52],
        [31, 45], [29, 41], [21, 40], [16, 43], [10, 44], [3, 43], [-2, 41],
        [-6, 38], [-10, 36]
    ]],
    # Africa
    [[
        [-17, 37], [-5, 35], [9, 37], [24, 32], [34, 31], [42, 16], [51, 11],
        [44, 2], [42, -8], [35, -17], [32, -30], [25, -35], [16, -34], [8, -29],
        [1, -23], [-7, -15], [-13, -5], [-17, 7], [-15, 20], [-17, 29], [-17, 37]
    ]],
    # Madagascar
    [[[48, -13], [51, -18], [49, -25], [45, -26], [43, -20], [45, -14], [48, -13]]],
    # Middle East and Asia
    [[
        [34, 32], [42, 38], [50, 45], [58, 51], [68, 54], [78, 54], [88, 56],
        [98, 55], [110, 58], [124, 58], [135, 55], [143, 50], [156, 50], [164, 58],
        [178, 66], [170, 70], [150, 72], [132, 70], [118, 66], [103, 63], [89, 61],
        [74, 57], [61, 55], [48, 52], [39, 47], [35, 40], [31, 36], [34, 32]
    ], [
        [60, 25], [68, 24], [76, 28], [82, 24], [88, 22], [92, 15], [98, 12],
        [102, 3], [109, 2], [114, 6], [116, 15], [112, 22], [105, 22], [96, 18],
        [90, 20], [83, 16], [78, 9], [72, 8], [67, 16], [60, 25]
    ]],
    # Japan
    [[[130, 32], [134, 34], [137, 36], [141, 41], [145, 44], [143, 36], [138, 33], [132, 31], [130, 32]]],
    # Philippines / Indonesia simplified
    [[[117, 7], [123, 8], [127, 4], [125, -1], [120, -2], [116, 2], [117, 7]]],
    [[[95, 6], [105, 6], [116, 1], [124, -3], [132, -4], [141, -6], [135, -9], [122, -7], [110, -6], [100, -3], [95, 6]]],
    # Australia
    [[
        [113, -11], [123, -11], [132, -12], [143, -14], [153, -21], [154, -29],
        [148, -39], [139, -44], [128, -43], [118, -36], [112, -29], [113, -20], [113, -11]
    ]],
    # New Zealand
    [[[166, -35], [174, -37], [178, -42], [170, -46], [166, -42], [166, -35]]],
    # Antarctica
    [[
        [-180, -72], [-150, -76], [-120, -74], [-90, -78], [-60, -75], [-30, -79],
        [0, -76], [30, -79], [60, -74], [90, -78], [120, -75], [150, -77], [180, -72],
        [180, -85], [-180, -85], [-180, -72]
    ]],
]

# Coarse country and regional boundary strokes. These are intentionally sparse:
# the goal is the OSIRIS dark world basemap appearance, not GIS precision.
OSIRIS_BOUNDARY_LINES: Final[list[list[list[float]]]] = [
    [[-125, 49], [-95, 49], [-70, 47]],
    [[-115, 32], [-106, 31], [-97, 26]],
    [[-74, 5], [-62, -8], [-58, -20], [-65, -35]],
    [[-3, 58], [2, 50], [8, 43], [13, 38]],
    [[10, 36], [18, 25], [26, 12], [30, -2], [28, -30]],
    [[35, 32], [45, 28], [55, 25], [70, 24]],
    [[72, 35], [80, 28], [88, 26], [96, 22]],
    [[100, 44], [105, 35], [110, 24], [116, 15]],
    [[30, 50], [50, 55], [70, 55], [90, 55], [115, 55]],
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
