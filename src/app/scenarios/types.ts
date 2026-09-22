import type { Game } from "../../engine/index.js";

/**
 * A battle the app can play: a game with its forces already on it, and the
 * extent of the ground it is laid on.
 *
 * It lives here rather than beside the demo because the scenarios in this
 * directory are **generated** — `tools/make-scenario.py` writes one from a
 * JSON spec — and a generated module must not have to import the thing that
 * imports it.
 */
export interface Scenario {
  game: Game;
  /** Map extent in metres. */
  mapWidth: number;
  mapHeight: number;
  title: string;
}

/**
 * A battle as the scenario picker offers it: enough to choose by, and a way
 * to build it. Generated beside the builder from the same spec; the title and
 * the extent are written into both, and `scenarioCatalogue.test.ts` pins that
 * the card and the battle it builds agree.
 */
export interface ScenarioListing {
  /** The spec's slug; also what `?scenario=` names. */
  id: string;
  title: string;
  /**
   * Read by both players before either has taken a side, so it is a tasking —
   * who attacks, who holds, where — and never what a side would have to find
   * out for itself.
   */
  brief: string;
  mapWidth: number;
  mapHeight: number;
  build: (seed?: number) => Scenario;
}
