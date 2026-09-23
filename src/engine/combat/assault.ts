import { Rng } from "../rng.js";
import { roll } from "../dice.js";
import { distance } from "../geometry.js";
import type { Unit } from "../types.js";
import { ASSAULT } from "../data/casualties.js";
import { damageSoldier, refreshUnitStatus, selectHitSoldier } from "../units.js";
import { readySoldiers, shooterAccuracy } from "../morale.js";

/**
 * How close a force has to be to assault. The document places the assault in
 * the fire phase and makes the grenade "הסתערות בלבד", but never states a
 * range — 25 m is the author's ruling (rules decision 11), i.e. close enough
 * to be onto the position in the same turn.
 */
export const ASSAULT_RANGE_M = 25;

export interface AssaultResult {
  fired: boolean;
  reason?: string;
  attackerId: string;
  defenderId: string;
  range: number;
  fireHits: number;
  fireDamage: number;
  grenadeHits: number;
  grenadeDamage: number;
  selfCasualties: number;
  defenderCasualties: number;
  defenderNeutralized: boolean;
  /**
   * The defender's fire back, under rule variant 1 (data/variants.ts). Absent
   * when the game plays the document's one-sided assault.
   */
  reply?: { chance: number; shooters: number; hits: number; damage: number; casualties: number };
}

/**
 * Resolve an assault (הסתערות) by `attacker` onto `defender`.
 *
 * Each fit attacker soldier makes an assault fire attack (70% hit, 1d4). Any
 * grenades thrown each have a 30% chance to hit the defender (1d6) and a 5%
 * chance to wound a friendly soldier (also 1d6). Both sides are infantry: there
 * is no modelled way to assault an armoured vehicle on foot.
 */
export function resolveAssault(
  rng: Rng,
  attacker: Unit,
  defender: Unit,
  opts: {
    grenades?: number;
    turn?: number;
    /**
     * Rule variant 1: the defender fires back at this chance per man. The
     * reply is simultaneous — it is fired by the men the defender had before
     * the assault landed.
     */
    replyChance?: number;
  } = {},
): AssaultResult {
  const turn = opts.turn ?? 0;
  const range = distance(attacker.position, defender.position);
  const result: AssaultResult = {
    fired: false,
    attackerId: attacker.id,
    defenderId: defender.id,
    range,
    fireHits: 0,
    fireDamage: 0,
    grenadeHits: 0,
    grenadeDamage: 0,
    selfCasualties: 0,
    defenderCasualties: 0,
    defenderNeutralized: defender.neutralized,
  };

  if (range > ASSAULT_RANGE_M) return { ...result, reason: "out of assault range" };
  if (defender.kind === "vehicle") return { ...result, reason: "cannot assault armour" };
  if (readySoldiers(attacker).length === 0) return { ...result, reason: "no fit shooters" };
  result.fired = true;
  // Taken before the assault lands: the reply is fired by the men who were there.
  const replyAccuracy = opts.replyChance == null ? null : shooterAccuracy(defender);

  // Assault fire.
  // Only the men still willing go in, each as steady as he is (rules decision 19).
  const accuracy = shooterAccuracy(attacker);
  for (let i = 0; i < accuracy.length; i++) {
    if (!rng.chance(Math.min(1, ASSAULT.fireHitChance * accuracy[i]!))) continue;
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

  if (replyAccuracy && opts.replyChance != null) {
    const reply = { chance: opts.replyChance, shooters: replyAccuracy.length, hits: 0, damage: 0, casualties: 0 };
    for (const accuracy of replyAccuracy) {
      if (!rng.chance(Math.min(1, opts.replyChance * accuracy))) continue;
      reply.hits++;
      const dmg = roll(rng, ASSAULT.fireDamageDice);
      reply.damage += dmg;
      const victim = selectHitSoldier(attacker, rng);
      if (victim && damageSoldier(victim, dmg, turn)) reply.casualties++;
    }
    if (reply.hits > 0) {
      attacker.hitThisTurn = true;
      attacker.underFire = true;
    }
    result.reply = reply;
  }

  defender.hitThisTurn = true;
  defender.underFire = true;
  attacker.firedThisTurn = true;
  refreshUnitStatus(defender);
  refreshUnitStatus(attacker);
  result.defenderNeutralized = defender.neutralized;
  return result;
}
