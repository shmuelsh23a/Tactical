import {
  buildYokneamIllitScenario,
  buildYokneamIllitTerrain,
} from "./scenarios/yokneamIllit.js";
import type { Scenario } from "./scenarios/types.js";

export type { Scenario };

/**
 * Which battle the app opens with, and the ground under it.
 *
 * Both come from [`scenarios/yokneamIllit.ts`](scenarios/yokneamIllit.ts),
 * which is **generated** by `tools/make-scenario.py` from
 * `tools/scenarios/yokneam-illit.json` — the forces, the charges and the prose
 * are all in the spec, so laying a battle out is editing JSON rather than this
 * file. The ground it stands on is generated too (`tools/fetch-dtm.py` and
 * `tools/fetch-osm.py`), so nothing on the demo map is invented.
 *
 * This module is the seam that keeps that arrangement out of the app: the app
 * asks for *the* demo scenario, and which generated module that is, is decided
 * here.
 */
export const buildDemoTerrain = buildYokneamIllitTerrain;
export const buildDemoScenario = buildYokneamIllitScenario;
