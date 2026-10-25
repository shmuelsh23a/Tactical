import { describe, expect, it } from "vitest";
import { Game, makeCommandGroup, makeInfantry, replayGame, stateDigest, type GameOptions } from "./index.js";

/**
 * Reinforcements (rules decision 122): a force that joins a side mid-battle,
 * at a turn drawn from its own stream within a window, with the fire missions
 * it brings — replayed exactly from the recording.
 */
const options = (seed = 3, window: [number, number] = [4, 8]): GameOptions => ({
  seed,
  enforceC2: false,
  fireSupport: { RED: [{ weapon: "lightMortar", missions: 8, roundsForEffect: 10, tubes: 2 }] },
  reinforcements: [
    {
      side: "RED",
      window,
      units: [makeInfantry("RED-R1", "RED", "squad", { x: 0, y: -300 }, 8)],
      fire: [{ weapon: "lightMortar", missions: 4, roundsForEffect: 10, tubes: 2 }],
    },
  ],
});

function battle(seed = 3, window: [number, number] = [4, 8]) {
  const g = new Game(options(seed, window));
  g.addUnit(makeCommandGroup("RED-COY", "RED", "company", { x: 0, y: -200 }));
  g.addUnit(makeInfantry("RED-1-1", "RED", "squad", { x: 0, y: 0 }, 8));
  g.addUnit(makeInfantry("BLUE-1-1", "BLUE", "squad", { x: 0, y: 900 }, 8));
  return g;
}
const nextTurn = (g: Game) => {
  if (g.turn > 0) g.advanceToPhase("summary");
  return g.beginTurn();
};

describe("a reinforcement (rules decision 122)", () => {
  it("arrives on the turn drawn for it, inside its window, and not before", () => {
    const g = battle();
    const due = g.reinforcements[0]!.turn;
    expect(due).toBeGreaterThanOrEqual(4);
    expect(due).toBeLessThanOrEqual(8);
    for (let t = 1; t < due; t++) {
      expect(nextTurn(g).arrived).toBeUndefined();
      expect(g.units.some((u) => u.id === "RED-R1")).toBe(false);
    }
    expect(nextTurn(g).arrived).toEqual([{ side: "RED", unitIds: ["RED-R1"] }]);
    expect(g.getUnit("RED-R1").position).toEqual({ x: 0, y: -300 });
  });

  it("brings its fire missions with it", () => {
    const g = battle();
    const due = g.reinforcements[0]!.turn;
    for (let t = 1; t < due; t++) nextTurn(g);
    expect(g.fireMissionsLeft("RED", "lightMortar")).toBe(8);
    nextTurn(g);
    expect(g.fireMissionsLeft("RED", "lightMortar")).toBe(12);
  });

  it("draws its turn from the seed alone: the same seed the same turn, and the window spread over seeds", () => {
    expect(battle(11).reinforcements[0]!.turn).toBe(battle(11).reinforcements[0]!.turn);
    const turns = new Set(Array.from({ length: 40 }, (_, k) => battle(100 + k).reinforcements[0]!.turn));
    expect([...turns].every((t) => t >= 4 && t <= 8)).toBe(true);
    expect(turns.size).toBeGreaterThan(2);
  });

  it("replays to exactly the same state, its missions counted once", () => {
    const g = battle();
    const due = g.reinforcements[0]!.turn;
    for (let t = 0; t <= due + 1; t++) nextTurn(g);
    const rec = g.toRecording();
    expect(rec.fireSupport?.RED).toEqual([{ weapon: "lightMortar", missions: 8, roundsForEffect: 10, tubes: 2 }]);
    expect(rec.reinforcements).toHaveLength(1);
    const back = replayGame(rec);
    expect(stateDigest(back)).toBe(stateDigest(g));
    expect(back.fireMissionsLeft("RED", "lightMortar")).toBe(12);
  });

  it("is reported by the step that begins its turn, for the side's log", () => {
    const g = battle();
    const due = g.reinforcements[0]!.turn;
    g.beginTurn();
    const reports: unknown[] = [];
    while (g.turn < due) {
      g.advanceToPhase("summary");
      reports.push(...g.advanceToPhase("initiative").arrived);
    }
    expect(reports).toEqual([{ side: "RED", unitIds: ["RED-R1"] }]);
  });

  it("refuses a window it cannot read", () => {
    expect(() => new Game({ ...options(), reinforcements: [{ ...options().reinforcements![0]!, window: [8, 4] }] })).toThrow(/window/);
  });
});
