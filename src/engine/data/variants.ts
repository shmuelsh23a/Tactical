import type { Side } from "../types.js";
import type { Point } from "../geometry.js";

/**
 * Rule variants on trial — **not rules yet**.
 *
 * The balance harness (docs/balance.md) is measuring the answers to the
 * author's questions rather than arguing them. What is still being measured
 * lives here, switched per game through {@link RuleVariants} on `GameOptions`;
 * absent, the engine plays the rules as they stand. Once he picks, the winner
 * becomes the rule and its switch is deleted — scaffolding for a decision, not
 * a place for options to live. Rulings 2 and 3 went through here and are rules
 * now (decisions 22 and 23), and so did the wound-severity roll (decision 26) and one wound rule for
 * bullets and explosives (decision 27), and cover against a shell (decision 29).
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
   * Accuracy by CEP, in place of the document's dispersion table (author,
   * 2026-09-23). By weapon key; a weapon left out keeps the table. A
   * mission's rounds scatter as a circular normal with CEP
   * `max(capM, firstM ÷ 2^adjustments)`. Each earlier mission of the same
   * side's same weapon within `ADJUSTMENT_RADIUS_M` of the aim is an
   * adjustment: the observer's bracket halves the error. Once a round lands
   * within `onTargetM` (default 50 m) the guns are on the mark and fire at the
   * cap: "one bomb until it hits close to the mark, then fire for effect".
   */
  cepDispersion?: Record<string, { firstM: number; capM: number; onTargetM?: number }>;
  /**
   * Targets a side registered before the battle — its guns already on the
   * mark there (the accuracy variant on trial). A defender's planned fires.
   */
  registeredTargets?: { side: Side; weapon: string; at: Point }[];
}

