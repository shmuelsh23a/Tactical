import { describe, it, expect } from "vitest";
import { buildDemoScenario } from "./scenario.js";
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
