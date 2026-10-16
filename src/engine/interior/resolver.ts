import type { Rng } from "../rng.js";
import type { Side } from "../types.js";
import { ASSAULT, CASUALTY_RULES, WOUND_SEVERITY } from "../data/casualties.js";
import { CLOSE_QUARTERS } from "../data/interior.js";
import { ENCLOSED_BLAST_FACTOR } from "../data/structures.js";
import { CELL_KIND, type FloorPlan } from "./floorPlan.js";

/**
 * The fight inside a building, soldier by soldier (README, rules decision
 * 96; docs/urban-design.md). Headless: it resolves a fight on a floor plan
 * second by second and says what happened, and the hand-played screen will
 * only draw it. Nobody moves a soldier. Each commander gives a plan — the
 * attacker how he goes in, the defender where his men stand — and the men
 * act by doctrine:
 *
 * - **The attacker** clears by the battle drill Enter and Clear a Room
 *   (TC 3-21.76 (2025), ch. 8, 07-SQD-D9509): a four-man team stacks at the
 *   door, a grenade goes in first if the plan says so, #1 and #2 take the
 *   corners either side of the door and #3 and #4 the far ones (ATP 3-06.11
 *   (2024), paras C-66, C-67), "CLEAR", the room is consolidated, and the
 *   team takes the next, storey by storey — from the ground up through the
 *   front door, or from the top down. It moves only through rooms already
 *   cleared, the doors between them and the street: fire teams "can only
 *   secure where they are, not where they have been" (para C-79).
 * - **The defender** holds the rooms his plan puts him in and watches their
 *   doorways, which is why the man who comes through first is the one shot
 *   (the fatal funnel, paras C-24, C-39).
 *
 * Every number is in `CLOSE_QUARTERS` (data/interior.ts), and every one is
 * ours. Not yet coupled to the outside map (urban-design.md, order of
 * work): a fight is resolved on its own from a plan and two sets of men.
 *
 * Plain arithmetic only, like the plan it is fought on (eslint.config.js):
 * a fight must come out the same on any device.
 */

/** How a man was hit, by the author's severity roll (decision 26), as `Soldier.wound` records it outside. */
export type InteriorWound = "light" | "serious" | "killed";

/** A man inside. */
export interface InteriorSoldier {
  id: string;
  side: Side;
  storey: number;
  cell: number;
  /** Damage points (the document's נק"פ), floored by the wound as decision 26 floors them outside. */
  damage: number;
  wound?: InteriorWound;
  out: boolean;
  killed: boolean;
  grenades: number;
  /** Stunned while `second < stunnedUntil`: a grenade's blast at second t stuns him for `stunSeconds`. */
  stunnedUntil: number;
  /** In a prepared position (a loophole, a barricade): harder to hit. */
  prepared: boolean;
  /** The enemy he has in his sights, and since when; he fires once he has had him `reactionSeconds`. */
  aim?: { target: string; since: number };
}

/** Where the defender puts a man. */
export interface DefenderPost {
  id: string;
  storey: number;
  cell: number;
  prepared?: boolean;
}

/** How the attacker goes in. */
export interface AttackPlan {
  /** Through the front door and up, or onto the roof and down (top-down: TC 3-21.75 (2013), para 8-12). */
  entry: "door" | "top";
  /** A grenade into each room before entering it, while they last. */
  grenades: boolean;
  /** Teams of up to four, leader first. Each team clears its own rooms. */
  teams: string[][];
}

export interface InteriorFightInput {
  plan: FloorPlan;
  attack: AttackPlan;
  defence: DefenderPost[];
  attackerSide?: Side;
}

/**
 * How it ended: every room cleared; every attacker down; or nobody left
 * able to go on (`standoff`) — no team with a room it can reach, or the
 * clock (`maxSeconds`) run out.
 */
export type InteriorOutcome = "cleared" | "repulsed" | "standoff";

export interface InteriorResult {
  outcome: InteriorOutcome;
  /** How long it took, in seconds. */
  seconds: number;
  roomsCleared: number;
  rooms: number;
  /** Rooms the plan says no man can reach (`Storey.cutOff`): counted as cleared, since nobody can hold them either. */
  roomsCutOff: number;
  attackers: { men: number; out: number; killed: number };
  defenders: { men: number; out: number; killed: number };
  /** Hits that wounded or put out a man still in the fight, by what caused them. */
  hits: { fire: number; grenade: number };
  grenadesThrown: number;
}

type Phase = "pick" | "stack" | "enter" | "consolidate" | "stairs" | "done";

interface Team {
  members: InteriorSoldier[];
  storey: number;
  phase: Phase;
  /** The room being taken, and the cell it is entered by (a door, or the stairs). */
  room: number;
  approach: number;
  points: number[];
  /** When consolidating or on the stairs: the second it ends. */
  until: number;
  /** How many of the living have gone through the way in, a man a second. */
  entered: number;
  /** On their points and the room still not clear: going round to the part they cannot see. */
  searching: boolean;
}

const { outside: OUTSIDE, floor: FLOOR, wall: WALL, window: WINDOW, door: DOOR, stair: STAIR } = CELL_KIND;
const OUT_OF_DOORS = -2;
/**
 * Ten minutes with no room taken and no team going for one: nobody can go
 * on. Not a rule of the fight — a fight that gets here has no move left in
 * it — only a quicker end than `maxSeconds`.
 */
const STALL_SECONDS = 600;

/** Resolve a fight inside a building to its end. */
export function resolveInteriorFight(input: InteriorFightInput, rng: Rng): InteriorResult {
  const fight = new InteriorFight(input, rng);
  while (!fight.finished) fight.tick();
  return fight.result();
}

/** Stunned at `second`? */
export function isStunned(m: InteriorSoldier, second: number): boolean {
  return second < m.stunnedUntil;
}

/**
 * A hit on a man, by the author's severity roll (decision 26), as
 * `units.ts` applies it outside: light (+2 damage points, out at 8),
 * serious (out, at least the bleeding threshold) or killed (out, at least
 * the neutralise threshold). Returns false, and draws nothing, for a man
 * already out.
 */
export function woundSoldier(m: InteriorSoldier, rng: Rng): boolean {
  if (m.out) return false;
  const roll = rng.die(10);
  if (roll <= WOUND_SEVERITY.light) {
    m.damage += WOUND_SEVERITY.lightWoundPoints;
    m.out = m.damage >= CASUALTY_RULES.neutralizeThreshold;
    m.wound = m.out ? "serious" : "light";
  } else {
    const killed = roll > WOUND_SEVERITY.light + WOUND_SEVERITY.serious;
    m.damage = Math.max(m.damage, killed ? CASUALTY_RULES.neutralizeThreshold : CASUALTY_RULES.bleedingThreshold);
    m.wound = killed ? "killed" : "serious";
    m.out = true;
    m.killed = killed;
  }
  if (m.out) m.aim = undefined;
  return true;
}

/**
 * A fight in progress, a second a tick. `resolveInteriorFight` runs one to
 * its end; the coupling to the outside turn will run it a turn's worth of
 * ticks at a time.
 */
export class InteriorFight {
  readonly plan: FloorPlan;
  readonly soldiers: InteriorSoldier[] = [];
  readonly cleared: Uint8Array[];
  private readonly teams: Team[] = [];
  private readonly order: number[];
  private readonly rng: Rng;
  private readonly attackerSide: Side;
  second = 0;
  finished = false;
  private outcome: InteriorOutcome = "standoff";
  private hits = { fire: 0, grenade: 0 };
  private grenadesThrown = 0;
  /** The last second a room was taken or a team went for one: a fight that stops moving for long is a standoff. */
  private lastProgress = 0;
  private readonly roomsCutOff: number;
  private readonly entry: "door" | "top";
  private readonly grenadesPlanned: boolean;
  private readonly steps: number;

  constructor(input: InteriorFightInput, rng: Rng) {
    this.plan = input.plan;
    this.rng = rng;
    this.attackerSide = input.attackerSide ?? "BLUE";
    const defenderSide: Side = this.attackerSide === "BLUE" ? "RED" : "BLUE";
    this.entry = input.attack.entry;
    this.grenadesPlanned = input.attack.grenades;
    this.steps = Math.max(1, Math.round((CLOSE_QUARTERS.walkMps * CLOSE_QUARTERS.tickSeconds) / this.plan.cellM));
    this.cleared = this.plan.storeys.map((s) => new Uint8Array(s.rooms.length));
    // A room nobody can reach is nobody's to hold: it counts as cleared.
    let cutOff = 0;
    this.plan.storeys.forEach((s, k) => { for (const r of s.cutOff) { this.cleared[k]![r] = 1; cutOff++; } });
    this.roomsCutOff = cutOff;
    const top = this.plan.storeys.length - 1;
    this.order = [];
    for (let k = 0; k <= top; k++) this.order.push(this.entry === "door" ? k : top - k);

    // The defenders where their plan puts them.
    for (const post of input.defence) {
      const kind = this.plan.storeys[post.storey]?.cells[post.cell];
      if (kind !== FLOOR && kind !== STAIR) throw new Error(`InteriorFight: ${post.id} is not posted on a floor`);
      this.soldiers.push(this.man(post.id, defenderSide, post.storey, post.cell, post.prepared ?? false));
    }
    // The attackers at their way in: outside the front door, or at the head of the stairs.
    const start = this.entryCell();
    const firstStorey = this.order[0]!;
    for (const ids of input.attack.teams) {
      const members = ids.map((id) => {
        const m = this.man(id, this.attackerSide, firstStorey, start, false);
        m.grenades = this.grenadesPlanned ? CLOSE_QUARTERS.grenadesEach : 0;
        this.soldiers.push(m);
        return m;
      });
      this.teams.push({ members, storey: firstStorey, phase: "pick", room: -1, approach: -1, points: [], until: 0, entered: 0, searching: false });
    }
    // Coming down from the roof, the first team takes the top storey's stair
    // room — a grenade down the stairwell first, if planned — and the rest
    // follow once it is clear.
    const first = this.teams[0];
    if (this.entry === "top" && first) {
      this.assault(first, this.stairRoom(firstStorey), start, false);
      if (this.grenadesPlanned) this.grenade(first, first.members, 1);
    }
  }

  private man(id: string, side: Side, storey: number, cell: number, prepared: boolean): InteriorSoldier {
    return { id, side, storey, cell, damage: 0, out: false, killed: false, grenades: 0, stunnedUntil: 0, prepared };
  }

  /** The cell the attack starts from. */
  private entryCell(): number {
    const p = this.plan;
    if (this.entry === "top") {
      if (!p.stairwell) throw new Error("InteriorFight: a top-down entry needs stairs to come down");
      return p.stairwell.y * p.width + p.stairwell.x;
    }
    const door = p.outsideDoors[0];
    if (door === undefined) throw new Error("InteriorFight: the building has no door to the street");
    // The street side of the door.
    const cells = p.storeys[0]!.cells;
    for (const j of this.around(door)) if (cells[j] === OUTSIDE) return j;
    return door;
  }

  private stairRoom(storey: number): number {
    const s = this.plan.stairwell!;
    return this.plan.storeys[storey]!.roomOf[s.y * this.plan.width + s.x]!;
  }

  private around(i: number): number[] {
    const w = this.plan.width, x = i % w, n = w * this.plan.height;
    const out: number[] = [];
    if (x > 0) out.push(i - 1);
    if (x < w - 1) out.push(i + 1);
    if (i >= w) out.push(i - w);
    if (i + w < n) out.push(i + w);
    return out;
  }

  private alive(side: Side): InteriorSoldier[] {
    return this.soldiers.filter((s) => s.side === side && !s.out);
  }

  /** One second of the fight: the attacker's drill moves, everyone looks, everyone who can fires. */
  tick(): void {
    if (this.finished) return;
    for (const team of this.teams) this.drill(team);
    this.fire();
    this.second += CLOSE_QUARTERS.tickSeconds;
    this.judge();
  }

  private judge(): void {
    if (this.alive(this.attackerSide).length === 0) { this.outcome = "repulsed"; this.finished = true; return; }
    if (this.cleared.every((c) => c.every((v) => v === 1))) { this.outcome = "cleared"; this.finished = true; return; }
    const stuck = this.teams.every((t) => t.phase === "done") || this.second - this.lastProgress > STALL_SECONDS;
    if (stuck || this.second >= CLOSE_QUARTERS.maxSeconds) { this.outcome = "standoff"; this.finished = true; }
  }

  // ---- the drill ---------------------------------------------------------

  private drill(team: Team): void {
    const men = team.members.filter((m) => !m.out);
    if (men.length === 0) { team.phase = "done"; return; }
    switch (team.phase) {
      case "done":
        return;
      case "pick":
        return this.pick(team, men);
      case "stack":
        return this.stack(team, men);
      case "enter":
        return this.enter(team, men);
      case "consolidate":
        if (this.enemiesIn(team.storey, team.room).length > 0) { team.phase = "enter"; return; } // still a fight in it
        if (this.second >= team.until) {
          this.cleared[team.storey]![team.room] = 1;
          this.lastProgress = this.second;
          team.phase = "pick";
        }
        return;
      case "stairs":
        if (this.second < team.until) return;
        return this.arrive(team, men);
    }
  }

  /** Rooms another team is taking on this storey. */
  private claimed(team: Team, storey: number): Set<number> {
    const busy: Phase[] = ["stack", "enter", "consolidate"];
    return new Set(this.teams.filter((t) => t !== team && t.storey === storey && busy.includes(t.phase)).map((t) => t.room));
  }

  /** Choose the next room: the nearest uncleared room through a door from ground already held. */
  private pick(team: Team, men: InteriorSoldier[]): void {
    const storey = team.storey;
    const leader = men[0]!;
    const plan = this.plan.storeys[storey]!;
    const claimed = this.claimed(team, storey);
    // Standing in a room nobody holds — the team that was taking it is gone
    // — it is the room to take.
    const here = plan.roomOf[leader.cell]!;
    if (here >= 0 && !this.cleared[storey]![here] && !claimed.has(here)) return this.assault(team, here, leader.cell, false);
    // Through held ground only, so the way to the door is the way the team can walk.
    const field = this.distances(storey, leader.cell, -1);
    let best = -1, bestRoom = -1, bestD = Infinity;
    for (let i = 0; i < plan.cells.length; i++) {
      if (plan.cells[i] !== DOOR) continue;
      const sides = this.sidesOf(storey, i);
      for (const [held, room] of [[sides[0], sides[1]], [sides[1], sides[0]]] as const) {
        if (room === undefined || held === undefined || room < 0) continue;
        if (this.cleared[storey]![room] || claimed.has(room)) continue;
        if (!(held === OUT_OF_DOORS ? storey === 0 : this.cleared[storey]![held])) continue;
        const d = field[i]!;
        if (d >= 0 && d < bestD) { bestD = d; best = i; bestRoom = room; }
      }
    }
    if (best >= 0) return this.assault(team, bestRoom, best, true);
    // Nothing to take here that this team can reach. Rooms still being taken
    // by another team: wait for them. None: on to the next storey.
    if (!this.cleared[storey]!.every((v) => v === 1)) return; // another team's rooms open the way: wait for them
    const k = this.order.indexOf(storey);
    const next = this.order[k + 1];
    const s = this.plan.stairwell;
    if (next === undefined || !s) { team.phase = "done"; return; }
    const stairs = s.y * this.plan.width + s.x;
    const toStairs = this.distances(storey, stairs, -1);
    if (men.every((m) => toStairs[m.cell]! >= 0 && toStairs[m.cell]! <= 2)) {
      team.phase = "stairs";
      team.until = this.second + CLOSE_QUARTERS.stairSeconds;
      return;
    }
    for (const m of men) this.walk(m, stairs, -1, 0);
  }

  private assault(team: Team, room: number, approach: number, viaDoor: boolean): void {
    team.room = room;
    team.approach = approach;
    team.points = this.pointsOfDomination(team.storey, room, approach);
    team.entered = 0;
    team.searching = false;
    team.phase = viaDoor ? "stack" : "enter";
    this.lastProgress = this.second;
  }

  /** The stack: up to the near side of the door, then a grenade if planned, then in. */
  private stack(team: Team, men: InteriorSoldier[]): void {
    const toDoor = this.distances(team.storey, team.approach, -1);
    if (!men.every((m) => toDoor[m.cell]! >= 0 && toDoor[m.cell]! <= 3)) {
      for (const m of men) this.walk(m, team.approach, -1, 1);
      if (men.some((m) => toDoor[m.cell]! < 0)) team.phase = "pick"; // cut off from the door: choose again
      return;
    }
    if (this.grenadesPlanned) this.grenade(team, men, 1);
    team.phase = "enter";
  }

  /** Arriving by the stairs: a grenade up or down the stairwell first, then in — unless another team has the stair room. */
  private arrive(team: Team, men: InteriorSoldier[]): void {
    const from = team.storey;
    const to = this.order[this.order.indexOf(from) + 1]!;
    const s = this.plan.stairwell!;
    const stairs = s.y * this.plan.width + s.x;
    team.storey = to;
    for (const m of men) { m.storey = to; m.cell = stairs; m.aim = undefined; }
    const room = this.stairRoom(to);
    if (this.cleared[to]![room] || this.claimed(team, to).has(room)) { team.phase = "pick"; return; }
    this.assault(team, room, stairs, false);
    if (this.grenadesPlanned) this.grenade(team, men, to > from ? CLOSE_QUARTERS.grenadeUpstairsFactor : 1);
  }

  /** Into the room, a man a second, each to his point; when all are in and it is quiet, "CLEAR". */
  private enter(team: Team, men: InteriorSoldier[]): void {
    if (team.entered < men.length) team.entered++;
    const enemies = this.enemiesIn(team.storey, team.room);
    if (team.searching && enemies.length > 0) {
      for (const m of men) this.walk(m, enemies[0]!.cell, team.room, 0);
    } else {
      men.forEach((m, k) => { if (k < team.entered) this.walk(m, team.points[k % team.points.length]!, team.room, 0); });
    }
    const roomOf = this.plan.storeys[team.storey]!.roomOf;
    const inside = men.every((m) => roomOf[m.cell] === team.room);
    // On their points and still not clear: a corner they cannot see from
    // there. A room is not clear until all of it has been looked into
    // (ATP 3-06.11 (2024), app. C), so they go round to it.
    const onPoints = team.entered >= men.length && men.every((m, k) => this.near(m.cell, team.points[k % team.points.length]!, 1));
    if (inside && onPoints && enemies.length > 0) team.searching = true;
    if (inside && enemies.length === 0) {
      team.phase = "consolidate";
      team.until = this.second + CLOSE_QUARTERS.consolidateSeconds;
    }
  }

  private grenade(team: Team, men: InteriorSoldier[], factor: number): void {
    const thrower = men.find((m) => m.grenades > 0 && !isStunned(m, this.second));
    if (!thrower) return;
    thrower.grenades--;
    this.grenadesThrown++;
    const chance = Math.min(1, ASSAULT.grenadeHitChance * ENCLOSED_BLAST_FACTOR * factor);
    for (const enemy of this.enemiesIn(team.storey, team.room)) {
      if (this.rng.chance(chance)) { if (woundSoldier(enemy, this.rng)) this.hits.grenade++; }
      else enemy.stunnedUntil = this.second + CLOSE_QUARTERS.stunSeconds;
    }
    if (this.rng.chance(ASSAULT.grenadeSelfHitChance) && woundSoldier(thrower, this.rng)) this.hits.grenade++;
  }

  /**
   * The points of domination (ATP 3-06.11 (2024), paras C-66, C-67): the
   * room's corners — the two nearest the way in for #1 and #2, the far two
   * for #3 and #4. A corner is the room's cell nearest the corner of the
   * room's extent.
   */
  private pointsOfDomination(storey: number, room: number, approach: number): number[] {
    const plan = this.plan.storeys[storey]!;
    const w = this.plan.width;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const cells: number[] = [];
    plan.roomOf.forEach((r, i) => {
      if (r !== room) return;
      cells.push(i);
      const x = i % w, y = (i - x) / w;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    });
    const nearest = (cx: number, cy: number) => {
      let best = cells[0]!, bd = Infinity;
      for (const i of cells) {
        const x = i % w, y = (i - x) / w, d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    };
    const corners = [nearest(x0, y0), nearest(x1, y0), nearest(x0, y1), nearest(x1, y1)];
    const ax = approach % w, ay = (approach - ax) / w;
    const far = (i: number) => { const x = i % w, y = (i - x) / w; return (x - ax) * (x - ax) + (y - ay) * (y - ay); };
    return corners.map((c, k) => ({ c, k, d: far(c) })).sort((p, q) => p.d - q.d || p.k - q.k).map((p) => p.c);
  }

  // ---- ground ------------------------------------------------------------

  /** The two sides of a door: rooms, or `OUT_OF_DOORS`. */
  private sidesOf(storey: number, i: number): [number | undefined, number | undefined] {
    const plan = this.plan.storeys[storey]!;
    const w = this.plan.width, x = i % w;
    const side = (j: number) => (plan.cells[j] === OUTSIDE ? OUT_OF_DOORS : plan.roomOf[j]! >= 0 ? plan.roomOf[j]! : undefined);
    if (x > 0 && x < w - 1) {
      const a = side(i - 1), b = side(i + 1);
      if (a !== undefined && b !== undefined && a !== b) return [a, b];
    }
    if (i >= w && i + w < plan.cells.length) {
      const a = side(i - w), b = side(i + w);
      if (a !== undefined && b !== undefined && a !== b) return [a, b];
    }
    return [undefined, undefined];
  }

  /**
   * Steps from `from` to every cell an attacker may walk: the street (on the
   * ground floor), doors, and the rooms already cleared — plus `room`, the
   * one being taken. -1 where he may not go.
   */
  private distances(storey: number, from: number, room: number): Int32Array {
    const cells = this.plan.storeys[storey]!.cells;
    const roomOf = this.plan.storeys[storey]!.roomOf;
    const cleared = this.cleared[storey]!;
    const n = this.plan.width * this.plan.height;
    const may = (j: number) => {
      const k = cells[j];
      if (k === DOOR) return true;
      if (k === OUTSIDE) return storey === 0;
      if (k !== FLOOR && k !== STAIR) return false;
      const r = roomOf[j]!;
      return r === room || cleared[r] === 1;
    };
    const d = new Int32Array(n).fill(-1);
    const queue = new Int32Array(n);
    let head = 0, tail = 0;
    d[from] = 0;
    queue[tail++] = from;
    while (head < tail) {
      const i = queue[head++]!;
      for (const j of this.around(i)) {
        if (d[j] !== -1 || !may(j)) continue;
        d[j] = d[i]! + 1;
        queue[tail++] = j;
      }
    }
    return d;
  }

  private near(a: number, b: number, steps: number): boolean {
    const w = this.plan.width;
    const ax = a % w, ay = (a - ax) / w, bx = b % w, by = (b - bx) / w;
    return (ax - bx) * (ax - bx) + (ay - by) * (ay - by) <= steps * steps;
  }

  /**
   * Walk a man up to a second's pace toward `goal`, through held ground and
   * `room`, stopping `short` steps from it (the stack waits a step outside
   * the door).
   */
  private walk(m: InteriorSoldier, goal: number, room: number, short: number): void {
    if (isStunned(m, this.second)) return;
    const field = this.distances(m.storey, goal, room);
    for (let k = 0; k < this.steps; k++) {
      const here = field[m.cell]!;
      if (here < 0 || here <= short) return;
      let next = m.cell;
      for (const j of this.around(m.cell)) if (field[j]! >= 0 && field[j]! < field[next]!) next = j;
      if (next === m.cell) return;
      m.cell = next;
    }
  }

  // ---- sight and fire ----------------------------------------------------

  /** True when nothing solid lies between two cells of one storey. */
  private sees(storey: number, a: number, b: number): boolean {
    const cells = this.plan.storeys[storey]!.cells;
    const w = this.plan.width;
    let x = a % w, y = (a - x) / w;
    const bx = b % w, by = (b - bx) / w;
    const dx = Math.abs(bx - x), dy = -Math.abs(by - y), sx = x < bx ? 1 : -1, sy = y < by ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (x === bx && y === by) return true;
      const i = y * w + x;
      if (i !== a && (cells[i] === WALL || cells[i] === WINDOW)) return false;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }

  private enemiesIn(storey: number, room: number): InteriorSoldier[] {
    const roomOf = this.plan.storeys[storey]!.roomOf;
    return this.soldiers.filter((s) => s.side !== this.attackerSide && !s.out && s.storey === storey && roomOf[s.cell] === room);
  }

  /** Does `m` watch the cell `c` — his own room, or a doorway into it? A man watching a way in fires the second an enemy fills it. */
  private watching(m: InteriorSoldier, c: number): boolean {
    if (m.side === this.attackerSide) return false;
    const roomOf = this.plan.storeys[m.storey]!.roomOf;
    const mine = roomOf[m.cell]!;
    if (roomOf[c] === mine) return true;
    return this.plan.storeys[m.storey]!.cells[c] === DOOR && this.around(c).some((j) => roomOf[j] === mine);
  }

  /**
   * Everyone who can see an enemy aims — at the one already in his sights
   * while he can still see him, else the nearest — and everyone who has had
   * him long enough fires. All shots are taken from the second's start, so
   * a man hit this second still fires; the hits land together.
   */
  private fire(): void {
    const shots: { at: InteriorSoldier; chance: number }[] = [];
    const w = this.plan.width, cellM = this.plan.cellM;
    const byId = new Map(this.soldiers.map((s) => [s.id, s]));
    for (const m of this.soldiers) {
      if (m.out || isStunned(m, this.second)) continue;
      const mx = m.cell % w, my = (m.cell - mx) / w;
      const dist2 = (e: InteriorSoldier) => { const ex = e.cell % w, ey = (e.cell - ex) / w; return (ex - mx) * (ex - mx) + (ey - my) * (ey - my); };
      let target: InteriorSoldier | undefined;
      const held = m.aim ? byId.get(m.aim.target) : undefined;
      if (held && !held.out && held.storey === m.storey && this.sees(m.storey, m.cell, held.cell)) {
        target = held;
      } else {
        let best = Infinity;
        for (const e of this.soldiers) {
          if (e.out || e.side === m.side || e.storey !== m.storey) continue;
          const d2 = dist2(e);
          if (d2 >= best || !this.sees(m.storey, m.cell, e.cell)) continue;
          best = d2;
          target = e;
        }
      }
      if (!target) { m.aim = undefined; continue; }
      if (!m.aim || m.aim.target !== target.id) {
        m.aim = { target: target.id, since: this.watching(m, target.cell) ? this.second - CLOSE_QUARTERS.reactionSeconds : this.second };
      }
      if (this.second - m.aim.since < CLOSE_QUARTERS.reactionSeconds) continue;
      const metres2 = dist2(target) * cellM * cellM;
      let chance = 0;
      for (const band of CLOSE_QUARTERS.hitBySecond) {
        if (metres2 <= band.maxRangeM * band.maxRangeM) { chance = band.chance; break; }
      }
      if (target.prepared) chance *= CLOSE_QUARTERS.coverFactor;
      shots.push({ at: target, chance });
    }
    for (const shot of shots) {
      if (this.rng.chance(shot.chance) && woundSoldier(shot.at, this.rng)) this.hits.fire++;
    }
  }

  result(): InteriorResult {
    const count = (attackers: boolean) => {
      const men = this.soldiers.filter((s) => attackers === (s.side === this.attackerSide));
      return { men: men.length, out: men.filter((s) => s.out).length, killed: men.filter((s) => s.killed).length };
    };
    let rooms = 0, roomsCleared = 0;
    for (const c of this.cleared) { rooms += c.length; for (const v of c) roomsCleared += v; }
    return {
      outcome: this.outcome,
      seconds: this.second,
      roomsCleared,
      rooms,
      roomsCutOff: this.roomsCutOff,
      attackers: count(true),
      defenders: count(false),
      hits: { ...this.hits },
      grenadesThrown: this.grenadesThrown,
    };
  }
}

/**
 * A defence by default, for the harness: the men spread over the rooms a
 * man can reach, a man to a room as far as they go, each at the cell of his
 * room farthest from its doors — "back from the windows in the shadows of
 * the room" (ATTP 3-06.11 (2011), para 6-50). Drawn from `rng`.
 */
export function defaultDefence(plan: FloorPlan, ids: readonly string[], rng: Rng, prepared = false): DefenderPost[] {
  const rooms: { storey: number; room: number }[] = [];
  plan.storeys.forEach((s, storey) => s.rooms.forEach((r) => { if (!s.cutOff.includes(r.id)) rooms.push({ storey, room: r.id }); }));
  const posts: DefenderPost[] = [];
  const free = rooms.slice();
  for (const id of ids) {
    if (free.length === 0) free.push(...rooms);
    const k = rng.int(0, free.length - 1);
    const { storey, room } = free.splice(k, 1)[0]!;
    posts.push({ id, storey, cell: backOfRoom(plan, storey, room), prepared });
  }
  return posts;
}

/** The cell of a room farthest, in steps, from every door into it. */
function backOfRoom(plan: FloorPlan, storey: number, room: number): number {
  const s = plan.storeys[storey]!;
  const w = plan.width, n = s.cells.length;
  const d = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  for (let i = 0; i < n; i++) {
    if (s.cells[i] !== DOOR) continue;
    const x = i % w;
    const near = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
    if (near.some((j) => j >= 0 && j < n && s.roomOf[j] === room)) { d[i] = 0; queue[tail++] = i; }
  }
  let best = -1;
  s.roomOf.forEach((r, i) => { if (r === room && best < 0) best = i; });
  while (head < tail) {
    const i = queue[head++]!;
    const x = i % w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
      if (j < 0 || j >= n || d[j] !== -1 || s.roomOf[j] !== room) continue;
      d[j] = d[i]! + 1;
      queue[tail++] = j;
      if (d[best] === -1 || d[j]! > d[best]!) best = j;
    }
  }
  return best;
}
