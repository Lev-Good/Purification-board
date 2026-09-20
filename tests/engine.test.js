/**
 * Quick sanity test for the calculation engine.
 * Run with: node tests/engine.test.js
 *
 * Verifies that a reiyah produces BOTH Ona Beinonit entries:
 *  - Day 30  (abs + 29, code עו"ב)
 *  - Day 31  (abs + 30, code עו"ל)
 * with the correct onah and Or Zarua adjustments.
 */
import { calculateEngine, getMonthsInYear, shiftHebrewMonth } from '../js/calculations.js';
import { HDate } from '../hebcal.js';

let failures = 0;
function assert(condition, message) {
    if (condition) {
        console.log('PASS: ' + message);
    } else {
        failures++;
        console.error('FAIL: ' + message);
    }
}

// Scenario: single reiyah on absolute day 10000, daytime onah, Or Zarua disabled.
const db = { 10000: { type: 'reiyah', ona: 'day' } };
const { computed, reiyot } = calculateEngine(db, false);

assert(reiyot.length === 1, 'one reiyah is recognized');
assert(computed.prishot[10029] !== undefined, 'day 30 (abs 10029) exists in prishot');
assert(computed.prishot[10030] !== undefined, 'day 31 (abs 10030) exists in prishot');

const day30 = computed.prishot[10029];
const day31 = computed.prishot[10030];

assert(day30.some(p => p.code === 'עו"ב' && p.ona === 'day'), 'day 30 entry has code עו"ב with day onah');
assert(day31.some(p => p.code === 'עו"ל' && p.ona === 'day'), 'day 31 entry has code עו"ל with day onah');

// Scenario 2: same reiyah but night onah - day 31 should shift back one day for Or Zarua.
const db2 = { 10000: { type: 'reiyah', ona: 'night' } };
const { computed: c2 } = calculateEngine(db2, true);

// Or Zarua for night onah of abs N lands on day onah of abs N-1.
assert(c2.prishot[10029].some(p => p.code === 'עו"ב' && p.ona === 'night'), 'Or Zarua disabled path: base עו"ב on night onah at abs 10029');
const oz31 = c2.prishot[10029] && c2.prishot[10029].some(p => p.code === 'עוא"ז');
assert(oz31, 'Or Zarua for day-31 beinonit (night onah) lands on abs 10029 with code עוא"ז');
const oz30 = c2.prishot[10028] && c2.prishot[10028].some(p => p.code === 'עוא"ז');
assert(oz30, 'Or Zarua for day-30 beinonit (night onah) lands on abs 10028 with code עוא"ז');

// Scenario 3: two reiyot also produce haflagah entries without crashing.
const db3 = {
    10000: { type: 'reiyah', ona: 'day' },
    10035: { type: 'reiyah', ona: 'night' }
};
const { computed: c3 } = calculateEngine(db3, false);
assert(c3.prishot[10070] && c3.prishot[10070].some(p => p.code === 'עו"ה'), 'haflagah entry for second reiyah at abs 10070');
assert(c3.prishot[10065] && c3.prishot[10065].some(p => p.code === 'עו"ל'), 'day-31 beinonit for second reiyah at abs 10065');

// --- Month navigation across Rosh Hashanah (bug fix) ---

// Elul (6) -> Tishrei (7) crosses the year number
assert(shiftHebrewMonth(5786, 6, 1).year === 5787 && shiftHebrewMonth(5786, 6, 1).month === 7, 'next from Elul 5786 -> Tishrei 5787');
// Tishrei (7) -> Elul (6) crosses back
assert(shiftHebrewMonth(5786, 7, -1).year === 5785 && shiftHebrewMonth(5786, 7, -1).month === 6, 'prev from Tishrei 5786 -> Elul 5785');
// Adar (12, non-leap year 5786) -> Nisan 5786, SAME year number
assert(shiftHebrewMonth(5786, 12, 1).year === 5786 && shiftHebrewMonth(5786, 12, 1).month === 1, 'next from Adar 5786 (non-leap) -> Nisan 5786 (same year)');
// Adar I (12, leap year 5787) -> Adar II (13), same year
assert(shiftHebrewMonth(5787, 12, 1).year === 5787 && shiftHebrewMonth(5787, 12, 1).month === 13, 'next from Adar I 5787 (leap) -> Adar II');
// Adar II (13) -> Nisan of the SAME year number
assert(shiftHebrewMonth(5787, 13, 1).year === 5787 && shiftHebrewMonth(5787, 13, 1).month === 1, 'next from Adar II 5787 -> Nisan 5787 (same year)');
// Nisan (1) -> Adar II of the same (leap) year
assert(shiftHebrewMonth(5787, 1, -1).year === 5787 && shiftHebrewMonth(5787, 1, -1).month === 13, 'prev from Nisan 5787 (leap) -> Adar II 5787 (same year)');
// Nisan in a non-leap year -> Adar (12) of the same year
assert(shiftHebrewMonth(5786, 1, -1).year === 5786 && shiftHebrewMonth(5786, 1, -1).month === 12, 'prev from Nisan 5786 (non-leap) -> Adar 5786 (same year)');
// Chronology cross-check against hebcal ground truth (abs day arithmetic)
assert(new HDate(1, 12, 5786).abs() + 29 === new HDate(1, 1, 5786).abs(), 'Adar 5786 + its 29 days lands exactly on Nisan 1 5786');
assert(new HDate(1, 13, 5787).abs() + 29 === new HDate(1, 1, 5787).abs(), 'Adar II 5787 + its 29 days lands exactly on Nisan 1 5787');
assert(new HDate(1, 6, 5786).abs() + 29 === new HDate(1, 7, 5787).abs(), 'Elul 5786 + its 29 days lands exactly on Tishrei 1 5787');
// Normal in-year steps
assert(shiftHebrewMonth(5786, 5, 1).year === 5786 && shiftHebrewMonth(5786, 5, 1).month === 6, 'next from Av -> Elul same year');
assert(shiftHebrewMonth(5786, 8, -1).year === 5786 && shiftHebrewMonth(5786, 8, -1).month === 7, 'prev from Cheshvan -> Tishrei same year');

// --- Yom Hachodesh across Rosh Hashanah (bug fix) ---

// Reiyah on 1 Elul 5786 -> yom hachodesh = 1 Tishrei 5787 (not 1 Tishrei 5786)
const elulAbs = new HDate(1, 6, 5786).abs();
const { computed: cRosh } = calculateEngine({ [elulAbs]: { type: 'reiyah', ona: 'day' } }, false);
const tishreiNextAbs = new HDate(1, 7, 5787).abs();
assert(!!(cRosh.prishot[tishreiNextAbs] && cRosh.prishot[tishreiNextAbs].some(p => p.code === 'יו"ח')), 'yom hachodesh lands on 1 Tishrei 5787 for reiyah on 1 Elul 5786');

// Reiyah on 25 Adar 5786 (non-leap) -> yom hachodesh = 25 Nisan 5786 (same year number)
const adarAbs = new HDate(25, 12, 5786).abs();
const { computed: cAdar } = calculateEngine({ [adarAbs]: { type: 'reiyah', ona: 'night' } }, false);
const nisanSameAbs = new HDate(25, 1, 5786).abs();
assert(!!(cAdar.prishot[nisanSameAbs] && cAdar.prishot[nisanSameAbs].some(p => p.code === 'יו"ח')), 'yom hachodesh lands on 25 Nisan 5786 for reiyah on 25 Adar 5786');

// A day-30 sighting whose next month has only 29 days is a MACHLOKET:
// both candidate days must be marked (29 Iyar 5786 and 30 Sivan 5786 here).
const nisan30Abs = new HDate(30, 1, 5786).abs(); // Nisan has 30 days, Iyar has 29
const { computed: cShort } = calculateEngine({ [nisan30Abs]: { type: 'reiyah', ona: 'day' } }, false);
const disputedAbs = Object.entries(cShort.prishot)
    .filter(([, l]) => l.some(p => p.code === 'יו"ח*'))
    .map(([abs]) => Number(abs))
    .sort((a, b) => a - b);
const iyar29Abs = new HDate(29, 2, 5786).abs();   // last day of the short month
const sivan30Abs = new HDate(30, 3, 5786).abs();  // the 30th of a later month
const iyar1Abs = new HDate(1, 2, 5786).abs();     // 1st of the next month - "בתורת ראש חודש"
assert(disputedAbs.length === 3, 'day-30 sighting before a short month marks all three disputed dates');
assert(disputedAbs[0] === iyar1Abs, 'first disputed date = 1 Iyar 5786 (1st of the next month, as Rosh Chodesh)');
assert(disputedAbs[1] === iyar29Abs, 'second disputed date = 29 Iyar 5786 (last day of the short month)');
assert(disputedAbs[2] === sivan30Abs, 'third disputed date = 30 Sivan 5786 (30th of a later month)');
assert(!Object.values(cShort.prishot).some(l => l.some(p => p.code === 'יו"ח')), 'no plain yom hachodesh code in the disputed case');
assert(!!(cShort.prishot[nisan30Abs + 29] && cShort.prishot[nisan30Abs + 29].some(p => p.code === 'עו"ב')), 'beinonit still calculated for a day-30 sighting');

// Edge case: in years where both Cheshvan and Kislev are short (29 days), the
// later "30th" is found further out - Shvat, since Tevet is always 29 days.
const tishrei30Abs = new HDate(30, 7, 5777).abs(); // 5777: Cheshvan 29, Kislev 29
const { computed: cEdge } = calculateEngine({ [tishrei30Abs]: { type: 'reiyah', ona: 'day' } }, false);
const edgeDisputed = Object.entries(cEdge.prishot)
    .filter(([, l]) => l.some(p => p.code === 'יו"ח*'))
    .map(([abs]) => Number(abs))
    .sort((a, b) => a - b);
assert(edgeDisputed.length === 3, 'edge case marks three disputed dates');
assert(edgeDisputed[0] === new HDate(1, 8, 5777).abs(), 'edge case date 1 = 1 Cheshvan 5777 (1st of the next month)');
assert(edgeDisputed[1] === new HDate(29, 8, 5777).abs(), 'edge case date 2 = 29 Cheshvan 5777');
assert(edgeDisputed[2] === new HDate(30, 11, 5777).abs(), 'edge case date 3 = 30 Shvat 5777 (first later month with a 30th)');

// Or Zarua must shift both disputed dates as well
const { computed: cShortOz } = calculateEngine({ [nisan30Abs]: { type: 'reiyah', ona: 'day' } }, true);
assert(!!(cShortOz.prishot[iyar29Abs] && cShortOz.prishot[iyar29Abs].some(p => p.code === 'עוא"ז')), 'Or Zarua applied to the first disputed date');
assert(!!(cShortOz.prishot[sivan30Abs] && cShortOz.prishot[sivan30Abs].some(p => p.code === 'עוא"ז')), 'Or Zarua applied to the second disputed date');

// Control: 30 -> 30 (Cheshvan 30 5787 -> Kislev 30 5787) must produce a yom hachodesh
const cheshvan30Abs = new HDate(30, 8, 5787).abs();
const { computed: cLong } = calculateEngine({ [cheshvan30Abs]: { type: 'reiyah', ona: 'day' } }, false);
const kislev30Abs = new HDate(30, 9, 5787).abs();
assert(!!(cLong.prishot[kislev30Abs] && cLong.prishot[kislev30Abs].some(p => p.code === 'יו"ח')), 'yom hachodesh lands on Kislev 30 5787 for reiyah on Cheshvan 30 5787');

// Adar I -> Adar II inside a leap year (5787): reiyah 10 Adar I -> 10 Adar II
const adar1Abs = new HDate(10, 12, 5787).abs();
const { computed: cLeap } = calculateEngine({ [adar1Abs]: { type: 'reiyah', ona: 'day' } }, false);
const adar2Abs = new HDate(10, 13, 5787).abs();
assert(!!(cLeap.prishot[adar2Abs] && cLeap.prishot[adar2Abs].some(p => p.code === 'יו"ח')), 'yom hachodesh lands on 10 Adar II 5787 for reiyah on 10 Adar I 5787');

// --- Haflagah: the halachic count INCLUDES both endpoints ---
// Source: דעת טהרה, פרק ו (עמ' 4): "בספירת ימי הפלגתה נכללים גם יום
// ראייתה הקודם עם יום ראייתה הנוכחי. כגון ואתה בא' תשרי וחזרה וראתה
// בכ"ח תשרי הרי זו חוששת להפלגת עשרים ושמונה יום."
const tishrei1Abs = new HDate(1, 7, 5787).abs();
const tishrei28Abs = new HDate(28, 7, 5787).abs();

assert(tishrei28Abs - tishrei1Abs === 27, 'day-difference between 1 and 28 Tishrei is 27');

const { computed: cHaf, reiyot: rHaf } = calculateEngine({
    [tishrei1Abs]: { type: 'reiyah', ona: 'day' },
    [tishrei28Abs]: { type: 'reiyah', ona: 'day' }
}, false);

const secondReiya = rHaf.find(r => r.abs === tishrei28Abs);
assert(secondReiya && secondReiya.haflagahDiff === 28,
    'haflagah is reported as 28 days (halachic inclusive count), not 27');

// The label must carry the halachic count, while the targeted date stays abs + dayDiff.
const hafPrisha = (cHaf.prishot[tishrei28Abs + 27] || []).find(p => p.code === 'עו"ה');
assert(!!hafPrisha, 'haflagah concern lands on abs + 27 (= 28 Tishrei + 27 days)');
assert(!!hafPrisha && hafPrisha.reason.indexOf('28 ימים') !== -1,
    'haflagah concern reason shows 28 days');

// Control: two sightings one day apart => haflagah of 2, next concern the following day.
const { computed: cAdj, reiyot: rAdj } = calculateEngine({
    [tishrei1Abs]: { type: 'reiyah', ona: 'day' },
    [tishrei1Abs + 1]: { type: 'reiyah', ona: 'day' }
}, false);
const adjSecond = rAdj.find(r => r.abs === tishrei1Abs + 1);
assert(adjSecond && adjSecond.haflagahDiff === 2, 'consecutive-day sightings give a haflagah of 2');
assert(!!cAdj.prishot[tishrei1Abs + 2], 'next haflagah concern is the following day');

// --- כרתי ופלתי (מתג `karetiUfaletei`): הרחבת עונה בינונית ליממה שלמה ---
// מנהג אשכנז נוסף (מסמכי "יסודות הבית") — כשדלוק, יום ל' (עונה בינונית) מקבל
// גם את העונה שכנגד עונת הראייה, לא רק את עונתה.
const kufDb = { 20000: { type: 'reiyah', ona: 'day' } };
const kufBeinonitAbs = 20000 + 29;

const { computed: kufOff } = calculateEngine(kufDb, false, { stringencies: { karetiUfaletei: false } });
assert(kufOff.prishot[kufBeinonitAbs].some(p => p.code === 'עו"ב' && p.ona === 'day'),
    'karetiUfaletei off: day-30 beinonit carries only the day onah (the sighting\'s own onah)');
assert(!kufOff.prishot[kufBeinonitAbs].some(p => p.ona === 'night'),
    'karetiUfaletei off: no night-onah entry is added on day 30');

const { computed: kufOn } = calculateEngine(kufDb, false, { stringencies: { karetiUfaletei: true } });
assert(kufOn.prishot[kufBeinonitAbs].some(p => p.code === 'עו"ב' && p.ona === 'day'),
    'karetiUfaletei on: the original day-onah entry still stands');
assert(kufOn.prishot[kufBeinonitAbs].some(p => p.code === 'עו"ב' && p.ona === 'night'),
    'karetiUfaletei on: the opposite (night) onah is added too, for the full 24h');

// --- וסת מעד בדיקה (מתג `vesetFromBedika`): דם שנמצא בבדיקה נמנה כראייה ---
// מקור: מסמכי "יסודות הבית" (מקור משני). ג' בדיקות עם "נמצא דם" יבנו וסת קבוע
// של יום החודש, בדיוק כמו ג' ראיות רגילות — רק כשהמתג דלוק.
const bedikaAbs1 = new HDate(5, 1, 5786).abs();
const bedikaAbs2 = new HDate(5, 2, 5786).abs();
const bedikaAbs3 = new HDate(5, 3, 5786).abs();
const bedikaDb = {
    [bedikaAbs1]: { type: 'check', ona: 'day', depth: 'deep', bloodFound: true },
    [bedikaAbs2]: { type: 'check', ona: 'day', depth: 'deep', bloodFound: true },
    [bedikaAbs3]: { type: 'check', ona: 'day', depth: 'deep', bloodFound: true }
};

const { reiyot: reiyotOff } = calculateEngine(bedikaDb, false, { stringencies: { vesetFromBedika: false } });
assert(reiyotOff.length === 0,
    'vesetFromBedika off: a check with blood found does not become a sighting at all');

const { reiyot: reiyotOn, chazaka: chazakaOn } = calculateEngine(bedikaDb, false, { stringencies: { vesetFromBedika: true } });
assert(reiyotOn.length === 3 && reiyotOn.every(r => r.kind === 'bedikaBlood'),
    'vesetFromBedika on: each blood-found check becomes a sighting, marked with kind bedikaBlood');
assert(!!(chazakaOn && chazakaOn.established && chazakaOn.established.some(v => v.kind === 'month')),
    'and three such sightings on the same Hebrew day establish a fixed veset, same as three ordinary reiyot');

// A check WITHOUT blood found must never count, even with the stringency on.
const { reiyot: reiyotNoBlood } = calculateEngine({
    [bedikaAbs1]: { type: 'check', ona: 'day', depth: 'deep' }
}, false, { stringencies: { vesetFromBedika: true } });
assert(reiyotNoBlood.length === 0,
    'a routine check (no blood found) never becomes a sighting, even with the stringency on');

// --- מאכל חריף (מתג `sharpFoodOnes`): כוסת האונס, לפי המחלוקת ברמ"א יו"ד קפ"ט:כ"ג ---
// שלוש ראיות מחמת מאכל חריף באותו יום בחודש: כברירת מחדל (כבוי) קובעות וסת חודש
// בדיוק כשלוש ראיות רגילות; כשהמתג דלוק, מוחרגות כדין אונס ואינן קובעות דבר.
const sharpAbs1 = new HDate(5, 1, 5786).abs();
const sharpAbs2 = new HDate(5, 2, 5786).abs();
const sharpAbs3 = new HDate(5, 3, 5786).abs();
const sharpDb = {
    [sharpAbs1]: { type: 'reiyah', ona: 'day', kind: 'sharp' },
    [sharpAbs2]: { type: 'reiyah', ona: 'day', kind: 'sharp' },
    [sharpAbs3]: { type: 'reiyah', ona: 'day', kind: 'sharp' }
};

const { chazaka: sharpChazakaOff } = calculateEngine(sharpDb, false, { stringencies: { sharpFoodOnes: false } });
assert(!!(sharpChazakaOff && sharpChazakaOff.established && sharpChazakaOff.established.some(v => v.kind === 'month')),
    'sharpFoodOnes off (default): three sharp-food sightings on the same day-of-month establish a fixed veset');

const { chazaka: sharpChazakaOn } = calculateEngine(sharpDb, false, { stringencies: { sharpFoodOnes: true } });
assert(!(sharpChazakaOn && sharpChazakaOn.established && sharpChazakaOn.established.length),
    'sharpFoodOnes on: the same three sharp-food sightings establish nothing - they are excluded like ones/kfitzot');

if (failures > 0) {
    console.error('\n' + failures + ' test(s) failed.');
    process.exit(1);
} else {
    console.log('\nAll tests passed.');
}
