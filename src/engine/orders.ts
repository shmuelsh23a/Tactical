import { distance, type Point } from "./geometry.js";
import type { MovementMode } from "./types.js";
import type { WeaponClass } from "./combat/directFire.js";
import type { MoveResult } from "./game.js";

/**
 * Standing orders (פקודות עומדות).
 *
 * The פו"ש table says how often a force can be given *new* orders. It does not
 * say a force out of contact stops — it goes on doing what it was last told to
 * do until fresh orders reach it. So distance from the חפ"ק measures how stale
 * a force's orders are, not whether it may act (rules decision 6).
 *
 * An order is deliberately small: where to get to, how fast, and optionally a
 * force to engage on the way. Those three cover the tasks the author named —
 * advance, engage, and hold at the objective — without inventing a task
 * language the document does not have.
 */
export interface StandingOrder {
  /** Turn the order was issued, for display and for the debrief. */
  issuedTurn: number;
  /** Gait to execute the move at. */
  gait: MovementMode;
  /**
   * Where the force is to get to. Cleared on arrival, which is what turns an
   * "advance" into "hold at the objective".
   */
  destination?: Point;
  /** A force to engage whenever the fire phase allows. */
  engage?: { targetId: string; weapon: WeaponClass };
}

/** Close enough to count as arrived, in metres. */
export const ARRIVAL_TOLERANCE_M = 1;

/** True once the force is at its objective and should hold. */
export function hasArrived(from: Point, destination: Point): boolean {
  return distance(from, destination) <= ARRIVAL_TOLERANCE_M;
}

/**
 * The point a force reaches this turn heading for `destination`, given how far
 * it may still travel. Short of the objective it stops on the line; within
 * reach it arrives exactly.
 */
export function stepTowards(from: Point, destination: Point, budget: number): Point {
  const remaining = distance(from, destination);
  if (remaining <= budget) return { ...destination };
  if (remaining === 0 || budget <= 0) return { ...from };
  const t = budget / remaining;
  return {
    x: from.x + (destination.x - from.x) * t,
    y: from.y + (destination.y - from.y) * t,
  };
}

/** What a force did when the engine executed its standing order. */
export interface StandingOrderExecution {
  unitId: string;
  /**
   * Set when the force advanced; `arrived` closes the order out. `result`
   * carries what the bound turned up — spotted enemy, charges walked onto —
   * so a caller can report it exactly as it would a hand-driven move.
   */
  moved?: { to: Point; arrived: boolean; result: MoveResult };
  /** Set when the force engaged the target its order names. */
  engaged?: { targetId: string; hits: number; newCasualties: number; hitChance: number };
  /** Why nothing happened, when nothing did. */
  reason?: string;
}
