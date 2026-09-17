import { HDate } from '../hebcal.js';
import {
    analyzeChazaka, CHAZAKA_HORIZON_DAYS, describeVeset, hebDayOfMonth, hebWeekday,
    MEVUCHA_CODE, MIXED_ONA_CODE
} from './chazaka.js';
import { extensionOnot, EXTENSION_NOTE, previousOna, SAFEK_ONA_NOTE } from './reiyaDuration.js';
import { normalizeStringencies, stringencyOn } from './stringencies.js';
import { dilugDayFor, DILUG_CODE } from './vesetDilug.js';
import {
    analyzeAkirot, findPendingChecks, isConcernClarified, isConcernUprooted, extractChecks
} from './akira.js';
import { analyzeLifeState, isPillSighting } from './lifeState.js';
import { analyzeSilekReturn, isPillEraVeset, vesetKey } from './silekReturn.js';
import { analyzePillPause } from './pillPause.js';
import { analyzeBodyVeset, COMPOUND_MONTH_CODE, COMPOUND_HAFLAGAH_CODE } from './vesetGuf.js';
import { marksByDay, orZaruaExemptionFor, stainDays, DAY_MARK_RULES } from './dayMarks.js';

/** עומק בדיקה שמברר — משמש לבחינת רשומת הבדיקה של "פחד פתאום" (js/dayMarks.js). */
const DEEP_CHECK = 'deep';

/**
 * Helper to check if a year is leap in the Hebrew calendar.
 */
export function getMonthsInYear(year) {
    return HDate.isLeapYear(year) ? 13 : 12;
}

/**
 * Returns the Hebrew month following or preceding the given one,
 * adjusting the year across Rosh Hashanah.
 *
 * Hebrew month numbering (hebcal): Nisan=1..Elul=6, Tishrei=7..Adar=12/13.
 * Chronological order crosses the year number between Elul (6) and Tishrei (7).
 * @param {number} year
 * @param {number} month
 * @param {number} direction 1 = next month, -1 = previous month
 * @returns {{year: number, month: number}}
 */
export function shiftHebrewMonth(year, month, direction) {
    // The year NUMBER changes only between Elul (6) and Tishrei (7) - that is
    // Rosh Hashanah. Adar (II) -> Nisan stays inside the same year number,
    // and Nisan -> Adar (II) stays in the same year number as well.
    if (direction === 1 && month === 6) {
        return { year: year + 1, month: 7 };
    }
    if (direction === -1 && month === 7) {
        return { year: year - 1, month: 6 };
    }
    let m = month + direction;
    if (m > getMonthsInYear(year)) m = 1;  // Adar (II) -> Nisan, same year number
    if (m < 1) m = getMonthsInYear(year);  // Nisan -> Adar (II), same year number
    return { year: year, month: m };
}

/**
 * Builds the absolute day of `day` in `month`/`year`, or null when that date
 * does not exist. hebcal does NOT throw for such dates - it silently rolls the
 * overflow into the next month - so the built date is validated explicitly.
 */
function buildExactDay(day, month, year) {
    let d;
    try {
        d = new HDate(day, month, year);
    } catch (e) {
        return null;
    }
    if (d.getDate() !== day || d.getMonth() !== month || d.getFullYear() !== year) {
        return null; // rolled over - the day does not exist in that month
    }
    return d.abs();
}

/**
 * Absolute day of the 30th in the first following Hebrew month that has 30 days.
 */
function findNextThirtieth(year, month) {
    let cur = { year, month };
    for (let i = 0; i < 6; i++) {
        if (HDate.daysInMonth(cur.month, cur.year) === 30) {
            return buildExactDay(30, cur.month, cur.year);
        }
        cur = shiftHebrewMonth(cur.year, cur.month, 1);
    }
    return null;
}

/**
 * Resolves the "Yom Hachodesh" prishah for a sighting.
 *
 * Normal case - the same Hebrew day-of-month exists in the following month:
 * one date is returned.
 *
 * Disputed case - a sighting on the 30th while the next month has only 29 days.
 * The poskim disagree, and THREE dates are returned so that none of the views is
 * dropped silently (`docs/SPEC_DINIM_VESATOT.md` §2.1.1 and §9.3):
 *   1. the 29th (the last day) of that short month;
 *   2. the 30th of the first later month that has 30 days;
 *   3. the 1st of the following month - "בתורת ראש חודש" (day-of-teruah).
 * The third view is stated in the source for the case she saw on the 1st of the
 * next month: "**צריך לחוש לל' וא' בתורת ר"ח**" `[ד"ט | עמ' 4]`.
 *
 * The dates are returned sorted, so the board and the panel present them in
 * order; the user is told to ask a rabbi which view she follows.
 *
 * @param {HDate} hdate - the sighting date
 * @returns {{mode: 'single'|'disputed', entries: Array<{abs: number, label: string, code: string}>}}
 */
export function getYomHachodeshInfo(hdate) {
    const next = shiftHebrewMonth(hdate.getFullYear(), hdate.getMonth(), 1);
    const sameDay = buildExactDay(hdate.getDate(), next.month, next.year);

    if (sameDay !== null) {
        return { mode: 'single', entries: [{ abs: sameDay, label: 'יום החודש', code: 'יו"ח' }] };
    }

    // The day-of-month is missing in the next month (possible only for day 30).
    const entries = [];
    const shortMonthLastDay = buildExactDay(HDate.daysInMonth(next.month, next.year), next.month, next.year);
    if (shortMonthLastDay !== null) {
        entries.push({ abs: shortMonthLastDay, label: 'כ"ט בחודש החסר', code: 'יו"ח*' });
    }
    const laterThirtieth = findNextThirtieth(next.year, next.month);
    if (laterThirtieth !== null && laterThirtieth !== shortMonthLastDay) {
        entries.push({ abs: laterThirtieth, label: 'ל\' בחודש שלאחריו', code: 'יו"ח*' });
    }
    const nextMonthFirst = buildExactDay(1, next.month, next.year);
    if (nextMonthFirst !== null) {
        entries.push({ abs: nextMonthFirst, label: 'א\' בחודש הבא (בתורת ראש חודש)', code: 'יו"ח*' });
    }

    entries.sort((a, b) => a.abs - b.abs);
    return { mode: 'disputed', entries };
}

/**
 * Add a separation retirement event to the prishot object.
 */
function addPrishah(prishotObj, absDay, reason, onaType, codeAbbr) {
    if (!prishotObj[absDay]) {
        prishotObj[absDay] = [];
    }
    // Prevent duplicate entries for the same reason and ona
    const alreadyExists = prishotObj[absDay].some(p => p.code === codeAbbr && p.ona === onaType);
    if (!alreadyExists) {
        prishotObj[absDay].push({ reason: reason, ona: onaType, code: codeAbbr });
    }
}

/**
 * Apply the Or Zarua custom (retirement one shift before the expected separation).
 */
function applyOrZarua(prishotObj, baseAbs, baseOna, reasonDesc) {
    if (baseOna === 'day') {
        // One shift before Day of day X is Night of day X
        addPrishah(prishotObj, baseAbs, reasonDesc, 'night', 'עוא"ז');
    } else {
        // One shift before Night of day X is Day of day X-1
        addPrishah(prishotObj, baseAbs - 1, reasonDesc, 'day', 'עוא"ז');
    }
}

/**
 * Translates a FIXED veset into the dates it stands for.
 *
 * Unlike a veset that is not fixed - which is observed once, from the sighting
 * that produced it - a fixed veset keeps standing in its place every month (or
 * every haflagah) until it is uprooted. Uprooting is a separate step, so here
 * the veset is projected forward for the display horizon only;
 * CHAZAKA_HORIZON_DAYS is a rendering limit, not a halachic one.
 *
 * @param {{kind: 'month'|'haflagah', ona: string, dayOfMonth?: number, span?: number, spanLabel?: number}} veset
 * @param {{abs: number, hdate: HDate}} lastCounted - the sighting the veset is counted from
 * @param {number} [horizonDays]
 * @param {{fromAbs?: number, code?: string, label?: string}} [options] - fromAbs: project
 *        from this date onwards rather than from the anchor's following month. It is used
 *        for a veset that RETURNS after a dormancy (js/silekReturn.js): the anchor is her
 *        sighting from before the dormancy, and the first occurrence at or after its end
 *        must not be skipped. code/label: replace the default marking code and the
 *        "וסת קבוע" wording - used by the compound veset (js/vesetGuf.js), which is
 *        projected onto a date but is neither a חודש nor a הפלגה veset of the chazaka.
 * @returns {Array<{abs: number, ona: string, code: string, reason: string}>}
 */
export function projectFixedVeset(veset, lastCounted, horizonDays = CHAZAKA_HORIZON_DAYS, options = {}) {
    const entries = [];
    if (!lastCounted) return entries;

    const onaText = veset.ona === 'night' ? 'עונת לילה' : 'עונת יום';
    const monthCode = options.code || 'וק"ח';
    const haflagahCode = options.code || 'וק"ה';
    const label = options.label || 'וסת קבוע';
    // The horizon is measured from whichever is later: the anchor sighting, or the day
    // the veset returns to (a dormancy may be longer than the display horizon).
    const fromAbs = Number.isFinite(options.fromAbs) ? options.fromAbs : null;
    const horizon = Math.max(lastCounted.abs, fromAbs === null ? lastCounted.abs : fromAbs) + horizonDays;
    // A projected date counts only if it is not before the day the veset returns.
    const inRange = (abs) => fromAbs === null || abs >= fromAbs;

    if (veset.kind === 'month') {
        const day = veset.dayOfMonth !== undefined && veset.dayOfMonth !== null
            ? veset.dayOfMonth
            : lastCounted.hdate.getDate();
        let cur = fromAbs === null
            ? shiftHebrewMonth(lastCounted.hdate.getFullYear(), lastCounted.hdate.getMonth(), 1)
            : { year: new HDate(fromAbs).getFullYear(), month: new HDate(fromAbs).getMonth() };

        while (true) {
            const monthStart = buildExactDay(1, cur.month, cur.year);
            if (monthStart === null || monthStart > horizon) break;

            const exact = buildExactDay(day, cur.month, cur.year);
            if (exact !== null) {
                if (inRange(exact)) {
                    entries.push({
                        abs: exact,
                        ona: veset.ona,
                        code: monthCode,
                        reason: `${label} — יום החודש (${onaText})`
                    });
                }
            } else {
                // The day-of-month is missing here (day 30 in a 29-day month).
                // The poskim disagree which day to observe - both are marked, as
                // in getYomHachodeshInfo().
                const shortLast = buildExactDay(HDate.daysInMonth(cur.month, cur.year), cur.month, cur.year);
                if (shortLast !== null && shortLast <= horizon && inRange(shortLast)) {
                    entries.push({
                        abs: shortLast,
                        ona: veset.ona,
                        code: options.code ? monthCode : 'וק"ח*',
                        reason: `${label} — יום החודש, מחלוקת בחודש חסר (כ"ט בחודש החסר, ${onaText})`
                    });
                }
                const laterThirtieth = findNextThirtieth(cur.year, cur.month);
                if (laterThirtieth !== null && laterThirtieth <= horizon && inRange(laterThirtieth)) {
                    entries.push({
                        abs: laterThirtieth,
                        ona: veset.ona,
                        code: options.code ? monthCode : 'וק"ח*',
                        reason: `${label} — יום החודש, מחלוקת בחודש חסר (ל' בחודש שלאחריו, ${onaText})`
                    });
                }
                // הדעה השלישית — א' של החודש הבא, "בתורת ראש חודש" `[ד"ט | עמ' 4]`.
                const nextMonthFirst = buildExactDay(1, cur.month, cur.year);
                if (nextMonthFirst !== null && nextMonthFirst <= horizon && inRange(nextMonthFirst)) {
                    entries.push({
                        abs: nextMonthFirst,
                        ona: veset.ona,
                        code: options.code ? monthCode : 'וק"ח*',
                        reason: `${label} — יום החודש, מחלוקת בחודש חסר (א' בחודש הבא, בתורת ראש חודש, ${onaText})`
                    });
                }
            }

            cur = shiftHebrewMonth(cur.year, cur.month, 1);
        }
    } else if (veset.kind === 'haflagah') {
        const step = veset.span;
        for (let abs = lastCounted.abs + step; abs <= horizon; abs += step) {
            if (!inRange(abs)) continue;
            entries.push({
                abs,
                ona: veset.ona,
                code: haflagahCode,
                reason: `${label} — הפלגה (${veset.spanLabel} ימים, ${onaText})`
            });
        }
    } else if (veset.kind === 'week') {
        // וסת השבוע: אותו יום בשבוע, כל שבעה ימים `[שט ל"ו | עמ' 137]`.
        const weekCode = options.code || 'וק"ש';
        const dayLabel = veset.weekdayLabel || hebWeekday(veset.weekday);
        for (let abs = lastCounted.abs + 7; abs <= horizon; abs += 7) {
            if (!inRange(abs)) continue;
            entries.push({
                abs,
                ona: veset.ona,
                code: weekCode,
                reason: `${label} — וסת השבוע (יום ${dayLabel}, ${onaText})`
            });
        }
    } else if (veset.kind === 'dilug') {
        // וסת הדילוג: יום אחד בכל חודש, לפי מקומו במחזור — "וחוששת לעולם ט"ו
        // לחודש זה וט"ז לחודש זה וי"ז לחודש זה" `[שט ל"ז | עמ' 149]`. המחזור
        // מתקדם יום אחד בכל חודש בין שראתה ובין שלא — "חוששת לחודש הבא כאלו
        // ראתה ביום הוסת".
        const cycle = (veset.cycle || []).slice();
        const label0 = options.label || 'וסת קבוע';
        let cur = fromAbs === null
            ? shiftHebrewMonth(lastCounted.hdate.getFullYear(), lastCounted.hdate.getMonth(), 1)
            : { year: new HDate(fromAbs).getFullYear(), month: new HDate(fromAbs).getMonth() };
        let index = 0;

        while (cycle.length) {
            const monthStart = buildExactDay(1, cur.month, cur.year);
            if (monthStart === null || monthStart > horizon) break;
            const day = dilugDayFor(veset, index);
            const exact = buildExactDay(day, cur.month, cur.year);
            if (exact !== null && inRange(exact)) {
                entries.push({
                    abs: exact,
                    ona: veset.ona,
                    code: DILUG_CODE,
                    reason: `${label0} — וסת הדילוג (יום ${hebDayOfMonth(day)} בחודש, ${onaText}; ${veset.label})`
                });
            }
            index++;
            cur = shiftHebrewMonth(cur.year, cur.month, 1);
        }
    } else if (veset.kind === 'mevucha') {
        // וסת לימים המתחלפים: אותם שני ימים בכל חודש, ואילו היום המפסיק אינו נחשש
        // — "חוששת לכ"ז וכ"ט ואינה חוששת לכ"ח" `[שט ל"ב | עמ' 107–108]`.
        const mevuchaCode = options.code || MEVUCHA_CODE;
        const days = (veset.days || []).slice().sort((a, b) => a - b);
        let cur = fromAbs === null
            ? shiftHebrewMonth(lastCounted.hdate.getFullYear(), lastCounted.hdate.getMonth(), 1)
            : { year: new HDate(fromAbs).getFullYear(), month: new HDate(fromAbs).getMonth() };

        while (true) {
            const monthStart = buildExactDay(1, cur.month, cur.year);
            if (monthStart === null || monthStart > horizon) break;
            days.forEach(day => {
                const exact = buildExactDay(day, cur.month, cur.year);
                if (exact === null || !inRange(exact)) return;
                entries.push({
                    abs: exact,
                    ona: veset.ona,
                    code: mevuchaCode,
                    reason: `${label} — יום ${hebDayOfMonth(day)} בחודש (${onaText})`
                });
            });
            cur = shiftHebrewMonth(cur.year, cur.month, 1);
        }
    }

    return entries;
}

/**
 * The core calculation engine of the Purification Board.
 * @param {Object} db - The user's database from localStorage.
 * @param {boolean} isOrZaruaEnabled - Whether Or Zarua custom is enabled.
 * @param {{chazaka?: boolean, akirot?: boolean, today?: number, life?: Object}} [options]
 *        - chazaka: run the fixed-veset engine (default on). When it is off, the
 *        three concerns are shown for every sighting exactly as before the
 *        chazaka engine existed. - akirot: run the uprooting engine (default
 *        on) - today: the abs day the uprooting test is measured against
 *        (defaults to the real today; supplied by tests). - life: the life state
 *        from the settings (pregnancy, birth and nursing, age, pills) - see
 *        js/lifeState.js.
 * @returns {Object} An object containing the computed dates (nekiim, tevilot,
 *          prishot, suppressed, uprooted, pendingChecks, checkExemption), the list
 *          of reiyot, and the chazaka, akirot, life, silekReturn, pillPause,
 *          bodyVeset and fright verdicts, together with `dayMarks` (marks by day,
 *          js/dayMarks.js) and `orZaruaExemptions` (the Or Zarua onot that were
 *          waived).
 */
export function calculateEngine(db, isOrZaruaEnabled, options = {}) {
    let computed = { nekiim: [], tevilot: [], prishot: {}, suppressed: [], uprooted: [], pendingChecks: [] };
    let absDays = Object.keys(db).map(Number).sort((a, b) => a - b);
    let reiyot = [];

    // Extract all bleeding events (reiyah) in chronological order
    absDays.forEach(day => {
        if (db[day] && db[day].type === 'reiyah') {
            reiyot.push({ 
                abs: day, 
                ona: db[day].ona, 
                hdate: new HDate(day) 
            });
        }
    });

    // Sighting type (B3) and bleeding continuation (B5). The chazaka engine must
    // know which sightings count toward a veset, so both fields travel with the reiya.
    reiyot.forEach(r => {
        const entry = db[r.abs] || {};
        r.kind = entry.kind || 'regular';
        r.durationDays = entry.durationDays;
        r.closedFountain = entry.closedFountain;
        // B2 — מיחושי וסת הגוף (js/vesetGuf.js). הקודים נוסעים עם הראייה, כי
        // הווסת המורכב נבחן על צירוף של היום והמיחוש באותה ראייה.
        r.signs = Array.isArray(entry.signs) ? entry.signs.slice() : [];
        // ספק עונה (B6): הראייה נרשמה באחת העונות, ומסופקת אם לא היתה בעונה
        // הקודמת `[ד"ט | עמ' 1]`.
        r.safekOna = entry.safekOna === true;
    });

    // --- מתגי החומרא (§5ב — js/stringencies.js) ---
    // מחלוקות שהספר מציג, שאינן ננעלות בקוד. בלא הגדרה מפורשת — ברירת המחדל
    // שבמודול (השיטה הפשוטה), ולכן כל חומרא מופעלת ביודעין.
    const stringencies = normalizeStringencies(options.stringencies);

    // --- The reference day ---
    // Needed both by the life-state engine (days of pregnancy, quiet seasons) and by
    // the uprooting engine. It is the real today unless a test supplies one.
    const today = Number.isFinite(options.today) ? options.today : new HDate().abs();

    // --- Chazaka: what was ESTABLISHED, and which sightings count toward it ---
    const chazaka = options.chazaka === false ? null : analyzeChazaka(reiyot);
    if (chazaka) {
        const countedAbs = new Set(chazaka.counted.map(r => r.abs));
        const excludedByAbs = new Map(chazaka.excluded.map(e => [e.abs, e]));
        reiyot.forEach(r => {
            r.counted = countedAbs.has(r.abs);
            r.exclusion = excludedByAbs.get(r.abs) || null;
            r.establishing = chazaka.established.some(v => v.establishedBy.indexOf(r.abs) !== -1);
        });
    }

    // --- Life state (מצב חיים): מסולקת דמים ---
    // Pregnancy, birth and nursing, age, and pills (js/lifeState.js). Without it the
    // engine would demand a check from a woman who is exempt from checking, and would
    // keep presenting concerns that no longer apply to her (SPEC §5, פער 4).
    const life = analyzeLifeState({ life: options.life, reiyot, today });
    // The boundary up to which her concerns are void: while the dormancy lasts - its
    // start, and once it is over - its end (`lifeState.js`, `dormancy.upToAbs`).
    const dormancyUpToAbs = life.dormancy ? life.dormancy.upToAbs : null;
    const silekSuppress = dormancyUpToAbs !== null;
    // "אינה חוששת לוסתות שהיו לה קודם שנסתלקה מדמים" `[ד"ט | עמ' 14]`: a sighting at
    // or before the day she became מסולקת דמים no longer produces concerns.
    const isSuppressedBySilek = (reiya) => silekSuppress && reiya.abs <= dormancyUpToAbs;
    const silekSuppressedText = life.silek
        ? 'בוטל מחמת מסולקת דמים — אינה חוששת לוסתות שהיו לה קודם שנסתלקה מדמים'
        : 'בוטל — חששות שהיו לה קודם הסילוק אינן חוזרות, שהרי אינה שבה אלא לוסתה הקבועה';

    // --- Return from the dormancy (יציאה מן הסילוק) ---
    // What she returns to once the dormancy (pregnancy / nursing / pills) is over:
    // her FIXED veset from before it - veset ha-yamim immediately, veset haflagah
    // only once she sees again `[שט כ"ט | עמ' 71]`; and after stopping pills she
    // returns to her first veset even if the pills established another
    // `[שט כ"ז | עמ' 42]` (js/silekReturn.js).
    const silekReturn = chazaka ? analyzeSilekReturn({ reiyot, life, today }) : null;
    const restoredVesets = silekReturn ? silekReturn.restored : [];
    const returnedKeys = silekReturn ? silekReturn.returnedKeys : new Set();
    const pillFromAbs = silekReturn && silekReturn.interlude && silekReturn.interlude.pills
        ? silekReturn.interlude.pills.startAbs
        : null;

    // --- וסת הגוף ווסת מורכב (B2 — js/vesetGuf.js) ---
    // "כל שקבעה לה שלשה פעמים הרי זה וסת" `[שט ל"ט | עמ' 158]`, ו"אם בא וסת הגוף
    // לזמן ידוע... קבעה לה וסת לזמן ולמיחוש הוסת" `[שט ל"ט | עמ' 160]`.
    //
    // הווסת המורכב **אינו** נכנס ל-`standingVesets`: המקור מלמד שעליה לחוש גם לעונה
    // בינונית אף כשיש לה וסת מורכב `[שט ל"ט | עמ' 165]`, ולכן הוא מוסיף סימון על היום
    // ואינו מפעיל את מסלול "הוסת הקבוע מחליף את שאר החששות" (ראו docs/DECISIONS.md).
    //
    // --- מיחוש בלא ראייה (`type: 'sign'`) ---
    // המיחוש עצמו אוסר — "משעה שבאו המיחושים אסורה כדין שעת הוסת" — ולכן הוא נרשם
    // אף בלא ראייה: הוא נספר לוסת הגוף (`js/vesetGuf.js`), ותובע בדיקה מתוארכת
    // ("אסורה עד שתבדוק"). יומו של הבדיקה שנשמרת עליו (`type: 'check'` עם
    // `standaloneSign`) הוא המברר.
    const signRecords = [];
    absDays.forEach(day => {
        const entry = db[day] || {};
        const signs = Array.isArray(entry.signs)
            ? entry.signs.filter(code => typeof code === 'string' && code.length > 0)
            : [];
        if (!signs.length) return;
        if (entry.type !== 'sign' && entry.standaloneSign !== true) return;
        signRecords.push({
            abs: day,
            ona: entry.ona,
            signs,
            checked: entry.type === 'check'
        });
    });

    const bodyVeset = analyzeBodyVeset({
        reiyot,
        counted: chazaka ? chazaka.counted : undefined,
        signRecords
    });
    bodyVeset.displaced = [];
    /** ימי המיחוש שתועדו בלא ראייה — לתצוגה בממשק ולמצב ה"אסורה עד שתבדוק". */
    computed.standaloneSigns = bodyVeset.standaloneSigns || [];
    /** האם וסת קבועה של ימים זהה לוסת מורכב שנקבעה — ואז הוסת המורכב תופס את מקומה. */
    const compoundReplaces = (veset) => (bodyVeset.compound || []).some(c =>
        c.kind === veset.kind
        && (c.kind === 'month' ? c.dayOfMonth === veset.dayOfMonth : c.span === veset.span)
        && c.ona === veset.ona);
    if (bodyVeset.configured) {
        bodyVeset.compound.forEach(c => {
            // וסת מורכב שראיותיו אינן ראויות להעמיד וסת — מחמת מסולקת דמים —
            // "מעוברת ומניקה אינה חוששת לוסתה הראשון" `[שט כ"ט | עמ' 69]`. הוא מוצג
            // כמה שהוסר, ולא נעלם מן הפאנל.
            if ((c.establishedBy || []).some(a => life.dormancy.disqualifiesEstablishment(a))) {
                bodyVeset.displaced.push({ compound: c, why: 'silek', text: silekSuppressedText });
                return;
            }
            const veset = {
                kind: c.kind,
                ona: c.ona,
                dayOfMonth: c.dayOfMonth,
                span: c.span,
                spanLabel: c.spanLabel
            };
            const anchor = { abs: c.lastAbs, hdate: new HDate(c.lastAbs) };
            projectFixedVeset(veset, anchor, CHAZAKA_HORIZON_DAYS, {
                code: c.kind === 'month' ? COMPOUND_MONTH_CODE : COMPOUND_HAFLAGAH_CODE,
                label: `וסת מורכב — יום + מיחוש ${c.signLabel}`
            }).forEach(entry => {
                // `establishedConcern`: וסת שנקבעה אינה נעקרת במעבר זמן בודד, ולכן
                // היא פטורה ממסלול העקירה של החששות שאינם קבועים (סעיף 1c).
                addPrishah(computed.prishot, entry.abs, entry.reason, entry.ona, entry.code);
                (computed.prishot[entry.abs] || []).forEach(p => {
                    if (p.code === entry.code) p.establishedConcern = true;
                });
                // "אך לעונת האור זרוע אין צריכה לחשוש אם עדיין לא בא המיחוש"
                // `[שט כ"ז | עמ' 49]` — ולכן במכוון אין כאן applyOrZarua.
            });
        });
    }

    // Which establishing vesets take part in the analysis. A veset that the dormancy
    // disqualifies - and a veset of a kind that RETURNS (the returned one replaces
    // it, re-anchored at the end of the dormancy) - is not analysed as standing;
    // the removals are reported rather than dropped silently.
    const establishedForAnalysis = [];
    const displacedVesets = [];
    if (chazaka) {
        chazaka.established.forEach(veset => {
            if (returnedKeys.has(vesetKey(veset))) {
                const key = vesetKey(veset);
                const returnedNow = restoredVesets.some(r => vesetKey(r) === key);
                displacedVesets.push({
                    veset,
                    why: 'restored',
                    text: returnedNow
                        ? 'הוחלף בוסת הקבועה שחזרה לאחר הסילוק — היא עומדת במקומה'
                        : 'בוטל — וסת ההפלגה שחזרה מן הסילוק אין חוששין לה עד שתחזור לראות'
                });
                return;
            }
            if (pillFromAbs !== null && isPillEraVeset(veset, pillFromAbs)
                && restoredVesets.some(r => r.kind === veset.kind)) {
                displacedVesets.push({
                    veset,
                    why: 'pills',
                    text: 'בוטל — אף אם על ידי הכדורים נקבע וסת אחר, אחר שהפסיקה חוזרת לוסתה הראשון'
                });
                return;
            }
            // וסת המורכב תופס את מקומה של וסת הימים הגרידא: כשכל הראיות הקובעות באו
            // ביחד עם המיחוש — "הוכח" שהקביעות היא לשילוב של היום והמיחוש, ולא ליום
            // לבדו ("קודם שקבעה ואנו באים לעמוד על טבע ראיותיה... אם אירע שראתה ביום בלי
            // הקפיצה, הוכח שהיום גורם לה" — ומכאן ההיפך) `[שט מ' | עמ' 180]`. הדבר מוצג
            // למשתמשת, שהרי בכל מקרה היום עצמו מסומן בסימון "וסת מורכב" `[שט כ"ז | עמ' 49]`.
            if (compoundReplaces(veset)) {
                displacedVesets.push({
                    veset,
                    why: 'compound',
                    text: 'הוחלף בוסת מורכב (יום + מיחוש) — הקביעות היא לשילוב של היום והמיחוש, ' +
                        'ולכן אין כאן וסת קבועה של ימים, ואין עונת אור זרוע לפני היום'
                });
                return;
            }
            establishedForAnalysis.push(veset);
        });
    }
    restoredVesets.forEach(v => establishedForAnalysis.push(v));

    // --- וסת הדילוג (§3.4–3.5; js/vesetDilug.js) ---
    // הזיהוי מוחזר תמיד — כדי שהמשתמשת תדע שהתבנית קיימת ותביאה לרב (§9.8: "על ידי
    // שהתאריכים ערוכים לפניו יקל להבחין בזה") — אבל **חשש אין בו** עד שהמתג דלוק:
    // "כיון דבוסתות לא שכיחות אין חוששים אלא א"כ הוקבעו באופן ודאי" `[ד"ט | עמ' 7]`.
    const dilugCandidates = (chazaka && chazaka.dilugCandidates) || [];
    computed.dilugCandidates = dilugCandidates;
    if (stringencyOn(stringencies, 'dilug')) {
        dilugCandidates.forEach(candidate => establishedForAnalysis.push(Object.assign({}, candidate)));
    }

    // --- "צירוף למפרע" (§3.1; js/chazaka.js) ---
    // "אם חזרה וראתה בוסת הארוך, כגון שראתה לל' ולל' ולכ' ושוב לל' אחר הכ', קבעה
    // לה וסת לל'... כיון שוסת קצר אינו עוקר וסת הארוך" `[שט ל"ג | עמ' 112]`.
    // הספר מגדיר את הכלל "רק לחומרא בעלמא ולא מעיקרא דדינא", ולכן — כדרך כל
    // מחלוקת במערכת הזו — הוא מוצג לתועלת המשתמשת, ואינו נחשב לווסת אלא במתג.
    const chiburCandidate = (chazaka && chazaka.chibur) || null;
    computed.chiburCandidate = chiburCandidate;
    if (chiburCandidate && stringencyOn(stringencies, 'chiburLemafrea')) {
        establishedForAnalysis.push(Object.assign({}, chiburCandidate));
    }

    // --- סימוני היום (js/dayMarks.js) ---
    // שמצאה כתם, שאירע לה פחד פתאום, שיצאה לדרך, שחל ליל חופה, או שהיא בחרדה
    // מתמשכת. הסימונים אינם "סוג אירוע": הם יושבים על רשומת היום מכל סוג.
    const dayMarks = marksByDay(db);
    //
    // ימי הכתם. הכתם **אינו** ראייה — "והכתם כמי שאינו לענין וסתות" `[שט ל"ה | עמ' 127]`:
    // אינו נספר לקיבוע, אינו מפסיק את מנין השלשים יום מן הראייה הקודמת, ואינו מוסיף
    // חשש. מקומו היחיד במנוע הוא בשאלת **העקירה** — ובמחלוקת (מתג `stainUproots`).
    const stainAbs = stainDays(dayMarks);

    // --- Uprooting: what is no longer a concern at all ---
    // The uprooting engine measures "did the veset time pass without a sighting",
    // and walks the due times up to `today` (defined above).
    const useAkirot = options.akirot !== false;
    const checks = useAkirot ? extractChecks(db) : [];

    // A returned veset is anchored at the end of the dormancy, not at her sighting
    // from before it: for haflagah that anchor is the first sighting after the
    // dormancy, and for a veset of days the projection starts at the dormancy's end.
    const anchorOf = (veset) => (veset && Number.isFinite(veset.restoredAnchorAbs)
        ? { abs: veset.restoredAnchorAbs, hdate: new HDate(veset.restoredAnchorAbs) }
        : (chazaka ? chazaka.lastCounted : null));
    const projectFor = (veset, anchor, horizonDays) => {
        const anchorToUse = anchorOf(veset) || anchor;
        const extra = veset && Number.isFinite(veset.restoredFromAbs)
            ? { fromAbs: veset.restoredFromAbs }
            : {};
        return projectFixedVeset(veset, anchorToUse, horizonDays, extra);
    };

    // The analysis itself looks at every due time up to today, so it projects with
    // a horizon that is guaranteed to reach it (the DISPLAY projection stays at the
    // standard horizon).
    const akirot = useAkirot ? analyzeAkirot({
        reiyot,
        established: establishedForAnalysis,
        lastCounted: chazaka ? chazaka.lastCounted : null,
        checks,
        today,
        // Pills delay uprooting: the days of taking them are not counted toward the
        // haflagah interval, and a sighting marked as caused by pills does not break
        // the "no sighting since" condition `[ד"ט | עמ' 8]`.
        pillsDays: (fromAbs, toAbs) => life.pills.daysBetween(fromAbs, toAbs),
        isPillSighting,
        // מחלוקת הבדיקה באיחור (הב"י והחוות דעת) — מתג `lateBedika`
        // `[שט מ"א | עמ' 182–183]`.
        lateBedika: stringencyOn(stringencies, 'lateBedika'),
        // מחלוקת הכתם (הפרישה / שערי טוהר) — מתג `stainUproots`
        // `[שט ל"ה | עמ' 127–128]`.
        stainAbs,
        stainUproots: stringencyOn(stringencies, 'stainUproots'),
        anchorOf,
        project: (veset, lastCounted) => projectFor(
            veset, lastCounted, Math.max(CHAZAKA_HORIZON_DAYS, today - lastCounted.abs + 60))
    }) : null;

    // A fixed veset stands IN PLACE OF the three ordinary concerns: a woman with
    // a real fixed veset is not concerned for ona beinonit (§2.4), and the other
    // concerns are replaced by her own veset (§3.7). A veset that was UPROOTED no
    // longer stands - she is back to the ordinary concerns (§4.1-4.2).
    const fixedVesets = akirot ? akirot.active.map(f => f.veset) : establishedForAnalysis;

    // "מעוברת ומניקה אינה חוששת לוסתה הראשון אפילו היה לה וסת קבוע" (שו"ע סל"ד)
    // `[שט כ"ט | עמ' 69]`: a veset does not stand when a sighting that established it
    // is disqualified by the dormancy - either one from before it (while she is
    // מסולקת no veset stands for her), or one from within a dormancy that has ENDED
    // ("לא קבעה לה וסת בראיות שראתה בימי הסילוק" `[שט כ"ט | עמ' 71]`). A veset that
    // RETURNED from the dormancy stands by definition, and the analysis above already
    // reported the legacy vesets it replaced.
    const silekSuppressesVeset = (veset) => veset.restored !== true &&
        (veset.establishedBy || []).some(a => life.dormancy.disqualifiesEstablishment(a));
    const standingVesets = fixedVesets.filter(v => !silekSuppressesVeset(v));
    const suppressOthers = standingVesets.length > 0;

    // Two vesets of the same kind may now stand together: the one that RETURNED from
    // the dormancy, and a new one established from her sightings after it. The source
    // says of a changed pattern that she is not concerned for the first "כיון שנשתנו
    // ראיותיה לוסת השני" `[שט ל"ה | עמ' 123]`, and on the other hand that after the
    // silek she RETURNS to her first veset `[שט כ"ט | עמ' 71]`. The app does not
    // decide between them: it shows both (the stricter side) and DISCLOSES the
    // question, rather than dropping a concern on its own.
    if (silekReturn) {
        standingVesets.filter(v => v.restored === true).forEach(restored => {
            const twin = standingVesets.find(v => v !== restored && v.restored !== true && v.kind === restored.kind);
            if (!twin) return;
            silekReturn.notes.push({
                level: 'dispute',
                title: 'וסת שחזרה מן הסילוק לצד וסת שנקבעה אחריו',
                text: `הוסת שחזרה (${describeVeset(restored)}) והוסת שנקבעה לאחר הסילוק (${describeVeset(twin)}) `
                    + 'שתיהן מוצגות זו לצד זו, ואין האפליקציה מכריעה ביניהן. הספר כתב על שינוי הראיות '
                    + 'שאינה חוששת לוסת הראשון כשנשתנו ראיותיה לוסת השני, ומאידך כתב שחוזרת לוסתה הראשון. '
                    + 'יש לשאול רב מה נוהג למעשה.',
                source: '[שט כ"ט | עמ\' 71] · [שט ל"ה | עמ\' 123]'
            });
        });
    }

    // Where the ordinary concerns go: normally straight to the calendar; when a
    // fixed veset exists they go to the side, so the UI can DISCLOSE that they
    // were set aside rather than drop them silently. Concerns of a מסולקת דמים go
    // to their own side for the same reason.
    let sink = suppressOthers ? {} : computed.prishot;
    const silekSink = {};

    // --- עונות מעורבות (mixed onas) ---
    // "ואם ראתה שלש פעמים ביום והרביעית בלילה... **חוששת ביום ובלילה** מפני חשש
    // הוסת הראשון ומפני חשש השינוי שהוא האחרון" `[שט ל"ג | עמ' 112]`. The pattern
    // that was completed is mirrored to the OPPOSITE ona at the same veset time:
    // without it the board would carry only the newest ona ("השינוי"), and the
    // "וסת הראשון" side of the din would be missing.
    const mixedOnaByAbs = new Map();
    ((chazaka && chazaka.mixedOna) || []).forEach(m => {
        if (!mixedOnaByAbs.has(m.lastAbs)) mixedOnaByAbs.set(m.lastAbs, []);
        mixedOnaByAbs.get(m.lastAbs).push(m);
    });
    const onaName = (ona) => (ona === 'night' ? 'עונת לילה' : 'עונת יום');

    // --- משיכת הראייה (§9.1 — js/reiyaDuration.js) ---
    // "עונת הוסת נחשבת העונה שהתחילה לראות בה **אף אם נמשכה ראייתה כמה ימים**.
    // וכשנמשכה ראיתה גם בעונה הסמוכה **צריכה לחוש גם לסמוכה כשיעור שנמשכה ראייתה**.
    // **ורק אם נמשכה ד' ימים נוספים אין צריך לחוש אלא לתחילת ראייתה**"
    // `[ד"ט | עמ' 1]` (שו"ע קפ"ד ה').
    //
    // המשך הדימום נרשם על הראייה המאוחרת (`closedFountain === false`), ואילו
    // מניין החששות חייב להימנות מן הראייה שבה החל הדימום — היא הראייה שהמנוע
    // סימן כמקור המיזוג (`exclusion.mergedInto`).
    const durationDaysByStartAbs = new Map();
    reiyot.forEach(r => {
        if (r.closedFountain !== false) return;
        const days = Number(r.durationDays);
        if (!Number.isFinite(days) || days <= 1) return;
        const mergedInto = r.exclusion && r.exclusion.reason === 'continuation'
            ? r.exclusion.mergedInto
            : null;
        const startAbs = mergedInto === null ? r.abs : mergedInto;
        durationDaysByStartAbs.set(startAbs, Math.max(durationDaysByStartAbs.get(startAbs) || 0, days));
    });

    // --- הפסק טהרה, שבעה נקיים, וליל הטבילה (§2.6) ---
    //
    // זה מחושב כאן, **לפני** חששות הראייה, מפני שאחד מהם תלוי בו: עונת אור זרוע
    // נדחית מפני ליל טבילה — "ליל טבילה שחל בעונת אור זרוע — מותרת, ותבדוק קו"ת"
    // `[שט כ"ז | עמ' 49]` (js/dayMarks.js).
    //
    // **משמעות `computed.tevilot`: היום שהלילה שלו הוא ליל הטבילה.** שבעת הימים
    // הנקיים הם hefsek+1 … hefsek+7, והטבילה היא בלילה שאחריהם — הוא הלילה שפותח את
    // היום hefsek+8. וזו גם הצבתו בלוח: בראש המשבצת של אותו יום (ראו `js/ui.js`) —
    // לפי הכלל שהלילה שלפני היום נכתב במעל למספר היום.
    let hefsekim = absDays.filter(day => db[day] && db[day].type === 'hefsek');
    const tevilotSet = new Set();

    hefsekim.forEach(hefsekAbs => {
        // Check if there is any interrupting event (reiyah or another hefsek) during the 7 clean days (hefsekAbs < day <= hefsekAbs + 7)
        let isInterrupted = absDays.some(day =>
            db[day] &&
            (db[day].type === 'reiyah' || db[day].type === 'hefsek') &&
            day > hefsekAbs &&
            day <= hefsekAbs + 7
        );

        if (isInterrupted) {
            return; // Skip this hefsek entirely as it was canceled/invalidated
        }

        // Mark 7 Clean Days (Nekiim)
        for (let i = 1; i <= 7; i++) {
            computed.nekiim.push(hefsekAbs + i);
        }

        // Expected Mikvah Immersion Date (the night that opens day hefsek+8)
        const expectedTevilah = hefsekAbs + 7;

        // Find if there is a manually recorded tevilah (immersion) on or after the expected day (before any subsequent reiyah/hefsek)
        let nextInterrupt = absDays.find(day =>
            db[day] &&
            (db[day].type === 'reiyah' || db[day].type === 'hefsek') &&
            day > hefsekAbs + 7
        );

        let manualTevilah = absDays.find(day =>
            db[day] &&
            db[day].type === 'tevilah' &&
            day > hefsekAbs &&
            (!nextInterrupt || day < nextInterrupt)
        );

        // הטבילה שתועדה ננעלת על היום שתיעדה אותו המשתמשת — היא סימנה **את הלילה**
        // של אותו יום; ובלא תיעוד — היום שלאחר היום השביעי. מי שתיעדה כמנהג הקודם
        // על יום היום השביעי עצמו נקראת כמי שסימנה את ליל הטבילה, ומוצבת במקומה.
        let tevilahAbs;
        if (manualTevilah === undefined) {
            tevilahAbs = expectedTevilah + 1;
        } else if (manualTevilah <= expectedTevilah) {
            tevilahAbs = expectedTevilah + 1;
        } else {
            tevilahAbs = manualTevilah;
        }
        computed.tevilot.push(tevilahAbs);
        tevilotSet.add(tevilahAbs);
    });

    // הסימונים שהפטירו עונת אור זרוע — נאספים ומוצגים, ולא נעלמים בשקט.
    const orZaruaExemptions = [];
    /**
     * האם עונת אור זרוע שהתווספה על (shiftAbs, shiftOna) נפטרת.
     *
     * הפטורים `[שט כ"ז | עמ' 49]`: ליל טבילה · ליל החופה / בעילת מצוה · יוצא
     * לדרך. וליל שבת והעונה שלפני יום הל' **אינם** פטורים — ולכן אין להם סימון.
     */
    const isOrZaruaExempt = (shiftAbs, shiftOna, reasonDesc) => {
        const exemption = orZaruaExemptionFor({
            shiftAbs, shiftOna, marks: dayMarks, tevilot: tevilotSet
        });
        if (!exemption) return false;
        orZaruaExemptions.push(Object.assign({ abs: shiftAbs, ona: shiftOna, addedReason: reasonDesc }, exemption));
        return true;
    };
    /** עונת אור זרוע, עם הפטורים — במקום `applyOrZarua` בכל מקום שהדין נוהג בו. */
    const addOrZarua = (prishotObj, baseAbs, baseOna, reasonDesc) => {
        const shift = baseOna === 'day'
            ? { abs: baseAbs, ona: 'night' }
            : { abs: baseAbs - 1, ona: 'day' };
        if (isOrZaruaExempt(shift.abs, shift.ona, reasonDesc)) return;
        applyOrZarua(prishotObj, baseAbs, baseOna, reasonDesc);
    };

    // 1. Calculate Retirement Days (Beinonit, Yom Hachodesh, Haflagah, Or Zarua)
    for (let i = 0; i < reiyot.length; i++) {
        let current = reiyot[i];
        let onaText = current.ona === 'day' ? 'עונת יום' : 'עונת לילה';

        // A sighting from before the silek produces nothing any more; whatever it
        // would have produced is collected aside and reported as set-aside.
        const daySink = isSuppressedBySilek(current) ? silekSink : sink;
        // A7 — "אמנם אינה צריכה לחשוש אלא לעונת הוסת עצמה, אבל לעונת האור זרוע
        // אין צריכה לחשוש" `[שט כ"ז | עמ' 40]`: a sighting that was marked as
        // caused by pills (B3) does not add the Or Zarua shift before its own time.
        const noOrZarua = isPillSighting(current);
        // "שראתה בזמן הסילוק... חוששת לה כדין וסת שאינו קבוע" `[שט כ"ט | עמ' 69]`:
        // a sighting during the silek DOES create concerns again.
        const seenDuringSilek = silekSuppress && !isSuppressedBySilek(current);
        const silekSeenNote = seenDuringSilek ? ' · מסולקת דמים שראתה — מחלוקת, יש לשאול רב' : '';

        // עונות החשש של הראייה הזו. עונת ההתחלה תמיד; ואליה מצטרפות —
        // (א) **העונה הקודמת**, כשהראייה סומנה "ספק עונה" (B6) והמתג המחמיר דלוק
        //     `[ד"ט | עמ' 1]`; (ב) **עונות המשיכה** שהדימום נמשך בהן, עד ג' עונות
        //     (`js/reiyaDuration.js`). לכל עונה הנוסח שלה, כדי שכל תוספת תוסבר בלוח.
        const durationDays = durationDaysByStartAbs.get(current.abs);
        const sightingOnot = [{ ona: current.ona, note: '' }];
        if (stringencyOn(stringencies, 'safekOnaBoth') && current.safekOna) {
            const previous = previousOna(current.abs, current.ona);
            if (previous) sightingOnot.push({ ona: previous.ona, note: ` · ${SAFEK_ONA_NOTE}` });
        }
        if (durationDays) {
            extensionOnot(current.abs, current.ona, durationDays).forEach(ext =>
                sightingOnot.push({ ona: ext.ona, note: ` · ${EXTENSION_NOTE}` }));
        }
        /** חשש של הראייה — בכל עונות החשש שלה, עם הנוסח של כל אחת. */
        const addForSighting = (abs, reason, code) => sightingOnot.forEach(o =>
            addPrishah(daySink, abs, reason + o.note, o.ona, code));
        /** עונת אור זרוע לכל עונה של הראייה; `allow=false` לדינים שאין להם מנהג זה. */
        const orZaruaForSighting = (abs, reasonDesc, allow) => {
            if (!isOrZaruaEnabled || noOrZarua || allow === false) return;
            sightingOnot.forEach(o => addOrZarua(daySink, abs, o.ona, reasonDesc));
        };

        // החשש שבעונה שכנגד, של אותה תבנית שהגיעה אליה הראייה האחרונה.
        const mixedHere = mixedOnaByAbs.get(current.abs) || [];
        const mirrorOna = mixedHere.length ? (current.ona === 'night' ? 'day' : 'night') : null;
        const addMixedMirror = (abs, kind) => {
            const m = mixedHere.find(x => x.kind === kind);
            if (!m || mirrorOna === null) return;
            // הזמן שנוסף הוא זמן הוסת של אותה תבנית — ולא זמן אחר של אותה ראייה.
            if (kind === 'month' && current.hdate.getDate() !== m.dayOfMonth) return;
            if (kind === 'haflagah' && abs !== current.abs + m.span) return;
            addPrishah(daySink, abs,
                `עונות מעורבות — ג' ראיות ב${onaName(m.firstOna)} והרביעית ב${onaName(m.lastOna)} `
                + '(חוששת ליום וללילה)', mirrorOna, MIXED_ONA_CODE);
            if (isOrZaruaEnabled && !noOrZarua) {
                addOrZarua(daySink, abs, mirrorOna, 'אור זרוע לעונות מעורבות');
            }
        };

        // --- Ona Beinonit (Day 30 = Onah cycle of 29 days) ---
        let beinonitAbs = current.abs + 29;
        addForSighting(beinonitAbs, `עונה בינונית (${onaText})${silekSeenNote}`, 'עו"ב');
        orZaruaForSighting(beinonitAbs, `אור זרוע לעונה בינונית`);

        // --- Ona Beinonit (Day 31 = Onah cycle of 30 days) ---
        let beinonit31Abs = current.abs + 30;
        addForSighting(beinonit31Abs, `עונה בינונית - ל"א (${onaText})${silekSeenNote}`, 'עו"ל');
        // "מן הדין אין צריכה [חשוש בעונת אור זרוע בליל יום הל']… ולמעשה יש להחמיר"
        // `[שט כ"ז | עמ' 49]` — ולכן מנהג זה נשלט במתג, ונדלק כברירת מחדל.
        orZaruaForSighting(beinonit31Abs, `אור זרוע לעונה בינונית (ל"א)`,
            stringencyOn(stringencies, 'orZaruaDay31'));

        // --- Yom Hachodesh (Same Hebrew day in next month) ---
        // When the day is missing in the next month, all the disputed dates are
        // marked because the poskim disagree - see getYomHachodeshInfo().
        const yomHachodesh = getYomHachodeshInfo(current.hdate);
        current.yomHachodesh = yomHachodesh;
        yomHachodesh.entries.forEach(entry => {
            const reason = yomHachodesh.mode === 'disputed'
                ? `יום החודש - מחלוקת (${entry.label}, ${onaText})`
                : `יום החודש (${onaText})`;
            addForSighting(entry.abs, reason, entry.code);
            orZaruaForSighting(entry.abs, `אור זרוע ליום החודש`);
            addMixedMirror(entry.abs, 'month');
        });

        // --- Haflagah (Days interval since previous bleeding) ---
        // "לוסת ההפלגה לא שייך לחשוש אם ראתה רק פעם אחת כיון שאין כאן הפלגה,
        // אמנם אם ראתה שתי ראיות הרי יש ביניהן הפלגה" `[שט כ"ט | עמ' 69]`: during the
        // silek a haflagah is counted only between two sightings that are both in it.
        const haflagahPairIsInSilek = !seenDuringSilek || isSuppressedBySilek(reiyot[i - 1]);
        if (i > 0 && haflagahPairIsInSilek) {
            let prev = reiyot[i - 1];
            // מחלוקת מנין ההפלגה (מתג `haflagahFromEnd`, js/stringencies.js): ברירת
            // המחדל היא מנין **מתחילת הראייה** — "עונת הוסת נחשבת העונה שהתחילה
            // לראות בה" `[ד"ט | עמ' 1]`; ובמתג — מסוף הראייה, כשהדימום נמשך ימים.
            const prevDuration = durationDaysByStartAbs.get(prev.abs) || 1;
            const haflagahFromEnd = stringencyOn(stringencies, 'haflagahFromEnd');
            const prevAnchor = haflagahFromEnd ? prev.abs + prevDuration - 1 : prev.abs;
            let diff = current.abs - prevAnchor;
            const fromEndNote = haflagahFromEnd && prevDuration > 1
                ? ` · מנין מסוף הראייה (הראייה הקודמת נמשכה ${prevDuration} ימים)`
                : '';

            // The halachic count of a haflagah INCLUDES both endpoints: the day of
            // the earlier sighting counts as day 1, and the day of the later sighting
            // is counted too. A sighting on 1 Tishrei followed by one on 28 Tishrei is
            // therefore called "a haflagah of 28 days", although the day-difference is
            // 27. [דעת טהרה, פרק ו | עמ' 4]
            //
            // This affects the LABEL ONLY. The date to watch is still abs + diff,
            // because the count starts from the later sighting itself ("וסופרת את
            // הימים מכ"ח בחודש וכ"ח בכלל").
            const halachicSpan = diff + 1;
            let nextHaflagahAbs = current.abs + diff;

            addForSighting(nextHaflagahAbs, `הפלגה (${halachicSpan} ימים, ${onaText})${fromEndNote}`, 'עו"ה');
            orZaruaForSighting(nextHaflagahAbs, `אור זרוע לעונת הפלגה`);
            addMixedMirror(nextHaflagahAbs, 'haflagah');

            current.haflagahDiff = halachicSpan;
            current.nextHaflagahDate = new HDate(nextHaflagahAbs);
        }
    }

    // 1a2. מסולקת דמים: concerns that arose before the silek are set aside - with
    // the explanation, not silently `[ד"ט | עמ' 14]`.
    if (silekSuppress) {
        Object.keys(silekSink).forEach(abs => {
            silekSink[abs].forEach(p => {
                computed.suppressed.push({
                    abs: Number(abs),
                    ona: p.ona,
                    code: p.code,
                    reason: p.reason,
                    why: 'silek',
                    text: silekSuppressedText
                });
            });
        });

        establishedForAnalysis.filter(silekSuppressesVeset).forEach(veset => {
            computed.suppressed.push({
                abs: null,
                ona: veset.ona,
                code: 'וק"ב',
                reason: describeVeset(veset),
                why: 'silek',
                text: life.silek
                    ? 'בוטל מחמת מסולקת דמים — מעוברת ומניקה אינה חוששת לוסתה הראשון אפילו היה לה וסת קבוע'
                    : 'בוטל — ראייה שבתוך ימי הסילוק אינה קובעת וסת, וחוזרת דוקא לוסתה שהיתה קבועה קודם הסילוק'
            });
        });
    }

    // 1a3. Vesets that the return from the dormancy displaced: the one that RETURNS
    // stands in its place (re-anchored at the dormancy's end), and after pills she
    // returns to her FIRST veset `[שט כ"ז | עמ' 42]` `[שט כ"ט | עמ' 71]`.
    displacedVesets.forEach(({ veset, why, text }) => {
        computed.suppressed.push({
            abs: null,
            ona: veset.ona,
            code: 'וק"ב',
            reason: describeVeset(veset),
            why,
            text
        });
    });

    // 1b. When a fixed veset was established, replace the ordinary concerns.
    if (suppressOthers) {
        // Record what was set aside, so nothing vanishes without an explanation.
        Object.keys(sink).forEach(abs => {
            sink[abs].forEach(p => {
                computed.suppressed.push({
                    abs: Number(abs),
                    ona: p.ona,
                    code: p.code,
                    reason: p.reason,
                    text: 'בוטל מכוח וסת קבוע — הוסת הקבוע מחליף את שאר החששות'
                });
            });
        });

        // Mark the fixed veset itself. It stands every month / every haflagah until
        // it is uprooted (3 due times with a proper check, or - for a haflagah - the
        // passing of span*3-2 days; see js/akira.js).
        const lastCounted = chazaka.lastCounted;
        standingVesets.forEach(veset => {
            projectFor(veset, lastCounted, CHAZAKA_HORIZON_DAYS).forEach(entry => {
                addPrishah(computed.prishot, entry.abs, entry.reason, entry.ona, entry.code);
                if (isOrZaruaEnabled) {
                    addOrZarua(computed.prishot, entry.abs, entry.ona, 'אור זרוע לוסת קבוע');
                }
            });
        });
    }

    // 1c. Uprooting of the ORDINARY concerns: a veset time that passed without a
    // sighting is uprooted immediately `[שט ל"ג | עמ' 111]`. The dates stay on the
    // board - they are the woman's own record - but marked as no longer applying,
    // and they stop being an obligation to check.
    // ולדעת החולקים אף וסת שאינו קבוע אינו נעקר בלא בדיקה "שאין הוסת נעקר
    // אלא כשבדקה ולא ראתה" `[שט מ"א | עמ' 182]` — וזהו **מתג חומרא** (§5ב):
    // "עונת וסת שאינו קבוע שעברה ולא ראתה בה — נעקרה מיד" `[שט ל"ג | עמ' 111]`
    // הוא ברירת המחדל, "אבל אם עבר הוסת אף אם לא בדקה כלל לא מספקינן לה בטומאה"
    // `[שט ל"א | עמ' 85]`.
    const requireCheckToUproot = stringencyOn(stringencies, 'checkUprootNonFixed');
    if (akirot && !suppressOthers) {
        Object.keys(computed.prishot).map(Number).sort((a, b) => a - b).forEach(abs => {
            const list = computed.prishot[abs];
            // A fixed veset's own due times are NOT uprooted this way - they need
            // the three-times-and-a-check route (js/akira.js), and a compound veset
            // (יום + מיחוש) is established the same way `[שט מ' | עמ' 180]`.
            if (list.some(p => p.code.indexOf('וק') === 0 || p.establishedConcern)) return;
            if (!isConcernUprooted({ abs }, reiyot, today)) return;
            // החומרא: הזמן שנעקר מן הדין אינו נעקר עד שתיבדק בדיקה כדין.
            if (requireCheckToUproot && list.some(p =>
                !isConcernClarified(computed.prishot, { abs, ona: p.ona, code: p.code }, reiyot, checks,
                    { lateBedika: stringencyOn(stringencies, 'lateBedika') }))) return;

            list.forEach(p => {
                p.uprooted = true;
                p.reason = `${p.reason} · נעקר (עבר הזמן ולא ראתה) `;
                computed.uprooted.push({ abs, ona: p.ona, code: p.code, reason: p.reason });
            });
        });
    }

    // A passed veset time with no proper check has not been CLARIFIED: the din is
    // that she is forbidden to her husband until she checks `[שט כ"ד | עמ' 7]`.
    // Safety state, not a stringency - and it applies whether or not a fixed
    // veset is standing.
    if (akirot) {
        if (life.exemptFromCheck) {
            // מסולקת דמים פטורה מבדיקה `[שט כ"ה | עמ' 17–18]`. The exemption is
            // disclosed rather than silent, so the absence of a demand is explained.
            computed.checkExemption = { exempt: true, reason: life.exemptReason };
        } else {
            const baseline = suppressOthers
                ? (akirot.pendingChecks || []).slice()
                : findPendingChecks(computed.prishot, reiyot, checks, today,
                    { lateBedika: stringencyOn(stringencies, 'lateBedika') });

            // 1c2. וסת מורכבת (יום + מיחוש) תובעת בדיקה על זמנה בכל מצב.
            //
            // היא אינה מסתלקת מפני וסת קבועה של ימים — ומכאן שגם כשוסת כזו עומדת
            // (ואז זמני הבדיקה באים מ-`akirot` בלבד) חייבת הבדיקה להיות נדרשת על יום
            // המורכב שעבר. "שצריכה לחשוש באותו היום אף קודם שבא המיחוש" `[שט כ"ז | עמ' 49]`,
            // ולהלכה "בוסת הגוף אף כשאינו קבוע ועבר הוסת ולא ראתה אסורה עד שתבדוק"
            // `[שט ל"ט | עמ' 160]` — ולכן גם היא נדרשת בבדיקה כדין ולא בקינוח `[שט מ"א | עמ' 182]`.
            const compoundConcerns = {};
            Object.keys(computed.prishot).forEach(abs => {
                const list = (computed.prishot[abs] || []).filter(p => p.establishedConcern);
                if (list.length) compoundConcerns[abs] = list;
            });
            const bodyPendings = findPendingChecks(compoundConcerns, reiyot, checks, today,
                { lateBedika: stringencyOn(stringencies, 'lateBedika') })
                .map(p => Object.assign({}, p, {
                    kind: 'body',
                    reason: p.reason + ' · ולהלכה אף בוסת הגוף שאינה קבועה: אסורה עד שתבדוק, '
                        + 'והבדיקה המבררת היא כדין — בעומק ובחו"ס [שט ל\"ט | עמ\' 160]'
                }));
            const bodyKeys = new Set(bodyPendings.map(p => `${p.abs}|${p.ona}|${p.code}`));
            computed.pendingChecks = bodyPendings
                .concat(baseline.filter(p => !bodyKeys.has(`${p.abs}|${p.ona}|${p.code}`)))
                .sort((a, b) => a.abs - b.abs);
        }
    }

    // 1c3. חרדה ובעיתותא (§5.9 — js/dayMarks.js).
    //
    // "מה שחרדה מסלקת את הדמים הוא דוקא בדאגה ופחד **שאינו בא פתאום**, אבל
    // **ביעתותא** דהיינו פחד ובהלה הבאים פתאום גורמים להיפך — לביאת הדם"
    // `[שט כ"ז | עמ' 42]`.
    //
    // ומכאן שני דינים שונים לחלוטין:
    //   * **פחד פתאום (ביעתותא)** — יש לחוש שמא בא דם בלא הרגשה. ולמעשה — "אסור
    //     לבעלה לבוא עליה **עד שישאלנה אם הרגישה**"; והאם צריכה בדיקה — מחלוקת
    //     החת"ס והגר"ש קלוגר, והיא נשלטת במתג `frightBedika` (js/stringencies.js).
    //   * **חרדה מתמשכת** — מסלקת את הדמים. זהו טבע הדמים ולא דין שמסלק חששות,
    //     ולכן המנוע **אינו** מבטל מחמתו חששות של ראיות שתועדו; הוא מוצג כמידע.
    const frightDays = [];
    const anxietyDays = [];
    dayMarks.forEach((marks, abs) => {
        if (marks.indexOf('fright') !== -1) frightDays.push(abs);
        if (marks.indexOf('anxiety') !== -1) anxietyDays.push(abs);
    });
    frightDays.sort((a, b) => a - b);
    anxietyDays.sort((a, b) => a - b);

    const requireFrightBedika = stringencyOn(stringencies, 'frightBedika');
    const openFrightDays = [];
    const settledFrightDays = [];
    frightDays.forEach(abs => {
        // מה שמברר את היום: שראתה בו, או שבדקה בו בדיקה כדין (קינוח לבד אינו מברר
        // `[שט מ"א | עמ' 182]`).
        const sighting = reiyot.some(r => r.abs === abs);
        const properCheck = checks.some(c => c.abs === abs && c.depth === DEEP_CHECK);
        const wipeOnly = !properCheck && checks.some(c => c.abs === abs);
        const resolved = sighting || properCheck;
        const item = {
            abs, sighting, properCheck, wipeOnly, resolved,
            demandsBedikah: requireFrightBedika && !resolved,
            dayExemptFromCheck: !!life.exemptFromCheck
        };
        (resolved ? settledFrightDays : openFrightDays).push(item);
    });

    /** מה שהמנוע אומר על "פחד פתאום" — לתצוגה בפאנל ולתביעת הבדיקה. */
    const fright = {
        days: frightDays,
        open: openFrightDays,
        settled: settledFrightDays,
        demandsBedikah: requireFrightBedika,
        anxietyDays,
        rule: DAY_MARK_RULES.fright,
        anxietyRule: DAY_MARK_RULES.anxiety
    };
    if (useAkirot && requireFrightBedika && !life.exemptFromCheck && openFrightDays.length) {
        openFrightDays.forEach(f => {
            computed.pendingChecks.push({
                abs: f.abs,
                ona: (db[f.abs] && db[f.abs].ona) || 'day',
                code: 'בהלה',
                kind: 'fright',
                reason: 'פחד פתאום (ביעתותא) שתועד ולא נברר — "ביעתותא... גורמים להיפך, לביאת הדם", '
                    + 'ולדעת הגר\'\'ש קלוגר צריכה בדיקה. יש לבדוק בדיקה כדין — בעומק ובחו"ס '
                    + '[שט כ\"ז | עמ\' 42]'
            });
        });
        computed.pendingChecks.sort((a, b) => a.abs - b.abs);
    }

    // 1d. The pause-day concern (חשש יום ההפסקה בכדורים, A5 — js/pillPause.js).
    // "טבעם של הכדורים... שאחר שמפסיקה ליטול הכדורים רואה מיד אחר שני ימים עד
    // חמשה ימים" `[שט כ"ז | עמ' 40`]: the first day is permitted, and from the
    // second on she must separate `[שט כ"ז | עמ' 42]`; and once she has seen on a
    // given day after a pause, she is concerned for that same day next time
    // `[שט כ"ז | עמ' 40]`.
    //
    // It is added AFTER the pending checks and the uprooting on purpose: this din is
    // a stringency of SEPARATION ("יש להחמיר לפרוש"), not a check obligation, so it
    // neither creates an "אסורה עד שתבדוק" demand nor replaces the other concerns —
    // "אין זה וסת קבוע גמור... ויש להחמיר שדינה גם כאשה שאין לה וסת קבוע"
    // `[שט כ"ז | עמ' 41]`.
    const pillPause = analyzePillPause({ life, reiyot, today });
    if (pillPause.configured) {
        pillPause.concerns.forEach(c => {
            addPrishah(computed.prishot, c.abs, c.reason, c.ona, c.code);
        });
    }

    // The vesets that actually STAND: a veset that was uprooted (js/akira.js) does not,
    // and neither does one that a מסולקת דמים no longer worries about [שט כ"ט | עמ' 69].
    // The UI must show this list, not the raw `akirot.active`, or it would announce a
    // veset as standing after the engine had stopped applying it.
    return {
        computed,
        reiyot,
        chazaka,
        akirot,
        life,
        silekReturn,
        pillPause,
        bodyVeset,
        standingVesets,
        // מה שמוצג מן הסימונים: ימי הסימון, פטורי עונת אור זרוע, ודין הפחד והחרדה.
        dayMarks,
        stainAbs,
        orZaruaExemptions,
        fright
    };
}
