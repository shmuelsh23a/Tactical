import { describe, expect, it } from "vitest";
import { Game, makeInfantry, replayGame, stateDigest, type Point, type Unit } from "../engine/index.js";
import type { CompanyOrders } from "./company.js";
import {
  BOUNDARY_ASK_AGAIN_TURNS,
  BOUNDARY_REDRAW_MARGIN_M,
  DOCTRINAL_DRILL,
  DrillState,
  answerBoundaryRequest,
  boundaryEnds,
  boundaryFrom,
  boundaryRedraw,
  drillCombat,
  drillMovement,
  laneOf,
  pruneBoundaryRequests,
  westOfBoundary,
  type DrillTask,
  type SectorHalf,
  type SquadDrill,
} from "./drill.js";
import { boundaryLanes, validateOrder, type CompanyOrder } from "./order.js";
import { REFERENCE_ORDERS } from "./referenceOrders.js";
import { battleMarks, choicesOf, defaultChoices, formMarks, orderOf } from "./orderForm.js";
import { telAzekaAssaultListing } from "./scenarios/telAzekaAssault.js";
import { ComputerDefender } from "./computerSide.js";
import { buildActivations, sideDefeated } from "./hotseat.js";
import { OrderedAttacker } from "./orderedAttacker.js";
import { briefedObjective } from "./planning.js";
import { boundaryAnswerHe, boundaryRequestHe } from "./debriefText.js";
import { DEFAULT_FIRE_CHOICES, runScenarioBattle } from "../sim/scenarioBattle.js";
import { REFERENCE_DRILL } from "./drill.js";

/**
 * The boundary (FM 3-90 (2023) para A-16; decision 132): each laned platoon
 * moves only in its lane, from the start line to 100 m short of the
 * objective; fires across only where no friend can be hit; never closes with
 * an enemy across; and asks the commander to redraw the line when it holds it
 * back. The line of attack runs south to north here: start y 0, objective y 600.
 */
const START: Point = { x: 0, y: 0 };
const OBJECTIVE: Point = { x: 0, y: 600 };
const drill: SquadDrill = { ...DOCTRINAL_DRILL, fireTeams: undefined };
const company = (over: Partial<CompanyOrders> = {}): CompanyOrders => ({
  scouts: new Map(),
  scoutsLieUp: true,
  hold: false,
  waitAt: new Map(),
  fallBackTo: START,
  ...over,
});
function task(lanes: Record<string, SectorHalf>, over: Partial<DrillTask> = {}): DrillTask {
  return { side: "BLUE", attacking: true, objective: OBJECTIVE, company: company(), boundary: boundaryFrom(START, OBJECTIVE, lanes), ...over };
}

describe("the boundary as a line (decision 132)", () => {
  const b = boundaryFrom(START, OBJECTIVE, { "BLUE-1": "west" });

  it("runs along the line of attack from the start line to 100 m short of the objective, west the lesser x", () => {
    expect(laneOf(b, { x: -10, y: 300 })).toBe("west");
    expect(laneOf(b, { x: 10, y: 300 })).toBe("east");
    expect(laneOf(b, { x: 10, y: 499 })).toBe("east");
    expect(laneOf(b, { x: 10, y: 501 })).toBeUndefined(); // past its end: the objective is not split
    const [from, to] = boundaryEnds(b);
    expect(from).toEqual({ x: 0, y: 0 });
    expect(to.x).toBeCloseTo(0);
    expect(to.y).toBeCloseTo(500);
  });

  it("moves sideways when redrawn", () => {
    const moved = { ...b, shiftWestM: -40 }; // 40 m east
    expect(laneOf(moved, { x: 20, y: 300 })).toBe("west");
    expect(westOfBoundary(moved, { x: 20, y: 300 })).toBeCloseTo(20);
    expect(boundaryEnds(moved)[0].x).toBeCloseTo(40);
  });
});

/** A squad of BLUE-1 in the west lane, the enemy in the east one: the drill would go at it. */
function field(at: Point = { x: -30, y: 200 }, enemyAt: Point = { x: 150, y: 330 }) {
  const g = new Game({ seed: 3, trackIntel: false, enforceC2: false });
  const us = g.addUnit(makeInfantry("BLUE-1-1", "BLUE", "squad", at, 9));
  const enemy = g.addUnit(makeInfantry("RED-A-1", "RED", "squad", enemyAt, 9));
  g.beginTurn();
  // Turn 2: in contact, a lone squad bounds on even turns and overwatches on odd ones (`overwatch`).
  g.advanceToPhase("summary");
  g.advanceToPhase("initiative");
  g.advanceToPhase("movement");
  return { g, us, enemy };
}

/** Where a force's standing order sends it once the drill has moved it, and its lane there. */
function moved(g: Game, t: DrillTask, state: DrillState, u: Unit) {
  drillMovement(g, t, drill, state);
  return g.getUnit(u.id).position;
}

describe("a laned platoon's moves (decision 132)", () => {
  it("is held in its lane, just inside it, and asks to have the line moved", () => {
    const { g, us } = field();
    const t = task({ "BLUE-1": "west" });
    const state = new DrillState();
    const at = moved(g, t, state, us);
    expect(westOfBoundary(t.boundary!, at)).toBeGreaterThanOrEqual(0);
    expect(state.boundaryRequests.get("BLUE-1")).toMatchObject({ platoon: "BLUE-1", turn: g.turn });
    expect(laneOf(t.boundary!, state.boundaryRequests.get("BLUE-1")!.wanted)).toBe("east");
  });

  it("goes where the drill sends it with no boundary", () => {
    const { g, us } = field();
    const at = moved(g, { side: "BLUE", attacking: true, objective: OBJECTIVE, company: company() }, new DrillState(), us);
    expect(at.x).toBeGreaterThan(0);
  });

  it("is only brought into its lane when the start line put it out of it: no request", () => {
    const { g, us } = field({ x: 60, y: 100 }, { x: 70, y: 330 });
    const t = task({ "BLUE-1": "west" });
    const state = new DrillState();
    const at = moved(g, t, state, us);
    expect(westOfBoundary(t.boundary!, at)).toBeGreaterThanOrEqual(0);
    expect(state.boundaryRequests.size).toBe(0);
  });

  it("leaves a scout to its post until the company goes (H-hour), then holds it", () => {
    const { g, us } = field();
    const scouting = task({ "BLUE-1": "west" }, { company: company({ hold: true, scouts: new Map([["BLUE-1-1", { x: 150, y: 250 }]]) }) });
    const state = new DrillState();
    const at = moved(g, scouting, state, us);
    expect(westOfBoundary(scouting.boundary!, at)).toBeLessThan(0);
    expect(state.boundaryRequests.size).toBe(0);
  });

  it("asks nothing for a routing force: it is the engine's, and may cross (the review)", () => {
    const { g, us } = field();
    us.routing = true;
    const state = new DrillState();
    drillMovement(g, task({ "BLUE-1": "west" }), drill, state);
    expect(state.boundaryRequests.size).toBe(0);
  });

  it("holds a destination a few metres over the line without asking (the review)", () => {
    const { g, us } = field({ x: -30, y: 200 }, { x: 2, y: 330 });
    const t = task({ "BLUE-1": "west" });
    const state = new DrillState();
    const at = moved(g, t, state, us);
    expect(westOfBoundary(t.boundary!, at)).toBeGreaterThanOrEqual(0);
    expect(state.boundaryRequests.size).toBe(0);
  });

  it("holds a force past the end coming back into the other lane short of it, asking nothing (the review)", () => {
    // Past the end at y 520; the enemy behind it in the east lane at y 380: the drill goes back for it.
    const { g, us } = field({ x: -30, y: 520 }, { x: 150, y: 380 });
    const t = task({ "BLUE-1": "west" });
    const state = new DrillState();
    const at = moved(g, t, state, us);
    expect(laneOf(t.boundary!, at)).toBe("west");
    expect(westOfBoundary(t.boundary!, at)).toBeCloseTo(5, 0);
    expect(state.boundaryRequests.size).toBe(0);
  });

  it("leaves a platoon the order gave no lane to move freely", () => {
    const { g, us } = field();
    const at = moved(g, task({ "BLUE-2": "east" }), new DrillState(), us);
    expect(at.x).toBeGreaterThan(0);
  });
});

describe("the commander's answer (decision 132)", () => {
  function asked(neighbourAt?: Point) {
    const f = field();
    if (neighbourAt) f.g.addUnit(makeInfantry("BLUE-2-1", "BLUE", "squad", neighbourAt, 9));
    const t = task({ "BLUE-1": "west", "BLUE-2": "east" });
    const state = new DrillState();
    drillMovement(f.g, t, drill, state);
    return { ...f, t, state, wanted: state.boundaryRequests.get("BLUE-1")!.wanted };
  }

  it("granted, moves the line so the place asked for is well inside the lane", () => {
    const { g, t, state, wanted } = asked();
    const a = answerBoundaryRequest(g, t, state, "BLUE-1", true)!;
    expect(a).toMatchObject({ platoon: "BLUE-1", granted: true, from: 0 });
    expect(westOfBoundary(t.boundary!, wanted)).toBeCloseTo(BOUNDARY_REDRAW_MARGIN_M);
    expect(state.boundaryRequests.size).toBe(0);
    expect(boundaryAnswerHe(a)).toContain("מזרחה");
  });

  it("goes no nearer the neighbouring lane's forces than the margin: partly", () => {
    const { g, t, state, wanted } = asked({ x: 40, y: 250 });
    expect(boundaryRedraw(g, t, state, "BLUE-1")).toMatchObject({ partly: true });
    const a = answerBoundaryRequest(g, t, state, "BLUE-1", true)!;
    expect(a).toMatchObject({ granted: true, partly: true });
    expect(westOfBoundary(t.boundary!, { x: 40, y: 250 })).toBeCloseTo(-BOUNDARY_REDRAW_MARGIN_M);
    expect(westOfBoundary(t.boundary!, wanted)).toBeLessThan(BOUNDARY_REDRAW_MARGIN_M);
  });

  it("cannot be granted with the neighbours where the line would go: it stays, and the platoon waits", () => {
    const { g, t, state } = asked({ x: 10, y: 250 });
    expect(boundaryRedraw(g, t, state, "BLUE-1")).toBeUndefined();
    expect(boundaryRequestHe(state.boundaryRequests.get("BLUE-1")!, undefined)).toContain("אפשר רק לדחות");
    const a = answerBoundaryRequest(g, t, state, "BLUE-1", true)!;
    expect(a).toMatchObject({ granted: false, blocked: true, from: 0, to: 0 });
    expect(t.boundary!.shiftWestM).toBe(0);
    expect(state.boundaryRefused.get("BLUE-1")).toBe(g.turn);
  });

  it("counts the wait from the turn it asked, whenever the answer comes (the review)", () => {
    const { g, t, state } = asked();
    const turn = state.boundaryRequests.get("BLUE-1")!.turn;
    g.advanceToPhase("summary");
    g.advanceToPhase("initiative"); // the app answers as the next turn opens
    answerBoundaryRequest(g, t, state, "BLUE-1", false);
    expect(state.boundaryRefused.get("BLUE-1")).toBe(turn);
  });

  it("drops a request nobody needs answered any more: what it asked for is in its lane now, or its platoon is gone", () => {
    const moved = asked();
    moved.t.boundary!.shiftWestM = -200; // another's grant took the line well east
    pruneBoundaryRequests(moved.g, moved.t, moved.state);
    expect(moved.state.boundaryRequests.size).toBe(0);
    expect(moved.state.boundaryRefused.size).toBe(0);
    const gone = asked();
    gone.us.neutralized = true;
    pruneBoundaryRequests(gone.g, gone.t, gone.state);
    expect(gone.state.boundaryRequests.size).toBe(0);
  });

  it("refused, asks again no sooner than five turns on", () => {
    const { g, us, t, state } = asked();
    answerBoundaryRequest(g, t, state, "BLUE-1", false);
    const asks: number[] = [];
    for (let turn = 0; turn < BOUNDARY_ASK_AGAIN_TURNS + 3; turn++) {
      g.advanceToPhase("summary");
      g.advanceToPhase("initiative");
      g.advanceToPhase("movement");
      us.position = { x: -30, y: 200 }; // back where it asked from, so the drill wants across again
      drillMovement(g, t, drill, state);
      if (state.boundaryRequests.has("BLUE-1")) {
        asks.push(g.turn);
        state.boundaryRequests.delete("BLUE-1");
      }
    }
    // It wants across only on the turns it bounds (even ones, in contact): the first of those five or more on.
    expect(asks.length).toBeGreaterThan(0);
    expect(Math.min(...asks)).toBeGreaterThanOrEqual(state.boundaryRefused.get("BLUE-1")! + BOUNDARY_ASK_AGAIN_TURNS);
  });
});

describe("fire and assault across the boundary (decision 132)", () => {
  function shotAt(g: Game, t: DrillTask): string[] {
    const at: string[] = [];
    g.advanceToPhase("combat");
    drillCombat(g, t, drill, new DrillState(), {
      fired: (u, e) => u.id === "BLUE-1-1" && at.push(e.id),
      assaulted: (u, e) => u.id === "BLUE-1-1" && at.push(`assault:${e.id}`),
    });
    return at;
  }

  it("fires across where no friend can be hit", () => {
    const { g } = field({ x: -10, y: 200 }, { x: 60, y: 300 });
    expect(shotAt(g, task({ "BLUE-1": "west" }))).toEqual(["RED-A-1"]);
  });

  it("holds its fire across with a friend within 50 m of the target", () => {
    const { g } = field({ x: -10, y: 200 }, { x: 60, y: 300 });
    g.addUnit(makeInfantry("BLUE-2-1", "BLUE", "squad", { x: 90, y: 280 }, 9));
    expect(shotAt(g, task({ "BLUE-1": "west" }))).toEqual([]);
    // …which, with no boundary, it would fire through: the rule is the boundary's.
    const again = field({ x: -10, y: 200 }, { x: 60, y: 300 });
    again.g.addUnit(makeInfantry("BLUE-2-1", "BLUE", "squad", { x: 90, y: 280 }, 9));
    expect(shotAt(again.g, { side: "BLUE", attacking: true, objective: OBJECTIVE })).toEqual(["RED-A-1"]);
  });

  it("holds its fire across with a friend within 10 m of the line of fire", () => {
    const { g } = field({ x: -10, y: 200 }, { x: 110, y: 360 });
    g.addUnit(makeInfantry("BLUE-2-1", "BLUE", "squad", { x: 45, y: 270 }, 9)); // on the line, about 85 m out
    expect(shotAt(g, task({ "BLUE-1": "west" }))).toEqual([]);
  });

  it("never assaults across: an enemy within reach across the line is fired on instead", () => {
    const { g } = field({ x: -5, y: 200 }, { x: 12, y: 210 });
    expect(shotAt(g, task({ "BLUE-1": "west" }))).toEqual(["RED-A-1"]);
    const free = field({ x: -5, y: 200 }, { x: 12, y: 210 });
    expect(shotAt(free.g, { side: "BLUE", attacking: true, objective: OBJECTIVE })).toEqual(["assault:RED-A-1"]);
  });
});

describe("the boundary in the order and on the form (decision 132)", () => {
  const PLATOONS = ["BLUE-1", "BLUE-2", "BLUE-3"];
  const base = REFERENCE_ORDERS[0]!.order;
  const withMeasures = (...m: CompanyOrder["execution"]["measures"]): CompanyOrder => ({ ...base, execution: { ...base.execution, measures: [...base.execution.measures, ...m] } });

  it("plays one boundary with each platoon's lane, and reads it back", () => {
    const o = withMeasures({ kind: "boundary", lanes: { "BLUE-1": "west", "BLUE-2": "east" } });
    expect(validateOrder(o, PLATOONS)).toEqual([]);
    expect(boundaryLanes(o)).toEqual({ "BLUE-1": "west", "BLUE-2": "east" });
    expect(boundaryLanes(base)).toEqual({});
  });

  it("refuses two boundaries, one with no lanes, a platoon the side has not, and the shape before decision 132", () => {
    const two = withMeasures({ kind: "boundary", lanes: { "BLUE-1": "west" } }, { kind: "boundary", lanes: { "BLUE-2": "east" } });
    expect(validateOrder(two, PLATOONS).map((p) => p.code)).toEqual(["oneBoundary"]);
    expect(validateOrder(withMeasures({ kind: "boundary", lanes: {} }), PLATOONS).map((p) => p.code)).toEqual(["boundaryEmpty"]);
    expect(validateOrder(withMeasures({ kind: "boundary", lanes: { "BLUE-9": "west" } }), PLATOONS).map((p) => p.code)).toEqual(["noSuchPlatoon"]);
    const old = withMeasures({ kind: "boundary", line: { name: "B", points: [] }, between: ["BLUE-1", "BLUE-2"] } as unknown as CompanyOrder["execution"]["measures"][number]);
    expect(validateOrder(old, PLATOONS).map((p) => p.code)).toEqual(["shape"]);
  });

  it("goes from the form into the order and back, and is drawn from the start line to short of the objective", () => {
    const c = { ...defaultChoices(REFERENCE_ORDERS), lanes: { "BLUE-1": "west" as const, "BLUE-2": "east" as const } };
    const order = orderOf(c, "telAzekaAssault", "BLUE");
    expect(validateOrder(order, PLATOONS)).toEqual([]);
    expect(choicesOf(order)?.lanes).toEqual(c.lanes);
    expect(choicesOf(base)?.lanes).toEqual({});
    const ground = { objective: { x: 500, y: 300 }, startLine: { x: 500, y: 900 }, observationPoints: [], flanks: [], assaultPosition: undefined, planned: [], platoons: ["BLUE-1", "BLUE-2"] };
    const line = formMarks(ground, c).find((m) => m.kind === "boundary")!;
    expect(line.at).toEqual({ x: 500, y: 900 });
    expect(line.to!.y).toBeCloseTo(400);
    expect(line.label).toContain("BLUE-1");
    // In the battle, the line as it now runs.
    const kept = battleMarks(formMarks(ground, c), [{ x: 540, y: 900 }, { x: 540, y: 400 }], c.lanes);
    expect(kept.filter((m) => m.kind === "boundary").map((m) => m.at.x)).toEqual([540]);
    expect(kept.some((m) => m.kind === "op")).toBe(false);
  });
});

/**
 * Plays an order in the browser's loop. Each turn, every laned force that
 * stood in its lane before the attacker moved, and is not a scout before
 * H-hour, is checked after: no more than a metre across the line.
 */
function playLaned(seed: number, order: CompanyOrder, turns: number, grant: boolean) {
  const built = telAzekaAssaultListing.build(seed);
  const g = built.game;
  const own = g.units.filter((u) => u.side === "BLUE" && u.kind !== "command");
  const startLine = { x: own.reduce((t, u) => t + u.position.x, 0) / own.length, y: own.reduce((t, u) => t + u.position.y, 0) / own.length };
  const lanes = boundaryLanes(order);
  const defender = new ComputerDefender(g, "RED", built);
  defender.plan(g);
  const ordered = new OrderedAttacker(g, "BLUE", order, built, telAzekaAssaultListing.brief, built.reserves ?? []);
  const objective = briefedObjective(g, "BLUE", "RED", undefined, built.reserves ?? []);
  let worst = -Infinity;
  let asked = 0;
  g.beginTurn();
  for (let t = 0; t < turns && !sideDefeated(g, "BLUE") && !sideDefeated(g, "RED"); t++) {
    for (const act of buildActivations(g.initiativeOrder)) {
      if (g.phase !== act.phase) ordered.heard(g.advanceToPhase(act.phase).resolved);
      const side = act.side === "BLUE" ? ordered : defender;
      if (act.side === "BLUE" && act.phase === "movement") {
        // The line as it runs this turn, redrawn by any grant before it.
        const b = { ...boundaryFrom(startLine, objective, lanes) };
        const line = ordered.boundaryLine()!;
        b.shiftWestM = westOfBoundary(b, line[0]);
        // Only forces that take orders: a rout, or a force out of command, keeps the order it has and may cross (decision 6; ⚠️ decision 132).
        const takes = (u: Unit) => !u.routing && !u.surrendered && (g.isUnderOrders(u.id) || g.canReceiveOrders(u.id));
        const before = new Map(g.units.filter((u) => u.side === "BLUE" && lanes[u.id.split("-").slice(0, 2).join("-")] && takes(u)).map((u) => [u.id, { ...u.position }]));
        side.movement(g);
        const scouting = ordered.asked.company.isScout;
        for (const [id, was] of before) {
          const u = g.getUnit(id);
          const lane = lanes[id.split("-").slice(0, 2).join("-")]!;
          const sign = lane === "west" ? 1 : -1;
          if (u.kind === "command" || laneOf(b, was) === undefined || sign * westOfBoundary(b, was) < 0) continue;
          if (ordered.asked.company.released === undefined && scouting.call(ordered.asked.company, u)) continue;
          if (laneOf(b, u.position) === undefined || u.routing) continue;
          worst = Math.max(worst, -sign * westOfBoundary(b, u.position));
        }
      } else if (act.phase === "targeting") side.targeting(g);
      else if (act.phase === "movement") side.movement(g);
      else side.combat(g);
    }
    ordered.heard(g.advanceToPhase("initiative").resolved);
    for (let r = ordered.pendingRequest(); r; r = ordered.pendingRequest()) {
      asked++;
      ordered.answer(g, r.platoon, grant);
    }
  }
  return { g, worst, asked, answers: ordered.boundaryAnswers };
}

describe("a boundary in a played battle (decision 132)", () => {
  const base = REFERENCE_ORDERS[0]!.order;
  const laned: CompanyOrder = { ...base, execution: { ...base.execution, measures: [...base.execution.measures, { kind: "boundary", lanes: { "BLUE-1": "west", "BLUE-2": "east" } }] } };

  const swapped: CompanyOrder = { ...base, execution: { ...base.execution, measures: [...base.execution.measures, { kind: "boundary", lanes: { "BLUE-1": "east", "BLUE-2": "west" } }] } };

  it("keeps every laned force that takes orders in its lane, turn after turn, either way round and granted or not, and the battle replays", () => {
    let nearest = -Infinity;
    let asked = 0;
    for (const seed of [1000, 1001, 1002])
      for (const [order, grant] of [[laned, false], [swapped, true]] as const) {
        const r = playLaned(seed, order, 40, grant);
        expect(r.worst).toBeLessThanOrEqual(1);
        nearest = Math.max(nearest, r.worst);
        asked += r.asked;
        if (seed === 1000) expect(stateDigest(replayGame(r.g.toRecording()))).toBe(stateDigest(r.g));
      }
    // …and they came up to the line and were held there: not passed by a company that never went near it.
    expect(nearest).toBeGreaterThan(-10);
    expect(asked).toBeGreaterThan(0);
  }, 240_000);

  it("asks in the headless runner too, where the switch answers: refused by default, granted when asked to be", () => {
    const run = (s: number, boundaryRequests?: "grant" | "refuse") =>
      runScenarioBattle(telAzekaAssaultListing, s, {
        drill: { ...REFERENCE_DRILL, scouting: { watchTurns: 1 } },
        fire: DEFAULT_FIRE_CHOICES,
        boundary: { "BLUE-1": "west", "BLUE-2": "east" },
        ...(boundaryRequests ? { boundaryRequests } : {}),
      }).boundaryRequests;
    const refused = [1000, 1001, 1002].flatMap((s) => run(s));
    expect(refused.length).toBeGreaterThan(0);
    expect(refused.every((a) => !a.granted && !a.blocked)).toBe(true);
    const granted = [1000, 1001, 1002].flatMap((s) => run(s, "grant"));
    expect(granted.some((a) => a.granted)).toBe(true);
    // A grant the neighbours block is no grant: the line stays where it was.
    for (const a of granted.filter((x) => x.blocked)) expect(a.to).toBe(a.from);
  }, 120_000);
});
