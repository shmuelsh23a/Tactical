/**
 * The fight inside a building, measured (rules decision 96; docs/urban-design.md,
 * order of work step 3). Every house of the demo map, a generated floor plan,
 * an attacking squad clearing it by the battle drill against defenders placed
 * by `defaultDefence`, and the ways in: through the front door, up the inside
 * stairs (decision 124) or from the top, with or without grenades. Not part of `npm run check`.
 *
 *   npm run interior-sim
 *   npm run interior-sim -- --houses 100 --attackers 8 --defenders 3 --prepared
 *   npm run interior-sim -- --storeys 1      # every house one storey, as doctrine's one example is
 *   npm run interior-sim -- --hold-storeys 1   # a plan's lever (decision 101)
 *   npm run interior-sim -- --team-size 2      # teams of two: a measurement only (balance.md)
 *   npm run interior-sim -- --storied          # only houses with stairs, so the three ways in fight over the same houses
 *   npm run interior-sim -- --breach           # door and stair go in by a breach blown in the face opposite the front door (decision 124)
 *
 * What it is judged against (ATP 3-06.11 (2024)): clearing is "a slow
 * methodical process" (para 3-8, whose "40-60-minutes" for "a one-floor
 * building with a basement" is one illustration with no size or source,
 * not a target); top-down clearing is best (TC 3-21.75, para
 * 8-12); hand grenades the most-used explosive (para B-35); casualties
 * higher than in the open (para C-8).
 */
import { CELL_KIND, Rng, breachCell, defaultDefence, facingOf, generateFloorPlan, plannedDefence, resolveInteriorFight, type InteriorResult, type MapObject } from "../src/engine/index.js";
import { RAMAT_MENASHE_OBJECTS } from "../src/app/maps/ramatMenasheObjects.js";

const args = process.argv.slice(2);
const value = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const HOUSES = Number(value("--houses") ?? 249);
const SEED = Number(value("--seed") ?? 1000);
const ATTACKERS = Number(value("--attackers") ?? 8);
const DEFENDERS = Number(value("--defenders") ?? 3);
const PREPARED = args.includes("--prepared");
const STOREYS = value("--storeys");
const ONLY = value("--only"); // e.g. "door-no": one row, for calibrating
const HOLD = args.includes("--hold"); // the defenders hold to the last rather than fall back
const EXPECT_ABOVE = args.includes("--expect-above"); // the defenders expect the attack from above
const TEAM = Number(value("--team-size") ?? 4); // men to an attacking team: a measurement only, no plan sets it (the author, 2026-10-20)
const BREACH = args.includes("--breach"); // in by a breach in the face opposite the front door, blown as they go in (decision 124)
const STORIED = args.includes("--storied"); // every row over the houses with stairs only (decision 124's comparison)
const HOLD_STOREYS = value("--hold-storeys")?.split("+").map(Number); // the storeys the defenders hold, e.g. 1 or 0+1 (decision 101)

const houses: MapObject[] = RAMAT_MENASHE_OBJECTS.filter((o) => o.kind === "building")
  .slice(0, HOUSES)
  .map((h) => (STOREYS === undefined ? h : { ...h, height: Number(STOREYS) * 3 }));

const teams: string[][] = [];
for (let k = 0; k < ATTACKERS; k++) {
  if (k % TEAM === 0) teams.push([]);
  teams[teams.length - 1]!.push(`a${k + 1}`);
}
const defenders = Array.from({ length: DEFENDERS }, (_, k) => `d${k + 1}`);

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };
const pct = (n: number, of: number) => `${Math.round((100 * n) / of)}%`;
const mean = (xs: number[]) => (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(2);

console.log(`interior-sim: ${houses.length} houses, ${ATTACKERS} attackers (${teams.length} teams) against ${DEFENDERS} defenders${PREPARED ? " in prepared positions" : ""}${HOLD ? ", holding to the last" : ", falling back"}${EXPECT_ABOVE ? ", expecting the attack from above" : ""}${HOLD_STOREYS ? `, holding storeys ${HOLD_STOREYS.join("+")}` : ""}${TEAM !== 4 ? `, teams of ${TEAM}` : ""}, seed ${SEED}${STOREYS ? `, ${STOREYS} storeys each` : ""}${STORIED ? ", houses with stairs only" : ""}${BREACH ? ", in by a breach opposite the door" : ""}`);
console.log("");
console.log("| Entry | Grenades | Cleared | Repulsed | Standoff | Minutes (median, of those cleared) | Attackers out (mean a fight) | killed (mean) | Defenders out (mean) | Defenders withdrew (mean) | Share of hits by grenade | Rooms (median) |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const entry of ["door", "stair", "top"] as const) {
  for (const grenades of [false, true]) {
    if (ONLY && ONLY !== `${entry}-${grenades ? "yes" : "no"}`) continue;
    const rows: InteriorResult[] = houses.flatMap((h, k) => {
      const plan = generateFloorPlan(h, SEED);
      if ((STORIED || entry !== "door") && (!plan.stairwell || plan.storeys.length < 2)) return []; // no stairs to come down, or to climb
      const rng = new Rng(SEED * 7919 + k);
      const front = plan.outsideDoors[0] === undefined ? undefined : facingOf(plan, plan.outsideDoors[0]);
      const opposite = front && ({ north: "south", south: "north", east: "west", west: "east" } as const)[front];
      const breach = BREACH && entry !== "top" && opposite ? breachCell(plan, opposite) : undefined;
      if (BREACH && entry !== "top" && breach === undefined) return []; // no wall to breach there
      if (breach !== undefined) plan.storeys[0]!.cells[breach] = CELL_KIND.door;
      const defence = HOLD_STOREYS
        ? plannedDefence(plan, [{ ids: defenders, storeys: HOLD_STOREYS, atWindows: false }], rng, PREPARED)
        : defaultDefence(plan, defenders, rng, PREPARED);
      return [resolveInteriorFight({ plan, attack: { entry, grenades, teams, ...(breach !== undefined ? { breach, blast: true } : {}) }, defence, defenderFallback: HOLD ? "hold" : "fallBack", defenderExpects: EXPECT_ABOVE ? "above" : "below" }, rng)];
    });
    if (rows.length === 0) continue;
    const cleared = rows.filter((r) => r.outcome === "cleared");
    const grenadeHits = rows.reduce((s, r) => s + r.hits.grenade, 0);
    const allHits = rows.reduce((s, r) => s + r.hits.grenade + r.hits.fire, 0);
    console.log(
      `| ${entry} | ${grenades ? "yes" : "no"} | ${pct(cleared.length, rows.length)} | ${pct(rows.filter((r) => r.outcome === "repulsed").length, rows.length)} | ${pct(rows.filter((r) => r.outcome === "standoff").length, rows.length)} | ${cleared.length ? (median(cleared.map((r) => r.seconds)) / 60).toFixed(1) : "—"} | ${mean(rows.map((r) => r.attackers.out))} | ${mean(rows.map((r) => r.attackers.killed))} | ${mean(rows.map((r) => r.defenders.out))} | ${mean(rows.map((r) => r.defenders.withdrew))} | ${allHits ? pct(grenadeHits, allHits) : "—"} | ${median(rows.map((r) => r.rooms))} |`,
    );
  }
}
