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
  GRENADES_CARRIED,
  RATE_OF_FIRE,
  RESEARCH_ROUNDS_FOR_EFFECT,
  SMALL_ARMS_COMBAT_FACTOR,
  freshness,
  meanRate,
  rateDistribution,
  rollRate,
} from "./lethality.js";
import { Game } from "../game.js";
import { replayGame } from "../recording.js";
import { makeInfantry, makeVehicle } from "../units.js";
import { resolveBlast, resolveDirectExplosive } from "../combat/explosives.js";
import { resolveDirectFire } from "../combat/directFire.js";
import { resolveAssault } from "../combat/assault.js";
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
    for (const key of ["apMine", "atMine", "rpgVsArmor"]) {
      expect(explosiveFor(key, "research")).toEqual(EXPLOSIVES[key]);
    }
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

  it("makes the low rate the likeliest and the high one the rare outlier", () => {
    for (const rate of Object.values(RATE_OF_FIRE)) {
      for (const fresh of [1, 0.5, 0]) {
        const dist = rateDistribution(rate, fresh);
        expect(dist.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
        // Falls away from the low rate, every step.
        for (let k = 1; k < dist.length; k++) expect(dist[k]!).toBeLessThan(dist[k - 1]!);
        expect(dist.at(-1)!).toBeLessThan(dist[0]! / 2);
      }
    }
  });

  it("gives a fresh crew more of the upper end and a tired one more of the lower", () => {
    const tank = RATE_OF_FIRE.tankRound!;
    expect(meanRate(tank, 1)).toBeCloseTo(2.3, 1);
    expect(meanRate(tank, 0)).toBeCloseTo(1.2, 1);
    expect(rateDistribution(tank, 0)[0]!).toBeGreaterThan(rateDistribution(tank, 1)[0]!);
    expect(freshness(0)).toBe(1);
    expect(freshness(5)).toBe(0.5);
    expect(freshness(40)).toBe(0);
    expect(rollRate(tank, 1, 0)).toBe(1);
    expect(rollRate(tank, 1, 0.999999)).toBe(tank.high);
  });

  it("draws a launcher's rate for the turn, tiring with the turns it has fired, and fires one round under the document", () => {
    const volley = (lethality: "document" | "research", turnsFiring: number, seed: number) => {
      const tank = makeVehicle("T", "BLUE", { x: 0, y: 2500 });
      tank.turnsFiring = turnsFiring;
      const target = makeInfantry("R", "RED", "platoon", { x: 0, y: 0 }, 300);
      return resolveDirectExplosive(new Rng(seed), "tankRound", tank, target, { lethality });
    };
    const mean = (turnsFiring: number) => {
      let n = 0;
      for (let seed = 1; seed <= 400; seed++) n += volley("research", turnsFiring, seed).rounds!;
      return n / 400;
    };
    expect(mean(0)).toBeGreaterThan(1.9);
    expect(mean(20)).toBeLessThan(1.4);
    const doc = volley("document", 0, 1);
    expect(doc.rounds).toBeUndefined();
  });

  it("tires a force only in a game on the research figures", () => {
    for (const lethality of ["document", "research"] as const) {
      const g = new Game({ seed: 2, enforceC2: false, lethality });
      g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 8));
      g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 100 }, 8));
      g.beginTurn();
      g.advanceToPhase("combat");
      g.fire("B", "R", { weapon: "smallArms", hasLineOfSight: true });
      expect(g.getUnit("B").turnsFiring).toBe(lethality === "research" ? 1 : undefined);
    }
  });

  it("lands a mission's rounds for effect a volley a turn, at the fire unit's rate, and all at once under the document", () => {
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
      return g.pendingFire.map((f) => [f.resolvesOnTurn, f.rounds ?? 1] as const);
    };
    const research = game("research");
    expect(research.reduce((n, [, r]) => n + r, 0)).toBe(30);
    // A 6-gun battery: 12 to 24 shells a turn, until the last volley.
    for (const [, r] of research.slice(0, -1)) {
      expect(r % 6).toBe(0);
      expect(r).toBeGreaterThanOrEqual(12);
      expect(r).toBeLessThanOrEqual(24);
    }
    research.forEach(([turn], i) => expect(turn).toBe(3 + i));
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

describe("the calibration to 75% explosives (rules decision 43)", () => {
  it("lets small arms hit a third as often on the research figures, and only small arms", () => {
    const shot = (lethality: "document" | "research", weapon: "smallArms" | "sustainedMg") => {
      const firer = weapon === "sustainedMg" ? makeVehicle("F", "BLUE", { x: 0, y: 50 }) : makeInfantry("F", "BLUE", "squad", { x: 0, y: 50 }, 9);
      return resolveDirectFire(new Rng(1), firer, makeInfantry("T", "RED", "squad", { x: 0, y: 0 }, 9), { weapon, lethality }).hitChance;
    };
    expect(shot("research", "smallArms")).toBeCloseTo(shot("document", "smallArms") * SMALL_ARMS_COMBAT_FACTOR);
    expect(shot("research", "sustainedMg")).toBe(shot("document", "sustainedMg"));
  });

  it("fires 24 bombs for effect from a mortar section on the research figures, 12 on the document's", () => {
    const rounds = (lethality: "document" | "research") => {
      const g = new Game({ seed: 1, enforceC2: false, lethality, commandEchelon: { RED: "battalion", BLUE: "battalion" } });
      g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 8));
      g.beginTurn();
      g.advanceToPhase("targeting");
      return g.callForFire("BLUE", "mortar", { x: 0, y: 0 }, { method: "effect" }).roundsForEffect;
    };
    expect(rounds("research")).toBe(RESEARCH_ROUNDS_FOR_EFFECT.mortar);
    expect(rounds("research")).toBe(24);
    expect(rounds("document")).toBe(12);
  });
});

describe("hand grenades a man, each an M67 (rules decision 46)", () => {
  const assaultWith = (lethality: "document" | "research", grenades: number, seed = 1) => {
    const attacker = makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 9);
    const defender = makeInfantry("D", "RED", "platoon", { x: 0, y: 20 }, 60);
    return resolveAssault(new Rng(seed), attacker, defender, { grenades, lethality });
  };

  it("counts the M67's lethal area like the 40 mm's", () => {
    expect(LETHAL_AREA_M2.grenade).toBe(79);
    expect(GRENADES_CARRIED).toBe(2);
    const grenade = explosiveFor("grenade", "research")!;
    expect(grenade.delivery).toBe("assault");
    expect(lookupBand(grenade.blastBands, 0)!.value).toBeLessThan(0.1);
  });

  it("has every man going in throw his, up to the two he carries", () => {
    // Nine men, one each: nine blasts, so far more men hit than two grenades at 30% could.
    let research = 0;
    let document = 0;
    for (let seed = 1; seed <= 200; seed++) {
      research += assaultWith("research", 1, seed).grenadeHits;
      document += assaultWith("document", 1, seed).grenadeHits;
    }
    expect(research / 200).toBeGreaterThan(3);
    expect(document / 200).toBeLessThan(0.5);
    // A third grenade a man is more than he carries.
    let two = 0;
    let three = 0;
    for (let seed = 1; seed <= 200; seed++) {
      two += assaultWith("research", 2, seed).grenadeHits;
      three += assaultWith("research", 3, seed).grenadeHits;
    }
    expect(three).toBe(two);
  });

  it("throws none when told none", () => {
    expect(assaultWith("research", 0).grenadeHits).toBe(0);
  });
});
