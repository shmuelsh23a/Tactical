import {
  fitSoldiers,
  fullStrength,
  replayWithOutcomes,
  type GameRecording,
  type Side,
} from "../engine/index.js";
import { isGone } from "./hotseat.js";

/**
 * Was that a bad plan, or bad luck?
 *
 * A recording holds the **decisions**, and every outcome is derived from them,
 * so the same battle can be re-fought under a different seed without anyone
 * playing it again: the orders, the shots and the timing stay exactly as they
 * were, and only the dice change. Run it enough times and the spread answers
 * the question a single playthrough cannot.
 *
 * Two things keep it honest. The alternate battles drift — a force slowed by
 * fire cannot make the bound it made, a shot has no target left to take — so a
 * decision that has become impossible is **skipped rather than fatal**, and the
 * count of skipped decisions is reported: a run that dropped half the plan is
 * not the same plan, and the reader must be able to see that. And the seeds are
 * derived from the recording's own, so the same recording always produces the
 * same spread.
 */

/** How one alternate battle came out. */
export interface WhatIfRun {
  seed: number;
  /** Casualties each side took, counted from the state the run ended in. */
  losses: Record<Side, number>;
  /** Sides with nothing left able to fight. */
  broken: Side[];
  /** Decisions this history could not carry out. */
  skipped: number;
}

export interface WhatIf {
  /** The battle as it was actually fought, for comparison. */
  actual: WhatIfRun;
  /** The re-rolls, in seed order. */
  runs: WhatIfRun[];
}

/** Losses and survivors as the battle ended, from the umpire's own state. */
function outcomeOf(recording: GameRecording, seed: number): WhatIfRun {
  const { game, skipped } = replayWithOutcomes(recording, { seed, skipRejected: true });
  const losses: Record<Side, number> = { RED: 0, BLUE: 0 };
  const broken: Side[] = [];

  for (const side of ["BLUE", "RED"] as Side[]) {
    const units = game.units.filter((u) => u.side === side);
    for (const unit of units) {
      losses[side] += unit.soldiers
        ? fullStrength(unit) - fitSoldiers(unit)
        : isGone(unit)
          ? 1
          : 0;
    }
    if (units.length > 0 && units.every((u) => u.neutralized || isGone(u))) broken.push(side);
  }
  return { seed, losses, broken, skipped: skipped.length };
}

/**
 * Re-fight the recorded battle `runs` times. Seeds follow the recording's own,
 * so the answer is reproducible: the same recording always re-rolls the same
 * way.
 */
export function whatIf(recording: GameRecording, runs = 20): WhatIf {
  return {
    actual: outcomeOf(recording, recording.seed),
    runs: Array.from({ length: runs }, (_, i) => outcomeOf(recording, recording.seed + i + 1)),
  };
}

/** Smallest, middle and largest of a set of numbers, for reporting a spread. */
export function spread(values: number[]): { min: number; median: number; max: number } {
  if (!values.length) return { min: 0, median: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: sorted[0]!,
    median: sorted[Math.floor(sorted.length / 2)]!,
    max: sorted[sorted.length - 1]!,
  };
}
