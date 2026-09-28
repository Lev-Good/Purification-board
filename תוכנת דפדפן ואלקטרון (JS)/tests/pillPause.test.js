/**
 * בדיקות לחשש יום ההפסקה בכדורים (A5) ולפטור מעונת אור זרוע בוסת מכדורים (A7).
 *
 * Run with: node tests/pillPause.test.js
 *
 * מה נבדק:
 *  1. טבע הכדורים — "רואה מיד אחר שני ימים עד חמשה ימים" `[שט כ"ז | עמ' 40]`:
 *     היום הראשון מותר, ומיום השני עד החמישי יש חשש.
 *  2. קבעה לה יום — חוששת לאותו יום בהפסקה הבאה, ובג' פעמים כדין וסת קבוע
 *     `[שט כ"ז | עמ' 40]`.
 *  3. "אין זה וסת קבוע גמור... ויש להחמיר שדינה גם כאשה שאין לה וסת קבוע"
 *     `[שט כ"ז | עמ' 41]` — החשש אינו מבטל את שאר החששות ואינו יוצר דרישת בדיקה.
 *  4. A7 — "לעונת האור זרוע אין צריכה לחשוש" `[שט כ"ז | עמ' 40]`: הן חשש יום
 *     ההפסקה והן ראייה שסומנה כמחמת כדורים אינם מוסיפים אור זרוע.
 *  5. הפסקה שחלה בתוך סילוק אחר (הריון/הנקה) אינה מייצרת חשש.
 */
import { HDate } from '../hebcal.js';
import { calculateEngine } from '../js/calculations.js';
import {
    analyzeLifeState, pauseRuleOfPillType, normalizeLifeState,
    PILL_PAUSE_REASONS, PILL_PAUSE_REASON_DEFAULT, PILL_PAUSE_REASON_RULE
} from '../js/lifeState.js';
import {
    analyzePillPause, pillPauses, pauseDayNumber, PAUSE_CODE,
    PILL_PAUSE_FIRST_DAY, PILL_PAUSE_LAST_DAY
} from '../js/pillPause.js';

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
const base = d(1, 1, 5786);

const all = (data, code) => Object.keys(data.computed.prishot)
    .reduce((acc, abs) => acc.concat((data.computed.prishot[abs] || [])
        .filter(p => p.code === code).map(p => ({ abs: Number(abs), ona: p.ona, reason: p.reason }))), []);
const pauseEntries = (data, abs) => (data.computed.prishot[abs] || []).filter(p => p.code === PAUSE_CODE);
const pauseVerdict = (life, reiyot, today) => analyzePillPause({
    life: analyzeLifeState({ life, reiyot: reiyot || [], today }), reiyot: reiyot || [], today
});
const reiya = (abs, ona, extra) => Object.assign({ abs, ona, hdate: new HDate(abs) }, extra || {});
const dbOf = (list) => {
    const db = {};
    list.forEach(r => { db[r.abs] = { type: 'reiyah', ona: r.ona, kind: r.kind || 'regular' }; });
    return db;
};

// ---------- 1. טבע הכדורים: יום א' מותר, ימים ב'–ה' בחשש ----------

const p1 = { startAbs: base, endAbs: base + 29, type: 'combined' };
const life1 = { enabled: true, pills: [p1] };
const pause1 = base + 29;

const idle = calculateEngine({}, false, { today: base + 60, life: life1 });
assert(idle.pillPause.configured === true && idle.pillPause.pauses.length === 1,
    'a recorded pill pause produces the pause-day verdict');
assert(pauseEntries(idle, pause1).length === 0,
    'the last day of taking pills itself carries no concern');
assert(pauseEntries(idle, pause1 + 1).length === 0,
    'day 1 after the pause is permitted - "כיון שאין מצוי שתראה"');
for (let day = PILL_PAUSE_FIRST_DAY; day <= PILL_PAUSE_LAST_DAY; day++) {
    const entries = pauseEntries(idle, pause1 + day);
    assert(entries.length === 2 && entries.some(p => p.ona === 'day') && entries.some(p => p.ona === 'night'),
        `day ${day} after the pause is marked in both onas (the source fixes the days, not the ona)`);
}
assert(pauseEntries(idle, pause1 + PILL_PAUSE_LAST_DAY + 1).length === 0,
    'the concern does not continue past the fifth day');

const verdict1 = idle.pillPause;
assert(verdict1.notes.some(n => n.source.indexOf('עמ\' 40') !== -1),
    'the panel is given the source of the din, so nothing is claimed without a mareh makom');
assert(verdict1.notes.some(n => n.title.indexOf('אור זרוע') !== -1),
    'and the Or Zarua exemption (A7) is stated in the notes');

// תקופה שסיומה לא נרשם — היא עדיין נוטלת, ואין הפסקה.
const openVerdict = pauseVerdict({ enabled: true, pills: [{ startAbs: base, endAbs: null }] }, [], base + 60);
assert(openVerdict.configured === false && openVerdict.pauses.length === 0,
    'a pill period without a recorded stop is not a pause');
assert(pauseVerdict({ enabled: true, pills: [] }, [], base + 60).configured === false,
    'without pills there is no pause-day din at all');
assert(pauseVerdict({ enabled: false, pills: [p1] }, [], base + 60).configured === false,
    'when the life state is switched off the pause-day din is switched off too');

// תקופה שעתידה להסתיים — טרם הופסקה בפועל.
const futureStop = pauseVerdict({ enabled: true, pills: [{ startAbs: base, endAbs: base + 60 }] }, [], base + 20);
assert(futureStop.pauses.length === 0,
    'a stop date that has not arrived yet is not a pause that happened');

// ---------- 2. קבעה לה יום להפסקה ----------

const p2 = { startAbs: base + 70, endAbs: base + 100, type: 'combined' };
const reiyot2 = [reiya(base + 32, 'night')]; // יום ג' שאחרי ההפסקה הראשונה
const life2 = { enabled: true, pills: [p1, p2] };
const established = calculateEngine(dbOf(reiyot2), false, { today: base + 120, life: life2 });

assert(established.pillPause.established.length === 1
    && established.pillPause.established[0].offsetDays === 3
    && established.pillPause.established[0].ona === 'night',
    'a sighting on day 3 after a pause establishes day 3 (night) for her');
assert(established.pillPause.established[0].fixed === false,
    'one sighting is a veset she is concerned about - not a fixed one');

const pause2 = base + 100;
const day3 = pauseEntries(established, pause2 + 3);
assert(day3.length === 1 && day3[0].ona === 'night',
    'at the next pause only the established ona is marked on her own day');
assert(day3[0].reason.indexOf('אינו קבוע') !== -1,
    'and it is labelled as a non-fixed veset');
const day4 = pauseEntries(established, pause2 + 4);
assert(day4.length === 1 && day4[0].ona === 'night',
    'the other days of the window follow her own established ona');

// ---------- 3. קביעות בג' פעמים — ואינה קביעות גמורה ----------

const pauses = [
    { startAbs: base, endAbs: base + 29, type: 'combined' },
    { startAbs: base + 70, endAbs: base + 99, type: 'combined' },
    { startAbs: base + 140, endAbs: base + 169, type: 'combined' },
    { startAbs: base + 210, endAbs: base + 239, type: 'combined' }
];
const threeTimes = [
    reiya(base + 32, 'night'), reiya(base + 102, 'night'), reiya(base + 172, 'night')
];
const fixedVerdict = analyzePillPause({
    life: analyzeLifeState({ life: { enabled: true, pills: pauses }, reiyot: threeTimes, today: base + 260 }),
    reiyot: threeTimes,
    today: base + 260
});
const fixedEntry = fixedVerdict.established.find(e => e.offsetDays === 3);
assert(fixedEntry && fixedEntry.fixed === true && fixedEntry.count === 3,
    'three sightings on the same day after a pause fix that day - "כדין וסת קבוע"');
const fixedConcern = fixedVerdict.concerns.find(c => c.abs === base + 239 + 3);
assert(fixedConcern && fixedConcern.fixed === true && fixedConcern.reason.indexOf('נקבעה') !== -1,
    'the fixed pause-day is reported as such on the calendar');
assert(fixedVerdict.notes.some(n => n.title.indexOf('קביעות גמורה') !== -1),
    'and the le-maase note is shown - it is "אין זה וסת קבוע גמור"');

const fixedEngine = calculateEngine(
    dbOf(threeTimes.concat([reiya(base + 245, 'day')])), false,
    { today: base + 260, life: { enabled: true, pills: pauses } });
assert(all(fixedEngine, PAUSE_CODE).length > 0,
    'the pause-day concerns are placed on the calendar by the engine');
assert(all(fixedEngine, 'עו"ב').length > 0,
    'a fixed pause-day does NOT replace the other concerns - "דינה גם כאשה שאין לה וסת קבוע"');
assert(!(fixedEngine.computed.pendingChecks || []).some(p => p.code === PAUSE_CODE),
    'the pause-day concern creates no "אסורה עד שתבדוק" demand - the source says to separate, not to check');

// ---------- 4. פטור מעונת אור זרוע (A7) ----------

const orZaruaLife = { enabled: true, pills: [p1, p2] };
const withoutOrZarua = calculateEngine({}, false, { today: base + 130, life: orZaruaLife });
const withOrZarua = calculateEngine({}, true, { today: base + 130, life: orZaruaLife });
const orZaruaNearPause = Object.keys(withOrZarua.computed.prishot)
    .map(Number)
    .filter(abs => abs >= pause2 && abs <= pause2 + PILL_PAUSE_LAST_DAY)
    .some(abs => (withOrZarua.computed.prishot[abs] || []).some(p => p.code === 'עוא"ז'));
assert(orZaruaNearPause === false,
    'the Or Zarua shift is NOT added to the pause-day concern - "לעונת האור זרוע אין צריכה לחשוש"');
assert(all(withOrZarua, PAUSE_CODE).length === all(withoutOrZarua, PAUSE_CODE).length,
    'and the pause-day concern itself is identical whether Or Zarua is on or off');

// ראייה שסומנה כמחמת כדורים — גם היא בלי אור זרוע.
const pillSighting = reiya(base + 40, 'day', { kind: 'pills' });
const pillSightingEngine = calculateEngine(dbOf([pillSighting]), true, { today: base + 130, life: null });
const pillCodes = all(pillSightingEngine, 'עוא"ז');
assert(pillCodes.length === 0,
    'a sighting marked as caused by pills adds no Or Zarua shift');
const regularEngine = calculateEngine(dbOf([reiya(base + 40, 'day')]), true, { today: base + 130, life: null });
assert(all(regularEngine, 'עוא"ז').length > 0,
    'while a regular sighting does add it - so the exemption is the marking, not a global switch');

// ---------- 5. הפסקה בתוך סילוק אחר ----------

const inPregnancy = pauseVerdict({
    enabled: true,
    pregnancyAbs: base - 10,
    pills: [{ startAbs: base + 90, endAbs: base + 100, type: 'combined' }]
}, [], base + 120);
assert(inPregnancy.pauses.length === 0,
    'a pill pause that falls inside the pregnancy dormancy produces no pause-day concern');

// ---------- 6. יחידות: עזרי המודול ----------

assert(pauseDayNumber({ endAbs: base + 29 }, base + 29) === 0
    && pauseDayNumber({ endAbs: base + 29 }, base + 30) === 1
    && pauseDayNumber({ endAbs: base + 29 }, base + 20) === null,
    'the pause day itself is 0, the day after is 1, and a day before is not part of the pause');
const badPeriod = analyzeLifeState({
    life: { pills: [{ startAbs: base + 10, endAbs: base + 5 }] }, reiyot: [], today: base + 20
});
assert(badPeriod.pills.periods.length === 1 && badPeriod.pills.periods[0].endAbs === null,
    'a stop date before the start is dropped rather than trusted');
assert(pillPauses(badPeriod, base + 20).length === 0,
    'and such a period is treated as one she is still taking - so no pause concern is created');

// ---------- 6ב. סוג הכדורים — אורגסט "תלוי בסדר שנוטלים אותם" ----------

const orgastPills = [
    { startAbs: base, endAbs: base + 29, type: 'orgast' },
    { startAbs: base + 70, endAbs: base + 99, type: 'orgast' }
];
const orgastReiyot = [reiya(base + 32, 'night')];
const orgastVerdict = pauseVerdict({ enabled: true, pills: orgastPills }, orgastReiyot, base + 120);
assert(orgastVerdict.configured === true && orgastVerdict.pauses.length === 2,
    'an Orgast pause is still reported as a pause that happened');
assert(orgastVerdict.pauses.every(p => p.rule === 'regimen' && p.lastDay === null && p.window === null),
    'but no day-window is computed for it - the source says "מלבד כדורי אורגסט, שתלוי בסדר שנוטלים אותם"');
assert(orgastVerdict.concerns.length === 0 && orgastVerdict.active === null,
    'so no pause-day concern is created from an Orgast pause');
assert(orgastVerdict.established.length === 0,
    'and no pause-day is established from it - the day depends on the regimen, not on the pause alone');
assert(orgastVerdict.regimenPauses.length === 2,
    'the pauses whose din is left uncomputed are reported for the interface');
assert(orgastVerdict.notes.some(n => n.title.indexOf('אורגסט') !== -1 && n.source.indexOf('עמ\' 40') !== -1),
    'and the din is handed to the panel with its mareh makom, not dropped in silence');

const orgastEngine = calculateEngine(dbOf(orgastReiyot), false, { today: base + 120, life: { enabled: true, pills: orgastPills } });
assert(all(orgastEngine, PAUSE_CODE).length === 0,
    'the calendar carries no pause-day marking for Orgast pills');

// ומנגד: אותו תיעוד בדיוק, אלא שהכדורים אינם אורגסט — החשש שב ומחושב.
const ordinaryPills = orgastPills.map(p => Object.assign({}, p, { type: 'combined' }));
const ordinaryVerdict = pauseVerdict({ enabled: true, pills: ordinaryPills }, orgastReiyot, base + 120);
const ordinaryEngine = calculateEngine(dbOf(orgastReiyot), false, { today: base + 120, life: { enabled: true, pills: ordinaryPills } });
assert(ordinaryVerdict.concerns.length > 0 && ordinaryVerdict.established.length === 1,
    'while with ordinary pills the same record does produce the concern and establishes the day');
assert(all(ordinaryEngine, PAUSE_CODE).length > 0,
    'and the ordinary pause is marked on the calendar - so the pill type is what decides');

assert(pauseRuleOfPillType('orgast') === 'regimen'
    && pauseRuleOfPillType('combined') === 'standard'
    && pauseRuleOfPillType('mini') === 'standard'
    && pauseRuleOfPillType(undefined) === 'standard',
    'unit: the pause rule is derived from the pill type, and an unknown type is treated as the ordinary one');

// ---------- 7. תצוגה: הפאנל מציג את החשש ואת מקורו ----------

const stub = { innerHTML: '', className: '', style: { display: '' } };
global.document = {
    getElementById: (id) => (id === 'life-container' ? stub : null),
    querySelector: () => null,
    addEventListener: () => {}
};
const { updateLifePanel } = await import('../js/ui.js');

updateLifePanel(fixedEngine);
assert(stub.innerHTML.indexOf('חשש יום ההפסקה בכדורים') !== -1,
    'the panel names the pause-day concern');
assert(stub.innerHTML.indexOf('data-help="kadurim_pause"') !== -1,
    'and links to the halachic explanation instead of just asserting');
assert(stub.innerHTML.indexOf('אינה יוצר דרישת') !== -1 || stub.innerHTML.indexOf('אינו יוצר דרישת') !== -1,
    'and says in so many words that it is not a check demand');
assert(stub.innerHTML.indexOf('נקבע לה יום זה') !== -1,
    'the day she established for herself is listed');

updateLifePanel(orgastEngine);
assert(stub.innerHTML.indexOf('סדר הנטילה') !== -1,
    'an Orgast pause is explained in the panel, instead of a window being computed for it');
assert(stub.innerHTML.indexOf('אין חשש מחושב') !== -1,
    'and the panel says in so many words that no concern is computed for it');

// ---------- סיבת ההפסקה (מדעתי / בהוראת רופא) ----------
//
// הספר השווה את וסת הכדורים לאכילת דברים חריפים, והכריע: "ואף שלא נטלה הכדורים
// להנאתה אלא שהוצרכה לזה בציווי הרופא... על כל פנים עשתה כן מדעתה ומרצונה"
// `[שט כ"ז | עמ' 41]`. ולכן הסיבה נרשמת, נשמרת ומוצגת — ואינה משנה את החישוב.

const reasonState = normalizeLifeState({
    enabled: true,
    pills: [
        { startAbs: base, endAbs: base + 29, type: 'combined', reason: 'doctor' },
        { startAbs: base + 60, endAbs: base + 89, type: 'combined', reason: 'own' }
    ]
});
assert(reasonState.pills[0].reason === 'doctor' && reasonState.pills[1].reason === 'own',
    'סיבת ההפסקה נשמרת עם תקופת הכדורים');
assert(normalizeLifeState({ pills: [{ startAbs: base, type: 'combined' }] }).pills[0].reason === 'own',
    'ובלא סיבה מפורשת — ברירת המחדל "מדעתי ומרצוני"');
assert(normalizeLifeState({ pills: [{ startAbs: base, type: 'mini', reason: 'nonsense' }] }).pills[0].reason === 'own',
    'וסיבה שאינה מוכרת אינה נשמרת כמות שהיא');

const doctorEngine = calculateEngine({}, false, {
    today: base + 60,
    life: { enabled: true, pills: [{ startAbs: base, endAbs: base + 29, type: 'combined', reason: 'doctor' }] }
});
assert(doctorEngine.pillPause.configured === true,
    'תקופה שנפסקה בציווי רופא נחשבת כתקופת כדורים לכל דבר');
assert(doctorEngine.pillPause.pauses[0].pauseAbs === base + 29,
    'וזמן ההפסקה מחושב ממנה כרגיל — שהרי עשתה כן מדעתה ומרצונה');
assert(PILL_PAUSE_REASON_RULE.source.indexOf('41') !== -1,
    'ולדין הזה יש מראה מקום משלו להצגה');

if (failures === 0) {
    console.log('\nAll pill-pause tests passed.');
} else {
    console.error(`\n${failures} pill-pause test(s) failed.`);
    process.exitCode = 1;
}
