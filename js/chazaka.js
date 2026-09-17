/**
 * מנוע החזקה — זיהוי וסת קבוע.
 *
 * המודול הזה אינו מחשב תאריכים. הוא עונה על שאלה אחת בלבד:
 * **מה נקבע**, כלומר — אילו מהראיות נספרות לחזקה, ואיזו וסת קבוע הוקבעה מהן.
 *
 * המקורות (ראו docs/SPEC_DINIM_VESATOT.md §3, §9.5):
 *  - "אין האשה קובעת לה וסת עד שתקבענה שלש פעמים" `[שט מ"א | עמ' 182]`
 *  - "שוסת החודש נקבע על ידי שלש ראיות, ווסת הפלגה נקבע על ידי ארבע ראיות
 *    וביניהם שלש הפלגות שוות" `[ד"ט | עמ' 7]`
 *  - "אין הוסת נקבע עד שיהיו כל הראיות באותה עונה, יום או לילה" `[ד"ט | עמ' 7]`,
 *    וכן "דוקא אם ראתה כולן באותה העונה" `[שט ל"ו | עמ' 137]`,
 *    ו"ג' הראיות חייבות להיות באותה עונה" (שו"ע קפ"ט סי"ג) `[שט ל"ד | עמ' 114]`
 *  - וסת ההפלגה: "אין הראשונה מן המנין כיון שלא היתה בהפלגה" `[שט ל"ו | עמ' 137]`,
 *    ו"הראייה הראשונה של ההפלגה אינה צריכה להיות בעונה שווה" `[ד"ט | עמ' 7]`
 *  - **עונות מעורבות** (תבנית שנשלמה ואחר כך נשתנתה העונה): "ואם ראתה שלש פעמים
 *    ביום והרביעית בלילה או שלש פעמים בלילה והרביעית ביום, **חוששת ביום ובלילה**
 *    מפני חשש הוסת הראשון ומפני חשש השינוי שהוא האחרון" `[שט ל"ג | עמ' 112]`
 *    (מדברי הראב"ד בבעלי הנפש), ונפסק כן להלכה `[שט ל"ג | עמ' 113]`.
 *    ענף זה מוחזר בשדה `mixedOna`, והתאריכים שהוא מחייב מסומנים ב-`calculations.js`.
 *  - **וסת הדילוג:** "קבעה לה וסת לדילוג חלילה, וחוששת לעולם ט"ו לחודש זה וט"ז
 *    לחודש זה וי"ז לחודש זה" `[שט ל"ז | עמ' 149]` — מזוהה ב-`js/vesetDilug.js`
 *    כמועמד לבירור בלבד, ואינו נחשש בלא מתג מפורש (§5ב).
 *  - **"צירוף למפרע":** "אם חזרה וראתה בוסת הארוך, כגון **שראתה לל' ולל' ולכ'
 *    ושוב לל' אחר הכ', קבעה לה וסת לל'**... ומה שבאמצע ראתה בהפלגת כ' אינו מקלקל
 *    קביעות הוסת **כיון שוסת קצר אינו עוקר וסת הארוך**" `[שט ל"ג | עמ' 112]` —
 *    מזוהה ב-`detectChiburLemafrea`, ומוחזר כמועמד לבירור שבו בלבד; הספר מגדיר
 *    את הכלל "**רק לחומרא בעלמא ולא מעיקרא דדינא**", ולכן הוא נדלק במתג בלבד
 *    (`chiburLemafrea` ב-`js/stringencies.js`).
 *  - **וסת השבוע:** "ראתה ג"פ **באחד בשבת** או **בה' בשבת**, או באחד בניסן ובאחד
 *    באייר ובאחד בסיון, או בה' בניסן ובה' באייר ובה' בסיון, קבעה לה וסת באחד בשבת
 *    או בה' בו, ובאחד בחודש או בה' בו, **אף על פי** [שאינם שווים באורכם]"
 *    `[שט ל"ו | עמ' 137]` — וכלשון דעת טהרה: "יתר הוסתות... **אינה חוששת להם אלא
 *    אם כן נקבעו שלש פעמים**, כיון שאינן וסתות שכיחות" `[ד"ט | עמ' 4]`. ולכן
 *    וסת השבוע **אינו** יוצר חשש בפעם אחת; הוא נוהג רק משהוקבע, כדרך הוסת הקבוע.
 */

import { detectDilugCandidates } from './vesetDilug.js';

/** תוויות סוג הראייה, כפי שהן מוצגות למשתמשת. */
export const REIYA_KIND_LABELS = {
    regular: 'רגילה',
    ones: 'אונס / קפיצה',
    sharp: 'מאכל חריף',
    pills: 'כדורים'
};

/**
 * הסיבות שבגללן ראייה אינה נספרת לחזקה. הטקסט מוצג למשתמשת, כדי שלא ייעלם
 * ממנה מידע על כך שהמערכת התעלמה מראייה שהיא תיעדה.
 */
export const COUNTED_EXCLUSIONS = {
    ones: 'ראייה מחמת אונס או קפיצה — אינה מן המניין לקביעת וסת',
    continuation: 'המשך דימום — נמנית עם הראייה שקדמה לה, ולא כראייה נפרדת'
};

/** ג' ראיות קובעות וסת החודש; ד' ראיות (ג' הפלגות שוות) קובעות וסת ההפלגה. */
export const MONTH_SIGHTINGS_NEEDED = 3;
export const HAFLAGAH_SIGHTINGS_NEEDED = 4;
/** ג' ראיות באותו יום בשבוע ובאותה עונה קובעות וסת השבוע `[שט ל"ו | עמ' 137]`. */
export const WEEK_SIGHTINGS_NEEDED = 3;

/** שמות ימות השבוע, כפי ש-`HDate.getDay()` סופר אותם (0 = ראשון). */
export const HEB_WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/** שם היום בשבוע, לתצוגה. */
export function hebWeekday(day) {
    return HEB_WEEKDAYS[day] || String(day);
}

/** סימון החשש שנוסף מחמת "עונות מעורבות" (חוששת ליום וללילה). */
export const MIXED_ONA_CODE = 'עו"מ';

/** סימון זמן הוסת הקבועה של **הימים המתחלפים** ("ימי המבוכה"). */
export const MEVUCHA_CODE = 'וק"מ';

/**
 * ג' ראיות בכל אחד מן הימים — עקירת וסת הימים המתחלפים בג"פ `[שט ל"ב | עמ' 107–108]`.
 */
export const MEVUCHA_SIGHTINGS_NEEDED = 3;

/**
 * אופק התצוגה של וסת קבוע, בימים.
 *
 * וסת קבוע עומד בעינו עד שייעקר (§4.1) — ועקירה טרם מומשה. כדי לא לחסום את
 * המשתמשת מול לוח ריק בעתיד, הוסת הקבוע מוקרן קדימה לאורך האופק הזה בלבד.
 * זהו **גבול תצוגה, לא גדר הלכתית**.
 */
export const CHAZAKA_HORIZON_DAYS = 730;

/**
 * האם הראייה מדווחת כהמשך דימום של ראייה קודמת.
 *
 * "ממעיין פתוח" — "ודוקא כשראתה ב' הראיות הראשונות ממעיין סתום ורק בשלישית
 * מהמשך, הרי זו קבעה לה וסת. אבל אם ראתה בתחילה ממעיין פתוח ואח"כ ב"פ ממעיין
 * סתום — לא קבעה לה וסת כלל." `[ד"ט | עמ' 7]`
 *
 * ההכרעה נשענת על שני הנתונים שהמשתמשת מסרה — הסימון "נמשך ברצף" **ומספר הימים
 * הכולל של הדימום**: רק אם הראייה הקודמת נפלה בתוך אותו מספר ימים מדובר באותה
 * ראייה. אם הסימון והמניין סותרים זה את זה ("המשך" שרחוק מן הראייה הקודמת יותר
 * ממשך הדימום) — אין די במידע כדי למזג, והראייה נספרת כראייה נפרדת. המקרה נרשם
 * כ**אזהרה** שמוצגת למשתמשת, כדי שנתון סותר לא יקבע וסת בשקט.
 *
 * @param {Object} reiya - הראייה הנוכחית
 * @param {Array} reiyot - כל הראיות לפי סדר, עד הראייה הנוכחית (כולל)
 * @param {number} index - מקומה של הראייה הנוכחית במערך
 * @returns {{merged: Object|null, inconsistentWith: Object|null}}
 */
function findContinuedBleeding(reiya, reiyot, index) {
    if (reiya.closedFountain !== false) return { merged: null, inconsistentWith: null };

    // מספר הימים הכולל של אותו דימום — ממנו נגזר חלון החיפוש.
    const totalDays = Number.isFinite(reiya.durationDays) && reiya.durationDays > 1
        ? reiya.durationDays
        : null;
    const window = totalDays === null ? 1 : totalDays - 1;

    // ההפלגה מהראייה הקרובה ביותר אחורה — היא המועמדת היחידה למיזוג.
    for (let k = index - 1; k >= 0; k--) {
        const gap = reiya.abs - reiyot[k].abs;
        if (gap <= 0) continue;
        if (gap <= window) return { merged: reiyot[k], inconsistentWith: null };
        return { merged: null, inconsistentWith: reiyot[k] };
    }
    return { merged: null, inconsistentWith: null };
}

/**
 * מפריד את הראיות שנספרות לחזקה מאלה שאינן נספרות.
 *
 * שתי סיבות להחרגה:
 *  1. **ראייה מחמת אונס / קפיצה** — אינה מן המניין, ואם לא תסומן היא תקבע וסת
 *     שלא נקבעה (`[שט כ"ז | עמ' 41]`).
 *  2. **המשך דימום** — אינה ראייה חדשה אלא חלק מן הראייה שקדמה לה.
 *
 * ראיות מחמת מאכל חריף או כדורים **כן נספרות**: דינן כוסת הגוף, ולא כוסת האונס
 * (`[שט כ"ז | עמ' 41]`).
 *
 * @param {Array<{abs: number, ona: string, hdate: HDate, kind?: string, durationDays?: number, closedFountain?: boolean}>} reiyot
 * @returns {{
 *   counted: Array,
 *   excluded: Array<{abs: number, reason: string, text: string, mergedInto: number|null}>,
 *   warnings: Array<{abs: number, text: string}>
 * }}
 */
export function classifyReiyot(reiyot) {
    const counted = [];
    const excluded = [];
    const warnings = [];

    reiyot.forEach((reiya, index) => {
        if (reiya.kind === 'ones') {
            excluded.push({
                abs: reiya.abs,
                reason: 'ones',
                text: COUNTED_EXCLUSIONS.ones,
                mergedInto: null
            });
            return;
        }

        const continued = findContinuedBleeding(reiya, reiyot, index);
        if (continued.merged) {
            excluded.push({
                abs: reiya.abs,
                reason: 'continuation',
                text: COUNTED_EXCLUSIONS.continuation,
                mergedInto: continued.merged.abs
            });
            return;
        }
        if (continued.inconsistentWith) {
            const gap = reiya.abs - continued.inconsistentWith.abs;
            warnings.push({
                abs: reiya.abs,
                text: `סומנה כ"המשך דימום", אך הראייה הקודמת הייתה לפני ${gap} ימים ` +
                    `ומשך הדימום שצוין הוא ${reiya.durationDays} ימים בלבד — לכן היא נספרת ` +
                    'כראייה נפרדת. אם הדימום באמת נמשך ברצף, עדכנו את מספר הימים.'
            });
        }

        counted.push(reiya);
    });

    return { counted, excluded, warnings };
}

/**
 * תבנית "עונות מעורבות": שלש ראיות בעונה אחת והרביעית בעונה שכנגד.
 *
 * "ואם ראתה שלש פעמים ביום והרביעית בלילה או שלש פעמים בלילה והרביעית ביום,
 * חוששת ביום ובלילה מפני חשש הוסת הראשון ומפני חשש השינוי שהוא האחרון"
 * `[שט ל"ג | עמ' 112]` (הראב"ד), וכן: "והוא מדברי הראב"ד בבעלי הנפש, ובדברי
 * הראב"ד מבואר שאף בוסת ההפלגה הדין כן, שצריך שיהיו שלש הראיות האחרונות הקובעות
 * את הוסת באותה העונה".
 *
 * ולגבי שיטת הגרד"ט (למנות הפלגות לפי מניין העונות ולא לפי מניין הימים):
 * "ונודע ביהודה משבח לדברי הגרד"ט בסברא **אך לא קיבל דבריו להלכה**"
 * `[שט ל"ג | עמ' 113]` — ולכן מניין ההפלגה נשאר בימים.
 *
 * **אופן הזיהוי:** אין זו תבנית חדשה, אלא תבנית **שכבר היתה שלמה** (זו שהיתה
 * נקבעת אילו העונות היו שוות), שהגיעה אליה ראייה חדשה באותה תבנית **בעונה
 * שכנגד**. כלומר: קודם נבדקת החזקה על כל הראיות חוץ מן האחרונה, ואם היא שלמה —
 * והאחרונה ממשיכה את אותה תבנית בעונה האחרת — הרי זו "עונות מעורבות".
 *
 * שים לב: מכוח עיקרון ההחמרה (האפיון §3.1) הוסת אינה נקבעת כשהעונה משתנה —
 * "שלש הראיות האחרונות שהן הקובעות" — ולכן כאן נשארות שלוש שלימות ונוספת
 * הרביעית; והחשש המוצג הוא **לשתי העונות**, כמובא לעיל.
 *
 * @param {Array} counted - הראיות שנספרות לחזקה, בסדר כרונולוגי
 * @returns {Array|null} רשומה לכל סוג תבנית שנמצאה (חודש / הפלגה)
 */
export function mixedOnaChange(counted) {
    const list = counted || [];
    if (list.length < MONTH_SIGHTINGS_NEEDED + 1) return null;

    const last = list[list.length - 1];
    const previous = list.slice(0, -1);
    const out = [];

    // וסת החודש: שלש ראיות באותו יום בחודש ובעונה אחת, והרביעית באותו יום בעונה שכנגד.
    const previousMonthRun = trailingSameDayRun(previous);
    if (previousMonthRun >= MONTH_SIGHTINGS_NEEDED) {
        const previousLast = previous[previous.length - 1];
        if (last.hdate.getDate() === previousLast.hdate.getDate() && last.ona !== previousLast.ona) {
            out.push({
                kind: 'month',
                dayOfMonth: last.hdate.getDate(),
                firstOna: previousLast.ona,
                lastOna: last.ona,
                lastAbs: last.abs,
                establishedBy: previous.slice(-MONTH_SIGHTINGS_NEEDED).map(r => r.abs)
            });
        }
    }

    // וסת ההפלגה: ד' ראיות בג' הפלגות שוות בעונה אחת, והחמישית באותה הפלגה בעונה שכנגד.
    const previousSpans = trailingEqualSpans(previous);
    if (previousSpans.span !== null && previousSpans.spans >= HAFLAGAH_SIGHTINGS_NEEDED - 1) {
        const previousLast = previous[previous.length - 1];
        const span = last.abs - previousLast.abs;
        if (span === previousSpans.span && last.ona !== previousLast.ona) {
            out.push({
                kind: 'haflagah',
                span: span,
                spanLabel: span + 1,
                firstOna: previousLast.ona,
                lastOna: last.ona,
                lastAbs: last.abs,
                establishedBy: previous.slice(-HAFLAGAH_SIGHTINGS_NEEDED).map(r => r.abs)
            });
        }
    }

    return out.length ? out : null;
}

/**
 * וסת לימים המתחלפים — "ימי המבוכה" (`[שט ל"ב | עמ' 107–108]`).
 *
 * > "ראתה כמה פעמים **ביום כ"ז** וכמה פעמים **ביום כ"ט** ו**ביום כ"ח לא ראתה** —
 * > **חוששת לכ"ז וכ"ט ואינה חוששת לכ"ח**"
 *
 * ## הכרעת המימוש (צר ומפורש)
 *
 * הזיהוי דורש **בדיוק שני ימים**, שכל אחד מהם נקבע בחזקת **ג' ראיות באותה עונה**,
 * שהפרשם **שני ימים בדיוק** (יום אחד מפסיק — "וביום כ"ח לא ראתה"), ושהמפסיק לא נראה
 * כלל. תבנית רחבה מזו אינה מזוהה: הספר מזהיר במפורש מפני וסתות שאינן שכיחות —
 * "אין חוששים אלא א"כ הוקבעו באופן ודאי" `[ד"ט | עמ' 7]` — ובתבנית הזו החשש הוא
 * **לטווח של שני ימים בחודש**, ולא לכל יום שני.
 *
 * **דין ההקרנה:** החשש הוא לאותו יום בחודש שבא אחריו — כשני ימי וסת של חודש
 * (`js/calculations.js`, `projectFixedVeset`), ועקירתו בג' זמנים עם בדיקה כדרך כל
 * וסת קבועה (הספר: "עקירתו בג"פ").
 *
 * @param {Array} counted - הראיות שנספרות לחזקה, לפי סדר כרונולוגי
 * @returns {Object|null}
 */
export function findAlternatingDays(counted) {
    const list = counted || [];
    if (list.length < MEVUCHA_SIGHTINGS_NEEDED * 2) return null;
    const last = list[list.length - 1];

    // היום המפסיק נבדק על **כל** הראיות — "וביום כ"ח לא ראתה".
    const allDays = new Set(list.map(r => r.hdate.getDate()));

    const byDay = new Map();
    list.filter(r => r.ona === last.ona).forEach(r => {
        const day = r.hdate.getDate();
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day).push(r);
    });

    const days = [...byDay.keys()].sort((a, b) => a - b);
    if (days.length !== 2) return null;
    const [a, b] = days;
    if (b - a !== 2) return null;                         // יום אחד מפסיק בלבד
    if (allDays.has(a + 1)) return null;                  // "וביום כ"ח לא ראתה"
    if (byDay.get(a).length < MEVUCHA_SIGHTINGS_NEEDED) return null;
    if (byDay.get(b).length < MEVUCHA_SIGHTINGS_NEEDED) return null;

    return {
        kind: 'mevucha',
        ona: last.ona,
        days: [a, b],
        label: `יום ${hebDayOfMonth(a)} ויום ${hebDayOfMonth(b)} בחודש`,
        establishedBy: byDay.get(a).slice(-MEVUCHA_SIGHTINGS_NEEDED).map(r => r.abs)
            .concat(byDay.get(b).slice(-MEVUCHA_SIGHTINGS_NEEDED).map(r => r.abs))
            .sort((x, y) => x - y)
    };
}

/**
 * מספר הראיות הרצופות (מהסוף) באותו יום בחודש ובאותה עונה.
 */
function trailingSameDayRun(counted) {
    if (!counted.length) return 0;
    const last = counted[counted.length - 1];
    let run = 0;
    for (let i = counted.length - 1; i >= 0; i--) {
        const r = counted[i];
        if (r.hdate.getDate() !== last.hdate.getDate() || r.ona !== last.ona) break;
        run++;
    }
    return run;
}

/**
 * מספר ההפלגות השוות הרצופות (מהסוף), בתנאי שעונות הראיות הסוגרות אותן שוות.
 */
function trailingEqualSpans(counted) {
    if (counted.length < 2) return { spans: 0, span: null };
    const last = counted[counted.length - 1];
    const span = last.abs - counted[counted.length - 2].abs;
    let spans = 0;
    for (let i = counted.length - 1; i >= 1; i--) {
        if (counted[i].abs - counted[i - 1].abs !== span) break;
        if (counted[i].ona !== last.ona) break;
        spans++;
    }
    return { spans, span };
}

/**
 * "צירוף למפרע" — קביעת וסת ההפלגה הארוכה אף שהפסיקה ביניהן הפלגה קצרה ממנה.
 *
 * > "ולפי מה שאמרנו שחוששת להפלגה הארוכה אחר הראיה שראתה בהפלגה הקצרה משום
 * > **דוסת קצר אינו עוקר וסת הארוך**, הוא הדין שאם חזרה וראתה בוסת הארוך, כגון
 * > **שראתה לל' ולל' ולכ' ושוב לל' אחר הכ', קבעה לה וסת לל'** שהרי היו לה שלש
 * > הפלגות של ל', **ומה שבאמצע ראתה בהפלגת כ' אינו מקלקל קביעות הוסת** כיון שוסת
 * > קצר אינו עוקר וסת הארוך." `[שט ל"ג | עמ' 112]`
 *
 * **מהי התבנית:** ההפלגה **האחרונה** קובעת את אורך הווסת (ל' בדוגמה שלמעלה),
 * ומאחוריה עוד **שתי הפלגות שוות לה**, כשכל ההפלגות שביניהן קצרות מהן. שלוש
 * ההפלגות האלה הן "שלש הפלגות של ל'" — ובלעדי הצירוף לא היה הווסת נקבע, מפני
 * ש-`trailingEqualSpans` דורש שלוש הפלגות שוות **רצופות** מן הסוף.
 *
 * **הכרעות המימוש (בצמצום, כדי שלא יהא זיהוי מדומה):**
 *  - ההפלגות השוות נמצאות כמהלך אחד מן הסוף, והמפסיקות ביניהן **קצרות** מהן.
 *    הפלגה **ארוכה** מן הארוכה **מפסיקה** את הזיהוי — שהמקור אינו מזכיר אלא צירוף
 *    של הפלגה קצרה, והוא הדין שלא התיר אלא אותה.
 *  - לפחות הפלגה מפסיקה אחת נדרשת; בלא מפסיקת אין זה צירוף למפרע אלא חזקה רגילה
 *    (שכבר נדונה ב-`trailingEqualSpans`).
 *  - עונות **כל** הראיות שבחלון שוות זו לזו, כעין "שיהיו כל הראיות באותה עונה"
 *    `[שט ל"ד | עמ' 114]` (שו"ע קפ"ט סי"ג).
 *
 * **מה שהיא אינה עושה:** אינה קובעת דבר בעצמה. היא מחזירה **מועמד**, וגם אותו
 * מקבל המנוע לחשבון **רק כשהמתג `chiburLemafrea` דלוק במפורש** — שהרי הספר עצמו
 * מגדיר את הכלל ש"וסת קצר אינו עוקר וסת הארוך" כדעת הגר"ז והבית מאיר, וכותב עליה
 * "**אבל הוא רק לחומרא בעלמא ולא מעיקרא דדינא**" (שם, על אותו עמוד).
 *
 * @param {Array<{abs:number, ona:string, hdate:Object}>} counted - הראיות הנספרות
 * @returns {{kind:'haflagah', ona:string, span:number, spanLabel:number, viaChibur:true,
 *            establishedBy:number[], gapSpans:number[]}|null}
 */
export function detectChiburLemafrea(counted) {
    if (!counted || counted.length < HAFLAGAH_SIGHTINGS_NEEDED) return null;
    const last = counted[counted.length - 1];
    const span = last.abs - counted[counted.length - 2].abs;
    if (!(span > 0)) return null;

    // הליכה לאחור: אוספים הפלגות השוות להפלגה האחרונה, והמפסיקות חייבות להיות קצרות.
    let equalSpans = 1;
    const gapSpans = [];
    let windowStart = counted.length - 1;
    for (let i = counted.length - 2; i >= 1; i--) {
        const s = counted[i].abs - counted[i - 1].abs;
        if (s === span) {
            equalSpans++;
            windowStart = i - 1;
            if (equalSpans >= HAFLAGAH_SIGHTINGS_NEEDED - 1) break;
        } else if (s < span) {
            gapSpans.unshift(s);
        } else {
            return null;
        }
    }
    if (equalSpans < HAFLAGAH_SIGHTINGS_NEEDED - 1 || gapSpans.length === 0) return null;

    // תנאי העונה: כל הראיות שבחלון — באותה עונה.
    const windowSightings = counted.slice(windowStart);
    const ona = last.ona;
    if (windowSightings.some(r => r.ona !== ona)) return null;

    return {
        kind: 'haflagah',
        ona,
        span,
        spanLabel: span + 1,
        viaChibur: true,
        establishedBy: windowSightings.map(r => r.abs),
        gapSpans
    };
}

/**
 * מספר הראיות הרצופות (מהסוף) באותו יום בשבוע ובאותה עונה — היא וסת השבוע.
 *
 * "ראתה ג"פ באחד בשבת או בה' בשבת... **קבעה לה וסת באחד בשבת**"
 * `[שט ל"ו | עמ' 137]`.
 *
 * **הכרעת מימוש — הפרש של שבוע בדיוק:** הווסת מזוהה רק כשההפלגות שבין הראיות
 * **שוות לשבוע אחד בדיוק** (יום אחד בשבוע, כל שבעה ימים). המקור אינו מחייב
 * בלשונו הפרש שווה, אלא זהות היום בשבוע בלבד; אבל הוא עצמו מזהיר מפני ריבוי
 * מדומה של וסת זה — "כיון דבוסתות לא שכיחות אין חוששים אלא א"כ הוקבעו באופן
 * ודאי... **[דאל"כ נמצא דהרבה נשים יהא להן וסת הדילוג ווסת השבוע]**"
 * `[ד"ט | עמ' 7]`. אילו די היה בזהות היום בשבוע, כל אשה שתראה ג' פעמים באותו
 * יום בשבוע — גם בהפלגות ארוכות ואינן שוות — היתה נחשבת בעלת וסת שבועי
 * **על כל שבעה ימים**, וזהו בדיוק הריבוי שמפניו הזהיר. ולכן נדרש גם ההפרש.
 * הפרישה המרווחת מזוהה ממילא כוסת הפלגה (בד' ראיות), וזו הישרה שבה.
 */
function trailingSameWeekdayRun(counted) {
    if (!counted.length) return 0;
    const last = counted[counted.length - 1];
    const weekday = last.hdate.getDay();
    let run = 0;
    for (let i = counted.length - 1; i >= 0; i--) {
        const r = counted[i];
        if (r.hdate.getDay() !== weekday || r.ona !== last.ona) break;
        // הראייה שלפניה היתה שבוע בדיוק לפניה `[שט ל"ו | עמ' 137]`.
        if (run > 0 && r.abs !== counted[i + 1].abs - 7) break;
        run++;
    }
    return run;
}

/**
 * מזהה איזו וסת קבועה הוקבעה מתוך הראיות שנספרות.
 *
 * @param {Array} reiyot - כל הראיות לפי סדר כרונולוגי
 * @returns {{
 *   counted: Array, excluded: Array, established: Array,
 *   warnings: Array<{abs: number, text: string}>,
 *   dilugCandidates: Array, mevucha: Object|null, mixedOna: Array,
 *   chibur: Object|null - מועמד "צירוף למפרע" (detectChiburLemafrea), לתצוגה
 *                        ולבירור — אינו נחשב לווסת אלא במתג המפורש,
 *   lastCounted: Object|null,
 *   progress: {month: {have: number, need: number}, haflagah: {have: number, need: number},
 *              week: {have: number, need: number}}
 * }}
 */
export function analyzeChazaka(reiyot) {
    const { counted, excluded, warnings } = classifyReiyot(reiyot || []);
    const established = [];
    const lastCounted = counted.length ? counted[counted.length - 1] : null;

    const monthRun = trailingSameDayRun(counted);
    const haflagah = trailingEqualSpans(counted);
    const weekRun = trailingSameWeekdayRun(counted);

    // וסת החודש: ג' ראיות רצופות באותו יום בחודש ובאותה עונה.
    if (monthRun >= MONTH_SIGHTINGS_NEEDED) {
        established.push({
            kind: 'month',
            ona: lastCounted.ona,
            dayOfMonth: lastCounted.hdate.getDate(),
            establishedBy: counted.slice(-MONTH_SIGHTINGS_NEEDED).map(r => r.abs)
        });
    }

    // וסת ההפלגה: ד' ראיות = ג' הפלגות שוות, כשעונות שלוש הראיות שאחרי
    // הראשונה שוות (הראשונה אינה מן המניין — ראו ראש המודול).
    if (counted.length >= HAFLAGAH_SIGHTINGS_NEEDED && haflagah.spans >= HAFLAGAH_SIGHTINGS_NEEDED - 1) {
        established.push({
            kind: 'haflagah',
            ona: lastCounted.ona,
            span: haflagah.span,
            spanLabel: haflagah.span + 1,
            establishedBy: counted.slice(-HAFLAGAH_SIGHTINGS_NEEDED).map(r => r.abs)
        });
    }

    // וסת השבוע: ג' ראיות באותו יום בשבוע ובאותה עונה — "ראתה ג"פ באחד בשבת...
    // קבעה לה וסת באחד בשבת" `[שט ל"ו | עמ' 137]`. הוא נקבע **רק** כשהוקבע
    // (ג' פעמים), ולא כחשש של פעם אחת — "כיון שאינן וסתות שכיחות" `[ד"ט | עמ' 4]`.
    if (weekRun >= WEEK_SIGHTINGS_NEEDED) {
        established.push({
            kind: 'week',
            ona: lastCounted.ona,
            weekday: lastCounted.hdate.getDay(),
            weekdayLabel: hebWeekday(lastCounted.hdate.getDay()),
            establishedBy: counted.slice(-WEEK_SIGHTINGS_NEEDED).map(r => r.abs)
        });
    }

    // וסת לימים המתחלפים — "ימי המבוכה": ראתה ג' פעמים בכ"ז וג' פעמים בכ"ט,
    // ובכ"ח לא ראתה — חוששת לכ"ז וכ"ט `[שט ל"ב | עמ' 107–108]`.
    //
    // **הערה:** תבנית זו אינה יוצרת הפלגה נוספת שאין לה מקום. ההפלגה שבין שתי
    // ראייות של אותו חודש היא ב' ימים, ואילו שבין חודש לחודש היא כ"ח–כ"ט ימים;
    // וב-`trailingEqualSpans` נדרשות שלוש הפלגות **שוות מהסוף ואילך**, וממילא אין
    // ההפלגה נקבעת כאן כלל. (ואילו אילו היתה נקבעת — היתה חוששת כל שני ימים בלא
    // הפסק, שאינו הדין.)
    const mevucha = findAlternatingDays(counted);
    if (mevucha) established.push(mevucha);

    // וסת הדילוג — **מועמדים לבירור בלבד** (`js/vesetDilug.js`). תבנית של מחזור
    // ימים העולה באחד בכל חודש נמצאת כאן רק כדי שתוצג למשתמשת עם מקורה; המנוע
    // **אינו** מסיק ממנה חשש, אלא אם המתג `dilug` דלוק במפורש — "כיון דבוסתות
    // לא שכיחות אין חוששים אלא א"כ הוקבעו באופן ודאי" `[ד"ט | עמ' 7]`.
    const dilugCandidates = detectDilugCandidates(counted);

    // "צירוף למפרע" — מועמד לבירור (§3.1). אם הווסת לאותו אורך כבר נקבעה בדרך
    // הרגילה, אין טעם בהצגת הצירוף — הוא לא יוסיף דבר.
    const chiburRaw = detectChiburLemafrea(counted);
    const chibur = chiburRaw && !established.some(v => v.kind === 'haflagah' && v.span === chiburRaw.span)
        ? chiburRaw
        : null;

    return {
        counted,
        excluded,
        warnings,
        established,
        dilugCandidates,
        chibur,
        mevucha,
        // תבנית שנשלמה ונשתנתה עונתה: חוששת ליום וללילה `[שט ל"ג | עמ' 112–113]`.
        // אינה יוצרת וסת קבועה — אדרבה, מחמת שינוי העונה אין הוסת נקבעת.
        mixedOna: mixedOnaChange(counted),
        lastCounted,
        progress: {
            month: { have: Math.min(monthRun, MONTH_SIGHTINGS_NEEDED), need: MONTH_SIGHTINGS_NEEDED },
            haflagah: {
                have: Math.min(haflagah.spans + 1, HAFLAGAH_SIGHTINGS_NEEDED),
                need: HAFLAGAH_SIGHTINGS_NEEDED
            },
            week: { have: Math.min(weekRun, WEEK_SIGHTINGS_NEEDED), need: WEEK_SIGHTINGS_NEEDED }
        }
    };
}

/**
 * תיאור קריא של וסת קבוע, לתצוגה בממשק.
 */
export function describeVeset(veset) {
    const onaText = veset.ona === 'night' ? 'עונת לילה' : 'עונת יום';
    if (veset.kind === 'month') {
        return `וסת קבוע ליום ${hebDayOfMonth(veset.dayOfMonth)} בחודש (${onaText})`;
    }
    if (veset.kind === 'week') {
        const day = veset.weekdayLabel || hebWeekday(veset.weekday);
        return `וסת קבוע ליום ${day} בשבוע (${onaText})`;
    }
    if (veset.kind === 'mevucha') {
        const days = (veset.days || []).map(hebDayOfMonth).join(' ויום ');
        return `וסת קבוע לימים המתחלפים: יום ${days} בחודש (${onaText})`;
    }
    if (veset.kind === 'dilug') {
        return `וסת קבוע לדילוג — מחזור ${(veset.cycle || []).map(hebDayOfMonth).join(' ← ')} (${onaText})`;
    }
    return `וסת קבוע להפלגת ${veset.spanLabel} ימים (${onaText})`;
}

/**
 * שם היום בחודש בעברית, לתצוגה.
 */
export function hebDayOfMonth(day) {
    const names = ['', 'א\'', 'ב\'', 'ג\'', 'ד\'', 'ה\'', 'ו\'', 'ז\'', 'ח\'', 'ט\'', 'י\'',
        'י"א', 'י"ב', 'י"ג', 'י"ד', 'ט"ו', 'ט"ז', 'י"ז', 'י"ח', 'י"ט', 'כ\'', 'כ"א', 'כ"ב',
        'כ"ג', 'כ"ד', 'כ"ה', 'כ"ו', 'כ"ז', 'כ"ח', 'כ"ט', 'ל\''];
    return names[day] || String(day);
}
