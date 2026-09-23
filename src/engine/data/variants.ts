/**
 * Rule variants on trial (2026-09-23) — **not rules yet**.
 *
 * The balance harness showed an attack on a prepared position is close to a
 * switch, and a winning attacker barely bleeds (docs/balance.md). The author
 * asked for three questions to be settled by measurement rather than by
 * argument, so each has candidate answers here, switched per game through
 * {@link RuleVariants} on `GameOptions`. Absent, the engine plays exactly as
 * before. Once he picks, the winner becomes the rule and the rest are deleted —
 * this file is scaffolding for a decision, not a place for options to live.
 *
 * All numbers here are ours (⚠️).
 */
export interface RuleVariants {
  /**
   * Ruling 1 — does the defender fire back in an assault? Absent: no (the
   * document's assault gives only the attacker's fire). Both answers are
   * **simultaneous**: the defender replies with the men it had before the
   * assault landed.
   * - `simultaneous` (1a): at the assault's own 70%.
   * - `closeFire` (1b): at its ordinary small-arms chance for the range (30%
   *   inside 100 m).
   */
  assaultReply?: "simultaneous" | "closeFire";
  /**
   * Ruling 2 — does ordinary fire read the movement table's modifier against a
   * target that moved this turn (+30% walking, −20% running)? Absent: only
   * covering fire does. When set, covering fire uses the same reading.
   * - `additiveFloor` (2b): added, as rules decision 7 reads it, but never
   *   below {@link VARIANT_FIGURES.movementFloor} — so running cannot make a
   *   force unhittable.
   * - `proportional` (2c): multiplied instead — ×1.3 walking, ×0.8 running.
   */
  movementModifier?: "additiveFloor" | "proportional";
  /**
   * Ruling 3 — what firing costs a force in full cover. Absent: it drops to
   * partial (−10%) for the turn it fires.
   * - `worthMore` (3b): it keeps −30% rather than −10% for that turn. Partial
   *   cover from a wall or a prepared position stays −10%.
   * - `previousTurn` (3a): the document's words literally — full cover needs
   *   a force that did not fire in the *previous* turn, so a force that fired
   *   last turn is in partial cover all of this one, and firing this turn
   *   costs nothing until the next.
   */
  firingFromCover?: "worthMore" | "previousTurn";
}

export const VARIANT_FIGURES = {
  /** 2b: the least a moving target can be hit at, when a band reaches it at all. */
  movementFloor: 0.05,
  /** 2c: the walking and running factors. */
  walkFactor: 1.3,
  runFactor: 0.8,
  /** 3b: what full cover is still worth to a force that fired from it this turn. */
  firingFromCoverModifier: -0.3,
} as const;
