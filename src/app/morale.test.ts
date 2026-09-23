import { describe, expect, it } from "vitest";
import { Game, makeCommandGroup, makeInfantry, replayWithOutcomes, type Unit } from "../engine/index.js";
import { outsideView, sideDefeated, sideView } from "./hotseat.js";
import { describeOutcome, describeStandingOrder, moraleReportHe, reasonHe, unitNames } from "./debriefText.js";

/**
 * Morale in front of a player (rules decision 19): a side sees its own forces'
 * states and never a number, and of the enemy's only what can be watched — a
 * force running, or giving itself up.
 */
function battle() {
  const g = new Game({ seed: 4, morale: true, enforceC2: false });
  const blue = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 8, "כיתה"));
  g.addUnit(makeCommandGroup("B-HQ", "BLUE", "platoon", { x: 0, y: -100 }));
  const red = g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 150 }, 8, "אויב"));
  return { g, blue, red };
}

describe("what the enemy may see of a force's morale", () => {
  it("strips the men's pools and traits, and the suppression", () => {
    const { red } = battle();
    red.suppression = 30;
    const seen = outsideView(red, true);
    expect(seen.suppression).toBeUndefined();
    expect(seen.soldiers!.every((s) => s.morale == null && s.traits == null && s.leader == null)).toBe(true);
    // The truth is untouched: the view is a copy.
    expect(red.soldiers![0]!.morale).toBeDefined();
  });

  it("shows a rout it is watching, and not one on a stale mark", () => {
    const { red } = battle();
    red.routing = true;
    expect(outsideView(red, true).routing).toBe(true);
    expect(outsideView(red, false).routing).toBeUndefined();
  });

  it("is what the side's view draws, with or without the knowledge model", () => {
    const { g } = battle();
    const enemy = sideView(g, "BLUE").units.find((u: Unit) => u.id === "R");
    expect(enemy?.soldiers?.[0]?.morale).toBeUndefined();
    const own = sideView(g, "BLUE").units.find((u: Unit) => u.id === "B");
    expect(own?.soldiers?.[0]?.morale).toBeDefined();
  });

  it("does not say a force is an observation post (rules decision 38)", () => {
    const g = new Game({ seed: 4 });
    const red = g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 8));
    g.designateObservationPost("R");
    expect(outsideView(red, true).observationPost).toBeUndefined();
    expect(red.observationPost).toBe(true);
  });

  it("a game without morale hands the force over untouched", () => {
    const g = new Game({ seed: 4 });
    const red = g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 8));
    expect(outsideView(red, true)).toBe(red);
  });
});

describe("a side that breaks has lost", () => {
  it("though it still has forces on the map", () => {
    const { g, blue } = battle();
    expect(sideDefeated(g, "BLUE")).toBe(false);
    blue.routing = true;
    expect(sideDefeated(g, "BLUE")).toBe(true);
  });
});

describe("morale in words", () => {
  const who = (id: string) => ({ B: "כיתה", HQ: 'חפ"ק' })[id] ?? id;

  it("tells a force's own side who broke, who stood, who was rallied", () => {
    expect(moraleReportHe({ unitId: "B", kind: "broke", soldiers: 2 }, who, true)).toBe("כיתה: 2 לוחמים נשברו");
    expect(moraleReportHe({ unitId: "B", kind: "heroic", soldiers: 1 }, who, true)).toContain("בגבורה");
    expect(moraleReportHe({ unitId: "B", kind: "rallied", soldiers: 1, rallierId: "HQ" }, who, true)).toBe(
      'כיתה: לוחם אחד חזר ללחימה (ארגון מחדש בידי חפ"ק)',
    );
    expect(moraleReportHe({ unitId: "B", kind: "rallied", soldiers: 3, rallierId: "B" }, who, true)).toBe(
      "כיתה: 3 לוחמים חזרו ללחימה",
    );
  });

  it("tells the enemy only what it can watch", () => {
    expect(moraleReportHe({ unitId: "B", kind: "broke", soldiers: 2 }, who, false)).toBeNull();
    expect(moraleReportHe({ unitId: "B", kind: "heroic" }, who, false)).toBeNull();
    expect(moraleReportHe({ unitId: "B", kind: "rallied", soldiers: 3 }, who, false)).toBeNull();
    expect(moraleReportHe({ unitId: "B", kind: "routed" }, who, false)).toBe("כיתה נראה נסוג בבהלה");
    expect(moraleReportHe({ unitId: "B", kind: "surrendered" }, who, false)).toBe("כיתה נראה נכנע");
  });

  it("words a withdrawal as one, without a task it will not carry out", () => {
    const text = describeStandingOrder(
      { gait: "run", destination: { x: 10, y: 20 }, withdraw: true, engage: { targetId: "R", weapon: "smallArms" } },
      who,
    );
    expect(text).toBe("סגת ל(10, 20) בריצה · ללא פתיחה באש");
  });

  it("words the engine's morale refusals", () => {
    for (const reason of ["routing", "surrendered", "withdrawing", "pinned"]) {
      expect(reasonHe(reason)).not.toBe(reason);
    }
  });
});

describe("the debrief tells each side what it may know of morale", () => {
  /**
   * A green, poorly motivated squad under a machine gun at 150 m, turn after
   * turn, until it breaks. Played through the ordinary API, so the recording
   * reproduces it; the seed is whichever of the first fifty ends in a rout
   * rather than in the attrition rule — the search is the point, not the seed.
   */
  function routedBattle() {
    for (let seed = 1; seed <= 50; seed++) {
      const g = new Game({ seed, morale: true, enforceC2: false });
      const blue = makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 8, "כיתה");
      blue.motivation = "poor";
      blue.experience = "green";
      g.addUnit(blue);
      g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 150 }, 8, "אויב"));
      g.beginTurn();
      for (let turn = 0; turn < 8 && !blue.routing && !blue.neutralized; turn++) {
        g.advanceToPhase("combat");
        g.fire("R", "B", { weapon: "smallArms" });
        g.advanceToPhase("initiative");
      }
      if (blue.routing) return g.toRecording();
    }
    throw new Error("no rout in fifty seeds");
  }

  it("narrates the rout to its own side in full, and to the enemy only as seen", () => {
    const recording = routedBattle();
    const names = unitNames(recording);
    const { steps } = replayWithOutcomes(recording);
    const step = steps.find(
      (s) => s.outcome.kind === "phase" && (s.outcome.morale ?? []).some((r) => r.kind === "routed"),
    )!;
    expect(step).toBeDefined();
    const blue = { isOwn: (id: string) => id === "B", mayKnow: (id: string) => id === "B", side: "BLUE" as const };
    // Even a lens that holds a contact is told only what the engine says its
    // side watched — the `seenBy` the live log reads too.
    const red = { isOwn: (id: string) => id === "R", mayKnow: () => true, side: "RED" as const };
    if (step.outcome.kind !== "phase") throw new Error("not a phase step");
    const unseen = {
      ...step.outcome,
      morale: step.outcome.morale!.map((r) => ({ ...r, seenBy: [] })),
    };
    expect(step.outcome.morale!.find((r) => r.kind === "routed")!.seenBy).toEqual(["RED"]);
    expect(describeOutcome(step.outcome, names, blue)).toContain("כיתה נשבר");
    expect(describeOutcome(unseen, names, red)).not.toContain("כיתה");
    const seen = describeOutcome(step.outcome, names, red);
    expect(seen).toContain("כיתה נראה נסוג בבהלה");
    // …and never how many of its men broke.
    expect(seen).not.toContain("נשברו");
  });
});

describe("ruling 5: a side with no fighting forces left has lost", () => {
  it("whatever command groups survive, with or without morale", () => {
    for (const morale of [false, true]) {
      const g = new Game({ seed: 4, morale });
      const squad = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 8));
      g.addUnit(makeCommandGroup("B-HQ", "BLUE", "platoon", { x: 0, y: -100 }));
      g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 300 }, 8));
      expect(sideDefeated(g, "BLUE")).toBe(false);
      squad.neutralized = true;
      expect(sideDefeated(g, "BLUE")).toBe(true);
    }
  });

  it("a side fielding only a command group is judged on it", () => {
    const g = new Game({ seed: 4 });
    const hq = g.addUnit(makeCommandGroup("B-HQ", "BLUE", "platoon", { x: 0, y: 0 }));
    expect(sideDefeated(g, "BLUE")).toBe(false);
    hq.neutralized = true;
    expect(sideDefeated(g, "BLUE")).toBe(true);
  });
});
