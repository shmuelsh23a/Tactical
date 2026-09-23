import { describe, expect, it } from "vitest";
import { Game, type GameOptions } from "./game.js";
import { landHit, makeInfantry, makeVehicle, woundHit } from "./units.js";
import type { WoundModel } from "./data/variants.js";
import { NOT_A_COAXIAL_WEAPON } from "./combat/directFire.js";
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

describe("decision 25: ירי מקביל is a vehicle's coaxial gun", () => {
  function field() {
    const g = new Game({ seed: 2, enforceC2: false });
    const squad = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 8));
    const tank = g.addUnit(makeVehicle("T", "BLUE", { x: 20, y: 0 }));
    g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 250 }, 8));
    g.beginTurn();
    g.advanceToPhase("combat");
    return { g, squad, tank };
  }

  it("infantry cannot fire it — their table is נק\"ל\\מקלעים", () => {
    const { g, squad } = field();
    expect(g.fire(squad.id, "R", { weapon: "sustainedMg" })).toMatchObject({ fired: false, reason: NOT_A_COAXIAL_WEAPON });
    expect(() => g.setCovering(squad.id, true, "sustainedMg")).toThrow(NOT_A_COAXIAL_WEAPON);
  });

  it("a vehicle fires it: one gun, its gunner, at the 70 / 50 / 20 table", () => {
    const { g, tank } = field();
    const burst = g.fire(tank.id, "R", { weapon: "sustainedMg" });
    expect(burst).toMatchObject({ fired: true, shooters: 1 });
    expect(burst.hitChance).toBeCloseTo(0.7, 10);
  });

  it("falls silent when the gunner is down", () => {
    const { g, tank } = field();
    tank.vehicle!.crew.find((c) => c.role === "gunner")!.neutralized = true;
    expect(g.fire(tank.id, "R", { weapon: "sustainedMg" })).toMatchObject({ fired: false, reason: "no fit shooters" });
  });

  it("is what a vehicle covers with", () => {
    const { g, tank } = field();
    expect(() => g.setCovering(tank.id, true, "smallArms")).toThrow(NOT_A_COAXIAL_WEAPON);
    g.setCovering(tank.id, true, "sustainedMg");
    expect(tank.covering?.weapon).toBe("sustainedMg");
  });
});

describe("decision 26: a small-arms hit rolls how bad it is", () => {
  /** One hit on a squad of one, with the d10 scripted. */
  function hitWith(d10: number, damageBefore = 0) {
    const g = new Game({ seed: 1, enforceC2: false });
    const target = g.addUnit(makeInfantry("T", "RED", "squad", { x: 0, y: 0 }, 1));
    target.soldiers![0]!.damagePoints = damageBefore;
    const script = [d10, 0]; // the severity die, then the choice of victim (index 0)
    g.rng.int = () => script.shift()!;
    const hit = landHit(g.rng, target, 1);
    return { hit, man: target.soldiers![0]!, script };
  }

  it("1–4: a light wound — he fights on, two points towards the document's eight", () => {
    const { hit, man } = hitWith(4);
    expect(hit).toEqual({ damage: 2, casualty: false });
    expect(man).toMatchObject({ neutralized: false, damagePoints: 2, wound: "light" });
  });

  it("…and a light wound on a man already at 6 is the one that puts him out", () => {
    const { hit, man } = hitWith(1, 6);
    expect(hit.casualty).toBe(true);
    expect(man.wound).toBe("serious");
  });

  it("5–8: a serious wound — out of the fight, and bleeding", () => {
    const { hit, man } = hitWith(8);
    expect(hit.casualty).toBe(true);
    expect(man).toMatchObject({ neutralized: true, damagePoints: 5, wound: "serious", bleedingSinceTurn: 1 });
  });

  it("9–10: killed", () => {
    const { man } = hitWith(9);
    expect(man).toMatchObject({ neutralized: true, damagePoints: 8, wound: "killed" });
  });

  it("asks the rng as many times as the document's 1d4 did", () => {
    expect(hitWith(3).script).toHaveLength(0);
  });
});

describe("on trial: one wound rule for bullets and explosives", () => {
  /** One hit on a squad of one, every die scripted, then the victim (index 0). */
  function hitWith(dice: number[], die: string | null, model?: WoundModel, damageBefore = 0) {
    const g = new Game({ seed: 1, enforceC2: false });
    const target = g.addUnit(makeInfantry("T", "RED", "squad", { x: 0, y: 0 }, 1));
    target.soldiers![0]!.damagePoints = damageBefore;
    const script = [...dice, 0];
    g.rng.int = () => script.shift()!;
    const hit = woundHit(g.rng, target, 1, die, model);
    return { hit, man: target.soldiers![0]!, script };
  }

  it("as it stands: an explosive takes its document die, out at 8", () => {
    expect(hitWith([7], "1d8").hit).toEqual({ damage: 7, casualty: false });
    const { hit, man } = hitWith([4, 4], "2d10");
    expect(hit.casualty).toBe(true);
    expect(man.outBy).toBe("explosive");
    expect(man.wound).toBeUndefined();
  });

  it("as it stands: a bullet is the severity roll, and says so", () => {
    const { man } = hitWith([9], null);
    expect(man).toMatchObject({ wound: "killed", outBy: "smallArms" });
  });

  it("A: an explosive's severity is shifted by its die — artillery's 1d10 by 3", () => {
    // 2 on the d10 is a light wound for a bullet; +3 makes it serious.
    expect(hitWith([2], null, "severity").man.wound).toBe("light");
    const { man } = hitWith([2], "1d10", "severity");
    expect(man).toMatchObject({ wound: "serious", neutralized: true, outBy: "explosive" });
    // …and 8 + 3 is capped at 10, a death.
    expect(hitWith([8], "1d10", "severity").man.wound).toBe("killed");
  });

  it("A0: the same d10 for everything", () => {
    expect(hitWith([2], "2d10", "flat").man.wound).toBe("light");
  });

  it("A refuses a die it has no shift for, rather than guess", () => {
    expect(() => hitWith([2], "3d6", "severity")).toThrow(/No severity shift/);
  });

  it("B: every hit its document die — a bullet 1d4 — and out of the fight at 5", () => {
    expect(hitWith([4], null, "dice").hit).toEqual({ damage: 4, casualty: false });
    expect(hitWith([1], null, "dice", 4).man).toMatchObject({ neutralized: true, outBy: "smallArms" });
    expect(hitWith([5], "1d8", "dice").hit.casualty).toBe(true);
  });

  it("asks the rng as the rules do: one roll of the die, then the victim", () => {
    expect(hitWith([3], null, "severity").script).toHaveLength(0);
    expect(hitWith([3, 3], "2d10", "dice").script).toHaveLength(0);
  });

  it("reaches a game's fire through its variants", () => {
    const { g } = contact(false, { woundModel: "dice" });
    expect(g.variants.woundModel).toBe("dice");
    const r = g.fire("R", "B", { weapon: "smallArms" });
    // Under B no single bullet puts a fresh man out.
    expect(r.newCasualties).toBe(0);
  });
});
