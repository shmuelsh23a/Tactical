import type { CoverState } from "./directFire.js";

/**
 * Elevation and objects (README rules decision 15). The document has no
 * terrain table at all: it plays on a real map (מפה, תצ"ל) and leaves the
 * ground to the umpire. The author settled the shape on 2026-09-06 — real
 * elevation, objects rather than terrain types, one line-of-sight test — and
 * gave these figures **to be revisited at the balance pass**. Every number
 * here is therefore `tentative`, and is listed on docs/balance.md.
 */

/**
 * How high a force's eyes — and its silhouette — sit above the ground it
 * stands on, in metres. The same figure serves both ends of a sight line: a
 * force is seen at the height it sees from. A force in full cover is the
 * low one, which is what gives digging in a cost: a lower silhouette is
 * harder to see over a rise, and sees less over it (author, 2026-09-06).
 */
export const EYE_HEIGHT = {
  infantry: 1.5, // author (tentative pending balance)
  vehicle: 2.5, // author (tentative pending balance)
  fullCover: 0.5, // author (tentative pending balance)
} as const;

/** The kinds of object a map carries. */
export type MapObjectKind = "building" | "wall" | "tree";

/**
 * The protection an object gives a force standing in or against it (author,
 * 2026-09-06, tentative pending balance). It is applied as the force's
 * `baseCover`, so a force in a building is where a force behind cover has
 * always been in the rules, and one at a wall still digs the rest.
 */
export const OBJECT_COVER: Record<MapObjectKind, CoverState> = {
  building: "full", // author (tentative)
  wall: "partial", // author (tentative)
  tree: "partial", // author (tentative)
};

/**
 * How near a force must stand to an object to take its cover, in metres — a
 * wall is a line to stand behind, not an area to stand in. Ours.
 */
export const OBJECT_COVER_REACH_M = 3; // ours

/**
 * How far along its sight line a force ignores the faces of an object it is
 * in or against, in metres. Twice the cover reach: enough to clear both faces
 * of the wall a force lies behind, not enough to reach the far wall of a
 * building it stands against — a force looks over its wall and out of its
 * building, but not through twenty metres of somebody else's house. Ours.
 */
export const OWN_OBJECT_SIGHT_M = OBJECT_COVER_REACH_M * 2; // ours

/** Height of an object above the ground when the map does not say. Ours. */
export const OBJECT_HEIGHT_M: Record<MapObjectKind, number> = {
  building: 6, // ours — two storeys
  wall: 1.5, // ours — a stone terrace wall, chest high
  tree: 4, // ours — an oak, the crown counted
};

/**
 * What the ground costs to cross (author, 2026-09-06 — "go with Naismith";
 * the figures are ours and tentative pending balance). Naismith's rule: an
 * hour for every 5 km on the flat and another for every 600 m climbed, so a
 * metre of ascent costs about eight metres of going. Descent is free. This is
 * what makes the high ground cost what it is worth: a crest buys sight lines
 * and is paid for in bounds, where before it was free to take.
 *
 * A shot's chance is **not** changed by height (author, 2026-09-06, "no hit
 * modifier for now"): the sight lines already reward the high ground.
 */
export const SLOPE = {
  /** Metres of a bound's budget spent per metre climbed. */
  climbCostPerMetre: 8, // author (tentative) — Naismith
  /** The steepest grade a vehicle will take, in degrees. Infantry takes any. */
  vehicleMaxGradeDeg: 30, // author (tentative)
} as const;

/**
 * How often the ground is sampled along a sight line, in metres. Objects are
 * tested exactly where the line crosses them, so this only has to catch the
 * ground itself, which the heightfield already smooths. Ours.
 */
export const LOS_SAMPLE_STEP_M = 5; // ours
