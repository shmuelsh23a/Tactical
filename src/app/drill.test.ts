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
  SCOUT_GIVE_UP_TURNS,
  type DrillTask,
} from "./drill.js";
import { HOLD_SHORT_M, type CompanyOrders } from "./company.js";

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
  it("keeps its command group on the map when its squads stand on the objective itself", () => {
    // The squads' centre on the objective: there is no "behind" to step back
    // to, and the command group once went to NaN (the raid, 39 battles in 100).
    const { g } = field();
    g.advanceToPhase("movement");
    drillMovement(g, { side: "BLUE", attacking: true, objective: { x: 0, y: 0 } }, PLAIN_SCRIPT, new DrillState());
    const hq = g.getUnit("B-HQ");
    expect(Number.isFinite(hq.position.x) && Number.isFinite(hq.position.y)).toBe(true);
    // …and the engine refuses such a move outright.
    expect(() => g.moveUnit("B", { x: NaN, y: 0 })).toThrow(/cannot move to/);
  });

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

  it("keeps a defending command post where it was set up, and brings an attacker's up behind its squads", () => {
    const g = new Game({ seed: 3, enforceC2: false });
    g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 9));
    const post = g.addUnit(makeCommandGroup("R-HQ", "RED", "company", { x: 0, y: -300 }));
    g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 900 }, 9));
    const hq = g.addUnit(makeCommandGroup("B-HQ", "BLUE", "platoon", { x: 0, y: 1200 }));
    g.beginTurn();
    g.advanceToPhase("movement");
    drillMovement(g, { side: "RED", attacking: false, objective: { x: 0, y: 900 } }, WESTERN_DRILL, new DrillState());
    expect(post.position).toEqual({ x: 0, y: -300 });
    drillMovement(g, { side: "BLUE", attacking: true, objective: { x: 0, y: 0 } }, WESTERN_DRILL, new DrillState());
    expect(hq.position.y).toBeLessThan(1200);
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

  it("at its point seeing nothing, goes on by itself, unless its commander decides that (scoutsStay)", () => {
    const run = (scoutsStay: boolean) => {
      const { g, lead } = field();
      const state = new DrillState();
      const post = { x: 0, y: 90 };
      for (let t = 0; t < SCOUT_GIVE_UP_TURNS + 6; t++) {
        g.advanceToPhase("movement");
        drillMovement(g, orders({ scouts: new Map([["B1", post]]), ...(scoutsStay ? { scoutsStay } : {}) }), PLAIN_SCRIPT, state);
        g.advanceToPhase("initiative");
      }
      return lead.position.y;
    };
    expect(run(false)).toBeGreaterThan(90);
    expect(run(true)).toBe(90);
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

/**
 * Platoon control once the company goes (item 2): each platoon's task, bounding
 * by platoon, and holding short until the fires lift. The company commander
 * gives them (`company.ts`); the squads carry them out.
 */
describe("the drill carrying out its platoons' tasks", () => {
  function field() {
    const g = new Game({ seed: 3, trackIntel: true, enforceC2: false });
    const a = g.addUnit(makeInfantry("BLUE-1-1", "BLUE", "squad", { x: 0, y: 200 }, 9));
    const b = g.addUnit(makeInfantry("BLUE-2-1", "BLUE", "squad", { x: 60, y: 200 }, 9));
    const r = g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 500 }, 9));
    g.beginTurn();
    // Found by its fire: the mark stays where it was seen.
    g.advanceToPhase("combat");
    g.fire(r.id, a.id, { weapon: "smallArms" });
    g.fire(r.id, b.id, { weapon: "smallArms" });
    g.advanceToPhase("initiative");
    // Then the squads start from out of small-arms reach.
    a.position = { x: 0, y: 0 };
    b.position = { x: 60, y: 0 };
    return { g, a, b };
  }
  const platoonOf = new Map([
    ["BLUE-1-1", "BLUE-1"],
    ["BLUE-2-1", "BLUE-2"],
  ]);
  const orders = (o: Partial<CompanyOrders> = {}): DrillTask => ({
    ...attack,
    objective: { x: 0, y: 500 },
    company: { scouts: new Map(), scoutsLieUp: false, hold: false, waitAt: new Map(), platoonOf, fallBackTo: { x: 30, y: -100 }, ...o },
  });
  const turn = (g: Game, task: DrillTask, state = new DrillState()) => {
    g.advanceToPhase("movement");
    drillMovement(g, task, PLAIN_SCRIPT, state);
    g.advanceToPhase("initiative");
  };

  it("halts a platoon told to halt, and moves the one told to assault", () => {
    const { g, a, b } = field();
    const state = new DrillState();
    for (let t = 0; t < 3; t++) turn(g, orders({ platoonTasks: new Map([["BLUE-1", "halt"]]) }), state);
    expect(a.position).toEqual({ x: 0, y: 0 });
    expect(b.position.y).toBeGreaterThan(0);
  });

  it("holds the reserve where it waited, and pulls a platoon back to the start line", () => {
    const { g, a, b } = field();
    const tasks = new Map([
      ["BLUE-1", "reserve" as const],
      ["BLUE-2", "withdraw" as const],
    ]);
    for (let t = 0; t < 4; t++) turn(g, orders({ platoonTasks: tasks }));
    expect(a.position).toEqual({ x: 0, y: 0 });
    expect(b.position.y).toBeLessThan(0);
  });

  it("gives a base of fire: closes to small-arms reach, then halts", () => {
    const { g, a } = field();
    const state = new DrillState();
    for (let t = 0; t < 8; t++) turn(g, orders({ platoonTasks: new Map([["BLUE-1", "support"]]) }), state);
    const d = 500 - a.position.y;
    expect(d).toBeLessThanOrEqual(PLAIN_SCRIPT.attackFireRange);
    expect(d).toBeGreaterThan(PLAIN_SCRIPT.attackFireRange - 120);
  });

  it("holds the assault short of the enemy until the fires lift", () => {
    const { g, a } = field();
    const state = new DrillState();
    for (let t = 0; t < 12; t++) turn(g, orders({ holdShort: true }), state);
    expect(500 - a.position.y).toBeGreaterThan(HOLD_SHORT_M - 60);
    expect(500 - a.position.y).toBeLessThanOrEqual(HOLD_SHORT_M + 60);
  });

  it("bounds by platoon: one moves while the other halts", () => {
    const { g, a, b } = field();
    g.advanceToPhase("movement");
    const [ay, by] = [a.position.y, b.position.y];
    drillMovement(g, orders({ boundByPlatoon: true }), PLAIN_SCRIPT, new DrillState());
    const moved = [a.position.y > ay, b.position.y > by];
    expect(moved.filter(Boolean)).toHaveLength(1);
  });
});

describe("a defending platoon's reserve (rules decision 60)", () => {
  // RED holds facing south: a forward squad on its post at the origin, the
  // platoon's reserve 100 m behind it. Without the knowledge model the side
  // sees what is in 300 m, so an enemy on the post is known.
  const defend = (reserves = ["RED-A-1"]): DrillTask => ({
    side: "RED",
    attacking: false,
    objective: { x: 0, y: 600 },
    reserves: new Set(reserves),
  });
  function field(enemyAt = { x: 0, y: 30 }) {
    const g = new Game({ seed: 3, trackIntel: false, enforceC2: false });
    const reserve = g.addUnit(makeInfantry("RED-A-1", "RED", "squad", { x: 0, y: -100 }, 8));
    const forward = g.addUnit(makeInfantry("RED-A-2", "RED", "squad", { x: 0, y: 0 }, 8));
    const enemy = g.addUnit(makeInfantry("B", "BLUE", "squad", enemyAt, 8));
    g.beginTurn();
    return { g, reserve, forward, enemy };
  }
  const move = (g: Game, task: DrillTask, state: DrillState, drill = PLAIN_SCRIPT) => {
    g.advanceToPhase("movement");
    drillMovement(g, task, drill, state);
  };

  it("holds the reserve in its position while the forward squad holds its post", () => {
    const { g, reserve } = field();
    const state = new DrillState();
    move(g, defend(), state);
    expect(state.counterattacking.size).toBe(0);
    expect(reserve.position).toEqual({ x: 0, y: -100 });
    expect(g.standingOrderFor(reserve.id)).toMatchObject({ holdFire: true });
  });

  it("counterattacks a lost post: its squad out of the fight, an enemy known on it", () => {
    const { g, reserve, forward } = field();
    const state = new DrillState();
    move(g, defend(), state); // the drill learns the posts
    g.advanceToPhase("initiative");
    forward.neutralized = true;
    move(g, defend(), state);
    expect(state.counterattacking.get(reserve.id)).toEqual({ x: 0, y: 0 });
    expect(g.standingOrderFor(reserve.id)).toMatchObject({ gait: PLAIN_SCRIPT.counterattack!.gait });
    expect(g.standingOrderFor(reserve.id)?.holdFire).not.toBe(true);
    expect(reserve.position.y).toBeGreaterThan(-100);
  });

  it("does not go while no enemy is known on the lost post", () => {
    const { g, reserve, forward } = field({ x: 0, y: 200 });
    const state = new DrillState();
    move(g, defend(), state);
    g.advanceToPhase("initiative");
    forward.neutralized = true;
    move(g, defend(), state);
    expect(state.counterattacking.size).toBe(0);
    expect(reserve.position).toEqual({ x: 0, y: -100 });
  });

  it("stays put under a drill without the counterattack", () => {
    const { g, reserve, forward } = field();
    const state = new DrillState();
    const drill = { ...PLAIN_SCRIPT, counterattack: null };
    move(g, defend(), state, drill);
    g.advanceToPhase("initiative");
    forward.neutralized = true;
    move(g, defend(), state, drill);
    expect(state.counterattacking.size).toBe(0);
    expect(reserve.position).toEqual({ x: 0, y: -100 });
  });

  it("answers only for its own platoon's posts", () => {
    const { g, reserve, forward } = field();
    const other = g.addUnit(makeInfantry("RED-B-1", "RED", "squad", { x: 0, y: -120 }, 8));
    const state = new DrillState();
    move(g, defend(["RED-B-1"]), state);
    g.advanceToPhase("initiative");
    forward.neutralized = true;
    move(g, defend(["RED-B-1"]), state);
    expect(state.counterattacking.has(other.id)).toBe(false);
    // RED-A-1 is a forward squad here, not a reserve: it holds.
    expect(state.counterattacking.has(reserve.id)).toBe(false);
  });

  it("assaults the enemy on the post before a nearer one off it", () => {
    const { g, reserve, forward, enemy } = field({ x: 0, y: 10 });
    const state = new DrillState();
    move(g, defend(), state);
    g.advanceToPhase("initiative");
    forward.neutralized = true;
    move(g, defend(), state);
    // Close enough to assault the enemy on the post; a second one nearer, off it.
    reserve.position = { x: 0, y: -10 };
    g.addUnit(makeInfantry("B2", "BLUE", "squad", { x: -18, y: -12 }, 8));
    g.advanceToPhase("combat");
    const assaulted: string[] = [];
    const assault = g.assault.bind(g);
    g.assault = (a, t, n) => (assaulted.push(t), assault(a, t, n));
    drillCombat(g, defend(), PLAIN_SCRIPT, state);
    expect(assaulted).toEqual([enemy.id]);
  });

  it("neither starts nor aims a counterattack on a stale mark", () => {
    // With the knowledge model: the enemy on the post is found by its fire,
    // then slips away unseen. Its mark stays where it was (decision 57).
    const g = new Game({ seed: 3, trackIntel: true, enforceC2: false });
    const reserve = g.addUnit(makeInfantry("RED-A-1", "RED", "squad", { x: 0, y: -100 }, 8));
    const forward = g.addUnit(makeInfantry("RED-A-2", "RED", "squad", { x: 0, y: 0 }, 8));
    const enemy = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 30 }, 8));
    g.beginTurn();
    const state = new DrillState();
    move(g, defend(), state);
    g.advanceToPhase("combat");
    g.fire(enemy.id, forward.id, { weapon: "smallArms" });
    enemy.position = { x: 0, y: 900 };
    forward.neutralized = true;
    for (let t = 0; t < 3; t++) g.advanceToPhase("initiative"), g.advanceToPhase("combat");
    expect(g.contactFor("RED", enemy.id)!.lastSeenTurn).toBeLessThan(g.turn - 1);
    g.advanceToPhase("initiative");
    move(g, defend(), state);
    expect(state.counterattacking.size).toBe(0);
    expect(reserve.position).toEqual({ x: 0, y: -100 });
    // Committed on a fresh sighting, a reserve whose foe goes stale goes on
    // to the post rather than waiting at the old mark.
    state.counterattacking.set(reserve.id, { x: 0, y: 0 });
    g.advanceToPhase("initiative");
    move(g, defend(), state);
    // It makes for the post (the mark is 30 m past it), and stops there.
    for (let t = 0; t < 3; t++) g.advanceToPhase("initiative"), move(g, defend(), state);
    expect(reserve.position).toEqual({ x: 0, y: 0 });
  });

  it("does not count a squad gone to its alternate position as a lost post", () => {
    const { g, reserve, forward } = field();
    const state = new DrillState();
    move(g, defend(), state);
    g.advanceToPhase("initiative");
    forward.position = { x: 0, y: -60 };
    state.displaced.add(forward.id);
    move(g, defend(), state);
    expect(state.counterattacking.size).toBe(0);
    expect(reserve.position).toEqual({ x: 0, y: -100 });
  });

  it("takes the post once no enemy is known on it, and holds it by the drill", () => {
    const { g, reserve, forward, enemy } = field();
    const state = new DrillState();
    move(g, defend(), state);
    g.advanceToPhase("initiative");
    forward.neutralized = true;
    move(g, defend(), state);
    g.advanceToPhase("initiative");
    enemy.neutralized = true;
    for (let t = 0; t < 6; t++) {
      move(g, defend(), state);
      g.advanceToPhase("initiative");
    }
    expect(reserve.position).toEqual({ x: 0, y: 0 });
    expect(g.standingOrderFor(reserve.id)).toMatchObject({ holdFire: true, engagementRange: PLAIN_SCRIPT.openFireRange });
  });
});
