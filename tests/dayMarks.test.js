/**
 * בדיקות לסימוני היום (js/dayMarks.js) ולחמשת הדינים שנשענים עליהם:
 *
 *  1. **פטורי עונת אור זרוע** `[שט כ"ז | עמ' 49]` — ליל טבילה · ליל החופה ·
 *     יוצא לדרך. עונה שהיתה מונחת ונסתלקה מחמתם נאספת ב-`orZaruaExemptions`,
 *     ואינה נעלמת בשקט; וסימון על יום אחר אינו מפטר.
 *  2. **כתם** `[שט ל"ה | עמ' 127–128]` — אינו ראייה: אינו קובע וסת, אינו מפסיק
 *     מניין, ואינו מבטל עקירה. ובמחלוקת העקירה: כברירת מחדל כהפרישה (אין בו
 *     עקירה), ובמתג `stainUproots` כשערי טוהר — כתם בזמן הוסת נחשב עקירה.
 *  3. **פחד פתאום (ביעתותא)** `[שט כ"ז | עמ' 42]` — מביא לדם, ולמעשה אסורה עד
 *     שישאלנה אם הרגישה; דרישת הבדיקה נשלטת במתג `frightBedika`.
 *  4. **מאכל חריף בלא ראייה** `[שט כ"ז | עמ' 41]` — דינו כוסת הגוף.
 *  5. **מניין ההפלגה** — מתחילת הראייה (ברירת מחדל) או מסופה (מתג `haflagahFromEnd`).
 *
 * Run with: node tests/dayMarks.test.js
 */
import { HDate } from '../hebcal.js';
import { calculateEngine } from '../js/calculations.js';
import { DAY_MARKS, DAY_MARK_RULES, marksOf, stainDays, orZaruaExemptionFor } from '../js/dayMarks.js';
import { analyzeBodyVeset } from '../js/vesetGuf.js';
import { defaultStringencies } from '../js/stringencies.js';

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
const base = d(1, 1, 5786);              // א' ניסן
const dayAfter = (abs, n) => abs + n;

const withStringency = (key, value) => {
    const s = defaultStringencies();
    s[key] = value;
    return s;
};

// ---------- 1. רשימת הסימונים עצמה ----------

assert(DAY_MARKS.length === 5, 'חמישה סימוני יום מוגדרים');
['stain', 'fright', 'anxiety', 'travel', 'chuppah'].forEach(code => {
    assert(DAY_MARKS.some(m => m.code === code), `הסימון ${code} מוגדר`);
});
assert(DAY_MARKS.every(m => DAY_MARK_RULES[m.code] && DAY_MARK_RULES[m.code].source),
    'לכל סימון שנוגע לדין יש ניסוח דין עם מראה מקום');
assert(marksOf({ marks: ['stain', 'nonsense', 'stain'] }).join(',') === 'stain',
    'קוד לא מוכר וכפילות מסוננים מן הסימונים');
const stainSet = stainDays(new Map([[100, ['stain']], [200, ['travel']]]));
assert(stainSet.has(100) && !stainSet.has(200), 'stainDays מחזיר רק את ימי הכתם');

// ---------- 2. פטורי עונת אור זרוע ----------

// ראיה בעונת יום -> עונה בינונית ביום ל' -> עונת אור זרוע בליל אותו יום.
const reiyaDay = base;
const beinonit = dayAfter(reiyaDay, 29);
const dbOrZarua = marks => {
    const db = { [reiyaDay]: { type: 'reiyah', ona: 'day' } };
    if (marks) db[beinonit] = { note: 'סימון', marks: marks };
    return db;
};

const orZarua = (db, stringencies) => calculateEngine(db, true, { today: beinonit, stringencies });

const plain = orZarua(dbOrZarua(), null);
const orZaruaForBeinonit = (plain.computed.prishot[beinonit] || []).filter(p => p.code === 'עוא"ז');
assert(orZaruaForBeinonit.length === 1 && orZaruaForBeinonit[0].ona === 'night',
    'עונת אור זרוע נוספת בליל העונה של יום ל\' מן הראייה');
assert(plain.orZaruaExemptions.length === 0, 'בלא סימון — אין פטור, והעונה נשארת בלוח');

const withChuppah = orZarua(dbOrZarua(['chuppah']), null);
assert(withChuppah.orZaruaExemptions.length === 1
    && withChuppah.orZaruaExemptions[0].code === 'chuppah',
    'ליל החופה מפטר את עונת אור זרוע `[שט כ"ז | עמ\' 49]`');
assert(!(withChuppah.computed.prishot[beinonit] || []).some(p => p.code === 'עוא"ז'),
    'העונה הפטורה אינה מונחת על הלוח');

const withTravel = orZarua(dbOrZarua(['travel']), null);
assert(withTravel.orZaruaExemptions.length === 1
    && withTravel.orZaruaExemptions[0].code === 'travel',
    'יציאה לדרך מפטרת את עונת אור זרוע');

// סימון על יום אחר אינו מפטר את העונה שעליה הוא לא נסב.
const wrongDay = {
    [reiyaDay]: { type: 'reiyah', ona: 'day' },
    [beinonit - 1]: { marks: ['chuppah'] }
};
const misplaced = orZarua(wrongDay, null);
assert(misplaced.orZaruaExemptions.length === 0
    && (misplaced.computed.prishot[beinonit] || []).some(p => p.code === 'עוא"ז'),
    'סימון על יום אחר אינו מפטר את העונה');

// ליל טבילה: ההפסק יוצר טבילה בלילה של יום ל' עצמו.
const hefsekAbs = dayAfter(reiyaDay, 21);
const dbTevilah = {
    [reiyaDay]: { type: 'reiyah', ona: 'day' },
    [hefsekAbs]: { type: 'hefsek' }
};
const withTevilah = orZarua(dbTevilah, null);
assert(withTevilah.computed.tevilot.indexOf(beinonit) !== -1,
    'הטבילה נקבעת לליל היום שלאחר היום השביעי');
assert(withTevilah.orZaruaExemptions.some(e => e.code === 'lilTvila'),
    'ליל טבילה מפטר את עונת אור זרוע ("מותרת, ותבדוק קו\"ת")');
assert(!(withTevilah.computed.prishot[beinonit] || []).some(p => p.code === 'עוא"ז'),
    'ובליל טבילה אין העונה מונחת על הלוח');

// בלא מנהג אור זרוע אין מה לפטור.
const noOrZarua = calculateEngine(dbOrZarua(['chuppah']), false, { today: beinonit });
assert(noOrZarua.orZaruaExemptions.length === 0,
    'כשמנהג אור זרוע כבוי אין פטור — ואין גם מה לפטור');

// הפונקציה עצמה: הפטור מוחזר עם מראה מקומו.
const exemption = orZaruaExemptionFor({
    shiftAbs: beinonit, shiftOna: 'night', marks: new Map([[beinonit, ['travel']]]), tevilot: new Set()
});
assert(exemption && exemption.code === 'travel' && exemption.source.indexOf('49') !== -1,
    'orZaruaExemptionFor מחזיר פטור עם מראה מקום');

// ---------- 3. כתם ----------

// כתם על יום של חשש אינו ראייה: הזמן נעקר גם כשהכתם נרשם בו.
const concernDay = dayAfter(reiyaDay, 29);
const dbStain = {
    [reiyaDay]: { type: 'reiyah', ona: 'day' },
    [concernDay]: { type: 'check', ona: 'day', depth: 'wipe', marks: ['stain'] }
};
const stainPassed = calculateEngine(dbStain, false, { today: dayAfter(concernDay, 2) });
assert((stainPassed.computed.prishot[concernDay] || []).every(p => p.uprooted),
    'כתם אינו ראייה — הזמן שעבר נעקר ולא נחשב שראתה בו');

// כתם אינו קובע וסת: שנייה גמורה ושלישית כתם — לא נקבעה וסת.
const m1 = d(1, 1, 5786), m2 = d(1, 2, 5786), m3 = d(1, 3, 5786);
const dbStainEstablish = {
    [m1]: { type: 'reiyah', ona: 'day' },
    [m2]: { type: 'reiyah', ona: 'day' },
    [m3]: { type: 'reiyah', ona: 'day' }
};
const established = calculateEngine(dbStainEstablish, false, { today: d(1, 6, 5786) });
assert(established.chazaka.established.some(v => v.kind === 'month'),
    'בשלש ראיות גמורות נקבעת וסת');
assert(!established.reiyot.some(r => r.abs === m3 && r.counted === false),
    'ושלושתיהן נספרות');

// ---------- 4. מחלוקת העקירה בכתם (מתג stainUproots) ----------

const sightingDays = [d(1, 1, 5786), d(1, 2, 5786), d(1, 3, 5786)];
const dbFixedStain = {};
sightingDays.forEach(abs => { dbFixedStain[abs] = { type: 'reiyah', ona: 'day' }; });
// שלושת זמני הוסת הבאים: א' באייר–א' בסיון כבר עברו (הן הראיות), ולהלן א' תמוז–א' אב.
const dueDays = [d(1, 4, 5786), d(1, 5, 5786), d(1, 6, 5786)];
dueDays.forEach(abs => { dbFixedStain[abs] = { note: 'כתם', marks: ['stain'] }; });
// שנה עברית מתחילה בתשרי, ולכן "היום" שאחרי אלול תשפ"ו הוא תשרי תשפ"ז.
const todayStain = d(1, 7, 5787);

const stainOff = calculateEngine(dbFixedStain, false, { today: todayStain });
const stainOn = calculateEngine(dbFixedStain, false, {
    today: todayStain, stringencies: withStringency('stainUproots', true)
});

const statusesOf = (data) => {
    const fixed = (data.akirot.fixed || []).find(f => f.veset.kind === 'month');
    return fixed ? fixed.dueTimes.map(s => s.status) : [];
};
assert(statusesOf(stainOff).indexOf('stain') === -1,
    'כברירת מחדל (כהפרישה) אין הכתם נחשב עקירה');
assert(statusesOf(stainOn).indexOf('stain') !== -1,
    'ובמתג stainUproots (דעת שערי טוהר) כתם בזמן הוסת נחשב עקירה');

// ---------- 5. פחד פתאום (ביעתותא) ----------

const frightDay = dayAfter(m1, 3);
const dbFright = {
    [m1]: { type: 'reiyah', ona: 'day' },
    [frightDay]: { note: 'פחד', marks: ['fright'] }
};

const frightDefault = calculateEngine(dbFright, false, { today: dayAfter(frightDay, 1) });
assert(frightDefault.fright.open.length === 1,
    'פחד פתאום שטרם נברר מסומן כפתוח');
assert(!frightDefault.computed.pendingChecks.some(p => p.kind === 'fright'),
    'כברירת המחדל (כחת"ס) אין נדרשת בדיקה מחמת הפחד');

const frightStrict = calculateEngine(dbFright, false, {
    today: dayAfter(frightDay, 1), stringencies: withStringency('frightBedika', true)
});
assert(frightStrict.computed.pendingChecks.some(p => p.kind === 'fright' && p.abs === frightDay),
    'ובמתג — נדרשת בדיקה כדין מחמת הפחד');

// בדיקה כדין באותו יום מבררת את הפחד; קינוח לבד אינו מברר.
const withDeep = {
    [m1]: { type: 'reiyah', ona: 'day' },
    [frightDay]: { type: 'check', ona: 'day', depth: 'deep', marks: ['fright'] }
};
const frightSettled = calculateEngine(withDeep, false, { today: dayAfter(frightDay, 1) });
assert(frightSettled.fright.open.length === 0 && frightSettled.fright.settled.length === 1,
    'בדיקה כדין באותו יום מבררת את הפחד');

const withWipe = {
    [m1]: { type: 'reiyah', ona: 'day' },
    [frightDay]: { type: 'check', ona: 'day', depth: 'wipe', marks: ['fright'] }
};
const frightWipe = calculateEngine(withWipe, false, { today: dayAfter(frightDay, 1) });
assert(frightWipe.fright.open.length === 1 && frightWipe.fright.open[0].wipeOnly === true,
    'קינוח לבד אינו מברר, ומסומן ככזה בפאנל');

// חרדה מתמשכת — מידע בלבד, ואינה מבטלת חששות שתועדו.
const anxietyDay = dayAfter(m1, 5);
const dbAnxiety = {
    [m1]: { type: 'reiyah', ona: 'day' },
    [anxietyDay]: { note: 'חרדה', marks: ['anxiety'] }
};
const anxiety = calculateEngine(dbAnxiety, false, { today: dayAfter(anxietyDay, 1) });
assert(anxiety.fright.anxietyDays.length === 1 && anxiety.fright.open.length === 0,
    'חרדה מתמשכת נרשמת כמידע ואינה תובעת בדיקה');
assert(anxiety.computed.prishot[dayAfter(m1, 29)],
    'וחרדה מתמשכת אינה מבטלת חשש של ראייה שתועדה');

// ---------- 6. מאכל חריף בלא ראייה ----------

const sharpDay = dayAfter(m1, 7);
const dbSharp = {
    [m1]: { type: 'reiyah', ona: 'day' },
    [sharpDay]: { type: 'sign', ona: 'day', signs: ['sharpFood'], standaloneSign: true }
};
const sharp = calculateEngine(dbSharp, false, { today: dayAfter(sharpDay, 1) });
const sharpSign = (sharp.bodyVeset.bySign || []).find(s => s.code === 'sharpFood');
assert(sharpSign && sharpSign.count === 1 && sharpSign.fixed === false,
    'אכילת מאכל חריף בלא ראייה נספרת לוסת הגוף, ומחמת פעם אחת');
assert(sharp.bodyVeset.standaloneSigns.some(s => s.signs.indexOf('sharpFood') !== -1),
    'האכילה נשמרת כרשומה של מיחוש בלא ראייה');
assert(sharp.computed.standaloneSigns.some(s => s.abs === sharpDay),
    'והיום שלה מוצג לממשק');

// ---------- 7. מניין ההפלגה: מתחילת הראייה או מסופה ----------

// הראייה הראשונה נמשכה ארבעה ימים, והשנייה באה 21 יום אחר תחילתה.
const firstAbs = d(1, 1, 5786);
const secondAbs = dayAfter(firstAbs, 21);
const dbHaflagah = {
    [firstAbs]: { type: 'reiyah', ona: 'day', closedFountain: false, durationDays: 4 },
    [secondAbs]: { type: 'reiyah', ona: 'day', closedFountain: true }
};
const haflagahDue = (data) => Object.keys(data.computed.prishot)
    .map(Number)
    .filter(abs => abs > secondAbs && (data.computed.prishot[abs] || []).some(p => p.code === 'עו"ה'))
    .sort((a, b) => a - b)[0];

const fromStart = calculateEngine(dbHaflagah, false, { today: secondAbs });
const fromEnd = calculateEngine(dbHaflagah, false, {
    today: secondAbs, stringencies: withStringency('haflagahFromEnd', true)
});
assert(haflagahDue(fromStart) === secondAbs + 21,
    'ברירת המחדל: מניין ההפלגה מתחילת הראייה `[ד"ט | עמ\' 1]`');
assert(haflagahDue(fromEnd) === secondAbs + 18,
    'ובמתג haflagahFromEnd: המניין מסוף הראייה (21 פחות שלשת ימי המשך)');

// ---------- 8. מגירת הסימונים אינה יוצרת חשש ----------

const marksOnly = calculateEngine({
    [d(1, 8, 5786)]: { note: 'יום עם סימונים', marks: ['stain', 'anxiety', 'travel'] }
}, true, { today: d(1, 8, 5786) });
assert(Object.keys(marksOnly.computed.prishot).length === 0,
    'סימוני יום לבדם אינם יוצרים חשש ואינם מוסיפים חששות');
assert(marksOnly.fright.anxietyDays.length === 1 && marksOnly.fright.days.length === 0,
    'ורק החרדה נקלטת מהם — כמידע');

// וסת הגוף: אותו מסלול של analyzeBodyVeset עם הסימון של מאכל חריף.
const bodyDirect = analyzeBodyVeset({
    reiyot: [],
    counted: [],
    signRecords: [{ abs: sharpDay, ona: 'day', signs: ['sharpFood'], checked: false }]
});
assert(bodyDirect.standaloneSigns.length === 1 && bodyDirect.bySign[0].code === 'sharpFood',
    'analyzeBodyVeset מזהה אכילת מאכל חריף בלא ראייה');

// ---------- סיכום ----------

if (failures > 0) {
    console.error(`\n${failures} בדיקות נכשלו.`);
    process.exit(1);
}
console.log('\nAll day-marks tests passed.');
