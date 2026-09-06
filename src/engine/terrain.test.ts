import { describe, it, expect } from "vitest";
import {
  FLAT_GROUND,
  coverFromObjects,
  eyeHeight,
  groundHeight,
  terrainBlocksSight,
  type Heightfield,
  type MapObject,
  type Terrain,
} from "./terrain.js";
import { EYE_HEIGHT, OBJECT_COVER_REACH_M, OWN_OBJECT_SIGHT_M } from "./data/terrain.js";
import { Game } from "./game.js";
import { makeInfantry, makeVehicle } from "./units.js";
import { replayGame } from "./recording.js";

/**
 * A single ridge running north–south across a 400 m square: 0 m at both
 * edges, `crest` m at x = 200, linear on either side. Sampled every 10 m.
 */
function ridge(crest: number): Heightfield {
  const columns = 41;
  const rows = 41;
  const heights: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const x = c * 10;
      heights.push(crest * (1 - Math.abs(x - 200) / 200));
    }
  }
  return { spacing: 10, columns, rows, heights };
}

const ridged: Terrain = { heightfield: ridge(20), objects: [] };

describe("ground height", () => {
  it("is flat at zero with no heightfield", () => {
    expect(groundHeight(FLAT_GROUND, { x: 123, y: 456 })).toBe(0);
  });

  it("interpolates between samples and continues level past the edge", () => {
    expect(groundHeight(ridged, { x: 200, y: 100 })).toBeCloseTo(20, 6);
    expect(groundHeight(ridged, { x: 205, y: 100 })).toBeCloseTo(19.5, 6);
    expect(groundHeight(ridged, { x: 100, y: 0 })).toBeCloseTo(10, 6);
    // Beyond the grid the edge height carries on.
    expect(groundHeight(ridged, { x: -50, y: 900 })).toBeCloseTo(0, 6);
  });
});

describe("line of sight over the ground", () => {
  it("is clear on flat ground", () => {
    expect(terrainBlocksSight(FLAT_GROUND, { x: 0, y: 0 }, 1.5, { x: 300, y: 0 }, 1.5)).toBe(false);
  });

  it("a crest between two forces on the plain blocks the line, both ways", () => {
    const west = { x: 50, y: 200 };
    const east = { x: 350, y: 200 };
    expect(terrainBlocksSight(ridged, west, 1.5, east, 1.5)).toBe(true);
    expect(terrainBlocksSight(ridged, east, 1.5, west, 1.5)).toBe(true);
  });

  it("a force on the crest sees the plain, and the plain sees it", () => {
    const crest = { x: 200, y: 200 };
    const plain = { x: 50, y: 200 };
    expect(terrainBlocksSight(ridged, crest, 1.5, plain, 1.5)).toBe(false);
    expect(terrainBlocksSight(ridged, plain, 1.5, crest, 1.5)).toBe(false);
  });

  it("a low silhouette hides behind a rise a standing force is seen over", () => {
    // A 1.2 m hump halfway along the line, both forces on the flat either
    // side. Two forces 1.5 m tall see each other over it; a force with its
    // head down at 0.5 m is hidden by it, and — the cost of keeping low —
    // cannot see over it either.
    const hump: Terrain = { heightfield: ridge(1.2), objects: [] };
    const west = { x: 0, y: 200 };
    const east = { x: 400, y: 200 };
    expect(terrainBlocksSight(hump, west, 1.5, east, 1.5)).toBe(false);
    expect(terrainBlocksSight(hump, west, 1.5, east, 0.5)).toBe(true);
    expect(terrainBlocksSight(hump, west, 0.5, east, 1.5)).toBe(true);
  });
});

const house: MapObject = {
  id: "house",
  kind: "building",
  footprint: {
    shape: "polygon",
    points: [
      { x: 190, y: 190 },
      { x: 210, y: 190 },
      { x: 210, y: 210 },
      { x: 190, y: 210 },
    ],
  },
};
const oak: MapObject = {
  id: "oak",
  kind: "tree",
  footprint: { shape: "circle", center: { x: 200, y: 200 }, radius: 4 },
};
const wall: MapObject = {
  id: "wall",
  kind: "wall",
  height: 1.2, // under a standing eye, over a crouching one — no equalities
  footprint: {
    shape: "polygon",
    points: [
      { x: 150, y: 199.5 },
      { x: 250, y: 199.5 },
      { x: 250, y: 200.5 },
      { x: 150, y: 200.5 },
    ],
  },
};

describe("line of sight through objects", () => {
  it("a building between two forces blocks the line", () => {
    const t: Terrain = { objects: [house] };
    expect(terrainBlocksSight(t, { x: 100, y: 200 }, 1.5, { x: 300, y: 200 }, 1.5)).toBe(true);
    // …but not a line that passes beside it.
    expect(terrainBlocksSight(t, { x: 100, y: 250 }, 1.5, { x: 300, y: 250 }, 1.5)).toBe(false);
  });

  it("a force inside a building looks out of it rather than at its own wall", () => {
    const t: Terrain = { objects: [house] };
    // Two metres inside the east wall: sees east, and is seen from the east.
    expect(terrainBlocksSight(t, { x: 208, y: 200 }, 0.5, { x: 300, y: 200 }, 1.5)).toBe(false);
    expect(terrainBlocksSight(t, { x: 300, y: 200 }, 1.5, { x: 208, y: 200 }, 0.5)).toBe(false);
    // …but not through the house from the west: that wall is 18 m off.
    expect(terrainBlocksSight(t, { x: 100, y: 200 }, 1.5, { x: 208, y: 200 }, 0.5)).toBe(true);
  });

  it("a force against a building is hidden by it from the far side", () => {
    const t: Terrain = { objects: [house] };
    const againstEastWall = { x: 212, y: 200 };
    expect(terrainBlocksSight(t, { x: 100, y: 200 }, 1.5, againstEastWall, 1.5)).toBe(true);
    expect(terrainBlocksSight(t, againstEastWall, 1.5, { x: 100, y: 200 }, 1.5)).toBe(true);
    // From its own side it is in plain view.
    expect(terrainBlocksSight(t, { x: 300, y: 200 }, 1.5, againstEastWall, 1.5)).toBe(false);
  });

  it("a force against a wall looks over it, even downhill", () => {
    // A terrace wall running north–south across the ridge's west slope, and a
    // force lying 2 m upslope of it looking down at a crouching enemy below.
    // The line falls faster than the ground and dips under the wall's top
    // within the first metres — but the wall is the force's own cover, not an
    // obstacle to it. (On a uniform slope two equal eyes never dip; it is the
    // lower target that makes the geometry bite.)
    const terrace: MapObject = {
      id: "terrace",
      kind: "wall",
      footprint: {
        shape: "polygon",
        points: [
          { x: 190, y: 100 },
          { x: 191, y: 100 },
          { x: 191, y: 300 },
          { x: 190, y: 300 },
        ],
      },
    };
    const slope: Terrain = { heightfield: ridge(40), objects: [terrace] };
    const behind = { x: 193, y: 200 }; // 2 m upslope of the wall
    const below = { x: 100, y: 200 }; // 93 m down the west slope
    expect(terrainBlocksSight(slope, behind, 1.5, below, 0.5)).toBe(false);
    expect(terrainBlocksSight(slope, below, 0.5, behind, 1.5)).toBe(false);
    // Out of reach of the wall it is no longer the force's own, and it blocks.
    const back = { x: 191 + OBJECT_COVER_REACH_M + 2, y: 200 };
    expect(terrainBlocksSight(slope, back, 1.5, below, 0.5)).toBe(true);
    expect(OWN_OBJECT_SIGHT_M).toBeGreaterThan(OBJECT_COVER_REACH_M);
  });

  it("a thin wall is caught exactly where the line crosses it", () => {
    // 1 m thick, 1.5 m high: a standing force sees over it, a force with its
    // head down behind it does not — from either side.
    const t: Terrain = { objects: [wall] };
    const north = { x: 200, y: 150 };
    const south = { x: 200, y: 250 };
    expect(terrainBlocksSight(t, north, 1.5, south, 1.5)).toBe(false);
    expect(terrainBlocksSight(t, north, 1.5, south, 0.5)).toBe(true);
    expect(terrainBlocksSight(t, south, 0.5, north, 1.5)).toBe(true);
  });

  it("a tree clipped by the line blocks it, a tree beside it does not", () => {
    const t: Terrain = { objects: [oak] };
    expect(terrainBlocksSight(t, { x: 100, y: 200 }, 1.5, { x: 300, y: 200 }, 1.5)).toBe(true);
    expect(terrainBlocksSight(t, { x: 100, y: 206 }, 1.5, { x: 300, y: 206 }, 1.5)).toBe(false);
  });

  it("a tall silhouette is seen over a low object", () => {
    // A vehicle at 2.5 m looks over a chest-high wall a force in cover cannot.
    const t: Terrain = { objects: [wall] };
    expect(terrainBlocksSight(t, { x: 200, y: 150 }, 2.5, { x: 200, y: 250 }, 2.5)).toBe(false);
  });
});

describe("cover from objects", () => {
  const t: Terrain = { objects: [house, oak, wall] };

  it("is full in a building, partial at a wall or a tree, nothing in the open", () => {
    expect(coverFromObjects(t, { x: 200, y: 200 })).toBe("full");
    expect(coverFromObjects(t, { x: 160, y: 202 })).toBe("partial");
    expect(coverFromObjects(t, { x: 100, y: 100 })).toBe("none");
  });

  it("reaches a short way out from the footprint, and no further", () => {
    expect(coverFromObjects(t, { x: 200, y: 210 + OBJECT_COVER_REACH_M })).toBe("full");
    expect(coverFromObjects(t, { x: 200, y: 210 + OBJECT_COVER_REACH_M + 1 })).toBe("none");
  });
});

describe("eye height follows posture", () => {
  it("infantry stands, a vehicle looks from its hatches, full cover keeps low", () => {
    const squad = makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 8);
    expect(eyeHeight(squad)).toBe(EYE_HEIGHT.infantry);
    squad.cover = "partial";
    expect(eyeHeight(squad)).toBe(EYE_HEIGHT.infantry);
    squad.cover = "full";
    expect(eyeHeight(squad)).toBe(EYE_HEIGHT.fullCover);
    // A force that fired from full cover stood up to do it: exposed to the
    // shot back (rules decision 7) and standing on the sight line alike.
    squad.firedThisTurn = true;
    expect(eyeHeight(squad)).toBe(EYE_HEIGHT.infantry);
    expect(eyeHeight(makeVehicle("T", "RED", { x: 0, y: 0 }))).toBe(EYE_HEIGHT.vehicle);
  });
});

describe("the game on real ground", () => {
  function ridgeGame(seed = 1) {
    const g = new Game({ seed, trackIntel: true, terrain: ridged });
    const west = g.addUnit(makeInfantry("W", "BLUE", "squad", { x: 50, y: 200 }, 8));
    const east = g.addUnit(makeInfantry("E", "RED", "squad", { x: 350, y: 200 }, 8));
    return { g, west, east };
  }

  it("refuses a shot across a crest for want of a line of sight", () => {
    const { g, west, east } = ridgeGame();
    g.beginTurn();
    g.advanceToPhase("combat");
    const r = g.fire(west.id, east.id, { weapon: "smallArms" });
    expect(r.fired).toBe(false);
    expect(r.reason).toBe("no line of sight");
  });

  it("lets the same shot through once the shooter is on the crest", () => {
    const { g, east } = ridgeGame();
    const crest = g.addUnit(makeInfantry("C", "BLUE", "squad", { x: 200, y: 200 }, 8));
    g.beginTurn();
    g.advanceToPhase("combat");
    expect(g.fire(crest.id, east.id, { weapon: "smallArms" }).fired).toBe(true);
  });

  it("a force in position cannot observe across the crest, however many turns it watches", () => {
    // Both hold still and watch. Without the ridge, 300 m apart, each would
    // have the 300 m band's chance every turn; with it, nobody is ever seen.
    // Ten turns is enough that a single unlucky seed cannot explain it.
    const { g, west, east } = ridgeGame(5);
    for (let turn = 0; turn < 10; turn++) {
      g.beginTurn();
      g.advanceToPhase("summary");
    }
    expect(g.knows("BLUE", east.id)).toBe(false);
    expect(g.knows("RED", west.id)).toBe(false);
  });

  it("a force placed in a building is in full cover from the first turn", () => {
    const g = new Game({ seed: 1, terrain: { objects: [house] } });
    const inside = g.addUnit(makeInfantry("H", "RED", "squad", { x: 200, y: 200 }, 8));
    const outside = g.addUnit(makeInfantry("O", "RED", "squad", { x: 160, y: 160 }, 8));
    expect(inside.cover).toBe("full");
    expect(outside.cover).toBe("none");
    // …and a force that walks in takes the cover at the turn's end, like digging.
    g.beginTurn();
    g.advanceToPhase("movement");
    g.moveUnit(outside.id, { x: 170, y: 170 });
    g.advanceToPhase("summary");
    g.advancePhase();
    expect(outside.cover).toBe("none");
    g.advanceToPhase("movement");
    g.moveUnit(outside.id, { x: 188, y: 192 }); // 2 m from the wall: against it
    g.advanceToPhase("summary");
    g.advancePhase();
    expect(outside.cover).toBe("full");
  });

  it("a recording carries the ground, and a replay fights on it", () => {
    const { g, west, east } = ridgeGame(3);
    g.beginTurn();
    g.advanceToPhase("combat");
    g.fire(west.id, east.id, { weapon: "smallArms" });
    const recording = g.toRecording();
    expect(recording.terrain?.heightfield?.columns).toBe(41);

    const replay = replayGame(recording);
    expect(replay.terrain.heightfield?.columns).toBe(41);
    expect(replay.hasLineOfSight(replay.getUnit(west.id), replay.getUnit(east.id))).toBe(false);
  });

  it("a game built without ground records none, and plays flat", () => {
    const g = new Game({ seed: 1 });
    expect(g.toRecording().terrain).toBeUndefined();
    const a = g.addUnit(makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 8));
    const b = g.addUnit(makeInfantry("B", "RED", "squad", { x: 300, y: 0 }, 8));
    expect(g.hasLineOfSight(a, b)).toBe(true);
    // A prepared position is still taken up at the first upkeep, as it was
    // before there was ground — placement does not pull it forward.
    const prepared = makeInfantry("P", "RED", "squad", { x: 100, y: 0 }, 8);
    prepared.baseCover = "partial";
    g.addUnit(prepared);
    expect(prepared.cover).toBe("none");
  });

  it("a moving force does not spot across a crest even without the knowledge model", () => {
    // Ten seeds: on flat ground a walk to 250 m from a visible enemy rolls
    // 70% every time; behind the ridge it must never roll at all.
    for (let seed = 1; seed <= 10; seed++) {
      const g = new Game({ seed, terrain: ridged });
      const west = g.addUnit(makeInfantry("W", "BLUE", "squad", { x: 50, y: 200 }, 8));
      g.addUnit(makeInfantry("E", "RED", "squad", { x: 350, y: 200 }, 8));
      g.beginTurn();
      g.advanceToPhase("movement");
      const { detection } = g.moveUnit(west.id, { x: 100, y: 200 });
      expect(detection.spottedUnitIds).toEqual([]);
    }
  });
});
