/**
 * How far off a sighting reports a force (rules decision 51, ⚠️ ours, set
 * from published figures). Played when `GameOptions.locationError` is on.
 *
 * A side does not learn where an enemy *is* when it sees it: it learns where
 * an observer judged it to be. Doctrine grades that judgement as target
 * location error (TLE), CAT I (0–6 m) to CAT VI (over 305 m), and an observer
 * working by eye, map and compass sits in the middle of it. Of its two parts,
 * the range is the bad one: troops judging distance by eye err by about 20%
 * of it or more (Armored Medical Research Laboratory, Fort Knox, 1945). The
 * direction is good to the compass's 10–17 mils. Sources in
 * docs/validation.md.
 *
 * The error is a normal draw on each axis, along the sight line and across
 * it, around where the force truly stands. The figures are standard
 * deviations.
 */
export interface LocationErrorFigures {
  /** Along the sight line, as a share of the range: the eye's range estimate. */
  rangeShare: number;
  /** Across it, in mils (a mil is a metre at a kilometre): the compass. */
  bearingMils: number;
  /** Never better than this, in metres: the observer's own place on the map. */
  floorM: number;
}

export const LOCATION_ERROR = {
  /**
   * A force looking with its own eyes — spotting a mover, picking up the
   * enemy that fires on it, a firer holding the force it shoots at.
   * 20% of range (the 1945 figure, read as a standard deviation) and 10 mils
   * (the compass's best).
   */
  eye: { rangeShare: 0.2, bearingMils: 10, floorM: 5 },
  /**
   * An observation post (rules decision 38) has had the time to measure its
   * sector: a range card to the ground it watches halves the range error
   * (ours).
   */
  observationPost: { rangeShare: 0.1, bearingMils: 10, floorM: 5 },
} as const satisfies Record<string, LocationErrorFigures>;

/**
 * A UAV's sighting, in metres a side (ours): it looks straight down with its
 * own navigation, so its error does not grow with any range — CAT II–III
 * (7–30 m).
 */
export const UAV_LOCATION_ERROR_M = 15;

/**
 * The standard deviations, along and across the sight line, of a sighting
 * made at `range` metres with `figures`.
 */
export function locationSigma(range: number, figures: LocationErrorFigures): { along: number; across: number } {
  return {
    along: Math.max(figures.floorM, range * figures.rangeShare),
    across: Math.max(figures.floorM, (range * figures.bearingMils) / 1000),
  };
}
