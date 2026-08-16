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

import { angleBetween, bearingDegrees, withinArc } from "./geometry.js";

describe("bearings and arcs", () => {
  const origin = { x: 0, y: 0 };

  it("measures a bearing off +x, growing the way y does", () => {
    // The map's y grows downward on screen, so 90° points *down* it.
    expect(bearingDegrees(origin, { x: 100, y: 0 })).toBeCloseTo(0, 5);
    expect(bearingDegrees(origin, { x: 0, y: 100 })).toBeCloseTo(90, 5);
    expect(bearingDegrees(origin, { x: -100, y: 0 })).toBeCloseTo(180, 5);
    expect(bearingDegrees(origin, { x: 0, y: -100 })).toBeCloseTo(270, 5);
  });

  it("takes the short way round between two bearings", () => {
    expect(angleBetween(10, 350)).toBeCloseTo(20, 5);
    expect(angleBetween(350, 10)).toBeCloseTo(20, 5);
    expect(angleBetween(0, 180)).toBeCloseTo(180, 5);
  });

  it("splits an arc evenly either side of its bearing, edges included", () => {
    const arc = (p: { x: number; y: number }) => withinArc(origin, p, 0, 90);
    expect(arc({ x: 100, y: 0 })).toBe(true); // dead centre
    expect(arc({ x: 100, y: 100 })).toBe(true); // 45°, the edge
    expect(arc({ x: 100, y: -100 })).toBe(true); // 315°, the other edge
    expect(arc({ x: 0, y: 100 })).toBe(false); // 90°, just outside
  });

  it("wraps across 0° without a seam", () => {
    expect(withinArc(origin, { x: 100, y: -30 }, 0, 90)).toBe(true);
    expect(withinArc(origin, { x: 100, y: 30 }, 350, 90)).toBe(true);
  });

  it("holds everything at 360°, and anything standing on the observer", () => {
    expect(withinArc(origin, { x: -100, y: 0 }, 0, 360)).toBe(true);
    // There is no direction to a force on top of you to be wrong about.
    expect(withinArc(origin, origin, 180, 30)).toBe(true);
  });
});
