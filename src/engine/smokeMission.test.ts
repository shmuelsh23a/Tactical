import { describe, it, expect } from "vitest";
import { Game } from "./game.js";
import { makeCommandGroup, makeInfantry } from "./units.js";
import { replayGame } from "./recording.js";

/** Rules decision 56: smoke from the tubes costs a fire mission; a grenade's is the squad's own. */
function battle(smokeCostsMission?: boolean) {
  const g = new Game({
    seed: 1,
    enforceC2: false,
    commandEchelon: { BLUE: "company", RED: "company" },
    fireSupport: { BLUE: [{ weapon: "mortar", missions: 2 }] },
    ...(smokeCostsMission === undefined ? {} : { smokeCostsMission }),
  });
  g.addUnit(makeCommandGroup("B-COY", "BLUE", "company", { x: 0, y: 0 }, 5));
  g.addUnit(makeInfantry("B-1", "BLUE", "squad", { x: 0, y: 50 }, 9));
  g.addUnit(makeInfantry("R-1", "RED", "squad", { x: 0, y: 700 }, 9));
  g.beginTurn();
  g.advanceToPhase("targeting");
  return g;
}

describe("smoke from the tubes", () => {
  it("costs a mission, and is refused when none are left", () => {
    const g = battle();
    expect(g.fireMissionsLeft("BLUE", "mortar")).toBe(2);
    g.deploySmoke("mortar", "BLUE", { x: 0, y: 400 });
    expect(g.fireMissionsLeft("BLUE", "mortar")).toBe(1);
    g.deploySmoke("mortar", "BLUE", { x: 0, y: 450 });
    expect(g.fireMissionsLeft("BLUE", "mortar")).toBe(0);
    expect(() => g.deploySmoke("mortar", "BLUE", { x: 0, y: 500 })).toThrow(/no mortar missions left/);
  });

  it("leaves a grenade's smoke free: it is the squad's own", () => {
    const g = battle();
    g.deploySmoke("grenade", "BLUE", { x: 0, y: 60 });
    expect(g.fireMissionsLeft("BLUE", "mortar")).toBe(2);
  });

  it("is free in a recording made before the rule, which replays as it was played", () => {
    const g = battle(false);
    g.deploySmoke("mortar", "BLUE", { x: 0, y: 400 });
    expect(g.fireMissionsLeft("BLUE", "mortar")).toBe(2);
    const rec = g.toRecording();
    expect(rec.smokeCostsMission).toBeUndefined();
    expect(replayGame(rec).smokeCostsMission).toBe(false);
    const now = battle();
    now.deploySmoke("mortar", "BLUE", { x: 0, y: 400 });
    const rec2 = now.toRecording();
    expect(rec2.smokeCostsMission).toBe(true);
    expect(replayGame(rec2).fireMissionsLeft("BLUE", "mortar")).toBe(1);
  });
});
