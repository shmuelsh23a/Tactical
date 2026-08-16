import { describe, it, expect } from "vitest";
import { Game } from "./game.js";
import { replayGame } from "./recording.js";
import { digInCover, endTurnUnitUpkeep } from "./upkeep.js";
import { makeInfantry } from "./units.js";
import {
  CAMOUFLAGE,
  CAMOUFLAGE_TURNS_AT_MAX,
  OBSERVATION,
  OBSERVATION_SECTOR,
  sectorBonus,
} from "./data/concealment.js";
import { camouflageBonus, detectionChance, sectorFocus } from "./combat/detection.js";
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

    // …and it keeps that edge against a fully camouflaged one: the floor is
    // the concealed-charge chance, and a scout beats it by what scouting is
    // worth (author, 2026-08-13).
    expect(detectionChance(walker, ambusher(), "normal").chance).toBeCloseTo(0.3, 5);
    expect(detectionChance(scout, ambusher(), "normal").chance).toBeCloseTo(0.4, 5);
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

describe("searching the ground crossed for a hidden enemy", () => {
  /**
   * Rules decision 10 (author, 2026-08-16). The document names charges, shafts
   * and hidden enemy in one clause — 30% within 20 m — so the sweep covers all
   * three. It matters because the hidden band is 20 m against a 50–100 m bound:
   * searched from the endpoint alone, a force could walk within 15 m of a
   * prepared position and never roll for it (measured 0/400 before this).
   */
  function walkPast(offsetY: number, gait: "normal" | "run", camouflaged = false) {
    let found = 0;
    const n = 400;
    for (let s = 0; s < n; s++) {
      const g = new Game({ seed: s, enforceC2: false, trackIntel: true });
      const blue = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 8));
      const red = makeInfantry("R", "RED", "squad", { x: 15, y: offsetY }, 6);
      if (camouflaged) {
        red.cover = "full";
        red.camouflaging = true;
        red.camouflageTurns = CAMOUFLAGE_TURNS_AT_MAX;
      }
      g.addUnit(red);
      g.beginTurn();
      g.advanceToPhase("movement");
      // RED never moves, so it is hidden — looked for in the 20 m band.
      const to = { x: 0, y: gait === "run" ? 100 : 50 };
      if (g.moveUnit(blue.id, to, gait).detection.spottedUnitIds.length) found++;
    }
    return found / n;
  }

  it("finds a force lying up beside the route, not only beside the halt", () => {
    // 15 m off the midpoint of a 50 m walk: the case that used to be 0.
    expect(walkPast(25, "normal")).toBeGreaterThan(0.15);
  });

  it("gives a running force no look at the ground it crossed", () => {
    expect(walkPast(25, "run")).toBe(0);
  });

  it("does not let the sweep beat a camouflaged position outright", () => {
    // Camouflage still holds the chance down to the concealed-charge floor
    // (decision 12) — the sweep says *where* a force looks, not how well.
    const plain = walkPast(25, "normal");
    const camo = walkPast(25, "normal", true);
    expect(camo).toBeGreaterThan(0);
    expect(camo).toBeLessThanOrEqual(plain);
  });

  it("still leaves an ambush its edge — the defender sees first", () => {
    // The sweep must not undo decision 12: a stationary defender observes
    // continuously at 300 m, so it picks the attacker up several bounds before
    // the attacker is close enough to sweep it at 20 m.
    const g = new Game({ seed: 3, enforceC2: false, trackIntel: true });
    const blue = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 250 }, 8));
    g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 6));
    g.beginTurn();
    g.advanceToPhase("movement");
    g.moveUnit(blue.id, { x: 0, y: 210 }, "normal");
    g.advanceToPhase("combat");
    expect(g.knows("RED", blue.id)).toBe(true); // the defender has its contact
    expect(g.knows("BLUE", "R")).toBe(false); // the attacker still has nothing
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

describe("a sector of observation", () => {
  /**
   * A watcher in position and a force to the east of it, well inside 300 m.
   * The watcher is *stationary and camouflaged-free*, so its all-round chance
   * (0.7 + 0.1) leaves headroom under the `Math.min(1, …)` clamp for the
   * sector bonus to show up as arithmetic rather than as a ceiling.
   */
  function watcherAndTarget() {
    const watcher = makeInfantry("W", "BLUE", "squad", { x: 0, y: 0 }, 8);
    const east = makeInfantry("E", "RED", "squad", { x: 200, y: 0 }, 6);
    east.movedThisTurn = 40; // visible: the 300 m band
    return { watcher, east };
  }

  it("cuts both ways — better where it looks, worse where it does not", () => {
    const { watcher, east } = watcherAndTarget();
    const allRound = detectionChance(watcher, east).chance;
    const width = OBSERVATION_SECTOR.defaultWidth;
    expect(allRound + sectorBonus(width)).toBeLessThan(1); // not measuring the clamp

    // Told to watch east, where the enemy actually is.
    watcher.observationSector = { bearing: 0, width };
    expect(detectionChance(watcher, east).chance).toBeCloseTo(allRound + sectorBonus(width), 5);

    // Told to watch west, and the enemy comes from behind.
    watcher.observationSector = { bearing: 180, width };
    expect(detectionChance(watcher, east).chance).toBeCloseTo(
      allRound - OBSERVATION_SECTOR.outsidePenalty,
      5,
    );
  });

  it("pays a narrow arc more than a wide one — the same attention over less ground", () => {
    // The whole point of the width control: without this, widening is free and
    // the widest sector dominates every narrower one (author, 2026-08-16).
    const { watcher, east } = watcherAndTarget();
    const worth = (width: number) => {
      watcher.observationSector = { bearing: 0, width };
      return detectionChance(watcher, east).chance;
    };
    expect(worth(60)).toBeGreaterThan(worth(90));
    expect(worth(90)).toBeGreaterThan(worth(180));

    // …at the document-free figures the author settled on: 13.5 %·degrees.
    expect(sectorBonus(60)).toBeCloseTo(0.225, 5);
    expect(sectorBonus(90)).toBeCloseTo(0.15, 5);
    expect(sectorBonus(180)).toBeCloseTo(0.075, 5);
  });

  it("gives nothing for watching the whole compass — that is not a sector", () => {
    // Otherwise a 360° arc collects the bonus everywhere with no ground left
    // outside it to pay the penalty: a free bonus, and no decision.
    const { watcher, east } = watcherAndTarget();
    const allRound = detectionChance(watcher, east).chance;
    watcher.observationSector = { bearing: 0, width: 360 };
    expect(sectorBonus(360)).toBe(0);
    expect(detectionChance(watcher, east).chance).toBeCloseTo(allRound, 5);
  });

  it("caps what an arbitrarily thin arc can be worth", () => {
    expect(sectorBonus(1)).toBe(OBSERVATION_SECTOR.maxBonus);
    expect(sectorBonus(10)).toBe(OBSERVATION_SECTOR.maxBonus);
  });

  it("leaves a force with no sector exactly as it was", () => {
    const { watcher, east } = watcherAndTarget();
    const before = detectionChance(watcher, east).chance;
    expect(sectorFocus(watcher, east.position)).toBe(0);
    expect(detectionChance(watcher, east).chance).toBeCloseTo(before, 5);
  });

  it("narrows the arc a force is watching, not the ground it can see", () => {
    const { watcher, east } = watcherAndTarget();
    // The band is the document's; a sector never changes how far a force sees.
    watcher.observationSector = { bearing: 180, width: 60 };
    expect(detectionChance(watcher, east).range).toBe(300);
  });

  it("is an absolute bearing, so displacing does not re-aim it", () => {
    const g = new Game({ seed: 1, enforceC2: false });
    const unit = g.addUnit(makeInfantry("W", "BLUE", "squad", { x: 300, y: 300 }, 8));
    g.watchTowards(unit.id, { x: 400, y: 300 }); // east
    expect(unit.observationSector?.bearing).toBeCloseTo(0, 5);

    // The force displaces north-west under its own steam — not by having its
    // position written behind the game's back, which is what desyncs a
    // recording from the live game.
    g.beginTurn();
    g.advanceToPhase("movement");
    g.moveUnit(unit.id, { x: 270, y: 270 }, "normal");
    expect(unit.observationSector?.bearing).toBeCloseTo(0, 5);
    expect(unit.observationSector?.width).toBe(OBSERVATION_SECTOR.defaultWidth);
  });

  it("keeps the width it was given when it is only re-pointed", () => {
    const g = new Game({ seed: 1 });
    const unit = g.addUnit(makeInfantry("W", "BLUE", "squad", { x: 0, y: 0 }, 8));
    g.watchTowards(unit.id, { x: 100, y: 0 }, 60);
    g.watchTowards(unit.id, { x: 0, y: 100 });
    expect(unit.observationSector).toEqual({ bearing: 90, width: 60 });
  });

  it("raises the camouflage floor for a force looking the right way", () => {
    // The concealed-charge floor is the observer's, so watching the right
    // sector beats it, the same way scouting does (rules decision 14).
    const ambusher = makeInfantry("R", "RED", "squad", { x: 200, y: 0 }, 6);
    ambusher.cover = "full";
    ambusher.camouflaging = true;
    ambusher.camouflageTurns = CAMOUFLAGE_TURNS_AT_MAX;

    const facing = makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 8);
    facing.observationSector = { bearing: 0, width: 90 };

    const floor = MOVEMENT_PROFILES.normal.hiddenDetectChance;
    expect(detectionChance(facing, ambusher).chance).toBeCloseTo(floor + sectorBonus(90), 5);
  });

  it("never lets a sector make a camouflaged force impossible to find", () => {
    // The floor is what camouflage cannot take away, and where a force is
    // looking is not camouflage's doing. Letting the penalty through here would
    // put a *running* observer's floor (5%) at a flat zero — the one thing the
    // camouflage rule says outright cannot happen (decision 12).
    const ambusher = makeInfantry("R", "RED", "squad", { x: 200, y: 0 }, 6);
    ambusher.cover = "full";
    ambusher.camouflaging = true;
    ambusher.camouflageTurns = CAMOUFLAGE_TURNS_AT_MAX;

    for (const gait of ["normal", "run"] as const) {
      const away = makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 8);
      away.observationSector = { bearing: 180, width: 90 };
      away.movedThisTurn = 40;
      const { chance } = detectionChance(away, ambusher, gait);
      expect(chance).toBeCloseTo(MOVEMENT_PROFILES[gait].hiddenDetectChance, 5);
      expect(chance).toBeGreaterThan(0);
    }
  });

  it("replays out of a recording, and releasing it clears the arc", () => {
    const g = new Game({ seed: 3, enforceC2: false, trackIntel: true });
    const unit = g.addUnit(makeInfantry("W", "BLUE", "squad", { x: 0, y: 0 }, 8));
    g.addUnit(makeInfantry("R", "RED", "squad", { x: 200, y: 0 }, 6));
    g.beginTurn();
    g.setObservationSector(unit.id, { bearing: 0, width: 60 });

    const replayed = replayGame(g.toRecording());
    expect(replayed.getUnit(unit.id).observationSector).toEqual({ bearing: 0, width: 60 });
    expect(replayed.rng.getState()).toBe(g.rng.getState());

    g.setObservationSector(unit.id, null);
    expect(g.getUnit(unit.id).observationSector).toBeUndefined();
    expect(replayGame(g.toRecording()).getUnit(unit.id).observationSector).toBeUndefined();
  });

  it("normalises what it is given, and records what it adopted", () => {
    const g = new Game({ seed: 1 });
    const unit = g.addUnit(makeInfantry("W", "BLUE", "squad", { x: 0, y: 0 }, 8));
    g.setObservationSector(unit.id, { bearing: -90, width: 400 });
    // A full circle is not a sector, so the width stops just short of one.
    expect(unit.observationSector).toEqual({ bearing: 270, width: 359 });

    // The journal must hold the decision the engine took. A recording that said
    // "400°" would have the debrief narrate an arc nobody ever watched.
    const recorded = g.toRecording().actions.find((a) => a.kind === "setObservationSector");
    expect(recorded).toMatchObject({ sector: { bearing: 270, width: 359 } });
  });

  it("decides which flank a watching force picks the enemy up on", () => {
    // Same battle, same seed, same everything but where the squad was told to
    // look — and the enemy walks in from the east.
    // Seed 11 is chosen: the watcher's observation roll lands between the two
    // chances this test is comparing — 0.95 watching east, 0.60 watching west —
    // so the sector, and nothing else, decides the outcome. A future change to
    // the rng or to the order of draws will move it, and that is a seed to
    // re-pick rather than a rule that regressed.
    function battle(bearing: number) {
      const g = new Game({ seed: 11, enforceC2: false, trackIntel: true });
      const watcher = g.addUnit(makeInfantry("W", "BLUE", "squad", { x: 0, y: 0 }, 8));
      g.addUnit(makeInfantry("R", "RED", "squad", { x: 250, y: 0 }, 6));
      g.setObservationSector(watcher.id, { bearing, width: 90 });
      g.beginTurn();
      // The RED squad shuffles in place, so it is visible rather than hidden.
      g.advanceToPhase("movement");
      g.moveUnit("R", { x: 240, y: 0 }, "normal");
      g.advanceToPhase("combat");
      return g.knows("BLUE", "R");
    }
    expect(battle(0)).toBe(true); // watching east — sees it
    expect(battle(180)).toBe(false); // watching west — misses it
  });
});
