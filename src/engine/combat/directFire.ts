import { Rng } from "../rng.js";
import { roll } from "../dice.js";
import { distance, lookupBand } from "../geometry.js";
import type { Unit } from "../types.js";
import {
  SMALL_ARMS_BANDS,
  SUSTAINED_MG_BANDS,
  DIRECT_FIRE_DAMAGE_DICE,
  COVER_MODIFIERS,
  type CoverState,
} from "../data/directFire.js";
import { fitSoldiers, selectHitSoldier, damageSoldier, refreshUnitStatus } from "../units.js";

export type WeaponClass = "smallArms" | "sustainedMg";

export interface DirectFireOptions {
  weapon: WeaponClass;
  /** Cover state of the target; scales the hit chance (full cover halves it). */
  cover?: CoverState;
  /**
   * Additive hit modifier from the target's movement this turn:
   * +0.30 if it moved at normal pace, -0.20 if it ran, 0 if static.
   * (Comes from the movement profile of the *target*.)
   */
  targetMovementModifier?: number;
  /** Set false to forbid the shot (no line of sight, or smoke in the way). */
  hasLineOfSight?: boolean;
  /** Limit the number of shooters (to model splitting fire); default = all fit. */
  shooters?: number;
  /**
   * Direct fire at a specific soldier in the target force (player's choice).
   * When omitted, casualties fall on random fit soldiers.
   */
  targetSoldierId?: string;
  /** Current turn index, for casualty bookkeeping. */
  turn?: number;
}

export interface DirectFireResult {
  fired: boolean;
  reason?: string;
  range: number;
  hitChance: number;
  shooters: number;
  hits: number;
  totalDamage: number;
  newCasualties: number;
  targetNeutralized: boolean;
}

/**
 * Resolve direct ballistic fire from `attacker` at `target`.
 *
 * Mechanics (ירי קליעי): each fit shooter independently rolls against the
 * range-banded hit chance, modified by the target's cover and movement. Every
 * hit inflicts 1d4 damage. Small-arms fire has no effect on armoured vehicles.
 */
export function resolveDirectFire(
  rng: Rng,
  attacker: Unit,
  target: Unit,
  opts: DirectFireOptions,
): DirectFireResult {
  const range = distance(attacker.position, target.position);
  const bands = opts.weapon === "sustainedMg" ? SUSTAINED_MG_BANDS : SMALL_ARMS_BANDS;
  const band = lookupBand(bands, range);

  const base: DirectFireResult = {
    fired: false,
    range,
    hitChance: 0,
    shooters: 0,
    hits: 0,
    totalDamage: 0,
    newCasualties: 0,
    targetNeutralized: target.neutralized,
  };

  if (opts.hasLineOfSight === false) return { ...base, reason: "no line of sight" };
  if (!band) return { ...base, reason: "out of range" };
  if (target.kind === "vehicle") {
    return { ...base, reason: "small arms ineffective vs armour" };
  }

  const cover = opts.cover ?? "none";
  // Cover cuts the chance proportionally ("-50% מסיכויי הפגיעה"), so it scales
  // the situational chance rather than being subtracted from it.
  const hitChance = clamp01(
    (band.value + (opts.targetMovementModifier ?? 0)) * (1 + COVER_MODIFIERS[cover]),
  );

  const available = fitSoldiers(attacker);
  const shooters = Math.max(0, Math.min(opts.shooters ?? available, available));
  if (shooters === 0) return { ...base, reason: "no fit shooters", hitChance };

  let hits = 0;
  let totalDamage = 0;
  let newCasualties = 0;
  const turn = opts.turn ?? 0;
  for (let i = 0; i < shooters; i++) {
    if (!rng.chance(hitChance)) continue;
    hits++;
    const dmg = roll(rng, DIRECT_FIRE_DAMAGE_DICE);
    totalDamage += dmg;
    const victim = selectHitSoldier(target, rng, opts.targetSoldierId);
    if (victim && damageSoldier(victim, dmg, turn)) newCasualties++;
  }

  if (hits > 0) {
    target.underFire = true;
    target.hitThisTurn = true;
    refreshUnitStatus(target);
  }
  attacker.firedThisTurn = true;

  return {
    fired: true,
    range,
    hitChance,
    shooters,
    hits,
    totalDamage,
    newCasualties,
    targetNeutralized: target.neutralized,
  };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
