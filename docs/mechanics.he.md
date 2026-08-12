# משחק מלחמה לפו"ם — מכניקת המשחק

> **Transcription of [`Tactical - Mechanics.docx`](../Tactical%20-%20Mechanics.docx).**
> The .docx remains the source of truth; this is a faithful Markdown rendering
> of it so the rules can be read, searched and quoted without opening Word.
> Every number and every Hebrew string is verbatim — the only changes are
> structural (headings, and merged table cells flattened into rows).
> Editorial notes are marked **[note]** and are *not* part of the document.
>
> To check this file against the .docx after the author revises it:
> `python tools/dump-docx.py` prints the raw extraction.

המשחק מתנהל על עזרים טקטיים (מפה, תצ"ל וכו) בקנ"מ של כ- 1:3000. כל צד במשחק
(אדום, כחול, מנחה) יקבל מפה מנויילנת עליה יתנהל המשחק.

כל צד יזיז את כוחותיו על המפה שלו. המנחה ינהל מפה בה תשוקף תמונת המצב המלאה.
גילויי אדום\כחול ישוקפו על מפות השחקנים על ידי המנחה, בהתאם להתקדמות המשחק
ולהתרחשויות.

אפשר להרחיב את המשחק עד רמת החטיבה כולל – תוך הגדלת המפה. יש לשחק את הכוחות עד
רמת הכיתה. אפשר להכניס שחקני משנה שישחקו כוחות משנה.

## סדר המשחק

1. קבלת תרחיש
2. כתיבת ליבת הפקמ"ב וציור מרשם קרב על גבי לוח המשחק
3. משחק
4. סיכום

## סדר התור

1. יוזמה (1ק10 לכל שחקן, תורות בסדר יורד)
2. קבלת מודיעין\כטב"מ
3. סימון מטרות לארטילריה\עשן
4. פתרון ארטילריה של סיבוב קודם
5. תנועה
6. ירי\חיפוי\הסתערות
7. סיכום והתארגנות

## פעולות

### תנועה

| פעולה | תיאור פעולה | השפעה 1 | השפעה 2 | השפעה 3 |
|---|---|---|---|---|
| תנועה בקצב רגיל | עד 50 מ' בתור | 30% מציאת מטענים\פירים\אויב חבוי בטווח של עד 20 מ' | 70% מציאת אויב גלוי בטווח של עד 300 מ' | +30% סיכויי פגיעה לאש אויב |
| ריצה | עד 100 מ' בתור | 5% מציאת מטענים\פירים\אויב חבוי בטווח של עד 20 מ' | 50% מציאת אויב גלוי בטווח של עד 300 מ' | -20% סיכויי פגיעה לאש אויב |

- כוח תחת אש נע במחצית הקצב.
- כוח שנפגע לא יכול לנוע בתור שלאחר מכן.

### כטב"מ

בתחילת התור ינחה המפקד את הכטב"מ להתמקד באזור מסויים. במקרה של רחפן יסמן השחקן
את מיקום הרחפן על המפה. גילוי אוטומטי של מטרות נעות או גלויות על הקרקע. 50%
סיכוי מציאת פירים (אם רחפן – 30% סיכוי מציאת מטענים).

| סוג | הגעת המידע | גודל קשית | משך שהייה | סיכויי יירוט | תקיפה (במידה ויש) | השפעות נוספות |
|---|---|---|---|---|---|---|
| תצפית קבוע כנף | תור הבא | 100*100 מ' | כל המשחק | ללא (אלא אם קיים נ"מ) | 70%, השפעות כמו מרגמה | קיצור מרחק החטאה של ארטילריה ומרגמות ב-20% בתוך הקשית. |
| רחפן | מיידי | 50*50 מ' | עד 5 תורות (ולאחר מכן שני תורות המתנה, במידה ויש סוללות) | כמו מטרה במחסה מלא | 30%, השפעות כמו מטול | |

### ירי קליעי

גלגול התקפה - ק% * מספר חיילים כשירים בכוח (אפשר לפצל אש), 1ק4 נזק.

**ירי נק"ל\מקלעים**

| טווח | סיכויי פגיעה |
|---|---|
| עד 100 מ' | 30% |
| 299-100 מ' | 20% |
| 400-300 מ' | 10% |

**ירי מקביל**

| טווח | סיכויי פגיעה |
|---|---|
| עד 300 מ' | 70% |
| 499-300 מ' | 50% |
| 700-500 מ' | 20% |

- ירי בהינתן קו ראיה בלתי מופרע בלבד.
- מחסה מלא (לא לנוע ולא לירות בתור הקודם): **-50% מסיכויי הפגיעה**
- מחסה חלקי (במקרה של ירי בהינתן חיפוי): **-10% מסיכויי הפגיעה**

### נפיצים

**[note]** the document's first column is headed `אמל"ח\טווח אמל"ח` — weapon and
weapon range in one cell. It is split into two columns here. A blank weapon cell
continues the weapon above it.

| אמל"ח | טווח אמל"ח | טווח פיצוץ\סיכויי פגיעה | נזק | הערות |
|---|---|---|---|---|
| רימון | הסתערות בלבד | 30% (5% פגיעה עצמית) | 1ק6 | |
| מטול | עד 100 מ' | 50 מ'\40% | 1ק6 | |
| מרגמה | כל המפה | עד 50 מ'\50% | 1ק8 | 3 פצצות לתור לקנה, שיהוי של תור לפגיעה |
| | | 100-51 מ' \ 25% | | |
| ארטילריה | כל המפה | עד 50 מ'\70% | 1ק10 | 2 פגז לקנה לתור, שיהוי של שני תורות |
| | | 100-51 מ'\50% | | |
| | | 200-101\25% | | |
| פגז טנק | 300-25 מ'\90% | עד 50 מ'\50% | 1ק8 | ירי בכינון ישיר. מחייב קו ראייה |
| | 500-301 מ\70% | 100-51 מ' \ 25% | | |
| | 1500-500 מ\50% | | | |
| מטען נ"א | דריכה\50% הפעלה | עד 50 מ'\50% | 1ק8 (1ק2 נגד טנק) | |
| | | 100-51 מ' \ 25% | | |
| מטען נ"ט | דריכה\50% הפעלה | עד 50 מ'\70% | 1ק8 (2ק10 נגד חי"ר) | |
| | | 100-51 מ'\50% | | |
| | | 200-101\25% | | |
| מרנ"ט — נגד חי"ר | עד 50 מ'\40% | עד 25 מ'\50% | 1ק8 | ירי בכינון ישיר. מחייב קו ראייה |
| | 200-51 מ'\30% | 50-26 מ' \ 25% | | |
| | 400-201 מ'\15% | | | |
| מרנ"ט — נגד רק"מ | עד 200 מ'\50% | | 1ק8 | ירי בכינון ישיר. מחייב קו ראייה |
| | 400-201מ'\25% | | | |
| | 501-500 מ'\10% | | | |

**[note]** the last מרנ"ט band reads `501-500 מ'` in the document, which cannot be
a range (and leaves 401–500 m uncovered). Resolved with the author as **up to
700 m at 10%** — see rules decision 2 in the [README](../README.md).

**עשן** (same table in the document; the third column is duration in turns)

| מקור | משך | הערות |
|---|---|---|
| רימון | 1 תורות | אין ירי לתוך\דרך עשן |
| פצמ"ר | 2 תורות | |
| פגז ארטילריה | 4 תורות | |

**[note]** the document gives the screens no size and no flight time. Resolved
with the author as 25/50/100 m radius, arriving with the delivering weapon's own
שיהוי (רימון at once, פצמ"ר after a turn, פגז ארטילריה after two) — see rules
decision 9 in the [README](../README.md).

### חיפוי

פגיעה במקרה של פעולה על ידי האויב: כמו ירי.

### הסתערות

- ירי: 70% פגיעה, 1ק4 נזק
- רימון – הסתערות בלבד (30% פגיעה באויב, 5% פגיעה עצמית), 1ק6 נזק

## פו"ש

| מרחק המפקד\חפ"ק מכוח | פקודות כל מספר תורות |
|---|---|
| **כיתה ממפקד מחלקה** | |
| עד 300 מ' | כל תור |
| 500-301 מ' | כל שני תורות |
| 501 ומעלה | כל שלוש תורות |
| **מחלקה מחפ"ק מ"פ\סמ"פ** | |
| עד 500 מ' | כל תור |
| 700-501 מ' | כל שני תורות |
| 701 ומעלה | כל שלוש תורות |

## טבלת נזק שריון

| חלק בטנק | סיכויי פגיעה | סיכויי חדירה | נזק\נק"פ |
|---|---|---|---|
| צריח (תא לוחמים) | 20% | 20% | 1ק8\20% פר איש צוות |
| תובה-קדמי (מנוע) | 30% | 20% | 8 נק"פ |
| תובה-אחורי (תחמושת) | 30% | 20% | 5% פיצוץ קריטי |
| זחל | 10% | 70% | 4 נק"פ |
| תא נהג | 10% | 20% | 1ק8\40% פגיעה בנהג |

## טבלת פגיעה ארטילריה

סבירות פגיעה (4ק10 – 2ק10 לקו, 2ק10 לטווח) · מרחק החטאה (מטול: *0.1)

| ציר | סבירות | מרחק החטאה |
|---|---|---|
| **טווח** | עד 15% - קצר | 1ק4*50 מ' |
| | 30-16% - ארוך | 1ק4*50 מ' |
| **קו** | עד 15% - ימין | 1ק4*25 מ' |
| | 30-16% - שמאל | 1ק4*25 מ' |

כל השאר, מטרה.

## פציעה

- החל מ-5 נק"פ, החמרה של 1ק4 כל 5 תורות.
- 8 נק"פ – מנוטרל
- כוח שנשחק ב-50% ומעלה, מנוטרל (יכול רק לסגת)

---

## Where each table lives in the code

The engine transcribes these tables verbatim into `src/engine/data/`; the logic
that applies them sits in `src/engine/combat/`.

| Section | Data table | Resolver |
|---|---|---|
| תנועה | [`data/movement.ts`](../src/engine/data/movement.ts) | [`combat/detection.ts`](../src/engine/combat/detection.ts) |
| כטב"מ | [`data/uav.ts`](../src/engine/data/uav.ts) | [`combat/detection.ts`](../src/engine/combat/detection.ts) |
| ירי קליעי | [`data/directFire.ts`](../src/engine/data/directFire.ts) | [`combat/directFire.ts`](../src/engine/combat/directFire.ts) |
| נפיצים | [`data/explosives.ts`](../src/engine/data/explosives.ts) | [`combat/explosives.ts`](../src/engine/combat/explosives.ts), [`combat/indirectFire.ts`](../src/engine/combat/indirectFire.ts) |
| עשן | [`data/smoke.ts`](../src/engine/data/smoke.ts) | [`upkeep.ts`](../src/engine/upkeep.ts) |
| הסתערות | [`data/casualties.ts`](../src/engine/data/casualties.ts) | [`combat/assault.ts`](../src/engine/combat/assault.ts) |
| פו"ש | [`data/c2.ts`](../src/engine/data/c2.ts) | [`game.ts`](../src/engine/game.ts) |
| נזק שריון | [`data/armor.ts`](../src/engine/data/armor.ts) | [`combat/armorDamage.ts`](../src/engine/combat/armorDamage.ts) |
| פגיעה ארטילריה | [`data/artillery.ts`](../src/engine/data/artillery.ts) | [`combat/artillery.ts`](../src/engine/combat/artillery.ts) |
| פציעה | [`data/casualties.ts`](../src/engine/data/casualties.ts) | [`units.ts`](../src/engine/units.ts), [`upkeep.ts`](../src/engine/upkeep.ts) |

Readings that the document does not settle are recorded as **Rules decisions**
in the [README](../README.md) — check there before changing any number here.
