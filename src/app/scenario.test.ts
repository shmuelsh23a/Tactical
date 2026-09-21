import { describe, it, expect } from "vitest";
import { buildDemoScenario, DEFAULT_SCENARIO, scenarioById, SCENARIOS } from "./scenario.js";
import { makeInfantry } from "../engine/index.js";

/**
 * The demo is laid out on real ground, and its lesson depends on the ground:
 * the northern low ground is dead to every RED position, and the shoulder is
 * where the attack comes into view. Pinned here so a regenerated map or a
 * moved token cannot quietly turn the lesson off.
 */
describe("the demo scenario on Ramat Menashe", () => {
  const { game } = buildDemoScenario();
  const reds = game.units.filter((u) => u.side === "RED");
  const probe = (at: { x: number; y: number }) => {
    const p = makeInfantry("PROBE", "BLUE", "squad", at, 8);
    // Never added to the game, so it takes no cover from the ground: a
    // standing silhouette, which is what a force on the move presents.
    expect(p.cover).toBe("none");
    return p;
  };

  it("hides the first bound up the slope from every RED position", () => {
    for (const r of reds) expect(game.hasLineOfSight(r, probe({ x: 400, y: 160 })), r.id).toBe(false);
  });

  it("hides the start line from the infantry, but the tank's height sees the far low ground", () => {
    // Dead ground is nearer than it looks: from the hilltop a tank's hatches
    // see over the shoulder to the low ground 440 m off, yet not the slope
    // just below the shoulder where the attack actually climbs.
    const startLine = [
      { x: 250, y: 80 },
      { x: 400, y: 60 },
      { x: 460, y: 70 },
    ];
    for (const id of ["RED-1", "RED-2", "RED-HQ"]) {
      for (const at of startLine) {
        expect(game.hasLineOfSight(game.getUnit(id), probe(at)), `${id} → ${at.x},${at.y}`).toBe(false);
      }
    }
    expect(game.hasLineOfSight(game.getUnit("RED-TANK"), probe({ x: 400, y: 60 }))).toBe(true);
  });

  it("shows the shoulder to the forward squad, the ridge squad and the tank", () => {
    const onTheShoulder = probe({ x: 400, y: 260 });
    for (const id of ["RED-1", "RED-2", "RED-TANK"]) {
      expect(game.hasLineOfSight(game.getUnit(id), onTheShoulder), id).toBe(true);
    }
    // The command group in its house on the reverse slope sees none of it.
    expect(game.hasLineOfSight(game.getUnit("RED-HQ"), onTheShoulder)).toBe(false);
  });

  it("gives each RED force the cover the ground was chosen for", () => {
    // The tank stands 4.6 m from the nearest house — outside the 3 m reach on
    // purpose, since full cover would drop its eye to 0.5 m and switch the
    // far-low-ground lesson off. A regenerated map that moves that house
    // fails here rather than in play.
    expect(game.getUnit("RED-HQ").cover).toBe("full");
    for (const id of ["RED-1", "RED-2", "RED-TANK"]) expect(game.getUnit(id).cover, id).toBe("none");
    expect(game.terrain.objects.length).toBeGreaterThan(200);
  });
});

/**
 * The picker offers whatever is in the catalogue, so the catalogue is what has
 * to be true: a battle listed there is one the app can actually open, and the
 * line the player chose by is the line the header then draws.
 */
describe("the battle catalogue", () => {
  it("lists at least two battles, since choosing between one is not a choice", () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(2);
  });

  it("gives every battle a distinct id", () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("opens the demo by default, and the default is one of the listed battles", () => {
    expect(SCENARIOS).toContain(DEFAULT_SCENARIO);
    expect(DEFAULT_SCENARIO.build().title).toBe(buildDemoScenario().title);
  });

  it("falls back to the default rather than throwing on an id it does not know", () => {
    // The id round-trips through the UI, so a stale one opens the demo instead
    // of a blank screen.
    expect(scenarioById("no-such-battle")).toBe(DEFAULT_SCENARIO);
    for (const entry of SCENARIOS) expect(scenarioById(entry.id)).toBe(entry);
  });

  for (const entry of SCENARIOS) {
    describe(entry.id, () => {
      const scn = entry.build();

      it("is labelled in Hebrew, with a line saying what its ground asks", () => {
        // Both come from the spec through the generator; this catches a module
        // edited by hand, which is the one way they could drift.
        expect(entry.title.trim()).not.toBe("");
        expect(entry.brief.trim()).not.toBe("");
        for (const text of [entry.title, entry.brief]) expect(text).toMatch(/[\u0590-\u05FF]/);
      });

      it("carries the same title the header will draw", () => {
        expect(scn.title).toBe(entry.title);
      });

      it("is a battle and not an empty map: both sides are on it, inside the window", () => {
        for (const side of ["BLUE", "RED"] as const) {
          expect(scn.game.units.filter((u) => u.side === side).length, side).toBeGreaterThan(0);
        }
        for (const u of scn.game.units) {
          expect(u.position.x, u.id).toBeGreaterThanOrEqual(0);
          expect(u.position.x, u.id).toBeLessThanOrEqual(scn.mapWidth);
          expect(u.position.y, u.id).toBeGreaterThanOrEqual(0);
          expect(u.position.y, u.id).toBeLessThanOrEqual(scn.mapHeight);
        }
      });

      it("lays its ground under the battle, and the ground covers the window", () => {
        // A battle on FLAT_GROUND would still play, and every lesson either of
        // these maps teaches is relief — so an entry whose heightfield went
        // missing is a broken battle rather than a plain one.
        const hf = scn.game.terrain.heightfield;
        expect(hf, entry.id).toBeDefined();
        if (!hf) return;
        expect(hf.heights.length).toBe(hf.columns * hf.rows);
        expect((hf.columns - 1) * hf.spacing).toBeGreaterThanOrEqual(scn.mapWidth);
        expect((hf.rows - 1) * hf.spacing).toBeGreaterThanOrEqual(scn.mapHeight);
      });
    });
  }
});
