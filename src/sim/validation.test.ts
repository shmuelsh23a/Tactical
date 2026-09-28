import { describe, it, expect } from "vitest";
import { MEASURED_WEAPONS, measureBreaks, measureRifleFire, measureRound } from "./validation.js";

describe("the validation harness", () => {
  // The research bands were derived so that a round on a squad puts out what
  // its lethal area says: measured through the engine's own blast, the two
  // must agree. The document's bands are the ones the sources disagree with.
  it.each(MEASURED_WEAPONS)("a %s round on a squad puts out what its lethal area predicts", (weapon) => {
    const m = measureRound(weapon, "research", 1500);
    expect(m.predictedOnTarget).toBeDefined();
    expect(m.onTarget).toBeGreaterThan(m.predictedOnTarget! * 0.85);
    expect(m.onTarget).toBeLessThan(m.predictedOnTarget! * 1.15);
  });

  it("finds the document's shell three times as deadly as its lethal area anywhere near the squad", () => {
    const doc = measureRound("artillery", "document", 1500);
    const research = measureRound("artillery", "research", 1500);
    expect(doc.within50).toBeGreaterThan(2.5 * research.within50);
  });

  it("measures a minute of rifle fire, and cover cuts it", () => {
    const open = measureRifleFire(50, "none", "document", 500);
    const covered = measureRifleFire(50, "full", "document", 500);
    // 30% a man at 50 m, 6 in 10 hits putting a man out: about 1.6 of 9.
    expect(open.hitsPerFirerMinute).toBeCloseTo(0.3, 1);
    expect(covered.casualtiesPerMinute).toBeLessThan(open.casualtiesPerMinute);
  });

  it("measures where a side gives up", () => {
    const m = measureBreaks("platoon", "meeting", "research", 4);
    expect(m.battles).toBe(4);
    expect(m.explosiveShare).toBeGreaterThanOrEqual(0);
    expect(m.explosiveShare).toBeLessThanOrEqual(1);
  });
});
