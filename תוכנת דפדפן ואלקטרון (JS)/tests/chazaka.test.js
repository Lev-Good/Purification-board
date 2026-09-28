/**
 * בדיקות למנוע החזקה (js/chazaka.js) ולשילובו במנוע החישוב.
 *
 * Run with: node tests/chazaka.test.js
 *
 * מה נבדק:
 *  1. מה נספר לחזקה ומה לא (אונס/קפיצה · המשך דימום).
 *  2. מתי נקבעת וסת החודש (ג' ראיות · אותו יום · אותה עונה).
 *  3. מתי נקבעת וסת ההפלגה (ד' ראיות · ג' הפלגות שוות).
 *  4. ההקרנה של וסת קבוע קדימה.
 *  5. השילוב במנוע: וסת קבוע מחליף את שאר החששות — והמתג מבטל את המנוע.
 */
import { analyzeChazaka, classifyReiyot, describeVeset } from '../js/chazaka.js';
import { calculateEngine, projectFixedVeset } from '../js/calculations.js';
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

/** בונה ראייה מינימלית. */
function reiya(abs, ona, extra) {
    return Object.assign({ abs, ona: ona || 'day', hdate: new HDate(abs) }, extra || {});
}

// ---------- 1. מה נספר לחזקה ----------

// ראייה מחמת אונס או קפיצה אינה מן המניין.
const withOnes = classifyReiyot([
    reiya(10000),
    reiya(10030, 'day', { kind: 'ones' }),
    reiya(10060)
]);
assert(withOnes.counted.length === 2, 'a sighting marked ones is not counted');
assert(withOnes.excluded.length === 1 && withOnes.excluded[0].reason === 'ones',
    'the ones sighting is reported as excluded with its reason');
assert(withOnes.excluded[0].abs === 10030, 'the excluded sighting keeps its date');

// מאכל חריף וכדורים — נספרות (דינן כוסת הגוף, ולא כוסת האונס).
const withSharp = classifyReiyot([
    reiya(10000, 'day', { kind: 'sharp' }),
    reiya(10030, 'day', { kind: 'pills' })
]);
assert(withSharp.counted.length === 2, 'sharp-food and pill sightings are counted');

// מתג sharpFoodOnes (כבוי כברירת מחדל): כשדלוק, מאכל חריף מוחרג כדין אונס;
// כדורים ('pills') אינם מוחרגים בכל מקרה — המחלוקת/המתג נוגעים למאכל חריף בלבד.
const sharpAsOnesOff = classifyReiyot([
    reiya(10000, 'day', { kind: 'sharp' }),
    reiya(10030, 'day', { kind: 'pills' })
], { sharpFoodAsOnes: false });
assert(sharpAsOnesOff.counted.length === 2,
    'with the stringency off (default), sharp-food and pill sightings still count');

const sharpAsOnesOn = classifyReiyot([
    reiya(10000, 'day', { kind: 'sharp' }),
    reiya(10030, 'day', { kind: 'pills' })
], { sharpFoodAsOnes: true });
assert(sharpAsOnesOn.counted.length === 1 && sharpAsOnesOn.counted[0].kind === 'pills',
    'with the stringency on, the sharp-food sighting is excluded but the pill sighting still counts');
assert(sharpAsOnesOn.excluded.length === 1 && sharpAsOnesOn.excluded[0].reason === 'sharp',
    'the excluded sharp-food sighting is reported with its own reason, not silently dropped');

// המשך דימום — נמנה עם הראייה שקדמה לו.
const continuation = classifyReiyot([
    reiya(10000),
    reiya(10003, 'day', { closedFountain: false, durationDays: 4 })
]);
assert(continuation.counted.length === 1, 'a continued bleeding is not a separate sighting');
assert(continuation.excluded[0].reason === 'continuation', 'the continuation is reported as excluded');
assert(continuation.excluded[0].mergedInto === 10000, 'the continuation is merged into the earlier sighting');

// דימום שנמשך ארבעה ימים, אך הראייה שלפניו רחוקה מדי — היא עצמה ראייה.
const farContinuation = classifyReiyot([
    reiya(10000),
    reiya(10040, 'day', { closedFountain: false, durationDays: 4 })
]);
assert(farContinuation.counted.length === 2,
    'a bleeding recorded as continued with no earlier bleeding nearby still counts as a sighting');

// ---------- 2. וסת החודש ----------

// ג' ראיות באותו יום בחודש ובאותה עונה.
const sameDay = [
    reiya(new HDate(5, 8, 5787).abs(), 'day'),
    reiya(new HDate(5, 9, 5787).abs(), 'day'),
    reiya(new HDate(5, 10, 5787).abs(), 'day')
];
const monthVeset = analyzeChazaka(sameDay);
assert(monthVeset.established.length === 1 && monthVeset.established[0].kind === 'month',
    'three sightings on the same day-of-month in one onah establish a month veset');
assert(monthVeset.established[0].dayOfMonth === 5 && monthVeset.established[0].ona === 'day',
    'the fixed month veset carries the day-of-month and the onah');

// עונות מעורבות — לא נקבע.
const mixedOnot = analyzeChazaka([
    reiya(new HDate(5, 8, 5787).abs(), 'day'),
    reiya(new HDate(5, 9, 5787).abs(), 'night'),
    reiya(new HDate(5, 10, 5787).abs(), 'day')
]);
assert(mixedOnot.established.length === 0,
    'sightings that are not all in the same onah do not establish a veset');

// ימים שונים בחודש — לא נקבע.
const mixedDays = analyzeChazaka([
    reiya(new HDate(5, 8, 5787).abs(), 'day'),
    reiya(new HDate(6, 9, 5787).abs(), 'day'),
    reiya(new HDate(7, 10, 5787).abs(), 'day')
]);
assert(mixedDays.established.length === 0, 'sightings on different days-of-month do not establish a veset');

// הראייה השלישית מחמת אונס — הרצף נשבר ואין קביעות.
const brokenByOnes = analyzeChazaka([
    reiya(new HDate(5, 8, 5787).abs(), 'day'),
    reiya(new HDate(5, 9, 5787).abs(), 'day'),
    reiya(new HDate(5, 10, 5787).abs(), 'day', { kind: 'ones' })
]);
assert(brokenByOnes.established.length === 0,
    'a sighting marked ones breaks the run and no veset is established');
assert(brokenByOnes.progress.month.have === 2 && brokenByOnes.progress.month.need === 3,
    'the chazaka progress reports two out of three sightings');

// הראייה השלישית היא המשך דימום של השנייה — גם אז אין קביעות.
const secondAbs = new HDate(5, 9, 5787).abs();
const brokenByContinuation = analyzeChazaka([
    reiya(new HDate(5, 8, 5787).abs(), 'day'),
    reiya(secondAbs, 'day'),
    reiya(secondAbs + 2, 'day', { closedFountain: false, durationDays: 4 })
]);
assert(brokenByContinuation.established.length === 0,
    'a sighting that is a continuation of the previous one does not complete the chazaka');
assert(brokenByContinuation.warnings.length === 0, 'a consistent continuation raises no warning');

// סימון "המשך" שסותר את מניין הימים — נספרת כראייה נפרדת, ונרשמת אזהרה.
const inconsistent = analyzeChazaka([
    reiya(10000, 'day'),
    reiya(10030, 'day', { closedFountain: false, durationDays: 2 })
]);
assert(inconsistent.counted.length === 2,
    'a continuation whose day-count contradicts the gap is counted as a separate sighting');
assert(inconsistent.warnings.length === 1 && inconsistent.warnings[0].abs === 10030,
    'the contradictory marking is reported as a warning for the user');

// ---------- 3. וסת ההפלגה ----------

const haflagah = analyzeChazaka([
    reiya(10000, 'day'),
    reiya(10020, 'day'),
    reiya(10040, 'day'),
    reiya(10060, 'day')
]);
const haflagahVeset = haflagah.established.find(v => v.kind === 'haflagah');
assert(!!haflagahVeset, 'four sightings with three equal haflagot establish a haflagah veset');
assert(haflagahVeset.span === 20 && haflagahVeset.spanLabel === 21,
    'the haflagah veset carries the day-gap and the halachic count (gap + 1)');
assert(haflagahVeset.establishedBy.length === 4, 'all four sightings back the haflagah veset');

// שלוש ראיות בלבד — אין וסת הפלגה (הראשונה אינה מן המניין).
const threeOnly = analyzeChazaka([
    reiya(10000, 'day'),
    reiya(10020, 'day'),
    reiya(10040, 'day')
]);
assert(threeOnly.established.length === 0, 'three sightings alone do not establish a haflagah veset');

// ההפלגות אינן שוות — לא נקבע.
const unequal = analyzeChazaka([
    reiya(10000, 'day'),
    reiya(10020, 'day'),
    reiya(10040, 'day'),
    reiya(10065, 'day')
]);
assert(unequal.established.length === 0, 'unequal haflagot do not establish a veset');

// הראייה הראשונה של ההפלגה אינה צריכה להיות באותה עונה.
const firstOnaDiffers = analyzeChazaka([
    reiya(10000, 'night'),
    reiya(10020, 'day'),
    reiya(10040, 'day'),
    reiya(10060, 'day')
]);
assert(firstOnaDiffers.established.some(v => v.kind === 'haflagah'),
    'the first sighting of a haflagah need not share the onah');

// הראייה הרביעית בעונה אחרת — לא נקבע.
const lastOnaDiffers = analyzeChazaka([
    reiya(10000, 'day'),
    reiya(10020, 'day'),
    reiya(10040, 'day'),
    reiya(10060, 'night')
]);
assert(!lastOnaDiffers.established.some(v => v.kind === 'haflagah'),
    'a last sighting in a different onah does not complete the haflagah chazaka');

// ---------- 4. הקרנה של וסת קבוע ----------

const tevet5 = new HDate(5, 10, 5787);
const lastCounted = { abs: tevet5.abs(), hdate: tevet5, ona: 'day' };
const monthProjection = projectFixedVeset(
    { kind: 'month', ona: 'day', dayOfMonth: 5 },
    lastCounted
);
assert(monthProjection.length > 6, 'the fixed month veset is projected for the display horizon');
assert(monthProjection[0].abs === new HDate(5, 11, 5787).abs(), 'the first projected date is the next same day-of-month');
assert(monthProjection[1].abs === new HDate(5, 12, 5787).abs(), 'and the projection keeps advancing month by month');
assert(monthProjection.every(e => e.ona === 'day' && e.code === 'וק"ח'), 'every projected date carries the veset onah and code');

// הקרנה עד אופק התצוגה בלבד.
const shortHorizon = projectFixedVeset({ kind: 'month', ona: 'day', dayOfMonth: 5 }, lastCounted, 40);
assert(shortHorizon.length === 1, 'the projection stops at the display horizon (not forever)');
assert(monthProjection.length < 40, 'the projection is bounded, and is not an endless list');

// וסת הפלגה: כל הפלגה מהראייה האחרונה והלאה.
const haflagahProjection = projectFixedVeset(
    { kind: 'haflagah', ona: 'night', span: 20, spanLabel: 21 },
    { abs: 10060, hdate: new HDate(10060), ona: 'night' },
    61
);
assert(haflagahProjection.length === 3, 'a fixed haflagah is projected every span days');
assert(haflagahProjection[0].abs === 10080 && haflagahProjection[1].abs === 10100,
    'each projected haflagah date is one span after the previous one');
assert(haflagahProjection.every(e => e.ona === 'night' && e.code === 'וק"ה'), 'projected haflagah dates keep the onah');

// וסת קבוע ביום ל' — בחודש חסר אין יום ל', ולכן מסומנים שני התאריכים (מחלוקת).
const nisan30 = new HDate(30, 1, 5786);
const sivan30 = new HDate(30, 3, 5786);
const av30 = new HDate(30, 5, 5786);
const dayThirty = analyzeChazaka([
    reiya(nisan30.abs(), 'day'),
    reiya(sivan30.abs(), 'day'),
    reiya(av30.abs(), 'day')
]);
assert(dayThirty.established.length === 1 && dayThirty.established[0].dayOfMonth === 30,
    'a fixed veset can be established on the 30th of the month');

const thirtyProjection = projectFixedVeset(dayThirty.established[0],
    { abs: av30.abs(), hdate: av30, ona: 'day' });
const disputedProjection = thirtyProjection.filter(e => e.code === 'וק"ח*');
assert(disputedProjection.length >= 2, 'a day-30 fixed veset marks both days of the dispute in a short month');
assert(disputedProjection[0].abs === new HDate(29, 6, 5786).abs(),
    'the first disputed day is the last day of the short month (29 Elul 5786)');
assert(disputedProjection.some(e => e.abs === new HDate(30, 7, 5787).abs()),
    'the second is the 30th of the first later month that has one (30 Tishrei 5787)');
assert(thirtyProjection.some(e => e.code === 'וק"ח' && e.abs === new HDate(30, 7, 5787).abs()),
    'and Tishrei 30 is also marked as the veset itself, since that month does have a 30th');

assert(describeVeset({ kind: 'month', ona: 'day', dayOfMonth: 5 }).indexOf('ה\'') !== -1,
    'describeVeset names the day-of-month in Hebrew');
assert(describeVeset({ kind: 'haflagah', ona: 'night', span: 20, spanLabel: 21 }).indexOf('21') !== -1,
    'describeVeset names the haflagah count');

// ---------- 5. השילוב במנוע החישוב ----------

const first = new HDate(5, 8, 5787).abs();
const second = new HDate(5, 9, 5787).abs();
const third = new HDate(5, 10, 5787).abs();
const db = {
    [first]: { type: 'reiyah', ona: 'day' },
    [second]: { type: 'reiyah', ona: 'day' },
    [third]: { type: 'reiyah', ona: 'day' }
};

const engineData = calculateEngine(db, false);
const codesOn = (abs) => (engineData.computed.prishot[abs] || []).map(p => p.code);
const allCodes = Object.values(engineData.computed.prishot).flat().map(p => p.code);

assert(engineData.chazaka.established.length === 1, 'the engine reports the established veset');
assert(allCodes.indexOf('וק"ח') !== -1, 'the fixed veset is marked in the calendar');
assert(allCodes.indexOf('עו"ב') === -1, 'no ona beinonit is shown for a woman with a fixed veset');
assert(allCodes.indexOf('עו"ל') === -1, 'no day-31 beinonit is shown either');
assert(allCodes.indexOf('יו"ח') === -1 && allCodes.indexOf('יו"ח*') === -1,
    'the ordinary day-of-month concerns are replaced by the fixed veset');
assert(allCodes.indexOf('עו"ה') === -1, 'the ordinary haflagah concerns are set aside too');

const nextMonth5 = new HDate(5, 11, 5787).abs();
assert(codesOn(nextMonth5).indexOf('וק"ח') !== -1, 'the next month of the fixed veset is marked');
const monthAfter = new HDate(5, 12, 5787).abs();
assert(codesOn(monthAfter).indexOf('וק"ח') !== -1, 'and the month after it, since the veset keeps standing');

assert(engineData.computed.suppressed.length > 0, 'what was set aside is reported, not silently dropped');
assert(engineData.computed.suppressed.filter(s => s.code === 'עו"ב').length === 3,
    'every sighting\'s ona beinonit was set aside, and is listed as such');
assert(engineData.computed.suppressed.every(s => !engineData.computed.prishot[s.abs] ||
    engineData.computed.prishot[s.abs].every(p => p.code !== s.code)),
    'no set-aside concern is left marked in the calendar');
assert(engineData.computed.suppressed.some(s => s.code === 'עו"ב'),
    'the set-aside list names the concerns that were dropped (ona beinonit among them)');
assert(engineData.computed.suppressed.every(s => !!s.text),
    'every set-aside concern carries the explanation shown to the user');

// ראייה שאינה נספרת מסומנת גם ברשומות המנוע.
const dbWithOnes = {
    [first]: { type: 'reiyah', ona: 'day' },
    [second]: { type: 'reiyah', ona: 'day' },
    [third]: { type: 'reiyah', ona: 'day', kind: 'ones' }
};
const onesData = calculateEngine(dbWithOnes, false);
assert(onesData.chazaka.established.length === 0, 'a ones sighting prevents the establishment of a veset');
const onesReiya = onesData.reiyot.find(r => r.abs === third);
assert(onesReiya.counted === false && onesReiya.exclusion.reason === 'ones',
    'the engine marks the sighting that was not counted');
assert(Object.values(onesData.computed.prishot).flat().some(p => p.code === 'עו"ב'),
    'without a fixed veset the ordinary concerns are still shown');

// וסת הפלגה במנוע: ד' ראיות בהפלגות שוות.
const hafDb = {
    10000: { type: 'reiyah', ona: 'day' },
    10020: { type: 'reiyah', ona: 'day' },
    10040: { type: 'reiyah', ona: 'day' },
    10060: { type: 'reiyah', ona: 'day' }
};
// today is pinned right after the last sighting: the point here is establishment,
// and a veset that has been left behind for span*3-2 days is UPROOTED (js/akira.js).
const hafData = calculateEngine(hafDb, false, { today: 10061 });
const hafCodes = Object.values(hafData.computed.prishot).flat().map(p => p.code);
assert(hafCodes.indexOf('וק"ה') !== -1, 'the fixed haflagah veset is marked in the calendar');
assert(hafCodes.indexOf('עו"ה') === -1, 'the ordinary haflagah concern is replaced by the fixed one');
assert(!!(hafData.computed.prishot[10080] || []).some(p => p.code === 'וק"ה'),
    'the fixed haflagah lands one span after the last sighting');

// אור זרוע נוהג גם בוסת קבוע.
const ozData = calculateEngine(db, true);
const ozCodes = Object.values(ozData.computed.prishot).flat().map(p => p.code);
assert(ozCodes.indexOf('עוא"ז') !== -1, 'Or Zarua is applied to the fixed veset as well');

// המתג: כיבוי מנוע החזקה מחזיר בדיוק את ההתנהגות הקודמת.
const legacy = calculateEngine(db, false, { chazaka: false });
const legacyCodes = Object.values(legacy.computed.prishot).flat().map(p => p.code);
assert(legacy.chazaka === null, 'with the engine off there is no chazaka verdict');
assert(legacyCodes.indexOf('עו"ב') !== -1, 'with the engine off ona beinonit is shown again');
assert(legacyCodes.indexOf('וק"ח') === -1, 'with the engine off no fixed veset is marked');
assert(legacy.computed.suppressed.length === 0, 'with the engine off nothing is set aside');

// מנוע חזקה דלוק כברירת מחדל גם כשהאפשרויות לא נמסרו.
const defaultData = calculateEngine(db, false, undefined);
assert(defaultData.chazaka !== null && defaultData.chazaka.established.length === 1,
    'the chazaka engine is on by default');

// ---------- 6. פאנל התצוגה ----------
// ui.js הוא מודול דפדפן; נותנים לו את ה-DOM המינימלי שהוא נזקק לו בבדיקה הזו.
const stub = { innerHTML: '', className: '', style: { display: '' } };
global.document = {
    getElementById: (id) => (id === 'chazaka-container' ? stub : null),
    querySelector: () => null,
    addEventListener: () => {}
};
const { updateChazakaPanel } = await import('../js/ui.js');

updateChazakaPanel(engineData);
assert(stub.style.display === 'block', 'the chazaka panel is shown once a veset is established');
assert(stub.innerHTML.indexOf('נקבעה וסת קבועה') !== -1, 'the panel announces the fixed veset');
assert(stub.innerHTML.indexOf('ה\' בחודש') !== -1, 'the panel spells out the day-of-month of the veset');
assert(stub.innerHTML.indexOf('data-help="kviut"') !== -1,
    'the panel links to the halachic explanation instead of just asserting');
assert(stub.className.indexOf('dash-green') !== -1, 'an established veset is shown as a success, not a warning');

// בלי קביעות — הפאנל לא מוצג כשאין מה לומר.
updateChazakaPanel({ reiyot: [], chazaka: null });
assert(stub.style.display === 'none', 'with the engine off the panel is hidden');

// Nothing has passed yet, so there is nothing to report.
const single = calculateEngine({ 10000: { type: 'reiyah', ona: 'day' } }, false, { today: 10020 });
updateChazakaPanel(single);
assert(stub.style.display === 'none', 'a single sighting alone does not open the panel');

// A veset time that passed with no check IS reported - as a safety state.
const overdue = calculateEngine({ 10000: { type: 'reiyah', ona: 'day' } }, false, { today: 10035 });
updateChazakaPanel(overdue);
assert(stub.style.display === 'block' && stub.innerHTML.indexOf('ולא נבדקה בדיקה כדין') !== -1,
    'a passed veset time with no check is surfaced in the panel');
assert(stub.className.indexOf('dash-red') !== -1,
    'the missing check is presented as a prohibition, not as a note');

// נתונים סותרים — הפאנל מציג אזהרה במקום לקבוע וסת בשקט.
const warned = calculateEngine({
    10000: { type: 'reiyah', ona: 'day' },
    10030: { type: 'reiyah', ona: 'day', closedFountain: false, durationDays: 2 }
}, false);
updateChazakaPanel(warned);
assert(stub.style.display === 'block' && stub.innerHTML.indexOf('נתונים שאינם מתיישבים') !== -1,
    'a self-contradicting entry is surfaced in the panel');

if (failures > 0) {
    console.error('\n' + failures + ' test(s) failed.');
    process.exit(1);
} else {
    console.log('\nAll tests passed.');
}
