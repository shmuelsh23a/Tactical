import { replayGame, stateDigest, type Game, type GameRecording, type Side } from "../engine/index.js";
import { ComputerAttacker, ComputerDefender, type AttackerSnapshot, type ComputerSnapshot } from "./computerSide.js";
import type { PlatoonTask } from "./company.js";
import type { Activation, LogEntry } from "./hotseat.js";

/**
 * A battle in progress, saved so it can be picked up again (the business
 * plan's "save and resume at any moment, including mid-turn"). The engine's
 * state is the recording — `replayGame` rebuilds it exactly, rng and all —
 * so what is kept beside it is only what the screen and the computer carry
 * that the engine does not: where play stands in the turn, the live log as
 * each side may read it, the screen's small memories, and the computer's
 * drill.
 */
export interface Session {
  format: typeof SESSION_FORMAT;
  version: typeof SESSION_VERSION;
  /** The picker's id (`ScenarioListing.id`): the ground's extent and title come from it. */
  scenarioId: string;
  recording: GameRecording;
  /**
   * The game's state fingerprint when it was saved (`stateDigest`). A battle
   * replayed under rules that have changed since can come out different
   * without failing; this is how a resume notices, rather than putting the
   * saved log and turn over a battle that no longer exists.
   */
  digest: string;
  ui: SessionUi;
  /** Single-player, the computer holding: its side and memory. Absent otherwise. */
  computer?: ComputerSnapshot;
  /**
   * Single-player, the computer attacking: its side, its brief and its
   * memory. Absent otherwise. A battle has at most one of the two — the
   * computer plays one side — and neither in hotseat.
   */
  computerAttacker?: AttackerSnapshot;
}

export interface SessionUi {
  stage: "planning" | "initiative" | "activation";
  activations: Activation[];
  actIndex: number;
  planningIndex: number;
  planned: boolean;
  log: LogEntry[];
  /** One fire mission and one smoke screen a side a turn: keys `SIDE-he` / `SIDE-smoke` to the turn spent. */
  missionsUsed: Record<string, number>;
  /** First sightings already reported, `SIDE:unitId`. */
  reported: string[];
  /** Forces already announced as out of the fight. */
  toldDown: string[];
}

export const SESSION_FORMAT = "tactical-session";
export const SESSION_VERSION = 1;

/** Where the browser keeps the one battle in progress. */
export const SESSION_KEY = "tactical.session";

/** Why a saved battle could not be resumed, as data (worded in `debriefText.ts`). */
export type SessionProblem =
  | "notJson"
  | "notASession"
  | "newerVersion"
  /** It reads, but the game no longer replays to where it was saved: the rules have changed since. */
  | "doesNotReplay";

export class SessionError extends Error {
  constructor(readonly problem: SessionProblem) {
    super(problem);
  }
}

const SIDE_SET: ReadonlySet<string> = new Set<Side>(["RED", "BLUE"]);
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isStringArray = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === "string");
const isPoint = (x: unknown): boolean => isObject(x) && Number.isFinite(x.x) && Number.isFinite(x.y);
/** An array of `[id, value]` pairs, each value passing `value`. */
const isPairs = (x: unknown, value: (v: unknown) => boolean): boolean =>
  Array.isArray(x) && x.every((e) => Array.isArray(e) && e.length === 2 && typeof e[0] === "string" && value(e[1]));
const isCount = (v: unknown): boolean => Number.isFinite(v);

/** The computer's memory, every field the restore reads (`ComputerDefender.restore`, `DrillState.restore`). */
function isComputerSnapshot(c: unknown): boolean {
  if (!isObject(c) || !SIDE_SET.has(c.side as string) || !isPoint(c.objective)) return false;
  if (!isStringArray(c.reserves) || !Array.isArray(c.targets) || !c.targets.every(isPoint)) return false;
  return isDrillSnapshot(c.drill);
}

/** The drill's memory, every field `DrillState.restore` reads. */
function isDrillSnapshot(d: unknown): boolean {
  return (
    isObject(d) &&
    isPairs(d.strength, isCount) &&
    isStringArray(d.fellBack) &&
    isStringArray(d.displaced) &&
    isPairs(d.watched, isCount) &&
    isPairs(d.arrivedOn, isCount) &&
    isStringArray(d.passedVia) &&
    isPairs(d.posts, isPoint) &&
    isPairs(d.counterattacking, isPoint) &&
    isPairs(d.levelWaits, (v) => isObject(v) && isCount(v.turn) && isCount(v.count))
  );
}
/** The attacking computer's memory, every field its restore reads (`ComputerAttacker.restore`). */
function isAttackerSnapshot(c: unknown): boolean {
  if (!isObject(c) || !SIDE_SET.has(c.side as string) || !isPoint(c.objective)) return false;
  const f = c.fire;
  if (!isObject(f) || !isCount(f.missions) || !isCount(f.smoke)) return false;
  return isCompanySnapshot(c.company) && isDrillSnapshot(c.drill);
}

/** The company commander's memory, every field `ScriptedCompany.restoreFrom` reads. */
function isCompanySnapshot(c: unknown): boolean {
  return (
    isObject(c) &&
    isPairs(c.scouts, (v) => v === null || isPoint(v)) &&
    isPairs(c.waitAt, isPoint) &&
    isPairs(c.tasks, (v) => PLATOON_TASKS.has(v as string)) &&
    isPoint(c.home) &&
    isCount(c.lookedTurns) &&
    typeof c.support === "boolean" &&
    typeof c.bounding === "boolean" &&
    typeof c.holdingShort === "boolean" &&
    typeof c.firesLifted === "boolean" &&
    typeof c.movedUp === "boolean" &&
    (c.via === undefined || isPoint(c.via)) &&
    (c.released === undefined || isCount(c.released))
  );
}
const PLATOON_TASKS: ReadonlySet<string> = new Set<PlatoonTask>(["assault", "support", "reserve", "halt", "withdraw"]);
const KINDS: ReadonlySet<string> = new Set(["info", "move", "fire", "casualty", "phase"]);

/**
 * Read a saved battle. It is untrusted input like any file (business plan,
 * *User-generated content*), so its shape is checked before anything is
 * built from it; the recording itself is checked by the engine when it is
 * replayed.
 */
export function parseSession(text: string): Session {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SessionError("notJson");
  }
  if (!isObject(raw) || raw.format !== SESSION_FORMAT) throw new SessionError("notASession");
  if (typeof raw.version !== "number") throw new SessionError("notASession");
  if (raw.version > SESSION_VERSION) throw new SessionError("newerVersion");
  const ui = raw.ui;
  const acts = isObject(ui) && Array.isArray(ui.activations) ? ui.activations.length : 0;
  const ok =
    typeof raw.scenarioId === "string" &&
    typeof raw.digest === "string" &&
    isObject(raw.recording) &&
    Array.isArray((raw.recording as Record<string, unknown>).actions) &&
    isObject(ui) &&
    (ui.stage === "planning" || ui.stage === "initiative" || ui.stage === "activation") &&
    Array.isArray(ui.activations) &&
    ui.activations.every(
      (a: unknown) =>
        isObject(a) &&
        SIDE_SET.has(a.side as string) &&
        (a.phase === "targeting" || a.phase === "movement" || a.phase === "combat"),
    ) &&
    Number.isInteger(ui.actIndex) &&
    (ui.actIndex as number) >= 0 &&
    // An activation to be in, when the save was made in one.
    (ui.stage !== "activation" || (ui.actIndex as number) < acts) &&
    (ui.stage !== "initiative" || acts > 0) &&
    (ui.planningIndex === 0 || ui.planningIndex === 1) &&
    typeof ui.planned === "boolean" &&
    Array.isArray(ui.log) &&
    ui.log.every(
      (e: unknown) =>
        isObject(e) &&
        typeof e.id === "number" &&
        typeof e.turn === "number" &&
        typeof e.text === "string" &&
        KINDS.has(e.kind as string) &&
        (e.side === undefined || SIDE_SET.has(e.side as string)) &&
        isStringArray(e.readers) &&
        (e.readers as string[]).every((s) => SIDE_SET.has(s)),
    ) &&
    isObject(ui.missionsUsed) &&
    Object.values(ui.missionsUsed).every((n) => typeof n === "number") &&
    isStringArray(ui.reported) &&
    isStringArray(ui.toldDown) &&
    (raw.computer === undefined || isComputerSnapshot(raw.computer)) &&
    (raw.computerAttacker === undefined || isAttackerSnapshot(raw.computerAttacker)) &&
    // The computer plays one side: a save naming both is not one of ours.
    !(raw.computer !== undefined && raw.computerAttacker !== undefined);
  if (!ok) throw new SessionError("notASession");
  return raw as unknown as Session;
}

/** A saved battle rebuilt: its game replayed from the recording, and its computer, if it had one. */
export interface ResumedBattle {
  session: Session;
  game: Game;
  /** The computer, whichever side it plays; null in hotseat. */
  ai: ComputerDefender | ComputerAttacker | null;
}

/**
 * Rebuild a saved battle, and refuse it rather than resume something else:
 * a recording that will not replay under today's rules, or replays to a
 * state other than the one saved (`digest`), is a battle that no longer
 * exists. Done once, when the save is picked up — never in the render, where
 * a throw would blank the page on every reload.
 */
export function resumeBattle(session: Session, ground: { mapWidth: number; mapHeight: number }): ResumedBattle {
  let game: Game;
  let ai: ComputerDefender | ComputerAttacker | null;
  try {
    game = replayGame(session.recording);
    ai = session.computer
      ? ComputerDefender.restore(game, session.computer, ground)
      : session.computerAttacker
        ? ComputerAttacker.restore(game, session.computerAttacker, ground)
        : null;
  } catch {
    throw new SessionError("doesNotReplay");
  }
  if (stateDigest(game) !== session.digest) throw new SessionError("doesNotReplay");
  return { session, game, ai };
}

/** The browser's saved battle, if there is one it can read; a broken one is dropped. */
export function loadStoredSession(): Session | null {
  try {
    const text = window.localStorage.getItem(SESSION_KEY);
    return text ? parseSession(text) : null;
  } catch {
    return null;
  }
}

/** Keep the battle in progress; false when it could not be kept. A full or blocked storage loses the save, never the game. */
export function storeSession(session: Session): boolean {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return true;
  } catch {
    // Private browsing, quota: the battle goes on unsaved.
    return false;
  }
}

export function clearStoredSession(): void {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing to clear, or nowhere to clear it from.
  }
}
