import { describe, expect, it } from "vitest";
import { Game, type GameOptions } from "./game.js";
import { makeInfantry } from "./units.js";
import { resolveDirectFire } from "./combat/directFire.js";
import { Rng } from "./rng.js";
import { replayGame, sealRecording, verifyRecording } from "./recording.js";
import { VARIANT_FIGURES } from "./data/variants.js";

/**
 * Rule variants on trial for rulings 1–3 (data/variants.ts), and ruling 4.
 * Each variant is pinned to the arithmetic it was described with, so the
 * balance harness is measuring what the author was asked about.
 */

/** Two squads 150 m apart in the fire phase; BLUE walked this turn. */
function contact(variants: GameOptions["variants"], ran = false) {
  const g = new Game({ seed: 3, enforceC2: false, variants });
  const blue = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 8));
  const red = g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 150 }, 8));
  g.beginTurn();
  g.advanceToPhase("movement");
  g.moveUnit(blue.id, { x: 0, y: ran ? -80 : -40 }, ran ? "run" : "normal");
  g.advanceToPhase("combat");
  return { g, blue, red };
}

describe("ruling 2: the movement table's modifier in ordinary fire", () => {
  it("is not read without a variant — the rule as it stood", () => {
    const { g, blue, red } = contact(undefined);
    // 190 m: the 20% band, untouched by the walk.
    expect(g.fire(red.id, blue.id, { weapon: "smallArms" }).hitChance).toBeCloseTo(0.2, 10);
  });

  it("2b adds +30% against a walker, and holds a runner at the floor rather than zero", () => {
    expect(contact({ movementModifier: "additiveFloor" }).g.fire("R", "B", { weapon: "smallArms" }).hitChance).toBeCloseTo(0.5, 10);
    const run = contact({ movementModifier: "additiveFloor" }, true);
    // 230 m, 20% band, -20% running: 0% as written, the floor instead.
    expect(run.g.fire("R", "B", { weapon: "smallArms" }).hitChance).toBeCloseTo(VARIANT_FIGURES.movementFloor, 10);
  });

  it("2c multiplies instead: ×1.3 walking, ×0.8 running", () => {
    expect(contact({ movementModifier: "proportional" }).g.fire("R", "B", { weapon: "smallArms" }).hitChance).toBeCloseTo(0.26, 10);
    expect(contact({ movementModifier: "proportional" }, true).g.fire("R", "B", { weapon: "smallArms" }).hitChance).toBeCloseTo(0.16, 10);
  });

  it("applies the floor before cover, and only when asked", () => {
    const a = makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 1);
    const t = makeInfantry("T", "RED", "squad", { x: 0, y: 150 }, 1);
    const shot = (extra: object) => resolveDirectFire(new Rng(1), a, t, { weapon: "smallArms", cover: "full", ...extra });
    expect(shot({}).hitChance).toBeCloseTo(0.1, 10);
    expect(shot({ targetMovementModifier: -0.2, hitFloor: 0.05 }).hitChance).toBeCloseTo(0.025, 10);
  });
});

describe("ruling 3: what firing costs a force in full cover", () => {
  /** RED in full cover, 150 m off; BLUE shoots at it after RED has fired (or not). */
  function dugIn(variants: GameOptions["variants"], redFiresFirst: boolean) {
    const g = new Game({ seed: 5, enforceC2: false, variants });
    const blue = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 8));
    const red = makeInfantry("R", "RED", "squad", { x: 0, y: 150 }, 8);
    red.baseCover = "full";
    g.addUnit(red);
    g.beginTurn();
    g.advanceToPhase("combat");
    if (redFiresFirst) g.fire(red.id, blue.id, { weapon: "smallArms" });
    return { g, blue, red };
  }

  it("as it stands: firing drops full to partial for the turn (−10%)", () => {
    const { g } = dugIn(undefined, true);
    expect(g.fire("B", "R", { weapon: "smallArms" }).hitChance).toBeCloseTo(0.18, 10);
  });

  it("3b: firing from full cover keeps −30%", () => {
    const { g } = dugIn({ firingFromCover: "worthMore" }, true);
    expect(g.fire("B", "R", { weapon: "smallArms" }).hitChance).toBeCloseTo(0.14, 10);
    // A force that has not fired is in full cover as ever.
    expect(dugIn({ firingFromCover: "worthMore" }, false).g.fire("B", "R", { weapon: "smallArms" }).hitChance).toBeCloseTo(0.1, 10);
  });

  it("3a: firing costs nothing this turn, and the whole of the next", () => {
    const { g } = dugIn({ firingFromCover: "previousTurn" }, true);
    expect(g.fire("B", "R", { weapon: "smallArms" }).hitChance).toBeCloseTo(0.1, 10);
    g.advanceToPhase("summary");
    g.advanceToPhase("combat");
    // Fired last turn: partial all of this one, before it has done anything.
    expect(g.fire("B", "R", { weapon: "smallArms" }).hitChance).toBeCloseTo(0.18, 10);
    g.advanceToPhase("summary");
    g.advanceToPhase("combat");
    // A quiet turn in between restores it.
    expect(g.fire("B", "R", { weapon: "smallArms" }).hitChance).toBeCloseTo(0.1, 10);
  });
});

describe("ruling 1: the defender fires back in an assault", () => {
  function assault(variants: GameOptions["variants"]) {
    const g = new Game({ seed: 8, enforceC2: false, variants });
    g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 9));
    g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 20 }, 4));
    g.beginTurn();
    g.advanceToPhase("combat");
    return g.assault("B", "R", 0);
  }

  it("does not, as it stands", () => {
    expect(assault(undefined).reply).toBeUndefined();
  });

  it("1a: at the assault's 70%, with every man it had", () => {
    expect(assault({ assaultReply: "simultaneous" }).reply).toMatchObject({ chance: 0.7, shooters: 4 });
  });

  it("1b: at its ordinary chance for the range — 30% inside 100 m", () => {
    expect(assault({ assaultReply: "closeFire" }).reply).toMatchObject({ chance: 0.3, shooters: 4 });
  });
});

describe("variants are recorded", () => {
  it("and a game played under them replays exactly", () => {
    const { g } = contact({ movementModifier: "additiveFloor", firingFromCover: "previousTurn", assaultReply: "closeFire" });
    g.fire("R", "B", { weapon: "smallArms" });
    g.advanceToPhase("summary");
    g.advanceToPhase("combat");
    g.fire("B", "R", { weapon: "smallArms" });
    const recording = sealRecording(g.toRecording());
    expect(recording.variants).toEqual({ movementModifier: "additiveFloor", firingFromCover: "previousTurn", assaultReply: "closeFire" });
    expect(verifyRecording(recording)).toMatchObject({ checked: true, ok: true });
    expect(replayGame(recording).rng.getState()).toBe(g.rng.getState());
  });

  it("and a game without them records nothing new", () => {
    expect(new Game({ seed: 1 }).toRecording().variants).toBeUndefined();
  });
});

describe("ruling 4: initiative ties are rolled again", () => {
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
