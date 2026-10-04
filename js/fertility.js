/**
 * חלון ביוץ ופוריות (`docs/SPEC_FERTILITY_INSIGHTS.md`, פרק א').
 *
 * כלי עזר בלבד: מחשב הערכה סטטיסטית של יום הביוץ וחלון הפוריות מתוך לוח השנה
 * הקיים, ומזהה "עקרות הלכתית" (ביוץ המוערך כחל לפני ליל הטבילה). **כבוי כברירת
 * מחדל**, ואינו נוגע במנוע ההלכתי (`js/calculations.js`) — קורא בלבד מתוך
 * `engineData` המוכן (חתימת הפונקציה מוגדרת באפיון §5).
 *
 * הבהרה רפואית והלכתית (§2 באפיון) — מוצגת בכל מקום שבו מוצג חלון הפוריות.
 */

export const FERTILITY_DISCLAIMER =
    'המידע המוצג מתבסס על מודלים סטטיסטיים של לוח השנה. חישוב זה הינו משוער בלבד, ' +
    'ואינו מהווה תחליף לייעוץ רפואי, בדיקות מעבדה (ערכות ביוץ/אולטרסאונד), או אמצעי מניעה בטוח.';

const DEFAULT_LUTEAL_PHASE = 14;
const MIN_LUTEAL_PHASE = 11;
const MAX_LUTEAL_PHASE = 16;
const DEFAULT_CYCLE_LENGTH = 28;
const MAX_HAFLAGOT_FOR_AVERAGE = 6;
// הפרש בין ההפלגה הקצרה לארוכה מבין אלה שנאספו, שמעליו נחשב "מחזור משתנה בקיצוניות" (§3.6).
const VARIANCE_THRESHOLD_DAYS = 15;

/**
 * ברירות המחדל/נרמול הגדרות המשתמשת (§3.5). שדה חסר = ברירת המחדל שלו, כדי
 * שהוספת שדה עתידי לא תדרוש הגירת נתונים (כמו מתגי החומרא).
 */
export function normalizeFertilitySettings(settings) {
    const s = settings || {};
    let lutealPhase = Number(s.lutealPhase);
    if (!Number.isFinite(lutealPhase)) lutealPhase = DEFAULT_LUTEAL_PHASE;
    lutealPhase = Math.min(MAX_LUTEAL_PHASE, Math.max(MIN_LUTEAL_PHASE, Math.round(lutealPhase)));

    let fixedCycleLength = Number(s.fixedCycleLength);
    if (!Number.isFinite(fixedCycleLength) || fixedCycleLength <= 0) fixedCycleLength = DEFAULT_CYCLE_LENGTH;

    return {
        enabled: s.enabled === true,
        lutealPhase,
        cycleBasis: s.cycleBasis === 'fixed' ? 'fixed' : 'auto',
        fixedCycleLength: Math.round(fixedCycleLength),
        conflictAlert: s.conflictAlert !== false
    };
}

/** ראייה תקפה למניין ההפלגות של חלון הפוריות: לא אונס ולא בתקופת כדורים (§3.2). */
function isValidSighting(r) {
    return !!r && r.kind !== 'ones' && r.kind !== 'pills' && r.counted !== false;
}

/**
 * הפלגות (המניין ההלכתי, כולל שני הקצוות) בין כל שתי ראיות תקפות עוקבות.
 * מעדיפה את `haflagahDiff` שכבר חישב המנוע ההלכתי לראייה (`js/calculations.js:919`),
 * ורק כשהוא חסר (למשל זוג שדולג עליו בגלל סילוק) מחשבת ישירות בין שתי הראיות
 * התקפות — בהתאמה מדויקת ל"מסננת ראיות אונס, פצעים, ותקופות כדורים" (§3.2).
 */
function validHaflagot(reiyot) {
    const all = (reiyot || []).slice().sort((a, b) => a.abs - b.abs);
    const gaps = [];
    let prevValid = null;
    let prevValidIndex = -1;
    all.forEach((r, i) => {
        if (!isValidSighting(r)) return;
        if (prevValid !== null) {
            // `haflagahDiff` שחישב המנוע מתייחס תמיד לשכן הקודם **במערך המלא** — ולכן
            // מהימן רק כשלא דולגה ראייה לא-תקפה ביניהם (למשל ones/pills). כשדולגה,
            // יש לחשב ישירות בין שתי הראיות התקפות עצמן.
            const adjacent = i === prevValidIndex + 1;
            const span = (adjacent && Number.isFinite(r.haflagahDiff))
                ? r.haflagahDiff
                : (r.abs - prevValid.abs + 1);
            gaps.push(span);
        }
        prevValid = r;
        prevValidIndex = i;
    });
    return gaps;
}

/** וסת הפלגה קבוע, אם המנוע ההלכתי כבר קבע כזה (§3.2 שלב 1, סעיף א'). */
function fixedHaflagahVeset(engineData) {
    const list = (engineData && engineData.standingVesets) || [];
    const found = list.find(v => v && v.kind === 'haflagah');
    return found ? found.spanLabel : null;
}

/** האם יש הריון פתוח (נרשם ולא נסגר בלידה) — כיבוי אוטומטי, בלתי תלוי בסף הסילוק ההלכתי. */
function hasOpenPregnancy(engineData) {
    const state = engineData && engineData.life && engineData.life.state;
    return !!(state && state.pregnancyAbs !== null && state.birthAbs === null);
}

/** האם נוטלת כדורים כעת (מבוסס `js/lifeState.js`, כבר תלוי-תאריך). */
function pillsActiveNow(engineData) {
    return !!(engineData && engineData.life && engineData.life.pills && engineData.life.pills.active);
}

/** ליל הטבילה של המחזור הנוכחי (זה שנפתח בראייה האחרונה), אם כבר נרשם הפסק בו (§3.3). */
function currentCycleTevilahAbs(engineData, lastReiyahAbs) {
    const tevilot = (engineData && engineData.computed && engineData.computed.tevilot) || [];
    const relevant = tevilot.filter(abs => abs > lastReiyahAbs).sort((a, b) => a - b);
    return relevant.length ? relevant[0] : null;
}

function emptyResult(disabledReason, settings) {
    return {
        enabled: false,
        disabledReason,
        settings,
        disclaimer: FERTILITY_DISCLAIMER,
        basis: null,
        cycleLengthUsed: null,
        lutealPhaseUsed: null,
        cycleVariable: false,
        varianceDays: null,
        lastReiyahAbs: null,
        nextReiyahAbs: null,
        ovulationAbs: null,
        ovulationRangeAbs: null,
        fertileStartAbs: null,
        fertileEndAbs: null,
        peakAbs: null,
        windowDays: [],
        tevilahAbs: null,
        conflict: null,
        conflictMessage: null,
        note: null
    };
}

/**
 * מחשב את חלון הפוריות והביוץ המשוער (§3.2-3.3).
 *
 * @param {Object} db - מסד הנתונים השמור (לא בשימוש ישיר כרגע — `engineData.reiyot`
 *   כבר בנוי ממנו — נשמר בחתימה כדי להתאים לאפיון §5 ולשימושים עתידיים).
 * @param {Object} engineData - תוצאת `calculateEngine` המלאה.
 * @param {Object} settings - הגדרות המשתמשת (§3.5).
 * @returns {Object} FertilityResult
 */
export function calculateFertilityWindow(db, engineData, settings) {
    const s = normalizeFertilitySettings(settings);
    if (!s.enabled) return emptyResult('off', s);
    if (hasOpenPregnancy(engineData)) return emptyResult('pregnant', s);
    if (pillsActiveNow(engineData)) return emptyResult('pills', s);

    const reiyot = (engineData && engineData.reiyot) || [];
    if (reiyot.length === 0) return emptyResult('no-data', s);
    const lastReiyahAbs = reiyot.slice().sort((a, b) => a.abs - b.abs)[reiyot.length - 1].abs;

    let basis, cycleLengthUsed, cycleVariable = false, varianceDays = null;
    let hLow = null, hHigh = null;
    let note = null;

    if (s.cycleBasis === 'fixed') {
        basis = 'manual-fixed';
        cycleLengthUsed = s.fixedCycleLength;
    } else {
        const fixedVeset = fixedHaflagahVeset(engineData);
        if (fixedVeset !== null) {
            basis = 'fixed-veset';
            cycleLengthUsed = fixedVeset;
        } else {
            const gaps = validHaflagot(reiyot).slice(-MAX_HAFLAGOT_FOR_AVERAGE);
            if (gaps.length === 0) {
                // פחות משתי ראיות תקפות (כלומר אין אף הפלגה) — מחזור ברירת המחדל (§3.6).
                basis = 'default-28';
                cycleLengthUsed = DEFAULT_CYCLE_LENGTH;
                note = 'מבוסס על מחזור סטנדרטי (28 יום) בהיעדר היסטוריה מספקת.';
            } else {
                basis = 'average';
                const sum = gaps.reduce((a, b) => a + b, 0);
                cycleLengthUsed = Math.round(sum / gaps.length);
                hLow = Math.min(...gaps);
                hHigh = Math.max(...gaps);
                varianceDays = hHigh - hLow;
                if (varianceDays > VARIANCE_THRESHOLD_DAYS) {
                    cycleVariable = true;
                    note = 'מחזורך משתנה. מומלץ להיעזר בבדיקות ביוץ ביתיות לדיוק מרבי.';
                }
            }
        }
    }

    const lutealPhase = s.lutealPhase;
    const nextReiyahAbs = lastReiyahAbs + (cycleLengthUsed - 1);
    const ovulationAbs = nextReiyahAbs - lutealPhase;
    let fertileStartAbs = ovulationAbs - 5;
    let fertileEndAbs = ovulationAbs + 1;
    let ovulationRangeAbs = null;

    if (cycleVariable && hLow !== null && hHigh !== null) {
        const ovulationLow = (lastReiyahAbs + (hLow - 1)) - lutealPhase;
        const ovulationHigh = (lastReiyahAbs + (hHigh - 1)) - lutealPhase;
        ovulationRangeAbs = [Math.min(ovulationLow, ovulationHigh), Math.max(ovulationLow, ovulationHigh)];
        fertileStartAbs = ovulationRangeAbs[0] - 5;
        fertileEndAbs = ovulationRangeAbs[1] + 1;
    }

    const windowDays = [];
    for (let d = fertileStartAbs; d <= fertileEndAbs; d++) windowDays.push(d);
    const peakAbs = [ovulationAbs - 1, ovulationAbs];

    const tevilahAbs = currentCycleTevilahAbs(engineData, lastReiyahAbs);
    let conflict = null;
    let conflictMessage = null;
    if (tevilahAbs !== null) {
        if (ovulationAbs < tevilahAbs) {
            conflict = 'before';
            conflictMessage = 'לפי החישוב המשוער, יום הביוץ חל לפני ליל הטבילה (מצב המכונה לעיתים '
                + '"עקרות הלכתית"). תופעה זו שכיחה ומוכרת, וניתנת לפתרון פשוט ביותר באמצעות '
                + 'התייעצות קצרה עם מורה הוראה ורופא/ת נשים (כגון דחיית ביוץ מתונה או הקדמת הפסק).';
        } else if (ovulationAbs === tevilahAbs || ovulationAbs === tevilahAbs + 1) {
            conflict = 'borderline';
            conflictMessage = 'הביוץ המשוער חל בסמוך מאוד לליל הטבילה — כדאי לשים לב.';
        } else {
            conflict = 'none';
        }
    }

    return {
        enabled: true,
        disabledReason: null,
        settings: s,
        disclaimer: FERTILITY_DISCLAIMER,
        basis,
        cycleLengthUsed,
        lutealPhaseUsed: lutealPhase,
        cycleVariable,
        varianceDays,
        lastReiyahAbs,
        nextReiyahAbs,
        ovulationAbs,
        ovulationRangeAbs,
        fertileStartAbs,
        fertileEndAbs,
        peakAbs,
        windowDays,
        tevilahAbs,
        conflict,
        conflictMessage,
        note
    };
}
