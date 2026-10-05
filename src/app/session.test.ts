import { describe, expect, it } from "vitest";
import { telAzekaAssaultListing } from "./scenarios/telAzekaAssault.js";
import { ComputerDefender } from "./computerSide.js";
import { SESSION_FORMAT, SESSION_VERSION, SessionError, parseSession, resumeBattle, type Session } from "./session.js";
import { replayGame, stateDigest } from "../engine/index.js";

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
    digest: stateDigest(built.game),
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
    expect(variant((s) => delete s.digest)).toBe("notASession");
    // In an activation that does not exist, or with none to be in.
    expect(variant((s) => (s.ui.actIndex = 2))).toBe("notASession");
    expect(variant((s) => ((s.ui.activations = []), (s.ui.stage = "initiative")))).toBe("notASession");
    expect(variant((s) => (s.ui.log = [{ id: 1, turn: 1, kind: "shout", readers: ["RED"], text: "x" }]))).toBe("notASession");
    // Every part of the computer's memory the restore reads.
    const computer = (change: (c: Record<string, unknown> & { drill: Record<string, unknown> }) => void) =>
      variant((s) => change(s.computer as Record<string, unknown> & { drill: Record<string, unknown> }));
    expect(computer((c) => delete c.targets)).toBe("notASession");
    expect(computer((c) => (c.objective = {}))).toBe("notASession");
    expect(computer((c) => Reflect.deleteProperty(c, "drill"))).toBe("notASession");
    expect(computer((c) => (c.drill.posts = [["RED-A-1", { x: "north" }]]))).toBe("notASession");
    expect(computer((c) => (c.drill.levelWaits = [["BLUE-1", 3]]))).toBe("notASession");
    expect(variant((s) => delete s.computer)).toBeNull();
  });
});

describe("a saved battle, picked up again", () => {
  it("rebuilds the game and the computer to the state it was saved in", () => {
    const session = saved();
    const { game, ai } = resumeBattle(parseSession(JSON.stringify(session)), telAzekaAssaultListing);
    expect(stateDigest(game)).toBe(session.digest);
    expect(ai?.snapshot()).toEqual(session.computer);
  });

  it("refuses a battle that no longer replays to where it was saved, rather than resuming another", () => {
    // Rules that have moved since: the same decisions, a different state.
    const moved = { ...saved(), digest: "00000000" };
    expect(() => resumeBattle(moved, telAzekaAssaultListing)).toThrow(SessionError);
    // A recording the engine will not take at all.
    const broken = saved();
    broken.recording = { ...broken.recording, actions: [{ kind: "nothingLikeThis" }] } as unknown as typeof broken.recording;
    try {
      resumeBattle(broken, telAzekaAssaultListing);
      expect.unreachable();
    } catch (err) {
      expect((err as SessionError).problem).toBe("doesNotReplay");
    }
  });
});
