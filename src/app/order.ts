import type { Point, Side } from "../engine/index.js";

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
  | { kind: "limitOfAdvance"; line: Line }
  // Direct fire control (FM 3-90 paras A-80–A-88).
  | { kind: "sectorOfFire"; platoon: string; fromBearing: number; toBearing: number }
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
};

function isSuggested(p: Place | Line, what: string): boolean {
  return "suggested" in p && p.suggested === what;
}

function triggerProblems(t: Trigger | undefined, where: string): string[] {
  if (!t || typeof t !== "object") return [`${where}: no trigger`];
  if ("all" in t && !Array.isArray(t.all)) return [`${where}: "all" is a list`];
  if ("any" in t && !Array.isArray(t.any)) return [`${where}: "any" is a list`];
  if ("all" in t) return t.all.length ? t.all.flatMap((x) => triggerProblems(x, where)) : [`${where}: an empty "all"`];
  if ("any" in t) return t.any.length ? t.any.flatMap((x) => triggerProblems(x, where)) : [`${where}: an empty "any"`];
  if (!(TRIGGER_WHENS as readonly string[]).includes(t.when)) return [`${where}: "${String(t.when)}" is not one of ${TRIGGER_WHENS.join(", ")}`];
  if (t.when === "onOrder") return [`${where}: "on order" needs a FRAGORD, not yet carried out`];
  if (t.when === "turn" && !(Number.isInteger(t.turn) && t.turn >= 1)) return [`${where}: a turn is a whole number from 1`];
  if (t.when === "turn" && t.turn % GO_ASKED_EVERY !== 0)
    return [`${where}: turn ${t.turn} is not one the company is asked on while it waits unseen (every ${GO_ASKED_EVERY}th); it would go on turn ${Math.ceil(t.turn / GO_ASKED_EVERY) * GO_ASKED_EVERY}`];
  if (t.when === "enemyFixed" && !(Number.isInteger(t.turns) && t.turns >= 1)) return [`${where}: held in sight for a whole number of turns from 1`];
  if (t.when === "missionsLeft" && !(Number.isInteger(t.atMost) && t.atMost >= 0)) return [`${where}: missions left is a whole number from 0`];
  return [];
}

/** Whether a trigger can come with no scouts out: by the clock, at once, the scouts lost, or the fires spent. */
function needsNoScouts(t: Trigger): boolean {
  if ("all" in t) return t.all.every(needsNoScouts);
  if ("any" in t) return t.any.some(needsNoScouts);
  return t.when !== "enemyFound" && t.when !== "enemyFixed" && t.when !== "onOrder";
}

/** The shape a file must have: the type's promises checked at run time, for an order read from JSON. */
function shapeProblems(order: CompanyOrder): string[] {
  const out: string[] = [];
  const ex = order?.execution;
  if (!ex || typeof ex !== "object") return ["no execution paragraph"];
  if (!order.mission || order.mission.task !== "attack") out.push('mission.task: "attack" is the only task, for now');
  if (!ex.recon || typeof ex.recon !== "object") out.push("execution.recon: missing");
  else {
    const posts: unknown = ex.recon.posts;
    if (posts !== undefined && (!Array.isArray(posts) || posts.some((p) => !p || typeof p !== "object"))) out.push("recon.posts: a list of places");
    if (typeof ex.recon.baseOfFireOnGo !== "boolean") out.push("recon.baseOfFireOnGo: true or false");
    if (ex.recon.waitIn !== "place" && ex.recon.waitIn !== "deadGround") out.push('recon.waitIn: "place" or "deadGround"');
  }
  if (typeof ex.boundByPlatoon !== "boolean") out.push("boundByPlatoon: true or false");
  if (!ex.fires || typeof ex.fires !== "object") out.push("execution.fires: missing");
  else {
    if (!FIRE_POLICIES.includes(ex.fires.policy)) out.push(`fires.policy: one of ${FIRE_POLICIES.join(", ")}`);
    if (!(PRIORITY_TARGETS as readonly string[]).includes(ex.fires.priorityTarget)) out.push(`fires.priorityTarget: one of ${PRIORITY_TARGETS.join(", ")}`);
    if (typeof ex.fires.holdUntilTimeOfAttack !== "boolean") out.push("fires.holdUntilTimeOfAttack: true or false");
  }
  if (!ex.tasks || typeof ex.tasks !== "object") out.push("execution.tasks: missing");
  else for (const [k, t] of Object.entries(ex.tasks)) if (!TASKS.includes(t)) out.push(`tasks.${k}: one of ${TASKS.join(", ")}`);
  if (!Array.isArray(ex.measures)) out.push("execution.measures: a list");
  else
    for (const m of ex.measures) {
      if (!m || typeof m.kind !== "string" || !Object.hasOwn(MEASURE_KINDS, m.kind)) out.push(`measure "${String(m?.kind)}": not a control measure`);
      else if (PLACED.includes(m.kind) && (!(m as { at?: unknown }).at || typeof (m as { at?: unknown }).at !== "object")) out.push(`${m.kind}: no place ("at")`);
      else if (m.kind === "finalCoordinationLine" && typeof m.holdUntilLifted !== "boolean") out.push("finalCoordinationLine.holdUntilLifted: true or false");
    }
  return out;
}

/**
 * What is wrong with an order, as data the app words; empty when it plays.
 * `platoons`, where given, are the platoons the side has (`platoonKey`).
 */
export function validateOrder(order: CompanyOrder, platoons?: readonly string[]): string[] {
  // A file that is not an order in shape is not read further: the checks below trust the type.
  const shape = shapeProblems(order);
  if (shape.length) return shape;
  const out: string[] = [];
  if (order.version !== ORDER_VERSION) out.push(`version ${order.version}: this engine reads orders of version ${ORDER_VERSION}`);
  const ex = order.execution;
  const measures = ex.measures;
  // 2-134's minimum: the LD and the objective (the time to initiate is `timeOfAttack`).
  if (!measures.some((m) => m.kind === "lineOfDeparture")) out.push("no line of departure (ATP 3-21.10 para 2-134: the minimum)");
  const objectives = measures.filter((m) => m.kind === "objective");
  if (!objectives.length) out.push("no objective (ATP 3-21.10 para 2-134: the minimum)");
  if (!objectives.some((m) => m.kind === "objective" && m.name === order.mission.objective)) out.push(`the mission names objective "${order.mission.objective}", which no measure places`);
  for (const m of measures) {
    const check = CARRIED_OUT[m.kind];
    if (!check) out.push(`${m.kind}: not yet carried out`);
    else {
      const why = check(m);
      if (why) out.push(`${m.kind}: ${why}`);
    }
  }
  if (measures.filter((m) => m.kind === "checkpoint").length > 1) out.push("checkpoint: only one is carried out, for now");
  if (measures.filter((m) => m.kind === "assaultPosition").length > 1) out.push("assaultPosition: one a company");
  if (measures.filter((m) => m.kind === "finalCoordinationLine").length > 1) out.push("finalCoordinationLine: one a company");
  out.push(...triggerProblems(ex.timeOfAttack, "timeOfAttack"));
  for (const m of measures) {
    if (m.kind !== "assaultPosition") continue;
    const problems = triggerProblems(m.occupy, "assaultPosition.occupy");
    out.push(...problems);
    if (!problems.length && ex.recon.squads === 0 && !needsNoScouts(m.occupy)) out.push("assaultPosition.occupy: with no scouts it waits for an enemy found that nobody is sent to find");
  }
  // Reconnaissance.
  const { squads, posts } = ex.recon;
  if (squads !== "onePerPlatoon" && !(Number.isInteger(squads) && squads >= 0 && squads <= 3)) out.push("recon.squads: 0 to 3, or one a platoon");
  for (const [i, p] of (posts ?? []).entries()) {
    if (isSuggested(p, "towardObjective")) continue;
    if (!("suggested" in p) || p.suggested !== "observationPoint") out.push(`recon.posts[${i}]: only an observation point the engine offers, or straight toward the objective, for now`);
    else if (!(Number.isInteger(p.rank) && p.rank >= 1)) out.push(`recon.posts[${i}]: a rank from 1`);
  }
  if (typeof squads === "number" && (posts?.length ?? 0) > squads) out.push(`recon.posts: ${posts!.length} posts for ${squads} scouts`);
  // With no scouts out the company is never told it has found the enemy: H-hour has to come some other way.
  if (squads === 0 && !needsNoScouts(ex.timeOfAttack)) out.push("timeOfAttack: with no scouts it waits for an enemy found that nobody is sent to find; add a turn, at once, or the scouts lost");
  // A priority target the fire policy never calls only holds missions back (FIRE_RESERVE.attackerPriority).
  if (ex.fires.priorityTarget !== "none" && (ex.fires.policy === "sureMarks" || ex.fires.policy === "anyMark"))
    out.push(`fires: the ${ex.fires.policy} policy never calls a priority target, so naming one only holds its missions back; name none, or fire by doctrine or opportunity`);
  // Tasks and the positions that go with them.
  for (const [key, task] of Object.entries(ex.tasks)) {
    if (platoons && !platoons.includes(key)) out.push(`tasks: the side has no platoon ${key}`);
    if (task === "security") out.push(`tasks.${key}: security is not offered when the company goes, for now`);
  }
  for (const m of measures) {
    if (m.kind !== "supportByFirePosition") continue;
    if (ex.tasks[m.platoon] !== "support") out.push(`supportByFirePosition ${m.name}: platoon ${m.platoon} is not given the support task`);
  }
  return out;
}
