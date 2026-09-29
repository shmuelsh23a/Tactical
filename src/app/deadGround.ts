import { EYE_HEIGHT, distance, terrainBlocksSight, type Point, type Terrain } from "../engine/index.js";

/**
 * Dead ground (שטח מת): where a force can stand and not be seen from where the
 * enemy is, or is thought to be. A tool, not a decision — it answers "is this
 * spot out of sight of those eyes?" and "where is the nearest such spot?", and
 * a commander, scripted or Jev (backlog 15), chooses what to do with it.
 *
 * It reads the ground with the engine's own sight test (`terrainBlocksSight`,
 * rules decision 15), so a spot it calls dead is one no roll in the game could
 * see into from those points. It never reads where the enemy really is: the
 * caller hands it the watchers, from its side's picture (`sideView`) and its
 * plan — which is what makes it safe to give a commander.
 */
export interface DeadGroundQuery {
  terrain: Terrain;
  /** Where the enemy is, or is thought to be, watching from. */
  watchers: readonly Point[];
  /** The watchers' eye above the ground. A standing man's unless given: the enemy may be standing to look. */
  watcherEye?: number;
  /** The waiting force's silhouette above the ground. A standing man's unless given. */
  silhouette?: number;
  /**
   * Beyond this, a spot counts as out of sight whatever the ground: nothing
   * finds a still force further out than an observation post does (rules
   * decisions 53–54, 600 m). Infinity to judge by the ground alone.
   */
  reach?: number;
}

const STILL_REACH_M = 600;

/** Whether `at` is out of sight of every watcher. */
export function isDeadGround(q: DeadGroundQuery, at: Point): boolean {
  const eye = q.watcherEye ?? EYE_HEIGHT.infantry;
  const silhouette = q.silhouette ?? EYE_HEIGHT.infantry;
  const reach = q.reach ?? STILL_REACH_M;
  return q.watchers.every(
    (w) => distance(w, at) > reach || terrainBlocksSight(q.terrain, w, eye, at, silhouette),
  );
}

/** Where to look for dead ground: a grid around `from`, inside the map. */
export interface DeadGroundSearch {
  /** Metres between the spots tried. */
  step?: number;
  /** How far from `from` to look. */
  radius?: number;
  /** The map's extent: nothing off it is offered. */
  width: number;
  height: number;
}

/**
 * The dead ground nearest `from`, within `radius` of it, or null if there is
 * none. Ties go to the spot first in (y, x) order, so the answer is the same
 * every time it is asked.
 */
export function nearestDeadGround(q: DeadGroundQuery, from: Point, search: DeadGroundSearch): Point | null {
  const step = search.step ?? 20;
  const radius = search.radius ?? 300;
  if (isDeadGround(q, from)) return { ...from };
  const spots: Point[] = [];
  for (let dy = -radius; dy <= radius; dy += step) {
    for (let dx = -radius; dx <= radius; dx += step) {
      const p = { x: from.x + dx, y: from.y + dy };
      if (p.x < 0 || p.y < 0 || p.x > search.width || p.y > search.height) continue;
      if (distance(p, from) > radius) continue;
      spots.push(p);
    }
  }
  spots.sort((a, b) => distance(a, from) - distance(b, from) || a.y - b.y || a.x - b.x);
  return spots.find((p) => isDeadGround(q, p)) ?? null;
}

/**
 * A place to watch from (an observation point): the counterpart of dead
 * ground. A scout that walks straight at the objective on broken ground
 * first sees it from inside the enemy's own reach, and is seen back. One
 * sent to a spot that looks onto the objective from further out is not.
 */
export interface VantageQuery {
  terrain: Terrain;
  /** What it must see: where the plan puts the enemy. */
  targets: readonly Point[];
  /** The watcher's eye. A man lying to look through binoculars sees over less than one standing. */
  eye?: number;
  /** The targets' silhouette: a force dug in shows only this much (the engine's full-cover figure unless given). */
  silhouette?: number;
  /** No nearer the targets' centre than this: outside the enemy's own reach. */
  minRange: number;
  /** No further than this: inside the watcher's (binoculars, 600 m). */
  maxRange: number;
}

/**
 * The spot, between `minRange` and `maxRange` of the targets' centre and on
 * the side `from` is on, that sees the most of the targets — nearest `from`
 * among the best. Null if none sees any. Deterministic, as {@link nearestDeadGround}.
 */
export function bestVantage(q: VantageQuery, from: Point, search: Omit<DeadGroundSearch, "radius">): Point | null {
  const step = search.step ?? 20;
  const eye = q.eye ?? EYE_HEIGHT.infantry;
  const silhouette = q.silhouette ?? EYE_HEIGHT.fullCover;
  const centre = {
    x: q.targets.reduce((t, p) => t + p.x, 0) / q.targets.length,
    y: q.targets.reduce((t, p) => t + p.y, 0) / q.targets.length,
  };
  // Only the half of the ring facing `from`: a scout is not sent round behind the enemy.
  const toward = { x: from.x - centre.x, y: from.y - centre.y };
  let best: { p: Point; seen: number; d: number } | null = null;
  for (let y = centre.y - q.maxRange; y <= centre.y + q.maxRange; y += step) {
    for (let x = centre.x - q.maxRange; x <= centre.x + q.maxRange; x += step) {
      const p = { x, y };
      if (p.x < 0 || p.y < 0 || p.x > search.width || p.y > search.height) continue;
      const r = distance(p, centre);
      if (r < q.minRange || r > q.maxRange) continue;
      if ((p.x - centre.x) * toward.x + (p.y - centre.y) * toward.y <= 0) continue;
      const seen = q.targets.filter((t) => !terrainBlocksSight(q.terrain, p, eye, t, silhouette)).length;
      if (seen === 0) continue;
      const d = distance(p, from);
      if (!best || seen > best.seen || (seen === best.seen && d < best.d)) best = { p, seen, d };
    }
  }
  return best ? best.p : null;
}
