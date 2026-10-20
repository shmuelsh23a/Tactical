/**
 * Smoke / obscuration (עשן). Duration in turns by delivery means.
 * Rule: no firing into or through smoke.
 */
/**
 * `grenade` is the hand-thrown pot (רימון), `rifleGrenade` smoke fired from a
 * squad's launcher (Battle Drill 2's screening smoke, the drill's grenadiers).
 * The two were one source until 2026-10-20, when a hand grenade had to be
 * thrown by somebody (README, after rules decision 96).
 */
export type SmokeSource = "grenade" | "rifleGrenade" | "mortar" | "artillery";

export const SMOKE_DURATION_TURNS: Record<SmokeSource, number> = {
  grenade: 1, // רימון
  rifleGrenade: 1, // ours (⚠️): as the hand pot
  mortar: 2, // פצמ"ר
  artillery: 4, // פגז ארטילריה
};

/**
 * Screen radius in metres by delivery means. The document sizes no screen, so
 * these are chosen to scale with the delivery: a hand-thrown pot screens a
 * single bound, a mortar bomb a squad's frontage, an artillery shell a
 * platoon's — see rules decision 8 in the README.
 *
 * The *delay* before a screen arrives is not listed here: it is the delivering
 * weapon's own שיהוי from the explosives table (grenade none, mortar one turn,
 * artillery two), so the two can never drift apart.
 */
export const SMOKE_RADIUS_M: Record<SmokeSource, number> = {
  grenade: 25,
  rifleGrenade: 25, // ours (⚠️): as the hand pot
  mortar: 50,
  artillery: 100,
};

/**
 * How far a smoke grenade lands from the man who threw it (the author,
 * 2026-10-20: "a hand-thrown smoke grenade needs a thrower of the side within
 * throwing range of where it lands"). TC 3-23.30 (2021), app. B, the M18
 * colored smoke grenade's "Average Throwing Distance": 35 m standing, 25 m
 * kneeling, 20 m prone — the standing figure, the farthest a man can put it.
 */
export const SMOKE_GRENADE_THROW_M = 35;

/** Smoke blocks all fire whose line of sight passes into or through it. */
export const SMOKE_BLOCKS_FIRE = true;
