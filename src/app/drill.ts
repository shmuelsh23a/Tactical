import {
  angleBetween,
  bearingDegrees,
  distance,
  type Game,
  type MovementMode,
  type Point,
  type Side,
  type Unit,
} from "../engine/index.js";
import { sideView } from "./hotseat.js";

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
  /** Assault inside this range, throwing this many grenades. */
  assault: { range: number; grenades: number };
  /**
   * Break contact: a force whose ready men fall below `readyShareBelow` of its
   * strength withdraws `fallBack` metres away from the enemy — before it
   * breaks, rather than after. Null: it fights until morale decides.
   */
  breakContact: { readyShareBelow: number; fallBack: number } | null;
  /** Command groups follow this far behind the centre of their forces. */
  commandGroupBehind: number;
}

/**
 * The plain script the balance harness first measured with: everyone shoots
 * the nearest enemy in reach, half bound while half fire, nobody breaks
 * contact. Kept as the baseline a drill is compared against.
 */
export const PLAIN_SCRIPT: SquadDrill = {
  name: "plain script",
  sectorWidth: 360,
  engageOutsideSector: true,
  bound: { metres: 100, gait: "run" },
  overwatch: true,
  attackFireRange: 400,
  openFireRange: 400,
  coverWhenIdle: true,
  assault: { range: 25, grenades: 2 },
  breakContact: null,
  commandGroupBehind: 80,
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
 * - a force **breaks contact** at half strength rather than waiting to rout.
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
  assault: { range: 25, grenades: 2 },
  breakContact: { readyShareBelow: 0.5, fallBack: 150 },
  commandGroupBehind: 80,
};

/** What one side has been told to do: attack towards a point, or hold facing one. */
export interface DrillTask {
  side: Side;
  attacking: boolean;
  /** For an attacker, where it is going; for a defender, where the threat comes from. */
  objective: Point;
}

/**
 * What the drill remembers between turns: each force's strength at the start,
 * and which forces have already broken contact — a force falls back once, and
 * then holds where it fell back to.
 */
export class DrillState {
  private readonly strength = new Map<string, number>();
  readonly fellBack = new Set<string>();

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

/**
 * The movement phase: each force's order for the turn, carried out; then the
 * command groups take their place behind their forces.
 */
export function drillMovement(game: Game, task: DrillTask, drill: SquadDrill, state: DrillState): void {
  const { side } = task;
  const enemies = knownEnemies(game, side);
  const inContact = enemies.length > 0;
  const forces = game.units.filter((u) => u.side === side && u.kind !== "command");

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
    if (!task.attacking) {
      // Fire discipline as an order, so covering fire keeps it too: the engine
      // holds a force's fire — covering or not — until the enemy is inside
      // the line (rules decision 6's hold-fire order).
      const held = game.standingOrderFor(u.id);
      if (held?.holdFire !== true || held.engagementRange !== drill.openFireRange) {
        game.setStandingOrder(u.id, { gait: "normal", holdFire: true, engagementRange: drill.openFireRange });
      }
      return;
    }

    if (nearest && distance(u.position, nearest.position) <= drill.assault.range + 5) {
      game.setStandingOrder(u.id, { gait: "normal" }); // close enough: hold, and assault in the fire phase
      return;
    }
    const bounding = !inContact || !drill.overwatch || (i + game.turn) % 2 === 0;
    if (!bounding) {
      game.setStandingOrder(u.id, { gait: "normal" });
      return;
    }
    const aim = nearest ? nearest.position : task.objective;
    game.setStandingOrder(u.id, {
      gait: inContact ? drill.bound.gait : "normal",
      destination: toward(u.position, aim, inContact ? drill.bound.metres : 100),
    });
  });
  game.executeStandingOrders(side);

  const live = forces.filter(inPlay);
  if (live.length === 0) return;
  const cx = live.reduce((s, u) => s + u.position.x, 0) / live.length;
  const cy = live.reduce((s, u) => s + u.position.y, 0) / live.length;
  const behind = toward({ x: cx, y: cy }, task.objective, -drill.commandGroupBehind);
  for (const hq of game.units.filter((u) => u.side === side && u.kind === "command" && inPlay(u))) {
    if (distance(hq.position, behind) < 5) continue;
    try {
      game.moveUnit(hq.id, toward(hq.position, behind, 25));
    } catch {
      // Pinned, out of budget, nowhere to go: it stays where it is.
    }
  }
}

/** The fire phase: shoot into the sector, assault what is close, cover when idle. */
export function drillCombat(game: Game, task: DrillTask, drill: SquadDrill): void {
  const { side } = task;
  const enemies = knownEnemies(game, side);
  const reach = task.attacking ? drill.attackFireRange : drill.openFireRange;
  for (const u of game.units.filter((x) => x.side === side && inPlay(x))) {
    const target = pickTarget(u, enemies, axisOf(u, task), drill, reach);
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
      game.assault(u.id, target.id, drill.assault.grenades);
    } else {
      game.fire(u.id, target.id, { weapon: u.kind === "vehicle" ? "sustainedMg" : "smallArms" });
    }
  }
}
