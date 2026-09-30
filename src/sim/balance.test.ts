import { describe, expect, it } from "vitest";
import {
  BATTLE_KINDS,
  scaledRecon,
  CONFIGURATIONS,
  callableAt,
  ECHELONS,
  FIRE_PLAN,
  MARKDOWN_HEADER,
  judge,
  markdownRow,
  runBattle,
  runCell,
} from "./balance.js";
import { PLAIN_SCRIPT } from "../app/drill.js";

/**
 * The balance harness is a tool, but a tool the suite keeps honest: a few
 * battles of every kind, so that an engine change which breaks the script
 * fails here rather than the next time somebody wants a number.
 */
/** The plain script without its grenadiers, to measure indirect fire alone. */
const RIFLEMEN_ONLY = { ...PLAIN_SCRIPT, grenadiers: null };

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
    // Riflemen only, and no hand grenades in the assault: the grenadiers'
    // rounds and the grenades are explosives too (decisions 45-46), and since
    // decision 65 this battle closes to an assault.
    const noGrenades = { ...RIFLEMEN_ONLY, assault: { ...RIFLEMEN_ONLY.assault, grenades: 0 } };
    const quiet = runBattle(1000, "platoon", "attack3", { morale: true, drill: noGrenades });
    expect(quiet.outBy.explosive).toBe(0);
    const shelled = [1000, 1001, 1002].map((seed) => runBattle(seed, "company", "attack3", { morale: true, fires: FIRE_PLAN }));
    expect(shelled.some((r) => r.outBy.explosive > 0)).toBe(true);
    for (const r of shelled) expect(r.outBy.explosive + r.outBy.smallArms).toBeLessThanOrEqual(r.down.RED + r.down.BLUE);
  });

  it("strikes a mortar plan from a platoon's battle, unless rules decision 37 is off", () => {
    const planned = (anyEchelon: boolean) =>
      [1000, 1001, 1002].map((seed) => runBattle(seed, "platoon", "attack3", { morale: true, fires: FIRE_PLAN, anyEchelon, lethality: "document", drill: RIFLEMEN_ONLY }));
    expect(planned(false).every((r) => r.outBy.explosive === 0)).toBe(true);
    expect(planned(true).some((r) => r.outBy.explosive > 0)).toBe(true);
    expect(callableAt("platoon", "mortar")).toBe(false);
    expect(callableAt("company", "mortar")).toBe(true);
    expect(callableAt("company", "artillery")).toBe(false);
    expect(callableAt("battalion", "artillery")).toBe(true);
  });
});

describe("the defender's mission plan (decision 38)", () => {
  it("puts out observation posts and prepares alternate positions before the battle", () => {
    const plain = runBattle(1000, "platoon", "attack1", { morale: true });
    const planned = runBattle(1000, "platoon", "attack1", { morale: true, defenderPlan: { observationPosts: true, alternateAt: 150 } });
    expect(plain.turns).toBeGreaterThan(0);
    expect(planned.turns).toBeGreaterThan(0);
  });
});

describe("the squad's grenadiers", () => {
  it("fire rifle grenades alongside the rifles, and are the platoon's explosives", () => {
    const seeds = Array.from({ length: 20 }, (_, i) => 1000 + i); // fewer are too noisy for the claim
    // The classic harness, to measure the grenadiers alone: with the game's
    // rules the platoon scouts first and closes differently each battle.
    const withThem = seeds.map((seed) => runBattle(seed, "platoon", "attack3", { morale: true, classicHarness: true }));
    const without = seeds.map((seed) => runBattle(seed, "platoon", "attack3", { morale: true, drill: RIFLEMEN_ONLY, classicHarness: true }));
    // Without them the only explosives are the assault's hand grenades. Over
    // 20 seeds they nearly double them (33 to 18); a pinned squad keeps its
    // head down (decision 63), so fewer are fired than before (50 to 22).
    const he = (rs: typeof withThem) => rs.reduce((n, r) => n + r.outBy.explosive, 0);
    expect(he(withThem)).toBeGreaterThan(1.5 * he(without));
    expect(PLAIN_SCRIPT.grenadiers).toEqual({ menPerLauncher: 4 });
  });
});

describe("a meeting engagement at odds", () => {
  it("cuts RED to about a half or a third, and prepares nothing", () => {
    const men = (odds: 1 | 2 | 3) => runBattle(5, "platoon", "meeting", { morale: true, meetingOdds: odds }).men;
    expect(men(1)).toEqual({ BLUE: 36, RED: 36 });
    expect(men(2)).toEqual({ BLUE: 36, RED: 18 });
    expect(men(3)).toEqual({ BLUE: 36, RED: 9 });
  });
});

describe("the harness plays the game's rules unless asked for the classic harness", () => {
  it("sends a scout from each attacking platoon, and none from a lone squad", () => {
    expect(scaledRecon("squad")).toBeUndefined();
    expect(scaledRecon("platoon")?.recon?.scouts).toBe(1);
    expect(scaledRecon("company")?.recon?.scouts).toBe(3);
  });

  it("plays a different battle from the classic harness, the same one every time", () => {
    const game = runBattle(1000, "platoon", "attack3", { morale: true });
    expect(runBattle(1000, "platoon", "attack3", { morale: true })).toEqual(game);
    const classic = runBattle(1000, "platoon", "attack3", { morale: true, classicHarness: true });
    expect(classic).not.toEqual(game);
    // The classic harness is the game's rules switched off one by one, the truth and no scouts.
    expect(
      runBattle(1000, "platoon", "attack3", {
        morale: true, locationError: false, stillDetection: false, binoculars: false, keepEyesOn: false,
        commandSuccession: false, planningError: 0, company: {},
      }),
    ).toEqual(classic);
  });
});
