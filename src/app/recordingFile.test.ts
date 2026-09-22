import { describe, it, expect } from "vitest";
import { sealRecording } from "../engine/index.js";
import { recordingLoadFailed } from "./debriefText.js";
import { readRecording, RecordingLoadError, type LoadProblem } from "./recordingFile.js";
import { buildDemoScenario } from "./scenario.js";

const asFile = (text: string) => new File([text], "battle.json", { type: "application/json" });

describe("reading a saved battle", () => {
  const { game } = buildDemoScenario();
  game.beginTurn();
  const sealed = sealRecording(game.toRecording());

  it("reads back what the game saved, as matching the rules", async () => {
    const { recording, divergesAt } = await readRecording(asFile(JSON.stringify(sealed)));
    expect(recording.actions.length).toBe(sealed.actions.length);
    expect(divergesAt).toBeNull();
  });

  it("still opens a recording the rules have moved under, and says where", async () => {
    // Another seed is the cheapest way to make every fingerprint disagree.
    const moved = { ...sealed, seed: sealed.seed + 1 };
    const { divergesAt } = await readRecording(asFile(JSON.stringify(moved)));
    expect(divergesAt).not.toBeNull();
  });

  /** What `readRecording` says of a file, and how a player is told. */
  const refusal = async (text: string): Promise<{ problem: LoadProblem; said: string }> => {
    try {
      await readRecording(asFile(text));
    } catch (err) {
      return { problem: (err as { problem: LoadProblem }).problem, said: recordingLoadFailed(err) };
    }
    throw new Error("accepted");
  };

  it("refuses a file that is not a recording, and says why in Hebrew", async () => {
    const cases: [string, LoadProblem["kind"]][] = [
      ["not json", "notJson"],
      ["{}", "malformed"],
      [JSON.stringify({ ...sealed, version: 7 }), "unsupportedVersion"],
      [JSON.stringify({ ...sealed, sides: "BLUE" }), "malformed"],
    ];
    for (const [text, kind] of cases) {
      const { problem, said } = await refusal(text);
      expect(problem.kind, text.slice(0, 20)).toBe(kind);
      // No engine or browser English reaches a player: not a letter of it.
      expect(said, kind).not.toMatch(/[A-Za-z]/);
    }
    expect((await refusal(JSON.stringify({ ...sealed, version: 7 }))).said).toContain("7");
  });

  it("words the engine failing past the header, and an error that never went through the reader", () => {
    // Neither has a file that produces it today: the header check is what a
    // broken file meets first. They are worded all the same.
    const unreadable = new RecordingLoadError({ kind: "unreadable" }, new TypeError("x is undefined"));
    expect(recordingLoadFailed(unreadable)).not.toMatch(/[A-Za-z]/);
    expect(recordingLoadFailed(new TypeError("x is undefined"))).not.toMatch(/[A-Za-z]/);
  });
});
