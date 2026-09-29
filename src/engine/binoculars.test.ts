import { describe, it, expect } from "vitest";
import { Game, type GameOptions } from "./game.js";
import { Rng } from "./rng.js";
import { makeInfantry } from "./units.js";
import { replayGame } from "./recording.js";
import { detectionChance, lookingThroughBinoculars, observeFromPosition, stillReach } from "./combat/detection.js";
import { STILL_DETECTION } from "./data/concealment.js";
import { OBSERVATION_POST_RANGE_M } from "./data/planning.js";
import { BEST_VISUAL_FIX_SIGMA_M } from "./data/locationError.js";

/**
 * Rules decision 54: scouts carry binoculars — a halted scout watches as an
 * observation post does — and a longer look sharpens a report.
 */

function scout() {
  const u = makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 9);
  u.scouting = true;
  return u;
}

describe("binoculars", () => {
  it("are a halted scout's: not a squad's, and not while it moves or fires", () => {
    const s = scout();
    expect(lookingThroughBinoculars(s, true)).toBe(true);
    expect(lookingThroughBinoculars(s, false)).toBe(false);
    s.movedThisTurn = 50;
    expect(lookingThroughBinoculars(s, true)).toBe(false);
    s.movedThisTurn = 0;
    s.firedThisTurn = true;
    expect(lookingThroughBinoculars(s, true)).toBe(false);
    expect(lookingThroughBinoculars(makeInfantry("C", "BLUE", "squad", { x: 0, y: 0 }, 9), true)).toBe(false);
  });

  it("give a halted scout an observation post's reach, still and moving", () => {
    const s = scout();
    const mover = makeInfantry("R", "RED", "squad", { x: 0, y: 800 }, 9);
    mover.movedThisTurn = 50;
    expect(detectionChance(s, mover, undefined, true).range).toBe(OBSERVATION_POST_RANGE_M);
    expect(detectionChance(s, mover, undefined, false).range).toBe(300);
    expect(stillReach(s, true)).toBe(STILL_DETECTION.postRangeM);
    expect(stillReach(s, false)).toBe(STILL_DETECTION.rangeM);
  });

  it("find a still enemy 450 m off, where the eye does not reach", () => {
    const found = (binoculars: boolean) => {
      const rng = new Rng(3);
      const s = scout();
      const red = makeInfantry("R", "RED", "squad", { x: 0, y: 450 }, 9);
      let n = 0;
      for (let i = 0; i < 2000; i++) if (observeFromPosition(rng, [s, red], () => true, true, binoculars).some((o) => o.observerId === "B")) n++;
      return n;
    };
    expect(found(false)).toBe(0);
    expect(found(true)).toBeGreaterThan(0);
  });
});

/** A halted BLUE scout watching a still RED squad `range` metres off, for `turns` turns. */
function watch(opts: Partial<GameOptions>, range = 250, turns = 12) {
  const g = new Game({ seed: 21, trackIntel: true, enforceC2: false, locationError: true, stillDetection: true, ...opts });
  const s = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 9));
  g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: range }, 9));
  g.beginTurn();
  g.setScouting(s.id, true);
  const spreads: (number | undefined)[] = [];
  for (let t = 0; t < turns; t++) {
    g.advanceToPhase("combat");
    spreads.push(g.reportSpread("BLUE", "R"));
    g.advanceToPhase("initiative");
  }
  return { g, spreads };
}

describe("a report from binoculars", () => {
  it("is half the eye's range error", () => {
    const first = (binoculars: boolean) => watch({ binoculars, keepEyesOn: false }, 150, 30).spreads.find((x) => x !== undefined)!;
    // 150 m: the eye's 30 m along the line, the post's 15 m (5 m across, and the spread is their mean square).
    expect(first(false)).toBeCloseTo(Math.sqrt((30 ** 2 + 5 ** 2) / 2), 0);
    expect(first(true)).toBeCloseTo(Math.sqrt((15 ** 2 + 5 ** 2) / 2), 0);
  });
});

describe("a longer look", () => {
  it("keeps a still enemy on the map and sharpens it, down to what an eye, map and compass can do", () => {
    // 500 m through binoculars: a first look of 35 m, sharper than CAT IV's best only by looking.
    const { spreads } = watch({ binoculars: true, keepEyesOn: true }, 500, 30);
    const from = spreads.findIndex((x) => x !== undefined);
    expect(from).toBeGreaterThanOrEqual(0);
    const kept = spreads.slice(from) as number[];
    expect(kept.every((x) => x !== undefined)).toBe(true);
    expect(kept[0]!).toBeGreaterThan(BEST_VISUAL_FIX_SIGMA_M);
    expect(kept[1]!).toBeLessThan(kept[0]!);
    // …and no further than the floor, however long it is watched.
    expect(kept.at(-1)!).toBeCloseTo(BEST_VISUAL_FIX_SIGMA_M, 5);
    expect(Math.min(...kept)).toBeCloseTo(BEST_VISUAL_FIX_SIGMA_M, 5);
  });

  it("does not coarsen a close look: a report already better than the floor stands", () => {
    const { spreads } = watch({ binoculars: true, keepEyesOn: true }, 150, 30);
    const kept = spreads.filter((x): x is number => x !== undefined);
    expect(kept[0]!).toBeLessThan(BEST_VISUAL_FIX_SIGMA_M);
    expect(kept.every((x) => x === kept[0])).toBe(true);
  });

  it("without it, a still enemy is found again only by luck, and lost after three turns without", () => {
    const { g } = watch({ binoculars: true, keepEyesOn: false }, 500, 30);
    const kept = watch({ binoculars: true, keepEyesOn: true }, 500, 30).g;
    expect(kept.knows("BLUE", "R")).toBe(true);
    expect(kept.reportSpread("BLUE", "R")!).toBeLessThan(g.reportSpread("BLUE", "R") ?? Infinity);
  });

  it("starts afresh when the enemy moves", () => {
    const { g } = watch({ binoculars: true, keepEyesOn: true }, 500, 30);
    const sharp = g.reportSpread("BLUE", "R")!;
    g.advanceToPhase("movement");
    g.moveUnit("R", { x: 0, y: 490 }, "normal");
    g.advanceToPhase("combat");
    // Seed 21: the scout picks the mover up again this turn (through binoculars it sees movers to 1,000 m).
    expect(g.contactFor("BLUE", "R")!.lastSeenTurn).toBe(g.turn);
    // A fresh report, not combined with the old fix.
    expect(g.reportSpread("BLUE", "R")!).toBeGreaterThan(sharp);
  });

  it("replays out of a recording, and reads one made before it as without", () => {
    const { g } = watch({ binoculars: true, keepEyesOn: true });
    const recording = g.toRecording();
    expect(recording).toMatchObject({ binoculars: true, keepEyesOn: true });
    const replayed = replayGame(recording);
    expect(replayed.contactsFor("BLUE")).toEqual(g.contactsFor("BLUE"));
    expect(replayed.reportSpread("BLUE", "R")).toBe(g.reportSpread("BLUE", "R"));
    delete (recording as { binoculars?: boolean }).binoculars;
    delete (recording as { keepEyesOn?: boolean }).keepEyesOn;
    const old = replayGame(recording);
    expect(old.binoculars).toBe(false);
    expect(old.keepEyesOn).toBe(false);
  });

  it("needs the knowledge model", () => {
    expect(() => new Game({ seed: 1, binoculars: true })).toThrow(/trackIntel/);
    expect(() => new Game({ seed: 1, keepEyesOn: true })).toThrow(/trackIntel/);
  });
});
