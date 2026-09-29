import { sideDefeated, sideView } from "../app/hotseat.js";
import { DrillState, drillCombat, drillMovement, isScout, type DrillTask, type SquadDrill } from "../app/drill.js";
import { bestVantage, nearestDeadGround } from "../app/deadGround.js";
import type { ScenarioListing } from "../app/scenarios/types.js";
import {
  CE_PER_SIGMA,
  Rng,
  distance,
  unitSeed,
  type Game,
  type MoraleReport,
  type Point,
  type Side,
  type Unit,
} from "../engine/index.js";
import { estimateFrom } from "./balance.js";

/**
 * The headless scenario runner: a generated scenario — real ground, its forces,
 * its fire — played to an end with no browser, fast enough to measure.
 *
 * It exists because the balance harness fights on flat, empty ground, and the
 * decisions that matter most on the tel are about ground: where the company
 * waits, what the defender's posts can see. The browser tool
 * (`tools/smart-attacker.mjs`) plays the same battles through the UI, at about
 * two minutes a battle; this plays them in well under a second.
 *
 * **Who decides what.** In the real game only squads and platoons are
 * scripted; company and up are Jev's (README, backlog 15). So:
 * - **squads** fight by the drill (`src/app/drill.ts`), on both sides — the
 *   same executor the game will use;
 * - **the attacking company commander** is scripted here, a stand-in for Jev:
 *   {@link CompanyPlan} is the handful of choices it makes — where it thinks
 *   the enemy is, whether to send a scout, where to wait, when to fire;
 * - **the defender** holds by the drill and calls its mortars on the nearest
 *   attacker it knows of, fire for effect, as the browser tool's defender does.
 *
 * Everything either commander knows comes from its side's picture
 * (`sideView`, `contactsFor`) and its plan, never from `game.units` — except
 * the one thing the browser tool also takes from the umpire: the **tasking**,
 * where the defence is, which it spoils by an observer's error before use.
 */
export interface CompanyPlan {
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
   * Where the company waits while its scouts look: at its start line, or in
   * the nearest dead ground out of sight of where the plan puts the enemy
   * (`deadGround.ts`).
   */
  waitIn: "place" | "deadGround";
  /**
   * Where the scouts watch from: straight at the objective, or from the spot
   * that sees most of where the plan puts the enemy from beyond its reach
   * ({@link VANTAGE_RING_M}, `bestVantage`).
   */
  scoutFrom?: "straight" | "vantage";
}

/**
 * The ring an observation point is chosen in, metres from where the plan puts
 * the enemy: beyond a still force's eye (300 m, decision 53), inside the
 * scout's binoculars (600 m, decision 54). Ours.
 */
export const VANTAGE_RING_M = { min: 350, max: 550 } as const;

export const DEFAULT_COMPANY_PLAN: CompanyPlan = {
  planningError: 0.2,
  register: true,
  waitForContact: false,
  waitIn: "place",
};

export interface ScenarioBattleOptions {
  /** How the attacker's squads fight — its `recon` is the company's scouts. */
  drill: SquadDrill;
  /** How the defender's squads fight. The attacker's drill, less its recon, unless given. */
  defenderDrill?: SquadDrill;
  plan: CompanyPlan;
  maxTurns?: number;
}

export interface ScenarioBattleResult {
  winner: Side | "draw";
  turns: number;
  men: Record<Side, number>;
  down: Record<Side, number>;
  outBy: { smallArms: number; explosive: number };
  /** The turn the attacker's main body was let go, if it waited for its scouts. */
  released?: number;
  /** The attacker's men down before its main body was let go: the price of waiting. */
  downWhileWaiting: number;
  /** Fire missions each side called. */
  missions: Record<Side, number>;
}

const other = (s: Side): Side => (s === "RED" ? "BLUE" : "RED");
const mean = (us: readonly Unit[]): Point => ({
  x: us.reduce((t, u) => t + u.position.x, 0) / us.length,
  y: us.reduce((t, u) => t + u.position.y, 0) / us.length,
});
const MORTAR = "mortar";
/** Nothing called within this of a friendly squad: danger close (the browser tool's 150 m). */
const DANGER_CLOSE_M = 150;
/** The plan's frontage: its centre and this far to either side (the browser tool's). */
const PLAN_SPREAD_M = 90;

/** One battle of `listing`, on `seed`, to an end or to `maxTurns`. */
export function runScenarioBattle(listing: ScenarioListing, seed: number, opts: ScenarioBattleOptions): ScenarioBattleResult {
  const { game: g, mapWidth, mapHeight } = listing.build(seed);
  const attacker: Side = g.attackers[0] ?? "BLUE";
  const defender = other(attacker);
  const maxTurns = opts.maxTurns ?? 60;
  const drill = opts.drill;
  const defenderDrill = opts.defenderDrill ?? { ...drill, recon: undefined };

  // The tasking: where the defence is, spoilt by an observer's error from the
  // start line — drawn exactly as the browser tool draws it, so a seed puts
  // the plan in the same wrong place in both.
  const defence = g.units.filter((u) => u.side === defender && u.kind !== "command");
  const own = g.units.filter((u) => u.side === attacker && u.kind !== "command");
  const truth = mean(defence);
  const startLine = mean(own);
  const objective = opts.plan.planningError > 0
    ? estimateFrom(new Rng(unitSeed(g.seed, "#planning-error")), startLine, truth, opts.plan.planningError)
    : truth;
  const planned = [objective, { x: objective.x - PLAN_SPREAD_M, y: objective.y }, { x: objective.x + PLAN_SPREAD_M, y: objective.y }];

  // Mission planning: the attacker registers its plan.
  if (opts.plan.register && g.mayCall(attacker, MORTAR)) {
    for (const t of planned) g.registerTarget(attacker, MORTAR, t);
  }

  // Where the company waits: out of sight of where the plan puts the enemy.
  const waitAt = new Map<string, Point>();
  if (opts.plan.waitIn === "deadGround" && drill.recon) {
    const watchers = planned;
    for (const u of own) {
      const at = nearestDeadGround(
        { terrain: g.terrain, watchers },
        u.position,
        { width: mapWidth, height: mapHeight, radius: 300, step: 20 },
      );
      if (at) waitAt.set(u.id, at);
    }
  }

  // Where the scouts watch from: the commander's observation point.
  let scoutTo: Point | undefined;
  if (opts.plan.scoutFrom === "vantage" && drill.recon) {
    const lead = [...own].sort((a, b) => distance(a.position, objective) - distance(b.position, objective))[0]!;
    const targets = [...planned, { x: objective.x, y: objective.y - 80 }, { x: objective.x, y: objective.y + 80 }];
    scoutTo =
      bestVantage(
        { terrain: g.terrain, targets, minRange: VANTAGE_RING_M.min, maxRange: VANTAGE_RING_M.max },
        lead.position,
        { width: mapWidth, height: mapHeight, step: 20 },
      ) ?? undefined;
  }

  const tasks: Record<Side, DrillTask> = {
    [attacker]: { side: attacker, attacking: true, objective, waitAt, ...(scoutTo ? { scoutTo } : {}) },
    [defender]: { side: defender, attacking: false, objective: startLine },
  } as Record<Side, DrillTask>;
  const state = new DrillState();

  const men = { RED: 0, BLUE: 0 };
  for (const u of g.units) men[u.side] += u.soldiers?.length ?? 0;
  const result: ScenarioBattleResult = {
    winner: "draw",
    turns: 0,
    men,
    down: { RED: 0, BLUE: 0 },
    outBy: { smallArms: 0, explosive: 0 },
    downWhileWaiting: 0,
    missions: { RED: 0, BLUE: 0 },
  };
  const downOf = (side: Side) =>
    g.units.filter((u) => u.side === side).reduce((t, u) => t + (u.soldiers ?? []).filter((m) => m.neutralized).length, 0);

  const settle = (): boolean => {
    const a = sideDefeated(g, attacker);
    const d = sideDefeated(g, defender);
    if (!a && !d) return false;
    result.winner = a && d ? "draw" : a ? defender : attacker;
    return true;
  };
  const ignore = (_: MoraleReport[] | undefined) => {};

  g.beginTurn();
  for (let turn = 1; turn <= maxTurns; turn++) {
    result.turns = turn;
    g.advanceToPhase("targeting");
    callAttackerFire(g, attacker, planned, objective, opts.plan, state, result);
    callDefenderFire(g, defender, result);

    ignore(g.advanceToPhase("movement").morale);
    for (const side of g.initiativeOrder) drillMovement(g, tasks[side], side === attacker ? drill : defenderDrill, state);
    if (result.released === undefined && (!drill.recon || state.reconDone.has(attacker))) {
      result.released = turn;
      result.downWhileWaiting = downOf(attacker);
    }
    g.advanceToPhase("combat");
    for (const side of g.initiativeOrder) drillCombat(g, tasks[side], side === attacker ? drill : defenderDrill, state);
    if (settle()) break;
    ignore(g.advanceToPhase("initiative").morale);
    if (settle()) break;
  }
  if (result.released === undefined) result.downWhileWaiting = downOf(attacker);

  for (const u of g.units) {
    for (const s of u.soldiers ?? []) {
      if (!s.neutralized) continue;
      result.down[u.side]++;
      if (s.outBy) result.outBy[s.outBy]++;
    }
  }
  return result;
}

/** A side's mortar is free for a call: missions left, none in hand (a section fires one at a time). */
function mortarFree(g: Game, side: Side): boolean {
  if (!g.mayCall(side, MORTAR)) return false;
  if ((g.fireMissionsLeft(side, MORTAR) ?? 1) <= 0) return false;
  return !g.fireMissions.some((m) => m.side === side && m.weapon === MORTAR && m.status === "adjusting");
}

/**
 * The attacking commander's fire (the browser tool's rule): fire for effect
 * on the plan, in turn, while no squad of its own is within danger close of
 * the point — or, waiting for contact, on what the side has seen nearest the
 * objective, if it is sure enough of it.
 */
function callAttackerFire(
  g: Game,
  side: Side,
  planned: readonly Point[],
  objective: Point,
  plan: CompanyPlan,
  state: DrillState,
  result: ScenarioBattleResult,
): void {
  if (!mortarFree(g, side)) return;
  const squads = g.units.filter((u) => u.side === side && u.kind === "infantry" && !u.neutralized && !isScout(state, u));
  if (!squads.length) return;
  const safe = (p: Point) => squads.every((u) => distance(u.position, p) > DANGER_CLOSE_M);
  let aim: Point | undefined;
  if (plan.waitForContact) {
    const view = sideView(g, side);
    const sure = (id: string) => plan.aimWithin === undefined || (view.spreads.get(id) ?? 0) * CE_PER_SIGMA <= plan.aimWithin;
    // Fresh: seen this turn or last. The guns are called before this turn's
    // looking is done (on the way into the fire phase), so last turn's report
    // is the newest there is — the drill's own test for holding a contact.
    const fresh = (id: string) => (g.contactFor(side, id)?.lastSeenTurn ?? -Infinity) >= g.turn - 1;
    aim = view.units
      .filter((u) => u.side !== side && !u.neutralized && fresh(u.id) && sure(u.id))
      .map((u) => u.position)
      .filter(safe)
      .sort((a, b) => distance(a, objective) - distance(b, objective))[0];
  } else {
    const open = planned.filter(safe);
    aim = open[result.missions[side] % Math.max(1, open.length)];
  }
  if (!aim) return;
  g.callForFire(side, MORTAR, aim, { method: "effect" });
  result.missions[side]++;
}

/** The defender's fire: for effect on the nearest attacker it knows of, from its own forces. */
function callDefenderFire(g: Game, side: Side, result: ScenarioBattleResult): void {
  if (!mortarFree(g, side)) return;
  const view = sideView(g, side);
  const own = view.units.filter((u) => u.side === side && u.kind !== "command" && !u.neutralized);
  const foes = view.units.filter((u) => u.side !== side && !u.neutralized && !u.surrendered);
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
  if (!best) return;
  g.callForFire(side, MORTAR, best, { method: "effect" });
  result.missions[side]++;
}

/** What a set of battles came to. */
export interface ScenarioSummary {
  battles: number;
  attackerWins: number;
  defenderWins: number;
  draws: number;
  medianTurns: number;
  attackerDownPct: number;
  defenderDownPct: number;
  explosivePct: number;
  /** Median men the attacker lost before its main body went. */
  medianDownWhileWaiting: number;
}

export function runScenario(
  listing: ScenarioListing,
  seeds: readonly number[],
  opts: ScenarioBattleOptions,
): ScenarioSummary {
  const rs = seeds.map((s) => runScenarioBattle(listing, s, opts));
  const attacker: Side = listing.build(seeds[0]).game.attackers[0] ?? "BLUE";
  const defender = other(attacker);
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor((s.length - 1) / 2)]! : 0;
  };
  const sum = (f: (r: ScenarioBattleResult) => number) => rs.reduce((t, r) => t + f(r), 0);
  const out = sum((r) => r.outBy.smallArms + r.outBy.explosive);
  return {
    battles: rs.length,
    attackerWins: rs.filter((r) => r.winner === attacker).length,
    defenderWins: rs.filter((r) => r.winner === defender).length,
    draws: rs.filter((r) => r.winner === "draw").length,
    medianTurns: median(rs.map((r) => r.turns)),
    attackerDownPct: (100 * sum((r) => r.down[attacker])) / Math.max(1, sum((r) => r.men[attacker])),
    defenderDownPct: (100 * sum((r) => r.down[defender])) / Math.max(1, sum((r) => r.men[defender])),
    explosivePct: (100 * sum((r) => r.outBy.explosive)) / Math.max(1, out),
    medianDownWhileWaiting: median(rs.map((r) => r.downWhileWaiting)),
  };
}
