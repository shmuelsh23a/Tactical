import { describe, it, expect } from "vitest";
import { Rng } from "../rng.js";
import { makeInfantry, makeVehicle } from "../units.js";
import { Game } from "../game.js";
import { distance } from "../geometry.js";
import { resolveCepDispersion } from "./artillery.js";
import { resolveBlast } from "./explosives.js";
import { shellFactor } from "./indirectFire.js";
import { SHELL_VS_MEN } from "../data/explosives.js";
import { replayGame, sealRecording, verifyRecording } from "../recording.js";

// Rules decisions 29–31: what a shell does to men, by posture, cover and fuze.

describe("a shell against men (decisions 29–31)", () => {
  const squad = (cover: "none" | "partial" | "full", down = false) => {
    const u = makeInfantry("S", "RED", "squad", { x: 0, y: 0 }, 8);
    u.cover = cover;
    if (down) u.downUnderShelling = true;
    return u;
  };

  it("the first rounds find men on their feet; later ones find them down", () => {
    expect(shellFactor(squad("none"), "impact", false)).toBe(1);
    expect(shellFactor(squad("none", true), "impact", false)).toBe(SHELL_VS_MEN.impact.down);
  });

  it("partial cover is the lower of its own worth and the men's posture", () => {
    expect(shellFactor(squad("partial"), "impact", false)).toBe(0.5);
    expect(shellFactor(squad("partial", true), "impact", false)).toBe(0.36);
  });

  it("full cover is a roof or a hole, and an air burst finds the hole", () => {
    expect(shellFactor(squad("full"), "impact", false)).toBe(0.125);
    expect(shellFactor(squad("full"), "airburst", false)).toBe(SHELL_VS_MEN.airburst.openHole);
    expect(shellFactor(squad("full"), "airburst", true)).toBe(0.125);
  });

  it("an air burst's chance is capped at certainty", () => {
    const r = resolveBlast(new Rng(1), "artillery", { x: 0, y: 0 }, [squad("none")], 0, {
      factorFor: () => SHELL_VS_MEN.airburst.standing,
      airburst: true,
    });
    expect(r.targets[0]!.blastChance).toBeCloseTo(Math.min(1, 0.7 * 1.28));
  });

  it("an air burst never reaches a vehicle's tracks", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const tank = makeVehicle("T", "RED", { x: 0, y: 0 });
      resolveBlast(new Rng(seed), "artillery", { x: 0, y: 0 }, [tank], 0, { factorFor: () => 1, airburst: true });
      expect(tank.vehicle!.componentDamage.track).toBe(0);
    }
  });
});

describe("accuracy by CEP, on trial", () => {
  it("puts half the rounds within the CEP", () => {
    const rng = new Rng(11);
    const n = 20000;
    let inside = 0;
    for (let i = 0; i < n; i++) {
      if (resolveCepDispersion(rng, { x: 0, y: 0 }, 15, { firingFrom: { x: 0, y: -3000 } }).missDistance <= 15) inside++;
    }
    expect(inside / n).toBeCloseTo(0.5, 1);
  });
});

describe("a mission in play (decisions 30–31)", () => {
  /** A game standing at the targeting phase, a RED squad at the origin. */
  function setUp(variants = {}) {
    const g = new Game({ seed: 4, enforceC2: false, variants });
    const red = makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 8);
    const blue = makeInfantry("B", "BLUE", "squad", { x: 0, y: 2000 }, 8);
    g.addUnit(red);
    g.addUnit(blue);
    g.beginTurn();
    g.advanceToPhase("targeting");
    return { g, red: g.getUnit("R") };
  }
  const nextTurn = (g: Game) => {
    g.advanceToPhase("summary");
    g.advanceToPhase("initiative");
    g.advanceToPhase("targeting");
  };

  it("lands every round of a mission, and the men go to ground after it", () => {
    const { g, red } = setUp();
    g.queueIndirectFire("mortar", "BLUE", { x: 0, y: 0 }, { rounds: 3 });
    nextTurn(g);
    expect(red.downUnderShelling).toBeUndefined();
    const { resolved } = g.advanceToPhase("resolvePriorArty");
    expect(resolved).toHaveLength(3);
    // All three were resolved against men on their feet.
    for (const r of resolved!) {
      const t = r.blast.targets.find((x) => x.unitId === "R");
      if (t) expect(t.blastChance).toBeGreaterThanOrEqual(0.25);
    }
    expect(red.downUnderShelling).toBe(true);
  });

  it("men who get up and move are on their feet again; men who stay are still down", () => {
    const { g, red } = setUp();
    const blue = g.getUnit("B");
    red.downUnderShelling = true;
    blue.downUnderShelling = true;
    g.advanceToPhase("movement");
    g.moveUnit("R", { x: 20, y: 0 });
    g.advanceToPhase("summary");
    g.advanceToPhase("initiative");
    expect(red.downUnderShelling).toBeUndefined();
    expect(blue.downUnderShelling).toBe(true);
  });

  it("a mission records its rounds and fuze only when they are not the default", () => {
    const { g } = setUp();
    const plain = g.queueIndirectFire("mortar", "BLUE", { x: 0, y: 0 });
    expect("rounds" in plain || "fuze" in plain).toBe(false);
    const full = g.queueIndirectFire("mortar", "BLUE", { x: 0, y: 0 }, { rounds: 4, fuze: "airburst" });
    expect(full.rounds).toBe(4);
    expect(full.fuze).toBe("airburst");
  });

  it("under the accuracy variant, fire walked onto the same point tightens to the cap", () => {
    const { g } = setUp({ cepDispersion: { mortar: { firstM: 100, capM: 25 } } });
    // A mission queued each turn lands the next: turns 2, 3, 4, 5.
    const misses: number[][] = [];
    for (let turn = 0; turn < 5; turn++) {
      g.queueIndirectFire("mortar", "BLUE", { x: 0, y: 0 }, { rounds: 100 });
      const { resolved } = g.advanceToPhase("resolvePriorArty");
      if (turn > 0) misses.push(resolved!.map((r) => distance(r.dispersion.impact, { x: 0, y: 0 })));
      nextTurn(g);
    }
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1]!;
    // CEP 100, 50, 25, then held at the cap.
    expect(median(misses[0]!)).toBeGreaterThan(80);
    expect(median(misses[1]!)).toBeGreaterThan(38);
    expect(median(misses[1]!)).toBeLessThan(62);
    expect(median(misses[2]!)).toBeLessThan(32);
    expect(median(misses[3]!)).toBeLessThan(32);
  });

  it("everything landing in one turn finds the men as they were, whatever the order", () => {
    const { g, red } = setUp();
    // Three tubes, three missions, the same turn.
    for (const x of [-20, 0, 20]) g.queueIndirectFire("mortar", "BLUE", { x, y: 0 }, { rounds: 3 });
    nextTurn(g);
    const { resolved } = g.advanceToPhase("resolvePriorArty");
    expect(resolved).toHaveLength(9);
    for (const r of resolved!) {
      const t = r.blast.targets.find((x) => x.unitId === "R");
      // On their feet for every bomb: the band's own chance, never × down.
      if (t) expect([0.5, 0.25]).toContain(t.blastChance);
    }
    expect(red.downUnderShelling).toBe(true);
  });

  it("tubes aimed side by side each adjust onto their own point", () => {
    const { g } = setUp({ cepDispersion: { mortar: { firstM: 100, capM: 25 } } });
    const misses: number[][] = [];
    for (let turn = 0; turn < 3; turn++) {
      for (const x of [-80, 0, 80]) g.queueIndirectFire("mortar", "BLUE", { x, y: 0 }, { rounds: 100 });
      const { resolved } = g.advanceToPhase("resolvePriorArty");
      if (turn > 0) {
        misses.push(resolved!.map((r, i) => distance(r.dispersion.impact, { x: [-80, 0, 80][Math.floor(i / 100)]!, y: 0 })));
      }
      nextTurn(g);
    }
    // The second volley: every tube at CEP 50, the -80 tube included.
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1]!;
    for (let tube = 0; tube < 3; tube++) {
      const second = misses[1]!.slice(tube * 100, tube * 100 + 100);
      expect(median(second)).toBeLessThan(65);
    }
  });

  it("refuses a fuze it does not know, and a mission with no end of rounds", () => {
    const { g } = setUp();
    expect(() => g.queueIndirectFire("mortar", "BLUE", { x: 0, y: 0 }, { fuze: "proximity" as never })).toThrow(/fuze/);
    expect(() => g.queueIndirectFire("mortar", "BLUE", { x: 0, y: 0 }, { rounds: 1e9 })).toThrow(/rounds/);
    expect(() => new Game({ seed: 1, variants: { cepDispersion: { mortar: { firstM: 10, capM: 25 } } } })).toThrow(/capM/);
  });

  it("replays bit for bit: missions of several rounds, air burst, accuracy by CEP", () => {
    const { g } = setUp({ cepDispersion: { mortar: { firstM: 100, capM: 25 }, artillery: { firstM: 15, capM: 15 } } });
    for (let turn = 0; turn < 4; turn++) {
      g.queueIndirectFire("mortar", "BLUE", { x: 0, y: 0 }, { rounds: 3, fuze: turn % 2 ? "airburst" : "impact" });
      g.queueIndirectFire("artillery", "BLUE", { x: 40, y: 0 }, { rounds: 4 });
      nextTurn(g);
    }
    const recording = sealRecording(g.toRecording());
    expect(verifyRecording(recording)).toMatchObject({ checked: true, ok: true });
    expect(replayGame(recording).getUnit("R")).toEqual(g.getUnit("R"));
  });
});
