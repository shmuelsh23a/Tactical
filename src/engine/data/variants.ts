/**
 * Rule variants on trial — **not rules yet**.
 *
 * The balance harness (docs/balance.md) is measuring the answers to the
 * author's questions rather than arguing them. What is still being measured
 * lives here, switched per game through {@link RuleVariants} on `GameOptions`;
 * absent, the engine plays the rules as they stand. Once he picks, the winner
 * becomes the rule and its switch is deleted — scaffolding for a decision, not
 * a place for options to live. Rulings 2 and 3 went through here and are rules
 * now (decisions 22 and 23).
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
   * The wound-severity roll (author, 2026-09-23: on trial). Each small-arms hit
   * — direct fire, covering fire, the assault and the reply to it — rolls a
   * d10 **instead of** the document's 1d4 of damage: up to `light` is a light
   * wound (the man fights on, {@link LIGHT_WOUND_POINTS} points towards the
   * document's 8), up to `light + serious` a serious one (out of the fight,
   * bleeding), and above that he is killed. Explosives keep the document's
   * dice. Absent: the document's model.
   */
  woundSeverity?: WoundSeverity;
}

/** The d10 bands of the wound-severity roll: 1..light, then serious, then killed. */
export interface WoundSeverity {
  light: number;
  serious: number;
}

/** What a light wound costs a man who fights on, in the document's damage points. */
export const LIGHT_WOUND_POINTS = 2;
