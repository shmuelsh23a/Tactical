import { Game, distance, type Side, type Unit } from "../engine/index.js";

/** The engine phases a player acts in, in turn order. */
export type ActivationPhase = "targeting" | "movement" | "combat";

/** One side acting within one phase of a turn. */
export interface Activation {
  phase: ActivationPhase;
  side: Side;
}

/** A line in the combat/event log. */
export interface LogEntry {
  id: number;
  turn: number;
  side?: Side;
  text: string;
  kind: "info" | "move" | "fire" | "casualty" | "phase";
}

/**
 * Within a turn, every side marks its targets (in initiative order), then every
 * side moves, then every side fights — matching the document's phase order
 * while giving each side a discrete hotseat activation. Indirect fire marked in
 * the targeting phase lands on a later turn, on the way into movement.
 */
export function buildActivations(initiativeOrder: Side[]): Activation[] {
  const phases: ActivationPhase[] = ["targeting", "movement", "combat"];
  return phases.flatMap((phase) => initiativeOrder.map((side): Activation => ({ phase, side })));
}

/** Simplified spotting range for the slice (the doc's visible-enemy band). */
export const SPOT_RANGE_M = 300;

/**
 * Fog-of-war for the slice: a side knows an enemy unit when any of its own
 * live units is within spotting range. (Probabilistic / hidden detection and
 * terrain LOS come in a later iteration.)
 */
export function computeRevealed(game: Game, side: Side, spotRange = SPOT_RANGE_M): Set<string> {
  const friendly = game.units.filter((u) => u.side === side && !isGone(u));
  const revealed = new Set<string>();
  for (const enemy of game.units) {
    if (enemy.side === side || isGone(enemy)) continue;
    if (friendly.some((f) => distance(f.position, enemy.position) <= spotRange)) {
      revealed.add(enemy.id);
    }
  }
  return revealed;
}

/** A destroyed vehicle is removed from play; neutralised infantry stays visible. */
export function isGone(u: Unit): boolean {
  return u.kind === "vehicle" && !!u.vehicle?.destroyed;
}

/** True when `side` has no units left able to fight. */
export function sideDefeated(game: Game, side: Side): boolean {
  const units = game.units.filter((u) => u.side === side);
  return units.length > 0 && units.every((u) => u.neutralized || isGone(u));
}
