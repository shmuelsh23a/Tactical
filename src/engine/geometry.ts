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
