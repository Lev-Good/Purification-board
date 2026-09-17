/**
 * End-to-end verification of the Google backup HISTORY feature.
 *
 * Simulates two consecutive backups (the second one deletes an event), writes
 * the change log to a real temporary spreadsheet exactly like the app does,
 * reads it back, rebuilds the restore points and proves the deleted event can
 * be recovered. The temporary spreadsheet is deleted at the end.
 *
 * Run: node tools/verify_google_history.mjs
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { diffDb, parseHistoryRows, buildRestorePoints, mergeDb } from '../js/googleBackup.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const mainSrc = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
const CLIENT_ID = mainSrc.match(/OAUTH_DEFAULT_CLIENT_ID = '([^']+)'/)[1];
const CLIENT_SECRET = mainSrc.match(/OAUTH_DEFAULT_CLIENT_SECRET = '([^']+)'/)[1];
const store = JSON.parse(fs.readFileSync(
    path.join(os.homedir(), 'AppData', 'Roaming', 'purification-board', 'google-oauth-store.json'), 'utf8'));

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets/';
const DRIVE = 'https://www.googleapis.com/drive/v3/files/';
const TAB = 'היסטוריה';
const HEADER = ['חותמת זמן', 'מזהה', 'תאריך עברי', 'תאריך לועזי', 'סוג אירוע', 'עונה', 'הערה', 'פעולה',
    'סוג הראייה', 'משך הראייה'];
const LAST_COL = 'J';
const KIND_LABELS = { regular: 'רגילה', ones: 'אונס / קפיצה', sharp: 'מאכל חריף', pills: 'כדורים' };
const TYPE_LABELS = { reiyah: 'ראייה', hefsek: 'הפסק טהרה', tevilah: 'טבילה' };

let failures = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + msg); if (!ok) failures++; };

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
        client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
        refresh_token: store.refreshToken, grant_type: 'refresh_token'
    }).toString()
});
const token = (await tokenRes.json()).access_token;
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

const created = await (await fetch(SHEETS, {
    method: 'POST', headers: H,
    body: JSON.stringify({ properties: { title: 'בדיקת היסטוריה - לוח טהרה (יימחק)' } })
})).json();
const sid = created.spreadsheetId;
console.log('גיליון זמני נוצר:', sid.slice(0, 12) + '…\n');

try {
    // --- create the history tab, exactly as the app does ---
    const add = await fetch(SHEETS + sid + ':batchUpdate', {
        method: 'POST', headers: H,
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: TAB } } }] })
    });
    check(add.ok, 'יצירת טאב ההיסטוריה בשם עברי');
    const hdr = await fetch(`${SHEETS}${sid}/values/${encodeURIComponent(TAB + '!A1:' + LAST_COL + '1')}?valueInputOption=RAW`, {
        method: 'PUT', headers: H, body: JSON.stringify({ values: [HEADER] })
    });
    check(hdr.ok, 'כתיבת שורת הכותרות');

    const toRows = (changes, ts) => changes.map(c => {
        let heb = '', greg = '';
        const entry = c.entry || {};
        return [ts, String(c.abs), heb, greg, TYPE_LABELS[entry.type] || '',
            entry.type === 'reiyah' ? (entry.ona === 'day' ? 'יום' : 'לילה') : '—',
            entry.note || '', c.action,
            entry.type === 'reiyah' ? (KIND_LABELS[entry.kind] || KIND_LABELS.regular) : '—',
            entry.type === 'reiyah' && entry.durationDays > 1 ? String(entry.durationDays) : ''];
    });

    // --- backup #1: three events, nothing before it ---
    const db1 = {
        740001: { type: 'reiyah', ona: 'day', note: 'אירוע ותיק', kind: 'ones' },
        740002: { type: 'hefsek', note: '' },
        740003: { type: 'tevilah', note: '' }
    };
    const ts1 = '2026-09-10T08:00:00.000Z';
    const log1 = toRows(diffDb({}, db1), ts1);
    const w1 = await fetch(`${SHEETS}${sid}/values/${encodeURIComponent(TAB + '!A2:' + LAST_COL)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
        method: 'POST', headers: H, body: JSON.stringify({ values: log1 })
    });
    check(w1.ok && log1.length === 3, 'גיבוי ראשון נרשם כ-3 אירועים חדשים (בסיס)');

    // --- backup #2: one event deleted, one edited, one added ---
    const db2 = {
        740002: { type: 'hefsek', note: 'נערך' },
        740003: { type: 'tevilah', note: '' },
        740004: { type: 'reiyah', ona: 'night', note: 'נוסף מאוחר יותר', kind: 'sharp', durationDays: 4 }
    };
    const ts2 = '2026-09-15T08:00:00.000Z';
    const changes2 = diffDb(db1, db2);
    const log2 = toRows(changes2, ts2);
    const w2 = await fetch(`${SHEETS}${sid}/values/${encodeURIComponent(TAB + '!A2:' + LAST_COL)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
        method: 'POST', headers: H, body: JSON.stringify({ values: log2 })
    });
    check(w2.ok, 'גיבוי שני נרשם');
    check(changes2.filter(c => c.action === 'נוסף').length === 1, 'השינוי: אירוע אחד נוסף');
    check(changes2.filter(c => c.action === 'עודכן').length === 1, 'השינוי: אירוע אחד עודכן');
    check(changes2.filter(c => c.action === 'נמחק').length === 1, 'השינוי: אירוע אחד נמחק');

    // --- read the history back the way a fresh install would ---
    const read = await fetch(`${SHEETS}${sid}/values/${encodeURIComponent(TAB + '!A2:' + LAST_COL + '100000')}`, { headers: H });
    check(read.ok, 'קריאת ההיסטוריה מהגיליון');
    const rows = parseHistoryRows(((await read.json()).values) || []);
    const points = buildRestorePoints(rows);

    check(points.length === 2, 'נבנו שתי נקודות שחזור');
    check(points[0].ts === ts2, 'הנקודה החדשה מוצגת ראשונה');
    check(points[0].count === 3 && !points[0].db[740001], 'בנקודה החדשה האירוע שנמחק אינו קיים');
    check(points[1].count === 3 && !!points[1].db[740001], 'בנקודה הישנה האירוע שנמחק עדיין קיים');
    check(points[1].db[740001].note === 'אירוע ותיק', 'פרטי האירוע שנמחק נשמרו במלואם');
    check(points[0].db[740002].note === 'נערך', 'העדכון מופיע בנקודה החדשה');
    check(points[0].db[740004].ona === 'night', 'האירוע שנוסף מופיע עם העונה שלו');
    check(points[1].db[740001].kind === 'ones', 'סוג הראייה שרד את סבב הכתיבה והקריאה האמיתי');
    check(points[0].db[740004].kind === 'sharp' && points[0].db[740004].durationDays === 4,
        'סוג הראייה ומשך הדימום שרדו את סבב הכתיבה והקריאה האמיתי (כולל העמודות החדשות)');

    // --- recover the deleted event by merging the older point ---
    const recovered = mergeDb(db2, points[1].db);
    check(Object.keys(recovered.db).length === 4 && !!recovered.db[740001], 'המיזוג מחזיר את האירוע שנמחק');
    check(recovered.addedKeys.length === 1, 'מוצע בחזרה אירוע אחד בלבד');
    check(recovered.db[740002].note === 'נערך', 'הערך המקומי לא נדרס במיזוג');
    check(recovered.db[740001].kind === 'ones', 'האירוע המשוחזר חזר עם סוג הראייה שלו — לא הונמך ל"רגילה"');
} finally {
    const del = await fetch(DRIVE + sid, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
    console.log('\nניקוי: הגיליון הזמני נמחק ->', del.status);
}

console.log(failures === 0 ? '\n=== כל האימות עבר ===' : `\n=== ${failures} כשלים ===`);
process.exit(failures === 0 ? 0 : 1);
