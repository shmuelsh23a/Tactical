import { Rng } from "../rng.js";
import { distance, type Point } from "../geometry.js";
import type { Mine, Unit } from "../types.js";
import { MOVEMENT_PROFILES } from "../data/movement.js";
import { UAV_PROFILES } from "../data/uav.js";
import type { MovementMode } from "../types.js";

export interface DetectionResult {
  spottedUnitIds: string[];
  foundMineIds: string[];
}

/**
 * Detection rolls made by a moving unit (תנועה). Visible enemy within 300 m
 * may be spotted (70% normal / 50% running); mines/IEDs/hidden enemy within
 * 20 m may be found (30% / 5%). A `hasLineOfSight` predicate can gate visible
 * detection on terrain; by default sight is assumed clear.
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
    if (enemy.neutralized && enemy.kind === "vehicle" && enemy.vehicle?.destroyed) continue;
    const d = distance(mover.position, enemy.position);
    if (d <= profile.visibleDetectRange && hasLineOfSight(mover.position, enemy.position)) {
      if (rng.chance(profile.visibleDetectChance)) spottedUnitIds.push(enemy.id);
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
      if (enemy.neutralized && enemy.kind === "vehicle" && enemy.vehicle?.destroyed) continue;
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
