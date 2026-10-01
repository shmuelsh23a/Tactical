import type { JsonValue, TypeSafeClient } from "@typesafe-ai/sdk";
import { NeedAnswer, QUESTION_SET_VERSION, fromAnswers, type Decider, type Question } from "./companyQuestions.js";
import type { Order } from "./opord.js";

/**
 * Jev answers the company commander's questions (README, backlog 15).
 *
 * The questions are already Jev-shaped (`companyQuestions.ts`): a `noul`
 * (yes or no) or a `choice` among named options, the commander's picture of
 * the battle as its state, drawn only from its side's view. This module maps
 * one onto a Jev request, and plays a battle to its end by asking Jev at each
 * question.
 *
 * **How a battle is driven, and why Jev is never called in a replay.** A
 * battle is its seed and the answers given so far. {@link playWithAsker}
 * replays it with the answers it has, stops at the next question, asks, and
 * replays again with the answer added — the engine stays synchronous and
 * deterministic, and the answers are the whole of what Jev contributed. A
 * replay is `fromAnswers(answers)`: it never calls Jev, which exports no seed
 * and no temperature and may not answer the same question the same way twice.
 *
 * **Everything is logged**: each question, the answer, Jev's confidence and
 * probabilities, the model and the question-set version — the business plan's
 * record of every call (docs/business-plan.md, *Jev*).
 */

/** What an asker says to one question. */
export interface JevAnswer {
  /** One of the question's option ids. */
  answer: string;
  /** How sure the model is of it, 0–1. */
  confidence: number;
  /** Each option's probability, where the model gives them. */
  probabilities?: Record<string, number>;
  /** The model that answered. */
  model: string;
  /** How long the call took, in milliseconds, if the asker timed it (the tools do; nothing in src reads a clock). */
  ms?: number;
  /** Why, where the model says (a Claude model does; Jev does not). */
  reason?: string;
  /** Tokens the call used, where the model reports them. */
  usage?: { input: number; cached: number; output: number };
}

/** Answers one question, however long it takes. */
export type Asker = (q: Question) => Promise<JevAnswer>;

/** One question put, and what came back. */
export interface JevLogEntry extends JevAnswer {
  /** Its place in the battle's answers, from 1. */
  n: number;
  turn: number;
  id: string;
  kind: Question["kind"];
  ask: string;
  options: string[];
  questionSet: string;
}

/**
 * How a question is framed for Jev. Jev is a fast judging model: it weighs the
 * state against the options' words and does not plan, and what it knows of the
 * job is what the request tells it — so the framing is part of the question
 * set. Measured on its own recorded questions by `npm run jev-probe`
 * (docs/balance.md, thirty-fourth round).
 *
 * - `plain`: the commander's picture as the state, the question as asked.
 * - `role`: the same, the state saying whose decision it is.
 * - `mission` (the default): the role, and the mission and the principles a
 *   trained company commander decides by, beside the picture.
 * - `order`: `mission`, and the order from battalion (`opord.ts`) for the
 *   scenario, where one is written (docs/balance.md, thirty-sixth round).
 */
export type JevFraming = "plain" | "role" | "mission" | "order";

const ROLE = "You are the company commander of the attacking side. You decide for your own company only, from what your side knows.";

/**
 * What a trained company commander brings to every decision: textbook
 * infantry doctrine, not the game's rules and not a script for this battle.
 * **It names no option.** Jev leans to an option whose words the state
 * repeats: the same principles saying "a reserve exists to be committed" made
 * it choose "reserve" more often, not less, and "keep the company out of
 * sight while it waits" made it wait.
 */
export const MISSION: readonly string[] = [
  "The mission is to take the objective before the deadline. An attack that has not taken it by then has failed, however few men it lost.",
  "Mass at the decisive point: bring as much of the company as possible onto the objective together. Platoons held back take nothing.",
  "Fire and movement: fire keeps the enemy's heads down so that the attack can close. It is wasted unless the attack moves while it lasts.",
  "Use the ground: move by ground that hides the company from the enemy, even when it is a detour.",
  "Losses are the price of the attack. Break it off only when it can no longer succeed.",
];

export const JEV_FRAMINGS: Record<JevFraming, (view: string, order?: Order) => string | Record<string, JsonValue>> = {
  plain: (view) => view,
  role: (view) => ({ role: ROLE, situation: view }),
  mission: (view) => ({ role: ROLE, mission: [...MISSION], situation: view }),
  order: (view, order) => ({ role: ROLE, mission: [...MISSION], ...(order ? { orders: [...order] } : {}), situation: view }),
};

/** The Jev request for one question: the commander's picture as its state, framed, and one question named `decision`. */
export function jevRequest(q: Question, framing: JevFraming = "mission", order?: Order) {
  const label = (id: string) => q.options.find((o) => o.id === id)?.label ?? id;
  return {
    state: JEV_FRAMINGS[framing](q.view, order),
    questions: {
      decision:
        q.kind === "noul"
          ? { type: "noul" as const, instructions: q.ask, criteria: { true: label("yes"), false: label("no") } }
          : {
              type: "choice" as const,
              instructions: q.ask,
              criteria: Object.fromEntries(q.options.map((o) => [o.id, o.label])) as Record<string, string>,
            },
    },
  };
}

/**
 * An asker backed by Jev (`TypeSafeClient.systemOne`). A yes or no is Jev's
 * probability of yes, taken at even odds; a choice is Jev's pick.
 */
export function jevAsker(client: Pick<TypeSafeClient, "systemOne">, model?: string, framing: JevFraming = "mission", order?: Order): Asker {
  return async (q) => {
    const request = jevRequest(q, framing, order);
    const { answers, model: used } = await client.systemOne({ ...request, ...(model ? { model } : {}) });
    const a = answers.decision as
      | { type: "noul"; noul: number }
      | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> };
    if (a.type === "noul") {
      const yes = a.noul >= 0.5;
      return { answer: yes ? "yes" : "no", confidence: yes ? a.noul : 1 - a.noul, probabilities: { yes: a.noul, no: 1 - a.noul }, model: used };
    }
    return { answer: a.choice, confidence: a.confidence, probabilities: { ...a.probabilities }, model: used };
  };
}

/** No battle asks this many questions; past it the driver stops rather than loop. */
const MAX_QUESTIONS = 1000;

/**
 * Play a battle to its end, asking `ask` at every question. `run` plays the
 * battle with a decider (`runScenarioBattle(listing, seed, { …, decide })`);
 * it is replayed with the answers so far at each question. Returns the result,
 * the answers — enough to replay it without Jev — and the log.
 */
export async function playWithAsker<R>(
  run: (decide: Decider) => R,
  ask: Asker,
  onAnswer?: (entry: JevLogEntry) => void,
): Promise<{ result: R; answers: string[]; log: JevLogEntry[] }> {
  const answers: string[] = [];
  const log: JevLogEntry[] = [];
  for (;;) {
    let q: Question;
    try {
      return { result: run(fromAnswers(answers)), answers, log };
    } catch (e) {
      if (!(e instanceof NeedAnswer)) throw e;
      q = e.question;
    }
    if (answers.length >= MAX_QUESTIONS) throw new Error(`more than ${MAX_QUESTIONS} questions: stopped`);
    const a = await ask(q);
    if (!q.options.some((o) => o.id === a.answer)) {
      throw new Error(`the answer "${a.answer}" to ${q.id} is not one of its options: ${q.options.map((o) => o.id).join(", ")}`);
    }
    const entry: JevLogEntry = {
      n: answers.length + 1,
      turn: q.turn,
      id: q.id,
      kind: q.kind,
      ask: q.ask,
      options: q.options.map((o) => o.id),
      questionSet: QUESTION_SET_VERSION,
      ...a,
    };
    answers.push(a.answer);
    log.push(entry);
    onAnswer?.(entry);
  }
}
