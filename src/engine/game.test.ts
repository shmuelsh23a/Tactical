import { describe, it, expect } from "vitest";
import { Game, PHASES } from "./game.js";
import { makeCommandGroup, makeInfantry, makeVehicle, fitSoldiers } from "./units.js";

describe("Game turn/phase loop", () => {
  it("walks through all seven phases in order", () => {
    const g = new Game({ seed: 1 });
    g.beginTurn();
    expect(g.turn).toBe(1);
    expect(g.phase).toBe("initiative");
    const seen = [g.phase];
    for (let i = 0; i < PHASES.length - 1; i++) {
      g.advancePhase();
      seen.push(g.phase);
    }
    expect(seen).toEqual([...PHASES]);
  });

  it("rolls initiative for both sides", () => {
    const g = new Game({ seed: 42 });
    const { initiativeOrder } = g.beginTurn();
    expect(initiativeOrder.sort()).toEqual(["BLUE", "RED"]);
  });

  it("advancing past summary begins the next turn", () => {
    const g = new Game({ seed: 7 });
    g.beginTurn(); // turn 1
    while (g.phase !== "summary") g.advancePhase();
    g.advancePhase(); // past summary
    expect(g.turn).toBe(2);
    expect(g.phase).toBe("initiative");
  });
});

describe("phase enforcement", () => {
  it("forbids firing outside the combat phase", () => {
    const g = new Game({ seed: 1 });
    const a = g.addUnit(makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 8));
    const b = g.addUnit(makeInfantry("B", "RED", "squad", { x: 0, y: 50 }, 8));
    g.beginTurn(); // initiative phase
    expect(() => g.fire(a.id, b.id, { weapon: "smallArms" })).toThrow(/phase/);
  });

  it("enforces movement distance caps", () => {
    const g = new Game({ seed: 1 });
    const a = g.addUnit(makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 8));
    g.beginTurn();
    g.advanceToPhase("movement");
    expect(() => g.moveUnit(a.id, { x: 0, y: 60 }, "normal")).toThrow(/exceeds/);
    expect(() => g.moveUnit(a.id, { x: 0, y: 40 }, "normal")).not.toThrow();
  });
});

describe("indirect fire delay queue", () => {
  it("an artillery mission resolves two turns later", () => {
    const g = new Game({ seed: 3 });
    const target = g.addUnit(makeInfantry("T", "RED", "squad", { x: 300, y: 300 }, 8));

    // Turn 1: queue the mission in the targeting phase.
    g.beginTurn();
    g.advanceToPhase("targeting");
    const mission = g.queueIndirectFire("artillery", "BLUE", { x: 300, y: 300 }, {
      firingFrom: { x: 300, y: 0 },
    });
    expect(mission.resolvesOnTurn).toBe(3); // 1 + 2-turn delay
    // finish turn 1
    g.advanceToPhase("summary");

    // Turn 2: nothing resolves yet.
    g.advancePhase(); // -> turn 2 initiative
    let resolvedT2: unknown;
    while (g.phase !== "summary") {
      const r = g.advancePhase();
      if (g.phase === "resolvePriorArty") resolvedT2 = r.resolved;
    }
    expect((resolvedT2 as unknown[]).length).toBe(0);

    // Turn 3: the mission resolves on entering resolvePriorArty.
    g.advancePhase(); // -> turn 3 initiative
    let resolvedT3: any;
    while (g.phase !== "summary") {
      const r = g.advancePhase();
      if (g.phase === "resolvePriorArty") resolvedT3 = r.resolved;
    }
    expect(resolvedT3.length).toBe(1);
    expect(resolvedT3[0].weapon).toBe("artillery");
    expect(g.pendingFire.length).toBe(0);
  });
});

describe("command & control gating", () => {
  it("a distant squad cannot be re-ordered every turn", () => {
    const g = new Game({ seed: 1 });
    // Squad 400 m from its platoon commander → order interval = 2 turns.
    const sq = g.addUnit(makeInfantry("S", "BLUE", "squad", { x: 0, y: 400 }, 8));
    const cmdPos = { x: 0, y: 0 };

    g.beginTurn(); // turn 1
    expect(g.issueOrders(sq.id, cmdPos)).toBe(true);
    // Same turn again (interval 2) — already ordered this turn.
    expect(g.canReceiveOrders(sq.id, cmdPos)).toBe(false);

    // Advance to turn 2: still within the 2-turn interval.
    while (g.phase !== "summary") g.advancePhase();
    g.advancePhase();
    expect(g.turn).toBe(2);
    expect(g.canReceiveOrders(sq.id, cmdPos)).toBe(false);

    // Turn 3: now allowed again.
    while (g.phase !== "summary") g.advancePhase();
    g.advancePhase();
    expect(g.turn).toBe(3);
    expect(g.canReceiveOrders(sq.id, cmdPos)).toBe(true);
  });

  it("measures the interval from the side's own command group when none is given", () => {
    const g = new Game({ seed: 1 });
    const sq = g.addUnit(makeInfantry("S", "BLUE", "squad", { x: 0, y: 400 }, 8));
    g.addUnit(makeCommandGroup("HQ", "BLUE", "platoon", { x: 0, y: 0 }, 3));
    g.beginTurn();
    expect(g.commandGroupFor("BLUE")?.id).toBe("HQ");
    expect(g.issueOrders(sq.id)).toBe(true); // 400 m → interval 2
    expect(g.canReceiveOrders(sq.id)).toBe(false);
    expect(g.nextOrderTurn(sq.id)).toBe(3);
  });

  it("a side with no command group is unconstrained", () => {
    const g = new Game({ seed: 1 });
    const sq = g.addUnit(makeInfantry("S", "BLUE", "squad", { x: 0, y: 900 }, 8));
    g.beginTurn();
    expect(g.issueOrders(sq.id)).toBe(true);
    expect(g.canReceiveOrders(sq.id)).toBe(true);
    expect(g.nextOrderTurn(sq.id)).toBe(null);
  });
});

describe("C2 gating of manoeuvre", () => {
  /** BLUE squad 400 m from its חפ"ק → orders every 2 turns. */
  function setup(opts: { enforceC2?: boolean } = {}) {
    const g = new Game({ seed: 1, ...opts });
    const sq = g.addUnit(makeInfantry("S", "BLUE", "squad", { x: 0, y: 400 }, 8));
    const hq = g.addUnit(makeCommandGroup("HQ", "BLUE", "platoon", { x: 0, y: 0 }, 3));
    g.beginTurn();
    g.advanceToPhase("movement");
    return { g, sq, hq };
  }

  /** End the current turn and stop in the next turn's movement phase. */
  function nextTurnMovement(g: Game) {
    while (g.phase !== "summary") g.advancePhase();
    g.advancePhase(); // -> next turn, initiative
    g.advanceToPhase("movement");
  }

  it("blocks movement on turns the force cannot receive new orders", () => {
    const { g, sq } = setup();

    // Turn 1: free to move — the order is issued as it moves.
    g.moveUnit(sq.id, { x: 0, y: 370 }, "normal");
    expect(g.isUnderOrders(sq.id)).toBe(true);

    // Turn 2: still inside the 2-turn interval → no new orders, no manoeuvre.
    nextTurnMovement(g);
    expect(g.canManoeuvre(sq.id)).toBe(false);
    expect(() => g.moveUnit(sq.id, { x: 0, y: 340 }, "normal")).toThrow(/no orders/);
    expect(sq.position.y).toBe(370); // did not budge

    // Turn 3: orders due again.
    nextTurnMovement(g);
    expect(g.canManoeuvre(sq.id)).toBe(true);
    expect(() => g.moveUnit(sq.id, { x: 0, y: 340 }, "normal")).not.toThrow();
  });

  it("lets a force keep moving within the turn it was ordered", () => {
    const { g, sq } = setup();
    g.moveUnit(sq.id, { x: 0, y: 380 }, "normal");
    // A second bound in the same turn is the same order, not a new one.
    expect(() => g.moveUnit(sq.id, { x: 0, y: 360 }, "normal")).not.toThrow();
    expect(sq.movedThisTurn).toBeCloseTo(40);
  });

  it("does not stamp an order when the move is rejected", () => {
    const { g, sq } = setup();
    expect(() => g.moveUnit(sq.id, { x: 0, y: 300 }, "normal")).toThrow(/exceeds/);
    expect(g.isUnderOrders(sq.id)).toBe(false);
    expect(g.canReceiveOrders(sq.id)).toBe(true); // still due its orders
  });

  it("never gates the command group itself", () => {
    const { g, hq } = setup();
    g.moveUnit(hq.id, { x: 0, y: 40 }, "normal");
    nextTurnMovement(g);
    expect(g.canManoeuvre(hq.id)).toBe(true);
    expect(() => g.moveUnit(hq.id, { x: 0, y: 80 }, "normal")).not.toThrow();
  });

  it("does not gate fire — a force engages on its own initiative", () => {
    const { g, sq } = setup();
    g.addUnit(makeInfantry("E", "RED", "squad", { x: 0, y: 450 }, 6));
    g.moveUnit(sq.id, { x: 0, y: 400 }, "normal"); // 0 m, but takes the order

    nextTurnMovement(g); // turn 2: awaiting orders
    expect(g.canManoeuvre(sq.id)).toBe(false);
    g.advanceToPhase("combat");
    expect(g.fire(sq.id, "E", { weapon: "smallArms" }).fired).toBe(true);
  });

  it("enforceC2: false plays the game without the C2 module", () => {
    const { g, sq } = setup({ enforceC2: false });
    g.moveUnit(sq.id, { x: 0, y: 370 }, "normal");
    nextTurnMovement(g);
    expect(g.canReceiveOrders(sq.id)).toBe(false); // the clock still runs…
    expect(g.canManoeuvre(sq.id)).toBe(true); // …but nothing is gated on it
    expect(() => g.moveUnit(sq.id, { x: 0, y: 340 }, "normal")).not.toThrow();
  });
});

describe("smoke blocks fire", () => {
  function contact() {
    const g = new Game({ seed: 1 });
    const a = g.addUnit(makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 8));
    const b = g.addUnit(makeInfantry("B", "RED", "squad", { x: 0, y: 200 }, 8));
    g.beginTurn();
    return { g, a, b };
  }

  it("refuses a shot whose line of sight crosses a screen", () => {
    const { g, a, b } = contact();
    g.advanceToPhase("targeting");
    g.deploySmoke("grenade", "BLUE", { x: 0, y: 100 }, 50);
    g.advanceToPhase("combat");
    const r = g.fire(a.id, b.id, { weapon: "smallArms" });
    expect(r.fired).toBe(false);
    expect(r.reason).toBe("no line of sight");
  });

  it("leaves a shot clear of the screen alone", () => {
    const { g, a, b } = contact();
    g.advanceToPhase("targeting");
    g.deploySmoke("grenade", "BLUE", { x: 200, y: 100 }, 50); // well off the line
    g.advanceToPhase("combat");
    expect(g.fire(a.id, b.id, { weapon: "smallArms" }).fired).toBe(true);
  });

  it("blocks a tank round through smoke too", () => {
    const g = new Game({ seed: 1 });
    const tank = g.addUnit(makeVehicle("T", "RED", { x: 0, y: 0 }));
    const inf = g.addUnit(makeInfantry("I", "BLUE", "squad", { x: 0, y: 200 }, 8));
    g.beginTurn();
    g.advanceToPhase("targeting");
    g.deploySmoke("grenade", "RED", { x: 0, y: 100 }, 50);
    g.advanceToPhase("combat");
    const r = g.fireExplosive("tankRound", tank.id, inf.id);
    expect(r.fired).toBe(false);
    expect(r.reason).toBe("no line of sight");
  });

  it("lets the caller assert line of sight itself", () => {
    const { g, a, b } = contact();
    g.advanceToPhase("targeting");
    g.deploySmoke("grenade", "BLUE", { x: 0, y: 100 }, 50);
    g.advanceToPhase("combat");
    expect(g.fire(a.id, b.id, { weapon: "smallArms", hasLineOfSight: true }).fired).toBe(true);
  });

  it("clears once the screen has decayed", () => {
    const { g, a, b } = contact();
    g.advanceToPhase("targeting");
    g.deploySmoke("grenade", "BLUE", { x: 0, y: 100 }, 50); // 1 turn
    g.advanceToPhase("combat");
    expect(g.fire(a.id, b.id, { weapon: "smallArms" }).fired).toBe(false);

    while (g.phase !== "summary") g.advancePhase();
    g.advancePhase(); // end of turn → upkeep decays the screen
    expect(g.smoke.length).toBe(0);
    g.advanceToPhase("combat");
    expect(g.fire(a.id, b.id, { weapon: "smallArms" }).fired).toBe(true);
  });
});

describe("emplaced charges", () => {
  /** A BLUE squad about to walk a lane RED has mined. */
  function minedLane(seed: number, type: "antiPersonnel" | "antiTank" = "antiPersonnel") {
    const g = new Game({ seed });
    const sq = g.addUnit(makeInfantry("S", "BLUE", "squad", { x: 0, y: 0 }, 8));
    const mine = g.addMine({
      side: "RED",
      type,
      position: { x: 0, y: 25 }, // squarely on the path, mid-bound
      armed: true,
      detected: false,
    });
    g.beginTurn();
    g.advanceToPhase("movement");
    return { g, sq, mine };
  }

  /** Seeds differ in whether the 50% activation roll comes up. */
  function firstSeedWhere(activated: boolean): number {
    for (let s = 0; s < 200; s++) {
      const { g, sq } = minedLane(s);
      const r = g.moveUnit(sq.id, { x: 0, y: 50 }, "normal");
      const det = r.mineDetonations[0];
      if (det && det.activated === activated) return s;
    }
    throw new Error(`no seed produced activated=${activated}`);
  }

  it("goes off under a force that walks onto it", () => {
    const { g, sq } = minedLane(firstSeedWhere(true));
    const r = g.moveUnit(sq.id, { x: 0, y: 50 }, "normal");
    expect(r.mineDetonations.length).toBe(1);
    expect(r.mineDetonations[0]!.activated).toBe(true);
    expect(r.mineDetonations[0]!.blast).toBeDefined();
    expect(g.mines.length).toBe(0); // spent
  });

  it("stays armed when the activation roll fails", () => {
    const { g, sq } = minedLane(firstSeedWhere(false));
    const r = g.moveUnit(sq.id, { x: 0, y: 50 }, "normal");
    expect(r.mineDetonations[0]!.activated).toBe(false);
    expect(r.mineDetonations[0]!.blast).toBeUndefined();
    expect(g.mines.length).toBe(1);
  });

  it("is triggered by the path walked, not just where the bound ends", () => {
    // The charge at y=25 is nowhere near the destination at y=50, but the
    // force still walks over it.
    const { g, sq } = minedLane(firstSeedWhere(true));
    const r = g.moveUnit(sq.id, { x: 0, y: 50 }, "normal");
    expect(distanceBetween({ position: { x: 0, y: 50 } }, { position: { x: 0, y: 25 } })).toBe(25);
    expect(r.mineDetonations.length).toBe(1);
  });

  it("is stepped around once it has been found", () => {
    const { g, sq, mine } = minedLane(1);
    mine.detected = true;
    const r = g.moveUnit(sq.id, { x: 0, y: 50 }, "normal");
    expect(r.mineDetonations).toEqual([]);
    expect(g.mines.length).toBe(1);
  });

  it("never catches the side that laid it", () => {
    const g = new Game({ seed: 1 });
    const sq = g.addUnit(makeInfantry("S", "RED", "squad", { x: 0, y: 0 }, 8));
    g.addMine({ side: "RED", type: "antiPersonnel", position: { x: 0, y: 25 }, armed: true, detected: false });
    g.beginTurn();
    g.advanceToPhase("movement");
    expect(g.moveUnit(sq.id, { x: 0, y: 50 }, "normal").mineDetonations).toEqual([]);
  });

  it("leaves a charge well off the path alone", () => {
    const g = new Game({ seed: 1 });
    const sq = g.addUnit(makeInfantry("S", "BLUE", "squad", { x: 0, y: 0 }, 8));
    g.addMine({ side: "RED", type: "antiPersonnel", position: { x: 40, y: 25 }, armed: true, detected: false });
    g.beginTurn();
    g.advanceToPhase("movement");
    expect(g.moveUnit(sq.id, { x: 0, y: 50 }, "normal").mineDetonations).toEqual([]);
  });

  it("hurts the force that set it off", () => {
    // Over many seeds an AP charge that fires must cost the squad something.
    let anyDamage = false;
    for (let s = 0; s < 40 && !anyDamage; s++) {
      const { g, sq } = minedLane(s);
      const r = g.moveUnit(sq.id, { x: 0, y: 50 }, "normal");
      if (r.mineDetonations[0]?.activated && sumDamage(sq) > 0) anyDamage = true;
    }
    expect(anyDamage).toBe(true);
  });
});

describe("smoke delivery", () => {
  function ready(seed = 1) {
    const g = new Game({ seed });
    g.beginTurn();
    g.advanceToPhase("targeting");
    return g;
  }

  it("puts a thrown grenade screen straight on the map", () => {
    const g = ready();
    const order = g.deploySmoke("grenade", "BLUE", { x: 0, y: 0 });
    expect(order.screen).toBeDefined();
    expect(order.mission).toBeUndefined();
    expect(order.arrivesOnTurn).toBe(g.turn);
    expect(g.smoke.length).toBe(1);
    expect(g.pendingSmoke.length).toBe(0);
  });

  it("makes a fired screen wait out its weapon's שיהוי", () => {
    const g = ready();
    const mortar = g.deploySmoke("mortar", "BLUE", { x: 0, y: 0 });
    const arty = g.deploySmoke("artillery", "BLUE", { x: 500, y: 0 });
    expect(mortar.arrivesOnTurn).toBe(2); // mortar: one turn
    expect(arty.arrivesOnTurn).toBe(3); // artillery: two turns
    expect(g.smoke.length).toBe(0);
    expect(g.pendingSmoke.length).toBe(2);

    // Turn 2: only the mortar screen is down.
    g.advanceToPhase("initiative");
    const t2 = g.advanceToPhase("movement");
    expect(t2.smokeArrived.length).toBe(1);
    expect(g.smoke.length).toBe(1);
    expect(g.pendingSmoke.length).toBe(1);

    // Turn 3: the artillery screen joins it.
    g.advanceToPhase("initiative");
    const t3 = g.advanceToPhase("movement");
    expect(t3.smokeArrived.length).toBe(1);
    expect(g.pendingSmoke.length).toBe(0);
  });

  it("sizes the screen by its delivery means", () => {
    const g = ready();
    expect(g.deploySmoke("grenade", "BLUE", { x: 0, y: 0 }).radius).toBe(25);
    expect(g.deploySmoke("mortar", "BLUE", { x: 0, y: 0 }).radius).toBe(50);
    expect(g.deploySmoke("artillery", "BLUE", { x: 0, y: 0 }).radius).toBe(100);
  });

  it("gives a fired screen its full duration from the turn it lands", () => {
    const g = ready();
    g.deploySmoke("artillery", "BLUE", { x: 0, y: 0 }); // 4 turns, 2-turn flight

    g.advanceToPhase("movement"); // turn 1 — still in flight
    expect(g.smoke.length).toBe(0);
    g.advanceToPhase("initiative");
    g.advanceToPhase("movement"); // turn 2 — still in flight
    expect(g.smoke.length).toBe(0);
    g.advanceToPhase("initiative");
    expect(g.turn).toBe(3);

    g.advanceToPhase("movement"); // turn 3 — down, at full duration
    expect(g.smoke[0]!.turnsRemaining).toBe(4);
    expect(g.smoke[0]!.radius).toBe(100);
  });
});

describe("advanceToPhase", () => {
  it("hands back indirect fire that landed while stepping through phases", () => {
    const g = new Game({ seed: 3 });
    g.addUnit(makeInfantry("T", "RED", "squad", { x: 300, y: 300 }, 8));
    g.beginTurn();
    g.advanceToPhase("targeting");
    g.queueIndirectFire("mortar", "BLUE", { x: 300, y: 300 }); // 1-turn delay

    // Nothing lands this turn.
    expect(g.advanceToPhase("combat").resolved).toEqual([]);

    // Next turn, stepping targeting → movement crosses resolvePriorArty.
    g.advanceToPhase("initiative");
    expect(g.turn).toBe(2);
    g.advanceToPhase("targeting");
    const { resolved } = g.advanceToPhase("movement");
    expect(resolved.length).toBe(1);
    expect(resolved[0]!.weapon).toBe("mortar");
    expect(g.pendingFire.length).toBe(0);
  });
});

describe("end-to-end skirmish", () => {
  it("plays a few turns deterministically and resolves combat", () => {
    const g = new Game({ seed: 2024 });
    const blue = g.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", { x: 0, y: 0 }, 8));
    const red = g.addUnit(makeInfantry("RED-1", "RED", "squad", { x: 0, y: 80 }, 6));
    g.addUnit(makeVehicle("RED-TANK", "RED", { x: 0, y: 250 }));

    for (let turn = 0; turn < 6; turn++) {
      g.beginTurn();
      // intel
      g.advancePhase();
      // targeting
      g.advancePhase();
      // resolvePriorArty
      g.advancePhase();
      // movement
      g.advancePhase();
      if (!blue.movementBlocked && distanceBetween(blue, red) > 40) {
        try {
          g.moveUnit(blue.id, { x: 0, y: blue.position.y + 30 }, "normal");
        } catch {
          /* capped or blocked */
        }
      }
      // combat
      g.advancePhase();
      if (!blue.neutralized && !red.neutralized) {
        g.fire(blue.id, red.id, { weapon: "smallArms" });
      }
      if (!red.neutralized && !blue.neutralized) {
        g.fire(red.id, blue.id, { weapon: "smallArms" });
      }
      // summary
      g.advancePhase();
    }

    // The engine ran without throwing and produced a coherent state.
    expect(g.turn).toBe(6);
    const totalDamage =
      sumDamage(blue) + sumDamage(red);
    expect(totalDamage).toBeGreaterThan(0); // somebody got shot over six turns
  });
});

function distanceBetween(a: { position: { x: number; y: number } }, b: { position: { x: number; y: number } }) {
  return Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
}
function sumDamage(u: ReturnType<typeof makeInfantry>) {
  return (u.soldiers ?? []).reduce((s, x) => s + x.damagePoints, 0);
}
