import {
  RecordingError,
  replayGame,
  verifyRecording,
  type GameRecording,
  type RecordingProblem,
} from "../engine/index.js";

/**
 * Why a file could not be opened for review, as data: `recordingLoadFailed`
 * in `debriefText.ts` says it in Hebrew. The engine's own problems, plus the
 * two that happen before the engine sees the file.
 */
export type LoadProblem =
  | RecordingProblem
  /** Not JSON at all — a file picked by mistake. */
  | { kind: "notJson" }
  /** Shaped like a recording, and the engine still could not set it up. */
  | { kind: "unreadable" };

export class RecordingLoadError extends Error {
  constructor(
    readonly problem: LoadProblem,
    /** The underlying error, for a console rather than a player. */
    cause?: unknown,
  ) {
    super(problem.kind, { cause });
  }
}

/**
 * Read a saved battle for the debrief: from the game's header and from the
 * scenario picker alike, so the two cannot come to disagree about what is a
 * recording.
 *
 * Throws a `RecordingLoadError` on a file that is not one — it is replayed to
 * its first action here rather than failing halfway through the debrief. A
 * recording made under other rules still loads; `divergesAt` says where it
 * stops matching, and the debrief says so itself.
 */
export async function readRecording(
  file: File,
): Promise<{ recording: GameRecording; divergesAt: number | null }> {
  let recording: GameRecording;
  try {
    recording = JSON.parse(await file.text()) as GameRecording;
  } catch (err) {
    throw new RecordingLoadError({ kind: "notJson" }, err);
  }
  try {
    replayGame(recording, { upToAction: 0 });
  } catch (err) {
    throw new RecordingLoadError(err instanceof RecordingError ? err.problem : { kind: "unreadable" }, err);
  }
  const check = verifyRecording(recording);
  const divergesAt = check.checked && !check.ok ? (check.firstDivergence?.index ?? 0) : null;
  return { recording, divergesAt };
}
