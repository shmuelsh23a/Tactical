import { describe, it, expect } from "vitest";
import { telAzekaAssaultListing } from "../app/scenarios/telAzekaAssault.js";
import { PLAIN_SCRIPT } from "../app/drill.js";
import { DEFAULT_FIRE_CHOICES, runScenarioBattle } from "./scenarioBattle.js";
import { NeedAnswer, fromAnswers, type Question } from "./companyQuestions.js";

/**
 * The company commander's decisions as typed questions — what Jev will be
 * asked, and what an agent standing in for it answers (`tools/jev-sim.ts`).
 */
const drill = { ...PLAIN_SCRIPT, scouting: { watchTurns: 1 } };
const play = (answers: string[]) =>
  runScenarioBattle(telAzekaAssaultListing, 11, { drill, fire: DEFAULT_FIRE_CHOICES, decide: fromAnswers(answers) });
const nextQuestion = (answers: string[]): Question => {
  try {
    play(answers);
  } catch (e) {
    if (e instanceof NeedAnswer) return e.question;
    throw e;
  }
  throw new Error("the battle ended");
};

describe("the company's questions", () => {
  it("start with the plan: how many scouts", () => {
    const q = nextQuestion([]);
    expect(q.id).toBe("plan.scouts");
    expect(q.kind).toBe("choice");
    expect(q.options.map((o) => o.id)).toEqual(["0", "1", "2"]);
  });

  it("tell the commander nothing of the enemy it has not found", () => {
    const q = nextQuestion([]);
    expect(q.view).toContain("Enemy: nothing found yet.");
    expect(q.view).not.toMatch(/RED-/);
  });

  it("ask where each scout watches from, then where the rest wait", () => {
    const ids = [nextQuestion(["2"]).id, nextQuestion(["2", "straight"]).id, nextQuestion(["2", "straight", "straight"]).id];
    expect(ids).toEqual(["plan.post.1", "plan.post.2", "plan.wait"]);
  });

  it("play a battle to its end from its answers, the same way every time", () => {
    // Answer everything the same simple way until the battle ends.
    const answers: string[] = [];
    for (let i = 0; i < 400; i++) {
      let q: Question;
      try {
        play(answers);
        break;
      } catch (e) {
        if (!(e instanceof NeedAnswer)) throw e;
        q = e.question;
      }
      answers.push(q.id === "plan.scouts" ? "0" : q.kind === "noul" ? "yes" : q.options[0]!.id);
    }
    const a = play(answers);
    const b = play(answers);
    expect(a).toEqual(b);
    expect(a.turns).toBeGreaterThan(0);
  });

  it("refuse an answer that is not one of the options", () => {
    expect(() => play(["3"])).toThrow(/not an option/);
  });
});
