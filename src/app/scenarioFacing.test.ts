import { describe, expect, it } from "vitest";
import { SCENARIOS } from "./scenario.js";
import { angleBetween, bearingDegrees } from "../engine/index.js";

/**
 * A prepared defender faces the attack it was told to expect (rules decision
 * 85): each spec's `facing` is the bearing from the position to the
 * attacker's start line — the mean of its non-command forces, the brief's
 * tasking — worked out when the spec was written. The spec carries the
 * number, so this is what notices when a start line or a position moves and
 * the facing does not.
 */
describe("prepared defenders face the attack's start line", () => {
  for (const listing of SCENARIOS) {
    it(listing.id, () => {
      const g = listing.build().game;
      const attackers = new Set(g.attackers);
      const start = g.units.filter((u) => attackers.has(u.side) && u.kind !== "command");
      if (start.length === 0) return;
      const at = {
        x: start.reduce((t, u) => t + u.position.x, 0) / start.length,
        y: start.reduce((t, u) => t + u.position.y, 0) / start.length,
      };
      for (const u of g.units) {
        if (attackers.has(u.side) || u.kind === "vehicle" || u.baseCover === "none") continue;
        expect(u.front, u.id).toBeDefined();
        // Within a few degrees: the spec rounds to the degree.
        expect(angleBetween(u.front!, bearingDegrees(u.position, at)), u.id).toBeLessThan(3);
      }
    });
  }
});
