import { distance, pointInPolygon, type Point } from "../geometry.js";
import { unitSeed } from "../morale.js";
import { Rng } from "../rng.js";
import type { MapObject, Terrain } from "../terrain.js";
import type { Side, Soldier, Unit } from "../types.js";
import { refreshUnitStatus } from "../units.js";
import { CASUALTY_RULES } from "../data/casualties.js";
import { CLOSE_QUARTERS, STOREY_HEIGHT_M } from "../data/interior.js";
import { EYE_HEIGHT } from "../data/terrain.js";
import { TURN_SECONDS } from "../data/lethality.js";
import { generateFloorPlan, type FloorPlan } from "./floorPlan.js";
import { InteriorFight, defaultDefence, plannedDefence, type InteriorOutcome } from "./resolver.js";

/**
 * The fight inside a building, coupled to the turn (README, rules decision
 * 96; docs/urban-design.md, step 3b). On the map a force inside a building is
 * where it always was; when an enemy force assaults a force inside it — only
 * an assault order goes in, and a force at the walls fights from outside
 * (the author, 2026-10-20) — the two fight it out room by room on the
 * building's floor plan — a minute of it a turn, as the turn closes — and
 * what that does to their men comes back onto the map.
 *
 * **This first slice** couples men and time: who goes in, the minute a turn,
 * wounds and losses, men who withdraw out of the front door. **The second**
 * (decision 98) couples the windows: a defender at one fires out and is seen
 * through it, and a round that gets in bursts in one room (`shown`,
 * `roomBurst`; the fire itself is `Game.throughWindows`). Not yet: forces
 * joining a fight already going on, and the players' own plans inside —
 * until then the author's defaults, "unless otherwise planned": the
 * attacker by the front door with a grenade into each room, in teams of
 * four; the defender one man a room. In the product the plan comes from the
 * OPORD and the battle plan on the map (README, *Design principles*).
 */

/** One building's fight in progress. */
export interface InteriorEngagement {
  buildingId: string;
  fight: InteriorFight;
  attackerSide: Side;
  attackerUnits: string[];
  defenderUnits: string[];
  startedTurn: number;
}

/** What a building's fight did this turn, for the log and the debrief. */
export interface InteriorReport {
  buildingId: string;
  attackerSide: Side;
  attackerUnits: string[];
  defenderUnits: string[];
  /** True on the turn the fight began. */
  began: boolean;
  /** Forces of the attacking side that came in to join it this turn (decision 99). */
  joined?: string[];
  /** Forces of the defending side that came in to counterattack this turn (decision 104). */
  counterattacked?: string[];
  /** Men put out this turn, each side. */
  attackersOut: number;
  defendersOut: number;
  /** Defenders who left the building this turn: fell back out of its front door, or their force broke or gave up. */
  defendersWithdrew: number;
  /** Attackers who left the fight this turn: their force broke, gave up or was spent, or they broke themselves (decision 103). */
  attackersWithdrew: number;
  /** Defenders who broke and, cornered, gave themselves up inside this turn (decision 103). */
  defendersYielded?: number;
  roomsCleared: number;
  rooms: number;
  /** Set on the turn the fight ended. */
  outcome?: InteriorOutcome;
  /** It ended because this side broke (decision 102): its men inside gave up, or left. */
  brokeOff?: Side;
}

/** Why a force may not act outside: it is fighting inside a building; or may not go in from the roof as planned. */
export const INTERIOR_REFUSAL = {
  fightingInside: "fighting inside a building",
  noWayFromRoof: "no way in from the roof",
  /** A fight entered from the roof is joined only by its hatch, which is not modelled (decision 101). */
  enteredFromRoof: "the fight inside went in from the roof",
} as const;

/**
 * A force's plan for a fight inside a building (rules decision 101): what a
 * commander writes in an order, never where each man stands. Anything left
 * out is the author's default, "unless otherwise planned" (2026-10-20).
 */
export interface InteriorPlan {
  /** Attacking: by the front door (the default), or from the roof and down, which needs stairs. Fixed once the fight begins. */
  entry?: "door" | "top";
  /** Attacking: a grenade into each room before entering it (the default). May change at any turn. */
  grenades?: boolean;
  /** Defending: the storeys its men hold, from 0 for the ground floor. All, by default. */
  holdStoreys?: number[];
  /** Defending: at the windows facing the enemy (the default), or back in the rooms. */
  atWindows?: boolean;
  /** Defending: where the attack is expected from: below (the default) or above. */
  expects?: "below" | "above";
  /** Defending: fall back from a room whose neighbour is taken (the default), or hold to the last. May change at any turn. */
  fallBack?: boolean;
}

/** The reason an assault gives when it goes into the building rather than being resolved outside. */
export const GOES_INSIDE = "goes inside";

/** What the coupling needs of the game. */
export interface InteriorWorld {
  readonly units: Unit[];
  readonly terrain: Terrain;
  readonly turn: number;
  readonly seed: number;
  /** Two forces that meet inside a building have each other in sight from then on (decision 12). */
  readonly contact?: (a: Unit, b: Unit) => void;
  /** Decision 98: the defenders stand at the windows facing the enemy, unless otherwise planned. */
  readonly windowFire?: boolean;
  /** Decision 103: a man broken outside's judgement stops fighting inside. */
  readonly moraleInside?: boolean;
  /** Decision 104: defenders inside retake rooms, and the defending side counterattacks in. */
  readonly counterattackInside?: boolean;
}

/** A man of a force fighting inside whom the street can see, and who can see it (decision 98). */
export interface ShownMan {
  soldierId: string;
  /** Where he is seen from outside: his window, or the street by the door. */
  point: Point;
  /** His eye, and the height he is seen at, above the ground. */
  height: number;
  /** The way his window faces, on the map; absent in the street, where he is seen from every side. */
  facing?: Point;
}

/** The point of a polygon's outline nearest `p`. */
function nearestOnOutline(pts: readonly Point[], p: Point): Point | undefined {
  let best: Point | undefined, bestD = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const q = { x: a.x + t * dx, y: a.y + t * dy };
    const d = distance(q, p);
    if (d < bestD) { bestD = d; best = q; }
  }
  return best;
}

/** A man's eye above his floor, as outside (decision 15). */
const STREET_EYE_M = EYE_HEIGHT.infantry;

const fit = (u: Unit) => (u.soldiers ?? []).filter((s) => !s.neutralized);

/** A force carried to `to` by the fight — into a door, out of one: a move, and counted as one (decision 12). */
function moveTo(u: Unit, to: Point): void {
  const d = distance(u.position, to);
  u.position = { ...to };
  u.movedThisTurn += d;
}

export class InteriorBattles {
  readonly engagements: InteriorEngagement[] = [];
  /** Each force's plan for a fight inside, as last given (decision 101): set only by `Game.setInteriorPlan`, which journals it. */
  private readonly orders = new Map<string, InteriorPlan>();

  /** A force's plan, as last given (decision 101): a copy. */
  orderFor(unitId: string): InteriorPlan | undefined {
    const o = this.orders.get(unitId);
    return o ? structuredClone(o) : undefined;
  }

  /** Keep a force's plan (decision 101). The game's, which journals it. */
  setOrder(unitId: string, plan: InteriorPlan): void {
    this.orders.set(unitId, structuredClone(plan));
  }
  /** Forces that assaulted into a building this turn: they go in as it closes. */
  private readonly entering = new Map<string, string>();
  private readonly plans = new Map<string, FloorPlan>();

  /** Is this force in a fight inside a building? */
  inFight(unitId: string): boolean {
    return this.engagements.some((e) => e.attackerUnits.includes(unitId) || e.defenderUnits.includes(unitId));
  }

  /** The building a force stands inside, if any. */
  buildingAt(terrain: Terrain, p: Point): MapObject | undefined {
    return terrain.objects.find((o) => o.kind === "building" && o.footprint.shape === "polygon" && pointInPolygon(p, o.footprint.points));
  }

  /** A building's plan, built once a game from its seed. */
  plan(world: InteriorWorld, building: MapObject): FloorPlan {
    let p = this.plans.get(building.id);
    if (!p) { p = generateFloorPlan(building, world.seed); this.plans.set(building.id, p); }
    return p;
  }

  /** The point on the map just outside a building's front door: where a force goes in, and comes out. */
  frontDoor(world: InteriorWorld, building: MapObject): Point | undefined {
    const plan = this.plan(world, building);
    const door = plan.outsideDoors[0];
    if (door === undefined) return undefined;
    const cells = plan.storeys[0]!.cells, w = plan.width;
    // The street cell beside the door.
    const x0 = door % w, y0 = (door - x0) / w;
    let gx = x0, gy = y0;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const j = (y0 + dy) * w + (x0 + dx);
      if (cells[j] === 0) { gx = x0 + dx; gy = y0 + dy; break; }
    }
    const lx = (gx + 0.5) * plan.cellM, ly = (gy + 0.5) * plan.cellM;
    return { x: plan.origin.x + lx * plan.axis.x - ly * plan.axis.y, y: plan.origin.y + lx * plan.axis.y + ly * plan.axis.x };
  }

  /** The fight a force is in, if any. */
  engagementOf(unitId: string): InteriorEngagement | undefined {
    return this.engagements.find((e) => e.attackerUnits.includes(unitId) || e.defenderUnits.includes(unitId));
  }

  /** A cell's centre on the map. */
  private cellPoint(plan: FloorPlan, cell: number): Point {
    const x = cell % plan.width, y = (cell - x) / plan.width;
    const lx = (x + 0.5) * plan.cellM, ly = (y + 0.5) * plan.cellM;
    return { x: plan.origin.x + lx * plan.axis.x - ly * plan.axis.y, y: plan.origin.y + lx * plan.axis.y + ly * plan.axis.x };
  }

  /** The cell under a point of the map, or -1 off the grid. */
  private cellAt(plan: FloorPlan, p: Point): number {
    const dx = p.x - plan.origin.x, dy = p.y - plan.origin.y;
    const x = Math.floor((dx * plan.axis.x + dy * plan.axis.y) / plan.cellM);
    const y = Math.floor((-dx * plan.axis.y + dy * plan.axis.x) / plan.cellM);
    return x < 0 || y < 0 || x >= plan.width || y >= plan.height ? -1 : y * plan.width + x;
  }

  /**
   * The men of a force fighting inside that the street can see (decision
   * 98): those at a window, and those still in the street by the door.
   * Undefined for a force in no fight. With `from`, only those whose window
   * faces it.
   */
  shown(world: InteriorWorld, unitId: string, from?: Point): ShownMan[] | undefined {
    const e = this.engagementOf(unitId);
    if (!e) return undefined;
    const u = this.unit(world, unitId);
    const mine = new Set((u.soldiers ?? []).filter((s) => !s.neutralized).map((s) => s.id));
    const plan = e.fight.plan;
    const out: ShownMan[] = [];
    for (const m of e.fight.atWindows()) {
      if (!mine.has(m.id)) continue;
      const point = this.cellPoint(plan, m.window);
      const facing = { x: m.outward.x * plan.axis.x - m.outward.y * plan.axis.y, y: m.outward.x * plan.axis.y + m.outward.y * plan.axis.x };
      if (from && (from.x - point.x) * facing.x + (from.y - point.y) * facing.y <= 0) continue;
      out.push({ soldierId: m.id, point, height: m.storey * STOREY_HEIGHT_M + STREET_EYE_M, facing });
    }
    const building = world.terrain.objects.find((o) => o.id === e.buildingId);
    const door = building ? this.frontDoor(world, building) : undefined;
    if (door) for (const id of e.fight.inStreet()) if (mine.has(id)) out.push({ soldierId: id, point: door, height: STREET_EYE_M });
    // On the roof (decision 101, the author: "seen on the roof"): at its edge nearest the one looking, standing on it. ⚠️ Ours: the edge, and his full height.
    if (building && building.footprint.shape === "polygon") {
      const edge = from ? nearestOnOutline(building.footprint.points, from) : (building.footprint.points[0] ?? door);
      for (const id of e.fight.onRoof()) if (mine.has(id) && edge) out.push({ soldierId: id, point: edge, height: plan.storeys.length * STOREY_HEIGHT_M + STREET_EYE_M });
    }
    return out;
  }

  /** Every force with men on a roof (decision 101): its own men up there, and the building. Empty where nobody is. */
  roofMen(world: InteriorWorld): Map<string, { men: Set<string>; buildingId: string }> {
    const out = new Map<string, { men: Set<string>; buildingId: string }>();
    for (const e of this.engagements) {
      const up = new Set(e.fight.onRoof());
      if (up.size === 0) continue;
      for (const id of e.attackerUnits) {
        const men = new Set((this.unit(world, id).soldiers ?? []).map((s) => s.id).filter((s) => up.has(s)));
        if (men.size) out.set(id, { men, buildingId: e.buildingId });
      }
    }
    return out;
  }

  /**
   * Where a round that got in bursts (decision 98): the room a man stands
   * in, or the top-storey room under a point the round came through the
   * roof at — the nearest room cell, where the point is on a wall — with
   * every man of both sides in it, by force. Undefined where no fight is
   * going on; with one, every force in it is listed, with nobody where the
   * room is empty or there is none.
   */
  roomBurst(world: InteriorWorld, buildingId: string, at: { soldierId: string } | { roof: Point }): Map<string, Set<string>> | undefined {
    const e = this.engagements.find((x) => x.buildingId === buildingId);
    if (!e) return undefined;
    const plan = e.fight.plan;
    let where: { storey: number; room: number } | undefined;
    if ("soldierId" in at) where = e.fight.roomOfMan(at.soldierId);
    else {
      const storey = plan.storeys.length - 1;
      const room = this.roomNear(plan, storey, at.roof);
      if (room >= 0) where = { storey, room };
    }
    const ids = new Set(where ? e.fight.inRoom(where.storey, where.room) : []);
    const byUnit = new Map<string, Set<string>>();
    for (const id of [...e.attackerUnits, ...e.defenderUnits]) {
      const men = (this.unit(world, id).soldiers ?? []).filter((s) => ids.has(s.id)).map((s) => s.id);
      byUnit.set(id, new Set(men));
    }
    return byUnit;
  }

  /** The room of a storey under a point of the map, or the nearest room cell to it: a wall, a door or the stairs. -1 with none. */
  private roomNear(plan: FloorPlan, storey: number, p: Point): number {
    const roomOf = plan.storeys[storey]!.roomOf;
    const dx = p.x - plan.origin.x, dy = p.y - plan.origin.y;
    const gx = (dx * plan.axis.x + dy * plan.axis.y) / plan.cellM - 0.5, gy = (-dx * plan.axis.y + dy * plan.axis.x) / plan.cellM - 0.5;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < roomOf.length; i++) {
      if (roomOf[i]! < 0) continue;
      const x = i % plan.width, y = (i - x) / plan.width;
      const d = (x - gx) * (x - gx) + (y - gy) * (y - gy);
      if (d < bestD) { bestD = d; best = roomOf[i]!; }
    }
    return best;
  }

  /**
   * A side has broken (rules decision 102, the author, 2026-10-20): its men
   * still fighting inside stop. A defender's forces in a fight give
   * themselves up where they are, and the house is the attacker's; an
   * attacker's withdraw out of the front door, and the attack inside is
   * over. One report a fight, its ending.
   */
  endOnBreak(world: InteriorWorld, broken: ReadonlySet<Side>): { reports: InteriorReport[]; surrendered: string[] } {
    const reports: InteriorReport[] = [];
    const surrendered: string[] = [];
    for (const e of [...this.engagements]) {
      const defenderSide: Side = e.attackerSide === "BLUE" ? "RED" : "BLUE";
      // ⚠️ Ours: both broken in one turn, the attack inside is over and the house stays the defender's.
      const attacking = broken.has(e.attackerSide);
      if (!attacking && !broken.has(defenderSide)) continue;
      const units = attacking ? e.attackerUnits : e.defenderUnits;
      if (units.length === 0) continue;
      const building = world.terrain.objects.find((o) => o.id === e.buildingId);
      for (const id of units) {
        const u = this.unit(world, id);
        if (attacking) {
          e.fight.leave((u.soldiers ?? []).map((s) => s.id));
          const door = building ? this.frontDoor(world, building) : undefined;
          if (door) moveTo(u, door);
        } else {
          // As morale's surrender does outside (decision 19); the game does the rest of it.
          u.surrendered = true;
          u.routing = false;
          u.neutralized = true;
          u.canOnlyRetreat = false;
          surrendered.push(id);
        }
      }
      const result = e.fight.result();
      reports.push({
        buildingId: e.buildingId,
        attackerSide: e.attackerSide,
        attackerUnits: [...e.attackerUnits],
        defenderUnits: [...e.defenderUnits],
        began: false,
        attackersOut: 0,
        defendersOut: 0,
        defendersWithdrew: 0,
        attackersWithdrew: 0, // the log says they left: not counted twice
        roomsCleared: result.roomsCleared,
        rooms: result.rooms,
        outcome: attacking ? "repulsed" : "cleared",
        brokeOff: attacking ? e.attackerSide : defenderSide,
      });
      this.engagements.splice(this.engagements.indexOf(e), 1);
    }
    return { reports, surrendered };
  }

  /** The forces fighting in a building. */
  fightersIn(buildingId: string): string[] {
    const e = this.engagements.find((x) => x.buildingId === buildingId);
    return e ? [...e.attackerUnits, ...e.defenderUnits] : [];
  }

  /** Is a fight already being fought in this building? */
  fightIn(buildingId: string): boolean {
    return this.engagements.some((e) => e.buildingId === buildingId);
  }

  /**
   * An assault on a force inside a building is going in: the attacker closes
   * on its front door and stands there, and the fight begins as the turn
   * closes. The way to the door is a move like any other.
   */
  goIn(world: InteriorWorld, attacker: Unit, building: MapObject): void {
    const door = this.frontDoor(world, building);
    if (door) moveTo(attacker, door);
    this.entering.set(attacker.id, building.id);
  }

  /** The turn's minute inside every building where one is being fought. */
  resolveTurn(world: InteriorWorld): InteriorReport[] {
    const reports: InteriorReport[] = [];
    const started = new Set(this.startFights(world));
    const { joined, countered } = this.joinFights(world);
    this.entering.clear();
    // Fighting room by room, each side goes on knowing who it is fighting, minute by minute
    // (decision 104: a reserve commits on what its side knows fresh).
    if (world.counterattackInside && world.contact) {
      for (const e of this.engagements) for (const a of e.attackerUnits) for (const d of e.defenderUnits) world.contact(this.unit(world, a), this.unit(world, d));
    }
    // The plans as they stand this turn: grenades, and fall back or hold (decision 101).
    for (const e of this.engagements) {
      for (const id of e.attackerUnits) {
        const ids = (this.unit(world, id).soldiers ?? []).map((m) => m.id);
        e.fight.setGrenades(ids, this.orders.get(id)?.grenades ?? true);
      }
      for (const id of e.defenderUnits) {
        const ids = (this.unit(world, id).soldiers ?? []).map((m) => m.id);
        e.fight.setHolds(ids, this.orders.get(id)?.fallBack === false);
      }
    }
    const ticks = Math.round(TURN_SECONDS / CLOSE_QUARTERS.tickSeconds);
    for (const e of [...this.engagements]) {
      const building = world.terrain.objects.find((o) => o.id === e.buildingId);
      // A building brought down over the fight ends it: rubble is ground outside (decision 76).
      if (!building || building.kind !== "building") {
        this.engagements.splice(this.engagements.indexOf(e), 1);
        continue;
      }
      const byId = this.soldierIndex(world, e);
      // What happened to the men outside since the last minute comes in with
      // them: a wound from a shell through the roof, bleeding, a man put out.
      for (const m of e.fight.soldiers) {
        const s = byId.get(m.id)?.soldier;
        if (!s || m.out) continue;
        m.damage = Math.max(m.damage, s.damagePoints);
        if (s.neutralized) m.out = true;
      }
      // Counted before anyone leaves, so a force that leaves is reported leaving.
      const withdrewBefore = new Set(e.fight.soldiers.filter((m) => m.withdrew).map((m) => m.id));
      // A force routed, given up, or spent (it may only fall back) leaves the
      // fight; the rest fight on.
      for (const id of [...e.attackerUnits, ...e.defenderUnits]) {
        const u = this.unit(world, id);
        if (u.routing || u.surrendered || (u.neutralized && u.canOnlyRetreat)) {
          e.fight.leave((u.soldiers ?? []).map((s) => s.id));
          e.attackerUnits = e.attackerUnits.filter((a) => a !== id);
          e.defenderUnits = e.defenderUnits.filter((d) => d !== id);
          const door = this.frontDoor(world, building);
          if (door) moveTo(u, door);
        }
      }
      // Who is broken, as the last morale step left them (decision 103).
      if (world.moraleInside) {
        for (const m of e.fight.soldiers) {
          const s = byId.get(m.id)?.soldier;
          if (s?.morale) e.fight.setBroken([m.id], s.morale.state === "broken");
        }
      }
      const damageBefore = new Map(e.fight.soldiers.map((m) => [m.id, m.damage]));
      const outBefore = new Set(e.fight.soldiers.filter((m) => m.out).map((m) => m.id));
      for (let k = 0; k < ticks && !e.fight.finished; k++) e.fight.tick();
      let attackersOut = 0, defendersOut = 0, defendersWithdrew = 0, attackersWithdrew = 0, defendersYielded = 0;
      for (const m of e.fight.soldiers) {
        const entry = byId.get(m.id);
        if (!entry) continue;
        this.writeBack(m, damageBefore.get(m.id) ?? 0, outBefore.has(m.id), entry.soldier, entry.unit, world.turn);
        if (m.out && !outBefore.has(m.id)) {
          if (m.yielded) defendersYielded++;
          else if (m.side === e.attackerSide) attackersOut++;
          else defendersOut++;
        }
        if (m.withdrew && !withdrewBefore.has(m.id)) {
          if (m.side === e.attackerSide) attackersWithdrew++;
          else defendersWithdrew++;
        }
      }
      for (const id of [...e.attackerUnits, ...e.defenderUnits]) refreshUnitStatus(this.unit(world, id));
      // A defending force whose every man still fighting has left the
      // building stands outside its front door — and has left its
      // preparations behind it, as a force that walks away does (decision 12).
      for (const id of e.defenderUnits) {
        const u = this.unit(world, id);
        const men = fit(u);
        if (men.length > 0 && men.every((s) => e.fight.soldiers.find((m) => m.id === s.id)?.withdrew)) {
          const door = this.frontDoor(world, building);
          if (door) moveTo(u, door);
          e.defenderUnits = e.defenderUnits.filter((d) => d !== id);
        }
      }
      // An attacking force whose every man still fit has left the fight —
      // broken, one by one (decision 103) — is out of it, at the front door.
      for (const id of e.attackerUnits) {
        const men = fit(this.unit(world, id));
        if (men.length > 0 && men.every((s) => e.fight.soldiers.find((m) => m.id === s.id)?.withdrew)) {
          e.attackerUnits = e.attackerUnits.filter((a) => a !== id);
        }
      }
      const result = e.fight.result();
      reports.push({
        buildingId: e.buildingId,
        attackerSide: e.attackerSide,
        attackerUnits: [...e.attackerUnits],
        defenderUnits: [...e.defenderUnits],
        began: started.has(e),
        ...(joined.get(e)?.length ? { joined: joined.get(e) } : {}),
        ...(countered.get(e)?.length ? { counterattacked: countered.get(e) } : {}),
        attackersOut,
        defendersOut,
        defendersWithdrew,
        attackersWithdrew,
        ...(defendersYielded ? { defendersYielded } : {}),
        roomsCleared: result.roomsCleared,
        rooms: result.rooms,
        ...(e.fight.finished ? { outcome: result.outcome } : {}),
      });
      if (e.fight.finished) this.engagements.splice(this.engagements.indexOf(e), 1);
    }
    return reports;
  }

  /**
   * New fights: a building a force assaulted into this turn, with the other
   * side's forces inside it. **Only an assault order goes in** (the author,
   * 2026-10-20: "only an assault order goes in, and a force at the walls
   * fights from outside"). Buildings are taken in map order, so a replay
   * starts the same fights.
   */
  private startFights(world: InteriorWorld): InteriorEngagement[] {
    const begun: InteriorEngagement[] = [];
    const free = (u: Unit) => !this.inFight(u.id) && !u.surrendered && fit(u).length > 0;
    for (const b of world.terrain.objects) {
      if (b.kind !== "building" || b.footprint.shape !== "polygon") continue;
      if (this.engagements.some((e) => e.buildingId === b.id)) continue;
      const attackers = world.units.filter(
        (u) => this.entering.get(u.id) === b.id && free(u) && u.kind === "infantry" && !u.neutralized && !u.routing,
      );
      if (attackers.length === 0) continue;
      const attackerSide0 = attackers[0]!.side;
      const pts = b.footprint.points;
      const defenders = world.units.filter(
        (u) => free(u) && u.side !== attackerSide0 && (u.kind === "infantry" || u.kind === "command") && pointInPolygon(u.position, pts),
      );
      if (defenders.length === 0) continue;
      const defenderSide: Side = attackerSide0 === "BLUE" ? "RED" : "BLUE";
      const plan = this.plan(world, b);
      if (plan.outsideDoors.length === 0) continue; // no way in
      const rng = new Rng(unitSeed(world.seed, `interior:${b.id}:${world.turn}`));
      // Unless otherwise planned, one defender a room (✅ the author,
      // 2026-10-20). ⚠️ Ours: a defender in a position he prepared (one
      // with a front, decision 85) holds them prepared.
      const prepared = defenders.some((u) => u.front !== undefined);
      // At the windows facing the enemy, unless otherwise planned (decision
      // 98). ⚠️ Ours: the enemy is the assault, where it stands at the door,
      // seen from the building's middle — what the defender has in front of him.
      const toward = world.windowFire ? this.toward(b, plan, attackers) : undefined;
      // A force's orders where it gave any (decision 101); the defaults, drawn as they always were, where none did.
      const defence = defenders.some((u) => this.orders.get(u.id)?.holdStoreys !== undefined || this.orders.get(u.id)?.atWindows === false)
        ? plannedDefence(
            plan,
            defenders.map((u) => {
              const order = this.orders.get(u.id);
              return { ids: fit(u).map((s) => s.id), ...(order?.holdStoreys ? { storeys: order.holdStoreys } : {}), atWindows: order?.atWindows ?? true };
            }),
            rng,
            prepared,
            toward,
          )
        : defaultDefence(plan, defenders.flatMap((u) => fit(u).map((s) => s.id)), rng, prepared, toward);
      const teams: string[][] = [];
      for (const u of attackers) teams.push(...this.teamsOf(u));
      const attackerSide: Side = defenderSide === "BLUE" ? "RED" : "BLUE";
      // Unless otherwise planned (✅ the author, 2026-10-20): by the front
      // door, a grenade into each room first (the drill's "FRAG OUT", TC
      // 3-21.76 (2025), 07-SQD-D9509, step 2), in teams of four. Planned
      // (decision 101): the way in is the first assaulting force's
      // (⚠️ ours, when two go in at once with different plans); the roof needs stairs.
      const first = this.orders.get(attackers[0]!.id);
      const entry = first?.entry === "top" && plan.stairwell && plan.storeys.length > 1 ? "top" : "door";
      const expects = defenders.map((u) => this.orders.get(u.id)?.expects).find((x) => x !== undefined);
      const fight = new InteriorFight({ plan, attack: { entry, grenades: true, teams }, defence, attackerSide, ...(expects ? { defenderExpects: expects } : {}), ...(world.counterattackInside ? { defenderRetakes: true } : {}) }, rng);
      // Wounds already taken outside come in with the men.
      const index = this.soldierIndex(world, { attackerUnits: attackers.map((u) => u.id), defenderUnits: defenders.map((u) => u.id) });
      for (const m of fight.soldiers) {
        const s = index.get(m.id)?.soldier;
        if (s) m.damage = s.damagePoints;
      }
      // Fighting room by room, each side knows who it is fighting.
      if (world.contact) for (const a of attackers) for (const d of defenders) world.contact(a, d);
      const e: InteriorEngagement = {
        buildingId: b.id,
        fight,
        attackerSide,
        attackerUnits: attackers.map((u) => u.id),
        defenderUnits: defenders.map((u) => u.id),
        startedTurn: world.turn,
      };
      this.engagements.push(e);
      begun.push(e);
    }
    return begun;
  }

  /** The way the enemy is from a building, in its grid's own axes. */
  private toward(b: MapObject, plan: FloorPlan, enemy: readonly Unit[]): { x: number; y: number } | undefined {
    if (enemy.length === 0 || b.footprint.shape !== "polygon") return undefined;
    const pts = b.footprint.points;
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const dx = enemy.reduce((s, u) => s + u.position.x, 0) / enemy.length - cx;
    const dy = enemy.reduce((s, u) => s + u.position.y, 0) / enemy.length - cy;
    return { x: dx * plan.axis.x + dy * plan.axis.y, y: -dx * plan.axis.y + dy * plan.axis.x };
  }

  /**
   * Forces of the attacking side that assaulted into a building where their
   * side is already clearing it join the fight (decision 99, the author,
   * 2026-10-20): new teams of four at the front door as the turn closes,
   * by the defaults the fight began with. In unit order, so a replay joins
   * the same. A defending side's force counterattacks in (decision 104):
   * new teams at the front door, clearing the attacker's rooms back.
   */
  private joinFights(world: InteriorWorld): { joined: Map<InteriorEngagement, string[]>; countered: Map<InteriorEngagement, string[]> } {
    const joined = new Map<InteriorEngagement, string[]>();
    const countered = new Map<InteriorEngagement, string[]>();
    for (const u of world.units) {
      const buildingId = this.entering.get(u.id);
      if (buildingId === undefined || this.inFight(u.id)) continue;
      const e = this.engagements.find((x) => x.buildingId === buildingId);
      if (!e || e.fight.finished) continue;
      if (u.kind !== "infantry" || u.neutralized || u.routing || u.surrendered) continue;
      const men = fit(u);
      if (men.length === 0) continue;
      if (u.side !== e.attackerSide) {
        if (!world.counterattackInside) continue;
        e.fight.counterJoin(this.teamsOf(u));
        for (const m of e.fight.soldiers) {
          const s = men.find((x) => x.id === m.id);
          if (s) m.damage = s.damagePoints;
        }
        e.defenderUnits.push(u.id);
        if (world.contact) for (const a of e.attackerUnits) world.contact(u, this.unit(world, a));
        countered.set(e, [...(countered.get(e) ?? []), u.id]);
        continue;
      }
      // A fight entered from the roof is joined only by its hatch, which this does not model (decision 101).
      if (e.fight.entryWay !== "door") continue;
      e.fight.join(this.teamsOf(u));
      // Wounds already taken outside come in with the men.
      for (const m of e.fight.soldiers) {
        const s = men.find((x) => x.id === m.id);
        if (s) m.damage = s.damagePoints;
      }
      e.attackerUnits.push(u.id);
      if (world.contact) for (const d of e.defenderUnits) world.contact(u, this.unit(world, d));
      joined.set(e, [...(joined.get(e) ?? []), u.id]);
    }
    return { joined, countered };
  }

  /**
   * A force's fit men in teams of four: doctrine's stack (TC 3-21.76 (2025),
   * 07-SQD-D9509). Not a plan's to change (the author, 2026-10-20): smaller
   * teams measured quicker for nothing (balance.md).
   */
  private teamsOf(u: Unit): string[][] {
    const size = 4;
    const ids = fit(u).map((s) => s.id);
    const teams: string[][] = [];
    for (let k = 0; k < ids.length; k += size) teams.push(ids.slice(k, k + size));
    return teams;
  }

  /** How a fight going on in a building was entered: by the door, or from the roof. */
  entryIn(buildingId: string): "door" | "top" | undefined {
    return this.engagements.find((e) => e.buildingId === buildingId)?.fight.entryWay;
  }

  /** The side attacking in a building's fight, if one is going on there. */
  attackerSideIn(buildingId: string): Side | undefined {
    return this.engagements.find((e) => e.buildingId === buildingId)?.attackerSide;
  }

  private unit(world: InteriorWorld, id: string): Unit {
    return world.units.find((u) => u.id === id)!;
  }

  private soldierIndex(world: InteriorWorld, e: { attackerUnits: string[]; defenderUnits: string[] }): Map<string, { soldier: Soldier; unit: Unit }> {
    const out = new Map<string, { soldier: Soldier; unit: Unit }>();
    for (const id of [...e.attackerUnits, ...e.defenderUnits]) {
      const u = this.unit(world, id);
      for (const s of u.soldiers ?? []) out.set(s.id, { soldier: s, unit: u });
    }
    return out;
  }

  /**
   * A man's wounds this minute inside, onto the man outside — what he took
   * here, added to what he has, as `units.ts` floors a wound (decision 26).
   */
  private writeBack(m: InteriorFight["soldiers"][number], damageBefore: number, wasOut: boolean, s: Soldier, u: Unit, turn: number): void {
    const taken = m.damage - damageBefore;
    if (taken > 0) {
      if (s.damagePoints < CASUALTY_RULES.bleedingThreshold && s.damagePoints + taken >= CASUALTY_RULES.bleedingThreshold) s.bleedingSinceTurn = turn;
      s.damagePoints += taken;
      if (m.wound) s.wound = m.wound;
      u.hitThisTurn = true;
    }
    if (m.out && !wasOut && !m.withdrew && !s.neutralized) {
      s.neutralized = true;
      if (m.yielded) s.captured = true; // a prisoner: out of the battle, not hit (decision 103)
      if (m.wound) s.wound = m.wound;
      if (m.outBy) s.outBy = m.outBy;
      if (!m.yielded) u.hitThisTurn = true;
    }
  }
}
