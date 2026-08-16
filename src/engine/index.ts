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
  ObservationSector,
  SmokeScreen,
  Mine,
  PendingFireMission,
  PendingSmokeMission,
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
  type CoverState,
} from "./data/directFire.js";
export { EXPLOSIVES, type ExplosiveWeapon, type DeliveryMethod } from "./data/explosives.js";
export {
  SMOKE_DURATION_TURNS,
  SMOKE_RADIUS_M,
  SMOKE_BLOCKS_FIRE,
  type SmokeSource,
} from "./data/smoke.js";
export { UAV_PROFILES, FIXED_WING_MISS_REDUCTION, type UavProfile } from "./data/uav.js";
export { ARMOR_TABLE, MOBILITY_THRESHOLDS, HE_VS_ARMOR, type ArmorRow } from "./data/armor.js";
export { ARTILLERY_DISPERSION } from "./data/artillery.js";
export { C2_TABLE, orderInterval } from "./data/c2.js";
export { CASUALTY_RULES, ASSAULT } from "./data/casualties.js";

// Combat resolvers
export {
  resolveDirectFire,
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
  observeFromPosition,
  sectorFocus,
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
  triggerMines,
  MINE_TRIGGER_RADIUS_M,
  type MineDetonation,
} from "./combat/mines.js";

// Recording / replay
export {
  replayGame,
  replayWithOutcomes,
  sealRecording,
  verifyRecording,
  cloneForRecord,
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
  PHASES,
  PhaseError,
  type Phase,
  type GameOptions,
  type MoveResult,
  type SmokeOrder,
} from "./game.js";
