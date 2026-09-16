import { distance, type Point } from "../geometry.js";
import type { DirectFireResult, WeaponClass } from "./directFire.js";

/**
 * Covering fire (חיפוי) — the document's third action of phase 6, alongside
 * ירי and הסתערות: *פגיעה במקרה של פעולה על ידי האויב: כמו ירי* — "a hit in
 * the case of an action by the enemy: like fire".
 *
 * The document settles what covering fire resolves *to* (ordinary direct fire)
 * and says nothing about what it resolves *on*. The author settled that on
 * 2026-09-16, and the four answers are the whole rule (see rules decision 18):
 *
 *   1. It triggers on an enemy **moving, firing or assaulting**.
 *   2. It is **declared in advance**, not chosen when the moment comes.
 *   3. It resolves **immediately**, and the force it caught **carries on** —
 *      a bound is interrupted, never cancelled.
 *   4. It **spends the force's action**: a force covers or attacks in a turn,
 *      never both.
 *
 * This module holds the geometry of (3) — where along a bound the shot is
 * taken. Who may fire, what it costs them and what it does to the rng live in
 * `Game`, which owns the dice.
 */
export const COVERING_FIRE = {
  /**
   * How finely a bound is walked looking for the first place a covering force
   * could shoot. Five metres is well under the smallest cover reach on the map
   * (3 m) doubled, so a force cannot slip through a gap in the sampling that it
   * could not also have slipped through in the sight test itself.
   */
  pathStepM: 5,
} as const;

/** A shot taken in reaction, and what it caught. */
export interface CoveringFireResult {
  /** The force that was covering, and has now fired. */
  coveringId: string;
  /** The force whose action set it off. */
  targetId: string;
  /** What the target was doing. */
  trigger: "move" | "fire" | "assault";
  /**
   * Where the target stood when the shot was taken. For a move this is the
   * first point of the bound at which the covering force could see and reach
   * it — not where the bound ended, which it goes on to reach anyway.
   */
  at: Point;
  weapon: WeaponClass;
  result: DirectFireResult;
}

/**
 * The first point along `from`→`to` at which `canFireAt` is satisfied, or null
 * if the mover is never exposed.
 *
 * The start point is tested first — a force that breaks cover in full view of
 * a covering position is shot at as it stands up, not after it has walked —
 * and the destination is always tested last, whatever the step leaves over.
 */
export function firstFiringPoint(
  from: Point,
  to: Point,
  canFireAt: (at: Point) => boolean,
): Point | null {
  const span = distance(from, to);
  const steps = Math.max(1, Math.ceil(span / COVERING_FIRE.pathStepM));
  for (let i = 0; i <= steps; i++) {
    const t = Math.min(1, i / steps);
    const at = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    if (canFireAt(at)) return at;
  }
  return null;
}
