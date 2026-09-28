import { Rng } from "../rng.js";
import { roll } from "../dice.js";
import { distance, lookupBand, type Point } from "../geometry.js";
import type { Unit } from "../types.js";
import { EXPLOSIVES } from "../data/explosives.js";
import { explosiveFor, type Lethality } from "../data/lethality.js";
import { HE_VS_ARMOR } from "../data/armor.js";
import {
  applyComponentDamage,
  refreshUnitStatus,
  fitSoldiers,
  woundHit,
} from "../units.js";
import { resolveArmorHit } from "./armorDamage.js";
import { suppressionAccuracy } from "../morale.js";

export interface BlastTargetResult {
  unitId: string;
  blastChance: number;
  caught: boolean;
  damage: number;
  newCasualties: number;
  armorEffect?: ReturnType<typeof resolveArmorHit>;
  neutralized: boolean;
}

/** What a shell brings to its blast that other explosives do not (rules decisions 29–31). */
export interface ShellEffect {
  /** The factor on a man's blast chance, by his force's posture and cover. */
  factorFor: (unit: Unit) => number;
  /** Burst in the air: no effect on a vehicle's tracks. */
  airburst: boolean;
}

export interface BlastResult {
  weapon: string;
  impact: Point;
  targets: BlastTargetResult[];
}

/**
 * Apply an explosive detonation at `impact` against a set of nearby units.
 *
 * Infantry: each fit soldier within the blast radius independently rolls the
 * radius-banded hit chance; a hit takes the weapon's damage die. Vehicles:
 * dedicated anti-armour munitions resolve through the armour table; munitions
 * with an explicit vs-armour die apply that as light component damage; plain
 * HE has no modelled effect on armour.
 */
export function resolveBlast(
  rng: Rng,
  weaponKey: string,
  impact: Point,
  candidates: Unit[],
  turn = 0,
  shell?: ShellEffect,
  lethality: Lethality = "document",
): BlastResult {
  const weapon = explosiveFor(weaponKey, lethality);
  if (!weapon) throw new Error(`Unknown explosive: ${weaponKey}`);

  const targets: BlastTargetResult[] = [];

  for (const unit of candidates) {
    if (unit.neutralized && unit.kind === "vehicle" && unit.vehicle?.destroyed) continue;
    const dist = distance(impact, unit.position);
    // The research figures are lethal areas against men (rules decision 41):
    // a vehicle is reached, and connected with, as the document has it.
    const bands = unit.kind === "infantry" ? weapon.blastBands : EXPLOSIVES[weaponKey]!.blastBands;
    const band = lookupBand(bands, dist);
    if (!band) continue; // outside the lethal radius
    // A shell against men: posture, cover and fuze (rules decisions 29–31).
    const blastChance = unit.kind === "infantry" && shell ? Math.min(1, band.value * shell.factorFor(unit)) : band.value;

    const res: BlastTargetResult = {
      unitId: unit.id,
      blastChance,
      caught: false,
      damage: 0,
      newCasualties: 0,
      neutralized: unit.neutralized,
    };

    if (unit.kind === "infantry") {
      const fit = fitSoldiers(unit);
      for (let i = 0; i < fit; i++) {
        if (!rng.chance(blastChance)) continue;
        res.caught = true;
        // Area effect on a force → random casualty among the fit soldiers;
        // how bad, the same roll as a bullet's (rules decision 27).
        const hit = woundHit(rng, unit, turn, "explosive");
        res.damage += hit.damage;
        if (hit.casualty) res.newCasualties++;
      }
      if (res.caught) {
        unit.hitThisTurn = true;
        unit.underFire = true;
      }
    } else if (unit.vehicle) {
      if (weapon.usesArmorTable) {
        // Dedicated anti-armour munition: blast chance = chance to connect.
        if (rng.chance(blastChance)) {
          res.caught = true;
          res.armorEffect = resolveArmorHit(rng, unit);
          unit.hitThisTurn = true;
        }
      } else if (weapon.damageDiceVsArmor) {
        // Munition with an explicit (light) anti-armour die, e.g. AP mine 1d2.
        if (rng.chance(blastChance)) {
          res.caught = true;
          const dmg = roll(rng, weapon.damageDiceVsArmor);
          res.damage = dmg;
          applyComponentDamage(unit.vehicle, "track", dmg);
          unit.hitThisTurn = true;
        }
      } else if (!shell?.airburst) {
        // Plain HE (artillery/mortar/rifle grenade): 20% chance of 2 nq"p to
        // the tracks; two such hits immobilise the vehicle. A round that bursts
        // in the air does not reach them (rules decision 31).
        if (rng.chance(HE_VS_ARMOR.trackHitChance)) {
          res.caught = true;
          res.damage = HE_VS_ARMOR.trackDamage;
          applyComponentDamage(unit.vehicle, "track", HE_VS_ARMOR.trackDamage);
          unit.hitThisTurn = true;
        }
      }
    }

    refreshUnitStatus(unit);
    res.neutralized = unit.neutralized;
    targets.push(res);
  }

  return { weapon: weaponKey, impact, targets };
}

export interface DirectExplosiveResult {
  fired: boolean;
  reason?: string;
  range: number;
  /** Whether any round hit. */
  hit: boolean;
  hitChance: number;
  /**
   * Every round's blast together: what each force it caught took from all of
   * them. One round's, when one was fired.
   */
  blast?: BlastResult;
  /**
   * Rounds fired this turn — the weapon's rate of fire, or fewer if the
   * target went down first (rules decision 42). Absent: one.
   */
  rounds?: number;
  /** Rounds that hit, when more than one was fired. */
  hits?: number;
}

/** How bad an armour effect is, to keep the worst of several rounds'. */
const armourSeverity = (e: NonNullable<BlastTargetResult["armorEffect"]>) =>
  (e.destroyed ? 4 : 0) + (e.mobilityKilled ? 2 : 0) + (e.penetrated ? 1 : 0);

/** Several rounds' blasts as one: each force's damage and casualties summed, its worst armour effect kept. */
function mergeBlasts(blasts: BlastResult[]): BlastResult {
  const byUnit = new Map<string, BlastTargetResult>();
  for (const b of blasts) {
    for (const t of b.targets) {
      const seen = byUnit.get(t.unitId);
      if (!seen) {
        byUnit.set(t.unitId, { ...t });
        continue;
      }
      seen.caught ||= t.caught;
      seen.damage += t.damage;
      seen.newCasualties += t.newCasualties;
      seen.neutralized = t.neutralized;
      if (t.armorEffect && (!seen.armorEffect || armourSeverity(t.armorEffect) >= armourSeverity(seen.armorEffect))) {
        seen.armorEffect = t.armorEffect;
      }
    }
  }
  return { weapon: blasts[0]!.weapon, impact: blasts[0]!.impact, targets: [...byUnit.values()] };
}

/**
 * Resolve a direct-fire explosive (RPG, tank round, ATGM): first a range-banded
 * to-hit check; on a hit, detonate at the target and resolve the blast against
 * the target (and optional collateral units).
 */
export function resolveDirectExplosive(
  rng: Rng,
  weaponKey: string,
  attacker: Unit,
  target: Unit,
  opts: { hasLineOfSight?: boolean; collateral?: Unit[]; turn?: number; lethality?: Lethality } = {},
): DirectExplosiveResult {
  const lethality = opts.lethality ?? "document";
  const weapon = explosiveFor(weaponKey, lethality);
  if (!weapon) throw new Error(`Unknown explosive: ${weaponKey}`);
  if (weapon.delivery !== "directFire") {
    throw new Error(`${weaponKey} is not a direct-fire weapon`);
  }

  const range = distance(attacker.position, target.position);
  const result: DirectExplosiveResult = { fired: false, range, hit: false, hitChance: 0 };

  if (opts.hasLineOfSight === false) return { ...result, reason: "no line of sight" };
  if (weapon.minRange != null && range < weapon.minRange) {
    return { ...result, reason: "below minimum range" };
  }
  const band = lookupBand(weapon.toHitBands ?? [], range);
  if (!band) return { ...result, reason: "out of range" };

  result.fired = true;
  // A suppressed or pinned team aims worse (rules decision 19); 1 without morale.
  result.hitChance = Math.min(1, band.value * suppressionAccuracy(attacker));
  attacker.firedThisTurn = true;

  // The document fires one round a turn; the research figures, the weapon's
  // rate of fire (rules decision 42). The crew stops when the target is down.
  const rate = weapon.roundsPerTurn ?? 1;
  const candidates = [target, ...(opts.collateral ?? [])];
  const blasts: BlastResult[] = [];
  let rounds = 0;
  while (rounds < rate && !(rounds > 0 && isDown(target))) {
    rounds++;
    if (!rng.chance(result.hitChance)) continue; // missed
    blasts.push(resolveBlast(rng, weaponKey, target.position, candidates, opts.turn ?? 0, undefined, lethality));
  }
  result.hit = blasts.length > 0;
  if (blasts.length) result.blast = blasts.length === 1 ? blasts[0] : mergeBlasts(blasts);
  if (rate > 1) {
    result.rounds = rounds;
    result.hits = blasts.length;
  }
  return result;
}

/** A target no crew would go on firing at: neutralised, or a vehicle destroyed. */
function isDown(target: Unit): boolean {
  return target.neutralized || target.vehicle?.destroyed === true;
}
