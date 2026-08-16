import { useMemo, useState } from "react";
import {
  fitSoldiers,
  fullStrength,
  replayGame,
  verifyRecording,
  type GameRecording,
  type Side,
} from "../engine/index.js";
import { MapView, orderOverlay } from "./components/MapView.js";
import {
  describeAction,
  describeOutcome,
  recordingExtent,
  unitNames,
  type Lens,
} from "./debriefText.js";
import {
  actionVisibleTo,
  lensFor,
  lessonsFor,
  outcomeVisibleTo,
  replayForReview,
  unitSides,
  UMPIRE_LENS,
  type Viewpoint,
} from "./debriefView.js";
import { isGone, sideView } from "./hotseat.js";
import { spread, whatIf, type WhatIf } from "./whatIf.js";

/** How many alternate battles a re-roll fights. Cheap: a battle replays in ms. */
const RUNS = 20;

/** "אף פעם" / "פעם אחת" / "3 פעמים" — a count of occasions, in readable Hebrew. */
function times(n: number): string {
  if (n === 0) return "אף פעם";
  return n === 1 ? "פעם אחת" : `${n} פעמים`;
}

/**
 * After-action review (תחקיר). Replays a saved battle and steps through it.
 *
 * The board can be shown as the umpire saw it — both sides, no fog-of-war —
 * or **as one side saw it**: its own forces, the enemy only where it had been
 * detected, and a timeline with the enemy's decisions taken out of it
 * (backlog item 14; see [`debriefView.ts`](./debriefView.ts)). The point of a
 * per-side review is to see what that side could *not*, so it must not teach
 * the reader anything they never observed.
 *
 * State at step N is produced by replaying the first N actions from the seed
 * rather than by storing snapshots. That is cheap for the sizes a hotseat game
 * produces, and it keeps the debrief honest: what is on screen is what the
 * engine actually does with that recording — the contact ledger included.
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
  const [viewpoint, setViewpoint] = useState<Viewpoint>("umpire");
  /**
   * Lift the veil on a side's review. The debrief is meant to be read blind
   * first — as the side fought it — and only then compared with what was
   * actually there, which is where it teaches (rules decision 13).
   */
  const [showTruth, setShowTruth] = useState(false);
  /** The same decisions re-fought under other dice, once the reader asks. */
  const [rolls, setRolls] = useState<WhatIf | null>(null);

  const names = useMemo(() => unitNames(recording), [recording]);
  const sides = useMemo(() => unitSides(recording), [recording]);
  const extent = useMemo(() => recordingExtent(recording), [recording]);
  const game = useMemo(() => replayGame(recording, { upToAction: index }), [recording, index]);
  // Outcomes and the contact ledger are fixed by the recording, so the whole
  // battle is replayed once for both; only the board state is re-derived per
  // step.
  const { steps, contactsAfter } = useMemo(() => replayForReview(recording), [recording]);
  // A recording carries fingerprints of the state it produced when it was made.
  // If replay no longer matches them, the rules have moved under it — the
  // decisions still replay, but this is no longer the battle that was fought.
  const drift = useMemo(() => verifyRecording(recording), [recording]);

  /** A recording played without the knowledge model has no per-side picture. */
  const perSidePossible = game.trackIntel;
  const side: Side | null = viewpoint === "umpire" ? null : viewpoint;

  const lensAt = (i: number): Lens =>
    side ? lensFor(side, i, contactsAfter, sides) : UMPIRE_LENS;

  /**
   * One timeline row. `hidden` marks a step this side never saw: it is dropped
   * from the review unless the truth is showing, where it is what the reader is
   * meant to learn. `truth` is the umpire's version of an outcome the side was
   * told less of.
   */
  const rowAt = (i: number) => {
    const action = recording.actions[i];
    const step = steps[i];
    if (!action || !step) return null;
    const lens = lensAt(i);
    const full = describeOutcome(step.outcome, names, UMPIRE_LENS, action);
    const row = (hidden: boolean, outcome: string) => ({
      text: describeAction(action, names),
      outcome,
      truth: full && full !== outcome ? full : "",
      hidden,
    });

    if (!side) return row(false, full);
    if (!actionVisibleTo(action, side, lens, sides)) return row(true, "");
    const outcome = outcomeVisibleTo(action, side, sides, lens)
      ? describeOutcome(step.outcome, names, lens, action)
      : "";
    // An enemy step whose every line was redacted is not a step this side saw.
    if (action.kind === "executeStandingOrders" && action.side !== side && !outcome) {
      return row(true, "");
    }
    return row(false, outcome);
  };

  const lessons = side ? lessonsFor(side, index, steps, contactsAfter, sides) : null;
  // The re-roll is the umpire's answer, so a side's review only gets it once
  // the truth is up — read the battle as you fought it first.
  const mayReroll = !side || showTruth;
  const nameOf = (id: string) => names.get(id) ?? id;

  // The board: ground truth for the umpire, the side's own picture otherwise.
  const view = side ? sideView(game, side) : null;
  const units = view ? view.units : game.units.filter((u) => !isGone(u));
  const staleIds = view ? view.staleIds : new Set<string>();
  const orderOwners = side ? game.units.filter((u) => u.side === side) : game.units;
  const last = index > 0 ? rowAt(index - 1) : null;
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

      {drift.checked && !drift.ok && (
        <div className="drift-banner">
          ההקלטה נוצרה תחת חוקים שהשתנו מאז — התוצאות מתפצלות החל מפעולה{" "}
          {(drift.firstDivergence?.index ?? 0) + 1}
          {drift.firstDivergence ? ` (${describeAction(drift.firstDivergence.action, names)})` : ""}.
          ההחלטות משוחזרות כרגיל; מה שהשתנה הוא התוצאה.
        </div>
      )}

      <div className="main">
        <div className="map-wrap">
          <MapView
            width={extent.width}
            height={extent.height}
            units={units}
            viewingSide={side ?? "BLUE"}
            // The umpire is the one reader entitled to see both sides' arcs.
            allSectors={side == null}
            selectedId={null}
            phase="other"
            moveCap={null}
            staleContactIds={staleIds}
            awaitingOrderIds={new Set()}
            assaultReach={null}
            smoke={game.smoke}
            pendingFire={side ? game.pendingFire.filter((m) => m.side === side) : game.pendingFire}
            pendingSmoke={
              side ? game.pendingSmoke.filter((m) => m.side === side) : game.pendingSmoke
            }
            mines={side ? game.mines.filter((m) => m.side === side || m.detected) : game.mines}
            standingOrders={orderOwners.flatMap((u) =>
              orderOverlay(game.standingOrderFor(u.id), u, units),
            )}
            onSelectUnit={noop}
            onFireAt={noop}
            onMoveTo={noop}
            onTargetAt={noop}
          />
        </div>

        <aside className="sidebar">
          <div className="panel">
            <h3>נקודת מבט</h3>
            <div className="seg">
              <button
                className={viewpoint === "umpire" ? "on" : ""}
                onClick={() => setViewpoint("umpire")}
              >
                מנחה
              </button>
              {(["BLUE", "RED"] as Side[]).map((s) => (
                <button
                  key={s}
                  className={viewpoint === s ? "on" : ""}
                  disabled={!perSidePossible}
                  title={
                    perSidePossible ? undefined : "ההקלטה נוצרה ללא מודל ידיעה — רק תצוגת מנחה"
                  }
                  onClick={() => setViewpoint(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="hint">
              {side
                ? "הקרב כפי שצד זה ראה אותו: כוחותיו, אויב רק היכן שזוהה, ורק פעולות שנצפו."
                : "תמונת המנחה: שני הצדדים וכל התוצאות."}
            </p>

            {side && (
              <>
                <button
                  className={`btn-ghost${showTruth ? " on" : ""}`}
                  onClick={() => setShowTruth((t) => !t)}
                  title="קרא קודם את הקרב כפי שהצד ראה אותו, ורק אז השווה למה שהיה שם באמת"
                >
                  {showTruth ? "הסתר את תמונת המנחה" : "חשוף את תמונת המנחה"}
                </button>

                {lessons && (
                  <div className="unit-card lessons">
                    <div className="unit-name">לקחים עד כאן</div>
                    <div className={lessons.neverDetected.length ? "warn" : "ok"}>
                      כוחות אויב שלא זוהו: {lessons.neverDetected.length}
                      {showTruth && lessons.neverDetected.length
                        ? ` — ${lessons.neverDetected.map(nameOf).join(", ")}`
                        : ""}
                    </div>
                    <div className={lessons.hitByUnseen ? "warn" : "ok"}>
                      ספג אש מכוח שלא זוהה: {times(lessons.hitByUnseen)}
                    </div>
                    <div className={lessons.firedUnseen ? "warn" : "ok"}>
                      ירה על מטרה שלא היתה בקשר עין: {times(lessons.firedUnseen)}
                    </div>
                    <div className="c2-line">נפגעים שספג: {lessons.suffered}</div>
                    <div className="c2-line">
                      נפגעים שגרם:{" "}
                      {showTruth ? lessons.inflicted : <span className="muted">גלוי בתמונת המנחה</span>}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

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
                {!last
                  ? "לפני תחילת הקרב"
                  : last.hidden && !showTruth
                    ? "פעולה שצד זה לא ראה"
                    : last.text}
              </div>
              {last?.outcome && <div className="outcome">{last.outcome}</div>}
              {showTruth && last?.truth && <div className="truth">מנחה: {last.truth}</div>}
              <div className="c2-line">שלב: {game.phase}</div>
            </div>

            <div className="roster">
              <h4>{side ? "תמונת המצב של הצד" : "מצב הכוחות"}</h4>
              <ul>
                {units.map((u) => (
                  <li key={u.id} className={u.neutralized ? "dead" : ""}>
                    <span className={`chip chip-${u.side.toLowerCase()}`}>{u.side}</span> {u.name} —{" "}
                    {side && u.side !== side ? (
                      // A contact is a report: this side knows a force is there,
                      // not how many of them are still standing.
                      <span className="muted">{staleIds.has(u.id) ? "דיווח קודם" : "מזוהה"}</span>
                    ) : u.kind === "vehicle" ? (
                      u.vehicle?.destroyed
                        ? "הושמד"
                        : u.vehicle?.mobilityKilled
                          ? "נכשל ניוד"
                          : "כשיר"
                    ) : (
                      `${fitSoldiers(u)}/${fullStrength(u)}`
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {mayReroll && (
            <div className="panel">
              <h3>תוכנית או מזל?</h3>
              <p className="hint">
                אותן ההחלטות, קוביות אחרות. אף אחד לא משחק מחדש — ההקלטה שומרת מה
                הוחלט, והתוצאות נגזרות מחדש בכל הרצה.
              </p>
              <button className="btn-ghost" onClick={() => setRolls(whatIf(recording, RUNS))}>
                {rolls ? `הרץ שוב (${RUNS} הרצות)` : `הרץ ${RUNS} פעמים`}
              </button>
              {rolls && <WhatIfTable result={rolls} runs={RUNS} />}
            </div>
          )}

          <div className="log">
            <h3>יומן פעולות</h3>
            <ul>
              {recording.actions.map((_, i) => {
                const row = rowAt(i);
                if (!row || (row.hidden && !showTruth)) return null;
                return (
                  <li
                    key={i}
                    className={`timeline-item ${i < index ? "done" : ""} ${
                      i === index - 1 ? "current" : ""
                    } ${row.hidden ? "unseen" : ""}`}
                    onClick={() => setIndex(i + 1)}
                  >
                    <span className="log-turn">{i + 1}</span> {row.text}
                    {row.outcome && <div className="outcome">{row.outcome}</div>}
                    {showTruth && row.truth && <div className="truth">מנחה: {row.truth}</div>}
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * The spread of a plan across its re-rolls. Losses are the umpire's tally by
 * definition — this is a question about the battle, not about what a side
 * observed — and skipped decisions are reported because a run that could not
 * carry the plan out is not a fair comparison (see [`whatIf.ts`](./whatIf.ts)).
 */
function WhatIfTable({ result, runs }: { result: WhatIf; runs: number }) {
  const sides: Side[] = ["BLUE", "RED"];
  const skipped = result.runs.reduce((n, r) => n + r.skipped, 0);
  return (
    <div className="unit-card lessons">
      <div className="unit-name">{runs} הרצות של אותה תוכנית</div>
      {sides.map((side) => {
        const losses = spread(result.runs.map((r) => r.losses[side]));
        const broken = result.runs.filter((r) => r.broken.includes(side)).length;
        return (
          <div key={side} className="c2-line">
            <span className={`chip chip-${side.toLowerCase()}`}>{side}</span> נפגעים{" "}
            {losses.min}–{losses.max} (חציון {losses.median}) · בפועל{" "}
            {result.actual.losses[side]} · נשבר ב-{broken} מתוך {runs}
          </div>
        );
      })}
      <div className={skipped ? "warn" : "ok"}>
        {skipped
          ? `${skipped} החלטות לא ניתנות לביצוע בהיסטוריות החלופיות — ההשוואה חלקית`
          : "כל ההחלטות בוצעו בכל ההרצות"}
      </div>
    </div>
  );
}
