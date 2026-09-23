/**
 * Run the balance harness (src/sim/balance.ts) and print a Markdown table.
 *
 *   npm run balance                                  # every kind and echelon, 100 battles each, morale on and off
 *   npm run balance -- --n 300 --kinds meeting       # one kind, more battles
 *   npm run balance -- --echelons company --swap     # RED starts where BLUE would
 *   npm run balance -- --seed 20000                  # a fresh seed window (default 1000) — see balance.md on the lean
 *   npm run balance -- --reply 0.5 --steady-bonus 15 --steady-loss 0.75   # what is on trial (engine data/variants.ts)
 *   npm run balance -- --sweep                       # every configuration on trial, judged against TARGETS
 *   npm run balance -- --fires plan                  # the attacker gets a fire plan on the objective (FIRE_PLAN)
 *   npm run balance -- --fires 1,1,400               # …or shells, bombs a turn and where they lift
 *   npm run balance -- --fires artillery=2x4/battle,mortar=3x3,fuze=airburst   # missions x rounds
 *   npm run balance -- --cep artillery:15:15,mortar:100:25   # on trial: accuracy by CEP, first:cap metres
 *   npm run balance -- --fires artillery=2x4/battle,mortar=3x3,adjust=on   # one round until on the mark, then for effect
 *   npm run balance -- --defender-fires mortar=3x3,registered=200/400      # the defender's own section
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
  type FirePlan,
  type DefenderFires,
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
const firesArg = value("--fires");
// --fires plan | a,m[,lift] (shells and bombs a turn) | key=value,... :
//   artillery=2x4/battle  missions x shells each, per turn (default) or for the battle
//   mortar=3x3            tubes x bombs each, a turn
//   lift=400  fuze=airburst
const parseFires = (arg: string): FirePlan => {
  if (arg === "plan") return FIRE_PLAN;
  if (!arg.includes("=")) {
    const [artillery, mortar, liftAt] = arg.split(",").map(Number);
    return { artillery: artillery!, mortar: mortar!, liftAt: liftAt ?? FIRE_PLAN.liftAt };
  }
  const plan: FirePlan = { artillery: 0, mortar: 0, liftAt: FIRE_PLAN.liftAt };
  for (const part of arg.split(",")) {
    const [key, v = ""] = part.split("=");
    const m = /^(\d+)(?:x(\d+))?(?:\/(turn|battle))?$/.exec(v);
    if (key === "artillery" && m) {
      plan.artillery = Number(m[1]);
      plan.shellsPerMission = Number(m[2] ?? 1);
      plan.artilleryFor = (m[3] as "turn" | "battle" | undefined) ?? "turn";
    } else if (key === "mortar" && m && !m[3]) {
      plan.mortar = Number(m[1]);
      plan.bombsPerTube = Number(m[2] ?? 1);
    } else if (key === "lift" && m && !m[2] && !m[3]) plan.liftAt = Number(m[1]);
    else if (key === "fuze" && (v === "impact" || v === "airburst")) plan.fuze = v;
    else if (key === "adjust" && (v === "on" || v === "off")) plan.adjust = v === "on";
    else throw new Error(`--fires: cannot read "${part}"`);
  }
  return plan;
};
const fires = firesArg ? parseFires(firesArg) : undefined;
// --defender-fires mortar=3x3,registered=200/400 — the defender's own section,
// and points on the approach (metres in front of its line) registered in advance
const defenderArg = value("--defender-fires");
const defenderFires: DefenderFires | undefined = (() => {
  if (!defenderArg) return undefined;
  const d: DefenderFires = { tubes: 0 };
  for (const part of defenderArg.split(",")) {
    const [key, v = ""] = part.split("=");
    const m = /^(\d+)(?:x(\d+))?$/.exec(v);
    if (key === "mortar" && m) {
      d.tubes = Number(m[1]);
      d.bombsPerTube = Number(m[2] ?? 1);
    } else if (key === "registered" && /^\d+(\/\d+)*$/.test(v)) d.registeredAt = v.split("/").map(Number);
    else throw new Error(`--defender-fires: cannot read "${part}"`);
  }
  return d;
})();
// --cep artillery:15:15,mortar:100:25 — on trial: accuracy by CEP, first:cap metres
const cepArg = value("--cep");
if (cepArg) {
  variants.cepDispersion = {};
  for (const part of cepArg.split(",")) {
    const [weapon, first, cap] = part.split(":");
    const [firstM, capM] = [Number(first), Number(cap ?? first)];
    if (!weapon || !(firstM > 0) || !(capM > 0) || capM > firstM) throw new Error(`--cep: cannot read "${part}"`);
    variants.cepDispersion[weapon] = { firstM, capM };
  }
}

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
      const v = judge(echelon, { ...variants, ...c.variants }, battles, preparedCover, drill, fires, defenderFires);
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
        console.log(markdownRow(runCell(echelon, kind, { morale, swap, variants, battles, firstSeed, preparedCover, drill, ...(fires ? { fires } : {}), ...(defenderFires ? { defenderFires } : {}) })));
      }
    }
  }
}
