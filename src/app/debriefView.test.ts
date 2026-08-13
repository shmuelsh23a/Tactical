import { describe, it, expect } from "vitest";
import {
  Game,
  makeCommandGroup,
  makeInfantry,
  type GameRecording,
  type Side,
} from "../engine/index.js";
import { describeOutcome, unitNames } from "./debriefText.js";
import {
  actionVisibleTo,
  lensFor,
  outcomeVisibleTo,
  replayForReview,
  unitSides,
} from "./debriefView.js";

/**
 * A battle with the knowledge model on: BLUE advances into RED, which is
 * sitting still (and therefore hidden) until it fires.
 */
function battle(): GameRecording {
  const g = new Game({ seed: 5, enforceC2: false, trackIntel: true });
  const blue = g.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", { x: 0, y: 260 }, 8));
  g.addUnit(makeCommandGroup("BLUE-HQ", "BLUE", "platoon", { x: 0, y: 300 }, 3));
  const red = g.addUnit(makeInfantry("RED-1", "RED", "squad", { x: 0, y: 0 }, 6));
  g.addUnit(makeInfantry("RED-2", "RED", "squad", { x: 400, y: 0 }, 6));

  g.beginTurn();
  g.advanceToPhase("movement");
  g.setStandingOrder(blue.id, { gait: "normal", destination: { x: 0, y: 100 } });
  g.executeStandingOrders("BLUE");
  g.advanceToPhase("combat");
  g.fire(red.id, blue.id, { weapon: "sustainedMg" });
  g.advanceToPhase("summary");
  return g.toRecording();
}

const rec = battle();
const sides = unitSides(rec);
const names = unitNames(rec);
const { steps, contactsAfter } = replayForReview(rec);

/** Every action of `kind`, with its index. */
function find(kind: string) {
  return rec.actions
    .map((action, index) => ({ action, index }))
    .filter((a) => a.action.kind === kind);
}

const visible = (index: number, side: Side) => {
  const action = rec.actions[index]!;
  return actionVisibleTo(action, side, lensFor(side, index, contactsAfter, sides), sides);
};

describe("what a side is shown of the battle", () => {
  it("keeps the enemy's setup off the board entirely", () => {
    // A force never detected is absent from the review, not merely unmentioned.
    for (const { index, action } of find("addUnit")) {
      if (action.kind !== "addUnit") continue;
      expect(visible(index, "BLUE")).toBe(action.unit.side === "BLUE");
      expect(visible(index, "RED")).toBe(action.unit.side === "RED");
    }
  });

  it("never shows the enemy's orders", () => {
    const order = find("setStandingOrder")[0]!;
    expect(visible(order.index, "BLUE")).toBe(true);
    expect(visible(order.index, "RED")).toBe(false);
  });

  it("shows the turn structure to both", () => {
    const turn = find("beginTurn")[0]!;
    expect(visible(turn.index, "BLUE")).toBe(true);
    expect(visible(turn.index, "RED")).toBe(true);
  });

  it("shows a side being fired on, whoever fired", () => {
    // RED fires at BLUE: RED knows it did, and BLUE knows it was fired on —
    // firing is what puts a force on the enemy's map (rules decision 12).
    const shot = find("fire")[0]!;
    expect(visible(shot.index, "RED")).toBe(true);
    expect(visible(shot.index, "BLUE")).toBe(true);
  });

  it("hides an enemy bound that nobody watched", () => {
    // RED never detects BLUE until BLUE is fired on, so BLUE's approach under
    // orders is not something RED's review may replay.
    const execution = find("executeStandingOrders")[0]!;
    expect(visible(execution.index, "BLUE")).toBe(true);
    expect(visible(execution.index, "RED")).toBe(false);
  });
});

describe("what a side is told an action produced", () => {
  const outcomeFor = (index: number, side: Side) =>
    outcomeVisibleTo(rec.actions[index]!, side, sides, lensFor(side, index, contactsAfter, sides));

  it("gives a side the result of its own fire on a force it can see", () => {
    const shot = find("fire")[0]!;
    expect(outcomeFor(shot.index, "RED")).toBe(true);
  });

  it("tells the force being fired on what it cost them", () => {
    // Casualties among your own men are not something you have to observe.
    const shot = find("fire")[0]!;
    expect(outcomeFor(shot.index, "BLUE")).toBe(true);
  });

  it("says nothing of what a shot at a force it cannot see achieved", () => {
    // The reading behind rules decision 13: a side watches the fall of its own
    // fire only on a force it holds a contact on.
    const shot = find("fire")[0]!;
    const blind = { isOwn: (id: string) => sides.get(id) === "RED", mayKnow: (id: string) => sides.get(id) === "RED" };
    expect(outcomeVisibleTo(shot.action, "RED", sides, blind)).toBe(false);
  });

  it("does not tell a side what the enemy's own orders produced", () => {
    const execution = find("executeStandingOrders")[0]!;
    expect(outcomeFor(execution.index, "RED")).toBe(false);
  });

  it("redacts a force the reader has never seen out of the narration", () => {
    // The umpire sees who spotted whom; a side sees only its own reports.
    const phase = steps.findIndex(
      (s) => s.outcome.kind === "phase" && s.outcome.observed.length > 0,
    );
    expect(phase).toBeGreaterThan(-1);
    const outcome = steps[phase]!.outcome;

    const umpire = describeOutcome(outcome, names);
    const asBlue = describeOutcome(outcome, names, lensFor("BLUE", phase, contactsAfter, sides));
    expect(umpire).toContain("איתר");
    // RED did the spotting here, so BLUE's review says nothing about it.
    expect(asBlue).toBe("");
  });

  it("hands the spotting side its own report", () => {
    const phase = steps.findIndex(
      (s) => s.outcome.kind === "phase" && s.outcome.observed.length > 0,
    );
    const asRed = describeOutcome(
      steps[phase]!.outcome,
      names,
      lensFor("RED", phase, contactsAfter, sides),
    );
    expect(asRed).toContain("איתר את");
  });
});

describe("the contact ledger behind the review", () => {
  it("is rebuilt per step, from the same replay the outcomes come from", () => {
    expect(contactsAfter).toHaveLength(rec.actions.length);
    // RED picks BLUE up as it walks in; BLUE never sees the second RED squad,
    // which sat still and out of the way the whole battle.
    const last = contactsAfter[rec.actions.length - 1]!;
    expect(last.RED.has("BLUE-1")).toBe(true);
    expect(last.BLUE.has("RED-2")).toBe(false);
  });

  it("grows over the battle rather than being known from the start", () => {
    expect(contactsAfter[0]!.RED.size).toBe(0);
    expect(contactsAfter[rec.actions.length - 1]!.RED.size).toBeGreaterThan(0);
  });
});
