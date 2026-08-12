import { describe, it, expect } from "vitest";
import { Game } from "./game.js";
import { canonicalJson, fnv1a, stateDigest } from "./digest.js";
import { makeInfantry } from "./units.js";

describe("canonicalJson", () => {
  it("does not depend on the order properties were assigned in", () => {
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
    expect(canonicalJson({ x: { p: 1, q: 2 } })).toBe(canonicalJson({ x: { q: 2, p: 1 } }));
  });

  it("keeps array order, which is meaningful", () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it("drops undefined so an absent field and a missing one agree", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
  });
});

describe("fnv1a", () => {
  it("is stable and differs for different input", () => {
    expect(fnv1a("hello")).toBe(fnv1a("hello"));
    expect(fnv1a("hello")).not.toBe(fnv1a("hellp"));
    expect(fnv1a("")).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("stateDigest", () => {
  function game(seed = 1) {
    const g = new Game({ seed });
    g.addUnit(makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 8));
    g.addUnit(makeInfantry("B", "RED", "squad", { x: 0, y: 50 }, 6));
    g.beginTurn();
    return g;
  }

  it("agrees for two games built the same way", () => {
    expect(stateDigest(game())).toBe(stateDigest(game()));
  });

  it("moves when the board moves", () => {
    const g = game();
    const before = stateDigest(g);
    g.advanceToPhase("movement");
    g.moveUnit("A", { x: 0, y: 20 }, "normal");
    expect(stateDigest(g)).not.toBe(before);
  });

  it("catches a changed battle that the rng state alone would hide", () => {
    // The generator only moves when the number of draws changes. Rules that
    // decide what a roll *means* — the neutralise threshold, the attrition
    // fraction, the armour pools — rewrite the battle without consuming
    // anything, so the fingerprint has to cover the state itself.
    const a = game();
    const b = game();
    b.getUnit("B").soldiers![0]!.damagePoints = 3;

    expect(b.rng.getState()).toBe(a.rng.getState()); // generator untouched…
    expect(stateDigest(b)).not.toBe(stateDigest(a)); // …different battle
  });

  it("also catches a change that does move the dice", () => {
    const a = game();
    const b = game();
    a.advanceToPhase("combat");
    b.advanceToPhase("combat");
    a.fire("A", "B", { weapon: "smallArms", cover: "none" });
    b.fire("A", "B", { weapon: "smallArms", cover: "full" });
    expect(stateDigest(b)).not.toBe(stateDigest(a));
  });
});
