import { MEDIUM_MG_BANDS, SMALL_ARMS_BANDS, distance, suppressionLevel, type Game, type Point, type Side, type Terrain, type Unit } from "../engine/index.js";
import { bestVantages, nearestDeadGround } from "./deadGround.js";
import { hasEyesOn, sideView } from "./hotseat.js";

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
  /** Squads go by ground out of sight of the enemy they know of, until close (ours, forty-fifth round); on unless false. */
  coveredRoutes?: boolean;
  /** Assaulting platoons wait at the last cover for each other, to close together (ours, forty-fifth round); on unless false. */
  arriveTogether?: boolean;
}

/**
 * A platoon's task once the company goes: assault the position; give it a
 * base of fire (close to small-arms reach of the enemy and fire from there);
 * stay back in reserve; halt and go to ground where it is; or pull back to
 * the start line.
 */
/**
 * What a platoon does once the company has gone.
 *
 * `security` is the drill's own (Battle Drill 2 step 10: the squads not in
 * contact "take up covered and concealed positions **in place** and observe
 * to the **flanks and rear** of the platoon"; step 12b deploys the last
 * squad "to provide flank and rear security"). It holds where it stands and
 * watches *away* from the objective, which is the one direction nothing
 * else in the company is looking.
 */
export type PlatoonTask = "assault" | "support" | "reserve" | "halt" | "withdraw" | "security";

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

/**
 * Turns the assault waits short of the enemy for its support to be set
 * (ATP 3-21.10 (2026), para 2-170: every force supporting the assault "set
 * in their support by fire positions before the assault force crosses the
 * probable line of deployment"), counted only while it is actually waiting
 * there. ⚠️ Ours: a support force that can find no field of fire must not
 * hold the attack for good.
 */
export const SUPPORT_SET_MAX_TURNS = 6;
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
  /** See `CompanyOrders.coveredRoutes`; on unless false. */
  coveredRoutes?: boolean;
  /** See `CompanyOrders.arriveTogether`; on unless false. */
  arriveTogether?: boolean;
  /** Where the rest wait while the scouts look: where they stand, or the nearest dead ground. */
  waitIn?: "place" | "deadGround";
  /**
   * Assault only once the company has gained suppressive fire
   * ({@link SuppressionGate}, Battle Drill 2 steps 11–13). Absent: the
   * assault goes when the scouts are done, which is every table before
   * 2026-10-11.
   */
  suppressionGate?: SuppressionGate;
  /**
   * Flank and rear security (Battle Drill 2 step 12b: the platoon leader
   * "deploys the last squad to provide flank and rear security"). Once the
   * company goes in, its rearmost platoon holds where it stands and
   * watches the way back instead of joining the attack — so the company
   * is not flanked while it is busy to the front. It costs a platoon's
   * worth of rifles, which is the trade.
   *
   * Absent: every platoon faces the objective, which is ours.
   */
  rearSecurity?: boolean;
  /**
   * The scouts give a base of fire once the company goes in (Battle Drill
   * 2 step 13: the base-of-fire element must be "in position and providing
   * suppressive fires" before the assault is led in; ATP 3-21.8 para 3-102
   * wants it where it has a clear view, which is exactly where a scout
   * already is).
   *
   * Until now `CompanyOrders.scoutsFire` existed for this and nothing set
   * it, so the only forces that could see the enemy were the two that hold
   * their fire by decision 52 — and the attack went in having fired almost
   * nothing (docs/balance.md, *Does suppression pay?*). It costs the
   * scouts' concealment, which is the trade: from the moment they fire,
   * the defence knows where they are.
   */
  scoutsSupport?: boolean;
}

/**
 * The doctrinal gate on an assault (TC 3-21.76, Battle Drill 2, steps 11,
 * 12 and 13; ATP 3-21.8 ch. 4). The platoon leader asks three times whether
 * his element in contact "can gain suppressive fire against the enemy
 * **based on the volume and accuracy of the enemy's return fire**", commits
 * more force to the base of fire while the answer is no, and sends the
 * assault in only once the answer is yes.
 *
 * It is judged off **our own** forces, never the enemy's state: the volume
 * and accuracy of the enemy's return fire is what our own men in contact
 * are feeling, which is the one thing a commander really can read. That is
 * both what the drill says and what keeps this inside the rule that a drill
 * sees only what its side sees.
 *
 * ⚠️ The four numbers are ours — the drill gives the question and the
 * order of the steps, not a threshold. They are on docs/balance.md.
 */
export interface SuppressionGate {
  /**
   * The assault waits while more than this share of the forces in contact
   * are themselves suppressed or pinned: the enemy's fire is still
   * effective, so ours has not won the firefight.
   */
  heldWhileShare: number;
  /** A force this near an enemy it knows of counts as in contact. */
  contactWithin: number;
  /**
   * How much of the enemy the company can *watch* must be suppressed or
   * pinned before its fire counts as telling. Watching a position go
   * heads-down is observable (`hasEyesOn`); an enemy nobody can see is
   * not counted at all.
   */
  enemyHeldShare: number;
  /**
   * Commit another platoon to the base of fire after this many turns of not
   * gaining suppression (step 11b: "deploys another squad ... to suppress
   * the enemy position"; step 12a: a second platoon joins it).
   */
  reinforceAfter: number;
  /**
   * Stop waiting after this many turns and assault anyway, onto an enemy
   * the company never suppressed (step 12b-c: the platoon reports it
   * cannot gain suppressive fire and "responds to orders from the company
   * commander" — and we are that commander). Not a halt: holding here
   * instead merely ran the clock out, 57% of battles out of time against
   * 2% (balance.md, the gate's first measurement).
   */
  giveUpAfter: number;
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
  /** Turns the company has been trying to gain suppressive fire and has not (the gate). */
  private tryingTurns = 0;
  /** Platoons committed to the base of fire because suppression was not gained, in order. */
  private readonly reinforced: string[] = [];
  /** The gate ran out of patience and sent the assault in unsuppressed (step 12b-c). */
  private gaveUp = false;
  /**
   * The assault is stopped short because the firefight is not won yet (the
   * suppression gate). Kept apart from {@link holdingShort}, which is the
   * fire plan's hold — waiting for *our own* shells to lift — because the
   * two are held for different reasons and lifted by different things. The
   * harness lifts a fire-plan hold as soon as the mortars are spent
   * (scenarioBattle.ts); that must not open a gate that is waiting on
   * suppression, and conflating them made the gate inert: every threshold
   * from strict to trivial measured the same 8% (balance.md).
   */
  private gateHolding = false;
  /** The assault waits for its support to be set (drill audit, A1); and the support has been set, or waited for long enough. */
  private supportHolding = false;
  private supportSetDone = false;
  private supportWaitTurns = 0;
  private supportCountedOn = -1;
  /** The commander declined to commit the base of fire when the assault was spent. */
  private recommitDeclined = false;
  /** The rearmost platoon has been put on flank and rear security (step 12b). */
  private securityGiven = false;
  private via: Point | undefined;
  private support = false;
  private readonly tasks = new Map<string, PlatoonTask>();
  private readonly platoonOfSquad = new Map<string, string>();
  private home: Point;
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

  /**
   * A commander put back on a replayed game from its own snapshot, instead
   * of built afresh. Choosing scouts again here would both pick different
   * squads — they are chosen by nearness at the start, and the company has
   * moved since — and journal `setScouting` a second time onto a recording
   * that already carries it, which is a different battle.
   */
  static restored(
    game: Game,
    side: Side,
    objective: Point,
    suspected: readonly Point[],
    plan: CompanyPlan,
    ground: CompanyGround,
    snap: CompanySnapshot,
  ): ScriptedCompany {
    const company = new ScriptedCompany(game, side, objective, suspected, plan, ground, true);
    company.restoreFrom(snap);
    return company;
  }

  constructor(
    game: Game,
    side: Side,
    objective: Point,
    suspected: readonly Point[],
    plan: CompanyPlan,
    ground: CompanyGround,
    /** Building for a {@link restored} commander: leave the plan's setup to the snapshot. */
    restoring = false,
  ) {
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
    if (restoring) return;
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
   * What the commander carries, as plain data, so a battle saved mid-attack
   * resumes with the same company (`session.ts`). Everything here is either
   * decided at the start from positions that have since moved — the scouts,
   * where the rest wait, the company's start line — or built up turn by
   * turn; rebuilding it from the brief instead would quietly choose
   * differently once the forces have gone forward.
   */
  snapshot(): CompanySnapshot {
    return {
      scouts: [...this.scouts].map(([id, at]) => [id, at ? { ...at } : null]),
      waitAt: [...this.waitAt].map(([id, at]) => [id, { ...at }]),
      tasks: [...this.tasks],
      home: { ...this.home },
      lookedTurns: this.lookedTurns,
      tryingTurns: this.tryingTurns,
      reinforced: [...this.reinforced],
      gaveUp: this.gaveUp,
      gateHolding: this.gateHolding,
      ...(this.supportHolding ? { supportHolding: true } : {}),
      ...(this.supportSetDone ? { supportSet: true } : {}),
      ...(this.supportWaitTurns ? { supportWaitTurns: this.supportWaitTurns, supportCountedOn: this.supportCountedOn } : {}),
      securityGiven: this.securityGiven,
      ...(this.recommitDeclined ? { recommitDeclined: true } : {}),
      support: this.support,
      bounding: this.bounding,
      holdingShort: this.holdingShort,
      firesLifted: this.firesLifted,
      movedUp: this.movedUp,
      ...(this.via ? { via: { ...this.via } } : {}),
      ...(this.released !== undefined ? { released: this.released } : {}),
    };
  }

  /**
   * Put a saved commander's memory back. Nothing is told to the game: the
   * replay already carries every order the commander gave, `setScouting`
   * among them.
   */
  private restoreFrom(snap: CompanySnapshot): void {
    this.scouts.clear();
    for (const [id, at] of snap.scouts) this.scouts.set(id, at ? { ...at } : null);
    this.waitAt.clear();
    for (const [id, at] of snap.waitAt) this.waitAt.set(id, { ...at });
    this.tasks.clear();
    for (const [key, task] of snap.tasks) this.tasks.set(key, task);
    this.home = { ...snap.home };
    this.lookedTurns = snap.lookedTurns;
    this.tryingTurns = snap.tryingTurns ?? 0;
    this.reinforced.length = 0;
    this.reinforced.push(...(snap.reinforced ?? []));
    this.gaveUp = snap.gaveUp ?? false;
    this.gateHolding = snap.gateHolding ?? false;
    this.supportHolding = snap.supportHolding ?? false;
    this.supportSetDone = snap.supportSet ?? false;
    this.supportWaitTurns = snap.supportWaitTurns ?? 0;
    this.supportCountedOn = snap.supportCountedOn ?? -1;
    this.recommitDeclined = snap.recommitDeclined ?? false;
    this.securityGiven = snap.securityGiven ?? false;
    this.support = snap.support;
    this.bounding = snap.bounding;
    this.holdingShort = snap.holdingShort;
    this.firesLifted = snap.firesLifted;
    this.movedUp = snap.movedUp;
    this.via = snap.via ? { ...snap.via } : undefined;
    this.released = snap.released;
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
    // The gate is on the **assault**, not on the advance (Battle Drill 2
    // step 13: the base of fire must be in position and suppressing before
    // the platoon leader leads the assaulting squads in). So the company
    // approaches as it always did, its assaulting squads stop short of the
    // enemy, and the hold is lifted when the firefight is won.
    //
    // It was first written as a gate on `released` instead, which cannot
    // work: nothing is in contact while the company is still in its
    // holding area, so the question "have we won the firefight" has no
    // answer yet and the gate only ever timed out. Measured at 0-3% wins
    // against 10%, 30% of battles out of time (balance.md).
    // Step 12b: the rearmost platoon takes flank and rear security once
    // the company goes in. Assigned once, on release, so it is not
    // re-chosen every turn as the platoons move.
    if (this.plan.rearSecurity && this.released !== undefined && !this.securityGiven) {
      const byFar = [...this.platoons(game)]
        .filter(([key]) => this.platoonTask(key) === "assault")
        .sort((a, b) => this.platoonRange(b[1]) - this.platoonRange(a[1]));
      // Never the only platoon left: something has to do the attacking.
      if (byFar.length > 1) {
        this.tasks.set(byFar[0]![0], "security");
        this.securityGiven = true;
      }
    }
    // Step 13: once the company has gone, its eyes become its base of fire.
    if (this.plan.scoutsSupport && this.released !== undefined) this.support = true;
    // Its assault spent, the scripted commander sends in the rest; one asked
    // is asked instead (`recommit` in src/sim/scenarioBattle.ts).
    if (!decided && this.assaultSpent(game)) this.recommit(game);
    const gate = this.plan.suppressionGate;
    if (gate && this.released !== undefined) {
      this.gateHolding = !this.assaultMayGo(game, gate);
    }
    if (this.released !== undefined) this.waitForSupport(game);
    return this.currentOrders(game, { holding, asked: decided !== undefined });
  }

  /**
   * The company's own forces trading fire: its squads, not its scouts,
   * within `contactWithin` of an enemy it knows of. This is the "element in
   * contact" the drill's steps 11 and 12 are about.
   */
  private inContact(game: Game, gate: SuppressionGate): Unit[] {
    const view = sideView(game, this.side);
    const foes = view.units.filter((u) => u.side !== this.side && !u.neutralized && !u.surrendered);
    return view.units.filter(
      (u) =>
        u.side === this.side &&
        u.kind === "infantry" &&
        !u.neutralized &&
        !this.scouts.has(u.id) &&
        foes.some((f) => distance(u.position, f.position) <= gate.contactWithin),
    );
  }

  /**
   * Whether the company has gained suppressive fire: the drill's question
   * at steps 11 and 12, which has two halves and needs both.
   *
   * - **Our fire is telling.** Of the enemy the company can actually
   *   *watch* — `hasEyesOn`, a thing seen happening rather than searched
   *   out — at least `enemyHeldShare` is suppressed or pinned. Watching a
   *   position go heads-down is what a commander really can observe; it is
   *   not read off an enemy nobody can see.
   * - **Their fire is not stopping us.** No more than `heldWhileShare` of
   *   our own forces in contact are suppressed or pinned — "the volume and
   *   accuracy of the enemy's return fire", felt where it lands.
   *
   * Forces out scouting count on neither side of it: a scout holds its
   * fire and is not part of the base of fire (decision 52).
   */
  private gainedSuppression(game: Game, gate: SuppressionGate): boolean {
    const view = sideView(game, this.side);
    const foes = view.units.filter((u) => u.side !== this.side && !u.neutralized && !u.surrendered);
    if (!foes.length) return true;
    const own = this.inContact(game, gate);
    // Nobody in contact yet: there is no firefight to have won.
    if (!own.length) return false;
    const held = own.filter((u) => suppressionLevel(u) !== "none").length;
    if (held / own.length > gate.heldWhileShare) return false;
    // Is our fire telling on them? Only the enemy we can watch counts.
    const watched = foes
      .map((f) => {
        try {
          return game.getUnit(f.id);
        } catch {
          return undefined;
        }
      })
      .filter((u): u is Unit => !!u && hasEyesOn(game, this.side, u));
    if (!watched.length) return false;
    const down = watched.filter((u) => suppressionLevel(u) !== "none").length;
    return down / watched.length >= gate.enemyHeldShare;
  }

  /**
   * The gate, run once a turn while the company still holds: it decides
   * whether the assault may go, and commits another platoon to the base of
   * fire for each `reinforceAfter` turns it has not gained suppression
   * (steps 11b and 12a). Returns whether the assault may go.
   */
  private assaultMayGo(game: Game, gate: SuppressionGate): boolean {
    if (this.gainedSuppression(game, gate)) return true;
    // Patience is only spent once there is a firefight to win: a company
    // still closing on the enemy is not failing to suppress it.
    if (!this.inContact(game, gate)) return false;
    this.tryingTurns += 1;
    // Another platoon onto the base of fire, the one furthest from the
    // objective first so the leading platoons stay the manoeuvre element.
    const want = Math.floor(this.tryingTurns / Math.max(1, gate.reinforceAfter));
    if (want > this.reinforced.length) {
      const byFar = [...this.platoons(game)]
        .filter(([key]) => !this.reinforced.includes(key) && this.platoonTask(key) === "assault")
        .sort((a, b) => this.platoonRange(b[1]) - this.platoonRange(a[1]));
      // The last platoon is never committed to fire: it is the manoeuvre
      // element, or the flank and rear security of step 12b.
      if (byFar.length > 1) {
        const [key] = byFar[0]!;
        this.tasks.set(key, "support");
        this.reinforced.push(key);
      }
    }
    if (this.tryingTurns >= gate.giveUpAfter) {
      // Step 12b-c: the platoon reports that it cannot gain suppressive
      // fire and "responds to orders from the company commander". We *are*
      // the company commander, and an attacker under orders to take a
      // position eventually goes in: so the assault goes, later than it
      // wanted and onto an enemy it never suppressed, and pays for it.
      // Holding here instead simply ran the clock out — measured at 57%
      // out of time, which is a worse model than going in (balance.md).
      this.gaveUp = true;
      return true;
    }
    return false;
  }

  /**
   * Hold the assault short of the enemy until every force supporting it is
   * set: in play and able to engage an enemy the side knows of (ATP 3-21.10
   * (2026), para 2-170). Supporting forces are the platoons on "support" and,
   * when they give a base of fire, the scouts. Once set, the assault is never
   * held for it again; a support that cannot get set is waited for
   * {@link SUPPORT_SET_MAX_TURNS} turns of the assault actually waiting.
   */
  private waitForSupport(game: Game): void {
    this.supportHolding = false;
    if (this.supportSetDone) return;
    const supporting = game.units.filter((u) => {
      if (u.side !== this.side || u.kind !== "infantry" || u.neutralized || u.routing || u.surrendered) return false;
      if (this.scouts.has(u.id)) return this.support;
      const key = this.platoonOfSquad.get(u.id) ?? this.platoonOfSquad.get(u.id.split("/")[0]!);
      return key !== undefined && this.platoonTask(key) === "support";
    });
    if (!supporting.length) return;
    // The enemy where the side has him marked, as the drill holds the assault short of him:
    // never where he really is (a stale mark, or one moved to an alternate position).
    const view = sideView(game, this.side);
    const foes = view.units.filter((u) => u.side !== this.side && !u.neutralized && !u.surrendered);
    // In its weapon's reach (the rules' own tables: 400 m, a machine gun 800 m) with eyes on.
    const reach = (u: Unit) => (u.mediumMg ? MEDIUM_MG_BANDS : SMALL_ARMS_BANDS).at(-1)!.maxRange;
    const set = supporting.every((u) => foes.some((f) => {
      if (distance(u.position, f.position) > reach(u)) return false;
      try {
        return game.canEngage(u, f);
      } catch {
        return false;
      }
    }));
    if (set) {
      this.supportSetDone = true;
      return;
    }
    // Waiting counts only while an assaulting squad is at the line, held.
    const atTheLine = foes.length > 0 && [...this.platoons(game)].some(
      ([key, squads]) => this.platoonTask(key) === "assault" && squads.some((u) => foes.some((f) => distance(u.position, f.position) <= HOLD_SHORT_M)),
    );
    if (this.supportWaitTurns >= SUPPORT_SET_MAX_TURNS) {
      this.supportSetDone = true;
      return;
    }
    // Once a turn, however often the orders are read.
    if (atTheLine && this.supportCountedOn !== game.turn) {
      this.supportWaitTurns += 1;
      this.supportCountedOn = game.turn;
    }
    this.supportHolding = true;
  }

  /** How far a platoon's nearest squad is from where the plan puts the enemy. */
  private platoonRange(squads: readonly Unit[]): number {
    return Math.min(...squads.map((u) => distance(u.position, this.objective)));
  }

  /**
   * The orders as they stand, deciding nothing — `orders` without the part
   * that lets the company go.
   *
   * It exists because the two phases read the orders at different moments:
   * the movement phase puts them on the task, and the combat phase reads
   * `scouts`, `scoutsFire` and `hold` back off it to keep a scout from
   * giving itself away (decision 52). A battle saved between the two has
   * to put them back, and must not reach for `orders` to do it — that
   * would count another turn of looking and could let the company go a
   * turn early. Those three fields depend only on what the commander has
   * decided, never on what it can see this moment, so a resume gets them
   * exactly right.
   */
  currentOrders(game: Game, at: { holding?: boolean; asked?: boolean } = {}): CompanyOrders {
    const holding = at.holding ?? this.holdingInSight(game);
    return {
      scouts: this.scouts,
      scoutsLieUp: holding || this.released !== undefined,
      hold: this.released === undefined,
      waitAt: this.waitAt,
      ...(this.via ? { attackVia: this.via } : {}),
      ...(this.support ? { scoutsFire: true } : {}),
      ...(at.asked ? { scoutsStay: true } : {}),
      platoonOf: this.platoonOfSquad,
      ...(this.tasks.size ? { platoonTasks: this.tasks } : {}),
      ...(this.bounding ? { boundByPlatoon: true } : {}),
      ...(this.holdingShort || this.gateHolding || this.supportHolding ? { holdShort: true } : {}),
      fallBackTo: this.home,
      ...(this.plan.coveredRoutes === false ? { coveredRoutes: false } : {}),
      ...(this.plan.arriveTogether === false ? { arriveTogether: false } : {}),
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
      // A fire team split off a squad (decision 89) is its squad's: `BLUE-2-1/t1` is BLUE-2-1's.
      const key = this.platoonOfSquad.get(u.id) ?? this.platoonOfSquad.get(u.id.split("/")[0]!);
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

  /**
   * The assault element is spent (2026-10-12, the author: "do both"): some
   * platoon was given the assault, no squad of any assaulting platoon is
   * still fighting (its scouts aside), and a base of fire — a platoon on
   * "support" — still is. Without this a company holding short waited for
   * an assault that no longer existed — its fires never lifted, its base of
   * fire never went in — and the battle ran out of time (balance.md, *Why the
   * 2:1 plans fail*). Not once the commander has declined to commit it.
   */
  assaultSpent(game: Game): boolean {
    if (this.released === undefined || this.recommitDeclined) return false;
    const fighting = (u: Unit) => !u.neutralized && !u.routing && !u.surrendered && !this.scouts.has(u.id);
    const platoons = [...this.platoons(game)];
    const assault = platoons.filter(([key]) => this.platoonTask(key) === "assault");
    return assault.length > 0 && !assault.some(([, us]) => us.some(fighting)) && this.toCommit(game).length > 0;
  }

  /**
   * What a spent assault commits: its reserve first, which is what a reserve
   * is for — "to exploit success, defeat enemy counterattacks, or restore
   * momentum to a stalled attack" (ATP 3-21.10 (2026), para 2-130) — and the
   * base of fire only when there is none, since "the support element must
   * not reduce its suppressive fires as the assault element closes" (para
   * 2-176; drill audit, A9).
   */
  toCommit(game: Game): string[] {
    const fighting = (u: Unit) => !u.neutralized && !u.routing && !u.surrendered && !this.scouts.has(u.id);
    const reserve = [...this.platoons(game)].filter(([key, us]) => this.platoonTask(key) === "reserve" && us.some(fighting)).map(([key]) => key);
    return reserve.length ? reserve : this.baseOfFire(game);
  }

  /** The platoons on "support" with a squad still fighting: what a spent assault can commit. */
  baseOfFire(game: Game): string[] {
    const fighting = (u: Unit) => !u.neutralized && !u.routing && !u.surrendered && !this.scouts.has(u.id);
    return [...this.platoons(game)].filter(([key, us]) => this.platoonTask(key) === "support" && us.some(fighting)).map(([key]) => key);
  }

  /**
   * Commit the reserve, or with none the base of fire (Battle Drill 2 step
   * 12: reinforce the assault; {@link toCommit}): its platoons go in, and
   * fires held for an assault held short lift. Rear security and a platoon
   * told to halt or withdraw keep their tasks; a suppression gate gives up
   * waiting.
   */
  recommit(game: Game): void {
    for (const key of this.toCommit(game)) this.tasks.set(key, "assault");
    if (this.holdingShort) this.liftFires();
    this.gaveUp = true;
    this.gateHolding = false;
  }

  /** The commander was asked to commit the base of fire, and said no: not asked again. */
  declineRecommit(): void {
    this.recommitDeclined = true;
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

/** {@link ScriptedCompany} as plain data, for a saved battle. */
export interface CompanySnapshot {
  /** Each scout and where it watches from (null: toward the objective). */
  scouts: [string, Point | null][];
  /** Where each holding force waits. */
  waitAt: [string, Point][];
  /** What each platoon does once the company goes. */
  tasks: [string, PlatoonTask][];
  /** The company's start line, where a platoon pulled back goes. */
  home: Point;
  lookedTurns: number;
  /**
   * The suppression gate's memory: turns spent not gaining suppressive
   * fire, the platoons committed to the base of fire because of it, and
   * whether it gave up. Optional, so a battle saved before 2026-10-11
   * still reads.
   */
  tryingTurns?: number;
  reinforced?: string[];
  gaveUp?: boolean;
  gateHolding?: boolean;
  /** The wait for the support to be set (drill audit, A1); absent: not waiting, not yet set, no turns waited. */
  supportHolding?: boolean;
  supportSet?: boolean;
  supportWaitTurns?: number;
  /** The turn it last counted one of them. */
  supportCountedOn?: number;
  securityGiven?: boolean;
  /** Whether the commander declined to commit the base of fire (2026-10-12); absent: no. */
  recommitDeclined?: boolean;
  support: boolean;
  bounding: boolean;
  holdingShort: boolean;
  firesLifted: boolean;
  movedUp: boolean;
  via?: Point;
  /** The turn the rest were let go; absent while they hold. */
  released?: number;
}
