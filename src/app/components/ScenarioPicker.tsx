import { useState } from "react";
import type { ScenarioListing } from "../scenario.js";

interface ScenarioPickerProps {
  scenarios: readonly ScenarioListing[];
  /** The battle, and whether it is played against the computer rather than by two at one screen. */
  onPick: (scenario: ScenarioListing, vsComputer: boolean) => void;
  /** The battle in progress saved in this browser, to pick up again; null when there is none. */
  saved: { title: string; turn: number; vsComputer: boolean } | null;
  onResume: () => void;
  /** A saved battle to review instead of fighting one. */
  onLoadRecording: (file: File) => void;
  /** Why the last file could not be reviewed, if it could not. */
  loadError: string | null;
}

/** "900 × 800 מ'", or in kilometres once a side reaches one. */
function extent(width: number, height: number): string {
  if (Math.max(width, height) < 1000) return `${width} × ${height} מ'`;
  const km = (m: number) => (m / 1000).toLocaleString("he-IL", { maximumFractionDigits: 1 });
  return `${km(width)} × ${km(height)} ק"מ`;
}

/**
 * The screen the app opens on: which battle to fight, or a saved one to
 * review. Nothing on it belongs to a side — both players read it before either
 * has taken one — so a card shows the spec's title, its brief and the size of
 * the ground, and no more.
 *
 * Who plays is chosen here too: two players passing one screen, or one
 * against the computer, which takes the side that is not attacking.
 *
 * A recording needs no battle picked first: it carries its own ground, and
 * the debrief chooses whose eyes to read it through.
 */
export function ScenarioPicker({ scenarios, onPick, saved, onResume, onLoadRecording, loadError }: ScenarioPickerProps) {
  const [vsComputer, setVsComputer] = useState(false);
  return (
    <div className="picker">
      <h1>בחירת תרחיש</h1>
      {saved && (
        <button className="picker-card picker-resume" onClick={onResume}>
          <h2>המשך קרב שמור</h2>
          <p>
            {saved.title} — {saved.turn > 0 ? `תור ${saved.turn}` : "תכנון משימה"}
            {saved.vsComputer ? " · מול המחשב" : " · שני שחקנים"}
          </p>
        </button>
      )}
      <div className="picker-mode seg">
        <button className={vsComputer ? "" : "on"} onClick={() => setVsComputer(false)}>
          שני שחקנים במחשב אחד
        </button>
        <button className={vsComputer ? "on" : ""} onClick={() => setVsComputer(true)}>
          מול המחשב (אתה התוקף)
        </button>
      </div>
      <ul className="picker-list">
        {scenarios.map((s) => (
          <li key={s.id}>
            <button className="picker-card" onClick={() => onPick(s, vsComputer)}>
              <h2>{s.title}</h2>
              <p>{s.brief}</p>
              <span className="picker-extent">{extent(s.mapWidth, s.mapHeight)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="picker-review">
        <label className="btn-ghost" title="טעינת הקלטה שמורה לתחקיר">
          טען לתחקיר
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // allow re-loading the same file
              if (file) onLoadRecording(file);
            }}
          />
        </label>
        {loadError && <p className="picker-error">{loadError}</p>}
      </div>
    </div>
  );
}
