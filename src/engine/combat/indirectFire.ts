import { Rng } from "../rng.js";
import type { Point } from "../geometry.js";
import type { Side, Unit } from "../types.js";
import { EXPLOSIVES, SHELL_VS_MEN, type Fuze, type ShellVsMen } from "../data/explosives.js";
import type { Lethality } from "../data/lethality.js";
import type { ArmourFigures } from "../data/armor.js";
import { effectiveCover } from "../terrain.js";
import { resolveCepDispersion, resolveDispersion, type DispersionResult } from "./artillery.js";
import { resolveBlast, type BlastResult, type StructureStrike } from "./explosives.js";

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
  /** The round went through the roof of the building it landed on (rules decision 77). */
  critical?: true;
  /** The building the round landed on, and its state after (rules decision 76). Filled in by `Game`. */
  structure?: StructureStrike;
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
    /** Whose blast figures (rules decision 41). The document's unless given. */
    lethality?: Lethality;
    /** What full cover does against it (rules decision 62). The sources' unless given. */
    shellVsMen?: ShellVsMen;
    /**
     * A critical hit (rules decision 77): where the round lands on a
     * building, the chance it goes through the roof, who is inside, and the
     * factor on their blast chance when it does. Absent: no round can.
     */
    criticalAt?: (impact: Point) => { chance: number; inside: (u: Unit) => boolean; factor: number } | undefined;
    /** Whose armour figures (rules decision 78). The document's unless given. */
    armour?: ArmourFigures;
    /** The research figures as checked against the sources (rules decision 79). */
    checked?: boolean;
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
  // An air burst goes off above the roof, never through it.
  const onBuilding = fuze === "impact" ? opts.criticalAt?.(dispersion.impact) : undefined;
  const critical = onBuilding !== undefined && rng.chance(onBuilding.chance);
  const blast = resolveBlast(rng, weaponKey, dispersion.impact, allUnits, opts.turn ?? 0, {
    factorFor: (u) =>
      critical && onBuilding.inside(u) ? onBuilding.factor : shellFactor(u, fuze, underRoof(u), opts.shellVsMen),
    airburst: fuze === "airburst",
  }, opts.lethality ?? "document", { figures: opts.armour ?? "document" }, opts.checked ?? false);
  return { weapon: weaponKey, aim, dispersion, blast, ...(critical ? { critical: true as const } : {}) };
}

/**
 * The factor on a man's chance of being caught by a shell (rules decisions
 * 29–31): full cover by whether it has a roof, anything less by the lower of
 * its own worth and the men's posture — on their feet for the first rounds,
 * down once shelled.
 */
export function shellFactor(unit: Unit, fuze: Fuze, underRoof: boolean, table: ShellVsMen = SHELL_VS_MEN): number {
  const f = table[fuze];
  const cover = effectiveCover(unit);
  if (cover === "full") return underRoof ? f.roof : f.openHole;
  const posture = unit.downUnderShelling ? f.down : f.standing;
  return cover === "partial" ? Math.min(f.partial, posture) : posture;
}
