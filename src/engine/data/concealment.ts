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
 *   - a contact **unobserved for 3 turns** falls off the map.
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
} as const;

/** Turns of work behind a fully camouflaged position, for a prepared defence. */
export const CAMOUFLAGE_TURNS_AT_MAX =
  (CAMOUFLAGE.max / CAMOUFLAGE.perStep) * CAMOUFLAGE.turnsPerStep;
