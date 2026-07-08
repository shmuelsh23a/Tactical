import { Rng } from "./rng.js";

/**
 * Dice helpers. The rules document uses Hebrew die notation like "1ק10"
 * (1d10), "1ק4" (1d4), "2ק10" (2d10). We model that as `{ count, sides }`.
 */
export interface Dice {
  count: number;
  sides: number;
}

/**
 * Parse a dice string. Accepts both Latin ("2d10") and the Hebrew "ק"
 * separator used in the source rules ("2ק10"). A bare number ("3") parses as
 * a constant (3d1-equivalent → always that value).
 */
export function parseDice(notation: string): Dice {
  const m = notation.trim().match(/^(\d*)\s*[dק]\s*(\d+)$/i);
  if (m) {
    return { count: m[1] ? parseInt(m[1], 10) : 1, sides: parseInt(m[2]!, 10) };
  }
  const constant = notation.trim().match(/^(\d+)$/);
  if (constant) return { count: parseInt(constant[1]!, 10), sides: 1 };
  throw new Error(`Cannot parse dice notation: "${notation}"`);
}

/** Roll a dice spec, returning the summed total. */
export function roll(rng: Rng, dice: Dice | string): number {
  const d = typeof dice === "string" ? parseDice(dice) : dice;
  let total = 0;
  for (let i = 0; i < d.count; i++) total += rng.die(d.sides);
  return total;
}

/** Roll, returning the individual die results alongside the total. */
export function rollDetailed(
  rng: Rng,
  dice: Dice | string,
): { total: number; rolls: number[] } {
  const d = typeof dice === "string" ? parseDice(dice) : dice;
  const rolls: number[] = [];
  for (let i = 0; i < d.count; i++) rolls.push(rng.die(d.sides));
  return { total: rolls.reduce((a, b) => a + b, 0), rolls };
}
