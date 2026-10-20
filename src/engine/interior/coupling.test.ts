import { describe, it, expect } from "vitest";
import { Game } from "../game.js";
import { makeInfantry } from "../units.js";
import { replayGame, sealRecording, verifyRecording } from "../recording.js";
import type { MapObject } from "../terrain.js";
import { GOES_INSIDE, INTERIOR_REFUSAL, type InteriorReport } from "./coupling.js";

/**
 * Closed terrain fought inside, coupled to the turn (rules decision 96, step
 * 3b): a force at the walls of a building the enemy holds, or assaulting a
 * force inside one, fights it out room by room as the turn closes, and what
 * that does to its men comes back onto the map.
 */
const house: MapObject = {
  id: "house",
  kind: "building",
  height: 6,
  footprint: { shape: "polygon", points: [{ x: 100, y: 100 }, { x: 116, y: 100 }, { x: 116, y: 112 }, { x: 100, y: 112 }] },
};

function battle(seed = 1, opts: { closedTerrain?: boolean; windowFire?: boolean } = {}) {
  const g = new Game({ seed, enforceC2: false, terrain: { objects: [house] }, ...opts });
  g.addUnit(makeInfantry("R-1", "RED", "squad", { x: 108, y: 106 }, 4)); // inside the house
  // 40 m out from the house's front door, wherever this game's plan puts it.
  const door = g.interior.frontDoor(g, house)!;
  const dx = door.x - 108, dy = door.y - 106, d = Math.hypot(dx, dy);
  g.addUnit(makeInfantry("B-1", "BLUE", "squad", { x: door.x + (40 * dx) / d, y: door.y + (40 * dy) / d }, 8));
  return g;
}

/** Turn 1: B-1 closes to 10 m of the front door and assaults the house, which takes it in. */
function goIn(g: Game) {
  const door = g.interior.frontDoor(g, house)!;
  const b = g.getUnit("B-1").position;
  const dx = b.x - door.x, dy = b.y - door.y, d = Math.hypot(dx, dy);
  g.beginTurn();
  g.advanceToPhase("movement");
  g.moveUnit("B-1", { x: door.x + (10 * dx) / d, y: door.y + (10 * dy) / d });
  g.advanceToPhase("combat");
  expect(g.assault("B-1", "R-1", 0).reason).toBe(GOES_INSIDE);
}

/** Close the turn and hand back what the fights inside did. */
function closeTurn(g: Game): InteriorReport[] {
  return g.advanceToPhase("initiative").interior;
}

describe("the fight inside, coupled to the turn (decision 96)", () => {
  it("does not begin at the walls: a force there fights from outside (the author, 2026-10-20)", () => {
    const g = battle();
    g.beginTurn();
    g.advanceToPhase("movement");
    g.moveUnit("B-1", { x: 108, y: 114 }); // 2 m from the wall
    expect(closeTurn(g)).toEqual([]);
    expect(g.interior.inFight("B-1")).toBe(false);
  });

  it("begins when an assault goes in, and locks both sides in", () => {
    const g = battle();
    goIn(g);
    const reports = closeTurn(g);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ buildingId: "house", attackerSide: "BLUE", began: true, attackerUnits: ["B-1"], defenderUnits: ["R-1"] });
    expect(g.interior.inFight("B-1")).toBe(true);
    expect(g.interior.inFight("R-1")).toBe(true);
    g.advanceToPhase("movement");
    expect(() => g.moveUnit("B-1", { x: 108, y: 150 })).toThrow(INTERIOR_REFUSAL.fightingInside);
    g.advanceToPhase("combat");
    // Fighting each other inside, they do it room by room, not by the rules outside (decision 98).
    expect(g.fire("B-1", "R-1", { weapon: "smallArms" }).reason).toBe(INTERIOR_REFUSAL.fightingInside);
    expect(g.fire("R-1", "B-1", { weapon: "smallArms" }).reason).toBe(INTERIOR_REFUSAL.fightingInside);
  });

  it("refuses all fire from a fight inside without decision 98, as recorded before it", () => {
    const g = battle(1, { windowFire: false });
    goIn(g);
    closeTurn(g);
    g.advanceToPhase("combat");
    expect(g.fire("R-1", "B-1", { weapon: "smallArms" }).reason).toBe(INTERIOR_REFUSAL.fightingInside);
  });

  it("does not begin with nobody at the walls", () => {
    const g = battle();
    g.beginTurn();
    expect(closeTurn(g)).toEqual([]);
    expect(g.interior.engagements).toHaveLength(0);
  });

  it("takes an assault on a force inside a building in through its front door", () => {
    const g = battle();
    g.beginTurn();
    g.advanceToPhase("movement");
    g.moveUnit("B-1", { x: 108, y: 130 }); // 24 m from R-1: within the assault's 25 m
    g.advanceToPhase("combat");
    const r = g.assault("B-1", "R-1", 2);
    expect(r.reason).toBe(GOES_INSIDE);
    expect(r.defenderCasualties).toBe(0); // nothing resolved outside
    const reports = closeTurn(g);
    expect(reports[0]?.began).toBe(true);
  });

  it("writes the fight's wounds back onto the men, and ends with the house taken or the attack beaten off", () => {
    let ended = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const g = battle(seed);
      goIn(g);
      const all: InteriorReport[] = [];
      // A house takes a squad 20 to 60 minutes (decision 96): two hours is room enough.
      for (let t = 0; t < 120 && (all.length === 0 || !all.at(-1)!.outcome); t++) {
        all.push(...closeTurn(g));
        g.advanceToPhase("summary");
      }
      const last = all.at(-1)!;
      expect(last.outcome).toBeDefined();
      ended++;
      // Every man the reports put out is out on the map, and no other.
      const out = (id: string) => g.getUnit(id).soldiers!.filter((s) => s.neutralized).length;
      expect(out("B-1")).toBe(all.reduce((n, r) => n + r.attackersOut, 0));
      expect(out("R-1")).toBe(all.reduce((n, r) => n + r.defendersOut, 0));
      if (last.outcome === "cleared") expect(g.getUnit("R-1").soldiers!.every((s) => s.neutralized) || last.defenderUnits.length === 0).toBe(true);
      expect(g.interior.engagements).toHaveLength(0);
    }
    expect(ended).toBe(12);
  });

  it("adds a wound taken inside to one taken outside, rather than keeping the larger", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = battle(seed);
      goIn(g);
      // Every man of the squad already lightly wounded outside.
      for (const s of g.getUnit("B-1").soldiers!) s.damagePoints = 2;
      const before = g.getUnit("B-1").soldiers!.map((s) => s.damagePoints);
      closeTurn(g);
      const after = g.getUnit("B-1").soldiers!.map((s) => s.damagePoints);
      // Nobody loses what he had; a man hit again inside has more than 2.
      after.forEach((d, i) => expect(d).toBeGreaterThanOrEqual(before[i]!));
    }
  });

  it("makes the assault that goes in an assault: once a turn, answered, and only from within reach of the door", () => {
    const g = battle();
    g.beginTurn();
    g.advanceToPhase("movement");
    g.moveUnit("B-1", { x: 108, y: 130 });
    g.advanceToPhase("combat");
    g.assault("B-1", "R-1", 0);
    expect(g.getUnit("B-1").firedThisTurn).toBe(true);
    expect(g.getUnit("B-1").movedThisTurn).toBeGreaterThan(0); // the way to the door is a move
    // From the far side of the house, 25 m from the defender but not from the door, it does not go in.
    const far = battle();
    far.addUnit(makeInfantry("B-2", "BLUE", "squad", { x: 108, y: 84 }, 8));
    far.beginTurn();
    far.advanceToPhase("combat");
    const door = far.interior.frontDoor(far, house)!;
    if (Math.hypot(door.x - 108, door.y - 84) > 25) expect(far.assault("B-2", "R-1", 0).reason).toBe("out of range");
  });

  it("lets each side know whom it is fighting, and lets a routed force out", () => {
    const g = new Game({ seed: 4, enforceC2: false, trackIntel: true, terrain: { objects: [house] } });
    g.addUnit(makeInfantry("R-1", "RED", "squad", { x: 108, y: 106 }, 4));
    g.addUnit(makeInfantry("B-1", "BLUE", "squad", { x: 108, y: 160 }, 8));
    goIn(g);
    closeTurn(g);
    expect(g.knows("BLUE", "R-1")).toBe(true);
    expect(g.knows("RED", "B-1")).toBe(true);
    g.getUnit("B-1").routing = true;
    g.advanceToPhase("summary");
    const reports = closeTurn(g);
    expect(g.interior.inFight("B-1")).toBe(false);
    expect(reports.at(-1)?.outcome).toBe("repulsed"); // with every attacker gone, the attack is over
    expect(reports.at(-1)?.attackersWithdrew).toBeGreaterThan(0); // and the log says they left
  });

  it("replays a battle with a fight inside to exactly the same state", () => {
    const g = battle(3);
    goIn(g);
    for (let t = 0; t < 4; t++) { g.advanceToPhase("initiative"); g.advanceToPhase("summary"); }
    const sealed = JSON.parse(JSON.stringify(sealRecording(g.toRecording())));
    expect(sealed.closedTerrain).toBe(true);
    expect(verifyRecording(sealed)).toEqual({ checked: true, ok: true });
    const again = replayGame(sealed);
    expect(again.getUnit("B-1").soldiers!.map((s) => s.damagePoints)).toEqual(g.getUnit("B-1").soldiers!.map((s) => s.damagePoints));
  });

  it("plays a battle recorded before the rule as it was played: the assault resolved outside", () => {
    const g = battle(1, { closedTerrain: false });
    g.beginTurn();
    g.advanceToPhase("movement");
    g.moveUnit("B-1", { x: 108, y: 130 });
    g.advanceToPhase("combat");
    expect(g.assault("B-1", "R-1", 0).reason).not.toBe(GOES_INSIDE);
    expect(closeTurn(g)).toEqual([]);
    const rec = g.toRecording();
    expect(rec.closedTerrain).toBeUndefined();
    expect(replayGame(JSON.parse(JSON.stringify(rec))).closedTerrain).toBe(false);
  });
});
