import { describe, expect, it } from "vitest";
import { Game, makeInfantry, replayGame, stateDigest } from "./index.js";

/**
 * Fire teams a commander makes out of his own forces (rules decision 89).
 * The point of the ruling is that the result is "a force just as any
 * other", so most of what is checked here is that nothing treats it
 * specially — and that making one buys no advantage it should not.
 */
const squad = (id = "BLUE-1", men = 8) => makeInfantry(id, "BLUE", "squad", { x: 100, y: 100 }, men, id);

function game(): Game {
  const g = new Game({ seed: 7 });
  g.addUnit(squad());
  g.addUnit(makeInfantry("RED-1", "RED", "squad", { x: 600, y: 100 }, 8, "RED-1"));
  return g;
}

const ids = (g: Game, id: string) => (g.getUnit(id).soldiers ?? []).map((s) => s.id);

describe("a commander making a fire team", () => {
  it("takes the named men out of their force and leaves it the rest", () => {
    const g = game();
    const take = ids(g, "BLUE-1").slice(0, 4);
    const team = g.detachTeam("BLUE-1", take);
    expect(team.echelon).toBe("team");
    expect(team.kind).toBe("infantry");
    expect(team.side).toBe("BLUE");
    expect((team.soldiers ?? []).map((s) => s.id)).toEqual(take);
    expect(ids(g, "BLUE-1")).toHaveLength(4);
    // No man is in two places.
    expect(ids(g, "BLUE-1").filter((i) => take.includes(i))).toEqual([]);
  });

  it("stands where its parent stood, with the same protection", () => {
    const g = game();
    const parent = g.getUnit("BLUE-1");
    const team = g.detachTeam("BLUE-1", ids(g, "BLUE-1").slice(0, 4));
    expect(team.position).toEqual(parent.position);
    expect(team.cover).toBe(parent.cover);
    expect(team.baseCover).toBe(parent.baseCover);
    // Men who had been lying still are still lying still.
    expect(team.stationaryTurns).toBe(parent.stationaryTurns);
    expect(team.camouflageTurns).toBe(parent.camouflageTurns);
  });

  it("is led: a team with no leader among its men gets one", () => {
    const g = game();
    const men = g.getUnit("BLUE-1").soldiers ?? [];
    // Make the first man the squad leader, then detach men who are not him.
    men[0]!.leader = true;
    const team = g.detachTeam("BLUE-1", men.slice(4).map((s) => s.id));
    expect((team.soldiers ?? []).filter((s) => s.leader)).toHaveLength(1);
    // …and the parent keeps the squad leader it had.
    expect((g.getUnit("BLUE-1").soldiers ?? []).some((s) => s.leader)).toBe(true);
  });

  it("buys no extra action: it inherits whether its parent has acted", () => {
    const g = game();
    g.beginTurn();
    g.advanceToPhase("movement");
    g.moveUnit("BLUE-1", { x: 140, y: 100 }, "run");
    const parent = g.getUnit("BLUE-1");
    expect(parent.movedThisTurn).toBeGreaterThan(0);
    const team = g.detachTeam("BLUE-1", ids(g, "BLUE-1").slice(0, 4));
    // Splitting after moving must not hand the new force a fresh turn —
    // otherwise splitting is free and therefore always right.
    expect(team.movedThisTurn).toBe(parent.movedThisTurn);
    expect(team.ranThisTurn).toBe(parent.ranThisTurn);
    expect(team.firedThisTurn).toBe(parent.firedThisTurn);
  });

  it("refuses the splits that are not splits", () => {
    const g = game();
    const all = ids(g, "BLUE-1");
    expect(() => g.detachTeam("BLUE-1", [])).toThrow(/nobody/);
    expect(() => g.detachTeam("BLUE-1", all)).toThrow(/all of its men/);
    expect(() => g.detachTeam("BLUE-1", ["not-a-man"])).toThrow(/not one of/);
    expect(() => g.detachTeam("RED-9", all)).toThrow();
  });

  it("is not done in the middle of a firefight", () => {
    const g = game();
    g.beginTurn();
    g.advanceToPhase("combat");
    expect(() => g.detachTeam("BLUE-1", ids(g, "BLUE-1").slice(0, 4))).toThrow(/firefight/);
  });

  it("gives each team its own id, so a squad can be split more than once", () => {
    const g = game();
    const all = ids(g, "BLUE-1");
    const a = g.detachTeam("BLUE-1", all.slice(0, 3));
    const b = g.detachTeam("BLUE-1", all.slice(3, 6));
    expect(a.id).not.toBe(b.id);
    expect(g.units.filter((u) => u.side === "BLUE")).toHaveLength(3);
  });
});

describe("a battle in which a force was split", () => {
  it("replays from its recording exactly, teams and all", () => {
    const played = () => {
      const g = game();
      g.beginTurn();
      g.advanceToPhase("movement");
      const all = ids(g, "BLUE-1");
      g.detachTeam("BLUE-1", all.slice(0, 4), { name: "חוליה א" });
      g.moveUnit("BLUE-1/t1", { x: 160, y: 140 }, "run");
      g.advanceToPhase("combat");
      g.advanceToPhase("initiative");
      return g;
    };
    const first = played();
    const again = replayGame(first.toRecording());
    expect(again.toRecording()).toEqual(first.toRecording());
    // The digest is the real test: a replay that rebuilt the team
    // differently would come out with another state.
    expect(stateDigest(again)).toBe(stateDigest(first));
    expect(again.getUnit("BLUE-1/t1").name).toBe("חוליה א");
  });
});
