import { describe, expect, it } from "vitest";
import { Game, makeCommandGroup, makeInfantry } from "../engine/index.js";
import {
  DrillState,
  PLAIN_SCRIPT,
  SQUAD_GRENADIERS,
  WESTERN_DRILL,
  drillCombat,
  drillMovement,
  fireGrenadiers,
  type DrillTask,
} from "./drill.js";
import type { CompanyOrders } from "./company.js";

/**
 * The squad drill (backlog 15 and 20): data a simulated subordinate carries
 * out. What it must never do is pinned here — see what its side has not seen,
 * or fight outside the rules — and so is what each of its parameters means.
 */
function field(trackIntel = true) {
  const g = new Game({ seed: 3, trackIntel, enforceC2: false });
  const blue = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 9));
  g.addUnit(makeCommandGroup("B-HQ", "BLUE", "platoon", { x: 0, y: -80 }));
  g.beginTurn();
  return { g, blue };
}
const attack: DrillTask = { side: "BLUE", attacking: true, objective: { x: 0, y: 600 } };

describe("the squad drill", () => {
  it("never shoots at an enemy its side has not found", () => {
    const { g, blue } = field();
    g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 150 }, 9));
    g.advanceToPhase("combat");
    drillCombat(g, attack, PLAIN_SCRIPT);
    // Nothing detected, so nothing shot at — though the enemy is in plain reach.
    expect(blue.firedThisTurn).toBe(false);
  });

  it("shoots into its own sector before it shoots at the nearest enemy", () => {
    // Without the knowledge model the side sees everything in 300 m, so the
    // targets are known; one dead ahead at 250 m, one off to the flank at 120.
    const { g } = field(false);
    const ahead = g.addUnit(makeInfantry("R1", "RED", "squad", { x: 0, y: 250 }, 9));
    const flank = g.addUnit(makeInfantry("R2", "RED", "squad", { x: 120, y: 20 }, 9));
    g.advanceToPhase("combat");
    const shotAt: string[] = [];
    const fire = g.fire.bind(g);
    g.fire = (a, t, o) => (shotAt.push(t), fire(a, t, o));
    drillCombat(g, attack, WESTERN_DRILL);
    expect(shotAt[0]).toBe(ahead.id);
    // The plain script takes the nearest, sector or no sector.
    const again = field(false);
    again.g.addUnit(makeInfantry("R1", "RED", "squad", { x: 0, y: 250 }, 9));
    again.g.addUnit(makeInfantry("R2", "RED", "squad", { x: 120, y: 20 }, 9));
    again.g.advanceToPhase("combat");
    const plainShots: string[] = [];
    const fire2 = again.g.fire.bind(again.g);
    again.g.fire = (a, t, o) => (plainShots.push(t), fire2(a, t, o));
    drillCombat(again.g, attack, PLAIN_SCRIPT);
    expect(plainShots[0]).toBe(flank.id);
  });

  it("gives a defender its fire discipline as an order, so covering fire keeps it too", () => {
    const g = new Game({ seed: 3, enforceC2: false });
    const red = g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 9));
    g.beginTurn();
    g.advanceToPhase("movement");
    drillMovement(g, { side: "RED", attacking: false, objective: { x: 0, y: -600 } }, WESTERN_DRILL, new DrillState());
    expect(g.standingOrderFor(red.id)).toMatchObject({ holdFire: true, engagementRange: WESTERN_DRILL.openFireRange });
  });

  it("moves a shelled defender off its position once, to the rear, when no enemy is close", () => {
    const g = new Game({ seed: 3, enforceC2: false });
    const red = g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 9));
    red.downUnderShelling = true;
    g.beginTurn();
    g.advanceToPhase("movement");
    const drill = { ...WESTERN_DRILL, displace: { metres: 100, contactWithin: 300 } };
    const defend = { side: "RED" as const, attacking: false, objective: { x: 0, y: -600 } };
    const state = new DrillState();
    drillMovement(g, defend, drill, state);
    // Away from where the attacker comes from, and only once.
    expect(red.position.y).toBeGreaterThan(0);
    expect(state.displaced.has(red.id)).toBe(true);
    // Without the option it stays in its hole.
    const h = new Game({ seed: 3, enforceC2: false });
    const stays = h.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 9));
    stays.downUnderShelling = true;
    h.beginTurn();
    h.advanceToPhase("movement");
    drillMovement(h, defend, WESTERN_DRILL, new DrillState());
    expect(stays.position).toEqual({ x: 0, y: 0 });
  });

  it("breaks contact once at half strength, and then holds where it fell back to", () => {
    const { g, blue } = field(false);
    g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 200 }, 9));
    const state = new DrillState();
    g.advanceToPhase("movement");
    state.startingStrength(blue);
    blue.soldiers!.slice(0, 5).forEach((s) => (s.neutralized = true));
    drillMovement(g, attack, WESTERN_DRILL, state);
    expect(g.standingOrderFor(blue.id)?.withdraw).toBe(true);
    expect(blue.position.y).toBeLessThan(0);
    // Next turn it does not run again, nor go forward: it holds.
    g.advanceToPhase("summary");
    g.advanceToPhase("movement");
    const y = blue.position.y;
    drillMovement(g, attack, WESTERN_DRILL, state);
    const order = g.standingOrderFor(blue.id);
    expect(order?.destination == null || order.withdraw === true).toBe(true);
    expect(blue.position.y).toBeLessThanOrEqual(y);
  });
});

describe("a squad's grenadiers (rules decision 45)", () => {
  const facing = (range: number, men = 9) => {
    const g = new Game({ seed: 3, enforceC2: false });
    const blue = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, men));
    const red = g.addUnit(makeInfantry("R", "RED", "platoon", { x: 0, y: range }, 30));
    g.beginTurn();
    g.advanceToPhase("combat");
    return { g, blue, red };
  };

  it("fires one launcher for every four men still fighting, inside the rifle grenade's reach", () => {
    const { g, blue, red } = facing(80);
    const volleys = fireGrenadiers(g, blue, red, SQUAD_GRENADIERS.menPerLauncher);
    expect(volleys).toHaveLength(2);
    expect(volleys.every((v) => v.fired)).toBe(true);
    // A fire team carries one.
    const team = facing(80, 4);
    expect(fireGrenadiers(team.g, team.blue, team.red, 4)).toHaveLength(1);
  });

  it("holds them beyond it, so no shot is taken that could not land", () => {
    const { g, blue, red } = facing(150);
    expect(fireGrenadiers(g, blue, red, SQUAD_GRENADIERS.menPerLauncher)).toHaveLength(0);
    expect(blue.firedThisTurn).toBe(false);
  });

  it("is the drills' own rule", () => {
    expect(PLAIN_SCRIPT.grenadiers).toBe(SQUAD_GRENADIERS);
    expect(WESTERN_DRILL.grenadiers).toBe(SQUAD_GRENADIERS);
  });
});

/**
 * Reconnaissance (rules decision 52): the squad nearest the objective goes
 * ahead scouting on hold-fire; the rest wait until it has found something.
 */
/**
 * How a squad carries out its company's reconnaissance orders (rules
 * decisions 52–54). Which squads scout and when the rest go are the
 * company's (`company.test.ts`); how a scout bounds, looks, holds its fire
 * and lies up, and how the rest wait, are the drill's.
 */
describe("the drill carrying out its company's orders", () => {
  function field() {
    const g = new Game({ seed: 3, trackIntel: true, enforceC2: false });
    const lead = g.addUnit(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 40 }, 9));
    const rest = g.addUnit(makeInfantry("B2", "BLUE", "squad", { x: 80, y: 0 }, 9));
    g.beginTurn();
    g.setScouting(lead.id, true);
    return { g, lead, rest };
  }
  const orders = (o: Partial<CompanyOrders> = {}): DrillTask => ({
    ...attack,
    company: { scouts: new Map([["B1", null]]), scoutsLieUp: false, hold: true, waitAt: new Map(), ...o },
  });

  it("sends the scout ahead holding its fire, and holds the rest where they stand", () => {
    const { g, lead, rest } = field();
    g.advanceToPhase("movement");
    drillMovement(g, orders(), PLAIN_SCRIPT, new DrillState());
    expect(lead.position.y).toBeGreaterThan(40);
    expect(g.standingOrderFor(lead.id)?.holdFire).toBe(true);
    expect(rest.position).toEqual({ x: 80, y: 0 });
  });

  it("holds the rest where the company says: in dead ground, if it has any sense", () => {
    const { g, rest } = field();
    g.advanceToPhase("movement");
    drillMovement(g, orders({ waitAt: new Map([["B2", { x: 80, y: -40 }]]) }), PLAIN_SCRIPT, new DrillState());
    expect(rest.position).toEqual({ x: 80, y: -40 });
  });

  it("bounds and observes: after each bound the scout halts to watch", () => {
    const { g, lead } = field();
    const state = new DrillState();
    const looking = { ...PLAIN_SCRIPT, scouting: { watchTurns: 2 } };
    const ys: number[] = [];
    for (let t = 0; t < 6; t++) {
      g.advanceToPhase("movement");
      drillMovement(g, orders(), looking, state);
      ys.push(Math.round(lead.position.y));
      g.advanceToPhase("initiative");
    }
    // Two turns watching, one bound, two watching, one bound.
    expect(ys).toEqual([40, 40, 90, 90, 90, 140]);
  });

  it("goes to its observation point and lies up there", () => {
    const { g, lead } = field();
    const state = new DrillState();
    const post = { x: 0, y: 140 };
    for (let t = 0; t < 5; t++) {
      g.advanceToPhase("movement");
      drillMovement(g, orders({ scouts: new Map([["B1", post]]) }), PLAIN_SCRIPT, state);
      g.advanceToPhase("initiative");
    }
    expect(lead.position).toEqual(post);
  });

  it("lies up and watches when told, and never fires: what it sees stays on the map", () => {
    const { g, lead } = field();
    const red = g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 200 }, 9));
    g.advanceToPhase("combat");
    g.fire(red.id, lead.id, { weapon: "smallArms" });
    expect(g.knows("BLUE", red.id)).toBe(true);
    drillCombat(g, orders(), PLAIN_SCRIPT);
    expect(lead.firedThisTurn).toBe(false);
    g.advanceToPhase("initiative");
    g.advanceToPhase("movement");
    const at = { ...lead.position };
    drillMovement(g, orders({ scoutsLieUp: true }), PLAIN_SCRIPT, new DrillState());
    expect(lead.position).toEqual(at);
  });

  it("lets the rest go when the company does", () => {
    const { g, rest } = field();
    const state = new DrillState();
    for (let t = 0; t < 2; t++) {
      g.advanceToPhase("movement");
      drillMovement(g, orders({ hold: false, scoutsLieUp: true }), PLAIN_SCRIPT, state);
      g.advanceToPhase("initiative");
    }
    expect(rest.position).not.toEqual({ x: 80, y: 0 });
  });
});

describe("a scout on its way to its observation point", () => {
  it("goes on to it when the company has the enemy in sight, and lies up once there", () => {
    const g = new Game({ seed: 3, trackIntel: true, enforceC2: false });
    const scout = g.addUnit(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 40 }, 9));
    g.addUnit(makeInfantry("B2", "BLUE", "squad", { x: 80, y: 0 }, 9));
    g.beginTurn();
    g.setScouting(scout.id, true);
    const post = { x: 0, y: 190 };
    const task: DrillTask = {
      ...attack,
      company: { scouts: new Map([["B1", post]]), scoutsLieUp: true, hold: true, waitAt: new Map() },
    };
    const state = new DrillState();
    for (let t = 0; t < 8; t++) {
      g.advanceToPhase("movement");
      drillMovement(g, task, PLAIN_SCRIPT, state);
      g.advanceToPhase("initiative");
    }
    expect(scout.position).toEqual(post);
  });
});

describe("the company's axis and base of fire", () => {
  it("goes by the axis point before the objective", () => {
    const g = new Game({ seed: 3, trackIntel: true, enforceC2: false });
    const squad = g.addUnit(makeInfantry("B2", "BLUE", "squad", { x: 0, y: 0 }, 9));
    g.beginTurn();
    const via = { x: -300, y: 0 };
    const task: DrillTask = { ...attack, company: { scouts: new Map(), scoutsLieUp: false, hold: false, waitAt: new Map(), attackVia: via } };
    const state = new DrillState();
    g.advanceToPhase("movement");
    drillMovement(g, task, PLAIN_SCRIPT, state);
    // Heading west, to the axis point, not north to the objective at (0, 600).
    expect(squad.position.x).toBeLessThan(0);
    expect(squad.position.y).toBe(0);
  });

  it("lets its scouts fire once the company has gone, when told to give a base of fire", () => {
    const setUp = (scoutsFire: boolean, hold: boolean) => {
      const g = new Game({ seed: 3, enforceC2: false });
      const scout = g.addUnit(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 0 }, 9));
      g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 150 }, 9));
      g.beginTurn();
      g.advanceToPhase("combat");
      const company = { scouts: new Map([["B1", null]]), scoutsLieUp: true, hold, waitAt: new Map(), scoutsFire };
      drillCombat(g, { ...attack, company }, PLAIN_SCRIPT);
      return scout.firedThisTurn;
    };
    expect(setUp(true, false)).toBe(true);
    expect(setUp(false, false)).toBe(false);
    expect(setUp(true, true)).toBe(false); // not while the company still holds
  });
});
