import type { Echelon, Experience, Motivation } from "../types.js";

/**
 * Morale (מורל), suppression (דיכוי) and soldiers' traits — rules decision 19.
 *
 * **Every number in this file is ours, not the document's.** The mechanics
 * document says nothing about morale: not מורל, not שבירה, not דיכוי, not a
 * table. The author gave the *shape* on 2026-09-22 — six traits of 1–10 per
 * soldier, leadership as intelligence + wisdom + charisma, a starting pool
 * between the scenario's minimum and 100, a live bonus from the chain of
 * command up to battalion, the 50 / 30 / 10 thresholds, a separate suppression
 * layer, states rather than numbers on screen, recovery that is hard and
 * capped, and "a dry pool is dry forever". The magnitudes below are the
 * assumptions that shape was filled in with, all ⚠️, and they are the first
 * thing to revisit when the game is balanced. They live in one place so that
 * doing so is editing a table rather than hunting through the rules.
 */

/** Every trait is 1–10, drawn as the rounded-up mean of two d10: a triangle, mostly 5–6. */
export const TRAIT_DICE = { count: 2, sides: 10 } as const;

/**
 * The scenario's floor for a force's starting pool (the author's "minimum
 * level set in the scenario's specs"), by how motivated the force is. The pool
 * is drawn between the floor and 100.
 */
export const MOTIVATION_FLOOR: Record<Motivation, number> = {
  poor: 40,
  low: 50,
  normal: 60,
  high: 70,
  fanatic: 85,
};

/** What training and time under fire are worth, by experience. */
export const EXPERIENCE: Record<Experience, { test: number; suppression: number }> = {
  /** Added to every morale test and rally roll, in percentage points. */
  green: { test: -10, suppression: 1.25 },
  regular: { test: 0, suppression: 1 },
  veteran: { test: 10, suppression: 0.8 },
  elite: { test: 15, suppression: 0.7 },
};

/** The thresholds the author set, on effective morale. */
export const THRESHOLDS = {
  /** At or below: wavering — tested every few turns. */
  wavering: 50,
  /** At or below: close to breaking — tested every turn. */
  shaken: 30,
  /** At or below: broken without a test. */
  broken: 10,
} as const;

/** How often a wavering soldier is tested, in turns. A shaken one is tested every turn. */
export const WAVERING_TEST_INTERVAL = 3;

/**
 * The morale test: pass on d100 ≤ effective + `base` + `perWisdom` × wisdom +
 * experience. A soldier at 50 with average wisdom passes about nine in ten; at
 * 30, seven in ten.
 */
export const TEST = { base: 30, perWisdom: 2 } as const;

/** A turn's loss this large is a sharp event, and is tested there and then. */
export const EVENT_TEST_LOSS = 12;

/**
 * A failed test is a heroic response instead of a break on d100 ≤ `perLuck` ×
 * luck — the only thing luck does in morale. The hero is not tested for
 * `turns` turns, shoots better, and steadies the men beside him.
 */
export const HEROIC = {
  perLuck: 2,
  turns: 3,
  /** Pool the moment itself is worth, within the ceiling. */
  willGain: 10,
  /** Effective morale his squadmates draw from him while it lasts. */
  squadBonus: 5,
  accuracy: 1.25,
} as const;

/**
 * The live bonus from the chain of command. Each leader whose reach covers a
 * soldier adds leadership ÷ `divisor`, halved for every leader already counted
 * below him, so the nearest link is worth the most; a broken leader counts
 * against instead. The whole is held to ±`cap`.
 */
export const LEADER_BONUS = { divisor: 3, cap: 15 } as const;

/**
 * How far a leader's word carries, by the echelon he commands. A squad leader
 * is with his squad and reaches no one else. The platoon and company figures
 * are the every-turn bands of the פו"ש table — being "under his C2" is being
 * where his orders reach every turn; the battalion figure is ours.
 */
export const LEADER_REACH_M: Partial<Record<Echelon, number>> = {
  platoon: 300,
  company: 500,
  battalion: 1000,
};

/** The highest echelon whose leader counts — the author's "up to battalion". */
export const TOP_LEADER_ECHELON: Echelon = "battalion";

/**
 * Out of every leader's reach, a soldier draws half the charisma of the most
 * charismatic comrade within this distance (the author's fallback, 2026-09-22).
 */
export const FALLBACK_RADIUS_M = 50;

/** Pool lost, per soldier, for what happened to him and around him in a turn. */
export const LOSS = {
  /** His force was shot at, hit or not. */
  firedOn: 1,
  /** Shells or mortar bombs came down on it. */
  bombarded: 5,
  /**
   * He was hit. A hit here is 1d4 of the 8 points that put a man down, so most
   * are light: this is a wound, not a death, and is priced like one.
   */
  wounded: 6,
  /** Each hit on another man of his own force… */
  comradeWounded: 1,
  /** …or put out of the fight. */
  comradeDown: 6,
  /** Each man lost by another friendly force within {@link NEARBY_M}. */
  nearbyDown: 2,
  /** His own squad leader went down. */
  squadLeaderDown: 15,
  /** A commander whose reach covered him went down. */
  commanderDown: 10,
  /** Fired on from two directions at least 90° apart, or from outside his sector. */
  flanked: 8,
  /** The enemy he knows of nearby outnumbers his side there two to one. */
  outnumbered: 3,
  /** Enemy armour he can see nearby, and none of his own. */
  enemyArmour: 4,
  /** A friendly force within {@link CONTAGION_M} broke and ran, or surrendered. */
  friendsBroke: 8,
  /** Each comrade in his own force who broke this turn. */
  comradeBroke: 4,
  /** His own force broke and ran: the rout itself. */
  rout: 10,
  /** The most a soldier loses in one turn, whatever happened. */
  capPerTurn: 30,
} as const;

/** Pool regained, within the ceiling, per soldier per turn. */
export const GAIN = {
  /** His force caused casualties. */
  inflicted: 3,
  /** His force put an enemy force out of the fight. */
  neutralizedEnemy: 6,
  /** Nobody shot at his force and nobody in it was hurt. */
  quiet: 2,
  /** …and no enemy he knows of is within {@link REST_CLEAR_M}. */
  rest: 4,
  /** His own armour is right beside him. */
  friendlyArmour: 1,
} as const;

/**
 * The pool of will: part of every loss is gone for the battle. The ceiling a
 * soldier can recover to falls by this share of each loss (rounded up), so at
 * best half of what a fight takes can ever come back — and a soldier whose
 * ceiling is at or below the break threshold is **dry**, broken for good.
 */
export const PERMANENT_LOSS_SHARE = 0.5;

export const NEARBY_M = 100;
export const CONTAGION_M = 200;
export const OUTNUMBERED_M = 300;
export const OUTNUMBERED_RATIO = 2;
export const ARMOUR_FEAR_M = 300;
export const ARMOUR_COMFORT_M = 100;
export const REST_CLEAR_M = 500;

/**
 * Rallying a broken soldier: hard, by design (author, 2026-09-22). The chance
 * is `perLeadership` × the leader's leadership + experience, less `perRally`
 * for every time this soldier has been rallied before and `underFire` if his
 * force was shot at this turn. A commander must come to him — within
 * `commanderRange` — a squad leader rallies his own squad. The rallied soldier
 * comes back to `baseWill` + half the leader's leadership, within his ceiling.
 */
export const RALLY = {
  perLeadership: 2,
  perRally: 15,
  underFire: 20,
  commanderRange: 50,
  baseWill: 20,
} as const;

/**
 * A broken force with the enemy this close is cornered: it surrenders rather
 * than runs, and its broken men cannot be rallied (ASL's desperation morale).
 * Twice the assault range.
 */
export const CORNERED_M = 50;

/** A routing force runs this far from the nearest enemy when it has no commander to run to. */
export const ROUT_DISTANCE_M = 200;

/**
 * A force breaks when broken men and casualties together reach this share of
 * its strength, or when its men still standing average at or below the break
 * threshold. The same half the document neutralises a force at.
 */
export const FORCE_BREAK_SHARE = 0.5;

/**
 * A side breaks — the battle is over for it — when this share of its fighting
 * strength is down, broken, or in a force that routed or surrendered.
 */
export const SIDE_BREAK_SHARE = 2 / 3;

/**
 * Suppression (דיכוי): a force-level count of how hard it is being shot at,
 * added the moment fire arrives and halved at every end of turn. It is the
 * fast layer — this turn and the next — beside the slow pool of will.
 */
export const SUPPRESSION = {
  /** A burst of small-arms fire at the force, hit or not… */
  directFire: 10,
  /** …plus this for each hit it scored. */
  perHit: 5,
  /** Sustained machine-gun fire suppresses harder. */
  sustainedMgFactor: 1.5,
  /** A direct-fire explosive at the force (RPG, tank round). */
  explosive: 15,
  /** …plus this when it hit. */
  explosiveHit: 15,
  /** Shells or bombs landing on it. */
  indirect: 25,
  /** A charge going off in it. */
  mine: 20,
  /** Being assaulted. */
  assault: 30,
  /** Never more than this. */
  max: 100,
  /** At or above: suppressed — half pace, three-quarter accuracy. */
  suppressed: 15,
  /** At or above: pinned — moves only to withdraw, half accuracy. */
  pinned: 40,
} as const;

/** What a suppressed or pinned force does to its own shooting, and to its men's nerve. */
export const SUPPRESSION_EFFECT = {
  suppressed: { accuracy: 0.75, morale: 5 },
  pinned: { accuracy: 0.5, morale: 10 },
} as const;

/** What a soldier's state does to his own shooting. */
export const STATE_ACCURACY = { steady: 1, wavering: 0.9, shaken: 0.75 } as const;
