import { describe, it, expect } from "vitest";
import { Game } from "./game.js";
import { Rng } from "./rng.js";
import { makeInfantry } from "./units.js";
import { replayGame } from "./recording.js";
import { detectionChance, observeFromPosition } from "./combat/detection.js";
import { STILL_DETECTION, stillDetectionFalloff } from "./data/concealment.js";

/**
 * Rules decision 53: a force in position may find a still enemy beyond the
 * document's 20 m — out to 300 m, 600 m for an observation post — at its
 * chance inside 20 m, falling off in a straight line to the edge.
 */

describe("the falloff", () => {
  it("is whole inside the document's 20 m, nothing at the edge, a straight line between", () => {
    expect(stillDetectionFalloff(10, 300)).toBe(1);
    expect(stillDetectionFalloff(20, 300)).toBe(1);
    expect(stillDetectionFalloff(160, 300)).toBeCloseTo(0.5);
    expect(stillDetectionFalloff(300, 300)).toBe(0);
    expect(stillDetectionFalloff(310, 600)).toBeCloseTo(0.5);
  });
});

/** How often a watching BLUE squad picks up a still RED squad `range` metres off, over many rolls. */
function rate(range: number, stillDetection: boolean, post = false, trials = 4000) {
  const rng = new Rng(17);
  const blue = makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 9);
  const red = makeInfantry("R", "RED", "squad", { x: 0, y: range }, 9);
  if (post) blue.observationPost = true;
  let found = 0;
  for (let i = 0; i < trials; i++) {
    if (observeFromPosition(rng, [blue, red], () => true, stillDetection).some((o) => o.observerId === "B")) found++;
  }
  return { rate: found / trials, full: detectionChance(blue, red).chance };
}

describe("a force in position watching for a still enemy", () => {
  it("never finds it past 20 m without the rule", () => {
    expect(rate(100, false).rate).toBe(0);
  });

  it("finds it out to 300 m with the rule, at its chance scaled by the falloff", () => {
    for (const range of [20, 100, 160, 250]) {
      const { rate: r, full } = rate(range, true);
      expect(r).toBeCloseTo(full * stillDetectionFalloff(range, STILL_DETECTION.rangeM), 1);
    }
    expect(rate(310, true).rate).toBe(0);
  });

  it("reaches 600 m from an observation post", () => {
    const { rate: r, full } = rate(400, true, true);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeCloseTo(full * stillDetectionFalloff(400, STILL_DETECTION.postRangeM), 1);
    expect(rate(400, true, false).rate).toBe(0);
  });

  it("finds a mover as before: the rule is about a still target", () => {
    const moving = (still: boolean) => {
      const rng = new Rng(5);
      const blue = makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 9);
      const red = makeInfantry("R", "RED", "squad", { x: 0, y: 200 }, 9);
      red.movedThisTurn = 40;
      let found = 0;
      for (let i = 0; i < 500; i++) if (observeFromPosition(rng, [blue, red], () => true, still).length) found++;
      return found;
    };
    expect(moving(true)).toBe(moving(false));
  });
});

describe("in the game", () => {
  /** A BLUE squad watching a still RED squad 150 m off, turn after turn. */
  function watch(stillDetection: boolean, turns = 10) {
    const g = new Game({ seed: 9, trackIntel: true, enforceC2: false, stillDetection });
    g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 9));
    g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 150 }, 9));
    g.beginTurn();
    for (let t = 0; t < turns && !g.knows("BLUE", "R"); t++) {
      g.advanceToPhase("combat");
      g.advanceToPhase("initiative");
    }
    return g;
  }

  it("puts a still enemy 150 m off on the map of a side that watches for it", () => {
    expect(watch(false).knows("BLUE", "R")).toBe(false);
    // Seed 9 finds it inside ten turns (about 25% a turn at 150 m in the open).
    expect(watch(true).knows("BLUE", "R")).toBe(true);
  });

  it("needs the knowledge model", () => {
    expect(() => new Game({ seed: 1, stillDetection: true })).toThrow(/trackIntel/);
  });

  it("replays out of a recording, and reads one made before it as without", () => {
    const g = watch(true);
    const recording = g.toRecording();
    expect(recording.stillDetection).toBe(true);
    const replayed = replayGame(recording);
    expect(replayed.stillDetection).toBe(true);
    expect(replayed.contactsFor("BLUE")).toEqual(g.contactsFor("BLUE"));
    expect(replayed.rng.getState()).toBe(g.rng.getState());

    delete (recording as { stillDetection?: boolean }).stillDetection;
    expect(replayGame(recording).stillDetection).toBe(false);
  });
});
