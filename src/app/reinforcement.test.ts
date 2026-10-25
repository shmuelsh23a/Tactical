import { describe, expect, it } from "vitest";
import { Game, makeInfantry } from "../engine/index.js";
import { DOCTRINAL_DRILL, DrillState, REINFORCEMENT_BEHIND_M, drillCombat, drillMovement, type DrillTask } from "./drill.js";

/**
 * The defender's reinforcement in the drill (rules decision 122): on arrival
 * it goes up behind the posts and waits there as a reserve, its fire held,
 * then counterattacks a lost post — any platoon's.
 */
describe("a reinforcement joins the defence as a reserve (decision 122)", () => {
  function battle() {
    const g = new Game({
      seed: 3,
      trackIntel: false,
      enforceC2: false,
      reinforcements: [{ side: "RED", window: [2, 2], units: [makeInfantry("RED-R1", "RED", "squad", { x: 500, y: 0 }, 8)] }],
    });
    const post = g.addUnit(makeInfantry("RED-1-1", "RED", "squad", { x: 500, y: 500 }, 8));
    g.addUnit(makeInfantry("BLUE-1-1", "BLUE", "squad", { x: 500, y: 1000 }, 8));
    const task: DrillTask = { side: "RED", attacking: false, objective: { x: 500, y: 1100 }, extent: { width: 1000, height: 1200 } };
    return { g, post, task, state: new DrillState() };
  }
  const turn = (g: Game, task: DrillTask, state: DrillState) => {
    if (g.turn > 0) g.advanceToPhase("summary");
    g.beginTurn();
    g.advanceToPhase("movement");
    drillMovement(g, task, DOCTRINAL_DRILL, state);
  };

  it("goes up behind the posts and holds its fire there", () => {
    const { g, task, state } = battle();
    turn(g, task, state);
    turn(g, task, state); // turn 2: it arrives
    const r = g.getUnit("RED-R1");
    const at = state.reinforcementPosts.get(r.id)!;
    expect(at).toEqual({ x: 500, y: 500 - REINFORCEMENT_BEHIND_M });
    expect(g.standingOrderFor(r.id)?.destination).toEqual(at);
    // There, and an enemy in reach, it holds its fire as a reserve does (decision 105).
    r.position = { ...at };
    g.getUnit("BLUE-1-1").position = { x: 500, y: 250 };
    g.advanceToPhase("combat");
    drillCombat(g, task, DOCTRINAL_DRILL, state);
    expect(r.firedThisTurn).toBeFalsy();
  });

  it("counterattacks a lost post, though the post is another platoon's", () => {
    const { g, post, task, state } = battle();
    turn(g, task, state);
    turn(g, task, state);
    post.neutralized = true;
    g.getUnit("BLUE-1-1").position = { x: 500, y: 520 }; // on the post
    turn(g, task, state);
    expect(state.counterattacking.has("RED-R1")).toBe(true);
  });
});
