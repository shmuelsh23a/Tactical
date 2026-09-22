import {
  Game,
  distance,
  makeCommandGroup,
  makeInfantry,
  type GameOptions,
  type MoraleReport,
  type Point,
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

/**
 * A game whose initiative ties are rerolled rather than given to the side
 * listed first — an experiment for measuring what the tie-break is worth, not
 * a rule. It draws a different number of dice, so it is never mixed with the
 * ordinary game in one comparison.
 */
class FairTiesGame extends Game {
  override rollInitiative(): Side[] {
    for (;;) {
      const a = this.rng.die(10);
      const b = this.rng.die(10);
      if (a !== b) return a > b ? ["RED", "BLUE"] : ["BLUE", "RED"];
    }
  }
}

export interface BattleOptions {
  morale: boolean;
  /** Put RED where BLUE would start and the reverse — separates side from position. */
  swap?: boolean;
  /** Reroll initiative ties (see {@link FairTiesGame}). */
  fairTies?: boolean;
}

/**
 * How a battle ended. `broke`: the loser's side broke (morale). `wiped`: every
 * one of its units is out, which is the game's own rule. `fightersGone`: every
 * *fighting* force is out while a command group survives — the game itself
 * would play on (`sideDefeated` counts command groups; see docs/balance.md), so
 * the harness scores it and says so. `both`: both sides went in the same step.
 */
export type Ending = "broke" | "wiped" | "fightersGone" | "both" | "timeout";

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
}

const other = (s: Side): Side => (s === "RED" ? "BLUE" : "RED");

function fighting(g: Game, side: Side): Unit[] {
  return g.units.filter((u) => u.side === side && u.kind !== "command");
}

function outByRule(g: Game, side: Side): boolean {
  return g.units.filter((u) => u.side === side).every((u) => u.neutralized) || g.sideBroken(side);
}

function out(g: Game, side: Side): boolean {
  return outByRule(g, side) || fighting(g, side).every((u) => u.neutralized || u.surrendered);
}

function toward(from: Point, to: Point, d: number): Point {
  const r = distance(from, to);
  if (r <= d) return { ...to };
  return { x: from.x + ((to.x - from.x) / r) * d, y: from.y + ((to.y - from.y) / r) * d };
}

function nearestKnown(g: Game, u: Unit): Unit | undefined {
  let best: Unit | undefined;
  for (const e of g.units) {
    if (e.side === u.side || e.neutralized || e.surrendered || !g.knows(u.side, e.id)) continue;
    if (!best || distance(u.position, e.position) < distance(u.position, best.position)) best = e;
  }
  return best;
}

/** One battle, played to an end or to {@link MAX_TURNS}. */
export function runBattle(seed: number, echelon: Echelon, kind: BattleKind, opts: BattleOptions): BattleResult {
  const gameOptions: GameOptions = { seed, morale: opts.morale, trackIntel: true, enforceC2: true };
  const g = opts.fairTies ? new FairTiesGame(gameOptions) : new Game(gameOptions);
  const laid = layout(echelon, kind);
  const relabel = (fs: ForceSpec[], to: "B" | "R") => fs.map((f) => ({ ...f, id: to + f.id.slice(1) }));
  const { blue, red } = opts.swap ? { blue: relabel(laid.red, "B"), red: relabel(laid.blue, "R") } : laid;
  for (const f of [...blue, ...red]) {
    const side: Side = f.id.startsWith("B") ? "BLUE" : "RED";
    const u =
      f.kind === "command"
        ? makeCommandGroup(f.id, side, f.echelon, f.at, f.men)
        : makeInfantry(f.id, side, f.echelon, f.at, f.men);
    if (f.prepared) u.baseCover = "partial";
    g.addUnit(u);
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
    r.ending = g.sideBroken(loser) ? "broke" : outByRule(g, loser) ? "wiped" : "fightersGone";
    return true;
  };

  const contact = { RED: false, BLUE: false };
  g.beginTurn();
  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    r.turns = turn;
    const order = g.initiativeOrder;
    if (order[0] === "RED") r.redFirst++;

    // Targeting: a company calls one mortar mission a turn on the nearest enemy it knows of.
    g.advanceToPhase("targeting");
    if (echelon === "company") {
      for (const side of order) {
        const hq = g.units.find((u) => u.side === side && u.kind === "command" && !u.neutralized);
        const target = hq && nearestKnown(g, hq);
        if (!hq || !target) continue;
        const rear = side === (opts.swap ? "RED" : "BLUE") ? -500 : 500;
        g.queueIndirectFire("mortar", side, g.contactFor(side, target.id)!.lastKnownPosition, {
          firingFrom: { x: hq.position.x, y: hq.position.y + rear },
        });
      }
    }

    // Movement: fire and movement. Out of contact everyone advances; in contact
    // the two halves alternate, one bounding while the other is the base of fire.
    note(g.advanceToPhase("movement").morale);
    for (const side of order) {
      const forces = fighting(g, side);
      contact[side] ||= g.contactsFor(side).length > 0;
      if (attackers.includes(side)) {
        forces.forEach((u, i) => {
          if (u.neutralized || u.routing || u.surrendered) return;
          const target = nearestKnown(g, u);
          if (target && distance(u.position, target.position) <= 30) {
            g.setStandingOrder(u.id, { gait: "normal" });
            return;
          }
          const bounding = !contact[side] || (i + turn) % 2 === 0;
          const aim = target ? target.position : objective[side];
          g.setStandingOrder(
            u.id,
            bounding ? { gait: contact[side] ? "run" : "normal", destination: toward(u.position, aim, 100) } : { gait: "normal" },
          );
        });
      }
      g.executeStandingOrders(side);
      // Command groups follow 80 m behind the centre of their fighting forces.
      const live = forces.filter((u) => !u.neutralized && !u.routing);
      for (const hq of g.units.filter((u) => u.side === side && u.kind === "command" && !u.neutralized && !u.routing)) {
        if (live.length === 0) break;
        const cx = live.reduce((s, u) => s + u.position.x, 0) / live.length;
        const cy = live.reduce((s, u) => s + u.position.y, 0) / live.length;
        const north = objective[side].y > cy;
        const want = { x: cx, y: cy + (north ? -80 : 80) };
        if (distance(hq.position, want) < 5) continue;
        try {
          g.moveUnit(hq.id, toward(hq.position, want, 25));
        } catch {
          // Pinned, blocked, out of budget: it stays where it is.
        }
      }
    }

    // Combat: fire at the nearest enemy known and in reach; assault inside 25 m.
    // A defender with nothing to shoot at covers its front (חיפוי).
    g.advanceToPhase("combat");
    for (const side of order) {
      const defending = !attackers.includes(side);
      for (const u of g.units.filter((x) => x.side === side)) {
        if (u.neutralized || u.routing || u.surrendered) continue;
        const target = nearestKnown(g, u);
        const inReach = !!target && distance(u.position, target.position) <= 400 && g.hasLineOfSight(u, target);
        if (defending && !inReach) {
          if (!u.covering && !u.firedThisTurn) {
            try {
              g.setCovering(u.id, true);
            } catch {
              // Nobody fit to cover with.
            }
          }
          continue;
        }
        if (defending && u.covering) g.setCovering(u.id, false);
        if (!target || !inReach) continue;
        if (distance(u.position, target.position) <= 25 && u.kind !== "command") g.assault(u.id, target.id, 2);
        else g.fire(u.id, target.id, { weapon: "smallArms" });
      }
    }
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
    `${c.routs.toFixed(2)} | ${c.surrenders.toFixed(2)} | ${c.heroes.toFixed(2)} | ${c.rallied.toFixed(2)} | ${Math.round(c.pinnedPct)}% |`
  );
}

export const MARKDOWN_HEADER =
  "| Kind | Echelon | Morale | Men (B v R) | BLUE / RED / draw | Endings | Turns, median (p10–p90) | Loser down | Winner down | Routs | Surrenders | Heroes | Rallied | Pinned share |\n" +
  "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|";
