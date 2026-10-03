import { describe, it, expect } from "vitest";
import { Game, type GameOptions } from "./game.js";
import { makeInfantry, makeVehicle } from "./units.js";
import { replayGame } from "./recording.js";
import { FLAT_GROUND } from "./terrain.js";
import { SHELL_VS_MEN } from "./data/explosives.js";
import type { CoverState } from "./data/directFire.js";

/**
 * Rules decision 75: direct-fire HE (tank round, RPG, rifle grenade) follows
 * the shell's rules — posture, cover and roofs against men (decisions 29–30,
 * 62), a blast that finds whoever is in it, men who go to ground after it,
 * and suppression that reaches and is damped by a roof (decision 63, S1, S3).
 */

/** A RED rifle-grenadier squad and a BLUE squad 80 m off, in the fire phase. */
function setUp(opts: Partial<GameOptions> = {}, cover: CoverState = "none") {
  // The document's blast bands: the rifle grenade hits every time within
  // 100 m and catches each man within 50 m at 40%, so a test reads the
  // factor straight off the blast chance.
  const g = new Game({ lethality: "document", seed: 1, enforceC2: false, terrain: FLAT_GROUND, ...opts });
  const red = g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 8));
  const blueSquad = makeInfantry("B", "BLUE", "squad", { x: 0, y: 80 }, 8);
  blueSquad.baseCover = cover;
  const blue = g.addUnit(blueSquad);
  return { g, red, blue };
}

const toCombat = (g: Game) => {
  g.beginTurn();
  g.advanceToPhase("combat");
};
const chanceOn = (r: ReturnType<Game["fireExplosive"]>, id: string) =>
  r.blast?.targets.find((t) => t.unitId === id)?.blastChance;

describe("direct-fire HE as a shell (decision 75)", () => {
  it("is on for a new game, and off for a recording made before it", () => {
    const g = new Game({ seed: 1 });
    expect(g.directHeAsShell).toBe(true);
    const recording = g.toRecording();
    expect(recording.directHeAsShell).toBe(true);
    expect(replayGame(recording).directHeAsShell).toBe(true);
    delete (recording as { directHeAsShell?: boolean }).directHeAsShell;
    expect(replayGame(recording).directHeAsShell).toBe(false);
  });

  it("counts cover against men as a shell's impact fuze does", () => {
    const expected: Record<CoverState, number> = {
      none: 0.4 * SHELL_VS_MEN.impact.standing,
      partial: 0.4 * SHELL_VS_MEN.impact.partial,
      // Full cover prepared before the battle has a roof (author, 2026-09-23).
      full: 0.4 * SHELL_VS_MEN.impact.roof,
    };
    for (const cover of ["none", "partial", "full"] as const) {
      const { g, red, blue } = setUp({}, cover);
      toCombat(g);
      const r = g.fireExplosive("rifleGrenade", red.id, blue.id);
      expect(r.hit).toBe(true);
      expect(chanceOn(r, blue.id)).toBeCloseTo(expected[cover], 6);
    }
  });

  it("ignores cover when off, as before", () => {
    const { g, red, blue } = setUp({ directHeAsShell: false }, "full");
    toCombat(g);
    expect(chanceOn(g.fireExplosive("rifleGrenade", red.id, blue.id), blue.id)).toBe(0.4);
  });

  it("puts the men it came down on to ground, and the next round finds them down", () => {
    const { g, red, blue } = setUp();
    const second = g.addUnit(makeInfantry("R2", "RED", "squad", { x: 20, y: 0 }, 8));
    toCombat(g);
    expect(chanceOn(g.fireExplosive("rifleGrenade", red.id, blue.id), blue.id)).toBe(0.4);
    expect(blue.downUnderShelling).toBe(true);
    const r = g.fireExplosive("rifleGrenade", second.id, blue.id);
    expect(chanceOn(r, blue.id)).toBeCloseTo(0.4 * SHELL_VS_MEN.impact.down, 6);
  });

  it("catches whoever is in its blast, its own side too, and only the target when off", () => {
    for (const on of [true, false]) {
      const { g, red, blue } = setUp({ directHeAsShell: on });
      const neighbour = g.addUnit(makeInfantry("B2", "BLUE", "squad", { x: 30, y: 80 }, 8));
      const own = g.addUnit(makeInfantry("R3", "RED", "squad", { x: 0, y: 40 }, 8));
      const far = g.addUnit(makeInfantry("B3", "BLUE", "squad", { x: 300, y: 80 }, 8));
      toCombat(g);
      const ids = g.fireExplosive("rifleGrenade", red.id, blue.id).blast!.targets.map((t) => t.unitId);
      expect(ids.includes(neighbour.id)).toBe(on);
      expect(ids.includes(own.id)).toBe(on);
      expect(ids).not.toContain(far.id);
    }
  });

  it("an anti-armour round connects only with the vehicle it was aimed at; plain HE reaches any track", () => {
    const g = new Game({ lethality: "document", seed: 1, enforceC2: false, terrain: FLAT_GROUND });
    const tank = g.addUnit(makeVehicle("RT", "RED", { x: 0, y: 0 }));
    const grenadier = g.addUnit(makeInfantry("R", "RED", "squad", { x: 10, y: 0 }, 8));
    const inf = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 200 }, 8));
    const apc = g.addUnit(makeVehicle("BV", "BLUE", { x: 10, y: 200 }));
    toCombat(g);
    // Seed 1 puts the tank round on the target (90% at 200 m).
    const tankShot = g.fireExplosive("tankRound", tank.id, inf.id);
    expect(tankShot.hit).toBe(true);
    expect(tankShot.blast!.targets.map((t) => t.unitId)).not.toContain(apc.id);
    grenadier.position = { x: 0, y: 120 };
    const grenade = g.fireExplosive("rifleGrenade", grenadier.id, inf.id);
    expect(grenade.blast!.targets.map((t) => t.unitId)).toContain(apc.id);
  });

  it("suppresses within its reach beyond the blast, and a roof halves it", () => {
    // Research figures: the rifle grenade's blast reaches a few tens of
    // metres, its suppression reach further (decision 63, S1).
    const run = (opts: Partial<GameOptions>) => {
      const g = new Game({ seed: 1, enforceC2: false, terrain: FLAT_GROUND, morale: true, ...opts });
      const red = g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 8));
      const blue = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 80 }, 8));
      const open = makeInfantry("B2", "BLUE", "squad", { x: 45, y: 80 }, 8);
      open.experience = "regular";
      const roofedSquad = makeInfantry("B3", "BLUE", "squad", { x: -45, y: 80 }, 8);
      roofedSquad.experience = "regular";
      roofedSquad.baseCover = "full";
      g.addUnit(open);
      g.addUnit(roofedSquad);
      toCombat(g);
      const r = g.fireExplosive("rifleGrenade", red.id, blue.id);
      expect(r.hit).toBe(true);
      const reached = r.blast!.targets.map((t) => t.unitId);
      expect(reached).not.toContain(open.id);
      expect(reached).not.toContain(roofedSquad.id);
      return { open: open.suppression ?? 0, roofed: roofedSquad.suppression ?? 0 };
    };
    const on = run({});
    expect(on.open).toBeGreaterThan(0);
    expect(on.roofed).toBe(Math.round(on.open / 2));
    expect(run({ suppressionReach: false }).open).toBe(0);
    expect(run({ directHeAsShell: false }).open).toBe(0);
  });
});
