import { Rng } from "./rng.js";
import { roll } from "./dice.js";
import { distance, type Point } from "./geometry.js";
import type {
  Mine,
  PendingFireMission,
  SmokeScreen,
  Side,
  Unit,
} from "./types.js";
import type { MovementMode } from "./types.js";
import { MOVEMENT_PROFILES, UNDER_FIRE_SPEED_MULTIPLIER } from "./data/movement.js";
import { EXPLOSIVES } from "./data/explosives.js";
import { SMOKE_DURATION_TURNS, type SmokeSource } from "./data/smoke.js";
import { orderInterval } from "./data/c2.js";
import { detectByMovement, detectByUav, type DetectionResult } from "./combat/detection.js";
import { resolveDirectFire, type DirectFireOptions, type DirectFireResult } from "./combat/directFire.js";
import {
  resolveDirectExplosive,
  type DirectExplosiveResult,
} from "./combat/explosives.js";
import { resolveIndirectFire, type IndirectFireResult } from "./combat/indirectFire.js";
import { resolveAssault, type AssaultResult } from "./combat/assault.js";
import { applyBleeding, decaySmoke, endTurnUnitUpkeep } from "./upkeep.js";

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

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

export class PhaseError extends Error {}

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
}

/**
 * The hotseat game engine: owns the full (umpire's) game state and drives the
 * turn/phase loop. Player actions are validated against the current phase.
 */
export class Game {
  readonly rng: Rng;
  readonly sides: Side[];
  readonly enforceC2: boolean;
  turn = 0;
  phase: Phase = "summary"; // pre-game; first beginTurn() starts turn 1
  units: Unit[] = [];
  mines: Mine[] = [];
  smoke: SmokeScreen[] = [];
  pendingFire: PendingFireMission[] = [];
  initiativeOrder: Side[] = [];

  /** Turn each unit last received orders, for the C2 interval rule. */
  private lastOrderTurn = new Map<string, number>();

  constructor(opts: GameOptions) {
    this.rng = new Rng(opts.seed);
    this.sides = opts.sides ?? ["RED", "BLUE"];
    this.enforceC2 = opts.enforceC2 ?? true;
  }

  // ---- setup ----

  addUnit(unit: Unit): Unit {
    this.units.push(unit);
    return unit;
  }

  addMine(mine: Omit<Mine, "id">): Mine {
    const m: Mine = { ...mine, id: nextId("mine") };
    this.mines.push(m);
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
  advancePhase(): { phase: Phase; resolved?: IndirectFireResult[] } {
    if (this.phase === "summary") {
      this.endOfTurnUpkeep();
      this.beginTurn();
      return { phase: this.phase };
    }
    const idx = PHASES.indexOf(this.phase);
    this.phase = PHASES[idx + 1]!;
    if (this.phase === "resolvePriorArty") {
      return { phase: this.phase, resolved: this.resolveDueFireMissions() };
    }
    return { phase: this.phase };
  }

  /**
   * Advance repeatedly until the given phase is current. Convenience for
   * callers (and tests) that want to skip directly to a phase; will roll into
   * subsequent turns if the target lies ahead of `summary`.
   */
  advanceToPhase(target: Phase): void {
    let guard = 0;
    while (this.phase !== target) {
      this.advancePhase();
      if (++guard > 100) throw new Error(`advanceToPhase: "${target}" not reached`);
    }
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
    return detectByUav(this.rng, uavKey, footprintCenter, enemies, this.mines);
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
      id: nextId("fire"),
      weapon: weaponKey,
      side,
      target,
      resolvesOnTurn: this.turn + (weapon.impactDelayTurns ?? 1),
      observedByUav: opts.observedByUav ?? false,
    };
    // Stash firing origin on the mission for dispersion orientation.
    (mission as PendingFireMission & { firingFrom?: Point }).firingFrom = opts.firingFrom;
    this.pendingFire.push(mission);
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
  moveUnit(unitId: string, to: Point, mode: MovementMode = "normal"): DetectionResult {
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
    const needsNewOrders = !this.isUnderOrders(unitId);
    if (!this.canManoeuvre(unitId)) {
      throw new Error(
        `${unitId} has received no orders this turn (next orders on turn ${this.nextOrderTurn(unitId)})`,
      );
    }
    const profile = MOVEMENT_PROFILES[mode];
    const cap = profile.maxDistance * (unit.underFire ? UNDER_FIRE_SPEED_MULTIPLIER : 1);
    const dist = distance(unit.position, to);
    // The cap is a per-turn budget (e.g. "up to 50 m in a turn"), so movement
    // already spent this turn counts against it — a unit can move in several
    // steps but no further than its gait allows in total.
    if (unit.movedThisTurn + dist > cap + 1e-6) {
      const remaining = Math.max(0, cap - unit.movedThisTurn);
      throw new Error(
        `Move of ${dist.toFixed(1)} m exceeds remaining ${mode} budget of ${remaining.toFixed(1)} m`,
      );
    }
    if (needsNewOrders && this.canReceiveOrders(unitId)) this.lastOrderTurn.set(unitId, this.turn);
    const from = unit.position;
    unit.position = { ...to };
    unit.movedThisTurn += dist;

    const enemies = this.units.filter((u) => u.side !== unit.side);
    return detectByMovement(this.rng, unit, mode, enemies, this.mines);
  }

  // ---- combat phase ----

  fire(attackerId: string, targetId: string, opts: DirectFireOptions): DirectFireResult {
    this.requirePhase("combat");
    return resolveDirectFire(this.rng, this.getUnit(attackerId), this.getUnit(targetId), {
      turn: this.turn,
      ...opts,
    });
  }

  fireExplosive(
    weaponKey: string,
    attackerId: string,
    targetId: string,
    opts: { hasLineOfSight?: boolean; collateralIds?: string[] } = {},
  ): DirectExplosiveResult {
    this.requirePhase("combat");
    const collateral = (opts.collateralIds ?? []).map((id) => this.getUnit(id));
    return resolveDirectExplosive(
      this.rng,
      weaponKey,
      this.getUnit(attackerId),
      this.getUnit(targetId),
      { hasLineOfSight: opts.hasLineOfSight, collateral, turn: this.turn },
    );
  }

  assault(attackerId: string, defenderId: string, grenades = 0): AssaultResult {
    this.requirePhase("combat");
    return resolveAssault(this.rng, this.getUnit(attackerId), this.getUnit(defenderId), {
      grenades,
      turn: this.turn,
    });
  }

  /** Lay a smoke screen of the given source's duration. */
  deploySmoke(source: SmokeSource, center: Point, radius = 50): SmokeScreen {
    if (this.phase !== "targeting" && this.phase !== "combat") {
      throw new PhaseError(`Smoke can only be deployed in targeting or combat phases`);
    }
    const screen: SmokeScreen = {
      id: nextId("smoke"),
      center,
      radius,
      turnsRemaining: SMOKE_DURATION_TURNS[source],
    };
    this.smoke.push(screen);
    return screen;
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
    applyBleeding(this.rng, this.units, this.turn);
    this.smoke = decaySmoke(this.smoke);
    endTurnUnitUpkeep(this.units);
  }
}
