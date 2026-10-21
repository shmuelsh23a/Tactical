import { describe, it, expect } from "vitest";
import { Rng } from "../rng.js";
import type { MapObject } from "../terrain.js";
import { generateFloorPlan } from "./floorPlan.js";
import { InteriorFight, defaultDefence } from "./resolver.js";

/**
 * The defender's counterattack inside (rules decision 104, the author,
 * 2026-10-21): the defenders inside are not static — they go back into rooms
 * the attacker took and left — and a defending force from outside comes in
 * at the door and clears the attacker's rooms back by the same drill.
 */
const house = (seed: number): MapObject => ({
  id: `h${seed}`,
  kind: "building",
  height: 6,
  footprint: { shape: "polygon", points: [{ x: 0, y: 0 }, { x: 16, y: 0 }, { x: 16, y: 12 }, { x: 0, y: 12 }] },
});
const squad = [["a1", "a2", "a3", "a4"], ["a5", "a6", "a7", "a8"]];

function start(seed: number, defenders: number, retakes: boolean) {
  const plan = generateFloorPlan(house(seed), seed);
  const rng = new Rng(seed);
  const defence = defaultDefence(plan, Array.from({ length: defenders }, (_, k) => `d${k}`), rng);
  return new InteriorFight({ plan, attack: { entry: "door", grenades: true, teams: squad }, defence, defenderRetakes: retakes }, rng);
}

const seeds = Array.from({ length: 40 }, (_, k) => 200 + k);

describe("the counterattack inside (decision 104)", () => {
  it("has defenders go back into rooms the attacker left, and only when told they may", () => {
    let retaken = 0, without = 0, standoffs = 0;
    for (const seed of seeds) {
      const on = start(seed, 6, true);
      while (!on.finished) on.tick();
      retaken += on.result().roomsRetaken;
      if (on.result().outcome === "standoff") standoffs++;
      const off = start(seed, 6, false);
      while (!off.finished) off.tick();
      without += off.result().roomsRetaken;
    }
    expect(retaken).toBeGreaterThan(0);
    expect(without).toBe(0);
    expect(standoffs).toBeLessThan(seeds.length / 4); // the fight still comes to an end
  });

  it("comes out the same from the same seed", () => {
    const run = () => {
      const f = start(211, 6, true);
      for (let t = 0; t < 300; t++) f.tick();
      f.counterJoin([["c1", "c2", "c3", "c4"]]);
      while (!f.finished) f.tick();
      return f.result();
    };
    expect(run()).toEqual(run());
  });

  it("sends a force from outside in at the door to clear the attacker's rooms back", () => {
    let retaken = 0, counterHit = 0, ended = 0;
    for (const seed of seeds) {
      const f = start(seed, 2, false);
      // Let the attacker take some of the house first.
      for (let t = 0; t < 900 && !f.finished && f.result().roomsCleared < 3; t++) f.tick();
      if (f.finished) continue;
      f.counterJoin([["c1", "c2", "c3", "c4"], ["c5", "c6", "c7", "c8"]]);
      while (!f.finished) f.tick();
      ended++;
      retaken += f.result().roomsRetaken;
      counterHit += f.soldiers.filter((m) => m.id.startsWith("c") && m.out).length;
      // The counterattackers are the defender's: counted with them.
      expect(f.result().defenders.men).toBe(10);
    }
    expect(ended).toBeGreaterThan(10);
    expect(retaken).toBeGreaterThan(0);
    expect(counterHit).toBeGreaterThan(0); // the attacker's men fight back from the rooms they hold
  });

  it("does not let a counterattack end the fight as cleared while it is still at it", () => {
    for (const seed of seeds.slice(0, 15)) {
      const f = start(seed, 0, false);
      for (let t = 0; t < 120 && !f.finished; t++) f.tick();
      if (f.finished) continue;
      f.counterJoin([["c1", "c2", "c3", "c4"]]);
      f.tick();
      if (f.finished) expect(f.soldiers.filter((m) => m.id.startsWith("c")).every((m) => m.out || m.withdrew)).toBe(true);
    }
  });

  it("refuses a man already in the fight", () => {
    const f = start(201, 2, false);
    f.tick();
    expect(() => f.counterJoin([["d0"]])).toThrow();
    expect(() => f.counterJoin([["a1"]])).toThrow();
  });
});
