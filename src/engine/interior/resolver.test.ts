import { describe, it, expect } from "vitest";
import { Rng } from "../rng.js";
import type { MapObject } from "../terrain.js";
import { CLOSE_QUARTERS } from "../data/interior.js";
import { generateFloorPlan } from "./floorPlan.js";
import { CASUALTY_RULES } from "../data/casualties.js";
import { CELL_KIND } from "./floorPlan.js";
import { InteriorFight, defaultDefence, isStunned, resolveInteriorFight, woundSoldier, type AttackPlan, type InteriorResult, type InteriorSoldier } from "./resolver.js";

const house = (id: string, w: number, h: number, storeys = 2): MapObject => ({
  id,
  kind: "building",
  height: storeys * 3,
  footprint: { shape: "polygon", points: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }] },
});

const squad: string[][] = [["a1", "a2", "a3", "a4"], ["a5", "a6", "a7", "a8"]];

function fight(seed: number, attack: Partial<AttackPlan>, defenders: number, prepared = false, building = house(`h${seed}`, 16, 12)): InteriorResult {
  const plan = generateFloorPlan(building, seed);
  const rng = new Rng(seed);
  const defence = defaultDefence(plan, Array.from({ length: defenders }, (_, k) => `d${k}`), rng, prepared);
  return resolveInteriorFight({ plan, attack: { entry: "door", grenades: false, teams: squad, ...attack }, defence }, rng);
}

const total = (rows: InteriorResult[], f: (r: InteriorResult) => number) => rows.reduce((s, r) => s + f(r), 0);
const seeds = Array.from({ length: 60 }, (_, k) => 100 + k);

describe("the fight inside a building (decision 96)", () => {
  it("comes out the same from the same seed", () => {
    expect(fight(7, { grenades: true }, 3)).toEqual(fight(7, { grenades: true }, 3));
  });

  it("clears an empty house room by room, each room held for the drill's consolidation", () => {
    const r = fight(3, {}, 0);
    expect(r.outcome).toBe("cleared");
    expect(r.roomsCleared).toBe(r.rooms);
    expect(r.attackers.out).toBe(0);
    // Two teams, a room each at a time: never faster than half the rooms' consolidation.
    expect(r.seconds).toBeGreaterThanOrEqual((r.rooms * CLOSE_QUARTERS.consolidateSeconds) / 2);
  });

  it("always ends — cleared or repulsed, never stuck — whichever way in", () => {
    const ell: MapObject = {
      id: "ell",
      kind: "building",
      footprint: { shape: "polygon", points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 8 }, { x: 10, y: 8 }, { x: 10, y: 16 }, { x: 0, y: 16 }] },
    };
    // Two blocks joined by a neck of outside wall: a wing with its own street
    // door below, and rooms upstairs the plan lists as cut off.
    const dumbbell = (id: string): MapObject => ({
      id,
      kind: "building",
      height: 6,
      footprint: {
        shape: "polygon",
        points: [
          { x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 3.5 }, { x: 12, y: 3.5 }, { x: 12, y: 0 }, { x: 20, y: 0 },
          { x: 20, y: 8 }, { x: 12, y: 8 }, { x: 12, y: 4.5 }, { x: 8, y: 4.5 }, { x: 8, y: 8 }, { x: 0, y: 8 },
        ],
      },
    });
    let wings = 0, cutOff = 0;
    for (const seed of seeds.slice(0, 30)) {
      const d = generateFloorPlan(dumbbell(`db${seed}`), seed);
      if (d.outsideDoors.length > 1) wings++;
      if (d.storeys.some((st) => st.cutOff.length > 0)) cutOff++;
    }
    expect(wings).toBeGreaterThan(0); // the cases this test is for are in it
    expect(cutOff).toBeGreaterThan(0);
    for (const seed of seeds.slice(0, 30))
      for (const entry of ["door", "top"] as const)
        for (const building of [house(`h${seed}`, 16, 12), ell, dumbbell(`db${seed}`)]) {
          const r = fight(seed, { entry, grenades: seed % 2 === 0 }, 3, seed % 3 === 0, building);
          expect(r.outcome, `${building.id} seed ${seed} ${entry}`).not.toBe("standoff");
        }
  });

  it("pays for grenades: fewer attackers hit, more attacks through", () => {
    const without = seeds.map((s) => fight(s, { grenades: false }, 3, true));
    const withGrenades = seeds.map((s) => fight(s, { grenades: true }, 3, true));
    expect(total(withGrenades, (r) => r.attackers.out)).toBeLessThan(total(without, (r) => r.attackers.out));
    expect(total(withGrenades, (r) => r.hits.grenade)).toBeGreaterThan(0);
    expect(total(without, (r) => r.hits.grenade)).toBe(0);
  });

  it("makes prepared defenders cost more to clear than unprepared ones", () => {
    const open = seeds.map((s) => fight(s, {}, 3, false));
    const prepared = seeds.map((s) => fight(s, {}, 3, true));
    expect(total(prepared, (r) => r.attackers.out)).toBeGreaterThan(total(open, (r) => r.attackers.out));
  });

  it("is repulsed when one team goes in against a house full of prepared men", () => {
    const rows = seeds.slice(0, 20).map((s) => {
      const plan = generateFloorPlan(house(`h${s}`, 16, 12), s);
      const rng = new Rng(s);
      const defence = defaultDefence(plan, ["d1", "d2", "d3", "d4", "d5", "d6"], rng, true);
      return resolveInteriorFight({ plan, attack: { entry: "door", grenades: false, teams: [["a1", "a2"]] }, defence }, rng);
    });
    expect(rows.filter((r) => r.outcome === "repulsed").length).toBeGreaterThan(15);
  });

  it("stuns a man for exactly the stun's seconds", () => {
    const m = { stunnedUntil: 10 + CLOSE_QUARTERS.stunSeconds } as InteriorSoldier;
    expect(isStunned(m, 10)).toBe(true);
    expect(isStunned(m, 10 + CLOSE_QUARTERS.stunSeconds - 1)).toBe(true);
    expect(isStunned(m, 10 + CLOSE_QUARTERS.stunSeconds)).toBe(false);
  });

  it("wounds by the author's d10, floored as outside: 4 light, 4 serious, 2 killed", () => {
    const counts = { light: 0, serious: 0, killed: 0 };
    const rng = new Rng(9);
    for (let k = 0; k < 10000; k++) {
      const m = { out: false, damage: 0, killed: false } as InteriorSoldier;
      expect(woundSoldier(m, rng)).toBe(true);
      counts[m.wound!]++;
      if (m.wound === "light") expect(m.out).toBe(false);
      if (m.wound === "serious") { expect(m.out).toBe(true); expect(m.damage).toBe(CASUALTY_RULES.bleedingThreshold); }
      if (m.wound === "killed") { expect(m.killed).toBe(true); expect(m.damage).toBe(CASUALTY_RULES.neutralizeThreshold); }
    }
    expect(counts.light / 10000).toBeCloseTo(0.4, 1);
    expect(counts.serious / 10000).toBeCloseTo(0.4, 1);
    expect(counts.killed / 10000).toBeCloseTo(0.2, 1);
    // Four light wounds put a man out; a man already out takes no more and draws nothing.
    const m = { out: false, damage: 6, killed: false } as InteriorSoldier;
    const fixed = { die: () => 1 } as unknown as Rng;
    woundSoldier(m, fixed);
    expect(m.out).toBe(true);
    expect(woundSoldier(m, { die: () => { throw new Error("drew"); } } as unknown as Rng)).toBe(false);
  });

  it("sends one grenade down the stairwell, not one a team, when the squad comes from the top", () => {
    const plan = generateFloorPlan(house("h", 16, 12), 2);
    const f = new InteriorFight({ plan, attack: { entry: "top", grenades: true, teams: squad }, defence: [] }, new Rng(2));
    expect(f.result().grenadesThrown).toBe(1);
  });

  it("refuses to come down from the top of a house with no stairs", () => {
    const plan = generateFloorPlan(house("bungalow", 16, 12, 1), 1);
    expect(() => new InteriorFight({ plan, attack: { entry: "top", grenades: false, teams: squad }, defence: [] }, new Rng(1))).toThrow(/stairs/);
  });

  it("refuses a defender posted on a wall", () => {
    const plan = generateFloorPlan(house("h", 16, 12), 1);
    const wall = plan.storeys[0]!.cells.indexOf(CELL_KIND.wall);
    expect(() => new InteriorFight({ plan, attack: { entry: "door", grenades: false, teams: squad }, defence: [{ id: "d", storey: 0, cell: wall }] }, new Rng(1))).toThrow(/floor/);
  });

  it("posts the default defence at the back of rooms, a man a room while rooms last", () => {
    const plan = generateFloorPlan(house("h", 16, 12), 5);
    const posts = defaultDefence(plan, ["d1", "d2", "d3"], new Rng(5));
    const rooms = new Set(posts.map((p) => `${p.storey}:${plan.storeys[p.storey]!.roomOf[p.cell]}`));
    expect(rooms.size).toBe(3);
    for (const p of posts) {
      const k = plan.storeys[p.storey]!.cells[p.cell];
      expect(k === CELL_KIND.floor || k === CELL_KIND.stair).toBe(true);
    }
  });
});
