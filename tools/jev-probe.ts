/**
 * How Jev answers depends on how a question is put to it. This probe takes
 * the questions of battles Jev has already played (`jev-runs/`), puts each
 * again in several framings, and prints how the answers move — which is how
 * the question set is tuned (docs/balance.md, *Jev*). Needs `TYPESAFE_API_KEY`
 * and `api.typesafe.ai` reachable.
 *
 *   npm run jev-probe                                   # every framing, the default questions
 *   npm run jev-probe -- --only 'go.platoon|platoon\.' --variants plain,mission,mission+clock@jev-preview
 *   npm run jev-probe -- --runs jev-runs --per 20
 *
 * A question is recovered by replaying its battle's answers up to it, so the
 * probe sees exactly the view Jev saw. Nothing here changes a battle.
 */
import { readFileSync, readdirSync } from "node:fs";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { SCENARIOS } from "../src/app/scenario.js";
import { PLAIN_SCRIPT, WESTERN_DRILL } from "../src/app/drill.js";
import { DEFAULT_FIRE_CHOICES, runScenarioBattle } from "../src/sim/scenarioBattle.js";
import { NeedAnswer, fromAnswers, type Question } from "../src/sim/companyQuestions.js";
import { jevAsker, jevRequest, JEV_FRAMINGS, type JevFraming } from "../src/sim/jev.js";

const args = process.argv.slice(2);
const value = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const dir = value("--runs") ?? "jev-runs";
const only = new RegExp(value("--only") ?? "^(go\\.platoon|platoon\\.|lift|plan\\.wait|plan\\.scouts|go\\.\\d)");
const per = Number(value("--per") ?? 15);
// A variant is a framing, then any of the rewordings below as `+name`, then optionally `@model`;
// `repeat` is `plain` again, to see how much Jev varies by itself.
const variants = (value("--variants") ?? "plain,repeat,mission,mission@jev-preview,role,mission+first").split(",");
const drill = { ...(value("--drill") === "western" ? WESTERN_DRILL : PLAIN_SCRIPT), scouting: { watchTurns: 1 } };

/** The questions of one recorded battle, each as Jev saw it, with the answer it gave. */
function recover(file: string): { q: Question; given: string }[] {
  const { scenario, seed, log } = JSON.parse(readFileSync(`${dir}/${file}`, "utf8")) as {
    scenario: string;
    seed: number;
    log: { id: string; answer: string }[];
  };
  const listing = SCENARIOS.find((s) => s.id === scenario)!;
  const answers = log.map((e) => e.answer);
  const out: { q: Question; given: string }[] = [];
  log.forEach((e, k) => {
    if (!only.test(e.id)) return;
    try {
      runScenarioBattle(listing, seed, { drill, fire: DEFAULT_FIRE_CHOICES, decide: fromAnswers(answers.slice(0, k)) });
    } catch (err) {
      if (err instanceof NeedAnswer && err.question.id === e.id) out.push({ q: err.question, given: e.answer });
      else throw err;
    }
  });
  return out;
}

const kindOf = (q: Question) =>
  q.id.replace(/\.\d+$/, "").replace(/BLUE-\d/, "BLUE-n").replace(/^go\.\d+$/, "go") +
  (/^platoon\./.test(q.id) ? (/still in reserve/.test(q.ask) ? " (in reserve)" : / halted/.test(q.ask) ? " (halted)" : " (hit)") : "") +
  (/^go\.\d/.test(q.id)
    ? / all out of action/.test(q.ask)
      ? " (scouts lost)"
      : /in sight \d+ turns/.test(q.ask)
        ? " (enemy held in sight)"
        : /just found/.test(q.ask)
          ? " (enemy just found)"
          : " (enemy not in sight)"
    : "") +
  (/^fire\./.test(q.id) ? (/has not gone in/.test(q.view) ? " (company not gone in)" : " (company gone in)") : "");
const byKind = new Map<string, { q: Question; given: string }[]>();
for (const f of readdirSync(dir).filter((f) => f.endsWith(".log.json")).sort()) {
  for (const r of recover(f)) {
    const k = kindOf(r.q);
    const list = byKind.get(k) ?? [];
    if (list.length < per) list.push(r);
    byKind.set(k, list);
  }
}

const client = new TypeSafeClient({ logLevel: "error" });
const framingOf = (v: string): { framing: JevFraming; rewords: ((q: Question) => Question)[]; model?: string } => {
  const [head, model] = v.split("@");
  const [f, ...extra] = head!.split("+");
  const framing = (f === "repeat" ? "plain" : f) as JevFraming;
  if (!(framing in JEV_FRAMINGS)) throw new Error(`--variants: "${f}" is not one of ${Object.keys(JEV_FRAMINGS).join(", ")}, repeat`);
  const rewords = extra.map((x) => {
    const r = REWORD[x];
    if (!r) throw new Error(`--variants: "+${x}" is not one of ${Object.keys(REWORD).join(", ")}`);
    return r;
  });
  return { framing, rewords, ...(model ? { model } : {}) };
};

/** Rewordings to try before they go into the question set (a variant's `+name`). */
const REWORD: Record<string, (q: Question) => Question> = {
  /** The question says how many turns are left to take the objective, read from the view. */
  clock: (q) => {
    const left = /\((\d+) turns left/.exec(q.view)?.[1];
    return left ? { ...q, ask: `${q.ask} (${left} turns left to take the objective.)` } : q;
  },
  /** "Carry on" offered first rather than last. */
  first: (q) => ({ ...q, options: [...q.options.filter((o) => o.id === "on"), ...q.options.filter((o) => o.id !== "on")] }),
};

console.log(`Questions from ${dir}/, up to ${per} of each kind. Each cell: the answers given, and the mean confidence.\n`);
for (const [kind, rs] of byKind) {
  console.log(`## ${kind} (${rs.length}): ${rs[0]!.q.ask.slice(0, 110)}…`);
  console.log(`  ${"recorded".padEnd(22)} ${tally(rs.map((r) => r.given))}`);
  for (const v of variants) {
    const { framing, rewords, model } = framingOf(v);
    const ask = jevAsker(client, model, framing);
    const got = await Promise.all(rs.map((r) => ask(rewords.reduce((q, f) => f(q), r.q))));
    const sure = got.reduce((t, a) => t + a.confidence, 0) / got.length;
    const same = got.filter((a, i) => a.answer === rs[i]!.given).length;
    console.log(`  ${v.padEnd(22)} ${tally(got.map((a) => a.answer))}  conf ${sure.toFixed(2)}, same as recorded ${same}/${rs.length}`);
  }
  if (args.includes("--show")) console.log(JSON.stringify(jevRequest(rs[0]!.q), null, 1));
  console.log();
}

function tally(xs: string[]): string {
  const c = new Map<string, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(" ");
}
