/**
 * Smoke / obscuration (עשן). Duration in turns by delivery means.
 * Rule: no firing into or through smoke.
 */
export type SmokeSource = "grenade" | "mortar" | "artillery";

export const SMOKE_DURATION_TURNS: Record<SmokeSource, number> = {
  grenade: 1, // רימון
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
  mortar: 50,
  artillery: 100,
};

/** Smoke blocks all fire whose line of sight passes into or through it. */
export const SMOKE_BLOCKS_FIRE = true;
