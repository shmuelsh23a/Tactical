import {
  CAMOUFLAGE_TURNS_AT_MAX,
  Game,
  makeCommandGroup,
  makeInfantry,
  makeVehicle,
  type Terrain,
} from "../engine/index.js";
import { RAMAT_MENASHE } from "./maps/ramatMenashe.js";
import { RAMAT_MENASHE_OBJECTS, RAMAT_MENASHE_ROADS } from "./maps/ramatMenasheObjects.js";

export interface Scenario {
  game: Game;
  /** Map extent in metres. */
  mapWidth: number;
  mapHeight: number;
  title: string;
}

/**
 * The demo ground (rules decision 15): the southern edge of Yokneam Illit on
 * Ramat Menashe, 900 × 800 m with north up. The relief is from public terrain
 * tiles (`maps/ramatMenashe.ts`) and the buildings and woods on it from
 * OpenStreetMap (`maps/ramatMenasheObjects.ts`), as are the streets, Route 6
 * and the tracks, which are drawn and nothing more — nothing on this map is
 * invented. The town's houses stand on the hill in the south-east; the hill's
 * forward shoulder runs across the middle; a ridge comes down from the
 * north-east; Route 6 and its ramps lie in the west, and the north is low
 * ground.
 */
export function buildDemoTerrain(): Terrain {
  return { heightfield: RAMAT_MENASHE, objects: RAMAT_MENASHE_OBJECTS, roads: RAMAT_MENASHE_ROADS };
}

/**
 * A small hotseat demonstration scenario: a BLUE infantry platoon in the low
 * ground to the north attacking a RED position on the town's edge to the
 * south, held by two squads and a tank. The hill's shoulder hides the slope
 * below it from every RED position, so BLUE's first bound is unseen and it
 * comes into view as it reaches the shoulder, to the forward squad, the flank
 * squad on the north-east ridge and the tank alike. One lesson the ground
 * teaches on its own: the tank's hatches see over the shoulder to the far low
 * ground where BLUE starts, 440 m off, and not the slope just below it where
 * the attack actually climbs — dead ground is nearer than it looks.
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
  game.addUnit(makeInfantry("BLUE-3", "BLUE", "squad", { x: 460, y: 70 }, 8, "כיתה 3"));
  game.addUnit(makeCommandGroup("BLUE-HQ", "BLUE", "platoon", { x: 400, y: 20 }, 3, 'חפ"ק מ"מ'));

  // RED — defending the town's edge. The forward squad lies on the shoulder in
  // the open and prepared its position before the battle, so it starts fully
  // camouflaged (rules decision 12): BLUE will not find it by looking. The
  // second squad holds the ridge on the flank; the tank stands in a street on
  // the hilltop behind the crest, the command group in one of the houses.
  const ambush = makeInfantry("RED-1", "RED", "squad", { x: 380, y: 336 }, 6, "מחלקה א'/1");
  ambush.camouflaging = true;
  ambush.camouflageTurns = CAMOUFLAGE_TURNS_AT_MAX;
  // Set before it is added: addUnit records the force as it stands, so a unit
  // dressed after the fact would replay undressed.
  game.addUnit(ambush);
  game.addUnit(makeInfantry("RED-2", "RED", "squad", { x: 700, y: 260 }, 8, "מחלקה א'/2"));
  game.addUnit(makeVehicle("RED-TANK", "RED", { x: 520, y: 500 }, 270, "טנק"));
  game.addUnit(makeCommandGroup("RED-HQ", "RED", "platoon", { x: 436, y: 599 }, 3, 'חפ"ק מ"מ'));

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
