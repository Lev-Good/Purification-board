/**
 * בדיקות ל**מיחוש גופני בלא ראייה** — הפער שהיה מוצהר ב-`docs/DECISIONS.md`:
 * "מיחוש שיבוא לבדו אינו ידוע למנוע ואין לו תזכורת מתוארכת".
 *
 * Run with: node tests/signOnly.test.js
 *
 * מה נבדק:
 *  1. המיחוש עצמו אוסר — "משעה שבאו המיחושים אסורה כדין שעת הוסת" `[שט ל"ט | עמ' 158]` —
 *     ולכן רישום מיחוש בלא ראייה נמנה עם מיחושי וסת הגוף: ג' פעמים לאותו מיחוש קובעות
 *     וסת הגוף `[שט ל"ט | עמ' 158]`, ופחות מכך — "חוששת לו כדין וסת שאינו קבוע" `[שט ל"ט | עמ' 160]`.
 *  2. רישום המיחוש **אינו** מוסיף חשש תאריכי מעצמו: אין וסת מורכב ממיחושים בלא ראיות,
 *     שהרי אין להם יום קביעות `[שט מ' | עמ' 180]`.
 *  3. תזכורת מתוארכת: מיחוש שתועד ולא נבדק בו — "אסורה עד שתבדוק" `[שט ל"ט | עמ' 160]` —
 *     והיא מוצגת בתזכורת ובכרטיס שבראש המסך.
 *  4. בדיקה שנעשתה בו ביום סוגרת את התביעה (המיחוש נספח לרשומת הבדיקה).
 *  5. הגיבוי והשחזור שומרים על המיחוש בלא ראייה (עמודת הסוג + עמודת המיחושים).
 */
import { HDate } from '../hebcal.js';
import { calculateEngine } from '../js/calculations.js';
import { analyzeBodyVeset, bodyReminder, BODY_FIXED_COUNT } from '../js/vesetGuf.js';
import { buildPayload, parseBackupRows } from '../js/googleBackup.js';

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
const SIGN = 'yawn';

/** רשומת מיחוש בלא ראייה, כפי שהיא נשמרת ב-db. */
const signEntry = (ona, signs) => ({
    type: 'sign',
    ona: ona || 'day',
    signs: signs || [SIGN],
    standaloneSign: true
});
/** רשומת בדיקה שנספח אליה מיחוש בלא ראייה (המיחוש נרשם, ואחר כך נבדקה). */
const checkedSignEntry = (ona, signs) => Object.assign(signEntry(ona, signs), {
    type: 'check', depth: 'deep'
});

const dbOf = (list) => {
    const db = {};
    list.forEach(item => { db[item.abs] = item.entry; });
    return db;
};

// --- 1. הרישום נספר לוסת הגוף, אף בלא ראייה ---------------------------------

const threeAbs = [d(5, 'Tishrei', 5785), d(5, 'Cheshvan', 5785), d(5, 'Kislev', 5785)];
const threeDb = dbOf(threeAbs.map(abs => ({ abs, entry: signEntry('day') })));
const threeData = calculateEngine(threeDb, false, { today: threeAbs[2] + 2 });

assert((threeData.computed.standaloneSigns || []).length === 3,
    'every sign without a sighting reaches the engine as such');
const fixedBySign = (threeData.bodyVeset.bySign || []).filter(s => s.fixed);
assert(fixedBySign.length === 1 && fixedBySign[0].count === BODY_FIXED_COUNT,
    'three signs without sightings establish a fixed body-veset');
assert(threeData.bodyVeset.fixedBody.length === 1,
    'and the panel reports it as a fixed veset, not as an ordinary concern');

const twoDb = dbOf(threeAbs.slice(0, 2).map(abs => ({ abs, entry: signEntry('day') })));
const twoData = calculateEngine(twoDb, false, { today: threeAbs[1] + 2 });
assert((twoData.bodyVeset.bySign[0] || {}).fixed === false,
    'two signs are short of the chazaka');
assert((twoData.bodyVeset.pendingBody || []).length === 1,
    'and they are reported as "choshshes lo ke-derech veset she-eino kavua"');

// --- 2. אין וסת מורכב ממיחושים בלא ראיות ------------------------------------

assert((threeData.bodyVeset.compound || []).length === 0,
    'signs without sightings never form a compound (day + sign) veset');
assert(threeData.reiyot.length === 0,
    'and they are not counted as sightings at all');

const sortedSameDay = [d(5, 'Tishrei', 5785), d(5, 'Cheshvan', 5785), d(5, 'Kislev', 5785)]
    .map(abs => ({ abs, ona: 'day', signs: [SIGN] }));
assert(analyzeBodyVeset({ reiyot: [], signRecords: sortedSameDay }).compound.length === 0,
    'the same is true when the analyzer is called directly');

// --- 3. תזכורת מתוארכת: אסורה עד שתבדוק --------------------------------------

const uncheckedDb = dbOf([{ abs: threeAbs[0], entry: signEntry('night') }]);
const uncheckedData = calculateEngine(uncheckedDb, false, { today: threeAbs[0] + 3 });
const reminder = bodyReminder({
    bodyVeset: uncheckedData.bodyVeset,
    prishot: uncheckedData.computed.prishot,
    pendingChecks: uncheckedData.computed.pendingChecks,
    today: threeAbs[0] + 3
});
assert(reminder.active && reminder.level === 'pending',
    'a sign that was never checked raises the "forbidden until she checks" demand');
assert(reminder.dues.length === 1 && reminder.dues[0].abs === threeAbs[0],
    'and the demand is DATED — the day the sign came is what it hangs on');
assert(reminder.lines.join(' ').indexOf('בחו"ס') !== -1,
    'and it names the check that actually clarifies: a proper one, in depth and in spaces');

// --- 4. בדיקה בו ביום סוגרת את התביעה ----------------------------------------

const checkedDb = dbOf([{ abs: threeAbs[0], entry: checkedSignEntry('day') }]);
assert(checkedDb[threeAbs[0]].standaloneSign === true && checkedDb[threeAbs[0]].type === 'check',
    'a checked sign keeps BOTH records: the check and the sign it clarified');
const checkedData = calculateEngine(checkedDb, false, { today: threeAbs[0] + 3 });
assert(checkedData.computed.standaloneSigns.length === 1
    && checkedData.computed.standaloneSigns[0].checked === true,
    'the engine sees it as a sign that was checked');
const checkedReminder = bodyReminder({
    bodyVeset: checkedData.bodyVeset,
    prishot: checkedData.computed.prishot,
    pendingChecks: checkedData.computed.pendingChecks,
    today: threeAbs[0] + 3
});
assert(!(checkedReminder.level === 'pending' && checkedReminder.dues.some(x => x.abs === threeAbs[0])),
    'so the dated demand is closed, and does not hang over her forever');

// --- 5. המיחוש שורד את הגיבוי ואת השחזור -------------------------------------

const payload = buildPayload(checkedDb, '123456', 'a@b.c');
const restored = parseBackupRows(payload);
assert(restored.db[threeAbs[0]] && restored.db[threeAbs[0]].type === 'check',
    'a check that carries a sign comes back as a check');
assert(restored.db[threeAbs[0]].standaloneSign === true,
    'and it comes back marked as a standalone sign');
assert((restored.db[threeAbs[0]].signs || []).indexOf(SIGN) !== -1,
    'and its body-sign survives the round-trip');

const plainRestored = parseBackupRows(buildPayload(uncheckedDb, '123456', ''));
assert(plainRestored.db[threeAbs[0]].type === 'sign',
    'a sign without a sighting comes back as a sign record');
assert(plainRestored.db[threeAbs[0]].ona === 'night',
    'with its onah');
assert(plainRestored.db[threeAbs[0]].standaloneSign === true,
    'and marked as standalone — so the engine still counts it');
const restoredData = calculateEngine(plainRestored.db, false, { today: threeAbs[0] + 3 });
assert(restoredData.bodyVeset.bySign.length === 1,
    'and the restored database yields the same body-veset analysis');

if (failures > 0) {
    console.error(`\n${failures} sign-without-sighting test(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll sign-without-sighting tests passed.');
}
