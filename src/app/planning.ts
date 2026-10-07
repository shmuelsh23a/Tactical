import { LOCATION_ERROR, Rng, type Game, type Point, type Side, type Unit, distance, locationSigma, unitSeed } from "../engine/index.js";

/**
 * Pre-battle planning intelligence: where a commander is told the enemy is,
 * before anything of his own has seen it.
 *
 * It lives in the app layer because both sides of the game need it — the
 * headless harness (`sim/balance.ts`, `sim/scenarioBattle.ts`) and the
 * computer the browser plays against (`computerSide.ts`) — and the arrow
 * runs from `sim` to `app`, never back. One owner, so a seed puts the plan
 * in the same wrong place in a measured battle and a played one.
 */

/** A standard normal draw (Box–Muller). */
export function normal(rng: Rng): number {
  return Math.sqrt(-2 * Math.log(1 - rng.next())) * Math.cos(2 * Math.PI * rng.next());
}

/**
 * Where an observer at `from` would put a force at `truth` (rules decision
 * 51's figures, an eye's): off along the sight line by a fifth of the range
 * and across it by the compass. Drawn from its own stream so the game's
 * rolls do not move.
 */
export function estimateFrom(rng: Rng, from: Point, truth: Point, rangeShare: number = LOCATION_ERROR.eye.rangeShare): Point {
  const range = distance(from, truth);
  const s = locationSigma(range, { ...LOCATION_ERROR.eye, rangeShare });
  const along = normal(rng) * s.along;
  const across = normal(rng) * s.across;
  const ux = range > 0 ? (truth.x - from.x) / range : 1;
  const uy = range > 0 ? (truth.y - from.y) / range : 0;
  return { x: truth.x + along * ux - across * uy, y: truth.y + along * uy + across * ux };
}

/** The mean position of a set of forces. */
const mean = (us: readonly Unit[]): Point => ({
  x: us.reduce((t, u) => t + u.position.x, 0) / us.length,
  y: us.reduce((t, u) => t + u.position.y, 0) / us.length,
});

/**
 * Where the attacking computer is told the defence is: the position's
 * centre, spoilt by an observer's error from its own start line (rules
 * decision 51), drawn from the planning stream so the battle's own rolls do
 * not move. The same brief the harness hands its attacker, so the computer
 * that comes on in the browser is the one the tables measure — and a wrong
 * plan is part of the opposition, not a handicap we invented.
 *
 * `rangeShare` is the harness's `FirePlanChoices.planningError`; left out,
 * decision 51's own figure stands.
 */
export function briefedObjective(game: Game, attacker: Side, defender: Side, rangeShare?: number): Point {
  const held = game.units.filter((u) => u.side === defender && u.kind !== "command");
  const own = game.units.filter((u) => u.side === attacker && u.kind !== "command");
  if (!held.length || !own.length) return { x: 0, y: 0 };
  return estimateFrom(new Rng(unitSeed(game.seed, "#planning-error")), mean(own), mean(held), rangeShare);
}
