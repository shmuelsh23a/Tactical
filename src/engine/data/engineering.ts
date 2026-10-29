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

/**
 * Breaching charges (decision 125). Doctrine gives no number — supplies are
 * sized "to breach many doors based on the size of the objective" (ATP
 * 3-06.11 (2024), para 6-107) — so a scenario sets it; this is what a
 * breach squad carries when it says nothing. Ours (⚠️, on balance.md).
 */
export const BREACHING_CHARGES_EACH = 2;
/**
 * Rifle squads a platoon, for how many breach squads a side may name when
 * the engine knows no platoons (decision 125: one a platoon). Ours (⚠️):
 * the US rifle platoon's three.
 */
export const SQUADS_A_PLATOON = 3;
