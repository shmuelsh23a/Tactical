import { describe, it, expect } from "vitest";
import { Game, makeInfantry, type Terrain } from "../engine/index.js";
import { ScriptedCompany, platoonKey, type CompanyPlan } from "./company.js";
import { telAzekaAssaultListing } from "./scenarios/telAzekaAssault.js";

/**
 * The scripted company commander (rules decisions 52–54): the stand-in for
 * Jev that decides which squads scout, where each watches from, where the
 * rest wait, and when they go. The drill carries its orders out (drill.test.ts).
 */
const flat: Terrain = { objects: [] };
const objective = { x: 0, y: 600 };

function field(plan: CompanyPlan) {
  const g = new Game({ seed: 3, trackIntel: true, enforceC2: false });
  const lead = g.addUnit(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 40 }, 9));
  const rest = g.addUnit(makeInfantry("B2", "BLUE", "squad", { x: 80, y: 0 }, 9));
  const company = new ScriptedCompany(g, "BLUE", objective, [objective], plan, { terrain: flat, width: 1000, height: 1000 });
  g.beginTurn();
  return { g, lead, rest, company };
}

describe("the scripted company commander", () => {
  it("sends the squad nearest the objective out scouting, and holds the rest", () => {
    const { g, lead, rest, company } = field({ recon: { scouts: 1 } });
    expect(lead.scouting).toBe(true);
    expect(rest.scouting).toBeFalsy();
    const o = company.orders(g);
    expect([...o.scouts.keys()]).toEqual(["B1"]);
    expect(o.hold).toBe(true);
  });

  it("with no reconnaissance, holds nobody back", () => {
    const { g, company } = field({});
    const o = company.orders(g);
    expect(o.scouts.size).toBe(0);
    expect(o.hold).toBe(false);
  });

  it("with a look, holds the rest while the scout keeps the enemy in sight, then lets them go", () => {
    const { g, lead, company } = field({ recon: { scouts: 1, lookTurns: 2 } });
    // At the objective: what the scout was sent to find.
    const red = g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 400 }, 9)); // in small-arms reach of the scout
    const held: boolean[] = [];
    for (let t = 0; t < 4; t++) {
      g.advanceToPhase("combat");
      g.fire(red.id, lead.id, { weapon: "smallArms" }); // keeps it in the scout's sight
      g.advanceToPhase("initiative");
      g.advanceToPhase("movement");
      held.push(company.orders(g).hold);
    }
    // Held one turn, two, then past the two-turn look: they go.
    expect(held).toEqual([true, true, false, false]);
  });

  it("is not stopped by an enemy away from the objective: it sent the scout to find the position there", () => {
    const { g, lead, company } = field({ recon: { scouts: 1 } });
    const hq = g.addUnit(makeInfantry("RHQ", "RED", "squad", { x: 300, y: 150 }, 3));
    g.advanceToPhase("combat");
    g.fire(hq.id, lead.id, { weapon: "smallArms" });
    expect(g.knows("BLUE", hq.id)).toBe(true);
    g.advanceToPhase("initiative");
    g.advanceToPhase("movement");
    const o = company.orders(g);
    expect(o.hold).toBe(true);
    expect(o.scoutsLieUp).toBe(false);
  });

  it("lets the rest go when its scouts are lost", () => {
    const { g, lead, company } = field({ recon: { scouts: 1 } });
    lead.neutralized = true;
    g.advanceToPhase("movement");
    expect(company.orders(g).hold).toBe(false);
  });

  it("on Tel Azeka sends two scouts to two observation points, and waits in dead ground", () => {
    // No spot in reach on the attacker's side sees all three of RED's squads
    // (docs/balance.md, eighteenth round): the second scout goes where the first cannot see.
    const { game: g, mapWidth, mapHeight } = telAzekaAssaultListing.build(1000);
    const red = g.units.filter((u) => u.side === "RED" && u.kind !== "command");
    const centre = {
      x: red.reduce((t, u) => t + u.position.x, 0) / red.length,
      y: red.reduce((t, u) => t + u.position.y, 0) / red.length,
    };
    const suspected = [centre, ...red.map((u) => u.position)];
    const company = new ScriptedCompany(
      g,
      "BLUE",
      centre,
      suspected,
      { recon: { scouts: 2, scoutFrom: "vantage" }, waitIn: "deadGround" },
      { terrain: g.terrain, width: mapWidth, height: mapHeight },
    );
    g.beginTurn();
    const o = company.orders(g);
    const posts = [...o.scouts.values()];
    expect(posts).toHaveLength(2);
    expect(posts.every((p) => p !== null)).toBe(true);
    expect(o.waitAt.size).toBeGreaterThan(0);
  });

  it("reads each squad's platoon from its name, and keeps scouts out of the platoons it tasks", () => {
    expect(platoonKey("BLUE-2-1")).toBe("BLUE-2");
    expect(platoonKey("B1")).toBe("B1");
    const { game: g, mapWidth, mapHeight } = telAzekaAssaultListing.build(1000);
    const company = new ScriptedCompany(g, "BLUE", { x: 560, y: 450 }, [{ x: 560, y: 450 }], { recon: { scouts: 1 } }, { terrain: g.terrain, width: mapWidth, height: mapHeight });
    const platoons = company.platoons(g);
    expect([...platoons.keys()].sort()).toEqual(["BLUE-1", "BLUE-2", "BLUE-3"]);
    const all = [...platoons.values()].flat();
    expect(all.some((u) => company.isScout(u))).toBe(false);
    expect(company.platoonTask("BLUE-1")).toBe("assault");
    company.setPlatoonTask("BLUE-1", "support");
    expect(company.orders(g).platoonTasks?.get("BLUE-1")).toBe("support");
  });
});
