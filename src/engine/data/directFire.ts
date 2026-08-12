import type { RangeBand } from "../geometry.js";

/**
 * Direct (ballistic) small-arms fire — ירי קליעי.
 *
 * Resolution: attack roll = hit% × number of fit soldiers in the unit (fire
 * may be split across targets); each hit does 1d4 damage. Fire requires an
 * unobstructed line of sight.
 */
export const DIRECT_FIRE_DAMAGE_DICE = "1d4";

/** Small arms / machine guns (ירי נק"ל\מקלעים). */
export const SMALL_ARMS_BANDS: readonly RangeBand[] = [
  { maxRange: 100, value: 0.3 },
  { maxRange: 299, value: 0.2 },
  { maxRange: 400, value: 0.1 },
];

/** Sustained / parallel machine-gun fire (ירי מקביל). */
export const SUSTAINED_MG_BANDS: readonly RangeBand[] = [
  { maxRange: 300, value: 0.7 },
  { maxRange: 499, value: 0.5 },
  { maxRange: 700, value: 0.2 },
];

/**
 * Cover modifiers — a **proportional** cut of the hit chance, not a subtraction
 * of percentage points. The document reads "-50% מסיכויי הפגיעה" ("-50% *of*
 * the hit chance"), so full cover halves whatever the shot would otherwise be
 * (20% → 10%). Read additively these would zero the whole direct-fire table —
 * see rules decision 7 in the README.
 *   Full cover (did not move and did not fire on the previous turn): -50%.
 *   Partial cover (when firing while in cover): -10%.
 */
export const COVER_MODIFIERS = {
  full: -0.5,
  partial: -0.1,
  none: 0,
} as const;

export type CoverState = keyof typeof COVER_MODIFIERS;
