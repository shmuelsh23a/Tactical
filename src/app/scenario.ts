import { YOKNEAM_ILLIT_BATTLE } from "./scenarios/yokneamIllit.js";
import { TEL_AZEKA_BATTLE } from "./scenarios/telAzeka.js";
import type { Scenario, ScenarioEntry } from "./scenarios/types.js";

export type { Scenario, ScenarioEntry };

/**
 * The battles the app can open.
 *
 * Every one of them is **generated**: `tools/make-scenario.py` writes the
 * module from a JSON spec under `tools/scenarios/`, and the ground beneath it
 * comes from `tools/fetch-dtm.py` and `tools/fetch-osm.py`. Laying a new battle
 * out is therefore writing a spec and running the tool — and then adding one
 * line here, which is the only hand-written part of it.
 *
 * Each module exports its own entry rather than being described again in this
 * list, so the title the picker offers and the title the header draws are the
 * same string by construction. This module is the seam that keeps the whole
 * arrangement out of the app: the app asks for the catalogue and for a battle
 * by id, and which generated modules stand behind them is decided here.
 */
export const SCENARIOS: readonly ScenarioEntry[] = [YOKNEAM_ILLIT_BATTLE, TEL_AZEKA_BATTLE];

/** What the app opens with when the player has not chosen. */
export const DEFAULT_SCENARIO: ScenarioEntry = YOKNEAM_ILLIT_BATTLE;

/**
 * The battle with this id, or the default.
 *
 * An unknown id falls back rather than throwing: the id is a string that has
 * been round-tripped through the UI, and opening the demo is a better answer
 * to a stale one than a blank screen.
 */
export function scenarioById(id: string): ScenarioEntry {
  return SCENARIOS.find((s) => s.id === id) ?? DEFAULT_SCENARIO;
}

/**
 * The demo, by name, for the tests that pin what its ground teaches.
 * `src/app/scenario.test.ts` is the one that matters.
 */
export const buildDemoScenario = DEFAULT_SCENARIO.build;
