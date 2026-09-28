/**
 * בדיקות למניין שבעה הנקיים וליל הטבילה (`js/calculations.js`), ובפרט
 * ל-`computed.nekiimStart` — התוספת (2026-09-20) שמסמנת גם את הלילה שבו
 * *נפתחת* ספירת הנקיים (הלילה שאחרי יום ההפסק), ולא רק את ימי הנקיים עצמם.
 *
 * הרקע (אפיון תוספות עתידיות מתוכננות.txt): המשתמש הצביע שהיום הראשון של
 * הנקיים מוצג בלוח רק ב"תחתית המשבצת" (חלק היום), בזמן שביהדות היום מתחיל
 * בלילה שלפניו — ולכן יש לסמן אותו גם "בראש הקוביה" (חלק הלילה), כדרך שכבר
 * נהוג בלוח הזה לגבי ליל הטבילה עצמו.
 *
 * Run with: node tests/nekiim.test.js
 */
import { HDate } from '../hebcal.js';
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

const d = (day, month, year) => new HDate(day, month, year).abs();
const hefsekAbs = d(15, 'Sivan', 5785); // ט"ו סיון — כדוגמת המשתמש

const db = { [hefsekAbs]: { type: 'hefsek' } };
const today = hefsekAbs + 30; // הרחק מכל התאריכים הרלוונטיים, כדי לא להשפיע על חששות אחרים
const { computed } = calculateEngine(db, false, { today });

assert(Array.isArray(computed.nekiimStart), 'computed.nekiimStart קיים ומהווה מערך');
assert(computed.nekiimStart.length === 1 && computed.nekiimStart[0] === hefsekAbs + 1,
    'היום הראשון של הנקיים (hefsek+1, ט"ז) הוא הרשומה היחידה ב-nekiimStart');
assert(computed.nekiim.includes(hefsekAbs + 1),
    'אותו יום (hefsek+1) גם נכלל במניין nekiim המלא (יום ולילה כאחד)');
for (let i = 1; i <= 7; i++) {
    assert(computed.nekiim.includes(hefsekAbs + i), `יום hefsek+${i} נכלל במניין הנקיים`);
}
assert(!computed.nekiim.includes(hefsekAbs) && !computed.nekiim.includes(hefsekAbs + 8),
    'יום ההפסק עצמו והיום שאחרי השבעה אינם נכללים במניין');
assert(computed.tevilot.includes(hefsekAbs + 8),
    'ליל הטבילה מסומן על היום שהלילה שלו הוא ליל הטבילה (hefsek+8, כ"ג — לפי דוגמת המשתמש: הנקיים מסתיימים בכ"ב, הטבילה בליל כ"ג)');

// הפסק שנקטע (ראייה בתוך השבעה) — לא נספר, ולא אמור להותיר nekiimStart יתום.
const hefsekAbs2 = d(1, 'Tishrei', 5786);
const interruptedDb = {
    [hefsekAbs2]: { type: 'hefsek' },
    [hefsekAbs2 + 3]: { type: 'reiyah', ona: 'day' }
};
const { computed: interrupted } = calculateEngine(interruptedDb, false, { today: hefsekAbs2 + 30 });
assert(interrupted.nekiimStart.length === 0 && interrupted.nekiim.length === 0,
    'הפסק שנקטע בראייה בתוך השבעה — לא מסמן nekiim ולא nekiimStart כלל');

if (failures > 0) {
    console.error(`\n${failures} nekiim test(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll nekiim tests passed.');
}
