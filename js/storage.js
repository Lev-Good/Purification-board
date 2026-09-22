/**
 * localStorage keys
 */
const KEYS = {
    DB: 'taharahDB',
    PIN: 'taharahPIN',
    EMAIL: 'taharahEmail',
    OR_ZARUA: 'taharahOrZarua',
    CHAZAKA: 'taharahChazaka',
    AKIROT: 'taharahAkirot',
    LIFE: 'taharahLifeState',
    THEME: 'taharahTheme',
    EMAIL_SEEN: 'taharahEmailWarningSeen',
    RECOVERY_EMAIL: 'taharahRecoveryEmail',
    HISTORY_STATE: 'taharahHistoryState',
    BODY_REMINDER_SEEN: 'taharahBodyReminderSeen',
    STRINGENCIES: 'taharahStringencies',
    LOCATION: 'taharahLocation',
    FERTILITY: 'taharahFertility',
    FERTILITY_EXCLUDED: 'taharahFertilityExcludedOutliers'
};

/**
 * Get the current events database.
 */
export function getDb() {
    return JSON.parse(localStorage.getItem(KEYS.DB)) || {};
}

/**
 * Save the events database.
 */
export function saveDb(db) {
    localStorage.setItem(KEYS.DB, JSON.stringify(db));
}

/**
 * The database snapshot that was last written to the Google backup's history
 * tab. The next backup diffs against it, so only real changes are logged.
 */
export function getHistoryState() {
    try {
        return JSON.parse(localStorage.getItem(KEYS.HISTORY_STATE)) || {};
    } catch (e) {
        return {};
    }
}

export function saveHistoryState(state) {
    try {
        localStorage.setItem(KEYS.HISTORY_STATE, JSON.stringify(state || {}));
    } catch (e) {
        // quota exceeded - history diffing falls back to "everything is new"
    }
}

/**
 * Wipe all data from storage (except theme and warning checks if desired, but we'll wipe all user credentials).
 */
export function wipeAll() {
    localStorage.removeItem(KEYS.DB);
    localStorage.removeItem(KEYS.PIN);
    localStorage.removeItem(KEYS.EMAIL);
    localStorage.removeItem(KEYS.OR_ZARUA);
    localStorage.removeItem(KEYS.CHAZAKA);
    localStorage.removeItem(KEYS.AKIROT);
    localStorage.removeItem(KEYS.LIFE);
    localStorage.removeItem(KEYS.EMAIL_SEEN);
    localStorage.removeItem(KEYS.RECOVERY_EMAIL);
    localStorage.removeItem(KEYS.HISTORY_STATE);
    localStorage.removeItem(KEYS.BODY_REMINDER_SEEN);
    localStorage.removeItem(KEYS.STRINGENCIES);
    localStorage.removeItem(KEYS.LOCATION);
}

/**
 * היום (abs) שבו הוצגה לאחרונה ההתראה היומית של וסת הגוף, אם הוצגה.
 *
 * התזכורת עצמה מוצגת תדיר בכרטיס שבראש המסך; ההתראה הקופצת היא **יומית** בלבד
 * (ולא בכל פתיחה של האפליקציה) — שהרי מיחוש שתועד ועומד אינו דחוף יותר ברגע זה
 * מאשר אתמול, ואילו חובת הבדיקה עצמה מוצגת בכרטיס תמיד.
 */
export function getBodyReminderSeen() {
    const raw = Number(localStorage.getItem(KEYS.BODY_REMINDER_SEEN));
    return Number.isFinite(raw) && raw > 0 ? raw : null;
}

export function setBodyReminderSeen(abs) {
    try {
        localStorage.setItem(KEYS.BODY_REMINDER_SEEN, String(abs));
    } catch (e) {
        // quota exceeded - ההתראה תוצג שוב; אין בכך נזק
    }
}

/**
 * PIN security storage helpers
 */
export function getSavedPin() {
    return localStorage.getItem(KEYS.PIN);
}

export function savePin(pin) {
    localStorage.setItem(KEYS.PIN, pin);
}

export function hasSavedPin() {
    return !!getSavedPin();
}

/**
 * Recovery email helpers
 */
export function getRecoveryEmail() {
    return localStorage.getItem(KEYS.RECOVERY_EMAIL) || '';
}

export function saveRecoveryEmail(email) {
    localStorage.setItem(KEYS.RECOVERY_EMAIL, email);
}

export function removeRecoveryEmail() {
    localStorage.removeItem(KEYS.RECOVERY_EMAIL);
}

/**
 * Email configuration helpers
 */
export function getSavedEmail() {
    return localStorage.getItem(KEYS.EMAIL) || '';
}

export function saveEmail(email) {
    localStorage.setItem(KEYS.EMAIL, email);
}

export function removeSavedEmail() {
    localStorage.removeItem(KEYS.EMAIL);
}

export function isEmailWarningSeen() {
    return localStorage.getItem(KEYS.EMAIL_SEEN) === 'true';
}

export function setEmailWarningSeen() {
    localStorage.setItem(KEYS.EMAIL_SEEN, 'true');
}

/**
 * Or Zarua Custom settings
 */
export function isOrZaruaEnabled() {
    return localStorage.getItem(KEYS.OR_ZARUA) === 'true';
}

export function saveOrZarua(enabled) {
    localStorage.setItem(KEYS.OR_ZARUA, enabled);
}

/**
 * Chazaka engine settings (fixed-veset detection).
 *
 * ON by default: without it the app would show every concern for every sighting,
 * which is a needless stringency for a woman who has a fixed veset. The switch
 * exists so the engine can be turned off and the old behaviour restored.
 */
export function isChazakaEnabled() {
    return localStorage.getItem(KEYS.CHAZAKA) !== 'false';
}

export function saveChazaka(enabled) {
    localStorage.setItem(KEYS.CHAZAKA, enabled);
}

/**
 * Uprooting engine settings (a veset time that passed is no longer a concern).
 *
 * ON by default: without it the app keeps presenting concerns whose time has
 * passed `[שט ל"ג | עמ' 111]`, and - worse - never asks for the check that the
 * din requires, or reports that the woman is forbidden until she checks
 * `[שט כ"ד | עמ' 7]`.
 */
export function isAkirotEnabled() {
    return localStorage.getItem(KEYS.AKIROT) !== 'false';
}

export function saveAkirot(enabled) {
    localStorage.setItem(KEYS.AKIROT, enabled);
}

/**
 * Life state (מצב חיים): pregnancy, birth and nursing, age, and pills.
 *
 * Unlike the events database, this is a SETTING and not a record: it is not part
 * of the Google backup, like the chazaka and uprooting switches. It is read by
 * the engine on every calculation, and its absence simply means "no known state".
 */
export function getLifeState() {
    try {
        return JSON.parse(localStorage.getItem(KEYS.LIFE)) || null;
    } catch (e) {
        return null;
    }
}

export function saveLifeState(state) {
    try {
        if (state === null || state === undefined) {
            localStorage.removeItem(KEYS.LIFE);
            return;
        }
        localStorage.setItem(KEYS.LIFE, JSON.stringify(state));
    } catch (e) {
        // quota exceeded - the state simply is not persisted
    }
}

/**
 * מתגי החומרא (`js/stringencies.js`).
 *
 * אלו **הגדרות** ולא רשומות: אינן נשמרות בגיבוי גוגל, כמו מתגי המנועים וסביבת
 * החיים, וברירת המחדל שלהן מתקבלת מן המודול (פירושו: מתג חסר = ברירת המחדל,
 * ולכן הוספת מתג אינה דורשת הגירת נתונים).
 */
export function getStringencies() {
    try {
        return JSON.parse(localStorage.getItem(KEYS.STRINGENCIES)) || {};
    } catch (e) {
        return {};
    }
}

export function saveStringencies(state) {
    try {
        localStorage.setItem(KEYS.STRINGENCIES, JSON.stringify(state || {}));
    } catch (e) {
        // quota exceeded - המתגים יישארו כברירת המחדל שלהם
    }
}

/**
 * המיקום שנבחר לזמני הנץ והשקיעה (`js/zmanim.js`, ספק עונה — B6).
 *
 * הגדרה ולא רשומה: אינה נשמרת בגיבוי גוגל, כמו מתגי המנועים ומצב החיים.
 * מחרוזת ריקה פירושה "לא נבחר מיקום", ואז אין זמנים מוצגים — ואין בכך שינוי דין.
 */
export function getSavedLocation() {
    return localStorage.getItem(KEYS.LOCATION) || '';
}

export function saveLocation(id) {
    try {
        localStorage.setItem(KEYS.LOCATION, String(id || ''));
    } catch (e) {
        // quota exceeded - המיקום יישאר כפי שהיה
    }
}

/**
 * הגדרות "חלון ביוץ ופוריות" (`js/fertility.js`, `docs/SPEC_FERTILITY_INSIGHTS.md`).
 *
 * הגדרה ולא רשומה: אינה נשמרת בגיבוי גוגל, כמו מצב החיים ומתגי החומרא — התכונה
 * **כבויה כברירת מחדל** (§2 באפיון), ומחרוזת null/היעדר מפתח פירושם "כבוי".
 */
export function getFertilitySettings() {
    try {
        return JSON.parse(localStorage.getItem(KEYS.FERTILITY)) || null;
    } catch (e) {
        return null;
    }
}

export function saveFertilitySettings(settings) {
    try {
        if (settings === null || settings === undefined) {
            localStorage.removeItem(KEYS.FERTILITY);
            return;
        }
        localStorage.setItem(KEYS.FERTILITY, JSON.stringify(settings));
    } catch (e) {
        // quota exceeded - ההגדרות פשוט לא יישמרו
    }
}

/**
 * חריגות ידניות לחישוב ממוצע ההפלגות (§4.6 — הפלגה חריגה מאוד).
 *
 * הפלגה חריגה (מעל 3 סטיות תקן או מעל 60 יום) **מוחרגת מהממוצע כברירת מחדל**
 * (תיבת הסימון באפיון מסומנת `[✔]` — כלומר מוצעת פעילה); `included` הוא הרשימה
 * ההפוכה — הפלגות שזוהו כחריגות אך המשתמשת ביקשה במפורש לכלול בכל זאת בממוצע.
 * `excluded` הוא חריגה ידנית נוספת, להפלגה שלא זוהתה אוטומטית. שני המערכים הם
 * ימי abs של הראייה המאוחרת בהפלגה, ואינם חלק מה-db עצמו.
 */
export function getFertilityOutlierOverrides() {
    try {
        const raw = JSON.parse(localStorage.getItem(KEYS.FERTILITY_EXCLUDED));
        return {
            excluded: Array.isArray(raw && raw.excluded) ? raw.excluded : [],
            included: Array.isArray(raw && raw.included) ? raw.included : []
        };
    } catch (e) {
        return { excluded: [], included: [] };
    }
}

export function saveFertilityOutlierOverrides(overrides) {
    try {
        const o = overrides || {};
        localStorage.setItem(KEYS.FERTILITY_EXCLUDED, JSON.stringify({
            excluded: Array.isArray(o.excluded) ? o.excluded : [],
            included: Array.isArray(o.included) ? o.included : []
        }));
    } catch (e) {
        // quota exceeded - הרשימה תישאר כפי שהיתה
    }
}

/**
 * Theme settings
 */
export function getSavedTheme() {
    return localStorage.getItem(KEYS.THEME) || 'light';
}

export function saveTheme(theme) {
    localStorage.setItem(KEYS.THEME, theme);
}

/**
 * Creates and triggers a download of the current database backup as a JSON file.
 */
export function downloadBackup(db) {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", "taharah_backup.json");
    dlAnchorElem.click();
}

/**
 * Restores database from a uploaded file.
 * @param {Event} event - File input change event.
 * @param {Function} onSuccess - Callback when restoration completes.
 * @param {Function} onError - Callback when an error occurs.
 */
export function restoreBackup(event, onSuccess, onError) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const db = JSON.parse(e.target.result);
            saveDb(db);
            onSuccess(db);
        } catch(err) {
            onError("שגיאה בקריאת הקובץ. ודא שזהו קובץ גיבוי תקין.");
        }
    };
    reader.readAsText(file);
}
