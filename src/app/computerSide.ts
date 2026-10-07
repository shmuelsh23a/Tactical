import { ADJUSTMENT_RADIUS_M, CE_PER_SIGMA, EYE_HEIGHT, distance, type Game, type Point, type Side, type Unit } from "../engine/index.js";
import { ScriptedCompany, type CompanyPlan, type CompanySnapshot } from "./company.js";
import { isDeadGround } from "./deadGround.js";
import {
  DrillState,
  PLAIN_SCRIPT,
  drillCombat,
  drillMovement,
  type DrillReport,
  type DrillStateSnapshot,
  type DrillTask,
  type SquadDrill,
} from "./drill.js";
import { sideView } from "./hotseat.js";

/**
 * A side the computer plays: the defending company's fire plan and fire
 * calls, moved here from the headless runner (src/sim/scenarioBattle.ts) so
 * that the browser game and the harness play the same defender. Every choice
 * reads the side's own picture (`sideView`, its contacts) and the ground,
 * never where the enemy truly is.
 */

const MORTAR = "mortar";

const mean = (us: readonly Unit[]): Point => ({
  x: us.reduce((t, u) => t + u.position.x, 0) / us.length,
  y: us.reduce((t, u) => t + u.position.y, 0) / us.length,
});

/** Whether `side` may call its mortars now: allowed, missions left, and none still adjusting. */
export function mortarFree(g: Game, side: Side): boolean {
  if (!g.mayCall(side, MORTAR)) return false;
  if ((g.fireMissionsLeft(side, MORTAR) ?? 1) <= 0) return false;
  return !g.fireMissions.some((m) => m.side === side && m.weapon === MORTAR && m.status === "adjusting");
}

/** Registered targets the defending company plans (decision 38 allows six a weapon). */
const DEFENDER_TARGETS = 6;
/** Where it looks for them: this far in front of its positions (ours). */
const DEFENDER_PLAN_BAND_M = { near: 100, far: 400 } as const;
/** No two closer than this: each covers its 100 m on-the-mark radius (ours). */
const DEFENDER_TARGET_SPACING_M = 120;

/**
 * The defending company's fire plan (a harness policy, ours; rules decision 38
 * lets it register six targets a weapon in planning). It covers with fire what
 * its squads cannot see: the dead ground 100–400 m in front of its positions,
 * toward where the attack comes from, the nearest its positions first — where
 * an assault forms up and closes; if there is too
 * little dead ground, points on the line itself fill the plan. It reads its own
 * positions, the ground and the direction of the attack (the brief's tasking,
 * taken as the attacker's start line) — never where the attacker is.
 */
export function planDefenderFires(
  g: Game,
  side: Side,
  attackFrom: Point,
  width: number,
  height: number,
  prefer: "deadGround" | "open" = "deadGround",
): Point[] {
  const own = g.units.filter((u) => u.side === side && u.kind === "infantry");
  if (!own.length || !g.terrain) return [];
  const centre = mean(own);
  const range = distance(centre, attackFrom);
  if (range === 0) return [];
  const ux = (attackFrom.x - centre.x) / range;
  const uy = (attackFrom.y - centre.y) / range;
  const query = { terrain: g.terrain, watchers: own.map((u) => u.position), watcherEye: EYE_HEIGHT.fullCover, reach: Infinity };
  const candidates: { at: Point; dead: boolean; along: number; off: number }[] = [];
  for (let x = 0; x <= width; x += 20) {
    for (let y = 0; y <= height; y += 20) {
      const dx = x - centre.x;
      const dy = y - centre.y;
      const along = dx * ux + dy * uy;
      if (along < DEFENDER_PLAN_BAND_M.near || along > DEFENDER_PLAN_BAND_M.far) continue;
      const off = Math.abs(dx * uy - dy * ux);
      if (off > along) continue; // within 45° of the line of attack
      const at = { x, y };
      candidates.push({ at, dead: isDeadGround(query, at), along, off });
    }
  }
  // Dead ground first (or open ground, `prefer`), the nearest the positions
  // first — where an assault forms up and closes; then nearest the line of
  // attack; ties by position.
  const first = prefer === "open" ? -1 : 1;
  candidates.sort(
    (a, b) => first * (Number(b.dead) - Number(a.dead)) || a.along - b.along || a.off - b.off || a.at.y - b.at.y || a.at.x - b.at.x,
  );
  const chosen: Point[] = [];
  for (const c of candidates) {
    if (chosen.length >= DEFENDER_TARGETS) break;
    if (chosen.every((p) => distance(p, c.at) >= DEFENDER_TARGET_SPACING_M)) chosen.push(c.at);
  }
  return chosen;
}

/**
 * The defender's fire: for effect on an attacker it has seen this turn or
 * last within the on-the-mark radius of one of its registered targets — the
 * one nearest its own forces — which lands at the weapon's best without an
 * observer; else on the nearest attacker it knows of, from its own forces.
 */
export function callDefenderFire(g: Game, side: Side, registered: readonly Point[] = []): "plan" | "nearest" | undefined {
  if (!mortarFree(g, side)) return undefined;
  const view = sideView(g, side);
  const own = view.units.filter((u) => u.side === side && u.kind !== "command" && !u.neutralized);
  const foes = view.units.filter((u) => u.side !== side && !u.neutralized && !u.surrendered);
  const fresh = (id: string) => (g.contactFor(side, id)?.lastSeenTurn ?? -Infinity) >= g.turn - 1;
  const nearestOwn = (p: Point) => Math.min(...own.map((u) => distance(u.position, p)));
  const onPlan = foes
    .filter((f) => fresh(f.id) && registered.some((r) => distance(r, f.position) <= ADJUSTMENT_RADIUS_M))
    .sort((a, b) => nearestOwn(a.position) - nearestOwn(b.position))[0];
  if (onPlan && own.length) {
    g.callForFire(side, MORTAR, onPlan.position, { method: "effect" });
    return "plan";
  }
  let best: Point | undefined;
  let bd = Infinity;
  for (const f of foes) {
    for (const u of own) {
      const d = distance(f.position, u.position);
      if (d < bd) {
        bd = d;
        best = f.position;
      }
    }
  }
  if (!best) return undefined;
  g.callForFire(side, MORTAR, best, { method: "effect" });
  return "nearest";
}


/**
 * The computer holding a position in the browser game: the harness's
 * defender, one phase at a time. It plans its mortars on the dead ground in
 * front of it before the battle, calls them on what it has seen, and its
 * squads fight by the drill — holding fire to the drill's range, covering
 * when idle, and the reserve retaking a lost position (decision 60). The
 * direction of the attack is where the enemy started, the brief's tasking,
 * as the harness reads it; nothing after that is read off the truth.
 */
export class ComputerDefender {
  private readonly task: DrillTask;
  private state = new DrillState();
  private targets: Point[] = [];

  constructor(
    g: Game,
    readonly side: Side,
    private readonly ground: { mapWidth: number; mapHeight: number; reserves?: readonly string[] },
    private readonly drill: SquadDrill = PLAIN_SCRIPT,
  ) {
    const enemy = g.units.filter((u) => u.side !== side && u.kind !== "command");
    const startLine = enemy.length ? mean(enemy) : mean(g.units.filter((u) => u.side === side));
    this.task = { side, attacking: false, objective: startLine, reserves: new Set(ground.reserves ?? []) };
  }

  /**
   * What the computer carries from turn to turn, as plain data, so a saved
   * battle resumes with the same defender: where it took the attack to come
   * from (read once, from the start line — never again from the enemy), its
   * registered targets and the drill's memory.
   */
  snapshot(): ComputerSnapshot {
    return {
      side: this.side,
      objective: { ...this.task.objective },
      reserves: [...(this.task.reserves ?? [])],
      targets: this.targets.map((t) => ({ ...t })),
      drill: this.state.snapshot(),
    };
  }

  /** The defender a saved battle left, on the game replayed from its recording. */
  static restore(g: Game, snap: ComputerSnapshot, ground: { mapWidth: number; mapHeight: number }, drill: SquadDrill = PLAIN_SCRIPT): ComputerDefender {
    const ai = new ComputerDefender(g, snap.side, { ...ground, reserves: snap.reserves }, drill);
    ai.task.objective = { ...snap.objective };
    ai.targets = snap.targets.map((t) => ({ ...t }));
    ai.state = DrillState.restore(snap.drill);
    return ai;
  }

  /** Mission planning (decision 38): its mortar targets, registered; returns them. */
  plan(g: Game): readonly Point[] {
    if (!g.mayCall(this.side, MORTAR)) return [];
    this.targets = planDefenderFires(g, this.side, this.task.objective, this.ground.mapWidth, this.ground.mapHeight);
    for (const t of this.targets) g.registerTarget(this.side, MORTAR, t);
    return this.targets;
  }

  /** The targeting phase: a mortar mission, if it has one to call. */
  targeting(g: Game): "plan" | "nearest" | undefined {
    return callDefenderFire(g, this.side, this.targets);
  }

  movement(g: Game, report?: DrillReport): void {
    drillMovement(g, this.task, this.drill, this.state, report);
  }

  combat(g: Game, report?: DrillReport): void {
    drillCombat(g, this.task, this.drill, this.state, report);
  }
}

/** {@link ComputerDefender} as plain data, for a saved battle. */
export interface ComputerSnapshot {
  side: Side;
  objective: Point;
  reserves: string[];
  targets: Point[];
  drill: DrillStateSnapshot;
}

/**
 * The scripted company keeps its guns on a mark until its own squads are
 * this close to it, then lifts them (decision 63, S4; ours). A pinned
 * defender is free three turns after the fire stops, so the fire has to
 * stay on until the assault is nearly there.
 */
const LIFT_AT_M = 100;
/** The scripted company screens its crossing from this far out (ours; decision 63's pinned defender sees little inside it anyway). */
const SCREEN_FROM_M = 450;

/**
 * The attacking commander's fire and plan (the scripted stand-in for Jev):
 * where it thinks the enemy is, and when its guns fire.
 */
export interface FirePlanChoices {
  /**
   * How far off the plan puts the defence: that share of the range from the
   * start line, one standard deviation (rules decision 51). 0.2 is an eye's.
   */
  planningError: number;
  /** Register the plan's three points for the mortars in planning (decision 38). */
  register: boolean;
  /**
   * Fire only on what the side has seen, never on the plan (decision 52);
   * and, with `aimWithin`, only on a mark the side is that sure of, in metres
   * of the ring the map draws (decision 54).
   */
  waitForContact: boolean;
  aimWithin?: number;
  /**
   * Which mark the guns take first when the scouts have found several: the
   * squads that hold the position, the command groups that direct it (rules
   * decision 55 gives losing one its effect), or whichever is nearest the
   * objective (the default, and every table before 2026-09-29).
   */
  targetFirst?: "squads" | "command" | "nearest";
  /**
   * Smoke (a harness policy, ours): once the company goes and its lead squads
   * are crossing — {@link SCREEN_FROM_M} to {@link LIFT_AT_M} from the
   * objective — it keeps a mortar screen on the enemy marks nearest its squads
   * (else on its plan's points), up to this many smoke missions, each one of
   * its fire missions (decision 56). Absent or 0: no smoke.
   */
  smokeMissions?: number;
  /**
   * Fires on the plan (a harness policy, ours): once the company goes, with no
   * mark it is sure of, it fires on its registered plan points in turn — on
   * the mark, needing no observer — to keep the defence under fire while it
   * crosses, until its squads are {@link LIFT_AT_M} from them.
   */
  prepFires?: boolean;
}

export const DEFAULT_FIRE_CHOICES: FirePlanChoices = {
  planningError: 0.2,
  register: true,
  waitForContact: false,
};

/**
 * What the attacking company has fired, which its own fire policy reads:
 * the plan's registered points are taken in turn by the count, and the
 * smoke allowance is spent against it.
 */
export interface AttackerFireTally {
  /** Fire missions it has called, smoke among them. */
  missions: number;
  /** Smoke missions it has called. */
  smoke: number;
}

export function callAttackerFire(
  g: Game,
  side: Side,
  planned: readonly Point[],
  objective: Point,
  plan: FirePlanChoices,
  company: ScriptedCompany,
  tally: AttackerFireTally,
): void {
  if (!mortarFree(g, side)) return;
  const squads = g.units.filter((u) => u.side === side && u.kind === "infantry" && !u.neutralized && !company.isScout(u));
  if (!squads.length) return;
  // Danger close is a risk it takes (decision 63, S4): its fire stays on
  // until its squads are LIFT_AT_M from the mark.
  const safe = (p: Point) => squads.every((u) => distance(u.position, p) > LIFT_AT_M);
  const going = company.released !== undefined;
  // Smoke while it crosses: a screen on the enemy it knows of nearest its
  // squads, else on the plan, kept up as each one clears (two turns).
  const lead = Math.min(...squads.map((u) => distance(u.position, objective)));
  if (going && lead <= SCREEN_FROM_M && lead > LIFT_AT_M && tally.smoke < (plan.smokeMissions ?? 0)) {
    const screened = (p: Point) =>
      g.smoke.some((s) => distance(s.center, p) < s.radius) ||
      g.pendingSmoke.some((m) => m.side === side && distance(m.target, p) < m.radius);
    const nearestOwn = (p: Point) => Math.min(...squads.map((u) => distance(u.position, p)));
    const marks = sideView(g, side).units.filter((u) => u.side !== side && !u.neutralized && !u.surrendered).map((u) => u.position);
    const screen = (marks.length ? marks : [...planned])
      .filter(safe)
      .sort((a, b) => nearestOwn(a) - nearestOwn(b))
      .find((p) => !screened(p));
    if (screen) {
      g.deploySmoke(MORTAR, side, screen);
      tally.smoke++;
      return;
    }
  }
  let aim: Point | undefined;
  if (plan.waitForContact) {
    const view = sideView(g, side);
    const sure = (id: string) => plan.aimWithin === undefined || (view.spreads.get(id) ?? 0) * CE_PER_SIGMA <= plan.aimWithin;
    // Fresh: seen this turn or last. The guns are called before this turn's
    // looking is done (on the way into the fire phase), so last turn's report
    // is the newest there is — the drill's own test for holding a contact.
    const fresh = (id: string) => (g.contactFor(side, id)?.lastSeenTurn ?? -Infinity) >= g.turn - 1;
    const rank = (u: Unit) =>
      plan.targetFirst === "squads" ? (u.kind === "command" ? 1 : 0) : plan.targetFirst === "command" ? (u.kind === "command" ? 0 : 1) : 0;
    aim = view.units
      .filter((u) => u.side !== side && !u.neutralized && fresh(u.id) && sure(u.id) && safe(u.position))
      .sort((a, b) => rank(a) - rank(b) || distance(a.position, objective) - distance(b.position, objective))[0]?.position;
  } else {
    const open = planned.filter(safe);
    aim = open[tally.missions % Math.max(1, open.length)];
  }
  // Nothing sure to fire on: once it goes, keep the defence under fire on the plan.
  if (!aim && plan.prepFires && going) {
    const open = planned.filter(safe);
    aim = open[tally.missions % Math.max(1, open.length)];
  }
  if (!aim) return;
  g.callForFire(side, MORTAR, aim, { method: "effect" });
  tally.missions++;
}


/** The plan's frontage: its centre and this far to either side (the browser tool's). */
const PLAN_SPREAD_M = 90;

/**
 * The attacking commander's plan, from where he is told the enemy is: the
 * three points his mortars register (decision 38) across the position's
 * frontage, and the five his scouts look for, his observation points must
 * see and his waiting squads must be out of sight of — the frontage and its
 * depth. One owner, so the harness and the browser plan alike.
 */
export function attackerPlan(objective: Point): { planned: Point[]; suspected: Point[] } {
  const planned = [objective, { x: objective.x - PLAN_SPREAD_M, y: objective.y }, { x: objective.x + PLAN_SPREAD_M, y: objective.y }];
  return { planned, suspected: [...planned, { x: objective.x, y: objective.y - 80 }, { x: objective.x, y: objective.y + 80 }] };
}

/**
 * How the computer attacks in the browser, and how the harness measures a
 * competent attack: two scouts to observation points that overlook the
 * objective, the rest waiting out of sight, the guns held until the scouts
 * have a mark they are sure of to 40 m, a screen while the company crosses,
 * and the plan kept under fire when nothing is sure.
 *
 * Not the harness's bare defaults. Those fire on the plan's points from
 * turn 1 with nobody looking, and the company then walks into its own
 * danger-close rounds (decision 63, S4) and breaks without the defender
 * firing a shot — measured at 0% attacker wins, which is no opponent at
 * all. With these, the same measurement gives 10% on `telAzekaAssault`
 * (balance.md's rounds; `npm run scenario-sim -- --recon 2 …`).
 */
export const BROWSER_ATTACK_PLAN: CompanyPlan = {
  recon: { scouts: 2, lookTurns: 4, scoutFrom: "vantage" },
  waitIn: "deadGround",
};
export const BROWSER_ATTACK_FIRE: FirePlanChoices = {
  ...DEFAULT_FIRE_CHOICES,
  waitForContact: true,
  aimWithin: 40,
  smokeMissions: 4,
  prepFires: true,
};

/**
 * The computer attacking in the browser: the harness's attacker, one phase
 * at a time. It is the counterpart of {@link ComputerDefender} — a
 * {@link ScriptedCompany} deciding the company's business (which squads
 * scout, from where, where the rest wait, when they go) and the squad drill
 * carrying it out, with the company's mortars fired by the same policy the
 * harness measures.
 *
 * Like the defender, it reads only its own side's picture and its plan:
 * where it is *told* the enemy is (`objective`, spoilt by an observer's
 * error before it is handed over — rules decision 51), never `game.units`
 * of the enemy.
 */
export class ComputerAttacker {
  private readonly task: DrillTask;
  private state = new DrillState();
  private readonly company: ScriptedCompany;
  private readonly planned: readonly Point[];
  private readonly fire: AttackerFireTally = { missions: 0, smoke: 0 };

  constructor(
    g: Game,
    readonly side: Side,
    /** Where the plan puts the defence: the brief, already spoilt by its error. */
    private readonly objective: Point,
    private readonly ground: { mapWidth: number; mapHeight: number },
    private readonly choices: FirePlanChoices = BROWSER_ATTACK_FIRE,
    plan: CompanyPlan = BROWSER_ATTACK_PLAN,
    private readonly drill: SquadDrill = PLAIN_SCRIPT,
    /** A saved commander's memory: put back rather than chosen again. */
    restoreWith?: CompanySnapshot,
  ) {
    const { planned, suspected } = attackerPlan(objective);
    this.planned = planned;
    const terrain = {
      // The ground as it stands, buildings brought down included (decision 76).
      get terrain() {
        return g.terrain;
      },
      width: ground.mapWidth,
      height: ground.mapHeight,
    };
    this.company = restoreWith
      ? ScriptedCompany.restored(g, side, objective, suspected, plan, terrain, restoreWith)
      : new ScriptedCompany(g, side, objective, suspected, plan, terrain);
    this.task = { side, attacking: true, objective };
  }

  /**
   * What the computer carries from turn to turn, as plain data, so a saved
   * battle resumes with the same attacker: its brief, what it has fired and
   * the drill's memory. The company commander's own memory is rebuilt from
   * the brief, as it was at the start.
   */
  snapshot(): AttackerSnapshot {
    return {
      side: this.side,
      objective: { ...this.objective },
      fire: { ...this.fire },
      company: this.company.snapshot(),
      drill: this.state.snapshot(),
    };
  }

  /**
   * The attacker a saved battle left, on the game replayed from its
   * recording. The company commander is put back from its own snapshot
   * rather than rebuilt: its scouts and where the rest wait were chosen at
   * the start from positions that have since moved, so building it again
   * here would quietly choose differently.
   */
  static restore(
    g: Game,
    snap: AttackerSnapshot,
    ground: { mapWidth: number; mapHeight: number },
    choices: FirePlanChoices = BROWSER_ATTACK_FIRE,
    plan: CompanyPlan = BROWSER_ATTACK_PLAN,
    drill: SquadDrill = PLAIN_SCRIPT,
  ): ComputerAttacker {
    const ai = new ComputerAttacker(g, snap.side, snap.objective, ground, choices, plan, drill, snap.company);
    ai.fire.missions = snap.fire.missions;
    ai.fire.smoke = snap.fire.smoke;
    ai.state = DrillState.restore(snap.drill);
    // The combat phase reads the turn's orders off the task, where the
    // movement phase left them. A battle saved between the two resumes
    // straight into combat, so they are put back here — without deciding
    // anything again (`currentOrders`).
    ai.task.company = ai.company.currentOrders(g);
    return ai;
  }

  /** Mission planning (decision 38): its plan's points, registered; returns them. */
  plan(g: Game): readonly Point[] {
    if (!this.choices.register || !g.mayCall(this.side, MORTAR)) return [];
    for (const t of this.planned) g.registerTarget(this.side, MORTAR, t);
    return this.planned;
  }

  /** The targeting phase: a mortar mission by the harness's fire policy. */
  targeting(g: Game): void {
    callAttackerFire(g, this.side, this.planned, this.objective, this.choices, this.company, this.fire);
  }

  /**
   * The movement phase: the company commander's orders for the turn, then
   * the drill carrying them out. The orders come first because whether the
   * rest are let go is this turn's decision.
   */
  movement(g: Game, report?: DrillReport): void {
    this.task.company = this.company.orders(g);
    drillMovement(g, this.task, this.drill, this.state, report);
  }

  combat(g: Game, report?: DrillReport): void {
    drillCombat(g, this.task, this.drill, this.state, report);
  }
}

/** {@link ComputerAttacker} as plain data, for a saved battle. */
export interface AttackerSnapshot {
  side: Side;
  objective: Point;
  fire: AttackerFireTally;
  /** The company commander's memory (`ScriptedCompany.snapshot`). */
  company: CompanySnapshot;
  drill: DrillStateSnapshot;
}
