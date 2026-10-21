import { describe, expect, it } from "vitest";
import { Game, makeInfantry, makeMachineGunTeam, type Unit } from "../engine/index.js";
import { DOCTRINAL_DRILL, DrillState, PLAIN_SCRIPT, drillCombat, type DrillTask, type SquadDrill } from "./drill.js";

/**
 * Greatest threat first, and no piling on (the author's ruling 6 on the drill
 * audit, A6/D2): who fires on a force first, then crew-served weapons, then
 * the nearest; an enemy already pinned last.
 */
const drill: SquadDrill = { ...DOCTRINAL_DRILL, fireTeams: undefined };
const hold: DrillTask = { side: "BLUE", attacking: false, objective: { x: 0, y: 300 } };

function shotAt(g: Game, d: SquadDrill, task: DrillTask): string[] {
  const at: string[] = [];
  g.advanceToPhase("combat");
  drillCombat(g, task, d, new DrillState(), { fired: (u, t) => u.id === "B" && at.push(t.id) });
  return at;
}

function field(): { g: Game; rifles: Unit; gun: Unit } {
  const g = new Game({ seed: 3, trackIntel: false, enforceC2: false });
  g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 9));
  const rifles = g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 120 }, 9));
  const gun = g.addUnit(makeMachineGunTeam("MG", "RED", { x: 40, y: 180 }, 3));
  g.beginTurn();
  return { g, rifles, gun };
}

describe("greatest threat first (ruling 6)", () => {
  it("takes the machine gun before the nearer rifle squad", () => {
    const { g } = field();
    expect(shotAt(g, drill, hold)).toEqual(["MG"]);
  });

  it("while the plain drill still takes the nearest", () => {
    const { g } = field();
    expect(shotAt(g, PLAIN_SCRIPT, hold)).toEqual(["R"]);
  });

  it("leaves an enemy already pinned while there is another to shoot", () => {
    const { g, gun } = field();
    gun.suppression = 100;
    expect(shotAt(g, drill, hold)).toEqual(["R"]);
  });

  it("shoots back at whoever is firing on it, outside its sector too", () => {
    const g = new Game({ seed: 3, trackIntel: false, enforceC2: false });
    const b = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 9));
    g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 120 }, 9));
    const flank = g.addUnit(makeInfantry("F", "RED", "squad", { x: 200, y: 0 }, 9)); // 90° off its axis
    g.beginTurn();
    g.advanceToPhase("combat");
    g.fire(flank.id, b.id, { weapon: "smallArms" });
    g.advanceToPhase("summary");
    g.advanceToPhase("movement");
    expect(shotAt(g, drill, hold)).toEqual(["F"]);
  });
});
