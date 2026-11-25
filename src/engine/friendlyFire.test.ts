import { describe, it, expect } from "vitest";
import { Game, type GameOptions } from "./game.js";
import { makeInfantry, makeVehicle } from "./units.js";
import { replayGame } from "./recording.js";
import { stateDigest } from "./digest.js";
import { FLAT_GROUND } from "./terrain.js";
import { enemySuppressionLevel } from "./morale.js";
import { SUPPRESSION } from "./data/morale.js";
import { FRIENDLY_FIRE, MASKED_BY_FRIENDS, friendsAtRisk, maskingFriend } from "./combat/friendlyFire.js";
import type { Heightfield, Terrain } from "./terrain.js";
import { resolveDirectFire } from "./combat/directFire.js";
import { Rng } from "./rng.js";

/**
 * Rules decision 133 (the author, 2026-11-25): small-arms friendly fire and
 * masked fire. No force fires through its own men — a friend within 10 m of
 * the line masks it, unless the fire passes well over its head; a shot's
 * misses can hit a friend within 50 m of the target or 10 m of the line of
 * fire short of it.
 */

/** RED firing north at BLUE 200 m off, on flat open ground, in the fire phase. */
function setUp(opts: Partial<GameOptions> = {}) {
  const g = new Game({ lethality: "document", seed: 7, enforceC2: false, terrain: FLAT_GROUND, ...opts });
  const red = g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 9));
  const blue = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 0, y: 200 }, 9));
  return { g, red, blue };
}
const toCombat = (g: Game) => {
  g.beginTurn();
  g.advanceToPhase("combat");
};
const fit = (g: Game, id: string) => (g.getUnit(id).soldiers ?? []).filter((m) => !m.neutralized).length;

/** Fire `n` times (a fresh action each), stopping once either force is out: the strays it caused. */
function volley(g: Game, firer: string, target: string, n: number, watch: string): number {
  let strays = 0;
  for (let i = 0; i < n && fit(g, watch) > 0 && fit(g, target) > 0; i++) {
    g.getUnit(firer).firedThisTurn = false;
    strays += g.fire(firer, target, { weapon: "smallArms" }).friendly?.reduce((t, s) => t + s.hits, 0) ?? 0;
  }
  return strays;
}

/** A valley running north–south across a 400 m square: 30 m at both edges, 0 m at x = 200. */
function valley(): Heightfield {
  const columns = 41;
  const rows = 41;
  const heights: number[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) heights.push(30 * (Math.abs(c * 10 - 200) / 200));
  return { spacing: 10, columns, rows, heights };
}

describe("the geometry (decision 133)", () => {
  const at = (x: number, y: number) => makeInfantry(`F${x},${y}`, "RED", "squad", { x, y }, 9);
  const from = { x: 0, y: 0 };
  const to = { x: 0, y: 200 };

  it("masks with a friend within 10 m of the line, past the firer's own metres and short of the target", () => {
    expect(maskingFriend(from, to, [at(2, 100)])?.id).toBe("F2,100");
    expect(maskingFriend(from, to, [at(FRIENDLY_FIRE.maskM, 100)])?.id).toBe(`F${FRIENDLY_FIRE.maskM},100`);
    expect(maskingFriend(from, to, [at(0, 5)])).toBeUndefined(); // beside the firer
    expect(maskingFriend(from, to, [at(0, 195)])).toBeUndefined(); // at the target
    expect(maskingFriend(from, to, [at(12, 100)])).toBeUndefined(); // off the line
    expect(maskingFriend(from, to, [at(0, 260)])).toBeUndefined(); // beyond the target
    expect(maskingFriend(from, to, [at(2, 100)], () => true)).toBeUndefined(); // fired over
  });

  it("puts at risk a friend near the target or near the line, falling off with the distance", () => {
    const risk = (x: number, y: number) => friendsAtRisk(from, to, [at(x, y)], () => 1)[0]?.chance ?? 0;
    expect(risk(0, 200)).toBeCloseTo(FRIENDLY_FIRE.strayNearTarget, 9);
    expect(risk(25, 200)).toBeCloseTo(FRIENDLY_FIRE.strayNearTarget / 2, 9);
    expect(risk(0, 260)).toBe(0); // 60 m beyond: out of the beaten zone
    expect(risk(5, 100)).toBeCloseTo(FRIENDLY_FIRE.strayOnLine / 2, 9);
    expect(risk(12, 100)).toBe(0);
    expect(risk(200, 0)).toBe(0);
  });

  it("counts a friend's cover, rolls the likeliest first, and leaves out one no stray can reach", () => {
    const near = at(0, 190);
    const far = at(40, 200);
    const r = friendsAtRisk(from, to, [far, near], (u) => (u === near ? 0.5 : 1));
    expect(r.map((x) => x.unit.id)).toEqual([near.id, far.id]);
    expect(r[0]!.chance).toBeCloseTo(Math.max(FRIENDLY_FIRE.strayNearTarget * (1 - 10 / 50), FRIENDLY_FIRE.strayOnLine) * 0.5, 9);
    // A friend fighting inside that shows no man toward the firer is out of reach.
    expect(friendsAtRisk(from, to, [near], () => 1, () => new Set()).length).toBe(0);
    expect(friendsAtRisk(from, to, [near], () => 1, () => new Set(["m1"]))[0]!.pool).toEqual(new Set(["m1"]));
  });
});

describe("the resolver's strays (decision 133)", () => {
  const firer = () => makeInfantry("R", "RED", "squad", { x: 0, y: 0 }, 9);
  const target = () => makeInfantry("B", "BLUE", "squad", { x: 0, y: 200 }, 9);

  it("hits only the men a stray can reach, where a friend fights inside", () => {
    const friend = makeInfantry("R2", "RED", "squad", { x: 0, y: 205 }, 9);
    const reach = friend.soldiers![0]!.id;
    let hits = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const r = resolveDirectFire(new Rng(seed), firer(), target(), { weapon: "smallArms", atRisk: [{ unit: friend, chance: 1, pool: new Set([reach]) }] });
      hits += r.friendly?.reduce((t, s) => t + s.hits, 0) ?? 0;
    }
    expect(hits).toBeGreaterThan(0);
    expect(friend.soldiers!.filter((s) => s.id !== reach).every((s) => s.damagePoints === 0 && !s.neutralized)).toBe(true);
  });

  it("stops straying onto a friend the volley has already put out of the fight", () => {
    // Every man down, the force not yet marked so (that waits for the end of the volley, as mid-volley):
    // no miss is counted on it, though every one would find it.
    for (let seed = 1; seed <= 10; seed++) {
      const f = makeInfantry("R2", "RED", "squad", { x: 0, y: 205 }, 3);
      for (const s of f.soldiers!) s.neutralized = true;
      const r = resolveDirectFire(new Rng(seed), firer(), target(), { weapon: "smallArms", atRisk: [{ unit: f, chance: 1 }] });
      expect(r.friendly).toBeUndefined();
    }
  });
});

describe("friendly fire in the game (decision 133)", () => {
  it("is on for a new game, and off for a recording made before it", () => {
    const g = new Game({ seed: 1 });
    expect(g.friendlyFire).toBe(true);
    const recording = g.toRecording();
    expect(recording.friendlyFire).toBe(true);
    expect(replayGame(recording).friendlyFire).toBe(true);
    delete (recording as { friendlyFire?: boolean }).friendlyFire;
    expect(replayGame(recording).friendlyFire).toBe(false);
  });

  it("refuses a shot through a friend in the line of fire, and takes it when the rule is off", () => {
    for (const on of [true, false]) {
      const { g, red, blue } = setUp({ friendlyFire: on });
      g.addUnit(makeInfantry("R2", "RED", "squad", { x: 6, y: 100 }, 9));
      toCombat(g);
      const r = g.fire(red.id, blue.id, { weapon: "smallArms" });
      expect(r.fired).toBe(!on);
      if (on) expect(r.reason).toBe(MASKED_BY_FRIENDS);
    }
  });

  it("fires over friends in dead ground below the line, who stay at risk; on the flat they mask it", () => {
    const hills: Terrain = { heightfield: valley(), objects: [] };
    for (const [terrain, masked] of [[hills, false], [FLAT_GROUND, true]] as const) {
      const g = new Game({ lethality: "document", seed: 2, enforceC2: false, terrain });
      const red = g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 200 }, 9));
      g.addUnit(makeInfantry("R2", "RED", "squad", { x: 200, y: 200 }, 9));
      const blue = g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 390, y: 200 }, 9));
      const risk = g.friendlyRisk(red.id, blue.id);
      expect(g.isMasked(red.id, blue.id)).toBe(masked);
      expect(risk.masked === "R2").toBe(masked);
      expect(risk.atRisk.map((r) => r.unitId)).toEqual(["R2"]);
    }
  });

  it("says what a shot risks, judged where the target is marked when told", () => {
    const { g, red, blue } = setUp();
    g.addUnit(makeInfantry("R2", "RED", "squad", { x: 20, y: 200 }, 9));
    g.addUnit(makeInfantry("R3", "RED", "squad", { x: 1, y: 100 }, 9));
    const risk = g.friendlyRisk(red.id, blue.id);
    expect(risk.masked).toBe("R3");
    expect(risk.atRisk.map((r) => r.unitId).sort()).toEqual(["R2", "R3"]);
    // Marked off to the east, where neither friend is in the way.
    expect(g.friendlyRisk(red.id, blue.id, { x: 200, y: 0 })).toEqual({ atRisk: [] });
  });

  it("risks nothing where the rule is off", () => {
    const { g, red, blue } = setUp({ friendlyFire: false });
    g.addUnit(makeInfantry("R3", "RED", "squad", { x: 1, y: 100 }, 9));
    expect(g.friendlyRisk(red.id, blue.id)).toEqual({ atRisk: [] });
    expect(g.isMasked(red.id, blue.id)).toBe(false);
  });

  it("hits a friend at the target with the misses, over many shots, and never one far away", () => {
    const { g, red, blue } = setUp();
    const near = g.addUnit(makeInfantry("R2", "RED", "squad", { x: 10, y: 205 }, 9));
    g.addUnit(makeInfantry("R3", "RED", "squad", { x: 300, y: 0 }, 9));
    toCombat(g);
    const strays = volley(g, red.id, blue.id, 40, near.id);
    expect(strays).toBeGreaterThan(0);
    expect(g.friendlyFireTally.RED.hits).toBe(strays);
    expect(g.friendlyFireTally.BLUE.hits).toBe(0);
    expect(fit(g, "R3")).toBe(9);
  });

  it("replays a battle with strays in it to the same state", () => {
    const { g, red, blue } = setUp();
    const near = g.addUnit(makeInfantry("R2", "RED", "squad", { x: 10, y: 205 }, 9));
    toCombat(g);
    expect(volley(g, red.id, blue.id, 40, near.id)).toBeGreaterThan(0);
    expect(stateDigest(replayGame(g.toRecording()))).toBe(stateDigest(g));
  });

  it("suppresses the friend it hits, kept apart from the enemy's share, and logs no enemy fire on it", () => {
    const { g, red, blue } = setUp({ morale: true });
    const near = g.addUnit(makeInfantry("R2", "RED", "squad", { x: 10, y: 205 }, 9));
    toCombat(g);
    expect(volley(g, red.id, blue.id, 40, near.id)).toBeGreaterThan(0);
    const friend = g.getUnit(near.id);
    expect(friend.suppression ?? 0).toBeGreaterThan(0);
    expect(friend.strayedSuppression).toBe(friend.suppression);
    expect(enemySuppressionLevel(friend)).toBe("none");
    expect(g.fireReceived(near.id, 0)).toEqual([]);
    // The enemy's own share still counts.
    friend.suppression = (friend.suppression ?? 0) + SUPPRESSION.pinned;
    expect(enemySuppressionLevel(friend)).toBe("pinned");
  });

  it("changes nothing where no friend is at risk: the same seed, the same battle, on or off", () => {
    const play = (on: boolean) => {
      const { g, red, blue } = setUp({ friendlyFire: on });
      g.addUnit(makeInfantry("R3", "RED", "squad", { x: 300, y: 0 }, 9));
      toCombat(g);
      volley(g, red.id, blue.id, 10, red.id);
      return stateDigest(g);
    };
    expect(play(true)).toBe(play(false));
  });

  it("does not count a vehicle, which small arms do not hurt, nor a friend already out of the fight", () => {
    const { g, red, blue } = setUp();
    g.addUnit(makeVehicle("V", "RED", { x: 0, y: 100 }));
    const down = g.addUnit(makeInfantry("R4", "RED", "squad", { x: 0, y: 150 }, 9));
    down.neutralized = true;
    const risk = g.friendlyRisk(red.id, blue.id);
    expect(risk.masked).toBeUndefined();
    expect(risk.atRisk).toEqual([]);
  });

  it("masks covering fire too: a coverer does not answer a mover through its own men", () => {
    for (const on of [true, false]) {
      const g = new Game({ lethality: "document", seed: 1, enforceC2: false, terrain: FLAT_GROUND, friendlyFire: on });
      const coverer = g.addUnit(makeInfantry("RED-1", "RED", "squad", { x: 0, y: 0 }, 8));
      g.addUnit(makeInfantry("RED-2", "RED", "squad", { x: 1, y: 100 }, 8));
      const mover = g.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", { x: 0, y: 200 }, 8));
      g.beginTurn();
      g.advanceToPhase("combat");
      g.setCovering(coverer.id, true);
      g.advanceToPhase("summary");
      g.advancePhase();
      g.advanceToPhase("movement");
      const r = g.moveUnit(mover.id, { x: 0, y: 160 }, "normal");
      expect(r.coveringFire.length > 0).toBe(!on);
    }
  });

  it("puts friends at risk from covering fire's misses as well", () => {
    // A coverer answering a mover that bounds up beside a friend: over seeds, some misses find the friend.
    let strays = 0;
    for (let seed = 1; seed <= 30 && strays === 0; seed++) {
      const g = new Game({ lethality: "document", seed, enforceC2: false, terrain: FLAT_GROUND });
      const coverer = g.addUnit(makeInfantry("RED-1", "RED", "squad", { x: 0, y: 0 }, 8));
      g.addUnit(makeInfantry("RED-2", "RED", "squad", { x: 15, y: 165 }, 8));
      const mover = g.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", { x: 0, y: 200 }, 8));
      g.beginTurn();
      g.advanceToPhase("combat");
      g.setCovering(coverer.id, true);
      g.advanceToPhase("summary");
      g.advancePhase();
      g.advanceToPhase("movement");
      for (const shot of g.moveUnit(mover.id, { x: 0, y: 160 }, "normal").coveringFire) strays += shot.result.friendly?.reduce((t, s) => t + s.hits, 0) ?? 0;
    }
    expect(strays).toBeGreaterThan(0);
  });

  it("has a held force under a standing order take the nearest enemy it is not masked from", () => {
    for (const on of [true, false]) {
      const g = new Game({ lethality: "document", seed: 3, enforceC2: false, terrain: FLAT_GROUND, friendlyFire: on, trackIntel: false });
      const squad = g.addUnit(makeInfantry("S", "BLUE", "squad", { x: 0, y: 0 }, 8));
      g.addUnit(makeInfantry("S2", "BLUE", "squad", { x: 0, y: 60 }, 8));
      g.addUnit(makeInfantry("N", "RED", "squad", { x: 0, y: 120 }, 6));
      g.addUnit(makeInfantry("F", "RED", "squad", { x: 150, y: 100 }, 6));
      g.beginTurn();
      g.advanceToPhase("movement");
      g.setStandingOrder(squad.id, { gait: "normal", holdFire: true, engagementRange: 300 });
      g.advanceToPhase("combat");
      const done = g.executeStandingOrders("BLUE").find((d) => d.unitId === squad.id);
      expect(done?.engaged?.targetId).toBe(on ? "F" : "N");
    }
  });
});
