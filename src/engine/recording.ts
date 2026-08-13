import type { Point } from "./geometry.js";
import type {
  Mine,
  MovementMode,
  PendingFireMission,
  Side,
  SmokeScreen,
  Unit,
} from "./types.js";
import type { SmokeSource } from "./data/smoke.js";
import type { DirectFireOptions, DirectFireResult } from "./combat/directFire.js";
import type { DirectExplosiveResult } from "./combat/explosives.js";
import type { IndirectFireResult } from "./combat/indirectFire.js";
import type { AssaultResult } from "./combat/assault.js";
import type { DetectionResult, Observation } from "./combat/detection.js";
import { Game, type MoveResult, type Phase, type SmokeOrder } from "./game.js";
import { stateDigest } from "./digest.js";
import type { StandingOrder, StandingOrderExecution } from "./orders.js";

/**
 * Battle recording (הקלטת קרב).
 *
 * A game is fully determined by its seed and the ordered list of actions taken
 * on it — that is the whole point of drawing every random outcome from one
 * seeded {@link Rng}. So a recording stores exactly that, and replaying it
 * reproduces the game state for state, down to the generated ids.
 *
 * This is the foundation for the debrief tool, and the same property is what
 * will let networked clients agree on an outcome without shipping state.
 */

export type RecordedAction =
  | { kind: "addUnit"; unit: Unit }
  | { kind: "addMine"; mine: Omit<Mine, "id"> }
  | { kind: "beginTurn" }
  | { kind: "advancePhase" }
  | { kind: "advanceToPhase"; target: Phase }
  | { kind: "uavSweep"; uavKey: string; footprintCenter: Point; viewer: Side }
  | {
      kind: "queueIndirectFire";
      weaponKey: string;
      side: Side;
      target: Point;
      opts: { firingFrom?: Point; observedByUav?: boolean };
    }
  | { kind: "moveUnit"; unitId: string; to: Point; mode: MovementMode }
  | { kind: "fire"; attackerId: string; targetId: string; opts: DirectFireOptions }
  | {
      kind: "fireExplosive";
      weaponKey: string;
      attackerId: string;
      targetId: string;
      opts: { hasLineOfSight?: boolean; collateralIds?: string[] };
    }
  | { kind: "assault"; attackerId: string; defenderId: string; grenades: number }
  | { kind: "deploySmoke"; source: SmokeSource; side: Side; center: Point; radius: number }
  | { kind: "issueOrders"; unitId: string; commanderPosition?: Point }
  | { kind: "setStandingOrder"; unitId: string; order: Omit<StandingOrder, "issuedTurn"> }
  | { kind: "executeStandingOrders"; side: Side }
  | { kind: "setCamouflage"; unitId: string; on: boolean }
  | { kind: "setScouting"; unitId: string; on: boolean };

export interface GameRecording {
  /** Format version, so an old recording can be recognised and migrated. */
  version: 1;
  seed: number;
  sides: Side[];
  enforceC2: boolean;
  /**
   * Whether the game kept each side's picture of the enemy. Optional, and read
   * as **off** when absent: a recording made before the module existed was
   * played without it, and replaying it with the module on would ask the rng
   * for detection rolls that battle never made.
   */
  trackIntel?: boolean;
  actions: RecordedAction[];
  /**
   * State fingerprint after each action, written when the recording is sealed.
   * Optional: a recording without them still replays, it just cannot be
   * checked for drift. See {@link sealRecording} and {@link verifyRecording}.
   */
  digests?: string[];
}

/**
 * What an action produced when it was applied.
 *
 * Outcomes are **derived, never stored**: the recording holds decisions only,
 * and these come back out of the resolvers as replay re-applies them. That is
 * what keeps them honest — an outcome cannot disagree with the engine, because
 * the engine just computed it. It also means replaying the same decisions under
 * a different seed answers the question a debrief is for: bad plan, or bad luck?
 */
export type ActionOutcome =
  | { kind: "setup" }
  | { kind: "beginTurn"; turn: number; initiativeOrder: Side[] }
  | {
      kind: "phase";
      phase: Phase;
      resolved: IndirectFireResult[];
      smokeArrived: SmokeScreen[];
      /** What the forces in position saw on the way into the fire phase. */
      observed: Observation[];
    }
  | { kind: "uavSweep"; detection: DetectionResult }
  | { kind: "queueIndirectFire"; mission: PendingFireMission }
  | { kind: "moveUnit"; move: MoveResult }
  | { kind: "fire"; result: DirectFireResult }
  | { kind: "fireExplosive"; result: DirectExplosiveResult }
  | { kind: "assault"; result: AssaultResult }
  | { kind: "deploySmoke"; order: SmokeOrder }
  | { kind: "issueOrders"; accepted: boolean }
  | { kind: "setStandingOrder"; accepted: boolean }
  | { kind: "executeStandingOrders"; executions: StandingOrderExecution[] }
  | { kind: "setCamouflage"; on: boolean }
  | { kind: "setScouting"; on: boolean };

/** One replayed action and what it produced. */
export interface ReplayStep {
  action: RecordedAction;
  outcome: ActionOutcome;
}

/** Plain-data deep copy — a recording must not alias live game state. */
export function cloneForRecord<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Rebuild a game by replaying its recording. Actions are applied through the
 * ordinary public API, so the replayed game draws the same random numbers in
 * the same order and ends in the same state.
 *
 * Actions that were rejected when the game was played were never recorded, so
 * replay does not have to reproduce failures.
 */
export function replayGame(
  recording: GameRecording,
  opts: {
    /**
     * Stop after this many actions, for stepping through a battle in a
     * debrief. Replaying a prefix is exact for the same reason the whole
     * recording is: the actions before it drew the same random numbers.
     */
    upToAction?: number;
  } = {},
): Game {
  return replayWithOutcomes(recording, opts).game;
}

/**
 * Replay a recording and hand back what each action produced along the way —
 * hits, casualties, dispersion, detections, charges set off.
 *
 * These are not read from the recording; they come straight out of the
 * resolvers as the actions are re-applied. See {@link ActionOutcome}.
 */
export function replayWithOutcomes(
  recording: GameRecording,
  opts: {
    upToAction?: number;
    /** Called after each action is applied, for fingerprinting a replay. */
    onStep?: (game: Game, index: number) => void;
  } = {},
): { game: Game; steps: ReplayStep[] } {
  if (recording.version !== 1) {
    throw new Error(`Unsupported recording version: ${recording.version}`);
  }
  const game = new Game({
    seed: recording.seed,
    sides: recording.sides,
    enforceC2: recording.enforceC2,
    trackIntel: recording.trackIntel ?? false,
  });

  const limit = Math.max(0, Math.min(opts.upToAction ?? recording.actions.length, recording.actions.length));
  const steps: ReplayStep[] = [];

  for (const action of recording.actions.slice(0, limit)) {
    let outcome: ActionOutcome;
    switch (action.kind) {
      case "addUnit":
        game.addUnit(cloneForRecord(action.unit));
        outcome = { kind: "setup" };
        break;
      case "addMine":
        game.addMine(cloneForRecord(action.mine));
        outcome = { kind: "setup" };
        break;
      case "beginTurn": {
        const r = game.beginTurn();
        outcome = { kind: "beginTurn", turn: r.turn, initiativeOrder: r.initiativeOrder };
        break;
      }
      case "advancePhase": {
        const r = game.advancePhase();
        outcome = {
          kind: "phase",
          phase: r.phase,
          resolved: r.resolved ?? [],
          smokeArrived: r.smokeArrived ?? [],
          observed: r.observed ?? [],
        };
        break;
      }
      case "advanceToPhase": {
        const r = game.advanceToPhase(action.target);
        outcome = {
          kind: "phase",
          phase: r.phase,
          resolved: r.resolved,
          smokeArrived: r.smokeArrived,
          observed: r.observed,
        };
        break;
      }
      case "uavSweep":
        outcome = {
          kind: "uavSweep",
          detection: game.uavSweep(action.uavKey, action.footprintCenter, action.viewer),
        };
        break;
      case "queueIndirectFire":
        outcome = {
          kind: "queueIndirectFire",
          mission: game.queueIndirectFire(
            action.weaponKey,
            action.side,
            action.target,
            action.opts,
          ),
        };
        break;
      case "moveUnit":
        outcome = {
          kind: "moveUnit",
          move: game.moveUnit(action.unitId, action.to, action.mode),
        };
        break;
      case "fire":
        outcome = {
          kind: "fire",
          result: game.fire(action.attackerId, action.targetId, action.opts),
        };
        break;
      case "fireExplosive":
        outcome = {
          kind: "fireExplosive",
          result: game.fireExplosive(
            action.weaponKey,
            action.attackerId,
            action.targetId,
            action.opts,
          ),
        };
        break;
      case "assault":
        outcome = {
          kind: "assault",
          result: game.assault(action.attackerId, action.defenderId, action.grenades),
        };
        break;
      case "deploySmoke":
        outcome = {
          kind: "deploySmoke",
          order: game.deploySmoke(action.source, action.side, action.center, action.radius),
        };
        break;
      case "issueOrders":
        outcome = {
          kind: "issueOrders",
          accepted: game.issueOrders(action.unitId, action.commanderPosition),
        };
        break;
      case "setStandingOrder":
        outcome = {
          kind: "setStandingOrder",
          accepted: game.setStandingOrder(action.unitId, cloneForRecord(action.order)),
        };
        break;
      case "setCamouflage":
        game.setCamouflage(action.unitId, action.on);
        outcome = { kind: "setCamouflage", on: action.on };
        break;
      case "setScouting":
        game.setScouting(action.unitId, action.on);
        outcome = { kind: "setScouting", on: action.on };
        break;
      case "executeStandingOrders":
        outcome = {
          kind: "executeStandingOrders",
          executions: game.executeStandingOrders(action.side),
        };
        break;
      default: {
        // Exhaustiveness: a new action kind must be handled here.
        const never: never = action;
        throw new Error(`Unknown recorded action: ${JSON.stringify(never)}`);
      }
    }
    steps.push({ action, outcome });
    opts.onStep?.(game, steps.length - 1);
  }
  return { game, steps };
}

/**
 * Stamp a recording with the state fingerprint after each action, so a later
 * replay can tell whether it still produces the same battle.
 *
 * The digests are taken from a replay rather than from the live game, which
 * doubles as a check that the recording round-trips at the moment it is saved.
 */
export function sealRecording(recording: GameRecording): GameRecording {
  const digests: string[] = [];
  replayWithOutcomes(recording, {
    onStep: (game, index) => {
      digests[index] = stateDigest(game);
    },
  });
  return { ...cloneForRecord(recording), digests };
}

export interface RecordingVerification {
  /** False when the recording carries no digests — nothing to check against. */
  checked: boolean;
  /** True when every action still produces the state it did when sealed. */
  ok: boolean;
  /** Where the battle first diverges from the one that was recorded. */
  firstDivergence?: {
    index: number;
    action: RecordedAction;
    expected: string;
    actual: string;
  };
}

/**
 * Replay a sealed recording and check it still plays out the way it did.
 *
 * A mismatch does not mean the recording is corrupt — far more likely the
 * rules changed under it, which is exactly what this is for. The decisions
 * still replay; it is the outcomes that have moved. Reporting the *first*
 * divergent action points straight at what the change affected.
 */
export function verifyRecording(recording: GameRecording): RecordingVerification {
  const expected = recording.digests;
  if (!expected?.length) return { checked: false, ok: true };

  let firstDivergence: RecordingVerification["firstDivergence"];
  let applied = 0;
  try {
    replayWithOutcomes(recording, {
      onStep: (game, index) => {
        applied = index + 1;
        if (firstDivergence) return;
        const actual = stateDigest(game);
        const want = expected[index];
        if (want !== undefined && want !== actual) {
          firstDivergence = {
            index,
            action: recording.actions[index]!,
            expected: want,
            actual,
          };
        }
      },
    });
  } catch (err) {
    // A rules change can make a recorded action outright illegal — a move that
    // is now out of budget, an order the C2 table no longer allows. That is
    // drift too, at the action replay stopped on.
    firstDivergence ??= {
      index: applied,
      action: recording.actions[applied]!,
      expected: expected[applied] ?? "",
      actual: `rejected: ${(err as Error).message}`,
    };
  }

  return firstDivergence
    ? { checked: true, ok: false, firstDivergence }
    : { checked: true, ok: true };
}
