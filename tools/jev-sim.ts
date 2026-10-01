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
 *   npm run jev-sim -- --jev --framing order --seed 1000 --n 20
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { SCENARIOS } from "../src/app/scenario.js";
import { PLAIN_SCRIPT, WESTERN_DRILL } from "../src/app/drill.js";
import { DEFAULT_FIRE_CHOICES, runScenarioBattle } from "../src/sim/scenarioBattle.js";
import { NeedAnswer, fromAnswers } from "../src/sim/companyQuestions.js";
import { JEV_FRAMINGS, jevAsker, playWithAsker, type Asker, type JevFraming } from "../src/sim/jev.js";
import { claudeCommander, type ClaudeAskerOptions } from "../src/sim/claude.js";
import { ORDERS } from "../src/sim/opord.js";

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
const drill = { ...(value("--drill") === "western" ? WESTERN_DRILL : PLAIN_SCRIPT), scouting: { watchTurns: 1 } };
const decide = fromAnswers(answers);
// Where the scripted defender registers its mortars (`--defender-plan`): dead ground (the default), open ground, or nothing.
const defenderPlan = value("--defender-plan") ?? "dead";
if (!["dead", "open", "none"].includes(defenderPlan)) throw new Error(`--defender-plan: "${defenderPlan}" is not one of dead, open, none`);
const defenderFirePlan = defenderPlan === "none" ? false : defenderPlan === "open" ? ("open" as const) : true;
// Fire on the move (`--fire-on-the-move 0.5`): a force that moved fires at that factor of its hit chance.
const fireOnTheMove = value("--fire-on-the-move") === undefined ? undefined : Number(value("--fire-on-the-move"));
if (fireOnTheMove !== undefined && !(fireOnTheMove > 0 && fireOnTheMove <= 1)) throw new Error("--fire-on-the-move: a factor in (0, 1]");
const engine = { defenderFirePlan, ...(fireOnTheMove !== undefined ? { fireOnTheMove } : {}) };

if (args.includes("--jev") || args.includes("--rule") || args.includes("--claude")) {
  // A commander for each battle: a Claude model with a plan or a memory keeps state between questions.
  let commander: () => { ask: Asker; plan?: () => string | undefined };
  let framing = "rule";
  const order = ORDERS[id];
  if (args.includes("--claude")) {
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
    };
    commander = () => claudeCommander(client, opts);
    framing = [`claude:${model}${effort ? `@${effort}` : ""}`, ...(["order", "plan", "memory"] as const).filter((f) => args.includes(`--${f}`))].join("+");
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
    value("--out") ?? (args.includes("--rule") ? "jev-runs/rule" : args.includes("--claude") ? `jev-runs/${value("--claude")}` : "jev-runs");
  if (defenderPlan !== "dead") framing += `, defender plan ${defenderPlan}`;
  if (fireOnTheMove !== undefined) framing += `, fire on the move ×${fireOnTheMove}`;
  mkdirSync(out, { recursive: true });
  const attacker = listing.build(seed).game.attackers[0] ?? "BLUE";
  let wins = 0;
  let calls = 0;
  let ms = 0;
  let sure = 0;
  const tokens = { input: 0, cached: 0, output: 0 };
  // Battles at once (`--parallel`): only the waits on the service overlap, the engine is synchronous.
  const parallel = Math.max(1, Number(value("--parallel") ?? 1));
  const play = async (s: number) => {
    try {
      const c = commander();
      const { result, answers: given, log } = await playWithAsker(
        (d) => runScenarioBattle(listing, s, { drill, fire: DEFAULT_FIRE_CHOICES, ...engine, decide: d }),
        timed(c.ask),
      );
      const plan = c.plan?.();
      writeFileSync(`${out}/${id}-${s}.answers.json`, JSON.stringify(given));
      writeFileSync(`${out}/${id}-${s}.log.json`, JSON.stringify({ scenario: id, seed: s, framing, ...(plan ? { plan } : {}), result, log }, null, 1));
      if (result.winner === attacker) wins++;
      calls += log.length;
      ms += log.reduce((t, e) => t + (e.ms ?? 0), 0);
      sure += log.reduce((t, e) => t + e.confidence, 0);
      for (const e of log) {
        tokens.input += e.usage?.input ?? 0;
        tokens.cached += e.usage?.cached ?? 0;
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
      (tokens.input + tokens.output ? `; tokens ${tokens.input} in (+${tokens.cached} cached), ${tokens.output} out` : "") +
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

/**
 * The scripted commander's choices as answers (`--rule`): the standard
 * measurement's company (docs/balance.md, thirty-first round) put through the
 * questions. `extra` adds "bound" (bound by platoon), "holdshort" (hold
 * short under the fires, lifted at once on reaching the line) and "holdfire"
 * (no mission before the company goes); "anyfire" fires on the first mark
 * offered, sure or not; "rush" sends the company in as soon as the enemy is
 * found, as Jev does, instead of shelling it for four turns first; "onescout"
 * sends one scout, as Jev does, not three; "blind" sends it in at the first
 * chance (turn 5), the enemy found or not, as Sonnet and Opus do; "basefire"
 * gives the first platoon a base of fire and sends the rest in; "moveup"
 * moves the company up to its assault position at the first chance and goes
 * from there; "flank" goes in by the first scout's observation point, not
 * straight; "prep" goes only once most missions are fired on the enemy in
 * sight (or by turn 30); "noscout" sends no scouts, and the company goes at once.
 */
function ruleAsker(extra: Set<string>): Asker {
  return async (q) => {
    const has = (id: string) => q.options.some((o) => o.id === id);
    const pick = (): string => {
      if (q.id === "plan.scouts") return extra.has("noscout") ? "0" : extra.has("onescout") ? "1" : Math.max(...q.options.map((o) => Number(o.id))).toString();
      if (q.id.startsWith("plan.post.")) {
        const i = Number(q.id.slice("plan.post.".length));
        return has(`p${i}`) ? `p${i}` : "p1";
      }
      if (q.id === "plan.wait") return "deadGround";
      if (/^go\.\d/.test(q.id)) {
        if (extra.has("blind")) return "yes";
        if (extra.has("moveup") && has("up")) return "up";
        if (extra.has("prep")) {
          // Fire first: go once most missions are fired on the enemy in sight, or by turn 30 whatever.
          const left = Number(/Mortar missions left: (\d+)/.exec(q.view)?.[1] ?? 0);
          return q.turn >= 30 || / all out of action/.test(q.ask) || (/in sight ([4-9]|\d\d) turns/.test(q.ask) && left <= 4) ? "yes" : "no";
        }
        if (extra.has("rush") && /just found|in sight \d+ turns/.test(q.ask)) return "yes";
        return / all out of action/.test(q.ask) || /in sight ([4-9]|\d\d) turns/.test(q.ask) ? "yes" : "no";
      }
      if (q.id.startsWith("go.axis")) return extra.has("flank") ? (q.options.find((o) => o.id.startsWith("via:"))?.id ?? "straight") : "straight";
      if (q.id.startsWith("go.support")) return "no";
      // "basefire": the first platoon asked gives a base of fire, the rest assault.
      if (q.id.startsWith("go.platoon")) return extra.has("basefire") && q.id.startsWith("go.platoon.BLUE-1.") ? "support" : "assault";
      if (q.id.startsWith("go.bound")) return extra.has("bound") ? "yes" : "no";
      if (q.id.startsWith("go.lift")) return extra.has("holdshort") ? "yes" : "no";
      if (q.id.startsWith("lift")) return "yes";
      if (q.id.startsWith("fire.")) {
        if (extra.has("holdfire") && /has not gone in/.test(q.view)) return "hold";
        // "anyfire": the first mark offered, whatever it is.
        if (extra.has("anyfire")) return q.options.find((o) => o.id !== "hold" && !o.id.startsWith("smoke:"))?.id ?? "hold";
        // Squads first, then anything, each sure to 40 m and in sight.
        const fit = q.options.filter((o) => /in sight/.test(o.label) && Number(/±(\d+) m/.exec(o.label)?.[1] ?? 999) <= 40 && !o.id.startsWith("smoke:"));
        return (fit.find((o) => /infantry/.test(o.label)) ?? fit[0])?.id ?? "hold";
      }
      return has("on") ? "on" : q.options[0]!.id;
    };
    return { answer: pick(), confidence: 1, model: "rule" };
  };
}
