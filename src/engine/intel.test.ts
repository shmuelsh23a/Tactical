import { describe, it, expect } from "vitest";
import { Game } from "./game.js";
import { IntelLedger } from "./intel.js";
import { makeInfantry, makeVehicle } from "./units.js";
import { replayGame } from "./recording.js";

describe("the contact ledger", () => {
  it("keeps the last report per force, per side", () => {
    const intel = new IntelLedger();
    intel.record("BLUE", "RED-1", { x: 0, y: 0 }, 1, "movement");
    intel.record("BLUE", "RED-1", { x: 50, y: 0 }, 3, "uav");

    const contact = intel.contactFor("BLUE", "RED-1");
    expect(contact).toEqual({
      unitId: "RED-1",
      lastSeenTurn: 3,
      lastKnownPosition: { x: 50, y: 0 },
      source: "uav",
      lastKnownNeutralized: false,
    });
    expect(intel.contactsFor("BLUE")).toHaveLength(1);
    // One side's picture is not the other's.
    expect(intel.knows("RED", "RED-1")).toBe(false);
  });

  it("does not alias the position it was handed", () => {
    const intel = new IntelLedger();
    const seen = { x: 10, y: 10 };
    intel.record("BLUE", "RED-1", seen, 1, "movement");
    seen.x = 999;
    expect(intel.contactFor("BLUE", "RED-1")?.lastKnownPosition).toEqual({ x: 10, y: 10 });
  });
});

/** A squad 200 m from an enemy squad, with the knowledge model on. */
function contact(seed = 4, trackIntel = true) {
  const g = new Game({ seed, trackIntel, enforceC2: false });
  const blue = g.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", { x: 0, y: 200 }, 8));
  const red = g.addUnit(makeInfantry("RED-1", "RED", "squad", { x: 0, y: 0 }, 6));
  g.beginTurn();
  return { g, blue, red };
}

describe("what each side knows", () => {
  it("starts with both sides blind", () => {
    const { g } = contact();
    expect(g.contactsFor("BLUE")).toEqual([]);
    expect(g.contactsFor("RED")).toEqual([]);
  });

  it("picks the enemy up on the move, and is picked up in turn", () => {
    // Seeded so both rolls land; the point is that the exchange is mutual —
    // the defender never moves, so without its own roll it would stay blind.
    const { g, blue, red } = contact();
    g.advanceToPhase("movement");
    g.moveUnit(blue.id, { x: 0, y: 160 }, "normal");
    // RED is stationary, so the mover only finds it inside the 20 m band; RED
    // looks over its sector on the way into the fire phase.
    expect(g.knows("BLUE", red.id)).toBe(false);
    const { observed } = g.advanceToPhase("combat");

    expect(observed.map((o) => o.observerId)).toContain(red.id);
    expect(g.knows("RED", blue.id)).toBe(true);
  });

  it("remembers where a force was, not where it is", () => {
    const g = new Game({ seed: 4, trackIntel: true, enforceC2: false });
    const blue = g.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", { x: 0, y: 290 }, 8));
    g.addUnit(makeInfantry("RED-1", "RED", "squad", { x: 0, y: 0 }, 6));
    g.beginTurn();
    g.advanceToPhase("movement");
    g.moveUnit(blue.id, { x: 0, y: 250 }, "normal");
    g.advanceToPhase("combat"); // RED looks over its sector and picks it up
    expect(g.knows("RED", blue.id)).toBe(true);
    const seenAt = { ...blue.position };

    // Next turn it runs clear of the 300 m band, so RED never sees it again.
    g.advanceToPhase("initiative");
    g.advanceToPhase("movement");
    g.moveUnit(blue.id, { x: 0, y: 350 }, "run");
    g.advanceToPhase("combat");

    const mark = g.contactFor("RED", blue.id);
    expect(mark?.lastKnownPosition).toEqual(seenAt);
    expect(mark?.lastSeenTurn).toBe(1);
    expect(mark?.lastKnownPosition).not.toEqual(blue.position);
  });

  it("puts a shot's two forces on each other's map", () => {
    const { g, blue, red } = contact();
    g.advanceToPhase("combat");
    const result = g.fire(blue.id, red.id, { weapon: "sustainedMg" });
    expect(result.fired).toBe(true);
    // The firer plainly sees what it is shooting at; the target learns where
    // the fire is coming from.
    expect(g.contactFor("BLUE", red.id)?.source).toBe("fire");
    expect(g.contactFor("RED", blue.id)?.source).toBe("fire");
  });

  it("gives nothing away for a shot that was never taken", () => {
    const g = new Game({ seed: 1, trackIntel: true, enforceC2: false });
    const blue = g.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", { x: 0, y: 900 }, 8));
    const red = g.addUnit(makeVehicle("RED-TANK", "RED", { x: 0, y: 0 }));
    g.beginTurn();
    g.advanceToPhase("combat");
    expect(g.fire(blue.id, red.id, { weapon: "smallArms" }).fired).toBe(false);
    expect(g.knows("RED", blue.id)).toBe(false);
  });

  it("hands a UAV sweep to the side that flew it", () => {
    const { g, blue, red } = contact();
    g.advanceToPhase("intel");
    g.uavSweep("drone", { x: 0, y: 0 }, "BLUE");
    expect(g.contactFor("BLUE", red.id)?.source).toBe("uav");
    expect(g.knows("RED", blue.id)).toBe(false);
  });

  it("does not see through smoke", () => {
    const g = new Game({ seed: 4, trackIntel: true, enforceC2: false });
    const blue = g.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", { x: 0, y: 200 }, 8));
    const red = g.addUnit(makeInfantry("RED-1", "RED", "squad", { x: 0, y: 0 }, 6));
    g.beginTurn();
    g.advanceToPhase("targeting");
    g.deploySmoke("grenade", "RED", { x: 0, y: 100 }); // between them
    g.advanceToPhase("movement");
    g.moveUnit(blue.id, { x: 0, y: 160 }, "normal");
    const { observed } = g.advanceToPhase("combat");

    expect(g.knows("BLUE", red.id)).toBe(false);
    expect(observed).toEqual([]);
  });

  it("costs nothing when the module is off", () => {
    // The rolls a knowledge model needs are the standing observation ones, and
    // they are simply not made without it — so a game played without the module
    // draws exactly what it always drew.
    const withIntel = contact(4, true);
    const without = contact(4, false);
    for (const { g, blue } of [withIntel, without]) {
      g.advanceToPhase("movement");
      g.moveUnit(blue.id, { x: 0, y: 160 }, "normal");
    }
    // The bound itself is identical either way…
    expect(without.g.rng.getState()).toBe(withIntel.g.rng.getState());

    // …and it is the watching that costs, which only one of them does.
    withIntel.g.advanceToPhase("combat");
    without.g.advanceToPhase("combat");
    expect(without.g.contactsFor("BLUE")).toEqual([]);
    expect(without.g.rng.getState()).not.toBe(withIntel.g.rng.getState());
  });

  it("replays out of a recording, contacts and all", () => {
    const { g, blue } = contact();
    g.advanceToPhase("movement");
    g.moveUnit(blue.id, { x: 0, y: 160 }, "normal");
    g.advanceToPhase("combat");

    const replayed = replayGame(g.toRecording());
    expect(replayed.trackIntel).toBe(true);
    expect(replayed.contactsFor("BLUE")).toEqual(g.contactsFor("BLUE"));
    expect(replayed.contactsFor("RED")).toEqual(g.contactsFor("RED"));
  });

  it("reads a recording made before the module as having been played without it", () => {
    const { g, blue } = contact(4, false);
    g.advanceToPhase("movement");
    g.moveUnit(blue.id, { x: 0, y: 160 }, "normal");

    const recording = g.toRecording();
    delete (recording as { trackIntel?: boolean }).trackIntel;
    const replayed = replayGame(recording);
    expect(replayed.trackIntel).toBe(false);
    expect(replayed.rng.getState()).toBe(g.rng.getState());
  });
});
