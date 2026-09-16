import { describe, it, expect } from "vitest";
import { Game, makeInfantry, type Heightfield } from "../engine/index.js";
import {
  disclose,
  hasEyesOn,
  readableBy,
  SIDES,
  type Audience,
  type LogEntry,
} from "./hotseat.js";

/**
 * Who may read a line of the live hotseat log (rules decision 17).
 *
 * Both players read one list on one screen across a handoff — the handoff
 * screen covers the map, not the sidebar — so "who acted" and "who may read
 * it" are two different questions. `side` answers the first (it is a colour
 * chip); `readers` answers the second, and it is the only one that filters.
 */
describe("what a side may read of the live log", () => {
  it("gives the umpire's bookkeeping to the whole table, unchipped", () => {
    // Turns, phases, initiative and the result of the battle are not
    // intelligence — the same clause as the debrief's turn structure.
    expect(disclose({ to: "table" })).toEqual({ readers: SIDES });
  });

  it("gives a decision taken behind one's own lines to that side alone", () => {
    const red = disclose({ to: "side", side: "RED" });
    expect(red.readers).toEqual(["RED"]);
    expect(red.side).toBe("RED");
  });

  it("gives an exchange to both sides, under the acting side's colour", () => {
    // Being fired on is always known, and firing puts the firer on the target's
    // map anyway (rules decision 13) — so the line crosses, flying RED's chip.
    expect(disclose({ to: "both", by: "RED" })).toEqual({ readers: SIDES, side: "RED" });
  });

  it("lets the other side's copy of a shared line keep the actor's colour", () => {
    // A shot both sides read is worded once per reader — exact for whoever took
    // the losses, a report for whoever watched. BLUE's copy of RED's shot is
    // still RED's line, so the chip must not follow the reader.
    const blueCopy = disclose({ to: "side", side: "BLUE", by: "RED" });
    expect(blueCopy.readers).toEqual(["BLUE"]);
    expect(blueCopy.side).toBe("RED");
  });

  it("shows only the table's own lines while nobody has claimed the screen", () => {
    // The handoff screen and the initiative panel are read by whoever happens
    // to be holding the device — which at a handoff is the side going *out*,
    // not the side `viewingSide` has already moved on to.
    const line = (audience: Audience): LogEntry => ({
      id: 1,
      turn: 1,
      text: "x",
      kind: "info",
      ...disclose(audience),
    });
    expect(readableBy(line({ to: "table" }), null)).toBe(true);
    expect(readableBy(line({ to: "both", by: "RED" }), null)).toBe(true);
    expect(readableBy(line({ to: "side", side: "RED" }), null)).toBe(false);
    expect(readableBy(line({ to: "side", side: "BLUE", by: "RED" }), null)).toBe(false);
    // …and with a reader, it is that reader's list as before.
    expect(readableBy(line({ to: "side", side: "RED" }), "RED")).toBe(true);
    expect(readableBy(line({ to: "side", side: "RED" }), "BLUE")).toBe(false);
  });

  it("never writes a line nobody may read", () => {
    const every: Audience[] = [
      { to: "table" },
      ...SIDES.map((side): Audience => ({ to: "side", side })),
      ...SIDES.map((by): Audience => ({ to: "both", by })),
      ...SIDES.map((side): Audience => ({ to: "side", side, by: side === "RED" ? "BLUE" : "RED" })),
    ];
    for (const audience of every) {
      expect(disclose(audience).readers.length).toBeGreaterThan(0);
    }
  });
});

/**
 * A single ridge running north–south across a 400 m square: 0 m at both edges,
 * 20 m at x = 200, linear on either side. Sampled every 10 m.
 */
function ridge(crest: number): Heightfield {
  const heights: number[] = [];
  for (let r = 0; r < 41; r++) {
    for (let c = 0; c < 41; c++) heights.push(crest * (1 - Math.abs(c * 10 - 200) / 200));
  }
  return { spacing: 10, columns: 41, rows: 41, heights };
}

describe("having eyes on a force", () => {
  /**
   * Rules decision 17, ruled by the author 2026-09-16: a force learns that a
   * charge **it laid** has gone off only if it can see it happen. That is line
   * of sight, not ownership and not a contact — a layer watching the ground he
   * mined sees the explosion; one who has pulled back behind the crest does
   * not, and learns nothing until he goes and looks.
   */
  const battlefield = () => {
    const g = new Game({ seed: 1, terrain: { heightfield: ridge(20), objects: [] } });
    const victim = g.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", { x: 60, y: 200 }, 8));
    return { g, victim };
  };

  it("is true for a force with a clear line, whether or not it has found it", () => {
    const { g, victim } = battlefield();
    g.addUnit(makeInfantry("RED-1", "RED", "squad", { x: 120, y: 200 }, 6));
    // Nothing has been detected — no contact ledger entry exists yet.
    expect(g.contactsFor("RED")).toEqual([]);
    expect(hasEyesOn(g, "RED", victim)).toBe(true);
  });

  it("is false for a force the crest stands between", () => {
    const { g, victim } = battlefield();
    // Over the ridge and down the far side: 20 m of ground in the way.
    g.addUnit(makeInfantry("RED-1", "RED", "squad", { x: 340, y: 200 }, 6));
    expect(hasEyesOn(g, "RED", victim)).toBe(false);
  });

  it("asks the whole side, not one force", () => {
    const { g, victim } = battlefield();
    g.addUnit(makeInfantry("RED-1", "RED", "squad", { x: 340, y: 200 }, 6));
    expect(hasEyesOn(g, "RED", victim)).toBe(false);
    // One pair of eyes on this side of the crest is enough.
    g.addUnit(makeInfantry("RED-2", "RED", "squad", { x: 120, y: 200 }, 6));
    expect(hasEyesOn(g, "RED", victim)).toBe(true);
  });

  it("does not count a force that is in no state to be looking", () => {
    // The same test the detection roll applies (`canObserve`): a neutralised
    // squad is still drawn on the map and is still not watching anything. Two
    // answers to that question is how the halves of a rule come apart.
    const { g, victim } = battlefield();
    const watcher = g.addUnit(makeInfantry("RED-1", "RED", "squad", { x: 120, y: 200 }, 6));
    expect(hasEyesOn(g, "RED", victim)).toBe(true);
    watcher.neutralized = true;
    expect(hasEyesOn(g, "RED", victim)).toBe(false);
  });
});
