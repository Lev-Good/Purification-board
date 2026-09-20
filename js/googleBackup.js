import { HDate } from '../hebcal.js';
import { BODY_SIGNS } from './vesetGuf.js';
import { DAY_MARKS, marksOf } from './dayMarks.js';
import { checkPartsOf, checkPartLabel, ALL_CHECK_PARTS } from './akira.js';
import { showToast } from './notifications.js';
import { getHistoryState, saveHistoryState } from './storage.js';

/**
 * Google Sheets automatic backup module.
 *
 * Flow:
 *  - OAuth loopback flow handled in the Electron main process (window.api.oauthStart).
 *  - API calls are made from the renderer via fetch; the main process attaches
 *    the Authorization header automatically to sheets/drive endpoints.
 *  - One spreadsheet per user ("לוח טהרת המשפחה - גיבוי") with a "Backup" sheet:
 *      A מספר סידורי | B תאריך עברי | C תאריך לועזי | D מזהה פנימי |
 *      E סוג אירוע | F עונה | G הערה | H סימוני יום / קוד גיבוי (PIN) |
 *      I אימייל שחזור | J סיבת הראייה | K משך (ימים) | L מיחוש גופני
 *
 * עמודה H נושאת שני תפקידים: בשורת יום — סימוני היום, ובשורת המטא-נתונים —
 * קוד הגיבוי. הפיצול מכוון: הוספת עמודה שלוש-עשרה הייתה מפילה את הכתיבה על
 * גיליון שנוצר בגרסה שקבעה `columnCount: 12`.
 *
 * Retry policy: first attempt immediately; on failure retry after 1 minute,
 * then 5, 10, 20 ... doubling, capped at 2 hours. A successful backup resets it.
 */

const TYPE_LABELS = {
    reiyah: 'ראייה',
    hefsek: 'הפסק טהרה',
    tevilah: 'טבילה',
    check: 'בדיקה',
    sign: 'מיחוש גופני'
};

// B4: HOW she checked. Only a proper check (depth/spaces) can uproot a veset,
// so the depth has to survive the round-trip and not come back as a "proper"
// check that was never made.
const CHECK_DEPTH_LABELS = {
    deep: 'בדיקה כדין',
    wipe: 'קינוח בלבד'
};
const CHECK_DEPTH_FROM_LABEL = {
    'בדיקה כדין': 'deep',
    'קינוח בלבד': 'wipe'
};

// Why a sighting happened matters for the חזקה (B3): a sighting caused by a
// sudden external event ("קפיצה") is not counted toward establishing a וסת,
// while one caused by sharp food or pills is counted like וסת הגוף.
const KIND_LABELS = {
    regular: 'רגילה',
    ones: 'אונס / קפיצה',
    sharp: 'מאכל חריף',
    pills: 'כדורים'
};
const KIND_FROM_LABEL = {
    'רגילה': 'regular',
    'אונס / קפיצה': 'ones',
    'מאכל חריף': 'sharp',
    'כדורים': 'pills'
};
// סימוני היום (js/dayMarks.js) — תווית קריאה בגיליון וחזרה לקוד.
const MARK_LABELS = DAY_MARKS.reduce((acc, m) => { acc[m.code] = m.label; return acc; }, {});
const MARK_FROM_LABEL = DAY_MARKS.reduce((acc, m) => { acc[m.label] = m.code; return acc; }, {});
const MARK_CODES = new Set(DAY_MARKS.map(m => m.code));

const TYPE_FROM_LABEL = {
    'ראייה': 'reiyah',
    'הפסק טהרה': 'hefsek',
    'טבילה': 'tevilah',
    'בדיקה': 'check',
    'מיחוש גופני': 'sign'
};

// B2 — מיחושי וסת הגוף (וסת הגוף והווסת המורכב). הרשימה נגזרת מ-js/vesetGuf.js,
// כדי שמה שנשמר לגיליון יהיה בדיוק מה שהמנוע מזהה.
const SIGN_LABELS = BODY_SIGNS.reduce((acc, sign) => {
    acc[sign.code] = sign.label;
    return acc;
}, {});
const SIGN_FROM_LABEL = BODY_SIGNS.reduce((acc, sign) => {
    acc[sign.label] = sign.code;
    return acc;
}, {});

/**
 * עמודת המיחושים: תוויות שהמשתמשת יכולה לקרוא בגיליון.
 *
 * נכתבת גם לראייה, גם לרשומת מיחוש בלא ראייה (`type: 'sign'`), וגם ליום שרישום
 * המיחוש נספח בו לבדיקה (`standaloneSign`) — כדי שמיחוש שתועד בלא ראייה לא יאבד
 * בגיבוי ובשחזור. `standaloneSign` אינו נשמר כעמודה נפרדת: עצם הופעת המיחוש
 * בשורה שסוגה אינו "ראייה" מסמנת אותו (מזוהה בשחזור).
 */
/**
 * דרגת ודאות (2026-09-20, מסמכי "יסודות הבית") — רלוונטית רק למיחוש **בלא
 * ראייה** (`standaloneSign`). ברירת המחדל ("certain") אינה נכתבת כלל, כדי
 * שרוב השורות (שלא נוגעות בשדה הזה) יישארו בדיוק כמו שהיו; הסיומת נכתבת רק
 * כשהדרגה "סביר" או "מסופק".
 */
const CERTAINTY_SUFFIX_LABELS = { likely: 'סביר', vague: 'מסופק' };
const CERTAINTY_FROM_LABEL = { 'סביר': 'likely', 'מסופק': 'vague' };
const CERTAINTY_SUFFIX_RE = /\s*·\s*ודאות:\s*(סביר|מסופק)\s*$/;

function signsCellFor(entry) {
    if (!entry) return '';
    if (entry.type !== 'reiyah' && entry.type !== 'sign' && entry.standaloneSign !== true) return '';
    const codes = Array.isArray(entry.signs) ? entry.signs : [];
    let text = codes.map(code => SIGN_LABELS[code] || code).join(' / ');
    // דרגת ודאות רלוונטית רק למיחוש **בלא ראייה** — `type: 'sign'` הוא מיחוש
    // כזה בהגדרה, ו-`standaloneSign` מסמן את אותו דבר על בדיקה שנספח לה מיחוש.
    const isStandalone = entry.type === 'sign' || entry.standaloneSign === true;
    if (isStandalone && CERTAINTY_SUFFIX_LABELS[entry.signCertainty]) {
        text += ' · ודאות: ' + CERTAINTY_SUFFIX_LABELS[entry.signCertainty];
    }
    return text;
}

/**
 * מפרסרת את עמודת המיחושים חזרה לקודים.
 *
 * תווית שאינה מוכרת נשמרת כמו שהיא ולא נזרקת: עדיף קוד לא־מזוהה (שאינו קובע
 * וסת, אך נשמר ומוצג) מאשר איבוד תיעוד של מיחוש בשקט. סיומת דרגת הוודאות
 * (אם קיימת) מופרדת קודם — ראו `certaintyFromSignsCell`.
 */
function signsFromCell(cell) {
    return String(cell || '')
        .replace(CERTAINTY_SUFFIX_RE, '')
        .split('/')
        .map(part => part.trim())
        .filter(Boolean)
        .map(label => SIGN_FROM_LABEL[label] || label);
}

/** דרגת הוודאות של מיחוש בלא ראייה; 'certain' (ברירת המחדל) כשאין סיומת. */
function certaintyFromSignsCell(cell) {
    const m = String(cell || '').match(CERTAINTY_SUFFIX_RE);
    return m ? CERTAINTY_FROM_LABEL[m[1]] : 'certain';
}

/**
 * עמודת סימוני היום: כתם · פחד פתאום · חרדה מתמשכת · יציאה לדרך · ליל חופה.
 *
 * הסימונים אינם "סוג אירוע" — הם נכתבים על רשומת היום מכל סוג, ולכן גם על
 * הפסק טהרה או בדיקה. בלעדיהם שחזור מגיליון היה מוחק אותם בשקט, וממילא היו
 * נעלמים גם הדינים התלויים בהם (פטורי אור זרוע, דין הכתם, תביעת הבדיקה של הבהלה).
 */
function marksCellFor(entry) {
    const codes = marksOf(entry);
    if (!codes.length) return '';
    return codes.map(code => MARK_LABELS[code] || code).join(' / ');
}

/** תווית שאינה מזוהה נשמרת — סימון שנוסף בעתיד לא ייעלם בגיבוי. */
function marksFromCell(cell) {
    return String(cell || '')
        .split('/')
        .map(part => part.trim())
        .filter(Boolean)
        .map(label => MARK_FROM_LABEL[label] || label);
}

/** The onah column carries a value for sightings, checks and sign records. */
function onaCellFor(entry) {
    if (entry.type !== 'reiyah' && entry.type !== 'check' && entry.type !== 'sign') return '—';
    return entry.ona === 'day' ? 'יום' : 'לילה';
}

/** הסיומת שנוספת לאופן הבדיקה כשנבדקה פעמיים בעונה (A3 — לכתחילה). */
const TWICE_SUFFIX = ' · פעמיים בעונה';

/**
 * הסיומת שמסמנת שנמצא דם בבדיקה — לשימוש מתג "וסת מעד בדיקה" (`vesetFromBedika`,
 * js/stringencies.js). נכתבת ישר אחרי תווית העומק, לפני סיומת "פעמיים" והחלקים
 * שבסוגריים — כדי שהרגקס שמאתר את הסוגריים בסוף המחרוזת (`parseCheckKind`) ימשיך
 * לעבוד בלי שינוי.
 */
const BLOOD_FOUND_SUFFIX = ' · נמצא דם';

/** The "kind" column: why a sighting happened, or how a check was made. */
function kindCellFor(entry) {
    if (entry.type === 'reiyah') return KIND_LABELS[entry.kind] || KIND_LABELS.regular;
    if (entry.type === 'check') {
        let label = CHECK_DEPTH_LABELS[entry.depth] || CHECK_DEPTH_LABELS.deep;
        if (entry.bloodFound === true) label += BLOOD_FOUND_SUFFIX;
        // A3 — בדיקה שנעשתה פעמיים בעונה נשמרת עם שני חלקי העונה שבהם נעשתה,
        // כדי ששחזור לא יוריד את הבדיקה השנייה לשדה "פעמיים" סתמי.
        const parts = checkPartsOf(entry);
        if (parts.length) {
            return label + TWICE_SUFFIX + ' (' + parts.map(checkPartLabel).join(' · ') + ')';
        }
        return entry.twice === true ? label + TWICE_SUFFIX : label;
    }
    return '—';
}

/**
 * מפרסר את עמודת אופן הבדיקה.
 *
 * הסיומת "פעמיים בעונה" מופרדת מן העומק לפני הפרסור — אחרת הוא היה נופל לברירת
 * המחדל הזהירה (קינוח בלבד), וסמלה של בדיקה כדין היה נהפך לסמלה של בדיקה שאינה
 * מבררת. בחילוץ שנכשל — ברירת המחדל הזהירה נשארת על כנה (see below).
 */
function parseCheckKind(raw) {
    const text = String(raw || '').trim();
    // חלקי העונה נכתבים בסוגריים בסוף התא; הם מופרדים לפני הפרסור, שאחרת התווית
    // לא היתה מזוהה והעומק היה נפל לברירת המחדל הזהירה.
    const partMatch = text.match(/\(([^)]*)\)\s*$/);
    const partsText = partMatch ? partMatch[1] : '';
    const withoutParts = partMatch ? text.slice(0, partMatch.index).trim() : text;
    const twice = withoutParts.indexOf('פעמיים') !== -1;
    let label = twice ? withoutParts.replace(/·\s*פעמיים בעונה\s*$/, '').trim() : withoutParts;
    // "וסת מעד בדיקה" (מתג vesetFromBedika) — סימון שנמצא דם בבדיקה זו.
    const bloodFound = label.indexOf('נמצא דם') !== -1;
    if (bloodFound) label = label.replace(/·\s*נמצא דם\s*$/, '').trim();
    const parts = partsText.split('·').map(s => s.trim()).filter(Boolean);
    return { depth: CHECK_DEPTH_FROM_LABEL[label] || null, twice, parts, bloodFound };
}

const CHECK_PART_FROM_LABEL = ALL_CHECK_PARTS.reduce((acc, p) => { acc[p.label] = p.code; return acc; }, {});

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets/';
const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';
const SPREADSHEET_TITLE = 'לוח טהרת המשפחה - גיבוי';
const HEADER_ROW = [
    'מספר סידורי', 'תאריך עברי', 'תאריך לועזי', 'מזהה פנימי',
    'סוג אירוע', 'עונה', 'הערה',
    // עמודה זו נשאת שני תפקידים, ואינה יכולה להתפצל בלא להרחיב את הגיליון הקיים:
    // בשורת יום — **סימוני היום** (כתם / פחד פתאום / חרדה / יציאה לדרך / חופה),
    // ובשורת המטא-נתונים — קוד הגיבוי. הקריאה מפרידה ביניהן לפי סוג השורה.
    'סימוני יום / קוד גיבוי', 'אימייל שחזור',
    'סיבת הראייה', 'משך (ימים)', 'מיחוש גופני (וסת הגוף)'
];
// Last column letter of the data range - keep in sync with HEADER_ROW.
const LAST_COLUMN = 'L';

// --- History tab (restore points) ---
// Append-only log of every change, so a deleted event can still be recovered
// after later backups have already rewritten the main tab. Each backup adds one
// row per CHANGE rather than a full snapshot: readable, and it grows with edits
// instead of with time.
const HISTORY_SHEET = 'היסטוריה';
const HISTORY_HEADER = [
    'חותמת זמן', 'מזהה', 'תאריך עברי', 'תאריך לועזי', 'סוג אירוע', 'עונה', 'הערה', 'פעולה',
    // B3 / B5 / B2 live here too: without them a restore point would silently
    // downgrade a sighting to "regular" and drop its bleeding duration and its
    // recorded body-sign (וסת הגוף).
    'סוג הראייה', 'משך הראייה', 'מיחוש גופני',
    // סימוני היום (js/dayMarks.js) — כתם, פחד פתאום, חרדה, יציאה לדרך, ליל חופה.
    // בלעדיהם היה שחזור מנקודת גיבוי מוחק בשקט את סימוני היום שנרשמו.
    'סימוני יום'
];
// Last column of the history tab - keep in sync with HISTORY_HEADER.
const HISTORY_LAST_COLUMN = 'L';
const ACTIONS = ['נוסף', 'עודכן', 'נמחק'];

const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // once a day
const BACKOFF_STEPS_MS = [60_000, 300_000];     // 1 min, then 5 min
const BACKOFF_BASE_MS = 600_000;                // then 10 min, 20 min, ... capped
const BACKOFF_MAX_MS = 2 * 60 * 60 * 1000;      // 2 hours cap

let retryTimer = null;
let retryCount = 0;
let backupInFlight = false;
let lastErrorShown = 0;

function hasApi() {
    return typeof window !== 'undefined' && window.api && window.api.oauthStatus;
}

// ---------- Payload building ----------

export function buildPayload(db, pinPlain, recoveryEmail) {
    const absDays = Object.keys(db || {}).map(Number).sort((a, b) => a - b);
    const rows = [];
    let serial = 0;

    absDays.forEach(abs => {
        const entry = db[abs];
        if (!entry) return;
        let hd;
        try { hd = new HDate(abs); } catch (e) { return; }

        serial++;
        const heb = hd.renderGematriya();
        const greg = hd.greg().toLocaleDateString('he-IL');
        const type = TYPE_LABELS[entry.type] || (entry.type || '—');
        const ona = onaCellFor(entry);
        const note = entry.note || '';
        // B3 / B5 / B4: why the sighting happened, whether the bleeding ran on,
        // and how a check was made.
        const kind = kindCellFor(entry);
        const duration = entry.type === 'reiyah' && entry.durationDays > 1 ? String(entry.durationDays) : '';
        const signs = signsCellFor(entry);
        // עמודה 7 (H): סימוני היום. בשורת המטא-נתונים שבהמשך היא נושאת את קוד הגיבוי.
        const marks = marksCellFor(entry);
        rows.push([String(serial), heb, greg, String(abs), type, ona, note, marks, '', kind, duration, signs]);
    });

    // Credential block is attached to every backup so a fresh install can restore everything.
    const pinRow = ['', '', '', '', 'מטא-נתונים', '—', 'קוד גיבוי של האפליקציה', pinPlain || '—', recoveryEmail || '—', '', '', ''];
    rows.push(pinRow);

    return rows;
}

// ---------- Low level API helpers ----------

async function ensureAccessToken() {
    if (!hasApi() || !window.api.oauthEnsureToken) return null;
    // Refreshes the token via the main process if needed; the interceptor
    // then attaches it automatically to Google API requests.
    return window.api.oauthEnsureToken();
}

/**
 * Finds a backup spreadsheet this app has already created.
 * The `drive.file` scope only ever exposes files the app itself created, so a
 * name search can never surface a spreadsheet belonging to the user.
 */
async function findExistingSpreadsheet() {
    try {
        const q = `mimeType='application/vnd.google-apps.spreadsheet' and name='${SPREADSHEET_TITLE}' and trashed=false`;
        const url = `${DRIVE_FILES_API}?q=${encodeURIComponent(q)}&orderBy=createdTime desc&fields=files(id)&pageSize=10`;
        const res = await fetch(url, { headers: { 'Authorization': 'Bearer PLACEHOLDER' } });
        if (!res.ok) return null;
        const data = await res.json();
        const first = (data.files || [])[0];
        return first ? first.id : null;
    } catch (e) {
        return null; // listing is best-effort; creating a new file still works
    }
}

/**
 * Cosmetic layout of a freshly created sheet: rename, header row styling and
 * column widths. Kept separate because it must NEVER fail a backup.
 */
async function formatBackupSheet(sheetId) {
    // --- Essential: the tab MUST be named "Backup" ---
    // Every range used by the backup and the restore is "Backup!...". A missing
    // rename turns each of them into 400 "Unable to parse range", which is
    // exactly how the rename failure hid behind a generic backup failure.
    // Kept in its own request so a cosmetic rejection cannot take it down.
    const renameRes = await fetch(SHEETS_API + sheetId + ':batchUpdate', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer PLACEHOLDER', 'Content-Type': 'application/json' },
        body: JSON.stringify({
            requests: [{
                // `sheetId` belongs INSIDE `properties` - at the top level of
                // updateSheetProperties Google rejects the whole request with
                // 400 "Unknown name sheetId".
                updateSheetProperties: {
                    properties: { sheetId: 0, title: 'Backup' },
                    fields: 'title'
                }
            }]
        })
    });
    if (!renameRes.ok) throw new Error('rename_sheet_failed_' + renameRes.status);

    // --- Cosmetic: colours, frozen header, column widths, header row ---
    // Best-effort. A styling quirk must never cost the user a backup.
    try {
        const requests = [
            {
                updateSheetProperties: {
                    properties: { sheetId: 0, gridProperties: { frozenRowCount: 1, columnCount: HEADER_ROW.length } },
                    fields: 'gridProperties.frozenRowCount,gridProperties.columnCount'
                }
            },
            {
                repeatCell: {
                    range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: { red: 0.31, green: 0.27, blue: 0.9 },
                            textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 11, bold: true },
                            horizontalAlignment: 'CENTER'
                        }
                    },
                    fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
                }
            },
            {
                // Google's request is called autoResizeDimensions; the previous
                // name (autoResizeColumns) does not exist and made the whole
                // batchUpdate fail with "Unknown name".
                autoResizeDimensions: {
                    dimensions: { sheetId: 0, dimension: 'COLUMNS', startIndex: 0, endIndex: HEADER_ROW.length }
                }
            },
            {
                updateCells: {
                    range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: HEADER_ROW.length },
                    rows: [{ values: HEADER_ROW.map(v => ({ userEnteredValue: { stringValue: v } })) }],
                    fields: 'userEnteredValue'
                }
            }
        ];

        const batchRes = await fetch(SHEETS_API + sheetId + ':batchUpdate', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer PLACEHOLDER', 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests })
        });
        if (!batchRes.ok) throw new Error('format_sheet_failed_' + batchRes.status);

        // Write the header row in its own call too, so a rejected style request
        // cannot leave the sheet without headers.
        const headerRes = await fetch(
            `${SHEETS_API}${sheetId}/values/Backup!A1:${LAST_COLUMN}1?valueInputOption=USER_ENTERED`,
            {
                method: 'PUT',
                headers: { 'Authorization': 'Bearer PLACEHOLDER', 'Content-Type': 'application/json' },
                body: JSON.stringify({ values: [HEADER_ROW] })
            }
        );
        if (!headerRes.ok) throw new Error('header_write_failed_' + headerRes.status);
    } catch (e) {
        console.warn('[GoogleBackup] cosmetic formatting skipped:', e);
    }
}

/**
 * Returns the backup spreadsheet's id, reusing one the app already created.
 */
async function maybeCreateSpreadsheet() {
    const status = await window.api.oauthStatus();
    if (status.sheetId) return status;

    // Reuse before creating. Every failed attempt used to leave ANOTHER orphan
    // spreadsheet in the user's Drive - the retry loop produced 19 of them.
    let sheetId = await findExistingSpreadsheet();

    if (!sheetId) {
        const res = await fetch(SHEETS_API, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer PLACEHOLDER', // replaced by the main-process interceptor
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ properties: { title: SPREADSHEET_TITLE } })
        });
        if (!res.ok) throw new Error('create_sheet_failed_' + res.status);
        const created = await res.json();
        sheetId = created.spreadsheetId;
    }

    // Persist the id BEFORE formatting: if the cosmetic step failed, the next
    // attempt reuses this sheet instead of creating yet another one.
    await window.api.oauthSetMeta({ sheetId });

    try {
        await formatBackupSheet(sheetId);
    } catch (e) {
        console.warn('[GoogleBackup] cosmetic formatting skipped:', e);
    }

    return Object.assign({}, status, { sheetId });
}

// ---------- History tab I/O ----------

/**
 * Makes sure the "היסטוריה" tab exists (with its header). Creating it is done
 * once per spreadsheet; a hit on an existing tab is just a metadata read.
 */
async function ensureHistorySheet(spreadsheetId) {
    const metaRes = await fetch(`${SHEETS_API}${spreadsheetId}?fields=sheets.properties.title`, {
        headers: { 'Authorization': 'Bearer PLACEHOLDER' }
    });
    if (!metaRes.ok) throw new Error('history_meta_failed_' + metaRes.status);
    const titles = ((await metaRes.json()).sheets || []).map(s => s.properties.title);
    if (titles.indexOf(HISTORY_SHEET) === -1) {
        const addRes = await fetch(`${SHEETS_API}${spreadsheetId}:batchUpdate`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer PLACEHOLDER', 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests: [{ addSheet: { properties: { title: HISTORY_SHEET } } }] })
        });
        if (!addRes.ok) throw new Error('history_add_failed_' + addRes.status);
    }

    // The header is (re)written even on an existing tab: the column set grew
    // after the first release (kind / duration were added), and a stale header
    // would mislabel the newer columns for anyone reading the sheet.
    const headerRes = await fetch(
        `${SHEETS_API}${spreadsheetId}/values/${encodeURIComponent(HISTORY_SHEET + '!A1:' + HISTORY_LAST_COLUMN + '1')}?valueInputOption=RAW`,
        {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer PLACEHOLDER', 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: [HISTORY_HEADER] })
        }
    );
    if (!headerRes.ok) throw new Error('history_header_failed_' + headerRes.status);
}

/**
 * Records what changed since the last backup as one row per change.
 * Best-effort by design: a history hiccup must never fail the backup itself.
 */
async function logHistory(spreadsheetId, db) {
    const previous = getHistoryState();
    const changes = diffDb(previous, db);

    if (changes.length === 0) {
        saveHistoryState(db); // keep the baseline in sync even when nothing changed
        return;
    }

    await ensureHistorySheet(spreadsheetId);

    const ts = new Date().toISOString();
    const rows = changes.map(change => {
        let heb = '';
        let greg = '';
        try {
            const hd = new HDate(change.abs);
            heb = hd.renderGematriya();
            greg = hd.greg().toLocaleDateString('he-IL');
        } catch (e) { /* out-of-range abs - dates stay blank */ }

        const entry = change.entry || {};
        const type = TYPE_LABELS[entry.type] || '';
        const ona = onaCellFor(entry);
        const kind = kindCellFor(entry);
        const duration = entry.type === 'reiyah' && entry.durationDays > 1 ? String(entry.durationDays) : '';
        const signs = signsCellFor(entry);
        const marks = marksCellFor(entry);
        return [ts, String(change.abs), heb, greg, type, ona, entry.note || '', change.action, kind, duration, signs, marks];
    });

    const res = await fetch(
        `${SHEETS_API}${spreadsheetId}/values/${encodeURIComponent(HISTORY_SHEET + '!A2:' + HISTORY_LAST_COLUMN)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        {
            method: 'POST',
            headers: { 'Authorization': 'Bearer PLACEHOLDER', 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: rows })
        }
    );
    if (!res.ok) throw new Error('history_append_failed_' + res.status);

    saveHistoryState(db);
}

/**
 * Reads the change log. Returns an empty list when the tab does not exist yet
 * (backups made before this feature) - that is not an error.
 */
async function loadHistoryRows() {
    const status = await window.api.oauthStatus();
    if (!status.sheetId) return [];
    const token = await ensureAccessToken();
    if (!token) throw new Error('no_token');

    const res = await fetch(
        `${SHEETS_API}${status.sheetId}/values/${encodeURIComponent(HISTORY_SHEET + '!A2:' + HISTORY_LAST_COLUMN + '100000')}`,
        { headers: { 'Authorization': 'Bearer PLACEHOLDER' } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return parseHistoryRows(data.values || []);
}

/**
 * The restore points offered in the settings screen, newest first.
 */
export async function fetchRestorePoints() {
    return buildRestorePoints(await loadHistoryRows());
}

// ---------- Backup ----------

async function performBackup(db, pinPlain, recoveryEmail, reason) {
    if (backupInFlight) return false;
    if (!hasApi()) return false;

    backupInFlight = true;
    try {
        const token = await ensureAccessToken();
        if (!token) throw new Error('no_token');

        const status = await maybeCreateSpreadsheet();
        if (!status.sheetId) throw new Error('no_sheet');

        const rows = buildPayload(db, pinPlain, recoveryEmail);

        // Clear previous content (data + meta), then append fresh rows.
        const clearRes = await fetch(
            `${SHEETS_API}${status.sheetId}/values/Backup!A2:${LAST_COLUMN}100000:clear`,
            { method: 'POST', headers: { 'Authorization': 'Bearer PLACEHOLDER', 'Content-Type': 'application/json' }, body: '{}' }
        );
        if (!clearRes.ok) throw new Error('clear_failed_' + clearRes.status);

        const appendRes = await fetch(
            `${SHEETS_API}${status.sheetId}/values/Backup!A2:${LAST_COLUMN}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
            {
                method: 'POST',
                headers: { 'Authorization': 'Bearer PLACEHOLDER', 'Content-Type': 'application/json' },
                body: JSON.stringify({ values: rows })
            }
        );
        if (!appendRes.ok) throw new Error('append_failed_' + appendRes.status);

        // Record what changed since the previous backup. Wrapped so a history
        // problem (missing tab, quota, a rejected range) can never turn a
        // successful backup into a failure.
        try {
            await logHistory(status.sheetId, db);
        } catch (e) {
            console.warn('[GoogleBackup] history log skipped:', e);
        }

        await window.api.oauthSetMeta({ lastBackupAt: new Date().toISOString() });
        cancelRetry();
        return true;
    } finally {
        backupInFlight = false;
    }
}

// ---------- Retry scheduler (1 min -> 5 min -> 10, 20, 40 ... capped at 2h) ----------

function nextRetryDelay() {
    if (retryCount < BACKOFF_STEPS_MS.length) {
        return BACKOFF_STEPS_MS[retryCount];
    }
    const step = retryCount - BACKOFF_STEPS_MS.length;
    return Math.min(BACKOFF_BASE_MS * Math.pow(2, step), BACKOFF_MAX_MS);
}

function cancelRetry() {
    if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
    }
    retryCount = 0;
}

function scheduleRetry(db, pinPlain, recoveryEmail, reason) {
    cancelRetry();
    const delay = nextRetryDelay();
    retryCount++;
    console.warn(`[GoogleBackup] retry #${retryCount} in ${Math.round(delay / 1000)}s (reason: ${reason})`);
    retryTimer = setTimeout(() => {
        attemptBackup(db, pinPlain, recoveryEmail, reason, true).catch(() => { /* handled inside */ });
    }, delay);
}

async function attemptBackup(db, pinPlain, recoveryEmail, reason, silent) {
    try {
        const ok = await performBackup(db, pinPlain, recoveryEmail, reason);
        if (ok && !silent) showToast('הגיבוי לגוגל הושלם בהצלחה ✓');
        if (ok && reason === 'auto') console.info('[GoogleBackup] automatic backup completed');
        return ok;
    } catch (err) {
        console.error('[GoogleBackup] failed:', err);
        // Only surface repeated failures once an hour to avoid nagging
        if (!silent && Date.now() - lastErrorShown > 60 * 60 * 1000) {
            lastErrorShown = Date.now();
            showToast('הגיבוי לגוגל נכשל - ייעשה ניסיון חוזר בעוד רגע');
        }
        scheduleRetry(db, pinPlain, recoveryEmail, reason);
        return false;
    }
}

// ---------- History (change log behind the restore points) ----------

/**
 * Compares two database snapshots and returns the list of changes.
 * On the very first backup the previous snapshot is empty, so every event is
 * reported as "added" - that baseline is what makes later deletions visible.
 *
 * @returns {Array<{abs:number, action:string, entry:object}>}
 */
export function diffDb(prevDb, nextDb) {
    const prev = prevDb || {};
    const next = nextDb || {};
    const changes = [];

    for (const key of Object.keys(next)) {
        const before = prev[key];
        const after = next[key];
        if (!before) {
            changes.push({ abs: Number(key), action: 'נוסף', entry: after });
        } else if (JSON.stringify(before) !== JSON.stringify(after)) {
            changes.push({ abs: Number(key), action: 'עודכן', entry: after });
        }
    }
    for (const key of Object.keys(prev)) {
        if (!(key in next)) changes.push({ abs: Number(key), action: 'נמחק', entry: prev[key] });
    }

    return changes.sort((a, b) => a.abs - b.abs);
}

/**
 * Converts the history tab's raw rows into change records, skipping the header
 * and anything malformed (the sheet is user-editable, so garbage must never
 * break a restore).
 */
export function parseHistoryRows(values) {
    const out = [];
    (values || []).forEach(row => {
        if (!row) return;
        const ts = String(row[0] || '').trim();
        const abs = Math.floor(Number(row[1]));
        const action = String(row[7] || '').trim();
        if (!ts || !Number.isFinite(abs) || abs <= 0) return;
        if (ACTIONS.indexOf(action) === -1) return;

        const type = TYPE_FROM_LABEL[String(row[4] || '').trim()];
        let entry = null;
        if (type) {
            entry = { type, note: String(row[6] || '') };
            if ((type === 'reiyah' || type === 'check' || type === 'sign')
                && (row[5] === 'יום' || row[5] === 'לילה')) {
                entry.ona = row[5] === 'יום' ? 'day' : 'night';
            }
            if (type === 'check') {
                // An unreadable depth must NOT default to a proper check: the whole
                // point of B4 is that only a proper check uproots a veset.
                const parsed = parseCheckKind(row[8]);
                entry.depth = parsed.depth || 'wipe';
                if (parsed.depth && parsed.twice) entry.twice = true;
                if (parsed.bloodFound) entry.bloodFound = true;
                // A3 — שני חלקי העונה של הבדיקה הכפולה.
                const checkParts = parsed.parts.map(l => CHECK_PART_FROM_LABEL[l]).filter(Boolean);
                if (checkParts.length) entry.checkParts = checkParts;
                // ...and a check that was logged with body-signs keeps them as a
                // sign without a sighting, so the sign is not lost in a restore.
                const checkSigns = signsFromCell(row[10]);
                if (checkSigns.length) {
                    entry.signs = checkSigns;
                    entry.standaloneSign = true;
                    const certainty = certaintyFromSignsCell(row[10]);
                    if (certainty !== 'certain') entry.signCertainty = certainty;
                }
            }
            if (type === 'reiyah') {
                // B3 / B5 / B2: restored exactly as logged, so a recovered sighting
                // keeps its kind, its bleeding duration and its body-signs.
                const kind = KIND_FROM_LABEL[String(row[8] || '').trim()];
                if (kind && kind !== 'regular') entry.kind = kind;
                const days = Math.floor(Number(row[9]));
                if (Number.isFinite(days) && days > 1) entry.durationDays = days;
                const signs = signsFromCell(row[10]);
                if (signs.length) entry.signs = signs;
            }
            if (type === 'sign') {
                // מיחוש בלא ראייה: נשמר על ידי `standaloneSign`, שבלעדיו הגיבוי היה
                // מאבד מיחוש שתועד ואין בצדו ראייה.
                entry.standaloneSign = true;
                const signs = signsFromCell(row[10]);
                if (signs.length) entry.signs = signs;
                const certainty = certaintyFromSignsCell(row[10]);
                if (certainty !== 'certain') entry.signCertainty = certainty;
            }
            // סימוני היום (js/dayMarks.js) — כתם, פחד פתאום, חרדה, יציאה לדרך, חופה.
            const marks = marksFromCell(row[11]);
            if (marks.length) entry.marks = marks;
        }
        out.push({ ts, abs, action, entry });
    });
    return out;
}

/**
 * Replays the change log and returns one restore point per backup, each with
 * the FULL database as it stood right after that backup.
 *
 * @returns {Array<{ts:string, added:number, updated:number, deleted:number, count:number, db:object}>}
 *          newest first, ready for display.
 */
export function buildRestorePoints(rows) {
    const groups = [];
    const byTs = new Map();

    (rows || []).forEach(r => {
        if (!byTs.has(r.ts)) {
            byTs.set(r.ts, []);
            groups.push(r.ts);
        }
        byTs.get(r.ts).push(r);
    });

    const points = [];
    const state = {};

    groups.forEach(ts => {
        let added = 0;
        let updated = 0;
        let deleted = 0;

        byTs.get(ts).forEach(c => {
            if (c.action === 'נמחק') {
                delete state[c.abs];
                deleted++;
            } else if (c.entry) {
                // Unknown event types carry no entry; they are not written into
                // the reconstructed state rather than poisoning it with null.
                state[c.abs] = c.entry;
                if (c.action === 'נוסף') added++; else updated++;
            }
        });

        points.push({ ts, added, updated, deleted, count: Object.keys(state).length, db: Object.assign({}, state) });
    });

    return points.reverse();
}

// ---------- Restore ----------

/**
 * Merges a backup into the local database WITHOUT ever deleting local data.
 * Used by the "merge" restore mode: events that exist only in the backup are
 * added, events that exist only locally are kept as they are.
 *
 * Returns the merged db plus the diff, so the UI can tell the user exactly
 * what will change before anything is written.
 */
export function mergeDb(localDb, remoteDb) {
    const local = localDb || {};
    const remote = remoteDb || {};
    const merged = Object.assign({}, local);
    const addedKeys = [];

    for (const key of Object.keys(remote)) {
        if (!(key in local)) {
            merged[key] = remote[key];
            addedKeys.push(key);
        }
    }

    // Local-only events are reported for transparency. They are never removed by
    // this mode - that is the whole point of a merge.
    const localOnlyKeys = Object.keys(local).filter(k => !(k in remote));
    return { db: merged, addedKeys, localOnlyKeys };
}

export function parseBackupRows(values) {
    const db = {};
    let pin = '';
    let recoveryEmail = '';

    (values || []).forEach(row => {
        const absRaw = row[3];
        const typeLabel = row[4] || '';
        const onaLabel = row[5] || '';
        const note = row[6] || '';
        const pinCell = row[7] || '';
        const emailCell = row[8] || '';
        const kindCell = row[9] || '';
        const durationCell = row[10] || '';
        const signsCell = row[11] || '';

        if (pinCell && /^\d{6}$/.test(pinCell)) pin = pinCell;
        if (emailCell && emailCell.includes('@')) recoveryEmail = emailCell;

        const abs = Math.floor(Number(absRaw));
        if (!absRaw || !Number.isFinite(abs) || abs <= 0) return;

        const type = TYPE_FROM_LABEL[typeLabel];
        if (!type) return; // meta rows and unknown rows are skipped

        const entry = { type, note };
        // סימוני היום: כתם, פחד פתאום, חרדה, יציאה לדרך, ליל חופה. מסננים לקודים
        // מוכרים בלבד — בעמודה הזו יושב גם קוד הגיבוי (בשורת המטא-נתונים).
        const marks = marksFromCell(pinCell).filter(code => MARK_CODES.has(code));
        if (marks.length) entry.marks = marks;
        if ((type === 'reiyah' || type === 'check' || type === 'sign')
            && (onaLabel === 'יום' || onaLabel === 'לילה')) {
            entry.ona = onaLabel === 'יום' ? 'day' : 'night';
        }
        if (type === 'check') {
            const parsed = parseCheckKind(kindCell);
            entry.depth = parsed.depth || 'wipe';
            if (parsed.depth && parsed.twice) entry.twice = true;
            if (parsed.bloodFound) entry.bloodFound = true;
            // A3 — שני חלקי העונה של הבדיקה הכפולה חוזרים כמספרי קוד.
            const checkParts = parsed.parts.map(l => CHECK_PART_FROM_LABEL[l]).filter(Boolean);
            if (checkParts.length) entry.checkParts = checkParts;
            // בדיקה שנספח אליה מיחוש בלא ראייה: הסימון (והמיחוש עצמו) שמחזירים
            // אותו למניין וסת הגוף — בלעדיהם הגיבוי היה מאבד את המיחוש.
            const checkSigns = signsFromCell(signsCell);
            if (checkSigns.length) {
                entry.signs = checkSigns;
                entry.standaloneSign = true;
                const certainty = certaintyFromSignsCell(signsCell);
                if (certainty !== 'certain') entry.signCertainty = certainty;
            }
        }
        if (type === 'reiyah') {
            const kind = KIND_FROM_LABEL[String(kindCell).trim()];
            if (kind && kind !== 'regular') entry.kind = kind;
            const days = Math.floor(Number(durationCell));
            if (Number.isFinite(days) && days > 1) entry.durationDays = days;
            const signs = signsFromCell(signsCell);
            if (signs.length) entry.signs = signs;
        }
        // מיחוש בלא ראייה (או מיחוש שנספח לבדיקה): הסימון שהמנוע מחפש בחזרה.
        if (type === 'sign') {
            entry.standaloneSign = true;
            const signs = signsFromCell(signsCell);
            if (signs.length) entry.signs = signs;
            const certainty = certaintyFromSignsCell(signsCell);
            if (certainty !== 'certain') entry.signCertainty = certainty;
        }
        db[abs] = entry;
    });

    return { db, pin, recoveryEmail };
}

/**
 * Downloads the sheet and returns { db, pin, recoveryEmail }.
 */
async function fetchBackup() {
    const status = await window.api.oauthStatus();
    if (!status.sheetId) throw new Error('no_sheet');

    const token = await ensureAccessToken();
    if (!token) throw new Error('no_token');

    // The range must reach the LAST column: reading only to 'I' silently dropped
    // the kind / duration (and now the check depth) from a main-tab restore.
    const res = await fetch(`${SHEETS_API}${status.sheetId}/values/Backup!A2:${LAST_COLUMN}100000?majorDimension=ROWS`, {
        headers: { 'Authorization': 'Bearer PLACEHOLDER' }
    });
    if (!res.ok) throw new Error('read_failed_' + res.status);
    const data = await res.json();
    return parseBackupRows(data.values || []);
}

// ---------- Public API ----------

export function isGoogleConnected() {
    if (!hasApi()) return false;
    // synchronous-ish read; status comes from main process store
    return !!window.__googleConnected;
}

export async function refreshConnectionState() {
    if (!hasApi()) return { connected: false };
    const status = await window.api.oauthStatus();
    window.__googleConnected = !!status.connected;
    return status;
}

/**
 * Opens the Google consent page; on success immediately creates the sheet
 * and performs the first backup.
 */
export async function connectGoogle(getBackupData) {
    if (!hasApi()) {
        throw new Error('OAuth is only available in the desktop application.');
    }
    await window.api.oauthStart('');
    const status = await refreshConnectionState();

    const data = await Promise.resolve(getBackupData());
    await attemptBackup(data.db, data.pin, data.recoveryEmail, 'initial', false);
    return status;
}

export async function disconnectGoogle() {
    if (!hasApi()) return;
    await window.api.oauthDisconnect();
    cancelRetry();
    await refreshConnectionState();
}

export async function openSheetInBrowser() {
    if (!hasApi()) return;
    await window.api.oauthOpenSheet();
}

/**
 * Manual backup trigger (settings button).
 */
export async function backupNow(getBackupData) {
    if (!hasApi()) throw new Error('OAuth is only available in the desktop application.');
    const data = await Promise.resolve(getBackupData());
    const ok = await attemptBackup(data.db, data.pin, data.recoveryEmail, 'manual', false);
    if (!ok) throw new Error('backup_failed');
    return true;
}

/**
 * Runs a backup if more than 24h passed since the last one.
 * Called every minute from the main-process tick.
 */
export function tickAutoBackup(getBackupData) {
    if (!hasApi()) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    window.api.oauthStatus().then(async status => {
        if (!status.connected) return;
        const last = status.lastBackupAt ? Date.parse(status.lastBackupAt) : 0;
        if (Date.now() - last >= BACKUP_INTERVAL_MS) {
            const data = await Promise.resolve(getBackupData());
            attemptBackup(data.db, data.pin, data.recoveryEmail, 'auto', true);
        }
    }).catch(() => { /* ignore */ });
}

export function attachAutoBackupTick(getBackupData) {
    if (!hasApi() || !window.api.onAutoBackupTick) return;
    window.api.onAutoBackupTick(() => tickAutoBackup(getBackupData));
}

/**
 * Entry point called once on app start: wires the main-process minute tick
 * to the daily-backup check.
 */
export function initGoogleBackup(getBackupData) {
    attachAutoBackupTick(getBackupData);
}

const DATA_CHANGE_MIN_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Gathers everything a backup needs from the current app state.
 * Exported so app.js can hand it to the backup functions as a lazy getter.
 *
 * The PIN is intentionally never included: since it moved to one-way hashing
 * (`js/pinCrypto.js`), the app has no way to recover the original digits to
 * put in a backup. A backup made from an older version of the app may still
 * carry a plain PIN in its "password" column - restoring from one of those
 * still works (`js/security.js` `restoreFromGoogleAndEnter` re-hashes it on
 * the way in); a newer backup simply leaves that column blank.
 */
export async function getGoogleBackupData(db, getRecoveryEmailFn) {
    const pinPlain = '';
    return {
        db: db || {},
        pin: pinPlain,
        recoveryEmail: getRecoveryEmailFn() || ''
    };
}

/**
 * Called whenever the user's data changes; backs up (silently) if the last
 * backup is more than 5 minutes old, so closing the app never loses much.
 */
export function onDataChanged(getBackupData) {
    if (!hasApi()) return;
    window.api.oauthStatus().then(async status => {
        if (!status.connected) return;
        const last = status.lastBackupAt ? Date.parse(status.lastBackupAt) : 0;
        if (Date.now() - last >= DATA_CHANGE_MIN_INTERVAL_MS) {
            const data = await Promise.resolve(getBackupData());
            attemptBackup(data.db, data.pin, data.recoveryEmail, 'data-change', true);
        }
    }).catch(() => { /* ignore */ });
}

export { fetchBackup };
