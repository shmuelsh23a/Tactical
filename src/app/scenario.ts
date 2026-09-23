import { buildYokneamIllitScenario, buildYokneamIllitTerrain, yokneamIllitListing } from "./scenarios/yokneamIllit.js";
import { telAzekaListing } from "./scenarios/telAzeka.js";
import { telAzekaCompanyListing } from "./scenarios/telAzekaCompany.js";
import type { Scenario, ScenarioListing } from "./scenarios/types.js";

export type { Scenario, ScenarioListing };

/**
 * The battles the app offers, in the order the picker shows them.
 *
 * Each entry is **generated** beside its builder by `tools/make-scenario.py`
 * from a JSON spec under `tools/scenarios/` — the forces, the charges, the
 * title and the picker's brief are all in the spec, so laying a battle out is
 * editing JSON rather than this file. The ground under each is generated too
 * (`tools/fetch-dtm.py` and `tools/fetch-osm.py`), so nothing on a map is
 * invented. Adding a battle is one line here, and `scenarioCatalogue.test.ts`
 * fails until every spec under `tools/scenarios/` is listed.
 */
export const SCENARIOS: readonly ScenarioListing[] = [yokneamIllitListing, telAzekaListing, telAzekaCompanyListing];

/** The listing a `?scenario=` id names, or undefined for none or an unknown one. */
export function findScenario(id: string | null | undefined): ScenarioListing | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

/**
 * The demo: the Yokneam battle, whose lesson `scenario.test.ts` pins. Kept by
 * name so the tests that are about *the demo* do not depend on the picker's
 * order.
 */
export const buildDemoTerrain = buildYokneamIllitTerrain;
export const buildDemoScenario = buildYokneamIllitScenario;
