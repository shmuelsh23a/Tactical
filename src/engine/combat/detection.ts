import { Rng } from "../rng.js";
import { distance, type Point } from "../geometry.js";
import type { Mine, Unit } from "../types.js";
import { MOVEMENT_PROFILES } from "../data/movement.js";
import {
  CAMOUFLAGE,
  COVER_CONCEALMENT,
  OBSERVATION,
  SCOUTING,
} from "../data/concealment.js";
import { UAV_PROFILES } from "../data/uav.js";
import type { MovementMode } from "../types.js";

export interface DetectionResult {
  spottedUnitIds: string[];
  foundMineIds: string[];
}

/** How much camouflage a force has managed to bank, as a detection penalty. */
export function camouflageBonus(unit: Unit): number {
  const steps = Math.floor(unit.camouflageTurns / CAMOUFLAGE.turnsPerStep);
  return Math.min(CAMOUFLAGE.max, steps * CAMOUFLAGE.perStep);
}

/**
 * A force that has not moved this turn is **hidden** (rules decision 12): it is
 * looked for in the document's 20 m / 30% band rather than the 300 m / 70% one.
 * That is what makes an ambush possible — and what a moving force gives up.
 */
export function isHidden(unit: Unit): boolean {
  return unit.movedThisTurn === 0;
}

/** The chance and the range at which `observer` may pick `target` up this turn. */
export function detectionChance(
  observer: Unit,
  target: Unit,
  observerGait?: MovementMode,
): { chance: number; range: number } {
  // The observer's own figures: its gait if it is on the move, otherwise the
  // walking figures plus the bonus for watching rather than moving.
  const profile = MOVEMENT_PROFILES[observerGait ?? "normal"];
  const watching = observerGait ? 0 : OBSERVATION.stationaryBonus;

  // Looking rather than covering ground.
  const scouting = observer.scouting ? SCOUTING.detectionBonus : 0;

  const hidden = isHidden(target);
  const base = hidden ? profile.hiddenDetectChance : profile.visibleDetectChance;
  const range = hidden ? profile.hiddenDetectRange : profile.visibleDetectRange;

  // What the target is doing about being seen. A force at a run is louder and
  // more conspicuous; cover and camouflage work the other way.
  const exposure = target.ranThisTurn ? OBSERVATION.runningExposure : 0;
  const concealment = COVER_CONCEALMENT[target.cover] + camouflageBonus(target);

  // …but never past the point where a squad is harder to find than a charge
  // buried in the ground. Camouflage can cancel an observer's advantages; it
  // cannot make a force impossible to find. A scout keeps its edge even here —
  // the floor is what it is *plus* what scouting is worth (rules decision 12).
  const floor =
    CAMOUFLAGE.floorIsConcealedChargeChance && camouflageBonus(target) > 0
      ? profile.hiddenDetectChance + scouting
      : 0;

  const chance = base + watching + scouting + exposure - concealment;
  return { chance: Math.min(1, Math.max(floor, chance)), range };
}

/** Whether a force is in any state to be observing at all. */
function canObserve(unit: Unit): boolean {
  if (unit.neutralized) return false;
  return !(unit.kind === "vehicle" && unit.vehicle?.destroyed);
}

/** Whether a force can still be found — a destroyed vehicle is not a contact. */
function isFindable(unit: Unit): boolean {
  return !(unit.neutralized && unit.kind === "vehicle" && unit.vehicle?.destroyed);
}

/**
 * Detection rolls made by a unit that has just moved (תנועה). It looks for the
 * enemy — visible at 300 m, hidden at 20 m — at its gait's figures, and for
 * charges within 20 m. A `hasLineOfSight` predicate gates sight on smoke and,
 * later, on terrain.
 */
export function detectByMovement(
  rng: Rng,
  mover: Unit,
  mode: MovementMode,
  enemies: Unit[],
  mines: Mine[],
  hasLineOfSight: (from: Point, to: Point) => boolean = () => true,
): DetectionResult {
  const profile = MOVEMENT_PROFILES[mode];
  const spottedUnitIds: string[] = [];
  const foundMineIds: string[] = [];

  for (const enemy of enemies) {
    if (!isFindable(enemy)) continue;
    const { chance, range } = detectionChance(mover, enemy, mode);
    const d = distance(mover.position, enemy.position);
    if (d <= range && hasLineOfSight(mover.position, enemy.position)) {
      if (rng.chance(chance)) spottedUnitIds.push(enemy.id);
    }
  }

  for (const mine of mines) {
    if (mine.detected) continue;
    const d = distance(mover.position, mine.position);
    if (d <= profile.hiddenDetectRange && rng.chance(profile.hiddenDetectChance)) {
      mine.detected = true;
      foundMineIds.push(mine.id);
    }
  }

  return { spottedUnitIds, foundMineIds };
}

/** One force picking another up while watching its sector. */
export interface Observation {
  observerId: string;
  targetId: string;
}

/**
 * What every force in position sees this turn (rules decision 12). A force that
 * has not moved watches continuously — it does not need the enemy to walk into
 * it — and is that much better at it for not being on the move. This is the
 * other half of {@link detectByMovement}: between them, a force that moves is
 * rolled for by every enemy watching, and a force that stays put rolls itself.
 *
 * Movers are skipped: they had their look during their bound.
 */
export function observeFromPosition(
  rng: Rng,
  units: Unit[],
  hasLineOfSight: (from: Point, to: Point) => boolean = () => true,
): Observation[] {
  const observations: Observation[] = [];
  for (const observer of units) {
    if (observer.movedThisTurn > 0) continue;
    if (!canObserve(observer)) continue;
    for (const target of units) {
      if (target.side === observer.side || !isFindable(target)) continue;
      const { chance, range } = detectionChance(observer, target);
      if (distance(observer.position, target.position) > range) continue;
      if (!hasLineOfSight(observer.position, target.position)) continue;
      if (rng.chance(chance)) {
        observations.push({ observerId: observer.id, targetId: target.id });
      }
    }
  }
  return observations;
}

/**
 * Detection within a UAV/drone footprint (כטב"מ / רחפן). Moving or visible
 * ground targets inside the footprint are detected automatically; emplaced
 * charges are found with the asset's charge-finding probability.
 */
export function detectByUav(
  rng: Rng,
  uavKey: string,
  footprintCenter: Point,
  enemies: Unit[],
  mines: Mine[],
): DetectionResult {
  const profile = UAV_PROFILES[uavKey];
  if (!profile) throw new Error(`Unknown UAV: ${uavKey}`);
  const halfW = profile.footprint.width / 2;
  const halfH = profile.footprint.height / 2;
  const inFootprint = (p: Point) =>
    Math.abs(p.x - footprintCenter.x) <= halfW &&
    Math.abs(p.y - footprintCenter.y) <= halfH;

  const spottedUnitIds: string[] = [];
  const foundMineIds: string[] = [];

  if (profile.autoDetectsVisible) {
    for (const enemy of enemies) {
      if (!isFindable(enemy)) continue;
      if (inFootprint(enemy.position)) spottedUnitIds.push(enemy.id);
    }
  }
  for (const mine of mines) {
    if (mine.detected) continue;
    if (inFootprint(mine.position) && rng.chance(profile.findChargeChance)) {
      mine.detected = true;
      foundMineIds.push(mine.id);
    }
  }

  return { spottedUnitIds, foundMineIds };
}
