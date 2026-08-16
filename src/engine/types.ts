import type { Point } from "./geometry.js";
import type { SmokeSource } from "./data/smoke.js";
import type { CoverState } from "./data/directFire.js";

/** The two combatant sides. The umpire (מנחה) is not a combatant. */
export type Side = "RED" | "BLUE";

/** Echelon levels referenced by the command-and-control table (פו"ש). */
export type Echelon = "squad" | "platoon" | "company" | "battalion" | "brigade";

/** Movement gait chosen for a unit's move action. */
export type MovementMode = "normal" | "run";

/**
 * A single dismounted soldier inside an infantry unit. Damage is tracked in
 * "damage points" (נק"פ) per the casualty rules:
 *   - from 5 nq"p the wound worsens by 1d4 every 5 turns,
 *   - at 8 nq"p the soldier is neutralized.
 */
export interface Soldier {
  id: string;
  damagePoints: number;
  neutralized: boolean;
  /** Turn index on which this soldier first reached the bleeding threshold. */
  bleedingSinceTurn?: number;
}

/** Parts of an armoured vehicle, per the armour-damage table (טבלת נזק שריון). */
export type TankPart = "turret" | "hullFront" | "hullRear" | "track" | "driver";

/** Crew positions inside an armoured vehicle. */
export interface CrewMember {
  id: string;
  role: "commander" | "gunner" | "loader" | "driver";
  damagePoints: number;
  neutralized: boolean;
}

/** Per-component damage state of an armoured vehicle. */
export interface VehicleState {
  /** Accumulated damage points on each hit location that tracks nq"p. */
  componentDamage: Record<TankPart, number>;
  crew: CrewMember[];
  mobilityKilled: boolean; // engine or track disabled
  destroyed: boolean; // catastrophic (e.g. ammo) kill
  /** Heading in degrees (0 = +x). Used to resolve front/rear hits later. */
  facing: number;
}

/**
 * A playable force/unit. Infantry units carry `soldiers`; vehicles carry
 * `vehicle`. A unit occupies a single map point at the tactical scale used.
 */
export interface Unit {
  id: string;
  name: string;
  side: Side;
  echelon: Echelon;
  /**
   * "infantry" / "vehicle" are fighting forces. "command" is the player's own
   * command group (חפ"ק): a movable element that serves as the order-frequency
   * reference for the C2 (פו"ש) rules and can be targeted, but is not a primary
   * fighting force. Command groups carry `soldiers` so they can take casualties.
   */
  kind: "infantry" | "vehicle" | "command";
  position: Point;

  soldiers?: Soldier[];
  vehicle?: VehicleState;

  /** Whole-unit status. */
  neutralized: boolean;
  /** Can only retreat once neutralized by the 50%-attrition rule. */
  canOnlyRetreat: boolean;

  // --- per-turn / cross-turn flags consumed by movement & fire rules ---
  /** Metres moved during the current turn. */
  movedThisTurn: number;
  /** True if any of this turn's movement was made at a run (easier to spot). */
  ranThisTurn: boolean;
  /** True if the unit fired/acted during the current turn. */
  firedThisTurn: boolean;
  /** True if the unit took a hit this turn (blocks movement next turn). */
  hitThisTurn: boolean;
  /** True if the unit was hit last turn (movement currently blocked). */
  movementBlocked: boolean;
  /** True while the unit is under enemy fire (moves at half pace). */
  underFire: boolean;

  // --- posture: how well protected, and how hard to find (decision 12) ---
  /**
   * Consecutive turns the force has stayed put. A force that holds still is
   * **hidden** (looked for in the 20 m band, not the 300 m one) and, past the
   * dig-in threshold, works on its position.
   */
  stationaryTurns: number;
  /**
   * Protection the ground gives it: what it started with (terrain, a prepared
   * position) raised by whatever it has dug. Recomputed each turn's upkeep, so
   * a force that gets up and moves loses what it dug.
   */
  cover: CoverState;
  /** Protection it holds without digging — terrain, or a prepared position. */
  baseCover: CoverState;
  /** True while the force is working on its camouflage (הסוואה). */
  camouflaging: boolean;
  /** True while the force is scouting (סיור): looks better, walks only. */
  scouting: boolean;
  /** Turns of camouflage work banked; moving throws them away. */
  camouflageTurns: number;
  /**
   * The arc the force has been told to watch (גזרת תצפית), if it has been given
   * one. Absent means all-round observation: no better anywhere, no worse
   * anywhere (rules decision 14).
   */
  observationSector?: ObservationSector;
}

/**
 * A sector of observation (גזרת תצפית): where a force has been told to look.
 * An arc, not a line — a squad watches a frontage, not a bearing.
 */
export interface ObservationSector {
  /**
   * Centre of the arc, in degrees, 0 along +x — the same convention as
   * `VehicleState.facing`.
   */
  bearing: number;
  /** Total width of the arc in degrees, split evenly either side of `bearing`. */
  width: number;
}

/** Smoke / obscuration screen present on the map. */
export interface SmokeScreen {
  id: string;
  center: Point;
  radius: number;
  /** Turns remaining before it dissipates. */
  turnsRemaining: number;
}

/** A laid charge/mine on the map (מטען נ"א / נ"ט). */
export interface Mine {
  id: string;
  side: Side;
  type: "antiPersonnel" | "antiTank";
  position: Point;
  armed: boolean;
  detected: boolean;
}

/**
 * A smoke screen called for but still in flight. Grenade smoke never queues —
 * it is in place the moment it is thrown — so only mortar and artillery screens
 * appear here, waiting out the delivering weapon's שיהוי.
 */
export interface PendingSmokeMission {
  id: string;
  source: SmokeSource;
  side: Side;
  target: Point;
  radius: number;
  /** Turn index on which the screen appears. */
  resolvesOnTurn: number;
}

/** A queued indirect-fire mission awaiting its impact-delay resolution. */
export interface PendingFireMission {
  id: string;
  weapon: string; // key into the explosives table
  side: Side;
  target: Point;
  /** Turn index on which the mission resolves. */
  resolvesOnTurn: number;
  /** Whether a UAV footprint covers the target (improves accuracy). */
  observedByUav: boolean;
}
