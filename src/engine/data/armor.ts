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

/** Whose armour figures a battle plays (rules decision 78). */
export type ArmourFigures = "document" | "research";
export const ARMOUR_FIGURES: readonly ArmourFigures[] = ["document", "research"];

/**
 * What kind of vehicle (rules decision 78). The document has one: a tank. A
 * vehicle made before the decision is a main battle tank.
 */
export type VehicleClass = "mbt" | "heavyApc" | "lightApc" | "soft";
export const VEHICLE_CLASSES: readonly VehicleClass[] = ["mbt", "heavyApc", "lightApc", "soft"];

/** The side of a vehicle a round strikes, from where it was fired and the hull's heading. */
export type ArmourFacing = "front" | "side" | "rear";

/**
 * The chance a hit penetrates, by weapon, vehicle class and the side struck
 * (rules decision 78) — **not the document's**, whose table gives 20% for any
 * weapon from any side. A logistic curve on the weapon's penetration against
 * the armour's (RHA-equivalent), spread by a tenth of the armour; see
 * docs/validation.md, *Armour by weapon, class and facing*.
 *
 * ⚠️ The armour of a Merkava 4 or a Namer is classified: their columns are
 * estimates, not data. The penetrations are published figures read through
 * search summaries (PG-7VL 500 mm, Kornet 1,000 mm, 120 mm APFSDS 700–850 mm).
 * 2006 Lebanon checks the result: about 40–45% of Merkavas hit by ATGMs were
 * penetrated, and 11 of 14 APCs (strategypage, globalsecurity).
 *
 * A track keeps the document's chance whatever the weapon: it is thin from
 * every side. `atMine` strikes the belly, whatever the facing.
 */
export const PENETRATION: Readonly<Record<string, Record<VehicleClass, Record<ArmourFacing, number>>>> = {
  // A tank fires a kinetic round at armour (120 mm APFSDS).
  tankRound: {
    mbt: { front: 0.4, side: 1, rear: 1 },
    heavyApc: { front: 0.6, side: 1, rear: 1 },
    lightApc: { front: 1, side: 1, rear: 1 },
    soft: { front: 1, side: 1, rear: 1 },
  },
  // RPG-7, PG-7VL / VR.
  rpgVsArmor: {
    mbt: { front: 0.02, side: 0.4, rear: 0.9 },
    heavyApc: { front: 0.05, side: 0.5, rear: 0.95 },
    lightApc: { front: 1, side: 1, rear: 1 },
    soft: { front: 1, side: 1, rear: 1 },
  },
  // An anti-tank mine under the hull: a breach of the belly.
  atMine: {
    mbt: { front: 0.2, side: 0.2, rear: 0.2 },
    heavyApc: { front: 0.1, side: 0.1, rear: 0.1 },
    lightApc: { front: 0.9, side: 0.9, rear: 0.9 },
    soft: { front: 1, side: 1, rear: 1 },
  },
};

/**
 * The chance a penetration destroys the vehicle outright, by class (rules
 * decision 78), on top of the table's own (5% on the ammunition). ⚠️ Ours:
 * 1982 and 2006 Lebanon put a penetrated Merkava's loss at about 5% (the
 * table already gives that); an M113 burns far more often, a truck nearly
 * always.
 */
export const CATASTROPHIC_ON_PENETRATION: Readonly<Record<VehicleClass, number>> = {
  mbt: 0,
  heavyApc: 0,
  lightApc: 0.3,
  soft: 0.7,
};

/**
 * Plain HE bursting within its blast of a lightly armoured or soft vehicle
 * (rules decision 78): the chance its fragments go in, resolved as a
 * penetrating hit. A tank and a heavy APC keep the document's track roll.
 * ⚠️ From 1988 US tests (155 mm within 30 m of an APC sent fragments in and
 * caused casualties; *Field Artillery Journal*, as cited second-hand); the
 * figures are ours.
 */
export const HE_FRAGMENTS_IN: Readonly<Partial<Record<VehicleClass, number>>> = {
  lightApc: 0.5,
  soft: 0.8,
};

/** The side of a vehicle facing `bearingToFirer` (from the vehicle) when its hull points `facing`. */
export function armourFacing(facing: number, bearingToFirer: number): ArmourFacing {
  const off = Math.abs(((((bearingToFirer - facing) % 360) + 540) % 360) - 180);
  if (off <= 45) return "front";
  if (off >= 135) return "rear";
  return "side";
}
