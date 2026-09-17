/**
 * משיכת הראייה — כמה עונות הראייה נמשכה בהן, ולאיזו עונה נחשבת "עונת הוסת".
 *
 * המנוע מחשב את החששות לפי `ona` של הראייה. אלא שהראייה אינה נגמרת בהכרח באותה
 * עונה שבה התחילה, והמקור מלמד שהעונה היחידה שנחשבת ל"עונת הוסת" היא **העונה
 * שבה התחילה לראות** — אבל אם הדימום נמשך לתוך העונה הסמוכה, צריך לחוש **גם
 * לעונה הסמוכה**, כשיעור שנמשך. ורק כשנמשך הרבה (ד' ימים נוספים ומעלה) אין
 * צריך לחוש אלא לתחילת הראייה.
 *
 * ## המקור (docs/SPEC_DINIM_VESATOT.md §9.1)
 *
 * > "עונת הוסת נחשבת העונה שהתחילה לראות בה **אף אם נמשכה ראייתה כמה ימים**."
 * > "וכשנמשכה ראיתה גם בעונה הסמוכה **צריכה לחוש גם לסמוכה כשיעור שנמשכה ראייתה**
 * > [שו"ע קפ"ד ה']. **ורק אם נמשכה ד' ימים נוספים אין צריך לחוש אלא לתחילת
 * > ראייתה** [לבוש, ט\"ז, פרישה]." `[ד"ט | עמ' 1]`
 *
 * ## האלגוריתם (כפי שהוא באפיון, §9.1)
 *
 * ```
 * ON reiyaDuration(reiya):
 *     ona   = onaOf(reiya.start)                  # תמיד לפי ההתחלה
 *     extra = reiya.durationDays - 1
 *     IF extra == 0: return [ona]
 *     IF extra >= 4: return [ona]                 # א"צ לחוש אלא לתחילת הראייה
 *     return [ona] + followingOnas(count = extra) # חוששת גם לסמוכות, כשיעור המשיכה
 * ```
 *
 * ## למה המודול מקבל תאריך ולא ראייה שלמה
 *
 * הקלט של המשך הדימום נרשם על הראייה **המאוחרת** (זו שסומנה "נמשך ברצף"), ואילו
 * מניין החששות חייב להימנות מן הראייה **שבה החל הדימום**. לכן ההכרעה מי נושאת את
 * מספר הימים נעשית במנוע החישוב (`js/calculations.js`), והמודול הזה עוסק רק
 * בחשבון העונות עצמו — בלא תלות במנוע ובמבנה הנתונים.
 *
 * **מה המודול אינו עושה:** אינו מוסיף דבר ללוח ואינו נוגע בחששות. הוא מחזיר את
 * רשימת העונות, והמנוע מזריק אותן.
 */

/**
 * מספר העונות הנוספות המרבי שיכול להצטרף לעונת ההתחלה.
 *
 * "ורק אם נמשכה **ד' ימים נוספים** אין צריך לחוש אלא לתחילת ראייתה" — כלומר
 * דוקא כשהמשיכה קטנה מד' ימים נחשבת הסמוכה, ואילו ד' ומעלה נדחית כולה. מניין
 * הימים הנוספים הוא `durationDays - 1`.
 */
export const MAX_EXTRA_ONOT = 3;

/** מה שנוסף לחששותיה של הראייה שהמשיכה. */
export const EXTENSION_NOTE = 'משיכת הראייה — חוששת גם לעונה הסמוכה';

/** פסוק היסוד, לתצוגה לצד החשש. */
export const EXTENSION_SOURCE = '[ד"ט | עמ\' 1] · שו"ע קפ"ד ה\'';

/** לשון הדין כשלא נחשבת העונה הסמוכה מחמת אורך המשיכה. */
export const EXTENSION_LONG_NOTE = 'הראייה נמשכה ד\' ימים נוספים ומעלה — אין צריך לחוש אלא לתחילת הראייה';

/** מה שנוסף לחששותיה של ראייה שסומנה "ספק עונה", כשהמתג המחמיר דלוק. */
export const SAFEK_ONA_NOTE = 'ספק עונה — לכתחילה ראוי לחוש אף לעונה הקודמת';

/** פסוקי היסוד לדין ספק העונה. */
export const SAFEK_ONA_SOURCE = '[ד"ט | עמ\' 1] · [שט כ"ו | עמ\' 27–28]';

const ONOT = ['day', 'night'];

/**
 * העונה **הקודמת** לעונה הנתונה, על סדר ישראל — הלילה קודם ליום של אותו תאריך.
 *
 * זוהי "העונה הקודמת" שהמקור מחייב בה לחוש לכתחילה בספק עונה: "ומ״מ לכתחילה ראוי
 * לחוש ולאסור **אף העונה הקודמת**" `[ד"ט | עמ' 1]`.
 *
 * @returns {{abs: number, ona: string}|null}
 */
export function previousOna(abs, ona) {
    if (ona === 'night') return { abs, ona: 'day' };
    if (ona === 'day') return { abs: abs - 1, ona: 'night' };
    return null;
}

/**
 * העונה שלאחר העונה הנתונה, על סדר ישראל (הלילה ואחר כך היום של מחרת).
 *
 * @param {number} abs
 * @param {string} ona - 'day' | 'night'
 * @returns {{abs: number, ona: string}}
 */
function nextOna(abs, ona) {
    if (ona === 'day') return { abs, ona: 'night' };
    return { abs: abs + 1, ona: 'day' };
}

/**
 * האם המשיכה ארוכה דיה כדי שלא לחוש לעונה הסמוכה.
 *
 * @param {number} durationDays - מספר הימים הכולל של הדימום
 */
export function extensionIsTooLong(durationDays) {
    const days = Number(durationDays);
    if (!Number.isFinite(days) || days <= 1) return false;
    return Math.floor(days) - 1 > MAX_EXTRA_ONOT;
}

/**
 * העונות הנוספות שהראייה נמשכה לתוכן — מעבר לעונת ההתחלה.
 *
 * @param {number} abs - יום הראייה שממנו החל הדימום
 * @param {string} ona - העונה שבה החל הדימום
 * @param {number} durationDays - מספר הימים הכולל של הדימום
 * @returns {Array<{abs: number, ona: string}>} ריק כשאין משיכה, וכשהמשיכה ארוכה
 *          מד' ימים (`extensionIsTooLong`).
 */
export function extensionOnot(abs, ona, durationDays) {
    if (ONOT.indexOf(ona) === -1) return [];
    const days = Number(durationDays);
    if (!Number.isFinite(days) || days <= 1) return [];
    if (extensionIsTooLong(days)) return [];

    const extra = Math.floor(days) - 1;
    const out = [];
    let cur = { abs, ona };
    for (let i = 0; i < extra; i++) {
        cur = nextOna(cur.abs, cur.ona);
        out.push(cur);
    }
    return out;
}

/**
 * כל העונות שהראייה נמשכה בהן — עונת ההתחלה ואחריה הסמוכות.
 *
 * @returns {Array<{abs: number, ona: string}>} האיבר הראשון הוא תמיד עונת ההתחלה.
 */
export function durationOnot(abs, ona, durationDays) {
    return [{ abs, ona }].concat(extensionOnot(abs, ona, durationDays));
}

/**
 * תאור המשיכה למשתמשת, לפי מספר הימים.
 *
 * @returns {string|null} null כשאין משיכה כלל.
 */
export function durationNote(durationDays) {
    const days = Number(durationDays);
    if (!Number.isFinite(days) || days <= 1) return null;
    return extensionIsTooLong(days) ? EXTENSION_LONG_NOTE : EXTENSION_NOTE;
}
