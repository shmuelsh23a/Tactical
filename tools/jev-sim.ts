/**
 * Play the attacking company commander yourself — as Jev will, or as an
 * agent standing in for Jev in testing — through typed questions
 * (src/sim/companyQuestions.ts), on a scenario's real ground.
 *
 * A battle is its seed and the answers given so far: each run replays them
 * and stops at the next question, which it prints with the commander's
 * picture of the battle. Append the chosen option's id to the answers file
 * and run again, until the battle ends. Nothing is kept between runs but the
 * answers file, so a battle can be re-examined from any point.
 *
 *   npm run jev-sim -- --scenario telAzekaAssault --seed 11 --answers answers.json
 *   npm run jev-sim -- --seed 11 --answers answers.json --json    # the question as JSON
 *
 * Exit status: 0 the battle ended (RESULT printed), 3 a question is waiting,
 * 2 an answer in the file is not one of its question's options.
 *
 * **With Jev itself** (`--jev`, backlog 15): Jev answers every question, and
 * whole battles are played, from `--seed` for `--n` seeds. Needs
 * `TYPESAFE_API_KEY` in the environment and `api.typesafe.ai` reachable.
 * Each battle's answers and its log (every question, answer, confidence,
 * model, question-set version and the call's time) go to `--out` (default
 * `jev-runs/`, not committed); the answers file replays the battle through
 * this tool without Jev (`--answers`).
 *
 *   npm run jev-sim -- --jev --seed 1000 --n 10
 *   npm run jev-sim -- --jev --model jev-latest --out /tmp/jev
 *   npm run jev-sim -- --jev --framing plain          # how the questions are framed (src/sim/jev.ts; default mission)
 *
 * **A rule in Jev's place** (`--rule`): the scripted commander's choices given
 * as answers — three scouts, wait in dead ground, go after four turns with the
 * enemy in sight, every platoon assaulting, fire on what the scouts hold in
 * sight and sure to 40 m, squads first. It says what the questions can reach without Jev,
 * so Jev's results can be read against it; `--rule bound,holdshort` also
 * bounds by platoon and holds short under the fires, as Jev chooses to, and
 * `holdfire` holds the mortars until the company goes.
 *
 *   npm run jev-sim -- --rule --seed 1000 --n 20
 *
 * **A Claude model in Jev's place** (`--claude <model>`, `src/sim/claude.ts`):
 * the same questions, answered by the Anthropic API. Needs
 * `JEV_ANTHROPIC_API_KEY` (or `ANTHROPIC_API_KEY`) and `api.anthropic.com`
 * reachable; `--effort` sets how hard it thinks where the model takes it.
 *
 *   npm run jev-sim -- --claude claude-haiku-4-5 --seed 1000 --n 20
 *   npm run jev-sim -- --claude claude-sonnet-5-5 --effort low --seed 1000 --n 20
 *
 * **An order, a plan and a memory** (docs/balance.md, thirty-sixth round):
 * `--order` gives the commander the scenario's OPORD from battalion
 * (`src/sim/opord.ts`; for Jev, `--framing order`); with a Claude model,
 * `--plan` has it write its own plan before the first question and carry it
 * in every call, and `--memory` carries the battle's decisions so far with
 * their reasons. The plan is logged with the battle.
 *
 *   npm run jev-sim -- --claude claude-opus-5-5 --order --plan --memory --seed 1000 --n 20
 *
 * `--conversation` plays the battle as one append-only conversation with its
 * tail cached (`claude.ts`): the commander sees its earlier pictures, not
 * one-line summaries, and every call's earlier turns are read from cache.
 * `--updates` (with it implied) sends the whole picture only when much of
 * it changed, and what changed otherwise (`pictureFor`).
 *   npm run jev-sim -- --jev --framing order --seed 1000 --n 20
 *
 * **A company order** (`--opord`, OPORD mode, decisions 126 and 128): the
 * order compiled to a commander (`src/sim/orderCommander.ts`) answers the
 * questions — from a JSON file (`src/app/order.ts`'s `CompanyOrder`), or one
 * of the reference plans written as orders by its letter (`ref:A`, `ref:A+flank`,
 * `ref:B`, `ref:E`, `ref:D`, `ref:A+moveup`, `ref:B+moveup`, `ref:C`;
 * `src/sim/referenceOrders.ts`). The log carries the order and every answer
 * the order did not give, taken by the intent. `--opord parity` holds every
 * reference order to its `--rule` form, question by question, over `--n` seeds.
 *
 *   npm run jev-sim -- --opord ref:B --seed 1000 --n 20
 *   npm run jev-sim -- --opord my-order.json --seed 1000 --n 20
 *   npm run jev-sim -- --opord parity --seed 1000 --n 20
 */
import "./env.js";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { SCENARIOS } from "../src/app/scenario.js";
import { PLAIN_SCRIPT, REFERENCE_DRILL, WESTERN_DRILL } from "../src/app/drill.js";
import { DEFAULT_FIRE_CHOICES, runScenarioBattle } from "../src/sim/scenarioBattle.js";
import { NeedAnswer, fromAnswers } from "../src/app/companyQuestions.js";
import { JEV_FRAMINGS, jevAsker, playWithAsker, type Asker, type JevFraming } from "../src/sim/jev.js";
import { claudeCommander, type ClaudeAskerOptions } from "../src/sim/claude.js";
import { ORDERS } from "../src/sim/opord.js";
import { ruleDecide } from "../src/app/ruleCommander.js";
import { orderDecider, type IntentNote } from "../src/app/orderCommander.js";
import { REFERENCE_ORDERS } from "../src/app/referenceOrders.js";
import { limitOfAdvanceM, type CompanyOrder } from "../src/app/order.js";
import { platoonKey } from "../src/app/company.js";

const args = process.argv.slice(2);
const value = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const id = value("--scenario") ?? "telAzekaAssault";
const listing = SCENARIOS.find((s) => s.id === id);
if (!listing) throw new Error(`--scenario: "${id}" is not one of ${SCENARIOS.map((s) => s.id).join(", ")}`);
const seed = Number(value("--seed") ?? 11);
const file = value("--answers");
const answers: string[] = file && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
// The reference drill unless asked for another (the drill audit, 2026-10-21): plain is the untrained variant.
const drillArg = value("--drill") ?? "reference";
const drillBase = drillArg === "western" ? WESTERN_DRILL : drillArg === "plain" ? PLAIN_SCRIPT : drillArg === "reference" ? REFERENCE_DRILL : undefined;
if (!drillBase) throw new Error(`--drill: "${drillArg}" is not one of reference, plain, western`);
const drillWatching = { ...drillBase, scouting: { watchTurns: 1 } };
// Consolidating where it stands, not across on the far side (before decision 130): a measurement switch.
const drill =
  args.includes("--no-far-side") && drillWatching.consolidate
    ? { ...drillWatching, consolidate: { nothingWithin: drillWatching.consolidate.nothingWithin, arc: drillWatching.consolidate.arc } }
    : drillWatching;
// A limit of advance N metres past the objective (decision 130); an order's own, given one, is its.
const loaArg = value("--loa") === undefined ? undefined : Number(value("--loa"));
if (loaArg !== undefined && !(loaArg > 0)) throw new Error("--loa: metres past the objective, more than 0");
const decide = fromAnswers(answers);
// Where the scripted defender registers its mortars (`--defender-plan`): dead ground (the default), open ground, or nothing.
const defenderPlan = value("--defender-plan") ?? "dead";
if (!["dead", "open", "none"].includes(defenderPlan)) throw new Error(`--defender-plan: "${defenderPlan}" is not one of dead, open, none`);
const defenderFirePlan = defenderPlan === "none" ? false : defenderPlan === "open" ? ("open" as const) : true;
// Fire on the move (`--fire-on-the-move 0.5`): a force that moved fires at that factor of its hit chance.
const fireOnTheMove = value("--fire-on-the-move") === undefined ? undefined : Number(value("--fire-on-the-move"));
if (fireOnTheMove !== undefined && !(fireOnTheMove > 0 && fireOnTheMove <= 1)) throw new Error("--fire-on-the-move: a factor in (0, 1]");
// The attacker's breakpoint (`--attacker-breakpoint 0.3`): the share of its men down, broken or fled at which the attack is called off.
const attackerBreakpoint = value("--attacker-breakpoint") === undefined ? undefined : Number(value("--attacker-breakpoint"));
if (attackerBreakpoint !== undefined && !(attackerBreakpoint > 0 && attackerBreakpoint < 1)) throw new Error("--attacker-breakpoint: a share in (0, 1)");
const engine = {
  defenderFirePlan,
  ...(loaArg !== undefined ? { limitOfAdvanceM: loaArg } : {}),
  // The mission's deadline in place of the scenario's (decision 58): a measurement switch.
  ...(value("--time-limit") ? { timeLimit: Number(value("--time-limit")) } : {}),
  // The drill's covered routes and arriving together (balance.md, forty-fifth round), on unless turned off.
  ...(args.includes("--no-covered") ? { coveredRoutes: false } : {}),
  ...(args.includes("--no-together") ? { arriveTogether: false } : {}),
  // No reinforcement ever comes (decision 122): a measurement switch.
  ...(args.includes("--no-reinforcement") ? { reinforcements: false as const } : {}),
  // The attacker briefed on the defence with its reserves, as before decision 105: a measurement switch.
  ...(args.includes("--brief-reserves") ? { briefReserves: true as const } : {}),
  ...(fireOnTheMove !== undefined ? { fireOnTheMove } : {}),
  ...(attackerBreakpoint !== undefined ? { attackerBreakpoint } : {}),
};

const opordArg = value("--opord");
if (opordArg === "parity") {
  // Every reference order against its --rule form, question by question (decision 126).
  const n = Number(value("--n") ?? 1);
  let bad = 0;
  for (const r of REFERENCE_ORDERS) {
    let asked = 0;
    let first: string | undefined;
    for (let s = seed; s < seed + n; s++) {
      const rule = ruleDecide(new Set(r.rule));
      const order = orderDecider(r.order, platoonsOf(s));
      runScenarioBattle(listing, s, {
        drill, fire: DEFAULT_FIRE_CHOICES, ...engine,
        decide: (q) => {
          const a = rule(q);
          const b = order(q);
          if (a !== b && !first) first = `seed ${s}, ${q.id}: the rule ${a}, the order ${b}`;
          asked++;
          return a;
        },
      });
    }
    if (first) bad++;
    console.log(`${first ? "DIFFERS" : "SAME   "} ${r.name} (--rule ${r.rule.join(",") || "-"}): ${asked} questions over ${n} battles${first ? `; first: ${first}` : ""}`);
  }
  console.log(bad ? `PARITY FAILED: ${bad} of ${REFERENCE_ORDERS.length} orders differ from their rule form.` : `PARITY: all ${REFERENCE_ORDERS.length} orders answer as their rule form on ${id}, seeds ${seed}-${seed + n - 1}.`);
  process.exit(bad ? 1 : 0);
}

/** The side's platoons, as the order names them. */
function platoonsOf(s: number): string[] {
  const g = listing!.build(s).game;
  const side = g.attackers[0] ?? "BLUE";
  return [...new Set(g.units.filter((u) => u.side === side && u.kind !== "command").map((u) => platoonKey(u.id)))];
}

if (args.includes("--jev") || args.includes("--rule") || args.includes("--claude") || opordArg) {
  // A commander for each battle: a Claude model with a plan or a memory keeps state between questions.
  let commander: () => { ask: Asker; plan?: () => string | undefined; notes?: () => IntentNote[] };
  let framing = "rule";
  const order = ORDERS[id];
  let written: CompanyOrder | undefined;
  let orderLoa: { limitOfAdvanceM?: number } = {};
  if (opordArg) {
    const ref = opordArg.startsWith("ref:") ? REFERENCE_ORDERS.find((r) => `ref:${r.key}` === opordArg) : undefined;
    if (opordArg.startsWith("ref:") && !ref) throw new Error(`--opord: "${opordArg}" is not one of ${REFERENCE_ORDERS.map((r) => `ref:${r.key}`).join(", ")}`);
    if (ref && !ref.scenarios.includes(id)) throw new Error(`--opord: ${opordArg} is written for ${ref.scenarios.join(" and ")}, not ${id}`);
    // A reference order plays on each scenario it is written for, under that scenario's name.
    written = ref ? { ...ref.order, scenario: id } : (JSON.parse(readFileSync(opordArg, "utf8")) as CompanyOrder);
    // The order's limit of advance reaches the drill (decision 130): nothing the order says is dropped.
    const m = limitOfAdvanceM(written);
    if (m !== undefined) orderLoa = { limitOfAdvanceM: m };
    const o = written;
    // An order is for its scenario and its side: played elsewhere its platoons and places mean something else.
    if (o.scenario !== id) throw new Error(`--opord: the order was written for ${o.scenario}, not ${id}`);
    const attacking = listing.build(seed).game.attackers[0] ?? "BLUE";
    if (o.side !== attacking) throw new Error(`--opord: the order is ${o.side}'s, and ${attacking} attacks in ${id}`);
    const platoons = platoonsOf(seed);
    commander = () => {
      const d = orderDecider(o, platoons);
      return { ask: async (q) => ({ answer: d(q), confidence: 1, model: "order" }), notes: () => d.notes };
    };
    framing = `order:${ref ? ref.key : opordArg}`;
  } else if (args.includes("--claude")) {
    const model = value("--claude");
    if (!model || model.startsWith("--")) throw new Error("--claude: name a model, e.g. claude-haiku-4-5");
    // The cloud sessions keep ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL for
    // Claude Code itself, so the key is read under its own name first and the
    // API is named outright rather than taken from ANTHROPIC_BASE_URL.
    const apiKey = process.env.JEV_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("ERROR no Claude client: set JEV_ANTHROPIC_API_KEY in the environment (a new session picks it up).");
      process.exit(2);
    }
    const effort = value("--effort") as ClaudeAskerOptions["effort"];
    const withOrder = args.includes("--order");
    if (withOrder && !order) throw new Error(`--order: no order is written for "${id}" (src/sim/opord.ts)`);
    const client = new Anthropic({ apiKey, baseURL: "https://api.anthropic.com" });
    const opts: ClaudeAskerOptions = {
      model,
      ...(effort ? { effort } : {}),
      ...(withOrder ? { order } : {}),
      plan: args.includes("--plan"),
      memory: args.includes("--memory"),
      conversation: args.includes("--conversation") || args.includes("--updates"),
      updates: args.includes("--updates"),
    };
    commander = () => claudeCommander(client, opts);
    framing = [`claude:${model}${effort ? `@${effort}` : ""}`, ...(["order", "plan", "memory", "conversation", "updates"] as const).filter((f) => args.includes(`--${f}`))].join("+");
  } else if (args.includes("--rule")) {
    const extra = value("--rule")?.startsWith("--") === false ? value("--rule")!.split(",") : [];
    const ask = ruleAsker(new Set(extra));
    commander = () => ({ ask });
    framing = ["rule", ...extra].join("+");
  } else {
    let client: TypeSafeClient;
    try {
      client = new TypeSafeClient({ logLevel: "error" });
    } catch (e) {
      console.error(`ERROR no Jev client: ${(e as Error).message.replace(/\.+$/, "")}. Set TYPESAFE_API_KEY in the environment.`);
      process.exit(2);
    }
    const model = value("--model");
    const f = (value("--framing") ?? "mission") as JevFraming;
    if (!(f in JEV_FRAMINGS)) throw new Error(`--framing: "${f}" is not one of ${Object.keys(JEV_FRAMINGS).join(", ")}`);
    if (f === "order" && !order) throw new Error(`--framing order: no order is written for "${id}" (src/sim/opord.ts)`);
    framing = f;
    const ask = jevAsker(client, model, f, order);
    commander = () => ({ ask });
  }
  // Timed here: nothing in src reads a clock.
  const timed = (ask: Asker): Asker => async (q) => {
    const started = Date.now();
    const a = await ask(q);
    return { ...a, ms: Date.now() - started };
  };
  const n = Number(value("--n") ?? 1);
  const out =
    value("--out") ?? (opordArg ? "jev-runs/order" : args.includes("--rule") ? "jev-runs/rule" : args.includes("--claude") ? `jev-runs/${value("--claude")}` : "jev-runs");
  if (defenderPlan !== "dead") framing += `, defender plan ${defenderPlan}`;
  if (fireOnTheMove !== undefined) framing += `, fire on the move ×${fireOnTheMove}`;
  if (attackerBreakpoint !== undefined) framing += `, attacker breaks at ${Math.round(attackerBreakpoint * 100)}%`;
  if (args.includes("--no-covered")) framing += ", no covered routes";
  if (args.includes("--no-together")) framing += ", platoons not together";
  if (args.includes("--brief-reserves")) framing += ", briefed on the reserves too";
  mkdirSync(out, { recursive: true });
  const attacker = listing.build(seed).game.attackers[0] ?? "BLUE";
  let wins = 0;
  let calls = 0;
  let ms = 0;
  let sure = 0;
  const tokens = { input: 0, cached: 0, written: 0, output: 0 };
  // Battles at once (`--parallel`): only the waits on the service overlap, the engine is synchronous.
  const parallel = Math.max(1, Number(value("--parallel") ?? 1));
  const play = async (s: number) => {
    try {
      const c = commander();
      const { result, answers: given, log } = await playWithAsker(
        (d) => runScenarioBattle(listing, s, { drill, fire: DEFAULT_FIRE_CHOICES, ...engine, ...orderLoa, decide: d }),
        timed(c.ask),
      );
      const plan = c.plan?.();
      // An order's battle carries the order as written and what was taken by the intent (decision 126).
      const ordered = written ? { order: written, byIntent: c.notes?.() ?? [] } : {};
      writeFileSync(`${out}/${id}-${s}.answers.json`, JSON.stringify(given));
      writeFileSync(`${out}/${id}-${s}.log.json`, JSON.stringify({ scenario: id, seed: s, framing, ...(plan ? { plan } : {}), ...ordered, result, log }, null, 1));
      if (result.winner === attacker) wins++;
      calls += log.length;
      ms += log.reduce((t, e) => t + (e.ms ?? 0), 0);
      sure += log.reduce((t, e) => t + e.confidence, 0);
      for (const e of log) {
        tokens.input += e.usage?.input ?? 0;
        tokens.cached += e.usage?.cached ?? 0;
        tokens.written += e.usage?.written ?? 0;
        tokens.output += e.usage?.output ?? 0;
      }
      console.log(`${id} seed ${s}: ${result.winner === attacker ? "the attack won" : result.winner === "draw" ? "a draw" : "the defence held"} on turn ${result.turns}, ${log.length} questions (${log[0]?.model ?? "-"})`);
    } catch (e) {
      const why = (e as Error).message;
      const host = args.includes("--claude") ? "api.anthropic.com" : "api.typesafe.ai";
      console.error(`ERROR seed ${s}: ${why}${/connect|fetch|ENOTFOUND|403/i.test(why) ? ` — is ${host} allowed by the environment's network policy?` : ""}`);
      process.exit(1);
    }
  };
  const seeds = Array.from({ length: n }, (_, i) => seed + i);
  for (let i = 0; i < seeds.length; i += parallel) await Promise.all(seeds.slice(i, i + parallel).map(play));
  console.log(
    `JEV ${id} (${framing}): the attack won ${wins} of ${n} (${Math.round((100 * wins) / n)}%); ${calls} questions, ` +
      `${calls ? Math.round(ms / calls) : 0} ms a call, mean confidence ${calls ? (sure / calls).toFixed(2) : "-"}` +
      (tokens.input + tokens.output ? `; tokens ${tokens.input} in (+${tokens.cached} cached, +${tokens.written} written to cache), ${tokens.output} out` : "") +
      `. Answers and logs in ${out}/.`,
  );
  process.exit(0);
}

try {
  const r = runScenarioBattle(listing, seed, { drill, fire: DEFAULT_FIRE_CHOICES, ...engine, decide });
  const attacker = listing.build(seed).game.attackers[0] ?? "BLUE";
  console.log(
    `RESULT ${id} seed ${seed}: ${r.winner === attacker ? "the attack won" : r.winner === "draw" ? "a draw" : (r.outOfTime ? "the defence held: the attack ran out of time" : "the defence held")} ` +
      `on turn ${r.turns}. Men down: attacker ${r.down[attacker]}/${r.men[attacker]}, defender ` +
      `${r.down[attacker === "BLUE" ? "RED" : "BLUE"]}/${r.men[attacker === "BLUE" ? "RED" : "BLUE"]}. ` +
      `Company went in on turn ${r.released ?? "-"}; missions fired ${r.missions[attacker]} HE and ${r.smoke[attacker]} smoke. Answers used: ${decide.asked.length}.`,
  );
  process.exit(0);
} catch (e) {
  if (!(e instanceof NeedAnswer)) {
    // A wrong answer is the answerer's mistake, not the tool's: say so plainly.
    if (e instanceof Error && /is not an option of/.test(e.message)) {
      console.error(`ERROR ${e.message}`);
      process.exit(2);
    }
    throw e;
  }
  const q = e.question;
  if (args.includes("--json")) console.log(JSON.stringify({ answered: answers.length, ...q }));
  else {
    console.log(`QUESTION ${answers.length + 1} (${q.id}, turn ${q.turn}, ${q.kind}): ${q.ask}`);
    for (const o of q.options) console.log(`  [${o.id}] ${o.label}`);
    console.log("\n" + q.view);
  }
  process.exit(3);
}

/** The scripted commander's choices as answers (`--rule`): `ruleDecide` (src/sim/ruleCommander.ts) as an asker. */
function ruleAsker(extra: Set<string>): Asker {
  const decide = ruleDecide(extra);
  return async (q) => ({ answer: decide(q), confidence: 1, model: "rule" });
}
