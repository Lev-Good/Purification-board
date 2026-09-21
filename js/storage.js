import { generateDbSalt, deriveDbKey, encryptDb, decryptDb } from './dbCrypto.js';

/**
 * localStorage keys
 */
const KEYS = {
    DB: 'taharahDB',
    PIN: 'taharahPIN',
    EMAIL: 'taharahEmail',
    OR_ZARUA: 'taharahOrZarua',
    CHAZAKA: 'taharahChazaka',
    AKIROT: 'taharahAkirot',
    LIFE: 'taharahLifeState',
    THEME: 'taharahTheme',
    EMAIL_SEEN: 'taharahEmailWarningSeen',
    RECOVERY_EMAIL: 'taharahRecoveryEmail',
    HISTORY_STATE: 'taharahHistoryState',
    BODY_REMINDER_SEEN: 'taharahBodyReminderSeen',
    STRINGENCIES: 'taharahStringencies',
    LOCATION: 'taharahLocation',
    LOCAL_BACKUP_ENABLED: 'taharahLocalBackupEnabled',
    LOCAL_BACKUP_LAST: 'taharahLocalBackupLast',
    ZOOM: 'taharahZoomLevel',
    NOTIFICATIONS_MODE: 'taharahNotificationsMode',
    NOTIFICATIONS_LAST: 'taharahNotificationsLast',
    UPDATE_LAST_CHECK: 'taharahUpdateLastCheck',
    UPDATE_SNOOZED_VERSION: 'taharahUpdateSnoozedVersion',
    UPDATE_SNOOZED_UNTIL: 'taharahUpdateSnoozedUntil',
    FIRST_USE_AT: 'taharahFirstUseAt',
    MANUAL_BACKUP_LAST: 'taharahManualBackupLast',
    BACKUP_REMINDER_LAST_CHECK: 'taharahBackupReminderLastCheck',
    BACKUP_REMINDER_SNOOZED_UNTIL: 'taharahBackupReminderSnoozedUntil',
    CALENDAR_SYNC_ENABLED: 'taharahCalendarSyncEnabled',
    CALENDAR_DISCRETION: 'taharahCalendarDiscretion',
    CALENDAR_DISCREET_PREFIX: 'taharahCalendarDiscreetPrefix',
    CALENDAR_NOTIFY_EMAIL: 'taharahCalendarNotifyEmail',
    CALENDAR_NOTIFY_POPUP: 'taharahCalendarNotifyPopup',
    CALENDAR_MORNING_TIME: 'taharahCalendarMorningTime',
    CALENDAR_SUNSET_LEAD_MIN: 'taharahCalendarSunsetLeadMin',
    CALENDAR_HEFSEK_ADVISORY_DAYS: 'taharahCalendarHefsekAdvisoryDays',
    CALENDAR_MOCH_DACHUK: 'taharahCalendarMochDachuk'
};

/**
 * The events database is encrypted at rest (AES-GCM-256, key derived from
 * the PIN - `js/dbCrypto.js`). The plaintext exists only in memory, for the
 * duration of an unlocked session (`cachedDb`); the key itself (`dbKey`) is
 * never persisted and is re-derived from the PIN on every unlock
 * (`unlockDatabase`) or PIN change (`rekeyDatabase`), both called from
 * `js/security.js`. This is why `getDb`/`saveDb` stay synchronous even
 * though the actual disk I/O is encrypted: everything else in the app reads
 * and writes the in-memory copy exactly as before.
 */
let cachedDb = null;
let dbKey = null;
let dbSalt = null;
// Serializes the encrypt-and-write step: two saves fired close together (or
// a save followed right away by a lock/unlock) must not race and have the
// older one clobber the newer one on disk.
let pendingPersist = Promise.resolve();

/**
 * Get the current events database (the in-memory, decrypted copy).
 * Before the app is unlocked this is empty - real data only appears here
 * once `unlockDatabase()` has run.
 */
export function getDb() {
    return cachedDb || {};
}

/**
 * Save the events database. While a session key exists this encrypts in
 * the background; before that (pre-unlock flows: a Google restore or a
 * manual backup-file import that runs before the very first PIN entry) it
 * is written as plain JSON, exactly as before - `unlockDatabase()` picks
 * that up as legacy data on the next successful PIN entry and encrypts it
 * then, the same one-time migration path a pre-update install goes through.
 */
export function saveDb(db) {
    cachedDb = db;
    if (dbKey) {
        queuePersist(db); // fire-and-forget for the caller, but ordered - see queuePersist
    } else {
        try {
            localStorage.setItem(KEYS.DB, JSON.stringify(db));
        } catch (e) {
            // quota exceeded - the data stays only in memory for this session
        }
    }
}

async function persistEncryptedDb(db) {
    const { iv, data } = await encryptDb(dbKey, db);
    localStorage.setItem(KEYS.DB, JSON.stringify({ v: 2, salt: dbSalt, iv, data }));
}

/**
 * Every encrypted write - a plain save, the one-time migration, or a re-key
 * after a PIN change - goes through this single queue, chained onto
 * whatever write is already pending. That guarantees there is never more
 * than one `persistEncryptedDb` in flight at once, so two writes fired close
 * together always land on disk in the order they happened instead of racing.
 */
function queuePersist(db) {
    pendingPersist = pendingPersist
        .then(() => persistEncryptedDb(db))
        .catch(err => console.error('DB encryption failed:', err));
    return pendingPersist;
}

/**
 * Resolves once every save issued so far has actually been written to disk.
 * `saveDb` is deliberately fire-and-forget for callers (it stays synchronous
 * so nothing elsewhere in the app needs to change), but a moment that must
 * not race ahead of a pending write - unlocking again, or the app closing -
 * should await this first.
 */
export function flushPendingDbWrite() {
    return pendingPersist;
}

/**
 * Establishes the session's database key from the entered PIN and loads the
 * plaintext database into memory. Called once, right after the PIN itself
 * is verified/created (`js/security.js`) - never independently, since the
 * key only makes sense paired with a PIN the app has already confirmed.
 *
 * - If `taharahDB` is already in the encrypted envelope format, decrypts it.
 *   A wrong key surfaces as a thrown error (GCM auth-tag mismatch) - this
 *   never silently falls back to an empty database.
 * - Otherwise (a brand new install, or data left over from before this
 *   encryption existed - including a database a Google restore just wrote
 *   in plaintext because no PIN existed yet at that moment) migrates it:
 *   generates a fresh salt/key and immediately re-writes it encrypted.
 */
export async function unlockDatabase(pin) {
    await pendingPersist; // never read storage while an earlier save is still landing
    const raw = localStorage.getItem(KEYS.DB);
    let envelope = null;
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.v === 2 && parsed.salt && parsed.iv && parsed.data) envelope = parsed;
        } catch (e) {
            // not JSON - unexpected, but treated as unreadable legacy data below
        }
    }

    if (envelope) {
        const key = await deriveDbKey(pin, envelope.salt);
        const plainDb = await decryptDb(key, envelope.iv, envelope.data); // throws on wrong key/corruption
        cachedDb = plainDb;
        dbKey = key;
        dbSalt = envelope.salt;
        return;
    }

    let legacyDb = {};
    if (raw) {
        try {
            legacyDb = JSON.parse(raw) || {};
        } catch (e) {
            legacyDb = {}; // unreadable - nothing recoverable from it
        }
    }
    const salt = generateDbSalt();
    const key = await deriveDbKey(pin, salt);
    cachedDb = legacyDb;
    dbKey = key;
    dbSalt = salt;
    await queuePersist(legacyDb);
}

/**
 * Re-encrypts the already-decrypted in-memory database under a fresh
 * salt/key derived from a new PIN. Called when the user changes her PIN
 * (`updatePinSetting`) - the session is already unlocked, so this only
 * needs to re-key what's already in memory, not touch legacy migration.
 */
export async function rekeyDatabase(pin) {
    await pendingPersist; // let any write still under the old key land first
    const salt = generateDbSalt();
    const key = await deriveDbKey(pin, salt);
    dbKey = key;
    dbSalt = salt;
    await queuePersist(cachedDb || {});
}

/**
 * The database snapshot that was last written to the Google backup's history
 * tab. The next backup diffs against it, so only real changes are logged.
 */
export function getHistoryState() {
    try {
        return JSON.parse(localStorage.getItem(KEYS.HISTORY_STATE)) || {};
    } catch (e) {
        return {};
    }
}

export function saveHistoryState(state) {
    try {
        localStorage.setItem(KEYS.HISTORY_STATE, JSON.stringify(state || {}));
    } catch (e) {
        // quota exceeded - history diffing falls back to "everything is new"
    }
}

/**
 * Wipe all data from storage (except theme and warning checks if desired, but we'll wipe all user credentials).
 */
export function wipeAll() {
    cachedDb = null;
    dbKey = null;
    dbSalt = null;
    localStorage.removeItem(KEYS.DB);
    localStorage.removeItem(KEYS.PIN);
    localStorage.removeItem(KEYS.EMAIL);
    localStorage.removeItem(KEYS.OR_ZARUA);
    localStorage.removeItem(KEYS.CHAZAKA);
    localStorage.removeItem(KEYS.AKIROT);
    localStorage.removeItem(KEYS.LIFE);
    localStorage.removeItem(KEYS.EMAIL_SEEN);
    localStorage.removeItem(KEYS.RECOVERY_EMAIL);
    localStorage.removeItem(KEYS.HISTORY_STATE);
    localStorage.removeItem(KEYS.BODY_REMINDER_SEEN);
    localStorage.removeItem(KEYS.STRINGENCIES);
    localStorage.removeItem(KEYS.LOCATION);
}

/**
 * היום (abs) שבו הוצגה לאחרונה ההתראה היומית של וסת הגוף, אם הוצגה.
 *
 * התזכורת עצמה מוצגת תדיר בכרטיס שבראש המסך; ההתראה הקופצת היא **יומית** בלבד
 * (ולא בכל פתיחה של האפליקציה) — שהרי מיחוש שתועד ועומד אינו דחוף יותר ברגע זה
 * מאשר אתמול, ואילו חובת הבדיקה עצמה מוצגת בכרטיס תמיד.
 */
export function getBodyReminderSeen() {
    const raw = Number(localStorage.getItem(KEYS.BODY_REMINDER_SEEN));
    return Number.isFinite(raw) && raw > 0 ? raw : null;
}

export function setBodyReminderSeen(abs) {
    try {
        localStorage.setItem(KEYS.BODY_REMINDER_SEEN, String(abs));
    } catch (e) {
        // quota exceeded - ההתראה תוצג שוב; אין בכך נזק
    }
}

/**
 * PIN security storage helpers.
 *
 * The PIN is stored one-way hashed (`js/pinCrypto.js`: PBKDF2/SHA-256, random
 * per-record salt) as a `{v, salt, hash}` record — never as the raw digits or
 * as a reversibly-encrypted value. There is therefore no function anywhere
 * in the app that recovers the original PIN from storage; unlocking works by
 * re-hashing the entered digits and comparing.
 *
 * `getLegacyPinValue()` reads a value left over from before this scheme
 * (plain 6 digits, or the old Electron-encrypted cipher text) so the app can
 * detect it once and prompt the user to set a fresh PIN — see
 * `js/security.js` `checkInitialLock()`.
 */
export function getPinRecord() {
    const raw = localStorage.getItem(KEYS.PIN);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.salt && parsed.hash) return parsed;
    } catch (e) {
        // not JSON - a legacy value, see getLegacyPinValue()
    }
    return null;
}

export function getLegacyPinValue() {
    const raw = localStorage.getItem(KEYS.PIN);
    if (!raw || getPinRecord()) return null;
    return raw;
}

export function savePinRecord(record) {
    localStorage.setItem(KEYS.PIN, JSON.stringify(record));
}

export function clearSavedPin() {
    localStorage.removeItem(KEYS.PIN);
}

export function hasSavedPin() {
    return !!localStorage.getItem(KEYS.PIN);
}

/**
 * Recovery email helpers
 */
export function getRecoveryEmail() {
    return localStorage.getItem(KEYS.RECOVERY_EMAIL) || '';
}

export function saveRecoveryEmail(email) {
    localStorage.setItem(KEYS.RECOVERY_EMAIL, email);
}

export function removeRecoveryEmail() {
    localStorage.removeItem(KEYS.RECOVERY_EMAIL);
}

/**
 * Email configuration helpers
 */
export function getSavedEmail() {
    return localStorage.getItem(KEYS.EMAIL) || '';
}

export function saveEmail(email) {
    localStorage.setItem(KEYS.EMAIL, email);
}

export function removeSavedEmail() {
    localStorage.removeItem(KEYS.EMAIL);
}

export function isEmailWarningSeen() {
    return localStorage.getItem(KEYS.EMAIL_SEEN) === 'true';
}

export function setEmailWarningSeen() {
    localStorage.setItem(KEYS.EMAIL_SEEN, 'true');
}

/**
 * Or Zarua Custom settings
 */
export function isOrZaruaEnabled() {
    return localStorage.getItem(KEYS.OR_ZARUA) === 'true';
}

export function saveOrZarua(enabled) {
    localStorage.setItem(KEYS.OR_ZARUA, enabled);
}

/**
 * Daily automatic local backup file (Electron only — spec: "גיבוי יומי אוטומטי
 * לקובץ במחשב"), distinct from the manual download and from the Google Sheets
 * auto-backup. Off by default — it is opt-in, like Or Zarua.
 */
export function isLocalBackupEnabled() {
    return localStorage.getItem(KEYS.LOCAL_BACKUP_ENABLED) === 'true';
}

export function saveLocalBackupEnabled(enabled) {
    localStorage.setItem(KEYS.LOCAL_BACKUP_ENABLED, enabled);
}

export function getLocalBackupLast() {
    return localStorage.getItem(KEYS.LOCAL_BACKUP_LAST) || '';
}

export function setLocalBackupLast(isoString) {
    localStorage.setItem(KEYS.LOCAL_BACKUP_LAST, isoString);
}

/**
 * Google Calendar sync settings (docs/GOOGLE_CALENDAR_SPEC.md §8) - all local
 * to this device, not part of the Google backup itself (same category as the
 * local-backup toggle above and the desktop-notification settings below).
 */
export function isCalendarSyncEnabled() {
    return localStorage.getItem(KEYS.CALENDAR_SYNC_ENABLED) === 'true';
}

export function saveCalendarSyncEnabled(enabled) {
    localStorage.setItem(KEYS.CALENDAR_SYNC_ENABLED, String(enabled === true));
}

/** 'detailed' | 'subtle' (default) | 'discreet' - spec §2ב. */
export function getCalendarDiscretion() {
    const v = localStorage.getItem(KEYS.CALENDAR_DISCRETION);
    return v === 'detailed' || v === 'discreet' ? v : 'subtle';
}

export function saveCalendarDiscretion(level) {
    localStorage.setItem(KEYS.CALENDAR_DISCRETION, level);
}

/** Custom label prefix for the 'discreet' level (e.g. "פגישה") - empty = "תזכורת". */
export function getCalendarDiscreetPrefix() {
    return localStorage.getItem(KEYS.CALENDAR_DISCREET_PREFIX) || '';
}

export function saveCalendarDiscreetPrefix(prefix) {
    localStorage.setItem(KEYS.CALENDAR_DISCREET_PREFIX, String(prefix || '').trim());
}

export function isCalendarNotifyEmail() {
    const v = localStorage.getItem(KEYS.CALENDAR_NOTIFY_EMAIL);
    return v === null ? true : v === 'true'; // default on
}

export function saveCalendarNotifyEmail(enabled) {
    localStorage.setItem(KEYS.CALENDAR_NOTIFY_EMAIL, String(enabled === true));
}

export function isCalendarNotifyPopup() {
    const v = localStorage.getItem(KEYS.CALENDAR_NOTIFY_POPUP);
    return v === null ? true : v === 'true'; // default on
}

export function saveCalendarNotifyPopup(enabled) {
    localStorage.setItem(KEYS.CALENDAR_NOTIFY_POPUP, String(enabled === true));
}

/** "HH:MM" 24h, default 08:30 - the morning (שחרית) check reminder time. */
export function getCalendarMorningTime() {
    const v = localStorage.getItem(KEYS.CALENDAR_MORNING_TIME);
    return /^\d{2}:\d{2}$/.test(v) ? v : '08:30';
}

export function saveCalendarMorningTime(hhmm) {
    localStorage.setItem(KEYS.CALENDAR_MORNING_TIME, hhmm);
}

/** Minutes before sunset for the hefsek/prisha email lead time - default 120. */
export function getCalendarSunsetLeadMinutes() {
    const n = Number(localStorage.getItem(KEYS.CALENDAR_SUNSET_LEAD_MIN));
    return Number.isFinite(n) && n > 0 ? n : 120;
}

export function saveCalendarSunsetLeadMinutes(minutes) {
    localStorage.setItem(KEYS.CALENDAR_SUNSET_LEAD_MIN, String(minutes));
}

/**
 * "מסך נקיים צפוי" - advisory-only heuristic (not a halachic determination):
 * suggests checking for hefsek tahara once this many days have passed since
 * the last recorded sighting/bleeding-continuation with no hefsek recorded
 * since. Default 5 - chosen only as a common bleeding-length ballpark; the
 * reminder wording must stay a suggestion ("כדאי לבדוק"), never a ruling.
 */
export function getCalendarHefsekAdvisoryDays() {
    const n = Number(localStorage.getItem(KEYS.CALENDAR_HEFSEK_ADVISORY_DAYS));
    return Number.isFinite(n) && n > 0 ? n : 5;
}

export function saveCalendarHefsekAdvisoryDays(days) {
    localStorage.setItem(KEYS.CALENDAR_HEFSEK_ADVISORY_DAYS, String(days));
}

/** "מוך דחוק" - opt-in, off by default; rides on the same hefsek-advisory day. */
export function isMochDachukEnabled() {
    return localStorage.getItem(KEYS.CALENDAR_MOCH_DACHUK) === 'true';
}

export function saveMochDachukEnabled(enabled) {
    localStorage.setItem(KEYS.CALENDAR_MOCH_DACHUK, String(enabled === true));
}

/**
 * Global zoom level (spec: "כפתורי זום גלובליים בכל התוכנה") — a percentage,
 * 100 being the normal size. Persisted so it survives a restart.
 */
/**
 * Desktop OS notifications (spec: התראות במחשב) — 'off' (default), 'daily'
 * (once a day: what day it is and the current state), or 'event' (only on a
 * day that has an actual concern/event).
 */
export function getNotificationsMode() {
    const v = localStorage.getItem(KEYS.NOTIFICATIONS_MODE);
    return v === 'daily' || v === 'event' ? v : 'off';
}

export function saveNotificationsMode(mode) {
    localStorage.setItem(KEYS.NOTIFICATIONS_MODE, mode);
}

export function getNotificationsLast() {
    const n = Number(localStorage.getItem(KEYS.NOTIFICATIONS_LAST));
    return Number.isFinite(n) ? n : 0;
}

export function setNotificationsLast(abs) {
    localStorage.setItem(KEYS.NOTIFICATIONS_LAST, String(abs));
}

/**
 * In-app update checker state (spec: בדיקה אוטומטית אם יש גרסה חדשה מגיטהאב).
 * The "X" dismiss on the update banner snoozes ONE SPECIFIC version for a
 * week — if an even newer release appears meanwhile, the snooze no longer
 * applies to it (checked by comparing the snoozed version, not just a flag).
 */
export function getUpdateLastCheck() {
    const n = Number(localStorage.getItem(KEYS.UPDATE_LAST_CHECK));
    return Number.isFinite(n) ? n : 0;
}

export function setUpdateLastCheck(timestampMs) {
    localStorage.setItem(KEYS.UPDATE_LAST_CHECK, String(timestampMs));
}

export function getSnoozedUpdate() {
    const version = localStorage.getItem(KEYS.UPDATE_SNOOZED_VERSION) || '';
    const until = Number(localStorage.getItem(KEYS.UPDATE_SNOOZED_UNTIL));
    return { version, until: Number.isFinite(until) ? until : 0 };
}

export function snoozeUpdate(version, untilMs) {
    localStorage.setItem(KEYS.UPDATE_SNOOZED_VERSION, version);
    localStorage.setItem(KEYS.UPDATE_SNOOZED_UNTIL, String(untilMs));
}

export function getZoomLevel() {
    const n = Number(localStorage.getItem(KEYS.ZOOM));
    return Number.isFinite(n) && n > 0 ? n : 100;
}

export function saveZoomLevel(level) {
    localStorage.setItem(KEYS.ZOOM, String(level));
}

/**
 * Chazaka (fixed-veset detection) and uprooting are always on and are not a
 * user setting (2026-09-19, per the maintainer's request) — turning either
 * off is a halachically inexact stringency (stray concerns for a woman with a
 * fixed veset; a veset whose time passed lingering as a concern). The old
 * `KEYS.CHAZAKA` / `KEYS.AKIROT` storage keys are still cleared by wipeAll()
 * for users who have a leftover value from before this change, but nothing
 * reads them any more — see js/app.js `engineOptions()`.
 */

/**
 * Life state (מצב חיים): pregnancy, birth and nursing, age, and pills.
 *
 * Unlike the events database, this is a SETTING and not a record: it is not part
 * of the Google backup, like the chazaka and uprooting switches. It is read by
 * the engine on every calculation, and its absence simply means "no known state".
 */
export function getLifeState() {
    try {
        return JSON.parse(localStorage.getItem(KEYS.LIFE)) || null;
    } catch (e) {
        return null;
    }
}

export function saveLifeState(state) {
    try {
        if (state === null || state === undefined) {
            localStorage.removeItem(KEYS.LIFE);
            return;
        }
        localStorage.setItem(KEYS.LIFE, JSON.stringify(state));
    } catch (e) {
        // quota exceeded - the state simply is not persisted
    }
}

/**
 * מתגי החומרא (`js/stringencies.js`).
 *
 * אלו **הגדרות** ולא רשומות: אינן נשמרות בגיבוי גוגל, כמו מתגי המנועים וסביבת
 * החיים, וברירת המחדל שלהן מתקבלת מן המודול (פירושו: מתג חסר = ברירת המחדל,
 * ולכן הוספת מתג אינה דורשת הגירת נתונים).
 */
export function getStringencies() {
    try {
        return JSON.parse(localStorage.getItem(KEYS.STRINGENCIES)) || {};
    } catch (e) {
        return {};
    }
}

export function saveStringencies(state) {
    try {
        localStorage.setItem(KEYS.STRINGENCIES, JSON.stringify(state || {}));
    } catch (e) {
        // quota exceeded - המתגים יישארו כברירת המחדל שלהם
    }
}

/**
 * המיקום שנבחר לזמני הנץ והשקיעה (`js/zmanim.js`, ספק עונה — B6).
 *
 * הגדרה ולא רשומה: אינה נשמרת בגיבוי גוגל, כמו מתגי המנועים ומצב החיים.
 * מחרוזת ריקה פירושה "לא נבחר מיקום", ואז אין זמנים מוצגים — ואין בכך שינוי דין.
 */
export function getSavedLocation() {
    return localStorage.getItem(KEYS.LOCATION) || '';
}

export function saveLocation(id) {
    try {
        localStorage.setItem(KEYS.LOCATION, String(id || ''));
    } catch (e) {
        // quota exceeded - המיקום יישאר כפי שהיה
    }
}

/**
 * Theme settings
 */
export function getSavedTheme() {
    return localStorage.getItem(KEYS.THEME) || 'light';
}

export function saveTheme(theme) {
    localStorage.setItem(KEYS.THEME, theme);
}

/**
 * Creates and triggers a download of the current database backup as a JSON file.
 */
export function downloadBackup(db) {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", "taharah_backup.json");
    dlAnchorElem.click();
    setManualBackupLast(Date.now());
}

/**
 * First-ever-use timestamp, for the stale-backup reminder's grace period
 * (spec: "no backup in 30+ days" reminder - a brand new install with no
 * backup yet is not "stale", it just hasn't had time to back up anything).
 * Lazily self-initializes on first read, so an existing install picks up a
 * fresh 30-day grace period the first time this runs after the feature
 * ships, rather than being nagged immediately.
 */
export function getFirstUseAt() {
    let v = Number(localStorage.getItem(KEYS.FIRST_USE_AT));
    if (!Number.isFinite(v) || v <= 0) {
        v = Date.now();
        try { localStorage.setItem(KEYS.FIRST_USE_AT, String(v)); } catch (e) { /* quota */ }
    }
    return v;
}

/**
 * Manual "download backup file" timestamp - the one backup path common to
 * both the desktop app and the plain web/PWA build (which has neither the
 * local-file nor the Google auto-backup).
 */
export function getManualBackupLast() {
    const n = Number(localStorage.getItem(KEYS.MANUAL_BACKUP_LAST));
    return Number.isFinite(n) && n > 0 ? n : 0;
}

function setManualBackupLast(ms) {
    try { localStorage.setItem(KEYS.MANUAL_BACKUP_LAST, String(ms)); } catch (e) { /* quota */ }
}

/**
 * Throttles the daily "have we backed up recently" check to once a day,
 * the same pattern already used for the update checker.
 */
export function getBackupReminderLastCheck() {
    const n = Number(localStorage.getItem(KEYS.BACKUP_REMINDER_LAST_CHECK));
    return Number.isFinite(n) ? n : 0;
}

export function setBackupReminderLastCheck(ms) {
    localStorage.setItem(KEYS.BACKUP_REMINDER_LAST_CHECK, String(ms));
}

export function getBackupReminderSnoozedUntil() {
    const n = Number(localStorage.getItem(KEYS.BACKUP_REMINDER_SNOOZED_UNTIL));
    return Number.isFinite(n) ? n : 0;
}

export function snoozeBackupReminder(untilMs) {
    localStorage.setItem(KEYS.BACKUP_REMINDER_SNOOZED_UNTIL, String(untilMs));
}

/**
 * Requests persistent storage from the browser (spec: "navigator.storage
 * .persist()"), so the app's data is not subject to the browser's normal
 * storage-eviction-under-pressure policy. Best-effort and silent either
 * way: unsupported browsers, and Electron (which does not evict storage
 * the way a browser tab can), simply skip it.
 */
export async function requestPersistentStorage() {
    if (!(navigator.storage && navigator.storage.persist)) return;
    try {
        const already = navigator.storage.persisted ? await navigator.storage.persisted() : false;
        if (!already) await navigator.storage.persist();
    } catch (e) {
        // best-effort - not critical to app function
    }
}

/**
 * Restores database from a uploaded file.
 * @param {Event} event - File input change event.
 * @param {Function} onSuccess - Callback when restoration completes.
 * @param {Function} onError - Callback when an error occurs.
 */
export function restoreBackup(event, onSuccess, onError) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const db = JSON.parse(e.target.result);
            saveDb(db);
            onSuccess(db);
        } catch(err) {
            onError("שגיאה בקריאת הקובץ. ודא שזהו קובץ גיבוי תקין.");
        }
    };
    reader.readAsText(file);
}
