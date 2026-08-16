import { describe, it, expect } from "vitest";
import { Game, makeCommandGroup, makeInfantry, type GameRecording } from "../engine/index.js";
import {
  describeAction,
  describeExecution,
  describeOutcome,
  describeStandingOrder,
  reasonHe,
  recordingExtent,
  unitNames,
} from "./debriefText.js";

const nameOf = (id: string) => ({ "BLUE-1": "כיתה א'", "RED-1": "אויב" })[id] ?? id;

describe("describeStandingOrder", () => {
  it("names the objective, the gait and the task", () => {
    const text = describeStandingOrder(
      {
        gait: "run",
        destination: { x: 120.4, y: 300 },
        engage: { targetId: "RED-1", weapon: "sustainedMg" },
      },
      nameOf,
    );
    expect(text).toBe("התקדם ל(120, 300) בריצה · תקוף את אויב במקלע");
  });

  it("reads an order with no objective as holding", () => {
    expect(describeStandingOrder({ gait: "normal" }, nameOf)).toBe("החזק מקום");
  });
});

describe("describeExecution", () => {
  const moved = (arrived: boolean) => ({
    unitId: "BLUE-1",
    moved: {
      to: { x: 0, y: 100 },
      arrived,
      // The bound's own result is not narrated here — the caller reports what it
      // turned up (detection, charges) alongside.
      result: {} as never,
    },
  });

  it("distinguishes a bound on the way from arriving", () => {
    expect(describeExecution(moved(false), nameOf)).toBe("כיתה א' מתקדם לפי פקודה ל(0, 100)");
    expect(describeExecution(moved(true), nameOf)).toBe("כיתה א' הגיע ליעד (0, 100)");
  });

  it("reports the engagement the order ordered", () => {
    expect(
      describeExecution(
        {
          unitId: "BLUE-1",
          engaged: { targetId: "RED-1", hits: 2, newCasualties: 1, hitChance: 0.3 },
        },
        nameOf,
      ),
    ).toBe("כיתה א' תקף את אויב — 2 פגיעות ב-30%, 1 נפגעים");
  });

  it("translates the engine's reason rather than showing it raw", () => {
    expect(describeExecution({ unitId: "BLUE-1", reason: "target gone" }, nameOf)).toBe(
      "כיתה א': המטרה אינה עוד",
    );
    // An unknown reason still reads as something, rather than disappearing.
    expect(reasonHe("something new")).toBe("something new");
  });
});

/** A short battle fought the way the hotseat fights one: through orders. */
function orderedRecording(): GameRecording {
  const g = new Game({ seed: 5 });
  const squad = g.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", { x: 0, y: 300 }, 8));
  g.addUnit(makeCommandGroup("BLUE-HQ", "BLUE", "platoon", { x: 0, y: 320 }, 3));
  const red = g.addUnit(makeInfantry("RED-1", "RED", "squad", { x: 0, y: 60 }, 6));
  g.beginTurn();
  g.advanceToPhase("movement");
  g.setStandingOrder(squad.id, {
    gait: "run",
    destination: { x: 0, y: 640 },
    engage: { targetId: red.id, weapon: "smallArms" },
  });
  g.executeStandingOrders("BLUE");
  g.advanceToPhase("combat");
  g.executeStandingOrders("BLUE");
  return g.toRecording();
}

describe("narrating a recording of an orders battle", () => {
  const rec = orderedRecording();
  const names = unitNames(rec);
  const line = (kind: string) => {
    const action = rec.actions.find((a) => a.kind === kind);
    if (!action) throw new Error(`no ${kind} action recorded`);
    return describeAction(action, names);
  };

  it("names the objective on the step that ordered it", () => {
    expect(line("setStandingOrder")).toContain("פקודה: התקדם ל(0, 640) בריצה");
    expect(line("setStandingOrder")).toContain("תקוף את RED-1");
  });

  it("does not fall back to raw JSON for an order", () => {
    expect(line("setStandingOrder")).not.toContain("{");
    expect(line("executeStandingOrders")).toBe("BLUE: ביצוע פקודות עומדות");
  });

  it("reports each force's bound under the execution step", () => {
    const outcome = describeOutcome(
      { kind: "executeStandingOrders", executions: [{ unitId: "BLUE-1", moved: { to: { x: 0, y: 400 }, arrived: false, result: {} as never } }] },
      names,
    );
    expect(outcome).toBe("BLUE-1 מתקדם לפי פקודה ל(0, 400)");
  });

  it("draws the map wide enough for ground crossed under orders", () => {
    // Nothing journals the bounds, so without the objective the extent would
    // stop at the start line and the march would run off the map.
    expect(recordingExtent(rec).height).toBeGreaterThan(640);
  });
});

import { describeSector } from "./debriefText.js";

describe("a sector of observation in words", () => {
  it("reads the compass off the map, where y grows downward", () => {
    // 0° is +x — east; 90° is +y, which on the map is *down* the screen.
    expect(describeSector({ bearing: 0, width: 90 })).toContain("מזרח");
    expect(describeSector({ bearing: 90, width: 90 })).toContain("דרום");
    expect(describeSector({ bearing: 180, width: 90 })).toContain("מערב");
    expect(describeSector({ bearing: 270, width: 90 })).toContain("צפון");
    expect(describeSector({ bearing: 45, width: 90 })).toContain("דרום-מזרח");
  });

  it("quotes the arc as well as the bearing — a squad watches a frontage", () => {
    expect(describeSector({ bearing: 0, width: 60 })).toContain("60°");
  });
});
