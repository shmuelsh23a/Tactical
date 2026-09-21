"""Lay a battle out on a window of real ground, without editing TypeScript.

The ground is already a tool's output — `tools/fetch-dtm.py` writes the relief
and `tools/fetch-osm.py` what stands on it. This writes the third module: the
**scenario**, the forces and charges placed on that window, from a small JSON
spec. It is the last of backlog 6: a battle laid out by describing it rather
than by hand-editing a TypeScript module.

Usage (from the repo root):

    python tools/make-scenario.py tools/scenarios/yokneam-illit.json
    python tools/make-scenario.py <spec> --fetch-map     # ...and refetch the ground

By default the ground is left alone and only the scenario module is written:
refetching a window moves the data under a battle already placed on it, and the
demo's own test pins sight lines that live within a metre or two of a house.
Pass `--fetch-map` deliberately, and re-verify the layout afterwards.

The spec, in full — everything not marked optional is required:

    {
      "slug": "yokneamIllit",              module name: src/app/scenarios/<slug>.ts
      "title": "...",                       shown in the app's header
      "brief": "...",                       one Hebrew line for the battle picker
      "seed": 2026,                         default seed for the battle
      "trackIntel": true,                   optional (default true)
      "enforceC2": true,                    optional (default true)
      "about": ["prose..."],                optional: the module's doc comment
      "window": {
        "lat": 32.645, "lon": 35.085,       centre of the ground
        "width": 900, "height": 800,        metres; the map extent the app draws
        "spacing": 10,                      optional (default 10), DTM sample step
        "place": "one line for the header", optional
        "heightfield": "ramatMenashe",      modules under src/app/maps/ holding the
        "objects": "ramatMenasheObjects",   relief and the objects; written by the
        "constant": "RAMAT_MENASHE"         fetch tools, named by their --name
      },
      "forces": [
        { "id": "BLUE-1", "name": "...", "side": "BLUE", "kind": "infantry",
          "echelon": "squad", "soldiers": 8, "at": [250, 80] },
        { "id": "RED-TANK", "side": "RED", "kind": "vehicle", "at": [520, 500],
          "facing": 270 },
        { "id": "RED-HQ", "side": "RED", "kind": "command", "echelon": "platoon",
          "personnel": 3, "at": [436, 599] }
      ],
      "charges": [
        { "side": "RED", "type": "antiPersonnel", "at": [330, 240] }
      ]
    }

A force may also carry, all optional:

    "camouflaged": true | turns   true means fully camouflaged from the first
                                  turn - a position prepared before the battle
    "baseCover": "partial"|"full" protection it holds without digging
    "scouting": true              out scouting from the start
    "canLayCharges": true         an insurgent or special force (decision 16)

`at` is **metres east and south of the window's north-west corner**, the same
frame as the heightfield and the map the app draws. It may instead be given as
`{"lat": ..., "lon": ...}` and is converted with the window's own projection, so
a position read off a real map does not have to be measured by hand.

What it refuses (the spec is wrong, not the ground):

  * a force or a charge outside the window
  * two forces sharing an id
  * a side with no force at all
  * a vehicle given `soldiers`, or infantry given `facing`
  * an unknown key anywhere - a misspelt `camouflaged` would otherwise be
    silently dropped and the force would fight undressed

What it does **not** check: anything that is a rule. Whether a force can see
another, what cover the ground gives it, whether the battle is any good - all of
that belongs to the engine, and the way to pin it is a test beside the generated
module (`src/app/scenario.test.ts` is the worked example). With `--fetch-map`
the tool has the relief in hand and prints each force's ground height and its
distance to the nearest object, which is placement information rather than a
rule.

Standard library only, like the other tools.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import re
import sys
from datetime import date
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
MAPS_DIR = ROOT / "src" / "app" / "maps"
SCENARIOS_DIR = ROOT / "src" / "app" / "scenarios"


def load_tool(filename: str):
    """Import a sibling tool. Their names have hyphens, so `import` will not."""
    path = Path(__file__).resolve().parent / filename
    spec = importlib.util.spec_from_file_location(path.stem.replace("-", "_"), path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# ---- the spec ----

WINDOW_KEYS = {"lat", "lon", "width", "height", "spacing", "place", "heightfield", "objects", "constant"}
FORCE_KEYS = {
    "id", "name", "side", "kind", "echelon", "soldiers", "personnel", "at", "facing",
    "camouflaged", "baseCover", "scouting", "canLayCharges", "note",
}
CHARGE_KEYS = {"side", "type", "at", "armed", "detected"}
SPEC_KEYS = {"slug", "title", "brief", "seed", "trackIntel", "enforceC2", "about", "window", "forces", "charges"}
KINDS = {"infantry", "vehicle", "command"}
# What each kind may carry beyond the common keys. A key spelt correctly but
# given to the wrong kind is refused rather than dropped: `soldiers` on a
# command group would otherwise leave a 3-man HQ where 9 men were asked for,
# which is the same silent failure the unknown-key check exists to stop.
KIND_KEYS = {
    "infantry": {"echelon", "soldiers"},
    "command": {"echelon", "personnel"},
    "vehicle": {"facing"},
}
DEFAULT_ECHELON = {"infantry": "squad", "command": "platoon", "vehicle": "squad"}
SLUG = re.compile(r"[A-Za-z][A-Za-z0-9]*$")
SIDES = {"RED", "BLUE"}
ECHELONS = {"squad", "platoon", "company", "battalion", "brigade"}
COVER = {"none", "partial", "full"}
CHARGE_TYPES = {"antiPersonnel", "antiTank"}


class SpecError(Exception):
    """The spec says something the tool will not write."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SpecError(message)


def require_int(given: dict[str, Any], key: str, where: str, low: int, high: int) -> None:
    """A count is a whole number in range. JSON will happily carry 8.7."""
    if key not in given:
        return
    value = given[key]
    require(
        isinstance(value, int) and not isinstance(value, bool) and low <= value <= high,
        f"{where}: {key} must be a whole number between {low} and {high}",
    )


def require_bool(given: dict[str, Any], key: str, where: str) -> None:
    """`"false"` is a string, and a string is true in TypeScript."""
    if key in given:
        require(isinstance(given[key], bool), f"{where}: {key} must be true or false")


def check_keys(where: str, given: dict[str, Any], allowed: set[str]) -> None:
    unknown = sorted(set(given) - allowed)
    require(not unknown, where + ": unknown key(s) " + ", ".join(unknown))


def to_metres(at: Any, window: dict[str, Any], where: str) -> tuple[float, float]:
    """A position, in metres east and south of the window's north-west corner."""
    if isinstance(at, dict):
        check_keys(where + ".at", at, {"lat", "lon"})
        require("lat" in at and "lon" in at, where + ".at: needs both lat and lon")
        # Borrowed from fetch-osm.py rather than rewritten, because a position
        # given in degrees has to land where that tool put the ground: two
        # equirectangular projections with different constants disagree by a
        # metre at this window's edge and grow with the window.
        local = load_tool("fetch-osm.py").to_local(
            float(window["lat"]), float(window["lon"]), float(window["width"]), float(window["height"])
        )
        return local({"lat": float(at["lat"]), "lon": float(at["lon"])})
    require(
        isinstance(at, (list, tuple)) and len(at) == 2,
        where + ".at: expected [x, y] in metres or {lat, lon}",
    )
    return float(at[0]), float(at[1])


def parse(spec: dict[str, Any]) -> dict[str, Any]:
    """Validate the spec and resolve every position to window metres."""
    check_keys("spec", spec, SPEC_KEYS)
    for key in ("slug", "title", "brief", "seed", "window", "forces"):
        require(key in spec, f"spec: missing {key}")
    # The picker lists every battle by title and by this line. An empty one
    # reaches the player as a bare name with nothing saying what the ground
    # asks of them, so it is refused here rather than rendered blank.
    for key in ("title", "brief"):
        require(
            isinstance(spec[key], str) and spec[key].strip() != "",
            f"spec: {key} must be a non-empty string",
        )
    # The slug becomes a file name and a function name.
    require(
        isinstance(spec["slug"], str) and SLUG.match(spec["slug"]) is not None,
        "spec: slug must be a letter followed by letters or digits (it names a module and a function)",
    )
    # The seed is the whole of a battle's determinism: a float here would be
    # written back through a float formatter and quietly rounded.
    require(
        isinstance(spec["seed"], int) and not isinstance(spec["seed"], bool),
        "spec: seed must be a whole number",
    )
    require_bool(spec, "trackIntel", "spec")
    require_bool(spec, "enforceC2", "spec")
    window = spec["window"]
    check_keys("window", window, WINDOW_KEYS)
    for key in ("lat", "lon", "width", "height", "heightfield", "objects", "constant"):
        require(key in window, f"window: missing {key}")
    width, height = float(window["width"]), float(window["height"])

    forces: list[dict[str, Any]] = []
    seen: set[str] = set()
    for force in spec["forces"]:
        where = "force " + str(force.get("id", "?"))
        check_keys(where, force, FORCE_KEYS)
        for key in ("id", "side", "kind", "at"):
            require(key in force, f"{where}: missing {key}")
        require(force["id"] not in seen, f"{where}: duplicate id")
        seen.add(force["id"])
        require(force["side"] in SIDES, f"{where}: side must be RED or BLUE")
        require(force["kind"] in KINDS, f"{where}: kind must be one of {sorted(KINDS)}")
        kind = force["kind"]
        misplaced = sorted((set(force) & (set().union(*KIND_KEYS.values()))) - KIND_KEYS[kind])
        require(
            not misplaced,
            f'{where}: a force of kind "{kind}" has no ' + ", ".join(misplaced),
        )
        require(force.get("echelon", DEFAULT_ECHELON[kind]) in ECHELONS, f"{where}: unknown echelon")
        require_int(force, "soldiers", where, 1, 60)
        require_int(force, "personnel", where, 1, 60)
        require_int(force, "facing", where, 0, 359)
        require_bool(force, "scouting", where)
        require_bool(force, "canLayCharges", where)
        if force.get("camouflaged") is not True:
            require_int(force, "camouflaged", where, 0, 100)
        if "baseCover" in force:
            require(force["baseCover"] in COVER, f"{where}: baseCover must be one of {sorted(COVER)}")
        if "note" in force:
            require(isinstance(force["note"], str), f"{where}: note must be a line of text")
        x, y = to_metres(force["at"], window, where)
        require(
            0 <= x <= width and 0 <= y <= height,
            f"{where}: ({x:.0f}, {y:.0f}) is outside the {width:.0f}x{height:.0f} m window",
        )
        forces.append({**force, "x": x, "y": y})

    for side in sorted(SIDES):
        require(any(f["side"] == side for f in forces), f"spec: {side} has no forces")

    charges: list[dict[str, Any]] = []
    for i, charge in enumerate(spec.get("charges", [])):
        where = f"charge {i + 1}"
        check_keys(where, charge, CHARGE_KEYS)
        for key in ("side", "type", "at"):
            require(key in charge, f"{where}: missing {key}")
        require(charge["side"] in SIDES, f"{where}: side must be RED or BLUE")
        require(charge["type"] in CHARGE_TYPES, f"{where}: type must be one of {sorted(CHARGE_TYPES)}")
        x, y = to_metres(charge["at"], window, where)
        require(0 <= x <= width and 0 <= y <= height, f"{where}: ({x:.0f}, {y:.0f}) is outside the window")
        charges.append({**charge, "x": x, "y": y})

    return {**spec, "forces": forces, "charges": charges}


def check_window_against_ground(window: dict[str, Any]) -> str | None:
    """
    The window in the spec must be the window the relief was actually cut to.

    Leaving the ground alone is the default, which makes this the easy mistake:
    a spec claiming 1500 × 1400 m over a 900 × 800 m heightfield compiles and
    plays, with the app drawing ground that is not there and `groundHeight`
    clamping the overhang into a flat smear of the edge row. The heightfield is
    a generated module of fixed shape, so its own numbers are read back here.

    Returns a complaint, or None when the two agree — or when the module is not
    the shape this tool wrote, in which case it says nothing rather than guess.
    """
    path = MAPS_DIR / (window["heightfield"] + ".ts")
    if not path.exists():
        return f"{path.name} does not exist — run tools/fetch-dtm.py, or pass --fetch-map"
    text = path.read_text(encoding="utf-8")
    found: dict[str, float] = {}
    for key in ("spacing", "columns", "rows"):
        m = re.search(r"^\s*" + key + r":\s*([0-9.]+),", text, re.MULTILINE)
        if not m:
            return None
        found[key] = float(m.group(1))
    ground_w = (found["columns"] - 1) * found["spacing"]
    ground_h = (found["rows"] - 1) * found["spacing"]
    spacing = float(window.get("spacing", 10))
    if (
        ground_w != float(window["width"])
        or ground_h != float(window["height"])
        or spacing != found["spacing"]
    ):
        return (
            f"window is {float(window['width']):.0f}x{float(window['height']):.0f} m at "
            f"{spacing:g} m spacing, but {path.name} holds {ground_w:.0f}x{ground_h:.0f} m at "
            f"{found['spacing']:g} m — fix the window, or refetch the ground with --fetch-map"
        )
    return None


# ---- the module ----


def ts(text: str) -> str:
    """A TypeScript string literal. Titles and force names are Hebrew."""
    return json.dumps(text, ensure_ascii=False)


def num(value: float) -> str:
    return f"{float(value):g}"


def pascal(slug: str) -> str:
    return slug[:1].upper() + slug[1:]


def screaming(slug: str) -> str:
    """`telAzeka` -> `TEL_AZEKA`: the constant name for the battle's entry."""
    return re.sub(r"(?<!^)(?=[A-Z])", "_", slug).upper()


def emit(spec: dict[str, Any], spec_path: Path) -> str:
    window = spec["window"]
    forces, charges = spec["forces"], spec["charges"]
    constant = window["constant"]
    objects_constant = constant + "_OBJECTS"
    roads_constant = constant + "_ROADS"
    name = pascal(spec["slug"])

    imports = ["Game", "makeCommandGroup", "makeInfantry", "makeVehicle"]
    if any(f.get("camouflaged") is True for f in forces):
        imports.insert(0, "CAMOUFLAGE_TURNS_AT_MAX")
    import_list = ", ".join(imports)

    lines = [
        "// Generated by tools/make-scenario.py from " + spec_path.as_posix() + " — do",
        "// not edit by hand; change the spec and rerun the tool. The ground it is laid",
        "// on is generated too, by tools/fetch-dtm.py and tools/fetch-osm.py.",
        "// Written " + date.today().isoformat() + ".",
        "",
        'import { ' + import_list + ', type Terrain } from "../../engine/index.js";',
        'import type { Scenario, ScenarioEntry } from "./types.js";',
        "import { " + constant + ' } from "../maps/' + window["heightfield"] + '.js";',
        "import { " + objects_constant + ", " + roads_constant
        + ' } from "../maps/' + window["objects"] + '.js";',
        "",
    ]

    place = window.get("place", "")
    lines += [
        "/**",
        " * " + place if place else " * The ground this battle is laid on.",
        " * " + num(window["width"]) + " × " + num(window["height"]) + " m centred on "
        + f'{float(window["lat"]):.5f} N, {float(window["lon"]):.5f} E, north up.',
        " */",
        "export function build" + name + "Terrain(): Terrain {",
        "  return { heightfield: " + constant + ", objects: " + objects_constant
        + ", roads: " + roads_constant + " };",
        "}",
        "",
    ]

    about = spec.get("about", [])
    if about:
        lines += ["/**"] + [(" * " + line).rstrip() for line in about] + [" */"]
    lines += [
        "export function build" + name + "Scenario(seed = " + str(int(spec["seed"])) + "): Scenario {",
        "  const game = new Game({",
        "    seed,",
        "    trackIntel: " + str(spec.get("trackIntel", True)).lower() + ",",
        "    enforceC2: " + str(spec.get("enforceC2", True)).lower() + ",",
        "    terrain: build" + name + "Terrain(),",
        "  });",
        "",
    ]

    said_dressing = False
    for f in forces:
        at = "{ x: " + num(f["x"]) + ", y: " + num(f["y"]) + " }"
        given_name = [ts(f["name"])] if "name" in f else []
        if f["kind"] == "vehicle":
            args = [ts(f["id"]), ts(f["side"]), at, num(f.get("facing", 0))]
            call = "makeVehicle(" + ", ".join(args + given_name) + ")"
        elif f["kind"] == "command":
            args = [ts(f["id"]), ts(f["side"]), ts(f.get("echelon", DEFAULT_ECHELON["command"])), at, num(f.get("personnel", 3))]
            call = "makeCommandGroup(" + ", ".join(args + given_name) + ")"
        else:
            args = [ts(f["id"]), ts(f["side"]), ts(f.get("echelon", DEFAULT_ECHELON["infantry"])), at, num(f.get("soldiers", 8))]
            call = "makeInfantry(" + ", ".join(args + given_name) + ")"

        dressing: list[str] = []
        if f.get("camouflaged"):
            turns = "CAMOUFLAGE_TURNS_AT_MAX" if f["camouflaged"] is True else num(f["camouflaged"])
            dressing += ["camouflaging = true", "camouflageTurns = " + turns]
        if "baseCover" in f:
            dressing.append("baseCover = " + ts(f["baseCover"]))
        if f.get("scouting"):
            dressing.append("scouting = true")
        if f.get("canLayCharges"):
            dressing.append("canLayCharges = true")

        if "note" in f:
            lines.append("  // " + f["note"])
        if not dressing:
            lines.append("  game.addUnit(" + call + ");")
        else:
            if not said_dressing:
                # Said once, next to the first force it applies to.
                lines += [
                    "  // Dressed before it is added: addUnit records a force as it stands, so",
                    "  // a force camouflaged or covered after the fact would replay undressed.",
                ]
                said_dressing = True
            local = f["id"].replace("-", "").lower()
            lines.append("  const " + local + " = " + call + ";")
            lines += ["  " + local + "." + d + ";" for d in dressing]
            lines.append("  game.addUnit(" + local + ");")
    lines.append("")

    if charges:
        lines += [
            "  // Emplaced in setup, which is the only time a charge is placed rather",
            "  // than laid by a force during the battle (rules decision 16).",
        ]
        for c in charges:
            lines.append(
                "  game.addMine({ side: " + ts(c["side"]) + ", type: " + ts(c["type"])
                + ", position: { x: " + num(c["x"]) + ", y: " + num(c["y"]) + " }"
                + ", armed: " + str(c.get("armed", True)).lower()
                + ", detected: " + str(c.get("detected", False)).lower() + " });"
            )
        lines.append("")

    lines += [
        "  return { game, mapWidth: " + num(window["width"]) + ", mapHeight: "
        + num(window["height"]) + ", title: " + ts(spec["title"]) + " };",
        "}",
        "",
    ]

    lines += [
        "/**",
        " * This battle as the app's picker lists it. Generated with the rest, so the",
        " * line the player chooses by and the title on the header cannot drift apart.",
        " */",
        "export const " + screaming(spec["slug"]) + "_BATTLE: ScenarioEntry = {",
        "  id: " + ts(spec["slug"]) + ",",
        "  title: " + ts(spec["title"]) + ",",
        "  brief: " + ts(spec["brief"]) + ",",
        "  build: build" + name + "Scenario,",
        "};",
        "",
    ]
    return "\n".join(lines)


# ---- placement report (only when the ground was fetched) ----


def report(spec: dict[str, Any], grid: list[list[float]], objects: list[dict[str, Any]]) -> list[str]:
    """
    Where each force stands, in the terms the ground gives.

    Not a rule — nothing here decides cover, sight, or anything else the engine
    decides. But the two numbers it prints are **mirrors of engine functions**,
    and have to agree with the originals or they are worse than useless: a
    distance measured to a polygon's nearest *vertex* would report a force
    leaning on a building as 10 m away from it.

        ground   ->  groundHeight         bilinear, src/engine/terrain.ts
        nearest  ->  distanceToFootprint  to the edge, zero inside — and
                     distanceToPolygon / distanceToSegment in geometry.ts

    If either engine function changes, these follow it.
    """
    spacing = float(spec["window"].get("spacing", 10))
    rows, columns = len(grid), len(grid[0])

    def height_at(x: float, y: float) -> float:
        gx = min(max(x / spacing, 0.0), columns - 1)
        gy = min(max(y / spacing, 0.0), rows - 1)
        c0, r0 = int(math.floor(gx)), int(math.floor(gy))
        c1, r1 = min(c0 + 1, columns - 1), min(r0 + 1, rows - 1)
        fx, fy = gx - c0, gy - r0
        top = grid[r0][c0] * (1 - fx) + grid[r0][c1] * fx
        bottom = grid[r1][c0] * (1 - fx) + grid[r1][c1] * fx
        return top * (1 - fy) + bottom * fy

    def to_segment(px: float, py: float, a: dict, b: dict) -> float:
        dx, dy = b["x"] - a["x"], b["y"] - a["y"]
        length = dx * dx + dy * dy
        t = 0.0 if length == 0 else max(0.0, min(1.0, ((px - a["x"]) * dx + (py - a["y"]) * dy) / length))
        return math.dist((px, py), (a["x"] + t * dx, a["y"] + t * dy))

    def inside(px: float, py: float, points: list[dict]) -> bool:
        within = False
        j = len(points) - 1
        for i in range(len(points)):
            pi, pj = points[i], points[j]
            if (pi["y"] > py) != (pj["y"] > py):
                if px < (pj["x"] - pi["x"]) * (py - pi["y"]) / (pj["y"] - pi["y"]) + pi["x"]:
                    within = not within
            j = i
        return within

    def nearest(x: float, y: float) -> tuple[float, str]:
        best, what = float("inf"), "nothing"
        for o in objects:
            fp = o["footprint"]
            if fp["shape"] == "circle":
                d = max(0.0, math.dist((x, y), (fp["center"]["x"], fp["center"]["y"])) - fp["radius"])
            elif inside(x, y, fp["points"]):
                d = 0.0
            else:
                pts = fp["points"]
                d = min(to_segment(x, y, pts[i - 1], pts[i]) for i in range(len(pts)))
            if d < best:
                best, what = d, o["kind"]
        return best, what

    out = ["  force         at              ground   nearest object"]
    for f in spec["forces"]:
        d, kind = nearest(f["x"], f["y"])
        at = f'({f["x"]:.0f}, {f["y"]:.0f})'
        out.append(
            "  " + f["id"].ljust(13) + at.ljust(16)
            + f'{height_at(f["x"], f["y"]):>5.0f} m   {d:.1f} m to a {kind}'
        )
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("spec", help="path to the scenario spec (JSON)")
    ap.add_argument(
        "--fetch-map",
        action="store_true",
        help="also refetch the relief and the objects (moves the ground under an existing layout)",
    )
    ap.add_argument("-o", "--output", help="write the module here (default: src/app/scenarios/<slug>.ts)")
    args = ap.parse_args()

    spec_path = Path(args.spec)
    try:
        spec = parse(json.loads(spec_path.read_text(encoding="utf-8")))
    except SpecError as e:
        print(f"{spec_path}: {e}", file=sys.stderr)
        return 2

    window = spec["window"]
    if not args.fetch_map:
        complaint = check_window_against_ground(window)
        if complaint:
            print(f"{spec_path}: {complaint}", file=sys.stderr)
            return 2
    grid: list[list[float]] | None = None
    objects: list[dict[str, Any]] | None = None
    if args.fetch_map:
        dtm, osm = load_tool("fetch-dtm.py"), load_tool("fetch-osm.py")
        spacing = float(window.get("spacing", 10))
        # Both are fetched before either is written: fresh relief under stale
        # objects is worse than neither, and Overpass is the likelier to fail.
        grid, cache = dtm.sample_window(window["lat"], window["lon"], window["width"], window["height"], spacing)
        elements = osm.query(window["lat"], window["lon"], window["width"], window["height"])
        objects, roads = osm.convert(
            elements,
            osm.to_local(window["lat"], window["lon"], window["width"], window["height"]),
            window["width"],
            window["height"],
        )

        heightfield_path = MAPS_DIR / (window["heightfield"] + ".ts")
        heightfield_path.write_text(
            dtm.emit_module(grid, window["constant"], spacing, window["lat"], window["lon"], window.get("place", "")),
            encoding="utf-8",
            newline="\n",
        )
        print(f"{heightfield_path}: {len(grid[0])}x{len(grid)} samples ({cache.bytes} bytes)", file=sys.stderr)

        objects_path = MAPS_DIR / (window["objects"] + ".ts")
        objects_path.write_text(
            osm.emit_module(
                objects, roads, window["constant"] + "_OBJECTS",
                window["lat"], window["lon"], window["width"], window["height"],
            ),
            encoding="utf-8",
            newline="\n",
        )
        print(f"{objects_path}: {len(objects)} objects, {len(roads)} roads", file=sys.stderr)

    out = Path(args.output) if args.output else SCENARIOS_DIR / (spec["slug"] + ".ts")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(emit(spec, spec_path), encoding="utf-8", newline="\n")
    print(
        f'{out}: {len(spec["forces"])} forces, {len(spec["charges"])} charges on '
        f'{num(window["width"])}x{num(window["height"])} m',
        file=sys.stderr,
    )
    if grid is not None and objects is not None:
        print("\n".join(report(spec, grid, objects)), file=sys.stderr)
    else:
        print(
            "  (ground left alone: rerun with --fetch-map for a placement report, and pin\n"
            "   what the layout depends on in a test beside the module)",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
