import { describe, it, expect } from "vitest";
import { Game } from "./game.js";
import { replayGame } from "./recording.js";
import { digInCover, endTurnUnitUpkeep } from "./upkeep.js";
import { makeInfantry } from "./units.js";
import { CAMOUFLAGE, CAMOUFLAGE_TURNS_AT_MAX, OBSERVATION } from "./data/concealment.js";
import { camouflageBonus, detectionChance } from "./combat/detection.js";
import { MOVEMENT_PROFILES } from "./data/movement.js";

/** Put a force through `turns` end-of-turn upkeeps, moving it or not. */
function holdPosition(unit: ReturnType<typeof makeInfantry>, turns: number, metres = 0) {
  for (let t = 0; t < turns; t++) {
    unit.movedThisTurn = metres;
    endTurnUnitUpkeep([unit]);
  }
}

describe("digging in", () => {
  it("starts only after the third turn in place, then a level every two", () => {
    // Author's ruling: nothing for 3 turns, then improvement every 2 turns up
    // to the protection of a force that was behind cover to begin with.
    expect(digInCover(0)).toBe("none");
    expect(digInCover(3)).toBe("none");
    expect(digInCover(4)).toBe("none");
    expect(digInCover(5)).toBe("partial");
    expect(digInCover(6)).toBe("partial");
    expect(digInCover(7)).toBe("full");
    expect(digInCover(40)).toBe("full"); // it stops at "behind cover"
  });

  it("digs a force in over the turns it stays put", () => {
    const unit = makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 8);
    holdPosition(unit, 4);
    expect(unit.cover).toBe("none");
    holdPosition(unit, 1);
    expect(unit.cover).toBe("partial");
    holdPosition(unit, 2);
    expect(unit.cover).toBe("full");
  });

  it("leaves the hole behind when the force moves", () => {
    const unit = makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 8);
    holdPosition(unit, 7);
    expect(unit.cover).toBe("full");

    holdPosition(unit, 1, 50); // up and moving
    expect(unit.stationaryTurns).toBe(0);
    expect(unit.cover).toBe("none");
  });

  it("never digs below the cover the ground already gave it", () => {
    const unit = makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 8);
    unit.baseCover = "partial"; // a prepared position
    holdPosition(unit, 1);
    expect(unit.cover).toBe("partial");
    holdPosition(unit, 6);
    expect(unit.cover).toBe("full");

    // …and moving falls back to the ground, not to nothing.
    holdPosition(unit, 1, 40);
    expect(unit.cover).toBe("partial");
  });
});

describe("camouflage", () => {
  it("builds up a step every two turns, to a cap", () => {
    const unit = makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 8);
    unit.camouflaging = true;
    holdPosition(unit, 1);
    expect(camouflageBonus(unit)).toBe(0);
    holdPosition(unit, 1);
    expect(camouflageBonus(unit)).toBeCloseTo(CAMOUFLAGE.perStep, 5);

    holdPosition(unit, 50);
    expect(camouflageBonus(unit)).toBeCloseTo(CAMOUFLAGE.max, 5);
  });

  it("is thrown away by moving — a moving force cannot be camouflaged", () => {
    const unit = makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 8);
    unit.camouflaging = true;
    holdPosition(unit, 6);
    expect(camouflageBonus(unit)).toBeGreaterThan(0);

    holdPosition(unit, 1, 30);
    expect(unit.camouflaging).toBe(false);
    expect(camouflageBonus(unit)).toBe(0);
  });

  it("can be given to a force that prepared its position before the battle", () => {
    const unit = makeInfantry("A", "RED", "squad", { x: 0, y: 0 }, 8);
    unit.camouflaging = true;
    unit.camouflageTurns = CAMOUFLAGE_TURNS_AT_MAX;
    expect(camouflageBonus(unit)).toBeCloseTo(CAMOUFLAGE.max, 5);
  });

  it("is dropped, work and all, when the force is told to stop", () => {
    const g = new Game({ seed: 1 });
    const unit = g.addUnit(makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 8));
    g.setCamouflage(unit.id, true);
    holdPosition(unit, 4);
    expect(camouflageBonus(unit)).toBeGreaterThan(0);

    g.setCamouflage(unit.id, false);
    expect(unit.camouflageTurns).toBe(0);
    expect(camouflageBonus(unit)).toBe(0);
  });
});

describe("a prepared ambush", () => {
  /** The defender the rules are for: dug in, camouflaged, holding still. */
  function ambusher() {
    const unit = makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 6);
    unit.cover = "full";
    unit.camouflaging = true;
    unit.camouflageTurns = CAMOUFLAGE_TURNS_AT_MAX;
    return unit;
  }

  it("is looked for at 20 m, and never more easily than a buried charge", () => {
    const mover = makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 8);
    mover.movedThisTurn = 40;
    const { chance, range } = detectionChance(mover, ambusher(), "normal");
    // 30% in the hidden band, less full cover and a full camouflage, would be
    // nothing at all. The floor is the chance of finding a concealed charge.
    expect(range).toBe(20);
    expect(chance).toBeCloseTo(MOVEMENT_PROFILES.normal.hiddenDetectChance, 5);

    // …and a force that runs past it has the running figure, not the walking one.
    const runner = makeInfantry("C", "BLUE", "squad", { x: 0, y: 0 }, 8);
    runner.movedThisTurn = 90;
    expect(detectionChance(runner, ambusher(), "run").chance).toBeCloseTo(
      MOVEMENT_PROFILES.run.hiddenDetectChance,
      5,
    );
  });

  it("gives a scout a real edge over a force just walking past", () => {
    const walker = makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 8);
    walker.movedThisTurn = 40;
    const scout = makeInfantry("S", "BLUE", "squad", { x: 0, y: 0 }, 8);
    scout.movedThisTurn = 40;
    scout.scouting = true;

    // Against an ordinary hidden force the scout looks harder…
    const hiding = makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 6);
    expect(detectionChance(walker, hiding, "normal").chance).toBeCloseTo(0.3, 5);
    expect(detectionChance(scout, hiding, "normal").chance).toBeCloseTo(0.4, 5);

    // …though against a fully camouflaged one the floor is what it gets.
    expect(detectionChance(scout, ambusher(), "normal").chance).toBeCloseTo(0.3, 5);
  });

  it("still sees the attacker walk in, and better for standing still", () => {
    const attacker = makeInfantry("B", "BLUE", "squad", { x: 0, y: 100 }, 8);
    attacker.movedThisTurn = 90;
    attacker.ranThisTurn = true;
    const { chance, range } = detectionChance(ambusher(), attacker);
    expect(range).toBe(300);
    // 70% visible + 10% for watching + 10% because the attacker ran.
    expect(chance).toBeCloseTo(0.9, 5);
  });
});

describe("cover as the shot sees it", () => {
  it("counts a force that fired from full cover as partly exposed", () => {
    const g = new Game({ seed: 1 });
    const unit = g.addUnit(makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 8));
    unit.cover = "full";
    expect(g.coverAgainst(unit)).toBe("full");
    unit.firedThisTurn = true;
    expect(g.coverAgainst(unit)).toBe("partial");
  });
});

describe("contacts that go cold", () => {
  it("drops a report nobody has refreshed for three turns", () => {
    const g = new Game({ seed: 6, trackIntel: true, enforceC2: false });
    const blue = g.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", { x: 0, y: 250 }, 8));
    g.addUnit(makeInfantry("RED-1", "RED", "squad", { x: 0, y: 0 }, 6));
    g.beginTurn();
    g.advanceToPhase("movement");
    g.moveUnit(blue.id, { x: 0, y: 210 }, "normal");
    g.advanceToPhase("combat");
    expect(g.knows("RED", blue.id)).toBe(true);

    // BLUE goes to ground far away; RED never sees it again.
    blue.position = { x: 900, y: 900 };
    for (let t = 0; t < OBSERVATION.contactExpiryTurns; t++) {
      g.advanceToPhase("initiative");
      g.advanceToPhase("combat");
    }
    // Turn 4: seen on turn 1, and the mark has stood through 2 and 3.
    expect(g.turn).toBe(1 + OBSERVATION.contactExpiryTurns);
    expect(g.knows("RED", blue.id)).toBe(true);

    // The third turn without a report closes at this turn's upkeep.
    g.advanceToPhase("initiative");
    expect(g.knows("RED", blue.id)).toBe(false);
  });
});

describe("scouting", () => {
  /** A squad with room to run, and an order it will not be able to obey. */
  function scout(seed = 2) {
    const g = new Game({ seed, enforceC2: false, trackIntel: true });
    const unit = g.addUnit(makeInfantry("S", "BLUE", "squad", { x: 0, y: 0 }, 8));
    g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 15 }, 6));
    g.beginTurn();
    g.advanceToPhase("movement");
    return { g, unit };
  }

  it("walks, whatever gait the move asked for", () => {
    const { g, unit } = scout();
    g.setScouting(unit.id, true);
    expect(g.gaitFor(unit, "run")).toBe("normal");

    // A run of 90 m is refused at the walking budget…
    expect(() => g.moveUnit(unit.id, { x: 0, y: 90 }, "run")).toThrow(/normal budget/);
    // …and the same order at 40 m goes through as a walk.
    g.moveUnit(unit.id, { x: 0, y: 40 }, "run");
    expect(unit.ranThisTurn).toBe(false);
    expect(unit.movedThisTurn).toBeCloseTo(40, 5);
  });

  it("keeps a standing order to run inside the walking budget", () => {
    const { g, unit } = scout();
    g.setScouting(unit.id, true);
    g.setStandingOrder(unit.id, { gait: "run", destination: { x: 0, y: 400 } });
    g.executeStandingOrders("BLUE");
    // The order still says "run"; the force is out scouting, so it walked.
    expect(g.standingOrderFor(unit.id)?.gait).toBe("run");
    expect(unit.position.y).toBeCloseTo(MOVEMENT_PROFILES.normal.maxDistance, 5);
  });

  it("runs again the moment it is called in", () => {
    const { g, unit } = scout();
    g.setScouting(unit.id, true);
    g.setScouting(unit.id, false);
    g.moveUnit(unit.id, { x: 0, y: 90 }, "run");
    expect(unit.ranThisTurn).toBe(true);
  });

  it("replays out of a recording as the posture it was", () => {
    const { g, unit } = scout();
    g.setScouting(unit.id, true);
    g.moveUnit(unit.id, { x: 0, y: 40 }, "run");
    const replayed = replayGame(g.toRecording());
    expect(replayed.getUnit(unit.id).scouting).toBe(true);
    expect(replayed.getUnit(unit.id).position.y).toBeCloseTo(40, 5);
    expect(replayed.rng.getState()).toBe(g.rng.getState());
  });
});
