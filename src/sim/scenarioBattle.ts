import { sideDefeated, sideView } from "../app/hotseat.js";
import { DrillState, drillCombat, drillMovement, type DrillTask, type SquadDrill } from "../app/drill.js";
import { ScriptedCompany, type CompanyPlan } from "../app/company.js";
import type { ScenarioListing } from "../app/scenarios/types.js";
import {
  CE_PER_SIGMA,
  EYE_HEIGHT,
  Rng,
  distance,
  terrainBlocksSight,
  unitSeed,
  type Game,
  type MoraleReport,
  type Point,
  type Side,
  type Unit,
} from "../engine/index.js";
import { estimateFrom } from "./balance.js";
import { bestVantages } from "../app/deadGround.js";
import { VANTAGE_RING_M } from "../app/company.js";
import { viewOf, type Decider, type Question } from "./companyQuestions.js";

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
 * - **the attacking company commander** is scripted, a stand-in for Jev:
 *   `ScriptedCompany` (`app/company.ts`) decides its scouts, their
 *   observation points and where the rest wait; {@link FirePlanChoices}
 *   holds where it thinks the enemy is and when its guns fire;
 * - **the defender** holds by the drill and calls its mortars on the nearest
 *   attacker it knows of, fire for effect, as the browser tool's defender does.
 *
 * Everything either commander knows comes from its side's picture
 * (`sideView`, `contactsFor`) and its plan, never from `game.units` — except
 * the one thing the browser tool also takes from the umpire: the **tasking**,
 * where the defence is, which it spoils by an observer's error before use.
 */
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
}

export const DEFAULT_FIRE_CHOICES: FirePlanChoices = {
  planningError: 0.2,
  register: true,
  waitForContact: false,
};

export interface ScenarioBattleOptions {
  /** How the attacker's squads fight. */
  drill: SquadDrill;
  /** How the defender's squads fight. The attacker's drill unless given. */
  defenderDrill?: SquadDrill;
  /** The attacking company commander's plan: scouts, observation points, where to wait (`company.ts`). */
  company?: CompanyPlan;
  /** Its fire and its picture of the enemy. */
  fire: FirePlanChoices;
  maxTurns?: number;
  /**
   * Someone else commands the attacking company (Jev, or an agent standing in
   * for it, `tools/jev-sim.ts`): its scouts, their posts, where the rest wait,
   * when they go, and what its mortars fire on are asked as typed questions
   * ({@link Question}) instead of decided by rule. `company` and the fire
   * choices' `waitForContact` and `aimWithin` are then its to answer.
   */
  decide?: Decider;
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
  const defenderDrill = opts.defenderDrill ?? drill;

  // The tasking: where the defence is, spoilt by an observer's error from the
  // start line — drawn exactly as the browser tool draws it, so a seed puts
  // the plan in the same wrong place in both.
  const defence = g.units.filter((u) => u.side === defender && u.kind !== "command");
  const own = g.units.filter((u) => u.side === attacker && u.kind !== "command");
  const truth = mean(defence);
  const startLine = mean(own);
  const objective = opts.fire.planningError > 0
    ? estimateFrom(new Rng(unitSeed(g.seed, "#planning-error")), startLine, truth, opts.fire.planningError)
    : truth;
  const planned = [objective, { x: objective.x - PLAN_SPREAD_M, y: objective.y }, { x: objective.x + PLAN_SPREAD_M, y: objective.y }];

  // Mission planning: the attacker registers its plan.
  if (opts.fire.register && g.mayCall(attacker, MORTAR)) {
    for (const t of planned) g.registerTarget(attacker, MORTAR, t);
  }

  // The company commander: where the plan puts the enemy is what its scouts
  // look for, what its observation points must see and what its waiting
  // squads must be out of sight of — the plan's frontage and depth.
  const suspected = [...planned, { x: objective.x, y: objective.y - 80 }, { x: objective.x, y: objective.y + 80 }];
  const ask = opts.decide;
  const mortarLeft = () => (g.mayCall(attacker, MORTAR) ? g.fireMissionsLeft(attacker, MORTAR) ?? null : null);
  const question = (q: Omit<Question, "turn" | "view">): string =>
    ask!({ ...q, turn: g.turn, view: viewOf(g, attacker, { objective, mortarLeft: mortarLeft(), brief: listing.brief, startLine }) });
  const companyPlan = ask ? askPlan(g, attacker, objective, suspected, mapWidth, mapHeight, question) : opts.company ?? {};
  const company = new ScriptedCompany(g, attacker, objective, suspected, companyPlan, {
    terrain: g.terrain,
    width: mapWidth,
    height: mapHeight,
  });

  const tasks: Record<Side, DrillTask> = {
    [attacker]: { side: attacker, attacking: true, objective },
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
    if (ask) askAttackerFire(g, attacker, company, result, question);
    else callAttackerFire(g, attacker, planned, objective, opts.fire, company, result);
    callDefenderFire(g, defender, result);

    ignore(g.advanceToPhase("movement").morale);
    tasks[attacker].company = company.orders(g, ask ? { go: askGo(g, company, turn, question) } : undefined);
    for (const side of g.initiativeOrder) drillMovement(g, tasks[side], side === attacker ? drill : defenderDrill, state);
    if (result.released === undefined && company.released !== undefined) {
      result.released = company.released || turn;
      result.downWhileWaiting = downOf(attacker);
    }
    g.advanceToPhase("combat");
    for (const side of g.initiativeOrder) drillCombat(g, tasks[side], side === attacker ? drill : defenderDrill);
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

/**
 * The planning questions: how many scouts, where each watches from, where the
 * rest wait. The observation points offered are the finder's
 * (`bestVantages`), each labelled with what it sees of the plan; the
 * commander may also send a scout straight at the plan's centre.
 */
function askPlan(
  g: Game,
  side: Side,
  objective: Point,
  suspected: readonly Point[],
  width: number,
  height: number,
  question: (q: Omit<Question, "turn" | "view">) => string,
): CompanyPlan {
  const n = Number(
    question({
      id: "plan.scouts",
      kind: "choice",
      ask: "How many squads do you send ahead to find the enemy before the company goes? Scouts walk, look harder, hold their fire, and carry binoculars.",
      options: [
        { id: "0", label: "none: the whole company advances at once" },
        { id: "1", label: "one squad" },
        { id: "2", label: "two squads" },
      ],
    }),
  );
  if (n === 0) return {};
  const lead = g.units
    .filter((u) => u.side === side && u.kind === "infantry")
    .sort((a, b) => distance(a.position, objective) - distance(b.position, objective))[0]!;
  const candidates = bestVantages(
    { terrain: g.terrain, targets: suspected, minRange: VANTAGE_RING_M.min, maxRange: VANTAGE_RING_M.max },
    lead.position,
    4,
    { width, height, step: 20 },
  );
  const sees = (p: Point) =>
    suspected.filter((t) => distance(p, t) <= VANTAGE_RING_M.max && !terrainBlocksSight(g.terrain, p, EYE_HEIGHT.infantry, t, EYE_HEIGHT.fullCover)).length;
  const posts: (Point | null)[] = [];
  for (let i = 0; i < n; i++) {
    const a = question({
      id: `plan.post.${i + 1}`,
      kind: "choice",
      ask: `Where does scout ${i + 1} watch from? An observation point sees the enemy's ground from outside its reach; the plan suspects the enemy at ${suspected.length} points around ${`(${Math.round(objective.x)}, ${Math.round(objective.y)})`}.`,
      options: [
        ...candidates.map((p, k) => ({
          id: `p${k + 1}`,
          label: `observation point (${Math.round(p.x)}, ${Math.round(p.y)}): sees ${sees(p)} of the ${suspected.length} suspected points, ${Math.round(distance(p, objective))} m from the plan's centre, ${Math.round(distance(p, lead.position))} m from your leading squad`,
        })),
        { id: "straight", label: "straight toward the plan's centre, bounding and looking" },
      ],
    });
    posts.push(a === "straight" ? null : candidates[Number(a.slice(1)) - 1]!);
  }
  const wait = question({
    id: "plan.wait",
    kind: "choice",
    ask: "Where does the rest of the company wait while the scouts look?",
    options: [
      { id: "place", label: "where it stands, on the start line" },
      { id: "deadGround", label: "the nearest ground out of sight of where the plan puts the enemy" },
    ],
  });
  return { recon: { scouts: n, posts }, waitIn: wait === "deadGround" ? "deadGround" : "place" };
}

/**
 * While the company holds: send it in now? Asked when the scouts hold the
 * enemy in sight, when they are all lost, and every fifth turn otherwise —
 * a commander can always choose to go without them.
 */
function askGo(g: Game, company: ScriptedCompany, turn: number, question: (q: Omit<Question, "turn" | "view">) => string): boolean {
  if (company.released !== undefined) return false;
  const holding = company.holdingInSight(g);
  const lost = company.liveScouts(g).length === 0;
  if (!holding && !lost && turn % 5 !== 0) return false;
  const why = lost
    ? "Your scouts are all out of action."
    : holding
      ? `Your scouts have held the enemy in sight ${company.turnsHeldInSight} turn(s) in a row.`
      : "Your scouts have not found the enemy yet.";
  return (
    question({
      id: `go.${turn}`,
      kind: "noul",
      ask: `${why} Send the company in now?`,
      options: [
        { id: "yes", label: "yes: the company advances to the attack" },
        { id: "no", label: "no: keep holding while the scouts look" },
      ],
    }) === "yes"
  );
}

/**
 * The mortars are free and the side has the enemy in sight: fire on which
 * mark? Offered: every enemy mark seen this turn or last that is not within
 * danger close of the company's own squads (scouts aside), and holding fire.
 */
function askAttackerFire(
  g: Game,
  side: Side,
  company: ScriptedCompany,
  result: ScenarioBattleResult,
  question: (q: Omit<Question, "turn" | "view">) => string,
): void {
  if (!mortarFree(g, side)) return;
  const squads = g.units.filter((u) => u.side === side && u.kind === "infantry" && !u.neutralized && !company.isScout(u));
  const view = sideView(g, side);
  const marks = view.units.filter(
    (u) =>
      u.side !== side &&
      !u.neutralized &&
      (g.contactFor(side, u.id)?.lastSeenTurn ?? -Infinity) >= g.turn - 1 &&
      squads.every((s) => distance(s.position, u.position) > DANGER_CLOSE_M),
  );
  if (!marks.length) return;
  const a = question({
    id: `fire.${g.turn}`,
    kind: "choice",
    ask: "Your mortar section is free. Fire a mission (12 bombs, for effect at once) on which mark?",
    options: [
      ...marks.map((u) => ({
        id: u.id,
        label: `${u.id} (${u.kind === "command" ? "command group" : "infantry"}) at (${Math.round(u.position.x)}, ${Math.round(u.position.y)}), sure to ±${Math.round((view.spreads.get(u.id) ?? 0) * CE_PER_SIGMA)} m`,
      })),
      { id: "hold", label: "hold fire this turn" },
    ],
  });
  if (a === "hold") return;
  const target = marks.find((u) => u.id === a)!;
  g.callForFire(side, MORTAR, target.position, { method: "effect" });
  result.missions[side]++;
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
  plan: FirePlanChoices,
  company: ScriptedCompany,
  result: ScenarioBattleResult,
): void {
  if (!mortarFree(g, side)) return;
  const squads = g.units.filter((u) => u.side === side && u.kind === "infantry" && !u.neutralized && !company.isScout(u));
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
    const rank = (u: Unit) =>
      plan.targetFirst === "squads" ? (u.kind === "command" ? 1 : 0) : plan.targetFirst === "command" ? (u.kind === "command" ? 0 : 1) : 0;
    aim = view.units
      .filter((u) => u.side !== side && !u.neutralized && fresh(u.id) && sure(u.id) && safe(u.position))
      .sort((a, b) => rank(a) - rank(b) || distance(a.position, objective) - distance(b.position, objective))[0]?.position;
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
