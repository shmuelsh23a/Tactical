import { describe, it, expect } from "vitest";
import { telAzekaAssaultListing } from "../app/scenarios/telAzekaAssault.js";
import { PLAIN_SCRIPT } from "../app/drill.js";
import { DEFAULT_FIRE_CHOICES, planDefenderFires, runScenarioBattle, runScenario } from "./scenarioBattle.js";
import type { Question } from "./companyQuestions.js";
import { isDeadGround } from "../app/deadGround.js";
import { EYE_HEIGHT, distance } from "../engine/index.js";

/**
 * The headless scenario runner: a generated scenario played on its real
 * ground with no browser. Kept small here so it cannot rot; the measurements
 * are `npm run scenario-sim` (docs/balance.md).
 */
describe("the headless scenario runner", () => {
  const plain = { drill: PLAIN_SCRIPT, fire: DEFAULT_FIRE_CHOICES };
  const recon = {
    drill: { ...PLAIN_SCRIPT, scouting: { watchTurns: 1 } },
    company: { recon: { scouts: 2, lookTurns: 4, scoutFrom: "vantage" as const }, waitIn: "deadGround" as const },
    fire: { ...DEFAULT_FIRE_CHOICES, waitForContact: true },
  };

  it("plays a scenario to an end, the same way every time from the same seed", () => {
    const a = runScenarioBattle(telAzekaAssaultListing, 11, plain);
    const b = runScenarioBattle(telAzekaAssaultListing, 11, plain);
    expect(a).toEqual(b);
    expect(a.turns).toBeGreaterThan(0);
    expect(a.down.RED + a.down.BLUE).toBeGreaterThan(0);
  });

  it("plays a company that reconnoitres from an observation point and waits in dead ground", () => {
    const r = runScenarioBattle(telAzekaAssaultListing, 11, recon);
    expect(r.released).toBeDefined();
    expect(r.missions.BLUE).toBeGreaterThan(0);
  });

  it("sums a set of battles", () => {
    const s = runScenario(telAzekaAssaultListing, [11, 12], plain);
    expect(s.battles).toBe(2);
    expect(s.attackerWins + s.defenderWins + s.draws).toBe(2);
  });
});

describe("the defending company's fire plan", () => {
  const { game, mapWidth, mapHeight } = telAzekaAssaultListing.build();
  const own = game.units.filter((u) => u.side === "RED" && u.kind === "infantry");
  const blue = game.units.filter((u) => u.side === "BLUE" && u.kind !== "command");
  const attackFrom = {
    x: blue.reduce((t, u) => t + u.position.x, 0) / blue.length,
    y: blue.reduce((t, u) => t + u.position.y, 0) / blue.length,
  };
  const centre = { x: own.reduce((t, u) => t + u.position.x, 0) / own.length, y: own.reduce((t, u) => t + u.position.y, 0) / own.length };
  const plan = planDefenderFires(game, "RED", attackFrom, mapWidth, mapHeight);

  it("registers six targets on the dead ground in front of it, spaced to cover it", () => {
    expect(plan).toHaveLength(6);
    const query = { terrain: game.terrain!, watchers: own.map((u) => u.position), watcherEye: EYE_HEIGHT.fullCover, reach: Infinity };
    for (const p of plan) {
      expect(isDeadGround(query, p)).toBe(true);
      expect(distance(p, centre)).toBeGreaterThanOrEqual(100);
      // Toward the attack: nearer the attacker's start line than the defence is.
      expect(distance(p, attackFrom)).toBeLessThan(distance(centre, attackFrom));
      for (const q of plan) if (q !== p) expect(distance(p, q)).toBeGreaterThanOrEqual(120);
    }
    // The nearest ground first: the first target is closer than the last.
    expect(distance(plan[0]!, centre)).toBeLessThan(distance(plan.at(-1)!, centre));
  });

  it("registers on open ground first when told to", () => {
    const open = planDefenderFires(game, "RED", attackFrom, mapWidth, mapHeight, "open");
    const query = { terrain: game.terrain!, watchers: own.map((u) => u.position), watcherEye: EYE_HEIGHT.fullCover, reach: Infinity };
    expect(open).toHaveLength(6);
    expect(open.filter((p) => !isDeadGround(query, p)).length).toBeGreaterThan(open.filter((p) => isDeadGround(query, p)).length);
    expect(open).not.toEqual(plan);
  });

  it("fires some of its missions on the plan, and none without one", () => {
    const opts = { drill: { ...PLAIN_SCRIPT, scouting: { watchTurns: 1 } }, fire: DEFAULT_FIRE_CHOICES };
    const withPlan = [11, 12, 13].map((s) => runScenarioBattle(telAzekaAssaultListing, s, opts));
    expect(withPlan.some((r) => r.defenderPlanned > 0)).toBe(true);
    for (const r of withPlan) expect(r.defenderPlanned).toBeLessThanOrEqual(r.missions.RED);
    const without = runScenarioBattle(telAzekaAssaultListing, 11, { ...opts, defenderFirePlan: false });
    expect(without.defenderPlanned).toBe(0);
  });
});

describe("moving up to an assault position", () => {
  it("is offered while the company holds, moves it nearer the enemy, and the picture says so", () => {
    const asked: Question[] = [];
    const decide = (q: Question): string => {
      asked.push(q);
      if (q.id === "plan.scouts") return "3";
      if (q.id === "plan.wait") return "deadGround";
      if (/^go\.\d/.test(q.id)) return q.options.some((o) => o.id === "up") ? "up" : q.turn >= 15 ? "yes" : "no";
      return q.options[0]!.id;
    };
    const opts = { drill: { ...PLAIN_SCRIPT, scouting: { watchTurns: 1 } }, fire: DEFAULT_FIRE_CHOICES, decide };
    const r = runScenarioBattle(telAzekaAssaultListing, 1000, opts);
    const gos = asked.filter((q) => /^go\.\d/.test(q.id));
    // The first is a choice of three; once moved up, a yes or no.
    expect(gos[0]!.kind).toBe("choice");
    expect(gos[0]!.options.map((o) => o.id)).toEqual(["yes", "up", "no"]);
    expect(gos[1]!.kind).toBe("noul");
    expect(gos[1]!.options.map((o) => o.id)).toEqual(["yes", "no"]);
    expect(gos[1]!.view).toContain("moved up to its assault position");
    expect(r.released).toBeGreaterThanOrEqual(15);
  }, 60_000);
});
