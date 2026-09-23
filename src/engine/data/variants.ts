/**
 * Rule variants on trial — **not rules yet**.
 *
 * The balance harness (docs/balance.md) is measuring the answers to the
 * author's questions rather than arguing them. What is still being measured
 * lives here, switched per game through {@link RuleVariants} on `GameOptions`;
 * absent, the engine plays the rules as they stand. Once he picks, the winner
 * becomes the rule and its switch is deleted — scaffolding for a decision, not
 * a place for options to live. Rulings 2 and 3 went through here and are rules
 * now (decisions 22 and 23), and so did the wound-severity roll (decision 26).
 */
export interface RuleVariants {
  /**
   * Ruling 1 — "a defending force against an assault should be able to return
   * fire" (author, 2026-09-23), at a rate still being measured. The chance per
   * man, fired simultaneously: by the men the defender had before the assault
   * landed. Absent: the document's one-sided assault.
   */
  assaultReplyChance?: number;
  /**
   * How much steadier a prepared defender is (author, 2026-09-23 — the rule is
   * his, the size is being measured). Override `PREPARED` in data/morale.ts:
   * the bonus to every morale test, and the factor on every loss, for a force
   * in position.
   */
  preparedTestBonus?: number;
  preparedLossFactor?: number;
  /**
   * One wound rule for bullets and explosives alike (author, 2026-09-23: "keep
   * the rules uniform for HE and bullets"), on trial. Absent: a bullet takes
   * the severity roll (decision 26), an explosive its document die at 8.
   */
  woundModel?: WoundModel;
}

/**
 * - `severity` (option A): every hit rolls the d10 severity, an explosive's
 *   shifted up by {@link HE_SEVERITY_SHIFT} for how big its document die is.
 * - `flat` (A without the shift): every hit rolls the same d10 — a fragment
 *   is no worse than a bullet, the explosive's weight is in how many it hits.
 * - `dice` (option B): every hit rolls its document die — a bullet 1d4 — and
 *   a man is out of the fight at 5 points, where he starts bleeding.
 */
export type WoundModel = "severity" | "flat" | "dice";

/** The document's damage die for a bullet. */
export const BULLET_DIE = "1d4";

/** Option A: what an explosive adds to the d10 severity roll, by its document die. */
export const HE_SEVERITY_SHIFT: Readonly<Record<string, number>> = {
  "1d4": 0,
  "1d6": 1,
  "1d8": 2,
  "1d10": 3,
  "2d10": 5,
};
