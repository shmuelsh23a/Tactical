import { describe, it, expect } from "vitest";
import {
  Game,
  makeCommandGroup,
  makeInfantry,
  type GameRecording,
  type Side,
} from "../engine/index.js";
import { casualtyReport, describeOutcome, unitNames } from "./debriefText.js";
import {
  actionVisibleTo,
  lensFor,
  lessonsFor,
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

  it("reports its own shooters for a shot at a force it cannot see, but no effect", () => {
    // Rules decision 13 (author, 2026-08-16). A side always knows how many of
    // its own men fired and at what chance — its own business — while what the
    // shot *achieved* is an observation it never made. So the line appears, and
    // says nothing about the target.
    const shot = find("fire")[0]!;
    const blind = {
      isOwn: (id: string) => sides.get(id) === "RED",
      mayKnow: (id: string) => sides.get(id) === "RED",
    };
    expect(outcomeVisibleTo(shot.action, "RED", sides, blind)).toBe(true);

    const line = describeOutcome(steps[shot.index]!.outcome, names, blind, shot.action);
    expect(line).toMatch(/יורים/); // its own men, and its own chance
    expect(line).toContain("ללא תצפית על המטרה");
    expect(line).not.toMatch(/נפגעים|נוטרל/); // nothing about what it found
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

describe("how precisely a side is told what it did", () => {
  const shot = find("fire")[0]!;
  const outcome = steps[shot.index]!.outcome;

  it("counts exactly for the umpire", () => {
    // The umpire has the whole picture: that is what an umpire is for.
    const text = describeOutcome(outcome, names, undefined, shot.action);
    expect(text).toMatch(/\d+ נפגעים/);
    expect(text).toContain("פגיעות");
  });

  it("reports rather than counts for the force that fired", () => {
    // RED fired on BLUE: it saw the effect, it did not count the bodies.
    const asRed = describeOutcome(
      outcome,
      names,
      lensFor("RED", shot.index, contactsAfter, sides),
      shot.action,
    );
    expect(asRed).not.toMatch(/\d+ נפגעים/);
    expect(asRed).toMatch(/נפגעים בודדים|מספר נפגעים|אבידות כבדות|ללא נפגעים שנצפו/);
  });

  it("keeps a side's own losses exact", () => {
    // BLUE was the one fired on; its own casualty state is not an estimate.
    const asBlue = describeOutcome(
      outcome,
      names,
      lensFor("BLUE", shot.index, contactsAfter, sides),
      shot.action,
    );
    expect(asBlue).toMatch(/\d+ נפגעים/);
  });

  it("bands losses the way the report reads", () => {
    expect(casualtyReport(3, true)).toBe("3 נפגעים");
    expect(casualtyReport(0, false)).toBe("ללא נפגעים שנצפו");
    expect(casualtyReport(2, false)).toBe("נפגעים בודדים");
    expect(casualtyReport(5, false)).toBe("מספר נפגעים");
    expect(casualtyReport(9, false)).toBe("אבידות כבדות");
  });
});

describe("the lessons a side takes out of it", () => {
  const total = rec.actions.length;
  const asBlue = () => lessonsFor("BLUE", total, steps, contactsAfter, sides);
  const asRed = () => lessonsFor("RED", total, steps, contactsAfter, sides);

  it("names the forces a side never found", () => {
    // BLUE walked in against forces that held still. It ends the battle knowing
    // only the one that fired on it — which is how it learned of it at all.
    expect(asBlue().neverDetected).toEqual(["RED-2"]);
    // RED watched the approach, so BLUE's squad is not on its list.
    expect(asRed().neverDetected).not.toContain("BLUE-1");
  });

  it("counts being fired on by a force that was never seen — the ambush", () => {
    expect(asBlue().hitByUnseen).toBe(1);
    expect(asRed().hitByUnseen).toBe(0);
  });

  it("counts fire sent at something the side had no eyes on", () => {
    // RED could see what it fired at, so this is the good case: nothing blind.
    expect(asRed().firedUnseen).toBe(0);
  });

  it("keeps the umpire's tally for the reveal, on both sides of the ledger", () => {
    const blue = asBlue();
    const red = asRed();
    // One shot, one set of casualties: what RED inflicted is what BLUE suffered.
    expect(red.inflicted).toBe(blue.suffered);
    expect(red.suffered).toBe(blue.inflicted);
  });

  it("grows with the battle rather than being known from the start", () => {
    expect(lessonsFor("BLUE", 0, steps, contactsAfter, sides).hitByUnseen).toBe(0);
    expect(asBlue().hitByUnseen).toBeGreaterThan(0);
  });
});

describe("a sector of observation in the review", () => {
  /**
   * Where a force was told to look is a decision taken behind its own lines, so
   * it goes to its own side and nowhere else. The switches in `debriefView`
   * default to *hidden*, so a new action that nobody added to them disappears
   * silently rather than leaking — this is the test that says which it is.
   */
  const rec2 = (() => {
    const g = new Game({ seed: 4, enforceC2: false, trackIntel: true });
    const blue = g.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", { x: 0, y: 0 }, 8));
    g.addUnit(makeInfantry("RED-1", "RED", "squad", { x: 200, y: 0 }, 6));
    g.beginTurn();
    g.setObservationSector(blue.id, { bearing: 0, width: 90 });
    return g.toRecording();
  })();
  const sides2 = unitSides(rec2);
  const { steps: steps2, contactsAfter: after2 } = replayForReview(rec2);
  const index = rec2.actions.findIndex((a) => a.kind === "setObservationSector");
  const action = rec2.actions[index]!;

  it("is the owner's to see, and the enemy's never", () => {
    expect(index).toBeGreaterThanOrEqual(0);
    for (const side of ["BLUE", "RED"] as Side[]) {
      const lens = lensFor(side, index, after2, sides2);
      const mine = side === "BLUE";
      expect(actionVisibleTo(action, side, lens, sides2)).toBe(mine);
      expect(outcomeVisibleTo(action, side, sides2, lens)).toBe(mine);
    }
  });

  it("says in Hebrew which way the force was told to look", () => {
    const step = steps2.find((s) => s.action.kind === "setObservationSector")!;
    expect(describeOutcome(step.outcome, unitNames(rec2))).toContain("%");
  });
});

describe("what a side's own fire is allowed to teach it", () => {
  /**
   * Rules decision 13, settled 2026-08-16. The dividing line is *observation*,
   * not ownership of the shot: a side always knows its own shooters and its own
   * chance, and learns what the fire achieved only where it was watching.
   */
  const shot = find("fire")[0]!;
  const outcome = steps[shot.index]!.outcome;
  const lensFor2 = (mayKnow: (id: string) => boolean) => ({
    isOwn: (id: string) => sides.get(id) === "RED",
    mayKnow,
  });

  it("bands the effect for a force it is holding a contact on", () => {
    const watching = lensFor2(() => true);
    const line = describeOutcome(outcome, names, watching, shot.action);
    expect(line).toMatch(/יורים/);
    expect(line).not.toContain("ללא תצפית על המטרה");
  });

  it("withholds the effect the moment the contact is gone", () => {
    const blind = lensFor2((id) => sides.get(id) === "RED");
    expect(describeOutcome(outcome, names, blind, shot.action)).toContain(
      "ללא תצפית על המטרה",
    );
  });

  it("still gives the target's own side the exact tally of its losses", () => {
    // Being shot is always known, and a side counts its own casualties — the
    // new "no observation" path must not swallow that.
    const asBlue = { isOwn: (id: string) => sides.get(id) === "BLUE", mayKnow: () => true };
    const line = describeOutcome(outcome, names, asBlue, shot.action);
    expect(line).toMatch(/\d+ נפגעים/);
    expect(line).not.toContain("ללא תצפית על המטרה");
  });
});
