import { describe, it, expect } from "vitest";
import { CELL_KIND, ROOM, Rng, defaultDefence, generateFloorPlan, resolveInteriorFight, type FloorPlan } from "../engine/index.js";
import { RAMAT_MENASHE_OBJECTS } from "./maps/ramatMenasheObjects.js";

/**
 * The floor-plan generator (decision 96) on every real house of the demo
 * map — the footprints OpenStreetMap actually gives, bites and bays and
 * all, rather than the boxes the engine's own tests draw. A plan that
 * strands a room, has no way in, or skips its stairs fails here.
 */
const HOUSES = RAMAT_MENASHE_OBJECTS.filter((o) => o.kind === "building");

function walkable(plan: FloorPlan, level: number, start: readonly number[]): Uint8Array {
  const cells = plan.storeys[level]!.cells;
  const seen = new Uint8Array(cells.length);
  const queue = [...start];
  for (const i of start) seen[i] = 1;
  while (queue.length > 0) {
    const i = queue.pop()!;
    const x = i % plan.width;
    for (const j of [x > 0 ? i - 1 : -1, x < plan.width - 1 ? i + 1 : -1, i - plan.width, i + plan.width]) {
      if (j < 0 || j >= cells.length || seen[j]) continue;
      const k = cells[j]!;
      if (k !== CELL_KIND.floor && k !== CELL_KIND.stair && k !== CELL_KIND.door) continue;
      seen[j] = 1;
      queue.push(j);
    }
  }
  return seen;
}

describe("floor plans of the demo map's houses", () => {
  const plans = HOUSES.map((h) => generateFloorPlan(h, 1000));

  it("covers every house on the map", () => {
    expect(HOUSES.length).toBe(249);
    expect(plans.every((p) => p.storeys.length === 2)).toBe(true); // no house carries a height
  });

  it("gives every house a front door, a stairwell, and every room a way in", () => {
    for (const plan of plans) {
      expect(plan.outsideDoors.length, plan.buildingId).toBe(1);
      expect(plan.stairwell, plan.buildingId).not.toBeNull();
      for (const storey of plan.storeys) expect(storey.cutOff, plan.buildingId).toEqual([]);
      const s = plan.stairwell!;
      plan.storeys.forEach((storey, level) => {
        const reach = walkable(plan, level, level === 0 ? plan.outsideDoors : [s.y * plan.width + s.x]);
        storey.roomOf.forEach((room, i) => {
          if (room >= 0 && !reach[i]) throw new Error(`${plan.buildingId} storey ${level}: room ${room} cannot be reached`);
        });
      });
    }
  });

  it("cuts them into rooms of a dwelling's size", () => {
    const areas = plans.flatMap((p) => p.storeys.flatMap((s) => s.rooms.map((r) => r.areaM2))).sort((a, b) => a - b);
    const median = areas[Math.floor(areas.length / 2)]!;
    // 3-6 m rooms: 9 to 36 m², the stair's room and the footprint's odd corners aside.
    expect(median).toBeGreaterThanOrEqual(ROOM.minSideM ** 2);
    expect(median).toBeLessThanOrEqual(ROOM.maxSideM ** 2);
    // Odd corners of an irregular outline leave a few scraps (14 of 5,614
    // rooms under 2 m², 2026-10-16); they must stay a few.
    expect(areas.filter((a) => a < 2).length / areas.length).toBeLessThan(0.01);
    // A house wider than two rooms is cut; a shed of 6.5 by 5.5 m may be one room.
    for (const plan of plans) {
      if (Math.max(plan.width, plan.height) * plan.cellM <= 2 * ROOM.maxSideM + 1) continue;
      for (const storey of plan.storeys) expect(storey.rooms.length, plan.buildingId).toBeGreaterThanOrEqual(2);
    }
  });

  it("puts windows in every storey's outside wall", () => {
    for (const plan of plans)
      for (const storey of plan.storeys) expect(storey.cells.includes(CELL_KIND.window), plan.buildingId).toBe(true);
  });
});

describe("a squad clearing the demo map's houses (decision 96)", () => {
  it("takes about 20 minutes over a lightly held house, as the author ruled (2026-10-16)", () => {
    // 8 attackers by the front door against 1 defender, every 6th house of
    // the map. The full map gives 20.4 minutes (docs/balance.md); a sample
    // keeps the suite quick.
    const minutes = HOUSES.filter((_, k) => k % 6 === 0).map((h, k) => {
      const plan = generateFloorPlan(h, 1000);
      const rng = new Rng(1000 * 7919 + k);
      const defence = defaultDefence(plan, ["d1"], rng);
      const r = resolveInteriorFight({ plan, attack: { entry: "door", grenades: false, teams: [["a1", "a2", "a3", "a4"], ["a5", "a6", "a7", "a8"]] }, defence }, rng);
      return r.seconds / 60;
    }).sort((a, b) => a - b);
    const median = minutes[Math.floor(minutes.length / 2)]!;
    expect(median).toBeGreaterThan(15);
    expect(median).toBeLessThan(25);
  });
});
