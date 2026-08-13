import {
  CAMOUFLAGE_TURNS_AT_MAX,
  Game,
  makeCommandGroup,
  makeInfantry,
  makeVehicle,
} from "../engine/index.js";

export interface Scenario {
  game: Game;
  /** Map extent in metres. */
  mapWidth: number;
  mapHeight: number;
  title: string;
}

/**
 * A small hotseat demonstration scenario: a BLUE infantry platoon advancing on
 * a RED position held by two squads and a tank. Distances are set so contact
 * is made within a couple of bounds (fog-of-war reveals the enemy on approach).
 */
export function buildDemoScenario(seed = 2026): Scenario {
  // Played with the knowledge model on: each side sees what it has detected —
  // the document's own rolls — rather than everything within a radius.
  const game = new Game({ seed, trackIntel: true });

  // BLUE — a platoon attacking from the south. The player is the platoon
  // leader: they manoeuvre the squads, and control their own command group.
  game.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", { x: 250, y: 650 }, 8, "כיתה 1"));
  game.addUnit(makeInfantry("BLUE-2", "BLUE", "squad", { x: 450, y: 680 }, 8, "כיתה 2"));
  game.addUnit(makeInfantry("BLUE-3", "BLUE", "squad", { x: 650, y: 650 }, 8, "כיתה 3"));
  game.addUnit(makeCommandGroup("BLUE-HQ", "BLUE", "platoon", { x: 450, y: 745 }, 3, 'חפ"ק מ"מ'));

  // RED — defending in the north. The forward squad prepared its position
  // before the battle, so it starts fully camouflaged (rules decision 12): BLUE
  // will not find it by looking. The rest have to dig in as the game runs.
  const ambush = makeInfantry("RED-1", "RED", "squad", { x: 350, y: 220 }, 6, "מחלקה א'/1");
  ambush.camouflaging = true;
  ambush.camouflageTurns = CAMOUFLAGE_TURNS_AT_MAX;
  // Set before it is added: addUnit records the force as it stands, so a unit
  // dressed after the fact would replay undressed.
  game.addUnit(ambush);
  game.addUnit(makeInfantry("RED-2", "RED", "squad", { x: 600, y: 200 }, 8, "מחלקה א'/2"));
  game.addUnit(makeVehicle("RED-TANK", "RED", { x: 480, y: 130 }, 270, "טנק"));
  game.addUnit(makeCommandGroup("RED-HQ", "RED", "platoon", { x: 480, y: 90 }, 3, 'חפ"ק מ"מ'));

  // RED has mined the approach: anti-personnel charges across the likely lanes,
  // with an anti-tank charge on the open ground in the centre. BLUE only learns
  // where they are by spotting them on the way in — or by walking into one.
  for (const position of [
    { x: 260, y: 400 },
    { x: 340, y: 380 },
    { x: 470, y: 420 },
    { x: 620, y: 390 },
  ]) {
    game.addMine({ side: "RED", type: "antiPersonnel", position, armed: true, detected: false });
  }
  game.addMine({
    side: "RED",
    type: "antiTank",
    position: { x: 545, y: 405 },
    armed: true,
    detected: false,
  });

  return { game, mapWidth: 900, mapHeight: 800, title: "תרגיל הדגמה — מגע ראשון" };
}
