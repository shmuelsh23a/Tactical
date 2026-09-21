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

/**
 * The line milsymbol writes beside the frame: a force's strength, or what is
 * left of a vehicle, or that it has been neutralised.
 *
 * Its own function because the cache below keys on it. Computing it twice —
 * once for the key and once for the symbol — is exactly the shape of bug this
 * project keeps finding: one rule applied in two places off different state.
 */
function additionalInformation(unit: Unit): string {
  if (unit.neutralized) return "NEUTRALISED";
  if (unit.kind === "infantry") return `${fitSoldiers(unit)}/${fullStrength(unit)}`;
  if (unit.vehicle?.destroyed) return "KO";
  if (unit.vehicle?.mobilityKilled) return "M-KILL";
  return "";
}

/**
 * How many rendered symbols to keep. A battle draws one per force per distinct
 * strength, so a platoon fits in a few dozen; the cap is for the long tail —
 * several battles opened in a row, or an echelon larger than the current slice.
 */
export const SYMBOL_CACHE_MAX = 256;

/**
 * Rendered symbols, keyed by everything the drawing is made of.
 *
 * `Token` calls this on every render of every token, and every state change
 * re-renders them all — so without this, a squad losing nobody still pays for
 * a fresh `ms.Symbol`, an SVG serialisation and a base64 round-trip over a
 * Hebrew name, per force, per click.
 *
 * **Keyed by value, not by the unit.** The engine is imperative and mutates a
 * force in place, so the same `Unit` object is the same reference before and
 * after it takes casualties. Anything keyed on identity — a `React.memo` on
 * `Token`, a `WeakMap` on the unit — would freeze the symbol at its old
 * strength and draw 8/8 over a squad that has lost three men. The key is
 * therefore the four values the render actually reads, and nothing else.
 *
 * Insertion order makes it an LRU: a hit moves its entry to the end, and an
 * overflow drops the oldest.
 */
const cache = new Map<string, RenderedSymbol>();

/** Render a unit to a vector (SVG) NATO symbol as a data URL. */
export function renderUnitSymbol(unit: Unit, size = 30): RenderedSymbol {
  const sidc = buildSidc(unit);
  const info = additionalInformation(unit);
  const key = `${size}\u0000${sidc}\u0000${unit.name ?? ""}\u0000${info}`;

  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  const symbol = new ms.Symbol(sidc, {
    size,
    uniqueDesignation: unit.name,
    additionalInformation: info,
    // milsymbol renders standard-identity colours; keep defaults.
  });

  const svg = symbol.asSVG();
  const dataUrl = "data:image/svg+xml;base64," + base64Unicode(svg);
  const { width, height } = symbol.getSize();
  const anchor = symbol.getAnchor();
  const rendered: RenderedSymbol = {
    dataUrl,
    width,
    height,
    anchor: { x: anchor.x, y: anchor.y },
  };

  if (cache.size >= SYMBOL_CACHE_MAX) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, rendered);
  return rendered;
}

/** UTF-8 safe base64 (handles Hebrew unit names). */
function base64Unicode(str: string): string {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16)),
    ),
  );
}
