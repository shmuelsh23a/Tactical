/**
 * Run the balance harness (src/sim/balance.ts) and print a Markdown table.
 *
 *   npm run balance                                  # every kind and echelon, 100 battles each, morale on and off
 *   npm run balance -- --n 300 --kinds meeting       # one kind, more battles
 *   npm run balance -- --echelons company --swap     # RED starts where BLUE would
 *   npm run balance -- --seed 20000                  # a fresh seed window (default 1000) — see balance.md on the lean
 *   npm run balance -- --reply 0.5 --steady-bonus 15 --steady-loss 0.75   # what is on trial (engine data/variants.ts)
 *   npm run balance -- --sweep                       # every configuration on trial, judged against TARGETS
 *   npm run balance -- --fires artillery=2x6,mortar=4x6,fuze=airburst   # the attacker's fire missions: missions x rounds for effect
 *   npm run balance -- --defender-fires mortar=4x6,registered=200/400    # the defender's, and targets it registered
 *   npm run balance -- --fires mortar=4,method=effect --defender-fires mortar=4,method=effect   # fire for effect at once (decision 39)
 *   npm run balance -- --displace 100                # a defender moves off a shelled position
 *   npm run balance -- --prepared-cover full         # a prepared position starts in full cover, not partial
 *   npm run balance -- --drill western               # how the squads fight: plain (default) or western (src/app/drill.ts)
 *   npm run balance -- --defender-ops --alternate 150 --displace 100   # the defender's mission plan (decision 38)
 *   npm run balance -- --any-echelon               # any side may call any weapon: rules decision 37 off
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
  type FirePlan,
  type DefenderFires,
  MARKDOWN_HEADER,
  TARGETS,
  callableAt,
  judge,
  markdownRow,
  runCell,
  type BattleKind,
  type Echelon,
} from "../src/sim/balance.js";
import type { FireAllotment, RuleVariants } from "../src/engine/index.js";
import { PLAIN_SCRIPT, WESTERN_DRILL, type SquadDrill } from "../src/app/drill.js";

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
const drill: SquadDrill | undefined = drills[drillName] && { ...drills[drillName] };
if (!drill) throw new Error(`--drill: "${drillName}" is not one of ${Object.keys(drills).join(", ")}`);

const variants: RuleVariants = {};
const reply = value("--reply");
if (reply) variants.assaultReplyChance = Number(reply);
const steadyBonus = value("--steady-bonus");
if (steadyBonus) variants.preparedTestBonus = Number(steadyBonus);
const steadyLoss = value("--steady-loss");
if (steadyLoss) variants.preparedLossFactor = Number(steadyLoss);
// --fires plan | artillery=2x6,mortar=4x6,lift=400,fuze=airburst — the
// attacker's fire missions (rules decision 34): missions x rounds for effect
const allotment = (key: string, v: string): FireAllotment => {
  const m = /^(\d+)(?:x(\d+))?$/.exec(v);
  if (!m) throw new Error(`cannot read ${key}=${v}`);
  return { weapon: key, missions: Number(m[1]), ...(m[2] ? { roundsForEffect: Number(m[2]) } : {}) };
};
const firesArg = value("--fires");
const fires: FirePlan | undefined = (() => {
  if (!firesArg) return undefined;
  if (firesArg === "plan") return FIRE_PLAN;
  const plan: FirePlan = { missions: [], liftAt: FIRE_PLAN.liftAt };
  for (const part of firesArg.split(",")) {
    const [key = "", v = ""] = part.split("=");
    if (key === "artillery" || key === "mortar") plan.missions.push(allotment(key, v));
    else if (key === "lift" && /^\d+$/.test(v)) plan.liftAt = Number(v);
    else if (key === "fuze" && (v === "impact" || v === "airburst")) plan.fuze = v;
    else if (key === "registered" && (v === "on" || v === "off")) plan.registered = v === "on";
    else if (key === "method" && (v === "adjust" || v === "effect")) plan.method = v;
    else throw new Error(`--fires: cannot read "${part}"`);
  }
  return plan;
})();
// --defender-fires mortar=4x6,registered=200/400 — the defender's missions, and
// points on the approach (metres in front of its line) registered in advance
const defenderArg = value("--defender-fires");
const defenderFires: DefenderFires | undefined = (() => {
  if (!defenderArg) return undefined;
  const d: DefenderFires = { missions: [] };
  for (const part of defenderArg.split(",")) {
    const [key = "", v = ""] = part.split("=");
    if (key === "artillery" || key === "mortar") d.missions.push(allotment(key, v));
    else if (key === "registered" && /^\d+(\/\d+)*$/.test(v)) d.registeredAt = v.split("/").map(Number);
    else if (key === "method" && (v === "adjust" || v === "effect")) d.method = v;
    else throw new Error(`--defender-fires: cannot read "${part}"`);
  }
  return d;
})();
// --displace 100 — a defender moves off a shelled position, this far (drill.ts)
// --any-echelon — rules decision 37 off. With it on, a weapon the battle's
// echelon may not call is struck from the fire plans, and said so here.
const anyEchelon = args.includes("--any-echelon");
if (!anyEchelon) {
  const struck = [...(fires?.missions ?? []), ...(defenderFires?.missions ?? [])]
    .flatMap((a) => echelons.filter((e) => !callableAt(e, a.weapon)).map((e) => `${a.weapon} at ${e}`));
  if (struck.length) console.log(`Struck by rules decision 37 (--any-echelon to keep them): ${[...new Set(struck)].join(", ")}\n`);
}
// --defender-ops, --alternate 150 — the defender's mission plan (rules
// decision 38): observation posts, and alternate positions this far back.
const alternateArg = value("--alternate");
const defenderPlan =
  args.includes("--defender-ops") || alternateArg
    ? { observationPosts: args.includes("--defender-ops"), ...(alternateArg ? { alternateAt: Number(alternateArg) } : {}) }
    : undefined;
const displaceArg = value("--displace");
if (displaceArg) drill.displace = { metres: Number(displaceArg), contactWithin: 300 };

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
      const v = judge(echelon, { ...variants, ...c.variants }, battles, preparedCover, drill, fires, defenderFires, anyEchelon, defenderPlan);
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
        console.log(markdownRow(runCell(echelon, kind, { morale, swap, variants, battles, firstSeed, preparedCover, drill, ...(fires ? { fires } : {}), ...(defenderFires ? { defenderFires } : {}), ...(anyEchelon ? { anyEchelon } : {}), ...(defenderPlan ? { defenderPlan } : {}) })));
      }
    }
  }
}
