import { ORDER_VERSION, type CompanyOrder, type ControlMeasure, type OrderTask, type Trigger } from "./order.js";
import type { ReferenceOrder } from "./referenceOrders.js";
import type { Side } from "../engine/index.js";
import { boundaryEnds, boundaryFrom, limitOfAdvanceFrom, sectorsFrom, type SectorHalf } from "./drill.js";

/**
 * The order form's model (OPORD mode, decision 128): the choices the form
 * offers, and the `CompanyOrder` they make. Kept apart from the component so
 * what the form writes is tested without a browser, and so a reference plan
 * loaded as a template reads back into the same choices.
 */

/** H-hour as the form offers it: the shapes of trigger the reference plans use, and two more. */
export type HHour =
  /** Find, fix, then assault: the enemy held in sight `turns` turns, or the scouts all lost (decision 54). */
  | { kind: "fixed"; turns: number }
  /** In as soon as the enemy is found, or the scouts are lost. */
  | { kind: "found" }
  /** Fire first: by turn `byTurn` whatever, or the enemy fixed `turns` turns with the free missions down to `missions`, or the scouts lost. */
  | { kind: "prep"; turns: number; missions: number; byTurn: number }
  /** By the clock: on turn `turn` (a fifth turn, `GO_ASKED_EVERY`), or the scouts lost. */
  | { kind: "turn"; turn: number }
  | { kind: "atOnce" };

export type Axis = "straight" | "flank" | "west" | "east" | "scoutPost";

/** Everything the form sets, flat. */
export interface OrderChoices {
  situation: { enemy: string; friendly: string };
  intent: { purpose: string; endState: string };
  scouts: number | "onePerPlatoon";
  /** Each scout's post: an observation point's rank (1-based), or 0 for straight toward the objective. */
  posts: number[];
  waitIn: "place" | "deadGround";
  scoutsFireOnGo: boolean;
  hHour: HHour;
  /** Move up to the last cover before going: never, once the enemy is found, or at once. */
  moveUp: "no" | "found" | "atOnce";
  axis: Axis;
  tasks: Record<string, OrderTask>;
  bound: boolean;
  holdShort: boolean;
  priority: "centre" | "west" | "east" | "none";
  policy: CompanyOrder["execution"]["fires"]["policy"];
  holdFireUntilHHour: boolean;
  /** A limit of advance this many metres past the objective (decision 130); 0 for none. */
  loa: number;
  /** Each sectored platoon's primary half of the objective (decision 131); a platoon not named covers the whole of it. */
  sectors: Record<string, SectorHalf>;
  /** Each laned platoon's lane under the boundary (decision 132); none named, no boundary. */
  lanes: Record<string, SectorHalf>;
}

export const OBJECTIVE_NAME = "OBJ";

const SCOUTS_LOST: Trigger = { when: "scoutsLost" };

export function triggerOf(h: HHour): Trigger {
  switch (h.kind) {
    case "fixed":
      return { any: [{ when: "enemyFixed", turns: h.turns }, SCOUTS_LOST] };
    case "found":
      return { any: [{ when: "enemyFound" }, SCOUTS_LOST] };
    case "prep":
      return { any: [{ when: "turn", turn: h.byTurn }, SCOUTS_LOST, { all: [{ when: "enemyFixed", turns: h.turns }, { when: "missionsLeft", atMost: h.missions }] }] };
    case "turn":
      return { any: [{ when: "turn", turn: h.turn }, SCOUTS_LOST] };
    case "atOnce":
      return { when: "atOnce" };
  }
}

/** The form's H-hour for a trigger it wrote, or undefined for one it does not offer. */
export function hHourOf(t: Trigger): HHour | undefined {
  const same = (a: Trigger, b: Trigger) => JSON.stringify(a) === JSON.stringify(b);
  if ("when" in t && t.when === "atOnce") return { kind: "atOnce" };
  if (!("any" in t)) return undefined;
  const [first] = t.any;
  if (!first || !("when" in first)) return undefined;
  const guesses: HHour[] = [];
  if (first.when === "enemyFixed") guesses.push({ kind: "fixed", turns: first.turns });
  if (first.when === "enemyFound") guesses.push({ kind: "found" });
  if (first.when === "turn") {
    guesses.push({ kind: "turn", turn: first.turn });
    const all = t.any[2];
    if (all && "all" in all) {
      const fixed = all.all.find((x) => "when" in x && x.when === "enemyFixed");
      const left = all.all.find((x) => "when" in x && x.when === "missionsLeft");
      if (fixed && "when" in fixed && fixed.when === "enemyFixed" && left && "when" in left && left.when === "missionsLeft")
        guesses.push({ kind: "prep", turns: fixed.turns, missions: left.atMost, byTurn: first.turn });
    }
  }
  return guesses.find((h) => same(triggerOf(h), t));
}

/** The order the choices make, for `scenario` and `side`. */
export function orderOf(c: OrderChoices, scenario: string, side: Side, byTurn?: number): CompanyOrder {
  const measures: ControlMeasure[] = [
    { kind: "lineOfDeparture", at: { suggested: "startLine" } },
    { kind: "objective", name: OBJECTIVE_NAME, at: { suggested: "brief" } },
  ];
  for (const [platoon, task] of Object.entries(c.tasks))
    if (task === "support") measures.push({ kind: "supportByFirePosition", name: `SBF ${platoon}`, platoon, at: { suggested: "smallArmsReach" } });
  if (c.holdShort) measures.push({ kind: "finalCoordinationLine", holdUntilLifted: true });
  if (c.moveUp !== "no")
    measures.push({ kind: "assaultPosition", at: { suggested: "lastCover" }, occupy: c.moveUp === "found" ? { when: "enemyFound" } : { when: "atOnce" } });
  if (c.loa > 0) measures.push({ kind: "limitOfAdvance", beyondM: c.loa });
  for (const [platoon, primary] of Object.entries(c.sectors)) measures.push({ kind: "sectorOfFire", platoon, primary });
  if (Object.keys(c.lanes).length) measures.push({ kind: "boundary", lanes: { ...c.lanes } });
  if (c.axis !== "straight")
    measures.push({
      kind: "checkpoint",
      name: "CP 1",
      at: c.axis === "scoutPost" ? { suggested: "scoutPost" } : c.axis === "flank" ? { suggested: "flank" } : { suggested: "flank", side: c.axis },
    });
  const scouts = c.scouts === "onePerPlatoon" ? undefined : c.scouts;
  const posts = c.posts.slice(0, scouts ?? c.posts.length);
  // A post left as the engine's own choice for that scout is not written: the order says only what the player set.
  const written = posts.map((rank, i) => (rank === 0 ? { suggested: "towardObjective" as const } : { suggested: "observationPoint" as const, rank: rank || i + 1 }));
  const defaultPosts = written.every((p, i) => p.suggested === "observationPoint" && p.rank === i + 1);
  return {
    version: ORDER_VERSION,
    scenario,
    side,
    ...(c.situation.enemy || c.situation.friendly ? { situation: { ...(c.situation.enemy ? { enemy: c.situation.enemy } : {}), ...(c.situation.friendly ? { friendly: c.situation.friendly } : {}) } } : {}),
    mission: { task: "attack", objective: OBJECTIVE_NAME, ...(byTurn !== undefined ? { byTurn } : {}) },
    execution: {
      intent: { purpose: c.intent.purpose, endState: c.intent.endState },
      recon: { squads: c.scouts, ...(defaultPosts ? {} : { posts: written }), waitIn: c.waitIn, baseOfFireOnGo: c.scoutsFireOnGo },
      timeOfAttack: triggerOf(c.hHour),
      tasks: { ...c.tasks },
      boundByPlatoon: c.bound,
      fires: { priorityTarget: c.priority, policy: c.policy, holdUntilTimeOfAttack: c.holdFireUntilHHour },
      measures,
    },
  };
}

/** The form's choices for an order it can show (a reference plan as a template); undefined for one it cannot. */
export function choicesOf(o: CompanyOrder): OrderChoices | undefined {
  const ex = o.execution;
  const hHour = hHourOf(ex.timeOfAttack);
  if (!hHour) return undefined;
  const m = <K extends ControlMeasure["kind"]>(k: K) => ex.measures.find((x): x is Extract<ControlMeasure, { kind: K }> => x.kind === k);
  const ap = m("assaultPosition");
  const cp = m("checkpoint");
  const at = cp && "suggested" in cp.at ? cp.at : undefined;
  const axis: Axis = !at ? "straight" : at.suggested === "scoutPost" ? "scoutPost" : at.suggested === "flank" ? (at.side ?? "flank") : "straight";
  return {
    situation: { enemy: o.situation?.enemy ?? "", friendly: o.situation?.friendly ?? "" },
    intent: { purpose: ex.intent.purpose, endState: ex.intent.endState },
    scouts: ex.recon.squads,
    posts: (ex.recon.posts ?? []).map((p) => ("suggested" in p && p.suggested === "observationPoint" ? p.rank : 0)),
    waitIn: ex.recon.waitIn,
    scoutsFireOnGo: ex.recon.baseOfFireOnGo,
    hHour,
    moveUp: !ap ? "no" : "when" in ap.occupy && ap.occupy.when === "atOnce" ? "atOnce" : "found",
    axis,
    tasks: { ...ex.tasks },
    bound: ex.boundByPlatoon,
    holdShort: !!m("finalCoordinationLine")?.holdUntilLifted,
    priority: ex.fires.priorityTarget,
    policy: ex.fires.policy,
    holdFireUntilHHour: ex.fires.holdUntilTimeOfAttack,
    loa: m("limitOfAdvance")?.beyondM ?? 0,
    sectors: Object.fromEntries(ex.measures.flatMap((x) => (x.kind === "sectorOfFire" ? [[x.platoon, x.primary]] : []))),
    lanes: { ...(m("boundary")?.lanes ?? {}) },
  };
}

/** The intent the form opens with: the tasking's, in Hebrew, for the player to rewrite. */
export const DEFAULT_INTENT = {
  purpose: "היעד נכבש כדי שהגדוד יוכל להשתמש בו.",
  endState: "האויב אינו על היעד, והפלוגה עליו עד המועד ועדיין כשירה להילחם.",
};

/** The form's opening order: the first reference plan's, in the player's words. */
export function defaultChoices(templates: readonly ReferenceOrder[]): OrderChoices {
  const c = templates[0] ? choicesOf(templates[0].order) : undefined;
  if (c) return { ...c, intent: { ...DEFAULT_INTENT } };
  return (
    c ?? {
      situation: { enemy: "", friendly: "" },
      intent: { ...DEFAULT_INTENT },
      scouts: "onePerPlatoon",
      posts: [],
      waitIn: "deadGround",
      scoutsFireOnGo: false,
      hHour: { kind: "fixed", turns: 4 },
      moveUp: "no",
      axis: "straight",
      tasks: {},
      bound: false,
      holdShort: false,
      priority: "centre",
      policy: "doctrine",
      holdFireUntilHHour: false,
      loa: 0,
      sectors: {},
      lanes: {},
    }
  );
}

/** How many scouts the choices send, on a side with `platoons` platoons (as the planning question reads it: one a platoon, at most three). */
export function scoutCount(c: OrderChoices, platoons: number): number {
  return c.scouts === "onePerPlatoon" ? Math.max(1, Math.min(3, platoons)) : c.scouts;
}

/** Each scout's post as the battle will take it: the rank set, else the scout's own (scout i to point i), 0 straight. */
export function effectivePosts(c: OrderChoices, platoons: number): number[] {
  return Array.from({ length: scoutCount(c, platoons) }, (_, i) => c.posts[i] ?? i + 1);
}

/**
 * A post as the battle will take it on ground offering `points` observation
 * points: a rank past them is the best one (the order's intent, logged), and
 * with none at all a scout goes straight.
 */
export function postAsTaken(rank: number, points: number): number {
  if (rank === 0 || points === 0) return 0;
  return rank > points ? 1 : rank;
}

/** A place on the map the form offers (`MapView`'s `OrderMark`, without the map's types). */
export interface FormMark {
  id: string;
  at: { x: number; y: number };
  label: string;
  kind: "op" | "flank" | "assault" | "target" | "objective" | "loa" | "sector" | "boundary";
  chosen: boolean;
  /** A line's other end: the mark is drawn from `at` to here. */
  to?: { x: number; y: number };
}

const TARGET_NAMES = { centre: "מרכז", west: "מערב", east: "מזרח" } as const;
const HALF_NAMES = { west: "חצי מערבי", east: "חצי מזרחי" } as const;
const LANE_NAMES = { west: "נתיב מערבי", east: "נתיב מזרחי" } as const;

/**
 * The order's lines kept on the map once it is given (decisions 130-132): the
 * limit of advance, the line between the sectors, and the boundary as it now
 * runs, redrawn when a request is granted.
 */
export function battleMarks(marks: readonly FormMark[], boundary: readonly [{ x: number; y: number }, { x: number; y: number }] | undefined, lanes: Readonly<Record<string, SectorHalf>>): FormMark[] {
  const kept = marks.filter((m) => m.kind === "loa" || m.kind === "sector");
  return boundary ? [...kept, { id: "boundary", at: boundary[0], to: boundary[1], label: boundaryLabel(lanes), kind: "boundary", chosen: true }] : kept;
}

/** The boundary's label on the map: who is in which lane. */
export function boundaryLabel(lanes: Readonly<Record<string, SectorHalf>>): string {
  const of = (h: SectorHalf) => Object.entries(lanes).filter(([, x]) => x === h).map(([p]) => p).join(", ");
  return `גבול גזרה: ${(["west", "east"] as const).filter((h) => of(h)).map((h) => `${LANE_NAMES[h]} — ${of(h)}`).join(" · ")}`;
}
/** How far each way from the objective the line between the sectors is drawn: across the whole position (ours). */
const SECTOR_LINE_M = 400;

/** The places the form draws, from what the battle will offer and what is chosen. */
export function formMarks(
  ground: { objective: { x: number; y: number }; startLine: { x: number; y: number }; observationPoints: readonly { x: number; y: number }[]; flanks: readonly { side: "west" | "east"; at: { x: number; y: number } }[]; assaultPosition: { x: number; y: number } | undefined; planned: readonly { x: number; y: number }[]; platoons: readonly string[] },
  c: OrderChoices,
): FormMark[] {
  const posts = effectivePosts(c, ground.platoons.length).map((r) => postAsTaken(r, ground.observationPoints.length));
  const marks: FormMark[] = [{ id: "objective", at: ground.objective, label: "יעד (לפי התדריך)", kind: "objective", chosen: true }];
  ground.observationPoints.forEach((at, i) => {
    const scouts = posts.flatMap((r, s) => (r === i + 1 ? [s + 1] : []));
    marks.push({ id: `op:${i + 1}`, at, label: `נ"ת ${i + 1}${scouts.length ? ` — סייר ${scouts.join(", ")}` : ""}`, kind: "op", chosen: scouts.length > 0 });
  });
  for (const f of ground.flanks)
    marks.push({ id: `flank:${f.side}`, at: f.at, label: f.side === "west" ? "אגף מערבי" : "אגף מזרחי", kind: "flank", chosen: c.axis === f.side || (c.axis === "flank" && f === ground.flanks[0]) });
  if (ground.assaultPosition) marks.push({ id: "assault", at: ground.assaultPosition, label: "עמדת הסתערות (בערך)", kind: "assault", chosen: c.moveUp !== "no" });
  if (c.loa > 0) {
    const loa = limitOfAdvanceFrom(ground.startLine, ground.objective, c.loa);
    const across = { x: -loa.beyond.y * loa.halfWidth, y: loa.beyond.x * loa.halfWidth };
    marks.push({
      id: "loa",
      at: { x: loa.at.x - across.x, y: loa.at.y - across.y },
      to: { x: loa.at.x + across.x, y: loa.at.y + across.y },
      label: `קו גבול התקדמות — ${c.loa} מ' מעבר ליעד`,
      kind: "loa",
      chosen: true,
    });
  }
  const sectored = Object.entries(c.sectors);
  if (sectored.length) {
    // The line of attack through the objective, which splits it into the two halves (decision 131).
    const s = sectorsFrom(ground.startLine, ground.objective, c.sectors);
    const along = { x: -s.west.y * SECTOR_LINE_M, y: s.west.x * SECTOR_LINE_M };
    const of = (h: SectorHalf) => sectored.filter(([, x]) => x === h).map(([p]) => p).join(", ");
    const words = (["west", "east"] as const).filter((h) => of(h)).map((h) => `${HALF_NAMES[h]} — ${of(h)}`);
    marks.push({
      id: "sector",
      at: { x: ground.objective.x - along.x, y: ground.objective.y - along.y },
      to: { x: ground.objective.x + along.x, y: ground.objective.y + along.y },
      label: `גזרות אש: ${words.join(" · ")}`,
      kind: "sector",
      chosen: true,
    });
  }
  const laned = Object.entries(c.lanes);
  if (laned.length) {
    const [from, to] = boundaryEnds(boundaryFrom(ground.startLine, ground.objective, c.lanes));
    marks.push({ id: "boundary", at: from, to, label: boundaryLabel(c.lanes), kind: "boundary", chosen: true });
  }
  (["centre", "west", "east"] as const).forEach((t, i) => {
    const at = ground.planned[i];
    if (at) marks.push({ id: `target:${t}`, at, label: `מטרה ${i + 1} — ${TARGET_NAMES[t]}${c.priority === t ? " (עדיפות)" : ""}`, kind: "target", chosen: c.priority === t });
  });
  return marks;
}

/**
 * A click on a mark: an observation point to the scout being placed
 * (`scout`, 1-based); a flank as the axis, again to clear it; the assault
 * position on or off; a fire-plan point as the priority target, again for none.
 */
export function applyMark(c: OrderChoices, id: string, scout: number, platoons: number): OrderChoices {
  const [kind, value] = id.split(":");
  if (kind === "op") {
    const posts = effectivePosts(c, platoons);
    if (scout < 1 || scout > posts.length) return c;
    posts[scout - 1] = Number(value);
    return { ...c, posts };
  }
  if (kind === "flank") return { ...c, axis: c.axis === value ? "straight" : (value as "west" | "east") };
  if (kind === "assault") return { ...c, moveUp: c.moveUp === "no" ? "found" : "no" };
  if (kind === "target") return { ...c, priority: c.priority === value ? "none" : (value as "centre" | "west" | "east") };
  return c;
}
