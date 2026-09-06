"""Fetch what stands on a map: object footprints from OpenStreetMap.

The relief comes from tools/fetch-dtm.py; this fetches the buildings, walls,
woods and single trees inside the same window from OpenStreetMap through the
Overpass API and writes them as the engine's `MapObject[]`, so the demo's
farm and walls can be as real as the ground under them (README rules
decision 15 — "eventually we will use real world maps anyway").

Usage (from the repo root), with the same window as the heightfield:

    python tools/fetch-osm.py --lat 32.645 --lon 35.085 \
        --width 900 --height 800 --name RAMAT_MENASHE_OBJECTS \
        -o src/app/maps/ramatMenasheObjects.ts

What is taken, and what it becomes:

    building=*                        -> "building", its outline, height from
                                         building:levels × 3 m or height=* when
                                         tagged, else the engine's default
    barrier=wall | fence | hedge | retaining_wall
                                      -> "wall", the way as a 1 m thick strip
    landuse=forest | orchard, natural=wood | scrub
                                      -> "tree", the whole outline as one
                                         object: sight into and through a wood
                                         is blocked at its edge, and a force at
                                         the edge looks out of it. Two forces
                                         both inside it see each other freely —
                                         the engine tests footprint crossings,
                                         and a line wholly inside crosses none
    natural=tree (a node)             -> "tree", a 4 m crown

Roads are not objects — they have no height and give no cover — so they are
written as a second constant, `<NAME>_ROADS: MapLine[]` (an `_OBJECTS` suffix
on the name is dropped first), a line layer the map draws and no rule reads. A
way tagged both highway and building becomes a road only:

    highway=motorway | trunk (+ _link)   -> "motorway", 12 m
    highway=primary … residential, service, unclassified, living_street
                                         -> "street", 6 m
    highway=track                        -> "track", 3 m
    highway=path | footway | steps | cycleway | pedestrian
                                         -> "path", 1.5 m

Only ways are
queried: a multipolygon relation (a wood with clearings, a building with a
courtyard) is not fetched and vanishes silently. A footprint is kept when any
vertex falls inside the window, which is also Overpass's own bbox criterion —
one that covers window ground with every vertex outside is dropped by both.

Coordinates: metres east and south of the window's north-west corner, matching
the heightfield's grid (x east, y south, north up). The window is small enough
that an equirectangular projection at its centre latitude agrees with the
tiles' Web Mercator to well under a metre.

Data © OpenStreetMap contributors, ODbL — the attribution is written into the
generated module's header. Standard library only, like the other tools.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import urllib.parse
import urllib.request
from datetime import date

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
METRES_PER_DEGREE_LAT = 111_320
STOREY_M = 3
TREE_CROWN_M = 4
WALL_THICKNESS_M = 1
ROAD_KINDS = {
    "motorway": ("motorway", 12), "motorway_link": ("motorway", 12),
    "trunk": ("motorway", 12), "trunk_link": ("motorway", 12),
    "primary": ("street", 6), "primary_link": ("street", 6),
    "secondary": ("street", 6), "secondary_link": ("street", 6),
    "tertiary": ("street", 6), "tertiary_link": ("street", 6),
    "residential": ("street", 6), "service": ("street", 6),
    "unclassified": ("street", 6), "living_street": ("street", 6),
    "track": ("track", 3),
    "path": ("path", 1.5), "footway": ("path", 1.5), "steps": ("path", 1.5),
    "cycleway": ("path", 1.5), "pedestrian": ("path", 1.5),
}


def query(lat: float, lon: float, width_m: float, height_m: float) -> list[dict]:
    dlat = (height_m / 2) / METRES_PER_DEGREE_LAT
    dlon = (width_m / 2) / (METRES_PER_DEGREE_LAT * math.cos(math.radians(lat)))
    bbox = f"{lat - dlat},{lon - dlon},{lat + dlat},{lon + dlon}"
    overpass = f"""[out:json][timeout:90];
(
  way["building"]({bbox});
  way["barrier"~"^(wall|fence|hedge|retaining_wall)$"]({bbox});
  way["landuse"~"^(forest|orchard)$"]({bbox});
  way["natural"~"^(wood|scrub)$"]({bbox});
  node["natural"="tree"]({bbox});
  way["highway"]({bbox});
);
out body geom;"""
    body = urllib.parse.urlencode({"data": overpass}).encode()
    req = urllib.request.Request(
        OVERPASS_URL,
        body,
        headers={"User-Agent": "tactical-wargame-fetch-osm/0.1", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read())["elements"]


def to_local(lat0: float, lon0: float, width_m: float, height_m: float):
    k = METRES_PER_DEGREE_LAT * math.cos(math.radians(lat0))

    def local(p: dict) -> tuple[float, float]:
        return ((p["lon"] - lon0) * k + width_m / 2, (lat0 - p["lat"]) * METRES_PER_DEGREE_LAT + height_m / 2)

    return local


def building_height(tags: dict) -> float | None:
    if "height" in tags:
        try:
            return float(str(tags["height"]).split()[0])
        except ValueError:
            pass
    if "building:levels" in tags:
        try:
            return float(tags["building:levels"]) * STOREY_M
        except ValueError:
            pass
    return None


def strip(
    points: list[tuple[float, float]], thickness: float, closed: bool = False
) -> list[tuple[float, float]]:
    """A polyline as a closed polygon `thickness` wide: offset each side, join.

    A closed way (an enclosure fence) takes its neighbours round the ring, so
    the two offset rings close on themselves; joined as one polygon they read
    correctly under the engine's even-odd test, with no seam for a sight line
    to slip through. An open way gets one-sided normals at its two ends.
    """
    left: list[tuple[float, float]] = []
    right: list[tuple[float, float]] = []
    n_pts = len(points)
    for i, (x, y) in enumerate(points):
        if closed:
            ax, ay = points[(i - 1) % n_pts]
            bx, by = points[(i + 1) % n_pts]
        else:
            ax, ay = points[max(0, i - 1)]
            bx, by = points[min(n_pts - 1, i + 1)]
        dx, dy = bx - ax, by - ay
        n = math.hypot(dx, dy) or 1
        nx, ny = -dy / n * thickness / 2, dx / n * thickness / 2
        left.append((x + nx, y + ny))
        right.append((x - nx, y - ny))
    if closed:
        # Outer ring, then back round the inner ring: one polygon with a hole.
        return left + [left[0]] + [right[0]] + right[::-1]
    return left + right[::-1]


def convert(elements: list[dict], local, width_m: float, height_m: float) -> tuple[list[dict], list[dict]]:
    objects: list[dict] = []
    roads: list[dict] = []
    counts = {"building": 0, "wall": 0, "tree": 0}

    def inside(pts: list[tuple[float, float]]) -> bool:
        return any(0 <= x <= width_m and 0 <= y <= height_m for x, y in pts)

    for e in elements:
        tags = e.get("tags", {})
        if e["type"] == "node":
            if tags.get("natural") == "tree":
                x, y = local(e)
                if inside([(x, y)]):
                    counts["tree"] += 1
                    objects.append(
                        {
                            "id": f"osm-n{e['id']}",
                            "kind": "tree",
                            "footprint": {"shape": "circle", "center": {"x": x, "y": y}, "radius": TREE_CROWN_M},
                        }
                    )
            continue
        pts = [local(p) for p in e.get("geometry", [])]
        if len(pts) < 2 or not inside(pts):
            continue
        if "highway" in tags:
            kind_width = ROAD_KINDS.get(tags["highway"])
            if kind_width:
                roads.append(
                    {
                        "id": f"osm-w{e['id']}",
                        "kind": kind_width[0],
                        "width": kind_width[1],
                        "points": [{"x": x, "y": y} for x, y in pts],
                    }
                )
            continue
        closed = pts[0] == pts[-1]
        if closed:
            pts = pts[:-1]
        if "building" in tags:
            kind = "building"
            outline = pts
            height = building_height(tags)
        elif "barrier" in tags:
            kind = "wall"
            outline = strip(pts, WALL_THICKNESS_M, closed)
            height = building_height(tags)
        else:
            kind = "tree"
            outline = pts
            height = None
        if len(outline) < 3:
            continue
        counts[kind] += 1
        obj: dict = {
            "id": f"osm-w{e['id']}",
            "kind": kind,
            "footprint": {"shape": "polygon", "points": [{"x": x, "y": y} for x, y in outline]},
        }
        if height is not None:
            obj["height"] = height
        objects.append(obj)
    print(
        f"{counts['building']} buildings, {counts['wall']} walls, {counts['tree']} woods/trees, "
        f"{len(roads)} roads",
        file=sys.stderr,
    )
    return objects, roads


def emit_module(
    objects: list[dict], roads: list[dict], name: str, lat: float, lon: float, width_m: float, height_m: float
) -> str:
    def num(v: float) -> str:
        return f"{v:.1f}"

    lines = [
        "// Generated by tools/fetch-osm.py — do not edit by hand; rerun the tool.",
        "//",
        f"// Objects inside the {width_m:.0f} m × {height_m:.0f} m window centred on {lat:.5f} N, {lon:.5f} E,",
        f"// in metres east and south of its north-west corner. Fetched {date.today().isoformat()} from",
        "// OpenStreetMap via the Overpass API. Data © OpenStreetMap contributors, ODbL",
        "// (https://www.openstreetmap.org/copyright).",
        "",
        'import type { MapLine, MapObject } from "../../engine/index.js";',
        "",
        f"export const {name}: MapObject[] = [",
    ]
    for o in objects:
        f = o["footprint"]
        height = f", height: {num(o['height'])}" if "height" in o else ""
        if f["shape"] == "circle":
            fp = f'{{ shape: "circle", center: {{ x: {num(f["center"]["x"])}, y: {num(f["center"]["y"])} }}, radius: {num(f["radius"])} }}'
        else:
            pts = ", ".join(f"{{ x: {num(p['x'])}, y: {num(p['y'])} }}" for p in f["points"])
            fp = f'{{ shape: "polygon", points: [{pts}] }}'
        lines.append(f'  {{ id: "{o["id"]}", kind: "{o["kind"]}", footprint: {fp}{height} }},')
    roads_name = (name[: -len("_OBJECTS")] if name.endswith("_OBJECTS") else name) + "_ROADS"
    lines += ["];", "", "/** Drawn, never read by a rule — see the tool's docstring. */", f"export const {roads_name}: MapLine[] = ["]
    for r in roads:
        pts = ", ".join(f"{{ x: {num(p['x'])}, y: {num(p['y'])} }}" for p in r["points"])
        lines.append(f'  {{ id: "{r["id"]}", kind: "{r["kind"]}", width: {num(r["width"])}, points: [{pts}] }},')
    lines += ["];", ""]
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lat", type=float, required=True)
    ap.add_argument("--lon", type=float, required=True)
    ap.add_argument("--width", type=float, default=900, help="metres east-west")
    ap.add_argument("--height", type=float, default=800, help="metres north-south")
    ap.add_argument("--name", default="OBJECTS", help="exported constant name")
    ap.add_argument("-o", "--output", help="write the module here (default: stdout)")
    args = ap.parse_args()

    elements = query(args.lat, args.lon, args.width, args.height)
    objects, roads = convert(elements, to_local(args.lat, args.lon, args.width, args.height), args.width, args.height)
    module = emit_module(objects, roads, args.name, args.lat, args.lon, args.width, args.height)
    if args.output:
        with open(args.output, "w", encoding="utf-8", newline="\n") as f:
            f.write(module)
        print(f"{args.output}: {len(objects)} objects, {len(roads)} roads", file=sys.stderr)
    else:
        sys.stdout.write(module)
    return 0


if __name__ == "__main__":
    sys.exit(main())
