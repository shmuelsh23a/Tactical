import { useMemo, useState } from "react";
import {
  fitSoldiers,
  fullStrength,
  replayGame,
  replayWithOutcomes,
  type GameRecording,
} from "../engine/index.js";
import { MapView } from "./components/MapView.js";
import { describeAction, describeOutcome, recordingExtent, unitNames } from "./debriefText.js";
import { isGone } from "./hotseat.js";

/**
 * After-action review (תחקיר). Replays a saved battle and steps through it.
 *
 * The board is shown as the umpire saw it — both sides, no fog-of-war — since
 * the point of a debrief is to see what each side could not.
 *
 * State at step N is produced by replaying the first N actions from the seed
 * rather than by storing snapshots. That is cheap for the sizes a hotseat game
 * produces, and it keeps the debrief honest: what is on screen is what the
 * engine actually does with that recording.
 */
export function Debrief({
  recording,
  onClose,
}: {
  recording: GameRecording;
  onClose: () => void;
}) {
  const total = recording.actions.length;
  const [index, setIndex] = useState(total);

  const names = useMemo(() => unitNames(recording), [recording]);
  const extent = useMemo(() => recordingExtent(recording), [recording]);
  const game = useMemo(() => replayGame(recording, { upToAction: index }), [recording, index]);
  // Outcomes are fixed by the recording, so the whole battle is replayed once
  // for them; only the board state is re-derived per step.
  const steps = useMemo(() => replayWithOutcomes(recording).steps, [recording]);
  const outcomeAt = (i: number) => {
    const step = steps[i];
    return step ? describeOutcome(step.outcome, names) : "";
  };

  const units = game.units.filter((u) => !isGone(u));
  const last = index > 0 ? recording.actions[index - 1] : null;
  const noop = () => {};

  return (
    <div className="app">
      <header className="topbar">
        <h1>תחקיר קרב</h1>
        <div className="turn-info">
          <span>תור {game.turn}</span>
          <span className="sep">·</span>
          <span>
            פעולה {index} מתוך {total}
          </span>
          <span className="sep">·</span>
          <span>זרע {recording.seed}</span>
        </div>
        <button className="btn-ghost" onClick={onClose}>
          חזרה למשחק
        </button>
      </header>

      <div className="main">
        <div className="map-wrap">
          <MapView
            width={extent.width}
            height={extent.height}
            units={units}
            viewingSide="BLUE"
            selectedId={null}
            phase="other"
            moveCap={null}
            revealedEnemyIds={new Set(units.map((u) => u.id))}
            awaitingOrderIds={new Set()}
            assaultReach={null}
            smoke={game.smoke}
            pendingFire={game.pendingFire}
            pendingSmoke={game.pendingSmoke}
            mines={game.mines}
            onSelectUnit={noop}
            onFireAt={noop}
            onMoveTo={noop}
            onTargetAt={noop}
          />
        </div>

        <aside className="sidebar">
          <div className="panel">
            <h3>ניווט</h3>
            <div className="seg">
              <button onClick={() => setIndex(0)} disabled={index === 0}>
                התחלה
              </button>
              <button onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
                ← הקודם
              </button>
              <button
                onClick={() => setIndex((i) => Math.min(total, i + 1))}
                disabled={index === total}
              >
                הבא →
              </button>
              <button onClick={() => setIndex(total)} disabled={index === total}>
                סוף
              </button>
            </div>
            <input
              className="scrubber"
              type="range"
              min={0}
              max={total}
              value={index}
              onChange={(e) => setIndex(Number(e.target.value))}
            />
            <div className="unit-card">
              <div className="unit-name">
                {last ? describeAction(last, names) : "לפני תחילת הקרב"}
              </div>
              {index > 0 && outcomeAt(index - 1) && (
                <div className="outcome">{outcomeAt(index - 1)}</div>
              )}
              <div className="c2-line">שלב: {game.phase}</div>
            </div>

            <div className="roster">
              <h4>מצב הכוחות</h4>
              <ul>
                {game.units.map((u) => (
                  <li key={u.id} className={u.neutralized ? "dead" : ""}>
                    <span className={`chip chip-${u.side.toLowerCase()}`}>{u.side}</span> {u.name} —{" "}
                    {u.kind === "vehicle"
                      ? u.vehicle?.destroyed
                        ? "הושמד"
                        : u.vehicle?.mobilityKilled
                          ? "נכשל ניוד"
                          : "כשיר"
                      : `${fitSoldiers(u)}/${fullStrength(u)}`}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="log">
            <h3>יומן פעולות</h3>
            <ul>
              {recording.actions.map((action, i) => (
                <li
                  key={i}
                  className={`timeline-item ${i < index ? "done" : ""} ${
                    i === index - 1 ? "current" : ""
                  }`}
                  onClick={() => setIndex(i + 1)}
                >
                  <span className="log-turn">{i + 1}</span> {describeAction(action, names)}
                  {outcomeAt(i) && <div className="outcome">{outcomeAt(i)}</div>}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
