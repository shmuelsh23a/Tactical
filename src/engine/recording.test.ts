import { describe, it, expect } from "vitest";
import { Game } from "./game.js";
import {
  replayGame,
  replayWithOutcomes,
  sealRecording,
  verifyRecording,
  type GameRecording,
} from "./recording.js";
import { makeCommandGroup, makeInfantry, makeVehicle } from "./units.js";
import { CASUALTY_RULES } from "./data/casualties.js";
import { MOVEMENT_PROFILES } from "./data/movement.js";

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

  it("replays a prefix, for stepping through a debrief", () => {
    const rec = playDemo().toRecording();

    // Nothing applied yet: an empty board before the scenario is laid out.
    const start = replayGame(rec, { upToAction: 0 });
    expect(start.units).toEqual([]);
    expect(start.turn).toBe(0);

    // Every prefix in turn must apply cleanly.
    for (let k = 0; k <= rec.actions.length; k++) {
      expect(() => replayGame(rec, { upToAction: k })).not.toThrow();
    }

    // The full-length prefix is the whole recording.
    expect(replayGame(rec, { upToAction: rec.actions.length }).rng.getState()).toBe(
      replayGame(rec).rng.getState(),
    );
    // Asking past the end is not an error.
    expect(replayGame(rec, { upToAction: 999 }).rng.getState()).toBe(
      replayGame(rec).rng.getState(),
    );
  });

  it("shows a force where it stood before and after the move that shifted it", () => {
    const rec = playDemo().toRecording();
    const moveAt = rec.actions.findIndex((a) => a.kind === "moveUnit");
    expect(moveAt).toBeGreaterThan(-1);

    const before = replayGame(rec, { upToAction: moveAt });
    const after = replayGame(rec, { upToAction: moveAt + 1 });
    const moved = rec.actions[moveAt];
    if (moved?.kind !== "moveUnit") throw new Error("expected a move");

    expect(before.getUnit(moved.unitId).position).not.toEqual(moved.to);
    expect(after.getUnit(moved.unitId).position).toEqual(moved.to);
  });

  it("hands back one outcome per action, aligned with it", () => {
    const rec = playDemo().toRecording();
    const { steps } = replayWithOutcomes(rec);
    expect(steps.length).toBe(rec.actions.length);
    expect(steps.map((s) => s.action)).toEqual(rec.actions);
  });

  it("derives the same outcomes every time — they are not stored", () => {
    const rec = playDemo().toRecording();
    expect(replayWithOutcomes(rec).steps).toEqual(replayWithOutcomes(rec).steps);
  });

  it("reports what a shot actually did", () => {
    const rec = playDemo().toRecording();
    const { steps } = replayWithOutcomes(rec);
    const shot = steps.find((s) => s.outcome.kind === "fire");
    expect(shot).toBeDefined();
    if (shot?.outcome.kind !== "fire") throw new Error("expected a shot");
    expect(shot.outcome.result.fired).toBe(true);
    expect(shot.outcome.result.shooters).toBeGreaterThan(0);
    expect(shot.outcome.result.hits).toBeLessThanOrEqual(shot.outcome.result.shooters);
  });

  it("attributes an artillery impact to the step that resolved it, not the one that marked it", () => {
    const rec = playDemo().toRecording();
    const { steps } = replayWithOutcomes(rec);

    const marked = steps.findIndex((s) => s.action.kind === "queueIndirectFire");
    expect(marked).toBeGreaterThan(-1);
    // Marking a mission only queues it.
    if (steps[marked]?.outcome.kind !== "queueIndirectFire") throw new Error("expected a queued mission");

    const landed = steps.findIndex(
      (s) => s.outcome.kind === "phase" && s.outcome.resolved.length > 0,
    );
    expect(landed).toBeGreaterThan(marked);
  });

  it("reports a charge that went off under a force that moved", () => {
    const rec = playDemo().toRecording();
    const { steps } = replayWithOutcomes(rec);
    const detonations = steps.flatMap((s) =>
      s.outcome.kind === "moveUnit" ? s.outcome.move.mineDetonations : [],
    );
    expect(detonations.length).toBeGreaterThan(0);
  });

  it("replaying a prefix reports only that prefix's outcomes", () => {
    const rec = playDemo().toRecording();
    const full = replayWithOutcomes(rec).steps;
    const partial = replayWithOutcomes(rec, { upToAction: 5 }).steps;
    expect(partial.length).toBe(5);
    expect(partial).toEqual(full.slice(0, 5));
  });

  it("the same decisions under a different seed give different dice", () => {
    // The point of deriving rather than storing: a debrief can ask whether an
    // outcome was the plan or the luck.
    const rec = playDemo(2026).toRecording();
    const other = { ...rec, seed: 99 };
    const a = replayWithOutcomes(rec).game;
    const b = replayWithOutcomes(other).game;
    expect(b.rng.getState()).not.toBe(a.rng.getState());
    // …while the decisions replayed are identical.
    expect(replayWithOutcomes(other).steps.map((s) => s.action)).toEqual(
      replayWithOutcomes(rec).steps.map((s) => s.action),
    );
  });

  it("seals a recording with a fingerprint per action", () => {
    const rec = sealRecording(playDemo().toRecording());
    expect(rec.digests?.length).toBe(rec.actions.length);
    expect(rec.digests?.every((d) => /^[0-9a-f]{8}$/.test(d))).toBe(true);
    // Sealing must not disturb the decisions.
    expect(rec.actions).toEqual(playDemo().toRecording().actions);
  });

  it("verifies a sealed recording that still plays out the same", () => {
    const rec = sealRecording(playDemo().toRecording());
    expect(verifyRecording(rec)).toEqual({ checked: true, ok: true });
  });

  it("cannot check a recording that was never sealed", () => {
    const rec = playDemo().toRecording();
    expect(verifyRecording(rec)).toEqual({ checked: false, ok: true });
  });

  it("reports where a battle first diverges from the one recorded", () => {
    const rec = sealRecording(playDemo().toRecording());
    // Stand in for a rules change: from this action on, the replay no longer
    // produces what it did when the recording was made.
    const broken: GameRecording = {
      ...rec,
      digests: rec.digests!.map((d, i) => (i >= 6 ? "deadbeef" : d)),
    };

    const result = verifyRecording(broken);
    expect(result.checked).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.firstDivergence?.index).toBe(6);
    expect(result.firstDivergence?.action).toEqual(rec.actions[6]);
    expect(result.firstDivergence?.expected).toBe("deadbeef");
    expect(result.firstDivergence?.actual).toBe(rec.digests![6]);
  });

  it("notices a recording sealed under a rule that has since changed", () => {
    // The real scenario: seal under one reading of the document, then change
    // how a number is applied — as decisions 7 and 10 both did — and check.
    const sealed = sealRecording(playDemo().toRecording());
    const threshold = CASUALTY_RULES.neutralizeThreshold;
    const mutable = CASUALTY_RULES as { neutralizeThreshold: number };
    try {
      mutable.neutralizeThreshold = 20; // nobody goes down any more
      const result = verifyRecording(sealed);
      expect(result.checked).toBe(true);
      // The decisions still replay; it is the battle they produce that moved.
      expect(result.ok).toBe(false);
      expect(result.firstDivergence).toBeDefined();
    } finally {
      mutable.neutralizeThreshold = threshold;
    }
  });

  it("reports an action a rules change has made illegal", () => {
    // Drift can stop a replay outright rather than merely change it: seal a
    // move that was legal, then shorten the gait it was made at.
    const g = new Game({ seed: 1 });
    const u = g.addUnit(makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 8));
    g.beginTurn();
    g.advanceToPhase("movement");
    g.moveUnit(u.id, { x: 0, y: 95 }, "run");
    const sealed = sealRecording(g.toRecording());

    const profile = MOVEMENT_PROFILES.run as { maxDistance: number };
    const original = profile.maxDistance;
    try {
      profile.maxDistance = 50; // the recorded bound no longer fits
      const result = verifyRecording(sealed);
      expect(result.ok).toBe(false);
      expect(result.firstDivergence?.actual).toMatch(/rejected: .*exceeds/);
      expect(result.firstDivergence?.action.kind).toBe("moveUnit");
    } finally {
      profile.maxDistance = original;
    }
  });

  it("survives a JSON round trip with its fingerprints intact", () => {
    const rec = sealRecording(playDemo().toRecording());
    const back = JSON.parse(JSON.stringify(rec)) as GameRecording;
    expect(verifyRecording(back)).toEqual({ checked: true, ok: true });
  });

  it("refuses a recording from an unknown format version", () => {
    const bad = { version: 99, seed: 1, sides: [], enforceC2: true, actions: [] };
    expect(() => replayGame(bad as unknown as GameRecording)).toThrow(/version/);
  });
});

/**
 * A hotseat battle is fought almost entirely through orders — the player names
 * an objective and a task, and the engine drives every bound and every shot.
 * None of those moves are journalled (they are derived), so a recording is only
 * as good as the two order actions replaying identically.
 */
describe("a battle fought under orders", () => {
  function playOrdered(seed = 11): Game {
    const g = new Game({ seed });
    const squad = g.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", { x: 0, y: 300 }, 8));
    g.addUnit(makeCommandGroup("BLUE-HQ", "BLUE", "platoon", { x: 0, y: 320 }, 3));
    const red = g.addUnit(makeInfantry("RED-1", "RED", "squad", { x: 0, y: 60 }, 6));

    g.beginTurn();
    g.advanceToPhase("movement");
    // Close on the enemy and engage it there: one order, carried out every turn.
    g.setStandingOrder(squad.id, {
      gait: "run",
      destination: { x: 0, y: 120 },
      engage: { targetId: red.id, weapon: "smallArms" },
    });
    g.executeStandingOrders("BLUE");
    g.advanceToPhase("combat");
    g.executeStandingOrders("BLUE");

    for (let turn = 0; turn < 3; turn++) {
      g.advanceToPhase("initiative");
      g.advanceToPhase("movement");
      g.executeStandingOrders("BLUE");
      g.advanceToPhase("combat");
      g.executeStandingOrders("BLUE");
    }
    g.advanceToPhase("summary");
    return g;
  }

  it("replays to the same state, though not one move was recorded", () => {
    const played = playOrdered();
    const rec = played.toRecording();
    expect(rec.actions.some((a) => a.kind === "moveUnit")).toBe(false);
    expect(played.getUnit("BLUE-1").position.y).toBeLessThan(300); // it did march

    expect(stateOf(replayGame(rec))).toEqual(stateOf(played));
  });

  it("hands the debrief each force's bound back out of the replay", () => {
    const rec = playOrdered().toRecording();
    const { steps } = replayWithOutcomes(rec);
    const executions = steps.flatMap((s) =>
      s.outcome.kind === "executeStandingOrders" ? s.outcome.executions : [],
    );
    expect(executions.some((e) => e.moved)).toBe(true);
    expect(executions.some((e) => e.moved?.arrived)).toBe(true);
    expect(executions.some((e) => e.engaged?.targetId === "RED-1")).toBe(true);
  });

  it("keeps the order itself in the log, so the debrief can name the objective", () => {
    const rec = playOrdered().toRecording();
    const order = rec.actions.find((a) => a.kind === "setStandingOrder");
    expect(order?.kind).toBe("setStandingOrder");
    if (order?.kind !== "setStandingOrder") throw new Error("expected an order");
    expect(order.order.destination).toEqual({ x: 0, y: 120 });
    expect(order.order.engage?.targetId).toBe("RED-1");
  });

  it("seals and verifies like any other recording", () => {
    expect(verifyRecording(sealRecording(playOrdered().toRecording()))).toEqual({
      checked: true,
      ok: true,
    });
  });
});

describe("re-fighting the same decisions", () => {
  it("produces a different battle under a different seed", () => {
    const rec = playDemo(2026).toRecording();
    const asFought = replayGame(rec);
    const reRolled = replayGame(rec, { seed: 999, skipRejected: true });

    // Same decisions, different dice: the state must differ somewhere.
    expect(stateOf(reRolled)).not.toEqual(stateOf(asFought));
    // …and re-rolling is itself reproducible.
    expect(stateOf(replayGame(rec, { seed: 999, skipRejected: true }))).toEqual(
      stateOf(reRolled),
    );
  });

  it("still replays the recording's own battle when no seed is given", () => {
    const played = playDemo();
    expect(stateOf(replayGame(played.toRecording()))).toEqual(stateOf(played));
  });

  it("stops on a decision it cannot carry out, unless told to skip", () => {
    // A bound that no longer fits the budget is exactly what an alternate
    // history produces: a force slowed by fire cannot make the move it made.
    const g = new Game({ seed: 1 });
    const unit = g.addUnit(makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 8));
    g.beginTurn();
    g.advanceToPhase("movement");
    g.moveUnit(unit.id, { x: 0, y: 40 }, "normal");
    const rec = g.toRecording();
    // Rewrite the bound into one the rules will refuse.
    const move = rec.actions.find((a) => a.kind === "moveUnit");
    if (move?.kind !== "moveUnit") throw new Error("expected a move");
    move.to = { x: 0, y: 500 };

    expect(() => replayGame(rec)).toThrow(/exceeds/);

    const { game, skipped, steps } = replayWithOutcomes(rec, { skipRejected: true });
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.reason).toMatch(/exceeds/);
    expect(skipped[0]!.action.kind).toBe("moveUnit");
    // The rest of the battle still ran, and the force stayed where it was.
    expect(steps).toHaveLength(rec.actions.length - 1);
    expect(game.getUnit("A").position).toEqual({ x: 0, y: 0 });
  });
});
