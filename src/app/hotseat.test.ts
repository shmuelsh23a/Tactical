import { describe, it, expect } from "vitest";
import { disclose, readableBy, SIDES, type Audience, type LogEntry } from "./hotseat.js";

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
