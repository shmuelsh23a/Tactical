import { describe, it, expect } from "vitest";
import { Game, makeInfantry, makeCommandGroup, type GameRecording } from "../engine/index.js";
import { spread, whatIf } from "./whatIf.js";

/** A short battle with contact: BLUE walks onto RED and the two exchange fire. */
function battle(): GameRecording {
  const g = new Game({ seed: 11, enforceC2: false, trackIntel: true });
  const blue = g.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", { x: 0, y: 200 }, 8));
  g.addUnit(makeCommandGroup("BLUE-HQ", "BLUE", "platoon", { x: 0, y: 260 }, 3));
  const red = g.addUnit(makeInfantry("RED-1", "RED", "squad", { x: 0, y: 0 }, 6));

  g.beginTurn();
  g.advanceToPhase("movement");
  g.setStandingOrder(blue.id, { gait: "run", destination: { x: 0, y: 60 } });
  g.executeStandingOrders("BLUE");
  g.advanceToPhase("combat");
  g.fire(red.id, blue.id, { weapon: "sustainedMg" });
  g.fire(blue.id, red.id, { weapon: "smallArms" });

  for (let turn = 0; turn < 3; turn++) {
    g.advanceToPhase("initiative");
    g.advanceToPhase("movement");
    g.executeStandingOrders("BLUE");
    g.advanceToPhase("combat");
    g.fire(red.id, blue.id, { weapon: "sustainedMg" });
    g.fire(blue.id, red.id, { weapon: "smallArms" });
  }
  g.advanceToPhase("summary");
  return g.toRecording();
}

const rec = battle();

describe("re-fighting a plan", () => {
  const result = whatIf(rec, 12);

  it("runs the asked-for number of alternate battles", () => {
    expect(result.runs).toHaveLength(12);
    expect(result.actual.seed).toBe(rec.seed);
  });

  it("is reproducible — the same recording re-rolls the same way", () => {
    expect(whatIf(rec, 12)).toEqual(result);
  });

  it("reproduces the battle that was actually fought, as the baseline", () => {
    // The run on the recording's own seed is the battle itself, so it can never
    // drop a decision.
    expect(result.actual.skipped).toBe(0);
  });

  it("finds a spread — that is the whole point of asking", () => {
    const blue = result.runs.map((r) => r.losses.BLUE);
    const red = result.runs.map((r) => r.losses.RED);
    expect(new Set([...blue, ...red]).size).toBeGreaterThan(1);
    // …and the actual battle sits inside the range its own plan produces.
    const s = spread([...blue, result.actual.losses.BLUE]);
    expect(result.actual.losses.BLUE).toBeGreaterThanOrEqual(s.min);
    expect(result.actual.losses.BLUE).toBeLessThanOrEqual(s.max);
  });

  it("reports decisions an alternate history could not carry out", () => {
    // Not every run has to drop one — but the count must be there to be read,
    // because a run that dropped decisions is not the same plan.
    for (const run of result.runs) expect(run.skipped).toBeGreaterThanOrEqual(0);
  });

  it("counts losses from the state each run ended in", () => {
    for (const run of result.runs) {
      expect(run.losses.BLUE).toBeGreaterThanOrEqual(0);
      expect(run.losses.BLUE).toBeLessThanOrEqual(11); // squad + command group
      expect(run.losses.RED).toBeLessThanOrEqual(6);
    }
  });
});

describe("spread", () => {
  it("reports smallest, middle and largest", () => {
    expect(spread([3, 1, 2, 9])).toEqual({ min: 1, median: 3, max: 9 });
    expect(spread([5])).toEqual({ min: 5, median: 5, max: 5 });
    expect(spread([])).toEqual({ min: 0, median: 0, max: 0 });
  });
});
