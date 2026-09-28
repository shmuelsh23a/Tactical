import type { RangeBand } from "../geometry.js";
import { EXPLOSIVES, type ExplosiveWeapon } from "./explosives.js";
import { WOUND_SEVERITY } from "./casualties.js";

/**
 * How long a turn lasts — **60 seconds** (author, 2026-09-28, rules decision
 * 40). The document never said. It is what lets a rate in the rules be read
 * against a rate in the sources: a rifleman's shots a minute, a gun's rounds a
 * minute, a squad's losses a minute. The document's movement (50 m a turn
 * walking, 100 m running) reads as tactical movement in bounds at this scale.
 */
export const TURN_SECONDS = 60;

/**
 * Which blast, tank-gun and rate-of-fire figures a game plays (rules
 * decisions 41–42):
 *
 * - `document`: the rules document's tables, as transcribed in
 *   `explosives.ts`.
 * - `research`: the same weapons, with the reach of their blast against men,
 *   the tank gun's reach, and their rates of fire set from published data
 *   (docs/validation.md).
 *
 * A new game plays `research`. A recording made before the decision replays
 * with `document`, so the battle it holds still plays as it was fought.
 */
export type Lethality = "document" | "research";
export const LETHALITIES: readonly Lethality[] = ["document", "research"];

/**
 * The ground a force's men stand on, as a disc — **25 m radius**, a squad's
 * 50 m frontage (ours; the same figure as `PREPARED_POSITION_REACH_M`). The
 * engine puts a force at one point; a shell's lethal area covers only part of
 * the ground its men are spread over, and this is how much ground that is.
 */
export const FORCE_FOOTPRINT_RADIUS_M = 25;

/**
 * The share of hits that put a man out of the fight: a serious wound or
 * worse on the severity roll (rules decisions 26–27) — 6 in 10. A lethal area
 * counts men incapacitated, so a man's chance to be **hit** is the chance to
 * be incapacitated divided by this; the light wounds come on top, as they do
 * in the field.
 */
export const INCAPACITATED_PER_HIT = (10 - WOUND_SEVERITY.light) / 10;

/**
 * Lethal area against men **standing in the open**, impact fuze, in m² — the
 * area whose men, all counted, are incapacitated as if everyone inside it
 * were and nobody outside it. Posture, cover and fuze then scale it as
 * before (`SHELL_VS_MEN`, rules decisions 29–31). Sources in
 * docs/validation.md.
 *
 * - `artillery`: **971 m²**, the 155 mm M107 at 60° impact (open
 *   compilations of the JMEM figures; docs/balance.md). The 105 mm's 390 m²
 *   agrees with a peer-reviewed calculation of its lethal radius (10.6 m,
 *   William 2016).
 * - `mortar`: **476 m²** — ours, derived: the 155 mm's area scaled by the
 *   square of the published effective casualty radii, 35 m for an 81 mm bomb
 *   and 50 m for a 155 mm shell. The document's mortar has no calibre; the
 *   81 mm is the reference.
 * - `tankRound`: **390 m²** — ours, a proxy: the 105 mm shell's area. No open
 *   figure for a tank's HE round against men was found.
 * - `rifleGrenade`: **79 m²**, a 5 m radius — the 40 mm M433's published
 *   casualty radius.
 * - `rpgVsInfantry`: **154 m²**, a 7 m radius — ours, unverified: between the
 *   40 mm grenade and the 105 mm shell. No open figure was found.
 */
export const LETHAL_AREA_M2: Readonly<Record<string, number>> = {
  artillery: 971,
  mortar: 476,
  tankRound: 390,
  rifleGrenade: 79,
  rpgVsInfantry: 154,
};

/**
 * The tank gun's chance to hit by range, with modern fire control. The
 * document's 90% ends at 300 m and nothing is fired beyond 1,500 m; a
 * stabilised gun with a laser rangefinder and a ballistic computer is rated
 * at 90–95% on a stationary target to about 2,000 m (docs/validation.md).
 * The 2,001–3,000 m band is ours: the sources give no figure there.
 */
export const RESEARCH_TANK_TO_HIT: readonly RangeBand[] = [
  { maxRange: 2000, value: 0.9 },
  { maxRange: 3000, value: 0.5 },
];

/**
 * A weapon's rate of fire a turn, as a range (rules decision 42, revised by
 * the author the same day: "these are firing range numbers — no tank fires 5
 * rounds a minute"):
 *
 * - `low`, the **most likely** rate in a fight: the lowest figure there is —
 *   the document's where it gave one, the published sustained rate where that
 *   is lower. A crew in a fight also has to find, lay on and watch its target.
 * - `high`, the **outlier**: the highest published rate, the range's figure a
 *   fresh crew can touch for a minute.
 *
 * | Weapon | Low | High | Sources (docs/validation.md) |
 * |---|---|---|---|
 * | `mortar`, a tube | 3 (document) | 30 (81 mm M252, short periods) | sustained 8–16 |
 * | `artillery`, a gun | 2 (document; M777 sustained) | 4 (M777 maximum) | |
 * | `tankRound` | 1 (document) | 7 (manual loader, practical) | |
 * | `rifleGrenade` | 1 (document) | 7 (40 mm, aimed) | |
 * | `rpgVsInfantry`, `rpgVsArmor` | 1 (document) | 6 (gunner and assistant) | |
 *
 * What a crew fires in a turn is drawn by {@link rollRate}: the low rate most
 * often, the high one rarely, with more of the upper end while the crew is
 * fresh and less as it tires. Nothing counts ammunition yet (backlog 12).
 */
export interface RateOfFire {
  low: number;
  high: number;
}

export const RATE_OF_FIRE: Readonly<Record<string, RateOfFire>> = {
  mortar: { low: 3, high: 30 },
  artillery: { low: 2, high: 4 },
  tankRound: { low: 1, high: 7 },
  rifleGrenade: { low: 1, high: 7 },
  rpgVsInfantry: { low: 1, high: 6 },
  rpgVsArmor: { low: 1, high: 6 },
};

/**
 * Turns of firing that take a crew from fresh to tired (ours): ten minutes of
 * sustained fire. A crew that has fired on none is fresh.
 */
export const FATIGUE_TURNS = 10;

/**
 * How heavy the upper tail is (ours): each round above the low rate is this
 * much less likely than the one below it — **0.6** for a fresh crew, **0.15**
 * for a tired one, in between on the way. So a fresh tank crew fires 1 round
 * a turn 41% of the time and 3 or more 34% of the time (averaging 2.3); a
 * tired one fires 1 round 85% of the time (averaging 1.2).
 */
export const TAIL_WEIGHT = { fresh: 0.6, tired: 0.15 } as const;

/** How fresh a crew is, 1 to 0, after `turnsFiring` turns of firing. */
export function freshness(turnsFiring: number): number {
  return Math.max(0, 1 - turnsFiring / FATIGUE_TURNS);
}

/** The share of each rate from `low` to `high` a crew this fresh fires: a geometric tail, cut at `high`. */
export function rateDistribution(rate: RateOfFire, fresh: number): number[] {
  const q = TAIL_WEIGHT.tired + (TAIL_WEIGHT.fresh - TAIL_WEIGHT.tired) * Math.min(1, Math.max(0, fresh));
  const weights = Array.from({ length: rate.high - rate.low + 1 }, (_, k) => q ** k);
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => w / total);
}

/** The average rate a crew this fresh fires. */
export function meanRate(rate: RateOfFire, fresh: number): number {
  return rateDistribution(rate, fresh).reduce((sum, p, k) => sum + p * (rate.low + k), 0);
}

/**
 * The rounds a crew fires this turn, drawn from {@link rateDistribution} with
 * one number `u` in [0, 1) — one rng draw, whatever the range.
 */
export function rollRate(rate: RateOfFire, fresh: number, u: number): number {
  let acc = 0;
  const dist = rateDistribution(rate, fresh);
  for (let k = 0; k < dist.length; k++) {
    acc += dist[k]!;
    if (u < acc) return rate.low + k;
  }
  return rate.high;
}

/**
 * Small arms in a fight hit a third as often as the table (rules decision 43,
 * the author, 2026-09-28: "I want the numbers to reflect 75% HE casualties").
 * Men under fire hit 7 to 10 times less than the same men in trials (Rowland
 * 1987); the table's figures are not trial figures either, so the factor is
 * the smallest that brings the explosives' share of losses to the sources'
 * 72–78% in the company battles (docs/validation.md, *Calibration*). A
 * coaxial gun and the assault keep their tables.
 */
export const SMALL_ARMS_COMBAT_FACTOR = 1 / 3;

/**
 * Rounds a mission fires for effect unless its allotment says otherwise, on
 * the research figures (rules decision 43): **24 for a mortar**, 8 bombs a
 * tube from a 3-tube section — doctrine asks "seldom less than five rounds for
 * each mortar" (FM 7-90) — and **6 for artillery**, as decision 36. The
 * document's figures (`DEFAULT_ROUNDS_FOR_EFFECT`: 12 and 6) play under
 * `document`.
 */
export const RESEARCH_ROUNDS_FOR_EFFECT: Readonly<Record<string, number>> = { mortar: 24, artillery: 6 };

/**
 * Tubes in the fire unit that answers a mission (rules decision 36's own
 * reading): a **3-tube** mortar section and a **6-gun** battery.
 */
export const FIRE_UNIT_TUBES: Readonly<Record<string, number>> = { mortar: 3, artillery: 6 };

/** The width of one derived band. */
const BAND_STEP_M = 10;

/** The area two discs of radius `r` and `R`, `d` apart, have in common. */
export function discOverlap(r: number, R: number, d: number): number {
  if (d >= r + R) return 0;
  if (d <= Math.abs(R - r)) return Math.PI * Math.min(r, R) ** 2;
  const a = r * r * Math.acos((d * d + r * r - R * R) / (2 * d * r));
  const b = R * R * Math.acos((d * d + R * R - r * r) / (2 * d * R));
  const c = 0.5 * Math.sqrt((-d + r + R) * (d + r - R) * (d - r + R) * (d + r + R));
  return a + b - c;
}

/**
 * A man's chance to be hit when a round with this lethal area lands `d`
 * metres from his force's point: the share of the force's footprint the
 * lethal area covers, divided by {@link INCAPACITATED_PER_HIT}.
 */
export function hitChanceAt(lethalAreaM2: number, d: number): number {
  const r = Math.sqrt(lethalAreaM2 / Math.PI);
  const R = FORCE_FOOTPRINT_RADIUS_M;
  return Math.min(1, discOverlap(r, R, d) / (Math.PI * R * R) / INCAPACITATED_PER_HIT);
}

/**
 * The blast bands a lethal area comes to: 10 m rings out to where it stops
 * reaching the footprint, each the chance averaged over its ring's area (a
 * round is as likely to land anywhere in the ring), to two places. A ring
 * worth less than 1% is left off.
 */
export function blastBandsFromLethalArea(lethalAreaM2: number): RangeBand[] {
  const edge = Math.sqrt(lethalAreaM2 / Math.PI) + FORCE_FOOTPRINT_RADIUS_M;
  const bands: RangeBand[] = [];
  for (let a = 0; a < edge; a += BAND_STEP_M) {
    const b = Math.min(a + BAND_STEP_M, edge);
    const steps = 200;
    let num = 0;
    let den = 0;
    for (let i = 0; i < steps; i++) {
      const x = a + ((b - a) * (i + 0.5)) / steps;
      num += hitChanceAt(lethalAreaM2, x) * x;
      den += x;
    }
    const value = Math.round((100 * num) / den) / 100;
    if (value >= 0.01) bands.push({ maxRange: Math.ceil(b), value });
  }
  return bands;
}

/** Each weapon's entry as the research figures change it. Built once. */
const RESEARCH_EXPLOSIVES: Readonly<Record<string, ExplosiveWeapon>> = Object.fromEntries(
  Object.entries(EXPLOSIVES).map(([key, w]) => {
    const area = LETHAL_AREA_M2[key];
    return [
      key,
      {
        ...w,
        ...(area !== undefined ? { blastBands: blastBandsFromLethalArea(area) } : {}),
        ...(key === "tankRound" ? { toHitBands: RESEARCH_TANK_TO_HIT } : {}),
      },
    ];
  }),
);

/**
 * A weapon as a game with this lethality plays it. A weapon the research
 * figures do not touch — a hand grenade, a charge, an RPG against armour — is
 * the document's under both.
 */
export function explosiveFor(key: string, lethality: Lethality): ExplosiveWeapon | undefined {
  return lethality === "research" ? RESEARCH_EXPLOSIVES[key] : EXPLOSIVES[key];
}
