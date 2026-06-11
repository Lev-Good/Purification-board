import { HDate } from '../hebcal.js';
import { getMonthsInYear } from './calculations.js';
import { ICONS } from './icons.js';

const HEB_DAYS = ["", "א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ז'", "ח'", "ט'", "י'", "י\"א", "י\"ב", "י\"ג", "י\"ד", "ט\"ו", "ט\"ז", "י\"ז", "י\"ח", "י\"ט", "כ'", "כ\"א", "כ\"ב", "כ\"ג", "כ\"ד", "כ\"ה", "כ\"ו", "כ\"ז", "כ\"ח", "כ\"ט", "ל'"];

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
 * Update the visual cycle status dashboard.
 */
export function updateDashboard(db, engineData) {
    const todayAbs = new HDate().abs();
    const dashContainer = document.getElementById('dashboard-container');
    if (!dashContainer) return;
    
    dashContainer.className = 'dashboard';

    // 1. Retirement warnings take first priority
    if (engineData.computed.prishot[todayAbs]) {
        const list = engineData.computed.prishot[todayAbs];
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
 * Builds HTML grid content for a single Hebrew month.
 */
export function buildMonthGridHTML(month, year, db, engineData, isYearly = false) {
    const computed = engineData.computed;
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

        if (db[abs]) {
            if (db[abs].note) {
                noteHTML = `<span class="note-icon" title="${db[abs].note}">${ICONS.NOTE}</span>`;
            }
            if (db[abs].type === 'reiyah') {
                if (db[abs].ona === 'day') {
                    bottomMarkers += `<div class="marker bg-red" title="ראיית יום">${ICONS.FLAG}<span>ראיית יום</span></div>`;
                } else {
                    topMarkers += `<div class="marker bg-red" title="ראיית לילה">${ICONS.FLAG}<span>ראיית לילה</span></div>`;
                }
            }
            if (db[abs].type === 'hefsek') {
                bottomMarkers += `<div class="marker bg-yellow" title="הפסק טהרה">${ICONS.SUN_SPARK}<span>הפסק טהרה</span></div>`;
            }
            if (db[abs].type === 'tevilah') {
                let nextDayHebrew = HEB_DAYS[new HDate(abs + 1).getDate()];
                bottomMarkers += `<div class="marker bg-blue" title="הלילה טבילה">${ICONS.WAVES}<span>טבילה (${nextDayHebrew})</span></div>`;
            }
        }

        // Clean days marking
        if (computed.nekiim.includes(abs)) {
            bottomMarkers += `<div class="marker bg-green" title="שבעה נקיים">${ICONS.SHIELD}<span>נקיים</span></div>`;
        }

        // Immersion prediction
        if (computed.tevilot.includes(abs) && (!db[abs] || db[abs].type !== 'tevilah')) {
            let nextDayHebrew = HEB_DAYS[new HDate(abs + 1).getDate()];
            bottomMarkers += `<div class="marker bg-blue" style="opacity:0.85; border: 1px dashed white;" title="צפי טבילה הלילה">${ICONS.WAVES}<span>צפי טבילה (${nextDayHebrew})</span></div>`;
            bgStyle = 'background-color: var(--input-bg); border-color: var(--blue);';
        }

        // Separation dates (prishot)
        if (computed.prishot[abs]) {
            let nList = computed.prishot[abs].filter(p => p.ona === 'night');
            let dList = computed.prishot[abs].filter(p => p.ona === 'day');
            
            if (nList.length > 0) {
                let codeList = [...new Set(nList.map(p => p.code))].join(', ');
                let tooltipText = nList.map(p => p.reason).join('\n');
                topMarkers += `<div class="marker bg-orange" title="${tooltipText}">${ICONS.CLOCK}<span>פרישת לילה (${codeList})</span></div>`;
            }
            
            if (dList.length > 0) {
                let codeList = [...new Set(dList.map(p => p.code))].join(', ');
                let tooltipText = dList.map(p => p.reason).join('\n');
                bottomMarkers += `<div class="marker bg-orange" title="${tooltipText}">${ICONS.CLOCK}<span>פרישת יום (${codeList})</span></div>`;
            }
        }

        // Highlight today
        if (abs === new HDate().abs()) {
            classes.push("day-today");
        }

        const animDelay = isYearly ? '0s' : `${day * 0.01}s`;

        html += `
            <div class="${classes.join(' ')}" style="${bgStyle} animation-delay: ${animDelay};" onclick="window.openDayModal(new window.HDateLocal(${abs}))">
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
            yearlyWrapper.style.display = 'grid';
            yearlyWrapper.innerHTML = '';
            
            const currentYearStr = new HDate(1, 1, currentHDate.getFullYear()).renderGematriya().split(' ').pop();
            if (monthTitle) monthTitle.innerText = `תצוגה שנתית: שנת ${currentYearStr}`;
            
            const maxMonths = getMonthsInYear(currentHDate.getFullYear());
            for (let m = 1; m <= maxMonths; m++) {
                const monthDiv = document.createElement('div');
                monthDiv.className = 'yearly-month-box';
                monthDiv.innerHTML = buildMonthGridHTML(m, currentHDate.getFullYear(), db, engineData, true);
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
    renderSummaryTable(engineData.reiyot);
    updateDashboard(db, engineData);
}

/**
 * Render calculated cycle rows inside the summary table.
 */
export function renderSummaryTable(reiyot) {
    const tbody = document.querySelector('#veset-table tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';

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

    [...reiyot].reverse().forEach(r => {
        const tr = document.createElement('tr');
        const onaStr = r.ona === 'day' ? 'עונת יום' : 'עונת לילה';
        
        let yomHachodeshStr = '-';
        try {
            const maxMonths = getMonthsInYear(r.hdate.getFullYear());
            const nextMonth = r.hdate.getMonth() === maxMonths ? 1 : r.hdate.getMonth() + 1;
            const nextYear = r.hdate.getMonth() === maxMonths ? r.hdate.getFullYear() + 1 : r.hdate.getFullYear();
            yomHachodeshStr = `${new HDate(r.hdate.getDate(), nextMonth, nextYear).renderGematriya()}<br><small>${onaStr}</small>`;
        } catch (e) {
            yomHachodeshStr = '<span style="color:var(--text-muted);">לא קיים בחודש הבא</span>';
        }

        tr.innerHTML = `
            <td><b>${r.hdate.renderGematriya()}</b><br><span style="color:var(--text-muted); font-size:0.85em;">(${onaStr})</span></td>
            <td><strong style="color:var(--primary); font-size:1.1em;">${r.haflagahDiff ? r.haflagahDiff : '-'}</strong></td>
            <td>${new HDate(r.abs + 29).renderGematriya()}<br><small>${onaStr}</small></td>
            <td>${yomHachodeshStr}</td>
            <td>${r.nextHaflagahDate ? '<b>' + r.nextHaflagahDate.renderGematriya() + '</b>' + '<br><small>' + onaStr + '</small>' : '-'}</td>
        `;
        tbody.appendChild(tr);
    });
}
