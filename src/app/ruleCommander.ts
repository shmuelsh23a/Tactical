import { LIFT_AT_M, PRIORITY_CALL_M, priorityCallFor } from "./computerSide.js";
import type { FirePolicy } from "./order.js";
import type { Decider, Question } from "./companyQuestions.js";

/**
 * The scripted commander's choices as answers to the typed questions
 * (`jev-sim --rule`): the standard measurement's company (docs/balance.md,
 * thirty-first round) put through the questions. Moved here from
 * `tools/jev-sim.ts` so the suite can hold an order to it (decision 126:
 * the reference plans written as orders play the same as their hand-built
 * form).
 *
 * `extra` adds "bound" (bound by platoon), "holdshort" (hold short under
 * the fires, lifted at once on reaching the line) and "holdfire" (no
 * mission before the company goes); "anyfire" fires on the first mark
 * offered, sure or not; "rush" sends the company in as soon as the enemy is
 * found, as Jev does, instead of shelling it for four turns first;
 * "onescout" sends one scout, as Jev does, not three; "blind" sends it in at
 * the first chance (turn 5), the enemy found or not, as Sonnet and Opus do;
 * "basefire" gives the first platoon a base of fire and sends the rest in;
 * "moveup" moves the company up to an assault position once the enemy is
 * found and goes from there; "flank" goes round a flank where the ground has
 * one (else by a scout's observation point), not straight; "prep" goes only
 * once most missions are fired on the enemy in sight (or by turn 30);
 * "noscout" sends no scouts, and the company goes at once; "twoscouts" sends
 * two; "posts-p1-p2-straight" sets where each scout watches; "earlyup" moves
 * up at the first chance, the enemy found or not.
 *
 * Fire (decision 93, in the questions): see {@link fireAnswer}.
 */
export function ruleDecide(extra: ReadonlySet<string> = new Set()): Decider {
  return (q) => {
    const has = (id: string) => q.options.some((o) => o.id === id);
    if (q.id === "plan.scouts") {
      if (extra.has("noscout")) return "0";
      if (extra.has("onescout")) return "1";
      if (extra.has("twoscouts")) return "2";
      // "maxscouts", every table before 2026-10-12: as many as offered.
      const most = Math.max(...q.options.map((o) => Number(o.id)));
      if (extra.has("maxscouts")) return most.toString();
      // One a platoon (2026-10-12, the author): a company of two sends two,
      // not three out of its second platoon. Its platoons are read off its
      // own forces in the view ("  BLUE-2-1 (infantry, squad) …").
      return Math.max(1, Math.min(most, platoonsInView(q.view))).toString();
    }
    if (q.id.startsWith("plan.post.")) {
      const i = Number(q.id.slice("plan.post.".length));
      // "posts-p1-p2-straight": where each scout watches, in turn.
      const set = [...extra].find((e) => e.startsWith("posts-"))?.split("-").slice(1);
      if (set?.[i - 1] && has(set[i - 1]!)) return set[i - 1]!;
      // Where the ground offers no observation point at all, straight (it used to answer "p1" there, not an option, and the battle stopped).
      return has(`p${i}`) ? `p${i}` : has("p1") ? "p1" : "straight";
    }
    if (q.id === "plan.wait") return "deadGround";
    if (/^go\.\d/.test(q.id)) {
      if (extra.has("blind")) return "yes";
      // "moveup": once the enemy is found, move up to an assault position chosen against it.
      if (extra.has("moveup") && has("up") && /just found|in sight \d+ turns/.test(q.ask)) return "up";
      // "earlyup": move up at the first chance, the enemy found or not, as Haiku does.
      if (extra.has("earlyup") && has("up")) return "up";
      if (extra.has("prep")) {
        // Fire first: go once most missions are fired on the enemy in sight, or by turn 30 whatever.
        const left = Number(/Mortar missions left: (\d+)/.exec(q.view)?.[1] ?? 0);
        return q.turn >= 30 || / all out of action/.test(q.ask) || (/in sight ([4-9]|\d\d) turns/.test(q.ask) && left <= 4) ? "yes" : "no";
      }
      if (extra.has("rush") && /just found|in sight \d+ turns/.test(q.ask)) return "yes";
      return / all out of action/.test(q.ask) || /in sight ([4-9]|\d\d) turns/.test(q.ask) ? "yes" : "no";
    }
    // "flank": round a flank where the ground has one, else by a scout's observation point.
    if (q.id.startsWith("go.axis"))
      return extra.has("flank") ? (q.options.find((o) => o.id.startsWith("flank:"))?.id ?? q.options.find((o) => o.id.startsWith("via:"))?.id ?? "straight") : "straight";
    if (q.id.startsWith("go.support")) return "no";
    // "basefire": the first platoon asked gives a base of fire, the rest assault.
    if (q.id.startsWith("go.platoon")) return extra.has("basefire") && q.id.startsWith("go.platoon.BLUE-1.") ? "support" : "assault";
    if (q.id.startsWith("go.bound")) return extra.has("bound") ? "yes" : "no";
    if (q.id.startsWith("go.lift")) return extra.has("holdshort") ? "yes" : "no";
    if (q.id.startsWith("lift")) return "yes";
    // The assault spent, the rest go in.
    if (q.id.startsWith("recommit")) return "yes";
    // The priority target (decision 93): the plan's centre; none with "oldfire".
    // "anyfire" is undiscriminating by design: it names none either.
    if (q.id === "plan.priority") return extra.has("oldfire") || extra.has("anyfire") ? "none" : "t1";
    if (q.id.startsWith("fire.")) {
      const policy: FirePolicy = extra.has("anyfire") ? "anyMark" : extra.has("oldfire") ? "sureMarks" : extra.has("opportunity") ? "opportunity" : "doctrine";
      return fireAnswer(q, policy, extra.has("holdfire"));
    }
    return has("on") ? "on" : q.options[0]!.id;
  };
}

/** How many platoons the commander's own forces in the view make up. */
export function platoonsInView(view: string): number {
  return new Set([...view.matchAll(/^\s+([A-Z]+-\d+)-[A-Z0-9]+ \(infantry/gm)].map((m) => m[1])).size;
}

/**
 * How the company's mortars are fired, as the fire question is answered:
 *
 * - `doctrine` (decision 93): the priority target, called once the company
 *   has gone and its nearest squad is within its tube's call distance —
 *   PRIORITY_CALL_M, or priorityCallFor the guns — and beyond its lift;
 *   else a sure mark on a planned target; else a firer in sight, never one
 *   within LIFT_AT_M of its squads.
 * - `opportunity`: the priority target kept, and every other mission free
 *   for targets of opportunity (ATP 3-21.8, 2024, para B-23), as `sureMarks`
 *   chooses them.
 * - `sureMarks` ("oldfire"): no priority target; any mark sure to 40 m and in
 *   sight, squads first — every table before 2026-10-12.1.
 * - `anyMark` ("anyfire"): the first mark offered, whatever it is.
 *
 * `holdUntilGo` fires nothing before the company has gone. The policies
 * are named in the order (`FirePolicy`, src/app/order.ts).
 */

export function fireAnswer(q: Question, policy: FirePolicy, holdUntilGo = false): string {
  if (holdUntilGo && /has not gone in/.test(q.view)) return "hold";
  if (policy === "anyMark") return q.options.find((o) => o.id !== "hold" && !o.id.startsWith("smoke:") && o.id !== "priority")?.id ?? "hold";
  const sure = (o: { label: string }) => /in sight/.test(o.label) && Number(/±(\d+) m/.exec(o.label)?.[1] ?? 999) <= 40;
  const marks = q.options.filter((o) => !o.id.startsWith("smoke:") && o.id !== "priority" && o.id !== "hold");
  const squadsFirst = () => {
    const fit = marks.filter(sure);
    return (fit.find((o) => /infantry/.test(o.label)) ?? fit[0])?.id ?? "hold";
  };
  if (policy === "sureMarks") return squadsFirst();
  const p = q.options.find((o) => o.id === "priority");
  const near = Number(/nearest squad is (\d+) m/.exec(p?.label ?? "")?.[1] ?? Infinity);
  // The guns land two turns after the call, so they are called further out (decision 95).
  const callAt = /artillery/.test(p?.label ?? "") ? priorityCallFor("artillery") : PRIORITY_CALL_M;
  if (p && !/has not gone in/.test(q.view) && near <= callAt) return "priority";
  if (policy === "opportunity") return squadsFirst();
  // Not on its own squads: a mark within the lift distance of them is left alone, as the scripted commander's.
  const clear = (o: { label: string }) => Number(/nearest squad is (\d+) m from it/.exec(o.label)?.[1] ?? Infinity) > LIFT_AT_M;
  const planned = marks.filter((o) => sure(o) && clear(o) && /on your planned target/.test(o.label));
  if (planned.length) return (planned.find((o) => /infantry/.test(o.label)) ?? planned[0])!.id;
  return marks.find((o) => /FIRING ON YOUR SQUADS/.test(o.label) && /in sight/.test(o.label) && clear(o))?.id ?? "hold";
}
