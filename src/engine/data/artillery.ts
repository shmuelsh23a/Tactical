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
 * How accurate each indirect weapon is (rules decision 32, author 2026-09-23),
 * **in place of the dispersion table above**, which stays transcribed but is
 * no longer rolled. CEP, the radius half the rounds fall within: `firstM` for
 * a first round, halved by each observed adjustment down to `capM`, the
 * weapon's best. Artillery: the author's 50–270 m, from the sources (unguided
 * 155 mm at range). Mortar: 100 m first round (a 120 mm bomb is 76–136 m
 * unadjusted), 25 m best (ours: the tube's own spread).
 */
export const INDIRECT_ACCURACY: Readonly<Record<string, { firstM: number; capM: number }>> = {
  artillery: { firstM: 270, capM: 50 },
  mortar: { firstM: 100, capM: 25 },
};

/** The CEP after `adjustments` observed rounds, or on the mark (rules decision 32). */
export function cepAfter(spec: { firstM: number; capM: number }, adjustments: number, onMark: boolean): number {
  return onMark ? spec.capM : Math.max(spec.capM, spec.firstM / 2 ** adjustments);
}

/**
 * How near its aim a round must be seen to land for the guns to be on the
 * mark and fire for effect (rules decision 32). Ours: the doctrinal "within
 * 50 m of the adjusting point".
 */
export const ON_TARGET_M = 50;

/**
 * How far a force sees the fall of a round, and how high the burst stands for
 * its sight line (rules decision 33). Ours: a burst and its smoke are seen far
 * beyond where men are; the sight line is what limits it.
 */
export const OBSERVE_RANGE_M = 2000;
export const BURST_HEIGHT_M = 3;

/**
 * Rounds fired for effect by a company's fire mission unless its allotment
 * says otherwise (rules decision 34). The author's default, 2026-09-23: a
 * 6-gun battery's one round, or a 3-tube section's two. Doctrine often fires
 * more — "seldom less than five rounds for each mortar" (FM 7-90) — and the
 * figure is on balance.md, tenth round.
 */
export const DEFAULT_ROUNDS_FOR_EFFECT = 6;

/**
 * Adjusting rounds before a mission fires for effect whatever the fall of
 * shot (rules decision 34). Ours: a bracket from 270 m closes in four.
 */
export const MAX_ADJUSTING_ROUNDS = 4;

/** The most rounds one mission may fire — a guard, not a rule: a battery's volley is a handful. */
export const MAX_ROUNDS_PER_MISSION = 100;

export type RangeDeviation = "short" | "long" | "onTarget";
export type LineDeviation = "right" | "left" | "onTarget";
