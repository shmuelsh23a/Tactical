/**
 * Engineering work a force does on the ground itself (חבלה).
 *
 * Nothing here is transcribed from the document: it describes charges only as
 * something already on the map, and never mentions laying one during a battle.
 * The author ruled on 2026-09-16 that an **insurgent or special force** may lay
 * a charge in play and that it takes **two turns**, tentatively — like every
 * figure he has given, it sits on [balance.md](../../../docs/balance.md) rather
 * than in the rules tables (rules decision 16).
 */
export const CHARGE_LAYING = {
  /**
   * Turns of uninterrupted work before a charge laid in play is armed. The
   * turn the work is begun counts as the first, so a charge begun on turn T
   * is on the ground from the start of turn T+2.
   */
  turnsToLay: 2,
} as const;
