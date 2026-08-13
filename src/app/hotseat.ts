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
 * Fog-of-war without the knowledge model: a side knows an enemy unit when any
 * of its own live units is within spotting range. Kept for a game built with
 * `trackIntel: false`, where the engine records no contacts to draw instead.
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

/** The board as one side is entitled to see it. */
export interface SideView {
  /**
   * What to draw: this side's own forces as they are, and each enemy force it
   * has picked up — drawn **where it was last seen**, which is not necessarily
   * where it is. Anything never detected is simply absent.
   */
  units: Unit[];
  /** Contacts whose last report is older than this turn: marks, not sightings. */
  staleIds: Set<string>;
}

/**
 * What `side` may be shown. With the knowledge model on this is the engine's
 * contact ledger — the document's own detections, reflected onto that player's
 * map — and an enemy that has moved since it was last seen keeps its mark
 * where the report put it. Without it, the flat spotting radius stands and
 * every revealed enemy is shown where it truly is.
 */
export function sideView(game: Game, side: Side): SideView {
  const own = game.units.filter((u) => u.side === side && !isGone(u));
  const staleIds = new Set<string>();

  if (!game.trackIntel) {
    const revealed = computeRevealed(game, side);
    return {
      units: [...own, ...game.units.filter((u) => u.side !== side && !isGone(u) && revealed.has(u.id))],
      staleIds,
    };
  }

  const enemies: Unit[] = [];
  for (const contact of game.contactsFor(side)) {
    const truth = game.units.find((u) => u.id === contact.unitId);
    if (!truth || isGone(truth)) continue;
    const seenNow = contact.lastSeenTurn >= game.turn;
    if (!seenNow) staleIds.add(truth.id);
    // A copy of the *report*, not of the force: an old contact carries where it
    // was and how it looked when it was last seen, so a player cannot read a
    // force's current position — or its collapse — off a stale mark.
    enemies.push(
      seenNow
        ? truth
        : {
            ...truth,
            position: { ...contact.lastKnownPosition },
            neutralized: contact.lastKnownNeutralized,
          },
    );
  }
  return { units: [...own, ...enemies], staleIds };
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
