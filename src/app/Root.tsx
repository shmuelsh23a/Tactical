import { useRef, useState } from "react";
import type { GameRecording } from "../engine/index.js";
import { App } from "./App.js";
import { Debrief } from "./Debrief.js";
import { recordingLoadFailed } from "./debriefText.js";
import { readRecording } from "./recordingFile.js";
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
 * when one is; and a debrief opened from the picker, over it.
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

  /** A recording opened from the picker; closing it comes back here. */
  const [review, setReview] = useState<GameRecording | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  if (!picked) {
    if (review) return <Debrief recording={review} onClose={() => setReview(null)} closeLabel="חזרה לבחירת תרחיש" />;
    return (
      <ScenarioPicker
        scenarios={SCENARIOS}
        onPick={(listing) => {
          remember(listing.id);
          setLoadError(null);
          setPicked({ listing, round: ++rounds.current });
        }}
        onLoadRecording={(file) => {
          // A recording made under other rules still opens: the debrief
          // says where it stops matching, so only a failure is said here.
          readRecording(file).then(
            ({ recording }) => {
              setLoadError(null);
              setReview(recording);
            },
            (err: unknown) => setLoadError(recordingLoadFailed((err as Error).message)),
          );
        }}
        loadError={loadError}
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
