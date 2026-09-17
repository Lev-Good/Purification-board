/**
 * בדיקות ל**וסת השבוע** (docs/SPEC_DINIM_VESATOT.md §3.2).
 *
 * Run with: node tests/vesetWeek.test.js
 *
 * המקור:
 *  - "ראתה ג\"פ **באחד בשבת** או **בה' בשבת**, או באחד בניסן ובאחד באייר ובאחד
 *    בסיון, או בה' בניסן ובה' באייר ובה' בסיון, קבעה לה וסת באחד בשבת או בה' בו,
 *    ובאחד בחודש או בה' בו, **אף על פי** [שאינם שווים באורכם]" `[שט ל\"ו | עמ' 137]`.
 *  - "יתר הוסתות... **אינה חוששת להם אלא אם כן נקבעו שלש פעמים**, כיון שאינן
 *    וסתות שכיחות" `[ד\"ט | עמ' 4]`; ומפני הריבוי המדומה הזהיר הספר במפורש:
 *    "[דאל\"כ נמצא דהרבה נשים יהא להן וסת הדילוג **ווסת השבוע**]" `[ד\"ט | עמ' 7]`.
 *
 * מה נבדק:
 *  1. הזיהוי: ג' ראיות באותו יום בשבוע, כל שבעה ימים, ובאותה עונה (`chazaka.established`).
 *  2. שאין וסת שבוע מדומה בהפלגות מרווחות, ואף לא בעונות מתחלפות.
 *  3. ההקרנה בלוח: כל שבעה ימים, בקוד `וק"ש`, ובמקום שלושת החששות הרגילים.
 *  4. העקירה: ג' זמני וסת רצופים עם בדיקה כדין.
 *  5. התצוגה: `describeVeset` והכלל שבאפיון על חזרת הוסת מן הסילוק.
 */
import { HDate } from '../hebcal.js';
import { calculateEngine } from '../js/calculations.js';
import { analyzeChazaka, describeVeset, hebWeekday, WEEK_SIGHTINGS_NEEDED } from '../js/chazaka.js';
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
const reiya = (abs, ona, extra) => Object.assign({ abs, ona, hdate: new HDate(abs) }, extra || {});
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

const base = d(5, 1, 5786);
const weekly = [base, base + 7, base + 14].map(a => reiya(a, 'day'));

const weekChazaka = analyzeChazaka(weekly);
const weekVeset = weekChazaka.established.find(v => v.kind === 'week');
assert(!!weekVeset, 'three sightings a week apart on the same weekday establish a week veset');
assert(weekVeset.weekday === new HDate(base + 14).getDay(),
    'the veset records the weekday it was established for');
assert(weekVeset.weekdayLabel === hebWeekday(new HDate(base + 14).getDay()),
    'and carries the weekday name, so the panel can say it in words');
assert(weekVeset.establishedBy.length === WEEK_SIGHTINGS_NEEDED,
    'the three sightings that established it are on record');

// אותו יום בשבוע — אך ההפלגות אינן שבוע: אין וסת שבוע.
const spaced = [base, base + 14, base + 28].map(a => reiya(a, 'day'));
assert(!analyzeChazaka(spaced).established.some(v => v.kind === 'week'),
    'sightings on the same weekday but not a week apart do not make every weekday a veset');

// עונות מתחלפות — אין קביעות.
const mixedOnot = [reiya(base, 'day'), reiya(base + 7, 'night'), reiya(base + 14, 'day')];
assert(!analyzeChazaka(mixedOnot).established.some(v => v.kind === 'week'),
    'sightings that are not all in one ona do not establish a week veset');

// שתי ראיות בלבד — אין קביעות.
assert(!analyzeChazaka(weekly.slice(0, 2)).established.some(v => v.kind === 'week'),
    'two sightings are not enough - a veset of a non-frequent kind needs three');

// ---------- 2. ההקרנה וההחלפה ----------

const weekEngine = calculateEngine(dbOf(weekly), false, { today: base + 16 });
assert(weekEngine.standingVesets.length === 1 && weekEngine.standingVesets[0].kind === 'week',
    'the week veset stands in place of the ordinary concerns');
assert(allOfCode(weekEngine, 'וק\"ש').length > 0,
    'and the calendar is marked with the fixed-week code');
assert(allOfCode(weekEngine, 'וק\"ש').every(e => (e.abs - (base + 14)) % 7 === 0),
    'the projected dates fall exactly every seven days from the establishing sighting');
assert(allOfCode(weekEngine, 'עו\"ב').length === 0
    && allOfCode(weekEngine, 'יו\"ח').length === 0,
    'while the ordinary concerns are set aside - and reported as set aside');
assert(weekEngine.computed.suppressed.some(s => s.text.indexOf('וסת קבוע') !== -1),
    'nothing is dropped silently - what was set aside says why');

// ---------- 3. העקירה ----------

const checks = [21, 28, 35].map(offset => ({
    [base + offset]: { type: 'check', ona: 'day', depth: 'deep' }
})).reduce((acc, o) => Object.assign(acc, o), {});
const uprootedData = Object.assign(dbOf(weekly), checks);
const uprootedEngine = calculateEngine(uprootedData, false, { today: base + 40 });
assert(uprootedEngine.akirot.uprooted.length === 1,
    'three due times, each with a proper check, uproot the week veset');
assert(uprootedEngine.akirot.uprooted[0].clearedBy === 'checks',
    'and it is the check route that cleared it - the din requires a bedikah for a fixed veset');
assert(uprootedEngine.standingVesets.length === 0,
    'once uprooted it no longer stands, and the ordinary concerns return');
assert(allOfCode(uprootedEngine, 'עו\"ב').length > 0,
    'which is why the ordinary concerns are back on the calendar');

// ---------- 4. התצוגה ----------

assert(describeVeset({ kind: 'week', ona: 'day', weekday: 0 }).indexOf('בשבוע') !== -1,
    'the panel describes it as a veset of a weekday');
assert(describeVeset({ kind: 'week', ona: 'night', weekdayLabel: 'שני' }).indexOf('שני') !== -1,
    'and names the weekday it was established for');
assert(RETURN_RULES.week && RETURN_RULES.week.source.indexOf('עמ\' 137') !== -1,
    'the return-from-dormancy text names its own source for the week veset');
assert(RETURN_RULES.week.title.indexOf('חוזרת מיד') !== -1,
    'and applies to it the din of a veset of days - she returns to it at once');

// ---------- 5. הפאנל ----------

const stub = { innerHTML: '', className: '', style: { display: '' } };
global.document = {
    getElementById: (id) => (id === 'chazaka-container' ? stub : null),
    querySelector: () => null,
    addEventListener: () => {}
};
const { updateChazakaPanel } = await import('../js/ui.js');
updateChazakaPanel(weekEngine);
assert(stub.innerHTML.indexOf('בשבוע') !== -1,
    'the panel names the week veset in words');
assert(stub.innerHTML.indexOf('וק"ש') === -1,
    'and does not send the user to the calendar code for the din itself');

// ---------- 6. אותו יום בשבוע בלוח העברי ----------

// יום אחד בשבוע רק אם ההפרש מתחלק בשבעה; אחרת אין זה אותו יום.
const notSameWeekday = [reiya(base, 'day'), reiya(base + 6, 'day'), reiya(base + 13, 'day')];
assert(!analyzeChazaka(notSameWeekday).established.some(v => v.kind === 'week'),
    'sightings on different weekdays do not establish a week veset');

if (failures === 0) {
    console.log('\nAll week-veset tests passed.');
} else {
    console.error(`\n${failures} week-veset test(s) failed.`);
    process.exitCode = 1;
}
