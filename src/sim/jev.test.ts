import { describe, it, expect } from "vitest";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { telAzekaAssaultListing } from "../app/scenarios/telAzekaAssault.js";
import { PLAIN_SCRIPT } from "../app/drill.js";
import { DEFAULT_FIRE_CHOICES, runScenarioBattle } from "./scenarioBattle.js";
import { QUESTION_SET_VERSION, fromAnswers, type Decider, type Question } from "./companyQuestions.js";
import { MISSION, jevAsker, jevRequest, playWithAsker, type Asker } from "./jev.js";

/**
 * Jev answering the company commander's questions (backlog 15), tested with
 * stand-ins for the service: nothing here touches the network.
 */
const drill = { ...PLAIN_SCRIPT, scouting: { watchTurns: 1 } };
const run = (seed: number) => (decide: Decider) =>
  runScenarioBattle(telAzekaAssaultListing, seed, { drill, fire: DEFAULT_FIRE_CHOICES, decide });

const choiceQ: Question = {
  id: "plan.scouts",
  turn: 0,
  kind: "choice",
  ask: "How many scouts?",
  options: [
    { id: "1", label: "one squad" },
    { id: "2", label: "two squads" },
  ],
  view: "Your forces: …",
};
const noulQ: Question = {
  id: "go.20",
  turn: 20,
  kind: "noul",
  ask: "Send the company in now?",
  options: [
    { id: "yes", label: "yes: the company advances" },
    { id: "no", label: "no: keep holding" },
  ],
  view: "Your forces: …",
};

describe("a question as Jev is asked it", () => {
  it("puts the commander's picture as the state and the options as the criteria", () => {
    expect(jevRequest(choiceQ, "plain")).toEqual({
      state: "Your forces: …",
      questions: { decision: { type: "choice", instructions: "How many scouts?", criteria: { "1": "one squad", "2": "two squads" } } },
    });
    expect(jevRequest(noulQ, "plain").questions.decision).toEqual({
      type: "noul",
      instructions: "Send the company in now?",
      criteria: { true: "yes: the company advances", false: "no: keep holding" },
    });
  });

  it("frames it by default with the commander's role and mission, naming none of the options", () => {
    const { state } = jevRequest(choiceQ);
    expect(state).toMatchObject({ situation: "Your forces: …", mission: [...MISSION] });
    expect(typeof (state as { role: unknown }).role).toBe("string");
    // Jev leans to an option whose words the state repeats (docs/balance.md, thirty-fourth round).
    const words = MISSION.join(" ").toLowerCase();
    for (const option of ["reserve", "assault", "base of fire", "halt", "withdraw", "carry on"]) expect(words).not.toContain(option);
  });

  it("reads Jev's answers through the SDK: a choice is its pick, a yes or no is its probability at even odds", async () => {
    // The real client, with a stand-in for the HTTP round trip.
    const bodies: unknown[] = [];
    const client = new TypeSafeClient({
      apiKey: "test-key",
      retry: { maxRetries: 0 },
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { questions: { decision: { type: string } } };
        bodies.push(body);
        const decision =
          body.questions.decision.type === "noul"
            ? { type: "noul", noul: 0.3 }
            : { type: "choice", choice: "2", confidence: 0.8, probabilities: { "1": 0.2, "2": 0.8 } };
        return new Response(JSON.stringify({ model: "jev-test", answers: { decision }, usage: { input_tokens: 1, output_tokens: 1 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    const ask = jevAsker(client);
    expect(await ask(choiceQ)).toEqual({ answer: "2", confidence: 0.8, probabilities: { "1": 0.2, "2": 0.8 }, model: "jev-test" });
    const no = await ask(noulQ);
    expect(no.answer).toBe("no");
    expect(no.confidence).toBeCloseTo(0.7, 6);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatchObject({ state: { situation: "Your forces: …" }, model: "jev-latest" });
  });
});

describe("a battle played by an asker", () => {
  // A stand-in commander: always the first option, and "yes" to going in.
  const firstOption: Asker = async (q) => ({ answer: q.kind === "noul" ? "yes" : q.options[0]!.id, confidence: 1, model: "stand-in" });

  it("plays to an end, logging every question with the model and the question set", async () => {
    const { result, answers, log } = await playWithAsker(run(11), firstOption);
    expect(result.turns).toBeGreaterThan(0);
    expect(answers.length).toBeGreaterThan(0);
    expect(log).toHaveLength(answers.length);
    expect(log[0]).toMatchObject({ n: 1, model: "stand-in", questionSet: QUESTION_SET_VERSION });
    expect(log.map((e) => e.answer)).toEqual(answers);
  });

  it("replays from its answers alone, never asking again", async () => {
    let asked = 0;
    const counting: Asker = async (q) => (asked++, firstOption(q));
    const played = await playWithAsker(run(12), counting);
    const calls = asked;
    // The replay is the answers: no asker at all, the same battle.
    expect(run(12)(fromAnswers(played.answers))).toEqual(played.result);
    expect(asked).toBe(calls);
  });

  it("refuses an answer that is not one of the question's options", async () => {
    const wrong: Asker = async () => ({ answer: "nonsense", confidence: 1, model: "stand-in" });
    await expect(playWithAsker(run(11), wrong)).rejects.toThrow(/not one of its options/);
  });
});
