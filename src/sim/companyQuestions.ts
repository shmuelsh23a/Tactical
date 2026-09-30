import { sideView } from "../app/hotseat.js";
import { MORALE_RULES } from "../engine/index.js";
import { CE_PER_SIGMA, bearingDegrees, distance, groundHeight, type Game, type Point, type Side, type Unit } from "../engine/index.js";

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
  plan: { objective: Point; mortarLeft: number | null; brief?: string; startLine?: Point; reports?: readonly string[] },
): string {
  const view = sideView(game, side);
  const lines: string[] = [];
  lines.push(`Turn ${game.turn} (a turn is one minute). You command ${side}'s company, attacking. Map metres; y grows southward.`);
  if (plan.brief) lines.push(`Tasking (Hebrew, as the players read it): ${plan.brief}`);
  lines.push("In short: you attack; the enemy holds the ground your plan puts it on.");
  if (game.timeLimit !== undefined && game.attackers.includes(side)) {
    const left = game.timeLimit - Math.max(1, game.turn) + 1;
    lines.push(`Deadline: take the objective by the end of turn ${game.timeLimit} (${left} turn${left === 1 ? "" : "s"} left, this one included), or the attack has failed.`);
  }
  const men = game.units.filter((u) => u.side === side).flatMap((u) => u.soldiers ?? []);
  const down = men.filter((m) => m.neutralized || m.morale?.state === "broken").length;
  if (game.attackers.includes(side)) {
    lines.push(
      `The attack is called off when about ${Math.round(game.attackerBreakpoint * 100)}% of your men are down, broken or fled ` +
        `(now ${Math.round((100 * down) / Math.max(1, men.length))}%, ${down} of ${men.length}). ` +
        `A defence gives up at about ${Math.round(MORALE_RULES.SIDE_BREAK_BY_POSTURE.defending * 100)}% of its men.`,
    );
  }
  const h = (p: Point) => Math.round(groundHeight(game.terrain, p));
  lines.push(
    `Your plan puts the enemy position about ${round(plan.objective)}, ground ${h(plan.objective)} m` +
      (plan.startLine ? `; your start line is about ${round(plan.startLine)}, ground ${h(plan.startLine)} m.` : "."),
  );
  if (plan.mortarLeft !== null) lines.push(`Mortar missions left: ${plan.mortarLeft}.`);
  if (plan.reports?.length) {
    lines.push("Your fire last turn, as your forces saw it:");
    for (const r of plan.reports) lines.push(`  ${r}`);
  }
  lines.push("Your forces:");
  for (const u of view.units.filter((u) => u.side === side)) {
    const men = u.soldiers ?? [];
    const fit = men.filter((m) => !m.neutralized).length;
    const state = u.neutralized ? "out of action" : u.routing ? "routing" : u.surrendered ? "surrendered" : u.scouting ? "scouting" : "";
    const fire = u.neutralized ? undefined : underFire(game, side, u);
    lines.push(
      `  ${u.id} (${u.kind}${u.kind === "command" ? "" : ", " + u.echelon}) at ${round(u.position)}, ${fit}/${men.length} fit${state ? ", " + state : ""}` +
        (fire ? `; ${fire.slice(u.id.length + 1)}` : ""),
    );
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

/**
 * What a side's forces saw its fire do to an enemy force, in words, never a
 * count (rules decision 13: a player is never shown a count of enemy
 * losses) — the English of `casualtyReport`.
 */
export function casualtiesSeen(casualties: number): string {
  if (casualties === 0) return "no casualties seen";
  if (casualties <= 2) return "a few casualties";
  if (casualties <= 5) return "several casualties";
  return "heavy casualties";
}

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

/**
 * What a force can tell of the fire it took this turn and last: the firer's
 * mark if its side holds one, otherwise only which way the fire came from —
 * a squad under fire hears that much — and whether it was shelled.
 */
export function underFire(g: Game, side: Side, u: Unit): string | undefined {
  const notes = g.fireReceived(u.id, g.turn - 1);
  if (!notes.length) return undefined;
  const from: string[] = [];
  const also: string[] = [];
  for (const n of notes) {
    if (!n.firerId) {
      also.push(n.kind === "mine" ? "hit a mine" : "shelled");
      continue;
    }
    if (g.knows(side, n.firerId)) {
      from.push(n.firerId);
      continue;
    }
    const firer = g.units.find((x) => x.id === n.firerId);
    if (!firer) continue;
    const b = Math.round(bearingDegrees(u.position, firer.position) / 45) % 8;
    from.push(`an enemy it cannot see, to its ${COMPASS[b]}`);
  }
  const parts = [...(from.length ? [`under fire from ${[...new Set(from)].join(", ")}`] : []), ...new Set(also)];
  return parts.length ? `${u.id} ${parts.join(", and ")}` : undefined;
}
