import {
  distance,
  distanceToPolygon,
  lerpPoint,
  nearestParam,
  pointInPolygon,
  segmentCircleCrossings,
  segmentPolygonCrossings,
  type Point,
} from "./geometry.js";
import type { Unit } from "./types.js";
import { stepTowards } from "./orders.js";
import type { CoverState } from "./data/directFire.js";
import {
  EYE_HEIGHT,
  LOS_SAMPLE_STEP_M,
  OBJECT_COVER,
  OBJECT_COVER_REACH_M,
  OBJECT_HEIGHT_M,
  OWN_OBJECT_SIGHT_M,
  SLOPE,
  type MapObjectKind,
} from "./data/terrain.js";

/**
 * The ground (README rules decision 15).
 *
 * The document plays on a real map and says nothing about terrain; the author
 * settled the shape on 2026-09-06. The game is to scale from a squad up to a
 * brigade with metre-level resolution underneath, so the map carries **real
 * elevation** and **objects** — a building, a tree, a wall — rather than
 * terrain types, and one function answers "how high is the world here". Line
 * of sight is one test over that function, from an observer's eye to a
 * target's silhouette, and it is binary and symmetric: a crest hides a force
 * and blinds it equally, so reverse slope versus crest is the player's choice
 * with no invented number behind it.
 *
 * A map with no terrain plays exactly as before: flat ground at 0 m, nothing
 * on it, every sight line clear but for smoke.
 */

/**
 * Ground elevation on a regular grid, metres above sea level. `heights` is
 * row-major, `rows × columns` long; sample `(row, column)` sits at
 * `origin + (column, row) × spacing`, so row 0 is the northern edge when the
 * map's y axis grows southward, as the hotseat's does. Between samples the
 * ground is interpolated bilinearly; beyond the edge it continues level.
 */
export interface Heightfield {
  /** Map coordinates of sample (0, 0). Defaults to the map origin. */
  origin?: Point;
  /** Metres between samples. */
  spacing: number;
  columns: number;
  rows: number;
  heights: number[];
}

/** Where an object stands: a disc (a tree) or a polygon (a building, a wall). */
export type Footprint =
  | { shape: "circle"; center: Point; radius: number }
  | { shape: "polygon"; points: Point[] };

/** A thing on the ground: something to hide behind, and something that blocks sight. */
export interface MapObject {
  id: string;
  kind: MapObjectKind;
  footprint: Footprint;
  /** Metres above the ground; the kind's usual height when absent. */
  height?: number;
}

/** Everything a map says about the ground. */
export interface Terrain {
  heightfield?: Heightfield;
  objects: MapObject[];
}

/** The ground of a game built without one: flat, and empty. */
export const FLAT_GROUND: Terrain = { objects: [] };

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Ground elevation at `p`, bilinearly interpolated; 0 m with no heightfield. */
export function groundHeight(terrain: Terrain, p: Point): number {
  const hf = terrain.heightfield;
  if (!hf) return 0;
  const ox = hf.origin?.x ?? 0;
  const oy = hf.origin?.y ?? 0;
  const gx = clamp((p.x - ox) / hf.spacing, 0, hf.columns - 1);
  const gy = clamp((p.y - oy) / hf.spacing, 0, hf.rows - 1);
  const c0 = Math.floor(gx);
  const r0 = Math.floor(gy);
  const c1 = Math.min(c0 + 1, hf.columns - 1);
  const r1 = Math.min(r0 + 1, hf.rows - 1);
  const fx = gx - c0;
  const fy = gy - r0;
  const h = (r: number, c: number) => hf.heights[r * hf.columns + c] ?? 0;
  return (
    (h(r0, c0) * (1 - fx) + h(r0, c1) * fx) * (1 - fy) +
    (h(r1, c0) * (1 - fx) + h(r1, c1) * fx) * fy
  );
}

/** The height of an object above the ground. */
export function objectHeight(o: MapObject): number {
  return o.height ?? OBJECT_HEIGHT_M[o.kind];
}

/** True when `p` is inside the object's footprint. */
export function footprintContains(f: Footprint, p: Point): boolean {
  return f.shape === "circle" ? distance(f.center, p) <= f.radius : pointInPolygon(p, f.points);
}

/** Distance from `p` to the footprint's edge; zero inside it. */
export function distanceToFootprint(f: Footprint, p: Point): number {
  return f.shape === "circle"
    ? Math.max(0, distance(f.center, p) - f.radius)
    : distanceToPolygon(p, f.points);
}

/**
 * The cover a force presents right now, as fire and sight both read it: full
 * cover counts as partial for a force that fired this turn, since firing from
 * a position exposes it — the document's own "-10% when firing while in
 * cover" (rules decision 7). One function, so a force cannot be exposed to a
 * shot while still crouching out of sight.
 */
export function effectiveCover(unit: Unit): CoverState {
  if (unit.cover === "full" && unit.firedThisTurn) return "partial";
  return unit.cover;
}

/**
 * How high a force's eyes — and its silhouette — sit above the ground where it
 * stands. A vehicle looks out from its hatches; a force in full cover keeps
 * its head down, and is that much harder to see over a rise (author,
 * 2026-09-06). The same figure serves both ends of a sight line, and it reads
 * {@link effectiveCover}: a force that stood up to fire is standing.
 */
export function eyeHeight(unit: Unit): number {
  if (unit.kind === "vehicle") return EYE_HEIGHT.vehicle;
  return effectiveCover(unit) === "full" ? EYE_HEIGHT.fullCover : EYE_HEIGHT.infantry;
}

const COVER_RANK: Record<CoverState, number> = { none: 0, partial: 1, full: 2 };

/** The better of two cover states. */
export function betterCover(a: CoverState, b: CoverState): CoverState {
  return COVER_RANK[a] >= COVER_RANK[b] ? a : b;
}

/**
 * The cover the ground offers a force standing at `p`: that of the best object
 * it is in or against, within {@link OBJECT_COVER_REACH_M}. Nothing in the
 * open — what a force does about that is dig (rules decision 12).
 */
export function coverFromObjects(terrain: Terrain, p: Point): CoverState {
  let best: CoverState = "none";
  for (const o of terrain.objects) {
    if (distanceToFootprint(o.footprint, p) <= OBJECT_COVER_REACH_M) {
      best = betterCover(best, OBJECT_COVER[o.kind]);
    }
  }
  return best;
}

/**
 * Metres climbed along the straight line `from`→`to`: the sum of every rise
 * between one ground sample and the next, descents ignored. Zero on flat
 * ground.
 */
export function climbAlong(terrain: Terrain, from: Point, to: Point): number {
  if (!terrain.heightfield) return 0;
  const length = distance(from, to);
  if (length === 0) return 0;
  const steps = Math.max(1, Math.ceil(length / LOS_SAMPLE_STEP_M));
  let climb = 0;
  let previous = groundHeight(terrain, from);
  for (let i = 1; i <= steps; i++) {
    const z = groundHeight(terrain, lerpPoint(from, to, i / steps));
    if (z > previous) climb += z - previous;
    previous = z;
  }
  return climb;
}

/**
 * The steepest grade met along `from`→`to`, in degrees, up **or down** — a
 * vehicle refuses a 30° descent as it refuses a 30° climb. Zero on flat
 * ground.
 */
export function steepestGradeAlong(terrain: Terrain, from: Point, to: Point): number {
  if (!terrain.heightfield) return 0;
  const length = distance(from, to);
  if (length === 0) return 0;
  const steps = Math.max(1, Math.ceil(length / LOS_SAMPLE_STEP_M));
  const run = length / steps;
  let steepest = 0;
  let previous = groundHeight(terrain, from);
  for (let i = 1; i <= steps; i++) {
    const z = groundHeight(terrain, lerpPoint(from, to, i / steps));
    steepest = Math.max(steepest, Math.abs(z - previous) / run);
    previous = z;
  }
  return (Math.atan(steepest) * 180) / Math.PI;
}

/**
 * What a bound from `from` to `to` costs against a gait's budget, in metres
 * of flat going: the distance, plus {@link SLOPE.climbCostPerMetre} for every
 * metre climbed (Naismith). On flat ground it is the distance, exactly.
 */
export function boundCost(terrain: Terrain, from: Point, to: Point): number {
  return distance(from, to) + climbAlong(terrain, from, to) * SLOPE.climbCostPerMetre;
}

/**
 * The furthest point along `from`→`towards` a force can reach for `budget`
 * metres of flat going — the destination itself when it is within reach.
 * Where the bound climbs nothing the answer is the plain step, computed
 * exactly, so a game on flat ground lands where it always landed; where it
 * climbs, the cost only grows along the line and a bisection finds the point.
 *
 * The invariant `moveUnit` relies on: the point returned costs no more than
 * `budget`, **measured over the bound itself**. The climb test is therefore
 * made on the step, not on the whole order line — the two are sampled at
 * different places, and a short line can catch a rise a long one stepped
 * over. The first cut tested the long line, and on the real map one order in
 * 260 threw out of the execution loop for a rise of a few millimetres.
 */
export function reachAlong(terrain: Terrain, from: Point, towards: Point, budget: number): Point {
  if (budget <= 0) return { ...from };
  const step = stepTowards(from, towards, budget);
  if (climbAlong(terrain, from, step) === 0) return step;
  if (boundCost(terrain, from, towards) <= budget) return { ...towards };
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (boundCost(terrain, from, lerpPoint(from, towards, mid)) <= budget) lo = mid;
    else hi = mid;
  }
  return lerpPoint(from, towards, lo);
}

/**
 * The ground a force can reach this turn, as a fan of points around it: on
 * each of `bearings` evenly spaced headings, how far `budget` metres of flat
 * going carries it over the ground there — the true shape of a bound, which
 * on flat ground is the circle it always was and uphill falls short of it. A
 * vehicle's fan also stops where the grade it will not take begins.
 *
 * Advisory: the map draws it so the player sees the cost before a move is
 * refused. `moveUnit` remains the judge of any particular bound.
 */
export function reachFan(
  terrain: Terrain,
  from: Point,
  budget: number,
  opts: { vehicle?: boolean; bearings?: number } = {},
): Point[] {
  const n = opts.bearings ?? 72;
  const fan: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    const towards = { x: from.x + budget * Math.cos(a), y: from.y + budget * Math.sin(a) };
    let p = reachAlong(terrain, from, towards, budget);
    if (opts.vehicle && steepestGradeAlong(terrain, from, p) > SLOPE.vehicleMaxGradeDeg) {
      // Back off to the furthest point along the bound the grade allows.
      let lo = 0;
      let hi = 1;
      for (let k = 0; k < 20; k++) {
        const mid = (lo + hi) / 2;
        if (steepestGradeAlong(terrain, from, lerpPoint(from, p, mid)) <= SLOPE.vehicleMaxGradeDeg) lo = mid;
        else hi = mid;
      }
      p = lerpPoint(from, p, lo);
    }
    fan.push(p);
  }
  return fan;
}

/**
 * Whether the ground or anything on it stands between an eye `fromEye` metres
 * above `from` and a silhouette `toEye` metres above `to`. Binary, and
 * symmetric in its two ends.
 *
 * The ground is sampled every {@link LOS_SAMPLE_STEP_M} along the line and
 * blocks where it rises above it. Objects are tested exactly where the line
 * enters and leaves their footprint, so a thin wall cannot slip between two
 * samples. Where either end is **in or against** an object — inside its
 * footprint, or within {@link OBJECT_COVER_REACH_M} of it, the same reach that
 * gives the force its cover — that object's faces within
 * {@link OWN_OBJECT_SIGHT_M} of that end are ignored: a force looks out of its
 * building and over its wall, not at them. Without that, a squad lying behind
 * a chest-high wall on a forward slope was blinded by its own wall the moment
 * it looked downhill. Only the *near* faces, though: a force against the west
 * wall of a building is still hidden by its east wall from the east, and a
 * force inside it is seen only from the side it faces. A shared endpoint has
 * no line to obstruct.
 */
export function terrainBlocksSight(
  terrain: Terrain,
  from: Point,
  fromEye: number,
  to: Point,
  toEye: number,
): boolean {
  const length = distance(from, to);
  if (length === 0) return false;
  const zFrom = groundHeight(terrain, from) + fromEye;
  const zTo = groundHeight(terrain, to) + toEye;
  const lineHeight = (t: number) => zFrom + (zTo - zFrom) * t;

  if (terrain.heightfield) {
    const steps = Math.ceil(length / LOS_SAMPLE_STEP_M);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (groundHeight(terrain, lerpPoint(from, to, t)) > lineHeight(t)) return true;
    }
  }

  for (const o of terrain.objects) {
    const f = o.footprint;
    const crossings =
      f.shape === "circle"
        ? segmentCircleCrossings(from, to, f.center, f.radius)
        : segmentPolygonCrossings(from, to, f.points);
    if (crossings.length === 0) continue;
    // Test where the line enters and leaves, and the point of closest approach
    // for a disc it merely clips…
    const ts = [...crossings];
    if (f.shape === "circle") ts.push(nearestParam(from, to, f.center));
    // …except the faces of a force's own object, next to it.
    const ownAtFrom = distanceToFootprint(f, from) <= OBJECT_COVER_REACH_M;
    const ownAtTo = distanceToFootprint(f, to) <= OBJECT_COVER_REACH_M;
    for (const t of ts) {
      const p = lerpPoint(from, to, t);
      if (ownAtFrom && distance(p, from) <= OWN_OBJECT_SIGHT_M) continue;
      if (ownAtTo && distance(p, to) <= OWN_OBJECT_SIGHT_M) continue;
      if (groundHeight(terrain, p) + objectHeight(o) > lineHeight(t)) return true;
    }
  }
  return false;
}
