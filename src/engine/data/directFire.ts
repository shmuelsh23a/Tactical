import type { RangeBand } from "../geometry.js";
import type { Experience } from "../types.js";

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

/**
 * The coaxial machine gun (ירי מקביל — מקלע מקביל, the gun mounted beside an
 * armoured vehicle's main armament). Author, 2026-09-23 (rules decision 25):
 * **a vehicle's weapon only**. Infantry fire the table above — its own heading
 * is נק"ל\מקלעים, machine guns included. The key stays `sustainedMg`, the name
 * it was first read under, so recordings made since still load.
 */
export const SUSTAINED_MG_BANDS: readonly RangeBand[] = [
  { maxRange: 300, value: 0.7 },
  { maxRange: 499, value: 0.5 },
  { maxRange: 700, value: 0.2 },
];

/**
 * Cover modifiers — a **proportional** cut of the hit chance, not a subtraction
 * of percentage points (author, 2026-08-16). The document reads
 * "-50% מסיכויי הפגיעה" ("-50% *of* the hit chance"), so full cover halves
 * whatever the shot would otherwise be (20% → 10%).
 *
 * Two things settle it. The document uses the partitive מ־ here and **not** in
 * the movement table's `+30% סיכויי פגיעה`, so the two are meant to be applied
 * differently. And read additively these would zero the whole direct-fire table
 * — see rules decision 7 in the README.
 *   Full cover: -50%. What the ground gives a force, or what it has dug for
 *   itself after long enough in place (rules decision 12).
 *   Partial cover: -10%. Half-decent ground — and what full cover counts as
 *   for a force that fires from it, since firing exposes it.
 */
export const COVER_MODIFIERS = {
  full: -0.5,
  partial: -0.1,
  none: 0,
} as const;

export type CoverState = keyof typeof COVER_MODIFIERS;

/**
 * What full cover is still worth to a force that fired from it this turn —
 * **not the document's figure**. The document drops it to partial (−10%); the
 * author set −30% instead on 2026-09-23 (rules decision 23), so that a
 * defender who shoots back is not left all but unprotected. Genuine partial
 * cover — a wall, a tree, a prepared position — stays at the table's −10%.
 */
export const FIRING_FROM_COVER_MODIFIER = -0.3;

/**
 * Directional cover (rules decision 85; the author, 2026-10-06, "I want all
 * of the above"). A dug or prepared position is built toward its front:
 * FM 3-21.8 (2007) para 8-150 gives the front parapet 2–3 sandbags high and
 * about 7 ft long, the flanks the same height and half the length, the rear
 * one sandbag, filled "in order of front, flanks, and rear"
 * (docs/validation.md, *Directional cover*). Its cover modifier counts in
 * full against fire from within `frontHalfArc` of its front, at
 * `flankShare` from the flank and `rearShare` from beyond `rearBeyond`.
 * ⚠️ The two shares are ours, scaled from those parapets; no source gives
 * protection by angle. A house protects on every side (FM 3-06.11: 70 rifle
 * rounds to go through 9 in of double brick). A wall or a tree covers only
 * against fire from its side of the force: within `frontHalfArc` of the
 * bearing to it (⚠️ ours).
 */
export const DIRECTIONAL_COVER = { frontHalfArc: 60, rearBeyond: 120, flankShare: 0.6, rearShare: 0.3 } as const;

/**
 * Caught unready (rules decision 85): fire from an enemy the target's side
 * had not seen, from outside the arc it watched (its observation sector, or
 * its position's front). Rowland (*The Stress of Battle*): surprise — "the
 * unexpected in timing, place or direction" — cut the defence's
 * effectiveness by 60%, so the surprised force fires at `ownFire` until the
 * end of the turn. The shot itself hits at `hitFactor` (⚠️ ours: a share of
 * Storr's casualty ratios by direction of attack, frontal about 2:1 against
 * the attacker, flank 2:1 and rear 4:1 for it, which bundle cover, surprise
 * and nerve).
 */
export const UNREADY = { hitFactor: 1.5, ownFire: 0.4 } as const;

/**
 * Readiness (rules decision 86; the author, 2026-10-06): three levels a
 * force, set by the scenario — an attacker alert (2) unless it says
 * otherwise. An unaware force (1) is caught unready by fire from any enemy
 * it had not seen, from any side; an alert one (2) only from outside the arc
 * it watches (decision 85); a force stood to (3) is not caught. It rises a
 * level for an indication of the enemy — a charge found, shells landing
 * within `indicationM` — and to 3 at the sight of an enemy force or the
 * moment it is fired on. ⚠️ Ours: the defender's default (alert, as every
 * battle played before this rule), what counts as an indication, its
 * reach, and that nothing lowers it.
 */
export const READINESS = { default: 2, indicationM: 300 } as const;

/**
 * How many turns a force caught unready fires at {@link UNREADY}'s `ownFire`
 * (rules decision 86; the author: "proportional to experience, but not
 * linear"): each step of experience halves it, and an elite force is not
 * shaken at all — the surprise shot still hits it harder. ⚠️ The turns are
 * ours.
 */
export const SURPRISE_RECOVERY_TURNS: Record<Experience, number> = { green: 4, regular: 2, veteran: 1, elite: 0 };
