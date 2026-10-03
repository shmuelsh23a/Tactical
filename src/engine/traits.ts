import type { MovementMode, Soldier, Traits, Unit } from "./types.js";
import { FATIGUE, FATIGUE_EFFECT, LUCK, TRAIT_EFFECT_MAX, TRAIT_MEAN } from "./data/traits.js";

/**
 * What a soldier's traits do beyond morale (rules decisions 69, 71 and 72).
 * Every effect here is off unless the force carries `traitRules` — the game
 * sets it from `GameOptions` — and its men carry traits, which they do only
 * when the game is played with morale. None of it draws from the rng.
 */

/** A trait's place on the scale, −1 at 1 to +1 at 10, 0 at the mean. */
export function traitScale(value: number): number {
  return Math.max(-1, Math.min(1, (value - TRAIT_MEAN) / (10 - TRAIT_MEAN)));
}

/** A trait as a factor: ×0.8 at 1, ×1 at the mean, ×1.2 at 10 (decision 69). */
export function traitFactor(value: number | undefined): number {
  return value === undefined ? 1 : 1 + TRAIT_EFFECT_MAX * traitScale(value);
}

const effectsOn = (unit: Unit) => unit.traitRules?.effects === true;
const fatigueOn = (unit: Unit) => unit.traitRules?.fatigue === true;
const standing = (unit: Unit) => (unit.soldiers ?? []).filter((s) => !s.neutralized && s.traits);

/** The mean of a trait over a force's men still on their feet; undefined when none carry traits. */
export function meanTrait(unit: Unit, trait: keyof Traits): number | undefined {
  const men = standing(unit);
  if (men.length === 0) return undefined;
  return men.reduce((n, s) => n + s.traits![trait], 0) / men.length;
}

// ---------------------------------------------------------------------------
// Fatigue (decision 71)
// ---------------------------------------------------------------------------

/** How tired a man is, against what his strength lets him take. */
export function fatigueLevel(s: Soldier): "fresh" | "tired" | "exhausted" {
  const points = s.fatigue ?? 0;
  if (points === 0) return "fresh";
  const strength = traitFactor(s.traits?.strength);
  if (points >= FATIGUE.exhausted * strength) return "exhausted";
  if (points >= FATIGUE.tired * strength) return "tired";
  return "fresh";
}

function fatigueEffect(unit: Unit, s: Soldier): { pace: number; accuracy: number } {
  if (!fatigueOn(unit)) return { pace: 1, accuracy: 1 };
  const level = fatigueLevel(s);
  return level === "fresh" ? { pace: 1, accuracy: 1 } : FATIGUE_EFFECT[level];
}

/**
 * The end of a turn for a force's men (decision 71): a run, a climb and fire
 * add to each man's count; a quiet turn takes some off. One counter per man,
 * no sight lines, no draws.
 */
export function updateFatigue(unit: Unit, climbedM: number): void {
  if (!fatigueOn(unit)) return;
  const gain =
    (unit.ranThisTurn ? FATIGUE.run : 0) + climbedM * FATIGUE.perClimbM + (unit.underFire ? FATIGUE.underFire : 0);
  for (const s of unit.soldiers ?? []) {
    if (s.neutralized) continue;
    const next = gain > 0 ? (s.fatigue ?? 0) + gain : (s.fatigue ?? 0) - FATIGUE.rest;
    const clamped = Math.max(0, Math.min(FATIGUE.max, next));
    if (clamped > 0) s.fatigue = clamped;
    else delete s.fatigue;
  }
}

// ---------------------------------------------------------------------------
// Pace (decisions 69 and 71)
// ---------------------------------------------------------------------------

/**
 * The share of its gait a force makes for its men. On a rush — a run —
 * agility and strength (under load) set each man's pace, and **a force
 * rushes at its slowest man's pace** (decision 69); walking is the gait's
 * own (author, 2026-10-03: the slowest man at every gait cost the tel's 3:1
 * attack 41% to 27%, balance.md, fifty-third round). Tiredness slows a man
 * at any gait (decision 71).
 */
export function tracePace(unit: Unit, gait: MovementMode): number {
  if (!effectsOn(unit) && !fatigueOn(unit)) return 1;
  const rush = effectsOn(unit) && gait === "run";
  let slowest = 1;
  let any = false;
  for (const s of standing(unit)) {
    const legs = rush ? traitFactor(s.traits!.agility) * traitFactor(s.traits!.strength) : 1;
    const pace = legs * fatigueEffect(unit, s).pace;
    slowest = any ? Math.min(slowest, pace) : pace;
    any = true;
  }
  return any ? slowest : 1;
}

// ---------------------------------------------------------------------------
// Fire, and being fired at (decision 69)
// ---------------------------------------------------------------------------

/** A man's aim: his intelligence, and his tiredness. */
export function aimFactor(unit: Unit, s: Soldier): number {
  const intelligence = effectsOn(unit) ? traitFactor(s.traits?.intelligence) : 1;
  return intelligence * fatigueEffect(unit, s).accuracy;
}

/**
 * Agility at a rush: a force that ran this turn is harder to hit the more
 * agile its men — ×0.8 to ×1.2 on the chance, on their mean. The hit is
 * rolled before the man it lands on is chosen, so it is the force's.
 */
export function rushFactor(unit: Unit): number {
  if (!effectsOn(unit) || !unit.ranThisTurn) return 1;
  return 2 - traitFactor(meanTrait(unit, "agility"));
}

/**
 * Agility under shelling: men caught on their feet get down quicker the more
 * agile they are. The share of the way from the standing figure to the
 * figure for men already down that the force's mean agility takes it: up to
 * +0.2 for the most agile, −0.2 (worse than standing) for the least. Men
 * already down are where they would get to anyway.
 */
export function quickToCover(unit: Unit): number {
  if (!effectsOn(unit) || unit.downUnderShelling) return 0;
  const agility = meanTrait(unit, "agility");
  return agility === undefined ? 0 : TRAIT_EFFECT_MAX * traitScale(agility);
}

/**
 * Wisdom: spotting the enemy and noticing charges. The force rolls once, so
 * the roll is its best observer's (decision 69).
 */
export function eyesFactor(unit: Unit): number {
  if (!effectsOn(unit)) return 1;
  const men = standing(unit);
  if (men.length === 0) return 1;
  return traitFactor(Math.max(...men.map((s) => s.traits!.wisdom)));
}

/**
 * Luck on a hit (decision 69): what the severity draw `u` (0–1, decision
 * 26's d10 taken whole) comes to for this man. `miss`: it missed him after
 * all. Without traits, exactly the d10's faces.
 */
export function luckyOutcome(
  unit: Unit,
  s: Soldier,
  u: number,
  light: number,
  serious: number,
): "miss" | "light" | "serious" | "killed" {
  const x = u * 10;
  const luck = effectsOn(unit) && s.traits ? traitScale(s.traits.luck) : 0;
  if (luck > 0 && x < LUCK.missFaces * luck) return "miss";
  if (x < light) return "light";
  const killBand = 10 - light - serious;
  return x < 10 - killBand * (1 - TRAIT_EFFECT_MAX * luck) ? "serious" : "killed";
}

// ---------------------------------------------------------------------------
// Who fires first (decision 72)
// ---------------------------------------------------------------------------

/**
 * The order a side's forces fire in: those that did not move this turn
 * first (a force already aiming beats one on the move), then by their men's
 * mean agility, highest first; the order they were added breaks a tie.
 * ⚠️ A force without men's traits (a vehicle) counts as average.
 */
export function firingOrder(units: Unit[]): Unit[] {
  const agility = (u: Unit) => meanTrait(u, "agility") ?? TRAIT_MEAN;
  return units
    .map((u, i) => ({ u, i }))
    .sort((a, b) => {
      const moved = Number(a.u.movedThisTurn > 0) - Number(b.u.movedThisTurn > 0);
      if (moved !== 0) return moved;
      const ag = agility(b.u) - agility(a.u);
      return ag !== 0 ? ag : a.i - b.i;
    })
    .map((x) => x.u);
}
