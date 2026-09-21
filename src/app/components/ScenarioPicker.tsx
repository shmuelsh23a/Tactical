import { useEffect, useRef, useState } from "react";
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstOptionRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    setPendingId(null);
  }

  // Escape closes it, the same as clicking away — a modal that can only be
  // dismissed with the mouse is one a keyboard cannot get out of. It cancels
  // a pending switch with it, which is the safe direction: the battle stays.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      setPendingId(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Opening moves focus into the card and closing hands it back to the button
  // that opened it, so tabbing does not carry on behind the overlay. The
  // `hasOpened` guard is the whole reason this is not two lines: without it
  // the effect also runs on mount, where `open` is false, and the header
  // button would take focus off the page the moment the game loaded.
  const hasOpened = useRef(false);
  useEffect(() => {
    if (open) {
      hasOpened.current = true;
      firstOptionRef.current?.focus();
    } else if (hasOpened.current) {
      triggerRef.current?.focus();
    }
  }, [open]);

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
      <button
        ref={triggerRef}
        className="btn-ghost"
        onClick={() => setOpen(true)}
        title="בחירת הקרב שייפתח"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        בחר קרב
      </button>

      {open && (
        <div className="scenario-overlay" onClick={close}>
          {/* The card swallows the click so only the backdrop closes it. */}
          <div
            className="scenario-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="בחירת קרב"
          >
            <h2>בחר קרב</h2>
            <ul className="scenario-list">
              {scenarios.map((s, i) => (
                <li key={s.id}>
                  <button
                    ref={i === 0 ? firstOptionRef : undefined}
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
