import { describe, it, expect } from "vitest";
import { Game, type GameOptions } from "./game.js";
import { makeInfantry, landHit } from "./units.js";
import { replayGame } from "./recording.js";
import { FLAT_GROUND } from "./terrain.js";
import { Rng } from "./rng.js";
import { generateMorale, shooterAccuracy } from "./morale.js";
import { detectionChance } from "./combat/detection.js";
import { shellFactor } from "./combat/indirectFire.js";
import { SHELL_VS_MEN } from "./data/explosives.js";
import { FATIGUE, FATIGUE_EFFECT } from "./data/traits.js";
import {
  eyesFactor,
  fatigueLevel,
  firingOrder,
  quickToCover,
  rushFactor,
  tracePace,
  traitFactor,
  traitScale,
  updateFatigue,
} from "./traits.js";
import type { Traits, Unit } from "./types.js";

/**
 * Rules decisions 69, 71 and 72: what the traits do beyond morale — pace, aim,
 * eyes, luck, getting down and getting away — fatigue by strength, and who
 * fires first.
 */

const AVERAGE: Traits = { strength: 5, intelligence: 5, wisdom: 5, agility: 5, charisma: 5, luck: 5 };

/** A squad whose men carry the given traits, man by man (the last entry for the rest). */
function squad(id: string, side: "RED" | "BLUE", at: { x: number; y: number }, men: Partial<Traits>[], size = 4): Unit {
  const u = makeInfantry(id, side, "squad", at, size);
  u.soldiers!.forEach((s, i) => (s.traits = { ...AVERAGE, ...(men[i] ?? men.at(-1) ?? {}) }));
  return u;
}

/** The same, dressed as a game with morale and the given rules would dress it, off the board. */
function dressed(men: Partial<Traits>[], rules: Unit["traitRules"] = { effects: true, fatigue: true }): Unit {
  const u = squad("S", "BLUE", { x: 0, y: 0 }, men);
  generateMorale(u, 1);
  for (const s of u.soldiers!) s.morale = { will: 80, ceiling: 80, state: "steady", timesRallied: 0 };
  u.traitRules = rules;
  return u;
}

const game = (opts: Partial<GameOptions> = {}) =>
  new Game({ seed: 1, morale: true, enforceC2: false, terrain: FLAT_GROUND, ...opts });

describe("the switches (decisions 69, 71, 72)", () => {
  it("are on for a new game, and off for a recording made before them", () => {
    const g = game();
    expect([g.traitEffects, g.fatigue, g.agilityFireOrder]).toEqual([true, true, true]);
    const recording = g.toRecording();
    const replayed = replayGame(recording);
    expect([replayed.traitEffects, replayed.fatigue, replayed.agilityFireOrder]).toEqual([true, true, true]);
    for (const k of ["traitEffects", "fatigue", "agilityFireOrder"] as const) delete recording[k];
    const old = replayGame(recording);
    expect([old.traitEffects, old.fatigue, old.agilityFireOrder]).toEqual([false, false, false]);
  });

  it("reach a force's men only when the game is played with morale, which draws the traits", () => {
    expect(game().addUnit(makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 4)).traitRules).toEqual({ effects: true, fatigue: true });
    expect(game({ morale: false }).addUnit(makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 4)).traitRules).toBeUndefined();
    expect(game({ fatigue: false }).addUnit(makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 4)).traitRules).toEqual({ effects: true });
    // A force brought in carrying rules the game does not play loses them.
    const carried = makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 4);
    carried.traitRules = { effects: true };
    expect(game({ traitEffects: false, fatigue: false }).addUnit(carried).traitRules).toBeUndefined();
  });
});

describe("a trait's worth (decision 69)", () => {
  it("is ±20% at the ends, nothing at the mean, linear between", () => {
    expect(traitFactor(1)).toBeCloseTo(0.8, 9);
    expect(traitFactor(10)).toBeCloseTo(1.2, 9);
    expect(traitScale(5.5)).toBe(0);
    expect(traitFactor(7.75)).toBeCloseTo(1.1, 9);
    expect(traitFactor(undefined)).toBe(1);
  });
});

describe("pace: a force rushes at its slowest man's (decisions 69, 82)", () => {
  it("on a rush, agility and strength set each man's pace, and the slowest man the force's", () => {
    const u = dressed([{ agility: 1, strength: 10 }, { agility: 10, strength: 10 }]);
    expect(tracePace(u, "run")).toBeCloseTo(0.8 * 1.2, 9);
    // …and he no longer holds it back once he is down.
    u.soldiers![0]!.neutralized = true;
    expect(tracePace(u, "run")).toBeCloseTo(1.2 * 1.2, 9);
  });

  it("walking is the gait's own (author, 2026-10-03)", () => {
    expect(tracePace(dressed([{ agility: 1, strength: 1 }]), "normal")).toBe(1);
  });

  it("is the gait's own without the switch", () => {
    expect(tracePace(dressed([{ agility: 1, strength: 1 }], {}), "run")).toBe(1);
  });

  it("is the budget the engine offers the player's move ring", () => {
    const g = game();
    const slow = g.addUnit(squad("B", "BLUE", { x: 0, y: 0 }, [{ agility: 1, strength: 10 }, { agility: 10, strength: 10 }]));
    g.beginTurn();
    g.advanceToPhase("movement");
    expect(g.moveBudget(slow.id, "run")).toBeCloseTo(96, 9);
    expect(g.moveBudget(slow.id, "normal")).toBe(50);
    g.moveUnit(slow.id, { x: 0, y: 20 });
    expect(g.moveBudget(slow.id, "normal")).toBeCloseTo(30, 9);
  });

  it("caps a rush in play", () => {
    const g = game();
    const slow = g.addUnit(squad("B", "BLUE", { x: 0, y: 0 }, [{ agility: 1, strength: 10 }, { agility: 10, strength: 10 }]));
    g.beginTurn();
    g.advanceToPhase("movement");
    expect(() => g.moveUnit(slow.id, { x: 0, y: 100 }, "run")).toThrow("exceeds remaining");
    g.moveUnit(slow.id, { x: 0, y: 95 }, "run"); // 100 m × 0.96
    expect(slow.position.y).toBe(95);
  });
});

describe("aim, eyes, a rush and a shell (decision 69)", () => {
  it("intelligence sets each man's aim", () => {
    const u = dressed([{ intelligence: 10 }, { intelligence: 1 }], { effects: true });
    expect(shooterAccuracy(u).slice(0, 2).map((a) => +a.toFixed(9))).toEqual([1.2, 0.8]);
    u.traitRules = undefined;
    expect(shooterAccuracy(u).slice(0, 2)).toEqual([1, 1]);
  });

  it("wisdom spots: the force's best observer's", () => {
    const watcher = dressed([{ wisdom: 10 }, { wisdom: 1 }], { effects: true });
    const target = squad("R", "RED", { x: 0, y: 100 }, [{}]);
    expect(eyesFactor(watcher)).toBeCloseTo(1.2, 9);
    const sharp = detectionChance(watcher, target, "normal").chance;
    watcher.traitRules = undefined;
    const plain = detectionChance(watcher, target, "normal").chance;
    expect(sharp).toBeLessThan(1);
    expect(sharp / plain).toBeCloseTo(1.2, 9);
  });

  it("agility makes a force that ran harder to hit, on its men's mean", () => {
    const u = dressed([{ agility: 10 }], { effects: true });
    expect(rushFactor(u)).toBe(1); // it did not run
    u.ranThisTurn = true;
    expect(rushFactor(u)).toBeCloseTo(0.8, 9);
  });

  it("agility gets men down quicker under shelling, and does nothing once they are down", () => {
    const u = dressed([{ agility: 10 }], { effects: true });
    const f = SHELL_VS_MEN.impact;
    expect(quickToCover(u)).toBeCloseTo(0.2, 9);
    expect(shellFactor(u, "impact", false)).toBeCloseTo(f.standing + (f.down - f.standing) * 0.2, 9);
    u.downUnderShelling = true;
    expect(shellFactor(u, "impact", false)).toBe(f.down);
  });
});

describe("luck on a hit (decision 69)", () => {
  /** One hit on a man of the given luck, the severity draw `u` scripted. */
  function hitWith(u: number, luck: number) {
    const target = dressed([{ luck }], { effects: true });
    target.soldiers!.splice(1);
    const rng = new Rng(1);
    const script = [u, 0]; // the severity draw, then the choice of victim
    rng.next = () => script.shift()!;
    const hit = landHit(rng, target, 1);
    return { hit, man: target.soldiers![0]!, script };
  }

  it("turns a hit away from the luckiest man a fifth of the time, and never from an unlucky one", () => {
    expect(hitWith(0.19, 10).hit).toEqual({ damage: 0, casualty: false, missed: true });
    expect(hitWith(0.19, 10).man.wound).toBeUndefined();
    expect(hitWith(0.21, 10).man.wound).toBe("light");
    expect(hitWith(0.01, 1).man.wound).toBe("light");
  });

  it("shifts the kill band a fifth of itself either way", () => {
    // Average: killed from 0.8 (the d10's 9 and 10).
    expect(hitWith(0.83, 10).man.wound).toBe("serious"); // lucky: from 0.84
    expect(hitWith(0.85, 10).man.wound).toBe("killed");
    expect(hitWith(0.77, 1).man.wound).toBe("killed"); // unlucky: from 0.76
    expect(hitWith(0.75, 1).man.wound).toBe("serious");
  });

  it("is no hit on him at all: a shot turned away is not counted, and does not mark the force hit", () => {
    const g = game({ lethality: "document" });
    const shooter = g.addUnit(squad("R", "RED", { x: 0, y: 0 }, [{}], 1));
    const lucky = g.addUnit(squad("B", "BLUE", { x: 0, y: 50 }, [{ luck: 10 }], 1));
    g.beginTurn();
    g.advanceToPhase("combat");
    // Every draw lands low: the shot hits, and his luck turns it away.
    g.rng.next = () => 0.01;
    const r = g.fire(shooter.id, lucky.id, { weapon: "smallArms" });
    expect(r.fired).toBe(true);
    expect(r.hits).toBe(0);
    expect(lucky.hitThisTurn).toBeFalsy();
    expect(lucky.soldiers![0]!.wound).toBeUndefined();
  });

  it("draws no more than the d10 did", () => {
    expect(hitWith(0.19, 10).script).toHaveLength(0);
    expect(hitWith(0.5, 1).script).toHaveLength(0);
  });
});

describe("fatigue, by strength (decision 71)", () => {
  it("rises with a run, a climb and fire, and falls on a quiet turn", () => {
    const u = dressed([{}]);
    u.ranThisTurn = true;
    u.underFire = true;
    updateFatigue(u, 20);
    expect(u.soldiers![0]!.fatigue).toBeCloseTo(FATIGUE.run + FATIGUE.underFire + 20 * FATIGUE.perClimbM, 9);
    u.ranThisTurn = false;
    u.underFire = false;
    updateFatigue(u, 0);
    updateFatigue(u, 0);
    expect(u.soldiers![0]!.fatigue).toBeUndefined();
  });

  it("tells sooner on a weak man than a strong one", () => {
    const u = dressed([{ strength: 1 }, { strength: 10 }]);
    for (const s of u.soldiers!) s.fatigue = 2 * FATIGUE.run;
    // Two runs: 6 — over a weak man's 4.8, under a strong man's 7.2.
    expect(u.soldiers!.slice(0, 2).map(fatigueLevel)).toEqual(["tired", "fresh"]);
    for (const s of u.soldiers!) s.fatigue = FATIGUE.max;
    expect(u.soldiers!.slice(0, 2).map(fatigueLevel)).toEqual(["exhausted", "exhausted"]);
  });

  it("slows a tired man, and his force with him, and spoils his aim", () => {
    const u = dressed([{ strength: 1 }, {}]);
    u.soldiers![0]!.fatigue = 2 * FATIGUE.run;
    // At any gait: walking, too.
    expect(tracePace(u, "normal")).toBeCloseTo(FATIGUE_EFFECT.tired.pace, 9);
    expect(shooterAccuracy(u)[0]).toBeCloseTo(traitFactor(5) * FATIGUE_EFFECT.tired.accuracy, 9);
    u.traitRules = { effects: true };
    expect(tracePace(u, "normal")).toBe(1);
  });

  it("is counted at the end of the turn in play", () => {
    const g = game();
    const runner = g.addUnit(squad("B", "BLUE", { x: 0, y: 0 }, [{ agility: 10, strength: 10 }]));
    g.beginTurn();
    g.advanceToPhase("movement");
    g.moveUnit(runner.id, { x: 0, y: 100 }, "run");
    g.advanceToPhase("summary");
    g.advanceToPhase("initiative");
    expect(runner.soldiers!.map((s) => s.fatigue)).toEqual([3, 3, 3, 3]);
    // A quiet turn rests them.
    g.advanceToPhase("summary");
    g.advanceToPhase("initiative");
    expect(runner.soldiers!.every((s) => s.fatigue === undefined)).toBe(true);
  });
});

describe("who fires first (decision 72)", () => {
  it("still forces first, then the more agile, then the order they were added", () => {
    const a = squad("A", "BLUE", { x: 0, y: 0 }, [{ agility: 3 }]);
    const b = squad("B", "BLUE", { x: 0, y: 0 }, [{ agility: 9 }]);
    const c = squad("C", "BLUE", { x: 0, y: 0 }, [{ agility: 9 }]);
    const d = squad("D", "BLUE", { x: 0, y: 0 }, [{ agility: 10 }]);
    d.movedThisTurn = 30;
    expect(firingOrder([a, b, c, d]).map((u) => u.id)).toEqual(["B", "C", "A", "D"]);
  });

  it("is the order the engine fires a side's forces under their orders", () => {
    const fired: string[] = [];
    const g = game();
    g.addUnit(squad("A", "BLUE", { x: 0, y: 0 }, [{ agility: 2 }]));
    g.addUnit(squad("B", "BLUE", { x: 50, y: 0 }, [{ agility: 9 }]));
    const red = g.addUnit(squad("R", "RED", { x: 0, y: 150 }, [{}]));
    for (const id of ["A", "B"]) g.setStandingOrder(id, { gait: "normal", engage: { targetId: red.id, weapon: "smallArms" } });
    const fire = g.fire.bind(g);
    g.fire = (attackerId, targetId, opts) => {
      fired.push(attackerId);
      return fire(attackerId, targetId, opts);
    };
    g.beginTurn();
    g.advanceToPhase("combat");
    g.executeStandingOrders("BLUE");
    expect(fired).toEqual(["B", "A"]);
  });

  it("is the order of play under orders, and the order added without the switch", () => {
    for (const on of [true, false]) {
      const g = game({ agilityFireOrder: on });
      g.addUnit(squad("A", "BLUE", { x: 0, y: 0 }, [{ agility: 2 }]));
      g.addUnit(squad("B", "BLUE", { x: 50, y: 0 }, [{ agility: 9 }]));
      expect(g.firingOrder("BLUE").map((u) => u.id)).toEqual(on ? ["B", "A"] : ["A", "B"]);
    }
  });
});

describe("a battle with the traits acting", () => {
  it("replays as it was played", () => {
    const g = game({ seed: 7 });
    const blue = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 8));
    const red = g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 650 }, 8));
    g.setStandingOrder(blue.id, { gait: "run", destination: { x: 0, y: 600 } });
    g.beginTurn();
    for (let turn = 0; turn < 4; turn++) {
      g.advanceToPhase("movement"); // through the last turn's end, upkeep and all
      g.executeStandingOrders("BLUE");
      g.advanceToPhase("combat");
      g.fire(red.id, blue.id, { weapon: "smallArms" });
      g.fire(blue.id, red.id, { weapon: "smallArms" });
      g.advanceToPhase("summary");
    }
    const replayed = replayGame(g.toRecording());
    expect(replayed.units.map((u) => u.soldiers)).toEqual(g.units.map((u) => u.soldiers));
    expect(blue.soldiers!.some((s) => s.fatigue)).toBe(true);
  });
});
