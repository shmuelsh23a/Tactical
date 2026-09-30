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
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { SCENARIOS } from "../src/app/scenario.js";
import { PLAIN_SCRIPT, WESTERN_DRILL } from "../src/app/drill.js";
import { DEFAULT_FIRE_CHOICES, runScenarioBattle } from "../src/sim/scenarioBattle.js";
import { NeedAnswer, fromAnswers } from "../src/sim/companyQuestions.js";
import { JEV_FRAMINGS, jevAsker, playWithAsker, type Asker, type JevFraming } from "../src/sim/jev.js";

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

if (args.includes("--jev")) {
  let client: TypeSafeClient;
  try {
    client = new TypeSafeClient({ logLevel: "error" });
  } catch (e) {
    console.error(`ERROR no Jev client: ${(e as Error).message.replace(/\.+$/, "")}. Set TYPESAFE_API_KEY in the environment.`);
    process.exit(2);
  }
  const model = value("--model");
  const framing = (value("--framing") ?? "mission") as JevFraming;
  if (!(framing in JEV_FRAMINGS)) throw new Error(`--framing: "${framing}" is not one of ${Object.keys(JEV_FRAMINGS).join(", ")}`);
  const jev = jevAsker(client, model, framing);
  // Timed here: nothing in src reads a clock.
  const timed: Asker = async (q) => {
    const started = Date.now();
    const a = await jev(q);
    return { ...a, ms: Date.now() - started };
  };
  const n = Number(value("--n") ?? 1);
  const out = value("--out") ?? "jev-runs";
  mkdirSync(out, { recursive: true });
  const attacker = listing.build(seed).game.attackers[0] ?? "BLUE";
  let wins = 0;
  let calls = 0;
  let ms = 0;
  let sure = 0;
  for (let s = seed; s < seed + n; s++) {
    try {
      const { result, answers: given, log } = await playWithAsker(
        (d) => runScenarioBattle(listing, s, { drill, fire: DEFAULT_FIRE_CHOICES, decide: d }),
        timed,
      );
      writeFileSync(`${out}/${id}-${s}.answers.json`, JSON.stringify(given));
      writeFileSync(`${out}/${id}-${s}.log.json`, JSON.stringify({ scenario: id, seed: s, framing, result, log }, null, 1));
      if (result.winner === attacker) wins++;
      calls += log.length;
      ms += log.reduce((t, e) => t + (e.ms ?? 0), 0);
      sure += log.reduce((t, e) => t + e.confidence, 0);
      console.log(`${id} seed ${s}: ${result.winner === attacker ? "the attack won" : result.winner === "draw" ? "a draw" : "the defence held"} on turn ${result.turns}, ${log.length} questions (${log[0]?.model ?? "-"})`);
    } catch (e) {
      const why = (e as Error).message;
      console.error(`ERROR seed ${s}: ${why}${/connect|fetch|ENOTFOUND|403/i.test(why) ? " — is api.typesafe.ai allowed by the environment's network policy?" : ""}`);
      process.exit(1);
    }
  }
  console.log(
    `JEV ${id} (${framing}): the attack won ${wins} of ${n} (${Math.round((100 * wins) / n)}%); ${calls} questions, ` +
      `${calls ? Math.round(ms / calls) : 0} ms a call, mean confidence ${calls ? (sure / calls).toFixed(2) : "-"}. Answers and logs in ${out}/.`,
  );
  process.exit(0);
}

try {
  const r = runScenarioBattle(listing, seed, { drill, fire: DEFAULT_FIRE_CHOICES, decide });
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
