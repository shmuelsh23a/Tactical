import { describe, it, expect } from "vitest";
import { Game, OUT_OF_AMMUNITION } from "./game.js";
import { makeInfantry, makeMachineGunTeam } from "./units.js";
import { replayGame } from "./recording.js";
import { stateDigest } from "./digest.js";
import { BASIC_LOAD, CONSERVE, RESUPPLY, ROUNDS_A_TURN } from "./data/ammunition.js";
import { ammunitionState, conserving, firingMen, shareOut } from "./ammunition.js";
import { InteriorFight } from "./interior/resolver.js";
import { Rng } from "./rng.js";
import { generateFloorPlan } from "./interior/floorPlan.js";
import { CLOSE_QUARTERS } from "./data/interior.js";
import type { MapObject } from "./terrain.js";
import type { Unit } from "./types.js";

/**
 * Ammunition (backlog 12, rules decision 127; the author, 2026-11-19): per
 * man, spent at the sustained rate, conserved below half the load, shared
 * out on a quiet turn, refilled from caches and bearers, and drawn on by
 * the fight inside a house.
 */

function game(opts: Partial<ConstructorParameters<typeof Game>[0]> = {}) {
  return new Game({ seed: 7, enforceC2: false, lethality: "research", smokeNeedsThrower: false, attackers: ["BLUE"], ...opts });
}

/** Into the fire phase of the first turn. */
function toCombat(g: Game) {
  g.beginTurn();
  g.advanceToPhase("combat");
}

/** Close the turn and stop at the next one's movement phase; what ammunition did as it closed. */
function closeTurn(g: Game) {
  const r = g.advanceToPhase("summary");
  const out = [...r.ammunition];
  const step = g.advancePhase();
  out.push(...(step.ammunition ?? []));
  g.advanceToPhase("movement");
  return out;
}

const rounds = (u: Unit) => (u.soldiers ?? []).map((s) => s.rounds);

describe("the basic load (decision 127)", () => {
  it("issues every man doctrine's example load as his force comes onto the map", () => {
    const g = game();
    const squad = g.addUnit(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 0 }, 9));
    expect(rounds(squad).every((r) => r === BASIC_LOAD.rifleRounds)).toBe(true);
    expect(squad.soldiers!.every((s) => s.grenades === BASIC_LOAD.grenades)).toBe(true);
    // Two launchers in nine men, 21 each; a rifle squad's two rockets.
    expect(squad.ammo).toEqual({ rifleGrenades: 2 * BASIC_LOAD.rifleGrenadesPerLauncher, rockets: BASIC_LOAD.rockets });
    // A machine gun team's belts are split over its crew.
    const mg = g.addUnit(makeMachineGunTeam("B-MG", "BLUE", { x: 0, y: 20 }, 3));
    expect(rounds(mg)).toEqual([275, 275, 275]);
    expect(mg.ammo).toEqual({ rifleGrenades: 0, rockets: 0 });
  });

  it("counts nothing in a game played without it, as a recording made before it replays", () => {
    const g = game({ ammunition: false });
    const squad = g.addUnit(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 0 }, 9));
    expect(squad.soldiers!.some((s) => s.rounds !== undefined || s.grenades !== undefined)).toBe(false);
    expect(squad.ammo).toBeUndefined();
    expect(replayGame({ ...g.toRecording(), ammunition: undefined }).ammunition).toBe(false);
  });
});

describe("firing spends it (decision 127)", () => {
  it("costs each man who fired the sustained rate, and a man with none does not fire", () => {
    const g = game();
    const blue = g.addUnit(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 0 }, 4));
    const red = g.addUnit(makeInfantry("R1", "RED", "squad", { x: 0, y: 250 }, 9));
    blue.soldiers![3]!.rounds = 0;
    toCombat(g);
    const r = g.fire(blue.id, red.id, { weapon: "smallArms", hasLineOfSight: true });
    expect(r.fired).toBe(true);
    expect(r.shooters).toBe(3);
    expect(rounds(blue)).toEqual([195, 195, 195, 0].map((x, i) => (i < 3 ? BASIC_LOAD.rifleRounds - ROUNDS_A_TURN.rifle : x)));
  });

  it("refuses a shot when no man has a round, and that refusal draws no die", () => {
    const g = game();
    const blue = g.addUnit(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 0 }, 4));
    const red = g.addUnit(makeInfantry("R1", "RED", "squad", { x: 0, y: 250 }, 9));
    for (const s of blue.soldiers!) s.rounds = 0;
    toCombat(g);
    const before = g.rng.next.bind(g.rng);
    let draws = 0;
    g.rng.next = () => { draws++; return before(); };
    const r = g.fire(blue.id, red.id, { weapon: "smallArms", hasLineOfSight: true });
    expect(r).toMatchObject({ fired: false, reason: OUT_OF_AMMUNITION });
    expect(draws).toBe(0);
  });

  it("below half its load fires half its men at range, and all of them within 100 m", () => {
    const g = game();
    const blue = g.addUnit(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 0 }, 8));
    const far = g.addUnit(makeInfantry("R1", "RED", "squad", { x: 0, y: 250 }, 9));
    const near = g.addUnit(makeInfantry("R2", "RED", "squad", { x: 60, y: 0 }, 9));
    for (const s of blue.soldiers!) s.rounds = 90; // 90 of 210: below half
    expect(conserving(blue)).toBe(true);
    toCombat(g);
    expect(g.fire(blue.id, far.id, { weapon: "smallArms", hasLineOfSight: true }).shooters).toBe(Math.ceil(8 * CONSERVE.firing));
    // The final protective fire's "spare no ammunition" (ATP 3-21.8 (2024), para A-51).
    expect(g.fire(blue.id, near.id, { weapon: "smallArms", hasLineOfSight: true }).shooters).toBe(8);
  });

  it("picks the men with most rounds to keep firing when it conserves, without a die", () => {
    const squad = makeInfantry("B1", "BLUE", "squad", { x: 0, y: 0 }, 4);
    [10, 80, 5, 60].forEach((r, i) => (squad.soldiers![i]!.rounds = r));
    const men = firingMen(squad, squad.soldiers!, false)!;
    expect([...men].sort()).toEqual([squad.soldiers![1]!.id, squad.soldiers![3]!.id].sort());
  });

  it("caps a launcher's drawn rate at the 40 mm the squad has, and refuses it with none", () => {
    const g = game();
    const blue = g.addUnit(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 0 }, 9));
    const red = g.addUnit(makeInfantry("R1", "RED", "squad", { x: 0, y: 80 }, 9));
    blue.ammo!.rifleGrenades = 1;
    toCombat(g);
    const r = g.fireExplosive("rifleGrenade", blue.id, red.id, { hasLineOfSight: true });
    expect(r.fired).toBe(true);
    expect(r.rounds).toBe(1);
    expect(blue.ammo!.rifleGrenades).toBe(0);
    const again = g.fireExplosive("rifleGrenade", blue.id, red.id, { hasLineOfSight: true });
    expect(again).toMatchObject({ fired: false, reason: OUT_OF_AMMUNITION });
  });

  it("throws in an assault no more grenades than each man has, and spends them", () => {
    const g = game();
    const blue = g.addUnit(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 0 }, 4));
    const red = g.addUnit(makeInfantry("R1", "RED", "squad", { x: 0, y: 20 }, 4));
    [2, 1, 0, 0].forEach((n, i) => (blue.soldiers![i]!.grenades = n));
    toCombat(g);
    g.assault(blue.id, red.id, 2);
    expect(blue.soldiers!.map((s) => s.grenades)).toEqual([0, 0, 0, 0]);
    // Every man with rounds fired, conserving or not: an assault spares none.
    expect(blue.soldiers!.every((s) => s.rounds === BASIC_LOAD.rifleRounds - ROUNDS_A_TURN.rifle)).toBe(true);
  });
});

describe("sharing out and resupply (decision 127)", () => {
  it("shares a fallen man's rounds among the fit, none above a full load", () => {
    const squad = makeInfantry("B1", "BLUE", "squad", { x: 0, y: 0 }, 3);
    squad.soldiers!.forEach((s) => (s.rounds = 0));
    squad.soldiers![0]!.rounds = 300;
    squad.soldiers![2]!.neutralized = true;
    squad.soldiers![2]!.rounds = 200;
    squad.soldiers!.forEach((s) => (s.grenades = 0));
    expect(shareOut(squad)).toBe(true);
    expect(squad.soldiers!.map((s) => s.rounds)).toEqual([210, 210, 80]);
  });

  it("shares out on a quiet turn and not on one it fired", () => {
    const g = game();
    const blue = g.addUnit(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 0 }, 4));
    const red = g.addUnit(makeInfantry("R1", "RED", "squad", { x: 0, y: 250 }, 9));
    blue.soldiers![0]!.rounds = 0;
    toCombat(g);
    g.fire(blue.id, red.id, { weapon: "smallArms", hasLineOfSight: true });
    expect(closeTurn(g).some((r) => r.kind === "sharedOut" && r.unitId === blue.id)).toBe(false);
    expect(blue.soldiers![0]!.rounds).toBe(0);
    expect(closeTurn(g).some((r) => r.kind === "sharedOut" && r.unitId === blue.id)).toBe(true);
    expect(new Set(rounds(blue)).size).toBeLessThanOrEqual(2);
  });

  it("stocks a defender's positions by itself as planning ends: its position and its alternate, a squad's load each", () => {
    const g = game();
    const red = g.addUnit(makeInfantry("R1", "RED", "squad", { x: 0, y: 300 }, 9));
    g.addUnit(makeInfantry("R2", "RED", "squad", { x: 200, y: 300 }, 9));
    g.prepareAlternatePosition(red.id, { x: 100, y: 300 });
    // Not a choice (the author: a control that is never worse is no control).
    expect(() => g.placeCache("RED", { x: 0, y: 300 }, red.id)).toThrow(/at its positions already/);
    expect(g.cachesOf("RED")).toEqual([]);
    g.beginTurn();
    const caches = g.cachesOf("RED");
    expect(caches.map((c) => [c.forUnitId, c.position.x])).toEqual([["R1", 0], ["R1", 100], ["R2", 200]]);
    expect(caches.every((c) => c.stock.rounds === RESUPPLY.squadMen * BASIC_LOAD.rifleRounds)).toBe(true);
    // Never on the enemy's map; and replayed, they stand where they stood.
    expect(g.cachesOf("BLUE")).toEqual([]);
    expect(replayGame(g.toRecording()).cachesOf("RED")).toEqual(caches);
  });

  it("allows an attacker one cache a platoon, within 100 m of its forces, three squads' loads", () => {
    const g = game();
    for (let i = 0; i < 3; i++) g.addUnit(makeInfantry(`B${i}`, "BLUE", "squad", { x: i * 30, y: 0 }, 9));
    expect(() => g.placeCache("BLUE", { x: 0, y: 400 })).toThrow(/within 100 m/);
    const c = g.placeCache("BLUE", { x: 0, y: 50 });
    expect(c.stock.grenades).toBe(RESUPPLY.attackerCacheLoads * RESUPPLY.squadMen * BASIC_LOAD.grenades);
    expect(() => g.placeCache("BLUE", { x: 30, y: 50 })).toThrow(/one a platoon/);
  });

  it("refills a force that holds still at its cache on a quiet turn, from the cache's stock", () => {
    const g = game();
    const blue = g.addUnit(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 0 }, 9));
    const cache = g.placeCache("BLUE", { x: 10, y: 0 });
    blue.soldiers!.forEach((s) => { s.rounds = 50; s.grenades = 0; });
    g.beginTurn();
    g.advanceToPhase("movement");
    const reports = closeTurn(g);
    expect(reports.find((r) => r.kind === "refilled")).toMatchObject({ unitId: blue.id, from: "cache", sourceId: cache.id });
    expect(rounds(blue).every((r) => r === BASIC_LOAD.rifleRounds)).toBe(true);
    expect(g.cachesOf("BLUE")[0]!.stock.rounds).toBe(cache.stock.rounds - 9 * (BASIC_LOAD.rifleRounds - 50));
  });

  it("loses a cache to an enemy that reaches it with nobody of its side there", () => {
    const g = game();
    const red = g.addUnit(makeInfantry("R1", "RED", "squad", { x: 0, y: 300 }, 9));
    const blue = g.addUnit(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 290 }, 9));
    g.beginTurn();
    g.advanceToPhase("movement");
    // Guarded: it stays.
    expect(closeTurn(g).some((r) => r.kind === "cacheTaken")).toBe(false);
    red.position = { x: 0, y: 500 };
    const taken = closeTurn(g).find((r) => r.kind === "cacheTaken");
    expect(taken).toMatchObject({ side: "RED", by: blue.id });
    // Its side is not told: it is still on RED's map, as RED last knew it — but nobody draws from it.
    expect(g.cachesOf("RED")).toHaveLength(1);
    expect(g.cachesOf("RED")[0]!.stock.rounds).toBe(RESUPPLY.squadMen * BASIC_LOAD.rifleRounds);
    // RED learns when it comes back to it.
    blue.position = { x: 0, y: 100 };
    red.position = { x: 0, y: 300 };
    red.soldiers!.forEach((s) => (s.rounds = 0));
    const back = closeTurn(g);
    expect(back.find((r) => r.kind === "cacheLost")).toMatchObject({ side: "RED", by: red.id });
    expect(back.some((r) => r.kind === "refilled" && r.unitId === red.id)).toBe(false);
    expect(g.cachesOf("RED")).toEqual([]);
  });

  it("caps the grenades an assault throws on the document's figures at what its men hold", () => {
    const g = game({ lethality: "document" });
    const blue = g.addUnit(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 0 }, 4));
    const red = g.addUnit(makeInfantry("R1", "RED", "squad", { x: 0, y: 20 }, 4));
    blue.soldiers!.forEach((s) => (s.grenades = 0));
    blue.soldiers![0]!.grenades = 1;
    toCombat(g);
    const r = g.assault(blue.id, red.id, 3);
    expect(r.fired).toBe(true);
    // One grenade among them: it is thrown, and no more than it — three asked for.
    expect(blue.soldiers!.map((s) => s.grenades)).toEqual([0, 0, 0, 0]);
    expect(r.grenadeHits).toBeLessThanOrEqual(1);
  });

  it("replays a battle that fired, shared out and drew from a cache to the same state", () => {
    const g = game();
    const blue = g.addUnit(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 0 }, 8));
    g.addUnit(makeInfantry("R1", "RED", "squad", { x: 0, y: 250 }, 8));
    g.placeCache("BLUE", { x: 10, y: 0 });
    toCombat(g);
    g.fire("B1", "R1", { weapon: "smallArms", hasLineOfSight: true });
    g.fireExplosive("rifleGrenade", "B1", "R1", { hasLineOfSight: true });
    closeTurn(g);
    closeTurn(g); // a quiet turn: shared out and refilled at the cache
    expect(rounds(blue).every((r) => r === BASIC_LOAD.rifleRounds)).toBe(true);
    const back = replayGame(g.toRecording());
    expect(stateDigest(back)).toBe(stateDigest(g));
    expect(back.cachesOf("BLUE")).toEqual(g.cachesOf("BLUE"));
  });

  it("replays a recording made before ammunition to the same state, nothing counted", () => {
    const g = game({ ammunition: false });
    g.addUnit(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 0 }, 8));
    g.addUnit(makeInfantry("R1", "RED", "squad", { x: 0, y: 250 }, 8));
    toCombat(g);
    g.fire("B1", "R1", { weapon: "smallArms", hasLineOfSight: true });
    closeTurn(g);
    const rec = g.toRecording();
    expect(rec.ammunition).toBeUndefined();
    const back = replayGame(rec);
    expect(back.ammunition).toBe(false);
    expect(stateDigest(back)).toBe(stateDigest(g));
  });

  it("walks a bearer squad while it carries any of its load, and lets it run once it is empty", () => {
    const g = game();
    const bearer = g.addUnit(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 0 }, 9));
    g.designateAmmoBearers(bearer.id);
    expect(g.gaitFor(bearer, "run")).toBe("normal");
    bearer.carried = { rounds: 0, grenades: 0, rifleGrenades: 0, rockets: 0 };
    expect(g.gaitFor(bearer, "run")).toBe("run");
    // …and the roles do not go together, in either order.
    expect(() => g.designateBreachElement(bearer.id)).toThrow(/ammunition bearers/);
  });

  it("names one bearer squad a platoon, which refills a squad beside it from three squads' loads", () => {
    const g = game();
    const a = g.addUnit(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 0 }, 9));
    const bearer = g.addUnit(makeInfantry("B2", "BLUE", "squad", { x: 15, y: 0 }, 9));
    g.addUnit(makeInfantry("B3", "BLUE", "squad", { x: 200, y: 0 }, 9));
    g.designateAmmoBearers(bearer.id);
    expect(bearer.carried!.rounds).toBe(RESUPPLY.bearerLoads * RESUPPLY.squadMen * BASIC_LOAD.rifleRounds);
    expect(() => g.designateAmmoBearers("B3")).toThrow(/one a platoon/);
    a.soldiers!.forEach((s) => (s.rounds = 0));
    g.beginTurn();
    g.advanceToPhase("movement");
    expect(closeTurn(g).find((r) => r.kind === "refilled" && r.unitId === a.id)).toMatchObject({ from: "bearer", sourceId: bearer.id });
    expect(ammunitionState(a)!.rounds).toBe(9 * BASIC_LOAD.rifleRounds);
  });

  it("lets a bearer squad top its own men up from its load on a quiet turn it holds still", () => {
    const g = game();
    const bearer = g.addUnit(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 0 }, 9));
    g.designateAmmoBearers(bearer.id);
    bearer.soldiers!.forEach((s) => (s.rounds = 30));
    g.beginTurn();
    g.advanceToPhase("movement");
    expect(closeTurn(g).find((r) => r.kind === "refilled" && r.unitId === bearer.id)).toMatchObject({ from: "bearer", sourceId: bearer.id });
    expect(bearer.carried!.rounds).toBe(RESUPPLY.bearerLoads * RESUPPLY.squadMen * BASIC_LOAD.rifleRounds - 9 * (BASIC_LOAD.rifleRounds - 30));
  });

  it("replays a battle with its caches and bearers", () => {
    const g = game();
    g.addUnit(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 0 }, 9));
    g.addUnit(makeInfantry("B2", "BLUE", "squad", { x: 15, y: 0 }, 9));
    g.placeCache("BLUE", { x: 10, y: 0 });
    g.designateAmmoBearers("B2");
    g.beginTurn();
    const back = replayGame(g.toRecording());
    expect(back.cachesOf("BLUE")).toEqual(g.cachesOf("BLUE"));
    expect(back.getUnit("B2").carried).toEqual(g.getUnit("B2").carried);
  });

  it("splits a squad's 40 mm and rockets with the men a team takes", () => {
    const g = game();
    const squad = g.addUnit(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 0 }, 8));
    g.beginTurn();
    g.advanceToPhase("movement");
    const team = g.detachTeam(squad.id, squad.soldiers!.slice(0, 4).map((s) => s.id));
    expect(team.ammo!.rifleGrenades + g.getUnit(squad.id).ammo!.rifleGrenades).toBe(2 * BASIC_LOAD.rifleGrenadesPerLauncher);
    expect(team.ammo!.rockets + g.getUnit(squad.id).ammo!.rockets).toBe(BASIC_LOAD.rockets);
  });
});

describe("mines and IEDs as a stock (decision 127, decision 16's deferral)", () => {
  it("carries the scenario's charges, 2 when it says nothing, and refuses a third", () => {
    const g = game();
    const red = makeInfantry("R1", "RED", "squad", { x: 0, y: 0 }, 8);
    red.canLayCharges = true;
    g.addUnit(red);
    expect(red.charges).toBe(BASIC_LOAD.charges);
    g.beginTurn();
    g.advanceToPhase("movement");
    g.layCharge(red.id, "antiPersonnel");
    expect(red.charges).toBe(1);
    g.layCharge(red.id, null); // called off: back in the pack
    expect(red.charges).toBe(2);
    red.charges = 0;
    expect(() => g.layCharge(red.id, "antiPersonnel")).toThrow(/no charges left/);
    expect(game({ charges: 5 }).addUnit(Object.assign(makeInfantry("R2", "RED", "squad", { x: 0, y: 0 }, 8), { canLayCharges: true })).charges).toBe(5);
  });
});

const house = (id: string, w: number, h: number, storeys = 2): MapObject => ({
  id,
  kind: "building",
  height: storeys * 3,
  footprint: { shape: "polygon", points: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }] },
});
const squad: string[][] = [["a1", "a2", "a3", "a4"], ["a5", "a6", "a7", "a8"]];

describe("grenades inside a house draw on the stock (decision 127)", () => {
  /** Through an empty two-storey house; the grenades thrown, and how many the lane passed up. */
  function clear(entry: "door" | "stair", own: number, stock: number, security: string[] = []) {
    const plan = generateFloorPlan(house("h", 16, 12), 2);
    let passed = 0;
    const f = new InteriorFight({
      plan,
      attack: { entry, grenades: true, teams: squad, ...(security.length ? { security } : {}) },
      defence: [],
      ammo: { grenadesOf: () => own, laneSupply: () => (passed < stock ? (passed++, true) : false) },
    }, new Rng(2));
    for (let k = 0; k < 20000 && !f.finished; k++) f.tick();
    return { thrown: f.result().grenadesThrown, passed };
  }

  it("sends a man in with what he has left: none thrown by men who carry none", () => {
    expect(clear("door", 0, 0).thrown).toBe(0);
    expect(clear("door", 2, 0).thrown).toBeGreaterThan(0);
    // With no ammunition counted, a full load each, as before.
    const plan = generateFloorPlan(house("h", 16, 12), 2);
    const f = new InteriorFight({ plan, attack: { entry: "door", grenades: true, teams: squad }, defence: [] }, new Rng(2));
    for (let k = 0; k < 20000 && !f.finished; k++) f.tick();
    expect(f.result().grenadesThrown).toBe(clear("door", CLOSE_QUARTERS.grenadesEach, 0).thrown);
  });

  it("passes grenades up the open lane at each CLEAR, a finite stock, and never by the door", () => {
    const up = clear("stair", 0, 3, ["s1"]);
    expect(up.passed).toBe(3);
    expect(up.thrown).toBeGreaterThan(0);
    expect(up.thrown).toBeLessThanOrEqual(3);
    // No stair foot held, no lane: nothing comes up, whatever is outside.
    expect(clear("door", 0, 50).passed).toBe(0);
  });
});

describe("grenades inside, coupled to the turn (decision 127)", () => {
  const building: MapObject = {
    id: "house",
    kind: "building",
    height: 6,
    footprint: { shape: "polygon", points: [{ x: 100, y: 100 }, { x: 116, y: 100 }, { x: 116, y: 112 }, { x: 100, y: 112 }] },
  };
  /** B-1 goes into the house R-1 holds, and fights a minute inside. */
  function fightInside(seed = 1) {
    const g = new Game({ seed, enforceC2: false, terrain: { objects: [building] } });
    g.addUnit(makeInfantry("R-1", "RED", "squad", { x: 108, y: 106 }, 4));
    const door = g.interior.frontDoor(g, building)!;
    const dx = door.x - 108, dy = door.y - 106, d = Math.hypot(dx, dy);
    g.addUnit(makeInfantry("B-1", "BLUE", "squad", { x: door.x + (10 * dx) / d, y: door.y + (10 * dy) / d }, 8));
    g.beginTurn();
    g.advanceToPhase("combat");
    g.assault("B-1", "R-1", 0);
    g.advanceToPhase("initiative");
    return g;
  }

  it("writes back what the attackers threw, and leaves the defenders' own alone", () => {
    const g = fightInside();
    const thrown = 8 * BASIC_LOAD.grenades - g.getUnit("B-1").soldiers!.reduce((t, s) => t + (s.grenades ?? 0), 0);
    expect(thrown).toBeGreaterThan(0);
    // Nothing in the fight arms a defender at his post, and nothing takes his grenades from him.
    expect(g.getUnit("R-1").soldiers!.every((s) => s.grenades === BASIC_LOAD.grenades)).toBe(true);
  });
});

describe("the review's cases (decision 127)", () => {
  const building: MapObject = {
    id: "house",
    kind: "building",
    height: 6,
    footprint: { shape: "polygon", points: [{ x: 100, y: 100 }, { x: 116, y: 100 }, { x: 116, y: 112 }, { x: 100, y: 112 }] },
  };

  it("keeps grenades whole when a man who broke inside passes his up the lane: what one gives the other gets", () => {
    // Seeds tried in turn until a donation happens: the check below must not pass by nothing being passed.
    let donated = false;
    for (let seed = 1; seed <= 30 && !donated; seed++) {
      const g = new Game({ seed, enforceC2: false, morale: true, terrain: { objects: [building] } });
      g.addUnit(makeInfantry("R-1", "RED", "squad", { x: 108, y: 106 }, 3));
      const door = g.interior.frontDoor(g, building)!;
      const dx = door.x - 108, dy = door.y - 106, d = Math.hypot(dx, dy);
      const b = g.addUnit(makeInfantry("B-1", "BLUE", "squad", { x: door.x + (10 * dx) / d, y: door.y + (10 * dy) / d }, 8));
      g.setInteriorPlan("B-1", { entry: "stair" });
      g.beginTurn();
      g.advanceToPhase("combat");
      g.assault("B-1", "R-1", 0);
      const total = () => b.soldiers!.reduce((t, s) => t + (s.grenades ?? 0), 0);
      // The fight begins as the turn closes, and goes on while there is one.
      for (let turn = 0; turn < 12; turn++) {
        // One man breaks: he leaves the fight, and is outside it with his grenades.
        const man = b.soldiers![7]!;
        if (man.morale && !man.neutralized) man.morale.state = "broken";
        g.advanceToPhase("initiative");
        const fight = g.interior.engagementOf("B-1")?.fight;
        const thrown = fight ? fight.result().grenadesThrown : 0;
        if (!fight) break;
        expect(total() + thrown).toBe(8 * BASIC_LOAD.grenades);
        if ((man.grenades ?? 0) < BASIC_LOAD.grenades) donated = true;
        g.advanceToPhase("combat");
      }
    }
    expect(donated).toBe(true);
  });

  it("fires through windows the half of the men at them, and charges the men it fired", () => {
    // R-1 holds the house with 6 men; B-1 fights it inside; B-2 stands in the street, in front of some window.
    let checked = false;
    for (let seed = 1; seed <= 20 && !checked; seed++) {
      const g = new Game({ seed, enforceC2: false, terrain: { objects: [building] } });
      const red = g.addUnit(makeInfantry("R-1", "RED", "squad", { x: 108, y: 106 }, 6));
      const door = g.interior.frontDoor(g, building)!;
      const dx = door.x - 108, dy = door.y - 106, d = Math.hypot(dx, dy);
      g.addUnit(makeInfantry("B-1", "BLUE", "squad", { x: door.x + (10 * dx) / d, y: door.y + (10 * dy) / d }, 8));
      const street = g.addUnit(makeInfantry("B-2", "BLUE", "squad", { x: 108, y: 900 }, 8));
      g.beginTurn();
      g.advanceToPhase("combat");
      g.assault("B-1", "R-1", 0);
      g.advanceToPhase("initiative");
      if (!g.interior.engagementOf("R-1")) continue;
      g.advanceToPhase("combat");
      // A spot 150 m out (beyond "spare none") that some of its windows see.
      for (let k = 0; k < 16 && !checked; k++) {
        const a = (2 * Math.PI * k) / 16;
        street.position = { x: 108 + 150 * Math.cos(a), y: 106 + 150 * Math.sin(a) };
        const atWindows = new Set((g.interior.shown(g, "R-1", street.position) ?? []).map((m) => m.soldierId));
        if (atWindows.size === 0 || atWindows.size === red.soldiers!.filter((s) => !s.neutralized).length) continue;
        // Below half, and the men at the windows hold the least: the half that fires is still of them.
        for (const s of red.soldiers!) s.rounds = atWindows.has(s.id) ? 20 : 60;
        const before = new Map(red.soldiers!.map((s) => [s.id, s.rounds!]));
        const r = g.fire("R-1", "B-2", { weapon: "smallArms" });
        // Flat ground: a window that faces it sees it. The half that fires is the windows' half, not the squad's.
        expect(r.fired).toBe(true);
        expect(r.shooters).toBe(Math.ceil(atWindows.size / 2));
        const charged = red.soldiers!.filter((s) => s.rounds !== before.get(s.id)).map((s) => s.id);
        expect(charged.length).toBe(r.shooters);
        expect(charged.every((id) => atWindows.has(id))).toBe(true);
        checked = true;
      }
    }
    expect(checked).toBe(true);
  });

  it("says out of ammunition only of a force that has men to fire and none with a round", () => {
    const g = game();
    const blue = g.addUnit(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 0 }, 4));
    const red = g.addUnit(makeInfantry("R1", "RED", "squad", { x: 0, y: 250 }, 9));
    blue.soldiers!.forEach((s) => { s.rounds = 0; s.neutralized = true; });
    toCombat(g);
    expect(g.fire(blue.id, red.id, { weapon: "smallArms", hasLineOfSight: true }).reason).not.toBe(OUT_OF_AMMUNITION);
  });

  it("refuses the bearers' role to the breach squad, as it refuses the breach to the bearers", () => {
    const g = game();
    const squad = g.addUnit(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 0 }, 9));
    g.designateBreachElement(squad.id);
    expect(() => g.designateAmmoBearers(squad.id)).toThrow(/breach squad/);
  });
});
