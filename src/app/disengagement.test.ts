import { describe, expect, it } from "vitest";
import { Game, makeInfantry, replayGame } from "../engine/index.js";
import { BREAK_CONTACT_BOUND_M, DrillState, PLAIN_SCRIPT, drillMovement, type DrillTask } from "./drill.js";

/**
 * Disengagement criteria (rules decision 107, the author, 2026-10-21): the
 * commander's decision, made in advance, of when a defending force breaks
 * contact — an enemy past a line, its losses at a share — and where it goes;
 * the drill carries it out by Break Contact (TC 3-21.76 (2025), 07-SQD-D9505).
 */
const hold: DrillTask = { side: "RED", attacking: false, objective: { x: 400, y: 1000 } };
const back = { x: 400, y: 100 };

function field(enemyY = 200) {
  const g = new Game({ seed: 3, trackIntel: false, enforceC2: false });
  const squad = g.addUnit(makeInfantry("R", "RED", "squad", { x: 400, y: 400 }, 8));
  g.addUnit(makeInfantry("B", "BLUE", "squad", { x: 400, y: 400 + enemyY }, 8));
  g.beginTurn();
  return { g, squad };
}
const knock = (g: Game, id: string, n: number) => {
  for (const s of g.getUnit(id).soldiers!.slice(0, n)) { s.damagePoints = 10; s.neutralized = true; }
};

describe("disengagement criteria (decision 107)", () => {
  it("takes a line or a share of losses, and somewhere to go — refuses the rest", () => {
    const { g } = field();
    expect(() => g.setDisengagement("R", { position: back })).toThrow();
    expect(() => g.setDisengagement("R", { lossShare: 0, position: back })).toThrow();
    expect(() => g.setDisengagement("R", { lossShare: 0.5 })).toThrow(); // no position, no alternate
    g.setDisengagement("R", { lossShare: 0.5, position: back });
    expect(g.disengagementFor("R")).toEqual({ lossShare: 0.5, position: back });
  });

  it("is met by losses at the share, counted from the strength it had when given", () => {
    const { g } = field();
    g.setDisengagement("R", { lossShare: 0.5, position: back });
    knock(g, "R", 3);
    expect(g.disengagementMet("R", [])).toBe(false);
    knock(g, "R", 4);
    expect(g.disengagementMet("R", [])).toBe(true);
  });

  it("is met by an enemy seen past the line, on the force's side of it — not by one short of it", () => {
    const { g } = field();
    g.setDisengagement("R", { line: { from: { x: 300, y: 500 }, to: { x: 500, y: 500 } }, position: back });
    expect(g.disengagementMet("R", [{ x: 400, y: 550 }])).toBe(false);
    expect(g.disengagementMet("R", [{ x: 400, y: 480 }])).toBe(true);
  });

  it("counts losses from the men fit when given: earlier losses, and a split, do not trip it", () => {
    const { g } = field();
    knock(g, "R", 2); // down before the plan
    g.setDisengagement("R", { lossShare: 0.5, position: back });
    expect(g.disengagementMet("R", [])).toBe(false);
    g.advanceToPhase("movement");
    const fit = g.getUnit("R").soldiers!.filter((x) => !x.neutralized).map((x) => x.id);
    g.detachTeam("R", fit.slice(0, 3)); // the downs stay with the parent
    expect(g.disengagementMet("R", [])).toBe(false);
  });

  it("refuses a line the force stands on", () => {
    const { g } = field();
    expect(() => g.setDisengagement("R", { line: { from: { x: 300, y: 400 }, to: { x: 500, y: 400 } }, position: back })).toThrow();
  });

  it("goes with a team split off the force, and replays as given", () => {
    const { g } = field();
    g.advanceToPhase("movement");
    g.setDisengagement("R", { lossShare: 0.5, position: back });
    const team = g.detachTeam("R", ["R-s5", "R-s6", "R-s7", "R-s8"].filter((id) => g.getUnit("R").soldiers!.some((s) => s.id === id)));
    expect(g.disengagementFor(team.id)).toEqual({ lossShare: 0.5, position: back });
    const replayed = replayGame(JSON.parse(JSON.stringify(g.toRecording())));
    expect(replayed.disengagementFor("R")).toEqual({ lossShare: 0.5, position: back });
  });
});

describe("Break Contact on the criteria (decision 107)", () => {
  /** Turns of the drill's movement, the orders carried out, until the squad and its team are back or `turns` run out. */
  function run(g: Game, state: DrillState, turns: number) {
    for (let t = 0; t < turns; t++) {
      g.advanceToPhase("movement");
      drillMovement(g, hold, PLAIN_SCRIPT, state); // it carries the orders out itself
      g.advanceToPhase("initiative");
    }
  }

  it("splits the squad, bounds one team back while the other stays, and brings both to the position named", () => {
    const { g } = field();
    g.setDisengagement("R", { lossShare: 0.25, position: back });
    knock(g, "R", 2);
    const state = new DrillState();
    g.advanceToPhase("movement");
    drillMovement(g, hold, PLAIN_SCRIPT, state);
    const b = state.breaking.get("R")!;
    expect(b.team).toBeDefined();
    expect(b.mover).toBe(b.team);
    // The moving team bounded back, no farther than a bound; the team in contact stayed to suppress.
    expect(Math.hypot(b.bound!.x - 400, b.bound!.y - 400)).toBeLessThanOrEqual(BREAK_CONTACT_BOUND_M + 1e-6);
    expect(g.getUnit(b.team!).position.y).toBeLessThan(400);
    expect(g.getUnit("R").position).toEqual({ x: 400, y: 400 });
    g.advanceToPhase("initiative");
    // Next turn they change over: the squad bounds, the team overwatches.
    g.advanceToPhase("movement");
    const teamAt = { ...g.getUnit(b.team!).position };
    drillMovement(g, hold, PLAIN_SCRIPT, state);
    expect(state.breaking.get("R")?.mover).toBe("R");
    expect(g.getUnit("R").position.y).toBeLessThan(400);
    expect(g.getUnit(b.team!).position).toEqual(teamAt);
    g.advanceToPhase("initiative");
    run(g, state, 12);
    expect(state.breaking.size).toBe(0);
    for (const id of ["R", b.team!]) expect(Math.hypot(g.getUnit(id).position.x - back.x, g.getUnit(id).position.y - back.y)).toBeLessThanOrEqual(5);
  });

  it("stays while the criteria are not met", () => {
    const { g } = field();
    g.setDisengagement("R", { lossShare: 0.5, position: back });
    const state = new DrillState();
    run(g, state, 2);
    expect(state.breaking.size).toBe(0);
    expect(g.getUnit("R").position).toEqual({ x: 400, y: 400 });
  });

  it("never goes under a plan to hold to the last", () => {
    const { g } = field();
    g.setDisengagement("R", { lossShare: 0.25, position: back });
    g.setInteriorPlan("R", { fallBack: false });
    knock(g, "R", 2);
    const state = new DrillState();
    run(g, state, 2);
    expect(state.breaking.size).toBe(0);
  });
});
