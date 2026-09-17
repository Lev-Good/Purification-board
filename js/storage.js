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
    RECOVERY_EMAIL: 'taharahRecoveryEmail',
    LOCATION: 'taharahLocation',
    ZOOM: 'taharahZoom',
    NOTIFICATIONS: 'taharahNotifications',
    NOTIFIED_MARKER: 'taharahLastNotified',
    AUTO_LAUNCH: 'taharahAutoLaunch'
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
    localStorage.removeItem(KEYS.LOCATION);
    localStorage.removeItem(KEYS.NOTIFICATIONS);
    localStorage.removeItem(KEYS.NOTIFIED_MARKER);
    localStorage.removeItem(KEYS.AUTO_LAUNCH);
    // Note: ZOOM (display preference, not personal data) intentionally survives a data wipe.
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
 * Location (city) setting — used for sunset-aware halachic day calculation.
 */
export function getLocation() {
    return localStorage.getItem(KEYS.LOCATION) || '';
}

export function saveLocation(cityKey) {
    localStorage.setItem(KEYS.LOCATION, cityKey);
}

export function removeLocation() {
    localStorage.removeItem(KEYS.LOCATION);
}

/**
 * Global zoom level setting (percentage, e.g. 100 = default).
 */
export function getZoomLevel() {
    const raw = localStorage.getItem(KEYS.ZOOM);
    const val = raw ? parseInt(raw, 10) : 100;
    return isNaN(val) ? 100 : val;
}

export function saveZoomLevel(percent) {
    localStorage.setItem(KEYS.ZOOM, String(percent));
}

/**
 * Desktop notification preference: 'off' | 'daily' | 'events'
 */
export function getNotificationSetting() {
    return localStorage.getItem(KEYS.NOTIFICATIONS) || 'off';
}

export function saveNotificationSetting(value) {
    localStorage.setItem(KEYS.NOTIFICATIONS, value);
}

/**
 * Tracks the last halachic-day marker a notification was already shown for,
 * to avoid repeating the same notification multiple times in one halachic day.
 */
export function getLastNotifiedMarker() {
    return localStorage.getItem(KEYS.NOTIFIED_MARKER) || '';
}

export function saveLastNotifiedMarker(marker) {
    localStorage.setItem(KEYS.NOTIFIED_MARKER, marker);
}

/**
 * Auto-launch-at-login preference (Electron desktop app only).
 */
export function getAutoLaunchSetting() {
    return localStorage.getItem(KEYS.AUTO_LAUNCH) === 'true';
}

export function saveAutoLaunchSetting(enabled) {
    localStorage.setItem(KEYS.AUTO_LAUNCH, enabled ? 'true' : 'false');
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
