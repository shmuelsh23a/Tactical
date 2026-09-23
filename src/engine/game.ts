import { Rng } from "./rng.js";
import { roll } from "./dice.js";
import {
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
import type { MovementMode } from "./types.js";
import { MOVEMENT_PROFILES, UNDER_FIRE_SPEED_MULTIPLIER } from "./data/movement.js";
import { EXPLOSIVES, SHELL_VS_MEN, type Fuze } from "./data/explosives.js";
import {
  ADJUSTMENT_RADIUS_M,
  BURST_HEIGHT_M,
  DEFAULT_ROUNDS_FOR_EFFECT,
  MAX_ADJUSTING_ROUNDS,
  INDIRECT_ACCURACY,
  MAX_ROUNDS_PER_MISSION,
  OBSERVE_RANGE_M,
  ON_TARGET_M,
  cepAfter,
} from "./data/artillery.js";
import {
  SMOKE_BLOCKS_FIRE,
  SMOKE_DURATION_TURNS,
  SMOKE_RADIUS_M,
  type SmokeSource,
} from "./data/smoke.js";
import { orderInterval } from "./data/c2.js";
import { CHARGE_LAYING } from "./data/engineering.js";
import {
  canObserve,
  detectByMovement,
  detectByUav,
  observeFromPosition,
  type DetectionResult,
  type Observation,
} from "./combat/detection.js";
import { OBSERVATION, OBSERVATION_SECTOR, SCOUTING } from "./data/concealment.js";
import {
  FIRING_FROM_COVER_MODIFIER,
  SMALL_ARMS_BANDS,
  SUSTAINED_MG_BANDS,
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
  type DirectExplosiveResult,
} from "./combat/explosives.js";
import { resolveIndirectFire, type IndirectFireResult } from "./combat/indirectFire.js";
import { resolveAssault, type AssaultResult } from "./combat/assault.js";
import { applyBleeding, decaySmoke, endTurnUnitUpkeep } from "./upkeep.js";
import { fitSoldiers } from "./units.js";
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
  type Terrain,
} from "./terrain.js";
import { SLOPE } from "./data/terrain.js";
import { cloneForRecord, type GameRecording, type RecordedAction } from "./recording.js";
import { hasArrived, type StandingOrder, type StandingOrderExecution } from "./orders.js";
import {
  StressLedger,
  addSuppression,
  forceMorale,
  generateMorale,
  refreshMoraleStates,
  resolveMorale,
  sideBroken,
  snapshotSoldiers,
  suppressionLevel,
  type FireNote,
  type ForceMorale,
  type MoraleReport,
  type SoldierSnapshot,
} from "./morale.js";
import { SUPPRESSION } from "./data/morale.js";
import { type RuleVariants } from "./data/variants.js";
import { PREPARED } from "./data/morale.js";
import { ASSAULT } from "./data/casualties.js";

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
}

/** A fire mission called in (rules decision 34): adjusting, then fired for effect. */
export interface FireMission {
  id: string;
  side: Side;
  weapon: string;
  target: Point;
  roundsForEffect: number;
  firingFrom?: Point;
  fuze?: Fuze;
  observedByUav?: boolean;
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
   * out may call as many as it likes, each firing
   * {@link DEFAULT_ROUNDS_FOR_EFFECT} for effect.
   */
  fireSupport?: Partial<Record<Side, FireAllotment[]>>;
}

/**
 * The hotseat game engine: owns the full (umpire's) game state and drives the
 * turn/phase loop. Player actions are validated against the current phase.
 */
export class Game {
  readonly seed: number;
  readonly rng: Rng;
  readonly sides: Side[];
  readonly enforceC2: boolean;
  readonly trackIntel: boolean;
  readonly terrain: Terrain;
  readonly morale: boolean;
  readonly variants: RuleVariants;
  /** Targets registered before the battle (rules decision 32). */
  readonly registeredTargets: RegisteredTarget[] = [];
  /** The fire missions each side was assigned (rules decision 34). */
  readonly fireSupport: Partial<Record<Side, FireAllotment[]>>;
  /** Every fire mission called, in the order called. */
  private readonly missions: FireMission[] = [];
  /** Every fire mission called, in the order called — copies: change them and nothing happens. */
  get fireMissions(): FireMission[] {
    return cloneForRecord(this.missions);
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
  private journalDepth = 0;

  private journal(action: RecordedAction): void {
    if (this.journalDepth === 0) this.actions.push(action);
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
    this.terrain = opts.terrain ?? FLAT_GROUND;
    this.morale = opts.morale ?? false;
    this.variants = opts.variants ?? {};
    for (const t of opts.registeredTargets ?? []) {
      if (!this.sides.includes(t.side) || !INDIRECT_ACCURACY[t.weapon] || !Number.isFinite(t.at?.x) || !Number.isFinite(t.at?.y)) {
        throw new Error(`registeredTargets: cannot read ${JSON.stringify(t)}`);
      }
      this.registeredTargets.push({ side: t.side, weapon: t.weapon, at: { x: t.at.x, y: t.at.y } });
    }
    this.onTheMark.push(...this.registeredTargets);
    this.fireSupport = cloneForRecord(opts.fireSupport ?? {});
    for (const [side, list] of Object.entries(this.fireSupport)) {
      if (!this.sides.includes(side as Side) || !Array.isArray(list)) {
        throw new Error(`fireSupport: cannot read ${side}: ${JSON.stringify(list)}`);
      }
      const weapons = new Set<string>();
      for (const a of list) {
        const rounds = a.roundsForEffect ?? DEFAULT_ROUNDS_FOR_EFFECT;
        if (
          !INDIRECT_ACCURACY[a.weapon] ||
          weapons.has(a.weapon) ||
          !Number.isInteger(a.missions) ||
          a.missions < 0 ||
          !Number.isInteger(rounds) ||
          rounds < 1 ||
          rounds > MAX_ROUNDS_PER_MISSION
        ) {
          throw new Error(`fireSupport.${side}: cannot read ${JSON.stringify(a)} (one entry a weapon)`);
        }
        weapons.add(a.weapon);
      }
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
      ...(this.registeredTargets.length ? { registeredTargets: cloneForRecord(this.registeredTargets) } : {}),
      ...(Object.keys(this.fireSupport).length ? { fireSupport: cloneForRecord(this.fireSupport) } : {}),
      // The ground is part of what the decisions were taken on: a replay
      // without it would clear every sight line the battle was fought around.
      ...(this.terrain === FLAT_GROUND ? {} : { terrain: cloneForRecord(this.terrain) }),
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
    // Its men's traits and pools, from their own stream — see `unitSeed` for
    // why not the game's rng. Before the journal entry, like the cover: the
    // recording carries the men as they were drawn, and a replay keeps them.
    if (this.morale) generateMorale(unit, this.seed);
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
    this.turn += 1;
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
  } {
    const result = this.internally(() => {
      if (this.phase === "summary") {
        // The turn ends here, and with it any charge-laying work that was
        // going on: the step that closes the turn reports what became of it.
        const { chargeWork, morale } = this.endOfTurnUpkeep();
        this.beginTurn();
        return { phase: this.phase, chargeWork, ...(this.morale ? { morale } : {}) };
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
  } {
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
        if (++guard > 100) throw new Error(`advanceToPhase: "${target}" not reached`);
      }
    });
    this.journal({ kind: "advanceToPhase", target });
    return { phase: this.phase, resolved, smokeArrived, observed, chargeWork, morale };
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
    for (const id of result.spottedUnitIds) this.observe(viewer, id, "uav");
    this.journal({ kind: "uavSweep", uavKey, footprintCenter, viewer });
    return result;
  }

  // ---- targeting phase ----

  /** How many fire missions of `weapon` `side` has left; undefined when it is not rationed. */
  fireMissionsLeft(side: Side, weapon: string): number | undefined {
    const list = this.fireSupport[side];
    if (!list) return undefined;
    const allotted = list.filter((a) => a.weapon === weapon).reduce((n, a) => n + a.missions, 0);
    const called = this.missions.filter((m) => m.side === side && m.weapon === weapon).length;
    return allotted - called;
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
    opts: { firingFrom?: Point; fuze?: Fuze; observedByUav?: boolean } = {},
  ): FireMission {
    this.requirePhase("targeting");
    if (!INDIRECT_ACCURACY[weaponKey]) throw new Error(`${weaponKey} is not an indirect-fire weapon`);
    const left = this.fireMissionsLeft(side, weaponKey);
    if (left !== undefined && left <= 0) throw new Error(`${side} has no ${weaponKey} fire missions left`);
    if (opts.fuze !== undefined && !(opts.fuze in SHELL_VS_MEN)) throw new Error(`no such fuze: ${String(opts.fuze)}`);
    const allotment = this.fireSupport[side]?.find((a) => a.weapon === weaponKey);
    const mission: FireMission = {
      id: this.nextId("mission"),
      side,
      weapon: weaponKey,
      target: { x: target.x, y: target.y },
      roundsForEffect: allotment?.roundsForEffect ?? DEFAULT_ROUNDS_FOR_EFFECT,
      ...(opts.firingFrom ? { firingFrom: { ...opts.firingFrom } } : {}),
      ...(opts.fuze && opts.fuze !== "impact" ? { fuze: opts.fuze } : {}),
      ...(opts.observedByUav ? { observedByUav: true } : {}),
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

  /**
   * One turn of a fire mission: an adjusting round, or the rounds for effect.
   * While its last adjusting round is still in the air, it waits to see where
   * it lands.
   */
  private stepFireMission(m: FireMission): void {
    if (m.inFlight && this.pendingFire.some((f) => f.id === m.inFlight)) return;
    delete m.inFlight;
    const forEffect =
      this.isOnTheMark(m.side, m.weapon, m.target) ||
      !this.observes(m.side, m.target, m.observedByUav ?? false) ||
      m.adjustingRounds >= MAX_ADJUSTING_ROUNDS;
    const rounds = forEffect ? m.roundsForEffect : 1;
    const queued = this.internally(() =>
      this.queueIndirectFire(m.weapon, m.side, m.target, {
        ...(m.firingFrom ? { firingFrom: m.firingFrom } : {}),
        ...(m.fuze ? { fuze: m.fuze } : {}),
        ...(m.observedByUav ? { observedByUav: true } : {}),
        ...(rounds > 1 ? { rounds } : {}),
      }),
    );
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
    opts: { firingFrom?: Point; observedByUav?: boolean; rounds?: number; fuze?: Fuze } = {},
  ): PendingFireMission {
    this.requirePhase("targeting");
    const weapon = EXPLOSIVES[weaponKey];
    if (!weapon || weapon.delivery !== "indirectFire" || !INDIRECT_ACCURACY[weaponKey]) {
      throw new Error(`${weaponKey} is not an indirect-fire weapon`);
    }
    // A side with its fire assigned as missions fires only those (rules
    // decision 34): the missions queue their own rounds, internally.
    if (this.journalDepth === 0 && this.fireSupport[side]) {
      throw new Error(`${side}'s fire is assigned as missions: call for fire`);
    }
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
      resolvesOnTurn: this.turn + (weapon.impactDelayTurns ?? 1),
      observedByUav: opts.observedByUav ?? false,
      // Only when not the default, so a digest of an older game is unchanged.
      ...(rounds > 1 ? { rounds } : {}),
      ...(fuze !== "impact" ? { fuze } : {}),
    };
    // Stash firing origin on the mission for dispersion orientation.
    (mission as PendingFireMission & { firingFrom?: Point }).firingFrom = opts.firingFrom;
    this.pendingFire.push(mission);
    // As adopted: the defaults are left out, as they are on the mission.
    const { rounds: _r, fuze: _f, ...rest } = opts;
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
    const spec = INDIRECT_ACCURACY[m.weapon];
    if (!spec) throw new Error(`no accuracy for ${m.weapon}`);
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
        distance(u.position, impact) <= OBSERVE_RANGE_M &&
        !(SMOKE_BLOCKS_FIRE && this.smoke.some((sm) => segmentIntersectsCircle(u.position, impact, sm.center, sm.radius))) &&
        !terrainBlocksSight(this.terrain, u.position, eyeHeight(u), impact, BURST_HEIGHT_M),
    );
  }

  /** Resolve indirect-fire missions whose impact-delay elapses this turn: one result a round. */
  private resolveDueFireMissions(): IndirectFireResult[] {
    const due = this.pendingFire.filter((m) => m.resolvesOnTurn <= this.turn);
    this.pendingFire = this.pendingFire.filter((m) => m.resolvesOnTurn > this.turn);
    // Everything due this turn lands together: the men are as they were for
    // all of it, and go to ground after it (rules decision 30).
    const shelled = new Set<Unit>();
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
        }),
      );
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
      for (const round of fired) {
        for (const hit of round.blast.targets) {
          const unit = this.getUnit(hit.unitId);
          this.noteFire(unit, "indirect", SUPPRESSION.indirect);
          if (unit.kind === "infantry") shelled.add(unit);
        }
      }
      // Who called it, so a report can say how far it fell from the aim point
      // to the side that aimed it and no further (rules decision 17). After the
      // spread, so the mission stays the authority if the resolver ever sets it.
      return fired.map((f) => ({ ...f, side: m.side }));
    });
    for (const unit of shelled) unit.downUnderShelling = true;
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
    const unit = this.getUnit(unitId);
    if (unit.neutralized && !unit.canOnlyRetreat) {
      throw new Error(`${unitId} is neutralised and cannot act`);
    }
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
    const cap = profile.maxDistance * this.paceFactor(unit);
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
    const cost = boundCost(this.terrain, unit.position, to);
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
    unit.movedThisTurn += cost;
    if (gait === "run") unit.ranThisTurn = true;

    const enemies = this.units.filter((u) => u.side !== unit.side);
    // Smoke stops the eye as well as the bullet, so observation runs through
    // the same line of sight fire does — where the knowledge model is in play,
    // or where there is ground to see over. A flat game without the model
    // draws exactly what it always drew.
    const sight =
      this.trackIntel || this.terrain !== FLAT_GROUND
        ? (observer: Unit, target: Unit) => this.hasLineOfSight(observer, target)
        : undefined;
    // `from` is where the bound started: a walking force searches the ground it
    // crossed for charges, not only where it halted (rules decision 10).
    const detection = detectByMovement(this.rng, unit, from, gait, enemies, this.mines, sight);
    // What the mover found. What found the mover is rolled once for the whole
    // turn, by every force in position — see observeFromPosition.
    for (const id of detection.spottedUnitIds) this.observe(unit.side, id, "movement");

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
  private observe(side: Side, unitId: string, source: ContactSource): void {
    if (!this.trackIntel) return;
    const unit = this.units.find((u) => u.id === unitId);
    if (!unit || unit.side === side) return;
    this.intel.record(side, unitId, unit.position, this.turn, source, unit.neutralized);
  }

  /**
   * Note a force seen somewhere other than where it now stands — a mover
   * engaged mid-bound (rules decision 18). Everything else observes a force
   * where it is, which is why {@link observe} reads the position itself.
   */
  private intelRecordAt(side: Side, unit: Unit, at: Point): void {
    if (!this.trackIntel) return;
    if (unit.side === side) return;
    this.intel.record(side, unit.id, at, this.turn, "fire", unit.neutralized);
  }

  /**
   * A shot puts both forces on each other's map: the firer plainly has the
   * force it is shooting at, and the force being shot at learns where the fire
   * is coming from. Direct fire only — an indirect mission comes from off the
   * map and gives nothing away (⚠️ rules decision 12).
   */
  private exchangeContact(attacker: Unit, target: Unit): void {
    this.observe(target.side, attacker.id, "fire");
    this.observe(attacker.side, target.id, "fire");
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
    const seen = observeFromPosition(this.rng, this.units, (observer, target) =>
      this.hasLineOfSight(observer, target),
    );
    for (const { observerId, targetId } of seen) {
      this.observe(this.getUnit(observerId).side, targetId, "movement");
    }
    return seen;
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
        if (this.moraleRefusal(coverer)) continue;
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
        const canFireAt = (at: Point): boolean => {
          actor.position = at;
          const reaches = lookupBand(bands, distance(coverer.position, at)) != null;
          return reaches && this.hasLineOfSight(coverer, actor);
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
        actor.cover = this.groundCoverAt(at);
        const result = resolveDirectFire(this.rng, coverer, actor, {
          weapon: posture.weapon,
          turn: this.turn,
          cover: actor.cover,
          // A force caught on the move is the case the movement table is
          // written for: +30% against a walker, -20% against a runner. Without
          // it, running under covering fire is never worse than walking.
          ...(from ? this.movementTerms(actor, true) : {}),
              hasLineOfSight: true,
        });
        actor.cover = wasCover;
        actor.position = destination;

        if (!result.fired) continue;
        delete coverer.covering;
        // Where it was caught, not where the bound ended (flanking reads it).
        this.noteFire(actor, "direct", this.directSuppression(posture.weapon, result.hits), coverer.position, at);
        this.stress.credit(coverer, result.newCasualties, result.targetNeutralized && !wasNeutralized);
        // The contact is where the shot was taken, not where the bound ended:
        // the coverer saw the force it engaged, and by construction may not be
        // able to see where it went afterwards.
        this.observe(actor.side, coverer.id, "fire");
        this.intelRecordAt(coverer.side, actor, at);
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
    return { targetMovementFactor: 1 + MOVEMENT_PROFILES[gait].enemyHitModifier };
  }

  /** Everything `side` has picked up of the enemy, with where it last saw it. */
  contactsFor(side: Side): Contact[] {
    return this.intel.contactsFor(side);
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
    const moraleRefusal = this.moraleRefusal(attacker);
    if (moraleRefusal || attacker.covering || this.isHoldingFire(attackerId, targetId)) {
      // A shot never taken draws no answer.
      return {
        fired: false,
        reason: moraleRefusal ?? (attacker.covering ? HOLDING_COVERING_FIRE : HOLDING_FIRE),
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
    const coveringFire = this.answerWithCoveringFire(attacker, "fire");
    const targetWasNeutralized = target.neutralized;
    const fireResult = resolveDirectFire(this.rng, attacker, target, {
      turn: this.turn,
      // A target that moved is easier or harder to hit (decision 22), and one
      // that fired from full cover keeps −30% (decision 23).
      ...this.movementTerms(target, target.movedThisTurn > 0),
      ...(opts.cover == null ? this.coverModifierFor(target) : {}),
      ...opts,
      // The engine knows what the target is behind; a caller may still say.
      cover: opts.cover ?? this.coverAgainst(target),
      // The caller may assert line of sight itself; otherwise the engine works
      // it out from the smoke on the map.
      hasLineOfSight: opts.hasLineOfSight ?? this.hasLineOfSight(attacker, target),
    });
    if (fireResult.fired) {
      this.exchangeContact(attacker, target);
      this.noteFire(target, "direct", this.directSuppression(opts.weapon, fireResult.hits), attacker.position);
      this.stress.credit(attacker, fireResult.newCasualties, target.neutralized && !targetWasNeutralized);
    }
    this.journal({ kind: "fire", attackerId, targetId, opts });
    return { ...fireResult, coveringFire };
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
    const moraleRefusal = this.moraleRefusal(attacker);
    if (moraleRefusal || attacker.covering || this.isHoldingFire(attackerId, targetId)) {
      return {
        fired: false,
        reason: moraleRefusal ?? (attacker.covering ? HOLDING_COVERING_FIRE : HOLDING_FIRE),
        range: distance(attacker.position, target.position),
        hit: false,
        hitChance: 0,
        coveringFire: [],
      };
    }
    const coveringFire = this.answerWithCoveringFire(attacker, "fire");
    const targetWasNeutralized = target.neutralized;
    const result = resolveDirectExplosive(this.rng, weaponKey, attacker, target, {
      hasLineOfSight: opts.hasLineOfSight ?? this.hasLineOfSight(attacker, target),
      collateral,
      turn: this.turn,
    });
    if (result.fired) {
      this.exchangeContact(attacker, target);
      const caught = result.blast?.targets ?? [];
      const bodies = caught.reduce((n, t) => n + t.newCasualties, 0);
      this.noteFire(
        target,
        "explosive",
        SUPPRESSION.explosive + (result.hit ? SUPPRESSION.explosiveHit : 0),
        attacker.position,
      );
      for (const t of caught) {
        if (t.unitId !== target.id) {
          this.noteFire(this.getUnit(t.unitId), "explosive", SUPPRESSION.explosive, attacker.position);
        }
      }
      this.stress.credit(attacker, bodies, target.neutralized && !targetWasNeutralized);
    }
    this.journal({ kind: "fireExplosive", weaponKey, attackerId, targetId, opts });
    return { ...result, coveringFire };
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
    // Interrupted before it goes in, like any other action (see `fire`).
    const coveringFire = this.answerWithCoveringFire(attacker, "assault");
    const defender = this.getUnit(defenderId);
    const defenderWasNeutralized = defender.neutralized;
    const reply = this.variants.assaultReplyChance;
    const result = resolveAssault(this.rng, attacker, defender, {
      grenades,
      turn: this.turn,
      // Ruling 1, on trial: the defender fires back, at a rate being measured.
      ...(reply ? { replyChance: reply } : {}),
    });
    if (result.fired) {
      this.exchangeContact(attacker, defender);
      this.noteFire(defender, "assault", SUPPRESSION.assault, attacker.position);
      if (result.reply) {
        this.noteFire(attacker, "direct", this.directSuppression("smallArms", result.reply.hits), defender.position);
        this.stress.credit(defender, result.reply.casualties, attacker.neutralized);
      }
      this.stress.credit(attacker, result.defenderCasualties, defender.neutralized && !defenderWasNeutralized);
    }
    this.journal({ kind: "assault", attackerId, defenderId, grenades });
    return { ...result, coveringFire };
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
          for (const unit of this.units.filter((u) => u.side === side)) {
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
    if (unit.movementBlocked) return { ...base, reason: "hit last turn" };
    if (unit.surrendered) return { ...base, reason: MORALE_REFUSAL.surrendered };
    if (suppressionLevel(unit) === "pinned" && !order.withdraw && !unit.routing) {
      return { ...base, reason: MORALE_REFUSAL.pinned };
    }

    const gait = this.gaitFor(unit, order.gait);
    const profile = MOVEMENT_PROFILES[gait];
    const cap = profile.maxDistance * this.paceFactor(unit) - unit.movedThisTurn;
    // The same tolerance moveUnit measures a bound with: a force that has spent
    // its budget is done for the turn, and must not creep the rounding error
    // left over from the bound it just made — a zero-length "move" would report
    // as a bound and cost a detection roll.
    if (cap <= 1e-6) return { ...base, reason: "no movement left" };

    // As far along the line as the budget reaches — less than the flat
    // distance where the line climbs (rules decision 15).
    const to = reachAlong(this.terrain, unit.position, order.destination, cap);
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
      this.hasLineOfSight(unit, u);

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
        hits: result.hit ? 1 : 0,
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

  /** The side's command group (חפ"ק) — the C2 reference for its subordinates. */
  commandGroupFor(side: Side): Unit | undefined {
    return this.units.find((u) => u.side === side && u.kind === "command");
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

  private endOfTurnUpkeep(): { chargeWork: ChargeWorkReport[]; morale: MoraleReport[] } {
    // A report nobody has refreshed for three turns is no longer a contact.
    this.intel.expire(this.turn, OBSERVATION.contactExpiryTurns);
    applyBleeding(this.rng, this.units, this.turn);
    this.smoke = decaySmoke(this.smoke);
    // Before the per-turn flags are cleared: the work is judged on what the
    // force did with the turn it has just finished.
    const chargeWork = this.progressChargeLaying();
    // After the bleeding, so a man who bled out this turn is counted as lost;
    // before the flags clear, for the same reason as the charge work.
    const morale = this.morale ? this.resolveTurnMorale() : [];

    endTurnUnitUpkeep(this.units, (at) => coverFromObjects(this.terrain, at));
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
      sees: (observer, target) => this.hasLineOfSight(observer, target),
      withdrawing: (unit) => this.standingOrders.get(unit.id)?.withdraw === true,
      prepared: {
        testBonus: this.variants.preparedTestBonus ?? PREPARED.testBonus,
        lossFactor: this.variants.preparedLossFactor ?? PREPARED.lossFactor,
      },
      // Watching *now*: a contact refreshed this turn. Without the knowledge
      // model there is no fog to respect, and a line of sight from any of its
      // forces is what watching means.
      watching: (side, unit) =>
        this.trackIntel
          ? (this.contactFor(side, unit.id)?.lastSeenTurn ?? -1) >= this.turn
          : this.units.some((u) => u.side === side && !u.neutralized && this.hasLineOfSight(u, unit)),
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
  private noteFire(target: Unit, kind: FireNote["kind"], suppression: number, from?: Point, at?: Point): void {
    if (!this.morale) return;
    const note: FireNote = from ? { kind, bearing: bearingDegrees(at ?? target.position, from) } : { kind };
    this.stress.firedOn(target, note);
    addSuppression(target, suppression);
  }

  /** What a burst of direct fire suppresses: more for every hit, more again from a machine gun. */
  private directSuppression(weapon: WeaponClass, hits: number): number {
    const burst = SUPPRESSION.directFire + SUPPRESSION.perHit * hits;
    return weapon === "sustainedMg" ? burst * SUPPRESSION.sustainedMgFactor : burst;
  }

  /**
   * Why a force's morale keeps it from acting, if it does: it is routing, it
   * surrendered, or it is falling back under a withdrawal order.
   */
  moraleRefusal(unit: Unit): string | undefined {
    if (unit.surrendered) return MORALE_REFUSAL.surrendered;
    if (unit.routing) return MORALE_REFUSAL.routing;
    if (this.standingOrders.get(unit.id)?.withdraw) return MORALE_REFUSAL.withdrawing;
    return undefined;
  }

  /**
   * The share of its gait a force can make this turn: half under fire (the
   * document's rule) or suppressed (ours) — the two are one slowing, not two.
   */
  private paceFactor(unit: Unit): number {
    return unit.underFire || suppressionLevel(unit) !== "none" ? UNDER_FIRE_SPEED_MULTIPLIER : 1;
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
    return this.morale && sideBroken(this.units, side);
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
