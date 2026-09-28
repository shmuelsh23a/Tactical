/**
 * Run the validation harness (src/sim/validation.ts) and print Markdown
 * tables: the game's numbers measured the way the sources measure them.
 *
 *   npm run validate                    # both lethalities, 100 battles a cell
 *   npm run validate -- --n 300         # more battles
 *   npm run validate -- --seed 20000    # a fresh seed window
 *
 * The figures recorded on docs/validation.md came from the default run. Kept
 * thin: everything worth checking lives in src/sim, where the suite reaches it.
 */
import {
  MEASURED_WEAPONS,
  measureBreaks,
  measureRifleFire,
  measureRound,
} from "../src/sim/validation.js";
import { LETHALITIES } from "../src/engine/index.js";
import type { BattleKind, Echelon } from "../src/sim/balance.js";

const args = process.argv.slice(2);
const value = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const battles = Number(value("--n") ?? 100);
const firstSeed = Number(value("--seed") ?? 1000);
const f2 = (n: number) => n.toFixed(2);
const pct = (n: number) => `${Math.round(100 * n)}%`;

console.log("## Casualties a round, on a squad of nine standing in the open\n");
console.log("| Weapon | Lethality | On the point | Anywhere within 50 m | Lethal area predicts, on the point |");
console.log("|---|---|---|---|---|");
for (const w of MEASURED_WEAPONS) {
  for (const l of LETHALITIES) {
    const m = measureRound(w, l);
    console.log(`| ${w} | ${l} | ${f2(m.onTarget)} | ${f2(m.within50)} | ${m.predictedOnTarget === undefined ? "—" : f2(m.predictedOnTarget)} |`);
  }
}

console.log("\n## A minute of rifle fire: a squad of nine at a squad of nine, both stationary\n");
console.log("| Range | Target cover | Men put out a minute | Hits a firer a minute |");
console.log("|---|---|---|---|");
for (const range of [50, 150, 250, 350]) {
  for (const cover of ["none", "partial", "full"] as const) {
    const m = measureRifleFire(range, cover);
    console.log(`| ${range} m | ${cover} | ${f2(m.casualtiesPerMinute)} | ${f2(m.hitsPerFirerMinute)} |`);
  }
}

console.log(`\n## Where a side gives up, and what put its men out (morale on, ${battles} battles a cell, seeds from ${firstSeed})\n`);
console.log("| Battle | Lethality | Broke / wiped | Loser's losses when it broke, median (p10–p90) | Out by explosives | Minutes, median |");
console.log("|---|---|---|---|---|---|");
const cells: [Echelon, BattleKind][] = [
  ["platoon", "meeting"],
  ["platoon", "attack3"],
  ["company", "attack3"],
  ["company", "attack2"],
];
for (const [echelon, kind] of cells) {
  for (const l of LETHALITIES) {
    const m = measureBreaks(echelon, kind, l, battles, firstSeed);
    const loss = m.lossAtBreak ? `${pct(m.lossAtBreak.median)} (${pct(m.lossAtBreak.p10)}–${pct(m.lossAtBreak.p90)})` : "—";
    console.log(`| ${echelon} ${kind} | ${l} | ${m.broke} / ${m.wiped} | ${loss} | ${pct(m.explosiveShare)} | ${m.medianMinutes} |`);
  }
}
