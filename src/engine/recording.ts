import type { Fuze } from "./data/explosives.js";
import type { Point } from "./geometry.js";
import type {
  Echelon,
  Mine,
  MovementMode,
  ObservationSector,
  PendingFireMission,
  Side,
  SmokeScreen,
  Unit,
} from "./types.js";
import type { SmokeSource } from "./data/smoke.js";
import type {
  DirectFireOptions,
  DirectFireResult,
  WeaponClass,
} from "./combat/directFire.js";
import type { DirectExplosiveResult } from "./combat/explosives.js";
import type { IndirectFireResult } from "./combat/indirectFire.js";
import type { AssaultResult } from "./combat/assault.js";
import type { DetectionResult, Observation } from "./combat/detection.js";
import {
  Game,
  type ChargeWorkReport,
  type MoveResult,
  type Phase,
  type RegisteredTarget,
  type FireAllotment,
  type FireMethod,
  type FireMission,
  type SmokeOrder,
  type WithCoveringFire,
} from "./game.js";
import { stateDigest } from "./digest.js";
import type { MoraleReport } from "./morale.js";
import type { RuleVariants } from "./data/variants.js";
import type { StandingOrder, StandingOrderExecution } from "./orders.js";
import type { MapLineKind, Terrain } from "./terrain.js";
import { OBJECT_HEIGHT_M } from "./data/terrain.js";

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
      opts: { firingFrom?: Point; observedByUav?: boolean; rounds?: number; fuze?: Fuze };
    }
  | {
      kind: "callForFire";
      weaponKey: string;
      side: Side;
      target: Point;
      /** `roundsForEffect` is absent only from a recording made before decision 36. */
      opts: { firingFrom?: Point; fuze?: Fuze; observedByUav?: boolean; method?: FireMethod; roundsForEffect?: number };
    }
  | { kind: "checkFire"; side: Side }
  // Mission planning, before the first turn (rules decision 38).
  | { kind: "registerTarget"; side: Side; weapon: string; at: Point }
  | { kind: "designateObservationPost"; unitId: string }
  | { kind: "prepareAlternatePosition"; unitId: string; at: Point }
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
  /** Null calls the work off; the charge itself is derived, not recorded. */
  | { kind: "layCharge"; unitId: string; type: Mine["type"] | null }
  /** חיפוי: the shots it goes on to take are derived by the replay. */
  | { kind: "setCovering"; unitId: string; on: boolean; weapon: WeaponClass }
  | { kind: "setScouting"; unitId: string; on: boolean }
  | {
      kind: "setObservationSector";
      unitId: string;
      /** Null releases the force to watch all round. */
      sector: ObservationSector | null;
    };

/**
 * Why a file could not be taken as a recording at all — before any action in
 * it is replayed. Kept as data rather than as a sentence so the app can say it
 * in the player's language; the `message` is for whoever reads a stack trace.
 */
export type RecordingProblem =
  /** Saved by a format this engine does not read. */
  | { kind: "unsupportedVersion"; version: number }
  /** Not shaped like a recording: `field` is missing or of the wrong type. */
  | { kind: "malformed"; field: string }
  /**
   * The ground it carries is damaged: `field` is the path to the first bad
   * value (`terrain.objects[3].footprint`). Checked at load because nothing
   * else reads the whole of it until the debrief draws it.
   */
  | { kind: "malformedTerrain"; field: string };

export class RecordingError extends Error {
  constructor(readonly problem: RecordingProblem) {
    super(
      problem.kind === "unsupportedVersion"
        ? `Unsupported recording version: ${problem.version}`
        : problem.kind === "malformed"
          ? `Not a recording: ${problem.field} is missing or malformed`
          : `The recording's ground is damaged at ${problem.field}`,
    );
  }
}

/**
 * What a fire mission fired for effect before rules decision 36 split the
 * default by weapon. A recording from then carries no number, in its
 * allotments or its calls for fire, and fired this.
 */
const LEGACY_ROUNDS_FOR_EFFECT = 6;

/**
 * Whether a recording was made before rules decision 36: it lacks the
 * decision 37 flag, which every later game writes while the rule is on, and
 * it is on by default. An allotment's own number says nothing either way —
 * one could be set before the decision too — and `withLegacyRounds` fills in
 * only the ones that are missing. What it misreads is a later game played
 * with the rule switched off, which only the harness plays and none is saved
 * from.
 */
function madeBeforeDecision36(recording: GameRecording): boolean {
  return recording.fireSupportByEchelon === undefined;
}

/** Allotments from a recording, with the number a pre-decision-36 one was played with. */
function withLegacyRounds(fireSupport: Partial<Record<Side, FireAllotment[]>>): Partial<Record<Side, FireAllotment[]>> {
  for (const list of Object.values(fireSupport)) {
    if (!Array.isArray(list)) continue;
    for (const a of list) if (a && a.roundsForEffect === undefined) a.roundsForEffect = LEGACY_ROUNDS_FOR_EFFECT;
  }
  return fireSupport;
}

/**
 * The header of a recording, checked before a game is built from it: anything
 * that parses as JSON reaches here, and a field of the wrong type would
 * otherwise surface as a TypeError from deep inside `Game`.
 */
function checkRecording(recording: unknown): asserts recording is GameRecording {
  const r = recording as Partial<Record<keyof GameRecording, unknown>> | null;
  const malformed = (field: string) => new RecordingError({ kind: "malformed", field });
  if (typeof r !== "object" || r === null || Array.isArray(r)) throw malformed("recording");
  // The version first: a newer format may be shaped differently, and saying
  // so is more use than naming the first field it moved.
  if (typeof r.version !== "number") throw malformed("version");
  if (r.version !== 1) throw new RecordingError({ kind: "unsupportedVersion", version: r.version });
  if (typeof r.seed !== "number" || !Number.isFinite(r.seed)) throw malformed("seed");
  if (!Array.isArray(r.sides) || !r.sides.every((s) => s === "RED" || s === "BLUE")) throw malformed("sides");
  if (typeof r.enforceC2 !== "boolean") throw malformed("enforceC2");
  if (r.trackIntel !== undefined && typeof r.trackIntel !== "boolean") throw malformed("trackIntel");
  if (r.morale !== undefined && typeof r.morale !== "boolean") throw malformed("morale");
  if (r.registeredTargets !== undefined && !Array.isArray(r.registeredTargets)) throw malformed("registeredTargets");
  if (r.fireSupport !== undefined && (typeof r.fireSupport !== "object" || r.fireSupport === null || Array.isArray(r.fireSupport))) {
    throw malformed("fireSupport");
  }
  if (r.commandEchelon !== undefined && (typeof r.commandEchelon !== "object" || r.commandEchelon === null || Array.isArray(r.commandEchelon))) {
    throw malformed("commandEchelon");
  }
  if (r.fireSupportByEchelon !== undefined && typeof r.fireSupportByEchelon !== "boolean") throw malformed("fireSupportByEchelon");
  if (r.variants !== undefined && (typeof r.variants !== "object" || r.variants === null || Array.isArray(r.variants))) {
    throw malformed("variants");
  }
  if (r.terrain !== undefined) {
    const field = terrainFault(r.terrain);
    if (field) throw new RecordingError({ kind: "malformedTerrain", field });
  }
  if (!Array.isArray(r.actions)) throw malformed("actions");
}

/** Every kind of line a map may draw — a `Record` so a new kind cannot be missed. */
const LINE_KINDS: Record<MapLineKind, true> = { motorway: true, street: true, track: true, path: true };

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isPoint = (v: unknown): boolean => {
  const p = v as { x?: unknown; y?: unknown } | null;
  return typeof p === "object" && p !== null && isFiniteNumber(p.x) && isFiniteNumber(p.y);
};

/**
 * The path to the first value in a recording's ground that the engine or the
 * map could not use, or null for sound ground. Everything the sight rule and
 * the debrief read is checked — the grid against its own size, since a short
 * `heights` would read as sea level rather than fail — and nothing more, so a
 * recording saved with a field this engine does not know still loads.
 */
function terrainFault(terrain: unknown): string | null {
  const t = terrain as Partial<Record<keyof Terrain, unknown>> | null;
  if (typeof t !== "object" || t === null || Array.isArray(t)) return "terrain";

  if (t.heightfield !== undefined) {
    const at = "terrain.heightfield";
    const hf = t.heightfield as Partial<Record<string, unknown>> | null;
    if (typeof hf !== "object" || hf === null) return at;
    if (hf.origin !== undefined && !isPoint(hf.origin)) return `${at}.origin`;
    if (!isFiniteNumber(hf.spacing) || hf.spacing <= 0) return `${at}.spacing`;
    for (const side of ["columns", "rows"] as const) {
      const n = hf[side];
      if (!isFiniteNumber(n) || !Number.isInteger(n) || n < 1) return `${at}.${side}`;
    }
    const cells = (hf.columns as number) * (hf.rows as number);
    if (!Array.isArray(hf.heights) || hf.heights.length !== cells || !hf.heights.every(isFiniteNumber)) {
      return `${at}.heights`;
    }
  }

  if (!Array.isArray(t.objects)) return "terrain.objects";
  for (const [i, o] of (t.objects as unknown[]).entries()) {
    const at = `terrain.objects[${i}]`;
    const obj = o as Partial<Record<string, unknown>> | null;
    if (typeof obj !== "object" || obj === null) return at;
    if (typeof obj.id !== "string") return `${at}.id`;
    if (typeof obj.kind !== "string" || !Object.hasOwn(OBJECT_HEIGHT_M, obj.kind)) return `${at}.kind`;
    if (obj.height !== undefined && (!isFiniteNumber(obj.height) || obj.height < 0)) return `${at}.height`;
    const f = obj.footprint as Partial<Record<string, unknown>> | null;
    const round = f?.shape === "circle" && isPoint(f.center) && isFiniteNumber(f.radius) && f.radius >= 0;
    const drawn =
      f?.shape === "polygon" && Array.isArray(f.points) && f.points.length >= 3 && f.points.every(isPoint);
    if (!round && !drawn) return `${at}.footprint`;
  }

  if (t.roads !== undefined) {
    if (!Array.isArray(t.roads)) return "terrain.roads";
    for (const [i, r] of (t.roads as unknown[]).entries()) {
      const at = `terrain.roads[${i}]`;
      const line = r as Partial<Record<string, unknown>> | null;
      if (typeof line !== "object" || line === null) return at;
      if (typeof line.id !== "string") return `${at}.id`;
      if (typeof line.kind !== "string" || !Object.hasOwn(LINE_KINDS, line.kind)) return `${at}.kind`;
      if (!isFiniteNumber(line.width) || line.width < 0) return `${at}.width`;
      if (!Array.isArray(line.points) || line.points.length < 2 || !line.points.every(isPoint)) {
        return `${at}.points`;
      }
    }
  }
  return null;
}

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
  /**
   * Whether the game was played with morale (rules decision 19). Optional, and
   * read as **off** when absent, for the same reason as `trackIntel`: a battle
   * recorded before morale existed made none of its rolls.
   */
  morale?: boolean;
  /**
   * Rule variants on trial (data/variants.ts). Optional, and read as **none**
   * when absent: the rules as they stood.
   */
  variants?: RuleVariants;
  /**
   * Targets registered before the battle (rules decision 32). Optional, and
   * read as **none** when absent.
   */
  registeredTargets?: RegisteredTarget[];
  /** The fire missions each side was assigned (rules decision 34). Absent: none rationed. */
  fireSupport?: Partial<Record<Side, FireAllotment[]>>;
  /** The echelon each side was declared to command (rules decision 37). Absent: read off its forces. */
  commandEchelon?: Partial<Record<Side, Echelon>>;
  /**
   * Whether who may call a weapon depended on the echelon (rules decision 37).
   * Read as **off** when absent: a battle recorded before the rule called
   * whatever it liked, and still replays.
   */
  fireSupportByEchelon?: boolean;
  /**
   * The ground the battle was fought on (rules decision 15). Optional, and
   * read as **flat and empty** when absent: a recording made before the map
   * had ground was played with every sight line clear.
   */
  terrain?: Terrain;
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
      /**
       * Charge-laying work that finished or was lost as the turn closed
       * (rules decision 16). Optional: a step that crossed no end of turn
       * carries none, and a recording replayed before the module existed
       * produces none either.
       */
      chargeWork?: ChargeWorkReport[];
      /**
       * What morale did as the turn closed (rules decision 19): men broken,
       * heroes, rallies, routs, surrenders. Optional for the same reason.
       */
      morale?: MoraleReport[];
    }
  | { kind: "uavSweep"; detection: DetectionResult }
  | { kind: "queueIndirectFire"; mission: PendingFireMission }
  | { kind: "callForFire"; mission: FireMission }
  | { kind: "checkFire" }
  | { kind: "moveUnit"; move: MoveResult }
  | { kind: "fire"; result: WithCoveringFire<DirectFireResult> }
  | { kind: "fireExplosive"; result: WithCoveringFire<DirectExplosiveResult> }
  | { kind: "assault"; result: WithCoveringFire<AssaultResult> }
  | { kind: "deploySmoke"; order: SmokeOrder }
  | { kind: "issueOrders"; accepted: boolean }
  | { kind: "setStandingOrder"; accepted: boolean }
  | { kind: "executeStandingOrders"; executions: StandingOrderExecution[] }
  | { kind: "setCamouflage"; on: boolean }
  | { kind: "layCharge"; type: Mine["type"] | null }
  | { kind: "setCovering"; on: boolean; weapon: WeaponClass }
  | { kind: "setScouting"; on: boolean }
  | { kind: "setObservationSector"; sector: ObservationSector | null };

/** A decision the replay could not carry out, and why. */
export interface SkippedAction {
  /** Position in the recording's action list. */
  index: number;
  action: RecordedAction;
  reason: string;
}

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
    /** Re-fight the same decisions under other dice — see {@link replayWithOutcomes}. */
    seed?: number;
    skipRejected?: boolean;
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
    /**
     * Replay the same decisions under a **different seed**. The recording holds
     * what was decided, not what it produced, so this asks the question a
     * debrief is for: was that a bad plan, or bad luck?
     */
    seed?: number;
    /**
     * Carry on past a decision this history has made impossible instead of
     * stopping on it — a bound now out of budget because the force was slowed
     * differently, a shot at a force already gone. Required for a re-roll,
     * where the alternate battle drifts away from the recorded one; the skipped
     * decisions come back in `skipped`, because a run that dropped half the
     * plan is no longer a fair comparison and the reader must be told.
     */
    skipRejected?: boolean;
  } = {},
): { game: Game; steps: ReplayStep[]; skipped: SkippedAction[] } {
  checkRecording(recording);
  const pre36 = madeBeforeDecision36(recording);
  const game = new Game({
    seed: opts.seed ?? recording.seed,
    sides: recording.sides,
    enforceC2: recording.enforceC2,
    trackIntel: recording.trackIntel ?? false,
    morale: recording.morale ?? false,
    ...(recording.variants ? { variants: cloneForRecord(recording.variants) } : {}),
    ...(recording.registeredTargets ? { registeredTargets: cloneForRecord(recording.registeredTargets) } : {}),
    ...(recording.fireSupport
      ? { fireSupport: pre36 ? withLegacyRounds(cloneForRecord(recording.fireSupport)) : cloneForRecord(recording.fireSupport) }
      : {}),
    ...(recording.commandEchelon ? { commandEchelon: { ...recording.commandEchelon } } : {}),
    fireSupportByEchelon: recording.fireSupportByEchelon ?? false,
    ...(recording.terrain ? { terrain: cloneForRecord(recording.terrain) } : {}),
  });

  const limit = Math.max(0, Math.min(opts.upToAction ?? recording.actions.length, recording.actions.length));
  const steps: ReplayStep[] = [];
  const skipped: SkippedAction[] = [];

  let index = -1;
  for (const action of recording.actions.slice(0, limit)) {
    index += 1;
    let outcome: ActionOutcome | undefined;
    try {
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
          chargeWork: r.chargeWork ?? [],
          ...(r.morale ? { morale: r.morale } : {}),
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
          chargeWork: r.chargeWork ?? [],
          ...(game.morale ? { morale: r.morale } : {}),
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
      case "callForFire":
        outcome = {
          kind: "callForFire",
          // As it stood when called: the live mission goes on changing.
          mission: cloneForRecord(
            (() => {
              const { roundsForEffect, ...opts } = action.opts;
              if (roundsForEffect !== undefined) {
                return game.replayCallForFire(action.side, action.weaponKey, action.target, opts, roundsForEffect);
              }
              // No number journalled: made before the call carried one.
              // Before decision 36 that is the allotment's or 6; between it
              // and the journalling, the allotment's or the weapon's default.
              return pre36
                ? game.replayCallForFire(
                    action.side, action.weaponKey, action.target, opts,
                    game.fireSupport[action.side]?.find((a) => a.weapon === action.weaponKey)?.roundsForEffect ??
                      LEGACY_ROUNDS_FOR_EFFECT,
                  )
                : game.callForFire(action.side, action.weaponKey, action.target, opts);
            })(),
          ),
        };
        break;
      case "checkFire":
        game.checkFire(action.side);
        outcome = { kind: "checkFire" };
        break;
      case "registerTarget":
        game.registerTarget(action.side, action.weapon, action.at);
        outcome = { kind: "setup" };
        break;
      case "designateObservationPost":
        game.designateObservationPost(action.unitId);
        outcome = { kind: "setup" };
        break;
      case "prepareAlternatePosition":
        game.prepareAlternatePosition(action.unitId, action.at);
        outcome = { kind: "setup" };
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
      case "layCharge":
        game.layCharge(action.unitId, action.type);
        outcome = { kind: "layCharge", type: action.type };
        break;
      case "setCovering":
        game.setCovering(action.unitId, action.on, action.weapon);
        outcome = { kind: "setCovering", on: action.on, weapon: action.weapon };
        break;
      case "setObservationSector":
        game.setObservationSector(action.unitId, cloneForRecord(action.sector));
        outcome = { kind: "setObservationSector", sector: action.sector };
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
    } catch (err) {
      if (!opts.skipRejected) throw err;
      skipped.push({ index, action, reason: (err as Error).message });
      continue;
    }
    if (!outcome) continue;
    steps.push({ action, outcome });
    opts.onStep?.(game, steps.length - 1);
  }
  return { game, steps, skipped };
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
