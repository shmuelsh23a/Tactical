import { describe, it, expect } from "vitest";
import { Game, type GameOptions } from "./game.js";
import { makeCommandGroup, makeInfantry, makeVehicle } from "./units.js";
import { detectionChance } from "./combat/detection.js";
import { replayGame } from "./recording.js";
import { stateDigest } from "./digest.js";
import {
  MAX_REGISTERED_TARGETS_PER_WEAPON,
  OBSERVATION_POST_RANGE_M,
  PREPARED_POSITION_REACH_M,
} from "./data/planning.js";

// Rules decision 38: what a side prepares before the battle.

function setUp(opts: Partial<GameOptions> = {}) {
  const g = new Game({ seed: 3, enforceC2: false, ...opts });
  g.addUnit(makeCommandGroup("R-HQ", "RED", "company", { x: 0, y: -100 }, 3));
  g.addUnit(makeInfantry("R-1", "RED", "squad", { x: 0, y: 0 }, 8));
  g.addUnit(makeInfantry("R-2", "RED", "squad", { x: 80, y: 0 }, 8));
  g.addUnit(makeInfantry("B-1", "BLUE", "squad", { x: 0, y: 800 }, 8));
  return g;
}

/** Play the rest of the turn and start the next, at the movement phase. */
function toMovement(g: Game) {
  if (g.turn === 0) g.beginTurn();
  g.advanceToPhase("movement");
}

/** Close the turn — upkeep runs as the summary gives way — and open the next. */
function endTurn(g: Game) {
  g.advanceToPhase("summary");
  g.advanceToPhase("initiative");
}

describe("mission planning (decision 38)", () => {
  it("is done before the first turn and not after", () => {
    const g = setUp();
    expect(g.planning).toBe(true);
    g.registerTarget("RED", "mortar", { x: 0, y: 400 });
    g.beginTurn();
    expect(g.planning).toBe(false);
    expect(() => g.registerTarget("RED", "mortar", { x: 0, y: 500 })).toThrow(/mission planning/);
    expect(() => g.designateObservationPost("R-1")).toThrow(/mission planning/);
    expect(() => g.prepareAlternatePosition("R-1", { x: 0, y: -60 })).toThrow(/mission planning/);
  });

  describe("registered targets", () => {
    it("put the side's guns on the mark there, and nowhere near the enemy is told", () => {
      const g = setUp();
      g.registerTarget("RED", "mortar", { x: 0, y: 400 });
      expect(g.isOnTheMark("RED", "mortar", { x: 20, y: 420 })).toBe(true);
      expect(g.isOnTheMark("RED", "artillery", { x: 0, y: 400 })).toBe(false);
      expect(g.isOnTheMark("BLUE", "mortar", { x: 0, y: 400 })).toBe(false);
      expect(g.registeredTargets).toEqual([{ side: "RED", weapon: "mortar", at: { x: 0, y: 400 } }]);
    });

    it("only for a weapon the side may call, and only so many a weapon", () => {
      const g = setUp();
      expect(() => g.registerTarget("RED", "artillery", { x: 0, y: 400 })).toThrow(/battalion and above/);
      expect(() => g.registerTarget("BLUE", "mortar", { x: 0, y: 0 })).toThrow(/company and above/);
      expect(() => g.registerTarget("RED", "rifleGrenade", { x: 0, y: 0 })).toThrow(/indirect-fire/);
      for (let i = 0; i < MAX_REGISTERED_TARGETS_PER_WEAPON; i++) g.registerTarget("RED", "mortar", { x: i * 200, y: 400 });
      expect(() => g.registerTarget("RED", "mortar", { x: 0, y: 900 })).toThrow(/the most it may/);
    });
  });

  describe("observation posts", () => {
    it("see a force on the move out to the OP range, and a hidden one no further than anybody", () => {
      const g = setUp();
      g.designateObservationPost("R-1");
      const op = g.getUnit("R-1");
      const other = g.getUnit("R-2");
      const enemy = g.getUnit("B-1");
      enemy.movedThisTurn = 40;
      expect(detectionChance(op, enemy).range).toBe(OBSERVATION_POST_RANGE_M);
      expect(detectionChance(other, enemy).range).toBe(300);
      // On the move itself, it is not an OP's eye.
      expect(detectionChance(op, enemy, "normal").range).toBe(300);
      enemy.movedThisTurn = 0;
      expect(detectionChance(op, enemy).range).toBe(detectionChance(other, enemy).range);
    });

    it("picks up an attacker walking in at 700 m, where a squad in the line does not", () => {
      const seen = (op: boolean) => {
        const g = setUp({ trackIntel: true });
        if (op) g.designateObservationPost("R-1");
        toMovement(g);
        g.moveUnit("B-1", { x: 0, y: 760 }, "normal");
        g.advanceToPhase("combat");
        return g.contactFor("RED", "B-1") !== undefined;
      };
      expect(seen(false)).toBe(false);
      expect(seen(true)).toBe(true);
    });

    it("stops seeing as one the moment it fires or moves, before the turn is out", () => {
      const g = setUp();
      g.designateObservationPost("R-1");
      const op = g.getUnit("R-1");
      const enemy = g.getUnit("B-1");
      enemy.movedThisTurn = 40;
      expect(detectionChance(op, enemy).range).toBe(OBSERVATION_POST_RANGE_M);
      toMovement(g);
      g.advanceToPhase("combat");
      // A real shot, not a flag set by hand.
      g.addUnit(makeInfantry("B-2", "BLUE", "squad", { x: 0, y: 150 }, 8));
      g.fire("R-1", "B-2", { weapon: "smallArms" });
      expect(op.firedThisTurn).toBe(true);
      expect(detectionChance(op, enemy).range).toBe(300);
    });

    it("is put out in planning, not brought along by a force added with the flag set", () => {
      const g = setUp();
      const walkIn = makeInfantry("R-3", "RED", "squad", { x: 0, y: 50 }, 8);
      walkIn.observationPost = true;
      g.addUnit(walkIn);
      expect(g.getUnit("R-3").observationPost).toBeUndefined();
    });

    it("stops being one when it moves or fires, and is not a vehicle", () => {
      const g = setUp();
      g.designateObservationPost("R-1");
      g.designateObservationPost("R-2");
      toMovement(g);
      g.moveUnit("R-1", { x: 0, y: -20 }, "normal");
      g.getUnit("R-2").firedThisTurn = true;
      endTurn(g);
      expect(g.getUnit("R-1").observationPost).toBeUndefined();
      expect(g.getUnit("R-2").observationPost).toBeUndefined();
      const h = setUp();
      h.addUnit(makeVehicle("R-TANK", "RED", { x: 0, y: -50 }));
      expect(() => h.designateObservationPost("R-TANK")).toThrow(/vehicle/);
    });
  });

  describe("alternate positions", () => {
    it("give a force that moves into one the cover of the position it left", () => {
      const g = setUp();
      g.getUnit("R-1").baseCover = "full";
      const alt = g.prepareAlternatePosition("R-1", { x: 0, y: -40 });
      expect(alt).toEqual({ side: "RED", forUnitId: "R-1", at: { x: 0, y: -40 }, cover: "full" });
      expect(g.prepareAlternatePosition("R-2", { x: 80, y: -40 }).cover).toBe("partial");
      toMovement(g);
      g.moveUnit("R-1", { x: 0, y: -40 + PREPARED_POSITION_REACH_M - 1 }, "normal");
      endTurn(g);
      expect(g.getUnit("R-1").baseCover).toBe("full");
      expect(g.getUnit("R-1").cover).toBe("full");
    });

    it("hold for any force of the side, not for the enemy, and not beyond reach", () => {
      const g = setUp();
      g.prepareAlternatePosition("R-1", { x: 0, y: 760 });
      toMovement(g);
      g.moveUnit("B-1", { x: 0, y: 760 }, "normal");
      g.moveUnit("R-2", { x: 80, y: -40 }, "normal");
      endTurn(g);
      expect(g.getUnit("B-1").baseCover).toBe("none");
      expect(g.getUnit("R-2").baseCover).toBe("none");

      const h = setUp();
      h.prepareAlternatePosition("R-1", { x: 80, y: -40 });
      toMovement(h);
      h.moveUnit("R-2", { x: 80, y: -40 }, "normal");
      endTurn(h);
      expect(h.getUnit("R-2").baseCover).toBe("partial");
    });

    it("is elsewhere: not where the force already stands, and not cover for a vehicle", () => {
      const g = setUp();
      expect(() => g.prepareAlternatePosition("R-1", { x: 0, y: -PREPARED_POSITION_REACH_M })).toThrow(/more than/);
      g.prepareAlternatePosition("R-1", { x: 0, y: -60 });
      g.addUnit(makeVehicle("R-TANK", "RED", { x: 0, y: -60 }));
      toMovement(g);
      endTurn(g);
      expect(g.getUnit("R-TANK").baseCover).toBe("none");
    });

    it("one a force, and none for a vehicle", () => {
      const g = setUp();
      g.prepareAlternatePosition("R-1", { x: 0, y: -40 });
      expect(() => g.prepareAlternatePosition("R-1", { x: 0, y: -80 })).toThrow(/already has/);
      g.addUnit(makeVehicle("R-TANK", "RED", { x: 0, y: -50 }));
      expect(() => g.prepareAlternatePosition("R-TANK", { x: 0, y: -90 })).toThrow(/vehicle/);
      expect(g.alternatePositionFor("R-1")?.at).toEqual({ x: 0, y: -40 });
      expect(g.alternatePositionFor("R-2")).toBeUndefined();
    });
  });

  it("replays targets from the options and from planning alike, and re-records the same", () => {
    const g = setUp({ registeredTargets: [{ side: "RED", weapon: "mortar", at: { x: 500, y: 500 } }] });
    g.registerTarget("RED", "mortar", { x: 0, y: 400 });
    const recording = g.toRecording();
    expect(recording.registeredTargets).toHaveLength(1);
    const again = replayGame(recording);
    expect(again.registeredTargets).toEqual(g.registeredTargets);
    expect(again.marksHeld).toEqual(g.marksHeld);
    expect(again.toRecording()).toEqual(recording);
  });

  it("replays bit for bit, and a plan changes the fingerprint", () => {
    const g = setUp({ trackIntel: true });
    const bare = stateDigest(g);
    g.registerTarget("RED", "mortar", { x: 0, y: 400 });
    g.designateObservationPost("R-1");
    g.prepareAlternatePosition("R-2", { x: 80, y: -40 });
    expect(stateDigest(g)).not.toBe(bare);
    toMovement(g);
    g.moveUnit("B-1", { x: 0, y: 760 }, "normal");
    g.moveUnit("R-2", { x: 80, y: -40 }, "normal");
    endTurn(g);
    const again = replayGame(JSON.parse(JSON.stringify(g.toRecording())));
    expect(stateDigest(again)).toBe(stateDigest(g));
    expect(again.preparedPositions).toEqual(g.preparedPositions);
    expect(again.registeredTargets).toEqual(g.registeredTargets);
  });
});
