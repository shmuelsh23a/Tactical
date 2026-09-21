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
 * A battle as the picker lists it: what to call it, one line saying what its
 * ground asks of the player, and the builder behind both.
 *
 * Each generated module exports its own entry, so the label the player chooses
 * by and the title drawn on the header are the same string rather than two
 * that have to be kept in step. The catalogue in
 * [`scenario.ts`](../scenario.ts) is then only a list of them.
 */
export interface ScenarioEntry {
  /** The spec's slug, which also names the module and its build function. */
  id: string;
  /** Hebrew, and the same title the built `Scenario` carries. */
  title: string;
  /** One Hebrew line under the title in the picker. */
  brief: string;
  build: (seed?: number) => Scenario;
}
