import { Rng } from "../rng.js";
import { roll } from "../dice.js";
import type { Unit } from "../types.js";
import { ASSAULT } from "../data/casualties.js";
import {
  damageSoldier,
  fitSoldiers,
  refreshUnitStatus,
  selectHitSoldier,
} from "../units.js";

export interface AssaultResult {
  attackerId: string;
  defenderId: string;
  fireHits: number;
  fireDamage: number;
  grenadeHits: number;
  grenadeDamage: number;
  selfCasualties: number;
  defenderCasualties: number;
  defenderNeutralized: boolean;
}

/**
 * Resolve an assault (הסתערות) by `attacker` onto `defender`.
 *
 * Each fit attacker soldier makes an assault fire attack (70% hit, 1d4). Any
 * grenades thrown each have a 30% chance to hit the defender (1d6) and a 5%
 * chance to wound a friendly soldier (also 1d6). Both sides are infantry.
 */
export function resolveAssault(
  rng: Rng,
  attacker: Unit,
  defender: Unit,
  opts: { grenades?: number; turn?: number } = {},
): AssaultResult {
  const turn = opts.turn ?? 0;
  const result: AssaultResult = {
    attackerId: attacker.id,
    defenderId: defender.id,
    fireHits: 0,
    fireDamage: 0,
    grenadeHits: 0,
    grenadeDamage: 0,
    selfCasualties: 0,
    defenderCasualties: 0,
    defenderNeutralized: defender.neutralized,
  };

  // Assault fire.
  const shooters = fitSoldiers(attacker);
  for (let i = 0; i < shooters; i++) {
    if (!rng.chance(ASSAULT.fireHitChance)) continue;
    result.fireHits++;
    const dmg = roll(rng, ASSAULT.fireDamageDice);
    result.fireDamage += dmg;
    const victim = selectHitSoldier(defender, rng);
    if (victim && damageSoldier(victim, dmg, turn)) result.defenderCasualties++;
  }

  // Grenades.
  const grenades = opts.grenades ?? 0;
  for (let i = 0; i < grenades; i++) {
    if (rng.chance(ASSAULT.grenadeHitChance)) {
      result.grenadeHits++;
      const dmg = roll(rng, ASSAULT.grenadeDamageDice);
      result.grenadeDamage += dmg;
      const victim = selectHitSoldier(defender, rng);
      if (victim && damageSoldier(victim, dmg, turn)) result.defenderCasualties++;
    }
    if (rng.chance(ASSAULT.grenadeSelfHitChance)) {
      const dmg = roll(rng, ASSAULT.grenadeDamageDice);
      const friendly = selectHitSoldier(attacker, rng);
      if (friendly && damageSoldier(friendly, dmg, turn)) result.selfCasualties++;
    }
  }

  defender.hitThisTurn = true;
  defender.underFire = true;
  attacker.firedThisTurn = true;
  refreshUnitStatus(defender);
  refreshUnitStatus(attacker);
  result.defenderNeutralized = defender.neutralized;
  return result;
}
