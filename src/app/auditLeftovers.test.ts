import { describe, expect, it } from "vitest";
import { Game, makeCommandGroup, makeInfantry } from "../engine/index.js";
import type { CompanyOrders } from "./company.js";
import { DOCTRINAL_DRILL, DrillState, drillMovement, type DrillTask, type SquadDrill } from "./drill.js";
import { ALTERNATE_POSITION_M, ComputerDefender, DEFENDER_DEPTH_M, DOCTRINAL_DEFENDER_TARGETS, planDefenderFires, prepareAlternatePositions } from "./computerSide.js";
import { PLAIN_SCRIPT } from "./drill.js";

/**
 * The drill audit's leftovers, ruled 2026-10-23 (decision 119): the hold
 * short in cover (A13) and a defender to its alternate position (D6).
 */
const defend: DrillTask = { side: "RED", attacking: false, objective: { x: 0, y: -600 } };

describe("a shelled defender goes to its alternate position, and only to that (D6)", () => {
  function shelled(alternate: boolean) {
    const g = new Game({ seed: 3, enforceC2: false });
    const red = g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 9));
    if (alternate) g.prepareAlternatePosition(red.id, { x: 0, y: 80 });
    red.downUnderShelling = true;
    g.beginTurn();
    g.advanceToPhase("movement");
    const state = new DrillState();
    drillMovement(g, defend, DOCTRINAL_DRILL, state);
    return { red, state };
  }

  it("goes, to the position prepared for it", () => {
    const { red, state } = shelled(true);
    expect(state.displaced.has(red.id)).toBe(true);
    expect(red.position.y).toBeGreaterThan(0);
  });

  it("stays in its hole with none prepared", () => {
    const { red, state } = shelled(false);
    expect(state.displaced.has(red.id)).toBe(false);
    expect(red.position).toEqual({ x: 0, y: 0 });
  });
});

describe("an assault held short halts in cover (A13)", () => {
  it("takes the nearest cover within reach of where the hold caught it", () => {
    const oak = { id: "oak", kind: "tree" as const, footprint: { shape: "circle" as const, center: { x: 15, y: 330 }, radius: 4 } };
    const g = new Game({ seed: 3, trackIntel: false, enforceC2: false, terrain: { objects: [oak] } });
    const u = g.addUnit(makeInfantry("BLUE-1-1", "BLUE", "squad", { x: 0, y: 330 }, 9));
    g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 500 }, 9)); // 170 m: inside the 200 m hold
    g.beginTurn();
    g.advanceToPhase("movement");
    const drill: SquadDrill = { ...DOCTRINAL_DRILL, fireTeams: undefined };
    const company: CompanyOrders = { scouts: new Map(), scoutsLieUp: false, hold: false, waitAt: new Map(), platoonOf: new Map([["BLUE-1-1", "BLUE-1"]]), fallBackTo: { x: 0, y: 0 }, holdShort: true };
    expect(g.groundCoverAt(u.position)).toBe("none");
    drillMovement(g, { side: "BLUE", attacking: true, objective: { x: 0, y: 500 }, company }, drill, new DrillState());
    expect(g.groundCoverAt(u.position)).not.toBe("none");
    expect(Math.hypot(u.position.x, u.position.y - 330)).toBeLessThanOrEqual(25);
  });
});

describe("the defender's fire plan in depth (D6)", () => {
  it("keeps its close targets, and adds one far out on watched ground and one just behind its positions", () => {
    const g = new Game({ seed: 3, enforceC2: false, terrain: { objects: [] } });
    g.addUnit(makeInfantry("R-1", "RED", "squad", { x: 500, y: 200 }, 9));
    g.addUnit(makeInfantry("R-2", "RED", "squad", { x: 560, y: 200 }, 9));
    const from = { x: 530, y: 1400 };
    const plan = planDefenderFires(g, "RED", from, 1100, 1500, "deadGround", DOCTRINAL_DEFENDER_TARGETS, true);
    expect(plan).toHaveLength(DOCTRINAL_DEFENDER_TARGETS);
    const along = (p: { y: number }) => p.y - 200; // the attack comes from due south here
    for (const p of plan.slice(0, 3)) expect(along(p)).toBeLessThanOrEqual(400);
    expect(along(plan[3]!)).toBeGreaterThanOrEqual(DEFENDER_DEPTH_M.longNear);
    expect(along(plan[3]!)).toBeLessThanOrEqual(DEFENDER_DEPTH_M.longFar);
    expect(plan[4]).toEqual({ x: 530, y: 200 - DEFENDER_DEPTH_M.behind });
    // Without depth, as before: the close band only.
    const flat = planDefenderFires(g, "RED", from, 1100, 1500, "deadGround", DOCTRINAL_DEFENDER_TARGETS);
    for (const p of flat) expect(along(p)).toBeLessThanOrEqual(400);
  });
});

describe("the counterattack goes in by a flank (D6)", () => {
  it("goes first to the side of the lost post, then at the enemy on it", () => {
    // RED holds facing south; the attack came from (0, 600). The forward squad is out, an enemy on its post.
    const g = new Game({ seed: 3, trackIntel: false, enforceC2: false });
    const reserve = g.addUnit(makeInfantry("RED-A-1", "RED", "squad", { x: 0, y: -100 }, 8));
    const forward = g.addUnit(makeInfantry("RED-A-2", "RED", "squad", { x: 0, y: 0 }, 8));
    const enemy = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 30 }, 8));
    g.beginTurn();
    const task: DrillTask = { side: "RED", attacking: false, objective: { x: 0, y: 600 }, reserves: new Set([reserve.id]) };
    const state = new DrillState();
    g.advanceToPhase("movement");
    drillMovement(g, task, DOCTRINAL_DRILL, state); // posts noted
    forward.neutralized = true;
    g.advanceToPhase("summary");
    g.advanceToPhase("movement");
    drillMovement(g, task, DOCTRINAL_DRILL, state);
    expect(state.counterattacking.has(reserve.id)).toBe(true);
    const to = g.standingOrderFor(reserve.id)?.destination;
    // 100 m to the side of the post, not straight at the enemy.
    expect(Math.abs(to!.x)).toBeGreaterThan(70);
    expect(Math.abs(to!.y)).toBeLessThan(30);
    // There, it goes at him.
    reserve.position = { ...to! };
    g.advanceToPhase("summary");
    g.advanceToPhase("movement");
    drillMovement(g, task, DOCTRINAL_DRILL, state);
    expect(state.flanked.has(reserve.id)).toBe(true);
    expect(Math.hypot(reserve.position.x - enemy.position.x, reserve.position.y - enemy.position.y)).toBeLessThan(Math.hypot(to!.x - enemy.position.x, to!.y - enemy.position.y));
    expect(DrillState.restore(state.snapshot()).flanked).toEqual(state.flanked);
  });
});

describe("the review of decision 119, pinned", () => {
  function lostPost(opts: { reserveAt?: { x: number; y: number }; postAt?: { x: number; y: number }; enemyAt?: { x: number; y: number }; extent?: { width: number; height: number } } = {}) {
    const g = new Game({ seed: 3, trackIntel: false, enforceC2: false });
    const reserve = g.addUnit(makeInfantry("RED-A-1", "RED", "squad", opts.reserveAt ?? { x: 500, y: 400 }, 8));
    const forward = g.addUnit(makeInfantry("RED-A-2", "RED", "squad", opts.postAt ?? { x: 500, y: 500 }, 8));
    const enemy = g.addUnit(makeInfantry("B", "BLUE", "squad", opts.enemyAt ?? { x: 500, y: 530 }, 8));
    g.beginTurn();
    const task: DrillTask = { side: "RED", attacking: false, objective: { x: (opts.postAt ?? { x: 500 }).x, y: 1100 }, reserves: new Set([reserve.id]), extent: opts.extent ?? { width: 1000, height: 1200 } };
    const state = new DrillState();
    g.advanceToPhase("movement");
    drillMovement(g, task, DOCTRINAL_DRILL, state);
    forward.neutralized = true;
    const next = () => {
      g.advanceToPhase("summary");
      g.advanceToPhase("movement");
      drillMovement(g, task, DOCTRINAL_DRILL, state);
    };
    next();
    return { g, reserve, enemy, state, next };
  }

  it("holds to its flank while the enemy on the post is out of sight", () => {
    const { g, reserve, enemy, state, next } = lostPost();
    const via = state.flankVia.get(reserve.id)!;
    expect(via).toBeDefined();
    enemy.neutralized = true; // gone from its picture
    const before = Math.hypot(reserve.position.x - via.x, reserve.position.y - via.y);
    next();
    // Still on its way to the flank (west), not turned toward the post (due south of it).
    expect(Math.hypot(reserve.position.x - via.x, reserve.position.y - via.y)).toBeLessThan(before);
    expect(reserve.position.x).toBeLessThan(429);
  });

  it("takes the other side when the nearer one is off the map", () => {
    // The post 40 m from the west edge, the reserve west of it: the west flank is off the map.
    const { reserve, state } = lostPost({ postAt: { x: 40, y: 500 }, reserveAt: { x: 10, y: 450 }, enemyAt: { x: 40, y: 530 } });
    expect(state.flankVia.get(reserve.id)!.x).toBeGreaterThan(40);
  });

  it("goes straight in when the enemy is already within assault reach", () => {
    const { reserve, state } = lostPost({ reserveAt: { x: 500, y: 510 } });
    expect(state.flankVia.has(reserve.id)).toBe(false);
    expect(state.flanked.has(reserve.id)).toBe(true);
  });

  it("never takes cover nearer the enemy while held short", () => {
    // The only cover lies toward the enemy: the squad stays where the hold caught it.
    const oak = { id: "oak", kind: "tree" as const, footprint: { shape: "circle" as const, center: { x: 0, y: 345 }, radius: 4 } };
    const g = new Game({ seed: 3, trackIntel: false, enforceC2: false, terrain: { objects: [oak] } });
    const u = g.addUnit(makeInfantry("BLUE-1-1", "BLUE", "squad", { x: 0, y: 330 }, 9));
    g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 500 }, 9));
    g.beginTurn();
    g.advanceToPhase("movement");
    const drill: SquadDrill = { ...DOCTRINAL_DRILL, fireTeams: undefined };
    const company: CompanyOrders = { scouts: new Map(), scoutsLieUp: false, hold: false, waitAt: new Map(), platoonOf: new Map([["BLUE-1-1", "BLUE-1"]]), fallBackTo: { x: 0, y: 0 }, holdShort: true };
    drillMovement(g, { side: "BLUE", attacking: true, objective: { x: 0, y: 500 }, company }, drill, new DrillState());
    expect(u.position).toEqual({ x: 0, y: 330 });
  });

  it("does not displace with an enemy close, nor out of a house", () => {
    const near = new Game({ seed: 3, trackIntel: false, enforceC2: false });
    const a = near.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 9));
    near.prepareAlternatePosition(a.id, { x: 0, y: 80 });
    near.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: -200 }, 9)); // within 300 m
    a.downUnderShelling = true;
    near.beginTurn();
    near.advanceToPhase("movement");
    const s1 = new DrillState();
    drillMovement(near, defend, DOCTRINAL_DRILL, s1);
    expect(s1.displaced.has(a.id)).toBe(false);
    const house = { id: "h", kind: "building" as const, footprint: { shape: "polygon" as const, points: [{ x: -10, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 10 }, { x: -10, y: 10 }] } };
    const inside = new Game({ seed: 3, enforceC2: false, closedTerrain: true, terrain: { objects: [house] } });
    const b = inside.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 9));
    inside.prepareAlternatePosition(b.id, { x: 0, y: 80 });
    b.downUnderShelling = true;
    inside.beginTurn();
    inside.advanceToPhase("movement");
    const s2 = new DrillState();
    drillMovement(inside, defend, DOCTRINAL_DRILL, s2);
    expect(s2.displaced.has(b.id)).toBe(false);
  });
});

describe("the long-range target is on watched ground (decision 119)", () => {
  it("passes over the far ground a block of houses hides, for the farthest it can see", () => {
    const block = { id: "block", kind: "building" as const, footprint: { shape: "polygon" as const, points: [{ x: 0, y: 900 }, { x: 1100, y: 900 }, { x: 1100, y: 920 }, { x: 0, y: 920 }] } };
    const g = new Game({ seed: 3, enforceC2: false, terrain: { objects: [block] } });
    g.addUnit(makeInfantry("R-1", "RED", "squad", { x: 500, y: 200 }, 9));
    g.addUnit(makeInfantry("R-2", "RED", "squad", { x: 560, y: 200 }, 9));
    const plan = planDefenderFires(g, "RED", { x: 530, y: 1400 }, 1100, 1500, "deadGround", DOCTRINAL_DEFENDER_TARGETS, true);
    // The band runs to y 1000; the block hides everything past 920.
    expect(plan[3]!.y).toBeLessThanOrEqual(900); // its near face, not the hidden ground beyond
    expect(plan[3]!.y - 200).toBeGreaterThanOrEqual(DEFENDER_DEPTH_M.longNear);
  });
});

describe("the second review of decision 119, pinned", () => {
  it("takes cover away from the enemy while held short", () => {
    const oak = { id: "oak", kind: "tree" as const, footprint: { shape: "circle" as const, center: { x: 0, y: 312 }, radius: 4 } };
    const g = new Game({ seed: 3, trackIntel: false, enforceC2: false, terrain: { objects: [oak] } });
    const u = g.addUnit(makeInfantry("BLUE-1-1", "BLUE", "squad", { x: 0, y: 330 }, 9));
    g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 500 }, 9));
    g.beginTurn();
    g.advanceToPhase("movement");
    const drill: SquadDrill = { ...DOCTRINAL_DRILL, fireTeams: undefined };
    const company: CompanyOrders = { scouts: new Map(), scoutsLieUp: false, hold: false, waitAt: new Map(), platoonOf: new Map([["BLUE-1-1", "BLUE-1"]]), fallBackTo: { x: 0, y: 0 }, holdShort: true };
    drillMovement(g, { side: "BLUE", attacking: true, objective: { x: 0, y: 500 }, company }, drill, new DrillState());
    expect(g.groundCoverAt(u.position)).not.toBe("none");
    expect(u.position.y).toBeLessThan(330);
  });

  it("puts the target behind behind the forward squads, the reserve left out", () => {
    const g = new Game({ seed: 3, enforceC2: false, terrain: { objects: [] } });
    g.addUnit(makeInfantry("R-1", "RED", "squad", { x: 500, y: 200 }, 9));
    g.addUnit(makeInfantry("R-2", "RED", "squad", { x: 560, y: 200 }, 9));
    g.addUnit(makeInfantry("R-R", "RED", "squad", { x: 530, y: 50 }, 9)); // the reserve, well back
    const plan = planDefenderFires(g, "RED", { x: 530, y: 1400 }, 1100, 1500, "deadGround", DOCTRINAL_DEFENDER_TARGETS, true, ["R-R"]);
    expect(plan.at(-1)).toEqual({ x: 530, y: 200 - DEFENDER_DEPTH_M.behind });
  });

  it("does not flank through a house: the other side, or straight in", () => {
    // A house on the west flank point: the reserve, west of the post, goes east about.
    const house = { id: "h", kind: "building" as const, footprint: { shape: "polygon" as const, points: [{ x: 380, y: 480 }, { x: 420, y: 480 }, { x: 420, y: 520 }, { x: 380, y: 520 }] } };
    const g = new Game({ seed: 3, trackIntel: false, enforceC2: false, terrain: { objects: [house] } });
    const reserve = g.addUnit(makeInfantry("RED-A-1", "RED", "squad", { x: 450, y: 400 }, 8));
    const forward = g.addUnit(makeInfantry("RED-A-2", "RED", "squad", { x: 500, y: 500 }, 8));
    g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 500, y: 530 }, 8));
    g.beginTurn();
    const task: DrillTask = { side: "RED", attacking: false, objective: { x: 500, y: 1100 }, reserves: new Set([reserve.id]), extent: { width: 1000, height: 1200 } };
    const state = new DrillState();
    g.advanceToPhase("movement");
    drillMovement(g, task, DOCTRINAL_DRILL, state);
    forward.neutralized = true;
    g.advanceToPhase("summary");
    g.advanceToPhase("movement");
    drillMovement(g, task, DOCTRINAL_DRILL, state);
    expect(state.flankVia.get(reserve.id)!.x).toBeGreaterThan(500);
  });
});

describe("fires in depth are the doctrinal drill's (the author, 2026-10-23)", () => {
  it("plans a long-range target only for a defender fighting by doctrine", () => {
    const plans = [DOCTRINAL_DRILL, PLAIN_SCRIPT].map((drill) => {
      const g = new Game({ seed: 3, enforceC2: false, terrain: { objects: [] }, fireSupport: { RED: [{ weapon: "lightMortar", missions: 8, roundsForEffect: 10, tubes: 2 }] } });
      g.addUnit(makeInfantry("R-1", "RED", "squad", { x: 500, y: 200 }, 9));
      g.addUnit(makeInfantry("R-2", "RED", "squad", { x: 560, y: 200 }, 9));
      g.addUnit(makeInfantry("B-1", "BLUE", "squad", { x: 530, y: 1400 }, 9));
      g.addUnit(makeCommandGroup("RED-COY", "RED", "company", { x: 530, y: 100 }));
      const plan = new ComputerDefender(g, "RED", { mapWidth: 1100, mapHeight: 1500 }, drill).plan(g);
      expect(plan.length).toBeGreaterThan(0);
      return plan;
    });
    const far = (plan: readonly { y: number }[]) => plan.some((p) => p.y - 200 >= DEFENDER_DEPTH_M.longNear);
    expect(far(plans[0]!)).toBe(true);
    expect(far(plans[1]!)).toBe(false);
  });
});

describe("the computer defender's alternate positions (decision 120)", () => {
  // RED holds at (500, 500), the attack from the south (y 1100). Trees give cover around it.
  const tree = (id: string, x: number, y: number) => ({ id, kind: "tree" as const, footprint: { shape: "circle" as const, center: { x, y }, radius: 4 } });
  function field(drill: SquadDrill, objects: ReturnType<typeof tree>[] = [tree("rear", 500, 430), tree("front", 560, 570)]) {
    const g = new Game({ seed: 3, enforceC2: false, terrain: { objects } });
    const post = g.addUnit(makeInfantry("RED-1-1", "RED", "squad", { x: 500, y: 500 }, 9));
    const reserve = g.addUnit(makeInfantry("RED-1-R", "RED", "squad", { x: 500, y: 350 }, 9));
    const made = prepareAlternatePositions(g, "RED", { x: 500, y: 1100 }, drill, [reserve.id], { width: 1000, height: 1200 });
    return { g, post, reserve, made };
  }

  it("prepares one to the flank or rear, in cover, that still covers the ground in front — never forward", () => {
    const { g, post, made } = field(DOCTRINAL_DRILL);
    const at = made.get(post.id)!;
    expect(at).toBeDefined();
    expect(g.alternatePositionFor(post.id)?.at).toEqual(at);
    expect(at.y).toBeLessThanOrEqual(500); // the tree in front is not taken
    expect(g.groundCoverAt(at)).not.toBe("none");
    const d = Math.hypot(at.x - 500, at.y - 500);
    expect(d).toBeGreaterThanOrEqual(ALTERNATE_POSITION_M.near);
    expect(d).toBeLessThanOrEqual(ALTERNATE_POSITION_M.far);
  });

  it("gives the reserve none, and the plain drill none at all", () => {
    expect(field(DOCTRINAL_DRILL).made.has("RED-1-R")).toBe(false);
    expect(field(PLAIN_SCRIPT).made.size).toBe(0);
  });

  it("gives none where there is no cover to go to, and none to a force in a house", () => {
    expect(field(DOCTRINAL_DRILL, []).made.size).toBe(0);
    const house = { id: "h", kind: "building" as const, footprint: { shape: "polygon" as const, points: [{ x: 490, y: 490 }, { x: 510, y: 490 }, { x: 510, y: 510 }, { x: 490, y: 510 }] } };
    const { made } = field(DOCTRINAL_DRILL, [tree("rear", 500, 430), house as unknown as ReturnType<typeof tree>]);
    expect(made.has("RED-1-1")).toBe(false);
  });
});
