import type { GameRecording, RecordedAction } from "../engine/index.js";

/** Hebrew phase names, matching the ones the hotseat UI uses. */
const phaseHe: Record<string, string> = {
  initiative: "יוזמה",
  intel: "מודיעין",
  targeting: "סימון מטרות",
  resolvePriorArty: "פתרון ארטילריה",
  movement: "תנועה",
  combat: "ירי",
  summary: "סיכום",
};

const weaponHe: Record<string, string> = {
  smallArms: 'נק"ל',
  sustainedMg: "מקלע",
  mortar: "מרגמה",
  artillery: "ארטילריה",
  tankRound: "פגז טנק",
  grenade: "רימון",
  rpgVsInfantry: 'רק"ק נגד חי"ר',
  rpgVsArmor: 'רק"ק נגד רק"מ',
};

const term = (dict: Record<string, string>, key: string) => dict[key] ?? key;

/** Force names by id, read out of the recording's own setup actions. */
export function unitNames(recording: GameRecording): Map<string, string> {
  const names = new Map<string, string>();
  for (const action of recording.actions) {
    if (action.kind === "addUnit") names.set(action.unit.id, action.unit.name);
  }
  return names;
}

const at = (p: { x: number; y: number }) => `(${Math.round(p.x)}, ${Math.round(p.y)})`;

/** One line of after-action narration for a recorded action. */
export function describeAction(action: RecordedAction, names: Map<string, string>): string {
  const who = (id: string) => names.get(id) ?? id;

  switch (action.kind) {
    case "addUnit":
      return `כניסת כוח: ${action.unit.name} ${at(action.unit.position)}`;
    case "addMine":
      return `הנחת ${action.mine.type === "antiTank" ? 'מטען נ"ט' : 'מטען נ"א'} ${at(action.mine.position)}`;
    case "beginTurn":
      return "תחילת תור — יוזמה";
    case "advancePhase":
      return "מעבר שלב";
    case "advanceToPhase":
      return `מעבר לשלב ${term(phaseHe, action.target)}`;
    case "uavSweep":
      return `סריקת כטב"מ (${action.viewer}) ${at(action.footprintCenter)}`;
    case "queueIndirectFire":
      return `${action.side}: משימת אש ${term(weaponHe, action.weaponKey)} ${at(action.target)}`;
    case "moveUnit":
      return `${who(action.unitId)} נע ${action.mode === "run" ? "בריצה" : "רגיל"} אל ${at(action.to)}`;
    case "fire":
      return `${who(action.attackerId)} → ${who(action.targetId)} (${term(weaponHe, action.opts.weapon)})`;
    case "fireExplosive":
      return `${who(action.attackerId)} → ${who(action.targetId)} (${term(weaponHe, action.weaponKey)})`;
    case "assault":
      return `${who(action.attackerId)} הסתער על ${who(action.defenderId)}${
        action.grenades ? ` (${action.grenades} רימונים)` : ""
      }`;
    case "deploySmoke":
      return `${action.side}: מסך עשן ${term(weaponHe, action.source)} ${at(action.center)}`;
    case "issueOrders":
      return `${who(action.unitId)} קיבל פקודות`;
    default:
      return JSON.stringify(action);
  }
}

/**
 * Map extent to draw a recording on. A recording is engine-level and carries no
 * map size, so it is derived from everything the battle actually touched.
 */
export function recordingExtent(recording: GameRecording): { width: number; height: number } {
  let maxX = 0;
  let maxY = 0;
  const see = (p: { x: number; y: number }) => {
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  for (const action of recording.actions) {
    switch (action.kind) {
      case "addUnit":
        see(action.unit.position);
        break;
      case "addMine":
        see(action.mine.position);
        break;
      case "moveUnit":
        see(action.to);
        break;
      case "queueIndirectFire":
        see(action.target);
        break;
      case "deploySmoke":
        see(action.center);
        break;
      case "uavSweep":
        see(action.footprintCenter);
        break;
      default:
        break;
    }
  }
  const pad = 120;
  return { width: Math.max(400, maxX + pad), height: Math.max(400, maxY + pad) };
}
