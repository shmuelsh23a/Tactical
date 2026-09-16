import { Game, canObserve, distance, type Side, type Unit } from "../engine/index.js";

/** The engine phases a player acts in, in turn order. */
export type ActivationPhase = "targeting" | "movement" | "combat";

/** One side acting within one phase of a turn. */
export interface Activation {
  phase: ActivationPhase;
  side: Side;
}

/** Both sides, in a fixed order, for anything that has to visit each in turn. */
export const SIDES: readonly Side[] = ["RED", "BLUE"];

/**
 * Who at the table may read a line of the live log (rules decision 17).
 *
 * The hotseat log is one list on one screen that both players read across a
 * handoff, so a line's `side` is a **colour chip, not a filter** — it says who
 * acted. What a side is *entitled* to read is this, and it is a required
 * argument of `pushLog` for the same reason the four `RecordedAction` switches
 * are exhaustive: a new log line cannot be added without saying who may see it.
 *
 * The three cases mirror `debriefView.ts`, so the live log and the debrief
 * draw the same line: the umpire's bookkeeping, a decision taken behind one's
 * own lines, and an exchange both sides were in.
 */
export type Audience =
  /** Turn structure, victory and the operator's own bookkeeping. No chip. */
  | { to: "table" }
  /**
   * Read by one side only. `by` is whose colour it carries, for the copy of a
   * shared event worded for the other side to read — "RED fired" as BLUE is
   * entitled to read it still flies RED's chip.
   */
  | { to: "side"; side: Side; by?: Side }
  /** An exchange both sides were in, in words both are entitled to. */
  | { to: "both"; by: Side };

/** The readers and the colour chip a log line takes from its audience. */
export function disclose(audience: Audience): { readers: readonly Side[]; side?: Side } {
  switch (audience.to) {
    case "table":
      return { readers: SIDES };
    case "side":
      return { readers: [audience.side], side: audience.by ?? audience.side };
    case "both":
      return { readers: SIDES, side: audience.by };
    default: {
      // Exhaustiveness: a new audience must say who reads it (decision 17).
      const never: never = audience;
      throw new Error(`Unhandled audience: ${JSON.stringify(never)}`);
    }
  }
}

/**
 * Whether `reader` may read a line — and `null` means **nobody has claimed the
 * screen yet**: a handoff, or the initiative panel between turns.
 *
 * That case is not a detail. `viewingSide` follows the *incoming* activation,
 * and the handoff screen exists because the player physically holding the
 * device at that moment is the **outgoing** one. Filtering to `viewingSide`
 * there would show him the next side's private log — the same hole, mirrored.
 * Until somebody presses "ready", only what belongs to the table is on screen.
 */
export function readableBy(entry: LogEntry, reader: Side | null): boolean {
  // `SIDES.every` rather than a length test: it says what is meant — readable
  // by everyone — without leaning on `readers` being duplicate-free.
  return reader == null
    ? SIDES.every((side) => entry.readers.includes(side))
    : entry.readers.includes(reader);
}

/** A line in the combat/event log. */
export interface LogEntry {
  id: number;
  turn: number;
  /** Whose colour the line flies — who acted, not who may read it. */
  side?: Side;
  /** The sides entitled to read the line (rules decision 17). Never empty. */
  readers: readonly Side[];
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

/**
 * Whether `side` has **eyes on** `unit` — any live force of its own with an
 * unobstructed line to it (rules decision 15's one sight test).
 *
 * Weaker than holding a contact, and deliberately so: seeing is not the same as
 * having *found* a force, which is a detection roll (decision 12). It is the
 * right test for something a side watches happen rather than searches out —
 * a charge it laid going off under somebody (rules decision 17).
 */
export function hasEyesOn(game: Game, side: Side, unit: Unit): boolean {
  // `canObserve` rather than `isGone`: the engine's detection roll already owns
  // the question of whether a force is in any state to be looking — a
  // neutralised squad is still drawn on the map but is not watching anything —
  // and asking it a second way here is how the two halves of one rule drift.
  return game.units.some(
    (u) => u.side === side && canObserve(u) && game.hasLineOfSight(u, unit),
  );
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
