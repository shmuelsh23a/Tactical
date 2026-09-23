import { Rng } from "../rng.js";
import type { Point } from "../geometry.js";
import type { Side, Unit } from "../types.js";
import { EXPLOSIVES, SHELL_VS_MEN, type Fuze } from "../data/explosives.js";
import { effectiveCover } from "../terrain.js";
import { resolveCepDispersion, resolveDispersion, type DispersionResult } from "./artillery.js";
import { resolveBlast, type BlastResult } from "./explosives.js";

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
  opts: {
    firingFrom?: Point;
    fixedWingObserved?: boolean;
    turn?: number;
    fuze?: Fuze;
    /** Whether a force is under a roof (a building, or a prepared position). Absent: nobody is. */
    underRoof?: (unit: Unit) => boolean;
    /** On trial: scatter by this CEP instead of the document's table. */
    cepM?: number;
  } = {},
): IndirectFireResult {
  const weapon = EXPLOSIVES[weaponKey];
  if (!weapon) throw new Error(`Unknown explosive: ${weaponKey}`);
  if (weapon.delivery !== "indirectFire") {
    throw new Error(`${weaponKey} is not an indirect-fire weapon`);
  }

  const scatter = { firingFrom: opts.firingFrom, fixedWingObserved: opts.fixedWingObserved };
  const dispersion =
    opts.cepM !== undefined ? resolveCepDispersion(rng, aim, opts.cepM, scatter) : resolveDispersion(rng, aim, scatter);
  // Posture, cover and fuze count against a shell (rules decisions 29–31), and
  // against no other blast.
  const fuze = opts.fuze ?? "impact";
  const underRoof = opts.underRoof ?? (() => false);
  const blast = resolveBlast(rng, weaponKey, dispersion.impact, allUnits, opts.turn ?? 0, {
    factorFor: (u) => shellFactor(u, fuze, underRoof(u)),
    airburst: fuze === "airburst",
  });
  return { weapon: weaponKey, aim, dispersion, blast };
}

/**
 * The factor on a man's chance of being caught by a shell (rules decisions
 * 29–31): full cover by whether it has a roof, anything less by the lower of
 * its own worth and the men's posture — on their feet for the first rounds,
 * down once shelled.
 */
export function shellFactor(unit: Unit, fuze: Fuze, underRoof: boolean): number {
  const f = SHELL_VS_MEN[fuze];
  const cover = effectiveCover(unit);
  if (cover === "full") return underRoof ? f.roof : f.openHole;
  const posture = unit.downUnderShelling ? f.down : f.standing;
  return cover === "partial" ? Math.min(f.partial, posture) : posture;
}
