import { describe, it, expect } from "vitest";
import { Game } from "../game.js";
import { makeInfantry, makeVehicle } from "../units.js";
import { replayGame, sealRecording, verifyRecording } from "../recording.js";
import type { MapObject } from "../terrain.js";
import { GOES_INSIDE, INTERIOR_REFUSAL, type InteriorPlan } from "./coupling.js";
import { Rng } from "../rng.js";
import { resolveIndirectFire } from "../combat/indirectFire.js";
import { generateFloorPlan } from "./floorPlan.js";
import { InteriorFight, defaultDefence, plannedDefence } from "./resolver.js";

/**
 * The players' plans inside, as data (rules decision 101): an order for a
 * force — how it goes in, or how it holds — which the fight carries out.
 * What a plan leaves out is the author's default.
 */
const house = (storeys: number): MapObject => ({
  id: "house",
  kind: "building",
  height: storeys * 3,
  footprint: { shape: "polygon", points: [{ x: 100, y: 100 }, { x: 116, y: 100 }, { x: 116, y: 112 }, { x: 100, y: 112 }] },
});

/** R-1 (6 men) in the house, B-1 10 m out from its door; the plans given before turn 1. */
function battle(seed: number, plans: { blue?: InteriorPlan; red?: InteriorPlan } = {}, storeys = 2) {
  const h = house(storeys);
  const g = new Game({ seed, enforceC2: false, terrain: { objects: [h] } });
  g.addUnit(makeInfantry("R-1", "RED", "squad", { x: 108, y: 106 }, 6));
  const door = g.interior.frontDoor(g, h)!;
  const dx = door.x - 108, dy = door.y - 106, d = Math.hypot(dx, dy);
  g.addUnit(makeInfantry("B-1", "BLUE", "squad", { x: door.x + (10 * dx) / d, y: door.y + (10 * dy) / d }, 8));
  g.beginTurn();
  if (plans.blue) g.setInteriorPlan("B-1", plans.blue);
  if (plans.red) g.setInteriorPlan("R-1", plans.red);
  g.advanceToPhase("combat");
  return { g, door, assault: () => g.assault("B-1", "R-1", 0) };
}

/** The fight's private parts a test reads. */
type Inside = { teams: { members: { id: string }[]; grenades: boolean }[]; expects: string };
const insideOf = (g: Game) => g.interior.engagements[0]!.fight as unknown as Inside;

describe("plans inside, as data (decision 101)", () => {
  it("takes an order, not a soldier's place, and refuses one it cannot carry out", () => {
    const { g } = battle(1);
    g.addUnit(makeVehicle("B-T", "BLUE", { x: 0, y: 0 }));
    expect(() => g.setInteriorPlan("R-1", { holdStoreys: [-1] })).toThrow();
    expect(() => g.setInteriorPlan("R-1", { holdStoreys: [] })).toThrow();
    expect(() => g.setInteriorPlan("B-T", { entry: "top" })).toThrow();
    expect(() => g.setInteriorPlan("B-1", { entry: "top", grenades: false })).not.toThrow();
  });

  it("goes in by doctrine's teams of four, whatever the plan (the author, 2026-10-20)", () => {
    const { g, assault } = battle(1, { blue: { grenades: false } });
    expect(assault().reason).toBe(GOES_INSIDE);
    g.advanceToPhase("initiative");
    expect(insideOf(g).teams.map((t) => t.members.length)).toEqual([4, 4]);
  });

  it("goes in from the roof where the house has stairs, and is refused where it has one storey", () => {
    const two = battle(2, { blue: { entry: "top" } });
    expect(two.assault().reason).toBe(GOES_INSIDE);
    two.g.advanceToPhase("initiative");
    expect(two.g.interior.entryIn("house")).toBe("top");
    const one = battle(2, { blue: { entry: "top" } }, 1);
    expect(one.assault().reason).toBe(INTERIOR_REFUSAL.noWayFromRoof);
    expect(one.g.interior.engagements).toHaveLength(0);
  });

  it("throws no grenades when told not to, and starts again when told to, mid-fight", () => {
    let before = 0, after = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const { g, assault } = battle(seed, { blue: { grenades: false } });
      assault();
      g.advanceToPhase("initiative");
      for (let t = 0; t < 3 && g.interior.engagements.length; t++) { g.advanceToPhase("summary"); g.advanceToPhase("initiative"); }
      const fight = g.interior.engagements[0]?.fight;
      if (!fight) continue;
      before += fight.result().grenadesThrown;
      g.setInteriorPlan("B-1", { grenades: true });
      for (let t = 0; t < 6 && g.interior.engagements.includes(g.interior.engagements[0]!); t++) { g.advanceToPhase("summary"); g.advanceToPhase("initiative"); }
      after += fight.result().grenadesThrown;
      expect(insideOf(g)?.teams.every((t) => t.grenades) ?? true).toBe(true);
    }
    expect(before).toBe(0);
    expect(after).toBeGreaterThan(0);
  });

  it("holds the storeys the defender's order names, back in the rooms if it says so", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { g, assault } = battle(seed, { red: { holdStoreys: [1], atWindows: false } });
      assault();
      g.advanceToPhase("initiative");
      const fight = g.interior.engagements[0]!.fight;
      const reds = fight.soldiers.filter((m) => m.id.startsWith("R-1"));
      expect(reds.every((m) => m.out || m.withdrew || m.storey === 1 || m.retreat !== undefined)).toBe(true);
      expect(fight.atWindows()).toEqual([]);
    }
  });

  it("holds to the last, and expects the attack from above, when the order says so", () => {
    const { g, assault } = battle(3, { red: { fallBack: false, expects: "above" } });
    assault();
    g.advanceToPhase("initiative");
    const fight = g.interior.engagements[0]!.fight;
    expect(fight.soldiers.filter((m) => m.id.startsWith("R-1")).every((m) => m.holds === true)).toBe(true);
    expect(insideOf(g).expects).toBe("above");
    g.setInteriorPlan("R-1", { fallBack: true });
    g.advanceToPhase("summary");
    g.advanceToPhase("initiative");
    if (g.interior.engagements.length) expect(fight.soldiers.filter((m) => m.id.startsWith("R-1")).every((m) => m.holds === false)).toBe(true);
  });

  it("is not joined through the door when it went in from the roof", () => {
    const { g, door, assault } = battle(4, { blue: { entry: "top" } });
    assault();
    g.advanceToPhase("initiative");
    const dx = door.x - 108, dy = door.y - 106, d = Math.hypot(dx, dy);
    g.addUnit(makeInfantry("B-2", "BLUE", "squad", { x: door.x + (8 * dx) / d, y: door.y + (8 * dy) / d }, 8));
    g.advanceToPhase("combat");
    if (g.interior.engagements.length) expect(g.assault("B-2", "R-1", 0).reason).toBe(INTERIOR_REFUSAL.enteredFromRoof);
  });

  it("replays a battle fought by plans to exactly the same state", () => {
    const { g, assault } = battle(5, { blue: { entry: "door", grenades: false }, red: { holdStoreys: [0], fallBack: false } });
    assault();
    for (let t = 0; t < 3; t++) { g.advanceToPhase("initiative"); g.advanceToPhase("summary"); }
    const sealed = JSON.parse(JSON.stringify(sealRecording(g.toRecording())));
    expect(verifyRecording(sealed)).toEqual({ checked: true, ok: true });
    expect(replayGame(sealed).interior.orderFor("B-1")).toEqual({ entry: "door", grenades: false });
  });

  it("posts the men as the default does when the order says nothing of posts, more men than rooms or not", () => {
    for (let seed = 1; seed <= 4; seed++) {
      const posts = (red?: InteriorPlan) => {
        const h = house(1);
        const g = new Game({ seed, enforceC2: false, terrain: { objects: [h] } });
        g.addUnit(makeInfantry("R-1", "RED", "squad", { x: 108, y: 106 }, 12));
        const door = g.interior.frontDoor(g, h)!;
        const dx = door.x - 108, dy = door.y - 106, d = Math.hypot(dx, dy);
        g.addUnit(makeInfantry("B-1", "BLUE", "squad", { x: door.x + (10 * dx) / d, y: door.y + (10 * dy) / d }, 8));
        g.beginTurn();
        if (red) g.setInteriorPlan("R-1", red);
        g.advanceToPhase("combat");
        g.assault("B-1", "R-1", 0);
        g.advanceToPhase("initiative");
        return g.interior.engagements[0]!.fight.soldiers.filter((m) => m.id.startsWith("R-1")).map((m) => `${m.storey}:${m.cell}`);
      };
      // Each fight has run its first minute; men posted alike fight alike, so the end of it matches too.
      expect(posts({ fallBack: true, expects: "below" })).toEqual(posts());
    }
  });

  it("spreads a planned defence a man to a room each wave, as the default does", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const plan = generateFloorPlan(house(2), seed);
      const rooms = plan.storeys[1]!.rooms.length - plan.storeys[1]!.cutOff.length;
      const ids = Array.from({ length: rooms * 2 + 1 }, (_, k) => `d${k}`);
      const posts = plannedDefence(plan, [{ ids, storeys: [1], atWindows: false }], new Rng(seed), false);
      const perRoom = new Map<number, number>();
      for (const p of posts) {
        expect(p.storey).toBe(1);
        const r = plan.storeys[1]!.roomOf[p.cell]!;
        perRoom.set(r, (perRoom.get(r) ?? 0) + 1);
      }
      expect(Math.max(...perRoom.values())).toBeLessThanOrEqual(3);
      expect(Math.min(...perRoom.values())).toBeGreaterThanOrEqual(2);
      // The same as the default, spread over that storey alone.
      expect(defaultDefence(plan, ids, new Rng(seed), false).length).toBe(posts.length);
    }
  });

  it("brings a man already on the stairs off them when his order turns to holding", () => {
    let caught = 0;
    for (let seed = 1; seed <= 30 && caught < 3; seed++) {
      const plan = generateFloorPlan(house(2), seed);
      const rng = new Rng(seed);
      const fight = new InteriorFight({ plan, attack: { entry: "door", grenades: false, teams: [["a1", "a2", "a3", "a4"], ["a5", "a6", "a7", "a8"]] }, defence: defaultDefence(plan, ["d1", "d2", "d3"], rng), defenderFallback: "fallBack" }, rng);
      for (let t = 0; t < 1800 && !fight.finished; t++) {
        fight.tick();
        const onStairs = fight.soldiers.find((m) => m.retreat?.offStairs !== undefined);
        if (!onStairs) continue;
        fight.setHolds([onStairs.id], true);
        for (let k = 0; k < 30 && !fight.finished; k++) fight.tick();
        expect(onStairs.waiting).not.toBe(true);
        expect(onStairs.retreat).toBeUndefined();
        caught++;
        break;
      }
    }
    expect(caught).toBeGreaterThan(0);
  });

  it("gives a team split off a force the force's plan", () => {
    const { g } = battle(6, { red: { fallBack: false, holdStoreys: [1] } });
    g.advanceToPhase("summary");
    g.advanceToPhase("movement"); // a force is split in planning or movement
    const team = g.detachTeam("R-1", g.getUnit("R-1").soldiers!.slice(0, 2).map((s) => s.id));
    expect(g.interior.orderFor(team.id)).toEqual({ fallBack: false, holdStoreys: [1] });
  });

  it("shows the men waiting on the roof to the street, at roof height (the author: \"seen on the roof\")", () => {
    const { g, assault } = battle(2, { blue: { entry: "top" } });
    expect(assault().reason).toBe(GOES_INSIDE);
    g.advanceToPhase("initiative"); // a minute in: the climb takes three
    const fight = g.interior.engagements[0]!.fight;
    expect(fight.onRoof().length).toBe(8);
    const shown = g.interior.shown(g, "B-1", { x: 108, y: 60 })!;
    const up = shown.filter((m) => m.height > 6);
    expect(up.map((m) => m.soldierId).sort()).toEqual(fight.onRoof().sort());
    // At the edge of the roof nearest the one looking.
    for (const m of up) expect(m.point.y).toBeCloseTo(100, 5);
  });

  it("catches men on a roof in the open, not under it", () => {
    let open = 0, roofed = 0;
    for (let seed = 1; seed <= 300; seed++) {
      for (const onRoof of [true, false]) {
        // Its mark at the door, 40 m off; its roof 1 m from where the round comes down.
        const u = makeInfantry("B-1", "BLUE", "squad", { x: 140, y: 100 }, 8);
        u.cover = "full"; // in a building: under its roof
        const up = new Set(u.soldiers!.slice(0, 4).map((m) => m.id));
        resolveIndirectFire(new Rng(seed), "mortar", { x: 100, y: 100 }, [u], {
          lethality: "research",
          underRoof: () => true,
          ...(onRoof ? { onRoof: () => ({ men: (x) => (x === u ? up : undefined), distance: () => 1 }) } : {}),
        });
        const hit = u.soldiers!.filter((m) => up.has(m.id) && m.damagePoints > 0).length;
        if (onRoof) open += hit; else roofed += hit;
      }
    }
    expect(roofed).toBe(0); // by its mark it is out of reach
    expect(open).toBeGreaterThan(0);
  });
});
