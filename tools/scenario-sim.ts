/**
 * Run the headless scenario runner (src/sim/scenarioBattle.ts) and print a
 * Markdown table: a generated scenario, on its real ground, played many times
 * with no browser.
 *
 *   npm run scenario-sim -- --scenario telAzekaAssault --n 100
 *   npm run scenario-sim -- --scenario telAzekaAssault2 --drill western
 *   npm run scenario-sim -- --recon 1 --watch 1 --look 4 --wait-for-contact --aim 40   # a scout first (decisions 52-54)
 *   npm run scenario-sim -- --recon 1 --watch 1 --look 4 --wait-for-contact --wait-in dead-ground   # the company waits out of sight
 *   npm run scenario-sim -- … --scout-from vantage  # the scouts watch from the spot that sees the objective from 350-550 m
 *   npm run scenario-sim -- --planning-error 0      # the plan on the truth, as before decision 51
 *   npm run scenario-sim -- --seed 11               # seeds from 11 (the browser runs used 11-18)
 *
 * Kept thin on purpose, like tools/balance-sim.ts: what is worth checking
 * lives in src/sim, where the suite runs it.
 */
import { SCENARIOS } from "../src/app/scenario.js";
import { PLAIN_SCRIPT, WESTERN_DRILL, type SquadDrill } from "../src/app/drill.js";
import { DEFAULT_COMPANY_PLAN, runScenario, type CompanyPlan } from "../src/sim/scenarioBattle.js";

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
const recon = value("--recon");
if (recon) {
  drill.recon = {
    forces: Number(recon),
    ...(value("--watch") ? { watchTurns: Number(value("--watch")) } : {}),
    ...(value("--look") ? { lookTurns: Number(value("--look")) } : {}),
  };
}
const waitIn = value("--wait-in") === "dead-ground" ? "deadGround" : "place";
const plan: CompanyPlan = {
  ...DEFAULT_COMPANY_PLAN,
  ...(value("--planning-error") !== undefined ? { planningError: Number(value("--planning-error")) } : {}),
  ...(args.includes("--no-register") ? { register: false } : {}),
  ...(args.includes("--wait-for-contact") ? { waitForContact: true } : {}),
  ...(value("--aim") ? { aimWithin: Number(value("--aim")) } : {}),
  waitIn,
  ...(value("--scout-from") === "vantage" ? { scoutFrom: "vantage" as const } : {}),
};

console.log(`${n} battles a scenario from seed ${first}, ${drill.name}${drill.recon ? `, recon ${JSON.stringify(drill.recon)}` : ""}, plan ${JSON.stringify(plan)}\n`);
console.log("| Scenario | Attacker wins | Defender wins | Draws | Turns (median) | Attacker down | Defender down | Out by HE | Down while waiting (median) |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const id of ids) {
  const listing = SCENARIOS.find((s) => s.id === id);
  if (!listing) throw new Error(`--scenario: "${id}" is not one of ${SCENARIOS.map((s) => s.id).join(", ")}`);
  const seeds = Array.from({ length: n }, (_, i) => first + i);
  const s = runScenario(listing, seeds, { drill, plan });
  const pct = (x: number) => `${Math.round((100 * x) / s.battles)}%`;
  const r = (x: number) => `${Math.round(x)}%`;
  console.log(`| ${id} | ${pct(s.attackerWins)} | ${pct(s.defenderWins)} | ${pct(s.draws)} | ${s.medianTurns} | ${r(s.attackerDownPct)} | ${r(s.defenderDownPct)} | ${r(s.explosivePct)} | ${s.medianDownWhileWaiting} |`);
}
