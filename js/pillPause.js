/**
 * חשש יום ההפסקה בכדורים (A5), והפטור מעונת אור זרוע בוסת מכדורים (A7).
 *
 * `js/lifeState.js` ענה "מה מצב הסילוק", `js/silekReturn.js` ענה "לאיזו וסת היא
 * חוזרת כשהסילוק נגמר". המודול הזה עונה על הדין שנשאר פתוח בתוך פרק הכדורים:
 * **מה חוששת האשה כשמפסיקה ליטול כדורים** — מלבד החזרה לוסתה הראשון.
 *
 * המקורות (עמ' 40–42 בספר; סימן כ"ז):
 *
 *  - **טבע הכדורים:** "טבעם של הכדורים שמונעים או מעכבים ביאת הוסת, שאחר שמפסיקה
 *    ליטול הכדורים רואה מיד **אחר שני ימים עד חמשה ימים**... ולכן בכדורים אלו
 *    שטבעם שאחר שמפסיקה ליטלם רואה בימים הקרובים, בין יומים לחמשה ימים, צריכה
 *    לחשוש שמא תראה באותם הימים" `[שט כ"ז | עמ' 40]`.
 *  - **היום הראשון מותר, ומן השני ואילך חומרא:** "כיון שמצוי מאד שאחר הפסקת נטילת
 *    הכדורים רואה מיד ביום השני אחר שהפסיקה, לכן **ביום הראשון מותרת** כיון שאין
 *    מצוי שתראה, **אבל מיום השני ואילך יש להחמיר לפרוש אף אם קבעה לה וסת ליום
 *    מאוחר יותר**" `[שט כ"ז | עמ' 42]`.
 *  - **שקבעה לה יום להפסקה:** "אם כבר ראתה פעם אחת אחר הפסקת נטילת הכדורים ביום
 *    השלישי או הרביעי וכדומה, צריכה לחשוש בפעם הבאה שתראה באותו היום כדין **וסת
 *    שאינו קבוע**, ואם ראתה שלש פעמים באותו היום צריכה לחשוש להבא לאותו היום כדין
 *    **וסת קבוע**" `[שט כ"ז | עמ' 40]`.
 *  - **ואינה וסת קבועה גמורה:** "אלא דאין זה וסת קבוע גמור בין לקולא ובין לחומרא
 *    כיון שאינו קביעות גמור, **ויש להחמיר שדינה גם כאשה שאין לה וסת קבוע**"
 *    `[שט כ"ז | עמ' 41]` ⇒ וסת ההפסקה **אינה מבטלת** את שאר החששות.
 *  - **שקודם לכן היתה רואה מחמת מיחושים:** "כיון שהמציאות מוכיחה שאחר הפסקת נטילת
 *    הכדורים רואה אף בלא ביאת המיחושים, צריכה להחמיר ולחשוש בימים שעלולה לראות
 *    אף קודם ביאת המיחושים" `[שט כ"ז | עמ' 42]` ⇒ החשש אינו מותנה במיחוש.
 *  - **הפטור מעונת אור זרוע (A7):** "ההוראה למעשה. אמנם **אינה צריכה לחשוש אלא
 *    לעונת הוסת עצמה, אבל לעונת האור זרוע אין צריכה לחשוש** באופן זה" `[שט כ"ז | עמ' 40]`.
 *  - **סוג הכדורים (ההבחנה שאומתה בתמלול):** הדין שלעיל נאמר על **רוב** הכדורים —
 *    "כן הוא **ברוב הכדורים**, שפעולתם לעצור פעולת ההורמונים הגורמים ביאת הוסת" —
 *    ולכן **נגרע ממנו סוג אחד במפורש:** "**מלבד כדורי אורגסט, שתלוי בסדר שנוטלים
 *    אותם**" `[שט כ"ז | עמ' 40]`. בכדורי אורגסט אין חלון ימים קצוב, שהרי החשש
 *    תלוי בסדר הנטילה ולא בעצם ההפסקה — ולכן אין המנוע מחשב להם חשש אוטומטי, אלא
 *    מודיע על הדין בלבד (`rule === 'regimen'`).
 *    וכן התנאי הכללי לנטילה: "אם הכדורים שנוטלת הם מאותם **שהוכחו באופן ברור**
 *    בשימוש של אלפים ורבבות שאכן טבעם לעכב ביאת הוסת" `[שט כ"ז | עמ' 39]`.
 *    ואילו **קביעות מכמה סוגי כדורים** מצטרפת — "ואף אם נצטרף קביעות הוסת מכמה
 *    סוגי כדורים שנטלה הוי קביעות וסת" `[שט כ"ז | עמ' 41]`.
 *
 * **מה המודול מחזיר, ומה המנוע עושה בו:**
 *  - `pauses` — כל הפסקת כדורים שתועדה (סוף תקופת נטילה), עם יום הפסקה ו"חלון"
 *    הימים שחוששת להם.
 *  - `concerns` — החששות עצמם בצורת רשומות פרישה (`abs`, `ona`, `code`, `reason`),
 *    שהמנוע מוסיף ללוח. **היום הראשון** שבו הפסיקה אינו מייצר חשש.
 *  - `established` — הימים שקבעה לעצמה (`offsetDays` מתחילת ההפסקה), עם מניין
 *    הראיות, והאם נקבעו לג' פעמים.
 *  - `notes` — לשון הדין, כדי שהממשק יציג **מאין** בא החשש.
 *
 * **שלוש החלטות מימוש** (מתועדות ב-`docs/DECISIONS.md`):
 *  1. החששות מוצגים **לכל הפסקה מתועדת**, ולא רק לאחרונה — כמו שכל ראייה מייצרת
 *     את חששותיה, כך כל הפסקה מייצרת את חששותיה.
 *  2. מקום שלא קבעה לה עונה — מסומנות **שתי העונות** (יום ולילה), מפני שהמקור
 *     קובע את הימים ("בין יומים לחמשה") ולא את העונה; ומשהוקבע לה יום, מסומנת
 *     העונה שבה ראתה.
 *  3. החששות האלה אינם יוצרים דרישת בדיקה ("אסורה עד שתבדוק") — לשון הספר היא
 *     **"לפרוש"**, והם מוצגים כחשש פרישה. הם גם אינם מבטלים חששות אחרים.
 *  4. הפסקה **מכדורי אורגסט** אינה מחשבת חלון ואינה קובעת יום: הדין תלוי בסדר
 *     הנטילה `[שט כ"ז | עמ' 40]`, ואין לחשבו בלא בירור. הפסקה כזו מוחזרת ב-
 *     `pauses` עם `rule: 'regimen'`, בלא `concerns`, ומוצגת בפאנל כהערה (לשאול רב).
 */
import { pauseRuleOfPillType, PILL_TYPES } from './lifeState.js';

/** סימון החשש בלוח. */
export const PAUSE_CODE = 'פה"כ';

/** "ביום הראשון מותרת" — ומן השני ואילך יש להחמיר `[שט כ"ז | עמ' 42]`. */
export const PILL_PAUSE_FIRST_DAY = 2;

/** "רואה מיד אחר שני ימים עד חמשה ימים" `[שט כ"ז | עמ' 40]`. */
export const PILL_PAUSE_LAST_DAY = 5;

/**
 * עד כמה ימים אחרי ההפסקה נחשבת ראייה ל"יום ההפסקה" שלה.
 *
 * הספר נוקט דוגמאות ("ביום השלישי או הרביעי וכדומה") ולא גבול מספרי. הטעם
 * שנקבע כאן גבול של עשרה ימים: בזמן נטילת כדורים אין לה מחזור טבעי — הביוץ
 * נעצר, והראייה היחידה שיכולה לבוא היא מחמת הפסקת הכדורים. ולכן גם ראייה
 * ביום ז'–י' שאחרי ההפסקה מיוחסת להפסקה, ובאה בחשבון כקביעות יום. ראייה
 * מאוחרת מזו כבר אינה ניתנת לייחוס כזה.
 */
export const PILL_PAUSE_ESTABLISH_WINDOW = 10;

/** "ואם ראתה שלש פעמים באותו היום" — קביעות `[שט כ"ז | עמ' 40]`. */
export const PILL_PAUSE_FIXED_COUNT = 3;

const DAY_LETTERS = ['', 'א\'', 'ב\'', 'ג\'', 'ד\'', 'ה\'', 'ו\'', 'ז\'', 'ח\'', 'ט\'', 'י\''];

/** "יום ב' להפסקה". */
export function pauseDayLabel(dayNumber) {
    return DAY_LETTERS[dayNumber] || String(dayNumber);
}

/** נוסחי הדין, לשימוש הממשק (פאנל ההסבר). */
export const PILL_PAUSE_RULES = {
    nature: {
        title: 'כדורים — חשש לימים שאחרי ההפסקה',
        text: '"טבעם של הכדורים שמונעים או מעכבים ביאת הוסת, שאחר שמפסיקה ליטול הכדורים רואה מיד אחר שני '
            + 'ימים עד חמשה ימים... צריכה לחשוש שמא תראה באותם הימים". ולכן ביום הראשון מותרת — '
            + '"כיון שאין מצוי שתראה" — ומיום השני ואילך יש להחמיר לפרוש, אף אם קבעה לה וסת ליום מאוחר יותר.',
        source: '[שט כ"ז | עמ\' 40–42]'
    },
    established: {
        title: 'יום ההפסקה שקבעה לעצמה',
        text: 'הראתה פעם אחת אחר הפסקת הכדורים ביום השלישי או הרביעי וכדומה — חוששת בפעם הבאה שתפסיק '
            + 'לאותו היום, כדין וסת שאינו קבוע; ובג\' פעמים באותו היום — כדין וסת קבוע.',
        source: '[שט כ"ז | עמ\' 40]'
    },
    notFullFixed: {
        title: 'וסת מכדורים אינה קביעות גמורה',
        text: '"אין זה וסת קבוע גמור בין לקולא ובין לחומרא כיון שאינו קביעות גמור, ויש להחמיר שדינה גם '
            + 'כאשה שאין לה וסת קבוע" — ולכן וסת ההפסקה אינה מבטלת את שאר החששות.',
        source: '[שט כ"ז | עמ\' 41]'
    },
    orZarua: {
        title: 'פטור מעונת אור זרוע',
        text: '"אמנם אינה צריכה לחשוש אלא לעונת הוסת עצמה, אבל לעונת האור זרוע אין צריכה לחשוש" — '
            + 'ולכן חשש יום ההפסקה, שהוא וסת מחמת כדורים, אינו מוסיף את עונת אור זרוע שלפניו.',
        source: '[שט כ"ז | עמ\' 40]'
    },
    byType: {
        title: 'סוג הכדורים — אורגסט תלוי בסדר הנטילה',
        text: 'הדין של "רואה מיד אחר שני ימים עד חמשה ימים" נאמר על רוב הכדורים — "כן הוא ברוב '
            + 'הכדורים, שפעולתם לעצור פעולת ההורמונים הגורמים ביאת הוסת" — וממנו נגרע סוג אחד '
            + 'במפורש: "מלבד כדורי אורגסט, שתלוי בסדר שנוטלים אותם". בכדורי אורגסט אין אפוא חלון '
            + 'ימים קצוב שאפשר לחשב ממנו את החשש, לפי שהדבר תלוי בסדר הנטילה — ולכן אין המערכת '
            + 'מחשבת להם חשש אוטומטי, וזו הוראה לבירור עם רב.',
        source: '[שט כ"ז | עמ\' 40]'
    },
    unproven: {
        title: 'התנאי — כדורים שהוכחו כעוצרים את הוסת',
        text: 'יסוד הדין הוא בכדורים שטבעם לעכב ביאת הוסת: "אם הכדורים שנוטלת הם מאותם שהוכחו '
            + 'באופן ברור בשימוש של אלפים ורבבות שאכן טבעם לעכב ביאת הוסת" — כגון הכדורים '
            + 'המנויים שם לסידור הוסת (ג\'ינרה, מינולט, מיקרוגינון, פורלגיטון). ומנגד — קביעות '
            + 'הוסת מצטרפת מכמה סוגי כדורים: "ואף אם נצטרף קביעות הוסת מכמה סוגי כדורים '
            + 'שנטלה הוי קביעות וסת".',
        source: '[שט כ"ז | עמ\' 39–41]'
    }
};

/**
 * הפסקות הכדורים שתועדו — סופה של כל תקופת נטילה.
 *
 * תקופה שסיומה לא נרשם (`endAbs === null`) אינה הפסקה: היא עדיין נוטלת.
 * תקופה שסיומה **אחרי היום** אף היא אינה הפסקה שהיתה.
 *
 * @param {Object} life - תוצאת `analyzeLifeState`
 * @param {number} today
 * @returns {Array<{startAbs: number, endAbs: number, type: string}>}
 */
export function pillPauses(life, today) {
    const periods = (life && life.pills && life.pills.periods) || [];
    const t = Number.isFinite(today) ? today : null;
    return periods
        .filter(p => p.endAbs !== null && (t === null || p.endAbs <= t))
        .map(p => ({ startAbs: p.startAbs, endAbs: p.endAbs, type: p.type }))
        .sort((a, b) => a.endAbs - b.endAbs);
}

/**
 * מספר היום של תאריך בתוך הפסקה: יום ההפסקה עצמו הוא 0, ולמחרתו יום 1.
 *
 * @returns {number|null}
 */
export function pauseDayNumber(pause, abs) {
    if (!pause || !Number.isFinite(abs)) return null;
    const diff = abs - pause.endAbs;
    return diff >= 0 ? diff : null;
}

/**
 * מנתחת את חשש יום ההפסקה.
 *
 * @param {Object} params
 * @param {Object} params.life - תוצאת `analyzeLifeState`
 * @param {Array} params.reiyot - כל הראיות (עם `counted` ממנוע החזקה, אם הופעל)
 * @param {number} params.today
 * @returns {{
 *   configured: boolean, pauses: Array, concerns: Array, established: Array,
 *   active: Object|null, notes: Array<{level: string, title: string, text: string, source: string}>
 * }}
 */
export function analyzePillPause({ life, reiyot, today }) {
    const empty = { configured: false, pauses: [], concerns: [], established: [], regimenPauses: [], active: null, notes: [] };
    if (!life || !life.configured) return empty;

    const periods = (life && life.pills && life.pills.periods) || [];
    if (periods.length === 0) return empty;

    const pauses = pillPauses(life, today);
    if (pauses.length === 0) return empty;

    const t = Number.isFinite(today) ? today : null;
    const sightings = (reiyot || []).slice().sort((a, b) => a.abs - b.abs);
    // סילוק שאינו מחמת כדורים (הריון/הנקה/זקנה/קטנה): בזמן שחלון כזה נמשך אין
    // וסת עומדת לה כלל, ולכן אין טעם לחשש יום הפסקה *בתוכו*.
    const dormancyWindows = (life.dormancy && life.dormancy.windows) || [];
    const insideOtherDormancy = (abs) => dormancyWindows.some(w =>
        abs > w.fromAbs && (w.untilAbs === null || abs < w.untilAbs));

    const isOnPills = (abs) => periods.some(p =>
        abs >= p.startAbs && (p.endAbs === null || abs <= p.endAbs));

    /** מניין הימים שקבעה לעצמה, **מלפני** ההפסקה שנבחנת. */
    const establishedBefore = [];
    const concerns = [];
    const pausesOut = [];
    const notes = [];
    let hasRegimenPause = false;

    pauses.forEach(pause => {
        const pauseAbs = pause.endAbs;
        if (insideOtherDormancy(pauseAbs)) return;

        // סוג הכדורים מכריע: "מלבד כדורי אורגסט, שתלוי בסדר שנוטלים אותם"
        // `[שט כ"ז | עמ' 40]` — בהם אין חלון ימים לחשב, ואין לקבוע מהם יום.
        const rule = pauseRuleOfPillType(pause.type);
        if (rule !== 'standard') {
            hasRegimenPause = true;
            pausesOut.push({
                startAbs: pause.startAbs,
                pauseAbs,
                type: pause.type,
                typeLabel: PILL_TYPES[pause.type] || null,
                rule,
                lastDay: null,
                window: null,
                established: []
            });
            return;
        }

        const before = establishedBefore.slice();
        const maxOffsetBefore = before.length ? Math.max.apply(null, before.map(e => e.offsetDays)) : 0;
        // "מיום השני ואילך יש להחמיר לפרוש אף אם קבעה לה וסת ליום מאוחר יותר"
        // `[שט כ"ז | עמ' 42]` — החלון נמשך עד היום שקבעה, ואם קבעה יום מאוחר
        // מחמשה ימים, הרי החלון נמשך עד אליו.
        const lastDay = Math.max(PILL_PAUSE_LAST_DAY, maxOffsetBefore);
        const fallbackOna = before.length
            ? before.slice().sort((a, b) => b.count - a.count)[0].ona
            : null;

        const window = { fromAbs: pauseAbs + PILL_PAUSE_FIRST_DAY, toAbs: pauseAbs + lastDay };
        pausesOut.push({
            startAbs: pause.startAbs,
            pauseAbs,
            type: pause.type,
            typeLabel: PILL_TYPES[pause.type] || null,
            rule,
            lastDay,
            window,
            established: before.slice()
        });

        for (let dayNumber = PILL_PAUSE_FIRST_DAY; dayNumber <= lastDay; dayNumber++) {
            const abs = pauseAbs + dayNumber;
            const est = before.find(e => e.offsetDays === dayNumber) || null;
            const onas = est ? [est.ona] : (fallbackOna ? [fallbackOna] : ['day', 'night']);
            const suffix = est
                ? (est.fixed ? 'וסת שנקבעה לה' : 'דין וסת שאינו קבוע')
                : 'חומרא — טבעם שרואה בימים הקרובים';
            onas.forEach(ona => {
                concerns.push({
                    abs,
                    ona,
                    code: PAUSE_CODE,
                    reason: `חשש הפסקת כדורים — יום ${pauseDayLabel(dayNumber)} להפסקה (${suffix})`,
                    pauseAbs,
                    pauseAbsBase: pause.startAbs,
                    dayNumber,
                    established: !!est,
                    fixed: !!(est && est.fixed),
                    // "ויש להחמיר שדינה גם כאשה שאין לה וסת קבוע" `[שט כ"ז | עמ' 41]`
                    doesNotSuppressOthers: true,
                    // A7 — "לעונת האור זרוע אין צריכה לחשוש" `[שט כ"ז | עמ' 40]`
                    noOrZarua: true
                });
            });
        }

        // מה שראתה אחרי ההפסקה הזו קובע את היום שלה להפסקות **הבאות**.
        sightings.forEach(r => {
            const diff = r.abs - pauseAbs;
            if (diff <= 0 || diff > PILL_PAUSE_ESTABLISH_WINDOW) return;
            if (isOnPills(r.abs)) return; // חזרה ליטול — אינה ראייה שאחרי הפסקה
            const ona = r.ona === 'night' ? 'night' : 'day';
            const found = establishedBefore.find(e => e.offsetDays === diff && e.ona === ona);
            if (found) {
                found.count++;
                found.fixed = found.count >= PILL_PAUSE_FIXED_COUNT;
            } else {
                establishedBefore.push({ offsetDays: diff, ona, count: 1, fixed: false });
            }
        });
    });

    if (pausesOut.length === 0) return empty;

    const established = establishedBefore
        .slice()
        .sort((a, b) => a.offsetDays - b.offsetDays || a.ona.localeCompare(b.ona));

    notes.push(Object.assign({ level: 'strict' }, PILL_PAUSE_RULES.nature));
    if (established.length) {
        notes.push(Object.assign({ level: 'info' }, PILL_PAUSE_RULES.established));
    }
    if (established.some(e => e.fixed)) {
        notes.push(Object.assign({ level: 'strict' }, PILL_PAUSE_RULES.notFullFixed));
    }
    notes.push(Object.assign({ level: 'info' }, PILL_PAUSE_RULES.orZarua));
    // ההבחנה בסוג הכדורים — מוצגת רק כשהיא חלה בפועל (יש הפסקה מכדורי אורגסט).
    if (hasRegimenPause) {
        notes.push(Object.assign({ level: 'dispute' }, PILL_PAUSE_RULES.byType));
        notes.push(Object.assign({ level: 'info' }, PILL_PAUSE_RULES.unproven));
    }

    const active = t === null ? null
        : (pausesOut.map(p => ({ pause: p, dayNumber: pauseDayNumber({ endAbs: p.pauseAbs }, t) }))
            .find(x => x.pause.lastDay !== null && x.dayNumber !== null
                && x.dayNumber >= 1 && x.dayNumber <= x.pause.lastDay) || null);

    return {
        configured: true,
        pauses: pausesOut,
        concerns,
        established,
        active: active ? {
            pauseAbs: active.pause.pauseAbs,
            dayNumber: active.dayNumber,
            permitted: active.dayNumber < PILL_PAUSE_FIRST_DAY,
            lastDay: active.pause.lastDay
        } : null,
        // הפסקות שדינן תלוי בסדר הנטילה (אורגסט) — אין להן חשש מחושב `[שט כ"ז | עמ' 40]`.
        regimenPauses: pausesOut.filter(p => p.rule !== 'standard'),
        notes
    };
}
