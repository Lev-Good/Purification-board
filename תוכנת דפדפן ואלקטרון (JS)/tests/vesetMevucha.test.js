/**
 * בדיקות ל**וסת לימים המתחלפים** — "ימי המבוכה" (A9; docs/SPEC_DINIM_VESATOT.md §3.4, §9.5).
 *
 * Run with: node tests/vesetMevucha.test.js
 *
 * המקור:
 *  - "ראתה כמה פעמים **ביום כ\"ז** וכמה פעמים **ביום כ\"ט** ו**ביום כ\"ח לא ראתה** —
 *    **חוששת לכ\"ז וכ\"ט ואינה חוששת לכ\"ח**"; ועקירתו **בג\"פ**
 *    `[שט ל\"ב | עמ' 107–108]`.
 *  - והאזהרה הכללית: בוסתות שאינן שכיחות "אין חוששים אלא א\"כ הוקבעו באופן ודאי...
 *    [דאל\"כ נמצא דהרבה נשים יהא להן וסת הדילוג ווסת השבוע]" `[ד\"ט | עמ' 7]`.
 *
 * מה נבדק:
 *  1. הזיהוי: ג' ראיות בכל אחד משני ימים, בהפרש של יום אחד מפסיק, ואותו המפסיק לא נראה.
 *  2. שאין זיהוי בתבנית רחבה או חסרה (ג' ראיות ביום אחד, או שראתה ביום המפסיק).
 *  3. ההקרנה: אותם שני ימי חודש בכל חודש, **ובלי** היום המפסיק.
 *  4. שהפלגת-הב' ימים שנשענה על התבנית מוסרת מפניו — ושהיא מדווחת ולא נעלמת בשקט.
 *  5. העקירה בג' זמנים עם בדיקה כדין.
 *  6. התצוגה.
 */
import { HDate } from '../hebcal.js';
import { calculateEngine } from '../js/calculations.js';
import { analyzeChazaka, describeVeset, findAlternatingDays, MEVUCHA_CODE } from '../js/chazaka.js';
import { RETURN_RULES } from '../js/silekReturn.js';

let failures = 0;
function assert(condition, message) {
    if (condition) {
        console.log('PASS: ' + message);
    } else {
        failures++;
        console.error('FAIL: ' + message);
    }
}

const d = (day, month, year) => new HDate(day, month, year).abs();
const reiya = (abs, ona) => ({ abs, ona: ona || 'day', hdate: new HDate(abs) });
const dbOf = (list) => {
    const db = {};
    list.forEach(r => {
        db[r.abs] = { type: 'reiyah', ona: r.ona, kind: r.kind || 'regular' };
    });
    return db;
};
const allOfCode = (data, code) => Object.keys(data.computed.prishot)
    .reduce((acc, abs) => acc.concat((data.computed.prishot[abs] || [])
        .filter(p => p.code === code).map(p => ({ abs: Number(abs), ona: p.ona }))), []);

// ---------- 1. הזיהוי ----------

// כ"ז וכ"ט בכל אחד מג' חודשים — ובחודש כ"ח לא ראתה.
const alternating = [];
[1, 2, 3].forEach(month => {
    alternating.push(reiya(d(27, month, 5786)));
    alternating.push(reiya(d(29, month, 5786)));
});

const found = findAlternatingDays(alternating);
assert(!!found, 'three sightings on each of two days, a day apart, are recognised');
assert(JSON.stringify(found.days) === JSON.stringify([27, 29]),
    'the two days are recorded, in order');
assert(found.establishedBy.length === 6, 'and all six sightings that established it are on record');

const mevuchaChazaka = analyzeChazaka(alternating);
assert(mevuchaChazaka.established.some(v => v.kind === 'mevucha'),
    'the alternating-days veset is established');
// ואין לצדו "הפלגה" של ב' ימים: ההפלגה שבין חודש לחודש אינה שווה לזו שבתחילת החודש,
// וממילא אין שלוש הפלגות שוות מן הסוף. (אילו היתה נקבעת — היתה חוששת כל שני ימים.)
assert(mevuchaChazaka.established.filter(v => v.kind === 'haflagah').length === 0,
    'and no two-day haflagah stands beside it');

// ---------- 2. שאין זיהוי בתבנית רחבה או חסרה ----------

// ראתה גם ביום המפסיק — "וביום כ"ח לא ראתה" אינו מתקיים.
const withMiddle = alternating.concat([reiya(d(28, 1, 5786)), reiya(d(28, 2, 5786)), reiya(d(28, 3, 5786))]);
assert(findAlternatingDays(withMiddle) === null,
    'when the in-between day was seen too, this is not the "alternating days" pattern');

// ג' ראיות ביום אחד בלבד.
const oneDayOnly = [1, 2, 3].map(m => reiya(d(27, m, 5786)));
assert(findAlternatingDays(oneDayOnly) === null,
    'a single day-of-month is a plain month veset, not an alternating one');

// הפרש של יום אחד בלבד אינו "יום מפסיק".
const adjacentDays = [1, 2, 3].map(m => reiya(d(27, m, 5786)))
    .concat([1, 2, 3].map(m => reiya(d(28, m, 5786))));
assert(findAlternatingDays(adjacentDays) === null,
    'two consecutive days-of-month are not the pattern the source describes');

// ---------- 3. ההקרנה ----------

const engine = calculateEngine(dbOf(alternating), false, { today: d(1, 4, 5786) });
const projected = allOfCode(engine, MEVUCHA_CODE).map(e => new HDate(e.abs).getDate());
assert(engine.standingVesets.length === 1 && engine.standingVesets[0].kind === 'mevucha',
    'the alternating-days veset stands in place of the ordinary concerns');
const nextMonthDays = allOfCode(engine, MEVUCHA_CODE)
    .filter(e => new HDate(e.abs).getFullYear() === 5786 && new HDate(e.abs).getMonth() === 4)
    .map(e => new HDate(e.abs).getDate()).sort((a, b) => a - b);
assert(JSON.stringify(nextMonthDays) === JSON.stringify([27, 29]),
    'the coming month is marked on the 27th and the 29th');

const monthFour = allOfCode(engine, MEVUCHA_CODE)
    .filter(e => new HDate(e.abs).getFullYear() === 5786 && new HDate(e.abs).getMonth() === 4);
assert(monthFour.every(e => e.ona === 'day'),
    'and it is marked in the ona the pattern was established in');
const noTwentyEighth = allOfCode(engine, MEVUCHA_CODE)
    .filter(e => new HDate(e.abs).getDate() === 28);
assert(noTwentyEighth.length === 0, 'while the in-between day is NOT marked - "אינה חוששת לכ"ח"');

assert(allOfCode(engine, 'עו"ב').length === 0,
    'and the ordinary concerns are set aside, as with any fixed veset');
assert(engine.computed.suppressed.some(s => s.text.indexOf('וסת קבוע') !== -1),
    'while what was set aside is disclosed rather than dropped silently');

// ---------- 4. העקירה ----------

const checks = [d(27, 4, 5786), d(29, 4, 5786), d(27, 5, 5786)]
    .reduce((acc, abs) => {
        acc[abs] = { type: 'check', ona: 'day', depth: 'deep' };
        return acc;
    }, {});
const uprooted = calculateEngine(Object.assign(dbOf(alternating), checks), false, {
    today: d(2, 6, 5786)
});
assert(uprooted.akirot.uprooted.length === 1,
    'three due times, each with a proper check, uproot the alternating-days veset');
assert(uprooted.standingVesets.length === 0, 'and it no longer stands');

// ---------- 5. התצוגה ----------

assert(describeVeset({ kind: 'mevucha', ona: 'day', days: [27, 29] }).indexOf('כ"ז') !== -1,
    'the panel names the first day in gematria');
assert(describeVeset({ kind: 'mevucha', ona: 'day', days: [27, 29] }).indexOf('כ"ט') !== -1,
    'and the second too');
assert(describeVeset({ kind: 'mevucha', ona: 'day', days: [27, 29] }).indexOf('המתחלפים') !== -1,
    'and calls the veset by its name');
assert(RETURN_RULES.mevucha && RETURN_RULES.mevucha.source.indexOf('עמ\' 107') !== -1,
    'the return-from-dormancy text carries its own source');
assert(RETURN_RULES.mevucha.title.indexOf('מיד') !== -1,
    'and applies the din of a veset of days - she returns to it at once');

if (failures === 0) {
    console.log('\nAll alternating-days (mevucha) tests passed.');
} else {
    console.error(`\n${failures} alternating-days test(s) failed.`);
    process.exitCode = 1;
}
