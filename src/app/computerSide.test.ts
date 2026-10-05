import { describe, expect, it } from "vitest";
import { telAzekaAssaultListing } from "./scenarios/telAzekaAssault.js";
import { ComputerDefender } from "./computerSide.js";
import { replayGame } from "../engine/index.js";
import { buildActivations } from "./hotseat.js";
import type { DrillReport } from "./drill.js";
import type { Game, Point } from "../engine/index.js";

/**
 * A battle the way the browser plays it against the computer: activation by
 * activation in initiative order, the computer's played out on the spot, and
 * the player's side (BLUE here) simply walking at the defence on standing
 * orders. Returns the game and how many times the computer's forces shot.
 */
function play(seed: number, turns: number, report?: DrillReport): { game: Game; shots: number; planned: readonly Point[] } {
  const built = telAzekaAssaultListing.build(seed);
  const g = built.game;
  const ai = new ComputerDefender(g, "RED", built);
  const planned = ai.plan(g);
  const red = g.units.filter((u) => u.side === "RED");
  const at = {
    x: red.reduce((t, u) => t + u.position.x, 0) / red.length,
    y: red.reduce((t, u) => t + u.position.y, 0) / red.length,
  };
  for (const u of g.units) {
    if (u.side === "BLUE" && u.kind === "infantry") g.setStandingOrder(u.id, { gait: "normal", destination: at });
  }
  // Closing a turn begins the next, so the game is begun once.
  if (turns > 0) g.beginTurn();
  for (let turn = 0; turn < turns; turn++) {
    for (const act of buildActivations(g.initiativeOrder)) {
      if (g.phase !== act.phase) g.advanceToPhase(act.phase);
      if (act.side === "RED") {
        if (act.phase === "targeting") ai.targeting(g);
        else if (act.phase === "movement") ai.movement(g, report);
        else ai.combat(g, report);
      } else if (act.phase !== "targeting") {
        g.executeStandingOrders("BLUE");
      }
    }
    g.advanceToPhase("initiative");
  }
  // The computer's shots, read off the journal rather than a reporter, so a
  // run with none counts them too.
  const shots = g
    .toRecording()
    .actions.filter((a) => a.kind === "fire" && a.attackerId.startsWith("RED")).length;
  return { game: g, shots, planned };
}

describe("the computer holding a position (single-player)", () => {
  it("plans its mortars on its own map before the battle", () => {
    const { game, planned } = play(1000, 0);
    expect(planned.length).toBeGreaterThan(0);
    expect(planned.length).toBeLessThanOrEqual(6);
    expect(game.registeredTargets.filter((t) => t.side === "RED")).toHaveLength(planned.length);
    expect(game.registeredTargets.filter((t) => t.side === "BLUE")).toHaveLength(0);
  });

  it("fights an attack that walks at it, and plays the same way every time from the same seed", () => {
    const a = play(1000, 20);
    const b = play(1000, 20);
    // Twenty turns of an attack walking up the slope bring it into the defence's fire.
    expect(a.shots).toBeGreaterThan(0);
    expect(a.game.toRecording()).toEqual(b.game.toRecording());
  });

  it("is told about, not changed by, the reporter the browser hangs on it", () => {
    const lines: string[] = [];
    // Every hook, as the browser hangs them…
    const told = play(1000, 20, {
      executed: (done) => lines.push(...done.map((d) => d.unitId)),
      fired: (u, t) => lines.push(`${u.id}>${t.id}`),
      explosive: (u, t, w) => lines.push(`${u.id}>${w}>${t.id}`),
      grenadiers: (u, t, v) => lines.push(`${u.id}>${v.length}g>${t.id}`),
      assaulted: (u, t) => lines.push(`${u.id}!${t.id}`),
    });
    // …against none at all, as the headless harness runs the drill.
    const silent = play(1000, 20, undefined);
    expect(lines.length).toBeGreaterThan(0);
    expect(told.game.toRecording()).toEqual(silent.game.toRecording());
  });
});

describe("a battle against the computer, saved and resumed", () => {
  it("goes on from the save exactly as it would have without stopping, mid-turn included", () => {
    const steps = (g: Game, ai: ComputerDefender, from: number, to: number) => {
      // Activation by activation across turns, as the browser plays them.
      let i = 0;
      while (i < to) {
        const acts = buildActivations(g.initiativeOrder);
        // The save point is counted in activations, six a turn (three phases, two sides).
        expect(acts).toHaveLength(6);
        for (const act of acts) {
          if (i >= from && i < to) {
            if (g.phase !== act.phase) g.advanceToPhase(act.phase);
            if (act.side === "RED") {
              if (act.phase === "targeting") ai.targeting(g);
              else if (act.phase === "movement") ai.movement(g);
              else ai.combat(g);
            } else if (act.phase !== "targeting") g.executeStandingOrders("BLUE");
          }
          i++;
          if (i >= to) return;
        }
        if (i > from) g.advanceToPhase("initiative");
      }
    };
    const start = () => {
      // Seed 1000, the standard measurement's first: its walking attack is
      // under the defence's fire well before the 20 turns played here.
      const built = telAzekaAssaultListing.build(1000);
      const g = built.game;
      const ai = new ComputerDefender(g, "RED", built);
      ai.plan(g);
      const red = g.units.filter((u) => u.side === "RED");
      const at = { x: red.reduce((t, u) => t + u.position.x, 0) / red.length, y: red.reduce((t, u) => t + u.position.y, 0) / red.length };
      for (const u of g.units) if (u.side === "BLUE" && u.kind === "infantry") g.setStandingOrder(u.id, { gait: "normal", destination: at });
      g.beginTurn();
      return { g, ai, ground: built };
    };
    // Six activations a turn: stop 50 in, on turn 9's movement.
    const SAVE_AT = 50;
    const END = 120;
    const straight = start();
    steps(straight.g, straight.ai, 0, END);

    const before = start();
    steps(before.g, before.ai, 0, SAVE_AT);
    const recording = JSON.parse(JSON.stringify(before.g.toRecording()));
    const saved = JSON.parse(JSON.stringify(before.ai.snapshot()));
    const g = replayGame(recording);
    const ai = ComputerDefender.restore(g, saved, before.ground);
    steps(g, ai, SAVE_AT, END);

    expect(g.toRecording()).toEqual(straight.g.toRecording());
    // …and the battle had something in it worth resuming.
    expect(g.toRecording().actions.filter((a) => a.kind === "fire").length).toBeGreaterThan(0);
  });
});
