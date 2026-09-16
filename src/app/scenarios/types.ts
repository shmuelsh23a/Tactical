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
