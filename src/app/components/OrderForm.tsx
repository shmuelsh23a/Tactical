import type { OrderTask } from "../order.js";
import type { ReferenceOrder } from "../referenceOrders.js";
import { GO_ASKED_EVERY } from "../order.js";
import { choicesOf, scoutCount, effectivePosts, postAsTaken, type HHour, type OrderChoices } from "../orderForm.js";
import type { OrderGround } from "../orderedAttacker.js";

/**
 * OPORD mode's order form (decision 128): the company order in its five
 * paragraphs, in the sidebar where the planning tools are, the places it
 * names clicked on the map (`formMarks`). Functional, not yet the UX pass
 * (the author, 2026-11-23); Hebrew only for now.
 */
interface OrderFormProps {
  ground: OrderGround;
  choices: OrderChoices;
  onChange: (c: OrderChoices) => void;
  /** The scout whose post a click on an observation point sets (1-based). */
  placing: number;
  onPlacing: (scout: number) => void;
  templates: readonly ReferenceOrder[];
  /** What is wrong with the order as written, worded for the player. */
  problems: readonly string[];
  timeLimit?: number;
  onSubmit: () => void;
}

const TASK_HE: Record<Exclude<OrderTask, "security">, string> = { assault: "הסתערות", support: "חיפוי באש", reserve: "עתודה" };
const TEMPLATE_HE: Record<string, string> = {
  A: "א — מכויל: סיור, קיבוע, הסתערות",
  "A+flank": "א + אגף",
  B: "ב — מתוכנן: בסיס אש, דילוג, המתנה לאש",
  E: "ה — אש תחילה",
  D: "ד — אגף עם בסיס אש",
  "A+moveup": "א + עמדת הסתערות",
  "B+moveup": "ב + עמדת הסתערות",
  C: "ג — חפוז: פנימה כשהאויב נמצא",
};

export function OrderForm({ ground, choices: c, onChange, placing, onPlacing, templates, problems, timeLimit, onSubmit }: OrderFormProps) {
  const set = (patch: Partial<OrderChoices>) => onChange({ ...c, ...patch });
  const scouts = scoutCount(c, ground.platoons.length);
  // As the battle will take them: a point the ground does not offer is its best one.
  const posts = effectivePosts(c, ground.platoons.length).map((r) => postAsTaken(r, ground.observationPoints.length));
  const setH = (h: HHour) => set({ hHour: h });
  const turns = Array.from({ length: Math.floor((timeLimit ?? 60) / GO_ASKED_EVERY) }, (_, i) => (i + 1) * GO_ASKED_EVERY);
  return (
    <div className="order-form">
      <label>
        התחל מתבנית:{" "}
        <select
          value=""
          onChange={(e) => {
            const t = templates.find((r) => r.key === e.target.value);
            const loaded = t && choicesOf(t.order);
            // The plan, not the words: the player's own situation and intent stay as written.
            if (loaded) onChange({ ...loaded, situation: c.situation, intent: c.intent });
          }}
        >
          <option value="">— בחר —</option>
          {templates.map((t) => (
            <option key={t.key} value={t.key}>
              {TEMPLATE_HE[t.key] ?? t.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend>1. מצב</legend>
        <label>
          אויב
          <textarea value={c.situation.enemy} onChange={(e) => set({ situation: { ...c.situation, enemy: e.target.value } })} />
        </label>
        <label>
          כוחותינו
          <textarea value={c.situation.friendly} onChange={(e) => set({ situation: { ...c.situation, friendly: e.target.value } })} />
        </label>
      </fieldset>

      <fieldset>
        <legend>2. משימה</legend>
        <p>הפלוגה תוקפת וכובשת את היעד{timeLimit ? ` עד סוף תור ${timeLimit}` : ""}.</p>
      </fieldset>

      <fieldset>
        <legend>3. ביצוע</legend>
        <label>
          כוונת המפקד — מטרה
          <textarea value={c.intent.purpose} onChange={(e) => set({ intent: { ...c.intent, purpose: e.target.value } })} />
        </label>
        <label>
          מצב סיום
          <textarea value={c.intent.endState} onChange={(e) => set({ intent: { ...c.intent, endState: e.target.value } })} />
        </label>

        <h4>סיור</h4>
        <label>
          סיירים:{" "}
          <select
            value={String(c.scouts)}
            onChange={(e) => set({ scouts: e.target.value === "onePerPlatoon" ? "onePerPlatoon" : Number(e.target.value) })}
          >
            <option value="onePerPlatoon">אחד לכל מחלקה</option>
            <option value="0">ללא — כל הפלוגה יוצאת</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </label>
        {posts.map((rank, i) => (
          <div className="row" key={i}>
            <label>
              <input type="radio" checked={placing === i + 1} onChange={() => onPlacing(i + 1)} /> סייר {i + 1}:
            </label>
            <select
              value={rank}
              onChange={(e) => {
                const next = [...posts];
                next[i] = Number(e.target.value);
                set({ posts: next });
              }}
            >
              {ground.observationPoints.map((_, k) => (
                <option key={k} value={k + 1}>
                  נקודת תצפית {k + 1}
                </option>
              ))}
              <option value={0}>ישר לעבר היעד</option>
            </select>
          </div>
        ))}
        {scouts > 0 && <p className="hint">בחר סייר ולחץ על נקודת תצפית במפה.</p>}
        <label>
          שאר הפלוגה ממתינה:{" "}
          <select value={c.waitIn} onChange={(e) => set({ waitIn: e.target.value as OrderChoices["waitIn"] })}>
            <option value="deadGround">בשטח מת הקרוב</option>
            <option value="place">במקומה, בקו היציאה</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={c.scoutsFireOnGo} onChange={(e) => set({ scoutsFireOnGo: e.target.checked })} /> ביציאה הסיירים פותחים באש
          כבסיס אש
        </label>

        <h4>שעת ש׳ — מתי הפלוגה יוצאת</h4>
        <select
          value={c.hHour.kind}
          onChange={(e) => {
            const k = e.target.value as HHour["kind"];
            setH(
              k === "fixed"
                ? { kind: "fixed", turns: 4 }
                : k === "prep"
                  ? { kind: "prep", turns: 4, missions: 4, byTurn: 30 }
                  : k === "turn"
                    ? { kind: "turn", turn: turns[3] ?? GO_ASKED_EVERY }
                    : { kind: k },
            );
          }}
        >
          <option value="fixed">כשהאויב מקובע (בקשר עין ברצף)</option>
          <option value="found">מיד כשהאויב נמצא</option>
          <option value="prep">אחרי הכנה ארטילרית</option>
          <option value="turn">בתור קבוע</option>
          <option value="atOnce">מיד</option>
        </select>
        {c.hHour.kind === "fixed" && (
          <label>
            תורות בקשר עין:{" "}
            <input type="number" min={1} max={20} value={c.hHour.turns} onChange={(e) => setH({ kind: "fixed", turns: Math.max(1, Number(e.target.value)) })} />
          </label>
        )}
        {c.hHour.kind === "prep" && (
          <div className="row">
            <label>
              מקובע{" "}
              <input type="number" min={1} max={20} value={c.hHour.turns} onChange={(e) => setH({ ...(c.hHour as Extract<HHour, { kind: "prep" }>), turns: Math.max(1, Number(e.target.value)) })} /> תורות
            </label>
            <label>
              ונותרו לכל היותר{" "}
              <input type="number" min={0} max={30} value={c.hHour.missions} onChange={(e) => setH({ ...(c.hHour as Extract<HHour, { kind: "prep" }>), missions: Math.max(0, Number(e.target.value)) })} /> משימות
            </label>
            <label>
              ולא אחרי תור{" "}
              <select value={c.hHour.byTurn} onChange={(e) => setH({ ...(c.hHour as Extract<HHour, { kind: "prep" }>), byTurn: Number(e.target.value) })}>
                {turns.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {c.hHour.kind === "turn" && (
          <label>
            תור:{" "}
            <select value={c.hHour.turn} onChange={(e) => setH({ kind: "turn", turn: Number(e.target.value) })}>
              {turns.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        )}
        {c.hHour.kind !== "atOnce" && <p className="hint">ובכל מקרה — אם כל הסיירים נפגעו.</p>}

        <h4>תנועה והסתערות</h4>
        <label>
          עמדת הסתערות:{" "}
          <select value={c.moveUp} onChange={(e) => set({ moveUp: e.target.value as OrderChoices["moveUp"] })}>
            <option value="no">ללא</option>
            <option value="found">מתקדמים אליה כשהאויב נמצא</option>
            <option value="atOnce">מתקדמים אליה מיד</option>
          </select>
        </label>
        <label>
          ציר:{" "}
          <select value={c.axis} onChange={(e) => set({ axis: e.target.value as OrderChoices["axis"] })}>
            <option value="straight">ישר ליעד</option>
            <option value="west">דרך האגף המערבי</option>
            <option value="east">דרך האגף המזרחי</option>
            <option value="flank">דרך אגף שהשטח מציע</option>
            <option value="scoutPost">דרך נקודת התצפית של סייר</option>
          </select>
        </label>
        {ground.platoons.map((p) => (
          <label key={p}>
            מחלקה {p}:{" "}
            <select
              value={c.tasks[p] ?? "assault"}
              onChange={(e) => {
                const tasks = { ...c.tasks };
                if (e.target.value === "assault") delete tasks[p];
                else tasks[p] = e.target.value as OrderTask;
                set({ tasks });
              }}
            >
              {Object.entries(TASK_HE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          <input type="checkbox" checked={c.bound} onChange={(e) => set({ bound: e.target.checked })} /> המחלקות המסתערות מדלגות בתורן
        </label>
        <label>
          קו גבול התקדמות:{" "}
          <select value={c.loa} onChange={(e) => set({ loa: Number(e.target.value) })}>
            <option value={0}>ללא</option>
            {[100, 200, 300, 400].map((m) => (
              <option key={m} value={m}>
                {m} מ' מעבר ליעד
              </option>
            ))}
          </select>
        </label>
        {c.loa > 0 && <p className="hint">אף כוח לא עובר את הקו; כשהיעד נכבש, כיתה רעננה נדחפת אליו לאבטחה.</p>}
        <label>
          <input type="checkbox" checked={c.holdShort} onChange={(e) => set({ holdShort: e.target.checked })} /> קו תיאום אחרון: ההסתערות ממתינה עד הרמת האש
        </label>

        <h4>אש</h4>
        <label>
          מטרת עדיפות:{" "}
          <select value={c.priority} onChange={(e) => set({ priority: e.target.value as OrderChoices["priority"] })}>
            <option value="centre">מטרה 1 — מרכז</option>
            <option value="west">מטרה 2 — מערב</option>
            <option value="east">מטרה 3 — מזרח</option>
            <option value="none">ללא</option>
          </select>
        </label>
        <label>
          מדיניות אש:{" "}
          <select value={c.policy} onChange={(e) => set({ policy: e.target.value as OrderChoices["policy"] })}>
            <option value="doctrine">לפי תורה: מטרת העדיפות בהסתערות, סימון ודאי על מטרה מתוכננת</option>
            <option value="opportunity">לפי הזדמנות: מטרת העדיפות, וכל סימון ודאי</option>
            <option value="sureMarks">כל סימון ודאי, כיתות תחילה</option>
            <option value="anyMark">כל סימון</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={c.holdFireUntilHHour} onChange={(e) => set({ holdFireUntilHHour: e.target.checked })} /> לא יורים עד שעת ש׳
        </label>
        <h5>גזרות אש</h5>
        {ground.platoons.map((p) => (
          <label key={`sector-${p}`}>
            מחלקה {p}:{" "}
            <select
              value={c.sectors[p] ?? "whole"}
              onChange={(e) => {
                const sectors = { ...c.sectors };
                if (e.target.value === "whole") delete sectors[p];
                else sectors[p] = e.target.value as "west" | "east";
                set({ sectors });
              }}
            >
              <option value="whole">כל היעד</option>
              <option value="west">חצי מערבי (משנית: המזרחי)</option>
              <option value="east">חצי מזרחי (משנית: המערבי)</option>
            </select>
          </label>
        ))}
        {Object.keys(c.sectors).length > 0 && <p className="hint">מחלקה יורה קודם בגזרתה, ועוברת לחצי השני רק כשאין בה מטרה בטווח. מי שיורה עליה — היא משיבה אש לכל כיוון.</p>}
      </fieldset>

      {problems.length > 0 && (
        <ul className="order-problems">
          {problems.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
      <button className="btn-primary" disabled={problems.length > 0} onClick={onSubmit}>
        הוצא פקודה — התחל קרב
      </button>
    </div>
  );
}
