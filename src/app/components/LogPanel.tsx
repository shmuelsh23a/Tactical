import type { LogEntry } from "../hotseat.js";

export function LogPanel({ log }: { log: LogEntry[] }) {
  return (
    <div className="log">
      <h3>יומן קרב</h3>
      <ul>
        {log.slice().reverse().map((e) => (
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
