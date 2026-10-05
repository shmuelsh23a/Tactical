import type { GameRecording, Side } from "../engine/index.js";
import type { ComputerSnapshot } from "./computerSide.js";
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
  ui: SessionUi;
  /** Single-player: the computer's side and memory. Absent in hotseat. */
  computer?: ComputerSnapshot;
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
export type SessionProblem = "notJson" | "notASession" | "newerVersion";

export class SessionError extends Error {
  constructor(readonly problem: SessionProblem) {
    super(problem);
  }
}

const SIDE_SET: ReadonlySet<string> = new Set<Side>(["RED", "BLUE"]);
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isStringArray = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === "string");

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
  const ok =
    typeof raw.scenarioId === "string" &&
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
    Number.isInteger(ui.planningIndex) &&
    typeof ui.planned === "boolean" &&
    Array.isArray(ui.log) &&
    ui.log.every(
      (e: unknown) =>
        isObject(e) &&
        typeof e.id === "number" &&
        typeof e.turn === "number" &&
        typeof e.text === "string" &&
        isStringArray(e.readers) &&
        (e.readers as string[]).every((s) => SIDE_SET.has(s)),
    ) &&
    isObject(ui.missionsUsed) &&
    Object.values(ui.missionsUsed).every((n) => typeof n === "number") &&
    isStringArray(ui.reported) &&
    isStringArray(ui.toldDown) &&
    (raw.computer === undefined || (isObject(raw.computer) && SIDE_SET.has(raw.computer.side as string)));
  if (!ok) throw new SessionError("notASession");
  return raw as unknown as Session;
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

/** Keep the battle in progress. A full or blocked storage loses the save, never the game. */
export function storeSession(session: Session): void {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Private browsing, quota: the battle goes on unsaved.
  }
}

export function clearStoredSession(): void {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing to clear, or nowhere to clear it from.
  }
}
