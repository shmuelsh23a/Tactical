import { describe, it, expect } from "vitest";
import { lookupBand } from "../geometry.js";
import { MOVEMENT_PROFILES, UNDER_FIRE_SPEED_MULTIPLIER } from "./movement.js";
import { SMALL_ARMS_BANDS, SUSTAINED_MG_BANDS, COVER_MODIFIERS } from "./directFire.js";
import { EXPLOSIVES } from "./explosives.js";
import { SMOKE_DURATION_TURNS } from "./smoke.js";
import { ARMOR_TABLE } from "./armor.js";
import { orderInterval } from "./c2.js";
import { CASUALTY_RULES } from "./casualties.js";

describe("movement profiles", () => {
  it("normal gait matches the table", () => {
    const n = MOVEMENT_PROFILES.normal;
    expect(n.maxDistance).toBe(50);
    expect(n.hiddenDetectChance).toBe(0.3);
    expect(n.visibleDetectChance).toBe(0.7);
    expect(n.enemyHitModifier).toBe(0.3);
  });
  it("running gait matches the table", () => {
    const r = MOVEMENT_PROFILES.run;
    expect(r.maxDistance).toBe(100);
    expect(r.enemyHitModifier).toBe(-0.2);
  });
  it("under-fire halves the pace", () => {
    expect(UNDER_FIRE_SPEED_MULTIPLIER).toBe(0.5);
  });
});

describe("direct fire bands", () => {
  it("small arms hit chances by range", () => {
    expect(lookupBand(SMALL_ARMS_BANDS, 100)?.value).toBe(0.3);
    expect(lookupBand(SMALL_ARMS_BANDS, 250)?.value).toBe(0.2);
    expect(lookupBand(SMALL_ARMS_BANDS, 400)?.value).toBe(0.1);
    expect(lookupBand(SMALL_ARMS_BANDS, 401)).toBeUndefined();
  });
  it("sustained MG hit chances by range", () => {
    expect(lookupBand(SUSTAINED_MG_BANDS, 300)?.value).toBe(0.7);
    expect(lookupBand(SUSTAINED_MG_BANDS, 450)?.value).toBe(0.5);
    expect(lookupBand(SUSTAINED_MG_BANDS, 700)?.value).toBe(0.2);
  });
  it("cover modifiers", () => {
    expect(COVER_MODIFIERS.full).toBe(-0.5);
    expect(COVER_MODIFIERS.partial).toBe(-0.1);
  });
});

describe("explosives table", () => {
  it("mortar: whole map, 3 rpt, 1-turn delay, 1d8", () => {
    const m = EXPLOSIVES.mortar!;
    expect(m.wholeMap).toBe(true);
    expect(m.roundsPerTurn).toBe(3);
    expect(m.impactDelayTurns).toBe(1);
    expect(m.damageDice).toBe("1d8");
    expect(lookupBand(m.blastBands, 50)?.value).toBe(0.5);
    expect(lookupBand(m.blastBands, 100)?.value).toBe(0.25);
  });
  it("artillery: 2 rpt, 2-turn delay, 1d10, three blast bands", () => {
    const a = EXPLOSIVES.artillery!;
    expect(a.roundsPerTurn).toBe(2);
    expect(a.impactDelayTurns).toBe(2);
    expect(a.damageDice).toBe("1d10");
    expect(lookupBand(a.blastBands, 50)?.value).toBe(0.7);
    expect(lookupBand(a.blastBands, 200)?.value).toBe(0.25);
  });
  it("tank round: direct fire to-hit by range, min range 25", () => {
    const t = EXPLOSIVES.tankRound!;
    expect(t.minRange).toBe(25);
    expect(lookupBand(t.toHitBands!, 300)?.value).toBe(0.9);
    expect(lookupBand(t.toHitBands!, 500)?.value).toBe(0.7);
    expect(lookupBand(t.toHitBands!, 1500)?.value).toBe(0.5);
  });
  it("AP mine does 1d2 vs armour; AT mine does 2d10 vs infantry", () => {
    expect(EXPLOSIVES.apMine!.damageDiceVsArmor).toBe("1d2");
    expect(EXPLOSIVES.atMine!.damageDiceVsInfantry).toBe("2d10");
    expect(EXPLOSIVES.apMine!.activationChance).toBe(0.5);
  });
  it("grenade is assault-only with a self-hit chance", () => {
    const g = EXPLOSIVES.grenade!;
    expect(g.delivery).toBe("assault");
    expect(g.selfHitChance).toBe(0.05);
  });
});

describe("smoke durations", () => {
  it("grenade/mortar/artillery = 1/2/4 turns", () => {
    expect(SMOKE_DURATION_TURNS.grenade).toBe(1);
    expect(SMOKE_DURATION_TURNS.mortar).toBe(2);
    expect(SMOKE_DURATION_TURNS.artillery).toBe(4);
  });
});

describe("armor table", () => {
  it("has all five locations with correct hit/penetration", () => {
    const byPart = Object.fromEntries(ARMOR_TABLE.map((r) => [r.part, r]));
    expect(byPart.turret!.hitChance).toBe(0.2);
    expect(byPart.turret!.penetrationChance).toBe(0.2);
    expect(byPart.hullFront!.componentDamage).toBe(8);
    expect(byPart.hullRear!.criticalChance).toBe(0.05);
    expect(byPart.track!.penetrationChance).toBe(0.7);
    expect(byPart.driver!.casualtyChance).toBe(0.4);
  });
  it("hit chances sum to 1", () => {
    const total = ARMOR_TABLE.reduce((s, r) => s + r.hitChance, 0);
    expect(total).toBeCloseTo(1, 5);
  });
});

describe("command & control", () => {
  it("squad order interval by distance", () => {
    expect(orderInterval("squad", 300)).toBe(1);
    expect(orderInterval("squad", 400)).toBe(2);
    expect(orderInterval("squad", 800)).toBe(3);
  });
  it("platoon order interval by distance", () => {
    expect(orderInterval("platoon", 500)).toBe(1);
    expect(orderInterval("platoon", 650)).toBe(2);
    expect(orderInterval("platoon", 900)).toBe(3);
  });
});

describe("casualty rules", () => {
  it("thresholds match the source", () => {
    expect(CASUALTY_RULES.bleedingThreshold).toBe(5);
    expect(CASUALTY_RULES.neutralizeThreshold).toBe(8);
    expect(CASUALTY_RULES.forceAttritionNeutralizeFraction).toBe(0.5);
  });
});
