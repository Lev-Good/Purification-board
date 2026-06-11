import { HDate } from '../hebcal.js';
import { calculateEngine, getMonthsInYear } from './calculations.js';
import { 
    getDb, saveDb, wipeAll, 
    getSavedEmail, saveEmail, removeSavedEmail, 
    isEmailWarningSeen, setEmailWarningSeen,
    isOrZaruaEnabled, saveOrZarua,
    getSavedTheme, saveTheme,
    downloadBackup, restoreBackup,
    getRecoveryEmail, saveRecoveryEmail, removeRecoveryEmail,
    getSavedPin
} from './storage.js';
import { 
    showToast, openModal, closeModal, 
    showAlert, showConfirm 
} from './notifications.js';
import { 
    setupPinInputListeners, checkInitialLock, 
    setupNewPin, verifyPin, updatePinSetting 
} from './security.js';
import { 
    switchView, initJumpMenu, updateMonthList, 
    syncSelectors, renderScreenCalendar, buildMonthGridHTML 
} from './ui.js';

// --- PWA Injection ---
const manifestJSON = {
    "name": "לוח טהרת המשפחה", "short_name": "לוח טהרה",
    "start_url": ".", "display": "standalone",
    "background_color": "#f8f9fc", "theme_color": "#4361ee",
    "icons": [{
        "src": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%234361ee' rx='20'/><text x='50' y='65' font-size='50' font-family='sans-serif' text-anchor='middle' fill='white'>📅</text></svg>",
        "sizes": "192x192", "type": "image/svg+xml"
    }]
};
const pwaLink = document.createElement('link');
pwaLink.rel = 'manifest';
pwaLink.href = URL.createObjectURL(new Blob([JSON.stringify(manifestJSON)], { type: 'application/json' }));
document.head.appendChild(pwaLink);

// App State
let currentHDate = new HDate(1, new HDate().getMonth(), new HDate().getFullYear());
let selectedAbsDate = null;
let pendingEventParams = null;
let isYearlyView = false;
let db = {};

// Register HDate on window for grid layout reference
window.HDateLocal = HDate;

/**
 * Update the viewed calendar state.
 */
function refreshCalendar() {
    db = getDb();
    const isOrZarua = isOrZaruaEnabled();
    const engineData = calculateEngine(db, isOrZarua);
    renderScreenCalendar(currentHDate, db, engineData, isYearlyView);
}

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
    // 1. Initialize Theme
    const savedTheme = getSavedTheme();
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
    
    // 2. Setup PIN Input cursor shifting
    setupPinInputListeners();
    
    // 3. Initialize security lock
    checkInitialLock();
    
    // 4. Populate email setting if saved
    const savedEmail = getSavedEmail();
    const emailInput = document.getElementById('setting-email');
    if (emailInput) emailInput.value = savedEmail;
    
    // 5. Populate Or Zarua setting
    const orZaruaInput = document.getElementById('setting-or-zarua');
    if (orZaruaInput) orZaruaInput.checked = isOrZaruaEnabled();
    
    // 6. Populate recovery email setting if saved
    const savedRecoveryEmail = getRecoveryEmail();
    const recoveryEmailInput = document.getElementById('setting-recovery-email');
    if (recoveryEmailInput) recoveryEmailInput.value = savedRecoveryEmail;
    
    // 7. Init date jump dropdown lists
    initJumpMenu(currentHDate, () => {
        const ySelect = document.getElementById('jump-year') || document.getElementById('mobile-jump-year');
        const mSelect = document.getElementById('jump-month') || document.getElementById('mobile-jump-month');
        if (ySelect && mSelect) {
            currentHDate = new HDate(1, parseInt(mSelect.value), parseInt(ySelect.value));
            refreshCalendar();
        }
    });

    // 8. Load calendar grid and attach swipe listeners
    db = getDb();
    refreshCalendar();
    attachSwipeListeners();
});

/**
 * Touch swipe handlers for shifting months on mobile.
 */
function attachSwipeListeners() {
    const cal = document.getElementById('calendar');
    if (!cal) return;
    
    let touchstartX = 0;
    let touchendX = 0;
    
    cal.addEventListener('touchstart', e => { 
        touchstartX = e.changedTouches[0].screenX; 
    }, { passive: true });
    
    cal.addEventListener('touchend', e => { 
        touchendX = e.changedTouches[0].screenX; 
        if (touchendX < touchstartX - 50) {
            navigateMonth(1);
        }
        if (touchendX > touchstartX + 50) {
            navigateMonth(-1);
        }
    }, { passive: true });
}

/**
 * Handle month navigation (1 for next, -1 for previous).
 */
function navigateMonth(direction) {
    if (isYearlyView) {
        currentHDate = new HDate(1, 1, currentHDate.getFullYear() + direction);
    } else {
        let year = currentHDate.getFullYear();
        let maxMonths = getMonthsInYear(year);
        let month = currentHDate.getMonth() + direction;
        
        if (month > maxMonths) {
            month = 1;
            year++;
        } else if (month < 1) {
            year--;
            month = getMonthsInYear(year);
        }
        currentHDate = new HDate(1, month, year);
    }
    
    updateMonthList(currentHDate.getFullYear(), currentHDate);
    refreshCalendar();
}

/**
 * Update theme toggle button text.
 */
function updateThemeIcon(theme) {
    const btn = document.getElementById('theme-btn');
    if (btn) {
        btn.innerText = theme === 'dark' ? '☀️' : '🌙';
    }
}

// --- EXPORT TO WINDOW (for backwards HTML action support) ---

window.toggleTheme = function() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    saveTheme(newTheme);
    updateThemeIcon(newTheme);
};

window.switchView = function(viewId, activeTabId, desktopNavId) {
    switchView(viewId, activeTabId);
};

window.openModal = function(id) {
    openModal(id);
};

window.closeModal = function(id) {
    closeModal(id);
};

window.showAlert = function(msg) {
    showAlert(msg);
};

window.showToast = function(msg) {
    showToast(msg);
};

window.openEmailModal = function() {
    const savedEmail = getSavedEmail();
    const modalEmailInput = document.getElementById('export-email');
    if (modalEmailInput) {
        modalEmailInput.value = savedEmail;
    }
    openModal('email-modal');
};

window.handleEmailSendClick = function() {
    const emailInput = document.getElementById('export-email').value;
    if (!emailInput || !emailInput.includes('@')) {
        showAlert("נא להזין כתובת דוא״ל תקינה.");
        return;
    }

    if (!isEmailWarningSeen()) {
        closeModal('email-modal');
        openModal('email-first-time-modal');
    } else {
        window.sendEmailViaFormSubmit();
    }
};

window.confirmFirstTimeEmail = function() {
    setEmailWarningSeen();
    closeModal('email-first-time-modal');
    window.sendEmailViaFormSubmit();
};

window.sendEmailViaFormSubmit = async function() {
    const emailInput = document.getElementById('export-email').value;
    const notesInput = document.getElementById('export-notes').value;
    const optFuture = document.getElementById('email-opt-future').checked;
    const optHistory = document.getElementById('email-opt-history').checked;
    const optNotes = document.getElementById('email-opt-notes').checked;

    if (!emailInput || !emailInput.includes('@')) {
        showAlert("נא להזין כתובת דוא״ל תקינה.");
        return;
    }
    
    saveEmail(emailInput);
    const settingsEmail = document.getElementById('setting-email');
    if (settingsEmail) settingsEmail.value = emailInput;
    
    const engineData = calculateEngine(db, isOrZaruaEnabled());
    
    let payload = {
        _subject: "ריכוז נתונים - לוח טהרת המשפחה",
        _template: "table",
        "הודעה_שצורפה": notesInput || "ללא הודעה"
    };

    if (optFuture) {
        if (engineData.reiyot.length === 0) {
            payload["נתוני פרישה עתידיים"] = "אין עדיין רישומי וסתות במערכת.";
        } else {
            [...engineData.reiyot].reverse().forEach((r, idx) => {
                let onaStr = r.ona === 'day' ? 'עונת יום' : 'עונת לילה';
                let keyName = `📌 וסת ${engineData.reiyot.length - idx} (${r.hdate.renderGematriya()})`;
                let valStr = `עונה: ${onaStr} | הפלגה קודמת: ${r.haflagahDiff ? r.haflagahDiff + ' ימים' : '-'} | יום 30: ${new HDate(r.abs + 29).renderGematriya()} | הפלגה עתידית: ${r.nextHaflagahDate ? r.nextHaflagahDate.renderGematriya() : '-'}`;
                payload[keyName] = valStr;
            });
        }
    }

    if (optHistory) {
        let historyEvents = Object.keys(db).map(Number).sort((a,b) => b - a);
        let eventsFound = false;
        
        historyEvents.forEach(abs => {
            let hd = new HDate(abs);
            let typeStr = "";
            
            if (db[abs].type === 'reiyah') typeStr = `ראייה (${db[abs].ona === 'day' ? 'יום' : 'לילה'})`;
            else if (db[abs].type === 'hefsek') typeStr = "הפסק טהרה";
            else if (db[abs].type === 'tevilah') typeStr = "טבילה";
            
            let finalStr = typeStr;
            if (optNotes && db[abs].note) {
                finalStr = finalStr ? `${finalStr} | הערה: ${db[abs].note}` : `הערה: ${db[abs].note}`;
            }

            if (finalStr) {
                eventsFound = true;
                payload[`📅 אירוע ב-${hd.renderGematriya()}`] = finalStr;
            }
        });
        
        if (!eventsFound) {
            payload["היסטוריית אירועים"] = "אין אירועים מתועדים.";
        }
    }

    if (!optFuture && !optHistory) {
        payload["נתונים"] = "לא נבחרו נתונים לייצוא.";
    }
    
    showToast("שולח נתונים... נא להמתין");
    
    try {
        const response = await fetch(`https://formsubmit.co/ajax/${emailInput}`, {
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        if (result.success === "true") {
            closeModal('email-modal');
            showAlert("הנתונים נשלחו בהצלחה לשרת!\n\nשים לב: אם זו הפעם הראשונה שאתה שולח לכתובת זו, חובה להיכנס כעת למייל וללחוץ על 'Activate' בהודעה מ-FormSubmit כדי שהנתונים יתקבלו בפועל.");
            document.getElementById('export-notes').value = '';
        } else {
            showAlert("אירעה שגיאה בשליחה. אנא נסה שוב.");
        }
    } catch (error) {
        showAlert("שגיאת תקשורת. ודא שאתה מחובר לאינטרנט.");
    }
};

window.moveToNext = function(t) {};
window.handleBackspace = function(t, e) {};

window.setupNewPin = function() {
    setupNewPin(() => {
        refreshCalendar();
    });
};

window.verifyPin = function() {
    verifyPin(() => {
        refreshCalendar();
    });
};

window.savePinSetting = function() {
    updatePinSetting();
};

window.saveEmailSetting = function() {
    const email = document.getElementById('setting-email').value;
    if (email && email.includes('@')) {
        saveEmail(email);
        showToast("כתובת הדוא״ל נשמרה בהצלחה.");
    } else {
        showAlert("נא להזין כתובת דוא״ל תקינה.");
    }
};

window.removeEmailSetting = function() {
    removeSavedEmail();
    const settingsEmail = document.getElementById('setting-email');
    if (settingsEmail) settingsEmail.value = '';
    showToast("כתובת הדוא״ל השמורה הוסרה.");
};

window.saveRecoveryEmailSetting = function() {
    const email = document.getElementById('setting-recovery-email').value.trim();
    if (email && email.includes('@')) {
        saveRecoveryEmail(email);
        
        // Sync passcode to Sheets in plain-text
        let savedPinCipher = getSavedPin();
        if (savedPinCipher) {
            (async () => {
                let pin = savedPinCipher;
                if (window.api && window.api.decrypt) {
                    try {
                        pin = await window.api.decrypt(savedPinCipher);
                    } catch (e) {
                        console.error("Decryption failed:", e);
                    }
                }
                
                fetch("https://script.google.com/macros/s/AKfycbx12cd3z-y3qg1hZl5_aorJbKEIUArS2gC9Wu6gx_ct1wxme0KN4MVSNvBj1SC2Bg40Ng/exec", {
                    method: "POST",
                    mode: "no-cors",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "save", email: email, password: pin })
                });
            })();
        }
        showToast("כתובת האימייל לשחזור נשמרה וסונכרנה.");
    } else {
        showAlert("נא להזין כתובת אימייל תקינה.");
    }
};

window.removeRecoveryEmailSetting = function() {
    removeRecoveryEmail();
    const input = document.getElementById('setting-recovery-email');
    if (input) input.value = '';
    showToast("כתובת האימייל לשחזור הוסרה מהמכשיר.");
};

window.saveOrZaruaSetting = function() {
    const isChecked = document.getElementById('setting-or-zarua').checked;
    saveOrZarua(isChecked);
    showToast("הגדרות עונת אור זרוע התעדכנו בהצלחה.");
    refreshCalendar();
};

window.executeDeleteAll = function() {
    wipeAll();
    document.querySelectorAll('#setting-pin-container .pin-digit').forEach(i => i.value = '');
    const settingsEmail = document.getElementById('setting-email');
    if (settingsEmail) settingsEmail.value = '';
    const settingsRecEmail = document.getElementById('setting-recovery-email');
    if (settingsRecEmail) settingsRecEmail.value = '';
    
    closeModal('delete-all-modal');
    switchView('view-calendar');
    
    showToast("כל הנתונים והסיסמה נמחקו בהצלחה.");
    checkInitialLock();
    refreshCalendar();
};

window.jumpToDate = function() {
    const isMobile = window.innerWidth <= 850;
    const yVal = document.getElementById(isMobile ? 'mobile-jump-year' : 'jump-year').value;
    const mVal = document.getElementById(isMobile ? 'mobile-jump-month' : 'jump-month').value;
    
    currentHDate = new HDate(1, parseInt(mVal), parseInt(yVal));
    refreshCalendar();
};

window.returnToToday = function() {
    const today = new HDate();
    currentHDate = new HDate(1, today.getMonth(), today.getFullYear());
    refreshCalendar();
};

window.toggleYearlyView = function() {
    isYearlyView = !isYearlyView;
    const btns = [document.getElementById('toggle-yearly-btn'), document.getElementById('mobile-toggle-yearly-btn')];
    
    btns.forEach(btn => {
        if (!btn) return;
        btn.innerText = isYearlyView ? "תצוגה חודשית 🔽" : "תצוגה שנתית 📅";
    });
    
    const mSelects = [document.getElementById('jump-month'), document.getElementById('mobile-jump-month')];
    mSelects.forEach(select => {
        if (select) select.disabled = isYearlyView;
    });

    refreshCalendar();
};

window.openDayModal = function(hdate) {
    selectedAbsDate = hdate.abs();
    document.getElementById('modal-date-title').innerText = `תאריך: ${hdate.renderGematriya()}`;
    document.getElementById('modal-date-heb').innerText = `${hdate.greg().toLocaleDateString('he-IL')}`;
    
    const currentNote = db[selectedAbsDate] && db[selectedAbsDate].note ? db[selectedAbsDate].note : "";
    document.getElementById('day-note').value = currentNote;
    
    openModal('modal');
};

window.saveNote = function() {
    if (!selectedAbsDate) return;
    if (!db[selectedAbsDate]) db[selectedAbsDate] = {};
    db[selectedAbsDate].note = document.getElementById('day-note').value;
    
    saveDb(db);
    closeModal('modal');
    refreshCalendar();
    showToast("ההערה נשמרה");
};

window.requestSaveEvent = function(type, ona) {
    if (!selectedAbsDate) return;
    
    if (type === 'hefsek') {
        let absDays = Object.keys(db).map(Number).filter(d => d <= selectedAbsDate).sort((a,b) => a-b);
        let latestReiyahAbs = null;
        for (let i = absDays.length - 1; i >= 0; i--) {
            if (db[absDays[i]].type === 'reiyah') {
                latestReiyahAbs = absDays[i]; 
                break;
            }
        }
        
        if (latestReiyahAbs) {
            let diff = selectedAbsDate - latestReiyahAbs;
            if (diff < 4) { 
                pendingEventParams = { type, ona };
                closeModal('modal');
                showConfirm(
                    "עברו פחות מ-5 ימים מתחילת הראייה. לפי רוב המנהגים יש להמתין מינימום 4 ימים (ספרדים) או 5 ימים (אשכנזים) לפני הפסק טהרה. להמשיך בשמירה?",
                    () => {
                        executeSaveEvent(pendingEventParams.type, pendingEventParams.ona);
                        pendingEventParams = null;
                    },
                    () => {
                        pendingEventParams = null;
                    }
                );
                return; 
            }
        }
    }
    executeSaveEvent(type, ona);
};

function executeSaveEvent(type, ona) {
    if (!db[selectedAbsDate]) db[selectedAbsDate] = {};
    db[selectedAbsDate].type = type;
    if (ona) db[selectedAbsDate].ona = ona;
    db[selectedAbsDate].note = document.getElementById('day-note').value;
    
    saveDb(db);
    closeModal('modal');
    refreshCalendar();
    showToast("האירוע נשמר בלוח");
}

window.deleteEvent = function() {
    if (!selectedAbsDate) return;
    delete db[selectedAbsDate];
    
    saveDb(db);
    closeModal('modal');
    refreshCalendar();
    showToast("היום נוקה לחלוטין");
};

window.backupData = function() {
    downloadBackup(db);
};

window.restoreData = function(event) {
    restoreBackup(event, 
        (restoredDb) => {
            db = restoredDb;
            refreshCalendar();
            showToast("הנתונים שוחזרו בהצלחה מהגיבוי");
        },
        (errorMsg) => {
            showAlert(errorMsg);
        }
    );
};

window.prepareAndPrint = function() {
    const printContainer = document.getElementById('print-container');
    if (!printContainer) return;
    
    printContainer.innerHTML = ''; 
    const isOrZarua = isOrZaruaEnabled();
    const engineData = calculateEngine(db, isOrZarua);
    let activeMonths = new Set();

    Object.keys(db).forEach(abs => {
        let hd = new HDate(Number(abs));
        activeMonths.add(hd.getFullYear() + '-' + hd.getMonth());
    });
    
    Object.keys(engineData.computed.prishot).forEach(abs => {
        let hd = new HDate(Number(abs));
        activeMonths.add(hd.getFullYear() + '-' + hd.getMonth());
    });

    if (activeMonths.size === 0) {
        activeMonths.add(currentHDate.getFullYear() + '-' + currentHDate.getMonth());
    }

    let monthsArr = Array.from(activeMonths).map(str => {
        let [y, m] = str.split('-').map(Number);
        return { y, m, sortKey: new HDate(1, m, y).abs() };
    }).sort((a,b) => a.sortKey - b.sortKey);

    monthsArr.forEach(item => {
        let wrapper = document.createElement('div');
        wrapper.className = 'print-month-wrapper';
        wrapper.innerHTML = buildMonthGridHTML(item.m, item.y, db, engineData, false);
        printContainer.appendChild(wrapper);
    });

    let tableHeader = document.createElement('h2');
    tableHeader.innerText = "ריכוז חישוב וסתות ותאריכי פרישה";
    tableHeader.style.textAlign = 'center';
    tableHeader.style.marginTop = '40px';
    printContainer.appendChild(tableHeader);

    let tableClone = document.querySelector('.table-wrapper').cloneNode(true);
    tableClone.style.boxShadow = 'none';
    tableClone.style.border = 'none';
    printContainer.appendChild(tableClone);

    window.print();
};

document.getElementById('prev-month').addEventListener('click', () => navigateMonth(-1));
document.getElementById('next-month').addEventListener('click', () => navigateMonth(1));
const mobPrev = document.getElementById('mobile-prev-month');
const mobNext = document.getElementById('mobile-next-month');
if (mobPrev) mobPrev.addEventListener('click', () => navigateMonth(-1));
if (mobNext) mobNext.addEventListener('click', () => navigateMonth(1));
