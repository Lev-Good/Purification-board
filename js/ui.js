import { HDate } from '../hebcal.js';
import { getMonthsInYear, shiftHebrewMonth, getYomHachodeshInfo } from './calculations.js';
import { describeVeset, hebDayOfMonth } from './chazaka.js';
import { lifeStateSummary } from './lifeState.js';
import { pauseDayLabel, PILL_PAUSE_RULES } from './pillPause.js';
import { checkPartsOf, checkPartLabel } from './akira.js';
import { bodySignLabel, bodyReminder } from './vesetGuf.js';
import { DAY_MARKS, DAY_MARK_RULES, marksOf } from './dayMarks.js';
import { ICONS } from './icons.js';
import { getSavedLocation } from './storage.js';
import { locationById, effectiveTodayAbs, elapsedOnotOf } from './zmanim.js';

/**
 * המיקום השמור, אם יש. בסביבת בדיקות (Node, בלי `localStorage` גלובלי)
 * `getSavedLocation` זורק — וזה עצמו שקול ל"אין מיקום": בלי נתון לבדוק מולו,
 * ההתנהגות חוזרת בדיוק למה שהיתה (חצות אזרחי, בלי סינון עונה שחלפה).
 */
function currentLocation() {
    try {
        return locationById(getSavedLocation());
    } catch (e) {
        return null;
    }
}

/** "היום" לפי שקיעה ולא לפי חצות אזרחי (`js/zmanim.js`) — ראו `js/app.js: currentTodayAbs`. */
function currentTodayAbs() {
    return effectiveTodayAbs(currentLocation());
}

const HEB_DAYS = ["", "א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ז'", "ח'", "ט'", "י'", "י\"א", "י\"ב", "י\"ג", "י\"ד", "ט\"ו", "ט\"ז", "י\"ז", "י\"ח", "י\"ט", "כ'", "כ\"א", "כ\"ב", "כ\"ג", "כ\"ד", "כ\"ה", "כ\"ו", "כ\"ז", "כ\"ח", "כ\"ט", "ל'"];

const HEB_DAYS_CLEAN = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט", "י", "יא", "יב", "יג", "יד", "טו", "טז", "יז", "יח", "יט", "כ", "כא", "כב", "כג", "כד", "כה", "כו", "כז", "כח", "כט", "ל"];

const HEBREW_MONTHS_NAMES = {
    'Nisan': 'ניסן', 'Iyyar': 'אייר', 'Sivan': 'סיוון', 'Tamuz': 'תמוז', 'Av': 'אב', 'Elul': 'אלול', 
    'Tishrei': 'תשרי', 'Cheshvan': 'חשוון', 'Kislev': 'כסלו', 'Tevet': 'טבת', 'Shvat': 'שבט', 'Sh\'vat': 'שבט',
    'Adar I': 'אדר א׳', 'Adar II': 'אדר ב׳', 'Adar': 'אדר'
};

export function translateMonth(monthName) { 
    return HEBREW_MONTHS_NAMES[monthName] || monthName; 
}

/**
 * Handle tab changing for both Desktop sidebar and Mobile bottom navigation.
 */
export function switchView(viewId, activeTabId) {
    document.querySelectorAll('.section-container').forEach(el => el.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');

    document.querySelectorAll('.bottom-nav .nav-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.top-actions button').forEach(el => el.classList.remove('active-tab'));

    // כלי הניווט בלוח (חצי חודש, דשבורדים) שייכים ללשונית "לוח שנה" בלבד —
    // ומוסתרים בכל לשונית אחרת (ר' css/style.css: .calendar-only-panel).
    document.body.classList.toggle('calendar-view-active', viewId === 'view-calendar');

    if (viewId === 'view-calendar') {
        const mob = document.getElementById('nav-cal');
        const dsk = document.getElementById('desktop-nav-cal');
        if (mob) mob.classList.add('active');
        if (dsk) dsk.classList.add('active-tab');
    } else if (viewId === 'view-table') {
        const mob = document.getElementById('nav-table');
        const dsk = document.getElementById('desktop-nav-table');
        if (mob) mob.classList.add('active');
        if (dsk) dsk.classList.add('active-tab');
    } else if (viewId === 'view-about') {
        const mob = document.getElementById('nav-about');
        const dsk = document.getElementById('desktop-nav-about');
        if (mob) mob.classList.add('active');
        if (dsk) dsk.classList.add('active-tab');
    } else if (viewId === 'view-guide') {
        const mob = document.getElementById('nav-guide');
        const dsk = document.getElementById('desktop-nav-guide');
        if (mob) mob.classList.add('active');
        if (dsk) dsk.classList.add('active-tab');
    } else if (viewId === 'view-settings') {
        const mob = document.getElementById('nav-settings');
        const dsk = document.getElementById('desktop-nav-settings');
        if (mob) mob.classList.add('active');
        if (dsk) dsk.classList.add('active-tab');
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Initialize Jump Month/Year dropdown lists.
 */
export function initJumpMenu(currentHDate, onMonthYearChange) {
    const yearSelects = [document.getElementById('jump-year'), document.getElementById('mobile-jump-year')];
    const currentYear = new HDate().getFullYear();
    
    yearSelects.forEach(yearSelect => {
        if (!yearSelect) return;
        yearSelect.innerHTML = '';
        for (let y = currentYear - 5; y <= currentYear + 5; y++) {
            let opt = document.createElement('option');
            opt.value = y;
            opt.text = new HDate(1, 1, y).renderGematriya().split(' ').pop();
            if (y === currentHDate.getFullYear()) {
                opt.selected = true;
            }
            yearSelect.appendChild(opt);
        }
        yearSelect.onchange = () => {
            updateMonthList(parseInt(yearSelect.value), currentHDate);
            onMonthYearChange();
        };
    });
    
    updateMonthList(currentHDate.getFullYear(), currentHDate);
}

/**
 * Update the month selection list based on Hebrew calendar leap years.
 */
export function updateMonthList(year, currentHDate) {
    const monthSelects = [document.getElementById('jump-month'), document.getElementById('mobile-jump-month')];
    const monthsCount = getMonthsInYear(year);
    
    monthSelects.forEach(monthSelect => {
        if (!monthSelect) return;
        monthSelect.innerHTML = '';
        for (let m = 1; m <= monthsCount; m++) {
            let opt = document.createElement('option');
            opt.value = m;
            opt.text = translateMonth(new HDate(1, m, year).getMonthName());
            if (m === currentHDate.getMonth()) {
                opt.selected = true;
            }
            monthSelect.appendChild(opt);
        }
    });
}

/**
 * Sync jump selectors with current calendar date.
 */
export function syncSelectors(currentHDate) {
    const years = ['jump-year', 'mobile-jump-year'];
    const months = ['jump-month', 'mobile-jump-month'];
    
    years.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = currentHDate.getFullYear();
    });
    months.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = currentHDate.getMonth();
    });
}

/**
 * The ordinary daily card: where the current cycle stands, from the last recorded
 * event up to today. The body-veset reminder is added on top of it by
 * `updateDashboard`.
 */
function renderBaseDashboard(dashContainer, db, engineData, todayAbs) {
    dashContainer.className = 'dashboard';

    // 1. Retirement warnings take first priority — but only for an ona that
    // hasn't actually elapsed yet. `todayAbs` itself only advances at sunset
    // (effectiveTodayAbs), so a night-prisha whose sunrise already passed, while
    // still the same todayAbs, is no longer live — it's history, and continuing
    // to flash "today is a prisha ona" for it is a false alarm. Without a saved
    // location there is nothing to check this against, so nothing is filtered —
    // exactly the previous behavior.
    const prishotToday = engineData.computed.prishot[todayAbs];
    const elapsed = elapsedOnotOf(todayAbs, currentLocation(), new Date());
    const list = prishotToday ? prishotToday.filter(p => !elapsed[p.ona]) : null;
    if (list && list.length > 0) {
        const names = [...new Set(list.map(p => p.code))].join(', ');
        dashContainer.innerHTML = `
            <div class="dashboard-text">
                <strong>היום עונת פרישה!</strong> (${names})<br>יש לבדוק את לוח השנה למידע על עונת הפרישה הנוכחית.
            </div>
            <div class="dashboard-progress alert-pulse">${ICONS.ALERT}</div>
        `;
        dashContainer.classList.add('dash-orange');
        return;
    }

    // 2. Fetch history up to today
    let absDays = Object.keys(db).map(Number).filter(d => d <= todayAbs).sort((a, b) => a - b);
    
    if (absDays.length === 0) {
        dashContainer.innerHTML = `
            <div class="empty-state" style="padding: 10px; width:100%;">
                <div class="dashboard-empty-icon" style="color: var(--primary); margin-bottom: 5px;">${ICONS.CALENDAR}</div>
                <strong>היומן שלכם מוכן לשימוש</strong>
                <p>לחצו על תאריך בלוח השנה כדי להזין את תחילת הראייה הראשונה.</p>
            </div>
        `;
        return;
    }

    let latestAbs = absDays[absDays.length - 1];
    let latestEvent = db[latestAbs];
    let percent = 0;
    let progressHtml = '';

    if (latestEvent.type === 'reiyah') {
        let daysSince = (todayAbs - latestAbs) + 1;
        percent = Math.min(100, Math.round((daysSince / 30) * 100));
        progressHtml = `
            <div class="dashboard-progress">
                <span>מחזור: יום ${daysSince}/30</span>
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" style="width: ${percent}%"></div>
                </div>
            </div>
        `;
        
        dashContainer.innerHTML = `
            <div class="dashboard-text">
                <strong>יום ${daysSince} מתחילת הראייה.</strong>
            </div>
            ${progressHtml}
        `;
        dashContainer.classList.add('dash-red');
    } else if (latestEvent.type === 'hefsek') {
        let diff = todayAbs - latestAbs;
        if (diff === 0) {
            dashContainer.innerHTML = `
                <div class="dashboard-text">
                    <strong>בוצע הפסק טהרה היום.</strong> 7 ימים נקיים יתחילו מחר.
                </div>
                <div class="dashboard-progress" style="color: var(--yellow);">${ICONS.SUN_SPARK}</div>
            `;
            dashContainer.classList.add('dash-yellow');
        } else if (diff > 0 && diff <= 7) {
            percent = Math.round((diff / 7) * 100);
            progressHtml = `
                <div class="dashboard-progress">
                    <span>נקיים: יום ${diff}/7</span>
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" style="width: ${percent}%"></div>
                    </div>
                </div>
            `;
            
            dashContainer.innerHTML = `
                <div class="dashboard-text">
                    <strong>יום ${HEB_DAYS[diff]} ל-7 נקיים.</strong> (נותרו ${8 - diff} ימים לטבילה).
                </div>
                ${progressHtml}
            `;
            dashContainer.classList.add('dash-green');
        } else {
            dashContainer.innerHTML = `
                <div class="dashboard-text">
                    <strong>עברו ${diff} ימים מהפסק טהרה.</strong> ממתינה לטבילה במקווה.
                </div>
                <div class="dashboard-progress" style="color: var(--blue);">${ICONS.WAVES}</div>
            `;
            dashContainer.classList.add('dash-blue');
        }
    } else if (latestEvent.type === 'tevilah') {
        let actualNightDate = new HDate(latestAbs + 1);
        dashContainer.innerHTML = `
            <div class="dashboard-text">
                <strong>טבילה אחרונה התבצעה בליל ${actualNightDate.renderGematriya()}.</strong>
            </div>
            <div class="dashboard-progress" style="color: var(--green);">${ICONS.CHECK}</div>
        `;
        dashContainer.classList.add('dash-blue');
    } else if (latestEvent.note) {
        dashContainer.innerHTML = `
            <div class="dashboard-text">
                <strong>נשמרה הערה אישית ביומן לאחרונה.</strong>
            </div>
            <div class="dashboard-progress" style="color: var(--primary);">${ICONS.NOTE}</div>
        `;
    }
}

/**
 * בלוק התזכורת היומית של וסת הגוף (`bodyReminder`).
 *
 * כל שורה נוקבת במקורה, כדי שהמשתמשת תדע **מאין** החובה — ולא תקבל הוראה סתומה.
 * כשהבלוק מצטרף לכרטיס הקיים הוא מסומן כבלוק שני (`appended`), שאחרת שני הבלוקים
 * היו נדחסים זה לצד זה (הכרטיס הוא flex-row).
 */
function buildBodyReminderCard(body, appended = false) {
    const dueItems = (body.dues || []).map(d =>
        `<li>${new HDate(d.abs).renderGematriya()} (${d.code}) — ${d.ona === 'night' ? 'עונת לילה' : 'עונת יום'}</li>`
    ).join('');
    const lines = (body.lines || []).map(line => `<span>${line}</span>`).join('<br>');
    // רשימת המיחושים נכתבת רק כשהיא מוסיפה מידע: במיחוש אחד, השורה עצמה כבר נוקבת
    // בשמו; ואילו בזמן בדיקה שעבר השורות אינן נוקבות בשם המיחוש, ואז הרשימה נדרשת.
    const signList = (body.signs || []).length > 1 || body.level === 'pending'
        ? (body.signs || [])
        : [];

    return `
        <div class="dashboard-text${appended ? ' dashboard-body-reminder' : ''}">
            <strong>${body.title}</strong>
            ${signList.length ? `<br><small>המיחושים שתועדו: ${signList.join(', ')}</small>` : ''}
            ${dueItems ? `<ul style="margin: 8px 18px; padding: 0; line-height: 1.7;">${dueItems}</ul>` : ''}
            ${lines}
            <br><small style="white-space:nowrap;">${body.source}</small>
            <button class="help-dot" data-help="${body.help}" type="button" aria-label="הסבר הלכתי ומקורות">?</button>
        </div>
        ${appended ? '' : `<div class="dashboard-progress alert-pulse">${ICONS.ALERT}</div>`}
    `;
}

/**
 * Update the visual cycle status dashboard.
 *
 * Since B2 the card at the head of the screen also carries the **body-veset
 * reminder** (`bodyReminder` in `js/vesetGuf.js`): a recorded sign is a standing
 * concern, "משעה שבאו המיחושים אסורה כדין שעת הוסת" `[שט ל"ט | עמ' 158]`, and a
 * compound-veset time that passed with no proper check is a prohibition state —
 * "אסורה עד שתבדוק" `[שט ל"ט | עמ' 160]` — which outranks the ordinary card.
 *
 * @param {Object} db
 * @param {Object} engineData
 * @param {number} [todayAbsOverride] - היום שלפיו נבחנת התזכורת (לבדיקות דטרמיניסטיות)
 */
export function updateDashboard(db, engineData, todayAbsOverride) {
    const todayAbs = Number.isFinite(todayAbsOverride) ? todayAbsOverride : currentTodayAbs();
    const dashContainer = document.getElementById('dashboard-container');
    if (!dashContainer) return;

    const body = bodyReminder({
        bodyVeset: engineData.bodyVeset,
        prishot: engineData.computed.prishot,
        pendingChecks: engineData.computed.pendingChecks,
        today: todayAbs
    });

    // 1. חובת בדיקה של וסת הגוף שעברה בלא בירור — קודמת לכל, שהרי "אסורה עד שתבדוק".
    if (body.active && body.level === 'pending') {
        dashContainer.className = 'dashboard dash-red';
        dashContainer.innerHTML = buildBodyReminderCard(body);
        return;
    }

    renderBaseDashboard(dashContainer, db, engineData, todayAbs);

    // 2. המיחוש שתועד אינו שותק: התזכורת מצטרפת לכרטיס היום (וסת מורכבת שהיום
    // זמנה, או מיחוש שעומד ותובע בדיקה כשיופיע).
    if (body.active) {
        dashContainer.innerHTML += buildBodyReminderCard(body, true);
        dashContainer.classList.add('dash-body');
        if (dashContainer.className.replace('dash-body', '').trim() === 'dashboard') {
            dashContainer.classList.add('dash-orange');
        }
    }
}

/**
 * Builds one separation marker for the calendar.
 *
 * Entries whose time has passed and was uprooted are rendered faded: the board
 * stays a faithful record of what applied, without presenting a case that is no
 * longer an obligation `[שט ל"ג | עמ' 111]`.
 */
/**
 * סימון המיחוש הגופני שתועד על הראייה (B2). הסימון מוצג על גבי יום הראייה עצמו,
 * כדי שתיעוד המיחוש יהיה גלוי ולא רק רשומה נסתרת.
 */
function buildSignMarker(entry) {
    const codes = Array.isArray(entry && entry.signs) ? entry.signs : [];
    if (codes.length === 0) return '';
    const labels = codes.map(bodySignLabel).join(', ');
    return `<div class="marker bg-purple" title="מיחוש וסת הגוף: ${labels}">${ICONS.ALERT_CIRCLE}<span>מיחוש</span></div>`;
}

/**
 * סימוני היום (js/dayMarks.js) — כתם, פחד פתאום, חרדה, יציאה לדרך, ליל חופה.
 *
 * הסימון מוצג על גבי היום עצמו מכל סוג רשומה, כדי שתיעוד שאינו "אירוע" לא יהיה
 * רשומה נסתרת. מראה המקום בכל סימון נלקח מן ההגדרה שבמודול — מקור אחד לדין ולניסוח.
 */
function buildDayMarksMarker(entry) {
    const codes = marksOf(entry);
    if (codes.length === 0) return '';
    return codes.map(code => {
        const def = DAY_MARKS.find(m => m.code === code);
        const label = def ? def.label : code;
        const source = def ? def.source : '';
        return `<div class="marker bg-purple" style="background: var(--text-muted);" title="סימון היום: ${label} — ${source}">${ICONS.ALERT_CIRCLE}<span>${label}</span></div>`;
    }).join('');
}

function buildPrishaMarker(list, label) {
    const codeList = [...new Set(list.map(p => p.code))].join(', ');
    const tooltipText = list.map(p => p.reason).join('\n');
    const faded = list.every(p => p.uprooted)
        ? ' style="opacity:0.5; border:1px dashed currentColor;"'
        : '';
    return `<div class="marker bg-orange"${faded} title="${tooltipText}">${ICONS.CLOCK}<span>${label} (${codeList})</span></div>`;
}

/**
 * Builds HTML grid content for a single Hebrew month.
 */
export function buildMonthGridHTML(month, year, db, engineData, isYearly = false) {
    const computed = engineData.computed;
    const todayAbs = currentTodayAbs();
    const daysInMonth = HDate.daysInMonth(month, year);
    const firstDayOfMonth = new HDate(1, month, year);
    const startingDayOfWeek = firstDayOfMonth.greg().getDay(); 
    const fullDateStr = firstDayOfMonth.renderGematriya(); 
    const yearStr = fullDateStr.split(' ').pop(); 
    const titleText = `${translateMonth(firstDayOfMonth.getMonthName())} ${yearStr}`;

    let html = `<div class="month-title-display">${titleText}</div>`;
    html += `<div class="calendar">`;
    
    const headers = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
    headers.forEach(h => {
        html += `<div class="day-header">${h}</div>`;
    });

    // Fill empty cells before start of month
    for (let i = 0; i < startingDayOfWeek; i++) {
        html += `<div></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        let hd = new HDate(day, month, year);
        let abs = hd.abs();
        let greg = hd.greg();
        
        let classes = ["day"];
        let bgStyle = "";
        let topMarkers = "";
        let bottomMarkers = "";
        let noteHTML = "";
        // תקציר קריא לקורא מסך — התא עצמו הוא <div>, ולכן אין לו טקסט מובנה
        // מלבד המספר; כל מה שכבר מנוסח בתגי title כאן נאסף גם לכאן.
        const ariaBits = [];

        if (db[abs]) {
            if (db[abs].note) {
                // הטקסט עצמו לא נכנס לתוך תג HTML: תווים כמו גרשיים בהערה היו שוברים
                // מאפיין title, ו-title ממילא לא אמין במגע. הלחיצה פותחת כרטיסון עם
                // הטקסט המלא (js/app.js: showDayNotePreview), בלי לפתוח גם את יום המשבצת.
                noteHTML = `<span class="note-icon" onclick="event.stopPropagation(); window.showDayNotePreview(${abs})" title="הערה אישית — לחצו לתצוגה מלאה">${ICONS.NOTE}</span>`;
                ariaBits.push('יש הערה אישית');
            }
            if (db[abs].type === 'reiyah') {
                if (db[abs].ona === 'day') {
                    bottomMarkers += `<div class="marker bg-red" title="ראיית יום">${ICONS.FLAG}<span>ראיית יום</span></div>`;
                    ariaBits.push('ראיית יום');
                } else {
                    topMarkers += `<div class="marker bg-red" title="ראיית לילה">${ICONS.FLAG}<span>ראיית לילה</span></div>`;
                    ariaBits.push('ראיית לילה');
                }
                // B2 — המיחוש שתועד על הראייה (וסת הגוף).
                bottomMarkers += buildSignMarker(db[abs]);
            }
            if (db[abs].type === 'hefsek') {
                bottomMarkers += `<div class="marker bg-yellow" title="הפסק טהרה">${ICONS.SUN_SPARK}<span>הפסק טהרה</span></div>`;
                ariaBits.push('הפסק טהרה');
            }
            if (db[abs].type === 'check') {
                // B4: what was checked, and with what result - only a proper check
                // can uproot a veset `[שט מ"א | עמ' 182]`.
                const depthLabel = db[abs].depth === 'wipe' ? 'קינוח בלבד — לא מועיל לעקירה' : 'בדיקה כדין (עומק ובחו"ס)';
                bottomMarkers += `<div class="marker bg-green" title="${depthLabel}">${ICONS.CHECK}<span>בדיקה</span></div>`;
                ariaBits.push('בדיקה');
                // A3 — הבדיקה השנייה שבעונה מוצגת בסימון משלה, ולא נבלעת בשדה אחד.
                const checkParts = checkPartsOf(db[abs]);
                if (checkParts.length > 1) {
                    const partsText = checkParts.map(checkPartLabel).join(' · ');
                    bottomMarkers += `<div class="marker bg-green" style="opacity:0.9;" title="בדיקה שנייה בעונה — ${partsText} (לכתחילה)">${ICONS.CHECK}<span>בדיקה ב'</span></div>`;
                }
            }
        }

        // סימוני היום (js/dayMarks.js) — כתם, פחד פתאום, חרדה, יציאה לדרך, ליל חופה.
        // הם נוספים לכל סוג רשומה, ולכן אינם תלויים בענף של סוג האירוע.
        if (db[abs]) bottomMarkers += buildDayMarksMarker(db[abs]);

        // Clean days marking
        if (computed.nekiim.includes(abs)) {
            bottomMarkers += `<div class="marker bg-green" title="שבעה נקיים">${ICONS.SHIELD}<span>נקיים</span></div>`;
            ariaBits.push('משבעת הנקיים');
        }

        // Immersion actual or prediction (tevilah). computed.tevilot / a manually
        // recorded 'tevilah' already store the abs of the day whose NIGHT is mikvah
        // night (see calculations.js), so it renders at the TOP of this same box —
        // matching the night-before-day convention used throughout the calendar.
        if (db[abs] && db[abs].type === 'tevilah') {
            topMarkers += `<div class="marker bg-blue" title="הלילה טבילה">${ICONS.WAVES}<span>טבילה הלילה</span></div>`;
            ariaBits.push('הלילה טבילה');
        } else if (computed.tevilot.includes(abs)) {
            topMarkers += `<div class="marker bg-blue" style="opacity:0.85; border: 1px dashed white;" title="צפי טבילה הלילה">${ICONS.WAVES}<span>צפי טבילה הלילה</span></div>`;
            bgStyle = 'background-color: var(--input-bg); border-color: var(--blue);';
            ariaBits.push('צפי טבילה הלילה');
        }

        // Separation dates (prishot)
        if (computed.prishot[abs]) {
            let nList = computed.prishot[abs].filter(p => p.ona === 'night');
            let dList = computed.prishot[abs].filter(p => p.ona === 'day');

            if (nList.length > 0) { topMarkers += buildPrishaMarker(nList, 'פרישת לילה'); ariaBits.push('פרישת לילה'); }
            if (dList.length > 0) { bottomMarkers += buildPrishaMarker(dList, 'פרישת יום'); ariaBits.push('פרישת יום'); }
        }

        // Highlight today
        const isToday = abs === todayAbs;
        if (isToday) {
            classes.push("day-today");
            ariaBits.push('היום');
        }

        const animDelay = isYearly ? '0s' : `${day * 0.01}s`;
        const ariaLabel = `${hd.renderGematriya()}, ${greg.toLocaleDateString('he-IL')}`
            + (ariaBits.length ? ` — ${ariaBits.join(', ')}` : '');

        html += `
            <div class="${classes.join(' ')}" style="${bgStyle} animation-delay: ${animDelay};" onclick="window.openDayModal(new window.HDateLocal(${abs}))" role="button" tabindex="0" aria-label="${ariaLabel}">
                ${noteHTML}
                <div class="marker-wrapper">${topMarkers}</div>
                <div class="day-dates">
                    <span class="day-num">${HEB_DAYS[day]}</span>
                    <span class="day-heb">${greg.getDate()}/${greg.getMonth() + 1}</span>
                </div>
                <div class="marker-wrapper">${bottomMarkers}</div>
            </div>
        `;
    }
    html += `</div>`;
    return html;
}

/**
 * Builds HTML grid content for a single Hebrew month rendered as a horizontal row (Yearly View).
 */
export function buildYearlyRowHTML(month, year, db, engineData) {
    const computed = engineData.computed;
    const todayAbs = currentTodayAbs();
    const daysInMonth = HDate.daysInMonth(month, year);
    const firstDayOfMonth = new HDate(1, month, year);
    const monthName = translateMonth(firstDayOfMonth.getMonthName());
    const isFullMonth = (daysInMonth === 30);
    const statusText = isFullMonth ? "חודש מלא" : "חודש חסר";

    let html = `
        <div class="yearly-month-info">
            <span class="m-name">${monthName}</span>
            <span class="m-status ${isFullMonth ? 'full' : 'deficient'}">${statusText}</span>
        </div>
        <div class="yearly-row-labels">
            <div class="row-label week-label">ימי השבוע</div>
            <div class="row-label date-label">תאריך</div>
        </div>
    `;

    for (let day = 1; day <= 30; day++) {
        if (day > daysInMonth) {
            html += `<div class="yearly-day-cell empty"></div>`;
            continue;
        }

        const hd = new HDate(day, month, year);
        const abs = hd.abs();
        const dayOfWeek = hd.greg().getDay();
        const weekdayHeb = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'][dayOfWeek];
        const dateHeb = HEB_DAYS_CLEAN[day];

        let cellClasses = ["yearly-day-cell"];
        if (abs === todayAbs) {
            cellClasses.push("day-today");
        }

        let bgStyle = "";
        let topMarkers = "";
        let bottomMarkers = "";
        let noteHTML = "";
        const ariaBits = [];

        if (db[abs]) {
            if (db[abs].note) {
                // הטקסט עצמו לא נכנס לתוך תג HTML: תווים כמו גרשיים בהערה היו שוברים
                // מאפיין title, ו-title ממילא לא אמין במגע. הלחיצה פותחת כרטיסון עם
                // הטקסט המלא (js/app.js: showDayNotePreview), בלי לפתוח גם את יום המשבצת.
                noteHTML = `<span class="note-icon" onclick="event.stopPropagation(); window.showDayNotePreview(${abs})" title="הערה אישית — לחצו לתצוגה מלאה">${ICONS.NOTE}</span>`;
                ariaBits.push('יש הערה אישית');
            }
            if (db[abs].type === 'reiyah') {
                if (db[abs].ona === 'day') {
                    bottomMarkers += `<div class="marker bg-red" title="ראיית יום">${ICONS.FLAG}<span>ראיית יום</span></div>`;
                    ariaBits.push('ראיית יום');
                } else {
                    topMarkers += `<div class="marker bg-red" title="ראיית לילה">${ICONS.FLAG}<span>ראיית לילה</span></div>`;
                    ariaBits.push('ראיית לילה');
                }
                // B2 — המיחוש שתועד על הראייה (וסת הגוף).
                bottomMarkers += buildSignMarker(db[abs]);
            }
            if (db[abs].type === 'hefsek') {
                bottomMarkers += `<div class="marker bg-yellow" title="הפסק טהרה">${ICONS.SUN_SPARK}<span>הפסק טהרה</span></div>`;
                ariaBits.push('הפסק טהרה');
            }
            if (db[abs].type === 'check') {
                // B4: what was checked, and with what result - only a proper check
                // can uproot a veset `[שט מ"א | עמ' 182]`.
                const depthLabel = db[abs].depth === 'wipe' ? 'קינוח בלבד — לא מועיל לעקירה' : 'בדיקה כדין (עומק ובחו"ס)';
                bottomMarkers += `<div class="marker bg-green" title="${depthLabel}">${ICONS.CHECK}<span>בדיקה</span></div>`;
                ariaBits.push('בדיקה');
                // A3 — הבדיקה השנייה שבעונה מוצגת בסימון משלה, ולא נבלעת בשדה אחד.
                const checkParts = checkPartsOf(db[abs]);
                if (checkParts.length > 1) {
                    const partsText = checkParts.map(checkPartLabel).join(' · ');
                    bottomMarkers += `<div class="marker bg-green" style="opacity:0.9;" title="בדיקה שנייה בעונה — ${partsText} (לכתחילה)">${ICONS.CHECK}<span>בדיקה ב'</span></div>`;
                }
            }
        }

        // סימוני היום (js/dayMarks.js) — כתם, פחד פתאום, חרדה, יציאה לדרך, ליל חופה.
        // הם נוספים לכל סוג רשומה, ולכן אינם תלויים בענף של סוג האירוע.
        if (db[abs]) bottomMarkers += buildDayMarksMarker(db[abs]);

        // Clean days marking
        if (computed.nekiim.includes(abs)) {
            bottomMarkers += `<div class="marker bg-green" title="שבעה נקיים">${ICONS.SHIELD}<span>נקיים</span></div>`;
            ariaBits.push('משבעת הנקיים');
        }

        // Immersion actual or prediction (tevilah). computed.tevilot / a manually
        // recorded 'tevilah' already store the abs of the day whose NIGHT is mikvah
        // night (see calculations.js), so it renders at the TOP of this same box —
        // matching the night-before-day convention used throughout the calendar.
        if (db[abs] && db[abs].type === 'tevilah') {
            topMarkers += `<div class="marker bg-blue" title="הלילה טבילה">${ICONS.WAVES}<span>טבילה הלילה</span></div>`;
            ariaBits.push('הלילה טבילה');
        } else if (computed.tevilot.includes(abs)) {
            topMarkers += `<div class="marker bg-blue" style="opacity:0.85; border: 1px dashed white;" title="צפי טבילה הלילה">${ICONS.WAVES}<span>צפי טבילה הלילה</span></div>`;
            bgStyle = 'background-color: var(--input-bg); border-color: var(--blue);';
            ariaBits.push('צפי טבילה הלילה');
        }

        // Separation dates (prishot)
        if (computed.prishot[abs]) {
            let nList = computed.prishot[abs].filter(p => p.ona === 'night');
            let dList = computed.prishot[abs].filter(p => p.ona === 'day');

            if (nList.length > 0) { topMarkers += buildPrishaMarker(nList, 'פרישת לילה'); ariaBits.push('פרישת לילה'); }
            if (dList.length > 0) { bottomMarkers += buildPrishaMarker(dList, 'פרישת יום'); ariaBits.push('פרישת יום'); }
        }

        if (cellClasses.includes('day-today')) ariaBits.push('היום');
        const ariaLabel = `${hd.renderGematriya()}, ${hd.greg().toLocaleDateString('he-IL')}`
            + (ariaBits.length ? ` — ${ariaBits.join(', ')}` : '');

        html += `
            <div class="${cellClasses.join(' ')}" style="${bgStyle}" onclick="window.openDayModal(new window.HDateLocal(${abs}))" role="button" tabindex="0" aria-label="${ariaLabel}">
                <div class="yearly-cell-inner">
                    ${noteHTML}
                    <div class="marker-wrapper">${topMarkers}</div>
                    <div class="day-dates">
                        <span class="day-weekday">${weekdayHeb}</span>
                        <span class="day-num">${dateHeb}</span>
                    </div>
                    <div class="marker-wrapper">${bottomMarkers}</div>
                </div>
            </div>
        `;
    }

    return html;
}

/**
 * Render the monthly/yearly calendar.
 */
export function renderScreenCalendar(currentHDate, db, engineData, isYearlyView) {
    const singleCal = document.getElementById('calendar');
    const yearlyWrapper = document.getElementById('yearly-calendar-wrapper');
    const monthTitle = document.getElementById('month-title');
    const todayBtn = document.getElementById('return-today');
    const mobTodayBtn = document.getElementById('mobile-return-today');

    if (isYearlyView) {
        if (singleCal) singleCal.style.display = 'none';
        if (yearlyWrapper) {
            yearlyWrapper.style.display = 'block';
            yearlyWrapper.innerHTML = '';
            
            const currentYearStr = new HDate(1, 1, currentHDate.getFullYear()).renderGematriya().split(' ').pop();
            if (monthTitle) monthTitle.innerText = `תצוגה שנתית: שנת ${currentYearStr}`;
            
            const maxMonths = getMonthsInYear(currentHDate.getFullYear());
            for (let m = 1; m <= maxMonths; m++) {
                const monthDiv = document.createElement('div');
                monthDiv.className = 'yearly-row';
                monthDiv.innerHTML = buildYearlyRowHTML(m, currentHDate.getFullYear(), db, engineData);
                yearlyWrapper.appendChild(monthDiv);
            }
        }
    } else {
        if (yearlyWrapper) yearlyWrapper.style.display = 'none';
        if (singleCal) {
            singleCal.style.display = 'grid';
            const html = buildMonthGridHTML(currentHDate.getMonth(), currentHDate.getFullYear(), db, engineData, false);
            
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            
            if (monthTitle) monthTitle.innerText = tempDiv.querySelector('.month-title-display').innerText;
            singleCal.innerHTML = tempDiv.querySelector('.calendar').innerHTML;
        }
    }

    const todayHDate = new HDate();
    const isToday = currentHDate.getMonth() === todayHDate.getMonth() && currentHDate.getFullYear() === todayHDate.getFullYear();
    
    [todayBtn, mobTodayBtn].forEach(btn => {
        if (btn) btn.style.display = isToday ? 'none' : 'inline-block';
    });

    syncSelectors(currentHDate);
    renderSummaryTable(engineData);
    updateDashboard(db, engineData);
    updateLifePanel(engineData);
    updateChazakaPanel(engineData);
    updateDayStatePanel(engineData);
}

/**
 * פאנל סימוני היום והדינים התלויים בהם (js/dayMarks.js, js/calculations.js).
 *
 * שני דינים יושבים כאן, ושניהם **הסרה או הארה ולא סימון בלוח**, ולכן אין להם יום
 * לסמן על גביו:
 *
 *   - **פטורי עונת אור זרוע** — עונה שהיתה מונחת ונסתלקה מחמת ליל טבילה, ליל חופה
 *     או יציאה לדרך. זהו **הסרה של חשש**, והסתרתה היתה מלכודת: המשתמשת היתה רואה
 *     שאין פרישה ואינה יודעת למה. לכן כל פטור מוצג עם מראה מקומו.
 *   - **פחד פתאום (ביעתותא)** — "גורמים להיכפ — לביאת הדם", ולמעשה "אסור לבעלה
 *     לבוא עליה עד שישאלנה אם הרגישה" `[שט כ"ז | עמ' 42]`. כשהדבר טרם נברר אין
 *     פרישה לסמן עליה; המצב עצמו מוצג בחזית עד שיתברר בבדיקה או בראייה.
 *
 * כן מוצגת חרדה מתמשכת כמידע בלבד: היא מסלקת את הדמים, אבל אינה מבטלת חששות
 * של ראיות שתועדו.
 */
export function updateDayStatePanel(engineData) {
    const container = document.getElementById('day-state-container');
    if (!container) return;

    const fright = engineData && engineData.fright;
    const exemptions = (engineData && engineData.orZaruaExemptions) || [];
    const blocks = [];

    // 1. פחד פתאום שטרם נברר — מצב איסור, ולכן קודם לכל.
    const open = (fright && fright.open) || [];
    if (open.length) {
        const latest = open[open.length - 1];
        const dateText = new HDate(latest.abs).renderGematriya();
        blocks.push(`
            <div class="dashboard-text">
                <strong>פחד פתאום (ביעתותא) — טרם נברר</strong>
                <span>ביום ${dateText} נרשם פחד פתאום${latest.wipeOnly ? ' (נרשם קינוח בלבד — ואינו מברר)' : ''}.
                "ביעתותא דהיינו פחד ובהלה הבאים פתאום גורמים להיפך — לביאת הדם", ולמעשה
                "אסור לבעלה לבוא עליה <b>עד שישאלנה אם הרגישה</b>".
                ${fright.demandsBedikah
                    ? 'ולפי המתג שדלק — "הגר"ש קלוגר כתבו דצריכה בדיקה": יש לבדוק בדיקה כדין — בעומק ובחו"ס.'
                    : 'והאם צריכה בדיקה — מחלוקת החת"ס והגר"ש קלוגר; המתג בהגדרות דולק לשיטת הצריכה בדיקה.'}
                <span style="white-space:nowrap;">[שט כ"ז | עמ' 42] · [שט מ"א | עמ' 182]</span>
                <button class="help-dot" data-help="day_marks" type="button" aria-label="הסבר הלכתי ומקורות">?</button></span>
            </div>
            <div class="dashboard-progress alert-pulse" style="color: var(--red);">${ICONS.ALERT}</div>
        `);
    }

    // 2. פטורי עונת אור זרוע — עונה שהוסרה מן הלוח.
    if (exemptions.length) {
        const items = exemptions.map(e => {
            const dayText = new HDate(e.abs).renderGematriya();
            const onaText = e.ona === 'night' ? 'עונת לילה' : 'עונת יום';
            return `<li>${e.reason} — ${dayText} (${onaText}) `
                + `<small style="opacity:0.8;">${e.addedReason}</small> `
                + `<span style="white-space:nowrap;">${e.source}</span></li>`;
        }).join('');
        blocks.push(`
            <div class="dashboard-text">
                <strong>עונת "אור זרוע" שנפטרה (${exemptions.length})</strong>
                <span>מן המנהג להחמיר ולפרוש גם בעונה שלפני זמן הוסת, ויש בו פטורים מפורשים.
                להלן העונות שהיו מונחות והוסרו מחמתם — ולא נשמטו בשקט.</span>
                <ul style="margin: 8px 18px; padding: 0; line-height: 1.7;">${items}</ul>
                <button class="help-dot" data-help="or_zarua_exempt" type="button" aria-label="הסבר הלכתי ומקורות">?</button>
            </div>
        `);
    }

    // 3. חרדה מתמשכת — מידע בלבד.
    const anxietyDays = (fright && fright.anxietyDays) || [];
    if (anxietyDays.length) {
        const last = anxietyDays[anxietyDays.length - 1];
        blocks.push(`
            <div class="dashboard-text">
                <strong>חרדה מתמשכת שנרשמה</strong>
                <span>${DAY_MARK_RULES.anxiety.text}
                <span style="white-space:nowrap;">${DAY_MARK_RULES.anxiety.source}</span>
                <br><small>היום האחרון שנרשמה בו: ${new HDate(last).renderGematriya()}</small>
                <button class="help-dot" data-help="day_marks" type="button" aria-label="הסבר הלכתי ומקורות">?</button></span>
            </div>
        `);
    }

    if (blocks.length === 0) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }
    container.style.display = 'flex';
    container.innerHTML = blocks.join('<div style="height:1px;background:var(--border-color);margin:10px 0;"></div>');
}

/**
 * Shows the life state (מצב חיים) and what it changes: which concerns are set
 * aside because she is מסולקת דמים, that she is exempt from checking, and how far
 * the pills delay the uprooting of her veset.
 *
 * The panel exists because these are dinim that REMOVE obligations. A removal that
 * is not shown is a trap: the woman has to be able to see why a check is no longer
 * demanded of her, and on what source it rests.
 */
export function updateLifePanel(engineData) {
    const container = document.getElementById('life-container');
    if (!container) return;

    const life = engineData && engineData.life;
    if (!life || !life.configured) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    const computed = (engineData && engineData.computed) || {};
    const akirot = engineData && engineData.akirot;
    const blocks = [];

    // 1. What was set aside because of the silek - the count, not the list: the
    // calendar already marks them faintly.
    const silekSuppressed = (computed.suppressed || []).filter(s => s.why === 'silek');
    const silekSuppressedVesets = silekSuppressed.filter(s => s.code === 'וק"ב');
    if (life.silek) {
        const labels = (life.silekLabels || []).join(', ');
        const suppressedText = silekSuppressed.length
            ? ` ${silekSuppressed.length} חששות שהיו לה מקודם הוסרו מהלוח.`
            : '';
        const vesetText = silekSuppressedVesets.length
            ? `<br><b>וסת קבועה שהיתה לה אינה נוהגת עוד:</b> `
              + silekSuppressedVesets.map(s => s.reason).join(' · ')
              + ` <span style="white-space:nowrap;">[שט כ"ט | עמ' 69]</span>`
            : '';
        blocks.push(`
            <div class="dashboard-text">
                <strong>מסולקת דמים — ${labels}</strong>
                <span>אין חוששין לוסתות שהיו לה קודם שנסתלקה מדמים, ואף לוסתה הראשון אפילו היה קבוע.
                כמו כן היא פטורה מבדיקה, ולכן אין מוצגת לה דרישת "אסורה עד שתבדוק".${suppressedText}${vesetText}
                <button class="help-dot" data-help="life_state" type="button" aria-label="הסבר הלכתי ומקורות">?</button>
                <button class="help-dot" data-help="silkuk" type="button" aria-label="הסבר הלכתי ומקורות">?</button></span>
            </div>
            <div class="dashboard-progress" style="color: var(--blue);">${ICONS.CHECK}</div>
        `);
    }

    // 2. A pregnant woman in the first three months is NOT silek - say so, rather
    // than let the absence of a status read as an absence of din.
    if (life.pregnant && life.pregnant.firstTrimester) {
        blocks.push(`
            <div class="dashboard-text">
                <strong>⚠️ הריון — ג' החודשים הראשונים</strong>
                <span>עד ${new HDate(life.pregnant.silekFromAbs).renderGematriya()}
                (תשעים יום מתחילת ההריון) אין סילוק דמים, והיא חוששת לוסתות שהיו לה קודם.
                <button class="help-dot" data-help="life_state" type="button" aria-label="ההסבר ההלכתי ומקורות">?</button></span>
            </div>
        `);
    }

    // 2b. שבוע ההריון ותאריך הלידה המשוער — הערכה כללית בלבד, לא קביעה הלכתית
    // או רפואית; מוצג כל עוד לא נרשמה לידה (js/lifeState.js: gestationalWeek).
    if (life.pregnant && life.pregnant.gestationalWeek !== null) {
        blocks.push(`
            <div class="dashboard-text">
                <strong>שבוע הריון ${life.pregnant.gestationalWeek} (משוער)</strong>
                <span>תאריך לידה משוער: ${new HDate(life.pregnant.dueDateAbs).renderGematriya()}.
                הערכה כללית בלבד (כ-266 יום מתאריך תחילת ההריון) — אינה קביעה הלכתית ואינה תחליף לייעוץ רפואי.</span>
            </div>
        `);
    }

    // 3. The statuses that were configured.
    const active = (life.statuses || []).filter(s => s.id !== 'pills');
    if (active.length) {
        const items = active.map(s =>
            `<li><b>${s.label}</b><br><small>${s.detail} <span style="white-space:nowrap;">${s.source}</span></small></li>`
        ).join('');
        blocks.push(`
            <div class="dashboard-text">
                <strong>מצב חיים שהוגדר</strong>
                <ul style="margin: 8px 18px; padding: 0; line-height: 1.7;">${items}</ul>
            </div>
        `);
    }

    // 4. Pills: the periods, and the uprooting that was delayed by them.
    if (life.pills && life.pills.configured) {
        const delayed = akirot
            ? akirot.fixed.filter(f => f.interval && f.interval.skipped > 0)
            : [];
        const delayText = delayed.map(f =>
            `<li>${describeVeset(f.veset)} — מתוך ${f.interval.elapsed} הימים שלאחר הראייה האחרונה,
            ${f.interval.skipped} נכללו בנטילת כדורים ואינם נמנים למניין העקירה (נמנו ${f.interval.passed} מתוך ${f.interval.needed}).</li>`
        ).join('');
        blocks.push(`
            <div class="dashboard-text">
                <strong>כדורים</strong>
                <span>${life.pills.active ? 'נוטלת כדורים כעת' : 'תקופות נטילה מתועדות'}
                ${life.pills.currentTypeLabel ? ' — ' + life.pills.currentTypeLabel : ''}.
                הספר מנמק את עיכוב העקירה בכך ש"ניכר בבירור שהפלגתה הארוכה מחמת הכדורים".
                <button class="help-dot" data-help="kadurim_akira" type="button" aria-label="הסבר הלכתי ומקורות">?</button></span>
                ${delayText ? '<ul style="margin: 8px 18px; padding: 0; line-height: 1.7;">' + delayText + '</ul>' : ''}
            </div>
        `);
    }

    // 4b. The pause-day concern (חשש יום ההפסקה בכדורים, A5-A7): the days she must
    // separate after stopping, and the day she has established for herself. It is
    // shown because the calendar marks these days with a code of their own (פה"כ)
    // and she has to know where the concern comes from — and that this concern does
    // NOT add the Or Zarua shift `[שט כ"ז | עמ' 40]`.
    const pillPause = engineData && engineData.pillPause;
    if (pillPause && pillPause.pauses.length) {
        const activeLine = pillPause.active
            ? `<br><b>ועכשיו:</b> את ביום ${pauseDayLabel(pillPause.active.dayNumber)} להפסקת הכדורים — `
              + (pillPause.active.permitted
                  ? 'מותר, "כיון שאין מצוי שתראה".'
                  : 'יש להחמיר לפרוש.')
            : '';
        // הפסקה מכדורי אורגסט אינה מחשבת חלון — הדין תלוי בסדר הנטילה
        // ]מלבד כדורי אורגסט, שתלוי בסדר שנוטלים אותם[ `[שט כ"ז | עמ' 40]`.
        const windowsList = pillPause.pauses.map(p => (p.rule !== 'standard'
            ? `<li>ההפסקה ב${new HDate(p.pauseAbs).renderGematriya()}
                ${p.typeLabel ? '(' + p.typeLabel + ')' : ''} — <b>אין חשש מחושב</b>:
                הדין תלוי בסדר הנטילה, ויש לבררו עם רב.</li>`
            : `<li>ההפסקה ב${new HDate(p.pauseAbs).renderGematriya()} — חשש לימים `
            + `${pauseDayLabel(2)}–${pauseDayLabel(p.lastDay)} שאחריה.</li>`)).join('');
        const timesText = (n) => (n === 1 ? 'פעם אחת' : (n === 2 ? 'פעמיים' : `${n} פעמים`));
        const establishedList = (pillPause.established || []).map(e =>
            `<li>יום ${pauseDayLabel(e.offsetDays)} שאחרי ההפסקה (עונת ${e.ona === 'night' ? 'לילה' : 'יום'}) — `
            + (e.count >= 3
                ? `ראתה כן ${e.count} פעמים, ונקבע לה יום זה`
                : `ראתה כן ${timesText(e.count)}, וחוששת לו כדין וסת שאינו קבוע`)
            + ` <span style="white-space:nowrap;">[שט כ"ז | עמ' 40]</span></li>`).join('');
        const onlyRegimen = pillPause.pauses.every(p => p.rule !== 'standard');
        // הנוסח של טבע הכדורים כבר מובא בפתיחת הפאנל, ואין לחזור עליו ברשימת המקורות.
        const noteList = (pillPause.notes || [])
            .filter(n => n.title !== PILL_PAUSE_RULES.nature.title)
            .map(n => {
            const mark = n.level === 'strict' ? '⚠️ לחומרא' : 'ℹ️';
            return `<li>${mark} — <b>${n.title}</b><br>${n.text}
                <small style="white-space:nowrap;">${n.source}</small></li>`;
        }).join('');

        blocks.push(`
            <div class="dashboard-text">
                <strong>חשש יום ההפסקה בכדורים</strong>
                <span>${onlyRegimen
                    ? 'ההפסקות שתועדו הן מכדורים שדינם תלוי בסדר הנטילה — "מלבד כדורי אורגסט, '
                      + 'שתלוי בסדר שנוטלים אותם" — ולכן אין מחושב מהן חלון ימים, ויש לברר עם רב.'
                    : '"טבעם של הכדורים שמונעים או מעכבים ביאת הוסת, שאחר שמפסיקה ליטול '
                      + 'הכדורים רואה מיד אחר שני ימים עד חמשה ימים" — ולכן ביום הראשון מותרת, '
                      + 'ומיום השני ואילך יש להחמיר לפרוש.'}
                <button class="help-dot" data-help="kadurim_pause" type="button" aria-label="הסבר הלכתי ומקורות">?</button>${activeLine}</span>
                <ul style="margin: 8px 18px; padding: 0; line-height: 1.7;">
                    ${windowsList}${establishedList}
                </ul>
                ${noteList ? '<ul style="margin: 8px 18px; padding: 0; line-height: 1.7;">' + noteList + '</ul>' : ''}
                <small>החשש מוצג כחשש פרישה, ואינו יוצר דרישת "אסורה עד שתבדוק".</small>
            </div>
        `);
    }

    // 5. The return from the dormancy (יציאה מן הסילוק): what comes back, when, and
    // what was set aside in its favour. The return rules differ by the KIND of veset
    // — veset ha-yamim returns immediately, veset haflagah only once she sees again
    // `[שט כ"ט | עמ' 71]` — and after stopping pills she returns to her first veset
    // even if the pills established another `[שט כ"ז | עמ' 42]`.
    const silekReturn = engineData && engineData.silekReturn;
    if (silekReturn && silekReturn.interlude) {
        const reasons = (silekReturn.interlude.labels || []).slice();
        if (silekReturn.interlude.pills) reasons.push('הפסיקה ליטול כדורים');
        if (silekReturn.interlude.windows && silekReturn.interlude.windows.length) {
            reasons.push(`תום הסילוק: ${new HDate(silekReturn.interlude.untilAbs).renderGematriya()}`);
        } else if (silekReturn.interlude.pills) {
            reasons.push(`סיום הנטילה: ${new HDate(silekReturn.interlude.pills.endAbs).renderGematriya()}`);
        }

        const items = [];
        silekReturn.restored.forEach(v => {
            const rule = v.kind === 'haflagah'
                ? `ומניין ההפלגה נמנה מן הראייה ב${new HDate(v.restoredAnchorAbs).renderGematriya()}`
                : 'והיא חוזרת לחוש לו מיד עם תום הסילוק, אף שעדיין לא ראתה';
            items.push(`<li><b>${describeVeset(v)}</b><br><small>הוסת הקבועה שחזרה — ${rule}.
            <span style="white-space:nowrap;">${v.restoredFrom}</span></small></li>`);
        });
        silekReturn.waiting.forEach(v => {
            items.push(`<li><b>${describeVeset(v)}</b><br><small>אינה חוזרת עד שתראה פעם אחת אחרי הסילוק, ומשעת אותה ראייה נמנה ממנה
            מניין ההפלגה שהיתה למודה להפליג.
            <span style="white-space:nowrap;">${v.restoredFrom}</span></small></li>`);
        });

        const displaced = (computed.suppressed || [])
            .filter(s => s.why === 'restored' || s.why === 'pills');
        const displacedList = displaced.length
            ? `<ul style="margin: 8px 18px; padding: 0; line-height: 1.7;">${displaced.map(s =>
                `<li>${s.reason} — ${s.text}</li>`).join('')}</ul>`
            : '';
        const noteList = (silekReturn.notes || []).map(n => {
            const mark = n.level === 'dispute' ? '⚠️ מחלוקת' : 'ℹ️';
            return `<li>${mark} — <b>${n.title}</b><br>${n.text}
                <small style="white-space:nowrap;">${n.source}</small></li>`;
        }).join('');

        blocks.push(`
            <div class="dashboard-text">
                <strong>יציאה מן הסילוק — ${reasons.join(' · ')}</strong>
                <span>עם תום הסילוק היא חוזרת לוסתה הקבועה שהיתה לה קודם לכן, ואילו לוסת שאינה
                קבועה אינה חוזרת ("חוזרת דוקא לוסתה הקבוע").
                <button class="help-dot" data-help="silek_return" type="button" aria-label="הסבר הלכתי ומקורות">?</button></span>
                ${items.length ? '<ul style="margin: 8px 18px; padding: 0; line-height: 1.7;">' + items.join('') + '</ul>' : ''}
                ${displacedList ? '<div><b>וסתות שאינן נוהגות עוד:</b>' + displacedList + '</div>' : ''}
                ${noteList ? '<ul style="margin: 8px 18px; padding: 0; line-height: 1.7;">' + noteList + '</ul>' : ''}
            </div>
        `);
    }

    // 6. Disputes and stringencies the app refuses to decide on its own.
    const notes = life.notes || [];
    if (notes.length) {
        const items = notes.map(n => {
            const mark = n.level === 'dispute' ? '⚠️ מחלוקת' : (n.level === 'strict' ? '⚠️ לחומרא' : 'ℹ️');
            return `<li>${mark} — <b>${n.title}</b><br>${n.text} <small style="white-space:nowrap;">${n.source}</small></li>`;
        }).join('');
        blocks.push(`
            <div class="dashboard-text">
                <strong>שיטות ומחלוקות במצב החיים</strong>
                <ul style="margin: 8px 18px; padding: 0; line-height: 1.7;">${items}</ul>
            </div>
        `);
    }

    const informational = life.silek || !!(silekReturn && silekReturn.interlude);
    container.className = 'dashboard ' + (informational ? 'dash-blue' : 'dash-yellow');
    container.innerHTML = blocks.join('');
    container.style.display = 'block';
}

/**
 * Shows what the two engines concluded: the fixed veset that STANDS, what was
 * UPROOTED, the sightings that do NOT count toward a chazaka, and which veset
 * times still need a proper check.
 *
 * The panel exists so that nothing disappears silently: not a sighting dropped
 * from the count, not a concern removed, and not an obligation to check. A
 * woman who has passed her veset time without checking is forbidden until she
 * checks `[שט כ"ד | עמ' 7]` - a safety state, and the first thing shown.
 */
export function updateChazakaPanel(engineData) {
    const container = document.getElementById('chazaka-container');
    if (!container) return;

    const chazaka = engineData && engineData.chazaka;
    const akirot = engineData && engineData.akirot;
    const computed = (engineData && engineData.computed) || {};

    if (!chazaka && !akirot) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    const excluded = chazaka ? (chazaka.excluded || []) : [];
    const allEstablished = chazaka ? (chazaka.established || []) : [];
    const counted = chazaka ? (chazaka.counted || []) : [];
    const warnings = chazaka ? (chazaka.warnings || []) : [];
    // A veset that was uprooted no longer stands, and no longer replaces the
    // ordinary concerns (js/akira.js).
    const uprootedVesets = akirot ? akirot.uprooted : [];
    // What actually stands - after uprooting AND after a life state that sets the
    // veset aside (js/calculations.js carries the filtered list).
    const established = engineData && engineData.standingVesets
        ? engineData.standingVesets
        : (akirot ? akirot.active.map(f => f.veset) : allEstablished);
    const pendingChecks = computed.pendingChecks || [];
    const uprootedConcerns = computed.uprooted || [];
    const returnDispute = akirot ? akirot.returnDispute : [];
    // עונות מעורבות: התבנית שנשלמה ונשתנתה עונתה `[שט ל"ג | עמ' 112]`.
    const mixedOna = chazaka ? (chazaka.mixedOna || []) : [];

    // Nothing worth saying yet: no veset, no excluded sightings, no contradiction,
    // no check obligation and too little history.
    const bodyVesetAny = engineData && engineData.bodyVeset && engineData.bodyVeset.configured
        && ((engineData.bodyVeset.bySign || []).length > 0 || (engineData.bodyVeset.displaced || []).length > 0);
    if (established.length === 0 && uprootedVesets.length === 0 && excluded.length === 0 &&
        warnings.length === 0 && pendingChecks.length === 0 && returnDispute.length === 0 &&
        mixedOna.length === 0 && !bodyVesetAny && counted.length < 2) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    const blocks = [];

    // 1. The safety state first: a passed veset time with no proper check.
    if (pendingChecks.length) {
        const recent = pendingChecks.slice(-3);
        const more = pendingChecks.length > recent.length
            ? `<br><small>ועוד ${pendingChecks.length - recent.length} זמנים.</small>`
            : '';
        const items = recent.map(p =>
            `<li>${new HDate(p.abs).renderGematriya()} (${p.code}) — ${p.ona === 'night' ? 'עונת לילה' : 'עונת יום'}</li>`
        ).join('');
        blocks.push(`
            <div class="dashboard-text">
                <strong>⚠️ עבר זמן הוסת ולא נבדקה בדיקה כדין</strong>
                <ul style="margin: 8px 18px; padding: 0; line-height: 1.7;">${items}</ul>
                ${more}
                <span>בלא בדיקה לא נברר שלא ראתה, ולכן <b>אסורה לבעלה עד שתבדוק</b>, ווסת קבוע אינה נעקרת.
                אפשר לרשום בדיקה בלחיצה על התאריך בלוח.
                <button class="help-dot" data-help="bedikot" type="button" aria-label="הסבר הלכתי ומקורות">?</button></span>
            </div>
        `);
    }

    // 2. What stands.
    if (established.length) {
        const items = established.map(v => {
            const dates = v.establishedBy.map(a => new HDate(a).renderGematriya()).join(', ');
            const status = akirot ? akirot.fixed.find(f => f.veset === v) : null;
            let progress = '';
            if (status) {
                const nextStr = status.nextDue ? ' זמן הוסת הבא: ' + new HDate(status.nextDue).renderGematriya() + '.' : '';
                progress = `<br><small>לעקירתה דרושים ${status.needed} זמני וסת רצופים עם בדיקה כדין — עד כה ${status.clearedCount} נבדקו.${nextStr}</small>`;
            }
            const origin = v.restored === true
                ? `<br><small>חזרה מן הסילוק: זו הוסת הקבועה שהיתה לה קודם הסילוק, ועומדת שוב מתומו`
                    + `${v.restoredFromAbs ? ' (' + new HDate(v.restoredFromAbs).renderGematriya() + ')' : ''}.</small>`
                : '';
            // "צירוף למפרע": הווסת הזו נקבעה מכוח הצירוף של ההפלגות השוות על פני
            // ההפלגה הקצרה שראתה ביניהן — והספר מגדיר את הכלל "רק לחומרא בעלמא".
            const chiburOrigin = v.viaChibur === true
                ? `<br><small>נקבע <b>בצירוף למפרע</b>: שלש ההפלגות השוות מצטרפות אף שראתה ביניהן`
                    + ` בהפלגה קצרה — "כיון שוסת קצר אינו עוקר וסת הארוך". הספר מגדיר את הכלל`
                    + ` "אבל הוא רק לחומרא בעלמא ולא מעיקרא דדינא".</small>`
                : '';
            return `<li><b>${describeVeset(v)}</b><br><small>נקבע מכוח הראיות: ${dates}</small>${origin}${chiburOrigin}${progress}</li>`;
        }).join('');
        blocks.push(`
            <div class="dashboard-text">
                <strong>נקבעה וסת קבועה ✅</strong>
                <ul style="margin: 8px 18px; padding: 0; line-height: 1.7;">${items}</ul>
                <span>מכוח הוסת הקבוע אין חוששים עוד לשאר החששות — לא לעונה בינונית, ולא ליום החודש של שאר הראיות.
                ימי הפרישה המסומנים בלוח הם של הוסת הקבוע בלבד.
                <button class="help-dot" data-help="kviut" type="button" aria-label="הסבר הלכתי ומקורות">?</button></span>
            </div>
            <div class="dashboard-progress" style="color: var(--green);">${ICONS.CHECK}</div>
        `);
    } else if (counted.length >= 2 && uprootedVesets.length === 0 && allEstablished.length === 0) {
        // Not shown when a veset WAS established and only a life state set it aside -
        // announcing "progress towards a veset" there would contradict the life panel.
        const p = chazaka.progress;
        blocks.push(`
            <div class="dashboard-text">
                <strong>קביעת וסת — ${counted.length} ראיות שנספרות לחזקה</strong>
                <span>וסת החודש נקבעת בג' ראיות באותו יום בחודש ובאותה עונה (יש ${p.month.have} מתוך ${p.month.need}),
                ווסת ההפלגה בד' ראיות בהפלגות שוות (יש ${p.haflagah.have} מתוך ${p.haflagah.need})${p.week
                    ? `, ווסת השבוע בג' ראיות באותו יום בשבוע ובאותה עונה (יש ${p.week.have} מתוך ${p.week.need})`
                    : ''}.
                ${mixedOna.length
                    ? 'בתבנית שלפניך הושלמה החזקה, אבל <b>העונה השתנתה בראייה האחרונה</b> — ולכן היא אינה נקבעת כוסת קבועה, וחוששת לשתי העונות. ראו "עונות מעורבות" להלן.'
                    : ''}
                <button class="help-dot" data-help="kviut" type="button" aria-label="הסבר הלכתי ומקורות">?</button></span>
            </div>
        `);
    }

    // 3. What was uprooted.
    if (uprootedVesets.length) {
        const items = uprootedVesets.map(u => {
            const when = u.clearedAtAbs ? new HDate(u.clearedAtAbs).renderGematriya() : '';
            const by = u.clearedBy === 'interval'
                ? `עבר מניין הימים בלא ראייה (${u.interval.needed} ימים — ג' עונות, ויום הראייה עולה לכאן ולכאן)`
                : 'עברו ג\' זמני וסת רצופים, ובכל אחד מהם נבדקה בדיקה כדין';
            return `<li><b>${describeVeset(u.veset)}</b><br><small>נעקרה: ${by}${when ? ' — הושלמה ב' + when : ''}</small></li>`;
        }).join('');
        blocks.push(`
            <div class="dashboard-text">
                <strong>נעקרה הוסת הקבועה 🔄</strong>
                <ul style="margin: 8px 18px; padding: 0; line-height: 1.7;">${items}</ul>
                <span>משעה שנעקרה חוזרים לחול שלושת החששות הרגילים (חודש, הפלגה, עונה בינונית),
                ומעתה נקבעת וסת חדשה רק בחזקת ג' ראיות (או ד' להפלגה).
                <button class="help-dot" data-help="akira" type="button" aria-label="הסבר הלכתי ומקורות">?</button></span>
            </div>
        `);
    }

    // 3b. עונות מעורבות: שלש ראיות בעונה אחת והרביעית בעונה שכנגד — חוששת ליום וללילה
    // `[שט ל"ג | עמ' 112]`. It is shown because it both ADDS a concern (the opposite
    // ona, marked עו"מ) and explains why the completed pattern is NOT established.
    if (mixedOna.length) {
        const items = mixedOna.map(m => {
            const pattern = m.kind === 'month'
                ? `יום ${hebDayOfMonth(m.dayOfMonth)} בחודש`
                : `הפלגת ${m.spanLabel} ימים`;
            const dates = m.establishedBy.map(a => new HDate(a).renderGematriya()).join(', ');
            return `<li><b>${pattern}</b><br><small>נשלמה בעונת ${m.firstOna === 'night' ? 'לילה' : 'יום'} `
                + `(ראיות: ${dates}), והראייה האחרונה ב${new HDate(m.lastAbs).renderGematriya()} `
                + `היתה בעונת ${m.lastOna === 'night' ? 'לילה' : 'יום'}.</small></li>`;
        }).join('');
        blocks.push(`
            <div class="dashboard-text">
                <strong>עונות מעורבות — חוששת ליום וללילה</strong>
                <ul style="margin: 8px 18px; padding: 0; line-height: 1.7;">${items}</ul>
                <span>מפני חשש <b>הוסת הראשון</b> (העונה שבה נשלמה התבנית) ומפני חשש <b>השינוי</b> שהוא האחרון —
                ולכן הימים המסומנים בלוח ב-<b>עו"מ</b> הם אותה תבנית בעונה שכנגד, וכל שאר החששות ממשיכים לנהוג.
                ומכוח שינוי העונה אין התבנית נקבעת כוסת קבועה.
                <button class="help-dot" data-help="onot_meuravot" type="button" aria-label="הסבר הלכתי ומקורות">?</button></span>
            </div>
        `);
    }

    // 3b2. וסת הדילוג — תבנית מזוהה. היא מוצגת **לבירור עם רב**, ואינה נחששת
    // עד שהמתג דלוק (§5ב): "אין חוששים אלא א"כ הוקבעו באופן ודאי" `[ד"ט | עמ' 7]`.
    // אם המתג דלוק — המועמד נכנס ל-`standingVesets` ומוצג בסעיף "נקבעה וסת קבועה".
    const dilugCandidates = (computed && computed.dilugCandidates) || [];
    const dilugStanding = established.some(v => v.kind === 'dilug');
    if (dilugCandidates.length && !dilugStanding) {
        const items = dilugCandidates.map(c => {
            const dates = (c.establishedBy || []).map(a => new HDate(a).renderGematriya()).join(', ');
            return `<li><b>${c.label}</b><br><small>ראיות בתבנית: ${dates}`
                + ` · עונת ${c.ona === 'night' ? 'לילה' : 'יום'}</small></li>`;
        }).join('');
        blocks.push(`
            <div class="dashboard-text">
                <strong>וסת הדילוג — תבנית לבירור</strong>
                <ul style="margin: 8px 18px; padding: 0; line-height: 1.7;">${items}</ul>
                <span>התאריכים ערוכים לפניך כדי שתוכלי להבחין בכך — ולכן התבנית מוצגת, ואין
                חוששים לה עד שהוקבעה באופן ודאי. הספר הזהיר על כך במפורש: "כיון דבוסתות
                לא שכיחות אין חוששים אלא א״כ הוקבעו באופן ודאי… [דאל״כ נמצא דהרבה נשים
                יהא להן וסת הדילוג ווסת השבוע]". <b>יש לברר עם רב</b> אם יש כאן וסת דילוג,
                ואם כן — לחשב על פיו את יום החשש (יש לכך מתג בהגדרות).
                <button class="help-dot" data-help="mishalvim" type="button" aria-label="הסבר הלכתי ומקורות">?</button></span>
            </div>
        `);
    }

    // 3b3. "צירוף למפרע" (§3.1) — תבנית מזוהה. הספר מגדיר את הכלל ש"וסת קצר אינו
    // עוקר וסת הארוך" בשם הגר"ז והבית מאיר, וכותב עליו "אבל הוא רק לחומרא בעלמא
    // ולא מעיקרא דדינא" `[שט ל"ג | עמ' 112]`. ולכן — כדרכה של המערכת במקום הזה —
    // התבנית מוצגת לבירור, ואינה נחששת אלא כשהמתג דלוק (אז היא בסעיף "נקבעה וסת").
    const chibur = (computed && computed.chiburCandidate) || null;
    const chiburStanding = established.some(v => v.viaChibur === true);
    if (chibur && !chiburStanding) {
        const dates = (chibur.establishedBy || []).map(a => new HDate(a).renderGematriya()).join(', ');
        const gaps = (chibur.gapSpans || []).map(s => s + 1).join(', ');
        blocks.push(`
            <div class="dashboard-text">
                <strong>וסת ההפלגה — תבנית של צירוף למפרע</strong>
                <ul style="margin: 8px 18px; padding: 0; line-height: 1.7;">
                    <li><b>${describeVeset(chibur)}</b><br><small>הראיות בתבנית: ${dates}`
                        + ` · הפלגות מפסיקות (קצרות): ${gaps} ימים</small></li>
                </ul>
                <span>שלש ההפלגות השוות של ${chibur.spanLabel} ימים מצטרפות להיות
                "שלש הפלגות" שלו, אף שביניהן ראתה בהפלגה קצרה ממנו: "ומה שבאמצע ראתה
                בהפלגת כ' אינו מקלקל קביעות הוסת כיון שוסת קצר אינו עוקר וסת הארוך".
                ומכל מקום הספר מגדיר את הדין הזה "<b>רק לחומרא בעלמא ולא מעיקרא
                דדינא</b>", ולכן אינו נחשב אצלנו מעצמו. <b>יש לברר עם רב</b> — ואם
                כן, יש לחשב על פיו את יום החשש (יש לכך מתג בהגדרות).
                <button class="help-dot" data-help="chibur_lemafrea" type="button" aria-label="הסבר הלכתי ומקורות">?</button></span>
            </div>
        `);
    }

    // 3c. וסת הגוף ווסת המורכב (B2 — js/vesetGuf.js).
    // המיחוש הוא הסימן, ולכן וסת הגוף אינה תלויה בתאריך אלא בהופעת המיחוש —
    // ואין לה תאריך לסמן בלוח. הסימון שעל גבי יום הראייה מלמד שתועד מיחוש, והסעיף
    // הזה מבאר את דינו: משעה שבאו המיחושים אסורה, ובג' פעמים נקבעת וסת
    // `[שט ל"ט | עמ' 158]`. והווסת המורכב (יום + מיחוש) מוסיף סימון על היום עצמו —
    // "שצריכה לחשוש באותו היום אף קודם שבא המיחוש" `[שט כ"ז | עמ' 49]`.
    const bodyVeset = engineData && engineData.bodyVeset;
    const bodyDisplaced = (bodyVeset && bodyVeset.displaced) || [];
    const bodyActive = bodyVeset && bodyVeset.configured &&
        ((bodyVeset.bySign || []).length > 0 || (bodyVeset.compound || []).length > 0 || bodyDisplaced.length > 0);

    if (bodyActive) {
        const timesText = (n) => (n === 1 ? 'פעם אחת' : (n === 2 ? 'פעמיים' : `${n} פעמים`));
        const signItems = bodyVeset.bySign.map(s => {
            const dates = s.sightings.map(a => new HDate(a).renderGematriya()).join(', ');
            const status = s.fixed
                ? `נקבעה לה וסת הגוף לאותו מיחוש — ג' פעמים`
                : `חוששת לו כדין וסת שאינו קבוע (${timesText(s.count)})`;
            return `<li><b>${s.label}</b> — ${status}<br><small>הראיות שסומנו: ${dates}</small></li>`;
        }).join('');

        const compoundItems = (bodyVeset.compound || []).map(c => {
            const pattern = c.kind === 'month'
                ? `יום ${hebDayOfMonth(c.dayOfMonth)} בחודש`
                : `הפלגת ${c.spanLabel} ימים`;
            const dates = c.establishedBy.map(a => new HDate(a).renderGematriya()).join(', ');
            return `<li><b>וסת מורכב — ${pattern} יחד עם ${c.signLabel}</b><br><small>נקבע בג' ראיות רצופות `
                + `שבהן גם היום וגם המיחוש: ${dates}. חוששת באותו היום אף קודם שבא המיחוש —
                שמא בשעת תשמיש יבוא המיחוש ותראה.</small></li>`;
        }).join('');

        const displacedItems = bodyDisplaced.map(d => {
            const pattern = d.compound.kind === 'month'
                ? `יום ${hebDayOfMonth(d.compound.dayOfMonth)} בחודש`
                : `הפלגת ${d.compound.spanLabel} ימים`;
            return `<li>וסת מורכב — ${pattern} יחד עם ${d.compound.signLabel} — ${d.text}</li>`;
        }).join('');

        // וסת קבועה של ימים שהוחלפה בוסת מורכב — מוצגת, ולא נעלמת מן הפאנל.
        const replacedVesets = (computed.suppressed || []).filter(s => s.why === 'compound');

        const noteList = (bodyVeset.notes || []).map(n => {
            const mark = n.level === 'dispute' ? '⚠️ מחלוקת'
                : (n.level === 'strict' ? '⚠️ לחומרא' : 'ℹ️');
            return `<li>${mark} — <b>${n.title}</b><br>${n.text}
                <small style="white-space:nowrap;">${n.source}</small></li>`;
        }).join('');

        const separated = bodyVeset.fixedBody.length
            ? 'עם הופעת המיחוש — אסורה כדין שעת הוסת, ואם עבר המיחוש ולא ראתה אסורה עד שתבדוק.'
            : 'עדיין לא נקבעה וסת הגוף לאותו מיחוש, ואף על פי כן עם הופעתו אסורה כדין שעת הוסת.';

        blocks.push(`
            <div class="dashboard-text">
                <strong>וסת הגוף — מיחושים שתועדו</strong>
                <span>"משעה שבאו המיחושים אסורה כדין שעת הוסת", ו"כל שקבעה לה
                שלשה פעמים הרי זה וסת". ${separated}
                <button class="help-dot" data-help="veset_haguf" type="button" aria-label="הסבר הלכתי ומקורות">?</button></span>
                <ul style="margin: 8px 18px; padding: 0; line-height: 1.7;">${signItems}${compoundItems}${displacedItems}</ul>
                ${noteList ? '<ul style="margin: 8px 18px; padding: 0; line-height: 1.7;">' + noteList + '</ul>' : ''}
                ${replacedVesets.length
                    ? '<small>מה שהוחלף: ' + replacedVesets.map(s => `${s.reason} — ${s.text}`).join(' · ') + '</small>'
                    : ''}
                ${(engineData.bodyVeset.unauditedSigns || []).length
                    ? '<small>מיחושים שתועדו על ראייה שאינה נספרת לחזקה: ' + engineData.bodyVeset.unauditedSigns
                        .map(u => `${new HDate(u.abs).renderGematriya()} — ${u.signs.map(bodySignLabel).join(', ')} (${u.reason})`)
                        .join(' · ') + '</small>'
                    : ''}
            </div>
        `);
    }

    // 4. A dispute the app refuses to decide.
    if (returnDispute.length) {
        const items = returnDispute.map(d =>
            `<li>${describeVeset(d.veset)} — ראיות בתבנית זו לאחר העקירה: ${d.sightings.map(a => new HDate(a).renderGematriya()).join(', ')}</li>`
        ).join('');
        blocks.push(`
            <div class="dashboard-text">
                <strong>מחלוקת — חזרת וסת שנעקרה</strong>
                <ul style="margin: 8px 18px; padding: 0; line-height: 1.7;">${items}</ul>
                <span>המקור כותב שאם תחזור ותראה שוב באותה תבנית — "חזר הוסת למקומו אף שנעקר",
                והש"ך בנקודות הכסף נחלק עליו. <b>מחלוקת — יש לשאול רב.</b>
                האפליקציה אינה מכריעה: אינה מסמנת זמן זה כווסת קבוע.
                <button class="help-dot" data-help="machloket" type="button" aria-label="הסבר הלכתי ומקורות">?</button></span>
            </div>
        `);
    }

    if (uprootedConcerns.length) {
        blocks.push(`
            <div class="dashboard-text">
                <strong>חששות שעבר זמנם — נעקרו</strong>
                <span>${uprootedConcerns.length} זמני פרישה שעברו בלא ראייה נעקרו, והם מסומנים בלוח בעמימות
                עם ציון "נעקר" — כדי שיישארו כתיעוד, בלי להיראות כחובה בתוקף.
                <button class="help-dot" data-help="akira_not_kavua" type="button" aria-label="הסבר הלכתי ומקורות">?</button></span>
            </div>
        `);
    }

    if (excluded.length) {
        // Show the most recent exclusions - older ones are already reflected in
        // what has (or has not) been established.
        const recent = excluded.slice(-4);
        const more = excluded.length > recent.length
            ? `<br><small>ועוד ${excluded.length - recent.length} ראיות שאינן נספרות.</small>`
            : '';
        const items = recent.map(e =>
            `<li>${new HDate(e.abs).renderGematriya()} — ${e.text}</li>`
        ).join('');
        blocks.push(`
            <div class="dashboard-text">
                <strong>ראיות שתועדו ואינן נספרות לקביעת וסת</strong>
                <ul style="margin: 8px 18px; padding: 0; line-height: 1.7;">${items}</ul>
                ${more}
            </div>
        `);
    }

    if (warnings.length) {
        // The user marked a bleeding as "continued" while the day-count says it
        // cannot be - the engine refuses to guess, and says so instead.
        const items = warnings.slice(-4).map(w =>
            `<li>${new HDate(w.abs).renderGematriya()} — ${w.text}</li>`
        ).join('');
        blocks.push(`
            <div class="dashboard-text">
                <strong>⚠️ נתונים שאינם מתיישבים זה עם זה</strong>
                <ul style="margin: 8px 18px; padding: 0; line-height: 1.7;">${items}</ul>
            </div>
        `);
    }

    container.className = 'dashboard ' + (
        pendingChecks.length ? 'dash-red'
            : (established.length ? 'dash-green'
                : (uprootedVesets.length ? 'dash-blue'
                    : ((warnings.length || mixedOna.length || bodyVesetAny) ? 'dash-orange' : 'dash-yellow'))));
    container.innerHTML = blocks.join('');
    container.style.display = 'block';
}

/**
 * Render calculated cycle rows inside the summary table.
 */
export function renderSummaryTable(engineData) {
    const tbody = document.querySelector('#veset-table tbody');
    if (!tbody) return;

    const reiyot = engineData.reiyot || [];
    const chazaka = engineData.chazaka;
    const activeVesets = engineData.standingVesets
        ? engineData.standingVesets
        : (engineData.akirot ? engineData.akirot.active.map(f => f.veset) : (chazaka ? chazaka.established : []));

    tbody.innerHTML = '';

    // מסולקת דמים: the rows below are the woman's own record, but the concerns in
    // them no longer apply to her - say so instead of leaving the table looking binding.
    const life = engineData.life;
    if (life && life.silek) {
        const labels = (life.silekLabels || []).join(', ');
        const silekBanner = document.createElement('tr');
        silekBanner.innerHTML = `
            <td colspan="5" style="background: rgba(37,99,235,0.10); text-align: center; line-height: 1.6;">
                <b>מסולקת דמים (${labels}):</b> החששות המפורטים בטבלה אינם נוהגים לה —
                אין חוששין לוסתות שהיו לה קודם שנסתלקה, והיא פטורה מבדיקה.
                וכלל זה אינו חל על ראייה שתראה בתוך זמן הסילוק.
                <button class="help-dot" data-help="life_state" type="button" aria-label="הסבר הלכתי ומקורות">?</button>
            </td>
        `;
        tbody.appendChild(silekBanner);
    } else if (life && life.dormancy && life.dormancy.ended) {
        // The dormancy is over: what is listed in the table is her record from BEFORE
        // it (or from within it), and it does not come back - she returns only to the
        // veset that was fixed before `[שט כ"ט | עמ' 71]`.
        const returned = engineData.standingVesets.filter(v => v.restored === true);
        const returnedText = returned.length
            ? ` והוסתות שחזרו הן: ${returned.map(v => describeVeset(v)).join(' · ')}.`
            : '';
        const silekReturned = document.createElement('tr');
        silekReturned.innerHTML = `
            <td colspan="5" style="background: rgba(37,99,235,0.10); text-align: center; line-height: 1.6;">
                <b>תם הסילוק:</b> החששות המפורטים בטבלה — מה שהיה קודם לסילוק או בתוכו —
                אינם חוזרים, שאינה שבה אלא לוסתה שהיתה קבועה קודם הסילוק.${returnedText}
                <button class="help-dot" data-help="silek_return" type="button" aria-label="הסבר הלכתי ומקורות">?</button>
            </td>
        `;
        tbody.appendChild(silekReturned);
    }

    // When a fixed veset was established, everything in the three middle columns
    // is set aside. Say so at the top of the table instead of leaving the user to
    // wonder whether those concerns still apply.
    if (activeVesets.length) {
        const banner = document.createElement('tr');
        banner.innerHTML = `
            <td colspan="5" style="background: rgba(16,185,129,0.12); text-align: center; line-height: 1.6;">
                <b>נקבעה וסת קבועה:</b> ${activeVesets.map(v => describeVeset(v)).join(' · ')}
                — מכוחה אין חוששים לשאר החששות שבטבלה.
                <button class="help-dot" data-help="kviut" type="button" aria-label="הסבר הלכתי ומקורות">?</button>
            </td>
        `;
        tbody.appendChild(banner);
    }

    if (reiyot.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td colspan="5">
                <div class="empty-state">
                    <div style="color: var(--text-muted); margin-bottom: 12px; width: 48px; height: 48px; display: inline-block;">${ICONS.CALENDAR}</div>
                    <h4>אין עדיין רישומי וסתות</h4>
                    <p>כאשר תזינו תחילת ראייה בלוח השנה, המערכת תציג כאן את תאריכי הפרישה באופן אוטומטי.</p>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
        return;
    }

    // כל ערך בטבלה נושא בועת הסבר משלו, כדי שלא יישאר מספר בלא מראה מקום.
    const dot = (topic) => `<button class="help-dot" data-help="${topic}" type="button"`
        + ` aria-label="הסבר הלכתי ומקורות">?</button>`;

    [...reiyot].reverse().forEach(r => {
        const tr = document.createElement('tr');
        const onaStr = r.ona === 'day' ? 'עונת יום' : 'עונת לילה';
        
        const yh = r.yomHachodesh || getYomHachodeshInfo(r.hdate);
        let yomHachodeshStr;
        if (yh.entries.length === 1) {
            yomHachodeshStr = `${new HDate(yh.entries[0].abs).renderGematriya()}<br><small>${onaStr}</small>`;
        } else if (yh.entries.length > 1) {
            // Sighting on the 30th of a month whose successor has only 29 days:
            // the poskim disagree, so all candidate days are shown and the user is
            // told to ask a rabbi (`getYomHachodeshInfo`; docs/DECISIONS.md).
            const dates = yh.entries.map(e => new HDate(e.abs).renderGematriya()).join(' <span style="color:var(--orange);">או</span> ');
            yomHachodeshStr = `${dates}<br><small style="color:var(--orange);">מחלוקת (${yh.entries.length} דעות) - יש לשאול רב</small>${dot('yom_hachodesh')}`;
        } else {
            yomHachodeshStr = '<span style="color:var(--text-muted);">לא קיים בחודש הבא</span>';
        }

        const notes = [];
        if (r.establishing) {
            notes.push('<small style="color:var(--green);">ממנה נקבעת הוסת</small>' + dot('kviut'));
        }
        // B2 — המיחוש שתועד על הראייה (וסת הגוף).
        const signCodes = Array.isArray(r.signs) ? r.signs : [];
        if (signCodes.length) {
            notes.push('<small style="color:#7e22ce;">מיחוש וסת הגוף: ' + signCodes.map(bodySignLabel).join(', ') + '</small>' + dot('veset_haguf'));
        }
        if (r.counted === false && r.exclusion) {
            notes.push('<small style="color:var(--orange);">לא נספרת לחזקה: ' + r.exclusion.text + '</small>' + dot('reiyah_kind'));
        }

        tr.innerHTML = `
            <td><b>${r.hdate.renderGematriya()}</b><br><span style="color:var(--text-muted); font-size:0.85em;">(${onaStr})</span>${notes.length ? '<br>' + notes.join('<br>') : ''}</td>
            <td><strong style="color:var(--primary); font-size:1.1em;">${r.haflagahDiff ? r.haflagahDiff : '-'}</strong></td>
            <td>${new HDate(r.abs + 29).renderGematriya()}<br><small>${onaStr}</small><br><span style="color:var(--text-muted); font-size:0.85em;">וגם ${new HDate(r.abs + 30).renderGematriya()}</span></td>
            <td>${yomHachodeshStr}</td>
            <td>${r.nextHaflagahDate ? '<b>' + r.nextHaflagahDate.renderGematriya() + '</b>' + '<br><small>' + onaStr + '</small>' : '-'}</td>
        `;
        tbody.appendChild(tr);
    });
}
