/**
 * בדיקות לגיבוב החד-כיווני של קוד הגישה (`js/pinCrypto.js`).
 *
 * Run with: node tests/pinCrypto.test.js
 *
 * הבדיקה המרכזית: אין דרך לשלוף את הקוד המקורי מהרשומה השמורה — רק להשוות
 * גיבוב-מול-גיבוב. שני קודים שונים חייבים לתת גיבוב שונה, ואותו קוד עם שני
 * מלחים (salts) שונים חייב גם הוא לתת גיבוב שונה (כדי שגיבוי שגלש לא יאפשר
 * טבלת-חיפוש של גיבובים לקודים שכיחים).
 */
import { createPinRecord, verifyPinRecord } from '../js/pinCrypto.js';

let failures = 0;
async function assert(condition, message) {
    if (condition) {
        console.log('PASS: ' + message);
    } else {
        failures++;
        console.error('FAIL: ' + message);
    }
}

async function run() {
    const record = await createPinRecord('123456');

    await assert(typeof record.salt === 'string' && record.salt.length > 0,
        'a fresh PIN record has a random salt');
    await assert(typeof record.hash === 'string' && record.hash.length > 0,
        'a fresh PIN record has a hash');
    await assert(!('pin' in record) && JSON.stringify(record).indexOf('123456') === -1,
        'the record never contains the raw PIN digits in any form');

    await assert(await verifyPinRecord('123456', record) === true,
        'the correct PIN verifies against its own record');
    await assert(await verifyPinRecord('000000', record) === false,
        'a wrong PIN is rejected');
    await assert(await verifyPinRecord('123456', null) === false,
        'a missing record never verifies (fails closed)');

    const record2 = await createPinRecord('123456');
    await assert(record.salt !== record2.salt,
        'two records for the same PIN get different random salts');
    await assert(record.hash !== record2.hash,
        'two records for the same PIN therefore get different hashes (no reusable lookup table)');
    await assert(await verifyPinRecord('123456', record2) === true,
        'the second record still verifies correctly despite the different salt');

    if (failures > 0) {
        console.error(`\n${failures} pinCrypto test(s) failed.`);
        process.exitCode = 1;
    } else {
        console.log('\nAll pinCrypto tests passed.');
    }
}

run();
