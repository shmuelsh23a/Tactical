import { describe, it, expect } from "vitest";
import { telAzekaAssaultListing } from "../app/scenarios/telAzekaAssault.js";
import { telAzekaAssault2Listing } from "../app/scenarios/telAzekaAssault2.js";
import { PLAIN_SCRIPT } from "../app/drill.js";
import { ARTILLERY_LIFT_M, FIRE_RESERVE, tubesOf } from "../app/computerSide.js";
import { DEFAULT_FIRE_CHOICES, runScenarioBattle } from "./scenarioBattle.js";
import { Game, distance, explosiveFor, makeCommandGroup, makeInfantry, replayGame, type Side } from "../engine/index.js";
import { CHECKED_SUPPRESSION_REACH } from "../engine/data/morale.js";

/**
 * Rules decision 93: mortars by doctrine — the 60 mm a company owns and the
 * 120 mm beside the document's 81 mm, sections of two tubes and platoons of
 * four, and fire plans that set missions aside for the FPF and the priority
 * target.
 */
describe("the 60 and 120 mm beside the 81 mm (decision 93)", () => {
  it("reach by calibre: the 60 mm least, the 120 mm most", () => {
    const edge = (w: string) => explosiveFor(w, "research")!.blastBands.at(-1)!.maxRange;
    expect(edge("lightMortar")).toBeLessThan(edge("mortar"));
    expect(edge("mortar")).toBeLessThan(edge("heavyMortar"));
    expect(CHECKED_SUPPRESSION_REACH.lightMortar!.half).toBeLessThan(CHECKED_SUPPRESSION_REACH.mortar!.half);
    // A game on the document's figures has no such weapon.
    expect(explosiveFor("lightMortar", "document")).toBeUndefined();
  });

  // A company with its two 60 mm, 8 bombs a mission, firing on a squad 800 m off.
  const battery = (tubes: number | undefined) => {
    const g = new Game({
      seed: 3,
      enforceC2: false,
      commandEchelon: { BLUE: "company", RED: "company" },
      fireSupport: { BLUE: [{ weapon: "lightMortar", missions: 2, roundsForEffect: 8, ...(tubes !== undefined ? { tubes } : {}) }] },
    });
    g.addUnit(makeCommandGroup("HQ", "BLUE", "company", { x: 0, y: 0 }));
    g.addUnit(makeInfantry("R", "RED", "squad", { x: 0, y: 800 }, 8));
    g.beginTurn();
    g.advanceToPhase("targeting");
    g.callForFire("BLUE", "lightMortar", { x: 0, y: 800 }, { method: "effect" });
    return g;
  };

  it("a mission's first volley is at most its fire unit's tubes times the top rate", () => {
    const g = battery(2);
    const first = g.pendingFire.filter((f) => f.side === "BLUE").map((f) => f.rounds ?? 1);
    expect(first.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(Math.max(...first)).toBeLessThanOrEqual(2 * 30);
  });

  it("is refused on the document's figures, which have no 60 mm", () => {
    expect(
      () => new Game({ seed: 1, lethality: "document", commandEchelon: { BLUE: "company" }, fireSupport: { BLUE: [{ weapon: "lightMortar", missions: 1, roundsForEffect: 10 }] } }),
    ).toThrow(/research figures only/);
  });

  it("names its tubes in the allotment, refuses nonsense, and carries them in the recording", () => {
    expect(() => battery(0)).toThrow(/fireSupport/);
    expect(() => battery(2.5)).toThrow(/fireSupport/);
    const r = battery(2).toRecording();
    expect(r.fireSupport?.BLUE?.[0]?.tubes).toBe(2);
    expect(replayGame(r).fireSupport.BLUE?.[0]?.tubes).toBe(2);
  });
});

describe("fire plans that set missions aside (decision 93)", () => {
  const opts = {
    drill: { ...PLAIN_SCRIPT, scouting: { watchTurns: 1 } },
    company: { recon: { scouts: 3, lookTurns: 4, scoutFrom: "vantage" as const }, waitIn: "deadGround" as const },
    fire: { ...DEFAULT_FIRE_CHOICES, waitForContact: true, aimWithin: 40, targetFirst: "squads" as const },
  };

  // At the end of a battle: missions the side fired on `at`, and those it had left of `weapon`.
  const ledger = (g: Game, side: Side, weapon: string, at: { x: number; y: number }) => ({
    // On the reserved point itself, as the reserve counts it.
    on: g.fireMissions.filter((m) => m.side === side && m.weapon === weapon && distance(m.target, at) < 1).length,
    left: g.fireMissionsLeft(side, weapon) ?? 0,
  });

  it("holds the reserve unless it fires it where it was set aside for", () => {
    // Seeds from the standard measurement's run: 1008 and 1010 end with the
    // FPF never fired — the case the defender's check bites on — and 1000
    // and 1002 with it fired, all of it and once.
    const firedFpf: number[] = [];
    for (const seed of [1000, 1002, 1008, 1010]) {
      let game: Game | undefined;
      runScenarioBattle(telAzekaAssaultListing, seed, { ...opts, onTurn: (g) => (game = g) });
      const g = game!;
      // The defender's first registered target is its FPF, the second its priority target.
      const red = g.registeredTargets.filter((t) => t.side === "RED" && t.weapon === "lightMortar").map((t) => t.at);
      expect(red.length).toBeLessThanOrEqual(5);
      const [fpf, priority] = red;
      const f = ledger(g, "RED", "lightMortar", fpf!);
      const p = ledger(g, "RED", "lightMortar", priority!);
      // Until the FPF is fired its rounds and the priority target's are held;
      // once it is, it fires "until … ammunition is exhausted" (ATP 3-21.10 D-25).
      firedFpf.push(f.on);
      if (f.on === 0) expect(f.left).toBeGreaterThanOrEqual(FIRE_RESERVE.fpf + Math.max(0, FIRE_RESERVE.defenderPriority - p.on));
      // The attacker holds its priority target's on its heaviest tube.
      const tubes = tubesOf(g, "BLUE");
      const heavy = tubes[tubes.length - 1]!;
      const target = g.registeredTargets.find((t) => t.side === "BLUE" && t.weapon === heavy)!.at;
      const a = ledger(g, "BLUE", heavy, target);
      expect(a.left).toBeGreaterThanOrEqual(Math.max(0, FIRE_RESERVE.attackerPriority - a.on));
    }
    // The defender's check is not vacuous: in some of these the FPF was never fired.
    expect(firedFpf.some((n) => n === 0)).toBe(true);
  });
});

describe("artillery allotted to a company (decision 95)", () => {
  it("the 2:1 attacker's battery fires its priority target, and within its allotment", () => {
    const opts = {
      drill: { ...PLAIN_SCRIPT, scouting: { watchTurns: 1 } },
      company: { recon: { scouts: 3, lookTurns: 4, scoutFrom: "vantage" as const }, waitIn: "deadGround" as const },
      fire: { ...DEFAULT_FIRE_CHOICES, waitForContact: true, aimWithin: 40, targetFirst: "squads" as const },
    };
    let fired = 0;
    // The standard measurement's first seeds; each closes on the objective, so each calls the guns.
    for (const seed of [1000, 1001, 1002]) {
      let game: Game | undefined;
      // Where the squads stood on each turn, to check every call of the guns against them.
      const stood = new Map<number, { x: number; y: number }[]>();
      runScenarioBattle(telAzekaAssault2Listing, seed, {
        ...opts,
        onTurn: (g) => {
          game = g;
          stood.set(g.turn, g.units.filter((u) => u.side === "BLUE" && u.kind === "infantry" && !u.neutralized).map((u) => ({ ...u.position })));
        },
      });
      const g = game!;
      expect(g.mayCall("BLUE", "artillery")).toBe(true);
      expect(tubesOf(g, "BLUE").at(-1)).toBe("artillery");
      const priority = g.registeredTargets.find((t) => t.side === "BLUE" && t.weapon === "artillery")!.at;
      const guns = g.fireMissions.filter((m) => m.side === "BLUE" && m.weapon === "artillery");
      const allotted = g.fireSupport.BLUE!.find((a) => a.weapon === "artillery")!.missions;
      expect(guns.length).toBeLessThanOrEqual(allotted);
      // All of it on the priority target when the allotment is no more than its reserve;
      // beyond it, the rest is free for planned targets (decision 93's plan).
      if (allotted <= FIRE_RESERVE.attackerPriority) for (const m of guns) expect(m.target).toEqual(priority);
      fired += guns.filter((m) => m.target.x === priority.x && m.target.y === priority.y).length;
      // Never called within 300 m of any of its forces where they stood at the
      // call — the end of the turn before (onTurn runs at a turn's end). The
      // moving squads are held to 400 m there (two turns' walk more); scouts,
      // still, to the 300 m they must have at landing.
      let checked = 0;
      for (const m of guns) {
        const at = stood.get((m.forEffectOnTurn ?? 0) - 1);
        if (!at) continue;
        expect(Math.min(...at.map((p) => distance(p, m.target)))).toBeGreaterThan(ARTILLERY_LIFT_M);
        checked++;
      }
      expect(checked).toBe(guns.length);
    }
    // And it does fire the priority target: these attacks close on the objective.
    expect(fired).toBeGreaterThan(0);
  });
});
