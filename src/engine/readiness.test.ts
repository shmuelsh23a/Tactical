import { describe, expect, it } from "vitest";
import { Game, type GameOptions } from "./game.js";
import { makeInfantry } from "./units.js";
import { FLAT_GROUND } from "./terrain.js";
import { replayGame } from "./recording.js";
import { READINESS_SPOTTING, SURPRISE_RECOVERY_TURNS, UNREADY } from "./data/directFire.js";
import { detectionChance } from "./combat/detection.js";
import type { Experience, Readiness } from "./types.js";
import { forceQuality } from "./morale.js";

/**
 * A RED squad at the origin facing +x (a prepared front, so it watches ±60°),
 * and an unseen BLUE squad 150 m away at `bearing` firing at it. Morale and
 * heads down are off, so the ratio read is this rule's alone, whatever the
 * seed. Returns the shot's chance, and the game and RED after it.
 */
function caught(readiness: Readiness | undefined, bearing: number, opts: Partial<GameOptions> = {}, experience?: Experience) {
  const g = new Game({ seed: 3, enforceC2: false, trackIntel: true, morale: false, headsDown: false, terrain: FLAT_GROUND, ...opts });
  const red = makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 8);
  red.front = 0;
  if (readiness !== undefined) red.readiness = readiness;
  if (experience) red.experience = experience;
  g.addUnit(red);
  const rad = (bearing * Math.PI) / 180;
  g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 150 * Math.cos(rad), y: 150 * Math.sin(rad) }, 8));
  g.beginTurn();
  g.advanceToPhase("combat");
  const hitChance = g.fire("B", "R", { weapon: "smallArms", hasLineOfSight: true }).hitChance;
  return { hitChance, g, red };
}

/** The same shot from a BLUE squad RED has seen: never a surprise. */
function expected(bearing: number) {
  const g = new Game({ seed: 3, enforceC2: false, trackIntel: true, morale: false, headsDown: false, terrain: FLAT_GROUND });
  const red = makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 8);
  red.front = 0;
  red.readiness = 1;
  g.addUnit(red);
  const rad = (bearing * Math.PI) / 180;
  g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 150 * Math.cos(rad), y: 150 * Math.sin(rad) }, 8));
  g.beginTurn();
  g.advanceToPhase("combat");
  g.fire("R", "B", { weapon: "smallArms", hasLineOfSight: true });
  return g.fire("B", "R", { weapon: "smallArms", hasLineOfSight: true }).hitChance;
}

describe("readiness (rules decision 86)", () => {
  it("decides who can be caught unready: an unaware force from any side, an alert one from outside its arc, one stood to never", () => {
    const front = expected(0);
    const rear = expected(180);
    // Unaware: caught even from the front it faces.
    expect(caught(1, 0).hitChance / front).toBeCloseTo(UNREADY.hitFactor, 6);
    // Alert — the default — only from outside its arc, as decision 85 alone.
    expect(caught(2, 0).hitChance / front).toBeCloseTo(1, 6);
    expect(caught(undefined, 0).hitChance / front).toBeCloseTo(1, 6);
    expect(caught(2, 180).hitChance / rear).toBeCloseTo(UNREADY.hitFactor, 6);
    // Stood to: not even from behind.
    expect(caught(3, 180).hitChance / rear).toBeCloseTo(1, 6);
  });

  it("stands a force to the moment it is fired on, and the force that sees the enemy too", () => {
    const { g, red } = caught(1, 180);
    expect(red.readiness).toBe(3);
    // BLUE fired at RED, so BLUE has seen it.
    expect(g.getUnit("B").readiness).toBe(3);
  });

  it("raises a force a level for an indication of the enemy: a charge it finds", () => {
    // Seeds until the squad finds the charge beside its bound (the document's
    // 30% within the search band): the rule is about what finding it does.
    for (let seed = 0; seed < 60; seed++) {
      const g = new Game({ seed, enforceC2: false, trackIntel: true, terrain: FLAT_GROUND });
      const sq = makeInfantry("S", "BLUE", "squad", { x: 0, y: 0 }, 8);
      sq.readiness = 1;
      g.addUnit(sq);
      g.addMine({ side: "RED", type: "antiPersonnel", position: { x: 15, y: 25 }, armed: true, detected: false });
      g.beginTurn();
      g.advanceToPhase("movement");
      if (!g.moveUnit("S", { x: 0, y: 50 }, "normal").detection.foundMineIds.length) continue;
      expect(sq.readiness).toBe(2);
      return;
    }
    throw new Error("no seed in 60 found the charge");
  });

  it("keeps a force caught unready shaken for longer the greener it is, halving with each step", () => {
    const turns = (experience: Experience) => {
      const { g, red } = caught(1, 0, {}, experience);
      return red.surprisedUntilTurn === undefined ? 0 : red.surprisedUntilTurn - g.turn + 1;
    };
    expect(turns("green")).toBe(SURPRISE_RECOVERY_TURNS.green);
    expect(turns("regular")).toBe(SURPRISE_RECOVERY_TURNS.regular);
    expect(turns("veteran")).toBe(SURPRISE_RECOVERY_TURNS.veteran);
    expect(turns("elite")).toBe(0);
    expect(SURPRISE_RECOVERY_TURNS.green / SURPRISE_RECOVERY_TURNS.regular).toBe(SURPRISE_RECOVERY_TURNS.regular / SURPRISE_RECOVERY_TURNS.veteran);
    // Without the rule a surprise lasts the turn, as decision 85 had it.
    const { g, red } = caught(1, 180, { readiness: false }, "green");
    expect(red.surprisedUntilTurn).toBe(g.turn);
  });

  it("raises a force a level for shells landing near it, not one far off, nor the side that fired them", () => {
    // 230 m from the aim: inside the 300 m an indication reaches, outside a
    // mortar bomb's suppression (≤125 m), so nothing fires on it to stand it to.
    const g = new Game({ lethality: "document", commandEchelon: { RED: "battalion", BLUE: "battalion" }, seed: 4, enforceC2: false, trackIntel: true });
    const near = makeInfantry("N", "RED", "squad", { x: 230, y: 0 }, 8);
    const far = makeInfantry("F", "RED", "squad", { x: 700, y: 0 }, 8);
    const own = makeInfantry("B", "BLUE", "squad", { x: 0, y: 1500 }, 8);
    for (const u of [near, far, own]) u.readiness = 1;
    for (const u of [near, far, own]) g.addUnit(u);
    g.beginTurn();
    g.advanceToPhase("targeting");
    g.queueIndirectFire("mortar", "BLUE", { x: 0, y: 0 }, { rounds: 3 });
    g.advanceToPhase("summary");
    g.advanceToPhase("initiative");
    g.advanceToPhase("targeting");
    g.advanceToPhase("resolvePriorArty");
    expect(near.readiness).toBe(2);
    expect(far.readiness).toBe(1);
    expect(own.readiness).toBe(1);
  });

  it("stands to a force that aims at the enemy before anything can answer it, and one that gives covering fire", () => {
    // An unaware RED squad fires at BLUE: having aimed at it, it has seen it.
    const { g, red } = caught(1, 0);
    expect(red.readiness).toBe(3);
    g.getUnit("B").readiness = 1;
    red.readiness = 1;
    red.firedThisTurn = false;
    g.fire("R", "B", { weapon: "smallArms", hasLineOfSight: true });
    expect(red.readiness).toBe(3);
    // Covering fire: an unaware RED squad covering a lane, BLUE walking up it.
    const c = new Game({ lethality: "document", seed: 1, enforceC2: false, terrain: FLAT_GROUND, morale: false, headsDown: false });
    const coverer = makeInfantry("C", "RED", "squad", { x: 0, y: 0 }, 8);
    coverer.readiness = 1;
    c.addUnit(coverer);
    c.addUnit(makeInfantry("M", "BLUE", "squad", { x: 0, y: 200 }, 8));
    c.beginTurn();
    c.advanceToPhase("combat");
    c.setCovering("C", true);
    c.advanceToPhase("summary");
    c.advancePhase();
    c.advanceToPhase("movement");
    expect(c.moveUnit("M", { x: 0, y: 160 }, "normal").coveringFire.length).toBe(1);
    expect(coverer.readiness).toBe(3);
  });

  it("recovers a force dressed by quality at its cell's pace", () => {
    // A regular, very experienced cell maps onto the `veteran` dial (decision 83).
    const g = new Game({ seed: 3, enforceC2: false, trackIntel: true, morale: false, headsDown: false, terrain: FLAT_GROUND });
    const red = Object.assign(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 8), forceQuality({ type: "regular", experience: "veryExperienced" }));
    red.readiness = 1;
    g.addUnit(red);
    g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 150, y: 0 }, 8));
    g.beginTurn();
    g.advanceToPhase("combat");
    g.fire("B", "R", { weapon: "smallArms", hasLineOfSight: true });
    expect(red.surprisedUntilTurn! - g.turn + 1).toBe(SURPRISE_RECOVERY_TURNS.veteran);
  });

  it("is on for a new game, off for a recording made before it, and writes nothing when off", () => {
    const g = new Game({ seed: 1 });
    expect(g.readiness).toBe(true);
    const recording = g.toRecording();
    delete (recording as { readiness?: boolean }).readiness;
    expect(replayGame(recording).readiness).toBe(false);
    const off = caught(undefined, 180, { readiness: false });
    expect(off.red.readiness).toBeUndefined();
    expect(off.g.getUnit("B").readiness).toBeUndefined();
  });

  it("spots worse unaware and better stood to: the chance to see a force, scaled by its level", () => {
    const watcher = makeInfantry("W", "RED", "squad", { x: 0, y: 0 }, 8);
    const mover = makeInfantry("M", "BLUE", "squad", { x: 0, y: 200 }, 8);
    const alert = detectionChance(watcher, mover).chance;
    expect(detectionChance(watcher, mover, undefined, false, READINESS_SPOTTING[1]).chance).toBeCloseTo(alert * READINESS_SPOTTING[1], 9);
    expect(detectionChance(watcher, mover, undefined, false, READINESS_SPOTTING[3]).chance).toBeCloseTo(Math.min(1, alert * READINESS_SPOTTING[3]), 9);
    expect(READINESS_SPOTTING[2]).toBe(1);
  });

  it("makes an unaware force on the move see about half what an alert one does, and changes nothing when off", () => {
    const spotted = (level: Readiness, opts: Partial<GameOptions> = {}) => {
      let n = 0;
      for (let seed = 0; seed < 400; seed++) {
        const g = new Game({ seed, enforceC2: false, trackIntel: true, terrain: FLAT_GROUND, ...opts });
        const m = makeInfantry("M", "BLUE", "squad", { x: 0, y: 0 }, 8);
        m.readiness = level;
        g.addUnit(m);
        const r = makeInfantry("R", "RED", "squad", { x: 0, y: 260 }, 8);
        g.addUnit(r);
        g.beginTurn();
        g.advanceToPhase("movement");
        // RED on the move too: seen in the 300 m band, not looked for as hidden.
        r.movedThisTurn = 1;
        if (g.moveUnit("M", { x: 0, y: 50 }, "normal").detection.spottedUnitIds.length) n++;
      }
      return n;
    };
    const unaware = spotted(1);
    const alert = spotted(2);
    expect(alert).toBeGreaterThan(100);
    expect(unaware / alert).toBeGreaterThan(READINESS_SPOTTING[1] - 0.1);
    expect(unaware / alert).toBeLessThan(READINESS_SPOTTING[1] + 0.1);
    // Off: the level is not read, so the same seeds see exactly the same.
    expect(spotted(1, { readiness: false })).toBe(spotted(2, { readiness: false }));
  });
});
