import { describe, it, expect } from "vitest";
import { distance, underRoof } from "../../engine/index.js";
import { buildYokneamUrbanScenario } from "./yokneamUrban.js";

/**
 * What the urban test bed's layout depends on (rules decisions 75–78). A
 * regenerated map or a moved force that breaks one of these fails here,
 * not in a measurement.
 */
describe("the urban test bed", () => {
  const { game } = buildYokneamUrbanScenario();
  const u = (id: string) => game.getUnit(id);

  it("puts RED's squads in houses, under a roof", () => {
    for (const id of ["RED-A-1", "RED-A-2", "RED-A-3"]) {
      expect(underRoof(game.terrain, u(id).position), id).toBe(true);
      expect(u(id).cover).toBe("full");
    }
  });

  it("gives the tanks a sight of the edge house from their overwatch, outside the RPG's 300 m", () => {
    expect(game.hasLineOfSight(u("BLUE-T1"), u("RED-A-2"))).toBe(true);
    for (const t of ["BLUE-T1", "BLUE-T2", "BLUE-APC1", "BLUE-APC2"]) {
      for (const r of ["RED-A-1", "RED-A-2", "RED-A-3"]) {
        expect(distance(u(t).position, u(r).position)).toBeGreaterThan(300);
      }
    }
  });

  it("hides the reserve behind the edge from the low ground", () => {
    expect(game.hasLineOfSight(u("BLUE-T1"), u("RED-A-1"))).toBe(false);
    expect(game.hasLineOfSight(u("BLUE-T2"), u("RED-A-1"))).toBe(false);
  });

  it("brings two heavy APCs and two tanks", () => {
    expect(u("BLUE-APC1").vehicle!.vehicleClass).toBe("heavyApc");
    expect(u("BLUE-T1").vehicle!.vehicleClass).toBeUndefined();
  });
});
