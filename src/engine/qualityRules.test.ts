import { describe, expect, it } from "vitest";
import { Game, type GameOptions } from "./game.js";
import { makeInfantry } from "./units.js";
import { FLAT_GROUND } from "./terrain.js";
import { replayGame } from "./recording.js";
import { forceQuality, qualityGapFactor } from "./morale.js";
import { QUALITY_BREAK_SHIFT, SIDE_BREAK_BY_POSTURE } from "./data/morale.js";
import type { ForceQuality } from "./types.js";

const ELITE: ForceQuality = { type: "elite", experience: "experienced" };
const IRREGULAR: ForceQuality = { type: "irregular", experience: "experienced" };

/** A rifle grenade from RED (dressed `shooter`) at BLUE (dressed `target`) 60 m off: each man's chance in its burst. */
function grenade(shooter: ForceQuality | undefined, target: ForceQuality | undefined, opts: Partial<GameOptions> = {}) {
  const g = new Game({ seed: 5, enforceC2: false, morale: false, headsDown: false, criticalHits: false, terrain: FLAT_GROUND, ...opts });
  const red = makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 8);
  const blue = makeInfantry("B", "BLUE", "squad", { x: 0, y: 60 }, 8);
  if (shooter) Object.assign(red, forceQuality(shooter));
  if (target) Object.assign(blue, forceQuality(target));
  g.addUnit(red);
  g.addUnit(blue);
  g.beginTurn();
  g.advanceToPhase("combat");
  const r = g.fireExplosive("rifleGrenade", "R", "B");
  expect(r.hit).toBe(true);
  return { chance: r.blast!.targets.find((t) => t.unitId === "B")!.blastChance!, red, blue };
}

/** A BLUE attack of one squad of ten, `type`, with `down` of its men down. */
function attack(down: number, quality?: ForceQuality, opts: Partial<GameOptions> = {}) {
  const g = new Game({ seed: 5, enforceC2: false, morale: true, terrain: FLAT_GROUND, attackers: ["BLUE"], ...opts });
  const blue = makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 10);
  if (quality) Object.assign(blue, forceQuality(quality));
  g.addUnit(blue);
  g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 500 }, 10));
  blue.soldiers!.slice(0, down).forEach((s) => (s.neutralized = true));
  return g.sideBroken("BLUE");
}

describe("force quality beyond small arms (rules decision 87)", () => {
  it("puts the quality gap on each man in a rifle grenade's burst, as on a rifle's hit", () => {
    const equal = grenade(undefined, undefined).chance;
    const { chance, red, blue } = grenade(ELITE, IRREGULAR);
    expect(chance).toBeCloseTo(Math.min(1, equal * qualityGapFactor(red, blue)), 9);
    expect(chance).toBeGreaterThan(equal);
    // …and the other way: the militia's grenadiers at the elite force.
    const back = grenade(IRREGULAR, ELITE);
    expect(back.chance).toBeCloseTo(equal * qualityGapFactor(back.red, back.blue), 9);
    expect(back.chance).toBeLessThan(equal);
    // Off, or without the gap itself: as before.
    expect(grenade(ELITE, IRREGULAR, { qualityGapGrenades: false }).chance).toBe(equal);
    expect(grenade(ELITE, IRREGULAR, { qualityGap: false }).chance).toBe(equal);
  });

  it("leaves the grenadier's own men in the burst as they were", () => {
    const g = new Game({ seed: 5, enforceC2: false, morale: false, headsDown: false, criticalHits: false, terrain: FLAT_GROUND });
    const red = Object.assign(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 8), forceQuality(ELITE));
    const own = Object.assign(makeInfantry("O", "RED", "squad", { x: 3, y: 60 }, 8), forceQuality(IRREGULAR));
    const enemy = Object.assign(makeInfantry("B", "BLUE", "squad", { x: 0, y: 60 }, 8), forceQuality(IRREGULAR));
    for (const u of [red, own, enemy]) g.addUnit(u);
    g.beginTurn();
    g.advanceToPhase("combat");
    const r = g.fireExplosive("rifleGrenade", "R", "B");
    const chance = (id: string) => r.blast!.targets.find((t) => t.unitId === id)!.blastChance!;
    // Same cover, same posture: only the gap tells them apart.
    expect(chance("B")).toBeGreaterThan(chance("O"));
    expect(chance("O")).toBe(grenade(undefined, undefined).chance);
  });

  it("moves a side's breakpoint by its force type: an elite attack fights on, an irregular one gives up sooner", () => {
    const regular = SIDE_BREAK_BY_POSTURE.attacking;
    expect(regular).toBe(0.3);
    expect(attack(3)).toBe(true);
    expect(attack(2)).toBe(false);
    // Elite: 30% + 20%.
    expect(regular + QUALITY_BREAK_SHIFT.elite).toBeCloseTo(0.5, 9);
    expect(attack(4, ELITE)).toBe(false);
    expect(attack(5, ELITE)).toBe(true);
    // Irregular: 30% − 10%.
    expect(attack(2, IRREGULAR)).toBe(true);
    expect(attack(1, IRREGULAR)).toBe(false);
    // A side of two types: its men's mean, half elite and half irregular +5 points.
    const g = new Game({ seed: 5, enforceC2: false, morale: true, terrain: FLAT_GROUND, attackers: ["BLUE"] });
    const a = Object.assign(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 0 }, 10), forceQuality(ELITE));
    const b = Object.assign(makeInfantry("B2", "BLUE", "squad", { x: 20, y: 0 }, 10), forceQuality(IRREGULAR));
    g.addUnit(a);
    g.addUnit(b);
    g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 500 }, 10));
    [...a.soldiers!.slice(0, 3), ...b.soldiers!.slice(0, 3)].forEach((s) => (s.neutralized = true));
    expect(g.sideBroken("BLUE")).toBe(false); // 30% < 35%
    b.soldiers![3]!.neutralized = true;
    expect(g.sideBroken("BLUE")).toBe(true); // 35%
    // Off: by posture alone.
    expect(attack(3, ELITE, { qualityBreakpoint: false })).toBe(true);
  });

  it("is on for a new game, and off for a recording made before it", () => {
    const g = new Game({ seed: 1 });
    expect(g.qualityGapGrenades).toBe(true);
    expect(g.qualityBreakpoint).toBe(true);
    const recording = g.toRecording();
    expect(replayGame(recording).qualityBreakpoint).toBe(true);
    delete (recording as { qualityGapGrenades?: boolean }).qualityGapGrenades;
    delete (recording as { qualityBreakpoint?: boolean }).qualityBreakpoint;
    const old = replayGame(recording);
    expect(old.qualityGapGrenades).toBe(false);
    expect(old.qualityBreakpoint).toBe(false);
  });
});
