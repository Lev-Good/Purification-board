/**
 * בדיקות למנוע החזרה מן הסילוק (js/silekReturn.js) ולשילובו במנוע החישוב.
 *
 * Run with: node tests/silekReturn.test.js
 *
 * מה נבדק:
 *  1. יציאה מן ההריון — חלוקת הוסתות: וסת הימים חוזרת מיד, ווסת ההפלגה ממתינה
 *     לראייה `[שט כ"ט | עמ' 71]`.
 *  2. לאיזו וסת היא חוזרת — דוקא לוסת שהיתה קבועה קודם הסילוק, ולא לחששות
 *     שאינם קבועים `[שט כ"ט | עמ' 71]`.
 *  3. יציאה מימי הלידה וההנקה (כ"ד חודש) `[שט כ"ט | עמ' 66]`.
 *  4. הפסקת כדורים — חזרה לוסתה הראשון, ואף אם הכדורים קבעו וסת אחר
 *     `[שט כ"ז | עמ' 42]`.
 *  5. שהחזרה מעוגנת מחדש: אין זמני וסת מתוך ימי הסילוק, וההקרנה מתחילה מתומו.
 *  6. שהחששות שאינם חוזרים מדווחים ואינם נעלמים בשקט.
 */
import { HDate } from '../hebcal.js';
import { calculateEngine } from '../js/calculations.js';
import { analyzeAkirot } from '../js/akira.js';
import { addHebrewMonths, analyzeLifeState } from '../js/lifeState.js';
import { analyzeSilekReturn, returnInterlude, vesetKey, isPillEraVeset } from '../js/silekReturn.js';

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
const codesAt = (data, abs) => (data.computed.prishot[abs] || []).map(p => p.code);
const allCodes = (data) => Object.keys(data.computed.prishot)
    .reduce((acc, abs) => acc.concat(data.computed.prishot[abs].map(p => p.code)), []);
const dbOf = (absList, extra) => {
    const db = {};
    absList.forEach(a => { db[a] = Object.assign({ type: 'reiyah', ona: 'day' }, extra || {}); });
    return db;
};
const suppressedVesets = (data) => data.computed.suppressed.filter(s => s.code === 'וק"ב');

// ---------- 1. יציאה מן ההריון: וסת ימים מול וסת הפלגה ----------

// וסת החודש (יום ט"ו) שנקבעה בג' ראיות, ואחר כך הריון ולידה.
const monthSightings = [d(15, 1, 5785), d(15, 2, 5785), d(15, 3, 5785)];
const conception = d(20, 3, 5785);
const birth = addHebrewMonths(conception, 9);
const monthDb = dbOf(monthSightings);
const pregnancyLife = { enabled: true, pregnancyAbs: conception, birthAbs: birth };
const afterBirth = calculateEngine(monthDb, false, { today: birth + 60, life: pregnancyLife });

assert(afterBirth.life.silek === false && afterBirth.life.dormancy.ended === true,
    'after the birth the dormancy is over (and she is no longer מסולקת דמים)');
assert(afterBirth.silekReturn.restored.length === 1 && afterBirth.silekReturn.restored[0].kind === 'month',
    'veset ha-yamim returns - the one that was fixed before the pregnancy');
assert(afterBirth.standingVesets.length === 1 && afterBirth.standingVesets[0].restored === true,
    'and it is the veset that actually stands, with the chazaka twin replaced by it');
assert(afterBirth.standingVesets[0].restoredFromAbs === birth,
    'the return is anchored at the end of the dormancy, not at the old sighting');

const firstFifteenthAfterBirth = (() => {
    let h = new HDate(birth);
    for (let i = 0; i <= 40; i++) {
        if (h.getDate() === 15) return h.abs();
        h = new HDate(h.abs() + 1);
    }
    return null;
})();
assert(codesAt(afterBirth, firstFifteenthAfterBirth).indexOf('וק"ח') !== -1,
    'the first occurrence of the day-of-month after the dormancy is marked (she is concerned immediately)');
const vesetDatesBeforeBirth = Object.keys(afterBirth.computed.prishot).map(Number).filter(abs => abs < birth);
assert(vesetDatesBeforeBirth.length === 0,
    'and no veset time is marked inside the pregnancy - the din was suspended there');
const earlySightingConcerns = allCodes(afterBirth).filter(c => c === 'עו"ב' || c === 'יו"ח');
assert(earlySightingConcerns.length === 0,
    'the concerns of the sightings from before the silek do not come back');
assert(afterBirth.computed.suppressed.some(s => s.why === 'silek' && !!s.text),
    'and they are reported as set aside rather than dropped silently');

// וסת ההפלגה שנקבעה בד' ראיות, ואחר כך הריון ולידה.
const hafBase = d(1, 1, 5785);
const hafSightings = [hafBase, hafBase + 20, hafBase + 40, hafBase + 60];
const hafConception = hafBase + 70;
const hafBirth = addHebrewMonths(hafConception, 9);
const hafDb = dbOf(hafSightings);
const hafLife = { enabled: true, pregnancyAbs: hafConception, birthAbs: hafBirth };

const hafWaiting = calculateEngine(hafDb, false, { today: hafBirth + 40, life: hafLife });
assert(hafWaiting.silekReturn.waiting.length === 1 && hafWaiting.silekReturn.restored.length === 0,
    'veset haflagah does NOT return by itself — it waits for a sighting');
assert(hafWaiting.standingVesets.length === 0,
    'so no haflagah veset stands at all: "אי אפשר לחוש עד שתחזור לראות"');
assert(allCodes(hafWaiting).indexOf('וק"ה') === -1, 'and no haflagah time is marked on the board');
assert(suppressedVesets(hafWaiting).some(s => s.why === 'restored'),
    'the old haflagah is set aside with that reason, not left standing in error');

const hafSeenAbs = hafBirth + 12;
const hafAfter = calculateEngine(Object.assign({}, hafDb, { [hafSeenAbs]: { type: 'reiyah', ona: 'day' } }),
    false, { today: hafBirth + 40, life: hafLife });
assert(hafAfter.silekReturn.restored.length === 1 && hafAfter.silekReturn.restored[0].restoredAnchorAbs === hafSeenAbs,
    'once she sees again, the haflagah returns and is counted from that sighting');
assert(codesAt(hafAfter, hafSeenAbs + 20).indexOf('וק"ה') !== -1,
    'and the day of the haflagah she was used to is marked from it');
assert(hafAfter.standingVesets.some(v => v.restored === true && v.kind === 'haflagah'),
    'so it stands again');

// וסת שחזרה לצד וסת שנקבעה אחרי הסילוק — שתיהן מוצגות, עם סימון מחלוקת.
const postBirthSightings = [d(5, 1, 5787), d(5, 2, 5787), d(5, 3, 5787)];
const twinDb = Object.assign(dbOf(monthSightings), dbOf(postBirthSightings));
const twinData = calculateEngine(twinDb, false, {
    today: postBirthSightings[2] + 40, life: pregnancyLife
});
assert(twinData.standingVesets.length === 2,
    'a veset that returned and a veset established after the silek both stand (no obligation is dropped);');
assert(twinData.standingVesets.some(v => v.restored === true)
    && twinData.standingVesets.some(v => v.restored !== true),
    'one of them is the returned one and the other the newly established one');
assert(twinData.silekReturn.notes.some(n => n.level === 'dispute' && n.text.indexOf('לשאול רב') !== -1),
    'and the app discloses the question between them instead of deciding it');

// ---------- 2. לאיזו וסת היא חוזרת ----------

const twoSightingsDb = dbOf([d(10, 1, 5785), d(10, 2, 5785)]);
const twoConception = d(10, 3, 5785) + 5;
const twoBirth = addHebrewMonths(twoConception, 9);
const withoutFixed = calculateEngine(twoSightingsDb, false, {
    today: twoBirth + 40,
    life: { enabled: true, pregnancyAbs: twoConception, birthAbs: twoBirth }
});
assert(withoutFixed.silekReturn.returned.length === 0,
    'with no FIXED veset before the silek nothing returns "חוזרת דוקא לוסתה הקבוע"');
assert(withoutFixed.silekReturn.notes.some(n => n.title.indexOf('לא היתה לה וסת קבועה') !== -1),
    'and the reason is disclosed instead of leaving her without an explanation');
assert(allCodes(withoutFixed).length === 0,
    'the concerns that were hers before the silek (which were not fixed) do not come back');
const withoutLife = calculateEngine(twoSightingsDb, false, { today: twoBirth + 40 });
assert(allCodes(withoutLife).length > 0,
    'while without a life state those same concerns are shown as usual');

// ---------- 3. יציאה מימי הלידה וההנקה ----------

const nursingBirth = d(10, 3, 5785) + 200;
const nursingLife = { enabled: true, birthAbs: nursingBirth, nursing: true, nursingLenient: true };
const nursingUntil = addHebrewMonths(nursingBirth, 24);
const nursingDb = dbOf(monthSightings);

const insideNursing = calculateEngine(nursingDb, false, { today: nursingBirth + 100, life: nursingLife });
assert(insideNursing.life.silek === true && insideNursing.silekReturn.restored.length === 0,
    'while the twenty-four months are still running there is no return - the dormancy continues');
assert(allCodes(insideNursing).length === 0, 'and no concern is shown on the board meanwhile');

const afterNursing = calculateEngine(nursingDb, false, { today: nursingUntil + 40, life: nursingLife });
assert(afterNursing.life.dormancy.ended === true, 'after twenty-four months the dormancy has ended');
assert(afterNursing.silekReturn.restored.length === 1
    && afterNursing.silekReturn.restored[0].restoredFromAbs === nursingUntil,
    'and she returns to her veset of days, anchored at the end of the nursing period');
const nursingDatesInside = Object.keys(afterNursing.computed.prishot).map(Number)
    .filter(abs => abs < nursingUntil && abs > nursingBirth);
assert(nursingDatesInside.length === 0, 'with no veset times marked inside the nursing period');

// הריון ואחריו הנקה: החזרה נמדדת מתום השרשרת כולה - לא מן הלידה.
const chainConception = d(15, 1, 5785) + 5;
const chainBirth = addHebrewMonths(chainConception, 9);
const chainUntil = addHebrewMonths(chainBirth, 24);
const chain = calculateEngine(monthDb, false, {
    today: chainUntil + 40,
    life: {
        enabled: true, pregnancyAbs: chainConception, birthAbs: chainBirth,
        nursing: true, nursingLenient: true
    }
});
assert(chain.life.dormancy.windows.length === 2 && chain.life.dormancy.ended === true,
    'a pregnancy followed by nursing is one chain of dormancy windows');
assert(chain.silekReturn.restored.length === 1
    && chain.silekReturn.restored[0].restoredFromAbs === chainUntil,
    'and the return is measured from the end of the whole chain, not from the birth');

// ---------- 4. הפסקת כדורים ----------

const prePill = [d(10, 1, 5785), d(10, 2, 5785), d(10, 3, 5785)];
const pillStart = d(10, 3, 5785) + 20;
const pillEnd = pillStart + 200;
// ראיות מתקופת הכדורים, באותו יום בחודש ובאותה עונה — די להן לחזקה רגילה.
const pillEraSightings = [d(3, 4, 5785), d(3, 5, 5785), d(3, 6, 5785)];
const pillDb = Object.assign(dbOf(prePill),
    dbOf(pillEraSightings, { kind: 'pills' }));
const pillsLife = { enabled: true, pills: [{ startAbs: pillStart, endAbs: pillEnd, type: 'combined' }] };

const onPills = calculateEngine(pillDb, false, { today: pillStart + 50, life: pillsLife });
assert(onPills.silekReturn.returned.length === 0,
    'while the pills are still being taken there is no return at all');
assert(onPills.standingVesets.some(v => v.dayOfMonth === 3),
    'and the veset established in the meantime stands as usual');

const afterPills = calculateEngine(pillDb, false, { today: pillEnd + 40, life: pillsLife });
assert(afterPills.silekReturn.restored.length === 1
    && afterPills.silekReturn.restored[0].dayOfMonth === 10,
    'after she stops, she returns to the fixed veset she had BEFORE the pills');
assert(afterPills.silekReturn.restored[0].restoredFromAbs === pillEnd + 1,
    'the return is anchored at the day after the last day of taking them');
assert(!afterPills.standingVesets.some(v => v.dayOfMonth === 3),
    'and the veset that was established by the pills does not stand - "אחר שהפסיקה חוזרת לוסתה הראשון"');
const displaced = suppressedVesets(afterPills).find(s => s.why === 'pills');
assert(!!displaced && displaced.reason.indexOf('ג') !== -1,
    'the replaced veset of the pills is reported, with its din');
const pillDatesInside = Object.keys(afterPills.computed.prishot).map(Number)
    .filter(abs => abs > pillStart && abs < pillEnd + 1);
assert(pillDatesInside.length === 0, 'with no veset times marked inside the period of taking them');
assert(codesAt(afterPills, (() => {
    let h = new HDate(pillEnd + 1);
    for (let i = 0; i <= 40; i++) {
        if (h.getDate() === 10) return h.abs();
        h = new HDate(h.abs() + 1);
    }
    return null;
})()).indexOf('וק"ח') !== -1, 'and the first tenth after the stop is marked');

// ---------- 5. יחידות: זיהוי תקופת ההשהיה ----------

const lifeVerdict = analyzeLifeState({
    life: { enabled: true, pregnancyAbs: conception, birthAbs: birth },
    reiyot: [], today: birth + 10
});
assert(lifeVerdict.dormancy.windows.length === 1
    && lifeVerdict.dormancy.windows[0].untilAbs === birth
    && lifeVerdict.dormancy.windows[0].fromAbs === conception + 90,
    'the dormancy window of a pregnancy runs from the ninetieth day to the birth');
assert(lifeVerdict.dormancy.ended === true && lifeVerdict.dormancy.upToAbs === birth,
    'once it is over, its end is the boundary up to which her old concerns are void');
assert(lifeVerdict.dormancy.disqualifiesEstablishment(conception + 50) === true,
    'a sighting from before the dormancy cannot establish a veset - it belongs to the previous veset');
assert(lifeVerdict.dormancy.disqualifiesEstablishment(conception + 100) === true,
    'and so is a sighting from within it - "לא קבעה לה וסת בראיות שראתה בימי הסילוק"');
assert(lifeVerdict.dormancy.disqualifiesEstablishment(birth + 5) === false,
    'while a sighting after the dormancy does establish one, as usual');
assert(returnInterlude(lifeVerdict, birth + 10).fromAbs === conception + 90,
    'and the return is measured from what was hers before the dormancy, up to its end');

const earlyVerdict = analyzeLifeState({
    life: { enabled: true, pregnancyAbs: conception, birthAbs: birth },
    reiyot: [], today: conception + 10
});
assert(earlyVerdict.dormancy.windows.length === 0 && earlyVerdict.dormancy.ended === false,
    'within the first three months there is no dormancy window at all - and she is concerned');

const offVerdict = analyzeLifeState({
    life: { enabled: false, pregnancyAbs: conception, birthAbs: birth },
    reiyot: [], today: birth + 10
});
assert(offVerdict.dormancy.windows.length === 0 && returnInterlude(offVerdict, birth + 10) === null,
    'with the life state switched off nothing returns either');

assert(vesetKey({ kind: 'month', ona: 'day', dayOfMonth: 15 }) ===
    vesetKey({ kind: 'month', ona: 'day', dayOfMonth: 15 }),
    'a veset key identifies the same veset of days');
assert(isPillEraVeset({ establishedBy: [500, 520, 540] }, 400) === true
    && isPillEraVeset({ establishedBy: [300, 520, 540] }, 400) === false,
    'a veset is "of the pill era" only when all its sightings are from it');

// ---------- 6. עוגן החזרה במנוע העקירה ----------

const hafVeset = { kind: 'haflagah', ona: 'day', span: 20, spanLabel: 21, establishedBy: [40000, 40020, 40040, 40060] };
const hafReiyot = hafVeset.establishedBy.map(abs => ({ abs, ona: 'day', hdate: new HDate(abs), counted: true }));
const anchor = 41000;
const withAnchor = analyzeAkirot({
    reiyot: hafReiyot, established: [hafVeset], lastCounted: { abs: 40060 }, checks: [],
    today: 41010, anchorOf: (v) => (v === hafVeset ? { abs: anchor, hdate: new HDate(anchor) } : null),
    project: (veset, from) => [{ abs: from.abs + veset.span, ona: veset.ona, code: 'וק"ה' }]
});
assert(withAnchor.fixed[0].dueTimes.length === 1 && withAnchor.fixed[0].dueTimes[0].abs === anchor + 20,
    'the uprooting engine projects a returned veset from its new anchor, not from the old sighting');
assert(withAnchor.fixed[0].interval && withAnchor.fixed[0].interval.passed === 10,
    'and the day-count route is measured from the new anchor (ten days), not from the old sighting');

const withoutAnchorFn = analyzeAkirot({
    reiyot: hafReiyot, established: [hafVeset], lastCounted: { abs: 40060 }, checks: [],
    today: 40170, project: (veset, from) => [{ abs: from.abs + veset.span, ona: veset.ona, code: 'וק"ה' }]
});
assert(withoutAnchorFn.fixed[0].dueTimes[0].abs === 40080,
    'and without an anchor function the old behaviour is kept exactly');

// ---------- 7. תצוגה ----------

const stub = { innerHTML: '', className: '', style: { display: '' } };
const rows = [];
global.document = {
    getElementById: (id) => (id === 'life-container' ? stub : null),
    querySelector: (sel) => (sel === '#veset-table tbody' ? { innerHTML: '', appendChild: (r) => rows.push(r) } : null),
    createElement: () => ({ innerHTML: '' }),
    addEventListener: () => {}
};
const { updateLifePanel, renderSummaryTable } = await import('../js/ui.js');

updateLifePanel(afterBirth);
assert(stub.style.display === 'block' && stub.innerHTML.indexOf('יציאה מן הסילוק') !== -1,
    'the life panel opens a section for the return from the dormancy');
assert(stub.innerHTML.indexOf('data-help="silek_return"') !== -1,
    'and links to the halachic explanation instead of just asserting');
assert(stub.innerHTML.indexOf('עבר ההריון') !== -1 || stub.innerHTML.indexOf('מעוברת') !== -1,
    'it names the dormancy that ended');

updateLifePanel(hafWaiting);
assert(stub.innerHTML.indexOf('אינה חוזרת עד שתראה') !== -1,
    'a waiting haflagah is stated in words, not left as a silent absence');

updateLifePanel(afterPills);
assert(stub.innerHTML.indexOf('הפסיקה ליטול כדורים') !== -1,
    'the pills return is named as such');

renderSummaryTable(afterBirth);
assert(rows.some(r => r.innerHTML.indexOf('תם הסילוק') !== -1),
    'the summary table says the din of the dormancy is over instead of leaving the rows looking binding');

// ---------- Summary ----------
if (failures > 0) {
    console.error(`\n${failures} silek-return test(s) failed.`);
    process.exit(1);
} else {
    console.log('\nAll silek-return tests passed.');
}
