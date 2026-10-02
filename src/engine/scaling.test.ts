import { describe, it, expect, vi } from "vitest";
import { Game } from "./game.js";
import { makeInfantry } from "./units.js";
import type { Side } from "./types.js";

/**
 * What a turn costs must grow with the forces, not with the men in them
 * (README, after rules decision 74). The expensive step is a line of sight —
 * the ground is sampled along it — and it is asked between forces. A rule
 * that asked it per soldier (each man his own view, Combat Mission's
 * "relative spotting") would multiply it by the size of a squad, and a
 * brigade's 3,000 men would not play. This plays one small battle twice,
 * with squads of 8 and of 40, and counts the sight lines each turn asks.
 */
function sightLinesPerTurn(men: number): number {
  // The knowledge model and still detection are on in every scenario, and
  // are what put observation through the line of sight.
  const g = new Game({ seed: 3, trackIntel: true, stillDetection: true });
  for (let i = 0; i < 4; i++) {
    g.addUnit(makeInfantry(`B${i}`, "BLUE", "squad", { x: i * 60, y: 0 }, men));
    g.addUnit(makeInfantry(`R${i}`, "RED", "squad", { x: i * 60, y: 400 }, men));
  }
  for (let i = 0; i < 4; i++) {
    g.setStandingOrder(`B${i}`, {
      gait: "normal",
      destination: { x: i * 60, y: 380 },
      engage: { targetId: `R${i}`, weapon: "smallArms" },
    });
    g.setStandingOrder(`R${i}`, { gait: "normal", engage: { targetId: `B${i}`, weapon: "smallArms" } });
  }
  const sight = vi.spyOn(g, "hasLineOfSight");
  const turns = 6;
  g.beginTurn();
  for (let t = 0; t < turns; t++) {
    while (g.phase !== "summary") {
      g.advancePhase();
      if (g.phase === "movement" || g.phase === "combat") {
        for (const side of ["BLUE", "RED"] as Side[]) g.executeStandingOrders(side);
      }
    }
    g.advancePhase();
  }
  return sight.mock.calls.length / turns;
}

describe("the cost of a turn at scale", () => {
  it("asks for sight lines by force, not by soldier", () => {
    const small = sightLinesPerTurn(8);
    const large = sightLinesPerTurn(40);
    expect(small).toBeGreaterThan(0);
    // Five times the men; the battle differs a little (more men, more hits),
    // so allow some slack. Measured 2026-10-02: 20 a turn with squads of 8,
    // 16 with squads of 40; the same observation asked once per man gave 107
    // and 335.
    expect(large).toBeLessThan(small * 1.5);
  });
});
