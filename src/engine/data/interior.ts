import { OBJECT_HEIGHT_M } from "./terrain.js";

/**
 * The inside of a building (README, rules decision 96): closed terrain is
 * fought soldier by soldier on a floor plan generated from the footprint,
 * because the map gives an outline and nothing inside it. These are the
 * generator's figures. Doctrine gives none of them, so every one is **ours**
 * (⚠️), set from typical construction and to be checked against the local
 * building types when the resolver is measured (docs/urban-design.md).
 */

/**
 * The side of a grid cell, in metres. A man's width: the cost prototype
 * measured 0.25 m at three times the cost and buying nothing doctrine asks
 * for (docs/balance.md, *What a fight inside a house costs*). Ours.
 */
export const INTERIOR_CELL_M = 0.5; // ours (⚠️), measured on cost

/** One storey's height, in metres — the same figure `tools/fetch-osm.py` turns `building:levels` into. */
export const STOREY_HEIGHT_M = 3; // ours (⚠️), as fetch-osm.py's STOREY_M

/**
 * Storeys of a building whose map gives no height: the building default's
 * 6 m (decision 15), two storeys (author, 2026-10-15, design accepted).
 */
export const DEFAULT_STOREYS = Math.max(1, Math.round(OBJECT_HEIGHT_M.building / STOREY_HEIGHT_M));

/** The most storeys a generated building is given, whatever its height. */
export const MAX_STOREYS = 30; // ours — a tower block, not a skyscraper

/**
 * How rooms are cut. A region is split while its longer side exceeds
 * `maxSideM`, and never so that a room's side falls under `minSideM`:
 * rooms of 3 to 6 m, a typical dwelling's bedroom to living room. Ours.
 */
export const ROOM = {
  minSideM: 3, // ours (⚠️)
  maxSideM: 6, // ours (⚠️)
} as const;

/**
 * The stairwell: the same rectangle on every storey, so the floors join
 * there. The usual flight of a house, 2 by 3 m, or 2 by 2 m where that
 * will not fit. Ours.
 */
export const STAIRWELL_M = [
  { w: 2, h: 3 },
  { w: 3, h: 2 },
  { w: 2, h: 2 },
] as const; // ours (⚠️)

/** A window about every 3 m of outside wall (ATP 3-06.11 gives no spacing). Ours. */
export const WINDOW_SPACING_M = 3; // ours (⚠️)

/** Doors to the street on the ground floor: a front door. Ours. */
export const OUTSIDE_DOORS = 1; // ours (⚠️)
