import { describe, expect, it } from "vitest";
import { telAzekaAssaultListing } from "./scenarios/telAzekaAssault.js";
import { ComputerDefender } from "./computerSide.js";
import { SESSION_FORMAT, SESSION_VERSION, SessionError, parseSession, type Session } from "./session.js";
import { replayGame } from "../engine/index.js";

/** A battle a turn in, against the computer, saved as the browser saves it. */
function saved(): Session {
  const built = telAzekaAssaultListing.build(1000);
  const ai = new ComputerDefender(built.game, "RED", built);
  ai.plan(built.game);
  built.game.beginTurn();
  built.game.advanceToPhase("targeting");
  return {
    format: SESSION_FORMAT,
    version: SESSION_VERSION,
    scenarioId: telAzekaAssaultListing.id,
    recording: built.game.toRecording(),
    ui: {
      stage: "activation",
      activations: [
        { phase: "targeting", side: "BLUE" },
        { phase: "targeting", side: "RED" },
      ],
      actIndex: 0,
      planningIndex: 0,
      planned: true,
      log: [{ id: 1, turn: 1, kind: "info", readers: ["RED", "BLUE"], text: "תור 1" }],
      missionsUsed: { "BLUE-he": 1 },
      reported: ["BLUE:RED-A-1"],
      toldDown: [],
    },
    computer: ai.snapshot(),
  };
}

const problem = (text: string) => {
  try {
    parseSession(text);
    return null;
  } catch (err) {
    return err instanceof SessionError ? err.problem : "threw something else";
  }
};

describe("a saved battle, read back", () => {
  it("reads what the browser writes, and the game replays from it", () => {
    const session = saved();
    const back = parseSession(JSON.stringify(session));
    expect(back).toEqual(JSON.parse(JSON.stringify(session)));
    const g = replayGame(back.recording);
    expect(g.turn).toBe(1);
    expect(g.registeredTargets.filter((t) => t.side === "RED").length).toBeGreaterThan(0);
  });

  it("refuses what is not one, says why, and never half-reads it", () => {
    const good = saved();
    const variant = (change: (s: Record<string, unknown> & { ui: Record<string, unknown> }) => void) => {
      const copy = JSON.parse(JSON.stringify(good));
      change(copy);
      return problem(JSON.stringify(copy));
    };
    expect(problem("not json {")).toBe("notJson");
    expect(problem(JSON.stringify(good.recording))).toBe("notASession");
    expect(variant((s) => (s.version = SESSION_VERSION + 1))).toBe("newerVersion");
    expect(variant((s) => (s.ui.stage = "gameover"))).toBe("notASession");
    expect(variant((s) => (s.ui.activations = [{ phase: "targeting", side: "GREEN" }]))).toBe("notASession");
    expect(variant((s) => (s.ui.log = [{ id: 1, turn: 1, kind: "info", readers: ["EVERYONE"], text: "x" }]))).toBe("notASession");
    expect(variant((s) => (s.ui.actIndex = 1.5))).toBe("notASession");
    expect(variant((s) => (s.computer = { side: "NOBODY" }))).toBe("notASession");
    expect(variant((s) => delete s.computer)).toBeNull();
  });
});
