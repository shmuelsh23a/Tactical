import { describe, it, expect } from "vitest";
import { Game } from "./game.js";
import { makeInfantry } from "./units.js";
import { replayGame } from "./recording.js";
import { FLAT_GROUND } from "./terrain.js";

/**
 * Fire on the move (proposed, docs/balance.md, thirty-seventh round): a force
 * that moved this turn fires its small arms at `fireOnTheMove` of its hit
 * chance. Off (1) unless set.
 */
function shot(fireOnTheMove: number | undefined, move: boolean) {
  const g = new Game({ lethality: "document", seed: 3, enforceC2: false, terrain: FLAT_GROUND, ...(fireOnTheMove ? { fireOnTheMove } : {}) });
  const blue = g.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", { x: 0, y: 300 }, 8));
  const red = g.addUnit(makeInfantry("RED-1", "RED", "squad", { x: 0, y: 0 }, 8));
  g.beginTurn();
  g.advanceToPhase("movement");
  if (move) g.moveUnit(blue.id, { x: 0, y: 280 });
  g.advanceToPhase("combat");
  return { g, result: g.fire(blue.id, red.id, { weapon: "smallArms" }) };
}

describe("fire on the move", () => {
  it("halves the hit chance of a force that moved, at 0.5, and nothing else", () => {
    const still = shot(0.5, false).result.hitChance;
    const moved = shot(0.5, true).result.hitChance;
    const movedUnset = shot(undefined, true).result.hitChance;
    expect(still).toBeGreaterThan(0);
    expect(moved).toBeCloseTo(movedUnset * 0.5, 10);
    expect(shot(undefined, false).result.hitChance).toBe(still);
  });

  it("is kept in the recording, and a replay plays it the same", () => {
    const { g } = shot(0.5, true);
    const rec = g.toRecording();
    expect(rec.fireOnTheMove).toBe(0.5);
    expect(replayGame(rec).fireOnTheMove).toBe(0.5);
    expect(shot(undefined, true).g.toRecording().fireOnTheMove).toBeUndefined();
  });
});
