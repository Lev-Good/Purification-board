import { HDate } from '../hebcal.js';
import { calculateEngine, getMonthsInYear, shiftHebrewMonth, getYomHachodeshInfo } from './calculations.js';
import { describeVeset } from './chazaka.js';
import { BODY_SIGNS, BODY_VESET_RULES, bodySignLabel, bodyReminder } from './vesetGuf.js';
import { CHECK_DEPTH_LABELS, isCheckPart, checkPartsOf, checkPartLabel } from './akira.js';
import {
    lifeStateSummary, PILL_TYPES, PILL_TYPE_DEFAULT,
    PILL_PAUSE_REASONS, PILL_PAUSE_REASON_DEFAULT, PILL_PAUSE_REASON_RULE
} from './lifeState.js';
import { 
    getDb, saveDb, wipeAll, 
    getSavedEmail, saveEmail, removeSavedEmail, 
    isEmailWarningSeen, setEmailWarningSeen,
    isOrZaruaEnabled, saveOrZarua,
    getLifeState, saveLifeState,
    getSavedTheme, saveTheme,
    downloadBackup, restoreBackup,
    getRecoveryEmail, saveRecoveryEmail, removeRecoveryEmail,
    getBodyReminderSeen, setBodyReminderSeen,
    getStringencies, saveStringencies,
    getSavedLocation, saveLocation,
    isLocalBackupEnabled, saveLocalBackupEnabled, getLocalBackupLast, setLocalBackupLast,
    getZoomLevel, saveZoomLevel,
    getNotificationsMode, saveNotificationsMode, getNotificationsLast, setNotificationsLast,
    getUpdateLastCheck, setUpdateLastCheck, getSnoozedUpdate, snoozeUpdate,
    getFirstUseAt, getManualBackupLast, requestPersistentStorage,
    getBackupReminderLastCheck, setBackupReminderLastCheck,
    getBackupReminderSnoozedUntil, snoozeBackupReminder,
    isCalendarSyncEnabled, saveCalendarSyncEnabled,
    getCalendarDiscretion, saveCalendarDiscretion,
    getCalendarDiscreetPrefix, saveCalendarDiscreetPrefix,
    isCalendarNotifyEmail, saveCalendarNotifyEmail,
    isCalendarNotifyPopup, saveCalendarNotifyPopup,
    getCalendarMorningTime, saveCalendarMorningTime,
    getCalendarHefsekAdvisoryDays, isMochDachukEnabled, saveMochDachukEnabled
} from './storage.js';
import { STRINGENCY_DEFS, normalizeStringencies, stringencyOn, MINHAG_PROFILES, detectMinhagProfile } from './stringencies.js';
import { DILUG_CODE } from './vesetDilug.js';
import { DAY_MARKS, DAY_MARK_RULES, marksOf } from './dayMarks.js';
import { LOCATIONS, locationById, timesLine, halachicTodayAbs } from './zmanim.js';
import { ICONS } from './icons.js';
import { checkForUpdate } from './updateCheck.js';
import { getGoogleBackupData, mergeDb, fetchBackup, fetchRestorePoints } from './googleBackup.js';
import { getTopic, topicsByCategory, SOURCE_LEGEND } from './halachaHelp.js';
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
import {
    initGoogleBackup, onDataChanged,
    refreshConnectionState, connectGoogle, disconnectGoogle,
    openSheetInBrowser, backupNow
} from './googleBackup.js';
import {
    syncCalendarNow, clearAllAppEvents, hasCalendarScope, CALENDAR_SUMMARY
} from './googleCalendar.js';
import { initErrorLogging, getErrorLogCount, downloadErrorLog, clearErrorLog } from './errorLog.js';

// מתחברת מוקדם ככל האפשר - כדי לתפוס גם תקלות בעליית האפליקציה עצמה, ולא רק
// מהרגע שה-DOM מוכן. הרישום עצמו לעולם לא זורק (ר' errorLog.js).
initErrorLogging();

// ---------- Halachic help: info bubbles + guide tab ----------

/**
 * Renders a help topic into the bubble modal.
 * Every bubble shows three things: the din, the reasoning, and the source.
 */
window.showHelp = function(topicId) {
    const topic = getTopic(topicId);
    if (!topic) return;

    const title = document.getElementById('help-title');
    const summary = document.getElementById('help-summary');
    const body = document.getElementById('help-body');
    const sources = document.getElementById('help-sources');
    if (!body) return;

    if (title) title.innerText = topic.title;
    if (summary) summary.innerText = topic.summary || '';

    body.innerHTML = '';
    (topic.body || []).forEach(paragraph => {
        const p = document.createElement('p');
        p.style.cssText = 'margin: 0 0 10px 0; line-height: 1.65; font-size: 0.92em;';
        p.innerText = paragraph;
        body.appendChild(p);
    });
    if ((topic.points || []).length) {
        const ul = document.createElement('ul');
        ul.style.cssText = 'margin: 0 0 10px 0; padding-inline-start: 20px; line-height: 1.6; font-size: 0.9em;';
        topic.points.forEach(point => {
            const li = document.createElement('li');
            li.innerText = point;
            ul.appendChild(li);
        });
        body.appendChild(ul);
    }

    if (sources) {
        sources.innerHTML = '<b>מקורות:</b><br>' + (topic.sources || []).join('<br>');
        sources.style.display = (topic.sources || []).length ? 'block' : 'none';
    }
    openModal('help-modal');
};

/**
 * Opens the guide tab scrolled to a specific topic (used from a bubble when the
 * user wants the full context).
 */
window.openGuideTopic = function(topicId) {
    closeModal('help-modal');
    switchView('view-about', 'nav-about', 'desktop-nav-about');
    const el = document.getElementById('guide-topic-' + topicId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/**
 * Builds the guide tab from the SAME content module that feeds the bubbles,
 * so an explanation can never drift between the two.
 */
function renderGuide() {
    const container = document.getElementById('guide-content');
    if (!container) return;
    container.innerHTML = '';

    const categories = topicsByCategory();

    // סרגל הצד המשותף ללשונית "אודות" (#about-side-nav) — מכיל גם את הקישורים
    // הקבועים (הוראות שימוש, מייל, פרטיות, אודות) וגם קישור לכל קטגוריה במדריך,
    // כדי שיהיה סרגל ניווט אחד ומאוחד לכל הלשונית ולא סרגל נפרד בתוך המדריך.
    const sideNav = document.getElementById('about-side-nav');
    if (sideNav) {
        sideNav.innerHTML = '';
        const addLink = (targetId, label) => {
            const link = document.createElement('a');
            link.href = '#' + targetId;
            link.innerText = label;
            link.onclick = (e) => {
                e.preventDefault();
                const target = document.getElementById(targetId);
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                sideNav.querySelectorAll('a').forEach(a => a.classList.toggle('active', a === link));
            };
            sideNav.appendChild(link);
        };
        addLink('about-section-instructions', 'הוראות שימוש');
        categories.forEach((group, i) => addLink('guide-category-' + i, group.category));
        addLink('about-section-email', 'שליחת נתונים למייל');
        addLink('about-section-privacy', 'פרטיות וגיבוי נתונים');
        addLink('about-section-credit', 'אודות');
    }

    const intro = document.createElement('div');
    intro.className = 'guide-intro';
    intro.innerHTML =
        '<b>למה האפליקציה מחשבת כך?</b><br>' +
        'המדריך הזה מרכז את ההלכות שהחישובים מבוססים עליהן, בשפה פשוטה, ולצד כל כלל — ' +
        'מראה המקום המדויק. העיקרון המנחה: להציג את הדין המדויק — בלי להחמיר ובלי להקל. ' +
        'במקום שבו נחלקו הפוסקים, ההכרעה מסומנת כמחלוקת ויש לשאול רב.<br><br>' +
        '<b>מפתח מקורות:</b><br>' + SOURCE_LEGEND.map(s => '• <b>' + s.key + '</b> — ' + s.text).join('<br>');
    container.appendChild(intro);

    categories.forEach((group, i) => {
        const section = document.createElement('div');
        section.className = 'guide-category';
        section.id = 'guide-category-' + i;

        const h3 = document.createElement('h3');
        h3.innerText = group.category;
        section.appendChild(h3);

        group.topics.forEach(topic => {
            const card = document.createElement('div');
            card.className = 'guide-topic';
            card.id = 'guide-topic-' + topic.id;

            const h4 = document.createElement('h4');
            h4.innerText = topic.title;
            card.appendChild(h4);

            if (topic.summary) {
                const sum = document.createElement('div');
                sum.className = 'guide-summary';
                sum.innerText = topic.summary;
                card.appendChild(sum);
            }

            (topic.body || []).forEach(paragraph => {
                const p = document.createElement('p');
                p.innerText = paragraph;
                card.appendChild(p);
            });

            if ((topic.points || []).length) {
                const ul = document.createElement('ul');
                topic.points.forEach(point => {
                    const li = document.createElement('li');
                    li.innerText = point;
                    ul.appendChild(li);
                });
                card.appendChild(ul);
            }

            if ((topic.sources || []).length) {
                const src = document.createElement('div');
                src.className = 'guide-sources';
                src.innerHTML = '<b>מקורות:</b> ' + topic.sources.join(' · ');
                card.appendChild(src);
            }

            section.appendChild(card);
        });

        container.appendChild(section);
    });
}

/**
 * Any element carrying data-help="topicId" opens its bubble. Delegated so that
 * bubbles work in dynamically rendered content (tables, engine output) too.
 */
document.addEventListener('click', event => {
    const trigger = event.target && event.target.closest ? event.target.closest('[data-help]') : null;
    if (!trigger) return;
    event.preventDefault();
    window.showHelp(trigger.getAttribute('data-help'));
});

/**
 * Keyboard activation for role="button" elements that are not real <button>s
 * (calendar day cells, sidebar quick actions) — a <div onclick> is invisible to
 * Tab and does nothing on Enter/Space without this. Delegated, so it also covers
 * day cells re-rendered after every calendar refresh.
 */
document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target && event.target.closest ? event.target.closest('[role="button"]') : null;
    if (!target) return;
    event.preventDefault(); // Space must not also scroll the page
    target.click();
});

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

// רישום ה-Service Worker (sw.js) — נותן תוקף אמיתי להבטחת ה-manifest למעלה
// ("standalone" + אייקון = מותקנת), שאחרת נשארת "מותקנת" רק בשם ונופלת בלי רשת.
// !window.api הוא אותו סימן שכל שאר הקוד כבר משתמש בו לזיהוי ווב מול תוכנה
// (ר' ARCHITECTURE.md) — Service Worker לא נחוץ ולא נתמך בטעינת file:// של
// Electron ממילא, ו-sw.js אף לא ארוז לתוכנה (package.json build.files).
if (!window.api && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* אין רשת מקוונת — לא קריטי */ });
}

// App State
let currentHDate = new HDate(1, new HDate().getMonth(), new HDate().getFullYear());
let selectedAbsDate = null;
let pendingEventParams = null;
let isYearlyView = false;
let db = {};

// Register HDate on window for grid layout reference
window.HDateLocal = HDate;

/**
 * The engine options that come from the user's settings. Centralised so a
 * calculation can never run with different settings than the calendar shows.
 */
function engineOptions() {
    // הנקודה האחת שממנה כל החישובים קוראים. מתגי החומרא (§5ב) עוברים כאן, ומהם
    // נגזרים ספק העונה, וסת הדילוג, דרך עקירת הוסת שאינה קבועה, ואור זרוע בל"א.
    //
    // זיהוי וסת קבוע (chazaka) ועקירת וסתות (akirot) אינם ניתנים לכיבוי על-ידי
    // המשתמשת — ההגדרה הוסרה במכוון (2026-09-19): כיבוין הוא חומרא הלכתית לא
    // מדויקת (המנוע מציג חששות שאינם נוהגים למי שיש לה וסת קבוע), ולכן שני המנועים
    // פועלים תמיד. ראו docs/DECISIONS.md.
    return {
        chazaka: true,
        akirot: true,
        life: getLifeState(),
        stringencies: normalizeStringencies(getStringencies()),
        // "היום" ההלכתי (מתחשב בשקיעה כשיש מיקום מוגדר) — ולא היום הלועזי לפי
        // חצות; ראו js/zmanim.js halachicTodayAbs ו-docs/DECISIONS.md (2026-09-19).
        today: halachicTodayAbs(locationById(getSavedLocation()))
    };
}

/**
 * פרופיל מנהג (אשכנז/עדות מזרח) — "בחירה אישית של הגדרות פרטיות בתוך המכלול", כלומר
 * שכבה נוחה מעל המתגים הקיימים ולא מנגנון נפרד: בחירת פרופיל רק **מגדירה** את
 * הצירוף הזה של מתגים; שינוי מתג בודד לאחר מכן פשוט "יוצא" מן הפרופיל (המערכת
 * לא נועלת שום דבר). ההגדרה עצמה (`MINHAG_PROFILES`) והזיהוי (`detectMinhagProfile`)
 * חיים ב-`js/stringencies.js` — פונקציות טהורות, נבדקות ב-`tests/stringencies.test.js`.
 */
function currentMinhagState() {
    const current = normalizeStringencies(getStringencies());
    return {
        orZarua: isOrZaruaEnabled(),
        orZaruaDay31: current.orZaruaDay31,
        karetiUfaletei: current.karetiUfaletei
    };
}

window.applyMinhagProfileSetting = function() {
    const select = document.getElementById('setting-minhag-profile');
    const name = select ? select.value : 'custom';
    const profile = MINHAG_PROFILES[name];
    if (!profile) return; // 'custom' - לא נוגעים בשום מתג

    saveOrZarua(profile.orZarua);
    const next = normalizeStringencies(getStringencies());
    next.orZaruaDay31 = profile.orZaruaDay31;
    next.karetiUfaletei = profile.karetiUfaletei;
    saveStringencies(next);

    const orZaruaInput = document.getElementById('setting-or-zarua');
    if (orZaruaInput) orZaruaInput.checked = profile.orZarua;
    renderStringencySettings();
    showToast('פרופיל המנהג הוחל — ניתן עדיין לשנות כל מתג בנפרד.');
    refreshCalendar();
};

/**
 * מרנדר את מתגי החומרא למסך ההגדרות, מן ההגדרות שבמודול — ובכללם מקורותיהם.
 * כך הוספת מתג אינה דורשת נגיעה ב-HTML.
 */
function renderStringencySettings() {
    const container = document.getElementById('stringency-list');
    if (!container) return;
    const current = normalizeStringencies(getStringencies());

    const profileSelect = document.getElementById('setting-minhag-profile');
    if (profileSelect) profileSelect.value = detectMinhagProfile(currentMinhagState());

    // הכרטיס סגור כברירת מחדל (מחלוקות נדירות) — אבל אם המשתמשת כבר שינתה מתג
    // כלשהו מברירת המחדל שלו (ולא רק שהוא "דלוק" מטבעו, כמו lateBedika/orZaruaDay31),
    // לא נשאיר את זה מוסתר מהמבט הראשון בלי שביקשה זאת. אור זרוע שוכן כאן גם הוא
    // (ראו index.html) ואינו כבוי כברירת מחדל, לכן דלוק שלו נחשב "שונה" ופותח את הכרטיס.
    const group = document.getElementById('stringency-group');
    if (group && (STRINGENCY_DEFS.some(def => !!current[def.key] !== !!def.default) || isOrZaruaEnabled())) {
        group.open = true;
    }

    container.innerHTML = STRINGENCY_DEFS.map(def => `
        <label style="display: block; margin-bottom: 14px; cursor: pointer;">
            <span style="display: flex; align-items: center; gap: 10px; font-size: 0.95em;">
                <input type="checkbox" data-stringency="${def.key}" style="width: 18px; height: 18px; accent-color: var(--primary);"${current[def.key] ? ' checked' : ''}>
                <b>${def.label}</b>
            </span>
            <span style="display: block; margin: 4px 0 0 28px; font-size: 0.85em; color: var(--text-muted); line-height: 1.6;">
                ${def.hint}<br><span style="opacity: 0.85;">${def.source}</span>
            </span>
        </label>
    `).join('');

    container.querySelectorAll('input[data-stringency]').forEach(input => {
        input.addEventListener('change', () => {
            const key = input.getAttribute('data-stringency');
            const next = normalizeStringencies(getStringencies());
            next[key] = input.checked;
            saveStringencies(next);
            // מתג בודד עלול "להוציא" את המצב מפרופיל המנהג שנבחר — הבורר משתקף בהתאם.
            if (profileSelect) profileSelect.value = detectMinhagProfile(currentMinhagState());
            showToast('ההגדרה עודכנה — החישובים מחושבים מחדש.');
            refreshCalendar();
        });
    });
}

/**
 * מסך בחירת המיקום (ספק עונה — B6). הרשימה נבנית מתוך `js/zmanim.js`.
 *
 * בלא מיקום אין זמנים מוצגים, ואין בכך שינוי בדין: ההודעה מפרשת שהזמנים נועדו
 * לבירור הספק בלבד.
 */
function renderLocationSetting() {
    const select = document.getElementById('setting-location');
    if (!select) return;

    const current = getSavedLocation();
    select.innerHTML = `<option value="">— לא נבחר מיקום (זמנים לא יוצגו) —</option>`
        + LOCATIONS.map(place => `<option value="${place.id}">${place.label}</option>`).join('');
    select.value = locationById(current) ? current : '';

    const note = document.getElementById('setting-location-note');
    if (note) {
        note.innerText = locationById(current)
            ? 'הזמנים יוצגו בעת רישום הראייה ובכרטיס היום: הנץ, שקיעה, ותחילתה של עונת הלילה שזמנה שקיעת היום שלפניו.'
            : 'לא נבחר מיקום — זמני הנץ והשקיעה אינם מוצגים. העונה נבחרת בידיך כרגיל.';
    }
}

window.saveLocationSetting = function() {
    const select = document.getElementById('setting-location');
    if (!select) return;
    saveLocation(locationById(select.value) ? select.value : '');
    renderLocationSetting();
    showToast(locationById(select.value) ? 'המיקום נשמר — זמני הנץ והשקיעה יוצגו.' : 'המיקום הוסר.');
    refreshCalendar();
};

// ---------- Life state (מצב חיים) ----------

/**
 * A date input gives a Gregorian date (YYYY-MM-DD), while the engine works in
 * absolute days of the Hebrew calendar. An empty value means "not set".
 */
function dateInputToAbs(value) {
    if (!value) return null;
    const parts = String(value).split('-').map(Number);
    if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return null;
    const [year, month, day] = parts;
    return new HDate(new Date(year, month - 1, day)).abs();
}

function absToDateInput(abs) {
    if (!Number.isFinite(abs)) return '';
    const g = new HDate(abs).greg();
    const pad = (n) => String(n).padStart(2, '0');
    return `${g.getFullYear()}-${pad(g.getMonth() + 1)}-${pad(g.getDate())}`;
}

/**
 * The pills list is written to storage as soon as a period is added or removed -
 * a half-typed form should not be able to lose a recorded period.
 */
function renderPillsList() {
    const box = document.getElementById('life-pills-list');
    if (!box) return;
    const state = getLifeState() || {};
    const pills = state.pills || [];
    if (pills.length === 0) {
        box.innerHTML = '<p style="color: var(--text-muted); margin: 0;">לא נרשמו תקופות נטילה.</p>';
        return;
    }
    const todayAbs = new HDate().abs();
    box.innerHTML = pills.map((p, index) => {
        const start = new HDate(p.startAbs).renderGematriya();
        const end = Number.isFinite(p.endAbs)
            ? new HDate(p.endAbs).renderGematriya()
            : 'עדיין נוטלת';
        const type = PILL_TYPES[p.type] || PILL_TYPES[PILL_TYPE_DEFAULT];
        const reason = PILL_PAUSE_REASONS[p.reason] || PILL_PAUSE_REASONS[PILL_PAUSE_REASON_DEFAULT];
        const current = p.startAbs <= todayAbs && (!Number.isFinite(p.endAbs) || p.endAbs >= todayAbs);
        return `<div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--border-color);">
            <span>${type} — מ${start} ${Number.isFinite(p.endAbs) ? 'עד ' + end : end} · ${reason}${current ? ' <b>(נוטלת כעת)</b>' : ''}</span>
            <button class="action-btn btn-clear" style="padding: 2px 8px; font-size: 0.85em;" onclick="removePillPeriod(${index})">הסר</button>
        </div>`;
    }).join('');

    // הדין שנוגע לשאלה שלשמה נרשמה הסיבה: וסת הנגרם מכדורים אפילו בציווי הרופא.
    const reasonRule = document.getElementById('life-pills-reason-rule');
    if (reasonRule) {
        reasonRule.innerHTML = pills.length
            ? `<b>${PILL_PAUSE_REASON_RULE.title}.</b> ${PILL_PAUSE_REASON_RULE.text} `
                + `<span style="white-space:nowrap;">${PILL_PAUSE_REASON_RULE.source}</span>`
            : '';
    }
}

window.saveLifeStateSetting = function() {
    const state = getLifeState() || {};
    const ageValue = document.getElementById('setting-life-age').value;
    const life = {
        enabled: document.getElementById('setting-life-enabled').checked,
        pregnancyAbs: dateInputToAbs(document.getElementById('setting-life-pregnancy').value),
        birthAbs: dateInputToAbs(document.getElementById('setting-life-birth').value),
        nursing: document.getElementById('setting-life-nursing').checked,
        nursingLenient: document.getElementById('setting-life-nursing-lenient').checked,
        ageYears: ageValue === '' ? null : Number(ageValue),
        pills: state.pills || []
    };
    saveLifeState(life);
    renderPillsList();
    showToast(life.enabled
        ? 'מצב החיים נשמר — המנוע מתחשב בו מעתה.'
        : 'מצב החיים נשמר, אך החישוב כבוי — המנוע אינו מתחשב בו.');
    refreshCalendar();
};

window.clearLifeStateSetting = function() {
    saveLifeState(null);
    populateLifeStateForm();
    showToast('מצב החיים נמחק — המנוע חוזר לחשב לכולן כדין שאין להן וסת קבוע.');
    refreshCalendar();
};

window.addPillPeriod = function() {
    const startAbs = dateInputToAbs(document.getElementById('setting-life-pill-start').value);
    if (startAbs === null) {
        showAlert('נא להזין תאריך תחילה לנטילת הכדורים.');
        return;
    }
    const endAbs = dateInputToAbs(document.getElementById('setting-life-pill-stop').value);
    if (endAbs !== null && endAbs < startAbs) {
        showAlert('תאריך סיום הנטילה קודם לתאריך ההתחלה.');
        return;
    }
    const state = getLifeState() || {};
    const type = document.getElementById('setting-life-pill-type').value;
    const reasonInput = document.getElementById('setting-life-pill-reason');
    const reason = reasonInput ? reasonInput.value : PILL_PAUSE_REASON_DEFAULT;
    state.pills = (state.pills || []).concat([{
        startAbs,
        endAbs,
        type: PILL_TYPES[type] ? type : PILL_TYPE_DEFAULT,
        reason: PILL_PAUSE_REASONS[reason] ? reason : PILL_PAUSE_REASON_DEFAULT
    }]);
    if (state.enabled === undefined) state.enabled = true;
    saveLifeState(state);
    document.getElementById('setting-life-pill-start').value = '';
    document.getElementById('setting-life-pill-stop').value = '';
    renderPillsList();
    showToast(reason === 'doctor'
        ? 'תקופת הכדורים נרשמה. ואף שנצטווית מפי רופא — הדין שונה כוסת הגוף, שקובעת וסת [שט כ\"ז | עמ\' 41]'
        : 'תקופת הכדורים נרשמה — ימים אלה אינם נמנים לעקירת הוסת.');
    refreshCalendar();
};

window.removePillPeriod = function(index) {
    const state = getLifeState() || {};
    const pills = (state.pills || []).slice();
    if (index < 0 || index >= pills.length) return;
    pills.splice(index, 1);
    state.pills = pills;
    saveLifeState(state);
    renderPillsList();
    showToast('תקופת הכדורים הוסרה.');
    refreshCalendar();
};

/**
 * Fills the settings form from storage.
 */
function populateLifeStateForm() {
    const state = getLifeState() || {};
    const setChecked = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.checked = value === true;
    };
    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value === null || value === undefined ? '' : value;
    };
    setChecked('setting-life-enabled', state.enabled !== false);
    setValue('setting-life-pregnancy', absToDateInput(state.pregnancyAbs));
    setValue('setting-life-birth', absToDateInput(state.birthAbs));
    setChecked('setting-life-nursing', state.nursing === true);
    setChecked('setting-life-nursing-lenient', state.nursingLenient === true);
    setValue('setting-life-age', Number.isFinite(Number(state.ageYears)) && state.ageYears !== null ? state.ageYears : '');
    renderPillsList();
}

/**
 * Update the viewed calendar state.
 */
function refreshCalendar() {
    db = getDb();
    const engineData = calculateEngine(db, isOrZaruaEnabled(), engineOptions());
    renderScreenCalendar(currentHDate, db, engineData, isYearlyView);
    announceBodyReminder(engineData);
}

/**
 * התראה יומית אקטיבית על וסת הגוף (`bodyReminder` ב-`js/vesetGuf.js`).
 *
 * התזכורת הקבועה מוצגת בכרטיס שבראש המסך בכל עת; כאן מדובר בהתראה **קופצת**,
 * וזו נשלחת רק כשההיום עצמו מחייב דבר: חובת בדיקה של זמן הווסת המורכבת שעבר,
 * או יום הווסת המורכבת שהיום זמנו. מיחוש שתועד ועומד בלבד אינו מוצג בהתראה קופצת —
 * שהרי אין בו שום חידוש היום, והוא ממילא בכרטיס.
 *
 * ההתראה מוצגת פעם אחת ביום (נשמר ב-localStorage), ולעולם לא מאחורי מסך הנעילה:
 * שם גם אינה נראית, וגם אינה צריכה להיחשף לפני שהמשתמשת פתחה את היומן.
 */
function announceBodyReminder(engineData) {
    if (!engineData || !engineData.computed) return;

    // "היום" ההלכתי, לא הלועזי — ראו הערה ב-engineOptions() לעיל.
    const todayAbs = halachicTodayAbs(locationById(getSavedLocation()));

    const reminder = bodyReminder({
        bodyVeset: engineData.bodyVeset,
        prishot: engineData.computed.prishot,
        pendingChecks: engineData.computed.pendingChecks,
        today: todayAbs
    });
    if (!reminder.active || (reminder.level !== 'pending' && reminder.level !== 'today')) return;

    const shownOn = getBodyReminderSeen();
    if (shownOn === todayAbs) return;

    const lockScreen = document.getElementById('lock-screen');
    const setupScreen = document.getElementById('setup-screen');
    if ((lockScreen && lockScreen.style.display === 'flex')
        || (setupScreen && setupScreen.style.display === 'flex')) return;

    setBodyReminderSeen(todayAbs);
    showToast(reminder.title + ' — '
        + (reminder.level === 'pending' ? 'יש לבדוק כדין: בעומק ובחו"ס' : 'יש לבדוק בו כדין'));
}

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", async () => {
    // 1. Initialize Theme
    const savedTheme = getSavedTheme();
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    // 1b. Initialize global zoom level
    applyZoom(getZoomLevel());

    // 2. Setup PIN Input cursor shifting
    setupPinInputListeners();
    
    // 3. Initialize security lock
    checkInitialLock();
    
    // 4. Populate email setting if saved
    const savedEmail = getSavedEmail();
    const emailInput = document.getElementById('setting-email');
    if (emailInput) emailInput.value = savedEmail;
    
    // 4b. Build the halachic guide from the shared help content
    renderGuide();

    // 4c. סרגלי הצד לניווט קל (הגדרות ואודות/מדריך) - מסמנים את הקטגוריה
    // הנראית כרגע, לא רק בלחיצה.
    initSideNavScrollSpy(document.querySelector('#view-settings .side-nav'));
    initSideNavScrollSpy(document.querySelector('#view-about .side-nav'));

    // 4d. יומן תקלות (settings-section-notifications) - כמה רשומות כבר נרשמו.
    refreshErrorLogCountUI();

    // 5. Populate Or Zarua setting
    const orZaruaInput = document.getElementById('setting-or-zarua');
    if (orZaruaInput) orZaruaInput.checked = isOrZaruaEnabled();

    // 5d. Populate the life state (pregnancy / birth / nursing / age / pills)
    populateLifeStateForm();

    // 5e. מתגי החומרא (§5ב)
    renderStringencySettings();

    // 5f. המיקום לזמני הנץ והשקיעה (ספק עונה — B6)
    renderLocationSetting();
    
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

    // 9. Google backup UI + scheduler (desktop app only)
    await updateGoogleStatusUI();
    if (window.api && window.api.onAutoBackupTick) {
        initGoogleBackup(() => getGoogleBackupData(db, getRecoveryEmail));
    }

    // 9b. Google Calendar sync UI + scheduler (docs/GOOGLE_CALENDAR_SPEC.md §6ב,
    // "טריגר פתיחה") - same connection, independent opt-in toggle.
    await updateGoogleCalendarUI();
    if (window.api && window.api.onAutoBackupTick) {
        window.api.onAutoBackupTick(() => tickCalendarAutoSync());
    }

    // 10. Daily automatic local backup file (desktop app only) — independent
    // opt-in setting, piggy-backing on the same main-process minute tick.
    updateLocalBackupUI();
    if (window.api && window.api.onAutoBackupTick && window.api.localBackupWrite) {
        window.api.onAutoBackupTick(() => tickLocalBackup());
        tickLocalBackup(); // covers "opened once and closed within the minute"
    }

    // 11. Desktop OS notifications (daily / event-day only) — same minute tick.
    const notifModeSelect = document.getElementById('setting-notifications-mode');
    if (notifModeSelect) notifModeSelect.value = getNotificationsMode();
    if (window.api && window.api.onAutoBackupTick && window.api.showNotification) {
        window.api.onAutoBackupTick(() => tickDesktopNotification());
        tickDesktopNotification();
    }

    // 12. In-app update checker against GitHub releases (desktop app only) —
    // once at startup, then once a day via the same minute tick.
    const versionLabel = document.getElementById('current-app-version');
    if (window.api && window.api.getAppVersion) {
        window.api.getAppVersion().then(v => { if (versionLabel) versionLabel.innerText = v; });
        tickUpdateCheck();
        if (window.api.onAutoBackupTick) window.api.onAutoBackupTick(() => tickUpdateCheck());
    } else if (versionLabel) {
        versionLabel.innerText = 'לא זמין בגרסת האתר';
    }

    // 13. "No recent backup" reminder — checked once at startup (works in the
    // web/PWA build too, unlike the items above), and again through the
    // desktop minute-tick for a session left open across many days.
    tickBackupReminder();
    if (window.api && window.api.onAutoBackupTick) {
        window.api.onAutoBackupTick(() => tickBackupReminder());
    }
});

const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const UPDATE_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

async function tickUpdateCheck() {
    if (!window.api || !window.api.getAppVersion) return;
    if (Date.now() - getUpdateLastCheck() < UPDATE_CHECK_INTERVAL_MS) return;
    setUpdateLastCheck(Date.now()); // set first — a failed/offline check must not retry every minute

    const currentVersion = await window.api.getAppVersion();
    const result = await checkForUpdate(currentVersion);
    if (!result.hasUpdate) {
        hideUpdateBanner();
        return;
    }

    const snoozed = getSnoozedUpdate();
    if (snoozed.version === result.latest.version && Date.now() < snoozed.until) return;

    showUpdateBanner(result.latest);
}

/**
 * A small global "there's an update" mark (spec line 8: "מציגה באופן גלובלי
 * בתוכנה סימון קטן... ולחיצה על הסימון הזה מובילה לדף ההגדרות"). Clicking the
 * mark itself navigates to Settings and scrolls to the update card — the
 * actual download link lives there, not on the mark. The mark's own small
 * "X" dismisses it for a week (unless a newer release appears meanwhile).
 */
function showUpdateBanner(latest) {
    const badge = document.getElementById('update-badge');
    const cardText = document.getElementById('update-settings-text');
    const link = document.getElementById('update-download-link');
    if (badge) { badge.style.display = 'flex'; badge.dataset.version = latest.version; }
    if (cardText) { cardText.innerText = `גרסה חדשה (${latest.version}) זמינה להורדה.`; cardText.style.display = 'block'; }
    if (link) link.href = latest.url;
}

function hideUpdateBanner() {
    const badge = document.getElementById('update-badge');
    if (badge) badge.style.display = 'none';
}

window.goToUpdateSettings = function() {
    switchView('view-settings', 'nav-settings', 'desktop-nav-settings');
    const card = document.getElementById('update-settings-card');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.dismissUpdateBadge = function(event) {
    if (event) event.stopPropagation(); // the badge itself is also clickable
    const badge = document.getElementById('update-badge');
    const version = badge && badge.dataset.version;
    if (version) snoozeUpdate(version, Date.now() + UPDATE_SNOOZE_MS);
    hideUpdateBanner();
};

window.checkForUpdateNow = function() {
    setUpdateLastCheck(0); // force tickUpdateCheck() past its 24h guard
    tickUpdateCheck().then(() => {
        if (document.getElementById('update-badge').style.display === 'none' ||
            !document.getElementById('update-badge').style.display) {
            showToast('אין עדכון חדש כרגע — אתן משתמשות בגרסה העדכנית.');
        }
    });
};

/**
 * "No recent backup" reminder (spec: תזכורת אם לא בוצע גיבוי מעל 30 יום).
 * Looks at every backup path there is - the local-file auto-backup, the
 * Google auto-backup, and a manual "download backup file" - and takes
 * whichever is most recent. A brand new install (nothing yet) is not
 * "stale": it gets the same 30-day grace period, counted from first use.
 */
const BACKUP_REMINDER_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BACKUP_REMINDER_STALE_MS = 30 * 24 * 60 * 60 * 1000;
const BACKUP_REMINDER_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

async function getLastBackupTimestampMs() {
    const candidates = [];
    const localLast = getLocalBackupLast();
    if (localLast) candidates.push(Date.parse(localLast));
    const manualLast = getManualBackupLast();
    if (manualLast) candidates.push(manualLast);
    if (window.api && window.api.oauthStatus) {
        try {
            const status = await window.api.oauthStatus();
            if (status && status.lastBackupAt) candidates.push(Date.parse(status.lastBackupAt));
        } catch (e) {
            // ignore - treated as "no Google backup info available"
        }
    }
    return candidates.length ? Math.max(...candidates) : null;
}

async function tickBackupReminder() {
    if (Date.now() - getBackupReminderLastCheck() < BACKUP_REMINDER_CHECK_INTERVAL_MS) return;
    setBackupReminderLastCheck(Date.now());

    const lastBackupMs = await getLastBackupTimestampMs();
    const since = lastBackupMs || getFirstUseAt();
    if (Date.now() - since < BACKUP_REMINDER_STALE_MS) {
        hideBackupReminderBanner();
        return;
    }
    if (Date.now() < getBackupReminderSnoozedUntil()) return;

    showBackupReminderBanner();
}

function showBackupReminderBanner() {
    const badge = document.getElementById('backup-reminder-badge');
    if (badge) badge.style.display = 'flex';
}

function hideBackupReminderBanner() {
    const badge = document.getElementById('backup-reminder-badge');
    if (badge) badge.style.display = 'none';
}

window.goToBackupSettings = function() {
    switchView('view-settings', 'nav-settings', 'desktop-nav-settings');
    const section = document.getElementById('settings-section-backup');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.dismissBackupReminderBadge = function(event) {
    if (event) event.stopPropagation(); // the badge itself is also clickable
    snoozeBackupReminder(Date.now() + BACKUP_REMINDER_SNOOZE_MS);
    hideBackupReminderBanner();
};

/**
 * Builds a one-line "what's today, what's the state" summary for the
 * desktop notification, and reports whether today carries an actual event
 * (a recorded sighting/hefsek/tevilah/check, or a computed concern) — the
 * 'event' mode only ever notifies when this is true.
 */
function buildNotificationStatus(todayAbs) {
    const hebToday = new HDate(todayAbs).renderGematriya();
    const record = db[todayAbs];
    const recordLabels = { reiyah: 'ראייה', hefsek: 'הפסק טהרה', tevilah: 'טבילה', check: 'בדיקה' };

    if (record && recordLabels[record.type]) {
        return { hasEvent: true, text: `היום ${hebToday}: נרשם/ה ${recordLabels[record.type]}.` };
    }

    const engineData = calculateEngine(db, isOrZaruaEnabled(), engineOptions());
    const concerns = (engineData.computed.prishot && engineData.computed.prishot[todayAbs]) || [];
    if (concerns.length) {
        return { hasEvent: true, text: `היום ${hebToday}: ${concerns[0].reason || 'חשש וסת'}.` };
    }

    const pending = (engineData.computed.pendingChecks || []).filter(p => p.abs === todayAbs);
    if (pending.length) {
        return { hasEvent: true, text: `היום ${hebToday}: ממתינה לבדיקה.` };
    }

    return { hasEvent: false, text: `היום ${hebToday}. אין חשש וסת הידוע היום.` };
}

/**
 * Shows a desktop notification once a day at most, per the chosen mode:
 * 'daily' always announces the day and state; 'event' only when there is
 * an actual event/concern today. Runs off the same main-process minute tick
 * used for the Google/local auto-backups.
 */
function tickDesktopNotification() {
    const mode = getNotificationsMode();
    if (mode === 'off' || !window.api || !window.api.showNotification) return;

    const todayAbs = halachicTodayAbs(locationById(getSavedLocation()));
    if (getNotificationsLast() === todayAbs) return; // already notified today

    const status = buildNotificationStatus(todayAbs);
    if (mode === 'event' && !status.hasEvent) return;

    window.api.showNotification('לוח טהרת המשפחה', status.text).then(result => {
        if (result && result.ok) setNotificationsLast(todayAbs);
    }).catch(() => { /* best-effort; will retry on the next minute's tick */ });
}

window.saveNotificationsSetting = function() {
    const mode = document.getElementById('setting-notifications-mode').value;
    saveNotificationsMode(mode);
    showToast(mode === 'off'
        ? 'התראות המחשב כובו.'
        : 'הגדרת התראות המחשב נשמרה.');
    if (mode !== 'off' && window.api && window.api.showNotification) tickDesktopNotification();
};

/**
 * Writes a local backup file once per day, when the setting is on. Mirrors
 * the 24h-interval pattern already used for the Google auto-backup tick.
 */
const LOCAL_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
function tickLocalBackup() {
    if (!isLocalBackupEnabled() || !window.api || !window.api.localBackupWrite) return;
    const last = getLocalBackupLast() ? Date.parse(getLocalBackupLast()) : 0;
    if (Date.now() - last < LOCAL_BACKUP_INTERVAL_MS) return;

    window.api.localBackupWrite(JSON.stringify(getDb())).then(result => {
        if (result && result.ok) {
            setLocalBackupLast(result.savedAt);
            updateLocalBackupUI();
        }
    }).catch(() => { /* best-effort; will retry on the next minute's tick */ });
}

/**
 * Populates the local-backup settings card: the toggle state and a
 * human-readable "last backup" line.
 */
function updateLocalBackupUI() {
    const toggle = document.getElementById('setting-local-backup');
    if (toggle) toggle.checked = isLocalBackupEnabled();

    const statusEl = document.getElementById('local-backup-status');
    if (!statusEl) return;
    const last = getLocalBackupLast();
    if (!window.api || !window.api.localBackupWrite) {
        statusEl.innerText = 'זמין רק באפליקציית שולחן העבודה (Electron), לא בגרסת האתר.';
    } else if (!last) {
        statusEl.innerText = 'עדיין לא בוצע גיבוי מקומי אוטומטי.';
    } else {
        statusEl.innerText = `גיבוי אוטומטי אחרון: ${new Date(last).toLocaleString('he-IL')}`;
    }
}

window.saveLocalBackupSetting = function() {
    const isChecked = document.getElementById('setting-local-backup').checked;
    saveLocalBackupEnabled(isChecked);
    if (isChecked) tickLocalBackup();
    updateLocalBackupUI();
    showToast(isChecked
        ? 'גיבוי יומי אוטומטי לקובץ במחשב הופעל.'
        : 'גיבוי יומי אוטומטי לקובץ במחשב כובה.');
};

window.openLocalBackupFolder = function() {
    if (window.api && window.api.localBackupOpenFolder) {
        window.api.localBackupOpenFolder();
    } else {
        showAlert('פתיחת תיקיית הגיבוי זמינה רק באפליקציית שולחן העבודה.');
    }
};

/**
 * מציגה כמה רשומות נרשמו ביומן התקלות (settings-section-notifications) -
 * כדי שיהיה ברור אם יש בכלל משהו לשלוח.
 */
function refreshErrorLogCountUI() {
    const el = document.getElementById('error-log-count');
    if (el) el.innerText = String(getErrorLogCount());
}

window.downloadErrorLogFile = function() {
    downloadErrorLog();
};

window.clearErrorLogConfirm = function() {
    showConfirm('לנקות את יומן התקלות השמור במכשיר הזה?', () => {
        clearErrorLog();
        refreshErrorLogCountUI();
        showToast('יומן התקלות נוקה');
    });
};

/**
 * Updates the Google connection card in the settings screen.
 */
async function updateGoogleStatusUI() {
    const group = document.getElementById('google-backup-group');
    const statusText = document.getElementById('google-status-text');
    const connectedActions = document.getElementById('google-connected-actions');
    const connectBtn = document.getElementById('google-connect-btn');
    
    // Web/PWA build has no OAuth bridge - keep the card hidden
    if (!group || !statusText || !(window.api && window.api.oauthStatus)) return;
    
    try {
        const status = await refreshConnectionState();
        group.style.display = 'block';
        if (status.connected) {
            const lastStr = status.lastBackupAt ? new Date(status.lastBackupAt).toLocaleString('he-IL') : '';
            statusText.innerHTML = `מחובר לחשבון <b>${status.email || 'גוגל'}</b>. הגיבוי מתבצע אוטומטית פעם ביום.${lastStr ? '<br>גיבוי אחרון: ' + lastStr : ''}`;
            if (connectedActions) connectedActions.style.display = 'flex';
            if (connectBtn) connectBtn.style.display = 'none';
        } else {
            statusText.innerText = 'חברו את חשבון הגוגל שלכם לגיבוי אוטומטי יומי לגיליון מסודר, ושחזור מלא של הנתונים בכל מחשב.';
            if (connectedActions) connectedActions.style.display = 'none';
            if (connectBtn) connectBtn.style.display = 'block';
        }
    } catch (e) {
        console.error('Google status check failed:', e);
    }
}

/**
 * Updates the Google Calendar sync card in the settings screen (rides on the
 * same connection as the backup card - shown once that account is connected).
 */
async function updateGoogleCalendarUI() {
    const group = document.getElementById('google-calendar-group');
    const statusText = document.getElementById('google-calendar-status-text');
    const reconsentBox = document.getElementById('google-calendar-reconsent');
    const fieldsBox = document.getElementById('google-calendar-settings-fields');
    const syncToggle = document.getElementById('setting-calendar-sync');
    if (!group || !statusText || !(window.api && window.api.oauthStatus)) return;

    try {
        const status = await refreshConnectionState();
        if (!status.connected) {
            group.style.display = 'none';
            return;
        }
        group.style.display = 'block';

        const enabled = isCalendarSyncEnabled();
        if (syncToggle) syncToggle.checked = enabled;

        const scopeOk = hasCalendarScope(status);
        if (reconsentBox) reconsentBox.style.display = (enabled && !scopeOk) ? 'block' : 'none';
        const showFields = enabled && scopeOk;
        if (fieldsBox) fieldsBox.style.display = showFields ? 'block' : 'none';

        const lastStr = status.calendarLastSyncAt ? new Date(status.calendarLastSyncAt).toLocaleString('he-IL') : '';
        if (!enabled) {
            statusText.innerText = 'הפעילו את המתג כדי לקבל תזכורות בדיקה ועונות פרישה ביומן Google ובדוא"ל, בלוח נפרד ופרטי משלכן.';
        } else if (!scopeOk) {
            statusText.innerText = 'החיבור לחשבון הגוגל קיים, אך עדיין לא אושרה גישה ליומן.';
        } else {
            statusText.innerHTML = `מחובר ליומן <b>${CALENDAR_SUMMARY}</b>.${lastStr ? '<br>סנכרון אחרון: ' + lastStr : ' עדיין לא בוצע סנכרון.'}`;
        }

        if (showFields) {
            const discretion = getCalendarDiscretion();
            const discretionSelect = document.getElementById('setting-calendar-discretion');
            if (discretionSelect) discretionSelect.value = discretion;
            const prefixWrap = document.getElementById('calendar-discreet-prefix-wrap');
            if (prefixWrap) prefixWrap.style.display = discretion === 'discreet' ? 'block' : 'none';
            const prefixInput = document.getElementById('setting-calendar-discreet-prefix');
            if (prefixInput) prefixInput.value = getCalendarDiscreetPrefix();
            const emailBox = document.getElementById('setting-calendar-notify-email');
            if (emailBox) emailBox.checked = isCalendarNotifyEmail();
            const popupBox = document.getElementById('setting-calendar-notify-popup');
            if (popupBox) popupBox.checked = isCalendarNotifyPopup();
            const morningInput = document.getElementById('setting-calendar-morning-time');
            if (morningInput) morningInput.value = getCalendarMorningTime();
            const mochBox = document.getElementById('setting-calendar-moch');
            if (mochBox) mochBox.checked = isMochDachukEnabled();
        }
    } catch (e) {
        console.error('Google Calendar status check failed:', e);
    }
}

/**
 * Gathers what a calendar sync needs from the current app state - the
 * settings snapshot buildExpectedEvents() takes as its `settings` param.
 */
function calendarSyncSettings() {
    return {
        discretion: getCalendarDiscretion(),
        discreetPrefix: getCalendarDiscreetPrefix(),
        notifyEmail: isCalendarNotifyEmail(),
        notifyPopup: isCalendarNotifyPopup(),
        morningTime: getCalendarMorningTime(),
        hefsekAdvisoryDays: getCalendarHefsekAdvisoryDays(),
        mochDachukEnabled: isMochDachukEnabled()
    };
}

/**
 * Runs a calendar sync using the app's current state, and reports the
 * outcome. Shared by the manual "סנכרן כעת" button and the automatic
 * triggers (spec §6ב) below.
 */
async function runCalendarSync() {
    const engineResult = calculateEngine(db, isOrZaruaEnabled(), engineOptions());
    const location = locationById(getSavedLocation());
    const todayAbs = halachicTodayAbs(location);
    return syncCalendarNow(db, engineResult, location, todayAbs, calendarSyncSettings());
}

window.saveCalendarSyncSetting = async function() {
    const enabled = document.getElementById('setting-calendar-sync').checked;
    saveCalendarSyncEnabled(enabled);
    await updateGoogleCalendarUI();
    if (enabled) {
        const status = await refreshConnectionState();
        if (hasCalendarScope(status)) {
            window.googleCalendarSyncNow();
        }
    }
    showToast(enabled ? 'סנכרון יומן גוגל הופעל.' : 'סנכרון יומן גוגל כובה.');
};

window.saveCalendarDiscretionSetting = function() {
    saveCalendarDiscretion(document.getElementById('setting-calendar-discretion').value);
    updateGoogleCalendarUI();
    showToast('רמת הדיסקרטיות נשמרה. לחצו "סנכרן כעת" כדי לעדכן אירועים קיימים.');
};

window.saveCalendarDiscreetPrefixSetting = function() {
    saveCalendarDiscreetPrefix(document.getElementById('setting-calendar-discreet-prefix').value);
};

window.saveCalendarChannelsSetting = function() {
    saveCalendarNotifyEmail(document.getElementById('setting-calendar-notify-email').checked);
    saveCalendarNotifyPopup(document.getElementById('setting-calendar-notify-popup').checked);
};

window.saveCalendarMorningTimeSetting = function() {
    saveCalendarMorningTime(document.getElementById('setting-calendar-morning-time').value);
};

window.saveCalendarMochSetting = function() {
    saveMochDachukEnabled(document.getElementById('setting-calendar-moch').checked);
};

window.googleCalendarReconsent = async function() {
    try {
        await connectGoogle(() => getGoogleBackupData(db, getRecoveryEmail));
        await updateGoogleStatusUI();
        await updateGoogleCalendarUI();
        showToast('הגישה ליומן אושרה.');
        window.googleCalendarSyncNow();
    } catch (e) {
        console.error('Calendar re-consent failed:', e);
        showAlert(explainGoogleError(e));
    }
};

window.googleCalendarSyncNow = function() {
    const btn = document.getElementById('calendar-sync-now-btn');
    if (btn) { btn.disabled = true; btn.innerText = 'מסנכרן...'; }
    runCalendarSync()
        .then(async (result) => {
            await updateGoogleCalendarUI();
            showToast(result.ok
                ? `סונכרן: ${result.created} נוצרו, ${result.updated} עודכנו, ${result.deleted} נמחקו.`
                : `הסנכרון הסתיים עם ${result.errors.length} שגיאות. נסו שוב מאוחר יותר.`);
        })
        .catch((e) => {
            console.error('Calendar sync failed:', e);
            showAlert('הסנכרון ליומן נכשל.\n\nבדקו את החיבור לאינטרנט ונסו שוב.\n' + explainGoogleError(e));
        })
        .finally(() => {
            if (btn) { btn.disabled = false; btn.innerText = 'סנכרן כעת'; }
        });
};

window.googleCalendarOpenBrowser = function() {
    // In Electron, main.js's setWindowOpenHandler already redirects any
    // http(s) window.open to the OS's default browser; in the web/PWA build
    // this just opens a normal new tab. No separate IPC channel needed.
    window.open('https://calendar.google.com/', '_blank');
};

window.googleCalendarClearConfirm = function() {
    showConfirm(
        'למחוק את כל תזכורות האפליקציה מיומן גוגל? הלוח עצמו יישאר, ואפשר לסנכרן מחדש בכל עת.',
        async () => {
            try {
                const result = await clearAllAppEvents();
                showToast(result.ok ? `נמחקו ${result.deleted} תזכורות.` : 'הניקוי נכשל.');
            } catch (e) {
                showAlert('ניקוי התזכורות נכשל.\n\n' + explainGoogleError(e));
            }
        },
        () => {}
    );
};

// ---------- Calendar sync triggers (spec §6ב) ----------

const CALENDAR_SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;

/** "טריגר פתיחה": once per app open, if 12h+ passed since the last sync. */
function tickCalendarAutoSync() {
    if (!isCalendarSyncEnabled() || !(window.api && window.api.oauthStatus)) return;
    window.api.oauthStatus().then(async status => {
        if (!status.connected || !hasCalendarScope(status)) return;
        const last = status.calendarLastSyncAt ? Date.parse(status.calendarLastSyncAt) : 0;
        if (Date.now() - last < CALENDAR_SYNC_INTERVAL_MS) return;
        await runCalendarSync();
        await updateGoogleCalendarUI();
    }).catch(() => { /* offline attempt - will retry on the next minute's tick */ });
}

let calendarSyncDebounceTimer = null;

/** "טריגר מיידי": debounced 3s after any save, so a burst of edits syncs once. */
function scheduleCalendarSyncDebounced() {
    if (!isCalendarSyncEnabled() || !(window.api && window.api.oauthStatus)) return;
    clearTimeout(calendarSyncDebounceTimer);
    calendarSyncDebounceTimer = setTimeout(async () => {
        try {
            const status = await refreshConnectionState();
            if (!status.connected || !hasCalendarScope(status)) return;
            await runCalendarSync();
            await updateGoogleCalendarUI();
        } catch (e) {
            console.error('Debounced calendar sync failed:', e);
        }
    }, 3000);
}

/**
 * Every place that used to call `onDataChanged(...)` alone now calls this
 * instead, so a save also (independently) considers a calendar re-sync.
 */
function notifyDataChanged() {
    onDataChanged(() => getGoogleBackupData(db, getRecoveryEmail));
    scheduleCalendarSyncDebounced();
}

/**
 * Turns a raw OAuth/Sheets failure into a specific, actionable Hebrew message.
 * The main process includes Google's own error code after a '|'.
 */
function explainGoogleError(e) {
    const msg = String((e && (e.message || e)) || '');
    const low = msg.toLowerCase();

    if (low.indexOf('redirect_uri_mismatch') > -1)
        return 'גוגל דחתה את כתובת החזרה.\n\nבפרויקט גוגל, סוג הלקוח (OAuth client type) חייב להיות Desktop app — ולא Web application.';
    if (low.indexOf('invalid_client') > -1)
        return 'גוגל דחתה את זיהוי האפליקציה (invalid_client).\n\n' +
               'זהו כשל של הגדרות האפליקציה עצמה — נסו להתקין מחדש את הגירסה החדשה, ' +
               'ואם הבעיה נמשכת פנו למפתח.';
    if (low.indexOf('client_secret is missing') > -1)
        return 'גוגל דורשת את סוד הלקוח (client secret) בהחלפת הקוד.\n\n' +
               'הסוד אמור להיות מובנה בתוך האפליקציה — כנראה זו גירסה חלקית. ' +
               'התקינו מחדש את הגירסה המלאה ונסו שוב.';
    if (low.indexOf('invalid_grant') > -1)
        return 'הקוד שגוגל החזירה אינו תקף יותר (או שהשתמשתם בו פעמיים).\n\nנסו להתחבר שוב מהתחלה.';
    if (low.indexOf('access_denied') > -1)
        return 'ההתחברות נדחתה בדף ההסכמה של גוגל — לא אושרה הגישה לחשבון.';
    if (low.indexOf('invalid_scope') > -1)
        return 'ההרשאות המבוקשות (Sheets ו-Drive) אינן מאושרות בפרויקט גוגל.';
    if (low.indexOf('timeout') > -1)
        return 'ההתחברות בדפדפן לא הושלמה בתוך שתי דקות.\n\nנסו שוב, והפעם השלימו את האישור בדפדפן עד הסוף.';
    if (low.indexOf('create_sheet_failed_403') > -1)
        return 'ההתחברות הצליחה, אבל יצירת הגיליון נדחתה (403).\n\nודאו ש-Google Sheets API ו-Google Drive API מופעלים בפרויקט.';
    if (low.indexOf('create_sheet_failed_401') > -1)
        return 'ההתחברות הצליחה, אבל הטוקן נדחה (401).\n\nנסו לנתק ולחבר מחדש.';
    if (low.indexOf('create_sheet_failed') > -1)
        return 'ההתחברות הצליחה, אבל יצירת הגיליון נכשלה: ' + msg.split('|').pop();
    if (low.indexOf('token_exchange_failed') > -1) {
        const detail = msg.split('|').pop();
        return 'החלפת קוד ההרשאה בטוקן נכשלה.\n\nפרט מגוגל: ' + detail;
    }
    return msg
        ? 'ההתחברות לגוגל נכשלה.\n\nפרט: ' + msg
        : 'ההתחברות לגוגל נכשלה או בוטלה. נסו שוב.';
}

window.googleConnect = async function() {
    const statusText = document.getElementById('google-status-text');
    try {
        if (statusText) statusText.innerText = 'נפתח חלון ההתחברות של גוגל... השלימו את ההתחברות בדפדפן.';
        await connectGoogle(() => getGoogleBackupData(db, getRecoveryEmail));
        await updateGoogleStatusUI();
        // בלי זה כרטיס היומן נשאר מוסתר עד להפעלה מחדש של האפליקציה - הוא
        // מוצג/מוסתר לפי status.connected, שרק עתה התעדכן.
        await updateGoogleCalendarUI();
        showAlert('חשבון הגוגל חובר בהצלחה!\n\nנוצר גיליון "לוח טהרת המשפחה - גיבוי" ב-Drive שלכם, והגיבוי יתבצע אוטומטית פעם ביום.');
    } catch (e) {
        console.error('Google connect failed:', e);
        await updateGoogleStatusUI();
        await updateGoogleCalendarUI();
        showAlert(explainGoogleError(e));
    }
};

window.googleBackupNow = function() {
    backupNow(() => getGoogleBackupData(db, getRecoveryEmail))
        .then(() => updateGoogleStatusUI())
        .catch((e) => showAlert('הגיבוי נכשל.\n\nבדקו את החיבור לאינטרנט ונסו שוב.\n' + explainGoogleError(e)));
};

window.googleOpenSheet = async function() {
    // Without this the button silently did nothing when no sheet existed yet
    // (it is only created by the first successful backup).
    const status = await refreshConnectionState();
    if (!status || !status.sheetId) {
        showAlert('הגיליון עדיין לא נוצר.\n\nהוא נוצר בגיבוי המוצלח הראשון — לחצו "גבה עכשיו".');
        return;
    }
    openSheetInBrowser();
};

// ---------- Restore from the Google backup (settings screen) ----------

/** Backup snapshot fetched by the last "restore" click, awaiting the user's choice. */
let pendingRestore = null;

/**
 * Pulls the backup down, shows what would change, and lets the user pick
 * merge (never deletes) or full replace. Nothing is written until they choose.
 */
window.googleRestoreBackup = async function() {
    const statusText = document.getElementById('google-status-text');
    try {
        if (statusText) statusText.innerText = 'שולף את הגיבוי מגוגל...';
        const status = await refreshConnectionState();
        if (!status.connected) {
            showAlert('לא מחובר חשבון גוגל במחשב זה.');
            await updateGoogleStatusUI();
            return;
        }

        const remote = await fetchBackup();
        const remoteDb = remote.db || {};
        const remoteCount = Object.keys(remoteDb).length;

        if (remoteCount === 0) {
            showAlert('הגיבוי בגוגל ריק — אין מה לשחזר ממנו.');
            await updateGoogleStatusUI();
            return;
        }

        const preview = mergeDb(db, remoteDb);
        const localCount = Object.keys(db || {}).length;
        pendingRestore = { remoteDb, pin: remote.pin, recoveryEmail: remote.recoveryEmail };

        const summary = document.getElementById('restore-google-summary');
        if (summary) {
            summary.innerHTML =
                'בגיבוי שבגוגל יש <b>' + remoteCount + '</b> אירועים, במכשיר יש <b>' + localCount + '</b>.<br>' +
                '• <b>מיזוג</b> יוסיף ' + preview.addedKeys.length + ' אירועים שחסרים במכשיר, ולא ימחק דבר.<br>' +
                '• <b>החלפה</b> תדרוס את המכשיר בגיבוי — ' + preview.localOnlyKeys.length + ' אירועים שקיימים רק במכשיר יאבדו.<br><br>' +
                'אם רק מחקת משהו בשוגג — בחר <b>מיזוג</b>.';
        }
        openModal('restore-google-modal');
        await updateGoogleStatusUI();
    } catch (e) {
        console.error('Google restore failed:', e);
        await updateGoogleStatusUI();
        showAlert('שליפת הגיבוי נכשלה.\n\n' + explainGoogleError(e));
    }
};

/**
 * Applies the fetched backup with the chosen strategy.
 * @param {'merge'|'replace'} mode
 */
window.googleRestoreApply = async function(mode) {
    if (!pendingRestore) {
        closeModal('restore-google-modal');
        showAlert('הגיבוי נשלף מחדש לפני השחזור.');
        return;
    }
    closeModal('restore-google-modal');

    try {
        if (mode === 'replace') {
            db = Object.assign({}, pendingRestore.remoteDb);
        } else {
            db = mergeDb(db, pendingRestore.remoteDb).db;
        }
        saveDb(db);
        refreshCalendar();
        showToast(mode === 'replace' ? 'הנתונים הוחלפו בגיבוי מגוגל ✓' : 'האירועים החסרים נוספו מהגיבוי ✓');

        // Push the restored state back up so the sheet matches this device
        // immediately instead of waiting for the next scheduled backup.
        try {
            const data = await getGoogleBackupData(db, getRecoveryEmail);
            await backupNow(() => Promise.resolve(data));
            await updateGoogleStatusUI();
        } catch (e) {
            console.warn('[GoogleRestore] push after restore failed:', e);
        }
    } catch (e) {
        console.error('Applying Google restore failed:', e);
        showAlert('השחזור נכשל.\n\n' + (e && e.message ? e.message : e));
    } finally {
        pendingRestore = null;
    }
};

// ---------- Restore points (history tab) ----------

/** Points fetched by the last click, indexed by the buttons in the modal. */
let restorePoints = [];

function formatPointTime(ts) {
    try {
        return new Date(ts).toLocaleString('he-IL');
    } catch (e) {
        return ts;
    }
}

/**
 * Lists the restore points recorded in the sheet's history tab.
 */
window.googleOpenRestorePoints = async function() {
    const statusText = document.getElementById('google-status-text');
    const info = document.getElementById('restore-points-info');
    const list = document.getElementById('restore-points-list');
    try {
        if (statusText) statusText.innerText = 'קורא את ההיסטוריה מהגיליון...';
        const status = await refreshConnectionState();
        if (!status.connected) {
            showAlert('לא מחובר חשבון גוגל במחשב זה.');
            await updateGoogleStatusUI();
            return;
        }

        restorePoints = await fetchRestorePoints();
        const localCount = Object.keys(db || {}).length;

        if (list) list.innerHTML = '';
        if (restorePoints.length === 0) {
            if (info) info.innerText = 'עדיין אין היסטוריה בגיליון.\n\nההיסטוריה נבנית מהגיבוי הבא ואילך — כל שינוי שתיעדו יישמר בה, ואפשר יהיה לחזור אליו.';
            openModal('restore-points-modal');
            await updateGoogleStatusUI();
            return;
        }

        if (info) {
            info.innerText = 'נמצאו ' + restorePoints.length + ' נקודות שחזור (החדשה למעלה). במכשיר יש כרגע ' +
                localCount + ' אירועים. בחירת נקודה תציג מה ישתנה — שום דבר לא נשמר עד שתאשרו.';
        }

        restorePoints.forEach((point, index) => {
            const btn = document.createElement('button');
            btn.className = 'action-btn btn-outline';
            btn.style.textAlign = 'right';
            btn.style.lineHeight = '1.5';
            const parts = [];
            if (point.added) parts.push(point.added + ' נוספו');
            if (point.updated) parts.push(point.updated + ' עודכנו');
            if (point.deleted) parts.push(point.deleted + ' נמחקו');
            btn.innerHTML = '<b>' + formatPointTime(point.ts) + '</b><br>' +
                '<span style="font-size:0.85em;">' + point.count + ' אירועים בגיבוי' +
                (parts.length ? ' · שינויים בגיבוי זה: ' + parts.join(', ') : '') + '</span>';
            btn.addEventListener('click', () => window.googlePickRestorePoint(index));
            if (list) list.appendChild(btn);
        });

        openModal('restore-points-modal');
        await updateGoogleStatusUI();
    } catch (e) {
        console.error('Loading restore points failed:', e);
        await updateGoogleStatusUI();
        showAlert('קריאת ההיסטוריה נכשלה.\n\n' + explainGoogleError(e));
    }
};

/**
 * Takes one restore point and hands it to the same merge/replace dialog used by
 * the regular restore, so both paths behave identically.
 */
window.googlePickRestorePoint = function(index) {
    const point = restorePoints[index];
    if (!point) return;
    closeModal('restore-points-modal');

    const remoteDb = point.db || {};
    const preview = mergeDb(db, remoteDb);
    const localCount = Object.keys(db || {}).length;
    pendingRestore = { remoteDb: remoteDb, pin: '', recoveryEmail: '' };

    const summary = document.getElementById('restore-google-summary');
    if (summary) {
        summary.innerHTML =
            'נקודת שחזור מ־<b>' + formatPointTime(point.ts) + '</b> — ' + point.count + ' אירועים.<br>' +
            'במכשיר יש ' + localCount + ' אירועים.<br>' +
            '• <b>מיזוג</b> יוסיף ' + preview.addedKeys.length + ' אירועים שחסרים במכשיר, ולא ימחק דבר.<br>' +
            '• <b>החלפה</b> תדרוס את המכשיר — ' + preview.localOnlyKeys.length + ' אירועים שקיימים רק במכשיר יאבדו.<br><br>' +
            'לשחזור אירוע שנמחק — בחרו <b>מיזוג</b>.';
    }
    openModal('restore-google-modal');
};

window.googleDisconnectConfirm = function() {
    showConfirm('לנתק את חשבון הגוגל? הגיבוי האוטומטי יופסק. הגיליון הקיים יישמר ב-Drive שלכם.', async () => {
        await disconnectGoogle();
        await updateGoogleStatusUI();
        await updateGoogleCalendarUI(); // מסתיר את כרטיס היומן מיד, לא רק בהפעלה הבאה
        showToast('חשבון הגוגל נותק');
    });
};

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
        const shifted = shiftHebrewMonth(currentHDate.getFullYear(), currentHDate.getMonth(), direction);
        currentHDate = new HDate(1, shifted.month, shifted.year);
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
        btn.innerHTML = theme === 'dark' ? ICONS.SUN : ICONS.MOON;
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

// --- Global zoom (spec: "כפתורי זום גלובליים בכל התוכנה") ---
const ZOOM_MIN = 70;
const ZOOM_MAX = 160;
const ZOOM_STEP = 10;

function applyZoom(level) {
    document.body.style.zoom = level / 100;
    const label = document.getElementById('zoom-level-label');
    if (label) label.innerText = level + '%';
}

window.zoomIn = function() {
    const level = Math.min(ZOOM_MAX, getZoomLevel() + ZOOM_STEP);
    saveZoomLevel(level);
    applyZoom(level);
};

window.zoomOut = function() {
    const level = Math.max(ZOOM_MIN, getZoomLevel() - ZOOM_STEP);
    saveZoomLevel(level);
    applyZoom(level);
};

window.zoomReset = function() {
    saveZoomLevel(100);
    applyZoom(100);
};

window.switchView = function(viewId, activeTabId, desktopNavId) {
    switchView(viewId, activeTabId);
};

/**
 * Settings side-nav (index.html `.side-nav`): jumps to a section inside
 * the currently-open settings tab instead of navigating away from it. Sets
 * the clicked link active immediately - the scroll-spy (below) would get
 * there too, but only once the smooth-scroll animation actually settles.
 */
window.jumpToSettingsSection = function(event, sectionId) {
    if (event) event.preventDefault();
    const target = document.getElementById(sectionId);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (event && event.currentTarget) {
        const nav = event.currentTarget.closest('.side-nav');
        if (nav) {
            nav.querySelectorAll('a').forEach(a => a.classList.toggle('active', a === event.currentTarget));
        }
    }
};

/**
 * "סרגל צד קבוע לניווט קל" (הגדרות, אודות/מדריך): מסמן אוטומטית איזה קישור
 * תואם לקטע שהמשתמשת רואה כרגע בגלילה, לא רק בלחיצה - בדיוק כמו תוכן עניינים
 * חי. שני הסרגלים חולקים את אותו CSS (.side-nav), ולכן גם את אותה לוגיקה.
 */
function initSideNavScrollSpy(nav) {
    if (!nav) return;
    const links = Array.from(nav.querySelectorAll('a[href^="#"]'));
    const sections = links
        .map(link => document.getElementById(link.getAttribute('href').slice(1)))
        .filter(Boolean);
    if (!sections.length) return;

    const setActive = (id) => {
        links.forEach(link => link.classList.toggle('active', link.getAttribute('href') === '#' + id));
    };

    const observer = new IntersectionObserver((entries) => {
        const visible = entries.filter(e => e.isIntersecting);
        if (!visible.length) return;
        // הקטע שהחלק הגדול ביותר ממנו גלוי כרגע - לא בהכרח הראשון שנכנס למסך.
        visible.sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        setActive(visible[0].target.id);
    }, { rootMargin: '-15% 0px -70% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] });

    sections.forEach(section => observer.observe(section));
    setActive(sections[0].id); // מצב פתיחה, לפני שהמשתמשת גללה כלל
}

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
    
    const engineData = calculateEngine(db, isOrZaruaEnabled(), engineOptions());
    
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
                let yh = r.yomHachodesh || getYomHachodeshInfo(r.hdate);
                let yhStr = yh.entries.map(e => `${new HDate(e.abs).renderGematriya()} (${e.label})`).join(' או ');
                if (yh.mode === 'disputed') yhStr += ' - מחלוקת, יש לשאול רב';
                let valStr = `עונה: ${onaStr} | הפלגה קודמת: ${r.haflagahDiff ? r.haflagahDiff + ' ימים' : '-'} | יום 30: ${new HDate(r.abs + 29).renderGematriya()} + ל"א: ${new HDate(r.abs + 30).renderGematriya()} | יום החודש: ${yhStr} | הפלגה עתידית: ${r.nextHaflagahDate ? r.nextHaflagahDate.renderGematriya() : '-'}`;
                payload[keyName] = valStr;
            });

            // The fixed veset, if one was established - and the fact that the
            // other concerns no longer apply.
            if (engineData.chazaka && engineData.chazaka.established.length) {
                payload["⭐ וסת קבוע שנקבע"] = engineData.chazaka.established.map(v =>
                    describeVeset(v) + ' (מכוח הראיות: ' +
                    v.establishedBy.map(a => new HDate(a).renderGematriya()).join(', ') + ')'
                ).join(' | ') + ' — מכוח הוסת הקבוע אין חוששים לשאר החששות.';
            }

            // A veset time that passed without a proper check is not clarified -
            // the din is that she is forbidden until she checks.
            const pending = engineData.computed.pendingChecks || [];
            if (pending.length) {
                payload["⏳ זמני וסת שעברו בלא בדיקה"] = pending.map(p =>
                    new HDate(p.abs).renderGematriya() + ' (' + p.code + ')'
                ).join(' | ') + ' — לא נברר שלא ראתה; אסורה לבעלה עד שתבדק.';
            }
        }
    }

    if (optHistory) {
        let historyEvents = Object.keys(db).map(Number).sort((a,b) => b - a);
        let eventsFound = false;
        const countedByAbs = new Map((engineData.reiyot || []).map(r => [r.abs, r]));
        
        historyEvents.forEach(abs => {
            let hd = new HDate(abs);
            let typeStr = "";
            
            if (db[abs].type === 'reiyah') {
                const kindText = { ones: 'אונס/קפיצה', sharp: 'מאכל חריף', pills: 'כדורים' }[db[abs].kind];
                const flowText = db[abs].durationDays > 1 ? `, נמשכה ${db[abs].durationDays} ימים` : '';
                typeStr = `ראייה (${db[abs].ona === 'day' ? 'יום' : 'לילה'}${kindText ? ', ' + kindText : ''}${flowText})`;
                const rInfo = countedByAbs.get(abs);
                if (rInfo && rInfo.counted === false && rInfo.exclusion) {
                    typeStr += ` | לא נספרת לקביעת וסת: ${rInfo.exclusion.text}`;
                }
            }
            else if (db[abs].type === 'hefsek') typeStr = "הפסק טהרה";
            else if (db[abs].type === 'tevilah') typeStr = "טבילה";
            else if (db[abs].type === 'check') {
                const depthLabel = CHECK_DEPTH_LABELS[db[abs].depth] || CHECK_DEPTH_LABELS.deep;
                const twiceText = db[abs].twice === true ? ', פעמיים בעונה' : '';
                typeStr = `בדיקה (${depthLabel}${twiceText}, עונת ${db[abs].ona === 'night' ? 'לילה' : 'יום'})`;
            }
            else if (db[abs].type === 'sign') {
                typeStr = `מיחוש גופני בלא ראייה (עונת ${db[abs].ona === 'night' ? 'לילה' : 'יום'}: ${(db[abs].signs || []).map(bodySignLabel).join(', ')})`;
            }
            if (db[abs].standaloneSign === true && db[abs].type !== 'sign') {
                typeStr += ` | מיחוש גופני שתועד בלא ראייה: ${(db[abs].signs || []).map(bodySignLabel).join(', ')}`;
            }
            if (db[abs].type === 'sign' || db[abs].standaloneSign === true) {
                const signDin = db[abs].type === 'check'
                    ? 'המיחוש נזכר בבדיקה שנעשתה בו.'
                    : 'משעה שבא המיחוש אסורה כדין שעת הוסת — ואם עבר ולא נבדקה, אסורה עד שתבדוק.';
                typeStr += ` | ${signDin}`;
            }
            
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
        requestPersistentStorage();
    });
};

window.verifyPin = function() {
    verifyPin(() => {
        refreshCalendar();
        requestPersistentStorage();
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
        // The PIN is one-way hashed (js/pinCrypto.js) and cannot be read back
        // here to sync it to the recovery sheet - it syncs automatically the
        // next time the PIN itself is set or changed (js/security.js).
        showToast("כתובת האימייל לשחזור נשמרה.");
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
    const profileSelect = document.getElementById('setting-minhag-profile');
    if (profileSelect) profileSelect.value = detectMinhagProfile(currentMinhagState());
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
        btn.innerHTML = isYearlyView
            ? `${ICONS.CHEVRON_DOWN} תצוגה חודשית`
            : `${ICONS.CALENDAR} תצוגה שנתית`;
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

    // "בדיקה שנייה" — בחירה שאמורה לחזור בכל פתיחה, ולא להישאר מפעם קודמת;
    // ואם היום כבר נרשמה בדיקה כפולה, היא חוזרת ומסומנת.
    const second = document.getElementById('check-second-part');
    if (second) second.value = '';
    const savedEntry = db[selectedAbsDate];
    if (second && savedEntry && savedEntry.type === 'check' && checkPartsOf(savedEntry).length > 1) {
        second.value = checkPartsOf(savedEntry)[1];
    }

    // "נמצא דם בבדיקה" (וסת מעד בדיקה) — כמו הבדיקה השנייה, חוזר לברירת המחדל
    // בכל פתיחה, ומסומן מחדש אם היום הזה כבר נרשם כך.
    const bloodFoundBox = document.getElementById('check-blood-found');
    if (bloodFoundBox) {
        bloodFoundBox.checked = !!(savedEntry && savedEntry.type === 'check' && savedEntry.bloodFound === true);
    }

    // סימוני היום — חוזרים ומסומנים ממה שנשמר, שאחרת עריכה היתה מוחקת אותם.
    buildDayMarksList();
    const savedMarks = marksOf(db[selectedAbsDate]);
    document.querySelectorAll('input[name="day-mark"]').forEach(input => {
        input.checked = savedMarks.indexOf(input.value) !== -1;
    });
    const marksHint = document.getElementById('day-marks-hint');
    if (marksHint) {
        const labels = savedMarks.map(code => {
            const def = DAY_MARKS.find(m => m.code === code);
            return def ? def.label : code;
        });
        marksHint.innerText = labels.length
            ? 'סימונים הרשומים על יום זה: ' + labels.join(' · ')
            : '';
    }

    renderDayPrishaHint();
    
    openModal('modal');
};

/**
 * Shows, for the day being edited, what the engine says about it: whether it is a
 * separation day, why, and whether a proper check is still missing.
 *
 * Without this, the check plate (B4) would be a blind form: the user would have to
 * guess WHICH day the engine is waiting on.
 */
function renderDayPrishaHint() {
    const box = document.getElementById('modal-prisha-hint');
    if (!box) return;

    const engineData = calculateEngine(db, isOrZaruaEnabled(), engineOptions());
    const list = engineData.computed.prishot[selectedAbsDate] || [];
    const entry = db[selectedAbsDate] || {};
    const lines = [];

    // מסולקת דמים: לא זו בלבד שאין חוששין לחששות הישנים - היא אף פטורה מבדיקה
    // `[שט כ"ה | עמ' 17–18]`, ולכן אין לתבוע ממנה בדיקה על היום הזה.
    const exemptFromCheck = !!(engineData.life && engineData.life.exemptFromCheck);

    if (list.length || exemptFromCheck) {
        if (list.length) {
            const codes = [...new Set(list.map(p => p.code))].join(', ');
            lines.push(`<b>יום זה מסומן כעונת פרישה (${codes}).</b>`);
            list.forEach(p => {
                lines.push('• ' + p.reason + (p.ona === 'night' ? ' — עונת לילה' : ' — עונת יום'));
            });
        }
        if (exemptFromCheck) {
            lines.push(`${lifeStateSummary(engineData.life)} — פטורה מבדיקה, ולכן אין כאן חובת בדיקה <span style="white-space:nowrap;">[שט כ\"ה | עמ\' 17–18]</span>`);
        } else {
            lines.push('יש לבדוק בעומק ובחו"ס. בלא בדיקה לא נברר שלא ראתה, ואין הוסת נעקר <span style="white-space:nowrap;">[שט מ"א | עמ\' 182]</span>');
        }
    }

    // וסת הגוף (B2): המיחוש שתועד ביום הזה — "משעה שבאו המיחושים אסורה כדין שעת הוסת".
    const daySigns = (Array.isArray(entry.signs) ? entry.signs : []).map(bodySignLabel);
    if (daySigns.length) {
        lines.push(`<b>ביום זה תועד מיחוש וסת הגוף:</b> ${daySigns.join(', ')} — `
            + `"משעה שבאו המיחושים אסורה כדין שעת הוסת", ולכן כשתבא המיחוש שוב חוששת לו, `
            + `ואם עבר ולא נבדקה — אסורה עד שתבדוק `
            + `<span style="white-space:nowrap;">[שט ל"ט | עמ' 158] · [שט ל"ט | עמ' 160]</span>`);
    }

    // סימוני היום (js/dayMarks.js): כל סימון מוצג עם דינו ומראה מקומו, ולא נשאר
    // רשומה נסתרת.
    marksOf(entry).forEach(code => {
        const rule = DAY_MARK_RULES[code];
        if (!rule) return;
        lines.push(`<b>${rule.title}.</b> ${rule.text} `
            + `<span style="white-space:nowrap;">${rule.source}</span>`);
    });

    // זמן הווסת המורכבת (יום + מיחוש): חוששת בו אף קודם שבא המיחוש `[שט כ"ז | עמ' 49]`.
    if (list.some(p => p.establishedConcern)) {
        lines.push('זהו זמן <b>הווסת המורכבת</b> (יום ומיחוש): חוששת בו אף קודם שבא המיחוש, '
            + 'ולכן יש לבדוק בו בדיקה כדין — בעומק ובחו"ס '
            + '<span style="white-space:nowrap;">[שט כ"ז | עמ\' 49] · [שט ל\"ט | עמ\' 160]</span>');
    }

    if (entry.type === 'check') {
        const label = CHECK_DEPTH_LABELS[entry.depth] || CHECK_DEPTH_LABELS.deep;
        const parts = checkPartsOf(entry);
        if (parts.length) {
            lines.push(`<b>הבדיקה שתועדה:</b> ${label} — ${parts.map(checkPartLabel).join(' · ')} `
                + `<span style="white-space:nowrap;">[שט ל' | עמ' 77]</span>`);
        }
        const twiceText = entry.twice === true
            ? ' <b>ופעמיים בעונה זו</b> — לכתחילה: בעונת היום עם הקימה וסמוך לשקיעה, בעונת הלילה סמוך לשקיעה ולפני השינה <span style="white-space:nowrap;">[שט ל\' | עמ\' 77]</span>'
            : '';
        lines.push(`<b>נרשמה בדיקה ביום זה:</b> ${label} — עונת ${entry.ona === 'night' ? 'לילה' : 'יום'}${twiceText}`);
    }

    // מיחוש בלא ראייה: המיחוש עצמו הוא האוסר, ותובע בדיקה בו ביום.
    if (entry.type === 'sign' || entry.standaloneSign === true) {
        const signText = (Array.isArray(entry.signs) ? entry.signs : []).map(bodySignLabel).join(', ');
        lines.push(`<b>מיחוש גופני שתועד בלא ראייה:</b> ${signText} — "משעה שבאו המיחושים אסורה '
            + 'כדין שעת הוסת", ולכן מן השעה שהמיחוש בא אסורה, ואם עבר היום ולא נבדקה — '
            + 'אסורה עד שתבדוק בבדיקה כדין: בעומק ובחו"ס '
            + '<span style="white-space:nowrap;">[שט ל\'ט | עמ\' 158] · [שט ל\"ט | עמ\' 160]</span>`);
    }

    const pending = exemptFromCheck
        ? []
        : (engineData.computed.pendingChecks || []).filter(p => p.abs === selectedAbsDate);
    if (pending.length) {
        lines.push(`${ICONS.ALERT} <b>זמן הוסת הזה עבר בלא בדיקה כדין.</b> כל עוד לא נבדק — לא נברר שלא ראתה, והדין הוא שאסורה לבעלה עד שתבדק <span style="white-space:nowrap;">[שט כ"ד | עמ' 7]</span>`);
    }

    // זמני הנץ והשקיעה מצטרפים לרמז היום (ספק עונה — B6) — אך רק כשיש מה לומר
    // על היום ממילא, כדי שהרמז לא ייהפך להודעת מידע בכל יום.
    const dayTimesText = lines.length ? timesLine(selectedAbsDate, locationById(getSavedLocation())) : '';
    if (dayTimesText) lines.push(dayTimesText);

    if (!lines.length) {
        box.style.display = 'none';
        box.innerHTML = '';
        return;
    }

    box.style.display = 'block';
    box.style.background = 'rgba(79, 70, 229, 0.08)';
    box.style.border = '1px solid var(--primary)';
    box.style.borderRadius = '8px';
    box.style.padding = '10px 12px';
    box.style.marginBottom = '12px';
    box.style.fontSize = '0.86em';
    box.style.lineHeight = '1.6';
    box.innerHTML = lines.join('<br>');
}

// תצוגת ההערה האישית: משבצת היום בלוח קטנה מכדי להכיל הערה ארוכה בשלמותה, ו-title
// (הדרך הקודמת) לא עובד באמינות במגע ואינו מוגן מתווים מיוחדים בטקסט. לכן העיקון
// בלוח פותח כרטיסון עם הטקסט המלא (ללא שום קיצוץ), ומשם אפשר לגשת לעריכה.
let notePreviewAbs = null;

window.showDayNotePreview = function(abs) {
    const entry = db[abs];
    const text = entry && entry.note ? entry.note : '';
    if (!text) return;
    notePreviewAbs = abs;
    document.getElementById('note-preview-title').innerText = `הערה — ${new HDate(abs).renderGematriya()}`;
    document.getElementById('note-preview-text').innerText = text;
    openModal('note-preview-modal');
};

window.editNoteFromPreview = function() {
    if (notePreviewAbs === null) return;
    closeModal('note-preview-modal');
    window.openDayModal(new HDate(notePreviewAbs));
};

window.saveNote = function() {
    if (!selectedAbsDate) return;
    if (!db[selectedAbsDate]) db[selectedAbsDate] = {};
    db[selectedAbsDate].note = document.getElementById('day-note').value;
    
    saveDb(db);
    notifyDataChanged();
    closeModal('modal');
    refreshCalendar();
    showToast("ההערה נשמרה");
};

window.requestSaveEvent = function(type, ona, depth) {
    if (!selectedAbsDate) return;

    // A sighting (B3/B5) gathers two details that change the calculation itself,
    // so it opens its own step before anything is saved.
    if (type === 'reiyah') {
        openReiyahDetails(ona);
        return;
    }

    // A check (B4) records HOW she checked: only a proper one (depth/spaces) can
    // uproot a veset, so the depth is part of the record itself. And whether she
    // checked twice in the onah (A3: "לכתחילה פעמיים", while the din itself is once).
    if (type === 'check') {
        const checkOna = ona === 'night' ? 'night' : 'day';
        const extra = { depth: depth === 'wipe' ? 'wipe' : 'deep' };
        // A3: בדיקה שנעשתה פעמיים בעונה נרשמת בשני חלקים — החלק הראשון של העונה
        // והחלק שנבחר מן הרשימה. כך הבדיקה השנייה אינה נבלעת בשדה אחד
        // `[שט ל' | עמ' 77]`.
        const secondPart = document.getElementById('check-second-part');
        const second = secondPart ? secondPart.value : '';
        if (second && isCheckPart(second)) {
            extra.checkParts = [FIRST_CHECK_PART[checkOna], second];
            extra.twice = true;
        }
        // "וסת מעד בדיקה" (מתג vesetFromBedika) — הסימון נשמר בכל מקרה, ומשפיע
        // על החישוב רק כשהמתג בהגדרות דלוק (js/calculations.js).
        const bloodFound = document.getElementById('check-blood-found');
        if (bloodFound && bloodFound.checked) extra.bloodFound = true;
        executeSaveEvent('check', checkOna, extra);
        return;
    }

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

/**
 * החלק הראשון של כל עונה — הבדיקה הראשונה נעשתה בו ממילא, והרשימה שבממשק
 * מוסיפה את הבדיקה השנייה. "בעונת היום עם הקימה וסמוך לשקיעה, ובעונת הלילה סמוך
 * לשקיעה ולפני השינה" `[שט ל' | עמ' 77]`.
 */
const FIRST_CHECK_PART = { day: 'rise', night: 'sunset' };

function executeSaveEvent(type, ona, extra) {
    const previous = db[selectedAbsDate] || {};
    if (!db[selectedAbsDate]) db[selectedAbsDate] = {};
    db[selectedAbsDate].type = type;
    if (ona) db[selectedAbsDate].ona = ona;
    db[selectedAbsDate].note = document.getElementById('day-note').value;
    if (extra) Object.assign(db[selectedAbsDate], extra);

    // מיחוש גופני שתועד בלא ראייה אינו נמחק על ידי אירוע אחר באותו יום: הוא נספר
    // לוסת הגוף, ותביעת הבדיקה שלו נסגרת דוקא בבדיקה שנעשית בו ("אסורה עד שתבדוק").
    // ואם נרשמה בו ראייה — המיחוש מצטרף לראייה עצמה, וזו נספרת עמו (וסת מורכב).
    if (previous.standaloneSign === true && Array.isArray(previous.signs) && previous.signs.length
        && type !== 'sign') {
        db[selectedAbsDate].signs = previous.signs.slice();
        if (type !== 'reiyah') db[selectedAbsDate].standaloneSign = true;
    }

    saveDb(db);
    notifyDataChanged();
    closeModal('modal');
    refreshCalendar();
    showToast("האירוע נשמר בלוח");
}

// ---------- סימוני היום (js/dayMarks.js) ----------

/** בונה את רשימת סימוני היום מתוך `DAY_MARKS` — מקור אחד לרשימה, לקודים ולניסוחים. */
function buildDayMarksList() {
    const box = document.getElementById('day-marks-list');
    if (!box || box.dataset.built === 'true') return;
    box.innerHTML = DAY_MARKS.map(mark => `
        <label style="display: flex; align-items: flex-start; gap: 8px; font-size: 0.88em; cursor: pointer;">
            <input type="checkbox" name="day-mark" value="${mark.code}" style="width: 16px; height: 16px; margin-top: 2px; accent-color: var(--primary);">
            <span>${mark.label}</span>
        </label>
    `).join('');
    box.dataset.built = 'true';
}

/** הסימונים שסומנו כרגע במודאל היום. */
function selectedDayMarks() {
    const out = [];
    document.querySelectorAll('input[name="day-mark"]').forEach(input => {
        if (input.checked) out.push(input.value);
    });
    return out;
}

/**
 * שומר את סימוני היום על רשומת היום — מכל סוג שהיא.
 *
 * הסימונים אינם "סוג אירוע": יום יכול להיות גם יום ראייה וגם יום יציאה לדרך,
 * ולכן הם נשמרים ברשימה על הרשומה ואינם דורסים את סוגה. קוד שנשמר ואינו מוכר
 * עוד נשמר אף הוא, כדי שלא ייעלם תיעוד שהוזן קודם.
 */
window.saveDayMarks = function() {
    if (!selectedAbsDate) return;
    const marks = selectedDayMarks();
    const entry = db[selectedAbsDate] || (db[selectedAbsDate] = {});
    const keptUnknown = marksOf(entry).length
        ? []
        : (Array.isArray(entry.marks) ? entry.marks : [])
            .filter(code => !DAY_MARKS.some(m => m.code === code));
    const all = marks.concat(keptUnknown.filter(code => marks.indexOf(code) === -1));
    if (all.length) entry.marks = all;
    else if (entry.marks) delete entry.marks;
    const noteArea = document.getElementById('day-note');
    if (noteArea && noteArea.value) entry.note = noteArea.value;

    saveDb(db);
    notifyDataChanged();
    refreshCalendar();

    if (marks.indexOf('fright') !== -1) {
        showToast('נרשם פחד פתאום — "ביעתותא גורמת לביאת הדם", ולמעשה אסורה עד שישאלנה אם הרגישה [שט כ\"ז | עמ\' 42]');
    } else if (marks.indexOf('stain') !== -1) {
        showToast('נרשם כתם — "והכתם כמי שאינו לענין וסתות": אינו קובע ואינו מוסיף חשש [שט ל\"ה | עמ\' 127]');
    } else if (marks.indexOf('anxiety') !== -1) {
        showToast('נרשמה חרדה מתמשכת — מסלקת את הדמים [שט כ\"ז | עמ\' 42]');
    } else {
        showToast(marks.length ? 'סימוני היום נשמרו' : 'סימוני היום הוסרו מן היום');
    }
};

// ---------- Sighting details: B3 (why) and B5 (did the bleeding run on) ----------

/** Holds the ona chosen in the day menu while the details step is open. */
let pendingReiyahOna = 'day';

/**
 * בונה את רשימת המיחושים מתוך `BODY_SIGNS` (js/vesetGuf.js) — מקור אחד לרשימה,
 * לקודים ולניסוחים, כדי שמה שמוצג למשתמשת יהיה בדיוק מה שהמנוע מזהה.
 */
function buildSignList(boxId, inputName) {
    const box = document.getElementById(boxId);
    if (!box || box.dataset.built === 'true') return;
    box.innerHTML = BODY_SIGNS.map(sign => `
        <label style="display: flex; align-items: flex-start; gap: 8px; font-size: 0.88em; cursor: pointer;">
            <input type="checkbox" name="${inputName}" value="${sign.code}" style="width: 16px; height: 16px; margin-top: 2px; accent-color: var(--primary);">
            <span>${sign.label}</span>
        </label>
    `).join('');
    box.dataset.built = 'true';
}

function buildReiyahSignList() {
    buildSignList('reiyah-signs-list', 'reiyah-signs');
}

/** מציג את רשימת המיחושים רק לאחר שהמשתמשת אישרה שהמיחוש משונה וקשור לראייה. */
window.toggleReiyahSigns = function() {
    const wrap = document.getElementById('reiyah-signs-wrap');
    const confirm = document.getElementById('reiyah-signs-confirm');
    if (wrap) wrap.style.display = (confirm && confirm.checked) ? 'block' : 'none';
    if (confirm && !confirm.checked) {
        document.querySelectorAll('input[name="reiyah-signs"]').forEach(input => { input.checked = false; });
    }
};

/** המיחושים שסומנו כרגע במודאל. */
function selectedReiyahSigns() {
    const out = [];
    document.querySelectorAll('input[name="reiyah-signs"]').forEach(input => {
        if (input.checked) out.push(input.value);
    });
    return out;
}

/**
 * Opens the sighting-details step, pre-filled and with a contextual hint.
 *
 * C1 (approved decision): when an earlier sighting is very close, the app does
 * NOT guess whether this is a continuation - it ASKS. A wrong guess here would
 * silently establish a veset that was never established.
 */
function openReiyahDetails(ona) {
    pendingReiyahOna = ona || 'day';

    const title = document.getElementById('reiyah-details-title');
    if (title) {
        title.innerText = 'פרטי הראייה — עונת ' + (pendingReiyahOna === 'day' ? 'יום' : 'לילה');
    }

    // Reset to defaults on every open, so an earlier answer never lingers.
    buildReiyahSignList();
    const regular = document.querySelector('input[name="reiyah-kind"][value="regular"]');
    if (regular) regular.checked = true;
    const ended = document.querySelector('input[name="reiyah-flow"][value="ended"]');
    if (ended) ended.checked = true;
    const days = document.getElementById('reiyah-duration-days');
    if (days) days.value = '2';
    document.querySelectorAll('input[name="reiyah-signs"]').forEach(input => { input.checked = false; });
    const confirmSigns = document.getElementById('reiyah-signs-confirm');
    if (confirmSigns) confirmSigns.checked = false;
    const safekOna = document.getElementById('reiyah-safek-ona');
    if (safekOna) safekOna.checked = false;

    // A day that already holds a sighting is pre-filled with what was recorded -
    // otherwise re-saving it would silently drop the kind and the recorded signs.
    const existing = db[selectedAbsDate];
    if (existing && existing.type === 'reiyah') {
        const kind = document.querySelector(`input[name="reiyah-kind"][value="${existing.kind || 'regular'}"]`);
        if (kind) kind.checked = true;
        if (existing.closedFountain === false) {
            const continued = document.querySelector('input[name="reiyah-flow"][value="continued"]');
            if (continued) continued.checked = true;
            if (days && Number.isFinite(existing.durationDays) && existing.durationDays > 1) {
                days.value = String(existing.durationDays);
            }
        }
        if (Array.isArray(existing.signs) && existing.signs.length) {
            existing.signs.forEach(code => {
                const input = document.querySelector(`input[name="reiyah-signs"][value="${code}"]`);
                if (input) input.checked = true;
            });
            if (confirmSigns) confirmSigns.checked = true;
        }
        if (existing.safekOna === true && safekOna) safekOna.checked = true;
    }

    toggleReiyahDuration();
    toggleReiyahSigns();

    // Ask (don't guess) when a previous sighting sits right before this one.
    const hint = document.getElementById('reiyah-flow-hint');
    if (hint) {
        let previous = null;
        Object.keys(db).map(Number).forEach(day => {
            if (db[day].type === 'reiyah' && day < selectedAbsDate && (previous === null || day > previous)) previous = day;
        });
        const gap = previous === null ? null : selectedAbsDate - previous;
        if (gap !== null && gap <= 4) {
            hint.innerHTML = 'בדקו היטב: הראייה הקודמת שלכן הייתה לפני <b>' + gap +
                ' ימים</b>. אם הדימום <b>נמשך ברצף מאז</b> — זו אותה ראייה ולא ראייה חדשה, ולכן יש לסמן "נמשך ברצף" ולציין את מספר הימים הסך-הכלי. אם הדימום פסק וחזר — זו ראייה נפרדת.';
            hint.style.display = 'block';
        } else {
            hint.style.display = 'none';
        }
    }

    // זמני הנץ והשקיעה של אותו יום (ספק עונה — B6). הגבול שבין העונות הוא הנץ
    // והשקיעה, ובלעדיהם אין בירור לספק; בלא מיקום שנבחר — אינם מוצגים.
    const timesBox = document.getElementById('reiyah-times');
    if (timesBox) {
        const timesText = timesLine(selectedAbsDate, locationById(getSavedLocation()));
        if (timesText) {
            timesBox.innerText = timesText
                + ' — הזמנים האלה נועדו לבירור ספק העונה בלבד, והעונה נבחרת על ידך.';
            timesBox.style.display = 'block';
        } else {
            timesBox.innerText = '';
            timesBox.style.display = 'none';
        }
    }

    closeModal('modal');
    openModal('reiyah-details-modal');
}

/** Shows the day-count field only when the bleeding actually continued. */
window.toggleReiyahDuration = function() {
    const wrap = document.getElementById('reiyah-duration-wrap');
    const continued = document.querySelector('input[name="reiyah-flow"][value="continued"]');
    if (wrap) wrap.style.display = (continued && continued.checked) ? 'block' : 'none';
};

window.saveReiyahDetails = function() {
    const kindInput = document.querySelector('input[name="reiyah-kind"]:checked');
    const flowInput = document.querySelector('input[name="reiyah-flow"]:checked');
    const kind = kindInput ? kindInput.value : 'regular';
    const continued = !!(flowInput && flowInput.value === 'continued');

    const extra = { kind };
    if (continued) {
        const raw = parseInt((document.getElementById('reiyah-duration-days') || {}).value, 10);
        const days = Number.isFinite(raw) && raw > 1 ? raw : 2;
        extra.durationDays = days;
        // "ממעיין פתוח": the bleeding was still running, not a discrete sighting.
        extra.closedFountain = false;
    } else {
        extra.closedFountain = true;
    }

    // B2 — מיחושי וסת הגוף. קוד שנשמר ואינו מוכר עוד נשמר אף הוא, כדי שלא
    // ייעלם תיעוד של מיחוש שהוזן קודם.
    const signs = selectedReiyahSigns();
    const existing = db[selectedAbsDate] || {};
    const keptUnknown = (existing.signs || []).filter(code => !BODY_SIGNS.some(s => s.code === code));
    const allSigns = signs.concat(keptUnknown.filter(code => signs.indexOf(code) === -1));
    if (allSigns.length) {
        extra.signs = allSigns;
    } else if (existing.signs) {
        delete existing.signs;
    }

    // ספק עונה (B6): המשתמשת רושמת את העונה שבה נצפתה הראייה — שהיא המאוחרת —
    // ומסמנת שקיים ספק אם לא היתה בעונה הקודמת. החומרא של לחוש אף לעונה הקודמת
    // נשלטת במתג (`safekOnaBoth`, js/stringencies.js), ולא ננעלת כאן.
    const safekOnaInput = document.getElementById('reiyah-safek-ona');
    if (safekOnaInput && safekOnaInput.checked) extra.safekOna = true;
    else if (existing.safekOna) delete existing.safekOna;

    const ona = pendingReiyahOna;
    closeModal('reiyah-details-modal');
    executeSaveEvent('reiyah', ona, extra);

    if (kind === 'ones') {
        showToast('נשמר. ראייה מחמת אונס אינה נספרת לקביעת וסת');
    } else if (allSigns.length) {
        showToast('נשמר. המיחוש נרשם — עם הופעתו אסורה כדין שעת הוסת, ואם עבר ולא נבדקה אסורה עד שתבדוק');
    }
};

// ---------- מיחוש גופני בלא ראייה ----------

/** העונה שבה נרשם המיחוש, כל עוד רשימת המיחושים פתוחה. */
let pendingSignOna = 'day';

/**
 * פותח את רישום המיחוש בלא ראייה.
 *
 * יום שרשומה בו **ראייה** אינו נפתח כאן: שם מקומו של המיחוש בפרטי הראייה, שהרי
 * הווסת המורכב נבנה מן הצירוף של היום והמיחוש; רישום כאן היה דורס את הראייה.
 */
window.openSignDetails = function(ona, preset) {
    if (!selectedAbsDate) return;

    const existing = db[selectedAbsDate];
    if (existing && existing.type === 'reiyah') {
        showToast(preset === 'sharpFood'
            ? 'ביום זה רשומה ראייה — יש לסמן "מחמת מאכלים חריפים" בפרטי הראייה'
            : 'ביום זה רשומה ראייה — יש לסמן את המיחוש בפרטי הראייה');
        return;
    }
    if (existing && existing.type === 'hefsek') {
        showConfirm('ביום זה רשום הפסק טהרה. לרשום עליו מיחוש גופני בלא ראייה?',
            () => openSignDetailsConfirm(ona, preset),
            () => {});
        return;
    }
    openSignDetailsConfirm(ona, preset);
};

function openSignDetailsConfirm(ona, preset) {
    pendingSignOna = ona === 'night' ? 'night' : 'day';
    const title = document.getElementById('sign-modal-title');
    if (title) {
        title.innerText = 'רישום מיחוש גופני — עונת ' + (pendingSignOna === 'day' ? 'יום' : 'לילה');
    }

    buildSignList('sign-list', 'sign-only');
    document.querySelectorAll('input[name="sign-only"]').forEach(input => { input.checked = false; });
    const confirm = document.getElementById('sign-confirm');
    if (confirm) confirm.checked = false;

    // יום שתועד בו מיחוש — חוזר ומסומן, כדי שעריכה לא תמחק את מה שנרשם.
    const existing = db[selectedAbsDate] || {};
    if (Array.isArray(existing.signs) && existing.signs.length) {
        existing.signs.forEach(code => {
            const input = document.querySelector(`input[name="sign-only"][value="${code}"]`);
            if (input) input.checked = true;
        });
        if (confirm) confirm.checked = true;
    }

    // דרגת ודאות — חוזרת לברירת המחדל "בטוחה" בכל פתיחה, ומשוחזרת אם קיימת.
    const certaintyDefault = document.querySelector('input[name="sign-certainty"][value="certain"]');
    if (certaintyDefault) certaintyDefault.checked = true;
    if (existing.signCertainty) {
        const savedCertainty = document.querySelector(`input[name="sign-certainty"][value="${existing.signCertainty}"]`);
        if (savedCertainty) savedCertainty.checked = true;
    }

    // מסלול "אכלתי מאכל חריף" (A6): אותו מסלול של וסת הגוף, אלא שהמקרה הוא
    // האכילה — "ומדעתה ולהנאתה אין זה נקרא אונס... וקובעת וסת כמו וסת הגוף"
    // `[שט כ"ז | עמ' 41]`. ההסכמה מסומנת ממילא, ואין כאן "מיחוש משונה".
    if (preset === 'sharpFood') {
        const input = document.querySelector('input[name="sign-only"][value="sharpFood"]');
        if (input) input.checked = true;
        if (confirm) confirm.checked = true;
    }

    const sources = document.getElementById('sign-sources');
    if (sources) {
        sources.innerText = preset === 'sharpFood'
            ? DAY_MARK_RULES.sharpFood.source + ' · ' + BODY_VESET_RULES.onSymptom.source
            : BODY_VESET_RULES.onSymptom.source + ' · ' + BODY_VESET_RULES.standalone.source;
    }

    toggleSignList();
    closeModal('modal');
    openModal('sign-modal');
}

/** מציג את רשימת המיחושים רק לאחר אישור שהמיחוש משונה וקשור. */
window.toggleSignList = function() {
    const wrap = document.getElementById('sign-list-wrap');
    const confirm = document.getElementById('sign-confirm');
    if (wrap) wrap.style.display = (confirm && confirm.checked) ? 'block' : 'none';
    if (confirm && !confirm.checked) {
        document.querySelectorAll('input[name="sign-only"]').forEach(input => { input.checked = false; });
    }
};

/**
 * שומר את המיחוש בלא ראייה.
 *
 * הרשומה נשמרת כ-`type: 'sign'` עם `standaloneSign` — שהוא הסימן שהמנוע מחפש
 * (`js/calculations.js`) — אך אם אותו יום כבר נבדק, נשמרת רשומת הבדיקה והמיחוש
 * נספח אליה, והבדיקה שבו היא שמבררת.
 */
window.saveSignDetails = function() {
    if (!selectedAbsDate) return;

    const signs = [];
    document.querySelectorAll('input[name="sign-only"]').forEach(input => {
        if (input.checked) signs.push(input.value);
    });
    if (!signs.length) {
        showToast('יש לסמן מיחוש אחד לפחות');
        return;
    }

    const entry = db[selectedAbsDate] || (db[selectedAbsDate] = {});
    if (entry.type !== 'check') entry.type = 'sign';
    entry.ona = pendingSignOna;
    entry.signs = signs;
    entry.standaloneSign = true;
    // דרגת ודאות (2026-09-20, מסמכי "יסודות הבית") — קובעת רק את חומרת התביעה
    // של הרגע הזה, לא את קביעות וסת הגוף. ברירת המחדל "certain" = ההתנהגות המקורית.
    const certaintyInput = document.querySelector('input[name="sign-certainty"]:checked');
    entry.signCertainty = certaintyInput ? certaintyInput.value : 'certain';
    const noteArea = document.getElementById('day-note');
    if (noteArea && noteArea.value) entry.note = noteArea.value;

    saveDb(db);
    notifyDataChanged();
    closeModal('sign-modal');
    refreshCalendar();
    showToast('המיחוש נרשם — משעה שבא המיחוש אסורה כדין שעת הוסת, ואם עבר ולא נבדקה אסורה עד שתבדוק');
};

window.deleteEvent = function() {
    if (!selectedAbsDate) return;
    delete db[selectedAbsDate];
    
    saveDb(db);
    notifyDataChanged();
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
    const engineData = calculateEngine(db, isOrZarua, engineOptions());
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
