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
    expect(area(explosiveForChecked("tankRound", "research", "checked")!.blastBands)).toBeLessThan(
      area(explosiveFor("tankRound", "research")!.blastBands),
    );
    expect(explosiveForChecked("tankRound", "document", "checked")).toBe(explosiveFor("tankRound", "document"));
  });

  it("give the RPG against armour the 1976 trial's hit chances, to 500 m", () => {
    expect(explosiveForChecked("rpgVsArmor", "research", "checked")!.toHitBands).toBe(CHECKED_RPG_VS_ARMOR_TO_HIT);
    expect(CHECKED_RPG_VS_ARMOR_TO_HIT.at(-1)!.maxRange).toBe(500);
  });

  it("throw a charge's fragments in a fan towards the way the enemy came", () => {
    const caught = (checked: boolean) => {
      const mover = makeInfantry("M", "BLUE", "squad", { x: 0, y: 5 }, 8);
      const behind = makeInfantry("B", "BLUE", "squad", { x: 0, y: 40 }, 8);
      const mine = { id: "m", side: "RED" as const, type: "antiPersonnel" as const, position: { x: 0, y: 0 }, armed: true, detected: false };
      // Activation is drawn first; a seed whose charge goes off.
      for (let seed = 1; seed < 50; seed++) {
        const { detonations } = triggerMines(new Rng(seed), mover, { x: 0, y: -30 }, { x: 0, y: 5 }, [mine], [mover, behind], 0, "document", checked ? "checked" : false, "research");
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
      const g = new Game({ seed: 3, enforceC2: false, checkedFigures: checked, aresFigures: false, commandEchelon: { RED: "battalion", BLUE: "battalion" } });
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
    expect(roundSuppression("mortar", at(100), "checked")).toBe(SUPPRESSION.indirect / 4);
    expect(roundSuppression("mortar", at(100), false)).toBe(0);
    expect(roundSuppression("artillery", at(150), "checked")).toBe(SUPPRESSION.indirect / 4);
    expect(roundSuppression("artillery", at(60), "checked")).toBe(SUPPRESSION.indirect);
    expect(roundSuppression("artillery", at(250), "checked")).toBe(0);
  });

  it("let a mortar bomb reach a tank's tracks only within its blast against men", () => {
    const reached = (checked: boolean) => {
      const tank = makeVehicle("T", "BLUE", { x: 80, y: 0 });
      return resolveBlast(new Rng(1), "mortar", { x: 0, y: 0 }, [tank], 0, undefined, "research", { figures: "research" }, checked ? "checked" : false).targets.length;
    };
    expect(reached(false)).toBe(1); // the document's 100 m band
    expect(reached(true)).toBe(0);
  });
});

describe("ARES Special Report No. 3's indirect-fire figures (decision 80)", () => {
  it("are on for a new game, and off for a recording made before them", async () => {
    const g = new Game({ seed: 1 });
    expect(g.aresFigures).toBe(true);
    const rec = g.toRecording();
    delete (rec as { aresFigures?: boolean }).aresFigures;
    expect(replayGame(rec).aresFigures).toBe(false);
  });

  it("use ARES's lethal areas — 155 mm 665 m², 81 mm 250 m² — and keep tank HE at 280 m² (GICHD)", async () => {
    const { ARES_LETHAL_AREA_M2, lethalAreas } = await import("./data/lethality.js");
    expect([ARES_LETHAL_AREA_M2.artillery, ARES_LETHAL_AREA_M2.mortar, ARES_LETHAL_AREA_M2.tankRound]).toEqual([665, 250, 280]);
    const reach = (c: "checked" | "ares", k: string) => explosiveForChecked(k, "research", c)!.blastBands.at(-1)!.maxRange;
    expect(reach("ares", "artillery")).toBeLessThan(reach("checked", "artillery"));
    expect(reach("ares", "mortar")).toBeLessThan(reach("checked", "mortar"));
    expect(lethalAreas("ares")).toBe(ARES_LETHAL_AREA_M2);
  });

  it("give a gun's first round its CEP by range, 115 m at the 20 km assumed", async () => {
    const { aresGunCep, ARES_GUN_RANGE_KM } = await import("./data/artillery.js");
    expect([aresGunCep(10), aresGunCep(15), aresGunCep(20), aresGunCep(25), aresGunCep(30), aresGunCep(40)]).toEqual([95, 95, 115, 140, 275, 275]);
    expect(aresGunCep(17.5)).toBeCloseTo(105, 6);
    expect(aresGunCep(ARES_GUN_RANGE_KM)).toBe(115);
  });

  it("let an air burst find standing men at ×1.15, not ×1.28", () => {
    // As the mortar's test: the factor draws no dice, so the same rounds land.
    const chances = (ares: boolean) => {
      const g = new Game({ seed: 3, enforceC2: false, aresFigures: ares, commandEchelon: { RED: "battalion", BLUE: "battalion" } });
      g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 8));
      g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 3000 }, 8));
      g.beginTurn();
      g.advanceToPhase("targeting");
      g.queueIndirectFire("mortar", "BLUE", { x: 0, y: 0 }, { rounds: 60, fuze: "airburst" });
      g.advanceToPhase("summary");
      g.advanceToPhase("initiative");
      const { resolved } = g.advanceToPhase("resolvePriorArty");
      return resolved!.flatMap((r) => r.blast.targets).filter((t) => t.unitId === "R").map((t) => t.blastChance);
    };
    const on = chances(true);
    const off = chances(false);
    expect(on.length).toBeGreaterThan(0);
    // The ARES bands differ too (250 against 476 m²), so compare factor to factor.
    const bands = (c: "checked" | "ares") => explosiveForChecked("mortar", "research", c)!.blastBands;
    const inBand = (chance: number, factor: number, c: "checked" | "ares") =>
      bands(c).some((b) => Math.abs(Math.min(1, b.value * factor) - chance) < 1e-9);
    expect(on.every((c) => inBand(c, 1.15, "ares"))).toBe(true);
    expect(off.every((c) => inBand(c, 1.28, "checked"))).toBe(true);
  });

  it("scatter the guns' first rounds at the ARES CEP, not 270 m", () => {
    const misses = (ares: boolean) => {
      const g = new Game({ seed: 5, enforceC2: false, aresFigures: ares, commandEchelon: { RED: "battalion", BLUE: "battalion" } });
      g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 8));
      g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 5000 }, 8));
      g.beginTurn();
      g.advanceToPhase("targeting");
      g.queueIndirectFire("artillery", "BLUE", { x: 0, y: 0 }, { rounds: 100 });
      const out: number[] = [];
      for (let turn = 0; turn < 3 && out.length === 0; turn++) {
        g.advanceToPhase("summary");
        g.advanceToPhase("initiative");
        out.push(...(g.advanceToPhase("resolvePriorArty").resolved ?? []).map((r) => r.dispersion.missDistance));
      }
      return out.sort((a, b) => a - b)[out.length >> 1]!;
    };
    // The median miss is the CEP.
    expect(misses(true)).toBeGreaterThan(80);
    expect(misses(true)).toBeLessThan(150);
    expect(misses(false)).toBeGreaterThan(200);
  });
});
