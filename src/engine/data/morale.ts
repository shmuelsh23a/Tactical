import type { CombatExperience, Echelon, Experience, ForceType, Motivation } from "../types.js";

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

/**
 * The force-quality matrix (rules decision 83: decision 81's, the author, 2026-10-03): force
 * type × combat experience, read onto the two dials morale already has. The
 * author's shape: three levels a side, morale moved by both, and **the
 * regular, experienced cell is today's force** — `normal` / `regular`, the
 * cell every breakpoint (decisions 44, 49, 67) was set on — so a game that
 * names no quality plays exactly as before.
 *
 * ⚠️ The mapping is ours (2026-10-04). Force type sets the motivation floor:
 * an irregular force is held together by less than a regular one, and an
 * elite one is selected for its will. Combat experience sets `experience` one
 * step a level — green, regular, veteran — and an elite force's training is
 * worth one step more, so its very experienced cell is the only `elite`. No
 * two cells map alike, and each axis only ever steadies a force as it rises.
 * What each cell is worth is measured, not set (docs/balance.md, fifty-eighth
 * round).
 */
export const FORCE_QUALITY: Record<ForceType, Record<CombatExperience, { motivation: Motivation; experience: Experience }>> = {
  irregular: {
    inexperienced: { motivation: "low", experience: "green" },
    experienced: { motivation: "low", experience: "regular" },
    veryExperienced: { motivation: "low", experience: "veteran" },
  },
  regular: {
    inexperienced: { motivation: "normal", experience: "green" },
    experienced: { motivation: "normal", experience: "regular" },
    veryExperienced: { motivation: "normal", experience: "veteran" },
  },
  elite: {
    inexperienced: { motivation: "high", experience: "regular" },
    experienced: { motivation: "high", experience: "veteran" },
    veryExperienced: { motivation: "high", experience: "elite" },
  },
};

/**
 * The quality gap (rules decision 84, the author, 2026-10-04): "the middle,
 * a clash of equal forces, has zero effect, and the extreme — elite against
 * irregular — a very large one", in small arms and the assault only, since
 * most casualties come from explosives and a shell does not care who it
 * lands on. A force's score is its type's step plus its experience's (−2 to
 * +2, regular and experienced 0), and the gap is the shooter's less the
 * target's (−4 to +4). The shooter's chance is multiplied by
 * `extreme` ^ (sign(gap) · bell(gap) / bell(widest)), where
 * bell(g) = 1 − exp(−g² / 2σ²): the normal curve turned over, flat about a
 * fair fight and steep toward the ends. ⚠️ `sigma` and `extreme` are ours:
 * a gap of one step is worth ×1.16, two ×1.65 (about Dupuy's Germans
 * against the Americans in Italy, 1.2–1.5) and the widest ×3 a side, so
 * about ×9 in casualties exchanged (the Arab–Israeli data's 0.43 against
 * 4.91 at even odds, about ×11; docs/validation.md, *Force quality*).
 */
export const QUALITY_STEP: { type: Record<ForceType, number>; experience: Record<CombatExperience, number> } = {
  type: { irregular: -1, regular: 0, elite: 1 },
  experience: { inexperienced: -1, experienced: 0, veryExperienced: 1 },
};
export const QUALITY_GAP = { sigma: 2, extreme: 3, widest: 4 } as const;

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

/**
 * A prepared defender is steadier (author, 2026-09-23: the rule is his, the
 * size ⚠️ ours). A force **in position** — it did not move this turn, and it is
 * behind something: the ground, a building, a hole it dug or a position it
 * prepared — adds `testBonus` to every morale test and takes `lossFactor` of
 * every loss. A force that gets up to attack leaves it behind.
 */
export const PREPARED = { testBonus: 15, lossFactor: 0.75 } as const;

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
 * The same, by posture, on the research figures (rules decision 44, the
 * author, 2026-09-28: "adapt the morale to historical rules of thumb"): an
 * attack stops at about 20–25% losses, and a defence cannot hold at about 40%
 * (FM 105-5, 1964, as the Dupuy Institute reports it — which adds that it
 * has "never found any studies establishing the data", and that the data
 * reject a fixed breakpoint: docs/validation.md, *third pass*; US doctrine
 * calls a unit destroyed at 30%). A side counts down, broken and fled men against these, so they sit
 * above the losses they stand for; they are set so that the **casualties** at
 * the break come out at the rule of thumb in the balance harness — an attacker
 * at a median 19–25%, a defender at 33–49% (docs/validation.md, *Where a side
 * gives up*). The defender's was 0.6 until prepared positions were dug in
 * with overhead cover (decision 48), which left the 2:1 company attack with
 * fire support winning 2%; the author took 0.5 (rules decision 49,
 * 2026-09-28), which centres the defender's casualties on 40% and keeps the
 * 3:1 attack at 75% explosives, and accepted that a 2:1 attack on a dug-in
 * position fails (8%). Below 0.5 the 3:1 attack is a walkover at 87–95%
 * explosives. Which side is attacking is `GameOptions.attackers`; a side not
 * named defends.
 */
export const SIDE_BREAK_BY_POSTURE = { attacking: 0.3, defending: 0.5 } as const;

/**
 * **The attacker gives up at 30% again since rules decision 67** (author,
 * 2026-10-01): decision 66's 40% let a failed attack cost the attacker
 * 19–28% killed and wounded, at or over the top of the sources' 10–25%; at
 * 30% it is 16–22% (docs/balance.md, fortieth round). Decision 66 had raised
 * it from decision 44's 30% to meet the win targets. A game plays
 * `GameOptions.attackerBreakpoint`; a recording carries its own, and one made
 * before decision 66 replays at this, decision 44's 30%.
 */
export const ATTACKER_BREAK_BEFORE_66 = 0.3;

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

/**
 * How far a shell or a bomb suppresses (rules decision 63, S1; author,
 * 2026-09-30). Suppression reaches further than death: FM 7-90 (App. B-7)
 * puts an 81 mm bomb's suppression as probable within **30 m** of the burst
 * and an even chance at **75 m**, little beyond 125 m. A force whose nearest
 * man is within `full` of a burst takes the whole of
 * {@link SUPPRESSION.indirect}, within `half` half of it (the half is ours),
 * beyond that nothing. The nearest man is the force's point less
 * `FORCE_FOOTPRINT_RADIUS_M`. Measured for the 81 mm; another weapon's reach
 * scales by the square root of its lethal area against the mortar's (ours).
 * Before the decision a round suppressed only the forces its lethal blast
 * reached, about 37 m from a force's point for the 81 mm.
 */
export const SUPPRESSION_REACH_81MM = { full: 30, half: 75 } as const;

/**
 * Suppression reach by weapon on the checked figures (rules decision 79):
 * FM 7-90 B-7's own table, read on the page — the 81 mm "within 30 meters
 * … probably", "within 75 meters … a 50 percent chance", "beyond 125
 * meters, little"; the heavy mortar with a proximity fuze 65 / 125 / 200 m,
 * which stands for the 155 mm here (⚠️ the nearest row the FM has). Beyond
 * `half` and within `little` a quarter (⚠️ ours, for "little"). A weapon not
 * in the table scales the 81 mm's by the square root of its lethal area.
 */
export const CHECKED_SUPPRESSION_REACH: Readonly<Record<string, { full: number; half: number; little: number }>> = {
  mortar: { full: 30, half: 75, little: 125 },
  artillery: { full: 65, half: 125, little: 200 },
};

/**
 * A force under a roof — a building, or a position prepared before the
 * battle — takes this share of the suppression a shell or a bomb puts on it
 * (rules decision 63, S3). FM 7-90: men under overhead cover are harder to
 * suppress. The half is ours.
 */
export const ROOF_SUPPRESSION_FACTOR = 0.5;

/**
 * Heads down (rules decision 63, S2; author, 2026-09-30). A pinned soldier
 * keeps his head down: he neither observes nor fires to effect (FM 7-90,
 * FM 6-30). A **pinned** force makes and keeps no sighting beyond
 * `sightWithinM`, so it tells its side nothing further off and cannot be
 * the eyes a fire mission is adjusted by. A **suppressed** force keeps each
 * sighting at `suppressedSightChance`.
 *
 * Its fire: as decision 63 built it, nothing beyond `aimedWithinM`. Since
 * rules decision 65 (author, 2026-09-30: "try pinned firing within rifle
 * range at a penalty") it fires out to `fireWithinM`, the small-arms table's
 * last band, and beyond `aimedWithinM` at `beyondAimFactor` of its chance —
 * over the parapet, with little aim — on top of a pinned force's half
 * accuracy (decision 19). All the numbers but the table's 400 m are ours.
 */
export const HEADS_DOWN = {
  sightWithinM: 50,
  aimedWithinM: 100,
  fireWithinM: 400,
  beyondAimFactor: 0.5,
  suppressedSightChance: 0.5,
} as const;

/**
 * Nerve lost to fire, by cover (rules decision 64; author, 2026-09-30: "nerve
 * lost for a force in the open should be far more severe than for a dug in
 * force"). The two losses the enemy's fire itself costs a man each turn —
 * {@link LOSS}'s `firedOn` and `bombarded` — are multiplied by his force's
 * cover: in the open, behind partial cover, in a hole (full cover), or under
 * a roof (a position prepared before the battle). Losses to casualties,
 * leaders and the rest are not. The prepared defender's `lossFactor` still
 * applies on top. The four numbers are ours: the open about thirteen times
 * a prepared position, which the WWII figures for the danger itself put at
 * fifteen to a hundred (docs/validation.md, *Mortars against men dug in*).
 */
export const NERVE_BY_COVER = { none: 1, partial: 1, full: 0.3, roof: 0.15 } as const;

/**
 * **The open is ×1 since rules decision 66** (author, 2026-09-30: "open ×1"),
 * still about seven times a prepared position; decision 64 had ×2. A game
 * plays `GameOptions.nerveInOpen`; a recording made before replays at this.
 */
export const NERVE_IN_OPEN_BEFORE_66 = 2;

/**
 * Assaulted while pinned or suppressed (rules decision 63, S5; author,
 * 2026-09-30: "roll between surrender and rout"). Before an assault is
 * resolved, each man of a defender that is pinned or suppressed tests his
 * nerve as decision 19 tests it, less `pinned` or `suppressed`. A force the
 * tests break gives itself up at `surrenderChance`, else runs. In Operation
 * Veritable (1945) about 20 Germans surrendered for each casualty, the
 * assault arriving as the fire lifted (Swann, reanalysed by Rooney). All
 * three numbers are ours.
 */
export const ASSAULT_NERVE = { pinned: 20, suppressed: 10, surrenderChance: 0.5 } as const;

/** What a suppressed or pinned force does to its own shooting, and to its men's nerve. */
export const SUPPRESSION_EFFECT = {
  suppressed: { accuracy: 0.75, morale: 5 },
  pinned: { accuracy: 0.5, morale: 10 },
} as const;

/** What a soldier's state does to his own shooting. */
export const STATE_ACCURACY = { steady: 1, wavering: 0.9, shaken: 0.75 } as const;
