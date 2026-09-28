/**
 * בדיקות ל**שתי בדיקות בעונת הוסת** (A3) — הלכתחילה: בעונת היום עם הקימה וסמוך
 * לשקיעה, ובעונת הלילה סמוך לשקיעה ולפני השינה. עיקר הדין בפעם אחת, והשנייה לכתחילה
 * `[שט ל' | עמ' 77]`.
 *
 * Run with: node tests/checkTwice.test.js
 *
 * מה נבדק:
 *  1. הסימון "בדקתי פעמיים" נשמר על רשומת הבדיקה ומגיע למנוע.
 *  2. **שני חלקי העונה** נשמרים בפני עצמם (`checkParts`) ולא נבלעים בשדה אחד,
 *     ומהם מחזיר `extractChecks` שתי רשומות בדיקה — כל אחת עם החלק שלה.
 *  3. הרישום שורד את הגיבוי, את השחזור, ואת טאב ההיסטוריה.
 *  4. הוא **אינו** משנה את הדין: בדיקה כדין נשארת בדיקה כדין, ואינה הופכת לקינוח —
 *     ולהפך, קינוח שנעשה פעמיים נשאר קינוח.
 */
import { HDate } from '../hebcal.js';
import { buildPayload, parseBackupRows, parseHistoryRows, diffDb, buildRestorePoints } from '../js/googleBackup.js';
import { extractChecks, checkPartsOf, checkCountOf, CHECK_PARTS } from '../js/akira.js';
import { calculateEngine } from '../js/calculations.js';

let failures = 0;
function assert(condition, message) {
    if (condition) {
        console.log('PASS: ' + message);
    } else {
        failures++;
        console.error('FAIL: ' + message);
    }
}

const abs = new HDate(12, 'Sivan', 5785).abs();

const deepTwice = { type: 'check', ona: 'day', depth: 'deep', twice: true };
const wipeTwice = { type: 'check', ona: 'night', depth: 'wipe', twice: true };

const rows = buildPayload({ [abs]: deepTwice }, '123456', '');
const row = rows[0];
assert(row[9].indexOf('פעמיים') !== -1,
    'the sheet says she checked twice — the record is not silently reduced to "checked"');
assert(row[9].indexOf('בדיקה כדין') === 0,
    'and the depth is still written first, so the sheet stays readable');

const restored = parseBackupRows(rows).db[abs];
assert(restored.depth === 'deep' && restored.twice === true,
    'a proper check made twice comes back proper AND twice');
assert(parseBackupRows(buildPayload({ [abs]: wipeTwice }, '', '')).db[abs].depth === 'wipe',
    'and a wipe-only check stays wipe-only even when marked twice');

// טאב ההיסטוריה: אותו אופן רישום, ופרסור משלים.
const changes = diffDb({}, { [abs]: deepTwice });
const historyRows = changes.map(c => ['2026-01-01T00:00:00.000Z', String(c.abs), '', '', 'בדיקה', 'יום', '', c.action, 'בדיקה כדין · פעמיים בעונה', '', '']);
const history = parseHistoryRows(historyRows);
assert(history.length === 1 && history[0].entry.depth === 'deep' && history[0].entry.twice === true,
    'the history tab carries it too, and the restore point rebuilds it');

const points = buildRestorePoints(history);
assert(points.length === 1 && points[0].db[abs].twice === true,
    'so a restored backup holds the same record she had');

// בדיקה שאינה מזוהה — נשארת בברירת המחדל הזהירה, ולא "משתדרגת".
const garbage = parseHistoryRows([['2026-01-01T00:00:00.000Z', String(abs), '', '', 'בדיקה', 'יום', '', 'נוסף', 'בדקה משהו', '', '']]);
assert(garbage[0].entry.depth === 'wipe',
    'an unreadable depth still falls back to the cautious value, twice or not');

// ---------- שני חלקי העונה: רשומות בדיקה נפרדות ----------

const dayTwice = {
    type: 'check', ona: 'day', depth: 'deep', twice: true,
    checkParts: ['rise', 'sunset']
};
assert(checkPartsOf(dayTwice).join('+') === 'rise+sunset', 'שני חלקי העונה נשמרים לפי סדרם');
assert(checkCountOf(dayTwice) === 2, 'ומהם נגזר מניין הבדיקות שבעונה');
assert(checkCountOf({ type: 'check', ona: 'day', depth: 'deep' }) === 1,
    'ובדיקה בודדת נחשבת אחת');
assert(checkCountOf({ type: 'reiyah', ona: 'day' }) === 0, 'וראייה אינה בדיקה');

const twoRecords = extractChecks({ [abs]: dayTwice });
assert(twoRecords.length === 2 && twoRecords[0].part === 'rise' && twoRecords[1].part === 'sunset',
    'extractChecks מחזיר רשומת בדיקה לכל חלק של העונה');
assert(extractChecks({ [abs]: { type: 'check', ona: 'day', depth: 'deep' } }).length === 1,
    'ובדיקה אחת מחזירה רשומה אחת');

// הגיבוי נושא את שני החלקים, והשחזור מחזירם כלשונם.
const partsRow = buildPayload({ [abs]: dayTwice }, '', '')[0];
assert(partsRow[9].indexOf('עם הקימה') !== -1 && partsRow[9].indexOf('סמוך לשקיעה') !== -1,
    'הגיליון נוקב בשני החלקים, ולא רק ב"פעמיים"');
const partsRestored = parseBackupRows([partsRow]).db[abs];
assert(partsRestored.checkParts && partsRestored.checkParts.join('+') === 'rise+sunset',
    'והשחזור מחזיר אותם קודים — ובכך גם שתי רשומות בדיקה');
assert(partsRestored.depth === 'deep' && partsRestored.twice === true,
    'ובלא לפגוע בעומק הבדיקה ובסימון הכפילות');

const nightTwice = { type: 'check', ona: 'night', depth: 'deep', checkParts: ['sunset', 'bedtime'] };
assert(parseBackupRows(buildPayload({ [abs]: nightTwice }, '', '')).db[abs].checkParts.join('+') === 'sunset+bedtime',
    'והוא הדין בעונת הלילה — סמוך לשקיעה ולפני השינה');
assert(CHECK_PARTS.day.length === 2 && CHECK_PARTS.night.length === 2,
    'לכל עונה שני חלקים מנויים');

const histTwice = parseHistoryRows([[
    '2026-01-01T00:00:00.000Z', String(abs), '', '', 'בדיקה', 'יום', '', 'נוסף',
    'בדיקה כדין · פעמיים בעונה (עם הקימה · סמוך לשקיעה)', '', ''
]]);
assert(histTwice[0].entry.checkParts && histTwice[0].entry.checkParts.length === 2,
    'וטאב ההיסטוריה משחזר את שני החלקים');

// והדין אינו משתנה: שתי הבדיקות מכסות את זמן הוסת כשם שבדיקה אחת מכסה.
const vesetDays = [new HDate(1, 1, 5786).abs(), new HDate(1, 2, 5786).abs(), new HDate(1, 3, 5786).abs()];
const dbTwo = {};
vesetDays.forEach(a => { dbTwo[a] = { type: 'reiyah', ona: 'day' }; });
dbTwo[vesetDays[2] + 30] = dayTwice;
const withTwo = calculateEngine(dbTwo, false, { today: vesetDays[2] + 40 });
const withOne = calculateEngine(Object.assign({}, dbTwo, {
    [vesetDays[2] + 30]: { type: 'check', ona: 'day', depth: 'deep' }
}), false, { today: vesetDays[2] + 40 });
assert(JSON.stringify(withTwo.pendingChecks) === JSON.stringify(withOne.pendingChecks),
    'שתי בדיקות בעונה אינן משנות את תוצאת המנוע מול בדיקה אחת');

if (failures > 0) {
    console.error(`\n${failures} two-checks-in-the-onah test(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll two-checks-in-the-onah tests passed.');
}
