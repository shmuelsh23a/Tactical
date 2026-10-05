import {
  EXPLOSIVES,
  angleBetween,
  bearingDegrees,
  distance,
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
import { sideView } from "./hotseat.js";
import { HOLD_SHORT_M, platoonKey, type CompanyOrders } from "./company.js";
import { isDeadGround } from "./deadGround.js";

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
   * fights from there.
   */
  counterattack: { lostWithin: number; gait: MovementMode } | null;
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
export const SQUAD_GRENADIERS = { menPerLauncher: 4 } as const;

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
  counterattack: { lostWithin: 50, gait: "run" },
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
  counterattack: { lostWithin: 50, gait: "run" },
};

/** What one side has been told to do: attack towards a point, or hold facing one. */
export interface DrillTask {
  side: Side;
  attacking: boolean;
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
 * What the drill remembers between turns: each force's strength at the start,
 * and which forces have already broken contact — a force falls back once, and
 * then holds where it fell back to.
 */
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

  startingStrength(u: Unit): number {
    let n = this.strength.get(u.id);
    if (n == null) {
      n = u.soldiers?.length ?? 0;
      this.strength.set(u.id, n);
    }
    return n;
  }
}

const inPlay = (u: Unit) => !u.neutralized && !u.routing && !u.surrendered;

function toward(from: Point, to: Point, d: number): Point {
  const r = distance(from, to);
  if (r <= d) return { ...to };
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

/** The enemies `side` knows of, where it last saw them — never where they are. */
function knownEnemies(game: Game, side: Side): Unit[] {
  return sideView(game, side).units.filter((u) => u.side !== side && !u.neutralized && !u.surrendered);
}

/**
 * The enemy a force should shoot at: the nearest known one inside its sector
 * and in reach, else — if the drill allows — the nearest in reach anywhere.
 */
function pickTarget(u: Unit, enemies: Unit[], axis: number, drill: SquadDrill, reach: number): Unit | undefined {
  const inReach = enemies
    .filter((e) => distance(u.position, e.position) <= reach)
    .sort((a, b) => distance(u.position, a.position) - distance(u.position, b.position));
  const inSector = inReach.find(
    (e) => drill.sectorWidth >= 360 || angleBetween(bearingDegrees(u.position, e.position), axis) <= drill.sectorWidth / 2,
  );
  return inSector ?? (drill.engageOutsideSector ? inReach[0] : undefined);
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
 * lost — its squad out of the fight or gone from it, and an enemy known on
 * it. Once committed it stays committed.
 */
function commitReserves(game: Game, task: DrillTask, drill: SquadDrill, state: DrillState, forces: Unit[], enemies: Unit[]): void {
  const counter = drill.counterattack;
  const reserves = task.reserves;
  if (!counter || !reserves?.size) return;
  const lost = [...state.posts].filter(([id, post]) => {
    // A squad that went to its alternate position left its post on purpose.
    if (state.displaced.has(id)) return false;
    const holder = game.getUnit(id);
    const holds = inPlay(holder) && distance(holder.position, post) <= HOLDS_POST_M;
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

  // How near each assaulting platoon's leading squad is to the enemy it knows of, for the platoons to arrive together.
  const leads = new Map<string, number>();
  if (company && company.arriveTogether !== false && enemies.length) {
    for (const u of forces) {
      const k = company.platoonOf?.get(u.id);
      if (!k || !inPlay(u) || scouts.has(u.id) || (company.platoonTasks?.get(k) ?? "assault") !== "assault") continue;
      const d = Math.min(...enemies.map((e) => distance(u.position, e.position)));
      leads.set(k, Math.min(leads.get(k) ?? Infinity, d));
    }
  }
  forces.forEach((u, i) => {
    if (!inPlay(u)) return;
    state.startingStrength(u);
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
      const order = { gait: "run" as const, destination: rear, withdraw: true, holdFire: true, engagementRange: drill.openFireRange };
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
      if (held?.holdFire !== true || held.engagementRange !== drill.openFireRange || held.withdraw) {
        game.setStandingOrder(u.id, { gait: "normal", holdFire: true, engagementRange: drill.openFireRange });
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
    const platoon = company?.platoonOf?.get(u.id);
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
    if (company && (job === "halt" || job === "reserve")) {
      // Halt: go to ground where it is. Reserve: hold where it waited, out of the fight until committed.
      const at = job === "reserve" ? company.waitAt.get(u.id) : undefined;
      if (at && distance(u.position, at) > 5) game.setStandingOrder(u.id, { gait: "normal", destination: { ...at } });
      else stay();
      return;
    }
    if (company && job === "support" && nearest && distance(u.position, nearest.position) <= drill.attackFireRange) {
      stay(); // in reach: a base of fire, halted, firing in the fire phase
      return;
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
      game.setStandingOrder(u.id, { gait: "normal" });
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
    game.setStandingOrder(u.id, {
      gait: inContact ? drill.bound.gait : "normal",
      destination: covered ?? toward(u.position, aim, step),
    });
  });
  const done = game.executeStandingOrders(side);
  report?.executed?.(done);

  const live = forces.filter(inPlay);
  if (live.length === 0) return;
  const cx = live.reduce((s, u) => s + u.position.x, 0) / live.length;
  const cy = live.reduce((s, u) => s + u.position.y, 0) / live.length;
  const behind = toward({ x: cx, y: cy }, task.objective, -drill.commandGroupBehind);
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
  const enemies = knownEnemies(game, side);
  const baseReach = task.attacking ? drill.attackFireRange : drill.openFireRange;
  const heavy = drill.heavyWeapons;
  // Still forces first, then the quicker (rules decision 72).
  for (const u of game.firingOrder(side).filter(inPlay)) {
    const tank = heavy !== undefined && u.kind === "vehicle" && (u.vehicle?.vehicleClass ?? "mbt") === "mbt";
    const reach = tank ? Math.max(baseReach, heavy.tankGunRange) : baseReach;
    // A scout watches and reports; it does not give itself away (decision 52)
    // — unless the company has gone in and told it to give a base of fire.
    if (task.company?.scouts.has(u.id) && !(task.company.scoutsFire && !task.company.hold)) continue;
    const retaking = task.attacking || !drill.counterattack ? undefined : state?.counterattacking.get(u.id);
    const foe = retaking && enemyOn(retaking, freshEnemies(game, side, enemies), drill.counterattack!.lostWithin);
    const target = foe && distance(u.position, foe.position) <= reach ? foe : pickTarget(u, enemies, axisOf(u, task), drill, reach);
    if (!target) {
      if (!task.attacking && drill.coverWhenIdle && !u.covering && !u.firedThisTurn && u.kind !== "vehicle") {
        try {
          game.setCovering(u.id, true);
        } catch {
          // Nobody fit to cover with, or a force that broke.
        }
      }
      continue;
    }
    if (u.covering) game.setCovering(u.id, false);
    if (u.kind !== "command" && distance(u.position, target.position) <= drill.assault.range) {
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
  const launchers = Math.floor(ready / menPerLauncher);
  for (let i = 0; i < launchers && !target.neutralized; i++) {
    const r = game.fireExplosive("rifleGrenade", u.id, target.id);
    volleys.push(r);
    if (!r.fired) break;
  }
  return volleys;
}
