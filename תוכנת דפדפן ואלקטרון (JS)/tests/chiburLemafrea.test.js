/**
 * בדיקות ל"צירוף למפרע" — קביעת וסת ההפלגה הארוכה אף שהפסיקה ביניהן הפלגה קצרה.
 *
 *  1. **הזיהוי** (`detectChiburLemafrea`, `js/chazaka.js`): "שראתה לל' ולל' ולכ'
 *     ושוב לל' אחר הכ' — קבעה לה וסת לל'" `[שט ל"ג | עמ' 112]`. הזיהוי מצומצם:
 *     הפלגה **ארוכה** מן הארוכה מפסיקה אותו, ונדרשת הפלגה מפסיקה קצרה אחת לפחות.
 *  2. **ברירת המחדל:** המועמד מוצג (במנוע: `chazaka.chibur`, בתצוגה: הפאנל),
 *     ואינו נחשב לווסת — שהספר מגדיר את הכלל "רק לחומרא בעלמא ולא מעיקרא דדינא".
 *  3. **המתג `chiburLemafrea`:** כשדלוק — הווסת נקבעת, מוקרנת, ומחליפה את שאר
 *     החששות (כדרך כל וסת קבועה), עם סימון `וק"ה` בלוח.
 *  4. **אי-הצגה כשהווסת כבר נקבעה בדרך הרגילה** (בהפלגות רצופות).
 *
 * Run with: node tests/chiburLemafrea.test.js
 */
import { HDate } from '../hebcal.js';
import { calculateEngine } from '../js/calculations.js';
import { detectChiburLemafrea } from '../js/chazaka.js';
import { defaultStringencies, STRINGENCY_DEFS } from '../js/stringencies.js';

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

/** סדרת ראיות לפי ההפלגות שביניהן (בימים), החל מ-`start`. */
function sightingSpans(spans, options) {
    const opts = options || {};
    const out = [];
    let abs = opts.start || d(1, 1, 5786);
    (spans || []).forEach((span, i) => {
        const ona = (opts.onot && opts.onot[i]) || 'day';
        out.push({ type: 'reiyah', ona, abs });
        abs += span;
    });
    // הראייה האחרונה
    out.push({ type: 'reiyah', ona: (opts.onot && opts.onot[opts.onot.length]) || 'day', abs });
    return out;
}

/** db מתוך רשימת ראיות. */
function dbOf(sightings) {
    const db = {};
    (sightings || []).forEach(r => { db[r.abs] = { type: 'reiyah', ona: r.ona }; });
    return db;
}

/** הסימונים בלוח בקוד מסוים. */
function codedAbs(engine, code) {
    return Object.keys(engine.computed.prishot)
        .map(Number)
        .filter(abs => (engine.computed.prishot[abs] || []).some(p => p.code === code))
        .sort((a, b) => a - b);
}

const withStringency = (key, value) => {
    const s = defaultStringencies();
    s[key] = value;
    return s;
};

// ---------- 1. הזיהוי ----------

const span = 30;
const pattern = sightingSpans([span, span, 20, span]);
const counted = pattern.map(r => ({ abs: r.abs, ona: r.ona, hdate: new HDate(r.abs) }));

const candidate = detectChiburLemafrea(counted);
assert(candidate && candidate.kind === 'haflagah' && candidate.span === 30,
    'שלוש הפלגות של ל\' שהפסיק ביניהן כ\' — מזוהה כמועמד וסת של ל\'');
assert(candidate && candidate.viaChibur === true, 'המועמד מסומן viaChibur');
assert(candidate && candidate.establishedBy.length === 5,
    'כל חמש הראיות שבחלון נמנות ב-establishedBy (כולל הראייה של ההפלגה הקצרה)');
assert(candidate && candidate.gapSpans.join(',') === '20', 'ההפלגה המפסיקה נרשמת (כ\')');

// הכלל דורש הפלגה **קצרה** מפסיקה; הפלגה ארוכה מן הארוכה אינה בכלל ההיתר.
const longerGap = sightingSpans([span, span, 40, span])
    .map(r => ({ abs: r.abs, ona: r.ona, hdate: new HDate(r.abs) }));
assert(detectChiburLemafrea(longerGap) === null,
    'הפלגה ארוכה מן הארוכה מפסיקה את הצירוף — ואין מועמד');

// בלא הפלגה מפסיקה אין זה צירוף למפרע אלא חזקה רגילה.
const consecutive = sightingSpans([span, span, span])
    .map(r => ({ abs: r.abs, ona: r.ona, hdate: new HDate(r.abs) }));
assert(detectChiburLemafrea(consecutive) === null,
    'שלוש הפלגות רצופות — חזקה רגילה, ואין כאן צירוף למפרע');

// תנאי העונה: כל הראיות שבחלון באותה עונה.
const mixedOnot = sightingSpans([span, span, 20, span], { onot: ['day', 'day', 'night', 'day'] })
    .map(r => ({ abs: r.abs, ona: r.ona, hdate: new HDate(r.abs) }));
assert(detectChiburLemafrea(mixedOnot) === null,
    'עונות מעורבות בחלון — אין זיהוי (כל הראיות צריכות להיות באותה עונה)');

// רק שלש הפלגות שוות, ולא פחות.
const twoOnly = sightingSpans([span, 20, span])
    .map(r => ({ abs: r.abs, ona: r.ona, hdate: new HDate(r.abs) }));
assert(detectChiburLemafrea(twoOnly) === null,
    'שתי הפלגות שוות בלבד — אין קביעות');

// ---------- 2. ברירת המחדל: מועמד בלי חשש ----------

const db = dbOf(pattern);
const today = Math.max(...Object.keys(db).map(Number)) + 5;
const plain = calculateEngine(db, false, { today });

assert(plain.chazaka.chibur && plain.chazaka.chibur.span === 30,
    'המועמד מוחזר מן המנוע לתצוגה');
assert(plain.computed.chiburCandidate && plain.computed.chiburCandidate.span === 30,
    'המועמד מוצג גם מן המנוע הראשי (לתצוגה בפאנל)');
assert(plain.standingVesets.filter(v => v.kind === 'haflagah').length === 0,
    'וברירת המחדל אין וסת ההפלגה עומדת');
assert(codedAbs(plain, 'וק"ה').length === 0, 'ובלוח אין סימון וק"ה');

// ---------- 3. המתג ----------

const strict = calculateEngine(db, false, {
    today, stringencies: withStringency('chiburLemafrea', true)
});
const standing = strict.standingVesets.filter(v => v.kind === 'haflagah' && v.viaChibur === true);
assert(standing.length === 1 && standing[0].span === 30,
    'במתג chiburLemafrea — הוסת נקבעת בצירוף למפרע');
assert(codedAbs(strict, 'וק"ה').length > 0,
    'והיום מסומן בלוח כזמן הוסת הקבועה (וק"ה)');
assert(strict.computed.suppressed.length > 0,
    'ומכוח הוסת הקבועה מוסרים שאר החששות — ומדווחים');

// ---------- 4. אין כפילות כשנקבעה וסת באותו אורך בדרך הרגילה ----------

const regular = dbOf(sightingSpans([span, span, span]));
const regularEngine = calculateEngine(regular, false, { today });
assert(!regularEngine.chazaka.chibur,
    'וסת שנקבעה בהפלגות רצופות — אין מועמד צירוף לאותו אורך');
assert(regularEngine.standingVesets.some(v => v.kind === 'haflagah' && !v.viaChibur),
    'והווסת הרגילה עומדת כהרגלה');

// ---------- 5. המתג מוגדר במודול, ומראה מקומו את עמוד 112 ----------

const def = STRINGENCY_DEFS.find(s => s.key === 'chiburLemafrea');
assert(def && def['default'] === false, 'המתג מוגדר וכבוי כברירת מחדל');
assert(def && def.source.indexOf('112') !== -1, 'ולצידו מראה המקום');
assert(def && def.text.indexOf('לחומרא בעלמא') !== -1,
    'ולשון הספר על גבול הדין — "רק לחומרא בעלמא" — מובאת במלואה');

// ---------- 6. הפאנל ----------
// המועמד מוצג לבירור עם רב, ובלשון הספר — ובמתג הוא מוצג כווסת נקבעת.

const stub = { innerHTML: '', className: '', style: { display: '' } };
global.document = {
    getElementById: (id) => (id === 'chazaka-container' ? stub : null),
    querySelector: () => null,
    addEventListener: () => {}
};
const { updateChazakaPanel } = await import('../js/ui.js');

updateChazakaPanel(plain);
assert(stub.innerHTML.indexOf('צירוף למפרע') !== -1,
    'הפאנל מציג את התבנית בשמה (צירוף למפרע)');
assert(stub.innerHTML.indexOf('וסת קצר אינו עוקר וסת הארוך') !== -1,
    'ומביא את לשון המקור');
assert(stub.innerHTML.indexOf('לחומרא בעלמא') !== -1,
    'ומביא גם את גבול הדין — "רק לחומרא בעלמא"');
assert(stub.innerHTML.indexOf('data-help="chibur_lemafrea"') !== -1,
    'ולצידה בועת הסבר עם מראה המקום');

stub.innerHTML = '';
updateChazakaPanel(strict);
assert(stub.innerHTML.indexOf('בצירוף למפרע') !== -1,
    'במתג — הפאנל מציג את הווסת כאילו נקבעה בצירוף למפרע');

// ---------- סיכום ----------

if (failures > 0) {
    console.error(`\n${failures} בדיקות נכשלו.`);
    process.exit(1);
}
console.log('\nAll chibur-lemafrea tests passed.');
