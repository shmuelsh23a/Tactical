import { describe, it, expect } from "vitest";
import { Game, type GameOptions } from "./game.js";
import { makeInfantry } from "./units.js";
import { roundSuppressionChance, shellingSuppression } from "./morale.js";
import { CHECKED_SUPPRESSION_REACH, ROOF_SUPPRESSION_FACTOR, SUPPRESSION, SUPPRESSION_CHANCE } from "./data/morale.js";
import { FORCE_FOOTPRINT_RADIUS_M } from "./data/lethality.js";
import { replayGame } from "./recording.js";

/**
 * Rules decision 92: FM 7-90 B-7's suppression radii are chances — probable,
 * even, little — and a mission's rounds combine as chances, adding a share of
 * what is left below the cap, rather than an amount a round.
 */
describe("a shell's suppression is a chance (decision 92)", () => {
  it("reads FM 7-90's bands as probable, even and little", () => {
    const edge = (m: number) => m + FORCE_FOOTPRINT_RADIUS_M;
    const r = CHECKED_SUPPRESSION_REACH.mortar!;
    expect(roundSuppressionChance("mortar", edge(r.full), "checked")).toBe(SUPPRESSION_CHANCE.full);
    expect(roundSuppressionChance("mortar", edge(r.half), "checked")).toBe(SUPPRESSION_CHANCE.half);
    expect(roundSuppressionChance("mortar", edge(r.little), "checked")).toBe(SUPPRESSION_CHANCE.little);
    expect(roundSuppressionChance("mortar", edge(r.little + 1), "checked")).toBe(0);
  });

  it("saturates: a sure mission adds half of what is left, and more fire adds less", () => {
    expect(shellingSuppression(0, 0)).toBe(50);
    expect(shellingSuppression(0, 50)).toBe(25);
    expect(shellingSuppression(0, SUPPRESSION.max)).toBe(0);
    // One round within 30 m of a fresh force pins it: 0.9 × 0.5 × 100.
    expect(shellingSuppression(1 - SUPPRESSION_CHANCE.full, 0)).toBeCloseTo(45);
    // Sure fire every turn, halving between, settles near two-thirds of the cap.
    let s = 0;
    for (let t = 0; t < 30; t++) s = (s + shellingSuppression(0, s)) / 2;
    expect(2 * s).toBeCloseTo(200 / 3, 0);
  });

  // RED's squad 50 m from BLUE's mortar's aim, under `rounds` bombs in one
  // turn. Seed 7 because its first bomb lands 45 m from the squad's point —
  // inside the 30 m band of its nearest man, outside the lethal blast — so
  // the single-bomb case reads the "probable" chance; seed 5's lands at 76 m.
  const shell = (rounds: number, opts: Partial<GameOptions> = {}, seed = 7, roofed = false) => {
    const g = new Game({ seed, morale: true, enforceC2: false, commandEchelon: { RED: "company", BLUE: "company" }, ...opts });
    const squad = makeInfantry("R1", "RED", "squad", { x: 50, y: 0 }, 8);
    if (roofed) squad.baseCover = "full";
    g.addUnit(squad);
    g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: -600 }, 8));
    g.beginTurn();
    g.advanceToPhase("targeting");
    g.queueIndirectFire("mortar", "BLUE", { x: 0, y: 0 }, { rounds });
    g.advanceToPhase("summary");
    g.advanceToPhase("initiative");
    g.advanceToPhase("resolvePriorArty");
    return { suppression: g.getUnit("R1").suppression ?? 0, shelled: g.fireReceived("R1", g.turn).filter((f) => f.kind === "indirect").length };
  };

  it("one bomb within 30 m pins a fresh force: 45, where as an amount it was 25", () => {
    expect(shell(1).suppression).toBe(45);
    expect(shell(1, { suppressionByChance: false }).suppression).toBe(25);
  });

  it("a whole mission no longer saturates a force; as amounts it did", () => {
    for (const seed of [5, 7, 11, 20]) {
      const chance = shell(12, {}, seed).suppression;
      expect(chance).toBeGreaterThan(0);
      expect(chance).toBeLessThanOrEqual(50);
      expect(shell(12, { suppressionByChance: false }, seed).suppression).toBeGreaterThan(50);
    }
  });

  it("every round still counts as shelling, for the nerve and the fire log", () => {
    const chance = shell(12);
    expect(chance.shelled).toBeGreaterThan(1);
    expect(chance.shelled).toBe(shell(12, { suppressionByChance: false }).shelled);
  });

  it("a roof still halves it (decision 63, S3)", () => {
    expect(shell(1, {}, 7, true).suppression).toBe(Math.round(45 * ROOF_SUPPRESSION_FACTOR));
  });

  it("is on in a new game, recorded, and off in a recording made before it", () => {
    const r = new Game({ seed: 1 }).toRecording();
    expect(r.suppressionByChance).toBe(true);
    expect(replayGame(r).suppressionByChance).toBe(true);
    delete (r as { suppressionByChance?: boolean }).suppressionByChance;
    expect(replayGame(r).suppressionByChance).toBe(false);
  });
});
