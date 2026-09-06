/**
 * Map geometry. Positions are in METRES on a flat plane, matching the
 * document's ~1:3000 tactical scale where all distances are quoted in metres.
 */
export interface Point {
  x: number;
  y: number;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * A range band: applies when `distance <= maxRange` (and beyond the previous
 * band's max). `value` is whatever the table associates with the band — most
 * often a hit probability in [0, 1].
 */
export interface RangeBand {
  maxRange: number;
  value: number;
}

/**
 * Look up the value for a distance in an ordered list of range bands.
 * Bands must be sorted ascending by `maxRange`. Returns `undefined` when the
 * distance exceeds the longest band (out of range).
 */
export function lookupBand(
  bands: readonly RangeBand[],
  dist: number,
): RangeBand | undefined {
  for (const band of bands) {
    if (dist <= band.maxRange) return band;
  }
  return undefined;
}

/** True when `target` lies within `radius` metres of `center`. */
export function withinRadius(center: Point, target: Point, radius: number): boolean {
  return distance(center, target) <= radius;
}

/**
 * Direction from `a` to `b`, in degrees in [0, 360), with 0 along +x — the same
 * convention `VehicleState.facing` already uses, so a hull heading and a sector
 * of observation are quoted in the same numbers.
 */
export function bearingDegrees(a: Point, b: Point): number {
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** The smaller angle between two bearings, in degrees in [0, 180]. */
export function angleBetween(a: number, b: number): number {
  const diff = (((a - b) % 360) + 360) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * True when `target` falls inside the arc of `width` degrees centred on
 * `bearing`, seen from `from`. A target standing on the observer is inside any
 * arc — there is no direction to it to be wrong about.
 */
export function withinArc(
  from: Point,
  target: Point,
  bearing: number,
  width: number,
): boolean {
  if (width >= 360) return true;
  if (from.x === target.x && from.y === target.y) return true;
  return angleBetween(bearingDegrees(from, target), bearing) <= width / 2;
}

/**
 * True when the segment `a`→`b` touches the disc of `radius` around `center` —
 * the test behind "no firing into or through smoke" (אין ירי לתוך\דרך עשן):
 * a shot is blocked whether the screen sits between the two points or over
 * either of them.
 */
export function segmentIntersectsCircle(
  a: Point,
  b: Point,
  center: Point,
  radius: number,
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  // Degenerate segment (shooter on the target): fall back to a point test.
  if (lengthSq === 0) return distance(a, center) <= radius;
  // Project the centre onto the segment, clamped to its ends, and measure from
  // that closest point.
  const t = Math.max(0, Math.min(1, ((center.x - a.x) * dx + (center.y - a.y) * dy) / lengthSq));
  const closest = { x: a.x + t * dx, y: a.y + t * dy };
  return distance(closest, center) <= radius;
}

/**
 * Parameter `t` in [0, 1] of the point on `a`→`b` nearest to `p`, clamped to
 * the segment's ends.
 */
export function nearestParam(a: Point, b: Point, p: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return 0;
  return Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
}

/** The point a fraction `t` of the way from `a` to `b`. */
export function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Distance from `p` to the nearest point of the segment `a`→`b`. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  return distance(p, lerpPoint(a, b, nearestParam(a, b, p)));
}

/**
 * True when `p` lies inside the simple polygon `points` (even-odd rule). A
 * point on an edge counts as inside often enough for a footprint test, which
 * is all this is for.
 */
export function pointInPolygon(p: Point, points: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const pi = points[i]!;
    const pj = points[j]!;
    const crosses = pi.y > p.y !== pj.y > p.y;
    if (crosses && p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y) + pi.x) inside = !inside;
  }
  return inside;
}

/** Distance from `p` to the polygon's boundary — zero when `p` is inside it. */
export function distanceToPolygon(p: Point, points: readonly Point[]): number {
  if (pointInPolygon(p, points)) return 0;
  let best = Infinity;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    best = Math.min(best, distanceToSegment(p, points[j]!, points[i]!));
  }
  return best;
}

/**
 * The parameters `t` along `a`→`b` at which it crosses the polygon's edges,
 * ascending. Empty when the segment never touches the boundary — which is the
 * case both for a segment clear of the polygon and for one wholly inside it.
 */
export function segmentPolygonCrossings(a: Point, b: Point, points: readonly Point[]): number[] {
  const ts: number[] = [];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const p = points[j]!;
    const q = points[i]!;
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    const denom = dx * ey - dy * ex;
    if (denom === 0) continue; // parallel
    const t = ((p.x - a.x) * ey - (p.y - a.y) * ex) / denom;
    const u = ((p.x - a.x) * dy - (p.y - a.y) * dx) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) ts.push(t);
  }
  return ts.sort((x, y) => x - y);
}

/**
 * The parameters `t` along `a`→`b` at which it crosses the circle's edge,
 * ascending. Empty when the segment misses the circle or lies wholly inside.
 */
export function segmentCircleCrossings(
  a: Point,
  b: Point,
  center: Point,
  radius: number,
): number[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fx = a.x - center.x;
  const fy = a.y - center.y;
  const qa = dx * dx + dy * dy;
  if (qa === 0) return [];
  const qb = 2 * (fx * dx + fy * dy);
  const qc = fx * fx + fy * fy - radius * radius;
  const disc = qb * qb - 4 * qa * qc;
  if (disc < 0) return [];
  const root = Math.sqrt(disc);
  return [(-qb - root) / (2 * qa), (-qb + root) / (2 * qa)].filter((t) => t >= 0 && t <= 1);
}
