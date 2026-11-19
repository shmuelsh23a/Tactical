import { describe, it, expect } from "vitest";
import { GOES_INSIDE, Game, INTERIOR_REFUSAL, makeInfantry, type MapObject } from "../engine/index.js";
import { untargetableInside } from "./insideTargets.js";

/**
 * The map marks as a target only what the engine lets the selected force
 * take on (the UX pass, 2026-10-20): the enemy it fights inside a building
 * is not one (decision 98).
 */
const house: MapObject = {
  id: "house",
  kind: "building",
  height: 6,
  footprint: { shape: "polygon", points: [{ x: 100, y: 100 }, { x: 116, y: 100 }, { x: 116, y: 112 }, { x: 100, y: 112 }] },
};

/** Seed 1 (as the coupling tests): B-1 goes in by the front door against R-1; R-2 stands outside; the fight is on into the next turn's fire phase. */
function inside(windowFire: boolean) {
  const g = new Game({ seed: 1, enforceC2: false, terrain: { objects: [house] }, windowFire });
  g.addUnit(makeInfantry("R-1", "RED", "squad", { x: 108, y: 106 }, 4));
  g.addUnit(makeInfantry("R-2", "RED", "squad", { x: 160, y: 106 }, 4));
  const door = g.interior.frontDoor(g, house)!;
  const dx = door.x - 108, dy = door.y - 106, d = Math.hypot(dx, dy);
  g.addUnit(makeInfantry("B-1", "BLUE", "squad", { x: door.x + (10 * dx) / d, y: door.y + (10 * dy) / d }, 8));
  g.beginTurn();
  g.advanceToPhase("combat");
  const before = untargetableInside(g, g.getUnit("B-1"), "fire", g.units);
  expect(g.assault("B-1", "R-1", 0).reason).toBe(GOES_INSIDE);
  g.advanceToPhase("initiative");
  g.advanceToPhase("combat");
  expect(g.interior.inFight("B-1")).toBe(true);
  return { g, before };
}

describe("the enemy fought inside, on the map (decision 98)", () => {
  it("marks every enemy while the selected force is not fighting inside", () => {
    const { before } = inside(true);
    expect([...before]).toEqual([]);
  });

  it("does not mark the enemy it fights room by room, and marks the one outside, as the engine fires", () => {
    const { g } = inside(true);
    const b1 = g.getUnit("B-1");
    expect([...untargetableInside(g, b1, "fire", g.units)]).toEqual(["R-1"]);
    expect(g.fire("B-1", "R-1", { weapon: "smallArms" }).reason).toBe(INTERIOR_REFUSAL.fightingInside);
    expect(g.fire("B-1", "R-2", { weapon: "smallArms" }).reason).not.toBe(INTERIOR_REFUSAL.fightingInside);
  });

  it("marks none for an assault, nor for fire when nobody fires from the windows", () => {
    const { g } = inside(true);
    expect([...untargetableInside(g, g.getUnit("B-1"), "assault", g.units)].sort()).toEqual(["R-1", "R-2"]);
    expect(g.assault("B-1", "R-2", 0).reason).toBe(INTERIOR_REFUSAL.fightingInside);
    const shut = inside(false).g;
    expect([...untargetableInside(shut, shut.getUnit("B-1"), "fire", shut.units)].sort()).toEqual(["R-1", "R-2"]);
    expect(shut.fire("B-1", "R-2", { weapon: "smallArms" }).reason).toBe(INTERIOR_REFUSAL.fightingInside);
  });

  it("marks an enemy fighting in another building: the same fight is refused, not any fight", () => {
    // Seed 1, a second house 100 m east: B-2 goes into it against R-3 as B-1 goes into the first.
    const far: MapObject = { ...house, id: "far", footprint: { shape: "polygon", points: [{ x: 200, y: 100 }, { x: 216, y: 100 }, { x: 216, y: 112 }, { x: 200, y: 112 }] } };
    const g = new Game({ seed: 1, enforceC2: false, terrain: { objects: [house, far] } });
    g.addUnit(makeInfantry("R-1", "RED", "squad", { x: 108, y: 106 }, 4));
    g.addUnit(makeInfantry("R-3", "RED", "squad", { x: 208, y: 106 }, 4));
    const at = (h: MapObject, id: string, cx: number) => {
      const door = g.interior.frontDoor(g, h)!;
      const dx = door.x - cx, dy = door.y - 106, d = Math.hypot(dx, dy);
      g.addUnit(makeInfantry(id, "BLUE", "squad", { x: door.x + (10 * dx) / d, y: door.y + (10 * dy) / d }, 8));
    };
    at(house, "B-1", 108);
    at(far, "B-2", 208);
    g.beginTurn();
    g.advanceToPhase("combat");
    expect(g.assault("B-1", "R-1", 0).reason).toBe(GOES_INSIDE);
    expect(g.assault("B-2", "R-3", 0).reason).toBe(GOES_INSIDE);
    g.advanceToPhase("initiative");
    g.advanceToPhase("combat");
    expect(g.interior.inFight("B-1") && g.interior.inFight("R-3")).toBe(true);
    expect(g.interior.engagementOf("R-3")).not.toBe(g.interior.engagementOf("B-1"));
    expect(untargetableInside(g, g.getUnit("B-1"), "fire", g.units).has("R-3")).toBe(false);
    expect(g.fire("B-1", "R-3", { weapon: "smallArms" }).reason).not.toBe(INTERIOR_REFUSAL.fightingInside);
  });

  it("leaves a friendly force and no selection alone", () => {
    const { g } = inside(true);
    expect(untargetableInside(g, null, "fire", g.units).size).toBe(0);
    expect(untargetableInside(g, g.getUnit("B-1"), "fire", g.units).has("B-1")).toBe(false);
  });
});
