import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { findScenario, SCENARIOS } from "./scenario.js";

/**
 * The picker's list against the two things it could drift from: the specs it
 * is generated from, and the battles the listings build.
 */
describe("the scenario catalogue", () => {
  const SPECS = fileURLToPath(new URL("../../tools/scenarios", import.meta.url));
  const slugs = readdirSync(SPECS)
    .filter((f) => f.endsWith(".json"))
    .map((f) => (JSON.parse(readFileSync(`${SPECS}/${f}`, "utf8")) as { slug: string }).slug);

  it("offers every battle there is a spec for, once", () => {
    // A spec generated and never listed is a battle nobody can open.
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...slugs].sort());
  });

  it("builds what it says on the card", () => {
    // Title and extent are written into the listing and into the builder's
    // return from the same spec; this is where the two would part.
    for (const listing of SCENARIOS) {
      const built = listing.build();
      expect(built.title, listing.id).toBe(listing.title);
      expect([built.mapWidth, built.mapHeight], listing.id).toEqual([listing.mapWidth, listing.mapHeight]);
      expect(listing.brief.trim(), listing.id).not.toBe("");
    }
  });

  it("builds a fresh game each time it is picked", () => {
    const listing = SCENARIOS[0]!;
    const a = listing.build();
    a.game.beginTurn();
    const b = listing.build();
    expect(b.game).not.toBe(a.game);
    // …and not one that has been played: the first game's turn is not in it.
    expect(b.game.turn).toBe(0);
  });

  it("opens the picker for an address that names no battle", () => {
    expect(findScenario(null)).toBeUndefined();
    expect(findScenario("nowhere")).toBeUndefined();
    expect(findScenario("telAzeka")?.id).toBe("telAzeka");
  });
});
