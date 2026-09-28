/**
 * מנוע עקירת הוסתות — מתי חדלה החובה לחוש.
 *
 * המודול משלים את מנוע החזקה (`js/chazaka.js`): זה מזהה **מה נקבע**, וזה מזהה
 * **מה נעקר**. בלי עקירה, וסת קבוע שנקבע היה עומד לעד — ובפועל היו מוצגות למשתמשת
 * חובות שאינן קיימות עוד (§7 פער 2 באפיון).
 *
 * המקורות (ראו docs/SPEC_DINIM_VESATOT.md §4):
 *  - **וסת שאינו קבוע:** "עונת וסת שאינו קבוע שעברה ולא ראתה בה — נעקרה מיד"
 *    `[שט ל"ג | עמ' 111]`
 *  - **וסת קבוע:** "הוסת הקבוע בשלש פעמים צריך עקירה שלש פעמים **ובדיקה**... אבל אם לא
 *    בדקה לא נעקר הוסת" `[שט מ"א | עמ' 182]`
 *  - **מהי בדיקה מועילה:** "הבדיקה המועילה לברר שלא ראתה היא כשבודקת כדין בעומק ובחו"ס,
 *    אבל בקינוח לבד לא מהני" `[שט מ"א | עמ' 182]`
 *  - **בדיקה באיחור:** "אף בבדיקה שאחר כמה ימים נעקר הוסת אף בוס"ק" `[שט מ"א | עמ' 183]`
 *  - **האיסור עד הבדיקה:** "אם עבר זמן עונה בינונית ולא בדקה אסורה לבעלה עד שתבדק"
 *    `[שט כ"ד | עמ' 7]` — זה **הדין עצמו**, ולכן הוא מוצג בחזית ולא מוסתר.
 *  - **עקירת ההפלגה במניין הימים:** "כגון אם היה וסתה מעשרים יום לעשרים יום ועברו עליה
 *    נ"ח יום — שיום הראייה עולה לכאן ולכאן — ולא ראתה, נחשב שהוכח בשלש פעמים שנעקר ממנה
 *    טבע זה" `[שט מ"א | עמ' 183]` ⇒ `periodsToClear(span) = span * 3 - 2`
 *  - **חזרת וסת שנעקר:** "אלא אם תחזור ותראה שוב בהפלגת עשרים, שחזר הוסת למקומו... והש"ך
 *    בנקודות הכסף נחלק על..." `[שט מ"א | עמ' 183]` ⇒ **מחלוקת**, אינה מוכרעת כאן.
 *  - **עיכוב עקירה בכדורים:** "נשים הנוטלות כדורים לדחיית וסתן... ופעמים נוצרת הפלגה
 *    ארוכה... הטעם בזה כיון **שלא עקרה וסתה** כיון שניכר בבירור שהפלגתה הארוכה מחמת
 *    הכדורים" `[ד"ט | עמ' 8]` ⇒ ימי נטילת הכדורים אינם נמנים למניין העקירה, וראייה
 *    שסומנה כמחמת כדורים (B3) אינה נחשבת לראייה טבעית המפסיקה את המניין.
 */

/** כמה זמני וסת רצופים, בצירוף בדיקה, דרושים לעקירת וסת קבוע. */
export const CLEARING_TIMES_NEEDED = 3;

/** עומק הבדיקה. קינוח בלבד אינו מועיל לעקירה `[שט מ"א | עמ' 182]`. */
export const CHECK_DEPTH = { DEEP: 'deep', WIPE: 'wipe' };

export const CHECK_DEPTH_LABELS = {
    deep: 'בדיקה כדין (עומק ובחו"ס)',
    wipe: 'קינוח בלבד'
};

/**
 * חלקי העונה שבהם נעשתה הבדיקה.
 *
 * A3 — הספר מלמד שלכתחילה בודקת **פעמיים** בעונת הפרישה: "בעונת היום עם הקימה
 * וסמוך לשקיעה, ובעונת הלילה סמוך לשקיעה ולפני השינה" `[שט ל' | עמ' 77]`, ועיקר
 * הדין בפעם אחת. שני חלקי העונה לכל עונה מוגדרים כאן, ומהם נגזרת רשימת הבדיקות
 * שתועדו על אותו יום: הבדיקה השנייה נרשמת בזכות עצמה, עם החלק שבו נעשתה — ולכן
 * היא מוצגת בלוח ובפאנל, ולא נבלעת בשדה אחד.
 */
export const CHECK_PARTS = {
    day: [
        { code: 'rise', label: 'עם הקימה' },
        { code: 'sunset', label: 'סמוך לשקיעה' }
    ],
    night: [
        { code: 'sunset', label: 'סמוך לשקיעה' },
        { code: 'bedtime', label: 'לפני השינה' }
    ]
};

/** כל חלקי העונה (לשני העונות) — לחיפוש תווית אחר קוד. */
export const ALL_CHECK_PARTS = CHECK_PARTS.day.concat(
    CHECK_PARTS.night.filter(p => !CHECK_PARTS.day.some(d => d.code === p.code))
);

/** האם הקוד הוא חלק עונה מוכר. */
export function isCheckPart(code) {
    return ALL_CHECK_PARTS.some(p => p.code === code);
}

/** תווי חלקי הבדיקה, לפי הסדר שבו הן מוצגות. */
export function checkPartLabel(code) {
    const found = ALL_CHECK_PARTS.find(p => p.code === code);
    return found ? found.label : String(code);
}

/**
 * חלקי הבדיקה שנשמרו על רשומת בדיקה, מנורמלים (קודים מוכרים, בלא כפילויות).
 * קוד שאינו מוכר נשמר — תיעוד שהוזן אינו נמחק בשקט.
 */
export function checkPartsOf(entry) {
    if (!entry || !Array.isArray(entry.checkParts)) return [];
    const out = [];
    entry.checkParts.forEach(code => {
        if (typeof code === 'string' && code && out.indexOf(code) === -1) out.push(code);
    });
    return out;
}

/** כמה בדיקות תועדו בעונה: אחת, אלא אם נשמרה בדיקה שנייה (A3). */
export function checkCountOf(entry) {
    if (!entry || entry.type !== 'check') return 0;
    const parts = checkPartsOf(entry);
    if (parts.length) return parts.length;
    return entry.twice === true ? 2 : 1;
}

/**
 * מניין הימים שצריך לעבור בלא ראייה כדי לעקור וסת הפלגה — "שלש עונות", כאשר יום
 * הראייה עולה לכאן ולכאן: `span * 3 - 2` `[שט מ"א | עמ' 183]`.
 */
export function periodsToClear(span) {
    return span * 3 - 2;
}

/**
 * אוספת את רשומות הבדיקה מתוך ה-db.
 *
 * בדיקה שתועדה **פעמיים בעונה** (A3) מניבה רשומה לכל חלק — עם `part` שמציין את
 * החלק שבו נעשתה. המנוע אינו נזקק לחלקים (בדיקה כדין היא בדיקה כדין), אבל הרשומות
 * נפרדות כדי שהתיעוד ישקף מה שנעשה, ולא ייבלע בשדה אחד.
 *
 * @param {Object} db
 * @returns {Array<{abs: number, ona: string, depth: string, part?: string}>}
 */
export function extractChecks(db) {
    const checks = [];
    Object.keys(db || {}).map(Number).sort((a, b) => a - b).forEach(abs => {
        const entry = db[abs];
        if (!entry || entry.type !== 'check') return;
        const ona = entry.ona === 'night' ? 'night' : 'day';
        const depth = entry.depth === 'wipe' ? CHECK_DEPTH.WIPE : CHECK_DEPTH.DEEP;
        // A3 — בדיקה שנעשתה פעמיים בעונה נכתבת כשני חלקים, וכל חלק נחשב רשומת
        // בדיקה בפני עצמה. כך הבדיקה השנייה אינה נבלעת בשדה "פעמיים" גרידא,
        // והיא נושאת את החלק שבו נעשתה.
        const parts = checkPartsOf(entry);
        if (parts.length) {
            parts.forEach(part => checks.push({ abs, ona, depth, part }));
            return;
        }
        checks.push({ abs, ona, depth });
    });
    return checks;
}

/**
 * האם יש בדיקה שמכסה עונת וסת מסוימת.
 *
 * בדיקה מכסה זמן וסת אם היא נעשתה **בו ביום או אחריו**, לפני זמן הוסת הבא של אותה
 * וסת, ובלבד **שלא הייתה ראייה בינתיים** — שאם ראתה, הבדיקה שאחריה אינה מבררת את
 * הזמן שעבר. בדיקה שנעשתה באותו תאריך נדרשת להיות באותה עונה; בדיקה שנעשתה לאחר
 * מכן מועילה ממילא `[שט מ"א | עמ' 183]`.
 *
 * @param {{abs: number, ona: string}} due
 * @param {Array<{abs: number, ona: string, depth: string}>} checks
 * @param {number} nextDueAbs - זמן הוסת הבא של אותה וסת (או Infinity)
 * @param {Set<number>} sightingAbs
 * @param {boolean} [requireSameDay] - מחלוקת הבדיקה באיחור: כשזה true — בדיקה
 *        שנעשתה אחרי יום הוסת אינה מכסה אותו, ונדרשת בדיקה **בזמנה**. זו שיטת
 *        החולקים שהזכיר הספר `[שט מ"א | עמ' 182–183]`, והיא נשלטת במתג חומרא
 *        `lateBedika` (ברירת המחדל — הבדיקה המאוחרת מועילה, כהב"י).
 * @returns {Object|null}
 */
function findCoveringCheck(due, checks, nextDueAbs, sightingAbs, requireSameDay) {
    for (const check of checks) {
        if (check.depth !== CHECK_DEPTH.DEEP) continue;
        if (check.abs < due.abs) continue;
        if (check.abs >= nextDueAbs) break;
        // החומרא: אין בדיקה מועילה אלא זו שנעשתה בזמנה (אותו יום).
        if (requireSameDay === true && check.abs !== due.abs) continue;
        if (check.abs === due.abs && check.ona !== due.ona) continue;
        let interrupted = false;
        for (let abs = due.abs + 1; abs <= check.abs; abs++) {
            if (sightingAbs.has(abs)) { interrupted = true; break; }
        }
        if (!interrupted) return check;
    }
    return null;
}

/**
 * מריצה את מניין הבדיקות על זמני הוסת של וסת קבוע.
 *
 * "ג' פעמים" נקראים כאן **רצופים**: זמן וסת שנכשל (ראתה בו, או עבר בלי בדיקה)
 * מאפס את המניין. זו הקריאה הפשוטה של "עקירה שלש פעמים", והיא גם הצד הזהיר —
 * היא אינה עוקרת וסת בקלות.
 *
 * @returns {{statuses: Array, clearedAtAbs: number|null, clearedCount: number}}
 */
/**
 * ראיות טבעיות בלבד — כלומר בלי ראיות שסומנו כמחמת כדורים.
 * זו ההבחנה שמעכבת את עקירת הוסת של בעלת הכדורים `[ד"ט | עמ' 8]`.
 */
function naturalSightings(list, isPillSighting) {
    return (list || []).filter(r => !isPillSighting(r));
}

/**
 * האם זמן הוסת עבר עם **כתם** במקום ראייה.
 *
 * זו מחלוקת הפוסקים שהספר מביא `[שט ל"ה | עמ' 127–128]`: "והכתם כמי שאינו לענין וסתות"
 * (כהפרישה והגרעק"א) — שכן "אין אומרים שמה שמצאה כתם שלש פעמים... יהיה כעקירת
 * הוסת הראשון"; ולעומתם "והשערי טוהר באופן אחר... **נחשב עקירת הוסת**".
 *
 * לכן הסימון `stain` אינו סוג ראייה ואינו נספר לעולם לקיבוע (ראו `js/calculations.js`),
 * ורק במתג `stainUproots` הוא נחשב עקירה — ואז הוא ממלא את מקום הבדיקה במניין
 * השלוש. ברירת המחדל נשארת כהפרישה, שהיא לשון הספר "כמי שאינו".
 */
function evaluateDueTimes(dueTimes, checks, sightingAbs, today, requireSameDay, stainAbs, stainUproots) {
    const statuses = [];
    let clearedCount = 0;
    // The uprooting happened the first time the count reached three - a LATER
    // sighting in the old pattern does not undo it (that is the return dispute,
    // which is reported separately).
    let clearedAtAbs = null;
    const stains = stainAbs || new Set();

    for (let i = 0; i < dueTimes.length; i++) {
        const due = dueTimes[i];
        const nextAbs = i + 1 < dueTimes.length ? dueTimes[i + 1].abs : Infinity;

        if (sightingAbs.has(due.abs)) {
            statuses.push(Object.assign({}, due, { status: 'seen' }));
            clearedCount = 0;
            continue;
        }

        if (due.abs >= today) {
            // היום הזה עוד לא תם — אי אפשר לדעת אם עונה זו עברה.
            statuses.push(Object.assign({}, due, { status: 'upcoming' }));
            break;
        }

        // מתג `stainUproots` — דעת שערי טוהר: כתם שנמצא בזמן הוסת נחשב עקירה.
        if (stainUproots === true && stains.has(due.abs)) {
            clearedCount++;
            if (clearedCount >= CLEARING_TIMES_NEEDED && clearedAtAbs === null) clearedAtAbs = due.abs;
            statuses.push(Object.assign({}, due, { status: 'stain', stainAbs: due.abs }));
            continue;
        }

        const check = findCoveringCheck(due, checks, nextAbs, sightingAbs, requireSameDay);
        if (check) {
            clearedCount++;
            if (clearedCount >= CLEARING_TIMES_NEEDED && clearedAtAbs === null) clearedAtAbs = due.abs;
            statuses.push(Object.assign({}, due, { status: 'checked', checkAbs: check.abs }));
        } else {
            clearedCount = 0;
            statuses.push(Object.assign({}, due, { status: 'pending' }));
        }
    }

    return { statuses, clearedAtAbs, clearedCount };
}

/**
 * הראיות שתואמות את התבנית של וסת שנעקר, מן המועד שבו נעקר והלאה.
 * הן אלה שיוצרות את שאלת **החזרת הוסת** (מחלוקת `[שט מ"א | עמ' 183]`).
 */
function sightingsMatchingVeset(veset, reiyot, sinceAbs, isPillSighting) {
    const counted = (reiyot || []).filter(r => r.counted !== false && !isPillSighting(r));
    const out = [];

    if (veset.kind === 'month') {
        counted.forEach(r => {
            if (r.abs > sinceAbs && r.hdate.getDate() === veset.dayOfMonth && r.ona === veset.ona) {
                out.push(r.abs);
            }
        });
        return out;
    }

    // וסת השבוע — תואמת את התבנית ביום בשבוע שבו נקבעה `[שט ל"ו | עמ' 137]`.
    if (veset.kind === 'week') {
        counted.forEach(r => {
            if (r.abs > sinceAbs && r.hdate.getDay() === veset.weekday && r.ona === veset.ona) {
                out.push(r.abs);
            }
        });
        return out;
    }

    // וסת הדילוג — תואמת את התבנית ביום החודש שהיא קובעת לאותו חודש
    // (`js/vesetDilug.js`). יום שנפל על אותו יום בחודש שבתורו במחזור.
    if (veset.kind === 'dilug') {
        const cycle = veset.cycle || [];
        if (!cycle.length) return out;
        counted.forEach(r => {
            if (r.abs <= sinceAbs || r.ona !== veset.ona) return;
            if (cycle.indexOf(r.hdate.getDate()) !== -1) out.push(r.abs);
        });
        return out;
    }

    // וסת לימים המתחלפים — תואמת את שני הימים שבהם נקבעה `[שט ל"ב | עמ' 107–108]`.
    if (veset.kind === 'mevucha') {
        const days = veset.days || [];
        counted.forEach(r => {
            if (r.abs > sinceAbs && days.indexOf(r.hdate.getDate()) !== -1 && r.ona === veset.ona) {
                out.push(r.abs);
            }
        });
        return out;
    }

    for (let i = 1; i < counted.length; i++) {
        const gap = counted[i].abs - counted[i - 1].abs;
        if (counted[i].abs > sinceAbs && gap === veset.span && counted[i].ona === veset.ona) {
            out.push(counted[i].abs);
        }
    }
    return out;
}

/**
 * מנתחת את כל הוסתות שנקבעו ומוציאה מהן את אלה שנעקרו.
 *
 * @param {Object} params
 * @param {Array} params.reiyot - כל הראיות (עם `counted` ממנוע החזקה)
 * @param {Array} params.established - הוסתות שנקבעו (מ-`analyzeChazaka`)
 * @param {Object|null} params.lastCounted - הראייה שממנה נספרת הוסת
 * @param {Array} params.checks - רשומות בדיקה (`extractChecks`)
 * @param {number} params.today - היום (abs) שלפיו נבחנת עקירה
 * @param {Function} params.project - מחזירה את זמני הוסת של וסת (להזרקה: הנדסת תלויות)
 * @param {Function} [params.anchorOf] - העוגן של וסת מסוימת, כשזו אינה הראייה
 *        האחרונה: וסת שחזרה מן הסילוק מעוגנת בתום הסילוק (js/silekReturn.js).
 *        בלא עוגן — נפילה חזרה ל-`lastCounted`, שהיא ההתנהגות הקודמת בדיוק.
 * @param {Function} [params.pillsDays] - כמה ימים מתוך טווח נכללו בנטילת כדורים
 * @param {Function} [params.isPillSighting] - האם הראייה סומנה כמחמת כדורים
 * @param {boolean} [params.lateBedika] - האם בדיקה שנעשתה באיחור מועילה (מחלוקת
 *        הב"י והחוות דעת). ברירת המחדל — מועילה; כבוי = נדרשת בדיקה בזמן הוסת.
 * @param {Set<number>} [params.stainAbs] - הימים שסומנו בהם "מצאתי כתם"
 *        (`js/dayMarks.js`)
 * @param {boolean} [params.stainUproots] - האם כתם שנמצא בזמן הוסת נחשב עקירה
 *        (דעת שערי טוהר; מחלוקת `[שט ל"ה | עמ' 127–128]`, מתג `stainUproots`).
 * @returns {{
 *   fixed: Array, active: Array, uprooted: Array,
 *   pendingChecks: Array, returnDispute: Array
 * }}
 */
export function analyzeAkirot({ reiyot, established, lastCounted, checks, today, project, anchorOf, pillsDays, isPillSighting, lateBedika, stainAbs, stainUproots }) {
    const requireSameDay = lateBedika === false;
    const list = reiyot || [];
    const pillSighting = typeof isPillSighting === 'function' ? isPillSighting : () => false;
    const pillDaysIn = typeof pillsDays === 'function' ? pillsDays : () => 0;
    const sightingAbs = new Set(list.map(r => r.abs));
    const sortedChecks = (checks || []).slice().sort((a, b) => a.abs - b.abs);
    const hasSightingAfter = (abs) => naturalSightings(list, pillSighting).some(r => r.abs > abs);

    const fixed = [];
    const returnDispute = [];

    (established || []).forEach(veset => {
        // העוגן של הוסת: וסת שחזרה מן הסילוק נמדדת מתום הסילוק והלאה, ולא מן
        // הראייה שמכוחה נקבעה במקור.
        const anchor = (typeof anchorOf === 'function' ? anchorOf(veset) : null) || lastCounted;
        const dueTimes = anchor
            ? (project(veset, anchor) || []).map(e => ({ abs: e.abs, ona: e.ona, code: e.code }))
            : [];
        const { statuses, clearedAtAbs: checkedAtAbs, clearedCount } = evaluateDueTimes(
            dueTimes, sortedChecks, sightingAbs, today, requireSameDay, stainAbs, stainUproots);

        // עקירת וסת הפלגה במניין הימים — מסלול עצמאי, שאינו תלוי בבדיקות, מפני
        // שההפלגה עצמה היא הראיה (`[שט מ"א | עמ' 183]`). הוא נבחן רק כשעבר המניין
        // בלא שראתה; אם ראתה — ההפלגות שהשתנו הן שמכריעות, ומנוע החזקה כבר רואה אותן.
        //
        // ובעלת הכדורים: ימי נטילתם אינם נמנים למניין, "כיון שלא עקרה וסתה כיון
        // שניכר בבירור שהפלגתה הארוכה מחמת הכדורים" `[ד"ט | עמ' 8]`.
        let interval = null;
        if (veset.kind === 'haflagah' && anchor && !hasSightingAfter(anchor.abs)) {
            const needed = periodsToClear(veset.span);
            const elapsed = today - anchor.abs;
            const skipped = Math.min(elapsed, Math.max(0, pillDaysIn(anchor.abs + 1, today)));
            const passed = elapsed - skipped;
            interval = { needed, passed, elapsed, skipped, met: passed >= needed };
        }

        let clearedBy = null;
        let clearedAtAbs = checkedAtAbs;
        if (checkedAtAbs !== null) {
            clearedBy = 'checks';
        } else if (interval && interval.met) {
            clearedBy = 'interval';
            clearedAtAbs = anchor.abs + interval.needed;
        }

        fixed.push({
            veset,
            cleared: clearedBy !== null,
            clearedBy,
            clearedAtAbs,
            clearedCount,
            needed: CLEARING_TIMES_NEEDED,
            interval,
            dueTimes: statuses,
            pending: statuses.filter(s => s.status === 'pending'),
            nextDue: (statuses.find(s => s.status === 'upcoming') || {}).abs || null
        });

        if (clearedBy !== null) {
            // "ואלא אם תחזור ותראה שוב בהפלגת עשרים, שחזר הוסת למקומו" — והש"ך נחלק.
            // אינה מוכרעת כאן: אם תראה שלוש פעמים, מנוע החזקה יקבע אותה מחדש כדין.
            const matching = sightingsMatchingVeset(veset, list, clearedAtAbs, pillSighting);
            if (matching.length > 0 && matching.length < CLEARING_TIMES_NEEDED) {
                returnDispute.push({ veset, sightings: matching, clearedAtAbs });
            }
        }
    });

    return {
        fixed,
        active: fixed.filter(f => !f.cleared),
        uprooted: fixed.filter(f => f.cleared),
        pendingChecks: pendingFromFixed(fixed),
        returnDispute
    };
}

/**
 * זמני וסת קבועים שעברו בלי בדיקה כדין — "אסורה לבעלה עד שתבדק" `[שט כ"ד | עמ' 7]`.
 */
function pendingFromFixed(fixed) {
    const out = [];
    fixed.filter(f => !f.cleared).forEach(f => {
        f.pending.forEach(p => {
            out.push({
                abs: p.abs,
                ona: p.ona,
                code: p.code,
                reason: `עבר זמן הוסת הקבועה (${p.code}) ולא נבדקה בדיקה כדין — יש לבדוק, שכן בלא בדיקה לא נעקר הוסת והאישה אסורה לבעלה עד שתבדק`
            });
        });
    });
    return out;
}

/**
 * האם חשש שאינו קבוע נעקר.
 *
 * "עונת וסת שאינו קבוע שעברה ולא ראתה בה — נעקרה מיד" `[שט ל"ג | עמ' 111]`.
 * לכן חשש שזמנו עבר ואין עליו ראייה אינו נחשב עוד לחובה. התאריך **אינו נמחק** מן
 * הלוח — הוא נשאר כתיעוד ומסומן כנעקר (ראו `js/calculations.js`).
 *
 * @param {{abs: number}} concern
 * @param {Array} reiyot
 * @param {number} today
 */
export function isConcernUprooted(concern, reiyot, today) {
    if (concern.abs >= today) return false;      // הזמן עוד לא עבר במלואו
    return !(reiyot || []).some(r => r.abs === concern.abs);
}

/**
 * האם זמן וסת **נברר** על ידי בדיקה כדין.
 *
 * זו השאלה שמפרידה בין "עבר הזמן ולא ראתה" — שהוא לבדו סיבת עקירה לוסת שאינו
 * קבוע `[שט ל"ג | עמ' 111]` — לבין הצד החולק, שאינו נעקר בלא בדיקה "שאין הוסת
 * נעקר אלא כשבדקה ולא ראתה" `[שט מ"א | עמ' 182]`. נחשפת למי שדורש את החומרא
 * (מתג `checkUprootNonFixed`, `js/stringencies.js`).
 *
 * @param {Object} prishotMap - כל החששות, לקביעת זמן הוסת הבא של אותה חזקה
 * @param {{abs: number, ona: string, code: string}} concern
 * @param {Array} reiyot
 * @param {Array} checks
 */
export function isConcernClarified(prishotMap, concern, reiyot, checks, options) {
    const requireSameDay = !!(options && options.lateBedika === false);
    const sightingAbs = new Set((reiyot || []).map(r => r.abs));
    const sortedChecks = (checks || []).slice().sort((a, b) => a.abs - b.abs);
    const sameCode = [];
    Object.keys(prishotMap || {}).map(Number).sort((a, b) => a - b).forEach(abs => {
        (prishotMap[abs] || []).forEach(p => {
            if (p.code === concern.code) sameCode.push(abs);
        });
    });
    const nextAbs = sameCode.find(a => a > concern.abs);
    return !!findCoveringCheck(
        { abs: concern.abs, ona: concern.ona }, sortedChecks,
        nextAbs === undefined ? Infinity : nextAbs, sightingAbs, requireSameDay);
}

/**
 * זמני וסת שאינם קבועים שעברו בלי בדיקה כדין.
 *
 * אותם זמנים **נעקרו** (ואין עליהם עוד חובה), אבל כל עוד לא נבדקה לא נברר שלא
 * ראתה — ולכן הדין נותר: אסורה לבעלה עד שתבדוק `[שט כ"ד | עמ' 7]`.
 *
 * @param {Object} prishotMap - החששות שנוהגים בפועל (אחרי החלפה ועקירה)
 * @param {Array} reiyot
 * @param {Array} checks
 * @param {number} today
 * @returns {Array<{abs: number, ona: string, code: string, reason: string}>}
 */
export function findPendingChecks(prishotMap, reiyot, checks, today, options) {
    const requireSameDay = !!(options && options.lateBedika === false);
    const sightingAbs = new Set((reiyot || []).map(r => r.abs));
    const sortedChecks = (checks || []).slice().sort((a, b) => a.abs - b.abs);
    const seen = new Set();
    const out = [];

    // זמן הוסת הבא של אותה חזקה — בדיקה אחריו כבר שייכת לזמן שאחריו ולא לזה שלפנינו.
    const byCode = {};
    Object.keys(prishotMap || {}).map(Number).sort((a, b) => a - b).forEach(abs => {
        (prishotMap[abs] || []).forEach(p => {
            if (!byCode[p.code]) byCode[p.code] = [];
            byCode[p.code].push(abs);
        });
    });

    Object.keys(prishotMap || {}).map(Number).sort((a, b) => a - b).forEach(abs => {
        if (abs >= today) return;
        if (sightingAbs.has(abs)) return;

        (prishotMap[abs] || []).forEach(p => {
            const key = abs + '|' + p.ona;
            if (seen.has(key)) return;
            const sameCode = byCode[p.code] || [];
            const nextAbs = sameCode.find(a => a > abs);
            if (findCoveringCheck({ abs, ona: p.ona }, sortedChecks, nextAbs === undefined ? Infinity : nextAbs, sightingAbs, requireSameDay)) return;
            seen.add(key);
            out.push({
                abs,
                ona: p.ona,
                code: p.code,
                reason: `עבר זמן הוסת (${p.reason}) ולא נבדקה בדיקה כדין — יש לבדוק, שכן בלא בדיקה לא נברר שלא ראתה`
            });
        });
    });

    return out;
}
