import type { CoverState } from "./directFire.js";
import type { RangeBand } from "../geometry.js";

/**
 * Buildings under fire (rules decision 76) — **not the document's**, which
 * says nothing of structures. The sources are on docs/validation.md,
 * *Buildings, windows and rooms*; most are FM 3-06.11 (Combined Arms
 * Operations in Urban Terrain), ch. 7, read through search extracts.
 *
 * A building is **intact**, **damaged** (walls breached, the roof holed:
 * still full cover, but no roof against a shell), or **rubble** (no roof;
 * cover and height as below). HE wears it down in damage points; small arms
 * and the 40 mm grenade do nothing.
 */
export type StructureState = "intact" | "damaged" | "rubble";

/**
 * Damage points at which a house of {@link STRUCTURE_REFERENCE_AREA_M2} turns
 * damaged, and rubble. One tank round breaches a wall ("one MPAT round
 * normally creates a breach hole in all but the thickest masonry", FM
 * 3-06.11), so one tank round damages a house; ⚠️ rubble at about ten — no
 * source gives rounds to bring a house down ("large expenditures of
 * ammunition are required to knock down buildings of any size").
 */
export const STRUCTURE_POINTS = { damaged: 10, rubble: 100 } as const;

/**
 * The footprint the points are for. A larger building takes proportionally
 * more, a smaller one less, never under {@link STRUCTURE_MIN_SCALE} of it.
 * Ours.
 */
export const STRUCTURE_REFERENCE_AREA_M2 = 100;
export const STRUCTURE_MIN_SCALE = 0.5;

/**
 * Damage points one round that strikes a building deals, by weapon. Absent:
 * none. ⚠️ The counts are ours, set by what FM 3-06.11 says of each:
 * - `artillery` 15 — a direct 155 mm round breaches 28 in of reinforced
 *   concrete "with considerable damage beyond the wall": one damages, about
 *   seven bring a house down.
 * - `tankRound` 10 — one breaches, about ten bring it down.
 * - `mortar` 4 — the 81 mm "can penetrate the roofs of light buildings" and
 *   "seldom penetrate[s] more than the upper stories": a house takes 25.
 * - `rpgVsInfantry`, `rpgVsArmor` 3 — a small hole through a lot of wall; the
 *   LAW takes five rounds on one spot to loophole a double-brick wall. About
 *   four damage a house; it takes thirty and more to bring one down.
 * - The rifle grenade none: "the M203 cannot reasonably deliver the rounds
 *   needed to breach a typical exterior wall".
 */
export const STRUCTURE_DAMAGE: Readonly<Record<string, number>> = {
  artillery: 15,
  tankRound: 10,
  mortar: 4,
  rpgVsInfantry: 3,
  rpgVsArmor: 3,
};

/**
 * The cover rubble gives a force in it: full. FM 3-06.11: a town reduced to
 * rubble "often becomes … a stronger position for defending troops than it
 * was before". It has no roof.
 */
export const RUBBLE_COVER: CoverState = "full";
/** How high rubble stands, for sight lines. Ours. */
export const RUBBLE_HEIGHT_M = 2;

/**
 * A critical hit, direct fire (rules decision 77): the chance a round that
 * hits a force in a building went in through a window, or one that hits a
 * force in a position prepared before the battle went in through its firing
 * slit, by range. ⚠️ Ours, from dispersion — no source gives the chance a
 * round enters a window: a tank gun's 0.2–0.3 mil; the M203 can put a
 * grenade through a window at about 125 m but gunners "cannot consistently
 * hit windows at 50 m when forced to aim and fire quickly" (FM 3-22.31); an
 * RPG-7 hits a tank-sized target about half the time at 200 m. A slit is
 * about a third of a window's size.
 *
 * **No RPG** (2026-10-03, after reading FM 3-06.11 on the page): "a round
 * passing through a window wastes much of its energy on the back wall";
 * a shaped charge fired into an aperture "may be wasted … little or no
 * damage … unless hit directly". The manual aims it beside the window.
 */
export const CRITICAL_CHANCE: Readonly<Record<string, { window: readonly RangeBand[]; slit: readonly RangeBand[] }>> = {
  tankRound: {
    window: [
      { maxRange: 500, value: 0.85 },
      { maxRange: 1000, value: 0.5 },
      { maxRange: 3000, value: 0.25 },
    ],
    slit: [
      { maxRange: 500, value: 0.4 },
      { maxRange: 1000, value: 0.15 },
      { maxRange: 3000, value: 0.05 },
    ],
  },
  rifleGrenade: {
    window: [
      { maxRange: 50, value: 0.35 },
      { maxRange: 150, value: 0.15 },
    ],
    slit: [
      { maxRange: 50, value: 0.1 },
      { maxRange: 150, value: 0.05 },
    ],
  },
};

/**
 * A critical hit, indirect fire (rules decision 77): the chance an
 * impact-fuzed round that lands on a building goes through its roof and
 * bursts inside. ⚠️ Ours: no source gives roof penetration by fuze. The 81 mm
 * with a *delay* fuze "can penetrate the roofs of light buildings" (FM
 * 3-06.11); the game's rounds are superquick, so 5% for the mortar and 30%
 * for a 155 mm shell. An air burst never goes through.
 */
export const ROOF_PENETRATION: Readonly<Record<string, number>> = {
  // FM 3-06.11, read on the page: the 60 mm "cannot penetrate most
  // rooftops, even with a delay setting"; the 81 mm does "with a delay
  // setting" on light buildings. Superquick, rarer still: 2% (was 5%).
  mortar: 0.02,
  artillery: 0.3,
};

/**
 * What a burst inside a room does against a burst in the open: the factor on
 * each man's blast chance (a man on his feet in the open), capped at 1.
 * ⚠️ 2.5 is ours. The anchor: the same bombs killed 7.8% of their casualties
 * in the open and 49% in buses (Leibovici et al., J Trauma 1996), with the
 * reflected and quasi-static pressure of a closed space; a room with windows
 * is less closed than a bus, so ×2–3 rather than ×6.
 */
export const ENCLOSED_BLAST_FACTOR = 2.5;

/**
 * Weapons whose round, striking the wall of a building, breaches it and
 * throws spall among the men inside: they find them as if behind partial
 * cover, not under a roof (2026-10-03). FM 3-06.11, read on the page: tank
 * HEAT is "large enough to displace enough spall to inflict casualties
 * inside a building"; a light shaped charge is not ("usually, only those
 * enemy soldiers directly in the path of the spall … become casualties").
 * ⚠️ Partial cover's ×0.5 for it is ours.
 */
export const SPALLS_INSIDE: ReadonlySet<string> = new Set(["tankRound"]);

/**
 * The share of the men inside a building that dies when it comes down
 * (2026-10-03). Arnold et al., *Ann Emerg Med* 2004, 29 bombings, 8,364
 * casualties: immediate mortality 25% where the structure collapsed,
 * against 4% in the open air.
 */
export const COLLAPSE_KILLS = 0.25;
