/**
 * בדיקות למנוע מצב החיים (js/lifeState.js) ולשילובו במנוע החישוב.
 *
 * Run with: node tests/lifeState.test.js
 *
 * מה נבדק:
 *  1. נרמול מצב פגום, והמתג שמכבה את החישוב כולו.
 *  2. שיעורי הסילוק: מעוברת תשעים יום `[ד"ט | עמ' 14]`; מניקה כ"ד חודש
 *     `[שט כ"ט | עמ' 66]` ומחלוקת זמננו `[שט כ"ה | עמ' 18]`; זקנה ג' עונות
 *     `[שט ל' | עמ' 73]`; קטנה עד שלש ראיות `[שט ל' | עמ' 73]`.
 *  3. פטור מבדיקה למסולקת דמים `[שט כ"ה | עמ' 17–18]` — אין דרישת "אסורה עד שתבדוק".
 *  4. חששות שהיו לה קודם הסילוק מוסרים מהלוח, ומוצגים כ"הוסרו" ולא נעלמים בשקט
 *     `[ד"ט | עמ' 14]`.
 *  5. ראייה בזמן הסילוק מחזירה את הדין: וסת החודש, והפלגה רק משתי ראיות שבתוך הסילוק
 *     `[שט כ"ט | עמ' 69]`.
 *  6. עיכוב עקירה בכדורים: ימי הנטילה אינם נמנים למניין, וראיית כדורים אינה מפסיקה
 *     אותו `[ד"ט | עמ' 8]`.
 */
import {
    analyzeLifeState, normalizeLifeState, isLifeConfigured, addHebrewMonths,
    pillsCovering, countPillDays, isPillSighting, lifeStateSummary,
    PREGNANCY_SILEK_DAYS, ELDERLY_QUIET_DAYS, NURSING_MONTHS
} from '../js/lifeState.js';
import { calculateEngine } from '../js/calculations.js';
import { analyzeAkirot } from '../js/akira.js';
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
    return Object.assign({ abs, ona: ona || 'day', hdate: new HDate(abs) }, extra || {});
}

const projectFn = (veset, lastCounted) => [{ abs: lastCounted.abs + veset.span, ona: veset.ona, code: 'וק"ה' }];

// ---------- 1. נרמול ומתג כללי ----------

const junk = normalizeLifeState('not an object');
assert(junk.pregnancyAbs === null && junk.ageYears === null && junk.pills.length === 0,
    'garbage input normalises to an empty state instead of crashing the engine');
assert(isLifeConfigured(junk) === false, 'an empty state counts as "nothing configured"');

const badAge = normalizeLifeState({ ageYears: 'abc', pills: [{ startAbs: 0 }, { endAbs: 5 }, { startAbs: 100, endAbs: 50 }] });
assert(badAge.ageYears === null, 'a non-numeric age is ignored');
assert(badAge.pills.length === 1, 'pill periods without a start, and end-before-start, are dropped');

const off = analyzeLifeState({ life: { enabled: false, pregnancyAbs: 10000 }, reiyot: [], today: 11000 });
assert(off.configured === false && off.silek === false,
    'with the calculation switched off the state has no effect at all');

const none = calculateEngine({ 1000: { type: 'reiyah', ona: 'day' } }, false, { today: 1100 });
assert(none.life && none.life.configured === false && none.life.silek === false,
    'without a life state the engine reports no silek and behaves as before');

// ---------- 2. שיעורי הסילוק ----------

const conception = 10000;
const pregnantEarly = analyzeLifeState({ life: { pregnancyAbs: conception }, reiyot: [], today: conception + 89 });
assert(pregnantEarly.pregnant.firstTrimester === true && pregnantEarly.silek === false,
    'a pregnancy of 89 days is still inside the first three months - she is concerned');
const pregnantFull = analyzeLifeState({ life: { pregnancyAbs: conception }, reiyot: [], today: conception + PREGNANCY_SILEK_DAYS });
assert(pregnantFull.silek === true && pregnantFull.pregnant.active === true,
    'on day 90 of the pregnancy she is מסולקת דמים');
assert(pregnantFull.silekSinceAbs === conception + PREGNANCY_SILEK_DAYS,
    'the silek is dated from the ninetieth day, so earlier concerns can be identified');
assert(pregnantFull.exemptFromCheck === true && !!pregnantFull.exemptReason,
    'and she is exempt from checking, with the reason stated');

// מניקה — ברירת מחדל מחמירה, וההקלה במפורש.
const birth = 20000;
const nursingStrict = analyzeLifeState({ life: { birthAbs: birth, nursing: true }, reiyot: [], today: birth + 100 });
assert(nursingStrict.silek === false,
    'by default a nursing woman is not treated as מסולקת דמים (the book: in our time she sees regularly)');
const nursingLenient = analyzeLifeState({ life: { birthAbs: birth, nursing: true, nursingLenient: true }, reiyot: [], today: birth + 100 });
assert(nursingLenient.silek === true && nursingLenient.silekSinceAbs === birth,
    'with the lenient ruling in force she is מסולקת from the birth');
assert(nursingLenient.notes.some(n => n.level === 'dispute'), 'and the dispute is disclosed, not decided silently');
const nursingOver = analyzeLifeState({
    life: { birthAbs: birth, nursing: true, nursingLenient: true },
    reiyot: [], today: addHebrewMonths(birth, NURSING_MONTHS) + 1
});
assert(nursingOver.silek === false, 'after 24 months the silek of a birth lapses');
// עשרים וארבעה חודשי לוח: אותו יום בחודש, ולא מניין ימים קבוע.
const cheshvanBase = new HDate(1, 8, 5785);
const after12 = new HDate(addHebrewMonths(cheshvanBase.abs(), 12));
assert(after12.getDate() === 1 && after12.getMonth() === 8 && after12.getFullYear() === 5786,
    'twelve Hebrew months land on the same day of the month, a Hebrew year later');
const tishreiBase = new HDate(1, 7, 5785);
const after24 = new HDate(addHebrewMonths(tishreiBase.abs(), NURSING_MONTHS));
assert(after24.getDate() === 1 && after24.getMonth() === 7 && after24.getFullYear() === 5787,
    'and twenty-four months are counted in calendar months, not as a fixed day count');
const dayThirty = new HDate(30, 9, 5785);
const clamped = new HDate(addHebrewMonths(dayThirty.abs(), 1));
assert(clamped.getDate() === 29 && clamped.getMonth() === 10,
    'a 30th day that the next month does not have is clamped to its last day');
assert(addHebrewMonths(birth, 24) > birth + 700 && addHebrewMonths(birth, 24) < birth + 780,
    'and the day count of 24 months is in the expected range');

// זקנה — גיל ושיעור הימים יחד.
const lastSighting = 30000;
const elderlyYoung = analyzeLifeState({ life: { ageYears: 40 }, reiyot: [reiya(lastSighting)], today: lastSighting + ELDERLY_QUIET_DAYS + 10 });
assert(elderlyYoung.silek === false, 'three quiet seasons alone do not make a 40 year old מסולקת');
const elderlyShort = analyzeLifeState({ life: { ageYears: 70 }, reiyot: [reiya(lastSighting)], today: lastSighting + ELDERLY_QUIET_DAYS - 1 });
assert(elderlyShort.silek === false, 'a week short of three quiet seasons is not yet silek');
const elderly = analyzeLifeState({ life: { ageYears: 70 }, reiyot: [reiya(lastSighting)], today: lastSighting + ELDERLY_QUIET_DAYS });
assert(elderly.silek === true, 'an elderly woman with three quiet seasons is מסולקת דמים');
assert(elderly.notes.some(n => n.level === 'dispute'), 'the dispute about the age threshold is disclosed');

// קטנה.
const minor = analyzeLifeState({ life: { ageYears: 11 }, reiyot: [reiya(1), reiya(2)], today: 50000 });
assert(minor.silek === true && minor.minor.active === true,
    'a girl below 12 who saw twice is still treated as מסולקת');
const minorThree = analyzeLifeState({
    life: { ageYears: 11 },
    reiyot: [reiya(1), reiya(2), reiya(3)].map(r => Object.assign(r, { counted: true })),
    today: 50000
});
assert(minorThree.silek === false, 'after three sightings she becomes like any other woman');

// ---------- 3. כדורים: זיהוי תקופות ----------

const pills = [{ startAbs: 100, endAbs: 200, type: 'combined' }, { startAbs: 300, endAbs: null, type: 'mini' }];
assert(!!pillsCovering(pills, 150) && !pillsCovering(pills, 250) && !!pillsCovering(pills, 400),
    'a period is either bounded or open-ended');
assert(countPillDays(pills, 180, 220) === 21, 'only the days inside the period are counted');
assert(countPillDays(pills, 1, 350) === 101 + 51, 'several periods are counted separately');
assert(isPillSighting({ kind: 'pills' }) === true && isPillSighting({ kind: 'regular' }) === false,
    'a sighting marked as caused by pills is recognised');

const onPills = analyzeLifeState({ life: { pills }, reiyot: [], today: 150 });
assert(onPills.configured === true && onPills.pills.active === true && onPills.silek === false,
    'taking pills does not by itself make her מסולקת דמים - it only delays uprooting');
assert(onPills.pills.currentTypeLabel === 'כדורים משולבים', 'the type of pills is reported');

// ---------- 4. במנוע החישוב: סילוק דמים ----------

const s1 = 60000;
const s2 = 60105;
const silekDb = {
    [s1]: { type: 'reiyah', ona: 'day' },
    [s2]: { type: 'reiyah', ona: 'day' }
};
const plain = calculateEngine(silekDb, false, { today: 60300 });
const codesOf = (data) => Object.keys(data.computed.prishot).map(Number).sort((a, b) => a - b)
    .reduce((acc, abs) => acc.concat(data.computed.prishot[abs].map(p => p.code)), []);

assert(codesOf(plain).indexOf('עו"ב') !== -1, 'without a life state the ordinary concerns are shown');
assert(plain.computed.pendingChecks.length > 0, 'and past unchecked times are still demanded');

const withPregnancy = calculateEngine(silekDb, false, {
    today: 60300,
    life: { enabled: true, pregnancyAbs: 60200 }
});
assert(codesOf(withPregnancy).indexOf('עו"ב') === -1,
    'a pregnant woman past 90 days no longer gets ona beinonit for her old sightings');
assert(codesOf(withPregnancy).indexOf('יו"ח') === -1, 'nor day-of-month concerns from before the silek');
const silekSuppressed = withPregnancy.computed.suppressed.filter(s => s.why === 'silek');
assert(silekSuppressed.length > 0 && silekSuppressed.every(s => !!s.text),
    'the concerns that were removed are reported, not dropped silently');
assert(withPregnancy.computed.pendingChecks.length === 0,
    'and no check is demanded of a woman who is exempt from checking');
assert(withPregnancy.computed.checkExemption && withPregnancy.computed.checkExemption.exempt === true,
    'the exemption itself is reported, so its absence of a demand is explained');

// ראייה שאינה בתוך הסילוק ממשיכה לחשב חששות.
const duringSilekDb = Object.assign({}, silekDb, { 60310: { type: 'reiyah', ona: 'day' } });
const duringSilek = calculateEngine(duringSilekDb, false, {
    today: 60500,
    life: { enabled: true, pregnancyAbs: 60200 }
});
const codesOn = (data, abs) => (data.computed.prishot[abs] || []).map(p => p.code);
assert(codesOn(duringSilek, duringSilekDb[60310] ? 60310 + 29 : 0).indexOf('עו"ב') !== -1,
    'a sighting during the silek creates a concern again, as a non-fixed veset');
assert(codesOf(duringSilek).indexOf('יו"ח') !== -1, 'and a day-of-month concern of its own');
assert(codesOn(duringSilek, 60310).indexOf('עו"ה') === -1,
    'but a single sighting during the silek is not joined with a sighting from before it');

// וסת קבוע שנקבע לפני הסילוק אינו נוהג עוד.
const fixedDb = {
    50000: { type: 'reiyah', ona: 'day' },
    50030: { type: 'reiyah', ona: 'day' },
    50060: { type: 'reiyah', ona: 'day' },
    50090: { type: 'reiyah', ona: 'day' }
};
const fixedPlain = calculateEngine(fixedDb, false, { today: 50135 });
assert(codesOf(fixedPlain).indexOf('וק"ה') !== -1, 'the haflagah veset stands before the pregnancy');
// הריון מ־50040: הסילוק חל מ־50130, ולכן כל הראיות שמכוחן נקבע הוסת קדומות לו.
const fixedSilek = calculateEngine(fixedDb, false, { today: 50135, life: { enabled: true, pregnancyAbs: 50040 } });
assert(codesOf(fixedSilek).indexOf('וק"ה') === -1,
    'a fixed veset established before the silek no longer stands');
assert(fixedSilek.computed.suppressed.some(s => s.code === 'וק"ב'),
    'and that removal too is reported with its reason');
assert(fixedSilek.standingVesets.length === 0 && fixedPlain.standingVesets.length === 1,
    'the standing-vesets list carries the silek through to the UI, instead of the raw verdict');

// ---------- 5. במנוע החישוב: עיכוב עקירה בכדורים ----------

const hafVeset = { kind: 'haflagah', ona: 'day', span: 20, spanLabel: 21, establishedBy: [40000, 40020, 40040, 40060] };
const hafReiyot = [reiya(40000), reiya(40020), reiya(40040), reiya(40060)];
const base = {
    reiyot: hafReiyot, established: [hafVeset], lastCounted: { abs: 40060 },
    checks: [], today: 40120, project: projectFn
};

const freeRunning = analyzeAkirot(base);
assert(freeRunning.uprooted.length === 1 && freeRunning.fixed[0].clearedBy === 'interval',
    'with no pills the haflagah veset is uprooted after span*3-2 days');

const delayed = analyzeAkirot(Object.assign({}, base, { pillsDays: () => 60 }));
assert(delayed.uprooted.length === 0 && delayed.fixed[0].interval.skipped === 60,
    'the days of taking pills do not count toward the uprooting count');
assert(delayed.fixed[0].interval.passed === 0 && delayed.fixed[0].interval.met === false,
    'and the interval is measured on the counted days only');

const partly = analyzeAkirot(Object.assign({}, base, { pillsDays: () => 30 }));
assert(partly.fixed[0].interval.skipped === 30 && partly.fixed[0].interval.met === false,
    'a partial pill period delays the uprooting by exactly its length');

const withPillSighting = analyzeAkirot(Object.assign({}, base, {
    reiyot: hafReiyot.concat([reiya(40070, 'day', { kind: 'pills' })]),
    isPillSighting
}));
assert(withPillSighting.uprooted.length === 1,
    'a sighting marked as caused by pills does not break the "no sighting since" condition');
const withoutMarker = analyzeAkirot(Object.assign({}, base, {
    reiyot: hafReiyot.concat([{ abs: 40070, ona: 'day', hdate: new HDate(40070) }])
}));
assert(withoutMarker.uprooted.length === 0,
    'an ordinary sighting after the last one does stop the interval route - the marker is what matters');

// ובמנוע החישוב עצמו.
const pillsLife = {
    enabled: true,
    pills: [{ startAbs: 40061, endAbs: 40120, type: 'combined' }]
};
const hafDb = {
    40000: { type: 'reiyah', ona: 'day' },
    40020: { type: 'reiyah', ona: 'day' },
    40040: { type: 'reiyah', ona: 'day' },
    40060: { type: 'reiyah', ona: 'day' }
};
const engineFree = calculateEngine(hafDb, false, { today: 40120 });
assert(engineFree.akirot.uprooted.length === 1, 'the engine uproots the left-behind haflagah veset');
const enginePills = calculateEngine(hafDb, false, { today: 40120, life: pillsLife });
assert(enginePills.akirot.uprooted.length === 0 && enginePills.akirot.fixed[0].interval.skipped === 60,
    'with recorded pills the engine delays the uprooting instead');
assert((enginePills.computed.prishot[40080] || []).some(p => p.code === 'וק"ה'),
    'so her veset is still marked on the board');

// ---------- 6. תצוגה ----------

const stub = { innerHTML: '', className: '', style: { display: '' } };
const chazakaStub = { innerHTML: '', className: '', style: { display: '' } };
global.document = {
    getElementById: (id) => (id === 'life-container' ? stub : (id === 'chazaka-container' ? chazakaStub : null)),
    querySelector: () => null,
    addEventListener: () => {}
};
const { updateLifePanel, updateChazakaPanel } = await import('../js/ui.js');

updateLifePanel({ computed: {}, life: null });
assert(stub.style.display === 'none', 'with no life state the panel stays hidden');

updateLifePanel(withPregnancy);
assert(stub.style.display === 'block', 'a configured life state opens the panel');
assert(stub.innerHTML.indexOf('מסולקת דמים') !== -1, 'the panel names the silek');
assert(stub.innerHTML.indexOf('פטורה מבדיקה') !== -1, 'and says she is exempt from checking');
assert(stub.innerHTML.indexOf('data-help="life_state"') !== -1,
    'the panel links to the halachic explanation instead of just asserting');
assert(stub.className.indexOf('dash-blue') !== -1, 'an exemption is shown as information, not as a warning');

updateLifePanel(duringSilek);
assert(stub.innerHTML.indexOf('מצב חיים שהוגדר') !== -1, 'the panel lists the configured statuses');

const pillsEngineData = calculateEngine(hafDb, false, { today: 40120, life: pillsLife });
updateLifePanel(pillsEngineData);
assert(stub.innerHTML.indexOf('עיכוב') !== -1 || stub.innerHTML.indexOf('אינם נמנים') !== -1,
    'the panel explains the delayed uprooting with its day count');

// הפאנל של הוסת הקבועה אינו מכריז על וסת שהוסתרה מחמת הסילוק.
updateChazakaPanel(fixedSilek);
assert(chazakaStub.innerHTML.indexOf('נקבעה וסת קבועה') === -1,
    'the fixed-veset panel does not announce a veset that the silek set aside');
updateChazakaPanel(fixedPlain);
assert(chazakaStub.innerHTML.indexOf('נקבעה וסת קבועה') !== -1,
    'but it does announce it while it stands');

assert(lifeStateSummary(null) === '' && lifeStateSummary({ configured: true, silek: false }) === '',
    'the one-line summary stays empty when there is no silek');
assert(lifeStateSummary(withPregnancy.life).indexOf('מעוברת') !== -1,
    'and names the reason when there is one');

// ---------- Summary ----------
if (failures > 0) {
    console.error(`\n${failures} life state test(s) failed.`);
    process.exit(1);
} else {
    console.log('\nAll life state tests passed.');
}
