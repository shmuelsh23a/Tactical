import { describe, expect, it, vi } from "vitest";
import { Game, makeCommandGroup, makeInfantry, type Terrain } from "../engine/index.js";
import { SUPPORT_SET_MAX_TURNS, ScriptedCompany, type CompanyOrders } from "./company.js";
import { DOCTRINAL_DRILL, DrillState, drillCombat, drillMovement, type DrillTask, type SquadDrill } from "./drill.js";
import { DEFAULT_FIRE_CHOICES, callAttackerFire } from "./computerSide.js";

/**
 * The attacking company's fixes from the drill audit (docs/drill-audit.md):
 * each pins what doctrine asks and the company used not to do.
 */
const flat: Terrain = { objects: [] };
const objective = { x: 0, y: 600 };

describe("the priority target, adjusted to where the enemy was found (drill audit, A8)", () => {
  it("is fired on the enemy found near the briefed point, not on the point itself", () => {
    const g = new Game({
      seed: 3,
      trackIntel: true,
      enforceC2: false,
      fireSupport: { BLUE: [{ weapon: "mortar", missions: 20, roundsForEffect: 8, tubes: 4 }] },
    });
    g.addUnit(makeCommandGroup("BLUE-COY", "BLUE", "company", { x: 0, y: 100 }));
    const blue = g.addUnit(makeInfantry("BLUE-1-1", "BLUE", "squad", { x: 0, y: 380 }, 9));
    const red = g.addUnit(makeInfantry("R", "RED", "squad", { x: 30, y: 620 }, 9));
    const c = new ScriptedCompany(g, "BLUE", objective, [objective], {}, { terrain: flat, width: 1000, height: 1000 });
    g.beginTurn();
    // Found by its fire: a fresh mark where it stands.
    g.advanceToPhase("combat");
    g.fire(red.id, blue.id, { weapon: "smallArms" });
    g.advanceToPhase("initiative");
    c.orders(g, { go: true });
    g.advanceToPhase("targeting");
    const calls = vi.spyOn(g, "callForFire");
    callAttackerFire(g, "BLUE", [objective], objective, { ...DEFAULT_FIRE_CHOICES }, c, { missions: 0, smoke: 0 });
    expect(calls).toHaveBeenCalled();
    const at = calls.mock.calls[0]![2];
    const mark = g.contactFor("BLUE", red.id)!.lastKnownPosition;
    expect(at).toEqual(mark);
    expect(at).not.toEqual(objective);
  });
});

describe("the assault waits for its support to be set (drill audit, A1)", () => {
  // BLUE-1 on support, out of reach of the enemy; BLUE-2 the assault, at the line.
  function field() {
    const g = new Game({ seed: 3, trackIntel: true, enforceC2: false });
    const support = g.addUnit(makeInfantry("BLUE-1-1", "BLUE", "squad", { x: 0, y: 0 }, 9));
    const assault = g.addUnit(makeInfantry("BLUE-2-1", "BLUE", "squad", { x: 60, y: 420 }, 9));
    const red = g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 600 }, 9));
    const c = new ScriptedCompany(g, "BLUE", objective, [objective], {}, { terrain: flat, width: 1000, height: 1000 });
    g.beginTurn();
    g.advanceToPhase("combat");
    g.fire(red.id, assault.id, { weapon: "smallArms" });
    g.advanceToPhase("initiative");
    c.setPlatoonTask("BLUE-1", "support");
    return { g, c, support, red };
  }

  it("holds the assault short while the support cannot engage, and lets it go once it can", () => {
    const { g, c, support } = field();
    expect(c.orders(g, { go: true }).holdShort).toBe(true);
    support.position = { x: 0, y: 330 }; // in small-arms reach of the mark, on open ground
    expect(c.orders(g, { go: true }).holdShort).toBeFalsy();
    // Set once is set: the assault is not held for it again.
    support.position = { x: 0, y: 0 };
    expect(c.orders(g, { go: true }).holdShort).toBeFalsy();
  });

  it("does not wait for good on a support that never gets set", () => {
    const { g, c } = field();
    const held: boolean[] = [];
    for (let t = 0; t < SUPPORT_SET_MAX_TURNS + 1; t++) held.push(!!c.orders(g, { go: true }).holdShort);
    expect(held.slice(0, SUPPORT_SET_MAX_TURNS)).toEqual(Array(SUPPORT_SET_MAX_TURNS).fill(true));
    expect(held.at(-1)).toBe(false);
  });

  it("holds nobody when no force is on support", () => {
    const { g, c } = field();
    c.setPlatoonTask("BLUE-1", "assault");
    expect(c.orders(g, { go: true }).holdShort).toBeFalsy();
  });
});

describe("a spent assault commits its reserve before its base of fire (drill audit, A9)", () => {
  it("sends the reserve in and leaves the support firing", () => {
    const g = new Game({ seed: 3, trackIntel: true, enforceC2: false });
    g.addUnit(makeInfantry("BLUE-1-1", "BLUE", "squad", { x: 0, y: 0 }, 9));
    const lone = g.addUnit(makeInfantry("BLUE-2-1", "BLUE", "squad", { x: 120, y: 300 }, 9));
    g.addUnit(makeInfantry("BLUE-3-1", "BLUE", "squad", { x: 0, y: -200 }, 9));
    const c = new ScriptedCompany(g, "BLUE", objective, [objective], {}, { terrain: flat, width: 1000, height: 1000 });
    g.beginTurn();
    c.orders(g);
    c.setPlatoonTask("BLUE-1", "support");
    c.setPlatoonTask("BLUE-3", "reserve");
    lone.neutralized = true;
    expect(c.assaultSpent(g)).toBe(true);
    expect(c.toCommit(g)).toEqual(["BLUE-3"]);
    c.orders(g);
    expect(c.platoonTask("BLUE-3")).toBe("assault");
    expect(c.platoonTask("BLUE-1")).toBe("support");
  });
});

describe("the doctrinal drill's halts, consolidation and screens (drill audit, A5, A7, A14)", () => {
  const drill: SquadDrill = { ...DOCTRINAL_DRILL, fireTeams: undefined };
  const company = (o: Partial<CompanyOrders> = {}): CompanyOrders => ({
    scouts: new Map(),
    scoutsLieUp: false,
    hold: false,
    waitAt: new Map(),
    platoonOf: new Map([["BLUE-1-1", "BLUE-1"], ["BLUE-2-1", "BLUE-2"]]),
    fallBackTo: { x: 0, y: -100 },
    ...o,
  });

  it("halts in the nearest cover in reach, not where it happened to stop (step 10)", () => {
    const oak = { id: "oak", kind: "tree" as const, footprint: { shape: "circle" as const, center: { x: 15, y: 0 }, radius: 4 } };
    const g = new Game({ seed: 3, trackIntel: true, enforceC2: false, terrain: { objects: [oak] } });
    const u = g.addUnit(makeInfantry("BLUE-1-1", "BLUE", "squad", { x: 0, y: 0 }, 9));
    const r = g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 350 }, 9));
    g.beginTurn();
    // In contact: found by its fire.
    g.advanceToPhase("combat");
    g.fire(r.id, u.id, { weapon: "smallArms" });
    g.advanceToPhase("initiative");
    expect(g.groundCoverAt(u.position)).toBe("none");
    g.advanceToPhase("movement");
    // Its turn to halt: one force, so it halts on odd turns.
    if (g.turn % 2 === 0) { g.advanceToPhase("summary"); g.advanceToPhase("movement"); }
    drillMovement(g, { side: "BLUE", attacking: true, objective: { x: 0, y: 600 } }, drill, new DrillState());
    expect(g.groundCoverAt(u.position)).not.toBe("none");
    expect(Math.hypot(u.position.x, u.position.y)).toBeLessThanOrEqual(25);
  });

  it("does not consolidate short of a position it has not seized", () => {
    const g = new Game({ seed: 3, trackIntel: false, enforceC2: false });
    const u = g.addUnit(makeInfantry("BLUE-1-1", "BLUE", "squad", { x: 0, y: 410 }, 9));
    g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 560 }, 9)); // 60 m beyond the objective, 150 m from the squad
    g.beginTurn();
    g.advanceToPhase("movement");
    drillMovement(g, { side: "BLUE", attacking: true, objective: { x: 0, y: 500 }, company: company() }, drill, new DrillState());
    expect(u.observationSector).toBeUndefined();
  });

  it("brings the base of fire up once the objective is seized (step 14b)", () => {
    const g = new Game({ seed: 3, trackIntel: false, enforceC2: false });
    const support = g.addUnit(makeInfantry("BLUE-1-1", "BLUE", "squad", { x: 0, y: 100 }, 9));
    const assault = g.addUnit(makeInfantry("BLUE-2-1", "BLUE", "squad", { x: 0, y: 490 }, 9));
    g.beginTurn();
    g.advanceToPhase("movement");
    const task: DrillTask = { side: "BLUE", attacking: true, objective: { x: 0, y: 500 }, company: company({ platoonTasks: new Map([["BLUE-1", "support"]]) }) };
    drillMovement(g, task, drill, new DrillState());
    expect(support.position.y).toBeGreaterThan(100);
    expect(assault.observationSector).toBeDefined(); // consolidating, facing on
  });

  it("lets the support team of a divided squad screen, being the one near enough", () => {
    const g = new Game({ seed: 3, trackIntel: false, enforceC2: false });
    const squad = g.addUnit(makeInfantry("BLUE-1-1", "BLUE", "squad", { x: 0, y: 420 }, 9));
    g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 500 }, 9));
    g.beginTurn();
    g.advanceToPhase("movement");
    const state = new DrillState();
    const task: DrillTask = { side: "BLUE", attacking: true, objective: { x: 0, y: 500 }, company: company() };
    drillMovement(g, task, DOCTRINAL_DRILL, state);
    expect(state.baseOfFire.has(squad.id)).toBe(true);
    g.advanceToPhase("combat");
    drillCombat(g, task, DOCTRINAL_DRILL, state);
    expect(state.screens).toBeGreaterThan(0);
  });
});
