import { describe, expect, it } from "vitest";
import { Game, makeInfantry, makeMachineGunTeam, type Unit } from "../engine/index.js";
import { DOCTRINAL_DRILL, DrillState, PLAIN_SCRIPT, drillCombat, halfOf, sectorsFrom, type DrillTask, type SectorHalf, type SquadDrill } from "./drill.js";
import { sectorsOfFire, validateOrder, type CompanyOrder } from "./order.js";
import { REFERENCE_ORDERS } from "./referenceOrders.js";
import { choicesOf, defaultChoices, formMarks, orderOf } from "./orderForm.js";
import { telAzekaAssaultListing } from "./scenarios/telAzekaAssault.js";
import { ComputerDefender } from "./computerSide.js";
import { buildActivations, sideDefeated } from "./hotseat.js";
import { OrderedAttacker } from "./orderedAttacker.js";
import { briefedObjective } from "./planning.js";
import { replayGame, stateDigest } from "../engine/index.js";

/**
 * Sectors of fire (FM 3-90 (2023) para A-83; decision 131): a platoon given a
 * half of the objective fires there first, by the drill's own priorities;
 * shifts to the other half only when nothing in its own is in reach; and
 * shoots back at whoever fires on it, and at an enemy close enough to
 * assault, wherever they are.
 */
const drill: SquadDrill = { ...DOCTRINAL_DRILL, fireTeams: undefined };
const START = { x: 0, y: 0 };
const OBJECTIVE = { x: 0, y: 300 };

function task(sector?: SectorHalf): DrillTask {
  return {
    side: "BLUE",
    attacking: true,
    objective: OBJECTIVE,
    ...(sector ? { sectors: sectorsFrom(START, OBJECTIVE, { "BLUE-1": sector }) } : {}),
  };
}

function shotAt(g: Game, d: SquadDrill, t: DrillTask): string[] {
  const at: string[] = [];
  g.advanceToPhase("combat");
  drillCombat(g, t, d, new DrillState(), {
    fired: (u, e) => u.id === "BLUE-1-1" && at.push(e.id),
    assaulted: (u, e) => u.id === "BLUE-1-1" && at.push(`assault:${e.id}`),
  });
  return at;
}

/** A squad of BLUE-1 going north; a rifle squad in the west half, a machine gun in the east, both in reach. */
function field(): { g: Game; rifles: Unit; gun: Unit } {
  const g = new Game({ seed: 3, trackIntel: false, enforceC2: false });
  g.addUnit(makeInfantry("BLUE-1-1", "BLUE", "squad", { x: 0, y: 100 }, 9));
  const rifles = g.addUnit(makeInfantry("RED-A-1", "RED", "squad", { x: -60, y: 220 }, 9));
  const gun = g.addUnit(makeMachineGunTeam("RED-A-MG1", "RED", { x: 60, y: 230 }, 3));
  g.beginTurn();
  return { g, rifles, gun };
}

describe("the halves of the objective (decision 131)", () => {
  it("splits the ground along the line of attack, west being the lesser x, whichever way the attack runs", () => {
    const north = sectorsFrom(START, OBJECTIVE, {});
    expect(halfOf(north, { x: -10, y: 300 })).toBe("west");
    expect(halfOf(north, { x: 10, y: 300 })).toBe("east");
    const south = sectorsFrom({ x: 0, y: 900 }, OBJECTIVE, {});
    expect(halfOf(south, { x: -10, y: 300 })).toBe("west");
    expect(halfOf(south, { x: 10, y: 300 })).toBe("east");
    // Askew: the line through the objective, not the map's north–south line through it.
    const askew = sectorsFrom({ x: -300, y: 0 }, OBJECTIVE, {});
    expect(halfOf(askew, { x: 20, y: 280 })).toBe("east");
    expect(halfOf(askew, { x: 20, y: 340 })).toBe("west");
  });
});

describe("a platoon's sector of fire (decision 131)", () => {
  it("takes the machine gun first with no sector (decision 115) ...", () => {
    expect(shotAt(field().g, drill, task())).toEqual(["RED-A-MG1"]);
  });

  it("... and the rifle squad in its own half when given the west, spreading the fire", () => {
    expect(shotAt(field().g, drill, task("west"))).toEqual(["RED-A-1"]);
  });

  it("takes the gun when its sector is the east, where the gun is", () => {
    expect(shotAt(field().g, drill, task("east"))).toEqual(["RED-A-MG1"]);
  });

  it("shifts to the other half, its secondary, when nothing in its own is in reach", () => {
    const { g, rifles } = field();
    rifles.position = { x: -60, y: 900 }; // out of reach
    expect(shotAt(g, drill, task("west"))).toEqual(["RED-A-MG1"]);
  });

  it("shoots back at whoever is firing on it, in the other half too", () => {
    const { g, gun } = field();
    g.advanceToPhase("combat");
    g.fire(gun.id, "BLUE-1-1", { weapon: "smallArms" });
    g.advanceToPhase("summary");
    g.advanceToPhase("movement");
    expect(shotAt(g, drill, task("west"))).toEqual(["RED-A-MG1"]);
  });

  it("goes for an enemy close enough to assault, in the other half too", () => {
    const { g, gun } = field();
    gun.position = { x: 15, y: 110 }; // inside the drill's assault reach
    expect(shotAt(g, drill, task("west"))).toEqual(["assault:RED-A-MG1"]);
  });

  it("holds the untrained drill to its half too: the nearest there, before the nearer in the other", () => {
    const { g, rifles, gun } = field();
    rifles.position = { x: -60, y: 260 };
    gun.position = { x: 60, y: 200 };
    expect(shotAt(g, PLAIN_SCRIPT, task())).toEqual(["RED-A-MG1"]);
    const again = field();
    again.rifles.position = { x: -60, y: 260 };
    again.gun.position = { x: 60, y: 200 };
    expect(shotAt(again.g, PLAIN_SCRIPT, task("west"))).toEqual(["RED-A-1"]);
  });

  it("changes nothing when every enemy is in its half: the drill ranks what the sector leaves (the review)", () => {
    // A pinned rifle squad close in, inside assault reach, and a machine gun further off: both west.
    const place = () => {
      const f = field();
      f.rifles.position = { x: -10, y: 115 };
      f.rifles.suppression = 100;
      f.gun.position = { x: -60, y: 230 };
      return f.g;
    };
    const without = shotAt(place(), drill, task());
    expect(without).toEqual(["RED-A-MG1"]);
    expect(shotAt(place(), drill, task("west"))).toEqual(without);
  });

  it("leaves the other half whole when its own holds nothing in reach: the drill's choice there, unnarrowed (the review)", () => {
    // Nothing west; a rifle squad close in and a machine gun further off, both east.
    const place = () => {
      const f = field();
      f.rifles.position = { x: 15, y: 115 };
      f.gun.position = { x: 60, y: 230 };
      return f.g;
    };
    const without = shotAt(place(), drill, task());
    expect(without).toEqual(["RED-A-MG1"]);
    expect(shotAt(place(), drill, task("west"))).toEqual(without);
  });

  it("leaves a platoon the order gave no sector to the drill's own choice", () => {
    const { g } = field();
    const t: DrillTask = { ...task(), sectors: sectorsFrom(START, OBJECTIVE, { "BLUE-2": "west" }) };
    expect(shotAt(g, drill, t)).toEqual(["RED-A-MG1"]);
  });
});

describe("sectors of fire in the order (decision 131)", () => {
  const PLATOONS = ["BLUE-1", "BLUE-2", "BLUE-3"];
  const base = REFERENCE_ORDERS[0]!.order;
  const withSectors = (...m: CompanyOrder["execution"]["measures"]): CompanyOrder => ({ ...base, execution: { ...base.execution, measures: [...base.execution.measures, ...m] } });

  it("plays a sector a platoon, and reads them back", () => {
    const o = withSectors({ kind: "sectorOfFire", platoon: "BLUE-1", primary: "west" }, { kind: "sectorOfFire", platoon: "BLUE-2", primary: "east" });
    expect(validateOrder(o, PLATOONS)).toEqual([]);
    expect(sectorsOfFire(o)).toEqual({ "BLUE-1": "west", "BLUE-2": "east" });
    expect(sectorsOfFire(base)).toEqual({});
  });

  it("refuses two sectors for one platoon, and a platoon the side does not have", () => {
    const two = withSectors({ kind: "sectorOfFire", platoon: "BLUE-1", primary: "west" }, { kind: "sectorOfFire", platoon: "BLUE-1", primary: "east" });
    expect(validateOrder(two, PLATOONS).map((p) => p.code)).toEqual(["oneSectorAPlatoon"]);
    const none = withSectors({ kind: "sectorOfFire", platoon: "BLUE-9", primary: "west" });
    expect(validateOrder(none, PLATOONS).map((p) => p.code)).toEqual(["noSuchPlatoon"]);
  });

  it("refuses a sector written as bearings (the shape before decision 131) as not an order, never playing it as another", () => {
    const old = withSectors({ kind: "sectorOfFire", platoon: "BLUE-1", fromBearing: 300, toBearing: 30 } as unknown as CompanyOrder["execution"]["measures"][number]);
    expect(validateOrder(old, PLATOONS).map((p) => p.code)).toEqual(["shape"]);
  });

  it("goes from the form into the order and back, and is drawn as the line between the halves", () => {
    const c = { ...defaultChoices(REFERENCE_ORDERS), sectors: { "BLUE-1": "west" as const, "BLUE-2": "east" as const } };
    const order = orderOf(c, "telAzekaAssault", "BLUE");
    expect(validateOrder(order, PLATOONS)).toEqual([]);
    expect(choicesOf(order)?.sectors).toEqual(c.sectors);
    expect(choicesOf(base)?.sectors).toEqual({});
    const ground = {
      objective: { x: 500, y: 300 },
      startLine: { x: 500, y: 900 },
      observationPoints: [],
      flanks: [],
      assaultPosition: undefined,
      planned: [],
      platoons: ["BLUE-1", "BLUE-2"],
    };
    const line = formMarks(ground, c).find((m) => m.kind === "sector")!;
    // The line of attack runs north here: the line between the halves runs north–south through the objective.
    expect(line.at.x).toBeCloseTo(500);
    expect(line.to!.x).toBeCloseTo(500);
    expect(line.label).toContain("BLUE-1");
    expect(formMarks(ground, { ...c, sectors: {} }).some((m) => m.kind === "sector")).toBe(false);
  });
});

/** Plays an order in the browser's loop, telling which half of the objective each of BLUE-1's shots went into. */
function shotsByHalf(seed: number, order: CompanyOrder, turns: number): { west: number; east: number; digest: string; replays: string } {
  const built = telAzekaAssaultListing.build(seed);
  const g = built.game;
  const own = g.units.filter((u) => u.side === "BLUE" && u.kind !== "command");
  const startLine = { x: own.reduce((t, u) => t + u.position.x, 0) / own.length, y: own.reduce((t, u) => t + u.position.y, 0) / own.length };
  const halves = sectorsFrom(startLine, briefedObjective(g, "BLUE", "RED", undefined, built.reserves ?? []), {});
  const defender = new ComputerDefender(g, "RED", built);
  defender.plan(g);
  const ordered = new OrderedAttacker(g, "BLUE", order, built, telAzekaAssaultListing.brief, built.reserves ?? []);
  const count = { west: 0, east: 0 };
  const report = { fired: (u: Unit, e: Unit) => u.id.startsWith("BLUE-1-") && count[halfOf(halves, e.position)]++ };
  g.beginTurn();
  for (let t = 0; t < turns && !sideDefeated(g, "BLUE") && !sideDefeated(g, "RED"); t++) {
    for (const act of buildActivations(g.initiativeOrder)) {
      if (g.phase !== act.phase) ordered.heard(g.advanceToPhase(act.phase).resolved);
      if (act.side === "BLUE") {
        if (act.phase === "targeting") ordered.targeting(g);
        else if (act.phase === "movement") ordered.movement(g);
        else ordered.combat(g, report);
      } else if (act.phase === "targeting") defender.targeting(g);
      else if (act.phase === "movement") defender.movement(g);
      else defender.combat(g);
    }
    ordered.heard(g.advanceToPhase("initiative").resolved);
  }
  return { ...count, digest: stateDigest(g), replays: stateDigest(replayGame(g.toRecording())) };
}

describe("an ordered sector in a played battle (decision 131)", () => {
  it("puts more of the platoon's fire into its own half than the same order without it, and the battle replays", () => {
    const base = REFERENCE_ORDERS[0]!.order;
    const east: CompanyOrder = { ...base, execution: { ...base.execution, measures: [...base.execution.measures, { kind: "sectorOfFire", platoon: "BLUE-1", primary: "east" }] } };
    let without = { west: 0, east: 0 };
    let within = { west: 0, east: 0 };
    for (const seed of [1000, 1001, 1002]) {
      const a = shotsByHalf(seed, base, 40);
      const b = shotsByHalf(seed, east, 40);
      expect(b.replays).toBe(b.digest);
      without = { west: without.west + a.west, east: without.east + a.east };
      within = { west: within.west + b.west, east: within.east + b.east };
    }
    const share = (c: { west: number; east: number }) => c.east / Math.max(1, c.west + c.east);
    expect(within.west + within.east).toBeGreaterThan(10);
    expect(share(within)).toBeGreaterThan(share(without));
  }, 180_000);
});
