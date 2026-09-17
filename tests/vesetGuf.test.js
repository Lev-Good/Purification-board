/**
 * בדיקות לוסת הגוף ולוסת המורכב (B2 — js/vesetGuf.js) — כולל התזכורת היומית.
 *
 * Run with: node tests/vesetGuf.test.js
 *
 * מה נבדק:
 *  1. סימון המיחוש על הראייה מגיע למנוע, ומיחוש שאינו משונה אינו נדרש לסימון —
 *     התנאי מוצג למשתמשת לפני הסימון `[שט ל"ט | עמ' 158]`, `[ד"ט | עמ' 11]`.
 *  2. פעם אחת או שתיים — "חוששת לו כדין וסת שאינו קבוע" `[שט ל"ט | עמ' 160]`;
 *     שלש פעמים לאותו מיחוש — וסת הגוף קבועה `[שט ל"ט | עמ' 158]`.
 *  3. וסת מורכב ליום החודש: "קבעה לה וסת לזמן ולמיחוש הוסת" `[שט ל"ט | עמ' 160]`,
 *     ונקבע דוקא בג' ראיות **רצופות** שבהן גם היום וגם המיחוש. ראייה שנספרת בלא
 *     המיחוש קוטעת את הקביעות `[שט מ' | עמ' 180]`.
 *  4. החשש של הווסת המורכב: "שצריכה לחשוש באותו היום אף קודם שבא המיחוש" — ומאידך
 *     "לעונת האור זרוע אין צריכה לחשוש אם עדיין לא בא המיחוש" `[שט כ"ז | עמ' 49]`.
 *  5. וסת מורכב להפלגה — ד' ראיות שכולן במיחוש `[שט ל"ט | עמ' 161]`.
 *  6. מיחוש על ראייה שאינה נספרת (אונס / המשך דימום) אינו קובע — ומוצג, ולא נעלם.
 *  7. התצוגה: פאנל וסת הגוף, וסימון המיחוש על גבי יום הראייה בלוח.
 *  8. **התזכורת היומית:** זמן הווסת המורכבת שעבר בלא בדיקה נכנס למניין זמני הבדיקה
 *     (`pendingChecks`, בשדה `kind: 'body'`) ותובע בדיקה כדין — "אסורה עד שתבדוק"
 *     `[שט ל"ט | עמ' 160]`; ומיחוש שתועד ועומד מוצג בתזכורת עם הבדיקה הנדרשת.
 *  9. **התזכורת אינה מסתלקת מפני וסת קבועה של ימים** — למשל כשוסת הימים שחזרה מן
 *     הסילוק עומדת לה `[שט כ"ז | עמ' 49]`.
 */
import { HDate } from '../hebcal.js';
import { calculateEngine } from '../js/calculations.js';
import { addHebrewMonths } from '../js/lifeState.js';
import {
    analyzeBodyVeset, bodySignLabel, bodyReminder, BODY_SIGNS,
    COMPOUND_MONTH_CODE, COMPOUND_HAFLAGAH_CODE, BODY_FIXED_COUNT
} from '../js/vesetGuf.js';

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
const reiya = (abs, ona, extra) => Object.assign({ abs, ona, hdate: new HDate(abs) }, extra || {});
const dbOf = (list) => {
    const db = {};
    list.forEach(r => {
        db[r.abs] = { type: 'reiyah', ona: r.ona };
        if (r.kind) db[r.abs].kind = r.kind;
        if (r.signs) db[r.abs].signs = r.signs;
    });
    return db;
};
const signReiya = (abs, ona, signs, extra) => reiya(abs, ona, Object.assign({ signs }, extra || {}));

const entriesOn = (data, abs) => (data.computed.prishot[abs] || []);
const codesOn = (data, abs) => entriesOn(data, abs).map(p => p.code);
const flatCodes = (data) => Object.keys(data.computed.prishot)
    .reduce((acc, abs) => acc.concat((data.computed.prishot[abs] || []).map(p => p.code)), []);

// ---------- 1. המודול עצמו: הרשימה והתנאי ----------

assert(BODY_SIGNS.length >= 8 && BODY_SIGNS.some(s => s.code === 'yawn')
    && BODY_SIGNS.some(s => s.code === 'faceSpots'),
    'the sign list includes the mishnah signs and the ones the Rishonim added for our times');
assert(bodySignLabel('yawn') === 'פיהוק' && bodySignLabel('nope') === 'nope',
    'a known sign has a label, and an unknown code is returned as it is rather than dropped');
assert(BODY_FIXED_COUNT === 3, 'three sightings of the same sign fix a body veset');

const emptyVerdict = analyzeBodyVeset({ reiyot: [reiya(10000, 'day')] });
assert(emptyVerdict.configured === false && emptyVerdict.notes.length === 0,
    'with no recorded sign the body-veset engine says nothing at all');

const once = analyzeBodyVeset({ reiyot: [signReiya(10000, 'day', ['yawn'])] });
assert(once.configured === true && once.bySign.length === 1
    && once.bySign[0].count === 1 && once.bySign[0].fixed === false,
    'one recorded sign is a sighting the engine tracks - not a fixed veset');
assert(once.pendingBody.length === 1 && once.fixedBody.length === 0,
    'and it is reported as a non-fixed body veset');
assert(once.notes.some(n => n.text.indexOf('משונה') !== -1),
    'the condition - a sign that is out of the ordinary - is stated to the user');
assert(once.notes.some(n => n.source.indexOf('עמ\' 158') !== -1),
    'and the din is given with its source, not as an unsupported claim');
assert(once.notes.some(n => n.level === 'dispute'),
    'the dispute about establishing in one sighting is disclosed rather than decided silently');

// ---------- 2. שלש פעמים לאותו מיחוש — וסת הגוף קבועה ----------

const threeSigns = analyzeBodyVeset({
    reiyot: [
        signReiya(10000, 'day', ['yawn']),
        signReiya(10030, 'day', ['yawn']),
        signReiya(10061, 'day', ['yawn'])
    ]
});
assert(threeSigns.fixedBody.length === 1 && threeSigns.fixedBody[0].code === 'yawn'
    && threeSigns.fixedBody[0].count === 3,
    'three sightings with the same sign establish veset ha-guf');
assert(threeSigns.compound.length === 0,
    'with no fixed day-of-month and unequal spans there is no compound veset');

// ---------- 3. וסת מורכב ליום החודש ----------

const base = 5786; // שנה עברית
const sameDay1 = d(5, 8, base);   // ה' בחשוון
const sameDay2 = d(5, 9, base);   // ה' בכסלו
const sameDay3 = d(5, 10, base);  // ה' בטבת

const compoundDb = dbOf([
    signReiya(sameDay1, 'night', ['yawn']),
    signReiya(sameDay2, 'night', ['yawn']),
    signReiya(sameDay3, 'night', ['yawn'])
]);
const compoundData = calculateEngine(compoundDb, false, { today: sameDay3 + 5, akirot: false });

assert(compoundData.bodyVeset.compound.length === 1
    && compoundData.bodyVeset.compound[0].kind === 'month'
    && compoundData.bodyVeset.compound[0].dayOfMonth === 5,
    'the same day-of-month with the same sign and onah establishes a compound veset');
assert(compoundData.bodyVeset.compound[0].establishedBy.length === 3,
    'and it is established from three consecutive sightings');

const nextFifth = d(5, 11, base); // ה' בשבט — החודש שאחרי הראייה האחרונה
const compoundEntries = entriesOn(compoundData, nextFifth);
assert(compoundEntries.some(p => p.code === COMPOUND_MONTH_CODE),
    'the compound veset is marked on the same day of the following month');
assert(compoundEntries.some(p => p.reason.indexOf('מורכב') !== -1 && p.reason.indexOf('פיהוק') !== -1),
    'and the marking names the compound and the sign it was established with');
assert(compoundEntries.some(p => p.ona === 'night'),
    'in the onah in which she saw');
// כשכל הראיות הקובעות באו עם המיחוש — "הוכח" שהקביעות היא לשילוב של היום והמיחוש,
// ולכן וסת הימים הגרידא מוחלפת `[שט מ' | עמ' 180]`.
assert(compoundData.standingVesets.length === 0,
    'the plain days-veset steps aside for the compound - the day alone was not proven to be the cause');
assert(compoundData.computed.suppressed.some(s => s.why === 'compound' && !!s.text),
    'and the replacement is reported, not dropped silently');

// החשש נוהג אף קודם שבא המיחוש — אך בלי עונת אור זרוע `[שט כ"ז | עמ' 49]`.
const withOrZarua = calculateEngine(compoundDb, true, { today: sameDay3 + 5, akirot: false });
const controlOrZarua = calculateEngine(dbOf([
    signReiya(sameDay1, 'night', ['yawn']),
    signReiya(sameDay2, 'night', ['yawn']),
    reiya(sameDay3, 'night')
]), true, { today: sameDay3 + 5, akirot: false });
assert(entriesOn(withOrZarua, nextFifth).some(p => p.code === COMPOUND_MONTH_CODE),
    'the compound concern is marked whether Or Zarua is on or off');
// עונת אור זרוע של וסת לילה היא העונה שלפניה — היום שלפני יום הוסת.
const orZaruaFor = (data, abs) => entriesOn(data, abs - 1)
    .filter(p => p.code === 'עוא"ז' && p.reason.indexOf('וסת קבוע') !== -1);
assert(orZaruaFor(withOrZarua, nextFifth).length === 0,
    'but no Or Zarua shift is added for it - "לעונת האור זרוע אין צריכה לחשוש אם עדיין לא בא המיחוש"');
assert(orZaruaFor(controlOrZarua, nextFifth).length === 1,
    'control: a plain (non-compound) veset of days DOES get the Or Zarua shift before that day');

// ---------- 4. "ראתה בנתיים ביום הוסת בלא המיחוש" — לא קבעה ----------

const brokenDb = dbOf([
    signReiya(sameDay1, 'night', ['yawn']),
    // ראייה באותו יום בחודש, אבל בלא המיחוש — קוטעת את הריצף `[שט מ' | עמ' 180]`.
    reiya(sameDay2, 'night'),
    signReiya(d(5, 10, base), 'night', ['yawn']),
    signReiya(d(5, 11, base), 'night', ['yawn'])
]);
const brokenData = calculateEngine(brokenDb, false, {
    today: d(5, 11, base) + 5, akirot: false
});
assert(brokenData.bodyVeset.compound.length === 0,
    'a sighting on the veset day WITHOUT the sign breaks the establishment - the Raavad condition');
assert(brokenData.bodyVeset.bySign.length === 1 && brokenData.bodyVeset.bySign[0].count === 3,
    'while the sign itself is still counted three times, which is a matter of its own');
assert(brokenData.standingVesets.length === 1 && brokenData.standingVesets[0].kind === 'month',
    'and in this case the day itself is what was proven to be the cause, so a days-veset stands');

// ---------- 5. וסת מורכב להפלגה ----------

const haf1 = d(5, 8, base);
const haf2 = haf1 + 20;
const haf3 = haf1 + 40;
const haf4 = haf1 + 60;
const hafDb = dbOf([
    signReiya(haf1, 'day', ['sneeze']),
    signReiya(haf2, 'day', ['sneeze']),
    signReiya(haf3, 'day', ['sneeze']),
    signReiya(haf4, 'day', ['sneeze'])
]);
const hafData = calculateEngine(hafDb, false, { today: haf4 + 5, chazaka: false, akirot: false });
const hafWithChazaka = calculateEngine(hafDb, false, { today: haf4 + 5, akirot: false });
const hafCompound = hafData.bodyVeset.compound.find(c => c.kind === 'haflagah');
assert(!!hafCompound && hafCompound.span === 20 && hafCompound.spanLabel === 21,
    'four sightings with the sign in equal intervals establish a compound haflagah veset (the halachic count includes both ends)');
assert(!!hafCompound && hafCompound.establishedBy.length === 4,
    'and the first sighting of the four is required to carry the sign as well');
assert(codesOn(hafData, haf4 + 20).indexOf(COMPOUND_HAFLAGAH_CODE) !== -1,
    'the compound haflagah is marked one interval after the last sighting');
assert(hafWithChazaka.standingVesets.length === 0
    && hafWithChazaka.computed.suppressed.some(s => s.why === 'compound'),
    'and here too the compound takes the place of the plain haflagah veset');

// ---------- 6. מיחוש על ראייה שאינה נספרת ----------

const onesDb = dbOf([
    signReiya(10000, 'day', ['yawn'], { kind: 'ones' }),
    signReiya(10030, 'day', ['yawn'], { kind: 'ones' }),
    signReiya(10061, 'day', ['yawn'], { kind: 'ones' })
]);
const onesData = calculateEngine(onesDb, false, { today: 10070, akirot: false });
assert(onesData.bodyVeset.bySign.length === 0 && onesData.bodyVeset.fixedBody.length === 0,
    'sightings caused by an external event establish nothing - even their signs');
assert(onesData.bodyVeset.unauditedSigns.length === 3,
    'but the signs are reported as not counted, so the record does not vanish');

// ---------- 7. הווסת המורכב אינו מבטל את שאר החששות ----------
// "בוסת המורכב לימים ולקפיצות... צריכה לחשוש לעונה בינונית" `[שט ל"ט | עמ' 165]`.

assert(compoundData.computed.suppressed.filter(s => s.text && s.text.indexOf('מכוח וסת קבוע') !== -1).length === 0,
    'no ordinary concern is set aside on account of the compound - ona beinonit and the like stay');
assert(codesOn(compoundData, sameDay3 + 29).indexOf('עו"ב') !== -1,
    'the beinonit concern is still marked after those sightings');

// ---------- 8. תצוגה: פאנל וסת הגוף וסימון היום בלוח ----------

const panel = { innerHTML: '', className: '', style: { display: '' } };
global.document = {
    getElementById: (id) => (id === 'chazaka-container' ? panel : null),
    querySelector: () => null,
    addEventListener: () => {}
};
const { updateChazakaPanel, buildMonthGridHTML } = await import('../js/ui.js');

updateChazakaPanel(compoundData);
assert(panel.style.display === 'block' && panel.innerHTML.indexOf('וסת הגוף') !== -1,
    'the panel has a section for the recorded signs');
assert(panel.innerHTML.indexOf('data-help="veset_haguf"') !== -1,
    'and it links to the halachic explanation instead of just asserting');
assert(panel.innerHTML.indexOf('וסת מורכב') !== -1,
    'the compound veset is spelled out in the panel');
assert(panel.innerHTML.indexOf('עמ\' 49') !== -1 || panel.innerHTML.indexOf("עמ' 49") !== -1,
    'including the source of the compounding din');
assert(panel.innerHTML.indexOf('עד שתבדוק') !== -1,
    'and the stringency of the check - a sign that came and passed with no check');

const otherPanel = { innerHTML: '', className: '', style: { display: '' } };
global.document = {
    getElementById: (id) => (id === 'chazaka-container' ? otherPanel : null),
    querySelector: () => null,
    addEventListener: () => {}
};
updateChazakaPanel(calculateEngine({}, false, { today: 10000 }));
assert(otherPanel.style.display === 'none',
    'with nothing recorded the panel stays closed');

// הסימון על גבי יום הראייה בלוח.
const monthGrid = buildMonthGridHTML(8, base, {
    [sameDay1]: { type: 'reiyah', ona: 'night', signs: ['yawn'] }
}, { computed: { prishot: {}, nekiim: [], tevilot: [] } });
assert(monthGrid.indexOf('bg-purple') !== -1 && monthGrid.indexOf('מיחוש') !== -1,
    'a day with a recorded sign is marked on the calendar');
assert(monthGrid.indexOf('פיהוק') !== -1,
    'and the tooltip names the sign');

// ---------- 9. התזכורת היומית: וסת הגוף בזרימת ההתראות ----------
// וסת הגוף אינה תלויה בתאריך, ולכן אין לה יום לסמן: דינה נוהג "משעה שבאו המיחושים"
// `[שט ל\'ט | עמ\' 158]` — והתזכורת נוקבת בבדיקה הנדרשת `[שט ל\"ט | עמ\' 160]`.

const onceDb = dbOf([signReiya(10000, 'day', ['yawn'])]);
const onceData = calculateEngine(onceDb, false, { today: 10005 });
const armedReminder = bodyReminder({
    bodyVeset: onceData.bodyVeset,
    prishot: onceData.computed.prishot,
    pendingChecks: onceData.computed.pendingChecks,
    today: 10005
});
assert(armedReminder.active && armedReminder.level === 'armed',
    'a recorded sign alone opens the daily reminder - the sign is armed');
assert(armedReminder.signs.indexOf('פיהוק') !== -1,
    'and the reminder names the sign it is about');
assert(armedReminder.lines.some(l => l.indexOf('אסורה עד שתבדוק') !== -1),
    'it states the din of the check: forbidden until she checks');
assert(armedReminder.lines.some(l => l.indexOf('בחו"ס') !== -1),
    'and specifies the required check - a proper one, depth and spaces');
assert(armedReminder.source.indexOf('עמ\' 160') !== -1,
    'with the source of the stringency, not as an unsupported demand');

// הזמן של הווסת המורכבת שעבר בלא בדיקה — "אסורה עד שתבדוק".
const dutyData = calculateEngine(compoundDb, false, { today: nextFifth + 3 });
const bodyDuties = dutyData.computed.pendingChecks.filter(p => p.kind === 'body');
assert(bodyDuties.length === 1 && bodyDuties[0].abs === nextFifth
    && bodyDuties[0].code === COMPOUND_MONTH_CODE,
    'a compound-veset time that passed with no check is demanded as a pending check');
assert(bodyDuties[0].reason.indexOf('פיהוק') !== -1,
    'and the demand names the sign the compound was established with');
assert(bodyDuties[0].reason.indexOf('עמ\' 160') !== -1,
    'and carries the din of body veset - even a non-fixed one is forbidden until she checks');
const pendingReminder = bodyReminder({
    bodyVeset: dutyData.bodyVeset,
    prishot: dutyData.computed.prishot,
    pendingChecks: dutyData.computed.pendingChecks,
    today: nextFifth + 3
});
assert(pendingReminder.active && pendingReminder.level === 'pending',
    'and the daily reminder treats it as the urgent state, above everything else');
assert(pendingReminder.dues.length === 1 && pendingReminder.dues[0].abs === nextFifth,
    'and reports the day itself, so the reminder is actionable');

// בדיקה כדין מבררת; קינוח לבד אינו מברר `[שט מ"א | עמ\' 182]`.
const checkedData = calculateEngine(Object.assign({}, compoundDb, {
    [nextFifth]: { type: 'check', ona: 'night', depth: 'deep' }
}), false, { today: nextFifth + 3 });
assert(!checkedData.computed.pendingChecks.some(p => p.kind === 'body'),
    'a proper check on that veset time clarifies it - the demand goes away');
const wipeData = calculateEngine(Object.assign({}, compoundDb, {
    [nextFifth]: { type: 'check', ona: 'night', depth: 'wipe' }
}), false, { today: nextFifth + 3 });
assert(wipeData.computed.pendingChecks.some(p => p.kind === 'body' && p.abs === nextFifth),
    'but a wipe-only record does not - the check that clarifies is a proper one');

// ראתה בו ביום — אין כאן "עבר ולא נבדקה", אלא הראייה עצמה.
const seenOnDay = calculateEngine(Object.assign({}, compoundDb, {
    [nextFifth]: { type: 'reiyah', ona: 'night', signs: ['yawn'] }
}), false, { today: nextFifth + 3 });
assert(!seenOnDay.computed.pendingChecks.some(p => p.kind === 'body' && p.abs === nextFifth),
    'a sighting on that day is no longer an unclear veset time - she saw');

// היום עצמו הוא יום הווסת המורכבת — חוששת בו אף קודם שבא המיחוש `[שט כ"ז | עמ\' 49]`.
const todayData = calculateEngine(compoundDb, false, { today: nextFifth });
const todayReminder = bodyReminder({
    bodyVeset: todayData.bodyVeset,
    prishot: todayData.computed.prishot,
    pendingChecks: todayData.computed.pendingChecks,
    today: nextFifth
});
assert(todayReminder.active && todayReminder.level === 'today',
    'on the compound day itself the reminder says so');
assert(todayReminder.lines.some(l => l.indexOf('קודם שבא המיחוש') !== -1),
    'and states the din: she is concerned that day even before the sign comes');
assert(todayReminder.lines.some(l => l.indexOf('לבדוק') !== -1),
    'and asks for the check of that day, not only for a separation');

// ---------- 10. התזכורת אינה מסתלקת מפני וסת קבועה של ימים ----------
// וסת החודש שנקבעה קודם ההריון חוזרת אחרי הלידה `[שט כ\'ט | עמ\' 71]`, ולצידה נקבעת
// וסת מורכבת מיום אחר. הווסת המורכבת אינה מסתלקת מפני האחרת — "צריכה לחשוש באותו
// היום אף קודם שבא המיחוש" `[שט כ\'ז | עמ\' 49]` — ולכן זמן הבדיקה שלה אינו נעלם.

const prePregnancy = [d(15, 1, 5785), d(15, 2, 5785), d(15, 3, 5785)];
const conceptionAbs = d(20, 3, 5785);
const birthAbs = addHebrewMonths(conceptionAbs, 9);
const postBirth = [d(5, 1, 5787), d(5, 2, 5787), d(5, 3, 5787)];
const twinDb = dbOf([
    reiya(prePregnancy[0], 'day'),
    reiya(prePregnancy[1], 'day'),
    reiya(prePregnancy[2], 'day'),
    signReiya(postBirth[0], 'day', ['yawn']),
    signReiya(postBirth[1], 'day', ['yawn']),
    signReiya(postBirth[2], 'day', ['yawn'])
]);
const twinLife = { enabled: true, pregnancyAbs: conceptionAbs, birthAbs: birthAbs };
const compoundAfterReturn = d(5, 4, 5787);
const twinDuty = calculateEngine(twinDb, false, { today: compoundAfterReturn + 3, life: twinLife });

assert(twinDuty.standingVesets.length >= 1,
    'control: a fixed veset of days stands here (the one that returned from the dormancy)');
assert(twinDuty.bodyVeset.compound.length === 1
    && twinDuty.bodyVeset.compound[0].dayOfMonth === 5,
    'and a compound veset was established from the sightings after the birth');
assert(twinDuty.computed.pendingChecks.some(p => p.kind === 'body' && p.abs === compoundAfterReturn),
    'the compound time that passed with no check is still demanded while that veset stands');
const twinReminder = bodyReminder({
    bodyVeset: twinDuty.bodyVeset,
    prishot: twinDuty.computed.prishot,
    pendingChecks: twinDuty.computed.pendingChecks,
    today: compoundAfterReturn + 3
});
assert(twinReminder.level === 'pending' && twinReminder.dues.length === 1,
    'and the daily reminder carries it to the head of the screen');

// ---------- 11. הכרטיס שבראש המסך ----------

const dash = {
    innerHTML: '', className: '', style: { display: '' },
    classList: {
        add: (cls) => { if (dash.className.indexOf(cls) === -1) dash.className += ' ' + cls; },
        remove: (cls) => { dash.className = dash.className.replace(cls, '').trim(); }
    }
};
global.document = {
    getElementById: (id) => (id === 'dashboard-container' ? dash : null),
    querySelector: () => null,
    addEventListener: () => {}
};
const { updateDashboard } = await import('../js/ui.js');

updateDashboard(compoundDb, dutyData, nextFifth + 3);
assert(dash.innerHTML.indexOf('עד שתבדוק') !== -1,
    'the head-of-screen card carries the demand: forbidden until she checks');
assert(dash.className.indexOf('dash-red') !== -1,
    'and it is presented as a prohibition, not as a note');
assert(dash.innerHTML.indexOf('data-help="veset_haguf"') !== -1,
    'and links to the halachic explanation instead of just asserting');

updateDashboard(onceDb, onceData, 10005);
assert(dash.innerHTML.indexOf('בחו"ס') !== -1,
    'an armed sign is carried on the card too, with the check it requires');
assert(dash.className.indexOf('dash-body') !== -1,
    'and it joins the day card as a second block rather than replacing it');

if (failures > 0) {
    console.error(`\n${failures} body-veset test(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll body-veset tests passed.');
}
