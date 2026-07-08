import type { TankPart } from "../types.js";

/**
 * Armour damage table (טבלת נזק שריון). When a round strikes an armoured
 * vehicle, a hit location is rolled from `hitChance` weights; on a hit, a
 * penetration check is made; on a penetration, the location's effect applies.
 */
export type ArmorEffectKind =
  | "crewCasualties" // 1d8 damage, with a per-crew-member hit chance
  | "componentDamage" // accumulates nq"p on the component
  | "criticalChance" // chance of a catastrophic kill
  | "driverCasualty"; // 1d8 damage with a chance to hit the driver

export interface ArmorRow {
  part: TankPart;
  name: string;
  /** Probability this location is the one struck. */
  hitChance: number;
  /** Probability the round penetrates once this location is struck. */
  penetrationChance: number;
  effect: ArmorEffectKind;
  /** Damage die where the effect deals nq"p / casualty damage. */
  damageDice?: string;
  /** Per-individual probability of a casualty (crew/driver) on penetration. */
  casualtyChance?: number;
  /** Flat nq"p applied to the component on penetration. */
  componentDamage?: number;
  /** Probability of a catastrophic (critical) explosion on penetration. */
  criticalChance?: number;
}

/**
 * Damage-point pools that, once filled, cause a mobility kill. These are the
 * nq"p values quoted against the engine and track rows: a penetrating hit
 * deals the full pool (immobilising in one hit), while light HE chips away at
 * the track pool (see {@link HE_VS_ARMOR}).
 */
export const MOBILITY_THRESHOLDS: Partial<Record<TankPart, number>> = {
  hullFront: 8, // engine
  track: 4,
};

/**
 * Plain high-explosive (artillery, mortar, rifle grenade) against an armoured
 * vehicle within its blast radius: a 20% chance to do 2 nq"p to the tracks.
 * Two such hits fill the 4-point track pool and immobilise the vehicle.
 */
export const HE_VS_ARMOR = {
  trackHitChance: 0.2,
  trackDamage: 2,
} as const;

export const ARMOR_TABLE: readonly ArmorRow[] = [
  {
    part: "turret",
    name: "צריח (תא לוחמים)",
    hitChance: 0.2,
    penetrationChance: 0.2,
    effect: "crewCasualties",
    damageDice: "1d8",
    casualtyChance: 0.2, // 20% per crew member
  },
  {
    part: "hullFront",
    name: "תובה-קדמי (מנוע)",
    hitChance: 0.3,
    penetrationChance: 0.2,
    effect: "componentDamage",
    componentDamage: 8, // 8 nq"p
  },
  {
    part: "hullRear",
    name: "תובה-אחורי (תחמושת)",
    hitChance: 0.3,
    penetrationChance: 0.2,
    effect: "criticalChance",
    criticalChance: 0.05, // 5% critical explosion
  },
  {
    part: "track",
    name: "זחל",
    hitChance: 0.1,
    penetrationChance: 0.7,
    effect: "componentDamage",
    componentDamage: 4, // 4 nq"p (mobility)
  },
  {
    part: "driver",
    name: "תא נהג",
    hitChance: 0.1,
    penetrationChance: 0.2,
    effect: "driverCasualty",
    damageDice: "1d8",
    casualtyChance: 0.4, // 40% chance to hit the driver
  },
];
