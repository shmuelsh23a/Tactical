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

/** Smoke blocks all fire whose line of sight passes into or through it. */
export const SMOKE_BLOCKS_FIRE = true;
