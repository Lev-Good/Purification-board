/**
 * בדיקות לתשתית תזכורת "לא בוצע גיבוי מעל 30 יום" ולבקשת אחסון קבוע
 * (`js/storage.js`: `getFirstUseAt`, `getManualBackupLast`/`downloadBackup`,
 * שמירת/דחיית תזכורת, `requestPersistentStorage`).
 *
 * Run with: node tests/backupReminder.test.js
 *
 * זרימת האפליקציה עצמה (`tickBackupReminder` ב-js/app.js) לא נבדקת כאן
 * במפורש - היא רק צירוף פשוט של הפונקציות הללו - אבל כל אחת מהן נבדקת בנפרד.
 */

const store = {};
global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
};
global.document = {
    createElement: () => ({ setAttribute() {}, click() {} })
};

const storage = await import('../js/storage.js');

let failures = 0;
function assert(condition, message) {
    if (condition) {
        console.log('PASS: ' + message);
    } else {
        failures++;
        console.error('FAIL: ' + message);
    }
}

async function run() {
    // getFirstUseAt: lazily initializes, then stays stable.
    const firstUse1 = storage.getFirstUseAt();
    assert(Number.isFinite(firstUse1) && firstUse1 > 0, 'getFirstUseAt initializes to a real timestamp on first read');
    const firstUse2 = storage.getFirstUseAt();
    assert(firstUse1 === firstUse2, 'getFirstUseAt returns the SAME timestamp on a later read (does not reset)');

    // Manual backup timestamp: starts at 0, set by downloadBackup().
    assert(storage.getManualBackupLast() === 0, 'no manual backup timestamp before any download ever happened');
    storage.downloadBackup({ 1: { type: 'reiya' } });
    const manualLast = storage.getManualBackupLast();
    assert(manualLast > 0 && manualLast <= Date.now(), 'downloadBackup() records a manual-backup timestamp');

    // Reminder throttling and snooze state.
    assert(storage.getBackupReminderLastCheck() === 0, 'no reminder check has run yet');
    storage.setBackupReminderLastCheck(12345);
    assert(storage.getBackupReminderLastCheck() === 12345, 'the last-check timestamp round-trips');

    assert(storage.getBackupReminderSnoozedUntil() === 0, 'the reminder is not snoozed by default');
    const until = Date.now() + 1000;
    storage.snoozeBackupReminder(until);
    assert(storage.getBackupReminderSnoozedUntil() === until, 'snoozing the reminder round-trips the chosen timestamp');

    // requestPersistentStorage: best-effort, must never throw even when the
    // API is entirely absent (as it is here, in Node).
    let threw = false;
    try {
        await storage.requestPersistentStorage();
    } catch (e) {
        threw = true;
    }
    assert(!threw, 'requestPersistentStorage() never throws when navigator.storage is unavailable');

    if (failures > 0) {
        console.error(`\n${failures} backupReminder test(s) failed.`);
        process.exitCode = 1;
    } else {
        console.log('\nAll backupReminder tests passed.');
    }
}

await run();
