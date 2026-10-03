import { describe, it, expect } from "vitest";
import { Game, type GameOptions } from "./game.js";
import { makeInfantry, makeVehicle } from "./units.js";
import { replayGame } from "./recording.js";
import { coverFromObjects, stateOfStructure, terrainBlocksSight, underRoof, type MapObject, type Terrain } from "./terrain.js";
import { Rng } from "./rng.js";
import { resolveArmorHit } from "./combat/armorDamage.js";
import { resolveDirectExplosive } from "./combat/explosives.js";
import { resolveIndirectFire } from "./combat/indirectFire.js";
import { ENCLOSED_BLAST_FACTOR, STRUCTURE_DAMAGE, STRUCTURE_POINTS } from "./data/structures.js";
import { PENETRATION, armourFacing } from "./data/armor.js";

/** A 10 × 10 m house, the reference size, with its south wall on y = 100. */
const HOUSE: MapObject = {
  id: "house",
  kind: "building",
  footprint: { shape: "polygon", points: [{ x: -5, y: 100 }, { x: 5, y: 100 }, { x: 5, y: 110 }, { x: -5, y: 110 }] },
};
const GROUND: Terrain = { objects: [HOUSE] };

/** A RED tank and a BLUE squad inside the house, in the fire phase. */
function setUp(opts: Partial<GameOptions> = {}) {
  const g = new Game({ lethality: "document", seed: 1, enforceC2: false, terrain: GROUND, ...opts });
  const tank = g.addUnit(makeVehicle("T", "RED", { x: 0, y: -200 }));
  const blue = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 105 }, 8));
  g.beginTurn();
  g.advanceToPhase("combat");
  return { g, tank, blue };
}

describe("buildings under fire (decision 76)", () => {
  it("are intact, damaged at one tank round, rubble at ten; a larger house takes more", () => {
    expect(stateOfStructure(HOUSE, 0)).toBe("intact");
    expect(stateOfStructure(HOUSE, STRUCTURE_DAMAGE.tankRound!)).toBe("damaged");
    expect(stateOfStructure(HOUSE, STRUCTURE_POINTS.rubble - 1)).toBe("damaged");
    expect(stateOfStructure(HOUSE, STRUCTURE_POINTS.rubble)).toBe("rubble");
    const big: MapObject = { ...HOUSE, footprint: { shape: "circle", center: { x: 0, y: 0 }, radius: 20 } };
    // About twelve times the reference house: what brings a house down only damages it.
    expect(stateOfStructure(big, STRUCTURE_POINTS.rubble)).toBe("intact");
    expect(stateOfStructure(big, STRUCTURE_POINTS.rubble * 2)).toBe("damaged");
  });

  it("a tank round that hits a force in a house damages the house, and the live map shows it", () => {
    const { g, tank, blue } = setUp({ criticalHits: false });
    const r = g.fireExplosive("tankRound", tank.id, blue.id);
    expect(r.hit).toBe(true); // seed 1: 90% at 305 m on the document's table
    expect(r.structure).toEqual({ objectId: "house", state: "damaged", changed: true });
    expect(g.structureState("house")).toBe("damaged");
    // A damaged house is still full cover, but its roof is holed.
    expect(coverFromObjects(g.terrain, blue.position)).toBe("full");
    expect(underRoof(g.terrain, blue.position)).toBe(false);
    // The map the battle was set on is untouched, and is what is recorded.
    expect(g.mapTerrain.objects[0]).toBe(HOUSE);
    expect(g.toRecording().terrain!.objects[0]!.kind).toBe("building");
  });

  it("rubble is full cover with no roof, and lower for sight lines", () => {
    const { g, tank, blue } = setUp({ criticalHits: false });
    for (let shot = 0; shot < 30 && g.structureState("house") !== "rubble"; shot++) {
      tank.firedThisTurn = false;
      g.fireExplosive("tankRound", tank.id, blue.id, { hasLineOfSight: true });
    }
    expect(g.structureState("house")).toBe("rubble");
    expect(g.terrain.objects[0]!.kind).toBe("rubble");
    expect(coverFromObjects(g.terrain, blue.position)).toBe("full");
    expect(underRoof(g.terrain, blue.position)).toBe(false);
    // A vehicle behind it is seen over 2 m of rubble; it was not over a two-storey house.
    const behind = { x: 0, y: 130 };
    expect(terrainBlocksSight(GROUND, { x: 0, y: 0 }, 2.5, behind, 2.5)).toBe(true);
    expect(terrainBlocksSight(g.terrain, { x: 0, y: 0 }, 2.5, behind, 2.5)).toBe(false);
  });

  it("does nothing to a house when off, and replays an old recording off", () => {
    const { g, tank, blue } = setUp({ structuresTakeDamage: false, criticalHits: false });
    expect(g.fireExplosive("tankRound", tank.id, blue.id).structure).toBeUndefined();
    expect(g.structureState("house")).toBe("intact");
    const rec = g.toRecording();
    delete (rec as { structuresTakeDamage?: boolean }).structuresTakeDamage;
    delete (rec as { criticalHits?: boolean }).criticalHits;
    delete (rec as { armour?: string }).armour;
    const old = replayGame(rec);
    expect([old.structuresTakeDamage, old.criticalHits, old.armour]).toEqual([false, false, "document"]);
    const fresh = new Game({ seed: 1 });
    expect([fresh.structuresTakeDamage, fresh.criticalHits, fresh.armour]).toEqual([true, true, "research"]);
  });

  it("replays a battle that brought a house down to the same map", () => {
    const { g, tank, blue } = setUp();
    for (let shot = 0; shot < 12; shot++) {
      tank.firedThisTurn = false;
      g.fireExplosive("tankRound", tank.id, blue.id, { hasLineOfSight: true });
    }
    const replayed = replayGame(g.toRecording());
    expect(replayed.structureState("house")).toBe(g.structureState("house"));
    expect(replayed.terrain).toEqual(g.terrain);
    expect(replayed.rng.getState()).toBe(g.rng.getState());
  });
});

describe("critical hits (decision 77)", () => {
  it("a round in through the window bursts among the men at the enclosed factor", () => {
    const firer = makeVehicle("T", "RED", { x: 0, y: -200 });
    const inHouse = () => makeInfantry("B", "BLUE", "squad", { x: 0, y: 105 }, 8);
    const always = { chance: 1, factor: ENCLOSED_BLAST_FACTOR };
    const r = resolveDirectExplosive(new Rng(1), "tankRound", firer, inHouse(), { critical: always, shell: { factorFor: () => 0.02, airburst: false } });
    expect(r.criticals).toBe(1);
    expect(r.blast!.targets[0]!.blastChance).toBe(Math.min(1, 0.5 * ENCLOSED_BLAST_FACTOR));
    const never = resolveDirectExplosive(new Rng(1), "tankRound", firer, inHouse(), { critical: { chance: 0, factor: 9 }, shell: { factorFor: () => 0.02, airburst: false } });
    expect(never.criticals).toBeUndefined();
    expect(never.blast!.targets[0]!.blastChance).toBe(0.5 * 0.02);
  });

  it("a force in a house or a prepared position can take one; a force in the open cannot", () => {
    let windows = 0;
    let slits = 0;
    let open = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const g = new Game({ lethality: "document", seed, enforceC2: false, terrain: GROUND, structuresTakeDamage: false });
      const tank = g.addUnit(makeVehicle("T", "RED", { x: 0, y: -200 }));
      const house = g.addUnit(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 105 }, 8));
      const dugIn = makeInfantry("B2", "BLUE", "squad", { x: 200, y: 105 }, 8);
      dugIn.baseCover = "full";
      g.addUnit(dugIn);
      const field = g.addUnit(makeInfantry("B3", "BLUE", "squad", { x: -200, y: 105 }, 8));
      g.beginTurn();
      g.advanceToPhase("combat");
      for (const [target, add] of [[house, (n: number) => (windows += n)], [dugIn, (n: number) => (slits += n)], [field, (n: number) => (open += n)]] as const) {
        tank.firedThisTurn = false;
        add(g.fireExplosive("tankRound", tank.id, target.id, { hasLineOfSight: true }).criticals ?? 0);
      }
    }
    // At about 300 m: a window 85% of hits, a slit 40%.
    expect(windows).toBeGreaterThan(slits);
    expect(slits).toBeGreaterThan(0);
    expect(open).toBe(0);
  });

  it("a shell can go through the roof of the house it lands on; an air burst cannot", () => {
    const inHouse = makeInfantry("B", "BLUE", "squad", { x: 0, y: 105 }, 8);
    const roof = { chance: 1, factor: ENCLOSED_BLAST_FACTOR, inside: () => true };
    const r = resolveIndirectFire(new Rng(1), "artillery", { x: 0, y: 105 }, [inHouse], {
      cepM: 0,
      underRoof: () => true,
      criticalAt: () => roof,
    });
    expect(r.critical).toBe(true);
    const air = resolveIndirectFire(new Rng(1), "artillery", { x: 0, y: 105 }, [inHouse], {
      cepM: 0,
      fuze: "airburst",
      underRoof: () => true,
      criticalAt: () => roof,
    });
    expect(air.critical).toBeUndefined();
  });
});

describe("armour by weapon, class and facing (decision 78)", () => {
  it("reads the side struck from the hull's heading", () => {
    expect(armourFacing(0, 0)).toBe("front");
    expect(armourFacing(0, 90)).toBe("side");
    expect(armourFacing(0, 180)).toBe("rear");
    expect(armourFacing(350, 20)).toBe("front");
  });

  it("an RPG rarely goes through a tank's front and nearly always through its rear", () => {
    const rate = (from: { x: number; y: number }, cls?: "lightApc") => {
      let pen = 0;
      const n = 4000;
      const rng = new Rng(7);
      for (let i = 0; i < n; i++) {
        const v = makeVehicle("V", "BLUE", { x: 0, y: 0 }, 0, "V", cls);
        if (resolveArmorHit(rng, v, "turret", { weapon: "rpgVsArmor", from }).penetrated) pen++;
      }
      return pen / n;
    };
    expect(rate({ x: 300, y: 0 })).toBeCloseTo(PENETRATION.rpgVsArmor!.mbt.front, 1);
    expect(rate({ x: -300, y: 0 })).toBeCloseTo(PENETRATION.rpgVsArmor!.mbt.rear, 1);
    expect(rate({ x: 300, y: 0 }, "lightApc")).toBe(1);
  });

  it("the document's table is untouched without the research figures", () => {
    let pen = 0;
    const rng = new Rng(7);
    for (let i = 0; i < 4000; i++) {
      if (resolveArmorHit(rng, makeVehicle("V", "BLUE", { x: 0, y: 0 }), "turret").penetrated) pen++;
    }
    expect(pen / 4000).toBeCloseTo(0.2, 1);
  });

  it("a vehicle turns to face the way it drove", () => {
    const g = new Game({ seed: 1, enforceC2: false });
    const v = g.addUnit(makeVehicle("V", "RED", { x: 0, y: 0 }, 0));
    g.beginTurn();
    g.advanceToPhase("movement");
    g.moveUnit(v.id, { x: 0, y: 50 });
    expect(v.vehicle!.facing).toBe(90);
  });
});

describe("the review's fixes (decisions 76–78)", () => {
  it("an anti-tank mine reads the research figures: an M113's belly gives far more often", async () => {
    const { triggerMines } = await import("./combat/mines.js");
    const rate = (armour: "document" | "research") => {
      let pen = 0;
      const n = 2000;
      const rng = new Rng(3);
      for (let i = 0; i < n; i++) {
        const apc = makeVehicle("V", "BLUE", { x: 0, y: 0 }, 0, "V", "lightApc");
        const mine = { id: "m", side: "RED" as const, type: "antiTank" as const, position: { x: 0, y: 0 }, armed: true, detected: false };
        const { detonations } = triggerMines(rng, apc, { x: 0, y: -20 }, { x: 0, y: 20 }, [mine], [apc], 0, armour);
        if (detonations[0]?.blast?.targets[0]?.armorEffect?.penetrated) pen++;
      }
      return pen / n;
    };
    expect(rate("research")).toBeGreaterThan(0.25);
    expect(rate("document")).toBeLessThan(rate("research") / 2);
  });

  it("a vehicle falling back keeps its front to the enemy", () => {
    const g = new Game({ seed: 1, enforceC2: false });
    const v = g.addUnit(makeVehicle("V", "RED", { x: 0, y: 0 }, 0));
    g.beginTurn();
    g.advanceToPhase("movement");
    expect(g.setStandingOrder(v.id, { destination: { x: -50, y: 0 }, gait: "normal", withdraw: true })).toBe(true);
    g.executeStandingOrders("RED");
    expect(v.position.x).toBeLessThan(0);
    expect(v.vehicle!.facing).toBe(0);
  });

  it("an air burst leaves the roof it bursts over alone", () => {
    // A building so large every round lands on it, so each round reports it.
    const hall: MapObject = { id: "hall", kind: "building", footprint: { shape: "circle", center: { x: 0, y: 0 }, radius: 2000 } };
    const struck = (fuze: "impact" | "airburst") => {
      const g = new Game({ seed: 2, enforceC2: false, terrain: { objects: [hall] }, commandEchelon: { RED: "battalion", BLUE: "battalion" } });
      g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: -3000 }, 8));
      g.beginTurn();
      g.advanceToPhase("targeting");
      g.queueIndirectFire("artillery", "RED", { x: 0, y: 0 }, { rounds: 4, fuze });
      // Artillery lands two turns after it is called.
      let landed = 0;
      for (let turn = 0; turn < 3; turn++) {
        g.advanceToPhase("summary");
        g.advanceToPhase("initiative");
        const { resolved } = g.advanceToPhase("resolvePriorArty");
        landed += (resolved ?? []).filter((r) => r.structure).length;
      }
      return landed;
    };
    expect(struck("impact")).toBeGreaterThan(0);
    expect(struck("airburst")).toBe(0);
  });

  it("a command group in a house takes no critical hit: it has no blast to amplify", async () => {
    const { makeCommandGroup } = await import("./units.js");
    let criticals = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const g = new Game({ lethality: "document", seed, enforceC2: false, terrain: GROUND, structuresTakeDamage: false });
      const tank = g.addUnit(makeVehicle("T", "RED", { x: 0, y: -200 }));
      const hq = g.addUnit(makeCommandGroup("HQ", "BLUE", "platoon", { x: 0, y: 105 }));
      g.beginTurn();
      g.advanceToPhase("combat");
      criticals += g.fireExplosive("tankRound", tank.id, hq.id, { hasLineOfSight: true }).criticals ?? 0;
    }
    expect(criticals).toBe(0);
  });

  it("refuses a recording with a vehicle of no known class", async () => {
    const { RecordingError } = await import("./recording.js");
    const g = new Game({ seed: 1, enforceC2: false });
    g.addUnit(makeVehicle("V", "RED", { x: 0, y: 0 }, 0, "V", "heavyApc"));
    const rec = JSON.parse(JSON.stringify(g.toRecording()));
    expect(() => replayGame(rec)).not.toThrow();
    rec.actions[0].unit.vehicle.vehicleClass = "hovercraft";
    expect(() => replayGame(rec)).toThrow(RecordingError);
  });
});
