/**
 * Run the balance harness (src/sim/balance.ts) and print a Markdown table.
 *
 *   npm run balance                                  # every kind and echelon, 100 battles each, morale on and off
 *   npm run balance -- --n 300 --kinds meeting       # one kind, more battles
 *   npm run balance -- --echelons company --swap     # RED starts where BLUE would
 *   npm run balance -- --reply 0.5 --steady-bonus 15 --steady-loss 0.75   # what is on trial (engine data/variants.ts)
 *   npm run balance -- --severity 4/4                # wound-severity roll on trial: d10 1-4 light, 5-8 serious, 9-10 killed
 *   npm run balance -- --sweep                       # every configuration on trial, judged against TARGETS
 *   npm run balance -- --prepared-cover full         # a prepared position starts in full cover, not partial
 *   npm run balance -- --morale on                   # only with morale (or: off)
 *
 * The figures recorded on docs/balance.md came from the default run. Kept thin
 * on purpose: tools/ is outside the typecheck and the suite, so everything
 * worth checking lives in src/sim, where it is.
 */
import {
  BATTLE_KINDS,
  CONFIGURATIONS,
  ECHELONS,
  MARKDOWN_HEADER,
  TARGETS,
  judge,
  markdownRow,
  runCell,
  type BattleKind,
  type Echelon,
} from "../src/sim/balance.js";
import type { RuleVariants } from "../src/engine/index.js";

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
const preparedCover = value("--prepared-cover") === "full" ? "full" : "partial";

const variants: RuleVariants = {};
const reply = value("--reply");
if (reply) variants.assaultReplyChance = Number(reply);
const steadyBonus = value("--steady-bonus");
if (steadyBonus) variants.preparedTestBonus = Number(steadyBonus);
const steadyLoss = value("--steady-loss");
if (steadyLoss) variants.preparedLossFactor = Number(steadyLoss);
const severity = value("--severity");
if (severity) {
  const [light, serious] = severity.split("/").map(Number);
  variants.woundSeverity = { light: light!, serious: serious! };
}

if (args.includes("--sweep")) {
  console.log(`Sweep: ${battles} battles a cell, morale on. Targets: attack at 1:1 wins <= ${TARGETS.attack1MaxWin}%, ` +
    `at ~2:1 wins ${TARGETS.attack2Win.join("-")}%, at 3-4:1 wins >= ${TARGETS.attack3MinWin}% ` +
    `losing ${TARGETS.attack3AttackerDown.join("-")}% of his men.\n`);
  console.log("| Configuration | Echelon | 1:1 win | ~2:1 win | 3–4:1 win | 3–4:1 attacker down | Targets met |");
  console.log("|---|---|---|---|---|---|---|");
  for (const c of CONFIGURATIONS) {
    let total = 0;
    for (const echelon of echelons) {
      const v = judge(echelon, c.variants, battles, preparedCover);
      total += v.met;
      const r = (n: number) => `${Math.round(n)}%`;
      console.log(`| ${c.name} | ${echelon} | ${r(v.attack1Win)} | ${r(v.attack2Win)} | ${r(v.attack3Win)} | ${r(v.attack3AttackerDown)} | ${v.met}/4 |`);
    }
    console.log(`| **${c.name}** | **all** | | | | | **${total}/${4 * echelons.length}** |`);
  }
} else {
  const trial = Object.keys(variants).length ? `, variants ${JSON.stringify(variants)}` : "";
  console.log(`${battles} battles a cell${swap ? ", sides swapped" : ""}${trial}\n`);
  console.log(MARKDOWN_HEADER);
  for (const kind of kinds) {
    for (const echelon of echelons) {
      for (const morale of morales) {
        console.log(markdownRow(runCell(echelon, kind, { morale, swap, variants, battles, preparedCover })));
      }
    }
  }
}
