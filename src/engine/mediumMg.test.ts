import { describe, expect, it } from "vitest";
import { Game, makeInfantry, makeMachineGunTeam } from "./index.js";
import { MEDIUM_MG_BANDS, SMALL_ARMS_BANDS } from "./data/directFire.js";

/**
 * The dismounted medium machine gun (rules decision 90). The author's
 * ruling of 2026-10-11 was that doctrine and high-fidelity data beat our
 * rules, and the rules get adjusted — so what is checked here is that a
 * machine gun team reaches where ATP 3-21.8 says it reaches, that nothing
 * else does, and that decision 25 is still standing.
 */
function pair(range: number, opts: { mediumMg?: boolean } = {}) {
  const g = new Game({ seed: 5, morale: false, ...opts });
  g.addUnit(makeMachineGunTeam("BLUE-MG", "BLUE", { x: 0, y: 0 }, 3, "מקלע"));
  g.addUnit(makeInfantry("BLUE-SQ", "BLUE", "squad", { x: 0, y: 0 }, 8, "כיתה"));
  g.addUnit(makeInfantry("RED-1", "RED", "squad", { x: range, y: 0 }, 8, "RED"));
  g.beginTurn();
  g.advanceToPhase("combat");
  return g;
}

describe("the table a machine gun team fires", () => {
  it("reaches the published 800 m, where a rifle squad stops at 400", () => {
    // The document's infantry table ends at 400 m; the machine gun's own
    // ends at the 800 m of ATP 3-21.8's Appendix C.
    expect(SMALL_ARMS_BANDS.at(-1)!.maxRange).toBe(400);
    expect(MEDIUM_MG_BANDS.at(-1)!.maxRange).toBe(800);
  });

  it("hits at 600 m, where a rifle squad cannot fire at all", () => {
    const g = pair(600);
    const mg = g.fire("BLUE-MG", "RED-1", { weapon: "smallArms" });
    expect(mg.fired).toBe(true);
    const squad = g.fire("BLUE-SQ", "RED-1", { weapon: "smallArms" });
    expect(squad.fired).toBe(false);
    expect(squad.reason).toMatch(/range/);
  });

  it("cannot reach past its gun either", () => {
    const g = pair(900);
    const mg = g.fire("BLUE-MG", "RED-1", { weapon: "smallArms" });
    expect(mg.fired).toBe(false);
    expect(mg.reason).toMatch(/range/);
  });

  it("fires the infantry table when the rule is off, as an old recording does", () => {
    const g = pair(600, { mediumMg: false });
    const mg = g.fire("BLUE-MG", "RED-1", { weapon: "smallArms" });
    // Without decision 90 a machine gun team is just another small force.
    expect(mg.fired).toBe(false);
    expect(mg.reason).toMatch(/range/);
  });

  it("leaves decision 25 standing: infantry are still refused the coaxial", () => {
    const g = pair(300);
    expect(() => g.setCovering("BLUE-MG", true, "sustainedMg")).toThrow();
    expect(() => g.setCovering("BLUE-SQ", true, "sustainedMg")).toThrow();
  });
});
