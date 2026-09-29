import { describe, it, expect } from "vitest";
import { Game, makeInfantry, type Heightfield, type Terrain } from "../engine/index.js";
import { bestVantage, isDeadGround, nearestDeadGround } from "./deadGround.js";

/**
 * A ridge running north–south across a 400 m square: 0 m at both edges,
 * `crest` metres at x = 200, a straight slope on either side.
 */
function ridge(crest: number): Heightfield {
  const heights: number[] = [];
  for (let r = 0; r < 41; r++) {
    for (let c = 0; c < 41; c++) heights.push(crest * (1 - Math.abs(c * 10 - 200) / 200));
  }
  return { spacing: 10, columns: 41, rows: 41, heights };
}
const ground: Terrain = { heightfield: ridge(20), objects: [] };
// A watcher at the foot of the ridge's west side.
const watchers = [{ x: 10, y: 200 }];

describe("dead ground", () => {
  it("is behind the crest from the watcher, not in front of it", () => {
    expect(isDeadGround({ terrain: ground, watchers }, { x: 100, y: 200 })).toBe(false);
    expect(isDeadGround({ terrain: ground, watchers }, { x: 380, y: 200 })).toBe(true);
  });

  it("agrees with the engine's own sight test", () => {
    const g = new Game({ seed: 1, terrain: ground });
    const w = g.addUnit(makeInfantry("R", "RED", "squad", watchers[0]!, 9));
    for (const x of [60, 150, 210, 260, 320, 390]) {
      const u = g.addUnit(makeInfantry(`B${x}`, "BLUE", "squad", { x, y: 200 }, 9));
      expect(isDeadGround({ terrain: ground, watchers }, u.position)).toBe(!g.hasLineOfSight(w, u));
    }
  });

  it("counts a spot beyond the watchers' reach as out of sight, whatever the ground", () => {
    const flat: Terrain = { objects: [] };
    expect(isDeadGround({ terrain: flat, watchers }, { x: 390, y: 200 })).toBe(false);
    expect(isDeadGround({ terrain: flat, watchers, reach: 300 }, { x: 390, y: 200 })).toBe(true);
  });

  it("must be hidden from every watcher", () => {
    const both = [...watchers, { x: 390, y: 200 }];
    expect(isDeadGround({ terrain: ground, watchers: both }, { x: 380, y: 200 })).toBe(false);
  });

  it("is found nearest the force, over the crest", () => {
    const at = nearestDeadGround({ terrain: ground, watchers }, { x: 150, y: 200 }, { width: 400, height: 400, radius: 250 });
    expect(at).not.toBeNull();
    expect(isDeadGround({ terrain: ground, watchers }, at!)).toBe(true);
    // Over the crest from the watcher, and no further than it has to be.
    expect(at!.x).toBeGreaterThan(200);
    const again = nearestDeadGround({ terrain: ground, watchers }, { x: 150, y: 200 }, { width: 400, height: 400, radius: 250 });
    expect(again).toEqual(at);
  });

  it("is nowhere on open ground within reach", () => {
    const flat: Terrain = { objects: [] };
    expect(nearestDeadGround({ terrain: flat, watchers }, { x: 150, y: 200 }, { width: 400, height: 400 })).toBeNull();
  });
});

describe("a vantage point", () => {
  // The enemy is dug in at the foot of the ridge's east side; the scout comes from the west.
  const targets = [{ x: 330, y: 200 }];
  const from = { x: 10, y: 200 };
  it("looks onto the targets from outside the enemy's reach, from the scout's side", () => {
    const at = bestVantage({ terrain: ground, targets, minRange: 100, maxRange: 250 }, from, { width: 400, height: 400 });
    expect(at).not.toBeNull();
    const d = Math.hypot(at!.x - 330, at!.y - 200);
    expect(d).toBeGreaterThanOrEqual(100);
    expect(d).toBeLessThanOrEqual(250);
    expect(at!.x).toBeLessThan(330);
    // It really sees them: the engine agrees.
    const g = new Game({ seed: 1, terrain: ground });
    const scout = g.addUnit(makeInfantry("B", "BLUE", "squad", at!, 9));
    const enemy = g.addUnit(makeInfantry("R", "RED", "squad", targets[0]!, 9));
    enemy.baseCover = "full";
    enemy.cover = "full";
    expect(g.hasLineOfSight(scout, enemy)).toBe(true);
  });

  it("is on the crest or beyond it, not at its foot where the ridge hides them", () => {
    const at = bestVantage({ terrain: ground, targets, minRange: 100, maxRange: 250 }, from, { width: 400, height: 400 });
    expect(at!.x).toBeGreaterThanOrEqual(190);
  });

  it("is none where nothing within the ring can see them", () => {
    // 280-320 m out, every spot on the map is west of a 200 m crest the targets lie east of.
    const wall: Terrain = { heightfield: ridge(200), objects: [] };
    expect(bestVantage({ terrain: wall, targets, minRange: 280, maxRange: 320 }, from, { width: 400, height: 400 })).toBeNull();
  });
});
