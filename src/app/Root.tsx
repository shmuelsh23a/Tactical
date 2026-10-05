import { useRef, useState } from "react";
import type { GameRecording } from "../engine/index.js";
import { App } from "./App.js";
import { Debrief } from "./Debrief.js";
import { recordingLoadFailed, sessionProblemHe } from "./debriefText.js";
import { readRecording } from "./recordingFile.js";
import { ScenarioPicker } from "./components/ScenarioPicker.js";
import { findScenario, SCENARIOS, type ScenarioListing } from "./scenario.js";
import {
  SESSION_KEY,
  SessionError,
  clearStoredSession,
  parseSession,
  resumeBattle,
  type ResumedBattle,
  type Session,
  type SessionProblem,
} from "./session.js";

const PARAM = "scenario";
/** `?vs=computer`: the battle is played against the computer (single-player). */
const VS = "vs";
/**
 * `&saved=1`: this tab's battle has been saved, so a reload comes back to it.
 * Set by the game once it has first saved, never by a pick — a battle picked
 * fresh and reloaded before anything happened in it stays fresh, rather than
 * turning into whatever was saved before on the same ground.
 */
const SAVED = "saved";

/**
 * Put the battle being fought in the address, or take it out. Replaced rather
 * than pushed on purpose: a Back button that returned to the picker would drop
 * the battle without the header button's second click.
 */
function remember(id: string | null, vsComputer = false, saved = false) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set(PARAM, id);
  else url.searchParams.delete(PARAM);
  if (id && vsComputer) url.searchParams.set(VS, "computer");
  else url.searchParams.delete(VS);
  if (id && saved) url.searchParams.set(SAVED, "1");
  else url.searchParams.delete(SAVED);
  window.history.replaceState(null, "", url);
}

function markSaved() {
  const url = new URL(window.location.href);
  url.searchParams.set(SAVED, "1");
  window.history.replaceState(null, "", url);
}

/**
 * The battle saved in this browser and its scenario, or why it is unusable.
 * A save that cannot be read is set aside at once, so the picker opens clean;
 * one from a newer version of the game is kept for that version.
 */
function storedBattle(): { session: Session; listing: ScenarioListing } | { problem: SessionProblem } | null {
  let text: string | null;
  try {
    text = window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
  if (!text) return null;
  try {
    const session = parseSession(text);
    const listing = findScenario(session.scenarioId);
    if (listing) return { session, listing };
    clearStoredSession();
    return { problem: "notASession" };
  } catch (err) {
    const problem: SessionProblem = err instanceof SessionError ? err.problem : "notASession";
    if (problem !== "newerVersion") clearStoredSession();
    return { problem };
  }
}

/** Rebuild the stored battle to play on; on failure it is set aside and the reason returned. */
function resumeStored(): { resumed: ResumedBattle; listing: ScenarioListing } | { problem: SessionProblem } | null {
  const stored = storedBattle();
  if (!stored || "problem" in stored) return stored;
  try {
    return { resumed: resumeBattle(stored.session, stored.listing), listing: stored.listing };
  } catch (err) {
    clearStoredSession();
    return { problem: err instanceof SessionError ? err.problem : "doesNotReplay" };
  }
}

interface Picked {
  listing: ScenarioListing;
  round: number;
  vsComputer: boolean;
  resume?: ResumedBattle;
}

/**
 * Which battle is being fought, if any. The picker when none is; the game
 * when one is; and a debrief opened from the picker, over it.
 *
 * The choice lives in the address (`?scenario=telAzeka`), so a link or a
 * browser script can open a battle directly, and a reload of a battle that
 * has been saved comes back to it (`&saved=1`). An id nobody lists opens the
 * picker rather than guessing.
 *
 * The game is keyed on the pick, so leaving and choosing again mounts a fresh
 * `App` — the engine lives in a ref there, and a remount is the only thing
 * that is guaranteed to build a new one.
 */
export function Root() {
  /** Bumped on every pick, so choosing the same battle again is still a new game. */
  const rounds = useRef(0);
  const [start] = useState((): { picked: Picked | null; notice: SessionProblem | null } => {
    const params = new URL(window.location.href).searchParams;
    const listing = findScenario(params.get(PARAM));
    if (!listing) return { picked: null, notice: null };
    const vsComputer = params.get(VS) === "computer";
    if (params.get(SAVED) !== "1") return { picked: { listing, round: 0, vsComputer }, notice: null };
    // A reload of a saved battle comes back to it, if it is still the one saved here.
    const back = resumeStored();
    if (back && "resumed" in back && back.listing.id === listing.id && Boolean(back.resumed.ai) === vsComputer) {
      return { picked: { listing, round: 0, vsComputer, resume: back.resumed }, notice: null };
    }
    remember(null);
    return { picked: null, notice: back && "problem" in back ? back.problem : null };
  });
  const [picked, setPicked] = useState<Picked | null>(start.picked);
  /** Why the saved battle could not be picked up, said once on the picker. */
  const [notice, setNotice] = useState<SessionProblem | null>(start.notice);

  /** A recording opened from the picker; closing it comes back here. */
  const [review, setReview] = useState<GameRecording | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  if (!picked) {
    if (review) return <Debrief recording={review} onClose={() => setReview(null)} closeLabel="חזרה לבחירת תרחיש" />;
    // Read whenever the picker shows: leaving a battle has just saved it.
    const stored = storedBattle();
    const saved = stored && "session" in stored ? stored : null;
    const problem = notice ?? (stored && "problem" in stored ? stored.problem : null);
    return (
      <ScenarioPicker
        scenarios={SCENARIOS}
        onPick={(listing, vsComputer) => {
          remember(listing.id, vsComputer);
          setLoadError(null);
          setNotice(null);
          setPicked({ listing, round: ++rounds.current, vsComputer });
        }}
        saved={
          saved
            ? {
                title: saved.listing.title,
                turn: Math.max(0, ...saved.session.ui.log.map((e) => e.turn)),
                vsComputer: Boolean(saved.session.computer),
              }
            : null
        }
        savedProblem={problem ? sessionProblemHe(problem) : null}
        onResume={() => {
          // Read again: the battle may have gone on since the picker first looked.
          const back = resumeStored();
          if (!back) return;
          if ("problem" in back) {
            setNotice(back.problem);
            return;
          }
          const vsComputer = Boolean(back.resumed.ai);
          remember(back.listing.id, vsComputer, true);
          setLoadError(null);
          setNotice(null);
          setPicked({ listing: back.listing, round: ++rounds.current, vsComputer, resume: back.resumed });
        }}
        onLoadRecording={(file) => {
          // A recording made under other rules still opens: the debrief
          // says where it stops matching, so only a failure is said here.
          readRecording(file).then(
            ({ recording }) => {
              setLoadError(null);
              setReview(recording);
            },
            (err: unknown) => setLoadError(recordingLoadFailed(err)),
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
      vsComputer={picked.vsComputer}
      {...(picked.resume ? { resume: picked.resume } : {})}
      onSaved={markSaved}
      onLeave={() => {
        remember(null);
        setPicked(null);
      }}
    />
  );
}
