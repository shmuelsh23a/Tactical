import { describe, it, expect } from "vitest";
import { Game } from "../game.js";
import { Rng } from "../rng.js";
import { makeInfantry } from "../units.js";
import { replayGame, sealRecording, verifyRecording } from "../recording.js";
import { resolveDirectExplosive } from "../combat/explosives.js";
import { resolveDirectFire } from "../combat/directFire.js";
import type { MapObject } from "../terrain.js";
import { CELL_KIND, generateFloorPlan } from "./floorPlan.js";
import { defaultDefence } from "./resolver.js";
import { GOES_INSIDE } from "./coupling.js";

/**
 * Through the windows (rules decision 98): a fight inside meets the street.
 * A defender stands at a window facing the enemy unless planned otherwise,
 * fires out through it and is seen through it; fire into the building finds
 * only such men and those still in the street; a round that gets in bursts
 * in one room.
 */
const house: MapObject = {
  id: "house",
  kind: "building",
  height: 6,
  footprint: { shape: "polygon", points: [{ x: 100, y: 100 }, { x: 116, y: 100 }, { x: 116, y: 112 }, { x: 100, y: 112 }] },
};
const centre = { x: 108, y: 106 };

/** R-1 in the house, B-1 assaulting it, and B-2 standing off `metres` away at `angle` radians from its middle. */
function battle(seed: number, angle: number, opts: { windowFire?: boolean } = {}, metres = 40) {
  const g = new Game({ seed, enforceC2: false, terrain: { objects: [house] }, ...opts });
  g.addUnit(makeInfantry("R-1", "RED", "squad", { ...centre }, 4));
  const door = g.interior.frontDoor(g, house)!;
  const dx = door.x - centre.x, dy = door.y - centre.y, d = Math.hypot(dx, dy);
  g.addUnit(makeInfantry("B-1", "BLUE", "squad", { x: door.x + (10 * dx) / d, y: door.y + (10 * dy) / d }, 8));
  g.addUnit(makeInfantry("B-2", "BLUE", "squad", { x: centre.x + metres * Math.cos(angle), y: centre.y + metres * Math.sin(angle) }, 8));
  g.beginTurn();
  g.advanceToPhase("combat");
  expect(g.assault("B-1", "R-1", 0).reason).toBe(GOES_INSIDE);
  g.advanceToPhase("initiative"); // the fight begins as the turn closes
  g.advanceToPhase("combat");
  return g;
}

const angles = Array.from({ length: 8 }, (_, k) => (k * Math.PI) / 4);

describe("through the windows (decision 98)", () => {
  it("posts a defender at the window of his room that faces the enemy, and one whose room has none back in it", () => {
    let atWindow = 0, back = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const plan = generateFloorPlan(house, seed);
      const cells = plan.storeys.map((s) => s.cells);
      const ids = ["d1", "d2", "d3", "d4", "d5", "d6"];
      const toward = { x: 1, y: 0 };
      const facing = defaultDefence(plan, ids, new Rng(seed), false, toward);
      const plain = defaultDefence(plan, ids, new Rng(seed), false);
      facing.forEach((post, k) => {
        // The same rooms either way: the window costs no draw.
        expect(plan.storeys[post.storey]!.roomOf[post.cell]).toBe(plan.storeys[plain[k]!.storey]!.roomOf[plain[k]!.cell]);
        if (post.window === undefined) { back++; expect(post.cell).toBe(plain[k]!.cell); return; }
        atWindow++;
        expect(cells[post.storey]![post.window]).toBe(CELL_KIND.window);
        // The street is beyond it on the side the enemy is.
        expect(cells[post.storey]![post.window + 1]).toBe(CELL_KIND.outside);
      });
    }
    expect(atWindow).toBeGreaterThan(0);
    expect(back).toBeGreaterThan(0);
  });

  it("lets fire from the street find only the men at windows facing it, and none at all where nobody faces it", () => {
    let hits = 0, noTarget = 0;
    for (let seed = 1; seed <= 6; seed++) {
      for (const angle of angles) {
        const g = battle(seed, angle);
        const shown = new Set((g.interior.shown(g, "R-1", g.getUnit("B-2").position) ?? []).map((m) => m.soldierId));
        const before = new Map(g.getUnit("R-1").soldiers!.map((s) => [s.id, s.damagePoints]));
        const r = g.fire("B-2", "R-1", { weapon: "smallArms" });
        if (shown.size === 0) {
          noTarget++;
          expect(r.fired).toBe(false);
          expect(r.reason).toBe("no line of sight");
        }
        for (const s of g.getUnit("R-1").soldiers!) {
          if (s.damagePoints > before.get(s.id)!) {
            hits++;
            expect(shown.has(s.id)).toBe(true);
          }
        }
      }
    }
    expect(hits).toBeGreaterThan(0);
    expect(noTarget).toBeGreaterThan(0);
  });

  it("fires out with only the men at windows facing the target", () => {
    let fired = 0;
    for (let seed = 1; seed <= 6; seed++) {
      for (const angle of angles) {
        const g = battle(seed, angle);
        const shown = g.interior.shown(g, "R-1", g.getUnit("B-2").position) ?? [];
        const r = g.fire("R-1", "B-2", { weapon: "smallArms" });
        expect(r.shooters).toBeLessThanOrEqual(shown.length);
        if (shown.length === 0) expect(r.fired).toBe(false);
        if (r.fired) fired++;
      }
    }
    expect(fired).toBeGreaterThan(0);
  });

  it("bursts a round that got in among the men of one room, of both sides, and nobody else", () => {
    const a = makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 4);
    const t = makeInfantry("T", "RED", "squad", { x: 50, y: 0 }, 6);
    const other = makeInfantry("O", "BLUE", "squad", { x: 50, y: 0 }, 4);
    const inRoom = { T: new Set(["T-s1"]), O: new Set(["O-s2"]) };
    const ids = (u: typeof t) => u.soldiers!.map((s) => s.id);
    expect(ids(t)).toContain("T-s1");
    expect(ids(other)).toContain("O-s2");
    let caught = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const u of [t, other]) for (const s of u.soldiers!) { s.damagePoints = 0; s.neutralized = false; }
      t.neutralized = other.neutralized = false;
      resolveDirectExplosive(new Rng(seed), "rifleGrenade", a, t, {
        hasLineOfSight: true,
        lethality: "research",
        critical: { chance: 1, factor: 2.5, room: { candidates: [t, other], pools: (u) => inRoom[u.id as "T" | "O"] } },
      });
      for (const u of [t, other]) {
        for (const s of u.soldiers!) {
          if (s.damagePoints === 0) continue;
          caught++;
          expect(inRoom[u.id as "T" | "O"].has(s.id)).toBe(true);
        }
      }
    }
    expect(caught).toBeGreaterThan(0);
  });

  it("finds the room under a round that came through the roof, with everyone in it", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const g = battle(seed, 0);
      const e = g.interior.engagementOf("R-1")!;
      const plan = e.fight.plan;
      const top = plan.storeys.length - 1;
      for (const m of e.fight.soldiers) {
        if (m.out || m.storey !== top) continue;
        const room = plan.storeys[top]!.roomOf[m.cell]!;
        if (room < 0) continue;
        const x = m.cell % plan.width, y = (m.cell - x) / plan.width;
        const lx = (x + 0.5) * plan.cellM, ly = (y + 0.5) * plan.cellM;
        const at = { x: plan.origin.x + lx * plan.axis.x - ly * plan.axis.y, y: plan.origin.y + lx * plan.axis.y + ly * plan.axis.x };
        const burst = g.interior.roomBurst(g, "house", { roof: at })!;
        const everyone = [...burst.values()].flatMap((s) => [...s]);
        expect(everyone).toContain(m.id);
        expect(everyone.sort()).toEqual(e.fight.inRoom(top, room).sort());
      }
    }
  });

  it("bursts among the men of the room wherever their forces' marks stand on the map", () => {
    const a = makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 4);
    const t = makeInfantry("T", "RED", "squad", { x: 50, y: 0 }, 6);
    const far = makeInfantry("O", "BLUE", "squad", { x: 50, y: 200 }, 4); // its mark at the door of a big building
    let caught = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const s of far.soldiers!) { s.damagePoints = 0; s.neutralized = false; }
      far.neutralized = false;
      resolveDirectExplosive(new Rng(seed), "rifleGrenade", a, t, {
        hasLineOfSight: true,
        lethality: "research",
        critical: { chance: 1, factor: 2.5, room: { candidates: [far], pools: () => new Set(far.soldiers!.map((s) => s.id)) } },
      });
      caught += far.soldiers!.filter((s) => s.damagePoints > 0).length;
    }
    expect(caught).toBeGreaterThan(0);
  });

  it("counts no hit once every man it could reach is down", () => {
    const a = makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 10);
    const t = makeInfantry("T", "RED", "squad", { x: 10, y: 0 }, 6);
    const one = new Set([t.soldiers![0]!.id]);
    for (let seed = 1; seed <= 30; seed++) {
      for (const s of t.soldiers!) { s.damagePoints = 0; s.neutralized = false; }
      t.neutralized = false;
      const r = resolveDirectFire(new Rng(seed), a, t, { weapon: "smallArms", hasLineOfSight: true, targetPool: one });
      // One man to hit: light wounds of 2 points put him out at the fourth (decision 26), so never more than four hits.
      expect(r.hits).toBeLessThanOrEqual(4);
      expect(t.soldiers!.slice(1).every((s) => s.damagePoints === 0)).toBe(true);
    }
  });

  it("puts a round through the roof into a room even when it comes down on a wall, never on the whole building", () => {
    let checked = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const g = battle(seed, 0);
      // The corner of the house: the outside wall, not a room. Still a room, and only the fight's forces.
      const corner = g.interior.roomBurst(g, "house", { roof: { x: 100.1, y: 100.1 } });
      expect([...corner!.keys()].sort()).toEqual(["B-1", "R-1"]);
      // On the outside wall of a man's room, it bursts in his room.
      const e = g.interior.engagementOf("R-1")!;
      const plan = e.fight.plan, top = plan.storeys.length - 1, w = plan.width;
      const cells = plan.storeys[top]!.cells, roomOf = plan.storeys[top]!.roomOf;
      for (const m of e.fight.soldiers) {
        if (m.out || m.withdrew || m.storey !== top || roomOf[m.cell]! < 0) continue;
        const room = roomOf[m.cell]!;
        const wall = cells.findIndex((k, i) => k === CELL_KIND.wall && [i - 1, i + 1, i - w, i + w].some((j) => roomOf[j] === room) && [i - 1, i + 1, i - w, i + w].some((j) => cells[j] === CELL_KIND.outside));
        if (wall < 0) continue;
        const x = wall % w, y = (wall - x) / w;
        const lx = (x + 0.5) * plan.cellM, ly = (y + 0.5) * plan.cellM;
        const at = { x: plan.origin.x + lx * plan.axis.x - ly * plan.axis.y, y: plan.origin.y + lx * plan.axis.y + ly * plan.axis.x };
        const burst = g.interior.roomBurst(g, "house", { roof: at })!;
        expect([...burst.values()].flatMap((s) => [...s])).toContain(m.id);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("aims by what the engine fires by: a force it cannot engage draws no shot and no answer", () => {
    let refused = 0;
    for (let seed = 1; seed <= 6; seed++) {
      for (const angle of angles) {
        const g = battle(seed, angle);
        // A RED force outside covering B-2 from behind: a shot B-2 took would spring it.
        g.addUnit(makeInfantry("R-2", "RED", "squad", { x: centre.x + 60 * Math.cos(angle), y: centre.y + 60 * Math.sin(angle) }, 8));
        g.setCovering("R-2", true);
        const b2 = g.getUnit("B-2");
        if (g.canEngage(b2, g.getUnit("R-1"))) continue;
        refused++;
        const r = g.fire("B-2", "R-1", { weapon: "smallArms" });
        expect(r.fired).toBe(false);
        expect(r.coveringFire).toEqual([]);
        expect(g.getUnit("R-2").covering).toBeDefined(); // the posture was not spent
      }
    }
    expect(refused).toBeGreaterThan(0);
  });

  it("refuses all fire from a fight inside without it, as recorded before it", () => {
    const g = battle(1, 0, { windowFire: false });
    expect(g.fire("R-1", "B-2", { weapon: "smallArms" }).fired).toBe(false);
    expect(g.toRecording().windowFire).toBeUndefined();
  });

  it("replays a battle with fire through the windows to exactly the same state", () => {
    const g = battle(2, Math.PI / 2);
    g.fire("B-2", "R-1", { weapon: "smallArms" });
    g.fire("R-1", "B-2", { weapon: "smallArms" });
    g.advanceToPhase("initiative");
    const sealed = JSON.parse(JSON.stringify(sealRecording(g.toRecording())));
    expect(sealed.windowFire).toBe(true);
    expect(verifyRecording(sealed)).toEqual({ checked: true, ok: true });
    expect(replayGame(sealed).getUnit("R-1").soldiers!.map((s) => s.damagePoints)).toEqual(g.getUnit("R-1").soldiers!.map((s) => s.damagePoints));
  });
});
