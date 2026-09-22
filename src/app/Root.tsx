import { useRef, useState } from "react";
import { App } from "./App.js";
import { ScenarioPicker } from "./components/ScenarioPicker.js";
import { findScenario, SCENARIOS, type ScenarioListing } from "./scenario.js";

const PARAM = "scenario";

/**
 * Put the battle being fought in the address, or take it out. Replaced rather
 * than pushed on purpose: a Back button that returned to the picker would drop
 * the battle without the header button's second click.
 */
function remember(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set(PARAM, id);
  else url.searchParams.delete(PARAM);
  window.history.replaceState(null, "", url);
}

/**
 * Which battle is being fought, if any. The picker when none is; the game
 * when one is.
 *
 * The choice lives in the address (`?scenario=telAzeka`), so a reload comes
 * back to the same ground and a link or a browser script can open a battle
 * directly. An id nobody lists opens the picker rather than guessing.
 *
 * The game is keyed on the pick, so leaving and choosing again mounts a fresh
 * `App` — the engine lives in a ref there, and a remount is the only thing
 * that is guaranteed to build a new one.
 */
export function Root() {
  /** Bumped on every pick, so choosing the same battle again is still a new game. */
  const rounds = useRef(0);
  const [picked, setPicked] = useState<{ listing: ScenarioListing; round: number } | null>(() => {
    const listing = findScenario(new URL(window.location.href).searchParams.get(PARAM));
    return listing ? { listing, round: 0 } : null;
  });

  if (!picked) {
    return (
      <ScenarioPicker
        scenarios={SCENARIOS}
        onPick={(listing) => {
          remember(listing.id);
          setPicked({ listing, round: ++rounds.current });
        }}
      />
    );
  }
  return (
    <App
      key={`${picked.listing.id}-${picked.round}`}
      scenario={picked.listing}
      onLeave={() => {
        remember(null);
        setPicked(null);
      }}
    />
  );
}
