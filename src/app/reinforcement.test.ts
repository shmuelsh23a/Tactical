import { describe, expect, it } from "vitest";
import { Game, makeInfantry } from "../engine/index.js";
import { DOCTRINAL_DRILL, DrillState, REINFORCEMENT_BEHIND_M, drillCombat, drillMovement, type DrillTask } from "./drill.js";
import { UMPIRE_LENS, actionVisibleTo, lensFor, lessonsFor, replayForReview, unitSides } from "./debriefView.js";
import { describeOutcome, unitNames } from "./debriefText.js";

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

describe("a reinforcement in the debrief (decision 122)", () => {
  it("is its own side's force, by name, though no setup action added it", () => {
    const g = new Game({
      seed: 3,
      enforceC2: false,
      reinforcements: [{ side: "RED", window: [2, 2], units: [makeInfantry("RED-R1", "RED", "squad", { x: 0, y: -300 }, 8, "תגבורת 1")] }],
    });
    g.addUnit(makeInfantry("RED-1-1", "RED", "squad", { x: 0, y: 0 }, 8));
    g.addUnit(makeInfantry("BLUE-1-1", "BLUE", "squad", { x: 0, y: 900 }, 8));
    const nextTurn = (game: Game) => {
      if (game.turn > 0) game.advanceToPhase("summary");
      game.beginTurn();
    };
    const due = g.reinforcements[0]!.turn;
    for (let t = 0; t < due; t++) nextTurn(g);
    g.advanceToPhase("movement");
    g.setStandingOrder("RED-R1", { gait: "normal", destination: { x: 0, y: -250 } });
    const rec = g.toRecording();
    const sides = unitSides(rec);
    expect(sides.get("RED-R1")).toBe("RED");
    expect(unitNames(rec).get("RED-R1")).toBe(g.getUnit("RED-R1").name);
    const order = rec.actions.findIndex((a) => a.kind === "setStandingOrder");
    const lens = lensFor("RED", order, [], sides);
    expect(lens.isOwn("RED-R1")).toBe(true);
    expect(actionVisibleTo(rec.actions[order]!, "RED", lens, sides)).toBe(true);
  });
});

describe("the debrief narrates a reinforcement's arrival (decision 122)", () => {
  // The ways a turn opens: the App closes a turn into the next with
  // advanceToPhase("initiative"); a tool may step out of the summary with
  // advancePhase, or call beginTurn from it.
  for (const opening of ["advanceToPhase", "advancePhase", "beginTurn"] as const) {
    it(`to the side it reinforced, and the umpire, only (${opening})`, () => {
      const g = new Game({
        seed: 3,
        enforceC2: false,
        reinforcements: [{ side: "RED", window: [2, 2], units: [makeInfantry("RED-R1", "RED", "squad", { x: 0, y: -300 }, 8, "תגבורת 1")] }],
      });
      g.addUnit(makeInfantry("RED-1-1", "RED", "squad", { x: 0, y: 0 }, 8));
      g.addUnit(makeInfantry("BLUE-1-1", "BLUE", "squad", { x: 0, y: 900 }, 8));
      const due = g.reinforcements[0]!.turn;
      g.beginTurn();
      while (g.turn < due) {
        if (opening === "advanceToPhase") {
          g.advanceToPhase("summary");
          g.advanceToPhase("initiative");
        } else if (opening === "advancePhase") {
          g.advanceToPhase("summary");
          g.advancePhase();
        } else {
          g.advanceToPhase("summary");
          g.beginTurn();
        }
      }
      const rec = g.toRecording();
      const { steps, contactsAfter } = replayForReview(rec);
      const at = steps.findIndex((s) => "arrived" in s.outcome && s.outcome.arrived);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(steps[at]!.outcome.kind).toBe(opening === "beginTurn" ? "beginTurn" : "phase");
      const names = unitNames(rec);
      const sides = unitSides(rec);
      const line = (side: "RED" | "BLUE") =>
        describeOutcome(steps[at]!.outcome, names, lensFor(side, at, contactsAfter, sides), steps[at]!.action);
      expect(line("RED")).toContain("הגיעה תגבורת: תגבורת 1");
      expect(line("BLUE")).not.toContain("תגבורת");
      // The enemy still reads the rest of the step: the initiative, where it is one.
      if (opening === "beginTurn") expect(line("BLUE")).toContain("יוזמה");
      expect(describeOutcome(steps[at]!.outcome, names, UMPIRE_LENS, steps[at]!.action)).toContain("הגיעה תגבורת: תגבורת 1");
      // Told once: no other step carries it.
      expect(steps.filter((s) => "arrived" in s.outcome && s.outcome.arrived)).toHaveLength(1);
    });
  }
});

describe("the lessons count a reinforcement as unseen only once it has come (decision 122)", () => {
  it("leaves out one still due, and counts it after its turn", () => {
    const g = new Game({
      seed: 3,
      enforceC2: false,
      reinforcements: [{ side: "RED", window: [3, 3], units: [makeInfantry("RED-R1", "RED", "squad", { x: 0, y: -300 }, 8)] }],
    });
    g.addUnit(makeInfantry("RED-1-1", "RED", "squad", { x: 0, y: 0 }, 8));
    g.addUnit(makeInfantry("BLUE-1-1", "BLUE", "squad", { x: 0, y: 5000 }, 8));
    g.beginTurn();
    g.advanceToPhase("summary");
    g.advanceToPhase("initiative"); // turn 2: not yet
    const before = g.toRecording().actions.length;
    g.advanceToPhase("summary");
    g.advanceToPhase("initiative"); // turn 3: it comes
    const rec = g.toRecording();
    const { steps, contactsAfter } = replayForReview(rec);
    const sides = unitSides(rec);
    expect(lessonsFor("BLUE", before, steps, contactsAfter, sides).neverDetected).toEqual(["RED-1-1"]);
    expect(lessonsFor("BLUE", steps.length, steps, contactsAfter, sides).neverDetected.sort()).toEqual(["RED-1-1", "RED-R1"]);
  });
});
