import { type Game, type IndirectFireResult, type Point, type Side, type Unit } from "../engine/index.js";
import { AskedAttacker, observationPoints } from "./askedCompany.js";
import { assaultPointFrom, flankPointsFrom, platoonKey, type CompanyGround } from "./company.js";
import { attackerPlan, placeCaches, tubesOf } from "./computerSide.js";
import { DrillState, REFERENCE_DRILL, designateBreachSquads, drillCombat, drillMovement, type DrillReport, type DrillTask, type SquadDrill } from "./drill.js";
import type { CompanyOrder } from "./order.js";
import { orderDecider, type IntentNote } from "./orderCommander.js";
import { briefedObjective } from "./planning.js";

/**
 * OPORD mode's attacker (decisions 126 and 128): the player's company carried
 * out by the player's order, phase by phase in the browser, as
 * `ComputerAttacker` carries out the scripted plan. The order is compiled to
 * a commander (`orderDecider`) that answers the company's typed questions
 * (`AskedAttacker`), and the squad drill does the rest: the questions and
 * answers the headless runner plays. Not the runner's battle exactly: here each
 * side fires and moves in its own activation in initiative order, where the
 * runner fires the attacker's mortars first and asks its movement questions
 * before either side moves.
 *
 * Its drill is the one an asked commander is measured with (`jev-sim`): the
 * reference drill, a scout watching one turn at its post. ⚠️ Ours, so the
 * browser plays the order as the tables do.
 */
export const ORDERED_DRILL: SquadDrill = { ...REFERENCE_DRILL, scouting: { watchTurns: 1 } };

/** What the order form needs before there is a company: where the plan puts things. */
export interface OrderGround {
  /** Where the tasking puts the enemy: the brief, spoilt by an observer's error (decision 51). */
  objective: Point;
  /** The company's centre, where it starts: the start line. */
  home: Point;
  /** The observation points a scout may be sent to, best first (p1, p2, …). */
  observationPoints: Point[];
  /** The flanks a company coming in on the objective could go round. */
  flanks: { side: "west" | "east"; at: Point }[];
  /** Roughly where the company would move up to: the last cover short of the objective. */
  assaultPosition: Point | undefined;
  /** The registered points of the fire plan: the centre, its west, its east. */
  planned: readonly Point[];
  /** The side's platoons, as the order names them. */
  platoons: string[];
}

const centre = (us: readonly Unit[]): Point => ({
  x: us.reduce((t, u) => t + u.position.x, 0) / us.length,
  y: us.reduce((t, u) => t + u.position.y, 0) / us.length,
});

/** Where the attacker's plan puts things, for the order form. Reads the ground only; draws no rng. */
export function orderGround(g: Game, side: Side, ground: { mapWidth: number; mapHeight: number }, reserves: readonly string[] = []): OrderGround {
  const defender = side === "RED" ? "BLUE" : "RED";
  const objective = briefedObjective(g, side, defender, undefined, reserves);
  const { planned, suspected } = attackerPlan(objective);
  const infantry = g.units.filter((u) => u.side === side && u.kind === "infantry");
  const home = infantry.length ? centre(infantry) : objective;
  const at: CompanyGround = { terrain: g.terrain, width: ground.mapWidth, height: ground.mapHeight };
  return {
    objective,
    home,
    observationPoints: observationPoints(g, side, objective, suspected, ground.mapWidth, ground.mapHeight).candidates,
    flanks: flankPointsFrom(home, objective, suspected, at),
    assaultPosition: assaultPointFrom(home, objective, suspected, at),
    planned,
    platoons: [...new Set(g.units.filter((u) => u.side === side && u.kind !== "command").map((u) => platoonKey(u.id)))],
  };
}

export class OrderedAttacker {
  readonly asked: AskedAttacker;
  /** What the order did not speak to, answered by the intent (decision 128). */
  readonly notes: IntentNote[];
  private readonly task: DrillTask;
  private readonly state = new DrillState();
  private readonly drill: SquadDrill;

  /**
   * Plans what the runner plans before its first turn, in this order: the
   * order's planning answers (scouts, posts, where to wait, the priority
   * target), then the fire plan's points registered and the caches where the
   * squads start, then the breach squads named. Throws `OrderRefused` if the
   * order does not play, before anything is journaled.
   */
  constructor(
    g: Game,
    readonly side: Side,
    readonly order: CompanyOrder,
    ground: { mapWidth: number; mapHeight: number },
    brief?: string,
    reserves: readonly string[] = [],
    drill: SquadDrill = ORDERED_DRILL,
  ) {
    this.drill = drill;
    const defender = side === "RED" ? "BLUE" : "RED";
    const objective = briefedObjective(g, side, defender, undefined, reserves);
    const plan = attackerPlan(objective);
    const own = g.units.filter((u) => u.side === side && u.kind !== "command");
    const startLine = own.length ? centre(own) : objective;
    const platoons = [...new Set(own.map((u) => platoonKey(u.id)))];
    const decide = orderDecider(order, platoons);
    this.notes = decide.notes;
    const companyGround = {
      // The ground as it stands, buildings brought down included (decision 76).
      get terrain() {
        return g.terrain;
      },
      width: ground.mapWidth,
      height: ground.mapHeight,
    };
    // The planning questions first: they read the ground and the side's forces, not its fire plan or caches,
    // and a decider that throws here leaves nothing journaled (no targets registered twice on a second try).
    this.asked = new AskedAttacker(g, side, objective, startLine, plan, companyGround, decide, brief);
    for (const w of tubesOf(g, side)) for (const t of plan.planned) g.registerTarget(side, w, t);
    placeCaches(g, side);
    designateBreachSquads(g, side, drill, (u) => this.asked.company.isScout(u));
    this.task = { side, attacking: true, objective, extent: { width: ground.mapWidth, height: ground.mapHeight } };
  }

  /** Every phase's resolved fire, so the company is told what its mortars did (`AskedAttacker.heard`). */
  heard(res: IndirectFireResult[] | undefined): void {
    this.asked.heard(res);
  }

  /** The targeting phase: the order's fire. */
  targeting(_g: Game): void {
    this.asked.targeting();
  }

  /** The movement phase: the order's answers for the turn, then the drill carrying them out. */
  movement(g: Game, report?: DrillReport): void {
    this.task.company = this.asked.movement(g.turn, this.state);
    drillMovement(g, this.task, this.drill, this.state, report);
  }

  combat(g: Game, report?: DrillReport): void {
    drillCombat(g, this.task, this.drill, this.state, report);
  }
}
