/**
 * בדיקות למסך סטטיסטיקה ותובנות אישיות (`docs/SPEC_FERTILITY_INSIGHTS.md`, פרק ב', §6-ב).
 *
 * Run with: node tests/insights.test.js
 *
 * מה נבדק:
 *  1. ממוצע וחציון מדויקים על סדרת הפלגות [28,28,30,34].
 *  2. סינון ערכים חריגים: הפלגה של 120 יום מזוהה כחריגה, מוחרגת כברירת מחדל
 *     מהממוצע, והחציון (שממילא עמיד) אינו מוטה על ידה.
 *  3. חישוב יום הפסק שכיח: 3 הפסקים ביום 5 והפסק אחד ביום 6 -> יום 5.
 *  4. תקינות תחביר SVG: `renderTrendGraphSVG` מחזירה XML תקין ללא NaN וללא
 *     קואורדינטות שבורות, כולל מקרה של רשימה ריקה.
 */
import { HDate } from '../hebcal.js';
import { calculateCycleInsights, renderTrendGraphSVG } from '../js/insights.js';

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
const base = d(1, 1, 5786);

const dbOf = (events) => {
    const db = {};
    events.forEach(e => {
        const type = e.type || 'reiyah';
        db[e.abs] = Object.assign({ type }, type === 'reiyah'
            ? { ona: e.ona || 'day', kind: e.kind || 'regular', durationDays: e.durationDays, signs: e.signs }
            : {});
    });
    return db;
};

// ---------- 1. ממוצע וחציון מדויקים: [28,28,30,34] -> ממוצע 30, חציון 29 ----------

{
    const events = [
        { abs: base },
        { abs: base + 27 },              // הפלגה 28
        { abs: base + 27 + 27 },         // הפלגה 28
        { abs: base + 27 + 27 + 29 },    // הפלגה 30
        { abs: base + 27 + 27 + 29 + 33 } // הפלגה 34
    ];
    const insights = calculateCycleInsights(dbOf(events));
    assert(insights.hasEnoughData === true, 'מספיק נתונים לחישוב');
    assert(insights.cycleStats.average === 30, `ממוצע ההפלגות [28,28,30,34] הוא 30 (התקבל ${insights.cycleStats.average})`);
    assert(insights.cycleStats.median === 29, `חציון ההפלגות [28,28,30,34] הוא 29 (התקבל ${insights.cycleStats.median})`);
}

// ---------- 2. סינון ערכים חריגים ----------

{
    const events = [
        { abs: base },
        { abs: base + 27 },        // הפלגה 28
        { abs: base + 54 },        // הפלגה 28
        { abs: base + 81 },        // הפלגה 28
        { abs: base + 200 }        // הפלגה 120 (חריגה: מעל 60 יום)
    ];
    const insights = calculateCycleInsights(dbOf(events));
    const outlierAbs = base + 200;
    assert(insights.outliers.some(o => o.abs === outlierAbs && o.haflagah === 120),
        'הפלגה של 120 יום מזוהה כחריגה (מעל 60 יום)');
    assert(insights.cycleStats.median === 28, `החציון אינו מוטה על ידי החריגה (התקבל ${insights.cycleStats.median})`);
    assert(insights.cycleStats.average === 28,
        `החריגה מוחרגת כברירת מחדל מהממוצע (התקבל ${insights.cycleStats.average}, לא 51)`);
    const cycleEntry = insights.cyclesList.find(c => c.abs === outlierAbs);
    assert(cycleEntry && cycleEntry.isOutlier === true, 'המחזור החריג מסומן ברשימת המחזורים');
    assert(cycleEntry && cycleEntry.isExcluded === true, 'המחזור החריג מסומן כמוחרג מהממוצע כברירת מחדל');
}
{
    // ביטול ההחרגה במפורש (`includedAbs`) מחזיר את ההפלגה לחישוב הממוצע.
    const events = [
        { abs: base },
        { abs: base + 27 },
        { abs: base + 54 },
        { abs: base + 81 },
        { abs: base + 200 }
    ];
    const outlierAbs = base + 200;
    const insights = calculateCycleInsights(dbOf(events), { includedAbs: [outlierAbs] });
    assert(insights.cycleStats.average === 51, 'includedAbs מבטל את ההחרגה האוטומטית ומחזיר את ההפלגה לממוצע');
}

// ---------- 3. יום הפסק שכיח ----------

{
    const events = [
        { abs: base }, { abs: base + 4, type: 'hefsek' },
        { abs: base + 30 }, { abs: base + 34, type: 'hefsek' },
        { abs: base + 60 }, { abs: base + 64, type: 'hefsek' },
        { abs: base + 90 }, { abs: base + 95, type: 'hefsek' }
    ];
    const insights = calculateCycleInsights(dbOf(events));
    assert(insights.bleedStats.modeHefsekDay === 5,
        `3 הפסקים ביום 5 והפסק אחד ביום 6 -> היום השכיח הוא יום 5 (התקבל ${insights.bleedStats.modeHefsekDay})`);
}

// ---------- 4. תקינות תחביר SVG ----------

{
    const events = [
        { abs: base },
        { abs: base + 27 },
        { abs: base + 54 },
        { abs: base + 83 },
        { abs: base + 116 }
    ];
    const insights = calculateCycleInsights(dbOf(events));
    const svg = renderTrendGraphSVG(insights.cyclesList, { averageLine: insights.cycleStats.average });
    assert(svg.startsWith('<svg') && svg.trim().endsWith('</svg>'), 'הפלט מתחיל ב-<svg ומסתיים ב-</svg>');
    assert(!svg.includes('NaN'), 'אין ערכי NaN בתוך ה-SVG');
    const rectCount = (svg.match(/<rect/g) || []).length;
    assert(rectCount === insights.cyclesList.length,
        `מספר ה-<rect> (${rectCount}) תואם למספר המחזורים (${insights.cyclesList.length})`);
}
{
    const svg = renderTrendGraphSVG([]);
    assert(svg.startsWith('<svg') && svg.trim().endsWith('</svg>'), 'רשימה ריקה: עדיין מוחזר SVG תקין');
    assert(!svg.includes('NaN'), 'רשימה ריקה: אין NaN');
}

// ---------- Empty state ----------

{
    const insights = calculateCycleInsights({});
    assert(insights.hasEnoughData === false, 'db ריק -> אין מספיק נתונים');
    assert(insights.cyclesList.length === 0, 'db ריק -> רשימת מחזורים ריקה');
}
{
    const insights = calculateCycleInsights(dbOf([{ abs: base }]));
    assert(insights.hasEnoughData === false, 'ראייה בודדת -> עדיין אין מספיק נתונים (אין הפלגה)');
}

console.log(failures === 0 ? `\nAll insights.js tests passed.` : `\n${failures} insights.js test(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
