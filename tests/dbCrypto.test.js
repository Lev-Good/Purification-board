/**
 * בדיקות להצפנת מסד הנתונים (taharahDB) במנוחה (`js/dbCrypto.js`,
 * `js/storage.js`'s `unlockDatabase`/`rekeyDatabase`).
 *
 * Run with: node tests/dbCrypto.test.js
 *
 * מריץ תרחיש רציף אחד (ולא בדיקות בודדות) כדי לדמות סדר אמיתי של אירועים:
 * נתונים ישנים בטקסט רגיל → הגדרת קוד גישה (הגירה) → שינוי נתונים → "פתיחה
 * מחדש" (unlockDatabase שוב) → קוד שגוי נדחה → החלפת קוד גישה → איפוס.
 */

// Minimal in-memory localStorage shim - Node has no global localStorage.
const store = {};
global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
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
    // 1. Legacy plaintext data, as a pre-update install would have.
    const legacyDb = { 12345: { type: 'reiya', onah: 'day' } };
    store['taharahDB'] = JSON.stringify(legacyDb);

    // 2. First PIN entry migrates it: encrypts it, in place.
    await storage.unlockDatabase('111111');
    assert(JSON.stringify(storage.getDb()) === JSON.stringify(legacyDb),
        'legacy plaintext data survives the migration into the in-memory cache');
    const envelopeAfterMigration = JSON.parse(store['taharahDB']);
    assert(envelopeAfterMigration.v === 2 && envelopeAfterMigration.salt && envelopeAfterMigration.iv && envelopeAfterMigration.data,
        'on-disk storage is now the encrypted envelope, not the plain object');
    assert(store['taharahDB'].indexOf('reiya') === -1,
        'no readable fragment of the migrated data appears in on-disk storage');

    // 3. Ongoing use: saveDb() during an unlocked session re-encrypts.
    const updatedDb = { 12345: { type: 'reiya', onah: 'day' }, 12346: { type: 'checkClean' } };
    storage.saveDb(updatedDb);
    assert(JSON.stringify(storage.getDb()) === JSON.stringify(updatedDb),
        'getDb() reflects a save immediately (in-memory)');
    assert(store['taharahDB'].indexOf('checkClean') === -1,
        'the newly-saved data is not readable in on-disk storage either');

    // 4. Simulate closing and reopening the app with the same PIN.
    await storage.unlockDatabase('111111');
    assert(JSON.stringify(storage.getDb()) === JSON.stringify(updatedDb),
        'unlocking again with the correct PIN decrypts back to the current data');

    // 5. A wrong PIN must never be treated as "empty database".
    let wrongPinThrew = false;
    try {
        await storage.unlockDatabase('222222');
    } catch (e) {
        wrongPinThrew = true;
    }
    assert(wrongPinThrew, 'unlocking with the wrong PIN throws rather than silently returning empty data');
    assert(JSON.stringify(storage.getDb()) === JSON.stringify(updatedDb),
        'a failed unlock attempt does not clobber the in-memory data from the last successful unlock');

    // 6. Changing the PIN re-keys the existing (in-memory) data.
    await storage.rekeyDatabase('333333');
    assert(JSON.stringify(storage.getDb()) === JSON.stringify(updatedDb),
        'rekeyDatabase does not change the in-memory data itself');
    let oldPinThrewAfterRekey = false;
    try {
        await storage.unlockDatabase('111111');
    } catch (e) {
        oldPinThrewAfterRekey = true;
    }
    assert(oldPinThrewAfterRekey, 'after a PIN change, the OLD PIN can no longer decrypt the database');
    await storage.unlockDatabase('333333');
    assert(JSON.stringify(storage.getDb()) === JSON.stringify(updatedDb),
        'after a PIN change, the NEW PIN correctly decrypts the same data');

    // 7. wipeAll clears both the on-disk envelope and the in-memory session.
    storage.wipeAll();
    assert(store['taharahDB'] === undefined, 'wipeAll removes the on-disk database entirely');
    assert(JSON.stringify(storage.getDb()) === JSON.stringify({}),
        'wipeAll clears the in-memory cache too - getDb() is empty right after');

    if (failures > 0) {
        console.error(`\n${failures} dbCrypto test(s) failed.`);
        process.exitCode = 1;
    } else {
        console.log('\nAll dbCrypto tests passed.');
    }
}

await run();
