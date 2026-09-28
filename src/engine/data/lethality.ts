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
 * Which blast and tank-gun figures a game plays (rules decision 41):
 *
 * - `document`: the rules document's tables, as transcribed in
 *   `explosives.ts`.
 * - `research`: the same weapons, with the reach of their blast against men,
 *   and the tank gun's reach, set from published data (docs/validation.md).
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
