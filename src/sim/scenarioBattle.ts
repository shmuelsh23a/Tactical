import { battleScore, type SideScore } from "../app/score.js";
import { delayHeld, outOfTime, sideDefeated } from "../app/hotseat.js";
import { DrillState, HOLDS_POST_M, designateBreachSquads, drillCombat, drillMovement, limitOfAdvanceFrom, type DrillTask, type SquadDrill } from "../app/drill.js";
import { ScriptedCompany, type CompanyPlan } from "../app/company.js";
import type { ScenarioListing } from "../app/scenarios/types.js";
import {
  forceQuality,
  generateMorale,
  Rng,
  distance,
  unitSeed,
  type ForceQuality,
  type Game,
  type MoraleReport,
  type Point,
  type Side,
  type Unit,
} from "../engine/index.js";
import { estimateFrom } from "./balance.js";
import {
  DEFAULT_FIRE_CHOICES,
  attackerPlan,
  callAttackerFire,
  callDefenderFire,
  tubesOf,
  DOCTRINAL_DEFENDER_TARGETS,
  planDefenderFires,
  placeCaches,
  prepareAlternatePositions,
  type AttackerFireTally,
  type FirePlanChoices,
} from "../app/computerSide.js";

// The attacker's fire plan and fire calls live with the defender's in
// app/computerSide.ts, so the browser game and the harness play one
// attacker. Re-exported here because this module was their home.
export { DEFAULT_FIRE_CHOICES, type FirePlanChoices };
import type { Decider } from "../app/companyQuestions.js";
import { AskedAttacker } from "../app/askedCompany.js";
export { askAttackerFire, notInSight } from "../app/askedCompany.js";
import type { InteriorPlan } from "../engine/index.js";

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
  /**
   * A limit of advance this many metres past the objective, on the line from
   * the start line (decision 130): the attacker goes no further, and pushes a
   * squad out to it once the objective is seized. Absent: none.
   */
  limitOfAdvanceM?: number;
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
   * The defender's counterattack inside (`GameOptions.counterattackInside`,
   * decision 104): on unless false. Off, as for a recording made before it:
   * defenders inside stand or fall back; a defending force's assault on
   * attackers in its house is refused; a reserve is committed only once its
   * squad's post is lost, not while the house is cleared round it; and the
   * sides in a fight inside no longer keep contact turn by turn. A
   * measurement switch, for what the counterattack inside is worth apart
   * from the reserve's fight outside.
   */
  counterattackInside?: boolean;
  /** Ammunition counted (`GameOptions.ammunition`, rules decision 127). `false` takes the loads off the scenario's forces: every table before it. */
  ammunition?: boolean;
  /**
   * The attacker briefed on the defence with its reserves (true), as before
   * decision 105: the tasking aimed at the mean of every defending force. A
   * measurement switch, for what the brief alone moves; the reserves stay
   * reserves.
   */
  briefReserves?: boolean;
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
  if (opts.counterattackInside === false) (g as { counterattackInside: boolean }).counterattackInside = false;
  // Nobody counts ammunition (decision 127 off), as before 2026-11-19: a measurement's switch, the loads taken back off the forces.
  if (opts.ammunition === false) {
    (g as { ammunition: boolean }).ammunition = false;
    for (const u of g.units) {
      for (const s of u.soldiers ?? []) { delete s.rounds; delete s.grenades; }
      delete u.ammo;
      delete u.charges;
    }
  }
  const attacker: Side = g.attackers[0] ?? "BLUE";
  const defender = other(attacker);
  const maxTurns = opts.maxTurns ?? g.timeLimit ?? 60;
  const drill = opts.drill;
  const defenderDrill = opts.defenderDrill ?? drill;

  // The tasking: where the defence is, spoilt by an observer's error from the
  // start line — drawn exactly as the browser tool draws it, so a seed puts
  // the plan in the same wrong place in both.
  // The position held, not the reserve kept hidden behind it (decision 105), as `briefedObjective` does.
  const defence = g.units.filter((u) => u.side === defender && u.kind !== "command" && (opts.briefReserves || !(reserves ?? []).includes(u.id)));
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
  // The attacker's caches, where it starts (decision 127); the defender's stand at its positions by themselves.
  placeCaches(g, attacker);
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

  const drillChoices = {
    ...(opts.coveredRoutes === false ? { coveredRoutes: false } : {}),
    ...(opts.arriveTogether === false ? { arriveTogether: false } : {}),
  };
  const ground = {
    // The ground as it stands, buildings brought down included (rules decision 76).
    get terrain() {
      return g.terrain;
    },
    width: mapWidth,
    height: mapHeight,
  };
  // The company commander asked its decisions as typed questions (app/askedCompany.ts), or the scripted one deciding by rule.
  const asked = opts.decide
    ? new AskedAttacker(g, attacker, objective, startLine, { planned, suspected }, ground, opts.decide, listing.brief, drillChoices)
    : undefined;
  const company = asked?.company ?? new ScriptedCompany(g, attacker, objective, suspected, { ...(opts.company ?? {}), ...drillChoices }, ground);

  const tasks: Record<Side, DrillTask> = {
    [attacker]: {
      side: attacker,
      attacking: true,
      objective,
      extent: { width: mapWidth, height: mapHeight },
      ...(opts.limitOfAdvanceM !== undefined ? { limitOfAdvance: limitOfAdvanceFrom(startLine, objective, opts.limitOfAdvanceM) } : {}),
    },
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
  // Its breach squads, named in planning as a player names them (decision 125), where its drill breaches.
  designateBreachSquads(g, attacker, drill, (u) => company.isScout(u));
  g.beginTurn();
  for (let turn = 1; turn <= maxTurns; turn++) {
    result.turns = turn;
    // Advanced whoever commands: `asked?.heard(g.advanceToPhase(…))` would skip the advance with no asked commander.
    const aiming = g.advanceToPhase("targeting");
    asked?.heard(aiming.resolved);
    if (asked) {
      asked.targeting();
      result.missions[attacker] = asked.fire.missions;
      result.smoke[attacker] = asked.fire.smoke;
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
    asked?.heard(moving.resolved);
    ignore(moving.morale);
    tasks[attacker].company = asked ? asked.movement(turn, state) : company.orders(g);
    for (const side of g.initiativeOrder) drillMovement(g, tasks[side], side === attacker ? drill : defenderDrill, state);
    if (result.released === undefined && company.released !== undefined) {
      result.released = company.released || turn;
      result.downWhileWaiting = downOf(attacker);
    }
    const fighting = g.advanceToPhase("combat");
    asked?.heard(fighting.resolved);
    for (const side of g.initiativeOrder) drillCombat(g, tasks[side], side === attacker ? drill : defenderDrill, state);
    opts.onTurn?.(g, turn);
    if (settle()) break;
    const next = g.advanceToPhase("initiative");
    asked?.heard(next.resolved);
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
  /** Battles in which the defender's reserve counterattacked (decision 60), and in which a committed reserve still in play stood on the post it was sent to when the battle ended (whoever won). */
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
