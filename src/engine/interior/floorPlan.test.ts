import { describe, it, expect } from "vitest";
import { CELL_KIND, buildingStoreys, diamondAngle, generateFloorPlan, joinRooms, squareRoot, type FloorPlan } from "./floorPlan.js";
import { DEFAULT_STOREYS, INTERIOR_CELL_M, ROOM } from "../data/interior.js";
import type { MapObject } from "../terrain.js";

const box = (id: string, w: number, h: number, height?: number): MapObject => ({
  id,
  kind: "building",
  footprint: { shape: "polygon", points: [{ x: 100, y: 100 }, { x: 100 + w, y: 100 }, { x: 100 + w, y: 100 + h }, { x: 100, y: 100 + h }] },
  ...(height === undefined ? {} : { height }),
});

/** An L of 20 by 16 m with a 10 by 8 m bite out of a corner. */
const ell: MapObject = {
  id: "ell",
  kind: "building",
  footprint: {
    shape: "polygon",
    points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 8 }, { x: 10, y: 8 }, { x: 10, y: 16 }, { x: 0, y: 16 }],
  },
};

/** Every cell a man can walk to on a storey from `start`, through floor, stairs and doors. */
function walkable(plan: FloorPlan, level: number, start: readonly number[]): Set<number> {
  const cells = plan.storeys[level]!.cells;
  const passable = (k: number) => k === CELL_KIND.floor || k === CELL_KIND.stair || k === CELL_KIND.door;
  const seen = new Set<number>(start);
  const queue = [...start];
  while (queue.length > 0) {
    const i = queue.pop()!;
    const x = i % plan.width;
    const next = [x > 0 ? i - 1 : -1, x < plan.width - 1 ? i + 1 : -1, i - plan.width, i + plan.width];
    for (const j of next) {
      if (j < 0 || j >= cells.length || seen.has(j) || !passable(cells[j]!)) continue;
      seen.add(j);
      queue.push(j);
    }
  }
  return seen;
}

/** The cells of every room on a storey. */
function roomCells(plan: FloorPlan, level: number): number[] {
  const out: number[] = [];
  plan.storeys[level]!.roomOf.forEach((r, i) => { if (r >= 0) out.push(i); });
  return out;
}

/** `box("h1", 16, 12)` at seed 1000, pinned 2026-10-16. */
const GOLDEN = { hash: 1017294444, origin: { x: 99.5, y: 99.5 }, axis: { x: 1, y: 0 }, doors: [829] };

describe("a building's floor plan (decision 96)", () => {
  it("is the same plan for the same building in the same game, and another in another game", () => {
    const a = generateFloorPlan(box("h1", 16, 12), 1000);
    const b = generateFloorPlan(box("h1", 16, 12), 1000);
    expect(b).toEqual(a);
    const other = generateFloorPlan(box("h1", 16, 12), 1001);
    expect(other.storeys.map((s) => [...s.cells])).not.toEqual(a.storeys.map((s) => [...s.cells]));
  });

  it("depends on the building's id, so two identical houses are not twins", () => {
    const a = generateFloorPlan(box("h1", 16, 12), 1000);
    const b = generateFloorPlan(box("h2", 16, 12), 1000);
    expect(b.storeys.map((s) => [...s.cells])).not.toEqual(a.storeys.map((s) => [...s.cells]));
  });

  it("takes its storeys from the map's height, and two when the map says nothing", () => {
    expect(DEFAULT_STOREYS).toBe(2);
    expect(buildingStoreys(box("h", 10, 10))).toBe(2);
    expect(buildingStoreys(box("h", 10, 10, 12))).toBe(4);
    expect(buildingStoreys(box("h", 10, 10, 1))).toBe(1);
    expect(generateFloorPlan(box("h", 16, 12, 9), 7).storeys).toHaveLength(3);
  });

  it("joins every storey at the same stairwell", () => {
    const plan = generateFloorPlan(box("h1", 16, 12, 9), 5);
    const s = plan.stairwell!;
    expect(s).not.toBeNull();
    for (const storey of plan.storeys) {
      for (let y = s.y; y < s.y + s.h; y++)
        for (let x = s.x; x < s.x + s.w; x++) expect(storey.cells[y * plan.width + x]).toBe(CELL_KIND.stair);
      expect(storey.rooms.filter((r) => r.stair)).toHaveLength(1);
    }
  });

  it("gives a one-storey building no stairwell", () => {
    const plan = generateFloorPlan(box("h1", 16, 12, 3), 5);
    expect(plan.storeys).toHaveLength(1);
    expect(plan.stairwell).toBeNull();
    expect(plan.storeys[0]!.cells.includes(CELL_KIND.stair)).toBe(false);
  });

  it("lets a man reach every room from the front door, and every upper room from the stairs", () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const building of [box(`b${seed}`, 16, 12), box(`w${seed}`, 24, 9), ell]) {
        const plan = generateFloorPlan(building, seed);
        expect(plan.outsideDoors).toHaveLength(1);
        const fromDoor = walkable(plan, 0, plan.outsideDoors);
        for (const i of roomCells(plan, 0)) expect(fromDoor.has(i)).toBe(true);
        for (let level = 1; level < plan.storeys.length; level++) {
          const s = plan.stairwell!;
          const fromStairs = walkable(plan, level, [s.y * plan.width + s.x]);
          for (const i of roomCells(plan, level)) expect(fromStairs.has(i)).toBe(true);
        }
      }
    }
  });

  it("cuts a square house into rooms of 3 to 6 m a side, measured on the floor", () => {
    const maxSide = ROOM.maxSideM / INTERIOR_CELL_M, minSide = ROOM.minSideM / INTERIOR_CELL_M;
    for (let seed = 1; seed <= 20; seed++) {
      const plan = generateFloorPlan(box(`h${seed}`, 16, 12), seed);
      for (const storey of plan.storeys) {
        expect(storey.rooms.length).toBeGreaterThan(2);
        for (const room of storey.rooms) {
          let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
          storey.roomOf.forEach((r, i) => {
            if (r !== room.id) return;
            const x = i % plan.width, y = (i - x) / plan.width;
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
          });
          const across = Math.min(x1 - x0 + 1, y1 - y0 + 1), along = Math.max(x1 - x0 + 1, y1 - y0 + 1);
          expect(across).toBeGreaterThanOrEqual(minSide);
          // The stairwell's room may run longer, since no cut may pass through the stairs.
          if (!room.stair) expect(along).toBeLessThanOrEqual(maxSide);
        }
      }
    }
  });

  it("joins a room no cut gave a door, through an inner wall and never the outside one", () => {
    // Two rooms of 3 by 3 cells side by side, an inner wall between them and no door.
    //   #######
    //   #...X...#   (X: the inner wall column)
    const width = 9, height = 5;
    const cells = new Uint8Array(width * height).fill(CELL_KIND.wall);
    const roomOf = new Int32Array(width * height).fill(-1);
    for (let y = 1; y <= 3; y++)
      for (let x = 1; x <= 7; x++) {
        if (x === 4) continue;
        cells[y * width + x] = CELL_KIND.floor;
        roomOf[y * width + x] = x < 4 ? 0 : 1;
      }
    const outer = new Uint8Array(width * height);
    expect(joinRooms(cells.slice(), roomOf, 2, width, height, outer, [0])).toBe(1);
    const joined = cells.slice();
    joinRooms(joined, roomOf, 2, width, height, outer, [0]);
    expect(joined[1 * width + 4]).toBe(CELL_KIND.door); // the first in reading order
    // Call the dividing column outside wall, and nothing may be opened.
    for (let y = 0; y < height; y++) outer[y * width + 4] = 1;
    expect(joinRooms(cells.slice(), roomOf, 2, width, height, outer, [0])).toBe(0);
  });

  it("gives a wing joined by a thin neck its own front door, and says which rooms upstairs it cuts off", () => {
    // Two 10 m blocks joined by a 1 m neck, which is outside wall all through.
    const dumbbell: MapObject = {
      id: "dumbbell",
      kind: "building",
      footprint: {
        shape: "polygon",
        points: [
          { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4.5 }, { x: 14, y: 4.5 }, { x: 14, y: 0 }, { x: 24, y: 0 },
          { x: 24, y: 10 }, { x: 14, y: 10 }, { x: 14, y: 5.5 }, { x: 10, y: 5.5 }, { x: 10, y: 10 }, { x: 0, y: 10 },
        ],
      },
    };
    for (let seed = 1; seed <= 10; seed++) {
      const plan = generateFloorPlan(dumbbell, seed);
      expect(plan.outsideDoors.length).toBe(2);
      expect(plan.storeys[0]!.cutOff).toEqual([]);
      const reach = walkable(plan, 0, plan.outsideDoors);
      plan.storeys[0]!.roomOf.forEach((r, i) => { if (r >= 0) expect(reach.has(i)).toBe(true); });
      // One stairwell, in one block: the other block's upper rooms cannot be reached, and are listed.
      const upstairs = plan.storeys[1]!;
      expect(upstairs.cutOff.length).toBeGreaterThan(0);
      const fromStairs = walkable(plan, 1, [plan.stairwell!.y * plan.width + plan.stairwell!.x]);
      upstairs.roomOf.forEach((r, i) => { if (r >= 0) expect(fromStairs.has(i)).toBe(!upstairs.cutOff.includes(r)); });
    }
  });

  it("is these exact bits: a change to the draw order or the arithmetic must be deliberate", () => {
    // FNV-1a over every storey's cells, the grid and the stairwell. If this
    // fails, a plan changed: say why in the commit, and re-pin it here.
    const plan = generateFloorPlan(box("h1", 16, 12), 1000);
    let hash = 0x811c9dc5;
    const feed = (v: number) => { hash ^= v & 0xff; hash = Math.imul(hash, 0x01000193) >>> 0; };
    for (const storey of plan.storeys) for (const k of storey.cells) feed(k);
    for (const v of [plan.width, plan.height, plan.stairwell!.x, plan.stairwell!.y, plan.stairwell!.w, plan.stairwell!.h]) feed(v);
    expect({ hash, origin: plan.origin, axis: plan.axis, doors: plan.outsideDoors }).toEqual(GOLDEN);
  });

  it("puts windows and the front door only in the outside wall, with the street beyond", () => {
    const plan = generateFloorPlan(box("h1", 16, 12), 9);
    for (const storey of plan.storeys) {
      const w = plan.width;
      storey.cells.forEach((k, i) => {
        if (k !== CELL_KIND.window && !(k === CELL_KIND.door && plan.outsideDoors.includes(i))) return;
        const sides = [storey.cells[i - 1], storey.cells[i + 1], storey.cells[i - w], storey.cells[i + w]];
        expect(sides).toContain(CELL_KIND.outside);
      });
      const windows = [...storey.cells].filter((k) => k === CELL_KIND.window).length;
      // 56 m of outside wall at one window every 3 m.
      expect(windows).toBeGreaterThanOrEqual(15);
      expect(windows).toBeLessThanOrEqual(20);
    }
  });

  it("refuses what is not a building with a polygon footprint", () => {
    const tree: MapObject = { id: "t", kind: "tree", footprint: { shape: "circle", center: { x: 0, y: 0 }, radius: 3 } };
    expect(() => generateFloorPlan(tree, 1)).toThrow(/not a building/);
    const round: MapObject = { id: "r", kind: "building", footprint: { shape: "circle", center: { x: 0, y: 0 }, radius: 8 } };
    expect(() => generateFloorPlan(round, 1)).toThrow(/polygon/);
  });

  it("lays the grid along a turned house's walls, and maps its cells back onto the footprint", () => {
    // A 16 by 10 m house turned 3-4-5 on the map.
    const at = (x: number, y: number) => ({ x: 200 + 0.8 * x - 0.6 * y, y: 300 + 0.6 * x + 0.8 * y });
    const turned: MapObject = {
      id: "turned",
      kind: "building",
      footprint: { shape: "polygon", points: [at(0, 0), at(16, 0), at(16, 10), at(0, 10)] },
    };
    const plan = generateFloorPlan(turned, 4);
    expect(plan.axis.x).toBeCloseTo(0.8, 12);
    expect(plan.axis.y).toBeCloseTo(0.6, 12);
    // Square to the walls, the grid is the house's own 16 by 10 m and a cell of margin each side.
    expect(plan.width).toBeLessThanOrEqual(16 / INTERIOR_CELL_M + 3);
    expect(plan.height).toBeLessThanOrEqual(10 / INTERIOR_CELL_M + 3);
    const toMap = (i: number) => {
      const gx = ((i % plan.width) + 0.5) * plan.cellM, gy = (Math.floor(i / plan.width) + 0.5) * plan.cellM;
      return { x: plan.origin.x + gx * plan.axis.x - gy * plan.axis.y, y: plan.origin.y + gx * plan.axis.y + gy * plan.axis.x };
    };
    // Back in the house's own frame, every floor cell is inside it.
    const local = (p: { x: number; y: number }) => ({ x: 0.8 * (p.x - 200) + 0.6 * (p.y - 300), y: -0.6 * (p.x - 200) + 0.8 * (p.y - 300) });
    plan.storeys[0]!.cells.forEach((k, i) => {
      if (k !== CELL_KIND.floor) return;
      const p = local(toMap(i));
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(16);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(10);
    });
  });

  it("takes square roots with plain arithmetic, as close as Math.sqrt", () => {
    for (const x of [1e-6, 0.25, 2, 9, 144.5, 256, 1e4, 3.7e5, 1e8]) {
      expect(Math.abs(squareRoot(x) - Math.sqrt(x)) / Math.sqrt(x)).toBeLessThan(1e-14);
    }
    expect(squareRoot(0)).toBe(0);
    expect(squareRoot(-1)).toBe(0);
  });

  it("orders directions round the compass as the angle does, without trigonometry", () => {
    // Sixteen points round a circle, in order: the diamond angle must rise with them.
    const points: [number, number][] = [
      [1, 0], [3, 1], [1, 1], [1, 3], [0, 1], [-1, 3], [-1, 1], [-3, 1],
      [-1, 0], [-3, -1], [-1, -1], [-1, -3], [0, -1], [1, -3], [1, -1], [3, -1],
    ];
    const angles = points.map(([x, y]) => diamondAngle(x, y));
    for (let k = 1; k < angles.length; k++) expect(angles[k]!).toBeGreaterThan(angles[k - 1]!);
    expect(angles[0]).toBe(0);
    expect(angles[angles.length - 1]!).toBeLessThan(4);
  });
});
