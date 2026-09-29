import { sideView } from "../app/hotseat.js";
import { CE_PER_SIGMA, distance, groundHeight, type Game, type Point, type Side } from "../engine/index.js";

/**
 * The company commander's decisions as typed questions (README, backlog 15):
 * what Jev will be asked, and what an agent standing in for Jev answers in
 * testing. Jev answers typed questions — `noul` (yes or no) and `choice`
 * among named options — and never writes text, so each question carries
 * its options, and an answer is one option's id.
 *
 * **What a question may say.** Only what the commander's side knows: its
 * own forces, the enemy as its side's picture has it (`sideView` — marks,
 * with how sure it is of each), its plan and its fire. Never `game.units` of
 * the enemy. {@link viewOf} is the one place a question's picture is drawn.
 */
export interface Question {
  /** Stable within a battle: which decision this is. */
  id: string;
  turn: number;
  kind: "noul" | "choice";
  /** What is being decided, in a sentence. */
  ask: string;
  options: { id: string; label: string }[];
  /** The commander's picture of the battle when it is asked. */
  view: string;
}

/** Answers a question with one of its options' ids. */
export type Decider = (q: Question) => string;

/** Thrown by a decider with no answer yet: the battle stops at this question. */
export class NeedAnswer extends Error {
  constructor(readonly question: Question) {
    super(`needs an answer: ${question.id}`);
  }
}

/** A decider that answers from a list, in order, and stops at the first question past its end. */
export function fromAnswers(answers: readonly string[]): Decider & { asked: Question[] } {
  const asked: Question[] = [];
  const decide = ((q: Question) => {
    const a = answers[asked.length];
    if (a === undefined) throw new NeedAnswer(q);
    if (!q.options.some((o) => o.id === a)) {
      throw new Error(`answer ${asked.length + 1} ("${a}") is not an option of ${q.id}: ${q.options.map((o) => o.id).join(", ")}`);
    }
    asked.push(q);
    return a;
  }) as Decider & { asked: Question[] };
  decide.asked = asked;
  return decide;
}

const round = (p: Point) => `(${Math.round(p.x)}, ${Math.round(p.y)})`;

/**
 * The commander's picture: its forces, the enemy marks its side holds, its
 * plan and its fire — what a company commander may be told, and nothing it
 * may not.
 */
export function viewOf(
  game: Game,
  side: Side,
  plan: { objective: Point; mortarLeft: number | null; brief?: string; startLine?: Point },
): string {
  const view = sideView(game, side);
  const lines: string[] = [];
  lines.push(`Turn ${game.turn}. You command ${side}'s company, attacking. Map metres; y grows southward.`);
  if (plan.brief) lines.push(`Tasking: ${plan.brief}`);
  const h = (p: Point) => Math.round(groundHeight(game.terrain, p));
  lines.push(
    `Your plan puts the enemy position about ${round(plan.objective)}, ground ${h(plan.objective)} m` +
      (plan.startLine ? `; your start line is about ${round(plan.startLine)}, ground ${h(plan.startLine)} m.` : "."),
  );
  if (plan.mortarLeft !== null) lines.push(`Mortar missions left: ${plan.mortarLeft}.`);
  lines.push("Your forces:");
  for (const u of view.units.filter((u) => u.side === side)) {
    const men = u.soldiers ?? [];
    const fit = men.filter((m) => !m.neutralized).length;
    const state = u.neutralized ? "out of action" : u.routing ? "routing" : u.surrendered ? "surrendered" : u.scouting ? "scouting" : "";
    lines.push(`  ${u.id} (${u.kind}${u.kind === "command" ? "" : ", " + u.echelon}) at ${round(u.position)}, ${fit}/${men.length} fit${state ? ", " + state : ""}`);
  }
  const marks = view.units.filter((u) => u.side !== side);
  if (!marks.length) lines.push("Enemy: nothing found yet.");
  else {
    lines.push("Enemy as your side has it (a mark is where it was reported, not necessarily where it is):");
    for (const u of marks) {
      const c = game.contactFor(side, u.id);
      const ring = view.spreads.get(u.id);
      const fresh = c && c.lastSeenTurn >= game.turn - 1;
      lines.push(
        `  ${u.id}: ${u.kind === "command" ? "command group" : u.kind === "vehicle" ? "vehicle" : "infantry"} at ${round(u.position)}` +
          `${ring !== undefined ? `, sure to ±${Math.round(ring * CE_PER_SIGMA)} m` : ""}` +
          `, ${fresh ? "in sight" : `last seen turn ${c?.lastSeenTurn}`}${u.neutralized ? ", out of action" : ""}` +
          `, ${Math.round(distance(u.position, plan.objective))} m from the plan's centre`,
      );
    }
  }
  return lines.join("\n");
}
