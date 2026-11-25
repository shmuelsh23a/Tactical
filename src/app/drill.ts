import {
  ASSAULT_RANGE_M,
  EXPLOSIVES,
  FACINGS,
  facingOf,
  GOES_INSIDE,
  RIFLE_GRENADIERS,
  angleBetween,
  distanceToPolygon,
  pointInPolygon,
  bearingDegrees,
  distance,
  suppressionLevel,
  type Facing,
  type Game,
  type MapObject,
  type MovementMode,
  type Point,
  type Side,
  type AssaultResult,
  type DirectExplosiveResult,
  type DirectFireResult,
  type StandingOrderExecution,
  type Unit,
  type WithCoveringFire,
  MASKED_BY_FRIENDS,
} from "../engine/index.js";
import { hasEyesOn, sideView } from "./hotseat.js";
import { HOLD_SHORT_M, platoonKey, type CompanyOrders } from "./company.js";
import { bestVantages, isDeadGround } from "./deadGround.js";

/**
 * The squad drill (backlog 15 and 20): how a simulated subordinate carries out
 * the order it was given — bounds, overwatch, fire sectors, when to open fire,
 * when to assault, when to break contact.
 *
 * **It is data.** A drill is a {@link SquadDrill}, a handful of named numbers
 * and switches, interpreted by the small executor below; nothing about a
 * particular doctrine is written into the code. That is what the TTP editor
 * (backlog 20) will edit, so it must stay a description a form can hold.
 *
 * Three rules it keeps, and must go on keeping:
 * - **It decides; the engine resolves.** It emits the actions a player clicks
 *   — standing orders, fire, assaults, postures, the command group's moves —
 *   and never touches a rule or a roll.
 * - **It sees what its side sees.** Everything it knows of the enemy comes from
 *   `sideView` — where each enemy was **last seen**, not where it is — never
 *   from `game.units`.
 * - **It is measurable.** The balance harness (src/sim/balance.ts) plays any
 *   drill, so a doctrine can be put to numbers.
 */
export interface SquadDrill {
  name: string;
  /**
   * The arc a force takes as its own to shoot into, in degrees, centred on its
   * axis — towards the objective for an attacker, towards the threat for a
   * defender. 360 is "anything in reach". A narrower sector spreads a
   * platoon's fire across the enemy's frontage instead of every squad firing
   * at the nearest enemy.
   */
  sectorWidth: number;
  /** With nothing in its sector, a force may shoot at anything in reach. */
  engageOutsideSector: boolean;
  /** How far a force bounds once in contact, and at what gait. Out of contact it walks. */
  bound: { metres: number; gait: MovementMode };
  /** Bounding overwatch: in contact, half the forces bound while half hold and shoot. */
  overwatch: boolean;
  /** The furthest an attacker shoots, in metres. */
  attackFireRange: number;
  /** A defender holds its fire until the enemy is this close. */
  openFireRange: number;
  /** A defender with nothing to shoot at covers its front (חיפוי). */
  coverWhenIdle: boolean;
  /**
   * Assault inside this range, throwing this many grenades — a man on the
   * research figures (rules decision 46), for the force on the document's.
   */
  assault: { range: number; grenades: number };
  /**
   * The breach (decisions 124–125, the author's rulings of 2026-11-19): an
   * attacking side's breach squad charges a wall of every house it knows an
   * enemy to be in — the wall in reach nearest it, never the front door's
   * face — and does not clear; the squads that would assault that house hold
   * until the charge is set, then go in by it. A second charge on another
   * wall if the first is lost and the squad still fit, then the door. The
   * rest stop waiting after `waitTurns` turns (⚠️ ours). Absent: no breach.
   */
  breach?: { waitTurns: number };
  /**
   * The squad's grenadiers (author, 2026-09-28): one 40 mm launcher for every
   * `menPerLauncher` men still fighting — two in a nine-man squad, one in a
   * fire team, as a NATO squad carries them. Each fires rifle grenades at the
   * force's target, alongside its rifles, once the target is inside the
   * weapon's range (the document's 100 m). Null: a squad of riflemen only.
   */
  grenadiers: { menPerLauncher: number } | null;
  /**
   * Heavy weapons (2026-10-03, ⚠️ ours — a drill, until doctrine gives one).
   * A tank fires its main gun at its target out to `tankGunRange`, as FM
   * 3-06.11 has tanks support infantry against buildings; a squad whose
   * target is a vehicle fires its RPG at it out to `rpgRange`. Absent: a
   * vehicle fires its coaxial gun only, and a squad carries no RPG — as
   * every drill did before buildings and armour were modelled (decisions
   * 76–78).
   */
  heavyWeapons?: { tankGunRange: number; rpgRange: number };
  /**
   * Break contact: a force whose ready men fall below `readyShareBelow` of its
   * strength withdraws `fallBack` metres away from the enemy — before it
   * breaks, rather than after. Null: it fights until morale decides.
   */
  breakContact: { readyShareBelow: number; fallBack: number } | null;
  /** An attacker's command groups follow this far behind the centre of their forces; a defender's stay put. */
  commandGroupBehind: number;
  /**
   * Move off a shelled position (author, 2026-09-23): a defending force whose
   * men have gone to ground under shellfire, with no enemy it knows of within
   * `contactWithin` metres, runs `metres` to the rear — once. It leaves its
   * prepared position, roof and all, for ground the enemy's guns have not
   * registered. Absent: it stays in its hole.
   *
   * `alternateOnly`: only a force with an alternate position prepared for it
   * goes, and to that — "an alternate position … when the primary position
   * becomes untenable" (ATP 3-21.8 (2024), para 5-22; drill audit, D6) —
   * never one holding a house, which leaves only by its commander's order
   * (decision 106).
   *
   * `untenable` (decision 121, the author, 2026-10-24): it goes only when
   * the position "becomes untenable" (para 5-22) — the force shelled this
   * turn or last, pinned, and an enemy seen this turn or last within
   * `enemyWithin` metres of it on any bearing — in place of the
   * `contactWithin` guard, which kept it from going with an enemy near. Any shelling at all moved it too soon: the
   * attack took the post it left (balance.md, the probe of 2026-10-24).
   */
  displace?: { metres: number; contactWithin: number; alternateOnly?: boolean; untenable?: { enemyWithin: number } };
  /**
   * Counterattack (rules decision 60, author 2026-09-30: "a squad in reserve;
   * platoon counterattacks by drill"). A defending platoon's reserve
   * ({@link DrillTask.reserves}) holds its own position until one of the
   * platoon's forward positions is lost, and then retakes it without waiting
   * for an order. A position is lost when the squad that held it is out of
   * the fight or gone from it (not moved on purpose to its alternate
   * position) and an enemy seen this turn or last is within `lostWithin`
   * metres of it. The reserve takes the lost position nearest it, goes at
   * `gait` for the enemy nearest that position, assaults it by the drill's
   * assault rule, and once no enemy is seen on the position it takes the
   * position and holds it. A mark older than that (decision 57) does not
   * count: the enemy may have gone. Null: the reserve stays where it is and
   * fights from there. `holdFire`: until it is committed the reserve does
   * not give itself away — no fire, no assault (the author, 2026-10-21,
   * decision 105: "farther back, holding fire").
   *
   * `flank`: the reserve goes in from the side — first to a point this many
   * metres to one side of the lost post, across the enemy's line of
   * approach, the side nearer it, in the nearest cover there — "from a new
   * or unexpected direction" (ATP 3-21.8 (2024), para 3-105; drill audit,
   * D6). With the enemy already in assault reach, it goes straight in.
   * Absent: straight at him.
   */
  counterattack: { lostWithin: number; gait: MovementMode; holdFire?: boolean; flank?: number } | null;
  /**
   * Shoot back at what is shooting at you (Battle Drill 2 step 11a(1): the
   * squad in contact "destroys or suppresses enemy weapons that are firing
   * most effectively against it"; 2A step 6c(2) puts crew-served weapons
   * first). `since` is how many turns of incoming fire to weigh.
   *
   * Without it a force shoots at the **nearest** enemy in its sector,
   * which is ours and is not a doctrinal rule at all.
   *
   * It reads `Game.fireReceived`, the umpire's record of who fired on this
   * force — and only counts a firer the side actually holds a mark on, so
   * a force does not learn where an unseen enemy is by being shot by it.
   */
  returnFire?: { since: number };
  /**
   * Greatest threat first, and no piling on (drill audit, A6/D2; the
   * author's ruling 6, both sides). In the fire phase a force takes, in
   * order: who is firing on it (`returnFire`'s weight), whatever its sector;
   * then, of the rest, a crew-served weapon or a vehicle before riflemen —
   * "enemy weapons that are firing most effectively against it" (Battle
   * Drill 2 step 11a(1)), "crew-served weapons first" (2A step 6c(2)), "the
   * greatest threat first" (ATP 3-21.8 (2024), para A-3) — in its sector
   * before outside it, the nearest first; and an enemy already pinned only
   * when nothing else is in reach ("avoid target overkill", para A-6). A
   * pinned enemy is something a firer can watch happen, as the suppression
   * gate reads it.
   *
   * Absent: the nearest in the sector (with `returnFire`, whoever is firing
   * on it first, and then only inside the sector).
   */
  threatFirst?: boolean;
  /**
   * A defending platoon opens fire together (drill audit, D4): once one of
   * its forces has fired, the rest fire from the next turn at anything in
   * the drill's attack range — "a trigger line … to initiate and mass fires
   * into an engagement area" (ATP 3-21.8 (2024), para 5-208). Absent: each
   * force holds to `openFireRange` by itself, and the nearest gives itself
   * away alone.
   */
  massedOpening?: boolean;
  /**
   * Flank and rear security (Battle Drill 2 step 10: the squads not in
   * contact observe "to the flanks and rear of the platoon"; step 12b
   * deploys the last squad to it). A platoon the company puts on
   * `security` holds where it stands and watches the reverse of the axis
   * to the objective, in an arc this wide — the one direction the rest of
   * the company has its back to. Absent: a security platoon still holds,
   * but watches all round like anything else.
   */
  security?: { arc: number };
  /**
   * The base of fire shifts rather than stops (Battle Drill 2 step 13b(3):
   * "the prearranged signal for the base-of-fire element to lift **or
   * shift** direct fires to the **opposite flank** of the enemy position",
   * with the warning that "the assault element MUST pick up and maintain
   * effective fires throughout the assault — handover of responsibility
   * for direct fires ... is critical"; step 13b(5) adds that the base of
   * fire "must be able to identify the **near flank** of the assaulting
   * squad(s)").
   *
   * So once the assault is in, a supporting force keeps firing, but takes
   * its targets from the far side of the objective: the enemy further than
   * `clear` metres from the nearest assaulting squad, so its fire falls
   * away from the men going in rather than across their front. With
   * nothing that far out it holds its fire rather than shoot into the
   * assault — which is the handover.
   *
   * Absent: a base of fire shoots at whatever its sector gives it, assault
   * or no assault, which is ours and is how every table before 2026-10-11
   * was measured.
   */
  shiftToFarFlank?: { clear: number };
  /**
   * The leader goes forward (Battle Drill 2 step 4). An attacking command
   * group follows `behind` metres back from whichever of its own forces is
   * nearest the enemy, instead of `commandGroupBehind` from the centre of
   * all of them — so it closes on the contact as the fight develops. It is
   * not free: a command group further forward is a command group that can
   * be lost (decision 55).
   *
   * Absent: it keeps station on the centre, which is ours.
   */
  leaderForward?: { behind: number };
  /**
   * Consolidate on the objective (Battle Drill 2 step 14; 2A step 12). A
   * force that has taken its objective — on it, with no enemy it knows of
   * within `nothingWithin` metres — does not simply stand there:
   *
   * - it takes a **sector of fire** `arc` degrees wide, facing on past the
   *   objective, which is where a counterattack comes from (step 14c, "the
   *   platoon leader assigns sectors of fire for each squad"; step 14d puts
   *   the key weapons on the most dangerous approach);
   * - it **holds** where it is instead of wandering on; and
   * - it **covers** that arc rather than hunting a target (step 14h, the
   *   observation posts "to warn of enemy counterattacks").
   *
   * Not yet the digging. Step 14f has the men take hasty defensive
   * positions, and the engine only prepares a position in the planning
   * phase (`prepareAlternatePosition`), so a force that has just taken an
   * objective cannot improve its cover there. That is the one part of
   * consolidation still missing, and it is the part that would most help
   * against the counterattack.
   *
   * Absent: a force that has taken a position stands on it in the open,
   * facing the way it came — which is ours, and is the asymmetry the
   * defender's reserve has been counterattacking into (decision 60).
   */
  consolidate?: {
    nothingWithin: number;
    arc: number;
    /**
     * Across to the far side (ATP 3-21.10 (2026) para 2-181: the squads
     * "move quickly across the objective. When they reach the far side, they
     * take up hasty fighting positions and continue to fire at the
     * withdrawing enemy"): this many metres past the objective along the
     * line of attack, in the nearest cover there (`coverInPlace`), and no
     * further — a company does not pursue on its own (para 2-3; decision
     * 130). Absent: it consolidates where it stands, as before 2026-11-23.
     */
    farSide?: number;
  };
  /**
   * Halting and bounding into cover (drill audit, A5). Once in contact, a
   * squad that halts takes the nearest cover within `within` metres of
   * where it stands — "the squads not in contact [take up] covered and
   * concealed positions in place" (Battle Drill 2 step 10) — and a bound
   * ends in the nearest cover within `within` of where it would have
   * stopped: "the moving fire team proceeds to the next covered position"
   * (step 13b(6)(e)). With none that near, it stops where it is.
   *
   * Absent: a halt is wherever the squad stood, and a bound ends at a
   * point, in the open or not — ours.
   */
  coverInPlace?: { within: number };
  /**
   * A defender plans its fires in depth (decision 119, the author's ruling
   * of 2026-10-23: for doctrine only): of its five targets, one far out and
   * one behind its positions (`planDefenderFires`). Absent: all five close,
   * as before — the untrained variant's plan.
   */
  fireInDepth?: boolean;
  /**
   * Screening smoke from the squad's own launchers (Battle Drill 2 step
   * 11a(3): the squad in contact "places **screening smoke** (M203 and
   * M320) to prevent the enemy from seeing the manoeuvre element"; 2A step
   * 6c(3) the same). A supporting force whose company has gone in puts a
   * grenade screen on the enemy position it can reach, up to `screens` of
   * them a battle, and not on one already screened.
   *
   * The doctrinal purpose is worth keeping in view: it is there to break
   * the enemy's **sight** of the assault, not to hurt him. Our grenadiers
   * fire HE only (`grenadiers`), and smoke has so far been a mortar
   * mission the company calls — so a squad has had no way to screen its
   * own manoeuvre. Grenade smoke costs no fire mission (decision 56).
   */
  screeningSmoke?: { screens: number };
  /**
   * Fight as fire teams (**Battle Drill 2A**, Conduct a Squad Assault,
   * 07-SQD-D9515). A squad that comes into contact splits itself: the part
   * being shot at stays where it is and becomes the **support by fire**
   * team (step 6b), and the part that is not in contact becomes the
   * **assault** team (the note at step 7) and goes on.
   *
   * This is the drill that could not be expressed at all until a commander
   * could make a team out of his own men (`Game.detachTeam`, decision 89):
   * with a squad as one token there is no such thing as half of it firing
   * while the other half moves.
   *
   * - `splitAt`: how near a known enemy a squad has to be before it
   *   divides — contact, in the drill's terms ("the drill begins when the
   *   enemy initiates direct fire contact").
   * - `minMen`: a squad below this strength does not divide. Two men
   *   fighting as two forces of one is not a fire team, and each would be
   *   finished by its first casualty.
   *
   * ⚠️ Both numbers are ours, and so is the even split: a NATO squad is
   * two fire teams of four, so half the men is the doctrinal shape, but
   * which half is a leader's choice the drill does not standardise.
   */
  fireTeams?: { splitAt: number; minMen: number };
  /**
   * How far a machine gun team engages (rules decision 90, ATP 3-21.8
   * para C-119 and its Appendix C table: the M240-series reaches an area
   * target at **800 m** on its bipod). A force carrying a medium machine
   * gun (`Unit.mediumMg`) shoots this far instead of the drill's rifle
   * ranges, which is the point of having one in a base of fire.
   *
   * Absent: a machine gun team engages at `attackFireRange` /
   * `openFireRange` like everything else.
   */
  machineGuns?: { range: number };
  /**
   * A base of fire needs a **field of fire**, not only cover (ATP 3-21.8
   * (2024) para **3-102**: the base-of-fire element "occupies positions
   * that afford the best possible cover and concealment, **a clear view,
   * and clear fields of fire**").
   *
   * Without this, a supporting platoon halts as soon as it is within
   * `attackFireRange` of the enemy and fires from wherever it happens to
   * be — which, when its company waited in dead ground, is ground chosen
   * for having *no* line of sight to the objective. Measured: zero of
   * fourteen forces firing, turn after turn, with three to six of them in
   * range and unable to see (docs/balance.md, *Does suppression pay?*).
   *
   * With it, a supporting force that cannot see the enemy it knows of
   * moves to the nearest position that can (`bestVantages`, the same
   * finder the scouts' observation points use), no closer than
   * `minRange` to it.
   */
  baseOfFirePosition?: { minRange: number };
  /**
   * How a squad scouts, when its company sends it ahead (rules decisions
   * 52–54; which squads, from where and for how long are the company's, in
   * `company.ts`). A scout walks, looks harder and holds its fire, so what
   * it sees stays on its side's map and its guns have eyes. `watchTurns`:
   * bound and observe — after each 50 m bound it halts and watches this many
   * turns before the next; a force that has stopped is one that looks (rules
   * decision 53), one that walks on finds a still enemy only within 20 m.
   * 0 or absent: it walks on.
   */
  scouting?: { watchTurns?: number };
}

/**
 * How a squad carries its grenadiers (author, 2026-09-28): one 40 mm launcher
 * for every four men still fighting. The drills' default, and the live
 * game's: a player's squad fires its grenadiers with its rifles, as a
 * simulated one does (rules decision 45).
 */
export const SQUAD_GRENADIERS = RIFLE_GRENADIERS; // the engine's figure (data/explosives.ts)

/**
 * The plain script the balance harness first measured with: everyone shoots
 * the nearest enemy in reach, half bound while half fire, nobody breaks
 * contact. Kept as the baseline a drill is compared against.
 */
/**
 * A tank's main gun out to 1,500 m, and an RPG at armour out to 300 m.
 * ⚠️ Ours: the RPG-7's table runs to 700 m at 10%, but crews hold their
 * shot to about 300 m, where it hits a quarter of the time or better.
 */
const HEAVY_WEAPONS = { tankGunRange: 1500, rpgRange: 300 } as const;

export const PLAIN_SCRIPT: SquadDrill = {
  name: "plain script",
  sectorWidth: 360,
  engageOutsideSector: true,
  bound: { metres: 100, gait: "run" },
  overwatch: true,
  attackFireRange: 400,
  openFireRange: 400,
  coverWhenIdle: true,
  assault: { range: 25, grenades: 1 },
  grenadiers: SQUAD_GRENADIERS,
  heavyWeapons: HEAVY_WEAPONS,
  breakContact: null,
  commandGroupBehind: 80,
  counterattack: { lostWithin: 50, gait: "run", holdFire: true },
  // A base of fire goes where it can see (ATP 3-21.8 (2024), para 3-102), and a machine gun
  // shoots as far as it reaches (decision 90): without them a platoon on support sat blind in
  // the dead ground it waited in, and a base of fire lost to massing (decision 112).
  machineGuns: { range: 800 },
  baseOfFirePosition: { minRange: 150 },
};

/**
 * A Western squad drill, in the game's terms (⚠️ ours, a first draft for the
 * author and the TTP editor to correct):
 * - **sectors of fire** — each force engages what is in front of it, in a 60°
 *   arc on its axis, and only strays when its sector is empty;
 * - **bounding overwatch** in pairs, short rushes (50 m) at a run;
 * - the attacker **opens fire at 300 m**, where the rifle table starts to pay;
 * - the defender **holds fire to 200 m** — fire discipline, so the first
 *   volley lands where it is worth most and the position stays hidden until
 *   then;
 * - a force **breaks contact** at half strength rather than waiting to rout;
 * - a defending platoon's reserve **counterattacks** a lost position at a run
 *   (the author's rule, decision 60; the 50 m that makes a position lost is
 *   ours).
 */
export const WESTERN_DRILL: SquadDrill = {
  name: "western drill",
  sectorWidth: 60,
  engageOutsideSector: true,
  bound: { metres: 50, gait: "run" },
  overwatch: true,
  attackFireRange: 300,
  openFireRange: 200,
  coverWhenIdle: true,
  assault: { range: 25, grenades: 1 },
  grenadiers: SQUAD_GRENADIERS,
  heavyWeapons: HEAVY_WEAPONS,
  breakContact: { readyShareBelow: 0.5, fallBack: 150 },
  commandGroupBehind: 80,
  counterattack: { lostWithin: 50, gait: "run", holdFire: true },
};

/**
 * The doctrinal drill: the western drill with every gap from
 * docs/doctrine-gap.md that lives at squad level turned on, so the set can
 * be measured as one thing (rung A of the ladder in that file).
 *
 * The numbers are still ours — the drills give the steps and their order,
 * not thresholds — but each switch now does what a numbered step says
 * rather than what we invented. Cited by option, in `SquadDrill` above.
 *
 * No **`breakContact`** reflex: the Break Contact drill (07-PLT-D9505)
 * starts "on orders", and a squad that cannot go on suppresses (Battle
 * Drill 2 step 13c). A defender breaks on its commander's criteria
 * (decision 107); an attacking squad fights on (drill audit, A4).
 *
 * ⚠️ Not yet doctrinal, and deliberately so:
 * - **`bound.metres`** stays a fixed distance where the drills give the
 *   leader a distance and direction per bound.
 * - **`holdShort`** (the fire plan's, in `company.ts`) is **against** the
 *   drill: the note at step 12 says the platoon leader "does not wait for
 *   indirect fires before continuing". The author ruled on 2026-10-11 that
 *   doctrine wins, so it is no longer a default here — the suppression
 *   gate is the doctrinal reason to hold, and waiting on our own shells is
 *   a recorded variant.
 */
export const DOCTRINAL_DRILL: SquadDrill = {
  ...WESTERN_DRILL,
  name: "doctrinal (rung A)",
  breakContact: null,
  returnFire: { since: 2 },
  threatFirst: true,
  massedOpening: true,
  security: { arc: 120 },
  shiftToFarFlank: { clear: 100 },
  leaderForward: { behind: 50 },
  // Fifty metres across (⚠️ ours, decision 130): inside `nothingWithin`, so the far side is still the objective.
  consolidate: { nothingWithin: 100, arc: 120, farSide: 50 },
  coverInPlace: { within: 25 },
  fireInDepth: true,
  displace: { metres: 100, contactWithin: 300, alternateOnly: true, untenable: { enemyWithin: 50 } },
  counterattack: { lostWithin: 50, gait: "run", holdFire: true, flank: 100 },
  screeningSmoke: { screens: 4 },
  fireTeams: { splitAt: 300, minMen: 6 },
  machineGuns: { range: 800 },
  baseOfFirePosition: { minRange: 150 },
  // Two turns to set a charge, one to reach the wall, a second try: six (⚠️ ours).
  breach: { waitTurns: 6 },
};

/**
 * The drill the game is measured with and the computer fights by (the
 * author's ruling on the drill audit, 2026-10-21: the doctrinal drill,
 * fixed). The plain script stays, as the recorded "untrained" variant to
 * compare against (`--drill plain`).
 */
export const REFERENCE_DRILL: SquadDrill = DOCTRINAL_DRILL;

/** What one side has been told to do: attack towards a point, or hold facing one. */
export interface DrillTask {
  side: Side;
  attacking: boolean;
  /**
   * The map's extent, for the drill's own position-finding — a base of fire
   * looking for a field of fire (`baseOfFirePosition`). Absent: it makes do
   * with where it stands.
   */
  extent?: { width: number; height: number };
  /** For an attacker, where it is going; for a defender, where the threat comes from. */
  objective: Point;
  /**
   * The company's orders for the turn (`company.ts`): which forces scout and
   * from where, and whether the rest hold. A scout bounds and observes to its
   * observation point and lies up there; if it sees nothing from it for
   * {@link SCOUT_GIVE_UP_TURNS} turns it goes on toward the objective,
   * unless its commander decides that (`scoutsStay`). Absent: every force fights by the drill alone.
   */
  company?: CompanyOrders;
  /**
   * A defender's reserves (rules decision 60, `Scenario.reserves`): each
   * holds until a forward position of its own platoon ({@link platoonKey})
   * is lost, then retakes it by the drill's `counterattack`. Every other
   * defending squad holds a forward position: the one it stood on when the
   * drill first saw it.
   */
  reserves?: ReadonlySet<string>;
  /**
   * An attacker's limit of advance (FM 3-90 (2023) para A-53; decision 130):
   * no force of it goes past the line, and once the objective is seized one
   * fresh squad is pushed out to it as security. Absent: none, as before.
   */
  limitOfAdvance?: LimitOfAdvance;
  /**
   * The order's sectors of fire (FM 3-90 (2023) para A-83; decision 131):
   * each named platoon engages first in its half of the objective, and
   * shifts to the other half — its secondary, the other platoon's primary —
   * only when nothing is in reach there. Absent, or a platoon not named:
   * the drill's own arc, as before.
   */
  sectors?: SectorsOfFire;
  /**
   * The order's boundary (FM 3-90 (2023) para A-16; decision 132): each named
   * platoon moves only in its lane, west or east of the line of attack, from
   * the start line to {@link BOUNDARY_SHORT_M} short of the objective; it may
   * fire across only where no friend can be hit, and asks the commander to
   * redraw the line when it holds it back. Mutable: a granted request moves it.
   */
  boundary?: Boundary;
}

/**
 * A boundary as the drill reads it: the line of attack from `from`, moved
 * `shiftWestM` metres toward the west by granted requests, ending `endAlong`
 * metres along it. Past the end a force is in no lane.
 */
export interface Boundary {
  from: Point;
  /** Unit vector along the line of attack. */
  along: Point;
  /** Unit vector square to it, into the west lane (as `SectorsOfFire.west`). */
  west: Point;
  endAlong: number;
  shiftWestM: number;
  /** Each laned platoon's lane, by `platoonKey`. */
  byPlatoon: Readonly<Record<string, SectorHalf>>;
}

/** The boundary ends this far short of the objective's centre: the objective itself is not split (A-16; the author, decision 132). */
export const BOUNDARY_SHORT_M = 100;

/** The boundary of an order, on the line from `from` (the start line) toward `objective`. */
export function boundaryFrom(from: Point, objective: Point, byPlatoon: Readonly<Record<string, SectorHalf>>): Boundary {
  const d = distance(from, objective) || 1;
  const along = { x: (objective.x - from.x) / d, y: (objective.y - from.y) / d };
  const square = { x: -along.y, y: along.x };
  const west = square.x <= 0 ? square : { x: -square.x, y: -square.y };
  return { from, along, west, endAlong: Math.max(0, d - BOUNDARY_SHORT_M), shiftWestM: 0, byPlatoon: { ...byPlatoon } };
}

/** How far west of the boundary a point is (negative: east of it). */
export function westOfBoundary(b: Boundary, p: Point): number {
  return (p.x - b.from.x) * b.west.x + (p.y - b.from.y) * b.west.y - b.shiftWestM;
}

/** Which lane a point is in; undefined past the boundary's end, where there are none. */
export function laneOf(b: Boundary, p: Point): SectorHalf | undefined {
  if ((p.x - b.from.x) * b.along.x + (p.y - b.from.y) * b.along.y > b.endAlong) return undefined;
  return westOfBoundary(b, p) >= 0 ? "west" : "east";
}

/** The ends of the boundary as it now runs, for drawing. */
export function boundaryEnds(b: Boundary): [Point, Point] {
  const at = (t: number): Point => ({ x: b.from.x + b.along.x * t + b.west.x * b.shiftWestM, y: b.from.y + b.along.y * t + b.west.y * b.shiftWestM });
  return [at(0), at(b.endAlong)];
}

/** A half of the objective, split by the line of attack through its centre (decision 131). */
export type SectorHalf = "west" | "east";

/**
 * Sectors of fire as the drill reads them: the line of attack through the
 * objective splits the ground in two, and `west` is the unit vector square
 * to it on the side of the lesser x (the map's west, as a flank's side is).
 */
export interface SectorsOfFire {
  objective: Point;
  /** Square to the line of attack, pointing into the west half. */
  west: Point;
  /** Each sectored platoon's primary half, by `platoonKey`. */
  byPlatoon: Readonly<Record<string, SectorHalf>>;
}

/** The sectors of an order, on the line from `from` (the start line) through `objective`. */
export function sectorsFrom(from: Point, objective: Point, byPlatoon: Readonly<Record<string, SectorHalf>>): SectorsOfFire {
  const d = distance(from, objective) || 1;
  const along = { x: (objective.x - from.x) / d, y: (objective.y - from.y) / d };
  // Square to the line of attack; of its two senses, the one toward the lesser x is west.
  const square = { x: -along.y, y: along.x };
  const west = square.x <= 0 ? square : { x: -square.x, y: -square.y };
  return { objective, west, byPlatoon: { ...byPlatoon } };
}

/** Which half of the objective a point is in (on the line itself: west). */
export function halfOf(s: SectorsOfFire, p: Point): SectorHalf {
  return (p.x - s.objective.x) * s.west.x + (p.y - s.objective.y) * s.west.y >= 0 ? "west" : "east";
}

/**
 * A limit of advance as the drill reads it: a line through `at`, square to
 * `beyond`, the unit vector pointing past it, away from the attacker.
 * `halfWidth` is only how much of it is drawn.
 */
export interface LimitOfAdvance {
  at: Point;
  beyond: Point;
  halfWidth: number;
}

/** Half the drawn width of a limit of advance: it stops a force anywhere along it, so it is drawn across the map. */
export const LOA_HALF_WIDTH_M = 1500;

/** The limit of advance `metres` past `objective` on the line from `from`, square to it. */
export function limitOfAdvanceFrom(from: Point, objective: Point, metres: number): LimitOfAdvance {
  const d = distance(from, objective) || 1;
  const beyond = { x: (objective.x - from.x) / d, y: (objective.y - from.y) / d };
  return { at: { x: objective.x + beyond.x * metres, y: objective.y + beyond.y * metres }, beyond, halfWidth: LOA_HALF_WIDTH_M };
}

/** Whether an enemy is in `u`'s primary sector, when the order gave its platoon one; undefined when not. */
export function sectorOf(task: DrillTask, u: Unit): ((e: Unit) => boolean) | undefined {
  const s = task.sectors;
  const half = s?.byPlatoon[platoonKey(u.id)];
  return s && half ? (e: Unit) => halfOf(s, e.position) === half : undefined;
}

/** How far past the limit a point is, in metres; negative short of it. */
export function pastLimit(loa: LimitOfAdvance, p: Point): number {
  return (p.x - loa.at.x) * loa.beyond.x + (p.y - loa.at.y) * loa.beyond.y;
}

/** Kept this far short of the limit, so a force stopped at it stands on its own side (ours). */
const LOA_SHORT_M = 5;

/** A destination held short of the limit: moved back along the way from `from` to stop at it. */
export function shortOfLimit(loa: LimitOfAdvance, from: Point, to: Point): Point {
  const over = pastLimit(loa, to) + LOA_SHORT_M;
  if (over <= 0) return to;
  const along = pastLimit(loa, to) - pastLimit(loa, from);
  // Going across the line: stop on the way at it. Already at it or going along it: square back onto it.
  if (along > 0 && pastLimit(loa, from) + LOA_SHORT_M <= 0) {
    const k = (-LOA_SHORT_M - pastLimit(loa, from)) / along;
    return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
  }
  return { x: to.x - loa.beyond.x * over, y: to.y - loa.beyond.y * over };
}

/** Turns scouts watch from their observation point, seeing nothing, before they go on. */
export const SCOUT_GIVE_UP_TURNS = 6;

/**
 * What a drilled side did, for whoever has to tell a player about it: the
 * browser game's computer opponent words each action into the live log as a
 * player's own would be. Every hook is optional, and a drill run without a
 * reporter (the headless harness) acts exactly as it always has.
 */
export interface DrillReport {
  /** Its forces' standing orders, carried out in the movement phase. */
  executed?(done: StandingOrderExecution[]): void;
  fired?(u: Unit, target: Unit, r: WithCoveringFire<DirectFireResult>): void;
  /** A tank round or an RPG; a squad's rifle grenades come as `grenadiers`. */
  explosive?(u: Unit, target: Unit, weapon: "tankRound" | "rpgVsArmor", r: WithCoveringFire<DirectExplosiveResult>): void;
  grenadiers?(u: Unit, target: Unit, volleys: WithCoveringFire<DirectExplosiveResult>[]): void;
  assaulted?(u: Unit, target: Unit, grenades: number, r: WithCoveringFire<AssaultResult>): void;
}

/**
 * What the drill remembers between turns: each force's strength at the start,
 * and which forces have already broken contact — a force falls back once, and
 * then holds where it fell back to.
 */
/**
 * A squad breaking contact by the drill (rules decision 107): Break Contact,
 * TC 3-21.76 (2025), 07-SQD-D9505. One team suppresses while the other
 * bounds back, screened by smoke where it has it, then they change over,
 * until both are at the position the commander named.
 */
export interface BreakingContact {
  /** The team split off it to bound by turns with it; absent for a squad too small to split, which goes whole. */
  team?: string;
  /** Its next position: where the commander's criteria send it. */
  to: Point;
  /** The force bounding now; the other suppresses. */
  mover: string;
  /** Where this bound ends. */
  bound?: Point;
  /** This bound's smoke is fired. */
  smoked?: boolean;
  /** Screens fired in this break, against {@link BREAK_CONTACT_SCREENS}. */
  screens?: number;
  /** Smoke first (decision 107): split and screening this turn, it bounds the next. */
  waiting?: boolean;
}

function copyBreak(b: BreakingContact): BreakingContact {
  return { ...b, to: { ...b.to }, ...(b.bound ? { bound: { ...b.bound } } : {}) };
}

/**
 * Rifle-grenade screens a break may fire (decision 107, ⚠️ ours): the moving
 * team "employs smoke" (step 5), but a squad carries a few rounds, not one
 * a bound; decision 101's screening smoke is likewise capped.
 */
export const BREAK_CONTACT_SCREENS = 2;

/**
 * How far a bound goes (decision 107, ⚠️ ours): Break Contact's note, the
 * distance "should not exceed small arms range to ensure supporting fire"
 * (TC 3-21.76 (2025), 07-SQD-D9505, step 3).
 */
export const BREAK_CONTACT_BOUND_M = 100;
/** Fewer fit men than this and a squad goes back whole rather than in two teams (⚠️ ours: a team of two each). */
const BREAK_CONTACT_MIN_MEN = 4;

/**
 * Break contact on the commander's criteria (decision 107): a defending
 * squad whose disengagement criteria are met — an enemy its side has seen
 * past its line, or its losses at its share — breaks contact by the drill,
 * to its next position. Not once it is fighting inside a house (too late:
 * the criteria are to go before being decisively engaged, ATP 3-21.8
 * (2024), para 5-35), and never under a plan to hold to the last.
 */
function breakContact(game: Game, task: DrillTask, state: DrillState, forces: Unit[], enemies: Unit[]): Set<string> {
  const inBreak = new Set<string>();
  if (task.attacking) return inBreak;
  const seen = enemies.map((e) => e.position);
  for (const u of forces) {
    if (u.kind !== "infantry" || !inPlay(u) || state.breaking.has(u.id) || [...state.breaking.values()].some((b) => b.team === u.id)) continue;
    if (state.brokeContact.has(u.id) || state.counterattacking.has(u.id)) continue; // broken contact once already, or committed
    if (game.interior.inFight(u.id) || game.interior.orderFor(u.id)?.fallBack === false) continue;
    if (!game.disengagementMet(u.id, seen)) continue;
    const to = game.disengagementPosition(u.id);
    if (!to) continue;
    const men = (u.soldiers ?? []).filter((m) => !m.neutralized);
    let team: string | undefined;
    if (men.length >= BREAK_CONTACT_MIN_MEN) {
      try {
        // The team in contact stays to suppress (step 2); the rest moves first.
        team = game.detachTeam(u.id, men.slice(Math.ceil(men.length / 2)).map((m) => m.id)).id;
      } catch {
        // A force that cannot split (its nerve gone, say) goes back whole.
      }
    }
    state.breaking.set(u.id, { ...(team ? { team } : {}), to, mover: team ?? u.id, waiting: true });
    // It leaves its post on purpose: no reserve counterattacks it (decision 60).
    state.displaced.add(u.id);
    if (team) state.displaced.add(team);
  }
  for (const [id, b] of [...state.breaking]) {
    const live = [id, b.team].filter((x): x is string => !!x && game.units.some((u) => u.id === x && inPlay(u)));
    if (live.length === 0) { state.breaking.delete(id); continue; }
    const there = (x: string) => distance(game.getUnit(x).position, b.to) <= 5;
    if (live.every(there)) {
      // In its assigned position (step 9b): it holds there.
      for (const x of live) { state.posts.set(x, { ...b.to }); state.brokeContact.add(x); game.setStandingOrder(x, { gait: "normal" }); }
      state.breaking.delete(id);
      continue;
    }
    for (const x of live) inBreak.add(x);
    if (b.waiting) {
      // Smoke first (the author, 2026-10-21; step 5, the moving team "employs smoke"): the turn it is
      // triggered the squad splits and screens; it bounds the next, under its own smoke.
      b.waiting = false;
      for (const x of live) if (game.standingOrderFor(x)?.destination || game.standingOrderFor(x)?.gait !== "normal") game.setStandingOrder(x, { gait: "normal" });
      continue;
    }
    // The first bound is the moving team's (step 5); after each, the team that bounded overwatches and the
    // other goes (step 8) — unless it is already there, or gone.
    const first = !b.bound && live.includes(b.mover);
    const done = first || !live.includes(b.mover) || distance(game.getUnit(b.mover).position, b.bound!) <= 2 || there(b.mover);
    if (done) {
      const other = live.find((x) => x !== b.mover && !there(x));
      const next = first ? b.mover : (other ?? live.find((x) => !there(x))!);
      const from = game.getUnit(next).position;
      const d = distance(from, b.to);
      b.mover = next;
      b.bound = d <= BREAK_CONTACT_BOUND_M ? { ...b.to } : toward(from, b.to, BREAK_CONTACT_BOUND_M);
      b.smoked = false;
    }
    for (const x of live) {
      const now = game.standingOrderFor(x);
      if (x === b.mover) {
        const going = now?.gait === "run" && now.withdraw === true && !!now.destination && distance(now.destination, b.bound!) < 1e-6;
        if (!going) game.setStandingOrder(x, { gait: "run", destination: { ...b.bound! }, withdraw: true });
      } else if (!(now?.gait === "normal" && !now.destination && !now.withdraw)) {
        game.setStandingOrder(x, { gait: "normal" });
      }
    }
  }
  return inBreak;
}

export class DrillState {
  private readonly strength = new Map<string, number>();
  readonly fellBack = new Set<string>();
  readonly displaced = new Set<string>();
  /** Turns each scout has halted to watch since its last bound. */
  readonly watched = new Map<string, number>();
  /** The turn each scout reached its observation point. */
  readonly arrivedOn = new Map<string, number>();
  /** Forces that have passed their company's axis point and go on to the objective. */
  readonly passedVia = new Set<string>();
  /** Each defending squad's forward position: where it stood when the drill first saw it. */
  readonly posts = new Map<string, Point>();
  /** Each reserve committed to a counterattack, and the position it is retaking. */
  readonly counterattacking = new Map<string, Point>();
  /** Turns each attacking platoon has waited at the last cover for the others to come level. */
  readonly levelWaits = new Map<string, { turn: number; count: number }>();
  /** Grenade screens the company has laid (`screeningSmoke`). */
  screens = 0;
  /** Squads already divided into fire teams (`fireTeams`), so each divides once. */
  readonly divided = new Set<string>();
  /** Forces holding as the support-by-fire team of a divided squad. */
  readonly baseOfFire = new Set<string>();
  /** The next squad following into each house its side is clearing (decision 100): building to squad. */
  readonly following = new Map<string, string>();
  /** Squads breaking contact by the drill on their disengagement criteria (decision 107). */
  readonly breaking = new Map<string, BreakingContact>();
  /** Forces that have broken contact and hold their next position (decision 107): each breaks once. */
  readonly brokeContact = new Set<string>();
  /** Where each reinforcement that has arrived waits as a reserve (decision 122). */
  readonly reinforcementPosts = new Map<string, Point>();
  /** Reserves that have reached their flank and go in from it (`counterattack.flank`). */
  readonly flanked = new Set<string>();
  /** The flank point each counterattacking reserve is going to, chosen once. */
  readonly flankVia = new Map<string, Point>();
  /** A defending side's platoons whose fire has been opened (`massedOpening`): the rest of each fires with it. */
  readonly opened = new Set<string>();
  /** The attacker has found the enemy at its objective: only then can it seize it (`consolidate`). */
  objectiveFound = false;
  /** Each breach squad's house and how its charges there have gone (`breach`). */
  readonly breachJobs = new Map<string, BreachJob>();
  /** Each platoon's open request to the commander to redraw the boundary (decision 132), by `platoonKey`. */
  readonly boundaryRequests = new Map<string, BoundaryRequest>();
  /** The turn each platoon's last request was refused: it asks again no sooner than {@link BOUNDARY_ASK_AGAIN_TURNS} after. */
  readonly boundaryRefused = new Map<string, number>();
  /** Every answer given, in order: what changed the order (decision 126). */
  readonly boundaryAnswers: BoundaryAnswer[] = [];
  /** Houses the breach was given up on: the door it is (`breach`). */
  readonly breachGaveUp = new Set<string>();
  /** Where each consolidating squad holds on the far side of the objective, chosen once (decision 130). */
  readonly farSide = new Map<string, Point>();
  /** The squad pushed out to the limit of advance as security, and where it holds; chosen once (decision 130). */
  securityPush: { id: string; at: Point } | undefined;

  /**
   * Where `side`'s forces are moving under the enemy's eyes on the drill's
   * account: breaking contact (decision 107) or counterattacking (decision
   * 60) — what its mortars cover (drill audit, D3).
   */
  movingUnderFire(game: Game, side: Side): Point[] {
    const ids = new Set<string>([...this.counterattacking.keys()]);
    for (const [id, b] of this.breaking) {
      ids.add(id);
      if (b.team) ids.add(b.team);
    }
    return game.units.filter((u) => u.side === side && ids.has(u.id) && inPlay(u)).map((u) => ({ ...u.position }));
  }

  startingStrength(u: Unit): number {
    let n = this.strength.get(u.id);
    if (n == null) {
      n = u.soldiers?.length ?? 0;
      this.strength.set(u.id, n);
    }
    return n;
  }

  /** Everything the drill remembers, as plain data: what a saved battle keeps of it. */
  snapshot(): DrillStateSnapshot {
    return {
      strength: [...this.strength],
      fellBack: [...this.fellBack],
      displaced: [...this.displaced],
      watched: [...this.watched],
      arrivedOn: [...this.arrivedOn],
      passedVia: [...this.passedVia],
      posts: [...this.posts],
      counterattacking: [...this.counterattacking],
      levelWaits: [...this.levelWaits],
      screens: this.screens,
      divided: [...this.divided],
      baseOfFire: [...this.baseOfFire],
      following: [...this.following],
      breaking: [...this.breaking].map(([k, v]) => [k, copyBreak(v)]),
      brokeContact: [...this.brokeContact],
      ...(this.opened.size ? { opened: [...this.opened] } : {}),
      ...(this.objectiveFound ? { objectiveFound: true } : {}),
      ...(this.flanked.size ? { flanked: [...this.flanked] } : {}),
      ...(this.reinforcementPosts.size ? { reinforcementPosts: [...this.reinforcementPosts].map(([k, p]) => [k, { ...p }] as [string, Point]) } : {}),
      ...(this.flankVia.size ? { flankVia: [...this.flankVia].map(([k, p]) => [k, { ...p }] as [string, Point]) } : {}),
      ...(this.breachJobs.size ? { breachJobs: [...this.breachJobs].map(([k, j]) => [k, copyJob(j)] as [string, BreachJob]) } : {}),
      ...(this.breachGaveUp.size ? { breachGaveUp: [...this.breachGaveUp] } : {}),
      ...(this.farSide.size ? { farSide: [...this.farSide].map(([k, p]) => [k, { ...p }] as [string, Point]) } : {}),
      ...(this.securityPush ? { securityPush: { id: this.securityPush.id, at: { ...this.securityPush.at } } } : {}),
    };
  }

  /** The drill's memory as a saved battle left it. */
  static restore(snap: DrillStateSnapshot): DrillState {
    const s = new DrillState();
    const fill = <K, V>(into: Map<K, V>, from: readonly (readonly [K, V])[]) => from.forEach(([k, v]) => into.set(k, v));
    fill(s.strength, snap.strength);
    snap.fellBack.forEach((id) => s.fellBack.add(id));
    snap.displaced.forEach((id) => s.displaced.add(id));
    fill(s.watched, snap.watched);
    fill(s.arrivedOn, snap.arrivedOn);
    snap.passedVia.forEach((id) => s.passedVia.add(id));
    fill(s.posts, snap.posts);
    fill(s.counterattacking, snap.counterattacking);
    fill(s.levelWaits, snap.levelWaits);
    s.screens = snap.screens ?? 0;
    (snap.divided ?? []).forEach((id) => s.divided.add(id));
    (snap.baseOfFire ?? []).forEach((id) => s.baseOfFire.add(id));
    fill(s.following, snap.following ?? []);
    // Copied: the drill changes a break in place, which must not reach back into the save (decision 107).
    (snap.breaking ?? []).forEach(([k, v]) => s.breaking.set(k, copyBreak(v)));
    (snap.brokeContact ?? []).forEach((id) => s.brokeContact.add(id));
    (snap.opened ?? []).forEach((k) => s.opened.add(k));
    s.objectiveFound = snap.objectiveFound ?? false;
    (snap.flanked ?? []).forEach((id) => s.flanked.add(id));
    (snap.reinforcementPosts ?? []).forEach(([k, p]) => s.reinforcementPosts.set(k, { ...p }));
    (snap.flankVia ?? []).forEach(([k, p]) => s.flankVia.set(k, { ...p }));
    (snap.breachJobs ?? []).forEach(([k, j]) => s.breachJobs.set(k, copyJob(j)));
    (snap.breachGaveUp ?? []).forEach((b) => s.breachGaveUp.add(b));
    (snap.farSide ?? []).forEach(([k, p]) => s.farSide.set(k, { ...p }));
    if (snap.securityPush) s.securityPush = { id: snap.securityPush.id, at: { ...snap.securityPush.at } };
    return s;
  }
}

/** {@link DrillState} as plain data, for a saved battle. */
export interface DrillStateSnapshot {
  strength: [string, number][];
  fellBack: string[];
  displaced: string[];
  /** Grenade screens laid by the drill (`screeningSmoke`). */
  screens?: number;
  /** Squads divided into fire teams, and the teams holding as a base of fire. */
  divided?: string[];
  baseOfFire?: string[];
  /** The next squad following into each house (decision 100). */
  following?: [string, string][];
  /** Squads breaking contact, and those that have (decision 107). */
  breaking?: [string, BreakingContact][];
  brokeContact?: string[];
  /** Platoons whose fire has been opened (`massedOpening`). */
  opened?: string[];
  /** The attacker has found the enemy at its objective. */
  objectiveFound?: boolean;
  /** Reserves that have reached their flank, and where each is going. */
  flanked?: string[];
  /** Where each arrived reinforcement waits (decision 122). */
  reinforcementPosts?: [string, Point][];
  flankVia?: [string, Point][];
  /** Each breach squad's house, and the houses given up on (`breach`). */
  breachJobs?: [string, BreachJob][];
  breachGaveUp?: string[];
  /** The far side each consolidating squad holds, and the squad pushed out to the limit of advance (decision 130). */
  farSide?: [string, Point][];
  securityPush?: { id: string; at: Point };
  watched: [string, number][];
  arrivedOn: [string, number][];
  passedVia: string[];
  posts: [string, Point][];
  counterattacking: [string, Point][];
  levelWaits: [string, { turn: number; count: number }][];
}

const inPlay = (u: Unit) => !u.neutralized && !u.routing && !u.surrendered;

function toward(from: Point, to: Point, d: number): Point {
  const r = distance(from, to);
  if (r <= d) return { ...to };
  // On the point itself there is no way toward it or away from it: stay
  // (a negative `d` steps back, and from the point there is no "back").
  if (r === 0) return { ...from };
  return { x: from.x + ((to.x - from.x) / r) * d, y: from.y + ((to.y - from.y) / r) * d };
}

/** Arriving together (ours): a platoon this near the enemy waits while another is this much further back, for so many turns at most. */
const TOGETHER = { waitWithinM: 300, gapM: 100, maxWaitTurns: 5 } as const;

/** Covered routes (ours): straight in from this close; a step off the line must still close this share of it. */
const COVERED = { straightWithinM: 150, minProgress: 0.4 } as const;

/**
 * A step of `d` metres toward `to` through ground out of sight of `watchers`,
 * where some step that still closes on it is: the straight one if it is
 * covered, else the one nearest it, up to 60° off. Undefined when none is.
 */
function coveredStep(terrain: NonNullable<Game["terrain"]>, from: Point, to: Point, d: number, watchers: Point[]): Point | undefined {
  const r = distance(from, to);
  if (r <= d) return undefined;
  const bearing = Math.atan2(to.y - from.y, to.x - from.x);
  for (const off of [0, 20, -20, 40, -40, 60, -60]) {
    const a = bearing + (off * Math.PI) / 180;
    const p = { x: from.x + Math.cos(a) * d, y: from.y + Math.sin(a) * d };
    if (r - distance(p, to) < COVERED.minProgress * d) continue;
    if (isDeadGround({ terrain, watchers }, p)) return p;
  }
  return undefined;
}

/** `d` metres from `from`, directly away from `threat`. */
function awayFrom(from: Point, threat: Point, d: number): Point {
  const r = distance(from, threat);
  if (r === 0) return { ...from };
  return { x: from.x + ((from.x - threat.x) / r) * d, y: from.y + ((from.y - threat.y) / r) * d };
}

/**
 * The next squad, following the one clearing a house (rules decision 100,
 * ATP 3-06.11 (2024)): "at least one Infantry squad per floor to maintain
 * momentum" (para C-3), and "the platoon sergeant must follow close behind
 * with the next squad ready to reinforce the clearing squad" (para C-107),
 * whose men are spent on doorways and casualties after a few rooms.
 *
 * For each house its side is clearing, the nearest other squad of the
 * clearing squad's platoon — not a scout, not a base of fire, not in a
 * fight of its own — follows: it waits in cover near the door, and goes in
 * (an assault, which joins the fight: decision 99) while the house has
 * more storeys than squads still fit to clear in it. A squad counts as no
 * longer fit once half the men it took in are out (⚠️ ours, the author's
 * choice: doctrine names no number). Never more than a squad a floor
 * (para C-107: more "can become unwieldy").
 */
interface Follow {
  door: Point;
  /** A defender in the fight, for the assault that takes it in. */
  defenderId: string;
  /** Where it waits, in cover near the door. */
  wait: Point;
  goIn: boolean;
}

/** Of the men a squad took in, the share that may be out before it is spent (decision 100, ⚠️ ours). */
const SPENT_SHARE = 0.5;

function followers(game: Game, task: DrillTask, drill: SquadDrill, state?: DrillState): Map<string, Follow> {
  const out = new Map<string, Follow>();
  if (!task.attacking) return out;
  const company = task.company;
  const platoonOf = (id: string) => platoonIn(company, id) ?? platoonKey(id);
  // A house no longer being fought for has nobody following into it.
  if (state) for (const b of [...state.following.keys()]) if (!game.interior.fightIn(b)) state.following.delete(b);
  // Squads already following a house are kept for it: no other house takes them first.
  const keptFor = new Map([...(state?.following ?? [])].map(([b, id]) => [id, b]));
  for (const e of game.interior.engagements) {
    if (e.attackerSide !== task.side || e.fight.finished) continue;
    const building = game.terrain.objects.find((o) => o.id === e.buildingId);
    const door = building ? game.interior.frontDoor(game, building) : undefined;
    if (!building || building.footprint.shape !== "polygon" || !door) continue;
    // The defender nearest the door: the assault that takes the next squad in is made on him.
    const defender = e.defenderUnits
      .map((id) => game.getUnit(id))
      .filter((d) => !d.neutralized && !d.surrendered)
      .sort((a, b) => distance(a.position, door) - distance(b.position, door) || (a.id < b.id ? -1 : 1))[0];
    if (!defender) continue;
    const defenderId = defender.id;
    const men = new Map(e.fight.soldiers.map((m) => [m.id, m]));
    const fitToClear = e.attackerUnits.filter((id) => {
      const mine = (game.getUnit(id).soldiers ?? []).map((s) => men.get(s.id)).filter((m) => m !== undefined);
      const gone = mine.filter((m) => m!.out || m!.withdrew).length;
      return mine.length > 0 && gone < mine.length * SPENT_SHARE;
    }).length;
    const platoon = platoonOf(e.attackerUnits[0]!);
    // Not a scout, a base of fire, a machine gun team, a supporting platoon,
    // a squad in a fight of its own, or one that has broken contact or is
    // about to: the drill's own test for that, before it is sent in.
    const eligible = (u: Unit) =>
      u.side === task.side &&
      u.kind === "infantry" &&
      !u.mediumMg &&
      inPlay(u) &&
      !u.routing &&
      !game.interior.inFight(u.id) &&
      !out.has(u.id) &&
      (keptFor.get(u.id) ?? e.buildingId) === e.buildingId &&
      !company?.scouts.has(u.id) &&
      !state?.baseOfFire.has(u.id) &&
      !state?.fellBack.has(u.id) &&
      !(drill.breakContact && state && readyShare(u, state) < drill.breakContact.readyShareBelow) &&
      (company?.platoonTasks?.get(platoon) ?? "assault") !== "support" &&
      platoonOf(u.id) === platoon;
    // The squad already following stays the one, while it may (no switching turn by turn).
    const kept = state?.following.get(e.buildingId);
    const keptUnit = kept ? game.units.find((u) => u.id === kept) : undefined;
    const next =
      keptUnit && eligible(keptUnit)
        ? keptUnit
        : game.units.filter(eligible).sort((a, b) => distance(a.position, door) - distance(b.position, door) || (a.id < b.id ? -1 : 1))[0];
    if (!next) { state?.following.delete(e.buildingId); continue; }
    // Somewhere it can go in from: within assault reach of the door and of the defender. None, no follower.
    const wait = waitNear(game, door, defender.position, building.footprint.points, next.position);
    if (!wait) { state?.following.delete(e.buildingId); continue; }
    state?.following.set(e.buildingId, next.id);
    out.set(next.id, { door, defenderId, wait, goIn: fitToClear < e.fight.plan.storeys.length });
  }
  return out;
}

/**
 * Where the next squad waits (decision 100, the author: "near the door, in
 * cover"): the nearest point to it with cover, outside every building,
 * within assault reach of both the door and the defender's mark. Without
 * one, the open ground short of the door, if that is within reach of both;
 * else nowhere — the house is too deep to go in after its defender from
 * outside.
 */
function waitNear(game: Game, door: Point, defender: Point, house: readonly Point[], from: Point): Point | undefined {
  const reach = ASSAULT_RANGE_M - 4; // inside the assault's reach by more than the 3 m a squad may stop short
  let best: Point | undefined, bestD = Infinity;
  for (let r = 6; r <= reach; r += 4) {
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8;
      const p = { x: door.x + r * Math.cos(a), y: door.y + r * Math.sin(a) };
      if (pointInPolygon(p, house) || distance(p, defender) > reach) continue;
      if (game.terrain.objects.some((o) => o.kind === "building" && o.footprint.shape === "polygon" && pointInPolygon(p, o.footprint.points))) continue;
      if (game.groundCoverAt(p) === "none") continue;
      const d = distance(p, from);
      if (d < bestD) { bestD = d; best = p; }
    }
  }
  if (best) return best;
  const open = toward(door, from, Math.min(reach / 2, distance(door, from)));
  return distance(open, defender) <= reach && distance(open, door) <= reach ? open : undefined;
}

/**
 * Where a counterattack comes in from (`counterattack.flank`): `metres` to
 * the side of the lost `post`, square to the line from where the enemy came
 * (`from`), the side nearer the reserve (ties to the left), in the nearest
 * cover within 25 m of it if there is any — on the map and out of every
 * house, else the other side; neither, none (it goes straight in).
 */
function flankOf(game: Game, at: Point, post: Point, from: Point, metres: number, extent?: { width: number; height: number }): Point | undefined {
  const d = distance(post, from);
  if (d === 0) return undefined;
  const px = -(from.y - post.y) / d, py = (from.x - post.x) / d;
  const sides = [1, -1]
    .map((k) => ({ x: post.x + k * px * metres, y: post.y + k * py * metres }))
    .sort((a, b) => distance(at, a) - distance(at, b));
  // On the map and out of every house (one is gone into by its door, decision 104), the nearer side first.
  const onMap = (q: Point) => !extent || (q.x >= 0 && q.y >= 0 && q.x <= extent.width && q.y <= extent.height);
  const inHouse = (q: Point) => game.terrain.objects.some((o) => o.kind === "building" && o.footprint.shape === "polygon" && pointInPolygon(q, o.footprint.points));
  for (const side of sides) {
    if (!onMap(side) || inHouse(side)) continue;
    const hide = coverNear(game, side, 25);
    return hide && onMap(hide) ? hide : side;
  }
  return undefined;
}

/**
 * Whether the attack has seized its objective, for consolidation (Battle
 * Drill 2 step 14): the side has found the enemy there (`found`), an
 * assaulting force of ours is on it, and no enemy the side knows of is now
 * within the drill's `consolidate.nothingWithin` of it. A position never
 * found is not seized: without that, a company stood consolidating outside
 * a house whose defender it had not yet seen (the drill audit's re-measure:
 * `yokneamHouse` 0%, every battle out of time). Never without `consolidate`.
 */
export function seizedBy(task: DrillTask, drill: SquadDrill, enemies: readonly Unit[], forces: readonly Unit[], company: CompanyOrders | undefined, found: boolean): boolean {
  const c = drill.consolidate;
  if (!c || !task.attacking || company?.hold || !found) return false;
  if (enemies.some((e) => distance(e.position, task.objective) <= c.nothingWithin)) return false;
  return forces.some((o) => {
    if (!inPlay(o) || o.kind === "command" || company?.scouts.has(o.id) || distance(o.position, task.objective) > c.nothingWithin) return false;
    const k = platoonIn(company, o.id);
    return ((k && company?.platoonTasks?.get(k)) ?? "assault") === "assault";
  });
}

/**
 * The nearest point with ground cover within `within` metres of `p`
 * (`p` itself if it has some, a house included), else never one inside a
 * building — going into one is a fight of its own (decision 96) — and,
 * given `notNearer`, never nearer any of those points than `p` is. None
 * that near: undefined.
 */
function coverNear(game: Game, p: Point, within: number, notNearer: readonly Point[] = []): Point | undefined {
  const houses = game.terrain.objects.filter((o) => o.kind === "building" && o.footprint.shape === "polygon");
  const inHouse = (q: Point) => houses.some((o) => o.footprint.shape === "polygon" && pointInPolygon(q, o.footprint.points));
  // No nearer any of `notNearer` (the enemy) than `p` is: cover is not bought by closing on him.
  const gap = (q: Point) => Math.min(...notNearer.map((e) => distance(q, e)));
  const keep = notNearer.length ? gap(p) : -Infinity;
  // Where it stands, if that is cover: a house it is already in included (the flank point is kept out of houses by its caller).
  if (game.groundCoverAt(p) !== "none") return p;
  for (let r = 5; r <= within; r += 5) {
    let best: Point | undefined;
    let bestD = Infinity;
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8;
      const q = { x: p.x + r * Math.cos(a), y: p.y + r * Math.sin(a) };
      if (inHouse(q)) continue;
      if (game.groundCoverAt(q) === "none") continue;
      if (notNearer.length && gap(q) < keep) continue;
      const d = distance(q, p);
      if (d < bestD) { bestD = d; best = q; }
    }
    if (best) return best;
  }
  return undefined;
}

/** The enemies `side` knows of, where it last saw them — never where they are. */
function knownEnemies(game: Game, side: Side): Unit[] {
  return sideView(game, side).units.filter((u) => u.side !== side && !u.neutralized && !u.surrendered);
}

/**
 * The enemy a force should shoot at: the nearest known one inside its sector
 * and in reach, else — if the drill allows — the nearest in reach anywhere.
 * `sector`, the order's (decision 131), first narrows the targets to its
 * primary half while one there is in reach; the drill ranks the rest.
 */
function pickTarget(
  u: Unit,
  enemies: Unit[],
  axis: number,
  drill: SquadDrill,
  reach: number,
  hurting?: ReadonlyMap<string, number>,
  game?: Game,
  sector?: (e: Unit) => boolean,
): Unit | undefined {
  // Whoever is hurting us most, then the nearest: the drill's priority
  // (`returnFire`) if it has one, else ours, which is nearest-first.
  const weight = (e: Unit) => hurting?.get(e.id) ?? 0;
  let inReach = enemies
    .filter((e) => distance(u.position, e.position) <= reach)
    .sort((a, b) => weight(b) - weight(a) || distance(u.position, a.position) - distance(u.position, b.position));
  // **Something it can actually shoot at.** A mark on the map is not a
  // target: the drill used to take the nearest enemy its side knew of
  // whether or not this force could see it, and on broken ground against a
  // dug-in defence the nearest is usually the one it cannot see. The
  // engine then refused the shot — `fired: false`, silently — and the
  // force stood there aiming at a hillside. Measured before the fix: zero
  // of fourteen forces firing, turn after turn, with line of sight to
  // something the whole time (docs/balance.md).
  if (game) {
    const seen = inReach.filter((e) => {
      try {
        return game.canEngage(u, game.getUnit(e.id));
      } catch {
        return false;
      }
    });
    if (seen.length) inReach = seen;
  }
  // **An ordered sector of fire** (FM 3-90 (2023) para A-83; decision 131): only
  // what is in the force's primary half is a target while anything there is in
  // reach — and whoever is firing on it (decision 115, A-16's "clearly identified
  // enemy targets") or is close enough to assault (⚠️ ours), wherever they are;
  // with nothing of its half in reach, every enemy in reach, as if it had no
  // sector: the other half is its secondary. The drill then ranks what is left
  // exactly as it would without a sector, so a sector whose half holds every
  // enemy, or none, changes nothing. Its arc no longer refuses a target: the order's
  // sector covers both halves.
  if (sector && inReach.some(sector)) {
    inReach = inReach.filter((e) => sector(e) || weight(e) > 0 || distance(u.position, e.position) <= drill.assault.range);
  }
  const mayStray = drill.engageOutsideSector || !!sector;
  const inArc = (e: Unit) => drill.sectorWidth >= 360 || angleBetween(bearingDegrees(u.position, e.position), axis) <= drill.sectorWidth / 2;
  if (drill.threatFirst && game) {
    const near = (e: Unit) => distance(u.position, e.position);
    const ranked = [...inReach].sort(
      (a, b) =>
        weight(b) - weight(a) ||
        threatOrder(game, u, a, b) ||
        Number(inArc(b)) - Number(inArc(a)) ||
        near(a) - near(b),
    );
    const first = ranked[0];
    // Shooting back needs no sector; anything else outside it only if the drill strays.
    return first && (weight(first) > 0 || inArc(first) || mayStray) ? first : undefined;
  }
  const inSector = inReach.find(inArc);
  return inSector ?? (mayStray ? inReach[0] : undefined);
}

/**
 * Greatest threat first, and no piling on (`threatFirst`, decision 115): an
 * enemy not pinned before one that is, as `u`'s side can watch it (the
 * suppression gate's `hasEyesOn`); then a crew-served weapon or a vehicle
 * before riflemen. A comparator: negative puts `a` first.
 */
function threatOrder(game: Game, u: Unit, a: Unit, b: Unit): number {
  const heavy = (e: Unit) => (e.mediumMg || e.kind === "vehicle" ? 1 : 0);
  const pinned = (e: Unit) => {
    try {
      const it = game.getUnit(e.id);
      return hasEyesOn(game, u.side, it) && suppressionLevel(it) === "pinned" ? 1 : 0;
    } catch {
      return 0;
    }
  };
  return pinned(a) - pinned(b) || heavy(b) - heavy(a);
}

/** The position of whichever of our own forces is nearest an enemy we know of. */
function nearestOwnToEnemy(own: readonly Unit[], enemies: readonly Unit[]): Point | undefined {
  let best: Point | undefined;
  let bd = Infinity;
  for (const u of own) {
    for (const e of enemies) {
      const d = distance(u.position, e.position);
      if (d < bd) {
        bd = d;
        best = u.position;
      }
    }
  }
  return best;
}

/**
 * The enemy a supporting force may shoot at once the assault has gone in:
 * only those well clear of the nearest assaulting squad (Battle Drill 2
 * step 13b(3), fires shifted "to the opposite flank of the enemy
 * position", and 13b(5), the base of fire "must be able to identify the
 * near flank of the assaulting squad(s)").
 *
 * Returns the enemy unchanged unless this force really is supporting an
 * assault that has gone in — before that there is no near flank to keep
 * clear of. An empty list is the handover: with nothing on the far side,
 * the base of fire stops rather than shoot across its own men.
 */
function farFlankOnly(game: Game, u: Unit, task: DrillTask, enemies: Unit[], clear: number, state?: DrillState): Unit[] {
  const company = task.company;
  if (!company || company.hold) return enemies;
  // The support-by-fire team of a divided squad shifts off its own assault
  // team the same way (Battle Drill 2A step 8c: "shifts direct fire to the
  // opposite flank").
  if (state?.baseOfFire.has(u.id)) {
    const team = game.units.filter((o) => o.id.startsWith(`${u.id}/`) && inPlay(o));
    return enemies.filter((e) => team.every((o) => distance(o.position, e.position) > clear));
  }
  const platoon = platoonIn(company, u.id);
  if (((platoon && company.platoonTasks?.get(platoon)) ?? "assault") !== "support") return enemies;
  // Where our own assault is. A side knows where its own forces are, so
  // this is read off the live units and not through `sideView`. A command
  // group is in no platoon, and is not the assault.
  const assaulting = game.units.filter((o) => {
    if (o.side !== u.side || o.id === u.id || o.kind === "command" || !inPlay(o)) return false;
    const key = platoonIn(company, o.id);
    return ((key && company.platoonTasks?.get(key)) ?? "assault") === "assault";
  });
  if (!assaulting.length) return enemies;
  return enemies.filter((e) => assaulting.every((o) => distance(o.position, e.position) > clear));
}

/**
 * The platoon a force is in by its company's orders. A fire team split off
 * a squad (decision 89) is in its squad's platoon: the company's map was
 * drawn before the team existed, and without this the team fell to the
 * default task, "assault", whatever its squad was doing (drill audit, A3).
 */
export function platoonIn(company: CompanyOrders | undefined, id: string): string | undefined {
  for (let k: string | undefined = id; k !== undefined; ) {
    const p = company?.platoonOf?.get(k);
    if (p) return p;
    const slash = k.lastIndexOf("/");
    k = slash > 0 ? k.slice(0, slash) : undefined;
  }
  return undefined;
}

/**
 * Who has been firing on `u`, by how many times, as far as this side can
 * tell: the umpire's record (`Game.fireReceived`) keeps a firer's id only
 * where there is one on the map, and this counts only firers the side
 * holds a mark on — so being shot at by an enemy nobody has seen teaches
 * the force nothing about where it is.
 */
function hurtingUs(game: Game, side: Side, u: Unit, known: readonly Unit[], since: number): Map<string, number> {
  const out = new Map<string, number>();
  if (since <= 0) return out;
  const seen = new Set(known.map((e) => e.id));
  for (const f of game.fireReceived(u.id, game.turn - since)) {
    if (!f.firerId || !seen.has(f.firerId)) continue;
    out.set(f.firerId, (out.get(f.firerId) ?? 0) + 1);
  }
  return out;
}

/**
 * Where a consolidating squad holds on the far side of the objective
 * (decision 130): `farSide` metres past it along the line of attack — from
 * the company's start line where its orders give one, else from where the
 * squad came — in the nearest cover within `coverInPlace` of that, and short
 * of any limit of advance. Chosen once, so the squad does not wander.
 */
function farSideFor(game: Game, task: DrillTask, drill: SquadDrill, state: DrillState, company: CompanyOrders | undefined, u: Unit): Point | undefined {
  const held = state.farSide.get(u.id);
  if (held) return held;
  // The line of attack: the LOA's own where there is one, so the far side and the limit agree; else from the start line.
  let ahead = task.limitOfAdvance?.beyond;
  if (!ahead) {
    const from = company?.fallBackTo;
    if (!from) return undefined; // no start line to cross from: it consolidates where it stands
    const d = distance(from, task.objective);
    if (d < 1) return undefined;
    ahead = { x: (task.objective.x - from.x) / d, y: (task.objective.y - from.y) / d };
  }
  // Its place across the line of attack, as it came: squads that came side by side stay side by side.
  const across = { x: -ahead.y, y: ahead.x };
  const reach = drill.consolidate!.nothingWithin / 2;
  const lateral = Math.max(-reach, Math.min(reach, (u.position.x - task.objective.x) * across.x + (u.position.y - task.objective.y) * across.y));
  const metres = drill.consolidate!.farSide!;
  // Squads that converged on one enemy keep a gap all the same: along the far side in steps until clear of the others (⚠️ ours).
  const taken = [...state.farSide.values()];
  const clear = (q: Point) => taken.every((t) => distance(t, q) >= FAR_SIDE_GAP_M);
  const place = (shift: number) => ({
    x: task.objective.x + ahead!.x * metres + across.x * (lateral + shift),
    y: task.objective.y + ahead!.y * metres + across.y * (lateral + shift),
  });
  // Still the objective: inside its `nothingWithin` with a margin, or the squad would fall out of consolidation there.
  const within = drill.consolidate!.nothingWithin - FAR_SIDE_MARGIN_M;
  const fits = (q: Point) => clear(q) && distance(q, task.objective) <= within && !inBuilding(game, q) && (!task.limitOfAdvance || pastLimit(task.limitOfAdvance, q) <= 0);
  const shifts = [0, 1, -1, 2, -2, 3, -3, 4, -4].map((k) => k * FAR_SIDE_STEP_M);
  const shift = shifts.find((k) => fits(place(k)));
  // No room on the far side (houses, other squads, the limit): it consolidates where it stands, and that is kept too.
  let at = shift === undefined ? { ...u.position } : place(shift);
  if (shift !== undefined) {
    const cover = coverNear(game, at, drill.coverInPlace?.within ?? 25);
    // Never into a house (a fight of its own, decision 96), past the LOA, off the objective, or onto another squad's spot.
    if (cover && fits(cover)) at = cover;
  }
  state.farSide.set(u.id, at);
  return at;
}

/** The gap kept between squads on the far side, and the step taken along it to find one (⚠️ ours). */
const FAR_SIDE_GAP_M = 12;
/** How far inside the objective's `nothingWithin` a far-side point stays (ours). */
const FAR_SIDE_MARGIN_M = 5;
const FAR_SIDE_STEP_M = 15;

/** Whether a point is inside a building's footprint. */
function inBuilding(game: Game, p: Point): boolean {
  return game.terrain.objects.some((o) => o.kind === "building" && o.footprint.shape === "polygon" && pointInPolygon(p, o.footprint.points));
}

/**
 * The squad pushed out to the limit of advance (decision 130: "one fresh
 * squad"): of the assaulting squads on the objective, not a scout, not in a
 * fight inside, the one with the most fit men (by id on a tie); where it
 * goes, the nearest cover to the limit on the line of attack, short of it.
 */
function securityFor(
  game: Game,
  task: DrillTask,
  drill: SquadDrill,
  state: DrillState,
  company: CompanyOrders | undefined,
  forces: readonly Unit[],
  scouts: ReadonlyMap<string, Point | null>,
  loa: LimitOfAdvance,
): { id: string; at: Point } | undefined {
  const fit = (u: Unit) => (u.soldiers ?? []).filter((m) => !m.neutralized && m.morale?.state !== "broken").length;
  // Only a squad free to go: not on a breach, not following into a house, not fallen back, not a held base of fire, not breaking contact.
  const following = new Set(state.following.values());
  const busy = (u: Unit) =>
    !!u.breachElement || following.has(u.id) || state.fellBack.has(u.id) || state.baseOfFire.has(u.id) || state.breaking.has(u.id) || state.breachJobs.has(u.id);
  const candidates = forces
    .filter((u) => u.kind === "infantry" && u.echelon === "squad" && inPlay(u) && !scouts.has(u.id) && !game.interior.inFight(u.id) && !busy(u))
    .filter((u) => {
      const k = platoonIn(company, u.id);
      return ((k && company?.platoonTasks?.get(k)) ?? "assault") === "assault";
    })
    .filter((u) => distance(u.position, task.objective) <= drill.consolidate!.nothingWithin)
    .sort((a, b) => fit(b) - fit(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // Another stays on the objective: a company of one squad does not empty its objective to watch past it (⚠️ ours).
  if (candidates.length < 2) return undefined;
  const squad = candidates[0]!;
  // The point of the limit on the line of attack through the objective, short of it; the nearest cover there, short of it too, out of houses.
  const k = pastLimit(loa, task.objective) + LOA_SHORT_M;
  const onLine = { x: task.objective.x - loa.beyond.x * k, y: task.objective.y - loa.beyond.y * k };
  const cover = coverNear(game, onLine, SECURITY_COVER_M);
  const at = cover && !inBuilding(game, cover) && pastLimit(loa, cover) <= 0 ? cover : onLine;
  return { id: squad.id, at };
}

/** How far from its point on the limit the security squad looks for cover (⚠️ ours). */
const SECURITY_COVER_M = 40;

/** Every move of the side's forces held short of the limit of advance (decision 130). */
function holdShortOfLimit(game: Game, forces: readonly Unit[], loa: LimitOfAdvance): void {
  for (const u of forces) {
    const order = game.standingOrderFor(u.id);
    if (!order?.destination || pastLimit(loa, order.destination) + LOA_SHORT_M <= 0) continue;
    const to = shortOfLimit(loa, u.position, order.destination);
    const { destination: _was, ...rest } = order;
    // Refused (out of command, decision 6): it keeps the order it has, and may go on past the line — it never got the word.
    game.setStandingOrder(u.id, distance(to, u.position) < 2 ? rest : { ...rest, destination: to });
  }
}

/** A platoon the boundary held back asks the commander to redraw it (decision 132). */
export interface BoundaryRequest {
  platoon: string;
  /** Where the drill wanted to go, across the line. */
  wanted: Point;
  turn: number;
}

/** A request answered: refused, or granted with the line moved from `from` to `to` (`shiftWestM`). */
export interface BoundaryAnswer {
  platoon: string;
  turn: number;
  granted: boolean;
  /** Granted, but the neighbours' lane let the line go only part of the way. */
  partly?: boolean;
  /** Could not be granted: the neighbours stand where the line would have to go. */
  blocked?: boolean;
  from: number;
  to: number;
}

/** A refused platoon asks again no sooner than this many turns after (the author, decision 132). */
export const BOUNDARY_ASK_AGAIN_TURNS = 5;
/** A force held at the boundary stops this far inside its lane (ours). */
const LANE_INSIDE_M = 5;
/** A redrawn line leaves the place asked for, and every force of the other lane, this far inside their lanes (ours). */
export const BOUNDARY_REDRAW_MARGIN_M = 25;

/** The force's lane, when the boundary holds it now: its platoon has one, it is short of the end, and it is not a scout before H-hour. */
function laneHolding(task: DrillTask, u: Unit): SectorHalf | undefined {
  const b = task.attacking ? task.boundary : undefined;
  const lane = b?.byPlatoon[platoonKey(u.id)];
  if (!b || !lane || u.kind === "command") return undefined;
  // Scouts go to the posts the order gave them until the company goes (the author, decision 132).
  if (task.company?.hold && task.company.scouts.has(u.id)) return undefined;
  return laneOf(b, u.position) === undefined ? undefined : lane;
}

/**
 * Every move of a laned force kept in its lane (decision 132): a destination
 * across the line is brought back to just inside it, and a force that was in
 * its lane and wanted across asks the commander to redraw the line - once,
 * and again no sooner than {@link BOUNDARY_ASK_AGAIN_TURNS} after a refusal.
 * A force standing out of its lane (where the start line put it) is only
 * brought in.
 */
function holdInLane(game: Game, forces: readonly Unit[], task: DrillTask, state: DrillState): void {
  const b = task.boundary!;
  pruneBoundaryRequests(game, task, state);
  for (const u of forces) {
    // Its lane by its platoon, wherever it stands: a force past the end coming back short of it is held too.
    const lane = b.byPlatoon[platoonKey(u.id)];
    if (!lane || !inPlay(u) || (task.company?.hold && task.company.scouts.has(u.id))) continue;
    const order = game.standingOrderFor(u.id);
    const to = order?.destination;
    if (!order || !to) continue;
    const there = laneOf(b, to);
    if (there === undefined || there === lane) continue;
    const sign = lane === "west" ? 1 : -1;
    const over = sign * LANE_INSIDE_M - westOfBoundary(b, to);
    const held = { x: to.x + b.west.x * over, y: to.y + b.west.y * over };
    const { destination: _was, ...rest } = order;
    // Refused (out of command, decision 6): it keeps the order it has and may cross — it never got the word, and asks nothing.
    if (!game.setStandingOrder(u.id, distance(held, u.position) < 2 ? rest : { ...rest, destination: held })) continue;
    const platoon = platoonKey(u.id);
    const refused = state.boundaryRefused.get(platoon);
    // A request only from a force in its lane, short of the end, that wanted well across: not one being brought in, nor a few metres on the line.
    const wasIn = laneOf(b, u.position) !== undefined && sign * westOfBoundary(b, u.position) >= 0;
    const wellAcross = -sign * westOfBoundary(b, to) >= LANE_INSIDE_M;
    if (wasIn && wellAcross && !state.boundaryRequests.has(platoon) && (refused === undefined || game.turn - refused >= BOUNDARY_ASK_AGAIN_TURNS))
      state.boundaryRequests.set(platoon, { platoon, wanted: { ...to }, turn: game.turn });
  }
}

/**
 * Requests nobody needs answered any more, dropped with no refusal against
 * them: the platoon has nobody left in play, or what it asked for is in its
 * lane now (another's grant moved the line), or past the end.
 */
export function pruneBoundaryRequests(game: Game, task: DrillTask, state: DrillState): void {
  const b = task.boundary;
  if (!b) return;
  for (const [platoon, r] of [...state.boundaryRequests]) {
    const lane = b.byPlatoon[platoon];
    const there = laneOf(b, r.wanted);
    const anyone = game.units.some((u) => u.side === task.side && u.kind !== "command" && inPlay(u) && platoonKey(u.id) === platoon);
    if (!lane || !anyone || there === undefined || there === lane) state.boundaryRequests.delete(platoon);
  }
}

/**
 * Where granting `platoon`'s request would move the line (`shiftWestM`): the
 * place it asked for {@link BOUNDARY_REDRAW_MARGIN_M} inside its lane, but no
 * further than leaves every force of the other lane as far inside its own.
 * Undefined when the line cannot move toward it at all.
 */
export function boundaryRedraw(game: Game, task: DrillTask, state: DrillState, platoon: string): { to: number; partly: boolean } | undefined {
  const b = task.boundary;
  const req = state.boundaryRequests.get(platoon);
  const lane = b?.byPlatoon[platoon];
  if (!b || !req || !lane) return undefined;
  const sign = lane === "west" ? 1 : -1;
  const raw = (p: Point) => (p.x - b.from.x) * b.west.x + (p.y - b.from.y) * b.west.y;
  // Granted in full: the place asked for this far inside the lane.
  const full = raw(req.wanted) - sign * BOUNDARY_REDRAW_MARGIN_M;
  const others = game.units.filter((u) => {
    const theirs = b.byPlatoon[platoonKey(u.id)];
    return u.side === task.side && u.kind !== "command" && inPlay(u) && theirs !== undefined && theirs !== lane && laneOf(b, u.position) !== undefined;
  });
  // The other lane's forces keep the margin: the line goes no nearer them.
  const cap = others.length
    ? sign > 0
      ? Math.max(...others.map((u) => raw(u.position))) + BOUNDARY_REDRAW_MARGIN_M
      : Math.min(...others.map((u) => raw(u.position))) - BOUNDARY_REDRAW_MARGIN_M
    : sign > 0
      ? -Infinity
      : Infinity;
  const to = sign > 0 ? Math.max(full, cap) : Math.min(full, cap);
  const gains = sign > 0 ? to < b.shiftWestM : to > b.shiftWestM;
  return gains ? { to, partly: to !== full } : undefined;
}

/**
 * The commander's answer to `platoon`'s request (decision 132): granted, the
 * line is redrawn as {@link boundaryRedraw} says (for the platoon and the
 * neighbours across it); refused, or not grantable, it stays and the platoon
 * waits {@link BOUNDARY_ASK_AGAIN_TURNS} turns before asking again.
 */
export function answerBoundaryRequest(game: Game, task: DrillTask, state: DrillState, platoon: string, grant: boolean): BoundaryAnswer | undefined {
  const b = task.boundary;
  if (!b || !state.boundaryRequests.has(platoon)) return undefined;
  const redraw = grant ? boundaryRedraw(game, task, state, platoon) : undefined;
  const answer: BoundaryAnswer = redraw
    ? { platoon, turn: game.turn, granted: true, ...(redraw.partly ? { partly: true } : {}), from: b.shiftWestM, to: redraw.to }
    : { platoon, turn: game.turn, granted: false, ...(grant ? { blocked: true } : {}), from: b.shiftWestM, to: b.shiftWestM };
  const asked = state.boundaryRequests.get(platoon)!.turn;
  state.boundaryRequests.delete(platoon);
  if (redraw) b.shiftWestM = redraw.to;
  // The wait counts from the turn it asked, whenever it is answered (the app and the runner both answer as the next turn opens).
  else state.boundaryRefused.set(platoon, asked);
  state.boundaryAnswers.push(answer);
  return answer;
}

/** A friend of the firer's within this of an enemy across the boundary, or of the line of fire to it, withholds the shot (the author, decision 132). */
export const ACROSS_SAFE = { targetM: 50, lineM: 10, clearOfFirerM: 10 } as const;

/** Whether `u` may fire at `e` across the boundary: no friend within 50 m of it, nor within 10 m of the line of fire short of it (A-16). */
function safeAcross(game: Game, u: Unit, e: Unit): boolean {
  const dx = e.position.x - u.position.x;
  const dy = e.position.y - u.position.y;
  const len = Math.hypot(dx, dy) || 1;
  for (const f of game.units) {
    if (f.side !== u.side || f.id === u.id || !inPlay(f)) continue;
    if (distance(f.position, e.position) <= ACROSS_SAFE.targetM) return false;
    const t = ((f.position.x - u.position.x) * dx + (f.position.y - u.position.y) * dy) / len;
    if (t <= ACROSS_SAFE.clearOfFirerM || t >= len) continue;
    const off = Math.abs((f.position.x - u.position.x) * dy - (f.position.y - u.position.y) * dx) / len;
    if (off <= ACROSS_SAFE.lineM) return false;
  }
  return true;
}

/** Whether a point is across the boundary from a force in `lane`: in the other lane, short of the end. */
function acrossFrom(task: DrillTask, lane: SectorHalf | undefined, p: Point): boolean {
  if (!lane || !task.boundary) return false;
  const there = laneOf(task.boundary, p);
  return there !== undefined && there !== lane;
}

function axisOf(u: Unit, task: DrillTask): number {
  return bearingDegrees(u.position, task.objective);
}

function readyShare(u: Unit, state: DrillState): number {
  const start = state.startingStrength(u);
  if (start === 0) return 1;
  const ready = (u.soldiers ?? []).filter((s) => !s.neutralized && s.morale?.state !== "broken").length;
  return ready / start;
}

/** A squad still holds its post while it is in the fight and within this of it (ours). */
export const HOLDS_POST_M = 25;

/**
 * The enemies seen this turn or last: a mark older than that is drawn as
 * stale (decision 57) and may be where the enemy no longer is, so a
 * counterattack neither starts nor aims on one. Without the knowledge model
 * every enemy in the side's picture is in sight.
 */
function freshEnemies(game: Game, side: Side, enemies: Unit[]): Unit[] {
  if (!game.trackIntel) return enemies;
  const fresh = new Set(game.contactsFor(side).filter((c) => c.lastSeenTurn >= game.turn - 1).map((c) => c.unitId));
  return enemies.filter((e) => fresh.has(e.id));
}

/**
 * The front door of the house where `foe` is clearing `side`'s men out
 * (decision 104): where the counterattack goes in. The defender knows his
 * own house and that it is being fought for.
 */
function counterDoor(game: Game, side: Side, foe: Unit): Point | undefined {
  if (!game.counterattackInside) return undefined;
  const e = game.interior.engagementOf(foe.id);
  if (!e || e.attackerSide === side) return undefined;
  const building = game.terrain.objects.find((o) => o.id === e.buildingId);
  return building ? game.interior.frontDoor(game, building) : undefined;
}

/** The enemy known nearest `post`, if one is within `within` metres of it. */
function enemyOn(post: Point, enemies: Unit[], within: number): Unit | undefined {
  let best: Unit | undefined;
  for (const e of enemies) {
    const d = distance(e.position, post);
    if (d <= within && (!best || d < distance(best.position, post))) best = e;
  }
  return best;
}

/** The ids of `side`'s reinforcements (decision 122), arrived or not. */
function reinforcementIds(game: Game, side: Side): Set<string> {
  return new Set(game.reinforcements.filter((r) => r.side === side).flatMap((r) => r.units.map((u) => u.id)));
}

/** A defender's reserves: its scenario's, and its reinforcements, which join as reserves (decision 122). */
function reservesOf(game: Game, task: DrillTask): Set<string> {
  return new Set([...(task.reserves ?? []), ...reinforcementIds(game, task.side)]);
}

/** How far behind its posts a reinforcement waits when the side has no reserve of its own to wait with (decision 122, ⚠️ ours). */
export const REINFORCEMENT_BEHIND_M = 100;

/**
 * Where an arrived reinforcement waits (decision 122): with the side's own
 * reserve if it has one in play, else {@link REINFORCEMENT_BEHIND_M} behind
 * the middle of its posts, away from where the attack came from; on the map.
 */
function reinforcementPost(game: Game, task: DrillTask, state: DrillState, arrivals: ReadonlySet<string>): Point | undefined {
  // The side's own reserve still waiting: not one already gone in after a lost post.
  const own = game.units.filter((u) => u.side === task.side && (task.reserves?.has(u.id) ?? false) && !arrivals.has(u.id) && inPlay(u) && !state.counterattacking.has(u.id));
  if (own.length) return { x: own.reduce((t, u) => t + u.position.x, 0) / own.length, y: own.reduce((t, u) => t + u.position.y, 0) / own.length };
  const posts = [...state.posts.values()];
  if (!posts.length) return undefined;
  const c = { x: posts.reduce((t, p) => t + p.x, 0) / posts.length, y: posts.reduce((t, p) => t + p.y, 0) / posts.length };
  const back = awayFrom(c, task.objective, REINFORCEMENT_BEHIND_M);
  const e = task.extent;
  return e ? { x: Math.min(Math.max(back.x, 0), e.width), y: Math.min(Math.max(back.y, 0), e.height) } : back;
}

/**
 * Commit a defender's reserves (rules decision 60): each reserve not yet
 * committed goes for the nearest forward position of its own platoon that is
 * lost — its squad out of the fight or gone from it, or its house being
 * cleared round it (decision 104), and an enemy known on it. Once committed
 * it stays committed; its assault on an enemy fighting inside goes in.
 */
function commitReserves(game: Game, task: DrillTask, drill: SquadDrill, state: DrillState, forces: Unit[], enemies: Unit[]): void {
  const counter = drill.counterattack;
  const reserves = reservesOf(game, task);
  const arrivals = reinforcementIds(game, task.side);
  if (!counter || !reserves.size) return;
  const lost = [...state.posts].filter(([id, post]) => {
    // A squad that went to its alternate position left its post on purpose.
    if (state.displaced.has(id)) return false;
    const holder = game.getUnit(id);
    // A squad whose house is being cleared round it is losing its post (decision 104): the reserve goes in, before it is cleared.
    const fight = game.counterattackInside ? game.interior.engagementOf(id) : undefined;
    const beingCleared = fight !== undefined && fight.attackerSide !== holder.side;
    const holds = inPlay(holder) && distance(holder.position, post) <= HOLDS_POST_M && !beingCleared;
    return !holds && enemyOn(post, enemies, counter.lostWithin) !== undefined;
  });
  if (lost.length === 0) return;
  for (const r of forces) {
    if (!reserves.has(r.id) || !inPlay(r) || state.counterattacking.has(r.id)) continue;
    // A reinforcement belongs to no platoon: it answers any lost post (decision 122).
    const mine = lost
      .filter(([id]) => arrivals.has(r.id) || platoonKey(id) === platoonKey(r.id))
      .sort(([, a], [, b]) => distance(r.position, a) - distance(r.position, b));
    if (mine[0]) state.counterattacking.set(r.id, { ...mine[0][1] });
  }
}

/**
 * How near a defending force lets the enemy come before it fires: the
 * drill's `openFireRange`; a machine gun's own trigger line at its reach
 * (drill audit, D1: "separate trigger lines for each weapon or type of
 * weapon system", ATP 3-21.8 (2024), para 5-208; decision 90); and, its
 * platoon's fire opened (`massedOpening`), the drill's attack range.
 */
function triggerLine(u: Unit, drill: SquadDrill, opened: ReadonlySet<string> | undefined): number {
  const rifles = drill.massedOpening && opened?.has(platoonKey(u.id)) ? Math.max(drill.openFireRange, drill.attackFireRange) : drill.openFireRange;
  return u.mediumMg && drill.machineGuns ? Math.max(rifles, drill.machineGuns.range) : rifles;
}

/**
 * The movement phase: each force's order for the turn, carried out; then the
 * command groups take their place behind their forces.
 */
export function drillMovement(game: Game, task: DrillTask, drill: SquadDrill, state: DrillState, report?: DrillReport): void {
  const { side } = task;
  const enemies = knownEnemies(game, side);
  const inContact = enemies.length > 0;
  const forces = game.units.filter((u) => u.side === side && u.kind !== "command");
  // The company's orders (company.ts): its scouts out ahead, the rest held or let go.
  const company = task.attacking ? task.company : undefined;
  const scouts = company?.scouts ?? new Map<string, Point | null>();
  const waiting = company?.hold ?? false;
  const reserves = task.attacking ? new Set<string>() : reservesOf(game, task);
  const arrivals = task.attacking ? new Set<string>() : reinforcementIds(game, side);
  if (!task.attacking) {
    for (const u of forces) {
      if (u.kind === "infantry" && !reserves.has(u.id) && !state.posts.has(u.id)) state.posts.set(u.id, { ...u.position });
    }
    // A reinforcement just arrived: where it waits, chosen once (decision 122) — its forces
    // side by side, 15 m apart across the line of the attack, not on one spot.
    const come = forces.filter((u) => arrivals.has(u.id) && !state.reinforcementPosts.has(u.id));
    const at = come.length ? reinforcementPost(game, task, state, arrivals) : undefined;
    if (at) {
      const d = distance(at, task.objective) || 1;
      const px = -(task.objective.y - at.y) / d, py = (task.objective.x - at.x) / d;
      come.forEach((u, k) => {
        const off = (k - (come.length - 1) / 2) * 15;
        state.reinforcementPosts.set(u.id, { x: at.x + px * off, y: at.y + py * off });
      });
    }
    commitReserves(game, task, drill, state, forces, freshEnemies(game, side, enemies));
  }
  // The commander's disengagement criteria (decision 107): those breaking contact move by the drill's bounds.
  const breakingNow = breakContact(game, task, state, forces, enemies);

  // Battle Drill 2A: a squad that has come into contact divides into two
  // fire teams, the part in contact holding as the support-by-fire team
  // and the part that is not going on as the assault team. Done before
  // the orders are executed, so the new team is on the map from this turn
  // — it cannot move until the next one anyway, because it inherits its
  // parent's spent movement.
  if (drill.fireTeams && task.attacking) {
    for (const u of forces) {
      if (u.kind !== "infantry" || u.echelon !== "squad" || !inPlay(u)) continue;
      if (state.divided.has(u.id) || scouts.has(u.id)) continue;
      // A breach squad stays whole while it has a breach to make — a house given it, a charge in
      // hand, or a charge and a house its side knows to breach: none of it clears (the author,
      // 2026-11-19). With none — open ground, its charges spent — it fights as any squad.
      if (
        u.breachElement &&
        (u.layingCharge ||
          state.breachJobs.has(u.id) ||
          (drill.breach && (u.breachingCharges ?? 0) > 0 && enemies.some((e) => breachableHouse(game, state, side, e) !== undefined)))
      )
        continue;
      // Battle Drill 2A is the squad *assault*: a squad on support, security
      // or in reserve fires or waits whole.
      const k = platoonIn(company, u.id);
      if (company && ((k && company.platoonTasks?.get(k)) ?? "assault") !== "assault") continue;
      const men = (u.soldiers ?? []).filter((m) => !m.neutralized);
      if (men.length < drill.fireTeams.minMen) continue;
      const near = enemies.some((e) => distance(u.position, e.position) <= drill.fireTeams!.splitAt);
      if (!near) continue;
      // The second half goes forward; which half is a leader's choice the
      // drill does not standardise, so it is taken in order and stays
      // deterministic.
      const going = men.slice(Math.ceil(men.length / 2)).map((m) => m.id);
      if (!going.length) continue;
      try {
        game.detachTeam(u.id, going);
        state.divided.add(u.id);
        // The force already in contact is the one that stays and shoots.
        state.baseOfFire.add(u.id);
      } catch {
        // A force that cannot divide (its nerve gone, the wrong phase)
        // simply fights on whole.
      }
    }
  }
  // How near each assaulting platoon's leading squad is to the enemy it knows of, for the platoons to arrive together.
  const leads = new Map<string, number>();
  if (company && company.arriveTogether !== false && enemies.length) {
    for (const u of forces) {
      const k = platoonIn(company, u.id);
      if (!k || !inPlay(u) || scouts.has(u.id) || (company.platoonTasks?.get(k) ?? "assault") !== "assault") continue;
      const d = Math.min(...enemies.map((e) => distance(u.position, e.position)));
      leads.set(k, Math.min(leads.get(k) ?? Infinity, d));
    }
  }
  const follows = followers(game, task, drill, state);
  // The breach squads' work, before the rest (`breach`): theirs is not the drill's march.
  const breaching = drill.breach && task.attacking && !waiting ? breachMoves(game, task, drill.breach, state, forces, enemies, scouts) : new Set<string>();
  forces.forEach((u, i) => {
    if (!inPlay(u)) return;
    if (breakingNow.has(u.id)) return; // its order is Break Contact's (decision 107)
    if (breaching.has(u.id)) return;
    state.startingStrength(u);
    // The next squad behind one clearing a house (decision 100): up to cover
    // near the door, and, when it goes in, no nearer than within reach.
    const follow = follows.get(u.id);
    if (follow) {
      // Going in, it must be within reach of both, wherever it stopped; waiting, near its point will do.
      const inReach = distance(u.position, follow.door) <= ASSAULT_RANGE_M && distance(u.position, game.getUnit(follow.defenderId).position) <= ASSAULT_RANGE_M;
      const there = follow.goIn ? inReach : distance(u.position, follow.wait) <= 3;
      game.setStandingOrder(u.id, there ? { gait: "normal" } : { gait: "normal", destination: { ...follow.wait } });
      return;
    }
    const nearest = pickTarget(u, enemies, axisOf(u, task), drill, Infinity);

    // Break contact: fall back before the force breaks, not after — once.
    if (state.fellBack.has(u.id)) {
      if (game.standingOrderFor(u.id)?.withdraw !== true) game.setStandingOrder(u.id, { gait: "normal" });
      return;
    }
    if (drill.breakContact && nearest && readyShare(u, state) < drill.breakContact.readyShareBelow) {
      const away = awayFrom(u.position, nearest.position, drill.breakContact.fallBack);
      if (game.setStandingOrder(u.id, { gait: "run", destination: away, withdraw: true })) state.fellBack.add(u.id);
      return;
    }
    const retaking = task.attacking ? undefined : state.counterattacking.get(u.id);
    // An arrived reinforcement goes up to where it waits as a reserve, its fire held (decision 122).
    // Not once it has left for its alternate position (decision 121): that order stands.
    const waitAt = task.attacking || retaking || state.displaced.has(u.id) ? undefined : state.reinforcementPosts.get(u.id);
    if (waitAt && distance(u.position, waitAt) > 10) {
      game.setStandingOrder(u.id, { gait: "normal", destination: { ...waitAt }, holdFire: true, engagementRange: triggerLine(u, drill, state.opened) });
      return;
    }
    if (retaking && drill.counterattack) {
      // The counterattack (decision 60): at the enemy on the lost position,
      // then onto the position itself; there it holds by the drill below.
      const foe = enemyOn(retaking, freshEnemies(game, side, enemies), drill.counterattack.lostWithin);
      // An enemy clearing the house is gone in after at its door (decision 104), wherever its mark is drawn.
      const door = foe ? counterDoor(game, side, foe) : undefined;
      if (door) {
        game.setStandingOrder(u.id, distance(u.position, door) <= ASSAULT_RANGE_M - 4 ? { gait: "normal" } : { gait: drill.counterattack.gait, destination: { ...door } });
        return;
      }
      // By a flank first (`counterattack.flank`), unless he is already in reach. Chosen once and
      // held to — whether the enemy on the post is in sight or not — until it is reached.
      const close = foe !== undefined && distance(u.position, foe.position) <= drill.assault.range + 5;
      if (drill.counterattack.flank && !close && !state.flanked.has(u.id)) {
        if (!state.flankVia.has(u.id) && foe) {
          const via = flankOf(game, u.position, retaking, task.objective, drill.counterattack.flank, task.extent);
          if (via) state.flankVia.set(u.id, via);
          else state.flanked.add(u.id);
        }
        const via = state.flankVia.get(u.id);
        if (via && distance(u.position, via) > 15) {
          game.setStandingOrder(u.id, { gait: drill.counterattack.gait, destination: { ...via } });
          return;
        }
        if (via) state.flanked.add(u.id);
      }
      if (close) state.flanked.add(u.id);
      if (state.flanked.has(u.id)) state.flankVia.delete(u.id); // reached: nothing left to keep
      if (foe) {
        game.setStandingOrder(
          u.id,
          distance(u.position, foe.position) <= drill.assault.range + 5
            ? { gait: "normal" } // close enough: hold, and assault in the fire phase
            : { gait: drill.counterattack.gait, destination: { ...foe.position } },
        );
        return;
      }
      if (distance(u.position, retaking) > 5) {
        game.setStandingOrder(u.id, { gait: drill.counterattack.gait, destination: { ...retaking } });
        return;
      }
    }
    if (
      !task.attacking &&
      drill.displace &&
      !state.displaced.has(u.id) &&
      (drill.displace.untenable
        ? // Untenable (decision 121): shelled this turn or last — under shellfire, not once long ago —
          // pinned, and an enemy seen this turn or last within reach, whatever its bearing.
          game.fireReceived(u.id, game.turn - 1).some((f) => f.kind === "indirect") &&
          suppressionLevel(u) === "pinned" &&
          enemyOn(u.position, freshEnemies(game, side, enemies), drill.displace.untenable.enemyWithin) !== undefined
        : u.downUnderShelling && !(nearest && distance(u.position, nearest.position) <= drill.displace.contactWithin)) &&
      !(drill.displace.alternateOnly && (!game.alternatePositionFor(u.id) || (game.closedTerrain && game.interior.buildingAt(game.terrain, u.position) !== undefined)))
    ) {
      // A withdrawal, so a pinned force may still go; its fire discipline
      // goes with it.
      // To the alternate position prepared for it, if there is one (rules
      // decision 38); otherwise straight back, into whatever the ground gives.
      const rear = game.alternatePositionFor(u.id)?.at ?? awayFrom(u.position, task.objective, drill.displace.metres);
      const order = { gait: "run" as const, destination: rear, withdraw: true, holdFire: true, engagementRange: triggerLine(u, drill, state.opened) };
      if (game.setStandingOrder(u.id, order)) state.displaced.add(u.id);
      return;
    }
    if (!task.attacking && state.displaced.has(u.id)) {
      // Still on its way to the new position: let it get there.
      const going = game.standingOrderFor(u.id);
      if (going?.withdraw && going.destination && distance(u.position, going.destination) > 1) return;
    }
    if (!task.attacking) {
      // Fire discipline as an order, so covering fire keeps it too: the engine
      // holds a force's fire — covering or not — until the enemy is inside
      // the line (rules decision 6's hold-fire order).
      const held = game.standingOrderFor(u.id);
      const line = triggerLine(u, drill, state.opened);
      if (held?.holdFire !== true || held.engagementRange !== line || held.withdraw) {
        game.setStandingOrder(u.id, { gait: "normal", holdFire: true, engagementRange: line });
      }
      return;
    }

    if (scouts.has(u.id)) {
      // Out ahead: bound and look — to its observation point if it was given
      // one — until the company says lie up, then go to ground and watch.
      let goal = task.objective;
      const post = scouts.get(u.id);
      let onPost = !post;
      if (post) {
        if (!state.arrivedOn.has(u.id) && distance(u.position, post) <= 10) state.arrivedOn.set(u.id, game.turn);
        // At its point with the enemy in sight, it stays: the give-up clock
        // runs only while it sees nothing.
        if (state.arrivedOn.has(u.id) && company!.scoutsLieUp) state.arrivedOn.set(u.id, game.turn);
        const since = state.arrivedOn.get(u.id);
        onPost = since !== undefined;
        if (since === undefined) goal = post;
        else if (company!.scoutsStay || game.turn - since < SCOUT_GIVE_UP_TURNS) goal = u.position; // lie up and watch
      }
      const watched = state.watched.get(u.id) ?? 0;
      // A scout still on its way to its point goes on when the company has
      // the enemy in sight — somebody else found it — and lies up when the
      // company goes in. One at its point, or sent straight, lies up.
      const lieUp = company!.scoutsLieUp && (onPost || !company!.hold);
      const halt =
        lieUp ||
        watched < (drill.scouting?.watchTurns ?? 0) ||
        distance(u.position, goal) < 1;
      const ordered = game.setStandingOrder(
        u.id,
        halt
          ? { gait: "normal", holdFire: true }
          : { gait: "normal", destination: toward(u.position, goal, 50), holdFire: true },
      );
      // A bound counts only if the order got through: out of the every-turn
      // band of command (rules decision 6) a refused bound is not a bound, and
      // counting it locks bound-and-observe out of step with the order cycle.
      state.watched.set(u.id, halt || !ordered ? watched + 1 : 0);
      return;
    }
    if (waiting) {
      // The main body holds until the scouts report — where its commander
      // told it to wait, or at its start line.
      const at = company!.waitAt.get(u.id);
      game.setStandingOrder(
        u.id,
        at && distance(u.position, at) > 5 ? { gait: "normal", destination: { ...at } } : { gait: "normal" },
      );
      return;
    }
    // The platoon's task once the company has gone (company.ts, PlatoonTask).
    const platoon = platoonIn(company, u.id);
    const job = (platoon && company?.platoonTasks?.get(platoon)) ?? "assault";
    const stay = () => game.setStandingOrder(u.id, { gait: "normal" });
    let platoonBounds = false;
    if (company && job === "withdraw") {
      const home = company.fallBackTo;
      if (home && distance(u.position, home) > 20) {
        const going = game.standingOrderFor(u.id);
        if (!going?.withdraw) game.setStandingOrder(u.id, { gait: "normal", destination: { ...home }, withdraw: true });
      } else stay();
      return;
    }
    // The support-by-fire team of a divided squad holds where it is and
    // shoots (Battle Drill 2A step 6: it "becomes the support by fire
    // team" and keeps a sustained rate with no lulls).
    // It is released once its assault team has taken the ground in front of
    // it, or is gone (step 12b: it "moves into designated positions"), and
    // goes on with its platoon — which consolidation then holds (drill
    // audit, A10: it used to hold where it split for the rest of the battle).
    if (state.baseOfFire.has(u.id)) {
      const clearWithin = drill.consolidate?.nothingWithin ?? 100;
      const team = game.units.filter((o) => o.id.startsWith(`${u.id}/`) && inPlay(o));
      const taken = team.every(
        (o) => distance(o.position, task.objective) <= clearWithin && !enemies.some((e) => distance(o.position, e.position) <= clearWithin),
      );
      if (!taken) {
        stay();
        return;
      }
      state.baseOfFire.delete(u.id);
    }
    if (company && job === "security") {
      // Flank and rear security (Battle Drill 2 steps 10 and 12b): hold
      // where you stand, in cover, and watch the way nobody else is
      // looking — away from the objective. The arc is an absolute bearing,
      // so it keeps pointing back even if the force shifts.
      if (drill.security) {
        const away = (axisOf(u, task) + 180) % 360;
        const now = u.observationSector;
        if (!now || Math.abs(now.bearing - away) > 1 || now.width !== drill.security.arc) {
          try {
            game.setObservationSector(u.id, { bearing: away, width: drill.security.arc });
          } catch {
            // A force that cannot be given an arc (broken, surrendered) just holds.
          }
        }
      }
      stay();
      return;
    }
    if (company && (job === "halt" || job === "reserve")) {
      // Halt: go to ground where it is. Reserve: hold where it waited, out of the fight until committed.
      const at = job === "reserve" ? company.waitAt.get(u.id) : undefined;
      if (at && distance(u.position, at) > 5) game.setStandingOrder(u.id, { gait: "normal", destination: { ...at } });
      else stay();
      return;
    }
    if (drill.consolidate && task.attacking && enemies.some((e) => distance(e.position, task.objective) <= drill.consolidate!.nothingWithin)) state.objectiveFound = true;
    const seized = seizedBy(task, drill, enemies, forces, company, state.objectiveFound);
    // Security pushed out to the limit of advance (FM 3-90 A-53; decision 130): one fresh squad, chosen once.
    const loa = task.attacking ? task.limitOfAdvance : undefined;
    if (seized && loa && drill.consolidate && !state.securityPush) state.securityPush = securityFor(game, task, drill, state, company, forces, scouts, loa);
    if (state.securityPush?.id === u.id && loa) {
      const at = state.securityPush.at;
      if (distance(u.position, at) > 5) {
        game.setStandingOrder(u.id, { gait: "normal", destination: { ...at } });
        return;
      }
      // There: in its cover, watching on past the limit, where a counterattack or the enemy's reinforcement comes from.
      const out = bearingDegrees(loa.at, { x: loa.at.x + loa.beyond.x, y: loa.at.y + loa.beyond.y });
      const now = u.observationSector;
      if (!now || Math.abs(now.bearing - out) > 1 || now.width !== drill.consolidate!.arc) {
        try {
          game.setObservationSector(u.id, { bearing: out, width: drill.consolidate!.arc });
        } catch {
          // A force that cannot be given an arc just holds the ground.
        }
      }
      stay();
      return;
    }
    if (seized && company && job === "support") {
      // Step 14b: the base of fire moves up onto the objective, and holds it with the rest.
      if (distance(u.position, task.objective) > drill.consolidate!.nothingWithin) {
        game.setStandingOrder(u.id, { gait: "normal", destination: { ...task.objective } });
        return;
      }
    }
    if (company && job === "support" && nearest) {
      const gun = u.mediumMg && drill.machineGuns ? Math.max(drill.attackFireRange, drill.machineGuns.range) : drill.attackFireRange;
      const canSee = freshEnemies(game, side, enemies).some((e) => game.canEngage(u, e));
      if (distance(u.position, nearest.position) <= gun && (canSee || !drill.baseOfFirePosition)) {
        stay(); // in reach, with something to shoot at: a base of fire
        return;
      }
      // In reach and blind: a firing position is the whole job (para 3-102).
      if (drill.baseOfFirePosition && game.terrain && task.extent) {
        const post = bestVantages(
          {
            terrain: game.terrain,
            targets: enemies.map((e) => e.position),
            minRange: drill.baseOfFirePosition.minRange,
            maxRange: gun,
          },
          u.position,
          1,
          { width: task.extent.width, height: task.extent.height, step: 20 },
        )[0];
        if (post && distance(u.position, post) > 10) {
          game.setStandingOrder(u.id, { gait: "normal", destination: { ...post } });
          return;
        }
      }
      // No better post to be had (or no map to search): it holds in reach, as a base of fire, and never charges.
      if (distance(u.position, nearest.position) <= gun) {
        stay();
        return;
      }
    }
    // Consolidation (Battle Drill 2 step 14): the objective is taken and
    // nothing is known to be near it, so hold it facing outward rather
    // than press on past it. Taken means "once the assaulting squads have
    // seized the enemy positions": nothing known near the objective as
    // well as near the squad, or a squad 100 m short of a position it has
    // not reached would stop there (drill audit, A7).
    // A squad holding its far side stays in consolidation wherever that is (decision 130).
    if (seized && (job === "assault" || job === "support") && (state.farSide.has(u.id) || distance(u.position, task.objective) <= drill.consolidate!.nothingWithin)) {
      // Judged from where it stood before it crossed: once it holds the far side, an enemy that
      // comes into reach there is left to the fire phase (para 2-181), not chased off the objective.
      const holdsFar = state.farSide.has(u.id);
      const near = holdsFar ? [] : enemies.filter((e) => distance(u.position, e.position) <= drill.consolidate!.nothingWithin);
      if (!near.length) {
        // Across to the far side, into the nearest cover there (para 2-181), chosen once.
        const far = drill.consolidate!.farSide ? farSideFor(game, task, drill, state, company, u) : undefined;
        if (far && distance(u.position, far) > 5) {
          game.setStandingOrder(u.id, { gait: "normal", destination: { ...far } });
          return;
        }
        // Facing on past the objective, along the line of attack — the LOA's, else from the start line — wherever
        // it holds: a squad that found no room on the far side and stands short of it faces on too, not back.
        const ahead = task.limitOfAdvance
          ? { x: task.objective.x + task.limitOfAdvance.beyond.x, y: task.objective.y + task.limitOfAdvance.beyond.y }
          : company?.fallBackTo && distance(company.fallBackTo, task.objective) > 1
            ? { x: 2 * task.objective.x - company.fallBackTo.x, y: 2 * task.objective.y - company.fallBackTo.y }
            : undefined;
        const onward = far && ahead ? bearingDegrees(task.objective, ahead) : axisOf(u, task);
        const now = u.observationSector;
        if (!now || Math.abs(now.bearing - onward) > 1 || now.width !== drill.consolidate!.arc) {
          try {
            game.setObservationSector(u.id, { bearing: onward, width: drill.consolidate!.arc });
          } catch {
            // A force that cannot be given an arc just holds the ground.
          }
        }
        stay();
        return;
      }
    }
    if (company && job === "assault") {
      // Waiting for the fires to lift: stop short of the enemy until they do.
      if (company.holdShort && nearest && distance(u.position, nearest.position) <= HOLD_SHORT_M) {
        // In the nearest cover (`coverInPlace`): the element "deploys into covered positions"
        // (ATP 3-21.10 (2026), para 2-172; drill audit, A13).
        // Never nearer the enemy than it stopped: the hold line keeps it out of its own shells' danger close.
        const hide = drill.coverInPlace ? coverNear(game, u.position, drill.coverInPlace.within, enemies.map((e) => e.position)) : undefined;
        if (hide && distance(hide, u.position) > 1) game.setStandingOrder(u.id, { gait: "normal", destination: hide });
        else stay();
        return;
      }
      // Together (ours, balance.md, forty-fifth round): a platoon that has come
      // to the last cover before the enemy waits there while another is still
      // well behind, so they close together, not one after another — for a few
      // turns at most, so a platoon stopped for good does not hold it back.
      if (platoon && nearest && leads.size > 1 && distance(u.position, nearest.position) <= TOGETHER.waitWithinM) {
        const mine = leads.get(platoon) ?? Infinity;
        const behindMost = Math.max(...[...leads].filter(([k]) => k !== platoon).map(([, d]) => d));
        const w = state.levelWaits.get(platoon) ?? { turn: -1, count: 0 };
        if (behindMost - mine > TOGETHER.gapM && w.count < TOGETHER.maxWaitTurns) {
          if (w.turn !== game.turn) state.levelWaits.set(platoon, { turn: game.turn, count: w.count + 1 });
          stay();
          return;
        }
      }
      // Bounding by platoon: one assaulting platoon moves while the others halt
      // and fire — only within the drill's fire range of a known enemy, where
      // the halted ones can cover it (thirty-seventh round: from the first
      // sighting anywhere it was waiting out of reach).
      if (company.boundByPlatoon && platoon && nearest && distance(u.position, nearest.position) <= drill.attackFireRange) {
        const assaulting = [...new Set([...(company.platoonOf?.entries() ?? [])].map(([, k]) => k))]
          .filter((k) => (company.platoonTasks?.get(k) ?? "assault") === "assault")
          .sort();
        if (assaulting.length > 1) {
          if (assaulting[game.turn % assaulting.length] !== platoon) {
            stay();
            return;
          }
          // The bounding platoon's squads go together: one level of bounding,
          // not squads alternating inside a platoon that already alternates.
          platoonBounds = true;
        }
      }
    }
    if (nearest && distance(u.position, nearest.position) <= drill.assault.range + 5) {
      game.setStandingOrder(u.id, { gait: "normal" }); // close enough: hold, and assault in the fire phase
      return;
    }
    const bounding = !inContact || !drill.overwatch || platoonBounds || (i + game.turn) % 2 === 0;
    if (!bounding) {
      const hide = drill.coverInPlace ? coverNear(game, u.position, drill.coverInPlace.within) : undefined;
      game.setStandingOrder(u.id, hide && distance(hide, u.position) > 1 ? { gait: "normal", destination: hide } : { gait: "normal" });
      return;
    }
    // By the company's axis, if it gave one, until the force has passed it.
    const via = company?.attackVia;
    if (via && !state.passedVia.has(u.id) && distance(u.position, via) <= 60) state.passedVia.add(u.id);
    const byVia = !!via && !state.passedVia.has(u.id);
    const goal = byVia ? via : task.objective;
    // On the way to the axis point it keeps to the axis, unless the enemy is close.
    const aim = nearest && (!byVia || distance(u.position, nearest.position) < 250) ? nearest.position : goal;
    const step = inContact ? drill.bound.metres : 100;
    // By covered ground where it has some (ours, forty-fifth round): out of
    // sight of the enemy the side knows of, until it is close.
    const covered =
      task.attacking && company && company.coveredRoutes !== false && game.terrain && enemies.length && nearest && distance(u.position, nearest.position) > COVERED.straightWithinM
        ? coveredStep(game.terrain, u.position, aim, step, enemies.map((e) => e.position))
        : undefined;
    const end = covered ?? toward(u.position, aim, step);
    game.setStandingOrder(u.id, {
      gait: inContact ? drill.bound.gait : "normal",
      destination: (inContact && drill.coverInPlace ? coverNear(game, end, drill.coverInPlace.within) : undefined) ?? end,
    });
  });
  // The limit of advance (FM 3-90 A-53): no element goes past it — not a chase, not a bound, not a scout (decision 130).
  if (task.attacking && task.limitOfAdvance) holdShortOfLimit(game, forces, task.limitOfAdvance);
  // The boundary (FM 3-90 A-16): each laned force moves only in its lane, and asks to have the line redrawn (decision 132).
  if (task.attacking && task.boundary) holdInLane(game, forces, task, state);
  const done = game.executeStandingOrders(side);
  report?.executed?.(done);

  const live = forces.filter(inPlay);
  if (live.length === 0) return;
  const cx = live.reduce((s, u) => s + u.position.x, 0) / live.length;
  const cy = live.reduce((s, u) => s + u.position.y, 0) / live.length;
  // Where a command group follows. Doctrine has the leader close on the
  // point of contact rather than keep a fixed distance (Battle Drill 2 step
  // 4: the platoon leader, RTO, FO, the next squad's leader and a machine
  // gun team "move forward to link up with the squad leader of the squad or
  // section in contact") — which buys him the assessments of steps 8, 11
  // and 12, and exposes him for it (decision 55).
  const lead = drill.leaderForward && task.attacking && enemies.length ? nearestOwnToEnemy(live, enemies) : undefined;
  const anchor = lead ?? { x: cx, y: cy };
  const metres = lead && drill.leaderForward ? drill.leaderForward.behind : drill.commandGroupBehind;
  // Behind is back toward the start line once the company has crossed to the far side (decision 130): measured
  // away from the objective, it would be out in front of a company standing past it. Before then, as it always was.
  const back = task.attacking && state.farSide.size > 0 && company?.fallBackTo ? company.fallBackTo : undefined;
  const raw = back ? toward(anchor, back, metres) : toward(anchor, task.objective, -metres);
  const behind = task.attacking && task.limitOfAdvance ? shortOfLimit(task.limitOfAdvance, anchor, raw) : raw;
  for (const hq of game.units.filter((u) => u.side === side && u.kind === "command" && inPlay(u))) {
    // A defending command group keeps the squads' fire discipline: without it
    // its covering fire springs the ambush at the edge of small-arms reach on
    // anything the side has seen, and gives the position away (balance.md,
    // twelfth round — found through the observation posts, which make the
    // side see the attacker sooner).
    if (!task.attacking) {
      const held = game.standingOrderFor(hq.id);
      if (held?.holdFire !== true || held.engagementRange !== drill.openFireRange) {
        game.setStandingOrder(hq.id, { gait: "normal", holdFire: true, engagementRange: drill.openFireRange });
      }
      // A defending command post stays where it was set up (2026-09-30):
      // following its squads forward walked it out of cover into the
      // attacker's shelling, and a company command group that broke there
      // took the side's fire control with it (rules decision 55) — the
      // defender's mortars fell silent a quarter of the time.
      continue;
    }
    // An observation post holds its ground: moving would end it (decision 38).
    if (hq.observationPost || distance(hq.position, behind) < 5) continue;
    const step = toward(hq.position, behind, 25);
    try {
      game.moveUnit(hq.id, task.attacking && task.limitOfAdvance ? shortOfLimit(task.limitOfAdvance, hq.position, step) : step);
    } catch {
      // Pinned, out of budget, nowhere to go: it stays where it is.
    }
  }
}

/**
 * The fire phase: shoot into the sector, assault what is close, cover when
 * idle. With the drill's `state`, a reserve counterattacking (decision 60)
 * takes the enemy on the position it is retaking before anything else.
 */
export function drillCombat(game: Game, task: DrillTask, drill: SquadDrill, state?: DrillState, report?: DrillReport): void {
  const { side } = task;
  const knownToSide = knownEnemies(game, side);
  const baseReach = task.attacking ? drill.attackFireRange : drill.openFireRange;
  const heavy = drill.heavyWeapons;
  // The platoons whose fire was open before this phase: the rest of one opened now fires with it
  // from the next turn, when its standing order has been widened (`massedOpening`).
  const openedBefore = new Set(state?.opened ?? []);
  const follows = followers(game, task, drill, state);
  // Still forces first, then the quicker (rules decision 72).
  for (const u of game.firingOrder(side).filter(inPlay)) {
    // A force at charge work spends the turn on it: a shot or an assault would throw it away (decision 16).
    if (u.layingCharge) continue;
    // The next squad goes in after the one clearing (decision 100): an
    // assault on the house's defender joins the fight (decision 99).
    const follow = follows.get(u.id);
    const inside = follow ? game.getUnit(follow.defenderId) : undefined;
    const insidePastLoa =
      !!inside &&
      task.attacking &&
      ((!!task.limitOfAdvance && pastLimit(task.limitOfAdvance, inside.position) > 0) || acrossFrom(task, laneHolding(task, u), inside.position));
    if (follow?.goIn && inside && !insidePastLoa && distance(u.position, follow.door) <= ASSAULT_RANGE_M && distance(u.position, inside.position) <= ASSAULT_RANGE_M) {
      if (u.covering) game.setCovering(u.id, false); // a posture is no reason not to go in
      const r = game.assault(u.id, inside.id, drill.assault.grenades);
      report?.assaulted?.(u, inside, drill.assault.grenades, r);
      if (r.reason === GOES_INSIDE) continue;
    }
    // A force fighting inside a building fights the enemy in it room by
    // room, and fires out of its windows at the rest (decision 98).
    const fight = game.interior.engagementOf(u.id);
    const enemies = fight ? knownToSide.filter((e) => game.interior.engagementOf(e.id) !== fight) : knownToSide;
    const tank = heavy !== undefined && u.kind === "vehicle" && (u.vehicle?.vehicleClass ?? "mbt") === "mbt";
    // A machine gun team shoots as far as its gun reaches (decision 90):
    // the drill's engagement range is written for rifles, and the whole
    // point of a crew-served gun in a base of fire is that it outranges
    // them (ATP 3-21.8 para C-119).
    const reach = tank
      ? Math.max(baseReach, heavy.tankGunRange)
      : !task.attacking
        ? triggerLine(u, drill, openedBefore)
        : u.mediumMg && drill.machineGuns
          ? Math.max(baseReach, drill.machineGuns.range)
          : baseReach;
    // A scout watches and reports; it does not give itself away (decision 52)
    // — unless the company has gone in and told it to give a base of fire.
    if (task.company?.scouts.has(u.id) && !(task.company.scoutsFire && !task.company.hold)) continue;
    const retaking = task.attacking || !drill.counterattack ? undefined : state?.counterattacking.get(u.id);
    // A reserve not yet committed holds its fire (decision 105): it is kept for the counterattack —
    // unless it is itself attacked, shot at or an enemy within assault reach, when it fights
    // ("reserves must be prepared to react to this targeting", ATP 3-21.8 (2024), para 5-67; drill audit, D5).
    const attacked = () =>
      game.fireReceived(u.id, game.turn - 1).length > 0 || enemies.some((e) => distance(u.position, e.position) <= drill.assault.range);
    if (!task.attacking && drill.counterattack?.holdFire && reservesOf(game, task).has(u.id) && !retaking && !attacked()) continue;
    const foe = retaking && enemyOn(retaking, freshEnemies(game, side, enemies), drill.counterattack!.lostWithin);
    // Break Contact (decision 107): smoke where the side can (step 5), at most BREAK_CONTACT_SCREENS a break.
    // ⚠️ Ours: fire comes after movement, so a screen laid as the bound ends covers the changeover and the next bound.
    const breaking = [...(state?.breaking.values() ?? [])].find((b) => b.mover === u.id && !b.smoked && (b.screens ?? 0) < BREAK_CONTACT_SCREENS);
    if (breaking) {
      breaking.smoked = true;
      const mark = enemies.filter((e) => distance(u.position, e.position) <= RIFLE_GRENADE_RANGE).sort((a, b) => distance(u.position, a.position) - distance(u.position, b.position))[0];
      if (mark) {
        try {
          game.deploySmoke("rifleGrenade", side, { ...mark.position });
          breaking.screens = (breaking.screens ?? 0) + 1;
        } catch {
          // No grenadier within reach, or the side may not: it goes unscreened.
        }
      }
    }
    // The counterattack inside (decision 104): at the door of the house being cleared, it goes in.
    const door = foe ? counterDoor(game, side, foe) : undefined;
    if (foe && door && u.kind === "infantry" && !game.interior.inFight(u.id) && distance(u.position, door) <= ASSAULT_RANGE_M) {
      const r = game.assault(u.id, foe.id, drill.assault.grenades);
      report?.assaulted?.(u, foe, drill.assault.grenades, r);
      continue;
    }
    // Screening smoke (Battle Drill 2 step 11a(3)): a supporting force
    // whose company has gone in blinds the position to the assault.
    if (
      drill.screeningSmoke &&
      drill.grenadiers &&
      state &&
      task.attacking &&
      task.company &&
      !task.company.hold &&
      u.kind === "infantry" &&
      state.screens < drill.screeningSmoke.screens
    ) {
      const key = platoonIn(task.company, u.id);
      const job2 = (key && task.company.platoonTasks?.get(key)) ?? "assault";
      const mark = enemies
        .filter((e) => distance(u.position, e.position) <= RIFLE_GRENADE_RANGE)
        .find((e) => !game.smoke.some((sm) => distance(sm.center, e.position) < sm.radius));
      // The support-by-fire team of a divided squad screens too (2A step 6c(3)): it is
      // the one near enough for a rifle grenade, where a platoon's base of fire at
      // 150 m and more never was (drill audit, A14).
      if ((job2 === "support" || state.baseOfFire.has(u.id)) && mark) {
        try {
          game.deploySmoke("rifleGrenade", side, { ...mark.position });
          state.screens += 1;
        } catch {
          // No launcher, wrong phase, or the side may not: it just fires.
        }
      }
    }
    const hurting = drill.returnFire ? hurtingUs(game, side, u, enemies, drill.returnFire.since) : undefined;
    // A force giving a base of fire while the assault is in shoots at the
    // far side of the objective, not across the assault's front.
    const shifted = drill.shiftToFarFlank && task.attacking ? farFlankOnly(game, u, task, enemies, drill.shiftToFarFlank.clear, state) : enemies;
    // Across the boundary only where no friend can be hit (A-16; decision 132).
    const lane = laneHolding(task, u);
    const inLane = lane ? shifted.filter((e) => !acrossFrom(task, lane, e.position) || safeAcross(game, u, e)) : shifted;
    // Never through its own men (decision 133): a masked enemy is not a target; the risk to friends beside the line it takes.
    const mine = game.friendlyFire ? inLane.filter((e) => !game.isMasked(u.id, e.id)) : inLane;
    // A foe it is set on, too, unless masked short of the assault: then it takes another it can shoot (the review).
    const foeMasked = !!foe && game.friendlyFire && distance(u.position, foe.position) > drill.assault.range && game.isMasked(u.id, foe.id);
    const target =
      foe && distance(u.position, foe.position) <= reach && !foeMasked
        ? foe
        : pickTarget(u, mine, axisOf(u, task), drill, reach, hurting, game, sectorOf(task, u));
    if (!target) {
      // A consolidating attacker covers its new sector too (step 14h), not
      // only a defender in its own position.
      const consolidating =
        !!drill.consolidate &&
        task.attacking &&
        distance(u.position, task.objective) <= drill.consolidate.nothingWithin;
      if ((!task.attacking || consolidating) && drill.coverWhenIdle && !u.covering && !u.firedThisTurn && u.kind !== "vehicle") {
        try {
          game.setCovering(u.id, true);
        } catch {
          // Nobody fit to cover with, or a force that broke.
        }
      }
      continue;
    }
    if (u.covering) game.setCovering(u.id, false);
    // A force fighting inside cannot go out to assault: it fires from its windows (decision 98).
    // A defender already in a fight is gone in after only by the next squad (decision 100).
    // A defender holding a house fights from it: leaving it — to reposition, or to go out and
    // attack — is a commander's decision, never the drill's (decision 106; no doctrine prescribes it).
    const holdsHouse = !task.attacking && game.closedTerrain && game.interior.buildingAt(game.terrain, u.position) !== undefined;
    // A force breaking contact fires to get away, and never charges (decision 107).
    const breakingNow = [...(state?.breaking ?? [])].some(([id, b]) => id === u.id || b.team === u.id);
    // A house whose breach is being made is gone into by it, once it is set (`breach`).
    const awaitsBreach = task.attacking && waitsForBreach(game, state, side, u, target, !!task.company?.hold);
    // Not onto an enemy past the limit of advance: it is fired on from short of it (decision 130).
    const pastLoa = task.attacking && !!task.limitOfAdvance && pastLimit(task.limitOfAdvance, target.position) > 0;
    // Nor onto an enemy across the boundary: fired on from its own lane, never closed with (decision 132).
    const across = acrossFrom(task, lane, target.position);
    if (u.kind !== "command" && !fight && !holdsHouse && !breakingNow && !awaitsBreach && !pastLoa && !across && !game.interior.inFight(target.id) && distance(u.position, target.position) <= drill.assault.range) {
      const r = game.assault(u.id, target.id, drill.assault.grenades);
      report?.assaulted?.(u, target, drill.assault.grenades, r);
    } else if (tank && fired(game.fireExplosive("tankRound", u.id, target.id), (r) => report?.explosive?.(u, target, "tankRound", r))) {
      // The main gun; the coaxial gun when it could not fire (below its minimum range, say).
    } else if (
      heavy !== undefined &&
      u.kind === "infantry" &&
      target.kind === "vehicle" &&
      distance(u.position, target.position) <= heavy.rpgRange
    ) {
      // Rifles do nothing to armour: the squad's RPG does.
      const r = game.fireExplosive("rpgVsArmor", u.id, target.id);
      report?.explosive?.(u, target, "rpgVsArmor", r);
    } else {
      const r = game.fire(u.id, target.id, { weapon: u.kind === "vehicle" ? "sustainedMg" : "smallArms" });
      report?.fired?.(u, target, r);
      // Nor its grenadiers through its own men (decision 133).
      if (drill.grenadiers && r.reason !== MASKED_BY_FRIENDS) {
        const volleys = fireGrenadiers(game, u, target, drill.grenadiers.menPerLauncher);
        report?.grenadiers?.(u, target, volleys);
      }
    }
    // Its platoon's fire is open once a shot has gone: the rest of it fires with it from the next turn (`massedOpening`).
    if (!task.attacking && drill.massedOpening && u.firedThisTurn) state?.opened.add(platoonKey(u.id));
  }
}

/** Report a tank round only when it went downrange, and say whether it did. */
function fired(r: WithCoveringFire<DirectExplosiveResult>, tell: (r: WithCoveringFire<DirectExplosiveResult>) => void): boolean {
  if (r.fired) tell(r);
  return r.fired;
}

/** The furthest a rifle grenade is fired: the table's last band. */
const RIFLE_GRENADE_RANGE = EXPLOSIVES.rifleGrenade!.toHitBands!.at(-1)!.maxRange;

/**
 * A squad's grenadiers fire at its target, each his launcher's rate for the
 * turn — only inside the weapon's reach, so a shot out of range is never
 * taken (it would still spring the enemy's covering fire). Returns what each
 * launcher fired, for the log; none when it had nothing to fire at.
 */
export function fireGrenadiers(
  game: Game,
  u: Unit,
  target: Unit,
  menPerLauncher: number,
): WithCoveringFire<DirectExplosiveResult>[] {
  const volleys: WithCoveringFire<DirectExplosiveResult>[] = [];
  if (u.kind !== "infantry" || !inPlay(u) || target.neutralized) return volleys;
  if (distance(u.position, target.position) > RIFLE_GRENADE_RANGE) return volleys;
  const ready = (u.soldiers ?? []).filter((s) => !s.neutralized && s.morale?.state !== "broken").length;
  // Fighting inside, only the men at its windows facing the target can fire out (decision 98).
  const atWindows = game.windowShooters(u, target);
  const launchers = Math.min(Math.floor(ready / menPerLauncher), atWindows ?? Infinity);
  for (let i = 0; i < launchers && !target.neutralized; i++) {
    const r = game.fireExplosive("rifleGrenade", u.id, target.id);
    volleys.push(r);
    if (!r.fired) break;
  }
  return volleys;
}

/** A breach squad's house, and how its charges there have gone (`SquadDrill.breach`). */
export interface BreachJob {
  buildingId: string;
  /** The turn it was given the house: the rest wait from then, for `waitTurns`. */
  since: number;
  /** The walls it has started a charge on, in order: a second goes on another (the author, 2026-11-19). */
  faces: Facing[];
  /** The turn its charge was first seen set: the rest go in by it within `waitTurns` of it, or the squad is let go. */
  setOn?: number;
}

function copyJob(j: BreachJob): BreachJob {
  return { buildingId: j.buildingId, since: j.since, faces: [...j.faces], ...(j.setOn !== undefined ? { setOn: j.setOn } : {}) };
}

/**
 * How far off a house an enemy's mark may be drawn and still be taken to be
 * in it (⚠️ ours): a report is drawn with its error (decision 51), and a
 * defender seen at a window is marked beside the wall as often as inside it.
 */
export const HOUSE_MARK_M = 15;

/**
 * The house a known enemy is in, as its side judges from his mark: the
 * building it stands in, else the nearest within {@link HOUSE_MARK_M}, on
 * closed terrain.
 */
function houseOf(game: Game, at: Point): MapObject | undefined {
  if (!game.closedTerrain) return undefined;
  const inIt = game.interior.buildingAt(game.terrain, at);
  if (inIt) return inIt;
  let best: { o: MapObject; d: number } | undefined;
  for (const o of game.terrain.objects) {
    if (o.kind !== "building" || o.footprint.shape !== "polygon") continue;
    const d = distanceToPolygon(at, o.footprint.points);
    if (d <= HOUSE_MARK_M && (!best || d < best.d)) best = { o, d };
  }
  return best?.o;
}

/**
 * The house an enemy's mark makes one to breach (`breach`), for both halves
 * of the rule — the breach squads' work and the rest's wait: an infantry or
 * command force in a house the side is not already fighting in, and not
 * given up on.
 */
function breachableHouse(game: Game, state: DrillState, side: Side, e: Unit): MapObject | undefined {
  if (e.kind !== "infantry" && e.kind !== "command") return undefined;
  const h = houseOf(game, e.position);
  return h && game.interior.attackerSideIn(h.id) !== side && !state.breachGaveUp.has(h.id) ? h : undefined;
}

/**
 * Name each platoon's breach squad at mission planning, as a player may
 * (decision 125): its last squad by the scenario's numbering that is not a
 * scout (⚠️ ours) — a scout goes ahead alone to find the enemy. A platoon
 * that has one named keeps it. Only where the drill breaches.
 */
export function designateBreachSquads(game: Game, side: Side, drill: SquadDrill, scout: (u: Unit) => boolean = () => false): string[] {
  if (!drill.breach) return [];
  const squads = game.units.filter((u) => u.side === side && u.kind === "infantry" && u.echelon === "squad" && !scout(u));
  const platoons = new Map<string, Unit[]>();
  for (const u of squads) platoons.set(platoonKey(u.id), [...(platoons.get(platoonKey(u.id)) ?? []), u]);
  const named: string[] = [];
  for (const list of platoons.values()) {
    if (list.some((u) => u.breachElement)) continue;
    const last = [...list].sort((a, b) => a.id.localeCompare(b.id)).at(-1)!;
    try {
      game.designateBreachElement(last.id);
      named.push(last.id);
    } catch (e) {
      // The side has named all it may (one a platoon, as the engine counts them); anything else is a fault.
      if (!(e instanceof Error) || !e.message.includes("one a platoon")) throw e;
    }
  }
  return named;
}

/**
 * The breach squads' turn (`SquadDrill.breach`, the author's rulings of
 * 2026-11-19): each takes the nearest house it knows an enemy in, goes to the
 * wall in reach nearest it — never the front door's face — and sets a charge
 * there. Set, it holds by it: the rest go in by it. Lost, it tries another
 * wall with its second charge; after that, or with none left, or once the
 * rest have waited `waitTurns`, the house is the door's. Returns the squads
 * whose order this was.
 */
function breachMoves(
  game: Game,
  task: DrillTask,
  breach: NonNullable<SquadDrill["breach"]>,
  state: DrillState,
  forces: readonly Unit[],
  enemies: readonly Unit[],
  scouts: ReadonlyMap<string, Point | null>,
): Set<string> {
  const ordered = new Set<string>();
  if (!game.closedTerrain) return ordered;
  const side = task.side;
  // Houses a known enemy is in, that the side is not already fighting in.
  const houses = new Map<string, MapObject>();
  for (const e of enemies) {
    const h = breachableHouse(game, state, side, e);
    if (h) houses.set(h.id, h);
  }
  const giveUp = (u: Unit, job: BreachJob) => {
    state.breachGaveUp.add(job.buildingId);
    state.breachJobs.delete(u.id);
  };
  for (const u of forces) {
    if (!u.breachElement || u.kind !== "infantry" || scouts.has(u.id)) continue;
    let job = state.breachJobs.get(u.id);
    if (!inPlay(u) || game.interior.inFight(u.id)) {
      if (job) giveUp(u, job);
      continue;
    }
    const was = job ? game.terrain.objects.find((o) => o.id === job!.buildingId) : undefined;
    // Gone in (by its hole or any way): its work there is done.
    if (job && (!was || game.interior.attackerSideIn(was.id) === side)) {
      state.breachJobs.delete(u.id);
      job = undefined;
    }
    if (!job) {
      if ((u.breachingCharges ?? 0) <= 0) continue;
      const taken = new Set([...state.breachJobs.values()].map((j) => j.buildingId));
      const near = [...houses.values()]
        .filter((h) => !taken.has(h.id))
        .map((h) => ({ h, d: Math.min(...FACINGS.map((f) => game.interior.breachPoint(game, h, f)).filter((p): p is Point => !!p).map((p) => distance(u.position, p))) }))
        .filter((x) => Number.isFinite(x.d))
        .sort((a, b) => a.d - b.d)[0];
      if (!near) continue;
      job = { buildingId: near.h.id, since: game.turn, faces: [] };
      state.breachJobs.set(u.id, job);
    }
    const h = game.terrain.objects.find((o) => o.id === job!.buildingId)!;
    ordered.add(u.id);
    // At work, or its charge set: it holds by the wall.
    const set = game.interior.breachesIn(game, h, side).some((b) => b.side === side && !b.blown);
    if (set) {
      job.setOn ??= game.turn;
      // Set and not gone in by within the wait, or no enemy known in the house any more: its work there
      // is over, and it fights by the drill — by its own charge, if it goes in (the author, 2026-11-19).
      if (game.turn - job.setOn >= breach.waitTurns || !houses.has(h.id)) {
        giveUp(u, job);
        ordered.delete(u.id);
        continue;
      }
    }
    if (u.layingCharge?.type === "breach" || set) {
      game.setStandingOrder(u.id, { gait: "normal" });
      continue;
    }
    // Two tries, charges left, and the rest not waited out.
    if (job.faces.length >= 2 || (u.breachingCharges ?? 0) <= 0 || game.turn - job.since >= breach.waitTurns) {
      giveUp(u, job);
      ordered.delete(u.id);
      continue;
    }
    const face = breachFace(game, h, u, job.faces);
    const wall = face && game.interior.breachPoint(game, h, face);
    if (!face || !wall) {
      giveUp(u, job);
      ordered.delete(u.id);
      continue;
    }
    // A charge is set from the street, never from within the walls (`LAY_CHARGE_REFUSAL.insideIt`).
    const within = h.footprint.shape === "polygon" && pointInPolygon(u.position, h.footprint.points);
    if (!within && distance(u.position, wall) <= ASSAULT_RANGE_M - 2 && u.movedThisTurn === 0) {
      try {
        game.layCharge(u.id, "breach", { buildingId: h.id, facing: face });
        job.faces.push(face);
        continue;
      } catch {
        // Under fire, or not under orders: it holds where it is and tries next turn.
        game.setStandingOrder(u.id, { gait: "normal" });
        continue;
      }
    }
    // Up to the wall: 5 m out from it, on the street side.
    const c = buildingCentre(h);
    const d = distance(wall, c) || 1;
    game.setStandingOrder(u.id, { gait: "normal", destination: { x: wall.x + ((wall.x - c.x) * 5) / d, y: wall.y + ((wall.y - c.y) * 5) / d } });
  }
  return ordered;
}

/** The wall a breach squad charges: in reach of the house, nearest it, never the front door's face, not one tried. */
function breachFace(game: Game, h: MapObject, u: Unit, tried: readonly Facing[]): Facing | undefined {
  const plan = game.interior.plan(game, h);
  const door = plan.outsideDoors[0];
  const doorFace = door === undefined ? undefined : facingOf(plan, door);
  return FACINGS.map((f) => ({ f, p: game.interior.breachPoint(game, h, f) }))
    .filter((x): x is { f: Facing; p: Point } => !!x.p && x.f !== doorFace && !tried.includes(x.f) && !game.interior.breachOn(game, h, x.f, u.side))
    .sort((a, b) => distance(u.position, a.p) - distance(u.position, b.p))[0]?.f;
}

function buildingCentre(h: MapObject): Point {
  const pts = h.footprint.shape === "polygon" ? h.footprint.points : [];
  return pts.length ? { x: pts.reduce((t, p) => t + p.x, 0) / pts.length, y: pts.reduce((t, p) => t + p.y, 0) / pts.length } : { x: 0, y: 0 };
}

/**
 * Whether a force holds off assaulting a house because its side's breach
 * there is being made (`breach`): every force while the charge is not yet
 * set, and the breach squad itself until the hole is blown — it does not
 * clear (the author, 2026-11-19).
 */
function waitsForBreach(game: Game, state: DrillState | undefined, side: Side, u: Unit, target: Unit, holding: boolean): boolean {
  if (!state) return false;
  const h = breachableHouse(game, state, side, target);
  if (!h) return false;
  for (const [squadId, job] of state.breachJobs) {
    if (job.buildingId !== h.id) continue;
    const squad = game.getUnit(squadId);
    if (!inPlay(squad) || game.interior.inFight(squadId)) continue;
    if (squadId === u.id) return true;
    return !game.interior.breachesIn(game, h, side).some((b) => b.side === side && !b.blown);
  }
  // Found only this turn: a breach squad free to take it is given it next turn, and the rest hold for it.
  const taken = new Set([...state.breachJobs.keys()]);
  // Only for a house with a wall it can charge, and a company not holding: else no job will
  // ever come (`breachMoves` gives none while it holds), and the wait would never end.
  if (holding) return false;
  return game.units.some(
    (s) =>
      s.side === side && s.breachElement && !taken.has(s.id) && (s.breachingCharges ?? 0) > 0 && inPlay(s) && !game.interior.inFight(s.id) && breachFace(game, h, s, []) !== undefined,
  );
}
