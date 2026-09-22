import type { ScenarioListing } from "../scenario.js";

interface ScenarioPickerProps {
  scenarios: readonly ScenarioListing[];
  onPick: (scenario: ScenarioListing) => void;
}

/** "900 × 800 מ'", or in kilometres once a side reaches one. */
function extent(width: number, height: number): string {
  if (Math.max(width, height) < 1000) return `${width} × ${height} מ'`;
  const km = (m: number) => (m / 1000).toLocaleString("he-IL", { maximumFractionDigits: 1 });
  return `${km(width)} × ${km(height)} ק"מ`;
}

/**
 * The screen the app opens on: which battle to fight. Nothing on it belongs to
 * a side — both players read it before either has taken one — so a card shows
 * the spec's title, its brief and the size of the ground, and no more.
 */
export function ScenarioPicker({ scenarios, onPick }: ScenarioPickerProps) {
  return (
    <div className="picker">
      <h1>בחירת תרחיש</h1>
      <ul className="picker-list">
        {scenarios.map((s) => (
          <li key={s.id}>
            <button className="picker-card" onClick={() => onPick(s)}>
              <h2>{s.title}</h2>
              <p>{s.brief}</p>
              <span className="picker-extent">{extent(s.mapWidth, s.mapHeight)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
