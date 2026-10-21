import { Rng } from "./rng.js";
import { roll } from "./dice.js";
import { directionalCoverModifier, watchedArc } from "./combat/directional.js";
import {
  angleBetween,
  bearingDegrees,
  distance,
  lookupBand,
  segmentIntersectsCircle,
  type Point,
} from "./geometry.js";
import type {
  ChargeWork,
  CoveringPosture,
  Mine,
  ObservationSector,
  PendingFireMission,
  PendingSmokeMission,
  SmokeScreen,
  Side,
  Unit,
} from "./types.js";
import type { Echelon, MovementMode, Readiness } from "./types.js";
import { ECHELON_RANK } from "./data/c2.js";
import {
  MAX_ALTERNATE_POSITIONS_PER_FORCE,
  MAX_REGISTERED_TARGETS_PER_WEAPON,
  PREPARED_POSITION_REACH_M,
} from "./data/planning.js";
import { MOVEMENT_PROFILES, UNDER_FIRE_SPEED_MULTIPLIER } from "./data/movement.js";
import { ARES_AIRBURST, EXPLOSIVES, MORTAR_DOWN_CHECKED, RIFLE_GRENADIERS, SHELL_VS_MEN, shellVsMen, type Fuze, type ShellCover, type ShellVsMen } from "./data/explosives.js";
import { DOCTRINE_MORTARS, FIRE_UNIT_TUBES, explosiveEntry, LETHALITIES, LETHAL_AREA_M2, type Checked, RATE_OF_FIRE, RESEARCH_ROUNDS_FOR_EFFECT, freshness, rollRate, type Lethality } from "./data/lethality.js";
import {
  ADJUSTMENT_RADIUS_M,
  BURST_HEIGHT_M,
  DEFAULT_ROUNDS_FOR_EFFECT,
  FIRE_SUPPORT_MIN_ECHELON,
  defaultRoundsForEffect,
  MAX_ADJUSTING_ROUNDS,
  INDIRECT_ACCURACY,
  ARES_GUN_RANGE_KM,
  aresGunCep,
  MAX_ROUNDS_PER_MISSION,
  OBSERVE_RANGE_M,
  ON_TARGET_M,
  cepAfter,
} from "./data/artillery.js";
import {
  SMOKE_BLOCKS_FIRE,
  SMOKE_DURATION_TURNS,
  SMOKE_GRENADE_THROW_M,
  SMOKE_RADIUS_M,
  type SmokeSource,
} from "./data/smoke.js";
import { SUCCESSION_TURNS, orderInterval } from "./data/c2.js";
import { CHARGE_LAYING } from "./data/engineering.js";
import {
  canObserve,
  detectByMovement,
  detectByUav,
  isHidden,
  lookingThroughBinoculars,
  observeFromPosition,
  stillReach,
  type DetectionResult,
  type Observation,
} from "./combat/detection.js";
import { OBSERVATION, OBSERVATION_SECTOR, SCOUTING } from "./data/concealment.js";
import {
  FIRING_FROM_COVER_MODIFIER,
  UNREADY,
  READINESS,
  SURPRISE_RECOVERY_TURNS,
  READINESS_SPOTTING,
  SMALL_ARMS_BANDS,
  SUSTAINED_MG_BANDS,
  COVER_MODIFIERS,
  type CoverState,
} from "./data/directFire.js";
import { IntelLedger, type Contact, type ContactSource } from "./intel.js";
import { triggerMines, type MineDetonation } from "./combat/mines.js";
import {
  firstFiringPoint,
  type CoveringFireResult,
} from "./combat/covering.js";
import {
  resolveDirectFire,
  type DirectFireOptions,
  NOT_A_COAXIAL_WEAPON,
  type DirectFireResult,
  type WeaponClass,
} from "./combat/directFire.js";
import {
  resolveDirectExplosive,
  type BlastTargetResult,
  type DirectExplosiveResult,
} from "./combat/explosives.js";
import { resolveIndirectFire, postureFactor, shellFactor, type IndirectFireResult } from "./combat/indirectFire.js";
import { ASSAULT_RANGE_M, resolveAssault, type AssaultResult } from "./combat/assault.js";
import { applyBleeding, decaySmoke, endTurnUnitUpkeep } from "./upkeep.js";
import { GOES_INSIDE, INTERIOR_REFUSAL, InteriorBattles, type InteriorPlan, type InteriorReport } from "./interior/coupling.js";
import { fitSoldiers, killOutright, refreshUnitStatus } from "./units.js";
import {
  FLAT_GROUND,
  betterCover,
  boundCost,
  climbAlong,
  coverFromObjects,
  underRoof,
  effectiveCover,
  eyeHeight,
  reachAlong,
  steepestGradeAlong,
  terrainBlocksSight,
  distanceToFootprint,
  stateOfStructure,
  type MapObject,
  type Terrain,
} from "./terrain.js";
import { OBJECT_COVER_REACH_M, SLOPE } from "./data/terrain.js";
import {
  COLLAPSE_KILLS,
  CRITICAL_CHANCE,
  ENCLOSED_BLAST_FACTOR,
  SPALLS_INSIDE,
  ROOF_PENETRATION,
  STRUCTURE_DAMAGE,
  type StructureState,
} from "./data/structures.js";
import type { ArmourFigures } from "./data/armor.js";
import { cloneForRecord, type GameRecording, type RecordedAction } from "./recording.js";
import { hasArrived, type StandingOrder, type StandingOrderExecution } from "./orders.js";
import {
  StressLedger,
  addSuppression,
  forceMorale,
  generateMorale,
  qualityGapFactor,
  refreshMoraleStates,
  resolveMorale,
  sideBroken,
  snapshotSoldiers,
  suppressionLevel,
  volumeSuppression,
  roundSuppressionChance,
  shellingSuppression,
  roundSuppression,
  hasMorale,
  nerveUnderAssault,
  readySoldiers,
  type FireNote,
  type ForceMorale,
  type MoraleReport,
  type SoldierSnapshot,
  unitSeed,
} from "./morale.js";
import { firingOrder, rushFactor, tracePace, updateFatigue } from "./traits.js";
import { BEST_VISUAL_FIX_SIGMA_M, LOCATION_ERROR, UAV_LOCATION_ERROR_M, locationSigma } from "./data/locationError.js";
import { HEADS_DOWN, ROOF_SUPPRESSION_FACTOR, SUPPRESSION, SUPPRESSION_CHANCE } from "./data/morale.js";
import { type RuleVariants } from "./data/variants.js";
import { LEADER_REACH_M, NERVE_BY_COVER, PREPARED, QUALITY_BREAK_SHIFT, QUALITY_GAP_EXPLOSIVES, SIDE_BREAK_BY_POSTURE } from "./data/morale.js";
import { ASSAULT } from "./data/casualties.js";

/** A command group still in command: not down, routing or surrendered (rules decision 55). */
function commandsStill(u: Unit): boolean {
  return !u.neutralized && !u.routing && !u.surrendered;
}

/** The location error's stream, named as no force could be (rules decision 51). */
const LOCATION_ERROR_STREAM = "#location-error";

/** The seven phases of a turn, in order (סדר התור). */
export const PHASES = [
  "initiative", // יוזמה
  "intel", // קבלת מודיעין/כטב"מ
  "targeting", // סימון מטרות לארטילריה/עשן
  "resolvePriorArty", // פתרון ארטילריה של סיבוב קודם
  "movement", // תנועה
  "combat", // ירי/חיפוי/הסתערות
  "summary", // סיכום והתארגנות
] as const;
export type Phase = (typeof PHASES)[number];

export class PhaseError extends Error {}

/** One side's observed fire on a point, for adjusting onto it (rules decisions 32–33). */
interface AdjustmentEntry {
  side: Side;
  weapon: string;
  aim: Point;
  turn: number;
  adjustments: number;
}

/**
 * A point a side's weapon is on the mark at: a round was seen to land there,
 * or it was registered before the battle — a planned target (rules decision 32).
 */
export interface RegisteredTarget {
  side: Side;
  weapon: string;
  at: Point;
}
type MarkEntry = RegisteredTarget;

/** An indirect-fire weapon's key — its own, not one an object inherits ("constructor"). */
const isIndirect = (weapon: string): boolean => Object.hasOwn(INDIRECT_ACCURACY, weapon);
/** The mortars: the document's 81 mm and decision 93's 60 and 120 mm. */
const MORTARS: ReadonlySet<string> = new Set(["mortar", "lightMortar", "heavyMortar"]);
/** The most tubes an allotment's fire unit may name (decision 93): a battery's six. */
const MAX_FIRE_UNIT_TUBES = 6;

/**
 * An alternate position a side prepared in mission planning (rules decision
 * 38): ground made ready for `forUnitId` to fall back to. Any force of the
 * side standing in it holds its prepared `cover`, as it would its first.
 */
export interface PreparedPosition {
  side: Side;
  forUnitId: string;
  at: Point;
  cover: CoverState;
}

/**
 * Fire missions a side is assigned at company level and below (rules decision
 * 34): `missions` of the weapon for the battle, each firing `roundsForEffect`
 * once the guns are on the mark. Above company it is ammunition, set by the
 * mission's parameters, and not built yet.
 */
export interface FireAllotment {
  weapon: string;
  missions: number;
  roundsForEffect?: number;
  /**
   * The tubes of the fire unit that answers its missions (rules decision 93):
   * a section's two, a platoon's four. Absent: `FIRE_UNIT_TUBES`, which keeps
   * the 81 mm at decision 36's three for every recording made before it.
   */
  tubes?: number;
}

/** A fire mission called in (rules decision 34): adjusting, then fired for effect. */
/**
 * How a call for fire asks for its rounds (rules decision 39): `adjust` walks
 * single rounds onto the mark before firing for effect, `effect` fires for
 * effect at once, at whatever accuracy the guns have there. The caller's
 * choice, as the observer's is in doctrine.
 */
export type FireMethod = "adjust" | "effect";

export interface FireMission {
  id: string;
  side: Side;
  weapon: string;
  target: Point;
  roundsForEffect: number;
  firingFrom?: Point;
  fuze?: Fuze;
  observedByUav?: boolean;
  /** Fire for effect at once (rules decision 39). Absent: adjust. */
  method?: "effect";
  /** Adjusting rounds fired so far. */
  adjustingRounds: number;
  /** The adjusting round in flight: the mission waits to see where it lands. */
  inFlight?: string;
  /**
   * `adjusting` until the rounds for effect are sent; then `done`. `checked`:
   * stopped by a check fire before it fired for effect.
   */
  status: "adjusting" | "done" | "checked";
  /** The turn the rounds for effect were sent, once they are. */
  forEffectOnTurn?: number;
}

/** Refusal reason when a force is under orders to hold its fire. */
export const HOLDING_FIRE = "holding fire";

/**
 * Refusal reason when a force is holding חיפוי: it has spent its action on
 * watching, so it does not also get a deliberate shot (rules decision 18). To
 * attack instead, stand it down first — which does not hand the action back,
 * because the turn's action was spent the moment the posture was declared.
 */
export const HOLDING_COVERING_FIRE = "holding covering fire";

/**
 * Why a force may not start laying a charge (rules decision 16). Short keys
 * rather than sentences, so the UI words them in Hebrew through `reasonHe`
 * exactly as it words an order's refusals.
 */
export const LAY_CHARGE_REFUSAL = {
  untrained: "not a charge-laying force",
  neutralised: "neutralised",
  noOneLeft: "no one left to lay it",
  alreadyMoved: "already moved this turn",
  underFire: "was hit this turn",
  noOrders: "out of the order cycle",
  routing: "routing",
} as const;

/**
 * Why a grenade's smoke could not be laid where it was asked (the author,
 * 2026-10-20). Short keys, worded in Hebrew by the app.
 */
export const SMOKE_REFUSAL = {
  /** No man of the side is within throwing range of the spot. */
  noThrower: "no man within throwing range",
  /** No infantry force of the side with a rifle grenadier is within a rifle grenade's reach of it. */
  noLauncher: "no grenadier within rifle-grenade range",
} as const;

/**
 * Why a force may not act, when the reason is its morale (rules decision 19).
 * Short keys, worded in Hebrew by the app's `reasonHe` like every other refusal.
 */
export const MORALE_REFUSAL = {
  /** Broke and is running; the engine has it until it is rallied. */
  routing: "routing",
  /** Gave itself up. */
  surrendered: "surrendered",
  /** Falling back under a withdrawal order, which is not a time to fight. */
  withdrawing: "withdrawing",
  /** Pinned by fire: it moves only to withdraw. */
  pinned: "pinned",
  /** Pinned by fire, heads down: it shoots only at an enemy close in (rules decision 63, S2). */
  headsDown: "heads down",
} as const;

/** What a move turned up: what the force saw, and what it set off. */
export interface MoveResult {
  detection: DetectionResult;
  /** Charges triggered along the path walked. */
  mineDetonations: MineDetonation[];
  /**
   * Covering fire the bound drew (rules decision 18). The force was shot at
   * where the shot says, and went on to where the move says: a bound is
   * interrupted, never cancelled.
   */
  coveringFire: CoveringFireResult[];
}

/** A shot or an assault, with whatever covering fire it drew in reply. */
export type WithCoveringFire<T> = T & { coveringFire: CoveringFireResult[] };

/**
 * What became of a force's charge-laying work over a turn (rules decision 16):
 * the charge went into the ground, or the work was lost. Reported by the step
 * that crosses the end of the turn, so the player is told either way.
 */
export interface ChargeWorkReport {
  unitId: string;
  type: Mine["type"];
  position: Point;
  /** The charge that went in, on the turn the work was finished. */
  mine?: Mine;
  /**
   * What cost the force the work, when it lost it. `"hit"` is fire that
   * *landed*: a force shot at and missed goes on working — nothing in the
   * engine marks a force that was merely shot at.
   */
  interrupted?: "moved" | "fought" | "hit" | "neutralized";
}

/** What a call for smoke produced: a screen on the map, or one still in flight. */
export interface SmokeOrder {
  source: SmokeSource;
  radius: number;
  durationTurns: number;
  /** Turn the screen is (or will be) on the map. */
  arrivesOnTurn: number;
  /** Set when the screen went down immediately (grenade). */
  screen?: SmokeScreen;
  /** Set when it still has to be fired (mortar / artillery). */
  mission?: PendingSmokeMission;
}

export interface GameOptions {
  seed: number;
  sides?: Side[];
  /**
   * Whether the C2 (פו"ש) order interval gates manoeuvre: a force that cannot
   * receive new orders this turn may not be moved (it may still fire at its
   * own initiative). Defaults to on; turn it off for a game played without
   * the command-and-control module.
   */
  enforceC2?: boolean;
  /**
   * Whether the engine keeps each side's picture of the enemy — what it has
   * detected, and where it last saw it (see {@link IntelLedger}). Off by
   * default: the engine is the umpire and knows everything, and a game played
   * on one map wants no fog. The hotseat turns it on, which is what makes its
   * fog-of-war the document's detections rather than a radius.
   *
   * With it on, a bound is also rolled *against* — nearby enemies get their
   * own chance to pick the mover up — so it changes what the rng is asked, not
   * only what is remembered.
   */
  trackIntel?: boolean;
  /**
   * The ground the battle is fought on: real elevation and the objects on it
   * (rules decision 15). Absent means flat, empty ground — every sight line
   * clear but for smoke, and nothing to take cover in — which is exactly the
   * game as it was before the map had any ground at all.
   */
  terrain?: Terrain;
  /**
   * Whether the game is played with morale (rules decision 19): soldiers get
   * traits and a pool of will, fire suppresses, men break and are rallied,
   * forces rout or surrender and a side can break. Off by default, and a game
   * without it plays exactly as it did before morale existed — no extra rng
   * draws, no slower forces, no worse aim.
   */
  morale?: boolean;
  /**
   * Candidate answers to rulings 1–3, on trial (see data/variants.ts). Absent,
   * the game plays the rules as they stand. Scaffolding for a decision: it
   * goes when the author picks.
   */
  variants?: RuleVariants;
  /**
   * Targets each side registered before the battle: its guns start on the
   * mark there (rules decision 32). A defender's planned fires.
   */
  registeredTargets?: RegisteredTarget[];
  /**
   * The fire missions each side is assigned (rules decision 34). A side left
   * out may call as many as it likes, each firing its weapon's
   * {@link defaultRoundsForEffect} for effect (decision 36).
   */
  fireSupport?: Partial<Record<Side, FireAllotment[]>>;
  /**
   * The echelon each side's player commands (rules decision 37): what fire
   * support it may call. A side left out commands the highest echelon of its
   * forces on the map — which a harness battle, where a company's defending
   * platoon is the only one on the map, has to say otherwise.
   */
  commandEchelon?: Partial<Record<Side, Echelon>>;
  /**
   * Whether who may call a weapon depends on the echelon commanding (rules
   * decision 37). On by default; a recording made before the rule reads it as
   * off, so the fire it called still replays.
   */
  fireSupportByEchelon?: boolean;
  /**
   * Whose figures a blast and the tank gun play (rules decision 41):
   * `research`, the default, sets how far a shell, a bomb, a grenade or a
   * tank round reaches the men of a force, and how far a tank gun hits, from
   * published data (docs/validation.md); `document` plays the rules
   * document's tables. A recording made before the decision reads it as
   * `document`, so the battle it holds still replays.
   */
  lethality?: Lethality;
  /**
   * Metres of a bound's budget each metre climbed costs (rules decisions 15
   * and 61): 5 for a new game, {@link SLOPE.climbCostPerMetre}. A recording
   * made before decision 61 replays at 8, Naismith's figure.
   */
  climbCostPerMetre?: number;
  /**
   * What full cover does against a shell or a bomb (rules decision 62):
   * `sources`, the default, from FM 7-90 and the WWII figures — a hole or a
   * roof several times safer than before; `before62`, decision 31's. A
   * recording made before the decision reads it as `before62`.
   */
  shellCover?: ShellCover;
  /**
   * Suppression reaches further than death (rules decision 63, S1): a shell
   * or a bomb suppresses every force whose nearest man is within its
   * suppression reach (`SUPPRESSION_REACH_81MM`), not only those its lethal
   * blast reaches. On by default; a recording made before it reads it as off.
   */
  suppressionReach?: boolean;
  /**
   * A roof halves the suppression a shell or a bomb puts on a force (rules
   * decision 63, S3: `ROOF_SUPPRESSION_FACTOR`). On by default; a recording
   * made before it reads it as off.
   */
  roofsDampSuppression?: boolean;
  /**
   * Direct-fire HE (tank round, RPG, rifle grenade) follows the shell's rules
   * (rules decision 75): posture, cover and roofs scale its blast against men
   * as a shell's impact fuze does (`shellFactor`), its blast catches every
   * force within it, men caught by it go to ground, and its suppression
   * reaches and is damped by a roof as a shell's does (decision 63, S1 and
   * S3, each under its own switch). On by default; a recording made before
   * it reads it as off.
   */
  directHeAsShell?: boolean;
  /**
   * HE wears buildings down — intact, damaged (roof holed), rubble — and the
   * map changes with them (rules decision 76: `STRUCTURE_DAMAGE`). On by
   * default; a recording made before it reads it as off.
   */
  structuresTakeDamage?: boolean;
  /**
   * A critical hit (rules decision 77): a round goes in through a window, a
   * firing slit or the roof and bursts among the men inside, at
   * `ENCLOSED_BLAST_FACTOR`. On by default; a recording made before it reads
   * it as off.
   */
  criticalHits?: boolean;
  /**
   * Whose armour figures (rules decision 78): `research`, the default —
   * penetration by weapon, by vehicle class and by the side struck; or
   * `document`, the table's flat chance. A recording made before it reads
   * it as `document`.
   */
  armour?: ArmourFigures;
  /**
   * The research figures as checked against the sources on 2026-10-03 (rules
   * decision 79): tank HE's lethal area, the RPG's hit chance against
   * armour, charges as Claymores and IEDs, a mortar's ×0.5 against men down,
   * FM 7-90's suppression table, and plain HE reaching a vehicle only within
   * its blast. On by default; a recording made before it reads it as off.
   */
  checkedFigures?: boolean;
  /**
   * On top of the checked figures, ARES Special Report No. 3, *Indirect
   * Fire* (2017) (rules decision 80): its lethal areas, its 155 mm CEP by
   * range, and an air burst at ×1.15 the impact's area. On by default; a
   * recording made before it reads it as off.
   */
  aresFigures?: boolean;
  /**
   * A direct-fire explosive (tank round, RPG, rifle grenade) costs the nerve
   * of a bombardment, as a shell does, not only of being fired on (rules
   * decision 81; author, 2026-10-03). On by default; a recording made
   * before it reads it as off.
   */
  directHeBombards?: boolean;
  /**
   * A machine gun team's own table and reach (rules decision 90): a force
   * carrying a medium machine gun (`Unit.mediumMg`) fires out to the
   * published 800 m, not the infantry table's 400. On by default; a
   * recording made before it reads it as off, so a battle fought when a
   * machine gun team was just another squad replays as it was.
   */
  mediumMg?: boolean;
  /**
   * The quality gap between two forces acts on small arms and the assault
   * (rules decision 84): nothing between equals, much at the extremes. On by
   * default; a recording made before it reads it as off.
   */
  qualityGap?: boolean;
  /**
   * Directional cover (rules decision 85): a dug or prepared position counts
   * in full toward its front, a wall from its side, a house all round; and a
   * force fired on from outside the arc it watches, by an enemy its side had
   * not seen, is caught unready. On by default; a recording made before it
   * reads it as off.
   */
  directionalCover?: boolean;
  /**
   * Readiness (rules decision 86): a force unaware, alert or stood to, raised
   * by what it sees; it decides who can be caught unready, and experience how
   * long the surprise lasts. Needs `directionalCover`. On by default; a
   * recording made before it reads it as off.
   */
  readiness?: boolean;
  /**
   * The quality gap acts on rifle grenades as on small arms (rules decision
   * 87), with `qualityGap`. On by default; a recording made before it reads
   * it as off.
   */
  qualityGapGrenades?: boolean;
  /**
   * A side gives up later or sooner by its force type (rules decision 87):
   * {@link QUALITY_BREAK_SHIFT} on the posture's breakpoint, on the research
   * figures. On by default; a recording made before it reads it as off.
   */
  qualityBreakpoint?: boolean;
  /**
   * What the traits do beyond morale (rules decision 69): agility and
   * strength set each man's pace and the force moves at its slowest man's;
   * agility makes a running force harder to hit and gets men down quicker
   * under shelling; wisdom spots and finds charges; intelligence aims;
   * luck turns a hit away or a kill into a wound. Acts only with `morale`,
   * which draws the traits. On by default; a recording made before it
   * reads it as off.
   */
  traitEffects?: boolean;
  /**
   * Fatigue by strength (rules decision 71): running, climbing and being
   * under fire tire a man, a quiet turn rests him, and a tired man moves
   * slower and shoots worse. Acts only with `morale`. On by default; a
   * recording made before it reads it as off.
   */
  fatigue?: boolean;
  /**
   * Who fires first, by agility (rules decision 72): a side's forces fire
   * under their standing orders still forces first, then by their men's mean
   * agility (`firingOrder`). Initiative still picks the side (author,
   * 2026-10-03). On by default; a recording made before it reads it as off.
   */
  agilityFireOrder?: boolean;
  /**
   * Pinned means heads down (rules decision 63, S2: `HEADS_DOWN`): a pinned
   * force makes no sighting beyond 50 m, is no observer for a fire mission,
   * and fires at nothing beyond 100 m; a suppressed force keeps each sighting
   * at an even chance. On by default; a recording made before it reads it as
   * off.
   */
  headsDown?: boolean;
  /**
   * A pinned or suppressed defender tests its nerve before an assault on it
   * is resolved, and a force that breaks surrenders or runs on a roll (rules
   * decision 63, S5: `ASSAULT_NERVE`). On by default; a recording made
   * before it reads it as off.
   */
  assaultNerve?: boolean;
  /**
   * A pinned force still fires within rifle range, at a penalty beyond 100 m
   * (rules decision 65: `HEADS_DOWN`). Needs `headsDown`; without it a pinned
   * force fires at nothing beyond 100 m, as decision 63 built it. On by
   * default; a recording made before it reads it as off.
   */
  pinnedFiresAtRange?: boolean;
  /**
   * Fire on the move: a force that moved this turn fires its small arms at
   * this factor of its hit chance — unaimed fire from unsupported positions
   * (proposed, thirty-seventh round; the factor is ours). 1, no penalty, by
   * default, as the game has always played; it may also be set before the
   * first turn ({@link Game.fireOnTheMove}).
   */
  fireOnTheMove?: number;
  /**
   * Nerve lost to fire by cover (rules decision 64, `NERVE_BY_COVER`): the
   * nerve the enemy's fire costs a man each turn is doubled in the open and
   * cut to 0.3 in a hole, 0.15 under a roof. On by default; a recording made
   * before it reads it as off.
   */
  nerveByCover?: boolean;
  /**
   * The nerve factor in the open (rules decisions 64 and 66): 1 for a new
   * game, `NERVE_BY_COVER.none`. A recording made before decision 66 replays
   * at 2.
   */
  nerveInOpen?: number;
  /**
   * The share of an attacking side's men down, broken or fled at which it
   * gives up, on the research figures (rules decisions 44 and 66): 0.4 for a
   * new game. A recording made before decision 66 replays at decision 44's
   * 0.3.
   */
  attackerBreakpoint?: number;
  /**
   * The sides attacking (rules decision 44): on the research figures a side
   * attacking gives up at the historical attacker's breakpoint, one
   * defending at the defender's. A side not named defends; in a meeting
   * engagement both attack.
   */
  attackers?: Side[];
  /**
   * Whether a sighting reports where an observer judged the force to be,
   * rather than where it is (rules decision 51, ⚠️ ours): off by default,
   * and needs `trackIntel`. The error is drawn from its own seeded stream, so
   * it changes what a side knows and never what the game's rng is asked.
   */
  locationError?: boolean;
  /**
   * Whether a force in position may find a still enemy beyond the
   * document's 20 m (rules decision 53, ⚠️ ours): out to 300 m, 600 m for an
   * observation post, its chance falling off with range. Off by default; it
   * rolls for more pairs of forces, so it changes what the rng is asked.
   */
  stillDetection?: boolean;
  /**
   * Scouts carry binoculars (rules decision 54, ⚠️ ours): a scouting force
   * that has halted watches as an observation post does — a still enemy to
   * 600 m, a moving one to 1,000 m, and half the eye's range error. Off by
   * default; needs `trackIntel`.
   */
  binoculars?: boolean;
  /**
   * A longer look sharpens a report (rules decision 54, ⚠️ ours): a force in
   * position keeps its eyes on a still enemy its side has fresh and it can
   * see within its reach, without rolling to find it again, and each turn's
   * look adds an estimate. Off by default; needs `trackIntel`.
   */
  keepEyesOn?: boolean;
  /**
   * Losing a command group has effect (rules decision 55, ⚠️ ours): command
   * passes to the next in line after {@link SUCCESSION_TURNS} turns without
   * new orders or calls for fire, and a side with none left gives neither.
   * Off by default.
   */
  commandSuccession?: boolean;
  /**
   * A smoke screen from the tubes costs a fire mission (rules decision 56,
   * author 2026-09-29): mortar or artillery smoke is drawn from the side's
   * allotment like a mission of HE. A grenade's smoke is the squad's own. On
   * by default; a recording made before it reads it as off.
   */
  smokeCostsMission?: boolean;
  /**
   * Smoke from a grenade needs somebody to deliver it (the author,
   * 2026-10-20): a hand-thrown pot lands within `SMOKE_GRENADE_THROW_M` of a
   * man of the side, rifle-grenade smoke within a rifle grenade's reach of
   * one of its infantry squads. Before it a side could drop a pot anywhere on
   * the map. On by default; a recording made before it reads it as off.
   */
  smokeNeedsThrower?: boolean;
  /**
   * Closed terrain is fought inside (rules decision 96, step 3b): a force that
   * assaults a force in a building — only an assault order goes in; at the
   * walls a force fights from outside (the author, 2026-10-20) — fights it
   * out room by room on the building's floor plan, a minute a
   * turn as the turn closes (`interior/coupling.ts`). On by default; a
   * recording made before it reads it as off, and plays the assault outside.
   */
  closedTerrain?: boolean;
  /**
   * A fight inside meets the street through the windows (rules decision 98):
   * a defender stands at a window facing the enemy unless planned otherwise,
   * fires out through it and is seen through it; fire into the building finds
   * only such men and those still in the street; a round that gets in bursts
   * in one room. On by default; a recording made before it reads it as off.
   */
  windowFire?: boolean;
  /**
   * A force of the attacking side that assaults into a building its side is
   * already clearing joins the fight there (rules decision 99), as new
   * teams at the front door; a defending side's force is refused. On by
   * default; a recording made before it reads it as off, where every
   * second assault on a building with a fight in it was refused.
   */
  joinFights?: boolean;
  /**
   * A side's break reaches inside its buildings (rules decision 102): its men
   * still fighting inside stop — a defender's give themselves up, an
   * attacker's leave by the door — and the fight ends with the house to the
   * other side. On by default; a recording made before it reads it as off,
   * where the fights went on under a broken side.
   */
  breakEndsInside?: boolean;
  /**
   * Morale reaches inside, and the battle waits for it (rules decision 103):
   * a man the morale step has broken stops fighting inside — an attacker
   * leaves, a defender falls back or, cornered, gives himself up — and
   * neither side's break is judged while a fight inside goes on. On by
   * default; a recording made before it reads it as off, where a broken man
   * fought on and a side's break ended the fights inside (decision 102).
   */
  moraleInside?: boolean;
  /**
   * The defender's counterattack inside (rules decision 104): defenders
   * inside go back into rooms the attacker took and left, and a force of
   * the defending side that assaults an attacker fighting in its house
   * goes in at the door and clears the attacker's rooms back. On by
   * default; a recording made before it reads it as off, where defenders
   * stood or fell back and the defending side's assault was refused.
   */
  counterattackInside?: boolean;
  /**
   * An enemy mark stays on the side's map where it was last seen, however long
   * ago (rules decision 57, author 2026-09-29): the side draws it as stale.
   * Before, a report nobody refreshed for three turns was dropped (decision
   * 12). On by default; a recording made before it reads it as off.
   */
  keepStaleMarks?: boolean;
  /**
   * A burst of small arms suppresses by its volume (rules decision 91): the
   * men firing it, a machine gun's worth, and the target's cover
   * (`VOLUME_SUPPRESSION`), in place of a flat `SUPPRESSION.directFire`. On
   * by default; a recording made before it reads it as off.
   */
  suppressionByVolume?: boolean;
  /**
   * A shell's suppression is a chance (rules decision 92): a turn's rounds of
   * a mission combine as P = 1 − Π(1 − p) by FM 7-90's probabilities and add
   * `SUPPRESSION_CHANCE.share` of what is left below the cap, in place of an
   * amount a round. On by default; a recording made before it reads it as off.
   */
  suppressionByChance?: boolean;
  /**
   * The mission's deadline (rules decision 58, author 2026-09-29: "mission
   * will have time limit in briefing"): the attackers must take their
   * objective by the end of this turn, or the attack has failed. Absent: no
   * deadline. The briefing states it; the app ends the battle on it.
   */
  timeLimit?: number;
}

/** One burst, shell or blow a force received (see `Game.fireReceived`). */
export interface ReceivedFire {
  turn: number;
  targetId: string;
  kind: FireNote["kind"];
  /** Who fired; absent for shells from off the map and for charges. */
  firerId?: string;
}

/**
 * The hotseat game engine: owns the full (umpire's) game state and drives the
 * turn/phase loop. Player actions are validated against the current phase.
 */
/** A shot refused for want of a sight line: the words the resolvers use. */
const NO_LINE_OF_SIGHT = "no line of sight";

/** Fire through the windows of a fight inside (rules decision 98): see `Game.throughWindows`. */
interface WindowExchange {
  /** Someone can fire and someone can be hit. */
  seen: boolean;
  /** The firer's men who can fire, where it fights inside. */
  shooters?: Set<string>;
  /** The target's men who can be hit, where it fights inside. */
  pool?: Set<string>;
  /** The target's man at the window nearest the firer, whom a round aimed at it goes in on. */
  window?: string;
}

export class Game {
  readonly seed: number;
  readonly rng: Rng;
  readonly sides: Side[];
  readonly enforceC2: boolean;
  readonly trackIntel: boolean;
  /** The map the battle was set on, as given: what a recording carries. */
  readonly mapTerrain: Terrain;
  /** The map as it stands now: {@link mapTerrain} with what HE has done to its buildings (rules decision 76). */
  private ground: Terrain;
  /** Damage points on each building HE has struck, by object id (rules decision 76). */
  private structureDamage = new Map<string, number>();
  /** What the battle's rounds did inside buildings (decisions 76–77): read by the harness, never by a rule. */
  private readonly tally = { windowCriticals: 0, roofCriticals: 0, crushed: 0 };
  /** A copy of {@link tally}. */
  get urbanTally(): { windowCriticals: number; roofCriticals: number; crushed: number } {
    return { ...this.tally };
  }
  readonly morale: boolean;
  readonly variants: RuleVariants;
  /** Targets registered before the battle (rules decisions 32 and 38): with the options, then in planning. */
  readonly registeredTargets: RegisteredTarget[] = [];
  /** The fire missions each side was assigned (rules decision 34). */
  readonly fireSupport: Partial<Record<Side, FireAllotment[]>>;
  /** The echelon each side was declared to command (rules decision 37). */
  readonly commandEchelons: Partial<Record<Side, Echelon>>;
  /** Whether rules decision 37 is in force: who may call a weapon depends on the echelon. */
  readonly fireSupportByEchelon: boolean;
  /** Whose blast and tank-gun figures this game plays (rules decision 41). */
  readonly lethality: Lethality;
  readonly climbCostPerMetre: number;
  readonly shellCover: ShellCover;
  readonly suppressionReach: boolean;
  readonly roofsDampSuppression: boolean;
  readonly directHeAsShell: boolean;
  readonly structuresTakeDamage: boolean;
  readonly criticalHits: boolean;
  readonly armour: ArmourFigures;
  readonly checkedFigures: boolean;
  readonly aresFigures: boolean;
  readonly directHeBombards: boolean;
  readonly mediumMg: boolean;
  readonly qualityGap: boolean;
  readonly directionalCover: boolean;
  readonly readiness: boolean;
  readonly qualityGapGrenades: boolean;
  readonly qualityBreakpoint: boolean;
  readonly traitEffects: boolean;
  readonly fatigue: boolean;
  readonly agilityFireOrder: boolean;
  readonly headsDown: boolean;
  readonly assaultNerve: boolean;
  readonly pinnedFiresAtRange: boolean;
  /** See {@link GameOptions.fireOnTheMove}. Set it before the first turn only: a recording keeps one value. */
  fireOnTheMove: number;
  readonly nerveByCover: boolean;
  readonly nerveInOpen: number;
  /** See {@link GameOptions.attackerBreakpoint}. Set it before the first turn only: a recording keeps one value. */
  attackerBreakpoint: number;
  /** The sides attacking (rules decision 44). */
  readonly attackers: Side[];
  /** Whether a sighting carries location error (rules decision 51). */
  readonly locationError: boolean;
  /** Whether a force in position finds a still enemy beyond 20 m (rules decision 53). */
  readonly stillDetection: boolean;
  /** Whether scouts carry binoculars (rules decision 54). */
  readonly binoculars: boolean;
  /** Whether a force in position keeps its eyes on a still enemy it has found (rules decision 54). */
  readonly keepEyesOn: boolean;
  /** Whether losing a command group has effect (rules decision 55). */
  readonly commandSuccession: boolean;
  /** Whether tube smoke costs a fire mission (rules decision 56). */
  readonly smokeCostsMission: boolean;
  readonly smokeNeedsThrower: boolean;
  readonly closedTerrain: boolean;
  readonly windowFire: boolean;
  readonly joinFights: boolean;
  readonly breakEndsInside: boolean;
  readonly moraleInside: boolean;
  readonly counterattackInside: boolean;
  /** The fights going on inside buildings (rules decision 96). */
  readonly interior = new InteriorBattles();
  /** Whether a mark stays where it was last seen (rules decision 57). */
  readonly keepStaleMarks: boolean;
  /** Whether a burst suppresses by its volume (rules decision 91). Set it before the first turn only: a recording keeps one value. */
  suppressionByVolume: boolean;
  /** Whether a shell's suppression is a chance (rules decision 92). Set it before the first turn only: a recording keeps one value. */
  suppressionByChance: boolean;
  /** The last turn the attackers have to win in (rules decision 58); undefined: none. */
  readonly timeLimit: number | undefined;
  /** Smoke screens fired from the tubes, a side and weapon each: missions spent (rules decision 56). */
  private readonly smokeMissions: { side: Side; weapon: string }[] = [];
  /** Each side's command group in command at the start of the turn (null: none left), rules decision 55. */
  private readonly inCommand = new Map<Side, string | null>();
  /** The turn each side's successor is in command from (rules decision 55). */
  private readonly successionUntil = new Map<Side, number>();
  /** Command groups still in command at the last turn's start, by id (rules decision 55). */
  private readonly groupsInCommand = new Set<string>();
  /**
   * A command group lost, and until when the forces it commanded — lower
   * echelons within its reach — take no new orders (rules decision 55).
   */
  private readonly handovers: { side: Side; echelon: Echelon; at: Point; until: number }[] = [];
  /**
   * Where the location error is drawn from: its own stream (see `unitSeed`),
   * so turning it on moves no other roll in the game.
   */
  private readonly locationRng: Rng;
  /** Bounds each force has made — which stand a report was of (rules decision 51). */
  private readonly bounds = new Map<string, number>();
  /**
   * How many of {@link registeredTargets} came with the options rather than
   * from mission planning — the recording's header carries those, its journal
   * the rest.
   */
  private readonly presetTargets: number;
  /** Alternate positions prepared in mission planning (rules decision 38). */
  private readonly prepared: PreparedPosition[] = [];
  /**
   * How many teams have been detached from each force, so the next one's
   * default id is predictable (`detachTeam`). Not part of the state a
   * recording replays — every id is journalled explicitly — but it has to
   * be rebuilt on replay so a later default id does not collide.
   */
  private readonly teamsDetached = new Map<string, number>();
  /** Alternate positions prepared in mission planning — copies. */
  get preparedPositions(): PreparedPosition[] {
    return cloneForRecord(this.prepared);
  }
  /** Every fire mission called, in the order called. */
  private readonly missions: FireMission[] = [];
  /** Turns each side's fire units have fired, by `side:weapon` — what tires them (rules decision 42). */
  private readonly fireUnitTurns = new Map<string, number>();
  /** Every fire mission called, in the order called — copies: change them and nothing happens. */
  get fireMissions(): FireMission[] {
    return cloneForRecord(this.missions);
  }

  /** The ground as it stands now, buildings damaged and brought down included (rules decision 76). */
  get terrain(): Terrain {
    return this.ground;
  }

  /** What HE has done to a building on the map (rules decision 76). */
  structureState(objectId: string): StructureState {
    const o = this.mapTerrain.objects.find((x) => x.id === objectId);
    if (!o || o.kind !== "building") return "intact";
    return stateOfStructure(o, this.structureDamage.get(objectId) ?? 0);
  }

  /**
   * A round of `weapon` struck the building `o`: wear it down, and when it
   * changes state, rebuild the live view of the ground. Returns its state
   * after the round. Nothing happens to an object that is not a building.
   */
  private strikeStructure(
    o: MapObject,
    weapon: string,
    crushed: { unitId: string; casualties: number }[] = [],
  ): StructureState | undefined {
    if (!this.structuresTakeDamage || o.kind !== "building") return undefined;
    // Struck by a round of the same volley after it came down: rubble is not a building.
    if (this.structureState(o.id) === "rubble") return "rubble";
    const points = STRUCTURE_DAMAGE[weapon] ?? 0;
    const before = stateOfStructure(o, this.structureDamage.get(o.id) ?? 0);
    const total = (this.structureDamage.get(o.id) ?? 0) + points;
    if (points > 0) this.structureDamage.set(o.id, total);
    const after = stateOfStructure(o, total);
    if (after !== before) this.rebuildGround();
    if (after === "rubble" && before !== "rubble") crushed.push(...this.collapseOn(o));
    return after;
  }

  /**
   * A building comes down on the men inside it (2026-10-03): each fit man
   * dies at {@link COLLAPSE_KILLS} — Arnold et al. 2004, a quarter killed
   * at once where the structure collapsed.
   */
  private collapseOn(o: MapObject): { unitId: string; casualties: number }[] {
    const crushed: { unitId: string; casualties: number }[] = [];
    for (const u of this.units) {
      if (u.kind === "vehicle" || distanceToFootprint(o.footprint, u.position) > OBJECT_COVER_REACH_M) continue;
      let casualties = 0;
      for (const s of u.soldiers ?? []) {
        if (s.neutralized || !this.rng.chance(COLLAPSE_KILLS)) continue;
        killOutright(s);
        casualties++;
      }
      if (!casualties) continue;
      u.hitThisTurn = true;
      refreshUnitStatus(u);
      crushed.push({ unitId: u.id, casualties });
      this.tally.crushed += casualties;
    }
    return crushed;
  }

  /** The map with every damaged building holed and every one brought down turned to rubble. */
  private rebuildGround(): void {
    this.ground = {
      ...this.mapTerrain,
      objects: this.mapTerrain.objects.map((o) => {
        if (o.kind !== "building") return o;
        const state = stateOfStructure(o, this.structureDamage.get(o.id) ?? 0);
        if (state === "rubble") return { id: o.id, kind: "rubble" as const, footprint: o.footprint };
        if (state === "damaged") return { ...o, damaged: true };
        return o;
      }),
    };
  }

  /**
   * A shell landing on a building (rules decision 77): the chance it goes
   * through the roof, and who is inside. Undefined off a building.
   */
  private throughTheRoof(weapon: string, impact: Point) {
    const chance = ROOF_PENETRATION[weapon];
    if (!chance) return undefined;
    const building = this.ground.objects.find(
      (o) => o.kind === "building" && distanceToFootprint(o.footprint, impact) === 0,
    );
    if (!building) return undefined;
    // A fight going on under it (decision 98): the round bursts in the
    // top-storey room under where it came through, and the roof still keeps
    // it from the rest of the men inside.
    const room = this.windowFire ? this.interior.roomBurst(this, building.id, { roof: impact }) : undefined; // a Map whenever a fight is on
    const fighters = new Set(this.interior.fightersIn(building.id));
    return {
      chance,
      factor: ENCLOSED_BLAST_FACTOR,
      inside: (u: Unit) => u.kind === "infantry" && distanceToFootprint(building.footprint, u.position) <= OBJECT_COVER_REACH_M,
      ...(room
        ? {
            room: {
              pools: (u: Unit) => room.get(u.id),
              rest: (u: Unit) => {
                if (!fighters.has(u.id)) return undefined;
                const inRoom = room.get(u.id);
                return new Set((u.soldiers ?? []).filter((m) => !inRoom?.has(m.id)).map((m) => m.id));
              },
            },
          }
        : {}),
    };
  }

  /**
   * A direct round's chance of going in through a window or a slit at the
   * target (rules decision 77): a window where it is in a building, a slit
   * where it holds a position prepared before the battle. Undefined where it
   * has neither, or the weapon has no figure.
   */
  private throughTheWindow(weapon: string, attacker: Unit, target: Unit, windows?: WindowExchange) {
    const figures = CRITICAL_CHANCE[weapon];
    if (!figures || target.kind !== "infantry") return undefined;
    const aperture = this.buildingAt(target.position) ? figures.window : target.baseCover === "full" ? figures.slit : undefined;
    const chance = aperture ? lookupBand(aperture, distance(attacker.position, target.position))?.value : undefined;
    if (!chance) return undefined;
    // A force fighting inside (decision 98): through the window of the man
    // aimed at — the nearest the firer can see at one — into his room, among
    // everyone in it. Seen only in the street, there is no window to go in by.
    if (windows?.pool) {
      if (!windows.window) return undefined;
      const building = this.buildingAt(target.position);
      const room = building ? this.interior.roomBurst(this, building.id, { soldierId: windows.window }) : undefined;
      if (!room) return undefined;
      return {
        chance,
        factor: ENCLOSED_BLAST_FACTOR,
        room: { candidates: [...room.keys()].map((id) => this.getUnit(id)), pools: (u: Unit) => room.get(u.id) },
      };
    }
    return { chance, factor: ENCLOSED_BLAST_FACTOR };
  }

  /**
   * Fire between two forces where either fights inside a building (rules
   * decision 98), man by man through the windows: which of the firer's men
   * can fire — those at a window facing the target, each with a sight line
   * to it — and which of the target's men can be hit — those at a window
   * facing the firer, or still in the street, each seen by someone. A force
   * in no fight fires and is seen as a whole, from where it stands.
   * Undefined when neither fights inside, or the rule is off.
   */
  private throughWindows(firer: Unit, target: Unit): WindowExchange | undefined {
    if (!this.windowFire) return undefined;
    const firerShown = this.interior.shown(this, firer.id, target.position);
    const targetShown = this.interior.shown(this, target.id, firer.position);
    if (!firerShown && !targetShown) return undefined;
    const firerPts = firerShown ?? [{ soldierId: "", point: firer.position, height: eyeHeight(firer) }];
    const targetPts = targetShown ?? [{ soldierId: "", point: target.position, height: eyeHeight(target) }];
    const sees = (a: { point: Point; height: number }, b: { point: Point; height: number }) =>
      !(SMOKE_BLOCKS_FIRE && this.smoke.some((sm) => segmentIntersectsCircle(a.point, b.point, sm.center, sm.radius))) &&
      !terrainBlocksSight(this.terrain, a.point, a.height, b.point, b.height);
    const shooters = firerShown ? new Set(firerShown.filter((f) => targetPts.some((t) => sees(f, t))).map((f) => f.soldierId)) : undefined;
    const seenMen = targetShown?.filter((t) => firerPts.some((f) => sees(f, t)));
    const pool = seenMen ? new Set(seenMen.map((t) => t.soldierId)) : undefined;
    // The window a round aimed at it goes in by: the nearest seen at one.
    const atWindows = (seenMen ?? []).filter((t) => t.facing).sort((a, b) => distance(a.point, firer.position) - distance(b.point, firer.position));
    const seen = (shooters === undefined || shooters.size > 0) && (pool === undefined || pool.size > 0);
    return { seen, ...(shooters ? { shooters } : {}), ...(pool ? { pool } : {}), ...(atWindows[0] ? { window: atWindows[0].soldierId } : {}) };
  }

  /** Two forces fighting each other inside a building fight there, room by room, and not through the rules outside (decision 98). */
  private sameFightRefusal(a: Unit, b: Unit): string | undefined {
    const fight = this.interior.engagementOf(a.id);
    return fight && fight === this.interior.engagementOf(b.id) ? INTERIOR_REFUSAL.fightingInside : undefined;
  }

  /**
   * Can `firer` fire at `target` at all: not the enemy it fights room by
   * room, and someone of each in sight of the other — through the windows
   * where either fights inside (decision 98), from force to force otherwise.
   * What a computer player should aim by, since it is what the engine fires by.
   */
  canEngage(firer: Unit, target: Unit): boolean {
    if (!this.windowFire) return this.hasLineOfSight(firer, target); // as recorded before it
    if (this.sameFightRefusal(firer, target)) return false;
    const windows = this.throughWindows(firer, target);
    return windows ? windows.seen : this.hasLineOfSight(firer, target);
  }

  /**
   * Can `observer` see `target` to spot it: through the windows where either
   * fights inside a building, as fire goes (the author, 2026-10-20, decision
   * 98) — and two forces fighting each other inside see each other — from
   * force to force otherwise.
   */
  spots(observer: Unit, target: Unit): boolean {
    if (!this.windowFire) return this.hasLineOfSight(observer, target); // as recorded before it
    if (this.sameFightRefusal(observer, target)) return true;
    const windows = this.throughWindows(observer, target);
    return windows ? windows.seen : this.hasLineOfSight(observer, target);
  }

  /** How many of a force fighting inside can fire at `target` from its windows; undefined for a force in no fight (decision 98). */
  windowShooters(firer: Unit, target: Unit): number | undefined {
    const shooters = this.throughWindows(firer, target)?.shooters;
    // A broken man at a window keeps his head down, as he does outside (decision 19).
    return shooters ? readySoldiers(firer).filter((s) => shooters.has(s.id)).length : undefined;
  }

  /** Whether the checked figures are in play: they amend the research ones (rules decision 79). */
  private get checked(): Checked {
    if (!this.checkedFigures || this.lethality !== "research") return false;
    return this.aresFigures ? "ares" : "checked";
  }

  /**
   * What a shell or a bomb does to men by posture and cover. On the checked
   * figures a mortar bomb finds men down at ×0.5: FM 7-90 B-5a, "mortar fire
   * against standing enemy forces is almost twice as effective as fire
   * against prone targets" (rules decision 79). The 0.36 stays the 155 mm's.
   */
  private shellTable(weapon: string): ShellVsMen {
    let table = shellVsMen(this.shellCover);
    // An air burst covers ×1.15 the impact's area, not ×1.28 (decision 80).
    if (this.checked === "ares") table = { ...table, airburst: { ...table.airburst, ...ARES_AIRBURST } };
    // Every mortar's bomb, the 60 and 120 mm too (decision 93): B-5a is said of mortar fire.
    if (!this.checked || !MORTARS.has(weapon)) return table;
    return { ...table, impact: { ...table.impact, down: MORTAR_DOWN_CHECKED } };
  }

  /** The building a force at `p` is in or against, if any. */
  private buildingAt(p: Point): MapObject | undefined {
    return this.ground.objects.find(
      (o) => (o.kind === "building") && distanceToFootprint(o.footprint, p) <= OBJECT_COVER_REACH_M,
    );
  }
  turn = 0;
  phase: Phase = "summary"; // pre-game; first beginTurn() starts turn 1
  units: Unit[] = [];
  mines: Mine[] = [];
  smoke: SmokeScreen[] = [];
  pendingFire: PendingFireMission[] = [];
  pendingSmoke: PendingSmokeMission[] = [];
  initiativeOrder: Side[] = [];

  /** Turn each unit last received orders, for the C2 interval rule. */
  private lastOrderTurn = new Map<string, number>();
  /** Metres each force has climbed this turn, for fatigue (rules decision 71). */
  private readonly climbedThisTurn = new Map<string, number>();

  /** What each side has picked up of the other; empty unless `trackIntel`. */
  private readonly intel = new IntelLedger();

  /** The order each force is still working to, until new ones reach it. */
  private standingOrders = new Map<string, StandingOrder>();

  /** What this turn's fire did to each force, for the morale step (decision 19). */
  private readonly stress = new StressLedger();
  /** Every soldier as he stood when the turn began, for the morale step. */
  private turnSnapshot: SoldierSnapshot = new Map();



  /**
   * Set while the engine is carrying out a standing order. Execution bypasses
   * the C2 gate — the whole point is that a force out of contact still acts —
   * and must not stamp the order clock, since no new order was received.
   */
  private executingOrders = false;

  /**
   * Set while covering fire is being resolved. A reaction is not an action:
   * without this, two opposing covering forces would answer each other until
   * the stack gave out (rules decision 18).
   */
  private reacting = false;

  /**
   * Ids are numbered per game, not per process: two games from the same seed
   * and the same actions must produce byte-identical state, which a counter
   * shared across instances would break.
   */
  private idCounter = 0;
  private nextId(prefix: string): string {
    return `${prefix}-${++this.idCounter}`;
  }

  /**
   * Every action taken on this game, in order — enough to replay it exactly.
   * Actions are journalled after they succeed, so a rejected move leaves no
   * trace, and nested calls (advanceToPhase driving advancePhase) record only
   * the outermost one.
   */
  private readonly actions: RecordedAction[] = [];
  /**
   * Fire each force has received, turn by turn: derived as fire resolves (a
   * replay rebuilds it), never recorded. The umpire's: who fired is truth,
   * and {@link fireReceived}'s caller decides what a side may be told.
   */
  private readonly fireLog: ReceivedFire[] = [];
  private journalDepth = 0;

  private journal(action: RecordedAction): void {
    if (this.journalDepth === 0) {
      this.actions.push(action);
      // Whatever broke a side just now, its men inside stop (decision 102). Derived and drawing nothing, so a replay does the same.
      this.settleBreaksInside();
    }
  }

  /** Reports of fights inside that a side's break ended mid-turn, for the next phase change to hand back (decision 102). */
  private brokenInside: InteriorReport[] = [];

  /**
   * The fights inside a side's break has ended since they were last handed
   * back (decision 102): for a game that stops at the break, before the turn
   * closes and would hand them back itself.
   */
  takeBrokenInside(): InteriorReport[] {
    return this.brokenInside.splice(0);
  }

  /**
   * A side that has broken stops fighting inside (rules decision 102): both
   * sides judged together, then each fight it is in ended. Done whenever a
   * side may have broken — after every action, and as the turn closes.
   */
  private settleBreaksInside(): InteriorReport[] {
    if (!this.breakEndsInside || !this.closedTerrain || !this.morale || this.interior.engagements.length === 0) return [];
    const broken = new Set((["BLUE", "RED"] as const).filter((side) => this.sideBroken(side)));
    if (broken.size === 0) return [];
    const { reports, surrendered } = this.interior.endOnBreak({ units: this.units, terrain: this.terrain, turn: this.turn, seed: this.seed }, broken);
    // As the morale step's surrender does (decision 19): nothing left to do, nothing ordered.
    for (const id of surrendered) {
      this.abandonWork(this.getUnit(id));
      this.standingOrders.delete(id);
    }
    this.brokenInside.push(...reports);
    return reports;
  }

  /** Run `fn` without journalling the public actions it calls internally. */
  private internally<T>(fn: () => T): T {
    this.journalDepth++;
    try {
      return fn();
    } finally {
      this.journalDepth--;
    }
  }

  constructor(opts: GameOptions) {
    this.seed = opts.seed;
    this.rng = new Rng(opts.seed);
    this.sides = opts.sides ?? ["RED", "BLUE"];
    this.enforceC2 = opts.enforceC2 ?? true;
    this.trackIntel = opts.trackIntel ?? false;
    this.mapTerrain = opts.terrain ?? FLAT_GROUND;
    this.ground = this.mapTerrain;
    this.morale = opts.morale ?? false;
    this.variants = opts.variants ?? {};
    this.commandEchelons = { ...(opts.commandEchelon ?? {}) };
    for (const [side, e] of Object.entries(this.commandEchelons)) {
      if (!this.sides.includes(side as Side) || !Object.hasOwn(ECHELON_RANK, e)) {
        throw new Error(`commandEchelon: cannot read ${side}: ${JSON.stringify(e)}`);
      }
    }
    this.fireSupportByEchelon = opts.fireSupportByEchelon ?? true;
    this.lethality = opts.lethality ?? "research";
    this.climbCostPerMetre = opts.climbCostPerMetre ?? SLOPE.climbCostPerMetre;
    this.shellCover = opts.shellCover ?? "sources";
    this.suppressionReach = opts.suppressionReach ?? true;
    this.roofsDampSuppression = opts.roofsDampSuppression ?? true;
    this.directHeAsShell = opts.directHeAsShell ?? true;
    this.structuresTakeDamage = opts.structuresTakeDamage ?? true;
    this.criticalHits = opts.criticalHits ?? true;
    this.armour = opts.armour ?? "research";
    this.checkedFigures = opts.checkedFigures ?? true;
    this.aresFigures = opts.aresFigures ?? true;
    this.directHeBombards = opts.directHeBombards ?? true;
    this.mediumMg = opts.mediumMg ?? true;
    this.qualityGap = opts.qualityGap ?? true;
    this.directionalCover = opts.directionalCover ?? true;
    this.readiness = opts.readiness ?? true;
    this.qualityGapGrenades = opts.qualityGapGrenades ?? true;
    this.qualityBreakpoint = opts.qualityBreakpoint ?? true;
    this.traitEffects = opts.traitEffects ?? true;
    this.fatigue = opts.fatigue ?? true;
    this.agilityFireOrder = opts.agilityFireOrder ?? true;
    this.headsDown = opts.headsDown ?? true;
    this.assaultNerve = opts.assaultNerve ?? true;
    this.pinnedFiresAtRange = opts.pinnedFiresAtRange ?? true;
    this.fireOnTheMove = opts.fireOnTheMove ?? 1;
    this.nerveByCover = opts.nerveByCover ?? true;
    this.nerveInOpen = opts.nerveInOpen ?? NERVE_BY_COVER.none;
    this.attackerBreakpoint = opts.attackerBreakpoint ?? SIDE_BREAK_BY_POSTURE.attacking;
    for (const [key, v] of [["nerveInOpen", this.nerveInOpen], ["attackerBreakpoint", this.attackerBreakpoint]] as const) {
      if (!(Number.isFinite(v) && v >= 0)) throw new Error(`${key}: cannot read ${v}`);
    }
    if (!(this.climbCostPerMetre >= 0 && Number.isFinite(this.climbCostPerMetre))) {
      throw new Error(`climbCostPerMetre: cannot read ${this.climbCostPerMetre}`);
    }
    this.attackers = [...(opts.attackers ?? [])];
    this.locationError = opts.locationError ?? false;
    this.stillDetection = opts.stillDetection ?? false;
    this.binoculars = opts.binoculars ?? false;
    this.keepEyesOn = opts.keepEyesOn ?? false;
    this.commandSuccession = opts.commandSuccession ?? false;
    this.smokeCostsMission = opts.smokeCostsMission ?? true;
    this.smokeNeedsThrower = opts.smokeNeedsThrower ?? true;
    this.closedTerrain = opts.closedTerrain ?? true;
    this.windowFire = opts.windowFire ?? true;
    this.joinFights = opts.joinFights ?? true;
    this.breakEndsInside = opts.breakEndsInside ?? true;
    this.moraleInside = opts.moraleInside ?? true;
    this.counterattackInside = opts.counterattackInside ?? true;
    this.keepStaleMarks = opts.keepStaleMarks ?? true;
    this.suppressionByVolume = opts.suppressionByVolume ?? true;
    this.suppressionByChance = opts.suppressionByChance ?? true;
    this.timeLimit = opts.timeLimit;
    if (this.timeLimit !== undefined && !(Number.isInteger(this.timeLimit) && this.timeLimit > 0)) {
      throw new Error(`timeLimit: cannot read ${JSON.stringify(opts.timeLimit)}`);
    }
    // Without the knowledge model nothing is reported, so nothing could be off.
    if (this.locationError && !this.trackIntel) throw new Error("locationError needs trackIntel");
    if (this.stillDetection && !this.trackIntel) throw new Error("stillDetection needs trackIntel");
    if (this.binoculars && !this.trackIntel) throw new Error("binoculars needs trackIntel");
    if (this.keepEyesOn && !this.trackIntel) throw new Error("keepEyesOn needs trackIntel");
    this.locationRng = new Rng(unitSeed(opts.seed, LOCATION_ERROR_STREAM));
    if (this.attackers.some((s) => !this.sides.includes(s))) throw new Error(`attackers: cannot read ${JSON.stringify(opts.attackers)}`);
    if (!LETHALITIES.includes(this.lethality)) throw new Error(`lethality: cannot read ${JSON.stringify(opts.lethality)}`);
    // The allotments first: an allotment grants its weapon's call (decision 95),
    // so a registered target for it is read against it.
    this.fireSupport = cloneForRecord(opts.fireSupport ?? {});
    for (const t of opts.registeredTargets ?? []) {
      if (!this.sides.includes(t.side) || !isIndirect(t.weapon) || !Number.isFinite(t.at?.x) || !Number.isFinite(t.at?.y)) {
        throw new Error(`registeredTargets: cannot read ${JSON.stringify(t)}`);
      }
      // Before any force is on the map only a declared echelon can be checked;
      // an undeclared one is checked when the side calls on the target.
      if (this.commandEchelons[t.side]) this.requireMayCall(t.side, t.weapon);
      this.registeredTargets.push({ side: t.side, weapon: t.weapon, at: { x: t.at.x, y: t.at.y } });
    }
    this.onTheMark.push(...this.registeredTargets);
    this.presetTargets = this.registeredTargets.length;
    for (const [side, list] of Object.entries(this.fireSupport)) {
      if (!this.sides.includes(side as Side) || !Array.isArray(list)) {
        throw new Error(`fireSupport: cannot read ${side}: ${JSON.stringify(list)}`);
      }
      const weapons = new Set<string>();
      for (const a of list) {
        const rounds = a.roundsForEffect ?? this.defaultRoundsForEffect(a.weapon) ?? NaN;
        if (
          !isIndirect(a.weapon) ||
          weapons.has(a.weapon) ||
          !Number.isInteger(a.missions) ||
          a.missions < 0 ||
          !Number.isInteger(rounds) ||
          rounds < 1 ||
          rounds > MAX_ROUNDS_PER_MISSION ||
          (a.tubes !== undefined && (!Number.isInteger(a.tubes) || a.tubes < 1 || a.tubes > MAX_FIRE_UNIT_TUBES))
        ) {
          throw new Error(`fireSupport.${side}: cannot read ${JSON.stringify(a)} (one entry a weapon)`);
        }
        // The 60 and 120 mm are research figures only (decision 93).
        if (DOCTRINE_MORTARS[a.weapon] && this.lethality !== "research") {
          throw new Error(`fireSupport.${side}: ${a.weapon} is played on the research figures only`);
        }
        weapons.add(a.weapon);
        // Written in, so the recording carries the number it was played with
        // rather than whatever the default is when it is replayed.
        a.roundsForEffect = rounds;
        if (this.commandEchelons[side as Side]) this.requireMayCall(side as Side, a.weapon);
      }
    }
  }

  /**
   * The echelon `side`'s player commands (rules decision 37): as declared, or
   * else the highest of its forces put on the map, and a squad's when it has
   * none. A force that is out still counts: losing the company's command group
   * does not make its player a platoon commander.
   */
  commandEchelonOf(side: Side): Echelon {
    const declared = this.commandEchelons[side];
    if (declared) return declared;
    let top: Echelon = "squad";
    for (const u of this.units) if (u.side === side && ECHELON_RANK[u.echelon] > ECHELON_RANK[top]) top = u.echelon;
    return top;
  }

  /**
   * Whether `side` may call `weapon` at all (rules decision 37): mortars at
   * company and above, artillery at battalion and above — or at company, when
   * its superior echelon allots it missions (decision 95). A weapon with no
   * floor — a grenade's smoke — anybody may use.
   */
  mayCall(side: Side, weapon: string): boolean {
    // Somebody has to call it (rules decision 55): not while command changes hands.
    if (FIRE_SUPPORT_MIN_ECHELON[weapon] && !this.hasFireControl(side)) return false;
    if (!this.fireSupportByEchelon) return true;
    const rank = ECHELON_RANK[this.commandEchelonOf(side)];
    // Allotted by its superior echelon, scenario by scenario (rules decision
    // 95, after 94): a company calls the artillery it is given. Below company
    // there is still no indirect fire at all (decision 37).
    if (rank >= ECHELON_RANK.company && this.fireSupport[side]?.some((a) => a.weapon === weapon && a.missions > 0)) return true;
    const floor = FIRE_SUPPORT_MIN_ECHELON[weapon];
    return !floor || rank >= ECHELON_RANK[floor];
  }

  private requireMayCall(side: Side, weapon: string): void {
    if (FIRE_SUPPORT_MIN_ECHELON[weapon] && !this.hasFireControl(side)) {
      throw new Error(`${side} has no commander in command to call ${weapon} (rules decision 55)`);
    }
    if (!this.mayCall(side, weapon)) {
      throw new Error(
        `${side} commands a ${this.commandEchelonOf(side)}: ${weapon} is called from ${FIRE_SUPPORT_MIN_ECHELON[weapon]} and above`,
      );
    }
  }

  /**
   * Snapshot this game as a replayable recording — seed plus the action log.
   * Feed it to {@link replayGame} to reconstruct the game exactly.
   */
  toRecording(): GameRecording {
    return {
      version: 1,
      seed: this.seed,
      sides: [...this.sides],
      enforceC2: this.enforceC2,
      trackIntel: this.trackIntel,
      ...(this.morale ? { morale: true } : {}),
      ...(Object.keys(this.variants).length ? { variants: cloneForRecord(this.variants) } : {}),
      ...(this.presetTargets ? { registeredTargets: cloneForRecord(this.registeredTargets.slice(0, this.presetTargets)) } : {}),
      ...(Object.keys(this.fireSupport).length ? { fireSupport: cloneForRecord(this.fireSupport) } : {}),
      ...(Object.keys(this.commandEchelons).length ? { commandEchelon: { ...this.commandEchelons } } : {}),
      ...(this.fireSupportByEchelon ? { fireSupportByEchelon: true } : {}),
      lethality: this.lethality,
      climbCostPerMetre: this.climbCostPerMetre,
      shellCover: this.shellCover,
      ...(this.suppressionReach ? { suppressionReach: true } : {}),
      ...(this.roofsDampSuppression ? { roofsDampSuppression: true } : {}),
      ...(this.directHeAsShell ? { directHeAsShell: true } : {}),
      ...(this.structuresTakeDamage ? { structuresTakeDamage: true } : {}),
      ...(this.criticalHits ? { criticalHits: true } : {}),
      armour: this.armour,
      ...(this.checkedFigures ? { checkedFigures: true } : {}),
      ...(this.aresFigures ? { aresFigures: true } : {}),
      ...(this.directHeBombards ? { directHeBombards: true } : {}),
      ...(this.mediumMg ? { mediumMg: true } : {}),
      ...(this.qualityGap ? { qualityGap: true } : {}),
      ...(this.directionalCover ? { directionalCover: true } : {}),
      ...(this.readiness ? { readiness: true } : {}),
      ...(this.qualityGapGrenades ? { qualityGapGrenades: true } : {}),
      ...(this.qualityBreakpoint ? { qualityBreakpoint: true } : {}),
      ...(this.traitEffects ? { traitEffects: true } : {}),
      ...(this.fatigue ? { fatigue: true } : {}),
      ...(this.agilityFireOrder ? { agilityFireOrder: true } : {}),
      ...(this.headsDown ? { headsDown: true } : {}),
      ...(this.assaultNerve ? { assaultNerve: true } : {}),
      ...(this.pinnedFiresAtRange ? { pinnedFiresAtRange: true } : {}),
      ...(this.fireOnTheMove !== 1 ? { fireOnTheMove: this.fireOnTheMove } : {}),
      ...(this.nerveByCover ? { nerveByCover: true } : {}),
      nerveInOpen: this.nerveInOpen,
      attackerBreakpoint: this.attackerBreakpoint,
      ...(this.attackers.length ? { attackers: [...this.attackers] } : {}),
      ...(this.locationError ? { locationError: true } : {}),
      ...(this.stillDetection ? { stillDetection: true } : {}),
      ...(this.binoculars ? { binoculars: true } : {}),
      ...(this.keepEyesOn ? { keepEyesOn: true } : {}),
      ...(this.commandSuccession ? { commandSuccession: true } : {}),
      ...(this.smokeCostsMission ? { smokeCostsMission: true } : {}),
      ...(this.smokeNeedsThrower ? { smokeNeedsThrower: true } : {}),
      ...(this.closedTerrain ? { closedTerrain: true } : {}),
      ...(this.windowFire ? { windowFire: true } : {}),
      ...(this.joinFights ? { joinFights: true } : {}),
      ...(this.breakEndsInside ? { breakEndsInside: true } : {}),
      ...(this.moraleInside ? { moraleInside: true } : {}),
      ...(this.counterattackInside ? { counterattackInside: true } : {}),
      ...(this.keepStaleMarks ? { keepStaleMarks: true } : {}),
      ...(this.suppressionByVolume ? { suppressionByVolume: true } : {}),
      ...(this.suppressionByChance ? { suppressionByChance: true } : {}),
      ...(this.timeLimit !== undefined ? { timeLimit: this.timeLimit } : {}),
      // The ground is part of what the decisions were taken on: a replay
      // without it would clear every sight line the battle was fought around.
      ...(this.mapTerrain === FLAT_GROUND ? {} : { terrain: cloneForRecord(this.mapTerrain) }),
      actions: cloneForRecord(this.actions),
    };
  }

  // ---- setup ----

  addUnit(unit: Unit): Unit {
    // A force is placed with the protection it already has, from the first
    // turn rather than the first upkeep: whatever the ground offers where it
    // stands, *and* the position it prepared before the battle — "a force that
    // prepared the position before battle should start dug in" (author,
    // 2026-09-16; rules decision 12). It used to hold only the ground's own
    // objects, which left a prepared defender standing in the open through the
    // whole of turn 1 — latent until a scenario first set `baseCover`.
    //
    // Not quite upkeep's expression: upkeep *recomputes* `cover` from
    // `baseCover`, the ground and the digging, discarding what was there, while
    // this only ever raises what the caller set. So a force dressed with
    // `cover` directly at setup keeps that cover for turn 1 and loses it at the
    // first upkeep — which is the bug just fixed, one field over. **Dress a
    // force for setup with `baseCover`**, which is what the scenario tool
    // writes and what this reads; `cover` is derived, and upkeep owns it.
    //
    // Done before the journal entry, so the recording carries the force as the
    // game sees it.
    unit.cover = betterCover(
      betterCover(unit.cover, unit.baseCover),
      coverFromObjects(this.terrain, unit.position),
    );
    // A position prepared before the battle faces the arc it was set to watch,
    // unless its spec gave it a front (decision 85).
    if (this.directionalCover && unit.front === undefined && unit.baseCover !== "none" && unit.observationSector) {
      unit.front = unit.observationSector.bearing;
    }
    // Its men's traits and pools, from their own stream — see `unitSeed` for
    // why not the game's rng. Before the journal entry, like the cover: the
    // recording carries the men as they were drawn, and a replay keeps them.
    if (this.morale) generateMorale(unit, this.seed);
    // Which of the traits' rules act on its men (decisions 69 and 71): the
    // game's switches, read off the force where the men are hit and aim.
    // Set from the options every time, so a replay plays the recording's.
    const rules = {
      ...(this.morale && this.traitEffects ? { effects: true as const } : {}),
      ...(this.morale && this.fatigue ? { fatigue: true as const } : {}),
    };
    if (unit.soldiers && (rules.effects || rules.fatigue)) unit.traitRules = rules;
    else delete unit.traitRules;
    // An observation post is put out in planning, not brought along
    // (rules decision 38).
    delete unit.observationPost;
    this.units.push(unit);
    this.journal({ kind: "addUnit", unit: cloneForRecord(unit) });
    return unit;
  }

  /**
   * Put a charge on the ground before the battle.
   *
   * This is the **setup** act: the defending player lays his minefields and
   * IEDs while the game is being laid out (rules decision 16). Once the first
   * turn has begun a charge only reaches the ground the slow way, by a force
   * laying it — see {@link layCharge}.
   */
  addMine(mine: Omit<Mine, "id">): Mine {
    if (this.turn > 0) {
      throw new PhaseError(
        "Charges are emplaced during setup; in play a force lays one (layCharge)",
      );
    }
    const m: Mine = { ...mine, id: this.nextId("mine") };
    this.mines.push(m);
    // The id is not recorded: replay regenerates it from its own counter, and
    // the same sequence of calls yields the same ids.
    this.journal({ kind: "addMine", mine: cloneForRecord(mine) });
    return m;
  }

  getUnit(id: string): Unit {
    const u = this.units.find((u) => u.id === id);
    if (!u) throw new Error(`No such unit: ${id}`);
    return u;
  }

  // ---- turn / phase progression ----

  /** Start the next turn: roll initiative and enter the initiative phase. */
  beginTurn(): { turn: number; initiativeOrder: Side[] } {
    this.checkFirePlans();
    this.turn += 1;
    this.noteSuccession();
    this.phase = "initiative";
    this.initiativeOrder = this.rollInitiative();
    if (this.morale) {
      // The turn's ledgers start clean: casualties are found against this.
      this.turnSnapshot = snapshotSoldiers(this.units);
      this.stress.clear();
      refreshMoraleStates(this.units, this.turn);
    }
    this.journal({ kind: "beginTurn" });
    return { turn: this.turn, initiativeOrder: this.initiativeOrder };
  }

  /**
   * As planning ends: now the forces are on the map, an undeclared side's
   * echelon is known, and its fire plan is checked against it (decision 37).
   * Before anything else moves, so a refusal leaves the game as it was.
   */
  private checkFirePlans(): void {
    if (this.turn !== 0) return;
    for (const [side, list] of Object.entries(this.fireSupport)) {
      for (const a of list ?? []) if (a.missions > 0) this.requireMayCall(side as Side, a.weapon);
    }
    for (const t of this.registeredTargets) this.requireMayCall(t.side, t.weapon);
  }

  /**
   * Roll 1d10 per side and order sides by descending initiative. A tie is
   * rolled again (author, 2026-09-23): the document says nothing about ties,
   * and giving them to the side listed first handed RED the first move on 55%
   * of turns (docs/balance.md).
   */
  rollInitiative(): Side[] {
    for (;;) {
      const rolls = this.sides.map((side) => ({ side, roll: roll(this.rng, "1d10") }));
      if (new Set(rolls.map((r) => r.roll)).size < rolls.length) continue;
      rolls.sort((a, b) => b.roll - a.roll);
      return rolls.map((r) => r.side);
    }
  }

  /**
   * Advance to the next phase. Entering `resolvePriorArty` auto-resolves due
   * indirect-fire missions; advancing past `summary` runs end-of-turn upkeep
   * and begins the next turn. Returns anything the phase transition resolved.
   */
  advancePhase(): {
    phase: Phase;
    resolved?: IndirectFireResult[];
    smokeArrived?: SmokeScreen[];
    observed?: Observation[];
    chargeWork?: ChargeWorkReport[];
    morale?: MoraleReport[];
    interior?: InteriorReport[];
  } {
    const result = this.internally(() => {
      if (this.phase === "summary") {
        this.checkFirePlans();
        // The minute inside every building being fought for (rules decision
        // 96), before the upkeep: the morale step finds its losses itself.
        const interior = this.closedTerrain
          ? this.interior.resolveTurn({ units: this.units, terrain: this.terrain, turn: this.turn, seed: this.seed, contact: (a, b) => this.exchangeContact(a, b), windowFire: this.windowFire, moraleInside: this.moraleInside && this.morale, counterattackInside: this.counterattackInside })
          : [];
        // The turn ends here, and with it any charge-laying work that was
        // going on: the step that closes the turn reports what became of it.
        const { chargeWork, morale } = this.endOfTurnUpkeep();
        // A side that has broken stops fighting inside too (decision 102): judged on the state the morale step left.
        this.settleBreaksInside();
        interior.push(...this.brokenInside.splice(0));
        this.beginTurn();
        return { phase: this.phase, chargeWork, ...(this.morale ? { morale } : {}), ...(interior.length ? { interior } : {}) };
      }
      const idx = PHASES.indexOf(this.phase);
      this.phase = PHASES[idx + 1]!;
      if (this.phase === "targeting") {
        // Missions in hand carry on by themselves: the next adjusting round,
        // or the rounds for effect (rules decision 34).
        for (const m of this.missions) if (m.status === "adjusting") this.stepFireMission(m);
      }
      if (this.phase === "resolvePriorArty") {
        // Screens go down before the rounds land, so a smoke mission fired on
        // the same turn as an HE mission cannot be walked through by its own
        // barrage.
        const smokeArrived = this.resolveDueSmoke();
        return { phase: this.phase, resolved: this.resolveDueFireMissions(), smokeArrived };
      }
      if (this.phase === "combat") {
        // Movement is over: every force still in position reports what it can
        // see from where it stands (rules decision 12).
        return { phase: this.phase, observed: this.observeFromPositions() };
      }
      return { phase: this.phase };
    });
    this.journal({ kind: "advancePhase" });
    return result;
  }

  /**
   * Advance repeatedly until the given phase is current. Convenience for
   * callers (and tests) that want to skip directly to a phase; will roll into
   * subsequent turns if the target lies ahead of `summary`.
   *
   * Returns any indirect fire that landed on the way, so a caller stepping
   * between phases does not silently skip past artillery impacts.
   */
  advanceToPhase(target: Phase): {
    phase: Phase;
    resolved: IndirectFireResult[];
    smokeArrived: SmokeScreen[];
    observed: Observation[];
    chargeWork: ChargeWorkReport[];
    morale: MoraleReport[];
    interior: InteriorReport[];
  } {
    const interior: InteriorReport[] = [];
    const resolved: IndirectFireResult[] = [];
    const smokeArrived: SmokeScreen[] = [];
    const observed: Observation[] = [];
    const chargeWork: ChargeWorkReport[] = [];
    const morale: MoraleReport[] = [];
    this.internally(() => {
      let guard = 0;
      while (this.phase !== target) {
        const step = this.advancePhase();
        if (step.resolved) resolved.push(...step.resolved);
        if (step.smokeArrived) smokeArrived.push(...step.smokeArrived);
        if (step.observed) observed.push(...step.observed);
        if (step.chargeWork) chargeWork.push(...step.chargeWork);
        if (step.morale) morale.push(...step.morale);
        if (step.interior) interior.push(...step.interior);
        if (++guard > 100) throw new Error(`advanceToPhase: "${target}" not reached`);
      }
    });
    this.journal({ kind: "advanceToPhase", target });
    return { phase: this.phase, resolved, smokeArrived, observed, chargeWork, morale, interior };
  }

  private requirePhase(p: Phase): void {
    if (this.phase !== p) {
      throw new PhaseError(`Action requires phase "${p}" but current phase is "${this.phase}"`);
    }
  }

  // ---- intel phase ----

  /** Detect enemies/charges within a UAV or drone footprint. */
  uavSweep(uavKey: string, footprintCenter: Point, viewer: Side): DetectionResult {
    this.requirePhase("intel");
    const enemies = this.units.filter((u) => u.side !== viewer);
    const result = detectByUav(this.rng, uavKey, footprintCenter, enemies, this.mines);
    for (const id of result.spottedUnitIds) this.observe(viewer, id, "uav", undefined);
    this.journal({ kind: "uavSweep", uavKey, footprintCenter, viewer });
    return result;
  }

  // ---- mission planning (rules decision 38) ----

  /** Whether the battle is still being planned: before the first turn. */
  get planning(): boolean {
    return this.turn === 0;
  }

  private requirePlanning(what: string): void {
    if (!this.planning) throw new PhaseError(`${what} is set in mission planning, before the first turn`);
  }

  /**
   * Register a target (rules decisions 32 and 38): `side`'s guns of `weapon`
   * start on the mark at `at`, so a mission there fires for effect at once. A
   * command decision: the player registers where they expect the enemy, and
   * learns nothing of whether it is there. Only a weapon the side may call
   * (decision 37), and at most {@link MAX_REGISTERED_TARGETS_PER_WEAPON}.
   */
  registerTarget(side: Side, weapon: string, at: Point): RegisteredTarget {
    this.requirePlanning("A registered target");
    if (!this.sides.includes(side)) throw new Error(`no such side: ${side}`);
    if (!isIndirect(weapon)) throw new Error(`${weapon} is not an indirect-fire weapon`);
    if (!Number.isFinite(at?.x) || !Number.isFinite(at?.y)) throw new Error(`cannot register a target at ${JSON.stringify(at)}`);
    this.requireMayCall(side, weapon);
    const held = this.registeredTargets.filter((t) => t.side === side && t.weapon === weapon).length;
    if (held >= MAX_REGISTERED_TARGETS_PER_WEAPON) {
      throw new Error(`${side} has registered ${MAX_REGISTERED_TARGETS_PER_WEAPON} ${weapon} targets, the most it may`);
    }
    const target: RegisteredTarget = { side, weapon, at: { x: at.x, y: at.y } };
    this.registeredTargets.push(target);
    this.onTheMark.push({ side, weapon, at: { ...target.at } });
    this.journal({ kind: "registerTarget", side, weapon, at: { ...target.at } });
    return cloneForRecord(target);
  }

  /**
   * Put out an observation post (rules decision 38): `unitId` watches from
   * where it stands, and sees a force on the move out to
   * {@link OBSERVATION_POST_RANGE_M} until it moves or fires.
   */
  designateObservationPost(unitId: string): void {
    this.requirePlanning("An observation post");
    const unit = this.getUnit(unitId);
    if (unit.kind === "vehicle") throw new Error(`${unitId} is a vehicle: an observation post is men on the ground`);
    unit.observationPost = true;
    this.journal({ kind: "designateObservationPost", unitId });
  }

  /**
   * Prepare an alternate position for `unitId` at `at` (rules decision 38):
   * ground made ready as its first position was, so a force that has to move
   * off a shelled position has somewhere to go. Its cover is the force's own
   * prepared position's, or partial for a force that prepared none.
   */
  prepareAlternatePosition(unitId: string, at: Point): PreparedPosition {
    this.requirePlanning("An alternate position");
    const unit = this.getUnit(unitId);
    if (unit.kind === "vehicle") throw new Error(`${unitId} is a vehicle: it does not prepare a position`);
    if (!Number.isFinite(at?.x) || !Number.isFinite(at?.y)) throw new Error(`cannot prepare a position at ${JSON.stringify(at)}`);
    // Elsewhere: a position prepared where the force already stands would be
    // cover for nothing, which decision 12's digging does not give.
    if (distance(at, unit.position) <= PREPARED_POSITION_REACH_M) {
      throw new Error(`${unitId}'s alternate position must be more than ${PREPARED_POSITION_REACH_M} m from where it stands`);
    }
    if (this.prepared.filter((p) => p.forUnitId === unitId).length >= MAX_ALTERNATE_POSITIONS_PER_FORCE) {
      throw new Error(`${unitId} already has its alternate position`);
    }
    const position: PreparedPosition = {
      side: unit.side,
      forUnitId: unitId,
      at: { x: at.x, y: at.y },
      cover: unit.baseCover === "none" ? "partial" : unit.baseCover,
    };
    this.prepared.push(position);
    this.journal({ kind: "prepareAlternatePosition", unitId, at: { ...position.at } });
    return cloneForRecord(position);
  }

  /**
   * **Make a fire team out of part of a force** (rules decision 89, the
   * author 2026-10-11: "a commander should be able to build fire teams out
   * of his forces, including on the fly — then it becomes a force just as
   * any other").
   *
   * The named men leave their force and become a force of their own, at
   * the same place, with the same protection, carrying their own wounds,
   * fatigue and morale with them. From that moment nothing treats it
   * specially: it is detected, shot at, suppressed, broken and ordered like
   * any other infantry force, which is what the ruling asks for. It is how
   * Battle Drill 2A works at all — "the fire team not in contact becomes
   * the assault team" — and how a weapons squad's machine gun teams are
   * pulled out to form a base of fire.
   *
   * What it deliberately does **not** buy:
   *
   * - **An extra action.** The team inherits `firedThisTurn`,
   *   `movedThisTurn` and `ranThisTurn` from its parent, so splitting is
   *   never a way to act twice in a turn. Without that, splitting would be
   *   free and therefore always right, which is no choice at all.
   * - **Fresh concealment.** It inherits `stationaryTurns` and
   *   `camouflageTurns`: men who have been lying still are still lying
   *   still, and men who have just run have just run.
   *
   * What it costs, which is the trade, and it is worth being exact about
   * which thresholds move and which do not:
   *
   * - **A force goes out of action sooner.** Neutralisation by attrition is
   *   a share of a force's own strength, so a four-man team is finished by
   *   its second casualty where an eight-man squad takes four. Split, parts
   *   of a squad stop fighting at casualty counts that would have left it
   *   whole.
   * - **The side's breakpoint does not move.** `sideBroken` counts *men*,
   *   not forces, so splitting neither hastens nor delays the side giving
   *   up (decision 19).
   * - **Each team is found, suppressed and tested on its own.** More, and
   *   smaller, things to be detected and to have their nerve tried.
   *
   * `leader` follows the men: doctrine sends the squad leader with one team
   * and leaves the other to its team leader, so if none of the detached men
   * is a leader the first of them becomes one. ⚠️ Ours — the first rather
   * than the best, because there is no seniority to read and a roll here
   * would move every later die.
   */
  detachTeam(unitId: string, soldierIds: readonly string[], opts: { id?: string; name?: string; echelon?: Echelon } = {}): Unit {
    if (this.phase === "combat") throw new Error("a force is split in planning or movement, not in the middle of a firefight");
    const parent = this.getUnit(unitId);
    if (parent.kind !== "infantry") throw new Error(`${unitId} is not infantry: only infantry splits into teams`);
    const refusal = this.moraleRefusal(parent);
    if (refusal) throw new Error(refusal);
    const men = parent.soldiers ?? [];
    const wanted = [...new Set(soldierIds)];
    if (!wanted.length) throw new Error("a team of nobody");
    const taking = wanted.map((id) => {
      const m = men.find((s) => s.id === id);
      if (!m) throw new Error(`${id} is not one of ${unitId}'s men`);
      return m;
    });
    if (taking.length >= men.length) throw new Error(`${unitId} cannot detach all of its men: that is a rename, not a team`);
    const id = opts.id ?? `${unitId}/t${this.teamsDetached.get(unitId) ?? 1}`;
    if (this.units.some((u) => u.id === id)) throw new Error(`${id} already exists`);

    parent.soldiers = men.filter((s) => !taking.includes(s));
    if (!taking.some((s) => s.leader)) taking[0]!.leader = true;
    const team: Unit = {
      ...cloneForRecord(parent),
      id,
      name: opts.name ?? id,
      echelon: opts.echelon ?? "team",
      soldiers: taking.map((s) => cloneForRecord(s)),
      // Its own fight from here: nothing of the parent's posture that is
      // about *this* force rather than about the ground it stands on.
      covering: undefined,
      layingCharge: undefined,
      observationPost: false,
    };
    this.units.push(team);
    // Its parent's plan for a fight inside goes with it (decision 101).
    const order = this.interior.orderFor(unitId);
    if (order) this.interior.setOrder(id, order);
    this.teamsDetached.set(unitId, (this.teamsDetached.get(unitId) ?? 1) + 1);
    this.journal({ kind: "detachTeam", unitId, soldierIds: [...wanted], opts: { id, ...(opts.name ? { name: opts.name } : {}), ...(opts.echelon ? { echelon: opts.echelon } : {}) } });
    return cloneForRecord(team);
  }

  /** The alternate position prepared for `unitId`, if any — a copy. */
  alternatePositionFor(unitId: string): PreparedPosition | undefined {
    const p = this.prepared.find((q) => q.forUnitId === unitId);
    return p && cloneForRecord(p);
  }

  /** The cover of the best position `unit`'s side prepared where it stands. */
  private preparedCoverAt(unit: Unit): CoverState {
    // Dug for men: a vehicle's cover is not a trench's.
    if (unit.kind === "vehicle") return "none";
    let best: CoverState = "none";
    for (const p of this.prepared) {
      if (p.side === unit.side && distance(p.at, unit.position) <= PREPARED_POSITION_REACH_M) best = betterCover(best, p.cover);
    }
    return best;
  }

  // ---- targeting phase ----

  /** How many fire missions of `weapon` `side` has left; undefined when it is not rationed. */
  fireMissionsLeft(side: Side, weapon: string): number | undefined {
    const list = this.fireSupport[side];
    if (!list) return undefined;
    const allotted = list.filter((a) => a.weapon === weapon).reduce((n, a) => n + a.missions, 0);
    const called = this.missions.filter((m) => m.side === side && m.weapon === weapon).length;
    // A screen from the tubes is a mission too (rules decision 56).
    const smoke = this.smokeMissions.filter((m) => m.side === side && m.weapon === weapon).length;
    return allotted - called - smoke;
  }

  /**
   * Call for fire (rules decision 34): one of the side's assigned missions of
   * `weapon` on `target`. The engine carries it through: one round a turn to
   * adjust until the side sees one land on the mark (decision 32), then the
   * mission's rounds for effect, all landing together. It goes straight to
   * effect when the guns are already on the mark there, when nobody of the
   * side can see the target to adjust (decision 33), or after
   * {@link MAX_ADJUSTING_ROUNDS}.
   */
  callForFire(
    side: Side,
    weaponKey: string,
    target: Point,
    opts: {
      firingFrom?: Point;
      fuze?: Fuze;
      observedByUav?: boolean;
      /** Adjust fire (the default) or fire for effect at once (rules decision 39). */
      method?: FireMethod;
    } = {},
  ): FireMission {
    return this.callForFireWith(side, weaponKey, target, opts, undefined);
  }

  /**
   * **Replay only**: a call for fire with the rounds for effect the recording
   * journalled, whatever the allotment or today's default would give — the
   * default has changed once (decision 36), and a replay must fire what was
   * fired. A player's call takes its number from the allotment or the
   * weapon, never from the caller.
   */
  replayCallForFire(
    side: Side,
    weaponKey: string,
    target: Point,
    opts: { firingFrom?: Point; fuze?: Fuze; observedByUav?: boolean; method?: FireMethod },
    roundsForEffect: number,
  ): FireMission {
    return this.callForFireWith(side, weaponKey, target, opts, roundsForEffect);
  }

  private callForFireWith(
    side: Side,
    weaponKey: string,
    target: Point,
    opts: { firingFrom?: Point; fuze?: Fuze; observedByUav?: boolean; method?: FireMethod },
    recordedRounds: number | undefined,
  ): FireMission {
    this.requirePhase("targeting");
    if (!isIndirect(weaponKey)) throw new Error(`${weaponKey} is not an indirect-fire weapon`);
    this.requireMayCall(side, weaponKey);
    const left = this.fireMissionsLeft(side, weaponKey);
    if (left !== undefined && left <= 0) throw new Error(`${side} has no ${weaponKey} fire missions left`);
    if (opts.fuze !== undefined && !(opts.fuze in SHELL_VS_MEN)) throw new Error(`no such fuze: ${String(opts.fuze)}`);
    if (opts.method !== undefined && opts.method !== "adjust" && opts.method !== "effect") {
      throw new Error(`no such method of fire: ${String(opts.method)}`);
    }
    const allotment = this.fireSupport[side]?.find((a) => a.weapon === weaponKey);
    const roundsForEffect = recordedRounds ?? allotment?.roundsForEffect ?? this.defaultRoundsForEffect(weaponKey) ?? defaultRoundsForEffect(weaponKey);
    if (!Number.isInteger(roundsForEffect) || roundsForEffect < 1 || roundsForEffect > MAX_ROUNDS_PER_MISSION) {
      throw new Error(`a mission fires 1 to ${MAX_ROUNDS_PER_MISSION} rounds for effect, not ${roundsForEffect}`);
    }
    const mission: FireMission = {
      id: this.nextId("mission"),
      side,
      weapon: weaponKey,
      target: { x: target.x, y: target.y },
      roundsForEffect,
      ...(opts.firingFrom ? { firingFrom: { ...opts.firingFrom } } : {}),
      ...(opts.fuze && opts.fuze !== "impact" ? { fuze: opts.fuze } : {}),
      ...(opts.observedByUav ? { observedByUav: true } : {}),
      ...(opts.method === "effect" ? { method: "effect" as const } : {}),
      adjustingRounds: 0,
      status: "adjusting",
    };
    this.missions.push(mission);
    // As adopted: the defaults are left out, as they are on the mission.
    this.journal({
      kind: "callForFire",
      weaponKey,
      side,
      target: { ...mission.target },
      opts: {
        ...(mission.firingFrom ? { firingFrom: { ...mission.firingFrom } } : {}),
        ...(mission.fuze ? { fuze: mission.fuze } : {}),
        ...(mission.observedByUav ? { observedByUav: true } : {}),
        // Only when not the default, so a call from before decision 39 reads
        // as the adjusting it was.
        ...(mission.method ? { method: mission.method } : {}),
        // Always, unlike the defaults above: the default itself has changed
        // once (decision 36), and a replay must fire what was fired.
        roundsForEffect,
      },
    });
    this.stepFireMission(mission);
    return cloneForRecord(mission);
  }

  /**
   * Check fire (rules decision 34): `side`'s missions in hand stop, and its
   * rounds not yet landed are not fired — an attacker lifting its fires as it
   * closes. A mission stopped before its rounds for effect is spent all the
   * same.
   */
  checkFire(side: Side): void {
    this.requirePhase("targeting");
    for (const m of this.missions) if (m.side === side && m.status === "adjusting") m.status = "checked";
    this.pendingFire = this.pendingFire.filter((f) => f.side !== side);
    this.journal({ kind: "checkFire", side });
  }

  /** A mission's rounds for effect when nobody set them: the research figure (rules decision 43) or the document's (decision 36). */
  private defaultRoundsForEffect(weapon: string): number | undefined {
    return this.lethality === "research" ? RESEARCH_ROUNDS_FOR_EFFECT[weapon] : DEFAULT_ROUNDS_FOR_EFFECT[weapon];
  }

  /**
   * How `rounds` land, turn by turn (rules decision 42). Under the research
   * figures each turn's volley is the fire unit's tubes times a rate drawn for
   * that turn, lower as the unit tires from the turns it has already fired;
   * under the document, all of them at once. Drawn when the mission sends its
   * rounds, so a recording replays them from its calls.
   */
  private volleysFor(side: Side, weapon: string, rounds: number): number[] {
    const rof = RATE_OF_FIRE[weapon];
    // The allotment's own fire unit (decision 93), else the weapon's.
    const tubes = this.fireSupport[side]?.find((a) => a.weapon === weapon)?.tubes ?? FIRE_UNIT_TUBES[weapon];
    if (this.lethality !== "research" || !rof || !tubes) return [rounds];
    const key = `${side}:${weapon}`;
    const volleys: number[] = [];
    for (let left = rounds; left > 0; ) {
      const fired = this.fireUnitTurns.get(key) ?? 0;
      const n = Math.min(left, tubes * rollRate(rof, freshness(fired), this.rng.next()));
      this.fireUnitTurns.set(key, fired + 1);
      volleys.push(n);
      left -= n;
    }
    return volleys;
  }

  /**
   * One turn of a fire mission: an adjusting round, or the rounds for effect.
   * While its last adjusting round is still in the air, it waits to see where
   * it lands.
   */
  private stepFireMission(m: FireMission): void {
    if (m.inFlight && this.pendingFire.some((f) => f.id === m.inFlight)) return;
    delete m.inFlight;
    const forEffect =
      m.method === "effect" ||
      this.isOnTheMark(m.side, m.weapon, m.target) ||
      !this.observes(m.side, m.target, m.observedByUav ?? false) ||
      m.adjustingRounds >= MAX_ADJUSTING_ROUNDS;
    const rounds = forEffect ? m.roundsForEffect : 1;
    // The fire unit lands at most its rate times its tubes in a turn (rules
    // decision 42); the rest of the rounds for effect land on the turns after.
    const volleys = this.volleysFor(m.side, m.weapon, rounds);
    const queued = this.internally(() => {
      const sent = volleys.map((n, later) =>
        this.queueIndirectFire(m.weapon, m.side, m.target, {
          ...(m.firingFrom ? { firingFrom: m.firingFrom } : {}),
          ...(m.fuze ? { fuze: m.fuze } : {}),
          ...(m.observedByUav ? { observedByUav: true } : {}),
          ...(n > 1 ? { rounds: n } : {}),
          ...(later ? { laterBy: later } : {}),
        }),
      );
      return sent[0]!;
    });
    if (forEffect) {
      m.status = "done";
      m.forEffectOnTurn = this.turn;
    } else {
      m.adjustingRounds++;
      m.inFlight = queued.id;
    }
  }

  /**
   * Queue an indirect-fire mission; it resolves after the weapon's delay. Its
   * `rounds` land together, each scattered on its own (rules decision 30: the
   * men they fall on are still on their feet for all of them).
   */
  queueIndirectFire(
    weaponKey: string,
    side: Side,
    target: Point,
    opts: {
      firingFrom?: Point;
      observedByUav?: boolean;
      rounds?: number;
      fuze?: Fuze;
      /** Turns after the weapon's delay: the later volleys of a mission beyond its fire unit's rate (rules decision 42). */
      laterBy?: number;
    } = {},
  ): PendingFireMission {
    this.requirePhase("targeting");
    const weapon = explosiveEntry(weaponKey);
    if (!weapon || weapon.delivery !== "indirectFire" || !isIndirect(weaponKey)) {
      throw new Error(`${weaponKey} is not an indirect-fire weapon`);
    }
    // A side with its fire assigned as missions fires only those (rules
    // decision 34): the missions queue their own rounds, internally.
    if (this.journalDepth === 0 && this.fireSupport[side]) {
      throw new Error(`${side}'s fire is assigned as missions: call for fire`);
    }
    if (this.journalDepth === 0) this.requireMayCall(side, weaponKey);
    // Only a mission spreads its own volleys; a call from outside lands when it lands.
    if (opts.laterBy !== undefined && this.journalDepth === 0) throw new Error("laterBy is set by a fire mission, not by a caller");
    const rounds = opts.rounds ?? 1;
    if (!Number.isInteger(rounds) || rounds < 1 || rounds > MAX_ROUNDS_PER_MISSION) {
      throw new Error(`a mission fires 1 to ${MAX_ROUNDS_PER_MISSION} rounds, not ${rounds}`);
    }
    const fuze = opts.fuze ?? "impact";
    if (!(fuze in SHELL_VS_MEN)) throw new Error(`no such fuze: ${String(fuze)}`);
    const mission: PendingFireMission = {
      id: this.nextId("fire"),
      weapon: weaponKey,
      side,
      target,
      resolvesOnTurn: this.turn + (weapon.impactDelayTurns ?? 1) + (opts.laterBy ?? 0),
      observedByUav: opts.observedByUav ?? false,
      // Only when not the default, so a digest of an older game is unchanged.
      ...(rounds > 1 ? { rounds } : {}),
      ...(fuze !== "impact" ? { fuze } : {}),
    };
    // Stash firing origin on the mission for dispersion orientation.
    (mission as PendingFireMission & { firingFrom?: Point }).firingFrom = opts.firingFrom;
    this.pendingFire.push(mission);
    // As adopted: the defaults are left out, as they are on the mission.
    const { rounds: _r, fuze: _f, laterBy: _l, ...rest } = opts;
    this.journal({
      kind: "queueIndirectFire",
      weaponKey,
      side,
      target,
      opts: { ...rest, ...(rounds > 1 ? { rounds } : {}), ...(fuze !== "impact" ? { fuze } : {}) },
    });
    return mission;
  }

  /**
   * Where each side's guns have fired **and seen the fall of shot**, and how
   * many rounds they have walked onto the point (rules decision 32). Unseen
   * rounds teach nothing (decision 33).
   */
  private adjusting: AdjustmentEntry[] = [];
  /** Where each side's guns are on the mark: a round landed within reach, or registered. */
  private onTheMark: MarkEntry[] = [];

  /**
   * The earlier fire of this side's weapon to adjust from: the nearest within
   * reach of `aim`; of equals, the one walked in furthest, then the latest.
   */
  private adjustedFrom(side: Side, weapon: string, aim: Point): AdjustmentEntry | undefined {
    let best: AdjustmentEntry | undefined;
    let bestD = Infinity;
    for (const a of this.adjusting) {
      if (a.turn >= this.turn || a.side !== side || a.weapon !== weapon) continue;
      const d = distance(a.aim, aim);
      if (d > ADJUSTMENT_RADIUS_M) continue;
      const better =
        d < bestD ||
        (d === bestD && (a.adjustments > best!.adjustments || (a.adjustments === best!.adjustments && a.turn > best!.turn)));
      if (better) {
        best = a;
        bestD = d;
      }
    }
    return best;
  }

  /**
   * Whether `side`'s `weapon` is on the mark within reach of `aim` — a round
   * of its own landed on the mark within {@link ADJUSTMENT_RADIUS_M} of it, or
   * the point was registered — so a mission there fires for effect at the
   * weapon's best accuracy. What the side itself knows: the fall of its own
   * shot (rules decision 17). It does not follow the aim: a target that moves
   * out of reach has to be adjusted onto again.
   */
  /** Every point a side is on the mark at, registered or earned — copies. */
  get marksHeld(): RegisteredTarget[] {
    return cloneForRecord(this.onTheMark);
  }

  isOnTheMark(side: Side, weapon: string, aim: Point): boolean {
    return this.onTheMark.some(
      (e) => e.side === side && e.weapon === weapon && distance(e.at, aim) <= ADJUSTMENT_RADIUS_M,
    );
  }

  /**
   * The CEP a mission fires with (rules decision 32): on the mark, the
   * weapon's best; otherwise its first-round CEP halved by each earlier
   * observed round of the same side's same weapon within
   * {@link ADJUSTMENT_RADIUS_M}, down to that best.
   */
  private cepFor(m: PendingFireMission): { cepM: number; adjustments: number } {
    const base = INDIRECT_ACCURACY[m.weapon];
    if (!base) throw new Error(`no accuracy for ${m.weapon}`);
    // ARES Table 3.1: a gun's first round by its range (decision 80).
    const spec = this.checked === "ares" && m.weapon === "artillery" ? { ...base, firstM: aresGunCep(ARES_GUN_RANGE_KM) } : base;
    const previous = this.adjustedFrom(m.side, m.weapon, m.target);
    const adjustments = previous ? previous.adjustments + 1 : 0;
    const onMark = this.isOnTheMark(m.side, m.weapon, m.target);
    return { cepM: cepAfter(spec, adjustments, onMark), adjustments };
  }

  /**
   * Whether `side` sees the fall of a round at `impact` (rules decision 33): a
   * force of its own in the fight — not out, routing or surrendered — within
   * {@link OBSERVE_RANGE_M} with a clear line to it, smoke included, or a UAV
   * over the target.
   */
  private observes(side: Side, impact: Point, uav: boolean): boolean {
    if (uav) return true;
    return this.units.some(
      (u) =>
        u.side === side &&
        canObserve(u) &&
        !u.surrendered &&
        !u.routing &&
        // Heads down (decision 63, S2): a pinned force watches no fall of shot.
        !(this.headsDown && suppressionLevel(u) === "pinned") &&
        distance(u.position, impact) <= OBSERVE_RANGE_M &&
        // Fighting inside, it watches from the windows facing the burst (decision 98).
        (this.windowFire ? (this.interior.shown(this, u.id, impact) ?? [{ point: u.position, height: eyeHeight(u) }]) : [{ point: u.position, height: eyeHeight(u) }]).some(
          (eye) =>
            !(SMOKE_BLOCKS_FIRE && this.smoke.some((sm) => segmentIntersectsCircle(eye.point, impact, sm.center, sm.radius))) &&
            !terrainBlocksSight(this.terrain, eye.point, eye.height, impact, BURST_HEIGHT_M),
        ),
    );
  }

  /** Resolve indirect-fire missions whose impact-delay elapses this turn: one result a round. */
  private resolveDueFireMissions(): IndirectFireResult[] {
    const due = this.pendingFire.filter((m) => m.resolvesOnTurn <= this.turn);
    this.pendingFire = this.pendingFire.filter((m) => m.resolvesOnTurn > this.turn);
    // Everything due this turn lands together: the men are as they were for
    // all of it, and go to ground after it (rules decision 30).
    const shelled = new Set<Unit>();
    const strikes: { round: IndirectFireResult; building: MapObject }[] = [];
    const results = due.flatMap((m) => {
      const { cepM, adjustments } = this.cepFor(m);
      const fired = Array.from({ length: m.rounds ?? 1 }, () =>
        resolveIndirectFire(this.rng, m.weapon, m.target, this.units, {
          firingFrom: (m as PendingFireMission & { firingFrom?: Point }).firingFrom,
          fixedWingObserved: m.observedByUav,
          turn: this.turn,
          ...(m.fuze ? { fuze: m.fuze } : {}),
          // A building, or a position prepared before the battle (author,
          // 2026-09-23: a prepared position has overhead cover).
          underRoof: (u) => u.baseCover === "full" || underRoof(this.terrain, u.position),
          cepM,
          lethality: this.lethality,
          shellVsMen: this.shellTable(m.weapon),
          armour: this.armour,
          checked: this.checked,
          ...(this.criticalHits ? { criticalAt: (impact: Point) => this.throughTheRoof(m.weapon, impact) } : {}),
          // Men on a roof, going in from it (decision 101): caught in the open.
          // ⚠️ Ours: a man anywhere on a roof is as far from the burst as the roof is: at it, when the round comes down on it.
          onRoof: (impact: Point) => {
            const up = this.interior.roofMen(this);
            if (up.size === 0) return undefined;
            const roofOf = (u: Unit) => this.ground.objects.find((o) => o.id === up.get(u.id)?.buildingId);
            return {
              men: (u: Unit) => up.get(u.id)?.men,
              distance: (u: Unit) => {
                const b = roofOf(u);
                return b ? distanceToFootprint(b.footprint, impact) : distance(u.position, impact);
              },
            };
          },
        }),
      );
      // The buildings the rounds landed on (decision 76). An air burst goes
      // off above the roof and does not touch it. The damage is done once
      // everything due this turn has landed, below.
      if (m.fuze !== "airburst") {
        for (const f of fired) {
          const struck = this.ground.objects.find(
            (o) => o.kind === "building" && distanceToFootprint(o.footprint, f.dispersion.impact) === 0,
          );
          if (struck) strikes.push({ round: f, building: struck });
        }
      }
      // What the side saw of it teaches the next round; a round seen on the
      // mark puts the guns on it for whatever follows (decisions 32–33).
      const seen = fired.filter((f) => this.observes(m.side, f.dispersion.impact, m.observedByUav));
      if (seen.length) {
        this.adjusting.push({ side: m.side, weapon: m.weapon, aim: m.target, turn: this.turn, adjustments });
        if (seen.some((f) => f.dispersion.missDistance <= ON_TARGET_M)) {
          this.onTheMark.push({ side: m.side, weapon: m.weapon, at: m.target });
        }
      }
      // Everyone the rounds came down on was shelled, caught or not.
      const roofed = (u: Unit) => u.baseCover === "full" || underRoof(this.terrain, u.position);
      // Under decision 92 a round's suppression is a chance: the mission's
      // rounds this turn combine per force, P = 1 − Π(1 − p), added once below.
      const missChance = new Map<Unit, number>();
      for (const round of fired) {
        const reached = new Set(round.blast.targets.map((t) => t.unitId));
        for (const hit of round.blast.targets) {
          const unit = this.getUnit(hit.unitId);
          if (unit.kind === "infantry") shelled.add(unit);
        }
        // Who it suppresses: those its blast reached, and since decision 63
        // everyone within its suppression reach (S1); a roof takes half (S3).
        const suppressed = this.suppressionReach
          ? this.units.filter((u) => !u.neutralized && !u.surrendered && (reached.has(u.id) || roundSuppression(round.weapon, distance(u.position, round.dispersion.impact), this.checked) > 0))
          : this.units.filter((u) => reached.has(u.id));
        for (const unit of suppressed) {
          if (this.suppressionByChance) {
            const p = reached.has(unit.id)
              ? SUPPRESSION_CHANCE.blast
              : roundSuppressionChance(round.weapon, distance(unit.position, round.dispersion.impact), this.checked);
            missChance.set(unit, (missChance.get(unit) ?? 1) * (1 - p));
            // Shelled all the same, for the nerve and the fire log: the suppression comes below.
            this.noteFire(unit, "indirect", 0);
            continue;
          }
          let amount = reached.has(unit.id)
            ? SUPPRESSION.indirect
            : roundSuppression(round.weapon, distance(unit.position, round.dispersion.impact), this.checked);
          if (this.roofsDampSuppression && roofed(unit)) amount *= ROOF_SUPPRESSION_FACTOR;
          this.noteFire(unit, "indirect", amount);
        }
      }
      if (this.morale) {
        for (const [unit, miss] of missChance) {
          let amount = shellingSuppression(miss, unit.suppression ?? 0);
          if (this.roofsDampSuppression && roofed(unit)) amount *= ROOF_SUPPRESSION_FACTOR;
          addSuppression(unit, amount);
        }
      }
      // Shells landing near a force are an indication of the enemy (decision
      // 86): a level, once for the mission, for each enemy force within reach.
      if (this.readiness) {
        for (const u of this.units) {
          if (u.side === m.side || u.neutralized) continue;
          if (fired.some((f) => distance(u.position, f.dispersion.impact) <= READINESS.indicationM)) this.raiseReadiness(u, "level");
        }
      }
      // Who called it, so a report can say how far it fell from the aim point
      // to the side that aimed it and no further (rules decision 17). After the
      // spread, so the mission stays the authority if the resolver ever sets it.
      this.tally.roofCriticals += fired.filter((f) => f.critical).length;
      return fired.map((f) => ({ ...f, side: m.side }));
    });
    for (const unit of shelled) unit.downUnderShelling = true;
    // What it all did to the buildings it landed on, after every blast: the
    // men inside were under the roofs as they were (decision 76).
    for (const { round, building } of strikes) {
      const before = this.structureState(building.id);
      const crushed: { unitId: string; casualties: number }[] = [];
      const state = this.strikeStructure(building, round.weapon, crushed);
      if (!state) continue;
      const strike = { objectId: building.id, state, changed: state !== before, ...(crushed.length ? { crushed } : {}) };
      // The copy handed back for this round, which carries the side.
      const out = results.find((r) => r.dispersion === round.dispersion);
      if (out) out.structure = strike;
    }
    return results;
  }

  // ---- movement phase ----

  /**
   * Move a unit to `to` at the given gait, enforcing the per-gait distance
   * cap (halved when under fire) and the no-move-after-being-hit rule. Returns
   * the detection result from the move.
   */
  moveUnit(unitId: string, to: Point, mode: MovementMode = "normal"): MoveResult {
    this.requirePhase("movement");
    if (!Number.isFinite(to?.x) || !Number.isFinite(to?.y)) throw new Error(`cannot move to ${JSON.stringify(to)}`);
    const unit = this.getUnit(unitId);
    if (unit.neutralized && !unit.canOnlyRetreat) {
      throw new Error(`${unitId} is neutralised and cannot act`);
    }
    if (this.interior.inFight(unitId)) throw new Error(INTERIOR_REFUSAL.fightingInside);
    if (unit.movementBlocked) {
      throw new Error(`${unitId} was hit last turn and cannot move this turn`);
    }
    // Morale (rules decision 19): a routing force is the engine's to move, and
    // a pinned one moves only to get out — under a withdrawal order.
    if (unit.surrendered) throw new Error(MORALE_REFUSAL.surrendered);
    if (!this.executingOrders && unit.routing) throw new Error(MORALE_REFUSAL.routing);
    if (
      suppressionLevel(unit) === "pinned" &&
      !(this.executingOrders && (unit.routing || this.standingOrders.get(unitId)?.withdraw)) &&
      !(unit.kind === "command" && !this.executingOrders && this.fallsBack(unit, to))
    ) {
      throw new Error(MORALE_REFUSAL.pinned);
    }
    // C2: manoeuvre needs orders. The interval is measured from where the unit
    // stands when the order reaches it, so this is checked before it moves —
    // and the order is only stamped once the move actually goes through.
    const needsNewOrders = !this.executingOrders && !this.isUnderOrders(unitId);
    if (!this.executingOrders && !this.canManoeuvre(unitId)) {
      throw new Error(
        `${unitId} has received no orders this turn (next orders on turn ${this.nextOrderTurn(unitId)})`,
      );
    }
    // A scouting force walks, whatever gait the move asked for.
    const gait = this.gaitFor(unit, mode);
    const profile = MOVEMENT_PROFILES[gait];
    const cap = profile.maxDistance * this.paceFactor(unit, gait);
    const dist = distance(unit.position, to);
    // A vehicle will not take a grade it cannot climb (rules decision 15).
    if (unit.kind === "vehicle") {
      const grade = steepestGradeAlong(this.terrain, unit.position, to);
      if (grade > SLOPE.vehicleMaxGradeDeg) {
        throw new Error(
          `Grade of ${grade.toFixed(0)}° is too steep for a vehicle (limit ${SLOPE.vehicleMaxGradeDeg}°)`,
        );
      }
    }
    // The cap is a per-turn budget (e.g. "up to 50 m in a turn"), so movement
    // already spent this turn counts against it — a unit can move in several
    // steps but no further than its gait allows in total. Climbing costs
    // extra (Naismith, rules decision 15): the budget is spent in metres of
    // flat going, and on flat ground that is the distance exactly.
    const climb = climbAlong(this.terrain, unit.position, to);
    const cost = boundCost(this.terrain, unit.position, to, this.climbCostPerMetre);
    if (unit.movedThisTurn + cost > cap + 1e-6) {
      const remaining = Math.max(0, cap - unit.movedThisTurn);
      const climbing = climb > 0 ? ` (${climb.toFixed(1)} m climbed, costing ${cost.toFixed(1)} m)` : "";
      throw new Error(
        `Move of ${dist.toFixed(1)} m${climbing} exceeds remaining ${gait} budget of ${remaining.toFixed(1)} m`,
      );
    }
    if (needsNewOrders && this.canReceiveOrders(unitId)) this.lastOrderTurn.set(unitId, this.turn);
    if (!this.executingOrders) {
      // Moving a force by hand overrides where its orders were sending it.
      const standing = this.standingOrders.get(unitId);
      if (standing?.destination) {
        this.standingOrders.set(unitId, { ...standing, destination: undefined });
      }
    }
    // Up and moving is not watching: a force cannot carry חיפוי along with it
    // (rules decision 18). Cleared before the bound, so the force is not still
    // covering while the ground it is crossing is resolved.
    delete unit.covering;

    const from = unit.position;
    unit.position = { ...to };
    // A vehicle's hull points the way it drove: which side a round strikes
    // is read from it (rules decision 78).
    // Armour reverses out of contact: a vehicle withdrawing or routing keeps
    // its front to the enemy it is leaving.
    const reversing = unit.routing === true || this.standingOrders.get(unit.id)?.withdraw === true;
    if (unit.vehicle && this.armour === "research" && !reversing && distance(from, to) > 0) {
      unit.vehicle.facing = bearingDegrees(from, to);
    }
    this.bounds.set(unit.id, (this.bounds.get(unit.id) ?? 0) + 1);
    unit.movedThisTurn += cost;
    if (gait === "run") unit.ranThisTurn = true;
    if (climb > 0) this.climbedThisTurn.set(unit.id, (this.climbedThisTurn.get(unit.id) ?? 0) + climb);

    const enemies = this.units.filter((u) => u.side !== unit.side);
    // Smoke stops the eye as well as the bullet, so observation runs through
    // the same line of sight fire does — where the knowledge model is in play,
    // or where there is ground to see over. A flat game without the model
    // draws exactly what it always drew.
    const sight =
      this.trackIntel || this.mapTerrain !== FLAT_GROUND
        ? (observer: Unit, target: Unit) => this.spots(observer, target)
        : undefined;
    // `from` is where the bound started: a walking force searches the ground it
    // crossed for charges, not only where it halted (rules decision 10).
    const detection = detectByMovement(this.rng, unit, from, gait, enemies, this.mines, sight, this.alertness(unit));
    // What the mover found. What found the mover is rolled once for the whole
    // turn, by every force in position — see observeFromPosition.
    for (const id of detection.spottedUnitIds) this.observe(unit.side, id, "movement", unit);
    // A charge found is an indication of the enemy (decision 86).
    if (detection.foundMineIds.length) this.raiseReadiness(unit, "level");

    // Charges are tested against the whole path walked, so a bound cannot vault
    // a minefield. Any that fired are spent.
    const { detonations, spent } = triggerMines(
      this.rng,
      unit,
      from,
      unit.position,
      this.mines,
      this.units,
      this.turn,
      this.armour,
      this.checked,
      this.lethality,
    );
    if (spent.length) this.mines = this.mines.filter((m) => !spent.includes(m.id));
    for (const d of detonations) {
      for (const hit of d.blast?.targets ?? []) {
        this.noteFire(this.getUnit(hit.unitId), "mine", SUPPRESSION.mine);
      }
    }

    // …and last, what was watching for exactly this. The ground is tested
    // before the enemy on purpose: a charge is already on the route, while a
    // covering force has to see the mover to answer it, and a force the charge
    // has just neutralised is a different target from the one that set out.
    const coveringFire = this.answerWithCoveringFire(unit, "move", from);

    this.journal({ kind: "moveUnit", unitId, to, mode });
    return { detection, mineDetonations: detonations, coveringFire };
  }

  // ---- what each side knows ----

  /**
   * Note that `side` has observed `unitId` where it now stands. Silently does
   * nothing when the knowledge model is off, so callers need no guard.
   */
  private observe(side: Side, unitId: string, source: ContactSource, observer: Unit | undefined, from?: Point): void {
    if (!this.trackIntel) return;
    const unit = this.units.find((u) => u.id === unitId);
    if (!unit || unit.side === side) return;
    // Heads down (decision 63, S2): a pinned observer sees only what is close;
    // a suppressed one keeps each sighting at even odds.
    if (observer && this.headsDown) {
      const level = suppressionLevel(observer);
      if (level === "pinned" && distance(observer.position, unit.position) > HEADS_DOWN.sightWithinM) return;
      if (level === "suppressed" && !this.rng.chance(HEADS_DOWN.suppressedSightChance)) return;
    }
    this.report(side, unit, unit.position, source, observer, from);
    // The force that saw the enemy is stood to (decision 86).
    if (observer && observer.side === side) this.raiseReadiness(observer, 3);
  }

  /**
   * Raise a force's readiness (rules decision 86): a `level` for an
   * indication of the enemy, or straight to 3. Nothing lowers it.
   */
  /** What a force's readiness does to its eyes (rules decision 86): 1 without the rule. */
  private alertness(u: Unit): number {
    if (!this.readiness || !this.directionalCover) return 1;
    return READINESS_SPOTTING[u.readiness ?? READINESS.default];
  }

  private raiseReadiness(u: Unit, to: "level" | 3): void {
    if (!this.readiness || !this.directionalCover) return;
    const now = u.readiness ?? READINESS.default;
    const next = (to === 3 ? 3 : Math.min(3, now + 1)) as Readiness;
    if (next > now) u.readiness = next;
  }

  /**
   * Put what `side` saw of `unit` at `at` in its ledger — where it is, or,
   * with location error (rules decision 51), where `observer` judged it to
   * be: off along the sight line by the eye's range estimate and across it by
   * the compass, looking from `from` (where it stands unless told). No
   * observer is a UAV's look straight down.
   */
  private report(
    side: Side,
    unit: Unit,
    at: Point,
    source: ContactSource,
    observer: Unit | undefined,
    from: Point | undefined = observer?.position,
  ): void {
    if (!this.locationError) {
      this.intel.record(side, unit.id, at, this.turn, source, unit.neutralized);
      return;
    }
    const normal = () => {
      // Box–Muller, from the location stream alone.
      const u = 1 - this.locationRng.next();
      const v = this.locationRng.next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    let reported: Point;
    let sigma: number;
    if (!observer) {
      reported = { x: at.x + normal() * UAV_LOCATION_ERROR_M, y: at.y + normal() * UAV_LOCATION_ERROR_M };
      sigma = UAV_LOCATION_ERROR_M;
    } else {
      const eye = from ?? observer.position;
      const range = distance(eye, at);
      // An observation post, or a scout at its binoculars (rules decision 54), has the better eye.
      const post = observer.observationPost || lookingThroughBinoculars(observer, this.binoculars);
      const s = locationSigma(range, post ? LOCATION_ERROR.observationPost : LOCATION_ERROR.eye);
      const along = normal() * s.along;
      const across = normal() * s.across;
      const ux = range > 0 ? (at.x - eye.x) / range : 1;
      const uy = range > 0 ? (at.y - eye.y) / range : 0;
      reported = { x: at.x + along * ux - across * uy, y: at.y + along * uy + across * ux };
      sigma = Math.sqrt((s.along ** 2 + s.across ** 2) / 2);
    }
    this.intel.record(side, unit.id, reported, this.turn, source, unit.neutralized, {
      stand: this.bounds.get(unit.id) ?? 0,
      sigma,
      observer: observer?.id ?? "#uav",
      // Only once a longer look is in play (rules decision 54): no amount of
      // watching beats an eye, map and compass.
      ...(this.keepEyesOn && observer ? { floor: BEST_VISUAL_FIX_SIGMA_M } : {}),
    });
  }

  /**
   * Note a force seen somewhere other than where it now stands — a mover
   * engaged mid-bound (rules decision 18). Everything else observes a force
   * where it is, which is why {@link observe} reads the position itself.
   */
  private intelRecordAt(side: Side, unit: Unit, at: Point, observer: Unit): void {
    if (!this.trackIntel) return;
    if (unit.side === side) return;
    this.report(side, unit, at, "fire", observer);
  }

  /**
   * A shot puts both forces on each other's map: the firer plainly has the
   * force it is shooting at, and the force being shot at learns where the fire
   * is coming from. Direct fire only — an indirect mission comes from off the
   * map and gives nothing away (⚠️ rules decision 12).
   */
  private exchangeContact(attacker: Unit, target: Unit): void {
    this.observe(target.side, attacker.id, "fire", target);
    this.observe(attacker.side, target.id, "fire", attacker);
  }

  /**
   * Every force in position looks over its sector (rules decision 12). Run once
   * per turn, on the way into the fire phase, so it sees the turn's movement —
   * a force that moved had its own look during its bound and is skipped.
   *
   * Nothing happens without the knowledge model: there is no one to tell.
   */
  private observeFromPositions(): Observation[] {
    if (!this.trackIntel) return [];
    this.keepEyesOnWhatWasFound();
    const seen = observeFromPosition(
      this.rng,
      this.units,
      (observer, target) => this.spots(observer, target),
      this.stillDetection,
      this.binoculars,
      (observer) => this.alertness(observer),
    );
    for (const { observerId, targetId } of seen) {
      const observer = this.getUnit(observerId);
      this.observe(observer.side, targetId, "movement", observer);
    }
    return seen;
  }

  /**
   * A longer look (rules decision 54): every force in position keeps its
   * eyes on a still enemy its side holds fresh — seen this turn or last —
   * within its reach and sight, without rolling to find it again. Each look
   * is a new estimate, so a force watched for longer is placed better (the
   * ledger combines them, one an observer a turn). Not reported as a new
   * sighting: it is the same one, kept.
   */
  private keepEyesOnWhatWasFound(): void {
    if (!this.keepEyesOn) return;
    for (const observer of this.units) {
      if (observer.movedThisTurn > 0 || !canObserve(observer)) continue;
      const reach = this.stillDetection
        ? stillReach(observer, this.binoculars)
        : MOVEMENT_PROFILES.normal.hiddenDetectRange;
      for (const target of this.units) {
        if (target.side === observer.side || !isHidden(target)) continue;
        if (target.kind === "vehicle" && target.vehicle?.destroyed) continue;
        const held = this.intel.contactFor(observer.side, target.id);
        if (!held || held.lastSeenTurn < this.turn - 1) continue;
        if (distance(observer.position, target.position) > reach) continue;
        if (!this.spots(observer, target)) continue;
        this.observe(observer.side, target.id, "movement", observer);
      }
    }
  }

  /**
   * Work on a force's camouflage, or stop (הסוואה). It accrues while the force
   * stays put — see {@link CAMOUFLAGE} — and a force that moves loses the lot,
   * so this is a posture, not a one-off action.
   */
  setCamouflage(unitId: string, on: boolean): void {
    const unit = this.getUnit(unitId);
    // A force that broke is the engine's: the player sets it to nothing.
    if (on && (unit.routing || unit.surrendered)) {
      throw new Error(unit.surrendered ? MORALE_REFUSAL.surrendered : MORALE_REFUSAL.routing);
    }
    unit.camouflaging = on;
    if (!on) unit.camouflageTurns = 0;
    this.journal({ kind: "setCamouflage", unitId, on });
  }

  /**
   * Set a force to laying a charge where it stands, or call the work off
   * (הנחת מטען). Rules decision 16.
   *
   * The work takes {@link CHARGE_LAYING.turnsToLay} turns and the force must
   * spend them doing nothing else: a turn in which it moves, fires, **is hit**
   * or is neutralised loses the work outright — it is not banked and resumed.
   * What that buys is a charge on ground the enemy has not yet reached, laid
   * in front of him during the battle rather than before it.
   *
   * Setting the work going is an **order**, and replaces the one the force was
   * holding: a standing order to advance or to engage would be executed on the
   * next activation and take the work away again on the turn it was
   * commissioned.
   *
   * The refusals here are the states already known to be fatal *this* turn —
   * they stop the player spending an order on work that cannot survive to the
   * end of it. They do not judge the work: {@link progressChargeLaying} is the
   * one place that does.
   *
   * Who may: only a force flagged `canLayCharges` — an insurgent or special
   * force. Until force types exist (echelon scaling, backlog 3) the scenario
   * sets the flag.
   *
   * Passing `null` calls the work off, and what has been banked is lost.
   */
  layCharge(unitId: string, type: Mine["type"] | null): void {
    this.requirePhase("movement");
    const unit = this.getUnit(unitId);

    if (type === null) {
      delete unit.layingCharge;
      this.journal({ kind: "layCharge", unitId, type });
      return;
    }
    // Refusals are short keys, not sentences: they are shown to a Hebrew
    // player through `reasonHe`, the way an order's refusals are.
    if (!unit.canLayCharges) throw new Error(LAY_CHARGE_REFUSAL.untrained);
    if (unit.neutralized) throw new Error(LAY_CHARGE_REFUSAL.neutralised);
    if (unit.routing) throw new Error(LAY_CHARGE_REFUSAL.routing);
    if (fitSoldiers(unit) === 0) throw new Error(LAY_CHARGE_REFUSAL.noOneLeft);
    // The turn has to be spent on the work, so a force that has already used
    // some of its bound cannot start one with what is left of it.
    if (unit.movedThisTurn > 0) throw new Error(LAY_CHARGE_REFUSAL.alreadyMoved);
    // …and one that has already been hit this turn would lose the work at the
    // end of it whatever it does now.
    if (unit.hitThisTurn || unit.underFire) throw new Error(LAY_CHARGE_REFUSAL.underFire);
    // C2: setting a force to a task is an order like any other, and is gated
    // the same way manoeuvre is — checked from where it stands, stamped only
    // once the work actually begins.
    const needsNewOrders = !this.isUnderOrders(unitId);
    if (!this.canManoeuvre(unitId)) throw new Error(LAY_CHARGE_REFUSAL.noOrders);
    if (needsNewOrders && this.canReceiveOrders(unitId)) this.lastOrderTurn.set(unitId, this.turn);

    // The work replaces whatever the force was told to do: a live destination
    // would be marched off on the next activation, and a live target engaged
    // in the fire phase — either of which throws the work away.
    const standing = this.standingOrders.get(unitId);
    if (standing) {
      const { destination: _d, engage: _e, ...held } = standing;
      this.standingOrders.set(unitId, held);
    }

    const work: ChargeWork = {
      type,
      position: { ...unit.position },
      turnsWorked: 0,
      startedTurn: this.turn,
    };
    unit.layingCharge = work;
    this.journal({ kind: "layCharge", unitId, type });
  }

  /**
   * Whether this force's action for the turn is already gone: it fired, or it
   * is holding חיפוי (rules decision 18). Holding it spends *every* turn it is
   * held, not only the turn it was declared — which is what "cover or attack"
   * means once the posture outlives a turn.
   */
  private actionSpent(unit: Unit): boolean {
    return unit.firedThisTurn || unit.covering != null;
  }

  /**
   * Hold a force's fire ready for the enemy to act, or stand it down (חיפוי).
   * Rules decision 18 — the document's third action of phase 6.
   *
   * Declaring it **spends the force's action for the turn**: a force covers or
   * attacks, never both, which is the whole of what makes it a choice. It then
   * holds the posture until it fires, until it moves, or until it is told
   * otherwise — the repo's usual grammar, where an order stands until replaced
   * (decision 6) — and the first enemy action it can see and reach consumes it.
   */
  setCovering(unitId: string, on: boolean, weapon: WeaponClass = "smallArms"): void {
    this.requirePhase("combat");
    const unit = this.getUnit(unitId);
    if (!on) {
      delete unit.covering;
      this.journal({ kind: "setCovering", unitId, on, weapon });
      return;
    }
    if (unit.neutralized) throw new Error("neutralised");
    const moraleRefusal = this.moraleRefusal(unit);
    if (moraleRefusal) throw new Error(moraleRefusal);
    if (unit.firedThisTurn) throw new Error("already acted");
    // ירי מקביל is a vehicle's coaxial gun, and it is the only weapon a vehicle
    // can hold a posture with (rules decision 25).
    if ((weapon === "sustainedMg") !== (unit.kind === "vehicle")) throw new Error(NOT_A_COAXIAL_WEAPON);
    if (unit.kind !== "vehicle" && fitSoldiers(unit) === 0) throw new Error("no fit shooters");

    const posture: CoveringPosture = { weapon, declaredTurn: this.turn };
    unit.covering = posture;
    // The action is spent by *holding* the posture — see {@link actionSpent} —
    // rather than by setting `firedThisTurn` here. That flag means "this force
    // resolved a shot", and two other rules read it: a force in full cover
    // that fired is exposed to partial (decision 7) and stands to its full eye
    // height. A force watching has done neither, and must not be punished as
    // though it had.
    this.journal({ kind: "setCovering", unitId, on, weapon });
  }

  /**
   * Every covering enemy's answer to `actor` acting (rules decision 18).
   *
   * **One owner for the whole reaction.** Moving, firing and assaulting all
   * arrive here, so what a covering force may do is decided once rather than
   * three times off three different pieces of state. A move passes the bound it
   * walked and is shot at the first point of it the coverer could reach; a shot
   * or an assault passes the single place the actor stands.
   *
   * Firing consumes the posture — the force has taken its shot and must be set
   * to cover again — and a reaction never triggers another, or two covering
   * forces would answer each other forever.
   */
  private answerWithCoveringFire(
    actor: Unit,
    trigger: CoveringFireResult["trigger"],
    from?: Point,
  ): CoveringFireResult[] {
    if (this.reacting) return [];
    const taken: CoveringFireResult[] = [];
    const destination = { ...actor.position };
    this.reacting = true;
    try {
      for (const coverer of this.units) {
        const posture = coverer.covering;
        if (!posture) continue;
        if (coverer.side === actor.side) continue;
        if (coverer.neutralized) continue;
        if (this.moraleRefusal(coverer) || this.headsDownRefusal(coverer, actor)) continue;
        // A force the ground or another coverer has already put down is not
        // the target that set out: nobody spends a posture finishing it.
        if (actor.neutralized) break;
        // A standing order to hold fire is not broken by a posture: the player
        // said this force does not shoot, and decision 6 means it (holdFire is
        // enforced even against the player's own click).
        if (this.isHoldingFire(coverer.id, actor.id)) continue;
        // A force does not answer what its side has never seen (author,
        // 2026-09-16). The same standard `orderedTargetFor` holds an order to:
        // the engine must not aim a force at something nobody has detected.
        // Note what this costs, and that it is meant: the enemy's chance to
        // pick a mover up is rolled on the way into the *fire* phase, after
        // the bound — so the first bound that breaks cover in front of a
        // coverer is not answered. The ambush fires on the next one.
        if (this.trackIntel && !this.knows(coverer.side, actor.id)) continue;

        const bands = posture.weapon === "sustainedMg" ? SUSTAINED_MG_BANDS : SMALL_ARMS_BANDS;
        // A force firing out of a fight inside is answered through the windows it fires from (decision 98).
        const windows = from ? undefined : this.throughWindows(coverer, actor);
        const canFireAt = (at: Point): boolean => {
          actor.position = at;
          const reaches = lookupBand(bands, distance(coverer.position, at)) != null;
          return reaches && (windows ? windows.seen : this.hasLineOfSight(coverer, actor));
        };

        const at = from
          ? firstFiringPoint(from, destination, canFireAt)
          : canFireAt(destination)
            ? destination
            : null;
        actor.position = destination;
        if (!at) continue;

        // The shot is taken with the force standing where it was caught, and
        // on the cover the ground gives *there*. `unit.cover` is only written
        // at placement and at upkeep, so a force that has just broken out of a
        // prepared position still carries that position's cover in the field —
        // and a shot resolved against it would halve the hit chance for ground
        // the force left two hundred metres back. Cover is read at the end of
        // the turn (decision 12) because nothing used to shoot mid-bound; this
        // is the exception the ruling anticipated. ⚠️ Ours, not the author's.
        actor.position = { ...at };
        const wasNeutralized = actor.neutralized;
        const wasCover = actor.cover;
        // Caught on the move it is on the ground it crossed; answered for a
        // shot or an assault it is standing in its own position (decision 85).
        if (from || !this.directionalCover) actor.cover = this.groundCoverAt(at);
        // Read before the shot gives the coverer away (decision 85).
        const unready = this.catchesUnready(coverer, actor);
        const result = resolveDirectFire(this.rng, coverer, actor, {
          weapon: posture.weapon,
          lethality: this.lethality,
          ...(this.mediumMg ? { mediumMg: true } : {}),
          turn: this.turn,
          cover: actor.cover,
          // Its cover by the side the fire comes from (decision 85): the hole
          // it left behind counts for nothing, and covering fire reads cover
          // alone, as it always has, not a force that fired from it.
          ...(this.directionalCover
            ? {
                coverModifier: directionalCoverModifier(actor, coverer.position, this.terrain, this.lethality, {
                  position: !from,
                  ignoreFired: true,
                }),
              }
            : {}),
          // A force caught on the move is the case the movement table is
          // written for: +30% against a walker, -20% against a runner. Without
          // it, running under covering fire is never worse than walking.
          ...(from ? this.movementTerms(actor, true) : {}),
          ...(() => {
            const aim =
              (this.headsDownAim(coverer, actor).aimFactor ?? 1) *
              this.qualityAim(coverer, actor) *
              (unready ? UNREADY.hitFactor : 1) *
              ((coverer.surprisedUntilTurn ?? -1) >= this.turn ? UNREADY.ownFire : 1);
            return aim === 1 ? {} : { aimFactor: aim };
          })(),
              hasLineOfSight: true,
          ...(windows?.pool ? { targetPool: windows.pool } : {}),
        });
        // What it was behind against this fire, as the hit read it, for the
        // suppression the burst puts on it (decision 91): before its cover is put back.
        const suppressionCover = this.suppressionCover(actor, coverer.position, { position: !from });
        actor.cover = wasCover;
        actor.position = destination;

        if (!result.fired) continue;
        if (unready) this.surprise(actor);
        delete coverer.covering;
        // Where it was caught, not where the bound ended (flanking reads it).
        this.noteFire(actor, "direct", this.burstSuppression(posture.weapon, coverer, result, suppressionCover), coverer.position, at, coverer.id);
        this.stress.credit(coverer, result.newCasualties, result.targetNeutralized && !wasNeutralized);
        // The contact is where the shot was taken, not where the bound ended:
        // the coverer saw the force it engaged, and by construction may not be
        // able to see where it went afterwards.
        // The mover saw the shot from where it was caught, not from the end of its bound.
        this.observe(actor.side, coverer.id, "fire", actor, at);
        this.intelRecordAt(coverer.side, actor, at, coverer);
        // It saw the enemy it fired on (decision 86), as a force firing on orders does.
        this.raiseReadiness(coverer, 3);
        taken.push({
          coveringId: coverer.id,
          targetId: actor.id,
          trigger,
          at: { ...at },
          weapon: posture.weapon,
          result,
        });
      }
    } finally {
      actor.position = destination;
      this.reacting = false;
    }
    return taken;
  }

  /**
   * A force's plan for a fight inside a building (rules decision 101): how
   * it goes in, or how it holds — an order, never where each man stands.
   * Given at any turn, the whole plan at once; what it leaves out is the
   * default. Once a fight begins its way in is fixed; grenades, and falling
   * back or holding, are read again each turn.
   */
  setInteriorPlan(unitId: string, plan: InteriorPlan): void {
    const unit = this.getUnit(unitId);
    if (unit.kind === "vehicle") throw new Error(`${unitId} does not fight inside buildings`);
    if (plan.entry !== undefined && plan.entry !== "door" && plan.entry !== "top") throw new Error(`no such way in: ${String(plan.entry)}`);
    if (plan.expects !== undefined && plan.expects !== "below" && plan.expects !== "above") throw new Error(`no such direction: ${String(plan.expects)}`);
    if (plan.holdStoreys !== undefined && !(Array.isArray(plan.holdStoreys) && plan.holdStoreys.length > 0 && plan.holdStoreys.every((k) => Number.isInteger(k) && k >= 0))) throw new Error("storeys are counted from 0, the ground floor");
    this.interior.setOrder(unitId, plan);
    this.journal({ kind: "setInteriorPlan", unitId, plan: cloneForRecord(plan) });
  }

  /**
   * Put a force out scouting, or bring it back in (סיור). A scouting force
   * looks rather than covers ground: it sees better, and it may only walk
   * while it does (rules decision 12).
   */
  setScouting(unitId: string, on: boolean): void {
    const unit = this.getUnit(unitId);
    // Scouting would make a rout walk: refused, like every other order to it.
    if (on && (unit.routing || unit.surrendered)) {
      throw new Error(unit.surrendered ? MORALE_REFUSAL.surrendered : MORALE_REFUSAL.routing);
    }
    unit.scouting = on;
    this.journal({ kind: "setScouting", unitId, on });
  }

  /**
   * Tell a force which way to look (גזרת תצפית), or release it to watch all
   * round. Inside the arc it sees better, outside it worse — so this is an
   * allocation of attention rather than an upgrade (rules decision 14).
   *
   * The sector is an **absolute bearing**, not one relative to the force, so it
   * survives the force moving: a squad told to watch the eastern approach is
   * still watching east after it has displaced.
   */
  setObservationSector(unitId: string, sector: ObservationSector | null): void {
    const unit = this.getUnit(unitId);
    // Normalise once, then record *that* — the journal has to hold the decision
    // the engine took, not the one the caller phrased. A bearing of 400° that
    // becomes 40° must not be narrated back as 400°, and a sector recorded by
    // reference would drift with the caller's object.
    const applied: ObservationSector | null = sector
      ? {
          bearing: ((sector.bearing % 360) + 360) % 360,
          // Never a full circle: watching everything is watching nothing in
          // particular, and it must not be a way to collect the bonus with no
          // ground left outside the arc to pay the penalty (decision 14).
          width: Math.max(1, Math.min(359, sector.width)),
        }
      : null;

    if (applied) unit.observationSector = { ...applied };
    else delete unit.observationSector;
    this.journal({ kind: "setObservationSector", unitId, sector: applied });
  }

  /** Point a force's sector at a place on the map, keeping the width it has. */
  watchTowards(unitId: string, target: Point, width?: number): void {
    const unit = this.getUnit(unitId);
    this.setObservationSector(unitId, {
      bearing: bearingDegrees(unit.position, target),
      width: width ?? unit.observationSector?.width ?? OBSERVATION_SECTOR.defaultWidth,
    });
  }

  /**
   * The gait a force actually moves at, given the posture it is in. A scouting
   * force walks whatever it was told, so an old order to run does not have to
   * be rewritten before it can be sent out to look.
   */
  gaitFor(unit: Unit, mode: MovementMode): MovementMode {
    return unit.scouting ? SCOUTING.maxGait : mode;
  }

  /**
   * The cover a shot at `target` is resolved against, worked out from the
   * force's own state rather than asserted by the caller. A force that fires
   * from its position exposes itself doing it, which is what the document's
   * partial-cover figure is for ("-10% when firing while in cover").
   */
  coverAgainst(target: Unit): CoverState {
    return effectiveCover(target);
  }

  /**
   * A force that fired from full cover this turn is exposed doing it — but
   * keeps −30%, not partial cover's −10% (author, 2026-09-23; rules decision
   * 23). Nothing otherwise: the table's figure stands.
   */
  private coverModifierFor(target: Unit): { coverModifier?: number } {
    if (target.cover === "full" && target.firedThisTurn) {
      return { coverModifier: FIRING_FROM_COVER_MODIFIER };
    }
    return {};
  }

  /**
   * The movement table's "סיכויי פגיעה לאש אויב" for a target that moved this
   * turn — +30% walking, −20% running — read by every direct shot, not only
   * by covering fire, and applied **proportionally**: ×1.3 and ×0.8 (author,
   * 2026-09-23; rules decision 22). The document's own figures; only their
   * application is ruled, as with cover in decision 7. Added, a runner beyond
   * 100 m could not be hit at all.
   */
  private movementTerms(target: Unit, moved: boolean): { targetMovementFactor?: number } {
    if (!moved) return {};
    const gait = target.ranThisTurn ? "run" : "normal";
    // An agile force is harder to hit at a rush (rules decision 69): 1 unless the game plays it.
    return { targetMovementFactor: (1 + MOVEMENT_PROFILES[gait].enemyHitModifier) * rushFactor(target) };
  }

  /** Everything `side` has picked up of the enemy, with where it last saw it. */
  contactsFor(side: Side): Contact[] {
    return this.intel.contactsFor(side);
  }

  /**
   * How far `side`'s report of `unitId` may be off, in metres — one standard
   * deviation — when sightings carry location error (rules decision 51).
   * Undefined without it, or for a force the side does not hold.
   */
  reportSpread(side: Side, unitId: string): number | undefined {
    return this.intel.spreadOf(side, unitId);
  }

  /** What `side` last knows of one enemy force, if anything. */
  contactFor(side: Side, unitId: string): Contact | undefined {
    return this.intel.contactFor(side, unitId);
  }

  /** Whether `side` has picked `unitId` up at all. */
  knows(side: Side, unitId: string): boolean {
    return this.intel.knows(side, unitId);
  }

  // ---- combat phase ----

  /**
   * Whether `observer` has an unobstructed line of sight to `target` — the one
   * test behind seeing a force and shooting at it.
   *
   * Smoke is the document's own obstruction — "אין ירי לתוך\דרך עשן" — and a
   * screen blocks the line whether it lies between the two or over either of
   * them. The ground and what stands on it are rules decision 15: the line
   * runs from the observer's eye to the target's silhouette, each at the
   * height its posture puts it, and a crest or a building between them ends
   * it. Symmetric — whoever can see can be seen.
   */
  hasLineOfSight(observer: Unit, target: Unit): boolean {
    const from = observer.position;
    const to = target.position;
    if (
      SMOKE_BLOCKS_FIRE &&
      this.smoke.some((s) => segmentIntersectsCircle(from, to, s.center, s.radius))
    ) {
      return false;
    }
    return !terrainBlocksSight(this.terrain, from, eyeHeight(observer), to, eyeHeight(target));
  }

  /** The cover the map offers a force standing at `at` (rules decision 15). */
  groundCoverAt(at: Point): CoverState {
    return coverFromObjects(this.terrain, at);
  }

  /**
   * Whether the force is under orders to hold its fire against `targetId`.
   * Checked for every kind of shot, including the player's own click: an order
   * the player can ignore is not an order (rules decision 6 — it stands until
   * it is replaced).
   *
   * An order may carry an **engagement range**: the force holds until the
   * target is inside it, which is how an ambush is laid. With no range, and
   * with no target to measure against, it holds at any range.
   */
  isHoldingFire(unitId: string, targetId?: string): boolean {
    const order = this.standingOrders.get(unitId);
    if (!order?.holdFire) return false;
    if (order.engagementRange == null || targetId == null) return true;
    const range = distance(this.getUnit(unitId).position, this.getUnit(targetId).position);
    return range > order.engagementRange;
  }

  fire(
    attackerId: string,
    targetId: string,
    opts: DirectFireOptions,
  ): WithCoveringFire<DirectFireResult> {
    this.requirePhase("combat");
    const attacker = this.getUnit(attackerId);
    const target = this.getUnit(targetId);
    const moraleRefusal = this.moraleRefusal(attacker, true) ?? this.sameFightRefusal(attacker, target) ?? this.headsDownRefusal(attacker, target);
    // Through the windows nobody sees anybody (decision 98): a shot never taken draws no answer.
    const blind = this.throughWindows(attacker, target)?.seen === false ? NO_LINE_OF_SIGHT : undefined;
    if (moraleRefusal || blind || attacker.covering || this.isHoldingFire(attackerId, targetId)) {
      // A shot never taken draws no answer.
      return {
        fired: false,
        reason: moraleRefusal ?? blind ?? (attacker.covering ? HOLDING_COVERING_FIRE : HOLDING_FIRE),
        range: distance(attacker.position, target.position),
        hitChance: 0,
        shooters: 0,
        hits: 0,
        totalDamage: 0,
        newCasualties: 0,
        targetNeutralized: target.neutralized,
        coveringFire: [],
      };
    }
    // Answered before the shot is resolved, not after: an interrupt, the same
    // way a bound is interrupted (author, 2026-09-16). The attacker's own fire
    // still happens — interrupted, never cancelled — but it happens with
    // whatever the covering fire has just left it, since a force that has lost
    // men has fewer shooters.
    // A force aiming at an enemy has seen it (decision 86): stood to before anything answers it.
    this.raiseReadiness(attacker, 3);
    const coveringFire = this.answerWithCoveringFire(attacker, "fire");
    const targetWasNeutralized = target.neutralized;
    const alreadyFired = attacker.firedThisTurn;
    // Read before the shot gives the firer away (decision 85).
    const unready = this.catchesUnready(attacker, target);
    const fireResult = resolveDirectFire(this.rng, attacker, target, {
      turn: this.turn,
      lethality: this.lethality,
      ...(this.mediumMg ? { mediumMg: true } : {}),
      // A target that moved is easier or harder to hit (decision 22), and one
      // that fired from full cover keeps −30% (decision 23).
      ...this.movementTerms(target, target.movedThisTurn > 0),
      ...(opts.cover == null
        ? this.directionalCover
          ? { coverModifier: directionalCoverModifier(target, attacker.position, this.terrain, this.lethality) }
          : this.coverModifierFor(target)
        : {}),
      ...opts,
      // Heads down beyond close range (decision 65), and fire on the move: the engine's, not the caller's.
      ...this.aimOf(attacker, target, unready),
      // The engine knows what the target is behind; a caller may still say.
      cover: opts.cover ?? this.coverAgainst(target),
      // The caller may assert line of sight itself; otherwise the engine works
      // it out from the smoke on the map — through the windows, man by man,
      // where either force fights inside (decision 98).
      ...(() => {
        const w = this.throughWindows(attacker, target);
        if (!w) return { hasLineOfSight: opts.hasLineOfSight ?? this.hasLineOfSight(attacker, target) };
        return {
          hasLineOfSight: w.seen,
          ...(w.shooters ? { shooterIds: w.shooters } : {}),
          ...(w.pool ? { targetPool: w.pool } : {}),
        };
      })(),
    });
    if (fireResult.fired) {
      if (unready) this.surprise(target);
      this.tire(attacker, alreadyFired);
      this.exchangeContact(attacker, target);
      const cover = opts.cover ? COVER_MODIFIERS[opts.cover] : this.suppressionCover(target, attacker.position);
      this.noteFire(target, "direct", this.burstSuppression(opts.weapon, attacker, fireResult, cover), attacker.position, undefined, attacker.id);
      this.stress.credit(attacker, fireResult.newCasualties, target.neutralized && !targetWasNeutralized);
    }
    this.journal({ kind: "fire", attackerId, targetId, opts });
    return { ...fireResult, coveringFire };
  }

  /**
   * A turn of firing tires a force's crews (rules decision 42) — counted only
   * on the research figures, and once a turn however many of its weapons
   * fired: `alreadyFired` is whether it had fired this turn before this shot.
   */
  private tire(unit: Unit, alreadyFired: boolean): void {
    if (this.lethality === "research" && !alreadyFired) unit.turnsFiring = (unit.turnsFiring ?? 0) + 1;
  }

  fireExplosive(
    weaponKey: string,
    attackerId: string,
    targetId: string,
    opts: { hasLineOfSight?: boolean; collateralIds?: string[] } = {},
  ): WithCoveringFire<DirectExplosiveResult> {
    this.requirePhase("combat");
    const collateral = (opts.collateralIds ?? []).map((id) => this.getUnit(id));
    const attacker = this.getUnit(attackerId);
    const target = this.getUnit(targetId);
    const moraleRefusal = this.moraleRefusal(attacker, true) ?? this.sameFightRefusal(attacker, target) ?? this.headsDownRefusal(attacker, target);
    const blind = this.throughWindows(attacker, target)?.seen === false ? NO_LINE_OF_SIGHT : undefined;
    if (moraleRefusal || blind || attacker.covering || this.isHoldingFire(attackerId, targetId)) {
      return {
        fired: false,
        reason: moraleRefusal ?? blind ?? (attacker.covering ? HOLDING_COVERING_FIRE : HOLDING_FIRE),
        range: distance(attacker.position, target.position),
        hit: false,
        hitChance: 0,
        coveringFire: [],
      };
    }
    // A force aiming at an enemy has seen it (decision 86): stood to before anything answers it.
    this.raiseReadiness(attacker, 3);
    const coveringFire = this.answerWithCoveringFire(attacker, "fire");
    const targetWasNeutralized = target.neutralized;
    const alreadyFired = attacker.firedThisTurn;
    const asShell = this.directHeAsShell;
    // Through the windows where either force fights inside (decision 98).
    const windows = this.throughWindows(attacker, target);
    const window = this.criticalHits ? this.throughTheWindow(weaponKey, attacker, target, windows) : undefined;
    // The building the target is in, when the round is one that breaches its wall.
    const breached =
      SPALLS_INSIDE.has(weaponKey) && target.kind !== "vehicle" ? this.buildingAt(target.position) : undefined;
    const roofed = (u: Unit) => u.baseCover === "full" || underRoof(this.terrain, u.position);
    const result = resolveDirectExplosive(this.rng, weaponKey, attacker, target, {
      hasLineOfSight: windows ? windows.seen : (opts.hasLineOfSight ?? this.hasLineOfSight(attacker, target)),
      ...(windows ? { pools: (u: Unit) => (u === target ? windows.pool : this.throughWindows(attacker, u)?.pool) } : {}),
      // Like a shell's, the round's blast finds whoever is within it (rules
      // decision 75) — save another vehicle, which only the round aimed at
      // it connects with when it is an anti-armour round.
      collateral: asShell
        ? this.units.filter((u) => u !== target && !(u.kind === "vehicle" && EXPLOSIVES[weaponKey]?.usesArmorTable))
        : collateral,
      turn: this.turn,
      lethality: this.lethality,
      // Posture, cover and roofs against men, as an impact-fuzed shell
      // (decisions 29–30, 62) — but a round that breaches the wall of the
      // building the target is in throws its spall among the men inside it,
      // who are behind partial cover then, not under a roof (2026-10-03).
      ...(asShell ? { shell: { factorFor: (u: Unit) => {
        const table = shellVsMen(this.shellCover);
        if (breached && u.kind === "infantry" && distanceToFootprint(breached.footprint, u.position) <= OBJECT_COVER_REACH_M) {
          const f = table.impact;
          return Math.min(f.partial, postureFactor(u, f));
        }
        return shellFactor(u, "impact", roofed(u), table);
      }, airburst: false } } : {}),
      armour: this.armour,
      checked: this.checked,
      ...(window ? { critical: window } : {}),
      // The quality gap on each man the grenade bursts among (decision 87), as on a rifle's hit.
      ...(this.qualityGapGrenades && this.qualityGap && QUALITY_GAP_EXPLOSIVES.has(weaponKey)
        ? { blastFactor: (u: Unit) => (u.side === attacker.side ? 1 : this.qualityAim(attacker, u)) }
        : {}),
    });
    if (result.fired) {
      this.tire(attacker, alreadyFired);
      this.exchangeContact(attacker, target);
      const caught = result.blast?.targets ?? [];
      const bodies = caught.reduce((n, t) => n + t.newCasualties, 0);
      // A roof halves it, as it does a shell's (decision 63, S3).
      const damp = (u: Unit, amount: number) =>
        asShell && this.roofsDampSuppression && roofed(u) ? amount * ROOF_SUPPRESSION_FACTOR : amount;
      this.noteFire(
        target,
        "explosive",
        damp(target, SUPPRESSION.explosive + (result.hit ? SUPPRESSION.explosiveHit : 0)),
        attacker.position,
        undefined,
        attacker.id,
      );
      if (asShell) {
        if (result.hit) this.suppressAroundDirectHit(weaponKey, attacker, target, caught, damp);
        // Everyone the round came down on goes to ground (decision 30).
        for (const t of caught) {
          const unit = this.getUnit(t.unitId);
          if (unit.kind === "infantry") unit.downUnderShelling = true;
        }
      } else {
        for (const t of caught) {
          if (t.unitId !== target.id) {
            this.noteFire(this.getUnit(t.unitId), "explosive", SUPPRESSION.explosive, attacker.position, undefined, attacker.id);
          }
        }
      }
      this.stress.credit(attacker, bodies, target.neutralized && !targetWasNeutralized);
    }
    this.tally.windowCriticals += result.criticals ?? 0;
    // Every round that hit struck the building the target is in (decision 76),
    // after its blast and suppression: the men were under the roof as it was.
    const struck = target.kind === "vehicle" ? undefined : this.buildingAt(target.position);
    if (struck && result.hit) {
      const before = this.structureState(struck.id);
      let state: StructureState | undefined;
      const crushed: { unitId: string; casualties: number }[] = [];
      for (let i = 0; i < (result.hits ?? 1); i++) state = this.strikeStructure(struck, weaponKey, crushed);
      if (state) result.structure = { objectId: struck.id, state, changed: state !== before, ...(crushed.length ? { crushed } : {}) };
    }
    this.journal({ kind: "fireExplosive", weaponKey, attackerId, targetId, opts });
    return { ...result, coveringFire };
  }

  /**
   * Who else a direct-fire HE round that hit suppresses, as a shell would
   * (rules decision 75): the forces its blast reached, and with
   * `suppressionReach` every force within its suppression reach of the
   * target (decision 63, S1), at a direct-fire round's weight rather than a
   * shell's. A round with no lethal area against men (the RPG against
   * armour) reaches no further than its blast.
   */
  private suppressAroundDirectHit(
    weaponKey: string,
    attacker: Unit,
    target: Unit,
    caught: BlastTargetResult[],
    damp: (u: Unit, amount: number) => number,
  ): void {
    const reached = new Set(caught.map((t) => t.unitId));
    const reaches = this.suppressionReach && LETHAL_AREA_M2[weaponKey] !== undefined;
    const scale = SUPPRESSION.explosive / SUPPRESSION.indirect;
    for (const unit of this.units) {
      if (unit === target || unit.neutralized || unit.surrendered) continue;
      const amount = reached.has(unit.id)
        ? SUPPRESSION.explosive
        : reaches
          ? roundSuppression(weaponKey, distance(unit.position, target.position), this.checked) * scale
          : 0;
      if (amount > 0) this.noteFire(unit, "explosive", damp(unit, amount), attacker.position, undefined, attacker.id);
    }
  }

  /**
   * Assault (הסתערות) a neighbouring enemy force. Closing to contact is a
   * movement-phase job, so this only checks that the attacker is already there
   * — see {@link ASSAULT_RANGE_M}.
   */
  assault(
    attackerId: string,
    defenderId: string,
    grenades = 0,
  ): WithCoveringFire<AssaultResult> {
    this.requirePhase("combat");
    const attacker = this.getUnit(attackerId);
    const moraleRefusal = attacker.neutralized ? undefined : this.moraleRefusal(attacker);
    if (attacker.neutralized || moraleRefusal || attacker.covering || this.isHoldingFire(attackerId, defenderId)) {
      return {
        fired: false,
        reason: attacker.neutralized
          ? "attacker is neutralised"
          : moraleRefusal
            ? moraleRefusal
          : attacker.covering
            ? HOLDING_COVERING_FIRE
            : HOLDING_FIRE,
        attackerId,
        defenderId,
        range: distance(attacker.position, this.getUnit(defenderId).position),
        fireHits: 0,
        fireDamage: 0,
        grenadeHits: 0,
        grenadeDamage: 0,
        selfCasualties: 0,
        defenderCasualties: 0,
        defenderNeutralized: this.getUnit(defenderId).neutralized,
        coveringFire: [],
      };
    }
    // A force inside a building is assaulted by going in after it (rules
    // decision 96): the attacker stands at its door, and the fight is fought
    // room by room as the turn closes, not resolved here from outside.
    const target = this.getUnit(defenderId);
    // An enemy fighting in a building is in that building, wherever his force's mark stands (its door).
    const foughtIn = this.closedTerrain && this.counterattackInside ? this.interior.engagementOf(defenderId) : undefined;
    const inside =
      this.closedTerrain && attacker.kind === "infantry" && (target.kind === "infantry" || target.kind === "command") && !target.surrendered
        ? (foughtIn ? this.terrain.objects.find((o) => o.id === foughtIn.buildingId) : this.interior.buildingAt(this.terrain, target.position))
        : undefined;
    const door = inside ? this.interior.frontDoor(this, inside) : undefined;
    if (inside && door && distance(attacker.position, target.position) <= ASSAULT_RANGE_M) {
      // A fight already going on in it: the attacking side's forces join it
      // (decision 99); the defending side's counterattack in, at the door, on
      // an attacker in it (decision 104).
      // ⚠️ Ours: only on a force in that fight; one inside but not in it is not reached by joining.
      const fighting = this.interior.attackerSideIn(inside.id);
      const inThatFight = this.interior.fightersIn(inside.id).includes(defenderId);
      // A fight entered from the roof is joined only by its hatch, which is not modelled (decision 101).
      const joins = this.joinFights && fighting === attacker.side && inThatFight;
      const counters = this.counterattackInside && fighting !== undefined && fighting !== attacker.side && target.side === fighting && inThatFight && !this.interior.inFight(attackerId);
      if (fighting !== undefined && !joins && !counters) return { ...this.noAssault(attackerId, defenderId), reason: INTERIOR_REFUSAL.fightingInside };
      if (joins && this.interior.entryIn(inside.id) !== "door") return { ...this.noAssault(attackerId, defenderId), reason: INTERIOR_REFUSAL.enteredFromRoof };
      // From the roof, as planned (decision 101): only down a house's stairs.
      if (fighting === undefined && this.interior.orderFor(attackerId)?.entry === "top") {
        const floors = this.interior.plan(this, inside);
        if (!floors.stairwell || floors.storeys.length < 2) return { ...this.noAssault(attackerId, defenderId), reason: INTERIOR_REFUSAL.noWayFromRoof };
      }
      // The way to the door is the assault's last bound: it must be within the assault's reach.
      if (distance(attacker.position, door) > ASSAULT_RANGE_M) return { ...this.noAssault(attackerId, defenderId), reason: "out of range" };
      this.raiseReadiness(attacker, 3);
      // Answered on the way in, as any assault is (decision 18).
      const coveringFire = this.answerWithCoveringFire(attacker, "assault");
      attacker.firedThisTurn = true;
      this.interior.goIn(this, attacker, inside);
      this.journal({ kind: "assault", attackerId, defenderId, grenades });
      const defender = this.getUnit(defenderId);
      return {
        fired: false,
        reason: GOES_INSIDE,
        attackerId,
        defenderId,
        range: distance(attacker.position, defender.position),
        fireHits: 0,
        fireDamage: 0,
        grenadeHits: 0,
        grenadeDamage: 0,
        selfCasualties: 0,
        defenderCasualties: 0,
        defenderNeutralized: defender.neutralized,
        coveringFire,
      };
    }
    // Interrupted before it goes in, like any other action (see `fire`).
    // A force aiming at an enemy has seen it (decision 86): stood to before anything answers it.
    this.raiseReadiness(attacker, 3);
    const coveringFire = this.answerWithCoveringFire(attacker, "assault");
    const defender = this.getUnit(defenderId);
    const defenderWasNeutralized = defender.neutralized;
    // Decision 63, S5: a pinned or suppressed defender's nerve is tested as
    // the assault comes in. One that gives itself up is taken; one that runs
    // is assaulted as it goes.
    const nerve =
      this.assaultNerve && this.morale && hasMorale(defender) && !defender.neutralized
        ? nerveUnderAssault(this.rng, this.units, defender, this.turn, {
            testBonus: this.variants.preparedTestBonus ?? PREPARED.testBonus,
          })
        : undefined;
    if (nerve?.outcome === "surrendered") {
      this.abandonWork(defender);
      this.standingOrders.delete(defender.id);
    } else if (nerve?.outcome === "routed") {
      this.abandonWork(defender);
      this.standingOrders.set(defender.id, {
        issuedTurn: this.turn,
        gait: "run",
        destination: this.onTheMap(nerve.to!),
        withdraw: true,
      });
    }
    const nerveNote = nerve && (nerve.broke > 0 || nerve.outcome !== "held") ? { nerve: { outcome: nerve.outcome, broke: nerve.broke } } : {};
    if (nerve?.outcome === "surrendered") {
      this.exchangeContact(attacker, defender);
      this.journal({ kind: "assault", attackerId, defenderId, grenades });
      return {
        fired: true,
        attackerId,
        defenderId,
        range: distance(attacker.position, defender.position),
        fireHits: 0,
        fireDamage: 0,
        grenadeHits: 0,
        grenadeDamage: 0,
        selfCasualties: 0,
        defenderCasualties: 0,
        defenderNeutralized: true,
        ...nerveNote,
        coveringFire,
      };
    }
    const reply = this.variants.assaultReplyChance;
    const result = resolveAssault(this.rng, attacker, defender, {
      grenades,
      turn: this.turn,
      lethality: this.lethality,
      // The quality gap (decision 84), on the assault's fire and the reply.
      ...(this.qualityAim(attacker, defender) !== 1
        ? { fireFactor: this.qualityAim(attacker, defender), replyFactor: this.qualityAim(defender, attacker) }
        : {}),
      // Ruling 1, on trial: the defender fires back, at a rate being measured.
      ...(reply ? { replyChance: reply } : {}),
    });
    if (result.fired) {
      this.exchangeContact(attacker, defender);
      this.noteFire(defender, "assault", SUPPRESSION.assault, attacker.position, undefined, attacker.id);
      if (result.reply) {
        // The reply is the defender's rifles at the assault's range, whatever it
        // carries, on men who have left their cover to go in: no cover, as its hits read none.
        const reply = this.suppressionByVolume
          ? volumeSuppression(false, result.reply.shooters, 0, result.reply.hits)
          : this.directSuppression("smallArms", result.reply.hits);
        this.noteFire(attacker, "direct", reply, defender.position, undefined, defender.id);
        this.stress.credit(defender, result.reply.casualties, attacker.neutralized);
      }
      this.stress.credit(attacker, result.defenderCasualties, defender.neutralized && !defenderWasNeutralized);
    }
    this.journal({ kind: "assault", attackerId, defenderId, grenades });
    return { ...result, ...nerveNote, coveringFire };
  }

  /**
   * Call for a smoke screen. A hand-thrown pot (רימון) is in place at once; a
   * mortar or artillery screen has to be fired, so it waits out that weapon's
   * own שיהוי and arrives with the rest of the indirect fire. Screen size comes
   * from the delivery means unless the caller overrides it.
   *
   * Returns what was ordered either way: `screen` when it is already on the
   * map, `mission` when it is still in flight.
   */
  deploySmoke(
    source: SmokeSource,
    side: Side,
    center: Point,
    radius = SMOKE_RADIUS_M[source],
  ): SmokeOrder {
    if (this.phase !== "targeting" && this.phase !== "combat") {
      throw new PhaseError(`Smoke can only be deployed in targeting or combat phases`);
    }
    this.requireMayCall(side, source);
    if (this.smokeNeedsThrower) this.requireThrower(side, source, center);
    // From the tubes, it is drawn from the side's missions (rules decision 56).
    const costs = this.smokeCostsMission && source !== "grenade" && source !== "rifleGrenade" && this.fireMissionsLeft(side, source) !== undefined;
    if (costs && this.fireMissionsLeft(side, source)! <= 0) {
      throw new Error(`${side} has no ${source} missions left for smoke (rules decision 56)`);
    }
    if (costs) this.smokeMissions.push({ side, weapon: source });
    const delay = EXPLOSIVES[source]?.impactDelayTurns ?? 0;
    const durationTurns = SMOKE_DURATION_TURNS[source];
    const common = { source, radius, durationTurns, arrivesOnTurn: this.turn + delay };
    // Journalled with the resolved radius, so replay does not depend on the
    // default still being what it was when the game was played.
    this.journal({ kind: "deploySmoke", source, side, center, radius });

    if (delay === 0) {
      return { ...common, screen: this.layScreen(center, radius, durationTurns) };
    }
    const mission: PendingSmokeMission = {
      id: this.nextId("smoke"),
      source,
      side,
      target: center,
      radius,
      resolvesOnTurn: this.turn + delay,
    };
    this.pendingSmoke.push(mission);
    return { ...common, mission };
  }

  /**
   * A grenade's smoke needs a man to put it there (`smokeNeedsThrower`): a
   * hand pot a man of the side within throwing range — of an infantry force
   * or a command group — and rifle-grenade smoke "any infantry with a rifle
   * grenadier" (the author, 2026-10-20) within a rifle grenade's reach: a
   * launcher for every `RIFLE_GRENADIERS.menPerLauncher` men still fighting,
   * as the drill fires its HE. A force routing or given up throws nothing;
   * nor does a man put out or broken (as `fireGrenadiers`).
   */
  private requireThrower(side: Side, source: SmokeSource, center: Point): void {
    if (source !== "grenade" && source !== "rifleGrenade") return;
    const reach = source === "grenade" ? SMOKE_GRENADE_THROW_M : EXPLOSIVES.rifleGrenade!.toHitBands!.at(-1)!.maxRange;
    const fighting = (u: Unit) => (u.soldiers ?? []).filter((s) => !s.neutralized && s.morale?.state !== "broken").length;
    const able = this.units.some(
      (u) =>
        u.side === side &&
        (source === "grenade"
          ? (u.kind === "infantry" || u.kind === "command") && fighting(u) >= 1
          : u.kind === "infantry" && fighting(u) >= RIFLE_GRENADIERS.menPerLauncher) &&
        !u.neutralized &&
        !u.routing &&
        !u.surrendered &&
        distance(u.position, center) <= reach,
    );
    if (!able) throw new Error(source === "grenade" ? SMOKE_REFUSAL.noThrower : SMOKE_REFUSAL.noLauncher);
  }

  /** Put a screen on the map now. */
  private layScreen(center: Point, radius: number, turnsRemaining: number): SmokeScreen {
    const screen: SmokeScreen = { id: this.nextId("smoke"), center, radius, turnsRemaining };
    this.smoke.push(screen);
    return screen;
  }

  /** Lay the screens whose flight time elapses this turn. */
  private resolveDueSmoke(): SmokeScreen[] {
    const due = this.pendingSmoke.filter((m) => m.resolvesOnTurn <= this.turn);
    this.pendingSmoke = this.pendingSmoke.filter((m) => m.resolvesOnTurn > this.turn);
    return due.map((m) =>
      this.layScreen(m.target, m.radius, SMOKE_DURATION_TURNS[m.source]),
    );
  }

  // ---- standing orders ----

  /** The order `unit` is currently working to, if any. */
  standingOrderFor(unitId: string): StandingOrder | undefined {
    return this.standingOrders.get(unitId);
  }

  /**
   * Give a force its orders. Refused when the פו"ש interval says no new orders
   * can reach it — which is precisely when it goes on with the ones it has.
   *
   * Issuing does not move anything: {@link executeStandingOrders} carries the
   * order out, so a force in contact and a force out of contact are driven the
   * same way and only differ in who may rewrite the order.
   */
  setStandingOrder(unitId: string, order: Omit<StandingOrder, "issuedTurn">): boolean {
    const unit = this.getUnit(unitId);
    // A routing force is the engine's until it is rallied, and a force that
    // surrendered takes no more orders at all (rules decision 19).
    if (unit.routing || unit.surrendered) return false;
    if (!this.isUnderOrders(unitId) && !this.canReceiveOrders(unitId)) return false;
    this.standingOrders.set(unitId, { ...cloneForRecord(order), issuedTurn: this.turn });
    this.lastOrderTurn.set(unitId, this.turn);
    this.journal({ kind: "setStandingOrder", unitId, order: cloneForRecord(order) });
    void unit;
    return true;
  }

  /**
   * Carry out the standing orders of `side` for the current phase: advance in
   * the movement phase, engage in the fire phase.
   *
   * **An order stands until it is replaced** (rules decision 6). Every force
   * holding one is driven, whether or not its commander can reach it this
   * turn — being in contact means the player *may* rewrite the order, not that
   * the force waits to be told again. Issuing a new order is the override; so
   * is moving the force directly.
   *
   * Execution is journalled as the single decision it is; the moves and shots
   * it produces are derived, so a replay reproduces them exactly. Calling it
   * twice in a phase is harmless — the movement budget and the one-action rule
   * absorb the second call.
   */
  executeStandingOrders(side: Side): StandingOrderExecution[] {
    const executions: StandingOrderExecution[] = [];
    const doing = this.phase === "movement" || this.phase === "combat";

    if (doing) {
      this.executingOrders = true;
      try {
        this.internally(() => {
          for (const unit of this.phase === "combat" ? this.firingOrder(side) : this.units.filter((u) => u.side === side)) {
            const order = this.standingOrders.get(unit.id);
            if (!order) continue;
            const done =
              this.phase === "movement"
                ? this.advanceUnderOrder(unit, order)
                : this.engageUnderOrder(unit, order);
            if (done) executions.push(done);
          }
        });
      } finally {
        this.executingOrders = false;
      }
    }

    this.journal({ kind: "executeStandingOrders", side });
    return executions;
  }

  /** One force's bound towards its objective. */
  private advanceUnderOrder(unit: Unit, order: StandingOrder): StandingOrderExecution | null {
    const base: StandingOrderExecution = { unitId: unit.id };
    if (!order.destination) return null; // holding
    if (unit.neutralized && !unit.canOnlyRetreat) return { ...base, reason: "neutralised" };
    if (this.interior.inFight(unit.id)) return { ...base, reason: INTERIOR_REFUSAL.fightingInside };
    if (unit.movementBlocked) return { ...base, reason: "hit last turn" };
    if (unit.surrendered) return { ...base, reason: MORALE_REFUSAL.surrendered };
    if (suppressionLevel(unit) === "pinned" && !order.withdraw && !unit.routing) {
      return { ...base, reason: MORALE_REFUSAL.pinned };
    }

    const gait = this.gaitFor(unit, order.gait);
    const profile = MOVEMENT_PROFILES[gait];
    const cap = profile.maxDistance * this.paceFactor(unit, gait) - unit.movedThisTurn;
    // The same tolerance moveUnit measures a bound with: a force that has spent
    // its budget is done for the turn, and must not creep the rounding error
    // left over from the bound it just made — a zero-length "move" would report
    // as a bound and cost a detection roll.
    if (cap <= 1e-6) return { ...base, reason: "no movement left" };

    // As far along the line as the budget reaches — less than the flat
    // distance where the line climbs (rules decision 15).
    const to = reachAlong(this.terrain, unit.position, order.destination, cap, this.climbCostPerMetre);
    if (
      unit.kind === "vehicle" &&
      steepestGradeAlong(this.terrain, unit.position, to) > SLOPE.vehicleMaxGradeDeg
    ) {
      return { ...base, reason: "grade too steep" };
    }
    const result = this.moveUnit(unit.id, to, gait);

    const arrived = hasArrived(unit.position, order.destination);
    // Reaching the objective turns "advance" into "hold at the objective" — and
    // a withdrawal into holding where it fell back to, so its men are tested
    // again like anyone else's. A rout stays a rout until it is rallied.
    if (arrived) {
      const { destination: _d, withdraw, ...held } = order;
      this.standingOrders.set(unit.id, unit.routing && withdraw ? { ...held, withdraw } : held);
    }
    return { ...base, moved: { to, arrived, result, ...(order.withdraw ? { withdrawing: true } : {}) } };
  }

  /**
   * One force engaging under its orders — either the enemy the order names, or
   * whatever crosses the line it was told to open fire at.
   *
   * An ambush springs itself: a force holding its fire on an engagement range
   * fires the moment an enemy is inside it, at the **nearest** one unless the
   * order designates a target (author, 2026-08-13). Holding fire with no range
   * is what it says — the force never opens up until the order is replaced.
   */
  private engageUnderOrder(unit: Unit, order: StandingOrder): StandingOrderExecution | null {
    const base: StandingOrderExecution = { unitId: unit.id };
    // Falling back is not fighting, and a force that broke does not fight.
    if (order.withdraw || unit.routing || unit.surrendered) return null;
    const target = this.orderedTargetFor(unit, order);
    if (!target) {
      // Nothing to do: no task, or a task whose conditions are not met — a
      // held force with nobody inside its line has nothing to report.
      if (!order.engage || order.holdFire) return null;
      return { ...base, reason: "target gone" };
    }
    if (this.actionSpent(unit)) return { ...base, reason: "already acted" };
    if (unit.neutralized) return { ...base, reason: "neutralised" };

    const engaged = this.engageWithWhatItHas(unit, target, order.engage?.weapon);
    if (!engaged) return { ...base, reason: "could not fire" };
    if ("reason" in engaged) return { ...base, reason: engaged.reason };
    return { ...base, engaged };
  }

  /**
   * The force this order has `unit` shooting at this turn, if any.
   *
   * A designated target is only engaged when the order's conditions allow it —
   * an ambush laid on 100 m does not reach out to 400 m because a target was
   * named. With no designation, a held force takes the nearest enemy inside its
   * line that its own side has actually picked up: the engine must not aim a
   * force at something nobody has seen.
   */
  private orderedTargetFor(unit: Unit, order: StandingOrder): Unit | undefined {
    const designated = order.engage
      ? this.units.find((u) => u.id === order.engage!.targetId && !u.neutralized)
      : undefined;

    if (!order.holdFire) return designated;
    if (order.engagementRange == null) return undefined; // held at any range

    const inRange = (u: Unit) =>
      distance(unit.position, u.position) <= order.engagementRange! &&
      this.canEngage(unit, u);

    if (designated) return inRange(designated) ? designated : undefined;

    const candidates = this.units
      .filter((u) => u.side !== unit.side && !u.neutralized && !u.vehicle?.destroyed)
      .filter((u) => !this.trackIntel || this.knows(unit.side, u.id))
      .filter(inRange)
      .sort((a, b) => distance(unit.position, a.position) - distance(unit.position, b.position));
    return candidates[0];
  }

  /**
   * Fire on `target` with what the force actually carries: the weapon the order
   * named, a tank's round, or small arms. Normalised to the shape a standing
   * order reports, so an ambush sprung by a tank reads like any other.
   */
  private engageWithWhatItHas(
    unit: Unit,
    target: Unit,
    weapon?: WeaponClass,
  ): StandingOrderExecution["engaged"] | { reason: string } | null {
    // A vehicle ordered to engage with its coaxial gun fires that (decision
    // 25); otherwise its main armament.
    if (unit.kind === "vehicle" && weapon !== "sustainedMg") {
      const result = this.fireExplosive("tankRound", unit.id, target.id);
      if (!result.fired) return { reason: result.reason ?? "could not fire" };
      const caught = (result.blast?.targets ?? []).filter((t) => t.caught);
      return {
        targetId: target.id,
        hits: result.hits ?? (result.hit ? 1 : 0),
        newCasualties: caught.reduce((n, t) => n + t.newCasualties, 0),
        hitChance: result.hitChance,
      };
    }
    const result = this.fire(unit.id, target.id, { weapon: weapon ?? "smallArms" });
    if (!result.fired) return { reason: result.reason ?? "could not fire" };
    return {
      targetId: target.id,
      hits: result.hits,
      newCasualties: result.newCasualties,
      hitChance: result.hitChance,
    };
  }

  // ---- command & control ----

  /**
   * The side's command group (חפ"ק) — the C2 reference for its subordinates.
   * With command succession (rules decision 55), the first still in command:
   * not down, routing or surrendered.
   */
  commandGroupFor(side: Side): Unit | undefined {
    return this.units.find(
      (u) => u.side === side && u.kind === "command" && (!this.commandSuccession || commandsStill(u)),
    );
  }

  /**
   * At the turn's start: has command changed hands since the last one (rules
   * decision 55)? A side whose command group went out passes command to the
   * next in line, which takes {@link SUCCESSION_TURNS} turns.
   */
  private noteSuccession(): void {
    if (!this.commandSuccession) return;
    // Every command group that went out since the last turn leaves the forces
    // it commanded without orders while someone takes over.
    for (const u of this.units) {
      if (u.kind !== "command") continue;
      const now = commandsStill(u);
      if (this.turn > 1 && this.groupsInCommand.has(u.id) && !now) {
        this.handovers.push({ side: u.side, echelon: u.echelon, at: { ...u.position }, until: this.turn + SUCCESSION_TURNS });
      }
      if (now) this.groupsInCommand.add(u.id);
      else this.groupsInCommand.delete(u.id);
    }
    for (const side of this.sides) {
      const now = this.commandGroupFor(side)?.id ?? null;
      const before = this.inCommand.get(side);
      if (before !== undefined && before !== null && before !== now) this.successionUntil.set(side, this.turn + SUCCESSION_TURNS);
      if (before === undefined || before !== null) this.inCommand.set(side, now);
    }
  }

  /** Whether `side` has a commander in command, not handing over (rules decision 55). */
  inCommandOf(side: Side): boolean {
    if (!this.commandSuccession || !this.inCommand.has(side)) return true;
    const held = this.inCommand.get(side);
    if (held === null) return !this.hadCommand(side);
    return this.turn >= (this.successionUntil.get(side) ?? 0);
  }

  /** Whether `unit` was commanded by a command group lost this turn or the last few (rules decision 55). */
  private underHandover(unit: Unit): boolean {
    return this.handovers.some(
      (h) =>
        h.side === unit.side &&
        this.turn < h.until &&
        ECHELON_RANK[h.echelon] > ECHELON_RANK[unit.echelon] &&
        distance(h.at, unit.position) <= (LEADER_REACH_M[h.echelon] ?? 0),
    );
  }

  /** Whether `side` began the battle with a command group at all. */
  private hadCommand(side: Side): boolean {
    return this.units.some((u) => u.side === side && u.kind === "command");
  }

  /** Whether `side` may call its guns: a commander in command (rules decision 55). */
  hasFireControl(side: Side): boolean {
    return this.inCommandOf(side);
  }

  /**
   * Position the C2 interval is measured from: the caller's explicit commander
   * position, else the unit's own side's command group. Undefined when the side
   * has no command group — such a game is played without the C2 constraint.
   */
  private commanderPositionFor(unit: Unit, explicit?: Point): Point | undefined {
    return explicit ?? this.commandGroupFor(unit.side)?.position;
  }

  /**
   * Whether `unit` may receive **new** orders this turn, given the distance to
   * its command element and the order interval from the C2 table. A command
   * group issues orders rather than receiving them, so it is never gated.
   *
   * Note this answers "may be given a *new* order now", so it is false for a
   * unit already ordered this turn — ask {@link isUnderOrders} for whether a
   * unit is acting under orders it already holds.
   */
  canReceiveOrders(unitId: string, commanderPosition?: Point): boolean {
    const unit = this.getUnit(unitId);
    if (unit.kind === "command") return true;
    // Command changing hands, or gone (rules decision 55): no new orders —
    // for the whole side when its senior command group is, and for the
    // forces a lost command group commanded while its successor takes over.
    if (!this.inCommandOf(unit.side)) return false;
    if (this.underHandover(unit)) return false;
    const from = this.commanderPositionFor(unit, commanderPosition);
    if (!from) return true; // no command group → unconstrained
    const interval = orderInterval(unit.echelon, distance(unit.position, from));
    if (interval == null) return true; // no profile → unconstrained
    const last = this.lastOrderTurn.get(unitId);
    if (last == null) return true;
    return this.turn - last >= interval;
  }

  /** Whether `unit` already received its orders this turn and is acting on them. */
  isUnderOrders(unitId: string): boolean {
    return this.lastOrderTurn.get(unitId) === this.turn;
  }

  /**
   * Turn on which `unit` may next receive orders, for display. Null when the
   * unit is unconstrained or has never been ordered (i.e. may be ordered now).
   */
  nextOrderTurn(unitId: string, commanderPosition?: Point): number | null {
    const unit = this.getUnit(unitId);
    if (unit.kind === "command") return null;
    const from = this.commanderPositionFor(unit, commanderPosition);
    if (!from) return null;
    const interval = orderInterval(unit.echelon, distance(unit.position, from));
    const last = this.lastOrderTurn.get(unitId);
    if (interval == null || last == null) return null;
    return last + interval;
  }

  /** Record that `unit` received orders this turn (after a successful check). */
  issueOrders(unitId: string, commanderPosition?: Point): boolean {
    if (!this.canReceiveOrders(unitId, commanderPosition)) return false;
    this.lastOrderTurn.set(unitId, this.turn);
    this.journal({ kind: "issueOrders", unitId, commanderPosition });
    return true;
  }

  /**
   * Whether `unit` may manoeuvre this turn: either it is already acting on
   * orders received this turn, or it is due new ones. Fire is deliberately not
   * gated — a force engages what it sees on its local commander's initiative.
   */
  canManoeuvre(unitId: string, commanderPosition?: Point): boolean {
    if (!this.enforceC2) return true;
    return this.isUnderOrders(unitId) || this.canReceiveOrders(unitId, commanderPosition);
  }

  // ---- upkeep ----

  /**
   * The order `side`'s forces fire in (rules decision 72): still forces first,
   * then by their men's agility — or the order they were added in, when the
   * game does not play it. The engine's own fire under orders follows it, and
   * so should any caller that fires a side's forces one after another.
   */
  firingOrder(side: Side): Unit[] {
    const own = this.units.filter((u) => u.side === side);
    return this.agilityFireOrder && this.morale ? firingOrder(own) : own;
  }

  private endOfTurnUpkeep(): { chargeWork: ChargeWorkReport[]; morale: MoraleReport[] } {
    // A report nobody has refreshed for three turns is no longer a contact —
    // unless marks stay where last seen (rules decision 57).
    if (!this.keepStaleMarks) this.intel.expire(this.turn, OBSERVATION.contactExpiryTurns);
    applyBleeding(this.rng, this.units, this.turn);
    this.smoke = decaySmoke(this.smoke);
    // Before the per-turn flags are cleared: the work is judged on what the
    // force did with the turn it has just finished.
    const chargeWork = this.progressChargeLaying();
    // After the bleeding, so a man who bled out this turn is counted as lost;
    // before the flags clear, for the same reason as the charge work.
    const morale = this.morale ? this.resolveTurnMorale() : [];
    // Before the flags clear too: a man tires on what he did this turn (decision 71).
    for (const u of this.units) updateFatigue(u, this.climbedThisTurn.get(u.id) ?? 0);
    this.climbedThisTurn.clear();

    endTurnUnitUpkeep(
      this.units,
      (at) => coverFromObjects(this.terrain, at),
      (u) => this.preparedCoverAt(u),
      // Digging takes minutes on the research figures (rules decision 50).
      this.lethality,
      // A position faces the way it was dug (decision 85).
      this.directionalCover ? (u) => this.frontFor(u) : undefined,
    );
    return { chargeWork, morale };
  }

  // ---- morale (rules decision 19) ----

  /**
   * The turn's morale step, and what it does to the forces that broke or came
   * back: a routing force is given the engine's own withdrawal order and
   * stops whatever it was doing; a surrendered one is out; a rallied one holds
   * where it is until its commander gives it something else.
   */
  private resolveTurnMorale(): MoraleReport[] {
    const step = resolveMorale({
      rng: this.rng,
      turn: this.turn,
      units: this.units,
      stress: this.stress,
      snapshot: this.turnSnapshot,
      perceives: (side, unit) => !this.trackIntel || this.knows(side, unit.id),
      // Through the windows where either fights inside (the author, 2026-10-20, decision 98).
      sees: (observer, target) => this.spots(observer, target),
      withdrawing: (unit) => this.standingOrders.get(unit.id)?.withdraw === true,
      prepared: {
        testBonus: this.variants.preparedTestBonus ?? PREPARED.testBonus,
        lossFactor: this.variants.preparedLossFactor ?? PREPARED.lossFactor,
      },
      nerveByCover: this.nerveByCover,
      nerveInOpen: this.nerveInOpen,
      // Watching *now*: a contact refreshed this turn. Without the knowledge
      // model there is no fog to respect, and a line of sight from any of its
      // forces is what watching means.
      watching: (side, unit) =>
        this.trackIntel
          ? (this.contactFor(side, unit.id)?.lastSeenTurn ?? -1) >= this.turn
          : this.units.some((u) => u.side === side && !u.neutralized && this.spots(u, unit)),
    });
    for (const { unitId, to } of step.routs) {
      const unit = this.getUnit(unitId);
      this.abandonWork(unit);
      this.standingOrders.set(unitId, {
        issuedTurn: this.turn,
        gait: "run",
        destination: this.onTheMap(to),
        withdraw: true,
      });
    }
    for (const unitId of step.surrendered) {
      this.abandonWork(this.getUnit(unitId));
      this.standingOrders.delete(unitId);
    }
    for (const unitId of step.recovered) this.standingOrders.delete(unitId);
    return step.reports;
  }

  /**
   * Whether a bound to `to` takes the force further from the nearest enemy its
   * side knows of. The command group is driven by hand rather than by orders,
   * so this is how it withdraws when pinned: the player may move it, but only
   * back (rules decision 19).
   */
  private fallsBack(unit: Unit, to: Point): boolean {
    const known = this.units.filter(
      (u) => u.side !== unit.side && !u.neutralized && (!this.trackIntel || this.knows(unit.side, u.id)),
    );
    if (known.length === 0) return true;
    const nearest = known.reduce((a, b) =>
      distance(a.position, unit.position) <= distance(b.position, unit.position) ? a : b,
    );
    return distance(to, nearest.position) > distance(unit.position, nearest.position);
  }

  /** Everything a force was doing that a broken force stops doing. */
  private abandonWork(unit: Unit): void {
    delete unit.covering;
    delete unit.layingCharge;
    unit.camouflaging = false;
    unit.scouting = false;
  }

  /** Keep a point on the ground the battle is fought on, where the ground has an edge. */
  private onTheMap(p: Point): Point {
    const hf = this.terrain.heightfield;
    if (!hf) return p;
    const ox = hf.origin?.x ?? 0;
    const oy = hf.origin?.y ?? 0;
    return {
      x: Math.max(ox, Math.min(ox + (hf.columns - 1) * hf.spacing, p.x)),
      y: Math.max(oy, Math.min(oy + (hf.rows - 1) * hf.spacing, p.y)),
    };
  }

  /**
   * Fire arrived at `target`: note it for the morale step and suppress the
   * force now. `from` is the firer, when there is one on the map; `at` is
   * where the target stood when the shot was taken, if not where it stands
   * now — the bearing is fixed here, so flanking is judged on the shot.
   */
  private noteFire(target: Unit, kind: FireNote["kind"], suppression: number, from?: Point, at?: Point, firerId?: string): void {
    this.fireLog.push({ turn: this.turn, targetId: target.id, kind, ...(firerId ? { firerId } : {}) });
    // Fired on, it knows (decision 86).
    this.raiseReadiness(target, 3);
    if (!this.morale) return;
    const note: FireNote = from ? { kind, bearing: bearingDegrees(at ?? target.position, from) } : { kind };
    // Direct HE is a bombardment for the nerve, like a shell (decision 81).
    if (kind === "explosive" && this.directHeBombards) note.bombards = true;
    this.stress.firedOn(target, note);
    addSuppression(target, suppression);
  }

  /**
   * What a burst of small arms puts on its target: by its volume under
   * rules decision 91, the flat burst before it. `cover` is the target's
   * cover against this fire as the hit table reads it ({@link suppressionCover}).
   */
  private burstSuppression(weapon: WeaponClass, firer: Unit, result: { shooters: number; hits: number }, cover: number): number {
    if (!this.suppressionByVolume) return this.directSuppression(weapon, result.hits);
    // A machine gun is the coaxial, or a team's gun where it fired its own table (decision 90).
    const machineGun = weapon === "sustainedMg" || (this.mediumMg && !!firer.mediumMg);
    return volumeSuppression(machineGun, result.shooters, cover, result.hits);
  }

  /**
   * A force's cover against fire from `from`, as a cover modifier (≤ 0):
   * by the side the fire comes from under directional cover (decision 85),
   * and as cover alone — firing from it costs hits (decision 23), not nerve.
   */
  private suppressionCover(target: Unit, from: Point, opts: { position?: boolean } = {}): number {
    if (this.directionalCover) {
      return directionalCoverModifier(target, from, this.terrain, this.lethality, { ...opts, ignoreFired: true });
    }
    // Its own cover, not `coverAgainst`'s: that drops a force that fired from full cover to partial.
    return COVER_MODIFIERS[target.cover];
  }

  /** What a burst of direct fire suppresses: more for every hit, more again from a machine gun. */
  private directSuppression(weapon: WeaponClass, hits: number): number {
    const burst = SUPPRESSION.directFire + SUPPRESSION.perHit * hits;
    return weapon === "sustainedMg" ? burst * SUPPRESSION.sustainedMgFactor : burst;
  }

  /**
   * The fire a force received from `sinceTurn` on — the umpire's record. A
   * side's view names a firer only if the side holds a mark on it.
   */
  fireReceived(unitId: string, sinceTurn: number): ReceivedFire[] {
    return this.fireLog.filter((f) => f.targetId === unitId && f.turn >= sinceTurn);
  }

  /**
   * Why a force's morale keeps it from acting, if it does: it is routing, it
   * surrendered, or it is falling back under a withdrawal order.
   */
  /**
   * Heads down (rules decision 63, S2): a pinned force shoots at nothing
   * beyond `HEADS_DOWN.fireWithinM`. Undefined when it may shoot.
   */
  private headsDownRefusal(unit: Unit, target: Unit): string | undefined {
    if (!this.headsDown || suppressionLevel(unit) !== "pinned") return undefined;
    // Out to rifle range since decision 65; decision 63 stopped it at 100 m.
    const reach = this.pinnedFiresAtRange ? HEADS_DOWN.fireWithinM : HEADS_DOWN.aimedWithinM;
    return distance(unit.position, target.position) > reach ? MORALE_REFUSAL.headsDown : undefined;
  }

  /**
   * How well a pinned force aims at `target` (rules decision 65): beyond
   * close range it fires over the parapet, at `HEADS_DOWN.beyondAimFactor`.
   * Absent when the shot is taken as any other.
   */
  /** Heads down and fire on the move together, as one factor on the shooter's aim. */
  private aimOf(unit: Unit, target: Unit, unready = false): { aimFactor?: number } {
    const aim =
      (this.headsDownAim(unit, target).aimFactor ?? 1) *
      (unit.movedThisTurn > 0 ? this.fireOnTheMove : 1) *
      this.qualityAim(unit, target) *
      (unready ? UNREADY.hitFactor : 1) *
      // A force caught unready fires badly until the turn is out (decision 85).
      ((unit.surprisedUntilTurn ?? -1) >= this.turn ? UNREADY.ownFire : 1);
    return aim === 1 ? {} : { aimFactor: aim };
  }

  /**
   * The way a position faces when it is dug (rules decision 85): the arc the
   * force watches, else the nearest enemy its side knows of. Neither: no
   * front yet, and it is all-round until it learns which way the threat is.
   */
  private frontFor(u: Unit): number | undefined {
    if (u.observationSector) return u.observationSector.bearing;
    let best: { d: number; at: Point } | undefined;
    for (const c of this.contactsFor(u.side)) {
      if (c.lastKnownNeutralized) continue;
      // Where the side believes it is: the report, never the force itself.
      const d = distance(u.position, c.lastKnownPosition);
      if (!best || d < best.d) best = { d, at: c.lastKnownPosition };
    }
    return best ? bearingDegrees(u.position, best.at) : undefined;
  }

  /**
   * Whether `shooter`'s fire catches `target` unready (rules decision 85):
   * from outside the arc it watches, by an enemy its side had not seen this
   * turn or last. A force watching no arc is not caught this way, and a game
   * that keeps no contacts cannot say who was seen.
   */
  private catchesUnready(shooter: Unit, target: Unit): boolean {
    if (!this.directionalCover || !this.trackIntel) return false;
    const seen = this.contactFor(target.side, shooter.id);
    if (seen && seen.lastSeenTurn >= this.turn - 1) return false;
    // Readiness (decision 86): stood to, never; unaware, from any side.
    const level = this.readiness ? (target.readiness ?? READINESS.default) : 2;
    if (level >= 3) return false;
    if (level === 1) return true;
    const arc = watchedArc(target);
    if (!arc) return false;
    return angleBetween(bearingDegrees(target.position, shooter.position), arc.bearing) > arc.width / 2;
  }

  /**
   * Mark a force caught unready (decisions 85 and 86): it fires at a fraction
   * until the turn is out — or, with readiness, for as many turns as its
   * experience takes to recover from it.
   */
  private surprise(target: Unit): void {
    if (!this.readiness) {
      target.surprisedUntilTurn = this.turn;
      return;
    }
    const turns = SURPRISE_RECOVERY_TURNS[target.experience ?? "regular"];
    if (turns > 0) target.surprisedUntilTurn = this.turn + turns - 1;
  }

  /** The quality gap's factor on `unit`'s small arms against `target` (rules decision 84); 1 without the rule. */
  private qualityAim(unit: Unit, target: Unit): number {
    return this.qualityGap ? qualityGapFactor(unit, target) : 1;
  }

  private headsDownAim(unit: Unit, target: Unit): { aimFactor?: number } {
    if (!this.headsDown || !this.pinnedFiresAtRange || suppressionLevel(unit) !== "pinned") return {};
    return distance(unit.position, target.position) > HEADS_DOWN.aimedWithinM ? { aimFactor: HEADS_DOWN.beyondAimFactor } : {};
  }

  /** An assault not made: nothing fired, nothing changed. */
  private noAssault(attackerId: string, defenderId: string): AssaultResult & { coveringFire: [] } {
    const attacker = this.getUnit(attackerId), defender = this.getUnit(defenderId);
    return {
      fired: false,
      attackerId,
      defenderId,
      range: distance(attacker.position, defender.position),
      fireHits: 0,
      fireDamage: 0,
      grenadeHits: 0,
      grenadeDamage: 0,
      selfCasualties: 0,
      defenderCasualties: 0,
      defenderNeutralized: defender.neutralized,
      coveringFire: [],
    };
  }

  /** Why a force may not act; `firingOut`, for its fire, which a force fighting inside may give through its windows (decision 98). */
  moraleRefusal(unit: Unit, firingOut = false): string | undefined {
    if (unit.surrendered) return MORALE_REFUSAL.surrendered;
    if (this.interior.inFight(unit.id) && !(firingOut && this.windowFire)) return INTERIOR_REFUSAL.fightingInside;
    if (unit.routing) return MORALE_REFUSAL.routing;
    if (this.standingOrders.get(unit.id)?.withdraw) return MORALE_REFUSAL.withdrawing;
    return undefined;
  }

  /**
   * The share of its gait a force can make this turn: half under fire (the
   * document's rule) or suppressed (ours) — the two are one slowing, not two.
   */
  /**
   * The metres of flat going a force has left this turn at `mode` — what
   * `moveUnit` will allow it: its gait (a scout walks), halved under fire,
   * at its slowest man's pace on a rush and its tired men's (rules decisions
   * 69, 71, 82), less what it has already moved.
   */
  moveBudget(unitId: string, mode: MovementMode): number {
    const unit = this.getUnit(unitId);
    const gait = this.gaitFor(unit, mode);
    return Math.max(0, MOVEMENT_PROFILES[gait].maxDistance * this.paceFactor(unit, gait) - unit.movedThisTurn);
  }

  private paceFactor(unit: Unit, gait: MovementMode): number {
    const fire = unit.underFire || suppressionLevel(unit) !== "none" ? UNDER_FIRE_SPEED_MULTIPLIER : 1;
    // Its slowest man's pace at a rush, and its tired men's (rules decisions 69, 71, 82): 1 unless the game plays them.
    return fire * tracePace(unit, gait);
  }

  /** A force's morale as its own side may see it; undefined without morale. */
  forceMorale(unitId: string): ForceMorale | undefined {
    return forceMorale(this.units, this.getUnit(unitId));
  }

  /**
   * Whether `side` has broken (rules decision 19) — the battle is over for it
   * though it still has forces on the map. Always false without morale.
   */
  sideBroken(side: Side): boolean {
    if (!this.morale) return false;
    // The battle waits for a fight inside (rules decision 103): judged once the last one is over —
    // a house with no defender left in it is searched, not fought for.
    if (this.moraleInside && this.closedTerrain && this.interior.engagements.some((e) => e.fight.contested)) return false;
    // By posture on the research figures (rules decision 44), where a routed
    // or neutralised force counts only its men down or broken (decisions 45
    // and 48); two thirds, and such a force counted whole, on the document's.
    if (this.lethality !== "research") return sideBroken(this.units, side);
    const posture = this.attackers.includes(side) ? this.attackerBreakpoint : SIDE_BREAK_BY_POSTURE.defending;
    const share = this.qualityBreakpoint ? Math.min(0.95, Math.max(0.05, posture + this.breakShift(side))) : posture;
    return sideBroken(this.units, side, share, false);
  }

  /** A side's {@link QUALITY_BREAK_SHIFT}: its fighting men's mean, a force without a quality counted regular (rules decision 87). */
  private breakShift(side: Side): number {
    let men = 0;
    let sum = 0;
    for (const u of this.units) {
      if (u.side !== side || u.kind === "command" || u.vehicle) continue;
      const n = u.soldiers?.length ?? 0;
      men += n;
      sum += n * QUALITY_BREAK_SHIFT[u.quality?.type ?? "regular"];
    }
    return men ? sum / men : 0;
  }

  /**
   * Carry each force's charge-laying work through the end of a turn: another
   * turn banked, the charge in the ground, or the work lost (rules decision
   * 16).
   *
   * **One owner for the whole rule.** The work is judged here, from the
   * per-turn flags the force finished the turn with, rather than being
   * cancelled at each of the places a force might do something else — a rule
   * with two halves at two layers is exactly the bug this repo keeps shipping.
   * Which is why it runs before `endTurnUnitUpkeep` clears those flags.
   *
   * The charge is created directly rather than through {@link addMine}: it is
   * derived from the recorded decision to lay it, so journalling it again
   * would add an action the replay never took. Ids still come from the game's
   * own counter, so a replay numbers it identically.
   */
  private progressChargeLaying(): ChargeWorkReport[] {
    const reports: ChargeWorkReport[] = [];
    for (const unit of this.units) {
      const work = unit.layingCharge;
      if (!work) continue;
      const interrupted =
        unit.neutralized ? "neutralized"
        : unit.movedThisTurn > 0 ? "moved"
        : unit.firedThisTurn ? "fought"
        : unit.hitThisTurn || unit.underFire ? "hit"
        : undefined;
      if (interrupted) {
        delete unit.layingCharge;
        reports.push({ unitId: unit.id, type: work.type, position: work.position, interrupted });
        continue;
      }
      work.turnsWorked += 1;
      if (work.turnsWorked < CHARGE_LAYING.turnsToLay) continue;

      const mine: Mine = {
        id: this.nextId("mine"),
        side: unit.side,
        type: work.type,
        position: { ...work.position },
        armed: true,
        detected: false,
      };
      this.mines.push(mine);
      delete unit.layingCharge;
      reports.push({ unitId: unit.id, type: work.type, position: work.position, mine });
    }
    return reports;
  }
}
