import { describe, it, expect } from "vitest";
import { Game, HOLDING_COVERING_FIRE } from "./game.js";
import { makeInfantry, makeVehicle } from "./units.js";
import { replayGame, sealRecording, verifyRecording } from "./recording.js";
import { FLAT_GROUND } from "./terrain.js";

/**
 * Covering fire (חיפוי) — rules decision 18. The document gives one line, *a
 * hit in the case of an action by the enemy: like fire*; the author gave the
 * four answers it does not (2026-09-16), and each of them is a test here.
 */

/** RED covering a lane BLUE is about to walk up, with the game in the fire phase. */
function covered(seed = 1, redAt = { x: 0, y: 0 }, blueAt = { x: 0, y: 200 }) {
  const g = new Game({ seed, enforceC2: false, terrain: FLAT_GROUND });
  const red = g.addUnit(makeInfantry("RED-1", "RED", "squad", redAt, 8));
  const blue = g.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", blueAt, 8));
  g.beginTurn();
  g.advanceToPhase("combat");
  return { g, red, blue };
}

/** Into the next turn's movement phase, where a bound can be walked. */
function toNextMovement(g: Game) {
  g.advanceToPhase("summary");
  g.advancePhase();
  g.advanceToPhase("movement");
}

describe("covering fire", () => {
  it("is declared in the fire phase and nowhere else", () => {
    const { g, red } = covered();
    g.advanceToPhase("summary");
    expect(() => g.setCovering(red.id, true)).toThrow(/phase/);
  });

  it("spends the force's action: it may take no attack of any kind", () => {
    // All three, in one test: the rule has as many halves as the engine has
    // ways to attack, and it is only true if every one of them says so.
    const { g, red, blue } = covered(1, { x: 0, y: 0 }, { x: 0, y: 20 });
    g.setCovering(red.id, true);
    expect(g.fire(red.id, blue.id, { weapon: "smallArms" }).reason).toBe(HOLDING_COVERING_FIRE);
    expect(g.assault(red.id, blue.id, 1).reason).toBe(HOLDING_COVERING_FIRE);
    expect(g.fireExplosive("rpgVsInfantry", red.id, blue.id).reason).toBe(HOLDING_COVERING_FIRE);
  });

  it("does not stand the force up: watching is not firing", () => {
    // `firedThisTurn` is read by two other rules — full cover drops to partial
    // for a force that fired (decision 7), and with it the force's eye height.
    // A force that is merely watching has done neither, and the action economy
    // must not borrow that flag to say so.
    const { g, red } = covered();
    g.getUnit(red.id).cover = "full";
    g.setCovering(red.id, true);
    expect(g.getUnit(red.id).firedThisTurn).toBe(false);
    expect(g.coverAgainst(g.getUnit(red.id))).toBe("full");
  });

  it("spends every turn it is held, not only the turn it was declared", () => {
    const { g, red, blue } = covered(1, { x: 0, y: 0 }, { x: 0, y: 20 });
    g.setCovering(red.id, true);
    toNextMovement(g);
    g.advanceToPhase("combat");
    // A new turn, the per-turn flags cleared — and still no attack, because
    // the force is still watching.
    expect(g.getUnit(red.id).firedThisTurn).toBe(false);
    expect(g.fire(red.id, blue.id, { weapon: "smallArms" }).reason).toBe(HOLDING_COVERING_FIRE);
  });

  it("is lost by moving: a force cannot carry it along", () => {
    const { g, red, blue } = covered(1, { x: 0, y: 0 }, { x: 0, y: 200 });
    g.setCovering(red.id, true);
    toNextMovement(g);
    g.moveUnit(red.id, { x: 0, y: 30 }, "normal");
    expect(g.getUnit(red.id).covering).toBeUndefined();
    expect(g.moveUnit(blue.id, { x: 0, y: 180 }, "normal").coveringFire).toEqual([]);
  });

  it("shoots at the ground the force was caught on, not the hole it left", () => {
    // Cover is read at the end of the turn (decision 12) because nothing used
    // to shoot mid-bound. A force that breaks out of a prepared position still
    // carries that position's cover in the field all turn, and a shot resolved
    // against it would be halved for ground the force has left.
    const { g, red, blue } = covered(1, { x: 0, y: 0 }, { x: 0, y: 200 });
    const runner = g.getUnit(blue.id);
    runner.baseCover = "full";
    runner.cover = "full";
    g.setCovering(red.id, true);
    toNextMovement(g);
    const shot = g.moveUnit(blue.id, { x: 0, y: 160 }, "normal").coveringFire[0]!;
    // Flat, empty ground: out in the open, whatever the field still says.
    expect(g.getUnit(blue.id).cover).toBe("full"); // untouched by the shot
    expect(shot.result.hitChance).toBeGreaterThan(0);
    const halved = shot.result.hitChance * 2;
    expect(halved).toBeGreaterThan(shot.result.hitChance);
  });

  it("makes the gait a real choice: a runner is harder to hit than a walker", () => {
    // MOVEMENT_PROFILES' enemyHitModifier had no consumer in the engine until
    // covering fire: this is the first mechanic that shoots at a force in the
    // middle of a bound, which is exactly what the number is written for.
    const walk = covered(1, { x: 0, y: 0 }, { x: 0, y: 200 });
    walk.g.setCovering(walk.red.id, true);
    toNextMovement(walk.g);
    const walking = walk.g.moveUnit(walk.blue.id, { x: 0, y: 170 }, "normal").coveringFire[0]!;

    const run = covered(1, { x: 0, y: 0 }, { x: 0, y: 200 });
    run.g.setCovering(run.red.id, true);
    toNextMovement(run.g);
    const running = run.g.moveUnit(run.blue.id, { x: 0, y: 170 }, "run").coveringFire[0]!;

    expect(running.result.hitChance).toBeLessThan(walking.result.hitChance);
  });

  it("interrupts a shot rather than replying to it", () => {
    // Proved by what the attacker has left when its own fire resolves: its
    // soldiers are one point from going down, so the covering volley takes
    // shooters off it. Answered afterwards, it would have fired at full
    // strength (author, 2026-09-16 — "interrupt the same way").
    const { g, red, blue } = covered(2, { x: 0, y: 0 }, { x: 0, y: 20 });
    for (const s of g.getUnit(blue.id).soldiers!) s.damagePoints = 7;
    g.setCovering(red.id, true);
    toNextMovement(g);
    g.advanceToPhase("combat");

    const shooting = g.fire(blue.id, red.id, { weapon: "smallArms" });
    expect(shooting.coveringFire[0]!.result.newCasualties).toBeGreaterThan(0);
    expect(shooting.shooters).toBeLessThan(8);
  });

  it("interrupts an assault the same way", () => {
    const { g, red, blue } = covered(2, { x: 0, y: 0 }, { x: 0, y: 20 });
    for (const s of g.getUnit(blue.id).soldiers!) s.damagePoints = 7;
    g.setCovering(red.id, true);
    toNextMovement(g);
    g.advanceToPhase("combat");

    const assault = g.assault(blue.id, red.id, 0);
    expect(assault.coveringFire[0]!.result.newCasualties).toBeGreaterThan(0);
    // The assault still goes in — interrupted, never cancelled — but with
    // fewer men than set out.
    expect(assault.fired).toBe(true);
  });

  describe("with the knowledge model on", () => {
    /** As `covered`, but the sides keep a picture of each other. */
    function watched(seed = 1, redAt = { x: 0, y: 0 }, blueAt = { x: 0, y: 200 }) {
      const g = new Game({ seed, enforceC2: false, trackIntel: true, terrain: FLAT_GROUND });
      const red = g.addUnit(makeInfantry("RED-1", "RED", "squad", redAt, 8));
      const blue = g.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", blueAt, 8));
      g.beginTurn();
      g.advanceToPhase("combat");
      return { g, red, blue };
    }

    it("does not answer an enemy its side has never seen", () => {
      // Author, 2026-09-16: only if detected. The same standard a standing
      // order is held to — the engine must not aim a force at something
      // nobody has seen.
      const { g, red, blue } = watched();
      expect(g.knows("RED", blue.id)).toBe(false);
      g.setCovering(red.id, true);
      toNextMovement(g);
      expect(g.moveUnit(blue.id, { x: 0, y: 180 }, "normal").coveringFire).toEqual([]);
      // Nothing was fired, so nothing was spent: it is still watching.
      expect(g.getUnit(red.id).covering).toBeDefined();
    });

    it("answers once its side has the enemy on its map", () => {
      const { g, red, blue } = watched();
      // A shot puts both forces on each other's map (decision 12).
      g.fire(red.id, blue.id, { weapon: "smallArms" });
      expect(g.knows("RED", blue.id)).toBe(true);
      toNextMovement(g);
      g.advanceToPhase("combat");
      g.setCovering(red.id, true);
      toNextMovement(g);
      expect(g.moveUnit(blue.id, { x: 0, y: 180 }, "normal").coveringFire).toHaveLength(1);
    });
  });

  it("is refused to a force that has already fired", () => {
    const { g, red, blue } = covered(1, { x: 0, y: 0 }, { x: 0, y: 100 });
    g.fire(red.id, blue.id, { weapon: "smallArms" });
    expect(() => g.setCovering(red.id, true)).toThrow(/already acted/);
  });

  it("answers an enemy bound, and the enemy carries on to where it was going", () => {
    // BLUE starts out of small-arms reach and walks into it.
    const { g, red, blue } = covered(1, { x: 0, y: 0 }, { x: 0, y: 420 });
    g.setCovering(red.id, true);
    toNextMovement(g);

    const to = { x: 0, y: 380 };
    const move = g.moveUnit(blue.id, to, "normal");
    expect(move.coveringFire).toHaveLength(1);
    const shot = move.coveringFire[0]!;
    expect(shot.coveringId).toBe("RED-1");
    expect(shot.trigger).toBe("move");
    expect(shot.result.fired).toBe(true);
    // The bound is interrupted, never cancelled (the author's third answer).
    expect(g.getUnit(blue.id).position).toEqual(to);
  });

  it("shoots at the first point of the bound it could reach, not at the end of it", () => {
    // 400 m is the small-arms limit, so the shot must be taken as BLUE crosses
    // it rather than 20 m later where the bound ends.
    const { g, red, blue } = covered(1, { x: 0, y: 0 }, { x: 0, y: 420 });
    g.setCovering(red.id, true);
    toNextMovement(g);
    const shot = g.moveUnit(blue.id, { x: 0, y: 380 }, "normal").coveringFire[0]!;
    expect(shot.at.y).toBeGreaterThan(380);
    expect(shot.at.y).toBeLessThanOrEqual(400);
    expect(shot.result.range).toBeCloseTo(shot.at.y, 5);
  });

  it("answers an enemy that fires, and one that assaults", () => {
    const { g, red, blue } = covered(1, { x: 0, y: 0 }, { x: 0, y: 20 });
    g.setCovering(red.id, true);
    toNextMovement(g);
    g.advanceToPhase("combat");

    const shooting = g.fire(blue.id, red.id, { weapon: "smallArms" });
    expect(shooting.coveringFire).toHaveLength(1);
    expect(shooting.coveringFire[0]!.trigger).toBe("fire");

    // A second coverer, for the assault half.
    const { g: g2, red: red2, blue: blue2 } = covered(1, { x: 0, y: 0 }, { x: 0, y: 20 });
    g2.setCovering(red2.id, true);
    toNextMovement(g2);
    g2.advanceToPhase("combat");
    const assault = g2.assault(blue2.id, red2.id, 0);
    expect(assault.coveringFire).toHaveLength(1);
    expect(assault.coveringFire[0]!.trigger).toBe("assault");
  });

  it("is consumed by firing: it answers once and must be declared again", () => {
    // Seed 2 because the half-pace step below needs the volley to *land* (a
    // miss leaves the bound at full pace); seed 1 stopped landing when the
    // walking modifier became ×1.3 rather than +30% (decision 22).
    const { g, red, blue } = covered(2, { x: 0, y: 0 }, { x: 0, y: 200 });
    g.setCovering(red.id, true);
    toNextMovement(g);
    // A short first bound: being shot at halves what is left of the move
    // (the under-fire rule), so the second one has to fit inside 25 m.
    expect(g.moveUnit(blue.id, { x: 0, y: 190 }, "normal").coveringFire).toHaveLength(1);
    expect(g.getUnit(red.id).covering).toBeUndefined();
    expect(g.getUnit(blue.id).underFire).toBe(true);
    // The rest of the same bound draws nothing: the posture answered once.
    expect(g.moveUnit(blue.id, { x: 0, y: 180 }, "normal").coveringFire).toEqual([]);
  });

  it("does not spend a second coverer on answering the first one's shot", () => {
    const g = new Game({ seed: 1, enforceC2: false, terrain: FLAT_GROUND });
    const red = g.addUnit(makeInfantry("RED-1", "RED", "squad", { x: 0, y: 0 }, 8));
    const blueCoverer = g.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", { x: 0, y: 100 }, 8));
    const blueMover = g.addUnit(makeInfantry("BLUE-2", "BLUE", "squad", { x: 60, y: 100 }, 8));
    g.beginTurn();
    g.advanceToPhase("combat");
    g.setCovering(red.id, true);
    g.setCovering(blueCoverer.id, true);
    toNextMovement(g);

    // RED answers BLUE-2's bound; BLUE-1 must not then answer RED's answer.
    const move = g.moveUnit(blueMover.id, { x: 60, y: 60 }, "normal");
    expect(move.coveringFire).toHaveLength(1);
    expect(move.coveringFire[0]!.coveringId).toBe("RED-1");
    expect(g.getUnit(blueCoverer.id).covering).toBeDefined(); // still watching
  });

  it("does not answer its own side", () => {
    const g = new Game({ seed: 1, enforceC2: false, terrain: FLAT_GROUND });
    const red = g.addUnit(makeInfantry("RED-1", "RED", "squad", { x: 0, y: 0 }, 8));
    const friend = g.addUnit(makeInfantry("RED-2", "RED", "squad", { x: 0, y: 100 }, 8));
    g.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", { x: 500, y: 500 }, 8));
    g.beginTurn();
    g.advanceToPhase("combat");
    g.setCovering(red.id, true);
    toNextMovement(g);
    expect(g.moveUnit(friend.id, { x: 0, y: 60 }, "normal").coveringFire).toEqual([]);
  });

  it("holds its fire when its orders say to", () => {
    // Decision 6: hold-fire is enforced even against the player's own click,
    // so a posture must not be a way around it.
    const { g, red, blue } = covered(1, { x: 0, y: 0 }, { x: 0, y: 200 });
    g.setStandingOrder(red.id, { gait: "normal", holdFire: true });
    g.setCovering(red.id, true);
    toNextMovement(g);
    expect(g.moveUnit(blue.id, { x: 0, y: 180 }, "normal").coveringFire).toEqual([]);
    expect(g.getUnit(red.id).covering).toBeDefined(); // not spent, either
  });

  it("stays silent when it cannot see the mover", () => {
    const { g, red, blue } = covered(1, { x: 0, y: 0 }, { x: 0, y: 900 });
    g.setCovering(red.id, true);
    toNextMovement(g);
    // 900 m away and walking further: never inside small-arms reach.
    expect(g.moveUnit(blue.id, { x: 0, y: 950 }, "normal").coveringFire).toEqual([]);
    expect(g.getUnit(red.id).covering).toBeDefined();
  });

  it("cannot be declared by a force with nobody left, or a neutralised one", () => {
    const { g, red } = covered();
    const unit = g.getUnit(red.id);
    for (const s of unit.soldiers!) s.neutralized = true;
    expect(() => g.setCovering(red.id, true)).toThrow(/no fit shooters/);

    unit.neutralized = true;
    expect(() => g.setCovering(red.id, true)).toThrow(/neutralised/);
  });

  it("is small arms against armour, and says so rather than spending itself", () => {
    const g = new Game({ seed: 1, enforceC2: false, terrain: FLAT_GROUND });
    const red = g.addUnit(makeInfantry("RED-1", "RED", "squad", { x: 0, y: 0 }, 8));
    const tank = g.addUnit(makeVehicle("BLUE-T", "BLUE", { x: 0, y: 200 }, 180));
    g.beginTurn();
    g.advanceToPhase("combat");
    g.setCovering(red.id, true);
    toNextMovement(g);
    expect(g.moveUnit(tank.id, { x: 0, y: 160 }, "normal").coveringFire).toEqual([]);
    // The posture is intact: nothing was fired, so nothing was spent.
    expect(g.getUnit(red.id).covering).toBeDefined();
  });

  it("replays exactly, shots and all", () => {
    const { g, red, blue } = covered(3, { x: 0, y: 0 }, { x: 0, y: 200 });
    g.setCovering(red.id, true, "smallArms");
    toNextMovement(g);
    g.moveUnit(blue.id, { x: 0, y: 150 }, "run");
    g.advanceToPhase("summary");

    const recording = sealRecording(g.toRecording());
    const replayed = replayGame(recording);
    expect(replayed.units).toEqual(g.units);
    expect(replayed.rng.getState()).toBe(g.rng.getState());
    expect(verifyRecording(recording).ok).toBe(true);
  });

  it("costs a game with no coverer nothing at all", () => {
    // The point every older recording depends on: a battle in which nobody
    // covers must ask the rng for exactly what it asked before this existed.
    // Comparing a game against *itself* would prove only determinism, so the
    // comparison is against a game whose coverer never gets a trigger — the
    // path that walks the bound, finds no firing point and must draw nothing.
    const quiet = covered(5, { x: 0, y: 0 }, { x: 0, y: 900 });
    toNextMovement(quiet.g);
    const quietBefore = quiet.g.rng.getState();
    quiet.g.moveUnit(quiet.blue.id, { x: 0, y: 950 }, "normal");
    const quietAfter = quiet.g.rng.getState();

    const watched = covered(5, { x: 0, y: 0 }, { x: 0, y: 900 });
    watched.g.setCovering(watched.red.id, true); // …and never triggered
    toNextMovement(watched.g);
    expect(watched.g.rng.getState()).toBe(quietBefore);
    watched.g.moveUnit(watched.blue.id, { x: 0, y: 950 }, "normal");
    expect(watched.g.rng.getState()).toBe(quietAfter);
  });
});
