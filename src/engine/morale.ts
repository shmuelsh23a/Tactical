import { Rng } from "./rng.js";
import { ECHELON_RANK } from "./data/c2.js";
import { angleBetween, bearingDegrees, distance, type Point } from "./geometry.js";
import type { Echelon, MoraleState, Side, Soldier, SoldierMorale, Traits, Unit } from "./types.js";
import {
  ARMOUR_COMFORT_M,
  ARMOUR_FEAR_M,
  CONTAGION_M,
  CORNERED_M,
  EVENT_TEST_LOSS,
  EXPERIENCE,
  FALLBACK_RADIUS_M,
  FORCE_BREAK_SHARE,
  GAIN,
  HEROIC,
  LEADER_BONUS,
  LEADER_REACH_M,
  LOSS,
  MOTIVATION_FLOOR,
  NEARBY_M,
  OUTNUMBERED_M,
  OUTNUMBERED_RATIO,
  PERMANENT_LOSS_SHARE,
  PREPARED,
  RALLY,
  REST_CLEAR_M,
  ROUT_DISTANCE_M,
  SIDE_BREAK_SHARE,
  STATE_ACCURACY,
  SUPPRESSION,
  SUPPRESSION_EFFECT,
  TEST,
  THRESHOLDS,
  TOP_LEADER_ECHELON,
  TRAIT_DICE,
  WAVERING_TEST_INTERVAL,
} from "./data/morale.js";

/**
 * Morale (מורל) — rules decision 19.
 *
 * Two layers, on two clocks. **Suppression** is the fast one: a force-level
 * count of how hard it is being shot at this turn, which slows it, spoils its
 * aim and — past a point — pins it, and which halves away every turn the fire
 * stops. **The pool of will** is the slow one: each soldier's, drawn at the
 * start, drained by what happens to him and around him, and only ever partly
 * refilled. What the thresholds are tested against is *effective* morale: the
 * pool plus the live bonus of the leaders whose reach covers him, less what
 * suppression is doing to his nerve right now.
 *
 * The whole of the slow layer is judged in one place, {@link resolveMorale},
 * once per turn at the summary phase (סיכום והתארגנות — "summary and
 * reorganisation" is where the document's turn already puts it). It reads what
 * the turn did from two ledgers the engine keeps as it resolves: which forces
 * were shot at and from where ({@link StressLedger}), and every soldier as he
 * stood when the turn began ({@link snapshotSoldiers}). A casualty is found by
 * comparing the two, whatever caused it, so a new way of hurting a force
 * cannot forget to tell morale.
 *
 * Everything here is off unless the game is played with morale: a soldier
 * without a pool is fit or not, as he always was, and a force without one is
 * never suppressed, never broken, never slower and never less accurate.
 */

// ---------------------------------------------------------------------------
// Traits and the starting pool
// ---------------------------------------------------------------------------

const RANK = ECHELON_RANK;

/**
 * The seed a force's men are drawn from: the game's seed and the force's id.
 *
 * **Not the game's rng**, on purpose. A recording carries each force as it was
 * added — men, traits and pools included — so a replay does not draw them
 * again. Drawn from the game's rng, the live game would have spent draws the
 * replay never makes, and every roll after setup would diverge. Drawn from
 * their own stream they cost the game nothing, and a force's men do not change
 * because another force was added before it.
 */
export function unitSeed(seed: number, unitId: string): number {
  const text = `${seed}:${unitId}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function drawTrait(rng: Rng): number {
  let total = 0;
  for (let i = 0; i < TRAIT_DICE.count; i++) total += rng.die(TRAIT_DICE.sides);
  return Math.ceil(total / TRAIT_DICE.count);
}

function drawTraits(rng: Rng): Traits {
  return {
    strength: drawTrait(rng),
    intelligence: drawTrait(rng),
    wisdom: drawTrait(rng),
    agility: drawTrait(rng),
    charisma: drawTrait(rng),
    luck: drawTrait(rng),
  };
}

/**
 * Give a force's men their traits and their pools, and name its leader, where
 * the force does not already carry them — a scenario may dress a force by hand,
 * and a recorded force arrives dressed. The pool is drawn between the force's
 * motivation floor and 100, as the mean of two draws: the author's range, with
 * most men nearer the middle of it than the ends.
 */
export function generateMorale(unit: Unit, seed: number): void {
  if (!unit.soldiers || unit.soldiers.length === 0 || unit.kind === "vehicle") return;
  const rng = new Rng(unitSeed(seed, unit.id));
  const floor = MOTIVATION_FLOOR[unit.motivation ?? "normal"];
  if (!unit.soldiers.some((s) => s.leader)) unit.soldiers[0]!.leader = true;
  for (const s of unit.soldiers) {
    const traits = drawTraits(rng);
    s.traits ??= traits;
    const a = rng.int(0, 100 - floor);
    const b = rng.int(0, 100 - floor);
    if (!s.morale) {
      const will = floor + Math.floor((a + b) / 2);
      s.morale = { will, ceiling: will, state: bandFor(will), timesRallied: 0 };
    }
  }
}

/** A leader's leadership: intelligence + wisdom + charisma, 3–30. Zero for anyone else. */
export function leadership(s: Soldier): number {
  if (!s.leader || !s.traits) return 0;
  return s.traits.intelligence + s.traits.wisdom + s.traits.charisma;
}

/** Whether this force's men carry pools — i.e. whether morale applies to it at all. */
export function hasMorale(unit: Unit): boolean {
  return unit.soldiers?.some((s) => s.morale != null) ?? false;
}

// ---------------------------------------------------------------------------
// What morale does to a force in the fight
// ---------------------------------------------------------------------------

/** The men who will still fight: fit, and not broken. Without morale, every fit man. */
export function readySoldiers(unit: Unit): Soldier[] {
  return (unit.soldiers ?? []).filter((s) => !s.neutralized && s.morale?.state !== "broken");
}

export type SuppressionLevel = "none" | "suppressed" | "pinned";

export function suppressionLevel(unit: Unit): SuppressionLevel {
  const value = unit.suppression ?? 0;
  if (value >= SUPPRESSION.pinned) return "pinned";
  if (value >= SUPPRESSION.suppressed) return "suppressed";
  return "none";
}

/** What suppression does to a force's aim: 1, or the suppressed or pinned factor. */
export function suppressionAccuracy(unit: Unit): number {
  const level = suppressionLevel(unit);
  return level === "none" ? 1 : SUPPRESSION_EFFECT[level].accuracy;
}

/**
 * How well each of the force's ready men shoots, as a factor on the hit
 * chance, in the order {@link readySoldiers} lists them. The force's
 * suppression spoils every man's aim; his own state spoils — or, for a hero,
 * sharpens — his. All 1 without morale.
 */
export function shooterAccuracy(unit: Unit): number[] {
  const force = suppressionAccuracy(unit);
  return readySoldiers(unit).map((s) => {
    const state = s.morale?.state ?? "steady";
    const own = state === "heroic" ? HEROIC.accuracy : state === "broken" ? 0 : STATE_ACCURACY[state];
    return force * own;
  });
}

/**
 * Suppression for fire arriving at `target`. Applied the moment it lands, so a
 * force shot at early in the fire phase shoots worse later in it — which is
 * the point of firing first.
 */
export function addSuppression(target: Unit, amount: number): void {
  if (!hasMorale(target)) return;
  const factor = EXPERIENCE[target.experience ?? "regular"].suppression;
  target.suppression = Math.min(
    SUPPRESSION.max,
    (target.suppression ?? 0) + Math.round(amount * factor),
  );
}

// ---------------------------------------------------------------------------
// Effective morale: the pool, the leaders, the fire
// ---------------------------------------------------------------------------

interface LeaderLink {
  soldier: Soldier;
  rank: number;
  range: number;
}

/**
 * The leaders whose reach covers `soldier` of `unit`, nearest link first.
 *
 * A force's own leader covers his own men. A command group's commander covers,
 * besides his own group, every force of his side of a lower echelon within
 * his reach (the every-turn band of the פו"ש table). A squad leader reaches no
 * further than his squad. Nobody counts above battalion.
 */
function leadersOver(units: readonly Unit[], unit: Unit, soldier: Soldier): LeaderLink[] {
  const links: LeaderLink[] = [];
  for (const other of units) {
    if (other.side !== unit.side || other.surrendered || !other.soldiers) continue;
    if (RANK[other.echelon] > RANK[TOP_LEADER_ECHELON]) continue;
    const own = other === unit;
    let range = 0;
    if (!own) {
      if (other.kind !== "command") continue;
      if (RANK[other.echelon] <= RANK[unit.echelon]) continue;
      range = distance(other.position, unit.position);
      if (range > (LEADER_REACH_M[other.echelon] ?? 0)) continue;
    }
    for (const s of other.soldiers) {
      if (!s.leader || s === soldier || s.neutralized || !s.morale) continue;
      links.push({ soldier: s, rank: RANK[other.echelon], range });
    }
  }
  return links.sort((a, b) => a.rank - b.rank || a.range - b.range);
}

/**
 * The live bonus a soldier draws from his chain of command — or, out of every
 * leader's reach, from the most charismatic comrade near him (half his
 * charisma, author 2026-09-22). Live: it is gone the moment the leader is, and
 * a broken leader costs his men rather than steadying them.
 */
export function leaderBonus(units: readonly Unit[], unit: Unit, soldier: Soldier): number {
  const links = leadersOver(units, unit, soldier);
  if (links.length > 0) {
    let total = 0;
    links.forEach((link, i) => {
      const sign = link.soldier.morale?.state === "broken" ? -1 : 1;
      total += (sign * leadership(link.soldier)) / LEADER_BONUS.divisor / 2 ** i;
    });
    return Math.max(-LEADER_BONUS.cap, Math.min(LEADER_BONUS.cap, Math.round(total)));
  }
  let best = 0;
  for (const other of units) {
    if (other.side !== unit.side || other.surrendered || !other.soldiers) continue;
    if (distance(other.position, unit.position) > FALLBACK_RADIUS_M) continue;
    for (const s of other.soldiers) {
      if (s === soldier || s.neutralized || !s.morale || s.morale.state === "broken") continue;
      best = Math.max(best, s.traits?.charisma ?? 0);
    }
  }
  return Math.floor(best / 2);
}

/** What the thresholds are tested against: the pool, the leaders, a hero beside him, the fire. */
export function effectiveMorale(units: readonly Unit[], unit: Unit, soldier: Soldier): number {
  const m = soldier.morale;
  if (!m) return 100;
  const level = suppressionLevel(unit);
  const pressed = level === "none" ? 0 : SUPPRESSION_EFFECT[level].morale;
  const hero = (unit.soldiers ?? []).some((s) => s !== soldier && s.morale?.state === "heroic" && !s.neutralized)
    ? HEROIC.squadBonus
    : 0;
  return m.will + leaderBonus(units, unit, soldier) + hero - pressed;
}

/** The band an effective morale falls in, for a soldier who is neither broken nor a hero. */
function bandFor(effective: number): MoraleState {
  if (effective <= THRESHOLDS.shaken) return "shaken";
  if (effective <= THRESHOLDS.wavering) return "wavering";
  return "steady";
}

/**
 * Put every man who is neither broken nor a hero in the band his effective
 * morale falls in. No dice: the live leader bonus moves with the leaders, so
 * the bands are refreshed at the start of every turn as well as by the step.
 * Given the turn about to be played, it also ends a hero's spell that has run.
 */
export function refreshMoraleStates(units: readonly Unit[], turn?: number): void {
  for (const u of units) {
    if (u.surrendered) continue;
    for (const s of u.soldiers ?? []) {
      const m = s.morale;
      if (!m || s.neutralized) continue;
      // A hero's moment is over once the turns it was good for are played.
      if (m.state === "heroic" && turn != null && (m.heroicUntilTurn ?? 0) < turn) {
        m.state = "steady";
        delete m.heroicUntilTurn;
      }
      if (m.state === "broken" || m.state === "heroic") continue;
      m.state = bandFor(effectiveMorale(units, u, s));
    }
  }
}

/** A soldier who can never recover above the break threshold: dry for the rest of the battle. */
export function isDry(m: SoldierMorale): boolean {
  return m.ceiling <= THRESHOLDS.broken;
}

/**
 * Take `loss` from a soldier's pool. Part of it is gone for good — the ceiling
 * he can recover to falls by that share — and a pool drained to nothing is dry.
 */
function drain(m: SoldierMorale, loss: number): void {
  if (loss <= 0) return;
  m.will = Math.max(0, m.will - loss);
  m.ceiling = Math.max(0, m.ceiling - Math.ceil(loss * PERMANENT_LOSS_SHARE));
  if (m.will === 0) m.ceiling = 0;
  m.will = Math.min(m.will, m.ceiling);
}

/** Give back up to `gain`, never above the ceiling. */
function refill(m: SoldierMorale, gain: number): void {
  if (gain <= 0) return;
  m.will = Math.min(m.ceiling, m.will + gain);
}

// ---------------------------------------------------------------------------
// Forces and sides
// ---------------------------------------------------------------------------

/** A force's state as its own side may see it (rules decision 19: states, not numbers). */
export type ForceMoraleState = "steady" | "wavering" | "shaken" | "broken" | "routing" | "surrendered";

export interface ForceMorale {
  state: ForceMoraleState;
  suppression: SuppressionLevel;
  /** Fit men by state. */
  counts: Record<MoraleState, number>;
}

function isEnemyInPlay(u: Unit): boolean {
  return !u.neutralized && !u.surrendered && !u.vehicle?.destroyed;
}

/** Whether a broken force here would be cornered: an enemy within {@link CORNERED_M}. */
export function isCornered(units: readonly Unit[], unit: Unit): boolean {
  return units.some(
    (u) => u.side !== unit.side && isEnemyInPlay(u) && distance(u.position, unit.position) <= CORNERED_M,
  );
}

/**
 * Whether a force has broken: all its fit men broken; broken men and
 * casualties together at half its strength; or the men still standing
 * averaging at or below the break threshold. A force the attrition rule has
 * already neutralised is that rule's business, not this one's.
 */
export function forceBroken(units: readonly Unit[], unit: Unit): boolean {
  if (!hasMorale(unit) || unit.neutralized) return false;
  const soldiers = unit.soldiers ?? [];
  const down = soldiers.filter((s) => s.neutralized).length;
  const broken = soldiers.filter((s) => !s.neutralized && s.morale?.state === "broken").length;
  const ready = readySoldiers(unit);
  if (ready.length === 0) return true;
  if (broken > 0 && (down + broken) / soldiers.length >= FORCE_BREAK_SHARE) return true;
  const mean = ready.reduce((sum, s) => sum + effectiveMorale(units, unit, s), 0) / ready.length;
  return mean <= THRESHOLDS.broken;
}

/**
 * A force's morale, aggregated from its men — the rule at every echelon, so a
 * platoon or a company fielded as one force is the average of its troops, as
 * the author set for higher-echelon play. The state is read off the mean
 * effective morale of the men still standing; a force that broke shows it.
 */
export function forceMorale(units: readonly Unit[], unit: Unit): ForceMorale | undefined {
  if (!hasMorale(unit)) return undefined;
  const counts: Record<MoraleState, number> = { steady: 0, wavering: 0, shaken: 0, broken: 0, heroic: 0 };
  for (const s of unit.soldiers ?? []) {
    if (!s.neutralized && s.morale) counts[s.morale.state] += 1;
  }
  const suppression = suppressionLevel(unit);
  if (unit.surrendered) return { state: "surrendered", suppression, counts };
  if (unit.routing) return { state: "routing", suppression, counts };
  if (forceBroken(units, unit)) return { state: "broken", suppression, counts };
  const ready = readySoldiers(unit);
  const mean = ready.reduce((sum, s) => sum + effectiveMorale(units, unit, s), 0) / Math.max(1, ready.length);
  return { state: bandFor(mean) as ForceMoraleState, suppression, counts };
}

/**
 * Whether `side` has broken (rules decision 19, after Close Combat): two
 * thirds of its fighting strength down, broken, or in a force that routed,
 * surrendered or was neutralised. Command groups are not fighting strength.
 * False for a side whose men carry no pools — without morale a side is beaten
 * only when every force is out.
 */
export function sideBroken(units: readonly Unit[], side: Side): boolean {
  const own = units.filter((u) => u.side === side);
  if (!own.some(hasMorale)) return false;
  let total = 0;
  let lost = 0;
  for (const u of own) {
    if (u.kind === "command") continue;
    if (u.vehicle) {
      const crew = u.vehicle.crew.length;
      total += crew;
      lost += u.neutralized || u.vehicle.destroyed ? crew : u.vehicle.crew.filter((c) => c.neutralized).length;
      continue;
    }
    const soldiers = u.soldiers ?? [];
    total += soldiers.length;
    if (u.neutralized || u.routing || u.surrendered) {
      lost += soldiers.length;
      continue;
    }
    lost += soldiers.filter((s) => s.neutralized || s.morale?.state === "broken").length;
  }
  return total > 0 && lost / total >= SIDE_BREAK_SHARE;
}

// ---------------------------------------------------------------------------
// What the turn did: the two ledgers
// ---------------------------------------------------------------------------

/** One burst of fire that arrived at a force this turn. */
export interface FireNote {
  kind: "direct" | "explosive" | "assault" | "indirect" | "mine";
  /**
   * The bearing from the force to whoever fired, taken **where the force was
   * when the shot was taken** — a force caught mid-bound is judged on the
   * geometry of that shot, not of where it ended the turn. Absent for fire
   * from off the map (shells) or the ground (charges).
   */
  bearing?: number;
}

interface UnitStress {
  firedOn: FireNote[];
  inflicted: number;
  neutralizedEnemy: boolean;
}

/**
 * What the turn's fire did, force by force: who was shot at and from where,
 * and who drew blood. Filled as fire is resolved, read and cleared by the
 * morale step. Casualties are *not* kept here — the soldier snapshot finds
 * those, whatever caused them.
 */
export class StressLedger {
  private readonly byUnit = new Map<string, UnitStress>();

  private entry(unitId: string): UnitStress {
    let e = this.byUnit.get(unitId);
    if (!e) {
      e = { firedOn: [], inflicted: 0, neutralizedEnemy: false };
      this.byUnit.set(unitId, e);
    }
    return e;
  }

  /** Fire arrived at `target`. */
  firedOn(target: Unit, note: FireNote): void {
    this.entry(target.id).firedOn.push(note);
  }

  /** `attacker` caused casualties, or put an enemy force out. */
  credit(attacker: Unit, casualties: number, neutralized: boolean): void {
    if (casualties <= 0 && !neutralized) return;
    const e = this.entry(attacker.id);
    e.inflicted += casualties;
    e.neutralizedEnemy ||= neutralized;
  }

  get(unitId: string): UnitStress | undefined {
    return this.byUnit.get(unitId);
  }

  clear(): void {
    this.byUnit.clear();
  }
}

/** Every soldier as he stood: damage taken and whether he was down. */
export type SoldierSnapshot = Map<string, { damage: number; neutralized: boolean }>;

export function snapshotSoldiers(units: readonly Unit[]): SoldierSnapshot {
  const snap: SoldierSnapshot = new Map();
  for (const u of units) {
    for (const s of u.soldiers ?? []) snap.set(s.id, { damage: s.damagePoints, neutralized: s.neutralized });
  }
  return snap;
}

// ---------------------------------------------------------------------------
// The morale step
// ---------------------------------------------------------------------------

export interface MoraleContext {
  rng: Rng;
  turn: number;
  units: Unit[];
  stress: StressLedger;
  /** Every soldier as he stood when the turn began. */
  snapshot: SoldierSnapshot;
  /** Whether `side` knows of `unit` — its own picture, not the umpire's. */
  perceives: (side: Side, unit: Unit) => boolean;
  /** Whether `observer` has a line of sight to `target`. */
  sees: (observer: Unit, target: Unit) => boolean;
  /** Whether the force is under a withdrawal order this turn. */
  withdrawing: (unit: Unit) => boolean;
  /**
   * Whether `side` is watching `unit` right now — the one test for whether a
   * side is told of an enemy force routing or surrendering, in the live log
   * and the debrief alike (rules decision 19).
   */
  watching: (side: Side, unit: Unit) => boolean;
  /**
   * How much steadier a force in position is — {@link PREPARED} unless the
   * game is measuring another size (data/variants.ts).
   */
  prepared?: { testBonus: number; lossFactor: number };
}

/**
 * A force in position: it did not move this turn, and it is behind something
 * — the ground, a building, a hole it dug or a position it prepared. Read at
 * the morale step, before the turn's flags are cleared.
 */
export function inPosition(unit: Unit): boolean {
  return unit.movedThisTurn === 0 && unit.cover !== "none";
}

/** Something the morale step did that a player should be told about. */
export interface MoraleReport {
  unitId: string;
  kind: "broke" | "heroic" | "rallied" | "routed" | "surrendered" | "recovered";
  /** How many of its men, for broke and rallied. */
  soldiers?: number;
  /** The force whose leader did the rallying. */
  rallierId?: string;
  /**
   * For a rout or a surrender: the enemy sides that watched it happen. The
   * engine decides this once, so the live log and the debrief cannot tell a
   * side two different things. Nothing else is ever shown to the enemy.
   */
  seenBy?: Side[];
}

export interface MoraleStepResult {
  reports: MoraleReport[];
  /** Forces that broke and ran this turn, and where they are running to. */
  routs: { unitId: string; to: Point }[];
  /** Routing forces rallied back into the fight. */
  recovered: string[];
  /** Forces that gave themselves up. */
  surrendered: string[];
}

function soldiersWithPools(unit: Unit): Soldier[] {
  return (unit.soldiers ?? []).filter((s) => !s.neutralized && s.morale != null);
}

/** Fired on from two directions 90° or more apart, or from outside the sector it watches. */
function wasFlanked(unit: Unit, notes: FireNote[]): boolean {
  const bearings = notes.flatMap((n) => (n.bearing == null ? [] : [n.bearing]));
  if (bearings.length === 0) return false;
  const sector = unit.observationSector;
  if (sector && bearings.some((b) => angleBetween(b, sector.bearing) > sector.width / 2)) return true;
  for (let i = 0; i < bearings.length; i++) {
    for (let j = i + 1; j < bearings.length; j++) {
      if (angleBetween(bearings[i]!, bearings[j]!) >= 90) return true;
    }
  }
  return false;
}

function fitCount(u: Unit): number {
  if (u.vehicle) return u.vehicle.destroyed ? 0 : u.vehicle.crew.filter((c) => !c.neutralized).length;
  return (u.soldiers ?? []).filter((s) => !s.neutralized).length;
}

/**
 * Where a broken force runs: to its commander, if it has one to run to, else
 * straight away from the nearest enemy. The caller keeps it on the map.
 */
function routDestination(units: readonly Unit[], unit: Unit): Point {
  const commander = units.find((u) => u.side === unit.side && u.kind === "command" && !u.neutralized && !u.surrendered);
  if (commander && commander !== unit && distance(commander.position, unit.position) > RALLY.commanderRange) {
    return { ...commander.position };
  }
  let nearest: Unit | undefined;
  for (const u of units) {
    if (u.side === unit.side || !isEnemyInPlay(u)) continue;
    if (!nearest || distance(u.position, unit.position) < distance(nearest.position, unit.position)) nearest = u;
  }
  if (!nearest) return { ...unit.position };
  const d = distance(nearest.position, unit.position);
  if (d === 0) return { ...unit.position };
  return {
    x: unit.position.x + ((unit.position.x - nearest.position.x) / d) * ROUT_DISTANCE_M,
    y: unit.position.y + ((unit.position.y - nearest.position.y) / d) * ROUT_DISTANCE_M,
  };
}

/**
 * The turn's morale, judged once at its end (rules decision 19): what each man
 * lost and regained, who is tested and how it went, who a leader brought back,
 * which forces broke — running, or giving up where the enemy is on top of them
 * — and which routing forces are back in the fight. Suppression halves last.
 *
 * Deterministic: forces in game order, men in force order, and a die is only
 * rolled where a test or a rally is actually taken.
 */
export function resolveMorale(ctx: MoraleContext): MoraleStepResult {
  const { rng, turn, units, stress, snapshot } = ctx;
  const result: MoraleStepResult = { reports: [], routs: [], recovered: [], surrendered: [] };
  const prepared = ctx.prepared ?? PREPARED;
  const inPlay = units.filter((u) => hasMorale(u) && !u.surrendered);

  // --- 1. What happened to each force ---
  const woundedIds = new Set<string>();
  const downIds = new Set<string>();
  const downCount = new Map<string, number>();
  const woundedCount = new Map<string, number>();
  const commandersDown: Unit[] = [];
  for (const u of units) {
    let down = 0;
    let wounded = 0;
    for (const s of u.soldiers ?? []) {
      const before = snapshot.get(s.id);
      if (!before) continue;
      if (s.neutralized && !before.neutralized) {
        downIds.add(s.id);
        down += 1;
        if (s.leader && u.kind === "command") commandersDown.push(u);
      } else if (!s.neutralized && s.damagePoints > before.damage) {
        woundedIds.add(s.id);
        wounded += 1;
      }
    }
    downCount.set(u.id, down);
    woundedCount.set(u.id, wounded);
  }

  // --- 2. Loss and gain, man by man ---
  const turnLoss = new Map<string, number>();
  for (const u of inPlay) {
    const notes = stress.get(u.id)?.firedOn ?? [];
    const firedOn = notes.length > 0;
    const bombarded = notes.some((n) => n.kind === "indirect");
    const flanked = wasFlanked(u, notes);
    const ownDown = downCount.get(u.id) ?? 0;
    const ownWounded = woundedCount.get(u.id) ?? 0;
    const leaderDown = (u.soldiers ?? []).some((s) => s.leader && downIds.has(s.id));
    const commanderDown = commandersDown.some(
      (c) => c !== u && c.side === u.side && RANK[c.echelon] > RANK[u.echelon] &&
        distance(c.position, u.position) <= (LEADER_REACH_M[c.echelon] ?? 0),
    );
    let nearbyDown = 0;
    for (const other of units) {
      if (other === u || other.side !== u.side) continue;
      if (distance(other.position, u.position) <= NEARBY_M) nearbyDown += downCount.get(other.id) ?? 0;
    }
    const enemies = units.filter((e) => e.side !== u.side && isEnemyInPlay(e));
    const friends = units.filter((f) => f.side === u.side && !f.neutralized && !f.surrendered);
    const known = enemies.filter((e) => ctx.perceives(u.side, e));
    const enemyNear = known
      .filter((e) => distance(e.position, u.position) <= OUTNUMBERED_M)
      .reduce((n, e) => n + fitCount(e), 0);
    const friendNear = friends
      .filter((f) => distance(f.position, u.position) <= OUTNUMBERED_M)
      .reduce((n, f) => n + fitCount(f), 0);
    const outnumbered = enemyNear > OUTNUMBERED_RATIO * friendNear;
    const friendlyArmourNear = (range: number) =>
      friends.some((f) => f.kind === "vehicle" && distance(f.position, u.position) <= range);
    const armourFear =
      u.kind !== "vehicle" &&
      known.some((e) => e.kind === "vehicle" && distance(e.position, u.position) <= ARMOUR_FEAR_M && ctx.sees(u, e)) &&
      !friendlyArmourNear(ARMOUR_FEAR_M);
    const own = stress.get(u.id);
    const quiet = !firedOn && ownDown === 0 && ownWounded === 0;
    const restful = quiet && !known.some((e) => distance(e.position, u.position) <= REST_CLEAR_M);

    for (const s of soldiersWithPools(u)) {
      const m = s.morale!;
      let loss = 0;
      if (firedOn) loss += LOSS.firedOn;
      if (bombarded) loss += LOSS.bombarded;
      if (woundedIds.has(s.id)) loss += LOSS.wounded;
      loss += (ownWounded - (woundedIds.has(s.id) ? 1 : 0)) * LOSS.comradeWounded;
      loss += ownDown * LOSS.comradeDown;
      loss += nearbyDown * LOSS.nearbyDown;
      if (leaderDown) loss += LOSS.squadLeaderDown;
      if (commanderDown) loss += LOSS.commanderDown;
      if (flanked) loss += LOSS.flanked;
      if (outnumbered) loss += LOSS.outnumbered;
      if (armourFear) loss += LOSS.enemyArmour;
      // A prepared defender feels less of it (author, 2026-09-23).
      if (inPosition(u)) loss = Math.round(loss * prepared.lossFactor);
      loss = Math.min(loss, LOSS.capPerTurn);

      let gain = 0;
      if ((own?.inflicted ?? 0) > 0) gain += GAIN.inflicted;
      if (own?.neutralizedEnemy) gain += GAIN.neutralizedEnemy;
      if (restful) gain += GAIN.rest;
      else if (quiet) gain += GAIN.quiet;
      if (friendlyArmourNear(ARMOUR_COMFORT_M)) gain += GAIN.friendlyArmour;

      drain(m, loss);
      refill(m, gain);
      turnLoss.set(s.id, loss);
    }
  }

  // --- 3. Tests ---
  // Every man's effective morale is read before anyone is tested: a squad
  // leader who breaks costs his men from the next turn, like any other
  // breaking — not halfway down this loop, depending on where he stood in it.
  const effectiveBefore = new Map<Soldier, number>();
  for (const u of inPlay) {
    for (const s of soldiersWithPools(u)) effectiveBefore.set(s, effectiveMorale(units, u, s));
  }
  const brokeNow = new Map<string, number>();
  for (const u of inPlay) {
    const exp = EXPERIENCE[u.experience ?? "regular"];
    const holdingBack = ctx.withdrawing(u) || u.routing === true;
    let broke = 0;
    for (const s of soldiersWithPools(u)) {
      const m = s.morale!;
      if (m.state === "broken") continue;
      if (m.state === "heroic") {
        if ((m.heroicUntilTurn ?? 0) >= turn) continue;
        m.state = "steady";
        delete m.heroicUntilTurn;
      }
      const effective = effectiveBefore.get(s) ?? effectiveMorale(units, u, s);
      if (effective <= THRESHOLDS.broken || isDry(m)) {
        m.state = "broken";
        broke += 1;
        continue;
      }
      const sharp = (turnLoss.get(s.id) ?? 0) >= EVENT_TEST_LOSS;
      const periodic =
        !holdingBack &&
        (effective <= THRESHOLDS.shaken ||
          (effective <= THRESHOLDS.wavering &&
            (m.lastTestTurn == null || turn - m.lastTestTurn >= WAVERING_TEST_INTERVAL)));
      if (!sharp && !periodic) continue;
      m.lastTestTurn = turn;
      const wisdom = s.traits?.wisdom ?? 5;
      const target =
        effective + TEST.base + TEST.perWisdom * wisdom + exp.test + (inPosition(u) ? prepared.testBonus : 0);
      if (rng.int(1, 100) <= target) continue;
      const luck = s.traits?.luck ?? 0;
      if (rng.int(1, 100) <= HEROIC.perLuck * luck) {
        m.state = "heroic";
        m.heroicUntilTurn = turn + HEROIC.turns;
        refill(m, HEROIC.willGain);
        result.reports.push({ unitId: u.id, kind: "heroic", soldiers: 1 });
        continue;
      }
      m.state = "broken";
      broke += 1;
    }
    if (broke > 0) {
      brokeNow.set(u.id, broke);
      result.reports.push({ unitId: u.id, kind: "broke", soldiers: broke });
    }
  }

  // --- 4. Rallies: hard, and only by a leader who is there ---
  for (const u of inPlay) {
    const exp = EXPERIENCE[u.experience ?? "regular"];
    const cornered = isCornered(units, u);
    const underFire = (stress.get(u.id)?.firedOn.length ?? 0) > 0;
    let rallied = 0;
    let rallierId: string | undefined;
    for (const s of soldiersWithPools(u)) {
      const m = s.morale!;
      if (m.state !== "broken" || isDry(m) || cornered) continue;
      let best: { soldier: Soldier; unit: Unit } | undefined;
      for (const other of units) {
        // A force's own leader rallies it even while it runs — he is with it;
        // a commander from another force must not himself be running.
        if (other.side !== u.side || other.surrendered || (other.routing && other !== u)) continue;
        const reach = other === u || (other.kind === "command" && distance(other.position, u.position) <= RALLY.commanderRange);
        if (!reach) continue;
        for (const l of other.soldiers ?? []) {
          if (!l.leader || l === s || l.neutralized || !l.morale || l.morale.state === "broken") continue;
          if (!best || leadership(l) > leadership(best.soldier)) best = { soldier: l, unit: other };
        }
      }
      if (!best) continue;
      const lead = leadership(best.soldier);
      const chance =
        RALLY.perLeadership * lead + exp.test - RALLY.perRally * m.timesRallied - (underFire ? RALLY.underFire : 0);
      if (chance <= 0) continue;
      if (rng.int(1, 100) > chance) continue;
      m.timesRallied += 1;
      m.will = Math.min(m.ceiling, Math.max(m.will, RALLY.baseWill + Math.floor(lead / 2)));
      m.state = "steady";
      rallied += 1;
      rallierId = best.unit.id;
    }
    if (rallied > 0) result.reports.push({ unitId: u.id, kind: "rallied", soldiers: rallied, rallierId });
  }

  // --- 5. Everyone not broken and not a hero takes the band his effective morale is in ---
  const refreshBands = () => refreshMoraleStates(units);
  refreshBands();

  // --- 6. Forces: break and run, give up, or come back ---
  const brokeAndWent: Unit[] = [];
  const sides = [...new Set(units.map((x) => x.side))];
  const watchers = (u: Unit): Side[] => sides.filter((side) => side !== u.side && ctx.watching(side, u));
  for (const u of inPlay) {
    if (u.neutralized) continue;
    if (forceBroken(units, u)) {
      if (isCornered(units, u)) {
        u.surrendered = true;
        u.routing = false;
        u.neutralized = true;
        u.canOnlyRetreat = false;
        result.surrendered.push(u.id);
        result.reports.push({ unitId: u.id, kind: "surrendered", seenBy: watchers(u) });
        brokeAndWent.push(u);
      } else if (!u.routing) {
        u.routing = true;
        for (const s of soldiersWithPools(u)) drain(s.morale!, LOSS.rout);
        result.routs.push({ unitId: u.id, to: routDestination(units, u) });
        result.reports.push({ unitId: u.id, kind: "routed", seenBy: watchers(u) });
        brokeAndWent.push(u);
      }
    } else if (u.routing) {
      u.routing = false;
      result.recovered.push(u.id);
      result.reports.push({ unitId: u.id, kind: "recovered" });
    }
  }

  // --- 7. What the breaking does to the men who saw it — felt now, tested next turn ---
  for (const u of inPlay) {
    if (u.surrendered) continue;
    // Seen, not merely near: a squad behind the crest does not know the one
    // on the other side of it has gone.
    const sawFriendsGo = brokeAndWent.some(
      (b) => b !== u && b.side === u.side && distance(b.position, u.position) <= CONTAGION_M && ctx.sees(u, b),
    );
    const comradesBroke = brokeNow.get(u.id) ?? 0;
    if (!sawFriendsGo && comradesBroke === 0) continue;
    for (const s of soldiersWithPools(u)) {
      const m = s.morale!;
      if (m.state === "broken") continue;
      drain(m, (sawFriendsGo ? LOSS.friendsBroke : 0) + comradesBroke * LOSS.comradeBroke);
    }
  }
  refreshBands();

  // --- 8. Suppression wears off ---
  for (const u of units) {
    if (u.suppression != null) u.suppression = Math.floor(u.suppression / 2);
  }
  return result;
}
