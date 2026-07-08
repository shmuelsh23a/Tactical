import { Rng } from "./rng.js";
import { roll } from "./dice.js";
import type { SmokeScreen, Unit } from "./types.js";
import { CASUALTY_RULES } from "./data/casualties.js";
import { refreshUnitStatus } from "./units.js";

/**
 * Advance a wounded soldier's bleeding: from 5 nq"p the wound worsens by 1d4
 * every 5 turns. Returns total worsening damage applied across the force.
 */
export function applyBleeding(rng: Rng, units: Unit[], currentTurn: number): number {
  let applied = 0;
  for (const unit of units) {
    if (!unit.soldiers) continue;
    for (const s of unit.soldiers) {
      if (s.neutralized) continue;
      if (s.bleedingSinceTurn == null) continue;
      const elapsed = currentTurn - s.bleedingSinceTurn;
      if (elapsed > 0 && elapsed % CASUALTY_RULES.bleedingIntervalTurns === 0) {
        const dmg = roll(rng, CASUALTY_RULES.bleedingWorsenDice);
        s.damagePoints += dmg;
        applied += dmg;
        if (s.damagePoints >= CASUALTY_RULES.neutralizeThreshold) s.neutralized = true;
      }
    }
    refreshUnitStatus(unit);
  }
  return applied;
}

/** Dissipate smoke screens by one turn; returns the survivors. */
export function decaySmoke(smoke: SmokeScreen[]): SmokeScreen[] {
  for (const s of smoke) s.turnsRemaining -= 1;
  return smoke.filter((s) => s.turnsRemaining > 0);
}

/**
 * End-of-turn unit upkeep:
 *   - a unit that was hit this turn cannot move next turn,
 *   - a unit that neither moved nor fired this turn is in full cover next turn,
 *   - per-turn flags reset for the next turn.
 */
export function endTurnUnitUpkeep(units: Unit[]): void {
  for (const u of units) {
    u.movementBlocked = u.hitThisTurn;
    u.inFullCover = u.movedThisTurn === 0 && !u.firedThisTurn;
    u.movedThisTurn = 0;
    u.firedThisTurn = false;
    u.hitThisTurn = false;
    u.underFire = false;
  }
}
