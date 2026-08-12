import type { ActionOutcome, GameRecording, RecordedAction } from "../engine/index.js";

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

const pct = (p: number) => `${Math.round(p * 100)}%`;

/**
 * What the action produced, in one line — the dice behind the decision.
 *
 * Returns an empty string when there is nothing to report, so the timeline
 * stays quiet for setup and for phase steps where nothing landed.
 */
export function describeOutcome(outcome: ActionOutcome, names: Map<string, string>): string {
  const who = (id: string) => names.get(id) ?? id;

  switch (outcome.kind) {
    case "setup":
      return "";

    case "beginTurn":
      return `יוזמה: ${outcome.initiativeOrder.join(" → ")}`;

    case "phase": {
      // Indirect fire lands on the step that crossed resolvePriorArty, not on
      // the step that marked it — so it is narrated here.
      const parts: string[] = [];
      for (const screen of outcome.smokeArrived) {
        parts.push(`מסך עשן ירד (רדיוס ${screen.radius}מ')`);
      }
      for (const impact of outcome.resolved) {
        const off = Math.round(
          Math.hypot(
            impact.dispersion.impact.x - impact.aim.x,
            impact.dispersion.impact.y - impact.aim.y,
          ),
        );
        const caught = impact.blast.targets.filter((t) => t.caught);
        const casualties = caught.reduce((n, t) => n + t.newCasualties, 0);
        const hit = caught.length
          ? `, פגע ב${caught.map((t) => who(t.unitId)).join(", ")}${
              casualties ? ` — ${casualties} נפגעים` : ""
            }`
          : ", ללא פגיעות";
        parts.push(`${off > 0 ? `נחיתה בסטייה ${off}מ'` : "נחיתה מדויקת"}${hit}`);
      }
      return parts.join(" · ");
    }

    case "uavSweep": {
      const { spottedUnitIds, foundMineIds } = outcome.detection;
      if (!spottedUnitIds.length && !foundMineIds.length) return "ללא גילוי";
      const bits: string[] = [];
      if (spottedUnitIds.length) bits.push(`גילוי: ${spottedUnitIds.map(who).join(", ")}`);
      if (foundMineIds.length) bits.push(`${foundMineIds.length} מטענים`);
      return bits.join(" · ");
    }

    case "queueIndirectFire":
      return `פגיעה צפויה בתור ${outcome.mission.resolvesOnTurn}`;

    case "moveUnit": {
      const bits: string[] = [];
      const { detection, mineDetonations } = outcome.move;
      if (detection.spottedUnitIds.length) {
        bits.push(`גילוי: ${detection.spottedUnitIds.map(who).join(", ")}`);
      }
      if (detection.foundMineIds.length) bits.push(`איתר ${detection.foundMineIds.length} מטענים`);
      for (const det of mineDetonations) {
        const kind = det.type === "antiTank" ? 'מטען נ"ט' : 'מטען נ"א';
        if (!det.activated) {
          bits.push(`דרך על ${kind} — לא הופעל`);
          continue;
        }
        const caught = (det.blast?.targets ?? []).filter((t) => t.caught);
        const casualties = caught.reduce((n, t) => n + t.newCasualties, 0);
        bits.push(`${kind} התפוצץ — ${caught.reduce((n, t) => n + t.damage, 0)} נק"פ, ${casualties} נפגעים`);
      }
      return bits.join(" · ");
    }

    case "fire": {
      const r = outcome.result;
      if (!r.fired) return `לא ירה (${r.reason ?? "—"})`;
      return `${r.hits}/${r.shooters} פגיעות ב-${pct(r.hitChance)}, ${r.totalDamage} נק"פ, ${r.newCasualties} נפגעים${
        r.targetNeutralized ? " — נוטרל" : ""
      }`;
    }

    case "fireExplosive": {
      const r = outcome.result;
      if (!r.fired) return `לא ירה (${r.reason ?? "—"})`;
      if (!r.hit) return `החטאה (${pct(r.hitChance)})`;
      const caught = (r.blast?.targets ?? []).filter((t) => t.caught);
      const casualties = caught.reduce((n, t) => n + t.newCasualties, 0);
      const armour = caught.find((t) => t.armorEffect)?.armorEffect;
      const armourText = armour
        ? ` — ${armour.partName}${armour.penetrated ? ", חדירה" : ", ללא חדירה"}${
            armour.destroyed ? ", הושמד" : armour.mobilityKilled ? ", נכשל ניוד" : ""
          }`
        : "";
      return `פגיעה (${pct(r.hitChance)})${casualties ? `, ${casualties} נפגעים` : ""}${armourText}`;
    }

    case "assault": {
      const r = outcome.result;
      if (!r.fired) return `לא הסתער (${r.reason ?? "—"})`;
      return `${r.fireHits} פגיעות אש, ${r.grenadeHits} רימונים, ${r.defenderCasualties} נפגעים${
        r.selfCasualties ? ` · ${r.selfCasualties} נפגעים עצמיים` : ""
      }${r.defenderNeutralized ? " — האויב נוטרל" : ""}`;
    }

    case "deploySmoke":
      return outcome.order.screen
        ? `הונח מיד — ${outcome.order.durationTurns} תורות`
        : `יגיע בתור ${outcome.order.arrivesOnTurn}`;

    case "issueOrders":
      return outcome.accepted ? "הפקודה התקבלה" : "מחוץ למחזור הפקודות";

    default:
      return "";
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
