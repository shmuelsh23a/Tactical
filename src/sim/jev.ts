import type { TypeSafeClient } from "@typesafe-ai/sdk";
import { NeedAnswer, QUESTION_SET_VERSION, fromAnswers, type Decider, type Question } from "./companyQuestions.js";

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

/** The Jev request for one question: the commander's picture as its state, one question named `decision`. */
export function jevRequest(q: Question) {
  const label = (id: string) => q.options.find((o) => o.id === id)?.label ?? id;
  return {
    state: q.view,
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
export function jevAsker(client: Pick<TypeSafeClient, "systemOne">, model?: string): Asker {
  return async (q) => {
    const request = jevRequest(q);
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
