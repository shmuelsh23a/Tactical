import ms from "milsymbol";
import type { Echelon, Unit } from "../engine/index.js";
import { fitSoldiers, fullStrength } from "../engine/index.js";

/** APP-6/2525C echelon code (SIDC position 11). */
function echelonCode(echelon: Echelon): string {
  switch (echelon) {
    case "squad":
      return "B";
    case "platoon":
      return "D";
    case "company":
      return "E";
    case "battalion":
      return "F";
    case "brigade":
      return "H";
    default:
      return "-";
  }
}

/**
 * Build a 15-character SIDC for a unit. Affiliation is fixed by the unit's
 * **own side** so factions keep a consistent colour no matter who is viewing:
 * BLUE always renders as a friend (blue), RED always as hostile (red).
 */
export function buildSidc(unit: Unit): string {
  const affiliation = unit.side === "BLUE" ? "F" : "H";
  const fn = unit.kind === "vehicle" ? "UCA" : "UCI"; // armour vs infantry
  const ech = echelonCode(unit.echelon);
  // S | affiliation | G(ground) P(present) | function(3) | --- | echelon | ----
  return `S${affiliation}GP${fn}---${ech}----`;
}

export interface RenderedSymbol {
  dataUrl: string;
  width: number;
  height: number;
  anchor: { x: number; y: number };
}

/** Render a unit to a vector (SVG) NATO symbol as a data URL. */
export function renderUnitSymbol(unit: Unit, size = 30): RenderedSymbol {
  const sidc = buildSidc(unit);
  const strength = unit.kind === "infantry"
    ? `${fitSoldiers(unit)}/${fullStrength(unit)}`
    : unit.vehicle?.destroyed
      ? "KO"
      : unit.vehicle?.mobilityKilled
        ? "M-KILL"
        : "";

  const symbol = new ms.Symbol(sidc, {
    size,
    uniqueDesignation: unit.name,
    additionalInformation: unit.neutralized ? "NEUTRALISED" : strength,
    // milsymbol renders standard-identity colours; keep defaults.
  });

  const svg = symbol.asSVG();
  const dataUrl = "data:image/svg+xml;base64," + base64Unicode(svg);
  const { width, height } = symbol.getSize();
  const anchor = symbol.getAnchor();
  return { dataUrl, width, height, anchor: { x: anchor.x, y: anchor.y } };
}

/** UTF-8 safe base64 (handles Hebrew unit names). */
function base64Unicode(str: string): string {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16)),
    ),
  );
}
