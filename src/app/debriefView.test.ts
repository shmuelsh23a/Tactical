import { describe, it, expect } from "vitest";
import {
  Game,
  makeCommandGroup,
  makeInfantry,
  type GameRecording,
  type Side,
} from "../engine/index.js";
import { casualtyReport, describeOutcome, unitNames, type Lens } from "./debriefText.js";
import {
  actionVisibleTo,
  lensFor,
  lessonsFor,
  outcomeVisibleTo,
  replayForReview,
  UMPIRE_LENS,
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
  // Flagged before it is added — addUnit records the force as it stands.
  const redSquad = makeInfantry("RED-1", "RED", "squad", { x: 0, y: 0 }, 6);
  redSquad.canLayCharges = true;
  const red = g.addUnit(redSquad);
  g.addUnit(makeInfantry("RED-2", "RED", "squad", { x: 400, y: 0 }, 6));

  g.beginTurn();
  g.advanceToPhase("movement");
  g.setStandingOrder(blue.id, { gait: "normal", destination: { x: 0, y: 100 } });
  g.executeStandingOrders("BLUE");
  g.layCharge(red.id, "antiPersonnel");
  g.advanceToPhase("combat");
  g.fire(red.id, blue.id, { weapon: "smallArms" });
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

  it("never shows the enemy laying a charge", () => {
    // The work is done out of sight; the charge is found on the ground by the
    // search roll or not at all (rules decisions 10 and 16).
    const work = find("layCharge")[0]!;
    expect(visible(work.index, "RED")).toBe(true);
    expect(visible(work.index, "BLUE")).toBe(false);
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
    const blind: Lens = {
      side: "RED",
      isOwn: (id: string) => sides.get(id) === "RED",
      mayKnow: (id: string) => sides.get(id) === "RED",
    };
    expect(outcomeVisibleTo(shot.action, "RED", sides, blind)).toBe(true);

    const line = describeOutcome(steps[shot.index]!.outcome, names, blind, shot.action);
    expect(line).toMatch(/יורים/); // its own men, and its own chance
    expect(line).toContain("ללא תצפית על המטרה");
    expect(line).not.toMatch(/נפגעים|נוטרל/); // nothing about what it found
  });

  /**
   * The other half of the charge rule's disclosure. Hiding the *decision* to
   * lay one buys nothing if the line that reports the finished charge — the
   * one carrying its position — reaches the enemy's debrief. So this drives a
   * battle past the end of a turn, which is where that line is produced.
   */
  it("never tells the enemy a charge went into the ground", () => {
    const g = new Game({ seed: 5, enforceC2: false, trackIntel: true });
    g.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", { x: 0, y: 400 }, 8));
    const layer = makeInfantry("RED-1", "RED", "squad", { x: 0, y: 0 }, 6);
    layer.canLayCharges = true;
    g.addUnit(layer);

    g.beginTurn();
    g.advanceToPhase("movement");
    g.layCharge("RED-1", "antiTank");
    for (let turn = 0; turn < 2; turn++) {
      g.advanceToPhase("summary");
      g.advancePhase();
      g.advanceToPhase("movement");
    }
    expect(g.mines).toHaveLength(1); // the work finished

    const rec = g.toRecording();
    const theirSides = unitSides(rec);
    const theirNames = unitNames(rec);
    const review = replayForReview(rec);
    const step = review.steps.findIndex(
      (s) => s.outcome.kind === "phase" && (s.outcome.chargeWork ?? []).some((w) => w.mine),
    );
    expect(step).toBeGreaterThan(-1);

    const lens = (side: Side) => ({
      side,
      isOwn: (id: string) => theirSides.get(id) === side,
      // Worst case for the rule: the enemy is holding a contact on the layer.
      mayKnow: () => true,
    });
    const outcome = review.steps[step]!.outcome;
    const action = rec.actions[step]!;
    const red = describeOutcome(outcome, theirNames, lens("RED"), action);
    const blue = describeOutcome(outcome, theirNames, lens("BLUE"), action);
    expect(red).toContain("סיים להניח");
    expect(blue).not.toContain("מטען");
    expect(blue).not.toContain("להניח");
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
    side: "RED" as Side,
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
    const asBlue: Lens = {
      side: "BLUE",
      isOwn: (id: string) => sides.get(id) === "BLUE",
      mayKnow: () => true,
    };
    const line = describeOutcome(outcome, names, asBlue, shot.action);
    expect(line).toMatch(/\d+ נפגעים/);
    expect(line).not.toContain("ללא תצפית על המטרה");
  });
});

/**
 * A battle where one side's **standing order** does the shooting, and the other
 * side's mortars come down (rules decisions 13 and 17).
 *
 * RED holds an order to engage BLUE-1 and carries it out; BLUE has a mortar
 * mission in the air. Both are things the enemy's review used to get wrong: the
 * whole standing-order step was hidden from the force it shot at, and the miss
 * distance — which measures the shell against the *gunner's* aim point — was
 * read out to the side underneath it.
 */
function orderedBattle(): GameRecording {
  // **Seed 546 because the burst draws blood.** Most seeds here hit and kill
  // nobody, and a 0-casualty engagement cannot show the difference between a
  // count and a report — which is the whole point of the test below. With
  // small arms (a squad cannot fire ירי מקביל, decision 25) only 546, 550, 656
  // and 1055 of the first 1055 seeds produce a casualty at 120 m.
  const g = new Game({ seed: 546, enforceC2: false, trackIntel: true });
  const blue = g.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", { x: 0, y: 120 }, 8));
  const red = g.addUnit(makeInfantry("RED-1", "RED", "squad", { x: 0, y: 0 }, 6));

  g.beginTurn();
  g.advanceToPhase("targeting");
  // A mortar mission of BLUE's, with a 1-turn delay: it comes down next turn on
  // the way into movement.
  g.queueIndirectFire("mortar", "BLUE", { x: 0, y: 40 });
  g.advanceToPhase("movement");
  g.setStandingOrder(red.id, {
    gait: "normal",
    engage: { targetId: blue.id, weapon: "smallArms" },
  });
  g.advanceToPhase("combat");
  g.executeStandingOrders("RED");
  g.advanceToPhase("initiative");
  g.advanceToPhase("targeting");
  g.advanceToPhase("movement"); // crosses resolvePriorArty — the round lands
  g.advanceToPhase("summary");
  return g.toRecording();
}

describe("an engagement fired under a standing order", () => {
  const rec2 = orderedBattle();
  const sides2 = unitSides(rec2);
  const names2 = unitNames(rec2);
  const { steps: steps2, contactsAfter: contacts2 } = replayForReview(rec2);
  const at = (kind: string) => {
    const index = rec2.actions.findIndex((a) => a.kind === kind);
    expect(index).toBeGreaterThan(-1);
    return index;
  };
  const lensAt = (index: number, side: Side) => lensFor(side, index, contacts2, sides2);

  it("actually engages, or the rest of this proves nothing", () => {
    const i = at("executeStandingOrders");
    const outcome = steps2[i]!.outcome;
    expect(outcome.kind).toBe("executeStandingOrders");
    if (outcome.kind !== "executeStandingOrders") return;
    expect(outcome.executions.some((e) => e.engaged)).toBe(true);
  });

  it("is shown to the force it was fired at", () => {
    // Being fired on is always known (rules decision 13). The step used to be
    // hidden from BLUE wholesale because it belonged to RED.
    const i = at("executeStandingOrders");
    const step = steps2[i]!;
    expect(actionVisibleTo(step.action, "BLUE", lensAt(i, "BLUE"), sides2, step.outcome)).toBe(true);
    expect(outcomeVisibleTo(step.action, "BLUE", sides2, lensAt(i, "BLUE"), step.outcome)).toBe(
      true,
    );
  });

  it("stays hidden without the outcome to look at", () => {
    // A caller with no outcome in hand gets the conservative answer rather than
    // a step it cannot check.
    const i = at("executeStandingOrders");
    expect(actionVisibleTo(steps2[i]!.action, "BLUE", lensAt(i, "BLUE"), sides2)).toBe(false);
  });

  it("counts the losses for the side that took them and bands them for the shooter", () => {
    const i = at("executeStandingOrders");
    const outcome = steps2[i]!.outcome;
    const blue = describeOutcome(outcome, names2, lensAt(i, "BLUE"), steps2[i]!.action);
    const red = describeOutcome(outcome, names2, lensAt(i, "RED"), steps2[i]!.action);
    // BLUE owns the men who fell: its own casualty state is counted, and it is
    // told what landed on them.
    expect(blue).toMatch(/[1-9]\d* נפגעים/);
    expect(blue).toMatch(/\d+ פגיעות/);
    // …but **not** at what chance. How many men fired and at what chance is the
    // firer's own business (decisions 13 and 17), and a hotseat battle journals
    // orders rather than shots, so this is the path most fire in the game takes.
    expect(blue).not.toMatch(/%/);
    // RED reports what its fire appeared to do — a band, and never a hit count.
    expect(red).toMatch(/נפגעים בודדים|מספר נפגעים|אבידות כבדות|ללא נפגעים שנצפו/);
    expect(red).not.toMatch(/\d+ נפגעים/);
    expect(red).not.toMatch(/פגיעות/);
    expect(red).toMatch(/%/);
  });
});

describe("how far a round fell from its aim point", () => {
  const rec2 = orderedBattle();
  const sides2 = unitSides(rec2);
  const names2 = unitNames(rec2);
  const { steps: steps2, contactsAfter: contacts2 } = replayForReview(rec2);
  const landed = steps2.findIndex(
    (s) => s.outcome.kind === "phase" && s.outcome.resolved.length > 0,
  );

  it("finds the round, or the rest of this proves nothing", () => {
    expect(landed).toBeGreaterThan(-1);
  });

  it("tells the gunner, and tells the side underneath only that it fell", () => {
    // The deviation measures the shell against BLUE's own aim point, which is
    // not something RED is in a position to know (rules decision 17).
    const outcome = steps2[landed]!.outcome;
    const gunner = describeOutcome(outcome, names2, lensFor("BLUE", landed, contacts2, sides2));
    const under = describeOutcome(outcome, names2, lensFor("RED", landed, contacts2, sides2));
    expect(gunner).toMatch(/נחיתה (בסטייה|מדויקת)/);
    expect(under).toContain("נחיתה");
    expect(under).not.toContain("סטייה");
    expect(under).not.toContain("מדויקת");
  });

  it("leaves the umpire's view alone", () => {
    const outcome = steps2[landed]!.outcome;
    expect(describeOutcome(outcome, names2)).toMatch(/נחיתה (בסטייה|מדויקת)/);
  });
});

describe("a shot, as each of the three readers is entitled to read it", () => {
  /**
   * Rules decision 17. `exact` — "the reader owns the target" — is true of the
   * umpire *and* of the force being shot at, so one flag cannot separate
   * "entitled to the whole picture" from "entitled to count its own dead". The
   * target used to read the firer's exact fit strength, its hit chance and the
   * damage it took: everything the casualty bands exist to withhold.
   */
  const shot = find("fire")[0]!;
  const outcome = steps[shot.index]!.outcome;
  const lensAt = (side: Side) => lensFor(side, shot.index, contactsAfter, sides);
  // RED fired on BLUE-1 in the fixture at the top of this file.
  const firer = describeOutcome(outcome, names, lensAt("RED"), shot.action);
  const target = describeOutcome(outcome, names, lensAt("BLUE"), shot.action);
  const umpire = describeOutcome(outcome, names, UMPIRE_LENS, shot.action);

  it("gives the umpire everything", () => {
    expect(umpire).toMatch(/יורים|\/\d+ פגיעות/);
    expect(umpire).toContain('נק"פ');
  });

  it("gives the firer its own men and chance, and a report of the effect", () => {
    expect(firer).toMatch(/\d+ יורים/);
    expect(firer).toMatch(/%/);
    expect(firer).not.toContain('נק"פ');
  });

  it("never tells the target how many men fired, at what chance, for what damage", () => {
    expect(target).not.toMatch(/יורים/);
    expect(target).not.toMatch(/%/);
    expect(target).not.toContain('נק"פ');
    // What it *is* told: what landed on its own men, counted.
    expect(target).toMatch(/\d+ פגיעות/);
    expect(target).toMatch(/\d+ נפגעים/);
  });
});
