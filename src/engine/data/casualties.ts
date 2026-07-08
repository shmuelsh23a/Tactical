/**
 * Casualty / injury thresholds (פציעה), in damage points (נק"פ).
 *   - From 5 nq"p a wound worsens by 1d4 every 5 turns.
 *   - At 8 nq"p the individual is neutralized.
 *   - A force attrited by 50% or more is neutralized and may only retreat.
 */
export const CASUALTY_RULES = {
  bleedingThreshold: 5,
  bleedingWorsenDice: "1d4",
  bleedingIntervalTurns: 5,
  neutralizeThreshold: 8,
  /** Fraction of a force neutralized that neutralizes the whole force. */
  forceAttritionNeutralizeFraction: 0.5,
} as const;

/** Assault (הסתערות) resolution. */
export const ASSAULT = {
  fireHitChance: 0.7,
  fireDamageDice: "1d4",
  grenadeHitChance: 0.3,
  grenadeSelfHitChance: 0.05,
  grenadeDamageDice: "1d6",
} as const;
