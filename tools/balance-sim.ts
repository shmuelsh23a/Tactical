/**
 * Run the balance harness (src/sim/balance.ts) and print a Markdown table.
 *
 *   npm run balance                                  # every kind and echelon, 100 battles each, morale on and off
 *   npm run balance -- --n 300 --kinds meeting       # one kind, more battles
 *   npm run balance -- --echelons company --swap     # RED starts where BLUE would
 *   npm run balance -- --fair-ties                   # reroll initiative ties (an experiment, not a rule)
 *   npm run balance -- --morale on                   # only with morale (or: off)
 *
 * The figures recorded on docs/balance.md came from the default run. Kept thin
 * on purpose: tools/ is outside the typecheck and the suite, so everything
 * worth checking lives in src/sim, where it is.
 */
import {
  BATTLE_KINDS,
  ECHELONS,
  MARKDOWN_HEADER,
  markdownRow,
  runCell,
  type BattleKind,
  type Echelon,
} from "../src/sim/balance.js";

const args = process.argv.slice(2);
const value = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const list = <T extends string>(flag: string, all: readonly T[]): T[] => {
  const v = value(flag);
  if (!v) return [...all];
  const picked = v.split(",") as T[];
  for (const p of picked) {
    if (!all.includes(p)) throw new Error(`${flag}: "${p}" is not one of ${all.join(", ")}`);
  }
  return picked;
};

const battles = Number(value("--n") ?? 100);
const kinds = list<BattleKind>("--kinds", BATTLE_KINDS);
const echelons = list<Echelon>("--echelons", ECHELONS);
const moraleArg = value("--morale");
const morales = moraleArg === "on" ? [true] : moraleArg === "off" ? [false] : [true, false];
const swap = args.includes("--swap");
const fairTies = args.includes("--fair-ties");

console.log(`${battles} battles a cell${swap ? ", sides swapped" : ""}${fairTies ? ", initiative ties rerolled" : ""}\n`);
console.log(MARKDOWN_HEADER);
for (const kind of kinds) {
  for (const echelon of echelons) {
    for (const morale of morales) {
      console.log(markdownRow(runCell(echelon, kind, { morale, swap, fairTies, battles })));
    }
  }
}
