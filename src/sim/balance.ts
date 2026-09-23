import { sideDefeated } from "../app/hotseat.js";
import { DrillState, PLAIN_SCRIPT, drillCombat, drillMovement, type DrillTask, type SquadDrill } from "../app/drill.js";
import {
  ECHELON_RANK,
  FIRE_SUPPORT_MIN_ECHELON,
  Game,
  distance,
  makeCommandGroup,
  makeInfantry,
  type Echelon as EngineEchelon,
  type FireAllotment,
  type FireMethod,
  type Fuze,
  type GameOptions,
  type MoraleReport,
  type Point,
  type RuleVariants,
  type Side,
  type Unit,
} from "../engine/index.js";

/**
 * The balance harness: many headless battles between Western (NATO-organised)
 * forces under a scripted fire-and-movement doctrine, summarised per cell.
 *
 * It exists so that a rule change can be **measured** rather than argued
 * (AGENTS.md: "measure before ruling"). The figures it produced on 2026-09-22
 * are on docs/balance.md, with what they say. Run it with `npm run balance`
 * (the runner is `tools/balance-sim.ts`); the suite runs a few battles of each
 * kind so it cannot rot.
 *
 * **What it is not.** The doctrine is a script, not a player: it bounds, fires
 * at the nearest enemy it knows of, assaults inside 25 m, and does nothing
 * clever — no smoke, no flanking, no withdrawal, no use of ground. The ground
 * is flat and open so the rules are measured alone. So a result here says what
 * the *rules* do to two forces played the same plain way; it does not say how
 * a good player would fare. Everything draws from the game's own seeded rng, so
 * a cell is reproducible from its seeds.
 */

export type Echelon = "squad" | "platoon" | "company";

/**
 * - `meeting`: mirror forces advance on each other.
 * - `attack3`: BLUE attacks one echelon down, at about 3–4:1, on a prepared
 *   position (a fire team, a squad, a platoon).
 * - `attack2`: about 2:1 on a prepared position.
 * - `attack1`: 1:1 on a prepared position.
 */
export type BattleKind = "meeting" | "attack3" | "attack2" | "attack1";

export const ECHELONS: readonly Echelon[] = ["squad", "platoon", "company"];
export const BATTLE_KINDS: readonly BattleKind[] = ["meeting", "attack3", "attack2", "attack1"];

/** US-style organisation. The weapons squad fires as small arms: the document's table is נק"ל\מקלעים. */
export const ORG = {
  squad: 9,
  fireTeam: 4,
  weaponsSquad: 6,
  platoonHq: 3,
  companyHq: 5,
} as const;

/** A battle that has not ended by then is a draw. */
export const MAX_TURNS = 60;

interface ForceSpec {
  id: string;
  kind: "infantry" | "command";
  echelon: "squad" | "platoon" | "company";
  men: number;
  at: Point;
  prepared?: boolean;
}

/** A platoon on an 160 m frontage centred on (x, y); `facing` is +1 southward, -1 northward. */
function platoon(prefix: string, x: number, y: number, facing: 1 | -1, prepared = false): ForceSpec[] {
  const f: ForceSpec[] = [
    { id: `${prefix}-HQ`, kind: "command", echelon: "platoon", men: ORG.platoonHq, at: { x, y: y - facing * 60 } },
  ];
  for (let i = 0; i < 3; i++) {
    f.push({ id: `${prefix}-${i + 1}`, kind: "infantry", echelon: "squad", men: ORG.squad, at: { x: x + (i - 1) * 80, y }, prepared });
  }
  f.push({ id: `${prefix}-WPN`, kind: "infantry", echelon: "squad", men: ORG.weaponsSquad, at: { x, y: y - facing * 30 }, prepared });
  return f;
}

/** Company HQ first: the engine measures C2 from a side's first command group. */
function company(prefix: string, x: number, y: number, facing: 1 | -1, prepared = false): ForceSpec[] {
  const f: ForceSpec[] = [
    { id: `${prefix}-COY`, kind: "command", echelon: "company", men: ORG.companyHq, at: { x, y: y - facing * 120 } },
  ];
  for (let p = 0; p < 3; p++) f.push(...platoon(`${prefix}${p + 1}`, x + (p - 1) * 300, y, facing, prepared));
  return f;
}

function single(id: string, x: number, y: number, men: number, prepared = false): ForceSpec {
  return { id, kind: "infantry", echelon: "squad", men, at: { x, y }, prepared };
}

const NORTH = 100;
const X = 1000;

/** BLUE starts in the north and advances south; RED holds or advances north. */
function layout(echelon: Echelon, kind: BattleKind): { blue: ForceSpec[]; red: ForceSpec[] } {
  if (kind === "meeting") {
    const south = NORTH + (echelon === "company" ? 800 : echelon === "platoon" ? 700 : 600);
    const make = (p: string, y: number, facing: 1 | -1) =>
      echelon === "squad" ? [single(`${p}-1`, X, y, ORG.squad)] : echelon === "platoon" ? platoon(p, X, y, facing) : company(p, X, y, facing);
    return { blue: make("B", NORTH, 1), red: make("R", south, -1) };
  }
  const south = NORTH + 700;
  const attacker = echelon === "squad" ? [single("B-1", X, NORTH, ORG.squad)] : echelon === "platoon" ? platoon("B", X, NORTH, 1) : company("B", X, NORTH, 1);
  const defender: ForceSpec[] =
    kind === "attack1"
      ? echelon === "squad" ? [single("R-1", X, south, ORG.squad, true)] : echelon === "platoon" ? platoon("R", X, south, -1, true) : company("R", X, south, -1, true)
      : kind === "attack2"
        ? echelon === "squad" ? [single("R-1", X, south, 5, true)]
          : echelon === "platoon" ? [single("R-1", X - 40, south, ORG.squad, true), single("R-2", X + 40, south, ORG.squad, true)]
            : [...platoon("R1", X - 150, south, -1, true), ...platoon("R2", X + 150, south, -1, true)]
        : echelon === "squad" ? [single("R-1", X, south, ORG.fireTeam, true)]
          : echelon === "platoon" ? [single("R-1", X, south, ORG.squad, true)]
            : platoon("R", X, south, -1, true);
  return { blue: attacker, red: defender };
}

export interface BattleOptions {
  morale: boolean;
  /** Put RED where BLUE would start and the reverse — separates side from position. */
  swap?: boolean;
  /** What is on trial in the engine (data/variants.ts). */
  variants?: RuleVariants;
  /** How both sides' squads fight (src/app/drill.ts). The plain script unless given. */
  drill?: SquadDrill;
  /**
   * What a position prepared before the battle starts with. `partial` is the
   * scenarios' convention today; `full` is the open question (docs/balance.md).
   */
  preparedCover?: "partial" | "full";
  /**
   * A fire plan for the attacker (not in a meeting): each turn, this many
   * shells and bombs on the objective — spread across the defender's
   * frontage, a pre-planned target that needs no sighting — until its nearest
   * fighting force is within `liftAt` metres of it (the fires lift). The
   * company's one mortar mission a turn on what it has seen goes on as before.
   */
  fires?: FirePlan;
  /** The defender's own mortar section, in an attack. */
  defenderFires?: DefenderFires;
  /**
   * Let either side call any weapon whatever the echelon — rules decision 37
   * switched off, to measure what it prevents. Otherwise both sides command
   * the battle's echelon, and a weapon it may not call is struck from the fire
   * plans (see {@link callableAt}).
   */
  anyEchelon?: boolean;
  /**
   * Mission planning for the defender (rules decision 38), in an attack.
   * `observationPosts`: its command groups watch as observation posts — or, at
   * squad, the squad itself. `alternateAt`: each of its prepared squads has
   * an alternate position prepared this many metres behind it, which the
   * drill's displacement goes to.
   */
  defenderPlan?: { observationPosts?: boolean; alternateAt?: number };
}

/**
 * Whether a commander at `echelon` may call `weapon` (rules decision 37): the
 * harness strikes the rest from a fire plan before the battle, as the game
 * would refuse them in it.
 */
export function callableAt(echelon: EngineEchelon, weapon: string): boolean {
  const floor = FIRE_SUPPORT_MIN_ECHELON[weapon];
  return !floor || ECHELON_RANK[echelon] >= ECHELON_RANK[floor];
}

/**
 * The attacker's fire support (rules decision 34): the fire missions its
 * company is assigned, called one at a time a weapon — a section or a battery
 * fires one mission at a time — on what it has seen of the defender, or until
 * then on the positions it is attacking, one after another, until it is within
 * `liftAt` metres of the objective. Then the fires lift: a check fire.
 */
export interface FirePlan {
  missions: FireAllotment[];
  liftAt: number;
  /**
   * The objective is a planned target: the attacker's guns are registered on
   * it before the battle (rules decision 32), at the centre of each position
   * it attacks — the points its missions aim at until it sees something.
   */
  registered?: boolean;
  /** How the rounds are fuzed (rules decision 31). Default impact. */
  fuze?: Fuze;
  /** Adjust fire (default) or fire for effect at once (rules decision 39). */
  method?: FireMethod;
}

/**
 * The defender's fire support: its assigned missions, called one at a time a
 * weapon on the nearest attacker it has seen. `registeredAt`: points on the
 * approach, so many metres in front of its line, registered before the
 * battle (rules decision 32), for its mortars.
 */
export interface DefenderFires {
  missions: FireAllotment[];
  registeredAt?: number[];
  /** Adjust fire (default) or fire for effect at once (rules decision 39). */
  method?: FireMethod;
}

/** Four mortar missions of the default rounds for effect, lifting at 400 m (⚠️ ours). */
export const FIRE_PLAN: FirePlan = { missions: [{ weapon: "mortar", missions: 4 }], liftAt: 400 };

/**
 * How a battle ended, by the game's own rule (`sideDefeated`). `broke`: the
 * loser's side broke (morale). `wiped`: every one of its fighting forces is
 * out. `both`: both sides went in the same step — a draw.
 */
export type Ending = "broke" | "wiped" | "both" | "timeout";

export interface BattleResult {
  winner: Side | "draw";
  ending: Ending;
  turns: number;
  men: Record<Side, number>;
  /** Men put out of the fight, by side. */
  down: Record<Side, number>;
  /** Men broken and still standing at the end, by side. */
  broken: Record<Side, number>;
  routs: number;
  surrenders: number;
  heroes: number;
  rallied: number;
  /** Force-turns spent suppressed and pinned, fighting forces only. */
  suppressedTurns: number;
  pinnedTurns: number;
  /** Turns on which RED won the initiative. */
  redFirst: number;
  /** Men put out by a hit, both sides together, by what hit them. */
  outBy: { smallArms: number; explosive: number };
}

const other = (s: Side): Side => (s === "RED" ? "BLUE" : "RED");

const out = (g: Game, side: Side): boolean => sideDefeated(g, side);

/** The enemy `u`'s side last saw nearest to it — by where it was seen, not where it is. */
function nearestKnown(g: Game, u: Unit): string | undefined {
  let best: { id: string; d: number } | undefined;
  for (const c of g.contactsFor(u.side)) {
    if (c.lastKnownNeutralized) continue;
    const d = distance(u.position, c.lastKnownPosition);
    if (!best || d < best.d) best = { id: c.unitId, d };
  }
  return best?.id;
}

/** One battle, played to an end or to {@link MAX_TURNS}. */
export function runBattle(seed: number, echelon: Echelon, kind: BattleKind, opts: BattleOptions): BattleResult {
  const laid = layout(echelon, kind);
  const callable = (weapon: string) => opts.anyEchelon || callableAt(echelon, weapon);
  // The defender's registered targets: on the line from its position toward
  // where the attacker starts. Swap relabels the sides, not the ground: the
  // defender stands where `laid.red` does whichever side it is.
  const defenderSide: Side = opts.swap ? "BLUE" : "RED";
  // The attacker's planned targets: the centre of each position it is
  // attacking, as its intelligence has them — one a defending platoon.
  const plannedTargets: Point[] = (() => {
    const byPosition = new Map<string, Point[]>();
    for (const f of laid.red.filter((f) => f.kind === "infantry")) {
      const key = f.id.split("-")[0]!;
      byPosition.set(key, [...(byPosition.get(key) ?? []), f.at]);
    }
    return [...byPosition.values()].map((ps) => ({
      x: ps.reduce((t, p) => t + p.x, 0) / ps.length,
      y: ps.reduce((t, p) => t + p.y, 0) / ps.length,
    }));
  })();
  const attackerSide = other(defenderSide);
  const registeredTargets = (() => {
    if (kind === "meeting") return [];
    const y0 = laid.red.find((f) => f.kind === "infantry")!.at.y;
    const toward = Math.sign(laid.blue.find((f) => f.kind === "infantry")!.at.y - y0);
    const defender = (callable("mortar") ? opts.defenderFires?.registeredAt ?? [] : []).map((m) => ({
      side: defenderSide,
      weapon: "mortar",
      at: { x: X, y: y0 + toward * m },
    }));
    const attacker = !opts.fires?.registered
      ? []
      : opts.fires.missions.filter((a) => callable(a.weapon)).flatMap((a) => plannedTargets.map((at) => ({ side: attackerSide, weapon: a.weapon, at })));
    return [...defender, ...attacker];
  })();
  // A side with fire missions assigned fires only those (rules decision 34).
  const fireSupport: Partial<Record<Side, FireAllotment[]>> = {};
  // A plan struck bare leaves the side as it would be without one, free bomb
  // and all, so its row compares with the baseline.
  const allot = (side: Side, list: FireAllotment[] | undefined) => {
    const kept = (list ?? []).filter((a) => callable(a.weapon));
    if (kept.length && kind !== "meeting") fireSupport[side] = kept;
  };
  allot(attackerSide, opts.fires?.missions);
  allot(defenderSide, opts.defenderFires?.missions);
  const gameOptions: GameOptions = {
    seed,
    morale: opts.morale,
    trackIntel: true,
    enforceC2: true,
    ...(opts.variants ? { variants: opts.variants } : {}),
    ...(registeredTargets.length ? { registeredTargets } : {}),
    ...(Object.keys(fireSupport).length ? { fireSupport } : {}),
    // Both players command the battle's echelon, whatever of it is on the map:
    // the platoon defending against a company is one of its company's.
    commandEchelon: { RED: echelon, BLUE: echelon },
    ...(opts.anyEchelon ? { fireSupportByEchelon: false } : {}),
  };
  const g = new Game(gameOptions);
  const relabel = (fs: ForceSpec[], to: "B" | "R") => fs.map((f) => ({ ...f, id: to + f.id.slice(1) }));
  const { blue, red } = opts.swap ? { blue: relabel(laid.red, "B"), red: relabel(laid.blue, "R") } : laid;
  for (const f of [...blue, ...red]) {
    const side: Side = f.id.startsWith("B") ? "BLUE" : "RED";
    const u =
      f.kind === "command"
        ? makeCommandGroup(f.id, side, f.echelon, f.at, f.men)
        : makeInfantry(f.id, side, f.echelon, f.at, f.men);
    if (f.prepared) u.baseCover = opts.preparedCover ?? "partial";
    g.addUnit(u);
  }
  if (opts.defenderPlan && kind !== "meeting") {
    const own = g.units.filter((u) => u.side === defenderSide);
    const posts = own.some((u) => u.kind === "command") ? own.filter((u) => u.kind === "command") : own;
    if (opts.defenderPlan.observationPosts) for (const u of posts) g.designateObservationPost(u.id);
    const back = opts.defenderPlan.alternateAt;
    if (back) {
      const toward = Math.sign((g.units.find((u) => u.side === attackerSide)?.position.y ?? 0) - own[0]!.position.y);
      for (const u of own) {
        if (u.kind === "infantry" && u.baseCover !== "none") {
          g.prepareAlternatePosition(u.id, { x: u.position.x, y: u.position.y - toward * back });
        }
      }
    }
  }

  const men = { RED: 0, BLUE: 0 };
  for (const u of g.units) men[u.side] += u.soldiers?.length ?? 0;
  const attackers: Side[] = kind === "meeting" ? ["RED", "BLUE"] : [opts.swap ? "RED" : "BLUE"];
  const lineOf = (fs: ForceSpec[]) => fs.find((f) => f.kind === "infantry")!.at.y;
  const objective: Record<Side, Point> = { BLUE: { x: X, y: lineOf(red) }, RED: { x: X, y: lineOf(blue) } };

  const r: BattleResult = {
    winner: "draw", ending: "timeout", turns: 0, men,
    down: { RED: 0, BLUE: 0 }, broken: { RED: 0, BLUE: 0 },
    routs: 0, surrenders: 0, heroes: 0, rallied: 0, suppressedTurns: 0, pinnedTurns: 0, redFirst: 0,
    outBy: { smallArms: 0, explosive: 0 },
  };
  const note = (reports: MoraleReport[]) => {
    for (const rep of reports) {
      if (rep.kind === "routed") r.routs++;
      if (rep.kind === "surrendered") r.surrenders++;
      if (rep.kind === "heroic") r.heroes++;
      if (rep.kind === "rallied") r.rallied += rep.soldiers ?? 0;
    }
  };
  const settle = (): boolean => {
    const blueOut = out(g, "BLUE");
    const redOut = out(g, "RED");
    if (!blueOut && !redOut) return false;
    if (blueOut && redOut) {
      r.winner = "draw";
      r.ending = "both";
      return true;
    }
    const loser: Side = blueOut ? "BLUE" : "RED";
    r.winner = other(loser);
    r.ending = g.sideBroken(loser) ? "broke" : "wiped";
    return true;
  };

  const drill = opts.drill ?? PLAIN_SCRIPT;
  const drillState = new DrillState();
  const tasks: Record<Side, DrillTask> = {
    BLUE: { side: "BLUE", attacking: attackers.includes("BLUE"), objective: objective.BLUE },
    RED: { side: "RED", attacking: attackers.includes("RED"), objective: objective.RED },
  };
  g.beginTurn();
  let liftedFires = false;
  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    r.turns = turn;
    const order = g.initiativeOrder;
    if (order[0] === "RED") r.redFirst++;

    // Targeting. The engine has already carried on the missions in hand.
    g.advanceToPhase("targeting");
    // A side with missions assigned calls the next when its weapon is free.
    const callMissions = (side: Side, aimAt: () => Point | undefined, fuze?: Fuze, method?: FireMethod) => {
      for (const a of fireSupport[side] ?? []) {
        if ((g.fireMissionsLeft(side, a.weapon) ?? 0) <= 0) continue;
        if (g.fireMissions.some((m) => m.side === side && m.weapon === a.weapon && m.status === "adjusting")) continue;
        const aim = aimAt();
        if (!aim) continue;
        // The guns stand 3 km behind the side's own forces.
        const own = g.units.filter((u) => u.side === side);
        const ownY = own.reduce((t, u) => t + u.position.y, 0) / Math.max(1, own.length);
        const back = ownY < aim.y ? -3000 : 3000;
        g.callForFire(side, a.weapon, aim, {
          firingFrom: { x: aim.x, y: ownY + back },
          ...(fuze ? { fuze } : {}),
          ...(method ? { method } : {}),
        });
      }
    };
    if (opts.fires && kind !== "meeting") {
      const goal = objective[attackerSide];
      const lifted = g.units
        .filter((u) => u.side === attackerSide && u.kind !== "command" && !u.neutralized)
        .some((u) => distance(u.position, goal) <= opts.fires!.liftAt);
      if (lifted && !liftedFires) {
        // The fires lift: whatever is still to come is checked.
        g.checkFire(attackerSide);
        liftedFires = true;
      }
      if (!lifted && !liftedFires) {
        // What it has seen of the defender, nearest the objective; until then
        // the objective itself, a point along its frontage for each mission.
        callMissions(attackerSide, () => {
          const seen = g
            .contactsFor(attackerSide)
            .filter((c) => !c.lastKnownNeutralized)
            .sort((p, q) => distance(p.lastKnownPosition, goal) - distance(q.lastKnownPosition, goal))[0];
          if (seen) return seen.lastKnownPosition;
          const called = g.fireMissions.filter((m) => m.side === attackerSide).length;
          return plannedTargets[called % plannedTargets.length]!;
        }, opts.fires.fuze, opts.fires.method);
      }
    }
    if (opts.defenderFires && kind !== "meeting") {
      callMissions(defenderSide, () => {
        const hq = g.units.find((u) => u.side === defenderSide && u.kind === "command" && !u.neutralized);
        const target = hq && nearestKnown(g, hq);
        return target ? g.contactFor(defenderSide, target)!.lastKnownPosition : undefined;
      }, undefined, opts.defenderFires.method);
    }
    // A company without missions assigned calls one mortar bomb a turn on the
    // nearest enemy it knows of, as the harness always has.
    if (echelon === "company") {
      for (const side of order) {
        if (fireSupport[side]) continue;
        const hq = g.units.find((u) => u.side === side && u.kind === "command" && !u.neutralized);
        const target = hq && nearestKnown(g, hq);
        if (!hq || !target) continue;
        const rear = side === (opts.swap ? "RED" : "BLUE") ? -500 : 500;
        g.queueIndirectFire("mortar", side, g.contactFor(side, target)!.lastKnownPosition, {
          firingFrom: { x: hq.position.x, y: hq.position.y + rear },
        });
      }
    }

    // Movement and fire are the squad drill's (src/app/drill.ts): the same
    // executor, working from the same fog-bound view, that will carry out a
    // simulated subordinate's orders.
    note(g.advanceToPhase("movement").morale);
    for (const side of order) drillMovement(g, tasks[side], drill, drillState);
    g.advanceToPhase("combat");
    for (const side of order) drillCombat(g, tasks[side], drill);
    for (const u of g.units) {
      if (u.kind === "command") continue;
      const s = u.suppression ?? 0;
      if (s >= 40) r.pinnedTurns++;
      else if (s >= 15) r.suppressedTurns++;
    }
    if (settle()) break;
    note(g.advanceToPhase("initiative").morale);
    if (settle()) break;
  }

  for (const u of g.units) {
    for (const s of u.soldiers ?? []) {
      if (s.neutralized) r.down[u.side]++;
      if (s.neutralized && s.outBy) r.outBy[s.outBy]++;
      else if (s.morale?.state === "broken") r.broken[u.side]++;
    }
  }
  return r;
}

/** What a cell of battles came to. Percentages are 0–100; counts are per battle. */
export interface CellSummary {
  echelon: Echelon;
  kind: BattleKind;
  morale: boolean;
  battles: number;
  men: Record<Side, number>;
  wins: Record<Side | "draw", number>;
  endings: Partial<Record<Ending, number>>;
  medianTurns: number;
  p10Turns: number;
  p90Turns: number;
  /** Mean share of the loser's men down, over decided battles. */
  loserDownPct: number;
  winnerDownPct: number;
  routs: number;
  surrenders: number;
  heroes: number;
  rallied: number;
  /** Of the force-turns spent suppressed or pinned, the share pinned. */
  pinnedPct: number;
  /** Share of turns RED won the initiative. */
  redFirstPct: number;
  /** Of the men put out by a hit, the share explosives put out. */
  explosivePct: number;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const quantile = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0;
};

export function summarise(results: BattleResult[], echelon: Echelon, kind: BattleKind, morale: boolean): CellSummary {
  const wins = { RED: 0, BLUE: 0, draw: 0 };
  const endings: Partial<Record<Ending, number>> = {};
  for (const x of results) {
    wins[x.winner]++;
    endings[x.ending] = (endings[x.ending] ?? 0) + 1;
  }
  const decided = results.filter((x): x is BattleResult & { winner: Side } => x.winner !== "draw");
  const turns = results.map((x) => x.turns);
  const pinned = results.reduce((a, x) => a + x.pinnedTurns, 0);
  const pressed = pinned + results.reduce((a, x) => a + x.suppressedTurns, 0);
  return {
    echelon, kind, morale,
    battles: results.length,
    men: results[0]?.men ?? { RED: 0, BLUE: 0 },
    wins, endings,
    medianTurns: quantile(turns, 0.5),
    p10Turns: quantile(turns, 0.1),
    p90Turns: quantile(turns, 0.9),
    loserDownPct: 100 * mean(decided.map((x) => x.down[other(x.winner)] / x.men[other(x.winner)])),
    winnerDownPct: 100 * mean(decided.map((x) => x.down[x.winner] / x.men[x.winner])),
    routs: mean(results.map((x) => x.routs)),
    surrenders: mean(results.map((x) => x.surrenders)),
    heroes: mean(results.map((x) => x.heroes)),
    rallied: mean(results.map((x) => x.rallied)),
    pinnedPct: pressed ? (100 * pinned) / pressed : 0,
    redFirstPct: (100 * results.reduce((a, x) => a + x.redFirst, 0)) / Math.max(1, results.reduce((a, x) => a + x.turns, 0)),
    explosivePct: (() => {
      const he = results.reduce((a, x) => a + x.outBy.explosive, 0);
      const all = he + results.reduce((a, x) => a + x.outBy.smallArms, 0);
      return all ? (100 * he) / all : 0;
    })(),
  };
}

/** A cell: `battles` battles on consecutive seeds from `firstSeed`. */
export function runCell(
  echelon: Echelon,
  kind: BattleKind,
  opts: BattleOptions & { battles: number; firstSeed?: number },
): CellSummary {
  const first = opts.firstSeed ?? 1000;
  const results = Array.from({ length: opts.battles }, (_, i) => runBattle(first + i, echelon, kind, opts));
  return summarise(results, echelon, kind, opts.morale);
}

/** One summary as a Markdown table row, matching {@link MARKDOWN_HEADER}. */
export function markdownRow(c: CellSummary): string {
  const pct = (n: number) => `${Math.round((100 * n) / c.battles)}%`;
  const endings = Object.entries(c.endings).map(([k, v]) => `${k} ${v}`).join(", ");
  return (
    `| ${c.kind} | ${c.echelon} | ${c.morale ? "on" : "off"} | ${c.men.BLUE} v ${c.men.RED} | ` +
    `${pct(c.wins.BLUE)} / ${pct(c.wins.RED)} / ${pct(c.wins.draw)} | ${endings} | ` +
    `${c.medianTurns} (${c.p10Turns}–${c.p90Turns}) | ${Math.round(c.loserDownPct)}% | ${Math.round(c.winnerDownPct)}% | ` +
    `${c.routs.toFixed(2)} | ${c.surrenders.toFixed(2)} | ${c.heroes.toFixed(2)} | ${c.rallied.toFixed(2)} | ${Math.round(c.pinnedPct)}% | ${Math.round(c.explosivePct)}% |`
  );
}

export const MARKDOWN_HEADER =
  "| Kind | Echelon | Morale | Men (B v R) | BLUE / RED / draw | Endings | Turns, median (p10–p90) | Loser down | Winner down | Routs | Surrenders | Heroes | Rallied | Pinned share | Out by HE |\n" +
  "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|";

/**
 * What the sweep compares. After the third round (2026-09-23) the only thing
 * still on trial is the rate at which a defender returns fire in an assault
 * (ruling 1); the wound-severity roll is a rule now (decision 26).
 */
export interface Configuration {
  name: string;
  variants: RuleVariants;
}

export const CONFIGURATIONS: readonly Configuration[] = ([undefined, 0.3, 0.5, 0.7] as const).map((reply) => ({
  name: `reply ${reply == null ? "none" : `${Math.round(reply * 100)}%`}`,
  variants: reply == null ? {} : { assaultReplyChance: reply },
}));

/**
 * What the sweep is judged against — written down **before** the first runs, so
 * the answer cannot be chosen to fit them (all ⚠️ ours, for the author to
 * accept or replace). They are the textbook planning figures for an attack on
 * a prepared position:
 *
 * - at 1:1 the defender should hold: the attacker wins **at most 30%**;
 * - at about 2:1 it should be a real fight: the attacker wins **30–70%**;
 * - at 3–4:1 the attack should succeed: the attacker wins **at least 70%**;
 * - and a winning attacker at 3–4:1 should pay for it: **10–30%** of his men
 *   down, where "as it stands" pays 0–8%.
 *
 * Each echelon is judged on its own; a configuration's score is how many of
 * the twelve targets (four at each of three echelons) it meets.
 */
export const TARGETS = {
  attack1MaxWin: 30,
  attack2Win: [30, 70] as const,
  attack3MinWin: 70,
  attack3AttackerDown: [10, 30] as const,
} as const;

export interface Verdict {
  echelon: Echelon;
  attack1Win: number;
  attack2Win: number;
  attack3Win: number;
  attack3AttackerDown: number;
  /** Of the men put out by a hit in the three attacks, the share explosives put out. */
  explosivePct: number;
  met: number;
}

/** Judge one configuration at one echelon against {@link TARGETS}. Morale on, as the game is played. */
export function judge(
  echelon: Echelon,
  variants: RuleVariants,
  battles: number,
  preparedCover: "partial" | "full" = "partial",
  drill?: SquadDrill,
  fires?: FirePlan,
  defenderFires?: DefenderFires,
  anyEchelon = false,
  defenderPlan?: BattleOptions["defenderPlan"],
): Verdict {
  const cell = (kind: BattleKind) =>
    runCell(echelon, kind, {
      morale: true, variants, battles, preparedCover, ...(drill ? { drill } : {}), ...(fires ? { fires } : {}),
      ...(defenderFires ? { defenderFires } : {}), ...(anyEchelon ? { anyEchelon } : {}),
      ...(defenderPlan ? { defenderPlan } : {}),
    });
  const a1 = cell("attack1");
  const a2 = cell("attack2");
  const a3 = cell("attack3");
  const win = (c: CellSummary) => (100 * c.wins.BLUE) / c.battles;
  const attack3AttackerDown = a3.winnerDownPct;
  const explosivePct = (a1.explosivePct + a2.explosivePct + a3.explosivePct) / 3;
  const v = { echelon, attack1Win: win(a1), attack2Win: win(a2), attack3Win: win(a3), attack3AttackerDown, explosivePct };
  const met =
    Number(v.attack1Win <= TARGETS.attack1MaxWin) +
    Number(v.attack2Win >= TARGETS.attack2Win[0] && v.attack2Win <= TARGETS.attack2Win[1]) +
    Number(v.attack3Win >= TARGETS.attack3MinWin) +
    Number(attack3AttackerDown >= TARGETS.attack3AttackerDown[0] && attack3AttackerDown <= TARGETS.attack3AttackerDown[1]);
  return { ...v, met };
}
