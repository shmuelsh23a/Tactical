import { describe, it, expect } from "vitest";
import { Game, SMOKE_REFUSAL } from "./game.js";
import { makeCommandGroup, makeInfantry, makeVehicle } from "./units.js";
import { replayGame, sealRecording, verifyRecording } from "./recording.js";
import { SMOKE_GRENADE_THROW_M, SMOKE_RADIUS_M } from "./data/smoke.js";
import { EXPLOSIVES, RIFLE_GRENADIERS } from "./data/explosives.js";

/**
 * A grenade's smoke needs somebody to deliver it (rules decision 97, the
 * author, 2026-10-20): a hand-thrown pot lands within throwing range of a man
 * of the side (TC 3-23.30, the M18's 35 m), rifle-grenade smoke within a
 * rifle grenade's reach of one of its infantry forces. Found in a played
 * battle where BLUE dropped a pot 470 m from its nearest man.
 */
const RIFLE_GRENADE_M = EXPLOSIVES.rifleGrenade!.toHitBands!.at(-1)!.maxRange;

function battle(opts: { smokeNeedsThrower?: boolean } = {}) {
  const g = new Game({
    seed: 1,
    enforceC2: false,
    commandEchelon: { BLUE: "company", RED: "company" },
    fireSupport: { BLUE: [{ weapon: "mortar", missions: 2 }] },
    ...opts,
  });
  g.addUnit(makeInfantry("B-1", "BLUE", "squad", { x: 0, y: 0 }, 8));
  g.addUnit(makeInfantry("B-MG", "BLUE", "team", { x: 1000, y: 0 }, 3));
  g.addUnit(makeCommandGroup("B-HQ", "BLUE", "platoon", { x: 0, y: 1000 }, 3));
  g.addUnit(makeVehicle("B-T", "BLUE", { x: 2000, y: 0 }));
  g.addUnit(makeInfantry("R-1", "RED", "squad", { x: 0, y: 700 }, 8));
  g.beginTurn();
  g.advanceToPhase("targeting");
  return g;
}

describe("a grenade's smoke needs a man to deliver it (decision 97)", () => {
  it("lands a hand pot within the M18's throw of a man of the side, and no farther", () => {
    expect(SMOKE_GRENADE_THROW_M).toBe(35);
    const g = battle();
    expect(g.deploySmoke("grenade", "BLUE", { x: 0, y: SMOKE_GRENADE_THROW_M }).screen).toBeDefined();
    expect(() => g.deploySmoke("grenade", "BLUE", { x: 0, y: SMOKE_GRENADE_THROW_M + 1 })).toThrow(SMOKE_REFUSAL.noThrower);
  });

  it("lets any man throw a pot — a machine gun team's or a command group's — but not a tank", () => {
    const g = battle();
    expect(g.deploySmoke("grenade", "BLUE", { x: 1000, y: 30 }).screen).toBeDefined();
    expect(g.deploySmoke("grenade", "BLUE", { x: 0, y: 1030 }).screen).toBeDefined();
    expect(() => g.deploySmoke("grenade", "BLUE", { x: 2000, y: 30 })).toThrow(SMOKE_REFUSAL.noThrower);
  });

  it("fires rifle-grenade smoke from any infantry with a rifle grenadier, out to a rifle grenade's reach", () => {
    // "any infantry with a rifle grenadier" (the author, 2026-10-20): a
    // launcher for every four men still fighting (his ruling of 2026-09-28).
    expect(RIFLE_GRENADIERS.menPerLauncher).toBe(4);
    const g = battle();
    expect(g.deploySmoke("rifleGrenade", "BLUE", { x: 0, y: RIFLE_GRENADE_M }).screen).toBeDefined();
    expect(() => g.deploySmoke("rifleGrenade", "BLUE", { x: 0, y: RIFLE_GRENADE_M + 1 })).toThrow(SMOKE_REFUSAL.noLauncher);
    // A machine gun team of three carries none; a command group none.
    expect(() => g.deploySmoke("rifleGrenade", "BLUE", { x: 1000, y: 60 })).toThrow(SMOKE_REFUSAL.noLauncher);
    expect(() => g.deploySmoke("rifleGrenade", "BLUE", { x: 0, y: 1060 })).toThrow(SMOKE_REFUSAL.noLauncher);
    // A fire team of four has its grenadier — until a man is put out.
    g.addUnit(makeInfantry("B-FT", "BLUE", "team", { x: 3000, y: 0 }, 4));
    expect(g.deploySmoke("rifleGrenade", "BLUE", { x: 3000, y: 60 }).screen).toBeDefined();
    g.getUnit("B-FT").soldiers![0]!.neutralized = true;
    expect(() => g.deploySmoke("rifleGrenade", "BLUE", { x: 3000, y: 70 })).toThrow(SMOKE_REFUSAL.noLauncher);
  });

  it("lays a smaller screen from a rifle grenade than from a pot (the author, 2026-10-20)", () => {
    expect(SMOKE_RADIUS_M.rifleGrenade).toBeLessThan(SMOKE_RADIUS_M.grenade);
    const g = battle();
    expect(g.deploySmoke("rifleGrenade", "BLUE", { x: 0, y: 50 }).radius).toBe(SMOKE_RADIUS_M.rifleGrenade);
  });

  it("has nobody throw from a force routing, given up, put out, or whose men are all broken — each on its own", () => {
    const cases: [string, (g: Game) => void][] = [
      ["routing", (g) => { g.getUnit("B-1").routing = true; }],
      ["surrendered", (g) => { g.getUnit("B-1").surrendered = true; }],
      ["neutralised", (g) => { g.getUnit("B-1").neutralized = true; }],
      ["every man out", (g) => { for (const s of g.getUnit("B-1").soldiers!) s.neutralized = true; }],
      ["every man broken", (g) => { for (const s of g.getUnit("B-1").soldiers!) s.morale = { will: 0, ceiling: 50, state: "broken", timesRallied: 0 }; }],
    ];
    for (const [name, spoil] of cases) {
      const g = battle();
      expect(g.deploySmoke("grenade", "BLUE", { x: 0, y: 10 }).screen, name).toBeDefined();
      spoil(g);
      expect(() => g.deploySmoke("grenade", "BLUE", { x: 0, y: 20 }), name).toThrow(SMOKE_REFUSAL.noThrower);
    }
  });

  it("costs no fire mission either way: it is the force's own", () => {
    const g = battle();
    expect(g.fireMissionsLeft("BLUE", "mortar")).toBe(2);
    g.deploySmoke("rifleGrenade", "BLUE", { x: 0, y: 50 });
    g.deploySmoke("grenade", "BLUE", { x: 0, y: 20 });
    expect(g.fireMissionsLeft("BLUE", "mortar")).toBe(2);
  });

  it("replays a battle sealed under the rule to the same state, screens and all", () => {
    const g = battle();
    g.deploySmoke("grenade", "BLUE", { x: 0, y: 30 });
    g.deploySmoke("rifleGrenade", "BLUE", { x: 0, y: 90 });
    const sealed = JSON.parse(JSON.stringify(sealRecording(g.toRecording())));
    expect(sealed.smokeNeedsThrower).toBe(true);
    expect(verifyRecording(sealed)).toEqual({ checked: true, ok: true });
    expect(replayGame(sealed).smoke.map((s) => s.center)).toEqual([{ x: 0, y: 30 }, { x: 0, y: 90 }]);
  });

  it("replays a battle recorded before the rule with its pot dropped anywhere, as it was played", () => {
    const before = battle({ smokeNeedsThrower: false });
    before.deploySmoke("grenade", "BLUE", { x: 430, y: 550 }); // the played battle's: 470 m from anyone
    const sealed = JSON.parse(JSON.stringify(sealRecording(before.toRecording())));
    expect(sealed.smokeNeedsThrower).toBeUndefined();
    expect(verifyRecording(sealed)).toEqual({ checked: true, ok: true });
    const replayed = replayGame(sealed);
    expect(replayed.smokeNeedsThrower).toBe(false);
    expect(replayed.smoke.map((s) => s.center)).toEqual([{ x: 430, y: 550 }]);
  });
});
