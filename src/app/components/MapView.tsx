import React, { useRef } from "react";
import type {
  Mine,
  Point,
  PendingFireMission,
  PendingSmokeMission,
  Side,
  SmokeScreen,
  Unit,
} from "../../engine/index.js";
import type { ActivationPhase } from "../hotseat.js";
import { renderUnitSymbol } from "../symbols.js";

interface MapViewProps {
  width: number;
  height: number;
  units: Unit[];
  viewingSide: Side;
  selectedId: string | null;
  phase: ActivationPhase | "other";
  /** Movement range circle radius (metres) for the selected unit, if moving. */
  moveCap: number | null;
  revealedEnemyIds: Set<string>;
  /** Friendly forces that cannot manoeuvre this turn for want of orders (C2). */
  awaitingOrderIds: Set<string>;
  /** Assault reach (metres) to ring the selected force with, when assaulting. */
  assaultReach: number | null;
  /** Smoke screens on the map — physical, so both sides see them. */
  smoke: readonly SmokeScreen[];
  /** The viewing side's own marked fire missions, awaiting impact. */
  pendingFire: readonly PendingFireMission[];
  /** The viewing side's own smoke screens, still in flight. */
  pendingSmoke: readonly PendingSmokeMission[];
  /** Charges this side knows about: its own, plus any enemy ones it has found. */
  mines: readonly Mine[];
  /** Where this side's forces have been ordered to — its own orders only. */
  standingOrders: readonly { from: Point; to: Point; unitId: string }[];
  onSelectUnit: (id: string) => void;
  onFireAt: (id: string) => void;
  onMoveTo: (x: number, y: number) => void;
  onTargetAt: (x: number, y: number) => void;
}

function clientToMap(svg: SVGSVGElement, clientX: number, clientY: number) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

export function MapView(props: MapViewProps) {
  const { width, height, units, viewingSide, selectedId, phase, moveCap } = props;
  const svgRef = useRef<SVGSVGElement>(null);

  const selected = units.find((u) => u.id === selectedId) ?? null;

  function handleBackgroundClick(e: React.MouseEvent) {
    const svg = svgRef.current;
    if (!svg) return;
    const m = clientToMap(svg, e.clientX, e.clientY);
    if (!m) return;
    if (phase === "targeting") {
      props.onTargetAt(m.x, m.y);
    } else if (phase === "movement" && selected && selected.side === viewingSide) {
      props.onMoveTo(m.x, m.y);
    }
  }

  // 100 m reference grid.
  const gridLines: React.ReactNode[] = [];
  for (let x = 0; x <= width; x += 100) {
    gridLines.push(<line key={`vx${x}`} x1={x} y1={0} x2={x} y2={height} className="grid" />);
  }
  for (let y = 0; y <= height; y += 100) {
    gridLines.push(<line key={`hy${y}`} x1={0} y1={y} x2={width} y2={y} className="grid" />);
  }

  return (
    <svg
      ref={svgRef}
      className="map"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      onClick={handleBackgroundClick}
    >
      <rect x={0} y={0} width={width} height={height} className="map-bg" />
      <g>{gridLines}</g>

      {/* Movement range for the selected friendly unit. */}
      {phase === "movement" && selected && selected.side === viewingSide && moveCap != null && (
        <circle
          cx={selected.position.x}
          cy={selected.position.y}
          r={moveCap}
          className="move-range"
        />
      )}

      {/* Where each force has been ordered to, and how far it still has to go. */}
      {props.standingOrders.map((o) => (
        <g key={o.unitId} className="order-line">
          <line x1={o.from.x} y1={o.from.y} x2={o.to.x} y2={o.to.y} />
          <circle cx={o.to.x} cy={o.to.y} r={8} />
        </g>
      ))}

      {/* How far the selected force can press an assault home. */}
      {phase === "combat" && selected && selected.side === viewingSide && props.assaultReach != null && (
        <circle
          cx={selected.position.x}
          cy={selected.position.y}
          r={props.assaultReach}
          className="assault-range"
        />
      )}

      {/* Marked aim points, own side only — an enemy sees nothing until it lands.
          Smoke shows the screen it will become, so it can be sited on a line. */}
      {props.pendingFire.map((m) => (
        <AimPoint key={m.id} at={m.target} turn={m.resolvesOnTurn} />
      ))}
      {props.pendingSmoke.map((m) => (
        <AimPoint key={m.id} at={m.target} turn={m.resolvesOnTurn} radius={m.radius} smoke />
      ))}

      {/* Known charges: an anti-personnel one as a disc, anti-tank as a wedge. */}
      {props.mines.map((m) => (
        <g key={m.id} className={`mine mine-${m.type === "antiTank" ? "at" : "ap"}`}>
          {m.type === "antiTank" ? (
            <polygon
              points={`${m.position.x},${m.position.y - 9} ${m.position.x - 9},${m.position.y + 7} ${m.position.x + 9},${m.position.y + 7}`}
            />
          ) : (
            <circle cx={m.position.x} cy={m.position.y} r={7} />
          )}
        </g>
      ))}

      {units.map((u) => (
        <Token
          key={u.id}
          unit={u}
          viewingSide={viewingSide}
          selected={u.id === selectedId}
          phase={phase}
          awaitingOrders={props.awaitingOrderIds.has(u.id)}
          onSelectUnit={props.onSelectUnit}
          onFireAt={props.onFireAt}
        />
      ))}

      {/* Smoke obscures what is under it, so it is drawn last — but it never
          swallows a click (pointer-events: none), so tokens stay selectable. */}
      {props.smoke.map((s) => (
        <circle key={s.id} cx={s.center.x} cy={s.center.y} r={s.radius} className="smoke" />
      ))}
    </svg>
  );
}

/** A marked aim point awaiting impact, with the turn it lands. */
function AimPoint({
  at,
  turn,
  radius,
  smoke = false,
}: {
  at: { x: number; y: number };
  turn: number;
  radius?: number;
  smoke?: boolean;
}) {
  return (
    <g className={`aim-point${smoke ? " aim-smoke" : ""}`}>
      {radius != null && <circle cx={at.x} cy={at.y} r={radius} className="aim-footprint" />}
      <circle cx={at.x} cy={at.y} r={18} />
      <line x1={at.x - 26} y1={at.y} x2={at.x + 26} y2={at.y} />
      <line x1={at.x} y1={at.y - 26} x2={at.x} y2={at.y + 26} />
      <text x={at.x + 30} y={at.y - 8}>
        {smoke ? "עשן" : ""} תור {turn}
      </text>
    </g>
  );
}

interface TokenProps {
  unit: Unit;
  viewingSide: Side;
  selected: boolean;
  phase: ActivationPhase | "other";
  awaitingOrders: boolean;
  onSelectUnit: (id: string) => void;
  onFireAt: (id: string) => void;
}

function Token({
  unit,
  viewingSide,
  selected,
  phase,
  awaitingOrders,
  onSelectUnit,
  onFireAt,
}: TokenProps) {
  const sym = renderUnitSymbol(unit, 30);
  const friendly = unit.side === viewingSide;

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (friendly) {
      onSelectUnit(unit.id);
    } else if (phase === "combat") {
      onFireAt(unit.id);
    }
  }

  const cls = [
    "token",
    friendly ? "token-friendly" : "token-enemy",
    selected ? "token-selected" : "",
    unit.neutralized ? "token-neutralised" : "",
    awaitingOrders ? "token-no-orders" : "",
    !friendly && phase === "combat" ? "token-targetable" : "",
  ].join(" ");

  // APP-6 headquarters staff: a vertical stave from the lower-left of the
  // frame; the unit's true location is the foot of the staff.
  const isHq = unit.kind === "command";
  const left = unit.position.x - sym.width / 2;
  const bottom = unit.position.y + sym.height / 2;

  return (
    <g className={cls} onClick={handleClick}>
      {selected && (
        <circle cx={unit.position.x} cy={unit.position.y} r={22} className="selection-ring" />
      )}
      {/* Awaiting orders from the חפ"ק — cannot manoeuvre this turn. */}
      {awaitingOrders && (
        <circle cx={unit.position.x} cy={unit.position.y} r={26} className="no-orders-ring" />
      )}
      {isHq && (
        <line x1={left} y1={bottom} x2={left} y2={bottom + 16} className="hq-staff" />
      )}
      <image
        href={sym.dataUrl}
        x={unit.position.x - sym.anchor.x}
        y={unit.position.y - sym.anchor.y}
        width={sym.width}
        height={sym.height}
      />
    </g>
  );
}
