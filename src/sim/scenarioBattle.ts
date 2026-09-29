import { outOfTime, sideDefeated, sideView } from "../app/hotseat.js";
import { DrillState, SCOUT_GIVE_UP_TURNS, drillCombat, drillMovement, type DrillTask, type SquadDrill } from "../app/drill.js";
import { ScriptedCompany, type CompanyPlan } from "../app/company.js";
import type { ScenarioListing } from "../app/scenarios/types.js";
import {
  CE_PER_SIGMA,
  EYE_HEIGHT,
  groundHeight,
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
import { FIND_WITHIN_M, VANTAGE_RING_M } from "../app/company.js";
import { casualtiesSeen, viewOf, type Decider, type Question } from "./companyQuestions.js";
import { hasEyesOn } from "../app/hotseat.js";
import type { IndirectFireResult } from "../engine/index.js";

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
  /** Stop here. The mission's deadline (`timeLimit`, decision 58) unless given; 60 turns with none. */
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
  /** Fire missions of HE each side called. */
  missions: Record<Side, number>;
  /** Smoke missions each side laid from its tubes (each costs a mission too, decision 56). */
  smoke: Record<Side, number>;
  /** The attack ran past the mission's deadline and failed (decision 58). */
  outOfTime?: boolean;
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
  const maxTurns = opts.maxTurns ?? g.timeLimit ?? 60;
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
  // What the attacker's mortars did since it was last asked, as its forces saw it.
  const seenHits = new Map<string, number>();
  const heard = (res: IndirectFireResult[] | undefined) => {
    for (const r of res ?? []) {
      if (r.side !== attacker) continue;
      for (const t of r.blast.targets) {
        const u = g.getUnit(t.unitId);
        if (u.side === attacker || !t.caught || !hasEyesOn(g, attacker, u)) continue;
        seenHits.set(u.id, (seenHits.get(u.id) ?? 0) + t.newCasualties);
      }
    }
  };
  const reports = (): string[] => {
    const out = [...seenHits].map(
      ([id, n]) => `${id}: hit by your mortars, ${casualtiesSeen(n)}${g.getUnit(id).neutralized ? ", now out of action" : ""}`,
    );
    seenHits.clear();
    return out;
  };
  const question = (q: Omit<Question, "turn" | "view">): string =>
    ask!({
      ...q,
      turn: g.turn,
      view: viewOf(g, attacker, { objective, mortarLeft: mortarLeft(), brief: listing.brief, startLine, reports: reports() }),
    });
  const companyPlan = ask ? askPlan(g, attacker, objective, suspected, mapWidth, mapHeight, question) : opts.company ?? {};
  const scoutFit = new Map<string, number>();
  /** The turn each scout was last asked about, sitting at its point seeing nothing. */
  const scoutAsked = new Map<string, number>();
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
    smoke: { RED: 0, BLUE: 0 },
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
    heard(g.advanceToPhase("targeting").resolved);
    if (ask) askAttackerFire(g, attacker, company, result, question);
    else callAttackerFire(g, attacker, planned, objective, opts.fire, company, result);
    callDefenderFire(g, defender, result);

    const moving = g.advanceToPhase("movement");
    heard(moving.resolved);
    ignore(moving.morale);
    if (ask) askScouts(g, company, state, startLine, objective, { width: mapWidth, height: mapHeight }, scoutFit, scoutAsked, question);
    tasks[attacker].company = company.orders(g, ask ? { go: askGo(g, company, turn, question) } : undefined);
    for (const side of g.initiativeOrder) drillMovement(g, tasks[side], side === attacker ? drill : defenderDrill, state);
    if (result.released === undefined && company.released !== undefined) {
      result.released = company.released || turn;
      result.downWhileWaiting = downOf(attacker);
    }
    heard(g.advanceToPhase("combat").resolved);
    for (const side of g.initiativeOrder) drillCombat(g, tasks[side], side === attacker ? drill : defenderDrill);
    if (settle()) break;
    const next = g.advanceToPhase("initiative");
    heard(next.resolved);
    ignore(next.morale);
    if (settle()) break;
  }
  if (result.released === undefined) result.downWhileWaiting = downOf(attacker);
  // The clock ran out on the attack (decision 58): the defender held.
  if (result.winner === "draw" && !sideDefeated(g, attacker) && !sideDefeated(g, defender) && outOfTime(g) === attacker) {
    result.winner = defender;
    result.outOfTime = true;
  }

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
  // The suspected points by name: the plan's centre, then either flank, then its far and near side.
  const names = ["the plan's centre", "its west", "its east", "its far side", "its near side"];
  const sees = (p: Point) =>
    suspected
      .map((t, i) => ({ t, name: names[i] ?? `point ${i + 1}` }))
      .filter(({ t }) => distance(p, t) <= VANTAGE_RING_M.max && !terrainBlocksSight(g.terrain, p, EYE_HEIGHT.infantry, t, EYE_HEIGHT.fullCover))
      .map(({ name }) => name);
  const posts: (Point | null)[] = [];
  for (let i = 0; i < n; i++) {
    const a = question({
      id: `plan.post.${i + 1}`,
      kind: "choice",
      ask: `Where does scout ${i + 1} watch from? An observation point sees the enemy's ground from outside its reach (350-550 m) with binoculars; the plan suspects the enemy at its centre (${Math.round(objective.x)}, ${Math.round(objective.y)}) and 80-90 m to each side of it. A still, dug-in enemy is found only within 600 m through binoculars, and more easily the closer.`,
      options: [
        ...candidates.map((p, k) => ({
          id: `p${k + 1}`,
          label: `observation point (${Math.round(p.x)}, ${Math.round(p.y)}), ground ${Math.round(groundHeight(g.terrain, p))} m: sees ${sees(p).join(", ")}; ${Math.round(distance(p, objective))} m from the plan's centre, ${Math.round(distance(p, lead.position))} m walk from your leading squad`,
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
 * What the side has of the enemy near the objective when none is in sight:
 * nothing found yet, or found and lost — some of it out of action — or found
 * only away from where the plan put it.
 */
export function notInSight(g: Game, company: ScriptedCompany): string {
  const side = company.side;
  const objective = company.objectivePoint;
  const marks = sideView(g, side).units.filter((e) => e.side !== side);
  const near = marks.filter((e) => distance(e.position, objective) <= FIND_WITHIN_M);
  const out = near.filter((e) => e.neutralized || e.surrendered).length;
  const away = marks.filter((e) => distance(e.position, objective) > FIND_WITHIN_M && !e.neutralized && !e.surrendered).length;
  const elsewhere = away ? ` It also has ${away} mark${away === 1 ? "" : "s"} away from the objective.` : "";
  if (!near.length) return `Your scouts have not found the enemy near the objective yet.${elsewhere}`;
  const found = `Your side has found ${near.length} enemy force${near.length === 1 ? "" : "s"} near the objective` + (out ? ` (${out} out of action)` : "");
  return out === near.length
    ? `${found}; nothing else there is in sight now.${elsewhere}`
    : `${found}, but none is in sight now: the marks are where it was last seen.${elsewhere}`;
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
      ? company.turnsHeldInSight === 0
        ? "Your side has just found the enemy near the objective."
        : `Your side has held the enemy near the objective in sight ${company.turnsHeldInSight + 1} turns in a row.`
      : notInSight(g, company);
  const go =
    question({
      id: `go.${turn}`,
      kind: "noul",
      ask: `${why} Send the company in now?`,
      options: [
        { id: "yes", label: "yes: the company advances to the attack" },
        { id: "no", label: "no: keep holding while the scouts look" },
      ],
    }) === "yes";
  if (!go) return false;
  // Which way it goes: straight, or by one of the scouts' observation points,
  // coming in from that side.
  const posts = [...company.posts].filter((e): e is [string, Point] => e[1] !== null);
  if (posts.length) {
    const axis = question({
      id: `go.axis.${turn}`,
      kind: "choice",
      ask: "Which way does the company go in?",
      options: [
        { id: "straight", label: "straight at the plan's centre" },
        ...posts.map(([id, p]) => ({
          id: `via:${id}`,
          label: `by ${id}'s observation point (${Math.round(p.x)}, ${Math.round(p.y)}), coming in from that side`,
        })),
      ],
    });
    company.setAxis(axis === "straight" ? undefined : posts.find(([id]) => `via:${id}` === axis)?.[1]);
  }
  if (company.liveScouts(g).length) {
    company.setScoutsFire(
      question({
        id: `go.support.${turn}`,
        kind: "noul",
        ask: "Do your scouts open fire in support from where they are, as a base of fire? Firing gives their positions away.",
        options: [
          { id: "yes", label: "yes: the scouts open fire on what they can reach" },
          { id: "no", label: "no: they stay hidden and keep watching" },
        ],
      }) === "yes",
    );
  }
  return true;
}

/**
 * A scout's commander is asked about it when it is hit, when it is slow to
 * reach its observation point, and when it has sat at its point for
 * {@link SCOUT_GIVE_UP_TURNS} turns seeing nothing (with a decider the drill
 * no longer walks it on by itself: that is the commander's to say). When the
 * side has marks away from where the plan put the enemy, the scout may also
 * be sent to an observation point on those marks (`bestVantages`).
 */
function askScouts(
  g: Game,
  company: ScriptedCompany,
  state: DrillState,
  startLine: Point,
  objective: Point,
  ground: { width: number; height: number },
  fitBefore: Map<string, number>,
  asked: Map<string, number>,
  question: (q: Omit<Question, "turn" | "view">) => string,
): void {
  if (company.released !== undefined) return;
  const side = company.side;
  const holding = company.holdingInSight(g);
  const marks = sideView(g, side).units.filter((e) => e.side !== side && !e.neutralized && !e.surrendered);
  const astray = marks.filter((e) => distance(e.position, objective) > FIND_WITHIN_M);
  for (const u of company.liveScouts(g)) {
    const fit = (u.soldiers ?? []).filter((m) => !m.neutralized).length;
    const hit = fit < (fitBefore.get(u.id) ?? fit);
    fitBefore.set(u.id, fit);
    const post = company.posts.get(u.id);
    const arrived = state.arrivedOn.get(u.id);
    const slow = post !== null && post !== undefined && arrived === undefined && g.turn > 1 && g.turn % 10 === 0;
    const idle =
      post !== null && post !== undefined && arrived !== undefined && !holding &&
      g.turn - Math.max(arrived, asked.get(u.id) ?? arrived) >= SCOUT_GIVE_UP_TURNS;
    if (!hit && !slow && !idle) continue;
    asked.set(u.id, g.turn);
    // Observation points on where the enemy turned up, when it is not where the plan put it.
    const points = astray.length
      ? bestVantages(
          { terrain: g.terrain, targets: astray.map((e) => e.position), minRange: VANTAGE_RING_M.min, maxRange: VANTAGE_RING_M.max },
          u.position,
          2,
          { width: ground.width, height: ground.height, step: 20 },
        )
      : [];
    const sees = (p: Point) =>
      astray
        .filter((e) => distance(p, e.position) <= VANTAGE_RING_M.max && !terrainBlocksSight(g.terrain, p, EYE_HEIGHT.infantry, e.position, EYE_HEIGHT.fullCover))
        .map((e) => e.id);
    const why = hit
      ? `is under fire: ${fit}/${u.soldiers?.length ?? 0} fit`
      : idle
        ? `has watched from its observation point for ${g.turn - (arrived ?? g.turn)} turns and your side holds no enemy near the objective in sight`
        : "has not reached its observation point yet";
    const a = question({
      id: `scout.${u.id}.${g.turn}`,
      kind: "choice",
      ask: `${u.id} ${why}, at (${Math.round(u.position.x)}, ${Math.round(u.position.y)}). What now?`,
      options: [
        idle
          ? { id: "on", label: "go on toward the plan's centre, bounding and looking" }
          : { id: "on", label: post ? `go on to its observation point (${Math.round(post.x)}, ${Math.round(post.y)})` : "go on as ordered" },
        { id: "here", label: idle ? "stay at its point and keep watching" : "lie up where it is and watch" },
        { id: "back", label: "pull back to the company" },
        ...points.map((p, k) => ({
          id: `v${k + 1}`,
          label:
            `move to an observation point on the enemy found away from the plan (${Math.round(p.x)}, ${Math.round(p.y)}), ` +
            `ground ${Math.round(groundHeight(g.terrain, p))} m: sees ${sees(p).join(", ") || "none of the marks clearly"}; ` +
            `${Math.round(distance(p, u.position))} m walk`,
        })),
      ],
    });
    const moveTo = (at: Point | null) => {
      company.setPost(u.id, at);
      // A new point is a new arrival: the old one's clock does not carry over.
      state.arrivedOn.delete(u.id);
    };
    if (a === "on" && idle) moveTo(null);
    if (a === "here" && !idle) moveTo(u.position);
    if (a === "back") moveTo(startLine);
    if (a.startsWith("v")) moveTo(points[Number(a.slice(1)) - 1]!);
  }
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
  // Every mark the side holds — in sight or last seen — that is not danger
  // close to its own squads. Firing on a last-seen mark is firing on where
  // the enemy was.
  const marks = view.units.filter(
    (u) => u.side !== side && !u.neutralized && squads.every((s) => distance(s.position, u.position) > DANGER_CLOSE_M),
  );
  if (!marks.length) return;
  const a = question({
    id: `fire.${g.turn}`,
    kind: "choice",
    ask:
      "Your mortar section is free. Fire a mission (12 bombs, for effect at once; a bomb kills within about 12 m, less against men dug in with overhead cover) on which mark? " +
      `Marks within ${DANGER_CLOSE_M} m of your own squads are not offered (danger close): your fires lift as your squads close.`,
    options: [
      ...marks.map((u) => {
        const seen = g.contactFor(side, u.id)?.lastSeenTurn ?? 0;
        return {
          id: u.id,
          label:
            `${u.id} (${u.kind === "command" ? "command group" : "infantry"}) at (${Math.round(u.position.x)}, ${Math.round(u.position.y)}), ` +
            `sure to ±${Math.round((view.spreads.get(u.id) ?? 0) * CE_PER_SIGMA)} m, ` +
            (seen >= g.turn - 1 ? "in sight" : `last seen turn ${seen}: it may have moved`),
        };
      }),
      // Smoke once the company is moving: a screen on a mark blinds it while the squads close.
      ...(company.released !== undefined
        ? marks.map((u) => ({ id: `smoke:${u.id}`, label: `lay mortar smoke on ${u.id}'s mark, to screen your squads from it (costs one of your missions)` }))
        : []),
      { id: "hold", label: "hold fire this turn" },
    ],
  });
  if (a === "hold") return;
  if (a.startsWith("smoke:")) {
    const screened = marks.find((u) => `smoke:${u.id}` === a)!;
    g.deploySmoke(MORTAR, side, screened.position);
    result.smoke[side]++;
    return;
  }
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
  /** Of the defender's wins, those where the attack ran out of time (decision 58). */
  outOfTime: number;
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
    outOfTime: rs.filter((r) => r.outOfTime).length,
    medianTurns: median(rs.map((r) => r.turns)),
    attackerDownPct: (100 * sum((r) => r.down[attacker])) / Math.max(1, sum((r) => r.men[attacker])),
    defenderDownPct: (100 * sum((r) => r.down[defender])) / Math.max(1, sum((r) => r.men[defender])),
    explosivePct: (100 * sum((r) => r.outBy.explosive)) / Math.max(1, out),
    medianDownWhileWaiting: median(rs.map((r) => r.downWhileWaiting)),
  };
}
