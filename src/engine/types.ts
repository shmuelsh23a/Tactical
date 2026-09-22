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
 * A soldier's six traits, each 1–10 (author, 2026-09-22). Only wisdom, luck and
 * — for a leader — intelligence and charisma do anything yet, all through
 * morale (rules decision 19); the rest wait for the rules that read them.
 */
export interface Traits {
  strength: number;
  intelligence: number;
  wisdom: number;
  agility: number;
  charisma: number;
  luck: number;
}

/** How a soldier is holding up, as his own side is allowed to see it (decision 19). */
export type MoraleState = "steady" | "wavering" | "shaken" | "broken" | "heroic";

/**
 * A soldier's pool of will (rules decision 19). `will` is what he has left;
 * `ceiling` is the most it can ever come back to in this battle, and it only
 * falls — a pool that has been drained is never refilled.
 */
export interface SoldierMorale {
  will: number;
  ceiling: number;
  /**
   * The state as of the last morale step. `broken` and `heroic` are sticky —
   * set by a test, cleared by a rally or by time — and the rest are read off
   * his effective morale.
   */
  state: MoraleState;
  /** Last turn he was tested, for the every-few-turns rule. */
  lastTestTurn?: number;
  /** The turn a heroic response wears off. */
  heroicUntilTurn?: number;
  /** Times a leader has brought him back; each makes the next harder. */
  timesRallied: number;
}

/** How motivated a force is: sets the floor of its men's starting pool. */
export type Motivation = "poor" | "low" | "normal" | "high" | "fanatic";

/** How trained and blooded a force is: steadies its tests and its nerve under fire. */
export type Experience = "green" | "regular" | "veteran" | "elite";

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
  /** Drawn when the game is played with morale (rules decision 19). */
  traits?: Traits;
  /**
   * The force's leader: a squad's squad leader, a command group's commander.
   * Only a leader has leadership (intelligence + wisdom + charisma).
   */
  leader?: boolean;
  /** His pool of will; present only when the game is played with morale. */
  morale?: SoldierMorale;
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
  /**
   * Movement budget spent this turn, in metres of flat going. On flat ground
   * that is the distance moved; a climb costs more (rules decision 15). Zero
   * means the force has not moved, which is what "hidden" reads.
   */
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

  // --- engineering (rules decision 16) ---
  /**
   * Whether this force may lay a charge during play. Off for an ordinary
   * force: the work belongs to an **insurgent or special force**, and until
   * force *types* exist — they arrive with echelon scaling (backlog 3) — this
   * flag is how a scenario says which force is one.
   */
  canLayCharges?: boolean;
  /** The charge this force is laying, while it is laying one. */
  layingCharge?: ChargeWork;

  // --- covering fire (חיפוי, rules decision 18) ---
  /**
   * Set while the force is holding its fire ready for the enemy to act rather
   * than shooting at something now. Declared in advance, spends the force's
   * action for the turn, and is consumed the moment it fires.
   */
  covering?: CoveringPosture;

  // --- morale (rules decision 19) — absent unless the game plays it ---
  /** How motivated the force is; "normal" when not given. */
  motivation?: Motivation;
  /** How experienced the force is; "regular" when not given. */
  experience?: Experience;
  /**
   * How hard it is being shot at (דיכוי): added as fire arrives, halved at the
   * end of every turn. Suppressed at 15, pinned at 40.
   */
  suppression?: number;
  /**
   * The force broke and is running. The engine has taken it — it runs to its
   * commander, does not fire and cannot be given orders — until a leader
   * rallies enough of it.
   */
  routing?: boolean;
  /** The force broke with the enemy on top of it and gave itself up. */
  surrendered?: boolean;
}

/**
 * A force watching for the enemy to move, fire or assault (חיפוי, rules
 * decision 18). It is a posture rather than an order: the force has spent its
 * action on it, and holds it until it fires, moves, or is told otherwise.
 */
export interface CoveringPosture {
  /** What it will shoot with when the moment comes. */
  weapon: "smallArms" | "sustainedMg";
  /** The turn it was declared, for the narration. */
  declaredTurn: number;
}

/**
 * A charge being laid during play (rules decision 16).
 *
 * The position is stamped when the work is begun, not read when it finishes:
 * a force cannot move without losing the work, so the two are the same place —
 * but the charge belongs to the ground that was prepared, not to wherever the
 * unit object happens to be by the time the turn ends.
 */
export interface ChargeWork {
  type: Mine["type"];
  position: Point;
  /** Turns of work banked. Counted at the end of each turn it survived. */
  turnsWorked: number;
  /** The turn the work was begun, for the narration. */
  startedTurn: number;
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
