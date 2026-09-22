import { describe, it, expect } from "vitest";
import {
  makeCommandGroup,
  makeInfantry,
  makeVehicle,
  type Unit,
} from "../engine/index.js";
import { buildSidc, renderUnitSymbol, SYMBOL_CACHE_MAX } from "./symbols.js";

/**
 * `Token` renders a symbol on every render of every token, and every state
 * change re-renders all of them — so the render is cached. The cache is keyed
 * by value rather than by the unit, because the engine mutates a force in
 * place: these are the cases where a key on identity would draw the wrong
 * thing, and a key that is too coarse would do the same.
 */
describe("the rendered symbol cache", () => {
  const squad = () => makeInfantry("BLUE-1", "BLUE", "squad", { x: 0, y: 0 }, 8, "כיתה 1");

  it("hands back the same object for a force that has not changed", () => {
    const u = squad();
    expect(renderUnitSymbol(u, 30)).toBe(renderUnitSymbol(u, 30));
  });

  it("redraws a squad that has lost a man, from the same mutated object", () => {
    // The trap this exists to avoid: `u` is the same reference either side of
    // the casualty, so anything keyed on identity would keep drawing 8/8.
    const u = squad();
    const before = renderUnitSymbol(u, 30);
    u.soldiers![0]!.neutralized = true;
    const after = renderUnitSymbol(u, 30);
    expect(after).not.toBe(before);
    expect(after.dataUrl).not.toBe(before.dataUrl);
  });

  it("redraws a force the moment it is neutralised, and again when it recovers", () => {
    const u = squad();
    const fit = renderUnitSymbol(u, 30);
    u.neutralized = true;
    const hit = renderUnitSymbol(u, 30);
    expect(hit.dataUrl).not.toBe(fit.dataUrl);
    u.neutralized = false;
    expect(renderUnitSymbol(u, 30).dataUrl).toBe(fit.dataUrl);
  });

  it("redraws a vehicle as it is knocked out", () => {
    const tank = makeVehicle("RED-TANK", "RED", { x: 0, y: 0 }, 270, "טנק");
    const whole = renderUnitSymbol(tank, 30);
    tank.vehicle!.mobilityKilled = true;
    const immobile = renderUnitSymbol(tank, 30);
    tank.vehicle!.destroyed = true;
    const dead = renderUnitSymbol(tank, 30);
    expect(new Set([whole.dataUrl, immobile.dataUrl, dead.dataUrl]).size).toBe(3);
  });

  it("keeps two forces apart when only the side differs", () => {
    // Affiliation is in the SIDC, and the SIDC is in the key — but both
    // squads carry the same name and the same strength, which is the
    // collision a name-only key would make.
    const blue = makeInfantry("X", "BLUE", "squad", { x: 0, y: 0 }, 8, "כיתה 1");
    const red = makeInfantry("X", "RED", "squad", { x: 0, y: 0 }, 8, "כיתה 1");
    expect(buildSidc(blue)).not.toBe(buildSidc(red));
    expect(renderUnitSymbol(blue, 30).dataUrl).not.toBe(renderUnitSymbol(red, 30).dataUrl);
  });

  it("keeps two forces apart when only the name differs", () => {
    const one = makeInfantry("A", "BLUE", "squad", { x: 0, y: 0 }, 8, "כיתה 1");
    const two = makeInfantry("B", "BLUE", "squad", { x: 0, y: 0 }, 8, "כיתה 2");
    expect(renderUnitSymbol(one, 30).dataUrl).not.toBe(renderUnitSymbol(two, 30).dataUrl);
  });

  it("does not serve one size from another", () => {
    const u = squad();
    const small = renderUnitSymbol(u, 20);
    const large = renderUnitSymbol(u, 40);
    expect(small).not.toBe(large);
    expect(small.width).toBeLessThan(large.width);
  });

  it("ignores where a force stands — moving it does not redraw it", () => {
    // Position is drawn by `Token` from the unit, never by milsymbol, so a
    // force walking 400 m must not cost a re-render.
    const u = squad();
    const here = renderUnitSymbol(u, 30);
    u.position = { x: 400, y: 260 };
    expect(renderUnitSymbol(u, 30)).toBe(here);
  });

  it("stays bounded, and an evicted entry comes back identical", () => {
    const u = squad();
    const first = renderUnitSymbol(u, 30);
    // Distinct keys enough to push the whole cache past its cap.
    const crowd: Unit[] = [];
    for (let i = 0; i < SYMBOL_CACHE_MAX + 8; i++) {
      crowd.push(makeCommandGroup(`HQ-${i}`, "BLUE", "platoon", { x: 0, y: 0 }, 3, `חפ"ק ${i}`));
    }
    for (const c of crowd) renderUnitSymbol(c, 30);
    const again = renderUnitSymbol(u, 30);
    // Dropped — but the drawing is a function of the key, so what comes back
    // is the same picture rather than a stale one.
    expect(again).not.toBe(first);
    expect(again.dataUrl).toBe(first.dataUrl);
  });
});
