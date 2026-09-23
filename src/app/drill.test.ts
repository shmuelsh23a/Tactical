import { describe, expect, it } from "vitest";
import { Game, makeCommandGroup, makeInfantry } from "../engine/index.js";
import { DrillState, PLAIN_SCRIPT, WESTERN_DRILL, drillCombat, drillMovement, type DrillTask } from "./drill.js";

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
