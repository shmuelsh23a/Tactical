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
    // Two teams, a room each at a time: never faster than half of every
    // room's consolidation and methodical search.
    const plan = generateFloorPlan(house("h3", 16, 12), 3);
    let held = 0;
    for (const s of plan.storeys) for (const room of s.rooms) held += CLOSE_QUARTERS.consolidateSeconds + room.areaM2 * CLOSE_QUARTERS.searchSecondsPerM2;
    expect(r.seconds).toBeGreaterThanOrEqual(held / 2);
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
      for (const entry of ["door", "stair", "top"] as const)
        for (const building of [house(`h${seed}`, 16, 12), ell, dumbbell(`db${seed}`)]) {
          const floors = generateFloorPlan(building, seed);
          if (entry !== "door" && (!floors.stairwell || floors.storeys.length < 2)) continue;
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

  it("charges a firefight's own time: reorganising after contact, and a halt for every man put out", () => {
    let extra = 0, owed = 0, n = 0;
    for (const s of seeds.slice(0, 30)) {
      const empty = fight(s, {}, 0);
      const held = fight(s, {}, 3, true);
      if (held.outcome !== "cleared") continue;
      n++;
      extra += held.seconds - empty.seconds;
      // At least one room taken under fire, and each casualty halting one of two teams working side by side.
      owed += CLOSE_QUARTERS.reorganiseSeconds + (held.attackers.out * CLOSE_QUARTERS.casualtySeconds) / 2;
    }
    expect(n).toBeGreaterThan(15);
    expect(extra / n).toBeGreaterThanOrEqual(owed / n);
  });

  const fightWith = (seed: number, entry: "door" | "top", opts: { expects?: "below" | "above"; fallback?: "fallBack" | "hold" }) => {
    const plan = generateFloorPlan(house(`h${seed}`, 16, 12), seed);
    const rng = new Rng(seed);
    const defence = defaultDefence(plan, ["d0", "d1", "d2"], rng, true);
    return resolveInteriorFight({ plan, attack: { entry, grenades: false, teams: squad }, defence, defenderExpects: opts.expects, defenderFallback: opts.fallback }, rng);
  };

  it("catches defenders from the rear when they expect the attack from below and it comes from above", () => {
    // Holding to the last, so only who is watching which way differs.
    const surprised = seeds.map((s) => fightWith(s, "top", { expects: "below", fallback: "hold" }));
    const ready = seeds.map((s) => fightWith(s, "top", { expects: "above", fallback: "hold" }));
    expect(total(surprised, (r) => r.attackers.out)).toBeLessThan(total(ready, (r) => r.attackers.out));
  });

  it("drives defenders who fall back down and out from above, and corners them from below", () => {
    const fromAbove = seeds.map((s) => fightWith(s, "top", { fallback: "fallBack" }));
    const fromBelow = seeds.map((s) => fightWith(s, "door", { fallback: "fallBack" }));
    const holding = seeds.map((s) => fightWith(s, "top", { fallback: "hold" }));
    expect(total(fromAbove, (r) => r.defenders.withdrew)).toBeGreaterThan(0);
    expect(total(fromBelow, (r) => r.defenders.withdrew)).toBe(0); // up is no way out
    expect(total(holding, (r) => r.defenders.withdrew)).toBe(0);
  });

  it("sends the next team through the hatch only its interval after the one before", () => {
    const plan = generateFloorPlan(house("h", 16, 12), 2);
    const teams = [["a1", "a2", "a3", "a4"], ["a5", "a6", "a7", "a8"], ["a9", "a10", "a11", "a12"]];
    const f = new InteriorFight({ plan, attack: { entry: "top", grenades: false, teams }, defence: [] }, new Rng(2));
    const inAt: number[] = [];
    while (!f.finished && inAt.length < 3) {
      f.tick();
      const waiting = f.soldiers.filter((m) => m.waiting).length;
      while (inAt.length < 3 - waiting / 4) inAt.push(f.second);
    }
    expect(inAt[0]).toBeGreaterThanOrEqual(CLOSE_QUARTERS.roofAccessSeconds);
    expect(inAt[1]! - inAt[0]!).toBeGreaterThanOrEqual(CLOSE_QUARTERS.roofTeamIntervalSeconds);
    expect(inAt[2]! - inAt[1]!).toBeGreaterThanOrEqual(CLOSE_QUARTERS.roofTeamIntervalSeconds);
  });

  it("sends the next team down to take the stair room when the first is put out there", () => {
    // A lone man first through the hatch, against men holding the top floor:
    // the fight must go on with the next team, not wait three hours.
    let ended = 0;
    for (const s of seeds.slice(0, 20)) {
      const plan = generateFloorPlan(house(`h${s}`, 16, 12), s);
      const rng = new Rng(s);
      const top = plan.storeys.length - 1;
      const posts = defaultDefence(plan, ["d0", "d1", "d2", "d3", "d4", "d5"], rng, true).map((p) => ({ ...p, storey: top, cell: p.storey === top ? p.cell : plan.stairwell!.y * plan.width + plan.stairwell!.x }));
      const r = resolveInteriorFight({ plan, attack: { entry: "top", grenades: false, teams: [["a1"], ["a2", "a3", "a4", "a5"]] }, defence: posts, defenderFallback: "hold" }, rng);
      if (r.seconds < CLOSE_QUARTERS.maxSeconds) ended++;
    }
    expect(ended).toBe(20);
  });

  it("leaves a defender's preparation behind when he falls back", () => {
    let fellBack = 0;
    for (const s of seeds) {
      const plan = generateFloorPlan(house(`h${s}`, 16, 12), s);
      const rng = new Rng(s);
      const defence = defaultDefence(plan, ["d0", "d1", "d2"], rng, true);
      const f = new InteriorFight({ plan, attack: { entry: "top", grenades: false, teams: squad }, defence }, rng);
      while (!f.finished) {
        f.tick();
        for (const m of f.soldiers) if (m.retreat) { expect(m.prepared).toBe(false); fellBack++; }
      }
    }
    expect(fellBack).toBeGreaterThan(0);
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
    // Nobody is in, and nothing thrown, until the climb to the roof is done.
    while (f.second < CLOSE_QUARTERS.roofAccessSeconds) f.tick();
    expect(f.result().grenadesThrown).toBe(0);
    f.tick();
    expect(f.result().grenadesThrown).toBe(1); // the first team's, down the stairwell; the second waits its turn
    expect(f.soldiers.filter((m) => m.waiting).length).toBe(4);
  });

  it("refuses to come down from the top of a house with no stairs", () => {
    const plan = generateFloorPlan(house("bungalow", 16, 12, 1), 1);
    expect(() => new InteriorFight({ plan, attack: { entry: "top", grenades: false, teams: squad }, defence: [] }, new Rng(1))).toThrow(/stairs/);
    expect(() => new InteriorFight({ plan, attack: { entry: "stair", grenades: false, teams: squad }, defence: [] }, new Rng(1))).toThrow(/storey above/);
  });

  describe("by the inside stairs (decision 124)", () => {
    /** The second each storey was wholly cleared, and the ground floor when the top's first room fell. */
    function climb(seed: number, security: string[] = []) {
      const plan = generateFloorPlan(house(`s${seed}`, 16, 12, 3), seed);
      const f = new InteriorFight({ plan, attack: { entry: "stair", grenades: false, teams: squad, ...(security.length ? { security } : {}) }, defence: [] }, new Rng(seed));
      const done: number[] = plan.storeys.map(() => -1);
      let groundAtTop = -1, topAt = -1, footHeld = false;
      const s = plan.stairwell!;
      const foot = s.y * plan.width + s.x;
      while (!f.finished && f.second < 20000) {
        f.tick();
        f.cleared.forEach((c, k) => { if (done[k]! < 0 && c.every((v) => v === 1)) done[k] = f.second; });
        if (groundAtTop < 0 && f.cleared[2]!.some((v) => v === 1)) {
          groundAtTop = f.cleared[0]!.filter((v) => v === 1).length;
          topAt = f.second;
          footHeld = f.soldiers.some((m) => m.side === "BLUE" && m.storey === 0 && m.post?.cell === foot && !m.out);
        }
      }
      return { f, plan, done, groundAtTop, topAt, footHeld };
    }

    it("takes the way to the stairs, clears from the top down, and the ground floor last", () => {
      let partial = 0;
      for (const seed of seeds.slice(0, 20)) {
        const { f, plan, done, groundAtTop, topAt } = climb(seed);
        expect(f.result().outcome, `seed ${seed}`).toBe("cleared");
        expect(done[2]!, `seed ${seed}`).toBeLessThanOrEqual(done[1]!);
        // The ground floor is done either on the way to the stairs (every room of it on the way) or after the storeys above.
        expect(done[0]! < topAt || done[0]! >= done[1]!, `seed ${seed}`).toBe(true);
        expect(groundAtTop, `seed ${seed}`).toBeGreaterThan(0); // the stair room at least
        if (groundAtTop < plan.storeys[0]!.rooms.length - plan.storeys[0]!.cutOff.length) partial++;
      }
      expect(partial).toBeGreaterThan(0); // in some houses rooms below are left for last
    });

    it("leaves a security man holding the stair foot while the teams are above", () => {
      for (const seed of seeds.slice(0, 10)) expect(climb(seed, ["s1", "s2"]).footHeld, `seed ${seed}`).toBe(true);
    });

    it("sends a team that joins after the top is cleared to the storey still to clear, not the top", () => {
      let joined = 0;
      for (const seed of seeds.slice(0, 10)) {
        const plan = generateFloorPlan(house(`s${seed}`, 16, 12, 3), seed);
        const f = new InteriorFight({ plan, attack: { entry: "stair", grenades: false, teams: [["a1", "a2", "a3", "a4"]] }, defence: [] }, new Rng(seed));
        while (!f.finished && !f.cleared[2]!.every((v) => v === 1)) f.tick();
        if (f.finished || f.cleared[1]!.every((v) => v === 1)) continue;
        f.join([["j1", "j2", "j3", "j4"]]);
        joined++;
        while (!f.finished) {
          f.tick();
          expect(f.soldiers.filter((m) => m.id.startsWith("j")).every((m) => m.storey !== 2), `seed ${seed}`).toBe(true);
        }
        expect(f.result().outcome, `seed ${seed}`).toBe("cleared");
      }
      expect(joined).toBeGreaterThan(0);
    });

    it("climbs a flight a storey: later onto the top than a single flight would take", () => {
      const plan = generateFloorPlan(house("s1", 16, 12, 3), 1);
      const f = new InteriorFight({ plan, attack: { entry: "stair", grenades: false, teams: [["a1", "a2", "a3", "a4"]] }, defence: [] }, new Rng(1));
      const team = (f as unknown as { teams: { phase: string }[] }).teams[0]!;
      let onStairs = -1;
      while (!f.finished && f.second < 20000 && !f.soldiers.some((m) => m.storey === 2)) {
        f.tick();
        if (onStairs < 0 && team.phase === "stairs") onStairs = f.second;
      }
      expect(onStairs).toBeGreaterThan(0);
      expect(f.second - onStairs).toBeGreaterThanOrEqual(2 * CLOSE_QUARTERS.stairUpSeconds);
    });
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
