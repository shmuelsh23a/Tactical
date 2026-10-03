import { describe, it, expect } from "vitest";
import { Game } from "./game.js";
import { makeInfantry, makeVehicle } from "./units.js";
import { replayGame } from "./recording.js";
import { Rng } from "./rng.js";
import { resolveBlast } from "./combat/explosives.js";
import { triggerMines } from "./combat/mines.js";
import { roundSuppression } from "./morale.js";
import { SUPPRESSION } from "./data/morale.js";
import { CHECKED_RPG_VS_ARMOR_TO_HIT, explosiveFor, explosiveForChecked } from "./data/lethality.js";
import { MORTAR_DOWN_CHECKED, SHELL_VS_MEN } from "./data/explosives.js";

/** Rules decision 79: the research figures as checked against the sources, 2026-10-03. */
describe("the checked figures (decision 79)", () => {
  it("are on for a new game and off for a recording made before them", () => {
    const g = new Game({ seed: 1 });
    expect(g.checkedFigures).toBe(true);
    const rec = g.toRecording();
    expect(replayGame(rec).checkedFigures).toBe(true);
    delete (rec as { checkedFigures?: boolean }).checkedFigures;
    expect(replayGame(rec).checkedFigures).toBe(false);
  });

  it("give tank HE the 105 mm's lethal area on impact, smaller than the air burst's", () => {
    const area = (bands: readonly { maxRange: number; value: number }[]) => bands.at(-1)!.maxRange;
    expect(area(explosiveForChecked("tankRound", "research", true)!.blastBands)).toBeLessThan(
      area(explosiveFor("tankRound", "research")!.blastBands),
    );
    expect(explosiveForChecked("tankRound", "document", true)).toBe(explosiveFor("tankRound", "document"));
  });

  it("give the RPG against armour the 1976 trial's hit chances, to 500 m", () => {
    expect(explosiveForChecked("rpgVsArmor", "research", true)!.toHitBands).toBe(CHECKED_RPG_VS_ARMOR_TO_HIT);
    expect(CHECKED_RPG_VS_ARMOR_TO_HIT.at(-1)!.maxRange).toBe(500);
  });

  it("throw a charge's fragments in a fan towards the way the enemy came", () => {
    const caught = (checked: boolean) => {
      const mover = makeInfantry("M", "BLUE", "squad", { x: 0, y: 5 }, 8);
      const behind = makeInfantry("B", "BLUE", "squad", { x: 0, y: 40 }, 8);
      const mine = { id: "m", side: "RED" as const, type: "antiPersonnel" as const, position: { x: 0, y: 0 }, armed: true, detected: false };
      // Activation is drawn first; a seed whose charge goes off.
      for (let seed = 1; seed < 50; seed++) {
        const { detonations } = triggerMines(new Rng(seed), mover, { x: 0, y: -30 }, { x: 0, y: 5 }, [mine], [mover, behind], 0, "document", checked, "research");
        if (detonations[0]?.activated) return detonations[0].blast!.targets.map((t) => t.unitId);
      }
      throw new Error("no seed set the charge off");
    };
    expect(caught(true)).toEqual(["M"]); // the force behind it is outside the fan
    expect(caught(false)).toContain("B");
  });

  it("let a mortar bomb find men down at ×0.5, not the 155 mm's ×0.36", () => {
    expect(MORTAR_DOWN_CHECKED).toBe(0.5);
    expect(SHELL_VS_MEN.impact.down).toBe(0.36);
    // The factor draws no dice: on one seed the same rounds land in the same
    // places with the switch on or off, and only the chance differs.
    const chances = (checked: boolean) => {
      const g = new Game({ seed: 3, enforceC2: false, checkedFigures: checked, commandEchelon: { RED: "battalion", BLUE: "battalion" } });
      const red = g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 8));
      g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 3000 }, 8));
      g.beginTurn();
      g.advanceToPhase("targeting");
      g.queueIndirectFire("mortar", "BLUE", { x: 0, y: 0 }, { rounds: 60 });
      g.advanceToPhase("summary");
      g.advanceToPhase("initiative");
      red.downUnderShelling = true;
      const { resolved } = g.advanceToPhase("resolvePriorArty");
      return resolved!.flatMap((r) => r.blast.targets).filter((t) => t.unitId === "R").map((t) => t.blastChance);
    };
    const on = chances(true);
    const off = chances(false);
    expect(on.length).toBeGreaterThan(0);
    expect(on.length).toBe(off.length);
    on.forEach((c, i) => expect(c / off[i]!).toBeCloseTo(0.5 / 0.36, 6));
  });

  it("suppress by FM 7-90's table, with a quarter out to 'little'", () => {
    const at = (nearestMan: number) => nearestMan + 25;
    expect(roundSuppression("mortar", at(100), true)).toBe(SUPPRESSION.indirect / 4);
    expect(roundSuppression("mortar", at(100), false)).toBe(0);
    expect(roundSuppression("artillery", at(150), true)).toBe(SUPPRESSION.indirect / 4);
    expect(roundSuppression("artillery", at(60), true)).toBe(SUPPRESSION.indirect);
    expect(roundSuppression("artillery", at(250), true)).toBe(0);
  });

  it("let a mortar bomb reach a tank's tracks only within its blast against men", () => {
    const reached = (checked: boolean) => {
      const tank = makeVehicle("T", "BLUE", { x: 80, y: 0 });
      return resolveBlast(new Rng(1), "mortar", { x: 0, y: 0 }, [tank], 0, undefined, "research", { figures: "research" }, checked).targets.length;
    };
    expect(reached(false)).toBe(1); // the document's 100 m band
    expect(reached(true)).toBe(0);
  });
});
