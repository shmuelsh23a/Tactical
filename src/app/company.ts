import { distance, type Game, type Point, type Side, type Terrain, type Unit } from "../engine/index.js";
import { bestVantages, nearestDeadGround } from "./deadGround.js";
import { sideView } from "./hotseat.js";

/**
 * The company commander's orders to its squads for the turn (rules decision
 * 52): which forces are out scouting and where each watches from, and
 * whether the rest hold — and where — or go. The squad drill carries them
 * out (`drill.ts`); how a squad bounds, halts to look and lies up is the
 * drill's, not the commander's.
 *
 * This is the seam backlog 15 names: in the game only squads and platoons are
 * scripted, and company and up is Jev's. Jev answers typed questions, so each
 * field here is one: which squads scout (a `choice`), from where (a `choice`
 * among `bestVantages`), where the rest wait (a `choice` among dead ground),
 * go now (a `noul`). {@link ScriptedCompany} answers them by rule, for the
 * harness and the headless runner — and for a game with no network.
 */
export interface CompanyOrders {
  /** Forces out scouting, each with where it watches from (null: toward the objective). */
  scouts: ReadonlyMap<string, Point | null>;
  /** The scouts have the enemy in sight, or the attack has gone: they lie up and watch. */
  scoutsLieUp: boolean;
  /** The rest hold until let go. */
  hold: boolean;
  /** Where each holding force waits; a force not named waits where it stands. */
  waitAt: ReadonlyMap<string, Point>;
  /**
   * The axis: once let go, the rest go by this point before the objective —
   * coming in from a flank, say, by a scout's observation point. Absent:
   * straight at it.
   */
  attackVia?: Point;
  /** Once the rest go, the scouts open fire from their posts in support (a base of fire). */
  scoutsFire?: boolean;
  /**
   * Someone else commands the company (Jev, or its stand-in): a scout at its
   * point stays there until told otherwise, instead of going on by itself
   * after `SCOUT_GIVE_UP_TURNS` of seeing nothing — its commander is asked.
   */
  scoutsStay?: boolean;
  /**
   * Once let go, what each platoon does (item 2, the author's "more control
   * after go"): the squads carry it out by the drill. A platoon not named
   * assaults. Keyed by {@link platoonOf}.
   */
  platoonTasks?: ReadonlyMap<string, PlatoonTask>;
  /** Which platoon each squad belongs to. */
  platoonOf?: ReadonlyMap<string, string>;
  /** The assaulting platoons bound in turn: one moves while the others halt and fire. */
  boundByPlatoon?: boolean;
  /**
   * The assault waits for the fires to lift: squads that close to
   * {@link HOLD_SHORT_M} of the enemy stop there until the commander lifts
   * the fires, then go in on the heels of the last rounds.
   */
  holdShort?: boolean;
  /** Where a platoon pulled back goes: the company's start line. */
  fallBackTo?: Point;
}

/**
 * A platoon's task once the company goes: assault the position; give it a
 * base of fire (close to small-arms reach of the enemy and fire from there);
 * stay back in reserve; halt and go to ground where it is; or pull back to
 * the start line.
 */
export type PlatoonTask = "assault" | "support" | "reserve" | "halt" | "withdraw";

/**
 * How close an assault waiting for the fires to lift comes before it stops,
 * metres from the nearest enemy: outside the mortar's danger close (150 m) with
 * a margin. Ours.
 */
export const HOLD_SHORT_M = 200;

/**
 * An assault position: the last covered ground before the objective, where
 * the company forms up out of sight before it goes in (doctrine; the distance
 * is ours). Sought within {@link ASSAULT_POSITION_SEARCH_M} of the point this
 * far short of where the plan puts the enemy.
 */
export const ASSAULT_POSITION_M = 250;
export const ASSAULT_POSITION_SEARCH_M = 150;

/**
 * A flank: the axis point beside the enemy, this far to one side of the line
 * of attack and this far back toward the company (ours).
 */
export const FLANK_OFFSET_M = 200;
export const FLANK_SHORT_M = 100;

const centreOf = (ps: readonly Point[]): Point => ({
  x: ps.reduce((t, p) => t + p.x, 0) / ps.length,
  y: ps.reduce((t, p) => t + p.y, 0) / ps.length,
});

/**
 * The platoon a force belongs to, read from its id as the scenarios name
 * them: `BLUE-2-1` is the first squad of BLUE's second platoon. A force named
 * otherwise is a platoon of its own.
 */
export function platoonKey(id: string): string {
  const parts = id.split("-");
  return parts.length >= 3 ? parts.slice(0, -1).join("-") : id;
}

/** What the scripted company commander was told to do about finding the enemy. */
export interface ReconPlan {
  /** How many squads go ahead to find the enemy, the nearest the objective first. */
  scouts: number;
  /**
   * Find, fix, then assault (decision 54): the rest wait this many
   * consecutive turns of the scouts holding the enemy in sight before going.
   * A contact lost starts the count again. 0: they go when anything is found.
   */
  lookTurns?: number;
  /** What counts as found: an enemy within this of the objective (250 m unless given). */
  findWithin?: number;
  /**
   * Where the scouts watch from: straight at the objective, or each from an
   * observation point (`bestVantages`) between {@link VANTAGE_RING_M} of
   * where the plan puts the enemy, each where the others cannot see.
   */
  scoutFrom?: "straight" | "vantage";
  /**
   * Where each scout watches from, chosen by someone else (Jev, or an agent
   * standing in for it): one entry a scout, null for straight at the
   * objective. Overrides `scoutFrom`.
   */
  posts?: readonly (Point | null)[];
}

export interface CompanyPlan {
  recon?: ReconPlan;
  /** Where the rest wait while the scouts look: where they stand, or the nearest dead ground. */
  waitIn?: "place" | "deadGround";
}

/**
 * How far from where the plan suspects the enemy an observation point is
 * chosen, metres: beyond a still force's eye (300 m, decision 53), inside the
 * scout's binoculars (600 m, decision 54). Ours.
 */
export const VANTAGE_RING_M = { min: 350, max: 550 } as const;

/** What counts as found, unless the plan says (ours). */
export const FIND_WITHIN_M = 250;

/** The map a commander plans on: its ground and extent. */
export interface CompanyGround {
  terrain: Terrain;
  width: number;
  height: number;
}

/**
 * A company commander that decides by rule — the stand-in for Jev. It knows
 * what its side knows (`sideView`, `contactFor`) and what its plan says
 * (`objective`, `suspected`: where it thinks the enemy is), never
 * `game.units` of the enemy.
 */
export class ScriptedCompany {
  readonly side: Side;
  private readonly objective: Point;
  private readonly plan: CompanyPlan;
  private readonly scouts = new Map<string, Point | null>();
  private readonly waitAt = new Map<string, Point>();
  private lookedTurns = 0;
  private via: Point | undefined;
  private support = false;
  private readonly tasks = new Map<string, PlatoonTask>();
  private readonly platoonOfSquad = new Map<string, string>();
  private readonly home: Point;
  private bounding = false;
  private holdingShort = false;
  /** The commander has lifted the company's fires for the assault: no more missions near it. */
  firesLifted = false;
  /** The turn the rest were let go; undefined while they hold. */
  released: number | undefined;
  /** The rest have moved up to an assault position and hold there (`moveUp`). */
  movedUp = false;
  private readonly ground: CompanyGround;
  private readonly suspected: readonly Point[];

  constructor(game: Game, side: Side, objective: Point, suspected: readonly Point[], plan: CompanyPlan, ground: CompanyGround) {
    this.side = side;
    this.objective = { ...objective };
    this.plan = plan;
    this.ground = ground;
    this.suspected = suspected;
    const own = game.units.filter((u) => u.side === side && u.kind === "infantry");
    for (const u of own) this.platoonOfSquad.set(u.id, platoonKey(u.id));
    this.home = own.length
      ? { x: own.reduce((t, u) => t + u.position.x, 0) / own.length, y: own.reduce((t, u) => t + u.position.y, 0) / own.length }
      : { ...objective };
    const recon = plan.recon;
    if (!recon || recon.scouts <= 0) {
      this.released = 0;
      return;
    }
    // The scouts: the squads nearest the objective.
    const byNearness = [...own].sort(
      (a, b) => distance(a.position, objective) - distance(b.position, objective) || (a.id < b.id ? -1 : 1),
    );
    const chosen = byNearness.slice(0, recon.scouts);
    // Where each watches from: one observation point a scout, each where the
    // others cannot see, given to the scout nearest it.
    const points = recon.posts
      ? recon.posts.filter((p): p is Point => p !== null)
      : recon.scoutFrom === "vantage" && chosen.length
        ? bestVantages(
            { terrain: ground.terrain, targets: suspected, minRange: VANTAGE_RING_M.min, maxRange: VANTAGE_RING_M.max },
            chosen[0]!.position,
            chosen.length,
            { width: ground.width, height: ground.height, step: 20 },
          )
        : [];
    const free = [...chosen];
    for (const p of points) {
      free.sort((a, b) => distance(a.position, p) - distance(b.position, p) || (a.id < b.id ? -1 : 1));
      const u = free.shift();
      if (u) this.scouts.set(u.id, p);
    }
    for (const u of free) this.scouts.set(u.id, null);
    for (const id of this.scouts.keys()) game.setScouting(id, true);
    // Where the rest wait: out of sight of where the plan puts the enemy.
    if (plan.waitIn === "deadGround") {
      for (const u of own) {
        if (this.scouts.has(u.id)) continue;
        const at = nearestDeadGround({ terrain: ground.terrain, watchers: suspected }, u.position, {
          width: ground.width,
          height: ground.height,
          radius: 300,
          step: 20,
        });
        if (at) this.waitAt.set(u.id, at);
      }
    }
  }

  /**
   * Move the rest up to an assault position and hold them there: each squad
   * to the dead ground nearest a point {@link ASSAULT_POSITION_M} short of the
   * enemy, on its own line to it — the last cover before the objective. The
   * enemy is where the side has found it (`found`, its marks near the
   * objective) when it has, else where the plan puts it; the ground must be
   * out of sight of both. A squad with no dead ground there keeps where it
   * waited. Returns whether any squad has somewhere to go.
   */
  moveUp(game: Game, found: readonly Point[] = []): boolean {
    if (this.released !== undefined || this.movedUp) return false;
    const enemy = found.length ? centreOf(found) : this.objective;
    const watchers = [...this.suspected, ...found];
    let any = false;
    for (const u of game.units) {
      if (u.side !== this.side || u.kind !== "infantry" || this.scouts.has(u.id) || u.neutralized) continue;
      const from = this.waitAt.get(u.id) ?? u.position;
      const range = distance(from, enemy);
      if (range <= ASSAULT_POSITION_M) continue;
      const k = ASSAULT_POSITION_M / range;
      const aim = { x: enemy.x + (from.x - enemy.x) * k, y: enemy.y + (from.y - enemy.y) * k };
      const at = nearestDeadGround({ terrain: this.ground.terrain, watchers }, aim, {
        width: this.ground.width,
        height: this.ground.height,
        radius: ASSAULT_POSITION_SEARCH_M,
        step: 20,
      });
      if (at && distance(at, enemy) < range) {
        this.waitAt.set(u.id, at);
        any = true;
      }
    }
    this.movedUp = any;
    return any;
  }

  /**
   * Where a flanking approach goes in: dead ground beside the enemy, off the
   * line of attack — {@link FLANK_OFFSET_M} to one side of it and
   * {@link FLANK_SHORT_M} back toward the company — so the company comes in on
   * the enemy's side, not at its front. One point a side, where the ground has
   * one; the enemy as `moveUp` takes it.
   */
  flankPoints(found: readonly Point[] = []): { side: "west" | "east"; at: Point }[] {
    const enemy = found.length ? centreOf(found) : this.objective;
    const back = distance(this.home, enemy);
    if (back === 0) return [];
    const bx = (this.home.x - enemy.x) / back;
    const by = (this.home.y - enemy.y) / back;
    const watchers = [...this.suspected, ...found];
    const out: { side: "west" | "east"; at: Point }[] = [];
    for (const sign of [1, -1]) {
      const aim = {
        x: enemy.x + bx * FLANK_SHORT_M + sign * by * FLANK_OFFSET_M,
        y: enemy.y + by * FLANK_SHORT_M - sign * bx * FLANK_OFFSET_M,
      };
      if (aim.x < 0 || aim.y < 0 || aim.x > this.ground.width || aim.y > this.ground.height) continue;
      const at = nearestDeadGround({ terrain: this.ground.terrain, watchers }, aim, {
        width: this.ground.width,
        height: this.ground.height,
        radius: ASSAULT_POSITION_SEARCH_M,
        step: 20,
      });
      // Named by the compass: which side of the enemy it is on.
      if (at) out.push({ side: at.x < enemy.x ? "west" : "east", at });
    }
    return out.sort((a, b) => (a.side < b.side ? 1 : -1));
  }

  /** Whether a force is one of this company's scouts. */
  isScout(u: Unit): boolean {
    return this.scouts.has(u.id);
  }

  /**
   * The turn's orders, from what the side knows now: whether the scouts hold
   * the enemy at the objective in sight, and whether that has gone on long
   * enough — or they are lost, or there — to let the rest go.
   */
  orders(game: Game, decided?: { go: boolean }): CompanyOrders {
    const holding = this.holdingInSight(game);
    if (this.released === undefined) {
      this.lookedTurns = holding ? this.lookedTurns + 1 : 0;
      if (decided) {
        // Someone else decides when the company goes (Jev, or its stand-in).
        if (decided.go) this.released = game.turn;
      } else {
        const live = this.liveScouts(game);
        const there = live.some((u) => distance(u.position, this.objective) <= 50);
        if (this.lookedTurns > (this.plan.recon?.lookTurns ?? 0) || live.length === 0 || there) this.released = game.turn;
      }
    }
    return {
      scouts: this.scouts,
      scoutsLieUp: holding || this.released !== undefined,
      hold: this.released === undefined,
      waitAt: this.waitAt,
      ...(this.via ? { attackVia: this.via } : {}),
      ...(this.support ? { scoutsFire: true } : {}),
      ...(decided ? { scoutsStay: true } : {}),
      platoonOf: this.platoonOfSquad,
      ...(this.tasks.size ? { platoonTasks: this.tasks } : {}),
      ...(this.bounding ? { boundByPlatoon: true } : {}),
      ...(this.holdingShort ? { holdShort: true } : {}),
      fallBackTo: this.home,
    };
  }

  /** Where the plan puts the enemy position. */
  get objectivePoint(): Point {
    return this.objective;
  }

  /** The scouts' observation points, by force (null: toward the objective). */
  get posts(): ReadonlyMap<string, Point | null> {
    return this.scouts;
  }

  /** Send a scout to another point, or lie it up where it stands (its own position). */
  setPost(id: string, at: Point | null): void {
    if (this.scouts.has(id)) this.scouts.set(id, at ? { ...at } : null);
  }

  /** The axis the rest go by once let go (decided at "go"). */
  setAxis(via: Point | undefined): void {
    this.via = via ? { ...via } : undefined;
  }

  /** Whether the scouts give the attack a base of fire once it goes. */
  setScoutsFire(on: boolean): void {
    this.support = on;
  }

  /** The company's platoons, each with its squads that are not out scouting. */
  platoons(game: Game): Map<string, Unit[]> {
    const out = new Map<string, Unit[]>();
    for (const u of game.units) {
      const key = this.platoonOfSquad.get(u.id);
      if (!key || this.scouts.has(u.id)) continue;
      out.set(key, [...(out.get(key) ?? []), u]);
    }
    return out;
  }

  /** A platoon's task once the company goes. */
  platoonTask(key: string): PlatoonTask {
    return this.tasks.get(key) ?? "assault";
  }

  setPlatoonTask(key: string, task: PlatoonTask): void {
    this.tasks.set(key, task);
  }

  /** The assaulting platoons bound in turn, one moving while the others fire. */
  setBoundByPlatoon(on: boolean): void {
    this.bounding = on;
  }

  /** The assault stops short of the enemy until the fires lift. */
  setHoldShort(on: boolean): void {
    this.holdingShort = on;
  }

  get holdsShort(): boolean {
    return this.holdingShort;
  }

  /** Lift the fires: the mortars stop, and an assault held short goes in. */
  liftFires(): void {
    this.firesLifted = true;
    this.holdingShort = false;
  }

  /** The scouts still in the fight. */
  liveScouts(game: Game): Unit[] {
    return [...this.scouts.keys()]
      .map((id) => game.units.find((u) => u.id === id))
      .filter((u): u is Unit => !!u && !u.neutralized && !u.routing && !u.surrendered);
  }

  /** Turns in a row the scouts have held the enemy at the objective in sight. */
  get turnsHeldInSight(): number {
    return this.lookedTurns;
  }

  /** A fresh report (this turn or last) of an enemy at the objective: held in sight, not merely once found. */
  holdingInSight(game: Game): boolean {
    const within = this.plan.recon?.findWithin ?? FIND_WITHIN_M;
    return sideView(game, this.side).units.some(
      (e) =>
        e.side !== this.side &&
        !e.neutralized &&
        !e.surrendered &&
        distance(e.position, this.objective) <= within &&
        (game.contactFor(this.side, e.id)?.lastSeenTurn ?? -Infinity) >= game.turn - 1,
    );
  }
}
