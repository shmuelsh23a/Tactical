/**
 * Aerial detection assets (כטב"מ / רחפן).
 *
 * At the start of a turn the commander directs the asset to focus on an area.
 * A drone's position is marked on the map. Within its footprint the asset
 * automatically detects moving or visible ground targets, with a probability
 * of finding emplaced IEDs/charges.
 */
export interface UavProfile {
  key: string;
  name: string;
  /** When intelligence reaches the player. */
  infoArrival: "immediate" | "nextTurn";
  /** Footprint dimensions in metres (square). */
  footprint: { width: number; height: number };
  /** Loiter duration in turns; null = entire game. */
  loiterTurns: number | null;
  /** Turns the asset must wait after loitering out (if spare batteries). */
  cooldownTurns?: number;
  /** Probability a target can intercept/engage it, or a qualitative note. */
  interception: { chance: number | null; note: string };
  /** Optional organic strike capability. */
  strike?: { hitChance: number; effectLike: string };
  /** Auto-detects moving / visible ground targets in the footprint. */
  autoDetectsVisible: boolean;
  /** Probability of finding emplaced charges/IEDs in the footprint. */
  findChargeChance: number;
  notes?: string;
}

export const UAV_PROFILES: Record<string, UavProfile> = {
  fixedWing: {
    key: "fixedWing",
    name: "תצפית קבוע כנף",
    infoArrival: "nextTurn",
    footprint: { width: 100, height: 100 },
    loiterTurns: null, // whole game
    interception: { chance: null, note: "None unless air defence present" },
    strike: { hitChance: 0.7, effectLike: "mortar" },
    autoDetectsVisible: true,
    findChargeChance: 0.5, // 50% to find IEDs (פירים)
    notes: "Shortens artillery/mortar miss distance by 20% inside the footprint.",
  },
  drone: {
    key: "drone",
    name: "רחפן",
    infoArrival: "immediate",
    footprint: { width: 50, height: 50 },
    loiterTurns: 5,
    cooldownTurns: 2, // two turns wait afterwards if batteries available
    interception: { chance: null, note: "Like a target in full cover" },
    strike: { hitChance: 0.3, effectLike: "rifleGrenade" },
    autoDetectsVisible: true,
    findChargeChance: 0.3, // drone: 30% to find charges (מטענים)
  },
};

/** A fixed-wing asset shrinks indirect-fire miss distance within its footprint. */
export const FIXED_WING_MISS_REDUCTION = 0.2;
