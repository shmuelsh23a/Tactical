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

/**
 * The fight inside (decision 96): figures for the resolver, `interior/resolver.ts`.
 * Doctrine describes the room fight — "very close (within 10 meters) and very
 * fast (with targets exposed for a few seconds only)", TC 3-21.76 (2025),
 * para 11-20 — but gives no hit chance, reaction time or pace in numbers, so
 * **every figure here is ours** (⚠️) and is what the measurement against
 * doctrine's clearing times and casualties judges (docs/urban-design.md).
 */
export const CLOSE_QUARTERS = {
  /** One tick, in seconds: a turn (decision 40) holds `TURN_SECONDS / tickSeconds` of them. */
  tickSeconds: 1, // ours
  /**
   * A man's chance to hit, a second, by distance in metres: the document's
   * small arms give 30% a minute at 100 m; a man in a room shoots a man he
   * can see at a few metres. Ours (⚠️), the figure to measure first.
   */
  hitBySecond: [
    { maxRangeM: 5, chance: 0.5 },
    { maxRangeM: 10, chance: 0.35 },
    { maxRangeM: 20, chance: 0.2 },
    { maxRangeM: Infinity, chance: 0.1 },
  ],
  /** Against a man in a prepared position (a loophole, a barricade): the document's cover reading, halved. Ours. */
  coverFactor: 0.5, // ours (⚠️)
  /**
   * Seconds from first seeing a man to firing at him, unless already
   * watching the doorway he came through. The fatal funnel (ATP 3-06.11
   * (2024), paras C-24, C-39) is this second. Ours.
   */
  reactionSeconds: 1, // ours (⚠️)
  /** A brisk walk (ATP 3-06.11, para C-71), metres a second. Ours. */
  walkMps: 1.5, // ours (⚠️)
  /** Seconds to take a flight of stairs, one storey. Ours. */
  stairSeconds: 4, // ours (⚠️)
  /**
   * A grenade thrown into a room: each man in it is caught at the
   * document's 30% (הסתערות) times decision 77's enclosed-room factor, 2.5,
   * and a man it does not hit is stunned for `stunSeconds`. The thrower is
   * hit at the document's 5%. Ours: the stun and the multiplication.
   */
  stunSeconds: 2, // ours (⚠️)
  /**
   * A grenade thrown up a stairwell lands at half its chance: "grenades are
   * easier to throw down a stairwell than up" (ATTP 3-06.11 (2011), para
   * 7-148). The half is ours.
   */
  grenadeUpstairsFactor: 0.5, // ours (⚠️)
  /** Grenades a man carries into the building. Ours: the document leaves ammunition to backlog 12. */
  grenadesEach: 2, // ours (⚠️)
  /**
   * Seconds a team spends in a room it has taken before the next: the
   * drill's "CLEAR", security posted, the leader's check and the marking
   * (TC 3-21.76 (2025), 07-SQD-D9509, steps 7–9). Ours.
   */
  consolidateSeconds: 20, // ours (⚠️)
  /**
   * The methodical search of a room taken, by its floor area: caches,
   * crawl spaces, the back-clearing doctrine asks for ("UO building
   * clearing is not fast", ATP 3-06.11 (2024), para 3-8). **The author's
   * ruling, 2026-10-16**: sized so a lightly held two-storey house takes a
   * squad **about 20 minutes**, with the fighting adding to it — the low
   * end of the real data (Fallujah's "80 to 100 houses a day with a
   * platoon or a company-sized element", 1SG Smith, *Eyewitness to War*
   * Vol. II, pp. 199–200; an ARL Ranger squad about 30 minutes a 3–4 room
   * section). The figure itself is ours, set by `npm run interior-sim`
   * (docs/balance.md).
   */
  searchSecondsPerM2: 3.5, // ours (⚠️), calibrated 2026-10-16: 20.4 min, the demo map's median house, 8 against 1
  /** The longest a fight inside runs before it is called a standoff, in seconds. */
  maxSeconds: 3 * 60 * 60, // ours — three hours, past doctrine's 90 minutes unsupported
} as const;
