import { describe, it, expect } from "vitest";
import { telAzekaAssaultListing } from "../app/scenarios/telAzekaAssault.js";
import { PLAIN_SCRIPT } from "../app/drill.js";
import { DEFAULT_FIRE_CHOICES, runScenarioBattle, runScenario } from "./scenarioBattle.js";

/**
 * The headless scenario runner: a generated scenario played on its real
 * ground with no browser. Kept small here so it cannot rot; the measurements
 * are `npm run scenario-sim` (docs/balance.md).
 */
describe("the headless scenario runner", () => {
  const plain = { drill: PLAIN_SCRIPT, fire: DEFAULT_FIRE_CHOICES };
  const recon = {
    drill: { ...PLAIN_SCRIPT, scouting: { watchTurns: 1 } },
    company: { recon: { scouts: 2, lookTurns: 4, scoutFrom: "vantage" as const }, waitIn: "deadGround" as const },
    fire: { ...DEFAULT_FIRE_CHOICES, waitForContact: true },
  };

  it("plays a scenario to an end, the same way every time from the same seed", () => {
    const a = runScenarioBattle(telAzekaAssaultListing, 11, plain);
    const b = runScenarioBattle(telAzekaAssaultListing, 11, plain);
    expect(a).toEqual(b);
    expect(a.turns).toBeGreaterThan(0);
    expect(a.down.RED + a.down.BLUE).toBeGreaterThan(0);
  });

  it("plays a company that reconnoitres from an observation point and waits in dead ground", () => {
    const r = runScenarioBattle(telAzekaAssaultListing, 11, recon);
    expect(r.released).toBeDefined();
    expect(r.missions.BLUE).toBeGreaterThan(0);
  });

  it("sums a set of battles", () => {
    const s = runScenario(telAzekaAssaultListing, [11, 12], plain);
    expect(s.battles).toBe(2);
    expect(s.attackerWins + s.defenderWins + s.draws).toBe(2);
  });
});
