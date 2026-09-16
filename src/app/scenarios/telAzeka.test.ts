import { describe, it, expect } from "vitest";
import { boundCost, makeInfantry } from "../../engine/index.js";
import { buildTelAzekaScenario, buildTelAzekaTerrain } from "./telAzeka.js";

/**
 * The Elah valley battle turns on one claim — **the covered route is the
 * expensive one** — and that claim is made entirely of relief. Pinned here so a
 * refetched heightfield, or a force moved in the spec, fails a test rather than
 * quietly turning the lesson off.
 *
 * The scenario is generated (`tools/scenarios/tel-azeka.json`); this is not.
 */
describe("the Elah valley scenario on Tel Azeka", () => {
  const { game } = buildTelAzekaScenario();
  const terrain = buildTelAzekaTerrain();
  const reds = game.units.filter((u) => u.side === "RED");
  const probe = (x: number, y: number) => {
    // Never added to the game, so it takes no cover from the ground: the
    // standing silhouette a force on the move presents.
    const p = makeInfantry("PROBE", "BLUE", "squad", { x, y }, 8);
    expect(p.cover).toBe("none");
    return p;
  };
  const seenBy = (x: number, y: number) =>
    reds.filter((r) => game.hasLineOfSight(r, probe(x, y))).map((r) => r.id);

  it("hides the eastern face from the position on top of it", () => {
    // A hill does not see its own convex slope. This is what makes the long
    // climb the covered one, and it is the whole reason the choice exists.
    for (const x of [900, 800]) {
      expect(seenBy(x, 350), `east face at x=${x}`).toEqual([]);
    }
    // …until near the top, where the northern spur picks a climber up.
    expect(seenBy(700, 350)).toEqual(["RED-3"]);
  });

  it("charges the climber eight metres of bound for every metre of height", () => {
    // Naismith (rules decision 15). 100 m of the face costs a squad far more
    // than a walking bound (50 m) — several turns per hundred metres.
    const faceLegs: [number, number][] = [
      [900, 800],
      [800, 700],
    ];
    for (const [from, to] of faceLegs) {
      const cost = boundCost(terrain, { x: from, y: 350 }, { x: to, y: 350 });
      expect(cost, `east face ${from}->${to}`).toBeGreaterThan(250);
    }
    // The ridge, by contrast, costs about what it measures.
    const ridge = boundCost(terrain, { x: 520, y: 750 }, { x: 560, y: 650 });
    expect(ridge).toBeLessThan(130);
  });

  it("watches the southern ridge along its whole length", () => {
    for (const [x, y] of [
      [450, 950],
      [520, 750],
      [560, 650],
      [600, 550],
    ] as const) {
      expect(seenBy(x, y).length, `ridge at ${x},${y}`).toBeGreaterThan(0);
    }
    // The summit sees the start line 600 m off — seen long before it is shot
    // at, since small arms reach 400 m.
    expect(game.hasLineOfSight(game.getUnit("RED-1"), probe(450, 950))).toBe(true);
  });

  it("leaves the saddle dead to every RED position, and mines it", () => {
    expect(seenBy(610, 450)).toEqual([]);
    // The only covered place an assault can form up is the one RED prepared.
    const nearSaddle = game.mines.filter(
      (m) => Math.hypot(m.position.x - 610, m.position.y - 450) < 80,
    );
    expect(nearSaddle.length).toBe(3);
  });

  it("keeps RED's platoon in contact with its command group", () => {
    // Every RED squad is inside the 300 m band, so RED is ordered every turn
    // while BLUE climbs out of contact (rules decision 6).
    const hq = game.getUnit("RED-HQ");
    for (const id of ["RED-1", "RED-2", "RED-3"]) {
      const u = game.getUnit(id);
      const d = Math.hypot(u.position.x - hq.position.x, u.position.y - hq.position.y);
      expect(d, id).toBeLessThan(300);
    }
  });

  it("is fought on relief alone — no buildings to hide in", () => {
    // The contrast with the Yokneam demo's 249 houses is the point of having
    // this map at all: here nothing is in cover but what the hill gives.
    expect(terrain.objects.length).toBeLessThan(5);
    for (const id of ["RED-1", "RED-3"]) expect(game.getUnit(id).cover, id).toBe("none");
  });

  it("has RED-2 in the position it prepared from the first turn", () => {
    // Not a property of this scenario — a property of the engine, pinned where
    // it first became visible. `addUnit` used to raise a force's cover from the
    // ground's *objects* only and leave `baseCover` to the first upkeep, which
    // left a prepared defender standing in the open through the whole of turn
    // 1. Nothing had set `baseCover` before this map, so nothing had noticed.
    //
    // Ruled by the author 2026-09-16: a force that prepared the position before
    // the battle starts dug in. The turn-1 fire phase is where that is either
    // true or not, so that is what is checked.
    const { game: fresh } = buildTelAzekaScenario();
    expect(fresh.getUnit("RED-2").baseCover).toBe("partial");
    expect(fresh.getUnit("RED-2").cover, "at setup").toBe("partial");

    fresh.beginTurn();
    fresh.advanceToPhase("combat");
    expect(fresh.getUnit("RED-2").cover, "through turn 1's fire phase").toBe("partial");
    // …and what actually resolves a shot agrees, which is the half that
    // matters: `cover` is a field, `coverAgainst` is what the firer reads.
    expect(fresh.coverAgainst(fresh.getUnit("RED-2")), "as a firer reads it").toBe("partial");

    fresh.advanceToPhase("summary");
    fresh.advancePhase(); // the upkeep that closes turn 1
    expect(fresh.getUnit("RED-2").cover, "from turn 2").toBe("partial");

    // …and the force that prepared nothing is still in the open.
    expect(fresh.getUnit("RED-1").cover).toBe("none");
  });
});
