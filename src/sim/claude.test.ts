import { describe, it, expect } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { telAzekaAssaultListing } from "../app/scenarios/telAzekaAssault.js";
import { PLAIN_SCRIPT } from "../app/drill.js";
import { DEFAULT_FIRE_CHOICES, runScenarioBattle } from "./scenarioBattle.js";
import { fromAnswers, type Question } from "./companyQuestions.js";
import { CLAUDE_SYSTEM, claudeAsker, claudePrompt } from "./claude.js";
import { MISSION, playWithAsker } from "./jev.js";

/**
 * A Claude model answering the company commander's questions, tested with a
 * stand-in for the API: nothing here touches the network.
 */
const q: Question = {
  id: "go.platoon.BLUE-1.20",
  turn: 20,
  kind: "choice",
  ask: "What does platoon BLUE-1 do as the company goes in?",
  options: [
    { id: "assault", label: "assault the position" },
    { id: "reserve", label: "reserve: stay back" },
  ],
  view: "Turn 20. Your forces: …",
};

type Body = {
  model: string;
  system: { text: string; cache_control?: unknown }[];
  messages: { content: string }[];
  output_config: { effort?: string; format: { schema: { properties: { answer: { enum: string[] } } } } };
  fallbacks?: unknown;
};

/** The real client, with a stand-in for the HTTP round trip that answers `answer` (or refuses). */
function standIn(answer: (body: Body) => string | "refuse") {
  const seen: { body: Body; beta: string | null }[] = [];
  const client = new Anthropic({
    apiKey: "test-key",
    maxRetries: 0,
    fetch: async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Body;
      seen.push({ body, beta: new Headers(init?.headers).get("anthropic-beta") });
      const a = answer(body);
      const message = {
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: body.model,
        content: a === "refuse" ? [] : [{ type: "text", text: JSON.stringify({ answer: a, confidence: 1.4, reason: "because" }) }],
        stop_reason: a === "refuse" ? "refusal" : "end_turn",
        stop_details: a === "refuse" ? { type: "refusal", category: "general_harms", explanation: "" } : null,
        usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 900 },
      };
      return new Response(JSON.stringify(message), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  return { client, seen };
}

describe("a question as a Claude model is asked it", () => {
  it("carries the role and the mission in a cached system prompt, and the picture and options by id in the user turn", () => {
    for (const m of MISSION) expect(CLAUDE_SYSTEM).toContain(m);
    const prompt = claudePrompt(q);
    expect(prompt).toContain("Turn 20. Your forces: …");
    expect(prompt).toContain("- assault: assault the position");
    expect(prompt).toContain("- reserve: reserve: stay back");
  });

  it("holds the answer to the options' ids and reads it back, with its reason and tokens", async () => {
    const { client, seen } = standIn(() => "reserve");
    const a = await claudeAsker(client, { model: "claude-sonnet-5-5", effort: "low" })(q);
    expect(a).toMatchObject({ answer: "reserve", confidence: 1, model: "claude-sonnet-5-5", reason: "because" });
    expect(a.usage).toEqual({ input: 100, cached: 900, output: 20 });
    const { body, beta } = seen[0]!;
    expect(body.output_config.format.schema.properties.answer.enum).toEqual(["assault", "reserve"]);
    expect(body.output_config.effort).toBe("low");
    expect(body.system[0]!.cache_control).toEqual({ type: "ephemeral" });
    expect(body.fallbacks).toBe("default");
    expect(beta).toContain("server-side-fallback-2026-07-01");
  });

  it("sends Haiku neither effort nor fallbacks, which it does not take", async () => {
    const { client, seen } = standIn(() => "assault");
    await claudeAsker(client, { model: "claude-haiku-4-5", effort: "low" })(q);
    expect(seen[0]!.body.output_config.effort).toBeUndefined();
    expect(seen[0]!.body.fallbacks).toBeUndefined();
    expect(seen[0]!.beta).toBeNull();
  });

  it("treats a refusal as an error, not an answer", async () => {
    const { client } = standIn(() => "refuse");
    await expect(claudeAsker(client, { model: "claude-opus-5-5" })(q)).rejects.toThrow(/declined go\.platoon\.BLUE-1\.20 \(general_harms\)/);
  });

  it("plays a whole battle, and the battle replays from its answers without the model", async () => {
    // A stand-in that always takes the first option offered.
    const { client } = standIn((body) => body.output_config.format.schema.properties.answer.enum[0]!);
    const drill = { ...PLAIN_SCRIPT, scouting: { watchTurns: 1 } };
    const run = (decide: Parameters<typeof runScenarioBattle>[2]["decide"]) =>
      runScenarioBattle(telAzekaAssaultListing, 11, { drill, fire: DEFAULT_FIRE_CHOICES, decide });
    const { result, answers, log } = await playWithAsker(run, claudeAsker(client, { model: "claude-haiku-4-5" }));
    expect(log.length).toBe(answers.length);
    expect(log.every((e) => e.model === "claude-haiku-4-5")).toBe(true);
    expect(run(fromAnswers(answers))).toEqual(result);
  }, 60_000);
});
