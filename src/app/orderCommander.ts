import { validateOrder, type CompanyOrder, type ControlMeasure, type OrderProblem, type Trigger } from "./order.js";
import type { Decider, Question } from "./companyQuestions.js";
import { fireAnswer, platoonsInView, ruleDecide } from "./ruleCommander.js";

/**
 * A company order compiled to a commander (rules decisions 126 and 128):
 * below company the order is carried out by rule, through the same typed
 * questions Jev, a Claude model and the scripted commander answer, so the
 * engine stays the referee and a recording replays exactly.
 *
 * Every answer comes from a line of the order, except where the battle asks
 * something the order does not speak to — a scout under fire, a platoon
 * hit, the assault spent, the fires to lift. There a subordinate acts by the
 * commander's intent (ADP 6-0 paras 1-77–1-78), which below company is the
 * scripted commander's own choice, and says so: each such answer is a
 * {@link IntentNote}, for the debrief and for the order check that comes
 * with the UX pass (decision 128).
 */
export interface IntentNote {
  turn: number;
  /** The question's id. */
  question: string;
  answer: string;
  /** Why the order did not answer it. */
  why: "not covered" | "not on offer";
}

/** An order that does not play, and why (`validateOrder`'s problems). */
export class OrderRefused extends Error {
  constructor(readonly problems: readonly OrderProblem[]) {
    super(`the order does not play: ${problems.map((p) => p.text).join("; ")}`);
  }
}

/** Whether a trigger has come, on what the question tells the commander. */
export function triggered(t: Trigger, q: Question): boolean {
  if ("all" in t) return t.all.every((x) => triggered(x, q));
  if ("any" in t) return t.any.some((x) => triggered(x, q));
  // A question from anywhere but the battle (a log, a hand-made test) may carry no facts: reading none as "nothing yet" would be a silent wrong answer.
  const f = q.facts;
  if (!f) throw new Error(`${q.id}: a trigger is read off the question's facts, and it has none`);
  const held = f.heldInSightTurns ?? 0;
  switch (t.when) {
    case "atOnce":
      return true;
    case "turn":
      return q.turn >= t.turn;
    case "enemyFound":
      return held >= 1;
    case "enemyFixed":
      return held >= t.turns;
    case "scoutsLost":
      return !!f.scoutsLost;
    case "missionsLeft":
      if (f.mortarLeft === undefined) throw new Error(`${q.id}: no mortarLeft in the question's facts`);
      // No mortars (null) is nothing left to fire.
      return (f.mortarLeft ?? 0) <= t.atMost;
    case "onOrder":
      return false;
  }
}

const PRIORITY = { centre: "t1", west: "t2", east: "t3", none: "none" } as const;

/**
 * The order as a decider. Throws {@link OrderRefused} if it does not play;
 * `platoons` are the side's (`platoonKey`), checked when given.
 */
export function orderDecider(order: CompanyOrder, platoons?: readonly string[]): Decider & { notes: IntentNote[] } {
  const problems = validateOrder(order, platoons);
  if (problems.length) throw new OrderRefused(problems);
  const ex = order.execution;
  const measure = <K extends ControlMeasure["kind"]>(kind: K) =>
    ex.measures.find((m): m is Extract<ControlMeasure, { kind: K }> => m.kind === kind);
  const intent = ruleDecide();
  const notes: IntentNote[] = [];
  const byIntent = (q: Question, why: IntentNote["why"], answer = intent(q)): string => {
    notes.push({ turn: q.turn, question: q.id, answer, why });
    return answer;
  };

  const answer = (q: Question): string => {
    const has = (id: string) => q.options.some((o) => o.id === id);
    if (q.id === "plan.scouts") {
      const { squads } = ex.recon;
      if (squads !== "onePerPlatoon") return String(squads);
      const most = Math.max(...q.options.map((o) => Number(o.id)));
      return String(Math.max(1, Math.min(most, platoonsInView(q.view))));
    }
    if (q.id.startsWith("plan.post.")) {
      const i = Number(q.id.slice("plan.post.".length));
      const post = ex.recon.posts?.[i - 1] ?? { suggested: "observationPoint", rank: i };
      if ("suggested" in post && post.suggested === "towardObjective") return "straight";
      const rank = "suggested" in post && post.suggested === "observationPoint" ? post.rank : i;
      // The ground offers fewer points than the order named: the best of them, or straight where it offers none.
      return has(`p${rank}`) ? `p${rank}` : byIntent(q, "not on offer", has("p1") ? "p1" : "straight");
    }
    if (q.id === "plan.wait") return ex.recon.waitIn;
    if (q.id === "plan.priority") return PRIORITY[ex.fires.priorityTarget];
    if (/^go\.\d/.test(q.id)) {
      // The assault position first: the company moves up, makes its final preparations, then goes (FM 3-90 para A-44).
      const ap = measure("assaultPosition");
      if (ap && has("up") && triggered(ap.occupy, q)) return "up";
      return triggered(ex.timeOfAttack, q) ? "yes" : "no";
    }
    if (q.id.startsWith("go.axis")) {
      const cp = measure("checkpoint");
      if (!cp || !("suggested" in cp.at)) return "straight";
      const flanks = q.options.filter((o) => o.id.startsWith("flank:"));
      const vias = q.options.filter((o) => o.id.startsWith("via:"));
      if (cp.at.suggested === "flank") {
        const side = cp.at.side;
        const f = side ? flanks.find((o) => o.id === `flank:${side}`) : flanks[0];
        if (f) return f.id;
      }
      if (cp.at.suggested === "scoutPost" && vias[0]) return vias[0].id;
      // The ground has no such way in: by a scout's post if there is one, else straight (the intent: take the objective).
      return byIntent(q, "not on offer", vias[0]?.id ?? "straight");
    }
    if (q.id.startsWith("go.support")) return ex.recon.baseOfFireOnGo ? "yes" : "no";
    if (q.id.startsWith("go.platoon.")) {
      const key = q.id.slice("go.platoon.".length, q.id.lastIndexOf("."));
      return ex.tasks[key] ?? "assault";
    }
    if (q.id.startsWith("go.bound")) return ex.boundByPlatoon ? "yes" : "no";
    if (q.id.startsWith("go.lift")) return measure("finalCoordinationLine")?.holdUntilLifted ? "yes" : "no";
    if (q.id.startsWith("fire.")) return fireAnswer(q, ex.fires.policy, ex.fires.holdUntilTimeOfAttack);
    return byIntent(q, "not covered");
  };

  const decide = ((q: Question) => {
    const a = answer(q);
    if (!q.options.some((o) => o.id === a)) {
      throw new Error(`the order answered ${q.id} with "${a}", which is not one of its options: ${q.options.map((o) => o.id).join(", ")}`);
    }
    return a;
  }) as Decider & { notes: IntentNote[] };
  decide.notes = notes;
  return decide;
}
