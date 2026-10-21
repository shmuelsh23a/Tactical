import {
  ASSAULT_RANGE_M,
  EXPLOSIVES,
  GOES_INSIDE,
  RIFLE_GRENADIERS,
  angleBetween,
  pointInPolygon,
  bearingDegrees,
  distance,
  suppressionLevel,
  type Game,
  type MovementMode,
  type Point,
  type Side,
  type AssaultResult,
  type DirectExplosiveResult,
  type DirectFireResult,
  type StandingOrderExecution,
  type Unit,
  type WithCoveringFire,
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
   */
  displace?: { metres: number; contactWithin: number };
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
   */
  counterattack: { lostWithin: number; gait: MovementMode; holdFire?: boolean } | null;
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
  consolidate?: { nothingWithin: number; arc: number };
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
  consolidate: { nothingWithin: 100, arc: 120 },
  coverInPlace: { within: 25 },
  screeningSmoke: { screens: 4 },
  fireTeams: { splitAt: 300, minMen: 6 },
  machineGuns: { range: 800 },
  baseOfFirePosition: { minRange: 150 },
};

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
  /** A defending side's platoons whose fire has been opened (`massedOpening`): the rest of each fires with it. */
  readonly opened = new Set<string>();

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
 * Whether the attack has seized its objective, for consolidation (Battle
 * Drill 2 step 14): an assaulting force of ours is on it and no enemy the
 * side knows of is within the drill's `consolidate.nothingWithin` of it.
 * Never without `consolidate`.
 */
function seizedBy(task: DrillTask, drill: SquadDrill, enemies: readonly Unit[], forces: readonly Unit[], company: CompanyOrders | undefined): boolean {
  const c = drill.consolidate;
  if (!c || !task.attacking || company?.hold) return false;
  if (enemies.some((e) => distance(e.position, task.objective) <= c.nothingWithin)) return false;
  return forces.some((o) => {
    if (!inPlay(o) || o.kind === "command" || company?.scouts.has(o.id) || distance(o.position, task.objective) > c.nothingWithin) return false;
    const k = platoonIn(company, o.id);
    return ((k && company?.platoonTasks?.get(k)) ?? "assault") === "assault";
  });
}

/**
 * The nearest point with ground cover within `within` metres of `p`
 * (`p` itself if it has some), never inside a building — going into one is
 * a fight of its own (decision 96). None that near: undefined.
 */
function coverNear(game: Game, p: Point, within: number): Point | undefined {
  if (game.groundCoverAt(p) !== "none") return p;
  const houses = game.terrain.objects.filter((o) => o.kind === "building" && o.footprint.shape === "polygon");
  for (let r = 5; r <= within; r += 5) {
    let best: Point | undefined;
    let bestD = Infinity;
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8;
      const q = { x: p.x + r * Math.cos(a), y: p.y + r * Math.sin(a) };
      if (houses.some((o) => o.footprint.shape === "polygon" && pointInPolygon(q, o.footprint.points))) continue;
      if (game.groundCoverAt(q) === "none") continue;
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
 */
function pickTarget(
  u: Unit,
  enemies: Unit[],
  axis: number,
  drill: SquadDrill,
  reach: number,
  hurting?: ReadonlyMap<string, number>,
  game?: Game,
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
  const inArc = (e: Unit) => drill.sectorWidth >= 360 || angleBetween(bearingDegrees(u.position, e.position), axis) <= drill.sectorWidth / 2;
  if (drill.threatFirst && game) {
    const heavy = (e: Unit) => (e.mediumMg || e.kind === "vehicle" ? 1 : 0);
    // Pinned as the firer's side can watch it, as the suppression gate reads it (hasEyesOn).
    const pinned = (e: Unit) => {
      try {
        const it = game.getUnit(e.id);
        return hasEyesOn(game, u.side, it) && suppressionLevel(it) === "pinned" ? 1 : 0;
      } catch {
        return 0;
      }
    };
    const near = (e: Unit) => distance(u.position, e.position);
    const ranked = [...inReach].sort(
      (a, b) =>
        weight(b) - weight(a) ||
        pinned(a) - pinned(b) ||
        heavy(b) - heavy(a) ||
        Number(inArc(b)) - Number(inArc(a)) ||
        near(a) - near(b),
    );
    const first = ranked[0];
    // Shooting back needs no sector; anything else outside it only if the drill strays.
    return first && (weight(first) > 0 || inArc(first) || drill.engageOutsideSector) ? first : undefined;
  }
  const inSector = inReach.find(inArc);
  return inSector ?? (drill.engageOutsideSector ? inReach[0] : undefined);
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

/**
 * Commit a defender's reserves (rules decision 60): each reserve not yet
 * committed goes for the nearest forward position of its own platoon that is
 * lost — its squad out of the fight or gone from it, or its house being
 * cleared round it (decision 104), and an enemy known on it. Once committed
 * it stays committed; its assault on an enemy fighting inside goes in.
 */
function commitReserves(game: Game, task: DrillTask, drill: SquadDrill, state: DrillState, forces: Unit[], enemies: Unit[]): void {
  const counter = drill.counterattack;
  const reserves = task.reserves;
  if (!counter || !reserves?.size) return;
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
    const mine = lost
      .filter(([id]) => platoonKey(id) === platoonKey(r.id))
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
  if (!task.attacking) {
    for (const u of forces) {
      if (u.kind === "infantry" && !task.reserves?.has(u.id) && !state.posts.has(u.id)) state.posts.set(u.id, { ...u.position });
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
  forces.forEach((u, i) => {
    if (!inPlay(u)) return;
    if (breakingNow.has(u.id)) return; // its order is Break Contact's (decision 107)
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
      u.downUnderShelling &&
      !state.displaced.has(u.id) &&
      !(nearest && distance(u.position, nearest.position) <= drill.displace.contactWithin)
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
    const seized = seizedBy(task, drill, enemies, forces, company);
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
    if (seized && (job === "assault" || job === "support") && distance(u.position, task.objective) <= drill.consolidate!.nothingWithin) {
      const near = enemies.filter((e) => distance(u.position, e.position) <= drill.consolidate!.nothingWithin);
      if (!near.length) {
        const onward = axisOf(u, task);
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
        stay();
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
  const behind =
    lead && drill.leaderForward
      ? toward(lead, task.objective, -drill.leaderForward.behind)
      : toward({ x: cx, y: cy }, task.objective, -drill.commandGroupBehind);
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
    try {
      game.moveUnit(hq.id, toward(hq.position, behind, 25));
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
    // The next squad goes in after the one clearing (decision 100): an
    // assault on the house's defender joins the fight (decision 99).
    const follow = follows.get(u.id);
    const inside = follow ? game.getUnit(follow.defenderId) : undefined;
    if (follow?.goIn && inside && distance(u.position, follow.door) <= ASSAULT_RANGE_M && distance(u.position, inside.position) <= ASSAULT_RANGE_M) {
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
    if (!task.attacking && drill.counterattack?.holdFire && task.reserves?.has(u.id) && !retaking && !attacked()) continue;
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
    const mine = drill.shiftToFarFlank && task.attacking ? farFlankOnly(game, u, task, enemies, drill.shiftToFarFlank.clear, state) : enemies;
    const target =
      foe && distance(u.position, foe.position) <= reach
        ? foe
        : pickTarget(u, mine, axisOf(u, task), drill, reach, hurting, game);
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
    if (u.kind !== "command" && !fight && !holdsHouse && !breakingNow && !game.interior.inFight(target.id) && distance(u.position, target.position) <= drill.assault.range) {
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
      if (drill.grenadiers) {
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
