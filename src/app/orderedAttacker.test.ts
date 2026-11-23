import { describe, expect, it } from "vitest";
import { telAzekaAssaultListing } from "./scenarios/telAzekaAssault.js";
import { ComputerDefender } from "./computerSide.js";
import { buildActivations, sideDefeated } from "./hotseat.js";
import { OrderedAttacker, orderGround } from "./orderedAttacker.js";
import { REFERENCE_ORDERS } from "./referenceOrders.js";
import { OrderRefused } from "./orderCommander.js";
import { replayGame, stateDigest, type Game } from "../engine/index.js";
import type { CompanyOrder } from "./order.js";
import { limitOfAdvanceFrom, pastLimit } from "./drill.js";
import { briefedObjective } from "./planning.js";

/**
 * OPORD mode as the browser plays it (decision 128): the player's company
 * carried out by its order, the computer holding the position, activation by
 * activation in initiative order, every phase's fire handed to the order's
 * commander — the loop `App.tsx` runs when both sides are the computer's.
 */
function play(
  seed: number,
  orderIndex = 0,
  maxTurns = 60,
  order: CompanyOrder = REFERENCE_ORDERS[orderIndex]!.order,
  eachTurn?: (g: Game) => void,
): { g: Game; ordered: OrderedAttacker; turns: number } {
  const built = telAzekaAssaultListing.build(seed);
  const g = built.game;
  const defender = new ComputerDefender(g, "RED", built);
  defender.plan(g);
  const ordered = new OrderedAttacker(g, "BLUE", order, built, telAzekaAssaultListing.brief, built.reserves ?? []);
  g.beginTurn();
  let turns = 0;
  for (; turns < maxTurns && !sideDefeated(g, "BLUE") && !sideDefeated(g, "RED"); turns++) {
    for (const act of buildActivations(g.initiativeOrder)) {
      if (g.phase !== act.phase) ordered.heard(g.advanceToPhase(act.phase).resolved);
      const side = act.side === "BLUE" ? ordered : defender;
      if (act.phase === "targeting") side.targeting(g);
      else if (act.phase === "movement") side.movement(g);
      else side.combat(g);
    }
    ordered.heard(g.advanceToPhase("initiative").resolved);
    eachTurn?.(g);
  }
  return { g, ordered, turns };
}

describe("OPORD mode in the browser's loop (decision 128)", () => {
  it("plays an order to the end of the battle, the company going in by it", () => {
    const { g, ordered, turns } = play(1000);
    expect(turns).toBeGreaterThan(5);
    expect(ordered.asked.company.released).toBeDefined();
    // Something the order did not speak to came up, and was answered by the intent.
    expect(ordered.notes.length).toBeGreaterThan(0);
    expect(g.toRecording().actions.some((a) => a.kind === "fire" && a.attackerId.startsWith("BLUE"))).toBe(true);
  }, 60_000);

  it("plays the same battle from the same seed and order, and the recording replays to it", () => {
    const a = play(1001, 2, 25);
    const b = play(1001, 2, 25);
    expect(stateDigest(a.g)).toBe(stateDigest(b.g));
    expect(stateDigest(replayGame(a.g.toRecording()))).toBe(stateDigest(a.g));
  }, 60_000);

  it("plays different orders differently", () => {
    const hasty = play(1000, 7, 30);
    const deliberate = play(1000, 2, 30);
    expect(hasty.ordered.asked.company.released).toBeLessThan(deliberate.ordered.asked.company.released ?? Infinity);
  }, 60_000);

  it("keeps every force of the company short of the order's limit of advance, turn after turn (decision 130)", () => {
    const base = REFERENCE_ORDERS[0]!.order;
    const order: CompanyOrder = { ...base, execution: { ...base.execution, measures: [...base.execution.measures, { kind: "limitOfAdvance", beyondM: 100 }] } };
    // Seed 1002: one where the company gets across the objective (most battles end with the defence broken short of it).
    const built = telAzekaAssaultListing.build(1002);
    const g0 = built.game;
    const own = g0.units.filter((u) => u.side === "BLUE" && u.kind !== "command");
    const startLine = { x: own.reduce((t, u) => t + u.position.x, 0) / own.length, y: own.reduce((t, u) => t + u.position.y, 0) / own.length };
    const loa = limitOfAdvanceFrom(startLine, briefedObjective(g0, "BLUE", "RED", undefined, built.reserves ?? []), 100);
    let worst = -Infinity;
    const { ordered } = play(1002, 0, 60, order, (g) => {
      for (const u of g.units) if (u.side === "BLUE" && !u.neutralized && !u.routing) worst = Math.max(worst, pastLimit(loa, u.position));
    });
    expect(ordered.asked.company.released).toBeDefined();
    expect(worst).toBeLessThanOrEqual(0);
    // And it came up to the line: the test is not passed by an attack that never got there.
    expect(worst).toBeGreaterThan(-120);
  }, 60_000);

  it("refuses an order that does not play before touching the game", () => {
    const built = telAzekaAssaultListing.build(1000);
    const before = built.game.toRecording().actions.length;
    const bad = { ...REFERENCE_ORDERS[0]!.order, execution: { ...REFERENCE_ORDERS[0]!.order.execution, measures: [] } };
    expect(() => new OrderedAttacker(built.game, "BLUE", bad, built)).toThrow(OrderRefused);
    expect(built.game.toRecording().actions.length).toBe(before);
  });

  it("gives the order form the places the battle will offer, without touching the game", () => {
    const built = telAzekaAssaultListing.build(1000);
    const before = stateDigest(built.game);
    const ground = orderGround(built.game, "BLUE", built, built.reserves ?? []);
    expect(stateDigest(built.game)).toBe(before);
    expect(ground.observationPoints.length).toBeGreaterThan(0);
    expect(ground.platoons).toEqual(["BLUE-1", "BLUE-2", "BLUE-3"]);
    expect(ground.planned).toHaveLength(3);
  });
});
