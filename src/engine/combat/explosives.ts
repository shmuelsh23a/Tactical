import { Rng } from "../rng.js";
import { roll } from "../dice.js";
import { distance, lookupBand, type Point } from "../geometry.js";
import type { Unit } from "../types.js";
import { EXPLOSIVES } from "../data/explosives.js";
import { HE_VS_ARMOR } from "../data/armor.js";
import {
  applyComponentDamage,
  damageSoldier,
  refreshUnitStatus,
  selectHitSoldier,
  fitSoldiers,
} from "../units.js";
import { resolveArmorHit } from "./armorDamage.js";

export interface BlastTargetResult {
  unitId: string;
  blastChance: number;
  caught: boolean;
  damage: number;
  newCasualties: number;
  armorEffect?: ReturnType<typeof resolveArmorHit>;
  neutralized: boolean;
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
): BlastResult {
  const weapon = EXPLOSIVES[weaponKey];
  if (!weapon) throw new Error(`Unknown explosive: ${weaponKey}`);

  const targets: BlastTargetResult[] = [];

  for (const unit of candidates) {
    if (unit.neutralized && unit.kind === "vehicle" && unit.vehicle?.destroyed) continue;
    const dist = distance(impact, unit.position);
    const band = lookupBand(weapon.blastBands, dist);
    if (!band) continue; // outside the lethal radius
    const blastChance = band.value;

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
        const die = weapon.damageDiceVsInfantry ?? weapon.damageDice;
        const dmg = roll(rng, die);
        res.damage += dmg;
        // Area effect on a force → random casualty among the fit soldiers.
        const victim = selectHitSoldier(unit, rng);
        if (victim && damageSoldier(victim, dmg, turn)) res.newCasualties++;
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
      } else {
        // Plain HE (artillery/mortar/rifle grenade): 20% chance of 2 nq"p to
        // the tracks; two such hits immobilise the vehicle.
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
  hit: boolean;
  hitChance: number;
  blast?: BlastResult;
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
  opts: { hasLineOfSight?: boolean; collateral?: Unit[]; turn?: number } = {},
): DirectExplosiveResult {
  const weapon = EXPLOSIVES[weaponKey];
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
  result.hitChance = band.value;
  attacker.firedThisTurn = true;

  if (!rng.chance(band.value)) return result; // missed
  result.hit = true;

  const candidates = [target, ...(opts.collateral ?? [])];
  result.blast = resolveBlast(rng, weaponKey, target.position, candidates, opts.turn ?? 0);
  return result;
}
