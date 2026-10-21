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

function battle(seed = 1, opts: { closedTerrain?: boolean; windowFire?: boolean; joinFights?: boolean; morale?: boolean; breakEndsInside?: boolean; moraleInside?: boolean; counterattackInside?: boolean } = {}, defenders = 4) {
  const g = new Game({ seed, enforceC2: false, terrain: { objects: [house] }, ...opts });
  g.addUnit(makeInfantry("R-1", "RED", "squad", { x: 108, y: 106 }, defenders)); // inside the house
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

  /** A second force at the door, `side`'s, 10 m out beside the first. */
  function second(g: Game, id: string, side: "BLUE" | "RED") {
    const door = g.interior.frontDoor(g, house)!;
    const dx = door.x - 108, dy = door.y - 106, d = Math.hypot(dx, dy);
    g.addUnit(makeInfantry(id, side, "squad", { x: door.x + (10 * dx) / d - (4 * dy) / d, y: door.y + (10 * dy) / d + (4 * dx) / d }, 8));
  }

  it("lets the attacking side join a fight already going on, as new teams at the door (decision 99)", () => {
    const g = battle(5);
    goIn(g);
    closeTurn(g);
    second(g, "B-2", "BLUE");
    g.advanceToPhase("combat");
    expect(g.assault("B-2", "R-1", 0).reason).toBe(GOES_INSIDE);
    const reports = closeTurn(g);
    expect(reports[0]?.joined).toEqual(["B-2"]);
    expect(reports[0]?.attackerUnits).toEqual(["B-1", "B-2"]);
    expect(g.interior.inFight("B-2")).toBe(true);
    const inFight = new Set(g.interior.engagementOf("B-2")!.fight.soldiers.map((m) => m.id));
    expect(g.getUnit("B-2").soldiers!.every((s) => inFight.has(s.id))).toBe(true);
  });

  it("takes a force that broke and rallied back into the fight it left", () => {
    for (const seed of [5, 6, 7]) {
      const g = battle(seed);
      goIn(g);
      closeTurn(g);
      second(g, "B-2", "BLUE");
      g.advanceToPhase("combat");
      g.assault("B-2", "R-1", 0);
      closeTurn(g);
      if (!g.interior.inFight("B-1")) continue; // the fight ended first
      g.getUnit("B-2").routing = true;
      g.advanceToPhase("summary");
      closeTurn(g);
      expect(g.interior.inFight("B-2")).toBe(false);
      if (!g.interior.inFight("B-1")) continue;
      // Rallied, at the door again, and back in.
      g.getUnit("B-2").routing = false;
      g.advanceToPhase("combat");
      expect(g.assault("B-2", "R-1", 0).reason).toBe(GOES_INSIDE);
      expect(() => closeTurn(g)).not.toThrow();
      expect(g.interior.inFight("B-2")).toBe(true);
      // Each of its men driven by one team only — its trail (decision 117) counted with the teams —
      // in the fight once, and posted nowhere he has left.
      const fight = g.interior.engagementOf("B-2")!.fight as unknown as {
        teams: { members: { id: string }[]; trail?: { id: string }[] }[];
        soldiers: { id: string; post?: unknown; withdrew?: boolean }[];
      };
      const driven = fight.teams.flatMap((t) => [...t.members, ...(t.trail ?? [])].map((m) => m.id)).filter((id) => id.startsWith("B-2"));
      expect(new Set(driven).size).toBe(driven.length);
      const ids = fight.soldiers.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(fight.soldiers.filter((m) => m.id.startsWith("B-2") && !m.withdrew && m.post && driven.includes(m.id))).toEqual([]);
    }
  });

  it("does not reach by joining an enemy force inside that is not in the fight", () => {
    const g = battle(5);
    goIn(g);
    closeTurn(g);
    g.addUnit(makeInfantry("R-3", "RED", "squad", { x: 104, y: 104 }, 2)); // in the house, not in the fight
    second(g, "B-2", "BLUE");
    g.advanceToPhase("combat");
    if (g.interior.inFight("B-1")) expect(g.assault("B-2", "R-3", 0).reason).toBe(INTERIOR_REFUSAL.fightingInside);
  });

  it("lets a defending side's force counterattack in at the door, clearing back the attacker's rooms (decision 104)", () => {
    let came = 0, retaken = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const g = battle(seed);
      goIn(g);
      closeTurn(g);
      // The attacker takes some of the house first.
      for (let t = 0; t < 30 && g.interior.inFight("B-1") && g.interior.engagements[0]!.fight.result().roomsCleared < 2; t++) {
        g.advanceToPhase("summary");
        closeTurn(g);
      }
      if (!g.interior.inFight("B-1")) continue;
      second(g, "R-2", "RED");
      g.advanceToPhase("combat");
      expect(g.assault("R-2", "B-1", 0).reason).toBe(GOES_INSIDE);
      const reports = closeTurn(g);
      expect(g.interior.inFight("R-2")).toBe(true);
      expect(reports.some((r) => r.counterattacked?.includes("R-2"))).toBe(true);
      came++;
      for (let t = 0; t < 120 && g.interior.engagements.length > 0; t++) {
        const e = g.interior.engagements[0]!;
        g.advanceToPhase("summary");
        closeTurn(g);
        retaken = Math.max(retaken, e.fight.result().roomsRetaken);
      }
      expect(g.interior.engagements).toHaveLength(0); // it comes to an end
    }
    expect(came).toBeGreaterThan(0);
    expect(retaken).toBeGreaterThan(0);
  });

  it("resolves a defending side's assault outside, as played, in a battle recorded before decision 104", () => {
    const g = battle(5, { counterattackInside: false });
    goIn(g);
    closeTurn(g);
    second(g, "R-2", "RED");
    g.advanceToPhase("combat");
    const reason = g.assault("R-2", "B-1", 0).reason;
    expect(reason).not.toBe(GOES_INSIDE);
    expect(reason).not.toBe(INTERIOR_REFUSAL.fightingInside); // the attacker at the door is fought where his mark is
    expect(g.interior.inFight("R-2")).toBe(false);
  });

  it("does not let a force already in the fight counterattack into it", () => {
    const g = battle(5);
    goIn(g);
    closeTurn(g);
    g.advanceToPhase("combat");
    if (!g.interior.inFight("R-1")) return;
    expect(g.assault("R-1", "B-1", 0).reason).not.toBe(GOES_INSIDE);
  });

  it("clears a house sooner, and more often, with a second squad joining", () => {
    // Turns to clear it, or undefined when it was not cleared. Since the drill
    // audit (I1, men left behind as security) a lone squad is drained and
    // repulsed sooner, so turns to *any* end rewarded the squad that lost
    // quickly; what joining buys is clearing.
    const turnsToClear = (join: boolean, seed: number) => {
      const g = battle(seed);
      goIn(g);
      closeTurn(g);
      second(g, "B-2", "BLUE");
      if (join) { g.advanceToPhase("combat"); expect(g.assault("B-2", "R-1", 0).reason).toBe(GOES_INSIDE); }
      for (let t = 1; t < 120; t++) {
        const r = closeTurn(g);
        const end = r.find((x) => x.outcome);
        if (end) return end.outcome === "cleared" ? t : undefined;
        g.advanceToPhase("summary");
      }
      return undefined;
    };
    let alone = 0, joined = 0, clearedAlone = 0, clearedJoined = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const a = turnsToClear(false, seed), j = turnsToClear(true, seed);
      if (a !== undefined) clearedAlone++;
      if (j !== undefined) clearedJoined++;
      if (a !== undefined && j !== undefined) { alone += a; joined += j; }
    }
    expect(clearedJoined).toBeGreaterThan(clearedAlone);
    expect(joined).toBeLessThan(alone);
  });

  it("refuses a second assault on a fight going on in a battle recorded before decision 99", () => {
    const g = battle(5, { joinFights: false });
    goIn(g);
    closeTurn(g);
    second(g, "B-2", "BLUE");
    g.advanceToPhase("combat");
    expect(g.assault("B-2", "R-1", 0).reason).toBe(INTERIOR_REFUSAL.fightingInside);
    expect(g.toRecording().joinFights).toBeUndefined();
  });

  it("replays a battle with a force joining a fight to exactly the same state", () => {
    const g = battle(6);
    goIn(g);
    closeTurn(g);
    second(g, "B-2", "BLUE");
    g.advanceToPhase("combat");
    g.assault("B-2", "R-1", 0);
    for (let t = 0; t < 3; t++) { g.advanceToPhase("initiative"); g.advanceToPhase("summary"); }
    const sealed = JSON.parse(JSON.stringify(sealRecording(g.toRecording())));
    expect(sealed.joinFights).toBe(true);
    expect(verifyRecording(sealed)).toEqual({ checked: true, ok: true });
  });

  /** A side's men put out on the map, as fire outside would, before the turn closes. */
  function knockOut(g: Game, id: string, n: number) {
    for (const s of g.getUnit(id).soldiers!.slice(0, n)) { s.damagePoints = 10; s.neutralized = true; }
  }

  // Decision 102's tests play without decision 103, as a battle recorded between the two: there the break did not wait.
  it("ends the fight inside when the defending side breaks: its men inside give themselves up (decision 102)", () => {
    const g = battle(2, { morale: true, moraleInside: false });
    goIn(g);
    closeTurn(g);
    expect(g.interior.inFight("R-1")).toBe(true);
    g.advanceToPhase("summary");
    knockOut(g, "R-1", 2); // half a squad of four: a defending side breaks at half
    const reports = closeTurn(g);
    expect(g.sideBroken("RED")).toBe(true);
    const last = reports.at(-1)!;
    expect(last).toMatchObject({ outcome: "cleared", brokeOff: "RED" });
    expect(g.getUnit("R-1").surrendered).toBe(true);
    expect(g.interior.engagements).toHaveLength(0);
  });

  it("ends it when the attacking side breaks: its men inside leave by the door", () => {
    const g = battle(2, { morale: true, moraleInside: false });
    goIn(g);
    closeTurn(g);
    expect(g.interior.inFight("B-1")).toBe(true);
    g.advanceToPhase("summary");
    knockOut(g, "B-1", 4); // half the squad: this battle names no attacker, so both sides break at half
    const reports = closeTurn(g);
    expect(g.sideBroken("BLUE")).toBe(true);
    expect(reports.at(-1)).toMatchObject({ outcome: "repulsed", brokeOff: "BLUE" });
    expect(g.interior.inFight("B-1")).toBe(false);
    const door = g.interior.frontDoor(g, house)!;
    expect(Math.hypot(g.getUnit("B-1").position.x - door.x, g.getUnit("B-1").position.y - door.y)).toBeLessThan(1e-6);
  });

  it("ends it the moment the side breaks, mid-turn, not only when the turn closes", () => {
    const g = battle(2, { morale: true, moraleInside: false });
    goIn(g);
    closeTurn(g);
    expect(g.interior.inFight("R-1")).toBe(true);
    g.advanceToPhase("combat");
    knockOut(g, "R-1", 2); // as fire in this phase would
    g.setInteriorPlan("B-1", { grenades: true }); // any action: the game is judged after it
    expect(g.getUnit("R-1").surrendered).toBe(true);
    expect(g.interior.engagements).toHaveLength(0);
    expect(g.standingOrderFor("R-1")).toBeUndefined();
    // A game that stops here, as one judged over at the break does, still says how it ended.
    expect(g.takeBrokenInside()).toEqual([expect.objectContaining({ brokeOff: "RED", outcome: "cleared" })]);
    expect(g.takeBrokenInside()).toEqual([]); // said once
  });

  it("hands a mid-turn break's report back with the turn's close, if the game goes on", () => {
    const g = battle(2, { morale: true, moraleInside: false });
    goIn(g);
    closeTurn(g);
    g.advanceToPhase("combat");
    knockOut(g, "R-1", 2);
    g.setInteriorPlan("B-1", { grenades: true });
    expect(closeTurn(g).some((r) => r.brokeOff === "RED" && r.outcome === "cleared")).toBe(true);
  });

  it("when both sides break at once, ends the attack inside and leaves the house to its defender", () => {
    const g = battle(2, { morale: true, moraleInside: false });
    goIn(g);
    closeTurn(g);
    g.advanceToPhase("summary");
    knockOut(g, "R-1", 2);
    knockOut(g, "B-1", 4);
    const reports = closeTurn(g);
    expect(g.sideBroken("RED") && g.sideBroken("BLUE")).toBe(true);
    expect(reports.at(-1)).toMatchObject({ outcome: "repulsed", brokeOff: "BLUE" });
    expect(g.getUnit("R-1").surrendered ?? false).toBe(false);
  });

  it("lets the fight go on under a broken side in a battle recorded before decision 102", () => {
    const g = battle(2, { morale: true, breakEndsInside: false });
    goIn(g);
    closeTurn(g);
    expect(g.interior.inFight("R-1")).toBe(true);
    g.advanceToPhase("summary");
    knockOut(g, "R-1", 2);
    const reports = closeTurn(g);
    expect(reports.some((r) => r.brokeOff)).toBe(false);
    expect(g.toRecording().breakEndsInside).toBeUndefined();
  });

  it("waits for the fight inside before judging a side's break (decision 103)", () => {
    const g = battle(2, { morale: true });
    goIn(g);
    closeTurn(g);
    expect(g.interior.inFight("R-1")).toBe(true);
    g.advanceToPhase("summary");
    knockOut(g, "R-1", 2); // half the defenders down: broken, on the count
    closeTurn(g);
    expect(g.interior.engagements.length).toBeGreaterThan(0); // the fight goes on, room by room
    expect(g.sideBroken("RED")).toBe(false);
    expect(g.getUnit("R-1").surrendered ?? false).toBe(false);
    // Run to its end: then the break is judged on what is left.
    for (let t = 0; t < 200 && g.interior.engagements.length > 0; t++) { g.advanceToPhase("summary"); closeTurn(g); }
    expect(g.interior.engagements).toHaveLength(0);
    expect(g.sideBroken("RED") || g.sideBroken("BLUE")).toBe(true);
  });

  it("lets go of an attacking force whose men have all broken and left (decision 103)", () => {
    const g = battle(2, { morale: true });
    goIn(g);
    closeTurn(g);
    expect(g.interior.inFight("B-1")).toBe(true);
    g.advanceToPhase("summary");
    for (const s of g.getUnit("B-1").soldiers!) if (s.morale && !s.neutralized) s.morale.state = "broken";
    closeTurn(g);
    expect(g.interior.inFight("B-1")).toBe(false); // free to be given orders, and to go back in once rallied
  });

  it("does not wait for a house with no defender left in it: that is searched, not fought for", () => {
    const g = battle(2, { morale: true });
    goIn(g);
    closeTurn(g);
    g.advanceToPhase("summary");
    knockOut(g, "R-1", 2); // half the defenders down: broken, on the count
    const e = g.interior.engagements[0]!;
    expect(e.fight.contested).toBe(true);
    expect(g.sideBroken("RED")).toBe(false); // waiting for the fight
    // The other two slip out of the back of the house: the attacker is left searching it.
    e.fight.leave(g.getUnit("R-1").soldiers!.map((x) => x.id)); // the fight learns of the two down only as its minute begins
    expect(e.fight.contested).toBe(false);
    expect(g.interior.engagements).toContain(e);
    expect(g.sideBroken("RED")).toBe(true);
  });

  it("stops a man broken outside from fighting inside: a broken defender, cornered, is taken prisoner (decision 103)", () => {
    let captured = 0;
    for (let seed = 1; seed <= 12; seed++) {
      // A full squad: of four, one broken and one down is a force broken, which, cornered, gives itself up whole outside.
      const g = battle(seed, { morale: true }, 9);
      goIn(g);
      closeTurn(g);
      if (!g.interior.inFight("R-1")) continue;
      // One man broken — a whole force broken routs out of the fight instead — and kept so, as if nobody could rally him.
      const one = g.getUnit("R-1").soldiers!.find((s) => !s.neutralized && !s.leader)!;
      for (let t = 0; t < 60 && g.interior.engagements.length > 0; t++) {
        if (one.morale && !one.neutralized) one.morale.state = "broken";
        g.advanceToPhase("summary");
        closeTurn(g);
      }
      for (const s of g.getUnit("R-1").soldiers!) {
        if (!s.captured) continue;
        captured++;
        expect(s.neutralized).toBe(true);
      }
    }
    expect(captured).toBeGreaterThan(0);
  });

  it("records the counterattack inside, and replays a battle from before it without one", () => {
    expect(battle(2).toRecording().counterattackInside).toBe(true);
    const g = battle(2, { counterattackInside: false });
    expect(g.toRecording().counterattackInside).toBeUndefined();
    expect(replayGame(JSON.parse(JSON.stringify(g.toRecording()))).counterattackInside).toBe(false);
  });

  it("records morale inside, and replays a battle from before it with the fight going on under a broken side", () => {
    expect(battle(2, { morale: true }).toRecording().moraleInside).toBe(true);
    const g = battle(2, { morale: true, moraleInside: false });
    expect(g.toRecording().moraleInside).toBeUndefined();
    expect(replayGame(JSON.parse(JSON.stringify(g.toRecording()))).moraleInside).toBe(false);
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
