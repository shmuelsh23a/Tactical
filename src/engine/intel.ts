import { distance, type Point } from "./geometry.js";
import type { Side } from "./types.js";

/**
 * What each side knows about the other (תמונת המצב של הצד).
 *
 * The document opens with the game played on three maps: each side moves its
 * own forces on its own map, the umpire keeps the full picture, and
 * "גילויי אדום\כחול ישוקפו על מפות השחקנים על ידי המנחה" — the umpire reflects
 * *detections* onto the players' maps as the game goes on. So a side does not
 * see what is there; it sees what it has picked up.
 *
 * That is what this ledger holds. It is fed by the detection rolls the document
 * already specifies (the movement table's 70%/50% within 300 m, the UAV
 * footprint), so nothing here decides *whether* something is seen — only what
 * is remembered once it has been.
 */

/** What picked a force up. */
export type ContactSource = "movement" | "uav" | "fire";

/** One side's knowledge of one enemy force. */
export interface Contact {
  /** The force observed. */
  unitId: string;
  /** Turn it was last observed — anything older is a stale mark on the map. */
  lastSeenTurn: number;
  /**
   * Where it was when it was last observed. Deliberately *not* where it is now:
   * a contact is a report, and a force that has moved since has left its mark
   * behind.
   */
  lastKnownPosition: Point;
  /** What picked it up last. */
  source: ContactSource;
  /**
   * Whether the force was out of action when it was last seen. A side keeps
   * looking at the report, not at the force: one neutralised after it dropped
   * out of sight still reads as a live contact until somebody looks again.
   */
  lastKnownNeutralized: boolean;
}

/**
 * How good a report is, when sightings carry location error (rules decision
 * 51): the observer's estimate, its spread, and — the umpire's alone — where
 * the force really stood when it was made.
 */
export interface LocationFix {
  /** Where the force truly stood. Never shown: it only tells whether it has moved since. */
  truth: Point;
  /** The report's spread, in metres (one standard deviation a side). */
  sigma: number;
}

/**
 * The contacts every side holds. Purely a record of observations — it never
 * rolls anything, so a game with the module switched off draws exactly the
 * same numbers from the rng as one with it on.
 */
export class IntelLedger {
  private readonly bySide = new Map<Side, Map<string, Contact>>();
  /** The spread behind each side's reports, by side and force (rules decision 51). */
  private readonly fixes = new Map<Side, Map<string, LocationFix>>();

  /**
   * Note that `side` has just observed `unitId` at `position`.
   *
   * With a `fix`, `position` is an observer's estimate, not the truth (rules
   * decision 51). A force that has not moved since the side's last estimate
   * of it is watched, not found again: the two estimates are combined, each
   * weighted by how good it is, so a force watched for longer is placed
   * better. A force that has moved is placed afresh.
   */
  record(
    side: Side,
    unitId: string,
    position: Point,
    turn: number,
    source: ContactSource,
    neutralized = false,
    fix?: LocationFix,
  ): Contact {
    let contacts = this.bySide.get(side);
    if (!contacts) {
      contacts = new Map();
      this.bySide.set(side, contacts);
    }
    let fixes = this.fixes.get(side);
    if (!fixes) {
      fixes = new Map();
      this.fixes.set(side, fixes);
    }
    let at = { ...position };
    if (fix) {
      const before = fixes.get(unitId);
      const known = contacts.get(unitId);
      let sigma = fix.sigma;
      if (before && known && distance(before.truth, fix.truth) < 1e-6) {
        const w0 = 1 / before.sigma ** 2;
        const w1 = 1 / fix.sigma ** 2;
        at = {
          x: (known.lastKnownPosition.x * w0 + position.x * w1) / (w0 + w1),
          y: (known.lastKnownPosition.y * w0 + position.y * w1) / (w0 + w1),
        };
        sigma = 1 / Math.sqrt(w0 + w1);
      }
      fixes.set(unitId, { truth: { ...fix.truth }, sigma });
    } else {
      fixes.delete(unitId);
    }
    const contact: Contact = {
      unitId,
      lastSeenTurn: turn,
      lastKnownPosition: at,
      source,
      lastKnownNeutralized: neutralized,
    };
    contacts.set(unitId, contact);
    return contact;
  }

  /** How far `side`'s report of `unitId` may be off, in metres (one standard deviation), if it carries location error. */
  spreadOf(side: Side, unitId: string): number | undefined {
    return this.fixes.get(side)?.get(unitId)?.sigma;
  }

  /** Everything `side` has ever picked up, oldest report first. */
  contactsFor(side: Side): Contact[] {
    const contacts = [...(this.bySide.get(side)?.values() ?? [])];
    // Sorted by id rather than by insertion, so two replays of the same battle
    // hand back an identical list.
    return contacts.sort((a, b) => (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0));
  }

  /** What `side` last knows of one force, if anything. */
  contactFor(side: Side, unitId: string): Contact | undefined {
    return this.bySide.get(side)?.get(unitId);
  }

  /** Whether `side` has ever picked `unitId` up. */
  knows(side: Side, unitId: string): boolean {
    return this.bySide.get(side)?.has(unitId) ?? false;
  }

  /**
   * Drop contacts nobody has refreshed in `afterTurns` turns — the force is no
   * longer where the report puts it, and no one is prepared to say where it is
   * (rules decision 12). Returns what was dropped, per side.
   */
  expire(currentTurn: number, afterTurns: number): Contact[] {
    const dropped: Contact[] = [];
    for (const [side, contacts] of this.bySide) {
      for (const [unitId, contact] of contacts) {
        if (currentTurn - contact.lastSeenTurn >= afterTurns) {
          contacts.delete(unitId);
          this.fixes.get(side)?.delete(unitId);
          dropped.push(contact);
        }
      }
    }
    return dropped;
  }
}
