import type { Echelon } from "../types.js";
import { lookupBand, type RangeBand } from "../geometry.js";

/**
 * Command & control (פו"ש). The frequency at which a force may receive new
 * orders depends on the distance between the force and its commanding element.
 * `value` is the order interval in turns (1 = every turn).
 */
export interface C2Profile {
  /** The subordinate force level. */
  force: Echelon;
  /** The commanding element described in the source. */
  commander: string;
  /** Distance → order interval (turns). */
  bands: readonly RangeBand[];
}

export const C2_TABLE: readonly C2Profile[] = [
  {
    force: "squad", // כיתה ממפקד מחלקה
    commander: "platoon commander",
    bands: [
      { maxRange: 300, value: 1 }, // every turn
      { maxRange: 500, value: 2 }, // every 2 turns
      { maxRange: Infinity, value: 3 }, // 501+ : every 3 turns
    ],
  },
  {
    force: "platoon", // מחלקה מחפ"ק מ"פ/סמ"פ
    commander: "company CP / deputy",
    bands: [
      { maxRange: 500, value: 1 },
      { maxRange: 700, value: 2 },
      { maxRange: Infinity, value: 3 }, // 701+ : every 3 turns
    ],
  },
];

/**
 * Order interval (in turns) for a force at a given distance from its command
 * element. Returns null if no profile matches the echelon.
 */
export function orderInterval(force: Echelon, distance: number): number | null {
  const profile = C2_TABLE.find((p) => p.force === force);
  if (!profile) return null;
  return lookupBand(profile.bands, distance)?.value ?? null;
}
