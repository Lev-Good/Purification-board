import { HDate } from '../hebcal.js';

/**
 * Helper to check if a year is leap in the Hebrew calendar.
 */
export function getMonthsInYear(year) {
    return HDate.isLeapYear(year) ? 13 : 12;
}

/**
 * Add a separation retirement event to the prishot object.
 */
function addPrishah(prishotObj, absDay, reason, onaType, codeAbbr) {
    if (!prishotObj[absDay]) {
        prishotObj[absDay] = [];
    }
    // Prevent duplicate entries for the same reason and ona
    const alreadyExists = prishotObj[absDay].some(p => p.code === codeAbbr && p.ona === onaType);
    if (!alreadyExists) {
        prishotObj[absDay].push({ reason: reason, ona: onaType, code: codeAbbr });
    }
}

/**
 * Apply the Or Zarua custom (retirement one shift before the expected separation).
 */
function applyOrZarua(prishotObj, baseAbs, baseOna, reasonDesc) {
    if (baseOna === 'day') {
        // One shift before Day of day X is Night of day X
        addPrishah(prishotObj, baseAbs, reasonDesc, 'night', 'עוא"ז');
    } else {
        // One shift before Night of day X is Day of day X-1
        addPrishah(prishotObj, baseAbs - 1, reasonDesc, 'day', 'עוא"ז');
    }
}

/**
 * The core calculation engine of the Purification Board.
 * @param {Object} db - The user's database from localStorage.
 * @param {boolean} isOrZaruaEnabled - Whether Or Zarua custom is enabled.
 * @returns {Object} An object containing the computed dates (nekiim, tevilot, prishot) and the list of reiyot.
 */
export function calculateEngine(db, isOrZaruaEnabled) {
    let computed = { nekiim: [], tevilot: [], prishot: {} };
    let absDays = Object.keys(db).map(Number).sort((a, b) => a - b);
    let reiyot = [];

    // Extract all bleeding events (reiyah) in chronological order
    absDays.forEach(day => {
        if (db[day] && db[day].type === 'reiyah') {
            reiyot.push({ 
                abs: day, 
                ona: db[day].ona, 
                hdate: new HDate(day) 
            });
        }
    });

    // 1. Calculate Retirement Days (Beinonit, Yom Hachodesh, Haflagah, Or Zarua)
    for (let i = 0; i < reiyot.length; i++) {
        let current = reiyot[i];
        let onaText = current.ona === 'day' ? 'עונת יום' : 'עונת לילה';
        
        // --- Ona Beinonit (Day 30) ---
        let beinonitAbs = current.abs + 29;
        addPrishah(computed.prishot, beinonitAbs, `עונה בינונית (${onaText})`, current.ona, 'עו"ב');
        if (isOrZaruaEnabled) {
            applyOrZarua(computed.prishot, beinonitAbs, current.ona, `אור זרוע לעונה בינונית`);
        }

        // --- Yom Hachodesh (Same Hebrew day in next month) ---
        let maxMonths = getMonthsInYear(current.hdate.getFullYear());
        let nextMonth = current.hdate.getMonth() === maxMonths ? 1 : current.hdate.getMonth() + 1;
        let nextYear = current.hdate.getMonth() === maxMonths ? current.hdate.getFullYear() + 1 : current.hdate.getFullYear();
        try {
            // Checks if the Hebrew day exists in the next month (e.g. 30th day doesn't exist in 29-day months)
            let yomHachodesh = new HDate(current.hdate.getDate(), nextMonth, nextYear);
            addPrishah(computed.prishot, yomHachodesh.abs(), `יום החודש (${onaText})`, current.ona, 'יו"ח');
            if (isOrZaruaEnabled) {
                applyOrZarua(computed.prishot, yomHachodesh.abs(), current.ona, `אור זרוע ליום החודש`);
            }
        } catch (e) {
            // Day doesn't exist in the next month, so no Yom Hachodesh is calculated for this month
        }

        // --- Haflagah (Days interval since previous bleeding) ---
        if (i > 0) {
            let prev = reiyot[i - 1];
            let diff = current.abs - prev.abs;
            let nextHaflagahAbs = current.abs + diff;
            
            addPrishah(computed.prishot, nextHaflagahAbs, `הפלגה (${diff} ימים, ${onaText})`, current.ona, 'עו"ה');
            if (isOrZaruaEnabled) {
                applyOrZarua(computed.prishot, nextHaflagahAbs, current.ona, `אור זרוע לעונת הפלגה`);
            }
            
            current.haflagahDiff = diff;
            current.nextHaflagahDate = new HDate(nextHaflagahAbs);
        }
    }

    // 2. Calculate Hefsek Taharah and 7 Clean Days (Nekiim)
    let hefsekim = absDays.filter(day => db[day] && db[day].type === 'hefsek');

    hefsekim.forEach(hefsekAbs => {
        // Check if there is any interrupting event (reiyah or another hefsek) during the 7 clean days (hefsekAbs < day <= hefsekAbs + 7)
        let isInterrupted = absDays.some(day => 
            db[day] && 
            (db[day].type === 'reiyah' || db[day].type === 'hefsek') && 
            day > hefsekAbs && 
            day <= hefsekAbs + 7
        );

        if (isInterrupted) {
            return; // Skip this hefsek entirely as it was canceled/invalidated
        }

        // Mark 7 Clean Days (Nekiim)
        for (let i = 1; i <= 7; i++) {
            computed.nekiim.push(hefsekAbs + i);
        }

        // 3. Expected Mikvah Immersion Date (7 days after Hefsek)
        let expectedTevilah = hefsekAbs + 7;
        
        // Find if there is a manually recorded tevilah (immersion) on or after the expected day (before any subsequent reiyah/hefsek)
        let nextInterrupt = absDays.find(day => 
            db[day] && 
            (db[day].type === 'reiyah' || db[day].type === 'hefsek') && 
            day > hefsekAbs + 7
        );
        
        let manualTevilah = absDays.find(day => 
            db[day] && 
            db[day].type === 'tevilah' && 
            day > hefsekAbs && 
            (!nextInterrupt || day < nextInterrupt)
        );
        
        // Expected tevilah is marked unless there is a manual record
        computed.tevilot.push(manualTevilah ? manualTevilah : expectedTevilah);
    });

    return { computed, reiyot };
}
