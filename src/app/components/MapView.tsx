import React, { useRef } from "react";
import type { Side, Unit } from "../../engine/index.js";
import { renderUnitSymbol } from "../symbols.js";

interface MapViewProps {
  width: number;
  height: number;
  units: Unit[];
  viewingSide: Side;
  selectedId: string | null;
  phase: "movement" | "combat" | "other";
  /** Movement range circle radius (metres) for the selected unit, if moving. */
  moveCap: number | null;
  revealedEnemyIds: Set<string>;
  onSelectUnit: (id: string) => void;
  onFireAt: (id: string) => void;
  onMoveTo: (x: number, y: number) => void;
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
    if (phase !== "movement" || !selected || selected.side !== viewingSide) return;
    const svg = svgRef.current;
    if (!svg) return;
    const m = clientToMap(svg, e.clientX, e.clientY);
    if (m) props.onMoveTo(m.x, m.y);
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

      {units.map((u) => (
        <Token
          key={u.id}
          unit={u}
          viewingSide={viewingSide}
          selected={u.id === selectedId}
          phase={phase}
          onSelectUnit={props.onSelectUnit}
          onFireAt={props.onFireAt}
        />
      ))}
    </svg>
  );
}

interface TokenProps {
  unit: Unit;
  viewingSide: Side;
  selected: boolean;
  phase: "movement" | "combat" | "other";
  onSelectUnit: (id: string) => void;
  onFireAt: (id: string) => void;
}

function Token({ unit, viewingSide, selected, phase, onSelectUnit, onFireAt }: TokenProps) {
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
