/**
 * Run the balance harness (src/sim/balance.ts) and print a Markdown table.
 *
 *   npm run balance                                  # every kind and echelon, 100 battles each, morale on and off
 *   npm run balance -- --n 300 --kinds meeting       # one kind, more battles
 *   npm run balance -- --echelons company --swap     # RED starts where BLUE would
 *   npm run balance -- --seed 20000                  # a fresh seed window (default 1000) — see balance.md on the lean
 *   npm run balance -- --reply 0.5 --steady-bonus 15 --steady-loss 0.75   # what is on trial (engine data/variants.ts)
 *   npm run balance -- --sweep                       # every configuration on trial, judged against TARGETS
 *   npm run balance -- --blast-cover 0.5,0.25        # on trial: a shell's blast chance ×0.5 in partial cover, ×0.25 in full
 *   npm run balance -- --fires plan                  # the attacker gets a fire plan on the objective (FIRE_PLAN)
 *   npm run balance -- --fires 1,1,400               # …or shells, bombs a turn and where they lift
 *   npm run balance -- --prepared-cover full         # a prepared position starts in full cover, not partial
 *   npm run balance -- --drill western               # how the squads fight: plain (default) or western (src/app/drill.ts)
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
  FIRE_PLAN,
  MARKDOWN_HEADER,
  TARGETS,
  judge,
  markdownRow,
  runCell,
  type BattleKind,
  type Echelon,
} from "../src/sim/balance.js";
import type { RuleVariants } from "../src/engine/index.js";
import { PLAIN_SCRIPT, WESTERN_DRILL } from "../src/app/drill.js";

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
const firstSeed = Number(value("--seed") ?? 1000);
const kinds = list<BattleKind>("--kinds", BATTLE_KINDS);
const echelons = list<Echelon>("--echelons", ECHELONS);
const moraleArg = value("--morale");
const morales = moraleArg === "on" ? [true] : moraleArg === "off" ? [false] : [true, false];
const swap = args.includes("--swap");
const preparedCover = value("--prepared-cover") === "full" ? "full" : "partial";
const drills = { plain: PLAIN_SCRIPT, western: WESTERN_DRILL } as const;
const drillName = (value("--drill") ?? "plain") as keyof typeof drills;
const drill = drills[drillName];
if (!drill) throw new Error(`--drill: "${drillName}" is not one of ${Object.keys(drills).join(", ")}`);

const variants: RuleVariants = {};
const reply = value("--reply");
if (reply) variants.assaultReplyChance = Number(reply);
const steadyBonus = value("--steady-bonus");
if (steadyBonus) variants.preparedTestBonus = Number(steadyBonus);
const steadyLoss = value("--steady-loss");
if (steadyLoss) variants.preparedLossFactor = Number(steadyLoss);
const blastCover = value("--blast-cover");
if (blastCover) {
  const factors = blastCover.split(",").map(Number);
  const [partial, full] = factors;
  if (factors.length !== 2 || !factors.every((f) => Number.isFinite(f) && f >= 0 && f <= 1)) {
    throw new Error(`--blast-cover: "${blastCover}" is not two factors from 0 to 1, partial,full (e.g. 0.5,0.25)`);
  }
  variants.blastCoverFactor = { partial: partial!, full: full! };
}
const firesArg = value("--fires");
const fires = !firesArg
  ? undefined
  : firesArg === "plan"
    ? FIRE_PLAN
    : (([artillery, mortar, liftAt]) => ({ artillery: artillery!, mortar: mortar!, liftAt: liftAt ?? FIRE_PLAN.liftAt }))(
        firesArg.split(",").map(Number),
      );


if (args.includes("--sweep")) {
  const configurations = CONFIGURATIONS;
  console.log(`Sweep: ${battles} battles a cell, morale on, ${drill.name}${fires ? ", fire plan" : ""}. Targets: attack at 1:1 wins <= ${TARGETS.attack1MaxWin}%, ` +
    `at ~2:1 wins ${TARGETS.attack2Win.join("-")}%, at 3-4:1 wins >= ${TARGETS.attack3MinWin}% ` +
    `losing ${TARGETS.attack3AttackerDown.join("-")}% of his men.\n`);
  console.log("| Configuration | Echelon | 1:1 win | ~2:1 win | 3–4:1 win | 3–4:1 attacker down | Out by HE | Targets met |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const c of configurations) {
    let total = 0;
    for (const echelon of echelons) {
      const v = judge(echelon, { ...variants, ...c.variants }, battles, preparedCover, drill, fires);
      total += v.met;
      const r = (n: number) => `${Math.round(n)}%`;
      console.log(`| ${c.name} | ${echelon} | ${r(v.attack1Win)} | ${r(v.attack2Win)} | ${r(v.attack3Win)} | ${r(v.attack3AttackerDown)} | ${r(v.explosivePct)} | ${v.met}/4 |`);
    }
    console.log(`| **${c.name}** | **all** | | | | | | **${total}/${4 * echelons.length}** |`);
  }
} else {
  const trial = Object.keys(variants).length ? `, variants ${JSON.stringify(variants)}` : "";
  console.log(`${battles} battles a cell from seed ${firstSeed}, ${drill.name}${swap ? ", sides swapped" : ""}${fires ? ", fire plan" : ""}${trial}\n`);
  console.log(MARKDOWN_HEADER);
  for (const kind of kinds) {
    for (const echelon of echelons) {
      for (const morale of morales) {
        console.log(markdownRow(runCell(echelon, kind, { morale, swap, variants, battles, firstSeed, preparedCover, drill, ...(fires ? { fires } : {}) })));
      }
    }
  }
}
