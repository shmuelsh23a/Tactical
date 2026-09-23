import { describe, expect, it } from "vitest";
import {
  BATTLE_KINDS,
  CONFIGURATIONS,
  ECHELONS,
  FIRE_PLAN,
  MARKDOWN_HEADER,
  WOUND_CONFIGURATIONS,
  judge,
  markdownRow,
  runBattle,
  runCell,
} from "./balance.js";

/**
 * The balance harness is a tool, but a tool the suite keeps honest: a few
 * battles of every kind, so that an engine change which breaks the script
 * fails here rather than the next time somebody wants a number.
 */
describe("the balance harness", () => {
  it("plays every kind of battle at every echelon to an end, with and without morale", () => {
    for (const kind of BATTLE_KINDS) {
      for (const echelon of ECHELONS) {
        for (const morale of [true, false]) {
          const cell = runCell(echelon, kind, { morale, battles: 2 });
          expect(cell.battles).toBe(2);
          expect(cell.wins.RED + cell.wins.BLUE + cell.wins.draw).toBe(2);
          expect(markdownRow(cell).split("|").length).toBe(MARKDOWN_HEADER.split("\n")[0]!.split("|").length);
        }
      }
    }
  });

  it("is reproducible from its seed", () => {
    expect(runBattle(1234, "platoon", "meeting", { morale: true })).toEqual(
      runBattle(1234, "platoon", "meeting", { morale: true }),
    );
  });

  it("gives the same battle whichever side starts where, in a mirror", () => {
    // The mirror is symmetric, so swapping the start positions only swaps the
    // labels: the winner's *position* must be the same.
    const a = runBattle(77, "squad", "meeting", { morale: true });
    const b = runBattle(77, "squad", "meeting", { morale: true, swap: true });
    expect(b.turns).toBe(a.turns);
  });
});

describe("the sweep over what is still open", () => {
  it("covers every reply rate on trial, each distinct", () => {
    expect(CONFIGURATIONS).toHaveLength(4);
    expect(new Set(CONFIGURATIONS.map((c) => JSON.stringify(c.variants))).size).toBe(4);
  });

  it("judges a configuration on the four targets", () => {
    const v = judge("squad", CONFIGURATIONS[2]!.variants, 2);
    expect(v.met).toBeGreaterThanOrEqual(0);
    expect(v.met).toBeLessThanOrEqual(4);
  });
});

describe("the fire plan, and what put the men out", () => {
  it("brings the attacker's shells down on the objective, and counts who they put out", () => {
    const quiet = runBattle(1000, "platoon", "attack3", { morale: true });
    expect(quiet.outBy.explosive).toBe(0);
    const shelled = [1000, 1001, 1002].map((seed) => runBattle(seed, "platoon", "attack3", { morale: true, fires: FIRE_PLAN }));
    expect(shelled.some((r) => r.outBy.explosive > 0)).toBe(true);
    for (const r of shelled) expect(r.outBy.explosive + r.outBy.smallArms).toBeLessThanOrEqual(r.down.RED + r.down.BLUE);
  });

  it("sweeps each wound model on trial, each distinct", () => {
    expect(new Set(WOUND_CONFIGURATIONS.map((c) => JSON.stringify(c.variants))).size).toBe(WOUND_CONFIGURATIONS.length);
  });
});
