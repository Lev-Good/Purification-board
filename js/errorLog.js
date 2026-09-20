/**
 * לוג תקלות אוטומטי (spec: "תוסיף תכונה ששומרת באגים באופן אוטומטי ופרטים
 * על המחשב של המשתמש וגירסת התוכנה", כך שבמקרה תקלה ניתן לשלוח למפתח קובץ
 * אחד שמסביר מה קרה). נשמר ב-localStorage - עובד גם בדפדפן/PWA וגם באפליקציית
 * האלקטרון - כטבעת חוגרת (ring buffer) עם תקרה קבועה כדי שלא יתנפח בלי גבול
 * על מכשיר שנשאר פתוח הרבה זמן.
 */

const KEY = 'taharahErrorLog';
const MAX_ENTRIES = 200;

let appVersion = 'unknown';
if (typeof window !== 'undefined' && window.api && window.api.getAppVersion) {
    window.api.getAppVersion().then(v => { appVersion = v; }).catch(() => {});
}

function readLog() {
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
        return Array.isArray(raw) ? raw : [];
    } catch (e) {
        return [];
    }
}

function writeLog(entries) {
    try {
        localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
    } catch (e) { /* אחסון מלא/חסום - שמירה היא best-effort בלבד */ }
}

/**
 * רושמת רשומה אחת ליומן. קריאה לפונקציה הזו חייבת להצליח בכל מקרה - יומן
 * שגורם לשגיאה בעצמו יכול להסתיר את השגיאה האמיתית שהוא נועד לתעד.
 */
export function logError(message, extra) {
    try {
        const entries = readLog();
        entries.push({
            at: new Date().toISOString(),
            message: String(message == null ? '' : message).slice(0, 2000),
            extra: extra ? String(extra).slice(0, 4000) : ''
        });
        writeLog(entries);
    } catch (e) { /* לעולם לא לזרוק מתוך פונקציית לוג */ }
}

export function getErrorLogCount() {
    return readLog().length;
}

export function clearErrorLog() {
    try { localStorage.removeItem(KEY); } catch (e) { /* best-effort */ }
}

/**
 * פרטי מערכת שמצורפים בראש קובץ הלוג - בלי אלה, "יש שגיאה" בלי הקשר על
 * המכשיר/הגרסה הוא כמעט חסר תועלת לאבחון מרחוק.
 */
function systemInfoText() {
    const nav = (typeof navigator !== 'undefined') ? navigator : {};
    const scr = (typeof window !== 'undefined' && window.screen) ? window.screen : {};
    return [
        'לוח טהרת המשפחה - קובץ לוג לתקלות',
        '========================================',
        'זמן ייצוא: ' + new Date().toISOString(),
        'גרסת תוכנה: ' + appVersion,
        'סוג הפעלה: ' + ((typeof window !== 'undefined' && window.api) ? 'אפליקציית שולחן עבודה (Electron)' : 'דפדפן / PWA'),
        'User-Agent: ' + (nav.userAgent || 'לא ידוע'),
        'פלטפורמה: ' + (nav.platform || 'לא ידוע'),
        'שפה: ' + (nav.language || 'לא ידוע'),
        'רזולוציית מסך: ' + (scr.width || '?') + 'x' + (scr.height || '?'),
        'גודל חלון: ' + (typeof window !== 'undefined' ? window.innerWidth + 'x' + window.innerHeight : 'לא ידוע'),
        'מחובר לאינטרנט: ' + (nav.onLine === false ? 'לא' : 'כן'),
        ''
    ].join('\n');
}

/**
 * מוריד קובץ טקסט אחד עם פרטי המערכת וכל הרשומות שנרשמו - בדיוק מה שצריך
 * לשלוח למפתח כדי לאבחן תקלה, בלי צורך לגשת בעצמו למכשיר של המשתמשת.
 */
export function downloadErrorLog() {
    const entries = readLog();
    const body = entries.length
        ? entries.map(e => `[${e.at}] ${e.message}` + (e.extra ? '\n' + e.extra : '')).join('\n\n')
        : '(לא נרשמו תקלות - הקובץ מכיל רק את פרטי המערכת שלמעלה.)';
    const text = systemInfoText() + '\n--- יומן תקלות (' + entries.length + ' רשומות) ---\n\n' + body;
    const dataStr = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', 'taharah-error-log-' + new Date().toISOString().slice(0, 10) + '.txt');
    a.click();
}

/**
 * מתחברת לחריגות שלא נתפסו ול-Promise-ים שנדחו בלי טיפול, בכל מקום באפליקציה
 * - כך שאף קריאה בקוד לא צריכה try/catch משלה כדי שתקלה תגיע ליומן.
 */
export function initErrorLogging() {
    window.addEventListener('error', (event) => {
        try {
            const loc = event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : '';
            const stack = (event.error && event.error.stack) || loc;
            logError(event.message || 'שגיאה לא ידועה', stack);
        } catch (e) { /* לעולם לא לזרוק מתוך handler של לוג */ }
    });
    window.addEventListener('unhandledrejection', (event) => {
        try {
            const reason = event.reason;
            const message = (reason && reason.message) ? reason.message : String(reason);
            const stack = (reason && reason.stack) || '';
            logError('Promise נדחתה בלי טיפול: ' + message, stack);
        } catch (e) { /* לעולם לא לזרוק מתוך handler של לוג */ }
    });
}
