import type { Side } from "../../engine/index.js";
import { readableBy, type LogEntry } from "../hotseat.js";

/**
 * The live combat log, **as the side at the screen is entitled to read it**
 * (rules decision 17).
 *
 * Both players read this one list across a handoff — the handoff screen covers
 * the map, not the sidebar — so an entry's `side` is a colour chip and
 * `readers` is the filter. Everything a side may not read was never written for
 * it: `pushLog` decides that once, at the moment the line is made.
 *
 * `reader` is `null` while nobody has claimed the screen — during a handoff and
 * on the initiative panel — and then only the table's own lines are drawn. The
 * player holding the device at a handoff is the side going *out*, not the
 * `viewingSide` the rest of the sidebar is already showing.
 */
export function LogPanel({ log, reader }: { log: LogEntry[]; reader: Side | null }) {
  const mine = log.filter((e) => readableBy(e, reader));
  return (
    <div className="log">
      <h3>יומן קרב</h3>
      <ul>
        {mine.slice().reverse().map((e) => (
          <li key={e.id} className={`log-${e.kind}`}>
            <span className="log-turn">T{e.turn}</span>{" "}
            {e.side && <span className={`chip chip-${e.side.toLowerCase()}`}>{e.side}</span>}{" "}
            {e.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
