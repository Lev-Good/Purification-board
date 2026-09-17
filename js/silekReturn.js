/**
 * דיני החזרה מן הסילוק — מה חוזר לחשוש לו, וממתי.
 *
 * שלושת המנועים הקודמים עונים "מה נקבע" (`js/chazaka.js`), "מה פקע"
 * (`js/akira.js`) ו"מה מצב הסילוק" (`js/lifeState.js`). המודול הזה עונה על
 * השאלה שנשארה פתוחה: **מה קורה כשהסילוק נגמר** — לאיזו וסת היא חוזרת,
 * וממתי.
 *
 * המקורות (ראו docs/SPEC_DINIM_VESATOT.md §5.1–5.2 וכן A8 ב-§11.4):
 *
 *  - **החזרה מן ההריון וההנקה:** "אחר שעברו ימי עיבורה ומניקותה... עברו ימי
 *    העיבור וההנקה **חוזרות לחוש לוסתן הראשון**, כיצד היה לה וסת לימים אם
 *    למודה לראשי חדשים חוששת לראש חודש ראשון שהיא פוגעת בו וכו', **אבל אם היה
 *    וסתה וסת ההפלגה אי אפשר לחוש עד שתחזור לראות**, חזרה לראות אפילו פעם אחת
 *    חוששת ליום ההפלגה שהיתה למודה להפליג" `[שט כ"ט | עמ' 71]` (שו"ע סל"ד).
 *    ובטעם החילוק: "דדוקא לוסת הפלגה אינה חוששת עד שתראה פעם אחת אחר הסילוק,
 *    כיון שאם לא תראה פעם אחת אינה יכולה למנות הפלגתה, אבל לוסת הימים שהוא תלוי
 *    ביום החודש **חוששת מיד כשעבר הסילוק** אף שעדיין לא חזרה לראות"
 *    `[שט כ"ט | עמ' 71]`.
 *
 *  - **לאיזה וסת היא חוזרת:** "מה שאמרנו שאחר שעברו ימי הסילוק חוזרת לוסת
 *    שקודם הסילוק, הוא **דוקא בוסת הקבוע**, אבל לוסת שאינו קבוע שהיה לה קודם
 *    הסילוק אינה צריכה לחשוש... אלא **חוזרת דוקא לוסתה הקבוע**"
 *    `[שט כ"ט | עמ' 71]` (נודע ביהודה). ומה שראתה **בתוך** ימי הסילוק אינו
 *    קובע: "ואף אם היו הראיות בסדר קבוע כקביעות וסת, **לא קבעה לה וסת בראיות
 *    שראתה בימי הסילוק**" `[שט כ"ט | עמ' 71]`.
 *
 *  - **הפסקת כדורים — כדין מעוברת ומניקה:** "היה לה וסת קבוע קודם נטילת
 *    הכדורים — **חוזרת לוסתה הקבוע הקודם, אבל לא לוסת שאינו קבוע, וכדין מעוברת
 *    ומניקה**"; וכן: "אף אם על ידי הכדורים נקבע לה וסת אחר — **אחר שהפסיקה חוזרת
 *    לוסתה הראשון**" `[שט כ"ז | עמ' 42]`.
 *
 * **מה המודול אינו עושה:** אינו מחשב תאריכים ואינו נוגע במנוע החישוב. הוא
 * מחזיר *מה* חזר (*איזו* וסת, עם שני שדות תזמון), וההקרנה עצמה נעשית
 * ב-`calculations.js`:
 *
 *   - `restoredFromAbs` — התאריך שממנו ואילך הוסת חוזרת (תום הסילוק). עבור וסת
 *     הימים נדרש גם `{ fromAbs }` בהקרנה, כדי שהמופע הראשון שאחרי תום הסילוק לא
 *     יידלג.
 *   - `restoredAnchorAbs` — לוסת ההפלגה: הראייה הראשונה שאחרי הסילוק, שממנה
 *     מתחיל מניין ההפלגה. בלא ראייה כזו אין מה להקרות — ראו `waiting`.
 */
import { analyzeChazaka } from './chazaka.js';

/** הכלל לכל סוג וסת, כפי שהוא מוצג למשתמשת. */
export const RETURN_RULES = {
    month: {
        title: 'וסת הימים (יום החודש) — חוזרת מיד',
        text: '"היה לה וסת לימים... חוששת לראש חודש ראשון שהיא פוגעת בו" — וסת התלוי ביום החודש '
            + 'אינו תלוי בראייה חדשה, ולכן היא חוזרת לחוש לו מיד עם תום הסילוק, אף שעדיין לא ראתה.',
        source: '[שט כ"ט | עמ\' 71]'
    },
    haflagah: {
        title: 'וסת ההפלגה — אינה חוזרת עד שתראה',
        text: '"אבל אם היה וסתה וסת ההפלגה אי אפשר לחוש עד שתחזור לראות, חזרה לראות אפילו פעם אחת '
            + 'חוששת ליום ההפלגה שהיתה למודה להפליג" — שאין כאן מניין ימים אלא מראייה חדשה.',
        source: '[שט כ"ט | עמ\' 71]'
    },
    // וסת השבוע תלוי ביום בשבוע ולא בראייה חדשה, ודינו כוסת הימים שבחודש
    // `[שט ל"ו | עמ' 137]` — ולכן היא חוזרת מיד עם תום הסילוק.
    week: {
        title: 'וסת השבוע — חוזרת מיד',
        text: '"ראתה ג"פ באחד בשבת... קבעה לה וסת באחד בשבת" — וסת התלוי ביום בשבוע '
            + 'אינו תלוי בראייה חדשה, ולכן היא חוזרת לחוש לו מיד עם תום הסילוק, אף שעדיין לא ראתה.',
        source: '[שט ל"ו | עמ\' 137] · [שט כ"ט | עמ\' 71]'
    },
    // וסת לימים המתחלפים תלוי בימי החודש — ודינו כוסת הימים שבחודש
    // `[שט ל"ב | עמ' 107–108]` — ולכן הוא חוזר מיד עם תום הסילוק.
    // וסת הדילוג הוא וסת של ימי חודש — ודינו כוסת הימים `[שט ל"ז | עמ' 149]`.
    dilug: {
        title: 'וסת הדילוג — חוזרת מיד',
        text: '"קבעה לה וסת לדילוג חלילה, וחוששת לעולם ט"ו לחודש זה וט"ז לחודש זה וי"ז לחודש זה" — '
            + 'וסת התלוי בימי החודש אינו תלוי בראייה חדשה, ולכן היא חוזרת לחוש לו מיד עם תום הסילוק.',
        source: '[שט ל"ז | עמ\' 149] · [שט כ"ט | עמ\' 71]'
    },
    mevucha: {
        title: 'וסת לימים המתחלפים — חוזרת מיד',
        text: '"ראתה כמה פעמים ביום כ"ז וכמה פעמים ביום כ"ט... חוששת לכ"ז וכ"ט" — '
            + 'וסת התלוי בימי החודש אינו תלוי בראייה חדשה, ולכן היא חוזרת לחוש לו מיד עם תום הסילוק.',
        source: '[שט ל"ב | עמ\' 107–108] · [שט כ"ט | עמ\' 71]'
    }
};

/** חזרת הוסת הקבוע הקודם אחרי הפסקת הכדורים. */
export const PILLS_RETURN = {
    title: 'הפסיקה ליטול כדורים — חוזרת לוסתה הראשון',
    text: '"היה לה וסת קבוע קודם נטילת הכדורים — חוזרת לוסתה הקבוע הקודם, אבל לא לוסת שאינו קבוע, '
        + 'וכדין מעוברת ומניקה"; וכן "אף אם על ידי הכדורים נקבע לה וסת אחר — אחר שהפסיקה חוזרת לוסתה הראשון".',
    source: '[שט כ"ז | עמ\' 42]'
};

/** וסת שאין חוזרת אליה אחרי הסילוק — "חוזרת דוקא לוסתה הקבוע". */
export const NO_FIXED_BEFORE = {
    title: 'לא היתה לה וסת קבועה קודם הסילוק',
    text: 'החזרה מן הסילוק היא דוקא לוסת שהיתה **קבועה** קודם לכן: "מה שאמרנו שאחר שעברו ימי הסילוק '
        + 'חוזרת לוסת שקודם הסילוק, הוא דוקא בוסת הקבוע, אבל לוסת שאינו קבוע שהיה לה קודם הסילוק אינה '
        + 'צריכה לחשוש". ולכן אין כאן חששות חוזרות מעצמן — וסת חדשה נקבעת כדרכה מכאן ולהבא.',
    source: '[שט כ"ט | עמ\' 71]'
};

/** מפתח זיהוי של וסת — להשוואה בין הוסת שחזרה לבין זו שנקבעה בפועל. */
export function vesetKey(veset) {
    if (!veset) return '';
    let param = veset.span;
    if (veset.kind === 'month') param = veset.dayOfMonth;
    else if (veset.kind === 'week') param = veset.weekday;
    else if (veset.kind === 'mevucha') param = (veset.days || []).join('.');
    else if (veset.kind === 'dilug') param = (veset.cycle || []).join('.');
    return `${veset.kind}|${veset.ona}|${param}`;
}

/**
 * תקופת נטילת הכדורים האחרונה שהסתיימה, אם יש כזו.
 * "עדיין נוטלת" (`endAbs === null`) אינה תקופה שהסתיימה.
 */
export function lastEndedPillPeriod(life, today) {
    const periods = (life && life.pills && life.pills.periods) || [];
    const ended = periods.filter(p => p.endAbs !== null && p.endAbs < today);
    return ended.length ? ended[ended.length - 1] : null;
}

/**
 * תקופת ההשהיה שממנה נגזרת החזרה — תום הסילוק (הריון/לידה והנקה), ואם לא היה
 * סילוק כזה — הפסקת הכדורים.
 *
 * הרציונל של איחוד השניים: הספר משווה את בעלת הכדורים למעוברת ומניקה ("וכדין
 * מעוברת ומניקה"), ולכן שתי התקופות הן אותה השהיה בדיוק: מה שקדם להן הוא הוסת
 * שהיא חוזרת אליו, ומה שתום הסילוק הוא התאריך שממנו היא חוזרת.
 *
 * @param {Object} life - תוצאת `analyzeLifeState`
 * @param {number} today
 * @returns {{fromAbs: number, untilAbs: number, windows: Array, pills: Object|null, labels: string[]}|null}
 */
export function returnInterlude(life, today) {
    if (!life || !life.configured || !Number.isFinite(today)) return null;
    const dormancy = life.dormancy || {};

    // כל עוד הסילוק נמשך אין "חזרה": לא מן ההריון, ולא מן הכדורים — שהרי
    // הדין בכדורים הוא כדין מעוברת ומניקה.
    if (dormancy.active) return null;

    const endedWindows = (dormancy.windows || []).filter(w => w.untilAbs !== null && today >= w.untilAbs);
    const pills = lastEndedPillPeriod(life, today);
    if (endedWindows.length === 0 && !pills) return null;

    const starts = endedWindows.map(w => w.fromAbs);
    const ends = endedWindows.map(w => w.untilAbs);
    if (pills) {
        // `endAbs` הוא היום האחרון של הנטילה — וממחרת היא חוזרת.
        starts.push(pills.startAbs);
        ends.push(pills.endAbs + 1);
    }

    return {
        fromAbs: Math.min(...starts),
        untilAbs: Math.max(...ends),
        windows: endedWindows,
        pills,
        labels: endedWindows.map(w => w.label)
    };
}

/**
 * מנתחת את החזרה מן הסילוק.
 *
 * @param {Object} params
 * @param {Array} params.reiyot - כל הראיות (אחרי סימון `counted` ממנוע החזקה)
 * @param {Object} params.life - תוצאת `analyzeLifeState`
 * @param {number} params.today
 * @returns {{
 *   interlude: Object|null, restored: Array, waiting: Array, returned: Array,
 *   returnedKeys: Set<string>, notes: Array<{level: string, title: string, text: string, source: string}>
 * }}
 */
export function analyzeSilekReturn({ reiyot, life, today }) {
    const empty = {
        interlude: null, restored: [], waiting: [], returned: [],
        returnedKeys: new Set(), notes: []
    };
    const interlude = returnInterlude(life, today);
    if (!interlude) return empty;

    const list = reiyot || [];
    const counted = list.filter(r => r.counted !== false);
    // הראיות שמהן נקבע מה שהיה לה **קודם** להשהיה — "וסתה הראשון".
    const before = list.filter(r => r.abs <= interlude.fromAbs);
    const beforeChazaka = analyzeChazaka(before);

    const restored = [];
    const waiting = [];
    const notes = [];

    (beforeChazaka.established || []).forEach(veset => {
        const base = Object.assign({}, veset, {
            // `restored` מסמן למנוע החישוב: הוסת הזו אינה נגררת מן הראיות שאחרי
            // הסילוק, ואין להחיל עליה את מסנני הזמן הרגילים.
            restored: true,
            // המקור לתצוגה — וממנו נגזרת גם לשון הפאנל.
            restoredFrom: interlude.pills && interlude.windows.length === 0 ? PILLS_RETURN.source
                : RETURN_RULES[veset.kind].source,
            // תום הסילוק: התאריך שממנו ואילך הוסת עומדת, ושהוא עוגן ההקרנה שלה.
            restoredFromAbs: interlude.untilAbs
        });

        if (veset.kind === 'haflagah') {
            // "אי אפשר לחוש עד שתחזור לראות, חזרה לראות אפילו פעם אחת חוששת
            // ליום ההפלגה שהיתה למודה להפליג" — המניין מתחיל מן הראייה הראשונה
            // שאחרי הסילוק, ולכן היא ה"עוגן" של ההקרנה.
            const anchor = counted.find(r => r.abs >= interlude.untilAbs);
            if (anchor) {
                base.restoredAnchorAbs = anchor.abs;
                restored.push(base);
            } else {
                waiting.push(base);
            }
            return;
        }

        // וסת הימים: "חוששת מיד כשעבר הסילוק אף שעדיין לא חזרה לראות".
        restored.push(base);
    });

    const returned = restored.concat(waiting);

    if (returned.length === 0) {
        notes.push(Object.assign({ level: 'info' }, NO_FIXED_BEFORE));
        notes.push({
            level: 'info',
            title: 'מניין מכאן ולהבא',
            text: 'וסת חדשה תיקבע כדרכה — בחזקת ג\' ראיות באותו יום ובאותה עונה (ולהפלגה בד\' ראיות '
                + 'בג\' הפלגות שוות) — מכאן ולהבא, מן הראיות שאחרי הסילוק.',
            source: '[שט מ"א | עמ\' 182] · [ד"ט | עמ\' 7]'
        });
    } else {
        const titles = [];
        if (restored.some(v => v.kind === 'month')) titles.push(RETURN_RULES.month.title);
        if (restored.some(v => v.kind === 'haflagah')) titles.push(RETURN_RULES.haflagah.title);
        if (waiting.length) titles.push(RETURN_RULES.haflagah.title + ' (ממתין לראייה)');
        notes.push({
            level: 'info',
            title: 'חזרה מן הסילוק — ' + titles.join(' · '),
            text: 'עם תום הסילוק היא חוזרת לוסתה הקבועה שהיתה לה קודם לכן. '
                + (waiting.length
                    ? 'וסת ההפלגה אינה חוזרת עד שתראה פעם אחת אחרי הסילוק, ומשעת הראייה נמנה ממנה מניין ההפלגה שהיתה למודה להפליג.'
                    : 'וסת הימים אינה תלויה בראייה חדשה, ולכן היא חוזרת לחוש לה מיד.')
                + (interlude.pills && interlude.windows.length === 0
                    ? ' וזו החזרה שלאחר הפסקת הכדורים — שאף אם נקבע על ידם וסת אחר, אחר שהפסיקה חוזרת לוסתה הראשון.'
                    : ''),
            source: (interlude.pills && interlude.windows.length === 0 ? PILLS_RETURN.source + ' · ' : '')
                + RETURN_RULES.month.source
        });
    }

    return {
        interlude,
        restored,
        waiting,
        returned,
        returnedKeys: new Set(returned.map(vesetKey)),
        notes
    };
}

/**
 * האם הוסת נקבעה מחמת תקופת הכדורים בלבד.
 *
 * "אף אם על ידי הכדורים נקבע לה וסת אחר — אחר שהפסיקה חוזרת לוסתה הראשון"
 * `[שט כ"ז | עמ' 42]`: ראיות שכל כולן מן התקופה שאחרי תחילת הנטילה אינן שלובות
 * בוסתה הראשון, ולכן אין הוסת שנקבעה מהן עומדת כששבה לוסתה הקודם.
 *
 * @param {Object} veset
 * @param {number|null} pillFromAbs - יום תחילת הנטילה של התקופה שהסתיימה
 */
export function isPillEraVeset(veset, pillFromAbs) {
    if (!Number.isFinite(pillFromAbs)) return false;
    const by = (veset && veset.establishedBy) || [];
    return by.length > 0 && by.every(abs => abs >= pillFromAbs);
}
