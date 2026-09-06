import { Rng } from "./rng.js";
import { roll } from "./dice.js";
import type { SmokeScreen, Unit } from "./types.js";
import type { Point } from "./geometry.js";
import { CASUALTY_RULES } from "./data/casualties.js";
import { DIG_IN } from "./data/concealment.js";
import type { CoverState } from "./data/directFire.js";
import { refreshUnitStatus } from "./units.js";
import { betterCover } from "./terrain.js";

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
 * The protection a force has dug itself, after `stationaryTurns` in place.
 *
 * A force that stays put starts work after the third turn and improves a level
 * every two turns, up to the protection of a force that was behind cover to
 * begin with (rules decision 12). Nothing is dug in less time than that, and a
 * force that gets up and moves leaves the hole behind.
 */
export function digInCover(stationaryTurns: number): CoverState {
  const working = stationaryTurns - DIG_IN.startsAfterTurns;
  if (working < DIG_IN.turnsPerLevel) return "none";
  const level = Math.floor(working / DIG_IN.turnsPerLevel);
  return DIG_IN.levels[Math.min(level, DIG_IN.levels.length) - 1] ?? "none";
}

/**
 * End-of-turn unit upkeep:
 *   - a unit that was hit this turn cannot move next turn,
 *   - a unit that stayed put has another turn in position: it works on its
 *     camouflage if it was told to, and digs in once it has been there long
 *     enough. One that moved loses both (rules decision 12),
 *   - per-turn flags reset for the next turn.
 *
 * `groundCover` is what the map offers at a point — the object a force is in
 * or against (rules decision 15). A game with no map offers nothing.
 */
export function endTurnUnitUpkeep(
  units: Unit[],
  groundCover: (at: Point) => CoverState = () => "none",
): void {
  for (const u of units) {
    u.movementBlocked = u.hitThisTurn;

    if (u.movedThisTurn === 0) {
      u.stationaryTurns += 1;
      if (u.camouflaging) u.camouflageTurns += 1;
    } else {
      // Up and moving: the position is abandoned and the camouflage with it.
      u.stationaryTurns = 0;
      u.camouflageTurns = 0;
      u.camouflaging = false;
    }
    // Whatever the ground already gave it — a prepared position, or the
    // object it stands against — or better if it has dug.
    u.cover = betterCover(
      betterCover(u.baseCover, groundCover(u.position)),
      digInCover(u.stationaryTurns),
    );

    u.movedThisTurn = 0;
    u.ranThisTurn = false;
    u.firedThisTurn = false;
    u.hitThisTurn = false;
    u.underFire = false;
  }
}
