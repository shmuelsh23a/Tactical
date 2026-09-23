/**
 * Artillery dispersion table (טבלת פגיעה ארטילריה).
 *
 * The source rolls "4ק10 – 2ק10 לקו, 2ק10 לטווח": four d10 split into two
 * percentile rolls — one for the LINE (left/right) axis and one for the RANGE
 * (short/long) axis. Each percentile is read as:
 *   - up to 15%  → deviate (short / right)
 *   - 16% to 30% → deviate (long / left)
 *   - 31%+       → on target for that axis
 *
 * Miss distance: range axis = 1d4 × 50 m, line axis = 1d4 × 25 m.
 * An RPG/launcher (מטול) delivering indirectly multiplies miss distance by 0.1.
 */
export const ARTILLERY_DISPERSION = {
  /** Percentile <= this → first deviation (short on range / right on line). */
  firstDeviationMax: 15,
  /** Percentile <= this (and > first) → second deviation (long / left). */
  secondDeviationMax: 30,
  /** Range-axis miss distance multiplier: 1d4 × 50 m. */
  rangeMissDice: "1d4",
  rangeMissMetresPerPip: 50,
  /** Line-axis miss distance multiplier: 1d4 × 25 m. */
  lineMissDice: "1d4",
  lineMissMetresPerPip: 25,
  /** Launcher indirect fire scales the miss distance down. */
  launcherMissMultiplier: 0.1,
} as const;

/**
 * How near its last aim point a side's next mission with the same weapon must
 * be aimed to count as adjusting onto it (the accuracy variant on trial,
 * data/variants.ts). Ours: the doctrinal bracket closes in 100 m steps.
 */
export const ADJUSTMENT_RADIUS_M = 100;


/**
 * How near its aim a round must land for the observer to call the guns on
 * the mark and fire for effect (the accuracy variant on trial). Ours: the
 * doctrinal "within 50 m of the adjusting point".
 */
export const DEFAULT_ON_TARGET_M = 50;

/** The most rounds one mission may fire — a guard, not a rule: a battery's volley is a handful. */
export const MAX_ROUNDS_PER_MISSION = 100;

export type RangeDeviation = "short" | "long" | "onTarget";
export type LineDeviation = "right" | "left" | "onTarget";
