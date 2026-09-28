import { describe, it, expect } from "vitest";
import { lookupBand } from "../geometry.js";
import { EXPLOSIVES } from "./explosives.js";
import { WOUND_SEVERITY } from "./casualties.js";
import {
  FORCE_FOOTPRINT_RADIUS_M,
  INCAPACITATED_PER_HIT,
  LETHAL_AREA_M2,
  TURN_SECONDS,
  blastBandsFromLethalArea,
  discOverlap,
  explosiveFor,
  hitChanceAt,
  RESEARCH_ROUNDS_PER_TURN,
  roundsPerTurnFor,
} from "./lethality.js";
import { Game } from "../game.js";
import { replayGame } from "../recording.js";
import { makeInfantry, makeVehicle } from "../units.js";
import { resolveBlast, resolveDirectExplosive } from "../combat/explosives.js";
import { Rng } from "../rng.js";

describe("the turn and the wound behind the research figures (rules decisions 40–41)", () => {
  it("a turn is a minute", () => {
    expect(TURN_SECONDS).toBe(60);
  });

  it("counts a serious wound or worse as the man put out, from the severity roll itself", () => {
    expect(INCAPACITATED_PER_HIT).toBeCloseTo(1 - WOUND_SEVERITY.light / 10);
    expect(INCAPACITATED_PER_HIT).toBeCloseTo(0.6);
  });
});

describe("blast bands from a lethal area (rules decision 41)", () => {
  it("measures the overlap of two discs", () => {
    expect(discOverlap(5, 25, 0)).toBeCloseTo(Math.PI * 25);
    expect(discOverlap(5, 25, 30)).toBe(0);
    expect(discOverlap(10, 10, 10)).toBeGreaterThan(0);
    expect(discOverlap(10, 10, 10)).toBeLessThan(Math.PI * 100);
  });

  // The two halves of the rule, applied together: the bands a lethal area is
  // turned into must put out, over every place a round can land, exactly the
  // men the lethal area says — no more because of the rings, no fewer
  // because of the rounding.
  it.each(Object.entries(LETHAL_AREA_M2))("the %s's bands give back its lethal area", (_key, area) => {
    const bands = blastBandsFromLethalArea(area);
    let inner = 0;
    let recovered = 0;
    for (const b of bands) {
      recovered += b.value * INCAPACITATED_PER_HIT * Math.PI * (b.maxRange ** 2 - inner ** 2);
      inner = b.maxRange;
    }
    // Rounding to two places and dropping the last sliver cost a few percent.
    expect(recovered / area).toBeGreaterThan(0.93);
    expect(recovered / area).toBeLessThan(1.07);
  });

  it("reaches no further than the lethal radius plus the force's footprint", () => {
    for (const area of Object.values(LETHAL_AREA_M2)) {
      const reach = Math.sqrt(area / Math.PI) + FORCE_FOOTPRINT_RADIUS_M;
      const bands = blastBandsFromLethalArea(area);
      expect(bands.at(-1)!.maxRange).toBeLessThanOrEqual(Math.ceil(reach));
      expect(hitChanceAt(area, reach + 1)).toBe(0);
    }
  });

  it("keeps a direct hit from a 155 mm shell about as deadly as the document, and ends it at 40 m, not 200", () => {
    const shell = explosiveFor("artillery", "research")!;
    expect(lookupBand(shell.blastBands, 5)!.value).toBeGreaterThan(0.7);
    expect(lookupBand(shell.blastBands, 45)).toBeUndefined();
    expect(lookupBand(EXPLOSIVES.artillery!.blastBands, 150)!.value).toBe(0.25);
  });

  it("gives a 40 mm grenade a few percent a man, where the document gave 40% out to 50 m", () => {
    const grenade = explosiveFor("rifleGrenade", "research")!;
    expect(lookupBand(grenade.blastBands, 5)!.value).toBeLessThan(0.1);
    expect(lookupBand(grenade.blastBands, 40)).toBeUndefined();
  });

  it("lets a tank gun hit to 2 km with modern fire control", () => {
    const tank = explosiveFor("tankRound", "research")!;
    expect(lookupBand(tank.toHitBands!, 1800)!.value).toBe(0.9);
    expect(lookupBand(EXPLOSIVES.tankRound!.toHitBands!, 1800)).toBeUndefined();
    expect(tank.minRange).toBe(25);
  });

  it("leaves what the sources were not read for as the document has it", () => {
    for (const key of ["grenade", "apMine", "atMine"]) {
      expect(explosiveFor(key, "research")).toEqual(EXPLOSIVES[key]);
    }
    // The RPG against armour: its rate of fire only (rules decision 42).
    expect(explosiveFor("rpgVsArmor", "research")).toEqual({ ...EXPLOSIVES.rpgVsArmor, roundsPerTurn: 4 });
    for (const key of Object.keys(EXPLOSIVES)) {
      expect(explosiveFor(key, "document")).toBe(EXPLOSIVES[key]);
    }
  });
});

describe("a game's lethality (rules decision 41)", () => {
  const squads = (g: Game) => {
    g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 8));
    g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 400 }, 8));
    return g;
  };

  it("plays the research figures unless told otherwise, and says so in its recording", () => {
    const g = squads(new Game({ seed: 1 }));
    expect(g.lethality).toBe("research");
    expect(g.toRecording().lethality).toBe("research");
    expect(replayGame(g.toRecording()).lethality).toBe("research");
  });

  it("replays a recording made before the decision on the document's tables", () => {
    const rec = squads(new Game({ seed: 1, lethality: "document" })).toRecording();
    delete rec.lethality;
    expect(replayGame(rec).lethality).toBe("document");
  });

  it("refuses a lethality it does not know", () => {
    expect(() => new Game({ seed: 1, lethality: "guess" as never })).toThrow(/lethality/);
    const rec = squads(new Game({ seed: 1 })).toRecording();
    expect(() => replayGame({ ...rec, lethality: "guess" as never })).toThrow();
  });

  it("reaches and connects with a vehicle as the document has it, whatever the lethality", () => {
    for (const [weapon, at] of [["tankRound", 0], ["artillery", 150]] as const) {
      const chance = (lethality: "document" | "research") =>
        resolveBlast(new Rng(1), weapon, { x: at, y: 0 }, [makeVehicle("T", "RED", { x: 0, y: 0 })], 1, undefined, lethality)
          .targets[0]?.blastChance;
      expect(chance("research")).toBeDefined();
      expect(chance("research")).toBe(chance("document"));
    }
  });

  it("detonates a blast with the figures it is given", () => {
    // 150 m off: inside the document's 200 m band, outside the research reach.
    const at150 = (lethality: "document" | "research") =>
      resolveBlast(new Rng(1), "artillery", { x: 150, y: 0 }, [makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 8)], 1, undefined, lethality)
        .targets;
    expect(at150("document")[0]?.blastChance).toBe(0.25);
    expect(at150("research")).toHaveLength(0);
  });
});

describe("rates of fire (rules decision 42)", () => {
  const BATTALIONS = { RED: "battalion", BLUE: "battalion" } as const;

  it("fires a launcher's rate in one action, and one round under the document", () => {
    const shoot = (lethality: "document" | "research") => {
      const tank = makeVehicle("T", "BLUE", { x: 0, y: 2500 });
      const target = makeInfantry("R", "RED", "platoon", { x: 0, y: 0 }, 30);
      return { r: resolveDirectExplosive(new Rng(3), "tankRound", tank, target, { lethality }), target };
    };
    const { r: research, target } = shoot("research");
    // Every round of its rate, unless the target went down first.
    if (!target.neutralized) expect(research.rounds).toBe(RESEARCH_ROUNDS_PER_TURN.tankRound);
    expect(research.rounds).toBeGreaterThan(1);
    expect(research.hits).toBeLessThanOrEqual(research.rounds!);
    const { r: doc } = shoot("document");
    expect(doc.rounds).toBeUndefined();
    expect(doc.hits).toBeUndefined();
  });

  it("stops firing at a target that is down", () => {
    const tank = makeVehicle("T", "BLUE", { x: 0, y: 100 });
    const target = makeInfantry("R", "RED", "fireTeam" as never, { x: 0, y: 0 }, 1);
    const r = resolveDirectExplosive(new Rng(1), "tankRound", tank, target, { lethality: "research" });
    expect(r.hit).toBe(true);
    if (target.neutralized) expect(r.rounds).toBeLessThan(RESEARCH_ROUNDS_PER_TURN.tankRound!);
  });

  it("lands a fire unit's rate times its tubes in a turn, and the rest on the turns after", () => {
    expect(roundsPerTurnFor("mortar", "research")).toBe(24);
    expect(roundsPerTurnFor("artillery", "research")).toBe(12);
    expect(roundsPerTurnFor("mortar", "document")).toBe(Infinity);
    const game = (lethality: "document" | "research") => {
      const g = new Game({
        seed: 5,
        enforceC2: false,
        lethality,
        commandEchelon: BATTALIONS,
        fireSupport: { BLUE: [{ weapon: "artillery", missions: 1, roundsForEffect: 30 }] },
      });
      g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 8));
      g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 3000 }, 8));
      g.beginTurn();
      g.advanceToPhase("targeting");
      g.callForFire("BLUE", "artillery", { x: 0, y: 0 }, { method: "effect" });
      return g.pendingFire.map((f) => [f.resolvesOnTurn, f.rounds ?? 1]);
    };
    expect(game("research")).toEqual([
      [3, 12],
      [4, 12],
      [5, 6],
    ]);
    expect(game("document")).toEqual([[3, 30]]);
  });

  it("keeps the spreading of volleys the engine's own", () => {
    const g = new Game({ seed: 1, enforceC2: false, commandEchelon: BATTALIONS });
    g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 8));
    g.beginTurn();
    g.advanceToPhase("targeting");
    expect(() => g.queueIndirectFire("mortar", "BLUE", { x: 0, y: 0 }, { laterBy: 1 })).toThrow(/laterBy/);
  });
});
