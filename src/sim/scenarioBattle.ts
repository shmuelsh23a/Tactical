import { battleScore, type SideScore } from "../app/score.js";
import { delayHeld, outOfTime, sideDefeated, sideView } from "../app/hotseat.js";
import { DrillState, HOLDS_POST_M, SCOUT_GIVE_UP_TURNS, drillCombat, drillMovement, type DrillTask, type SquadDrill } from "../app/drill.js";
import { ScriptedCompany, type CompanyPlan } from "../app/company.js";
import type { ScenarioListing } from "../app/scenarios/types.js";
import {
  ADJUSTMENT_RADIUS_M,
  CE_PER_SIGMA,
  EYE_HEIGHT,
  forceQuality,
  generateMorale,
  groundHeight,
  Rng,
  distance,
  terrainBlocksSight,
  unitSeed,
  type ForceQuality,
  type Game,
  type MoraleReport,
  type Point,
  type Side,
  type Unit,
} from "../engine/index.js";
import { estimateFrom } from "./balance.js";
import { bestVantages } from "../app/deadGround.js";
import {
  DEFAULT_FIRE_CHOICES,
  attackerPlan,
  callAttackerFire,
  callDefenderFire,
  tubeFree,
  tubesOf,
  DOCTRINAL_DEFENDER_TARGETS,
  FIRE_RESERVE,
  LIFT_AT_M,
  liftFor,
  ownClearOf,
  firingOnUs,
  priorityAim,
  priorityReserve,
  mortarFree,
  planDefenderFires,
  prepareAlternatePositions,
  type AttackerFireTally,
  type FirePlanChoices,
} from "../app/computerSide.js";

// The attacker's fire plan and fire calls live with the defender's in
// app/computerSide.ts, so the browser game and the harness play one
// attacker. Re-exported here because this module was their home.
export { DEFAULT_FIRE_CHOICES, type FirePlanChoices };
import { ASSAULT_POSITION_M, FIND_WITHIN_M, HOLD_SHORT_M, VANTAGE_RING_M, type PlatoonTask } from "../app/company.js";
import { casualtiesSeen, underFire, viewOf, type Decider, type Question } from "./companyQuestions.js";
import { hasEyesOn } from "../app/hotseat.js";
import type { IndirectFireResult, InteriorPlan } from "../engine/index.js";

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
   * The mission's deadline in place of the scenario's (decision 58), for a
   * measurement: when the attack fails on time, and the score's time share.
   * The reinforcement's window (decision 122) stays the scenario's: it was
   * drawn when the game was made.
   */
  timeLimit?: number;
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
  /**
   * The quality rules to switch off, for a measurement of what each does
   * (decisions 84 and 87): the gap on small arms and the assault, on rifle
   * grenades, and the breakpoint by force type. Set before the first turn.
   */
  qualityOff?: readonly ("gap" | "grenades" | "breakpoint")[];
  /** Suppression by volume (`GameOptions.suppressionByVolume`, rules decision 91), set before the first turn. Absent: the game's own. */
  suppressionByVolume?: boolean;
  /** A shell's suppression as a chance (`GameOptions.suppressionByChance`, rules decision 92), set before the first turn. Absent: the game's own. */
  suppressionByChance?: boolean;
  /**
   * A side's force quality (rules decision 83), for every force of it that
   * carries morale; a side not named keeps the scenario's. Set after the
   * scenario is built, so its men's pools are drawn again from their own
   * streams — the same traits, a pool from the new floor. A harness switch
   * only: a game played in the browser is dressed before `addUnit`.
   */
  quality?: Partial<Record<Side, ForceQuality>>;
  /**
   * Fight it without fire support: every side's allotted missions taken
   * away before the first turn, so nothing calls a mortar or a gun — the
   * small-arms fight the quality gap (decision 84) is measured on. On unless
   * false.
   */
  fireSupport?: boolean;
  /**
   * The scenario's reinforcements (decision 122): on unless false. Off, none
   * ever comes — a measurement switch, for what a reinforcement costs a plan.
   */
  reinforcements?: boolean;
  /**
   * Each side's plan for a fight inside a building (rules decision 101),
   * given to every infantry force of the side at mission planning. Absent:
   * the defaults, "unless otherwise planned".
   */
  interiorPlans?: { attack?: InteriorPlan; defence?: InteriorPlan };
  /**
   * Disengagement criteria for every defending squad but the reserves
   * (decision 107): a share of losses, and its next position `back` metres
   * straight back from the attack's start line.
   */
  disengage?: { lossShare?: number; line?: number; back: number };
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
  /** The defender won a delay mission by holding to its turn (decision 109). */
  delayed?: boolean;
  /** Each side's score (decision 108), alongside who won. */
  score?: Record<Side, SideScore>;
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
/** Fires lifted for the assault shift beyond this of the company's squads (ours). */
const LIFTED_CLEAR_M = 300;

/**
 * Give a side's forces a cell of the force-quality matrix (rules decision 83,
 * decision 81's matrix) in a game already built: each force with morale takes
 * the cell's motivation and experience, and its men's pools are drawn again
 * from their own streams — the same traits, a pool from the new floor, no
 * draw from `game.rng`. The harness's way of measuring a cell on a scenario as
 * generated. **A recording of the dressed game replays the scenario's
 * quality, not this one** — `addUnit` journalled the forces as built — so it
 * refuses a game already under way; a game to be recorded is dressed before
 * `addUnit` instead.
 */
export function dressQuality(g: Game, quality: Partial<Record<Side, ForceQuality>>): void {
  if (g.turn > 0) throw new Error("dressQuality: a game already under way; dress its forces before addUnit");
  for (const [side, cell] of Object.entries(quality) as [Side, ForceQuality][]) {
    // Its reinforcements too (decision 122), dressed before they arrive.
    for (const u of [...g.units, ...g.reinforcements.flatMap((r) => r.units)]) {
      if (u.side !== side || !u.soldiers?.some((s) => s.morale)) continue;
      Object.assign(u, forceQuality(cell));
      for (const s of u.soldiers) delete s.morale;
      generateMorale(u, g.seed);
    }
  }
}

/** One battle of `listing`, on `seed`, to an end or to `maxTurns`. */
export function runScenarioBattle(listing: ScenarioListing, seed: number, opts: ScenarioBattleOptions): ScenarioBattleResult {
  const { game: g, mapWidth, mapHeight, reserves } = listing.build(seed);
  if (opts.fireOnTheMove !== undefined) g.fireOnTheMove = opts.fireOnTheMove;
  if (opts.attackerBreakpoint !== undefined) g.attackerBreakpoint = opts.attackerBreakpoint;
  if (opts.suppressionByVolume !== undefined) g.suppressionByVolume = opts.suppressionByVolume;
  // A measurement's switch, not a rule: the game's own options are fixed once it is built.
  const quality = g as { qualityGap: boolean; qualityGapGrenades: boolean; qualityBreakpoint: boolean };
  if (opts.qualityOff?.includes("gap")) quality.qualityGap = false;
  if (opts.qualityOff?.includes("grenades")) quality.qualityGapGrenades = false;
  if (opts.qualityOff?.includes("breakpoint")) quality.qualityBreakpoint = false;
  if (opts.suppressionByChance !== undefined) g.suppressionByChance = opts.suppressionByChance;
  if (opts.timeLimit !== undefined) (g as { timeLimit: number | undefined }).timeLimit = opts.timeLimit;
  if (opts.quality) dressQuality(g, opts.quality);
  if (opts.fireSupport === false) {
    for (const list of Object.values(g.fireSupport)) for (const a of list ?? []) a.missions = 0;
    for (const r of g.reinforcements) for (const a of r.fire ?? []) a.missions = 0; // what a reinforcement brings too (decision 122)
  }
  // Turn 0 never begins, so a reinforcement drawn for it never comes.
  if (opts.reinforcements === false) for (const r of g.reinforcements) r.turn = 0;
  const attacker: Side = g.attackers[0] ?? "BLUE";
  const defender = other(attacker);
  const maxTurns = opts.maxTurns ?? g.timeLimit ?? 60;
  const drill = opts.drill;
  const defenderDrill = opts.defenderDrill ?? drill;

  // The tasking: where the defence is, spoilt by an observer's error from the
  // start line — drawn exactly as the browser tool draws it, so a seed puts
  // the plan in the same wrong place in both.
  // The position held, not the reserve kept hidden behind it (decision 105), as `briefedObjective` does.
  const defence = g.units.filter((u) => u.side === defender && u.kind !== "command" && !(reserves ?? []).includes(u.id));
  const own = g.units.filter((u) => u.side === attacker && u.kind !== "command");
  const truth = mean(defence);
  const startLine = mean(own);
  const objective = opts.fire.planningError > 0
    ? estimateFrom(new Rng(unitSeed(g.seed, "#planning-error")), startLine, truth, opts.fire.planningError)
    : truth;
  // The plan: the points the mortars register and the points the scouts
  // look for (`attackerPlan`, shared with the computer the browser plays).
  const { planned, suspected } = attackerPlan(objective);

  // Mission planning: the attacker registers its plan; the defender its
  // targets on the dead ground in front of it.
  // Every tube a side has registers the same points (decision 93: a side may
  // have its own 60 mm and the battalion's 81 mm).
  if (opts.fire.register) {
    for (const w of tubesOf(g, attacker)) for (const t of planned) g.registerTarget(attacker, w, t);
  }
  const legacyFire = opts.fire.legacyFirePlan ?? false;
  const defenderTargets =
    opts.defenderFirePlan !== false && tubesOf(g, defender).length
      ? planDefenderFires(
          g,
          defender,
          startLine,
          mapWidth,
          mapHeight,
          opts.defenderFirePlan === "open" ? "open" : "deadGround",
          legacyFire ? undefined : DOCTRINAL_DEFENDER_TARGETS,
          !legacyFire && !!defenderDrill.fireInDepth,
          reserves ?? [],
        )
      : [];
  for (const w of tubesOf(g, defender)) for (const t of defenderTargets) g.registerTarget(defender, w, t);
  // Its alternate positions, where its drill moves to them (decision 120).
  prepareAlternatePositions(g, defender, startLine, defenderDrill, reserves ?? [], { width: mapWidth, height: mapHeight });
  // Each side's plan for a fight inside (decision 101), for every infantry force of it.
  for (const [side, plan] of [[attacker, opts.interiorPlans?.attack], [defender, opts.interiorPlans?.defence]] as const) {
    if (plan) for (const u of g.units) if (u.side === side && u.kind === "infantry") g.setInteriorPlan(u.id, plan);
  }
  if (opts.disengage) {
    for (const u of g.units) {
      if (u.side !== defender || u.kind !== "infantry" || (reserves ?? []).includes(u.id)) continue;
      const dx = u.position.x - startLine.x, dy = u.position.y - startLine.y, d = Math.hypot(dx, dy) || 1;
      const clamp = (v: number, hi: number) => Math.min(hi - 1, Math.max(1, v));
      const position = { x: clamp(u.position.x + (dx / d) * opts.disengage.back, mapWidth), y: clamp(u.position.y + (dy / d) * opts.disengage.back, mapHeight) };
      // A line `line` metres in front of the squad, across the way to the start line: going early (5-38).
      const ux = -dx / d, uy = -dy / d;
      const c = opts.disengage.line !== undefined ? { x: u.position.x + ux * opts.disengage.line, y: u.position.y + uy * opts.disengage.line } : undefined;
      const line = c ? { from: { x: c.x - uy * 200, y: c.y + ux * 200 }, to: { x: c.x + uy * 200, y: c.y - ux * 200 } } : undefined;
      g.setDisengagement(u.id, { ...(opts.disengage.lossShare !== undefined ? { lossShare: opts.disengage.lossShare } : {}), ...(line ? { line } : {}), position });
    }
  }

  const ask = opts.decide;
  /** The asked commander's priority target, once named (decision 93). */
  let priority: Point | undefined;
  // The mortars' missions free to fire: a priority target's held missions are
  // not (decision 93); the guns are counted on their own line (decision 95).
  const mortarLeft = () => {
    const left = missionsLeft(g, attacker, true);
    const reserve = priorityReserve(g, attacker, priority);
    return left == null ? null : left - (reserve.tube !== "artillery" ? reserve.held : 0);
  };
  const gunsLeft = () => {
    const n = g.mayCall(attacker, "artillery") ? g.fireMissionsLeft(attacker, "artillery") : undefined;
    if (n === undefined) return undefined;
    const reserve = priorityReserve(g, attacker, priority);
    return { left: n, held: reserve.tube === "artillery" ? reserve.held : 0 };
  };
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
      view: viewOf(g, attacker, { objective, mortarLeft: mortarLeft(), gunsLeft: gunsLeft(), brief: listing.brief, startLine, reports: reports(), stage: stage() }),
    });
  const companyPlan = ask ? askPlan(g, attacker, objective, suspected, mapWidth, mapHeight, question) : opts.company ?? {};
  // The asked commander names its priority target (decision 93's fire plan, in the questions).
  priority = ask && tubesOf(g, attacker).length ? askPriority(planned, question) : undefined;
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
    [attacker]: { side: attacker, attacking: true, objective, extent: { width: mapWidth, height: mapHeight } },
    [defender]: { side: defender, attacking: false, objective: startLine, reserves: new Set(reserves ?? []), extent: { width: mapWidth, height: mapHeight } },
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

  // What the attacker has fired, which its own fire policy reads (the
  // plan's points are taken in turn by the count, and the smoke allowance
  // is spent against it). Nothing else touches the attacker's two
  // counters, so mirroring them into the result after each call leaves
  // the tables exactly as they were.
  const attackerFire: AttackerFireTally = { missions: 0, smoke: 0 };
  g.beginTurn();
  for (let turn = 1; turn <= maxTurns; turn++) {
    result.turns = turn;
    heard(g.advanceToPhase("targeting").resolved);
    if (ask) {
      // The asked commander counts its own missions straight into the result.
      askAttackerFire(g, attacker, company, result, question, planned, priority);
    } else {
      callAttackerFire(g, attacker, planned, objective, opts.fire, company, attackerFire);
      result.missions[attacker] = attackerFire.missions;
      result.smoke[attacker] = attackerFire.smoke;
    }
    const defenderCall = callDefenderFire(g, defender, defenderTargets, legacyFire, state.movingUnderFire(g, defender));
    if (defenderCall) result.missions[defender]++;
    // On its plan: a registered target, the FPF and the priority target among them (decision 93).
    if (defenderCall === "plan" || defenderCall === "fpf" || defenderCall === "priority") result.defenderPlanned++;

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
    // A delay mission done (decision 109): the defender held the attack as long as it was to.
    if (delayHeld(g)) { result.winner = defender; result.delayed = true; break; }
  }
  if (result.released === undefined) result.downWhileWaiting = downOf(attacker);
  // The clock ran out on the attack (decision 58): the defender held.
  if (result.winner === "draw" && !sideDefeated(g, attacker) && !sideDefeated(g, defender) && outOfTime(g) === attacker) {
    result.winner = defender;
    result.outOfTime = true;
  }
  result.score = battleScore(g, result.winner === "draw" ? null : result.winner).sides;

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

/** The plan's registered points by name, in `attackerPlan`'s order. */
const PLANNED_NAMES = ["the plan's centre", "its west", "its east"];

/**
 * Which of the plan's points is the priority target (rules decision 93, in
 * the questions): its missions are held back on the heaviest tube and fired
 * at once on the commander's call (ATP 3-21.90 2-120, 2-123). None is a choice.
 */
function askPriority(planned: readonly Point[], question: (q: Omit<Question, "turn" | "view">) => string): Point | undefined {
  const a = question({
    id: "plan.priority",
    kind: "choice",
    ask:
      `Which registered point is your priority target? ${FIRE_RESERVE.attackerPriority} missions of your heaviest mortars are held back for it: ` +
      "no other mission can spend them, and when you call them they land at once on its registered data, needing no observer.",
    options: [
      ...planned.slice(0, PLANNED_NAMES.length).map((p, i) => ({
        id: `t${i + 1}`,
        label: `${PLANNED_NAMES[i]} (${Math.round(p.x)}, ${Math.round(p.y)})`,
      })),
      { id: "none", label: "none: every mission is free to fire on what is found" },
    ],
  });
  return a === "none" ? undefined : planned[Number(a.slice(1)) - 1];
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
  if ((missionsLeft(g, company.side) ?? 0) > 0) {
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
  // The assault element is spent and a platoon is still fighting elsewhere:
  // send it in? Unasked, a company would wait out the clock for an assault
  // that no longer exists (balance.md, *Why the 2:1 plans fail*).
  if (company.assaultSpent(g)) {
    const rest = company.toCommit(g);
    // The reserve first (drill audit, A9); the base of fire only when there is none.
    const what = rest.some((k) => company.platoonTask(k) === "reserve") ? "reserve" : "base of fire";
    const a = question({
      id: `recommit.${g.turn}`,
      kind: "noul",
      ask:
        `Your assault is out of the fight: no squad of an assaulting platoon is still fighting. ` +
        `Send your ${what}, ${rest.join(" and ")}, in to assault${company.holdsShort ? ", lifting your fires" : ""}?`,
      options: [
        { id: "yes", label: `yes: the ${what} goes in` },
        { id: "no", label: "no: it stays where it is (you will not be asked again)" },
      ],
    });
    if (a === "yes") company.recommit(g);
    else company.declineRecommit();
  }
  // The fires are spent: there is nothing left to lift, and the assault goes in.
  if (company.holdsShort && (missionsLeft(g, side) ?? 0) === 0) company.liftFires();
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
          `Lift the fires and go in now? (Fire missions left: ${missionsLeft(g, side)}.)`,
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
  security: "keep watching the flanks and rear",
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
  security: "on flank and rear security",
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
export function askAttackerFire(
  g: Game,
  side: Side,
  company: ScriptedCompany,
  result: ScenarioBattleResult,
  question: (q: Omit<Question, "turn" | "view">) => string,
  planned: readonly Point[] = [],
  priority?: Point,
): void {
  if (!mortarFree(g, side)) return;
  // Decision 93's fire plan, in the questions: the priority target's
  // missions are held back on the heaviest tube; the rest are free.
  const reserve = priorityReserve(g, side, priority);
  const tubes = tubesOf(g, side);
  const free = tubes.filter((w) => tubeFree(g, side, w));
  const spare = free.filter((w) => (g.fireMissionsLeft(side, w) ?? Infinity) > (w === reserve.tube ? reserve.held : 0));
  // Before the fires lift, and with every squad beyond the reserve tube's lift
  // from it, as the scripted commander's (decisions 93, 95; liftFor).
  // Where the priority mission would land: on the enemy seen near the point, if any (drill audit, A8) —
  // and that is where its squads must be clear of it, and what they are told.
  const aimed = priority ? priorityAim(g, side, priority) : undefined;
  const clear = !aimed || !reserve.tube || squadsClearOf(g, side, company, aimed, reserve.tube);
  const canPriority = !!priority && !!reserve.tube && reserve.held > 0 && free.includes(reserve.tube) && !company.firesLifted && clear;
  if (!spare.length && !canPriority) return;
  // The mortar a mark is fired with — the heaviest with a mission to spare —
  // and the guns, which fire only on a mark beyond their lift (decision 95).
  const tube = [...spare].reverse().find((w) => w !== "artillery");
  const guns = spare.includes("artillery");
  const bombs = tube ? g.fireSupport[side]?.find((a) => a.weapon === tube)?.roundsForEffect : undefined;
  const kills = (tube && TUBE_KILL_RADIUS[tube]) ?? "about 9 m";
  // Smoke is the 81 mm's, from a mission it has to spare (decision 93: the 60 mm lays none).
  const canSmoke = spare.includes(MORTAR);
  const squads = g.units.filter((u) => u.side === side && u.kind === "infantry" && !u.neutralized && !company.isScout(u));
  const view = sideView(g, side);
  // Every mark the side holds — in sight or last seen. Firing on a
  // last-seen mark is firing on where the enemy was. One close to its own
  // squads is offered as danger close, a risk the commander takes (decision
  // 63, S4). Once he lifts the fires for the assault they shift to depth:
  // nothing within LIFTED_CLEAR_M of the company's squads.
  const nearestOwn = (p: Point) => Math.min(...squads.map((s) => distance(s.position, p)));
  // Which tube a mark is fired with: the heaviest that may fire there.
  const tubeFor = (p: Point) => [...spare].reverse().find((w) => w !== "artillery" || squadsClearOf(g, side, company, p, w));
  const marks = spare.length
    ? view.units.filter(
        (u) => u.side !== side && !u.neutralized && (!company.firesLifted || nearestOwn(u.position) > LIFTED_CLEAR_M) && tubeFor(u.position),
      )
    : [];
  if (!marks.length && !canPriority) return;
  const firing = firingOnUs(g, side);
  const onPlan = (p: Point) => planned.findIndex((t) => distance(t, p) <= ADJUSTMENT_RADIUS_M);
  const name = (i: number) => PLANNED_NAMES[i] ?? `planned point ${i + 1}`;
  const priorityName = priority ? name(planned.indexOf(priority)) : "";
  const lead = squads.length && aimed ? Math.round(nearestOwn(aimed)) : undefined;
  const left = (w: string) => g.fireMissionsLeft(side, w) ?? 0;
  const freeMissions = tubes.reduce((n, w) => n + Math.max(0, left(w) - (w === reserve.tube ? reserve.held : 0)), 0);
  const a = question({
    id: `fire.${g.turn}`,
    kind: "choice",
    ask:
      `Your mortars are free. ${freeMissions} mission${freeMissions === 1 ? " is" : "s are"} free to fire` +
      (priority ? ` and ${reserve.held} held back for your priority target, ${priorityName}` : "") +
      ". " +
      (tube
        ? `A free mortar mission fires ${bombs ? `${bombs} bombs` : "its bombs"} for effect at once; a bomb kills within ${kills}, less against men dug in with overhead cover. `
        : "") +
      (guns
        ? `Your battalion's guns fire a free mission on a mark more than ${liftFor("artillery")} m from your squads: ` +
          `${g.fireSupport[side]?.find((a) => a.weapon === "artillery")?.roundsForEffect ?? 6} shells, landing two turns after the call; a shell kills within ${TUBE_KILL_RADIUS.artillery}. `
        : "") +
      `A mark within ${DANGER_CLOSE_M} m of your own squads is DANGER CLOSE: the bombs can hit and pin your own men too. ` +
      "A position stays pinned only while the fire lasts and a turn or two after, so the assault has to arrive before you lift. Fire on which?",
    options: [
      ...marks.map((u) => {
        const seen = g.contactFor(side, u.id)?.lastSeenTurn ?? 0;
        const planIx = onPlan(u.position);
        return {
          id: u.id,
          label:
            `${u.id} (${u.kind === "command" ? "command group" : "infantry"}) at (${Math.round(u.position.x)}, ${Math.round(u.position.y)}), ` +
            `sure to ±${Math.round((view.spreads.get(u.id) ?? 0) * CE_PER_SIGMA)} m, ` +
            (seen >= g.turn - 1 ? "in sight" : `last seen turn ${seen}: it may have moved`) +
            (planIx >= 0 ? `, on your planned target ${name(planIx)}` : "") +
            (firing.has(u.id) ? ", FIRING ON YOUR SQUADS" : "") +
            (squads.length && nearestOwn(u.position) <= DANGER_CLOSE_M
              ? ` — DANGER CLOSE: your nearest squad is ${Math.round(nearestOwn(u.position))} m from it`
              : ""),
        };
      }),
      ...(canPriority
        ? [
            {
              id: "priority",
              label:
                `your priority target, ${priorityName}: one of the ${reserve.held} missions held for it, on its registered data, shifted onto the enemy if he has been seen near it` +
                (reserve.tube === "artillery" ? ", by the battalion's artillery, landing two turns after the call" : "") +
                (lead !== undefined ? `; your nearest squad is ${lead} m from it` : "") +
                (lead !== undefined && lead <= DANGER_CLOSE_M ? " — DANGER CLOSE" : ""),
            },
          ]
        : []),
      // Smoke once the company is moving: a screen on a mark blinds it while the squads close.
      ...(company.released !== undefined && canSmoke
        ? marks.map((u) => ({ id: `smoke:${u.id}`, label: `lay mortar smoke on ${u.id}'s mark, to screen your squads from it (costs one of your missions)` }))
        : []),
      // Bare, on purpose: worded "save the mission for when your assault is closing", Jev held every
      // mission until the company went, and fire held that long costs the attack about 30 points
      // (docs/balance.md, thirty-fourth round).
      { id: "hold", label: "hold fire this turn" },
    ],
  });
  if (a === "hold") return;
  if (a === "priority") {
    g.callForFire(side, reserve.tube!, aimed!, { method: "effect" });
    result.missions[side]++;
    return;
  }
  if (a.startsWith("smoke:")) {
    const screened = marks.find((u) => `smoke:${u.id}` === a)!;
    g.deploySmoke(MORTAR, side, screened.position);
    result.smoke[side]++;
    return;
  }
  const target = marks.find((u) => u.id === a)!;
  // The heaviest tube with a mission to spare, as before decision 93's
  // questions — never the guns within their lift of the squads (decision 95):
  // a mark with no tube to fire it is not offered.
  g.callForFire(side, tubeFor(target.position)!, target.position, { method: "effect" });
  result.missions[side]++;
}

/** Whether every squad of `side` but its scouts is beyond the lift distance of `p` (decision 63 S4's LIFT_AT_M). */
function squadsClearOf(g: Game, side: Side, company: ScriptedCompany, p: Point, weapon: string): boolean {
  const squads = g.units.filter((u) => u.side === side && u.kind === "infantry" && !u.neutralized && !company.isScout(u));
  return ownClearOf(g, side, squads, p, weapon);
}

/** A bomb's lethal radius by tube, as a commander is told it: √(area/π) of ARES's lethal areas (decision 93). */
const TUBE_KILL_RADIUS: Readonly<Record<string, string>> = { lightMortar: "about 7 m", mortar: "about 9 m", heavyMortar: "about 14 m", artillery: "about 15 m" };

/** The missions a side has left over all its tubes (decision 93) — or its mortars only; null when it may call none, undefined when it is not rationed. */
function missionsLeft(g: Game, side: Side, mortarsOnly = false): number | null | undefined {
  const tubes = tubesOf(g, side).filter((w) => !mortarsOnly || w !== "artillery");
  if (!tubes.length) return null;
  let left = 0;
  for (const w of tubes) {
    const n = g.fireMissionsLeft(side, w);
    if (n === undefined) return undefined;
    left += n;
  }
  return left;
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
  /** Each side's mean score a battle (decision 108). */
  attackerScore: number;
  defenderScore: number;
  /** Every battle's own result, for a reading the summary does not make. */
  results: ScenarioBattleResult[];
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
    results: rs,
    attackerScore: sum((r) => r.score?.[attacker].total ?? 0) / rs.length,
    defenderScore: sum((r) => r.score?.[defender].total ?? 0) / rs.length,
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
