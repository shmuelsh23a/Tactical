import { describe, it, expect } from "vitest";
import { distance } from "../geometry.js";
import { Game, LAY_CHARGE_REFUSAL } from "../game.js";
import { makeInfantry } from "../units.js";
import { sealRecording, verifyRecording } from "../recording.js";
import { Rng } from "../rng.js";
import type { MapObject } from "../terrain.js";
import { CLOSE_QUARTERS } from "../data/interior.js";
import { CHARGE_LAYING } from "../data/engineering.js";
import { GOES_INSIDE } from "./coupling.js";
import { CELL_KIND, FACINGS, breachCell, facingOf, generateFloorPlan, type Facing } from "./floorPlan.js";
import { InteriorFight } from "./resolver.js";

/**
 * A breach in a wall the player picks (decision 124): a force with charges
 * sets one against a face of the house in two turns, and goes in by it — the
 * blast stunning the room behind — instead of by the front door.
 */
const house = (storeys = 2): MapObject => ({
  id: "house",
  kind: "building",
  height: storeys * 3,
  footprint: { shape: "polygon", points: [{ x: 100, y: 100 }, { x: 116, y: 100 }, { x: 116, y: 112 }, { x: 100, y: 112 }] },
});
const OPPOSITE: Record<Facing, Facing> = { north: "south", south: "north", east: "west", west: "east" };

describe("where a breach goes", () => {
  // Seeds 1–20: twenty different room layouts of one house.
  it("is a wall a man can walk through, on the face it was asked for", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const plan = generateFloorPlan(house(), seed);
      for (const facing of FACINGS) {
        const cell = breachCell(plan, facing);
        expect(cell, `seed ${seed} ${facing}`).toBeDefined();
        expect(plan.storeys[0]!.cells[cell!]).toBe(CELL_KIND.wall);
        expect(facingOf(plan, cell!)).toBe(facing);
      }
    }
  });

  it("finds each face of a house turned 30° off the compass", () => {
    const turn = (p: { x: number; y: number }) => ({ x: 100 + (p.x - 100) * Math.cos(Math.PI / 6) - (p.y - 100) * Math.sin(Math.PI / 6), y: 100 + (p.x - 100) * Math.sin(Math.PI / 6) + (p.y - 100) * Math.cos(Math.PI / 6) });
    const h = house();
    const turned: MapObject = { ...h, footprint: { shape: "polygon", points: h.footprint.shape === "polygon" ? h.footprint.points.map(turn) : [] } };
    for (let seed = 1; seed <= 10; seed++) {
      const plan = generateFloorPlan(turned, seed);
      for (const facing of FACINGS) {
        const cell = breachCell(plan, facing);
        expect(cell, `seed ${seed} ${facing}`).toBeDefined();
        expect(facingOf(plan, cell!), `seed ${seed} ${facing}`).toBe(facing);
      }
    }
  });
});

describe("going in by the breach (decision 124)", () => {
  const squad = [["a1", "a2", "a3", "a4"], ["a5", "a6", "a7", "a8"]];

  /** A plan with the hole blown on a face, and a defender in the room behind it. */
  function holed(seed: number, facing: Facing) {
    const plan = generateFloorPlan(house(), seed);
    const cell = breachCell(plan, facing)!;
    plan.storeys[0]!.cells[cell] = CELL_KIND.door;
    const w = plan.width, roomOf = plan.storeys[0]!.roomOf;
    const behind = [cell - 1, cell + 1, cell - w, cell + w].map((j) => roomOf[j]!).find((r) => r >= 0)!;
    const post = roomOf.findIndex((r, i) => r === behind && plan.storeys[0]!.cells[i] === CELL_KIND.floor);
    return { plan, cell, post };
  }

  // The seeds below are any layouts; nothing depends on which.
  it("stuns the room behind the wall as a grenade does, when it is blown as they go in", () => {
    const { plan, cell, post } = holed(3, "north");
    const blown = new InteriorFight({ plan, attack: { entry: "door", grenades: false, teams: squad, breach: cell, blast: true }, defence: [{ id: "d1", storey: 0, cell: post }] }, new Rng(1));
    expect(blown.soldiers.find((m) => m.id === "d1")!.stunnedUntil).toBe(CLOSE_QUARTERS.stunSeconds);
    const old = new InteriorFight({ plan, attack: { entry: "door", grenades: false, teams: squad, breach: cell }, defence: [{ id: "d1", storey: 0, cell: post }] }, new Rng(1));
    expect(old.soldiers.find((m) => m.id === "d1")!.stunnedUntil).toBe(0);
  });

  it("starts the attackers outside the hole, not the front door", () => {
    const { plan, cell } = holed(4, "east");
    const f = new InteriorFight({ plan, attack: { entry: "door", grenades: false, teams: squad, breach: cell }, defence: [] }, new Rng(1));
    const w = plan.width, at = f.soldiers.find((m) => m.id === "a1")!.cell;
    expect([cell - 1, cell + 1, cell - w, cell + w]).toContain(at);
    expect(f.result().outcome === "cleared" || !f.finished).toBe(true);
  });

  it("refuses a hole that is not one", () => {
    const plan = generateFloorPlan(house(), 5);
    const cell = breachCell(plan, "west")!; // still a wall
    expect(() => new InteriorFight({ plan, attack: { entry: "door", grenades: false, teams: squad, breach: cell }, defence: [] }, new Rng(1))).toThrow(/breach/);
  });
});

describe("a breaching charge in play (decision 124)", () => {
  /** R-1 in the house; B-1, trained for charges, 10 m out from the face opposite the door. Any seed: the face is found from the plan. */
  function battle(seed: number) {
    const h = house();
    const g = new Game({ seed, enforceC2: false, terrain: { objects: [h] } });
    g.addUnit(makeInfantry("R-1", "RED", "squad", { x: 108, y: 106 }, 6));
    const plan = g.interior.plan(g, h);
    const facing = OPPOSITE[facingOf(plan, plan.outsideDoors[0]!)!];
    const wall = g.interior.breachPoint(g, h, facing)!;
    const dx = wall.x - 108, dy = wall.y - 106, d = Math.hypot(dx, dy);
    const b = makeInfantry("B-1", "BLUE", "squad", { x: wall.x + (10 * dx) / d, y: wall.y + (10 * dy) / d }, 8);
    b.canLayCharges = true;
    g.addUnit(b);
    g.beginTurn();
    g.advanceToPhase("movement");
    return { g, h, facing };
  }

  it("is set in two turns, then gone in by, blown as the side goes in", () => {
    const { g, h, facing } = battle(1);
    const cell = breachCell(g.interior.plan(g, h), facing); // before the hole is blown in it
    expect(cell).toBeDefined();
    g.layCharge("B-1", "breach", { buildingId: "house", facing });
    for (let t = 0; t < CHARGE_LAYING.turnsToLay; t++) { g.advanceToPhase("summary"); g.advanceToPhase("initiative"); }
    expect(g.interior.breachIn("house")).toEqual({ side: "BLUE", facing, blown: false });
    expect(g.getUnit("B-1").layingCharge).toBeUndefined();
    g.advanceToPhase("combat");
    expect(g.assault("B-1", "R-1", 0).reason).toBe(GOES_INSIDE);
    // The force goes to the hole, not the front door, and the fight starts there.
    const hole = g.interior.breachPoint(g, h, facing)!;
    expect(distance(g.getUnit("B-1").position, hole)).toBeLessThan(1);
    g.advanceToPhase("initiative");
    expect(g.interior.breachIn("house")!.blown).toBe(true);
    const e = g.interior.engagements[0]!;
    expect(e.way).toEqual(hole);
    expect(g.interior.plan(g, h).storeys[0]!.cells[cell!]).toBe(CELL_KIND.door);
    const sealed = JSON.parse(JSON.stringify(sealRecording(g.toRecording())));
    expect(verifyRecording(sealed)).toEqual({ checked: true, ok: true });
  });

  it("is refused out of the assault's reach of the wall, on no house, and to a force not trained for it", () => {
    const { g, facing } = battle(2);
    expect(() => g.layCharge("B-1", "breach", { buildingId: "nowhere", facing })).toThrow(LAY_CHARGE_REFUSAL.noBuilding);
    const b = g.getUnit("B-1");
    const near = b.position;
    b.position = { x: near.x + 40 * Math.sign(near.x - 108), y: near.y + 40 * Math.sign(near.y - 106) };
    expect(() => g.layCharge("B-1", "breach", { buildingId: "house", facing })).toThrow(LAY_CHARGE_REFUSAL.tooFar);
    b.position = near;
    expect(() => g.layCharge("B-1", "breach", { buildingId: "house", facing: "up" as Facing })).toThrow(LAY_CHARGE_REFUSAL.noWall);
    g.getUnit("B-1").canLayCharges = false;
    expect(() => g.layCharge("B-1", "breach", { buildingId: "house", facing })).toThrow(LAY_CHARGE_REFUSAL.untrained);
  });

  it("is one a house: refused once a charge is set, by either side, and to a force inside", () => {
    const { g, facing } = battle(3);
    g.layCharge("B-1", "breach", { buildingId: "house", facing });
    for (let t = 0; t < CHARGE_LAYING.turnsToLay; t++) { g.advanceToPhase("summary"); g.advanceToPhase("initiative"); }
    g.advanceToPhase("movement");
    expect(() => g.layCharge("B-1", "breach", { buildingId: "house", facing: OPPOSITE[facing] })).toThrow(LAY_CHARGE_REFUSAL.alreadyBreached);
    const red = g.getUnit("R-1");
    red.canLayCharges = true;
    expect(() => g.layCharge("R-1", "breach", { buildingId: "house", facing })).toThrow(LAY_CHARGE_REFUSAL.alreadyBreached);
  });

  it("is not set from inside the house", () => {
    const { g, facing } = battle(4);
    const red = g.getUnit("R-1");
    red.canLayCharges = true;
    expect(() => g.layCharge("R-1", "breach", { buildingId: "house", facing })).toThrow(LAY_CHARGE_REFUSAL.insideIt);
  });
});
