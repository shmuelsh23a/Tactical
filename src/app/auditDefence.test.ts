import { describe, expect, it, vi } from "vitest";
import { Game, makeCommandGroup, makeInfantry, makeMachineGunTeam } from "../engine/index.js";
import { callDefenderFire } from "./computerSide.js";
import { DOCTRINAL_DRILL, DrillState, PLAIN_SCRIPT, drillCombat, drillMovement, type DrillTask } from "./drill.js";

/**
 * The defender's fixes from the drill audit (docs/drill-audit.md, D1, D3–D5).
 */
const hold: DrillTask = { side: "RED", attacking: false, objective: { x: 0, y: 600 } };

describe("a defender's machine gun has its own trigger line (D1)", () => {
  it("holds its rifles to the drill's line and its gun to the gun's reach", () => {
    const g = new Game({ seed: 3, trackIntel: false, enforceC2: false });
    const rifles = g.addUnit(makeInfantry("RED-1-1", "RED", "squad", { x: 0, y: 0 }, 9));
    const gun = g.addUnit(makeMachineGunTeam("RED-MG", "RED", { x: 40, y: 0 }, 3));
    g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 700 }, 9));
    g.beginTurn();
    g.advanceToPhase("movement");
    drillMovement(g, hold, PLAIN_SCRIPT, new DrillState());
    expect(g.standingOrderFor(rifles.id)?.engagementRange).toBe(PLAIN_SCRIPT.openFireRange);
    expect(g.standingOrderFor(gun.id)?.engagementRange).toBe(PLAIN_SCRIPT.machineGuns!.range);
  });
});

describe("a defending platoon opens fire together (D4)", () => {
  it("lets the rest of a platoon fire to the attack range once one of it has fired", () => {
    const g = new Game({ seed: 3, trackIntel: false, enforceC2: false });
    const near = g.addUnit(makeInfantry("RED-1-1", "RED", "squad", { x: 0, y: 0 }, 9));
    const far = g.addUnit(makeInfantry("RED-1-2", "RED", "squad", { x: 100, y: -100 }, 9));
    const other = g.addUnit(makeInfantry("RED-2-1", "RED", "squad", { x: -100, y: -100 }, 9));
    g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 150 }, 9));
    g.beginTurn();
    const state = new DrillState();
    g.advanceToPhase("movement");
    drillMovement(g, hold, DOCTRINAL_DRILL, state);
    expect(g.standingOrderFor(far.id)?.engagementRange).toBe(DOCTRINAL_DRILL.openFireRange);
    g.advanceToPhase("combat");
    drillCombat(g, hold, DOCTRINAL_DRILL, state);
    expect(near.firedThisTurn).toBe(true);
    // Not this turn: its order still holds it to the line, and a shot the engine would refuse is not taken.
    expect(far.firedThisTurn).toBeFalsy();
    expect(far.covering).toBeTruthy();
    g.advanceToPhase("summary");
    g.advanceToPhase("movement");
    drillMovement(g, hold, DOCTRINAL_DRILL, state);
    expect(g.standingOrderFor(far.id)?.engagementRange).toBe(DOCTRINAL_DRILL.attackFireRange);
    g.advanceToPhase("combat");
    drillCombat(g, hold, DOCTRINAL_DRILL, state);
    expect(far.firedThisTurn).toBe(true);
    // And it survives a save.
    expect(DrillState.restore(state.snapshot()).opened).toEqual(state.opened);
    // Another platoon's fire is not opened by it.
    expect(g.standingOrderFor(other.id)?.engagementRange).toBe(DOCTRINAL_DRILL.openFireRange);
  });
});

describe("a reserve that is attacked fires (D5, amending decision 105)", () => {
  it("fights back when it is shot at, and holds while it is not", () => {
    const g = new Game({ seed: 3, trackIntel: false, enforceC2: false });
    const reserve = g.addUnit(makeInfantry("RED-A-1", "RED", "squad", { x: 0, y: -100 }, 8));
    g.addUnit(makeInfantry("RED-A-2", "RED", "squad", { x: 0, y: 0 }, 8));
    const enemy = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 150, y: -100 }, 8));
    g.beginTurn();
    const task: DrillTask = { ...hold, reserves: new Set([reserve.id]) };
    const state = new DrillState();
    g.advanceToPhase("movement");
    drillMovement(g, task, PLAIN_SCRIPT, state);
    g.advanceToPhase("combat");
    drillCombat(g, task, PLAIN_SCRIPT, state);
    expect(reserve.firedThisTurn).toBeFalsy();
    g.fire(enemy.id, reserve.id, { weapon: "smallArms" });
    g.advanceToPhase("summary");
    g.advanceToPhase("movement");
    drillMovement(g, task, PLAIN_SCRIPT, state);
    g.advanceToPhase("combat");
    drillCombat(g, task, PLAIN_SCRIPT, state);
    expect(reserve.firedThisTurn).toBe(true);
  });
});

describe("the defender's mortars cover forces on the move (D3)", () => {
  it("fire on the enemy nearest a squad breaking contact before anything off the plan", () => {
    const g = new Game({
      seed: 3,
      trackIntel: true,
      enforceC2: false,
      fireSupport: { RED: [{ weapon: "lightMortar", missions: 8, roundsForEffect: 10, tubes: 2 }] },
    });
    g.addUnit(makeCommandGroup("RED-COY", "RED", "company", { x: 0, y: -300 }));
    const moving = g.addUnit(makeInfantry("RED-1-1", "RED", "squad", { x: 0, y: 0 }, 9));
    const foe = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 250 }, 9));
    g.beginTurn();
    g.advanceToPhase("combat");
    g.fire(foe.id, moving.id, { weapon: "smallArms" }); // found by its fire
    g.advanceToPhase("initiative");
    g.advanceToPhase("targeting");
    const calls = vi.spyOn(g, "callForFire");
    // Nothing on the plan, and the foe not firing this turn: without a force to cover, no mission.
    expect(callDefenderFire(g, "RED", [{ x: 900, y: 900 }], false, [])).not.toBe("cover");
    expect(callDefenderFire(g, "RED", [{ x: 900, y: 900 }], false, [moving.position])).toBe("cover");
    expect(calls.mock.calls.at(-1)![2]).toEqual(g.contactFor("RED", foe.id)!.lastKnownPosition);
  });
});

describe("a planned mission only with the defender's own men clear (decision 119)", () => {
  it("holds a planned target while its own squad is within the lift of the mark, and fires once it is clear", () => {
    const g = new Game({ seed: 3, trackIntel: true, enforceC2: false, fireSupport: { RED: [{ weapon: "lightMortar", missions: 8, roundsForEffect: 10, tubes: 2 }] } });
    g.addUnit(makeCommandGroup("RED-COY", "RED", "company", { x: 0, y: -400 }));
    const own = g.addUnit(makeInfantry("RED-1-1", "RED", "squad", { x: 0, y: 160 }, 9));
    const foe = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 250 }, 9));
    g.beginTurn();
    g.advanceToPhase("combat");
    g.fire(foe.id, own.id, { weapon: "smallArms" }); // found by its fire
    g.advanceToPhase("summary");
    g.advanceToPhase("targeting");
    // The plan: an FPF and a priority target far off, a third target on the foe.
    const plan = [{ x: 900, y: 900 }, { x: 950, y: 950 }, { x: 0, y: 250 }];
    expect(callDefenderFire(g, "RED", plan)).not.toBe("plan");
    own.position = { x: 0, y: 0 }; // its squad back, beyond the 100 m lift
    expect(callDefenderFire(g, "RED", plan)).toBe("plan");
  });
});
