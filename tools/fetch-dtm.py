"""Fetch real ground for a map: a heightfield from public terrain tiles.

The game plays on real terrain (author, 2026-09-06 — "find some real place;
eventually we will use real world maps anyway"). This script cuts a window of
the AWS Terrain Tiles dataset into the engine's `Heightfield` shape and writes
it as a TypeScript module, so a scenario can import it and a replay carries it.

Usage (from the repo root):

    python tools/fetch-dtm.py --lat 32.635 --lon 35.078 \
        --width 900 --height 800 --spacing 10 --name ELYAKIM \
        -o src/app/maps/elyakim.ts

The window is `width` m east-west by `height` m north-south, centred on the
coordinates; row 0 is the northern edge, so the grid's y axis grows southward
like the map's. Heights are metres above sea level, sampled bilinearly from the
tiles onto a grid `spacing` m apart.

Source: Mapzen / Nextzen "terrarium" tiles on the AWS Open Data Registry
(https://registry.opendata.aws/terrain-tiles/), zoom 14 — about 8 m per pixel
at these latitudes. Over Israel the underlying data is SRTM (NASA, public
domain); the attribution the dataset asks for is written into the generated
module's header. Note the tiles are a DSM more than a DTM in places: a tree
canopy or a roof can be in the height.

Standard library only, like tools/dump-docx.py: the PNG decoder below handles
the one format the tiles use (8-bit RGB, non-interlaced) and nothing else.
"""

from __future__ import annotations

import argparse
import math
import struct
import sys
import urllib.request
import zlib
from datetime import date

TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
ZOOM = 14


def decode_png_rgb(data: bytes) -> tuple[int, int, list[list[tuple[int, int, int]]]]:
    """Decode an 8-bit RGB, non-interlaced PNG into rows of (r, g, b)."""
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")
    pos = 8
    width = height = 0
    idat = b""
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        kind = data[pos + 4 : pos + 8]
        body = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if kind == b"IHDR":
            width, height, depth, colour, _, _, interlace = struct.unpack(">IIBBBBB", body)
            if (depth, colour, interlace) != (8, 2, 0):
                raise ValueError(f"unsupported PNG: depth {depth}, colour type {colour}, interlace {interlace}")
        elif kind == b"IDAT":
            idat += body
        elif kind == b"IEND":
            break
    raw = zlib.decompress(idat)
    stride = width * 3
    rows: list[list[tuple[int, int, int]]] = []
    prev = bytearray(stride)
    at = 0
    for _ in range(height):
        filt = raw[at]
        line = bytearray(raw[at + 1 : at + 1 + stride])
        at += 1 + stride
        for i in range(stride):
            a = line[i - 3] if i >= 3 else 0
            b = prev[i]
            c = prev[i - 3] if i >= 3 else 0
            if filt == 1:
                line[i] = (line[i] + a) & 0xFF
            elif filt == 2:
                line[i] = (line[i] + b) & 0xFF
            elif filt == 3:
                line[i] = (line[i] + ((a + b) >> 1)) & 0xFF
            elif filt == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                line[i] = (line[i] + pred) & 0xFF
        rows.append([(line[i], line[i + 1], line[i + 2]) for i in range(0, stride, 3)])
        prev = line
    return width, height, rows


def terrarium_height(rgb: tuple[int, int, int]) -> float:
    r, g, b = rgb
    return (r * 256 + g + b / 256) - 32768


def tile_coords(lat: float, lon: float, zoom: int) -> tuple[float, float]:
    """Fractional tile x/y for a point, in the Web Mercator tile scheme."""
    n = 2**zoom
    x = (lon + 180) / 360 * n
    lat_r = math.radians(lat)
    y = (1 - math.log(math.tan(lat_r) + 1 / math.cos(lat_r)) / math.pi) / 2 * n
    return x, y


class TileCache:
    def __init__(self, zoom: int):
        self.zoom = zoom
        self.tiles: dict[tuple[int, int], list[list[float]]] = {}
        self.bytes = 0

    def height_at_pixel(self, px: float, py: float) -> float:
        """Bilinear height at a fractional global pixel coordinate."""
        x0, y0 = math.floor(px), math.floor(py)
        fx, fy = px - x0, py - y0
        h00 = self.pixel(x0, y0)
        h10 = self.pixel(x0 + 1, y0)
        h01 = self.pixel(x0, y0 + 1)
        h11 = self.pixel(x0 + 1, y0 + 1)
        return (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy

    def pixel(self, x: int, y: int) -> float:
        tx, ty = x // 256, y // 256
        tile = self.tiles.get((tx, ty))
        if tile is None:
            url = TILE_URL.format(z=self.zoom, x=tx, y=ty)
            data = urllib.request.urlopen(url, timeout=60).read()
            self.bytes += len(data)
            _, _, rows = decode_png_rgb(data)
            tile = [[terrarium_height(p) for p in row] for row in rows]
            self.tiles[(tx, ty)] = tile
        return tile[y % 256][x % 256]


def sample_window(
    lat: float, lon: float, width_m: float, height_m: float, spacing: float
) -> tuple[list[list[float]], TileCache]:
    cache = TileCache(ZOOM)
    metres_per_pixel = 156543.03392 * math.cos(math.radians(lat)) / 2**ZOOM
    cx, cy = tile_coords(lat, lon, ZOOM)
    cx, cy = cx * 256, cy * 256
    columns = int(round(width_m / spacing)) + 1
    rows = int(round(height_m / spacing)) + 1
    grid: list[list[float]] = []
    for r in range(rows):
        row: list[float] = []
        for c in range(columns):
            east = c * spacing - width_m / 2
            south = r * spacing - height_m / 2
            row.append(cache.height_at_pixel(cx + east / metres_per_pixel, cy + south / metres_per_pixel))
        grid.append(row)
    return grid, cache


def emit_module(
    grid: list[list[float]], name: str, spacing: float, lat: float, lon: float, place: str
) -> str:
    rows, columns = len(grid), len(grid[0])
    lo = min(min(r) for r in grid)
    hi = max(max(r) for r in grid)
    lines = [
        "// Generated by tools/fetch-dtm.py — do not edit by hand; rerun the tool.",
        "//",
        f"// {place}",
        f"// Window {(columns - 1) * spacing:.0f} m × {(rows - 1) * spacing:.0f} m centred on {lat:.5f} N, {lon:.5f} E;",
        f"// {columns} × {rows} samples {spacing:g} m apart, row 0 the northern edge; {lo:.0f}–{hi:.0f} m above sea level.",
        f"// Fetched {date.today().isoformat()} from the AWS Terrain Tiles (terrarium, zoom {ZOOM}),",
        "// https://registry.opendata.aws/terrain-tiles/ — Mapzen / Nextzen, over Israel from",
        "// NASA SRTM. Attribution: \"Terrain Tiles courtesy of Mapzen; elevation data from SRTM (NASA)\".",
        "",
        'import type { Heightfield } from "../../engine/index.js";',
        "",
        f"export const {name}: Heightfield = {{",
        f"  spacing: {spacing:g},",
        f"  columns: {columns},",
        f"  rows: {rows},",
        "  heights: [",
    ]
    for row in grid:
        lines.append("    " + ", ".join(f"{h:.1f}" for h in row) + ",")
    lines += ["  ],", "};", ""]
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lat", type=float, required=True)
    ap.add_argument("--lon", type=float, required=True)
    ap.add_argument("--width", type=float, default=900, help="metres east-west")
    ap.add_argument("--height", type=float, default=800, help="metres north-south")
    ap.add_argument("--spacing", type=float, default=10, help="metres between samples")
    ap.add_argument("--name", default="HEIGHTFIELD", help="exported constant name")
    ap.add_argument("--place", default="", help="one line saying where this is, for the header")
    ap.add_argument("-o", "--output", help="write the module here (default: stdout)")
    args = ap.parse_args()

    grid, cache = sample_window(args.lat, args.lon, args.width, args.height, args.spacing)
    module = emit_module(grid, args.name, args.spacing, args.lat, args.lon, args.place)
    if args.output:
        with open(args.output, "w", encoding="utf-8", newline="\n") as f:
            f.write(module)
        print(
            f"{args.output}: {len(grid[0])}×{len(grid)} samples from {len(cache.tiles)} tiles "
            f"({cache.bytes} bytes fetched)",
            file=sys.stderr,
        )
    else:
        sys.stdout.write(module)
    return 0


if __name__ == "__main__":
    sys.exit(main())
