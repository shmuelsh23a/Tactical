/**
 * Deterministic, seedable random number generator.
 *
 * The whole engine draws randomness from an instance of {@link Rng} so that a
 * game can be replayed bit-for-bit from a seed. This is essential for unit
 * tests, debugging, and (later) networked play where every client must resolve
 * the same outcome from the same inputs.
 *
 * Algorithm: Mulberry32 — a small, fast, well-distributed 32-bit PRNG.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // Force into a uint32 and avoid a zero state (which would degenerate).
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  /** Raw float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    if (max < min) throw new Error(`Rng.int: max (${max}) < min (${min})`);
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Returns true with probability p (clamped to [0, 1]). */
  chance(p: number): boolean {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.next() < p;
  }

  /** Roll a single die with the given number of sides (1..sides). */
  die(sides: number): number {
    return this.int(1, sides);
  }

  /** Snapshot of the internal state, for serializing a game in progress. */
  getState(): number {
    return this.state;
  }

  /** Restore a previously captured state. */
  setState(state: number): void {
    this.state = state >>> 0;
  }
}
