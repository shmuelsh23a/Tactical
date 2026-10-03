import { Rng } from "../rng.js";
import { roll } from "../dice.js";
import type { TankPart, Unit } from "../types.js";
import {
  ARMOR_TABLE,
  CATASTROPHIC_ON_PENETRATION,
  CREW_OUT_ON_PENETRATION,
  PENETRATION,
  armourFacing,
  type ArmorRow,
} from "../data/armor.js";
import { bearingDegrees, type Point } from "../geometry.js";
import { applyComponentDamage, damageCrew, refreshUnitStatus } from "../units.js";
import { CASUALTY_RULES } from "../data/casualties.js";

export interface ArmorHitResult {
  part: TankPart;
  partName: string;
  penetrated: boolean;
  effect: ArmorRow["effect"];
  crewHit: string[];
  componentDamageApplied: number;
  mobilityKilled: boolean;
  destroyed: boolean;
  /** The side struck, when the research figures decided the penetration (rules decision 78). */
  facing?: "front" | "side" | "rear";
}

/**
 * How a hit is resolved on the research figures (rules decision 78): which
 * weapon, and where it came from. `penetrates` forces the penetration — HE
 * fragments going into a thin-skinned vehicle.
 */
export interface ArmourResearch {
  weapon: string;
  from?: Point;
  penetrates?: boolean;
}

/** Roll a hit location from the armour table's hit-chance weights. */
export function rollArmorLocation(rng: Rng): ArmorRow {
  const total = ARMOR_TABLE.reduce((s, r) => s + r.hitChance, 0);
  let pick = rng.next() * total;
  for (const row of ARMOR_TABLE) {
    if (pick < row.hitChance) return row;
    pick -= row.hitChance;
  }
  return ARMOR_TABLE[ARMOR_TABLE.length - 1]!;
}

/**
 * Resolve a penetrating-weapon hit on an armoured vehicle.
 *
 * Sequence (טבלת נזק שריון): roll the struck location, make a penetration
 * check, then apply that location's effect. Engine/track penetrations cause a
 * mobility kill; an ammunition penetration has a chance of a catastrophic kill.
 *
 * @param forcedPart optional location override (testing / called-shot).
 */
export function resolveArmorHit(
  rng: Rng,
  target: Unit,
  forcedPart?: TankPart,
  research?: ArmourResearch,
): ArmorHitResult {
  if (!target.vehicle) throw new Error("resolveArmorHit: target is not a vehicle");
  const row = forcedPart
    ? ARMOR_TABLE.find((r) => r.part === forcedPart)!
    : rollArmorLocation(rng);

  const result: ArmorHitResult = {
    part: row.part,
    partName: row.name,
    penetrated: false,
    effect: row.effect,
    crewHit: [],
    componentDamageApplied: 0,
    mobilityKilled: target.vehicle.mobilityKilled,
    destroyed: target.vehicle.destroyed,
  };

  const v = target.vehicle;
  let chance = row.penetrationChance;
  if (research) {
    // By weapon, class and side struck; a track keeps the table's chance.
    const cls = v.vehicleClass ?? "mbt";
    const facing = research.from ? armourFacing(v.facing, bearingDegrees(target.position, research.from)) : "side";
    const byWeapon = PENETRATION[research.weapon];
    if (research.penetrates) chance = 1;
    else if (byWeapon && row.part !== "track") chance = byWeapon[cls][facing];
    if (research.from) result.facing = facing;
  }
  if (!rng.chance(chance)) {
    return result; // bounced off
  }
  result.penetrated = true;
  // On the research figures the crew is rolled once for every penetration
  // but the track's (below), in place of the table's crew rows.
  const researchCrew = research !== undefined && row.part !== "track";
  switch (researchCrew && (row.effect === "crewCasualties" || row.effect === "driverCasualty") ? "none" : row.effect) {
    case "none":
      break;
    case "crewCasualties": {
      // 1d8 damage, with a per-crew-member chance to be wounded.
      for (const crew of v.crew) {
        if (crew.neutralized) continue;
        if (rng.chance(row.casualtyChance ?? 0)) {
          const dmg = roll(rng, row.damageDice ?? "1d8");
          damageCrew(crew, dmg);
          result.crewHit.push(crew.id);
        }
      }
      break;
    }
    case "driverCasualty": {
      const driver = v.crew.find((c) => c.role === "driver");
      if (driver && !driver.neutralized && rng.chance(row.casualtyChance ?? 0)) {
        const dmg = roll(rng, row.damageDice ?? "1d8");
        damageCrew(driver, dmg);
        result.crewHit.push(driver.id);
        if (driver.neutralized) v.mobilityKilled = true; // no one to drive
      }
      break;
    }
    case "componentDamage": {
      const amount = row.componentDamage ?? 0;
      result.componentDamageApplied = amount;
      // A penetrating engine/track hit deals the full pool, immobilising in
      // one hit once the threshold (8 / 4 nq"p) is reached.
      applyComponentDamage(v, row.part, amount);
      break;
    }
    case "criticalChance": {
      if (rng.chance(row.criticalChance ?? 0)) v.destroyed = true;
      break;
    }
  }

  // Penetration kills crews (decision 78; 2006 Lebanon): each man out at
  // CREW_OUT_ON_PENETRATION.
  if (researchCrew) {
    for (const crew of v.crew) {
      if (crew.neutralized || !rng.chance(CREW_OUT_ON_PENETRATION)) continue;
      damageCrew(crew, Math.max(0, CASUALTY_RULES.neutralizeThreshold - crew.damagePoints));
      result.crewHit.push(crew.id);
      if (crew.role === "driver") v.mobilityKilled = true;
    }
  }
  // A thin-skinned vehicle burns far more often than a tank (decision 78).
  const catastrophic = research ? CATASTROPHIC_ON_PENETRATION[v.vehicleClass ?? "mbt"] : 0;
  if (catastrophic > 0 && !v.destroyed && rng.chance(catastrophic)) v.destroyed = true;

  result.mobilityKilled = v.mobilityKilled;
  result.destroyed = v.destroyed;
  refreshUnitStatus(target);
  return result;
}
