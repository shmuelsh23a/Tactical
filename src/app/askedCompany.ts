import { ScriptedCompany, ASSAULT_POSITION_M, FIND_WITHIN_M, HOLD_SHORT_M, VANTAGE_RING_M, type CompanyGround, type CompanyOrders, type CompanyPlan, type PlatoonTask } from "./company.js";
import { casualtiesSeen, underFire, viewOf, type Decider, type Question } from "./companyQuestions.js";
import {
  ADJUSTMENT_RADIUS_M,
  CE_PER_SIGMA,
  EYE_HEIGHT,
  groundHeight,
  distance,
  terrainBlocksSight,
  type Game,
  type IndirectFireResult,
  type Point,
  type Side,
  type Unit,
} from "../engine/index.js";
import { bestVantages } from "./deadGround.js";
import {
  FIRE_RESERVE,
  liftFor,
  ownClearOf,
  firingOnUs,
  priorityAim,
  priorityReserve,
  mortarFree,
  tubeFree,
  tubesOf,
  type AttackerFireTally,
} from "./computerSide.js";
import { SCOUT_GIVE_UP_TURNS, type DrillState } from "./drill.js";
import { hasEyesOn, sideView } from "./hotseat.js";
import { GO_ASKED_EVERY } from "./order.js";

const MORTAR = "mortar";
/**
 * Danger close: a mark within this of the caller's own squads puts them in
 * the bombs' reach too (the browser tool's 150 m). Since rules decision 63
 * (S4, author 2026-09-30: "danger close as risk") it is a risk the caller is
 * told of and takes, not a mark he is refused.
 */
const DANGER_CLOSE_M = 150;
/** Fires lifted for the assault shift beyond this of the company's squads (ours). */
const LIFTED_CLEAR_M = 300;

/**
 * The attacking company commander asked its decisions as typed questions
 * (README, backlog 15): whoever answers them — Jev, a Claude model, the
 * scripted commander's rule, or a player's order (decisions 126 and 128) —
 * the questions, their pictures and when they are asked are these.
 *
 * Moved here from `src/sim/scenarioBattle.ts` (2026-11-23) so the browser can
 * play a company by an order as the headless runner does: one loop, two
 * drivers. {@link AskedAttacker} holds what the loop carries from turn to
 * turn; the runner and the app each call it phase by phase.
 */
export class AskedAttacker {
  readonly company: ScriptedCompany;
  /** What it has fired, counted as its missions are called. */
  readonly fire: AttackerFireTally = { missions: 0, smoke: 0 };
  /** The priority target, once named (decision 93). */
  readonly priority: Point | undefined;
  private readonly planned: readonly Point[];
  private readonly seenHits = new Map<string, number>();
  /** Each scout's fit men at its last question, and the turn each was last asked about. */
  private readonly scoutFit = new Map<string, number>();
  private readonly scoutAsked = new Map<string, number>();
  /** Each squad's fit men at the last platoon question, and when each platoon was last asked about. */
  private readonly platoonFit = new Map<string, number>();
  private readonly platoonAsked = new Map<string, number>();
  private readonly ground: { width: number; height: number };
  private readonly question: (q: Omit<Question, "turn" | "view">) => string;

  /**
   * Asks the planning questions at once: scouts, their posts, where the rest
   * wait, the priority target. `drillChoices` are the plan's switches set
   * outside the questions (covered routes, arriving together).
   */
  constructor(
    private readonly g: Game,
    readonly side: Side,
    private readonly objective: Point,
    private readonly startLine: Point,
    plan: { planned: readonly Point[]; suspected: readonly Point[] },
    ground: CompanyGround,
    decide: Decider,
    brief?: string,
    drillChoices: Pick<CompanyPlan, "coveredRoutes" | "arriveTogether"> = {},
  ) {
    this.planned = plan.planned;
    this.ground = { width: ground.width, height: ground.height };
    // Free mortar missions: a priority target's held ones are not (decision 93); the guns on their own line (decision 95).
    const mortarLeft = () => {
      const left = missionsLeft(g, side, true);
      const reserve = priorityReserve(g, side, this.priority);
      return left == null ? null : left - (reserve.tube !== "artillery" ? reserve.held : 0);
    };
    const gunsLeft = () => {
      const n = g.mayCall(side, "artillery") ? g.fireMissionsLeft(side, "artillery") : undefined;
      if (n === undefined) return undefined;
      const reserve = priorityReserve(g, side, this.priority);
      return { left: n, held: reserve.tube === "artillery" ? reserve.held : 0 };
    };
    // Where the company stands, once there is a company: a commander knows what it has ordered.
    const stage = () => (this.company ? companyStage(g, this.company) : undefined);
    const released = () => !!this.company && this.company.released !== undefined;
    this.question = (q) =>
      decide({
        ...q,
        turn: g.turn,
        view: viewOf(g, side, { objective, mortarLeft: mortarLeft(), gunsLeft: gunsLeft(), ...(brief !== undefined ? { brief } : {}), startLine, reports: this.reports(), stage: stage() }),
        facts: { mortarLeft: mortarLeft(), released: released(), ...q.facts },
      });
    const companyPlan = askPlan(g, side, objective, plan.suspected, ground.width, ground.height, this.question);
    // The asked commander names its priority target (decision 93's fire plan, in the questions).
    this.priority = tubesOf(g, side).length ? askPriority(plan.planned, this.question) : undefined;
    this.company = new ScriptedCompany(g, side, objective, plan.suspected, { ...companyPlan, ...drillChoices }, ground);
  }

  /** What the side's mortars did, as its forces saw it: hand it every phase's resolved fire. */
  heard(res: IndirectFireResult[] | undefined): void {
    const g = this.g;
    for (const r of res ?? []) {
      if (r.side !== this.side) continue;
      for (const t of r.blast.targets) {
        const u = g.getUnit(t.unitId);
        if (u.side === this.side || !t.caught || !hasEyesOn(g, this.side, u)) continue;
        this.seenHits.set(u.id, (this.seenHits.get(u.id) ?? 0) + t.newCasualties);
      }
    }
  }

  /** What its fire did since it was last asked, told once. */
  private reports(): string[] {
    const out = [...this.seenHits].map(
      ([id, n]) => `${id}: hit by your mortars, ${casualtiesSeen(n)}${this.g.getUnit(id).neutralized ? ", now out of action" : ""}`,
    );
    this.seenHits.clear();
    return out;
  }

  /** The targeting phase: the fire question. */
  targeting(): void {
    askAttackerFire(this.g, this.side, this.company, this.fire, this.question, this.planned, this.priority);
  }

  /** The movement phase's questions — scouts, platoons, whether to go — and the turn's orders they come to. */
  movement(turn: number, state: DrillState): CompanyOrders {
    const g = this.g;
    askScouts(g, this.company, state, this.startLine, this.objective, this.ground, this.scoutFit, this.scoutAsked, this.question);
    askPlatoons(g, this.company, this.platoonFit, this.platoonAsked, this.question);
    return this.company.orders(g, { go: askGo(g, this.company, turn, this.question) });
  }
}

/**
 * The planning questions: how many scouts, where each watches from, where the
 * rest wait. The observation points offered are the finder's
 * (`bestVantages`), each labelled with what it sees of the plan; the
 * commander may also send a scout straight at the plan's centre.
 */
export function askPlan(
  g: Game,
  side: Side,
  objective: Point,
  suspected: readonly Point[],
  width: number,
  height: number,
  question: (q: Omit<Question, "turn" | "view">) => string,
): CompanyPlan {
  const n = Number(
    question({
      id: "plan.scouts",
      kind: "choice",
      // What scouts do in this game, said as fact: bare, the question drew one
      // scout from Jev and every Claude model (docs/balance.md, forty-fourth round).
      ask:
        "How many squads do you send ahead to find the enemy before the company goes? Scouts walk, look harder, hold their fire, and carry binoculars." +
        " Each scout squad watches from its own observation point, chosen so the points see different parts of the enemy's ground." +
        " When the company goes in, the scouts stay at their posts, and they are the eyes for your mortar fire: the assaulting squads, on the move, cannot find men dug in.",
      options: [
        { id: "0", label: "none: the whole company advances at once" },
        { id: "1", label: "one squad: one observation point, the enemy's ground seen from one side" },
        { id: "2", label: "two squads: two observation points" },
        { id: "3", label: "three squads: three observation points, the enemy's ground seen from three sides" },
      ],
    }),
  );
  if (n === 0) return {};
  const { lead, candidates } = observationPoints(g, side, objective, suspected, width, height);
  // The suspected points by name: the plan's centre, then either flank, then its far and near side.
  const names = ["the plan's centre", "its west", "its east", "its far side", "its near side"];
  const sees = (p: Point) =>
    suspected
      .map((t, i) => ({ t, name: names[i] ?? `point ${i + 1}` }))
      .filter(({ t }) => distance(p, t) <= VANTAGE_RING_M.max && !terrainBlocksSight(g.terrain, p, EYE_HEIGHT.infantry, t, EYE_HEIGHT.fullCover))
      .map(({ name }) => name);
  const posts: (Point | null)[] = [];
  for (let i = 0; i < n; i++) {
    const a = question({
      id: `plan.post.${i + 1}`,
      kind: "choice",
      ask: `Where does scout ${i + 1} watch from? An observation point sees the enemy's ground from outside its reach (350-550 m) with binoculars; the plan suspects the enemy at its centre (${Math.round(objective.x)}, ${Math.round(objective.y)}) and 80-90 m to each side of it. A still, dug-in enemy is found only within 600 m through binoculars, and more easily the closer.`,
      options: [
        ...candidates.map((p, k) => ({
          id: `p${k + 1}`,
          label: `observation point (${Math.round(p.x)}, ${Math.round(p.y)}), ground ${Math.round(groundHeight(g.terrain, p))} m: sees ${sees(p).join(", ")}; ${Math.round(distance(p, objective))} m from the plan's centre, ${Math.round(distance(p, lead.position))} m walk from your leading squad`,
        })),
        { id: "straight", label: "straight toward the plan's centre, bounding and looking" },
      ],
    });
    posts.push(a === "straight" ? null : candidates[Number(a.slice(1)) - 1]!);
  }
  const wait = question({
    id: "plan.wait",
    kind: "choice",
    ask: "Where does the rest of the company wait while the scouts look?",
    options: [
      { id: "place", label: "where it stands, on the start line" },
      { id: "deadGround", label: "the nearest ground out of sight of where the plan puts the enemy" },
    ],
  });
  return { recon: { scouts: n, posts }, waitIn: wait === "deadGround" ? "deadGround" : "place" };
}

/**
 * The observation points a scout may be sent to (`bestVantages` on where the
 * plan suspects the enemy, from the infantry nearest the objective), best
 * first: what the planning question offers as p1, p2, … and what the order
 * form draws on the map. Reads the ground only, no rng.
 */
export function observationPoints(
  g: Game,
  side: Side,
  objective: Point,
  suspected: readonly Point[],
  width: number,
  height: number,
): { lead: Unit; candidates: Point[] } {
  const lead = g.units
    .filter((u) => u.side === side && u.kind === "infantry")
    .sort((a, b) => distance(a.position, objective) - distance(b.position, objective))[0]!;
  const candidates = bestVantages(
    { terrain: g.terrain, targets: suspected, minRange: VANTAGE_RING_M.min, maxRange: VANTAGE_RING_M.max },
    lead.position,
    4,
    { width, height, step: 20 },
  );
  return { lead, candidates };
}

/** The plan's registered points by name, in `attackerPlan`'s order. */
const PLANNED_NAMES = ["the plan's centre", "its west", "its east"];

/**
 * Which of the plan's points is the priority target (rules decision 93, in
 * the questions): its missions are held back on the heaviest tube and fired
 * at once on the commander's call (ATP 3-21.90 2-120, 2-123). None is a choice.
 */
export function askPriority(planned: readonly Point[], question: (q: Omit<Question, "turn" | "view">) => string): Point | undefined {
  const a = question({
    id: "plan.priority",
    kind: "choice",
    ask:
      `Which registered point is your priority target? ${FIRE_RESERVE.attackerPriority} missions of your heaviest mortars are held back for it: ` +
      "no other mission can spend them, and when you call them they land at once on its registered data, needing no observer.",
    options: [
      ...planned.slice(0, PLANNED_NAMES.length).map((p, i) => ({
        id: `t${i + 1}`,
        label: `${PLANNED_NAMES[i]} (${Math.round(p.x)}, ${Math.round(p.y)})`,
      })),
      { id: "none", label: "none: every mission is free to fire on what is found" },
    ],
  });
  return a === "none" ? undefined : planned[Number(a.slice(1)) - 1];
}

/**
 * What the side has of the enemy near the objective when none is in sight:
 * nothing found yet, or found and lost — some of it out of action — or found
 * only away from where the plan put it.
 */
export function notInSight(g: Game, company: ScriptedCompany): string {
  const side = company.side;
  const objective = company.objectivePoint;
  const marks = sideView(g, side).units.filter((e) => e.side !== side);
  const near = marks.filter((e) => distance(e.position, objective) <= FIND_WITHIN_M);
  const out = near.filter((e) => e.neutralized || e.surrendered).length;
  const away = marks.filter((e) => distance(e.position, objective) > FIND_WITHIN_M && !e.neutralized && !e.surrendered).length;
  const elsewhere = away ? ` It also has ${away} mark${away === 1 ? "" : "s"} away from the objective.` : "";
  if (!near.length) return `Your scouts have not found the enemy near the objective yet.${elsewhere}`;
  const found = `Your side has found ${near.length} enemy force${near.length === 1 ? "" : "s"} near the objective` + (out ? ` (${out} out of action)` : "");
  return out === near.length
    ? `${found}; nothing else there is in sight now.${elsewhere}`
    : `${found}, but none is in sight now: the marks are where it was last seen.${elsewhere}`;
}

/**
 * While the company holds: send it in now? Asked when the scouts hold the
 * enemy in sight, when they are all lost, and every fifth turn otherwise —
 * a commander can always choose to go without them.
 */
export function askGo(g: Game, company: ScriptedCompany, turn: number, question: (q: Omit<Question, "turn" | "view">) => string): boolean {
  if (company.released !== undefined) return false;
  const holding = company.holdingInSight(g);
  const lost = company.liveScouts(g).length === 0;
  // Every GO_ASKED_EVERY turns while nothing is in sight: an order's H-hour by the clock is held to the same (order.ts).
  if (!holding && !lost && turn % GO_ASKED_EVERY !== 0) return false;
  const why = lost
    ? "Your scouts are all out of action."
    : holding
      ? company.turnsHeldInSight === 0
        ? "Your side has just found the enemy near the objective."
        : `Your side has held the enemy near the objective in sight ${company.turnsHeldInSight + 1} turns in a row.`
      : notInSight(g, company);
  // A choice of three while the company can still move up; a yes or no after.
  const go =
    question({
      id: `go.${turn}`,
      kind: company.movedUp ? "noul" : "choice",
      ask: `${why} Send the company in now?`,
      // As the words say it: scouts lost is said first, and then nothing of the enemy in sight.
      facts: { heldInSightTurns: !lost && holding ? company.turnsHeldInSight + 1 : 0, scoutsLost: lost },
      options: [
        { id: "yes", label: "yes: the company advances to the attack" },
        ...(company.movedUp
          ? []
          : [
              {
                id: "up",
                label: `move up: the company moves to the last covered ground about ${ASSAULT_POSITION_M} m short of where your plan puts the enemy, and holds there until you send it in`,
              },
            ]),
        { id: "no", label: lost ? "no: the company stays where it is, with no scouts left to find the enemy" : "no: keep holding while the scouts look" },
      ],
    });
  // The enemy as the side has found it near the objective, if it has: where the company moves up to, and flanks.
  const found = sideView(g, company.side)
    .units.filter((e) => e.side !== company.side && !e.neutralized && distance(e.position, company.objectivePoint) <= FIND_WITHIN_M)
    .map((e) => e.position);
  if (go === "up") company.moveUp(g, found);
  if (go !== "yes") return false;
  // Which way it goes: straight, round a flank, or by one of the scouts'
  // observation points, coming in from that side.
  const posts = [...company.posts].filter((e): e is [string, Point] => e[1] !== null);
  const flanks = company.flankPoints(found);
  if (posts.length || flanks.length) {
    const axis = question({
      id: `go.axis.${turn}`,
      kind: "choice",
      ask: "Which way does the company go in?",
      options: [
        { id: "straight", label: "straight at the plan's centre" },
        ...flanks.map((f) => ({
          id: `flank:${f.side}`,
          label: `round the ${f.side} flank: by covered ground at (${Math.round(f.at.x)}, ${Math.round(f.at.y)}), beside the enemy, coming in on its side`,
        })),
        ...posts.map(([id, p]) => ({
          id: `via:${id}`,
          label: `by ${id}'s observation point (${Math.round(p.x)}, ${Math.round(p.y)}), coming in from that side`,
        })),
      ],
    });
    company.setAxis(
      axis === "straight" ? undefined : (flanks.find((f) => `flank:${f.side}` === axis)?.at ?? posts.find(([id]) => `via:${id}` === axis)?.[1]),
    );
  }
  if (company.liveScouts(g).length) {
    company.setScoutsFire(
      question({
        id: `go.support.${turn}`,
        kind: "noul",
        ask: "Do your scouts open fire in support from where they are, as a base of fire? Firing gives their positions away.",
        options: [
          { id: "yes", label: "yes: the scouts open fire on what they can reach" },
          { id: "no", label: "no: they stay hidden and keep watching" },
        ],
      }) === "yes",
    );
  }
  // Each platoon's task (item 2): who assaults, who gives a base of fire, who stays back.
  const platoons = [...company.platoons(g)].filter(([, us]) => us.some(fighting));
  let assaulting = 0;
  if (platoons.length > 1) {
    for (const [key, us] of platoons) {
      const task = question({
        id: `go.platoon.${key}.${turn}`,
        kind: "choice",
        ask: `What does platoon ${key} (${describePlatoon(us)}) do as the company goes in?`,
        options: PLATOON_GO_OPTIONS,
      }) as PlatoonTask;
      company.setPlatoonTask(key, task);
      if (task === "assault") assaulting++;
    }
  } else assaulting = platoons.length;
  if (assaulting > 1) {
    company.setBoundByPlatoon(
      question({
        id: `go.bound.${turn}`,
        kind: "noul",
        ask: "Do the assaulting platoons bound in turn once in contact, one moving while the others halt and fire?",
        options: [
          { id: "yes", label: "yes: bound by platoon, each covered by the others' fire" },
          { id: "no", label: "no: they all go together" },
        ],
      }) === "yes",
    );
  }
  if ((missionsLeft(g, company.side) ?? 0) > 0) {
    company.setHoldShort(
      question({
        id: `go.lift.${turn}`,
        kind: "noul",
        ask:
          `Does the assault wait for your fires to lift? Squads that close to ${HOLD_SHORT_M} m of the enemy stop there, ` +
          "under your mortars, until you lift the fires; then they go in on the heels of the last rounds.",
        options: [
          { id: "yes", label: "yes: hold short, and I will say when to lift the fires" },
          { id: "no", label: "no: they go straight in, and the fires lift as they close" },
        ],
      }) === "yes",
    );
  }
  return true;
}

// Each option says what it does to the attack, not only what the platoon does:
// Jev, asked "assault / base of fire / reserve" bare, kept two platoons of three
// back and they never fought (docs/balance.md, thirty-fourth round).
const PLATOON_GO_OPTIONS = [
  { id: "assault", label: "assault the position: close with the enemy and take the objective" },
  { id: "support", label: "base of fire: stop at small-arms reach of the enemy and fire, without closing to take the objective" },
  { id: "reserve", label: "reserve: stay back where it waited, out of the fight until you commit it later" },
];
const fighting = (u: Unit) => !u.neutralized && !u.routing && !u.surrendered;
const describePlatoon = (us: readonly Unit[]) =>
  us
    .map((u) => `${u.id} ${(u.soldiers ?? []).filter((m) => !m.neutralized).length}/${u.soldiers?.length ?? 0} at (${Math.round(u.position.x)}, ${Math.round(u.position.y)})${fighting(u) ? "" : u.routing ? " routing" : " out of action"}`)
    .join(", ");

/**
 * Once the company has gone, the commander controls it by platoon (item 2):
 * asked when a platoon comes under fire (and from what, as far as the side
 * knows), when a halted platoon has lain up three turns, every fifth turn for
 * the reserve, and — when the assault waits for the fires to lift — when it
 * reaches its hold-short line.
 */
export function askPlatoons(
  g: Game,
  company: ScriptedCompany,
  fitBefore: Map<string, number>,
  asked: Map<string, number>,
  question: (q: Omit<Question, "turn" | "view">) => string,
): void {
  if (company.released === undefined || g.turn <= company.released) return;
  const side = company.side;
  const marks = sideView(g, side).units.filter((e) => e.side !== side && !e.neutralized && !e.surrendered);
  for (const [key, us] of company.platoons(g)) {
    const live = us.filter(fighting);
    let hit = false;
    for (const u of us) {
      const fit = (u.soldiers ?? []).filter((m) => !m.neutralized).length;
      if (fit < (fitBefore.get(u.id) ?? fit)) hit = true;
      fitBefore.set(u.id, fit);
    }
    if (!live.length) continue;
    const task = company.platoonTask(key);
    const since = g.turn - (asked.get(key) ?? company.released);
    const idle = (task === "halt" && since >= 3) || (task === "reserve" && since >= 5);
    if (!hit && !idle) continue;
    asked.set(key, g.turn);
    const fire = live.map((u) => underFire(g, side, u)).filter((x): x is string => !!x);
    const why = hit
      ? `is taking casualties${fire.length ? ": " + fire.join("; ") : ""}`
      : task === "halt"
        ? "has been halted, gone to ground, three turns"
        : "is still in reserve";
    // "Carry on" last, and every option by what it does to the attack (as PLATOON_GO_OPTIONS).
    const options = [
      ...(task !== "assault" ? [{ id: "assault", label: PLATOON_GO_OPTIONS[0]!.label }] : []),
      ...(task !== "support" ? [{ id: "support", label: PLATOON_GO_OPTIONS[1]!.label }] : []),
      ...(task !== "halt" ? [{ id: "halt", label: "halt and go to ground where it is: stop moving and stop fighting forward" }] : []),
      { id: "withdraw", label: "pull back to the start line, out of the attack" },
      { id: "on", label: `carry on: ${PLATOON_TASK_CARRY_ON[task]}` },
    ];
    const a = question({
      id: `platoon.${key}.${g.turn}`,
      kind: "choice",
      ask: `Platoon ${key} ${why}. It is ${PLATOON_TASK_WORDS[task]}: ${describePlatoon(us)}. What now?`,
      options,
    });
    if (a !== "on") company.setPlatoonTask(key, a as PlatoonTask);
  }
  // The assault element is spent and a platoon is still fighting elsewhere:
  // send it in? Unasked, a company would wait out the clock for an assault
  // that no longer exists (balance.md, *Why the 2:1 plans fail*).
  if (company.assaultSpent(g)) {
    const rest = company.toCommit(g);
    // The reserve first (drill audit, A9); the base of fire only when there is none.
    const what = rest.some((k) => company.platoonTask(k) === "reserve") ? "reserve" : "base of fire";
    const a = question({
      id: `recommit.${g.turn}`,
      kind: "noul",
      ask:
        `Your assault is out of the fight: no squad of an assaulting platoon is still fighting. ` +
        `Send your ${what}, ${rest.join(" and ")}, in to assault${company.holdsShort ? ", lifting your fires" : ""}?`,
      options: [
        { id: "yes", label: `yes: the ${what} goes in` },
        { id: "no", label: "no: it stays where it is (you will not be asked again)" },
      ],
    });
    if (a === "yes") company.recommit(g);
    else company.declineRecommit();
  }
  // The fires are spent: there is nothing left to lift, and the assault goes in.
  if (company.holdsShort && (missionsLeft(g, side) ?? 0) === 0) company.liftFires();
  // The assault held short, under the fires: lift them now?
  if (company.holdsShort) {
    const at = [...company.platoons(g)]
      .filter(([key]) => company.platoonTask(key) === "assault")
      .flatMap(([, us]) => us.filter(fighting))
      .filter((u) => marks.some((e) => distance(u.position, e.position) <= HOLD_SHORT_M + 10));
    if (at.length) {
      const lift = question({
        id: `lift.${g.turn}`,
        kind: "noul",
        ask:
          `${at.map((u) => u.id).join(", ")} ${at.length === 1 ? "is" : "are"} at the hold-short line, ${HOLD_SHORT_M} m from the enemy, waiting for the fires to lift. ` +
          `Lift the fires and go in now? (Fire missions left: ${missionsLeft(g, side)}.)`,
        options: [
          { id: "yes", label: "yes: lift the fires, the assault goes in" },
          { id: "no", label: "no: keep the fires on and hold short" },
        ],
      });
      if (lift === "yes") company.liftFires();
    }
  }
}

const PLATOON_TASK_CARRY_ON: Record<PlatoonTask, string> = {
  assault: "keep assaulting",
  support: "keep giving a base of fire",
  reserve: "stay in reserve, out of the fight",
  halt: "stay halted, gone to ground",
  withdraw: "keep pulling back",
  security: "keep watching the flanks and rear",
};

/** The company's stage in the commander's picture: not gone in yet, or gone in and what each platoon was ordered. */
export function companyStage(g: Game, company: ScriptedCompany): string {
  if (company.released === undefined)
    return company.movedUp
      ? `Your company has not gone in to the attack yet: it has moved up to its assault position, about ${ASSAULT_POSITION_M} m short of where your plan puts the enemy, and holds there.`
      : "Your company has not gone in to the attack yet.";
  const tasks = [...company.platoons(g)]
    .filter(([, us]) => us.some(fighting))
    .map(([key]) => `${key} ${PLATOON_TASK_WORDS[company.platoonTask(key)]}`);
  return (
    `Your company went in to the attack on turn ${company.released}` +
    (tasks.length ? `: ${tasks.join(", ")}` : "") +
    (company.holdsShort ? `. The assault stops ${HOLD_SHORT_M} m short of the enemy until you lift your fires.` : ".")
  );
}

const PLATOON_TASK_WORDS: Record<PlatoonTask, string> = {
  assault: "assaulting",
  support: "giving a base of fire",
  reserve: "in reserve",
  halt: "halted, gone to ground",
  withdraw: "pulling back",
  security: "on flank and rear security",
};



/**
 * A scout's commander is asked about it when it is hit, when it is slow to
 * reach its observation point, and when it has sat at its point for
 * {@link SCOUT_GIVE_UP_TURNS} turns seeing nothing (with a decider the drill
 * no longer walks it on by itself: that is the commander's to say). When the
 * side has marks away from where the plan put the enemy, the scout may also
 * be sent to an observation point on those marks (`bestVantages`).
 */
export function askScouts(
  g: Game,
  company: ScriptedCompany,
  state: DrillState,
  startLine: Point,
  objective: Point,
  ground: { width: number; height: number },
  fitBefore: Map<string, number>,
  asked: Map<string, number>,
  question: (q: Omit<Question, "turn" | "view">) => string,
): void {
  if (company.released !== undefined) return;
  const side = company.side;
  const holding = company.holdingInSight(g);
  const marks = sideView(g, side).units.filter((e) => e.side !== side && !e.neutralized && !e.surrendered);
  const astray = marks.filter((e) => distance(e.position, objective) > FIND_WITHIN_M);
  for (const u of company.liveScouts(g)) {
    const fit = (u.soldiers ?? []).filter((m) => !m.neutralized).length;
    const hit = fit < (fitBefore.get(u.id) ?? fit);
    fitBefore.set(u.id, fit);
    const post = company.posts.get(u.id);
    const arrived = state.arrivedOn.get(u.id);
    const slow = post !== null && post !== undefined && arrived === undefined && g.turn > 1 && g.turn % 10 === 0;
    const idle =
      post !== null && post !== undefined && arrived !== undefined && !holding &&
      g.turn - Math.max(arrived, asked.get(u.id) ?? arrived) >= SCOUT_GIVE_UP_TURNS;
    if (!hit && !slow && !idle) continue;
    asked.set(u.id, g.turn);
    // Observation points on where the enemy turned up, when it is not where the plan put it.
    const points = astray.length
      ? bestVantages(
          { terrain: g.terrain, targets: astray.map((e) => e.position), minRange: VANTAGE_RING_M.min, maxRange: VANTAGE_RING_M.max },
          u.position,
          2,
          { width: ground.width, height: ground.height, step: 20 },
        )
      : [];
    const sees = (p: Point) =>
      astray
        .filter((e) => distance(p, e.position) <= VANTAGE_RING_M.max && !terrainBlocksSight(g.terrain, p, EYE_HEIGHT.infantry, e.position, EYE_HEIGHT.fullCover))
        .map((e) => e.id);
    const why = hit
      ? `is under fire: ${fit}/${u.soldiers?.length ?? 0} fit`
      : idle
        ? `has watched from its observation point for ${g.turn - (arrived ?? g.turn)} turns and your side holds no enemy near the objective in sight`
        : "has not reached its observation point yet";
    const a = question({
      id: `scout.${u.id}.${g.turn}`,
      kind: "choice",
      ask: `${u.id} ${why}, at (${Math.round(u.position.x)}, ${Math.round(u.position.y)}). What now?`,
      options: [
        idle
          ? { id: "on", label: "go on toward the plan's centre, bounding and looking" }
          : { id: "on", label: post ? `go on to its observation point (${Math.round(post.x)}, ${Math.round(post.y)})` : "go on as ordered" },
        { id: "here", label: idle ? "stay at its point and keep watching" : "lie up where it is and watch" },
        { id: "back", label: "pull back to the company" },
        ...points.map((p, k) => ({
          id: `v${k + 1}`,
          label:
            `move to an observation point on the enemy found away from the plan (${Math.round(p.x)}, ${Math.round(p.y)}), ` +
            `ground ${Math.round(groundHeight(g.terrain, p))} m: sees ${sees(p).join(", ") || "none of the marks clearly"}; ` +
            `${Math.round(distance(p, u.position))} m walk`,
        })),
      ],
    });
    const moveTo = (at: Point | null) => {
      company.setPost(u.id, at);
      // A new point is a new arrival: the old one's clock does not carry over.
      state.arrivedOn.delete(u.id);
    };
    if (a === "on" && idle) moveTo(null);
    if (a === "here" && !idle) moveTo(u.position);
    if (a === "back") moveTo(startLine);
    if (a.startsWith("v")) moveTo(points[Number(a.slice(1)) - 1]!);
  }
}

/**
 * The mortars are free and the side has the enemy in sight: fire on which
 * mark? Offered: every enemy mark seen this turn or last that is not within
 * danger close of the company's own squads (scouts aside), and holding fire.
 */
export function askAttackerFire(
  g: Game,
  side: Side,
  company: ScriptedCompany,
  tally: AttackerFireTally,
  question: (q: Omit<Question, "turn" | "view">) => string,
  planned: readonly Point[] = [],
  priority?: Point,
): void {
  if (!mortarFree(g, side)) return;
  // Decision 93's fire plan, in the questions: the priority target's
  // missions are held back on the heaviest tube; the rest are free.
  const reserve = priorityReserve(g, side, priority);
  const tubes = tubesOf(g, side);
  const free = tubes.filter((w) => tubeFree(g, side, w));
  const spare = free.filter((w) => (g.fireMissionsLeft(side, w) ?? Infinity) > (w === reserve.tube ? reserve.held : 0));
  // Before the fires lift, and with every squad beyond the reserve tube's lift
  // from it, as the scripted commander's (decisions 93, 95; liftFor).
  // Where the priority mission would land: on the enemy seen near the point, if any (drill audit, A8) —
  // and that is where its squads must be clear of it, and what they are told.
  const aimed = priority ? priorityAim(g, side, priority) : undefined;
  const clear = !aimed || !reserve.tube || squadsClearOf(g, side, company, aimed, reserve.tube);
  const canPriority = !!priority && !!reserve.tube && reserve.held > 0 && free.includes(reserve.tube) && !company.firesLifted && clear;
  if (!spare.length && !canPriority) return;
  // The mortar a mark is fired with — the heaviest with a mission to spare —
  // and the guns, which fire only on a mark beyond their lift (decision 95).
  const tube = [...spare].reverse().find((w) => w !== "artillery");
  const guns = spare.includes("artillery");
  const bombs = tube ? g.fireSupport[side]?.find((a) => a.weapon === tube)?.roundsForEffect : undefined;
  const kills = (tube && TUBE_KILL_RADIUS[tube]) ?? "about 9 m";
  // Smoke is the 81 mm's, from a mission it has to spare (decision 93: the 60 mm lays none).
  const canSmoke = spare.includes(MORTAR);
  const squads = g.units.filter((u) => u.side === side && u.kind === "infantry" && !u.neutralized && !company.isScout(u));
  const view = sideView(g, side);
  // Every mark the side holds — in sight or last seen. Firing on a
  // last-seen mark is firing on where the enemy was. One close to its own
  // squads is offered as danger close, a risk the commander takes (decision
  // 63, S4). Once he lifts the fires for the assault they shift to depth:
  // nothing within LIFTED_CLEAR_M of the company's squads.
  const nearestOwn = (p: Point) => Math.min(...squads.map((s) => distance(s.position, p)));
  // Which tube a mark is fired with: the heaviest that may fire there.
  const tubeFor = (p: Point) => [...spare].reverse().find((w) => w !== "artillery" || squadsClearOf(g, side, company, p, w));
  const marks = spare.length
    ? view.units.filter(
        (u) => u.side !== side && !u.neutralized && (!company.firesLifted || nearestOwn(u.position) > LIFTED_CLEAR_M) && tubeFor(u.position),
      )
    : [];
  if (!marks.length && !canPriority) return;
  const firing = firingOnUs(g, side);
  const onPlan = (p: Point) => planned.findIndex((t) => distance(t, p) <= ADJUSTMENT_RADIUS_M);
  const name = (i: number) => PLANNED_NAMES[i] ?? `planned point ${i + 1}`;
  const priorityName = priority ? name(planned.indexOf(priority)) : "";
  const lead = squads.length && aimed ? Math.round(nearestOwn(aimed)) : undefined;
  const left = (w: string) => g.fireMissionsLeft(side, w) ?? 0;
  const freeMissions = tubes.reduce((n, w) => n + Math.max(0, left(w) - (w === reserve.tube ? reserve.held : 0)), 0);
  const a = question({
    id: `fire.${g.turn}`,
    kind: "choice",
    ask:
      `Your mortars are free. ${freeMissions} mission${freeMissions === 1 ? " is" : "s are"} free to fire` +
      (priority ? ` and ${reserve.held} held back for your priority target, ${priorityName}` : "") +
      ". " +
      (tube
        ? `A free mortar mission fires ${bombs ? `${bombs} bombs` : "its bombs"} for effect at once; a bomb kills within ${kills}, less against men dug in with overhead cover. `
        : "") +
      (guns
        ? `Your battalion's guns fire a free mission on a mark more than ${liftFor("artillery")} m from your squads: ` +
          `${g.fireSupport[side]?.find((a) => a.weapon === "artillery")?.roundsForEffect ?? 6} shells, landing two turns after the call; a shell kills within ${TUBE_KILL_RADIUS.artillery}. `
        : "") +
      `A mark within ${DANGER_CLOSE_M} m of your own squads is DANGER CLOSE: the bombs can hit and pin your own men too. ` +
      "A position stays pinned only while the fire lasts and a turn or two after, so the assault has to arrive before you lift. Fire on which?",
    options: [
      ...marks.map((u) => {
        const seen = g.contactFor(side, u.id)?.lastSeenTurn ?? 0;
        const planIx = onPlan(u.position);
        return {
          id: u.id,
          label:
            `${u.id} (${u.kind === "command" ? "command group" : "infantry"}) at (${Math.round(u.position.x)}, ${Math.round(u.position.y)}), ` +
            `sure to ±${Math.round((view.spreads.get(u.id) ?? 0) * CE_PER_SIGMA)} m, ` +
            (seen >= g.turn - 1 ? "in sight" : `last seen turn ${seen}: it may have moved`) +
            (planIx >= 0 ? `, on your planned target ${name(planIx)}` : "") +
            (firing.has(u.id) ? ", FIRING ON YOUR SQUADS" : "") +
            (squads.length && nearestOwn(u.position) <= DANGER_CLOSE_M
              ? ` — DANGER CLOSE: your nearest squad is ${Math.round(nearestOwn(u.position))} m from it`
              : ""),
        };
      }),
      ...(canPriority
        ? [
            {
              id: "priority",
              label:
                `your priority target, ${priorityName}: one of the ${reserve.held} missions held for it, on its registered data, shifted onto the enemy if he has been seen near it` +
                (reserve.tube === "artillery" ? ", by the battalion's artillery, landing two turns after the call" : "") +
                (lead !== undefined ? `; your nearest squad is ${lead} m from it` : "") +
                (lead !== undefined && lead <= DANGER_CLOSE_M ? " — DANGER CLOSE" : ""),
            },
          ]
        : []),
      // Smoke once the company is moving: a screen on a mark blinds it while the squads close.
      ...(company.released !== undefined && canSmoke
        ? marks.map((u) => ({ id: `smoke:${u.id}`, label: `lay mortar smoke on ${u.id}'s mark, to screen your squads from it (costs one of your missions)` }))
        : []),
      // Bare, on purpose: worded "save the mission for when your assault is closing", Jev held every
      // mission until the company went, and fire held that long costs the attack about 30 points
      // (docs/balance.md, thirty-fourth round).
      { id: "hold", label: "hold fire this turn" },
    ],
  });
  if (a === "hold") return;
  if (a === "priority") {
    g.callForFire(side, reserve.tube!, aimed!, { method: "effect" });
    tally.missions++;
    return;
  }
  if (a.startsWith("smoke:")) {
    const screened = marks.find((u) => `smoke:${u.id}` === a)!;
    g.deploySmoke(MORTAR, side, screened.position);
    tally.smoke++;
    return;
  }
  const target = marks.find((u) => u.id === a)!;
  // The heaviest tube with a mission to spare, as before decision 93's
  // questions — never the guns within their lift of the squads (decision 95):
  // a mark with no tube to fire it is not offered.
  g.callForFire(side, tubeFor(target.position)!, target.position, { method: "effect" });
  tally.missions++;
}

/** Whether every squad of `side` but its scouts is beyond the lift distance of `p` (decision 63 S4's LIFT_AT_M). */
function squadsClearOf(g: Game, side: Side, company: ScriptedCompany, p: Point, weapon: string): boolean {
  const squads = g.units.filter((u) => u.side === side && u.kind === "infantry" && !u.neutralized && !company.isScout(u));
  return ownClearOf(g, side, squads, p, weapon);
}

/** A bomb's lethal radius by tube, as a commander is told it: √(area/π) of ARES's lethal areas (decision 93). */
const TUBE_KILL_RADIUS: Readonly<Record<string, string>> = { lightMortar: "about 7 m", mortar: "about 9 m", heavyMortar: "about 14 m", artillery: "about 15 m" };

/** The missions a side has left over all its tubes (decision 93) — or its mortars only; null when it may call none, undefined when it is not rationed. */
export function missionsLeft(g: Game, side: Side, mortarsOnly = false): number | null | undefined {
  const tubes = tubesOf(g, side).filter((w) => !mortarsOnly || w !== "artillery");
  if (!tubes.length) return null;
  let left = 0;
  for (const w of tubes) {
    const n = g.fireMissionsLeft(side, w);
    if (n === undefined) return undefined;
    left += n;
  }
  return left;
}

