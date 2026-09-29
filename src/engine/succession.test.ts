import { describe, it, expect } from "vitest";
import { Game } from "./game.js";
import { makeCommandGroup, makeInfantry } from "./units.js";
import { replayGame } from "./recording.js";
import { SUCCESSION_TURNS } from "./data/c2.js";

/**
 * Rules decision 55: losing a command group has effect. Command passes to
 * the next in line after SUCCESSION_TURNS turns without new orders or calls
 * for fire; with none left, neither.
 */
function company(commandSuccession = true) {
  const g = new Game({
    seed: 1,
    enforceC2: true,
    commandSuccession,
    commandEchelon: { BLUE: "company", RED: "company" },
    fireSupport: { BLUE: [{ weapon: "mortar", missions: 4 }] },
  });
  const coy = g.addUnit(makeCommandGroup("B-COY", "BLUE", "company", { x: 0, y: 0 }, 5));
  const hq = g.addUnit(makeCommandGroup("B-1-HQ", "BLUE", "platoon", { x: 0, y: 20 }, 3));
  const squad = g.addUnit(makeInfantry("B-1-1", "BLUE", "squad", { x: 0, y: 40 }, 9));
  g.addUnit(makeInfantry("R-1", "RED", "squad", { x: 0, y: 800 }, 9));
  g.beginTurn();
  return { g, coy, hq, squad };
}
const knockOut = (u: { soldiers?: { neutralized: boolean }[]; neutralized?: boolean }) => {
  for (const s of u.soldiers ?? []) s.neutralized = true;
  u.neutralized = true;
};
const nextTurn = (g: Game) => {
  g.advanceToPhase("combat");
  g.advanceToPhase("initiative");
};

describe("command succession", () => {
  it("passes command down the line, with no new orders and no fire while it changes hands", () => {
    const { g, coy, hq, squad } = company();
    expect(g.canReceiveOrders(squad.id)).toBe(true);
    expect(g.mayCall("BLUE", "mortar")).toBe(true);
    knockOut(coy);
    nextTurn(g);
    expect(g.commandGroupFor("BLUE")).toBe(hq);
    const handedOver = g.turn;
    for (let t = 0; t < SUCCESSION_TURNS; t++) {
      expect(g.canReceiveOrders(squad.id)).toBe(false);
      expect(g.mayCall("BLUE", "mortar")).toBe(false);
      nextTurn(g);
    }
    expect(g.turn).toBe(handedOver + SUCCESSION_TURNS);
    expect(g.canReceiveOrders(squad.id)).toBe(true);
    expect(g.mayCall("BLUE", "mortar")).toBe(true);
  });

  it("leaves a side with no command group left without orders or fire", () => {
    const { g, coy, hq, squad } = company();
    knockOut(coy);
    knockOut(hq);
    for (let t = 0; t < 5; t++) nextTurn(g);
    expect(g.commandGroupFor("BLUE")).toBeUndefined();
    expect(g.canReceiveOrders(squad.id)).toBe(false);
    expect(g.mayCall("BLUE", "mortar")).toBe(false);
    g.advanceToPhase("targeting");
    expect(() => g.callForFire("BLUE", "mortar", { x: 0, y: 800 })).toThrow(/no commander/);
  });

  it("changes nothing without the rule: the lost command group still passes orders", () => {
    const { g, coy, squad } = company(false);
    knockOut(coy);
    nextTurn(g);
    expect(g.commandGroupFor("BLUE")).toBe(coy);
    expect(g.canReceiveOrders(squad.id)).toBe(true);
    expect(g.mayCall("BLUE", "mortar")).toBe(true);
  });

  it("leaves a side that never had a command group unconstrained", () => {
    const g = new Game({ seed: 1, enforceC2: true, commandSuccession: true });
    const squad = g.addUnit(makeInfantry("B-1", "BLUE", "squad", { x: 0, y: 0 }, 9));
    g.beginTurn();
    nextTurn(g);
    expect(g.canReceiveOrders(squad.id)).toBe(true);
  });

  it("replays out of a recording, and reads one made before it as without", () => {
    const { g } = company();
    const rec = g.toRecording();
    expect(rec.commandSuccession).toBe(true);
    expect(replayGame(rec).commandSuccession).toBe(true);
    delete (rec as { commandSuccession?: boolean }).commandSuccession;
    expect(replayGame(rec).commandSuccession).toBe(false);
  });
});

describe("a platoon's command group lost", () => {
  it("leaves the squads it commanded without new orders while someone takes over, and not the rest", () => {
    const g = new Game({ seed: 1, enforceC2: true, commandSuccession: true });
    g.addUnit(makeCommandGroup("B-COY", "BLUE", "company", { x: 0, y: 0 }, 5));
    const hq = g.addUnit(makeCommandGroup("B-1-HQ", "BLUE", "platoon", { x: 0, y: 400 }, 3));
    const near = g.addUnit(makeInfantry("B-1-1", "BLUE", "squad", { x: 0, y: 450 }, 9));
    const far = g.addUnit(makeInfantry("B-2-1", "BLUE", "squad", { x: 900, y: 0 }, 9));
    g.beginTurn();
    knockOut(hq);
    nextTurn(g);
    // The company's command group still commands: the side calls fire, and a
    // squad the lost platoon command group did not command takes orders.
    expect(g.canReceiveOrders(far.id)).toBe(true);
    expect(g.canReceiveOrders(near.id)).toBe(false);
    for (let t = 0; t < SUCCESSION_TURNS; t++) nextTurn(g);
    expect(g.canReceiveOrders(near.id)).toBe(true);
  });
});
