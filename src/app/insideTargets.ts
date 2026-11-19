import type { Game, Side, Unit } from "../engine/index.js";

/**
 * The enemies the map does not mark as a target for the selected force,
 * because the engine refuses it for a fight inside a building (decision 98):
 * a force fighting inside assaults nobody, and fires out only through its
 * windows (`Game.windowFire`), never at the enemy it fights room by room —
 * the same refusals as `Game.moraleRefusal` and its same-fight check. It
 * reads only tokens the side already draws; whom a force fights inside is
 * put on both sides' maps as the fight starts and as forces join, and kept
 * fresh every turn while `counterattackInside` is on (decision 104). With it
 * off a mark can go stale, but a click is refused with the same words, so
 * the marker tells no more than the click does.
 * Empty when the selected force is not fighting inside.
 */
export function untargetableInside(game: Game, selected: Unit | null | undefined, action: "fire" | "assault", enemies: readonly { id: string; side: Side }[]): ReadonlySet<string> {
  if (!selected) return NONE;
  const fight = game.interior.engagementOf(selected.id);
  if (!fight) return NONE;
  const others = enemies.filter((u) => u.side !== selected.side);
  if (action === "assault" || !game.windowFire) return new Set(others.map((u) => u.id));
  return new Set(others.filter((u) => game.interior.engagementOf(u.id) === fight).map((u) => u.id));
}

const NONE: ReadonlySet<string> = new Set();
