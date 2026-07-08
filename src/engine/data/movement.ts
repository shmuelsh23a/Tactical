import type { MovementMode } from "../types.js";

/**
 * Movement profiles (תנועה), transcribed from the rules table.
 *
 *   Normal (תנועה בקצב רגיל): up to 50 m/turn; 30% to find IEDs/hidden enemy
 *   within 20 m; 70% to spot a visible enemy within 300 m; enemy fire against
 *   the moving unit gets +30% to hit.
 *
 *   Running (ריצה): up to 100 m/turn; 5% / 50% detection at the same ranges;
 *   enemy fire against the unit gets -20% to hit.
 *
 * Plus the two cross-cutting rules:
 *   - A unit under fire moves at half pace.
 *   - A unit that was hit cannot move on the following turn.
 */
export interface MovementProfile {
  /** Maximum metres this gait can cover in one turn. */
  maxDistance: number;
  /** Chance to find mines/IEDs/hidden enemy within {@link hiddenDetectRange}. */
  hiddenDetectChance: number;
  hiddenDetectRange: number;
  /** Chance to spot a visible enemy within {@link visibleDetectRange}. */
  visibleDetectChance: number;
  visibleDetectRange: number;
  /** Additive modifier applied to enemy hit chance against this moving unit. */
  enemyHitModifier: number;
}

export const MOVEMENT_PROFILES: Record<MovementMode, MovementProfile> = {
  normal: {
    maxDistance: 50,
    hiddenDetectChance: 0.3,
    hiddenDetectRange: 20,
    visibleDetectChance: 0.7,
    visibleDetectRange: 300,
    enemyHitModifier: +0.3,
  },
  run: {
    maxDistance: 100,
    hiddenDetectChance: 0.05,
    hiddenDetectRange: 20,
    visibleDetectChance: 0.5,
    visibleDetectRange: 300,
    enemyHitModifier: -0.2,
  },
};

/** A unit under fire moves at half its gait's maximum distance. */
export const UNDER_FIRE_SPEED_MULTIPLIER = 0.5;
