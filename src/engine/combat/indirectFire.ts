import { Rng } from "../rng.js";
import type { Point } from "../geometry.js";
import type { Side, Unit } from "../types.js";
import { EXPLOSIVES } from "../data/explosives.js";
import { resolveDispersion, type DispersionResult } from "./artillery.js";
import { resolveBlast, type BlastResult } from "./explosives.js";
import type { WoundModel } from "../data/variants.js";

export interface IndirectFireResult {
  weapon: string;
  /**
   * The side that called the mission, when the caller knows it — `Game` fills
   * it in as a due mission resolves. It is what lets a report say how far the
   * round fell from its **aim point** to the side that aimed it and no further:
   * the fall of shot is plain to everyone, the miss is the gunner's own
   * business (rules decisions 13 and 17).
   */
  side?: Side;
  aim: Point;
  dispersion: DispersionResult;
  blast: BlastResult;
}

/**
 * Resolve an indirect-fire mission (mortar / artillery) on the turn its delay
 * elapses: first scatter the round from its aim point via the dispersion
 * table, then detonate at the true impact point against all units on the map.
 */
export function resolveIndirectFire(
  rng: Rng,
  weaponKey: string,
  aim: Point,
  allUnits: Unit[],
  opts: { firingFrom?: Point; fixedWingObserved?: boolean; turn?: number; wounds?: WoundModel } = {},
): IndirectFireResult {
  const weapon = EXPLOSIVES[weaponKey];
  if (!weapon) throw new Error(`Unknown explosive: ${weaponKey}`);
  if (weapon.delivery !== "indirectFire") {
    throw new Error(`${weaponKey} is not an indirect-fire weapon`);
  }

  const dispersion = resolveDispersion(rng, aim, {
    firingFrom: opts.firingFrom,
    fixedWingObserved: opts.fixedWingObserved,
  });
  const blast = resolveBlast(rng, weaponKey, dispersion.impact, allUnits, opts.turn ?? 0, opts.wounds);
  return { weapon: weaponKey, aim, dispersion, blast };
}
