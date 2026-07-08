import { describe, it, expect } from "vitest";
import { Rng } from "./rng.js";
import { parseDice, roll, rollDetailed } from "./dice.js";

describe("parseDice", () => {
  it("parses Latin notation", () => {
    expect(parseDice("2d10")).toEqual({ count: 2, sides: 10 });
    expect(parseDice("d6")).toEqual({ count: 1, sides: 6 });
    expect(parseDice("1d4")).toEqual({ count: 1, sides: 4 });
  });

  it("parses Hebrew ק notation from the source rules", () => {
    expect(parseDice("1ק10")).toEqual({ count: 1, sides: 10 });
    expect(parseDice("2ק10")).toEqual({ count: 2, sides: 10 });
    expect(parseDice("1ק8")).toEqual({ count: 1, sides: 8 });
  });

  it("parses a constant", () => {
    expect(parseDice("3")).toEqual({ count: 3, sides: 1 });
  });

  it("throws on garbage", () => {
    expect(() => parseDice("banana")).toThrow();
  });
});

describe("roll", () => {
  it("stays within count..count*sides", () => {
    const r = new Rng(5);
    for (let i = 0; i < 1000; i++) {
      const v = roll(r, "2d10");
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(20);
    }
  });

  it("a constant always returns its value", () => {
    const r = new Rng(1);
    expect(roll(r, "5")).toBe(5);
  });

  it("rollDetailed returns matching rolls and total", () => {
    const r = new Rng(11);
    const { total, rolls } = rollDetailed(r, "4d10");
    expect(rolls).toHaveLength(4);
    expect(rolls.reduce((a, b) => a + b, 0)).toBe(total);
  });
});
