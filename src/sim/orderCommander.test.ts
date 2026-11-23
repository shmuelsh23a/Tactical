import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { telAzekaAssaultListing } from "../app/scenarios/telAzekaAssault.js";
import { REFERENCE_DRILL } from "../app/drill.js";
import { ORDER_VERSION, validateOrder, type OrderProblem, type CompanyOrder, type ControlMeasure } from "../app/order.js";
import type { Decider, Question } from "../app/companyQuestions.js";
import { OrderRefused, orderDecider, triggered } from "../app/orderCommander.js";
import { REFERENCE_ORDERS } from "../app/referenceOrders.js";
import { ruleDecide } from "../app/ruleCommander.js";
import { DEFAULT_FIRE_CHOICES, runScenarioBattle } from "./scenarioBattle.js";

const PLATOONS = ["BLUE-1", "BLUE-2", "BLUE-3"];
const A = REFERENCE_ORDERS[0]!.order;
const withMeasures = (o: CompanyOrder, measures: ControlMeasure[]): CompanyOrder => ({ ...o, execution: { ...o.execution, measures } });
const texts = (ps: readonly OrderProblem[]) => ps.map((p) => p.text);
const q = (over: Partial<Question>): Question => ({ id: "go.5", turn: 5, kind: "choice", ask: "", options: [], view: "", ...over });

describe("a company order (decisions 126 and 128)", () => {
  it("takes every reference plan as written", () => {
    for (const r of REFERENCE_ORDERS) expect(texts(validateOrder(r.order, PLATOONS)), r.name).toEqual([]);
  });

  it("keeps the example order file a player copies the same as the hasty reference plan", () => {
    const file = fileURLToPath(new URL("../../tools/orders/tel-azeka-hasty.json", import.meta.url));
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(REFERENCE_ORDERS.find((r) => r.key === "C")!.order);
  });

  it("refuses an order without 2-134's minimum: a line of departure and the objective", () => {
    const problems = texts(validateOrder(withMeasures(A, []), PLATOONS));
    expect(problems.some((p) => /no line of departure/.test(p))).toBe(true);
    expect(problems.some((p) => /no objective/.test(p))).toBe(true);
    expect(() => orderDecider(withMeasures(A, []))).toThrow(OrderRefused);
  });

  it("refuses a measure the engine does not carry out yet, rather than playing as if it had read it", () => {
    const pl: ControlMeasure = { kind: "phaseLine", line: { name: "PL 1", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] } };
    expect(texts(validateOrder(withMeasures(A, [...A.execution.measures, pl])))).toContain("phaseLine: not yet carried out");
    // The limit of advance is carried out as a distance past the objective (decision 130), not yet as a drawn line.
    const drawn: ControlMeasure = { kind: "limitOfAdvance", line: { name: "LOA", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] } };
    expect(texts(validateOrder(withMeasures(A, [...A.execution.measures, drawn]))).some((p) => /^limitOfAdvance: only a distance past the objective/.test(p))).toBe(true);
    expect(validateOrder(withMeasures(A, [...A.execution.measures, { kind: "limitOfAdvance", beyondM: 200 }]))).toEqual([]);
    expect(validateOrder(withMeasures(A, [...A.execution.measures, { kind: "limitOfAdvance", beyondM: 50 }]))).not.toEqual([]);
    // A pinned objective is a pin the compiler cannot place yet.
    const pinned = withMeasures(A, [A.execution.measures[0]!, { kind: "objective", name: "SHOULDER", at: { at: { x: 1, y: 1 } } }]);
    expect(texts(validateOrder(pinned)).some((p) => /^objective: only the objective the tasking gives/.test(p))).toBe(true);
  });

  it("refuses what does not fit the side or itself: a platoon it lacks, a base of fire not tasked, an 'on order' with no FRAGORD, another version", () => {
    const o: CompanyOrder = {
      ...A,
      version: "0",
      execution: {
        ...A.execution,
        tasks: { "BLUE-4": "assault" },
        timeOfAttack: { when: "onOrder" },
        measures: [...A.execution.measures, { kind: "supportByFirePosition", name: "SBF", platoon: "BLUE-1", at: { suggested: "smallArmsReach" } }],
      },
    };
    const problems = texts(validateOrder(o, PLATOONS));
    expect(problems).toContain("tasks: the side has no platoon BLUE-4");
    expect(problems.some((p) => /SBF: platoon BLUE-1 is not given the support task/.test(p))).toBe(true);
    expect(problems.some((p) => /"on order" needs a FRAGORD/.test(p))).toBe(true);
    expect(problems.some((p) => p.startsWith("version 0"))).toBe(true);
    expect(ORDER_VERSION).not.toBe("0");
  });

  it("reads a trigger off what the commander's side knows", () => {
    const fixed4 = { when: "enemyFixed" as const, turns: 4 };
    expect(triggered(fixed4, q({ facts: { heldInSightTurns: 3 } }))).toBe(false);
    expect(triggered(fixed4, q({ facts: { heldInSightTurns: 4 } }))).toBe(true);
    expect(triggered({ when: "enemyFound" }, q({ facts: { heldInSightTurns: 0 } }))).toBe(false);
    expect(triggered({ when: "turn", turn: 30 }, q({ turn: 30, facts: {} }))).toBe(true);
    // No mortars is nothing left to fire.
    expect(triggered({ when: "missionsLeft", atMost: 4 }, q({ facts: { mortarLeft: null } }))).toBe(true);
    const both = { all: [fixed4, { when: "missionsLeft" as const, atMost: 4 }] };
    expect(triggered(both, q({ facts: { heldInSightTurns: 5, mortarLeft: 6 } }))).toBe(false);
    expect(triggered(both, q({ facts: { heldInSightTurns: 5, mortarLeft: 4 } }))).toBe(true);
    expect(triggered({ when: "onOrder" }, q({ facts: {} }))).toBe(false);
  });

  it("will not read a trigger off a question that carries no facts, rather than take none as nothing yet", () => {
    expect(() => triggered({ when: "enemyFound" }, q({}))).toThrow(/has none/);
    expect(() => triggered({ when: "missionsLeft", atMost: 4 }, q({ facts: { heldInSightTurns: 0 } }))).toThrow(/mortarLeft/);
  });

  it("sends a scout straight where the ground offers no observation point at all (the review: it answered p1, not an option)", () => {
    const post = q({ id: "plan.post.1", turn: 0, options: [{ id: "straight", label: "" }] });
    expect(orderDecider(A, PLATOONS)(post)).toBe("straight");
    expect(ruleDecide()(post)).toBe("straight");
  });

  it("refuses an order whose lines would do nothing or do harm unseen", () => {
    const ex = A.execution;
    const order = (over: Partial<CompanyOrder["execution"]>): CompanyOrder => ({ ...A, execution: { ...ex, ...over } });
    // A priority target no mission is ever called on: it only holds missions back.
    expect(texts(validateOrder(order({ fires: { ...ex.fires, policy: "sureMarks" } }))).some((p) => /never calls a priority target/.test(p))).toBe(true);
    // H-hour on a turn the company is not asked on would slip to the next fifth turn.
    expect(texts(validateOrder(order({ timeOfAttack: { when: "turn", turn: 32 } }))).some((p) => /would go on turn 35/.test(p))).toBe(true);
    expect(texts(validateOrder(order({ timeOfAttack: { when: "turn", turn: 35 } })))).toEqual([]);
    // No scouts and an H-hour that waits for them.
    expect(texts(validateOrder(order({ recon: { ...ex.recon, squads: 0 }, timeOfAttack: { when: "enemyFound" } }))).some((p) => /with no scouts/.test(p))).toBe(true);
    const waitsToMoveUp: ControlMeasure = { kind: "assaultPosition", at: { suggested: "lastCover" }, occupy: { when: "enemyFound" } };
    expect(
      texts(validateOrder(order({ recon: { ...ex.recon, squads: 0 }, timeOfAttack: { when: "atOnce" }, measures: [...ex.measures, waitsToMoveUp] }))),
    ).toContain("assaultPosition.occupy: with no scouts it waits for an enemy found that nobody is sent to find");
    expect(texts(validateOrder(order({ recon: { ...ex.recon, squads: 1, posts: [{ suggested: "towardObjective" }, { suggested: "towardObjective" }] } })))).toContain("recon.posts: 2 posts for 1 scouts");
  });

  it("refuses a file that is not an order in shape: a misspelt trigger, policy, measure or flag", () => {
    const file = JSON.parse(JSON.stringify(A)) as Record<string, any>;
    file.execution.timeOfAttack = { when: "enemyfound" };
    file.execution.fires.policy = "doctrinal";
    file.execution.measures.push({ kind: "limitOfAdvanse" });
    delete file.execution.boundByPlatoon;
    const problems = texts(validateOrder(file as CompanyOrder));
    expect(problems).toContain("fires.policy: one of doctrine, opportunity, sureMarks, anyMark");
    expect(problems).toContain('measure "limitOfAdvanse": not a control measure');
    expect(problems).toContain("boundByPlatoon: true or false");
    // Broken places are refused, not a TypeError; a name off the prototype is not a measure.
    const broken = JSON.parse(JSON.stringify(A)) as Record<string, any>;
    broken.execution.measures = [{ kind: "lineOfDeparture" }, { kind: "toString" }, ...A.execution.measures.slice(1)];
    broken.execution.recon.posts = "p1";
    expect(texts(validateOrder(broken as CompanyOrder))).toEqual(['recon.posts: a list of places', 'lineOfDeparture: no place ("at")', 'measure "toString": not a control measure']);
    file.execution.fires.policy = "doctrine";
    file.execution.measures.pop();
    file.execution.boundByPlatoon = false;
    expect(texts(validateOrder(file as CompanyOrder)).some((p) => /"enemyfound" is not one of/.test(p))).toBe(true);
  });

  it("answers what the order does not speak to by the intent, and says so", () => {
    const d = orderDecider(A, PLATOONS);
    const recommit = q({ id: "recommit.20", turn: 20, kind: "noul", options: [{ id: "yes", label: "" }, { id: "no", label: "" }] });
    expect(d(recommit)).toBe("yes");
    expect(d.notes).toEqual([{ turn: 20, question: "recommit.20", answer: "yes", why: "not covered" }]);
  });

  /**
   * The reference plans written as orders play as their hand-built form
   * (decision 126). One battle a plan proves it for that seed: both
   * commanders are asked every question, and the battle stops at the first
   * answer they differ on. Until then the battles are the same battle, so
   * no question either would be asked is missed. Seed 1000 because it is
   * the reference plans' own first seed (balance.md); on it every plan goes,
   * the flank and the move-up are taken, and the go question is answered
   * both ways. More seeds, and other scenarios:
   * `npm run jev-sim -- --opord parity --n 20` (320 battles, all the same).
   */
  const drill = { ...REFERENCE_DRILL, scouting: { watchTurns: 1 } };
  for (const r of REFERENCE_ORDERS) {
    it(`plays reference plan ${r.name} as --rule ${r.rule.join(",") || "(none)"} does`, () => {
      const rule = ruleDecide(new Set(r.rule));
      const order = orderDecider(r.order, PLATOONS);
      let asked = 0;
      const both: Decider = (question) => {
        const a = rule(question);
        expect(order(question), `${question.id}: ${question.ask}`).toBe(a);
        asked++;
        return a;
      };
      runScenarioBattle(telAzekaAssaultListing, 1000, { drill, fire: DEFAULT_FIRE_CHOICES, defenderFirePlan: true, decide: both });
      expect(asked).toBeGreaterThan(10);
    }, 60_000);
  }
});
