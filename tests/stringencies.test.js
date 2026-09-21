/**
 * בדיקות לפרופיל המנהג (אשכנז/עדות מזרח, `js/stringencies.js`).
 *
 * Run with: node tests/stringencies.test.js
 *
 * "בחירה אישית של הגדרות פרטיות בתוך המכלול" (בקשת המשתמש): פרופיל הוא שכבה
 * נוחה מעל כמה מתגים — לא נעילה. הבדיקה המרכזית: מצב מתגים שאינו תואם באופן
 * מלא לאף פרופיל מוגדר חוזר כ-'custom', לא כברירת מחדל שקטה לצד כלשהו.
 */
import { MINHAG_PROFILES, detectMinhagProfile } from '../js/stringencies.js';

let failures = 0;
function assert(condition, message) {
    if (condition) {
        console.log('PASS: ' + message);
    } else {
        failures++;
        console.error('FAIL: ' + message);
    }
}

assert(detectMinhagProfile(MINHAG_PROFILES.ashkenaz) === 'ashkenaz',
    'a state matching the Ashkenaz preset exactly is detected as Ashkenaz');
assert(detectMinhagProfile(MINHAG_PROFILES.sepharad) === 'sepharad',
    'a state matching the Sepharad preset exactly is detected as Sepharad');
assert(detectMinhagProfile({ orZarua: true, orZaruaDay31: true, karetiUfaletei: false }) === 'custom',
    'a state that partially matches Ashkenaz (one switch differs) is custom, not silently rounded to a preset');
assert(detectMinhagProfile({ orZarua: false, orZaruaDay31: false, karetiUfaletei: true }) === 'custom',
    'a state that partially matches Sepharad (one switch differs) is custom');
assert(detectMinhagProfile({}) === 'custom',
    'an empty/unknown state is custom, not a false positive on either preset');
assert(detectMinhagProfile() === 'custom',
    'a missing state (undefined) does not throw, and resolves to custom');

if (failures > 0) {
    console.error(`\n${failures} stringencies test(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll stringencies tests passed.');
}
