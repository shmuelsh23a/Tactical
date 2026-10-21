import type { Rng } from "../rng.js";
import type { Side } from "../types.js";
import { ASSAULT, CASUALTY_RULES, WOUND_SEVERITY } from "../data/casualties.js";
import { UNREADY } from "../data/directFire.js";
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
  /** What put him out: a grenade's blast or a bullet (the HE share, balance.md). */
  outBy?: "smallArms" | "explosive";
  out: boolean;
  killed: boolean;
  grenades: number;
  /** Stunned while `second < stunnedUntil`: a grenade's blast at second t stuns him for `stunSeconds`. */
  stunnedUntil: number;
  /** In a prepared position (a loophole, a barricade): harder to hit. */
  prepared: boolean;
  /** The enemy he has in his sights, and since when; he fires once he has had him `reactionSeconds`. */
  aim?: { target: string; since: number };
  /** A defender who fell back out of the building (decision 96's top-down ruling): gone from this fight, not hit. */
  withdrew?: boolean;
  /** An attacker not yet in — on the roof, waiting for the hatch: neither seen nor seeing. */
  waiting?: boolean;
  /** Caught unready until this second: an enemy came in by a way he was not watching (decision 85's figures). */
  unreadyUntil?: number;
  /** A defender's last look at whether to fall back: rooms taken on his storey then. He looks again only when another falls. */
  lookedAt?: number;
  /** Has had an enemy in his sights: once in the fight, he is not caught unready again. */
  engaged?: boolean;
  /** Came down the stairs onto this storey and is still on them: arrived from above. */
  fromAbove?: boolean;
  /** A defender falling back: where he is going, and the second he comes off the stairs if on them. */
  retreat?: { goal: number; kind: "room" | "stairs" | "out"; offStairs?: number };
  /** A defender who holds to the last rather than falls back: his force's plan (decision 101). Absent: the fight's `defenderFallback`. */
  holds?: boolean;
  /** A defender posted at a window (decision 98): the window cell, and the cell he stands on beside it. He is at it while he stands there. */
  window?: { cell: number; at: number };
  /** Broken, as morale outside has judged him (decision 103): he fires no more; an attacker leaves, a defender falls back or, found, gives himself up. */
  broken?: boolean;
  /** A broken defender who gave himself up, cornered (decision 103): out of the fight, a prisoner, not hit. */
  yielded?: boolean;
}

/** Where the defender puts a man. */
export interface DefenderPost {
  id: string;
  storey: number;
  cell: number;
  prepared?: boolean;
  /** At a window (decision 98): the window cell beside `cell`. He fires out through it and is seen through it. */
  window?: number;
}

/** How the attacker goes in. */
export interface AttackPlan {
  /** Through the front door and up, or onto the roof and down (top-down: TC 3-21.75 (2013), para 8-12). */
  entry: "door" | "top";
  /** A grenade into each room before entering it, while they last. */
  grenades: boolean;
  /** Teams of up to four, leader first. Each team clears its own rooms. */
  teams: string[][];
  /** How a top-down attack reaches the roof (ATP 3-06.11 (2024), para C-30). All take `roofAccessSeconds` for now. */
  roofAccess?: "adjacentRoof" | "ladder" | "vehicle";
}

export interface InteriorFightInput {
  plan: FloorPlan;
  attack: AttackPlan;
  defence: DefenderPost[];
  /**
   * Where the defender expects the attack from (his plan): from below — the
   * ground floor and the stairs coming up — by default, as doctrine says an
   * enemy does (ATTP 3-06.11 (2011), paras 7-146, 7-147), or from above.
   */
  defenderExpects?: "below" | "above";
  /** Fall back from a room whose neighbour is taken (the default), or hold to the last. */
  defenderFallback?: "fallBack" | "hold";
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
  defenders: { men: number; out: number; killed: number; withdrew: number; yielded: number };
  /** Hits that wounded or put out a man still in the fight, by what caused them. */
  hits: { fire: number; grenade: number };
  grenadesThrown: number;
}

type Phase = "roof" | "pick" | "stack" | "enter" | "consolidate" | "stairs" | "done";

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
  /** Shots fired by or at the team while taking this room: a room taken under fire is reorganised in. */
  contact: boolean;
  /** Halted until this second, seeing to its wounded. */
  halted: number;
  /** A grenade into each room before entering it: its force's plan, which may change at any turn (decision 101). */
  grenades: boolean;
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
export function woundSoldier(m: InteriorSoldier, rng: Rng, cause: "smallArms" | "explosive" = "smallArms"): boolean {
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
  if (m.out) { m.aim = undefined; m.outBy = cause; }
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
  private readonly expects: "below" | "above";
  private readonly fallback: "fallBack" | "hold";
  /** Storeys where the attackers' noise on the stairs has turned the defenders to watch them from above (C-103). */
  private readonly alerted: boolean[];
  /** Per storey, steps from the way the defender expects the attack in: which doorway of a room he watches. */
  private readonly expectField: Int32Array[];
  private readonly watched = new Map<string, number[]>();

  constructor(input: InteriorFightInput, rng: Rng) {
    this.plan = input.plan;
    this.rng = rng;
    this.attackerSide = input.attackerSide ?? "BLUE";
    const defenderSide: Side = this.attackerSide === "BLUE" ? "RED" : "BLUE";
    this.entry = input.attack.entry;
    this.grenadesPlanned = input.attack.grenades;
    this.expects = input.defenderExpects ?? "below";
    this.fallback = input.defenderFallback ?? "fallBack";
    this.alerted = this.plan.storeys.map(() => false);
    this.expectField = this.plan.storeys.map((_, k) => this.fieldFromExpected(k));
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
      const m = this.man(post.id, defenderSide, post.storey, post.cell, post.prepared ?? false);
      if (post.window !== undefined) {
        if (this.plan.storeys[post.storey]!.cells[post.window] !== WINDOW || !this.around(post.window).includes(post.cell)) throw new Error(`InteriorFight: ${post.id} is not beside his window`);
        m.window = { cell: post.window, at: post.cell };
      }
      this.soldiers.push(m);
    }
    // The attackers at their way in: outside the front door, or at the head of the stairs.
    const start = this.entryCell();
    const firstStorey = this.order[0]!;
    for (const ids of input.attack.teams) {
      const members = ids.map((id) => {
        const m = this.man(id, this.attackerSide, firstStorey, start, false);
        // Every man carries his grenades; the plan says whether he throws them (decision 101).
        m.grenades = CLOSE_QUARTERS.grenadesEach;
        this.soldiers.push(m);
        return m;
      });
      this.teams.push({ members, storey: firstStorey, phase: "pick", room: -1, approach: -1, points: [], until: 0, entered: 0, searching: false, contact: false, halted: 0, grenades: this.grenadesPlanned });
    }
    // Coming down from the roof: getting up there takes time, and the teams
    // come through the hatch one at a time (C-30, "force size is more
    // limited") — the first takes the top storey's stair room, a grenade down
    // the stairwell first if planned, and each next one follows once that
    // room is held and the interval has passed.
    if (this.entry === "top") {
      this.teams.forEach((team, k) => {
        team.phase = "roof";
        // The first after the climb; each next one's turn is set when the one before goes through.
        team.until = k === 0 ? CLOSE_QUARTERS.roofAccessSeconds : Number.MAX_SAFE_INTEGER;
        for (const m of team.members) m.waiting = true;
      });
      this.lastProgress = CLOSE_QUARTERS.roofAccessSeconds;
    }
  }

  private stairsFieldCache: Int32Array[] = [];
  /** Steps on a storey from its stairs. */
  private stairsField(storey: number): Int32Array {
    return (this.stairsFieldCache[storey] ??= this.fieldFromExpected(storey, true));
  }

  /** Steps on a storey from where the defender expects the attack to come in: the street doors below, else the stairs. */
  private fieldFromExpected(storey: number, stairs = false): Int32Array {
    const p = this.plan, w = p.width, cells = p.storeys[storey]!.cells;
    const n = cells.length;
    const sources: number[] = [];
    if (!stairs && storey === 0 && this.expects === "below") sources.push(...p.outsideDoors);
    else if (p.stairwell) for (let y = p.stairwell.y; y < p.stairwell.y + p.stairwell.h; y++)
      for (let x = p.stairwell.x; x < p.stairwell.x + p.stairwell.w; x++) sources.push(y * w + x);
    if (sources.length === 0) sources.push(...p.outsideDoors);
    const d = new Int32Array(n).fill(-1);
    const queue = new Int32Array(n);
    let head = 0, tail = 0;
    for (const c of sources) { d[c] = 0; queue[tail++] = c; }
    while (head < tail) {
      const i = queue[head++]!;
      for (const j of this.around(i)) {
        const k = cells[j];
        if (d[j] !== -1 || (k !== FLOOR && k !== STAIR && k !== DOOR)) continue;
        d[j] = d[i]! + 1;
        queue[tail++] = j;
      }
    }
    return d;
  }

  /**
   * The ways into a defender's room he watches: of its doorways — and its
   * stairs, for the stair room — the one nearest the way he expects the
   * attack. Through any other, an enemy finds him unready.
   */
  private watchedWays(storey: number, room: number): number[] {
    const alerted = this.alerted[storey]!;
    const key = `${storey}:${room}:${alerted}`;
    const known = this.watched.get(key);
    if (known) return known;
    // Alerted by the noise on the stairs, every man of the storey turns to watch them (C-103).
    const p = this.plan.storeys[storey]!, field = alerted ? this.stairsField(storey) : this.expectField[storey]!;
    const ways: number[][] = [];
    for (let i = 0; i < p.cells.length; i++)
      if (p.cells[i] === DOOR && this.around(i).some((j) => p.roomOf[j] === room)) ways.push([i]);
    const stairs: number[] = [];
    p.roomOf.forEach((r, i) => { if (r === room && p.cells[i] === STAIR) stairs.push(i); });
    if (stairs.length) ways.push(stairs);
    let best: number[] = [], bd = Infinity;
    for (const way of ways) {
      const d = Math.min(...way.map((c) => (field[c]! >= 0 ? field[c]! : Infinity)));
      if (d < bd) { bd = d; best = way; }
    }
    this.watched.set(key, best);
    return best;
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
    return this.soldiers.filter((s) => s.side === side && !s.out && !s.withdrew);
  }

  /** In the fight now: not hit out, not gone, not still waiting outside. */
  private active(s: InteriorSoldier): boolean {
    return !s.out && !s.withdrew && !s.waiting;
  }

  /** One second of the fight: the broken give way, the attacker's drill moves, everyone looks, everyone who can fires. */
  tick(): void {
    if (this.finished) return;
    this.giveWay();
    for (const team of this.teams) this.drill(team);
    // Holding stops new retreats — but not a broken man's; a man already on a flight of stairs still comes off it.
    for (const m of this.soldiers) if (m.side !== this.attackerSide && (!(m.holds ?? this.fallback === "hold") || m.broken || m.retreat?.offStairs !== undefined)) this.fallBack(m);
    this.giveWay(); // found by a team that came on this second: he gives himself up before anyone fires
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
    if (this.second < team.halted) return; // seeing to the wounded: nobody moves, though all still fire
    for (const m of men) if (m.fromAbove && this.plan.storeys[m.storey]!.cells[m.cell] !== STAIR) m.fromAbove = false;
    switch (team.phase) {
      case "done":
        return;
      case "roof":
        return this.throughHatch(team, men);
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
          this.lastProgress = Math.max(this.lastProgress, this.second);
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
      team.until = this.second + (next > storey ? CLOSE_QUARTERS.stairUpSeconds : CLOSE_QUARTERS.stairDownSeconds);
      this.lastProgress = Math.max(this.lastProgress, team.until);
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
    team.contact = false;
    team.phase = viaDoor ? "stack" : "enter";
    this.lastProgress = Math.max(this.lastProgress, this.second);
  }

  /** The stack: up to the near side of the door, then a grenade if planned, then in. */
  private stack(team: Team, men: InteriorSoldier[]): void {
    const toDoor = this.distances(team.storey, team.approach, -1);
    if (!men.every((m) => toDoor[m.cell]! >= 0 && toDoor[m.cell]! <= 3)) {
      for (const m of men) this.walk(m, team.approach, -1, 1);
      if (men.some((m) => toDoor[m.cell]! < 0)) team.phase = "pick"; // cut off from the door: choose again
      return;
    }
    if (team.grenades) this.grenade(team, men, 1);
    team.phase = "enter";
  }

  /** Arriving by the stairs: a grenade up or down the stairwell first, then in — unless another team has the stair room. */
  private arrive(team: Team, men: InteriorSoldier[]): void {
    const from = team.storey;
    const to = this.order[this.order.indexOf(from) + 1]!;
    const s = this.plan.stairwell!;
    const stairs = s.y * this.plan.width + s.x;
    team.storey = to;
    const down = to < from;
    for (const m of men) { m.storey = to; m.cell = stairs; m.aim = undefined; m.fromAbove = down; }
    // Boots on an enclosed stairway carry: coming down, every storey below
    // turns to watch the stairs (ATP 3-06.11 (2024), para C-103).
    if (down) for (let k = 0; k <= to; k++) this.alerted[k] = true;
    const room = this.stairRoom(to);
    if (this.cleared[to]![room] || this.claimed(team, to).has(room)) { team.phase = "pick"; return; }
    this.assault(team, room, stairs, false);
    if (team.grenades) {
      if (down) this.grenade(team, men, 1, 1);
      else this.grenade(team, men, CLOSE_QUARTERS.grenadeUpstairsFactor, CLOSE_QUARTERS.grenadeUpstairsSelfHitFactor);
    }
  }

  /**
   * On the roof: the first team in once the climb is done. Each next one
   * comes through its interval after the one before — and not while another
   * team is still taking the stair room below the hatch. If no team is
   * taking it (the first was put out), the next goes in to take it.
   */
  private throughHatch(team: Team, men: InteriorSoldier[]): void {
    if (this.second < team.until) return;
    const top = this.order[0]!;
    const room = this.stairRoom(top);
    const taking = this.teams.some((t) => t !== team && t.storey === top && t.room === room && (t.phase === "enter" || t.phase === "consolidate"));
    if (taking) return;
    for (const m of men) { m.waiting = false; m.fromAbove = true; }
    const k = this.teams.indexOf(team);
    const next = this.teams[k + 1];
    if (next && next.phase === "roof") next.until = this.second + CLOSE_QUARTERS.roofTeamIntervalSeconds;
    this.lastProgress = Math.max(this.lastProgress, this.second, next?.phase === "roof" ? next.until : 0);
    if (!this.cleared[top]![room]) {
      this.assault(team, room, men[0]!.cell, false);
      if (team.grenades) this.grenade(team, men, 1, 1); // down the stairwell from the hatch
    } else {
      team.phase = "pick";
    }
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
      const area = this.plan.storeys[team.storey]!.rooms[team.room]!.areaM2;
      team.until = this.second + CLOSE_QUARTERS.consolidateSeconds + area * CLOSE_QUARTERS.searchSecondsPerM2 +
        (team.contact ? CLOSE_QUARTERS.reorganiseSeconds : 0);
      this.lastProgress = Math.max(this.lastProgress, team.until); // holding a room on the clock is not a stall
    }
  }

  private grenade(team: Team, men: InteriorSoldier[], factor: number, selfFactor = 1): void {
    const thrower = men.find((m) => m.grenades > 0 && !isStunned(m, this.second));
    if (!thrower) return;
    thrower.grenades--;
    this.grenadesThrown++;
    const chance = Math.min(1, ASSAULT.grenadeHitChance * ENCLOSED_BLAST_FACTOR * factor);
    for (const enemy of this.enemiesIn(team.storey, team.room)) {
      if (this.rng.chance(chance)) { if (woundSoldier(enemy, this.rng, "explosive")) this.hits.grenade++; }
      else enemy.stunnedUntil = this.second + CLOSE_QUARTERS.stunSeconds;
    }
    if (this.rng.chance(ASSAULT.grenadeSelfHitChance * selfFactor) && woundSoldier(thrower, this.rng, "explosive")) { this.hits.grenade++; this.casualty(thrower); }
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
    return this.soldiers.filter((s) => s.side !== this.attackerSide && this.active(s) && s.storey === storey && roomOf[s.cell] === room);
  }

  /** Is `e` in `m`'s room, or at a doorway or on the stairs into it? */
  private atWayIn(m: InteriorSoldier, e: InteriorSoldier): boolean {
    const p = this.plan.storeys[m.storey]!;
    const mine = p.roomOf[m.cell]!;
    if (p.roomOf[e.cell] === mine) return true;
    return p.cells[e.cell] === DOOR && this.around(e.cell).some((j) => p.roomOf[j] === mine);
  }

  /**
   * Is the defender `m` watching the way `e` came in by? Only the way into
   * his room he expects the attack from (`watchedWays`): its doorway or the
   * first step inside it, or the stairs — the stairs coming up, unless he
   * expects the attack from above or the noise on them has turned him. A
   * man watching a way in fires the second an enemy fills it.
   */
  private watching(m: InteriorSoldier, e: InteriorSoldier): boolean {
    if (m.side === this.attackerSide) return false;
    const p = this.plan.storeys[m.storey]!;
    const mine = p.roomOf[m.cell]!;
    const ways = this.watchedWays(m.storey, mine);
    const w = this.plan.width;
    const ex = e.cell % w, ey = (e.cell - ex) / w;
    const nearWay = ways.some((c) => { const x = c % w, y = (c - x) / w; return (x - ex) * (x - ex) + (y - ey) * (y - ey) <= 4; });
    if (!nearWay) return false;
    if (p.cells[e.cell] !== STAIR && !ways.some((c) => p.cells[c] === STAIR)) return true;
    // The stairs: watched for the direction he expects.
    const fromAbove = e.fromAbove === true;
    return this.alerted[m.storey]! || fromAbove === (this.expects === "above");
  }

  /**
   * Everyone who can see an enemy aims — at the one already in his sights
   * while he can still see him, else the nearest — and everyone who has had
   * him long enough fires. All shots are taken from the second's start, so
   * a man hit this second still fires; the hits land together.
   */
  private fire(): void {
    const shots: { at: InteriorSoldier; chance: number }[] = [];
    const teamOf = new Map<string, Team>();
    for (const t of this.teams) for (const m of t.members) teamOf.set(m.id, t);
    const w = this.plan.width, cellM = this.plan.cellM;
    const byId = new Map(this.soldiers.map((s) => [s.id, s]));
    for (const m of this.soldiers) {
      if (!this.active(m) || isStunned(m, this.second) || m.broken) continue; // a broken man fires no more (decision 103)
      const mx = m.cell % w, my = (m.cell - mx) / w;
      const dist2 = (e: InteriorSoldier) => { const ex = e.cell % w, ey = (e.cell - ex) / w; return (ex - mx) * (ex - mx) + (ey - my) * (ey - my); };
      let target: InteriorSoldier | undefined;
      const held = m.aim ? byId.get(m.aim.target) : undefined;
      if (held && this.active(held) && held.storey === m.storey && this.sees(m.storey, m.cell, held.cell)) {
        target = held;
      } else {
        let best = Infinity;
        for (const e of this.soldiers) {
          if (!this.active(e) || e.side === m.side || e.storey !== m.storey) continue;
          const d2 = dist2(e);
          if (d2 >= best || !this.sees(m.storey, m.cell, e.cell)) continue;
          best = d2;
          target = e;
        }
      }
      if (!target) { m.aim = undefined; continue; }
      if (!m.aim || m.aim.target !== target.id) {
        const ready = this.watching(m, target);
        m.aim = { target: target.id, since: ready ? this.second - CLOSE_QUARTERS.reactionSeconds : this.second };
        // A defender whose first enemy comes into his room by a way he was
        // not watching is caught unready — "from the rear" (C-30). One seen
        // farther off, coming on, is only a man to aim at.
        if (m.side !== this.attackerSide) {
          if (!ready && !m.engaged && this.atWayIn(m, target)) m.unreadyUntil = this.second + CLOSE_QUARTERS.unreadySeconds;
          m.engaged = true;
        }
      }
      if (this.second - m.aim.since < CLOSE_QUARTERS.reactionSeconds) continue;
      const metres2 = dist2(target) * cellM * cellM;
      let chance = 0;
      for (const band of CLOSE_QUARTERS.hitBySecond) {
        if (metres2 <= band.maxRangeM * band.maxRangeM) { chance = band.chance; break; }
      }
      if (target.prepared) chance *= CLOSE_QUARTERS.coverFactor;
      if (this.second < (m.unreadyUntil ?? -1)) chance *= UNREADY.ownFire;
      if (this.second < (target.unreadyUntil ?? -1)) chance = Math.min(1, chance * UNREADY.hitFactor);
      shots.push({ at: target, chance });
      const t = teamOf.get(m.id) ?? teamOf.get(target.id);
      if (t) t.contact = true;
    }
    for (const shot of shots) {
      if (this.rng.chance(shot.chance) && woundSoldier(shot.at, this.rng)) { this.hits.fire++; this.casualty(shot.at); }
    }
  }

  /**
   * A defender falls back (decision 96's top-down ruling; ATTP 3-06.11
   * (2011), para 7-148): when a room beside his is taken — whether or not
   * he is in a fight (the author, 2026-10-16) — he moves to the room of his
   * storey farthest from the rooms
   * taken. With none farther, he goes the way the attack is not coming
   * from: down the stairs and at last out of the front door ("withdraw from
   * the building, thus exposing himself to friendly fires") when it comes
   * from above; up, and at the top "cornered", when it comes from below.
   */
  private fallBack(m: InteriorSoldier): void {
    if (!this.active(m) && !(m.retreat?.offStairs !== undefined && !m.out)) return;
    if (m.out || m.withdrew) return;
    // On the stairs: off them on the next storey when the flight is done.
    if (m.retreat?.offStairs !== undefined) {
      if (this.second < m.retreat.offStairs) return;
      m.storey += this.entry === "top" ? -1 : 1;
      m.waiting = false;
      m.retreat = undefined;
      m.aim = undefined;
      m.lookedAt = undefined; // a new storey: look again
      return;
    }
    // Under fire or not (the author, 2026-10-16): he falls back firing, and
    // keeps shooting at what he sees as he goes. Only a stunned man stays put.
    if (isStunned(m, this.second)) return;
    if (m.retreat) {
      // The way there closed — its room taken, or the way cut: think again.
      const goalRoom = this.plan.storeys[m.storey]!.roomOf[m.retreat.goal]!;
      const field = this.defenderField(m.storey, m.retreat.goal);
      if ((goalRoom >= 0 && this.cleared[m.storey]![goalRoom]) || field[m.cell]! < 0) {
        m.retreat = undefined;
        m.lookedAt = undefined;
        return;
      }
      this.defenderWalk(m, m.retreat.goal);
      if (m.cell !== m.retreat.goal) return;
      if (m.retreat.kind === "out") { m.withdrew = true; m.aim = undefined; return; }
      if (m.retreat.kind === "stairs") {
        m.retreat = { ...m.retreat, offStairs: this.second + (this.entry === "top" ? CLOSE_QUARTERS.stairDownSeconds : CLOSE_QUARTERS.stairUpSeconds) };
        m.waiting = true; // on the flight: out of sight of both storeys
        return;
      }
      m.retreat = undefined;
      m.lookedAt = undefined; // in his new room: look again
      return;
    }
    const p = this.plan.storeys[m.storey]!;
    const mine = p.roomOf[m.cell]!;
    const cleared = this.cleared[m.storey]!;
    let taken = 0;
    for (const v of cleared) taken += v;
    if (m.lookedAt === taken) return; // nothing new taken since he last looked
    const pressed = this.sideRooms(m.storey, mine).some((r) => cleared[r] === 1);
    if (!pressed) { m.lookedAt = taken; return; }
    // Distances from every cell of the rooms taken: the threat.
    const threat = this.fromCleared(m.storey);
    const reach = this.defenderField(m.storey, m.cell);
    let best = -1, bestD = threat[m.cell]!;
    p.rooms.forEach((r) => {
      if (cleared[r.id] || r.id === mine) return;
      const back = backOfRoom(this.plan, m.storey, r.id);
      if (reach[back]! < 0) return;
      if (threat[back]! > bestD) { bestD = threat[back]!; best = back; }
    });
    if (best >= 0) return this.setRetreat(m, best, "room", taken);
    const top = this.plan.storeys.length - 1;
    const away = this.entry === "top" ? -1 : 1;
    const s = this.plan.stairwell;
    if (away < 0 && m.storey === 0) {
      const door = this.plan.outsideDoors.find((d) => reach[d]! >= 0);
      if (door !== undefined) this.setRetreat(m, door, "out", taken);
      return; // no way out now: he looks again next second
    }
    if (!s || m.storey + away < 0 || m.storey + away > top) { m.lookedAt = taken; return; } // cornered: he fights where he stands
    const stairs = s.y * this.plan.width + s.x;
    if (reach[stairs]! >= 0) this.setRetreat(m, stairs, "stairs", taken);
  }

  /** Off he goes: leaving his post, he leaves its preparation behind. */
  private setRetreat(m: InteriorSoldier, goal: number, kind: "room" | "stairs" | "out", taken: number): void {
    m.retreat = { goal, kind };
    m.window = undefined; // he leaves his window
    m.prepared = false;
    m.lookedAt = taken;
  }

  /** The rooms on the other side of a room's doors. */
  private sideRooms(storey: number, room: number): number[] {
    const p = this.plan.storeys[storey]!;
    const out: number[] = [];
    for (let i = 0; i < p.cells.length; i++) {
      if (p.cells[i] !== DOOR) continue;
      const [a, b] = this.sidesOf(storey, i);
      if (a === room && b !== undefined && b >= 0) out.push(b);
      if (b === room && a !== undefined && a >= 0) out.push(a);
    }
    return out;
  }

  /** Steps on a storey from the rooms already taken. */
  private fromCleared(storey: number): Int32Array {
    const p = this.plan.storeys[storey]!, cleared = this.cleared[storey]!;
    const n = p.cells.length;
    const d = new Int32Array(n).fill(-1);
    const queue = new Int32Array(n);
    let head = 0, tail = 0;
    for (let i = 0; i < n; i++) if (p.roomOf[i]! >= 0 && cleared[p.roomOf[i]!]) { d[i] = 0; queue[tail++] = i; }
    while (head < tail) {
      const i = queue[head++]!;
      for (const j of this.around(i)) {
        const k = p.cells[j];
        if (d[j] !== -1 || (k !== FLOOR && k !== STAIR && k !== DOOR)) continue;
        d[j] = d[i]! + 1;
        queue[tail++] = j;
      }
    }
    return d;
  }

  /** Steps a defender may walk from `from`: rooms not yet taken, doors, the stairs, and the street out of the front door. */
  private defenderField(storey: number, from: number): Int32Array {
    const p = this.plan.storeys[storey]!, cleared = this.cleared[storey]!;
    const n = p.cells.length;
    const taken = new Set<number>();
    for (const a of this.soldiers) if (a.side === this.attackerSide && this.active(a) && a.storey === storey) taken.add(a.cell);
    const may = (j: number) => {
      if (taken.has(j)) return false;
      const k = p.cells[j];
      if (k === DOOR) return true;
      if (k !== FLOOR && k !== STAIR) return false;
      return !cleared[p.roomOf[j]!];
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

  /** A defender's second's walk toward `goal`, by ground he may cross. */
  private defenderWalk(m: InteriorSoldier, goal: number): void {
    const field = this.defenderField(m.storey, goal);
    for (let k = 0; k < this.steps; k++) {
      const here = field[m.cell]!;
      if (here <= 0) return;
      let next = m.cell;
      for (const j of this.around(m.cell)) if (field[j]! >= 0 && field[j]! < field[next]!) next = j;
      if (next === m.cell) return;
      m.cell = next;
    }
  }

  /** How the attack came in: by the door, or from the roof. */
  get entryWay(): "door" | "top" {
    return this.entry;
  }

  /** The teams these men are in throw a grenade into each room first, or not: their force's plan (decision 101). */
  setGrenades(ids: readonly string[], on: boolean): void {
    for (const t of this.teams) if (t.members.some((m) => ids.includes(m.id))) t.grenades = on;
  }

  /**
   * These men are broken, or are not (decision 103): morale is judged
   * outside, once a turn, and the fight reads it as the minute begins. A
   * man rallied is in the fight again where he stands.
   */
  setBroken(ids: readonly string[], broken: boolean): void {
    for (const m of this.soldiers) if (ids.includes(m.id) && !m.out && !m.withdrew) m.broken = broken;
  }

  /**
   * The broken stop fighting (decision 103, the author, 2026-10-21). An
   * attacker who breaks leaves the fight — out by the front door, as his
   * force would. A defender who breaks falls back when pressed, holding or
   * not (`fallBack`), and gives himself up where he is once he is cornered:
   * an attacker has him in sight.
   */
  private giveWay(): void {
    for (const m of this.soldiers) {
      if (!m.broken || m.out || m.withdrew) continue;
      if (m.side === this.attackerSide) {
        // ⚠️ Ours: gone at once; the walk back out through rooms cleared is not modelled.
        m.withdrew = true;
        m.waiting = false;
        m.aim = undefined;
        for (const t of this.teams) t.members = t.members.filter((x) => x !== m);
        continue;
      }
      if (!this.active(m)) continue; // on a flight of stairs: he gets off it first
      // ⚠️ Ours: found is cornered — an attacker has him in sight, as he would have him in his sights.
      const cornered = this.soldiers.some((e) => e.side === this.attackerSide && this.active(e) && e.storey === m.storey && this.sees(m.storey, e.cell, m.cell));
      if (!cornered) continue;
      m.out = true;
      m.yielded = true;
      m.aim = undefined;
      m.retreat = undefined;
      m.window = undefined;
    }
  }

  /** These defenders hold to the last, or fall back: their force's plan (decision 101). */
  setHolds(ids: readonly string[], holds: boolean): void {
    for (const m of this.soldiers) if (ids.includes(m.id) && m.side !== this.attackerSide) m.holds = holds;
  }

  /**
   * More attackers come in partway through (decision 99): new teams at the
   * front door, by the plan the fight began with, each taking rooms not yet
   * taken — the same drill as those already inside. Only by the door: a
   * top-down attack's hatch takes its own teams in turn. A man who left the
   * fight (his force broke, and has rallied) comes back in the same way,
   * with what he has left.
   */
  join(teams: readonly string[][]): void {
    if (this.finished) throw new Error("InteriorFight: the fight is over");
    if (this.entry !== "door") throw new Error("InteriorFight: only a fight entered by the door is joined");
    const start = this.entryCell();
    for (const ids of teams) {
      const members = ids.map((id) => {
        const back = this.soldiers.find((s) => s.id === id);
        if (back) {
          if (back.side !== this.attackerSide || !back.withdrew || back.out) throw new Error(`InteriorFight: ${id} is already in the fight`);
          // Out of the team he left with, so no two teams drive one man.
          for (const t of this.teams) t.members = t.members.filter((x) => x !== back);
          Object.assign(back, { withdrew: false, waiting: false, storey: 0, cell: start, fromAbove: false });
          back.aim = undefined;
          back.retreat = undefined;
          return back;
        }
        const m = this.man(id, this.attackerSide, 0, start, false);
        m.grenades = CLOSE_QUARTERS.grenadesEach;
        this.soldiers.push(m);
        return m;
      });
      this.teams.push({ members, storey: 0, phase: "pick", room: -1, approach: -1, points: [], until: 0, entered: 0, searching: false, contact: false, halted: 0, grenades: this.grenadesPlanned });
    }
    this.lastProgress = Math.max(this.lastProgress, this.second); // new men going in is not a stall
  }

  /**
   * Men who leave the fight from outside its own rules — their force routed,
   * gave itself up, or is spent and may only fall back: gone from it, as a
   * defender who withdraws is. With every attacker gone the attack is over.
   */
  leave(ids: readonly string[]): void {
    for (const m of this.soldiers) if (ids.includes(m.id) && !m.out) { m.withdrew = true; m.aim = undefined; }
  }

  /** An attacker put out halts his team while he is seen to and carried out; a wound he fights on with does not. */
  private casualty(m: InteriorSoldier): void {
    if (!m.out || m.side !== this.attackerSide) return;
    const team = this.teams.find((t) => t.members.includes(m));
    if (!team) return;
    // Above floors not yet cleared he cannot simply be carried down and out (C-30).
    let below = false;
    for (let k = 0; k < m.storey; k++) if (!this.cleared[k]!.every((v) => v === 1)) below = true;
    team.halted = Math.max(team.halted, this.second) + CLOSE_QUARTERS.casualtySeconds * (below ? CLOSE_QUARTERS.casualtyAboveUnclearedFactor : 1);
    this.lastProgress = Math.max(this.lastProgress, team.halted); // a halt is not a stall
  }

  /**
   * Men of both sides still in it (decision 103): a house its defenders have
   * all left, or given up, is being searched, not fought for — the battle
   * does not wait for that.
   */
  get contested(): boolean {
    return !this.finished && this.alive(this.attackerSide).length > 0 && this.soldiers.some((s) => s.side !== this.attackerSide && !s.out && !s.withdrew);
  }

  // ---- what the street sees (decision 98) ----------------------------------

  /**
   * The men at their windows now: a defender posted at one, still in the
   * fight and standing at it. `outward` is the grid step from the window to
   * the street.
   */
  atWindows(): { id: string; storey: number; window: number; outward: { x: number; y: number } }[] {
    const w = this.plan.width;
    const out: { id: string; storey: number; window: number; outward: { x: number; y: number } }[] = [];
    for (const m of this.soldiers) {
      if (!this.active(m) || !m.window || m.cell !== m.window.at) continue;
      const cells = this.plan.storeys[m.storey]!.cells;
      const street = this.around(m.window.cell).find((j) => cells[j] === OUTSIDE);
      if (street === undefined) continue;
      out.push({ id: m.id, storey: m.storey, window: m.window.cell, outward: { x: (street % w) - (m.window.cell % w), y: Math.floor(street / w) - Math.floor(m.window.cell / w) } });
    }
    return out;
  }

  /** Attackers on the roof, waiting for the climb or the hatch (decision 101): out in the open up there, not yet inside. */
  onRoof(): string[] {
    if (this.entry !== "top") return [];
    return this.soldiers.filter((m) => m.side === this.attackerSide && m.waiting && !m.out && !m.withdrew).map((m) => m.id);
  }

  /** The men in the street outside: attackers not yet through the door, and defenders who fell back out of it. */
  inStreet(): string[] {
    return this.soldiers
      .filter((m) => !m.out && (m.withdrew ? m.side !== this.attackerSide : this.active(m) && m.storey === 0 && this.plan.storeys[0]!.cells[m.cell] === OUTSIDE))
      .map((m) => m.id);
  }

  /** Every man in the fight in a room now, of both sides. */
  inRoom(storey: number, room: number): string[] {
    const roomOf = this.plan.storeys[storey]!.roomOf;
    return this.soldiers.filter((m) => this.active(m) && m.storey === storey && roomOf[m.cell] === room).map((m) => m.id);
  }

  /** The room a man stands in, if he is in one. */
  roomOfMan(id: string): { storey: number; room: number } | undefined {
    const m = this.soldiers.find((s) => s.id === id);
    if (!m) return undefined;
    const room = this.plan.storeys[m.storey]!.roomOf[m.cell]!;
    return room >= 0 ? { storey: m.storey, room } : undefined;
  }

  result(): InteriorResult {
    const count = (attackers: boolean) => {
      const men = this.soldiers.filter((s) => attackers === (s.side === this.attackerSide));
      return { men: men.length, out: men.filter((s) => s.out).length, killed: men.filter((s) => s.killed).length, withdrew: men.filter((s) => s.withdrew).length, yielded: men.filter((s) => s.yielded).length };
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
 *
 * Given `toward`, the way the enemy is in the grid's own axes, a man whose
 * room has a window facing it stands at that window instead (decision 98,
 * "unless otherwise planned"): the one facing it most squarely. No draw.
 */
export function defaultDefence(plan: FloorPlan, ids: readonly string[], rng: Rng, prepared = false, toward?: { x: number; y: number }): DefenderPost[] {
  const rooms: { storey: number; room: number }[] = [];
  plan.storeys.forEach((s, storey) => s.rooms.forEach((r) => { if (!s.cutOff.includes(r.id)) rooms.push({ storey, room: r.id }); }));
  const posts: DefenderPost[] = [];
  const free = rooms.slice();
  for (const id of ids) {
    if (free.length === 0) free.push(...rooms);
    const k = rng.int(0, free.length - 1);
    const { storey, room } = free.splice(k, 1)[0]!;
    const atWindow = toward ? windowFacing(plan, storey, room, toward) : undefined;
    posts.push(atWindow ? { id, storey, cell: atWindow.at, prepared, window: atWindow.window } : { id, storey, cell: backOfRoom(plan, storey, room), prepared });
  }
  return posts;
}

/**
 * A defence by its forces' orders (decision 101): each force's men spread
 * over the rooms of the storeys it holds, a man to a room as far as they go,
 * as {@link defaultDefence} spreads them — at a window facing `toward` where
 * the force's order says the windows, else back in the room. Rooms are not
 * shared between forces until every allowed room is taken. Drawn from `rng`.
 */
export function plannedDefence(
  plan: FloorPlan,
  forces: readonly { ids: readonly string[]; storeys?: readonly number[]; atWindows: boolean }[],
  rng: Rng,
  prepared: boolean,
  toward?: { x: number; y: number },
): DefenderPost[] {
  const all: { storey: number; room: number }[] = [];
  plan.storeys.forEach((s, storey) => s.rooms.forEach((r) => { if (!s.cutOff.includes(r.id)) all.push({ storey, room: r.id }); }));
  const taken = new Set<string>();
  const posts: DefenderPost[] = [];
  for (const force of forces) {
    const held = force.storeys?.length ? all.filter((r) => force.storeys!.includes(r.storey)) : all;
    const rooms = held.length ? held : all; // a storey the house does not have: anywhere
    // As the default spreads them: the rooms nobody holds yet, a man each; when they run out, all of them again.
    let free = rooms.filter((r) => !taken.has(`${r.storey}:${r.room}`));
    if (free.length === 0) free = rooms.slice();
    for (const id of force.ids) {
      if (free.length === 0) free = rooms.slice();
      const { storey, room } = free.splice(rng.int(0, free.length - 1), 1)[0]!;
      taken.add(`${storey}:${room}`);
      const atWindow = force.atWindows && toward ? windowFacing(plan, storey, room, toward) : undefined;
      posts.push(atWindow ? { id, storey, cell: atWindow.at, prepared, window: atWindow.window } : { id, storey, cell: backOfRoom(plan, storey, room), prepared });
    }
  }
  return posts;
}

/**
 * The window of a room that faces `toward` most squarely — its street side
 * that way — and the room's cell beside it; none when no window faces it.
 * Ties go to the first in reading order.
 */
function windowFacing(plan: FloorPlan, storey: number, room: number, toward: { x: number; y: number }): { window: number; at: number } | undefined {
  const s = plan.storeys[storey]!;
  const w = plan.width, n = s.cells.length;
  let best: { window: number; at: number } | undefined, bestDot = 0;
  for (let i = 0; i < n; i++) {
    if (s.cells[i] !== CELL_KIND.window) continue;
    const x = i % w;
    const near = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w].filter((j) => j >= 0 && j < n);
    const at = near.find((j) => s.roomOf[j] === room);
    const street = near.find((j) => s.cells[j] === CELL_KIND.outside);
    if (at === undefined || street === undefined) continue;
    const dot = ((street % w) - x) * toward.x + (Math.floor(street / w) - Math.floor(i / w)) * toward.y;
    if (dot > bestDot) { bestDot = dot; best = { window: i, at }; }
  }
  return best;
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
