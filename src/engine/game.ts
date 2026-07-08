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
}

/**
 * The hotseat game engine: owns the full (umpire's) game state and drives the
 * turn/phase loop. Player actions are validated against the current phase.
 */
export class Game {
  readonly rng: Rng;
  readonly sides: Side[];
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

  /**
   * Whether `unit` may receive new orders this turn, given the distance to its
   * command element and the order interval from the C2 table.
   */
  canReceiveOrders(unitId: string, commanderPosition: Point): boolean {
    const unit = this.getUnit(unitId);
    const interval = orderInterval(unit.echelon, distance(unit.position, commanderPosition));
    if (interval == null) return true; // no profile → unconstrained
    const last = this.lastOrderTurn.get(unitId);
    if (last == null) return true;
    return this.turn - last >= interval;
  }

  /** Record that `unit` received orders this turn (after a successful check). */
  issueOrders(unitId: string, commanderPosition: Point): boolean {
    if (!this.canReceiveOrders(unitId, commanderPosition)) return false;
    this.lastOrderTurn.set(unitId, this.turn);
    return true;
  }

  // ---- upkeep ----

  private endOfTurnUpkeep(): void {
    applyBleeding(this.rng, this.units, this.turn);
    this.smoke = decaySmoke(this.smoke);
    endTurnUnitUpkeep(this.units);
  }
}
