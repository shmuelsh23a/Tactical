import { describe, expect, it } from "vitest";
import { Game, type GameOptions } from "./game.js";
import { makeInfantry } from "./units.js";
import { FLAT_GROUND, type MapObject, type Terrain } from "./terrain.js";
import { replayGame } from "./recording.js";
import { positionShare } from "./combat/directional.js";
import { DIRECTIONAL_COVER, UNREADY } from "./data/directFire.js";

const square = (id: string, kind: MapObject["kind"], cx: number, cy: number, half: number): MapObject => ({
  id,
  kind,
  footprint: {
    shape: "polygon",
    points: [
      { x: cx - half, y: cy - half },
      { x: cx + half, y: cy - half },
      { x: cx + half, y: cy + half },
      { x: cx - half, y: cy + half },
    ],
  },
});

/**
 * A RED squad at the origin, and a BLUE squad 150 m away at `bearing`
 * degrees (0 along +x) firing at it; the hit chance the shot was resolved
 * at. Contacts are kept unless asked otherwise, and RED has seen BLUE, so
 * nothing here is caught unready unless the test says so.
 */
function shot(
  opts: { bearing: number; front?: number; baseCover?: "full" | "partial"; terrain?: Terrain; seen?: boolean; sector?: number } & Partial<GameOptions>,
): number {
  const { bearing, front, baseCover, terrain, seen = true, sector, ...gameOpts } = opts;
  const g = new Game({ seed: 3, enforceC2: false, trackIntel: true, terrain: terrain ?? FLAT_GROUND, ...gameOpts });
  const red = makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 8);
  if (baseCover) red.baseCover = baseCover;
  if (front !== undefined) red.front = front;
  if (sector !== undefined) red.observationSector = { bearing: sector, width: 60 };
  g.addUnit(red);
  const rad = (bearing * Math.PI) / 180;
  g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 150 * Math.cos(rad), y: 150 * Math.sin(rad) }, 8));
  g.beginTurn();
  g.advanceToPhase("combat");
  if (seen && g.trackIntel) g.fire("R", "B", { weapon: "smallArms", hasLineOfSight: true });
  return g.fire("B", "R", { weapon: "smallArms", hasLineOfSight: true }).hitChance;
}

describe("directional cover (rules decision 85)", () => {
  it("gives a position its cover in full toward its front, a share from the flank, less from the rear", () => {
    expect(positionShare(0, 30)).toBe(1);
    expect(positionShare(0, 90)).toBe(DIRECTIONAL_COVER.flankShare);
    expect(positionShare(0, 180)).toBe(DIRECTIONAL_COVER.rearShare);
    expect(positionShare(undefined, 180)).toBe(1);
    // A prepared position facing +x, fired on from the front, the flank and the rear.
    const front = shot({ bearing: 0, front: 0, baseCover: "full", trackIntel: false });
    const flank = shot({ bearing: 90, front: 0, baseCover: "full", trackIntel: false });
    const rear = shot({ bearing: 180, front: 0, baseCover: "full", trackIntel: false });
    const open = shot({ bearing: 0, trackIntel: false });
    // Full cover is −50% (the document); from the flank it keeps 60% of that, from the rear 30%.
    expect(front / open).toBeCloseTo(0.5, 6);
    expect(flank / open).toBeCloseTo(1 - 0.5 * DIRECTIONAL_COVER.flankShare, 6);
    expect(rear / open).toBeCloseTo(1 - 0.5 * DIRECTIONAL_COVER.rearShare, 6);
    // Without the rule, the rear is as good as the front, as it always was.
    expect(shot({ bearing: 180, front: 0, baseCover: "full", trackIntel: false, directionalCover: false }) / open).toBeCloseTo(0.5, 6);
  });

  it("lets a house cover on every side, and a wall only from its own", () => {
    const house: Terrain = { objects: [square("h", "building", 0, 0, 6)] };
    const open = shot({ bearing: 0, trackIntel: false });
    for (const bearing of [0, 90, 180, 270]) expect(shot({ bearing, terrain: house, trackIntel: false }) / open).toBeCloseTo(0.5, 6);
    // A wall 2 m off to +x: cover against fire from +x, none from −x.
    const wall: Terrain = { objects: [square("w", "wall", 2.5, 0, 0.5)] };
    expect(shot({ bearing: 0, terrain: wall, trackIntel: false }) / open).toBeCloseTo(0.9, 6);
    expect(shot({ bearing: 180, terrain: wall, trackIntel: false }) / open).toBeCloseTo(1, 6);
  });

  it("faces a dug position toward the arc it watches, and gives the front up when it moves", () => {
    const g = new Game({ seed: 3, enforceC2: false, terrain: FLAT_GROUND });
    const red = makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 8);
    red.observationSector = { bearing: 45, width: 90 };
    g.addUnit(red);
    g.beginTurn();
    // On the research figures digging takes minutes: 30 turns to a prone shelter (decision 50).
    for (let i = 0; i < 60 && red.front === undefined; i++) {
      g.advanceToPhase("combat");
      g.advanceToPhase("initiative");
    }
    expect(red.cover).not.toBe("none");
    expect(red.front).toBe(45);
    g.advanceToPhase("movement");
    g.moveUnit("R", { x: 30, y: 0 });
    g.advanceToPhase("initiative");
    expect(red.front).toBeUndefined();
  });

  it("catches a force unready when an enemy it had not seen fires from outside its arc", () => {
    // Facing +x; the shot comes from the rear. In the open, so cover is not in it.
    const seen = shot({ bearing: 180, front: 0, seen: true });
    const unseen = shot({ bearing: 180, front: 0, seen: false });
    expect(unseen / seen).toBeCloseTo(UNREADY.hitFactor, 6);
    // From inside the arc it is not caught, seen or not; nor is a force watching no arc.
    expect(shot({ bearing: 0, front: 0, seen: false }) / shot({ bearing: 0, front: 0, seen: true })).toBeCloseTo(1, 6);
    expect(shot({ bearing: 180, seen: false }) / shot({ bearing: 180, seen: true })).toBeCloseTo(1, 6);
    // An observation sector is the arc it watches, when it has one.
    expect(shot({ bearing: 180, sector: 180, seen: false }) / shot({ bearing: 180, sector: 180, seen: true })).toBeCloseTo(1, 6);
  });

  it("leaves a force caught unready firing at a fraction until the turn is out", () => {
    const g = new Game({ seed: 3, enforceC2: false, trackIntel: true, terrain: FLAT_GROUND });
    const red = makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 8);
    red.front = 0;
    g.addUnit(red);
    g.addUnit(makeInfantry("B", "BLUE", "squad", { x: -150, y: 0 }, 8));
    g.addUnit(makeInfantry("B2", "BLUE", "squad", { x: 150, y: 0 }, 8));
    g.beginTurn();
    g.advanceToPhase("combat");
    const before = g.fire("R", "B2", { weapon: "smallArms", hasLineOfSight: true }).hitChance;
    g.fire("B", "R", { weapon: "smallArms", hasLineOfSight: true });
    expect(red.surprisedUntilTurn).toBe(g.turn);
    red.firedThisTurn = false;
    const after = g.fire("R", "B2", { weapon: "smallArms", hasLineOfSight: true }).hitChance;
    expect(after / before).toBeCloseTo(UNREADY.ownFire, 6);
  });

  it("is on for a new game, and off for a recording made before it", () => {
    const g = new Game({ seed: 1 });
    expect(g.directionalCover).toBe(true);
    const recording = g.toRecording();
    expect(replayGame(recording).directionalCover).toBe(true);
    delete (recording as { directionalCover?: boolean }).directionalCover;
    expect(replayGame(recording).directionalCover).toBe(false);
  });
});
