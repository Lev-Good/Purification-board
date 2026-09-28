/**
 * בדיקות ל**משיכת הראייה** (docs/SPEC_DINIM_VESATOT.md §9.1) ולמודול
 * `js/reiyaDuration.js`.
 *
 * Run with: node tests/reiyaDuration.test.js
 *
 * המקור:
 *  - "עונת הוסת נחשבת העונה שהתחילה לראות בה **אף אם נמשכה ראייתה כמה ימים**."
 *  - "וכשנמשכה ראיתה גם בעונה הסמוכה **צריכה לחוש גם לסמוכה כשיעור שנמשכה
 *    ראייתה** [שו"ע קפ"ד ה']. **ורק אם נמשכה ד' ימים נוספים אין צריך לחוש אלא
 *    לתחילת ראייתה** [לבוש, ט"ז, פרישה]." `[ד"ט | עמ' 1]`
 *
 * מה נבדק:
 *  1. חשבון העונות: כמה עונות נוספות נחשפות לפי מספר הימים.
 *  2. שהמשיכה הארוכה (ד' ימים נוספים ומעלה) אינה מוסיפה עונה.
 *  3. שהמנוע מזריק את החשש גם לעונה הסמוכה — ולא רק לעונת ההתחלה.
 *  4. שמניין הימים נמדד מן הראייה שבה החל הדימום, ולא מזו שנרשמה בסופו.
 *  5. שכלל אינו פועל כשאין סימון המשך.
 */
import { HDate } from '../hebcal.js';
import { calculateEngine } from '../js/calculations.js';
import {
    durationOnot, extensionOnot, extensionIsTooLong, durationNote,
    EXTENSION_NOTE, MAX_EXTRA_ONOT
} from '../js/reiyaDuration.js';

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

// ---------- 1. חשבון העונות ----------

assert(extensionOnot(100, 'day', 1).length === 0, 'a one-day bleeding has no extension');
assert(extensionOnot(100, 'day', undefined).length === 0, 'without a day count there is no extension');
assert(extensionOnot(100, 'day', 0).length === 0, 'a zero day count adds nothing');

const twoDays = extensionOnot(100, 'day', 2);
assert(twoDays.length === 1 && twoDays[0].abs === 100 && twoDays[0].ona === 'night',
    'a two-day bleeding that began in the day continues into the night of the same day');

const threeDays = extensionOnot(100, 'day', 3);
assert(threeDays.length === 2 && threeDays[0].ona === 'night'
    && threeDays[1].abs === 101 && threeDays[1].ona === 'day',
    'a three-day bleeding continues into the night and then into the next day');

const nightStart = extensionOnot(100, 'night', 2);
assert(nightStart.length === 1 && nightStart[0].abs === 101 && nightStart[0].ona === 'day',
    'a bleeding that began at night continues into the next day');

const full = durationOnot(100, 'day', 3);
assert(full.length === 3 && full[0].abs === 100 && full[0].ona === 'day',
    'the full list always begins with the ona the sighting started in');

// ---------- 2. המשיכה הארוכה ----------

assert(extensionOnot(100, 'day', 5).length === 0,
    'four additional days or more - she need not be concerned beyond the start');
assert(extensionOnot(100, 'day', 9).length === 0,
    'a longer bleeding is likewise only its start');
// מניין הימים הכולל הוא העונות הנוספות ועוד העונה הראשונה: 4 ימים = ג' עונות נוספות.
assert(extensionOnot(100, 'day', MAX_EXTRA_ONOT + 2).length === 0,
    'the boundary is right after the maximum number of extra onot');
assert(extensionOnot(100, 'day', MAX_EXTRA_ONOT + 1).length === MAX_EXTRA_ONOT,
    'the last day-count that still extends is the maximum itself');
assert(extensionIsTooLong(5) === true && extensionIsTooLong(4) === false,
    'the "too long" test matches the source - four additional days and above');

assert(durationNote(1) === null, 'no note when there was no continuation');
assert(durationNote(3) === EXTENSION_NOTE, 'the extension note names the din');
assert(durationNote(6).indexOf('תחילת הראייה') !== -1,
    'a long bleeding is explained, not silently dropped');

// ---------- 3. הזרקת החשש לעונה הסמוכה ----------

const sightAbs = d(10, 1, 5786);
const withExtension = calculateEngine(
    { [sightAbs]: { type: 'reiyah', ona: 'day', closedFountain: false, durationDays: 3 } },
    false, { today: sightAbs + 5 });
const beinonitAbs = sightAbs + 29;
const beinonitOnot = (withExtension.computed.prishot[beinonitAbs] || [])
    .filter(p => p.code === 'עו"ב').map(p => p.ona).sort();
assert(beinonitAbs > 0 && JSON.stringify(beinonitOnot) === JSON.stringify(['day', 'night']),
    'the ordinary concern is marked in the ona of the start AND in the one it continued into');

const extendedEntry = (withExtension.computed.prishot[beinonitAbs] || [])
    .find(p => p.code === 'עו"ב' && p.ona === 'night');
assert(extendedEntry && extendedEntry.reason.indexOf('משיכת הראייה') !== -1,
    'and the added ona says why it was added, instead of appearing unexplained');

const yomHachodeshAbs = Object.keys(withExtension.computed.prishot).map(Number)
    .find(abs => (withExtension.computed.prishot[abs] || []).some(p => p.code === 'יו"ח'));
const yhOnot = (withExtension.computed.prishot[yomHachodeshAbs] || [])
    .filter(p => p.code === 'יו"ח').map(p => p.ona).sort();
assert(JSON.stringify(yhOnot) === JSON.stringify(['day', 'night']),
    'the same din applies to the day-of-month concern');

// ---------- 4. בלא סימון המשך — אין תוספת ----------

const withoutExtension = calculateEngine(
    { [sightAbs]: { type: 'reiyah', ona: 'day', durationDays: 3 } },
    false, { today: sightAbs + 5 });
const plainOnot = (withoutExtension.computed.prishot[beinonitAbs] || [])
    .filter(p => p.code === 'עו"ב').map(p => p.ona);
assert(plainOnot.length === 1 && plainOnot[0] === 'day',
    'a day count without the "continued" marking adds no ona - the marking is the input');

const startOnly = calculateEngine(
    { [sightAbs]: { type: 'reiyah', ona: 'day', closedFountain: false, durationDays: 5 } },
    false, { today: sightAbs + 5 });
assert((startOnly.computed.prishot[beinonitAbs] || []).filter(p => p.code === 'עו"ב').length === 1,
    'and a bleeding of four additional days and above stays with the start alone');

// ---------- 5. מניין הימים נמדד מן הראייה שבה החל הדימום ----------

// הראייה הראשונה נרשמה רגילה, והשנייה שאחריה סומנה "נמשך ברצף" עם משך כולל של ג' ימים.
const startAbs = d(10, 1, 5786);
const contAbs = startAbs + 1;
const mergedDb = {
    [startAbs]: { type: 'reiyah', ona: 'day' },
    [contAbs]: { type: 'reiyah', ona: 'night', closedFountain: false, durationDays: 3 }
};
const merged = calculateEngine(mergedDb, false, { today: startAbs + 5 });
const mergedOnot = (merged.computed.prishot[startAbs + 29] || [])
    .filter(p => p.code === 'עו"ב').map(p => p.ona).sort();
assert(JSON.stringify(mergedOnot) === JSON.stringify(['day', 'night']),
    'the count of days is measured from the sighting the bleeding STARTED in, not from the later record');
assert(merged.chazaka.counted.length === 1,
    'and the later record is still the same sighting - not a new one');

if (failures === 0) {
    console.log('\nAll reiya-duration tests passed.');
} else {
    console.error(`\n${failures} reiya-duration test(s) failed.`);
    process.exitCode = 1;
}
