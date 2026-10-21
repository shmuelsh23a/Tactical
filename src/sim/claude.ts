import type Anthropic from "@anthropic-ai/sdk";
import type { Question } from "./companyQuestions.js";
import { MISSION, type Asker } from "./jev.js";
import type { Order } from "./opord.js";

/**
 * A Claude model answers the company commander's questions, as Jev does
 * (`jev.ts`), so the two can be measured on the same battles
 * (docs/balance.md, thirty-fifth round). Same question, same picture, same
 * mission; the answer is held to one of the question's option ids by the
 * response's JSON schema, so nothing is read out of prose.
 *
 * Like Jev, a Claude model takes no seed here: its answers are logged and a
 * replay uses them, never the model.
 */

/** Everything the commander brings to each question, the same every call (and cached). */
export const CLAUDE_SYSTEM = [
  "You are the company commander of the attacking side in a tactical wargame. You decide for your own company only, from what your side knows.",
  "Each message gives your picture of the battle and one decision. Answer it with the id of exactly one of the options offered.",
  "Principles you command by:",
  ...MISSION.map((m) => `- ${m}`),
].join("\n");

/** The system prompt with the order from battalion after the principles, where there is one. */
export function claudeSystem(order?: Order): string {
  return order ? [CLAUDE_SYSTEM, "", "Your orders from battalion (OPORD):", ...order].join("\n") : CLAUDE_SYSTEM;
}

/** Asked once before the first question when the commander plans (`plan`): its own plan, in its words. */
export function claudePlanPrompt(view: string): string {
  return [
    view,
    "",
    "Before the battle begins, write your plan for this attack, as you would brief it to your platoon commanders. " +
      "Say how you will find the enemy, when and on what signal the company goes in, what each platoon does, " +
      "how you will use the mortar missions, and your time budget against the deadline. At most 250 words.",
  ].join("\n");
}

/** One line of the commander's memory: a decision it made, and why. */
export function memoryLine(q: Question, answer: string, reason?: string): string {
  const first = q.ask.split(/(?<=[.?])\s/)[0]!;
  const label = q.options.find((o) => o.id === answer)?.label ?? answer;
  return `- Turn ${q.turn}. ${first.length > 160 ? first.slice(0, 157) + "..." : first} You chose: ${label}${reason ? `. Why: ${reason}` : ""}`;
}

/** The user turn: your decisions so far (with `memory`), the picture, then the decision and its options by id. */
export function claudePrompt(q: Question, memory: readonly string[] = []): string {
  const options = q.kind === "noul" ? q.options.filter((o) => o.id === "yes" || o.id === "no") : q.options;
  return [
    ...(memory.length ? ["Your decisions so far in this battle, oldest first:", ...memory, ""] : []),
    q.view,
    "",
    `Decision: ${q.ask}`,
    "Options:",
    ...options.map((o) => `- ${o.id}: ${o.label}`),
  ].join("\n");
}

export interface ClaudeAskerOptions {
  /** A Claude model id, e.g. claude-haiku-4-5, claude-sonnet-5-5, claude-opus-5-5. */
  model: string;
  /** How hard it thinks (`output_config.effort`), where the model takes it. */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /** The order from battalion (`opord.ts`), given in the system prompt. */
  order?: Order;
  /** Write a plan before the first question, and carry it in every call after. */
  plan?: boolean;
  /** Carry the battle's decisions so far, with their reasons, in every call. */
  memory?: boolean;
  /**
   * The battle as one conversation, append-only: each question a user turn,
   * each answer the model's own turn passed back unchanged, so everything
   * before the newest question is read from the cache. Its memory is the
   * conversation itself; `memory` is then not needed.
   */
  conversation?: boolean;
}

/** Models that take neither effort nor server-side fallback. */
const PLAIN = /haiku/;

/** Tokens a call cost: uncached input, read from the cache, written to it (billed at 1.25x), and output. */
type Usage = { input: number; cached: number; written?: number; output: number };

/**
 * A commander backed by a Claude model, for one battle: with `plan` or
 * `memory` it keeps state between questions, so a new one is made for each
 * battle. Its confidence is its own report (0–1), asked for beside the
 * answer; it gives no per-option probabilities. A refusal the fallback chain
 * could not rescue is an error, not an answer.
 */
export function claudeCommander(client: Pick<Anthropic, "beta">, opts: ClaudeAskerOptions): { ask: Asker; plan: () => string | undefined } {
  const plain = PLAIN.test(opts.model);
  const system = claudeSystem(opts.order);
  let plan: string | undefined;
  const memory: string[] = [];
  /** The battle so far, in `conversation`: appended to, never edited. */
  const history: Anthropic.Beta.BetaMessageParam[] = [];

  const call = async (user: string, schema: Record<string, unknown>, what: string, inConversation = false) => {
    // Outside a conversation the request is as it always was: one user turn, a string.
    const turn: Anthropic.Beta.BetaMessageParam = { role: "user", content: inConversation ? [{ type: "text", text: user }] : user };
    const response = await client.beta.messages.create({
      model: opts.model,
      max_tokens: 16000,
      system: [
        { type: "text", text: system, cache_control: { type: "ephemeral" } },
        ...(plan ? [{ type: "text" as const, text: `Your plan, written before the battle:\n${plan}`, cache_control: { type: "ephemeral" as const } }] : []),
      ],
      messages: inConversation ? [...history, turn] : [turn],
      // The conversation's growing tail cached automatically, the breakpoint moving with it.
      ...(inConversation ? { cache_control: { type: "ephemeral" as const } } : {}),
      output_config: {
        ...(opts.effort && !plain ? { effort: opts.effort } : {}),
        format: { type: "json_schema", schema },
      },
      // A declined request is re-run on a fallback model inside the same call.
      ...(plain ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }),
    });
    if (response.stop_reason === "refusal") {
      throw new Error(`${response.model} declined ${what} (${response.stop_details?.category ?? "no category"})`);
    }
    // The model's turn goes back exactly as it came, thinking blocks and all (append-only).
    if (inConversation) history.push(turn, { role: "assistant", content: response.content as Anthropic.Beta.BetaContentBlockParam[] });
    const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text ?? "";
    const usage: Usage = {
      input: response.usage.input_tokens,
      cached: response.usage.cache_read_input_tokens ?? 0,
      written: response.usage.cache_creation_input_tokens ?? 0,
      output: response.usage.output_tokens,
    };
    return { parsed: JSON.parse(text) as Record<string, unknown>, model: response.model, usage };
  };
  const add = (a: Usage, b: Usage): Usage => ({ input: a.input + b.input, cached: a.cached + b.cached, written: (a.written ?? 0) + (b.written ?? 0), output: a.output + b.output });

  /**
   * One answer in the conversation: one schema for every call, so a
   * question's own options never touch the cached request; the options are
   * in the question, and an answer outside them gets a correction turn
   * appended, never an edit.
   */
  const conversationAnswer = async (q: Question, ids: readonly string[]) => {
    const schema = {
      type: "object",
      properties: {
        answer: { type: "string", description: "The id of exactly one of the options offered." },
        confidence: { type: "number", description: "How sure you are of this answer, 0 to 1." },
        reason: { type: "string", description: "Why, in one short sentence." },
      },
      required: ["answer", "confidence", "reason"],
      additionalProperties: false,
    };
    let r = await call(claudePrompt(q), schema, q.id, true);
    let usage = r.usage;
    for (let tries = 0; !ids.includes(String(r.parsed.answer)) && tries < 2; tries++) {
      r = await call(`"${String(r.parsed.answer)}" is not one of the options. Answer with one of: ${ids.join(", ")}.`, schema, q.id, true);
      usage = add(usage, r.usage);
    }
    if (!ids.includes(String(r.parsed.answer))) throw new Error(`${r.model} gave no option for ${q.id}: ${String(r.parsed.answer)}`);
    return { ...r, usage };
  };

  const ask: Asker = async (q) => {
    let planUsage: Usage | undefined;
    if (opts.plan && plan === undefined) {
      const r = await call(
        claudePlanPrompt(q.view),
        {
          type: "object",
          properties: { plan: { type: "string", description: "Your plan, at most 250 words." } },
          required: ["plan"],
          additionalProperties: false,
        },
        "the plan",
      );
      plan = String(r.parsed.plan);
      planUsage = r.usage;
    }
    const ids = q.options.map((o) => o.id);
    const r = opts.conversation ? await conversationAnswer(q, ids) : await call(
      claudePrompt(q, opts.memory ? memory : []),
      {
        type: "object",
        properties: {
          answer: { type: "string", enum: ids },
          confidence: { type: "number", description: "How sure you are of this answer, 0 to 1." },
          reason: { type: "string", description: "Why, in one short sentence." },
        },
        required: ["answer", "confidence", "reason"],
        additionalProperties: false,
      },
      q.id,
    );
    const parsed = r.parsed as { answer: string; confidence: number; reason: string };
    if (opts.memory) memory.push(memoryLine(q, parsed.answer, parsed.reason));
    return {
      answer: parsed.answer,
      confidence: Math.min(1, Math.max(0, parsed.confidence)),
      model: r.model,
      reason: parsed.reason,
      // The plan's tokens are counted with the first answer's.
      usage: planUsage ? add(r.usage, planUsage) : r.usage,
    };
  };
  return { ask, plan: () => plan };
}

/** A commander with no plan and no memory (or a fresh one: make one for each battle). */
export function claudeAsker(client: Pick<Anthropic, "beta">, opts: ClaudeAskerOptions): Asker {
  return claudeCommander(client, opts).ask;
}
