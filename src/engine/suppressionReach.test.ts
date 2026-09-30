import { describe, it, expect } from "vitest";
import { Game } from "./game.js";
import { makeInfantry } from "./units.js";
import { roundSuppression } from "./morale.js";
import { HEADS_DOWN, ROOF_SUPPRESSION_FACTOR, SUPPRESSION, SUPPRESSION_REACH_81MM } from "./data/morale.js";
import { FORCE_FOOTPRINT_RADIUS_M } from "./data/lethality.js";
import { replayGame } from "./recording.js";
import type { GameOptions } from "./game.js";

/**
 * Rules decision 63, S1 and S3: a shell suppresses further than it kills
 * (FM 7-90: probable within 30 m of the burst, an even chance at 75 m), and a
 * roof halves what it puts on a force.
 */
describe("how far a round suppresses (decision 63, S1)", () => {
  it("the whole within 30 m of the nearest man, half to 75 m, nothing beyond", () => {
    const edge = (m: number) => m + FORCE_FOOTPRINT_RADIUS_M;
    expect(roundSuppression("mortar", edge(SUPPRESSION_REACH_81MM.full))).toBe(SUPPRESSION.indirect);
    expect(roundSuppression("mortar", edge(SUPPRESSION_REACH_81MM.full + 1))).toBe(SUPPRESSION.indirect / 2);
    expect(roundSuppression("mortar", edge(SUPPRESSION_REACH_81MM.half))).toBe(SUPPRESSION.indirect / 2);
    expect(roundSuppression("mortar", edge(SUPPRESSION_REACH_81MM.half + 1))).toBe(0);
    // A heavier shell reaches further, by the square root of its lethal area.
    expect(roundSuppression("artillery", edge(SUPPRESSION_REACH_81MM.half + 20))).toBe(SUPPRESSION.indirect / 2);
  });

  // RED's squads 50 m and 300 m from BLUE's mortar's aim: beyond the lethal
  // blast's reach (about 37 m from a force's point), inside and outside the
  // suppression reach.
  const shell = (opts: Partial<GameOptions>, roofed = false) => {
    const g = new Game({ seed: 5, morale: true, enforceC2: false, commandEchelon: { RED: "company", BLUE: "company" }, ...opts });
    const near = makeInfantry("R1", "RED", "squad", { x: 50, y: 0 }, 8);
    if (roofed) near.baseCover = "full";
    g.addUnit(near);
    const far = g.addUnit(makeInfantry("R2", "RED", "squad", { x: 300, y: 0 }, 8));
    g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: -600 }, 8));
    g.beginTurn();
    g.advanceToPhase("targeting");
    g.queueIndirectFire("mortar", "BLUE", { x: 0, y: 0 }, { rounds: 1 });
    // It lands at the start of the next turn; read the force before the turn's end halves it.
    g.advanceToPhase("summary");
    g.advanceToPhase("initiative");
    const { resolved } = g.advanceToPhase("resolvePriorArty");
    expect(resolved).toHaveLength(1);
    return { g, near: g.getUnit("R1"), far, impact: resolved![0]!.dispersion.impact };
  };

  it("suppresses a squad the blast does not reach, and not one far off", () => {
    const on = shell({});
    // The round fell short of the near squad's lethal reach, and inside its suppression reach.
    expect(Math.hypot(on.impact.x - 50, on.impact.y)).toBeGreaterThan(40);
    expect(on.near.suppression ?? 0).toBeGreaterThan(0);
    expect(on.far.suppression ?? 0).toBe(0);
    // Before the decision, only the blast's reach was shelled.
    const off = shell({ suppressionReach: false });
    expect(off.near.suppression ?? 0).toBe(0);
  });

  it("a roof halves it (S3)", () => {
    const open = shell({ roofsDampSuppression: false }, true).near.suppression ?? 0;
    const roof = shell({}, true).near.suppression ?? 0;
    expect(open).toBeGreaterThan(0);
    expect(roof).toBeLessThanOrEqual(Math.ceil(open * ROOF_SUPPRESSION_FACTOR));
    expect(roof).toBeGreaterThan(0);
  });

  it("is on in a new game, recorded, and off in a recording made before it", () => {
    const g = new Game({ seed: 1 });
    expect([g.suppressionReach, g.roofsDampSuppression]).toEqual([true, true]);
    const r = g.toRecording();
    expect(replayGame(r).suppressionReach).toBe(true);
    delete (r as { suppressionReach?: boolean }).suppressionReach;
    delete (r as { roofsDampSuppression?: boolean }).roofsDampSuppression;
    const old = replayGame(r);
    expect([old.suppressionReach, old.roofsDampSuppression]).toEqual([false, false]);
  });
});

describe("pinned means heads down (decision 63, S2)", () => {
  const field = (enemyAt: number, opts: Partial<GameOptions> = {}) => {
    const g = new Game({ seed: 3, morale: true, trackIntel: true, enforceC2: false, ...opts });
    const red = g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 8));
    const blue = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: enemyAt }, 8));
    g.beginTurn();
    g.advanceToPhase("combat");
    red.suppression = SUPPRESSION.pinned; // pinned
    return { g, red, blue };
  };

  it("fires out to rifle range (decision 65), and at nothing beyond", () => {
    const far = field(HEADS_DOWN.fireWithinM + 50);
    expect(far.g.fire("R", "B", { weapon: "smallArms" })).toMatchObject({ fired: false, reason: "heads down" });
    const near = field(HEADS_DOWN.fireWithinM - 20);
    expect(near.g.fire("R", "B", { weapon: "smallArms" }).fired).toBe(true);
    // As decision 63 built it: nothing beyond 100 m.
    const as63 = field(HEADS_DOWN.aimedWithinM + 50, { pinnedFiresAtRange: false });
    expect(as63.g.fire("R", "B", { weapon: "smallArms" })).toMatchObject({ fired: false, reason: "heads down" });
    // Before decision 63 a pinned force shot at any range, at half its aim.
    const before = field(HEADS_DOWN.fireWithinM + 50, { headsDown: false });
    expect(before.g.fire("R", "B", { weapon: "smallArms" }).reason).not.toBe("heads down");
  });

  it("aims worse beyond close range, heads down (decision 65)", () => {
    const at = (range: number, pinned: boolean) => {
      const f = field(range);
      if (!pinned) f.red.suppression = 0;
      return f.g.fire("R", "B", { weapon: "smallArms" }).hitChance;
    };
    const beyond = HEADS_DOWN.aimedWithinM + 100;
    expect(at(beyond, true)).toBeCloseTo(at(beyond, false) * HEADS_DOWN.beyondAimFactor, 6);
    const close = HEADS_DOWN.aimedWithinM - 20;
    expect(at(close, true)).toBeCloseTo(at(close, false), 6);
  });

  it("learns nothing beyond 50 m, even of the force shooting at it", () => {
    const far = field(200);
    far.g.fire("B", "R", { weapon: "smallArms" });
    expect(far.g.contactFor("RED", "B")).toBeUndefined();
    // The firer still finds its target: its own head is up.
    expect(far.g.contactFor("BLUE", "R")).toBeDefined();
    const close = field(HEADS_DOWN.sightWithinM - 10);
    close.g.fire("B", "R", { weapon: "smallArms" });
    expect(close.g.contactFor("RED", "B")).toBeDefined();
    const before = field(200, { headsDown: false });
    before.g.fire("B", "R", { weapon: "smallArms" });
    expect(before.g.contactFor("RED", "B")).toBeDefined();
  });
});

describe("assaulted while pinned (decision 63, S5)", () => {
  // BLUE's squad 20 m from RED's, in the fire phase, RED's men shaken.
  const assaulted = (seed: number, suppression: number, opts: Partial<GameOptions> = {}) => {
    const g = new Game({ seed, morale: true, enforceC2: false, ...opts });
    g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 20 }, 8));
    const red = g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 8));
    g.beginTurn();
    g.advanceToPhase("combat");
    for (const s of red.soldiers!) s.morale!.will = 25;
    red.suppression = suppression;
    return { g, red, result: g.assault("B", "R", 1) };
  };

  it("tests a pinned defender first, and a broken one gives itself up or runs, on a roll", () => {
    const outcomes = { held: 0, surrendered: 0, routed: 0 };
    for (let seed = 1; seed <= 40; seed++) {
      const { g, red, result } = assaulted(seed, SUPPRESSION.pinned);
      expect(result.fired).toBe(true);
      const outcome = result.nerve?.outcome ?? "held";
      outcomes[outcome]++;
      if (outcome === "surrendered") {
        expect(red.surrendered).toBe(true);
        expect(result.defenderCasualties).toBe(0); // taken, not shot
      }
      if (outcome === "routed") {
        expect(red.routing).toBe(true);
        expect(g.standingOrderFor(red.id)).toMatchObject({ withdraw: true, gait: "run" });
      }
    }
    expect(outcomes.surrendered).toBeGreaterThan(0);
    expect(outcomes.routed).toBeGreaterThan(0);
  });

  it("does not test a defender neither pinned nor suppressed, nor any before the decision", () => {
    for (let seed = 1; seed <= 10; seed++) {
      expect(assaulted(seed, 0).result.nerve).toBeUndefined();
      const before = assaulted(seed, SUPPRESSION.pinned, { assaultNerve: false });
      expect(before.result.nerve).toBeUndefined();
      expect(before.red.surrendered).toBeFalsy();
    }
  });

  it("is on in a new game, recorded, and off in a recording made before it", () => {
    const r = new Game({ seed: 1 }).toRecording();
    expect(r.assaultNerve).toBe(true);
    expect(r.pinnedFiresAtRange).toBe(true);
    delete (r as { assaultNerve?: boolean }).assaultNerve;
    delete (r as { pinnedFiresAtRange?: boolean }).pinnedFiresAtRange;
    const old = replayGame(r);
    expect([old.assaultNerve, old.pinnedFiresAtRange]).toEqual([false, false]);
  });
});
