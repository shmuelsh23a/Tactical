import { describe, it, expect } from "vitest";
import { Rng } from "./rng.js";

describe("Rng", () => {
  it("is deterministic for a given seed", () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it("next() stays in [0, 1)", () => {
    const r = new Rng(99);
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int() respects inclusive bounds", () => {
    const r = new Rng(7);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 20000; i++) {
      const v = r.die(10);
      expect(Number.isInteger(v)).toBe(true);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBe(1);
    expect(max).toBe(10);
  });

  it("chance() is roughly calibrated", () => {
    const r = new Rng(42);
    let hits = 0;
    const n = 100000;
    for (let i = 0; i < n; i++) if (r.chance(0.3)) hits++;
    expect(hits / n).toBeGreaterThan(0.29);
    expect(hits / n).toBeLessThan(0.31);
  });

  it("chance() handles edges", () => {
    const r = new Rng(1);
    expect(r.chance(0)).toBe(false);
    expect(r.chance(1)).toBe(true);
  });

  it("state can be saved and restored", () => {
    const r = new Rng(123);
    r.next();
    r.next();
    const s = r.getState();
    const after = r.next();
    r.setState(s);
    expect(r.next()).toEqual(after);
  });
});
