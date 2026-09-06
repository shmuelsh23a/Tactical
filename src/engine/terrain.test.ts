import { describe, it, expect } from "vitest";
import {
  FLAT_GROUND,
  boundCost,
  climbAlong,
  coverFromObjects,
  eyeHeight,
  groundHeight,
  reachAlong,
  reachFan,
  steepestGradeAlong,
  terrainBlocksSight,
  type Heightfield,
  type MapObject,
  type Terrain,
} from "./terrain.js";
import { EYE_HEIGHT, OBJECT_COVER_REACH_M, OWN_OBJECT_SIGHT_M, SLOPE } from "./data/terrain.js";
import { Game } from "./game.js";
import { Rng } from "./rng.js";
import { makeInfantry, makeVehicle } from "./units.js";
import { replayGame } from "./recording.js";
import { stepTowards } from "./orders.js";
import { stateDigest } from "./digest.js";

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

describe("the cost of the ground (Naismith)", () => {
  const foot = { x: 0, y: 200 };
  const crest = { x: 200, y: 200 };
  const far = { x: 400, y: 200 };

  it("counts the metres climbed and ignores the descent", () => {
    expect(climbAlong(ridged, foot, crest)).toBeCloseTo(20, 6);
    expect(climbAlong(ridged, crest, far)).toBeCloseTo(0, 6);
    expect(climbAlong(ridged, foot, far)).toBeCloseTo(20, 6);
    expect(climbAlong(FLAT_GROUND, foot, far)).toBe(0);
  });

  it("charges eight metres of going per metre climbed, and nothing on the flat", () => {
    expect(boundCost(ridged, foot, crest)).toBeCloseTo(200 + 20 * SLOPE.climbCostPerMetre, 6);
    expect(boundCost(ridged, crest, far)).toBeCloseTo(200, 6);
    expect(boundCost(FLAT_GROUND, foot, far)).toBeCloseTo(400, 6);
  });

  it("reads the grade in degrees", () => {
    // 20 m over 200 m is a 10% grade, 5.7°; a 200 m ridge over 200 m is 45°.
    expect(steepestGradeAlong(ridged, foot, crest)).toBeCloseTo(5.71, 1);
    expect(steepestGradeAlong({ heightfield: ridge(200), objects: [] }, foot, crest)).toBeCloseTo(45, 1);
    expect(steepestGradeAlong(FLAT_GROUND, foot, crest)).toBe(0);
  });

  it("a bound uphill stops where the budget runs out, downhill goes the distance", () => {
    // Uphill every metre costs 1 + 8 × 0.1 = 1.8, so 50 m of budget is 27.8 m.
    const up = reachAlong(ridged, foot, crest, 50);
    expect(up.x).toBeCloseTo(50 / 1.8, 1);
    expect(boundCost(ridged, foot, up)).toBeLessThanOrEqual(50 + 1e-6);
    const down = reachAlong(ridged, crest, far, 50);
    expect(down.x).toBeCloseTo(250, 6);
    // Within reach, the destination itself.
    expect(reachAlong(ridged, crest, { x: 240, y: 200 }, 50)).toEqual({ x: 240, y: 200 });
    expect(reachAlong(ridged, foot, crest, 0)).toEqual(foot);
  });
});

describe("the fan of reachable ground", () => {
  it("is the flat circle on flat ground", () => {
    const fan = reachFan(FLAT_GROUND, { x: 100, y: 100 }, 50, { bearings: 8 });
    expect(fan).toHaveLength(8);
    for (const p of fan) expect(Math.hypot(p.x - 100, p.y - 100)).toBeCloseTo(50, 6);
  });

  it("falls short uphill and reaches full length along the contour", () => {
    // From the foot of the ridge: east climbs (27.8 m), north and south run
    // along the level, west is off the grid and level too.
    const fan = reachFan(ridged, { x: 0, y: 200 }, 50, { bearings: 4 });
    expect(fan).toHaveLength(4);
    expect(fan[0]!.x).toBeCloseTo(50 / 1.8, 1); // east
    expect(fan[1]!.y).toBeCloseTo(250, 6); // south (y grows south)
    expect(fan[2]!.x).toBeCloseTo(-50, 6); // west
    expect(fan[3]!.y).toBeCloseTo(150, 6); // north
  });

  it("a vehicle's fan stops at the grade it refuses", () => {
    const steep: Terrain = { heightfield: ridge(200), objects: [] }; // 45°
    const fan = reachFan(steep, { x: 0, y: 200 }, 50, { bearings: 4, vehicle: true });
    expect(fan).toHaveLength(4);
    expect(fan[0]!.x).toBeLessThan(0.01); // east: cannot start
    expect(fan[1]!.y).toBeCloseTo(250, 6); // along the contour, the full bound
    // Infantry on the same ground goes as far as the budget allows.
    const foot = reachFan(steep, { x: 0, y: 200 }, 50, { bearings: 4 });
    expect(foot[0]!.x).toBeGreaterThan(5);
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

  it("refuses a bound the climb puts over budget, and spends the budget on the climb", () => {
    const g = new Game({ seed: 1, terrain: ridged });
    const squad = g.addUnit(makeInfantry("S", "BLUE", "squad", { x: 0, y: 200 }, 8));
    g.beginTurn();
    g.advanceToPhase("movement");
    // 50 m on the flat; uphill it costs 90 m.
    expect(() => g.moveUnit(squad.id, { x: 50, y: 200 })).toThrow(/climbed/);
    g.moveUnit(squad.id, { x: 25, y: 200 });
    expect(squad.movedThisTurn).toBeCloseTo(25 + 2.5 * SLOPE.climbCostPerMetre, 6);
    expect(() => g.moveUnit(squad.id, { x: 30, y: 200 })).toThrow(/exceeds/);
  });

  it("a standing order climbs as far as the budget reaches, then carries on", () => {
    const g = new Game({ seed: 1, terrain: ridged });
    const squad = g.addUnit(makeInfantry("S", "BLUE", "squad", { x: 0, y: 200 }, 8));
    g.beginTurn();
    g.advanceToPhase("movement");
    g.setStandingOrder(squad.id, { gait: "normal", destination: { x: 200, y: 200 } });
    const [first] = g.executeStandingOrders("BLUE");
    expect(first?.moved?.to.x).toBeCloseTo(50 / 1.8, 1);
    expect(first?.moved?.arrived).toBe(false);
    // Bound by bound up the slope, the order reaches the crest.
    for (let turn = 0; turn < 7; turn++) {
      g.advanceToPhase("summary");
      g.advancePhase();
      g.advanceToPhase("movement");
      g.executeStandingOrders("BLUE");
    }
    expect(squad.position.x).toBeCloseTo(200, 0);
  });

  it("what an order reaches never costs more than the bound may spend", () => {
    // A gentle, slightly noisy descent — the kind of ground where a whole
    // order line climbs nothing while the shorter bound's own samples, falling
    // elsewhere, catch a rise of a few millimetres. The point reachAlong hands
    // back must pass the very check moveUnit makes on it. The first cut judged
    // "no climb" on the whole order line and handed back a flat step; on this
    // field and this order that step costs 100.04 m of a 100 m budget, and on
    // the real map one order in 260 threw out of the execution loop.
    const columns = 41;
    const rows = 41;
    const heights: number[] = [];
    const noise = new Rng(2);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) heights.push(-0.3 * c * 10 + 0.6 * noise.next());
    }
    const descent: Terrain = { heightfield: { spacing: 10, columns, rows, heights }, objects: [] };
    const from = { x: 341.71834448352456, y: 385.79896995797753 };
    const towards = { x: 372.49429477378726, y: 172.12405856698751 };
    // The case is live: the order line climbs nothing, the flat step does.
    expect(climbAlong(descent, from, towards)).toBe(0);
    expect(boundCost(descent, from, stepTowards(from, towards, 100))).toBeGreaterThan(100 + 1e-6);
    // …and reachAlong stays inside the budget regardless.
    const to = reachAlong(descent, from, towards, 100);
    expect(boundCost(descent, from, to)).toBeLessThanOrEqual(100 + 1e-6);

    // Through the game: the order executes rather than throwing.
    const g = new Game({ seed: 1, terrain: descent });
    const squad = g.addUnit(makeInfantry("S", "BLUE", "squad", from, 8));
    g.beginTurn();
    g.advanceToPhase("movement");
    g.setStandingOrder(squad.id, { gait: "run", destination: towards });
    expect(() => g.executeStandingOrders("BLUE")).not.toThrow();
    expect(squad.movedThisTurn).toBeLessThanOrEqual(100 + 1e-6);

    // And at random across the same ground, for good measure.
    const rng = new Rng(15);
    for (let i = 0; i < 500; i++) {
      const a = { x: rng.next() * 400, y: rng.next() * 400 };
      const b = { x: rng.next() * 400, y: rng.next() * 400 };
      const budget = [25, 50, 100][i % 3]!;
      expect(boundCost(descent, a, reachAlong(descent, a, b, budget))).toBeLessThanOrEqual(budget + 1e-6);
    }
  });

  it("on flat ground an order step lands exactly where it always did", () => {
    const g = new Game({ seed: 1 });
    const squad = g.addUnit(makeInfantry("S", "BLUE", "squad", { x: 10, y: 20 }, 8));
    g.beginTurn();
    g.advanceToPhase("movement");
    g.setStandingOrder(squad.id, { gait: "run", destination: { x: 310, y: 420 } });
    g.executeStandingOrders("BLUE");
    expect(squad.position).toEqual(stepTowards({ x: 10, y: 20 }, { x: 310, y: 420 }, 100));
    expect(squad.movedThisTurn).toBe(100);
  });

  it("the grade is judged on the bound taken, not on the whole order line", () => {
    // Flat for 100 m, then a 45° wall. An order past the wall walks the flat
    // part bound by bound and is refused only when the bound reaches the wall.
    const columns = 41;
    const rows = 41;
    const heights: number[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) heights.push(Math.max(0, Math.min(50, c * 10 - 100)));
    }
    const walled: Terrain = { heightfield: { spacing: 10, columns, rows, heights }, objects: [] };
    const g = new Game({ seed: 1, terrain: walled });
    const tank = g.addUnit(makeVehicle("T", "RED", { x: 0, y: 200 }));
    g.beginTurn();
    g.advanceToPhase("movement");
    g.setStandingOrder(tank.id, { gait: "normal", destination: { x: 300, y: 200 } });
    expect(g.executeStandingOrders("RED")[0]?.moved?.to.x).toBeCloseTo(50, 6);
    const reasons: (string | undefined)[] = [];
    for (let turn = 0; turn < 3; turn++) {
      g.advanceToPhase("summary");
      g.advancePhase();
      g.advanceToPhase("movement");
      reasons.push(g.executeStandingOrders("RED")[0]?.reason);
    }
    expect(tank.position.x).toBeCloseTo(100, 6);
    expect(reasons).toEqual([undefined, "grade too steep", "grade too steep"]);
  });

  it("a vehicle will not take a grade over the limit; infantry will", () => {
    const steep: Terrain = { heightfield: ridge(200), objects: [] }; // 45°
    const g = new Game({ seed: 1, terrain: steep });
    const tank = g.addUnit(makeVehicle("T", "RED", { x: 0, y: 200 }));
    const squad = g.addUnit(makeInfantry("S", "RED", "squad", { x: 0, y: 100 }, 8));
    g.beginTurn();
    g.advanceToPhase("movement");
    g.setStandingOrder(tank.id, { gait: "normal", destination: { x: 100, y: 150 } });
    expect(g.executeStandingOrders("RED")[0]?.reason).toBe("grade too steep");
    expect(() => g.moveUnit(tank.id, { x: 5, y: 200 })).toThrow(/too steep/);
    expect(() => g.moveUnit(tank.id, { x: 0, y: 150 })).not.toThrow(); // along the contour
    expect(() => g.moveUnit(squad.id, { x: 5, y: 100 })).not.toThrow();
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

  it("a road is carried by the recording and read by no rule", () => {
    const road: Terrain = {
      heightfield: ridge(20),
      objects: [],
      roads: [{ id: "r", kind: "street", width: 6, points: [{ x: 0, y: 200 }, { x: 400, y: 200 }] }],
    };
    const g = new Game({ seed: 1, terrain: road });
    const west = g.addUnit(makeInfantry("W", "BLUE", "squad", { x: 50, y: 200 }, 8));
    const east = g.addUnit(makeInfantry("E", "RED", "squad", { x: 350, y: 200 }, 8));
    // Along the road and across the crest: the road changes nothing.
    expect(g.hasLineOfSight(west, east)).toBe(false);
    g.beginTurn();
    g.advanceToPhase("movement");
    expect(() => g.moveUnit(west.id, { x: 100, y: 200 })).toThrow(/climbed/);
    expect(replayGame(g.toRecording()).terrain.roads).toHaveLength(1);

    // The strong form: the same battle with and without the road ends in the
    // same material state, digest for digest — the test that catches a
    // "roads as going" rule slipping in without the author's ruling.
    const play = (terrain: Terrain) => {
      const game = new Game({ seed: 4, trackIntel: true, terrain });
      const a = game.addUnit(makeInfantry("A", "BLUE", "squad", { x: 20, y: 200 }, 8));
      const b = game.addUnit(makeInfantry("B", "RED", "squad", { x: 120, y: 200 }, 8));
      expect(game.groundCoverAt({ x: 60, y: 200 })).toBe("none"); // on the road
      game.beginTurn();
      game.advanceToPhase("movement");
      game.moveUnit(a.id, { x: 40, y: 200 });
      game.advanceToPhase("combat");
      game.fire(a.id, b.id, { weapon: "smallArms" });
      game.advanceToPhase("summary");
      return stateDigest(game);
    };
    expect(play(road)).toBe(play({ heightfield: road.heightfield, objects: [] }));
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
      // 20 m towards the crest: 2 m of climb, 36 m of budget.
      const { detection } = g.moveUnit(west.id, { x: 70, y: 200 });
      expect(detection.spottedUnitIds).toEqual([]);
    }
  });
});
