import { describe, it, expect } from "vitest";
import { segmentIntersectsCircle } from "./geometry.js";

describe("segmentIntersectsCircle", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 100, y: 0 };

  it("catches a screen sitting across the middle of the shot", () => {
    expect(segmentIntersectsCircle(a, b, { x: 50, y: 0 }, 10)).toBe(true);
    expect(segmentIntersectsCircle(a, b, { x: 50, y: 9 }, 10)).toBe(true);
  });

  it("lets the shot past a screen that is clear of the line", () => {
    expect(segmentIntersectsCircle(a, b, { x: 50, y: 11 }, 10)).toBe(false);
  });

  it("catches a screen sitting over either end", () => {
    expect(segmentIntersectsCircle(a, b, { x: 0, y: 0 }, 10)).toBe(true);
    expect(segmentIntersectsCircle(a, b, { x: 100, y: 0 }, 10)).toBe(true);
  });

  it("does not extend the segment past its ends", () => {
    // On the line, but 20 m beyond the target — behind the shot, not through it.
    expect(segmentIntersectsCircle(a, b, { x: 120, y: 0 }, 10)).toBe(false);
    expect(segmentIntersectsCircle(a, b, { x: -20, y: 0 }, 10)).toBe(false);
  });

  it("handles a zero-length segment", () => {
    expect(segmentIntersectsCircle(a, a, { x: 5, y: 0 }, 10)).toBe(true);
    expect(segmentIntersectsCircle(a, a, { x: 20, y: 0 }, 10)).toBe(false);
  });
});
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
