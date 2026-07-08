import { Game, makeCommandGroup, makeInfantry, makeVehicle } from "../engine/index.js";

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
  const game = new Game({ seed });

  // BLUE — a platoon attacking from the south. The player is the platoon
  // leader: they manoeuvre the squads, and control their own command group.
  game.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", { x: 250, y: 650 }, 8, "כיתה 1"));
  game.addUnit(makeInfantry("BLUE-2", "BLUE", "squad", { x: 450, y: 680 }, 8, "כיתה 2"));
  game.addUnit(makeInfantry("BLUE-3", "BLUE", "squad", { x: 650, y: 650 }, 8, "כיתה 3"));
  game.addUnit(makeCommandGroup("BLUE-HQ", "BLUE", "platoon", { x: 450, y: 745 }, 3, 'חפ"ק מ"מ'));

  // RED — defending in the north.
  game.addUnit(makeInfantry("RED-1", "RED", "squad", { x: 350, y: 220 }, 6, "מחלקה א'/1"));
  game.addUnit(makeInfantry("RED-2", "RED", "squad", { x: 600, y: 200 }, 8, "מחלקה א'/2"));
  game.addUnit(makeVehicle("RED-TANK", "RED", { x: 480, y: 130 }, 270, "טנק"));
  game.addUnit(makeCommandGroup("RED-HQ", "RED", "platoon", { x: 480, y: 90 }, 3, 'חפ"ק מ"מ'));

  return { game, mapWidth: 900, mapHeight: 800, title: "תרגיל הדגמה — מגע ראשון" };
}
