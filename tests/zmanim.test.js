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
 *  5. **"היום" לפי שקיעה** (`effectiveTodayAbs`) — בלא מיקום מתנהג כמו
 *     `new HDate().abs()` (חצות אזרחי); עם מיקום, מתקדם ביום אחד ברגע שהשקיעה
 *     חלפה, גם אם החצות האזרחי עוד לא הגיע.
 *  6. **עונות שחלפו** (`elapsedOnotOf`) — עונת הלילה חולפת עם הנץ (גם באמצע
 *     אותו תאריך עברי, בלי ש-`abs` יתקדם), ועונת היום חולפת עם השקיעה.
 */
import { HDate, Zmanim } from '../hebcal.js';
import {
    LOCATIONS, locationById, dayTimes, timesLine, NO_LOCATION,
    effectiveTodayAbs, elapsedOnotOf
} from '../js/zmanim.js';

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

// ---------- "היום" לפי שקיעה (effectiveTodayAbs) ----------

// יום עברי אזרחי שרחוק מראש השנה/מעברי חודש, כדי שחיבור abs+1 יהיה פשוט לבדיקה.
const refAbs = new HDate(15, 'Sivan', 5785).abs();
const refGreg = new HDate(refAbs).greg();
const refSunrise = new Zmanim(refGreg, jerusalem.lat, jerusalem.long).sunrise();
const refSunset = new Zmanim(refGreg, jerusalem.lat, jerusalem.long).sunset();

assert(effectiveTodayAbs(null, refGreg) === new HDate(refGreg).abs(),
    'without a location, effectiveTodayAbs falls back to plain civil-midnight rollover');

const beforeSunset = new Date(refSunrise.getTime() + 60 * 60 * 1000); // שעה אחרי הנץ - ודאי לפני השקיעה
assert(effectiveTodayAbs(jerusalem, beforeSunset) === refAbs,
    'before sunset, the effective Hebrew day is still the civil day (day ona not elapsed)');

const afterSunset = new Date(refSunset.getTime() + 60 * 1000); // דקה אחרי השקיעה
assert(effectiveTodayAbs(jerusalem, afterSunset) === refAbs + 1,
    'once sunset has passed, the effective Hebrew day already advances - civil midnight has not come yet');

const rightBeforeSunset = new Date(refSunset.getTime() - 60 * 1000);
assert(effectiveTodayAbs(jerusalem, rightBeforeSunset) === refAbs,
    'a minute before sunset it has not advanced yet');

// ---------- עונות שחלפו (elapsedOnotOf) ----------

assert(JSON.stringify(elapsedOnotOf(refAbs, null, afterSunset)) === JSON.stringify({ night: false, day: false }),
    'without a location nothing is ever reported as elapsed - no din change from silence');

const afterSunrise = new Date(refSunrise.getTime() + 60 * 1000);
const beforeSunrise = new Date(refSunrise.getTime() - 60 * 1000);
assert(elapsedOnotOf(refAbs, jerusalem, beforeSunrise).night === false,
    'the night ona has not elapsed yet a minute before sunrise');
assert(elapsedOnotOf(refAbs, jerusalem, afterSunrise).night === true,
    'the night ona has elapsed a minute after sunrise - even though abs has not advanced (that only happens at sunset)');
assert(elapsedOnotOf(refAbs, jerusalem, afterSunrise).day === false,
    'and the day ona of the same abs has certainly not elapsed yet (sunset is still far off)');
assert(elapsedOnotOf(refAbs, jerusalem, afterSunset).day === true,
    'the day ona has elapsed once sunset has passed');

if (failures > 0) {
    console.error(`\n${failures} zmanim test(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll zmanim tests passed.');
}
