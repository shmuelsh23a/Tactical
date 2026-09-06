import { memo, useMemo } from "react";
import {
  groundHeight,
  type Heightfield,
  type MapLine,
  type MapObject,
  type Terrain,
} from "../../engine/index.js";

/**
 * The ground as the map draws it (rules decision 15): a shaded relief with a
 * height tint underneath, contour lines on top, and the objects standing on it.
 * Everything here is a picture of engine data — the heightfield and the
 * objects — and nothing the player sees is computed anywhere else.
 */

/** Metres between pixels of the shaded relief. */
const SHADE_STEP_M = 5;
/** Metres between contour lines, and between the heavier index contours. */
const CONTOUR_M = 10;
const INDEX_CONTOUR_M = 50;

/**
 * Hillshade with a hypsometric tint, lit from the north-west, as a data URL
 * for an SVG `<image>`. One pixel per {@link SHADE_STEP_M}; the browser
 * smooths it up to the map's scale.
 */
function reliefImage(terrain: Terrain, width: number, height: number): string | null {
  if (!terrain.heightfield || typeof document === "undefined") return null;
  const w = Math.ceil(width / SHADE_STEP_M) + 1;
  const h = Math.ceil(height / SHADE_STEP_M) + 1;
  const z = new Float32Array(w * h);
  let lo = Infinity;
  let hi = -Infinity;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const v = groundHeight(terrain, { x: c * SHADE_STEP_M, y: r * SHADE_STEP_M });
      z[r * w + c] = v;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(w, h);
  // Light from the north-west, 45° up — the cartographic convention, which is
  // what makes a hill read as a hill rather than a hollow.
  const light = { x: -0.5, y: -0.5, z: Math.SQRT1_2 };
  const span = Math.max(1, hi - lo);
  const at = (r: number, c: number) => z[Math.min(h - 1, Math.max(0, r)) * w + Math.min(w - 1, Math.max(0, c))]!;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const dzdx = (at(r, c + 1) - at(r, c - 1)) / (2 * SHADE_STEP_M);
      const dzdy = (at(r + 1, c) - at(r - 1, c)) / (2 * SHADE_STEP_M);
      const len = Math.hypot(dzdx, dzdy, 1);
      const shade = Math.max(0, (-dzdx * light.x - dzdy * light.y + light.z) / len);
      const t = (at(r, c) - lo) / span;
      // Low ground dark olive, high ground a paler, drier tan-green.
      const base = [18 + 80 * t, 54 + 52 * t, 34 + 24 * t];
      const k = 0.45 + 0.75 * shade;
      const i = (r * w + c) * 4;
      img.data[i] = Math.min(255, base[0]! * k);
      img.data[i + 1] = Math.min(255, base[1]! * k);
      img.data[i + 2] = Math.min(255, base[2]! * k);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

/**
 * Contour lines by marching squares over the heightfield's own grid. Returns
 * one SVG path per family: the ordinary contours and the heavier index ones.
 */
function contourPaths(hf: Heightfield): { minor: string; index: string } {
  const ox = hf.origin?.x ?? 0;
  const oy = hf.origin?.y ?? 0;
  const s = hf.spacing;
  const at = (r: number, c: number) => hf.heights[r * hf.columns + c] ?? 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of hf.heights) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const minor: string[] = [];
  const index: string[] = [];
  const first = Math.ceil(lo / CONTOUR_M) * CONTOUR_M;
  for (let level = first; level <= hi; level += CONTOUR_M) {
    const out = level % INDEX_CONTOUR_M === 0 ? index : minor;
    for (let r = 0; r < hf.rows - 1; r++) {
      for (let c = 0; c < hf.columns - 1; c++) {
        const z00 = at(r, c);
        const z10 = at(r, c + 1);
        const z11 = at(r + 1, c + 1);
        const z01 = at(r + 1, c);
        const idx =
          (z00 >= level ? 1 : 0) | (z10 >= level ? 2 : 0) | (z11 >= level ? 4 : 0) | (z01 >= level ? 8 : 0);
        if (idx === 0 || idx === 15) continue;
        const frac = (a: number, b: number) => (level - a) / (b - a);
        const top = () => `${ox + (c + frac(z00, z10)) * s} ${oy + r * s}`;
        const right = () => `${ox + (c + 1) * s} ${oy + (r + frac(z10, z11)) * s}`;
        const bottom = () => `${ox + (c + frac(z01, z11)) * s} ${oy + (r + 1) * s}`;
        const left = () => `${ox + c * s} ${oy + (r + frac(z00, z01)) * s}`;
        const seg = (a: () => string, b: () => string) => out.push(`M${a()}L${b()}`);
        switch (idx) {
          case 1: case 14: seg(left, top); break;
          case 2: case 13: seg(top, right); break;
          case 3: case 12: seg(left, right); break;
          case 4: case 11: seg(right, bottom); break;
          case 5: seg(left, top); seg(right, bottom); break;
          case 6: case 9: seg(top, bottom); break;
          case 7: case 8: seg(left, bottom); break;
          case 10: seg(top, right); seg(bottom, left); break;
        }
      }
    }
  }
  return { minor: minor.join(""), index: index.join("") };
}

export function Relief({
  terrain,
  width,
  height,
}: {
  terrain: Terrain;
  width: number;
  height: number;
}) {
  const hf = terrain.heightfield;
  const image = useMemo(() => reliefImage(terrain, width, height), [terrain, width, height]);
  const contours = useMemo(() => (hf ? contourPaths(hf) : null), [hf]);
  if (!hf) return null;
  return (
    <g className="relief">
      {image && (
        <image
          href={image}
          x={0}
          y={0}
          width={(Math.ceil(width / SHADE_STEP_M) + 1) * SHADE_STEP_M}
          height={(Math.ceil(height / SHADE_STEP_M) + 1) * SHADE_STEP_M}
          preserveAspectRatio="none"
        />
      )}
      {contours && (
        <>
          <path className="contour" d={contours.minor} />
          <path className="contour contour-index" d={contours.index} />
        </>
      )}
    </g>
  );
}

/**
 * The roads, tracks and paths: a cased line each, its width from the data.
 * Decoration only — the engine carries them and reads none of them.
 */
export const Roads = memo(function Roads({ roads }: { roads: readonly MapLine[] }) {
  return (
    <g className="roads">
      {roads.map((r) => {
        const points = r.points.map((p) => `${p.x},${p.y}`).join(" ");
        const cased = r.kind === "motorway" || r.kind === "street";
        return (
          <g key={r.id} className={`road road-${r.kind}`}>
            {cased && <polyline className="road-casing" points={points} strokeWidth={r.width + 1} />}
            <polyline className="road-fill" points={points} strokeWidth={r.width} />
          </g>
        );
      })}
    </g>
  );
});

/**
 * The objects on the ground: buildings and walls as their footprints, trees as
 * crowns. Memoised on the object list, which a game never changes, so a town
 * of a few hundred houses is not re-strung on every token re-render.
 */
export const TerrainObjects = memo(function TerrainObjects({
  objects,
}: {
  objects: readonly MapObject[];
}) {
  return (
    <g className="terrain-objects">
      {objects.map((o) =>
        o.footprint.shape === "circle" ? (
          <circle
            key={o.id}
            className={`object object-${o.kind}`}
            cx={o.footprint.center.x}
            cy={o.footprint.center.y}
            r={o.footprint.radius}
          />
        ) : (
          <polygon
            key={o.id}
            className={`object object-${o.kind}`}
            points={o.footprint.points.map((p) => `${p.x},${p.y}`).join(" ")}
          />
        ),
      )}
    </g>
  );
});
