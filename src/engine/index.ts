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
  distance,
  lookupBand,
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
export { detectByMovement, detectByUav, type DetectionResult } from "./combat/detection.js";
export {
  triggerMines,
  MINE_TRIGGER_RADIUS_M,
  type MineDetonation,
} from "./combat/mines.js";

// Recording / replay
export {
  replayGame,
  cloneForRecord,
  type GameRecording,
  type RecordedAction,
} from "./recording.js";

// Turn engine
export {
  Game,
  PHASES,
  PhaseError,
  type Phase,
  type GameOptions,
  type MoveResult,
  type SmokeOrder,
} from "./game.js";
