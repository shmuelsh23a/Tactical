/**
 * Public API of the PUM tactical wargame rules engine (משחק מלחמה לפו"ם).
 *
 * Everything is pure TypeScript with a single, seedable source of randomness
 * ({@link Rng}), so a game is fully deterministic and replayable from its seed
 * — the foundation for the browser game now and networked play later.
 */

// Core
export { Rng } from "./rng.js";
export { parseDice, roll, rollDetailed, type Dice } from "./dice.js";
export {
  angleBetween,
  bearingDegrees,
  distance,
  lookupBand,
  withinArc,
  withinRadius,
  segmentIntersectsCircle,
  pointInPolygon,
  type Point,
  type RangeBand,
} from "./geometry.js";

// Domain
export type {
  Side,
  Echelon,
  MovementMode,
  Soldier,
  CrewMember,
  TankPart,
  VehicleState,
  Unit,
  ChargeWork,
  CoveringPosture,
  ObservationSector,
  SmokeScreen,
  Mine,
  PendingFireMission,
  PendingSmokeMission,
  Traits,
  MoraleState,
  SoldierMorale,
  Motivation,
  Experience,
} from "./types.js";
export {
  fitSoldiers,
  fullStrength,
  refreshUnitStatus,
  applyComponentDamage,
  selectHitSoldier,
  makeInfantry,
  makeVehicle,
  makeCommandGroup,
} from "./units.js";

// Data tables
export { MOVEMENT_PROFILES, UNDER_FIRE_SPEED_MULTIPLIER } from "./data/movement.js";
export {
  SMALL_ARMS_BANDS,
  SUSTAINED_MG_BANDS,
  COVER_MODIFIERS,
  FIRING_FROM_COVER_MODIFIER,
  type CoverState,
} from "./data/directFire.js";
export { EXPLOSIVES, SHELL_VS_MEN, type ExplosiveWeapon, type DeliveryMethod, type Fuze } from "./data/explosives.js";
export {
  SMOKE_DURATION_TURNS,
  SMOKE_RADIUS_M,
  SMOKE_BLOCKS_FIRE,
  type SmokeSource,
} from "./data/smoke.js";
export { UAV_PROFILES, FIXED_WING_MISS_REDUCTION, type UavProfile } from "./data/uav.js";
export { ARMOR_TABLE, MOBILITY_THRESHOLDS, HE_VS_ARMOR, type ArmorRow } from "./data/armor.js";
export { ADJUSTMENT_RADIUS_M, ARTILLERY_DISPERSION, DEFAULT_ROUNDS_FOR_EFFECT, FIRE_SUPPORT_MIN_ECHELON, defaultRoundsForEffect } from "./data/artillery.js";
export { C2_TABLE, ECHELON_RANK, orderInterval } from "./data/c2.js";
export {
  MAX_ALTERNATE_POSITIONS_PER_FORCE,
  MAX_REGISTERED_TARGETS_PER_WEAPON,
  OBSERVATION_POST_RANGE_M,
  PREPARED_POSITION_REACH_M,
} from "./data/planning.js";
export { CHARGE_LAYING } from "./data/engineering.js";
export { CASUALTY_RULES, ASSAULT } from "./data/casualties.js";
export * as MORALE_RULES from "./data/morale.js";
export { type RuleVariants } from "./data/variants.js";

// Combat resolvers
export {
  resolveDirectFire,
  NOT_A_COAXIAL_WEAPON,
  type DirectFireResult,
  type DirectFireOptions,
  type WeaponClass,
} from "./combat/directFire.js";
export { resolveArmorHit, rollArmorLocation, type ArmorHitResult } from "./combat/armorDamage.js";
export { resolveDispersion, type DispersionResult } from "./combat/artillery.js";
export {
  resolveBlast,
  resolveDirectExplosive,
  type BlastResult,
  type DirectExplosiveResult,
} from "./combat/explosives.js";
export { resolveIndirectFire, type IndirectFireResult } from "./combat/indirectFire.js";
export { resolveAssault, ASSAULT_RANGE_M, type AssaultResult } from "./combat/assault.js";
export {
  camouflageBonus,
  detectByMovement,
  detectByUav,
  detectionChance,
  isHidden,
  canObserve,
  observeFromPosition,
  sectorFocus,
  watchingAsPost,
  type DetectionResult,
  type Observation,
} from "./combat/detection.js";
export {
  CAMOUFLAGE,
  CAMOUFLAGE_TURNS_AT_MAX,
  COVER_CONCEALMENT,
  DIG_IN,
  OBSERVATION,
  OBSERVATION_SECTOR,
  SCOUTING,
  sectorBonus,
} from "./data/concealment.js";
export { IntelLedger, type Contact, type ContactSource } from "./intel.js";
export {
  FLAT_GROUND,
  betterCover,
  boundCost,
  climbAlong,
  coverFromObjects,
  distanceToFootprint,
  effectiveCover,
  eyeHeight,
  footprintContains,
  groundHeight,
  objectHeight,
  reachAlong,
  reachFan,
  steepestGradeAlong,
  terrainBlocksSight,
  type Footprint,
  type Heightfield,
  type MapLine,
  type MapLineKind,
  type MapObject,
  type Terrain,
} from "./terrain.js";
export {
  EYE_HEIGHT,
  LOS_SAMPLE_STEP_M,
  OBJECT_COVER,
  OBJECT_COVER_REACH_M,
  OBJECT_HEIGHT_M,
  OWN_OBJECT_SIGHT_M,
  SLOPE,
  type MapObjectKind,
} from "./data/terrain.js";
export {
  triggerMines,
  MINE_TRIGGER_RADIUS_M,
  type MineDetonation,
} from "./combat/mines.js";
export {
  COVERING_FIRE,
  firstFiringPoint,
  type CoveringFireResult,
} from "./combat/covering.js";

// Morale (rules decision 19)
export {
  effectiveMorale,
  forceBroken,
  forceMorale,
  generateMorale,
  hasMorale,
  isCornered,
  isDry,
  leaderBonus,
  leadership,
  readySoldiers,
  refreshMoraleStates,
  resolveMorale,
  shooterAccuracy,
  sideBroken,
  suppressionLevel,
  unitSeed,
  StressLedger,
  type FireNote,
  type ForceMorale,
  type ForceMoraleState,
  type MoraleContext,
  type MoraleReport,
  type MoraleStepResult,
  type SoldierSnapshot,
  type SuppressionLevel,
} from "./morale.js";

// Recording / replay
export {
  replayGame,
  replayWithOutcomes,
  sealRecording,
  verifyRecording,
  cloneForRecord,
  RecordingError,
  type RecordingProblem,
  type GameRecording,
  type RecordedAction,
  type ActionOutcome,
  type ReplayStep,
  type RecordingVerification,
} from "./recording.js";
export { stateDigest, canonicalJson, fnv1a } from "./digest.js";
export {
  hasArrived,
  stepTowards,
  ARRIVAL_TOLERANCE_M,
  type StandingOrder,
  type StandingOrderExecution,
} from "./orders.js";

// Turn engine
export {
  Game,
  HOLDING_FIRE,
  HOLDING_COVERING_FIRE,
  LAY_CHARGE_REFUSAL,
  MORALE_REFUSAL,
  PHASES,
  PhaseError,
  type Phase,
  type GameOptions,
  type FireAllotment,
  type FireMission,
  type RegisteredTarget,
  type PreparedPosition,
  type MoveResult,
  type ChargeWorkReport,
  type WithCoveringFire,
  type SmokeOrder,
} from "./game.js";
