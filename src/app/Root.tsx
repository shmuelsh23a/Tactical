import { useState } from "react";
import { App } from "./App.js";
import { DEFAULT_SCENARIO, scenarioById } from "./scenario.js";

/**
 * Which battle is open, and nothing else.
 *
 * The engine is a mutable instance held in a ref inside `App`, with a turn's
 * worth of React state beside it — the log, the activations, the selection,
 * which missions this turn has spent. Opening another battle means all of it
 * starting again, so it is done by **remounting** `App` under the scenario's
 * id rather than by resetting each piece: a reset would have to be extended
 * every time a new piece of state is added, and the one that got forgotten
 * would carry the last battle's state into the next one.
 */
export function Root() {
  const [entryId, setEntryId] = useState(DEFAULT_SCENARIO.id);
  const entry = scenarioById(entryId);
  return <App key={entry.id} entry={entry} onPickScenario={setEntryId} />;
}
