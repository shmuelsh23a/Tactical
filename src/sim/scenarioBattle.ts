import { outOfTime, sideDefeated, sideView } from "../app/hotseat.js";
import { DrillState, HOLDS_POST_M, SCOUT_GIVE_UP_TURNS, drillCombat, drillMovement, type DrillTask, type SquadDrill } from "../app/drill.js";
import { ScriptedCompany, type CompanyPlan } from "../app/company.js";
import type { ScenarioListing } from "../app/scenarios/types.js";
import {
  ADJUSTMENT_RADIUS_M,
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
import { bestVantages, isDeadGround } from "../app/deadGround.js";
import { ASSAULT_POSITION_M, FIND_WITHIN_M, HOLD_SHORT_M, VANTAGE_RING_M, type PlatoonTask } from "../app/company.js";
import { casualtiesSeen, underFire, viewOf, type Decider, type Question } from "./companyQuestions.js";
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
 * - **the defender** holds by the drill; in planning its company registers
 *   its mortar targets on the dead ground in front of it ({@link
 *   planDefenderFires}), and in the battle fires on an attacker it has seen
 *   near one of them — on the mark, needing no observer — or else on the
 *   nearest attacker it knows of, as the browser tool's defender does;
 *   a platoon's reserve (`Scenario.reserves`) retakes a lost position by the
 *   drill's counterattack (rules decision 60).
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
   * The defending company's fire plan (`planDefenderFires`): its mortar
   * targets registered on the dead ground in front of it, fired on as the
   * attacker crosses them. On unless false; false is every table before
   * 2026-09-30's twenty-eighth round, where it registered nothing. `"open"`
   * registers them on the open ground first instead (thirty-seventh round).
   */
  defenderFirePlan?: boolean | "open";
  /** Called at the end of each turn's fire phase with the game, to trace a battle (read it; never change it). */
  onTurn?: (g: Game, turn: number) => void;
  /** Fire on the move (`GameOptions.fireOnTheMove`), set on the scenario's game before the first turn. */
  fireOnTheMove?: number;
  /** The attacker's breakpoint (`GameOptions.attackerBreakpoint`), set on the scenario's game before the first turn. */
  attackerBreakpoint?: number;
  /** The company's squads go by covered ground (`CompanyOrders.coveredRoutes`); on unless false. */
  coveredRoutes?: boolean;
  /** The company's platoons close together (`CompanyOrders.arriveTogether`); on unless false. */
  arriveTogether?: boolean;
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
  /**
   * Men out of the fight at the end: down, and the fit men of forces that
   * surrendered or are routing — prisoners and the fled, which real loss
   * figures for a lost position count (thirty-ninth round).
   */
  lost: Record<Side, number>;
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
  /** Of the defender's HE missions, those fired on the mark of a registered target. */
  defenderPlanned: number;
  /** The defender's reserves that went in to retake a lost position (decision 60). */
  counterattacks: number;
  /**
   * What the battle did to buildings and vehicles (decisions 76–78): the
   * buildings damaged and brought down at the end, the rounds that went in
   * through a window, slit or roof, the men buried, and each side's
   * vehicles out (destroyed, immobilised or without a crew).
   */
  urban: { damaged: number; rubble: number; windowCriticals: number; roofCriticals: number; crushed: number; vehiclesOut: Record<Side, number>; vehicles: Record<Side, number> };
  /** Of those, the ones standing on the position they went for at the end, still in the fight. */
  retaken: number;
}

const other = (s: Side): Side => (s === "RED" ? "BLUE" : "RED");
const mean = (us: readonly Unit[]): Point => ({
  x: us.reduce((t, u) => t + u.position.x, 0) / us.length,
  y: us.reduce((t, u) => t + u.position.y, 0) / us.length,
});
const MORTAR = "mortar";
/**
 * Danger close: a mark within this of the caller's own squads puts them in
 * the bombs' reach too (the browser tool's 150 m). Since rules decision 63
 * (S4, author 2026-09-30: "danger close as risk") it is a risk the caller is
 * told of and takes, not a mark he is refused.
 */
const DANGER_CLOSE_M = 150;
/**
 * The scripted company keeps its guns on a mark until its own squads are
 * this close to it, then lifts them (decision 63, S4; ours). A pinned
 * defender is free three turns after the fire stops, so the fire has to
 * stay on until the assault is nearly there.
 */
const LIFT_AT_M = 100;
/** The scripted company screens its crossing from this far out (ours; decision 63's pinned defender sees little inside it anyway). */
const SCREEN_FROM_M = 450;
/** Fires lifted for the assault shift beyond this of the company's squads (ours). */
const LIFTED_CLEAR_M = 300;
/** The plan's frontage: its centre and this far to either side (the browser tool's). */
const PLAN_SPREAD_M = 90;

/** One battle of `listing`, on `seed`, to an end or to `maxTurns`. */
export function runScenarioBattle(listing: ScenarioListing, seed: number, opts: ScenarioBattleOptions): ScenarioBattleResult {
  const { game: g, mapWidth, mapHeight, reserves } = listing.build(seed);
  if (opts.fireOnTheMove !== undefined) g.fireOnTheMove = opts.fireOnTheMove;
  if (opts.attackerBreakpoint !== undefined) g.attackerBreakpoint = opts.attackerBreakpoint;
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

  // Mission planning: the attacker registers its plan; the defender its
  // targets on the dead ground in front of it.
  if (opts.fire.register && g.mayCall(attacker, MORTAR)) {
    for (const t of planned) g.registerTarget(attacker, MORTAR, t);
  }
  const defenderTargets =
    opts.defenderFirePlan !== false && g.mayCall(defender, MORTAR)
      ? planDefenderFires(g, defender, startLine, mapWidth, mapHeight, opts.defenderFirePlan === "open" ? "open" : "deadGround")
      : [];
  for (const t of defenderTargets) g.registerTarget(defender, MORTAR, t);

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
  /** Where the company stands, once there is a company: a commander knows what it has ordered. */
  let stage: () => string | undefined = () => undefined;
  const question = (q: Omit<Question, "turn" | "view">): string =>
    ask!({
      ...q,
      turn: g.turn,
      view: viewOf(g, attacker, { objective, mortarLeft: mortarLeft(), brief: listing.brief, startLine, reports: reports(), stage: stage() }),
    });
  const companyPlan = ask ? askPlan(g, attacker, objective, suspected, mapWidth, mapHeight, question) : opts.company ?? {};
  const scoutFit = new Map<string, number>();
  /** The turn each scout was last asked about, sitting at its point seeing nothing. */
  const scoutAsked = new Map<string, number>();
  /** Each squad's fit men at the last platoon question, and when each platoon was last asked about. */
  const platoonFit = new Map<string, number>();
  const platoonAsked = new Map<string, number>();
  const drillChoices = {
    ...(opts.coveredRoutes === false ? { coveredRoutes: false } : {}),
    ...(opts.arriveTogether === false ? { arriveTogether: false } : {}),
  };
  const company = new ScriptedCompany(g, attacker, objective, suspected, { ...companyPlan, ...drillChoices }, {
    // The ground as it stands, buildings brought down included (rules decision 76).
    get terrain() {
      return g.terrain;
    },
    width: mapWidth,
    height: mapHeight,
  });
  stage = () => companyStage(g, company);

  const tasks: Record<Side, DrillTask> = {
    [attacker]: { side: attacker, attacking: true, objective },
    [defender]: { side: defender, attacking: false, objective: startLine, reserves: new Set(reserves ?? []) },
  } as Record<Side, DrillTask>;
  const state = new DrillState();

  const men = { RED: 0, BLUE: 0 };
  for (const u of g.units) men[u.side] += u.soldiers?.length ?? 0;
  const result: ScenarioBattleResult = {
    winner: "draw",
    turns: 0,
    men,
    down: { RED: 0, BLUE: 0 },
    lost: { RED: 0, BLUE: 0 },
    outBy: { smallArms: 0, explosive: 0 },
    downWhileWaiting: 0,
    missions: { RED: 0, BLUE: 0 },
    smoke: { RED: 0, BLUE: 0 },
    counterattacks: 0,
    retaken: 0,
    defenderPlanned: 0,
    urban: { damaged: 0, rubble: 0, windowCriticals: 0, roofCriticals: 0, crushed: 0, vehiclesOut: { RED: 0, BLUE: 0 }, vehicles: { RED: 0, BLUE: 0 } },
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
    callDefenderFire(g, defender, result, defenderTargets);

    const moving = g.advanceToPhase("movement");
    heard(moving.resolved);
    ignore(moving.morale);
    if (ask) askScouts(g, company, state, startLine, objective, { width: mapWidth, height: mapHeight }, scoutFit, scoutAsked, question);
    if (ask) askPlatoons(g, company, platoonFit, platoonAsked, question);
    tasks[attacker].company = company.orders(g, ask ? { go: askGo(g, company, turn, question) } : undefined);
    for (const side of g.initiativeOrder) drillMovement(g, tasks[side], side === attacker ? drill : defenderDrill, state);
    if (result.released === undefined && company.released !== undefined) {
      result.released = company.released || turn;
      result.downWhileWaiting = downOf(attacker);
    }
    heard(g.advanceToPhase("combat").resolved);
    for (const side of g.initiativeOrder) drillCombat(g, tasks[side], side === attacker ? drill : defenderDrill, state);
    opts.onTurn?.(g, turn);
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

  for (const [id, post] of state.counterattacking) {
    result.counterattacks++;
    const u = g.getUnit(id);
    if (!u.neutralized && !u.routing && !u.surrendered && distance(u.position, post) <= HOLDS_POST_M) result.retaken++;
  }
  const tally = g.urbanTally;
  result.urban = { damaged: 0, rubble: 0, ...tally, vehiclesOut: { RED: 0, BLUE: 0 }, vehicles: { RED: 0, BLUE: 0 } };
  for (const o of g.mapTerrain.objects) {
    const state = g.structureState(o.id);
    if (state === "damaged") result.urban.damaged++;
    if (state === "rubble") result.urban.rubble++;
  }
  for (const u of g.units) {
    if (!u.vehicle) continue;
    result.urban.vehicles[u.side]++;
    if (u.neutralized || u.vehicle.destroyed || u.vehicle.mobilityKilled) result.urban.vehiclesOut[u.side]++;
  }
  for (const u of g.units) {
    const gone = !!u.surrendered || !!u.routing;
    for (const s of u.soldiers ?? []) {
      if (s.neutralized || gone || s.morale?.state === "broken") result.lost[u.side]++;
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
      // What scouts do in this game, said as fact: bare, the question drew one
      // scout from Jev and every Claude model (docs/balance.md, forty-fourth round).
      ask:
        "How many squads do you send ahead to find the enemy before the company goes? Scouts walk, look harder, hold their fire, and carry binoculars." +
        " Each scout squad watches from its own observation point, chosen so the points see different parts of the enemy's ground." +
        " When the company goes in, the scouts stay at their posts, and they are the eyes for your mortar fire: the assaulting squads, on the move, cannot find men dug in.",
      options: [
        { id: "0", label: "none: the whole company advances at once" },
        { id: "1", label: "one squad: one observation point, the enemy's ground seen from one side" },
        { id: "2", label: "two squads: two observation points" },
        { id: "3", label: "three squads: three observation points, the enemy's ground seen from three sides" },
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
  // A choice of three while the company can still move up; a yes or no after.
  const go =
    question({
      id: `go.${turn}`,
      kind: company.movedUp ? "noul" : "choice",
      ask: `${why} Send the company in now?`,
      options: [
        { id: "yes", label: "yes: the company advances to the attack" },
        ...(company.movedUp
          ? []
          : [
              {
                id: "up",
                label: `move up: the company moves to the last covered ground about ${ASSAULT_POSITION_M} m short of where your plan puts the enemy, and holds there until you send it in`,
              },
            ]),
        { id: "no", label: lost ? "no: the company stays where it is, with no scouts left to find the enemy" : "no: keep holding while the scouts look" },
      ],
    });
  // The enemy as the side has found it near the objective, if it has: where the company moves up to, and flanks.
  const found = sideView(g, company.side)
    .units.filter((e) => e.side !== company.side && !e.neutralized && distance(e.position, company.objectivePoint) <= FIND_WITHIN_M)
    .map((e) => e.position);
  if (go === "up") company.moveUp(g, found);
  if (go !== "yes") return false;
  // Which way it goes: straight, round a flank, or by one of the scouts'
  // observation points, coming in from that side.
  const posts = [...company.posts].filter((e): e is [string, Point] => e[1] !== null);
  const flanks = company.flankPoints(found);
  if (posts.length || flanks.length) {
    const axis = question({
      id: `go.axis.${turn}`,
      kind: "choice",
      ask: "Which way does the company go in?",
      options: [
        { id: "straight", label: "straight at the plan's centre" },
        ...flanks.map((f) => ({
          id: `flank:${f.side}`,
          label: `round the ${f.side} flank: by covered ground at (${Math.round(f.at.x)}, ${Math.round(f.at.y)}), beside the enemy, coming in on its side`,
        })),
        ...posts.map(([id, p]) => ({
          id: `via:${id}`,
          label: `by ${id}'s observation point (${Math.round(p.x)}, ${Math.round(p.y)}), coming in from that side`,
        })),
      ],
    });
    company.setAxis(
      axis === "straight" ? undefined : (flanks.find((f) => `flank:${f.side}` === axis)?.at ?? posts.find(([id]) => `via:${id}` === axis)?.[1]),
    );
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
  // Each platoon's task (item 2): who assaults, who gives a base of fire, who stays back.
  const platoons = [...company.platoons(g)].filter(([, us]) => us.some(fighting));
  let assaulting = 0;
  if (platoons.length > 1) {
    for (const [key, us] of platoons) {
      const task = question({
        id: `go.platoon.${key}.${turn}`,
        kind: "choice",
        ask: `What does platoon ${key} (${describePlatoon(us)}) do as the company goes in?`,
        options: PLATOON_GO_OPTIONS,
      }) as PlatoonTask;
      company.setPlatoonTask(key, task);
      if (task === "assault") assaulting++;
    }
  } else assaulting = platoons.length;
  if (assaulting > 1) {
    company.setBoundByPlatoon(
      question({
        id: `go.bound.${turn}`,
        kind: "noul",
        ask: "Do the assaulting platoons bound in turn once in contact, one moving while the others halt and fire?",
        options: [
          { id: "yes", label: "yes: bound by platoon, each covered by the others' fire" },
          { id: "no", label: "no: they all go together" },
        ],
      }) === "yes",
    );
  }
  if ((g.fireMissionsLeft(company.side, MORTAR) ?? 0) > 0) {
    company.setHoldShort(
      question({
        id: `go.lift.${turn}`,
        kind: "noul",
        ask:
          `Does the assault wait for your fires to lift? Squads that close to ${HOLD_SHORT_M} m of the enemy stop there, ` +
          "under your mortars, until you lift the fires; then they go in on the heels of the last rounds.",
        options: [
          { id: "yes", label: "yes: hold short, and I will say when to lift the fires" },
          { id: "no", label: "no: they go straight in, and the fires lift as they close" },
        ],
      }) === "yes",
    );
  }
  return true;
}

// Each option says what it does to the attack, not only what the platoon does:
// Jev, asked "assault / base of fire / reserve" bare, kept two platoons of three
// back and they never fought (docs/balance.md, thirty-fourth round).
const PLATOON_GO_OPTIONS = [
  { id: "assault", label: "assault the position: close with the enemy and take the objective" },
  { id: "support", label: "base of fire: stop at small-arms reach of the enemy and fire, without closing to take the objective" },
  { id: "reserve", label: "reserve: stay back where it waited, out of the fight until you commit it later" },
];
const fighting = (u: Unit) => !u.neutralized && !u.routing && !u.surrendered;
const describePlatoon = (us: readonly Unit[]) =>
  us
    .map((u) => `${u.id} ${(u.soldiers ?? []).filter((m) => !m.neutralized).length}/${u.soldiers?.length ?? 0} at (${Math.round(u.position.x)}, ${Math.round(u.position.y)})${fighting(u) ? "" : u.routing ? " routing" : " out of action"}`)
    .join(", ");

/**
 * Once the company has gone, the commander controls it by platoon (item 2):
 * asked when a platoon comes under fire (and from what, as far as the side
 * knows), when a halted platoon has lain up three turns, every fifth turn for
 * the reserve, and — when the assault waits for the fires to lift — when it
 * reaches its hold-short line.
 */
function askPlatoons(
  g: Game,
  company: ScriptedCompany,
  fitBefore: Map<string, number>,
  asked: Map<string, number>,
  question: (q: Omit<Question, "turn" | "view">) => string,
): void {
  if (company.released === undefined || g.turn <= company.released) return;
  const side = company.side;
  const marks = sideView(g, side).units.filter((e) => e.side !== side && !e.neutralized && !e.surrendered);
  for (const [key, us] of company.platoons(g)) {
    const live = us.filter(fighting);
    let hit = false;
    for (const u of us) {
      const fit = (u.soldiers ?? []).filter((m) => !m.neutralized).length;
      if (fit < (fitBefore.get(u.id) ?? fit)) hit = true;
      fitBefore.set(u.id, fit);
    }
    if (!live.length) continue;
    const task = company.platoonTask(key);
    const since = g.turn - (asked.get(key) ?? company.released);
    const idle = (task === "halt" && since >= 3) || (task === "reserve" && since >= 5);
    if (!hit && !idle) continue;
    asked.set(key, g.turn);
    const fire = live.map((u) => underFire(g, side, u)).filter((x): x is string => !!x);
    const why = hit
      ? `is taking casualties${fire.length ? ": " + fire.join("; ") : ""}`
      : task === "halt"
        ? "has been halted, gone to ground, three turns"
        : "is still in reserve";
    // "Carry on" last, and every option by what it does to the attack (as PLATOON_GO_OPTIONS).
    const options = [
      ...(task !== "assault" ? [{ id: "assault", label: PLATOON_GO_OPTIONS[0]!.label }] : []),
      ...(task !== "support" ? [{ id: "support", label: PLATOON_GO_OPTIONS[1]!.label }] : []),
      ...(task !== "halt" ? [{ id: "halt", label: "halt and go to ground where it is: stop moving and stop fighting forward" }] : []),
      { id: "withdraw", label: "pull back to the start line, out of the attack" },
      { id: "on", label: `carry on: ${PLATOON_TASK_CARRY_ON[task]}` },
    ];
    const a = question({
      id: `platoon.${key}.${g.turn}`,
      kind: "choice",
      ask: `Platoon ${key} ${why}. It is ${PLATOON_TASK_WORDS[task]}: ${describePlatoon(us)}. What now?`,
      options,
    });
    if (a !== "on") company.setPlatoonTask(key, a as PlatoonTask);
  }
  // The fires are spent: there is nothing left to lift, and the assault goes in.
  if (company.holdsShort && (g.fireMissionsLeft(side, MORTAR) ?? 0) === 0) company.liftFires();
  // The assault held short, under the fires: lift them now?
  if (company.holdsShort) {
    const at = [...company.platoons(g)]
      .filter(([key]) => company.platoonTask(key) === "assault")
      .flatMap(([, us]) => us.filter(fighting))
      .filter((u) => marks.some((e) => distance(u.position, e.position) <= HOLD_SHORT_M + 10));
    if (at.length) {
      const lift = question({
        id: `lift.${g.turn}`,
        kind: "noul",
        ask:
          `${at.map((u) => u.id).join(", ")} ${at.length === 1 ? "is" : "are"} at the hold-short line, ${HOLD_SHORT_M} m from the enemy, waiting for the fires to lift. ` +
          `Lift the fires and go in now? (Mortar missions left: ${g.fireMissionsLeft(side, MORTAR)}.)`,
        options: [
          { id: "yes", label: "yes: lift the fires, the assault goes in" },
          { id: "no", label: "no: keep the fires on and hold short" },
        ],
      });
      if (lift === "yes") company.liftFires();
    }
  }
}

const PLATOON_TASK_CARRY_ON: Record<PlatoonTask, string> = {
  assault: "keep assaulting",
  support: "keep giving a base of fire",
  reserve: "stay in reserve, out of the fight",
  halt: "stay halted, gone to ground",
  withdraw: "keep pulling back",
};

/** The company's stage in the commander's picture: not gone in yet, or gone in and what each platoon was ordered. */
function companyStage(g: Game, company: ScriptedCompany): string {
  if (company.released === undefined)
    return company.movedUp
      ? `Your company has not gone in to the attack yet: it has moved up to its assault position, about ${ASSAULT_POSITION_M} m short of where your plan puts the enemy, and holds there.`
      : "Your company has not gone in to the attack yet.";
  const tasks = [...company.platoons(g)]
    .filter(([, us]) => us.some(fighting))
    .map(([key]) => `${key} ${PLATOON_TASK_WORDS[company.platoonTask(key)]}`);
  return (
    `Your company went in to the attack on turn ${company.released}` +
    (tasks.length ? `: ${tasks.join(", ")}` : "") +
    (company.holdsShort ? `. The assault stops ${HOLD_SHORT_M} m short of the enemy until you lift your fires.` : ".")
  );
}

const PLATOON_TASK_WORDS: Record<PlatoonTask, string> = {
  assault: "assaulting",
  support: "giving a base of fire",
  reserve: "in reserve",
  halt: "halted, gone to ground",
  withdraw: "pulling back",
};



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
  // Every mark the side holds — in sight or last seen. Firing on a
  // last-seen mark is firing on where the enemy was. One close to its own
  // squads is offered as danger close, a risk the commander takes (decision
  // 63, S4). Once he lifts the fires for the assault they shift to depth:
  // nothing within LIFTED_CLEAR_M of the company's squads.
  const nearestOwn = (p: Point) => Math.min(...squads.map((s) => distance(s.position, p)));
  const marks = view.units.filter(
    (u) => u.side !== side && !u.neutralized && (!company.firesLifted || nearestOwn(u.position) > LIFTED_CLEAR_M),
  );
  if (!marks.length) return;
  const a = question({
    id: `fire.${g.turn}`,
    kind: "choice",
    ask:
      "Your mortar section is free. Fire a mission (12 bombs, for effect at once; a bomb kills within about 12 m, less against men dug in with overhead cover) on which mark? " +
      `A mark within ${DANGER_CLOSE_M} m of your own squads is DANGER CLOSE: the bombs can hit and pin your own men too. ` +
      "A position stays pinned only while the fire lasts and a turn or two after, so the assault has to arrive before you lift.",
    options: [
      ...marks.map((u) => {
        const seen = g.contactFor(side, u.id)?.lastSeenTurn ?? 0;
        return {
          id: u.id,
          label:
            `${u.id} (${u.kind === "command" ? "command group" : "infantry"}) at (${Math.round(u.position.x)}, ${Math.round(u.position.y)}), ` +
            `sure to ±${Math.round((view.spreads.get(u.id) ?? 0) * CE_PER_SIGMA)} m, ` +
            (seen >= g.turn - 1 ? "in sight" : `last seen turn ${seen}: it may have moved`) +
            (squads.length && nearestOwn(u.position) <= DANGER_CLOSE_M
              ? ` — DANGER CLOSE: your nearest squad is ${Math.round(nearestOwn(u.position))} m from it`
              : ""),
        };
      }),
      // Smoke once the company is moving: a screen on a mark blinds it while the squads close.
      ...(company.released !== undefined
        ? marks.map((u) => ({ id: `smoke:${u.id}`, label: `lay mortar smoke on ${u.id}'s mark, to screen your squads from it (costs one of your missions)` }))
        : []),
      // Bare, on purpose: worded "save the mission for when your assault is closing", Jev held every
      // mission until the company went, and fire held that long costs the attack about 30 points
      // (docs/balance.md, thirty-fourth round).
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
  // Danger close is a risk it takes (decision 63, S4): its fire stays on
  // until its squads are LIFT_AT_M from the mark.
  const safe = (p: Point) => squads.every((u) => distance(u.position, p) > LIFT_AT_M);
  const going = company.released !== undefined;
  // Smoke while it crosses: a screen on the enemy it knows of nearest its
  // squads, else on the plan, kept up as each one clears (two turns).
  const lead = Math.min(...squads.map((u) => distance(u.position, objective)));
  if (going && lead <= SCREEN_FROM_M && lead > LIFT_AT_M && result.smoke[side] < (plan.smokeMissions ?? 0)) {
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
      result.smoke[side]++;
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
    aim = open[result.missions[side] % Math.max(1, open.length)];
  }
  // Nothing sure to fire on: once it goes, keep the defence under fire on the plan.
  if (!aim && plan.prepFires && going) {
    const open = planned.filter(safe);
    aim = open[result.missions[side] % Math.max(1, open.length)];
  }
  if (!aim) return;
  g.callForFire(side, MORTAR, aim, { method: "effect" });
  result.missions[side]++;
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
function callDefenderFire(g: Game, side: Side, result: ScenarioBattleResult, registered: readonly Point[] = []): void {
  if (!mortarFree(g, side)) return;
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
    result.missions[side]++;
    result.defenderPlanned++;
    return;
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
  /** Battles in which the defender's reserve counterattacked (decision 60), and in which it held the position at the end. */
  counterattacked: number;
  retaken: number;
  /** Means a battle (decisions 76–78); vehicles out as a share of each side's vehicles. */
  urban: {
    damaged: number;
    rubble: number;
    windowCriticals: number;
    roofCriticals: number;
    crushed: number;
    attackerVehiclesOutPct: number;
    defenderVehiclesOutPct: number;
    vehicles: number;
  };
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
    counterattacked: rs.filter((r) => r.counterattacks > 0).length,
    urban: {
      damaged: sum((r) => r.urban.damaged) / rs.length,
      rubble: sum((r) => r.urban.rubble) / rs.length,
      windowCriticals: sum((r) => r.urban.windowCriticals) / rs.length,
      roofCriticals: sum((r) => r.urban.roofCriticals) / rs.length,
      crushed: sum((r) => r.urban.crushed) / rs.length,
      attackerVehiclesOutPct: (100 * sum((r) => r.urban.vehiclesOut[attacker])) / Math.max(1, sum((r) => r.urban.vehicles[attacker])),
      defenderVehiclesOutPct: (100 * sum((r) => r.urban.vehiclesOut[defender])) / Math.max(1, sum((r) => r.urban.vehicles[defender])),
      vehicles: sum((r) => r.urban.vehicles[attacker] + r.urban.vehicles[defender]) / rs.length,
    },
    retaken: rs.filter((r) => r.retaken > 0).length,
  };
}
