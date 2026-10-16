import { pointInPolygon, type Point } from "../geometry.js";
import { unitSeed } from "../morale.js";
import { Rng } from "../rng.js";
import type { MapObject } from "../terrain.js";
import {
  DEFAULT_STOREYS,
  INTERIOR_CELL_M,
  MAX_STOREYS,
  OUTSIDE_DOORS,
  ROOM,
  STAIRWELL_M,
  STOREY_HEIGHT_M,
  WINDOW_SPACING_M,
} from "../data/interior.js";

/**
 * A building's inside, generated from its footprint (README, rules decision
 * 96; docs/urban-design.md). The map gives an outline and nothing inside it,
 * so the rooms, doors, windows and stairs are drawn here — the same plan for
 * the same building in the same game, on any device:
 *
 * - **Seeded from the game's seed and the building's id**, on a stream of its
 *   own (`unitSeed`, as a force's men are, decision 19). The game's rng is
 *   never touched, so a plan costs a game nothing, need not be recorded, and
 *   exists whether or not anyone ever goes in.
 * - **Basic arithmetic only.** A phone and a server must build the same bits,
 *   and the language standard leaves `Math.sin`, `Math.sqrt` and the rest
 *   "implementation-approximated". `eslint.config.js` forbids them under
 *   `src/engine/interior/`. The plan also leans on `pointInPolygon`,
 *   `unitSeed` and `Rng`, outside that rule's reach: all three are `+ − × ÷`,
 *   `Math.imul` and shifts today, and must stay so.
 *
 * Every figure the plan is drawn to is in `data/interior.ts`, and every one
 * is ours.
 */

/** What a cell of the plan is. */
export const CELL_KIND = {
  outside: 0,
  floor: 1,
  wall: 2,
  window: 3,
  door: 4,
  stair: 5,
} as const;
export type CellKind = (typeof CELL_KIND)[keyof typeof CELL_KIND];

/** A room: the floor and stair cells a man can reach without passing a door. */
export interface Room {
  id: number;
  /** How many cells it has. */
  cells: number;
  areaM2: number;
  /** True for the room the stairwell stands in. */
  stair: boolean;
}

/** One storey's plan, on the building's grid. */
export interface Storey {
  /** 0 is the ground floor. */
  level: number;
  /** `CELL_KIND` per cell, row by row (`y * width + x`). */
  cells: Uint8Array;
  /** The room each floor or stair cell belongs to; -1 for every other cell. */
  roomOf: Int32Array;
  rooms: Room[];
  /**
   * Rooms no man can reach from the way into the storey (the street on the
   * ground floor, the stairs above it): a wing joined to the rest by a neck
   * too thin to walk through, on a storey with no stairs of its own. Empty
   * on every house of the demo map; said rather than hidden when it is not.
   */
  cutOff: number[];
}

/** The stairwell, in grid cells; the same rectangle on every storey. */
export interface Stairwell {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FloorPlan {
  buildingId: string;
  /** A cell's side, in metres. */
  cellM: number;
  /**
   * The grid is laid along the building's longest wall, so its rooms are cut
   * square to its walls. A point `(x, y)` in grid metres is on the map at
   * `origin + x × axis + y × (−axis.y, axis.x)`; cell (i, j) spans
   * `[i, i + 1) × cellM` by `[j, j + 1) × cellM`.
   */
  origin: Point;
  /** Unit vector along the grid's x, on the map. */
  axis: Point;
  width: number;
  height: number;
  storeys: Storey[];
  /** Absent when the building has one storey, or no stairwell fits in it (it is then given one storey). */
  stairwell: Stairwell | null;
  /** Ground-floor cells that open on the street. */
  outsideDoors: number[];
}

/** Storeys from the map's height, or the default when it gives none (decision 96). */
export function buildingStoreys(building: MapObject): number {
  if (building.height === undefined) return DEFAULT_STOREYS;
  return Math.min(MAX_STOREYS, Math.max(1, Math.round(building.height / STOREY_HEIGHT_M)));
}

/** The seed of a building's own stream, the way a force's men have theirs. */
export function floorPlanSeed(gameSeed: number, buildingId: string): number {
  return unitSeed(gameSeed, `floorplan:${buildingId}`);
}

const { outside: OUTSIDE, floor: FLOOR, wall: WALL, window: WINDOW, door: DOOR, stair: STAIR } = CELL_KIND;

/** True for a cell a man stands in: a room's floor or its stairs. */
function isRoomCell(kind: number): boolean {
  return kind === FLOOR || kind === STAIR;
}

/**
 * Build the plan of a building. Throws for anything that is not a building
 * with a polygon footprint: that is a caller's mistake, not a game state.
 */
export function generateFloorPlan(building: MapObject, gameSeed: number): FloorPlan {
  if (building.kind !== "building") throw new Error(`generateFloorPlan: ${building.id} is a ${building.kind}, not a building`);
  if (building.footprint.shape !== "polygon") throw new Error(`generateFloorPlan: ${building.id} has no polygon footprint`);
  const rng = new Rng(floorPlanSeed(gameSeed, building.id));
  const cell = INTERIOR_CELL_M;

  // The grid lies along the longest wall: a house turned on the map still has
  // its rooms cut square to it, rather than into slivers by a grid at an angle.
  const axis = longestWall(building.footprint.points);
  const toGrid = (p: Point): Point => ({ x: p.x * axis.x + p.y * axis.y, y: -p.x * axis.y + p.y * axis.x });
  const turned = building.footprint.points.map(toGrid);

  // One cell of margin round the footprint, so every outside wall has an
  // outside cell beyond it.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of turned) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const corner = { x: minX - cell, y: minY - cell };
  const width = Math.ceil((maxX - corner.x) / cell) + 1;
  const height = Math.ceil((maxY - corner.y) / cell) + 1;
  const n = width * height;
  const polygon = turned.map((p) => ({ x: p.x - corner.x, y: p.y - corner.y }));
  // The grid's corner back on the map (the inverse turn).
  const origin = { x: corner.x * axis.x - corner.y * axis.y, y: corner.x * axis.y + corner.y * axis.x };

  // Inside the footprint by the cell's centre; the outside wall is every
  // inside cell beside an outside one.
  const base = new Uint8Array(n);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (pointInPolygon({ x: (x + 0.5) * cell, y: (y + 0.5) * cell }, polygon)) base[y * width + x] = FLOOR;
  const outsideWall: number[] = [];
  for (let i = 0; i < n; i++) {
    if (base[i] !== FLOOR) continue;
    const x = i % width, y = (i - x) / width;
    const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
    if (edge || base[i - 1] === OUTSIDE || base[i + 1] === OUTSIDE || base[i - width] === OUTSIDE || base[i + width] === OUTSIDE)
      outsideWall.push(i);
  }
  for (const i of outsideWall) base[i] = WALL;

  // The stairwell, where a building has more than one storey.
  let storeys = buildingStoreys(building);
  let stairwell: Stairwell | null = null;
  if (storeys > 1) {
    stairwell = placeStairwell(base, width, height, rng);
    if (stairwell === null) storeys = 1;
  }

  const plans: Storey[] = [];
  const outerWall = new Uint8Array(n);
  for (const i of outsideWall) outerWall[i] = 1;
  let outsideDoors: number[] = [];
  for (let level = 0; level < storeys; level++) {
    const cells = base.slice();
    if (stairwell) for (let y = stairwell.y; y < stairwell.y + stairwell.h; y++)
      for (let x = stairwell.x; x < stairwell.x + stairwell.w; x++) cells[y * width + x] = STAIR;
    cutRooms(cells, width, height, stairwell, rng);
    const { roomOf, count } = labelRooms(cells, width, height);
    const stairRoom = stairwell ? roomOf[stairwell.y * width + stairwell.x]! : -1;
    joinRooms(cells, roomOf, count, width, height, outerWall, [stairRoom >= 0 ? stairRoom : 0]);
    let entry: number[];
    if (level === 0) {
      outsideDoors = openOutside(cells, width, height, outsideWall, rng);
      outsideDoors.push(...doorEveryWing(cells, roomOf, count, width, height, outsideWall, outsideDoors));
      entry = roomsBeside(roomOf, outsideDoors, width, height);
    } else {
      entry = [stairRoom];
    }
    const reached = reach(cells, roomOf, count, width, height, entry);
    const cutOff: number[] = [];
    for (let r = 0; r < count; r++) if (!reached[r]) cutOff.push(r);
    glaze(cells, width, height, outsideWall, rng);
    plans.push({ level, cells, roomOf, rooms: describeRooms(roomOf, count, stairwell, width, cell), cutOff });
  }
  return { buildingId: building.id, cellM: cell, origin, axis, width, height, storeys: plans, stairwell, outsideDoors };
}

/**
 * The direction of the footprint's longest wall, as a unit vector pointing
 * east-ish (x ≥ 0), so a plan does not depend on which way round the map
 * happened to list the corners.
 */
function longestWall(points: readonly Point[]): Point {
  let best = { x: 1, y: 0 }, bestLength2 = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const dx = points[i]!.x - points[j]!.x, dy = points[i]!.y - points[j]!.y;
    const length2 = dx * dx + dy * dy;
    if (length2 > bestLength2) { bestLength2 = length2; best = { x: dx, y: dy }; }
  }
  if (bestLength2 === 0) return { x: 1, y: 0 };
  const length = squareRoot(bestLength2);
  const sign = best.x < 0 || (best.x === 0 && best.y < 0) ? -1 : 1;
  return { x: (sign * best.x) / length, y: (sign * best.y) / length };
}

/**
 * A square root by Newton's method, a fixed number of steps of `+` and `÷`
 * only. `Math.sqrt` is correctly rounded on every engine we know of, but the
 * language standard does not promise it, and a plan must be the same bits on
 * a phone and a server (docs/urban-design.md, *Cost and determinism*).
 */
export function squareRoot(x: number): number {
  if (!(x > 0)) return 0;
  // Start from a power of two near the root, so the steps below always converge.
  let guess = 1;
  while (guess * guess < x) guess *= 2;
  while (guess * guess > 4 * x) guess /= 2;
  for (let k = 0; k < 8; k++) guess = (guess + x / guess) / 2;
  return guess;
}

/** The first stairwell size that fits wholly on floor, at a position drawn from those it fits at. */
function placeStairwell(base: Uint8Array, width: number, height: number, rng: Rng): Stairwell | null {
  for (const size of STAIRWELL_M) {
    const w = Math.round(size.w / INTERIOR_CELL_M), h = Math.round(size.h / INTERIOR_CELL_M);
    const fits: Stairwell[] = [];
    for (let y = 0; y + h <= height; y++)
      for (let x = 0; x + w <= width; x++) {
        let ok = true;
        for (let yy = y; ok && yy < y + h; yy++)
          for (let xx = x; ok && xx < x + w; xx++) if (base[yy * width + xx] !== FLOOR) ok = false;
        if (ok) fits.push({ x, y, w, h });
      }
    if (fits.length > 0) return fits[rng.int(0, fits.length - 1)]!;
  }
  return null;
}

/**
 * Cut the storey into rooms: split the box across its longer side while it
 * is longer than a room may be, never leaving a room narrower than a room
 * may be, and never through the stairwell. A cut becomes wall only where it
 * crosses floor. Doors come after every cut, so that no later cut walls one
 * up from behind.
 */
function cutRooms(cells: Uint8Array, width: number, height: number, stair: Stairwell | null, rng: Rng): void {
  const maxSide = Math.round(ROOM.maxSideM / INTERIOR_CELL_M);
  const minSide = Math.round(ROOM.minSideM / INTERIOR_CELL_M);
  const runs: { cells: number[]; across: number }[] = [];

  const crossesStair = (vertical: boolean, at: number, from: number, to: number): boolean => {
    if (!stair) return false;
    // A cut beside the stairwell is allowed; one through it is not.
    if (vertical) return at >= stair.x && at < stair.x + stair.w && from < stair.y + stair.h && to > stair.y;
    return at >= stair.y && at < stair.y + stair.h && from < stair.x + stair.w && to > stair.x;
  };
  // How far the region's floor reaches along an axis: [first, last + 1) of the
  // columns (or rows) holding any floor or stair. A room is measured on its
  // floor, not on the box round it, which takes in the outside wall too.
  const floorSpan = (vertical: boolean, a: number, b: number, c: number, d: number): [number, number] => {
    let lo = Infinity, hi = -Infinity;
    for (let y = b; y < d; y++)
      for (let x = a; x < c; x++) {
        if (!isRoomCell(cells[y * width + x]!)) continue;
        const t = vertical ? x : y;
        if (t < lo) lo = t;
        if (t + 1 > hi) hi = t + 1;
      }
    return [lo, hi];
  };
  const candidates = (vertical: boolean, a: number, b: number, c: number, d: number, lo: number, hi: number): number[] => {
    const from = vertical ? b : a, to = vertical ? d : c;
    const out: number[] = [];
    for (let s = lo + minSide; s + 1 + minSide <= hi; s++) if (!crossesStair(vertical, s, from, to)) out.push(s);
    return out;
  };

  const split = (a: number, b: number, c: number, d: number): void => {
    const [xLo, xHi] = floorSpan(true, a, b, c, d);
    if (xHi <= xLo) return; // no floor in it
    const [yLo, yHi] = floorSpan(false, a, b, c, d);
    const w = xHi - xLo, h = yHi - yLo;
    if (w <= maxSide && h <= maxSide) return;
    const preferVertical = w === h ? rng.chance(0.5) : w > h;
    const along = (v: boolean) => ((v ? w : h) > maxSide ? candidates(v, a, b, c, d, v ? xLo : yLo, v ? xHi : yHi) : []);
    let vertical = preferVertical;
    let cuts = along(vertical);
    if (cuts.length === 0) {
      vertical = !preferVertical;
      cuts = along(vertical);
    }
    if (cuts.length === 0) return;
    const s = cuts[rng.int(0, cuts.length - 1)]!;
    let run: number[] = [];
    const flush = () => { if (run.length > 0) runs.push({ cells: run, across: vertical ? 1 : width }); run = []; };
    const from = vertical ? b : a, to = vertical ? d : c;
    for (let t = from; t < to; t++) {
      const i = vertical ? t * width + s : s * width + t;
      if (cells[i] === FLOOR) { cells[i] = WALL; run.push(i); } else flush();
    }
    flush();
    if (vertical) { split(a, b, s, d); split(s + 1, b, c, d); }
    else { split(a, b, c, s); split(a, s + 1, c, d); }
  };
  split(0, 0, width, height);

  // A door in each stretch of new wall, where a man can walk straight through.
  for (const { cells: run, across } of runs) {
    const through = run.filter((i) => cells[i] === WALL && isRoomCell(cells[i - across] ?? OUTSIDE) && isRoomCell(cells[i + across] ?? OUTSIDE));
    if (through.length > 0) cells[through[rng.int(0, through.length - 1)]!] = DOOR;
  }
}

/** Number the rooms: the floor and stair cells joined without a door, four ways. */
function labelRooms(cells: Uint8Array, width: number, height: number): { roomOf: Int32Array; count: number } {
  const roomOf = new Int32Array(width * height).fill(-1);
  const queue = new Int32Array(width * height);
  let count = 0;
  for (let start = 0; start < cells.length; start++) {
    if (!isRoomCell(cells[start]!) || roomOf[start] !== -1) continue;
    let head = 0, tail = 0;
    queue[tail++] = start;
    roomOf[start] = count;
    while (head < tail) {
      const i = queue[head++]!;
      const x = i % width;
      for (const j of neighbours(i, x, width, height)) {
        if (roomOf[j] === -1 && isRoomCell(cells[j]!)) { roomOf[j] = count; queue[tail++] = j; }
      }
    }
    count++;
  }
  return { roomOf, count };
}

function neighbours(i: number, x: number, width: number, height: number): number[] {
  const out: number[] = [];
  if (x > 0) out.push(i - 1);
  if (x < width - 1) out.push(i + 1);
  if (i >= width) out.push(i - width);
  if (i < width * (height - 1)) out.push(i + width);
  return out;
}

/** The pairs of different rooms a wall or door cell stands between, across it either way. */
function across(roomOf: Int32Array, i: number, width: number, height: number): [number, number][] {
  const out: [number, number][] = [];
  const x = i % width;
  if (x > 0 && x < width - 1) {
    const l = roomOf[i - 1]!, r = roomOf[i + 1]!;
    if (l >= 0 && r >= 0 && l !== r) out.push([l, r]);
  }
  if (i >= width && i < width * (height - 1)) {
    const u = roomOf[i - width]!, d = roomOf[i + width]!;
    if (u >= 0 && d >= 0 && u !== d) out.push([u, d]);
  }
  return out;
}

/** Which rooms a man can walk to from `from`, through the doors between rooms. */
export function reach(cells: Uint8Array, roomOf: Int32Array, count: number, width: number, height: number, from: readonly number[]): Uint8Array {
  const links: number[][] = Array.from({ length: count }, () => []);
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== DOOR) continue;
    for (const [p, q] of across(roomOf, i, width, height)) { links[p]!.push(q); links[q]!.push(p); }
  }
  const reached = new Uint8Array(count);
  const stack: number[] = [];
  for (const r of from) if (r >= 0 && r < count && !reached[r]) { reached[r] = 1; stack.push(r); }
  while (stack.length > 0) {
    const r = stack.pop()!;
    for (const q of links[r]!) if (!reached[q]) { reached[q] = 1; stack.push(q); }
  }
  return reached;
}

/**
 * Make every room of the storey reachable from `from`. A cut through a
 * footprint with corners can leave a room whose only wall to the rest had no
 * straight way through; such a room is given a door in the first inner wall,
 * in reading order, with a reached room on one side and not on the other.
 * Never the outside wall, which is not a way between rooms. No draw: the
 * repair is a rule, not a choice. Returns how many doors it opened.
 */
export function joinRooms(
  cells: Uint8Array,
  roomOf: Int32Array,
  count: number,
  width: number,
  height: number,
  outerWall: Uint8Array,
  from: readonly number[],
): number {
  let opened = 0;
  for (;;) {
    const reached = reach(cells, roomOf, count, width, height, from);
    if (reached.every((r) => r === 1)) return opened;
    let door = -1;
    for (let i = 0; i < cells.length && door < 0; i++) {
      if (cells[i] !== WALL || outerWall[i]) continue;
      if (across(roomOf, i, width, height).some(([p, q]) => reached[p] !== reached[q])) door = i;
    }
    if (door < 0) return opened; // the rest are cut off by the outside wall alone: the storey says so (`cutOff`)
    cells[door] = DOOR;
    opened++;
  }
}

/** The rooms just inside the given doors. */
function roomsBeside(roomOf: Int32Array, doors: readonly number[], width: number, height: number): number[] {
  const out: number[] = [];
  for (const i of doors) {
    const x = i % width;
    for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i < width * (height - 1) ? i + width : -1])
      if (j >= 0 && roomOf[j]! >= 0 && !out.includes(roomOf[j]!)) out.push(roomOf[j]!);
  }
  return out;
}

/**
 * A wing of the ground floor that the front door cannot reach (joined to
 * the rest only by a neck of outside wall) gets a door of its own to the
 * street: the first, in reading order, of its outside wall that a man can
 * walk through. A rule, not a draw.
 */
function doorEveryWing(
  cells: Uint8Array,
  roomOf: Int32Array,
  count: number,
  width: number,
  height: number,
  outsideWall: readonly number[],
  doors: readonly number[],
): number[] {
  const added: number[] = [];
  for (;;) {
    const reached = reach(cells, roomOf, count, width, height, roomsBeside(roomOf, [...doors, ...added], width, height));
    const free = throughOutsideWall(cells, width, height, outsideWall);
    const door = free.find((i) => roomsBeside(roomOf, [i], width, height).some((r) => !reached[r]));
    if (door === undefined) return added;
    cells[door] = DOOR;
    added.push(door);
  }
}

/** Outside-wall cells a man could step or see straight through: a room on one side, the street on the other. */
function throughOutsideWall(cells: Uint8Array, width: number, height: number, outsideWall: readonly number[]): number[] {
  return outsideWall.filter((i) => {
    if (cells[i] !== WALL) return false;
    const x = i % width;
    const pairs: [number, number][] = [];
    if (x > 0 && x < width - 1) pairs.push([i - 1, i + 1]);
    if (i >= width && i < width * (height - 1)) pairs.push([i - width, i + width]);
    return pairs.some(([p, q]) => (cells[p] === OUTSIDE && cells[q] === FLOOR) || (cells[q] === OUTSIDE && cells[p] === FLOOR));
  });
}

/** The ground floor's doors to the street, drawn from the outside wall a man can walk through. */
function openOutside(cells: Uint8Array, width: number, height: number, outsideWall: readonly number[], rng: Rng): number[] {
  const doors: number[] = [];
  for (let k = 0; k < OUTSIDE_DOORS; k++) {
    const free = throughOutsideWall(cells, width, height, outsideWall);
    if (free.length === 0) break;
    const i = free[rng.int(0, free.length - 1)]!;
    cells[i] = DOOR;
    doors.push(i);
  }
  return doors;
}

/**
 * Windows round the outside wall, one every `WINDOW_SPACING_M` of the cells a
 * man could see through, taken in order round the building from a drawn
 * start. The order is by a "diamond angle" about the grid's centre — the
 * angle's order without its trigonometry, so every device sorts alike.
 */
function glaze(cells: Uint8Array, width: number, height: number, outsideWall: readonly number[], rng: Rng): void {
  const candidates = throughOutsideWall(cells, width, height, outsideWall);
  if (candidates.length === 0) return;
  const cx = width / 2, cy = height / 2;
  const turn = (i: number) => diamondAngle((i % width) + 0.5 - cx, Math.floor(i / width) + 0.5 - cy);
  const ordered = candidates.map((i) => ({ i, a: turn(i) })).sort((p, q) => p.a - q.a || p.i - q.i);
  const every = Math.max(1, Math.round(WINDOW_SPACING_M / INTERIOR_CELL_M));
  const start = rng.int(0, every - 1);
  for (let k = start; k < ordered.length; k += every) cells[ordered[k]!.i] = WINDOW;
}

/** A monotone stand-in for the angle of (dx, dy), in [0, 4): ordering only, with no trigonometry. */
export function diamondAngle(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 0;
  if (dy >= 0) return dx >= 0 ? dy / (dx + dy) : 1 - dx / (-dx + dy);
  return dx < 0 ? 2 - dy / (-dx - dy) : 3 + dx / (dx - dy);
}

function describeRooms(roomOf: Int32Array, count: number, stair: Stairwell | null, width: number, cellM: number): Room[] {
  const sizes = new Array<number>(count).fill(0);
  for (let i = 0; i < roomOf.length; i++) if (roomOf[i]! >= 0) sizes[roomOf[i]!]!++;
  const stairRoom = stair ? roomOf[stair.y * width + stair.x]! : -1;
  return sizes.map((size, id) => ({ id, cells: size, areaM2: size * cellM * cellM, stair: id === stairRoom }));
}
