/**
 * בדיקות לחלון ביוץ ופוריות (`docs/SPEC_FERTILITY_INSIGHTS.md`, פרק א', §6-א).
 *
 * Run with: node tests/fertility.test.js
 *
 * מה נבדק:
 *  1-3. יום הביוץ המשוער במחזור תקני/ארוך/קצר (נוסחה: יום הביוץ = אורך המחזור
 *       פחות שלב לוטאלי, בספירה מיום הראייה האחרונה).
 *  4. טווח חלון הפוריות — 7 ימים בדיוק (5 לפני הביוץ, הביוץ עצמו, ויום נוסף).
 *  5. זיהוי "עקרות הלכתית" — שני המקרים מהאפיון (`conflict: 'before'`/`'none'`).
 *  6. כיבוי אוטומטי בהריון פתוח ובנטילת כדורים.
 *  בונוס (לא מהרשימה המחייבת, כיסוי נוסף כנהוג בפרויקט): בסיס ממוצע-הפלגות,
 *  ברירת מחדל של 28 יום בראייה בודדת, סינון ראיות אונס/כדורים מהממוצע, וזיהוי
 *  מחזור משתנה בקיצוניות.
 */
import { HDate } from '../hebcal.js';
import { calculateEngine } from '../js/calculations.js';
import { calculateFertilityWindow, normalizeFertilitySettings } from '../js/fertility.js';

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
const TODAY = base + 2;

const dbOf = (events) => {
    const db = {};
    events.forEach(e => {
        const type = e.type || 'reiyah';
        db[e.abs] = Object.assign({ type }, type === 'reiyah'
            ? { ona: e.ona || 'day', kind: e.kind || 'regular', durationDays: e.durationDays }
            : {});
    });
    return db;
};

const engineFor = (events, life) => calculateEngine(dbOf(events), false, { today: TODAY, life });

const settingsOf = (extra) => Object.assign({
    enabled: true, lutealPhase: 14, cycleBasis: 'fixed', fixedCycleLength: 28, conflictAlert: true
}, extra || {});

// ---------- 1-3. יום הביוץ המשוער: מחזור תקני / ארוך / קצר ----------

{
    const engineData = engineFor([{ abs: base, ona: 'day' }]);
    const r = calculateFertilityWindow({}, engineData, settingsOf({ fixedCycleLength: 28, lutealPhase: 14 }));
    assert(r.enabled === true, 'מחזור תקני: התכונה פעילה');
    assert(r.ovulationAbs === base + 13, 'מחזור תקני (28, לוטאלי 14): יום ביוץ ביום ה-14 (base+13)');
}
{
    const engineData = engineFor([{ abs: base, ona: 'day' }]);
    const r = calculateFertilityWindow({}, engineData, settingsOf({ fixedCycleLength: 35, lutealPhase: 14 }));
    assert(r.ovulationAbs === base + 20, 'מחזור ארוך (35, לוטאלי 14): יום ביוץ ביום ה-21 (base+20)');
}
{
    const engineData = engineFor([{ abs: base, ona: 'day' }]);
    const r = calculateFertilityWindow({}, engineData, settingsOf({ fixedCycleLength: 24, lutealPhase: 14 }));
    assert(r.ovulationAbs === base + 9, 'מחזור קצר (24, לוטאלי 14): יום ביוץ ביום ה-10 (base+9)');
}

// ---------- 4. טווח חלון הפוריות: 7 ימים כולל הקצוות ----------

{
    const engineData = engineFor([{ abs: base, ona: 'day' }]);
    const r = calculateFertilityWindow({}, engineData, settingsOf({ fixedCycleLength: 28, lutealPhase: 14 }));
    assert(r.fertileStartAbs === r.ovulationAbs - 5, 'תחילת חלון הפוריות: ביוץ פחות 5 ימים');
    assert(r.fertileEndAbs === r.ovulationAbs + 1, 'סיום חלון הפוריות: ביוץ ועוד יום');
    assert(r.windowDays.length === 7, 'חלון הפוריות כולל 7 ימים בדיוק');
    assert(r.windowDays[0] === r.fertileStartAbs && r.windowDays[6] === r.fertileEndAbs,
        'רשימת ימי החלון תואמת לקצוות');
    assert(r.peakAbs[0] === r.ovulationAbs - 1 && r.peakAbs[1] === r.ovulationAbs,
        'ימי השיא: הערב שלפני הביוץ ויום הביוץ עצמו');
}

// ---------- 5. זיהוי עקרות הלכתית ----------

{
    // הפסק ביום 6 (base+5), אין תיעוד טבילה ידני -> ליל הטבילה הצפוי base+13 (יום 14).
    // ביוץ ביום 11 (cycleLength=25, luteal=14 -> base+10) חל לפני הטבילה.
    const engineData = engineFor([
        { abs: base, ona: 'day' },
        { abs: base + 5, type: 'hefsek' }
    ]);
    const r = calculateFertilityWindow({}, engineData, settingsOf({ fixedCycleLength: 25, lutealPhase: 14 }));
    assert(r.tevilahAbs === base + 13, 'ליל הטבילה הצפוי מחושב נכון (יום 14, בלא תיעוד ידני)');
    assert(r.ovulationAbs === base + 10, 'יום הביוץ ביום ה-11 כמצופה');
    assert(r.conflict === 'before', 'עקרות הלכתית: ביוץ לפני ליל הטבילה -> conflict="before"');
}
{
    // הפסק ביום 4 (base+3) -> ליל טבילה צפוי base+11 (יום 12).
    // ביוץ ביום 16 (cycleLength=30, luteal=14 -> base+15) חל הרבה אחרי הטבילה.
    const engineData = engineFor([
        { abs: base, ona: 'day' },
        { abs: base + 3, type: 'hefsek' }
    ]);
    const r = calculateFertilityWindow({}, engineData, settingsOf({ fixedCycleLength: 30, lutealPhase: 14 }));
    assert(r.tevilahAbs === base + 11, 'ליל הטבילה הצפוי מחושב נכון (יום 12)');
    assert(r.ovulationAbs === base + 15, 'יום הביוץ ביום ה-16 כמצופה');
    assert(r.conflict === 'none', 'חלון תקין: ביוץ אחרי הטבילה ביותר מיום -> conflict="none"');
}

// ---------- 6. השבתה בהריון ובכדורים ----------

{
    const life = { enabled: true, pregnancyAbs: base - 10, birthAbs: null };
    const engineData = engineFor([{ abs: base - 40, ona: 'day' }], life);
    const r = calculateFertilityWindow({}, engineData, settingsOf());
    assert(r.enabled === false && r.disabledReason === 'pregnant',
        'הריון פתוח (ללא לידה שנרשמה) -> enabled:false, disabledReason:"pregnant"');
}
{
    const life = { enabled: true, pills: [{ startAbs: base - 10, endAbs: base + 50, type: 'combined' }] };
    const engineData = engineFor([{ abs: base - 40, ona: 'day' }], life);
    const r = calculateFertilityWindow({}, engineData, settingsOf());
    assert(r.enabled === false && r.disabledReason === 'pills',
        'נוטלת כדורים כעת -> enabled:false, disabledReason:"pills"');
}
{
    // כשהתכונה כבויה בהגדרות עצמה - לא משנה מה מצב החיים.
    const engineData = engineFor([{ abs: base, ona: 'day' }]);
    const r = calculateFertilityWindow({}, engineData, settingsOf({ enabled: false }));
    assert(r.enabled === false && r.disabledReason === 'off', 'מתג כבוי בהגדרות -> disabledReason:"off"');
}

// ---------- בונוס: בסיס ממוצע-הפלגות, ברירת מחדל, סינון, ומחזור משתנה ----------

{
    // ארבע ראיות תקפות -> שלוש הפלגות: 28, 28, 30 -> ממוצע 28.67 -> עיגול ל-29.
    const events = [
        { abs: base, ona: 'day' },
        { abs: base + 27, ona: 'day' },
        { abs: base + 27 + 27, ona: 'day' },
        { abs: base + 27 + 27 + 29, ona: 'day' }
    ];
    const engineData = engineFor(events);
    const r = calculateFertilityWindow({}, engineData, settingsOf({ cycleBasis: 'auto', lutealPhase: 14 }));
    assert(r.basis === 'average', 'בלא וסת קבוע: בסיס החישוב הוא ממוצע הפלגות');
    assert(r.cycleLengthUsed === 29, 'ממוצע ההפלגות (28,28,30) מעוגל ל-29');
}
{
    // ראייה בודדת בלבד -> ברירת מחדל 28 יום.
    const engineData = engineFor([{ abs: base, ona: 'day' }]);
    const r = calculateFertilityWindow({}, engineData, settingsOf({ cycleBasis: 'auto' }));
    assert(r.basis === 'default-28' && r.cycleLengthUsed === 28,
        'ראייה בודדת בלבד (אין הפלגה) -> מחזור ברירת מחדל 28 יום');
    assert(typeof r.note === 'string' && r.note.length > 0, 'מוצגת הערה על ברירת המחדל');
}
{
    // הפלגה שנייה נספרת מראייה שסומנה כאונס - אינה נכללת בממוצע, ולכן מחושבת ישירות
    // מהראייה התקפה הקודמת אל התקפה שאחריה.
    const events = [
        { abs: base, ona: 'day' },
        { abs: base + 27, ona: 'day', kind: 'ones' },
        { abs: base + 27 + 28, ona: 'day' }
    ];
    const engineData = engineFor(events);
    const r = calculateFertilityWindow({}, engineData, settingsOf({ cycleBasis: 'auto' }));
    // ראייה תקפה יחידה שקדמה (base) וראייה תקפה יחידה שאחריה (base+55) -> הפלגה
    // אחת בלבד, ישירות בין שתיהן: 55+1=56 (מנין הלכתי). לא ה-27 ולא ה-28 בנפרד.
    assert(r.cycleLengthUsed === 56, 'ראיית אונס אינה נכללת בממוצע - ההפלגה מחושבת ישירות בין הראיות התקפות');
}
{
    // הפרש > 15 יום בין ההפלגות שנאספו -> מחזור משתנה, וטווח ביוץ רחב במקום יום בודד.
    const events = [
        { abs: base, ona: 'day' },
        { abs: base + 20, ona: 'day' },   // הפלגה 21
        { abs: base + 20 + 40, ona: 'day' } // הפלגה 41
    ];
    const engineData = engineFor(events);
    const r = calculateFertilityWindow({}, engineData, settingsOf({ cycleBasis: 'auto', lutealPhase: 14 }));
    assert(r.cycleVariable === true, 'הפרש גדול בין הפלגות (21 מול 41) -> מחזור משתנה');
    assert(Array.isArray(r.ovulationRangeAbs) && r.ovulationRangeAbs[1] > r.ovulationRangeAbs[0],
        'מוצג טווח ביוץ רחב (לא יום בודד) במחזור משתנה');
}

// ---------- נרמול הגדרות ----------

{
    const s = normalizeFertilitySettings({ lutealPhase: 99, fixedCycleLength: -5 });
    assert(s.lutealPhase === 16, 'שלב לוטאלי נחתך לטווח המותר (11-16)');
    assert(s.fixedCycleLength === 28, 'אורך מחזור לא תקין נופל לברירת המחדל (28)');
    assert(s.enabled === false, 'ברירת המחדל של enabled היא false (כבוי)');
}

console.log(failures === 0 ? `\nAll fertility.js tests passed.` : `\n${failures} fertility.js test(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
