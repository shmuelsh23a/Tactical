import { describe, expect, it } from "vitest";
import { Game, makeInfantry } from "../engine/index.js";
import { SCORE, battleScore } from "./score.js";

/**
 * A battle's score (rules decision 108): mission 100, men up to 40, time up to
 * 30 — men and time together never worth the mission. Alongside who won.
 */
function battle(turns: number, timeLimit: number | undefined = 30) {
  const g = new Game({ seed: 1, enforceC2: false, attackers: ["BLUE"], ...(timeLimit !== undefined ? { timeLimit } : {}) });
  g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 100, y: 100 }, 8));
  g.addUnit(makeInfantry("R", "RED", "squad", { x: 300, y: 100 }, 8));
  g.beginTurn();
  for (let t = 1; t < turns; t++) { g.advanceToPhase("summary"); g.advanceToPhase("initiative"); }
  return g;
}
const knock = (g: Game, id: string, n: number) => {
  for (const s of g.getUnit(id).soldiers!.slice(0, n)) { s.damagePoints = 10; s.neutralized = true; }
};

describe("the battle's score (decision 108)", () => {
  it("never lets men and time together outweigh the mission", () => {
    expect(SCORE.men + SCORE.time).toBeLessThan(SCORE.mission);
  });

  it("gives the winner the mission, and each side its men kept and its time", () => {
    const g = battle(10);
    knock(g, "B", 2);
    knock(g, "R", 4);
    const s = battleScore(g, "BLUE");
    expect(s.sides.BLUE).toEqual({ mission: 100, men: 30, time: 20, total: 150 }); // 6 of 8; won on turn 10 of 30
    expect(s.sides.RED).toEqual({ mission: 0, men: 20, time: 10, total: 30 }); // 4 of 8; held a third of the time
    expect(s.forces).toContainEqual({ id: "R", side: "RED", fit: 4, men: 8 });
  });

  it("gives a defender that held the whole time its time in full", () => {
    const g = battle(31);
    expect(battleScore(g, "RED").sides.RED.time).toBe(SCORE.time);
    expect(battleScore(g, "RED").sides.BLUE.time).toBe(0);
  });

  it("counts a force that gave itself up as no men kept", () => {
    const g = battle(5);
    g.getUnit("R").surrendered = true;
    expect(battleScore(g, "BLUE").sides.RED.men).toBe(0);
  });

  it("scores no time in a battle with no attacker and no clock", () => {
    const g = new Game({ seed: 1, enforceC2: false });
    g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 100, y: 100 }, 8));
    g.addUnit(makeInfantry("R", "RED", "squad", { x: 300, y: 100 }, 8));
    g.beginTurn();
    const s = battleScore(g, null);
    expect(s.sides.BLUE.time + s.sides.RED.time).toBe(0);
  });

  it("gives nobody the mission in a draw", () => {
    const s = battleScore(battle(8), null);
    expect(s.sides.BLUE.mission + s.sides.RED.mission).toBe(0);
  });
});
