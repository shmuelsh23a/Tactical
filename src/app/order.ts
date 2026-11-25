import type { Point, Side } from "../engine/index.js";
import type { SectorHalf } from "./drill.js";

/**
 * OPORD mode's order (backlog 13, rules decisions 126 and 128): a company
 * commander's order as data — the five paragraphs, the tasks bound to
 * places on the map, and the control measures of ATP 3-21.10 (2026) para
 * 2-134 — compiled to the company plan the engine already carries out
 * (`src/sim/orderCommander.ts`). The structure is the order; the drawn
 * chart and free text come later as layers over it (decision 126's build
 * order).
 *
 * **Language-neutral.** The structured part carries no words; the free
 * text (situation, intent) is the player's own, in Hebrew or English, and
 * the order's wording in both is the UI's.
 *
 * **Nothing silently ignored.** A measure the engine does not carry out yet
 * is refused by {@link validateOrder} with "not yet carried out", never
 * dropped: an order that plays is an order whose every line did something.
 *
 * Plain JSON throughout, so a recording can carry the order as written
 * (decision 126: the order, versioned, and the actions it produced).
 */
export const ORDER_VERSION = "2026-11-23.1";

/** A place on the map: a pin, or one the engine offers the commander. */
export type Place =
  | { at: Point }
  | { suggested: "startLine" }
  /** Where the tasking puts the enemy: the brief, spoilt by an observer's error (decision 51). */
  | { suggested: "brief" }
  /** The engine's observation points on the objective (`bestVantages`), best first; 1-based. */
  | { suggested: "observationPoint"; rank: number }
  /** A scout sent straight toward the objective, bounding and looking, rather than to a point. */
  | { suggested: "towardObjective" }
  /** Covered ground beside the enemy on a flank (`flankPoints`); either side when not named. */
  | { suggested: "flank"; side?: "west" | "east" }
  /** A scout's observation point, coming in from that side: the first scout's that has one. */
  | { suggested: "scoutPost" }
  /** The last covered ground short of the enemy (`ASSAULT_POSITION_M`). */
  | { suggested: "lastCover" }
  /** Where the base-of-fire drill stops: small-arms reach of the enemy. */
  | { suggested: "smallArmsReach" };

/** A line drawn on the map: a phase line, a boundary, a trigger line. */
export interface Line {
  name: string;
  points: Point[];
}

/**
 * When something happens: H-hour, moving up, opening fire. Read off what the
 * commander's side knows, never the enemy's state.
 */
export type Trigger =
  | { when: "atOnce" }
  | { when: "turn"; turn: number }
  /** The side has the enemy near the objective in sight. */
  | { when: "enemyFound" }
  /** …and has held it in sight this many turns in a row (find, fix, then assault: decision 54). */
  | { when: "enemyFixed"; turns: number }
  | { when: "scoutsLost" }
  /** The free mortar missions are down to this many: the preparation is fired. */
  | { when: "missionsLeft"; atMost: number }
  /** Only on the commander's word: a FRAGORD (decision 126). */
  | { when: "onOrder" }
  | { all: Trigger[] }
  | { any: Trigger[] };

/** What a platoon does once the company goes. */
export type OrderTask = "assault" | "support" | "reserve" | "security";

/**
 * How the company's mortars are fired (paragraph 3's fires): `doctrine`
 * (decision 93), `opportunity` (ATP 3-21.8 para B-23's targets of
 * opportunity), `sureMarks` (the plan before 2026-10-12.1), `anyMark`.
 * `src/sim/ruleCommander.ts`'s `fireAnswer` says what each does.
 */
export type FirePolicy = "doctrine" | "opportunity" | "sureMarks" | "anyMark";

/** Fire support coordination measures (FM 3-90 (2023) paras A-89–A-95); all drawable (decision 128). */
export type FscmType =
  | "coordinatedFireLine"
  | "fireSupportCoordinationLine"
  | "restrictiveFireLine"
  | "noFireArea"
  | "restrictiveFireArea"
  | "freeFireArea"
  | "killBox";

/** The kinds of target a force engages first (FM 3-90 para A-82). */
export type TargetKind = "machineGun" | "infantry" | "command" | "vehicle" | "observer";

/**
 * The control measures of ATP 3-21.10 (2026) para 2-134, with FM 3-90
 * (2023) Appendix A's definitions, and the defence's (decision 126).
 */
export type ControlMeasure =
  // The minimum (2-134): "a PL as the LD … and point of departure; the time to initiate the operation; and the objective".
  | { kind: "lineOfDeparture"; at: Place | Line }
  | { kind: "pointOfDeparture"; at: Place }
  | { kind: "objective"; name: string; at: Place }
  // Maneuver.
  | { kind: "checkpoint"; name: string; at: Place }
  | { kind: "phaseLine"; line: Line; holdUntil?: Trigger }
  | { kind: "axisOfAdvance"; via: Place[]; widthM: number }
  | { kind: "directionOfAttack"; via: Place[] }
  | { kind: "boundary"; line: Line; between: [string, string] }
  // The final stage (2-134: "between the probable line of deployment and the objective").
  | { kind: "probableLineOfDeployment"; line: Line }
  | { kind: "assaultPosition"; at: Place; occupy: Trigger }
  /** Lift or shift the supporting fires (ATP 3-21.10 para 2-171); no line: the drill's hold-short distance from the enemy. */
  | { kind: "finalCoordinationLine"; line?: Line; holdUntilLifted: boolean }
  | { kind: "supportByFirePosition"; name: string; platoon: string; at: Place }
  | { kind: "attackByFirePosition"; name: string; platoon: string; at: Place }
  /** A drawn line, or (for now, decision 130) `beyondM` metres past the objective, square to the line of attack. */
  | { kind: "limitOfAdvance"; line?: Line; beyondM?: number }
  // Direct fire control (FM 3-90 paras A-80–A-88).
  /**
   * A platoon's primary sector (A-83; decision 131): for now a half of the
   * objective, split by the line of attack through its centre; its secondary
   * is the other half, which fire shifts to when nothing in the primary is in reach.
   */
  | { kind: "sectorOfFire"; platoon: string; primary: SectorHalf }
  | { kind: "targetReferencePoint"; name: string; at: Place }
  | { kind: "triggerLine"; platoon?: string; line: Line }
  | { kind: "engagementCriteria"; platoon?: string; openFire: Trigger }
  | { kind: "engagementPriority"; platoon?: string; order: TargetKind[] }
  // Fire support coordination.
  | { kind: "fscm"; type: FscmType; line?: Line; area?: Point[] }
  // The defence's.
  | { kind: "engagementArea"; name: string; area: Point[] }
  | { kind: "battlePosition"; name: string; platoon: string; area: Point[] };

export type MeasureKind = ControlMeasure["kind"];

/** Every kind of measure, so a misspelt one in a file is told apart from one not yet carried out. */
const MEASURE_KINDS: Record<MeasureKind, true> = {
  lineOfDeparture: true, pointOfDeparture: true, objective: true, checkpoint: true, phaseLine: true, axisOfAdvance: true,
  directionOfAttack: true, boundary: true, probableLineOfDeployment: true, assaultPosition: true, finalCoordinationLine: true,
  supportByFirePosition: true, attackByFirePosition: true, limitOfAdvance: true, sectorOfFire: true, targetReferencePoint: true,
  triggerLine: true, engagementCriteria: true, engagementPriority: true, fscm: true, engagementArea: true, battlePosition: true,
};

/** The measures placed by an `at`. */
const PLACED: readonly MeasureKind[] = [
  "lineOfDeparture", "pointOfDeparture", "objective", "checkpoint", "assaultPosition", "supportByFirePosition", "attackByFirePosition", "targetReferencePoint",
];

const TRIGGER_WHENS = ["atOnce", "turn", "enemyFound", "enemyFixed", "scoutsLost", "missionsLeft", "onOrder"] as const;
const FIRE_POLICIES: readonly FirePolicy[] = ["doctrine", "opportunity", "sureMarks", "anyMark"];
const PRIORITY_TARGETS = ["centre", "west", "east", "none"] as const;
const TASKS: readonly OrderTask[] = ["assault", "support", "reserve", "security"];

/**
 * While it waits unseen, the company is asked whether to go every fifth
 * turn (`askGo`); every turn once it holds the enemy in sight. An H-hour by
 * the clock is one of those turns, or it would slip unannounced.
 */
export const GO_ASKED_EVERY = 5;

/** A company commander's order, in the five paragraphs (ATP 3-21.10 (2026) Fig B-6). */
export interface CompanyOrder {
  version: string;
  /** The scenario it was written for, and the side that gives it. */
  scenario: string;
  side: Side;
  /** 1. Situation: the player's own words; not compiled. */
  situation?: { enemy?: string; friendly?: string; ground?: string };
  /** 2. Mission: the task and its deadline, as the tasking gives them. */
  mission: { task: "attack"; objective: string; byTurn?: number; purpose?: string };
  /** 3. Execution. */
  execution: {
    /** The commander's intent (ADP 6-0 paras 1-64–1-66): read when the plan stops fitting. */
    intent: { purpose: string; endState: string; keyTasks?: string[] };
    /** Reconnaissance: who goes ahead to find the enemy, from where, and where the rest wait. */
    recon: {
      squads: number | "onePerPlatoon";
      /** Each scout's post, in turn; a scout not named takes the engine's next-best observation point. */
      posts?: Place[];
      waitIn: "place" | "deadGround";
      /** When the company goes, the scouts open fire from their posts as a base of fire. */
      baseOfFireOnGo: boolean;
    };
    /** H-hour (FM 3-90 para A-59): when the main body crosses the line of departure. */
    timeOfAttack: Trigger;
    /** Each platoon's task once the company goes, by platoon (`platoonKey`); a platoon not named assaults. */
    tasks: Record<string, OrderTask>;
    /** The assaulting platoons bound in turn once in contact. */
    boundByPlatoon: boolean;
    fires: {
      priorityTarget: "centre" | "west" | "east" | "none";
      policy: FirePolicy;
      /** No mission before H-hour. */
      holdUntilTimeOfAttack: boolean;
    };
    measures: ControlMeasure[];
  };
  /** 4. Sustainment; 5. Command and signal: the player's own words, not compiled yet. */
  sustainment?: string;
  command?: string;
}


/**
 * What is wrong with an order, as data (AGENTS.md: the engine says what went
 * wrong as data, the app words it). `code` is what the app words, in Hebrew,
 * in `debriefText.ts` (`orderProblemHe`); `text` is the English for tools and
 * tests; `where`, `kind`, `n`, `m` and `name` are what either wording needs.
 */
export interface OrderProblem {
  code: OrderProblemCode;
  text: string;
  /** Where in the order: "timeOfAttack", "assaultPosition.occupy", a field's path. */
  where?: string;
  kind?: string;
  name?: string;
  n?: number;
  m?: number;
}

export type OrderProblemCode =
  // A file that is not an order in shape.
  | "shape"
  | "measureUnknown"
  | "measureNoPlace"
  | "version"
  // 2-134's minimum.
  | "noLineOfDeparture"
  | "noObjective"
  | "objectiveUnplaced"
  // Measures.
  | "notCarriedOut"
  | "formNotYet"
  | "onlyOneCheckpoint"
  | "oneAssaultPosition"
  | "oneFinalCoordinationLine"
  | "oneLimitOfAdvance"
  | "oneSectorAPlatoon"
  // Triggers.
  | "triggerMissing"
  | "triggerEmpty"
  | "triggerUnknown"
  | "onOrderNeedsFragord"
  | "turnWhole"
  | "turnOffCadence"
  | "fixedWhole"
  | "missionsWhole"
  | "noScoutsToFind"
  // Reconnaissance.
  | "reconSquads"
  | "postOnlyOffered"
  | "postRank"
  | "postsTooMany"
  // Fires, tasks.
  | "priorityNeverCalled"
  | "noSuchPlatoon"
  | "securityNotOffered"
  | "supportNotTasked";

const problem = (code: OrderProblemCode, text: string, more: Omit<OrderProblem, "code" | "text"> = {}): OrderProblem => ({ code, text, ...more });

/**
 * The measures the engine carries out today, and in what form. Grows a
 * measure at a time (decision 128's order of work); everything else is
 * refused, so an order never plays as if a line of it had been read.
 */
const CARRIED_OUT: Partial<Record<MeasureKind, (m: ControlMeasure) => string | undefined>> = {
  lineOfDeparture: (m) => (m.kind === "lineOfDeparture" && isSuggested(m.at, "startLine") ? undefined : "only the start line the scenario gives, for now"),
  objective: (m) => (m.kind === "objective" && isSuggested(m.at, "brief") ? undefined : "only the objective the tasking gives, for now"),
  checkpoint: (m) =>
    m.kind === "checkpoint" && (isSuggested(m.at, "flank") || isSuggested(m.at, "scoutPost")) ? undefined : "only a flank or a scout's post the engine offers, for now",
  assaultPosition: (m) => (m.kind === "assaultPosition" && isSuggested(m.at, "lastCover") ? undefined : "only the last cover the engine finds, for now"),
  finalCoordinationLine: (m) => (m.kind === "finalCoordinationLine" && !m.line ? undefined : "only at the drill's hold-short distance, not a drawn line, for now"),
  supportByFirePosition: (m) =>
    m.kind === "supportByFirePosition" && isSuggested(m.at, "smallArmsReach") ? undefined : "only where the base-of-fire drill stops, for now",
  limitOfAdvance: (m) =>
    m.kind === "limitOfAdvance" && !m.line && Number.isInteger(m.beyondM) && m.beyondM! >= LOA_RANGE_M.min && m.beyondM! <= LOA_RANGE_M.max
      ? undefined
      : `only a distance past the objective, ${LOA_RANGE_M.min} to ${LOA_RANGE_M.max} m, for now`,
  sectorOfFire: () => undefined,
};

/** The order's sectors of fire, each platoon's primary half (decision 131); empty with none. */
export function sectorsOfFire(order: CompanyOrder): Record<string, SectorHalf> {
  const out: Record<string, SectorHalf> = {};
  for (const m of order.execution.measures) if (m.kind === "sectorOfFire") out[m.platoon] = m.primary;
  return out;
}

/** The order's limit of advance, in metres past the objective; undefined with none. */
export function limitOfAdvanceM(order: CompanyOrder): number | undefined {
  const m = order.execution.measures.find((x) => x.kind === "limitOfAdvance");
  return m && m.kind === "limitOfAdvance" ? m.beyondM : undefined;
}

/** How far past the objective the form offers a limit of advance (the author, decision 130). */
export const LOA_RANGE_M = { min: 100, max: 400 } as const;

function isSuggested(p: Place | Line, what: string): boolean {
  return "suggested" in p && p.suggested === what;
}

function triggerProblems(t: Trigger | undefined, where: string): OrderProblem[] {
  if (!t || typeof t !== "object") return [problem("triggerMissing", `${where}: no trigger`, { where })];
  if ("all" in t && !Array.isArray(t.all)) return [problem("shape", `${where}: "all" is a list`, { where })];
  if ("any" in t && !Array.isArray(t.any)) return [problem("shape", `${where}: "any" is a list`, { where })];
  if ("all" in t) return t.all.length ? t.all.flatMap((x) => triggerProblems(x, where)) : [problem("triggerEmpty", `${where}: an empty "all"`, { where })];
  if ("any" in t) return t.any.length ? t.any.flatMap((x) => triggerProblems(x, where)) : [problem("triggerEmpty", `${where}: an empty "any"`, { where })];
  if (!(TRIGGER_WHENS as readonly string[]).includes(t.when))
    return [problem("triggerUnknown", `${where}: "${String(t.when)}" is not one of ${TRIGGER_WHENS.join(", ")}`, { where, name: String(t.when) })];
  if (t.when === "onOrder") return [problem("onOrderNeedsFragord", `${where}: "on order" needs a FRAGORD, not yet carried out`, { where })];
  if (t.when === "turn" && !(Number.isInteger(t.turn) && t.turn >= 1)) return [problem("turnWhole", `${where}: a turn is a whole number from 1`, { where })];
  if (t.when === "turn" && t.turn % GO_ASKED_EVERY !== 0) {
    const slips = Math.ceil(t.turn / GO_ASKED_EVERY) * GO_ASKED_EVERY;
    return [
      problem("turnOffCadence", `${where}: turn ${t.turn} is not one the company is asked on while it waits unseen (every ${GO_ASKED_EVERY}th); it would go on turn ${slips}`, {
        where,
        n: t.turn,
        m: slips,
      }),
    ];
  }
  if (t.when === "enemyFixed" && !(Number.isInteger(t.turns) && t.turns >= 1)) return [problem("fixedWhole", `${where}: held in sight for a whole number of turns from 1`, { where })];
  if (t.when === "missionsLeft" && !(Number.isInteger(t.atMost) && t.atMost >= 0)) return [problem("missionsWhole", `${where}: missions left is a whole number from 0`, { where })];
  return [];
}

/** Whether a trigger can come with no scouts out: by the clock, at once, the scouts lost, or the fires spent. */
function needsNoScouts(t: Trigger): boolean {
  if ("all" in t) return t.all.every(needsNoScouts);
  if ("any" in t) return t.any.some(needsNoScouts);
  return t.when !== "enemyFound" && t.when !== "enemyFixed" && t.when !== "onOrder";
}

/** The shape a file must have: the type's promises checked at run time, for an order read from JSON. */
function shapeProblems(order: CompanyOrder): OrderProblem[] {
  const out: OrderProblem[] = [];
  const shape = (where: string, text: string) => out.push(problem("shape", `${where}: ${text}`, { where }));
  const ex = order?.execution;
  if (!ex || typeof ex !== "object") return [problem("shape", "no execution paragraph", { where: "execution" })];
  if (!order.mission || order.mission.task !== "attack") shape("mission.task", '"attack" is the only task, for now');
  if (!ex.recon || typeof ex.recon !== "object") shape("execution.recon", "missing");
  else {
    const posts: unknown = ex.recon.posts;
    if (posts !== undefined && (!Array.isArray(posts) || posts.some((p) => !p || typeof p !== "object"))) shape("recon.posts", "a list of places");
    if (typeof ex.recon.baseOfFireOnGo !== "boolean") shape("recon.baseOfFireOnGo", "true or false");
    if (ex.recon.waitIn !== "place" && ex.recon.waitIn !== "deadGround") shape("recon.waitIn", '"place" or "deadGround"');
  }
  if (typeof ex.boundByPlatoon !== "boolean") shape("boundByPlatoon", "true or false");
  if (!ex.fires || typeof ex.fires !== "object") shape("execution.fires", "missing");
  else {
    if (!FIRE_POLICIES.includes(ex.fires.policy)) shape("fires.policy", `one of ${FIRE_POLICIES.join(", ")}`);
    if (!(PRIORITY_TARGETS as readonly string[]).includes(ex.fires.priorityTarget)) shape("fires.priorityTarget", `one of ${PRIORITY_TARGETS.join(", ")}`);
    if (typeof ex.fires.holdUntilTimeOfAttack !== "boolean") shape("fires.holdUntilTimeOfAttack", "true or false");
  }
  if (!ex.tasks || typeof ex.tasks !== "object") shape("execution.tasks", "missing");
  else for (const [k, t] of Object.entries(ex.tasks)) if (!TASKS.includes(t)) shape(`tasks.${k}`, `one of ${TASKS.join(", ")}`);
  if (!Array.isArray(ex.measures)) shape("execution.measures", "a list");
  else
    for (const m of ex.measures) {
      if (!m || typeof m.kind !== "string" || !Object.hasOwn(MEASURE_KINDS, m.kind))
        out.push(problem("measureUnknown", `measure "${String(m?.kind)}": not a control measure`, { name: String(m?.kind) }));
      else if (PLACED.includes(m.kind) && (!(m as { at?: unknown }).at || typeof (m as { at?: unknown }).at !== "object"))
        out.push(problem("measureNoPlace", `${m.kind}: no place ("at")`, { kind: m.kind }));
      else if (m.kind === "finalCoordinationLine" && typeof m.holdUntilLifted !== "boolean") shape("finalCoordinationLine.holdUntilLifted", "true or false");
      else if (m.kind === "sectorOfFire" && (typeof m.platoon !== "string" || (m.primary !== "west" && m.primary !== "east")))
        shape("sectorOfFire", 'a platoon and its primary half, "west" or "east"');
    }
  return out;
}

/**
 * What is wrong with an order; empty when it plays. `platoons`, where given,
 * are the platoons the side has (`platoonKey`).
 */
export function validateOrder(order: CompanyOrder, platoons?: readonly string[]): OrderProblem[] {
  // A file that is not an order in shape is not read further: the checks below trust the type.
  const shape = shapeProblems(order);
  if (shape.length) return shape;
  const out: OrderProblem[] = [];
  if (order.version !== ORDER_VERSION) out.push(problem("version", `version ${order.version}: this engine reads orders of version ${ORDER_VERSION}`, { name: order.version }));
  const ex = order.execution;
  const measures = ex.measures;
  // 2-134's minimum: the LD and the objective (the time to initiate is `timeOfAttack`).
  if (!measures.some((m) => m.kind === "lineOfDeparture")) out.push(problem("noLineOfDeparture", "no line of departure (ATP 3-21.10 para 2-134: the minimum)"));
  const objectives = measures.filter((m) => m.kind === "objective");
  if (!objectives.length) out.push(problem("noObjective", "no objective (ATP 3-21.10 para 2-134: the minimum)"));
  if (!objectives.some((m) => m.kind === "objective" && m.name === order.mission.objective))
    out.push(problem("objectiveUnplaced", `the mission names objective "${order.mission.objective}", which no measure places`, { name: order.mission.objective }));
  for (const m of measures) {
    const check = CARRIED_OUT[m.kind];
    if (!check) out.push(problem("notCarriedOut", `${m.kind}: not yet carried out`, { kind: m.kind }));
    else {
      const why = check(m);
      if (why) out.push(problem("formNotYet", `${m.kind}: ${why}`, { kind: m.kind }));
    }
  }
  if (measures.filter((m) => m.kind === "checkpoint").length > 1) out.push(problem("onlyOneCheckpoint", "checkpoint: only one is carried out, for now"));
  if (measures.filter((m) => m.kind === "assaultPosition").length > 1) out.push(problem("oneAssaultPosition", "assaultPosition: one a company"));
  if (measures.filter((m) => m.kind === "finalCoordinationLine").length > 1) out.push(problem("oneFinalCoordinationLine", "finalCoordinationLine: one a company"));
  if (measures.filter((m) => m.kind === "limitOfAdvance").length > 1) out.push(problem("oneLimitOfAdvance", "limitOfAdvance: one a company"));
  const sectored = measures.flatMap((m) => (m.kind === "sectorOfFire" ? [m.platoon] : []));
  for (const key of new Set(sectored)) {
    if (sectored.filter((k) => k === key).length > 1) out.push(problem("oneSectorAPlatoon", `sectorOfFire: one primary sector a platoon, and ${key} has more`, { name: key }));
    if (platoons && !platoons.includes(key)) out.push(problem("noSuchPlatoon", `sectorOfFire: the side has no platoon ${key}`, { name: key }));
  }
  out.push(...triggerProblems(ex.timeOfAttack, "timeOfAttack"));
  for (const m of measures) {
    if (m.kind !== "assaultPosition") continue;
    const problems = triggerProblems(m.occupy, "assaultPosition.occupy");
    out.push(...problems);
    if (!problems.length && ex.recon.squads === 0 && !needsNoScouts(m.occupy))
      out.push(problem("noScoutsToFind", "assaultPosition.occupy: with no scouts it waits for an enemy found that nobody is sent to find", { where: "assaultPosition.occupy" }));
  }
  // Reconnaissance.
  const { squads, posts } = ex.recon;
  if (squads !== "onePerPlatoon" && !(Number.isInteger(squads) && squads >= 0 && squads <= 3)) out.push(problem("reconSquads", "recon.squads: 0 to 3, or one a platoon"));
  for (const [i, p] of (posts ?? []).entries()) {
    if (isSuggested(p, "towardObjective")) continue;
    if (!("suggested" in p) || p.suggested !== "observationPoint")
      out.push(problem("postOnlyOffered", `recon.posts[${i}]: only an observation point the engine offers, or straight toward the objective, for now`, { n: i + 1 }));
    else if (!(Number.isInteger(p.rank) && p.rank >= 1)) out.push(problem("postRank", `recon.posts[${i}]: a rank from 1`, { n: i + 1 }));
  }
  if (typeof squads === "number" && (posts?.length ?? 0) > squads)
    out.push(problem("postsTooMany", `recon.posts: ${posts!.length} posts for ${squads} scouts`, { n: posts!.length, m: squads }));
  // With no scouts out the company is never told it has found the enemy: H-hour has to come some other way.
  if (squads === 0 && !needsNoScouts(ex.timeOfAttack))
    out.push(problem("noScoutsToFind", "timeOfAttack: with no scouts it waits for an enemy found that nobody is sent to find; add a turn, at once, or the scouts lost", { where: "timeOfAttack" }));
  // A priority target the fire policy never calls only holds missions back (FIRE_RESERVE.attackerPriority).
  if (ex.fires.priorityTarget !== "none" && (ex.fires.policy === "sureMarks" || ex.fires.policy === "anyMark"))
    out.push(
      problem(
        "priorityNeverCalled",
        `fires: the ${ex.fires.policy} policy never calls a priority target, so naming one only holds its missions back; name none, or fire by doctrine or opportunity`,
        { name: ex.fires.policy },
      ),
    );
  // Tasks and the positions that go with them.
  for (const [key, task] of Object.entries(ex.tasks)) {
    if (platoons && !platoons.includes(key)) out.push(problem("noSuchPlatoon", `tasks: the side has no platoon ${key}`, { name: key }));
    if (task === "security") out.push(problem("securityNotOffered", `tasks.${key}: security is not offered when the company goes, for now`, { name: key }));
  }
  for (const m of measures) {
    if (m.kind !== "supportByFirePosition") continue;
    if (ex.tasks[m.platoon] !== "support")
      out.push(problem("supportNotTasked", `supportByFirePosition ${m.name}: platoon ${m.platoon} is not given the support task`, { name: m.platoon }));
  }
  return out;
}
