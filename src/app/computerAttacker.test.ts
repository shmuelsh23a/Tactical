import { describe, expect, it } from "vitest";
import { telAzekaAssaultListing } from "./scenarios/telAzekaAssault.js";
import { ComputerAttacker } from "./computerSide.js";
import { briefedObjective } from "./planning.js";
import { buildActivations } from "./hotseat.js";
import type { DrillReport } from "./drill.js";
import { replayGame } from "../engine/index.js";
import type { Game, Point } from "../engine/index.js";

/**
 * A battle the way the browser plays it against the computer attacking:
 * activation by activation in initiative order, the computer's played out on
 * the spot, and the player's side (RED here) holding its prepared position
 * without being touched — which is what a defender does until it chooses
 * otherwise. Returns the game and how many times the computer's forces shot.
 */
function play(seed: number, turns: number, report?: DrillReport): { game: Game; shots: number; planned: readonly Point[] } {
  const built = telAzekaAssaultListing.build(seed);
  const g = built.game;
  const ai = new ComputerAttacker(g, "BLUE", briefedObjective(g, "BLUE", "RED"), built);
  const planned = ai.plan(g);
  // Closing a turn begins the next, so the game is begun once.
  if (turns > 0) g.beginTurn();
  for (let turn = 0; turn < turns; turn++) {
    for (const act of buildActivations(g.initiativeOrder)) {
      if (g.phase !== act.phase) g.advanceToPhase(act.phase);
      if (act.side !== "BLUE") continue;
      if (act.phase === "targeting") ai.targeting(g);
      else if (act.phase === "movement") ai.movement(g, report);
      else ai.combat(g, report);
    }
    g.advanceToPhase("initiative");
  }
  const shots = g
    .toRecording()
    .actions.filter((a) => a.kind === "fire" && a.attackerId.startsWith("BLUE")).length;
  return { game: g, shots, planned };
}

describe("the computer attacking a position (single-player)", () => {
  it("registers its plan's frontage before the battle, and nothing of the defender's", () => {
    const { game, planned } = play(1000, 0);
    // The plan's three points: its centre and either flank (`attackerPlan`).
    expect(planned).toHaveLength(3);
    expect(game.registeredTargets.filter((t) => t.side === "BLUE")).toHaveLength(3);
    expect(game.registeredTargets.filter((t) => t.side === "RED")).toHaveLength(0);
  });

  it("is briefed on where the defence is thought to be, not where it is", () => {
    const built = telAzekaAssaultListing.build(1000);
    const g = built.game;
    const told = briefedObjective(g, "BLUE", "RED");
    const red = g.units.filter((u) => u.side === "RED" && u.kind !== "command");
    const truth = {
      x: red.reduce((t, u) => t + u.position.x, 0) / red.length,
      y: red.reduce((t, u) => t + u.position.y, 0) / red.length,
    };
    const off = Math.hypot(told.x - truth.x, told.y - truth.y);
    // An observer's error at this range is tens of metres, never nothing
    // (rules decision 51) — the plan is wrong, which is the point.
    expect(off).toBeGreaterThan(1);
    // Drawn from the planning stream: the same seed briefs it the same way.
    expect(briefedObjective(telAzekaAssaultListing.build(1000).game, "BLUE", "RED")).toEqual(told);
  });

  it("comes on at the position, and plays the same way every time from the same seed", () => {
    // Thirty turns, not twenty: the company's scouts look for the agreed
    // number of turns before the rest are let go, and the 400 m to the
    // objective are crossed after that — so a shorter battle has nothing
    // in it to shoot at. Seed 1000 is the standard measurement's first.
    const a = play(1000, 30);
    const b = play(1000, 30);
    expect(a.shots).toBeGreaterThan(0);
    expect(a.game.toRecording()).toEqual(b.game.toRecording());
  });

  it("is told about, not changed by, the reporter the browser hangs on it", () => {
    const lines: string[] = [];
    const told = play(1000, 30, {
      executed: (done) => lines.push(...done.map((d) => d.unitId)),
      fired: (u, t) => lines.push(`${u.id}>${t.id}`),
      explosive: (u, t, w) => lines.push(`${u.id}>${w}>${t.id}`),
      grenadiers: (u, t, v) => lines.push(`${u.id}>${v.length}g>${t.id}`),
      assaulted: (u, t) => lines.push(`${u.id}!${t.id}`),
    });
    const silent = play(1000, 30, undefined);
    expect(lines.length).toBeGreaterThan(0);
    expect(told.game.toRecording()).toEqual(silent.game.toRecording());
  });
});

describe("a battle against the attacking computer, saved and resumed", () => {
  it("goes on from the save exactly as it would have without stopping, mid-turn included", () => {
    const steps = (g: Game, ai: ComputerAttacker, from: number, to: number) => {
      // Activation by activation across turns, as the browser plays them.
      let i = 0;
      while (i < to) {
        const acts = buildActivations(g.initiativeOrder);
        // The save point is counted in activations, six a turn (three phases, two sides).
        expect(acts).toHaveLength(6);
        for (const act of acts) {
          if (i >= from && i < to) {
            if (g.phase !== act.phase) g.advanceToPhase(act.phase);
            if (act.side === "BLUE") {
              if (act.phase === "targeting") ai.targeting(g);
              else if (act.phase === "movement") ai.movement(g);
              else ai.combat(g);
            }
          }
          i++;
          if (i >= to) return;
        }
        // `>=`, not `>`: when the save lands exactly on a turn boundary the
        // unbroken run closed that turn here, so the resumed one must too.
        if (i >= from) g.advanceToPhase("initiative");
      }
    };
    const start = () => {
      const built = telAzekaAssaultListing.build(1000);
      const g = built.game;
      const ai = new ComputerAttacker(g, "BLUE", briefedObjective(g, "BLUE", "RED"), built);
      ai.plan(g);
      g.beginTurn();
      return { g, ai, ground: built };
    };
    // Six activations a turn (three phases, two sides), so a save can land
    // at any of six offsets within one. Each is tried: the computer's
    // movement and its combat fall in different places in the order, and a
    // save taken between them is the case that catches orders left on the
    // task rather than carried (`currentOrders`).
    const END = 180;
    const straight = start();
    steps(straight.g, straight.ai, 0, END);
    const want = straight.g.toRecording();

    for (let offset = 0; offset < 6; offset++) {
      const SAVE_AT = 48 + offset;
      const before = start();
      steps(before.g, before.ai, 0, SAVE_AT);
      const recording = JSON.parse(JSON.stringify(before.g.toRecording()));
      const saved = JSON.parse(JSON.stringify(before.ai.snapshot()));
      const g = replayGame(recording);
      const ai = ComputerAttacker.restore(g, saved, before.ground);
      steps(g, ai, SAVE_AT, END);
      expect(g.toRecording(), `saved at activation ${SAVE_AT}`).toEqual(want);
    }
    // …and the battle had something in it worth resuming.
    expect(want.actions.filter((a) => a.kind === "fire").length).toBeGreaterThan(0);
  });
});
