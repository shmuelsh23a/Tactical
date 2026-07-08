import { describe, it, expect } from "vitest";
import { Game, PHASES } from "./game.js";
import { makeInfantry, makeVehicle, fitSoldiers } from "./units.js";

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
