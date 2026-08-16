import { Rng } from "./rng.js";
import { roll } from "./dice.js";
import { bearingDegrees, distance, segmentIntersectsCircle, type Point } from "./geometry.js";
import type {
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
import { EXPLOSIVES } from "./data/explosives.js";
import {
  SMOKE_BLOCKS_FIRE,
  SMOKE_DURATION_TURNS,
  SMOKE_RADIUS_M,
  type SmokeSource,
} from "./data/smoke.js";
import { orderInterval } from "./data/c2.js";
import {
  detectByMovement,
  detectByUav,
  observeFromPosition,
  type DetectionResult,
  type Observation,
} from "./combat/detection.js";
import { OBSERVATION, OBSERVATION_SECTOR, SCOUTING } from "./data/concealment.js";
import type { CoverState } from "./data/directFire.js";
import { IntelLedger, type Contact, type ContactSource } from "./intel.js";
import { triggerMines, type MineDetonation } from "./combat/mines.js";
import {
  resolveDirectFire,
  type DirectFireOptions,
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
import { cloneForRecord, type GameRecording, type RecordedAction } from "./recording.js";
import {
  hasArrived,
  stepTowards,
  type StandingOrder,
  type StandingOrderExecution,
} from "./orders.js";

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

/** Refusal reason when a force is under orders to hold its fire. */
export const HOLDING_FIRE = "holding fire";

/** What a move turned up: what the force saw, and what it set off. */
export interface MoveResult {
  detection: DetectionResult;
  /** Charges triggered along the path walked. */
  mineDetonations: MineDetonation[];
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

  /**
   * Set while the engine is carrying out a standing order. Execution bypasses
   * the C2 gate — the whole point is that a force out of contact still acts —
   * and must not stamp the order clock, since no new order was received.
   */
  private executingOrders = false;

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
      actions: cloneForRecord(this.actions),
    };
  }

  // ---- setup ----

  addUnit(unit: Unit): Unit {
    this.units.push(unit);
    this.journal({ kind: "addUnit", unit: cloneForRecord(unit) });
    return unit;
  }

  addMine(mine: Omit<Mine, "id">): Mine {
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
    this.journal({ kind: "beginTurn" });
    return { turn: this.turn, initiativeOrder: this.initiativeOrder };
  }

  /** Roll 1d10 per side and order sides by descending initiative. */
  rollInitiative(): Side[] {
    const rolls = this.sides.map((side) => ({ side, roll: roll(this.rng, "1d10") }));
    rolls.sort((a, b) => b.roll - a.roll || this.sides.indexOf(a.side) - this.sides.indexOf(b.side));
    return rolls.map((r) => r.side);
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
  } {
    const result = this.internally(() => {
      if (this.phase === "summary") {
        this.endOfTurnUpkeep();
        this.beginTurn();
        return { phase: this.phase };
      }
      const idx = PHASES.indexOf(this.phase);
      this.phase = PHASES[idx + 1]!;
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
  } {
    const resolved: IndirectFireResult[] = [];
    const smokeArrived: SmokeScreen[] = [];
    const observed: Observation[] = [];
    this.internally(() => {
      let guard = 0;
      while (this.phase !== target) {
        const step = this.advancePhase();
        if (step.resolved) resolved.push(...step.resolved);
        if (step.smokeArrived) smokeArrived.push(...step.smokeArrived);
        if (step.observed) observed.push(...step.observed);
        if (++guard > 100) throw new Error(`advanceToPhase: "${target}" not reached`);
      }
    });
    this.journal({ kind: "advanceToPhase", target });
    return { phase: this.phase, resolved, smokeArrived, observed };
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

  /** Queue an indirect-fire mission; it resolves after the weapon's delay. */
  queueIndirectFire(
    weaponKey: string,
    side: Side,
    target: Point,
    opts: { firingFrom?: Point; observedByUav?: boolean } = {},
  ): PendingFireMission {
    this.requirePhase("targeting");
    const weapon = EXPLOSIVES[weaponKey];
    if (!weapon || weapon.delivery !== "indirectFire") {
      throw new Error(`${weaponKey} is not an indirect-fire weapon`);
    }
    const mission: PendingFireMission = {
      id: this.nextId("fire"),
      weapon: weaponKey,
      side,
      target,
      resolvesOnTurn: this.turn + (weapon.impactDelayTurns ?? 1),
      observedByUav: opts.observedByUav ?? false,
    };
    // Stash firing origin on the mission for dispersion orientation.
    (mission as PendingFireMission & { firingFrom?: Point }).firingFrom = opts.firingFrom;
    this.pendingFire.push(mission);
    this.journal({ kind: "queueIndirectFire", weaponKey, side, target, opts });
    return mission;
  }

  /** Resolve indirect-fire missions whose impact-delay elapses this turn. */
  private resolveDueFireMissions(): IndirectFireResult[] {
    const due = this.pendingFire.filter((m) => m.resolvesOnTurn <= this.turn);
    this.pendingFire = this.pendingFire.filter((m) => m.resolvesOnTurn > this.turn);
    return due.map((m) =>
      resolveIndirectFire(this.rng, m.weapon, m.target, this.units, {
        firingFrom: (m as PendingFireMission & { firingFrom?: Point }).firingFrom,
        fixedWingObserved: m.observedByUav,
        turn: this.turn,
      }),
    );
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
    const cap = profile.maxDistance * (unit.underFire ? UNDER_FIRE_SPEED_MULTIPLIER : 1);
    const dist = distance(unit.position, to);
    // The cap is a per-turn budget (e.g. "up to 50 m in a turn"), so movement
    // already spent this turn counts against it — a unit can move in several
    // steps but no further than its gait allows in total.
    if (unit.movedThisTurn + dist > cap + 1e-6) {
      const remaining = Math.max(0, cap - unit.movedThisTurn);
      throw new Error(
        `Move of ${dist.toFixed(1)} m exceeds remaining ${gait} budget of ${remaining.toFixed(1)} m`,
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
    const from = unit.position;
    unit.position = { ...to };
    unit.movedThisTurn += dist;
    if (gait === "run") unit.ranThisTurn = true;

    const enemies = this.units.filter((u) => u.side !== unit.side);
    // Smoke stops the eye as well as the bullet, so observation runs through
    // the same line of sight fire does — but only where the knowledge model is
    // in play, so a game without it draws exactly what it always drew.
    const sight = this.trackIntel
      ? (from: Point, to: Point) => this.hasLineOfSight(from, to)
      : undefined;
    const detection = detectByMovement(this.rng, unit, gait, enemies, this.mines, sight);
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

    this.journal({ kind: "moveUnit", unitId, to, mode });
    return { detection, mineDetonations: detonations };
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
    const seen = observeFromPosition(this.rng, this.units, (from, to) =>
      this.hasLineOfSight(from, to),
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
    unit.camouflaging = on;
    if (!on) unit.camouflageTurns = 0;
    this.journal({ kind: "setCamouflage", unitId, on });
  }

  /**
   * Put a force out scouting, or bring it back in (סיור). A scouting force
   * looks rather than covers ground: it sees better, and it may only walk
   * while it does (rules decision 12).
   */
  setScouting(unitId: string, on: boolean): void {
    this.getUnit(unitId).scouting = on;
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
    if (target.cover === "full" && target.firedThisTurn) return "partial";
    return target.cover;
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
   * Whether a shot from `from` to `to` has an unobstructed line of sight. The
   * document's only modelled obstruction is smoke — "אין ירי לתוך\דרך עשן" —
   * so a screen blocks the shot whether it lies between the two points or over
   * either of them. Terrain LOS comes with the map iteration.
   */
  hasLineOfSight(from: Point, to: Point): boolean {
    if (!SMOKE_BLOCKS_FIRE) return true;
    return !this.smoke.some((s) => segmentIntersectsCircle(from, to, s.center, s.radius));
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

  fire(attackerId: string, targetId: string, opts: DirectFireOptions): DirectFireResult {
    this.requirePhase("combat");
    const attacker = this.getUnit(attackerId);
    const target = this.getUnit(targetId);
    if (this.isHoldingFire(attackerId, targetId)) {
      return {
        fired: false,
        reason: HOLDING_FIRE,
        range: distance(attacker.position, target.position),
        hitChance: 0,
        shooters: 0,
        hits: 0,
        totalDamage: 0,
        newCasualties: 0,
        targetNeutralized: target.neutralized,
      };
    }
    const fireResult = resolveDirectFire(this.rng, attacker, target, {
      turn: this.turn,
      ...opts,
      // The engine knows what the target is behind; a caller may still say.
      cover: opts.cover ?? this.coverAgainst(target),
      // The caller may assert line of sight itself; otherwise the engine works
      // it out from the smoke on the map.
      hasLineOfSight: opts.hasLineOfSight ?? this.hasLineOfSight(attacker.position, target.position),
    });
    if (fireResult.fired) this.exchangeContact(attacker, target);
    this.journal({ kind: "fire", attackerId, targetId, opts });
    return fireResult;
  }

  fireExplosive(
    weaponKey: string,
    attackerId: string,
    targetId: string,
    opts: { hasLineOfSight?: boolean; collateralIds?: string[] } = {},
  ): DirectExplosiveResult {
    this.requirePhase("combat");
    const collateral = (opts.collateralIds ?? []).map((id) => this.getUnit(id));
    const attacker = this.getUnit(attackerId);
    const target = this.getUnit(targetId);
    if (this.isHoldingFire(attackerId, targetId)) {
      return {
        fired: false,
        reason: HOLDING_FIRE,
        range: distance(attacker.position, target.position),
        hit: false,
        hitChance: 0,
      };
    }
    const result = resolveDirectExplosive(this.rng, weaponKey, attacker, target, {
      hasLineOfSight:
        opts.hasLineOfSight ?? this.hasLineOfSight(attacker.position, target.position),
      collateral,
      turn: this.turn,
    });
    if (result.fired) this.exchangeContact(attacker, target);
    this.journal({ kind: "fireExplosive", weaponKey, attackerId, targetId, opts });
    return result;
  }

  /**
   * Assault (הסתערות) a neighbouring enemy force. Closing to contact is a
   * movement-phase job, so this only checks that the attacker is already there
   * — see {@link ASSAULT_RANGE_M}.
   */
  assault(attackerId: string, defenderId: string, grenades = 0): AssaultResult {
    this.requirePhase("combat");
    const attacker = this.getUnit(attackerId);
    if (attacker.neutralized || this.isHoldingFire(attackerId, defenderId)) {
      return {
        fired: false,
        reason: attacker.neutralized ? "attacker is neutralised" : HOLDING_FIRE,
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
      };
    }
    const result = resolveAssault(this.rng, attacker, this.getUnit(defenderId), {
      grenades,
      turn: this.turn,
    });
    if (result.fired) this.exchangeContact(attacker, this.getUnit(defenderId));
    this.journal({ kind: "assault", attackerId, defenderId, grenades });
    return result;
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

    const gait = this.gaitFor(unit, order.gait);
    const profile = MOVEMENT_PROFILES[gait];
    const cap =
      profile.maxDistance * (unit.underFire ? UNDER_FIRE_SPEED_MULTIPLIER : 1) -
      unit.movedThisTurn;
    // The same tolerance moveUnit measures a bound with: a force that has spent
    // its budget is done for the turn, and must not creep the rounding error
    // left over from the bound it just made — a zero-length "move" would report
    // as a bound and cost a detection roll.
    if (cap <= 1e-6) return { ...base, reason: "no movement left" };

    const to = stepTowards(unit.position, order.destination, cap);
    const result = this.moveUnit(unit.id, to, gait);

    const arrived = hasArrived(unit.position, order.destination);
    // Reaching the objective turns "advance" into "hold at the objective".
    if (arrived) this.standingOrders.set(unit.id, { ...order, destination: undefined });
    return { ...base, moved: { to, arrived, result } };
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
    const target = this.orderedTargetFor(unit, order);
    if (!target) {
      // Nothing to do: no task, or a task whose conditions are not met — a
      // held force with nobody inside its line has nothing to report.
      if (!order.engage || order.holdFire) return null;
      return { ...base, reason: "target gone" };
    }
    if (unit.firedThisTurn) return { ...base, reason: "already acted" };
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
      this.hasLineOfSight(unit.position, u.position);

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
    if (unit.kind === "vehicle") {
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

  private endOfTurnUpkeep(): void {
    // A report nobody has refreshed for three turns is no longer a contact.
    this.intel.expire(this.turn, OBSERVATION.contactExpiryTurns);
    applyBleeding(this.rng, this.units, this.turn);
    this.smoke = decaySmoke(this.smoke);
    endTurnUnitUpkeep(this.units);
  }
}
