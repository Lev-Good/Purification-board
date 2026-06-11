/**
 * localStorage keys
 */
const KEYS = {
    DB: 'taharahDB',
    PIN: 'taharahPIN',
    EMAIL: 'taharahEmail',
    OR_ZARUA: 'taharahOrZarua',
    THEME: 'taharahTheme',
    EMAIL_SEEN: 'taharahEmailWarningSeen',
    RECOVERY_EMAIL: 'taharahRecoveryEmail'
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
 * Wipe all data from storage (except theme and warning checks if desired, but we'll wipe all user credentials).
 */
export function wipeAll() {
    localStorage.removeItem(KEYS.DB);
    localStorage.removeItem(KEYS.PIN);
    localStorage.removeItem(KEYS.EMAIL);
    localStorage.removeItem(KEYS.OR_ZARUA);
    localStorage.removeItem(KEYS.EMAIL_SEEN);
    localStorage.removeItem(KEYS.RECOVERY_EMAIL);
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
