import { Rng } from "../rng.js";
import { roll } from "../dice.js";
import type { Point } from "../geometry.js";
import {
  ARTILLERY_DISPERSION,
  type LineDeviation,
  type RangeDeviation,
} from "../data/artillery.js";
import { FIXED_WING_MISS_REDUCTION } from "../data/uav.js";

export interface DispersionResult {
  impact: Point;
  rangeDeviation: RangeDeviation;
  lineDeviation: LineDeviation;
  /** Total metres the impact landed from the aim point. */
  missDistance: number;
}

export interface DispersionOptions {
  /** Battery position, to orient the range (gun-target) axis. */
  firingFrom?: Point;
  /** True for a launcher (מטול) delivering indirectly: miss × 0.1. */
  isLauncher?: boolean;
  /** True when a fixed-wing UAV footprint covers the aim point: miss × 0.8. */
  fixedWingObserved?: boolean;
}

function classify(percentile: number): "first" | "second" | "onTarget" {
  if (percentile <= ARTILLERY_DISPERSION.firstDeviationMax) return "first";
  if (percentile <= ARTILLERY_DISPERSION.secondDeviationMax) return "second";
  return "onTarget";
}

/**
 * Resolve where an indirect-fire round actually lands relative to its aim
 * point, per the artillery dispersion table.
 *
 * Two independent percentile rolls (the document's 2d10-per-axis) decide the
 * range (short/long) and line (right/left) deviation. Miss magnitude is
 * 1d4×50 m on the range axis and 1d4×25 m on the line axis, scaled down for
 * launchers and for targets under a fixed-wing UAV footprint.
 */
export function resolveDispersion(
  rng: Rng,
  aim: Point,
  opts: DispersionOptions = {},
): DispersionResult {
  const rangePct = rng.int(1, 100);
  const linePct = rng.int(1, 100);

  const rangeClass = classify(rangePct);
  const lineClass = classify(linePct);

  let scale = 1;
  if (opts.isLauncher) scale *= ARTILLERY_DISPERSION.launcherMissMultiplier;
  if (opts.fixedWingObserved) scale *= 1 - FIXED_WING_MISS_REDUCTION;

  // Range axis unit vector (gun -> target). Defaults to pointing north.
  let ux = 0;
  let uy = 1;
  if (opts.firingFrom) {
    const dx = aim.x - opts.firingFrom.x;
    const dy = aim.y - opts.firingFrom.y;
    const len = Math.hypot(dx, dy) || 1;
    ux = dx / len;
    uy = dy / len;
  }
  // Right-hand perpendicular (clockwise from the firing direction).
  const rx = uy;
  const ry = -ux;

  let rangeOffset = 0;
  let rangeDeviation: RangeDeviation = "onTarget";
  if (rangeClass !== "onTarget") {
    const mag =
      roll(rng, ARTILLERY_DISPERSION.rangeMissDice) *
      ARTILLERY_DISPERSION.rangeMissMetresPerPip *
      scale;
    if (rangeClass === "first") {
      rangeDeviation = "short";
      rangeOffset = -mag;
    } else {
      rangeDeviation = "long";
      rangeOffset = +mag;
    }
  }

  let lineOffset = 0;
  let lineDeviation: LineDeviation = "onTarget";
  if (lineClass !== "onTarget") {
    const mag =
      roll(rng, ARTILLERY_DISPERSION.lineMissDice) *
      ARTILLERY_DISPERSION.lineMissMetresPerPip *
      scale;
    if (lineClass === "first") {
      lineDeviation = "right";
      lineOffset = +mag;
    } else {
      lineDeviation = "left";
      lineOffset = -mag;
    }
  }

  const impact: Point = {
    x: aim.x + ux * rangeOffset + rx * lineOffset,
    y: aim.y + uy * rangeOffset + ry * lineOffset,
  };
  const missDistance = Math.hypot(impact.x - aim.x, impact.y - aim.y);

  return { impact, rangeDeviation, lineDeviation, missDistance };
}
