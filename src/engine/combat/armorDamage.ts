import { Rng } from "../rng.js";
import { roll } from "../dice.js";
import type { TankPart, Unit } from "../types.js";
import { ARMOR_TABLE, type ArmorRow } from "../data/armor.js";
import { applyComponentDamage, damageCrew, refreshUnitStatus } from "../units.js";

export interface ArmorHitResult {
  part: TankPart;
  partName: string;
  penetrated: boolean;
  effect: ArmorRow["effect"];
  crewHit: string[];
  componentDamageApplied: number;
  mobilityKilled: boolean;
  destroyed: boolean;
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

  if (!rng.chance(row.penetrationChance)) {
    return result; // bounced off
  }
  result.penetrated = true;

  const v = target.vehicle;
  switch (row.effect) {
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

  result.mobilityKilled = v.mobilityKilled;
  result.destroyed = v.destroyed;
  refreshUnitStatus(target);
  return result;
}
