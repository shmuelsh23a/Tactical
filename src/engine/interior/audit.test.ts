import { describe, expect, it } from "vitest";
import { Rng } from "../rng.js";
import type { MapObject } from "../terrain.js";
import { makeInfantry } from "../units.js";
import { CELL_KIND, generateFloorPlan } from "./floorPlan.js";
import { InteriorBattles } from "./coupling.js";
import { InteriorFight, defaultDefence, type InteriorFightInput } from "./resolver.js";

/**
 * The fight inside against doctrine (the drill audit, docs/drill-audit.md,
 * I1–I5 and I7). The resolver's internals are reached through a cast where
 * a behaviour has no outside face of its own yet.
 */
const house = (id: string, w = 16, h = 12, storeys = 2): MapObject => ({
  id,
  kind: "building",
  height: storeys * 3,
  footprint: { shape: "polygon", points: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }] },
});
type Inside = any;

function fightOf(seed: number, defenders: number, extra: Partial<InteriorFightInput> = {}, security: string[] = ["sl"]): InteriorFight {
  const plan = generateFloorPlan(house(`h${seed}`), seed);
  const rng = new Rng(seed);
  const defence = defaultDefence(plan, Array.from({ length: defenders }, (_, k) => `d${k}`), rng, false);
  return new InteriorFight({ plan, attack: { entry: "door", grenades: false, teams: [["a1", "a2", "a3", "a4"], ["a5", "a6", "a7"]], security }, defence, ...extra }, rng);
}

describe("security left behind (I1)", () => {
  it("leaves a man in a cleared room that holds a way to ground not yet cleared, the leader first", () => {
    const f = fightOf(3, 0);
    while (!f.finished && !f.soldiers.some((m) => m.post)) f.tick();
    const posted = f.soldiers.filter((m) => m.post);
    expect(posted.map((m) => m.id)).toEqual(["sl"]);
  });

  it("never lets a defender take back a room a man of the attacker's holds", () => {
    for (let seed = 100; seed < 130; seed++) {
      const f = fightOf(seed, 3, { defenderRetakes: true });
      const s = f as Inside;
      while (!f.finished) {
        f.tick();
        for (const m of f.soldiers) {
          if (!m.post || m.out || m.withdrew) continue;
          const room = s.plan.storeys[m.storey].roomOf[m.cell];
          if (m.cell === m.post.cell && room >= 0) expect(s.cleared[m.storey][room], `seed ${seed}`).toBe(1);
        }
      }
    }
  });
});

describe("a man down going in does not stop the entry (I2)", () => {
  it("owes the time at CLEAR instead of halting the team in the doorway", () => {
    const f = fightOf(3, 0) as Inside;
    const team = f.teams[0];
    team.phase = "enter";
    const m = team.members[1];
    m.out = true;
    f.casualty(m);
    expect(team.halted).toBe(0);
    expect(team.owed).toBeGreaterThan(0);
    // Outside the entry, as before: the team halts.
    const other = f.teams[1];
    other.phase = "consolidate";
    other.members[0].out = true;
    f.casualty(other.members[0]);
    expect(other.halted).toBeGreaterThan(0);
  });
});

describe("the points of domination (I3)", () => {
  it("puts #3 and #4 against the entry wall, a metre or more either side of the door, not in the far corners", () => {
    let checked = 0;
    for (let seed = 100; seed < 120; seed++) {
      const f = fightOf(seed, 0) as Inside;
      const plan = f.plan;
      const w = plan.width;
      const door = plan.outsideDoors[0];
      const st = plan.storeys[0];
      const step = f.around(door).find((j: number) => st.roomOf[j] >= 0);
      if (step === undefined) continue;
      const room = st.roomOf[step];
      const pts: number[] = f.pointsOfDomination(0, room, door);
      const dx = (step % w) - (door % w), dy = Math.floor(step / w) - Math.floor(door / w);
      const rel = (i: number) => ({ along: ((i % w) - (door % w)) * dx + (Math.floor(i / w) - Math.floor(door / w)) * dy, side: ((i % w) - (door % w)) * -dy + (Math.floor(i / w) - Math.floor(door / w)) * dx });
      for (const p of pts.slice(2)) {
        const r = rel(p);
        if (r.along !== 1) continue; // a far corner standing in for a wall with no room either side
        expect(Math.abs(r.side)).toBeGreaterThanOrEqual(Math.ceil(1 / plan.cellM));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });
});

describe("the stack (I5)", () => {
  it("keeps the leader and an odd man out of it, as security", () => {
    const b = new InteriorBattles() as Inside;
    // Named as a game with morale names him (generateMorale): the first man.
    const led = (u: ReturnType<typeof makeInfantry>) => ((u.soldiers![0]!.leader = true), u);
    const squad = led(makeInfantry("S", "BLUE", "squad", { x: 0, y: 0 }, 9));
    const { teams, security } = b.stackOf(squad);
    const leader = squad.soldiers![0]!.id;
    expect(teams.map((t: string[]) => t.length)).toEqual([4, 4]);
    expect(security).toContain(leader);
    expect(teams.flat()).not.toContain(leader);
    // Eight men: a leader and seven, so four and three clear and the leader follows.
    const eight = b.stackOf(led(makeInfantry("E", "BLUE", "squad", { x: 0, y: 0 }, 8)));
    expect(eight.teams.map((t: string[]) => t.length)).toEqual([4, 3]);
    expect(eight.security).toHaveLength(1);
  });
});

describe("no grenade up the stairs (I7)", () => {
  it("throws one down a stairwell, never up one", () => {
    const f = fightOf(3, 0, {}, []) as Inside;
    f.grenadesPlanned = true;
    const team = f.teams[0];
    team.grenades = true;
    const stair = f.plan.stairwell;
    if (!stair) return;
    const cell = stair.y * f.plan.width + stair.x;
    expect(f.plan.storeys[0].cells[cell]).toBe(CELL_KIND.stair);
    team.storey = 0;
    team.next = 1;
    const before = f.grenadesThrown;
    f.arrive(team, team.members);
    expect(f.grenadesThrown).toBe(before);
  });
});
