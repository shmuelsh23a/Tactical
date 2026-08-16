import type { CoverState } from "./directFire.js";

/**
 * Concealment, digging in, and being seen (הסוואה, התחפרות, גילוי).
 *
 * The document gives detection only as an effect of *moving* — the movement
 * table's 70%/50% against a visible enemy within 300 m, and 30%/5% against a
 * hidden one within 20 m — and never says what makes a force hidden, or what a
 * force in position does about being found. The author settled that
 * (2026-08-13, README rules decision 12):
 *
 *   - a force in position observes **continuously**, and watching rather than
 *     moving is worth +10%. That is how an ambush works;
 *   - **a hidden force is one that is stationary**, so a force that holds still
 *     is looked for in the document's 20 m band rather than the 300 m one;
 *   - a **running** force is easier to pick up;
 *   - **stationary behind cover** is harder to pick up;
 *   - a stationary force in the open **digs in** after 3 turns, improving its
 *     protection every 2 turns up to the protection of a force behind cover;
 *   - **camouflage** is a command: -10% every 2 turns, up to -50%, and a moving
 *     force cannot be camouflaged;
 *   - a contact **unobserved for 3 turns** falls off the map;
 *   - **scouting** is a command: a force that looks rather than covers ground
 *     sees better, and may only walk while it does.
 *
 * Figures he gave are marked `author`; the two he left open are marked
 * `tentative` and are the ones to revisit when the game is balanced. Everything
 * here is a modifier in **percentage points** on the document's own chances,
 * following the movement table's own additive phrasing.
 */

export const OBSERVATION = {
  /** A force in position is watching its sector rather than its feet. */
  stationaryBonus: 0.1, // author (tentative pending balance)
  /** A force at a run is that much easier to pick up. */
  runningExposure: 0.1, // tentative — the author gave the direction, not the size
  /** Turns without a fresh report before a contact is dropped from the map. */
  contactExpiryTurns: 3, // author
} as const;

/** How much harder cover makes a force to find, by the cover it is in. */
export const COVER_CONCEALMENT: Record<CoverState, number> = {
  none: 0,
  partial: 0.1, // tentative
  full: 0.2, // tentative
};

/**
 * Digging in. A force that stays put in the open starts improving its position
 * and ends up as well protected as one that started behind cover.
 */
export const DIG_IN = {
  /** Stationary turns before the entrenching tools come out. */
  startsAfterTurns: 3, // author
  /** Turns of work per level of protection gained. */
  turnsPerLevel: 2, // author
  /** The levels dug through, in order — it stops at "behind cover". */
  levels: ["partial", "full"] as const satisfies readonly CoverState[],
} as const;

/** Camouflage (הסוואה): worked at over time, and undone by moving. */
export const CAMOUFLAGE = {
  /** Detection chance removed per completed step. */
  perStep: 0.1, // author
  turnsPerStep: 2, // author
  /** The most camouflage can ever be worth. */
  max: 0.5, // author
  /**
   * A camouflaged force is never harder to find than a **concealed charge**
   * (author, 2026-08-13, tentative): whatever cover and camouflage take off,
   * the chance never falls below the document's own figure for finding a hidden
   * charge at that gait — 30% at a walk, 5% at a run, inside 20 m. Camouflage
   * can cancel out an observer's advantages; it cannot make a squad harder to
   * spot than a buried charge, and it can never make a force impossible to find.
   *
   * A **scout beats the floor** by what scouting is worth: looking properly is
   * the answer to a camouflaged position, so the bonus is added on top of the
   * floor rather than swallowed by it (author, 2026-08-13).
   */
  floorIsConcealedChargeChance: true, // author (tentative)
} as const;

/**
 * A sector of observation (גזרת תצפית): where a force has been told to look
 * (README rules decision 14 — ⚠️ the document has no sector rule at all).
 *
 * Everything above makes a force better or worse at looking; none of it makes
 * looking a **choice**. Scouting in particular raises detection in every
 * direction at once, which is not what a commander assigns — he gives a force a
 * frontage and accepts that its flank is thinner.
 *
 * So a sector cuts both ways: **better inside the arc, worse outside it**. A
 * force given no sector observes all round at the plain figures, so nothing
 * changes for a game that never assigns one. The penalty is the larger number
 * deliberately: concentrating attention has to cost more than it gains, or a
 * sector is a free bonus every force would take and no decision at all.
 *
 * Both figures are **chosen, not the author's** — the sizes to argue about in
 * the balance pass.
 */
export const OBSERVATION_SECTOR = {
  /**
   * **Attention is a fixed budget spread over the arc** (author, 2026-08-16):
   * the bonus inside a sector is this divided by its width in degrees. A flat
   * bonus made width a trap — widening only ever converted a penalised
   * direction into a bonused one, so the widest arc dominated every narrower
   * one and there was no decision to take. Dividing it makes the three widths
   * genuinely different bets: a narrow arc is a sharp wager that you know the
   * axis of advance, a wide one is cheap insurance against not knowing.
   *
   * Expressed in percentage-points × degrees, so 13.5 is **+15% at the default
   * 90°**, +22% at 60°, +8% at 180°.
   */
  attentionBudget: 13.5, // shape: author; size: chosen (tentative)
  /** However narrow the arc, watching it is never a certainty. */
  maxBonus: 0.3, // tentative
  /** Taken off the chance of picking up anything outside it, whatever the width. */
  outsidePenalty: 0.2, // tentative — chosen, no document basis
  /** The frontage a sector covers unless the player narrows or widens it. */
  defaultWidth: 90, // tentative
  /** The widths the hotseat offers, narrowest first. */
  widths: [60, 90, 180] as const,
} as const;

/**
 * What watching an arc `width` degrees wide is worth inside it. A sector that
 * covers the whole compass is worth **nothing**: watching everything is not
 * watching anything in particular, and it must not be a way to collect a bonus
 * with no arc left over to pay the penalty.
 */
export function sectorBonus(width: number): number {
  if (width >= 360) return 0;
  return Math.min(
    OBSERVATION_SECTOR.maxBonus,
    OBSERVATION_SECTOR.attentionBudget / Math.max(1, width),
  );
}

/**
 * Scouting (סיור): a force moving deliberately, looking rather than covering
 * ground. It sees better and may only walk (author, 2026-08-13).
 */
export const SCOUTING = {
  /** Added to the force's own chance of picking anything up. */
  detectionBonus: 0.1, // tentative — the author gave the direction, not the size
  /** The fastest a scouting force moves: no running. */
  maxGait: "normal",
} as const;

/** Turns of work behind a fully camouflaged position, for a prepared defence. */
export const CAMOUFLAGE_TURNS_AT_MAX =
  (CAMOUFLAGE.max / CAMOUFLAGE.perStep) * CAMOUFLAGE.turnsPerStep;
