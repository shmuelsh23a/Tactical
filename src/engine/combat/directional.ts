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
 * - **a wall or a tree** it stands against: only from the object's side.
 *
 * The best of them stands, as the best cover state always has. A force that
 * fired from full cover keeps decision 23's −30% of it. With every share 1
 * this is exactly the modifier the shot was resolved at before the rule.
 */
export function directionalCoverModifier(
  unit: Unit,
  from: Point,
  terrain: Terrain,
  lethality: Lethality,
  opts: {
    /**
     * Whether its position counts: not for a force caught on the move by
     * covering fire, which has left its hole behind (the ground it is on
     * still covers it).
     */
    position?: boolean;
  } = {},
): number {
  const bearing = bearingDegrees(unit.position, from);
  const fired = unit.firedThisTurn;
  let best = 0;
  if (opts.position !== false) {
    const position = betterCover(unit.baseCover, digInCover(unit.stationaryTurns, lethality));
    best = Math.min(best, modifierOf(position, fired) * positionShare(unit.front, bearing));
  }
  for (const o of terrain.objects) {
    const d = distanceToFootprint(o.footprint, unit.position);
    if (d > OBJECT_COVER_REACH_M) continue;
    const allRound = o.kind === "building" || o.kind === "rubble" || d === 0;
    const between = angleBetween(bearingDegrees(unit.position, centre(o.footprint)), bearing) <= DIRECTIONAL_COVER.frontHalfArc;
    if (allRound || between) best = Math.min(best, modifierOf(OBJECT_COVER[o.kind], fired));
  }
  return best;
}

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

function centre(f: Footprint): Point {
  if (f.shape === "circle") return f.center;
  return {
    x: f.points.reduce((t, p) => t + p.x, 0) / f.points.length,
    y: f.points.reduce((t, p) => t + p.y, 0) / f.points.length,
  };
}
