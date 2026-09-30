import type Anthropic from "@anthropic-ai/sdk";
import type { Question } from "./companyQuestions.js";
import { MISSION, type Asker } from "./jev.js";

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

/** The user turn: the picture, then the decision and its options by id. */
export function claudePrompt(q: Question): string {
  const options = q.kind === "noul" ? q.options.filter((o) => o.id === "yes" || o.id === "no") : q.options;
  return [
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
}

/** Models that take neither effort nor server-side fallback. */
const PLAIN = /haiku/;

/**
 * An asker backed by a Claude model. Its confidence is its own report
 * (0–1), asked for beside the answer; it gives no per-option probabilities.
 * A refusal the fallback chain could not rescue is an error, not an answer.
 */
export function claudeAsker(client: Pick<Anthropic, "beta">, opts: ClaudeAskerOptions): Asker {
  const plain = PLAIN.test(opts.model);
  return async (q) => {
    const ids = q.options.map((o) => o.id);
    const response = await client.beta.messages.create({
      model: opts.model,
      max_tokens: 16000,
      system: [{ type: "text", text: CLAUDE_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: claudePrompt(q) }],
      output_config: {
        ...(opts.effort && !plain ? { effort: opts.effort } : {}),
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              answer: { type: "string", enum: ids },
              confidence: { type: "number", description: "How sure you are of this answer, 0 to 1." },
              reason: { type: "string", description: "Why, in one short sentence." },
            },
            required: ["answer", "confidence", "reason"],
            additionalProperties: false,
          },
        },
      },
      // A declined request is re-run on a fallback model inside the same call.
      ...(plain ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }),
    });
    if (response.stop_reason === "refusal") {
      throw new Error(`${response.model} declined ${q.id} (${response.stop_details?.category ?? "no category"})`);
    }
    const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text ?? "";
    const parsed = JSON.parse(text) as { answer: string; confidence: number; reason: string };
    return {
      answer: parsed.answer,
      confidence: Math.min(1, Math.max(0, parsed.confidence)),
      model: response.model,
      reason: parsed.reason,
      usage: { input: response.usage.input_tokens, cached: response.usage.cache_read_input_tokens ?? 0, output: response.usage.output_tokens },
    };
  };
}
