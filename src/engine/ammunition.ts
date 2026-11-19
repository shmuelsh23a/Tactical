/**
 * Ammunition (backlog 12, rules decision 127): what a man carries, what he
 * spends, when his force conserves, and how it is shared out and refilled.
 * The rules live here; `Game` calls them where a force fires, at the end of
 * a turn, and in planning. Absent counters — a game played without
 * ammunition, or a vehicle — are never read as empty.
 */
import { BASIC_LOAD, CONSERVE, RESUPPLY, ROUNDS_A_TURN } from "./data/ammunition.js";
import { RIFLE_GRENADIERS } from "./data/explosives.js";
import type { AmmoStock, Soldier, SquadAmmo, Unit } from "./types.js";

/** Whether this force's ammunition is counted: its men carry a count of rounds. */
export function tracksAmmunition(unit: Unit): boolean {
  return unit.kind !== "vehicle" && (unit.soldiers ?? []).some((s) => s.rounds !== undefined);
}

/** A man's full load of rounds in this force: a rifleman's, or his share of a machine gun team's belts. */
export function basicRounds(unit: Unit): number {
  const crew = Math.max(1, unit.soldiers?.length ?? 1);
  return unit.mediumMg ? Math.ceil(BASIC_LOAD.machineGunRounds / crew) : BASIC_LOAD.rifleRounds;
}

/** Rounds a man of this force spends in a turn of fire: the sustained rate (⚠️ ours, a turn as a minute). */
export function roundsATurn(unit: Unit): number {
  const crew = Math.max(1, unit.soldiers?.length ?? 1);
  return unit.mediumMg ? Math.ceil(ROUNDS_A_TURN.machineGun / crew) : ROUNDS_A_TURN.rifle;
}

/** What a squad carries on the squad when it is full: 21 40 mm a launcher it started with, and a rifle squad's rockets. */
export function basicSquadAmmo(unit: Unit): SquadAmmo {
  const men = unit.soldiers?.length ?? 0;
  return {
    rifleGrenades: unit.mediumMg ? 0 : Math.floor(men / RIFLE_GRENADIERS.menPerLauncher) * BASIC_LOAD.rifleGrenadesPerLauncher,
    rockets: unit.kind === "infantry" && unit.echelon === "squad" && !unit.mediumMg ? BASIC_LOAD.rockets : 0,
  };
}

/**
 * Issue a force its basic load as it comes onto the map, where it has none
 * already: a force recorded with what it carried keeps it. Men only — a
 * vehicle's rounds are not counted (⚠️ ours, for now).
 */
export function issueLoad(unit: Unit, charges: number): void {
  if (unit.kind === "vehicle" || !unit.soldiers?.length) return;
  const rounds = basicRounds(unit);
  for (const s of unit.soldiers) {
    s.rounds ??= rounds;
    s.grenades ??= BASIC_LOAD.grenades;
  }
  if (unit.kind === "infantry") unit.ammo ??= basicSquadAmmo(unit);
  if (unit.canLayCharges) unit.charges ??= charges;
}

/** One squad's basic load times `loads`, as a cache or a bearer holds it. */
export function squadLoads(loads: number): AmmoStock {
  return {
    rounds: loads * RESUPPLY.squadMen * BASIC_LOAD.rifleRounds,
    grenades: loads * RESUPPLY.squadMen * BASIC_LOAD.grenades,
    rifleGrenades: loads * RESUPPLY.squadLaunchers * BASIC_LOAD.rifleGrenadesPerLauncher,
    rockets: loads * BASIC_LOAD.rockets,
  };
}

/** Whether a stock has nothing left in it. */
export function stockEmpty(stock: AmmoStock): boolean {
  return stock.rounds <= 0 && stock.grenades <= 0 && stock.rifleGrenades <= 0 && stock.rockets <= 0;
}

/** Below half its load: the rounds its fit men hold against what they would hold full. */
export function conserving(unit: Unit): boolean {
  if (!tracksAmmunition(unit)) return false;
  const fit = (unit.soldiers ?? []).filter((s) => !s.neutralized);
  if (fit.length === 0) return false;
  const held = fit.reduce((t, s) => t + (s.rounds ?? 0), 0);
  return held < CONSERVE.below * fit.length * basicRounds(unit);
}

/**
 * Of `ready` (the men who would fire), those who do: a man with rounds, and
 * — below half the force's load, unless it spares none — only half of them,
 * those who hold the most (no die: a draw would move every later roll).
 * Undefined where the force's ammunition is not counted.
 */
export function firingMen(unit: Unit, ready: readonly Soldier[], spareNone: boolean): Set<string> | undefined {
  if (!tracksAmmunition(unit)) return undefined;
  const armed = ready.filter((s) => (s.rounds ?? 0) > 0);
  if (spareNone || !conserving(unit)) return new Set(armed.map((s) => s.id));
  const keep = Math.ceil(armed.length * CONSERVE.firing);
  const order = armed.map((s, i) => ({ s, i })).sort((a, b) => (b.s.rounds ?? 0) - (a.s.rounds ?? 0) || a.i - b.i);
  return new Set(order.slice(0, keep).map((x) => x.s.id));
}

/** The men who fired spend a turn's rounds each, or what they had left. */
export function spendRounds(unit: Unit, men: readonly Soldier[]): void {
  const rate = roundsATurn(unit);
  for (const s of men) if (s.rounds !== undefined) s.rounds = Math.max(0, s.rounds - rate);
}

/**
 * Share out (ATP 3-21.8 (2024), para 4-118): the force's rounds and grenades,
 * its fallen men's too, evened out over its fit men, none above a full
 * load; what is over stays with the fallen. Whether any fit man gained.
 */
export function shareOut(unit: Unit): boolean {
  if (!tracksAmmunition(unit)) return false;
  const men = unit.soldiers ?? [];
  const fit = men.filter((s) => !s.neutralized);
  if (fit.length === 0) return false;
  const fallen = men.filter((s) => s.neutralized);
  let gained = false;
  for (const key of ["rounds", "grenades"] as const) {
    const cap = key === "rounds" ? basicRounds(unit) : BASIC_LOAD.grenades;
    const before = fit.map((s) => s[key] ?? 0);
    let pool = men.reduce((t, s) => t + (s[key] ?? 0), 0);
    const each = Math.min(cap, Math.floor(pool / fit.length));
    for (const s of fit) { s[key] = each; pool -= each; }
    for (const s of fit) { if (pool <= 0) break; if ((s[key] ?? 0) < cap) { s[key] = (s[key] ?? 0) + 1; pool--; } }
    for (const s of fallen) s[key] = 0;
    if (fallen[0]) fallen[0][key] = pool;
    else if (pool > 0) fit[0]![key] = (fit[0]![key] ?? 0) + pool; // never lost: it stays on the squad
    if (fit.some((s, i) => (s[key] ?? 0) > before[i]!)) gained = true;
  }
  return gained;
}

/** What a refill took from a stock. */
export type Drawn = AmmoStock;

/**
 * Refill a force from a stock, toward its basic load: each fit man's rounds
 * and grenades, then the squad's 40 mm and rockets. Takes from `stock`;
 * returns what it took.
 */
export function refillFrom(unit: Unit, stock: AmmoStock): Drawn {
  const drawn: Drawn = { rounds: 0, grenades: 0, rifleGrenades: 0, rockets: 0 };
  if (!tracksAmmunition(unit)) return drawn;
  const rounds = basicRounds(unit);
  for (const s of (unit.soldiers ?? []).filter((m) => !m.neutralized)) {
    const r = Math.min(Math.max(0, rounds - (s.rounds ?? 0)), stock.rounds);
    s.rounds = (s.rounds ?? 0) + r; stock.rounds -= r; drawn.rounds += r;
    const g = Math.min(Math.max(0, BASIC_LOAD.grenades - (s.grenades ?? 0)), stock.grenades);
    s.grenades = (s.grenades ?? 0) + g; stock.grenades -= g; drawn.grenades += g;
  }
  if (unit.ammo) {
    const full = basicSquadAmmo(unit);
    const rg = Math.min(Math.max(0, full.rifleGrenades - unit.ammo.rifleGrenades), stock.rifleGrenades);
    unit.ammo.rifleGrenades += rg; stock.rifleGrenades -= rg; drawn.rifleGrenades += rg;
    const rk = Math.min(Math.max(0, full.rockets - unit.ammo.rockets), stock.rockets);
    unit.ammo.rockets += rk; stock.rockets -= rk; drawn.rockets += rk;
  }
  return drawn;
}

/** Whether a refill took anything. */
export function drewAny(d: Drawn): boolean {
  return d.rounds + d.grenades + d.rifleGrenades + d.rockets > 0;
}

/**
 * A force's ammunition as its own side may read it (rules decision 127):
 * the rounds its fit men hold against a full load, its grenades, its 40 mm
 * and rockets. Undefined where nothing is counted.
 */
export function ammunitionState(unit: Unit): { rounds: number; full: number; grenades: number; rifleGrenades: number; rockets: number; conserving: boolean } | undefined {
  if (!tracksAmmunition(unit)) return undefined;
  const fit = (unit.soldiers ?? []).filter((s) => !s.neutralized);
  return {
    rounds: fit.reduce((t, s) => t + (s.rounds ?? 0), 0),
    full: fit.length * basicRounds(unit),
    grenades: fit.reduce((t, s) => t + (s.grenades ?? 0), 0),
    rifleGrenades: unit.ammo?.rifleGrenades ?? 0,
    rockets: unit.ammo?.rockets ?? 0,
    conserving: conserving(unit),
  };
}

/**
 * What ammunition did as a turn closed (rules decision 127), each its own
 * side's to read: a squad shared out, a force drew from a cache or a bearer,
 * a cache was emptied, or an enemy reached a cache unguarded and took it.
 */
export type AmmunitionReport =
  | { kind: "sharedOut"; unitId: string }
  | { kind: "refilled"; unitId: string; from: "cache" | "bearer"; sourceId: string; drawn: AmmoStock }
  | { kind: "cacheEmpty"; cacheId: string; side: Unit["side"] }
  | { kind: "cacheTaken"; cacheId: string; side: Unit["side"]; position: { x: number; y: number }; by: string }
  /** Its own side came to a cache the enemy had taken, and found it gone. */
  | { kind: "cacheLost"; cacheId: string; side: Unit["side"]; by: string };

/** The squad-carried stock a weapon draws on: the 40 mm, or the rockets. Undefined for one that is not counted. */
export function squadStockKey(weaponKey: string): keyof SquadAmmo | undefined {
  if (weaponKey === "rifleGrenade") return "rifleGrenades";
  if (weaponKey === "rpgVsInfantry" || weaponKey === "rpgVsArmor") return "rockets";
  return undefined;
}
