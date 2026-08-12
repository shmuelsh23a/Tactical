import type { Point } from "./geometry.js";
import type { Mine, MovementMode, Side, Unit } from "./types.js";
import type { SmokeSource } from "./data/smoke.js";
import type { DirectFireOptions } from "./combat/directFire.js";
import { Game, type Phase } from "./game.js";

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
  | { kind: "issueOrders"; unitId: string; commanderPosition?: Point };

export interface GameRecording {
  /** Format version, so an old recording can be recognised and migrated. */
  version: 1;
  seed: number;
  sides: Side[];
  enforceC2: boolean;
  actions: RecordedAction[];
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
  if (recording.version !== 1) {
    throw new Error(`Unsupported recording version: ${recording.version}`);
  }
  const game = new Game({
    seed: recording.seed,
    sides: recording.sides,
    enforceC2: recording.enforceC2,
  });

  const limit = Math.max(0, Math.min(opts.upToAction ?? recording.actions.length, recording.actions.length));
  for (const action of recording.actions.slice(0, limit)) {
    switch (action.kind) {
      case "addUnit":
        game.addUnit(cloneForRecord(action.unit));
        break;
      case "addMine":
        game.addMine(cloneForRecord(action.mine));
        break;
      case "beginTurn":
        game.beginTurn();
        break;
      case "advancePhase":
        game.advancePhase();
        break;
      case "advanceToPhase":
        game.advanceToPhase(action.target);
        break;
      case "uavSweep":
        game.uavSweep(action.uavKey, action.footprintCenter, action.viewer);
        break;
      case "queueIndirectFire":
        game.queueIndirectFire(action.weaponKey, action.side, action.target, action.opts);
        break;
      case "moveUnit":
        game.moveUnit(action.unitId, action.to, action.mode);
        break;
      case "fire":
        game.fire(action.attackerId, action.targetId, action.opts);
        break;
      case "fireExplosive":
        game.fireExplosive(
          action.weaponKey,
          action.attackerId,
          action.targetId,
          action.opts,
        );
        break;
      case "assault":
        game.assault(action.attackerId, action.defenderId, action.grenades);
        break;
      case "deploySmoke":
        game.deploySmoke(action.source, action.side, action.center, action.radius);
        break;
      case "issueOrders":
        game.issueOrders(action.unitId, action.commanderPosition);
        break;
      default: {
        // Exhaustiveness: a new action kind must be handled here.
        const never: never = action;
        throw new Error(`Unknown recorded action: ${JSON.stringify(never)}`);
      }
    }
  }
  return game;
}
