import {
  CAMOUFLAGE_TURNS_AT_MAX,
  Game,
  makeCommandGroup,
  makeInfantry,
  makeVehicle,
  type MapObject,
  type Point,
  type Terrain,
} from "../engine/index.js";
import { RAMAT_MENASHE } from "./maps/ramatMenashe.js";

export interface Scenario {
  game: Game;
  /** Map extent in metres. */
  mapWidth: number;
  mapHeight: number;
  title: string;
}

/** An axis-aligned building footprint, `w × h` metres with its corner at `at`. */
function building(id: string, at: Point, w: number, h: number): MapObject {
  return {
    id,
    kind: "building",
    footprint: {
      shape: "polygon",
      points: [at, { x: at.x + w, y: at.y }, { x: at.x + w, y: at.y + h }, { x: at.x, y: at.y + h }],
    },
  };
}

/** A stone terrace wall from `a` to `b`, 1 m thick. */
function wall(id: string, a: Point, b: Point): MapObject {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const nx = (-dy / len) * 0.5;
  const ny = (dx / len) * 0.5;
  return {
    id,
    kind: "wall",
    footprint: {
      shape: "polygon",
      points: [
        { x: a.x + nx, y: a.y + ny },
        { x: b.x + nx, y: b.y + ny },
        { x: b.x - nx, y: b.y - ny },
        { x: a.x - nx, y: a.y - ny },
      ],
    },
  };
}

/** A single oak, its crown `radius` metres across. */
function tree(id: string, center: Point, radius = 4): MapObject {
  return { id, kind: "tree", footprint: { shape: "circle", center, radius } };
}

/**
 * The demo ground: a real hillside on Ramat Menashe near Elyakim (rules
 * decision 15 — see `maps/ramatMenashe.ts` for where and from what). North is
 * up. A hill fills the south-centre of the map, its forward shoulder runs
 * across the middle, a ridge comes down from the north-east corner, and the
 * north and west are low ground. What stands on it is invented: a farm
 * compound on the hilltop, terrace walls on the slopes, a few oaks.
 */
export function buildDemoTerrain(): Terrain {
  return {
    heightfield: RAMAT_MENASHE,
    objects: [
      // The farm on the hilltop, where RED's command group sits.
      building("farm-1", { x: 462, y: 582 }, 20, 18),
      building("farm-2", { x: 492, y: 600 }, 22, 16),
      wall("farm-wall", { x: 455, y: 625 }, { x: 520, y: 625 }),
      // A terrace wall across the forward shoulder — RED's ambush lies behind it.
      wall("terrace", { x: 340, y: 333 }, { x: 420, y: 333 }),
      // A terrace wall on the north-east ridge, RED's flank position.
      wall("ridge-wall", { x: 680, y: 263 }, { x: 720, y: 263 }),
      // Oaks: a clump on the shoulder, and two on the northern slope that give
      // an attacker something to move between.
      tree("oak-1", { x: 330, y: 300 }),
      tree("oak-2", { x: 345, y: 290 }),
      tree("oak-3", { x: 322, y: 312 }, 3),
      tree("oak-4", { x: 300, y: 180 }, 5),
      tree("oak-5", { x: 470, y: 190 }),
      tree("oak-6", { x: 705, y: 245 }, 5),
    ],
  };
}

/**
 * A small hotseat demonstration scenario: a BLUE infantry platoon in the low
 * ground to the north attacking a RED position on the hill to the south, held
 * by two squads and a tank. The hill's shoulder hides BLUE's start line from
 * every RED position; BLUE comes into view as it climbs, at about the line of
 * the terrace wall, and RED's flank squad on the north-east ridge sees the
 * centre of the approach before the hilltop does.
 */
export function buildDemoScenario(seed = 2026): Scenario {
  // Played with the knowledge model on: each side sees what it has detected —
  // the document's own rolls — rather than everything within a radius.
  const game = new Game({ seed, trackIntel: true, terrain: buildDemoTerrain() });

  // BLUE — a platoon attacking from the north, out of the low ground. The
  // player is the platoon leader: they manoeuvre the squads, and control their
  // own command group.
  game.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", { x: 250, y: 80 }, 8, "כיתה 1"));
  game.addUnit(makeInfantry("BLUE-2", "BLUE", "squad", { x: 400, y: 60 }, 8, "כיתה 2"));
  game.addUnit(makeInfantry("BLUE-3", "BLUE", "squad", { x: 500, y: 70 }, 8, "כיתה 3"));
  game.addUnit(makeCommandGroup("BLUE-HQ", "BLUE", "platoon", { x: 400, y: 20 }, 3, 'חפ"ק מ"מ'));

  // RED — defending the hill. The forward squad lies behind the terrace wall
  // on the shoulder and prepared its position before the battle, so it starts
  // fully camouflaged (rules decision 12): BLUE will not find it by looking.
  // The second squad holds the ridge on the flank; the tank is on the hilltop
  // behind the crest, the command group in the farm.
  const ambush = makeInfantry("RED-1", "RED", "squad", { x: 380, y: 336 }, 6, "מחלקה א'/1");
  ambush.camouflaging = true;
  ambush.camouflageTurns = CAMOUFLAGE_TURNS_AT_MAX;
  // Set before it is added: addUnit records the force as it stands, so a unit
  // dressed after the fact would replay undressed.
  game.addUnit(ambush);
  game.addUnit(makeInfantry("RED-2", "RED", "squad", { x: 700, y: 260 }, 8, "מחלקה א'/2"));
  game.addUnit(makeVehicle("RED-TANK", "RED", { x: 520, y: 500 }, 270, "טנק"));
  game.addUnit(makeCommandGroup("RED-HQ", "RED", "platoon", { x: 472, y: 591 }, 3, 'חפ"ק מ"מ'));

  // RED has mined the shoulder: anti-personnel charges across the likely lanes
  // up the slope, with an anti-tank charge on the track in the centre. BLUE
  // only learns where they are by spotting them on the way — or by walking
  // into one.
  for (const position of [
    { x: 330, y: 240 },
    { x: 400, y: 230 },
    { x: 470, y: 250 },
    { x: 560, y: 230 },
  ]) {
    game.addMine({ side: "RED", type: "antiPersonnel", position, armed: true, detected: false });
  }
  game.addMine({
    side: "RED",
    type: "antiTank",
    position: { x: 450, y: 300 },
    armed: true,
    detected: false,
  });

  return { game, mapWidth: 900, mapHeight: 800, title: "תרגיל הדגמה — מגע ראשון" };
}
