/**
 * Rule variants on trial — **not rules yet**.
 *
 * The balance harness (docs/balance.md) is measuring the answers to the
 * author's questions rather than arguing them. What is still being measured
 * lives here, switched per game through {@link RuleVariants} on `GameOptions`;
 * absent, the engine plays the rules as they stand. Once he picks, the winner
 * becomes the rule and its switch is deleted — scaffolding for a decision, not
 * a place for options to live. Cover against a shell is here now. Rulings 2 and 3 went through here and are rules
 * now (decisions 22 and 23), and so did the wound-severity roll (decision 26) and one wound rule for
 * bullets and explosives (decision 27).
 */
import type { CoverState } from "./directFire.js";

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
   * What cover does against a shell (author, 2026-09-23: "test a and b" —
   * cover cuts the chance, or only full cover does). The factor on each man's
   * blast chance, by the cover his force is in; a state left out is ×1.
   * Indirect fire only: it is the shell's blast the question was about. Absent:
   * the document's blast table, which cover does not touch.
   */
  blastCoverFactor?: Partial<Record<CoverState, number>>;
}

