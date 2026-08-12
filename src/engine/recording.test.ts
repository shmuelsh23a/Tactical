import { describe, it, expect } from "vitest";
import { Game } from "./game.js";
import { replayGame, type GameRecording } from "./recording.js";
import { makeCommandGroup, makeInfantry, makeVehicle } from "./units.js";

/**
 * Play a game that exercises every recorded action: setup, the turn loop,
 * movement into a minefield, direct fire, an assault, indirect fire and both
 * kinds of smoke. Returns the played game.
 */
function playDemo(seed = 2026): Game {
  const g = new Game({ seed });
  const blue = g.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", { x: 0, y: 300 }, 8));
  // A second squad already in contact, so the assault does not depend on
  // whether the first one survives the approach intact.
  const closer = g.addUnit(makeInfantry("BLUE-2", "BLUE", "squad", { x: 0, y: 80 }, 8));
  g.addUnit(makeCommandGroup("BLUE-HQ", "BLUE", "platoon", { x: 0, y: 380 }, 3));
  const red = g.addUnit(makeInfantry("RED-1", "RED", "squad", { x: 0, y: 60 }, 6));
  g.addUnit(makeVehicle("RED-TANK", "RED", { x: 120, y: 40 }));
  g.addMine({
    side: "RED",
    type: "antiPersonnel",
    position: { x: 0, y: 200 },
    armed: true,
    detected: false,
  });

  g.beginTurn();

  g.advanceToPhase("intel");
  g.uavSweep("drone", { x: 0, y: 100 }, "BLUE");

  g.advanceToPhase("targeting");
  g.queueIndirectFire("mortar", "BLUE", { x: 0, y: 60 }, { firingFrom: { x: 0, y: 400 } });
  g.deploySmoke("grenade", "BLUE", { x: 0, y: 250 });
  g.deploySmoke("artillery", "RED", { x: 60, y: 200 });

  g.advanceToPhase("movement");
  g.moveUnit(blue.id, { x: 0, y: 210 }, "run"); // walks the charge
  g.issueOrders(red.id);

  g.advanceToPhase("combat");
  g.fire(blue.id, red.id, { weapon: "smallArms" });
  g.fireExplosive("tankRound", "RED-TANK", blue.id);
  g.assault(closer.id, red.id, 2);

  // Second turn: press on where the rules still allow it, and let the mortar
  // land on the way into movement.
  g.advanceToPhase("initiative");
  g.advanceToPhase("movement");
  if (!blue.movementBlocked && g.canManoeuvre(blue.id)) {
    g.moveUnit(blue.id, { x: 0, y: 160 }, "run");
  }
  g.advanceToPhase("combat");
  g.fire(closer.id, red.id, { weapon: "sustainedMg" });
  g.advanceToPhase("summary");
  return g;
}

/** Everything a replay has to reproduce. */
function stateOf(g: Game) {
  return {
    turn: g.turn,
    phase: g.phase,
    initiativeOrder: g.initiativeOrder,
    units: g.units,
    mines: g.mines,
    smoke: g.smoke,
    pendingFire: g.pendingFire,
    pendingSmoke: g.pendingSmoke,
    rngState: g.rng.getState(),
  };
}

describe("battle recording", () => {
  it("replays a game to exactly the same state", () => {
    const played = playDemo();
    const replayed = replayGame(played.toRecording());
    expect(stateOf(replayed)).toEqual(stateOf(played));
  });

  it("leaves the rng in the same place, so play can continue identically", () => {
    const played = playDemo();
    const replayed = replayGame(played.toRecording());
    expect(replayed.rng.getState()).toBe(played.rng.getState());
    // …and the next draws agree.
    expect([replayed.rng.next(), replayed.rng.next()]).toEqual([
      played.rng.next(),
      played.rng.next(),
    ]);
  });

  it("reproduces generated ids, not just positions", () => {
    const played = playDemo();
    const replayed = replayGame(played.toRecording());
    expect(replayed.mines.map((m) => m.id)).toEqual(played.mines.map((m) => m.id));
    expect(replayed.smoke.map((s) => s.id)).toEqual(played.smoke.map((s) => s.id));
    expect(replayed.pendingSmoke.map((s) => s.id)).toEqual(
      played.pendingSmoke.map((s) => s.id),
    );
  });

  it("numbers ids per game, not per process", () => {
    // Two games built the same way must agree, however many ran before them.
    const a = playDemo(7);
    const b = playDemo(7);
    expect(b.mines.map((m) => m.id)).toEqual(a.mines.map((m) => m.id));
    expect(b.smoke.map((s) => s.id)).toEqual(a.smoke.map((s) => s.id));
  });

  it("survives a round trip through JSON", () => {
    const played = playDemo();
    const json = JSON.stringify(played.toRecording());
    const replayed = replayGame(JSON.parse(json) as GameRecording);
    expect(stateOf(replayed)).toEqual(stateOf(played));
  });

  it("re-records to the same action log", () => {
    const played = playDemo();
    const replayed = replayGame(played.toRecording());
    expect(replayed.toRecording()).toEqual(played.toRecording());
  });

  it("records the outermost action only, not the phases it drove", () => {
    const g = new Game({ seed: 1 });
    g.beginTurn();
    g.advanceToPhase("combat");
    const kinds = g.toRecording().actions.map((a) => a.kind);
    expect(kinds).toEqual(["beginTurn", "advanceToPhase"]);
  });

  it("does not record an action that was refused", () => {
    const g = new Game({ seed: 1 });
    const u = g.addUnit(makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 8));
    g.beginTurn();
    g.advanceToPhase("movement");
    expect(() => g.moveUnit(u.id, { x: 0, y: 500 }, "normal")).toThrow(/exceeds/);
    const kinds = g.toRecording().actions.map((a) => a.kind);
    expect(kinds).not.toContain("moveUnit");
  });

  it("does not alias live state — playing on cannot rewrite history", () => {
    const g = new Game({ seed: 1 });
    const u = g.addUnit(makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 8));
    const before = g.toRecording();
    g.beginTurn();
    g.advanceToPhase("movement");
    g.moveUnit(u.id, { x: 0, y: 40 }, "normal");

    const recorded = before.actions[0];
    expect(recorded?.kind).toBe("addUnit");
    if (recorded?.kind === "addUnit") {
      expect(recorded.unit.position).toEqual({ x: 0, y: 0 });
    }
    expect(before.actions.length).toBe(1);
  });

  it("refuses a recording from an unknown format version", () => {
    const bad = { version: 99, seed: 1, sides: [], enforceC2: true, actions: [] };
    expect(() => replayGame(bad as unknown as GameRecording)).toThrow(/version/);
  });
});
