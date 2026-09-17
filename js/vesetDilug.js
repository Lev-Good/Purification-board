/**
 * וסת הדילוג (וססת הסירוג) — **זיהוי התבנית, וסימנה לבירור**.
 *
 * ## המקורות (docs/SPEC_DINIM_VESATOT.md §3.4–3.5, §9.2)
 *
 * > "ראתה ט\"ו באב, וי\"ז באלול, ועוד חזרה וראתה ט\"ו בתשרי וט\"ז בחשון וי\"ז בכסלו,
 * > **קבעה לה וסת לדילוג חלילה, וחוששת לעולם ט\"ו לחודש זה וט\"ז לחודש זה וי\"ז לחודש
 * > זה**." `[שט ל\"ז | עמ' 149]`
 *
 * > "אבל **לשון השו\"ע משמע שהוא וסת הדילוג**. ונפקא מינה לעניין **עקירת הוסת**:
 * > דאם הוא וסת הדילוג נעקר על ידי ששלשה חדשים לא תראה, אבל אם הוא שלשה וסתות
 * > לסירוג **צריכה לעקור כל אחד מהם שלש פעמים**." `[שט ל\"ז | עמ' 149]`
 * > ⚠️ מחלוקת בפרשנות — וההבדל מעשי וקריטי לעקירה.
 *
 * > "אם יש לה וסת לדילוג ולא ראתה ביום הוסת, **בוסת החודש בדילוג חוששת לחודש הבא
 * > כאלו ראתה ביום הוסת**." `[שט ל\"ז | עמ' 149]`
 *
 * **ומדוע זהירות:** "כיון דבוסתות לא שכיחות **אין חוששים אלא א\"כ הוקבעו באופן
 * ודאי**... **[דאל\"כ נמצא דהרבה נשים יהא להן וסת הדילוג ווסת השבוע]**"
 * `[ד\"ט | עמ' 7]`. ומכאן שתי מסקנות מימושיות:
 *
 * 1. **התבנית חייבת להיות ודאית** — מחזור מלא שחוזר **פעמיים שלמות**, בלי חודש
 *    מדולג, ובאותה עונה. תבנית חסרה אינה מזוהה כלל.
 * 2. **אין חוששים לה מעצמנו.** הזיהוי מוחזר כ**מועמד לבירור** (`dilugCandidates`),
 *    והמנוע אינו מסיק ממנו חשש אלא אם המתג `dilug` דלוק במפורש
 *    (`js/stringencies.js`). בלא המתג היא מוצגת למשתמשת עם מקורה ועם ההפניה לרב.
 *
 * ## מה נחשב כאן \"דילוג\"
 *
 * מחזור של **ב' או ג' ימים עוקבים** — היום עולה באחד בכל חודש, ובהגיעו לסוף
 * המחזור חוזר לראשון ("דילוג חלילה"; ט\"ו, ט\"ז, י\"ז, ט\"ו...). זהו המקרה
 * המפורש שבמקור, והוא גם הצר שבו — כדי שלא ייווצר וסת דילוג מדומה.
 *
 * **הערה על \"אם לא ראתה ביום הוסת\":** אין כאן הוספה של דבר. המחזור מתקדם ממילא
 * יום אחד בכל חודש, בין שראתה ובין שלא — וזה בדיוק מה שהמקור אומר ("חוששת לחודש
 * הבא כאלו ראתה ביום הוסת").
 */
import { HDate } from '../hebcal.js';

/** סימון זמן הוסת הקבועה של הדילוג. */
export const DILUG_CODE = 'וק"ד';

/** אורכי המחזור המזוהים: היום עולה באחד בכל חודש, וחוזר חלילה. */
export const DILUG_CYCLE_LENGTHS = [2, 3];

/** מחזור שלם חייב להיראות פעמיים שלמות לפני שמזהים תבנית. */
export const DILUG_MIN_CYCLES = 2;

/** היום (abs) של ראש החודש העברי שלאחר החודש שבו `abs`. */
export function monthStartAfter(abs) {
    const month = new HDate(abs).getMonth();
    let k = 1;
    while (new HDate(abs + k).getMonth() === month && k < 40) k++;
    return abs + k;
}

/** היום (abs) של ראש החודש העברי שבו `abs`. */
export function monthStartBefore(abs) {
    const month = new HDate(abs).getMonth();
    let k = 1;
    while (new HDate(abs - k).getMonth() === month && k < 40) k++;
    return abs - k + 1;
}

/** האם שני הימים בשני חודשים **עוקבים** (ולא באותו חודש). */
export function monthsAreConsecutive(prevAbs, nextAbs) {
    return monthStartAfter(prevAbs) === monthStartBefore(nextAbs);
}

/**
 * האם סדרת הימים מחזורית באורך `p`, וכל אבר במחזור עולה באחד מן שלפניו
 * (\"דילוג חלילה\").
 */
function isRisingCycle(days, p) {
    if (days.length < p * DILUG_MIN_CYCLES) return false;
    for (let i = p; i < days.length; i++) {
        if (days[i] !== days[i - p]) return false;
    }
    const cycle = days.slice(0, p);
    for (let i = 1; i < p; i++) {
        if (cycle[i] !== cycle[i - 1] + 1) return false;
    }
    return cycle[0] !== cycle[p - 1];   // ואינו חוזר על אותו היום
}

/**
 * מזהה מועמדי וסת דילוג מתוך הראיות שנספרות.
 *
 * @param {Array} counted - הראיות שנספרות לחזקה, בסדר כרונולוגי
 * @returns {Array<{kind: string, cycle: number[], ona: string, nextIndex: number,
 *                  anchorAbs: number, cycleIndex: number, label: string,
 *                  establishedBy: number[]}>}
 */
export function detectDilugCandidates(counted) {
    const list = (counted || []).slice();
    if (list.length < 2 * DILUG_MIN_CYCLES) return [];

    // זנב של ראיות בחודשים **עוקבים** ובאותה עונה — התבנית נבחנת עליו בלבד.
    let tail = [];
    for (let i = list.length - 1; i >= 0; i--) {
        const current = list[i];
        if (!tail.length) { tail.unshift(current); continue; }
        const first = tail[0];
        if (current.ona !== first.ona) break;
        if (!monthsAreConsecutive(current.abs, first.abs)) break;
        tail.unshift(current);
    }
    if (tail.length < 2 * DILUG_MIN_CYCLES) return [];

    const days = tail.map(r => r.hdate.getDate());
    const anchor = tail[tail.length - 1];

    return DILUG_CYCLE_LENGTHS.filter(p => isRisingCycle(days, p)).map(p => {
        const cycle = days.slice(0, p);
        return {
            kind: 'dilug',
            cycle,
            ona: anchor.ona,
            cycleIndex: (tail.length - 1) % p,
            nextIndex: tail.length % p,
            anchorAbs: anchor.abs,
            establishedBy: tail.map(r => r.abs),
            label: 'מחזור ' + cycle.join(' ← ') + ' ← ' + cycle[0]
        };
    });
}

/**
 * היום בחודש שחל על חודש מסוים במחזור, לפי מיקומו של אותו חודש.
 *
 * ההקרנה עצמה נעשית במנוע החישוב (`calculations.js`, `projectFixedVeset`) — שם
 * חיים `shiftHebrewMonth` ו-`buildExactDay`, ואין טעם לשכפל אותם כאן.
 *
 * @param {Object} candidate
 * @param {number} index - מיקום החודש במחזור (0 = החודש העוקב לתבנית)
 */
export function dilugDayFor(candidate, index) {
    const cycle = (candidate && candidate.cycle) || [];
    if (!cycle.length) return null;
    return cycle[((candidate.nextIndex + index) % cycle.length + cycle.length) % cycle.length];
}
