import { Rng } from "../rng.js";
import { segmentIntersectsCircle, type Point } from "../geometry.js";
import type { Mine, MovementMode, Unit } from "../types.js";
import { EXPLOSIVES } from "../data/explosives.js";
import { resolveBlast, type BlastResult } from "./explosives.js";

/**
 * How close a moving force has to pass to set a charge off (מטען). The document
 * gives the trigger as "דריכה" — stepping on it — but no distance, and a token
 * here is a whole squad spread over some frontage rather than one man. Ten
 * metres is half the 20 m at which a charge can be *spotted*, so there is a
 * band where a charge is found without ever being trodden on — which is what
 * the search roll buys. Author-confirmed 2026-08-16; see rules decision 10.
 */
export const MINE_TRIGGER_RADIUS_M = 10;

/**
 * Whether a force moving at `mode` **searches the ground it crossed**, or only
 * gets a look at where it halted (rules decision 10, author 2026-08-16).
 *
 * A walking force sweeps its route: the document's 30% is rolled for every
 * charge within 20 m of the path it walked, which is what makes the gait a real
 * decision over mined ground. A force at a run does not look at all on the way
 * — its 5% applies only around where the bound ends.
 *
 * This is the other half of {@link MINE_TRIGGER_RADIUS_M}: charges are
 * triggered along the whole path either way, so a runner is tested against
 * ground it never searched. That is the gamble.
 */
export function sweepsPathForCharges(mode: MovementMode): boolean {
  return mode === "normal";
}

/** Explosives-table key for each kind of emplaced charge. */
const MINE_WEAPON: Record<Mine["type"], string> = {
  antiPersonnel: "apMine",
  antiTank: "atMine",
};

export interface MineDetonation {
  mineId: string;
  type: Mine["type"];
  position: Point;
  /** The charge fired — it may be triggered and still fail its activation roll. */
  activated: boolean;
  blast?: BlastResult;
}

/**
 * Resolve the charges a force runs into while moving from `from` to `to`.
 *
 * The whole path is tested, not just the destination, so a bound cannot vault
 * over a minefield. A charge already found (`detected`) is stepped around, and
 * a force never triggers its own side's charges. One that fires is spent and
 * returned in `spent` for the caller to remove; one whose activation roll fails
 * stays armed and may catch someone later.
 */
export function triggerMines(
  rng: Rng,
  mover: Unit,
  from: Point,
  to: Point,
  mines: readonly Mine[],
  allUnits: Unit[],
  turn = 0,
): { detonations: MineDetonation[]; spent: string[] } {
  const detonations: MineDetonation[] = [];
  const spent: string[] = [];

  for (const mine of mines) {
    if (!mine.armed || mine.detected || mine.side === mover.side) continue;
    if (!segmentIntersectsCircle(from, to, mine.position, MINE_TRIGGER_RADIUS_M)) continue;

    const weaponKey = MINE_WEAPON[mine.type];
    const weapon = EXPLOSIVES[weaponKey];
    const activated = rng.chance(weapon?.activationChance ?? 1);
    if (!activated) {
      detonations.push({ mineId: mine.id, type: mine.type, position: mine.position, activated });
      continue;
    }

    detonations.push({
      mineId: mine.id,
      type: mine.type,
      position: mine.position,
      activated,
      blast: resolveBlast(rng, weaponKey, mine.position, allUnits, turn),
    });
    spent.push(mine.id);
  }

  return { detonations, spent };
}
