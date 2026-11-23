import { ORDER_VERSION, type CompanyOrder, type ControlMeasure, type Trigger } from "../app/order.js";

/**
 * The eight reference plans (docs/balance.md, *The reference plans*) written
 * as company orders (decision 126: "the plans written as orders must play
 * the same as their hand-built form"). Each carries the `jev-sim --rule`
 * choices it was hand-built from; `orderCommander.test.ts` holds each order
 * to them, question by question.
 *
 * The orders are the Tel Azeka company attack's (`telAzekaAssault`, and its
 * two-platoon form); the attacking side is BLUE.
 */
export interface ReferenceOrder {
  /** The plan's letter and name, as balance.md's table has it. */
  name: string;
  /** What `jev-sim --opord ref:<key>` calls it. */
  key: string;
  /** The `--rule` choices it reproduces. */
  rule: readonly string[];
  /** The scenarios it is written for: the tel's company attack and its two-platoon form. */
  scenarios: readonly string[];
  order: CompanyOrder;
}

/** Both tel assaults: the same ground, plan and side; the second has two platoons, not three. */
const TEL_ASSAULTS = ["telAzekaAssault", "telAzekaAssault2"] as const;

/** Find, fix, then assault (decision 54): the enemy held in sight four turns, or no scouts left to look. */
const FIXED: Trigger = { any: [{ when: "enemyFixed", turns: 4 }, { when: "scoutsLost" }] };

function telOrder(o: {
  timeOfAttack?: Trigger;
  tasks?: CompanyOrder["execution"]["tasks"];
  bound?: boolean;
  measures?: ControlMeasure[];
}): CompanyOrder {
  return {
    version: ORDER_VERSION,
    scenario: "telAzekaAssault",
    side: "BLUE",
    mission: { task: "attack", objective: "SHOULDER", byTurn: 60, purpose: "so that the battalion can use the shoulder" },
    execution: {
      intent: {
        purpose: "The shoulder is taken so that the battalion can use it.",
        endState: "The enemy is off the shoulder, and the company is on it by the deadline and still able to fight.",
      },
      recon: { squads: "onePerPlatoon", waitIn: "deadGround", baseOfFireOnGo: false },
      timeOfAttack: o.timeOfAttack ?? FIXED,
      tasks: o.tasks ?? {},
      boundByPlatoon: o.bound ?? false,
      fires: { priorityTarget: "centre", policy: "doctrine", holdUntilTimeOfAttack: false },
      measures: [
        { kind: "lineOfDeparture", at: { suggested: "startLine" } },
        { kind: "objective", name: "SHOULDER", at: { suggested: "brief" } },
        ...(o.measures ?? []),
      ],
    },
  };
}

const FLANK: ControlMeasure = { kind: "checkpoint", name: "CP 1", at: { suggested: "flank" } };
const FCL: ControlMeasure = { kind: "finalCoordinationLine", holdUntilLifted: true };
const MOVE_UP: ControlMeasure = { kind: "assaultPosition", at: { suggested: "lastCover" }, occupy: { when: "enemyFound" } };
const BASE_OF_FIRE: ControlMeasure = { kind: "supportByFirePosition", name: "SBF 1", platoon: "BLUE-1", at: { suggested: "smallArmsReach" } };
const SUPPORT = { "BLUE-1": "support" as const };

export const REFERENCE_ORDERS: readonly ReferenceOrder[] = [
  { name: "A calibrated", scenarios: TEL_ASSAULTS, key: "A", rule: [], order: telOrder({}) },
  { name: "A + flank", scenarios: TEL_ASSAULTS, key: "A+flank", rule: ["flank"], order: telOrder({ measures: [FLANK] }) },
  {
    name: "B deliberate", scenarios: TEL_ASSAULTS, key: "B",
    rule: ["basefire", "bound", "holdshort"],
    order: telOrder({ tasks: SUPPORT, bound: true, measures: [BASE_OF_FIRE, FCL] }),
  },
  {
    name: "E fire-heavy", scenarios: TEL_ASSAULTS, key: "E",
    rule: ["holdshort", "prep"],
    // Fire first: go once most missions are fired on the enemy in sight, or by turn 30 whatever.
    order: telOrder({
      timeOfAttack: {
        any: [{ when: "turn", turn: 30 }, { when: "scoutsLost" }, { all: [{ when: "enemyFixed", turns: 4 }, { when: "missionsLeft", atMost: 4 }] }],
      },
      measures: [FCL],
    }),
  },
  { name: "D flank", scenarios: TEL_ASSAULTS, key: "D", rule: ["basefire", "holdshort", "flank"], order: telOrder({ tasks: SUPPORT, measures: [BASE_OF_FIRE, FCL, FLANK] }) },
  { name: "A + move up", scenarios: TEL_ASSAULTS, key: "A+moveup", rule: ["moveup"], order: telOrder({ measures: [MOVE_UP] }) },
  {
    name: "B + move up", scenarios: TEL_ASSAULTS, key: "B+moveup",
    rule: ["basefire", "bound", "holdshort", "moveup"],
    order: telOrder({ tasks: SUPPORT, bound: true, measures: [BASE_OF_FIRE, FCL, MOVE_UP] }),
  },
  // Hasty: in as soon as the enemy is found.
  { name: "C hasty", scenarios: TEL_ASSAULTS, key: "C", rule: ["rush"], order: telOrder({ timeOfAttack: { any: [{ when: "enemyFound" }, { when: "scoutsLost" }] } }) },
];
