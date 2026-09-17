/**
 * בדיקות לכללי **העונות המעורבות** (docs/SPEC_DINIM_VESATOT.md §3.1).
 *
 * Run with: node tests/onotMeuravot.test.js
 *
 * המקור (עמ' 112–113):
 *  - "אין האשה קובעת לה וסת... אלא אם כן יהיו כולם בעונה אחת ביום או בלילה. ואם ראתה
 *    שלש פעמים ביום והרביעית בלילה או שלש פעמים בלילה והרביעית ביום, **חוששת ביום
 *    ובלילה** מפני חשש הוסת הראשון ומפני חשש השינוי שהוא האחרון. ואם ראתה פעמים ביום
 *    ופעמים בלילה שלא על הסדר... **חוששת לאחרונה בלבד**."
 *  - "והוא מדברי הראב\"ד בבעלי הנפש, ובדברי הראב\"ד מבואר שאף בוסת ההפלגה הדין כן,
 *    שצריך שיהיו שלש הראיות האחרונות הקובעות את הוסת באותה העונה."
 *  - ולגבי שיטת הגרד\"ט (מניין עונות במקום מניין ימים): "ונודע ביהודה משבח לדברי
 *    הגרד\"ט בסברא **אך לא קיבל דבריו להלכה**" `[שט ל\"ג | עמ' 113]`.
 *
 * מה נבדק:
 *  1. הזיהוי: תבנית שנשלמה בעונה אחת והראייה שאחריה בעונה שכנגד (`chazaka.mixedOna`).
 *  2. החשש שבעונה שכנגד מסומן בלוח (`עו"מ`), בעוד התבנית אינה נקבעת כוסת קבועה.
 *  3. שאין תוספת חשש במקום שבו אין "עונות מעורבות" (אותה עונה, או עונות שלא על הסדר).
 *  4. אותו דין בוסת ההפלגה, ובשילוב עם מנהג אור זרוע.
 *  5. שהתצוגה מציגה את הדין ומקורו, ולא מסתירה אותו.
 */
import { HDate } from '../hebcal.js';
import { calculateEngine } from '../js/calculations.js';
import { analyzeChazaka, mixedOnaChange, MIXED_ONA_CODE } from '../js/chazaka.js';

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
    list.forEach(r => { db[r.abs] = { type: 'reiyah', ona: r.ona, kind: r.kind || 'regular' }; });
    return db;
};
const entriesAt = (data, abs) => (data.computed.prishot[abs] || []);
const codesAt = (data, abs) => entriesAt(data, abs).map(p => p.code);
const allOfCode = (data, code) => Object.keys(data.computed.prishot)
    .reduce((acc, abs) => acc.concat((data.computed.prishot[abs] || [])
        .filter(p => p.code === code).map(p => ({ abs: Number(abs), ona: p.ona }))), []);
const today = d(1, 7, 5786);

// ---------- 1. שלש ביום והרביעית בלילה ----------

const threeDay = [d(15, 1, 5786), d(15, 2, 5786), d(15, 3, 5786)];
const fourthNight = d(15, 4, 5786);
const mixedDb = dbOf(
    threeDay.map(a => reiya(a, 'day')).concat([reiya(fourthNight, 'night')]));
const mixed = calculateEngine(mixedDb, false, { today });

assert(Array.isArray(mixed.chazaka.mixedOna) && mixed.chazaka.mixedOna.length === 1,
    'the completed pattern whose ona changed is detected');
const mixedMonth = mixed.chazaka.mixedOna[0];
assert(mixedMonth.kind === 'month' && mixedMonth.dayOfMonth === 15
    && mixedMonth.firstOna === 'day' && mixedMonth.lastOna === 'night',
    'and it records the pattern, the first ona and the changed ona');
assert(mixed.chazaka.established.length === 0,
    'the pattern is NOT established as a fixed veset - the three are not in one ona');

const nextFifteenth = d(15, 5, 5786);
const mirror = entriesAt(mixed, nextFifteenth).filter(p => p.code === MIXED_ONA_CODE);
assert(codesAt(mixed, nextFifteenth).indexOf('יו"ח') !== -1,
    'the coming veset time is marked in the ona of the newest sighting');
assert(mirror.length === 1 && mirror[0].ona === 'day',
    'and the first veset (the ona that was completed) is added on the same day');
assert(mirror[0].reason.indexOf('יום וללילה') !== -1,
    'the concern says in so many words that she is concerned for day and night');

// הכיוון ההפוך: שלש בלילה והרביעית ביום.
const reverseDb = dbOf(
    threeDay.map(a => reiya(a, 'night')).concat([reiya(fourthNight, 'day')]));
const reverse = calculateEngine(reverseDb, false, { today });
assert(reverse.chazaka.mixedOna && reverse.chazaka.mixedOna[0].firstOna === 'night',
    'the mirrored case (three at night, the fourth in the day) is detected too');
const reverseMirror = entriesAt(reverse, nextFifteenth).filter(p => p.code === MIXED_ONA_CODE);
assert(reverseMirror.length === 1 && reverseMirror[0].ona === 'night',
    'and there the missing side is the night ona');

// ---------- 2. שאין תוספת במקום שאין עונות מעורבות ----------

const fourDayDb = dbOf(threeDay.concat([fourthNight]).map(a => reiya(a, 'day')));
const fourDay = calculateEngine(fourDayDb, false, { today });
assert(fourDay.chazaka.mixedOna === null,
    'four sightings in one ona are not "mixed onas"');
assert(fourDay.chazaka.established.length === 1 && fourDay.chazaka.established[0].ona === 'day',
    'they establish the veset as usual');
assert(allOfCode(fourDay, MIXED_ONA_CODE).length === 0,
    'and no mirrored concern is added');

// הראשונה ביום ושלש האחרונות בלילה — "חוששת לאחרונה בלבד" (ונקבעת וסת ללילה).
const firstDayThenNight = dbOf(
    [reiya(threeDay[0], 'day')].concat(threeDay.slice(1).map(a => reiya(a, 'night')))
        .concat([reiya(fourthNight, 'night')]));
const lastOnly = calculateEngine(firstDayThenNight, false, { today });
assert(lastOnly.chazaka.mixedOna === null,
    'when the last three are in one ona there is no "mixed onas" pattern');
assert(lastOnly.chazaka.established.length === 1 && lastOnly.chazaka.established[0].ona === 'night',
    'the veset is established for the last ona only, as the source says');
assert(allOfCode(lastOnly, MIXED_ONA_CODE).length === 0,
    'and no mirrored concern is added');

// עונות מעורבות שלא על הסדר — אין הוספה, והמערכת אינה מסירה חששות מעצמה.
const unordered = dbOf([
    reiya(threeDay[0], 'night'), reiya(threeDay[1], 'day'),
    reiya(threeDay[2], 'night'), reiya(fourthNight, 'day')]);
const unorderedData = calculateEngine(unordered, false, { today });
assert(unorderedData.chazaka.mixedOna === null,
    'an unordered mix does not create a mirrored concern');
assert(unorderedData.chazaka.established.length === 0,
    'and it does not establish a veset either');
assert(codesAt(unorderedData, nextFifteenth).indexOf('יו"ח') !== -1,
    'while the sightings that were recorded still carry their own concerns');

// ---------- 3. וסת ההפלגה ----------

const step = 30;
const hafStart = d(1, 1, 5786);
const hafDay = [0, 1, 2, 3].map(k => hafStart + k * step);
const hafChange = hafStart + 4 * step;
const hafDb = dbOf(hafDay.map(a => reiya(a, 'day')).concat([reiya(hafChange, 'night')]));
const hafData = calculateEngine(hafDb, false, { today: hafChange + 5 });

assert(hafData.chazaka.mixedOna
    && hafData.chazaka.mixedOna.some(m => m.kind === 'haflagah' && m.span === step),
    'the same din applies to veset haflagah - the source says so in the name of the Raavad');
const hafMirror = entriesAt(hafData, hafChange + step).filter(p => p.code === MIXED_ONA_CODE);
assert(hafMirror.length === 1 && hafMirror[0].ona === 'day',
    'and the missing ona is added at the coming haflagah');
assert(codesAt(hafData, hafChange + step).indexOf('עו"ה') !== -1,
    'while the new sighting keeps its own haflagah concern in its own ona');

// ---------- 4. אור זרוע ----------

const noOrZarua = calculateEngine(mixedDb, false, { today });
const withOrZarua = calculateEngine(mixedDb, true, { today });
assert(allOfCode(noOrZarua, MIXED_ONA_CODE).length === allOfCode(withOrZarua, MIXED_ONA_CODE).length,
    'the mirrored concern does not depend on the Or Zarua custom');
assert(allOfCode(withOrZarua, 'עוא"ז').length > 0,
    'while with the custom on, the season before each concern is marked as usual');

// ---------- 5. יחידות ----------

assert(mixedOnaChange([]) === null && mixedOnaChange([reiya(1, 'day')]) === null,
    'a pattern is only detected when there are enough sightings');
const withOnes = [reiya(threeDay[0], 'day'), reiya(threeDay[1], 'day'),
    reiya(threeDay[2], 'day'), reiya(fourthNight, 'night', { kind: 'ones' })];
const onesChazaka = analyzeChazaka(withOnes);
assert(onesChazaka.mixedOna === null,
    'a sighting that is not counted (ones) neither completes nor changes a pattern');
assert(MIXED_ONA_CODE === 'עו"מ', 'the calendar code is the one shown in the legend');

// ---------- 6. תצוגה ----------

const stub = { innerHTML: '', className: '', style: { display: '' } };
global.document = {
    getElementById: (id) => (id === 'chazaka-container' ? stub : null),
    querySelector: () => null,
    addEventListener: () => {}
};
const { updateChazakaPanel } = await import('../js/ui.js');
updateChazakaPanel(mixed);
assert(stub.innerHTML.indexOf('עונות מעורבות') !== -1,
    'the panel names the din');
assert(stub.innerHTML.indexOf('חוששת ליום וללילה') !== -1,
    'and states what she is concerned about');
assert(stub.innerHTML.indexOf('data-help="onot_meuravot"') !== -1,
    'and links to the halachic explanation instead of just asserting');

if (failures === 0) {
    console.log('\nAll mixed-ona tests passed.');
} else {
    console.error(`\n${failures} mixed-ona test(s) failed.`);
    process.exitCode = 1;
}
