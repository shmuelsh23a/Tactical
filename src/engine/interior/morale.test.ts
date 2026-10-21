import { describe, it, expect } from "vitest";
import { Rng } from "../rng.js";
import type { MapObject } from "../terrain.js";
import { generateFloorPlan } from "./floorPlan.js";
import { InteriorFight, defaultDefence } from "./resolver.js";

/**
 * Morale inside the house (rules decision 103, the author, 2026-10-21): a
 * man the morale step has broken stops fighting there. An attacker leaves;
 * a defender falls back when pressed, holding or not, and gives himself up
 * once he is cornered.
 */
const house: MapObject = {
  id: "h",
  kind: "building",
  height: 6,
  footprint: { shape: "polygon", points: [{ x: 0, y: 0 }, { x: 16, y: 0 }, { x: 16, y: 12 }, { x: 0, y: 12 }] },
};

function start(seed: number, defenders = 3, teams = [["a1", "a2", "a3", "a4"], ["a5", "a6", "a7", "a8"]]) {
  const plan = generateFloorPlan(house, seed);
  const rng = new Rng(seed);
  const defence = defaultDefence(plan, Array.from({ length: defenders }, (_, k) => `d${k}`), rng);
  return new InteriorFight({ plan, attack: { entry: "door", grenades: false, teams }, defence }, rng);
}

const man = (f: InteriorFight, id: string) => f.soldiers.find((m) => m.id === id)!;

describe("morale inside the house (decision 103)", () => {
  it("sends a broken attacker out of the fight, and ends the attack when every attacker breaks", () => {
    const f = start(3);
    f.tick();
    const a = f.soldiers.find((m) => m.id.startsWith("a") && !m.out)!; // whoever is still on his feet after the first second
    f.setBroken([a.id], true);
    f.tick();
    expect(a.withdrew).toBe(true);
    expect(a.out).toBe(false); // he left; he was not hit
    f.setBroken(["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"], true);
    f.tick();
    expect(f.finished).toBe(true);
    expect(f.result().outcome).toBe("repulsed");
  });

  it("has a broken defender fire no more", () => {
    // Every defender broken from the first second: no attacker is hit in ten
    // minutes (no grenades are thrown, so nothing else can hit him), against
    // the same fights unbroken, where some are. Mostly because each gives
    // himself up the second he is seen; the guard in the fire covers a man
    // who sees before he is seen.
    let hitUnbroken = 0, hitBroken = 0;
    for (let seed = 1; seed <= 30; seed++) {
      for (const broken of [false, true]) {
        const f = start(seed, 6);
        if (broken) f.setBroken(f.soldiers.filter((m) => m.id.startsWith("d")).map((m) => m.id), true);
        for (let t = 0; t < 600 && !f.finished; t++) f.tick();
        const hit = f.soldiers.filter((m) => m.id.startsWith("a") && m.out).length;
        if (broken) hitBroken += hit;
        else hitUnbroken += hit;
      }
    }
    expect(hitUnbroken).toBeGreaterThan(0);
    expect(hitBroken).toBe(0);
  });

  it("has a broken defender give himself up when the clearing team reaches him: out, not hit", () => {
    let yielded = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const f = start(seed, 2);
      f.setBroken(["d0", "d1"], true);
      while (!f.finished) f.tick();
      const r = f.result();
      for (const id of ["d0", "d1"]) {
        const d = man(f, id);
        if (d.yielded) {
          yielded++;
          expect(d.out).toBe(true);
          expect(d.killed).toBe(false); // he gave himself up; a wound from before he may have
        }
      }
      expect(r.defenders.yielded).toBe(["d0", "d1"].filter((id) => man(f, id).yielded).length);
    }
    expect(yielded).toBeGreaterThan(0);
  });

  it("lets a broken defender who holds to the last fall back all the same", () => {
    // Holding, nobody ever sets off; broken, some do, before they are found.
    const retreats = (broken: boolean) => {
      let n = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const f = start(seed, 6);
        const ids = f.soldiers.filter((m) => m.id.startsWith("d")).map((m) => m.id);
        f.setHolds(ids, true);
        if (broken) f.setBroken(ids, true);
        const went = new Set<string>();
        while (!f.finished) {
          f.tick();
          for (const id of ids) if (man(f, id).retreat) went.add(id);
        }
        n += went.size;
      }
      return n;
    };
    expect(retreats(false)).toBe(0);
    expect(retreats(true)).toBeGreaterThan(0);
  });

  it("puts a rallied man back in the fight where he stands", () => {
    const f = start(3);
    f.setBroken(["d0"], true);
    f.tick();
    f.setBroken(["d0"], false);
    expect(man(f, "d0").broken).toBe(false);
  });
});
