import type { Game } from "./game.js";

/**
 * State fingerprints, for noticing when a recording no longer replays the way
 * it did when it was made.
 *
 * A recording stores decisions, not outcomes, so replaying one under changed
 * rules silently rewrites history — which this repo has done twice already
 * (rules decisions 7 and 10 both altered how an existing value is applied).
 * A digest is the cheap way to notice: a few bytes per action that say "this
 * is the state those decisions used to produce".
 *
 * Note the RNG state alone would not do. It moves whenever the number of draws
 * changes, which catches a lot — but plenty of rules live outside the dice.
 * Thresholds and bookkeeping (the neutralise threshold, the 50%-attrition
 * fraction, the armour component pools) decide what a roll *means* without
 * consuming anything, so they rewrite the battle while leaving the generator
 * exactly where it was. The fingerprint has to cover the material state.
 */

/**
 * JSON with object keys sorted, so a fingerprint depends on the values and not
 * on the order some refactor happened to assign properties in.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** FNV-1a, 32-bit. Not a security hash — this only has to notice a change. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    // hash *= 16777619, in 32-bit arithmetic.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Everything a rules change could plausibly move: where forces are, what they
 * have taken, what is still in the air, and where the generator stands.
 */
export function stateDigest(game: Game): string {
  return fnv1a(
    canonicalJson({
      turn: game.turn,
      phase: game.phase,
      initiativeOrder: game.initiativeOrder,
      units: game.units,
      mines: game.mines,
      smoke: game.smoke,
      pendingFire: game.pendingFire,
      pendingSmoke: game.pendingSmoke,
      rng: game.rng.getState(),
    }),
  );
}
