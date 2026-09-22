/**
 * בדיקות ל**זמני הנץ והשקיעה** (`js/zmanim.js`, ספק עונה — B6).
 *
 * Run with: node tests/zmanim.test.js
 *
 * מה נבדק:
 *  1. בלא מיקום אין זמנים — ואין שינוי דין.
 *  2. בירושלים הזמנים הגיוניים ליום נתון, והם בתוך אותו יום אזרחי.
 *  3. **עונת הלילה של תאריך עברי היא הלילה שלפני יום שלו** — ולכן שקיעת הלילה
 *     הזו היא של היום הלועזי שלפניו (ולא של היום שאחריו) `[שט כ"ז | עמ' 49]`.
 *  4. הזמן מוצג לפי אזור הזמן של המוקד, ולא לפי שעון המחשב.
 */
import { HDate, Zmanim } from '../hebcal.js';
import { LOCATIONS, locationById, dayTimes, timesLine, NO_LOCATION, halachicTodayAbs } from '../js/zmanim.js';

let failures = 0;
function assert(condition, message) {
    if (condition) {
        console.log('PASS: ' + message);
    } else {
        failures++;
        console.error('FAIL: ' + message);
    }
}

const abs = new HDate(15, 'Sivan', 5785).abs();
const jerusalem = locationById('jerusalem');

assert(NO_LOCATION === '' && locationById(NO_LOCATION) === null,
    'no location is the default, and it resolves to nothing');
assert(dayTimes(abs, null) === null && timesLine(abs, null) === '',
    'without a location no times are produced — the din is untouched');

assert(jerusalem && Number.isFinite(jerusalem.lat) && Number.isFinite(jerusalem.long),
    'every preset carries real coordinates');
assert(LOCATIONS.every(p => p.id && p.label && Number.isFinite(p.lat) && Number.isFinite(p.long) && p.tzid),
    'and the presets are complete (id, label, coordinates, timezone)');

const times = dayTimes(abs, jerusalem);
assert(times && /^\d{2}:\d{2}$/.test(times.day.sunrise) && /^\d{2}:\d{2}$/.test(times.day.sunset),
    'Jerusalem returns a sunrise and a sunset for the day');

const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
assert(toMinutes(times.day.sunrise) < toMinutes(times.day.sunset),
    'sunrise comes before sunset');
assert(toMinutes(times.day.sunrise) > 4 * 60 && toMinutes(times.day.sunset) < 21 * 60,
    'and both fall inside the calendar day (Sivan in Jerusalem)');

// עונת הלילה של הט"ו בסיון = הלילה שלפניו, כלומר שקיעת י"ד.
const previousDay = dayTimes(abs - 1, jerusalem);
assert(times.night.sunset === previousDay.day.sunset,
    'the night of a Hebrew date begins at the sunset of the PREVIOUS civil day');
// סביב תקופת תשרי השקיעה זזה בדקה ליום, ולכן ההבחנה נראית לעין בשעון.
const tishrei = dayTimes(new HDate(15, 'Tishrei', 5785).abs(), jerusalem);
assert(tishrei.night.sunset !== tishrei.day.sunset,
    'and that is deliberately not the sunset of the day itself');
assert(times.night.sunrise === times.day.sunrise,
    'while the night ends with the sunrise of the day itself');

const line = timesLine(abs, jerusalem);
assert(line.indexOf('עונת היום') !== -1 && line.indexOf('עונת הלילה') !== -1,
    'the display line names both onot');
assert(line.indexOf(times.day.sunrise) !== -1 && line.indexOf(times.night.sunset) !== -1,
    'and quotes the times it computed');

// אזור זמן שונה: אותה שעה מוחלטת — תצוגה אחרת.
const newYork = locationById('newyork');
const nyTimes = dayTimes(abs, newYork);
assert(nyTimes && nyTimes.day.sunrise !== times.day.sunrise,
    'a different timezone yields its own local clock times');

// "היום" ההלכתי (halachicTodayAbs) — הבדיקה החשובה מכולן: היום העברי מתחלף
// בשקיעה, לא בחצות `[הבאג שדווח ב-"אפיון תוספות עתידיות מתוכננות.txt"]`.
const civilDay = new Date(2025, 5, 10); // 10-Jun-2025 at local midnight
const civilDayAbs = new HDate(civilDay).abs();
const civilSunset = new Zmanim(civilDay, jerusalem.lat, jerusalem.long).sunset();

const beforeSunset = new Date(civilSunset.getTime() - 60 * 60 * 1000);
const afterSunset = new Date(civilSunset.getTime() + 60 * 60 * 1000);

assert(halachicTodayAbs(jerusalem, beforeSunset) === civilDayAbs,
    'before sunset, the halachic day still matches the civil day');
assert(halachicTodayAbs(jerusalem, afterSunset) === civilDayAbs + 1,
    'after sunset, the halachic day has already rolled over to the next one');
assert(halachicTodayAbs(null, afterSunset) === civilDayAbs,
    'without a location there is no sunset to test against, so it falls back to the civil day (documented limitation)');

if (failures > 0) {
    console.error(`\n${failures} zmanim test(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll zmanim tests passed.');
}
