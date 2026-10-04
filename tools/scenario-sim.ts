/**
 * Run the headless scenario runner (src/sim/scenarioBattle.ts) and print a
 * Markdown table: a generated scenario, on its real ground, played many times
 * with no browser.
 *
 *   npm run scenario-sim -- --scenario telAzekaAssault --n 100
 *   npm run scenario-sim -- --scenario telAzekaAssault2 --drill western
 *   npm run scenario-sim -- --recon 1 --watch 1 --look 4 --wait-for-contact --aim 40   # a scout first (decisions 52-54)
 *   npm run scenario-sim -- --recon 2 --watch 1 --look 4 --wait-for-contact --scout-from vantage   # two scouts, each from an observation point
 *   npm run scenario-sim -- --recon 1 --watch 1 --look 4 --wait-for-contact --wait-in dead-ground   # the company waits out of sight
 *   npm run scenario-sim -- … --scout-from vantage  # the scouts watch from the spot that sees the objective from 350-550 m
 *   npm run scenario-sim -- … --target-first squads # the guns take squads before command groups (or: command)
 *   npm run scenario-sim -- --planning-error 0      # the plan on the truth, as before decision 51
 *   npm run scenario-sim -- --seed 11               # seeds from 11 (the browser runs used 11-18)
 *   npm run scenario-sim -- --no-counterattack      # the defender's reserve holds where it is (decision 60 off)
 *   npm run scenario-sim -- … --smoke 4 --prep-fires  # the company screens its crossing with 4 smoke missions and fires its plan when nothing is sure
 *   npm run scenario-sim -- --no-defender-plan      # the defender registers no targets (every table before the twenty-eighth round)
 *   npm run scenario-sim -- --no-fire-support      # no side calls a mortar or a gun: a small-arms fight
 *   npm run scenario-sim -- --quality BLUE=irregular/inexperienced   # a side's force quality (decision 83); RED=… too, comma-separated
 *
 * Kept thin on purpose, like tools/balance-sim.ts: what is worth checking
 * lives in src/sim, where the suite runs it.
 */
import { SCENARIOS } from "../src/app/scenario.js";
import { PLAIN_SCRIPT, WESTERN_DRILL, type SquadDrill } from "../src/app/drill.js";
import { DEFAULT_FIRE_CHOICES, runScenario, type FirePlanChoices } from "../src/sim/scenarioBattle.js";
import type { CompanyPlan } from "../src/app/company.js";
import type { CombatExperience, ForceQuality, ForceType, Side } from "../src/engine/index.js";

const args = process.argv.slice(2);
const value = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const ids = (value("--scenario") ?? "telAzekaAssault,telAzekaAssault2").split(",");
const n = Number(value("--n") ?? 100);
const first = Number(value("--seed") ?? 1000);
const drills = { plain: PLAIN_SCRIPT, western: { ...WESTERN_DRILL } } as const;
const drillName = (value("--drill") ?? "plain") as keyof typeof drills;
const base = drills[drillName];
if (!base) throw new Error(`--drill: "${drillName}" is not one of ${Object.keys(drills).join(", ")}`);
const drill: SquadDrill = { ...base };
// The defender's squads fight by the same drill, its reserve's counterattack
// (rules decision 60) included unless switched off.
const defenderDrill: SquadDrill = args.includes("--no-counterattack") ? { ...drill, counterattack: null } : drill;
// How a scout bounds and looks is the drill's; which squads scout, from where,
// and when the rest go are the company commander's (src/app/company.ts).
if (value("--watch")) drill.scouting = { watchTurns: Number(value("--watch")) };
const recon = value("--recon");
const company: CompanyPlan = {
  ...(recon
    ? {
        recon: {
          scouts: Number(recon),
          ...(value("--look") ? { lookTurns: Number(value("--look")) } : {}),
          ...(value("--scout-from") === "vantage" ? { scoutFrom: "vantage" as const } : {}),
        },
      }
    : {}),
  ...(value("--wait-in") === "dead-ground" ? { waitIn: "deadGround" as const } : {}),
};
const fire: FirePlanChoices = {
  ...DEFAULT_FIRE_CHOICES,
  ...(value("--planning-error") !== undefined ? { planningError: Number(value("--planning-error")) } : {}),
  ...(args.includes("--no-register") ? { register: false } : {}),
  ...(args.includes("--wait-for-contact") ? { waitForContact: true } : {}),
  ...(value("--aim") ? { aimWithin: Number(value("--aim")) } : {}),
  ...(value("--smoke") ? { smokeMissions: Number(value("--smoke")) } : {}),
  ...(args.includes("--prep-fires") ? { prepFires: true } : {}),
  ...(value("--target-first") === "squads" || value("--target-first") === "command"
    ? { targetFirst: value("--target-first") as "squads" | "command" }
    : {}),
};

// `--quality BLUE=elite/veryExperienced,RED=irregular/experienced`: a side's cell of the force-quality matrix.
const TYPES: readonly ForceType[] = ["irregular", "regular", "elite"];
const EXPERIENCE: readonly CombatExperience[] = ["inexperienced", "experienced", "veryExperienced"];
const quality: Partial<Record<Side, ForceQuality>> = {};
for (const part of value("--quality")?.split(",") ?? []) {
  const [side, cell] = part.split("=");
  const [type, experience] = (cell ?? "").split("/");
  if ((side !== "BLUE" && side !== "RED") || !TYPES.includes(type as ForceType) || !EXPERIENCE.includes(experience as CombatExperience)) {
    throw new Error(`--quality: "${part}" is not SIDE=type/experience, type one of ${TYPES.join(", ")}, experience one of ${EXPERIENCE.join(", ")}`);
  }
  if (quality[side]) throw new Error(`--quality: ${side} is given twice`);
  quality[side] = { type: type as ForceType, experience: experience as CombatExperience };
}

console.log(`${n} battles a scenario from seed ${first}, ${drill.name}${defenderDrill.counterattack ? "" : ", no counterattack"}${args.includes("--no-defender-plan") ? ", no defender fire plan" : ""}, company ${JSON.stringify(company)}, fire ${JSON.stringify(fire)}${value("--quality") ? `, quality ${value("--quality")}` : ""}${args.includes("--no-fire-support") ? ", no fire support" : ""}\n`);
console.log("| Scenario | Attacker wins | Defender wins (out of time) | Draws | Turns (median) | Attacker down | Defender down | Out by HE | Down while waiting (median) | Counterattacked (held at end) |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const urban: string[] = [];
for (const id of ids) {
  const listing = SCENARIOS.find((s) => s.id === id);
  if (!listing) throw new Error(`--scenario: "${id}" is not one of ${SCENARIOS.map((s) => s.id).join(", ")}`);
  const seeds = Array.from({ length: n }, (_, i) => first + i);
  const s = runScenario(listing, seeds, { drill, defenderDrill, company, fire, quality, ...(args.includes("--no-fire-support") ? { fireSupport: false } : {}), ...(args.includes("--no-defender-plan") ? { defenderFirePlan: false } : {}) });
  const pct = (x: number) => `${Math.round((100 * x) / s.battles)}%`;
  const r = (x: number) => `${Math.round(x)}%`;
  console.log(`| ${id} | ${pct(s.attackerWins)} | ${pct(s.defenderWins)} (${pct(s.outOfTime)}) | ${pct(s.draws)} | ${s.medianTurns} | ${r(s.attackerDownPct)} | ${r(s.defenderDownPct)} | ${r(s.explosivePct)} | ${s.medianDownWhileWaiting} | ${pct(s.counterattacked)} (${pct(s.retaken)}) |`);
  const u = s.urban;
  const f = (x: number) => x.toFixed(1);
  if (u.damaged + u.rubble + u.windowCriticals + u.roofCriticals + u.vehicles > 0) {
    urban.push(`| ${id} | ${f(u.damaged)} | ${f(u.rubble)} | ${f(u.windowCriticals)} | ${f(u.roofCriticals)} | ${f(u.crushed)} | ${u.vehicles ? `${Math.round(u.attackerVehiclesOutPct)}% / ${Math.round(u.defenderVehiclesOutPct)}%` : "—"} |`);
  }
}
// Buildings and vehicles (decisions 76–78): means a battle, where the scenario has any.
if (urban.length) {
  console.log("\n| Scenario | Buildings damaged | Rubble | Window / slit criticals | Roof criticals | Men buried | Vehicles out (attacker / defender) |");
  console.log("|---|---|---|---|---|---|---|");
  for (const line of urban) console.log(line);
}
