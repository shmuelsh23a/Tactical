import {
  replayWithOutcomes,
  type GameRecording,
  type RecordedAction,
  type ReplayStep,
  type Side,
} from "../engine/index.js";
import type { Lens } from "./debriefText.js";

/**
 * Reviewing a battle as one side saw it (backlog item 14).
 *
 * The engine is the umpire and returns ground truth, so the danger in a
 * per-side debrief is teaching a player what they never observed: an exact
 * casualty count from a shot into smoke, a force that was never spotted, the
 * enemy's orders. This module decides what a side is entitled to see, from the
 * same contact ledger the game itself was played on (rules decision 12) —
 * replayed, not stored, exactly like every other outcome in the debrief.
 */

/** Whose eyes the battle is being reviewed through. */
export type Viewpoint = Side | "umpire";

/** The contacts each side held after a given action. */
export type Contacts = Record<Side, Set<string>>;

/** Which side each force belongs to, read out of the recording's own setup. */
export function unitSides(recording: GameRecording): Map<string, Side> {
  const sides = new Map<string, Side>();
  for (const action of recording.actions) {
    if (action.kind === "addUnit") sides.set(action.unit.id, action.unit.side);
  }
  return sides;
}

/**
 * Replay the battle once, keeping both what each action produced and what each
 * side knew once it had. One pass: the contact ledger is rebuilt by the replay,
 * so asking it per step costs nothing extra.
 */
export function replayForReview(recording: GameRecording): {
  steps: ReplayStep[];
  contactsAfter: Contacts[];
} {
  const contactsAfter: Contacts[] = [];
  const { steps } = replayWithOutcomes(recording, {
    onStep: (game, index) => {
      contactsAfter[index] = {
        RED: new Set(game.contactsFor("RED").map((c) => c.unitId)),
        BLUE: new Set(game.contactsFor("BLUE").map((c) => c.unitId)),
      };
    },
  });
  return { steps, contactsAfter };
}

/** The umpire's lens: everything, which is what the engine returns anyway. */
export const UMPIRE_LENS: Lens = { isOwn: () => true, mayKnow: () => true };

/**
 * What `side` was entitled to know after action `index`: its own forces, plus
 * whatever it had picked up by then.
 */
export function lensFor(
  side: Side,
  index: number,
  contactsAfter: Contacts[],
  sides: Map<string, Side>,
): Lens {
  const contacts = contactsAfter[index] ?? { RED: new Set<string>(), BLUE: new Set<string>() };
  const isOwn = (unitId: string) => sides.get(unitId) === side;
  return { isOwn, mayKnow: (unitId) => isOwn(unitId) || contacts[side].has(unitId) };
}

/**
 * Whether `side` would know what an action *produced*, as against knowing it
 * happened. A force reports what its own actions did; of the enemy's, a side
 * learns only what landed on its own people — it watches an enemy squad fire
 * without being told how many of *its* men that squad lost.
 *
 * Phase steps carry indirect fire and standing observation, which are filtered
 * per force by the lens instead (see `describeOutcome`).
 *
 * ⚠️ How much a force observes of what its own fire achieved is a reading, not
 * a rule the document settles — see README rules decision 13.
 */
export function outcomeVisibleTo(
  action: RecordedAction,
  side: Side,
  sides: Map<string, Side>,
  lens: Lens,
): boolean {
  const own = (unitId: string) => sides.get(unitId) === side;
  switch (action.kind) {
    case "beginTurn":
    case "advancePhase":
    case "advanceToPhase":
      return true;
    case "moveUnit":
    case "issueOrders":
    case "setStandingOrder":
    case "setCamouflage":
    case "setScouting":
      return own(action.unitId);
    case "executeStandingOrders":
      return action.side === side;
    case "uavSweep":
      return action.viewer === side;
    case "queueIndirectFire":
    case "deploySmoke":
      return action.side === side;
    // Shooting at a mark is not the same as watching it fall: a side learns
    // what its fire did to a force it can see, and always what was done to its
    // own — but a shot at a stale contact tells it nothing it did not observe.
    case "fire":
    case "fireExplosive":
      return own(action.targetId) || (own(action.attackerId) && lens.mayKnow(action.targetId));
    case "assault":
      return own(action.defenderId) || (own(action.attackerId) && lens.mayKnow(action.defenderId));
    default:
      return false;
  }
}

/**
 * Whether `side` would know this action happened at all.
 *
 * Its own decisions, always. The enemy's only where it could see them: a force
 * it holds a contact on moving or firing, or fire that came down on its own
 * people. Orders, postures and fire missions are decisions taken out of sight,
 * so they never cross — and neither does the enemy's setup, which is what makes
 * an undetected force absent from the review rather than merely unmentioned.
 */
export function actionVisibleTo(
  action: RecordedAction,
  side: Side,
  lens: Lens,
  sides: Map<string, Side>,
): boolean {
  const own = (unitId: string) => sides.get(unitId) === side;

  switch (action.kind) {
    // The turn structure is common to the table.
    case "beginTurn":
    case "advancePhase":
    case "advanceToPhase":
      return true;

    case "addUnit":
      return action.unit.side === side;
    case "addMine":
      return action.mine.side === side;

    // Decisions taken behind one's own lines.
    case "uavSweep":
      return action.viewer === side;
    case "queueIndirectFire":
    case "deploySmoke":
      return action.side === side;
    case "issueOrders":
    case "setStandingOrder":
    case "setCamouflage":
    case "setScouting":
      return own(action.unitId);
    case "executeStandingOrders":
      // The enemy's own step is shown only when something inside it was seen;
      // the outcome is filtered to that, so an empty one hides the step.
      return action.side === side;

    // …and what can be watched happening.
    case "moveUnit":
      return lens.mayKnow(action.unitId);
    case "fire":
    case "fireExplosive":
      return lens.mayKnow(action.attackerId) || own(action.targetId);
    case "assault":
      return lens.mayKnow(action.attackerId) || own(action.defenderId);

    default:
      return false;
  }
}

/**
 * What a side did not know, drawn out of the battle it fought (rules decision
 * 13). The point of banding a player's reports is that the debrief teaches:
 * you read the battle as you fought it, form a judgement, and only then look at
 * what was actually there. These are the figures that make the comparison —
 * every one of them derived from the same replay, never stored.
 */
export interface Lessons {
  /** Enemy forces this side never picked up at all. */
  neverDetected: string[];
  /** Its own shots at a force it was not holding a contact on at the time. */
  firedUnseen: number;
  /** Times it was fired on by a force it had never detected — the ambush. */
  hitByUnseen: number;
  /** Casualties it actually inflicted: the umpire's tally, not its own report. */
  inflicted: number;
  /** Casualties it took. A side knows these exactly. */
  suffered: number;
}

/**
 * Work the lessons out over the first `upTo` actions, so scrubbing the timeline
 * shows the picture as it stood at that point rather than only at the end.
 */
export function lessonsFor(
  side: Side,
  upTo: number,
  steps: ReplayStep[],
  contactsAfter: Contacts[],
  sides: Map<string, Side>,
): Lessons {
  const own = (unitId: string) => sides.get(unitId) === side;
  // What the side knew *going into* the action: a shot puts its firer on the
  // enemy's map, so asking afterwards would say every ambusher had been seen.
  const knewBefore = (i: number, unitId: string) =>
    i > 0 && (contactsAfter[i - 1]?.[side].has(unitId) ?? false);

  const lessons: Lessons = {
    neverDetected: [],
    firedUnseen: 0,
    hitByUnseen: 0,
    inflicted: 0,
    suffered: 0,
  };

  const count = (unitId: string, casualties: number) => {
    if (!casualties) return;
    if (own(unitId)) lessons.suffered += casualties;
    else lessons.inflicted += casualties;
  };

  for (let i = 0; i < Math.min(upTo, steps.length); i++) {
    const { action, outcome } = steps[i]!;

    if (action.kind === "fire" || action.kind === "fireExplosive" || action.kind === "assault") {
      const attackerId = action.attackerId;
      const targetId = action.kind === "assault" ? action.defenderId : action.targetId;
      const fired =
        (outcome.kind === "fire" && outcome.result.fired) ||
        (outcome.kind === "fireExplosive" && outcome.result.fired) ||
        (outcome.kind === "assault" && outcome.result.fired);
      if (fired && own(attackerId) && !knewBefore(i, targetId)) lessons.firedUnseen += 1;
      if (fired && own(targetId) && !knewBefore(i, attackerId)) lessons.hitByUnseen += 1;
    }

    switch (outcome.kind) {
      case "fire":
        if (action.kind === "fire") count(action.targetId, outcome.result.newCasualties);
        break;
      case "assault":
        if (action.kind === "assault") {
          count(action.defenderId, outcome.result.defenderCasualties);
          count(action.attackerId, outcome.result.selfCasualties);
        }
        break;
      case "fireExplosive":
      case "phase":
      case "moveUnit":
      case "executeStandingOrders": {
        // Blast and charge casualties come with the force they fell on.
        const blasts =
          outcome.kind === "fireExplosive"
            ? [outcome.result.blast]
            : outcome.kind === "phase"
              ? outcome.resolved.map((r) => r.blast)
              : outcome.kind === "moveUnit"
                ? outcome.move.mineDetonations.map((d) => d.blast)
                : outcome.executions.flatMap((e) => e.moved?.result.mineDetonations.map((d) => d.blast) ?? []);
        for (const blast of blasts) {
          for (const target of blast?.targets ?? []) {
            if (target.caught) count(target.unitId, target.newCasualties);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  const enemies = [...sides.entries()].filter(([, s]) => s !== side).map(([id]) => id);
  const known = contactsAfter[Math.min(upTo, contactsAfter.length) - 1]?.[side] ?? new Set<string>();
  lessons.neverDetected = enemies.filter((id) => !known.has(id));
  return lessons;
}
