import { describe, it, expect } from "vitest";
import { Rng } from "../rng.js";
import { makeInfantry, makeVehicle, makeCommandGroup, fitSoldiers } from "../units.js";
import { resolveDirectFire } from "./directFire.js";
import { resolveArmorHit } from "./armorDamage.js";
import { resolveDispersion } from "./artillery.js";
import { resolveBlast, resolveDirectExplosive } from "./explosives.js";
import { resolveIndirectFire } from "./indirectFire.js";
import { resolveAssault } from "./assault.js";
import {
  camouflageBonus,
  detectByMovement,
  detectByUav,
  detectionChance,
} from "./detection.js";

describe("direct fire", () => {
  it("respects range bands and produces casualties over many trials", () => {
    let totalHits = 0;
    const trials = 2000;
    for (let t = 0; t < trials; t++) {
      const rng = new Rng(1000 + t);
      const a = makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 8);
      const b = makeInfantry("B", "RED", "squad", { x: 0, y: 50 }, 8); // 50 m
      const r = resolveDirectFire(rng, a, b, { weapon: "smallArms" });
      expect(r.fired).toBe(true);
      expect(r.hitChance).toBeCloseTo(0.3, 5); // <=100 m band
      totalHits += r.hits;
    }
    // 8 shooters * 0.3 ≈ 2.4 expected hits/engagement.
    const avg = totalHits / trials;
    expect(avg).toBeGreaterThan(2.0);
    expect(avg).toBeLessThan(2.8);
  });

  it("full cover halves the hit chance", () => {
    const rng = new Rng(5);
    const a = makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 8);
    const b = makeInfantry("B", "RED", "squad", { x: 0, y: 50 }, 8);
    const r = resolveDirectFire(rng, a, b, { weapon: "smallArms", cover: "full" });
    expect(r.hitChance).toBeCloseTo(0.15, 5); // 0.3 * (1 - 0.5)
  });

  it("partial cover takes a tenth off the hit chance", () => {
    const rng = new Rng(5);
    const a = makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 8);
    const b = makeInfantry("B", "RED", "squad", { x: 0, y: 50 }, 8);
    const r = resolveDirectFire(rng, a, b, { weapon: "smallArms", cover: "partial" });
    expect(r.hitChance).toBeCloseTo(0.27, 5); // 0.3 * (1 - 0.1)
  });

  it("leaves every band of the direct-fire table live against a covered target", () => {
    // The cover cut is proportional, so a force in cover is harder to hit but
    // never immune — an additive -50 points would zero the whole table.
    const a = makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 8);
    for (const [range, weapon] of [
      [50, "smallArms"],
      [250, "smallArms"],
      [380, "smallArms"],
      [250, "sustainedMg"],
      [450, "sustainedMg"],
      [650, "sustainedMg"],
    ] as const) {
      const b = makeInfantry("B", "RED", "squad", { x: 0, y: range }, 8);
      const r = resolveDirectFire(new Rng(5), a, b, { weapon, cover: "full" });
      expect(r.hitChance).toBeGreaterThan(0);
    }
  });

  it("cover scales the chance the target's movement has already modified", () => {
    const rng = new Rng(5);
    const a = makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 8);
    const b = makeInfantry("B", "RED", "squad", { x: 0, y: 250 }, 8);
    const r = resolveDirectFire(rng, a, b, {
      weapon: "smallArms",
      cover: "partial",
      targetMovementModifier: +0.3,
    });
    expect(r.hitChance).toBeCloseTo(0.45, 5); // (0.2 + 0.3) * (1 - 0.1)
  });

  it("running target lowers hit chance, normal-moving raises it", () => {
    const rng = new Rng(5);
    const a = makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 8);
    const b = makeInfantry("B", "RED", "squad", { x: 0, y: 50 }, 8);
    const run = resolveDirectFire(rng, a, b, { weapon: "smallArms", targetMovementModifier: -0.2 });
    expect(run.hitChance).toBeCloseTo(0.1, 5);
    const walk = resolveDirectFire(rng, a, b, { weapon: "smallArms", targetMovementModifier: +0.3 });
    expect(walk.hitChance).toBeCloseTo(0.6, 5);
  });

  it("small arms cannot harm a vehicle", () => {
    const rng = new Rng(5);
    const a = makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 8);
    const tank = makeVehicle("T", "RED", { x: 0, y: 50 });
    const r = resolveDirectFire(rng, a, tank, { weapon: "smallArms" });
    expect(r.fired).toBe(false);
    expect(r.reason).toMatch(/armour/);
  });

  it("a command group fires with only its personnel (3 attack rolls)", () => {
    const rng = new Rng(5);
    const hq = makeCommandGroup("HQ", "BLUE", "platoon", { x: 0, y: 0 }, 3);
    const enemy = makeInfantry("E", "RED", "squad", { x: 0, y: 50 }, 8);
    const r = resolveDirectFire(rng, hq, enemy, { weapon: "smallArms" });
    expect(r.fired).toBe(true);
    expect(r.shooters).toBe(3); // 3 personnel, not a full squad
  });

  it("no line of sight blocks the shot", () => {
    const rng = new Rng(5);
    const a = makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 8);
    const b = makeInfantry("B", "RED", "squad", { x: 0, y: 50 }, 8);
    const r = resolveDirectFire(rng, a, b, { weapon: "smallArms", hasLineOfSight: false });
    expect(r.fired).toBe(false);
  });
});

describe("armour damage", () => {
  it("forced track hit can immobilise after penetration", () => {
    // High penetration (70%); loop until we observe a penetrating result.
    let sawMobilityKill = false;
    for (let t = 0; t < 50 && !sawMobilityKill; t++) {
      const rng = new Rng(t + 1);
      const tank = makeVehicle("T", "RED", { x: 0, y: 0 });
      const r = resolveArmorHit(rng, tank, "track");
      if (r.penetrated) {
        expect(r.mobilityKilled).toBe(true);
        sawMobilityKill = true;
      }
    }
    expect(sawMobilityKill).toBe(true);
  });

  it("location roll distribution roughly matches the table", () => {
    const rng = new Rng(123);
    const counts: Record<string, number> = {};
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const tank = makeVehicle("T", "RED", { x: 0, y: 0 });
      const r = resolveArmorHit(rng, tank, undefined);
      counts[r.part] = (counts[r.part] ?? 0) + 1;
    }
    expect((counts.turret ?? 0) / n).toBeCloseTo(0.2, 1);
    expect((counts.hullFront ?? 0) / n).toBeCloseTo(0.3, 1);
    expect((counts.track ?? 0) / n).toBeCloseTo(0.1, 1);
  });
});

describe("artillery dispersion", () => {
  it("lands on target ~70% per axis, deviates otherwise", () => {
    const rng = new Rng(77);
    let onTargetBoth = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const r = resolveDispersion(rng, { x: 500, y: 500 }, { firingFrom: { x: 500, y: 0 } });
      if (r.rangeDeviation === "onTarget" && r.lineDeviation === "onTarget") onTargetBoth++;
    }
    // 0.7 * 0.7 = 0.49 both-on-target.
    expect(onTargetBoth / n).toBeCloseTo(0.49, 1);
  });

  it("launcher scales the miss distance way down", () => {
    // Force a deviation by searching seeds, compare launcher vs not.
    for (let t = 0; t < 200; t++) {
      const a = resolveDispersion(new Rng(t), { x: 0, y: 100 }, { firingFrom: { x: 0, y: 0 } });
      if (a.missDistance > 0) {
        const b = resolveDispersion(new Rng(t), { x: 0, y: 100 }, {
          firingFrom: { x: 0, y: 0 },
          isLauncher: true,
        });
        expect(b.missDistance).toBeCloseTo(a.missDistance * 0.1, 5);
        return;
      }
    }
    throw new Error("expected at least one deviation");
  });
});

describe("blast", () => {
  it("infantry at the impact point takes casualties from artillery", () => {
    const rng = new Rng(9);
    const squad = makeInfantry("S", "RED", "squad", { x: 0, y: 0 }, 8);
    const res = resolveBlast(rng, "artillery", { x: 0, y: 0 }, [squad]);
    expect(res.targets[0]!.caught).toBe(true);
    expect(res.targets[0]!.damage).toBeGreaterThan(0);
  });

  it("an anti-tank weapon resolves through the armour table on a vehicle", () => {
    let sawArmorEffect = false;
    for (let t = 0; t < 30 && !sawArmorEffect; t++) {
      const rng = new Rng(t + 1);
      const tank = makeVehicle("T", "RED", { x: 0, y: 0 });
      const res = resolveBlast(rng, "atMine", { x: 0, y: 0 }, [tank]);
      const tr = res.targets[0]!;
      if (tr.caught) {
        expect(tr.armorEffect).toBeDefined();
        sawArmorEffect = true;
      }
    }
    expect(sawArmorEffect).toBe(true);
  });
});

describe("direct-fire explosive (rifle grenade / מטול)", () => {
  it("rejects shots beyond range", () => {
    const rng = new Rng(3);
    const a = makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 1);
    const b = makeInfantry("B", "RED", "squad", { x: 0, y: 150 }, 8); // 150 > 100
    const r = resolveDirectExplosive(rng, "rifleGrenade", a, b);
    expect(r.fired).toBe(false);
    expect(r.reason).toMatch(/range/);
  });

  it("fires within range and can detonate", () => {
    const rng = new Rng(3);
    const a = makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 1);
    const b = makeInfantry("B", "RED", "squad", { x: 0, y: 80 }, 8);
    const r = resolveDirectExplosive(rng, "rifleGrenade", a, b);
    expect(r.fired).toBe(true);
    expect(r.hitChance).toBeGreaterThan(0);
  });
});

describe("RPG vs armour (נגד רק\"מ)", () => {
  it("is usable out to 700 m and resolves through the armour table", () => {
    const a = makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 1);
    const far = makeVehicle("T", "RED", { x: 0, y: 700 });
    // hitChance at 700 m is 0.10; find a seed where it connects.
    let connected = false;
    for (let t = 0; t < 100 && !connected; t++) {
      const tank = makeVehicle("T", "RED", { x: 0, y: 700 });
      const r = resolveDirectExplosive(new Rng(t), "rpgVsArmor", a, tank);
      expect(r.fired).toBe(true);
      expect(r.hitChance).toBeCloseTo(0.1, 5);
      if (r.hit) {
        expect(r.blast?.targets[0]?.armorEffect).toBeDefined();
        connected = true;
      }
    }
    expect(connected).toBe(true);
    // Beyond 700 m it is out of range.
    const tooFar = makeVehicle("T2", "RED", { x: 0, y: 800 });
    const miss = resolveDirectExplosive(new Rng(1), "rpgVsArmor", a, tooFar);
    expect(miss.fired).toBe(false);
    void far;
  });
});

describe("HE vs tank tracks", () => {
  it("artillery has a ~20% chance to do 2 nq\"p to the tracks", () => {
    let trackHits = 0;
    const n = 20000;
    for (let t = 0; t < n; t++) {
      const tank = makeVehicle("T", "RED", { x: 0, y: 0 });
      resolveBlast(new Rng(t + 1), "artillery", { x: 0, y: 0 }, [tank]);
      if (tank.vehicle!.componentDamage.track > 0) {
        trackHits++;
        expect(tank.vehicle!.componentDamage.track).toBe(2);
      }
    }
    expect(trackHits / n).toBeCloseTo(0.2, 1);
  });

  it("two HE track hits immobilise the tank", () => {
    const tank = makeVehicle("T", "RED", { x: 0, y: 0 });
    // Apply 2 + 2 track damage directly via blasts that connect.
    let applied = 0;
    for (let t = 0; applied < 4 && t < 500; t++) {
      const before = tank.vehicle!.componentDamage.track;
      resolveBlast(new Rng(t + 1), "mortar", { x: 0, y: 0 }, [tank]);
      applied = tank.vehicle!.componentDamage.track;
      void before;
    }
    expect(tank.vehicle!.componentDamage.track).toBeGreaterThanOrEqual(4);
    expect(tank.vehicle!.mobilityKilled).toBe(true);
  });
});

describe("infantry casualty allocation", () => {
  it("spreads casualties across the force at random by default", () => {
    // With random allocation, a sustained burst should wound more than one man.
    const woundedCounts: number[] = [];
    for (let t = 0; t < 40; t++) {
      const a = makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 10);
      const b = makeInfantry("B", "RED", "squad", { x: 0, y: 50 }, 10);
      resolveDirectFire(new Rng(t + 1), a, b, { weapon: "smallArms" });
      woundedCounts.push((b.soldiers ?? []).filter((s) => s.damagePoints > 0).length);
    }
    const maxWounded = Math.max(...woundedCounts);
    expect(maxWounded).toBeGreaterThan(1);
  });

  it("honours a player-specified target soldier", () => {
    // One shooter per engagement (so the target never neutralises mid-call and
    // spills over): all damage must land on the named soldier, never others.
    const a = makeInfantry("A", "BLUE", "squad", { x: 0, y: 25 }, 10);
    let totalOnTarget = 0;
    for (let t = 0; t < 60; t++) {
      const def = makeInfantry("B", "RED", "squad", { x: 0, y: 25 }, 10);
      resolveDirectFire(new Rng(t + 100), a, def, {
        weapon: "smallArms",
        shooters: 1,
        targetSoldierId: "B-s1",
      });
      const others = (def.soldiers ?? []).filter((s) => s.id !== "B-s1");
      expect(others.every((s) => s.damagePoints === 0)).toBe(true);
      totalOnTarget += def.soldiers![0]!.damagePoints;
    }
    expect(totalOnTarget).toBeGreaterThan(0);
  });
});

describe("indirect fire end-to-end", () => {
  it("scatters then detonates against units on the map", () => {
    const rng = new Rng(50);
    const squad = makeInfantry("S", "RED", "squad", { x: 200, y: 200 }, 8);
    const r = resolveIndirectFire(rng, "mortar", { x: 200, y: 200 }, [squad], {
      firingFrom: { x: 200, y: 0 },
    });
    expect(r.dispersion.impact).toBeDefined();
    expect(r.blast.targets).toHaveLength(1);
  });
});

describe("assault", () => {
  const attacker = (x: number, y: number, n = 8) =>
    makeInfantry("A", "BLUE", "squad", { x, y }, n);
  const defender = (x: number, y: number, n = 4) =>
    makeInfantry("D", "RED", "squad", { x, y }, n);

  it("inflicts casualties and can neutralise a defender", () => {
    const rng = new Rng(15);
    const att = attacker(0, 0);
    const def = defender(0, 5);
    const r = resolveAssault(rng, att, def, { grenades: 2 });
    expect(r.fired).toBe(true);
    expect(r.fireHits).toBeGreaterThanOrEqual(0);
    expect(fitSoldiers(def)).toBeLessThanOrEqual(4);
  });

  it("reaches 25 m and no further", () => {
    const at25 = resolveAssault(new Rng(1), attacker(0, 0), defender(0, 25));
    expect(at25.fired).toBe(true);

    const beyond = resolveAssault(new Rng(1), attacker(0, 0), defender(0, 26));
    expect(beyond.fired).toBe(false);
    expect(beyond.reason).toBe("out of assault range");
    expect(beyond.range).toBeCloseTo(26, 5);
  });

  it("leaves the defender untouched when it is out of reach", () => {
    const def = defender(0, 200);
    resolveAssault(new Rng(1), attacker(0, 0), def);
    expect(fitSoldiers(def)).toBe(4);
    expect(def.hitThisTurn).toBe(false);
  });

  it("does not spend the attacker's action on a refused assault", () => {
    const att = attacker(0, 0);
    resolveAssault(new Rng(1), att, defender(0, 200));
    expect(att.firedThisTurn).toBe(false);

    resolveAssault(new Rng(1), att, defender(0, 10));
    expect(att.firedThisTurn).toBe(true);
  });

  it("cannot be pressed home against armour", () => {
    const tank = makeVehicle("T", "RED", { x: 0, y: 10 });
    const r = resolveAssault(new Rng(1), attacker(0, 0), tank);
    expect(r.fired).toBe(false);
    expect(r.reason).toBe("cannot assault armour");
  });

  it("needs someone left to press it", () => {
    const att = attacker(0, 0, 2);
    att.soldiers!.forEach((s) => (s.neutralized = true));
    const r = resolveAssault(new Rng(1), att, defender(0, 10));
    expect(r.fired).toBe(false);
    expect(r.reason).toBe("no fit shooters");
  });

  it("grenades sometimes wound the throwers themselves", () => {
    // 5% self-hit per grenade — over many seeds it must happen.
    let selfHarm = false;
    for (let s = 0; s < 200 && !selfHarm; s++) {
      const att = attacker(0, 0);
      resolveAssault(new Rng(s), att, defender(0, 5), { grenades: 3 });
      if (att.soldiers!.some((x) => x.damagePoints > 0)) selfHarm = true;
    }
    expect(selfHarm).toBe(true);
  });
});

describe("detection", () => {
  /** A force that has moved this turn — i.e. one that is *visible*. */
  function movingEnemy(at: { x: number; y: number }) {
    const enemy = makeInfantry("E", "RED", "squad", at, 8);
    enemy.movedThisTurn = 40;
    return enemy;
  }

  it("movement spots a visible enemy in range often at normal pace", () => {
    let spotted = 0;
    const n = 2000;
    for (let t = 0; t < n; t++) {
      const rng = new Rng(t + 1);
      const mover = makeInfantry("M", "BLUE", "squad", { x: 0, y: 0 }, 8);
      const r = detectByMovement(rng, mover, "normal", [movingEnemy({ x: 0, y: 200 })], []);
      if (r.spottedUnitIds.includes("E")) spotted++;
    }
    expect(spotted / n).toBeCloseTo(0.7, 1);
  });

  it("cannot see a force that is holding still, until it is almost on top of it", () => {
    // A stationary force is hidden (rules decision 12), so it is looked for in
    // the document's 20 m band at 30% — not the 300 m one. That is an ambush.
    let farSpots = 0;
    let closeSpots = 0;
    const n = 2000;
    for (let t = 0; t < n; t++) {
      const mover = makeInfantry("M", "BLUE", "squad", { x: 0, y: 0 }, 8);
      const far = makeInfantry("E", "RED", "squad", { x: 0, y: 200 }, 8);
      const near = makeInfantry("E", "RED", "squad", { x: 0, y: 15 }, 8);
      if (detectByMovement(new Rng(t + 1), mover, "normal", [far], []).spottedUnitIds.length) {
        farSpots++;
      }
      if (detectByMovement(new Rng(t + 1), mover, "normal", [near], []).spottedUnitIds.length) {
        closeSpots++;
      }
    }
    expect(farSpots).toBe(0);
    expect(closeSpots / n).toBeCloseTo(0.3, 1);
  });

  it("a force in position watches better than one on the move", () => {
    const watcher = makeInfantry("W", "BLUE", "squad", { x: 0, y: 0 }, 8);
    const runner = makeInfantry("R", "BLUE", "squad", { x: 0, y: 0 }, 8);
    runner.movedThisTurn = 80;
    const target = movingEnemy({ x: 0, y: 200 });

    // 70% base, +10% for watching rather than moving.
    expect(detectionChance(watcher, target).chance).toBeCloseTo(0.8, 5);
    // …and a runner is both worse at looking and easier to find.
    expect(detectionChance(runner, target, "run").chance).toBeCloseTo(0.5, 5);
    target.ranThisTurn = true;
    expect(detectionChance(watcher, target).chance).toBeCloseTo(0.9, 5);
  });

  it("cover and camouflage take the chance back down", () => {
    const watcher = makeInfantry("W", "BLUE", "squad", { x: 0, y: 0 }, 8);
    const target = movingEnemy({ x: 0, y: 200 });
    target.cover = "full";
    expect(detectionChance(watcher, target).chance).toBeCloseTo(0.6, 5); // 0.8 - 0.2

    target.camouflageTurns = 4; // two completed steps
    expect(camouflageBonus(target)).toBeCloseTo(0.2, 5);
    expect(detectionChance(watcher, target).chance).toBeCloseTo(0.4, 5);

    target.camouflageTurns = 100; // capped
    expect(camouflageBonus(target)).toBeCloseTo(0.5, 5);
  });

  it("UAV footprint auto-detects units inside it", () => {
    const rng = new Rng(2);
    const enemy = makeInfantry("E", "RED", "squad", { x: 10, y: 10 }, 8);
    const outside = makeInfantry("O", "RED", "squad", { x: 500, y: 500 }, 8);
    const r = detectByUav(rng, "drone", { x: 0, y: 0 }, [enemy, outside], []);
    expect(r.spottedUnitIds).toContain("E");
    expect(r.spottedUnitIds).not.toContain("O");
  });
});
