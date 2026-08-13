import type { Point } from "./geometry.js";
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
}

/**
 * The contacts every side holds. Purely a record of observations — it never
 * rolls anything, so a game with the module switched off draws exactly the
 * same numbers from the rng as one with it on.
 */
export class IntelLedger {
  private readonly bySide = new Map<Side, Map<string, Contact>>();

  /** Note that `side` has just observed `unitId` at `position`. */
  record(
    side: Side,
    unitId: string,
    position: Point,
    turn: number,
    source: ContactSource,
  ): Contact {
    let contacts = this.bySide.get(side);
    if (!contacts) {
      contacts = new Map();
      this.bySide.set(side, contacts);
    }
    const contact: Contact = {
      unitId,
      lastSeenTurn: turn,
      lastKnownPosition: { ...position },
      source,
    };
    contacts.set(unitId, contact);
    return contact;
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
    for (const contacts of this.bySide.values()) {
      for (const [unitId, contact] of contacts) {
        if (currentTurn - contact.lastSeenTurn >= afterTurns) {
          contacts.delete(unitId);
          dropped.push(contact);
        }
      }
    }
    return dropped;
  }
}
