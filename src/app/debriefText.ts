import { ASSAULT_RANGE_M, CHARGE_LAYING, OBSERVATION_SECTOR, sectorBonus } from "../engine/index.js";
import type {
  ActionOutcome,
  ChargeWorkReport,
  CoveringFireResult,
  ForceMoraleState,
  MoraleReport,
  MoraleState,
  SuppressionLevel,
  Mine,
  GameRecording,
  MovementMode,
  ObservationSector,
  RecordedAction,
  Side,
  StandingOrder,
  StandingOrderExecution,
} from "../engine/index.js";
import { RecordingLoadError, type LoadProblem } from "./recordingFile.js";

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
  sustainedMg: "מקלע מקביל",
  mortar: "מרגמה",
  artillery: "ארטילריה",
  tankRound: "פגז טנק",
  grenade: "רימון",
  rpgVsInfantry: 'רק"ק נגד חי"ר',
  rpgVsArmor: 'רק"ק נגד רק"מ',
};

const gaitHe: Record<MovementMode, string> = { normal: "קצב רגיל", run: "ריצה" };

const term = (dict: Record<string, string>, key: string) => dict[key] ?? key;

/**
 * Why an action or an order came to nothing, in Hebrew. Shared by the live log
 * and the debrief so a refusal reads the same in both — the engine's reasons
 * are English identifiers and are never shown raw.
 */
export function reasonHe(reason?: string): string {
  switch (reason) {
    // …a shot that could not be taken
    case "out of range":
      return "מחוץ לטווח";
    case "no line of sight":
      return "אין קו ראייה";
    case "small arms ineffective vs armour":
      return "נשק קל לא יעיל מול שריון";
    case "below minimum range":
      return "מתחת לטווח מינימלי";
    case "no fit shooters":
      return "אין יורים כשירים";
    case "out of assault range":
      return `מחוץ לטווח הסתערות (${ASSAULT_RANGE_M}מ')`;
    case "cannot assault armour":
      return "לא ניתן להסתער על שריון";
    case "attacker is neutralised":
      return "הכוח מנוטרל";
    case "holding fire":
      return "הכוח בפקודת אחזקת אש";
    case "holding covering fire":
      return "הכוח בחיפוי — הפעולה לתור זה נוצלה";
    // …an order that could not be carried out
    case "neutralised":
      return "מנוטרל";
    case "hit last turn":
      return "נפגע — לא יכול לנוע";
    case "grade too steep":
      return "המדרון תלול מדי לרכב";
    case "no movement left":
      return "מיצה את התנועה בתור זה";
    case "already acted":
      return "כבר ביצע פעולה בשלב הירי";
    case "target gone":
      return "המטרה אינה עוד";
    case "could not fire":
      return "לא ניתן לירות";
    // …a charge that could not be started (rules decision 16)
    case "not a charge-laying force":
      return "כוח זה אינו מניח מטענים";
    case "no one left to lay it":
      return "אין מי שיניח את המטען";
    case "already moved this turn":
      return "כבר נע בתור זה — הנחת מטען דורשת תור שלם";
    case "was hit this turn":
      return "נפגע בתור זה — לא ניתן להתחיל עבודה";
    case "out of the order cycle":
      return "מחוץ למחזור הפקודות";
    case "not a coaxial weapon":
      return "ירי מקביל — למקלע המקביל של רכב משוריין בלבד";
    // …morale (rules decision 19)
    case "routing":
      return "הכוח נשבר ונסוג בבהלה — אינו מקבל פקודות";
    case "surrendered":
      return "הכוח נכנע";
    case "withdrawing":
      return "הכוח בנסיגה — אינו פותח באש";
    case "pinned":
      return "מרותק תחת אש — יכול רק לסגת";
    default:
      return reason ?? "לא ניתן לבצע";
  }
}

/** Force names by id, read out of the recording's own setup actions. */
export function unitNames(recording: GameRecording): Map<string, string> {
  const names = new Map<string, string>();
  for (const action of recording.actions) {
    if (action.kind === "addUnit") names.set(action.unit.id, action.unit.name);
  }
  return names;
}

const at = (p: { x: number; y: number }) => `(${Math.round(p.x)}, ${Math.round(p.y)})`;

/**
 * Covering fire that answered an action (rules decision 18), for the reader
 * who owns the force that fired or the force that was fired on — the lens
 * decides which of those the reader is, and a shot nobody of his was part of
 * never reaches him.
 */
export function coveringFireHe(
  shot: CoveringFireResult,
  who: (id: string) => string,
  exact: boolean,
): string {
  const trigger =
    shot.trigger === "move" ? "בתנועה" : shot.trigger === "fire" ? "בפתיחת אש" : "בהסתערות";
  if (!shot.result.fired) return `${who(shot.coveringId)} בחיפוי — ${reasonHe(shot.result.reason)}`;
  return (
    `${who(shot.coveringId)} מחפה — אש על ${who(shot.targetId)} ${trigger} ` +
    `(${term(weaponHe, shot.weapon)}), ${casualtyReport(shot.result.newCasualties, exact)}`
  );
}

/** What a charge is called, by kind. */
export const chargeHe = (type: Mine["type"]) =>
  type === "antiTank" ? 'מטען נ"ט' : 'מטען נ"א';

/**
 * What became of a force's charge-laying work, in Hebrew (rules decision 16).
 * Shared by the live log and the debrief, so the two read the same.
 */
export function chargeWorkHe(
  report: ChargeWorkReport,
  name: string,
  /**
   * Whether to say **where**. Both readers now do, and both are filtered to
   * the reader's own forces — the debrief always was, and the live log became
   * so under rules decision 17. The option is kept because a *shared* reader
   * could exist again (an umpire's ticker at the table, a spectator view), and
   * a charge's position is the first thing such a reader must not print.
   */
  opts: { where?: boolean } = {},
): string {
  const where = opts.where === false ? "" : ` ${at(report.position)}`;
  if (report.mine) return `${name} סיים להניח ${chargeHe(report.type)}${where}`;
  const why =
    report.interrupted === "moved"
      ? "זז ממקומו"
      : report.interrupted === "fought"
        ? "פתח באש"
        : report.interrupted === "neutralized"
          ? "נוטרל"
          : "נפגע";
  return `${name} הפסיק להניח ${chargeHe(report.type)} — ${why}, העבודה אבדה`;
}

/** A soldier's state, as his own side sees it (rules decision 19: states, not numbers). */
export const moraleStateHe: Record<MoraleState, string> = {
  steady: "יציב",
  wavering: "מהסס",
  shaken: "מעורער",
  broken: "שבור",
  heroic: "גיבור",
};

/** A force's state, aggregated from its men. */
export const forceMoraleHe: Record<ForceMoraleState, string> = {
  steady: "יציב",
  wavering: "מהסס",
  shaken: "מעורער",
  broken: "נשבר",
  routing: "נסוג בבהלה",
  surrendered: "נכנע",
};

export const suppressionHe: Record<SuppressionLevel, string> = {
  none: "",
  suppressed: "מדוכא — חצי קצב, דיוק ירוד",
  pinned: "מרותק — נע רק בנסיגה",
};

/**
 * What morale did to a force as the turn closed (rules decision 19). `own` is
 * whether the reader owns the force: the enemy is only ever shown what can be
 * *watched* — a force running, or giving itself up — and never how many of
 * its men broke, or that a hero stood up among them.
 */
export function moraleReportHe(report: MoraleReport, who: (id: string) => string, own: boolean): string | null {
  const name = who(report.unitId);
  const n = report.soldiers ?? 0;
  switch (report.kind) {
    case "routed":
      return own ? `${name} נשבר — נסוג בבהלה אל המפקד` : `${name} נראה נסוג בבהלה`;
    case "surrendered":
      return own ? `${name} נשבר תחת האויב ונכנע` : `${name} נראה נכנע`;
    case "broke":
      if (!own) return null;
      return n === 1 ? `${name}: לוחם אחד נשבר` : `${name}: ${n} לוחמים נשברו`;
    case "heroic":
      return own ? `${name}: לוחם עמד בגבורה במקום להישבר` : null;
    case "rallied":
      if (!own) return null;
      return `${name}: ${n === 1 ? "לוחם אחד חזר" : `${n} לוחמים חזרו`} ללחימה${
        report.rallierId && report.rallierId !== report.unitId ? ` (ארגון מחדש בידי ${who(report.rallierId)})` : ""
      }`;
    case "recovered":
      return own ? `${name} התארגן מחדש — שב לפיקוד` : null;
    default: {
      const never: never = report.kind;
      throw new Error(`Unhandled morale report: ${String(never)}`);
    }
  }
}

/**
 * The eight points of the compass a bearing falls in. The engine measures a
 * sector in degrees off +x, which is the right thing for arithmetic and the
 * wrong thing to read: a commander is told to watch the north-east, not 47°.
 */
const COMPASS_HE = [
  "מזרח",
  "צפון-מזרח",
  "צפון",
  "צפון-מערב",
  "מערב",
  "דרום-מערב",
  "דרום",
  "דרום-מזרח",
];

/**
 * A sector of observation in words (rules decision 14). The map's y grows
 * *downward*, so a bearing of 90° points down the screen — south.
 *
 * The bearing is folded into [0, 360) first. The engine normalises what it
 * stores, but this also narrates recorded actions, which carry whatever the
 * caller passed — and a negative index into `COMPASS_HE` is a compass point
 * that does not exist.
 */
export function describeSector(sector: ObservationSector): string {
  const bearing = ((sector.bearing % 360) + 360) % 360;
  const point = COMPASS_HE[Math.round((360 - bearing) / 45) % 8] ?? "";
  return `${point} (${Math.round(bearing)}°, ${Math.round(sector.width)}°)`;
}

/** What a sector is worth, in the percentages the player is being offered. */
export function sectorWorthHe(sector: ObservationSector): string {
  const bonus = sectorBonus(sector.width);
  if (bonus === 0) return "תצפית לכל הכיוונים";
  return (
    `+${Math.round(bonus * 100)}% בגזרה, ` +
    `-${Math.round(OBSERVATION_SECTOR.outsidePenalty * 100)}% מחוצה לה`
  );
}

/** Look a force's name up by id, falling back to the id itself. */
export type NameOf = (id: string) => string;

/**
 * What the reader of a line is entitled to know about a force. The umpire
 * knows everything; a side knows its own forces and whatever it has picked up
 * (see [`debriefView.ts`](./debriefView.ts)).
 */
export interface Lens {
  /** True for a force the reader owns. */
  isOwn(unitId: string): boolean;
  /** True for a force the reader owns or holds a contact on. */
  mayKnow(unitId: string): boolean;
  /**
   * Which side is reading — **`null` is the umpire**, and it is required so
   * that it has to be said. Some disclosures belong to a *side* rather than to
   * a force and no unit id carries them: how far a round fell from its aim
   * point, and the difference between "entitled to the whole picture" and
   * "entitled to count its own dead" (rules decision 17). A lens that could
   * leave this out would default to the umpire, which is the omission-defaults-
   * to-visible trap the `RecordedAction` switches exist to prevent.
   */
  side: Side | null;
}

/** The umpire's lens — ground truth, which is what the engine returns. */
export const FULL_VIEW: Lens = { isOwn: () => true, mayKnow: () => true, side: null };

/**
 * What one side may read of **another side's standing-order step** (rules
 * decision 17). A step is one decision covering many forces, so it is filtered
 * execution by execution rather than whole:
 *
 * - **Being fired on is always known** (rules decision 13) — an engagement that
 *   landed on the reader's own force crosses, whatever it had detected. This is
 *   the hole the live-log work turned up: the whole step used to be hidden from
 *   the enemy, so a force shot at under a standing order was never told.
 * - Its own forces, always; a bound or a shot by a force it was watching; and
 *   never a refusal, which is the other side's own bookkeeping.
 */
export function executionVisibleTo(done: StandingOrderExecution, lens: Lens): boolean {
  if (done.engaged && lens.isOwn(done.engaged.targetId)) return true;
  if (lens.isOwn(done.unitId)) return true;
  if (!done.moved && !done.engaged) return false;
  return lens.mayKnow(done.unitId);
}

/**
 * Losses as they are *reported* rather than counted (rules decision 13).
 *
 * The umpire has the whole picture and reads exact numbers. A force looking at
 * an enemy across 200 m does not count the bodies: it sees roughly what its
 * fire did, and says so. Own losses stay exact — a commander is told what his
 * own casualty state is.
 *
 * Bands are ⚠️ chosen, not from the document.
 */
export function casualtyReport(casualties: number, exact: boolean): string {
  if (exact) return `${casualties} נפגעים`;
  if (casualties === 0) return "ללא נפגעים שנצפו";
  if (casualties <= 2) return "נפגעים בודדים";
  if (casualties <= 5) return "מספר נפגעים";
  return "אבידות כבדות";
}

/**
 * The order a force is working to, in one line: the objective, the gait, and
 * the enemy it was told to engage. Used for the live log, the selected-force
 * card and the debrief, so an order is worded the same wherever it is read.
 */
export function describeStandingOrder(
  order: Omit<StandingOrder, "issuedTurn">,
  nameOf: NameOf,
): string {
  const parts = [
    order.destination
      ? `${order.withdraw ? "סגת" : "התקדם"} ל${at(order.destination)} ב${gaitHe[order.gait]}`
      : "החזק מקום",
  ];
  // Falling back is not fighting: the engine does not engage under it, so the
  // order says so rather than listing a task it will not carry out.
  if (order.withdraw) return [...parts, "ללא פתיחה באש"].join(" · ");
  const engaging = order.engage
    ? `${nameOf(order.engage.targetId)} ב${term(weaponHe, order.engage.weapon)}`
    : null;

  if (order.holdFire) {
    // An engagement range turns holding fire into an ambush: it says when to
    // open up, and on whom.
    parts.push(
      order.engagementRange == null
        ? "אחזקת אש"
        : `אחזקת אש — פתח באש על ${engaging ?? "הקרוב ביותר"} בטווח ${Math.round(
            order.engagementRange,
          )}מ'`,
    );
  } else if (engaging) {
    parts.push(`תקוף את ${engaging}`);
  }
  return parts.join(" · ");
}

/**
 * A force answering that it had already made its bound, or already fired, this
 * phase. A side's orders are re-run whenever any one force is given a new one,
 * so every other force answers this every time — bookkeeping, not news, and it
 * would bury both the log and the timeline.
 */
export function isRoutineOrderReason(reason?: string): boolean {
  return reason === "no movement left" || reason === "already acted";
}

/** The bound a force made under orders, or `null` if it did not move. */
export function describeBound(done: StandingOrderExecution, nameOf: NameOf): string | null {
  if (!done.moved) return null;
  const name = nameOf(done.unitId);
  if (done.moved.withdrawing) {
    return done.moved.arrived
      ? `${name} השלים נסיגה ל${at(done.moved.to)}`
      : `${name} נסוג לפי פקודה ל${at(done.moved.to)}`;
  }
  return done.moved.arrived
    ? `${name} הגיע ליעד ${at(done.moved.to)}`
    : `${name} מתקדם לפי פקודה ל${at(done.moved.to)}`;
}

/**
 * Whose eyes a standing-order execution is being read through. The three are
 * not degrees of the same thing: the **firer** is entitled to how many of its
 * men fired and at what chance and to nothing more than a report of the effect,
 * the **target** is entitled to what landed on its own men and to count its own
 * dead, and only the **umpire** gets both (rules decisions 13 and 17).
 *
 * A single `exactLosses` flag used to carry all of it, which meant the side
 * being shot at read the firer's hit chance — and since a hotseat battle
 * journals *orders* rather than shots, that is the path most fire in the game
 * actually takes.
 */
export type ExecutionView = "umpire" | "firer" | "target";

/** What one force actually did when the engine carried its order out. */
export function describeExecution(
  done: StandingOrderExecution,
  nameOf: NameOf,
  view: ExecutionView = "umpire",
): string {
  const name = nameOf(done.unitId);
  // **The shot first.** `executionVisibleTo` lets an enemy step through because
  // it engaged one of the reader's forces; if the same execution also moved,
  // reporting the bound instead would print the enemy's position to a reader
  // who may hold no contact on it, and never mention the shot that admitted the
  // step. The engine only ever sets one of the two per phase today — this keeps
  // the narration honest if that ever stops being true.
  if (done.engaged) {
    const who = `${name} תקף את ${nameOf(done.engaged.targetId)}`;
    const hits = `${done.engaged.hits} פגיעות`;
    const chance = `ב-${pct(done.engaged.hitChance)}`;
    const counted = view !== "firer";
    if (view === "target") {
      return `${who} — ${hits}, ${casualtyReport(done.engaged.newCasualties, true)}`;
    }
    return `${who} — ${view === "umpire" ? `${hits} ` : ""}${chance}, ${casualtyReport(
      done.engaged.newCasualties,
      counted,
    )}`;
  }
  const bound = describeBound(done, nameOf);
  if (bound) return bound;
  return `${name}: ${reasonHe(done.reason)}`;
}

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
    case "setStandingOrder":
      return `${who(action.unitId)} — פקודה: ${describeStandingOrder(action.order, who)}`;
    case "executeStandingOrders":
      return `${action.side}: ביצוע פקודות עומדות`;
    case "setCamouflage":
      return `${who(action.unitId)} ${action.on ? "מסווה את עמדתו" : "הפסיק הסוואה"}`;
    case "setScouting":
      return `${who(action.unitId)} ${action.on ? "יצא לסיור" : "חזר מסיור"}`;
    case "layCharge":
      return action.type
        ? `${who(action.unitId)} מתחיל להניח ${chargeHe(action.type)}`
        : `${who(action.unitId)} הפסיק להניח מטען`;
    case "setCovering":
      return action.on
        ? `${who(action.unitId)} בחיפוי (${term(weaponHe, action.weapon)})`
        : `${who(action.unitId)} ירד מחיפוי`;
    case "setObservationSector":
      return action.sector
        ? `${who(action.unitId)} — גזרת תצפית: ${describeSector(action.sector)}`
        : `${who(action.unitId)} — תצפית מעגלית`;
    default: {
      // Exhaustiveness: a new RecordedAction must be given Hebrew narration
      // rather than falling through and printing its raw object at a player.
      const never: never = action;
      return JSON.stringify(never);
    }
  }
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

/** The force an action was aimed at, where it was aimed at one. */
function targetOf(action: RecordedAction): string | undefined {
  switch (action.kind) {
    case "fire":
    case "fireExplosive":
      return action.targetId;
    case "assault":
      return action.defenderId;
    default:
      return undefined;
  }
}

/**
 * What the action produced, in one line — the dice behind the decision.
 *
 * Returns an empty string when there is nothing to report, so the timeline
 * stays quiet for setup and for phase steps where nothing landed.
 */
export function describeOutcome(
  outcome: ActionOutcome,
  names: Map<string, string>,
  lens: Lens = FULL_VIEW,
  action?: RecordedAction,
): string {
  const who = (id: string) => names.get(id) ?? id;
  // Losses are counted exactly for the reader's own forces, and reported rather
  // than counted for anyone else's (rules decision 13).
  const shotAt = action ? targetOf(action) : undefined;
  const exact = shotAt == null || lens.isOwn(shotAt);
  // Whether the reader was watching what it shot at. A force always knows how
  // many of its own men fired and at what chance — that is its own business —
  // but what the shot *achieved* is an observation, and a shot at a force it
  // held no contact on is one it did not make (rules decision 13).
  const observed = shotAt == null || lens.mayKnow(shotAt);
  // The umpire has no side of its own; every other lens is somebody's.
  const umpire = lens.side == null;

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
      // Who picked whom up. A side sees its own reports; that the enemy has
      // spotted *it* is precisely what it would not know.
      for (const seen of outcome.observed ?? []) {
        if (!lens.isOwn(seen.observerId)) continue;
        parts.push(`${who(seen.observerId)} איתר את ${who(seen.targetId)}`);
      }
      // What the reader's own engineering came to. An enemy charge going into
      // the ground is precisely what he is not told (rules decision 16).
      for (const report of outcome.chargeWork ?? []) {
        if (!lens.isOwn(report.unitId)) continue;
        parts.push(chargeWorkHe(report, who(report.unitId)));
      }
      // Morale (rules decision 19): the reader's own forces in full; of the
      // enemy's, only a rout or a surrender the engine says his side watched —
      // the same `seenBy` the live log read, so the two cannot disagree.
      for (const report of outcome.morale ?? []) {
        const own = lens.isOwn(report.unitId);
        if (!own && lens.side != null && !report.seenBy?.includes(lens.side)) continue;
        const line = moraleReportHe(report, who, own);
        if (line) parts.push(line);
      }
      for (const impact of outcome.resolved) {
        const off = Math.round(
          Math.hypot(
            impact.dispersion.impact.x - impact.aim.x,
            impact.dispersion.impact.y - impact.aim.y,
          ),
        );
        // How far the round fell from its **aim point** measures the shell
        // against the gunner's own aim, so only the side that called the
        // mission is told it — the side underneath is told that it fell
        // (rules decision 17). The umpire has no side and reads everything.
        const aimed = lens.side == null || impact.side == null || impact.side === lens.side;
        // The fall of shot is plain to everyone; who it caught is not.
        const caught = impact.blast.targets.filter((t) => t.caught && lens.mayKnow(t.unitId));
        const casualties = caught.reduce((n, t) => n + t.newCasualties, 0);
        // Exact only where every force caught is one of the reader's own.
        const counted = caught.every((t) => lens.isOwn(t.unitId));
        const hit = caught.length
          ? `, פגע ב${caught.map((t) => who(t.unitId)).join(", ")}${
              casualties || !counted ? ` — ${casualtyReport(casualties, counted)}` : ""
            }`
          : ", ללא פגיעות";
        const fell = !aimed ? "נחיתה" : off > 0 ? `נחיתה בסטייה ${off}מ'` : "נחיתה מדויקת";
        parts.push(`${fell}${hit}`);
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
      const { detection, mineDetonations, coveringFire } = outcome.move;
      // **A bound has two readers now.** The mover's side reads what the bound
      // found; the side whose covering fire answered it reads its own shot and
      // nothing else — what the *enemy* spotted and how many of this reader's
      // charges it walked past are not the coverer's to learn by having pulled
      // a trigger (rules decisions 13 and 18).
      const mine = lens.isOwn(action?.kind === "moveUnit" ? action.unitId : "");
      for (const shot of coveringFire) {
        if (!lens.isOwn(shot.coveringId) && !lens.isOwn(shot.targetId)) continue;
        bits.push(coveringFireHe(shot, who, lens.isOwn(shot.targetId)));
      }
      if (!mine) return bits.join(" · ");
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
      if (!r.fired) return `לא ירה (${reasonHe(r.reason)})`;
      // Fire onto ground the side had no eyes on: its own men and its own
      // chance, and not a word about what it found there.
      if (!observed) return `${r.shooters} יורים ב-${pct(r.hitChance)} — ללא תצפית על המטרה`;
      // **Three readings, not two.** `exact` says the reader owns the target,
      // which is true of the umpire *and* of the force being shot at — so one
      // flag cannot separate "entitled to the whole picture" from "entitled to
      // count its own dead". How many men fired, at what chance, and for how
      // much damage is the **firer's** own business (rules decisions 13 and
      // 17): giving it to the target would hand over the attacker's exact fit
      // strength every time it opened fire, which is the state the casualty
      // bands exist to hide.
      if (umpire) {
        return `${r.hits}/${r.shooters} פגיעות ב-${pct(r.hitChance)}, ${r.totalDamage} נק"פ, ${r.newCasualties} נפגעים${
          r.targetNeutralized ? " — נוטרל" : ""
        }`;
      }
      // The force that was shot at: what landed on its own men, counted.
      if (exact) {
        return `${r.hits} פגיעות, ${r.newCasualties} נפגעים${r.targetNeutralized ? " — נוטרל" : ""}`;
      }
      // The shooter: its own men, its own chance, and a report of the effect.
      return `${r.shooters} יורים ב-${pct(r.hitChance)} — ${casualtyReport(r.newCasualties, false)}${
        r.targetNeutralized ? " — נראה מנוטרל" : ""
      }`;
    }

    case "fireExplosive": {
      const r = outcome.result;
      if (!r.fired) return `לא ירה (${reasonHe(r.reason)})`;
      // Whether the round found anything is the part that needed watching.
      if (!observed) return `ירה ב-${pct(r.hitChance)} — ללא תצפית על המטרה`;
      if (!r.hit) return `החטאה (${pct(r.hitChance)})`;
      const caught = (r.blast?.targets ?? []).filter((t) => t.caught);
      const casualties = caught.reduce((n, t) => n + t.newCasualties, 0);
      const armour = caught.find((t) => t.armorEffect)?.armorEffect;
      const armourText = armour
        ? ` — ${armour.partName}${armour.penetrated ? ", חדירה" : ", ללא חדירה"}${
            armour.destroyed ? ", הושמד" : armour.mobilityKilled ? ", נכשל ניוד" : ""
          }`
        : "";
      const losses = exact
        ? casualties
          ? `, ${casualties} נפגעים`
          : ""
        : `, ${casualtyReport(casualties, false)}`;
      return `פגיעה (${pct(r.hitChance)})${losses}${armourText}`;
    }

    case "assault": {
      const r = outcome.result;
      if (!r.fired) return `לא הסתער (${reasonHe(r.reason)})`;
      // What a force did to itself with its own grenades is its own to know —
      // the live log has always had this right, and the debrief was telling the
      // defender (rules decision 17).
      const ownAttacker =
        umpire || (action?.kind === "assault" && lens.isOwn(action.attackerId));
      return `${r.fireHits} פגיעות אש, ${r.grenadeHits} רימונים, ${casualtyReport(
        r.defenderCasualties,
        exact,
      )}${ownAttacker && r.selfCasualties ? ` · ${r.selfCasualties} נפגעים עצמיים` : ""}${
        r.defenderNeutralized ? (exact ? " — האויב נוטרל" : " — האויב נראה מנוטרל") : ""
      }`;
    }

    case "deploySmoke":
      return outcome.order.screen
        ? `הונח מיד — ${outcome.order.durationTurns} תורות`
        : `יגיע בתור ${outcome.order.arrivesOnTurn}`;

    case "setCamouflage":
      return outcome.on ? "מתחיל בהסוואה" : "ההסוואה שנצברה אבדה";

    case "setScouting":
      return outcome.on ? "מגלה טוב יותר, נע בהליכה בלבד" : "חוזר לקצב רגיל";

    case "layCharge":
      return outcome.type
        ? `${CHARGE_LAYING.turnsToLay} תורות עבודה — הכוח נשאר במקומו ואינו לוחם`
        : "העבודה שנצברה אבדה";

    case "setCovering":
      return outcome.on
        ? "אוחז באש עד שהאויב יזוז, יירה או יסתער — הפעולה לתור זה"
        : "חזר לאש רגילה";

    case "setObservationSector":
      return outcome.sector ? sectorWorthHe(outcome.sector) : "תצפית לכל הכיוונים";

    case "issueOrders":
    case "setStandingOrder":
      return outcome.accepted ? "הפקודה התקבלה" : "מחוץ למחזור הפקודות";

    // One decision, many bounds: the shots and moves an order produced are
    // derived by the replay, so each force's bound is reported here.
    case "executeStandingOrders":
      return outcome.executions
        .filter((done) => executionVisibleTo(done, lens))
        .filter((done) => !isRoutineOrderReason(done.reason))
        // Losses are counted only by the side that took them: the enemy's step
        // reaches this reader when it shot at one of its forces, and that line
        // must read as its own casualty report (rules decision 13).
        .map((done) =>
          describeExecution(
            done,
            who,
            umpire ? "umpire" : done.engaged && lens.isOwn(done.engaged.targetId) ? "target" : "firer",
          ),
        )
        .join(" · ");

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
      // A force driven by orders never journals a move — the bounds are derived
      // from the order — so the objective is what marks out the ground it
      // crosses. Without this a battle fought under orders draws off the map.
      case "setStandingOrder":
        if (action.order.destination) see(action.order.destination);
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

/** A recording that replays, but not the way it was fought (`verifyRecording`). */
export function recordingDriftNote(firstDivergence: number): string {
  return `אזהרה: ההקלטה נוצרה תחת חוקים אחרים — התוצאות משתנות מפעולה ${firstDivergence + 1}`;
}

/**
 * A file that could not be opened for review at all. Anything that is not a
 * `RecordingLoadError` — which `readRecording` should never let out — is
 * still said in Hebrew rather than passing an engine's English to a player.
 */
export function recordingLoadFailed(err: unknown): string {
  return `טעינת ההקלטה נכשלה: ${
    err instanceof RecordingLoadError ? loadProblemHe(err.problem) : "לא ניתן לקרוא את הקובץ"
  }`;
}

function loadProblemHe(problem: LoadProblem): string {
  switch (problem.kind) {
    case "notJson":
      return "הקובץ אינו הקלטת קרב";
    case "malformed":
      return "הקובץ אינו הקלטת קרב תקינה — חסרים בו נתונים או שהם פגומים";
    case "malformedTerrain":
      return "המפה שבהקלטה פגומה — לא ניתן לשחזר עליה את הקרב";
    case "unsupportedVersion":
      return `ההקלטה נשמרה בגרסה ${problem.version}, שהמשחק אינו קורא`;
    case "unreadable":
      return "לא ניתן לשחזר את הקרב מההקלטה";
    default: {
      // Exhaustiveness: a new problem must be worded here.
      const never: never = problem;
      return never;
    }
  }
}
