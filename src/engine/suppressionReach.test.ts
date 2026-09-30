import { describe, it, expect } from "vitest";
import { Game } from "./game.js";
import { makeInfantry } from "./units.js";
import { roundSuppression } from "./morale.js";
import { ROOF_SUPPRESSION_FACTOR, SUPPRESSION, SUPPRESSION_REACH_81MM } from "./data/morale.js";
import { FORCE_FOOTPRINT_RADIUS_M } from "./data/lethality.js";
import { replayGame } from "./recording.js";
import type { GameOptions } from "./game.js";

/**
 * Rules decision 63, S1 and S3: a shell suppresses further than it kills
 * (FM 7-90: probable within 30 m of the burst, an even chance at 75 m), and a
 * roof halves what it puts on a force.
 */
describe("how far a round suppresses (decision 63, S1)", () => {
  it("the whole within 30 m of the nearest man, half to 75 m, nothing beyond", () => {
    const edge = (m: number) => m + FORCE_FOOTPRINT_RADIUS_M;
    expect(roundSuppression("mortar", edge(SUPPRESSION_REACH_81MM.full))).toBe(SUPPRESSION.indirect);
    expect(roundSuppression("mortar", edge(SUPPRESSION_REACH_81MM.full + 1))).toBe(SUPPRESSION.indirect / 2);
    expect(roundSuppression("mortar", edge(SUPPRESSION_REACH_81MM.half))).toBe(SUPPRESSION.indirect / 2);
    expect(roundSuppression("mortar", edge(SUPPRESSION_REACH_81MM.half + 1))).toBe(0);
    // A heavier shell reaches further, by the square root of its lethal area.
    expect(roundSuppression("artillery", edge(SUPPRESSION_REACH_81MM.half + 20))).toBe(SUPPRESSION.indirect / 2);
  });

  // RED's squads 50 m and 300 m from BLUE's mortar's aim: beyond the lethal
  // blast's reach (about 37 m from a force's point), inside and outside the
  // suppression reach.
  const shell = (opts: Partial<GameOptions>, roofed = false) => {
    const g = new Game({ seed: 5, morale: true, enforceC2: false, commandEchelon: { RED: "company", BLUE: "company" }, ...opts });
    const near = makeInfantry("R1", "RED", "squad", { x: 50, y: 0 }, 8);
    if (roofed) near.baseCover = "full";
    g.addUnit(near);
    const far = g.addUnit(makeInfantry("R2", "RED", "squad", { x: 300, y: 0 }, 8));
    g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: -600 }, 8));
    g.beginTurn();
    g.advanceToPhase("targeting");
    g.queueIndirectFire("mortar", "BLUE", { x: 0, y: 0 }, { rounds: 1 });
    // It lands at the start of the next turn; read the force before the turn's end halves it.
    g.advanceToPhase("summary");
    g.advanceToPhase("initiative");
    const { resolved } = g.advanceToPhase("resolvePriorArty");
    expect(resolved).toHaveLength(1);
    return { g, near: g.getUnit("R1"), far, impact: resolved![0]!.dispersion.impact };
  };

  it("suppresses a squad the blast does not reach, and not one far off", () => {
    const on = shell({});
    // The round fell short of the near squad's lethal reach, and inside its suppression reach.
    expect(Math.hypot(on.impact.x - 50, on.impact.y)).toBeGreaterThan(40);
    expect(on.near.suppression ?? 0).toBeGreaterThan(0);
    expect(on.far.suppression ?? 0).toBe(0);
    // Before the decision, only the blast's reach was shelled.
    const off = shell({ suppressionReach: false });
    expect(off.near.suppression ?? 0).toBe(0);
  });

  it("a roof halves it (S3)", () => {
    const open = shell({ roofsDampSuppression: false }, true).near.suppression ?? 0;
    const roof = shell({}, true).near.suppression ?? 0;
    expect(open).toBeGreaterThan(0);
    expect(roof).toBeLessThanOrEqual(Math.ceil(open * ROOF_SUPPRESSION_FACTOR));
    expect(roof).toBeGreaterThan(0);
  });

  it("is on in a new game, recorded, and off in a recording made before it", () => {
    const g = new Game({ seed: 1 });
    expect([g.suppressionReach, g.roofsDampSuppression]).toEqual([true, true]);
    const r = g.toRecording();
    expect(replayGame(r).suppressionReach).toBe(true);
    delete (r as { suppressionReach?: boolean }).suppressionReach;
    delete (r as { roofsDampSuppression?: boolean }).roofsDampSuppression;
    const old = replayGame(r);
    expect([old.suppressionReach, old.roofsDampSuppression]).toEqual([false, false]);
  });
});
