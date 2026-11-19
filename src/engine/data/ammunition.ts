/**
 * Ammunition (backlog 12, rules decision 127; the author, 2026-11-19, on
 * doctrine). Figures set from doctrine rather than the rules document, so
 * they live beside its tables and never in them. Every load below is
 * doctrine's *example*: "Combat loads are not standardized nor are quantities
 * established since all are mission dependent" (ATP 3-21.9 (2025), para
 * 6-54). Sources in docs/sources.md, *Ammunition*.
 */

/**
 * What a man and a squad carry into the battle: the example squad load of
 * ATP 3-21.9 (2025), fig 6-8 and TC 3-21.76 (2025), table 2-9, which agree.
 *
 * - `rifleRounds`: an M4's **210** (7 magazines; also ATP 3-21.18 (2025),
 *   table 3-1). Every man of a rifle squad is a rifleman until weapons move
 *   to the man (decision 73): the automatic rifleman's 625 is not apart.
 * - `machineGunRounds`: an M240's **825**, carried by its team and split over
 *   its crew (ATP 3-21.8 (2024), table C-6 splits it by position).
 * - `grenades`: **2** M67 a man ("Two per Soldier"), decision 46's figure.
 * - `rifleGrenadesPerLauncher`: an M320's **21** 40 mm, on the squad for
 *   every launcher it carries at the start (one for every four men,
 *   `RIFLE_GRENADIERS`).
 * - `rockets`: **2** shoulder-launched munitions a rifle squad (ATP 3-21.8
 *   (2024), the note after para 1-11), on the squad.
 * - `charges`: decision 16's mines and IEDs a force that may lay them
 *   carries, when its scenario says nothing — as breaching charges
 *   (decision 125). ⚠️ Ours: doctrine gives no number.
 */
export const BASIC_LOAD = {
  rifleRounds: 210,
  machineGunRounds: 825,
  grenades: 2,
  rifleGrenadesPerLauncher: 21,
  rockets: 2,
  charges: 2,
} as const;

/**
 * Rounds a man spends in a turn of fire: doctrine's **sustained** rate for a
 * minute — the M4's slow fire, about 12–15 a minute (TC 3-22.9 (2016), para
 * 8-18), its top figure; the M240's 100 a minute (ATP 3-21.8 (2024), table
 * C-8), shared by the men of its team who fire. ⚠️ Ours: reading a turn of
 * fire as a minute at the sustained rate (a turn is 60 s, decision 40).
 */
export const ROUNDS_A_TURN = { rifle: 15, machineGun: 100 } as const;

/**
 * Conserving (the author, 2026-11-19): below half its load a force fires
 * only half its men a turn, to "arrive at the objective with ammunition"
 * (ATP 3-21.8 (2024), table B-2) — and spares none when it assaults or fires
 * on an enemy within `spareNoneWithinM`, the final protective fire's "spare
 * no ammunition" (para A-51). ⚠️ Ours: half its men (the author's ruling,
 * on our figure), and 100 m.
 */
export const CONSERVE = { below: 0.5, firing: 0.5, spareNoneWithinM: 100 } as const;

/**
 * Resupply on the map (the author, 2026-11-19).
 *
 * - **Share out**: a squad pools its men's ammunition, a fallen man's too, on
 *   a turn it neither fires nor is fired on (consolidation, ATP 3-21.8
 *   (2024), para 4-118; the squad leader "ensures the redistribution of
 *   ammunition", TC 3-21.76 (2025), para 1-14).
 * - **Caches** (ATP 3-21.8 (2024), paras 5-74, 5-112; ATP 3-06.11 (2024),
 *   para 4-38: "in or near fighting positions"): a defending squad may have
 *   one at its position and one at its alternate, each one squad's load; an
 *   attacker one for every three squads, within `placeWithinM` of its own
 *   forces, holding `attackerCacheLoads` squads' loads.
 * - **Ammunition bearers** (the first sergeant's work, ATP 3-21.8 (2024),
 *   para 8-34): one squad for every three may be named; it carries
 *   `bearerLoads` squads' loads.
 * - A force draws from a cache or bearer within `reachM` on a turn it holds
 *   still, neither firing nor fired on. An enemy force within `reachM` of a
 *   cache with none of its owner's forces there takes it out of play — "a
 *   pre-positioned and concealed supply point" (ATP 3-21.10 (2026), para
 *   4-46), not a guarded one.
 *
 * ⚠️ Ours: the loads' sizes, `squadMen` (a rifle squad's nine, ATP 3-21.8
 * (2024), para 1-11) as what one squad's load is, 100 m and 25 m.
 */
export const RESUPPLY = {
  squadMen: 9,
  /** A squad's launchers in one squad's load: one for every four of its nine men. */
  squadLaunchers: 2,
  attackerCacheLoads: 3,
  defenderCacheLoads: 1,
  defenderCachesEach: 2,
  bearerLoads: 3,
  placeWithinM: 100,
  reachM: 25,
} as const;
