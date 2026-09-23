import type { CrewMember, Soldier, TankPart, Unit, VehicleState } from "./types.js";
import { CASUALTY_RULES, WOUND_SEVERITY } from "./data/casualties.js";
import { BULLET_DIE, HE_SEVERITY_SHIFT, type WoundModel } from "./data/variants.js";
import { roll } from "./dice.js";
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
export function damageSoldier(
  soldier: Soldier,
  damage: number,
  currentTurn: number,
  outAt: number = CASUALTY_RULES.neutralizeThreshold,
): boolean {
  if (soldier.neutralized) return false;
  const wasBelowBleed = soldier.damagePoints < CASUALTY_RULES.bleedingThreshold;
  soldier.damagePoints += damage;
  if (wasBelowBleed && soldier.damagePoints >= CASUALTY_RULES.bleedingThreshold) {
    soldier.bleedingSinceTurn = currentTurn;
  }
  if (soldier.damagePoints >= outAt) {
    soldier.neutralized = true;
    return true;
  }
  return false;
}

/**
 * One small-arms hit landing on `target`: how bad it is, and on whom (rules
 * decision 26). A d10 decides a light wound, a serious one or a death, in
 * place of the document's 1d4 of damage — one die either way. The severity is
 * rolled before the victim is chosen, as the damage die always was.
 */
export function landHit(
  rng: Rng,
  target: Unit,
  turn: number,
  preferredId?: string,
): { damage: number; casualty: boolean } {
  return woundHit(rng, target, turn, null, undefined, preferredId);
}

/**
 * One hit of any kind landing on `target` — a bullet (`die` null) or an
 * explosive's fragment (`die` its damage die) — resolved under the wound model
 * in play (data/variants.ts, on trial). Absent, the rules as they stand: a
 * bullet takes the severity roll (decision 26), an explosive its document die.
 * Records on a man it puts out what did it (`outBy`).
 */
export function woundHit(
  rng: Rng,
  target: Unit,
  turn: number,
  die: string | null,
  model?: WoundModel,
  preferredId?: string,
): { damage: number; casualty: boolean } {
  const cause = die == null ? "smallArms" : "explosive";
  let hit: { damage: number; casualty: boolean; victim?: Soldier };
  if (model == null && die == null) {
    hit = severityHit(rng, target, turn, 0, preferredId);
  } else if (model == null || model === "dice") {
    // The document's dice (option B out of the fight at 5; the rules at 8).
    const damage = roll(rng, die ?? BULLET_DIE);
    const victim = selectHitSoldier(target, rng, preferredId);
    const outAt = model === "dice" ? CASUALTY_RULES.bleedingThreshold : CASUALTY_RULES.neutralizeThreshold;
    hit = victim ? { damage, casualty: damageSoldier(victim, damage, turn, outAt), victim } : { damage: 0, casualty: false };
  } else {
    const shift = model === "flat" || die == null ? 0 : HE_SEVERITY_SHIFT[die];
    if (shift == null) throw new Error(`No severity shift for ${die}`);
    hit = severityHit(rng, target, turn, shift, preferredId);
  }
  if (hit.casualty && hit.victim) hit.victim.outBy = cause;
  return { damage: hit.damage, casualty: hit.casualty };
}

/** The severity roll (decision 26), `shift` added to the d10 and capped at 10. */
function severityHit(
  rng: Rng,
  target: Unit,
  turn: number,
  shift: number,
  preferredId?: string,
): { damage: number; casualty: boolean; victim?: Soldier } {
  const severity = WOUND_SEVERITY;
  const d10 = Math.min(10, rng.die(10) + shift);
  const kind = d10 <= severity.light ? "light" : d10 <= severity.light + severity.serious ? "serious" : "killed";
  const victim = selectHitSoldier(target, rng, preferredId);
  if (!victim) return { damage: 0, casualty: false };
  if (kind === "light") {
    const out = damageSoldier(victim, severity.lightWoundPoints, turn);
    victim.wound = out ? "serious" : "light";
    return { damage: severity.lightWoundPoints, casualty: out, victim };
  }
  const floor = kind === "killed" ? CASUALTY_RULES.neutralizeThreshold : CASUALTY_RULES.bleedingThreshold;
  const damage = Math.max(0, floor - victim.damagePoints);
  if (victim.damagePoints < CASUALTY_RULES.bleedingThreshold) victim.bleedingSinceTurn = turn;
  victim.damagePoints = Math.max(victim.damagePoints, floor);
  victim.wound = kind;
  victim.neutralized = true;
  return { damage, casualty: true, victim };
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
    scouting: false,
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
    scouting: false,
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
    scouting: false,
    camouflageTurns: 0,
  };
}
