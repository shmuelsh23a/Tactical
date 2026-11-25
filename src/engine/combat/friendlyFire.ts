import type { Unit } from "../types.js";
import { distance, type Point } from "../geometry.js";

/**
 * Small-arms friendly fire and masked fire (rules decision 133, the author,
 * 2026-11-25). A blast already catches whoever is in it, the firer's side
 * too (decisions 3 and 79); until this a rifle or machine-gun shot could hit
 * only the force it was aimed at, and a friend standing in front of the
 * firer did not stop it.
 *
 * - **Masked**: a friend in the line of fire, between the firer and the
 *   target, stops the shot — no force fires through its own men. Height
 *   counts: fire that passes well over a friend's head (a firer on a rise,
 *   the friend in dead ground below) is not masked by it.
 * - **At risk**: a friend within 50 m of the target, or within 10 m of the
 *   line of fire short of it (decision 132's distances, the author's), can
 *   be hit by the misses — masked or fired over alike.
 */
export const FRIENDLY_FIRE = {
  /** A friend this near the target is in the beaten zone (the author's, decision 132). */
  nearTargetM: 50,
  /** A friend this near the line of fire, short of the target, is in its path (the author's, decision 132). */
  nearLineM: 10,
  /** ⚠️ Ours: the firer's own first metres are not its line of fire — men beside it are not in front of it (decision 132's figure). */
  clearOfFirerM: 10,
  /** A friend whose centre is this near the line masks it: about the half-front of a squad in the attack (the author's, 2026-11-25). */
  maskM: 10,
  /** ⚠️ Ours: a friend this near the target is at it, not in front of it — at risk, not masking. */
  maskShortOfTargetM: 10,
  /** ⚠️ Ours: fire passing at least this far over a friend's head is fired over it, not masked by it. */
  overheadClearM: 3,
  /** ⚠️ Ours, tentative (docs/balance.md): the chance a miss strays onto a friend standing at the target, falling to none at 50 m. */
  strayNearTarget: 0.05,
  /** ⚠️ Ours, tentative: the chance a miss strays onto a friend standing on the line of fire, falling to none at 10 m. */
  strayOnLine: 0.1,
} as const;

/** Refusal: a friend stands in the line of fire (decision 133). */
export const MASKED_BY_FRIENDS = "masked by our own forces";

/** A friend the misses can reach, and the chance each miss strays onto it (cover counted). */
export interface AtRisk {
  unit: Unit;
  chance: number;
  /** Only these of its men can be hit: a friend fighting inside, the men it shows at its windows toward the firer. */
  pool?: ReadonlySet<string>;
}

/** Where `p` stands against the line from `from` to `to`: how far along it, and how far off it. */
export function onLine(from: Point, to: Point, p: Point): { along: number; off: number; length: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { along: 0, off: distance(from, p), length };
  const along = ((p.x - from.x) * dx + (p.y - from.y) * dy) / length;
  const off = Math.abs((p.x - from.x) * dy - (p.y - from.y) * dx) / length;
  return { along, off, length };
}

/**
 * The friend that masks the shot from `from` at `to`, if any: within the
 * mask's width of the line, past the firer's own metres, short of the
 * target — unless `firedOver` says the fire passes well over its head there.
 */
export function maskingFriend(
  from: Point,
  to: Point,
  friends: readonly Unit[],
  firedOver: (u: Unit, share: number) => boolean = () => false,
): Unit | undefined {
  const f = FRIENDLY_FIRE;
  return friends.find((u) => {
    const l = onLine(from, to, u.position);
    return l.off <= f.maskM && l.along > f.clearOfFirerM && l.along < l.length - f.maskShortOfTargetM && !firedOver(u, l.along / l.length);
  });
}

/** The chance a miss from `from` at `to` strays onto a friend standing at `p`, in the open. */
export function strayChance(from: Point, to: Point, p: Point): number {
  const f = FRIENDLY_FIRE;
  const toTarget = distance(p, to);
  const nearTarget = toTarget < f.nearTargetM ? f.strayNearTarget * (1 - toTarget / f.nearTargetM) : 0;
  const l = onLine(from, to, p);
  const onPath = l.along > f.clearOfFirerM && l.along < l.length && l.off < f.nearLineM ? f.strayOnLine * (1 - l.off / f.nearLineM) : 0;
  return Math.max(nearTarget, onPath);
}

/**
 * The friends a shot from `from` at `to` puts at risk, likeliest first, each
 * with the chance a miss strays onto it: the greater of its place in the
 * beaten zone and its place on the path, scaled by what its cover is worth
 * (`coverFactor`, 1 in the open). `poolOf` limits a friend to the men a stray
 * can reach; an empty pool puts it out of reach.
 */
export function friendsAtRisk(
  from: Point,
  to: Point,
  friends: readonly Unit[],
  coverFactor: (u: Unit) => number,
  poolOf: (u: Unit) => ReadonlySet<string> | undefined = () => undefined,
): AtRisk[] {
  const out: AtRisk[] = [];
  for (const u of friends) {
    const base = strayChance(from, to, u.position);
    if (base <= 0) continue;
    const chance = base * coverFactor(u);
    if (chance <= 0) continue;
    const pool = poolOf(u);
    if (pool && pool.size === 0) continue;
    out.push({ unit: u, chance, ...(pool ? { pool } : {}) });
  }
  // The likeliest first, then by id: the order the misses are rolled in, fixed for a replay.
  return out.sort((a, b) => b.chance - a.chance || (a.unit.id < b.unit.id ? -1 : a.unit.id > b.unit.id ? 1 : 0));
}
