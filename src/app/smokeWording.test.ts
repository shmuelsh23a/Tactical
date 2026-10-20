import { describe, it, expect } from "vitest";
import { SMOKE_GRENADE_THROW_M, SMOKE_REFUSAL, type RecordedAction } from "../engine/index.js";
import { describeAction, planningRefusalHe, weaponName } from "./debriefText.js";

/** A grenade's smoke refused for want of a thrower, and the rifle grenade, in the player's words (2026-10-20). */
describe("smoke and the rifle grenade, in Hebrew", () => {
  it("says why a grenade's smoke could not be laid", () => {
    expect(planningRefusalHe(SMOKE_REFUSAL.noThrower)).toBe(`אין לוחם שלנו במרחק הטלה (${SMOKE_GRENADE_THROW_M} מ') מהמקום`);
    expect(planningRefusalHe(SMOKE_REFUSAL.noLauncher)).toBe('אין כוח חי"ר שלנו בטווח רימון רובה מהמקום');
  });

  it("names the rifle grenade rather than printing its key", () => {
    // A played battle's debrief showed "(rifleGrenade)" raw on turn 10.
    expect(weaponName("rifleGrenade")).toBe("רימון רובה");
    const shot = { kind: "fireExplosive", attackerId: "A", targetId: "B", weaponKey: "rifleGrenade" } as unknown as RecordedAction;
    const fire = { kind: "fire", attackerId: "A", targetId: "B", opts: { weapon: "rifleGrenade" } } as unknown as RecordedAction;
    for (const a of [shot, fire]) expect(describeAction(a, new Map())).not.toMatch(/rifleGrenade/);
    const smoke = { kind: "deploySmoke", source: "rifleGrenade", side: "BLUE", center: { x: 0, y: 0 }, radius: 25 } as unknown as RecordedAction;
    expect(describeAction(smoke, new Map())).toContain("רימון רובה");
  });
});
