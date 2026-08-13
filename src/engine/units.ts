import type { CrewMember, Soldier, TankPart, Unit, VehicleState } from "./types.js";
import { CASUALTY_RULES } from "./data/casualties.js";
import { MOBILITY_THRESHOLDS } from "./data/armor.js";
import { Rng } from "./rng.js";

/** Number of soldiers in an infantry unit that are still in the fight. */
export function fitSoldiers(unit: Unit): number {
  if (!unit.soldiers) return 0;
  return unit.soldiers.filter((s) => !s.neutralized).length;
}

/** Original (full-strength) soldier count, used for the 50%-attrition rule. */
export function fullStrength(unit: Unit): number {
  return unit.soldiers?.length ?? 0;
}

/**
 * Apply `damage` points to a single soldier, neutralizing at the threshold.
 * Returns whether the soldier became newly neutralized.
 */
export function damageSoldier(soldier: Soldier, damage: number, currentTurn: number): boolean {
  if (soldier.neutralized) return false;
  const wasBelowBleed = soldier.damagePoints < CASUALTY_RULES.bleedingThreshold;
  soldier.damagePoints += damage;
  if (wasBelowBleed && soldier.damagePoints >= CASUALTY_RULES.bleedingThreshold) {
    soldier.bleedingSinceTurn = currentTurn;
  }
  if (soldier.damagePoints >= CASUALTY_RULES.neutralizeThreshold) {
    soldier.neutralized = true;
    return true;
  }
  return false;
}

/**
 * Choose which soldier in a unit absorbs an incoming hit.
 *
 * When a force (not a specific man) is targeted, the casualty is **random**
 * among the fit soldiers. A caller may override this by passing
 * `preferredId` — the player deliberately targeting a particular soldier —
 * in which case that soldier is chosen if still fit. Returns undefined if the
 * unit has no fit soldiers.
 */
export function selectHitSoldier(
  unit: Unit,
  rng: Rng,
  preferredId?: string,
): Soldier | undefined {
  if (!unit.soldiers) return undefined;
  const fit = unit.soldiers.filter((s) => !s.neutralized);
  if (fit.length === 0) return undefined;
  if (preferredId) {
    const chosen = fit.find((s) => s.id === preferredId);
    if (chosen) return chosen;
  }
  return fit[rng.int(0, fit.length - 1)];
}

/**
 * Apply damage points to a vehicle component and flag a mobility kill once the
 * component's threshold (engine 8 / track 4 nq"p) is reached. Returns true if
 * this hit caused the mobility kill.
 */
export function applyComponentDamage(
  vehicle: VehicleState,
  part: TankPart,
  amount: number,
): boolean {
  vehicle.componentDamage[part] += amount;
  const threshold = (MOBILITY_THRESHOLDS as Partial<Record<TankPart, number>>)[part];
  if (threshold != null && vehicle.componentDamage[part] >= threshold && !vehicle.mobilityKilled) {
    vehicle.mobilityKilled = true;
    return true;
  }
  return false;
}

/**
 * Re-evaluate whole-unit neutralization. A force attrited by >= 50% of its
 * original strength is neutralized and may only retreat.
 */
export function refreshUnitStatus(unit: Unit): void {
  if (unit.soldiers) {
    // Soldier-bearing units (infantry and command groups).
    const full = fullStrength(unit);
    if (full === 0) return;
    const lost = full - fitSoldiers(unit);
    if (lost / full >= CASUALTY_RULES.forceAttritionNeutralizeFraction) {
      unit.neutralized = true;
      unit.canOnlyRetreat = true;
    }
  } else if (unit.vehicle) {
    if (unit.vehicle.destroyed) {
      unit.neutralized = true;
      unit.canOnlyRetreat = false;
    }
    const liveCrew = unit.vehicle.crew.filter((c) => !c.neutralized).length;
    if (liveCrew === 0) unit.neutralized = true;
  }
}

/** Apply damage points to a crew member, neutralizing at the threshold. */
export function damageCrew(crew: CrewMember, damage: number): boolean {
  if (crew.neutralized) return false;
  crew.damagePoints += damage;
  if (crew.damagePoints >= CASUALTY_RULES.neutralizeThreshold) {
    crew.neutralized = true;
    return true;
  }
  return false;
}

/** Convenience constructor for an infantry unit at full strength. */
export function makeInfantry(
  id: string,
  side: Unit["side"],
  echelon: Unit["echelon"],
  position: Unit["position"],
  soldierCount: number,
  name = id,
): Unit {
  const soldiers: Soldier[] = Array.from({ length: soldierCount }, (_, i) => ({
    id: `${id}-s${i + 1}`,
    damagePoints: 0,
    neutralized: false,
  }));
  return {
    id,
    name,
    side,
    echelon,
    kind: "infantry",
    position,
    soldiers,
    neutralized: false,
    canOnlyRetreat: false,
    movedThisTurn: 0,
    ranThisTurn: false,
    firedThisTurn: false,
    hitThisTurn: false,
    movementBlocked: false,
    underFire: false,
    stationaryTurns: 0,
    cover: "none",
    baseCover: "none",
    camouflaging: false,
    camouflageTurns: 0,
  };
}

/**
 * Convenience constructor for a command group (חפ"ק). It carries a small
 * number of personnel so it can be targeted and take casualties, and its
 * `echelon` is the level it commands (e.g. a platoon HQ commanding squads).
 */
export function makeCommandGroup(
  id: string,
  side: Unit["side"],
  echelon: Unit["echelon"],
  position: Unit["position"],
  personnel = 3,
  name = id,
): Unit {
  const soldiers: Soldier[] = Array.from({ length: personnel }, (_, i) => ({
    id: `${id}-s${i + 1}`,
    damagePoints: 0,
    neutralized: false,
  }));
  return {
    id,
    name,
    side,
    echelon,
    kind: "command",
    position,
    soldiers,
    neutralized: false,
    canOnlyRetreat: false,
    movedThisTurn: 0,
    ranThisTurn: false,
    firedThisTurn: false,
    hitThisTurn: false,
    movementBlocked: false,
    underFire: false,
    stationaryTurns: 0,
    cover: "none",
    baseCover: "none",
    camouflaging: false,
    camouflageTurns: 0,
  };
}

/** Convenience constructor for an armoured vehicle. */
export function makeVehicle(
  id: string,
  side: Unit["side"],
  position: Unit["position"],
  facing = 0,
  name = id,
): Unit {
  const crew: CrewMember[] = (
    ["commander", "gunner", "loader", "driver"] as const
  ).map((role) => ({ id: `${id}-${role}`, role, damagePoints: 0, neutralized: false }));
  return {
    id,
    name,
    side,
    echelon: "squad",
    kind: "vehicle",
    position,
    vehicle: {
      componentDamage: { turret: 0, hullFront: 0, hullRear: 0, track: 0, driver: 0 },
      crew,
      mobilityKilled: false,
      destroyed: false,
      facing,
    },
    neutralized: false,
    canOnlyRetreat: false,
    movedThisTurn: 0,
    ranThisTurn: false,
    firedThisTurn: false,
    hitThisTurn: false,
    movementBlocked: false,
    underFire: false,
    stationaryTurns: 0,
    cover: "none",
    baseCover: "none",
    camouflaging: false,
    camouflageTurns: 0,
  };
}
