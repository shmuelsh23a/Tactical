import { ADJUSTMENT_RADIUS_M, EYE_HEIGHT, distance, type Game, type Point, type Side, type Unit } from "../engine/index.js";
import { isDeadGround } from "./deadGround.js";
import { DrillState, PLAIN_SCRIPT, drillCombat, drillMovement, type DrillReport, type DrillTask, type SquadDrill } from "./drill.js";
import { sideView } from "./hotseat.js";

/**
 * A side the computer plays: the defending company's fire plan and fire
 * calls, moved here from the headless runner (src/sim/scenarioBattle.ts) so
 * that the browser game and the harness play the same defender. Every choice
 * reads the side's own picture (`sideView`, its contacts) and the ground,
 * never where the enemy truly is.
 */

const MORTAR = "mortar";

const mean = (us: readonly Unit[]): Point => ({
  x: us.reduce((t, u) => t + u.position.x, 0) / us.length,
  y: us.reduce((t, u) => t + u.position.y, 0) / us.length,
});

/** Whether `side` may call its mortars now: allowed, missions left, and none still adjusting. */
export function mortarFree(g: Game, side: Side): boolean {
  if (!g.mayCall(side, MORTAR)) return false;
  if ((g.fireMissionsLeft(side, MORTAR) ?? 1) <= 0) return false;
  return !g.fireMissions.some((m) => m.side === side && m.weapon === MORTAR && m.status === "adjusting");
}

/** Registered targets the defending company plans (decision 38 allows six a weapon). */
const DEFENDER_TARGETS = 6;
/** Where it looks for them: this far in front of its positions (ours). */
const DEFENDER_PLAN_BAND_M = { near: 100, far: 400 } as const;
/** No two closer than this: each covers its 100 m on-the-mark radius (ours). */
const DEFENDER_TARGET_SPACING_M = 120;

/**
 * The defending company's fire plan (a harness policy, ours; rules decision 38
 * lets it register six targets a weapon in planning). It covers with fire what
 * its squads cannot see: the dead ground 100–400 m in front of its positions,
 * toward where the attack comes from, the nearest its positions first — where
 * an assault forms up and closes; if there is too
 * little dead ground, points on the line itself fill the plan. It reads its own
 * positions, the ground and the direction of the attack (the brief's tasking,
 * taken as the attacker's start line) — never where the attacker is.
 */
export function planDefenderFires(
  g: Game,
  side: Side,
  attackFrom: Point,
  width: number,
  height: number,
  prefer: "deadGround" | "open" = "deadGround",
): Point[] {
  const own = g.units.filter((u) => u.side === side && u.kind === "infantry");
  if (!own.length || !g.terrain) return [];
  const centre = mean(own);
  const range = distance(centre, attackFrom);
  if (range === 0) return [];
  const ux = (attackFrom.x - centre.x) / range;
  const uy = (attackFrom.y - centre.y) / range;
  const query = { terrain: g.terrain, watchers: own.map((u) => u.position), watcherEye: EYE_HEIGHT.fullCover, reach: Infinity };
  const candidates: { at: Point; dead: boolean; along: number; off: number }[] = [];
  for (let x = 0; x <= width; x += 20) {
    for (let y = 0; y <= height; y += 20) {
      const dx = x - centre.x;
      const dy = y - centre.y;
      const along = dx * ux + dy * uy;
      if (along < DEFENDER_PLAN_BAND_M.near || along > DEFENDER_PLAN_BAND_M.far) continue;
      const off = Math.abs(dx * uy - dy * ux);
      if (off > along) continue; // within 45° of the line of attack
      const at = { x, y };
      candidates.push({ at, dead: isDeadGround(query, at), along, off });
    }
  }
  // Dead ground first (or open ground, `prefer`), the nearest the positions
  // first — where an assault forms up and closes; then nearest the line of
  // attack; ties by position.
  const first = prefer === "open" ? -1 : 1;
  candidates.sort(
    (a, b) => first * (Number(b.dead) - Number(a.dead)) || a.along - b.along || a.off - b.off || a.at.y - b.at.y || a.at.x - b.at.x,
  );
  const chosen: Point[] = [];
  for (const c of candidates) {
    if (chosen.length >= DEFENDER_TARGETS) break;
    if (chosen.every((p) => distance(p, c.at) >= DEFENDER_TARGET_SPACING_M)) chosen.push(c.at);
  }
  return chosen;
}

/**
 * The defender's fire: for effect on an attacker it has seen this turn or
 * last within the on-the-mark radius of one of its registered targets — the
 * one nearest its own forces — which lands at the weapon's best without an
 * observer; else on the nearest attacker it knows of, from its own forces.
 */
export function callDefenderFire(g: Game, side: Side, registered: readonly Point[] = []): "plan" | "nearest" | undefined {
  if (!mortarFree(g, side)) return undefined;
  const view = sideView(g, side);
  const own = view.units.filter((u) => u.side === side && u.kind !== "command" && !u.neutralized);
  const foes = view.units.filter((u) => u.side !== side && !u.neutralized && !u.surrendered);
  const fresh = (id: string) => (g.contactFor(side, id)?.lastSeenTurn ?? -Infinity) >= g.turn - 1;
  const nearestOwn = (p: Point) => Math.min(...own.map((u) => distance(u.position, p)));
  const onPlan = foes
    .filter((f) => fresh(f.id) && registered.some((r) => distance(r, f.position) <= ADJUSTMENT_RADIUS_M))
    .sort((a, b) => nearestOwn(a.position) - nearestOwn(b.position))[0];
  if (onPlan && own.length) {
    g.callForFire(side, MORTAR, onPlan.position, { method: "effect" });
    return "plan";
  }
  let best: Point | undefined;
  let bd = Infinity;
  for (const f of foes) {
    for (const u of own) {
      const d = distance(f.position, u.position);
      if (d < bd) {
        bd = d;
        best = f.position;
      }
    }
  }
  if (!best) return undefined;
  g.callForFire(side, MORTAR, best, { method: "effect" });
  return "nearest";
}


/**
 * The computer holding a position in the browser game: the harness's
 * defender, one phase at a time. It plans its mortars on the dead ground in
 * front of it before the battle, calls them on what it has seen, and its
 * squads fight by the drill — holding fire to the drill's range, covering
 * when idle, and the reserve retaking a lost position (decision 60). The
 * direction of the attack is where the enemy started, the brief's tasking,
 * as the harness reads it; nothing after that is read off the truth.
 */
export class ComputerDefender {
  private readonly task: DrillTask;
  private readonly state = new DrillState();
  private targets: Point[] = [];

  constructor(
    g: Game,
    readonly side: Side,
    private readonly ground: { mapWidth: number; mapHeight: number; reserves?: readonly string[] },
    private readonly drill: SquadDrill = PLAIN_SCRIPT,
  ) {
    const enemy = g.units.filter((u) => u.side !== side && u.kind !== "command");
    const startLine = enemy.length ? mean(enemy) : mean(g.units.filter((u) => u.side === side));
    this.task = { side, attacking: false, objective: startLine, reserves: new Set(ground.reserves ?? []) };
  }

  /** Mission planning (decision 38): its mortar targets, registered; returns them. */
  plan(g: Game): readonly Point[] {
    if (!g.mayCall(this.side, MORTAR)) return [];
    this.targets = planDefenderFires(g, this.side, this.task.objective, this.ground.mapWidth, this.ground.mapHeight);
    for (const t of this.targets) g.registerTarget(this.side, MORTAR, t);
    return this.targets;
  }

  /** The targeting phase: a mortar mission, if it has one to call. */
  targeting(g: Game): "plan" | "nearest" | undefined {
    return callDefenderFire(g, this.side, this.targets);
  }

  movement(g: Game, report?: DrillReport): void {
    drillMovement(g, this.task, this.drill, this.state, report);
  }

  combat(g: Game, report?: DrillReport): void {
    drillCombat(g, this.task, this.drill, this.state, report);
  }
}
