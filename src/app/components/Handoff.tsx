import type { Side } from "../../engine/index.js";

interface HandoffProps {
  side: Side;
  phaseLabel: string;
  onReady: () => void;
}

/**
 * Full-screen hotseat handoff: hides the board so the previous player's view
 * (and their fog-of-war) isn't leaked to the next player picking up the device.
 */
export function Handoff({ side, phaseLabel, onReady }: HandoffProps) {
  return (
    <div className={`handoff handoff-${side.toLowerCase()}`}>
      <div className="handoff-card">
        <div className={`chip chip-${side.toLowerCase()} chip-lg`}>{side}</div>
        <h2>העבר את המכשיר לצד {side}</h2>
        <p>{phaseLabel}</p>
        <button className="btn-primary" onClick={onReady}>
          {side} מוכן — הצג את המפה
        </button>
      </div>
    </div>
  );
}
