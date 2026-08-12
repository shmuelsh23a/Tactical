import { describe, it, expect } from "vitest";
import { Game } from "./game.js";
import { stepTowards, hasArrived } from "./orders.js";
import { makeCommandGroup, makeInfantry } from "./units.js";
import { distance } from "./geometry.js";

describe("stepTowards", () => {
  const from = { x: 0, y: 0 };

  it("stops on the line when the objective is out of reach", () => {
    expect(stepTowards(from, { x: 0, y: 100 }, 40)).toEqual({ x: 0, y: 40 });
  });

  it("arrives exactly when the objective is within reach", () => {
    expect(stepTowards(from, { x: 0, y: 30 }, 100)).toEqual({ x: 0, y: 30 });
  });

  it("holds still with no budget", () => {
    expect(stepTowards(from, { x: 0, y: 100 }, 0)).toEqual(from);
  });

  it("keeps to the straight line diagonally", () => {
    const to = stepTowards(from, { x: 30, y: 40 }, 25); // 3-4-5, half way
    expect(to.x).toBeCloseTo(15, 5);
    expect(to.y).toBeCloseTo(20, 5);
  });

  it("counts arrival within a metre", () => {
    expect(hasArrived({ x: 0, y: 0 }, { x: 0, y: 0.5 })).toBe(true);
    expect(hasArrived({ x: 0, y: 0 }, { x: 0, y: 5 })).toBe(false);
  });
});

describe("standing orders", () => {
  /**
   * A squad 400 m from its חפ"ק — orders every 2 turns — pointed at an
   * objective it cannot reach in one bound.
   */
  function ordered(seed = 1) {
    const g = new Game({ seed });
    const squad = g.addUnit(makeInfantry("S", "BLUE", "squad", { x: 0, y: 400 }, 8));
    const hq = g.addUnit(makeCommandGroup("HQ", "BLUE", "platoon", { x: 0, y: 0 }, 3));
    g.beginTurn();
    g.advanceToPhase("movement");
    g.setStandingOrder(squad.id, { gait: "run", destination: { x: 0, y: 100 } });
    return { g, squad, hq };
  }

  /** End the current turn and stop in the next turn's movement phase. */
  function nextTurnMovement(g: Game) {
    while (g.phase !== "summary") g.advancePhase();
    g.advancePhase();
    g.advanceToPhase("movement");
  }

  it("starts on the order the turn it is given", () => {
    const { g, squad } = ordered();
    const done = g.executeStandingOrders("BLUE");
    expect(done[0]!.moved?.arrived).toBe(false);
    expect(squad.position.y).toBeCloseTo(300, 5); // a 100 m bound at a run
  });

  it("goes on advancing turn after turn without being told again", () => {
    const { g, squad } = ordered();
    g.executeStandingOrders("BLUE");

    // No further orders are issued — the force keeps to the one it has.
    for (const expected of [200, 100]) {
      nextTurnMovement(g);
      g.executeStandingOrders("BLUE");
      expect(squad.position.y).toBeCloseTo(expected, 5);
    }
  });

  it("holds at the objective once it arrives, and awaits new orders", () => {
    const g = new Game({ seed: 1 });
    const squad = g.addUnit(makeInfantry("S", "BLUE", "squad", { x: 0, y: 400 }, 8));
    g.addUnit(makeCommandGroup("HQ", "BLUE", "platoon", { x: 0, y: 0 }, 3));
    g.beginTurn();
    g.advanceToPhase("movement");
    g.setStandingOrder(squad.id, { gait: "run", destination: { x: 0, y: 700 } });

    for (let i = 0; i < 5; i++) {
      nextTurnMovement(g);
      g.executeStandingOrders("BLUE");
    }
    expect(distance(squad.position, { x: 0, y: 700 })).toBeLessThanOrEqual(1);

    // Arrived: the destination is dropped, so it holds rather than drifting.
    expect(g.standingOrderFor(squad.id)?.destination).toBeUndefined();
    const after = { ...squad.position };
    nextTurnMovement(g);
    g.executeStandingOrders("BLUE");
    expect(squad.position).toEqual(after);
  });

  it("does not move a force that was hit last turn", () => {
    const { g, squad } = ordered();
    nextTurnMovement(g);
    squad.movementBlocked = true;
    const done = g.executeStandingOrders("BLUE");
    expect(done[0]!.reason).toBe("hit last turn");
    expect(squad.position.y).toBe(400);
  });

  it("advances at half pace while under fire", () => {
    const { g, squad } = ordered();
    nextTurnMovement(g);
    squad.underFire = true;
    g.executeStandingOrders("BLUE");
    expect(squad.position.y).toBeCloseTo(350, 5); // 50 m, not 100
  });

  it("leaves a force alone until it is actually given an order", () => {
    const { g, hq } = ordered();
    // The חפ"ק was given none, so nothing drives it.
    expect(g.executeStandingOrders("BLUE").some((e) => e.unitId === hq.id)).toBe(false);
    expect(hq.position.y).toBe(0);
  });

  it("a direct move replaces the order that was sending it elsewhere", () => {
    const { g, squad } = ordered();
    g.moveUnit(squad.id, { x: 50, y: 400 }, "normal");
    expect(g.standingOrderFor(squad.id)?.destination).toBeUndefined();

    // …so it stays where it was put rather than resuming the old march.
    const after = { ...squad.position };
    nextTurnMovement(g);
    g.executeStandingOrders("BLUE");
    expect(squad.position).toEqual(after);
  });

  it("engages the force its order names, in the fire phase", () => {
    const g = new Game({ seed: 3 });
    const squad = g.addUnit(makeInfantry("S", "BLUE", "squad", { x: 0, y: 400 }, 8));
    const enemy = g.addUnit(makeInfantry("E", "RED", "squad", { x: 0, y: 440 }, 6));
    g.addUnit(makeCommandGroup("HQ", "BLUE", "platoon", { x: 0, y: 0 }, 3));
    g.beginTurn();
    g.advanceToPhase("movement");
    g.setStandingOrder(squad.id, {
      gait: "normal",
      engage: { targetId: enemy.id, weapon: "smallArms" },
    });

    nextTurnMovement(g);
    g.advanceToPhase("combat");
    const done = g.executeStandingOrders("BLUE");
    expect(done[0]!.engaged?.targetId).toBe(enemy.id);
    expect(squad.firedThisTurn).toBe(true);
  });

  it("stops engaging once the target is gone", () => {
    const g = new Game({ seed: 3 });
    const squad = g.addUnit(makeInfantry("S", "BLUE", "squad", { x: 0, y: 400 }, 8));
    const enemy = g.addUnit(makeInfantry("E", "RED", "squad", { x: 0, y: 440 }, 6));
    g.addUnit(makeCommandGroup("HQ", "BLUE", "platoon", { x: 0, y: 0 }, 3));
    g.beginTurn();
    g.advanceToPhase("movement");
    g.setStandingOrder(squad.id, {
      gait: "normal",
      engage: { targetId: enemy.id, weapon: "smallArms" },
    });
    enemy.neutralized = true;

    nextTurnMovement(g);
    g.advanceToPhase("combat");
    expect(g.executeStandingOrders("BLUE")[0]!.reason).toBe("target gone");
  });

  it("refuses new orders while the force is out of contact", () => {
    const { g, squad } = ordered();
    nextTurnMovement(g);
    expect(g.setStandingOrder(squad.id, { gait: "normal", destination: { x: 0, y: 0 } })).toBe(
      false,
    );
    // …and the order it already has is untouched.
    expect(g.standingOrderFor(squad.id)?.destination).toEqual({ x: 0, y: 100 });
  });

  it("does not count executing an order as receiving one", () => {
    const { g, squad } = ordered();
    nextTurnMovement(g); // turn 2: out of contact, engine advances it
    g.executeStandingOrders("BLUE");
    // Carrying out old orders is not the same as being given new ones, so the
    // force must not read as commanded this turn.
    expect(g.isUnderOrders(squad.id)).toBe(false);
  });

  it("comes back into contact as it closes on its commander", () => {
    // The interval is measured live, so a force marching towards its חפ"ק
    // works its way back into the every-turn band under its own orders.
    const { g, squad } = ordered();
    expect(g.nextOrderTurn(squad.id)).toBe(3); // 400 m out: every 2 turns

    nextTurnMovement(g);
    g.executeStandingOrders("BLUE");
    expect(squad.position.y).toBeCloseTo(300, 5); // now inside 300 m
    expect(g.canReceiveOrders(squad.id)).toBe(true);
  });

  it("still executes orders with the C2 module switched off", () => {
    // enforceC2 governs the *interval* on new orders, not whether a force
    // carries out the ones it has.
    const g = new Game({ seed: 1, enforceC2: false });
    const squad = g.addUnit(makeInfantry("S", "BLUE", "squad", { x: 0, y: 400 }, 8));
    g.addUnit(makeCommandGroup("HQ", "BLUE", "platoon", { x: 0, y: 0 }, 3));
    g.beginTurn();
    g.advanceToPhase("movement");
    g.setStandingOrder(squad.id, { gait: "run", destination: { x: 0, y: 100 } });
    nextTurnMovement(g);
    g.executeStandingOrders("BLUE");
    expect(squad.position.y).toBeCloseTo(300, 5);
  });
});
