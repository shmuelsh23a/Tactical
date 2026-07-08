import type { RangeBand } from "../geometry.js";

/**
 * Explosives table (נפיצים). Each entry captures, as faithfully as possible,
 * the row from the source document: delivery method, the range at which the
 * weapon can be delivered, the blast radius → hit-chance bands, the damage
 * die, rate of fire, and the impact delay (שיהוי) for indirect fire.
 */
export type DeliveryMethod =
  | "assault" // grenade — only during an assault
  | "directFire" // requires line of sight (RPG, tank, ATGM)
  | "indirectFire" // anywhere on the map, with an impact delay (mortar/arty)
  | "mine"; // emplaced, triggered by being stepped on

export interface ExplosiveWeapon {
  key: string;
  /** Hebrew name from the source. */
  name: string;
  delivery: DeliveryMethod;

  /**
   * For direct-fire weapons: probability to hit the aim point by range.
   * For indirect fire this is omitted (delivery anywhere, dispersion handled
   * by the artillery table). For mines, omitted (activation handled below).
   */
  toHitBands?: readonly RangeBand[];
  /** Minimum engagement range, where the source states one (e.g. tank 25 m). */
  minRange?: number;
  /** True when the weapon can range the entire map (mortar/artillery). */
  wholeMap?: boolean;

  /** Blast radius → probability of catching a target in the blast. */
  blastBands: readonly RangeBand[];

  /** Base damage die. */
  damageDice: string;
  /** Damage die override when the target is an armoured vehicle. */
  damageDiceVsArmor?: string;
  /** Damage die override when the target is infantry. */
  damageDiceVsInfantry?: string;

  /** Probability of harming the attacker (grenade self-hit during assault). */
  selfHitChance?: number;
  /** Probability that an emplaced mine actually activates when triggered. */
  activationChance?: number;
  /**
   * When true, a hit on an armoured vehicle is resolved through the armour
   * damage table (location → penetration → effect) rather than as plain HE.
   * Set for dedicated anti-armour munitions.
   */
  usesArmorTable?: boolean;

  /** Rounds available per barrel per turn. */
  roundsPerTurn?: number;
  /** Turns between firing and impact (שיהוי). */
  impactDelayTurns?: number;

  notes?: string;
}

export const EXPLOSIVES: Record<string, ExplosiveWeapon> = {
  grenade: {
    key: "grenade",
    name: "רימון",
    delivery: "assault",
    blastBands: [{ maxRange: 5, value: 0.3 }], // "הסתערות בלבד" — point blank
    damageDice: "1d6",
    selfHitChance: 0.05,
    notes: "Assault only; 30% hit, 5% self-hit.",
  },

  rifleGrenade: {
    key: "rifleGrenade",
    name: "מטול",
    delivery: "directFire",
    toHitBands: [{ maxRange: 100, value: 1 }], // delivered out to 100 m
    blastBands: [{ maxRange: 50, value: 0.4 }],
    damageDice: "1d6",
    notes: "Under-rifle grenade launcher (מטול). Range up to 100 m; 50 m blast at 40%.",
  },

  mortar: {
    key: "mortar",
    name: "מרגמה",
    delivery: "indirectFire",
    wholeMap: true,
    blastBands: [
      { maxRange: 50, value: 0.5 },
      { maxRange: 100, value: 0.25 },
    ],
    damageDice: "1d8",
    roundsPerTurn: 3, // 3 bombs per turn per barrel
    impactDelayTurns: 1,
    notes: "Whole map; 3 bombs/turn/barrel; 1-turn delay.",
  },

  artillery: {
    key: "artillery",
    name: "ארטילריה",
    delivery: "indirectFire",
    wholeMap: true,
    blastBands: [
      { maxRange: 50, value: 0.7 },
      { maxRange: 100, value: 0.5 },
      { maxRange: 200, value: 0.25 },
    ],
    damageDice: "1d10",
    roundsPerTurn: 2, // 2 shells per barrel per turn
    impactDelayTurns: 2,
    notes: "Whole map; 2 shells/barrel/turn; 2-turn delay.",
  },

  tankRound: {
    key: "tankRound",
    name: "פגז טנק",
    delivery: "directFire",
    minRange: 25,
    toHitBands: [
      { maxRange: 300, value: 0.9 }, // 25-300 m
      { maxRange: 500, value: 0.7 }, // 301-500 m
      { maxRange: 1500, value: 0.5 }, // 500-1500 m
    ],
    blastBands: [
      { maxRange: 50, value: 0.5 },
      { maxRange: 100, value: 0.25 },
    ],
    damageDice: "1d8",
    usesArmorTable: true,
    notes: "Direct fire, requires line of sight; min range 25 m.",
  },

  apMine: {
    key: "apMine",
    name: "מטען נ\"א",
    delivery: "mine",
    activationChance: 0.5, // step / 50% activation
    blastBands: [
      { maxRange: 50, value: 0.5 },
      { maxRange: 100, value: 0.25 },
    ],
    damageDice: "1d8",
    damageDiceVsArmor: "1d2",
    notes: "Anti-personnel; 50% activation; 1d2 vs tank.",
  },

  atMine: {
    key: "atMine",
    name: "מטען נ\"ט",
    delivery: "mine",
    activationChance: 0.5,
    blastBands: [
      { maxRange: 50, value: 0.7 },
      { maxRange: 100, value: 0.5 },
      { maxRange: 200, value: 0.25 },
    ],
    damageDice: "1d8",
    damageDiceVsInfantry: "2d10",
    usesArmorTable: true,
    notes: "Anti-tank; 50% activation; 2d10 vs infantry.",
  },

  // מרנ"ט — currently a rocket-propelled grenade (RPG); a guided ATGM will be
  // added as a separate weapon later.
  rpgVsInfantry: {
    key: "rpgVsInfantry",
    name: "RPG (נגד חי\"ר)",
    delivery: "directFire",
    toHitBands: [
      { maxRange: 50, value: 0.4 },
      { maxRange: 200, value: 0.3 },
      { maxRange: 400, value: 0.15 },
    ],
    blastBands: [
      { maxRange: 25, value: 0.5 },
      { maxRange: 50, value: 0.25 },
    ],
    damageDice: "1d8",
    notes: "RPG vs infantry; direct fire, requires line of sight.",
  },

  rpgVsArmor: {
    key: "rpgVsArmor",
    name: "RPG (נגד רק\"מ)",
    delivery: "directFire",
    toHitBands: [
      { maxRange: 200, value: 0.5 },
      { maxRange: 400, value: 0.25 },
      { maxRange: 700, value: 0.1 }, // usable out to 700 m at 10%
    ],
    blastBands: [{ maxRange: 0, value: 1 }], // direct impact on the vehicle
    damageDice: "1d8",
    usesArmorTable: true,
    notes: "RPG vs armour; direct fire, requires line of sight; usable to 700 m.",
  },
};
