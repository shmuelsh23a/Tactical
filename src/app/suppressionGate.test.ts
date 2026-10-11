import { describe, expect, it } from "vitest";
import { telAzekaAssaultListing } from "./scenarios/telAzekaAssault.js";
import { PLAIN_SCRIPT } from "./drill.js";
import { DEFAULT_FIRE_CHOICES, runScenarioBattle } from "../sim/scenarioBattle.js";
import type { CompanyPlan, SuppressionGate } from "./company.js";

/**
 * The doctrinal gate on an assault (TC 3-21.76, Battle Drill 2, steps
 * 11–13): the platoon leader sends the assault in only once the firefight
 * is won, commits more force to the base of fire while it is not, and
 * eventually stops trying.
 *
 * Measured through the headless runner rather than by poking the commander,
 * because what matters is the turn the company is actually let go
 * (`result.released`) and what that costs it.
 */
const RECON: CompanyPlan = { recon: { scouts: 2, lookTurns: 4, scoutFrom: "vantage" }, waitIn: "deadGround" };
const GATE: SuppressionGate = { heldWhileShare: 0.34, enemyHeldShare: 0.5, contactWithin: 400, reinforceAfter: 3, giveUpAfter: 12 };

const play = (company: CompanyPlan, seed = 1000) =>
  runScenarioBattle(telAzekaAssaultListing, seed, { drill: PLAIN_SCRIPT, fire: DEFAULT_FIRE_CHOICES, company });

describe("the doctrinal gate on an assault", () => {
  it("holds the assault later than the scouts alone would", () => {
    const open = play(RECON);
    const gated = play({ ...RECON, suppressionGate: GATE });
    // Both are let go at some point, and the gate's is not earlier: it adds
    // a condition to the scouts' one, never removes it.
    expect(open.released).toBeDefined();
    expect(gated.released ?? Infinity).toBeGreaterThanOrEqual(open.released!);
  });

  it("changes the battle, and the same seed changes it the same way", () => {
    const a = play({ ...RECON, suppressionGate: GATE });
    const b = play({ ...RECON, suppressionGate: GATE });
    expect(a).toEqual(b);
    // …and it is not simply the ungated battle under another name.
    expect(a).not.toEqual(play(RECON));
  });

  it("leaves a company with no gate exactly as it was", () => {
    // The gate is opt-in: every table before 2026-10-11 must still
    // reproduce, so a plan without one may not take a different path.
    const before = play(RECON);
    const after = play({ ...RECON, suppressionGate: undefined });
    expect(after).toEqual(before);
  });

  it("stops waiting and goes in anyway, rather than running the clock out", () => {
    // Two turns' patience: the company cannot win a firefight that fast, so
    // it gives up waiting — and the drill's answer to that is to assault
    // anyway (step 12b–c), not to hold. Holding instead measured 57% of
    // battles out of time against 2% (balance.md).
    const impatient = play({ ...RECON, suppressionGate: { ...GATE, reinforceAfter: 1, giveUpAfter: 2 } });
    const patient = play({ ...RECON, suppressionGate: { ...GATE, giveUpAfter: 40 } });
    // The impatient company is let go, and sooner than the patient one.
    expect(impatient.released).toBeDefined();
    expect(impatient.released!).toBeLessThanOrEqual(patient.released ?? Infinity);
    // And it did not simply sit there: the battle ended before the clock.
    expect(impatient.outOfTime ?? false).toBe(false);
  });
});
