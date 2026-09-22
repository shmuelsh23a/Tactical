import { describe, it, expect } from "vitest";
import { sealRecording } from "../engine/index.js";
import { readRecording } from "./recordingFile.js";
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

  it("refuses a file that is not a recording rather than opening a broken debrief", async () => {
    await expect(readRecording(asFile("not json"))).rejects.toThrow();
    await expect(readRecording(asFile("{}"))).rejects.toThrow();
  });
});
