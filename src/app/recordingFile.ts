import { replayGame, verifyRecording, type GameRecording } from "../engine/index.js";

/**
 * Read a saved battle for the debrief: from the game's header and from the
 * scenario picker alike, so the two cannot come to disagree about what is a
 * recording.
 *
 * Throws on a file that is not one — it is replayed to its first action here
 * rather than failing halfway through the debrief. A recording made under
 * other rules still loads; `divergesAt` says where it stops matching, and the
 * debrief says so itself.
 */
export async function readRecording(
  file: File,
): Promise<{ recording: GameRecording; divergesAt: number | null }> {
  const recording = JSON.parse(await file.text()) as GameRecording;
  replayGame(recording, { upToAction: 0 });
  const check = verifyRecording(recording);
  const divergesAt = check.checked && !check.ok ? (check.firstDivergence?.index ?? 0) : null;
  return { recording, divergesAt };
}
