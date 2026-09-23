/**
 * Mission planning (rules decision 38): what a side prepares before the
 * battle — targets its guns register, the observation posts it puts out, and
 * the alternate positions it prepares. The author ruled all three are the
 * player's to set in mission planning (2026-09-23); the document gives none of
 * them a number, so **every figure here is ours** (⚠️), for the author to
 * accept or replace.
 */

/**
 * The most targets a side may register for one weapon. Ours: a company's fire
 * plan with a target or two for itself and for each platoon below it — the
 * author's "his echelon and one below".
 */
export const MAX_REGISTERED_TARGETS_PER_WEAPON = 6;

/**
 * How far an observation post sees a force on the move. Ours: men walking in
 * the open are picked up by eye at about a kilometre, and an OP's whole job is
 * to look. A hidden force — one that did not move — is looked for in the
 * document's 20 m band as ever; an OP does not change that. Binoculars and
 * UAVs, which would, are later (backlog 4).
 */
export const OBSERVATION_POST_RANGE_M = 1000;

/** Alternate positions one force may prepare. Ours: one, its alternate. */
export const MAX_ALTERNATE_POSITIONS_PER_FORCE = 1;

/** How near a prepared position a force must stand to be in it. Ours: a squad's frontage, halved. */
export const PREPARED_POSITION_REACH_M = 25;
