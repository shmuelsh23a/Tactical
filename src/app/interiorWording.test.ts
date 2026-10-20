import { describe, it, expect } from "vitest";
import type { InteriorReport } from "../engine/index.js";
import { describeInteriorPlan, interiorReportHe, reasonHe } from "./debriefText.js";

/** A fight inside a building, as each side reads it (rules decisions 96 and 13). */
const report: InteriorReport = {
  buildingId: "house",
  attackerSide: "BLUE",
  attackerUnits: ["B-1"],
  defenderUnits: ["R-1"],
  began: true,
  attackersOut: 1,
  defendersOut: 3,
  defendersWithdrew: 0,
  attackersWithdrew: 0,
  roomsCleared: 4,
  rooms: 9,
};
const names = (id: string) => ({ "B-1": "כיתה 1", "R-1": "מחלקה א'/1" })[id] ?? id;

describe("a fight inside a building, in Hebrew", () => {
  it("counts a side's own losses and only reports the enemy's", () => {
    const blue = interiorReportHe(report, names, "BLUE");
    expect(blue).toContain("קרב בתוך מבנה: כיתה 1 נכנס למבנה שבידי האויב");
    expect(blue).not.toContain("מחלקה א'/1"); // the enemy is not named to him
    expect(interiorReportHe(report, names, "RED")).toContain("האויב נכנס אל מחלקה א'/1");
    expect(interiorReportHe(report, names, "RED")).not.toContain("כיתה 1");
    expect(interiorReportHe(report, names, null)).toContain("כיתה 1 נכנס אל מחלקה א'/1");
    expect(blue).toContain("4/9 חדרים טוהרו");
    expect(blue).toContain("שלנו: 1 נפגעים");
    expect(blue).toContain("האויב: מספר נפגעים");
    expect(interiorReportHe(report, names, "RED")).toContain("שלנו: 3 נפגעים");
    expect(interiorReportHe(report, names, null)).toContain("תוקף: 1 נפגעים, מגן: 3 נפגעים");
  });

  it("tells the attacking side who joined, and the defender only that more came (decision 99)", () => {
    const joined = { ...report, began: false, joined: ["B-1"] };
    expect(interiorReportHe(joined, names, "BLUE")).toContain("כיתה 1 הצטרף לקרב במבנה");
    expect(interiorReportHe(joined, names, null)).toContain("כיתה 1 הצטרף לקרב במבנה");
    expect(interiorReportHe(joined, names, "RED")).toContain("כוח אויב נוסף נכנס למבנה");
    expect(interiorReportHe(joined, names, "RED")).not.toContain("כיתה 1");
  });

  it("words a plan inside by what it says, and leaves the defaults unsaid (decision 101)", () => {
    expect(describeInteriorPlan({ entry: "top", grenades: false, teamSize: 3 })).toBe("כניסה מהגג · בלי רימונים · צוותים של 3");
    expect(describeInteriorPlan({ holdStoreys: [0, 1], atWindows: false, expects: "above", fallBack: false })).toBe(
      "מחזיק בקרקע, קומה 1 · בעומק החדרים · מצפה לתקיפה מלמעלה · מחזיק עד הסוף",
    );
    expect(describeInteriorPlan({})).toBe("כברירת המחדל");
    expect(reasonHe("no way in from the roof")).not.toBe("no way in from the roof"); // worded, not raw
  });

  it("says how it ended", () => {
    expect(interiorReportHe({ ...report, began: false, outcome: "cleared" }, names, "BLUE")).toContain("המבנה טוהר");
    expect(interiorReportHe({ ...report, began: false, outcome: "repulsed" }, names, "BLUE")).toContain("נהדפה");
  });

  it("words the refusals a fight inside gives", () => {
    expect(reasonHe("fighting inside a building")).toBe("נלחם בתוך מבנה");
    expect(reasonHe("goes inside")).toContain("נכנס אל המבנה");
  });
});
