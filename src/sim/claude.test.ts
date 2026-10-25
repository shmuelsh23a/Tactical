import { SCENARIOS } from "../app/scenario.js";
import { describe, it, expect } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { telAzekaAssaultListing } from "../app/scenarios/telAzekaAssault.js";
import { PLAIN_SCRIPT } from "../app/drill.js";
import { DEFAULT_FIRE_CHOICES, runScenarioBattle } from "./scenarioBattle.js";
import { fromAnswers, type Question } from "./companyQuestions.js";
import { CLAUDE_SYSTEM, claudeAsker, claudeCommander, claudePrompt, pictureFor } from "./claude.js";
import { MISSION, jevRequest, playWithAsker } from "./jev.js";
import { ORDERS } from "./opord.js";

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
  messages: { role: string; content: unknown }[];
  cache_control?: unknown;
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
        // Asked for a plan (its schema has no answer), it writes one.
        content:
          a === "refuse"
            ? []
            : [{ type: "text", text: JSON.stringify("plan" in (body.output_config.format.schema.properties as object) ? { plan: "find them, then go" } : { answer: a, confidence: 1.4, reason: "because" }) }],
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
    expect(a.usage).toEqual({ input: 100, cached: 900, written: 0, output: 20 });
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

  it("with an order, a plan and a memory: the order in the system prompt, the plan written once and carried, the decisions so far in the user turn", async () => {
    const { client, seen } = standIn((body) => body.output_config.format.schema.properties.answer?.enum[0] ?? "");
    const order = ORDERS.telAzekaAssault!;
    const c = claudeCommander(client, { model: "claude-opus-5-5", order, plan: true, memory: true });
    await c.ask(q);
    await c.ask({ ...q, id: "go.platoon.BLUE-2.20", ask: "What does platoon BLUE-2 do? More words." });
    // The plan first, then the two questions.
    expect(seen.length).toBe(3);
    expect(c.plan()).toBe("find them, then go");
    for (const { body } of seen) expect(body.system[0]!.text).toContain(order[0]!);
    expect(seen[0]!.body.system.length).toBe(1);
    expect(seen[0]!.body.messages[0]!.content).toContain("write your plan");
    expect(seen[1]!.body.system[1]!.text).toContain("find them, then go");
    expect(seen[1]!.body.messages[0]!.content).not.toContain("Your decisions so far");
    const second = seen[2]!.body.messages[0]!.content;
    expect(second).toContain("Your decisions so far");
    expect(second).toContain("- Turn 20. What does platoon BLUE-1 do as the company goes in? You chose: assault the position. Why: because");
  });
});

describe("the order from battalion", () => {
  it("is written for both assault scenarios, and names none of the options", () => {
    for (const id of ["telAzekaAssault", "telAzekaAssault2"]) {
      const words = ORDERS[id]!.join(" ").toLowerCase();
      expect(words).toContain("turn 60");
      // The enemy's reinforcement (decision 122), as the scenario itself has it: the order is written by hand, so it is held to the data.
      const r = SCENARIOS.find((s) => s.id === id)!.build(1000).game.reinforcements[0]!;
      expect(words).toContain(`between turns ${r.window[0]} and ${r.window[1]}`);
      expect(words).toContain(`about ${r.fire![0]!.missions} more mortar missions`);
      // Jev leans to an option whose words the state repeats (docs/balance.md, thirty-fourth round).
      for (const option of ["reserve", "assault", "base of fire", "halt", "withdraw", "carry on", "bound", "hold short", "lift"]) expect(words).not.toContain(option);
    }
    expect(ORDERS.telAzekaAssault!.join(" ")).toContain("three platoons");
    expect(ORDERS.telAzekaAssault2!.join(" ")).toContain("two platoons");
  });

  it("goes to Jev beside the mission with the order framing", () => {
    const { state } = jevRequest(q, "order", ORDERS.telAzekaAssault);
    expect(state).toMatchObject({ mission: [...MISSION], orders: [...ORDERS.telAzekaAssault!], situation: q.view });
  });

  it("plays the battle as one append-only conversation, the tail cached, one schema throughout (conversation)", async () => {
    let n = 0;
    const { client, seen } = standIn(() => (++n === 2 ? "charge" : "reserve")); // the second answer is not an option
    const c = claudeCommander(client, { model: "claude-opus-5-5", conversation: true });
    await c.ask(q);
    const second = await c.ask({ ...q, id: "go.21", turn: 21 });
    expect(second.answer).toBe("reserve");
    const [first, again, fixed] = seen.map((x) => x.body);
    // One schema for every call: no options in it.
    for (const b of [first!, again!, fixed!]) expect((b.output_config.format.schema.properties.answer as { enum?: string[] }).enum).toBeUndefined();
    // The growing tail cached automatically; the first call's turns come back unchanged, in order.
    expect(again!.cache_control).toEqual({ type: "ephemeral" });
    expect(again!.messages.slice(0, 2)).toEqual([first!.messages[0], expect.objectContaining({ role: "assistant" })]);
    // An answer outside the options gets a correction turn appended, never an edit.
    expect(fixed!.messages.slice(0, 3)).toEqual(again!.messages);
    expect(JSON.stringify(fixed!.messages.at(-1))).toContain("is not one of the options");
  });

  it("sends the whole picture when much changed, and only what changed otherwise (updates)", () => {
    const picture = (turn: number, blue1: string, enemy: string[]) => [
      `Turn ${turn} (a turn is one minute). You command BLUE's company, attacking.`,
      "In short: you attack; the enemy holds the ground your plan puts it on.",
      "Mortar missions left: 6.",
      "Your forces:",
      `  BLUE-1 (infantry, squad) at ${blue1}, 8/8 fit`,
      "  BLUE-2 (infantry, squad) at (500, 900), 8/8 fit",
      "  BLUE-3 (infantry, squad) at (600, 900), 8/8 fit",
      "  BLUE-4 (infantry, squad) at (700, 900), 8/8 fit",
      "Enemy as your side has it (a mark is where it was reported, not necessarily where it is):",
      ...enemy,
    ].join("\n");
    const first = picture(10, "(400, 900)", ["  RED-1: infantry at (520, 440), in sight", "  RED-2: infantry at (600, 450), in sight"]);
    expect(pictureFor(first, undefined)).toBe(first); // the first time, whole
    expect(pictureFor(first, first)).toBe("The picture is as in your last message.");
    // A turn on: the turn line, one squad moved, one mark gone.
    const next = picture(11, "(400, 850)", ["  RED-1: infantry at (520, 440), in sight"]);
    const update = pictureFor(next, first);
    expect(update).toContain("Turn 11");
    expect(update).toContain("Your forces:\n  BLUE-1 (infantry, squad) at (400, 850), 8/8 fit");
    expect(update).not.toContain("BLUE-2");
    expect(update).not.toContain("Mortar missions left");
    expect(update).toContain("RED-2: no longer in your picture");
    // Most of it changed: whole again.
    const moved = picture(12, "(1, 1)", ["  RED-3: infantry at (1, 2), in sight", "  RED-4: infantry at (3, 4), in sight"]).replace(/\(\d+, 900\)/g, "(9, 9)");
    expect(pictureFor(moved, next)).toBe(moved);
  });
});
