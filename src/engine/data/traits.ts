/**
 * What a soldier's traits do beyond morale (rules decisions 69, 71 and 72) —
 * **not the document's**, which has no traits. The shape is the author's
 * (2026-10-02); the figures marked ⚠️ are ours, set when it was built
 * (2026-10-03), with the sources on docs/validation.md, *Traits and fatigue*.
 */

/**
 * The most a trait is worth, either way, at 1 or 10 against the average
 * (author, 2026-10-02): ±20%. ⚠️ Scaled linearly from {@link TRAIT_MEAN}
 * to the ends (ours).
 */
export const TRAIT_EFFECT_MAX = 0.2;
/** The middle of the 1–10 scale: a trait here does nothing. */
export const TRAIT_MEAN = 5.5;

/**
 * Luck on a hit (decision 69), read off the severity roll itself — decision
 * 26's d10, taken as a continuous draw, so it costs no new draw. ⚠️ Ours:
 * - a lucky man (above the mean) is missed after all on the bottom
 *   `missFaces` × his luck's share of the die: up to 20% of the hits on him;
 * - the kill band (the top two faces) shrinks for a lucky man and grows for
 *   an unlucky one by up to 20% of itself — the shift from a kill towards a
 *   wound. An unlucky man is never missed.
 */
export const LUCK = { missFaces: 2 } as const;

/**
 * Fatigue (rules decision 71). ⚠️ The points are ours, set by:
 * - Ito et al. 1999 (US Army, *Rifle shooting accuracy during recovery from
 *   fatiguing exercise*): hits fell 26% after running to exhaustion and 20%
 *   after a loaded march, and were back by 1.5 minutes — so a tired man
 *   shoots at ×0.75 at worst, and recovers within a couple of quiet turns;
 * - Hunt et al. 2016 and Billing et al. 2015 (Australian Defence, repeated
 *   30 m sprints and 6 m bounds under load): each sprint slower than the
 *   last, and the slow men losing nearly twice what the fast ones did — so a
 *   run costs the most, and strength sets how much a man takes.
 *
 * Per man per turn: `run` for a turn at a run, `perClimbM` for each metre
 * climbed, `underFire` for a turn under fire; a quiet turn (no run, no climb,
 * not under fire) takes `rest` off. He is `tired` at `tired` × his strength
 * factor and `exhausted` at `exhausted` × it; the count stops at `max`.
 */
export const FATIGUE = {
  run: 3,
  perClimbM: 0.1,
  underFire: 1,
  rest: 3,
  tired: 6,
  exhausted: 12,
  max: 15,
} as const;

/** What tiredness costs a man: his pace and his aim. ⚠️ Ours, after Ito et al. 1999. */
export const FATIGUE_EFFECT = {
  tired: { pace: 0.9, accuracy: 0.9 },
  exhausted: { pace: 0.75, accuracy: 0.75 },
} as const;
