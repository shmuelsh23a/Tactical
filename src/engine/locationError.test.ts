import { describe, it, expect } from "vitest";
import { Game } from "./game.js";
import { IntelLedger } from "./intel.js";
import { makeInfantry } from "./units.js";
import { replayGame } from "./recording.js";
import { LOCATION_ERROR, UAV_LOCATION_ERROR_M, locationSigma } from "./data/locationError.js";

/**
 * Rules decision 51: a sighting reports where an observer judged a force to
 * be, off along the sight line by the eye's range estimate and across it by
 * the compass.
 */

/** BLUE 400 m north of RED, both squads, knowledge model on. */
function pair(seed: number, locationError: boolean) {
  const g = new Game({ seed, trackIntel: true, enforceC2: false, locationError });
  const blue = g.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", { x: 0, y: 400 }, 8));
  const red = g.addUnit(makeInfantry("RED-1", "RED", "squad", { x: 0, y: 0 }, 6));
  g.beginTurn();
  g.advanceToPhase("combat");
  return { g, blue, red };
}

describe("the figures", () => {
  it("grows with range along the sight line, barely across it", () => {
    expect(locationSigma(500, LOCATION_ERROR.eye)).toEqual({ along: 100, across: 5 });
    expect(locationSigma(1000, LOCATION_ERROR.eye)).toEqual({ along: 200, across: 10 });
    // An observation post's range card halves the range error.
    expect(locationSigma(1000, LOCATION_ERROR.observationPost).along).toBe(100);
    // Close in, the observer's own place on the map is the limit.
    expect(locationSigma(10, LOCATION_ERROR.eye)).toEqual({ along: 5, across: 5 });
  });
});

describe("the ledger", () => {
  it("combines two estimates of a force that has not moved, weighted by how good each is", () => {
    const intel = new IntelLedger();
    const truth = { x: 0, y: 0 };
    intel.record("BLUE", "RED-1", { x: 100, y: 0 }, 1, "movement", false, { truth, sigma: 100 });
    intel.record("BLUE", "RED-1", { x: 0, y: 20 }, 2, "movement", false, { truth, sigma: 50 });
    // Weights 1/100² and 1/50²: the better report counts four times as much.
    const at = intel.contactFor("BLUE", "RED-1")!.lastKnownPosition;
    expect(at.x).toBeCloseTo(20);
    expect(at.y).toBeCloseTo(16);
    expect(intel.spreadOf("BLUE", "RED-1")).toBeCloseTo(1 / Math.sqrt(1 / 100 ** 2 + 1 / 50 ** 2));
  });

  it("places a force afresh once it has moved", () => {
    const intel = new IntelLedger();
    intel.record("BLUE", "RED-1", { x: 100, y: 0 }, 1, "movement", false, { truth: { x: 0, y: 0 }, sigma: 10 });
    intel.record("BLUE", "RED-1", { x: 500, y: 0 }, 2, "movement", false, { truth: { x: 450, y: 0 }, sigma: 100 });
    expect(intel.contactFor("BLUE", "RED-1")!.lastKnownPosition).toEqual({ x: 500, y: 0 });
    expect(intel.spreadOf("BLUE", "RED-1")).toBe(100);
  });

  it("forgets the spread with the contact", () => {
    const intel = new IntelLedger();
    intel.record("BLUE", "RED-1", { x: 1, y: 0 }, 1, "movement", false, { truth: { x: 0, y: 0 }, sigma: 10 });
    intel.expire(10, 3);
    expect(intel.spreadOf("BLUE", "RED-1")).toBeUndefined();
  });
});

describe("a sighting with location error", () => {
  it("reports the force off where it stands, and moves no other roll in the game", () => {
    const on = pair(7, true);
    const off = pair(7, false);
    for (const { g, blue, red } of [on, off]) g.fire(blue.id, red.id, { weapon: "smallArms" });
    // The umpire's game is the same battle either way: the error has its own stream.
    expect(on.g.rng.getState()).toBe(off.g.rng.getState());
    expect(on.red.soldiers).toEqual(off.red.soldiers);
    // What BLUE knows is not.
    expect(off.g.contactFor("BLUE", "RED-1")!.lastKnownPosition).toEqual(off.red.position);
    expect(on.g.contactFor("BLUE", "RED-1")!.lastKnownPosition).not.toEqual(on.red.position);
    expect(on.g.reportSpread("BLUE", "RED-1")).toBeGreaterThan(0);
    expect(off.g.reportSpread("BLUE", "RED-1")).toBeUndefined();
  });

  it("errs by about a fifth of the range along the sight line and 10 mils across it", () => {
    // 400 fire exchanges at 400 m: along the line (north–south) the spread
    // should be near 80 m, across it near the 5 m floor (4 m of compass).
    const along: number[] = [];
    const across: number[] = [];
    for (let seed = 1; seed <= 400; seed++) {
      const { g, blue, red } = pair(seed, true);
      g.fire(blue.id, red.id, { weapon: "smallArms" });
      const at = g.contactFor("BLUE", red.id)!.lastKnownPosition;
      along.push(at.y - red.position.y);
      across.push(at.x - red.position.x);
    }
    const sd = (xs: number[]) => Math.sqrt(xs.reduce((t, x) => t + x * x, 0) / xs.length);
    expect(sd(along)).toBeGreaterThan(70);
    expect(sd(along)).toBeLessThan(90);
    expect(sd(across)).toBeGreaterThan(4);
    expect(sd(across)).toBeLessThan(6);
  });

  it("gives a UAV its own flat error, whatever the range", () => {
    const g = new Game({ seed: 3, trackIntel: true, enforceC2: false, locationError: true });
    g.addUnit(makeInfantry("RED-1", "RED", "squad", { x: 0, y: 0 }, 6));
    g.beginTurn();
    g.advanceToPhase("intel");
    g.uavSweep("drone", { x: 0, y: 0 }, "BLUE");
    expect(g.knows("BLUE", "RED-1")).toBe(true);
    expect(g.reportSpread("BLUE", "RED-1")).toBe(UAV_LOCATION_ERROR_M);
  });

  it("is placed better the longer a force that stays put is watched", () => {
    const { g, blue, red } = pair(11, true);
    g.fire(blue.id, red.id, { weapon: "smallArms" });
    const first = g.reportSpread("BLUE", red.id)!;
    g.fire(blue.id, red.id, { weapon: "smallArms" });
    expect(g.reportSpread("BLUE", red.id)!).toBeLessThan(first);
  });

  it("replays out of a recording, reports and all", () => {
    const { g, blue, red } = pair(5, true);
    g.fire(blue.id, red.id, { weapon: "smallArms" });
    const recording = g.toRecording();
    expect(recording.locationError).toBe(true);
    const replayed = replayGame(recording);
    expect(replayed.locationError).toBe(true);
    expect(replayed.contactsFor("BLUE")).toEqual(g.contactsFor("BLUE"));
    expect(replayed.contactsFor("RED")).toEqual(g.contactsFor("RED"));
  });

  it("reads a recording made before it as played with exact sightings", () => {
    const { g, blue, red } = pair(5, false);
    g.fire(blue.id, red.id, { weapon: "smallArms" });
    const recording = g.toRecording();
    expect(recording.locationError).toBeUndefined();
    expect(replayGame(recording).locationError).toBe(false);
  });
});
