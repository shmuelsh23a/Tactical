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

export type RangeDeviation = "short" | "long" | "onTarget";
export type LineDeviation = "right" | "left" | "onTarget";
