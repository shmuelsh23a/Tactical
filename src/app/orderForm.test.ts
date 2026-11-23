import { describe, expect, it } from "vitest";
import { telAzekaAssaultListing } from "./scenarios/telAzekaAssault.js";
import { validateOrder } from "./order.js";
import { orderDecider } from "./orderCommander.js";
import { REFERENCE_ORDERS } from "./referenceOrders.js";
import { ruleDecide } from "./ruleCommander.js";
import { applyMark, choicesOf, defaultChoices, formMarks, hHourOf, orderOf, triggerOf, type HHour } from "./orderForm.js";
import { ORDERED_DRILL } from "./orderedAttacker.js";
import { DEFAULT_FIRE_CHOICES, runScenarioBattle } from "../sim/scenarioBattle.js";
import type { Decider } from "./companyQuestions.js";

const PLATOONS = ["BLUE-1", "BLUE-2", "BLUE-3"];

describe("the order form's model (decision 128)", () => {
  it("reads every H-hour it writes back as itself", () => {
    const all: HHour[] = [
      { kind: "fixed", turns: 4 },
      { kind: "found" },
      { kind: "prep", turns: 4, missions: 4, byTurn: 30 },
      { kind: "turn", turn: 20 },
      { kind: "atOnce" },
    ];
    for (const h of all) expect(hHourOf(triggerOf(h))).toEqual(h);
  });

  it("writes an order that plays from its opening choices", () => {
    expect(validateOrder(orderOf(defaultChoices(REFERENCE_ORDERS), "telAzekaAssault", "BLUE"), PLATOONS)).toEqual([]);
  });

  /**
   * A reference plan loaded into the form and written back out plays as the
   * plan itself: the template is the plan, not a likeness of it. One battle a
   * plan, both commanders asked every question (as orderCommander.test.ts).
   */
  for (const r of REFERENCE_ORDERS) {
    it(`writes reference plan ${r.name} back out as an order that answers as --rule ${r.rule.join(",") || "(none)"}`, () => {
      const choices = choicesOf(r.order);
      expect(choices).toBeDefined();
      const written = orderOf(choices!, "telAzekaAssault", "BLUE");
      expect(validateOrder(written, PLATOONS)).toEqual([]);
      const rule = ruleDecide(new Set(r.rule));
      const order = orderDecider(written, PLATOONS);
      let asked = 0;
      const both: Decider = (q) => {
        const a = rule(q);
        expect(order(q), q.id).toBe(a);
        asked++;
        return a;
      };
      runScenarioBattle(telAzekaAssaultListing, 1000, { drill: ORDERED_DRILL, fire: DEFAULT_FIRE_CHOICES, defenderFirePlan: true, decide: both });
      expect(asked).toBeGreaterThan(10);
    }, 60_000);
  }
});

describe("the order form's map marks", () => {
  const ground = {
    objective: { x: 500, y: 300 },
    observationPoints: [{ x: 100, y: 100 }, { x: 900, y: 100 }],
    flanks: [{ side: "west" as const, at: { x: 300, y: 400 } }, { side: "east" as const, at: { x: 700, y: 400 } }],
    assaultPosition: { x: 500, y: 550 },
    planned: [{ x: 500, y: 300 }, { x: 410, y: 300 }, { x: 590, y: 300 }],
    platoons: ["BLUE-1", "BLUE-2"],
  };
  const base = defaultChoices(REFERENCE_ORDERS);

  it("puts the scout being placed on the point clicked, and shows which scout watches where", () => {
    const c = applyMark(base, "op:2", 1, 2);
    expect(c.posts).toEqual([2, 2]);
    const marks = formMarks(ground, c);
    expect(marks.find((m) => m.id === "op:2")).toMatchObject({ chosen: true, label: 'נ"ת 2 — סייר 1, 2' });
    expect(marks.find((m) => m.id === "op:1")!.chosen).toBe(false);
  });

  it("toggles a flank, the assault position and the priority target", () => {
    let c = applyMark(base, "flank:east", 1, 2);
    expect(c.axis).toBe("east");
    expect(applyMark(c, "flank:east", 1, 2).axis).toBe("straight");
    c = applyMark(c, "assault", 1, 2);
    expect(c.moveUp).toBe("found");
    expect(applyMark(c, "target:centre", 1, 2).priority).toBe("none");
    expect(applyMark(c, "target:west", 1, 2).priority).toBe("west");
  });

  it("writes a post placed on the map into the order, and leaves the battle's own choice unwritten", () => {
    expect(orderOf(base, "telAzekaAssault", "BLUE").execution.recon.posts).toBeUndefined();
    const placed = orderOf(applyMark(base, "op:2", 1, 3), "telAzekaAssault", "BLUE");
    expect(placed.execution.recon.posts?.[0]).toEqual({ suggested: "observationPoint", rank: 2 });
    expect(validateOrder(placed, PLATOONS)).toEqual([]);
  });
});
