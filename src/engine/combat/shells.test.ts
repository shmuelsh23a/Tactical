import { describe, it, expect } from "vitest";
import { Rng } from "../rng.js";
import { makeInfantry, makeVehicle } from "../units.js";
import { Game } from "../game.js";
import { distance } from "../geometry.js";
import { resolveCepDispersion } from "./artillery.js";
import { resolveBlast } from "./explosives.js";
import { shellFactor } from "./indirectFire.js";
import { SHELL_VS_MEN } from "../data/explosives.js";
import { DEFAULT_ROUNDS_FOR_EFFECT, INDIRECT_ACCURACY, MAX_ADJUSTING_ROUNDS, cepAfter } from "../data/artillery.js";
import type { GameOptions } from "../game.js";
import { replayGame, sealRecording, verifyRecording } from "../recording.js";
import { makeCommandGroup } from "../units.js";

// A battalion commander on both sides, so the mortar and artillery these tests
// fire are theirs to call (rules decision 37).
const BATTALIONS = { RED: "battalion", BLUE: "battalion" } as const;

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

describe("accuracy by CEP (decision 32)", () => {
  it("puts half the rounds within the CEP", () => {
    const rng = new Rng(11);
    const n = 20000;
    let inside = 0;
    for (let i = 0; i < n; i++) {
      if (resolveCepDispersion(rng, { x: 0, y: 0 }, 15, { firingFrom: { x: 0, y: -3000 } }).missDistance <= 15) inside++;
    }
    expect(inside / n).toBeCloseTo(0.5, 1);
  });

  it("halves with each observed adjustment down to the weapon's best, and is the best on the mark", () => {
    const mortar = INDIRECT_ACCURACY.mortar!;
    expect([0, 1, 2, 3].map((n) => cepAfter(mortar, n, false))).toEqual([100, 50, 25, 25]);
    expect(cepAfter(mortar, 0, true)).toBe(25);
    const artillery = INDIRECT_ACCURACY.artillery!;
    expect([0, 1, 2, 3].map((n) => cepAfter(artillery, n, false))).toEqual([270, 135, 67.5, 50]);
  });
});

describe("a mission in play (decisions 30–34)", () => {
  /**
   * A game standing at the targeting phase: a RED squad at the origin, a BLUE
   * squad `blueAt` metres north of it — near enough to watch the fall of shot
   * unless it is put beyond the observing range.
   */
  function setUp(opts: Partial<GameOptions> = {}, blueAt = 1500) {
    const g = new Game({ commandEchelon: BATTALIONS, seed: 4, enforceC2: false, ...opts });
    g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 8));
    g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: blueAt }, 8));
    g.beginTurn();
    g.advanceToPhase("targeting");
    return { g, red: g.getUnit("R") };
  }
  const nextTurn = (g: Game) => {
    g.advanceToPhase("summary");
    g.advanceToPhase("initiative");
    g.advanceToPhase("targeting");
  };
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1]!;

  it("lands every round of a mission, and the men go to ground after it", () => {
    const { g, red } = setUp();
    g.queueIndirectFire("mortar", "BLUE", { x: 0, y: 0 }, { rounds: 3 });
    nextTurn(g);
    expect(red.downUnderShelling).toBeUndefined();
    const { resolved } = g.advanceToPhase("resolvePriorArty");
    expect(resolved).toHaveLength(3);
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

  it("everything landing in one turn finds the men as they were, whatever the order", () => {
    const { g, red } = setUp();
    for (const x of [-20, 0, 20]) g.queueIndirectFire("mortar", "BLUE", { x, y: 0 }, { rounds: 3 });
    nextTurn(g);
    const { resolved } = g.advanceToPhase("resolvePriorArty");
    expect(resolved).toHaveLength(9);
    for (const r of resolved!) {
      const t = r.blast.targets.find((x) => x.unitId === "R");
      if (t) expect([0.5, 0.25]).toContain(t.blastChance);
    }
    expect(red.downUnderShelling).toBe(true);
  });

  it("fire nobody sees teaches nothing: it stays at first-round accuracy (decision 33)", () => {
    const { g } = setUp({}, 5000);
    const misses: number[] = [];
    for (let turn = 0; turn < 5; turn++) {
      g.queueIndirectFire("mortar", "BLUE", { x: 0, y: 0 }, { rounds: 100 });
      const { resolved } = g.advanceToPhase("resolvePriorArty");
      if (turn > 1) misses.push(...resolved!.map((r) => r.dispersion.missDistance));
      nextTurn(g);
    }
    expect(median(misses)).toBeGreaterThan(80);
    expect(g.isOnTheMark("BLUE", "mortar", { x: 0, y: 0 })).toBe(false);
  });

  it("seen fire walks onto the mark, and then fires at the weapon's best", () => {
    const { g } = setUp();
    let turns = 0;
    while (!g.isOnTheMark("BLUE", "mortar", { x: 0, y: 0 }) && turns < 20) {
      g.queueIndirectFire("mortar", "BLUE", { x: 0, y: 0 });
      g.advanceToPhase("resolvePriorArty");
      nextTurn(g);
      turns++;
    }
    expect(g.isOnTheMark("BLUE", "mortar", { x: 0, y: 0 })).toBe(true);
    expect(g.isOnTheMark("BLUE", "mortar", { x: 80, y: 0 })).toBe(true);
    expect(g.isOnTheMark("BLUE", "mortar", { x: 200, y: 0 })).toBe(false);
    expect(g.isOnTheMark("RED", "mortar", { x: 0, y: 0 })).toBe(false);
    g.queueIndirectFire("mortar", "BLUE", { x: 0, y: 0 }, { rounds: 100 });
    g.advanceToPhase("resolvePriorArty");
    nextTurn(g);
    const { resolved } = g.advanceToPhase("resolvePriorArty");
    expect(median(resolved!.slice(-100).map((r) => r.dispersion.missDistance))).toBeLessThan(32);
  });

  it("being on the mark does not follow the aim beyond reach of a registered point", () => {
    // Nobody sees the fall of shot, so no mark is earned: only the registration counts.
    const { g } = setUp({ registeredTargets: [{ side: "BLUE", weapon: "mortar", at: { x: 0, y: 0 } }] }, 5000);
    for (let turn = 1; turn <= 4; turn++) {
      g.queueIndirectFire("mortar", "BLUE", { x: 80 * turn, y: 0 });
      g.advanceToPhase("resolvePriorArty");
      nextTurn(g);
    }
    expect(g.isOnTheMark("BLUE", "mortar", { x: 80, y: 0 })).toBe(true);
    expect(g.isOnTheMark("BLUE", "mortar", { x: 160, y: 0 })).toBe(false);
    expect(g.isOnTheMark("BLUE", "mortar", { x: 320, y: 0 })).toBe(false);
  });

  it("refuses what it cannot read", () => {
    const { g } = setUp();
    expect(() => g.queueIndirectFire("mortar", "BLUE", { x: 0, y: 0 }, { fuze: "proximity" as never })).toThrow(/fuze/);
    expect(() => g.queueIndirectFire("mortar", "BLUE", { x: 0, y: 0 }, { rounds: 1e9 })).toThrow(/rounds/);
    expect(() => new Game({ commandEchelon: BATTALIONS, seed: 1, registeredTargets: [{ side: "BLUE", weapon: "nope", at: { x: 0, y: 0 } }] })).toThrow(/registered/);
    expect(() => new Game({ commandEchelon: BATTALIONS, seed: 1, fireSupport: { BLUE: [{ weapon: "mortar", missions: 2, roundsForEffect: 0 }] } })).toThrow(/fireSupport/);
  });

  it("a position prepared in full cover has a roof against an air burst", () => {
    const { g } = setUp();
    const red = g.getUnit("R");
    red.baseCover = "full";
    red.cover = "full";
    g.queueIndirectFire("artillery", "BLUE", { x: 0, y: 0 }, { rounds: 20, fuze: "airburst" });
    for (let i = 0; i < 2; i++) nextTurn(g);
    const { resolved } = g.advanceToPhase("resolvePriorArty");
    const onRed = resolved!.flatMap((r) => r.blast.targets.filter((x) => x.unitId === "R"));
    expect(onRed.length).toBeGreaterThan(0);
    for (const t of onRed) expect(t.blastChance).toBeLessThanOrEqual(0.7 * SHELL_VS_MEN.airburst.roof + 1e-9);
  });
});

describe("fire missions (decision 34)", () => {
  function setUp(opts: Partial<GameOptions> = {}, blueAt = 1500) {
    const g = new Game({ commandEchelon: BATTALIONS, seed: 7, enforceC2: false, ...opts });
    g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 8));
    g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: blueAt }, 8));
    g.beginTurn();
    g.advanceToPhase("targeting");
    return g;
  }
  /** Play `turns` turns, collecting every round that lands. */
  function play(g: Game, turns: number) {
    const landed: { turn: number; rounds: number }[] = [];
    for (let t = 0; t < turns; t++) {
      const { resolved } = g.advanceToPhase("resolvePriorArty");
      if (resolved!.length) landed.push({ turn: g.turn, rounds: resolved!.length });
      g.advanceToPhase("summary");
      g.advanceToPhase("initiative");
      g.advanceToPhase("targeting");
    }
    return landed;
  }

  it("adjusts with one round a turn, then fires its rounds for effect once, and is done", () => {
    const g = setUp();
    expect(g.callForFire("BLUE", "mortar", { x: 0, y: 0 }).roundsForEffect).toBe(DEFAULT_ROUNDS_FOR_EFFECT.mortar);
    const landed = play(g, 12);
    const m = g.fireMissions[0]!;
    expect(m.status).toBe("done");
    expect(m.adjustingRounds).toBeGreaterThan(0);
    expect(m.adjustingRounds).toBeLessThanOrEqual(MAX_ADJUSTING_ROUNDS);
    // Single rounds, then one volley of six, then nothing.
    const sizes = landed.map((l) => l.rounds);
    expect(sizes.filter((n) => n === 1).length).toBe(m.adjustingRounds);
    expect(sizes.filter((n) => n === DEFAULT_ROUNDS_FOR_EFFECT.mortar).length).toBe(1);
    expect(sizes.at(-1)).toBe(DEFAULT_ROUNDS_FOR_EFFECT.mortar);
    // It waits to see each adjusting round land before firing the next: a
    // mortar's lands the turn after, so they are two turns apart.
    const singles = landed.filter((l) => l.rounds === 1).map((l) => l.turn);
    for (let i = 1; i < singles.length; i++) expect(singles[i]! - singles[i - 1]!).toBe(2);
  });

  it("stops at a check fire: nothing more is fired, and what was in the air does not land", () => {
    const g = setUp({ fireSupport: { BLUE: [{ weapon: "artillery", missions: 2 }] } });
    g.callForFire("BLUE", "artillery", { x: 0, y: 0 });
    g.checkFire("BLUE");
    expect(g.fireMissions[0]!.status).toBe("checked");
    expect(g.pendingFire.filter((f) => f.side === "BLUE")).toHaveLength(0);
    expect(play(g, 6)).toHaveLength(0);
    // Spent all the same.
    expect(g.fireMissionsLeft("BLUE", "artillery")).toBe(1);
  });

  it("a side on missions cannot fire outside them, and gets one allotment a weapon", () => {
    const g = setUp({ fireSupport: { BLUE: [{ weapon: "mortar", missions: 1 }] } });
    expect(() => g.queueIndirectFire("mortar", "BLUE", { x: 0, y: 0 })).toThrow(/call for fire/);
    g.queueIndirectFire("mortar", "RED", { x: 0, y: 1500 });
    expect(
      () => new Game({ commandEchelon: BATTALIONS, seed: 1, fireSupport: { BLUE: [{ weapon: "mortar", missions: 1 }, { weapon: "mortar", missions: 2 }] } }),
    ).toThrow(/one entry a weapon/);
    expect(() => new Game({ commandEchelon: BATTALIONS, seed: 1, fireSupport: { Blue: [] } as never })).toThrow(/fireSupport/);
  });

  it("a force that has surrendered or is routing watches nothing for its side", () => {
    const g = setUp();
    const blue = g.getUnit("B");
    blue.surrendered = true;
    // Nobody else of BLUE's: it goes straight to effect, unobserved.
    expect(g.callForFire("BLUE", "mortar", { x: 0, y: 0 }).status).toBe("done");
  });

  it("goes straight to effect on a registered target, or when nobody can see it", () => {
    const registered = setUp({ registeredTargets: [{ side: "BLUE", weapon: "mortar", at: { x: 0, y: 0 } }] });
    expect(registered.callForFire("BLUE", "mortar", { x: 0, y: 0 }).status).toBe("done");
    const blind = setUp({}, 5000);
    expect(blind.callForFire("BLUE", "mortar", { x: 0, y: 0 }).status).toBe("done");
  });

  it("keeps to the missions a side was assigned, and their rounds for effect", () => {
    const g = setUp({ fireSupport: { BLUE: [{ weapon: "mortar", missions: 2, roundsForEffect: 9 }] } });
    expect(g.fireMissionsLeft("BLUE", "mortar")).toBe(2);
    expect(g.fireMissionsLeft("RED", "mortar")).toBeUndefined();
    expect(g.callForFire("BLUE", "mortar", { x: 0, y: 0 }).roundsForEffect).toBe(9);
    g.callForFire("BLUE", "mortar", { x: 300, y: 0 });
    expect(g.fireMissionsLeft("BLUE", "mortar")).toBe(0);
    expect(() => g.callForFire("BLUE", "mortar", { x: 0, y: 0 })).toThrow(/no mortar fire missions left/);
    expect(() => g.callForFire("BLUE", "artillery", { x: 0, y: 0 })).toThrow(/no artillery/);
    // The side left out is not rationed.
    g.callForFire("RED", "mortar", { x: 0, y: 1500 });
  });

  it("replays bit for bit: missions, registration, allotments, air burst", () => {
    const g = setUp({
      registeredTargets: [{ side: "RED", weapon: "mortar", at: { x: 0, y: 1400 } }],
      fireSupport: { BLUE: [{ weapon: "mortar", missions: 3 }, { weapon: "artillery", missions: 1, roundsForEffect: 4 }] },
    });
    g.callForFire("BLUE", "mortar", { x: 0, y: 0 }, { fuze: "airburst" });
    g.callForFire("BLUE", "artillery", { x: 40, y: 0 });
    g.callForFire("RED", "mortar", { x: 0, y: 1450 });
    play(g, 3);
    g.callForFire("BLUE", "mortar", { x: 0, y: 30 });
    play(g, 4);
    const recording = sealRecording(g.toRecording());
    expect(verifyRecording(recording)).toMatchObject({ checked: true, ok: true });
    const again = replayGame(recording);
    expect(again.getUnit("R")).toEqual(g.getUnit("R"));
    expect(again.fireMissions).toEqual(g.fireMissions);
  });
});

describe("who may call fire (decisions 36–37)", () => {
  /** A side commanding whatever its forces on the map say, unless `opts` declares otherwise. */
  function setUp(opts: Partial<GameOptions> = {}, blueCommand?: "platoon" | "company" | "battalion") {
    const g = new Game({ seed: 7, enforceC2: false, ...opts });
    g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 8));
    g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 1500 }, 8));
    if (blueCommand) g.addUnit(makeCommandGroup("B-HQ", "BLUE", blueCommand, { x: 0, y: 1600 }, 3));
    g.beginTurn();
    g.advanceToPhase("targeting");
    return g;
  }

  it("fires 12 rounds for effect from a mortar and 6 from artillery by default", () => {
    expect(DEFAULT_ROUNDS_FOR_EFFECT).toEqual({ mortar: 12, artillery: 6 });
    const g = setUp({ commandEchelon: BATTALIONS });
    expect(g.callForFire("BLUE", "mortar", { x: 0, y: 0 }).roundsForEffect).toBe(12);
    expect(g.callForFire("BLUE", "artillery", { x: 0, y: 0 }).roundsForEffect).toBe(6);
  });

  it("writes the rounds for effect into the allotment, so a recording carries them", () => {
    const g = setUp({ commandEchelon: BATTALIONS, fireSupport: { BLUE: [{ weapon: "mortar", missions: 2 }] } });
    expect(g.toRecording().fireSupport).toEqual({ BLUE: [{ weapon: "mortar", missions: 2, roundsForEffect: 12 }] });
  });

  it("lets a company call mortars and not artillery, and a battalion both", () => {
    const company = setUp({}, "company");
    expect(company.commandEchelonOf("BLUE")).toBe("company");
    expect(company.mayCall("BLUE", "mortar")).toBe(true);
    expect(company.mayCall("BLUE", "artillery")).toBe(false);
    expect(() => company.callForFire("BLUE", "artillery", { x: 0, y: 0 })).toThrow(/battalion and above/);
    expect(() => company.queueIndirectFire("artillery", "BLUE", { x: 0, y: 0 })).toThrow(/battalion and above/);
    company.callForFire("BLUE", "mortar", { x: 0, y: 0 });
    const battalion = setUp({}, "battalion");
    expect(battalion.mayCall("BLUE", "artillery")).toBe(true);
  });

  it("gives a platoon or a squad no indirect fire at all, smoke from the tubes included", () => {
    const platoon = setUp({}, "platoon");
    expect(platoon.mayCall("BLUE", "mortar")).toBe(false);
    expect(() => platoon.callForFire("BLUE", "mortar", { x: 0, y: 0 })).toThrow(/company and above/);
    expect(() => platoon.queueIndirectFire("mortar", "BLUE", { x: 0, y: 0 })).toThrow(/company and above/);
    expect(() => platoon.deploySmoke("mortar", "BLUE", { x: 0, y: 0 })).toThrow(/company and above/);
    // A smoke grenade is the squad's own.
    platoon.deploySmoke("grenade", "BLUE", { x: 0, y: 1400 });
    expect(setUp().commandEchelonOf("RED")).toBe("squad");
  });

  it("reads a declared echelon over the forces on the map", () => {
    const g = setUp({ commandEchelon: { BLUE: "company" } }, "platoon");
    expect(g.commandEchelonOf("BLUE")).toBe("company");
    expect(g.mayCall("BLUE", "mortar")).toBe(true);
  });

  it("refuses an allotment or a registered target a declared echelon may not call", () => {
    expect(
      () => new Game({ seed: 1, commandEchelon: { BLUE: "company" }, fireSupport: { BLUE: [{ weapon: "artillery", missions: 1 }] } }),
    ).toThrow(/battalion and above/);
    expect(
      () => new Game({ seed: 1, commandEchelon: { BLUE: "platoon" }, registeredTargets: [{ side: "BLUE", weapon: "mortar", at: { x: 0, y: 0 } }] }),
    ).toThrow(/company and above/);
    expect(() => new Game({ seed: 1, commandEchelon: { BLUE: "general" as never } })).toThrow(/commandEchelon/);
  });

  it("journals the rounds for effect, and replays a recording made before decision 36 at the 6 it fired", () => {
    const g = setUp({ fireSupportByEchelon: false }, "platoon");
    g.callForFire("BLUE", "mortar", { x: 0, y: 0 });
    const recording = g.toRecording();
    const call = recording.actions.find((a) => a.kind === "callForFire");
    expect(call?.kind === "callForFire" && call.opts.roundsForEffect).toBe(12);
    // As a recording from before the decision has it: no number anywhere.
    if (call?.kind === "callForFire") delete call.opts.roundsForEffect;
    expect(replayGame(recording).fireMissions[0]!.roundsForEffect).toBe(6);

    // Made between decision 36 and the journalling of the number: the rule's
    // flag is in the header, so it fired the weapon's default, 12.
    const between = setUp({}, "company");
    between.callForFire("BLUE", "mortar", { x: 0, y: 0 });
    const mid = between.toRecording();
    for (const a of mid.actions) if (a.kind === "callForFire") delete a.opts.roundsForEffect;
    expect(replayGame(mid).fireMissions[0]!.roundsForEffect).toBe(12);

    const rationed = setUp({ fireSupportByEchelon: false, fireSupport: { BLUE: [{ weapon: "mortar", missions: 1 }] } }, "platoon");
    rationed.callForFire("BLUE", "mortar", { x: 0, y: 0 });
    const old = rationed.toRecording();
    delete old.fireSupport!.BLUE![0]!.roundsForEffect;
    for (const a of old.actions) if (a.kind === "callForFire") delete a.opts.roundsForEffect;
    expect(replayGame(old).fireMissions[0]!.roundsForEffect).toBe(6);
  });

  it("takes a player's rounds for effect from the allotment or the weapon, never from the call", () => {
    const g = setUp({ commandEchelon: BATTALIONS });
    const m = g.callForFire("BLUE", "mortar", { x: 0, y: 0 }, { roundsForEffect: 100 } as never);
    expect(m.roundsForEffect).toBe(12);
    expect(() => g.callForFire("BLUE", "constructor", { x: 0, y: 0 })).toThrow(/indirect-fire/);
  });

  it("checks the fire plan before the first upkeep, so a refusal leaves the game untouched", () => {
    const g = new Game({ seed: 1, fireSupport: { BLUE: [{ weapon: "mortar", missions: 2 }] } });
    g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 8));
    expect(() => g.advancePhase()).toThrow(/company and above/);
    expect(g.getUnit("B").stationaryTurns).toBe(0);
    expect(g.turn).toBe(0);
  });

  it("refuses an undeclared side's fire plan when the first turn begins, once its forces say what it commands", () => {
    const g = new Game({ seed: 1, fireSupport: { BLUE: [{ weapon: "mortar", missions: 2 }] } });
    g.addUnit(makeCommandGroup("B-HQ", "BLUE", "platoon", { x: 0, y: 0 }, 3));
    expect(() => g.beginTurn()).toThrow(/company and above/);
    const h = new Game({ seed: 1, registeredTargets: [{ side: "BLUE", weapon: "artillery", at: { x: 0, y: 0 } }] });
    h.addUnit(makeCommandGroup("B-HQ", "BLUE", "company", { x: 0, y: 0 }, 3));
    expect(() => h.beginTurn()).toThrow(/battalion and above/);
    expect(() => new Game({ seed: 1, commandEchelon: { BLUE: "toString" as never } })).toThrow(/commandEchelon/);
  });

  it("is recorded, and a recording made before the rule still replays the fire it called", () => {
    const g = setUp({ commandEchelon: { BLUE: "company" } }, "company");
    g.callForFire("BLUE", "mortar", { x: 0, y: 0 });
    const recording = g.toRecording();
    expect(recording.fireSupportByEchelon).toBe(true);
    expect(recording.commandEchelon).toEqual({ BLUE: "company" });
    expect(replayGame(recording).fireMissions).toEqual(g.fireMissions);

    const before = setUp({ fireSupportByEchelon: false }, "platoon");
    before.queueIndirectFire("mortar", "BLUE", { x: 0, y: 0 });
    const old = before.toRecording();
    expect(old.fireSupportByEchelon).toBeUndefined();
    expect(replayGame(old).pendingFire).toEqual(before.pendingFire);
  });
});
