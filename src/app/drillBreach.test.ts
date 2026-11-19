import { describe, expect, it } from "vitest";
import { Game, facingOf, makeInfantry, type MapObject } from "../engine/index.js";
import { DOCTRINAL_DRILL, DrillState, designateBreachSquads, drillCombat, drillMovement, type DrillTask, type SquadDrill } from "./drill.js";

/**
 * The computer's breach (decisions 124–125, the author's rulings of
 * 2026-11-19): each platoon names its breach squad; it charges the wall in
 * reach nearest it, never the front door's; the rest hold until the charge
 * is set and go in by it; given up, the house is the door's.
 */
const house: MapObject = {
  id: "house",
  kind: "building",
  height: 3,
  footprint: { shape: "polygon", points: [{ x: 100, y: 100 }, { x: 116, y: 100 }, { x: 116, y: 112 }, { x: 100, y: 112 }] },
};
const task: DrillTask = { side: "BLUE", attacking: true, objective: { x: 108, y: 106 } };

/** R-1 in the house; BLUE's platoon 15 m out from its door, the breach squad `breachOut` m out. */
function setup(seed: number, breachOut = 15) {
  const g = new Game({ seed, enforceC2: false, terrain: { objects: [house] } });
  g.addUnit(makeInfantry("R-1", "RED", "squad", { x: 108, y: 106 }, 4));
  const door = g.interior.frontDoor(g, house)!;
  const dx = door.x - 108, dy = door.y - 106, d = Math.hypot(dx, dy);
  const out = (m: number, side: number) => ({ x: door.x + (m * dx) / d - (side * dy) / d, y: door.y + (m * dy) / d + (side * dx) / d });
  g.addUnit(makeInfantry("B-1-1", "BLUE", "squad", out(12, 0), 8));
  g.addUnit(makeInfantry("B-1-2", "BLUE", "squad", out(12, 6), 8));
  g.addUnit(makeInfantry("B-1-3", "BLUE", "squad", out(breachOut, -6), 8));
  const plan = g.interior.plan(g, house);
  const doorFace = facingOf(plan, plan.outsideDoors[0]!)!;
  return { g, doorFace };
}

function turn(g: Game, state: DrillState, drill: SquadDrill) {
  g.advanceToPhase("movement");
  drillMovement(g, task, drill, state);
  g.advanceToPhase("combat");
  drillCombat(g, task, drill, state);
  g.advanceToPhase("initiative");
}

describe("the computer's breach (decisions 124–125)", () => {
  it("names each platoon's last squad its breach squad, with the scenario's charges", () => {
    const { g } = setup(1);
    expect(designateBreachSquads(g, "BLUE", DOCTRINAL_DRILL)).toEqual(["B-1-3"]);
    expect(g.getUnit("B-1-3").breachingCharges).toBe(g.breachingCharges);
    // Not a scout: it goes ahead alone to find the enemy.
    const { g: g3 } = setup(1);
    expect(designateBreachSquads(g3, "BLUE", DOCTRINAL_DRILL, (u) => u.id === "B-1-3")).toEqual(["B-1-2"]);
    // A drill that does not breach names none.
    const { g: g2 } = setup(1);
    expect(designateBreachSquads(g2, "BLUE", { ...DOCTRINAL_DRILL, breach: undefined })).toEqual([]);
  });

  it("charges a wall that is not the door's, holds the rest until it is set, then goes in by it", () => {
    let byHole = 0;
    // Seeds 1–8: eight room layouts; the fight must not have begun by the door while the charge was coming.
    for (let seed = 1; seed <= 8; seed++) {
      const { g, doorFace } = setup(seed);
      designateBreachSquads(g, "BLUE", DOCTRINAL_DRILL);
      g.beginTurn();
      g.advanceToPhase("initiative");
      const state = new DrillState();
      let set = false;
      for (let t = 0; t < 10 && !g.interior.engagements.length; t++) {
        set = g.interior.breachesIn(g, house, "BLUE").some((b) => !b.blown);
        turn(g, state, DOCTRINAL_DRILL);
        const laying = g.getUnit("B-1-3").layingCharge;
        if (laying?.breach) expect(laying.breach.facing).not.toBe(doorFace);
        // Nobody went in before the charge was set at the turn's start.
        if (!set) expect(g.interior.engagements).toEqual([]);
      }
      const fight = g.interior.engagements[0];
      if (fight?.breached) {
        byHole++;
        expect(fight.breached.facing).not.toBe(doorFace);
        expect(fight.attackerUnits).not.toContain("B-1-3"); // the breach squad does not clear
      }
    }
    expect(byHole).toBeGreaterThan(0);
  });

  it("gives the house to the door when the rest have waited it out", () => {
    // The breach squad 120 m out cannot be at the wall in one turn; the rest wait one turn, then go in by the door.
    const drill: SquadDrill = { ...DOCTRINAL_DRILL, breach: { waitTurns: 1 } };
    let byDoor = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const { g } = setup(seed, 120);
      designateBreachSquads(g, "BLUE", drill);
      g.beginTurn();
      g.advanceToPhase("initiative");
      const state = new DrillState();
      for (let t = 0; t < 6 && !g.interior.engagements.length; t++) turn(g, state, drill);
      const fight = g.interior.engagements[0];
      if (fight && !fight.breached) {
        byDoor++;
        expect(state.breachGaveUp.has("house")).toBe(true);
      }
    }
    expect(byDoor).toBeGreaterThan(0);
  });

  it("sets its charge whole and holding its fire, an enemy in sight or not", () => {
    // R-2 in the open, 60 m off the house and in the breach squad's sight: a target it must leave alone while it works.
    let set = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const { g } = setup(seed);
      const b3 = g.getUnit("B-1-3").position;
      g.addUnit(makeInfantry("R-2", "RED", "squad", { x: b3.x + (b3.x - 108) * 2, y: b3.y + (b3.y - 106) * 2 }, 4));
      designateBreachSquads(g, "BLUE", DOCTRINAL_DRILL);
      g.beginTurn();
      g.advanceToPhase("initiative");
      const state = new DrillState();
      for (let t = 0; t < 8 && !g.interior.engagements.length; t++) {
        g.advanceToPhase("movement");
        drillMovement(g, task, DOCTRINAL_DRILL, state);
        g.advanceToPhase("combat");
        drillCombat(g, task, DOCTRINAL_DRILL, state);
        const b = g.getUnit("B-1-3");
        if (b.layingCharge) expect(b.firedThisTurn).toBe(false);
        expect(state.divided.has("B-1-3")).toBe(false); // the breach squad is not split (2A)
        g.advanceToPhase("initiative");
      }
      if (g.interior.breachList().some((x) => x.side === "BLUE")) set++;
      for (const e of g.interior.engagements) expect(e.attackerUnits.filter((id) => id.startsWith("B-1-3"))).toEqual([]);
    }
    expect(set).toBeGreaterThan(0);
  });

  it("puts a second charge on another wall when the first comes to nothing", () => {
    let second = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const { g } = setup(seed);
      designateBreachSquads(g, "BLUE", DOCTRINAL_DRILL);
      g.beginTurn();
      g.advanceToPhase("initiative");
      const state = new DrillState();
      let first: string | undefined;
      for (let t = 0; t < 6 && !g.interior.engagements.length; t++) {
        g.advanceToPhase("movement");
        drillMovement(g, task, DOCTRINAL_DRILL, state);
        const laying = g.getUnit("B-1-3").layingCharge?.breach?.facing;
        if (laying && !first) {
          first = laying;
          g.layCharge("B-1-3", null); // the work comes to nothing
        } else if (laying && first) {
          expect(laying).not.toBe(first);
          second++;
          break;
        }
        g.advanceToPhase("combat");
        drillCombat(g, task, DOCTRINAL_DRILL, state);
        g.advanceToPhase("initiative");
      }
    }
    expect(second).toBeGreaterThan(0);
  });

  it("lets the breach squad go when nobody goes in by its charge, and it goes in by it itself", () => {
    // B-1-3 alone: nobody else to go in. Two turns' wait (the drill's six, shortened).
    const drill: SquadDrill = { ...DOCTRINAL_DRILL, breach: { waitTurns: 2 } };
    let released = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const g = new Game({ seed, enforceC2: false, terrain: { objects: [house] } });
      g.addUnit(makeInfantry("R-1", "RED", "squad", { x: 108, y: 106 }, 4));
      const door = g.interior.frontDoor(g, house)!;
      const dx = door.x - 108, dy = door.y - 106, d = Math.hypot(dx, dy);
      g.addUnit(makeInfantry("B-1-3", "BLUE", "squad", { x: door.x + (12 * dx) / d + (6 * dy) / d, y: door.y + (12 * dy) / d - (6 * dx) / d }, 8));
      designateBreachSquads(g, "BLUE", drill);
      g.beginTurn();
      g.advanceToPhase("initiative");
      const state = new DrillState();
      let wasSet = false;
      for (let t = 0; t < 12 && !g.interior.engagements.length; t++) {
        wasSet ||= g.interior.breachList().some((b) => b.side === "BLUE" && !b.blown);
        turn(g, state, drill);
      }
      if (state.breachGaveUp.has("house")) {
        released++;
        expect(wasSet).toBe(true); // let go after the charge was set, not a give-up before it
        expect(state.breachJobs.size).toBe(0);
        const fight = g.interior.engagements[0];
        if (fight) expect(fight.breached).toBeDefined(); // in by its own charge, not the door
      }
    }
    expect(released).toBeGreaterThan(0);
  });

  it("keeps the breach in a saved battle's drill memory", () => {
    const s = new DrillState();
    s.breachJobs.set("B-1-3", { buildingId: "house", since: 2, faces: ["north"], setOn: 4 });
    s.breachGaveUp.add("other");
    const back = DrillState.restore(JSON.parse(JSON.stringify(s.snapshot())));
    expect([...back.breachJobs]).toEqual([["B-1-3", { buildingId: "house", since: 2, faces: ["north"], setOn: 4 }]]);
    expect([...back.breachGaveUp]).toEqual(["other"]);
  });
});
