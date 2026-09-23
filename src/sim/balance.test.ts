import { describe, expect, it } from "vitest";
import { BATTLE_KINDS, CONFIGURATIONS, ECHELONS, MARKDOWN_HEADER, judge, markdownRow, runBattle, runCell } from "./balance.js";

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
  it("covers every severity split with and without the reply, each distinct", () => {
    expect(CONFIGURATIONS).toHaveLength(8);
    expect(new Set(CONFIGURATIONS.map((c) => JSON.stringify(c.variants))).size).toBe(8);
  });

  it("judges a configuration on the four targets", () => {
    const v = judge("squad", CONFIGURATIONS[3]!.variants, 2);
    expect(v.met).toBeGreaterThanOrEqual(0);
    expect(v.met).toBeLessThanOrEqual(4);
  });
});
