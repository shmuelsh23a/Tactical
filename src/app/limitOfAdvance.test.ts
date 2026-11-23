import { describe, expect, it } from "vitest";
import { Game, makeCommandGroup, makeInfantry, type Point } from "../engine/index.js";
import type { CompanyOrders } from "./company.js";
import {
  DOCTRINAL_DRILL,
  DrillState,
  PLAIN_SCRIPT,
  drillCombat,
  drillMovement,
  limitOfAdvanceFrom,
  pastLimit,
  shortOfLimit,
  type DrillTask,
  type SquadDrill,
} from "./drill.js";

/**
 * The limit of advance and the far side (decision 130): a trained company
 * crosses to the far side of the objective and holds there (ATP 3-21.10
 * (2026) para 2-181); an untrained one chases a fleeing enemy, and an LOA
 * stops it; with an LOA, one fresh squad is pushed out to it (FM 3-90 A-53).
 * The line of attack runs south to north here: start y 100, objective y 500.
 */
const start: Point = { x: 0, y: 100 };
const objective: Point = { x: 0, y: 500 };
const company = (over: Partial<CompanyOrders> = {}): CompanyOrders => ({
  scouts: new Map(),
  scoutsLieUp: true,
  hold: false,
  waitAt: new Map(),
  fallBackTo: start,
  ...over,
});

describe("a limit of advance, as a line (decision 130)", () => {
  const loa = limitOfAdvanceFrom(start, objective, 200);

  it("is square to the line of attack, the distance past the objective", () => {
    expect(loa.at).toEqual({ x: 0, y: 700 });
    expect(pastLimit(loa, { x: 250, y: 700 })).toBeCloseTo(0);
    expect(pastLimit(loa, { x: 0, y: 650 })).toBeLessThan(0);
    expect(pastLimit(loa, { x: 0, y: 750 })).toBeGreaterThan(0);
  });

  it("stops a move across it on the way, and squares one already at it back onto its own side", () => {
    const stop = shortOfLimit(loa, { x: 0, y: 600 }, { x: 0, y: 900 });
    expect(pastLimit(loa, stop)).toBeCloseTo(-5);
    expect(shortOfLimit(loa, { x: 0, y: 600 }, { x: 0, y: 650 })).toEqual({ x: 0, y: 650 });
    expect(pastLimit(loa, shortOfLimit(loa, { x: 0, y: 720 }, { x: 40, y: 760 }))).toBeCloseTo(-5);
  });
});

describe("after the objective: the far side, the chase and the security push (decision 130)", () => {
  const trained: SquadDrill = { ...DOCTRINAL_DRILL, fireTeams: undefined };

  /** A company on the objective with the enemy on it too, about to flee. */
  function taken(squads: [string, number][] = [["BLUE-1-1", 9]]) {
    const g = new Game({ seed: 3, trackIntel: false, enforceC2: false });
    const us = squads.map(([id, men], i) => g.addUnit(makeInfantry(id, "BLUE", "squad", { x: i * 20, y: 495 }, men)));
    const enemy = g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 520 }, 9));
    g.beginTurn();
    return { g, us, enemy };
  }
  const run = (g: Game, task: DrillTask, drill: SquadDrill, state: DrillState, turns: number) => {
    for (let t = 0; t < turns; t++) {
      g.advanceToPhase("movement");
      drillMovement(g, task, drill, state);
      g.advanceToPhase("summary");
    }
  };

  it("takes the trained squads across to the far side, and no further, with the enemy fled", () => {
    const { g, us, enemy } = taken();
    const task: DrillTask = { side: "BLUE", attacking: true, objective, company: company() };
    const state = new DrillState();
    run(g, task, trained, state, 1); // the enemy found on the objective
    enemy.position = { x: 0, y: 900 }; // fled 400 m past it
    run(g, task, trained, state, 6);
    const y = us[0]!.position.y;
    expect(y).toBeGreaterThan(510); // across
    expect(y).toBeLessThan(600); // and no further than the far side
  });

  it("lets untrained squads chase a fleeing enemy, and an LOA stop them at it", () => {
    const task: DrillTask = { side: "BLUE", attacking: true, objective, company: company() };
    // Fled to 280 m: past an LOA at 200 m, and still known (a game without intelligence knows within 300 m).
    const chase = taken();
    chase.enemy.position = { x: 0, y: 780 };
    run(chase.g, task, PLAIN_SCRIPT, new DrillState(), 6);
    expect(chase.us[0]!.position.y).toBeGreaterThan(720); // past where an LOA at 200 m would have been

    const held = taken();
    held.enemy.position = { x: 0, y: 780 };
    const loa = limitOfAdvanceFrom(start, objective, 200);
    run(held.g, { ...task, limitOfAdvance: loa }, PLAIN_SCRIPT, new DrillState(), 6);
    expect(pastLimit(loa, held.us[0]!.position)).toBeLessThanOrEqual(0);
  });

  it("pushes the freshest squad out to the LOA once the objective is seized, facing out, and only one", () => {
    const { g, us, enemy } = taken([
      ["BLUE-1-1", 6],
      ["BLUE-1-2", 9],
      ["BLUE-1-3", 8],
    ]);
    const loa = limitOfAdvanceFrom(start, objective, 200);
    const task: DrillTask = { side: "BLUE", attacking: true, objective, company: company(), limitOfAdvance: loa };
    const state = new DrillState();
    run(g, task, trained, state, 1);
    enemy.position = { x: 0, y: 900 };
    run(g, task, trained, state, 8);
    expect(state.securityPush?.id).toBe("BLUE-1-2");
    const pushed = us[1]!;
    expect(pastLimit(loa, pushed.position)).toBeLessThanOrEqual(0);
    expect(pastLimit(loa, pushed.position)).toBeGreaterThan(-60); // out at the line, not on the objective
    expect(pushed.observationSector).toBeDefined();
    // The others consolidate on the objective's far side.
    for (const u of [us[0]!, us[2]!]) expect(u.position.y).toBeLessThan(600);
    // Kept in a saved battle.
    expect(DrillState.restore(state.snapshot()).securityPush).toEqual(state.securityPush);
    expect(DrillState.restore(state.snapshot()).farSide.size).toBe(state.farSide.size);
  });

  it("pushes nobody out with no LOA", () => {
    const { g, enemy } = taken();
    const task: DrillTask = { side: "BLUE", attacking: true, objective, company: company() };
    const state = new DrillState();
    run(g, task, trained, state, 1);
    enemy.position = { x: 0, y: 900 };
    run(g, task, trained, state, 4);
    expect(state.securityPush).toBeUndefined();
  });

  it("does not assault an enemy past the LOA, and does assault the same enemy with none", () => {
    const assaults = (loa?: ReturnType<typeof limitOfAdvanceFrom>) => {
      const g = new Game({ seed: 3, trackIntel: false, enforceC2: false });
      g.addUnit(makeInfantry("BLUE-1-1", "BLUE", "squad", { x: 0, y: 690 }, 9));
      g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 715 }, 9)); // 15 m past an LOA at y 700, within assault range
      g.beginTurn();
      g.advanceToPhase("combat");
      const assaulted: string[] = [];
      drillCombat(
        g,
        { side: "BLUE", attacking: true, objective, company: company(), ...(loa ? { limitOfAdvance: loa } : {}) },
        trained,
        new DrillState(),
        { assaulted: (_u, target) => assaulted.push(target.id) },
      );
      return assaulted;
    };
    expect(assaults()).toEqual(["R"]);
    expect(assaults(limitOfAdvanceFrom(start, objective, 200))).toEqual([]);
  });

  it("keeps squads that came side by side apart on the far side", () => {
    const { g, us, enemy } = taken([
      ["BLUE-1-1", 9],
      ["BLUE-1-2", 9],
      ["BLUE-1-3", 9],
    ]);
    const task: DrillTask = { side: "BLUE", attacking: true, objective, company: company() };
    const state = new DrillState();
    run(g, task, trained, state, 1);
    enemy.position = { x: 0, y: 900 };
    run(g, task, trained, state, 4);
    const xs = us.map((u) => state.farSide.get(u.id)!.x);
    expect(new Set(xs.map((x) => Math.round(x))).size).toBe(3);
  });

  it("keeps every far side on the objective, a flank's worth of squads included, and each squad still there", () => {
    const g = new Game({ seed: 3, trackIntel: false, enforceC2: false });
    // Four squads come in wide on one flank, 60 to 120 m off the line of attack.
    const us = [60, 80, 100, 120].map((x, i) => g.addUnit(makeInfantry(`BLUE-1-${i + 1}`, "BLUE", "squad", { x, y: 480 }, 9)));
    const enemy = g.addUnit(makeInfantry("R", "RED", "squad", { x: 70, y: 500 }, 9));
    g.beginTurn();
    const task: DrillTask = { side: "BLUE", attacking: true, objective, company: company() };
    const state = new DrillState();
    run(g, task, trained, state, 1);
    enemy.position = { x: 0, y: 950 };
    run(g, task, trained, state, 6);
    for (const u of us) expect(Math.hypot(state.farSide.get(u.id)!.x - objective.x, state.farSide.get(u.id)!.y - objective.y)).toBeLessThanOrEqual(95);
    const at = us.map((u) => ({ ...u.position }));
    run(g, task, trained, state, 3);
    us.forEach((u, i) => expect(u.position).toEqual(at[i]));
  });

  it("faces along the line of attack where a house fills the far side, the squad consolidating where it stands", () => {
    // A house across the whole far side: no room there, so the squad holds where it is.
    const house = {
      id: "h",
      kind: "building" as const,
      footprint: { shape: "polygon" as const, points: [{ x: -200, y: 520 }, { x: 200, y: 520 }, { x: 200, y: 640 }, { x: -200, y: 640 }] },
    };
    const g = new Game({ seed: 3, trackIntel: false, enforceC2: false, terrain: { objects: [house] } });
    const u = g.addUnit(makeInfantry("BLUE-1-1", "BLUE", "squad", { x: 0, y: 470 }, 9));
    g.addUnit(makeCommandGroup("BLUE-COY", "BLUE", "company", { x: 0, y: 300 }));
    g.beginTurn();
    const task: DrillTask = { side: "BLUE", attacking: true, objective, company: company() };
    const state = new DrillState();
    state.objectiveFound = true;
    run(g, task, trained, state, 2);
    expect(state.farSide.get(u.id)).toEqual({ x: 0, y: 470 });
    // North, toward +y here: the bearing from the objective onward, not back at the start line.
    const north = Math.atan2(1, 0) * (180 / Math.PI);
    const off = Math.abs((((u.observationSector!.bearing - north) % 360) + 540) % 360 - 180);
    expect(off).toBeLessThan(60);
  });

  it("holds the far side against an enemy that comes into reach there, rather than chasing it off the objective", () => {
    const { g, us, enemy } = taken();
    const task: DrillTask = { side: "BLUE", attacking: true, objective, company: company() };
    const state = new DrillState();
    run(g, task, trained, state, 1);
    enemy.position = { x: 0, y: 620 }; // fled 120 m: beyond the objective's 100, within 100 of the far side
    run(g, task, trained, state, 6);
    expect(state.farSide.has(us[0]!.id)).toBe(true);
    expect(us[0]!.position.y).toBeLessThan(580);
  });

  it("keeps the command group behind its company on the far side, and short of the LOA", () => {
    const { g, us, enemy } = taken([
      ["BLUE-1-1", 9],
      ["BLUE-1-2", 9],
    ]);
    const hq = g.addUnit(makeCommandGroup("BLUE-COY", "BLUE", "company", { x: 0, y: 470 }));
    const loa = limitOfAdvanceFrom(start, objective, 100);
    const task: DrillTask = { side: "BLUE", attacking: true, objective, company: company(), limitOfAdvance: loa };
    const state = new DrillState();
    run(g, task, trained, state, 1);
    enemy.position = { x: 0, y: 900 };
    run(g, task, trained, state, 10);
    expect(pastLimit(loa, hq.position)).toBeLessThanOrEqual(0);
    expect(hq.position.y).toBeLessThan(Math.max(...us.map((u) => u.position.y)));
  });

  it("does not push out the only squad on the objective", () => {
    const { g, enemy } = taken();
    const task: DrillTask = { side: "BLUE", attacking: true, objective, company: company(), limitOfAdvance: limitOfAdvanceFrom(start, objective, 200) };
    const state = new DrillState();
    run(g, task, trained, state, 1);
    enemy.position = { x: 0, y: 900 };
    run(g, task, trained, state, 4);
    expect(state.securityPush).toBeUndefined();
  });
});
