import { angleBetween, bearingDegrees, type Point } from "../geometry.js";
import {
  COVER_MODIFIERS,
  DIRECTIONAL_COVER,
  FIRING_FROM_COVER_MODIFIER,
  type CoverState,
} from "../data/directFire.js";
import { OBJECT_COVER, OBJECT_COVER_REACH_M } from "../data/terrain.js";
import type { Lethality } from "../data/lethality.js";
import { betterCover, distanceToFootprint, type Footprint, type Terrain } from "../terrain.js";
import { digInCover } from "../upkeep.js";
import type { Unit } from "../types.js";

/**
 * Directional cover (rules decision 85): what a force's cover is worth
 * against fire from one point. Cover comes from three places, and each has
 * its own sense of direction:
 *
 * - **its position** — dug, or prepared before the battle — counts in full
 *   toward its `front` and at a share from the flank and rear
 *   ({@link DIRECTIONAL_COVER}); a position with no front is all-round;
 * - **a house** (or the rubble of one) it is in or against: every side;
 * - **a wall or a tree** it stands against: only from the object's side,
 *   by the bearing to the nearest point of it.
 *
 * Each source is held to the cover the force actually has (`unit.cover`,
 * written at placement and at upkeep), and cover this cannot place — dressed
 * on a force by hand, or the start-of-turn ground of a force that has moved
 * since — counts all round. So direction only ever takes protection away:
 * with no front and no wall in play, the shot is resolved at exactly the
 * modifier it was before the rule, decision 23's −30% for a force that fired
 * from full cover included (`directional.test.ts` pins every case).
 */
export function directionalCoverModifier(
  unit: Unit,
  from: Point,
  terrain: Terrain,
  lethality: Lethality,
  opts: {
    /** Whether its position counts: not for a force caught on the move, which has left its hole. */
    position?: boolean;
    /** Resolve as cover alone, not as a force that fired from it: covering fire's way, as it always was. */
    ignoreFired?: boolean;
  } = {},
): number {
  const bearing = bearingDegrees(unit.position, from);
  const fired = unit.firedThisTurn && !opts.ignoreFired;
  const has = unit.cover;
  const cap = (s: CoverState): CoverState => (COVER_RANK[s] > COVER_RANK[has] ? has : s);
  const candidates: { state: CoverState; share: number }[] = [];
  if (opts.position !== false) {
    const position = betterCover(unit.baseCover, digInCover(unit.stationaryTurns, lethality));
    candidates.push({ state: cap(position), share: positionShare(unit.front, bearing) });
  }
  for (const o of terrain.objects) {
    const d = distanceToFootprint(o.footprint, unit.position);
    if (d > OBJECT_COVER_REACH_M) continue;
    const allRound = o.kind === "building" || o.kind === "rubble" || d === 0;
    const between =
      allRound || angleBetween(bearingDegrees(unit.position, nearestPoint(o.footprint, unit.position)), bearing) <= DIRECTIONAL_COVER.frontHalfArc;
    candidates.push({ state: cap(OBJECT_COVER[o.kind]), share: between ? 1 : 0 });
  }
  // Cover it has from somewhere this cannot place: all round, as it was.
  const placed = candidates.reduce<CoverState>((best, c) => betterCover(best, c.state), "none");
  if (COVER_RANK[placed] < COVER_RANK[has]) candidates.push({ state: has, share: 1 });
  let best = 0;
  for (const c of candidates) best = Math.min(best, modifierOf(c.state, fired) * c.share);
  return best;
}

const COVER_RANK: Record<CoverState, number> = { none: 0, partial: 1, full: 2 };

/** A position's share of its cover against fire from `bearing`, given the way it faces. */
export function positionShare(front: number | undefined, bearing: number): number {
  if (front === undefined) return 1;
  const off = angleBetween(front, bearing);
  if (off <= DIRECTIONAL_COVER.frontHalfArc) return 1;
  return off <= DIRECTIONAL_COVER.rearBeyond ? DIRECTIONAL_COVER.flankShare : DIRECTIONAL_COVER.rearShare;
}

/**
 * The arc a force is watching, if it is watching one: its observation
 * sector, else its position's front, ±{@link DIRECTIONAL_COVER.frontHalfArc}.
 * Neither: it is not looking one way more than another.
 */
export function watchedArc(unit: Unit): { bearing: number; width: number } | undefined {
  if (unit.observationSector) return unit.observationSector;
  if (unit.front !== undefined) return { bearing: unit.front, width: 2 * DIRECTIONAL_COVER.frontHalfArc };
  return undefined;
}

function modifierOf(state: CoverState, fired: boolean): number {
  return state === "full" && fired ? FIRING_FROM_COVER_MODIFIER : COVER_MODIFIERS[state];
}

/** The point of a footprint nearest `p`: itself when inside. */
function nearestPoint(f: Footprint, p: Point): Point {
  if (f.shape === "circle") {
    const d = Math.hypot(p.x - f.center.x, p.y - f.center.y);
    if (d <= f.radius || d === 0) return p;
    return { x: f.center.x + ((p.x - f.center.x) / d) * f.radius, y: f.center.y + ((p.y - f.center.y) / d) * f.radius };
  }
  let best = p;
  let bd = Infinity;
  const pts = f.points;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len = vx * vx + vy * vy;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len));
    const q = { x: a.x + t * vx, y: a.y + t * vy };
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return best;
}
