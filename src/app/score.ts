import type { Game, Side } from "../engine/index.js";
import { delayHeld, outOfTime, sideDefeated } from "./hotseat.js";

/**
 * A battle's score, each side for itself (rules decision 108, the author,
 * 2026-10-21: breaking contact should buy "time and people … Either way,
 * they should give less points than achieving the mission"). It sits
 * alongside who won, never decides it: the mission's winner stays the
 * break and the time limit's (decisions 19, 58).
 *
 * - **Mission**, 100: the side won the battle.
 * - **Men**, up to 40: the share of the side's men still fit at the end —
 *   not down, not taken, not in a force that gave itself up.
 * - **Time**, up to 30: the defender's share of the time limit (a delay
 *   mission's turn, where it has one) held before
 *   the battle ended against it (all of it, if it held); the attacker's,
 *   the share it had left when it won. None without a time limit.
 *
 * Men and time together (70) never reach the mission (100).
 */
export const SCORE = { mission: 100, men: 40, time: 30 } as const;

export interface SideScore {
  mission: number;
  men: number;
  time: number;
  total: number;
}

export interface BattleScore {
  /** Who won the mission; null for a draw, or a battle not over. */
  winner: Side | null;
  sides: Record<Side, SideScore>;
  /**
   * Each force's men fit at the end, of all it had: what a campaign will
   * start its next battle from (decision 108; campaigns are backlog 16).
   */
  forces: { id: string; side: Side; fit: number; men: number }[];
}

const SIDES: readonly Side[] = ["BLUE", "RED"];
const round = (x: number) => Math.round(x * 10) / 10;

/** The men of a force, and those still fit to fight on: crews for a vehicle, soldiers otherwise. */
function strength(u: Game["units"][number]): { fit: number; men: number } {
  const people = u.vehicle ? u.vehicle.crew : (u.soldiers ?? []);
  const fit = u.surrendered ? 0 : people.filter((p) => !p.neutralized).length;
  return { fit, men: people.length };
}

/** Who won, by the game's own rules: a side beaten (decision 19), a delay held (decision 109), or the attacker out of time (decision 58). */
export function battleWinner(game: Game): Side | null {
  const beaten = SIDES.filter((s) => sideDefeated(game, s));
  if (beaten.length === 1) return beaten[0] === "BLUE" ? "RED" : "BLUE";
  if (beaten.length === 2) return null;
  const held = delayHeld(game);
  if (held) return held;
  const late = outOfTime(game);
  return late ? (late === "BLUE" ? "RED" : "BLUE") : null;
}

/** The score as the battle stands — at its end, the battle's score. */
export function battleScore(game: Game, winner: Side | null = battleWinner(game)): BattleScore {
  const attacker = game.attackers[0];
  const limit = game.delayUntil ?? game.timeLimit; // a delay's turn is the attack's deadline (decision 109)
  const ended = game.turn;
  const timeOf = (side: Side): number => {
    if (limit === undefined || attacker === undefined) return 0;
    if (side === attacker) return winner === side ? SCORE.time * Math.max(0, limit - ended) / limit : 0;
    return winner === side ? SCORE.time : SCORE.time * Math.min(ended, limit) / limit;
  };
  const forces = game.units.map((u) => ({ id: u.id, side: u.side, ...strength(u) }));
  const sides = Object.fromEntries(SIDES.map((side) => {
    const own = forces.filter((f) => f.side === side);
    const men = own.reduce((t, f) => t + f.men, 0);
    const fit = own.reduce((t, f) => t + f.fit, 0);
    const score = {
      mission: winner === side ? SCORE.mission : 0,
      men: round(men > 0 ? (SCORE.men * fit) / men : 0),
      time: round(timeOf(side)),
    };
    return [side, { ...score, total: round(score.mission + score.men + score.time) }];
  })) as Record<Side, SideScore>;
  return { winner, sides, forces };
}
