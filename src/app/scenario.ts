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
