import { describe, it, expect } from "vitest";
import { Game } from "./game.js";
import { makeCommandGroup, makeInfantry, makeVehicle } from "./units.js";
import { CHARGE_LAYING } from "./data/engineering.js";
import { replayGame, sealRecording, verifyRecording } from "./recording.js";

/**
 * Laying a charge during play (rules decision 16). The author's ruling: an
 * insurgent or special force may lay one, and it takes two turns. What the
 * turns cost is ours — the force stands still and stays out of the fight, and
 * loses the work if it does anything else.
 */

/** A RED sapper squad on the line BLUE will walk up, with the game in movement. */
function sapper(seed = 1) {
  const g = new Game({ seed, enforceC2: false });
  const red = makeInfantry("RED-E", "RED", "squad", { x: 0, y: 100 }, 8);
  red.canLayCharges = true;
  g.addUnit(red);
  // Close enough that BLUE can reach the mined point inside one bound.
  const blue = g.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", { x: 0, y: 60 }, 8));
  g.beginTurn();
  g.advanceToPhase("movement");
  return { g, red, blue };
}

/**
 * Close the turn and come back round to the movement phase of the next one.
 *
 * Deliberately not `advanceToPhase("movement")`: from the movement phase that
 * is already the current phase and steps nowhere at all.
 */
function nextTurn(g: Game) {
  g.advanceToPhase("summary");
  const chargeWork = g.advancePhase().chargeWork ?? []; // the step that ends the turn
  g.advanceToPhase("movement");
  return chargeWork;
}

describe("laying charges during play", () => {
  it("is refused to a force that is not trained for it", () => {
    const { g } = sapper();
    const plain = g.addUnit(makeInfantry("RED-2", "RED", "squad", { x: 50, y: 100 }, 8));
    expect(() => g.layCharge(plain.id, "antiPersonnel")).toThrow(/not a charge-laying force/);
  });

  it("is refused to a vehicle, which has no one to send out", () => {
    const { g } = sapper();
    const tank = g.addUnit(makeVehicle("RED-T", "RED", { x: 80, y: 100 }, 270));
    tank.canLayCharges = true;
    expect(() => g.layCharge(tank.id, "antiPersonnel")).toThrow(/no one left/);
  });

  it("is refused to a force that has already used part of its bound", () => {
    const { g, red } = sapper();
    g.moveUnit(red.id, { x: 0, y: 110 }, "normal");
    expect(() => g.layCharge(red.id, "antiPersonnel")).toThrow(/already moved/);
  });

  it("belongs to the movement phase", () => {
    const { g, red } = sapper();
    g.advanceToPhase("combat");
    expect(() => g.layCharge(red.id, "antiPersonnel")).toThrow(/phase/);
  });

  it("puts a charge in the ground after two turns, and not before", () => {
    const { g, red } = sapper();
    g.layCharge(red.id, "antiTank");
    expect(g.mines).toHaveLength(0);

    // Turn 1 of the work banked: still nothing on the ground.
    const afterFirst = nextTurn(g);
    expect(afterFirst).toEqual([]);
    expect(g.mines).toHaveLength(0);
    expect(g.getUnit(red.id).layingCharge?.turnsWorked).toBe(1);

    // Turn 2 finishes it.
    const afterSecond = nextTurn(g);
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0]?.mine?.type).toBe("antiTank");
    expect(g.mines).toHaveLength(1);
    expect(g.mines[0]).toMatchObject({ side: "RED", armed: true, detected: false });
    expect(g.getUnit(red.id).layingCharge).toBeUndefined();
  });

  it("lays it where the work was begun", () => {
    const { g, red } = sapper();
    g.layCharge(red.id, "antiPersonnel");
    nextTurn(g);
    nextTurn(g);
    expect(g.mines[0]?.position).toEqual({ x: 0, y: 100 });
  });

  it("takes exactly the turns the ruling gives it", () => {
    const { g, red } = sapper();
    g.layCharge(red.id, "antiPersonnel");
    for (let i = 1; i < CHARGE_LAYING.turnsToLay; i++) {
      nextTurn(g);
      expect(g.mines).toHaveLength(0);
    }
    nextTurn(g);
    expect(g.mines).toHaveLength(1);
  });

  it("is lost when the force gets up and moves", () => {
    const { g, red } = sapper();
    g.layCharge(red.id, "antiPersonnel");
    nextTurn(g);
    g.moveUnit(red.id, { x: 0, y: 130 }, "normal");
    const reports = nextTurn(g);
    expect(reports[0]?.interrupted).toBe("moved");
    expect(g.mines).toHaveLength(0);
    expect(g.getUnit(red.id).layingCharge).toBeUndefined();
  });

  it("is lost when the force opens fire", () => {
    const { g, red, blue } = sapper();
    g.layCharge(red.id, "antiPersonnel");
    nextTurn(g);
    g.advanceToPhase("combat");
    g.fire(red.id, blue.id, { weapon: "smallArms" });
    const reports = nextTurn(g);
    expect(reports[0]?.interrupted).toBe("fought");
    expect(g.mines).toHaveLength(0);
  });

  it("is lost when the force is hit", () => {
    // Seed 1 is here because BLUE's small arms land at 40 m on it — the test
    // needs a hit, not a shot, since nothing marks a force merely shot at.
    const { g, red, blue } = sapper();
    g.layCharge(red.id, "antiPersonnel");
    nextTurn(g);
    g.advanceToPhase("combat");
    g.fire(blue.id, red.id, { weapon: "smallArms" });
    const reports = nextTurn(g);
    expect(reports[0]?.interrupted).toBe("hit");
    expect(g.mines).toHaveLength(0);
  });

  it("does not bank the work and resume it — the two turns are consecutive", () => {
    const { g, red } = sapper();
    g.layCharge(red.id, "antiPersonnel");
    nextTurn(g); // one turn banked
    g.moveUnit(red.id, { x: 0, y: 120 }, "normal"); // …and thrown away
    nextTurn(g);
    // Starting again starts from nothing: one more turn must not finish it.
    g.layCharge(red.id, "antiPersonnel");
    nextTurn(g);
    expect(g.mines).toHaveLength(0);
    nextTurn(g);
    expect(g.mines).toHaveLength(1);
  });

  it("can be called off, and what was banked is lost", () => {
    const { g, red } = sapper();
    g.layCharge(red.id, "antiPersonnel");
    nextTurn(g);
    g.layCharge(red.id, null);
    expect(g.getUnit(red.id).layingCharge).toBeUndefined();
    nextTurn(g);
    expect(g.mines).toHaveLength(0);
  });

  it("catches the enemy and never the side that laid it", () => {
    const { g, red, blue } = sapper();
    g.layCharge(red.id, "antiPersonnel");
    nextTurn(g);
    nextTurn(g);
    expect(g.mines).toHaveLength(1);
    // RED walks over its own charge: nothing.
    expect(g.moveUnit(red.id, { x: 0, y: 101 }, "normal").mineDetonations).toEqual([]);
    // BLUE walks onto it: triggered (whether it fires is its activation roll).
    const blueWalk = g.moveUnit(blue.id, { x: 0, y: 100 }, "normal");
    expect(blueWalk.mineDetonations).toHaveLength(1);
  });

  it("is refused to a force already hit this turn, rather than wasting its order", () => {
    const { g, red, blue } = sapper();
    g.advanceToPhase("combat");
    g.fire(blue.id, red.id, { weapon: "smallArms" });
    expect(g.getUnit(red.id).hitThisTurn).toBe(true);
    g.advanceToPhase("summary");
    g.advancePhase();
    g.advanceToPhase("movement");
    // Next turn the flag has cleared and the work may start.
    expect(() => g.layCharge(red.id, "antiPersonnel")).not.toThrow();
  });

  it("replaces the order the force was holding, which would take the work away", () => {
    const { g, red, blue } = sapper();
    g.setStandingOrder(red.id, {
      gait: "normal",
      destination: { x: 0, y: 200 },
      engage: { targetId: blue.id, weapon: "smallArms" },
    });
    g.layCharge(red.id, "antiPersonnel");
    const order = g.standingOrderFor(red.id);
    expect(order?.destination).toBeUndefined();
    expect(order?.engage).toBeUndefined();
    // …so executing orders does not march it off the work it just started.
    g.executeStandingOrders("RED");
    expect(g.getUnit(red.id).movedThisTurn).toBe(0);
    nextTurn(g);
    nextTurn(g);
    expect(g.mines).toHaveLength(1);
  });

  /**
   * The charge is created inside end-of-turn upkeep, from the game's own id
   * counter — the counter that also numbers fire missions and smoke screens.
   * A replay has to reach the same ids, so the finished branch (not only the
   * interrupted one) is driven through the recording here.
   */
  it("replays a completed charge, ids and all", () => {
    const { g, red } = sapper(7);
    g.layCharge(red.id, "antiTank");
    g.advanceToPhase("combat");
    g.deploySmoke("grenade", "RED", { x: 0, y: 140 }); // shares the id counter
    nextTurn(g);
    nextTurn(g);
    expect(g.mines).toHaveLength(1);

    const recording = sealRecording(g.toRecording());
    const replayed = replayGame(recording);
    expect(replayed.mines).toEqual(g.mines);
    expect(replayed.mines.map((m) => m.id)).toEqual(g.mines.map((m) => m.id));
    expect(replayed.rng.getState()).toBe(g.rng.getState());
    expect(verifyRecording(recording).ok).toBe(true);
  });

  it("keeps emplacement before the battle to the setup phase", () => {
    const g = new Game({ seed: 1, enforceC2: false });
    g.addMine({
      side: "RED",
      type: "antiPersonnel",
      position: { x: 0, y: 50 },
      armed: true,
      detected: false,
    });
    g.beginTurn();
    expect(() =>
      g.addMine({
        side: "RED",
        type: "antiPersonnel",
        position: { x: 0, y: 60 },
        armed: true,
        detected: false,
      }),
    ).toThrow(/setup/);
  });

  it("needs orders like any other task, when C2 is enforced", () => {
    const g = new Game({ seed: 1 });
    const red = makeInfantry("RED-E", "RED", "squad", { x: 0, y: 900 }, 8);
    red.canLayCharges = true;
    g.addUnit(red);
    // Its command group is far enough off that the order interval bites: a
    // squad past 500 m is ordered every third turn.
    g.addUnit(makeCommandGroup("RED-HQ", "RED", "platoon", { x: 0, y: 0 }, 3));
    g.beginTurn();
    g.advanceToPhase("movement");
    // First turn the order gets through; the next one is out of the cycle.
    g.layCharge(red.id, "antiPersonnel");
    g.layCharge(red.id, null);
    nextTurn(g);
    expect(g.canManoeuvre(red.id)).toBe(false);
    expect(() => g.layCharge(red.id, "antiPersonnel")).toThrow(/out of the order cycle/);
  });
});
