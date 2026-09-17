/**
 * Unit tests for the Google Sheets backup payload builder and restore parser.
 * Run with: node tests/googleBackup.test.js
 */
import { buildPayload, parseBackupRows, mergeDb, diffDb, parseHistoryRows, buildRestorePoints } from '../js/googleBackup.js';
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

// --- Scenario 1: backup payload from a small db ---
const db = {
    10000: { type: 'reiyah', ona: 'day', note: 'יום ראשון' },
    10005: { type: 'hefsek', note: '' },
    10012: { type: 'tevilah' },
    10020: { type: 'reiyah', ona: 'night' }
};

const rows = buildPayload(db, '123456', 'user@example.com');

assert(Array.isArray(rows) && rows.length === 5, 'payload has one row per event plus meta row (4 events + 1 meta)');
assert(rows[0][0] === '1' && rows[3][0] === '4', 'serial numbers are sequential');
assert(rows[0][4] === 'ראייה' && rows[0][5] === 'יום', 'reiyah day row has correct type and onah');
assert(rows[1][4] === 'הפסק טהרה' && rows[1][5] === '—', 'hefsek row has correct type and no onah');
assert(rows[2][4] === 'טבילה', 'tevilah row has correct type');
assert(rows[3][5] === 'לילה', 'night reiyah has night onah');
assert(rows[0][1] === new HDate(10000).renderGematriya(), 'hebrew date column matches HDate rendering');
assert(rows[0][3] === '10000', 'internal absolute-day id is preserved');
assert(rows[0][6] === 'יום ראשון', 'note text is preserved');

const metaRow = rows[4];
assert(metaRow[7] === '123456', 'meta row contains the PIN');
assert(metaRow[8] === 'user@example.com', 'meta row contains the recovery email');

// --- Scenario 2: empty db still produces meta row ---
const emptyRows = buildPayload({}, '654321', '');
assert(emptyRows.length === 1, 'empty db produces only the meta row');
assert(emptyRows[0][7] === '654321' && emptyRows[0][8] === '—', 'empty db meta row keeps PIN, missing email shown as dash');
const emptyParsed = parseBackupRows(emptyRows);
assert(emptyParsed.pin === '654321' && emptyParsed.recoveryEmail === '', 'parser treats dash email as empty');

// --- Scenario 3: restore parsing round-trip ---
const parsed = parseBackupRows(rows);
assert(Object.keys(parsed.db).length === 4, 'restore parser recovers all 4 events');
assert(parsed.db[10000].type === 'reiyah' && parsed.db[10000].ona === 'day', 'reiyah day restored with onah');
assert(parsed.db[10005].type === 'hefsek', 'hefsek restored');
assert(parsed.db[10012].type === 'tevilah', 'tevilah restored');
assert(parsed.db[10020].ona === 'night', 'night reiyah restored with night onah');
assert(parsed.db[10000].note === 'יום ראשון', 'note restored');
assert(parsed.pin === '123456', 'PIN restored');
assert(parsed.recoveryEmail === 'user@example.com', 'recovery email restored');

// --- Scenario 4: restore ignores unknown/garbage rows but keeps meta ---
const weird = [
    ['', '', '', '', 'מטא-נתונים', '', '', '111222', 'a@b.c'],
    ['2', 'x', 'y', 'not-a-number', 'ראייה', 'יום', '', '', ''],
    ['3', 'x', 'y', '10050', 'סוג לא מוכר', '', '', '', ''],
    ['4', 'x', 'y', '10060', 'ראייה', 'יום', '', '', '']
];
const parsed2 = parseBackupRows(weird);
assert(Object.keys(parsed2.db).length === 1 && parsed2.db[10060], 'unknown types and bad ids are skipped, valid rows kept');
assert(parsed2.pin === '111222' && parsed2.recoveryEmail === 'a@b.c', 'meta extracted even when data rows are dirty');

// --- Scenario 5: merge restore never deletes local data ---
const localDb = {
    10000: { type: 'reiyah', ona: 'day' },
    10005: { type: 'hefsek' }
};
const remoteDb = {
    10000: { type: 'reiyah', ona: 'night' },   // differs - local must win
    10012: { type: 'tevilah' },                 // missing locally - must be added
    10020: { type: 'reiyah', ona: 'day' }
};
const merged = mergeDb(localDb, remoteDb);
assert(Object.keys(merged.db).length === 4, 'merge keeps all local events and adds the missing ones');
assert(merged.db[10005].type === 'hefsek', 'a local-only event survives the merge (this is the accidental-deletion case)');
assert(merged.db[10012].type === 'tevilah', 'an event present only in the backup is restored');
assert(merged.db[10000].ona === 'day', 'a conflicting event keeps the LOCAL value - merge never overwrites');
assert(merged.addedKeys.length === 2 && merged.addedKeys.indexOf('10012') > -1, 'added keys are reported for the confirmation dialog');
assert(merged.localOnlyKeys.length === 1 && merged.localOnlyKeys[0] === '10005', 'local-only keys are reported');

// --- Scenario 6: merge on empty inputs is a no-op ---
const emptyMerge = mergeDb({}, {});
assert(Object.keys(emptyMerge.db).length === 0 && emptyMerge.addedKeys.length === 0, 'merge of two empty databases yields nothing');
const nullSafe = mergeDb(null, remoteDb);
assert(Object.keys(nullSafe.db).length === 3, 'merge tolerates a null local db (no throw)');

// --- Scenario 7: merge must not mutate its inputs ---
const before = JSON.stringify(localDb);
mergeDb(localDb, remoteDb);
assert(JSON.stringify(localDb) === before, 'merge does not mutate the local database it was given');

// --- Scenario 8: change log detects adds, edits and deletions ---
const logBefore = { 100: { type: 'reiyah', ona: 'day', note: '' }, 200: { type: 'hefsek', note: '' } };
const logAfter = {
    100: { type: 'reiyah', ona: 'day', note: '' },          // unchanged
    300: { type: 'tevilah', note: '' },                       // added
    200: { type: 'hefsek', note: 'עודכן' }                   // updated
};
const changes = diffDb(logBefore, logAfter);
assert(changes.length === 2, 'diff reports only the two real changes');
assert(changes.some(c => c.abs === 300 && c.action === 'נוסף'), 'diff detects an added event');
assert(changes.some(c => c.abs === 200 && c.action === 'עודכן'), 'diff detects an updated event');
assert(!changes.some(c => c.abs === 100), 'an unchanged event is not logged');
assert(diffDb(logBefore, {})[0].action === 'נמחק', 'diff detects a deletion');
assert(diffDb({}, logBefore).length === 2, 'the first ever backup logs every event as added (baseline)');

// --- Scenario 9: history rows are parsed defensively ---
const ts1 = '2026-09-01T10:00:00.000Z';
const ts2 = '2026-09-10T10:00:00.000Z';
const historyRows = [
    ['חותמת זמן', 'מזהה', 'תאריך עברי', 'תאריך לועזי', 'סוג אירוע', 'עונה', 'הערה', 'פעולה'], // header
    [ts1, '100', 'א טבת', '01/01/2026', 'ראייה', 'יום', 'הערה', 'נוסף'],
    [ts1, '200', 'ב טבת', '02/01/2026', 'טבילה', '—', '', 'נוסף'],
    [ts2, '100', 'א טבת', '01/01/2026', 'ראייה', 'יום', '', 'נמחק'],   // the deletion we want back
    ['', '', '', '', '', '', '', ''],                                   // empty row
    [ts2, 'not-a-number', 'x', 'y', 'ראייה', 'יום', '', 'נוסף'],        // garbage id
    [ts2, '400', 'x', 'y', 'סוג לא מוכר', '', '', 'נוסף'],              // unknown type
    [ts2, '500', 'x', 'y', 'ראייה', 'יום', '', 'פעולה שגויה']           // unknown action
];
const log = parseHistoryRows(historyRows);
assert(log.length === 4, 'header, empty rows, bad ids and unknown actions are skipped');
assert(log[0].ts === ts1 && log[0].action === 'נוסף' && log[0].entry.type === 'reiyah', 'a change row parses with its event entry');
assert(log[0].entry.ona === 'day', 'onah survives the history round-trip');
// A row whose event type is unknown is kept (a deletion must be replayable even
// then) but carries no entry, so it can never inject a bogus event.
const unknownRow = log.find(r => r.abs === 400);
assert(unknownRow && unknownRow.entry === null, 'an unknown event type is kept without an entry');

// --- Scenario 10: a deleted event is still recoverable from an earlier point ---
const points = buildRestorePoints(log);
assert(points.length === 2, 'one restore point per backup timestamp');
assert(points[0].ts === ts2, 'points are listed newest first');
assert(points[1].count === 2, 'the older point holds both events');
assert(points[1].db[100] && points[1].db[100].type === 'reiyah', 'the deleted event still exists in the older point');
assert(points[0].count === 1 && points[0].db[200], 'the newer point reflects the deletion');
assert(!points[0].db[400], 'an entry-less row never becomes an event in the reconstructed state');
assert(points[0].deleted === 1, 'the newer point reports the deletion for display');

// Recovering it: merging the older point back into a database that lost it
const current = { 200: { type: 'tevilah', note: '' } };
const recovered = mergeDb(current, points[1].db);
assert(Object.keys(recovered.db).length === 2 && recovered.db[100], 'merge restores the deleted event from the earlier point');
assert(recovered.addedKeys.length === 1, 'exactly one event is offered back');

// --- Scenario 11: B3/B5 (sighting kind + bleeding duration) survive backup ---
const kindDb = {
    30000: { type: 'reiyah', ona: 'day', note: '', kind: 'ones' },
    30005: { type: 'reiyah', ona: 'night', kind: 'sharp', durationDays: 4 },
    30010: { type: 'hefsek' }
};
const kindParsed = parseBackupRows(buildPayload(kindDb, '111111', ''));
assert(kindParsed.db[30000].kind === 'ones', 'sighting kind survives the main-tab round-trip');
assert(kindParsed.db[30005].durationDays === 4, 'bleeding duration survives the main-tab round-trip');
assert(kindParsed.db[30010].kind === undefined, 'non-sighting events carry no kind');
assert(kindParsed.db[30000].signs === undefined, 'a sighting with no recorded sign carries none back');

// --- Scenario 12: the same two fields survive the HISTORY tab ---
const kindHistory = parseHistoryRows([
    ['2026-09-17T10:00:00.000Z', '30000', 'א', '1/1/2026', 'ראייה', 'יום', '', 'נוסף', 'אונס / קפיצה', ''],
    ['2026-09-17T10:00:00.000Z', '30005', 'ב', '2/1/2026', 'ראייה', 'לילה', '', 'נוסף', 'מאכל חריף', '4']
]);
assert(kindHistory[0].entry.kind === 'ones', 'history row keeps the sighting kind');
assert(kindHistory[1].entry.kind === 'sharp' && kindHistory[1].entry.durationDays === 4, 'history row keeps kind and duration');
const kindPoints = buildRestorePoints(kindHistory);
assert(kindPoints[0].db[30000].kind === 'ones', 'restore point rebuilds the sighting kind');
assert(kindPoints[0].db[30005].durationDays === 4, 'restore point rebuilds the bleeding duration');
assert(kindPoints[0].db[30005].kind === 'sharp', 'restore point keeps a non-default kind');

// --- Scenario 12b: B4 (checks) survive both tabs ---
const checkDb = {
    50000: { type: 'check', ona: 'day', note: '', depth: 'deep' },
    50001: { type: 'check', ona: 'night', note: '', depth: 'wipe' }
};
const checkRows = buildPayload(checkDb, '111111', '');
assert(checkRows[0][4] === 'בדיקה', 'a check is written with its own type label');
assert(checkRows[0][5] === 'יום' && checkRows[1][5] === 'לילה', 'a check keeps its onah (the veset onah it covers)');
assert(checkRows[0][9] === 'בדיקה כדין' && checkRows[1][9] === 'קינוח בלבד', 'the depth is written in the kind column');

const checkParsed = parseBackupRows(checkRows);
assert(checkParsed.db[50000].type === 'check' && checkParsed.db[50000].depth === 'deep',
    'a proper check survives the main-tab round-trip');
assert(checkParsed.db[50001].depth === 'wipe', 'a wipe-only record survives as such');
assert(checkParsed.db[50001].ona === 'night', 'the onah of a check survives the round-trip');

// The history tab keeps the same two details.
const checkHistory = parseHistoryRows([
    ['2026-09-17T10:00:00.000Z', '50000', 'א', '1/1/2026', 'בדיקה', 'יום', '', 'נוסף', 'בדיקה כדין', ''],
    ['2026-09-17T10:00:00.000Z', '50001', 'ב', '2/1/2026', 'בדיקה', 'לילה', '', 'נוסף', 'קינוח בלבד', '']
]);
assert(checkHistory[0].entry.depth === 'deep' && checkHistory[1].entry.depth === 'wipe',
    'history row keeps how the check was made');
const checkPoints = buildRestorePoints(checkHistory);
assert(checkPoints[0].db[50000].depth === 'deep', 'a restore point rebuilds a proper check');

// An unreadable depth must never come back as a PROPER check: that would uproot a
// veset that was never clarified.
const unknownDepth = parseBackupRows([
    ['1', 'א', '1/1/2026', '60000', 'בדיקה', 'יום', '', '', '', 'משהו אחר', '']
]);
assert(unknownDepth.db[60000].depth === 'wipe', 'an unreadable depth falls back to the cautious value');

// --- Scenario 12c: B2 (body-signs, וסת הגוף) survive both tabs ---
const signsDb = {
    70000: { type: 'reiyah', ona: 'night', note: '', kind: 'regular', signs: ['yawn', 'faceSpots'] },
    70001: { type: 'reiyah', ona: 'day', kind: 'ones', signs: ['sneeze'] },
    70002: { type: 'hefsek' }
};
const signsRows = buildPayload(signsDb, '111111', '');
assert(signsRows[0][11] === 'פיהוק / פצעים בפנים', 'the body-signs are written to the sheet as readable labels');
assert(signsRows[2][11] === '', 'an event without signs leaves the column empty');

const signsParsed = parseBackupRows(signsRows);
assert(JSON.stringify(signsParsed.db[70000].signs) === JSON.stringify(['yawn', 'faceSpots']),
    'the body-signs survive the main-tab round-trip');
assert(signsParsed.db[70002].signs === undefined, 'non-sighting events carry no signs');

// טאב ההיסטוריה נושא אף הוא את המיחושים — אחרת נקודת שחזור הייתה מאבדת אותם בשקט.
const signsHistory = parseHistoryRows([
    ['2026-09-17T10:00:00.000Z', '70000', 'א', '1/1/2026', 'ראייה', 'לילה', '', 'נוסף', 'רגילה', '', 'פיהוק / פצעים בפנים']
]);
assert(JSON.stringify(signsHistory[0].entry.signs) === JSON.stringify(['yawn', 'faceSpots']),
    'a history row keeps the body-signs');
const signsPoints = buildRestorePoints(signsHistory);
assert(JSON.stringify(signsPoints[0].db[70000].signs) === JSON.stringify(['yawn', 'faceSpots']),
    'and a restore point rebuilds them');

// תווית שאינה מוכרת נשמרת כמו שהיא — עדיף קוד לא־מזוהה מאשר אובדן התיעוד.
const legacySign = parseBackupRows([
    ['1', 'א', '1/1/2026', '71000', 'ראייה', 'יום', '', '', '', 'רגילה', '', 'מיחוש ישן']
]);
assert(JSON.stringify(legacySign.db[71000].signs) === JSON.stringify(['מיחוש ישן']),
    'an unrecognised sign label is kept rather than dropped');

// --- Scenario 13: editing only the kind is logged as an update ---
const kindEdit = diffDb(
    { 40000: { type: 'reiyah', ona: 'day', kind: 'regular' } },
    { 40000: { type: 'reiyah', ona: 'day', kind: 'ones' } }
);
assert(kindEdit.length === 1 && kindEdit[0].action === 'עודכן', 'a kind-only edit is logged as an update');

if (failures > 0) {
    console.error('\n' + failures + ' test(s) failed.');
    process.exit(1);
} else {
    console.log('\nAll backup tests passed.');
}
