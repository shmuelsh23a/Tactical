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
import { selectHitSoldier, damageSoldier, refreshUnitStatus } from "../units.js";
import { readySoldiers, shooterAccuracy } from "../morale.js";

export type WeaponClass = "smallArms" | "sustainedMg";

export interface DirectFireOptions {
  weapon: WeaponClass;
  /** Cover state of the target; scales the hit chance (full cover halves it). */
  cover?: CoverState;
  /**
   * The target's movement this turn, as a **factor** on the band: ×1.3 if it
   * walked, ×0.8 if it ran — the movement table's +30% / −20%, applied
   * proportionally (author, 2026-09-23; rules decision 22). Absent: it stood.
   */
  targetMovementFactor?: number;
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
  /**
   * The cover modifier to use instead of the table's figure for `cover`: what
   * full cover is still worth to a force that fired from it this turn
   * ({@link FIRING_FROM_COVER_MODIFIER}, rules decision 23).
   */
  coverModifier?: number;
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
    band.value * (opts.targetMovementFactor ?? 1) * (1 + (opts.coverModifier ?? COVER_MODIFIERS[cover])),
  );

  // The men who will still fight — a broken man keeps his head down — each
  // shooting as well as his force's suppression and his own nerve let him
  // (rules decision 19). Without morale: every fit man, at the table's chance.
  const available = readySoldiers(attacker).length;
  const accuracy = shooterAccuracy(attacker);
  const shooters = Math.max(0, Math.min(opts.shooters ?? available, available));
  if (shooters === 0) return { ...base, reason: "no fit shooters", hitChance };

  let hits = 0;
  let totalDamage = 0;
  let newCasualties = 0;
  const turn = opts.turn ?? 0;
  for (let i = 0; i < shooters; i++) {
    if (!rng.chance(clamp01(hitChance * (accuracy[i] ?? 1)))) continue;
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
