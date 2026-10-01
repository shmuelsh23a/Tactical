/**
 * The scout question (`plan.scouts`) in several wordings, put to Jev and a
 * Claude model on the same pictures, to see what moves the answer
 * (docs/balance.md, forty-fourth round). Jev and every Claude model chose one
 * scout in nearly every battle (thirty-fifth round), which no commander does
 * (author, 2026-10-01). Nothing here changes a battle.
 *
 *   npm run scout-probe -- --seeds 20 --claude claude-haiku-4-5
 *
 * Needs TYPESAFE_API_KEY (Jev) and JEV_ANTHROPIC_API_KEY (Claude).
 */
import Anthropic from "@anthropic-ai/sdk";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { SCENARIOS } from "../src/app/scenario.js";
import { PLAIN_SCRIPT } from "../src/app/drill.js";
import { DEFAULT_FIRE_CHOICES, runScenarioBattle } from "../src/sim/scenarioBattle.js";
import { NeedAnswer, fromAnswers, type Question } from "../src/sim/companyQuestions.js";
import { jevAsker, type Asker } from "../src/sim/jev.js";
import { claudeAsker } from "../src/sim/claude.js";

const args = process.argv.slice(2);
const value = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const seeds = Number(value("--seeds") ?? 20);
const model = value("--claude") ?? "claude-haiku-4-5";
const scenario = value("--scenario") ?? "telAzekaAssault";
const listing = SCENARIOS.find((s) => s.id === scenario)!;

/** The question as a battle on `seed` puts it. */
function scoutQuestion(seed: number): Question {
  try {
    runScenarioBattle(listing, seed, { drill: { ...PLAIN_SCRIPT, scouting: { watchTurns: 1 } }, fire: DEFAULT_FIRE_CHOICES, decide: fromAnswers([]) });
  } catch (e) {
    if (e instanceof NeedAnswer && e.question.id === "plan.scouts") return e.question;
    throw e;
  }
  throw new Error("no scout question");
}

/**
 * The wording before the forty-fourth round: bare options, nothing on what
 * scouts do. The question as a battle puts it now is `current`.
 */
const BARE_ASK = "How many squads do you send ahead to find the enemy before the company goes? Scouts walk, look harder, hold their fire, and carry binoculars.";
const BARE_LABELS: Record<string, string> = { "1": "one squad", "2": "two squads", "3": "three squads" };
const VARIANTS: Record<string, (q: Question) => Question> = {
  current: (q) => q,
  bare: (q) => ({ ...q, ask: BARE_ASK, options: q.options.map((o) => ({ ...o, label: BARE_LABELS[o.id] ?? o.label })) }),
};

const askers: Record<string, Asker> = {};
try {
  askers.jev = jevAsker(new TypeSafeClient({ logLevel: "error" }), undefined, "mission");
} catch (e) {
  console.error(`no Jev: ${(e as Error).message}`);
}
const key = process.env.JEV_ANTHROPIC_API_KEY;
if (key) askers[model] = claudeAsker(new Anthropic({ apiKey: key, baseURL: "https://api.anthropic.com" }), { model });

const questions = Array.from({ length: seeds }, (_, i) => scoutQuestion(1000 + i));
for (const [who, ask] of Object.entries(askers)) {
  for (const [name, reword] of Object.entries(VARIANTS)) {
    const counts: Record<string, number> = {};
    const reasons: string[] = [];
    for (let i = 0; i < questions.length; i += 4) {
      const batch = await Promise.all(questions.slice(i, i + 4).map((q) => ask(reword(q))));
      for (const a of batch) {
        counts[a.answer] = (counts[a.answer] ?? 0) + 1;
        if (a.reason && reasons.length < 2) reasons.push(`${a.answer}: ${a.reason}`);
      }
    }
    console.log(`${who.padEnd(18)} ${name.padEnd(8)} ${["0", "1", "2", "3"].map((k) => `${k}:${counts[k] ?? 0}`).join("  ")}`);
    for (const r of reasons) console.log(`    ${r}`);
  }
}
