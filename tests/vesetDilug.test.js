/**
 * בדיקות ל**וסת הדילוג והסירוג** (`js/vesetDilug.js`) ול**מתגי החומרא**
 * (`js/stringencies.js` — §5ב).
 *
 * Run with: node tests/vesetDilug.test.js
 *
 * מה נבדק:
 *  1. הזיהוי: \"דילוג חלילה\" — מחזור של ב'–ג' ימים בחודש, החוזר **פעמיים שלמות**,
 *     בחודשים **עוקבים** ובאותה עונה. תבנית חסרה או מקוטעת אינה מזוהה כלל.
 *  2. **ברירת המחדל אינה חוששת:** התבנית מוצגת לבירור עם רב
 *     (\"כיון דבוסתות לא שכיחות אין חוששים אלא א\"כ הוקבעו באופן ודאי\" `[ד\"ט | עמ' 7]`),
 *     ואינה מוסיפה חשש ללוח.
 *  3. בהפעלת המתג `dilug` — התבנית נחשבת וסת קבועה ומוקרנת לחודש הבא בקוד `וק\"ד`.
 *  4. מתג `safekOnaBoth`: בלא המתג — חשש לעונה המאוחרת בלבד; ובהפעלתו — גם לעונה הקודמת.
 */
import { HDate } from '../hebcal.js';
import { calculateEngine } from '../js/calculations.js';
import { detectDilugCandidates, DILUG_CODE, DILUG_CYCLE_LENGTHS } from '../js/vesetDilug.js';
import { defaultStringencies } from '../js/stringencies.js';

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
const sighting = (abs, ona) => ({ abs, ona: ona || 'day', hdate: new HDate(abs) });

// --- 1. הזיהוי ---------------------------------------------------------------

// מחזור של ב' ימים החוזר פעמיים: ט\"ו–ט\"ז בתשרי–כסלו, ושוב בטבת–שבט.
const cycle2 = [
    d(15, 'Tishrei', 5785), d(16, 'Cheshvan', 5785),
    d(15, 'Kislev', 5785), d(16, 'Tevet', 5785)
].map(abs => sighting(abs));

const found2 = detectDilugCandidates(cycle2);
assert(found2.length === 1, 'a rising cycle of two days is detected once');
assert(found2[0].cycle.join(',') === '15,16', 'and its cycle is the two days in order');
assert(found2[0].nextIndex === 0, 'with the next month continuing the cycle from its head');
assert(found2[0].ona === 'day', 'and it remembers the onah it was set in');

// מחזור של ג' ימים.
const cycle3 = [
    d(15, 'Tishrei', 5785), d(16, 'Cheshvan', 5785), d(17, 'Kislev', 5785),
    d(15, 'Tevet', 5785), d(16, 'Shevat', 5785), d(17, 'Adar', 5785)
].map(abs => sighting(abs));
const found3 = detectDilugCandidates(cycle3);
assert(found3.length === 1 && found3[0].cycle.join(',') === '15,16,17',
    'a rising cycle of three days is recognised as such — and not as a two-day one');
assert(DILUG_CYCLE_LENGTHS.indexOf(3) !== -1 && DILUG_CYCLE_LENGTHS.indexOf(4) === -1,
    'longer cycles are deliberately out of scope (the source names the short ones)');

// מחזור מקוטע — אינו מזוהה.
const broken = [
    d(15, 'Tishrei', 5785), d(16, 'Cheshvan', 5785),
    d(15, 'Kislev', 5785), d(18, 'Tevet', 5785)
].map(abs => sighting(abs));
assert(detectDilugCandidates(broken).length === 0,
    'a broken pattern is not a veset at all — no guessing');

// חודש מדולג — אינו מזוהה.
const skipped = [
    d(15, 'Tishrei', 5785), d(16, 'Cheshvan', 5785),
    d(15, 'Kislev', 5785), d(16, 'Shevat', 5785)
].map(abs => sighting(abs));
assert(detectDilugCandidates(skipped).length === 0,
    'sightings that skip a month are not \"month after month\"');

// עונות שונות — אינו מזוהה.
const mixedOnot = cycle2.map((r, i) => sighting(r.abs, i % 2 ? 'night' : 'day'));
assert(detectDilugCandidates(mixedOnot).length === 0,
    'and a change of onah breaks it, as the general condition requires');

// תבנית אחת ורבע אינה תבנית.
assert(detectDilugCandidates(cycle2.slice(0, 2)).length === 0,
    'one run is a coincidence; two full cycles are a pattern');

// --- 2–3. חשש אין בו, אלא במתג ----------------------------------------------

const dbOf = (list) => {
    const db = {};
    list.forEach(r => { db[r.abs] = { type: 'reiyah', ona: r.ona }; });
    return db;
};
const db = dbOf(cycle2);
const flatCodes = (data) => Object.keys(data.computed.prishot)
    .reduce((acc, abs) => acc.concat((data.computed.prishot[abs] || []).map(p => p.code)), []);

const lenient = calculateEngine(db, false, { today: cycle2[3].abs + 3 });
assert((lenient.computed.dilugCandidates || []).length >= 1,
    'the pattern reaches the interface, so it can be shown and brought to a rabbi');
assert(flatCodes(lenient).indexOf(DILUG_CODE) === -1,
    'but by default it adds NO concern to the calendar');

const strict = calculateEngine(db, false, {
    today: cycle2[3].abs + 3,
    stringencies: { dilug: true }
});
assert(flatCodes(strict).indexOf(DILUG_CODE) !== -1,
    'with the stringency switched on, the pattern is projected as a fixed veset');

// --- 4. מתג ספק עונה --------------------------------------------------------

const safekAbs = d(15, 'Sivan', 5785);
const safekDb = { [safekAbs]: { type: 'reiyah', ona: 'day', safekOna: true } };

const safekLenient = calculateEngine(safekDb, false, { today: safekAbs + 5 });
const lenientOnot = (safekLenient.computed.prishot[safekAbs + 29] || []).map(p => p.ona);
assert(lenientOnot.length > 0 && lenientOnot.every(o => o === 'day'),
    'by default the doubt is resolved to the LATER onah only — the din, not a stringency');

const safekStrict = calculateEngine(safekDb, false, {
    today: safekAbs + 5,
    stringencies: { safekOnaBoth: true }
});
const strictOnot = (safekStrict.computed.prishot[safekAbs + 29] || []).map(p => p.ona);
assert(strictOnot.indexOf('night') !== -1,
    'with the stringency on she is concerned for the EARLIER onah as well');

// בלא סימון \"ספק עונה\" אין למתג על מה לחול.
const plainDb = { [safekAbs]: { type: 'reiyah', ona: 'day' } };
const plainStrict = calculateEngine(plainDb, false, {
    today: safekAbs + 5,
    stringencies: { safekOnaBoth: true }
});
assert((plainStrict.computed.prishot[safekAbs + 29] || []).every(p => p.ona === 'day'),
    'and an unsuspected sighting is untouched by that stringency');

// --- 5. ברירות המחדל של המודול ----------------------------------------------

const defaults = defaultStringencies();
assert(defaults.dilug === false
    && defaults.safekOnaBoth === false
    && defaults.checkUprootNonFixed === false,
    'the punitive readings of the disputes are all off by default');
assert(defaults.orZaruaDay31 === true,
    'while the accepted custom of aruchat-or-zarua for the 31st stays on');

if (failures > 0) {
    console.error(`\n${failures} dilug / stringency test(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll dilug and stringency tests passed.');
}
