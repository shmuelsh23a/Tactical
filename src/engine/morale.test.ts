import { describe, expect, it } from "vitest";
import { Rng } from "./rng.js";
import { Game } from "./game.js";
import { makeCommandGroup, makeInfantry, makeVehicle } from "./units.js";
import type { Soldier, Unit } from "./types.js";
import {
  StressLedger,
  effectiveMorale,
  forceBroken,
  generateMorale,
  leaderBonus,
  leadership,
  readySoldiers,
  resolveMorale,
  shooterAccuracy,
  sideBroken,
  snapshotSoldiers,
  suppressionLevel,
  type MoraleContext,
} from "./morale.js";
import { replayGame, sealRecording, verifyRecording } from "./recording.js";
import { HEROIC, LEADER_BONUS, MOTIVATION_FLOOR, PREPARED, RALLY, SUPPRESSION } from "./data/morale.js";
import { resolveDirectExplosive } from "./combat/explosives.js";

/** An rng whose d100s are scripted, so a test says exactly how a roll went. */
class ScriptedRng extends Rng {
  constructor(private readonly rolls: number[]) {
    super(1);
  }
  drawn = 0;
  override int(min: number, max: number): number {
    const next = this.rolls[this.drawn++];
    if (next == null) throw new Error("ScriptedRng: ran out of rolls");
    return Math.max(min, Math.min(max, next));
  }
}

/** A force with morale, every man set to the same traits and pool. */
function dressed(unit: Unit, will = 80, traits: Partial<Soldier["traits"]> = {}): Unit {
  generateMorale(unit, 1);
  for (const s of unit.soldiers!) {
    s.traits = { strength: 5, intelligence: 5, wisdom: 5, agility: 5, charisma: 5, luck: 1, ...traits };
    s.morale = { will, ceiling: will, state: "steady", timesRallied: 0 };
  }
  return unit;
}

/** Close the turn in progress, whatever phase it is in, and open the next. */
function endTurn(g: Game) {
  g.advanceToPhase("summary");
  return g.advanceToPhase("initiative");
}

function context(units: Unit[], rng: Rng, over: Partial<MoraleContext> = {}): MoraleContext {
  return {
    rng,
    turn: 1,
    units,
    stress: new StressLedger(),
    snapshot: snapshotSoldiers(units),
    perceives: () => true,
    sees: () => true,
    withdrawing: () => false,
    watching: () => true,
    ...over,
  };
}

describe("morale is a module: off, nothing changes", () => {
  it("draws no traits and adds no fields without the option", () => {
    const g = new Game({ seed: 7 });
    const u = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 8));
    expect(u.soldiers!.every((s) => s.traits == null && s.morale == null)).toBe(true);
    expect(g.toRecording().morale).toBeUndefined();
  });

  it("dressing the men costs the game's rng nothing", () => {
    const plain = new Game({ seed: 7 });
    const withMorale = new Game({ seed: 7, morale: true });
    for (const g of [plain, withMorale]) {
      g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 8));
      g.addUnit(makeCommandGroup("B-HQ", "BLUE", "platoon", { x: 0, y: 50 }));
    }
    expect(withMorale.rng.getState()).toBe(plain.rng.getState());
  });
});

describe("traits and the starting pool", () => {
  it("gives every man six traits of 1–10, a leader, and a pool between the floor and 100", () => {
    const g = new Game({ seed: 3, morale: true });
    const u = makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 8);
    u.motivation = "high";
    g.addUnit(u);
    const soldiers = u.soldiers!;
    for (const s of soldiers) {
      for (const v of Object.values(s.traits!)) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(10);
      }
      expect(s.morale!.will).toBeGreaterThanOrEqual(MOTIVATION_FLOOR.high);
      expect(s.morale!.will).toBeLessThanOrEqual(100);
      expect(s.morale!.ceiling).toBe(s.morale!.will);
    }
    expect(soldiers.filter((s) => s.leader)).toEqual([soldiers[0]]);
    expect(leadership(soldiers[0]!)).toBe(
      soldiers[0]!.traits!.intelligence + soldiers[0]!.traits!.wisdom + soldiers[0]!.traits!.charisma,
    );
    // A regular soldier has no leadership.
    expect(leadership(soldiers[1]!)).toBe(0);
  });

  it("draws a force's men from the seed and its id, whatever was added before it", () => {
    const a = new Game({ seed: 11, morale: true });
    const b = new Game({ seed: 11, morale: true });
    b.addUnit(makeInfantry("OTHER", "RED", "squad", { x: 0, y: 0 }, 8));
    const ua = a.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 8));
    const ub = b.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 8));
    expect(ub.soldiers).toEqual(ua.soldiers);
  });

  it("keeps a force the scenario dressed by hand", () => {
    const g = new Game({ seed: 11, morale: true });
    const u = dressed(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 4), 42);
    g.addUnit(u);
    expect(u.soldiers!.every((s) => s.morale!.will === 42)).toBe(true);
  });
});

describe("the live leader bonus", () => {
  const squad = () => dressed(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 4), 60, { intelligence: 9, wisdom: 9, charisma: 9 });

  it("is the squad leader's leadership ÷ 3, and the platoon commander's half that above him", () => {
    const s = squad();
    const hq = dressed(makeCommandGroup("HQ", "BLUE", "platoon", { x: 0, y: 200 }), 60, { intelligence: 6, wisdom: 6, charisma: 6 });
    const man = s.soldiers![1]!;
    expect(leaderBonus([s], s, man)).toBe(Math.round(27 / 3));
    expect(leaderBonus([s, hq], s, man)).toBe(Math.round(27 / 3 + 18 / 3 / 2));
    // The squad leader himself answers to the platoon commander, at full weight.
    expect(leaderBonus([s, hq], s, s.soldiers![0]!)).toBe(18 / 3);
  });

  it("is gone the moment the leader is, and the next link steps up", () => {
    const s = squad();
    const hq = dressed(makeCommandGroup("HQ", "BLUE", "platoon", { x: 0, y: 200 }), 60, { intelligence: 6, wisdom: 6, charisma: 6 });
    s.soldiers![0]!.neutralized = true;
    expect(leaderBonus([s, hq], s, s.soldiers![1]!)).toBe(18 / 3);
    // Out of the commander's reach (300 m for a platoon HQ), nothing from him.
    hq.position = { x: 0, y: 400 };
    expect(leaderBonus([s, hq], s, s.soldiers![1]!)).toBe(Math.floor(9 / 2));
  });

  it("costs the men when the leader is broken", () => {
    const s = squad();
    s.soldiers![0]!.morale!.state = "broken";
    expect(leaderBonus([s], s, s.soldiers![1]!)).toBe(-Math.round(27 / 3));
  });

  it("falls back to half the charisma of the best comrade nearby, out of every leader's reach", () => {
    const s = dressed(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 3), 60, { charisma: 4 });
    s.soldiers![0]!.neutralized = true;
    s.soldiers![2]!.traits!.charisma = 9;
    expect(leaderBonus([s], s, s.soldiers![1]!)).toBe(4);
    // …and never his own.
    expect(leaderBonus([s], s, s.soldiers![2]!)).toBe(2);
  });

  it("is held to the cap", () => {
    const s = squad();
    const hq = dressed(makeCommandGroup("HQ", "BLUE", "platoon", { x: 0, y: 0 }), 60, { intelligence: 10, wisdom: 10, charisma: 10 });
    const coy = dressed(makeCommandGroup("COY", "BLUE", "company", { x: 0, y: 0 }), 60, { intelligence: 10, wisdom: 10, charisma: 10 });
    for (const soldier of s.soldiers!) soldier.traits = { ...soldier.traits!, intelligence: 10, wisdom: 10, charisma: 10 };
    expect(leaderBonus([s, hq, coy], s, s.soldiers![1]!)).toBe(LEADER_BONUS.cap);
  });
});

describe("suppression", () => {
  function contact(seed = 5) {
    const g = new Game({ seed, morale: true, enforceC2: false });
    const blue = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 8));
    const red = g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 150 }, 8));
    g.beginTurn();
    return { g, blue, red };
  }

  it("lands with the fire, and a machine gun suppresses harder", () => {
    const { g, blue, red } = contact();
    g.advanceToPhase("combat");
    const shot = g.fire(red.id, blue.id, { weapon: "smallArms" });
    expect(blue.suppression).toBe(SUPPRESSION.directFire + SUPPRESSION.perHit * shot.hits);
    const before = blue.suppression!;
    // ירי מקביל is a vehicle's coaxial gun (decision 25).
    const tank = g.addUnit(makeVehicle("T", "RED", { x: 0, y: 150 }));
    const burst = g.fire(tank.id, blue.id, { weapon: "sustainedMg" });
    expect(burst.fired).toBe(true);
    // (The second burst is refused as already acted only in the UI; the engine resolves it.)
    expect(blue.suppression! - before).toBe(
      Math.round((SUPPRESSION.directFire + SUPPRESSION.perHit * burst.hits) * SUPPRESSION.sustainedMgFactor),
    );
  });

  it("halves at the end of every turn", () => {
    const { g, blue } = contact();
    blue.suppression = 60;
    endTurn(g);
    expect(blue.suppression).toBe(30);
  });

  it("pins a force: it moves only to withdraw, and then at half pace", () => {
    const { g, blue } = contact();
    blue.suppression = SUPPRESSION.pinned;
    g.advanceToPhase("movement");
    expect(suppressionLevel(blue)).toBe("pinned");
    expect(() => g.moveUnit(blue.id, { x: 0, y: -10 })).toThrow("pinned");
    g.setStandingOrder(blue.id, { gait: "normal", destination: { x: 0, y: -1000 }, withdraw: true });
    const [done] = g.executeStandingOrders("BLUE");
    expect(done!.moved).toBeDefined();
    expect(blue.position.y).toBeCloseTo(-25, 5); // half of the 50 m walk
  });

  it("spoils the aim, a man at a time", () => {
    const u = dressed(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 3), 80);
    expect(shooterAccuracy(u)).toEqual([1, 1, 1]);
    u.suppression = SUPPRESSION.suppressed;
    u.soldiers![1]!.morale!.state = "shaken";
    u.soldiers![2]!.morale!.state = "broken";
    // The broken man does not shoot at all.
    expect(readySoldiers(u)).toHaveLength(2);
    expect(shooterAccuracy(u)).toEqual([0.75, 0.75 * 0.75]);
  });
});

describe("the pool of will", () => {
  it("never refills above a ceiling that every loss lowers", () => {
    const u = dressed(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 2), 80);
    const units = [u];
    const ctx = context(units, new ScriptedRng(Array(20).fill(1)));
    // Fired on, a comrade hit, and the squad leader down: 1 + 1 + 6 + 15 = 23
    // lost by the man who was not hit.
    ctx.stress.firedOn(u, { kind: "direct" });
    u.soldiers!.push({ id: "B-s3", damagePoints: 0, neutralized: false, morale: { will: 80, ceiling: 80, state: "steady", timesRallied: 0 } });
    ctx.snapshot.set("B-s3", { damage: 0, neutralized: false });
    u.soldiers![2]!.damagePoints = 2;
    u.soldiers![0]!.neutralized = true;
    resolveMorale(ctx);
    const m = u.soldiers![1]!.morale!;
    expect(m.will).toBe(57);
    expect(m.ceiling).toBe(68); // half of 23, rounded up, is gone for good
    // Quiet turns bring him back to the ceiling and no further.
    for (let turn = 2; turn < 12; turn++) resolveMorale(context(units, new ScriptedRng(Array(10).fill(1)), { turn }));
    expect(m.will).toBe(68);
  });

  it("is dry at the bottom: broken for good, and never rallied", () => {
    const s = dressed(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 3), 80, { intelligence: 10, wisdom: 10, charisma: 10 });
    const man = s.soldiers![2]!;
    man.morale = { will: 5, ceiling: 8, state: "broken", timesRallied: 0 };
    const rng = new ScriptedRng([]);
    resolveMorale(context([s], rng));
    expect(man.morale.state).toBe("broken");
    expect(rng.drawn).toBe(0); // not even tried
  });
});

describe("tests", () => {
  it("break a man at 10 or below without a roll", () => {
    const u = dressed(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 2), 80);
    u.soldiers![0]!.leader = false; // no bonus to lift him
    u.soldiers![1]!.morale!.will = 11;
    u.soldiers![1]!.morale!.ceiling = 60;
    u.soldiers![0]!.traits!.charisma = 1;
    const ctx = context([u], new ScriptedRng([]));
    ctx.stress.firedOn(u, { kind: "direct" }); // -1: to 10
    const out = resolveMorale(ctx);
    expect(u.soldiers![1]!.morale!.state).toBe("broken");
    expect(out.reports).toContainEqual({ unitId: "B", kind: "broke", soldiers: 1 });
  });

  it("come every three turns when wavering, every turn when shaken", () => {
    const u = dressed(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 2), 45);
    u.soldiers![0]!.leader = false;
    for (const s of u.soldiers!) s.traits!.charisma = 1; // no fallback bonus either
    // Passing rolls: a 1 always passes.
    const rolls = new ScriptedRng(Array(50).fill(1));
    const tested: number[] = [];
    for (let turn = 1; turn <= 6; turn++) {
      const before = rolls.drawn;
      resolveMorale(context([u], rolls, { turn }));
      tested.push(rolls.drawn - before);
    }
    // Two men at 45 (+2 a quiet turn, up to their ceiling of 45): turns 1 and 4.
    expect(tested).toEqual([2, 0, 0, 2, 0, 0]);

    for (const s of u.soldiers!) s.morale = { will: 25, ceiling: 25, state: "shaken", timesRallied: 0 };
    const before = rolls.drawn;
    resolveMorale(context([u], rolls, { turn: 7 }));
    resolveMorale(context([u], rolls, { turn: 8 }));
    expect(rolls.drawn - before).toBe(4);
  });

  it("are skipped by men withdrawing under orders — the sharp ones are not", () => {
    const u = dressed(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 2), 25);
    u.soldiers![0]!.leader = false;
    for (const s of u.soldiers!) s.traits!.charisma = 1;
    const rolls = new ScriptedRng(Array(10).fill(1));
    resolveMorale(context([u], rolls, { withdrawing: () => true }));
    expect(rolls.drawn).toBe(0);
    const ctx = context([u], rolls, { withdrawing: () => true, turn: 2 });
    // Shelled and hit: 1 + 5 + 6 = 12, a sharp event for him alone.
    ctx.stress.firedOn(u, { kind: "indirect" });
    u.soldiers![0]!.damagePoints = 3;
    resolveMorale(ctx);
    expect(rolls.drawn).toBe(1);
  });

  it("turn a failure into a heroic response on a roll under twice his luck", () => {
    const u = dressed(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 2), 25, { luck: 10 });
    u.soldiers![0]!.leader = false;
    for (const s of u.soldiers!) s.traits!.charisma = 1;
    // Man 1: fails (100), then 20 ≤ 2 × 10 — a hero. Man 2: fails, 21 — breaks.
    const out = resolveMorale(context([u], new ScriptedRng([100, 20, 100, 21])));
    expect(u.soldiers![0]!.morale!.state).toBe("heroic");
    expect(u.soldiers![0]!.morale!.heroicUntilTurn).toBe(1 + HEROIC.turns);
    expect(u.soldiers![1]!.morale!.state).toBe("broken");
    expect(out.reports.map((r) => r.kind)).toEqual(["heroic", "broke", "routed"]);
  });
});

describe("rallies", () => {
  function brokenSquadBeside(hqAt: { x: number; y: number }) {
    const s = dressed(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 4), 60);
    s.soldiers![0]!.leader = false;
    for (const m of s.soldiers!) m.traits!.charisma = 1;
    s.soldiers![3]!.morale!.state = "broken";
    const hq = dressed(makeCommandGroup("HQ", "BLUE", "platoon", hqAt), 80, { intelligence: 8, wisdom: 8, charisma: 8 });
    return { s, hq };
  }

  it("need the commander there, and are hard: 2 × leadership", () => {
    const far = brokenSquadBeside({ x: 0, y: RALLY.commanderRange + 1 });
    const rng = new ScriptedRng([]);
    resolveMorale(context([far.s, far.hq], rng));
    expect(far.s.soldiers![3]!.morale!.state).toBe("broken");

    const near = brokenSquadBeside({ x: 0, y: 10 });
    // 48% with leadership 24: a 48 rallies him.
    const out = resolveMorale(context([near.s, near.hq], new ScriptedRng([48])));
    const man = near.s.soldiers![3]!.morale!;
    expect(man.state).not.toBe("broken");
    expect(man.timesRallied).toBe(1);
    expect(out.reports).toContainEqual({ unitId: "B", kind: "rallied", soldiers: 1, rallierId: "HQ" });
  });

  it("get harder every time, and under fire", () => {
    const { s, hq } = brokenSquadBeside({ x: 0, y: 10 });
    s.soldiers![3]!.morale!.timesRallied = 1;
    const ctx = context([s, hq], new ScriptedRng([14]));
    ctx.stress.firedOn(s, { kind: "direct" });
    resolveMorale(ctx);
    // 48 - 15 - 20 = 13: a 14 fails.
    expect(s.soldiers![3]!.morale!.state).toBe("broken");
  });

  it("are impossible with the enemy on top of him", () => {
    const { s, hq } = brokenSquadBeside({ x: 0, y: 10 });
    const red = makeInfantry("R", "RED", "squad", { x: 0, y: 30 }, 8);
    const rng = new ScriptedRng([]);
    resolveMorale(context([s, hq, red], rng));
    expect(rng.drawn).toBe(0);
  });
});

describe("forces break", () => {
  it("at half the strength down or broken, and run to their commander", () => {
    const s = dressed(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 4), 60);
    s.soldiers![1]!.neutralized = true;
    s.soldiers![2]!.morale!.state = "broken";
    const hq = dressed(makeCommandGroup("HQ", "BLUE", "platoon", { x: 0, y: 250 }), 80, { intelligence: 1, wisdom: 1, charisma: 1 });
    expect(forceBroken([s, hq], s)).toBe(true);
    const out = resolveMorale(context([s, hq], new ScriptedRng(Array(10).fill(100))));
    expect(s.routing).toBe(true);
    expect(out.routs).toEqual([{ unitId: "B", to: { x: 0, y: 250 } }]);
  });

  it("surrender where the enemy is on top of them", () => {
    const s = dressed(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 2), 60);
    for (const m of s.soldiers!) m.morale!.state = "broken";
    const red = makeInfantry("R", "RED", "squad", { x: 0, y: 40 }, 8);
    const out = resolveMorale(context([s, red], new ScriptedRng([])));
    expect(s.surrendered).toBe(true);
    expect(s.neutralized).toBe(true);
    expect(out.surrendered).toEqual(["B"]);
  });

  it("shake the friends who watch them go", () => {
    const s = dressed(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 0 }, 2), 60);
    for (const m of s.soldiers!) m.morale!.state = "broken";
    const next = dressed(makeInfantry("B2", "BLUE", "squad", { x: 150, y: 0 }, 2), 70);
    resolveMorale(context([s, next], new ScriptedRng(Array(10).fill(1))));
    // A quiet turn gives nothing back above the ceiling, and watching a friend
    // run costs 8 on top.
    expect(next.soldiers![1]!.morale!.will).toBe(62);
  });
});

describe("the game plays it", () => {
  function battle(seed: number) {
    const g = new Game({ seed, morale: true, enforceC2: false });
    const blue = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 8));
    const hq = g.addUnit(makeCommandGroup("B-HQ", "BLUE", "platoon", { x: 0, y: -250 }));
    const red = g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 90 }, 8));
    return { g, blue, hq, red };
  }

  it("a routing force is the engine's: no orders, no fire, and it runs", () => {
    const { g, blue, red } = battle(21);
    g.beginTurn();
    blue.soldiers!.slice(0, 5).forEach((s) => (s.morale!.state = "broken"));
    endTurn(g);
    expect(blue.routing).toBe(true);
    expect(g.setStandingOrder(blue.id, { gait: "normal", destination: { x: 50, y: 50 } })).toBe(false);
    g.advanceToPhase("movement");
    expect(() => g.moveUnit(blue.id, { x: 0, y: 10 })).toThrow("routing");
    const y = blue.position.y;
    g.executeStandingOrders("BLUE");
    expect(blue.position.y).toBeLessThan(y);
    g.advanceToPhase("combat");
    expect(g.fire(blue.id, red.id, { weapon: "smallArms" })).toMatchObject({ fired: false, reason: "routing" });
  });

  it("a withdrawing force does not fire", () => {
    const { g, blue, red } = battle(21);
    g.beginTurn();
    g.advanceToPhase("movement");
    g.setStandingOrder(blue.id, { gait: "run", destination: { x: 0, y: -200 }, withdraw: true });
    g.advanceToPhase("combat");
    expect(g.fire(blue.id, red.id, { weapon: "smallArms" })).toMatchObject({ fired: false, reason: "withdrawing" });
  });

  it("a side breaks at two thirds of its fighting strength gone", () => {
    const { g, blue, red } = battle(21);
    expect(g.sideBroken("BLUE")).toBe(false);
    blue.routing = true;
    expect(g.sideBroken("BLUE")).toBe(true);
    // Command groups are not fighting strength.
    expect(sideBroken(g.units, "RED")).toBe(false);
    red.soldiers!.slice(0, 5).forEach((s) => (s.neutralized = true));
    expect(sideBroken(g.units, "RED")).toBe(false);
    red.soldiers![5]!.morale!.state = "broken";
    expect(sideBroken(g.units, "RED")).toBe(true);
  });

  it("armour counts toward a side's strength by its crew", () => {
    const g = new Game({ seed: 1, morale: true });
    const tank = g.addUnit(makeVehicle("T", "RED", { x: 0, y: 0 }));
    g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 2));
    expect(g.sideBroken("RED")).toBe(false);
    tank.vehicle!.destroyed = true;
    tank.neutralized = true;
    expect(g.sideBroken("RED")).toBe(true);
  });

  it("replays bit for bit: a fight of several turns under morale", () => {
    const { g, blue, red } = battle(33);
    g.beginTurn();
    for (let turn = 0; turn < 6; turn++) {
      g.advanceToPhase("combat");
      g.fire(red.id, blue.id, { weapon: "smallArms" });
      g.fire(blue.id, red.id, { weapon: "smallArms" });
      g.advanceToPhase("initiative");
    }
    const recording = sealRecording(g.toRecording());
    expect(recording.morale).toBe(true);
    expect(verifyRecording(recording)).toMatchObject({ checked: true, ok: true });
    const game = replayGame(recording);
    expect(game.getUnit(blue.id)).toEqual(blue);
    expect(game.rng.getState()).toBe(g.rng.getState());
  });

  it("reports what it did at the end of the turn", () => {
    const { g, blue } = battle(21);
    g.beginTurn();
    blue.soldiers!.slice(0, 5).forEach((s) => (s.morale!.state = "broken"));
    const { morale } = endTurn(g);
    expect(morale).toContainEqual(expect.objectContaining({ unitId: blue.id, kind: "routed" }));
  });

  it("effective morale is what the thresholds read", () => {
    const { g, blue } = battle(21);
    const man = blue.soldiers![3]!;
    blue.suppression = SUPPRESSION.pinned;
    expect(effectiveMorale(g.units, blue, man)).toBe(man.morale!.will + leaderBonus(g.units, blue, man) - 10);
  });
});

describe("review fixes: halves of one rule agree", () => {
  it("a squad leader who breaks costs his men next turn, not halfway through this one's tests", () => {
    // Leadership 27: +9 to his men while he holds, -9 once he breaks. He is
    // first in the squad and breaks without a roll (pool 1 + a restful 4 + half
    // a comrade's charisma 4 = 9). His men stand at 15 + 4 + 9 = 28 and pass
    // their tests on 1s. Felt at once, his break would drop them to 10 and
    // break them with no test at all — because of where he stood in the list.
    const u = dressed(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 3), 15, { intelligence: 9, wisdom: 9, charisma: 9 });
    u.soldiers![0]!.morale = { will: 1, ceiling: 60, state: "shaken", timesRallied: 0 };
    for (const m of u.soldiers!.slice(1)) m.morale!.ceiling = 60;
    const rolls = new ScriptedRng([1, 1]);
    resolveMorale(context([u], rolls));
    expect(u.soldiers![0]!.morale!.state).toBe("broken");
    expect(u.soldiers![1]!.morale!.state).not.toBe("broken");
    expect(u.soldiers![2]!.morale!.state).not.toBe("broken");
    expect(rolls.drawn).toBe(2);
  });

  it("a routing force's own leader can rally it", () => {
    const s = dressed(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 4), 60, { intelligence: 8, wisdom: 8, charisma: 8 });
    s.routing = true;
    s.soldiers![3]!.morale!.state = "broken";
    resolveMorale(context([s], new ScriptedRng([1])));
    expect(s.soldiers![3]!.morale!.timesRallied).toBe(1);
  });

  it("a hero is spared three tests, and his spell ends when the next turn begins", () => {
    const u = dressed(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 1), 25);
    u.soldiers![0]!.leader = false;
    u.soldiers![0]!.morale = { will: 25, ceiling: 25, state: "heroic", heroicUntilTurn: 4, timesRallied: 0 };
    const rolls = new ScriptedRng(Array(10).fill(1));
    for (const turn of [2, 3, 4]) resolveMorale(context([u], rolls, { turn }));
    expect(rolls.drawn).toBe(0);
    resolveMorale(context([u], rolls, { turn: 5 }));
    expect(rolls.drawn).toBe(1);
  });

  it("flanking is judged where the force was shot, from the bearing noted then", () => {
    const u = dressed(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 2), 80);
    const ctx = context([u], new ScriptedRng(Array(10).fill(1)));
    ctx.stress.firedOn(u, { kind: "direct", bearing: 90 });
    ctx.stress.firedOn(u, { kind: "direct", bearing: 200 });
    resolveMorale(ctx);
    // fired on 1 + flanked 8, less nothing back: 71.
    expect(u.soldiers![1]!.morale!.will).toBe(71);
  });

  it("friends breaking out of sight do not shake a force", () => {
    const s = dressed(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 0 }, 2), 60);
    for (const m of s.soldiers!) m.morale!.state = "broken";
    const next = dressed(makeInfantry("B2", "BLUE", "squad", { x: 150, y: 0 }, 2), 70);
    resolveMorale(context([s, next], new ScriptedRng(Array(10).fill(1)), { sees: () => false }));
    expect(next.soldiers![1]!.morale!.will).toBe(70);
  });

  it("a rout is reported to the sides that watched it — and only those", () => {
    const s = dressed(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 2), 60);
    for (const m of s.soldiers!) m.morale!.state = "broken";
    const red = makeInfantry("R", "RED", "squad", { x: 0, y: 400 }, 8);
    const watched = resolveMorale(context([s, red], new ScriptedRng([])));
    expect(watched.reports.find((r) => r.kind === "routed")!.seenBy).toEqual(["RED"]);
    s.routing = false;
    const blind = resolveMorale(context([s, red], new ScriptedRng([]), { watching: () => false }));
    expect(blind.reports.find((r) => r.kind === "routed")!.seenBy).toEqual([]);
  });

  it("with the knowledge model on, a side that never found the force is not told it ran", () => {
    const g = new Game({ seed: 21, morale: true, enforceC2: false, trackIntel: true });
    const blue = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 8));
    g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 250 }, 8));
    g.beginTurn();
    blue.soldiers!.slice(0, 5).forEach((s) => (s.morale!.state = "broken"));
    const { morale } = endTurn(g);
    expect(g.knows("RED", blue.id)).toBe(false);
    expect(morale.find((r) => r.kind === "routed")!.seenBy).toEqual([]);
  });

  it("a pinned team aims its RPG worse", () => {
    const g = new Game({ seed: 3, morale: true });
    const a = g.addUnit(makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 4));
    const t = g.addUnit(makeVehicle("T", "RED", { x: 0, y: 100 }));
    const clear = resolveDirectExplosive(new Rng(1), "rpgVsArmor", a, t);
    a.suppression = SUPPRESSION.pinned;
    const pinned = resolveDirectExplosive(new Rng(1), "rpgVsArmor", a, t);
    expect(pinned.hitChance).toBeCloseTo(clear.hitChance * 0.5, 10);
  });

  it("a broken force is set to nothing by the player: no scouting, no camouflage, no move once it gave up", () => {
    const g = new Game({ seed: 21, morale: true, enforceC2: false });
    const u = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 8));
    u.routing = true;
    expect(() => g.setScouting(u.id, true)).toThrow("routing");
    expect(() => g.setCamouflage(u.id, true)).toThrow("routing");
    u.routing = false;
    u.surrendered = true;
    u.neutralized = true;
    u.canOnlyRetreat = true; // as the attrition rule would set it later
    g.beginTurn();
    g.advanceToPhase("movement");
    expect(() => g.moveUnit(u.id, { x: 0, y: 10 })).toThrow("surrendered");
  });

  it("a pinned command group may be moved by hand, but only back", () => {
    const g = new Game({ seed: 21, morale: true, enforceC2: false });
    const hq = g.addUnit(makeCommandGroup("HQ", "BLUE", "platoon", { x: 0, y: 0 }));
    g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 200 }, 8));
    g.beginTurn();
    g.advanceToPhase("movement");
    hq.suppression = SUPPRESSION.pinned;
    expect(() => g.moveUnit(hq.id, { x: 0, y: 10 })).toThrow("pinned");
    g.moveUnit(hq.id, { x: 0, y: -20 });
    expect(hq.position.y).toBe(-20);
  });
});

describe("a prepared defender is steadier (author, 2026-09-23)", () => {
  /** A squad under fire, in position (in cover, has not moved) or not. */
  function underFire(inCover: boolean) {
    const u = dressed(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 2), 45);
    u.soldiers![0]!.leader = false;
    for (const s of u.soldiers!) s.traits!.charisma = 1;
    if (inCover) u.cover = "full";
    return u;
  }

  it("feels less of every loss", () => {
    const open = underFire(false);
    const dug = underFire(true);
    for (const u of [open, dug]) {
      const ctx = context([u], new ScriptedRng(Array(10).fill(1)));
      ctx.stress.firedOn(u, { kind: "indirect" }); // 1 + 5 = 6
      resolveMorale(ctx);
    }
    expect(open.soldiers![1]!.morale!.will).toBe(45 - 6);
    expect(dug.soldiers![1]!.morale!.will).toBe(45 - Math.round(6 * PREPARED.lossFactor));
  });

  it("passes a test it would have failed in the open", () => {
    // Wavering at 45 and due a test: the target is 45 + 30 + 10 = 85, and
    // +15 in position. A roll of 90 fails in the open and passes dug in.
    const open = underFire(false);
    const dug = underFire(true);
    resolveMorale(context([open], new ScriptedRng([90, 100, 90, 100])));
    resolveMorale(context([dug], new ScriptedRng([90, 90])));
    expect(open.soldiers!.every((s) => s.morale!.state === "broken")).toBe(true);
    expect(dug.soldiers!.every((s) => s.morale!.state !== "broken")).toBe(true);
  });

  it("is not in position once it moves", () => {
    const u = underFire(true);
    u.movedThisTurn = 30;
    const ctx = context([u], new ScriptedRng(Array(10).fill(1)));
    ctx.stress.firedOn(u, { kind: "indirect" });
    resolveMorale(ctx);
    expect(u.soldiers![1]!.morale!.will).toBe(45 - 6);
  });

  it("takes its size from the game when it is being measured", () => {
    const u = underFire(true);
    const ctx = context([u], new ScriptedRng(Array(10).fill(1)), { prepared: { testBonus: 0, lossFactor: 0.5 } });
    ctx.stress.firedOn(u, { kind: "indirect" });
    resolveMorale(ctx);
    expect(u.soldiers![1]!.morale!.will).toBe(45 - 3);
  });
});
