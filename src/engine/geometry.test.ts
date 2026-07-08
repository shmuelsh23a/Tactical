import { describe, it, expect } from "vitest";
import { distance, lookupBand, withinRadius } from "./geometry.js";

describe("distance", () => {
  it("computes euclidean distance in metres", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe("lookupBand", () => {
  const bands = [
    { maxRange: 100, value: 0.3 },
    { maxRange: 300, value: 0.2 },
    { maxRange: 400, value: 0.1 },
  ];

  it("returns the first band whose maxRange covers the distance", () => {
    expect(lookupBand(bands, 50)?.value).toBe(0.3);
    expect(lookupBand(bands, 100)?.value).toBe(0.3);
    expect(lookupBand(bands, 101)?.value).toBe(0.2);
    expect(lookupBand(bands, 400)?.value).toBe(0.1);
  });

  it("returns undefined beyond the longest band", () => {
    expect(lookupBand(bands, 401)).toBeUndefined();
  });
});

describe("withinRadius", () => {
  it("is inclusive at the boundary", () => {
    expect(withinRadius({ x: 0, y: 0 }, { x: 50, y: 0 }, 50)).toBe(true);
    expect(withinRadius({ x: 0, y: 0 }, { x: 51, y: 0 }, 50)).toBe(false);
  });
});
