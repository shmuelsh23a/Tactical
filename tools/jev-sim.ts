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
 */
import { readFileSync, existsSync } from "node:fs";
import { SCENARIOS } from "../src/app/scenario.js";
import { PLAIN_SCRIPT, WESTERN_DRILL } from "../src/app/drill.js";
import { DEFAULT_FIRE_CHOICES, runScenarioBattle } from "../src/sim/scenarioBattle.js";
import { NeedAnswer, fromAnswers } from "../src/sim/companyQuestions.js";

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
