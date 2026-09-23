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

/**
 * How bad a small-arms hit is — **the author's ruling, not the document's**
 * (2026-09-23, rules decision 26). Each hit by small arms, the coaxial gun or
 * the assault's fire rolls a d10 in place of the document's 1d4 of damage:
 * 1–`light` a light wound (the man fights on, `lightWoundPoints` towards the
 * 8 that put a man out), up to `light + serious` a serious one (out of the
 * fight, and bleeding), and above that he is killed — 4 / 4 / 2. Measured
 * against 1d4 and two other splits in docs/balance.md: it is what makes a
 * small force's fire count, since a hit is worth as much on 36 men as on 9.
 * Explosives keep the document's dice.
 */
export const WOUND_SEVERITY = { light: 4, serious: 4, lightWoundPoints: 2 } as const;

/** Assault (הסתערות) resolution. */
export const ASSAULT = {
  fireHitChance: 0.7,
  fireDamageDice: "1d4",
  grenadeHitChance: 0.3,
  grenadeSelfHitChance: 0.05,
  grenadeDamageDice: "1d6",
} as const;
