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
const FIND_WITHIN_M = 250;

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
  /** The turn the rest were let go; undefined while they hold. */
  released: number | undefined;

  constructor(game: Game, side: Side, objective: Point, suspected: readonly Point[], plan: CompanyPlan, ground: CompanyGround) {
    this.side = side;
    this.objective = { ...objective };
    this.plan = plan;
    const own = game.units.filter((u) => u.side === side && u.kind === "infantry");
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
    const points =
      recon.scoutFrom === "vantage" && chosen.length
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

  /** Whether a force is one of this company's scouts. */
  isScout(u: Unit): boolean {
    return this.scouts.has(u.id);
  }

  /**
   * The turn's orders, from what the side knows now: whether the scouts hold
   * the enemy at the objective in sight, and whether that has gone on long
   * enough — or they are lost, or there — to let the rest go.
   */
  orders(game: Game): CompanyOrders {
    const holding = this.holdingInSight(game);
    if (this.released === undefined) {
      this.lookedTurns = holding ? this.lookedTurns + 1 : 0;
      const live = [...this.scouts.keys()]
        .map((id) => game.units.find((u) => u.id === id))
        .filter((u): u is Unit => !!u && !u.neutralized && !u.routing && !u.surrendered);
      const there = live.some((u) => distance(u.position, this.objective) <= 50);
      if (this.lookedTurns > (this.plan.recon?.lookTurns ?? 0) || live.length === 0 || there) this.released = game.turn;
    }
    return {
      scouts: this.scouts,
      scoutsLieUp: holding || this.released !== undefined,
      hold: this.released === undefined,
      waitAt: this.waitAt,
    };
  }

  /** A fresh report (this turn or last) of an enemy at the objective: held in sight, not merely once found. */
  private holdingInSight(game: Game): boolean {
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
