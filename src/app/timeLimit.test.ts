import { describe, it, expect } from "vitest";
import { Game, makeInfantry, replayGame } from "../engine/index.js";
import { outOfTime } from "./hotseat.js";
import { SCENARIOS } from "./scenario.js";
import { PLAIN_SCRIPT } from "./drill.js";
import { DEFAULT_FIRE_CHOICES, runScenarioBattle } from "../sim/scenarioBattle.js";
import { telAzekaAssaultListing } from "./scenarios/telAzekaAssault.js";

/**
 * The mission's deadline (rules decision 58, author 2026-09-29: "mission will
 * have time limit in briefing (must achieve objectives by turn x)").
 */
function field(timeLimit?: number) {
  const g = new Game({ seed: 1, attackers: ["BLUE"], ...(timeLimit !== undefined ? { timeLimit } : {}) });
  g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 9));
  g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 900 }, 9));
  g.beginTurn();
  return g;
}
const closeTurn = (g: Game) => {
  g.advanceToPhase("combat");
  g.advanceToPhase("initiative");
};

describe("the mission's deadline", () => {
  it("fails the attack once its last turn has closed, not before", () => {
    const g = field(2);
    expect(outOfTime(g)).toBeNull();
    closeTurn(g); // turn 1 closed
    expect(outOfTime(g)).toBeNull();
    closeTurn(g); // turn 2, the last, closed
    expect(outOfTime(g)).toBe("BLUE");
  });

  it("with no deadline, never runs out", () => {
    const g = field();
    for (let t = 0; t < 5; t++) closeTurn(g);
    expect(outOfTime(g)).toBeNull();
  });

  it("is recorded, and a recording made before it has none", () => {
    const g = field(30);
    expect(g.toRecording().timeLimit).toBe(30);
    expect(replayGame(g.toRecording()).timeLimit).toBe(30);
    const old = field().toRecording();
    expect(old.timeLimit).toBeUndefined();
    expect(replayGame(old).timeLimit).toBeUndefined();
  });

  it("refuses a deadline that is not a turn", () => {
    expect(() => new Game({ seed: 1, timeLimit: 0 })).toThrow(/timeLimit/);
    expect(() => new Game({ seed: 1, timeLimit: 2.5 })).toThrow(/timeLimit/);
  });

  it("is stated in every attack's briefing, and is the battle's", () => {
    for (const s of SCENARIOS) {
      const g = s.build(1).game;
      if (!g.attackers.length) continue;
      expect(g.timeLimit, s.id).toBeGreaterThan(0);
      expect(s.brief, s.id).toContain(`יש להשלים את המשימה עד תור ${g.timeLimit}.`);
    }
  });

  it("ends a headless battle there, as the defender's win", () => {
    // A plain drill that never takes the hill: stop it at its deadline.
    const r = runScenarioBattle(telAzekaAssaultListing, 1000, { drill: PLAIN_SCRIPT, fire: DEFAULT_FIRE_CHOICES });
    expect(r.turns).toBeLessThanOrEqual(45);
    if (r.outOfTime) expect(r.winner).toBe("RED");
  });
});
