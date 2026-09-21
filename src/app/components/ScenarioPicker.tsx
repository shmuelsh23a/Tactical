import { useState } from "react";
import type { ScenarioEntry } from "../scenarios/types.js";

interface ScenarioPickerProps {
  /** Every battle the app can open — the catalogue in `scenario.ts`. */
  scenarios: readonly ScenarioEntry[];
  currentId: string;
  /**
   * Whether a battle is already being fought. Choosing another throws this one
   * away, so while this is on the pick is confirmed before it is made.
   */
  underWay: boolean;
  onPick: (id: string) => void;
}

/**
 * Choosing which battle to play.
 *
 * Every scenario is generated from a spec, so a second battle has been a file
 * rather than a feature for some time — what was missing was anywhere to say
 * which one. Each is listed by its Hebrew title and the one line its spec
 * carries about what its ground asks of the player, because the choice being
 * offered is between two pieces of ground and not between two names.
 *
 * A battle in progress cannot be resumed once another is opened — the engine
 * is rebuilt from the new scenario — so the confirmation says so, and points
 * at the recording as the way to keep it.
 */
export function ScenarioPicker({ scenarios, currentId, underWay, onPick }: ScenarioPickerProps) {
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const pending = scenarios.find((s) => s.id === pendingId) ?? null;

  function close() {
    setOpen(false);
    setPendingId(null);
  }

  function choose(entry: ScenarioEntry) {
    if (entry.id === currentId) {
      close();
      return;
    }
    if (underWay) {
      setPendingId(entry.id);
      return;
    }
    close();
    onPick(entry.id);
  }

  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)} title="בחירת הקרב שייפתח">
        בחר קרב
      </button>

      {open && (
        <div className="scenario-overlay" onClick={close}>
          {/* The card swallows the click so only the backdrop closes it. */}
          <div className="scenario-card" onClick={(e) => e.stopPropagation()}>
            <h2>בחר קרב</h2>
            <ul className="scenario-list">
              {scenarios.map((s) => (
                <li key={s.id}>
                  <button
                    className={`scenario-option${s.id === currentId ? " current" : ""}`}
                    onClick={() => choose(s)}
                  >
                    <span className="scenario-title">{s.title}</span>
                    <span className="scenario-brief">{s.brief}</span>
                    {s.id === currentId && <span className="scenario-now">הקרב הנוכחי</span>}
                  </button>
                </li>
              ))}
            </ul>

            {pending && (
              <div className="scenario-confirm">
                <p>
                  לפתוח את <strong>{pending.title}</strong>? הקרב הנוכחי נמחק ואי אפשר לחזור אליו.
                  אם ברצונך לתחקר אותו, שמור הקלטה לפני שתחליף.
                </p>
                <div className="scenario-confirm-actions">
                  <button className="btn-primary" onClick={() => { close(); onPick(pending.id); }}>
                    פתח קרב חדש
                  </button>
                  <button className="btn-ghost" onClick={() => setPendingId(null)}>
                    ביטול
                  </button>
                </div>
              </div>
            )}

            <button className="btn-ghost scenario-close" onClick={close}>
              סגור
            </button>
          </div>
        </div>
      )}
    </>
  );
}
