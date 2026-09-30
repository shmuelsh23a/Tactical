import { describe, it, expect } from "vitest";
import { telAzekaAssaultListing } from "../app/scenarios/telAzekaAssault.js";
import { PLAIN_SCRIPT } from "../app/drill.js";
import { DEFAULT_FIRE_CHOICES, notInSight, runScenarioBattle } from "./scenarioBattle.js";
import { Game, makeInfantry } from "../engine/index.js";
import { ScriptedCompany } from "../app/company.js";
import { NeedAnswer, casualtiesSeen, fromAnswers, underFire, viewOf, type Question } from "./companyQuestions.js";

/**
 * The company commander's decisions as typed questions — what Jev will be
 * asked, and what an agent standing in for it answers (`tools/jev-sim.ts`).
 */
const drill = { ...PLAIN_SCRIPT, scouting: { watchTurns: 1 } };
const play = (answers: string[], seed = 11) =>
  runScenarioBattle(telAzekaAssaultListing, seed, { drill, fire: DEFAULT_FIRE_CHOICES, decide: fromAnswers(answers) });
const nextQuestion = (answers: string[], seed = 11): Question => {
  try {
    play(answers, seed);
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
    expect(q.options.map((o) => o.id)).toEqual(["0", "1", "2", "3"]);
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
    expect(() => play(["4"])).toThrow(/not an option/);
  });

  it("state when the attack is called off, and the losses so far", () => {
    const q = nextQuestion([]);
    expect(q.view).toMatch(/called off when about 40% of your men are down, broken or fled \(now 0%/);
  });

  it("state the mission's deadline (rules decision 58)", () => {
    const q = nextQuestion([]);
    expect(q.view).toMatch(/Deadline: take the objective by the end of turn 45 \(45 turns left/);
    expect(q.view).toContain("יש להשלים את המשימה עד תור 45.");
  });

  it("name what each observation point sees", () => {
    const q = nextQuestion(["1"]);
    const post = q.options.find((o) => o.id === "p1");
    expect(post?.label).toMatch(/sees .*the plan's centre|sees .*its (west|east|far side|near side)/);
  });

  it("report the enemy's losses in words, never as a count (rules decision 13)", () => {
    expect([0, 1, 2, 3, 5, 6, 12].map(casualtiesSeen)).toEqual([
      "no casualties seen",
      "a few casualties",
      "a few casualties",
      "several casualties",
      "several casualties",
      "heavy casualties",
      "heavy casualties",
    ]);
  });

  it("after 'go', ask which way the company goes and whether the scouts give a base of fire", () => {
    // Two scouts to the first observation point, the company in dead ground,
    // then go at the first chance: the next two questions are the axis and support.
    const answers = ["2", "p1", "p1", "deadGround"];
    for (let i = 0; i < 80; i++) {
      const q = nextQuestion(answers);
      if (q.id.startsWith("go.axis")) {
        expect(q.options[0]!.id).toBe("straight");
        answers.push(q.options[1]!.id);
        expect(nextQuestion(answers).id).toMatch(/^go\.support\./);
        return;
      }
      answers.push(q.id.startsWith("go.") ? "yes" : q.id.startsWith("scout.") ? "on" : "hold");
    }
    throw new Error("never asked which way to go");
  });

  it("ask about a scout that sits at its point seeing nothing, and send it on when told (item 1)", () => {
    // Before, the drill walked it on toward the objective by itself after six turns.
    // Seed 12: since decision 63 the holding company on seed 11 is shelled
    // out of the fight before a scout has sat long enough to be asked.
    const seed = 12;
    const answers = ["2", "p1", "p1", "deadGround"];
    const where = (q: Question, id: string) => q.view.split("\n").find((l) => l.trim().startsWith(id + " "))!;
    for (let i = 0; i < 60; i++) {
      const q = nextQuestion(answers, seed);
      if (/watched from its observation point/.test(q.ask)) {
        const id = q.id.split(".")[1]!;
        expect(q.options.find((o) => o.id === "on")?.label).toMatch(/toward the plan's centre/);
        const before = where(q, id);
        answers.push("on");
        // Keep holding the company; the scout leaves its point.
        let later = nextQuestion(answers, seed);
        for (let k = 0; k < 10 && later.turn <= q.turn + 1; k++) {
          answers.push(later.id.startsWith("go.") ? "no" : later.options[0]!.id);
          later = nextQuestion(answers, seed);
        }
        expect(where(later, id)).not.toEqual(before);
        return;
      }
      answers.push(q.id.startsWith("go.") ? "no" : q.id.startsWith("scout.") ? "here" : q.options[0]!.id);
    }
    throw new Error("never asked about a scout at its point");
  });

  it("say what was found near the objective when none of it is in sight, not 'not found yet'", () => {
    const g = new Game({ seed: 3, trackIntel: true, enforceC2: false });
    const scout = g.addUnit(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 200 }, 9));
    g.addUnit(makeInfantry("B2", "BLUE", "squad", { x: 80, y: 0 }, 9));
    const objective = { x: 0, y: 600 };
    const flat = { objects: [] };
    const company = new ScriptedCompany(g, "BLUE", objective, [objective], { recon: { scouts: 1 } }, { terrain: flat, width: 1000, height: 1000 });
    g.beginTurn();
    expect(notInSight(g, company)).toMatch(/have not found the enemy near the objective yet/);
    const red = g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 400 }, 9)); // in small-arms reach of the scout
    g.advanceToPhase("combat");
    g.fire(red.id, scout.id, { weapon: "smallArms" });
    expect(g.knows("BLUE", red.id)).toBe(true);
    red.neutralized = true;
    expect(notInSight(g, company)).toMatch(/found 1 enemy force near the objective \(1 out of action\)/);
  });

  it("after 'go', ask each platoon's task, whether to bound by platoon, and whether to wait for the fires to lift (item 2)", () => {
    const answers = ["2", "p1", "p1", "deadGround"];
    const asked: string[] = [];
    for (let i = 0; i < 120; i++) {
      const q = nextQuestion(answers);
      if (q.id.startsWith("go.")) asked.push(q.id.replace(/\.\d+$/, ""));
      if (q.id.startsWith("go.lift")) {
        expect(asked).toEqual(
          expect.arrayContaining(["go.axis", "go.support", "go.platoon.BLUE-1", "go.platoon.BLUE-2", "go.platoon.BLUE-3", "go.bound"]),
        );
        return;
      }
      if (q.id.startsWith("go.platoon")) expect(q.options.map((o) => o.id)).toEqual(["assault", "support", "reserve"]);
      answers.push(/^go\.\d+$/.test(q.id) ? "yes" : q.id.startsWith("go.") ? q.options[0]!.id : q.id.startsWith("scout.") ? "on" : q.options[0]!.id);
    }
    throw new Error("never asked about the fires lifting");
  });

  it("tell the commander which of its forces is under fire, and from what its side knows (item 2)", () => {
    const g = new Game({ seed: 3, trackIntel: true, enforceC2: false });
    const b = g.addUnit(makeInfantry("B1", "BLUE", "squad", { x: 0, y: 0 }, 9));
    const seen = g.addUnit(makeInfantry("R1", "RED", "squad", { x: 0, y: 200 }, 9));
    g.beginTurn();
    g.advanceToPhase("combat");
    g.fire(seen.id, b.id, { weapon: "smallArms" });
    expect(g.knows("BLUE", seen.id)).toBe(true);
    expect(underFire(g, "BLUE", b)).toBe("B1 under fire from R1");
    // A firer its side holds no mark on is only a direction.
    const hidden = g.addUnit(makeInfantry("R2", "RED", "squad", { x: 200, y: 0 }, 9));
    const notes = g.fireReceived(b.id, 0).length;
    g.advanceToPhase("initiative");
    g.advanceToPhase("combat");
    g.fire(hidden.id, b.id, { weapon: "smallArms" });
    expect(g.fireReceived(b.id, 0).length).toBe(notes + 1);
    if (!g.knows("BLUE", hidden.id)) expect(underFire(g, "BLUE", b)).toMatch(/an enemy it cannot see, to its east/);
    expect(viewOf(g, "BLUE", { objective: { x: 0, y: 300 }, mortarLeft: null })).toMatch(/B1 \(infantry, squad\).*under fire from R1/);
  });
});
