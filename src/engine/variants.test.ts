import { describe, expect, it } from "vitest";
import { Game, type GameOptions } from "./game.js";
import { makeInfantry } from "./units.js";
import { replayGame, sealRecording, verifyRecording } from "./recording.js";
import { FIRING_FROM_COVER_MODIFIER } from "./data/directFire.js";

/**
 * The rulings of 2026-09-23 (decisions 20, 22 and 23) and what is still on
 * trial (data/variants.ts): the defender's reply in an assault.
 */

/** Two squads in the fire phase; BLUE moved this turn (walked 40 m, or ran 80). */
function contact(ran = false, variants?: GameOptions["variants"]) {
  const g = new Game({ seed: 3, enforceC2: false, ...(variants ? { variants } : {}) });
  const blue = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 8));
  const red = g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 150 }, 8));
  g.beginTurn();
  g.advanceToPhase("movement");
  g.moveUnit(blue.id, { x: 0, y: ran ? -80 : -40 }, ran ? "run" : "normal");
  g.advanceToPhase("combat");
  return { g, blue, red };
}

describe("decision 22: every direct shot reads the target's movement, proportionally", () => {
  it("×1.3 against a walker", () => {
    // 190 m: the 20% band.
    expect(contact().g.fire("R", "B", { weapon: "smallArms" }).hitChance).toBeCloseTo(0.26, 10);
  });

  it("×0.8 against a runner — who can still be hit beyond 100 m", () => {
    // 230 m: the 20% band. Added, it would have been 0%.
    expect(contact(true).g.fire("R", "B", { weapon: "smallArms" }).hitChance).toBeCloseTo(0.16, 10);
  });

  it("nothing against a force that stood", () => {
    const { g } = contact();
    expect(g.fire("B", "R", { weapon: "smallArms" }).hitChance).toBeCloseTo(0.2, 10);
  });
});

describe("decision 23: firing from full cover keeps −30%", () => {
  function dugIn(redFiresFirst: boolean) {
    const g = new Game({ seed: 5, enforceC2: false });
    const blue = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 8));
    const red = makeInfantry("R", "RED", "squad", { x: 0, y: 150 }, 8);
    red.baseCover = "full";
    g.addUnit(red);
    g.beginTurn();
    g.advanceToPhase("combat");
    if (redFiresFirst) g.fire(red.id, blue.id, { weapon: "smallArms" });
    return g;
  }

  it("a force that has not fired is in full cover (−50%)", () => {
    expect(dugIn(false).fire("B", "R", { weapon: "smallArms" }).hitChance).toBeCloseTo(0.1, 10);
  });

  it("one that fired from it this turn keeps −30%, not partial cover's −10%", () => {
    expect(dugIn(true).fire("B", "R", { weapon: "smallArms" }).hitChance).toBeCloseTo(0.2 * (1 + FIRING_FROM_COVER_MODIFIER), 10);
  });

  it("genuine partial cover stays at the table's −10%", () => {
    const g = new Game({ seed: 5, enforceC2: false });
    g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 8));
    const red = makeInfantry("R", "RED", "squad", { x: 0, y: 150 }, 8);
    red.baseCover = "partial";
    g.addUnit(red);
    g.beginTurn();
    g.advanceToPhase("combat");
    g.fire("R", "B", { weapon: "smallArms" });
    expect(g.fire("B", "R", { weapon: "smallArms" }).hitChance).toBeCloseTo(0.18, 10);
  });
});

describe("ruling 1, on trial: the defender fires back in an assault", () => {
  function assault(variants?: GameOptions["variants"]) {
    const g = new Game({ seed: 8, enforceC2: false, ...(variants ? { variants } : {}) });
    g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 9));
    g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 20 }, 4));
    g.beginTurn();
    g.advanceToPhase("combat");
    return g.assault("B", "R", 0);
  }

  it("does not, without the variant", () => {
    expect(assault().reply).toBeUndefined();
  });

  it("does, at the rate on trial, with every man it had before the assault landed", () => {
    expect(assault({ assaultReplyChance: 0.5 }).reply).toMatchObject({ chance: 0.5, shooters: 4 });
  });
});

describe("variants are recorded", () => {
  it("and a game played under them replays exactly", () => {
    const { g } = contact(false, { assaultReplyChance: 0.4, preparedTestBonus: 20 });
    g.fire("R", "B", { weapon: "smallArms" });
    const recording = sealRecording(g.toRecording());
    expect(recording.variants).toEqual({ assaultReplyChance: 0.4, preparedTestBonus: 20 });
    expect(verifyRecording(recording)).toMatchObject({ checked: true, ok: true });
    expect(replayGame(recording).rng.getState()).toBe(g.rng.getState());
  });

  it("and a game without them records nothing new", () => {
    expect(new Game({ seed: 1 }).toRecording().variants).toBeUndefined();
  });
});

describe("decision 20: initiative ties are rolled again", () => {
  it("a 5–5 tie is rerolled, and the reroll decides", () => {
    const g = new Game({ seed: 1 });
    const script = [5, 5, 3, 7];
    g.rng.int = () => script.shift()!;
    expect(g.rollInitiative()).toEqual(["BLUE", "RED"]);
    expect(script).toHaveLength(0);
  });

  it("gives neither side the first move more often than the other", () => {
    let redFirst = 0;
    for (let seed = 1; seed <= 2000; seed++) if (new Game({ seed }).rollInitiative()[0] === "RED") redFirst++;
    // Fair: 1000 ± a few standard deviations (sd ≈ 22). The old tie-break gave ~1100.
    expect(Math.abs(redFirst - 1000)).toBeLessThan(80);
  });
});
