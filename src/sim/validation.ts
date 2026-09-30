import {
  FORCE_FOOTPRINT_RADIUS_M,
  INCAPACITATED_PER_HIT,
  LETHAL_AREA_M2,
  Rng,
  TURN_SECONDS,
  makeInfantry,
  resolveBlast,
  resolveDirectFire,
  resolveDirectExplosive,
  makeVehicle,
  type CoverState,
  type Lethality,
  type Side,
} from "../engine/index.js";
import { CALIBRATED_DEFENDER_FIRES, CALIBRATED_FIRE_PLAN, runBattle, type BattleKind, type Echelon } from "./balance.js";

/**
 * The validation harness: the game's numbers measured the way the sources
 * measure them, so the two can be set side by side (docs/validation.md).
 *
 * The balance harness asks whether a battle comes out as a planner expects;
 * this asks whether the pieces it is made of are the size the research says.
 * Three measurements, each one the sources report:
 *
 * - **Casualties a round**: one round landing on or near a squad standing in
 *   the open, against what the round's published lethal area predicts.
 * - **Casualties a minute of rifle fire**: a squad firing one turn (60 s,
 *   rules decision 40) at a squad in the open or in cover.
 * - **Losses when a force gives up**, and what share of them explosives
 *   caused, from the balance harness's battles, against the historical
 *   breakpoints and wound statistics.
 *
 * Everything draws from seeded rngs, so a run is reproducible.
 */

/** The squad every measurement is taken against: nine men, a NATO rifle squad. */
export const SQUAD_MEN = 9;

export interface RoundMeasurement {
  weapon: string;
  lethality: Lethality;
  /** Men put out (serious or worse) by one round on the squad's point. */
  onTarget: number;
  /** Men put out by one round landing anywhere within 50 m of it. */
  within50: number;
  /** What the lethal area predicts for a round on the point, where one is published. */
  predictedOnTarget?: number;
}

/** A squad in the open, fresh, at the origin. */
const squad = (id: string, side: Side = "RED") => makeInfantry(id, side, "squad", { x: 0, y: 0 }, SQUAD_MEN);

/**
 * What one round does to a squad standing in the open (no posture or cover
 * factor: the lethal areas are for standing men), averaged over `trials`.
 */
export function measureRound(weapon: string, lethality: Lethality, trials = 2000, seed = 1): RoundMeasurement {
  const rng = new Rng(seed);
  const land = (at: { x: number; y: number }) => {
    const target = squad("T");
    return resolveBlast(rng, weapon, at, [target], 1, undefined, lethality).targets.reduce((n, t) => n + t.newCasualties, 0);
  };
  let onTarget = 0;
  let within50 = 0;
  for (let i = 0; i < trials; i++) {
    onTarget += land({ x: 0, y: 0 });
    // Uniform over the disc: the radius goes as the square root.
    const r = 50 * Math.sqrt(rng.next());
    const a = 2 * Math.PI * rng.next();
    within50 += land({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  const area = LETHAL_AREA_M2[weapon];
  const footprint = Math.PI * FORCE_FOOTPRINT_RADIUS_M ** 2;
  return {
    weapon,
    lethality,
    onTarget: onTarget / trials,
    within50: within50 / trials,
    ...(area !== undefined ? { predictedOnTarget: (Math.min(area, footprint) / footprint) * SQUAD_MEN } : {}),
  };
}

export interface RifleMeasurement {
  range: number;
  lethality: Lethality;
  cover: CoverState;
  /** Men put out a minute (one turn) by a squad's fire. */
  casualtiesPerMinute: number;
  /** Hits a firer scores a minute. */
  hitsPerFirerMinute: number;
}

/** One squad firing one turn at another, stationary, at `range`, averaged over `trials`. */
export function measureRifleFire(
  range: number,
  cover: CoverState,
  lethality: Lethality = "research",
  trials = 2000,
  seed = 1,
): RifleMeasurement {
  const rng = new Rng(seed);
  let casualties = 0;
  let hits = 0;
  for (let i = 0; i < trials; i++) {
    const firer = makeInfantry("F", "BLUE", "squad", { x: 0, y: range }, SQUAD_MEN);
    const r = resolveDirectFire(rng, firer, squad("T"), { weapon: "smallArms", cover, turn: 1, lethality });
    casualties += r.newCasualties;
    hits += r.hits;
  }
  return {
    range,
    lethality,
    cover,
    casualtiesPerMinute: casualties / trials,
    hitsPerFirerMinute: hits / trials / SQUAD_MEN,
  };
}

export interface BreakMeasurement {
  echelon: Echelon;
  kind: BattleKind;
  lethality: Lethality;
  /** Whether both sides had the calibration's fire. */
  calibratedFires: boolean;
  /** The attacker's wins, of all battles. */
  attackerWins: number;
  battles: number;
  /** How the decided battles ended: the loser broke, or was wiped out. */
  broke: number;
  wiped: number;
  /** The loser's losses, as a share of its men, when it broke: median and the 10th–90th percentiles. */
  lossAtBreak?: Spread;
  /** The same, for a loser that was attacking (every loser, in a meeting)… */
  attackerLossAtBreak?: Spread;
  /** …and for one that was defending. */
  defenderLossAtBreak?: Spread;
  /** The share of men put out by explosives, both sides together. */
  explosiveShare: number;
  /** Battles fought, in minutes: the median. */
  medianMinutes: number;
}

const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
};

export interface Spread {
  p10: number;
  median: number;
  p90: number;
  /** How many battles it is taken over. */
  n: number;
}

const spread = (xs: number[]): Spread | undefined =>
  xs.length ? { p10: quantile(xs, 0.1), median: quantile(xs, 0.5), p90: quantile(xs, 0.9), n: xs.length } : undefined;

/** Losses at the point a side gives up, from `battles` harness battles with morale on. */
export function measureBreaks(
  echelon: Echelon,
  kind: BattleKind,
  lethality: Lethality,
  battles = 100,
  firstSeed = 1000,
  calibratedFires = false,
): BreakMeasurement {
  // The fire decision 43 was calibrated on, both sides; a meeting has none.
  const fires = calibratedFires ? { fires: CALIBRATED_FIRE_PLAN, defenderFires: CALIBRATED_DEFENDER_FIRES } : {};
  const results = Array.from({ length: battles }, (_, i) =>
    // The game's rules (2026-09-30): decisions 51–55 on, an eye's planning
    // error, a scout from each attacking platoon (balance.ts, runBattle).
    runBattle(firstSeed + i, echelon, kind, { morale: true, lethality, ...fires }),
  );
  const brokeLosses: number[] = [];
  const attackerLosses: number[] = [];
  const defenderLosses: number[] = [];
  let broke = 0;
  let wiped = 0;
  let he = 0;
  let all = 0;
  for (const r of results) {
    he += r.outBy.explosive;
    all += r.outBy.explosive + r.outBy.smallArms;
    if (r.winner === "draw") continue;
    const loser: Side = r.winner === "RED" ? "BLUE" : "RED";
    if (r.ending === "broke") {
      broke++;
      const loss = r.down[loser] / r.men[loser];
      brokeLosses.push(loss);
      // The harness's attacker is BLUE; in a meeting both attack.
      (kind === "meeting" || loser === "BLUE" ? attackerLosses : defenderLosses).push(loss);
    } else if (r.ending === "wiped") wiped++;
  }
  return {
    echelon,
    kind,
    lethality,
    calibratedFires,
    attackerWins: results.filter((r) => r.winner === "BLUE").length,
    battles,
    broke,
    wiped,
    ...(brokeLosses.length ? { lossAtBreak: spread(brokeLosses)! } : {}),
    ...(attackerLosses.length ? { attackerLossAtBreak: spread(attackerLosses)! } : {}),
    ...(defenderLosses.length ? { defenderLossAtBreak: spread(defenderLosses)! } : {}),
    explosiveShare: all ? he / all : 0,
    medianMinutes: (quantile(results.map((r) => r.turns), 0.5) * TURN_SECONDS) / 60,
  };
}

export interface LauncherMeasurement {
  weapon: string;
  lethality: Lethality;
  range: number;
  /** Rounds fired in the minute. */
  rounds: number;
  /** Men put out of a squad of nine standing in the open, in the minute. */
  casualtiesPerMinute: number;
}

/**
 * A minute (one turn) of a direct-fire launcher at a squad standing in the
 * open (rules decision 42): its rate of fire, each round rolled to hit.
 */
export function measureLauncherMinute(weapon: string, lethality: Lethality, range: number, trials = 2000, seed = 1): LauncherMeasurement {
  const rng = new Rng(seed);
  let casualties = 0;
  let rounds = 0;
  for (let i = 0; i < trials; i++) {
    const firer =
      weapon === "tankRound"
        ? makeVehicle("F", "BLUE", { x: 0, y: range })
        : makeInfantry("F", "BLUE", "squad", { x: 0, y: range }, SQUAD_MEN);
    const r = resolveDirectExplosive(rng, weapon, firer, squad("T"), { lethality, turn: 1 });
    rounds += r.rounds ?? (r.fired ? 1 : 0);
    casualties += (r.blast?.targets ?? []).reduce((n, t) => n + t.newCasualties, 0);
  }
  return { weapon, lethality, range, rounds: rounds / trials, casualtiesPerMinute: casualties / trials };
}

/** The launchers measured a minute at a time, and the range each is measured at. */
export const LAUNCHERS: readonly { weapon: string; range: number }[] = [
  { weapon: "tankRound", range: 500 },
  { weapon: "rpgVsInfantry", range: 150 },
  { weapon: "rifleGrenade", range: 80 },
];

/** The weapons whose rounds are measured: those with a published lethal area. */
export const MEASURED_WEAPONS: readonly string[] = Object.keys(LETHAL_AREA_M2);

/** The share of hits that put a man out — what turns a lethal area into hits (rules decision 41). */
export { INCAPACITATED_PER_HIT };
