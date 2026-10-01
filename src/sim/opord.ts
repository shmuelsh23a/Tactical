import { MORALE_RULES, MOVEMENT_PROFILES, UNDER_FIRE_SPEED_MULTIPLIER } from "../engine/index.js";

const { SIDE_BREAK_BY_POSTURE } = MORALE_RULES;

/**
 * The order the attacking company commander is given before the battle: an
 * OPORD from battalion, in the five paragraphs (situation, mission,
 * execution, sustainment, command), for the tel's assault scenarios
 * (docs/balance.md, thirty-sixth round).
 *
 * It says what a company commander would be told: what the enemy is and how it
 * sits (not where each squad is), the ground, what the company has, the task,
 * the intent, and the time and movement it has to work with. **It names no
 * option and gives no plan**: how to find the enemy, when to go and how to
 * close are the commander's, and a test holds it to that, as it does the
 * mission principles (Jev leans to an option whose words the state repeats).
 *
 * ⚠️ Ours, not the author's: the intelligence picture and the intent are
 * written for the test beds, from what the scenario files set up.
 */
export type Order = readonly string[];

const WALK = MOVEMENT_PROFILES.normal.maxDistance;
const RUN = MOVEMENT_PROFILES.run.maxDistance;
const UNDER_FIRE = WALK * UNDER_FIRE_SPEED_MULTIPLIER;

/** The two assault scenarios differ only in the attacking force. */
function telAssaultOrder(platoons: number): Order {
  const force = platoons === 3 ? "your company (three platoons)" : "your two platoons";
  const men = platoons * 27 + 5;
  return [
    "1. SITUATION.",
    "a. Enemy. One infantry platoon, about 30 men (three squads of eight and a command group), holds the shoulder of Tel Azeka south of the summit, " +
      "in positions it prepared before the battle: dug in, with overhead cover. Expect one of its squads to be held back behind the forward positions, " +
      "to retake a position it loses. Expect mines on the approaches to the shoulder. Its company command post, behind the summit, " +
      "calls the enemy company's mortars (about 12 missions) and has registered them on the approaches. " +
      "Men dug in and still are hard to find: through binoculars within about 600 m, more easily the closer.",
    "b. Ground. The tel's summit is at 345 m, the shoulder about 320 m. Your start line is on the ridge south of it, at about 290 m, " +
      "some 350-450 m from the shoulder. The approach has dead ground in it, and low ground on the east.",
    `c. Friendly. ${force}, about ${men} men: each platoon three squads of eight and a command group, and your company command group. ` +
      "The company mortar section is on call to you all battle: 12 missions of 12 bombs. A bomb kills within about 12 m, less against men dug in with overhead cover; " +
      "a position under fire is pinned while it lasts and a turn or two after.",
    "2. MISSION. " +
      `${force[0]!.toUpperCase() + force.slice(1)} attacks from the south and seizes the shoulder of Tel Azeka by the end of turn 45, ` +
      "destroying or driving off the enemy platoon on it.",
    "3. EXECUTION.",
    "a. Commander's intent. Purpose: the shoulder is taken so that the battalion can use it. End state: the enemy is off the shoulder, " +
      "and your force is on it by the deadline and still able to fight. How you do it is yours to plan.",
    "b. Coordinating instructions. A turn is one minute. On foot a squad covers up to " +
      `${WALK} m a turn walking, ${RUN} m running, and half that under fire (${UNDER_FIRE} m walking); ` +
      "every metre climbed costs 5 m of a move. From the start line to the shoulder is about 30 m of climb: " +
      `about ${Math.round((400 + 30 * 5) / WALK)} turns walking unopposed, about twice that under fire. ` +
      `The attack is called off when about ${Math.round(SIDE_BREAK_BY_POSTURE.attacking * 100)}% of your men are down, broken or fled; ` +
        `the enemy gives up at about ${Math.round(SIDE_BREAK_BY_POSTURE.defending * 100)}% of his.`,
    "4. SUSTAINMENT. Small-arms ammunition is not a constraint in this action; the mortar missions are what is scarce.",
    "5. COMMAND AND SIGNAL. You control the company by platoon. Your scouts report what they see as they see it. " +
      "The battalion expects the shoulder by turn 45 and will not extend the deadline.",
  ];
}

/** The order for a scenario, where one has been written. */
export const ORDERS: Readonly<Record<string, Order>> = {
  telAzekaAssault: telAssaultOrder(3),
  telAzekaAssault2: telAssaultOrder(2),
};
