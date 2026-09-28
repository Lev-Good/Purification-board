/**
 * מצב חיים — מסולקת דמים: הריון, לידה והנקה, גיל, ונטילת כדורים.
 *
 * עד כה לא היה למנוע שום ידע על מצבה של האישה, ולכן הוא היה דורש בדיקה ממי
 * שפטורה ממנה, ומציג חששות שאינם נוהגים במעוברת, במניקה, בזקנה ובקטנה
 * (פער 4 באפיון — docs/SPEC_DINIM_VESATOT.md §5, §7).
 *
 * המודול אינו מחשב תאריכים ואינו נוגע במנוע החישוב: הוא עונה על שאלה אחת —
 * **מה מצב הסילוק של האישה בזמן הזה** — ומחזיר שלוש תוצאות בעלות נפקא מינה:
 *
 *  1. **סילוק דמים** — מי שהיא בגדר מסולקת דמים "אינה חוששת לוסתות שהיו לה קודם
 *     שנסתלקה מדמים" `[ד"ט | עמ' 14]`, ואף לוסתה הראשון אפילו היה קבוע
 *     `[שט כ"ט | עמ' 69]` (שו"ע סל"ד).
 *  2. **פטור מבדיקה** — מסולקת דמים פטורה מבדיקה `[שט כ"ה | עמ' 17–18]`, ולכן
 *     אין להציג לה "אסורה לבעלה עד שתבדוק".
 *  3. **עיכוב עקירה בכדורים** — נשים הנוטלות כדורים לדחיית וסתן "פעמים נוצרת
 *     הפלגה ארוכה... הטעם בזה כיון **שלא עקרה וסתה** כיון שניכר בבירור שהפלגתה
 *     הארוכה מחמת הכדורים" `[ד"ט | עמ' 8]` ⇒ ימי הכדורים אינם נמנים למניין
 *     העקירה, וראייה שסומנה כמחמת כדורים אינה דומה לראייה טבעית.
 *
 * **השיעורים (כולם אומתו בשני מקורות):**
 *  - מעוברת — תשעים יום (ג' חודשים) מתחילת ההריון; ובתוך ג' החודשים חוששת
 *    `[ד"ט | עמ' 14]`, `[שט כ"ט | עמ' 63, 66]`. וימי העיבור "מונים מליל טבילתה
 *    האחרון" `[ד"ט | עמ' 14]` — ולכן התאריך הנשאל הוא תאריך ההריון לפי מניין זה.
 *  - מניקה — כ"ד חודש `[שט כ"ט | עמ' 66]`; ובזמננו "מניקה אינה נחשבת כמסולקת
 *    דמים כלל" `[שט כ"ה | עמ' 18]`, ו"דעת טהרה" כתב שאף אם אינה מניקה את בנה
 *    הריהי מסולקת `[ד"ט | עמ' 15]` ⇒ **מחלוקת**, וזו מוצגת ואינה מוכרעת.
 *  - זקנה — "שעברו עליה שלש עונות משהזקינה ולא ראתה" (שו"ע קפ"ט סכ"ח)
 *    `[שט ל' | עמ' 73]`. שיעור הגיל עצמו **במחלוקת רבתי** `[שט ל' | עמ' 75–76]`,
 *    ולכן הוא מוצג כמחלוקת ונדרש לשאול רב.
 *  - קטנה — "תינוקת שלא הגיע זמנה לראות... אפילו אם כבר ראתה שתי פעמים נחשבת
 *    עדיין למסולקת עד שתראה שלש פעמים" `[שט ל' | עמ' 73]`.
 */

import { HDate } from '../hebcal.js';

/** תשעים יום — "אחר שלשה חודשים [תשעים יום] מתחילת ההריון" `[ד"ט | עמ' 14]`. */
export const PREGNANCY_SILEK_DAYS = 90;

/**
 * הערכה כללית בלבד — **אינה מקור הלכתי ואינה קביעה רפואית**: כ-38 שבועות (266
 * יום) מ"תחילת ההריון" כפי שהיא מוזנת באפליקציה (ליל הטבילה שממנו מתחיל מניין
 * ימי העיבור), שהוא תאריך ההתעברות ולא תחילת המחזור האחרון — ולכן קרוב ל-40
 * שבועות מהמניין הרפואי הרגיל (שנמנה מהמחזור, שמקדים את ההתעברות בכ-14 יום).
 * **לא** 280 יום (40 שבועות) מההתעברות עצמה — זה היה מאחר את התאריך המוצג
 * בכשבועיים לעומת האומדן הרפואי המקובל. מוצג בממשק תמיד עם לשון "משוער".
 */
export const PREGNANCY_ESTIMATED_TERM_DAYS = 266;

/** כ"ד חודש אחר הלידה `[שט כ"ט | עמ' 66]`. */
export const NURSING_MONTHS = 24;

/** ג' עונות בינוניות — תשעים יום כל אחת `[שט ל' | עמ' 73]`. */
export const ELDERLY_QUIET_DAYS = 270;

/** גיל שממנו נבחנת חזקת הזקנה. השיעור במחלוקת — ראו הערה בתחתית. */
export const ELDERLY_AGE = 60;

/** "קטנה שלא הגיעה לימי הנעורים ]דהיינו י"ב שנים ויום אחד[" `[שט ל' | עמ' 73]`. */
export const MINOR_AGE_YEARS = 12;

/** קטנה נחשבת מסולקת "עד שתראה שלש פעמים" `[שט ל' | עמ' 73]`. */
export const MINOR_SIGHTINGS_TO_COUNT = 3;

export const PILL_TYPES = {
    combined: 'כדורים משולבים',
    mini: 'מיני — פרוגסטרון בלבד',
    orgast: 'אורגסט — תלוי בסדר הנטילה',
    other: 'אחר'
};

export const PILL_TYPE_DEFAULT = 'combined';

/**
 * **מה גרם להפסקת הכדורים** — מדעתה, בצווי הרופא, או מחמת סיבה אחרת.
 *
 * הספר דן בשאלה אם וסת הנגרם מנטילת כדורים נחשב לקביעת וסת כמו אכילת דברים
 * חריפים, או כאונס, והחילוק הוא האם עשתה כן **מדעתה ומרצונה**:
 *
 * > "שוסת הנגרם על ידי נטילת כדורים דומה לוסת של אכילת דברים חריפים שקובעת וסת
 * > לזה, **ואף שלא נטלה הכדורים להנאתה אלא שהוצרכה לזה בציווי הרופא או מחמת שאר
 * > סיבות, על כל פנים עשתה כן מדעתה ומרצונה**, ושפיר יש לדמותו לוסת דאכילת דברים
 * > חריפים ולא לוסת הקפיצות" `[שט כ"ז | עמ' 41]`
 *
 * ולכן **הנתון הזה אינו משנה את החישוב** — הספר הכריע שהוא נחשב לקביעת וסת בכל
 * עניין. הוא נרשם ונשמר מפני שהמשתמשת עשויה לשאול עליו, וכדי שהאפליקציה תציג
 * את תשובת הספר במקום שנשאלה השאלה.
 */
export const PILL_PAUSE_REASONS = {
    own: 'מדעתי ומרצוני',
    doctor: 'בהוראת רופא',
    other: 'מחמת סיבה אחרת'
};

export const PILL_PAUSE_REASON_DEFAULT = 'own';

/** ניסוח הדין לתצוגה — לדין שמשווה את הכדורים לאכילת דברים חריפים. */
export const PILL_PAUSE_REASON_RULE = {
    title: 'וסת הנגרם מנטילת כדורים — קובע וסת אף כשנצטוותה מפי רופא',
    text: 'הספר דן בדינו של וסת הנגרם על ידי כדורים, והשווהו לאכילת דברים חריפים: '
        + '"שוסת הנגרם על ידי נטילת כדורים דומה לוסת של אכילת דברים חריפים שקובעת וסת לזה, '
        + 'ואף שלא נטלה הכדורים להנאתה אלא שהוצרכה לזה בציווי הרופא או מחמת שאר סיבות, '
        + '**על כל פנים עשתה כן מדעתה ומרצונה**, ושפיר יש לדמותו לוסת דאכילת דברים חריפים '
        + 'ולא לוסת הקפיצות". ולכן הנתון הזה אינו משנה את החישוב: בין שהפסיקה מדעתה בין '
        + 'שנצטוותה על כך מפי רופא — הדין הוא שדינה כוסת הגוף, שקובעת וסת, "אלא דאין זה '
        + 'וסת קבוע גמור בין לקולא ובין לחומרא... ויש להחמיר שדינה גם כאשה שאין לה וסת קבוע".',
    source: '[שט כ"ז | עמ\' 41]'
};

/**
 * הדין בחשש יום ההפסקה לפי **סוג הכדורים** `[שט כ"ז | עמ' 40]`.
 *
 * הספר קובע את טבעם של הכדורים — "שאחר שמפסיקה ליטול הכדורים רואה מיד אחר שני
 * ימים עד חמשה ימים" — ומוסיף מיד: "כן הוא **ברוב הכדורים**, שפעולתם לעצור פעולת
 * ההורמונים הגורמים ביאת הוסת". ומכאן הוא מוציא במפורש סוג אחד:
 *
 * > "**מלבד כדורי אורגסט, שתלוי בסדר שנוטלים אותם**"
 *
 * כלומר: בכדורי אורגסט אין חלון ימים קצוב שאפשר לחשב ממנו את החשש, שהרי הדבר תלוי
 * **בסדר הנטילה** שלהם ולא בעצם הפסקתה. סוג זה מסומן כאן כ-`regimen`, והמנוע
 * (js/pillPause.js) אינו מחשב לו חלון ואינו מציג חשש אוטומטי — אלא מודיע על
 * הדין ומורה לבררו עם רב.
 */
export const PILL_PAUSE_RULES_BY_TYPE = {
    combined: 'standard',
    mini: 'standard',
    other: 'standard',
    // ]מלבד כדורי אורגסט, שתלוי בסדר שנוטלים אותם[ `[שט כ"ז | עמ' 40]`
    orgast: 'regimen'
};

/**
 * כללי חשש יום ההפסקה של סוג כדורים: `standard` (רוב הכדורים — ימים ב'–ה')
 * או `regimen` (אורגסט — תלוי בסדר הנטילה) `[שט כ"ז | עמ' 40]`.
 */
export function pauseRuleOfPillType(type) {
    return PILL_PAUSE_RULES_BY_TYPE[type] || 'standard';
}

/** מצב חיים ריק — כלומר: לא הוגדר דבר, והמנוע אינו מושפע. */
export function defaultLifeState() {
    return {
        enabled: true,
        pregnancyAbs: null,
        birthAbs: null,
        nursing: false,
        nursingLenient: false,
        ageYears: null,
        pills: []
    };
}

function toAbs(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n);
}

function toAgeYears(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 130) return null;
    return Math.round(n);
}

/**
 * מנרמלת את המצב כפי שהוא נשמר (או כפי שנקרא מהטופס) לצורה שקטה ובטוחה.
 * קלט פגום אינו מפיל את המנוע — הוא פשוט אינו מפעיל מצב.
 */
export function normalizeLifeState(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
        enabled: src.enabled !== false,
        pregnancyAbs: toAbs(src.pregnancyAbs),
        birthAbs: toAbs(src.birthAbs),
        nursing: src.nursing === true,
        nursingLenient: src.nursingLenient === true,
        ageYears: toAgeYears(src.ageYears),
        pills: normalizePills(src.pills)
    };
}

function normalizePills(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(p => {
        const startAbs = toAbs(p && p.startAbs);
        if (startAbs === null) return null;
        const endAbs = toAbs(p && p.endAbs);
        const type = PILL_TYPES[p && p.type] ? p.type : PILL_TYPE_DEFAULT;
        const reason = PILL_PAUSE_REASONS[p && p.reason] ? p.reason : PILL_PAUSE_REASON_DEFAULT;
        return { startAbs, endAbs: endAbs !== null && endAbs >= startAbs ? endAbs : null, type, reason };
    }).filter(Boolean).sort((a, b) => a.startAbs - b.startAbs);
}

/** האם הוגדר מצב חיים ממשי (ולא רק ברירת מחדל ריקה). */
export function isLifeConfigured(state) {
    const s = normalizeLifeState(state);
    return s.pregnancyAbs !== null || s.birthAbs !== null || s.nursing === true ||
        s.ageYears !== null || s.pills.length > 0;
}

/** האם התאריך נופל בתוך תקופת נטילת כדורים. */
export function pillsCovering(periods, abs) {
    if (!Array.isArray(periods) || !Number.isFinite(abs)) return null;
    for (const p of periods) {
        if (abs >= p.startAbs && (p.endAbs === null || abs <= p.endAbs)) return p;
    }
    return null;
}

/**
 * כמה ימים מתוך הטווח [fromAbs, toAbs] נכללים בתקופת כדורים.
 * אלה הימים שאינם נמנים למניין העקירה `[ד"ט | עמ' 8]`.
 */
export function countPillDays(periods, fromAbs, toAbs) {
    if (!Array.isArray(periods) || periods.length === 0) return 0;
    if (!Number.isFinite(fromAbs) || !Number.isFinite(toAbs) || toAbs < fromAbs) return 0;
    let count = 0;
    for (const p of periods) {
        const start = Math.max(fromAbs, p.startAbs);
        const end = Math.min(toAbs, p.endAbs === null ? toAbs : p.endAbs);
        if (end >= start) count += end - start + 1;
    }
    return count;
}

/**
 * האם הראייה סומנה כמחמת כדורים (B3). הספר מנמק את עיכוב העקירה בכך
 * ש"ניכר בבירור שהפלגתה הארוכה מחמת הכדורים" `[ד"ט | עמ' 8]` — והסימון הזה
 * הוא הצהרת המשתמשת על אותו "ניכר בבירור".
 */
export function isPillSighting(reiya) {
    return !!(reiya && reiya.kind === 'pills');
}

/**
 * מוסיפה מספר חודשים עבריים לתאריך מוחלט, עם הגבלת היום לסוף החודש.
 * מניין ההנקה נמדד בחודשי לוח (כ"ד חודש), ולא במניין ימים גרידא.
 */
export function addHebrewMonths(abs, months) {
    const base = new HDate(abs);
    let year = base.getFullYear();
    let month = base.getMonth();
    let day = base.getDate();
    // סדר החודשים במספור: ניסן 1 ... אלול 6, תשרי 7 ... אדר 12/13. כלומר שנת
    // המספר מתחלפת במעבר מאלול לתשרי, ולא במעבר מאדר לניסן.
    for (let i = 0; i < months; i++) {
        if (month === 6) {
            month = 7;
            year++;
        } else if (month >= (HDate.isLeapYear(year) ? 13 : 12)) {
            month = 1;
        } else {
            month++;
        }
    }
    const daysInMonth = HDate.daysInMonth(month, year);
    if (day > daysInMonth) day = daysInMonth;
    return new HDate(day, month, year).abs();
}

/**
 * מנתחת את מצב החיים.
 *
 * @param {Object} params
 * @param {Object} params.life - המצב כפי שנשמר בהגדרות
 * @param {Array} params.reiyot - כל הראיות (עם `counted` ממנוע החזקה, אם הופעל)
 * @param {number} params.today - היום (abs) שלפיו נבחן המצב
 * @returns {Object} verdict
 */
export function analyzeLifeState({ life, reiyot, today }) {
    const raw = normalizeLifeState(life);
    // כשהחישוב כבוי בהגדרות — המצב מתנהג כאילו לא הוגדר, וזו דרך החזרה המדויקת
    // להתנהגות שלפני מנוע מצב החיים.
    const state = raw.enabled ? raw : defaultLifeState();
    const t = Number.isFinite(today) ? today : null;
    const sightings = (reiyot || []).slice().sort((a, b) => a.abs - b.abs);
    const lastSightingAbs = sightings.length ? sightings[sightings.length - 1].abs : null;
    const counted = sightings.filter(r => r.counted !== false);

    const statuses = [];
    const notes = [];
    const starts = [];
    // חלונות הסילוק: כל חלון הוא תקופה שבה הדין הושה — וממנה נגזרת החזרה
    // (js/silekReturn.js). חלון יכול להיסגר בזמן (לידה, כ"ד חודש) או להיות פתוח.
    const windows = [];

    // ---------- הריון ----------
    let pregnant = null;
    if (state.pregnancyAbs !== null) {
        const silekFromAbs = state.pregnancyAbs + PREGNANCY_SILEK_DAYS;
        const daysPregnant = t === null ? null : t - state.pregnancyAbs;
        // "עברו ימי העיבור": הסילוק של ההריון נמשך עד הלידה. תאריך לידה מאוחר
        // מן היום שבו הוכר העובר סוגר את החלון; ובלא תאריך לידה אין לדעת מתי
        // פסק ההריון, ולכן החלון נשאר פתוח (כהתנהגות שהיתה קודם).
        const closedAtAbs = state.birthAbs !== null && state.birthAbs > silekFromAbs ? state.birthAbs : null;
        // לידה שנזכרה לפני שחלפו תשעים יום — הסילוק לא חל מעולם.
        const neverBecame = state.birthAbs !== null && state.birthAbs <= silekFromAbs;
        const started = !neverBecame && t !== null && t >= silekFromAbs;
        const active = started && (closedAtAbs === null || t < closedAtAbs);
        if (started) {
            windows.push({
                id: 'pregnant',
                label: 'מעוברת',
                fromAbs: silekFromAbs,
                untilAbs: closedAtAbs,
                source: '[ד"ט | עמ\' 14] · [שט כ"ט | עמ\' 63, 66]'
            });
        }
        // שבוע ההריון ותאריך הלידה המשוער — הערכה כללית ולא קביעה הלכתית/רפואית
        // (ראו PREGNANCY_ESTIMATED_TERM_DAYS); מוצגים רק כל עוד לא נרשמה לידה.
        const stillPregnant = state.birthAbs === null;
        const gestationalWeek = (stillPregnant && daysPregnant !== null && daysPregnant >= 0)
            ? Math.floor(daysPregnant / 7) + 1
            : null;
        const dueDateAbs = stillPregnant ? state.pregnancyAbs + PREGNANCY_ESTIMATED_TERM_DAYS : null;

        pregnant = {
            active,
            started,
            conceptionAbs: state.pregnancyAbs,
            silekFromAbs,
            closedAtAbs,
            daysPregnant,
            firstTrimester: started === false && t !== null && t < silekFromAbs,
            daysLeft: t === null || t >= silekFromAbs ? 0 : silekFromAbs - t,
            gestationalWeek,
            dueDateAbs
        };
        if (active) starts.push({ id: 'pregnant', short: 'מעוברת', since: silekFromAbs });
        statuses.push({
            id: 'pregnant',
            short: 'מעוברת',
            active,
            label: active
                ? 'מעוברת — מסולקת דמים'
                : (started
                    ? 'מעוברת — עבר ההריון, וחוזרת לוסתה'
                    : 'מעוברת — בתוך ג\' החודשים הראשונים'),
            detail: active
                ? 'עברו תשעים יום מתחילת ההריון, ואינה חוששת לוסתות שהיו לה קודם שנסתלקה מדמים'
                : (started
                    ? 'עברו ימי העיבור, ומעתה היא חוזרת לחוש לוסתה שהיה לה קודם ההריון'
                    : 'בתוך ג\' החודשים הראשונים של ההריון עדיין חוששת לוסתות שהיו לה קודם'),
            source: '[ד"ט | עמ\' 14] · [שט כ"ט | עמ\' 63, 66, 71]'
        });
        if (pregnant.firstTrimester) {
            notes.push({
                level: 'strict',
                title: 'הריון — ג\' החודשים הראשונים',
                text: `עד ${new HDate(silekFromAbs).renderGematriya()} (תשעים יום מתחילת ההריון) אין סילוק דמים, והיא חוששת לוסתות שהיו לה קודם.`,
                source: '[שט כ"ט | עמ\' 63]'
            });
        }
    }

    // ---------- לידה והנקה ----------
    let nursing = null;
    if (state.birthAbs !== null || state.nursing) {
        const untilAbs = state.birthAbs !== null
            ? addHebrewMonths(state.birthAbs, NURSING_MONTHS)
            : null;
        // כברירת מחדל ננקטת ההחמרה שבספר — בזמננו מניקה אינה נחשבת מסולקת דמים.
        const withinWindow = untilAbs === null ? state.nursing : (t !== null && t < untilAbs);
        const active = state.nursingLenient && withinWindow;
        const fromAbs = state.birthAbs !== null ? state.birthAbs : t;
        // החלון נדחף משעת תחילתו — גם כשכבר תם, שאם לא כן לא ניתן לחשב את
        // החזרה ממנו (js/silekReturn.js).
        const windowStarted = state.nursingLenient && fromAbs !== null && (t === null || t >= fromAbs);
        if (windowStarted) {
            // סילוק הלידה וההנקה — כ"ד חודש, והחלון נסגר בתומם.
            windows.push({
                id: 'nursing',
                label: 'ילדה',
                fromAbs,
                untilAbs,
                source: '[שט כ\"ט | עמ\' 66]'
            });
        }
        if (active) starts.push({ id: 'nursing', short: 'ילדה', since: fromAbs });
        nursing = {
            active,
            birthAbs: state.birthAbs,
            untilAbs,
            lenient: state.nursingLenient,
            nursing: state.nursing,
            daysLeft: untilAbs === null || t === null ? null : Math.max(0, untilAbs - t)
        };
        statuses.push({
            id: 'nursing',
            short: 'מניקה',
            active,
            label: active
                ? 'לאחר לידה — כמסולקת דמים (לפי השיטה המקילה)'
                : 'לאחר לידה — אינה נחשבת מסולקת דמים',
            detail: active
                ? 'הופעלה השיטה המקילה: ימי הלידה וההנקה נחשבים סילוק דמים עד כ"ד חודש'
                : 'כברירת מחדל ננקטת שיטת הספר: בזמננו מניקה אינה מסולקת דמים, והיא חוששת כרגיל',
            source: '[שט כ"ה | עמ\' 18] · [שט כ"ט | עמ\' 66] · [ד"ט | עמ\' 14–15]'
        });
        notes.push({
            level: 'dispute',
            title: 'מניקה — מחלוקת שאינה מוכרעת',
            text: 'הספר כותב שבזמננו מניקה אינה נחשבת כמסולקת דמים כלל, ואילו "דעת טהרה" כתב שאף אם אינה מניקה את בנה הריהי מסולקת דמים. האפליקציה נוקטת כברירת מחדל כהחמרה, וההקלה מופעלת רק במפורש ולפי הוראת רב.',
            source: '[שט כ"ה | עמ\' 18] · [ד"ט | עמ\' 14–15]'
        });
    }

    // ---------- זקנה ----------
    let elderly = null;
    if (state.ageYears !== null) {
        const quietFromAbs = lastSightingAbs;
        const quietDays = quietFromAbs !== null && t !== null ? t - quietFromAbs : null;
        const reachedAge = state.ageYears >= ELDERLY_AGE;
        const isQuiet = quietFromAbs === null || (quietDays !== null && quietDays >= ELDERLY_QUIET_DAYS);
        const active = reachedAge && isQuiet;
        const since = quietFromAbs !== null ? quietFromAbs + ELDERLY_QUIET_DAYS : t;
        if (active && t !== null) {
            starts.push({ id: 'elderly', short: 'זקנה', since });
            // חלון זקנה — אין לו סוף קצוב בזמן.
            windows.push({
                id: 'elderly',
                label: 'זקנה',
                fromAbs: since,
                untilAbs: null,
                source: 'שו"ע קפ"ט סכ"ח · [שט ל\' | עמ\' 73]'
            });
        }
        elderly = {
            active,
            ageYears: state.ageYears,
            quietFromAbs,
            quietDays,
            neededDays: ELDERLY_QUIET_DAYS,
            since
        };
        statuses.push({
            id: 'elderly',
            short: 'זקנה',
            active,
            label: active ? 'זקנה — מסולקת דמים' : 'זקנה — טרם הושלמו ג\' עונות בלא ראייה',
            detail: active
                ? 'עברו עליה ג\' עונות (תשעים יום כל אחת) משהזקינה ולא ראתה'
                : 'טרם עברו עליה ג\' עונות בלא ראייה, ולכן אינה נחשבת מסולקת דמים',
            source: 'שו"ע קפ"ט סכ"ח · [שט ל\' | עמ\' 73]'
        });
        notes.push({
            level: 'dispute',
            title: 'שיעור הזקנה — מחלוקת',
            text: `שיעור הגיל שממנו נבחנת חזקת הזקנה שנוי במחלוקת בספר, והאפליקציה מבקשת את הגיל בשנים ומשתמשת בשיעור של ${ELDERLY_AGE} שנה, ובצירוף ג' עונות בלא ראייה. אין להסתמך על החישוב האוטומטי בלא הוראת רב.`,
            source: '[שט ל\' | עמ\' 75–76]'
        });
    }

    // ---------- קטנה ----------
    let minor = null;
    if (state.ageYears !== null && state.ageYears < MINOR_AGE_YEARS) {
        const countedCount = counted.length;
        const active = countedCount < MINOR_SIGHTINGS_TO_COUNT;
        if (active && t !== null) {
            starts.push({ id: 'minor', short: 'קטנה', since: t });
            windows.push({
                id: 'minor',
                label: 'קטנה',
                fromAbs: t,
                untilAbs: null,
                source: '[שט ל\' | עמ\' 73]'
            });
        }
        minor = { active, ageYears: state.ageYears, countedSightings: countedCount };
        statuses.push({
            id: 'minor',
            short: 'קטנה',
            active,
            label: active ? 'קטנה — מסולקת עד שתראה שלש פעמים' : 'קטנה — ראתה שלש פעמים, ודינה כשאר נשים',
            detail: active
                ? 'תינוקת שלא הגיעה לימי הנעורים, ואפילו ראתה שתי פעמים נחשבת מסולקת עד שתראה שלש פעמים'
                : 'ראתה שלש פעמים, ומעתה היא קובעת וסת כשאר נשים',
            source: '[שט ל\' | עמ\' 73]'
        });
    }

    // ---------- כדורים ----------
    const periods = state.pills;
    const pillsActivePeriod = t === null ? null : (pillsCovering(periods, t) || null);
    const pills = {
        configured: periods.length > 0,
        active: pillsActivePeriod !== null,
        currentType: pillsActivePeriod ? pillsActivePeriod.type : null,
        currentTypeLabel: pillsActivePeriod ? PILL_TYPES[pillsActivePeriod.type] : null,
        // האם חשש יום ההפסקה של הסוג הזה ניתן לחישוב (רוב הכדורים) או תלוי
        // בסדר הנטילה (אורגסט) `[שט כ"ז | עמ' 40]`.
        currentPauseRule: pillsActivePeriod ? pauseRuleOfPillType(pillsActivePeriod.type) : null,
        periods,
        covering: (abs) => pillsCovering(periods, abs),
        daysBetween: (fromAbs, toAbs) => countPillDays(periods, fromAbs, toAbs)
    };
    if (periods.length > 0) {
        statuses.push({
            id: 'pills',
            short: 'כדורים',
            active: false,
            label: pills.active ? 'נוטלת כדורים כעת' : 'מועדי נטילת כדורים מתועדים',
            detail: pills.active
                ? 'ימי הנטילה אינם נמנים למניין עקירת הוסת, וראייה המסומנת כמחמת כדורים אינה כמראה טבעי'
                : 'תקופות הנטילה שנתועדו משמשות לזיהוי ימים שאינם נמנים לעקירה',
            source: '[ד"ט | עמ\' 8] · [שט כ"ז | עמ\' 40–41]'
        });
        if (pills.active) {
            notes.push({
                level: 'info',
                title: 'כדורים — עיכוב עקירת הוסת',
                text: 'בזמן נטילת כדורים אין הוסת נעקרת מעצמה: הספר מנמק ש"לא עקרה וסתה כיון שניכר בבירור שהפלגתה הארוכה מחמת הכדורים", ולכן הימים האלה אינם נמנים למניין העקירה.',
                source: '[ד"ט | עמ\' 8]'
            });
        }
    }

    const activeStatuses = statuses.filter(s => s.active && s.id !== 'pills');
    // כל מצבי הסילוק תלויים בזמן, ולכן בלא יום לחשוב לפיו אין דין סילוק — והמנוע
    // מחזיר את ההתנהגות הרגילה במקום מצב בלתי עקבי (פטור מבדיקה בלי ביטול חששות).
    const silek = activeStatuses.length > 0 && t !== null;

    // ---------- חלונות הסילוק, והחזרה מהם ----------
    const startedWindows = t === null ? [] : windows.slice().sort((a, b) => a.fromAbs - b.fromAbs);
    const activeWindow = t === null ? null
        : (startedWindows.find(w => w.untilAbs === null || t < w.untilAbs) || null);
    const hasOpenWindow = startedWindows.some(w => w.untilAbs === null);
    const endedWindows = t === null ? []
        : startedWindows.filter(w => w.untilAbs !== null && t >= w.untilAbs);
    const dormancy = {
        windows: startedWindows,
        activeWindow,
        active: activeWindow !== null,
        // הסילוק נגמר: יש חלון שהיה, ואף אחד מהם אינו נמשך עוד.
        ended: startedWindows.length > 0 && activeWindow === null && !hasOpenWindow,
        labels: startedWindows.map(w => w.label),
        // הגבול שעד אליו חששותיה של ראייה מבוטלות. בעוד הסילוק נמשך — מראשיתו של
        // החלון הפעיל, שאם לא כן ראייה שבתוך הסילוק לא היתה מחילה את הדין
        // ("שראתה בזמן הסילוק... חוששת לה כדין וסת שאינו קבוע"); ומשנסתיים הסילוק
        // — מסופו, שאז אינה שבה אלא לוסתה הקבוע.
        upToAbs: activeWindow !== null
            ? activeWindow.fromAbs
            : (endedWindows.length > 0 && !hasOpenWindow
                ? Math.max(...endedWindows.map(w => w.untilAbs))
                : null),
        /**
         * האם ראייה זו אינה ראויה להעמיד וסת:
         *  (א) כל מה שלפני הסילוק — בעודה מסולקת אין וסת עומד לה (שו"ע סל"ד),
         *      וראיות שלפני הסילוק אין להן כוח לקבוע וסת חדשה, שהרי הוסת שהיה
         *      לה אז הוא זה שהיא שבה אליו;
         *  (ב) ראייה שבתוך סילוק **שנסתיים** — "ואף אם היו הראיות בסדר קבוע
         *      כקביעות וסת, לא קבעה לה וסת בראיות שראתה בימי הסילוק" `[שט כ"ט | עמ' 71]`.
         */
        disqualifiesEstablishment: (abs) => {
            if (startedWindows.length === 0) return false;
            if (abs <= startedWindows[0].fromAbs) return true;
            return startedWindows.some(w =>
                w.untilAbs !== null && abs > w.fromAbs && abs < w.untilAbs);
        }
    };
    // הגבול שבשימוש המנוע הישן — נשמר לשם תאימות (ולמקרה של סילוק פעיל הוא זהה).
    const silekSinceAbs = activeWindow !== null ? activeWindow.fromAbs : null;

    return {
        configured: isLifeConfigured(state),
        enabled: raw.enabled,
        state,
        statuses,
        notes,
        pregnant,
        nursing,
        elderly,
        minor,
        pills,
        silek,
        silekSinceAbs,
        dormancy,
        silekLabels: activeStatuses.map(s => s.short),
        exemptFromCheck: silek,
        exemptReason: silek
            ? `מסולקת דמים (${activeStatuses.map(s => s.short).join(', ')}) — פטורה מבדיקה`
            : null
    };
}

/**
 * שורה אחת לתצוגה במקום שאין פאנל מלא (למשל במודאל היום).
 */
export function lifeStateSummary(life) {
    if (!life || !life.configured || !life.silek) return '';
    const labels = (life.silekLabels || []).join(', ');
    return labels ? `מסולקת דמים — ${labels}` : 'מסולקת דמים';
}
