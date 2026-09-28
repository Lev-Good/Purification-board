/**
 * בדיקות למנוע העקירה (js/akira.js) ולשילובו במנוע החישוב.
 *
 * Run with: node tests/akira.test.js
 *
 * מה נבדק:
 *  1. עקירת וסת שאינו קבוע: עבר זמנו ולא ראתה — נעקר מיד `[שט ל"ג | עמ' 111]`.
 *  2. עקירת וסת קבוע: ג' זמנים רצופים **בצירוף בדיקה כדין** `[שט מ"א | עמ' 182]`.
 *  3. קינוח לבד אינו מועיל; בדיקה שנעשתה באיחור מועילה.
 *  4. עקירת וסת הפלגה במניין הימים: `periodsToClear(span) = span * 3 - 2`.
 *  5. מצב הבטיחות: עבר הזמן ולא נבדקה — אסורה עד שתבדוק `[שט כ"ד | עמ' 7]`.
 *  6. מחלוקת חזרת הוסת לאחר עקירה `[שט מ"א | עמ' 183]`.
 */
import { periodsToClear, analyzeAkirot, extractChecks, findPendingChecks, isConcernUprooted } from '../js/akira.js';
import { calculateEngine, projectFixedVeset } from '../js/calculations.js';
import { analyzeChazaka } from '../js/chazaka.js';
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

function reiya(abs, ona, extra) {
    return Object.assign({ abs, ona: ona || 'day', hdate: new HDate(abs), counted: true }, extra || {});
}

const projectFn = (veset, lastCounted) => projectFixedVeset(veset, lastCounted, 4000);

// ---------- 1. מניין העקירה ----------

assert(periodsToClear(20) === 58, 'a haflagah of 20 is uprooted after 58 days (3 periods, a sighting day counts twice)');
assert(periodsToClear(28) === 82, 'a haflagah of 28 is uprooted after 82 days');
assert(periodsToClear(2) === 4, 'the count holds for short haflagot as well');

// ---------- 2. וסת שאינו קבוע נעקר מיד ----------

const today = 50000;
assert(isConcernUprooted({ abs: today - 1 }, [], today) === true,
    'a non-fixed concern whose day passed with no sighting is uprooted');
assert(isConcernUprooted({ abs: today }, [], today) === false,
    'today is not uprooted - the onah may not have passed yet');
assert(isConcernUprooted({ abs: today + 5 }, [], today) === false, 'a future concern is not uprooted');
assert(isConcernUprooted({ abs: today - 1 }, [reiya(today - 1)], today) === false,
    'a concern whose day she DID see is not uprooted');

// ---------- 3. עקירת וסת קבוע: ג' זמנים ובדיקה ----------

// וסת החודש של ה' בחודש: שלוש ראיות בחמישי לחודש, בעונת יום.
const cheshvan5 = new HDate(5, 8, 5787);
const kislev5 = new HDate(5, 9, 5787);
const tevet5 = new HDate(5, 10, 5787);
const sightings = [
    reiya(cheshvan5.abs(), 'day'),
    reiya(kislev5.abs(), 'day'),
    reiya(tevet5.abs(), 'day')
];
const chazaka = analyzeChazaka(sightings);
assert(chazaka.established.length === 1, 'the three sightings establish a fixed month veset');

const veset = chazaka.established[0];
const shvat5 = new HDate(5, 11, 5787);
const adar5 = new HDate(5, 12, 5787);
const adarII5 = new HDate(5, 13, 5787);

/** מריצה את המנוע עם בדיקות נתונות. */
function runAkirot(checks, todayAbs) {
    return analyzeAkirot({
        reiyot: sightings,
        established: chazaka.established,
        lastCounted: chazaka.lastCounted,
        checks,
        today: todayAbs,
        project: projectFn
    });
}

// כלום לא בדקה — הוסת לא נעקר, וזמני הוסת ממתינים לבדיקה.
const noChecks = runAkirot([], shvat5.abs() + 1);
assert(noChecks.active.length === 1 && noChecks.uprooted.length === 0,
    'with no checks at all the fixed veset is NOT uprooted');
assert(noChecks.fixed[0].clearedCount === 0, 'an unchecked due time does not count toward uprooting');
assert(noChecks.fixed[0].pending.length === 1, 'the passed due time is reported as still waiting for a check');
assert(noChecks.pendingChecks.length === 1 && noChecks.pendingChecks[0].abs === shvat5.abs(),
    'the safety state names the passed veset time');

// בדיקה אחת — עדיין לא נעקר (צריך שלש).
const oneCheck = runAkirot([{ abs: shvat5.abs(), ona: 'day', depth: 'deep' }], shvat5.abs() + 1);
assert(oneCheck.fixed[0].clearedCount === 1 && !oneCheck.fixed[0].cleared,
    'one proper check is not enough to uproot a fixed veset');
assert(oneCheck.pendingChecks.length === 0, 'a checked due time is no longer a pending obligation');

// שתי בדיקות — עדיין לא נעקר.
const twoChecks = runAkirot([
    { abs: shvat5.abs(), ona: 'day', depth: 'deep' },
    { abs: adar5.abs(), ona: 'day', depth: 'deep' }
], adar5.abs() + 1);
assert(twoChecks.fixed[0].clearedCount === 2 && !twoChecks.fixed[0].cleared,
    'two proper checks are still not enough');

// שלוש בדיקות — נעקר.
const threeChecks = runAkirot([
    { abs: shvat5.abs(), ona: 'day', depth: 'deep' },
    { abs: adar5.abs(), ona: 'day', depth: 'deep' },
    { abs: adarII5.abs(), ona: 'day', depth: 'deep' }
], adarII5.abs() + 1);
assert(threeChecks.fixed[0].cleared === true && threeChecks.fixed[0].clearedBy === 'checks',
    'three consecutive due times with a proper check uproot the fixed veset');
assert(threeChecks.uprooted.length === 1 && threeChecks.active.length === 0,
    'the uprooted veset is reported, and none stands any more');
assert(threeChecks.fixed[0].clearedAtAbs === adarII5.abs(),
    'the uprooting is dated at the third checked due time');

// קינוח לבד — אינו מועיל.
const wipeOnly = runAkirot([
    { abs: shvat5.abs(), ona: 'day', depth: 'wipe' },
    { abs: adar5.abs(), ona: 'day', depth: 'wipe' },
    { abs: adarII5.abs(), ona: 'day', depth: 'wipe' }
], adarII5.abs() + 1);
assert(wipeOnly.fixed[0].clearedCount === 0 && !wipeOnly.fixed[0].cleared,
    'a wipe-only record does not uproot the veset');
assert(wipeOnly.pendingChecks.length >= 3, 'and all three due times stay pending');

// בדיקה בעונה האחרת באותו יום — אינה מכסה.
const wrongOna = runAkirot([{ abs: shvat5.abs(), ona: 'night', depth: 'deep' }], shvat5.abs() + 1);
assert(wrongOna.fixed[0].clearedCount === 0,
    'a check on the same day but in the other onah does not cover a day-onah due time');

// בדיקה שנעשתה באיחור — מועילה `[שט מ"א | עמ' 183]`.
const lateCheck = runAkirot([{ abs: shvat5.abs() + 3, ona: 'night', depth: 'deep' }], shvat5.abs() + 4);
assert(lateCheck.fixed[0].clearedCount === 1,
    'a check made a few days late still counts for uprooting');

// ראתה בזמן הוסת — הזמן לא עבר "בלא ראייה", והמניין מתאפס.
const sawOnDue = analyzeAkirot({
    reiyot: sightings.concat([reiya(shvat5.abs(), 'day')]),
    established: chazaka.established,
    lastCounted: chazaka.lastCounted,
    checks: [{ abs: adar5.abs(), ona: 'day', depth: 'deep' }],
    today: adar5.abs() + 1,
    project: projectFn
});
assert(sawOnDue.fixed[0].dueTimes.some(d => d.abs === shvat5.abs() && d.status === 'seen'),
    'a due time she saw on is marked as seen');
assert(sawOnDue.fixed[0].clearedCount === 1,
    'seeing on a due time resets the count, so only the later check counts');

// ---------- 4. עקירת וסת הפלגה במניין הימים ----------

const hafSightings = [reiya(30000), reiya(30020), reiya(30040), reiya(30060)];
const hafChazaka = analyzeChazaka(hafSightings);
const hafVeset = hafChazaka.established.find(v => v.kind === 'haflagah');
assert(!!hafVeset, 'the haflagah veset is established for the interval test');

const notYet = analyzeAkirot({
    reiyot: hafSightings, established: hafChazaka.established, lastCounted: hafChazaka.lastCounted,
    checks: [], today: 30060 + 57, project: projectFn
});
assert(!notYet.fixed.find(f => f.veset === hafVeset).cleared,
    'before span*3-2 days the haflagah veset still stands');

const byInterval = analyzeAkirot({
    reiyot: hafSightings, established: hafChazaka.established, lastCounted: hafChazaka.lastCounted,
    checks: [], today: 30060 + 58, project: projectFn
});
const clearedHaf = byInterval.fixed.find(f => f.veset === hafVeset);
assert(clearedHaf.cleared === true && clearedHaf.clearedBy === 'interval',
    'after 58 days without a sighting a haflagah of 20 is uprooted - and no check is needed for it');
assert(clearedHaf.interval.needed === 58, 'the interval path reports the days required (58)');

// ---------- 5. מחלוקת חזרת הוסת ----------

const returned = analyzeAkirot({
    reiyot: sightings.concat([
        reiya(new HDate(5, 1, 5787).abs(), 'day'),      // ה' ניסן — תבנית הוסת שחזרה
        reiya(new HDate(5, 2, 5787).abs(), 'day')       // ה' אייר
    ]),
    established: chazaka.established,
    lastCounted: chazaka.lastCounted,
    checks: [
        { abs: shvat5.abs(), ona: 'day', depth: 'deep' },
        { abs: adar5.abs(), ona: 'day', depth: 'deep' },
        { abs: adarII5.abs(), ona: 'day', depth: 'deep' }
    ],
    today: new HDate(5, 2, 5787).abs() + 1,
    project: projectFn
});
assert(returned.uprooted.length === 1, 'the veset stays uprooted');
assert(returned.returnDispute.length === 1,
    'sightings in the old pattern after the uprooting raise the return dispute');
assert(returned.returnDispute[0].sightings.length === 2,
    'both sightings in the old pattern are named in the dispute');
assert(returned.returnDispute[0].clearedAtAbs === adarII5.abs(),
    'the dispute is measured from the day the veset was uprooted');

// ---------- 6. בדיקות מתוך ה-db ----------

const checkDb = {
    40000: { type: 'check', ona: 'day', depth: 'deep', note: '' },
    40001: { type: 'check', ona: 'night', depth: 'wipe', note: '' },
    40002: { type: 'check', ona: 'night', note: '' },              // no depth -> deep by default
    40003: { type: 'reiyah', ona: 'day' }
};
const extracted = extractChecks(checkDb);
assert(extracted.length === 3, 'only check records are extracted from the db');
assert(extracted[0].depth === 'deep' && extracted[1].depth === 'wipe',
    'the recorded depth is kept');
assert(extracted[2].depth === 'deep', 'a check with no recorded depth is a proper check');

// ---------- 7. השילוב במנוע החישוב ----------

// ראיות בעבר, בלי בדיקות: החששות שעברו מסומנים כנעקרים, והם עדיין מוצגים.
const engineData = calculateEngine({
    20000: { type: 'reiyah', ona: 'day' },
    20035: { type: 'reiyah', ona: 'day' }
}, false, { today: 20060 });
const pastEntry = engineData.computed.prishot[20029];
assert(!!pastEntry && pastEntry.every(p => p.uprooted === true),
    'a past concern is marked as uprooted in the calendar');
assert(pastEntry[0].reason.indexOf('נעקר') !== -1, 'and its reason says so');
assert(engineData.computed.uprooted.length > 0, 'the uprooted concerns are reported for the panel');
assert((engineData.computed.prishot[20064] || []).every(p => !p.uprooted),
    'a concern that has not passed yet is not marked uprooted');
assert(engineData.computed.pendingChecks.some(p => p.abs === 20029),
    'the passed, unchecked veset time is reported as an obligation to check');

// כיבוי המנוע מחזיר את ההתנהגות הקודמת: שום דבר אינו מסומן כנעקר.
const legacy = calculateEngine({
    20000: { type: 'reiyah', ona: 'day' }
}, false, { today: 20060, akirot: false });
assert(legacy.computed.uprooted.length === 0 && legacy.computed.pendingChecks.length === 0,
    'with the uprooting engine off nothing is uprooted and no check is demanded');
assert(!!legacy.computed.prishot[20029] && !legacy.computed.prishot[20029][0].uprooted,
    'and the past concern is shown as before');

// וסת קבוע שנעקר — חוזרים לחול שלושת החששות הרגילים.
const fixedDb = {
    [cheshvan5.abs()]: { type: 'reiyah', ona: 'day' },
    [kislev5.abs()]: { type: 'reiyah', ona: 'day' },
    [tevet5.abs()]: { type: 'reiyah', ona: 'day' },
    [shvat5.abs()]: { type: 'check', ona: 'day', depth: 'deep' },
    [adar5.abs()]: { type: 'check', ona: 'day', depth: 'deep' },
    [adarII5.abs()]: { type: 'check', ona: 'day', depth: 'deep' }
};
const clearedDb = calculateEngine(fixedDb, false, { today: adarII5.abs() + 1 });
const clearedCodes = Object.values(clearedDb.computed.prishot).flat().map(p => p.code);
assert(clearedDb.akirot.uprooted.length === 1, 'the engine reports the uprooted fixed veset');
assert(clearedCodes.indexOf('וק"ח') === -1, 'an uprooted fixed veset is not marked any more');
assert(clearedCodes.indexOf('עו"ב') !== -1,
    'once the fixed veset is uprooted the ordinary concerns apply again');

// כלום לא נבדק — הוסת הקבועה עומדת, ויש חובת בדיקה.
const pendingDb = Object.assign({}, fixedDb);
delete pendingDb[shvat5.abs()];
delete pendingDb[adar5.abs()];
delete pendingDb[adarII5.abs()];
const pendingData = calculateEngine(pendingDb, false, { today: adarII5.abs() + 1 });
const pendingCodes = Object.values(pendingData.computed.prishot).flat().map(p => p.code);
assert(pendingCodes.indexOf('וק"ח') !== -1, 'without checks the fixed veset keeps standing');
assert(pendingCodes.indexOf('עו"ב') === -1, 'and it keeps replacing the ordinary concerns');
assert(pendingData.computed.pendingChecks.length === 3,
    'all three passed due times are reported as obligations to check');

// בדיקה שמתועדת על התאריך בלוח — מוציאה אותו מרשימת החובה.
const partlyChecked = calculateEngine(Object.assign({}, pendingDb, {
    [shvat5.abs()]: { type: 'check', ona: 'day', depth: 'deep' }
}), false, { today: adarII5.abs() + 1 });
assert(partlyChecked.computed.pendingChecks.length === 2,
    'a recorded check removes its due time from the obligation list');
assert(partlyChecked.computed.pendingChecks.every(p => p.abs !== shvat5.abs()),
    'the checked due time is the one removed');

// findPendingChecks: בדיקה באותו תאריך ובאותה עונה מסלקת את החשש.
const concernMap = { 60000: [{ reason: 'עונה בינונית', ona: 'day', code: 'עו"ב' }] };
assert(findPendingChecks(concernMap, [], [], 60001).length === 1, 'an unchecked concern is pending');
assert(findPendingChecks(concernMap, [], [{ abs: 60000, ona: 'day', depth: 'deep' }], 60001).length === 0,
    'a proper check on the day clears it');
assert(findPendingChecks(concernMap, [], [{ abs: 60000, ona: 'day', depth: 'wipe' }], 60001).length === 1,
    'a wipe does not clear it');
assert(findPendingChecks(concernMap, [reiya(60000)], [], 60001).length === 0,
    'a sighting on that day makes the check moot');

if (failures > 0) {
    console.error('\n' + failures + ' test(s) failed.');
    process.exit(1);
} else {
    console.log('\nAll tests passed.');
}
